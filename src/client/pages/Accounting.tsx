import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import { CardTabs } from '../components/CardTabs';
import { ReportDataTable } from '../components/ReportDataTable';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { formatCurrency } from '../config';
import { apiUrl } from '../utils/api';
import { getGeneralSettings, resolveGeneralSettingsAssetUrl } from '../utils/generalSettings';
import { showConfirmDialog, showPromptDialog } from '../utils/appDialogs';

type TabKey = 'dashboard' | 'invoices' | 'masters' | 'payments' | 'opening' | 'expenses' | 'vouchers' | 'books' | 'ledger' | 'reports';
type MastersTabKey = 'vendors' | 'assets' | 'periods';
type InvoicesTabKey = 'invoice_entry' | 'expense_entry' | 'invoice_list';
type PaymentsTabKey = 'salary_entry' | 'contract_entry' | 'history';
type OpeningTabKey = 'balances' | 'party_openings';
type ExpensesTabKey = 'entry' | 'entries';
type VouchersTabKey = 'receipt' | 'payment' | 'journal' | 'transfer' | 'list';
type BooksTabKey = 'summary' | 'cash_entries' | 'bank_entries' | 'reconciliation' | 'csv_compare';
type LedgerTabKey = 'create_account' | 'ledger_view';
type ReportsTabKey =
  | 'overview'
  | 'vendors'
  | 'assets'
  | 'periods'
  | 'invoices'
  | 'payments'
  | 'vouchers'
  | 'salary'
  | 'contracts'
  | 'daybook'
  | 'cash_entries'
  | 'bank_entries'
  | 'trial_balance';

interface SalaryPayment {
  _id: string;
  employeeId?: string;
  employeeName: string;
  designation?: string;
  month: string;
  payDate: string;
  baseAmount?: number;
  bonusAmount?: number;
  amount: number;
  paymentMethod: string;
  notes?: string;
  payslipRecipient?: string;
  payslipSentAt?: string;
}

interface ContractPayment {
  _id: string;
  contractorName: string;
  contractTitle: string;
  paymentDate: string;
  amount: number;
  status: string;
  paymentMethod: string;
  notes?: string;
}

interface DayBookEntry {
  _id: string;
  entryType: 'income' | 'expense';
  category: string;
  amount: number;
  paymentMethod: string;
  narration?: string;
  referenceNo?: string;
  entryDate: string;
}

interface VoucherRow {
  _id: string;
  voucherNumber: string;
  voucherType: string;
  voucherDate: string;
  totalAmount: number;
  paymentMode?: string;
  createdBy?: string;
  referenceNo?: string;
  counterpartyName?: string;
  notes?: string;
  documentFields?: {
    accountName?: string;
    beingPaymentOf?: string;
    forPeriod?: string;
    receivedBy?: string;
    authorizedBy?: string;
    receivedSign?: string;
    authorizedSign?: string;
  };
  isPrinted?: boolean;
  lines?: Array<{ accountId?: string; accountCode?: string; accountName: string; debit: number; credit: number; narration?: string }>;
}

interface ChartAccount {
  _id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  subType: string;
  isActive: boolean;
}

interface EmployeeMasterRow {
  _id: string;
  employeeCode: string;
  name: string;
  designation?: string;
}

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'MIS Dashboard' },
  { key: 'invoices', label: 'Invoices & Payments' },
  { key: 'masters', label: 'Vendors / Assets / Periods' },
  { key: 'payments', label: 'Salary & Contract' },
  { key: 'opening', label: 'Opening Balances' },
  { key: 'expenses', label: 'Expenses & Income' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'books', label: 'Cash & Bank Book' },
  { key: 'ledger', label: 'Chart & Ledger' },
  { key: 'reports', label: 'Reports' },
];
const masterTabs: Array<{ key: MastersTabKey; label: string }> = [
  { key: 'vendors', label: 'Vendor Master' },
  { key: 'assets', label: 'Fixed Assets' },
  { key: 'periods', label: 'Financial Periods' },
];
const invoiceTabs: Array<{ key: InvoicesTabKey; label: string }> = [
  { key: 'invoice_entry', label: 'Invoice Entry' },
  { key: 'expense_entry', label: 'Expense / Bill Entry' },
  { key: 'invoice_list', label: 'Invoice List' },
];
const paymentsTabs: Array<{ key: PaymentsTabKey; label: string }> = [
  { key: 'salary_entry', label: 'Salary Entry' },
  { key: 'contract_entry', label: 'Contract Entry' },
  { key: 'history', label: 'History / Edit' },
];
const openingTabs: Array<{ key: OpeningTabKey; label: string }> = [
  { key: 'balances', label: 'Core Balances' },
  { key: 'party_openings', label: 'Customer / Supplier Opening' },
];
const expensesTabs: Array<{ key: ExpensesTabKey; label: string }> = [
  { key: 'entry', label: 'Entry Form' },
  { key: 'entries', label: 'Entries List' },
];
const vouchersTabs: Array<{ key: VouchersTabKey; label: string }> = [
  { key: 'receipt', label: 'Receipt Voucher' },
  { key: 'payment', label: 'Payment Voucher' },
  { key: 'journal', label: 'Journal Voucher' },
  { key: 'transfer', label: 'Cash-Bank Transfer' },
  { key: 'list', label: 'Voucher List' },
];
const booksTabs: Array<{ key: BooksTabKey; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'cash_entries', label: 'Cash Entries' },
  { key: 'bank_entries', label: 'Bank Entries' },
  { key: 'reconciliation', label: 'Reconciliation' },
  { key: 'csv_compare', label: 'CSV Compare' },
];
const ledgerTabs: Array<{ key: LedgerTabKey; label: string }> = [
  { key: 'create_account', label: 'Create Account' },
  { key: 'ledger_view', label: 'Ledger View' },
];
const reportsTabs: Array<{ key: ReportsTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'assets', label: 'Assets' },
  { key: 'periods', label: 'Periods' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'salary', label: 'Salary' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'daybook', label: 'Day Book' },
  { key: 'cash_entries', label: 'Cash Entries' },
  { key: 'bank_entries', label: 'Bank Entries' },
  { key: 'trial_balance', label: 'Trial Balance' },
];

const paymentModes = ['cash', 'bank', 'upi', 'card', 'cheque', 'online', 'bank_transfer'];
const salaryPaymentModes = ['cash', 'bank', 'upi', 'card', 'cheque'];

const createSalaryFormState = () => ({
  employeeId: '',
  employeeName: '',
  designation: '',
  month: new Date().toISOString().slice(0, 7),
  payDate: new Date().toISOString().slice(0, 10),
  amount: '',
  bonusAmount: '',
  paymentMethod: 'bank',
  notes: '',
});

const createContractFormState = () => ({
  contractorName: '',
  contractTitle: '',
  paymentDate: new Date().toISOString().slice(0, 10),
  amount: '',
  status: 'paid',
  paymentMethod: 'bank',
  notes: '',
});

const createManualFormState = () => ({
  entryType: 'expense',
  category: '',
  amount: '',
  paymentMethod: 'cash',
  narration: '',
  referenceNo: '',
  entryDate: new Date().toISOString().slice(0, 10),
});

const createReceiptFormState = () => ({
  amount: '',
  voucherDate: new Date().toISOString().slice(0, 10),
  paymentMode: 'cash',
  category: 'Service Income',
  referenceNo: '',
  counterpartyName: '',
  notes: '',
});

const createPaymentVoucherFormState = () => ({
  amount: '',
  voucherDate: new Date().toISOString().slice(0, 10),
  paymentMode: 'cash',
  category: 'General Expense',
  referenceNo: '',
  accountName: '',
  beingPaymentOf: '',
  forPeriod: '',
  receivedBy: '',
  authorizedBy: '',
});

const createJournalFormState = () => ({
  voucherDate: new Date().toISOString().slice(0, 10),
  referenceNo: '',
  notes: '',
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
});

const createTransferFormState = () => ({
  amount: '',
  transferDate: new Date().toISOString().slice(0, 10),
  direction: 'cash_to_bank',
  referenceNo: '',
  notes: '',
});

const createVendorFormState = () => ({
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
});

