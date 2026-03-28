import React, { useEffect, useMemo, useState } from 'react';
import { PaginationControls } from '../components/PaginationControls';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { formatCurrency } from '../config';

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

type TabKey = 'payments' | 'opening' | 'expenses' | 'vouchers' | 'books' | 'ledger' | 'reports';

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
  const [activeTab, setActiveTab] = useState<TabKey>('payments');
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

  const handleRefreshCurrentTab = () => {
    withLoading(async () => {
      if (startDate > endDate) {
        throw new Error('Start date must be before end date');
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
    if (!window.confirm('Delete this entry?')) return;
    await withLoading(async () => {
      await apiJson(`/api/accounting/day-book/entry/${row._id}`, { method: 'DELETE' });
      setMessage('Entry deleted');
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
            <h3 className="mb-2 text-white font-semibold">Entries (Edit/Delete with permission)</h3>
            <table className="min-w-full text-sm">
              <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Date</th><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Category</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Action</th></tr></thead>
              <tbody>
                {daybookPagination.paginatedRows.map((row) => (
                  <tr key={row._id} className="border-t border-white/10">
                    <td className="px-2 py-1">{new Date(row.entryDate).toLocaleDateString('en-IN')}</td>
                    <td className="px-2 py-1 uppercase">{row.entryType}</td>
                    <td className="px-2 py-1">{row.category}</td>
                    <td className="px-2 py-1">{formatCurrency(row.amount)}</td>
                    <td className="px-2 py-1 space-x-2"><button className="text-indigo-300" onClick={() => editDaybook(row)}>Edit</button><button className="text-red-300" onClick={() => deleteDaybook(row)}>Delete</button></td>
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
