import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FloatingField } from '../components/FloatingField';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { formatCurrency } from '../config';
import { useProducts } from '../hooks/useProducts';
import { apiUrl, fetchApiJson } from '../utils/api';
import { consumeCrmConversionDraft } from '../utils/crmDrafts';
import { showConfirmDialog } from '../utils/appDialogs';

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
  createdAt?: string;
  updatedAt?: string;
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

type QuoteSortField = 'updatedAt' | 'createdAt' | 'validUntil' | 'totalAmount' | 'customerName' | 'quoteNumber' | 'quoteStatus';

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);
const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500';
const panelClass = 'rounded-xl border border-white/10 bg-white/5 p-4';
const buttonClass = 'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400';
const secondaryButtonClass = 'rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10';
const contactRoleOptions = ['Billing', 'Operational', 'C-Level', 'Procurement', 'General'].map((role) => ({ value: role, label: role }));
const pricingModeOptions = [
  { value: 'retail', label: 'Retail pricing' },
  { value: 'wholesale', label: 'Wholesale pricing' },
  { value: 'customer', label: 'Customer pricing' },
];
const quoteStatusOptions = ['draft', 'sent', 'approved', 'rejected', 'expired'].map((status) => ({
  value: status,
  label: status.replace(/\b\w/g, (char) => char.toUpperCase()),
}));
const taxModeOptions = [
  { value: 'exclusive', label: 'Tax exclusive' },
  { value: 'inclusive', label: 'Tax inclusive' },
];
const convertInvoiceTypeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit', label: 'Credit' },
];
const sortOptions: Array<{ value: QuoteSortField; label: string }> = [
  { value: 'updatedAt', label: 'Last updated' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'validUntil', label: 'Expiry date' },
  { value: 'totalAmount', label: 'Quote amount' },
  { value: 'customerName', label: 'Customer name' },
  { value: 'quoteNumber', label: 'Quote number' },
  { value: 'quoteStatus', label: 'Quote status' },
];
const pageSizeOptions = [12, 24, 48, 100];

