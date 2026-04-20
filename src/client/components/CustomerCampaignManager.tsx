import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showConfirmDialog } from '../utils/appDialogs';
import { FloatingField } from './FloatingField';
import {
  CustomerCampaignAudienceMode,
  CustomerCrmCampaignRow,
  CustomerCrmCustomerRow,
  CustomerCrmDirectoryFilters,
} from './customerCrmShared';

const buttonClass = 'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';
const sectionTitleClass = 'text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200';

interface CampaignFormState {
  id: string;
  name: string;
  subject: string;
  headline: string;
  message: string;
  audienceMode: CustomerCampaignAudienceMode;
  selectedCustomerIds: string[];
  savedFilters: CustomerCrmDirectoryFilters;
  brochureFileName: string;
  brochureDataUrl: string;
}

interface CustomerCampaignManagerProps {
  allRows: CustomerCrmCustomerRow[];
  filteredRows: CustomerCrmCustomerRow[];
  selectedRows: CustomerCrmCustomerRow[];
  directoryFilters: CustomerCrmDirectoryFilters;
  onClearSelection: () => void;
}

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const categoryLabel = (value?: string) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const relativeDate = (value?: string) => (value ? new Date(value).toLocaleString('en-IN') : '-');

const defaultFilters = (): CustomerCrmDirectoryFilters => ({
  search: '',
  customerCategories: [],
  accountTypes: [],
  statuses: [],
  pricingTiers: [],
});

const createDefaultForm = (selectedRows: CustomerCrmCustomerRow[], filters: CustomerCrmDirectoryFilters): CampaignFormState => ({
  id: '',
  name: '',
  subject: '',
  headline: '',
  message: '',
  audienceMode: selectedRows.length ? 'selected' : 'filtered',
  selectedCustomerIds: selectedRows.map((row) => row._id),
  savedFilters: filters,
  brochureFileName: '',
  brochureDataUrl: '',
});

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read brochure file.'));
    reader.readAsDataURL(file);
  });

const applyDirectoryFilters = (
  rows: CustomerCrmCustomerRow[],
  filters: CustomerCrmDirectoryFilters
): CustomerCrmCustomerRow[] => {
  const search = normalizeText(filters.search);
  return rows.filter((row) => {
    const matchesSearch =
      !search ||
      [
        row.customerCode,
        row.name,
        row.phone,
        row.email,
        row.pricingTier,
        row.preferences?.preferredSport,
        row.preferences?.preferredTimeSlot,
      ].some((value) => normalizeText(value).includes(search));

    if (!matchesSearch) return false;
    if (filters.customerCategories.length && !filters.customerCategories.includes(String(row.customerCategory || 'individual'))) return false;
    if (filters.accountTypes.length && !filters.accountTypes.includes(String(row.accountType || 'cash'))) return false;
    if (filters.statuses.length) {
      const statusValue = row.isBlocked ? 'blocked' : 'active';
      if (!filters.statuses.includes(statusValue)) return false;
    }
    if (filters.pricingTiers.length && !filters.pricingTiers.includes(String(row.pricingTier || '').trim())) return false;
    return true;
  });
};

const formatAudienceMode = (value: CustomerCampaignAudienceMode): string => {
  if (value === 'filtered') return 'Filtered directory';
  if (value === 'all_active') return 'All active customers';
  return 'Selected customers';
};

