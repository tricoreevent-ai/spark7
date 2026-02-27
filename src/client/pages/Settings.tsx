import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GENERAL_SETTINGS,
  GeneralSettings,
  getGeneralSettings,
  loadGeneralSettingsFromServer,
  mergeGeneralSettings,
  saveGeneralSettings,
} from '../utils/generalSettings';
import { printInvoice } from '../utils/invoicePrint';
import { apiUrl, fetchApiJson } from '../utils/api';
import {
  FONT_SCALE_STEP,
  ResolvedUiPreferences,
  UI_PREFERENCES_UPDATED_EVENT,
  applyAndPersistUiPreferencesLocal,
  clampFontScale,
  normalizeUiPreferences,
  readUiPreferencesFromStorage,
  saveUiPreferencesToServer,
} from '../utils/uiPreferences';

interface BackupRestoreHistoryItem {
  id: string;
  action: string;
  createdAt?: string;
  userId?: string;
  actorName?: string;
  actorEmail?: string;
  metadata?: Record<string, any>;
}

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<GeneralSettings>(() => getGeneralSettings());
  const [uiPreferences, setUiPreferences] = useState<ResolvedUiPreferences>(() => readUiPreferencesFromStorage());
  const [uiSettingsMessage, setUiSettingsMessage] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [restoreFileName, setRestoreFileName] = useState('');
  const [restoreFileContent, setRestoreFileContent] = useState('');
  const [backupRestoreMessage, setBackupRestoreMessage] = useState('');
  const [backupRestoreHistory, setBackupRestoreHistory] = useState<BackupRestoreHistoryItem[]>([]);
  const [backupRestoreHistoryLoading, setBackupRestoreHistoryLoading] = useState(false);
  const [backupRestoreHistoryError, setBackupRestoreHistoryError] = useState('');
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null);

  const sectionCard = 'rounded-xl border border-white/10 bg-white/5 p-5';

  useEffect(() => {
    const loadCurrentUserRole = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await fetchApiJson(apiUrl('/api/auth/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUserRole(String(response?.user?.role || '').toLowerCase());
        const initialPreferences = normalizeUiPreferences(response?.user?.uiPreferences);
        const applied = applyAndPersistUiPreferencesLocal(initialPreferences);
        setUiPreferences(applied);
      } catch {
        // ignore role lookup failure in settings
      }
    };
    void loadCurrentUserRole();

    const loadSharedGeneralSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const merged = await loadGeneralSettingsFromServer(token || undefined, { force: true });
        setSettings(merged);
        saveGeneralSettings(merged);
        window.dispatchEvent(new Event('sarva-settings-updated'));
      } catch {
        // keep using local settings when shared settings are unavailable
      }
    };
    void loadSharedGeneralSettings();
  }, []);

  useEffect(() => {
    const onUiPreferencesUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ResolvedUiPreferences>).detail;
      if (!detail) return;
      setUiPreferences(normalizeUiPreferences(detail));
    };
    window.addEventListener(UI_PREFERENCES_UPDATED_EVENT, onUiPreferencesUpdate as EventListener);
    return () => {
      window.removeEventListener(UI_PREFERENCES_UPDATED_EVENT, onUiPreferencesUpdate as EventListener);
    };
  }, []);

  const updateUiPreferences = async (next: ResolvedUiPreferences) => {
    const local = applyAndPersistUiPreferencesLocal(next);
    setUiPreferences(local);
    try {
      const saved = await saveUiPreferencesToServer(local);
      if (saved) {
        const synced = applyAndPersistUiPreferencesLocal(saved);
        setUiPreferences(synced);
      }
      setUiSettingsMessage('Appearance saved.');
    } catch {
      setUiSettingsMessage('Saved locally. Server sync failed.');
    }
    setTimeout(() => setUiSettingsMessage(''), 2000);
  };

  const updateBusiness = (field: keyof GeneralSettings['business'], value: string) => {
    setSettings((prev) => ({ ...prev, business: { ...prev.business, [field]: value } }));
  };

  const updateBusinessLogo = (
    field: 'invoiceLogoDataUrl' | 'reportLogoDataUrl',
    value: string
  ) => {
    setSettings((prev) => ({ ...prev, business: { ...prev.business, [field]: value } }));
  };

  const updateInvoice = (
    field: keyof GeneralSettings['invoice'],
    value: string | number | boolean
  ) => {
    setSettings((prev) => ({ ...prev, invoice: { ...prev.invoice, [field]: value } }));
  };

  const updatePrinting = (
    field: keyof GeneralSettings['printing'],
    value: string | boolean
  ) => {
    setSettings((prev) => ({ ...prev, printing: { ...prev.printing, [field]: value } }));
  };

  const saveSettings = async () => {
    const normalized = mergeGeneralSettings(settings);
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await fetchApiJson(apiUrl('/api/general-settings'), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ settings: normalized }),
        });
        const saved = mergeGeneralSettings(
          (response?.data?.settings as Partial<GeneralSettings> | undefined) || normalized
        );
        saveGeneralSettings(saved);
        setSettings(saved);
        window.dispatchEvent(new Event('sarva-settings-updated'));
        setSavedMessage('Settings saved and synced for all systems.');
        setTimeout(() => setSavedMessage(''), 2400);
        return;
      } catch (error: any) {
        console.error('Failed to save shared settings:', error);
      }
    }

    saveGeneralSettings(normalized);
    window.dispatchEvent(new Event('sarva-settings-updated'));
    setSavedMessage(token ? 'Saved locally, but server sync failed.' : 'Settings saved locally.');
    setTimeout(() => setSavedMessage(''), 2400);
  };

  const isSuperAdmin = currentUserRole === 'super_admin';

  const loadBackupRestoreHistory = async () => {
    if (!isSuperAdmin) {
      setBackupRestoreHistory([]);
      setBackupRestoreHistoryError('');
      return;
    }

    try {
      setBackupRestoreHistoryLoading(true);
      setBackupRestoreHistoryError('');
      const token = localStorage.getItem('token');
      if (!token) {
        setBackupRestoreHistory([]);
        return;
      }

      const response = await fetchApiJson(apiUrl('/api/settings/database-history?limit=40'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = Array.isArray(response?.data?.history)
        ? (response.data.history as BackupRestoreHistoryItem[])
        : [];
      setBackupRestoreHistory(rows);
    } catch (error: any) {
      setBackupRestoreHistory([]);
      setBackupRestoreHistoryError(error?.message || 'Failed to load backup/restore history');
    } finally {
      setBackupRestoreHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadBackupRestoreHistory();
  }, [isSuperAdmin]);

  const downloadDatabaseBackup = async () => {
    try {
      setBackupInProgress(true);
      setBackupRestoreMessage('');
      const token = localStorage.getItem('token');
      const response = await fetch(apiUrl('/api/settings/database-backup'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const text = await response.text();
        let message = `Backup failed with status ${response.status}`;
        try {
          const parsed = JSON.parse(text);
          message = parsed?.error || parsed?.message || message;
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="(.+?)"/i);
      const filename = match?.[1] || `sarva-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setBackupRestoreMessage('Database backup downloaded successfully.');
      void loadBackupRestoreHistory();
      setTimeout(() => setBackupRestoreMessage(''), 3200);
    } catch (error: any) {
      setBackupRestoreMessage(error?.message || 'Failed to download backup');
    } finally {
      setBackupInProgress(false);
    }
  };

  const onRestoreFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setRestoreFileName(file.name);
      setRestoreFileContent(content);
    };
    reader.onerror = () => {
      setBackupRestoreMessage('Failed to read selected backup file');
    };
    reader.readAsText(file);
  };

  const restoreDatabaseBackup = async () => {
    if (!restoreFileContent) {
      setBackupRestoreMessage('Please select a backup file first.');
      return;
    }

    const confirmed = confirm(
      'This will restore database data and may overwrite existing records. Continue?'
    );
    if (!confirmed) return;

    try {
      setRestoreInProgress(true);
      setBackupRestoreMessage('');
      const token = localStorage.getItem('token');
      const response = await fetchApiJson(apiUrl('/api/settings/database-restore'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'replace',
          backupContent: restoreFileContent,
        }),
      });

      const collections = response?.data?.collectionsRestored;
      setBackupRestoreMessage(
        `Database restored successfully${typeof collections === 'number' ? ` (${collections} collections).` : '.'}`
      );
      setRestoreFileName('');
      setRestoreFileContent('');
      if (restoreFileInputRef.current) {
        restoreFileInputRef.current.value = '';
      }
      void loadBackupRestoreHistory();
    } catch (error: any) {
      setBackupRestoreMessage(error?.message || 'Failed to restore backup');
    } finally {
      setRestoreInProgress(false);
    }
  };

  const nextInvoicePreview = useMemo(() => {
    const number = String(settings.invoice.nextNumber).padStart(6, '0');
    return `${settings.invoice.prefix}${number}`;
  }, [settings.invoice.nextNumber, settings.invoice.prefix]);

  const handleLogoSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    field: 'invoiceLogoDataUrl' | 'reportLogoDataUrl'
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert('Image size should be less than 2 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        alert('Could not read image file');
        return;
      }
      updateBusinessLogo(field, result);
    };
    reader.onerror = () => {
      alert('Failed to load selected image');
    };
    reader.readAsDataURL(file);
  };

  const testPrint = () => {
    const testInvoiceNumber = settings.invoice.useCustomInvoiceNumber
      ? nextInvoicePreview
      : 'TEST-INV-000001';

    const success = printInvoice(
      {
        invoiceNumber: testInvoiceNumber,
        saleNumber: 'TEST-SALE-001',
        createdAt: new Date().toISOString(),
        paymentMethod: 'cash',
        customerName: 'Walk-in Customer',
        customerPhone: '9876543210',
        customerEmail: 'customer@example.com',
        subtotal: 1000,
        totalGst: 180,
        totalAmount: 1180,
        discountAmount: 0,
        notes: 'Test print from Settings',
        items: [
          {
            productName: 'Sample Product',
            sku: 'SMP-001',
            hsnCode: '8471',
            quantity: 2,
            unitPrice: 500,
            gstRate: 18,
            gstAmount: 180,
            lineTotal: 1180,
          },
        ],
      },
      settings
    );

    if (!success) {
      alert('Could not open print window. Please allow popups and try again.');
    }
  };

  const formatBackupAction = (action: string) => {
    if (action === 'database_backup_generated') return 'Backup';
    if (action === 'database_restore_executed') return 'Restore';
    return action;
  };

  const formatActorName = (row: BackupRestoreHistoryItem) => {
    if (row.actorName) return row.actorName;
    if (row.actorEmail) return row.actorEmail;
    if (row.userId) return row.userId;
    return '-';
  };

  const formatHistoryTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">General Settings</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={testPrint}
            className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Test Print
          </button>
          <button
            type="button"
            onClick={saveSettings}
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            Save Settings
          </button>
        </div>
      </div>

      {savedMessage && (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {savedMessage}
        </div>
      )}

      <section className={sectionCard}>
        <h2 className="mb-4 text-lg font-semibold text-white">Appearance</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-gray-200">Theme</p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-1.5">
              <button
                type="button"
                title="Dark theme"
                onClick={() => void updateUiPreferences({ ...uiPreferences, themeMode: 'dark' })}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  uiPreferences.themeMode === 'dark' ? 'bg-indigo-500/25 text-indigo-100' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                🌙 Dark
              </button>
              <button
                type="button"
                title="Light theme"
                onClick={() => void updateUiPreferences({ ...uiPreferences, themeMode: 'light' })}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  uiPreferences.themeMode === 'light' ? 'bg-amber-500/25 text-amber-100' : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                ☀️ Light
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-200">Font Size</p>
            <div className="mt-2 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1.5">
              <button
                type="button"
                title="Decrease font size"
                onClick={() => void updateUiPreferences({
                  ...uiPreferences,
                  fontScale: clampFontScale(uiPreferences.fontScale - FONT_SCALE_STEP),
                })}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/10"
              >
                a-
              </button>
              <div className="px-2 text-xs font-semibold text-gray-300">{Math.round(uiPreferences.fontScale * 100)}%</div>
              <button
                type="button"
                title="Increase font size"
                onClick={() => void updateUiPreferences({
                  ...uiPreferences,
                  fontScale: clampFontScale(uiPreferences.fontScale + FONT_SCALE_STEP),
                })}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/10"
              >
                A+
              </button>
            </div>
          </div>
        </div>
        {uiSettingsMessage && (
          <p className="mt-3 text-xs text-indigo-200">{uiSettingsMessage}</p>
        )}
      </section>

      <section className={sectionCard}>
        <h2 className="mb-4 text-lg font-semibold text-white">Business Details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input className={inputClass} placeholder="Legal Name" value={settings.business.legalName} onChange={(e) => updateBusiness('legalName', e.target.value)} />
          <input className={inputClass} placeholder="Trade Name" value={settings.business.tradeName} onChange={(e) => updateBusiness('tradeName', e.target.value)} />
          <input className={inputClass} placeholder="GSTIN" value={settings.business.gstin} onChange={(e) => updateBusiness('gstin', e.target.value.toUpperCase())} />
          <input className={inputClass} placeholder="PAN" value={settings.business.pan} onChange={(e) => updateBusiness('pan', e.target.value.toUpperCase())} />
          <input className={inputClass} placeholder="Phone" value={settings.business.phone} onChange={(e) => updateBusiness('phone', e.target.value)} />
          <input className={inputClass} placeholder="Email" value={settings.business.email} onChange={(e) => updateBusiness('email', e.target.value)} />
          <input className={inputClass} placeholder="Address Line 1" value={settings.business.addressLine1} onChange={(e) => updateBusiness('addressLine1', e.target.value)} />
          <input className={inputClass} placeholder="Address Line 2" value={settings.business.addressLine2} onChange={(e) => updateBusiness('addressLine2', e.target.value)} />
          <input className={inputClass} placeholder="City" value={settings.business.city} onChange={(e) => updateBusiness('city', e.target.value)} />
          <input className={inputClass} placeholder="State" value={settings.business.state} onChange={(e) => updateBusiness('state', e.target.value)} />
          <input className={inputClass} placeholder="Pincode" value={settings.business.pincode} onChange={(e) => updateBusiness('pincode', e.target.value)} />
          <input className={inputClass} placeholder="Country" value={settings.business.country} onChange={(e) => updateBusiness('country', e.target.value)} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <label className="mb-2 block text-sm font-semibold text-gray-200">Invoice Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleLogoSelect(e, 'invoiceLogoDataUrl')}
              className="block w-full text-xs text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-500/20 file:px-3 file:py-2 file:font-semibold file:text-indigo-100 hover:file:bg-indigo-500/30"
            />
            <p className="mt-1 text-xs text-gray-400">Used in invoice print. Max 2 MB.</p>
            {settings.business.invoiceLogoDataUrl ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
                <img src={settings.business.invoiceLogoDataUrl} alt="Invoice logo" className="h-16 w-auto rounded object-contain" />
                <button
                  type="button"
                  onClick={() => updateBusinessLogo('invoiceLogoDataUrl', '')}
                  className="mt-2 rounded-md bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                >
                  Remove Invoice Logo
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">No invoice logo selected.</p>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <label className="mb-2 block text-sm font-semibold text-gray-200">Report Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleLogoSelect(e, 'reportLogoDataUrl')}
              className="block w-full text-xs text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500/20 file:px-3 file:py-2 file:font-semibold file:text-emerald-100 hover:file:bg-emerald-500/30"
            />
            <p className="mt-1 text-xs text-gray-400">Used in report exports. Max 2 MB.</p>
            {settings.business.reportLogoDataUrl ? (
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-2">
                <img src={settings.business.reportLogoDataUrl} alt="Report logo" className="h-16 w-auto rounded object-contain" />
                <button
                  type="button"
                  onClick={() => updateBusinessLogo('reportLogoDataUrl', '')}
                  className="mt-2 rounded-md bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                >
                  Remove Report Logo
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">No report logo selected.</p>
            )}
          </div>
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-4 text-lg font-semibold text-white">Invoice Configuration</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input className={inputClass} placeholder="Invoice Title" value={settings.invoice.title} onChange={(e) => updateInvoice('title', e.target.value)} />
          <input className={inputClass} placeholder="Invoice Subtitle" value={settings.invoice.subtitle} onChange={(e) => updateInvoice('subtitle', e.target.value)} />
          <input className={inputClass} placeholder="Invoice Prefix" value={settings.invoice.prefix} onChange={(e) => updateInvoice('prefix', e.target.value)} />
          <input className={inputClass} type="number" min={1} placeholder="Next Invoice Number" value={settings.invoice.nextNumber} onChange={(e) => updateInvoice('nextNumber', Number(e.target.value || DEFAULT_GENERAL_SETTINGS.invoice.nextNumber))} />
        </div>

        <p className="mt-3 text-sm text-indigo-200">Next invoice preview: {nextInvoicePreview}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['useCustomInvoiceNumber', 'Use custom invoice numbering'],
            ['showCustomerDetails', 'Show customer details in invoice'],
            ['showBusinessGstin', 'Show GSTIN in invoice header'],
            ['showGstBreakup', 'Show GST breakup columns'],
            ['showHsnCode', 'Show HSN code column'],
          ].map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={Boolean(settings.invoice[field as keyof GeneralSettings['invoice']])}
                onChange={(e) => updateInvoice(field as keyof GeneralSettings['invoice'], e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <textarea className={inputClass} placeholder="Invoice Terms" rows={3} value={settings.invoice.terms} onChange={(e) => updateInvoice('terms', e.target.value)} />
          <textarea className={inputClass} placeholder="Footer Note" rows={2} value={settings.invoice.footerNote} onChange={(e) => updateInvoice('footerNote', e.target.value)} />
        </div>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-4 text-lg font-semibold text-white">Printing Preferences</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Printer Profile</label>
            <select className={inputClass} value={settings.printing.profile} onChange={(e) => updatePrinting('profile', e.target.value)}>
              <option value="a4">A4 / Laser / Inkjet</option>
              <option value="thermal80">Thermal 80mm</option>
              <option value="thermal58">Thermal 58mm</option>
            </select>
          </div>
          <label className="mt-7 flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={settings.printing.promptAfterSale} onChange={(e) => updatePrinting('promptAfterSale', e.target.checked)} />
            Ask to print after each sale
          </label>
          <label className="mt-7 flex items-center gap-2 text-sm text-gray-200">
            <input type="checkbox" checked={settings.printing.autoPrintAfterSale} onChange={(e) => updatePrinting('autoPrintAfterSale', e.target.checked)} />
            Auto print after each sale
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={settings.printing.showPrintPreviewHint} onChange={(e) => updatePrinting('showPrintPreviewHint', e.target.checked)} />
          Show print preview hint in sales page
        </label>

        <p className="mt-3 text-xs text-gray-400">
          Printing uses your system print dialog, so it supports all installed printers and drivers.
        </p>
      </section>

      <section className={sectionCard}>
        <h2 className="mb-2 text-lg font-semibold text-white">Database Backup & Restore</h2>
        <p className="text-sm text-gray-300">
          Admin module utility for full database backup and restore. Only <span className="font-semibold text-white">super admin</span> can run these actions.
        </p>

        {!isSuperAdmin && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Access restricted: current user role is <span className="font-semibold">{currentUserRole || 'unknown'}</span>. Super admin is required.
          </div>
        )}

        {backupRestoreMessage && (
          <div className="mt-3 rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100">
            {backupRestoreMessage}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Take Backup</h3>
            <p className="mt-1 text-xs text-gray-400">Downloads full database backup JSON file.</p>
            <button
              type="button"
              onClick={downloadDatabaseBackup}
              disabled={!isSuperAdmin || backupInProgress}
              className="mt-3 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {backupInProgress ? 'Preparing backup...' : 'Download Backup'}
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Restore Backup</h3>
            <p className="mt-1 text-xs text-gray-400">Upload backup JSON and restore database.</p>
            <input
              ref={restoreFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={onRestoreFileChange}
              disabled={!isSuperAdmin || restoreInProgress}
              className="mt-3 block w-full text-xs text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-rose-500/20 file:px-3 file:py-2 file:font-semibold file:text-rose-100 hover:file:bg-rose-500/30"
            />
            <p className="mt-2 text-xs text-gray-400">
              Selected: <span className="text-gray-200">{restoreFileName || 'None'}</span>
            </p>
            <button
              type="button"
              onClick={restoreDatabaseBackup}
              disabled={!isSuperAdmin || !restoreFileContent || restoreInProgress}
              className="mt-2 rounded-md bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {restoreInProgress ? 'Restoring...' : 'Restore Backup'}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Backup & Restore History</h3>
            <button
              type="button"
              onClick={loadBackupRestoreHistory}
              disabled={!isSuperAdmin || backupRestoreHistoryLoading}
              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {backupRestoreHistoryLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          {backupRestoreHistoryError && (
            <div className="mt-2 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-100">
              {backupRestoreHistoryError}
            </div>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-gray-300">
              <thead className="text-gray-400">
                <tr>
                  <th className="px-2 py-2 font-medium">Date/Time</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                  <th className="px-2 py-2 font-medium">Collections</th>
                  <th className="px-2 py-2 font-medium">Mode</th>
                  <th className="px-2 py-2 font-medium">User</th>
                </tr>
              </thead>
              <tbody>
                {backupRestoreHistory.length === 0 && !backupRestoreHistoryLoading ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-gray-500">
                      No backup/restore history found.
                    </td>
                  </tr>
                ) : (
                  backupRestoreHistory.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="px-2 py-2">{formatHistoryTime(row.createdAt)}</td>
                      <td className="px-2 py-2">{formatBackupAction(row.action)}</td>
                      <td className="px-2 py-2">
                        {String(row.metadata?.collectionsRestored || row.metadata?.collections || '-')}
                      </td>
                      <td className="px-2 py-2">{String(row.metadata?.mode || '-')}</td>
                      <td className="px-2 py-2">{formatActorName(row)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};