const formatShortDate = (value?: string) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const formatShortDateTime = (value?: string) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const isExpiringSoon = (value?: string, withinDays = 7) => {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  const now = new Date();
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= withinDays;
};

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
  const [sortBy, setSortBy] = useState<QuoteSortField>('updatedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [totalRows, setTotalRows] = useState(0);
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

  useEffect(() => {
    const draft = consumeCrmConversionDraft('sales-quotation');
    if (!draft) return;
    setForm((prev) => ({
      ...prev,
      customerId: draft.customerId || '',
      customerName: draft.customerName || prev.customerName,
      customerPhone: draft.customerPhone || prev.customerPhone,
      customerEmail: draft.customerEmail || prev.customerEmail,
      notes: [prev.notes, draft.notes].filter(Boolean).join('\n').trim(),
    }));
    setMessage(`CRM enquiry ${draft.enquiryNumber || ''} loaded into sales quotation.`);
  }, []);

  const loadQuotes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('skip', String(Math.max(0, (page - 1) * pageSize)));
      params.set('limit', String(pageSize));
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      const response = await fetchApiJson(apiUrl(`/api/quotes?${params.toString()}`), { headers });
      setRows(Array.isArray(response?.data) ? response.data : []);
      setTotalRows(Math.max(0, Number(response?.pagination?.total || 0)));
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [headers, page, pageSize, search, sortBy, sortDir, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuotes();
    }, search.trim() ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadQuotes, search]);

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
  const pageValue = useMemo(() => rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0), [rows]);
  const approvedOnPage = useMemo(() => rows.filter((row) => row.quoteStatus === 'approved').length, [rows]);
  const convertedOnPage = useMemo(() => rows.filter((row) => row.quoteStatus === 'converted').length, [rows]);
  const expiringSoonOnPage = useMemo(
    () => rows.filter((row) => row.quoteStatus !== 'converted' && isExpiringSoon(row.validUntil)).length,
    [rows]
  );
  const pageStart = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = totalRows === 0 ? 0 : Math.min(totalRows, page * pageSize);

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
      setPage(1);
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
      setPage(1);
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
    if (!(await showConfirmDialog('Delete this quotation?', { title: 'Delete Quotation', confirmText: 'Delete' }))) return;
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
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8 2xl:px-10">
      <div className="mx-auto w-full max-w-[1800px] space-y-6">
        <div className={`${panelClass} bg-gradient-to-br from-slate-900/95 via-indigo-950/30 to-slate-900/95`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Sales Quotations</p>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Quotation Desk</h1>
              <p className="mt-3 text-sm text-gray-300 sm:text-base">
                Create quotations first, then work the register below with sorting, paging, revisions, approvals, and invoice conversion.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ManualHelpLink anchor="transaction-quotation" />
              <button type="button" onClick={() => void loadQuotes()} className={secondaryButtonClass}>
                Refresh Register
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">Register Total</p>
              <p className="mt-2 text-2xl font-semibold text-white">{totalRows}</p>
              <p className="mt-1 text-xs text-cyan-100/70">Across the active search and status filter.</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/80">Page Value</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(pageValue)}</p>
              <p className="mt-1 text-xs text-emerald-100/70">Value of quotations visible on this page.</p>
            </div>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-100/80">Expiring Soon</p>
              <p className="mt-2 text-2xl font-semibold text-white">{expiringSoonOnPage}</p>
              <p className="mt-1 text-xs text-amber-100/70">Quotes expiring within the next 7 days.</p>
            </div>
            <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-indigo-100/80">Approved / Converted</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {approvedOnPage} / {convertedOnPage}
              </p>
              <p className="mt-1 text-xs text-indigo-100/70">Current page snapshot for follow-up and billing.</p>
            </div>
          </div>
        </div>

        {message && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}
        {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="space-y-6">
        <form onSubmit={saveQuote} className={`${panelClass} space-y-5`}>
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">{form.id ? 'Edit Quotation' : 'Create Quotation'}</h2>
              <p className="mt-1 text-sm text-gray-400">The register is now below this section, so the top area stays focused on quote creation.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {form.id && (
                <button type="button" onClick={resetForm} className={secondaryButtonClass}>
                  New Quote
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <FloatingField
              label="Customer Phone"
              value={form.customerPhone}
              onChange={(value) => setForm((prev) => ({ ...prev, customerPhone: value, customerId: '' }))}
            />
            <FloatingField
              label="Customer Name"
              value={form.customerName}
              onChange={(value) => setForm((prev) => ({ ...prev, customerName: value }))}
            />
            <FloatingField
              label="Customer Email"
              type="email"
              value={form.customerEmail}
              onChange={(value) => setForm((prev) => ({ ...prev, customerEmail: value }))}
            />
            <FloatingField
              label="Contact Person"
              value={form.contactPerson}
              onChange={(value) => setForm((prev) => ({ ...prev, contactPerson: value }))}
            />
            <FloatingField
              label="Contact Role"
              value={form.contactRole}
              onChange={(value) => setForm((prev) => ({ ...prev, contactRole: value }))}
              options={contactRoleOptions}
            />
            <FloatingField
              label="Valid Until"
              type="date"
              value={form.validUntil}
              onChange={(value) => setForm((prev) => ({ ...prev, validUntil: value }))}
            />
          </div>

          {customerMatches.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-xs uppercase tracking-[0.24em] text-gray-400">Matched Customers</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {customerMatches.map((customer) => (
                  <button
                    key={customer._id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-gray-200 hover:bg-white/10"
                  >
                    <div className="font-semibold text-white">{customer.name}</div>
                    <div className="mt-1 text-gray-400">
                      {customer.phone || '-'} {customer.customerCode ? `• ${customer.customerCode}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FloatingField
              label="Pricing Mode"
              value={form.pricingMode}
              onChange={(value) => setForm((prev) => ({ ...prev, pricingMode: value as any }))}
              options={pricingModeOptions}
            />
            <FloatingField
              label="Quote Status"
              value={form.quoteStatus}
              onChange={(value) => setForm((prev) => ({ ...prev, quoteStatus: value as any }))}
              options={quoteStatusOptions}
            />
            <FloatingField
              label="Tax Mode"
              value={form.taxMode}
              onChange={(value) => setForm((prev) => ({ ...prev, taxMode: value as any }))}
              options={taxModeOptions}
            />
            <label className="flex min-h-[54px] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={form.isGstBill}
                onChange={(e) => setForm((prev) => ({ ...prev, isGstBill: e.target.checked }))}
              />
              GST quote
            </label>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-white">Quote Notes / Terms / Delivery Details</p>
            <p className="mt-1 text-xs text-gray-400">Use this area for delivery promises, payment terms, approvals, or team-sale remarks.</p>
            <FloatingField
              label="Notes"
              rows={5}
              value={form.notes}
              onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))}
              className="mt-4 min-h-[130px]"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <p className="text-sm font-semibold text-white">Quote Items</p>
              <div className="grid min-w-[280px] flex-1 gap-2 md:grid-cols-[1fr_1.2fr_auto] xl:min-w-[760px]">
                <FloatingField
                  label="Search Product"
                  value={productSearch}
                  onChange={(value) => {
                    setProductSearch(value);
                    setSelectedProductId('');
                  }}
                  inputClassName="text-xs"
                />
                <FloatingField
                  label="Select Product"
                  value={selectedProductId}
                  onChange={setSelectedProductId}
                  options={[
                    { value: '', label: 'Select product' },
                    ...filteredProducts.map((product) => ({
                      value: String(product._id),
                      label: `${product.name} (${product.sku})${product.itemType ? ` | ${product.itemType}` : ''}`,
                    })),
                  ]}
                  inputClassName="text-xs"
                />
                <button type="button" onClick={addProduct} disabled={!selectedProductId} className="rounded-xl bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50">
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
                <div key={`${item.productId}-${index}`} className="grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 xl:grid-cols-[1.5fr_0.6fr_0.7fr_0.6fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.productName}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{item.sku || item.productId}</p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    className={inputClass}
                    placeholder="Qty"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                    className={inputClass}
                    placeholder="Rate"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.gstRate}
                    onChange={(e) => updateItem(index, 'gstRate', e.target.value)}
                    className={inputClass}
                    placeholder="GST %"
                  />
                  <div className="flex items-center justify-end">
                    <button type="button" onClick={() => removeItem(index)} className="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {!form.items.length && <p className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-gray-400">No items added yet.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Subtotal</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(subtotal)}</p>
            </div>
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/80">GST</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-100">{formatCurrency(totalGst)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/80">Total</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-100">{formatCurrency(totalAmount)}</p>
            </div>
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-indigo-100/80">Invoice Convert</p>
              <div className="mt-2 flex gap-2">
                <FloatingField
                  label="Invoice Type"
                  value={convertInvoiceType}
                  onChange={(value) => setConvertInvoiceType(value as 'cash' | 'credit')}
                  options={convertInvoiceTypeOptions}
                  className="w-full"
                  inputClassName="text-xs"
                />
                <button
                  type="button"
                  onClick={() => form.id && void convertQuote(form.id)}
                  disabled={!form.id}
                  className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400 disabled:opacity-50"
                >
                  Convert
                </button>
              </div>
            </div>
          </div>

          {form.id && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_auto]">
              <FloatingField label="Approver Name For Digital Sign-Off" value={approvalName} onChange={setApprovalName} />
              <button type="button" onClick={() => void approveQuote()} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
                Approve Digitally
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
            <button disabled={saving} className={buttonClass}>
              {saving ? 'Saving...' : form.id ? 'Update Quotation' : 'Create Quotation'}
            </button>
            {form.id && (
              <button type="button" onClick={() => void reviseQuote(form.id)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400">
                Create Revision
              </button>
            )}
            {form.id && (
              <button type="button" onClick={resetForm} className={secondaryButtonClass}>
                Clear Form
              </button>
            )}
          </div>
        </form>

        <div className="space-y-6">
          <div className={panelClass}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Quotation Register</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Built for larger lists with paging, sorting, and a wider 3-4 column card layout. Showing {pageStart}-{pageEnd} of {totalRows}.
                </p>
              </div>
              <div className="text-xs text-gray-400">{loading ? 'Loading quotations...' : `${rows.length} quotation${rows.length === 1 ? '' : 's'} on this page`}</div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search quote, customer, phone, email..."
                className={inputClass}
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setPage(1);
                }}
                className={secondaryButtonClass}
              >
                <option value="all" className="bg-gray-900">All status</option>
                {['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'].map((status) => (
                  <option key={status} value={status} className="bg-gray-900">
                    {status.replace(/\b\w/g, (char) => char.toUpperCase())}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as QuoteSortField);
                  setPage(1);
                }}
                className={secondaryButtonClass}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-gray-900">
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={sortDir}
                onChange={(e) => {
                  setSortDir(e.target.value as 'asc' | 'desc');
                  setPage(1);
                }}
                className={secondaryButtonClass}
              >
                <option value="desc" className="bg-gray-900">Descending</option>
                <option value="asc" className="bg-gray-900">Ascending</option>
              </select>
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value || 12));
                  setPage(1);
                }}
                className={secondaryButtonClass}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size} className="bg-gray-900">
                    {size} per page
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void loadQuotes()} className={secondaryButtonClass}>
                Refresh
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Current Page</p>
                <p className="mt-2 text-2xl font-semibold text-white">{page}</p>
                <p className="mt-1 text-xs text-gray-400">Page {page} of {totalPages}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Page Value</p>
                <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(pageValue)}</p>
                <p className="mt-1 text-xs text-gray-400">Visible quotations total.</p>
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-100/80">Expiring Soon</p>
                <p className="mt-2 text-2xl font-semibold text-white">{expiringSoonOnPage}</p>
                <p className="mt-1 text-xs text-amber-100/70">Near-expiry quotes on this page.</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-100/80">Approved / Converted</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {approvedOnPage} / {convertedOnPage}
                </p>
                <p className="mt-1 text-xs text-emerald-100/70">Operational page snapshot.</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((row) => {
                const isSelected = form.id === row._id;
                const isLocked = row.quoteStatus === 'converted';
                return (
                  <div
                    key={row._id}
                    className={`rounded-2xl border p-4 transition ${
                      isSelected
                        ? 'border-cyan-400/40 bg-cyan-500/10 shadow-[0_14px_36px_rgba(34,211,238,0.12)]'
                        : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {row.quoteNumber} <span className="text-xs text-gray-400">v{row.version}</span>
                        </p>
                        <p className="mt-1 text-xs text-gray-400">{row.customerName || 'Walk-in Customer'}{row.contactPerson ? ` • ${row.contactPerson}` : ''}</p>
                        <p className="mt-1 text-[11px] text-gray-500">Updated {formatShortDateTime(row.updatedAt)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${statusClass(row.quoteStatus)}`}>
                        {row.quoteStatus}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-gray-400">Amount</p>
                        <p className="mt-1 font-semibold text-emerald-300">{formatCurrency(Number(row.totalAmount || 0))}</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-gray-400">Items</p>
                        <p className="mt-1 font-semibold text-white">{row.items?.length || 0}</p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1 text-xs text-gray-300">
                      <p>{row.customerPhone ? `Phone: ${row.customerPhone}` : 'Phone: Not captured'}</p>
                      <p className={isExpiringSoon(row.validUntil) ? 'text-amber-200' : 'text-gray-400'}>
                        {row.validUntil ? `Valid until ${formatShortDate(row.validUntil)}` : 'No validity date'}
                      </p>
                      <p className="text-gray-400">
                        {row.pricingMode || 'retail'} pricing • {row.taxMode || 'exclusive'} tax • {row.isGstBill === false ? 'Non-GST' : 'GST'}
                      </p>
                    </div>

                    {row.approval?.approvedByName && (
                      <p className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                        Approved by {row.approval.approvedByName}{row.approval.approvedAt ? ` on ${formatShortDate(row.approval.approvedAt)}` : ''}
                      </p>
                    )}
                    {row.convertedSaleNumber && (
                      <p className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100">
                        Converted to {row.convertedSaleNumber}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void editQuote(row)} className="rounded-xl bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-100 hover:bg-indigo-500/30">Edit</button>
                      <button type="button" onClick={() => void reviseQuote(row._id)} className="rounded-xl bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/30">Revise</button>
                      <button type="button" onClick={() => void convertQuote(row._id)} disabled={isLocked} className="rounded-xl bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50">Convert</button>
                      <button type="button" onClick={() => void deleteQuote(row._id)} disabled={isLocked} className="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-50">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {!rows.length && !loading && <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-8 text-center text-sm text-gray-400">No quotations found for this filter.</div>}

            <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-gray-400">
                Showing <span className="font-semibold text-white">{pageStart}</span> to <span className="font-semibold text-white">{pageEnd}</span> of <span className="font-semibold text-white">{totalRows}</span> quotations
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1} className={secondaryButtonClass}>
                  Previous
                </button>
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-gray-200">
                  Page {page} / {totalPages}
                </div>
                <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={page >= totalPages} className={secondaryButtonClass}>
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className={panelClass}>
            <h2 className="mb-2 text-lg font-semibold text-white">Version History</h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {versions.map((row) => (
                <button
                  key={row._id}
                  type="button"
                  onClick={() => void editQuote(row)}
                  className="block w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left hover:bg-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{row.quoteNumber} v{row.version}</span>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase ${statusClass(row.quoteStatus)}`}>
                      {row.quoteStatus}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">{formatCurrency(Number(row.totalAmount || 0))}</p>
                  <p className="mt-1 text-[11px] text-gray-500">Updated {formatShortDateTime(row.updatedAt)}</p>
                </button>
              ))}
              {!versions.length && <p className="text-sm text-gray-400">Select a quotation to see its revision chain.</p>}
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
