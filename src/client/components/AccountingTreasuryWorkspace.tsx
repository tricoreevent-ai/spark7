import React, { useEffect, useMemo, useState } from 'react';
import { CardTabs } from './CardTabs';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

type TreasuryTab = 'accounts' | 'routes' | 'operations' | 'dashboard';
type TreasuryAccountType = 'bank' | 'cash_float';
type TreasuryPaymentMethod = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer' | 'original_payment';
type TreasuryTransferDirection = 'cash_to_bank' | 'bank_to_cash';

interface TreasuryAccountRow {
  _id: string;
  accountType: TreasuryAccountType;
  displayName: string;
  bankName?: string;
  accountNumberLast4?: string;
  branchName?: string;
  ifscCode?: string;
  walletProvider?: string;
  processorName?: string;
  isPrimary: boolean;
  isActive: boolean;
  openingBalance: number;
  notes?: string;
  chartAccountCode?: string;
}

interface TreasuryRouteAccountRef {
  _id: string;
  displayName: string;
  accountType?: TreasuryAccountType;
  isPrimary?: boolean;
}

interface TreasuryPaymentRouteRow {
  _id: string;
  paymentMethod: TreasuryPaymentMethod;
  channelLabel?: string;
  processorName?: string;
  treasuryAccountId: string | TreasuryRouteAccountRef;
  settlementDays: number;
  feePercent: number;
  fixedFee: number;
  isDefault: boolean;
  isActive: boolean;
}

interface TreasuryDashboardAccountRow {
  account: {
    _id: string;
    accountType: TreasuryAccountType;
    displayName: string;
    bankName?: string;
    isPrimary?: boolean;
    chartAccountCode?: string;
    openingBalance: number;
  };
  projectedOpening: number;
  actualOpening: number;
  projectedBalance: number;
  actualBalance: number;
  variance: number;
  matchedBank: { count: number; amount: number };
  unmatchedBank: { count: number; amount: number; rows: any[] };
  unmatchedBook: { count: number; amount: number; rows: any[] };
  latestCashCount?: { countDate?: string; physicalAmount?: number; varianceAmount?: number } | null;
}

interface TreasuryDashboardResponse {
  period?: { startDate?: string; endDate?: string };
  accounts: TreasuryDashboardAccountRow[];
}

interface TreasuryAccountFormState {
  accountType: TreasuryAccountType;
  displayName: string;
  bankName: string;
  accountNumber: string;
  branchName: string;
  ifscCode: string;
  walletProvider: string;
  processorName: string;
  openingBalance: string;
  isPrimary: boolean;
  notes: string;
}

interface TreasuryRouteFormState {
  paymentMethod: TreasuryPaymentMethod;
  channelLabel: string;
  treasuryAccountId: string;
  processorName: string;
  settlementDays: string;
  feePercent: string;
  fixedFee: string;
  isDefault: boolean;
}

interface TreasuryCollectionFormState {
  amount: string;
  voucherDate: string;
  paymentMode: TreasuryPaymentMethod;
  treasuryAccountId: string;
  paymentChannelLabel: string;
  category: string;
  counterpartyName: string;
  referenceNo: string;
  notes: string;
}

interface TreasuryRentPaymentFormState {
  amount: string;
  voucherDate: string;
  paymentMode: TreasuryPaymentMethod;
  treasuryAccountId: string;
  category: string;
  accountName: string;
  referenceNo: string;
  beingPaymentOf: string;
  forPeriod: string;
}

interface TreasuryTransferFormState {
  amount: string;
  transferDate: string;
  direction: TreasuryTransferDirection;
  fromTreasuryAccountId: string;
  toTreasuryAccountId: string;
  referenceNo: string;
  notes: string;
}

interface AccountingTreasuryWorkspaceProps {
  startDate: string;
  endDate: string;
  refreshKey?: number;
}

const treasuryTabs: Array<{ key: TreasuryTab; label: string }> = [
  { key: 'accounts', label: 'Treasury Accounts' },
  { key: 'routes', label: 'Payment Routes' },
  { key: 'operations', label: 'Collections & Testing' },
  { key: 'dashboard', label: 'Treasury Dashboard' },
];

const treasuryPaymentMethods: TreasuryPaymentMethod[] = [
  'cash',
  'bank',
  'upi',
  'card',
  'cheque',
  'online',
  'bank_transfer',
  'original_payment',
];

const createTreasuryAccountFormState = (): TreasuryAccountFormState => ({
  accountType: 'bank',
  displayName: '',
  bankName: '',
  accountNumber: '',
  branchName: '',
  ifscCode: '',
  walletProvider: '',
  processorName: '',
  openingBalance: '',
  isPrimary: false,
  notes: '',
});

const createTreasuryRouteFormState = (): TreasuryRouteFormState => ({
  paymentMethod: 'upi',
  channelLabel: '',
  treasuryAccountId: '',
  processorName: '',
  settlementDays: '0',
  feePercent: '0',
  fixedFee: '0',
  isDefault: true,
});

const todayKey = () => new Date().toISOString().slice(0, 10);

const createTreasuryCollectionFormState = (
  category: string,
  paymentChannelLabel: string,
  paymentMode: TreasuryPaymentMethod
): TreasuryCollectionFormState => ({
  amount: '',
  voucherDate: todayKey(),
  paymentMode,
  treasuryAccountId: '',
  paymentChannelLabel,
  category,
  counterpartyName: '',
  referenceNo: '',
  notes: '',
});

const createTreasuryRentPaymentFormState = (): TreasuryRentPaymentFormState => ({
  amount: '',
  voucherDate: todayKey(),
  paymentMode: 'bank_transfer',
  treasuryAccountId: '',
  category: 'Facility Rent Expense',
  accountName: '',
  referenceNo: '',
  beingPaymentOf: 'Monthly facility rent',
  forPeriod: '',
});

const createTreasuryTransferFormState = (): TreasuryTransferFormState => ({
  amount: '',
  transferDate: todayKey(),
  direction: 'cash_to_bank',
  fromTreasuryAccountId: '',
  toTreasuryAccountId: '',
  referenceNo: '',
  notes: '',
});

const titleCase = (value: string) =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDate = (value?: string) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-IN');
};

const getRouteAccount = (row: TreasuryPaymentRouteRow): TreasuryRouteAccountRef | null => {
  if (row.treasuryAccountId && typeof row.treasuryAccountId === 'object') return row.treasuryAccountId;
  return null;
};

const accountBadgeClass = (type: TreasuryAccountType) =>
  type === 'bank'
    ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
    : 'border-amber-400/30 bg-amber-500/10 text-amber-100';

