import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardTabs } from '../components/CardTabs';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { formatCurrency } from '../config';
import { IProduct } from '@shared/types';
import {
  GeneralSettings,
  getGeneralSettings,
  loadGeneralSettingsFromServer,
} from '../utils/generalSettings';
import { printInvoice, PrintableSale } from '../utils/invoicePrint';
import { showAlertDialog } from '../utils/appDialogs';

interface CartItem extends IProduct {
  quantity: number;
  cartId: string;
}

interface CompletedSale extends PrintableSale {
  _id?: string;
}

interface MembershipPreview {
  memberId: string;
  memberName: string;
  planName: string;
  discountAmount: number;
  redeemPoints: number;
  redeemValue: number;
  finalPayable: number;
  earnedPoints: number;
  rewardPointsBalance: number;
}

interface CustomerOption {
  _id: string;
  customerCode?: string;
  memberCode?: string;
  memberSubscriptionId?: string;
  name: string;
  phone?: string;
  email?: string;
  source?: 'customer' | 'member';
  memberStatus?: string;
}

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);
type ProductViewMode = 'grid' | 'table' | 'title' | 'image';
const PRODUCT_VIEW_MODE_KEY = 'sales-product-view-mode';
const CATALOG_VISIBILITY_KEY = 'sales-catalog-visible';
const PRODUCTS_PER_PAGE = 12;
const PRODUCT_FETCH_BATCH_SIZE = 36;
const PRODUCT_SCROLL_THRESHOLD_PX = 140;
const requiresStockTracking = (product: Pick<IProduct, 'itemType'> | null | undefined): boolean =>
  String(product?.itemType || 'inventory') === 'inventory';
const itemTypeLabel = (product: Pick<IProduct, 'itemType'> | null | undefined): string =>
  String(product?.itemType || 'inventory').replace('_', ' ');
const toSimpleWarning = (message?: string): string => {
  const text = String(message || '').trim();
  const normalized = text.toLowerCase();
  if (!text) return 'Could not save invoice. Please try again.';
  if (normalized.includes('e11000') || normalized.includes('duplicate key')) {
    if (text.includes('saleNumber')) return 'Invoice number conflict happened. Please click Save/Create again.';
    if (text.includes('invoiceNumber')) return 'Invoice number already exists. Please use another invoice number.';
    return 'Duplicate number found. Please try again.';
  }
  return text;
};

