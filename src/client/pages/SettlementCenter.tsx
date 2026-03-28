import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

interface ReceiptRow {
  _id: string;
  voucherNumber: string;
  customerId?: string;
  customerName?: string;
  entryDate: string;
  amount: number;
  unappliedAmount: number;
  mode: string;
  isAdvance: boolean;
  allocations?: Array<{ saleId?: string; saleNumber?: string; amount: number }>;
}

interface CreditNoteRow {
  _id: string;
  noteNumber: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  sourceSaleId?: string;
  reason: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  balanceAmount: number;
  status: string;
  entries?: Array<{ type: string; amount: number; paymentMethod?: string; referenceSaleId?: string; note?: string; createdAt?: string }>;
  createdAt?: string;
}

interface OutstandingSaleRow {
  _id: string;
  invoiceNumber?: string;
  saleNumber?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  outstandingAmount: number;
  dueDate?: string;
}

interface DailyCollectionSummary {
  cashSalesTotal: number;
  cashReceiptTotal: number;
  cashExpenseTotal: number;
  netCashCollection: number;
}

interface UserCollectionRow {
  userId?: string;
  invoices: number;
  salesTotal: number;
  receipts: number;
  receiptTotal: number;
}

interface DayEndRow {
  businessDate: string;
  openingCash: number;
  cashSales: number;
  cashReceipts: number;
  cashExpenses: number;
  systemClosingCash: number;
  physicalClosingCash: number;
  variance: number;
  notes?: string;
}

type TabKey = 'receipts' | 'credit' | 'dayEnd';

const getHeaders = (json = true): HeadersInit => {
  const token = localStorage.getItem('token') || '';
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
};

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('en-IN');
};

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

