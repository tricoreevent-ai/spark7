import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

interface CustomerRow {
  _id: string;
  customerCode: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  accountType: 'cash' | 'credit';
  creditLimit?: number;
  creditDays?: number;
  isBlocked?: boolean;
  pricingTier?: string;
  contacts?: Array<{
    name: string;
    role?: string;
    phone?: string;
    email?: string;
    isPrimary?: boolean;
    visibility?: 'billing' | 'operational' | 'c_level' | 'general';
    notes?: string;
  }>;
  activityLog?: Array<{
    activityType: 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute';
    summary: string;
    details?: string;
    nextFollowUpDate?: string;
    createdAt?: string;
    createdBy?: string;
  }>;
}

interface UnifiedOption {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: 'customer' | 'member';
  customerCode?: string;
  memberCode?: string;
}

interface DunningRow {
  customerId?: string;
  customerCode?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  pricingTier?: string;
  totalOutstanding: number;
  invoiceCount: number;
  maxDaysPastDue: number;
  recommendedAction: string;
  billingContact?: {
    name?: string;
    phone?: string;
    email?: string;
  } | null;
  lastReminderAt?: string | null;
}

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);
const CUSTOMER_BATCH_SIZE = 50;
type CustomerSortField = 'customerCode' | 'name' | 'phone' | 'email' | 'accountType' | 'status';
type SortDirection = 'asc' | 'desc';

