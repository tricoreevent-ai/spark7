import React, { useEffect, useMemo, useState } from 'react';
import { CardTabs } from '../components/CardTabs';
import { PaginationControls } from '../components/PaginationControls';
import { apiUrl, fetchApiJson } from '../utils/api';
import { showAlertDialog, showConfirmDialog } from '../utils/appDialogs';

type AdminReportTab = 'overview' | 'audit' | 'logins' | 'transactions';

type AdminReportPagination = {
  total: number;
  skip: number;
  limit: number;
};

type AdminLogRow = {
  id: string;
  createdAt: string | null;
  module: string;
  moduleLabel?: string;
  action: string;
  actionLabel?: string;
  entityType: string;
  entityLabel?: string;
  entityId: string;
  referenceNo: string;
  ipAddress: string;
  ipAddressLabel?: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  summary: string;
  metadata?: Record<string, any>;
};

type LoginActivityRow = AdminLogRow & {
  result: string;
  reason: string;
  device: string;
};

type OverviewData = {
  currentUserRole: string;
  canManageLogs: boolean;
  settings: { warningRowLimit: number };
  summary: {
    totalAuditLogs: number;
    loginEvents: number;
    transactionEvents: number;
    warningRowLimit: number;
    thresholdExceeded: boolean;
    overLimitBy: number;
    oldestEntryAt: string | null;
    latestEntryAt: string | null;
  };
  moduleOptions: {
    audit: string[];
    transactions: string[];
  };
  warning: null | {
    id: string;
    severity: string;
    message: string;
    detectedAt: string;
    metadata?: Record<string, any>;
  };
};

const LOGIN_ACTION_OPTIONS = [
  { value: '', label: 'All login events' },
  { value: 'login', label: 'Login success' },
  { value: 'login_failed', label: 'Login failed' },
  { value: 'login_otp_challenge_sent', label: 'OTP challenge sent' },
  { value: 'login_otp_failed', label: 'OTP failed' },
  { value: 'login_otp_resent', label: 'OTP resent' },
  { value: 'logout', label: 'Logout' },
];