export const SettlementCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('receipts');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [rangeStart, setRangeStart] = useState(firstOfMonth);
  const [rangeEnd, setRangeEnd] = useState(today);
  const [businessDate, setBusinessDate] = useState(today);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [outstandingRows, setOutstandingRows] = useState<OutstandingSaleRow[]>([]);
  const [outstandingError, setOutstandingError] = useState('');
  const [dailySummary, setDailySummary] = useState<DailyCollectionSummary | null>(null);
  const [userCollections, setUserCollections] = useState<UserCollectionRow[]>([]);
  const [dayEndReport, setDayEndReport] = useState<DayEndRow | null>(null);
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState('');
  const [receiptForm, setReceiptForm] = useState({
    customerName: '',
    amount: '',
    mode: 'cash',
    notes: '',
    isAdvance: false,
  });
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});
  const [creditForm, setCreditForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    reason: '',
    subtotal: '',
    taxAmount: '',
    totalAmount: '',
    sourceSaleId: '',
    notes: '',
  });
  const [adjustForm, setAdjustForm] = useState({ saleId: '', amount: '', note: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', paymentMethod: 'bank_transfer', note: '' });
  const [dayEndForm, setDayEndForm] = useState({ openingCash: '', physicalClosingCash: '', notes: '' });

  const selectedCreditNote = useMemo(
    () => creditNotes.find((row) => row._id === selectedCreditNoteId) || null,
    [creditNotes, selectedCreditNoteId]
  );

  const selectedAllocations = useMemo(
    () =>
      outstandingRows
        .map((row) => ({
          saleId: row._id,
          amount: Number(allocationDrafts[row._id] || 0),
          customerId: row.customerId,
          customerName: row.customerName,
        }))
        .filter((row) => row.amount > 0),
    [allocationDrafts, outstandingRows]
  );

  const allocatedTotal = useMemo(
    () => selectedAllocations.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [selectedAllocations]
  );

  const refreshAll = async (nextMessage?: string) => {
    setLoading(true);
    setError('');
    try {
      const headers = getHeaders(false);
      const receiptPromise = fetchApiJson(apiUrl(`/api/settlements/receipts?startDate=${rangeStart}&endDate=${rangeEnd}&limit=100`), { headers });
      const creditPromise = fetchApiJson(apiUrl('/api/credit-notes?limit=100'), { headers });
      const dailyPromise = fetchApiJson(apiUrl(`/api/settlements/collections/daily?date=${businessDate}`), { headers });
      const userPromise = fetchApiJson(apiUrl(`/api/settlements/collections/user-wise?startDate=${rangeStart}&endDate=${rangeEnd}`), { headers });
      const dayEndPromise = fetchApiJson(apiUrl(`/api/settlements/day-end/report?date=${businessDate}`), { headers }).catch(() => null);
      const outstandingPromise = fetchApiJson(apiUrl(`/api/reports/outstanding-receivables?startDate=${rangeStart}&endDate=${rangeEnd}`), { headers }).catch((loadError: any) => {
        setOutstandingError(loadError?.message || 'Outstanding receivables unavailable for this user.');
        return null;
      });

      const [receiptResp, creditResp, dailyResp, userResp, dayEndResp, outstandingResp] = await Promise.all([
        receiptPromise,
        creditPromise,
        dailyPromise,
        userPromise,
        dayEndPromise,
        outstandingPromise,
      ]);

      setReceipts(Array.isArray(receiptResp?.data) ? receiptResp.data : []);
      setCreditNotes(Array.isArray(creditResp?.data) ? creditResp.data : []);
      setDailySummary((dailyResp?.data || null) as DailyCollectionSummary | null);
      setUserCollections(Array.isArray(userResp?.data) ? userResp.data : []);
      setDayEndReport((dayEndResp as any)?.data || null);
      setOutstandingRows(Array.isArray((outstandingResp as any)?.data?.rows) ? (outstandingResp as any).data.rows : []);
      if (outstandingResp) setOutstandingError('');
      if (nextMessage) setMessage(nextMessage);
    } catch (loadError: any) {
      setError(loadError?.message || 'Failed to load settlement data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, [rangeStart, rangeEnd, businessDate]);

  const saveReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const amount = Number(receiptForm.amount || allocatedTotal || 0);
      if (amount <= 0) throw new Error('Receipt amount must be greater than zero');

      const uniqueCustomerIds = Array.from(new Set(selectedAllocations.map((row) => String(row.customerId || '')).filter(Boolean)));
      if (uniqueCustomerIds.length > 1) throw new Error('Allocate a receipt to invoices of one customer at a time');

      await fetchApiJson(apiUrl('/api/settlements/receipts'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          customerId: uniqueCustomerIds[0] || undefined,
          customerName: receiptForm.customerName.trim() || selectedAllocations[0]?.customerName || undefined,
          amount,
          mode: receiptForm.mode,
          notes: receiptForm.notes.trim(),
          isAdvance: receiptForm.isAdvance,
          allocations: selectedAllocations.map((row) => ({ saleId: row.saleId, amount: row.amount })),
        }),
      });

      setReceiptForm({ customerName: '', amount: '', mode: 'cash', notes: '', isAdvance: false });
      setAllocationDrafts({});
      await refreshAll('Receipt voucher created successfully.');
    } catch (receiptError: any) {
      setError(receiptError?.message || 'Failed to create receipt voucher');
      setLoading(false);
    }
  };

  const saveCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const subtotal = Number(creditForm.subtotal || 0);
      const taxAmount = Number(creditForm.taxAmount || 0);
      const totalAmount = Number(creditForm.totalAmount || subtotal + taxAmount);
      if (totalAmount <= 0) throw new Error('Credit note total must be greater than zero');

      await fetchApiJson(apiUrl('/api/credit-notes'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          customerName: creditForm.customerName.trim() || undefined,
          customerPhone: creditForm.customerPhone.trim() || undefined,
          customerEmail: creditForm.customerEmail.trim() || undefined,
          reason: creditForm.reason.trim(),
          subtotal,
          taxAmount,
          totalAmount,
          sourceSaleId: creditForm.sourceSaleId.trim() || undefined,
          notes: creditForm.notes.trim() || undefined,
        }),
      });

      setCreditForm({
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        reason: '',
        subtotal: '',
        taxAmount: '',
        totalAmount: '',
        sourceSaleId: '',
        notes: '',
      });
      await refreshAll('Credit note created successfully.');
    } catch (creditError: any) {
      setError(creditError?.message || 'Failed to create credit note');
      setLoading(false);
    }
  };

  const adjustCreditNote = async () => {
    if (!selectedCreditNote) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl(`/api/credit-notes/${selectedCreditNote._id}/adjust`), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          saleId: adjustForm.saleId.trim() || undefined,
          amount: Number(adjustForm.amount || 0),
          note: adjustForm.note.trim() || undefined,
        }),
      });
      setAdjustForm({ saleId: '', amount: '', note: '' });
      await refreshAll('Credit note adjusted successfully.');
    } catch (adjustError: any) {
      setError(adjustError?.message || 'Failed to adjust credit note');
      setLoading(false);
    }
  };

  const refundCreditNote = async () => {
    if (!selectedCreditNote) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl(`/api/credit-notes/${selectedCreditNote._id}/refund`), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          amount: Number(refundForm.amount || 0),
          paymentMethod: refundForm.paymentMethod,
          note: refundForm.note.trim() || undefined,
        }),
      });
      setRefundForm({ amount: '', paymentMethod: 'bank_transfer', note: '' });
      await refreshAll('Credit note refund processed successfully.');
    } catch (refundError: any) {
      setError(refundError?.message || 'Failed to refund credit note');
      setLoading(false);
    }
  };

  const closeDayEnd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fetchApiJson(apiUrl('/api/settlements/day-end/close'), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          businessDate,
          openingCash: Number(dayEndForm.openingCash || 0),
          physicalClosingCash: Number(dayEndForm.physicalClosingCash || 0),
          notes: dayEndForm.notes.trim() || undefined,
        }),
      });
      await refreshAll('Day-end closing saved successfully.');
    } catch (dayEndError: any) {
      setError(dayEndError?.message || 'Failed to save day-end closing');
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';
  const buttonClass =
    'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Settlement Center</h1>
          <p className="text-sm text-gray-300">Receipt vouchers, credit notes, and day-end cash closing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={inputClass} type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          <input className={inputClass} type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          <button type="button" onClick={() => void refreshAll('Settlement data refreshed.')} className={buttonClass} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
      {outstandingError && <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{outstandingError}</div>}

      <div className="flex flex-wrap gap-2">
        {[
          ['receipts', 'Receipts & Collections'],
          ['credit', 'Credit Notes'],
          ['dayEnd', 'Day-End'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as TabKey)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${activeTab === key ? 'bg-indigo-500 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'receipts' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Cash Sales</p><p className="mt-1 text-xl font-semibold text-white">{formatCurrency(Number(dailySummary?.cashSalesTotal || 0))}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Cash Receipts</p><p className="mt-1 text-xl font-semibold text-emerald-300">{formatCurrency(Number(dailySummary?.cashReceiptTotal || 0))}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Cash Expenses</p><p className="mt-1 text-xl font-semibold text-rose-300">{formatCurrency(Number(dailySummary?.cashExpenseTotal || 0))}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Net Cash</p><p className="mt-1 text-xl font-semibold text-indigo-200">{formatCurrency(Number(dailySummary?.netCashCollection || 0))}</p></div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <form onSubmit={saveReceipt} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-lg font-semibold text-white">Create Receipt Voucher</h2>
              <input className={inputClass} placeholder="Customer Name" value={receiptForm.customerName} onChange={(e) => setReceiptForm((prev) => ({ ...prev, customerName: e.target.value }))} />
              <input className={inputClass} type="number" min="0" step="0.01" placeholder={`Amount ${allocatedTotal > 0 ? `(allocated ${formatCurrency(allocatedTotal)})` : ''}`} value={receiptForm.amount} onChange={(e) => setReceiptForm((prev) => ({ ...prev, amount: e.target.value }))} />
              <select className={inputClass} value={receiptForm.mode} onChange={(e) => setReceiptForm((prev) => ({ ...prev, mode: e.target.value }))}>
                {['cash', 'card', 'upi', 'bank_transfer', 'cheque'].map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
              </select>
              <textarea className={`${inputClass} min-h-[84px]`} placeholder="Notes" value={receiptForm.notes} onChange={(e) => setReceiptForm((prev) => ({ ...prev, notes: e.target.value }))} />
              <label className="inline-flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={receiptForm.isAdvance} onChange={(e) => setReceiptForm((prev) => ({ ...prev, isAdvance: e.target.checked }))} />Mark as advance receipt</label>
              <button type="submit" className={buttonClass} disabled={loading}>Save Receipt</button>
            </form>

            <div className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Outstanding Receivables</h2>
                <div className="text-sm text-gray-400">Selected: {formatCurrency(allocatedTotal)}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-gray-300"><th className="px-2 py-2">Invoice</th><th className="px-2 py-2">Customer</th><th className="px-2 py-2">Due</th><th className="px-2 py-2">Outstanding</th><th className="px-2 py-2">Allocate</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {outstandingRows.map((row) => (
                      <tr key={row._id}>
                        <td className="px-2 py-2 text-white">{row.invoiceNumber || row.saleNumber || row._id.slice(-6)}</td>
                        <td className="px-2 py-2 text-gray-300"><div>{row.customerName || 'Walk-in Customer'}</div><div className="text-xs text-gray-500">{row.customerPhone || '-'}</div></td>
                        <td className="px-2 py-2 text-gray-300">{formatDate(row.dueDate)}</td>
                        <td className="px-2 py-2 text-amber-300">{formatCurrency(Number(row.outstandingAmount || 0))}</td>
                        <td className="px-2 py-2"><input className={`${inputClass} max-w-[140px]`} type="number" min="0" max={row.outstandingAmount} step="0.01" value={allocationDrafts[row._id] || ''} onChange={(e) => setAllocationDrafts((prev) => ({ ...prev, [row._id]: e.target.value }))} /></td>
                      </tr>
                    ))}
                    {!outstandingRows.length && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-400">No outstanding invoices available for this range.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Recent Receipts</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-gray-300"><th className="px-2 py-2">Voucher</th><th className="px-2 py-2">Customer</th><th className="px-2 py-2">Mode</th><th className="px-2 py-2">Amount</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {receipts.slice(0, 12).map((row) => (
                      <tr key={row._id}>
                        <td className="px-2 py-2 text-white">{row.voucherNumber}</td>
                        <td className="px-2 py-2 text-gray-300">{row.customerName || 'General Receipt'}</td>
                        <td className="px-2 py-2 text-gray-300 uppercase">{row.mode}</td>
                        <td className="px-2 py-2 text-emerald-300">{formatCurrency(Number(row.amount || 0))}</td>
                      </tr>
                    ))}
                    {!receipts.length && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-400">No receipt vouchers found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">User-wise Collections</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-gray-300"><th className="px-2 py-2">User</th><th className="px-2 py-2">Invoices</th><th className="px-2 py-2">Sales</th><th className="px-2 py-2">Receipts</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {userCollections.map((row, index) => (
                      <tr key={`${row.userId || 'user'}-${index}`}>
                        <td className="px-2 py-2 text-white">{row.userId || 'Unknown'}</td>
                        <td className="px-2 py-2 text-gray-300">{row.invoices}</td>
                        <td className="px-2 py-2 text-gray-300">{formatCurrency(Number(row.salesTotal || 0))}</td>
                        <td className="px-2 py-2 text-emerald-300">{formatCurrency(Number(row.receiptTotal || 0))}</td>
                      </tr>
                    ))}
                    {!userCollections.length && <tr><td colSpan={4} className="px-2 py-4 text-center text-gray-400">No collection data found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'credit' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <form onSubmit={saveCreditNote} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Create Credit Note</h2>
            <input className={inputClass} placeholder="Customer Name" value={creditForm.customerName} onChange={(e) => setCreditForm((prev) => ({ ...prev, customerName: e.target.value }))} />
            <input className={inputClass} placeholder="Customer Phone" value={creditForm.customerPhone} onChange={(e) => setCreditForm((prev) => ({ ...prev, customerPhone: e.target.value }))} />
            <input className={inputClass} type="email" placeholder="Customer Email" value={creditForm.customerEmail} onChange={(e) => setCreditForm((prev) => ({ ...prev, customerEmail: e.target.value }))} />
            <textarea className={`${inputClass} min-h-[84px]`} placeholder="Reason" value={creditForm.reason} onChange={(e) => setCreditForm((prev) => ({ ...prev, reason: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Subtotal" value={creditForm.subtotal} onChange={(e) => setCreditForm((prev) => ({ ...prev, subtotal: e.target.value }))} />
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Tax" value={creditForm.taxAmount} onChange={(e) => setCreditForm((prev) => ({ ...prev, taxAmount: e.target.value }))} />
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Total" value={creditForm.totalAmount} onChange={(e) => setCreditForm((prev) => ({ ...prev, totalAmount: e.target.value }))} />
            </div>
            <input className={inputClass} placeholder="Source Sale ID (optional)" value={creditForm.sourceSaleId} onChange={(e) => setCreditForm((prev) => ({ ...prev, sourceSaleId: e.target.value }))} />
            <textarea className={`${inputClass} min-h-[72px]`} placeholder="Notes" value={creditForm.notes} onChange={(e) => setCreditForm((prev) => ({ ...prev, notes: e.target.value }))} />
            <button type="submit" className={buttonClass} disabled={loading}>Create Credit Note</button>
          </form>

          <div className="space-y-5 xl:col-span-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h2 className="mb-3 text-lg font-semibold text-white">Credit Notes</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <thead><tr className="text-left text-gray-300"><th className="px-2 py-2">Note</th><th className="px-2 py-2">Customer</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Balance</th><th className="px-2 py-2 text-right">Action</th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {creditNotes.map((row) => (
                      <tr key={row._id}>
                        <td className="px-2 py-2 text-white"><div className="font-semibold">{row.noteNumber}</div><div className="text-xs text-gray-500">{formatDate(row.createdAt)}</div></td>
                        <td className="px-2 py-2 text-gray-300">{row.customerName || row.customerPhone || '-'}</td>
                        <td className="px-2 py-2 text-gray-300 uppercase">{row.status}</td>
                        <td className="px-2 py-2 text-amber-300">{formatCurrency(Number(row.balanceAmount || 0))}</td>
                        <td className="px-2 py-2 text-right"><button type="button" onClick={() => setSelectedCreditNoteId(row._id)} className="text-xs text-indigo-200 hover:text-indigo-100">Manage</button></td>
                      </tr>
                    ))}
                    {!creditNotes.length && <tr><td colSpan={5} className="px-2 py-4 text-center text-gray-400">No credit notes found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedCreditNote && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">Adjust {selectedCreditNote.noteNumber}</h2><button type="button" onClick={() => setSelectedCreditNoteId('')} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200 hover:bg-white/10">Close</button></div>
                  <input className={inputClass} placeholder="Sale ID to adjust against" value={adjustForm.saleId} onChange={(e) => setAdjustForm((prev) => ({ ...prev, saleId: e.target.value }))} />
                  <input className={inputClass} type="number" min="0" step="0.01" placeholder="Adjustment Amount" value={adjustForm.amount} onChange={(e) => setAdjustForm((prev) => ({ ...prev, amount: e.target.value }))} />
                  <textarea className={`${inputClass} min-h-[72px]`} placeholder="Adjustment Note" value={adjustForm.note} onChange={(e) => setAdjustForm((prev) => ({ ...prev, note: e.target.value }))} />
                  <button type="button" onClick={() => void adjustCreditNote()} className={buttonClass} disabled={loading}>Adjust Credit Note</button>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
                  <h2 className="text-lg font-semibold text-white">Refund {selectedCreditNote.noteNumber}</h2>
                  <input className={inputClass} type="number" min="0" step="0.01" placeholder="Refund Amount" value={refundForm.amount} onChange={(e) => setRefundForm((prev) => ({ ...prev, amount: e.target.value }))} />
                  <select className={inputClass} value={refundForm.paymentMethod} onChange={(e) => setRefundForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}>
                    {['cash', 'card', 'upi', 'bank_transfer', 'online', 'cheque'].map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
                  </select>
                  <textarea className={`${inputClass} min-h-[72px]`} placeholder="Refund Note" value={refundForm.note} onChange={(e) => setRefundForm((prev) => ({ ...prev, note: e.target.value }))} />
                  <button type="button" onClick={() => void refundCreditNote()} className={buttonClass} disabled={loading}>Refund Credit Note</button>
                  <div className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm"><p className="text-gray-400">Balance</p><p className="mt-1 font-semibold text-white">{formatCurrency(Number(selectedCreditNote.balanceAmount || 0))}</p></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'dayEnd' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <form onSubmit={closeDayEnd} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Close Day</h2>
            <input className={inputClass} type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Opening Cash" value={dayEndForm.openingCash} onChange={(e) => setDayEndForm((prev) => ({ ...prev, openingCash: e.target.value }))} />
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Physical Closing Cash" value={dayEndForm.physicalClosingCash} onChange={(e) => setDayEndForm((prev) => ({ ...prev, physicalClosingCash: e.target.value }))} />
            <textarea className={`${inputClass} min-h-[84px]`} placeholder="Notes" value={dayEndForm.notes} onChange={(e) => setDayEndForm((prev) => ({ ...prev, notes: e.target.value }))} />
            <button type="submit" className={buttonClass} disabled={loading}>Save Day-End Closing</button>
          </form>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5 xl:col-span-2">
            <h2 className="mb-3 text-lg font-semibold text-white">Day-End Report</h2>
            {dayEndReport ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Business Date</p><p className="mt-1 text-sm font-semibold text-white">{formatDate(dayEndReport.businessDate)}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Opening Cash</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(Number(dayEndReport.openingCash || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">System Closing</p><p className="mt-1 text-sm font-semibold text-indigo-200">{formatCurrency(Number(dayEndReport.systemClosingCash || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Cash Sales</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(Number(dayEndReport.cashSales || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Cash Receipts</p><p className="mt-1 text-sm font-semibold text-emerald-300">{formatCurrency(Number(dayEndReport.cashReceipts || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Cash Expenses</p><p className="mt-1 text-sm font-semibold text-rose-300">{formatCurrency(Number(dayEndReport.cashExpenses || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Physical Closing</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(Number(dayEndReport.physicalClosingCash || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Variance</p><p className={`mt-1 text-sm font-semibold ${Number(dayEndReport.variance || 0) === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{formatCurrency(Number(dayEndReport.variance || 0))}</p></div>
                <div className="rounded-lg border border-white/10 bg-black/10 p-3"><p className="text-xs text-gray-400">Notes</p><p className="mt-1 text-sm text-gray-300">{dayEndReport.notes || '-'}</p></div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No day-end report found for the selected date yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
