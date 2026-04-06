import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { formatCurrency } from '../config';

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

type TabKey = 'dashboard' | 'invoices' | 'masters' | 'payments' | 'opening' | 'expenses' | 'vouchers' | 'books' | 'ledger' | 'reports';

interface SalaryPayment {
  _id: string;
  employeeName: string;
  month: string;
  payDate: string;
  amount: number;
  paymentMethod: string;
}

interface ContractPayment {
  _id: string;
  contractorName: string;
  contractTitle: string;
  paymentDate: string;
  amount: number;
  status: string;
  paymentMethod: string;
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
  referenceNo?: string;
  counterpartyName?: string;
  isPrinted?: boolean;
  lines?: Array<{ accountName: string; debit: number; credit: number }>;
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
  { key: 'reports', label: 'Financial Reports' },
];

const paymentModes = ['cash', 'bank', 'upi', 'card', 'cheque', 'online', 'bank_transfer'];
const salaryPaymentModes = ['cash', 'bank', 'upi', 'card', 'cheque'];

export const Accounting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

  const [dayBookDate, setDayBookDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const [salaryForm, setSalaryForm] = useState({
    employeeId: '',
    employeeName: '',
    designation: '',
    month: new Date().toISOString().slice(0, 7),
    payDate: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMethod: 'bank',
    notes: '',
  });
  const [contractForm, setContractForm] = useState({
    contractorName: '',
    contractTitle: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: '',
    status: 'paid',
    paymentMethod: 'bank',
    notes: '',
  });
  const [manualForm, setManualForm] = useState({
    entryType: 'expense',
    category: '',
    amount: '',
    paymentMethod: 'cash',
    narration: '',
    referenceNo: '',
    entryDate: new Date().toISOString().slice(0, 10),
  });
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
  const [receiptForm, setReceiptForm] = useState({
    amount: '',
    voucherDate: new Date().toISOString().slice(0, 10),
    paymentMode: 'cash',
    category: 'Service Income',
    referenceNo: '',
    counterpartyName: '',
    notes: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    voucherDate: new Date().toISOString().slice(0, 10),
    paymentMode: 'cash',
    category: 'General Expense',
    referenceNo: '',
    counterpartyName: '',
    notes: '',
  });
  const [journalForm, setJournalForm] = useState({
    voucherDate: new Date().toISOString().slice(0, 10),
    referenceNo: '',
    notes: '',
    debitAccountId: '',
    creditAccountId: '',
    amount: '',
  });
  const [transferForm, setTransferForm] = useState({
    amount: '',
    transferDate: new Date().toISOString().slice(0, 10),
    direction: 'cash_to_bank',
    referenceNo: '',
    notes: '',
  });
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
  const [vendorForm, setVendorForm] = useState({
    name: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
  });
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
  const trialBalancePagination = usePaginatedRows<any>(trialBalanceRows, { initialPageSize: 10, resetDeps: [startDate, endDate] });

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';
  const buttonClass = 'rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60';

  const apiJson = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      throw new Error(data.error || `API ${response.status}`);
    }
    return data;
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
      apiJson('/api/accounting/salary?limit=30'),
      apiJson('/api/accounting/contracts?limit=30'),
      apiJson(`/api/accounting/day-book/entries?limit=50&startDate=${startDate}&endDate=${endDate}`),
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
    const data = await apiJson(`/api/accounting/vouchers?limit=50&startDate=${startDate}&endDate=${endDate}`);
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
      apiJson(`/api/accounting/core/invoices?limit=20&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/core/payments?limit=20&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/core/journal-entries?limit=20&startDate=${startDate}&endDate=${endDate}`),
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
      await refreshDashboard();
      await refreshMasters();
      await refreshEmployeeMaster();
      await refreshPayments();
      await refreshOpening();
      await refreshVouchers();
      await refreshChart();
      await refreshBooks();
      await refreshReports();
    });
  }, []);

  useEffect(() => {
    setSelectedReconcileIds([]);
  }, [startDate, endDate, bankBook?.reconciliationPending?.length]);

  useEffect(() => {
    if (activeTab !== 'masters') return;
    withLoading(async () => {
      await refreshMasters();
    });
  }, [periodYear]);

  const handleRefreshCurrentTab = () => {
    withLoading(async () => {
      if (startDate > endDate) {
        throw new Error('Start date must be before end date');
      }
      if (activeTab === 'dashboard' || activeTab === 'invoices') {
        await refreshDashboard();
      }
      if (activeTab === 'masters') {
        await refreshMasters();
      }
      if (activeTab === 'payments' || activeTab === 'expenses') {
        await refreshEmployeeMaster();
        await refreshPayments();
      }
      if (activeTab === 'opening') await refreshOpening();
      if (activeTab === 'vouchers') await refreshVouchers();
      if (activeTab === 'ledger') {
        await refreshChart();
        if (selectedAccountId) await refreshLedger(selectedAccountId);
      }
      if (activeTab === 'books') await refreshBooks();
      if (activeTab === 'reports') await refreshReports();
    });
  };

  const submitSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      const selectedEmployee = employeeMaster.find((row) => row._id === salaryForm.employeeId);
      if (!selectedEmployee) {
        throw new Error('Please select employee from master');
      }

      await apiJson('/api/accounting/salary', {
        method: 'POST',
        body: JSON.stringify({
          ...salaryForm,
          employeeId: selectedEmployee._id,
          employeeName: selectedEmployee.name,
          designation: selectedEmployee.designation || '',
          amount: Number(salaryForm.amount || 0),
        }),
      });
      setMessage('Salary payment added');
      setSalaryForm((prev) => ({ ...prev, amount: '', notes: '' }));
      await refreshPayments();
    });
  };

  const submitContract = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/contracts', {
        method: 'POST',
        body: JSON.stringify({ ...contractForm, amount: Number(contractForm.amount || 0) }),
      });
      setMessage('Contract payment added');
      setContractForm({ ...contractForm, contractorName: '', contractTitle: '', amount: '', notes: '' });
      await refreshPayments();
    });
  };

  const submitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      await apiJson('/api/accounting/day-book/entry', {
        method: 'POST',
        body: JSON.stringify({ ...manualForm, amount: Number(manualForm.amount || 0) }),
      });
      setMessage('Entry added');
      setManualForm({ ...manualForm, category: '', amount: '', narration: '', referenceNo: '' });
      await refreshPayments();
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

  const saveVoucher = async (path: string, body: Record<string, any>, success: string) => {
    await withLoading(async () => {
      await apiJson(path, { method: 'POST', body: JSON.stringify(body) });
      setMessage(success);
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
    const response = await fetch(`${API_BASE}/api/accounting/core/exports/${reportType}${query ? `?${query}` : ''}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to export report');
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
    const amount = window.prompt('Payment amount');
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
    const reason = window.prompt('Cancellation reason', 'Cancelled by user');
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
    await withLoading(async () => {
      await apiJson('/api/accounting/core/vendors', { method: 'POST', body: JSON.stringify(vendorForm) });
      setMessage('Vendor created');
      setVendorForm({ name: '', contact: '', phone: '', email: '', address: '' });
      await refreshMasters();
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

  const editDaybook = async (row: DayBookEntry) => {
    const amount = window.prompt('Amount', String(row.amount));
    if (!amount) return;
    const narration = window.prompt('Narration', row.narration || '') || '';
    await withLoading(async () => {
      await apiJson(`/api/accounting/day-book/entry/${row._id}`, {
        method: 'PUT',
        body: JSON.stringify({ amount: Number(amount), narration }),
      });
      setMessage('Entry updated');
      await refreshPayments();
    });
  };

  const deleteDaybook = async (row: DayBookEntry) => {
    if (!window.confirm('Cancel this entry?')) return;
    await withLoading(async () => {
      await apiJson(`/api/accounting/day-book/entry/${row._id}`, { method: 'DELETE' });
      setMessage('Entry cancelled');
      await refreshPayments();
    });
  };

  const printVoucher = async (row: VoucherRow) => {
    const popup = window.open('', '_blank', 'width=700,height=700');
    if (!popup) {
      setError('Allow popups to print voucher');
      return;
    }
    const html = `
      <html><head><title>${row.voucherNumber}</title></head>
      <body style="font-family:Arial;padding:20px;">
        <h2>Voucher ${row.voucherNumber}</h2>
        <p>Type: ${row.voucherType}</p>
        <p>Date: ${new Date(row.voucherDate).toLocaleDateString('en-IN')}</p>
        <p>Reference: ${row.referenceNo || '-'}</p>
        <p>Total: ${formatCurrency(row.totalAmount)}</p>
      </body></html>`;
    popup.document.write(html);
    popup.document.close();
    popup.print();
    popup.close();
    await apiJson(`/api/accounting/vouchers/${row._id}/mark-printed`, { method: 'POST' }).catch(() => undefined);
    await refreshVouchers();
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

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Accounting Console</h1>
        <div className="flex items-center gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className={buttonClass} onClick={handleRefreshCurrentTab} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${activeTab === tab.key ? 'bg-indigo-500 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Today Revenue</p><p className="text-xl font-semibold text-emerald-300">{formatCurrency(dashboardSummary?.todayRevenue || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Monthly Revenue</p><p className="text-xl font-semibold text-white">{formatCurrency(dashboardSummary?.monthlyRevenue || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Expenses</p><p className="text-xl font-semibold text-red-300">{formatCurrency(dashboardSummary?.expenses || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">Profit</p><p className="text-xl font-semibold text-sky-300">{formatCurrency(dashboardSummary?.profit || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-gray-400">GST Payable</p><p className="text-xl font-semibold text-amber-300">{formatCurrency(dashboardSummary?.gstPayable || 0)}</p></div>
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
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <form onSubmit={submitInvoice} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
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
            <button className={buttonClass}>Create Invoice</button>
          </form>

          <form onSubmit={submitCoreExpense} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
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
            <button className={buttonClass}>Record Expense</button>
          </form>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 xl:col-span-2 overflow-x-auto">
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
                      {row.status !== 'cancelled' && Number(row.balanceAmount || 0) > 0 && <button className="text-indigo-300" onClick={() => addInvoicePayment(row._id)}>Add Payment</button>}
                      {row.status !== 'cancelled' && <button className="text-red-300" onClick={() => cancelCoreInvoice(row._id)}>Cancel</button>}
                    </td>
                  </tr>
                ))}
                {!coreInvoices.length && <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-400">No accounting invoices in this date range.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'masters' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <form onSubmit={submitVendor} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white">Vendor Master</h2>
            <input className={inputClass} placeholder="Vendor Name" required value={vendorForm.name} onChange={(e) => setVendorForm((prev) => ({ ...prev, name: e.target.value }))} />
            <input className={inputClass} placeholder="Contact Person" value={vendorForm.contact} onChange={(e) => setVendorForm((prev) => ({ ...prev, contact: e.target.value }))} />
            <input className={inputClass} placeholder="Phone" value={vendorForm.phone} onChange={(e) => setVendorForm((prev) => ({ ...prev, phone: e.target.value }))} />
            <input className={inputClass} placeholder="Email" value={vendorForm.email} onChange={(e) => setVendorForm((prev) => ({ ...prev, email: e.target.value }))} />
            <button className={buttonClass}>Create Vendor</button>
          </form>

          <form onSubmit={submitAsset} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white">Fixed Asset</h2>
            <input className={inputClass} placeholder="Asset Name" required value={assetForm.assetName} onChange={(e) => setAssetForm((prev) => ({ ...prev, assetName: e.target.value }))} />
            <input className={inputClass} placeholder="Description" value={assetForm.description} onChange={(e) => setAssetForm((prev) => ({ ...prev, description: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Cost" required value={assetForm.cost} onChange={(e) => setAssetForm((prev) => ({ ...prev, cost: e.target.value }))} />
              <input className={inputClass} type="number" min="1" placeholder="Life Years" required value={assetForm.lifeYears} onChange={(e) => setAssetForm((prev) => ({ ...prev, lifeYears: e.target.value }))} />
              <input className={inputClass} type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm((prev) => ({ ...prev, purchaseDate: e.target.value }))} />
            </div>
            <button className={buttonClass}>Create Asset</button>
          </form>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white">Financial Periods</h2>
            <input className={inputClass} type="number" value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value || new Date().getFullYear()))} />
            <div className="space-y-2">
              {periods.map((row) => (
                <div key={row._id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm">
                  <span className="text-gray-200">{row.periodKey}</span>
                  <button className={buttonClass} type="button" onClick={() => togglePeriodLock(row.month, row.year, !row.isLocked)}>
                    {row.isLocked ? 'Unlock' : 'Lock'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 xl:col-span-2 overflow-x-auto">
            <h3 className="mb-2 text-white font-semibold">Vendor Balances</h3>
            <table className="min-w-full text-sm">
              <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Vendor</th><th className="px-2 py-1 text-left">Contact</th><th className="px-2 py-1 text-left">Total Payable</th><th className="px-2 py-1 text-left">Paid</th><th className="px-2 py-1 text-left">Balance</th></tr></thead>
              <tbody>
                {vendors.map((row) => (
                  <tr key={row._id} className="border-t border-white/10">
                    <td className="px-2 py-1">{row.name}</td>
                    <td className="px-2 py-1">{row.contact || row.phone || '-'}</td>
                    <td className="px-2 py-1">{formatCurrency(row.totalPayable || 0)}</td>
                    <td className="px-2 py-1">{formatCurrency(row.paid || 0)}</td>
                    <td className="px-2 py-1">{formatCurrency(row.balance || 0)}</td>
                  </tr>
                ))}
                {!vendors.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-400">No vendors available yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 xl:col-span-3 overflow-x-auto">
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
                    <td className="px-2 py-1"><button className="text-indigo-300" onClick={() => postDepreciation(row._id)}>Post Monthly Depreciation</button></td>
                  </tr>
                ))}
                {!fixedAssets.length && <tr><td colSpan={5} className="px-2 py-3 text-center text-gray-400">No fixed assets configured.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <form onSubmit={submitSalary} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white">Salary Payment</h2>
            <select
              className={inputClass}
              required
              value={salaryForm.employeeId}
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
            <select className={inputClass} value={salaryForm.paymentMethod} onChange={(e) => setSalaryForm({ ...salaryForm, paymentMethod: e.target.value })}>
              {salaryPaymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}
            </select>
            {employeeMaster.length === 0 && (
              <p className="text-xs text-amber-300">No active employees in master. Add employee in Employees menu first.</p>
            )}
            <button className={buttonClass} disabled={employeeMaster.length === 0}>Save Salary</button>
          </form>

          <form onSubmit={submitContract} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white">Contract Payment</h2>
            <input className={inputClass} placeholder="Contractor Name" required value={contractForm.contractorName} onChange={(e) => setContractForm({ ...contractForm, contractorName: e.target.value })} />
            <input className={inputClass} placeholder="Contract Title" required value={contractForm.contractTitle} onChange={(e) => setContractForm({ ...contractForm, contractTitle: e.target.value })} />
            <div className="grid grid-cols-4 gap-2">
              <input className={inputClass} type="date" required value={contractForm.paymentDate} onChange={(e) => setContractForm({ ...contractForm, paymentDate: e.target.value })} />
              <input className={inputClass} type="number" min="0" step="0.01" required placeholder="Amount" value={contractForm.amount} onChange={(e) => setContractForm({ ...contractForm, amount: e.target.value })} />
              <select className={inputClass} value={contractForm.status} onChange={(e) => setContractForm({ ...contractForm, status: e.target.value })}><option value="paid">PAID</option><option value="partial">PARTIAL</option><option value="pending">PENDING</option></select>
              <select className={inputClass} value={contractForm.paymentMethod} onChange={(e) => setContractForm({ ...contractForm, paymentMethod: e.target.value })}>{salaryPaymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
            </div>
            <button className={buttonClass}>Save Contract</button>
          </form>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-2 text-white font-semibold">Recent Salary</h3>
            {salaryList.slice(0, 8).map((row) => <p key={row._id} className="text-sm text-gray-300">{row.employeeName} ({row.month}) - {formatCurrency(row.amount)}</p>)}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h3 className="mb-2 text-white font-semibold">Recent Contract</h3>
            {contractList.slice(0, 8).map((row) => <p key={row._id} className="text-sm text-gray-300">{row.contractorName} - {formatCurrency(row.amount)}</p>)}
          </div>
        </div>
      )}

      {activeTab === 'opening' && (
        <form onSubmit={saveOpening} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="text-lg font-semibold text-white">Opening Balances</h2>
          <p className="text-sm text-gray-300">Status: {openingStatus?.isLocked ? 'Locked' : 'Open'}</p>
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
          <textarea className={inputClass} rows={3} placeholder="Customer accounts: name:amount:side (one per line)" value={openingForm.customerAccountsText} onChange={(e) => setOpeningForm({ ...openingForm, customerAccountsText: e.target.value })} />
          <textarea className={inputClass} rows={3} placeholder="Supplier accounts: name:amount:side (one per line)" value={openingForm.supplierAccountsText} onChange={(e) => setOpeningForm({ ...openingForm, supplierAccountsText: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={openingForm.lockAfterSave} onChange={(e) => setOpeningForm({ ...openingForm, lockAfterSave: e.target.checked })} /> Lock after save</label>
          <div className="flex items-center gap-2">
            <button className={buttonClass} disabled={openingStatus?.isLocked}>Save Opening</button>
            <button type="button" className={buttonClass} disabled={openingStatus?.isLocked} onClick={lockOpening}>Lock Now</button>
          </div>
        </form>
      )}

      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <form onSubmit={submitManual} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h2 className="text-lg font-semibold text-white">Daily Expense/Income Entry</h2>
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
            <button className={buttonClass}>Save Entry</button>
          </form>

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
                    <td className="px-2 py-1 space-x-2"><button className="text-indigo-300" onClick={() => editDaybook(row)}>Edit</button><button className="text-red-300" onClick={() => deleteDaybook(row)}>Cancel</button></td>
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
        </div>
      )}

      {activeTab === 'vouchers' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveVoucher('/api/accounting/vouchers/receipt', { ...receiptForm, amount: Number(receiptForm.amount || 0) }, 'Receipt voucher created');
            }}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
          >
            <h3 className="text-white font-semibold">Receipt Voucher (Income)</h3>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" value={receiptForm.amount} onChange={(e) => setReceiptForm({ ...receiptForm, amount: e.target.value })} />
              <input className={inputClass} type="date" value={receiptForm.voucherDate} onChange={(e) => setReceiptForm({ ...receiptForm, voucherDate: e.target.value })} />
            </div>
            <input className={inputClass} placeholder="Category (interest/commission/service)" value={receiptForm.category} onChange={(e) => setReceiptForm({ ...receiptForm, category: e.target.value })} />
            <select className={inputClass} value={receiptForm.paymentMode} onChange={(e) => setReceiptForm({ ...receiptForm, paymentMode: e.target.value })}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
            <input className={inputClass} placeholder="Counterparty" value={receiptForm.counterpartyName} onChange={(e) => setReceiptForm({ ...receiptForm, counterpartyName: e.target.value })} />
            <input className={inputClass} placeholder="Reference No" value={receiptForm.referenceNo} onChange={(e) => setReceiptForm({ ...receiptForm, referenceNo: e.target.value })} />
            <button className={buttonClass}>Create Receipt Voucher</button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveVoucher('/api/accounting/vouchers/payment', { ...paymentForm, amount: Number(paymentForm.amount || 0) }, 'Payment voucher created');
            }}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
          >
            <h3 className="text-white font-semibold">Payment Voucher (Expense)</h3>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              <input className={inputClass} type="date" value={paymentForm.voucherDate} onChange={(e) => setPaymentForm({ ...paymentForm, voucherDate: e.target.value })} />
            </div>
            <input className={inputClass} placeholder="Category (rent/electricity/salary/etc)" value={paymentForm.category} onChange={(e) => setPaymentForm({ ...paymentForm, category: e.target.value })} />
            <select className={inputClass} value={paymentForm.paymentMode} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}>{paymentModes.map((mode) => <option key={mode} value={mode}>{mode.toUpperCase()}</option>)}</select>
            <input className={inputClass} placeholder="Counterparty" value={paymentForm.counterpartyName} onChange={(e) => setPaymentForm({ ...paymentForm, counterpartyName: e.target.value })} />
            <input className={inputClass} placeholder="Reference No" value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} />
            <button className={buttonClass}>Create Payment Voucher</button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveVoucher(
                '/api/accounting/vouchers/journal',
                {
                  voucherDate: journalForm.voucherDate,
                  referenceNo: journalForm.referenceNo,
                  notes: journalForm.notes,
                  lines: [
                    { accountId: journalForm.debitAccountId, debit: Number(journalForm.amount || 0), credit: 0 },
                    { accountId: journalForm.creditAccountId, debit: 0, credit: Number(journalForm.amount || 0) },
                  ],
                },
                'Journal voucher created'
              );
            }}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
          >
            <h3 className="text-white font-semibold">Journal Voucher</h3>
            <div className="grid grid-cols-3 gap-2">
              <input className={inputClass} type="date" value={journalForm.voucherDate} onChange={(e) => setJournalForm({ ...journalForm, voucherDate: e.target.value })} />
              <select className={inputClass} value={journalForm.debitAccountId} onChange={(e) => setJournalForm({ ...journalForm, debitAccountId: e.target.value })}><option value="">Debit Account</option>{chartAccounts.map((row) => <option key={row._id} value={row._id}>{row.accountCode} - {row.accountName}</option>)}</select>
              <select className={inputClass} value={journalForm.creditAccountId} onChange={(e) => setJournalForm({ ...journalForm, creditAccountId: e.target.value })}><option value="">Credit Account</option>{chartAccounts.map((row) => <option key={row._id} value={row._id}>{row.accountCode} - {row.accountName}</option>)}</select>
            </div>
            <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" value={journalForm.amount} onChange={(e) => setJournalForm({ ...journalForm, amount: e.target.value })} />
            <input className={inputClass} placeholder="Reference No" value={journalForm.referenceNo} onChange={(e) => setJournalForm({ ...journalForm, referenceNo: e.target.value })} />
            <button className={buttonClass}>Create Journal Voucher</button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveVoucher('/api/accounting/transfer', { ...transferForm, amount: Number(transferForm.amount || 0) }, 'Cash/Bank transfer saved');
            }}
            className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
          >
            <h3 className="text-white font-semibold">Cash-Bank Transfer</h3>
            <div className="grid grid-cols-3 gap-2">
              <input className={inputClass} type="number" min="0" step="0.01" placeholder="Amount" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} />
              <input className={inputClass} type="date" value={transferForm.transferDate} onChange={(e) => setTransferForm({ ...transferForm, transferDate: e.target.value })} />
              <select className={inputClass} value={transferForm.direction} onChange={(e) => setTransferForm({ ...transferForm, direction: e.target.value })}><option value="cash_to_bank">Cash to Bank</option><option value="bank_to_cash">Bank to Cash</option></select>
            </div>
            <button className={buttonClass}>Save Transfer</button>
          </form>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 lg:col-span-2 overflow-x-auto">
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
                    <td className="px-2 py-1"><button className="text-indigo-300" onClick={() => printVoucher(row)}>Print</button></td>
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
        </div>
      )}

      {activeTab === 'books' && (
        <div className="space-y-4">
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
          </div>
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
              Reconcile Selected
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div>
              <h3 className="text-white font-semibold">CSV Bank Reconciliation</h3>
              <p className="text-xs text-gray-400">Paste a bank statement CSV with at least `Date` and `Amount` columns, then compare it against unreconciled bank ledger rows.</p>
            </div>
            <textarea className={inputClass} rows={6} placeholder="Date,Amount,Description&#10;2026-04-01,2000,UPI receipt" value={bankCsvText} onChange={(e) => setBankCsvText(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} onClick={() => importBankCsv(false)} disabled={!bankCsvText.trim()}>Compare CSV</button>
              <button className={buttonClass} onClick={() => importBankCsv(true)} disabled={!bankCsvText.trim()}>Compare And Mark Matched</button>
            </div>
            {bankImportResult && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">Matched: {bankImportResult.matched?.length || 0}</div>
                <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">Unmatched Statement Rows: {bankImportResult.unmatchedStatementRows?.length || 0}</div>
                <div className="rounded border border-white/10 bg-black/20 p-3 text-sm text-gray-200">Unmatched Ledger Rows: {bankImportResult.unmatchedLedgerRows?.length || 0}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <form onSubmit={saveChartAccount} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <h3 className="text-white font-semibold">Create Chart Account</h3>
            <input className={inputClass} placeholder="Account Name" value={accountForm.accountName} onChange={(e) => setAccountForm({ ...accountForm, accountName: e.target.value })} required />
            <div className="grid grid-cols-2 gap-2">
              <select className={inputClass} value={accountForm.accountType} onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value })}><option value="asset">Asset</option><option value="liability">Liability</option><option value="income">Income</option><option value="expense">Expense</option></select>
              <select className={inputClass} value={accountForm.subType} onChange={(e) => setAccountForm({ ...accountForm, subType: e.target.value })}><option value="general">General</option><option value="cash">Cash</option><option value="bank">Bank</option><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="stock">Stock</option></select>
            </div>
            <button className={buttonClass}>Add Account</button>
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
          </form>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
            <h3 className="text-white font-semibold">Ledger View</h3>
            <p className="text-sm text-gray-300">Opening: {formatCurrency(ledgerSummary?.openingBalance || 0)}</p>
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
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('invoices', { startDate, endDate }))}>Export Invoices CSV</button>
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('trial-balance', { startDate, endDate }))}>Export Trial Balance CSV</button>
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('profit-loss', { startDate, endDate }))}>Export P&L CSV</button>
            <button className={buttonClass} onClick={() => withLoading(async () => downloadExport('vendors'))}>Export Vendor Ledger CSV</button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-gray-300">Total Income</p><p className="text-xl font-semibold text-emerald-300">{formatCurrency(incomeReport?.totalIncome || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-gray-300">Total Expense</p><p className="text-xl font-semibold text-red-300">{formatCurrency(expenseReport?.totalExpense || 0)}</p></div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm text-gray-300">Net Profit/Loss</p><p className="text-xl font-semibold text-white">{formatCurrency(profitLoss?.netProfit || 0)}</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="text-white font-semibold mb-2">Trial Balance</h3>
              <table className="min-w-full text-sm">
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Account</th><th className="px-2 py-1 text-left">Debit</th><th className="px-2 py-1 text-left">Credit</th></tr></thead>
                <tbody>
                  {trialBalancePagination.paginatedRows.map((row: any) => (
                    <tr key={row.accountId} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.accountCode} - {row.accountName}</td>
                      <td className="px-2 py-1">{formatCurrency(row.debitBalance || 0)}</td>
                      <td className="px-2 py-1">{formatCurrency(row.creditBalance || 0)}</td>
                    </tr>
                  ))}
                  {trialBalancePagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-2 py-3 text-center text-gray-400">
                        No trial balance rows found for the selected range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {renderTablePagination(trialBalancePagination, 'trial balance rows')}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 overflow-x-auto">
              <h3 className="text-white font-semibold mb-2">Balance Sheet</h3>
              <p className="text-sm text-gray-300">Assets: {formatCurrency(balanceSheet?.totals?.totalAssets || 0)}</p>
              <p className="text-sm text-gray-300">Liabilities + Equity: {formatCurrency(balanceSheet?.totals?.liabilitiesAndEquity || 0)}</p>
              <p className="text-sm text-gray-300">Difference: {formatCurrency(balanceSheet?.totals?.difference || 0)}</p>
            </div>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-gray-400">Loading...</p>}
    </div>
  );
};