export const Sales = () => {
  const [products, setProducts] = useState<IProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCatalogPanel, setShowCatalogPanel] = useState<boolean>(() => localStorage.getItem(CATALOG_VISIBILITY_KEY) === '1');
  const [searchTerm, setSearchTerm] = useState('');
  const [inlineProductSearch, setInlineProductSearch] = useState('');
  const [inlineSearchResults, setInlineSearchResults] = useState<IProduct[]>([]);
  const [inlineSearchLoading, setInlineSearchLoading] = useState(false);
  const [inlineActiveIndex, setInlineActiveIndex] = useState(0);
  const [productViewMode, setProductViewMode] = useState<ProductViewMode>(() => {
    const saved = localStorage.getItem(PRODUCT_VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'table' || saved === 'title' || saved === 'image') return saved;
    return 'grid';
  });
  const [enableProductScanner, setEnableProductScanner] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [productTotalCount, setProductTotalCount] = useState(0);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [activeProductId, setActiveProductId] = useState('');
  const [addFeedbackText, setAddFeedbackText] = useState('');
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [quickSearchResults, setQuickSearchResults] = useState<IProduct[]>([]);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickActiveIndex, setQuickActiveIndex] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'cash' | 'credit'>('cash');
  const [invoiceStatus, setInvoiceStatus] = useState<'posted' | 'draft'>('posted');
  const [isGstBill, setIsGstBill] = useState(true);
  const [invoiceNumberMode, setInvoiceNumberMode] = useState<'auto' | 'manual'>('auto');
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [applyRoundOff, setApplyRoundOff] = useState(true);
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [settings, setSettings] = useState<GeneralSettings>(() => getGeneralSettings());
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [membershipRedeemPoints, setMembershipRedeemPoints] = useState('');
  const [membershipPreview, setMembershipPreview] = useState<MembershipPreview | null>(null);
  const [applyingMembership, setApplyingMembership] = useState(false);
  const productFetchSeqRef = useRef(0);
  const activeProductTimerRef = useRef<number | null>(null);
  const activeProductAnimationFrameRef = useRef<number | null>(null);
  const addFeedbackTimerRef = useRef<number | null>(null);
  const quickSearchSeqRef = useRef(0);
  const quickSearchInputRef = useRef<HTMLInputElement | null>(null);
  const inlineSearchSeqRef = useRef(0);
  const inlineSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const merged = await loadGeneralSettingsFromServer(localStorage.getItem('token') || undefined);
      if (!cancelled) {
        setSettings(merged);
      }
    };
    const refreshFromStorage = () => setSettings(getGeneralSettings());

    void loadSettings();
    window.addEventListener('sarva-settings-updated', refreshFromStorage as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('sarva-settings-updated', refreshFromStorage as EventListener);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem(PRODUCT_VIEW_MODE_KEY, productViewMode);
  }, [productViewMode]);

  useEffect(() => {
    localStorage.setItem(CATALOG_VISIBILITY_KEY, showCatalogPanel ? '1' : '0');
  }, [showCatalogPanel]);

  useEffect(() => {
    setProductPage(1);
  }, [searchTerm, productViewMode]);

  const fetchProducts = async (reset = false) => {
    if (!showCatalogPanel) return;
    const canLoadMore = reset || (hasMoreProducts && !loadingMoreProducts && !loading);
    if (!canLoadMore) return;

    const requestId = ++productFetchSeqRef.current;
    const currentSkip = reset ? 0 : products.length;
    const query = debouncedSearchTerm;

    if (reset) {
      setLoading(true);
      setHasMoreProducts(false);
      setProductTotalCount(0);
    } else {
      setLoadingMoreProducts(true);
    }

    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        skip: String(currentSkip),
        limit: String(PRODUCT_FETCH_BATCH_SIZE),
      });
      if (query) params.set('q', query);

      const response = await fetch(`/api/products?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (requestId !== productFetchSeqRef.current) return;

      if (data.success) {
        const incoming: IProduct[] = Array.isArray(data.data) ? data.data : [];
        const total = Number(data?.pagination?.total || incoming.length || 0);
        setProductTotalCount(total);

        setProducts((prev) => {
          if (reset) return incoming;
          const existingIds = new Set(prev.map((item) => String(item._id || '')));
          const merged = [...prev];
          incoming.forEach((item) => {
            const id = String(item._id || '');
            if (!id || existingIds.has(id)) return;
            existingIds.add(id);
            merged.push(item);
          });
          return merged;
        });

        const loadedAfterFetch = currentSkip + incoming.length;
        setHasMoreProducts(loadedAfterFetch < total);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      if (requestId !== productFetchSeqRef.current) return;
      setLoading(false);
      setLoadingMoreProducts(false);
    }
  };

  useEffect(() => {
    if (!showCatalogPanel) return;
    void fetchProducts(true);
  }, [debouncedSearchTerm, showCatalogPanel]);

  useEffect(() => {
    if (!showQuickAddModal) return;
    setQuickSearchTerm('');
    setQuickSearchResults(products.slice(0, 12));
    setQuickActiveIndex(0);
    const focusTimer = window.setTimeout(() => {
      quickSearchInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(focusTimer);
  }, [showQuickAddModal]);

  useEffect(() => {
    if (!showQuickAddModal) return;

    const query = quickSearchTerm.trim();
    if (!query) {
      setQuickSearchLoading(false);
      setQuickActiveIndex(0);
      setQuickSearchResults(products.slice(0, 12));
      return;
    }

    const requestId = ++quickSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setQuickSearchLoading(true);
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/products?skip=0&limit=20&q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (requestId !== quickSearchSeqRef.current) return;
          const rows = data?.success && Array.isArray(data.data) ? data.data : [];
          setQuickSearchResults(rows);
          setQuickActiveIndex(0);
        } catch {
          if (requestId !== quickSearchSeqRef.current) return;
          setQuickSearchResults([]);
        } finally {
          if (requestId !== quickSearchSeqRef.current) return;
          setQuickSearchLoading(false);
        }
      })();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [quickSearchTerm, showQuickAddModal, products]);

  useEffect(() => {
    const query = inlineProductSearch.trim();
    if (query.length < 2) {
      setInlineSearchResults([]);
      setInlineSearchLoading(false);
      setInlineActiveIndex(0);
      return;
    }

    const requestId = ++inlineSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setInlineSearchLoading(true);
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/products?skip=0&limit=12&q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (requestId !== inlineSearchSeqRef.current) return;
          const rows: IProduct[] = data?.success && Array.isArray(data.data) ? data.data : [];
          setInlineSearchResults(rows);
          setInlineActiveIndex(0);
        } catch {
          if (requestId !== inlineSearchSeqRef.current) return;
          setInlineSearchResults([]);
        } finally {
          if (requestId !== inlineSearchSeqRef.current) return;
          setInlineSearchLoading(false);
        }
      })();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [inlineProductSearch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || '').toLowerCase();
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || '').toLowerCase();
      const isTypingTarget =
        tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);

      if (event.ctrlKey && key === 'k') {
        event.preventDefault();
        inlineSearchInputRef.current?.focus();
        inlineSearchInputRef.current?.select();
        return;
      }

      if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'F2') {
        event.preventDefault();
        setShowCatalogPanel((prev) => !prev);
        return;
      }

      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        const checkoutButton = document.getElementById('sales-checkout-btn') as HTMLButtonElement | null;
        if (checkoutButton && !checkoutButton.disabled) checkoutButton.click();
        return;
      }

      if ((event.ctrlKey && key === 's') || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'F9')) {
        event.preventDefault();
        const checkoutButton = document.getElementById('sales-checkout-btn') as HTMLButtonElement | null;
        if (checkoutButton && !checkoutButton.disabled) checkoutButton.click();
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        switch (key) {
          case '1':
            event.preventDefault();
            setPaymentMethod('cash');
            return;
          case '2':
            event.preventDefault();
            setPaymentMethod('card');
            return;
          case '3':
            event.preventDefault();
            setPaymentMethod('upi');
            return;
          case '4':
            event.preventDefault();
            setPaymentMethod('bank_transfer');
            return;
          case 'p':
            event.preventDefault();
            setInvoiceStatus('posted');
            return;
          case 'd':
            event.preventDefault();
            setInvoiceStatus('draft');
            return;
          case 'g':
            event.preventDefault();
            setIsGstBill(true);
            return;
          case 'n':
            event.preventDefault();
            setIsGstBill(false);
            return;
          default:
            break;
        }
      }

      if (!isTypingTarget && key === '/') {
        event.preventDefault();
        inlineSearchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (activeProductTimerRef.current) window.clearTimeout(activeProductTimerRef.current);
      if (activeProductAnimationFrameRef.current) window.cancelAnimationFrame(activeProductAnimationFrameRef.current);
      if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const phone = normalizePhone(customerPhone);
    if (phone.length < 4) {
      setCustomerMatches([]);
      setCustomerActiveIndex(0);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setSearchingCustomers(true);
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/customers/search-unified?q=${encodeURIComponent(phone)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (!data?.success) {
            setCustomerMatches([]);
            setCustomerActiveIndex(0);
            return;
          }
          const rows = Array.isArray(data.data) ? data.data : [];
          setCustomerMatches(rows);
          setCustomerActiveIndex(0);
        } catch {
          setCustomerMatches([]);
          setCustomerActiveIndex(0);
        } finally {
          setSearchingCustomers(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [customerPhone]);

  const selectCustomer = (customer: CustomerOption) => {
    setSelectedCustomerId(customer.source === 'customer' ? customer._id : '');
    setCustomerPhone(customer.phone || '');
    setCustomerName(customer.name || '');
    setCustomerEmail(customer.email || '');
    setCustomerMatches([]);
    setCustomerActiveIndex(0);
  };

  const triggerProductFeedback = (product: IProduct) => {
    const productId = String(product._id || '');
    if (productId) {
      if (activeProductTimerRef.current) window.clearTimeout(activeProductTimerRef.current);
      if (activeProductAnimationFrameRef.current) window.cancelAnimationFrame(activeProductAnimationFrameRef.current);
      setActiveProductId('');
      activeProductAnimationFrameRef.current = window.requestAnimationFrame(() => {
        setActiveProductId(productId);
        activeProductTimerRef.current = window.setTimeout(() => setActiveProductId(''), 420);
      });
    }

    setAddFeedbackText(`${product.name} added to cart`);
    if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
    addFeedbackTimerRef.current = window.setTimeout(() => setAddFeedbackText(''), 1200);
  };

  const addProductFromQuickSearch = (product: IProduct) => {
    addToCart(product);
    setQuickSearchTerm('');
    setQuickSearchResults(products.slice(0, 12));
    setQuickActiveIndex(0);
  };

  const addProductFromInlineSearch = (product: IProduct) => {
    addToCart(product);
    setInlineProductSearch('');
    setInlineSearchResults([]);
    setInlineActiveIndex(0);
  };

  const addToCart = (product: IProduct) => {
    if (requiresStockTracking(product) && product.stock <= 0) {
      void showAlertDialog('Out of stock!');
      return;
    }

    let added = false;
    let warningMessage = '';
    setCart((prev) => {
      const existing = prev.find((item) => item._id === product._id);
      if (existing) {
        if (requiresStockTracking(product) && existing.quantity >= product.stock) {
          warningMessage = 'Cannot add more than available stock';
          return prev;
        }
        added = true;
        return prev.map((item) =>
          item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      added = true;
        return [...prev, { ...product, quantity: 1, cartId: Date.now().toString() }];
    });
    if (warningMessage) {
      void showAlertDialog(warningMessage);
      return;
    }
    if (added) triggerProductFeedback(product);
  };

  const updateQuantity = (productId: string, delta: number) => {
    let warningMessage = '';
    setCart((prev) =>
      prev.map((item) => {
        if (item._id === productId) {
          const newQty = item.quantity + delta;
          if (newQty < 1) return item;
          if (requiresStockTracking(item) && newQty > item.stock) {
            warningMessage = 'Stock limit reached';
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      })
    );
    if (warningMessage) {
      void showAlertDialog(warningMessage);
    }
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item._id !== productId));
  };

  const findProductByCode = (rawCode: string): IProduct | null => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return null;

    const exact = products.find((product) => {
      const sku = String(product.sku || '').trim().toUpperCase();
      const barcode = String(product.barcode || '').trim().toUpperCase();
      return sku === code || barcode === code;
    });
    if (exact) return exact;

    const startsWith = products.find((product) => {
      const sku = String(product.sku || '').trim().toUpperCase();
      const barcode = String(product.barcode || '').trim().toUpperCase();
      return sku.startsWith(code) || barcode.startsWith(code);
    });
    return startsWith || null;
  };

  const fetchProductByCode = async (rawCode: string): Promise<IProduct | null> => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return null;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/products?limit=15&q=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!data?.success || !Array.isArray(data.data)) return null;
      const rows: IProduct[] = data.data;
      const matched =
        rows.find((product) => {
          const sku = String(product.sku || '').trim().toUpperCase();
          const barcode = String(product.barcode || '').trim().toUpperCase();
          return sku === code || barcode === code;
        }) || rows[0];
      if (!matched) return null;

      setProducts((prev) => {
        const id = String(matched._id || '');
        if (!id) return prev;
        if (prev.some((item) => String(item._id || '') === id)) return prev;
        return [matched, ...prev];
      });

      return matched;
    } catch {
      return null;
    }
  };

  const handleProductCodeScan = async () => {
    const code = String(scanCode || '').trim();
    if (!code) {
      await showAlertDialog('Please scan or enter a product code.');
      return;
    }

    const matched = findProductByCode(code) || (await fetchProductByCode(code));
    if (!matched) {
      await showAlertDialog('Product not found for this code. Please check SKU/barcode and try again.');
      return;
    }

    addToCart(matched);
    setScanCode('');
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const gst = isGstBill
      ? cart.reduce((acc, item) => {
        const itemTotal = item.price * item.quantity;
        return acc + (itemTotal * (item.gstRate || 18)) / 100;
      }, 0)
      : 0;
    const grossTotal = subtotal + gst;
    const parsedDiscount = Math.max(0, Number(discountValue || 0));

    let discountAmount = 0;
    let discountPercentage = 0;
    if (discountType === 'percentage') {
      discountPercentage = Math.min(100, parsedDiscount);
      discountAmount = (grossTotal * discountPercentage) / 100;
    } else {
      discountAmount = Math.min(grossTotal, parsedDiscount);
      discountPercentage = grossTotal > 0 ? (discountAmount / grossTotal) * 100 : 0;
    }

    const netTotal = Math.max(0, grossTotal - discountAmount);
    const roundedTotal = applyRoundOff ? Math.round(netTotal) : netTotal;
    const roundOffAmount = roundedTotal - netTotal;
    return {
      subtotal,
      gst,
      grossTotal,
      discountAmount,
      discountPercentage,
      netTotal,
      roundOffAmount,
      total: roundedTotal,
    };
  };

  const doPrintInvoice = (sale: CompletedSale) => {
    const latestSettings = getGeneralSettings();
    const ok = printInvoice(sale, latestSettings);
    if (!ok) {
      void showAlertDialog('Unable to open print window. Please allow popups and try again.');
      return;
    }
    setShowInvoicePrompt(false);
  };

  const applyMembershipBenefits = async () => {
    if (!customerPhone.trim()) {
      await showAlertDialog('Enter customer phone to apply membership');
      return;
    }
    if (cart.length === 0) {
      await showAlertDialog('Add items before applying membership');
      return;
    }

    setApplyingMembership(true);
    try {
      const token = localStorage.getItem('token');
      const totals = calculateTotals();
      const response = await fetch('/api/memberships/pos/apply-benefits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mobile: normalizePhone(customerPhone),
          cartTotal: totals.grossTotal,
          redeemPoints: Number(membershipRedeemPoints || 0),
          commit: false,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        await showAlertDialog(data.error || 'Failed to apply membership benefits');
        return;
      }
      const preview: MembershipPreview = data.data;
      setMembershipPreview(preview);
      setDiscountType('amount');
      setDiscountValue(String(Math.max(0, Number(preview.discountAmount || 0) + Number(preview.redeemValue || 0))));
    } catch (error) {
      console.error('Membership apply error:', error);
      await showAlertDialog('Failed to apply membership benefits');
    } finally {
      setApplyingMembership(false);
    }
  };

  useEffect(() => {
    setMembershipPreview(null);
  }, [customerPhone, cart.length]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);
    setCheckoutMessage('');

    try {
      const token = localStorage.getItem('token');
      const totals = calculateTotals();

      const saleData = {
        items: cart.map((item) => ({
          productId: item._id,
          quantity: item.quantity,
          unitPrice: item.price,
          gstRate: item.gstRate,
        })),
        paymentMethod,
        invoiceType,
        invoiceStatus,
        isGstBill,
        invoiceNumber: invoiceNumberMode === 'manual' ? manualInvoiceNumber.trim() : undefined,
        autoInvoiceNumber: invoiceNumberMode === 'auto',
        applyRoundOff,
        paidAmount: paidAmount ? Number(paidAmount) : undefined,
        customerId: selectedCustomerId || undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: normalizePhone(customerPhone) || customerPhone,
        customerEmail: customerEmail.trim() || undefined,
        notes: saleNotes,
        subtotal: totals.subtotal,
        totalGst: totals.gst,
        discountAmount: totals.discountAmount,
        discountPercentage: totals.discountPercentage,
        totalAmount: totals.total,
      };

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(saleData),
      });

      const data = await response.json();
      if (!data.success) {
        await showAlertDialog(toSimpleWarning(data.error || data.message || 'Could not save invoice.'));
        return;
      }

      const completed: CompletedSale = {
        ...data.data,
        customerName: data?.data?.customerName || customerName,
        customerPhone: data?.data?.customerPhone || normalizePhone(customerPhone),
        customerEmail: data?.data?.customerEmail || customerEmail,
        notes: saleNotes,
        invoiceNumber: data.data.invoiceNumber || data.data.saleNumber,
      };

      setCompletedSale(completed);

      if (membershipPreview && customerPhone.trim()) {
        try {
          await fetch('/api/memberships/pos/apply-benefits', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              mobile: normalizePhone(customerPhone),
              cartTotal: totals.grossTotal,
              redeemPoints: Number(membershipRedeemPoints || 0),
              commit: true,
              reference: completed.invoiceNumber || completed.saleNumber,
            }),
          });
        } catch (membershipCommitError) {
          console.error('Membership benefit commit failed:', membershipCommitError);
        }
      }

      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setSelectedCustomerId('');
      setCustomerMatches([]);
      setSaleNotes('');
      setInvoiceType('cash');
      setInvoiceStatus('posted');
      setIsGstBill(true);
      setInvoiceNumberMode('auto');
      setManualInvoiceNumber('');
      setPaidAmount('');
      setDiscountType('amount');
      setDiscountValue('');
      setMembershipRedeemPoints('');
      setMembershipPreview(null);
      void fetchProducts(true);

      if (invoiceStatus === 'draft') {
        setCheckoutMessage(`Draft invoice ${completed.invoiceNumber} saved successfully.`);
        return;
      }

      if (settings.printing.autoPrintAfterSale) {
        doPrintInvoice(completed);
        setCheckoutMessage(`Sale completed. Invoice ${completed.invoiceNumber} sent to print.`);
      } else if (settings.printing.promptAfterSale) {
        setShowInvoicePrompt(true);
        setCheckoutMessage(`Sale completed. Invoice ${completed.invoiceNumber} is ready.`);
      } else {
        setCheckoutMessage(`Sale completed successfully. Invoice ${completed.invoiceNumber} generated.`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      await showAlertDialog('Could not process invoice. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.sku.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [products, searchTerm]
  );

  const productViewOptions: Array<{ key: ProductViewMode; label: string }> = [
    { key: 'grid', label: 'Grid' },
    { key: 'table', label: 'Table' },
    { key: 'title', label: 'Title List' },
    { key: 'image', label: 'Image Tiles' },
  ];

  const pagedProducts = useMemo(() => {
    const totalRows = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / PRODUCTS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, productPage), totalPages);
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    return {
      rows: filteredProducts.slice(startIndex, endIndex),
      totalRows,
      totalPages,
      currentPage,
      startDisplay: totalRows ? startIndex + 1 : 0,
      endDisplay: Math.min(endIndex, totalRows),
    };
  }, [filteredProducts, productPage]);

  const { subtotal, gst, grossTotal, discountAmount, netTotal, roundOffAmount, total } = calculateTotals();
  const outstandingAmount = Math.max(0, total - Number(paidAmount || 0));
  const isMinimalMode = !showCatalogPanel;
  const handleProductListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!hasMoreProducts || loading || loadingMoreProducts) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining <= PRODUCT_SCROLL_THRESHOLD_PX) {
      void fetchProducts(false);
    }
  };

  return (
    <>
      <div className={`mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 lg:px-6 ${isMinimalMode ? 'h-[calc(100vh-78px)] overflow-hidden py-2' : 'min-h-[calc(100vh-80px)] py-8'} ${showCatalogPanel ? 'lg:grid-cols-3' : 'lg:grid-cols-1'}`}>
        {showCatalogPanel && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-5 lg:col-span-2">
          <input
            type="text"
            placeholder="Search products by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mb-5 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 outline-none focus:border-indigo-400"
          />
          <div className="mb-4 space-y-2">
            <CardTabs
              compact
              frame={false}
              ariaLabel="Product view tabs"
              items={productViewOptions}
              activeKey={productViewMode}
              onChange={setProductViewMode}
              listClassName="flex flex-wrap gap-2 border-b-0 px-0 pt-0"
            />
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEnableProductScanner((prev) => !prev)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                enableProductScanner ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-300'
              }`}
            >
              {enableProductScanner ? 'Scanner On' : 'Scanner Off'}
            </button>
            <button
              type="button"
              onClick={() => setShowQuickAddModal(true)}
              className="rounded-md bg-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400"
            >
              Quick Add
            </button>
            </div>
          </div>

          {enableProductScanner && (
            <div className="mb-4 rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3">
              <label className="mb-1 block text-xs font-medium text-emerald-200">Scan Product Code (SKU/Barcode)</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleProductCodeScan();
                    }
                  }}
                  placeholder="Scan or type code, then press Enter"
                  className="w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder-gray-400"
                />
                <button
                  type="button"
                  onClick={handleProductCodeScan}
                  className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                >
                  Add by Code
                </button>
              </div>
              <p className="mt-1 text-[11px] text-emerald-200/90">This is optional. You can continue selecting products from the list.</p>
            </div>
          )}

          {loading && (
            <p className="rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-300">
              Loading products... You can continue billing while the list keeps loading.
            </p>
          )}
          {!loading && filteredProducts.length === 0 && (
            <p className="rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-400">No products found.</p>
          )}

          {!loading && filteredProducts.length > 0 && productViewMode === 'grid' && (
            <div className="max-h-[68vh] overflow-y-auto pr-1" onScroll={handleProductListScroll}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className={`rounded-lg border border-white/10 bg-black/20 p-4 text-left transition duration-150 hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.98] ${
                      activeProductId === String(product._id || '') ? 'sarva-product-added ring-2 ring-emerald-400/60' : ''
                    }`}
                    onClick={() => addToCart(product)}
                  >
                    <h3 className="text-base font-semibold text-white">{product.name}</h3>
                    <p className="text-sm text-gray-400">{product.sku}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold text-indigo-300">{formatCurrency(product.price)}</span>
                      <span className="rounded bg-white/10 px-2 py-1 text-xs text-gray-300">
                        {requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && filteredProducts.length > 0 && productViewMode === 'title' && (
            <div className="space-y-2">
              {pagedProducts.rows.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className={`flex w-full items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-left transition duration-150 hover:bg-white/10 active:scale-[0.99] ${
                    activeProductId === String(product._id || '') ? 'sarva-product-added ring-2 ring-emerald-400/60' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</p>
                    <p className="text-[11px] text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && filteredProducts.length > 0 && productViewMode === 'table' && (
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="min-w-full divide-y divide-white/10 bg-black/20">
                <thead className="bg-white/5">
                  <tr>
                    {['Product', 'SKU', 'Price', 'Stock', 'Action'].map((header) => (
                      <th key={header} className="px-3 py-2 text-left text-xs font-semibold text-gray-300">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {pagedProducts.rows.map((product) => (
                    <tr
                      key={product._id}
                      className={`transition ${activeProductId === String(product._id || '') ? 'sarva-product-added bg-emerald-500/10' : ''}`}
                    >
                      <td className="px-3 py-2 text-sm font-medium text-white">{product.name}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{product.sku}</td>
                      <td className="px-3 py-2 text-sm text-indigo-300">{formatCurrency(product.price)}</td>
                      <td className="px-3 py-2 text-sm text-gray-300">{requiresStockTracking(product) ? product.stock : itemTypeLabel(product)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => addToCart(product)}
                          className={`rounded-md px-2 py-1 text-xs font-semibold text-white transition duration-150 active:scale-95 ${
                            activeProductId === String(product._id || '') ? 'sarva-product-added bg-emerald-500' : 'bg-indigo-500/80 hover:bg-indigo-400'
                          }`}
                        >
                          {activeProductId === String(product._id || '') ? 'Added' : 'Add'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredProducts.length > 0 && productViewMode === 'image' && (
            <div className="max-h-[68vh] overflow-y-auto pr-1" onScroll={handleProductListScroll}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className={`overflow-hidden rounded-lg border border-white/10 bg-black/20 text-left transition duration-150 hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.98] ${
                      activeProductId === String(product._id || '') ? 'sarva-product-added ring-2 ring-emerald-400/60' : ''
                    }`}
                  >
                    <div className="flex h-32 items-center justify-center bg-white/5">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-4xl font-bold text-white/20">{String(product.name || '?').slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-white">{product.name}</h3>
                      <p className="text-xs text-gray-400">{product.sku}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</span>
                        <span className="text-xs text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && hasMoreProducts && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
              <span>
                Loaded {products.length} of {productTotalCount || products.length} products
              </span>
              <button
                type="button"
                onClick={() => void fetchProducts(false)}
                disabled={loadingMoreProducts}
                className="rounded border border-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMoreProducts ? 'Loading more...' : 'Load more'}
              </button>
            </div>
          )}

          {!loading && filteredProducts.length > PRODUCTS_PER_PAGE && (productViewMode === 'title' || productViewMode === 'table') && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
              <span>
                Showing {pagedProducts.startDisplay}-{pagedProducts.endDisplay} of {pagedProducts.totalRows}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagedProducts.currentPage <= 1}
                  onClick={() => setProductPage((prev) => Math.max(1, prev - 1))}
                  className="rounded border border-white/15 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span>
                  Page {pagedProducts.currentPage} / {pagedProducts.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagedProducts.currentPage >= pagedProducts.totalPages}
                  onClick={() => setProductPage((prev) => Math.min(pagedProducts.totalPages, prev + 1))}
                  className="rounded border border-white/15 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        <div className={`rounded-lg border border-white/10 bg-white/5 p-5 ${showCatalogPanel ? '' : 'mx-auto w-full max-w-3xl'} ${isMinimalMode ? 'h-full overflow-hidden' : ''}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-white">Current Sale</h2>
              <ManualHelpLink anchor="transaction-sales-invoice" />
            </div>
            <button
              type="button"
              onClick={() => setShowCatalogPanel((prev) => !prev)}
              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              {showCatalogPanel ? 'Hide Product Views' : 'Show Product Views'}
            </button>
          </div>

          <div className={isMinimalMode ? 'grid h-[calc(100%-3rem)] grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2' : ''}>

          <div className={`${isMinimalMode ? 'mb-0' : 'mb-4'} rounded-md border border-white/10 bg-black/20 p-3`}>
            <label className="mb-1 block text-xs font-medium text-cyan-200">Quick Product Search (type and add)</label>
            <input
              ref={inlineSearchInputRef}
              type="text"
              value={inlineProductSearch}
              onChange={(e) => setInlineProductSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!inlineSearchResults.length) return;
                  setInlineActiveIndex((prev) => (prev >= inlineSearchResults.length - 1 ? 0 : prev + 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (!inlineSearchResults.length) return;
                  setInlineActiveIndex((prev) => (prev <= 0 ? inlineSearchResults.length - 1 : prev - 1));
                  return;
                }
                if (e.key === 'Enter') {
                  if (!inlineSearchResults.length) return;
                  e.preventDefault();
                  addProductFromInlineSearch(inlineSearchResults[inlineActiveIndex] || inlineSearchResults[0]);
                  return;
                }
              }}
              placeholder="Type product name / SKU..."
              className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-400"
            />
            {inlineSearchLoading && <p className="mt-2 text-[11px] text-gray-400">Searching products...</p>}
            {!inlineSearchLoading && inlineProductSearch.trim().length >= 2 && inlineSearchResults.length === 0 && (
              <p className="mt-2 text-[11px] text-gray-400">No matching product found.</p>
            )}
            {!inlineSearchLoading && inlineSearchResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-white/10 bg-black/40 p-1">
                {inlineSearchResults.map((product, index) => (
                  <button
                    key={`inline-${product._id}`}
                    type="button"
                    onClick={() => addProductFromInlineSearch(product)}
                    className={`mb-1 flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition ${
                      inlineActiveIndex === index
                        ? 'bg-cyan-500/20 text-cyan-100'
                        : 'text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    <span>
                      <span className="font-semibold text-white">{product.name}</span>
                      <span className="ml-2 text-gray-400">{product.sku}</span>
                    </span>
                    <span className="text-indigo-300">{formatCurrency(product.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`${isMinimalMode ? 'mt-0 max-h-[28vh]' : 'mt-4 max-h-[32vh]'} space-y-3 overflow-y-auto`}>
            {cart.length === 0 ? (
              <p className="text-center text-gray-400">Cart is empty</p>
            ) : (
              cart.map((item) => (
                <div key={item.cartId} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-medium text-white">{item.name}</h4>
                      <p className="text-xs text-gray-400">
                        {formatCurrency(item.price)} x {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border border-white/20 px-2 py-1 text-sm"
                        onClick={() => updateQuantity(item._id!, -1)}
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center text-sm">{item.quantity}</span>
                      <button
                        className="rounded border border-white/20 px-2 py-1 text-sm"
                        onClick={() => updateQuantity(item._id!, 1)}
                      >
                        +
                      </button>
                      <button className="text-red-400" onClick={() => removeFromCart(item._id!)}>
                        x
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className={`${isMinimalMode ? 'mt-0 space-y-1 border border-white/10 rounded-md p-3' : 'mt-4 space-y-2 border-t border-white/10 pt-4'}`}>
            <p className="text-[11px] text-gray-400">Customer details are optional. Leave blank for walk-in invoice.</p>
            <label className="block text-xs text-gray-400">Customer Phone (search first)</label>
            <input
              type="text"
              placeholder="Customer Phone"
              value={customerPhone}
              name="lookup_customer"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="numeric"
              data-lpignore="true"
              onChange={(e) => {
                const next = e.target.value;
                setCustomerPhone(next);
                setSelectedCustomerId('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!customerMatches.length) return;
                  setCustomerActiveIndex((prev) => (prev >= customerMatches.length - 1 ? 0 : prev + 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (!customerMatches.length) return;
                  setCustomerActiveIndex((prev) => (prev <= 0 ? customerMatches.length - 1 : prev - 1));
                  return;
                }
                if (e.key === 'Enter') {
                  if (!customerMatches.length) return;
                  e.preventDefault();
                  const selected = customerMatches[customerActiveIndex] || customerMatches[0];
                  if (selected) selectCustomer(selected);
                }
              }}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            {searchingCustomers && <p className="text-[11px] text-gray-400">Searching customers...</p>}
            {!searchingCustomers && customerMatches.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-1">
                {customerMatches.map((customer, index) => (
                  <button
                    key={customer._id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className={`block w-full rounded px-2 py-1 text-left text-xs transition ${
                      customerActiveIndex === index ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {customer.name} | {customer.phone || '-'} {customer.customerCode ? `(${customer.customerCode})` : ''}
                    {customer.source === 'member' && (
                      <span className="ml-1 text-indigo-200">[Member{customer.memberCode ? ` ${customer.memberCode}` : ''}]</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!searchingCustomers && normalizePhone(customerPhone).length >= 10 && customerMatches.length === 0 && !selectedCustomerId && (
              <p className="text-[11px] text-amber-300">No customer found in database. You can continue with this typed phone number.</p>
            )}
            {!!selectedCustomerId && <p className="text-[11px] text-emerald-300">Existing customer selected from database</p>}

            <label className="block text-xs text-gray-400">Customer Name</label>
            <input
              type="text"
              placeholder="Customer Name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <label className="block text-xs text-gray-400">Customer Email</label>
            <input
              type="email"
              placeholder="Customer Email (optional)"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <textarea
              placeholder="Invoice Notes (optional)"
              value={saleNotes}
              onChange={(e) => setSaleNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${invoiceNumberMode === 'auto' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setInvoiceNumberMode('auto')}
              >
                Auto Number
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${invoiceNumberMode === 'manual' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setInvoiceNumberMode('manual')}
              >
                Manual Number
              </button>
            </div>
            {invoiceNumberMode === 'manual' && (
              <input
                type="text"
                placeholder="Manual Invoice Number"
                value={manualInvoiceNumber}
                onChange={(e) => setManualInvoiceNumber(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
              />
            )}
          </div>

          <div className={`${isMinimalMode ? 'mt-0 rounded-md border border-white/10 p-3' : 'mt-5 border-t border-white/10 pt-4'}`}>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>GST</span>
              <span>{formatCurrency(gst)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Gross Total</span>
              <span>{formatCurrency(grossTotal)}</span>
            </div>
            <div className="mb-2 grid grid-cols-[1fr_120px_120px] items-center gap-2">
              <span className="text-sm text-gray-300">Discount</span>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'amount' | 'percentage')}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white"
              >
                <option value="amount">Amount</option>
                <option value="percentage">%</option>
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder-gray-500"
              />
            </div>
            <div className="mb-2 grid grid-cols-[1fr_120px_120px] items-center gap-2">
              <span className="text-sm text-gray-300">Membership</span>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Redeem pts"
                value={membershipRedeemPoints}
                onChange={(e) => setMembershipRedeemPoints(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={applyMembershipBenefits}
                disabled={applyingMembership || !customerPhone.trim()}
                className="rounded-md bg-indigo-500/80 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {applyingMembership ? 'Applying...' : 'Apply'}
              </button>
            </div>
            {membershipPreview && (
              <div className="mb-2 rounded border border-cyan-400/20 bg-cyan-500/10 px-2 py-2 text-xs text-cyan-100">
                <div>{membershipPreview.memberName} ({membershipPreview.planName})</div>
                <div>Saved: {formatCurrency(Number(membershipPreview.discountAmount || 0) + Number(membershipPreview.redeemValue || 0))}</div>
                <div>Points after bill: {Number(membershipPreview.rewardPointsBalance || 0)}</div>
              </div>
            )}
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Discount Applied</span>
              <span>- {formatCurrency(discountAmount)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Net Total</span>
              <span>{formatCurrency(netTotal)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Round-off</span>
              <span>{formatCurrency(roundOffAmount)}</span>
            </div>
            <div className="mb-4 flex items-center justify-between text-lg font-semibold text-white">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>

            <div className="mb-4 flex gap-2">
              {['cash', 'card', 'upi', 'bank_transfer'].map((method) => (
                <button
                  key={method}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${
                    paymentMethod === method ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-300'
                  }`}
                  onClick={() => setPaymentMethod(method)}
                >
                  {method}
                </button>
              ))}
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${invoiceType === 'cash' ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setInvoiceType('cash')}
              >
                Cash Invoice
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${invoiceType === 'credit' ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setInvoiceType('credit')}
              >
                Credit Invoice
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${invoiceStatus === 'posted' ? 'bg-indigo-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setInvoiceStatus('posted')}
              >
                Post Invoice
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${invoiceStatus === 'draft' ? 'bg-slate-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setInvoiceStatus('draft')}
              >
                Save Draft
              </button>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${isGstBill ? 'bg-cyan-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setIsGstBill(true)}
              >
                GST Bill
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase ${!isGstBill ? 'bg-amber-500 text-white' : 'bg-white/10 text-gray-300'}`}
                onClick={() => setIsGstBill(false)}
              >
                Non-GST Bill
              </button>
            </div>
            {invoiceType === 'credit' && (
              <>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Paid Amount (optional)"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="mb-3 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
                />
                <div className="mb-3 rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  Outstanding: <span className="font-semibold">{formatCurrency(outstandingAmount)}</span>
                </div>
              </>
            )}
            <label className="mb-3 flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={applyRoundOff} onChange={(e) => setApplyRoundOff(e.target.checked)} />
              Apply round-off
            </label>

            <button
              id="sales-checkout-btn"
              className="w-full rounded-md bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={cart.length === 0 || processing}
              onClick={handleCheckout}
            >
              {processing ? 'Processing...' : invoiceStatus === 'draft' ? 'Save Draft Invoice' : `Create Invoice ${formatCurrency(total)}`}
            </button>

            {checkoutMessage && (
              <p className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                {checkoutMessage}
              </p>
            )}

            {settings.printing.showPrintPreviewHint && (
              <p className="mt-2 text-xs text-gray-400">
                Print profile: {settings.printing.profile}. You can change invoice and print settings in Settings.
              </p>
            )}
          </div>
          </div>
        </div>
      </div>

      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-xl border border-white/15 bg-gray-950/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Quick Product Add</h3>
                <p className="text-xs text-gray-400">Type product name/SKU, then tap item or press Enter.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>

            <input
              ref={quickSearchInputRef}
              type="text"
              value={quickSearchTerm}
              onChange={(e) => setQuickSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowQuickAddModal(false);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const maxIndex = Math.max(0, quickSearchResults.length - 1);
                  setQuickActiveIndex((prev) => Math.min(maxIndex, prev + 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setQuickActiveIndex((prev) => Math.max(0, prev - 1));
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const selected = quickSearchResults[quickActiveIndex];
                  if (selected) addProductFromQuickSearch(selected);
                }
              }}
              placeholder="Start typing product name / SKU..."
              className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-400"
            />

            <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {quickSearchLoading && (
                <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">Searching products...</p>
              )}
              {!quickSearchLoading && quickSearchResults.length === 0 && (
                <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">No matching product found.</p>
              )}
              {!quickSearchLoading && quickSearchResults.map((product, index) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => addProductFromQuickSearch(product)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    index === quickActiveIndex
                      ? 'border-cyan-400/60 bg-cyan-500/15'
                      : 'border-white/10 bg-black/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</p>
                      <p className="text-[11px] text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {addFeedbackText && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 shadow-lg lg:hidden">
          {addFeedbackText}
        </div>
      )}

      {showInvoicePrompt && completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-gray-900 p-6">
            <h3 className="text-xl font-semibold text-white">Sale Completed</h3>
            <p className="mt-2 text-sm text-gray-300">
              Invoice <span className="font-semibold text-white">{completedSale.invoiceNumber || completedSale.saleNumber}</span> is ready.
            </p>
            <p className="mt-1 text-sm text-gray-300">
              Total: <span className="font-semibold text-white">{formatCurrency(completedSale.totalAmount)}</span>
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Printing uses system dialog and supports all installed printers (A4/Thermal/Network).
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
                onClick={() => setShowInvoicePrompt(false)}
              >
                Skip for Now
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                onClick={() => doPrintInvoice(completedSale)}
              >
                Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