export const CustomerCampaignManager: React.FC<CustomerCampaignManagerProps> = ({
  allRows,
  filteredRows,
  selectedRows,
  directoryFilters,
  onClearSelection,
}) => {
  const [campaigns, setCampaigns] = useState<CustomerCrmCampaignRow[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState<CampaignFormState>(() => createDefaultForm(selectedRows, directoryFilters));

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, []);

  useEffect(() => {
    if (!form.id) {
      setForm((previous) => ({
        ...previous,
        selectedCustomerIds: selectedRows.map((row) => row._id),
        savedFilters: directoryFilters,
        audienceMode: selectedRows.length ? 'selected' : previous.audienceMode === 'selected' ? 'filtered' : previous.audienceMode,
      }));
    }
  }, [directoryFilters, form.id, selectedRows]);

  const loadCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/customer-crm/campaigns'), { headers });
      setCampaigns(Array.isArray(response?.data) ? response.data : []);
    } catch (campaignError: any) {
      setError(campaignError?.message || 'Failed to load CRM campaigns.');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  const selectedRowIds = useMemo(() => new Set(form.selectedCustomerIds), [form.selectedCustomerIds]);

  const filteredAudienceRows = useMemo(
    () => applyDirectoryFilters(allRows, form.savedFilters || defaultFilters()),
    [allRows, form.savedFilters]
  );

  const audienceRows = useMemo(() => {
    if (form.audienceMode === 'all_active') return allRows.filter((row) => !row.isBlocked);
    if (form.audienceMode === 'filtered') return filteredAudienceRows.filter((row) => !row.isBlocked);
    return allRows.filter((row) => selectedRowIds.has(row._id) && !row.isBlocked);
  }, [allRows, filteredAudienceRows, form.audienceMode, selectedRowIds]);

  const deliverableRows = useMemo(
    () => audienceRows.filter((row) => String(row.email || '').trim()),
    [audienceRows]
  );

  const missingEmailRows = useMemo(
    () => audienceRows.filter((row) => !String(row.email || '').trim()),
    [audienceRows]
  );

  const resetForm = () => {
    setForm(createDefaultForm(selectedRows, directoryFilters));
  };

  const useCurrentSelection = () => {
    setForm((previous) => ({
      ...previous,
      audienceMode: 'selected',
      selectedCustomerIds: selectedRows.map((row) => row._id),
      savedFilters: directoryFilters,
    }));
  };

  const useCurrentFilteredView = () => {
    setForm((previous) => ({
      ...previous,
      audienceMode: 'filtered',
      savedFilters: directoryFilters,
    }));
  };

  const useAllActiveCustomers = () => {
    setForm((previous) => ({
      ...previous,
      audienceMode: 'all_active',
    }));
  };

  const loadCampaignIntoForm = (row: CustomerCrmCampaignRow) => {
    setForm({
      id: row._id,
      name: row.name || '',
      subject: row.subject || '',
      headline: row.headline || '',
      message: row.message || '',
      audienceMode: row.audienceMode || 'selected',
      selectedCustomerIds: Array.isArray(row.selectedCustomerIds) ? row.selectedCustomerIds : [],
      savedFilters: row.filters || defaultFilters(),
      brochureFileName: row.brochureFileName || '',
      brochureDataUrl: '',
    });
    setMessage(`Loaded campaign ${row.campaignNumber} into the editor.`);
    setError('');
  };

  const handleBrochureUpload = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setForm((previous) => ({
        ...previous,
        brochureFileName: file.name,
        brochureDataUrl: dataUrl,
      }));
      setMessage(`Brochure attached: ${file.name}`);
      setError('');
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Failed to read brochure file.');
    }
  };

  const submitCampaign = async (action: 'draft' | 'send') => {
    setError('');
    setMessage('');

    if (!form.name.trim() && action === 'draft') {
      setError('Campaign name is required to save a draft.');
      return;
    }

    if (action === 'send' && !form.subject.trim()) {
      setError('Email subject is required before sending the campaign.');
      return;
    }

    if (action === 'send' && !form.message.trim()) {
      setError('Campaign message is required before sending the campaign.');
      return;
    }

    if (action === 'send' && !deliverableRows.length) {
      setError('There are no customers with email addresses in the selected audience.');
      return;
    }

    if (action === 'send') {
      const confirmed = await showConfirmDialog(
        `Send this campaign to ${deliverableRows.length} customer${deliverableRows.length === 1 ? '' : 's'} now?`,
        { title: 'Send Campaign', confirmText: 'Send Campaign' }
      );
      if (!confirmed) return;
    }

    setSavingCampaign(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/customer-crm/campaigns'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: form.id || undefined,
          action,
          name: form.name.trim(),
          subject: form.subject.trim(),
          headline: form.headline.trim(),
          message: form.message.trim(),
          audienceMode: form.audienceMode,
          selectedCustomerIds: form.selectedCustomerIds,
          filters: form.savedFilters,
          brochureFileName: form.brochureFileName,
          brochureDataUrl: form.brochureDataUrl,
        }),
      });

      setMessage(response?.message || (action === 'draft' ? 'Campaign draft saved.' : 'Campaign sent.'));
      setError('');
      await loadCampaigns();
      if (response?.data?._id) {
        setForm((previous) => ({
          ...previous,
          id: String(response.data._id),
          brochureDataUrl: '',
        }));
      } else if (action === 'send') {
        resetForm();
      }
    } catch (campaignError: any) {
      setError(campaignError?.message || `Failed to ${action === 'draft' ? 'save' : 'send'} campaign.`);
    } finally {
      setSavingCampaign(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={sectionTitleClass}>Campaign Management</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Send brochure and follow-up mail to customer groups</h2>
              <p className="mt-2 text-sm text-gray-400">Choose the audience from the directory, compose a professional message, save drafts, and keep campaign history in one place.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={useCurrentSelection} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5">
                Use Selected ({selectedRows.length})
              </button>
              <button type="button" onClick={useCurrentFilteredView} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5">
                Use Filtered View ({filteredRows.length})
              </button>
              <button type="button" onClick={useAllActiveCustomers} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5">
                All Active ({allRows.filter((row) => !row.isBlocked).length})
              </button>
            </div>
          </div>

          {message && <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</div>}
          {error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FloatingField label="Campaign Name" value={form.name} onChange={(value) => setForm((previous) => ({ ...previous, name: value }))} />
            <FloatingField label="Email Subject" value={form.subject} onChange={(value) => setForm((previous) => ({ ...previous, subject: value }))} />
            <FloatingField
              className="md:col-span-2"
              label="Headline Shown Inside The Email (optional)"
              value={form.headline}
              onChange={(value) => setForm((previous) => ({ ...previous, headline: value }))}
            />
          </div>

          <FloatingField
            className="mt-3"
            label="Campaign Message"
            rows={7}
            value={form.message}
            onChange={(value) => setForm((previous) => ({ ...previous, message: value }))}
          />

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className={sectionTitleClass}>Audience</p>
              <p className="mt-2 text-sm text-white">{formatAudienceMode(form.audienceMode)}</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Audience</p>
                  <p className="mt-2 text-xl font-semibold text-white">{audienceRows.length}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">Will Receive</p>
                  <p className="mt-2 text-xl font-semibold text-white">{deliverableRows.length}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Missing Email</p>
                  <p className="mt-2 text-xl font-semibold text-white">{missingEmailRows.length}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Brochure Attachment</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100">
                    Upload Brochure
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        void handleBrochureUpload(e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  {form.brochureFileName && <span className="text-xs text-gray-300">{form.brochureFileName}</span>}
                  {form.brochureFileName && (
                    <button
                      type="button"
                      onClick={() => setForm((previous) => ({ ...previous, brochureFileName: '', brochureDataUrl: '' }))}
                      className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className={sectionTitleClass}>Recipient Preview</p>
              <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                {deliverableRows.slice(0, 12).map((row) => (
                  <div key={row._id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-gray-200">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.email}</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                        {categoryLabel(row.customerCategory)}
                      </span>
                    </div>
                  </div>
                ))}
                {!deliverableRows.length && <p className="text-sm text-gray-400">No email-ready customers in the current audience.</p>}
                {deliverableRows.length > 12 && (
                  <p className="text-xs text-gray-400">Showing first 12 recipients. The full audience will still be used when sending.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={savingCampaign} onClick={() => void submitCampaign('draft')} className={buttonClass}>
              {savingCampaign ? 'Saving...' : form.id ? 'Update Draft' : 'Save Draft'}
            </button>
            <button
              type="button"
              disabled={savingCampaign}
              onClick={() => void submitCampaign('send')}
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
            >
              {savingCampaign ? 'Sending...' : 'Send Campaign'}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200">
              New Campaign
            </button>
            <button type="button" onClick={onClearSelection} className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-gray-200">
              Clear Directory Selection
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={sectionTitleClass}>Campaign History</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Saved drafts and sent brochure campaigns</h2>
          </div>
          <button type="button" onClick={() => void loadCampaigns()} className="rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/5">
            Refresh
          </button>
        </div>

        <div className="mt-4 max-h-[820px] space-y-3 overflow-y-auto pr-1">
          {campaigns.map((row) => (
            <div key={row._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-white">{row.name || row.subject || row.campaignNumber}</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-gray-200">
                      {row.campaignNumber}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-400">{row.subject || 'No subject saved yet.'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.status === 'sent' ? 'bg-emerald-500/15 text-emerald-100' : row.status === 'failed' ? 'bg-rose-500/15 text-rose-100' : 'bg-amber-500/15 text-amber-100'}`}>
                  {categoryLabel(row.status)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Audience</p>
                  <p className="mt-2 text-sm font-semibold text-white">{formatAudienceMode(row.audienceMode)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Delivered</p>
                  <p className="mt-2 text-sm font-semibold text-white">{row.deliveredCount || 0} / {row.recipientCount || 0}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Brochure</p>
                  <p className="mt-2 text-sm font-semibold text-white">{row.brochureFileName || 'Not attached'}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Sent</p>
                  <p className="mt-2 text-sm font-semibold text-white">{relativeDate(row.sentAt || row.updatedAt)}</p>
                </div>
              </div>

              {row.lastError && row.status === 'failed' && (
                <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {row.lastError}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => loadCampaignIntoForm(row)} className="rounded-md bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100">
                  {row.status === 'draft' ? 'Open Draft' : 'Use As Copy'}
                </button>
              </div>
            </div>
          ))}

          {!loadingCampaigns && !campaigns.length && (
            <p className="text-sm text-gray-400">No campaigns saved yet. Use the editor to save a draft or send a brochure campaign.</p>
          )}
          {loadingCampaigns && <p className="text-sm text-gray-400">Loading campaign history...</p>}
        </div>
      </div>
    </div>
  );
};
