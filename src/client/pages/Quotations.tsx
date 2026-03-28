import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../config';
import { useProducts } from '../hooks/useProducts';
import { apiUrl, fetchApiJson } from '../utils/api';

interface QuoteItemFormRow {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

interface QuoteRow {
  _id: string;
  quoteNumber: string;
  quoteGroupCode: string;
  version: number;
  quoteStatus: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted';
  validUntil?: string;
  pricingMode?: 'retail' | 'wholesale' | 'customer';
  taxMode?: 'inclusive' | 'exclusive';
  isGstBill?: boolean;
  customerId?: string;
  customerCode?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  contactPerson?: string;
  contactRole?: string;
  notes?: string;
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  items: Array<{
    productId: string;
    productName: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    gstRate?: number;
  }>;
  approval?: {
    approvedByName?: string;
    approvedAt?: string;
  };
  convertedSaleNumber?: string;
}

interface CustomerOption {
  _id: string;
  customerCode?: string;
  memberCode?: string;
  name: string;
  phone?: string;
  email?: string;
  source?: 'customer' | 'member';
}

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);
const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';
const panelClass = 'rounded-xl border border-white/10 bg-white/5 p-4';
const buttonClass = 'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400';

const emptyForm = () => ({
  id: '',
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  contactPerson: '',
  contactRole: 'Billing',
  validUntil: '',
  quoteStatus: 'draft' as QuoteRow['quoteStatus'],
  pricingMode: 'retail' as 'retail' | 'wholesale' | 'customer',
  taxMode: 'exclusive' as 'inclusive' | 'exclusive',
  isGstBill: true,
  notes: '',
  items: [] as QuoteItemFormRow[],
});