const inputClass =
  'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';
const buttonClass =
  'inline-flex items-center gap-2 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60';

const FieldHelp: React.FC<{
  label: string;
  description: string;
  example?: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ label, description, example, required = false, children }) => (
  <div className="space-y-2">
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-white">{label}</p>
        {required && (
          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100">
            Required
          </span>
        )}
      </div>
      <p className="text-xs text-gray-400">{description}</p>
      {example && <p className="text-[11px] text-gray-500">Example: {example}</p>}
    </div>
    {children}
  </div>
);

export const AccountingTreasuryWorkspace: React.FC<AccountingTreasuryWorkspaceProps> = ({
  startDate,
  endDate,
  refreshKey = 0,
}) => {
  const [activeTab, setActiveTab] = useState<TreasuryTab>('accounts');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [accounts, setAccounts] = useState<TreasuryAccountRow[]>([]);
  const [routes, setRoutes] = useState<TreasuryPaymentRouteRow[]>([]);
  const [dashboard, setDashboard] = useState<TreasuryDashboardResponse | null>(null);

  const [editingAccountId, setEditingAccountId] = useState('');
  const [editingRouteId, setEditingRouteId] = useState('');
  const [accountForm, setAccountForm] = useState<TreasuryAccountFormState>(createTreasuryAccountFormState);
  const [routeForm, setRouteForm] = useState<TreasuryRouteFormState>(createTreasuryRouteFormState);
  const [rentCollectionForm, setRentCollectionForm] = useState<TreasuryCollectionFormState>(
    () => createTreasuryCollectionFormState('Room Rent Income', 'room_rent', 'bank_transfer')
  );
  const [commissionCollectionForm, setCommissionCollectionForm] = useState<TreasuryCollectionFormState>(
    () => createTreasuryCollectionFormState('Commission Income', 'commission', 'upi')
  );
  const [rentPaymentForm, setRentPaymentForm] = useState<TreasuryRentPaymentFormState>(createTreasuryRentPaymentFormState);
  const [transferOpsForm, setTransferOpsForm] = useState<TreasuryTransferFormState>(createTreasuryTransferFormState);

  const headers = useMemo<HeadersInit>(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    }),
    []
  );

  const loadAccounts = async () => {
    const response = await fetchApiJson(apiUrl('/api/accounting/treasury/accounts'), { headers });
    setAccounts(Array.isArray(response?.data) ? response.data : []);
  };

  const loadRoutes = async () => {
    const response = await fetchApiJson(apiUrl('/api/accounting/treasury/payment-routes'), { headers });
    setRoutes(Array.isArray(response?.data) ? response.data : []);
  };

  const loadDashboard = async () => {
    const query = new URLSearchParams();
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);
    const response = await fetchApiJson(apiUrl(`/api/accounting/treasury/dashboard?${query.toString()}`), { headers });
    setDashboard(response?.data || { accounts: [] });
  };

  const withStatus = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (requestError: any) {
      setError(requestError?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void withStatus(async () => {
      await Promise.all([loadAccounts(), loadRoutes(), loadDashboard()]);
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    void withStatus(async () => {
      await loadDashboard();
    });
  }, [activeTab, startDate, endDate]);

  useEffect(() => {
    if (!refreshKey) return;
    void withStatus(async () => {
      if (activeTab === 'accounts') {
        await loadAccounts();
        setMessage('Treasury accounts refreshed.');
        return;
      }
      if (activeTab === 'routes') {
        await Promise.all([loadRoutes(), loadAccounts()]);
        setMessage('Payment routes refreshed.');
        return;
      }
      if (activeTab === 'operations') {
        await refreshTreasuryWorkspace();
        setMessage('Treasury operations data refreshed.');
        return;
      }
      await Promise.all([loadDashboard(), loadAccounts(), loadRoutes()]);
      setMessage('Treasury dashboard refreshed.');
    });
  }, [refreshKey]);

  const firstCashAccountId = useMemo(
    () => accounts.find((account) => account.accountType === 'cash_float')?._id || '',
    [accounts]
  );
  const primaryBankAccountId = useMemo(
    () => accounts.find((account) => account.accountType === 'bank' && account.isPrimary)?._id
      || accounts.find((account) => account.accountType === 'bank')?._id
      || '',
    [accounts]
  );
  const hdfcBankAccountId = useMemo(
    () => accounts.find((account) => account.accountType === 'bank' && /hdfc|sports\s*store/i.test(`${account.displayName} ${account.bankName || ''}`))?._id
      || primaryBankAccountId,
    [accounts, primaryBankAccountId]
  );
  const iciciBankAccountId = useMemo(
    () => accounts.find((account) => account.accountType === 'bank' && /icici|rent/i.test(`${account.displayName} ${account.bankName || ''}`))?._id
      || primaryBankAccountId,
    [accounts, primaryBankAccountId]
  );

  useEffect(() => {
    if (!accounts.length) return;
    setRentCollectionForm((prev) => (
      prev.treasuryAccountId
        ? prev
        : { ...prev, treasuryAccountId: iciciBankAccountId || primaryBankAccountId }
    ));
    setCommissionCollectionForm((prev) => (
      prev.treasuryAccountId
        ? prev
        : { ...prev, treasuryAccountId: hdfcBankAccountId || primaryBankAccountId }
    ));
    setRentPaymentForm((prev) => (
      prev.treasuryAccountId
        ? prev
        : { ...prev, treasuryAccountId: hdfcBankAccountId || primaryBankAccountId }
    ));
    setTransferOpsForm((prev) => ({
      ...prev,
      fromTreasuryAccountId: prev.fromTreasuryAccountId || firstCashAccountId,
      toTreasuryAccountId: prev.toTreasuryAccountId || hdfcBankAccountId || primaryBankAccountId,
    }));
  }, [accounts, firstCashAccountId, hdfcBankAccountId, iciciBankAccountId, primaryBankAccountId]);

  const resetAccountForm = () => {
    setEditingAccountId('');
    setAccountForm(createTreasuryAccountFormState());
  };

  const resetRouteForm = () => {
    setEditingRouteId('');
    setRouteForm(createTreasuryRouteFormState());
  };

  const resetOperationsForms = () => {
    setRentCollectionForm((prev) => ({
      ...createTreasuryCollectionFormState('Room Rent Income', 'room_rent', 'bank_transfer'),
      treasuryAccountId: prev.treasuryAccountId || iciciBankAccountId || primaryBankAccountId,
    }));
    setCommissionCollectionForm((prev) => ({
      ...createTreasuryCollectionFormState('Commission Income', 'commission', 'upi'),
      treasuryAccountId: prev.treasuryAccountId || hdfcBankAccountId || primaryBankAccountId,
    }));
    setRentPaymentForm((prev) => ({
      ...createTreasuryRentPaymentFormState(),
      treasuryAccountId: prev.treasuryAccountId || hdfcBankAccountId || primaryBankAccountId,
    }));
    setTransferOpsForm((prev) => ({
      ...createTreasuryTransferFormState(),
      fromTreasuryAccountId: prev.fromTreasuryAccountId || firstCashAccountId,
      toTreasuryAccountId: prev.toTreasuryAccountId || hdfcBankAccountId || primaryBankAccountId,
    }));
  };

  const transferSourceAccounts = useMemo(
    () => transferOpsForm.direction === 'cash_to_bank'
      ? accounts.filter((account) => account.accountType === 'cash_float')
      : accounts.filter((account) => account.accountType === 'bank'),
    [accounts, transferOpsForm.direction]
  );
  const transferTargetAccounts = useMemo(
    () => transferOpsForm.direction === 'cash_to_bank'
      ? accounts.filter((account) => account.accountType === 'bank')
      : accounts.filter((account) => account.accountType === 'cash_float'),
    [accounts, transferOpsForm.direction]
  );

  useEffect(() => {
    setTransferOpsForm((prev) => {
      const validSource = transferSourceAccounts.some((account) => account._id === prev.fromTreasuryAccountId);
      const validTarget = transferTargetAccounts.some((account) => account._id === prev.toTreasuryAccountId);
      const nextSource = validSource
        ? prev.fromTreasuryAccountId
        : (transferSourceAccounts[0]?._id || '');
      const nextTarget = validTarget
        ? prev.toTreasuryAccountId
        : (transferTargetAccounts[0]?._id || '');
      if (nextSource === prev.fromTreasuryAccountId && nextTarget === prev.toTreasuryAccountId) {
        return prev;
      }
      return {
        ...prev,
        fromTreasuryAccountId: nextSource,
        toTreasuryAccountId: nextTarget,
      };
    });
  }, [transferSourceAccounts, transferTargetAccounts]);

  const refreshTreasuryWorkspace = async () => {
    await Promise.all([loadAccounts(), loadRoutes(), loadDashboard()]);
  };

  const submitReceiptCollection = async (
    event: React.FormEvent,
    form: TreasuryCollectionFormState,
    setForm: React.Dispatch<React.SetStateAction<TreasuryCollectionFormState>>,
    successLabel: string
  ) => {
    event.preventDefault();
    const amount = Number(form.amount || 0);
    if (amount <= 0) {
      setError('Collection amount must be greater than zero.');
      return;
    }
    if (!String(form.treasuryAccountId || '').trim()) {
      setError('Select the bank or treasury account where this collection should land.');
      return;
    }

    await withStatus(async () => {
      const response = await fetchApiJson(apiUrl('/api/accounting/vouchers/receipt'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount,
          voucherDate: form.voucherDate,
          paymentMode: form.paymentMode,
          category: form.category,
          referenceNo: form.referenceNo,
          counterpartyName: form.counterpartyName,
          notes: form.notes,
          treasuryAccountId: form.treasuryAccountId,
          paymentChannelLabel: form.paymentChannelLabel,
        }),
      });
      setForm((prev) => ({
        ...createTreasuryCollectionFormState(form.category, form.paymentChannelLabel, form.paymentMode),
        treasuryAccountId: prev.treasuryAccountId,
      }));
      await refreshTreasuryWorkspace();
      setMessage(String(response?.message || successLabel));
    });
  };

  const handleRentPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(rentPaymentForm.amount || 0);
    if (amount <= 0) {
      setError('Rent payment amount must be greater than zero.');
      return;
    }
    if (!String(rentPaymentForm.treasuryAccountId || '').trim()) {
      setError('Select the bank account from which the rent payment should go out.');
      return;
    }
    if (!String(rentPaymentForm.accountName || '').trim()) {
      setError('Enter the landlord or payee name for this rent payment.');
      return;
    }

    await withStatus(async () => {
      const response = await fetchApiJson(apiUrl('/api/accounting/vouchers/payment'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount,
          voucherDate: rentPaymentForm.voucherDate,
          paymentMode: rentPaymentForm.paymentMode,
          category: rentPaymentForm.category,
          referenceNo: rentPaymentForm.referenceNo,
          counterpartyName: rentPaymentForm.accountName,
          notes: rentPaymentForm.beingPaymentOf,
          treasuryAccountId: rentPaymentForm.treasuryAccountId,
          documentFields: {
            accountName: rentPaymentForm.accountName,
            beingPaymentOf: rentPaymentForm.beingPaymentOf,
            forPeriod: rentPaymentForm.forPeriod,
          },
        }),
      });
      setRentPaymentForm((prev) => ({
        ...createTreasuryRentPaymentFormState(),
        treasuryAccountId: prev.treasuryAccountId,
      }));
      await refreshTreasuryWorkspace();
      setMessage(String(response?.message || 'Rent payment voucher created.'));
    });
  };

  const handleTreasuryTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(transferOpsForm.amount || 0);
    if (amount <= 0) {
      setError('Transfer amount must be greater than zero.');
      return;
    }
    if (!String(transferOpsForm.fromTreasuryAccountId || '').trim() || !String(transferOpsForm.toTreasuryAccountId || '').trim()) {
      setError('Select both source and destination treasury accounts for the transfer.');
      return;
    }
    if (String(transferOpsForm.fromTreasuryAccountId) === String(transferOpsForm.toTreasuryAccountId)) {
      setError('Source and destination treasury accounts must be different.');
      return;
    }

    await withStatus(async () => {
      const response = await fetchApiJson(apiUrl('/api/accounting/transfer'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount,
          transferDate: transferOpsForm.transferDate,
          direction: transferOpsForm.direction,
          referenceNo: transferOpsForm.referenceNo,
          notes: transferOpsForm.notes,
          fromTreasuryAccountId: transferOpsForm.fromTreasuryAccountId,
          toTreasuryAccountId: transferOpsForm.toTreasuryAccountId,
        }),
      });
      setTransferOpsForm((prev) => ({
        ...createTreasuryTransferFormState(),
        fromTreasuryAccountId: prev.fromTreasuryAccountId,
        toTreasuryAccountId: prev.toTreasuryAccountId,
      }));
      await refreshTreasuryWorkspace();
      setMessage(String(response?.message || 'Treasury transfer saved.'));
    });
  };

  const loadSpark7SampleData = async () => {
    await withStatus(async () => {
      const response = await fetchApiJson(apiUrl('/api/accounting/treasury/sample-spark7'), {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      await refreshTreasuryWorkspace();
      resetOperationsForms();
      setMessage(String(response?.message || 'Spark7 treasury sample data loaded.'));
    });
  };

  const handleSaveAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!String(accountForm.displayName || '').trim()) {
      setError('Treasury account name is required.');
      return;
    }

    await withStatus(async () => {
      const method = editingAccountId ? 'PUT' : 'POST';
      const endpoint = editingAccountId
        ? `/api/accounting/treasury/accounts/${editingAccountId}`
        : '/api/accounting/treasury/accounts';
      const response = await fetchApiJson(apiUrl(endpoint), {
        method,
        headers,
        body: JSON.stringify({
          accountType: accountForm.accountType,
          displayName: accountForm.displayName,
          bankName: accountForm.bankName,
          accountNumber: accountForm.accountNumber,
          branchName: accountForm.branchName,
          ifscCode: accountForm.ifscCode,
          walletProvider: accountForm.walletProvider,
          processorName: accountForm.processorName,
          openingBalance: Number(accountForm.openingBalance || 0),
          isPrimary: accountForm.accountType === 'bank' ? accountForm.isPrimary : false,
          notes: accountForm.notes,
        }),
      });
      await Promise.all([loadAccounts(), loadDashboard()]);
      resetAccountForm();
      setMessage(String(response?.message || (editingAccountId ? 'Treasury account updated.' : 'Treasury account saved.')));
    });
  };

  const handleSaveRoute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!String(routeForm.treasuryAccountId || '').trim()) {
      setError('Select the treasury account that should receive this payment route.');
      return;
    }

    await withStatus(async () => {
      const method = editingRouteId ? 'PUT' : 'POST';
      const endpoint = editingRouteId
        ? `/api/accounting/treasury/payment-routes/${editingRouteId}`
        : '/api/accounting/treasury/payment-routes';
      const response = await fetchApiJson(apiUrl(endpoint), {
        method,
        headers,
        body: JSON.stringify({
          paymentMethod: routeForm.paymentMethod,
          treasuryAccountId: routeForm.treasuryAccountId,
          channelLabel: routeForm.channelLabel,
          processorName: routeForm.processorName,
          settlementDays: Number(routeForm.settlementDays || 0),
          feePercent: Number(routeForm.feePercent || 0),
          fixedFee: Number(routeForm.fixedFee || 0),
          isDefault: routeForm.isDefault,
        }),
      });
      await Promise.all([loadRoutes(), loadAccounts(), loadDashboard()]);
      resetRouteForm();
      setMessage(String(response?.message || (editingRouteId ? 'Payment route updated.' : 'Payment route saved.')));
    });
  };

  const editAccount = (row: TreasuryAccountRow) => {
    setEditingAccountId(String(row._id));
    setAccountForm({
      accountType: row.accountType,
      displayName: row.displayName || '',
      bankName: row.bankName || '',
      accountNumber: row.accountNumberLast4 ? `XXXX${row.accountNumberLast4}` : '',
      branchName: row.branchName || '',
      ifscCode: row.ifscCode || '',
      walletProvider: row.walletProvider || '',
      processorName: row.processorName || '',
      openingBalance: String(Number(row.openingBalance || 0)),
      isPrimary: Boolean(row.isPrimary),
      notes: row.notes || '',
    });
    setActiveTab('accounts');
    setMessage(`Editing treasury account ${row.displayName}`);
  };

  const editRoute = (row: TreasuryPaymentRouteRow) => {
    const routeAccount = getRouteAccount(row);
    setEditingRouteId(String(row._id));
    setRouteForm({
      paymentMethod: row.paymentMethod,
      channelLabel: row.channelLabel || '',
      treasuryAccountId: String(routeAccount?._id || row.treasuryAccountId || ''),
      processorName: row.processorName || '',
      settlementDays: String(Number(row.settlementDays || 0)),
      feePercent: String(Number(row.feePercent || 0)),
      fixedFee: String(Number(row.fixedFee || 0)),
      isDefault: Boolean(row.isDefault),
    });
    setActiveTab('routes');
    setMessage(`Editing payment route ${titleCase(row.paymentMethod)}${row.channelLabel ? ` / ${row.channelLabel}` : ''}`);
  };

  const totalProjectedBalance = (dashboard?.accounts || []).reduce(
    (sum, row) => sum + Number(row.projectedBalance || 0),
    0
  );
  const totalActualBalance = (dashboard?.accounts || []).reduce(
    (sum, row) => sum + Number(row.actualBalance || 0),
    0
  );
  const totalUnmatchedBank = (dashboard?.accounts || []).reduce(
    (sum, row) => sum + Number(row.unmatchedBank?.amount || 0),
    0
  );
  const totalUnmatchedBook = (dashboard?.accounts || []).reduce(
    (sum, row) => sum + Number(row.unmatchedBook?.amount || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Treasury & Banks</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Handle multiple bank accounts for different business collections</h2>
            <p className="mt-2 text-sm text-cyan-50/85">
              This workspace is for businesses like sports complexes, retail stores, and facility rentals where collections do not always land in the same bank.
              You can define separate treasury accounts, map payment routes, and monitor bank-wise balances and reconciliation gaps.
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-200">
            <p className="font-semibold text-white">Spark7 example</p>
            <p className="mt-1"><code>UPI + sports_store</code> {'->'} <code>HDFC Sports Store</code></p>
            <p><code>UPI + room_rent</code> {'->'} <code>ICICI Facility Rent</code></p>
            <p><code>Cash</code> {'->'} <code>Main Cash Counter</code></p>
          </div>
        </div>
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      <CardTabs
        ariaLabel="Treasury workspace tabs"
        items={treasuryTabs}
        activeKey={activeTab}
        onChange={setActiveTab}
        className="w-fit max-w-full"
        listClassName="border-b-0 px-0 pt-0"
      />

      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form onSubmit={handleSaveAccount} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Treasury Account Setup</p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {editingAccountId ? 'Edit treasury account' : 'Create bank or cash account'}
              </h3>
            </div>

            <FieldHelp
              label="Account type"
              description="Use Bank for actual bank accounts and Cash Float for cash drawers or counters."
              example="Sports Store Bank or Main Cash Counter"
              required
            >
              <select
                className={inputClass}
                value={accountForm.accountType}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    accountType: e.target.value === 'cash_float' ? 'cash_float' : 'bank',
                    isPrimary: e.target.value === 'cash_float' ? false : prev.isPrimary,
                  }))
                }
              >
                <option value="bank">Bank</option>
                <option value="cash_float">Cash Float</option>
              </select>
            </FieldHelp>

            <FieldHelp
              label="Display name"
              description="This is the user-facing name staff will choose in routing and later transaction screens."
              example="HDFC Sports Store"
              required
            >
              <input
                className={inputClass}
                value={accountForm.displayName}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, displayName: e.target.value }))}
                placeholder="Treasury account name"
              />
            </FieldHelp>

            {accountForm.accountType === 'bank' ? (
              <>
                <FieldHelp label="Bank name" description="The institution name for this bank account." example="HDFC Bank">
                  <input
                    className={inputClass}
                    value={accountForm.bankName}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, bankName: e.target.value }))}
                    placeholder="Bank name"
                  />
                </FieldHelp>
                <FieldHelp
                  label="Account number"
                  description="Used only for setup. The app stores masked details for display."
                  example="50100123456789"
                >
                  <input
                    className={inputClass}
                    value={accountForm.accountNumber}
                    onChange={(e) => setAccountForm((prev) => ({ ...prev, accountNumber: e.target.value.replace(/\s+/g, '') }))}
                    placeholder="Account number"
                  />
                </FieldHelp>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FieldHelp label="Branch" description="Optional bank branch name." example="Kakkanad">
                    <input
                      className={inputClass}
                      value={accountForm.branchName}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, branchName: e.target.value }))}
                      placeholder="Branch"
                    />
                  </FieldHelp>
                  <FieldHelp label="IFSC" description="Useful for bank transfer reference and audit clarity." example="HDFC0001234">
                    <input
                      className={inputClass}
                      value={accountForm.ifscCode}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, ifscCode: e.target.value.toUpperCase() }))}
                      placeholder="IFSC code"
                    />
                  </FieldHelp>
                </div>
              </>
            ) : (
              <FieldHelp
                label="Wallet or counter label"
                description="Use this for naming a physical cash drawer, petty cash box, or wallet-backed collection bucket."
                example="Front Desk Cash"
              >
                <input
                  className={inputClass}
                  value={accountForm.walletProvider}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, walletProvider: e.target.value }))}
                  placeholder="Wallet or counter label"
                />
              </FieldHelp>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldHelp label="Processor / gateway" description="Optional label for gateway or settlement owner." example="Razorpay">
                <input
                  className={inputClass}
                  value={accountForm.processorName}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, processorName: e.target.value }))}
                  placeholder="Processor name"
                />
              </FieldHelp>
              <FieldHelp label="Opening balance" description="Starting balance for this account in the treasury dashboard." example="25000">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={accountForm.openingBalance}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, openingBalance: e.target.value }))}
                  placeholder="Opening balance"
                />
              </FieldHelp>
            </div>

            {accountForm.accountType === 'bank' && (
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={accountForm.isPrimary}
                  onChange={(e) => setAccountForm((prev) => ({ ...prev, isPrimary: e.target.checked }))}
                />
                Mark as primary fallback bank
              </label>
            )}

            <FieldHelp
              label="Notes"
              description="Use this to describe which department uses the bank, such as store collections or facility rentals."
              example="Used for sports store card and UPI collections."
            >
              <textarea
                className={`${inputClass} min-h-[88px]`}
                value={accountForm.notes}
                onChange={(e) => setAccountForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Internal notes"
              />
            </FieldHelp>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass} disabled={loading}>
                {editingAccountId ? 'Save Treasury Account' : 'Create Treasury Account'}
              </button>
              {editingAccountId && (
                <button type="button" className={secondaryButtonClass} onClick={resetAccountForm} disabled={loading}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Configured Accounts</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Bank and cash collection points</h3>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
                {accounts.length} account(s)
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {accounts.map((row) => (
                <div key={row._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{row.displayName}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${accountBadgeClass(row.accountType)}`}>
                          {titleCase(row.accountType)}
                        </span>
                        {row.isPrimary && (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
                            Primary bank
                          </span>
                        )}
                      </div>
                    </div>
                    <button type="button" className="text-sm text-cyan-200 hover:text-cyan-100" onClick={() => editAccount(row)}>
                      Edit
                    </button>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-gray-300">
                    {row.bankName && <p>Bank: {row.bankName}</p>}
                    {row.accountNumberLast4 && <p>Account ending: {row.accountNumberLast4}</p>}
                    {row.branchName && <p>Branch: {row.branchName}</p>}
                    {row.ifscCode && <p>IFSC: {row.ifscCode}</p>}
                    {row.walletProvider && <p>Wallet / Counter: {row.walletProvider}</p>}
                    {row.processorName && <p>Processor: {row.processorName}</p>}
                    <p>Opening balance: {formatCurrency(Number(row.openingBalance || 0))}</p>
                    {row.chartAccountCode && <p>Chart code: {row.chartAccountCode}</p>}
                    {row.notes && <p className="text-gray-400">{row.notes}</p>}
                  </div>
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-gray-400 md:col-span-2">
                  No treasury accounts saved yet. Start with one bank for sports store collections and one bank for facility rent collections.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <form onSubmit={handleSaveRoute} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Payment Routing</p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {editingRouteId ? 'Edit payment route' : 'Map a payment flow to a treasury account'}
              </h3>
              <p className="mt-2 text-sm text-gray-300">
                Use default routes for broad payment methods and optional channel labels when the same method should split into multiple banks.
              </p>
            </div>

            <FieldHelp
              label="Payment method"
              description="The collection method that should be routed."
              example="UPI, Bank Transfer, Cash"
              required
            >
              <select
                className={inputClass}
                value={routeForm.paymentMethod}
                onChange={(e) => setRouteForm((prev) => ({ ...prev, paymentMethod: e.target.value as TreasuryPaymentMethod }))}
              >
                {treasuryPaymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {titleCase(method)}
                  </option>
                ))}
              </select>
            </FieldHelp>

            <FieldHelp
              label="Channel label"
              description="Optional source tag when one method should split into multiple banks."
              example="sports_store or room_rent"
            >
              <input
                className={inputClass}
                value={routeForm.channelLabel}
                onChange={(e) => setRouteForm((prev) => ({ ...prev, channelLabel: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="Optional channel label"
              />
            </FieldHelp>

            <FieldHelp
              label="Treasury account"
              description="The actual bank or cash account where the money should land."
              example="HDFC Sports Store"
              required
            >
              <select
                className={inputClass}
                value={routeForm.treasuryAccountId}
                onChange={(e) => setRouteForm((prev) => ({ ...prev, treasuryAccountId: e.target.value }))}
              >
                <option value="">Select treasury account</option>
                {accounts.map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.displayName} ({titleCase(account.accountType)})
                  </option>
                ))}
              </select>
            </FieldHelp>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldHelp label="Processor" description="Optional gateway or processor name for this route." example="Razorpay">
                <input
                  className={inputClass}
                  value={routeForm.processorName}
                  onChange={(e) => setRouteForm((prev) => ({ ...prev, processorName: e.target.value }))}
                  placeholder="Processor name"
                />
              </FieldHelp>
              <FieldHelp label="Settlement days" description="Expected bank settlement lag for this route." example="1">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="1"
                  value={routeForm.settlementDays}
                  onChange={(e) => setRouteForm((prev) => ({ ...prev, settlementDays: e.target.value }))}
                  placeholder="Settlement days"
                />
              </FieldHelp>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldHelp label="Fee percent" description="Gateway fee percentage if you want it recorded on the route." example="2">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={routeForm.feePercent}
                  onChange={(e) => setRouteForm((prev) => ({ ...prev, feePercent: e.target.value }))}
                  placeholder="Fee %"
                />
              </FieldHelp>
              <FieldHelp label="Fixed fee" description="Flat fee per transaction if applicable." example="15">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={routeForm.fixedFee}
                  onChange={(e) => setRouteForm((prev) => ({ ...prev, fixedFee: e.target.value }))}
                  placeholder="Fixed fee"
                />
              </FieldHelp>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={routeForm.isDefault}
                onChange={(e) => setRouteForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
              />
              Use as default route when no channel label is supplied
            </label>

            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-gray-300">
              <p className="font-semibold text-white">How this helps your case</p>
              <p className="mt-2">Create `UPI + sports_store` to send store collections to one bank.</p>
              <p>Create `UPI + room_rent` to send facility rent to another bank.</p>
              <p>Keep a default `UPI` route too, so anything without a channel label still lands in the fallback bank.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass} disabled={loading}>
                {editingRouteId ? 'Save Payment Route' : 'Create Payment Route'}
              </button>
              {editingRouteId && (
                <button type="button" className={secondaryButtonClass} onClick={resetRouteForm} disabled={loading}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Configured Routes</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Method and channel to bank mapping</h3>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
                {routes.length} route(s)
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-3">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="px-2 py-1">Payment Method</th>
                    <th className="px-2 py-1">Channel</th>
                    <th className="px-2 py-1">Treasury Account</th>
                    <th className="px-2 py-1">Settlement</th>
                    <th className="px-2 py-1">Fees</th>
                    <th className="px-2 py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((row) => {
                    const routeAccount = getRouteAccount(row);
                    return (
                      <tr key={row._id} className="border-t border-white/10 align-top">
                        <td className="px-2 py-1 text-white">
                          <div>{titleCase(row.paymentMethod)}</div>
                          {row.isDefault && <div className="text-xs text-emerald-300">Default route</div>}
                        </td>
                        <td className="px-2 py-1 text-gray-300">{row.channelLabel || 'Any / fallback'}</td>
                        <td className="px-2 py-1 text-gray-300">
                          <div>{routeAccount?.displayName || String(row.treasuryAccountId || '-')}</div>
                          {routeAccount?.accountType && (
                            <div className="text-xs text-gray-500">{titleCase(routeAccount.accountType)}</div>
                          )}
                        </td>
                        <td className="px-2 py-1 text-gray-300">{Number(row.settlementDays || 0)} day(s)</td>
                        <td className="px-2 py-1 text-gray-300">
                          {Number(row.feePercent || 0)}% + {formatCurrency(Number(row.fixedFee || 0))}
                        </td>
                        <td className="px-2 py-1">
                          <button type="button" className="text-cyan-200 hover:text-cyan-100" onClick={() => editRoute(row)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {routes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-3 text-center text-gray-400">
                        No payment routes saved yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'operations' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Testing & Operations</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Add Spark7 sample data and use treasury-aware rent, commission, and transfer screens</h3>
                <p className="mt-2 text-sm text-emerald-50/85">
                  Use this screen when one business collects money into multiple banks. It lets you test rent collection into ICICI,
                  commission collection into HDFC, cash deposits into specific banks, and rent payments from a selected bank account.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-200">
                <p className="font-semibold text-white">Sample actions</p>
                <p className="mt-1">Create `HDFC Sports Store`, `ICICI Facility Rent`, and `Main Cash Counter`.</p>
                <p>Add room-rent collections, commission collections, cash-to-bank transfers, and a rent expense.</p>
                <button type="button" className={`${buttonClass} mt-3`} onClick={() => void loadSpark7SampleData()} disabled={loading}>
                  Load Spark7 Sample Data
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <form onSubmit={(event) => void submitReceiptCollection(event, rentCollectionForm, setRentCollectionForm, 'Facility rent receipt created.')} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Facility Rent Collection</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Collect room or facility rent into a chosen bank</h3>
                <p className="mt-2 text-sm text-gray-300">Use this when court rent, room rent, or slot booking money should go directly to a dedicated rent account.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Amount" description="Rent amount received for the booking or rental period." example="12000" required>
                  <input className={inputClass} type="number" min="0" step="0.01" value={rentCollectionForm.amount} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Rent amount" />
                </FieldHelp>
                <FieldHelp label="Collection date" description="Receipt date that should appear in books." required>
                  <input className={inputClass} type="date" value={rentCollectionForm.voucherDate} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, voucherDate: e.target.value }))} />
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Payment method" description="How the rent was collected." required>
                  <select className={inputClass} value={rentCollectionForm.paymentMode} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, paymentMode: e.target.value as TreasuryPaymentMethod }))}>
                    {treasuryPaymentMethods.filter((method) => method !== 'original_payment').map((method) => (
                      <option key={method} value={method}>{titleCase(method)}</option>
                    ))}
                  </select>
                </FieldHelp>
                <FieldHelp label="Deposit to bank" description="The treasury account where this rent collection should land." required>
                  <select className={inputClass} value={rentCollectionForm.treasuryAccountId} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, treasuryAccountId: e.target.value }))}>
                    <option value="">Select treasury account</option>
                    {accounts.filter((account) => account.accountType === 'bank').map((account) => (
                      <option key={account._id} value={account._id}>{account.displayName}</option>
                    ))}
                  </select>
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Channel label" description="Routing tag so the same payment method can still split into another bank." example="room_rent">
                  <input className={inputClass} value={rentCollectionForm.paymentChannelLabel} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, paymentChannelLabel: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="room_rent" />
                </FieldHelp>
                <FieldHelp label="Reference No" description="Optional booking or receipt reference." example="RENT-APR-001">
                  <input className={inputClass} value={rentCollectionForm.referenceNo} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, referenceNo: e.target.value }))} placeholder="Reference no" />
                </FieldHelp>
              </div>

              <FieldHelp label="Received from / booking" description="Customer, tenant, or booking label for this collection." example="Badminton Court Morning Slot">
                <input className={inputClass} value={rentCollectionForm.counterpartyName} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, counterpartyName: e.target.value }))} placeholder="Customer or booking label" />
              </FieldHelp>
              <FieldHelp label="Notes" description="Explain what period or slot this rent is for." example="April monthly room rent">
                <textarea className={inputClass} rows={2} value={rentCollectionForm.notes} onChange={(e) => setRentCollectionForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" />
              </FieldHelp>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className={buttonClass} disabled={loading}>Create Rent Receipt</button>
              </div>
            </form>

            <form onSubmit={(event) => void submitReceiptCollection(event, commissionCollectionForm, setCommissionCollectionForm, 'Commission receipt created.')} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Commission Collection</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Collect commission into the right bank account</h3>
                <p className="mt-2 text-sm text-gray-300">Use this for brokerage, service commission, tournament commission, or partner revenue share received by bank or UPI.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Amount" description="Commission amount received." example="3500" required>
                  <input className={inputClass} type="number" min="0" step="0.01" value={commissionCollectionForm.amount} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Commission amount" />
                </FieldHelp>
                <FieldHelp label="Collection date" description="Date of commission receipt." required>
                  <input className={inputClass} type="date" value={commissionCollectionForm.voucherDate} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, voucherDate: e.target.value }))} />
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Payment method" description="How commission was received." required>
                  <select className={inputClass} value={commissionCollectionForm.paymentMode} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, paymentMode: e.target.value as TreasuryPaymentMethod }))}>
                    {treasuryPaymentMethods.filter((method) => method !== 'original_payment').map((method) => (
                      <option key={method} value={method}>{titleCase(method)}</option>
                    ))}
                  </select>
                </FieldHelp>
                <FieldHelp label="Deposit to bank" description="Select the commission bank account." required>
                  <select className={inputClass} value={commissionCollectionForm.treasuryAccountId} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, treasuryAccountId: e.target.value }))}>
                    <option value="">Select treasury account</option>
                    {accounts.filter((account) => account.accountType === 'bank').map((account) => (
                      <option key={account._id} value={account._id}>{account.displayName}</option>
                    ))}
                  </select>
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Channel label" description="Routing tag for commission receipts." example="commission">
                  <input className={inputClass} value={commissionCollectionForm.paymentChannelLabel} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, paymentChannelLabel: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="commission" />
                </FieldHelp>
                <FieldHelp label="Reference No" description="Optional invoice or advice number." example="COMM-APR-001">
                  <input className={inputClass} value={commissionCollectionForm.referenceNo} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, referenceNo: e.target.value }))} placeholder="Reference no" />
                </FieldHelp>
              </div>

              <FieldHelp label="Received from" description="Party or organizer from whom the commission was received." example="District Tournament Organizer">
                <input className={inputClass} value={commissionCollectionForm.counterpartyName} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, counterpartyName: e.target.value }))} placeholder="Party or organizer" />
              </FieldHelp>
              <FieldHelp label="Notes" description="Reason or basis for the commission." example="Booking service commission for April">
                <textarea className={inputClass} rows={2} value={commissionCollectionForm.notes} onChange={(e) => setCommissionCollectionForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" />
              </FieldHelp>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className={buttonClass} disabled={loading}>Create Commission Receipt</button>
              </div>
            </form>

            <form onSubmit={(event) => void handleRentPayment(event)} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">Rent Payment</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Pay rent from a selected bank account</h3>
                <p className="mt-2 text-sm text-gray-300">Use this when the business pays landlord rent or facility rent from a chosen treasury bank account.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Amount" description="Rent payment amount." example="5500" required>
                  <input className={inputClass} type="number" min="0" step="0.01" value={rentPaymentForm.amount} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Rent amount" />
                </FieldHelp>
                <FieldHelp label="Payment date" description="Date of payment." required>
                  <input className={inputClass} type="date" value={rentPaymentForm.voucherDate} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, voucherDate: e.target.value }))} />
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Payment method" description="How rent was paid." required>
                  <select className={inputClass} value={rentPaymentForm.paymentMode} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, paymentMode: e.target.value as TreasuryPaymentMethod }))}>
                    {treasuryPaymentMethods.filter((method) => method !== 'original_payment').map((method) => (
                      <option key={method} value={method}>{titleCase(method)}</option>
                    ))}
                  </select>
                </FieldHelp>
                <FieldHelp label="Pay from bank" description="Select the treasury account from which this payment should go out." required>
                  <select className={inputClass} value={rentPaymentForm.treasuryAccountId} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, treasuryAccountId: e.target.value }))}>
                    <option value="">Select treasury account</option>
                    {accounts.filter((account) => account.accountType === 'bank').map((account) => (
                      <option key={account._id} value={account._id}>{account.displayName}</option>
                    ))}
                  </select>
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Payee name" description="Landlord or account name on the voucher." example="ABC Estates" required>
                  <input className={inputClass} value={rentPaymentForm.accountName} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, accountName: e.target.value }))} placeholder="Payee name" />
                </FieldHelp>
                <FieldHelp label="Reference No" description="Optional payment reference." example="RENT-PAY-APR-001">
                  <input className={inputClass} value={rentPaymentForm.referenceNo} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, referenceNo: e.target.value }))} placeholder="Reference no" />
                </FieldHelp>
              </div>

              <FieldHelp label="Being payment of" description="What the rent payment is for." example="Monthly facility rent">
                <textarea className={inputClass} rows={2} value={rentPaymentForm.beingPaymentOf} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, beingPaymentOf: e.target.value }))} placeholder="Being payment of" />
              </FieldHelp>
              <FieldHelp label="For the period" description="Optional rent period label." example="April 2026">
                <input className={inputClass} value={rentPaymentForm.forPeriod} onChange={(e) => setRentPaymentForm((prev) => ({ ...prev, forPeriod: e.target.value }))} placeholder="For the period" />
              </FieldHelp>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className={buttonClass} disabled={loading}>Create Rent Payment</button>
              </div>
            </form>

            <form onSubmit={(event) => void handleTreasuryTransfer(event)} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-200">Cash Transfer</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Transfer cash into a selected bank account</h3>
                <p className="mt-2 text-sm text-gray-300">Use this when counter cash is deposited into HDFC, ICICI, or moved back from bank to cash.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FieldHelp label="Amount" description="Transfer amount between treasury accounts." example="6000" required>
                  <input className={inputClass} type="number" min="0" step="0.01" value={transferOpsForm.amount} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, amount: e.target.value }))} placeholder="Transfer amount" />
                </FieldHelp>
                <FieldHelp label="Transfer date" description="Date of transfer." required>
                  <input className={inputClass} type="date" value={transferOpsForm.transferDate} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, transferDate: e.target.value }))} />
                </FieldHelp>
                <FieldHelp label="Direction" description="Choose whether cash is going to bank or bank is coming back to cash." required>
                  <select className={inputClass} value={transferOpsForm.direction} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, direction: e.target.value === 'bank_to_cash' ? 'bank_to_cash' : 'cash_to_bank' }))}>
                    <option value="cash_to_bank">Cash to Bank</option>
                    <option value="bank_to_cash">Bank to Cash</option>
                  </select>
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label={transferOpsForm.direction === 'cash_to_bank' ? 'From cash account' : 'From bank account'} description="Source treasury account for the transfer." required>
                  <select className={inputClass} value={transferOpsForm.fromTreasuryAccountId} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, fromTreasuryAccountId: e.target.value }))}>
                    <option value="">Select source account</option>
                    {transferSourceAccounts.map((account) => (
                      <option key={account._id} value={account._id}>{account.displayName}</option>
                    ))}
                  </select>
                </FieldHelp>
                <FieldHelp label={transferOpsForm.direction === 'cash_to_bank' ? 'To bank account' : 'To cash account'} description="Destination treasury account for the transfer." required>
                  <select className={inputClass} value={transferOpsForm.toTreasuryAccountId} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, toTreasuryAccountId: e.target.value }))}>
                    <option value="">Select destination account</option>
                    {transferTargetAccounts.map((account) => (
                      <option key={account._id} value={account._id}>{account.displayName}</option>
                    ))}
                  </select>
                </FieldHelp>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldHelp label="Reference No" description="Optional deposit slip or transfer reference." example="TRF-APR-001">
                  <input className={inputClass} value={transferOpsForm.referenceNo} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, referenceNo: e.target.value }))} placeholder="Reference no" />
                </FieldHelp>
                <FieldHelp label="Notes" description="Explain why the transfer happened." example="Sports store cash deposit">
                  <input className={inputClass} value={transferOpsForm.notes} onChange={(e) => setTransferOpsForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" />
                </FieldHelp>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className={buttonClass} disabled={loading}>Save Treasury Transfer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Accounts</p>
              <p className="mt-2 text-2xl font-semibold text-white">{dashboard?.accounts?.length || 0}</p>
              <p className="mt-1 text-xs text-gray-400">Across all active banks and cash floats</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Projected Balance</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(totalProjectedBalance)}</p>
              <p className="mt-1 text-xs text-gray-400">From expected book movements</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Actual Balance</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-100">{formatCurrency(totalActualBalance)}</p>
              <p className="mt-1 text-xs text-gray-400">From imported and matched bank rows</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Unmatched</p>
              <p className="mt-2 text-lg font-semibold text-amber-200">
                Bank {formatCurrency(totalUnmatchedBank)} | Book {formatCurrency(totalUnmatchedBook)}
              </p>
              <p className="mt-1 text-xs text-gray-400">Use this to focus reconciliation by bank</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">Date Scope</p>
                <h3 className="mt-2 text-lg font-semibold text-white">Treasury summary for the selected accounting period</h3>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-300">
                {formatDate(startDate)} to {formatDate(endDate)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {(dashboard?.accounts || []).map((row) => (
              <div key={row.account._id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{row.account.displayName}</h3>
                      <span className={`rounded-full border px-2 py-1 text-[11px] ${accountBadgeClass(row.account.accountType)}`}>
                        {titleCase(row.account.accountType)}
                      </span>
                      {row.account.isPrimary && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-100">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-gray-300">
                      {row.account.bankName || 'No bank name saved'}
                      {row.account.chartAccountCode ? ` | Chart ${row.account.chartAccountCode}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-cyan-200 hover:text-cyan-100"
                    onClick={() =>
                      editAccount({
                        _id: row.account._id,
                        accountType: row.account.accountType,
                        displayName: row.account.displayName,
                        bankName: row.account.bankName,
                        isPrimary: Boolean(row.account.isPrimary),
                        isActive: true,
                        openingBalance: Number(row.account.openingBalance || 0),
                        chartAccountCode: row.account.chartAccountCode,
                      })
                    }
                  >
                    Edit Account
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Projected</p>
                    <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(Number(row.projectedBalance || 0))}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Actual</p>
                    <p className="mt-1 text-lg font-semibold text-cyan-100">{formatCurrency(Number(row.actualBalance || 0))}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Variance</p>
                    <p className={`mt-1 text-lg font-semibold ${Number(row.variance || 0) === 0 ? 'text-emerald-200' : 'text-amber-200'}`}>
                      {formatCurrency(Number(row.variance || 0))}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Opening</p>
                    <p className="mt-1 text-lg font-semibold text-white">{formatCurrency(Number(row.account.openingBalance || 0))}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-sm font-semibold text-white">Matched Bank Rows</p>
                    <p className="mt-2 text-sm text-gray-300">{Number(row.matchedBank?.count || 0)} row(s)</p>
                    <p className="text-sm text-gray-300">{formatCurrency(Number(row.matchedBank?.amount || 0))}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-sm font-semibold text-white">Unmatched Bank</p>
                    <p className="mt-2 text-sm text-gray-300">{Number(row.unmatchedBank?.count || 0)} row(s)</p>
                    <p className="text-sm text-amber-200">{formatCurrency(Number(row.unmatchedBank?.amount || 0))}</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-sm font-semibold text-white">Unmatched Book</p>
                    <p className="mt-2 text-sm text-gray-300">{Number(row.unmatchedBook?.count || 0)} row(s)</p>
                    <p className="text-sm text-amber-200">{formatCurrency(Number(row.unmatchedBook?.amount || 0))}</p>
                  </div>
                </div>

                {row.latestCashCount && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-gray-300">
                    Last cash count: {formatDate(row.latestCashCount.countDate)} | Physical {formatCurrency(Number(row.latestCashCount.physicalAmount || 0))}
                    {` | Variance ${formatCurrency(Number(row.latestCashCount.varianceAmount || 0))}`}
                  </div>
                )}
              </div>
            ))}
            {(!dashboard?.accounts || dashboard.accounts.length === 0) && (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-gray-400 xl:col-span-2">
                No treasury dashboard rows are available yet. Create treasury accounts first, then start routing collections into them.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