export const Customers: React.FC = () => {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const [hasMoreRows, setHasMoreRows] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [memberSuggestions, setMemberSuggestions] = useState<UnifiedOption[]>([]);
  const [dunningRows, setDunningRows] = useState<DunningRow[]>([]);
  const [sortField, setSortField] = useState<CustomerSortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [form, setForm] = useState({
    id: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    accountType: 'cash' as 'cash' | 'credit',
    creditLimit: '0',
    creditDays: '0',
    pricingTier: '',
    notes: '',
    contacts: [] as Array<{
      name: string;
      role: string;
      phone: string;
      email: string;
      visibility: 'billing' | 'operational' | 'c_level' | 'general';
      isPrimary: boolean;
      notes: string;
    }>,
  });
  const [activityForm, setActivityForm] = useState({
    activityType: 'note' as 'call' | 'email' | 'meeting' | 'payment_reminder' | 'note' | 'dispute',
    summary: '',
    details: '',
    nextFollowUpDate: '',
  });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  const loadRows = async (
    q = search,
    options?: { reset?: boolean }
  ) => {
    const reset = options?.reset !== false;
    const skip = reset ? 0 : rows.length;
    if (reset) setLoading(true);
    else setLoadingMoreRows(true);
    setError('');
    try {
      const query = String(q || '').trim();
      const params = new URLSearchParams({
        skip: String(skip),
        limit: String(CUSTOMER_BATCH_SIZE),
      });
      if (query) params.set('q', query);
      const url = `/api/customers?${params.toString()}`;
      const data = await fetchApiJson(apiUrl(url), { headers });
      const incoming = Array.isArray(data?.data) ? (data.data as CustomerRow[]) : [];
      const total = Number(data?.pagination?.total || incoming.length || 0);
      setTotalRows(total);
      setRows((prev) => {
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
      setHasMoreRows(skip + incoming.length < total);
    } catch (e: any) {
      setError(e.message || 'Failed to load customers');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMoreRows(false);
    }
  };

  const loadMemberSuggestions = async (q = search) => {
    try {
      const query = String(q || '').trim();
      if (!query) {
        setMemberSuggestions([]);
        return;
      }
      const data = await fetchApiJson(apiUrl(`/api/customers/search-unified?q=${encodeURIComponent(query)}`), { headers });
      const all = Array.isArray(data?.data) ? data.data : [];
      setMemberSuggestions(all.filter((row: UnifiedOption) => row.source === 'member'));
    } catch {
      setMemberSuggestions([]);
    }
  };

  const loadDunning = async () => {
    try {
      const data = await fetchApiJson(apiUrl('/api/customers/dunning/report?minDays=1'), { headers });
      const rows = Array.isArray(data?.data?.rows) ? data.data.rows : [];
      setDunningRows(rows as DunningRow[]);
    } catch {
      setDunningRows([]);
    }
  };

  useEffect(() => {
    void loadRows('', { reset: true });
    void loadDunning();
  }, []);

  const searchNow = async () => {
    await loadRows(search, { reset: true });
    await loadMemberSuggestions(search);
    await loadDunning();
  };

  const resetForm = () => {
    setForm({
      id: '',
      name: '',
      phone: '',
      email: '',
      address: '',
      accountType: 'cash',
      creditLimit: '0',
      creditDays: '0',
      pricingTier: '',
      notes: '',
      contacts: [],
    });
    setActivityForm({ activityType: 'note', summary: '', details: '', nextFollowUpDate: '' });
  };

  const editRow = (row: CustomerRow) => {
    setForm({
      id: row._id,
      name: row.name || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      accountType: row.accountType || 'cash',
      creditLimit: String(Number(row.creditLimit || 0)),
      creditDays: String(Number(row.creditDays || 0)),
      pricingTier: String(row.pricingTier || ''),
      notes: row.notes || '',
      contacts: Array.isArray(row.contacts)
        ? row.contacts.map((contact) => ({
          name: String(contact.name || ''),
          role: String(contact.role || ''),
          phone: String(contact.phone || ''),
          email: String(contact.email || ''),
          visibility: (contact.visibility || 'general') as 'billing' | 'operational' | 'c_level' | 'general',
          isPrimary: Boolean(contact.isPrimary),
          notes: String(contact.notes || ''),
        }))
        : [],
    });
  };

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const normalizedPhone = normalizePhone(form.phone);
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!normalizedPhone) {
      setError('Phone is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: normalizedPhone,
        email: form.email.trim(),
        address: form.address.trim(),
        accountType: form.accountType,
        creditLimit: Number(form.creditLimit || 0),
        creditDays: Number(form.creditDays || 0),
        pricingTier: form.pricingTier.trim(),
        notes: form.notes.trim(),
        contacts: form.contacts.map((contact) => ({
          name: contact.name.trim(),
          role: contact.role.trim(),
          phone: normalizePhone(contact.phone),
          email: contact.email.trim(),
          visibility: contact.visibility,
          isPrimary: Boolean(contact.isPrimary),
          notes: contact.notes.trim(),
        })).filter((contact) => contact.name),
      };
      if (form.id) {
        await fetchApiJson(apiUrl(`/api/customers/${form.id}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });
      setMessage('Customer updated');
      } else {
        await fetchApiJson(apiUrl('/api/customers'), {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        setMessage('Customer created');
      }
      resetForm();
      await loadRows(search, { reset: true });
      await loadMemberSuggestions(search);
      await loadDunning();
    } catch (e: any) {
      setError(e.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const toggleBlock = async (row: CustomerRow) => {
    try {
      await fetchApiJson(apiUrl(`/api/customers/${row._id}/block`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ isBlocked: !row.isBlocked }),
      });
      setMessage(!row.isBlocked ? 'Customer blocked' : 'Customer unblocked');
      await loadRows(search, { reset: true });
      await loadDunning();
    } catch (e: any) {
      setError(e.message || 'Failed to update block state');
    }
  };

  const addMemberAsCustomer = async (row: UnifiedOption) => {
    try {
      const name = String(row.name || '').trim();
      const phone = normalizePhone(String(row.phone || ''));
      if (!name || !phone) {
        setError('Member must have name and phone to add as customer');
        return;
      }
      await fetchApiJson(apiUrl('/api/customers'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          phone,
          email: String(row.email || '').trim(),
          accountType: 'cash',
          creditLimit: 0,
          creditDays: 0,
        }),
      });
      setMessage('Member added as customer');
      await loadRows(search, { reset: true });
      await loadMemberSuggestions(search);
      await loadDunning();
    } catch (e: any) {
      setError(e.message || 'Failed to add member as customer');
    }
  };

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [
        ...prev.contacts,
        { name: '', role: '', phone: '', email: '', visibility: 'general', isPrimary: false, notes: '' },
      ],
    }));
  };

  const updateContact = (index: number, field: 'name' | 'role' | 'phone' | 'email' | 'visibility' | 'isPrimary' | 'notes', value: string | boolean) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact, contactIndex) => (
        contactIndex === index ? { ...contact, [field]: value } : contact
      )),
    }));
  };

  const removeContact = (index: number) => {
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, contactIndex) => contactIndex !== index),
    }));
  };

  const logActivity = async (customerId: string, presetSummary?: string) => {
    try {
      const summary = presetSummary || activityForm.summary.trim();
      if (!summary) {
        setError('Activity summary is required');
        return;
      }

      await fetchApiJson(apiUrl(`/api/customers/${customerId}/activities`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          activityType: activityForm.activityType,
          summary,
          details: activityForm.details.trim(),
          nextFollowUpDate: activityForm.nextFollowUpDate || undefined,
        }),
      });

      setMessage('Customer activity logged');
      setActivityForm({ activityType: 'note', summary: '', details: '', nextFollowUpDate: '' });
      await loadRows(search, { reset: true });
      await loadDunning();
    } catch (activityError: any) {
      setError(activityError?.message || 'Failed to log activity');
    }
  };

  const inputClass = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white';

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const getValue = (row: CustomerRow): string | number => {
        if (sortField === 'customerCode') return row.customerCode || '';
        if (sortField === 'name') return row.name || '';
        if (sortField === 'phone') return row.phone || '';
        if (sortField === 'email') return row.email || '';
        if (sortField === 'accountType') return row.accountType || '';
        return row.isBlocked ? 1 : 0;
      };
      const av = getValue(a);
      const bv = getValue(b);
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortDirection, sortField]);

  const toggleSort = (field: CustomerSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection('asc');
  };

  const sortLabel = (field: CustomerSortField, label: string) => {
    if (sortField !== field) return `${label} ↕`;
    return `${label}${sortDirection === 'asc' ? ' ↑' : ' ↓'}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Customer Management</h1>
        <p className="text-sm text-gray-300">Phone-first customer records used across booking, sales, and orders. Members can be added as customers.</p>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputClass} sm:w-96`}
          placeholder="Search customer/member by name, code, phone, email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void searchNow();
            }
          }}
        />
        <button onClick={() => void searchNow()} className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400">Search</button>
        <button onClick={() => { setSearch(''); void loadRows('', { reset: true }); setMemberSuggestions([]); void loadDunning(); }} className="rounded-md border border-white/20 px-3 py-2 text-sm text-gray-200">Clear</button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <form onSubmit={saveCustomer} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-lg font-semibold text-white">{form.id ? 'Edit Customer' : 'Create Customer'}</h2>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            <input className={inputClass} placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <select className={inputClass} value={form.accountType} onChange={(e) => setForm((p) => ({ ...p, accountType: e.target.value as 'cash' | 'credit' }))}>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <textarea className={`${inputClass} min-h-[64px]`} placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Credit Limit" value={form.creditLimit} onChange={(e) => setForm((p) => ({ ...p, creditLimit: e.target.value }))} />
            <input className={inputClass} type="number" min="0" step="1" placeholder="Credit Days" value={form.creditDays} onChange={(e) => setForm((p) => ({ ...p, creditDays: e.target.value }))} />
          </div>
          <input className={inputClass} placeholder="Pricing Tier (Retail/Wholesale/Platinum)" value={form.pricingTier} onChange={(e) => setForm((p) => ({ ...p, pricingTier: e.target.value }))} />
          <textarea className={`${inputClass} min-h-[64px]`} placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />

          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Contact Roles</h3>
                <p className="text-xs text-gray-400">Billing, operational, and leadership contacts for offline follow-up.</p>
              </div>
              <button type="button" onClick={addContact} className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200">Add Contact</button>
            </div>
            <div className="space-y-2">
              {form.contacts.map((contact, index) => (
                <div key={`${contact.name}-${index}`} className="rounded border border-white/10 bg-white/5 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputClass} placeholder="Contact name" value={contact.name} onChange={(e) => updateContact(index, 'name', e.target.value)} />
                    <input className={inputClass} placeholder="Role" value={contact.role} onChange={(e) => updateContact(index, 'role', e.target.value)} />
                    <input className={inputClass} placeholder="Phone" value={contact.phone} onChange={(e) => updateContact(index, 'phone', e.target.value)} />
                    <input className={inputClass} placeholder="Email" value={contact.email} onChange={(e) => updateContact(index, 'email', e.target.value)} />
                    <select className={inputClass} value={contact.visibility} onChange={(e) => updateContact(index, 'visibility', e.target.value)}>
                      <option value="general">General</option>
                      <option value="billing">Billing</option>
                      <option value="operational">Operational</option>
                      <option value="c_level">C-Level</option>
                    </select>
                    <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                      <input type="checkbox" checked={contact.isPrimary} onChange={(e) => updateContact(index, 'isPrimary', e.target.checked)} />
                      Primary contact
                    </label>
                  </div>
                  <textarea className={`${inputClass} mt-2 min-h-[56px]`} placeholder="Contact notes" value={contact.notes} onChange={(e) => updateContact(index, 'notes', e.target.value)} />
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={() => removeContact(index)} className="rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200">Remove</button>
                  </div>
                </div>
              ))}
              {!form.contacts.length && <p className="text-xs text-gray-400">No customer contacts added yet.</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button disabled={saving} className="flex-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400">{saving ? 'Saving...' : form.id ? 'Update Customer' : 'Create Customer'}</button>
            {form.id && <button type="button" onClick={resetForm} className="rounded-md border border-white/20 px-3 py-2 text-sm text-gray-200">Cancel</button>}
          </div>
        </form>

        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Member Suggestions</h2>
            <p className="text-xs text-gray-400">Search and add members as customers.</p>
            <div className="max-h-[220px] space-y-2 overflow-y-auto">
              {memberSuggestions.map((row) => (
                <div key={row._id} className="rounded border border-white/10 bg-black/20 p-2 text-sm text-gray-200">
                  <p className="text-white">{row.name || '-'}</p>
                  <p>{row.phone || '-'}</p>
                  <p className="text-xs text-gray-400">{row.email || '-'}</p>
                  <button onClick={() => void addMemberAsCustomer(row)} className="mt-1 rounded bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-200">Add As Customer</button>
                </div>
              ))}
              {!memberSuggestions.length && <p className="text-sm text-gray-400">No member suggestions.</p>}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Collections Watchlist</h2>
            <p className="text-xs text-gray-400">Overdue credit customers with suggested dunning actions.</p>
            <div className="max-h-[280px] space-y-2 overflow-y-auto">
              {dunningRows.map((row, index) => (
                <div key={`${row.customerId || row.customerCode || row.customerName}-${index}`} className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white">{row.customerName}</p>
                      <p className="text-xs text-gray-400">{row.customerCode || '-'} {row.pricingTier ? `| ${row.pricingTier}` : ''}</p>
                      {row.billingContact?.name && <p className="text-xs text-cyan-200">Billing: {row.billingContact.name}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-amber-300">{formatCurrency(Number(row.totalOutstanding || 0))}</p>
                      <p className="text-xs text-gray-400">{row.invoiceCount} invoice(s)</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-rose-200">{row.maxDaysPastDue} days overdue • {row.recommendedAction}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.customerId && (
                      <button onClick={() => void logActivity(row.customerId!, `Payment reminder sent for overdue balance of ${formatCurrency(Number(row.totalOutstanding || 0))}`)} className="rounded bg-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-200">
                        Log Reminder
                      </button>
                    )}
                    {row.customerId && (
                      <button onClick={() => {
                        const target = rows.find((customer) => customer._id === row.customerId);
                        if (target) editRow(target);
                      }} className="rounded bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-200">
                        Open Customer
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!dunningRows.length && <p className="text-sm text-gray-400">No overdue customer accounts.</p>}
            </div>
          </div>
        </div>
      </div>

      {form.id && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Activity Tracking</h2>
            <div className="grid grid-cols-2 gap-2">
              <select className={inputClass} value={activityForm.activityType} onChange={(e) => setActivityForm((prev) => ({ ...prev, activityType: e.target.value as any }))}>
                {['note', 'call', 'email', 'meeting', 'payment_reminder', 'dispute'].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <input className={inputClass} type="date" value={activityForm.nextFollowUpDate} onChange={(e) => setActivityForm((prev) => ({ ...prev, nextFollowUpDate: e.target.value }))} />
            </div>
            <input className={inputClass} placeholder="Summary" value={activityForm.summary} onChange={(e) => setActivityForm((prev) => ({ ...prev, summary: e.target.value }))} />
            <textarea className={`${inputClass} min-h-[72px]`} placeholder="Details" value={activityForm.details} onChange={(e) => setActivityForm((prev) => ({ ...prev, details: e.target.value }))} />
            <button type="button" onClick={() => void logActivity(form.id)} className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
              Log Activity
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Activity History</h2>
            <div className="max-h-[280px] space-y-2 overflow-y-auto">
              {(rows.find((row) => row._id === form.id)?.activityLog || []).map((activity, index) => (
                <div key={`${activity.summary}-${index}`} className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-white/10 px-2 py-1 text-[11px] uppercase text-cyan-200">{activity.activityType}</span>
                    <span className="text-[11px] text-gray-400">{activity.createdAt ? new Date(activity.createdAt).toLocaleString() : '-'}</span>
                  </div>
                  <p className="mt-2 text-white">{activity.summary}</p>
                  {activity.details && <p className="mt-1 text-xs text-gray-400">{activity.details}</p>}
                  {activity.nextFollowUpDate && <p className="mt-1 text-xs text-amber-200">Follow-up: {String(activity.nextFollowUpDate).slice(0, 10)}</p>}
                </div>
              ))}
              {!(rows.find((row) => row._id === form.id)?.activityLog || []).length && <p className="text-sm text-gray-400">No activity logged for this customer yet.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-lg font-semibold text-white">Customers</h2>
        {loading ? (
          <p className="text-sm text-gray-400">Loading customers...</p>
        ) : (
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => toggleSort('customerCode')} className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/10">
                    {sortLabel('customerCode', 'Code')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => toggleSort('name')} className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/10">
                    {sortLabel('name', 'Name')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => toggleSort('phone')} className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/10">
                    {sortLabel('phone', 'Phone')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => toggleSort('email')} className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/10">
                    {sortLabel('email', 'Email')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => toggleSort('accountType')} className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/10">
                    {sortLabel('accountType', 'Account')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">
                  <button type="button" onClick={() => toggleSort('status')} className="cursor-pointer rounded px-1 py-0.5 hover:bg-white/10">
                    {sortLabel('status', 'Status')}
                  </button>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sortedRows.map((row) => (
                <tr key={row._id}>
                  <td className="px-2 py-2 text-xs text-gray-200">{row.customerCode}</td>
                  <td className="px-2 py-2 text-xs text-white">
                    <div>
                      <p>{row.name}</p>
                      <p className="text-[11px] text-gray-500">
                        {row.pricingTier || 'Standard'}{Array.isArray(row.contacts) && row.contacts.length ? ` | ${row.contacts.length} contact(s)` : ''}
                      </p>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-gray-200">{row.phone || '-'}</td>
                  <td className="px-2 py-2 text-xs text-gray-200">{row.email || '-'}</td>
                  <td className="px-2 py-2 text-xs uppercase text-gray-200">{row.accountType}</td>
                  <td className="px-2 py-2 text-xs">{row.isBlocked ? <span className="text-rose-300">Blocked</span> : <span className="text-emerald-300">Active</span>}</td>
                  <td className="px-2 py-2 text-xs">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => editRow(row)} className="rounded bg-cyan-500/20 px-2 py-1 text-cyan-200">Edit</button>
                      <button onClick={() => void toggleBlock(row)} className="rounded bg-amber-500/20 px-2 py-1 text-amber-200">{row.isBlocked ? 'Unblock' : 'Block'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!sortedRows.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-sm text-gray-400">No customers found.</td></tr>}
            </tbody>
          </table>
        )}

        {!loading && rows.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-gray-400">
            <span>
              Loaded {rows.length} of {totalRows || rows.length}
            </span>
            {hasMoreRows && (
              <button
                type="button"
                disabled={loadingMoreRows}
                onClick={() => void loadRows(search, { reset: false })}
                className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMoreRows ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