const today = new Date().toISOString().slice(0, 10);
const defaultStartDate = (() => {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
})();

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRole = (value: string): string =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatOptionLabel = (value: string): string =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const toCsvCell = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const downloadCsv = (fileName: string, headers: string[], rows: Array<Array<unknown>>) => {
  const csv = [headers.join(','), ...rows.map((row) => row.map((cell) => toCsvCell(cell)).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const getPaginationMeta = (pagination: AdminReportPagination) => {
  const currentPage = Math.max(1, Math.floor(pagination.skip / Math.max(1, pagination.limit)) + 1);
  const totalPages = Math.max(1, Math.ceil(pagination.total / Math.max(1, pagination.limit)));
  const startIndex = pagination.total > 0 ? pagination.skip + 1 : 0;
  const endIndex = Math.min(pagination.skip + pagination.limit, pagination.total);
  return { currentPage, totalPages, startIndex, endIndex };
};

export const AdminReports: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AdminReportTab>('overview');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(today);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [warningRowLimitInput, setWarningRowLimitInput] = useState(String(5000));
  const [savingLimit, setSavingLimit] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);

  const [auditRows, setAuditRows] = useState<AdminLogRow[]>([]);
  const [auditPagination, setAuditPagination] = useState<AdminReportPagination>({ total: 0, skip: 0, limit: 25 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModule, setAuditModule] = useState('');
  const [auditAction, setAuditAction] = useState('');

  const [loginRows, setLoginRows] = useState<LoginActivityRow[]>([]);
  const [loginPagination, setLoginPagination] = useState<AdminReportPagination>({ total: 0, skip: 0, limit: 25 });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginSearch, setLoginSearch] = useState('');
  const [loginAction, setLoginAction] = useState('');

  const [transactionRows, setTransactionRows] = useState<AdminLogRow[]>([]);
  const [transactionPagination, setTransactionPagination] = useState<AdminReportPagination>({ total: 0, skip: 0, limit: 25 });
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionModule, setTransactionModule] = useState('');

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  const clearBanner = () => {
    setError('');
    setMessage('');
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const response = await fetchApiJson(apiUrl('/api/admin-reports/overview'), { headers });
      const nextOverview = response?.data as OverviewData;
      setOverview(nextOverview || null);
      setWarningRowLimitInput(String(nextOverview?.settings?.warningRowLimit || 5000));
    } catch (loadError: any) {
      setError(loadError.message || 'Failed to load admin reports overview');
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadAuditLogs = async (page = 1, pageSize = auditPagination.limit, silent = false) => {
    if (!silent) setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
      });
      if (auditSearch.trim()) params.set('search', auditSearch.trim());
      if (auditModule) params.set('module', auditModule);
      if (auditAction) params.set('action', auditAction);

      const response = await fetchApiJson(apiUrl(`/api/admin-reports/audit-logs?${params.toString()}`), { headers });
      setAuditRows(Array.isArray(response?.data) ? response.data : []);
      setAuditPagination(response?.pagination || { total: 0, skip: 0, limit: pageSize });
    } catch (loadError: any) {
      setError(loadError.message || 'Failed to load audit logs');
    } finally {
      setAuditLoading(false);
    }
  };

  const loadLoginActivity = async (page = 1, pageSize = loginPagination.limit, silent = false) => {
    if (!silent) setLoginLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
      });
      if (loginSearch.trim()) params.set('search', loginSearch.trim());
      if (loginAction) params.set('action', loginAction);

      const response = await fetchApiJson(apiUrl(`/api/admin-reports/login-activity?${params.toString()}`), { headers });
      setLoginRows(Array.isArray(response?.data) ? response.data : []);
      setLoginPagination(response?.pagination || { total: 0, skip: 0, limit: pageSize });
    } catch (loadError: any) {
      setError(loadError.message || 'Failed to load login activity');
    } finally {
      setLoginLoading(false);
    }
  };

  const loadTransactionActivity = async (page = 1, pageSize = transactionPagination.limit, silent = false) => {
    if (!silent) setTransactionLoading(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
      });
      if (transactionSearch.trim()) params.set('search', transactionSearch.trim());
      if (transactionModule) params.set('module', transactionModule);

      const response = await fetchApiJson(apiUrl(`/api/admin-reports/transaction-activity?${params.toString()}`), { headers });
      setTransactionRows(Array.isArray(response?.data) ? response.data : []);
      setTransactionPagination(response?.pagination || { total: 0, skip: 0, limit: pageSize });
    } catch (loadError: any) {
      setError(loadError.message || 'Failed to load transaction activity');
    } finally {
      setTransactionLoading(false);
    }
  };

  useEffect(() => {
    clearBanner();
    void loadOverview();
  }, []);

  useEffect(() => {
    clearBanner();
    if (activeTab === 'audit') {
      void loadAuditLogs(1, auditPagination.limit);
      return;
    }
    if (activeTab === 'logins') {
      void loadLoginActivity(1, loginPagination.limit);
      return;
    }
    if (activeTab === 'transactions') {
      void loadTransactionActivity(1, transactionPagination.limit);
    }
  }, [activeTab, startDate, endDate, auditSearch, auditModule, auditAction, loginSearch, loginAction, transactionSearch, transactionModule]);

  const saveWarningLimit = async () => {
    clearBanner();
    setSavingLimit(true);
    try {
      const warningRowLimit = Math.max(500, Number(warningRowLimitInput || 0));
      const response = await fetchApiJson(apiUrl('/api/admin-reports/settings'), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ settings: { warningRowLimit } }),
      });
      setMessage(response?.message || 'Warning limit updated');
      await loadOverview();
    } catch (saveError: any) {
      setError(saveError.message || 'Failed to save warning limit');
    } finally {
      setSavingLimit(false);
    }
  };

  const downloadBackup = async () => {
    clearBanner();
    setBackupLoading(true);
    try {
      const response = await fetch(apiUrl('/api/settings/database-backup'), {
        headers: { Authorization: headers.Authorization },
      });

      if (!response.ok) {
        const text = await response.text();
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string };
          throw new Error(parsed.error || parsed.message || 'Failed to download backup');
        } catch {
          throw new Error(text || 'Failed to download backup');
        }
      }

      const blob = await response.blob();
      const fileNameMatch = /filename="?([^"]+)"?/i.exec(response.headers.get('content-disposition') || '');
      const fileName = fileNameMatch?.[1] || `sarva-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage('Database backup downloaded successfully.');
    } catch (downloadError: any) {
      setError(downloadError.message || 'Failed to download backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const cleanupLogs = async () => {
    clearBanner();
    const confirmed = await showConfirmDialog(
      'Take backup first if you may need these old logs later. Continue and delete old log rows above the current warning limit?',
      {
        title: 'Delete Old Logs',
        confirmText: 'Delete Old Logs',
        cancelText: 'Cancel',
        severity: 'warning',
      }
    );
    if (!confirmed) return;

    setCleanupLoading(true);
    try {
      const keepLatestRows = Math.max(500, Number(warningRowLimitInput || overview?.settings?.warningRowLimit || 5000));
      const response = await fetchApiJson(apiUrl('/api/admin-reports/cleanup'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ keepLatestRows }),
      });
      setMessage(response?.message || 'Old logs deleted successfully.');
      await loadOverview();
      if (activeTab === 'audit') await loadAuditLogs(1, auditPagination.limit, true);
      if (activeTab === 'logins') await loadLoginActivity(1, loginPagination.limit, true);
      if (activeTab === 'transactions') await loadTransactionActivity(1, transactionPagination.limit, true);
    } catch (cleanupError: any) {
      setError(cleanupError.message || 'Failed to delete old logs');
    } finally {
      setCleanupLoading(false);
    }
  };

  const exportReport = async (reportType: 'audit-logs' | 'login-activity' | 'transaction-activity') => {
    clearBanner();
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (reportType === 'audit-logs') {
        if (auditSearch.trim()) params.set('search', auditSearch.trim());
        if (auditModule) params.set('module', auditModule);
        if (auditAction) params.set('action', auditAction);
      } else if (reportType === 'login-activity') {
        if (loginSearch.trim()) params.set('search', loginSearch.trim());
        if (loginAction) params.set('action', loginAction);
      } else {
        if (transactionSearch.trim()) params.set('search', transactionSearch.trim());
        if (transactionModule) params.set('module', transactionModule);
      }

      const response = await fetchApiJson(apiUrl(`/api/admin-reports/export/${reportType}?${params.toString()}`), { headers });
      const rows: any[] = Array.isArray(response?.data) ? response.data : [];
      const truncated = Boolean(response?.meta?.truncated);

      if (reportType === 'login-activity') {
        downloadCsv(
          'admin-login-activity.csv',
          ['Date & Time', 'Event', 'Result', 'User', 'Email', 'IP Address', 'Reason', 'Device'],
          rows.map((row) => [
            formatDateTime(row.createdAt),
            row.actionLabel || row.action,
            row.result || '',
            row.actorName || '-',
            row.actorEmail || '-',
            row.ipAddressLabel || row.ipAddress || '-',
            row.reason || '-',
            row.device || '-',
          ])
        );
      } else if (reportType === 'transaction-activity') {
        downloadCsv(
          'admin-transaction-activity.csv',
          ['Date & Time', 'Area', 'Activity', 'Record', 'Reference', 'User', 'Email', 'What happened'],
          rows.map((row) => [
            formatDateTime(row.createdAt),
            row.moduleLabel || row.module,
            row.actionLabel || row.action,
            row.entityLabel || row.entityType || '-',
            row.referenceNo || '-',
            row.actorName || '-',
            row.actorEmail || '-',
            row.summary || '-',
          ])
        );
      } else {
        downloadCsv(
          'admin-audit-logs.csv',
          ['Date & Time', 'Area', 'Activity', 'Record', 'Reference', 'User', 'Email', 'IP Address', 'What happened'],
          rows.map((row) => [
            formatDateTime(row.createdAt),
            row.moduleLabel || row.module,
            row.actionLabel || row.action,
            row.entityLabel || row.entityType || '-',
            row.referenceNo || '-',
            row.actorName || '-',
            row.actorEmail || '-',
            row.ipAddressLabel || row.ipAddress || '-',
            row.summary || '-',
          ])
        );
      }

      if (truncated) {
        await showAlertDialog('Export is limited to the latest 2000 rows for one download. Narrow the date range if you need a smaller slice.', {
          title: 'Export Limit Applied',
          confirmText: 'OK',
          severity: 'info',
        });
      }
    } catch (exportError: any) {
      setError(exportError.message || 'Failed to export report');
    }
  };

  const overviewCards = overview
    ? [
        { label: 'Total Activity Rows', value: overview.summary.totalAuditLogs, accent: 'from-sky-500/20 to-cyan-500/5 border-sky-500/20' },
        { label: 'Login Events', value: overview.summary.loginEvents, accent: 'from-emerald-500/20 to-teal-500/5 border-emerald-500/20' },
        { label: 'Transaction Events', value: overview.summary.transactionEvents, accent: 'from-violet-500/20 to-indigo-500/5 border-violet-500/20' },
        { label: 'Warning Limit', value: overview.summary.warningRowLimit, accent: 'from-amber-500/20 to-orange-500/5 border-amber-500/20' },
      ]
    : [];

  const auditMeta = getPaginationMeta(auditPagination);
  const loginMeta = getPaginationMeta(loginPagination);
  const transactionMeta = getPaginationMeta(transactionPagination);

  const renderTableContainer = (children: React.ReactNode) => (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Admin Reports</p>
          <h1 className="mt-2 text-3xl font-bold text-white">System And Application Reports</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-300">
            Review user activity, sign-in history, and business activity in one place. When log rows grow too large, the page warns the team to take backup and clean old data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void loadOverview();
              if (activeTab === 'audit') void loadAuditLogs(1, auditPagination.limit, true);
              if (activeTab === 'logins') void loadLoginActivity(1, loginPagination.limit, true);
              if (activeTab === 'transactions') void loadTransactionActivity(1, transactionPagination.limit, true);
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Refresh
          </button>
          {overview?.canManageLogs ? (
            <button
              type="button"
              onClick={downloadBackup}
              disabled={backupLoading}
              className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {backupLoading ? 'Preparing Backup...' : 'Take Backup'}
            </button>
          ) : null}
          {overview?.canManageLogs ? (
            <button
              type="button"
              onClick={cleanupLogs}
              disabled={cleanupLoading}
              className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-60"
            >
              {cleanupLoading ? 'Deleting...' : 'Delete Old Logs'}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border bg-gradient-to-br p-4 ${card.accent}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">{card.label}</p>
            <p className="mt-3 text-3xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {overview?.summary.thresholdExceeded ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Log Storage Warning</p>
              <h2 className="mt-2 text-lg font-semibold text-white">Audit log rows crossed the configured warning limit</h2>
              <p className="mt-2 text-sm text-amber-50">
                Current rows: <span className="font-semibold">{overview.summary.totalAuditLogs}</span> | Warning limit: <span className="font-semibold">{overview.summary.warningRowLimit}</span> | Above limit by <span className="font-semibold">{overview.summary.overLimitBy}</span> rows.
              </p>
              <p className="mt-2 text-sm text-amber-100">
                Take backup first, then delete old logs that are no longer required. This warning is also raised for the super admin.
              </p>
              {overview.warning ? (
                <p className="mt-2 text-xs text-amber-100/90">
                  Warning opened on {formatDateTime(overview.warning.detectedAt)}.
                  {Number(overview.warning.metadata?.recipientCount || 0) > 0
                    ? ` Email sent to ${overview.warning.metadata?.recipientCount} super admin recipient(s).`
                    : ' Super admin flag recorded in the system.'}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-4 xl:grid-cols-[1.2fr,1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">Date Range</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-gray-300">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-sm text-gray-300">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-300">Warning Limit</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex-1 text-sm text-gray-300">
                Alert when rows cross
                <input
                  type="number"
                  min={500}
                  step={100}
                  value={warningRowLimitInput}
                  onChange={(e) => setWarningRowLimitInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={saveWarningLimit}
                disabled={savingLimit}
                className="rounded-lg border border-indigo-400/30 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500/30 disabled:opacity-60"
              >
                {savingLimit ? 'Saving...' : 'Save Limit'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Admin can set the warning row limit here. When the live log count crosses this limit, the page raises a warning for the super admin.
            </p>
          </div>
        </div>
      </div>

      <CardTabs
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'audit', label: 'Activity Log' },
          { key: 'logins', label: 'Login Details' },
          { key: 'transactions', label: 'Transaction Activity' },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
        ariaLabel="Admin Reports Tabs"
      />

      {activeTab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-[1.3fr,1fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Report Meaning</h2>
            <div className="mt-4 space-y-4 text-sm text-gray-300">
              <div>
                <p className="font-semibold text-white">Activity Log</p>
                <p>Every important action taken in the application, such as creating, updating, approving, deleting, or changing settings.</p>
              </div>
              <div>
                <p className="font-semibold text-white">Login Details</p>
                <p>Successful sign-ins, failed sign-ins, one-time passcode events, and sign-outs with time, user, IP address, and reason where available.</p>
              </div>
              <div>
                <p className="font-semibold text-white">Transaction Activity</p>
                <p>Business actions like sales, returns, stock movement, accounting activity, settlements, and membership transactions.</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold text-white">Current Status</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-300">
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Oldest available entry</p>
                <p className="mt-1 font-semibold text-white">{formatDateTime(overview?.summary.oldestEntryAt || null)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Latest available entry</p>
                <p className="mt-1 font-semibold text-white">{formatDateTime(overview?.summary.latestEntryAt || null)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Current viewer role</p>
                <p className="mt-1 font-semibold text-white">{formatRole(overview?.currentUserRole || '') || '-'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Cleanup access</p>
                <p className="mt-1 font-semibold text-white">{overview?.canManageLogs ? 'Super admin actions available' : 'View and threshold update only'}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'audit' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1 text-sm text-gray-300">
                Search activity
                <input
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search area, activity, reference, user, or reason"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="min-w-[200px] text-sm text-gray-300">
                Area
                <select
                  value={auditModule}
                  onChange={(e) => setAuditModule(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="">All modules</option>
                  {(overview?.moduleOptions.audit || []).map((option) => (
                    <option key={option} value={option}>
                      {formatOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[200px] text-sm text-gray-300">
                Activity
                <input
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  placeholder="Type part of the activity"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={() => void exportReport('audit-logs')}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Export CSV
              </button>
            </div>
          </div>
          {renderTableContainer(
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-gray-400">
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">What happened</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Loading audit logs...</td>
                  </tr>
                ) : auditRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">No audit logs found for the selected range and filters.</td>
                  </tr>
                ) : auditRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top text-gray-200">
                    <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold text-cyan-100">{row.moduleLabel || row.module || '-'}</td>
                    <td className="px-4 py-3">{row.actionLabel || row.action || '-'}</td>
                    <td className="px-4 py-3">{row.entityLabel || row.entityType || '-'}</td>
                    <td className="px-4 py-3">{row.referenceNo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{row.actorName || '-'}</div>
                      <div className="text-xs text-gray-400">{row.actorEmail || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{row.ipAddressLabel || row.ipAddress || '-'}</td>
                    <td className="px-4 py-3 text-gray-300">{row.summary || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PaginationControls
            currentPage={auditMeta.currentPage}
            totalPages={auditMeta.totalPages}
            totalRows={auditPagination.total}
            pageSize={auditPagination.limit}
            startIndex={auditMeta.startIndex}
            endIndex={auditMeta.endIndex}
            itemLabel="log rows"
            onPageChange={(page) => void loadAuditLogs(page, auditPagination.limit)}
            onPageSizeChange={(pageSize) => void loadAuditLogs(1, pageSize)}
          />
        </div>
      ) : null}

      {activeTab === 'logins' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1 text-sm text-gray-300">
                Search sign-in details
                <input
                  value={loginSearch}
                  onChange={(e) => setLoginSearch(e.target.value)}
                  placeholder="Search user, reason, email, or IP address"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="min-w-[220px] text-sm text-gray-300">
                Event
                <select
                  value={loginAction}
                  onChange={(e) => setLoginAction(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  {LOGIN_ACTION_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void exportReport('login-activity')}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Export CSV
              </button>
            </div>
          </div>
          {renderTableContainer(
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-gray-400">
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Device</th>
                </tr>
              </thead>
              <tbody>
                {loginLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Loading login details...</td>
                  </tr>
                ) : loginRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No login details found for the selected range and filters.</td>
                  </tr>
                ) : loginRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top text-gray-200">
                    <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3">{row.actionLabel || row.action || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.result === 'Failed'
                          ? 'bg-rose-500/15 text-rose-100'
                          : 'bg-emerald-500/15 text-emerald-100'
                      }`}>
                        {row.result}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{row.actorName || '-'}</div>
                      <div className="text-xs text-gray-400">{row.actorEmail || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{row.ipAddressLabel || row.ipAddress || '-'}</td>
                    <td className="px-4 py-3">{row.reason || '-'}</td>
                    <td className="px-4 py-3 max-w-[280px] text-xs text-gray-300">{row.device || 'Not available'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PaginationControls
            currentPage={loginMeta.currentPage}
            totalPages={loginMeta.totalPages}
            totalRows={loginPagination.total}
            pageSize={loginPagination.limit}
            startIndex={loginMeta.startIndex}
            endIndex={loginMeta.endIndex}
            itemLabel="login rows"
            onPageChange={(page) => void loadLoginActivity(page, loginPagination.limit)}
            onPageSizeChange={(pageSize) => void loadLoginActivity(1, pageSize)}
          />
        </div>
      ) : null}

      {activeTab === 'transactions' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1 text-sm text-gray-300">
                Search business activity
                <input
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                  placeholder="Search area, activity, reference, or user"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="min-w-[220px] text-sm text-gray-300">
                Area
                <select
                  value={transactionModule}
                  onChange={(e) => setTransactionModule(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="">All transaction modules</option>
                  {(overview?.moduleOptions.transactions || []).map((option) => (
                    <option key={option} value={option}>
                      {formatOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void exportReport('transaction-activity')}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Export CSV
              </button>
            </div>
          </div>
          {renderTableContainer(
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.16em] text-gray-400">
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">What happened</th>
                </tr>
              </thead>
              <tbody>
                {transactionLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">Loading transaction activity...</td>
                  </tr>
                ) : transactionRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">No transaction activity found for the selected range and filters.</td>
                  </tr>
                ) : transactionRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 align-top text-gray-200">
                    <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold text-violet-100">{row.moduleLabel || row.module || '-'}</td>
                    <td className="px-4 py-3">{row.actionLabel || row.action || '-'}</td>
                    <td className="px-4 py-3">{row.entityLabel || row.entityType || '-'}</td>
                    <td className="px-4 py-3">{row.referenceNo || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{row.actorName || '-'}</div>
                      <div className="text-xs text-gray-400">{row.actorEmail || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{row.summary || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PaginationControls
            currentPage={transactionMeta.currentPage}
            totalPages={transactionMeta.totalPages}
            totalRows={transactionPagination.total}
            pageSize={transactionPagination.limit}
            startIndex={transactionMeta.startIndex}
            endIndex={transactionMeta.endIndex}
            itemLabel="transaction rows"
            onPageChange={(page) => void loadTransactionActivity(page, transactionPagination.limit)}
            onPageSizeChange={(pageSize) => void loadTransactionActivity(1, pageSize)}
          />
        </div>
      ) : null}

      {overviewLoading && !overview ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-gray-400">
          Loading admin reports overview...
        </div>
      ) : null}
    </div>
  );
};