const IconBase: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const RefreshIcon = () => (
  <IconBase>
    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const CreateIcon = () => (
  <IconBase>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const InvoiceIcon = () => (
  <IconBase>
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 8H15M9 12H15M9 16H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const ExpenseIcon = () => (
  <IconBase>
    <rect x="3" y="7" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M16 13H21V15H16C14.9 15 14 14.1 14 13C14 11.9 14.9 11 16 11H21V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 11L6 13L8 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const PaymentIcon = () => (
  <IconBase>
    <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3 10H21" stroke="currentColor" strokeWidth="1.8" />
    <path d="M14 15L16.5 17.5L20 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const CancelIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 9L15 15M15 9L9 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const VendorIcon = () => (
  <IconBase>
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 20a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M19 5V9M17 7H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const AssetIcon = () => (
  <IconBase>
    <path d="M12 3L20 7V17L12 21L4 17V7L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 3V21M4 7L20 17" stroke="currentColor" strokeWidth="1.8" />
  </IconBase>
);

const DepreciationIcon = () => (
  <IconBase>
    <path d="M4 20H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M7 8V16M12 11V16M17 13V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M8 6L12 10L16 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const LockIcon = () => (
  <IconBase>
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const UnlockIcon = () => (
  <IconBase>
    <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 11V8a4 4 0 0 1 7-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const SaveIcon = () => (
  <IconBase>
    <path d="M5 4H17L19 6V20H5V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 4V10H16V4M8 20V14H16V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </IconBase>
);

const EditIcon = () => (
  <IconBase>
    <path d="M4 20H8L18 10L14 6L4 16V20Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12.5 7.5L16.5 11.5" stroke="currentColor" strokeWidth="1.8" />
  </IconBase>
);

const ReceiptIcon = () => (
  <IconBase>
    <path d="M7 3H17V21L14.5 19L12 21L9.5 19L7 21V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M10 8H14M10 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const JournalIcon = () => (
  <IconBase>
    <path d="M6 3H16C17.66 3 19 4.34 19 6V18C19 19.66 17.66 21 16 21H6V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M6 7H15M6 11H15M6 15H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </IconBase>
);

const TransferIcon = () => (
  <IconBase>
    <path d="M4 8H18M18 8L14 4M18 8L14 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 16H6M6 16L10 12M6 16L10 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const PrintIcon = () => (
  <IconBase>
    <path d="M7 8V4H17V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="5" y="8" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7 16H17V20H7V16Z" stroke="currentColor" strokeWidth="1.8" />
  </IconBase>
);

const CheckIcon = () => (
  <IconBase>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 12.5L11 15.5L16 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const CompareIcon = () => (
  <IconBase>
    <path d="M4 6H11V18H4V6ZM13 6H20V18H13V6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9 10H15M15 10L13.5 8.5M15 10L13.5 11.5M15 14H9M9 14L10.5 12.5M9 14L10.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const AccountIcon = () => (
  <IconBase>
    <path d="M4 10H20M6 10V18M10 10V18M14 10V18M18 10V18M3 18H21M12 4L3 8H21L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const ExportIcon = () => (
  <IconBase>
    <path d="M12 3V14M12 14L8 10M12 14L16 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 15V20H20V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

export const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [mastersTab, setMastersTab] = useState<MastersTabKey>('vendors');
  const [invoicesTab, setInvoicesTab] = useState<InvoicesTabKey>('invoice_entry');
  const [paymentsTab, setPaymentsTab] = useState<PaymentsTabKey>('salary_entry');
  const [openingTab, setOpeningTab] = useState<OpeningTabKey>('balances');
  const [expensesTab, setExpensesTab] = useState<ExpensesTabKey>('entry');
  const [vouchersTab, setVouchersTab] = useState<VouchersTabKey>('receipt');
  const [booksTab, setBooksTab] = useState<BooksTabKey>('summary');
  const [ledgerTab, setLedgerTab] = useState<LedgerTabKey>('create_account');
  const [reportsTab, setReportsTab] = useState<ReportsTabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editingDaybookId, setEditingDaybookId] = useState<string | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<{ id: string; type: Exclude<VouchersTabKey, 'list'> } | null>(null);

  const [salaryList, setSalaryList] = useState<SalaryPayment[]>([]);
  const [contractList, setContractList] = useState<ContractPayment[]>([]);
  const [daybookRows, setDaybookRows] = useState<DayBookEntry[]>([]);
  const [voucherRows, setVoucherRows] = useState<VoucherRow[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [employeeMaster, setEmployeeMaster] = useState<EmployeeMasterRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<any>(null);
  const [openingStatus, setOpeningStatus] = useState<any>(null);
  const [cashBook, setCashBook] = useState<any>(null);
  const [bankBook, setBankBook] = useState<any>(null);
  const [selectedReconcileIds, setSelectedReconcileIds] = useState<string[]>([]);

  const [expenseReport, setExpenseReport] = useState<any>(null);
  const [incomeReport, setIncomeReport] = useState<any>(null);
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [coreInvoices, setCoreInvoices] = useState<any[]>([]);
  const [corePayments, setCorePayments] = useState<any[]>([]);
  const [coreJournals, setCoreJournals] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);
  const [bankCsvText, setBankCsvText] = useState('');
  const [bankImportResult, setBankImportResult] = useState<any>(null);
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const isSuperAdmin = currentUserRole === 'super_admin';

  const [dayBookDate, setDayBookDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [salaryForm, setSalaryForm] = useState(createSalaryFormState);
  const [contractForm, setContractForm] = useState(createContractFormState);
  const [manualForm, setManualForm] = useState(createManualFormState);
  const [openingForm, setOpeningForm] = useState({
    openingDate: new Date().toISOString().slice(0, 10),
    cashAmount: '',
    cashSide: 'debit',
    bankAmount: '',
    bankSide: 'debit',
    openingStockValue: '',
    openingStockSide: 'debit',
    customerAccountsText: '',
    supplierAccountsText: '',
    lockAfterSave: false,
  });
  const [receiptForm, setReceiptForm] = useState(createReceiptFormState);
  const [paymentForm, setPaymentForm] = useState(createPaymentVoucherFormState);
  const [journalForm, setJournalForm] = useState(createJournalFormState);
  const [transferForm, setTransferForm] = useState(createTransferFormState);
  const [accountForm, setAccountForm] = useState({
    accountName: '',
    accountType: 'asset',
    subType: 'general',
  });
  const [invoiceForm, setInvoiceForm] = useState({
    invoiceDate: new Date().toISOString().slice(0, 10),
    customerName: '',
    description: '',
    baseAmount: '',
    gstAmount: '',
    gstTreatment: 'none',
    paymentAmount: '',
    paymentMode: 'cash',
    revenueAccountKey: 'booking_revenue',
  });
  const [vendorForm, setVendorForm] = useState(createVendorFormState);
  const [assetForm, setAssetForm] = useState({
    assetName: '',
    description: '',
    cost: '',
    lifeYears: '5',
    purchaseDate: new Date().toISOString().slice(0, 10),
  });
  const [expenseCoreForm, setExpenseCoreForm] = useState({
    expenseDate: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    paidAmount: '',
    paymentMode: 'cash',
    expenseAccountName: 'Electricity Expense',
    vendorId: '',
    vendorName: '',
  });

  const cashEntries = cashBook?.entries || [];
  const bankEntries = bankBook?.entries || [];
  const reconciliationPending = bankBook?.reconciliationPending || [];
  const trialBalanceRows = trialBalance?.rows || [];

  const daybookPagination = usePaginatedRows(daybookRows, { initialPageSize: 10, resetDeps: [startDate, endDate] });
  const voucherPagination = usePaginatedRows(voucherRows, { initialPageSize: 10, resetDeps: [startDate, endDate] });
  const cashBookPagination = usePaginatedRows<any>(cashEntries, { initialPageSize: 10, resetDeps: [startDate, endDate] });
  const bankBookPagination = usePaginatedRows<any>(bankEntries, { initialPageSize: 10, resetDeps: [startDate, endDate] });
  const reconciliationPagination = usePaginatedRows<any>(reconciliationPending, {
    initialPageSize: 10,
    resetDeps: [startDate, endDate],
  });
  const ledgerPagination = usePaginatedRows<any>(ledgerRows, { initialPageSize: 10, resetDeps: [startDate, endDate, selectedAccountId] });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';
  const buttonClass = 'inline-flex items-center gap-2 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';
  const secondaryButtonClass = 'inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60';

  const formatShortDate = (value?: string | Date) => {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN');
  };

  const normalizeId = (value: unknown) => String(value || '').trim();

  const toCleanText = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) return '';
    return text.replace(/\s+/g, ' ').trim();
  };

  const toFriendlyServerDetail = (detail: string, path: string): string => {
    const lower = String(detail || '').toLowerCase();
    if (!lower) return '';

    const isDuplicate = lower.includes('e11000') || lower.includes('duplicate key');
    if (isDuplicate && lower.includes('chartaccounts') && (lower.includes('fixed_assets') || lower.includes('systemkey'))) {
      if (path.includes('/vendors')) {
        return 'Unable to create vendor because accounting system account setup is in conflict. Please refresh and try again.';
      }
      if (path.includes('/fixed-assets')) {
        return 'Unable to create fixed asset because the Fixed Assets system account is in conflict. Please refresh and try again.';
      }
      return 'Accounting setup conflict detected for system accounts. Please refresh and try again.';
    }

    if (isDuplicate) {
      return 'Duplicate record detected. Please verify existing data and try again.';
    }

    if (lower.includes('validation failed')) {
      return 'One or more fields are invalid. Please review the form and try again.';
    }

    if (lower.includes('cast to objectid failed')) {
      return 'The selected record is invalid or no longer available.';
    }

    if (lower.includes('plan executor error during findandmodify')) {
      return 'A database conflict occurred while saving data. Please refresh and retry.';
    }

    return detail;
  };

  const buildApiErrorMessage = ({
    path,
    method,
    status,
    serverError,
    serverMessage,
    responseText,
  }: {
    path: string;
    method: string;
    status: number;
    serverError?: string;
    serverMessage?: string;
    responseText?: string;
  }) => {
    const detail = serverError || serverMessage || responseText;
    const cleanDetail = toCleanText(detail);
    const friendlyDetail = toFriendlyServerDetail(cleanDetail, path);
    const endpointLabel = `${method.toUpperCase()} ${path}`;

    if (status === 401) {
      return `Your session has expired for ${endpointLabel}. Please log in again and retry.`;
    }

    if (status === 403) {
      return friendlyDetail || `You do not have permission to use ${endpointLabel}.`;
    }

    if (status === 404) {
      return friendlyDetail
        || `The requested accounting API route was not found: ${endpointLabel}. The frontend and backend may be on different code versions.`;
    }

    if (status >= 500) {
      return friendlyDetail || `The server failed while processing ${endpointLabel}. Please check server logs and try again.`;
    }

    return friendlyDetail || `Request failed for ${endpointLabel} with status ${status}.`;
  };

  const parseApiPayload = (rawText: string) =>
    rawText
      ? (() => {
          try {
            return JSON.parse(rawText);
          } catch {
            return {};
          }
        })()
      : {};

  const getAccountingPathCandidates = (path: string): string[] => {
    if (!path.startsWith('/api/accounting/core/')) {
      return [path];
    }

    const legacyPath = `/api/accounting/${path.slice('/api/accounting/core/'.length)}`;
    return legacyPath === path ? [path] : [path, legacyPath];
  };

  const apiJson = async (path: string, options: RequestInit = {}) => {
    const method = String(options.method || 'GET').toUpperCase();
    const pathsToTry = getAccountingPathCandidates(path);

    for (let index = 0; index < pathsToTry.length; index += 1) {
      const requestPath = pathsToTry[index];
      let response: Response;

      try {
        response = await fetch(apiUrl(requestPath), { ...options, headers: { ...headers, ...(options.headers || {}) } });
      } catch (_error) {
        throw new Error(`Unable to reach ${method} ${requestPath}. Check whether the backend server is running and accessible.`);
      }

      const rawText = await response.text();
      const data = parseApiPayload(rawText);

      if (response.ok && data.success) {
        return data;
      }

      const shouldTryLegacyFallback = response.status === 404 && index < pathsToTry.length - 1;
      if (shouldTryLegacyFallback) {
        continue;
      }

      throw new Error(
        buildApiErrorMessage({
          path: requestPath,
          method,
          status: response.status,
          serverError: typeof data?.error === 'string' ? data.error : '',
          serverMessage: typeof data?.message === 'string' ? data.message : '',
          responseText: rawText,
        })
      );
    }

    throw new Error(`Request failed for ${method} ${path}.`);
  };

  useEffect(() => {
    const loadCurrentUserRole = async () => {
      try {
        const data = await apiJson('/api/auth/me');
        setCurrentUserRole(String(data?.user?.role || '').toLowerCase());
      } catch {
        setCurrentUserRole('');
      }
    };
    void loadCurrentUserRole();
  }, []);

  const runTaskGroup = async (tasks: Array<{ label: string; run: () => Promise<void> }>) => {
    const results = await Promise.allSettled(tasks.map((task) => task.run()));
    const failures = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [];
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason || 'Request failed');
      return [`${tasks[index].label}: ${reason}`];
    });

    if (failures.length > 0) {
      throw new Error(failures.join(' | '));
    }
  };

  const loadTabData = async (tab: TabKey) => {
    if (startDate > endDate) {
      throw new Error('Start date must be before end date');
    }

    const tasks: Array<{ label: string; run: () => Promise<void> }> = [];

    if (tab === 'dashboard' || tab === 'invoices') {
      tasks.push({ label: 'Dashboard invoices and payments', run: refreshDashboard });
    }
    if (tab === 'masters') {
      tasks.push({ label: 'Vendors, assets, and periods', run: refreshMasters });
    }
    if (tab === 'payments') {
      tasks.push({ label: 'Employee master', run: refreshEmployeeMaster });
      tasks.push({ label: 'Salary, contract, and day-book entries', run: refreshPayments });
    }
    if (tab === 'opening') {
      tasks.push({ label: 'Opening balances', run: refreshOpening });
    }
    if (tab === 'expenses') {
      tasks.push({ label: 'Employee master', run: refreshEmployeeMaster });
      tasks.push({ label: 'Salary, contract, and day-book entries', run: refreshPayments });
      tasks.push({ label: 'Dashboard invoices and payments', run: refreshDashboard });
    }
    if (tab === 'vouchers') {
      tasks.push({ label: 'Vouchers', run: refreshVouchers });
    }
    if (tab === 'books') {
      tasks.push({ label: 'Cash and bank book', run: refreshBooks });
    }
    if (tab === 'ledger') {
      tasks.push({ label: 'Chart of accounts', run: refreshChart });
      if (selectedAccountId) {
        tasks.push({ label: 'Ledger details', run: () => refreshLedger(selectedAccountId) });
      }
    }
    if (tab === 'reports') {
      tasks.push({ label: 'Financial reports', run: refreshReports });
      tasks.push({ label: 'Invoices, payments, and journals', run: refreshDashboard });
      tasks.push({ label: 'Vendors, assets, and periods', run: refreshMasters });
      tasks.push({ label: 'Voucher list', run: refreshVouchers });
      tasks.push({ label: 'Cash and bank books', run: refreshBooks });
      tasks.push({ label: 'Salary, contract, and day-book entries', run: refreshPayments });
    }

    if (tasks.length === 0) return;
    await runTaskGroup(tasks);
  };

  const parseOpeningRows = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, amount, side] = line.split(':').map((item) => item.trim());
        return { name, amount: Number(amount || 0), side: side === 'credit' ? 'credit' : 'debit' };
      })
      .filter((row) => row.name && row.amount > 0);

  const refreshPayments = async () => {
    const [salaryData, contractData, daybookData] = await Promise.all([
      apiJson(`/api/accounting/salary?limit=200&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/contracts?limit=200&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/day-book/entries?limit=200&startDate=${startDate}&endDate=${endDate}`),
    ]);
    setSalaryList(salaryData.data || []);
    setContractList(contractData.data || []);
    setDaybookRows(daybookData.data?.rows || []);
  };

  const refreshEmployeeMaster = async () => {
    const data = await apiJson('/api/accounting/employees/master');
    const rows: EmployeeMasterRow[] = data.data || [];
    setEmployeeMaster(rows);

    if (rows.length > 0) {
      setSalaryForm((prev) => {
        const selected = rows.find((row) => row._id === prev.employeeId) || rows[0];
        return {
          ...prev,
          employeeId: selected._id,
          employeeName: selected.name,
          designation: selected.designation || '',
        };
      });
    } else {
      setSalaryForm((prev) => ({
        ...prev,
        employeeId: '',
        employeeName: '',
        designation: '',
      }));
    }
  };

  const refreshOpening = async () => {
    const data = await apiJson('/api/accounting/opening-balances/status');
    setOpeningStatus(data.data || null);
  };

  const refreshVouchers = async () => {
    const data = await apiJson(`/api/accounting/vouchers?limit=200&startDate=${startDate}&endDate=${endDate}`);
    setVoucherRows(data.data || []);
  };

  const refreshChart = async () => {
    const data = await apiJson('/api/accounting/chart-accounts');
    setChartAccounts(data.data || []);
  };

  const refreshBooks = async () => {
    const [cashData, bankData] = await Promise.all([
      apiJson(`/api/accounting/books/cash?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/books/bank?startDate=${startDate}&endDate=${endDate}`),
    ]);
    setCashBook(cashData.data || null);
    setBankBook(bankData.data || null);
  };

  const refreshReports = async () => {
    const [expenseData, incomeData, trialData, pnlData, bsData] = await Promise.all([
      apiJson(`/api/accounting/reports/expense?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/income?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/trial-balance?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/balance-sheet?asOnDate=${endDate}`),
    ]);
    setExpenseReport(expenseData.data || null);
    setIncomeReport(incomeData.data || null);
    setTrialBalance(trialData.data || null);
    setProfitLoss(pnlData.data || null);
    setBalanceSheet(bsData.data || null);
  };

  const refreshDashboard = async () => {
    const [dashboardData, invoiceData, paymentData, journalData] = await Promise.all([
      apiJson('/api/accounting/core/dashboard'),
      apiJson(`/api/accounting/core/invoices?limit=200&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/core/payments?limit=200&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/core/journal-entries?limit=200&startDate=${startDate}&endDate=${endDate}`),
    ]);
    setDashboardSummary(dashboardData.data || null);
    setCoreInvoices(invoiceData.data || []);
    setCorePayments(paymentData.data || []);
    setCoreJournals(journalData.data || []);
  };

  const refreshMasters = async () => {
    const [vendorData, periodData, assetData] = await Promise.all([
      apiJson('/api/accounting/core/vendors'),
      apiJson(`/api/accounting/core/periods?year=${periodYear}`),
      apiJson('/api/accounting/core/fixed-assets'),
    ]);
    setVendors(vendorData.data || []);
    setPeriods(periodData.data || []);
    setFixedAssets(assetData.data || []);
  };

  const refreshLedger = async (accountId: string) => {
    if (!accountId) return;
    const data = await apiJson(`/api/accounting/chart-accounts/${accountId}/ledger?startDate=${startDate}&endDate=${endDate}`);
    setLedgerRows(data.data?.rows || []);
    setLedgerSummary(data.data || null);
  };

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e: any) {
      setError(e.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    withLoading(async () => {
      await loadTabData(activeTab);
    });
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'invoices') setInvoicesTab('invoice_entry');
    if (activeTab === 'payments') {
      if (editingContractId) setPaymentsTab('contract_entry');
      else setPaymentsTab('salary_entry');
    }
    if (activeTab === 'masters' && editingVendorId) setMastersTab('vendors');
    if (activeTab === 'opening') setOpeningTab('balances');
    if (activeTab === 'expenses') setExpensesTab('entry');
    if (activeTab === 'vouchers') setVouchersTab(editingVoucher?.type || 'receipt');
    if (activeTab === 'books') setBooksTab('summary');
    if (activeTab === 'ledger') setLedgerTab('create_account');
  }, [activeTab, editingContractId, editingVendorId, editingVoucher?.type]);

  useEffect(() => {
    setSelectedReconcileIds([]);
  }, [startDate, endDate, bankBook?.reconciliationPending?.length]);

  useEffect(() => {
    if (activeTab !== 'masters') return;
    withLoading(async () => {
      await runTaskGroup([{ label: 'Vendors, assets, and periods', run: refreshMasters }]);
    });
  }, [periodYear]);

  const handleRefreshCurrentTab = () => {
    withLoading(async () => {
      await loadTabData(activeTab);
    });
  };

  const confirmEntrySave = async (entryLabel: string, isEditMode: boolean) => {
    return showConfirmDialog(
      isEditMode
        ? `Save changes to this ${entryLabel}?`
        : `Create this ${entryLabel}?`,
      {
        title: isEditMode ? `Update ${entryLabel}` : `Create ${entryLabel}`,
        confirmText: isEditMode ? 'Save Changes' : 'Create',
      }
    );
  };

  const cancelContractEdit = () => {
    setEditingContractId(null);
    setContractForm(createContractFormState());
    setMessage('Contract edit cancelled');
  };

  const cancelManualEdit = () => {
    setEditingDaybookId(null);
    setManualForm(createManualFormState());
    setMessage('Entry edit cancelled');
  };

  const cancelVendorEdit = () => {
    setEditingVendorId(null);
    setVendorForm(createVendorFormState());
    setMessage('Vendor edit cancelled');
  };

  const resetVoucherForm = (voucherType: Exclude<VouchersTabKey, 'list'>) => {
    if (voucherType === 'receipt') setReceiptForm(createReceiptFormState());
    if (voucherType === 'payment') setPaymentForm(createPaymentVoucherFormState());
    if (voucherType === 'journal') setJournalForm(createJournalFormState());
    if (voucherType === 'transfer') setTransferForm(createTransferFormState());
  };

  const cancelVoucherEdit = () => {
    const editType = editingVoucher?.type;
    setEditingVoucher(null);
    if (editType) resetVoucherForm(editType);
    setMessage('Voucher edit cancelled');
  };

  const submitSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedMonth = String(salaryForm.month || '').trim();
    const normalizedPayDate = String(salaryForm.payDate || '').slice(0, 10);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalizedMonth)) {
      setError('Month must be in YYYY-MM format');
      return;
    }
    if (!normalizedPayDate || !normalizedPayDate.startsWith(`${normalizedMonth}-`)) {
      setError('Pay date must be inside the selected month');
      return;
    }

    const selectedEmployee = employeeMaster.find((row) => row._id === salaryForm.employeeId);
    const isEditMode = Boolean(editingSalaryId);
    if (!selectedEmployee && !isEditMode) {
      setError('Please select employee from master');
      return;
    }

    const employeeIdForValidation = String(selectedEmployee?._id || salaryForm.employeeId || '').trim();
    if (employeeIdForValidation) {
      const duplicate = salaryList.find((row) =>
        String(row._id || '') !== String(editingSalaryId || '')
        && String(row.employeeId || '').trim() === employeeIdForValidation
        && String(row.month || '').trim() === normalizedMonth
        && String(row.payDate || '').slice(0, 10) === normalizedPayDate
      );
      if (duplicate) {
        setError('Salary entry already exists for this employee on the same pay date in this month');
        return;
      }
    }

    if (!(await confirmEntrySave('salary payment', isEditMode))) return;

    await withLoading(async () => {
      const payload = {
        ...salaryForm,
        month: normalizedMonth,
        payDate: normalizedPayDate,
        employeeId: selectedEmployee?._id || salaryForm.employeeId || undefined,
        employeeName: selectedEmployee?.name || salaryForm.employeeName,
        designation: selectedEmployee?.designation || salaryForm.designation || '',
        amount: Number(salaryForm.amount || 0),
        bonusAmount: Number(salaryForm.bonusAmount || 0),
      };

      const response = await apiJson(
        editingSalaryId ? `/api/accounting/salary/${editingSalaryId}` : '/api/accounting/salary',
        {
          method: editingSalaryId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      setMessage(
        String(
          response?.message
          || (editingSalaryId ? 'Salary payment updated' : 'Salary payment added')
        )
      );
      setEditingSalaryId(null);
      setSalaryForm(createSalaryFormState());
      await refreshPayments();
    });
  };

  const submitContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(contractForm.amount || 0);
    if (amount <= 0) {
      setError('Contract amount must be greater than zero.');
      return;
    }
    const isEditMode = Boolean(editingContractId);
    if (!(await confirmEntrySave('contract payment', isEditMode))) return;

    await withLoading(async () => {
      const response = await apiJson(editingContractId ? `/api/accounting/contracts/${editingContractId}` : '/api/accounting/contracts', {
        method: editingContractId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...contractForm, amount }),
      });
      setMessage(String(response?.message || (editingContractId ? 'Contract payment updated' : 'Contract payment added')));
      setEditingContractId(null);
      setContractForm(createContractFormState());
      await refreshPayments();
    });
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(manualForm.amount || 0);
    if (amount <= 0) {
      setError('Entry amount must be greater than zero.');
      return;
    }
    const isEditMode = Boolean(editingDaybookId);
    if (!(await confirmEntrySave('day-book entry', isEditMode))) return;

    await withLoading(async () => {
      const response = await apiJson(editingDaybookId ? `/api/accounting/day-book/entry/${editingDaybookId}` : '/api/accounting/day-book/entry', {
        method: editingDaybookId ? 'PUT' : 'POST',
        body: JSON.stringify({ ...manualForm, amount }),
      });
      setMessage(String(response?.message || (editingDaybookId ? 'Entry updated' : 'Entry added')));
      setEditingDaybookId(null);
      setManualForm(createManualFormState());
      await refreshPayments();
      await refreshBooks();
      await refreshReports();
    });
  };

  const saveOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/opening-balances', {
        method: 'POST',
        body: JSON.stringify({
          ...openingForm,
          cashAmount: Number(openingForm.cashAmount || 0),
          bankAmount: Number(openingForm.bankAmount || 0),
          openingStockValue: Number(openingForm.openingStockValue || 0),
          customerAccounts: parseOpeningRows(openingForm.customerAccountsText),
          supplierAccounts: parseOpeningRows(openingForm.supplierAccountsText),
        }),
      });
      setMessage('Opening balances saved');
      await refreshOpening();
      await refreshLedger(selectedAccountId);
    });
  };

  const lockOpening = async () => {
    await withLoading(async () => {
      await apiJson('/api/accounting/opening-balances/lock', { method: 'POST' });
      setMessage('Opening balances locked');
      await refreshOpening();
    });
  };

  const saveVoucher = async ({
    voucherType,
    createPath,
    body,
    createSuccess,
  }: {
    voucherType: Exclude<VouchersTabKey, 'list'>;
    createPath: string;
    body: Record<string, any>;
    createSuccess: string;
  }) => {
    const isEditMode = editingVoucher?.type === voucherType && Boolean(editingVoucher?.id);
    if (!(await confirmEntrySave(`${voucherType} voucher`, isEditMode))) return;

    await withLoading(async () => {
      let response;
      if (isEditMode && editingVoucher?.id) {
        const primaryUpdatePath = `/api/accounting/vouchers/${editingVoucher.id}`;
        try {
          response = await apiJson(primaryUpdatePath, {
            method: 'PUT',
            body: JSON.stringify(body),
          });
        } catch (error: any) {
          const message = String(error?.message || '');
          const isMissingPutRoute = message.includes(`API endpoint not found: PUT ${primaryUpdatePath}`);
          if (!isMissingPutRoute) throw error;

          response = await apiJson(`/api/accounting/vouchers/${editingVoucher.id}/update`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
        }
      } else {
        response = await apiJson(createPath, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setMessage(String(response?.message || (isEditMode ? 'Voucher updated' : createSuccess)));
      setEditingVoucher(null);
      resetVoucherForm(voucherType);
      await refreshVouchers();
      await refreshPayments();
      await refreshBooks();
      await refreshReports();
    });
  };

  const saveChartAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/chart-accounts', { method: 'POST', body: JSON.stringify(accountForm) });
      setMessage('Chart account added');
      setAccountForm({ accountName: '', accountType: 'asset', subType: 'general' });
      await refreshChart();
    });
  };

  const downloadExport = async (reportType: string, params: Record<string, string> = {}) => {
    const token = localStorage.getItem('token');
    const query = new URLSearchParams(params).toString();
    const exportPath = `/api/accounting/core/exports/${reportType}${query ? `?${query}` : ''}`;
    const pathsToTry = getAccountingPathCandidates(exportPath);
    let response: Response | null = null;

    for (let index = 0; index < pathsToTry.length; index += 1) {
      const requestPath = pathsToTry[index];
      let candidateResponse: Response;

      try {
        candidateResponse = await fetch(apiUrl(requestPath), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        throw new Error(`Unable to reach GET ${requestPath}. Check whether the backend server is running.`);
      }

      if (candidateResponse.ok) {
        response = candidateResponse;
        break;
      }

      const rawText = await candidateResponse.text();
      const payload = parseApiPayload(rawText);
      const shouldTryLegacyFallback = candidateResponse.status === 404 && index < pathsToTry.length - 1;
      if (shouldTryLegacyFallback) {
        continue;
      }

      throw new Error(
        buildApiErrorMessage({
          path: requestPath,
          method: 'GET',
          status: candidateResponse.status,
          serverError: typeof payload?.error === 'string' ? payload.error : '',
          serverMessage: typeof payload?.message === 'string' ? payload.message : '',
          responseText: rawText,
        })
      );
    }

    if (!response) {
      throw new Error(
        `The requested accounting API route was not found: GET ${exportPath}. The frontend and backend may be on different code versions.`
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const submitInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/core/invoices', {
        method: 'POST',
        body: JSON.stringify({
          ...invoiceForm,
          baseAmount: Number(invoiceForm.baseAmount || 0),
          gstAmount: Number(invoiceForm.gstAmount || 0),
          paymentAmount: Number(invoiceForm.paymentAmount || 0),
        }),
      });
      setMessage('Accounting invoice created');
      setInvoiceForm((prev) => ({ ...prev, customerName: '', description: '', baseAmount: '', gstAmount: '', paymentAmount: '' }));
      await refreshDashboard();
      await refreshReports();
    });
  };

  const addInvoicePayment = async (invoiceId: string) => {
    const amount = await showPromptDialog('Enter the payment amount to post against this invoice.', {
      title: 'Add Invoice Payment',
      label: 'Payment amount',
      inputType: 'number',
      confirmText: 'Post Payment',
      required: true,
    });
    if (!amount) return;
    await withLoading(async () => {
      await apiJson(`/api/accounting/core/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), mode: invoiceForm.paymentMode }),
      });
      setMessage('Payment posted against invoice');
      await refreshDashboard();
      await refreshReports();
    });
  };

  const cancelCoreInvoice = async (invoiceId: string) => {
    const reason = await showPromptDialog('Enter the invoice cancellation reason.', {
      title: 'Cancel Invoice',
      label: 'Reason',
      defaultValue: 'Cancelled by user',
      confirmText: 'Cancel Invoice',
      inputType: 'textarea',
      required: true,
    });
    if (!reason) return;
    await withLoading(async () => {
      await apiJson(`/api/accounting/core/invoices/${invoiceId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMessage('Invoice cancelled');
      await refreshDashboard();
      await refreshReports();
    });
  };

  const submitCoreExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/core/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...expenseCoreForm,
          amount: Number(expenseCoreForm.amount || 0),
          paidAmount: Number(expenseCoreForm.paidAmount || expenseCoreForm.amount || 0),
          vendorId: expenseCoreForm.vendorId || undefined,
          vendorName: expenseCoreForm.vendorId ? undefined : expenseCoreForm.vendorName,
        }),
      });
      setMessage('Expense recorded in accounting core');
      setExpenseCoreForm((prev) => ({ ...prev, description: '', amount: '', paidAmount: '', vendorName: '' }));
      await refreshDashboard();
      await refreshMasters();
      await refreshReports();
    });
  };

  const submitVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEditMode = Boolean(editingVendorId);
    if (!(await confirmEntrySave('vendor master record', isEditMode))) return;
    await withLoading(async () => {
      const response = await apiJson(editingVendorId ? `/api/accounting/core/vendors/${editingVendorId}` : '/api/accounting/core/vendors', {
        method: editingVendorId ? 'PUT' : 'POST',
        body: JSON.stringify(vendorForm),
      });
      setMessage(String(response?.message || (editingVendorId ? 'Vendor updated' : 'Vendor created')));
      setEditingVendorId(null);
      setVendorForm(createVendorFormState());
      await refreshMasters();
      await refreshReports();
    });
  };

  const submitAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/core/fixed-assets', {
        method: 'POST',
        body: JSON.stringify({
          ...assetForm,
          cost: Number(assetForm.cost || 0),
          lifeYears: Number(assetForm.lifeYears || 0),
        }),
      });
      setMessage('Fixed asset created');
      setAssetForm((prev) => ({ ...prev, assetName: '', description: '', cost: '' }));
      await refreshMasters();
    });
  };

  const postDepreciation = async (assetId: string) => {
    await withLoading(async () => {
      await apiJson(`/api/accounting/core/fixed-assets/${assetId}/depreciate`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Depreciation posted');
      await refreshMasters();
      await refreshDashboard();
      await refreshReports();
    });
  };

  const togglePeriodLock = async (month: number, year: number, isLocked: boolean) => {
    await withLoading(async () => {
      await apiJson('/api/accounting/core/periods', {
        method: 'POST',
        body: JSON.stringify({ month, year, isLocked }),
      });
      setMessage(`Period ${year}-${String(month).padStart(2, '0')} ${isLocked ? 'locked' : 'unlocked'}`);
      await refreshMasters();
    });
  };

  const importBankCsv = async (markMatched = false) => {
    await withLoading(async () => {
      const data = await apiJson('/api/accounting/core/reconciliation/import', {
        method: 'POST',
        body: JSON.stringify({ csvText: bankCsvText, markMatched }),
      });
      setBankImportResult(data.data || null);
      setMessage(data.message || 'Bank CSV processed');
      await refreshBooks();
    });
  };

  const editDaybook = (row: DayBookEntry) => {
    setEditingDaybookId(row._id);
    setManualForm({
      entryType: row.entryType,
      category: row.category || '',
      amount: String(Number(row.amount || 0)),
      paymentMethod: row.paymentMethod || 'cash',
      narration: row.narration || '',
      referenceNo: row.referenceNo || '',
      entryDate: String(row.entryDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
    setExpensesTab('entry');
    setMessage(`Editing ${row.entryType} entry dated ${formatShortDate(row.entryDate)}`);
  };

  const deleteDaybook = async (row: DayBookEntry) => {
    if (!(await showConfirmDialog('Cancel this entry?', { title: 'Cancel Entry', confirmText: 'Cancel Entry' }))) return;
    await withLoading(async () => {
      await apiJson(`/api/accounting/day-book/entry/${row._id}`, { method: 'DELETE' });
      setMessage('Entry cancelled');
      await refreshPayments();
      await refreshBooks();
      await refreshReports();
    });
  };

  const editSalary = (row: SalaryPayment) => {
    const rowPayDate = String(row.payDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const matchedEmployee = employeeMaster.find((emp) => String(emp._id) === String(row.employeeId || ''))
      || employeeMaster.find((emp) => emp.name.toLowerCase() === String(row.employeeName || '').toLowerCase());

    setEditingSalaryId(row._id);
    setSalaryForm({
      employeeId: String(matchedEmployee?._id || row.employeeId || ''),
      employeeName: matchedEmployee?.name || row.employeeName || '',
      designation: matchedEmployee?.designation || row.designation || '',
      month: row.month || rowPayDate.slice(0, 7),
      payDate: rowPayDate,
      amount: String(Number(row.baseAmount ?? row.amount ?? 0)),
      bonusAmount: String(Number(row.bonusAmount || 0)),
      paymentMethod: row.paymentMethod || 'bank',
      notes: row.notes || '',
    });
    setPaymentsTab('salary_entry');
    setMessage(`Editing salary entry for ${row.employeeName} (${row.month})`);
  };

  const cancelSalaryEdit = () => {
    setEditingSalaryId(null);
    setSalaryForm(createSalaryFormState());
    setMessage('Salary edit cancelled');
  };

  const editContract = (row: ContractPayment) => {
    setEditingContractId(row._id);
    setContractForm({
      contractorName: row.contractorName || '',
      contractTitle: row.contractTitle || '',
      paymentDate: String(row.paymentDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      amount: String(Number(row.amount || 0)),
      status: row.status || 'paid',
      paymentMethod: row.paymentMethod || 'bank',
      notes: row.notes || '',
    });
    setPaymentsTab('contract_entry');
    setMessage(`Editing contract payment for ${row.contractorName}`);
  };

  const editVendor = (row: any) => {
    setEditingVendorId(normalizeId(row._id));
    setVendorForm({
      name: row.name || '',
      contact: row.contact || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
    });
    setMastersTab('vendors');
    setMessage(`Editing vendor ${row.name}`);
  };

  const escapeHtml = (value: unknown) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const getVoucherBranding = () => {
    const settings = getGeneralSettings();
    const businessName = settings.business.tradeName || settings.business.legalName || 'SPARK AI';
    const legalName = String(settings.business.legalName || '').trim();
    const addressParts = [
      settings.business.addressLine1,
      settings.business.addressLine2,
      [settings.business.city, settings.business.state].filter(Boolean).join(', '),
      settings.business.pincode,
      settings.business.country,
    ]
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    const addressLabel = addressParts.join(', ');
    const logoUrl = resolveGeneralSettingsAssetUrl(
      settings.business.reportLogoDataUrl || settings.business.invoiceLogoDataUrl || ''
    );

    return {
      businessName,
      legalName,
      addressLabel,
      logoUrl,
      showVoucherSignatureLines: Boolean(settings.printing.showVoucherSignatureLines ?? true),
    };
  };

  const buildPaymentVoucherPrintHtml = (row: VoucherRow) => {
    const documentFields = row.documentFields || {};
    const branding = getVoucherBranding();
    const voucherNo = row.voucherNumber || row.referenceNo || '-';
    const accountName = documentFields.accountName || row.counterpartyName || '-';
    const beingPaymentOf = documentFields.beingPaymentOf || row.notes || row.lines?.[0]?.narration || '-';
    const forPeriod = documentFields.forPeriod || '-';
    const receivedBy = documentFields.receivedBy || '-';
    const authorizedBy = documentFields.authorizedBy || '-';
    const dateLabel = new Date(row.voucherDate).toLocaleDateString('en-IN');
    const amountLabel = formatCurrency(Number(row.totalAmount || 0));
    const signatureSection = branding.showVoucherSignatureLines
      ? `
            <div class="field-line">
              <div class="label">Sign:</div>
              <div class="line"></div>
            </div>
      `
      : '';

    return `
      <html>
        <head>
          <title>${escapeHtml(voucherNo)}</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f2f2f2; margin: 0; padding: 24px; color: #111; }
            .voucher { background: #fff; border: 2px solid #333; padding: 18px 22px; max-width: 820px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand-logo { width: 78px; height: 78px; object-fit: contain; flex-shrink: 0; }
            .brand-name { font-size: 24px; font-weight: 700; }
            .brand-legal { font-size: 12px; color: #4b5563; margin-top: 4px; }
            .brand-address { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.45; max-width: 360px; }
            .title-wrap { text-align: right; }
            .title { background: #000; color: #fff; font-weight: 700; font-size: 24px; letter-spacing: 0.5px; padding: 8px 18px; display: inline-block; }
            .title-sub { margin-top: 8px; font-size: 12px; color: #4b5563; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
            .field-line { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 14px; font-size: 16px; }
            .label { white-space: nowrap; min-width: fit-content; }
            .line { border-bottom: 1.5px solid #444; flex: 1; min-height: 28px; display: flex; align-items: center; padding: 0 6px; }
            .line span { font-size: 15px; }
            .separator { border-top: 1.5px solid #444; margin: 18px 0 14px; }
            .footer { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
            .footer-box .field-line { margin-bottom: 12px; }
            .summary-grid { display: grid; grid-template-columns: 1fr 220px; gap: 14px; }
            .summary-card { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px 14px; background: #fafafa; }
            .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; font-weight: 700; }
            .summary-value { margin-top: 6px; font-size: 20px; font-weight: 700; }
            @media print {
              body { background: #fff; padding: 0; }
              .voucher { border: 1px solid #000; }
            }
          </style>
        </head>
        <body>
          <div class="voucher">
            <div class="header">
              <div class="brand">
                ${branding.logoUrl ? `<img class="brand-logo" src="${escapeHtml(branding.logoUrl)}" alt="Company Logo" />` : ''}
                <div>
                  <div class="brand-name">${escapeHtml(branding.businessName)}</div>
                  ${branding.legalName ? `<div class="brand-legal">${escapeHtml(branding.legalName)}</div>` : ''}
                  ${branding.addressLabel ? `<div class="brand-address">${escapeHtml(branding.addressLabel)}</div>` : ''}
                </div>
              </div>
              <div class="title-wrap">
                <div class="title">PAYMENT VOUCHER</div>
                <div class="title-sub">Company Voucher Copy</div>
              </div>
            </div>

            <div class="summary-grid">
              <div>
                <div class="field-line">
                  <div class="label">No.</div>
                  <div class="line"><span>${escapeHtml(voucherNo)}</span></div>
                  <div class="label">Date:</div>
                  <div class="line"><span>${escapeHtml(dateLabel)}</span></div>
                </div>
              </div>
              <div class="summary-card">
                <div class="summary-label">Amount</div>
                <div class="summary-value">${escapeHtml(amountLabel)}</div>
              </div>
            </div>

            <div class="field-line">
              <div class="label">Name of the account:</div>
              <div class="line"><span>${escapeHtml(accountName)}</span></div>
            </div>

            <div class="field-line">
              <div class="label">Being Payment of:</div>
              <div class="line"><span>${escapeHtml(beingPaymentOf)}</span></div>
            </div>

            <div class="separator"></div>

            <div class="field-line">
              <div class="label">For the period:</div>
              <div class="line"><span>${escapeHtml(forPeriod)}</span></div>
            </div>

            <div class="footer">
              <div class="footer-box">
                <div class="field-line">
                  <div class="label">Received by:</div>
                  <div class="line"><span>${escapeHtml(receivedBy)}</span></div>
                </div>
                ${signatureSection}
              </div>
              <div class="footer-box">
                <div class="field-line">
                  <div class="label">Authorized by:</div>
                  <div class="line"><span>${escapeHtml(authorizedBy)}</span></div>
                </div>
                ${signatureSection}
              </div>
            </div>
          </div>
        </body>
      </html>`;
  };

  const buildGenericVoucherPrintHtml = (row: VoucherRow) => {
    const branding = getVoucherBranding();
    const voucherNo = row.voucherNumber || row.referenceNo || '-';
    const title = `${String(row.voucherType || 'voucher').toUpperCase()} VOUCHER`;
    const notes = row.notes || row.documentFields?.beingPaymentOf || '-';

    return `
      <html>
        <head>
          <title>${escapeHtml(voucherNo)}</title>
          <style>
            body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; color: #111827; }
            .sheet { max-width: 860px; margin: 0 auto; background: #fff; border: 2px solid #1f2937; padding: 22px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; border-bottom: 1px solid #d1d5db; padding-bottom: 16px; margin-bottom: 18px; }
            .brand { display: flex; align-items: center; gap: 14px; }
            .brand-logo { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; }
            .brand-name { font-size: 22px; font-weight: 700; }
            .brand-legal { font-size: 12px; color: #4b5563; margin-top: 4px; }
            .brand-address { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.45; max-width: 360px; }
            .voucher-title { font-size: 24px; font-weight: 800; text-align: right; }
            .voucher-sub { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; text-align: right; margin-top: 6px; }
            .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
            .meta-card { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; background: #fafafa; }
            .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; font-weight: 700; }
            .meta-value { margin-top: 6px; font-size: 15px; font-weight: 600; color: #111827; word-break: break-word; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            th, td { border: 1px solid #d1d5db; padding: 10px 12px; font-size: 13px; text-align: left; }
            th { background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: #4b5563; }
            .notes { margin-top: 16px; border: 1px solid #d1d5db; border-radius: 12px; padding: 14px; background: #fafafa; }
            .notes-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #6b7280; font-weight: 700; }
            .notes-value { margin-top: 8px; font-size: 14px; }
            @media print { body { background: #fff; padding: 0; } .sheet { border: 1px solid #111827; } }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <div class="brand">
                ${branding.logoUrl ? `<img class="brand-logo" src="${escapeHtml(branding.logoUrl)}" alt="Company Logo" />` : ''}
                <div>
                  <div class="brand-name">${escapeHtml(branding.businessName)}</div>
                  ${branding.legalName ? `<div class="brand-legal">${escapeHtml(branding.legalName)}</div>` : ''}
                  ${branding.addressLabel ? `<div class="brand-address">${escapeHtml(branding.addressLabel)}</div>` : ''}
                </div>
              </div>
              <div>
                <div class="voucher-title">${escapeHtml(title)}</div>
                <div class="voucher-sub">Printed voucher copy</div>
              </div>
            </div>

            <div class="meta">
              <div class="meta-card"><div class="meta-label">Voucher No</div><div class="meta-value">${escapeHtml(voucherNo)}</div></div>
              <div class="meta-card"><div class="meta-label">Date</div><div class="meta-value">${escapeHtml(new Date(row.voucherDate).toLocaleDateString('en-IN'))}</div></div>
              <div class="meta-card"><div class="meta-label">Type</div><div class="meta-value">${escapeHtml(String(row.voucherType || '-').toUpperCase())}</div></div>
              <div class="meta-card"><div class="meta-label">Amount</div><div class="meta-value">${escapeHtml(formatCurrency(Number(row.totalAmount || 0)))}</div></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                ${(row.lines && row.lines.length
                  ? row.lines
                  : [{ accountName: row.counterpartyName || '-', debit: 0, credit: Number(row.totalAmount || 0), narration: notes }]
                ).map((line) => `
                  <tr>
                    <td>${escapeHtml(line.accountName || '-')}</td>
                    <td>${escapeHtml(formatCurrency(Number(line.debit || 0)))}</td>
                    <td>${escapeHtml(formatCurrency(Number(line.credit || 0)))}</td>
                    <td>${escapeHtml(line.narration || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="notes">
              <div class="notes-label">Notes</div>
              <div class="notes-value">${escapeHtml(notes)}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printVoucher = async (row: VoucherRow) => {
    const popup = window.open('', '_blank', 'width=700,height=700');
    if (!popup) {
      setError('Allow popups to print voucher');
      return;
    }
    const html = row.voucherType === 'payment'
      ? buildPaymentVoucherPrintHtml(row)
      : buildGenericVoucherPrintHtml(row);
    popup.document.write(html);
    popup.document.close();
    popup.print();
    popup.close();
    await apiJson(`/api/accounting/vouchers/${row._id}/mark-printed`, { method: 'POST' }).catch(() => undefined);
    await refreshVouchers();
  };

  const editVoucher = (row: VoucherRow) => {
    const voucherId = normalizeId(row._id);
    if (!voucherId) {
      setError('Unable to edit this voucher because the record id is missing.');
      return;
    }

    const voucherDate = String(row.voucherDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (row.voucherType === 'receipt') {
      setEditingVoucher({ id: voucherId, type: 'receipt' });
      setReceiptForm({
        amount: String(Number(row.totalAmount || 0)),
        voucherDate,
        paymentMode: row.paymentMode || 'cash',
        category: row.lines?.find((line) => Number(line.credit || 0) > 0)?.narration || 'Service Income',
        referenceNo: row.referenceNo || '',
        counterpartyName: row.counterpartyName || '',
        notes: row.notes || '',
      });
      setVouchersTab('receipt');
    }

    if (row.voucherType === 'payment') {
      const documentFields = row.documentFields || {};
      setEditingVoucher({ id: voucherId, type: 'payment' });
      setPaymentForm({
        amount: String(Number(row.totalAmount || 0)),
        voucherDate,
        paymentMode: row.paymentMode || 'cash',
        category: row.lines?.find((line) => Number(line.debit || 0) > 0)?.narration || 'General Expense',
        referenceNo: row.referenceNo || '',
        accountName: documentFields.accountName || row.counterpartyName || '',
        beingPaymentOf: documentFields.beingPaymentOf || row.notes || '',
        forPeriod: documentFields.forPeriod || '',
        receivedBy: documentFields.receivedBy || '',
        authorizedBy: documentFields.authorizedBy || '',
      });
      setVouchersTab('payment');
    }

    if (row.voucherType === 'journal') {
      const debitLine = row.lines?.find((line) => Number(line.debit || 0) > 0);
      const creditLine = row.lines?.find((line) => Number(line.credit || 0) > 0);
      setEditingVoucher({ id: voucherId, type: 'journal' });
      setJournalForm({
        voucherDate,
        referenceNo: row.referenceNo || '',
        notes: row.notes || '',
        debitAccountId: normalizeId(debitLine?.accountId),
        creditAccountId: normalizeId(creditLine?.accountId),
        amount: String(Number(row.totalAmount || 0)),
      });
      setVouchersTab('journal');
    }

    if (row.voucherType === 'transfer') {
      setEditingVoucher({ id: voucherId, type: 'transfer' });
      setTransferForm({
        amount: String(Number(row.totalAmount || 0)),
        transferDate: voucherDate,
        direction: String(row.notes || '').toLowerCase().includes('bank_to_cash') ? 'bank_to_cash' : 'cash_to_bank',
        referenceNo: row.referenceNo || '',
        notes: row.notes || '',
      });
      setVouchersTab('transfer');
    }

    setMessage(`Editing voucher ${row.voucherNumber || voucherId}`);
  };

  const deleteVoucher = async (row: VoucherRow) => {
    if (!isSuperAdmin) {
      setError('Only super admin can delete vouchers.');
      return;
    }
    if (!(await showConfirmDialog(`Delete voucher ${row.voucherNumber}? This cannot be undone.`, { title: 'Delete Voucher', confirmText: 'Delete', severity: 'warning' }))) return;

    await withLoading(async () => {
      await apiJson(`/api/accounting/vouchers/${row._id}`, { method: 'DELETE' });
      setMessage('Voucher deleted');
      await refreshVouchers();
      await refreshBooks();
      await refreshReports();
      await refreshPayments();
    });
  };

  const renderTablePagination = (pagination: any, itemLabel: string) => (
    <PaginationControls
      currentPage={pagination.currentPage}
      totalPages={pagination.totalPages}
      totalRows={pagination.totalRows}
      pageSize={pagination.pageSize}
      startIndex={pagination.startIndex}
      endIndex={pagination.endIndex}
      itemLabel={itemLabel}
      onPageChange={pagination.setCurrentPage}
      onPageSizeChange={pagination.setPageSize}
    />
  );

  const renderReportsSection = () => {
    if (reportsTab === 'overview') {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('invoices', { startDate, endDate }))}>
              <ExportIcon />
              Export Invoices CSV
            </button>
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('trial-balance', { startDate, endDate }))}>
              <ExportIcon />
              Export Trial Balance CSV
            </button>
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('profit-loss', { startDate, endDate }))}>
              <ExportIcon />
              Export P&L CSV
            </button>
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('vendors'))}>
              <ExportIcon />
              Export Vendor Ledger CSV
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-gray-300">Total Income</p><p className="text-xl font-semibold text-emerald-300">{formatCurrency(incomeReport?.totalIncome || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-gray-300">Total Expense</p><p className="text-xl font-semibold text-red-300">{formatCurrency(expenseReport?.totalExpense || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-gray-300">Net Profit/Loss</p><p className="text-xl font-semibold text-white">{formatCurrency(profitLoss?.netProfit || 0)}</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 text-white font-semibold">Balance Sheet</h3>
              <p className="text-sm text-gray-300">Assets: {formatCurrency(balanceSheet?.totals?.totalAssets || 0)}</p>
              <p className="text-sm text-gray-300">Liabilities + Equity: {formatCurrency(balanceSheet?.totals?.liabilitiesAndEquity || 0)}</p>
              <p className="text-sm text-gray-300">Difference: {formatCurrency(balanceSheet?.totals?.difference || 0)}</p>
              <p className="mt-3 text-xs text-gray-400">Use the report tabs for master details, vouchers, invoices, payments, and cash or bank entries with search, filters, sorting, pagination, and CSV export.</p>
            </div>
            <ReportDataTable
              title="Recent Journal Entries"
              data={coreJournals}
              itemLabel="journals"
              searchPlaceholder="Search journals by number, type, description, or reference"
              exportFileName={`accounting-journals-${startDate}-${endDate}.csv`}
              filters={[
                { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'POSTED' },
                { key: 'type', label: 'Type', getValue: (row: any) => String(row.referenceType || '').toUpperCase() || 'MANUAL' },
              ]}
              columns={[
                { key: 'entryNumber', header: 'Entry No', accessor: 'entryNumber' },
                { key: 'entryDate', header: 'Date', render: (row: any) => formatShortDate(row.entryDate), exportValue: (row: any) => String(row.entryDate || '').slice(0, 10), sortValue: (row: any) => row.entryDate },
                { key: 'referenceType', header: 'Type', render: (row: any) => String(row.referenceType || '-').toUpperCase(), exportValue: (row: any) => String(row.referenceType || '').toUpperCase() },
                { key: 'description', header: 'Description', accessor: 'description' },
                { key: 'totalDebit', header: 'Amount', render: (row: any) => formatCurrency(row.totalDebit || 0), exportValue: (row: any) => Number(row.totalDebit || 0), sortValue: (row: any) => Number(row.totalDebit || 0), align: 'right' },
                { key: 'statusValue', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              ]}
            />
          </div>
        </div>
      );
    }

    if (reportsTab === 'vendors') {
      return (
        <ReportDataTable
          title="Vendor Master Report"
          data={vendors}
          itemLabel="vendors"
          searchPlaceholder="Search vendors by name, contact, phone, email, or address"
          exportFileName={`vendors-report-${endDate}.csv`}
          filters={[
            {
              key: 'balance',
              label: 'Balance',
              getValue: (row: any) => Number(row.balance || 0) > 0 ? 'With Balance' : 'Settled',
            },
          ]}
          columns={[
            { key: 'name', header: 'Vendor', accessor: 'name' },
            { key: 'contact', header: 'Contact', render: (row: any) => row.contact || '-', exportValue: (row: any) => row.contact || '' },
            { key: 'phone', header: 'Phone', render: (row: any) => row.phone || '-', exportValue: (row: any) => row.phone || '' },
            { key: 'email', header: 'Email', render: (row: any) => row.email || '-', exportValue: (row: any) => row.email || '' },
            { key: 'address', header: 'Address', render: (row: any) => row.address || '-', exportValue: (row: any) => row.address || '' },
            { key: 'totalPayable', header: 'Total Payable', render: (row: any) => formatCurrency(row.totalPayable || 0), exportValue: (row: any) => Number(row.totalPayable || 0), sortValue: (row: any) => Number(row.totalPayable || 0), align: 'right' },
            { key: 'paid', header: 'Paid', render: (row: any) => formatCurrency(row.paid || 0), exportValue: (row: any) => Number(row.paid || 0), sortValue: (row: any) => Number(row.paid || 0), align: 'right' },
            { key: 'balanceValue', header: 'Balance', render: (row: any) => formatCurrency(row.balance || 0), exportValue: (row: any) => Number(row.balance || 0), sortValue: (row: any) => Number(row.balance || 0), align: 'right' },
          ]}
        />
      );
    }

    if (reportsTab === 'assets') {
      return (
        <ReportDataTable
          title="Fixed Asset Report"
          data={fixedAssets}
          itemLabel="assets"
          searchPlaceholder="Search assets by name or description"
          exportFileName={`fixed-assets-${endDate}.csv`}
          columns={[
            { key: 'assetName', header: 'Asset', accessor: 'assetName' },
            { key: 'description', header: 'Description', render: (row: any) => row.description || '-', exportValue: (row: any) => row.description || '' },
            { key: 'purchaseDate', header: 'Purchase Date', render: (row: any) => formatShortDate(row.purchaseDate), exportValue: (row: any) => String(row.purchaseDate || '').slice(0, 10), sortValue: (row: any) => row.purchaseDate },
            { key: 'cost', header: 'Cost', render: (row: any) => formatCurrency(row.cost || 0), exportValue: (row: any) => Number(row.cost || 0), sortValue: (row: any) => Number(row.cost || 0), align: 'right' },
            { key: 'lifeYears', header: 'Life Years', render: (row: any) => Number(row.lifeYears || 0), exportValue: (row: any) => Number(row.lifeYears || 0), sortValue: (row: any) => Number(row.lifeYears || 0), align: 'right' },
            { key: 'depreciation', header: 'Depreciation Posted', render: (row: any) => formatCurrency(row.totalDepreciationPosted || 0), exportValue: (row: any) => Number(row.totalDepreciationPosted || 0), sortValue: (row: any) => Number(row.totalDepreciationPosted || 0), align: 'right' },
          ]}
        />
      );
    }

    if (reportsTab === 'periods') {
      return (
        <ReportDataTable
          title={`Financial Period Report (${periodYear})`}
          data={periods}
          itemLabel="periods"
          searchPlaceholder="Search periods by month, year, or period key"
          exportFileName={`financial-periods-${periodYear}.csv`}
          filters={[
            { key: 'lock', label: 'Lock Status', getValue: (row: any) => row.isLocked ? 'Locked' : 'Open' },
          ]}
          columns={[
            { key: 'periodKey', header: 'Period', accessor: 'periodKey' },
            { key: 'month', header: 'Month', render: (row: any) => `${String(row.month).padStart(2, '0')}-${row.year}`, exportValue: (row: any) => `${String(row.month).padStart(2, '0')}-${row.year}`, sortValue: (row: any) => Number(`${row.year}${String(row.month).padStart(2, '0')}`) },
            { key: 'status', header: 'Status', render: (row: any) => row.isLocked ? 'Locked' : 'Open', exportValue: (row: any) => row.isLocked ? 'Locked' : 'Open' },
            { key: 'updatedAt', header: 'Updated', render: (row: any) => formatShortDate(row.updatedAt), exportValue: (row: any) => String(row.updatedAt || '').slice(0, 10), sortValue: (row: any) => row.updatedAt },
          ]}
        />
      );
    }

    if (reportsTab === 'invoices') {
      return (
        <ReportDataTable
          title="Invoice Report"
          data={coreInvoices}
          itemLabel="invoices"
          searchPlaceholder="Search invoices by number, customer, description, or type"
          exportFileName={`invoices-report-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'POSTED' },
            { key: 'type', label: 'Type', getValue: (row: any) => String(row.referenceType || '').toUpperCase() || 'MANUAL' },
          ]}
          columns={[
            { key: 'invoiceNumber', header: 'Invoice No', accessor: 'invoiceNumber' },
            { key: 'invoiceDate', header: 'Date', render: (row: any) => formatShortDate(row.invoiceDate), exportValue: (row: any) => String(row.invoiceDate || '').slice(0, 10), sortValue: (row: any) => row.invoiceDate },
            { key: 'customerName', header: 'Customer', accessor: 'customerName' },
            { key: 'referenceType', header: 'Type', render: (row: any) => String(row.referenceType || '-').toUpperCase(), exportValue: (row: any) => String(row.referenceType || '').toUpperCase() },
            { key: 'description', header: 'Description', render: (row: any) => row.description || '-', exportValue: (row: any) => row.description || '' },
            { key: 'totalAmount', header: 'Total', render: (row: any) => formatCurrency(row.totalAmount || 0), exportValue: (row: any) => Number(row.totalAmount || 0), sortValue: (row: any) => Number(row.totalAmount || 0), align: 'right' },
            { key: 'paidAmount', header: 'Paid', render: (row: any) => formatCurrency(row.paidAmount || 0), exportValue: (row: any) => Number(row.paidAmount || 0), sortValue: (row: any) => Number(row.paidAmount || 0), align: 'right' },
            { key: 'balanceAmount', header: 'Balance', render: (row: any) => formatCurrency(row.balanceAmount || 0), exportValue: (row: any) => Number(row.balanceAmount || 0), sortValue: (row: any) => Number(row.balanceAmount || 0), align: 'right' },
            { key: 'statusValue', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
          ]}
        />
      );
    }

    if (reportsTab === 'payments') {
      return (
        <ReportDataTable
          title="Payment Report"
          data={corePayments}
          itemLabel="payments"
          searchPlaceholder="Search payments by number, customer, mode, or description"
          exportFileName={`payments-report-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'mode', label: 'Mode', getValue: (row: any) => String(row.mode || '').toUpperCase() || 'CASH' },
            { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'POSTED' },
          ]}
          columns={[
            { key: 'paymentNumber', header: 'Payment No', accessor: 'paymentNumber' },
            { key: 'paymentDate', header: 'Date', render: (row: any) => formatShortDate(row.paymentDate), exportValue: (row: any) => String(row.paymentDate || '').slice(0, 10), sortValue: (row: any) => row.paymentDate },
            { key: 'customerName', header: 'Customer', render: (row: any) => row.customerName || '-', exportValue: (row: any) => row.customerName || '' },
            { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
            { key: 'modeValue', header: 'Mode', render: (row: any) => String(row.mode || '-').toUpperCase(), exportValue: (row: any) => String(row.mode || '').toUpperCase() },
            { key: 'statusValue', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
            { key: 'description', header: 'Description', render: (row: any) => row.description || '-', exportValue: (row: any) => row.description || '' },
          ]}
        />
      );
    }

    if (reportsTab === 'vouchers') {
      return (
        <ReportDataTable
          title="Voucher Report"
          data={voucherRows}
          itemLabel="vouchers"
          searchPlaceholder="Search vouchers by number, type, counterparty, reference, or notes"
          exportFileName={`vouchers-report-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'type', label: 'Type', getValue: (row: any) => String(row.voucherType || '').toUpperCase() || 'UNKNOWN' },
            { key: 'mode', label: 'Mode', getValue: (row: any) => String(row.paymentMode || '').toUpperCase() || 'N/A' },
          ]}
          columns={[
            { key: 'voucherNumber', header: 'Voucher No', accessor: 'voucherNumber' },
            { key: 'voucherType', header: 'Type', render: (row: any) => String(row.voucherType || '-').toUpperCase(), exportValue: (row: any) => String(row.voucherType || '').toUpperCase() },
            { key: 'voucherDate', header: 'Date', render: (row: any) => formatShortDate(row.voucherDate), exportValue: (row: any) => String(row.voucherDate || '').slice(0, 10), sortValue: (row: any) => row.voucherDate },
            { key: 'counterpartyName', header: 'Counterparty', render: (row: any) => row.counterpartyName || '-', exportValue: (row: any) => row.counterpartyName || '' },
            { key: 'referenceNo', header: 'Reference', render: (row: any) => row.referenceNo || '-', exportValue: (row: any) => row.referenceNo || '' },
            { key: 'paymentMode', header: 'Mode', render: (row: any) => String(row.paymentMode || '-').toUpperCase(), exportValue: (row: any) => String(row.paymentMode || '').toUpperCase() },
            { key: 'totalAmount', header: 'Amount', render: (row: any) => formatCurrency(row.totalAmount || 0), exportValue: (row: any) => Number(row.totalAmount || 0), sortValue: (row: any) => Number(row.totalAmount || 0), align: 'right' },
            { key: 'notes', header: 'Notes', render: (row: any) => row.notes || '-', exportValue: (row: any) => row.notes || '' },
          ]}
        />
      );
    }

    if (reportsTab === 'salary') {
      return (
        <ReportDataTable
          title="Salary Report"
          data={salaryList}
          itemLabel="salary rows"
          searchPlaceholder="Search salary by employee, month, payment method, or notes"
          exportFileName={`salary-report-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'method', label: 'Payment Method', getValue: (row: any) => String(row.paymentMethod || '').toUpperCase() || 'BANK' },
            { key: 'payslip', label: 'Payslip', getValue: (row: any) => row.payslipSentAt ? 'Sent' : 'Pending' },
          ]}
          columns={[
            { key: 'employeeName', header: 'Employee', accessor: 'employeeName' },
            { key: 'designation', header: 'Designation', render: (row: any) => row.designation || '-', exportValue: (row: any) => row.designation || '' },
            { key: 'month', header: 'Month', accessor: 'month' },
            { key: 'payDate', header: 'Pay Date', render: (row: any) => formatShortDate(row.payDate), exportValue: (row: any) => String(row.payDate || '').slice(0, 10), sortValue: (row: any) => row.payDate },
            { key: 'baseAmount', header: 'Base', render: (row: any) => formatCurrency(Number(row.baseAmount ?? row.amount ?? 0)), exportValue: (row: any) => Number(row.baseAmount ?? row.amount ?? 0), sortValue: (row: any) => Number(row.baseAmount ?? row.amount ?? 0), align: 'right' },
            { key: 'bonusAmount', header: 'Bonus', render: (row: any) => formatCurrency(Number(row.bonusAmount || 0)), exportValue: (row: any) => Number(row.bonusAmount || 0), sortValue: (row: any) => Number(row.bonusAmount || 0), align: 'right' },
            { key: 'amount', header: 'Total', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
            { key: 'paymentMethod', header: 'Method', render: (row: any) => String(row.paymentMethod || '-').toUpperCase(), exportValue: (row: any) => String(row.paymentMethod || '').toUpperCase() },
            { key: 'payslipSentAt', header: 'Payslip', render: (row: any) => row.payslipSentAt ? 'Sent' : 'Pending', exportValue: (row: any) => row.payslipSentAt ? 'Sent' : 'Pending' },
          ]}
        />
      );
    }

    if (reportsTab === 'contracts') {
      return (
        <ReportDataTable
          title="Contract Payment Report"
          data={contractList}
          itemLabel="contracts"
          searchPlaceholder="Search contracts by contractor, title, status, method, or notes"
          exportFileName={`contracts-report-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'PAID' },
            { key: 'method', label: 'Method', getValue: (row: any) => String(row.paymentMethod || '').toUpperCase() || 'BANK' },
          ]}
          columns={[
            { key: 'contractorName', header: 'Contractor', accessor: 'contractorName' },
            { key: 'contractTitle', header: 'Title', accessor: 'contractTitle' },
            { key: 'paymentDate', header: 'Date', render: (row: any) => formatShortDate(row.paymentDate), exportValue: (row: any) => String(row.paymentDate || '').slice(0, 10), sortValue: (row: any) => row.paymentDate },
            { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
            { key: 'statusValue', header: 'Status', render: (row: any) => String(row.status || '-').toUpperCase(), exportValue: (row: any) => String(row.status || '').toUpperCase() },
            { key: 'paymentMethod', header: 'Method', render: (row: any) => String(row.paymentMethod || '-').toUpperCase(), exportValue: (row: any) => String(row.paymentMethod || '').toUpperCase() },
            { key: 'notes', header: 'Notes', render: (row: any) => row.notes || '-', exportValue: (row: any) => row.notes || '' },
          ]}
        />
      );
    }

    if (reportsTab === 'daybook') {
      return (
        <ReportDataTable
          title="Day Book Report"
          data={daybookRows}
          itemLabel="entries"
          searchPlaceholder="Search day-book entries by category, narration, reference, or method"
          exportFileName={`daybook-report-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'entryType', label: 'Entry Type', getValue: (row: any) => String(row.entryType || '').toUpperCase() || 'EXPENSE' },
            { key: 'paymentMethod', label: 'Payment Method', getValue: (row: any) => String(row.paymentMethod || '').toUpperCase() || 'CASH' },
          ]}
          columns={[
            { key: 'entryDate', header: 'Date', render: (row: any) => formatShortDate(row.entryDate), exportValue: (row: any) => String(row.entryDate || '').slice(0, 10), sortValue: (row: any) => row.entryDate },
            { key: 'entryType', header: 'Type', render: (row: any) => String(row.entryType || '-').toUpperCase(), exportValue: (row: any) => String(row.entryType || '').toUpperCase() },
            { key: 'category', header: 'Category', accessor: 'category' },
            { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
            { key: 'paymentMethod', header: 'Method', render: (row: any) => String(row.paymentMethod || '-').toUpperCase(), exportValue: (row: any) => String(row.paymentMethod || '').toUpperCase() },
            { key: 'referenceNo', header: 'Reference', render: (row: any) => row.referenceNo || '-', exportValue: (row: any) => row.referenceNo || '' },
            { key: 'narration', header: 'Narration', render: (row: any) => row.narration || '-', exportValue: (row: any) => row.narration || '' },
          ]}
        />
      );
    }

    if (reportsTab === 'cash_entries' || reportsTab === 'bank_entries') {
      const reportRows = reportsTab === 'cash_entries' ? cashEntries : bankEntries;
      const reportTitle = reportsTab === 'cash_entries' ? 'Cash Book Entry Report' : 'Bank Book Entry Report';
      const reportFile = reportsTab === 'cash_entries' ? 'cash-book' : 'bank-book';
      return (
        <ReportDataTable
          title={reportTitle}
          data={reportRows}
          itemLabel={reportsTab === 'cash_entries' ? 'cash entries' : 'bank entries'}
          searchPlaceholder={`Search ${reportsTab === 'cash_entries' ? 'cash' : 'bank'} entries by source, narration, reference, or method`}
          exportFileName={`${reportFile}-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'source', label: 'Source', getValue: (row: any) => String(row.source || '').toUpperCase() || 'UNKNOWN' },
            { key: 'flow', label: 'Flow', getValue: (row: any) => String(row.type || '').toUpperCase() || 'INFLOW' },
          ]}
          columns={[
            { key: 'time', header: 'Date', render: (row: any) => formatShortDate(row.time), exportValue: (row: any) => String(row.time || '').slice(0, 10), sortValue: (row: any) => row.time },
            { key: 'sourceValue', header: 'Source', render: (row: any) => String(row.source || '-').toUpperCase(), exportValue: (row: any) => String(row.source || '').toUpperCase() },
            { key: 'type', header: 'Flow', render: (row: any) => String(row.type || '-').toUpperCase(), exportValue: (row: any) => String(row.type || '').toUpperCase() },
            { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
            { key: 'narration', header: 'Narration', accessor: 'narration' },
            { key: 'reference', header: 'Reference', accessor: 'reference' },
            { key: 'paymentMethod', header: 'Method', render: (row: any) => String(row.paymentMethod || '-').toUpperCase(), exportValue: (row: any) => String(row.paymentMethod || '').toUpperCase() },
          ]}
        />
      );
    }

    if (reportsTab === 'trial_balance') {
      return (
        <ReportDataTable
          title="Trial Balance Report"
          data={trialBalanceRows}
          itemLabel="trial balance rows"
          searchPlaceholder="Search trial balance by account code, name, or type"
          exportFileName={`trial-balance-${startDate}-${endDate}.csv`}
          filters={[
            { key: 'accountType', label: 'Account Type', getValue: (row: any) => String(row.accountType || '').toUpperCase() || 'UNKNOWN' },
          ]}
          columns={[
            { key: 'accountCode', header: 'Code', accessor: 'accountCode' },
            { key: 'accountName', header: 'Account', accessor: 'accountName' },
            { key: 'accountType', header: 'Type', render: (row: any) => String(row.accountType || '-').toUpperCase(), exportValue: (row: any) => String(row.accountType || '').toUpperCase() },
            { key: 'openingBalance', header: 'Opening', render: (row: any) => formatCurrency(row.openingBalance || 0), exportValue: (row: any) => Number(row.openingBalance || 0), sortValue: (row: any) => Number(row.openingBalance || 0), align: 'right' },
            { key: 'debit', header: 'Debit', render: (row: any) => formatCurrency(row.debit || 0), exportValue: (row: any) => Number(row.debit || 0), sortValue: (row: any) => Number(row.debit || 0), align: 'right' },
            { key: 'credit', header: 'Credit', render: (row: any) => formatCurrency(row.credit || 0), exportValue: (row: any) => Number(row.credit || 0), sortValue: (row: any) => Number(row.credit || 0), align: 'right' },
            { key: 'closingBalance', header: 'Closing', render: (row: any) => formatCurrency(row.closingBalance || 0), exportValue: (row: any) => Number(row.closingBalance || 0), sortValue: (row: any) => Number(row.closingBalance || 0), align: 'right' },
            { key: 'debitBalance', header: 'Dr Balance', render: (row: any) => formatCurrency(row.debitBalance || 0), exportValue: (row: any) => Number(row.debitBalance || 0), sortValue: (row: any) => Number(row.debitBalance || 0), align: 'right' },
            { key: 'creditBalance', header: 'Cr Balance', render: (row: any) => formatCurrency(row.creditBalance || 0), exportValue: (row: any) => Number(row.creditBalance || 0), sortValue: (row: any) => Number(row.creditBalance || 0), align: 'right' },
          ]}
        />
      );
    }

    return null;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Accounting Console</h1>
        <div className="flex items-center gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className={buttonClass} onClick={handleRefreshCurrentTab} disabled={loading}>
            <RefreshIcon />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <aside className="rounded-xl border border-white/10 bg-white/5 p-3 lg:sticky lg:top-20 lg:h-fit">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Menu Navigation</p>
          <CardTabs
            frame={false}
            ariaLabel="Accounting menu navigation"
            items={tabs}
            activeKey={activeTab}
            onChange={setActiveTab}
            listClassName="grid grid-cols-2 gap-2 border-b-0 px-0 pt-0 sm:grid-cols-3 lg:grid-cols-1"
          />
        </aside>

        <div className="min-w-0 space-y-5">
          {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
          {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">Today Revenue</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 3V7M16 3V7M3 10H21M10 14H14M10 17H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{formatCurrency(dashboardSummary?.todayRevenue || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">Monthly Revenue</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-200">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 20H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M7 16V10M12 16V6M17 16V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M5 8L10 5L14 8L19 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-white">{formatCurrency(dashboardSummary?.monthlyRevenue || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">Expenses</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/15 text-red-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="7" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M16 13H21V15H16C14.9 15 14 14.1 14 13C14 11.9 14.9 11 16 11H21V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M8 11L6 13L8 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-red-300">{formatCurrency(dashboardSummary?.expenses || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">Profit</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 20H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M6 15L11 10L14.5 13.5L20 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16 8H20V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-sky-300">{formatCurrency(dashboardSummary?.profit || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">GST Payable</p>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M9 8H15M9 12H15M9 16H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M16 15.5L18.5 18L21 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-amber-300">{formatCurrency(dashboardSummary?.gstPayable || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="mb-2 text-white font-semibold">Recent Invoices</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Invoice</th><th className="px-2 py-1 text-left">Customer</th><th className="px-2 py-1 text-left">Total</th><th className="px-2 py-1 text-left">Status</th></tr></thead>
                <tbody>
                  {coreInvoices.slice(0, 8).map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.invoiceNumber}</td>
                      <td className="px-2 py-1">{row.customerName}</td>
                      <td className="px-2 py-1">{formatCurrency(row.totalAmount || 0)}</td>
                      <td className="px-2 py-1 uppercase text-gray-300">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="mb-2 text-white font-semibold">Recent Payments</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Payment</th><th className="px-2 py-1 text-left">Customer</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Mode</th></tr></thead>
                <tbody>
                  {corePayments.slice(0, 8).map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.paymentNumber}</td>
                      <td className="px-2 py-1">{row.customerName || '-'}</td>
                      <td className="px-2 py-1">{formatCurrency(row.amount || 0)}</td>
                      <td className="px-2 py-1 uppercase text-gray-300">{row.mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="mb-2 text-white font-semibold">Recent Journals</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Entry</th><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Status</th></tr></thead>
                <tbody>
                  {coreJournals.slice(0, 8).map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.entryNumber}</td>
                      <td className="px-2 py-1 uppercase text-gray-300">{row.referenceType}</td>
                      <td className="px-2 py-1">{formatCurrency(row.totalDebit || 0)}</td>
                      <td className="px-2 py-1 uppercase text-gray-300">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Invoice section tabs"
            items={invoiceTabs}
            activeKey={invoicesTab}
            onChange={setInvoicesTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {invoicesTab === 'invoice_entry' && (
            <form onSubmit={submitInvoice} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h2 className="text-lg font-semibold text-white">Create Accounting Invoice</h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} type="date" value={invoiceForm.invoiceDate} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, invoiceDate: e.target.value }))} />
                <input className={inputClass} placeholder="Customer / Party Name" required value={invoiceForm.customerName} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, customerName: e.target.value }))} />
              </div>
              <input className={inputClass} placeholder="Description" value={invoiceForm.description} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, description: e.target.value }))} />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Base Amount" required value={invoiceForm.baseAmount} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, baseAmount: e.target.value }))} />
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="GST Amount" value={invoiceForm.gstAmount} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, gstAmount: e.target.value }))} />
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Initial Payment" value={invoiceForm.paymentAmount} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, paymentAmount: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <select className={inputClass} value={invoiceForm.gstTreatment} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, gstTreatment: e.target.value }))}>
                  <option value="none">No GST</option>
                  <option value="intrastate">CGST + SGST</option>
                  <option value="interstate">IGST</option>
                </select>
                <select className={inputClass} value={invoiceForm.paymentMode} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, paymentMode: e.target.value }))}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
                <select className={inputClass} value={invoiceForm.revenueAccountKey} onChange={(e) => setInvoiceForm((prev) => ({ ...prev, revenueAccountKey: e.target.value }))}>
                  <option value="booking_revenue">Booking Revenue</option>
                  <option value="event_revenue">Event Revenue</option>
                  <option value="sales_revenue">Sales Revenue</option>
                  <option value="other_income">Other Income</option>
                </select>
              </div>
              <button className={buttonClass}>
                <InvoiceIcon />
                Create Invoice
              </button>
            </form>
          )}

          {invoicesTab === 'expense_entry' && (
            <form onSubmit={submitCoreExpense} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h2 className="text-lg font-semibold text-white">Record Expense / Vendor Bill</h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} type="date" value={expenseCoreForm.expenseDate} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, expenseDate: e.target.value }))} />
                <input className={inputClass} placeholder="Description" required value={expenseCoreForm.description} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" required value={expenseCoreForm.amount} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, amount: e.target.value }))} />
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Paid Amount" value={expenseCoreForm.paidAmount} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, paidAmount: e.target.value }))} />
                <select className={inputClass} value={expenseCoreForm.paymentMode} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, paymentMode: e.target.value }))}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} placeholder="Expense Account Name" value={expenseCoreForm.expenseAccountName} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, expenseAccountName: e.target.value }))} />
                <select className={inputClass} value={expenseCoreForm.vendorId} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, vendorId: e.target.value }))}>
                  <option value="">Select vendor (optional)</option>
                  {vendors.map((row) => <option key={row._id} value={row._id}>{row.name}</option>)}
                </select>
              </div>
              {!expenseCoreForm.vendorId && (
                <input className={inputClass} placeholder="New Vendor Name (optional)" value={expenseCoreForm.vendorName} onChange={(e) => setExpenseCoreForm((prev) => ({ ...prev, vendorName: e.target.value }))} />
              )}
              <button className={buttonClass}>
                <ExpenseIcon />
                Record Expense
              </button>
            </form>
          )}

          {invoicesTab === 'invoice_list' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="mb-2 text-white font-semibold">Invoices</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Invoice</th><th className="px-2 py-1 text-left">Customer</th><th className="px-2 py-1 text-left">Total</th><th className="px-2 py-1 text-left">Paid</th><th className="px-2 py-1 text-left">Balance</th><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
                <tbody>
                  {coreInvoices.map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.invoiceNumber}</td>
                      <td className="px-2 py-1">{row.customerName}</td>
                      <td className="px-2 py-1">{formatCurrency(row.totalAmount || 0)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.paidAmount || 0)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.balanceAmount || 0)}</td>
                      <td className="px-2 py-1 uppercase text-gray-300">{row.status}</td>
                      <td className="px-2 py-1 space-x-2">
                        {row.status !== 'cancelled' && Number(row.balanceAmount || 0) > 0 && (
                          <button className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200" onClick={() => addInvoicePayment(row._id)}>
                            <PaymentIcon />
                            Add Payment
                          </button>
                        )}
                        {row.status !== 'cancelled' && (
                          <button className="inline-flex items-center gap-1 text-red-300 hover:text-red-200" onClick={() => cancelCoreInvoice(row._id)}>
                            <CancelIcon />
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!coreInvoices.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-400">No accounting invoices in this date range.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'masters' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Masters section tabs"
            items={masterTabs}
            activeKey={mastersTab}
            onChange={setMastersTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {mastersTab === 'vendors' && (
            <div className="grid items-start grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <form onSubmit={submitVendor} className="self-start rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="text-lg font-semibold text-white">{editingVendorId ? 'Edit Vendor Master' : 'Vendor Master'}</h2>
                {editingVendorId && <p className="text-xs text-cyan-300">Edit mode is active. Update the vendor and save changes with confirmation.</p>}
                <input className={inputClass} placeholder="Vendor Name" required value={vendorForm.name} onChange={(e) => setVendorForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className={inputClass} placeholder="Contact Person" value={vendorForm.contact} onChange={(e) => setVendorForm((prev) => ({ ...prev, contact: e.target.value }))} />
                <input className={inputClass} placeholder="Phone" value={vendorForm.phone} onChange={(e) => setVendorForm((prev) => ({ ...prev, phone: e.target.value }))} />
                <input className={inputClass} placeholder="Email" value={vendorForm.email} onChange={(e) => setVendorForm((prev) => ({ ...prev, email: e.target.value }))} />
                <textarea className={inputClass} rows={3} placeholder="Address" value={vendorForm.address} onChange={(e) => setVendorForm((prev) => ({ ...prev, address: e.target.value }))} />
                <div className="flex flex-wrap items-center gap-2">
                  <button className={buttonClass}>
                    <VendorIcon />
                    {editingVendorId ? 'Save Vendor Changes' : 'Create Vendor'}
                  </button>
                  {editingVendorId && (
                    <button type="button" className={secondaryButtonClass} onClick={cancelVendorEdit}>
                      <CancelIcon />
                      Cancel Edit
                    </button>
                  )}
                </div>
              </form>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
                <h3 className="mb-2 text-white font-semibold">Vendor Balances</h3>
                <table className="min-w-full text-sm">
                  <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Vendor</th><th className="px-2 py-1 text-left">Contact</th><th className="px-2 py-1 text-left">Email</th><th className="px-2 py-1 text-left">Total Payable</th><th className="px-2 py-1 text-left">Paid</th><th className="px-2 py-1 text-left">Balance</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
                  <tbody>
                    {vendors.map((row) => (
                      <tr key={row._id} className="border-t border-white/10">
                        <td className="px-2 py-1">{row.name}</td>
                        <td className="px-2 py-1">{row.contact || row.phone || '-'}</td>
                        <td className="px-2 py-1">{row.email || '-'}</td>
                        <td className="px-2 py-1">{formatCurrency(row.totalPayable || 0)}</td>
                        <td className="px-2 py-1">{formatCurrency(row.paid || 0)}</td>
                        <td className="px-2 py-1">{formatCurrency(row.balance || 0)}</td>
                        <td className="px-2 py-1">
                          <button type="button" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200" onClick={() => editVendor(row)}>
                            <EditIcon />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!vendors.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-400">No vendors available yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mastersTab === 'assets' && (
            <div className="grid items-start grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <form onSubmit={submitAsset} className="self-start rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="text-lg font-semibold text-white">Fixed Asset</h2>
                <input className={inputClass} placeholder="Asset Name" required value={assetForm.assetName} onChange={(e) => setAssetForm((prev) => ({ ...prev, assetName: e.target.value }))} />
                <input className={inputClass} placeholder="Description" value={assetForm.description} onChange={(e) => setAssetForm((prev) => ({ ...prev, description: e.target.value }))} />
                <div className="grid grid-cols-3 gap-2">
                  <input className={inputClass} type="number" min="0" step="0.01" placeholder="Cost" required value={assetForm.cost} onChange={(e) => setAssetForm((prev) => ({ ...prev, cost: e.target.value }))} />
                  <input className={inputClass} type="number" min="1" placeholder="Life Years" required value={assetForm.lifeYears} onChange={(e) => setAssetForm((prev) => ({ ...prev, lifeYears: e.target.value }))} />
                  <input className={inputClass} type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm((prev) => ({ ...prev, purchaseDate: e.target.value }))} />
                </div>
                <button className={buttonClass}>
                  <AssetIcon />
                  Create Asset
                </button>
              </form>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
                <h3 className="mb-2 text-white font-semibold">Fixed Assets</h3>
                <table className="min-w-full text-sm">
                  <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Asset</th><th className="px-2 py-1 text-left">Cost</th><th className="px-2 py-1 text-left">Life</th><th className="px-2 py-1 text-left">Depreciation Posted</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
                  <tbody>
                    {fixedAssets.map((row) => (
                      <tr key={row._id} className="border-t border-white/10">
                        <td className="px-2 py-1">{row.assetName}</td>
                        <td className="px-2 py-1">{formatCurrency(row.cost || 0)}</td>
                        <td className="px-2 py-1">{row.lifeYears} years</td>
                        <td className="px-2 py-1">{formatCurrency(row.totalDepreciationPosted || 0)}</td>
                        <td className="px-2 py-1">
                          <button className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200" onClick={() => postDepreciation(row._id)}>
                            <DepreciationIcon />
                            Post Monthly Depreciation
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!fixedAssets.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-400">No fixed assets configured.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {mastersTab === 'periods' && (
            <div className="grid items-start grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="self-start rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="text-lg font-semibold text-white">Financial Periods</h2>
                <input className={inputClass} type="number" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value || new Date().getFullYear()))} />
                <div className="space-y-2">
                  {periods.map((row) => (
                    <div key={row._id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm">
                      <span className="text-gray-200">{row.periodKey}</span>
                      <button className={buttonClass} type="button" onClick={() => togglePeriodLock(row.month, row.year, !row.isLocked)}>
                        {row.isLocked ? <UnlockIcon /> : <LockIcon />}
                        {row.isLocked ? 'Unlock' : 'Lock'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
                <h3 className="mb-2 text-white font-semibold">Period Status</h3>
                <table className="min-w-full text-sm">
                  <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Period</th><th className="px-2 py-1 text-left">Year</th><th className="px-2 py-1 text-left">Month</th><th className="px-2 py-1 text-left">Status</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
                  <tbody>
                    {periods.map((row) => (
                      <tr key={row._id} className="border-t border-white/10">
                        <td className="px-2 py-1">{row.periodKey}</td>
                        <td className="px-2 py-1">{row.year}</td>
                        <td className="px-2 py-1">{row.month}</td>
                        <td className="px-2 py-1">{row.isLocked ? 'Locked' : 'Open'}</td>
                        <td className="px-2 py-1">
                          <button className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200" type="button" onClick={() => togglePeriodLock(row.month, row.year, !row.isLocked)}>
                            {row.isLocked ? <UnlockIcon /> : <LockIcon />}
                            {row.isLocked ? 'Unlock' : 'Lock'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!periods.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-400">No period records available yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Payments section tabs"
            items={paymentsTabs}
            activeKey={paymentsTab}
            onChange={setPaymentsTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {paymentsTab === 'salary_entry' && (
            <form onSubmit={submitSalary} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h2 className="text-lg font-semibold text-white">{editingSalaryId ? 'Edit Salary Payment' : 'Salary Payment'}</h2>
              {editingSalaryId && <p className="text-xs text-cyan-300">Edit mode is active. Update details and click Save Changes.</p>}
              <select
                className={inputClass}
                required
                value={salaryForm.employeeId}
                disabled={employeeMaster.length === 0 || Boolean(editingSalaryId)}
                onChange={(e) => {
                  const employeeId = e.target.value;
                  const selected = employeeMaster.find((row) => row._id === employeeId);
                  setSalaryForm({
                    ...salaryForm,
                    employeeId,
                    employeeName: selected?.name || '',
                    designation: selected?.designation || '',
                  });
                }}
              >
                <option value="">Select Employee</option>
                {employeeMaster.map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.employeeCode} - {row.name}
                  </option>
                ))}
              </select>
              <input className={inputClass} placeholder="Designation" value={salaryForm.designation} readOnly />
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} type="month" required value={salaryForm.month} onChange={(e) => setSalaryForm({ ...salaryForm, month: e.target.value })} />
                <input className={inputClass} type="date" required value={salaryForm.payDate} onChange={(e) => setSalaryForm({ ...salaryForm, payDate: e.target.value })} />
                <input className={inputClass} type="number" min="0" step="0.01" required placeholder="Amount" value={salaryForm.amount} onChange={(e) => setSalaryForm({ ...salaryForm, amount: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Bonus Amount (optional)" value={salaryForm.bonusAmount} onChange={(e) => setSalaryForm({ ...salaryForm, bonusAmount: e.target.value })} />
                <input className={inputClass} placeholder="Notes (optional)" value={salaryForm.notes} onChange={(e) => setSalaryForm({ ...salaryForm, notes: e.target.value })} />
              </div>
              <select className={inputClass} value={salaryForm.paymentMethod} onChange={(e) => setSalaryForm({ ...salaryForm, paymentMethod: e.target.value })}>
                {salaryPaymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
              </select>
              <p className="text-xs text-gray-400">Duplicate salary for same employee on same date within the month is blocked. Bonus is optional. Payslip is emailed automatically after payment. Use History / Edit to update an existing salary.</p>
              {employeeMaster.length === 0 && (
                <p className="text-xs text-amber-300">No active employees in master. Add employee in Employees menu first.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass} disabled={employeeMaster.length === 0 && !editingSalaryId}>
                  <SaveIcon />
                  {editingSalaryId ? 'Save Changes' : 'Save Salary'}
                </button>
                {!editingSalaryId && (
                  <button type="button" className={buttonClass} onClick={() => setPaymentsTab('history')}>
                    <EditIcon />
                    Open History / Edit
                  </button>
                )}
                {editingSalaryId && (
                  <button type="button" className={buttonClass} onClick={cancelSalaryEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {paymentsTab === 'contract_entry' && (
            <form onSubmit={submitContract} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h2 className="text-lg font-semibold text-white">{editingContractId ? 'Edit Contract Payment' : 'Contract Payment'}</h2>
              {editingContractId && <p className="text-xs text-cyan-300">Edit mode is active. Update the contract payment and save changes with confirmation.</p>}
              <input className={inputClass} placeholder="Contractor Name" required value={contractForm.contractorName} onChange={(e) => setContractForm({ ...contractForm, contractorName: e.target.value })} />
              <input className={inputClass} placeholder="Contract Title" required value={contractForm.contractTitle} onChange={(e) => setContractForm({ ...contractForm, contractTitle: e.target.value })} />
              <div className="grid grid-cols-4 gap-2">
                <input className={inputClass} type="date" required value={contractForm.paymentDate} onChange={(e) => setContractForm({ ...contractForm, paymentDate: e.target.value })} />
                <input className={inputClass} type="number" min="0" step="0.01" required placeholder="Amount" value={contractForm.amount} onChange={(e) => setContractForm({ ...contractForm, amount: e.target.value })} />
                <select className={inputClass} value={contractForm.status} onChange={(e) => setContractForm({ ...contractForm, status: e.target.value })}><option value="paid">PAID</option><option value="partial">PARTIAL</option><option value="pending">PENDING</option></select>
                <select className={inputClass} value={contractForm.paymentMethod} onChange={(e) => setContractForm({ ...contractForm, paymentMethod: e.target.value })}>{salaryPaymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
              </div>
              <textarea className={inputClass} rows={2} placeholder="Notes (optional)" value={contractForm.notes} onChange={(e) => setContractForm({ ...contractForm, notes: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass}>
                  <SaveIcon />
                  {editingContractId ? 'Save Contract Changes' : 'Save Contract'}
                </button>
                {editingContractId && (
                  <button type="button" className={secondaryButtonClass} onClick={cancelContractEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {paymentsTab === 'history' && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
                <h3 className="mb-2 text-white font-semibold">Recent Salary</h3>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-gray-300">
                      <th className="px-2 py-1 text-left">Employee</th>
                      <th className="px-2 py-1 text-left">Month</th>
                      <th className="px-2 py-1 text-left">Base</th>
                      <th className="px-2 py-1 text-left">Bonus</th>
                      <th className="px-2 py-1 text-left">Total</th>
                      <th className="px-2 py-1 text-left">Payslip</th>
                      <th className="px-2 py-1 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryList.slice(0, 12).map((row) => (
                      <tr key={row._id} className="border-t border-white/10">
                        <td className="px-2 py-1">{row.employeeName}</td>
                        <td className="px-2 py-1">{row.month}</td>
                        <td className="px-2 py-1">{formatCurrency(Number(row.baseAmount ?? row.amount ?? 0))}</td>
                        <td className="px-2 py-1">{formatCurrency(Number(row.bonusAmount || 0))}</td>
                        <td className="px-2 py-1">{formatCurrency(row.amount)}</td>
                        <td className="px-2 py-1">
                          {row.payslipSentAt ? (
                            <span className="text-emerald-300">Sent</span>
                          ) : (
                            <span className="text-amber-300">Pending</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <button type="button" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200" onClick={() => editSalary(row)}>
                            <EditIcon />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!salaryList.length && (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-gray-400">
                          No salary payments for selected range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
                <h3 className="mb-2 text-white font-semibold">Recent Contract</h3>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-gray-300">
                      <th className="px-2 py-1 text-left">Contractor</th>
                      <th className="px-2 py-1 text-left">Title</th>
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Amount</th>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contractList.slice(0, 12).map((row) => (
                      <tr key={row._id} className="border-t border-white/10">
                        <td className="px-2 py-1">{row.contractorName}</td>
                        <td className="px-2 py-1">{row.contractTitle}</td>
                        <td className="px-2 py-1">{formatShortDate(row.paymentDate)}</td>
                        <td className="px-2 py-1">{formatCurrency(row.amount)}</td>
                        <td className="px-2 py-1 uppercase text-gray-300">{row.status}</td>
                        <td className="px-2 py-1">
                          <button type="button" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200" onClick={() => editContract(row)}>
                            <EditIcon />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!contractList.length && (
                      <tr>
                        <td colSpan={6} className="px-2 py-3 text-center text-gray-400">
                          No contract payments for selected range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'opening' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Opening balances section tabs"
            items={openingTabs}
            activeKey={openingTab}
            onChange={setOpeningTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          <form onSubmit={saveOpening} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h2 className="text-lg font-semibold text-white">Opening Balances</h2>
            <p className="text-sm text-gray-300">Status: {openingStatus?.isLocked ? 'Locked' : 'Open'}</p>

            {openingTab === 'balances' && (
              <>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <input className={inputClass} type="number" placeholder="Cash Amount" value={openingForm.cashAmount} onChange={(e) => setOpeningForm({ ...openingForm, cashAmount: e.target.value })} />
                  <input className={inputClass} type="number" placeholder="Bank Amount" value={openingForm.bankAmount} onChange={(e) => setOpeningForm({ ...openingForm, bankAmount: e.target.value })} />
                  <input className={inputClass} type="number" placeholder="Opening Stock Value" value={openingForm.openingStockValue} onChange={(e) => setOpeningForm({ ...openingForm, openingStockValue: e.target.value })} />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <select className={inputClass} value={openingForm.cashSide} onChange={(e) => setOpeningForm({ ...openingForm, cashSide: e.target.value })}><option value="debit">Cash Debit</option><option value="credit">Cash Credit</option></select>
                  <select className={inputClass} value={openingForm.bankSide} onChange={(e) => setOpeningForm({ ...openingForm, bankSide: e.target.value })}><option value="debit">Bank Debit</option><option value="credit">Bank Credit</option></select>
                  <select className={inputClass} value={openingForm.openingStockSide} onChange={(e) => setOpeningForm({ ...openingForm, openingStockSide: e.target.value })}><option value="debit">Stock Debit</option><option value="credit">Stock Credit</option></select>
                </div>
              </>
            )}

            {openingTab === 'party_openings' && (
              <>
                <textarea className={inputClass} rows={4} placeholder="Customer accounts: name:amount:side (one per line)" value={openingForm.customerAccountsText} onChange={(e) => setOpeningForm({ ...openingForm, customerAccountsText: e.target.value })} />
                <textarea className={inputClass} rows={4} placeholder="Supplier accounts: name:amount:side (one per line)" value={openingForm.supplierAccountsText} onChange={(e) => setOpeningForm({ ...openingForm, supplierAccountsText: e.target.value })} />
              </>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={openingForm.lockAfterSave} onChange={(e) => setOpeningForm({ ...openingForm, lockAfterSave: e.target.checked })} /> Lock after save</label>
            <div className="flex items-center gap-2">
              <button className={buttonClass} disabled={openingStatus?.isLocked}>
                <SaveIcon />
                Save Opening
              </button>
              <button type="button" className={buttonClass} disabled={openingStatus?.isLocked} onClick={lockOpening}>
                <LockIcon />
                Lock Now
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Expenses section tabs"
            items={expensesTabs}
            activeKey={expensesTab}
            onChange={setExpensesTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {expensesTab === 'entry' && (
            <form onSubmit={submitManual} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h2 className="text-lg font-semibold text-white">{editingDaybookId ? 'Edit Daily Expense/Income Entry' : 'Daily Expense/Income Entry'}</h2>
              {editingDaybookId && <p className="text-xs text-cyan-300">Edit mode is active. Update the entry and save changes with confirmation.</p>}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <select className={inputClass} value={manualForm.entryType} onChange={(e) => setManualForm({ ...manualForm, entryType: e.target.value })}><option value="expense">Expense</option><option value="income">Income</option></select>
                <input className={inputClass} placeholder="Category (rent/electricity/interest/etc)" value={manualForm.category} required onChange={(e) => setManualForm({ ...manualForm, category: e.target.value })} />
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" value={manualForm.amount} required onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <select className={inputClass} value={manualForm.paymentMethod} onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value })}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
                <input className={inputClass} type="date" value={manualForm.entryDate} onChange={(e) => setManualForm({ ...manualForm, entryDate: e.target.value })} />
                <input className={inputClass} placeholder="Reference No" value={manualForm.referenceNo} onChange={(e) => setManualForm({ ...manualForm, referenceNo: e.target.value })} />
              </div>
              <textarea className={inputClass} rows={2} placeholder="Narration" value={manualForm.narration} onChange={(e) => setManualForm({ ...manualForm, narration: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass}>
                  <SaveIcon />
                  {editingDaybookId ? 'Save Entry Changes' : 'Save Entry'}
                </button>
                {editingDaybookId && (
                  <button type="button" className={secondaryButtonClass} onClick={cancelManualEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {expensesTab === 'entries' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="mb-2 text-white font-semibold">Entries (Edit/Cancel with permission)</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Category</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
                <tbody>
                  {daybookPagination.paginatedRows.map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{new Date(row.entryDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1 uppercase">{row.entryType}</td>
                      <td className="px-2 py-1">{row.category}</td>
                      <td className="px-2 py-1">{formatCurrency(row.amount)}</td>
                      <td className="px-2 py-1 space-x-2">
                        <button className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200" onClick={() => editDaybook(row)}>
                          <EditIcon />
                          Edit
                        </button>
                        <button className="inline-flex items-center gap-1 text-red-300 hover:text-red-200" onClick={() => deleteDaybook(row)}>
                          <CancelIcon />
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                  {daybookPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                        No entries found for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(daybookPagination, 'entries')}
            </div>
          )}
        </div>
      )}

      {activeTab === 'vouchers' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Voucher section tabs"
            items={vouchersTabs}
            activeKey={vouchersTab}
            onChange={setVouchersTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {vouchersTab === 'receipt' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveVoucher({
                  voucherType: 'receipt',
                  createPath: '/api/accounting/vouchers/receipt',
                  body: { ...receiptForm, amount: Number(receiptForm.amount || 0) },
                  createSuccess: 'Receipt voucher created',
                });
              }}
              className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
            >
              <h3 className="text-white font-semibold">{editingVoucher?.type === 'receipt' ? 'Edit Receipt Voucher' : 'Receipt Voucher (Income)'}</h3>
              {editingVoucher?.type === 'receipt' && <p className="text-xs text-cyan-300">Edit mode is active. Update the voucher and save changes with confirmation.</p>}
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" required value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} />
                <input className={inputClass} type="date" required value={receiptForm.voucherDate} onChange={(e) => setReceiptForm({ ...receiptForm, voucherDate: e.target.value })} />
              </div>
              <input className={inputClass} placeholder="Category (interest/commission/service)" required value={receiptForm.category} onChange={(e) => setReceiptForm({ ...receiptForm, category: e.target.value })} />
              <select className={inputClass} value={receiptForm.paymentMode} onChange={(e) => setReceiptForm({ ...receiptForm, paymentMode: e.target.value })}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
              <input className={inputClass} placeholder="Counterparty" value={receiptForm.counterpartyName} onChange={(e) => setReceiptForm({ ...receiptForm, counterpartyName: e.target.value })} />
              <input className={inputClass} placeholder="Reference No" value={receiptForm.referenceNo} onChange={(e) => setReceiptForm({ ...receiptForm, referenceNo: e.target.value })} />
              <textarea className={inputClass} rows={2} placeholder="Notes (optional)" value={receiptForm.notes} onChange={(e) => setReceiptForm({ ...receiptForm, notes: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass}>
                  <ReceiptIcon />
                  {editingVoucher?.type === 'receipt' ? 'Save Receipt Voucher' : 'Create Receipt Voucher'}
                </button>
                {editingVoucher?.type === 'receipt' && (
                  <button type="button" className={secondaryButtonClass} onClick={cancelVoucherEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {vouchersTab === 'payment' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveVoucher({
                  voucherType: 'payment',
                  createPath: '/api/accounting/vouchers/payment',
                  body: {
                    amount: Number(paymentForm.amount || 0),
                    voucherDate: paymentForm.voucherDate,
                    paymentMode: paymentForm.paymentMode,
                    category: paymentForm.category,
                    referenceNo: paymentForm.referenceNo,
                    counterpartyName: paymentForm.accountName,
                    notes: paymentForm.beingPaymentOf,
                    documentFields: {
                      accountName: paymentForm.accountName,
                      beingPaymentOf: paymentForm.beingPaymentOf,
                      forPeriod: paymentForm.forPeriod,
                      receivedBy: paymentForm.receivedBy,
                      authorizedBy: paymentForm.authorizedBy,
                      receivedSign: '',
                      authorizedSign: '',
                    },
                  },
                  createSuccess: 'Payment voucher created',
                });
              }}
              className="max-w-5xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
            >
              <h3 className="text-white font-semibold">{editingVoucher?.type === 'payment' ? 'Edit Payment Voucher' : 'Payment Voucher (Reference Layout)'}</h3>
              {editingVoucher?.type === 'payment' && <p className="text-xs text-cyan-300">Edit mode is active. Update the voucher and save changes with confirmation.</p>}
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} placeholder="No. / Reference No" value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} />
                <input className={inputClass} type="date" required value={paymentForm.voucherDate} onChange={(e) => setPaymentForm({ ...paymentForm, voucherDate: e.target.value })} />
              </div>
              <input className={inputClass} placeholder="Name of the account" required value={paymentForm.accountName} onChange={(e) => setPaymentForm({ ...paymentForm, accountName: e.target.value })} />
              <textarea className={inputClass} rows={2} placeholder="Being Payment of" required value={paymentForm.beingPaymentOf} onChange={(e) => setPaymentForm({ ...paymentForm, beingPaymentOf: e.target.value })} />
              <input className={inputClass} placeholder="For the period" value={paymentForm.forPeriod} onChange={(e) => setPaymentForm({ ...paymentForm, forPeriod: e.target.value })} />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                <select className={inputClass} value={paymentForm.paymentMode} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
                <input className={inputClass} placeholder="Expense category / account head" required value={paymentForm.category} onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })} />
              </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input className={inputClass} placeholder="Received by" value={paymentForm.receivedBy} onChange={(e) => setPaymentForm({ ...paymentForm, receivedBy: e.target.value })} />
                  <input className={inputClass} placeholder="Authorized by" value={paymentForm.authorizedBy} onChange={(e) => setPaymentForm({ ...paymentForm, authorizedBy: e.target.value })} />
                </div>
                <p className="text-xs text-gray-400">
                  Signature fields are kept out of the voucher form for physical signing. Printed signature lines can be turned on or off from General Settings &gt; Printing Preferences.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass}>
                  <PaymentIcon />
                  {editingVoucher?.type === 'payment' ? 'Save Payment Voucher' : 'Create Payment Voucher'}
                </button>
                {editingVoucher?.type === 'payment' && (
                  <button type="button" className={secondaryButtonClass} onClick={cancelVoucherEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {vouchersTab === 'journal' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!journalForm.debitAccountId || !journalForm.creditAccountId) {
                  setError('Select both Debit and Credit account before creating a journal voucher.');
                  return;
                }
                if (journalForm.debitAccountId === journalForm.creditAccountId) {
                  setError('Debit and Credit account must be different for journal voucher.');
                  return;
                }
                if (Number(journalForm.amount || 0) <= 0) {
                  setError('Enter a valid journal amount greater than zero.');
                  return;
                }
                void saveVoucher({
                  voucherType: 'journal',
                  createPath: '/api/accounting/vouchers/journal',
                  body: {
                    voucherDate: journalForm.voucherDate,
                    referenceNo: journalForm.referenceNo,
                    notes: journalForm.notes,
                    lines: [
                      { accountId: journalForm.debitAccountId, debit: Number(journalForm.amount || 0), credit: 0 },
                      { accountId: journalForm.creditAccountId, debit: 0, credit: Number(journalForm.amount || 0) },
                    ],
                  },
                  createSuccess: 'Journal voucher created',
                });
              }}
              className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
            >
              <h3 className="text-white font-semibold">{editingVoucher?.type === 'journal' ? 'Edit Journal Voucher' : 'Journal Voucher'}</h3>
              {editingVoucher?.type === 'journal' && <p className="text-xs text-cyan-300">Edit mode is active. Update the journal and save changes with confirmation.</p>}
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} type="date" required value={journalForm.voucherDate} onChange={(e) => setJournalForm({ ...journalForm, voucherDate: e.target.value })} />
                <select className={inputClass} required value={journalForm.debitAccountId} onChange={(e) => setJournalForm({ ...journalForm, debitAccountId: e.target.value })}><option value="">Debit Account</option>{chartAccounts.map((row) => <option key={row._id} value={row._id}>{row.accountCode} - {row.accountName}</option>)}</select>
                <select className={inputClass} required value={journalForm.creditAccountId} onChange={(e) => setJournalForm({ ...journalForm, creditAccountId: e.target.value })}><option value="">Credit Account</option>{chartAccounts.map((row) => <option key={row._id} value={row._id}>{row.accountCode} - {row.accountName}</option>)}</select>
              </div>
              <input className={inputClass} type="number" min="0" step="0.01" required placeholder="Amount" value={journalForm.amount} onChange={(e) => setJournalForm({ ...journalForm, amount: e.target.value })} />
              <input className={inputClass} placeholder="Reference No" value={journalForm.referenceNo} onChange={(e) => setJournalForm({ ...journalForm, referenceNo: e.target.value })} />
              <textarea className={inputClass} rows={2} placeholder="Notes (optional)" value={journalForm.notes} onChange={(e) => setJournalForm({ ...journalForm, notes: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass}>
                  <JournalIcon />
                  {editingVoucher?.type === 'journal' ? 'Save Journal Voucher' : 'Create Journal Voucher'}
                </button>
                {editingVoucher?.type === 'journal' && (
                  <button type="button" className={secondaryButtonClass} onClick={cancelVoucherEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {vouchersTab === 'transfer' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveVoucher({
                  voucherType: 'transfer',
                  createPath: '/api/accounting/transfer',
                  body: { ...transferForm, amount: Number(transferForm.amount || 0) },
                  createSuccess: 'Cash/Bank transfer saved',
                });
              }}
              className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
            >
              <h3 className="text-white font-semibold">{editingVoucher?.type === 'transfer' ? 'Edit Cash-Bank Transfer' : 'Cash-Bank Transfer'}</h3>
              {editingVoucher?.type === 'transfer' && <p className="text-xs text-cyan-300">Edit mode is active. Update the transfer and save changes with confirmation.</p>}
              <div className="grid grid-cols-3 gap-2">
                <input className={inputClass} type="number" min="0" step="0.01" required placeholder="Amount" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} />
                <input className={inputClass} type="date" required value={transferForm.transferDate} onChange={(e) => setTransferForm({ ...transferForm, transferDate: e.target.value })} />
                <select className={inputClass} value={transferForm.direction} onChange={(e) => setTransferForm({ ...transferForm, direction: e.target.value })}><option value="cash_to_bank">Cash to Bank</option><option value="bank_to_cash">Bank to Cash</option></select>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <input className={inputClass} placeholder="Reference No" value={transferForm.referenceNo} onChange={(e) => setTransferForm({ ...transferForm, referenceNo: e.target.value })} />
                <input className={inputClass} placeholder="Notes" value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={buttonClass}>
                  <TransferIcon />
                  {editingVoucher?.type === 'transfer' ? 'Save Transfer Changes' : 'Save Transfer'}
                </button>
                {editingVoucher?.type === 'transfer' && (
                  <button type="button" className={secondaryButtonClass} onClick={cancelVoucherEdit}>
                    <CancelIcon />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          )}

          {vouchersTab === 'list' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="mb-2 text-white font-semibold">Voucher List (Print option enabled)</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">No</th><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
                <tbody>
                  {voucherPagination.paginatedRows.map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.voucherNumber}</td>
                      <td className="px-2 py-1 uppercase">{row.voucherType}</td>
                      <td className="px-2 py-1">{new Date(row.voucherDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-2 py-1 space-x-3">
                        <button className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200" onClick={() => editVoucher(row)}>
                          <EditIcon />
                          Edit
                        </button>
                        <button className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200" onClick={() => printVoucher(row)}>
                          <PrintIcon />
                          Print
                        </button>
                        {isSuperAdmin && (
                          <button className="inline-flex items-center gap-1 text-red-300 hover:text-red-200" onClick={() => deleteVoucher(row)}>
                            <CancelIcon />
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {voucherPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                        No vouchers found for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(voucherPagination, 'vouchers')}
            </div>
          )}
        </div>
      )}

      {activeTab === 'books' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Books section tabs"
            items={booksTabs}
            activeKey={booksTab}
            onChange={setBooksTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {booksTab === 'summary' && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-white font-semibold">Cash Book</h3>
                <p className="text-sm text-gray-300">Opening: {formatCurrency(cashBook?.openingBalance || 0)}</p>
                <p className="text-sm text-emerald-300">Inflow: {formatCurrency(cashBook?.totalInflow || 0)}</p>
                <p className="text-sm text-red-300">Outflow: {formatCurrency(cashBook?.totalOutflow || 0)}</p>
                <p className="text-sm text-white">Closing: {formatCurrency(cashBook?.closingBalance || 0)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h3 className="text-white font-semibold">Bank Book</h3>
                <p className="text-sm text-gray-300">Opening: {formatCurrency(bankBook?.openingBalance || 0)}</p>
                <p className="text-sm text-emerald-300">Inflow: {formatCurrency(bankBook?.totalInflow || 0)}</p>
                <p className="text-sm text-red-300">Outflow: {formatCurrency(bankBook?.totalOutflow || 0)}</p>
                <p className="text-sm text-white">Closing: {formatCurrency(bankBook?.closingBalance || 0)}</p>
              </div>
            </div>
          )}

          {booksTab === 'cash_entries' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">Cash Book Entries</h3>
                  <p className="text-xs text-gray-400">Filtered by the selected date range above.</p>
                </div>
              </div>
              <table className="mt-3 min-w-full text-sm">
                <thead>
                  <tr className="text-gray-300">
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Source</th>
                    <th className="px-2 py-1 text-left">Type</th>
                    <th className="px-2 py-1 text-left">Narration</th>
                    <th className="px-2 py-1 text-left">Reference</th>
                    <th className="px-2 py-1 text-left">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {cashBookPagination.paginatedRows.map((row: any, index: number) => (
                    <tr key={`${row.reference}-${index}`} className="border-t border-white/10">
                      <td className="px-2 py-1">{new Date(row.time).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1 capitalize">{row.source}</td>
                      <td className={`px-2 py-1 font-medium ${row.type === 'inflow' ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {row.type}
                      </td>
                      <td className="px-2 py-1 text-gray-300">{row.narration}</td>
                      <td className="px-2 py-1 text-gray-400">{row.reference || '-'}</td>
                      <td className="px-2 py-1">{formatCurrency(row.amount || 0)}</td>
                    </tr>
                  ))}
                  {cashBookPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-3 text-center text-gray-400">
                        No cash book entries found for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(cashBookPagination, 'cash entries')}
            </div>
          )}

          {booksTab === 'bank_entries' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">Bank Book Entries</h3>
                  <p className="text-xs text-gray-400">Review inflow and outflow before reconciliation.</p>
                </div>
              </div>
              <table className="mt-3 min-w-full text-sm">
                <thead>
                  <tr className="text-gray-300">
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Source</th>
                    <th className="px-2 py-1 text-left">Type</th>
                    <th className="px-2 py-1 text-left">Narration</th>
                    <th className="px-2 py-1 text-left">Reference</th>
                    <th className="px-2 py-1 text-left">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bankBookPagination.paginatedRows.map((row: any, index: number) => (
                    <tr key={`${row.reference}-${index}`} className="border-t border-white/10">
                      <td className="px-2 py-1">{new Date(row.time).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1 capitalize">{row.source}</td>
                      <td className={`px-2 py-1 font-medium ${row.type === 'inflow' ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {row.type}
                      </td>
                      <td className="px-2 py-1 text-gray-300">{row.narration}</td>
                      <td className="px-2 py-1 text-gray-400">{row.reference || '-'}</td>
                      <td className="px-2 py-1">{formatCurrency(row.amount || 0)}</td>
                    </tr>
                  ))}
                  {bankBookPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-3 text-center text-gray-400">
                        No bank book entries found for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(bankBookPagination, 'bank entries')}
            </div>
          )}

          {booksTab === 'reconciliation' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">Bank Reconciliation Pending</h3>
                  <p className="text-xs text-gray-400">Select bank ledger rows to mark them as reconciled.</p>
                </div>
                <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-gray-300">
                  Selected: <span className="font-semibold text-white">{selectedReconcileIds.length}</span>
                </div>
              </div>
              <table className="mt-3 min-w-full text-sm">
                <thead>
                  <tr className="text-gray-300">
                    <th className="px-2 py-1 text-left">Pick</th>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Voucher</th>
                    <th className="px-2 py-1 text-left">Narration</th>
                    <th className="px-2 py-1 text-left">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliationPagination.paginatedRows.map((row: any) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedReconcileIds.includes(row._id)}
                          onChange={(e) => {
                            setSelectedReconcileIds((prev) =>
                              e.target.checked ? [...prev, row._id] : prev.filter((id) => id !== row._id)
                            );
                          }}
                        />
                      </td>
                      <td className="px-2 py-1">{new Date(row.entryDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1">{row.voucherNumber || row.referenceNo || row._id}</td>
                      <td className="px-2 py-1 text-gray-300">{row.narration || row.voucherType || '-'}</td>
                      <td className="px-2 py-1">{formatCurrency(Math.max(Number(row.debit || 0), Number(row.credit || 0)))}</td>
                    </tr>
                  ))}
                  {reconciliationPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                        No bank entries pending reconciliation for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(reconciliationPagination, 'pending rows')}
              <button
                className={`${buttonClass} mt-2`}
                disabled={selectedReconcileIds.length === 0}
                onClick={() =>
                  withLoading(async () => {
                    if (selectedReconcileIds.length === 0) {
                      setMessage('Select at least one bank entry to reconcile.');
                      return;
                    }
                    await apiJson('/api/accounting/books/bank/reconcile', {
                      method: 'POST',
                      body: JSON.stringify({ entryIds: selectedReconcileIds }),
                    });
                    setSelectedReconcileIds([]);
                    setMessage('Reconciliation updated');
                    await refreshBooks();
                  })
                }
              >
                <CheckIcon />
                Reconcile Selected
              </button>
            </div>
          )}

          {booksTab === 'csv_compare' && (
            <div className="max-w-5xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div>
                <h3 className="text-white font-semibold">CSV Bank Reconciliation</h3>
                <p className="text-xs text-gray-400">Paste a bank statement CSV with at least `Date` and `Amount` columns, then compare it against unreconciled bank ledger rows.</p>
              </div>
              <textarea className={inputClass} rows={6} placeholder="Date,Amount,Description&#10;2026-04-01,2000,UPI receipt" value={bankCsvText} onChange={(e) => setBankCsvText(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className={buttonClass} onClick={() => importBankCsv(false)} disabled={!bankCsvText.trim()}>
                  <CompareIcon />
                  Compare CSV
                </button>
                <button className={buttonClass} onClick={() => importBankCsv(true)} disabled={!bankCsvText.trim()}>
                  <CheckIcon />
                  Compare And Mark Matched
                </button>
              </div>
              {bankImportResult && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">Matched: {bankImportResult.matched?.length || 0}</div>
                  <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">Unmatched Statement Rows: {bankImportResult.unmatchedStatementRows?.length || 0}</div>
                  <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">Unmatched Ledger Rows: {bankImportResult.unmatchedLedgerRows?.length || 0}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Ledger section tabs"
            items={ledgerTabs}
            activeKey={ledgerTab}
            onChange={setLedgerTab}
            className="w-fit max-w-full"
            listClassName="border-b-0 px-0 pt-0"
          />

          {ledgerTab === 'create_account' && (
            <form onSubmit={saveChartAccount} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h3 className="text-white font-semibold">Create Chart Account</h3>
              <input className={inputClass} placeholder="Account Name" value={accountForm.accountName} onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })} required />
              <div className="grid grid-cols-2 gap-2">
                <select className={inputClass} value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}><option value="asset">Asset</option><option value="liability">Liability</option><option value="income">Income</option><option value="expense">Expense</option></select>
                <select className={inputClass} value={accountForm.subType} onChange={(e) => setAccountForm({ ...accountForm, subType: e.target.value })}><option value="general">General</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="stock">Stock</option></select>
              </div>
              <button className={buttonClass}>
                <AccountIcon />
                Add Account
              </button>
            </form>
          )}

          {ledgerTab === 'ledger_view' && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="text-white font-semibold">Ledger View</h3>
              <div className="mt-2 max-w-xl">
                <select
                  className={inputClass}
                  value={selectedAccountId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAccountId(id);
                    if (id) withLoading(async () => refreshLedger(id));
                  }}
                >
                  <option value="">Select account for ledger</option>
                  {chartAccounts.map((row) => (
                    <option key={row._id} value={row._id}>
                      {row.accountCode} - {row.accountName}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-2 text-sm text-gray-300">Opening: {formatCurrency(ledgerSummary?.openingBalance || 0)}</p>
              <p className="text-sm text-gray-300">Closing: {formatCurrency(ledgerSummary?.totals?.closing || 0)}</p>
              <table className="min-w-full text-sm mt-2">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Voucher</th><th className="px-2 py-1 text-left">Debit</th><th className="px-2 py-1 text-left">Credit</th><th className="px-2 py-1 text-left">Balance</th></tr></thead>
                <tbody>
                  {ledgerPagination.paginatedRows.map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{new Date(row.entryDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-2 py-1">{row.voucherNumber || row.voucherType}</td>
                      <td className="px-2 py-1">{formatCurrency(row.debit || 0)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.credit || 0)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.runningBalance || 0)}</td>
                    </tr>
                  ))}
                  {ledgerPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                        Select an account to load ledger entries for the chosen range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(ledgerPagination, 'ledger rows')}
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Reports section tabs"
            items={reportsTabs}
            activeKey={reportsTab}
            onChange={setReportsTab}
            className="w-full"
            listClassName="border-b-0 px-0 pt-0"
          />
          {renderReportsSection()}
        </div>
      )}

          {loading && <p className="text-sm text-gray-400">Loading...</p>}
        </div>
      </div>
    </div>
  );
};
