import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardTabs } from '../components/CardTabs';
import { CodeScannerSettingsDialog } from '../components/CodeScannerSettingsDialog';
import { FloatingField } from '../components/FloatingField';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { useCodeScannerCapture } from '../hooks/useCodeScannerCapture';
import { formatCurrency } from '../config';
import { IProduct } from '@shared/types';
import {
  GeneralSettings,
  getGeneralSettings,
  loadGeneralSettingsFromServer,
} from '../utils/generalSettings';
import { printInvoice, PrintableSale } from '../utils/invoicePrint';
import { showAlertDialog } from '../utils/appDialogs';
import {
  getCodeScannerModeLabel,
  getCodeScannerSettings,
  getCodeScannerSubmitLabel,
  isConfiguredScannerSubmitKey,
  saveCodeScannerSettings,
} from '../utils/codeScanner';

interface CartItem extends IProduct {
  quantity: number;
  cartId: string;
  selectedVariantSize?: string;
  selectedVariantColor?: string;
  serialNumbers?: string[];
  serialNumbersText?: string;
  batchNo?: string;
  expiryDate?: string;
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
  address?: string;
  source?: 'customer' | 'member';
  memberStatus?: string;
}

interface CustomerCreditNote {
  _id: string;
  noteNumber: string;
  balanceAmount: number;
  totalAmount?: number;
  reason?: string;
  status?: string;
}

