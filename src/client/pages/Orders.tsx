import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../config';
import { Table, Column } from '../components/Table';
import { apiUrl, fetchApiJson } from '../utils/api';
import { getGeneralSettings } from '../utils/generalSettings';
import { printInvoice, PrintableSale } from '../utils/invoicePrint';
import ReturnModal from '../components/ReturnModal';
import { showAlertDialog } from '../utils/appDialogs';

interface HistoryItem {
  productId?: string;
  name: string;
  quantity: number;
  amount: number;
  unitPrice?: number;
  gstRate?: number;
}

interface HistoryRow {
  _id: string;
  number: string;
  createdAt: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  invoiceType?: 'cash' | 'credit';
  invoiceStatus?: 'draft' | 'posted' | 'cancelled';
  outstandingAmount?: number;
  notes?: string;
  discountAmount?: number;
  discountPercentage?: number;
  roundOffAmount?: number;
  items: HistoryItem[];
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  source: 'sales' | 'orders';
  reservationStatus?: string;
  deliveryStatus?: string;
}

interface ProductOption {
  _id: string;
  name: string;
  sku?: string;
  category?: string;
  price: number;
  gstRate?: number;
  stock?: number;
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
const HISTORY_PAGE_SIZE = 25;
const PRODUCT_BATCH_SIZE = 120;

interface EditItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

interface EditFormState {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  paymentMethod: string;
  discountAmount: string;
  discountPercentage: string;
  applyRoundOff: boolean;
  items: EditItem[];
}

interface ReturnLineItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

const normalizeSalesRows = (rows: any[]): HistoryRow[] =>
  rows.map((sale) => ({
    _id: sale._id,
    number: sale.invoiceNumber || sale.saleNumber || sale._id?.slice(-6)?.toUpperCase() || '-',
    createdAt: sale.createdAt,
    customerId: sale.customerId || '',
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    customerEmail: sale.customerEmail,
    invoiceType: sale.invoiceType || 'cash',
    invoiceStatus: sale.invoiceStatus || 'posted',
    outstandingAmount: Number(sale.outstandingAmount || 0),
    notes: sale.notes || '',
    discountAmount: Number(sale.discountAmount || 0),
    discountPercentage: Number(sale.discountPercentage || 0),
    roundOffAmount: Number(sale.roundOffAmount || 0),
    items: (sale.items || []).map((item: any) => ({
      productId: String(item.productId || ''),
      name: item.productName || item.sku || 'Item',
      quantity: Number(item.quantity || 0),
      amount: Number(item.lineTotal || item.unitPrice || 0),
      unitPrice: Number(item.unitPrice || 0),
      gstRate: Number(item.gstRate || 0),
    })),
    totalAmount: Number(sale.totalAmount || 0),
    paymentMethod: sale.paymentMethod || '-',
    paymentStatus: sale.paymentStatus || '-',
    status: sale.saleStatus || '-',
    source: 'sales',
  }));

const normalizeOrdersRows = (rows: any[]): HistoryRow[] =>
  rows.map((order) => ({
    _id: order._id,
    number: order.orderNumber || order._id?.slice(-6)?.toUpperCase() || '-',
    createdAt: order.createdAt,
    items: (order.items || []).map((item: any) => {
      const product = item.productId;
      const productName = typeof product === 'object' ? product?.name : '';
      return {
        productId: typeof product === 'object' ? String(product?._id || '') : String(product || ''),
        name: item.productName || productName || item.sku || 'Item',
        quantity: Number(item.quantity || 0),
        amount: Number(item.price || 0),
        unitPrice: Number(item.quantity || 0) > 0 ? Number(item.price || 0) / Number(item.quantity || 1) : 0,
        gstRate: Number(item.gstRate || 0),
      };
    }),
    totalAmount: Number(order.totalAmount || 0),
    paymentMethod: order.paymentMethod || '-',
    paymentStatus: order.paymentStatus || '-',
    status: order.orderStatus || '-',
    reservationStatus: order.reservationStatus || '',
    deliveryStatus: order.deliveryStatus || '',
    source: 'orders',
  }));

const emptyEditForm = (): EditFormState => ({
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  notes: '',
  paymentMethod: 'cash',
  discountAmount: '0',
  discountPercentage: '0',
  applyRoundOff: true,
  items: [],
});

export const Orders: React.FC = () => {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalHistoryRows, setTotalHistoryRows] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [editingRow, setEditingRow] = useState<HistoryRow | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm());
  const [addProductId, setAddProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [printingSaleId, setPrintingSaleId] = useState('');
  const [postingDraftId, setPostingDraftId] = useState('');
  const [orderActionId, setOrderActionId] = useState('');
  const [editError, setEditError] = useState('');
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [returnRow, setReturnRow] = useState<HistoryRow | null>(null);

  const returnModalItems = useMemo<ReturnLineItem[]>(() => {
    if (!returnRow) return [];
    const grouped = new Map<string, ReturnLineItem>();

    for (const item of returnRow.items || []) {
      const productId = String(item.productId || '');
      const quantity = Number(item.quantity || 0);
      if (!productId || quantity <= 0) continue;

      const existing = grouped.get(productId);
      if (existing) {
        existing.quantity += quantity;
        continue;
      }

      grouped.set(productId, {
        productId,
        productName: item.name,
        quantity,
        unitPrice: Number(item.unitPrice || 0),
        gstRate: Number(item.gstRate || 0),
      });
    }

    return Array.from(grouped.values());
  }, [returnRow]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  };

  const fetchHistory = async (page: number, query: string) => {
    const safePage = Math.max(1, Number(page) || 1);
    const skip = (safePage - 1) * HISTORY_PAGE_SIZE;
    const params = new URLSearchParams({
      skip: String(skip),
      limit: String(HISTORY_PAGE_SIZE),
    });
    if (query.trim()) {
      params.set('q', query.trim());
    }

    setLoading(true);
    try {
      setError('');
      const headers = getAuthHeaders();

      const [salesResult, ordersResult] = await Promise.allSettled([
        fetchApiJson(apiUrl(`/api/sales?${params.toString()}`), { headers }),
        fetchApiJson(apiUrl(`/api/orders?${params.toString()}`), { headers }),
      ]);

      if (salesResult.status === 'rejected' && ordersResult.status === 'rejected') {
        throw salesResult.reason || ordersResult.reason;
      }

      const salesResp = salesResult.status === 'fulfilled' ? salesResult.value : { data: [], pagination: { total: 0 } };
      const ordersResp = ordersResult.status === 'fulfilled' ? ordersResult.value : { data: [], pagination: { total: 0 } };
      const salesRows = normalizeSalesRows(salesResp.data || []);
      const orderRows = normalizeOrdersRows(ordersResp.data || []);
      const combinedRows = [...salesRows, ...orderRows]
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
      const total = Number(salesResp?.pagination?.total || salesRows.length || 0)
        + Number(ordersResp?.pagination?.total || orderRows.length || 0);
      const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
      setRows(combinedRows);
      setTotalHistoryRows(total);
      setHistoryTotalPages(totalPages);
      if (safePage > totalPages) {
        setHistoryPage(totalPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sales history');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async (reset = false) => {
    const skip = reset ? 0 : products.length;
    if (!reset) setLoadingMoreProducts(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetchApiJson(
        apiUrl(`/api/products?skip=${skip}&limit=${PRODUCT_BATCH_SIZE}`),
        { headers }
      );
      const incoming: ProductOption[] = Array.isArray(response?.data) ? response.data : [];
      const total = Number(response?.pagination?.total || incoming.length || 0);
      setProducts((prev) => {
        if (reset) return incoming;
        const merged = [...prev];
        const existing = new Set(prev.map((row) => row._id));
        incoming.forEach((row) => {
          if (!existing.has(row._id)) {
            existing.add(row._id);
            merged.push(row);
          }
        });
        return merged;
      });
      setHasMoreProducts(skip + incoming.length < total);
    } catch {
      // optional list for edit dialog; ignore failure
    } finally {
      if (!reset) setLoadingMoreProducts(false);
    }
  };

  useEffect(() => {
    void fetchProducts(true);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistoryPage(1);
      setHistoryQuery(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void fetchHistory(historyPage, historyQuery);
  }, [historyPage, historyQuery]);

  useEffect(() => {
    if (!editingRow) return;
    const phone = normalizePhone(editForm.customerPhone);
    if (phone.length < 4) {
      setCustomerMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setSearchingCustomers(true);
          const response = await fetchApiJson(apiUrl(`/api/customers/search-unified?q=${encodeURIComponent(phone)}`), {
            headers: getAuthHeaders(),
          });
          setCustomerMatches(Array.isArray(response?.data) ? response.data : []);
        } catch {
          setCustomerMatches([]);
        } finally {
          setSearchingCustomers(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [editForm.customerPhone, editingRow]);

  const productCategories = useMemo(() => {
    return Array.from(
      new Set(
        products
          .map((product) => String(product.category || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const addableProducts = useMemo(() => {
    const searchText = productSearch.trim().toLowerCase();
    return products.filter((product) => {
      const alreadyInInvoice = editForm.items.some((item) => String(item.productId) === String(product._id));
      if (alreadyInInvoice) return false;
      if (Number(product.stock || 0) <= 0) return false;
      if (productCategoryFilter && String(product.category || '').trim() !== productCategoryFilter) return false;
      if (!searchText) return true;
      return (
        String(product.name || '').toLowerCase().includes(searchText)
        || String(product.sku || '').toLowerCase().includes(searchText)
      );
    });
  }, [products, editForm.items, productSearch, productCategoryFilter]);

  const productSuggestions = useMemo(() => {
    if (!productSearch.trim()) return [];
    return addableProducts.slice(0, 10);
  }, [addableProducts, productSearch]);

  useEffect(() => {
    if (!addProductId) return;
    const stillAvailable = addableProducts.some((product) => String(product._id) === String(addProductId));
    if (!stillAvailable) setAddProductId('');
  }, [addProductId, addableProducts]);

  const productMapById = useMemo(() => {
    const map = new Map<string, ProductOption>();
    for (const row of products) {
      map.set(String(row._id), row);
    }
    return map;
  }, [products]);

  const originalEditQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!editingRow) return map;
    for (const item of editingRow.items || []) {
      if (!item.productId) continue;
      map.set(String(item.productId), Number(item.quantity || 0));
    }
    return map;
  }, [editingRow]);

  const getMaxEditableQty = (productId: string): number => {
    const key = String(productId || '');
    const originalQty = Number(originalEditQtyByProduct.get(key) || 0);
    const product = productMapById.get(key);
    if (!product) {
      return Math.max(1, originalQty);
    }
    return Math.max(0, Number(product.stock || 0) + originalQty);
  };

  const editedTotals = useMemo(() => {
    const subtotal = editForm.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const gst = editForm.items.reduce((sum, item) => {
      const lineBase = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      return sum + (lineBase * Number(item.gstRate || 0)) / 100;
    }, 0);
    let gross = subtotal + gst;

    const discountAmount = Number(editForm.discountAmount || 0);
    const discountPercentage = Number(editForm.discountPercentage || 0);
    if (discountAmount > 0) gross -= discountAmount;
    else if (discountPercentage > 0) gross -= (gross * discountPercentage) / 100;

    if (gross < 0) gross = 0;
    const total = editForm.applyRoundOff ? Math.round(gross) : gross;
    const roundOff = total - gross;
    return { subtotal, gst, gross, roundOff, total };
  }, [editForm]);

  const paidSoFar = useMemo(() => {
    if (!editingRow) return 0;
    return Math.max(0, Number(editingRow.totalAmount || 0) - Number(editingRow.outstandingAmount || 0));
  }, [editingRow]);

  const projectedOutstanding = useMemo(
    () => Math.max(0, Number(editedTotals.total || 0) - Number(paidSoFar || 0)),
    [editedTotals.total, paidSoFar]
  );

  const ensureProductsInCache = async (productIds: string[]) => {
    const missing = Array.from(
      new Set(
        productIds
          .map((id) => String(id || ''))
          .filter((id) => id && !productMapById.has(id))
      )
    );
    if (!missing.length) return;

    try {
      const headers = getAuthHeaders();
      const responses = await Promise.all(
        missing.map(async (id) => {
          try {
            return await fetchApiJson(apiUrl(`/api/products/${id}`), { headers });
          } catch {
            return null;
          }
        })
      );

      const fetched: ProductOption[] = responses
        .map((resp) => (resp && resp.data ? (resp.data as ProductOption) : null))
        .filter((row): row is ProductOption => Boolean(row?._id));

      if (!fetched.length) return;

      setProducts((prev) => {
        const map = new Map(prev.map((row) => [String(row._id), row]));
        for (const row of fetched) {
          map.set(String(row._id), row);
        }
        return Array.from(map.values());
      });
    } catch {
      // optional preload only
    }
  };

  const openEditModal = (row: HistoryRow) => {
    if (row.source !== 'sales') return;
    const mappedItems: EditItem[] = (row.items || [])
      .filter((item) => item.productId)
      .map((item) => ({
        productId: String(item.productId),
        productName: item.name,
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
        gstRate: Number(item.gstRate || 0),
      }));

    setEditingRow(row);
    setEditForm({
      customerId: row.customerId || '',
      customerName: row.customerName || '',
      customerPhone: row.customerPhone || '',
      customerEmail: row.customerEmail || '',
      notes: row.notes || '',
      paymentMethod: row.paymentMethod || 'cash',
      discountAmount: String(Number(row.discountAmount || 0)),
      discountPercentage: String(Number(row.discountPercentage || 0)),
      applyRoundOff: Math.abs(Number(row.roundOffAmount || 0)) > 0,
      items: mappedItems,
    });
    setAddProductId('');
    setProductSearch('');
    setProductCategoryFilter('');
    setEditError('');
    setCustomerMatches([]);
    void ensureProductsInCache(mappedItems.map((item) => item.productId));
  };

  const closeEditModal = () => {
    setEditingRow(null);
    setEditForm(emptyEditForm());
    setAddProductId('');
    setProductSearch('');
    setProductCategoryFilter('');
    setEditError('');
    setSavingEdit(false);
    setCustomerMatches([]);
    setSearchingCustomers(false);
  };

  const updateEditItem = (index: number, field: keyof EditItem, value: string) => {
    setEditForm((prev) => {
      const updated = [...prev.items];
      const current = { ...updated[index] };
      if (field === 'quantity') {
        const numeric = Math.floor(Number(value));
        const safe = Number.isFinite(numeric) ? numeric : 0;
        const maxQty = getMaxEditableQty(String(current.productId));
        current.quantity = Math.max(1, Math.min(maxQty || 1, safe || 1));
      } else if (field === 'unitPrice' || field === 'gstRate') {
        const numeric = Number(value);
        (current as any)[field] = Number.isFinite(numeric) ? numeric : 0;
      } else {
        (current as any)[field] = value;
      }
      updated[index] = current;
      return { ...prev, items: updated };
    });
  };

  const removeEditItem = (index: number) => {
    setEditForm((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const addProductToEdit = () => {
    if (!addProductId) return;
    const product = addableProducts.find((p) => String(p._id) === String(addProductId));
    if (!product) return;
    if (Number(product.stock || 0) <= 0) {
      setEditError(`No stock available for ${product.name}`);
      return;
    }

    const exists = editForm.items.some((item) => String(item.productId) === String(product._id));
    if (exists) {
      setEditError('Product already exists in invoice');
      return;
    }

    setEditError('');
    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          productId: product._id,
          productName: product.name,
          quantity: 1,
          unitPrice: Number(product.price || 0),
          gstRate: Number(product.gstRate || 0),
        },
      ],
    }));
    setAddProductId('');
  };

  const selectCustomer = (customer: CustomerOption) => {
    setEditForm((prev) => ({
      ...prev,
      customerId: customer.source === 'customer' ? customer._id : '',
      customerName: customer.name || prev.customerName,
      customerPhone: customer.phone || prev.customerPhone,
      customerEmail: customer.email || prev.customerEmail,
    }));
    setCustomerMatches([]);
  };

  const mapSaleToPrintable = (sale: any): PrintableSale => ({
    saleNumber: sale?.saleNumber,
    invoiceNumber: sale?.invoiceNumber,
    createdAt: sale?.createdAt,
    isGstBill: sale?.isGstBill,
    paymentMethod: sale?.paymentMethod,
    customerName: sale?.customerName,
    customerPhone: sale?.customerPhone,
    customerEmail: sale?.customerEmail,
    notes: sale?.notes,
    subtotal: Number(sale?.subtotal || 0),
    totalGst: Number(sale?.totalGst || 0),
    totalAmount: Number(sale?.totalAmount || 0),
    discountAmount: Number(sale?.discountAmount || 0),
    items: Array.isArray(sale?.items)
      ? sale.items.map((item: any) => ({
        productName: item?.productName || item?.name || 'Item',
        sku: item?.sku,
        hsnCode: item?.hsnCode,
        batchNo: item?.batchNo,
        expiryDate: item?.expiryDate,
        serialNumbers: Array.isArray(item?.serialNumbers) ? item.serialNumbers : [],
        variantSize: item?.variantSize,
        variantColor: item?.variantColor,
        quantity: Number(item?.quantity || 0),
        unitPrice: Number(item?.unitPrice || 0),
        gstRate: Number(item?.gstRate || 0),
        gstAmount: Number(item?.gstAmount || 0),
        lineTotal: Number(item?.lineTotal || 0),
      }))
      : [],
  });

  const printSaleInvoice = async (saleId: string, preloadedSale?: any) => {
    if (!saleId) return;
    setPrintingSaleId(saleId);
    try {
      const sale = preloadedSale || (await fetchApiJson(apiUrl(`/api/sales/${saleId}`), { headers: getAuthHeaders() }))?.data;
      if (!sale) {
        throw new Error('Invoice data not found');
      }
      const ok = printInvoice(mapSaleToPrintable(sale), getGeneralSettings());
      if (!ok) {
        throw new Error('Unable to open print window. Please allow popups and try again.');
      }
    } catch (err: any) {
      await showAlertDialog(err?.message || 'Failed to print invoice');
    } finally {
      setPrintingSaleId('');
    }
  };

  const openReturnModal = (row: HistoryRow) => {
    if (row.source !== 'sales') return;
    setReturnRow(row);
  };

  const postDraftInvoice = async (row: HistoryRow) => {
    if (row.source !== 'sales' || row.invoiceStatus !== 'draft') return;
    setPostingDraftId(row._id);
    try {
      const response = await fetchApiJson(apiUrl(`/api/sales/${row._id}/post`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      await fetchHistory(historyPage, historyQuery);
      setSuccessMessage(response?.message || 'Draft posted successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to post draft invoice');
    } finally {
      setPostingDraftId('');
    }
  };

  const runOrderWorkflowAction = async (
    row: HistoryRow,
    action: 'reserve' | 'delivery-challan' | 'invoice'
  ) => {
    if (row.source !== 'orders') return;
    setOrderActionId(`${row._id}:${action}`);
    setError('');
    setSuccessMessage('');
    try {
      const response = await fetchApiJson(apiUrl(`/api/orders/${row._id}/${action}`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      await fetchHistory(historyPage, historyQuery);
      void fetchProducts(true);
      setSuccessMessage(response?.message || 'Order workflow updated');
      setTimeout(() => setSuccessMessage(''), 3500);
    } catch (err: any) {
      setError(err?.message || 'Failed to update order workflow');
    } finally {
      setOrderActionId('');
    }
  };

  const closeReturnModal = (created?: boolean) => {
    setReturnRow(null);
    if (created) {
      setSuccessMessage('Return created successfully. Awaiting approval.');
      setTimeout(() => setSuccessMessage(''), 3500);
      void fetchHistory(historyPage, historyQuery);
    }
  };

  const saveInvoiceEdit = async () => {
    if (!editingRow) return;
    if (!editForm.items.length) {
      setEditError('At least one item is required');
      return;
    }
    if (editForm.items.some((item) => Number(item.quantity || 0) <= 0)) {
      setEditError('All item quantities must be greater than zero');
      return;
    }
    const stockViolation = editForm.items.find((item) => Number(item.quantity || 0) > getMaxEditableQty(item.productId));
    if (stockViolation) {
      const maxQty = getMaxEditableQty(stockViolation.productId);
      setEditError(`Quantity for ${stockViolation.productName} exceeds available stock. Max allowed: ${maxQty}`);
      return;
    }

    setSavingEdit(true);
    setEditError('');
    setSuccessMessage('');

    try {
      const endpoint =
        editingRow.invoiceStatus === 'posted'
          ? apiUrl(`/api/sales/${editingRow._id}/edit-posted`)
          : apiUrl(`/api/sales/${editingRow._id}`);

      const payload = {
        items: editForm.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          gstRate: Number(item.gstRate || 0),
        })),
        customerId: editForm.customerId || undefined,
        customerName: editForm.customerName,
        customerPhone: normalizePhone(editForm.customerPhone) || editForm.customerPhone,
        customerEmail: editForm.customerEmail,
        notes: editForm.notes,
        paymentMethod: editForm.paymentMethod,
        discountAmount: Number(editForm.discountAmount || 0),
        discountPercentage: Number(editForm.discountPercentage || 0),
        applyRoundOff: Boolean(editForm.applyRoundOff),
      };

      const response = await fetchApiJson(endpoint, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const message = response.message || 'Invoice updated successfully';
      closeEditModal();
      await fetchHistory(historyPage, historyQuery);
      setSuccessMessage(message);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to update invoice');
    } finally {
      setSavingEdit(false);
    }
  };

  const statusClass = (value: string) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'completed') return 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/20';
    if (normalized === 'returned') return 'bg-sky-400/10 text-sky-300 ring-sky-300/20';
    if (normalized === 'pending' || normalized === 'processing') return 'bg-amber-400/10 text-amber-300 ring-amber-300/20';
    return 'bg-red-400/10 text-red-300 ring-red-300/20';
  };

  const columns: Column<HistoryRow>[] = [
    {
      header: 'Invoice',
      sortValue: (row) => row.number,
      render: (row) => <span className="font-medium text-white">{row.number}</span>,
    },
    {
      header: 'Date',
      sortValue: (row) => new Date(row.createdAt).getTime(),
      render: (row) => new Date(row.createdAt).toLocaleString(),
    },
    {
      header: 'Customer',
      sortValue: (row) => row.customerName || 'Walk-in Customer',
      render: (row) => (
        <div>
          <p className="text-white">{row.customerName || 'Walk-in Customer'}</p>
          {row.customerPhone && <p className="text-xs text-gray-400">{row.customerPhone}</p>}
        </div>
      ),
    },
    {
      header: 'Items',
      sortValue: (row) => row.items?.length || 0,
      render: (row) => (
        <ul className="list-disc list-inside">
          {row.items.map((item, idx) => (
            <li key={`${row._id}-${idx}`} className="truncate max-w-xs">
              {item.quantity}x {item.name}
            </li>
          ))}
        </ul>
      ),
    },
    {
      header: 'Total',
      sortValue: (row) => Number(row.totalAmount || 0),
      render: (row) => <span className="font-bold text-white">{formatCurrency(row.totalAmount)}</span>,
    },
    {
      header: 'Payment',
      sortValue: (row) => row.paymentMethod || '',
      render: (row) => (
        <div className="space-y-1">
          <div className="capitalize">{row.paymentMethod}</div>
          {row.invoiceType && <div className="text-xs text-blue-300 uppercase">{row.invoiceType}</div>}
          {row.invoiceStatus && <div className="text-[11px] text-gray-500 uppercase">Invoice: {row.invoiceStatus}</div>}
          <div className="text-xs text-gray-400 capitalize">{row.paymentStatus}</div>
          {row.invoiceType === 'credit' && (
            <div className="text-xs text-amber-300">Outstanding: {formatCurrency(Number(row.outstandingAmount || 0))}</div>
          )}
        </div>
      ),
      className: 'capitalize',
    },
    {
      header: 'Status',
      sortValue: (row) => row.status || '',
      render: (row) => (
        <div className="space-y-1">
          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset capitalize ${statusClass(row.status)}`}>
            {row.status}
          </span>
          {row.source === 'orders' && (
            <div className="text-[11px] text-gray-400">
              Reserve: {row.reservationStatus || '-'} | Delivery: {row.deliveryStatus || '-'}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Action',
      sortable: false,
      render: (row) => {
        const canCreateReturn =
          row.source === 'sales'
          && row.invoiceStatus === 'posted'
          && Array.isArray(row.items)
          && row.items.some((item) => Boolean(item.productId) && Number(item.quantity || 0) > 0);

        if (row.source === 'orders') {
          const disabled = row.status === 'cancelled' || row.status === 'invoiced' || Boolean(orderActionId);
          const actionBusy = (action: string) => orderActionId === `${row._id}:${action}`;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                disabled={disabled || row.status === 'dispatched'}
                className="rounded-md bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void runOrderWorkflowAction(row, 'reserve')}
              >
                {actionBusy('reserve') ? 'Reserving...' : 'Reserve'}
              </button>
              <button
                type="button"
                disabled={disabled || !['reserved', 'partially_reserved', 'back_order'].includes(row.status)}
                className="rounded-md bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void runOrderWorkflowAction(row, 'delivery-challan')}
              >
                {actionBusy('delivery-challan') ? 'Creating...' : 'Challan'}
              </button>
              <button
                type="button"
                disabled={disabled || !['dispatched', 'partially_dispatched'].includes(row.status)}
                className="rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void runOrderWorkflowAction(row, 'invoice')}
              >
                {actionBusy('invoice') ? 'Invoicing...' : 'Invoice'}
              </button>
            </div>
          );
        }

        return row.source === 'sales' ? (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="rounded-md bg-indigo-500/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/30"
              onClick={() => openEditModal(row)}
            >
              Edit Invoice
            </button>
            <button
              type="button"
              disabled={printingSaleId === row._id}
              className="rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void printSaleInvoice(row._id)}
            >
              {printingSaleId === row._id ? 'Printing...' : 'Print'}
            </button>
            {row.invoiceStatus === 'draft' && (
              <button
                type="button"
                disabled={postingDraftId === row._id}
                className="rounded-md bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void postDraftInvoice(row)}
              >
                {postingDraftId === row._id ? 'Posting...' : 'Post Draft'}
              </button>
            )}
            <button
              type="button"
              disabled={!canCreateReturn}
              className="rounded-md bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => openReturnModal(row)}
            >
              Create Return
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-500">-</span>
        );
      },
    },
  ];

  if (loading) return <div className="p-8 text-center text-gray-400">Loading sales history...</div>;
  if (error) return <div className="mx-auto max-w-7xl px-4 py-6 text-red-500">Error: {error}</div>;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-2xl font-bold leading-7 text-white sm:text-3xl sm:tracking-tight">Sales History</h1>

        {successMessage && (
          <div className="mb-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {successMessage}
          </div>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice/customer/phone/email..."
          className="mb-4 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500"
        />
        <p className="mb-3 text-xs text-gray-400">Search works across all invoices with page-wise results.</p>
        <Table data={rows} columns={columns} emptyMessage="No sales history found" />
        {totalHistoryRows > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400">
            <span>
              Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}-{Math.min(historyPage * HISTORY_PAGE_SIZE, totalHistoryRows)} of {totalHistoryRows} invoices
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                disabled={historyPage <= 1 || loading}
                className="rounded border border-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Prev
              </button>
              <span className="text-gray-300">Page {historyPage} / {historyTotalPages}</span>
              <button
                type="button"
                onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
                disabled={historyPage >= historyTotalPages || loading}
                className="rounded border border-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-white/10 bg-gray-900 p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Edit Invoice {editingRow.number}</h2>
                <p className="text-xs text-gray-400">
                  Update from sales history. Stock and totals will be adjusted.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/20"
                onClick={closeEditModal}
              >
                Close
              </button>
            </div>

            {editError && (
              <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{editError}</div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                value={editForm.customerPhone}
                onChange={(e) => {
                  const value = e.target.value;
                  const changed = normalizePhone(value) !== normalizePhone(editForm.customerPhone);
                  setEditForm((prev) => ({
                    ...prev,
                    customerPhone: value,
                    customerId: changed ? '' : prev.customerId,
                  }));
                }}
                placeholder="Customer Phone (search first)"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
              <input
                value={editForm.customerName}
                onChange={(e) => setEditForm((prev) => ({ ...prev, customerName: e.target.value }))}
                placeholder="Customer Name"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
              <input
                value={editForm.customerEmail}
                onChange={(e) => setEditForm((prev) => ({ ...prev, customerEmail: e.target.value }))}
                placeholder="Customer Email"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
              <select
                value={editForm.paymentMethod}
                onChange={(e) => setEditForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                {['cash', 'card', 'upi', 'cheque', 'online', 'bank_transfer'].map((method) => (
                  <option key={method} value={method} className="bg-gray-900">
                    {method}
                  </option>
                ))}
              </select>
              <input
                value={editForm.discountAmount}
                onChange={(e) => setEditForm((prev) => ({ ...prev, discountAmount: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="Discount Amount"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
              <input
                value={editForm.discountPercentage}
                onChange={(e) => setEditForm((prev) => ({ ...prev, discountPercentage: e.target.value }))}
                type="number"
                min="0"
                step="0.01"
                placeholder="Discount Percentage"
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              />
            </div>
            {searchingCustomers && <p className="mt-1 text-xs text-gray-400">Searching customers...</p>}
            {!searchingCustomers && customerMatches.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-1">
                {customerMatches.map((customer) => (
                  <button
                    key={customer._id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-gray-200 hover:bg-white/10"
                  >
                    {customer.name} | {customer.phone || '-'} {customer.customerCode ? `(${customer.customerCode})` : ''}
                    {customer.source === 'member' && (
                      <span className="ml-1 text-indigo-200">[Member{customer.memberCode ? ` ${customer.memberCode}` : ''}]</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {!searchingCustomers && normalizePhone(editForm.customerPhone).length >= 10 && customerMatches.length === 0 && !editForm.customerId && !editForm.customerName.trim() && (
              <p className="mt-1 text-xs text-amber-300">No customer found. Saving will create/update customer from these details.</p>
            )}
            {!!editForm.customerId && (
              <p className="mt-1 text-xs text-emerald-300">Existing customer selected from database</p>
            )}

            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Invoice Notes"
              rows={2}
              className="mt-3 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
            />

            <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={editForm.applyRoundOff}
                onChange={(e) => setEditForm((prev) => ({ ...prev, applyRoundOff: e.target.checked }))}
              />
              Apply round-off
            </label>

            <div className="mt-4 rounded-lg border border-white/10">
              <div className="grid grid-cols-12 gap-2 border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-300">
                <div className="col-span-4">Item</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">Rate</div>
                <div className="col-span-2">GST %</div>
                <div className="col-span-2 text-right">Action</div>
              </div>

              {editForm.items.map((item, idx) => (
                <div key={`${item.productId}-${idx}`} className="grid grid-cols-12 gap-2 border-b border-white/10 px-3 py-2">
                  <div className="col-span-4">
                    <p className="text-sm text-white">{item.productName}</p>
                    <p className="text-[11px] text-gray-500">Max: {getMaxEditableQty(item.productId)}</p>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      max={Math.max(1, getMaxEditableQty(item.productId))}
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateEditItem(idx, 'quantity', e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateEditItem(idx, 'unitPrice', e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.gstRate}
                      onChange={(e) => updateEditItem(idx, 'gstRate', e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
                    />
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      type="button"
                      className="rounded-md bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                      onClick={() => removeEditItem(idx)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setAddProductId('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && productSuggestions.length > 0) {
                      e.preventDefault();
                      const first = productSuggestions[0];
                      setAddProductId(first._id);
                      setProductSearch(first.name);
                    }
                  }}
                  placeholder="Search product by name or SKU"
                  className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
                {productSuggestions.length > 0 && !addProductId && (
                  <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-white/10 bg-gray-950 shadow-xl">
                    {productSuggestions.map((product) => (
                      <button
                        key={product._id}
                        type="button"
                        onClick={() => {
                          setAddProductId(product._id);
                          setProductSearch(product.name);
                        }}
                        className="block w-full border-b border-white/5 px-3 py-2 text-left text-xs text-gray-200 hover:bg-white/10"
                      >
                        <div className="font-medium text-white">{product.name}</div>
                        <div className="text-[11px] text-gray-400">
                          {product.sku || product._id}{product.category ? ` | ${product.category}` : ''} | Stock: {Number(product.stock || 0)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                value={productCategoryFilter}
                onChange={(e) => {
                  setProductCategoryFilter(e.target.value);
                  setAddProductId('');
                }}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="" className="bg-gray-900">All categories (optional)</option>
                {productCategories.map((category) => (
                  <option key={category} value={category} className="bg-gray-900">
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={addProductId}
                onChange={(e) => setAddProductId(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="">Add product to invoice...</option>
                {addableProducts.map((product) => (
                  <option key={product._id} value={product._id} className="bg-gray-900">
                    {product.name} ({product.sku || product._id}){product.category ? ` - ${product.category}` : ''} | Stock: {Number(product.stock || 0)}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-400">{addableProducts.length} product(s) available</p>
              <div className="flex items-center gap-2">
                {hasMoreProducts && (
                  <button
                    type="button"
                    onClick={() => void fetchProducts(false)}
                    disabled={loadingMoreProducts}
                    className="rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMoreProducts ? 'Loading products...' : 'Load More Products'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={addProductToEdit}
                  disabled={!addProductId}
                  className="rounded-md bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add Item
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-gray-400">Subtotal</p>
                <p className="font-semibold text-white">{formatCurrency(editedTotals.subtotal)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">GST</p>
                <p className="font-semibold text-white">{formatCurrency(editedTotals.gst)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Round-off</p>
                <p className="font-semibold text-white">{formatCurrency(editedTotals.roundOff)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Grand Total</p>
                <p className="font-semibold text-emerald-300">{formatCurrency(editedTotals.total)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Paid So Far</p>
                <p className="font-semibold text-indigo-200">{formatCurrency(paidSoFar)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Projected Outstanding</p>
                <p className="font-semibold text-amber-300">{formatCurrency(projectedOutstanding)}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={printingSaleId === editingRow._id}
                className="rounded-md bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void printSaleInvoice(editingRow._id)}
              >
                {printingSaleId === editingRow._id ? 'Printing...' : 'Print Invoice'}
              </button>
              <button
                type="button"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
                onClick={closeEditModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
                onClick={saveInvoiceEdit}
              >
                {savingEdit ? 'Saving...' : 'Update Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {returnRow && (
        <ReturnModal
          open={Boolean(returnRow)}
          saleId={returnRow._id}
          saleNumber={returnRow.number}
          items={returnModalItems}
          token={localStorage.getItem('token') || ''}
          onClose={closeReturnModal}
        />
      )}
    </>
  );
};