export const Quotations: React.FC = () => {
  const {
    products,
    loading: loadingProducts,
    error: productLoadError,
    refetch: refetchProducts,
  } = useProducts();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [versions, setVersions] = useState<QuoteRow[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | QuoteRow['quoteStatus']>('all');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [approvalName, setApprovalName] = useState('');
  const [convertInvoiceType, setConvertInvoiceType] = useState<'cash' | 'credit'>('cash');

  const headers = useMemo(() => {
    const token = localStorage.getItem('token') || '';
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, []);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '100');
      const response = await fetchApiJson(apiUrl(`/api/quotes?${params.toString()}`), { headers });
      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [headers, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuotes();
    }, search.trim() ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadQuotes, search]);

  useEffect(() => {
    if (!form.customerPhone.trim()) {
      setCustomerMatches([]);
      return;
    }

    const phone = normalizePhone(form.customerPhone);
    if (phone.length < 4) {
      setCustomerMatches([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const token = localStorage.getItem('token') || '';
          const response = await fetchApiJson(apiUrl(`/api/customers/search-unified?q=${encodeURIComponent(phone)}`), {
            headers: { Authorization: `Bearer ${token}` },
          });
          setCustomerMatches(Array.isArray(response?.data) ? response.data : []);
        } catch {
          setCustomerMatches([]);
        }
      })();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [form.customerPhone]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products
      .filter((product) => !form.items.some((item) => String(item.productId) === String(product._id)))
      .filter((product) => {
        if (!q) return true;
        return String(product.name || '').toLowerCase().includes(q) || String(product.sku || '').toLowerCase().includes(q);
      })
      .slice(0, 30);
  }, [form.items, productSearch, products]);

  const subtotal = useMemo(
    () => form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
    [form.items]
  );
  const totalGst = useMemo(
    () =>
      form.isGstBill
        ? form.items.reduce((sum, item) => sum + ((Number(item.quantity || 0) * Number(item.unitPrice || 0)) * Number(item.gstRate || 0)) / 100, 0)
        : 0,
    [form.isGstBill, form.items]
  );
  const totalAmount = subtotal + totalGst;

  const resetForm = () => {
    setForm(emptyForm());
    setVersions([]);
    setApprovalName('');
    setSelectedProductId('');
    setProductSearch('');
    setCustomerMatches([]);
  };

  const loadVersions = async (quoteId: string) => {
    try {
      const response = await fetchApiJson(apiUrl(`/api/quotes/${quoteId}/versions`), { headers });
      setVersions(Array.isArray(response?.data) ? response.data : []);
    } catch {
      setVersions([]);
    }
  };

  const editQuote = async (quote: QuoteRow) => {
    setForm({
      id: quote._id,
      customerId: quote.customerId || '',
      customerName: quote.customerName || '',
      customerPhone: quote.customerPhone || '',
      customerEmail: quote.customerEmail || '',
      contactPerson: quote.contactPerson || '',
      contactRole: quote.contactRole || 'Billing',
      validUntil: quote.validUntil ? String(quote.validUntil).slice(0, 10) : '',
      quoteStatus: quote.quoteStatus,
      pricingMode: quote.pricingMode || 'retail',
      taxMode: quote.taxMode || 'exclusive',
      isGstBill: quote.isGstBill !== false,
      notes: quote.notes || '',
      items: (quote.items || []).map((item) => ({
        productId: String(item.productId),
        productName: item.productName,
        sku: item.sku,
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
        gstRate: Number(item.gstRate || 0),
      })),
    });
    setApprovalName(quote.approval?.approvedByName || '');
    setMessage('');
    setError('');
    await loadVersions(quote._id);
  };

  const addProduct = () => {
    const product = products.find((row) => String(row._id) === String(selectedProductId));
    if (!product) return;

    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          productId: product._id,
          productName: product.name,
          sku: product.sku,
          quantity: 1,
          unitPrice: Number(product.promotionalPrice || product.price || 0),
          gstRate: Number(product.gstRate || 0),
        },
      ],
    }));
    setSelectedProductId('');
    setProductSearch('');
  };

  const updateItem = (index: number, field: keyof QuoteItemFormRow, value: string) => {
    setForm((prev) => {
      const nextItems = [...prev.items];
      const current = { ...nextItems[index] };
      if (field === 'productName' || field === 'sku') {
        (current as any)[field] = value;
      } else {
        (current as any)[field] = field === 'quantity' ? Math.max(1, Number(value || 1)) : Number(value || 0);
      }
      nextItems[index] = current;
      return { ...prev, items: nextItems };
    });
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, idx) => idx !== index) }));
  };

  const selectCustomer = (customer: CustomerOption) => {
    setForm((prev) => ({
      ...prev,
      customerId: customer.source === 'customer' ? customer._id : '',
      customerName: customer.name || prev.customerName,
      customerPhone: customer.phone || prev.customerPhone,
      customerEmail: customer.email || prev.customerEmail,
    }));
    setCustomerMatches([]);
  };

  const saveQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.items.length) {
      setError('Add at least one item to the quotation');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        customerId: form.customerId || undefined,
        customerName: form.customerName,
        customerPhone: normalizePhone(form.customerPhone) || form.customerPhone,
        customerEmail: form.customerEmail,
        contactPerson: form.contactPerson,
        contactRole: form.contactRole,
        validUntil: form.validUntil || undefined,
        quoteStatus: form.quoteStatus,
        pricingMode: form.pricingMode,
        taxMode: form.taxMode,
        isGstBill: form.isGstBill,
        notes: form.notes,
        items: form.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          gstRate: Number(item.gstRate || 0),
        })),
      };

      const endpoint = form.id ? apiUrl(`/api/quotes/${form.id}`) : apiUrl('/api/quotes');
      const method = form.id ? 'PUT' : 'POST';
      const response = await fetchApiJson(endpoint, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      setMessage(response?.message || (form.id ? 'Quotation updated' : 'Quotation created'));
      resetForm();
      await loadQuotes();
    } catch (saveError: any) {
      setError(saveError?.message || 'Failed to save quotation');
    } finally {
      setSaving(false);
    }
  };

  const reviseQuote = async (quoteId: string) => {
    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/quotes/${quoteId}/revise`), {
        method: 'POST',
        headers,
      });
      setMessage(response?.message || 'Quotation revision created');
      await loadQuotes();
      if (response?.data?._id) {
        await editQuote(response.data as QuoteRow);
      }
    } catch (reviseError: any) {
      setError(reviseError?.message || 'Failed to revise quotation');
    }
  };

  const approveQuote = async () => {
    if (!form.id) return;
    if (!approvalName.trim()) {
      setError('Approved by name is required for digital approval');
      return;
    }
    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/quotes/${form.id}/approve`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ approvedByName: approvalName.trim(), method: 'digital' }),
      });
      setMessage(response?.message || 'Quotation approved');
      await loadQuotes();
      const refreshed = response?.data as QuoteRow | undefined;
      if (refreshed?._id) {
        await editQuote(refreshed);
      }
    } catch (approveError: any) {
      setError(approveError?.message || 'Failed to approve quotation');
    }
  };

  const convertQuote = async (quoteId: string) => {
    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/quotes/${quoteId}/convert`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ invoiceType: convertInvoiceType }),
      });
      const saleNumber = response?.data?.sale?.invoiceNumber || response?.data?.sale?.saleNumber;
      setMessage(`Quotation converted to draft invoice ${saleNumber}. Open Sales History to edit/post it.`);
      await loadQuotes();
      if (form.id === quoteId) {
        resetForm();
      }
    } catch (convertError: any) {
      setError(convertError?.message || 'Failed to convert quotation');
    }
  };

  const deleteQuote = async (quoteId: string) => {
    if (!window.confirm('Delete this quotation?')) return;
    try {
      setError('');
      setMessage('');
      const response = await fetchApiJson(apiUrl(`/api/quotes/${quoteId}`), {
        method: 'DELETE',
        headers,
      });
      setMessage(response?.message || 'Quotation deleted');
      if (form.id === quoteId) resetForm();
      await loadQuotes();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Failed to delete quotation');
    }
  };

  const statusClass = (status: QuoteRow['quoteStatus']) => {
    if (status === 'approved') return 'bg-emerald-500/20 text-emerald-200';
    if (status === 'converted') return 'bg-cyan-500/20 text-cyan-200';
    if (status === 'sent') return 'bg-indigo-500/20 text-indigo-200';
    if (status === 'rejected' || status === 'expired') return 'bg-rose-500/20 text-rose-200';
    return 'bg-amber-500/20 text-amber-200';
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Quotations</h1>
          <p className="text-sm text-gray-300">Create quotes, track revisions, capture digital approvals, and convert approved quotes into draft invoices.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote/customer/contact..."
            className={`${inputClass} md:w-72`}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="all" className="bg-gray-900">All status</option>
            {['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'].map((status) => (
              <option key={status} value={status} className="bg-gray-900">
                {status}
              </option>
            ))}
          </select>
          <button onClick={() => void loadQuotes()} className={buttonClass}>Refresh</button>
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <form onSubmit={saveQuote} className={`${panelClass} space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">{form.id ? 'Edit Quotation' : 'Create Quotation'}</h2>
              <p className="text-xs text-gray-400">Offline quote workflow with version history and draft invoice conversion.</p>
            </div>
            {form.id && (
              <button type="button" onClick={resetForm} className="rounded-md border border-white/20 px-3 py-2 text-sm text-gray-200">
                New Quote
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={form.customerPhone}
              onChange={(e) => setForm((prev) => ({ ...prev, customerPhone: e.target.value, customerId: '' }))}
              placeholder="Customer phone"
              className={inputClass}
            />
            <input
              value={form.customerName}
              onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
              placeholder="Customer name"
              className={inputClass}
            />
            <input
              value={form.customerEmail}
              onChange={(e) => setForm((prev) => ({ ...prev, customerEmail: e.target.value }))}
              placeholder="Customer email"
              className={inputClass}
            />
            <input
              value={form.contactPerson}
              onChange={(e) => setForm((prev) => ({ ...prev, contactPerson: e.target.value }))}
              placeholder="Contact person"
              className={inputClass}
            />
            <select
              value={form.contactRole}
              onChange={(e) => setForm((prev) => ({ ...prev, contactRole: e.target.value }))}
              className={inputClass}
            >
              {['Billing', 'Operational', 'C-Level', 'Procurement', 'General'].map((role) => (
                <option key={role} value={role} className="bg-gray-900">
                  {role}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm((prev) => ({ ...prev, validUntil: e.target.value }))}
              className={inputClass}
            />
          </div>

          {customerMatches.length > 0 && (
            <div className="rounded border border-white/10 bg-black/20 p-2">
              <p className="mb-1 text-xs text-gray-400">Matched customers</p>
              <div className="space-y-1">
                {customerMatches.map((customer) => (
                  <button
                    key={customer._id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="block w-full rounded px-2 py-1 text-left text-xs text-gray-200 hover:bg-white/10"
                  >
                    {customer.name} | {customer.phone || '-'} {customer.customerCode ? `(${customer.customerCode})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <select
              value={form.pricingMode}
              onChange={(e) => setForm((prev) => ({ ...prev, pricingMode: e.target.value as any }))}
              className={inputClass}
            >
              <option value="retail" className="bg-gray-900">Retail pricing</option>
              <option value="wholesale" className="bg-gray-900">Wholesale pricing</option>
              <option value="customer" className="bg-gray-900">Customer pricing</option>
            </select>
            <select
              value={form.quoteStatus}
              onChange={(e) => setForm((prev) => ({ ...prev, quoteStatus: e.target.value as any }))}
              className={inputClass}
            >
              {['draft', 'sent', 'approved', 'rejected', 'expired'].map((status) => (
                <option key={status} value={status} className="bg-gray-900">
                  {status}
                </option>
              ))}
            </select>
            <select
              value={form.taxMode}
              onChange={(e) => setForm((prev) => ({ ...prev, taxMode: e.target.value as any }))}
              className={inputClass}
            >
              <option value="exclusive" className="bg-gray-900">Tax exclusive</option>
              <option value="inclusive" className="bg-gray-900">Tax inclusive</option>
            </select>
            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={form.isGstBill}
                onChange={(e) => setForm((prev) => ({ ...prev, isGstBill: e.target.checked }))}
              />
              GST quote
            </label>
          </div>

          <textarea
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Quote notes, terms, delivery details..."
            rows={3}
            className={`${inputClass} min-h-[84px]`}
          />

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Quote Items</p>
              <div className="flex flex-wrap gap-2">
                <input
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setSelectedProductId('');
                  }}
                  placeholder="Search product..."
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                />
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                >
                  <option value="">Select product</option>
                  {filteredProducts.map((product) => (
                    <option key={product._id} value={product._id} className="bg-gray-900">
                      {product.name} ({product.sku}) {product.itemType ? `| ${product.itemType}` : ''}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={addProduct} disabled={!selectedProductId} className="rounded-md bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50">
                  Add Item
                </button>
              </div>
            </div>

            {loadingProducts && <p className="text-xs text-gray-400">Loading products...</p>}
            {!loadingProducts && productLoadError && (
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                <span>Product catalog failed to load: {productLoadError}</span>
                <button
                  type="button"
                  onClick={() => void refetchProducts()}
                  className="rounded bg-rose-500/20 px-2 py-1 font-semibold text-rose-100 hover:bg-rose-500/30"
                >
                  Retry
                </button>
              </div>
            )}
            {!loadingProducts && !productLoadError && (
              <p className="mb-2 text-xs text-emerald-200">
                {products.length} products ready for quotation.
              </p>
            )}
            {!loadingProducts && !productLoadError && !filteredProducts.length && (
              <p className="mb-2 text-xs text-gray-400">
                {products.length === 0
                  ? 'No products are available in the catalog yet.'
                  : productSearch.trim()
                    ? 'No products match this search.'
                    : 'All loaded products are already added to this quotation.'}
              </p>
            )}
            <div className="space-y-2">
              {form.items.map((item, index) => (
                <div key={`${item.productId}-${index}`} className="grid grid-cols-12 gap-2 rounded border border-white/10 bg-white/5 p-2">
                  <div className="col-span-12 md:col-span-4">
                    <p className="text-sm text-white">{item.productName}</p>
                    <p className="text-[11px] text-gray-400">{item.sku || item.productId}</p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    className="col-span-4 md:col-span-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                    className="col-span-4 md:col-span-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.gstRate}
                    onChange={(e) => updateItem(index, 'gstRate', e.target.value)}
                    className="col-span-2 md:col-span-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm text-white"
                  />
                  <div className="col-span-2 flex items-center justify-end">
                    <button type="button" onClick={() => removeItem(index)} className="rounded-md bg-rose-500/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/30">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {!form.items.length && <p className="text-sm text-gray-400">No items added yet.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Subtotal</p>
              <p className="text-lg font-semibold text-white">{formatCurrency(subtotal)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">GST</p>
              <p className="text-lg font-semibold text-cyan-200">{formatCurrency(totalGst)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-lg font-semibold text-emerald-300">{formatCurrency(totalAmount)}</p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-gray-400">Invoice Convert</p>
              <div className="mt-2 flex gap-2">
                <select
                  value={convertInvoiceType}
                  onChange={(e) => setConvertInvoiceType(e.target.value as 'cash' | 'credit')}
                  className="w-full rounded-md border border-white/10 bg-white/5 px-2 py-2 text-xs text-white"
                >
                  <option value="cash" className="bg-gray-900">Cash</option>
                  <option value="credit" className="bg-gray-900">Credit</option>
                </select>
                <button
                  type="button"
                  onClick={() => form.id && void convertQuote(form.id)}
                  disabled={!form.id}
                  className="rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400 disabled:opacity-50"
                >
                  Convert
                </button>
              </div>
            </div>
          </div>

          {form.id && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={approvalName}
                onChange={(e) => setApprovalName(e.target.value)}
                placeholder="Approver name for digital sign-off"
                className={inputClass}
              />
              <button type="button" onClick={() => void approveQuote()} className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
                Approve Digitally
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button disabled={saving} className={buttonClass}>
              {saving ? 'Saving...' : form.id ? 'Update Quotation' : 'Create Quotation'}
            </button>
            {form.id && (
              <button type="button" onClick={() => void reviseQuote(form.id)} className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-400">
                Create Revision
              </button>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <div className={panelClass}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Quotation Register</h2>
              {loading && <span className="text-xs text-gray-400">Loading...</span>}
              {!loading && <span className="text-xs text-gray-400">{rows.length} loaded</span>}
            </div>
            <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => (
                <div key={row._id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{row.quoteNumber} <span className="text-xs text-gray-400">v{row.version}</span></p>
                      <p className="text-xs text-gray-400">{row.customerName || 'Walk-in Customer'} {row.contactPerson ? `| ${row.contactPerson}` : ''}</p>
                      <p className="text-xs text-gray-500">{row.validUntil ? `Valid until ${String(row.validUntil).slice(0, 10)}` : 'No expiry date'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${statusClass(row.quoteStatus)}`}>
                      {row.quoteStatus}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-gray-300">{row.items?.length || 0} items</span>
                    <span className="font-semibold text-emerald-300">{formatCurrency(Number(row.totalAmount || 0))}</span>
                  </div>
                  {row.approval?.approvedByName && (
                    <p className="mt-1 text-[11px] text-emerald-200">
                      Approved by {row.approval.approvedByName}{row.approval.approvedAt ? ` on ${String(row.approval.approvedAt).slice(0, 10)}` : ''}
                    </p>
                  )}
                  {row.convertedSaleNumber && (
                    <p className="mt-1 text-[11px] text-cyan-200">Converted to {row.convertedSaleNumber}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => void editQuote(row)} className="rounded bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200">Edit</button>
                    <button type="button" onClick={() => void reviseQuote(row._id)} className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-200">Revise</button>
                    <button type="button" onClick={() => void convertQuote(row._id)} disabled={row.quoteStatus === 'converted'} className="rounded bg-cyan-500/20 px-2 py-1 text-xs text-cyan-200 disabled:opacity-50">Convert</button>
                    <button type="button" onClick={() => void deleteQuote(row._id)} disabled={row.quoteStatus === 'converted'} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200 disabled:opacity-50">Delete</button>
                  </div>
                </div>
              ))}
              {!rows.length && !loading && <p className="text-sm text-gray-400">No quotations found for this filter.</p>}
            </div>
          </div>

          <div className={panelClass}>
            <h2 className="mb-2 text-lg font-semibold text-white">Version History</h2>
            <div className="space-y-2">
              {versions.map((row) => (
                <button
                  key={row._id}
                  type="button"
                  onClick={() => void editQuote(row)}
                  className="block w-full rounded border border-white/10 bg-black/20 px-3 py-2 text-left hover:bg-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{row.quoteNumber} v{row.version}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${statusClass(row.quoteStatus)}`}>
                      {row.quoteStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{formatCurrency(Number(row.totalAmount || 0))}</p>
                </button>
              ))}
              {!versions.length && <p className="text-sm text-gray-400">Select a quotation to see its revision chain.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