interface CustomerCreditBalance {
  totalIssued: number;
  balance: number;
  notes: CustomerCreditNote[];
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

const normalizeVariantValue = (value: unknown): string => String(value || '').trim();
const getVariantOptions = (product: Pick<IProduct, 'variantMatrix'> | null | undefined) =>
  Array.isArray(product?.variantMatrix)
    ? product.variantMatrix.filter((row) =>
      row?.isActive !== false && (
        normalizeVariantValue(row?.size)
        || normalizeVariantValue(row?.color)
        || normalizeVariantValue(row?.skuSuffix)
        || normalizeVariantValue(row?.barcode)
        || Number(row?.price || 0) > 0
      )
    )
    : [];
const variantOptionValue = (size?: string, color?: string) => `${normalizeVariantValue(size)}|||${normalizeVariantValue(color)}`;
const variantOptionLabel = (row: { size?: string; color?: string; skuSuffix?: string; price?: number }) => {
  const parts = [normalizeVariantValue(row.size), normalizeVariantValue(row.color)].filter(Boolean);
  const base = parts.join(' / ') || normalizeVariantValue(row.skuSuffix) || 'Variant';
  const extraPrice = Number(row.price || 0) > 0 ? ` • ${formatCurrency(Number(row.price || 0))}` : '';
  return `${base}${extraPrice}`;
};
const resolveVariantRow = (
  product: Pick<IProduct, 'variantMatrix' | 'price'> | null | undefined,
  size?: string,
  color?: string
) => {
  const normalizedSize = normalizeVariantValue(size).toLowerCase();
  const normalizedColor = normalizeVariantValue(color).toLowerCase();
  return getVariantOptions(product).find((row) =>
    normalizeVariantValue(row.size).toLowerCase() === normalizedSize
    && normalizeVariantValue(row.color).toLowerCase() === normalizedColor
  ) || null;
};
const variantUnitPrice = (product: Pick<IProduct, 'variantMatrix' | 'price'>, size?: string, color?: string): number => {
  const row = resolveVariantRow(product, size, color);
  const rowPrice = Number(row?.price || 0);
  return rowPrice > 0 ? rowPrice : Number(product.price || 0);
};
const findVariantByCode = (product: IProduct, rawCode: string) => {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  return getVariantOptions(product).find((row) => String(row.barcode || '').trim().toUpperCase() === code) || null;
};
const normalizeSerialNumbers = (value: string): string[] =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[\n,]+/)
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean)
    )
  );

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
  const [showScannerSettings, setShowScannerSettings] = useState(false);
  const [scannerSettings, setScannerSettings] = useState(() => getCodeScannerSettings());
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
  const [customerAddress, setCustomerAddress] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [membershipRedeemPoints, setMembershipRedeemPoints] = useState('');
  const [membershipPreview, setMembershipPreview] = useState<MembershipPreview | null>(null);
  const [applyingMembership, setApplyingMembership] = useState(false);
  const [customerCredit, setCustomerCredit] = useState<CustomerCreditBalance | null>(null);
  const [loadingCustomerCredit, setLoadingCustomerCredit] = useState(false);
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');
  const productFetchSeqRef = useRef(0);
  const activeProductTimerRef = useRef<number | null>(null);
  const activeProductAnimationFrameRef = useRef<number | null>(null);
  const addFeedbackTimerRef = useRef<number | null>(null);
  const quickSearchSeqRef = useRef(0);
  const quickSearchInputRef = useRef<HTMLInputElement | null>(null);
  const inlineSearchSeqRef = useRef(0);
  const inlineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!enableProductScanner || !scannerSettings.autoFocusInput) return;
    const timer = window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [enableProductScanner, scannerSettings.autoFocusInput]);

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

  useEffect(() => {
    const phone = normalizePhone(customerPhone);
    if (phone.length !== 10) {
      setCustomerCredit(null);
      setSelectedCreditNoteId('');
      setCreditNoteAmount('');
      setLoadingCustomerCredit(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setLoadingCustomerCredit(true);
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/credit-notes/customer/balance?customerPhone=${encodeURIComponent(phone)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (cancelled) return;
          if (!data?.success) {
            setCustomerCredit(null);
            setSelectedCreditNoteId('');
            setCreditNoteAmount('');
            return;
          }
          const nextCredit: CustomerCreditBalance = {
            totalIssued: Number(data?.data?.totalIssued || 0),
            balance: Number(data?.data?.balance || 0),
            notes: Array.isArray(data?.data?.notes) ? data.data.notes : [],
          };
          setCustomerCredit(nextCredit);
          setSelectedCreditNoteId((prev) => {
            const stillExists = nextCredit.notes.some((row) => row._id === prev && Number(row.balanceAmount || 0) > 0);
            return stillExists ? prev : '';
          });
          setCreditNoteAmount((prev) => prev);
        } catch {
          if (cancelled) return;
          setCustomerCredit(null);
          setSelectedCreditNoteId('');
          setCreditNoteAmount('');
        } finally {
          if (!cancelled) setLoadingCustomerCredit(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerPhone]);

  const selectCustomer = (customer: CustomerOption) => {
    setSelectedCustomerId(customer.source === 'customer' ? customer._id : '');
    setCustomerPhone(customer.phone || '');
    setCustomerName(customer.name || '');
    setCustomerEmail(customer.email || '');
    setCustomerAddress(customer.address || '');
    setSelectedCreditNoteId('');
    setCreditNoteAmount('');
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

  const addToCart = (product: IProduct, preferredVariant?: { size?: string; color?: string } | null) => {
    if (requiresStockTracking(product) && product.stock <= 0) {
      void showAlertDialog('Out of stock!');
      return;
    }

    const variantOptions = getVariantOptions(product);
    const defaultVariant = preferredVariant
      ? resolveVariantRow(product, preferredVariant.size, preferredVariant.color) || variantOptions[0]
      : variantOptions[0];
    const defaultVariantSize = normalizeVariantValue(preferredVariant?.size || defaultVariant?.size);
    const defaultVariantColor = normalizeVariantValue(preferredVariant?.color || defaultVariant?.color);

    let added = false;
    let warningMessage = '';
    setCart((prev) => {
      const totalForProduct = prev
        .filter((item) => item._id === product._id)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const existing = prev.find((item) =>
        item._id === product._id
        && normalizeVariantValue(item.selectedVariantSize) === defaultVariantSize
        && normalizeVariantValue(item.selectedVariantColor) === defaultVariantColor
      );
      if (existing) {
        if (requiresStockTracking(product) && totalForProduct >= product.stock) {
          warningMessage = 'Cannot add more than available stock';
          return prev;
        }
        added = true;
        return prev.map((item) =>
          item.cartId === existing.cartId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      if (requiresStockTracking(product) && totalForProduct >= product.stock) {
        warningMessage = 'Cannot add more than available stock';
        return prev;
      }
      added = true;
      return [
        ...prev,
        {
          ...product,
          quantity: 1,
          price: variantUnitPrice(product, defaultVariantSize, defaultVariantColor),
          cartId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          selectedVariantSize: defaultVariantSize,
          selectedVariantColor: defaultVariantColor,
          serialNumbers: [],
          serialNumbersText: '',
          batchNo: '',
          expiryDate: '',
        },
      ];
    });
    if (warningMessage) {
      void showAlertDialog(warningMessage);
      return;
    }
    if (added) triggerProductFeedback(product);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    let warningMessage = '';
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartId === cartId) {
          const newQty = item.quantity + delta;
          if (newQty < 1) return item;
          const siblingQty = prev
            .filter((row) => row._id === item._id && row.cartId !== item.cartId)
            .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
          if (requiresStockTracking(item) && siblingQty + newQty > item.stock) {
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

  const removeFromCart = (cartId: string) => {
    setCart((prev) => prev.filter((item) => item.cartId !== cartId));
  };

  const updateCartItemField = (cartId: string, field: keyof CartItem, value: any) => {
    setCart((prev) => prev.map((item) => (item.cartId === cartId ? { ...item, [field]: value } : item)));
  };

  const updateCartVariant = (cartId: string, value: string) => {
    const [size, color] = String(value || '').split('|||');
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartId !== cartId) return item;
        return {
          ...item,
          selectedVariantSize: normalizeVariantValue(size),
          selectedVariantColor: normalizeVariantValue(color),
          price: variantUnitPrice(item, size, color),
        };
      })
    );
  };

  const focusScannerInput = () => {
    if (!scannerSettings.autoFocusInput) return;
    window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    }, 20);
  };

  const findProductByCode = (rawCode: string): IProduct | null => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return null;

    const exact = products.find((product) => {
      const sku = String(product.sku || '').trim().toUpperCase();
      const barcode = String(product.barcode || '').trim().toUpperCase();
      const variantBarcodeMatch = getVariantOptions(product).some(
        (row) => String(row.barcode || '').trim().toUpperCase() === code
      );
      return sku === code || barcode === code || variantBarcodeMatch;
    });
    if (exact) return exact;

    const startsWith = products.find((product) => {
      const sku = String(product.sku || '').trim().toUpperCase();
      const barcode = String(product.barcode || '').trim().toUpperCase();
      const variantBarcodeMatch = getVariantOptions(product).some(
        (row) => String(row.barcode || '').trim().toUpperCase().startsWith(code)
      );
      return sku.startsWith(code) || barcode.startsWith(code) || variantBarcodeMatch;
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

  const handleProductCodeScan = async (rawCode?: string) => {
    const code = String(rawCode ?? scanCode ?? '').trim();
    if (!code) {
      await showAlertDialog('Please scan or enter a product code.');
      return;
    }

    const matched = findProductByCode(code) || (await fetchProductByCode(code));
    if (!matched) {
      await showAlertDialog('Product not found for this code. Please check SKU/barcode and try again.');
      return;
    }

    addToCart(matched, findVariantByCode(matched, code));
    setScanCode('');
    focusScannerInput();
  };

  useCodeScannerCapture({
    enabled: enableProductScanner,
    settings: scannerSettings,
    onScan: (value) => {
      setScanCode(value);
      void handleProductCodeScan(value);
    },
  });

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
    if (normalizePhone(customerPhone).length !== 10) {
      await showAlertDialog('Enter a valid 10-digit customer phone to apply membership');
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
    const normalizedCustomerPhone = normalizePhone(customerPhone);
    if (normalizedCustomerPhone.length !== 10) {
      await showAlertDialog('Customer phone number is mandatory and must be 10 digits.');
      return;
    }

    for (const item of cart) {
      if (item.expiryRequired && !String(item.expiryDate || '').trim()) {
        await showAlertDialog(`Enter the expiry date for ${item.name}.`);
        return;
      }
      if (item.serialNumberTracking) {
        const serialCount = normalizeSerialNumbers(item.serialNumbersText || '').length;
        if (serialCount !== Number(item.quantity || 0)) {
          await showAlertDialog(`Enter exactly ${item.quantity} serial number(s) for ${item.name}.`);
          return;
        }
      }
    }

    setProcessing(true);
    setCheckoutMessage('');

    try {
      const token = localStorage.getItem('token');
      const totals = calculateTotals();
      const selectedCreditNote = (customerCredit?.notes || []).find((row) => row._id === selectedCreditNoteId) || null;
      const requestedCreditAmount = Math.max(0, Number(creditNoteAmount || selectedCreditNote?.balanceAmount || 0));
      const appliedCreditAmount = selectedCreditNote
        ? Math.min(requestedCreditAmount, Number(selectedCreditNote.balanceAmount || 0), Number(totals.total || 0))
        : 0;
      const computedPaidAmount = paidAmount
        ? Number(paidAmount)
        : invoiceType === 'credit'
          ? undefined
          : Math.max(0, Number(totals.total || 0) - appliedCreditAmount);

      const saleData = {
        items: cart.map((item) => ({
          productId: item._id,
          quantity: item.quantity,
          unitPrice: item.price,
          gstRate: item.gstRate,
          batchNo: item.batchNo || undefined,
          expiryDate: item.expiryDate || undefined,
          serialNumbers: item.serialNumberTracking ? normalizeSerialNumbers(item.serialNumbersText || '') : undefined,
          variantSize: item.selectedVariantSize || undefined,
          variantColor: item.selectedVariantColor || undefined,
        })),
        paymentMethod,
        invoiceType,
        invoiceStatus,
        isGstBill,
        invoiceNumber: invoiceNumberMode === 'manual' ? manualInvoiceNumber.trim() : undefined,
        autoInvoiceNumber: invoiceNumberMode === 'auto',
        applyRoundOff,
        paidAmount: computedPaidAmount,
        customerId: selectedCustomerId || undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: normalizedCustomerPhone,
        customerEmail: customerEmail.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        notes: saleNotes,
        subtotal: totals.subtotal,
        totalGst: totals.gst,
        discountAmount: totals.discountAmount,
        discountPercentage: totals.discountPercentage,
        totalAmount: totals.total,
        creditNoteId: selectedCreditNote?._id || undefined,
        creditNoteAmount: appliedCreditAmount > 0 ? appliedCreditAmount : undefined,
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
        customerPhone: data?.data?.customerPhone || normalizedCustomerPhone,
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
              mobile: normalizedCustomerPhone,
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
      setCustomerAddress('');
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
      setCustomerCredit(null);
      setSelectedCreditNoteId('');
      setCreditNoteAmount('');
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
  const selectedCreditNote = (customerCredit?.notes || []).find((row) => row._id === selectedCreditNoteId) || null;
  const requestedCreditAmount = Math.max(0, Number(creditNoteAmount || selectedCreditNote?.balanceAmount || 0));
  const appliedStoreCredit = selectedCreditNote
    ? Math.min(requestedCreditAmount, Number(selectedCreditNote.balanceAmount || 0), Number(total || 0))
    : 0;
  const effectivePaidAmount = paidAmount
    ? Number(paidAmount || 0)
    : invoiceType === 'credit'
      ? 0
      : Math.max(0, Number(total || 0) - appliedStoreCredit);
  const outstandingAmount = Math.max(0, total - effectivePaidAmount - appliedStoreCredit);
  const normalizedCustomerPhone = normalizePhone(customerPhone);
  const hasValidCustomerPhone = normalizedCustomerPhone.length === 10;
  const willCreateNewCustomer =
    !searchingCustomers && hasValidCustomerPhone && customerMatches.length === 0 && !selectedCustomerId;
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
                onClick={() => setShowQuickAddModal(true)}
                className="rounded-md bg-cyan-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-400"
              >
                Quick Add
              </button>
            </div>
          </div>

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

          <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/90">Product Code Scanner</p>
                <p className="mt-1 text-[11px] text-emerald-100/75">
                  Mode: {getCodeScannerModeLabel(scannerSettings.captureMode)} • Submit: {getCodeScannerSubmitLabel(scannerSettings.submitKey)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScannerSettings(true)}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  title="Code Scanner settings"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                    <path d="M11.983 1.722a1 1 0 0 0-1.966 0l-.143.86a7.329 7.329 0 0 0-1.62.669l-.708-.507a1 1 0 0 0-1.37.12L4.6 4.44a1 1 0 0 0 .12 1.37l.507.708a7.329 7.329 0 0 0-.669 1.62l-.86.143a1 1 0 0 0 0 1.966l.86.143c.13.564.354 1.105.669 1.62l-.507.708a1 1 0 0 0-.12 1.37l1.576 1.576a1 1 0 0 0 1.37.12l.708-.507c.515.315 1.056.539 1.62.669l.143.86a1 1 0 0 0 1.966 0l.143-.86a7.33 7.33 0 0 0 1.62-.669l.708.507a1 1 0 0 0 1.37-.12l1.576-1.576a1 1 0 0 0-.12-1.37l-.507-.708a7.33 7.33 0 0 0 .669-1.62l.86-.143a1 1 0 0 0 0-1.966l-.86-.143a7.33 7.33 0 0 0-.669-1.62l.507-.708a1 1 0 0 0 .12-1.37L13.824 2.864a1 1 0 0 0-1.37-.12l-.708.507a7.329 7.329 0 0 0-1.62-.669l-.143-.86ZM10 12.75A2.75 2.75 0 1 1 10 7.25a2.75 2.75 0 0 1 0 5.5Z" />
                  </svg>
                  Code Scanner
                </button>
                <button
                  type="button"
                  onClick={() => setEnableProductScanner((prev) => !prev)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                    enableProductScanner ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-200'
                  }`}
                >
                  {enableProductScanner ? 'Scanner On' : 'Scanner Off'}
                </button>
              </div>
            </div>

            {enableProductScanner ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    ref={scannerInputRef}
                    type="text"
                    value={scanCode}
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (isConfiguredScannerSubmitKey(e.key, scannerSettings.submitKey)) {
                        e.preventDefault();
                        void handleProductCodeScan();
                      }
                    }}
                    placeholder={`Scan SKU / barcode and press ${getCodeScannerSubmitLabel(scannerSettings.submitKey)}`}
                    className="w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder-gray-400"
                  />
                  <button
                    type="button"
                    onClick={() => void handleProductCodeScan()}
                    className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    Add by Code
                  </button>
                </div>
                <p className="text-[11px] text-emerald-100/80">
                  Works with SKU, barcode, and variant barcode. Use global capture from Code Scanner settings if the cursor will not stay inside this box.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-emerald-100/80">
                Turn this on when you want to add items directly from a scanner.
              </p>
            )}
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
                      {(item.selectedVariantSize || item.selectedVariantColor) && (
                        <p className="text-[11px] text-cyan-200">
                          Variant: {[item.selectedVariantSize, item.selectedVariantColor].filter(Boolean).join(' / ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded border border-white/20 px-2 py-1 text-sm"
                        onClick={() => updateQuantity(item.cartId, -1)}
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center text-sm">{item.quantity}</span>
                      <button
                        className="rounded border border-white/20 px-2 py-1 text-sm"
                        onClick={() => updateQuantity(item.cartId, 1)}
                      >
                        +
                      </button>
                      <button className="text-red-400" onClick={() => removeFromCart(item.cartId)}>
                        x
                      </button>
                    </div>
                  </div>
                  {getVariantOptions(item).length > 0 && (
                    <div className="mt-3">
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Variant</label>
                      <select
                        value={variantOptionValue(item.selectedVariantSize, item.selectedVariantColor)}
                        onChange={(e) => updateCartVariant(item.cartId, e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                      >
                        {getVariantOptions(item).map((row, index) => (
                          <option
                            key={`${item._id}-${index}-${variantOptionValue(row.size, row.color)}`}
                            value={variantOptionValue(row.size, row.color)}
                            className="bg-gray-900"
                          >
                            {variantOptionLabel(row)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {(item.batchTracking || item.expiryRequired || item.serialNumberTracking) && (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {item.batchTracking && (
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Batch No</label>
                          <input
                            value={item.batchNo || ''}
                            onChange={(e) => updateCartItemField(item.cartId, 'batchNo', e.target.value)}
                            placeholder="Batch / lot number"
                            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                          />
                        </div>
                      )}
                      {item.expiryRequired && (
                        <div>
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Expiry Date</label>
                          <input
                            type="date"
                            value={item.expiryDate || ''}
                            onChange={(e) => updateCartItemField(item.cartId, 'expiryDate', e.target.value)}
                            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                          />
                        </div>
                      )}
                      {item.serialNumberTracking && (
                        <div className="md:col-span-2">
                          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                            Serial Numbers ({item.quantity} required)
                          </label>
                          <textarea
                            rows={2}
                            value={item.serialNumbersText || ''}
                            onChange={(e) => updateCartItemField(item.cartId, 'serialNumbersText', e.target.value)}
                            placeholder="Enter one serial per line or comma separated"
                            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                          />
                          <p className="mt-1 text-[11px] text-gray-500">
                            Captured: {normalizeSerialNumbers(item.serialNumbersText || '').length} / {item.quantity}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className={`${isMinimalMode ? 'mt-0 space-y-2 border border-white/10 rounded-md p-3' : 'mt-4 space-y-2 border-t border-white/10 pt-4'}`}>
            <p className="text-[11px] text-gray-400">Customer phone is mandatory. If the number is not found, a new customer profile will be created automatically.</p>
            <FloatingField
              label="Customer Phone"
              required
              value={customerPhone}
              name="lookup_customer"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="numeric"
              dataLpignore="true"
              onChange={(value) => {
                setCustomerPhone(value);
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
            {willCreateNewCustomer && (
              <p className="text-[11px] text-amber-300">No existing customer found. A new customer will be created from this phone number at invoice save.</p>
            )}
            {!!selectedCustomerId && <p className="text-[11px] text-emerald-300">Existing customer selected from database</p>}

            <FloatingField label="Customer Name" value={customerName} onChange={setCustomerName} />
            <FloatingField label="Email ID (optional)" type="email" value={customerEmail} onChange={setCustomerEmail} />
            <FloatingField label="Address (optional)" rows={2} value={customerAddress} onChange={setCustomerAddress} />
            <FloatingField label="Invoice Notes (optional)" rows={2} value={saleNotes} onChange={setSaleNotes} />
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
              <FloatingField label="Manual Invoice Number" value={manualInvoiceNumber} onChange={setManualInvoiceNumber} />
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
              <FloatingField
                label="Mode"
                value={discountType}
                onChange={(value) => setDiscountType(value as 'amount' | 'percentage')}
                options={[
                  { value: 'amount', label: 'Amount' },
                  { value: 'percentage', label: '%' },
                ]}
                inputClassName="px-2 pb-1.5 pt-3 text-xs"
              />
              <FloatingField
                label={discountType === 'percentage' ? 'Discount %' : 'Discount'}
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={setDiscountValue}
                inputClassName="px-2 pb-1.5 pt-3 text-xs"
              />
            </div>
            <div className="mb-2 grid grid-cols-[1fr_120px_120px] items-center gap-2">
              <span className="text-sm text-gray-300">Membership</span>
              <FloatingField
                label="Redeem Pts"
                type="number"
                min="0"
                step="1"
                value={membershipRedeemPoints}
                onChange={setMembershipRedeemPoints}
                inputClassName="px-2 pb-1.5 pt-3 text-xs"
              />
              <button
                type="button"
                onClick={applyMembershipBenefits}
                disabled={applyingMembership || !hasValidCustomerPhone}
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
            <div className="mb-2 rounded border border-white/10 bg-black/10 p-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm text-gray-300">Store Credit</span>
                <span className="text-xs text-gray-400">
                  {loadingCustomerCredit
                    ? 'Checking...'
                    : customerCredit?.balance
                      ? `Available ${formatCurrency(Number(customerCredit.balance || 0))}`
                      : 'No credit balance'}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1.4fr_0.8fr]">
                <select
                  value={selectedCreditNoteId}
                  onChange={(e) => {
                    const noteId = e.target.value;
                    setSelectedCreditNoteId(noteId);
                    const note = (customerCredit?.notes || []).find((row) => row._id === noteId);
                    setCreditNoteAmount(note ? String(Number(note.balanceAmount || 0)) : '');
                  }}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                >
                  <option value="" className="bg-gray-900">Select store credit / credit note</option>
                  {(customerCredit?.notes || [])
                    .filter((row) => Number(row.balanceAmount || 0) > 0)
                    .map((row) => (
                      <option key={row._id} value={row._id} className="bg-gray-900">
                        {row.noteNumber} • {formatCurrency(Number(row.balanceAmount || 0))} • {row.reason || 'Credit'}
                      </option>
                    ))}
                </select>
                <FloatingField
                  label="Apply Amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={creditNoteAmount}
                  onChange={setCreditNoteAmount}
                  inputClassName="px-2 pb-1.5 pt-3 text-xs"
                />
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Discount Applied</span>
              <span>- {formatCurrency(discountAmount)}</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-gray-300">
              <span>Store Credit Applied</span>
              <span>- {formatCurrency(appliedStoreCredit)}</span>
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
            <div className="mb-4 flex items-center justify-between text-sm text-gray-300">
              <span>{invoiceType === 'credit' ? 'Expected Outstanding' : 'Collect Now'}</span>
              <span>{formatCurrency(invoiceType === 'credit' ? outstandingAmount : Math.max(0, total - appliedStoreCredit))}</span>
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
                onClick={() => {
                  setInvoiceType('cash');
                  setPaidAmount('');
                }}
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
                <FloatingField
                  className="mb-3"
                  label="Paid Amount (optional)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={setPaidAmount}
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
      <CodeScannerSettingsDialog
        open={showScannerSettings}
        settings={scannerSettings}
        onClose={() => setShowScannerSettings(false)}
        onSave={(nextSettings) => {
          const saved = saveCodeScannerSettings(nextSettings);
          setScannerSettings(saved);
          setShowScannerSettings(false);
          if (enableProductScanner) focusScannerInput();
        }}
      />
    </>
  );
};
