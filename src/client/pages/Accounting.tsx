import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Tooltip } from '@mui/material';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { PaginationControls } from '../components/PaginationControls';
import { CardTabs, cardTabsTooltipSlotProps } from '../components/CardTabs';
import { FloatingField } from '../components/FloatingField';
import { AccountingGstWorkspace } from '../components/AccountingGstWorkspace';
import { AccountingTreasuryWorkspace } from '../components/AccountingTreasuryWorkspace';
import { AccountingTdsWorkspace } from '../components/AccountingTdsWorkspace';
import { ReportDataTable } from '../components/ReportDataTable';
import { ActionIconButton } from '../components/ActionIconButton';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { usePaginatedRows } from '../hooks/usePaginatedRows';
import { formatCurrency } from '../config';
import { apiUrl } from '../utils/api';
import { getGeneralSettings, resolveGeneralSettingsAssetUrl } from '../utils/generalSettings';
import { showConfirmDialog, showPromptDialog } from '../utils/appDialogs';
import { downloadCsvRows, downloadExcelRows, downloadPdfRows } from '../utils/reportExports';

type TabKey = 'dashboard' | 'invoices' | 'masters' | 'payments' | 'opening' | 'expenses' | 'vouchers' | 'books' | 'treasury' | 'ledger' | 'gst' | 'tds' | 'reports';
type MastersTabKey = 'vendors' | 'assets' | 'periods';
type InvoicesTabKey = 'invoice_entry' | 'expense_entry' | 'invoice_list';
type PaymentsTabKey = 'salary_entry' | 'contract_entry' | 'history';
type OpeningTabKey = 'balances' | 'party_openings';
type ExpensesTabKey = 'entry' | 'entries';
type VouchersTabKey = 'receipt' | 'payment' | 'journal' | 'transfer' | 'list';
type BooksTabKey = 'summary' | 'cash_entries' | 'bank_entries' | 'reconciliation' | 'csv_compare';
type LedgerTabKey = 'groups' | 'ledgers' | 'create_account' | 'ledger_view';
type ReportsTabKey =
  | 'overview'
  | 'supplier_payables'
  | 'vendors'
  | 'assets'
  | 'periods'
  | 'invoices'
  | 'payments'
  | 'journals'
  | 'vouchers'
  | 'salary'
  | 'contracts'
  | 'daybook'
  | 'cash_entries'
  | 'bank_entries'
  | 'trial_balance'
  | 'profit_loss'
  | 'balance_sheet'
  | 'tds';
type TdsReportTabKey =
  | 'computation'
  | 'payables'
  | 'outstanding'
  | 'returns'
  | 'certificates'
  | 'reconciliation'
  | 'mismatches'
  | 'challans'
  | 'payment_register'
  | 'corrections'
  | 'audit_trail'
  | 'tax_audit_34a';
type TdsReportFieldKind = 'text' | 'money' | 'number' | 'date' | 'upper' | 'period';
interface TdsReportField {
  key: string;
  header: string;
  kind?: TdsReportFieldKind;
  empty?: string;
}
interface TdsReportDefinition {
  title: string;
  itemLabel: string;
  searchPlaceholder: string;
  exportSlug: string;
  dataPath: string[];
  filters?: Array<{ key: string; label: string; kind?: TdsReportFieldKind }>;
  fields: TdsReportField[];
}

interface SalaryPayment {
  _id: string;
  employeeId?: string;
  employeeName: string;
  designation?: string;
  month: string;
  payDate: string;
  baseAmount?: number;
  bonusAmount?: number;
  grossSalary?: number;
  employeePf?: number;
  employeeEsi?: number;
  professionalTax?: number;
  tdsAmount?: number;
  statutoryDeductions?: number;
  retirementContribution?: number;
  insurancePremium?: number;
  otherDeductions?: number;
  voluntaryDeductions?: number;
  totalDeductions?: number;
  employerPf?: number;
  employerEsi?: number;
  employerPayrollTaxes?: number;
  benefitsExpense?: number;
  netPay?: number;
  totalPayrollCost?: number;
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
  metadata?: {
    entryMode?: 'receipt' | 'expense' | 'settlement';
    debitAccountId?: string;
    debitAccountCode?: string;
    debitAccountName?: string;
    linkedEntityType?: string;
    linkedEntityId?: string;
    linkedEntityNumber?: string;
    treasuryAccountId?: string;
    treasuryAccountName?: string;
    paymentChannelLabel?: string;
    processorName?: string;
    transferDirection?: string;
    fromTreasuryAccountId?: string;
    toTreasuryAccountId?: string;
  };
  isPrinted?: boolean;
  lines?: Array<{ accountId?: string; accountCode?: string; accountName: string; debit: number; credit: number; narration?: string }>;
}

interface JournalEditorLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

interface JournalEntryConsoleDetail {
  entry: any;
  lines: Array<{
    _id?: string;
    accountId?: string;
    accountCode?: string;
    accountName?: string;
    debitAmount?: number;
    creditAmount?: number;
    description?: string;
  }>;
  capabilities?: {
    canEdit?: boolean;
    canCancel?: boolean;
  };
}

interface ChartAccount extends Record<string, any> {
  _id: string;
  accountCode: string;
  folioNo?: string;
  accountName: string;
  accountType: string;
  subType: string;
  groupId?: string;
  groupName?: string;
  underLabel?: string;
  towerBlockFlat?: string;
  gstNumber?: string;
  panNumber?: string;
  openingBalance?: number;
  openingSide?: 'debit' | 'credit';
  isSystem?: boolean;
  isActive: boolean;
}

interface AccountGroup extends Record<string, any> {
  _id: string;
  groupName: string;
  groupCode: string;
  under: 'asset' | 'liability' | 'income' | 'expense';
  parentGroupId?: string;
  parentGroupName?: string;
  isSystem?: boolean;
  isActive: boolean;
}

type TrialBalanceSection = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses' | 'Diagnostics';

interface TrialBalanceRow extends Record<string, any> {
  accountId: string;
  accountCode: string;
  accountName: string;
  section: TrialBalanceSection;
  reportHead: TrialBalanceSection;
  reportGroup: string;
  groupName?: string;
  parentGroupName?: string;
  ledgerLabel?: string;
  normalBalanceSide?: 'debit' | 'credit';
  abnormalBalance?: boolean;
  isSubLedger?: boolean;
  debitBalance: number;
  creditBalance: number;
}

interface EmployeeMasterRow {
  _id: string;
  employeeCode: string;
  name: string;
  designation?: string;
}

interface AccountingMenuItem {
  key: TabKey;
  label: string;
  description: string;
}

interface AccountingMenuGroup {
  title: string;
  helper: string;
  items: AccountingMenuItem[];
}

const accountingMenuGroups: AccountingMenuGroup[] = [
  {
    title: 'Overview',
    helper: 'Quick health and recent activity',
    items: [
      { key: 'dashboard', label: 'MIS Dashboard', description: 'Revenue, expenses, profit, GST, and recent work' },
    ],
  },
  {
    title: 'Masters',
    helper: 'Setup data used by entries',
    items: [
      { key: 'ledger', label: 'Chart & Ledger', description: 'Groups, ledgers, accounts, and ledger view' },
      { key: 'masters', label: 'Vendors / Assets / Periods', description: 'Vendor master, fixed assets, financial periods' },
      { key: 'opening', label: 'Opening Balances', description: 'Core and party opening balances' },
      { key: 'treasury', label: 'Treasury & Banks', description: 'Bank setup, treasury accounts, and cash controls' },
    ],
  },
  {
    title: 'Entries',
    helper: 'Day-to-day accounting input',
    items: [
      { key: 'invoices', label: 'Invoices & Bills', description: 'Customer invoices, expense bills, and invoice list' },
      { key: 'expenses', label: 'Income & Expense Entry', description: 'Manual day-book income and expense entries' },
      { key: 'payments', label: 'Salary & Contract Entry', description: 'Salary payments, contractor payments, edit history' },
      { key: 'vouchers', label: 'Vouchers', description: 'Receipt, payment, journal, and transfer vouchers' },
    ],
  },
  {
    title: 'Books',
    helper: 'Cash, bank, and reconciliation',
    items: [
      { key: 'books', label: 'Cash & Bank Book', description: 'Cash entries, bank entries, reconciliation, CSV compare' },
    ],
  },
  {
    title: 'Compliance',
    helper: 'GST and TDS statutory work',
    items: [
      { key: 'gst', label: 'GST & Filing', description: 'GST setup, filing support, and GST reports' },
      { key: 'tds', label: 'TDS Compliance', description: 'Sections, deductees, challans, returns, certificates' },
    ],
  },
  {
    title: 'Reports',
    helper: 'Review, export, and audit',
    items: [
      { key: 'reports', label: 'Accounting Reports', description: 'Trial balance, P&L, balance sheet, TDS, ledgers' },
    ],
  },
];

const tabs: Array<{ key: TabKey; label: string }> = accountingMenuGroups.flatMap((group) =>
  group.items.map(({ key, label }) => ({ key, label }))
);
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
  { key: 'groups', label: 'Manage Groups' },
  { key: 'ledgers', label: 'Manage Ledgers' },
  { key: 'create_account', label: 'Create Account' },
  { key: 'ledger_view', label: 'Ledger View' },
];
const reportsTabs: Array<{ key: ReportsTabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'trial_balance', label: 'Trial Balance' },
  { key: 'profit_loss', label: 'Profit & Loss' },
  { key: 'balance_sheet', label: 'Balance Sheet' },
  { key: 'tds', label: 'TDS Report' },
  { key: 'supplier_payables', label: 'Supplier Payables' },
  { key: 'vendors', label: 'Vendor Master' },
  { key: 'assets', label: 'Assets' },
  { key: 'periods', label: 'Periods' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'journals', label: 'Journals' },
  { key: 'vouchers', label: 'Vouchers' },
  { key: 'salary', label: 'Salary' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'daybook', label: 'Day Book' },
  { key: 'cash_entries', label: 'Cash Entries' },
  { key: 'bank_entries', label: 'Bank Entries' },
];
const tdsReportTabs: Array<{ key: TdsReportTabKey; label: string }> = [
  { key: 'computation', label: 'Computation' },
  { key: 'payables', label: 'Payables' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'returns', label: '24Q / 26Q / 27Q / 27EQ' },
  { key: 'certificates', label: '16 / 16A / 27D' },
  { key: 'reconciliation', label: '26AS / AIS' },
  { key: 'mismatches', label: 'Mismatches' },
  { key: 'challans', label: 'Challans' },
  { key: 'payment_register', label: 'Payment Register' },
  { key: 'corrections', label: 'Corrections' },
  { key: 'audit_trail', label: 'Audit Trail' },
  { key: 'tax_audit_34a', label: 'Tax Audit 34(a)' },
];

interface AccountingLogicDefinition {
  title: string;
  manualAnchor: string;
  summary: string;
  formulas: string[];
  dataSources: string[];
  responsibleScreens?: string[];
  backendApis?: string[];
  serverLogic?: string[];
  sourceRecords?: string[];
}

const dashboardLogic: AccountingLogicDefinition = {
  title: 'Dashboard logic',
  manualAnchor: 'accounting-dashboard-logic',
  summary: 'The dashboard combines posted accounting movement for the selected date range with recent invoices, payments, journals, and compliance activity.',
  formulas: [
    'Selected Income = all posted income between the selected start and end dates, including sales and small adjustments such as round-off income.',
    'Month-to-date Income = all posted income from the first day of the selected end-date month through the selected end date.',
    'Expenses = posted expense ledger movement inside the selected date range.',
    'Profit = Selected Income minus Expenses for the selected date range.',
    'GST Payable = output GST payable less input/settled GST movement posted up to the selected end date.',
  ],
  dataSources: ['Account ledger entries', 'Accounting invoices', 'Accounting payments', 'Journal entries', 'TDS/GST workspaces'],
};

const reportLogicByTab: Record<ReportsTabKey, AccountingLogicDefinition> = {
  overview: {
    title: 'Accounting reports overview logic',
    manualAnchor: 'accounting-report-logic',
    summary: 'The overview tab is a stitched accounting dashboard that combines range-based income, expense, profit, balance sheet, TDS, invoices, payments, vouchers, and journal activity into one review surface.',
    formulas: [
      'Total Income = income ledger credits minus income ledger debits, plus legacy POS/manual income fallback rows when needed.',
      'Total Expense = expense ledger debits minus expense ledger credits, plus legacy payroll/contract/manual expense fallback rows when needed.',
      'Net Profit/Loss = Total Income - Total Expense.',
      'Balance Sheet Difference = Assets - (Liabilities + Equity including retained earnings and diagnostic rows).',
    ],
    dataSources: ['Income, expense, Profit & Loss, and Balance Sheet report APIs', 'TDS bootstrap and TDS report APIs', 'Core invoices, payments, journals, vouchers, and recent TDS rows merged inside the client'],
    backendApis: [
      '/api/accounting/core/dashboard',
      '/api/accounting/core/invoices',
      '/api/accounting/core/payments',
      '/api/accounting/core/journal-entries',
      '/api/accounting/reports/income',
      '/api/accounting/reports/expense',
      '/api/accounting/reports/profit-loss',
      '/api/accounting/reports/balance-sheet',
      '/api/accounting/tds/bootstrap',
      '/api/accounting/tds/reports',
    ],
    serverLogic: [
      'buildDashboardSummary() aggregates JournalLine income, expense, and GST values for the selected period.',
      'The overview cards reuse the same P&L, Balance Sheet, and TDS payloads used by their dedicated tabs.',
      'Recent Accounting Activity is assembled in the client from invoices, payments, vouchers, journals, and TDS rows, then sorted by date descending.',
    ],
    sourceRecords: ['JournalLine', 'AccountingInvoice', 'AccountingPayment', 'AccountingVoucher', 'JournalEntry', 'TdsTransaction'],
    responsibleScreens: [
      'Accounts > Accounting > Accounting Reports',
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > Income & Expense Entry',
      'Accounts > Accounting > Salary & Contract Entry',
      'Accounts > Accounting > Vouchers',
      'Sales > Orders / Sales Invoice',
    ],
  },
  trial_balance: {
    title: 'Trial balance logic',
    manualAnchor: 'accounting-trial-balance-logic',
    summary: 'Trial Balance proves whether all ledger balances are balanced as debit and credit totals.',
    formulas: [
      'Opening Balance = chart opening balance unless an opening ledger entry already exists, plus all ledger movement before the start date.',
      'Period Debit = sum of debit ledger entries inside the selected date range.',
      'Period Credit = sum of credit ledger entries inside the selected date range.',
      'Closing Balance = Opening Balance + Period Debit - Period Credit.',
      'The report displays standard closing Debit and Credit balances only; opening and period movement are used internally to compute them.',
      'Account Head, subgroup, and sub-ledger tags come from the chart-of-accounts and account-group structure.',
    ],
    dataSources: ['Chart accounts', 'Account groups', 'Account ledger entries', 'Opening balance ledger entries', 'Legacy migration bridge rows'],
    backendApis: ['/api/accounting/reports/trial-balance'],
    serverLogic: [
      'The route calls buildTrialBalanceReport() in src/server/services/accountingReports.ts.',
      'The report loads active or historically-used chart accounts, group mapping, opening-ledger markers, pre-period sums, and current-period sums.',
      'Synthetic rows are added for legacy income, legacy expense, legacy clearing, and opening-balance differences when needed.',
    ],
    sourceRecords: ['ChartAccount', 'AccountGroup', 'AccountLedgerEntry', 'Sale', 'Return', 'DayBookEntry', 'SalaryPayment', 'ContractPayment'],
    responsibleScreens: [
      'Accounts > Accounting > Chart & Ledger',
      'Accounts > Accounting > Opening Balances',
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > Income & Expense Entry',
      'Accounts > Accounting > Salary & Contract Entry',
      'Accounts > Accounting > Vouchers',
    ],
  },
  profit_loss: {
    title: 'Profit & loss logic',
    manualAnchor: 'accounting-profit-loss-logic',
    summary: 'Profit & Loss compares all period income against all period expenses.',
    formulas: [
      'Income = income ledger credits minus debits, excluding opening entries.',
      'Expense = expense ledger debits minus credits, excluding opening entries.',
      'Legacy fallback income/expense is included only when source documents do not already have ledger postings.',
      'Net Profit/Loss = Total Income - Total Expense.',
    ],
    dataSources: ['Income and expense ledger accounts', 'Sales and sales-return fallback rows', 'Day book fallback rows', 'Salary and contract fallback rows', 'Purchase bills for inventory-capitalization diagnostics'],
    backendApis: ['/api/accounting/reports/profit-loss', '/api/accounting/reports/income', '/api/accounting/reports/expense'],
    serverLogic: [
      'The route calls buildProfitLossStatement(), which internally calls buildIncomeExpenseReports() in src/server/services/accountingReports.ts.',
      'Ledger movement comes from AccountLedgerEntry joined to ChartAccount, excluding opening vouchers.',
      'Fallback sources are Sale, Return, DayBookEntry, SalaryPayment, and ContractPayment only when those documents are not already posted into ledger rows.',
    ],
    sourceRecords: ['AccountLedgerEntry', 'ChartAccount', 'Sale', 'Return', 'DayBookEntry', 'SalaryPayment', 'ContractPayment', 'PurchaseBill'],
    responsibleScreens: [
      'Accounts > Accounting > Income & Expense Entry',
      'Accounts > Accounting > Salary & Contract Entry',
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > Vouchers',
      'Sales > Orders / Sales Invoice',
    ],
  },
  balance_sheet: {
    title: 'Balance sheet logic',
    manualAnchor: 'accounting-balance-sheet-logic',
    summary: 'Balance Sheet shows the financial position as on the selected end date.',
    formulas: [
      'Assets = debit-positive closing balances of asset accounts.',
      'Liabilities = credit-positive closing balances of liability accounts.',
      'Equity = capital/equity/opening-balance accounts plus retained earnings.',
      'Retained Earnings = profit/loss accumulated up to the selected as-on date.',
      'Difference = Assets - (Liabilities + Equity). It should be zero after diagnostics are resolved.',
    ],
    dataSources: ['Chart accounts', 'All ledger balances up to the selected as-on date', 'Profit & Loss retained-earnings bridge', 'Opening-balance ledger difference diagnostics'],
    backendApis: ['/api/accounting/reports/balance-sheet'],
    serverLogic: [
      'The route calls buildBalanceSheetReport() in src/server/services/accountingReports.ts.',
      'The report computes closing from chart opening plus cumulative AccountLedgerEntry debit-credit movement through the as-on date.',
      'Receivable/payable control balances are reclassified into receivables, payables, customer advances, and vendor advances before equity and diagnostics are appended.',
    ],
    sourceRecords: ['ChartAccount', 'AccountLedgerEntry', 'Profit & Loss bridge data'],
    responsibleScreens: [
      'Accounts > Accounting > Opening Balances',
      'Accounts > Accounting > Chart & Ledger',
      'Accounts > Accounting > Treasury & Banks',
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > Vouchers',
      'Sales > Orders / Sales Invoice',
    ],
  },
  tds: {
    title: 'TDS report logic',
    manualAnchor: 'accounting-tds-report-logic',
    summary: 'The TDS suite follows deduction, payable, challan deposit, return, certificate, reconciliation, correction, and audit lifecycle.',
    formulas: [
      'TDS Deducted = sum of TDS transaction amounts.',
      'Deposited = non-cancelled challan payments recorded against TDS.',
      'Outstanding = deducted amount minus deposited/allocated amount.',
      'Mismatch rows compare books, challans, returns, and reconciliation imports where available.',
    ],
    dataSources: ['TDS transactions', 'TDS challans', 'TDS returns', 'TDS certificates', 'TDS reconciliation runs', 'Vendor statutory master and deductee profiles'],
    backendApis: ['/api/accounting/tds/bootstrap', '/api/accounting/tds/reports'],
    serverLogic: [
      'The bootstrap route seeds default TDS sections and loads buildTdsDashboard() plus active vendor statutory data.',
      'The report route calls buildTdsReports() in src/server/services/tds.ts and prepares summary, statutory, compliance, reconciliation, challan, payment-register, correction, and audit buckets.',
      'Quarter, financial-year, payable, mismatch, and overdue logic all come from the TDS service layer rather than the client.',
    ],
    sourceRecords: ['TdsTransaction', 'TdsChallan', 'TdsReturn', 'TdsCertificate', 'TdsReconciliationRun', 'TdsSection', 'TdsDeducteeProfile', 'Vendor'],
    responsibleScreens: [
      'Accounts > Accounting > TDS Compliance',
      'Accounts > Accounting > Vendors / Assets / Periods',
      'Accounts > Accounting > Salary & Contract Entry',
      'Accounts > Accounting > Invoices & Bills',
    ],
  },
  supplier_payables: {
    title: 'Supplier payables logic',
    manualAnchor: 'accounting-supplier-payables-logic',
    summary: 'This report shows procurement supplier bills, settlements, and pending payables with supplier-wise traceability.',
    formulas: [
      'Bill Amount = posted purchase bill total for the supplier.',
      'Paid Amount = supplier settlements posted against that purchase bill.',
      'Outstanding Amount = Bill Amount minus Paid Amount.',
      'Ageing uses the bill date and shows only the still-unpaid amount in 0-30, 31-60, 61-90, and 90+ day buckets.',
      'Supplier payable validation compares report outstanding with the linked supplier payable ledger balance.',
    ],
    dataSources: [
      'Procurement purchase bills',
      'Supplier-linked settlement vouchers and fallback payment journals',
      'Supplier master to accounting vendor mapping',
      'Supplier payable sub-ledger balances',
    ],
    backendApis: ['/api/accounting/core/supplier-payables'],
    serverLogic: [
      'The backend links procurement suppliers to accounting vendor ledgers and then summarizes bills, payments, outstanding, and ageing by supplier.',
      'This report is separate from Vendor Master, which stays a setup screen for accounting party records.',
    ],
    sourceRecords: ['Supplier', 'PurchaseBill', 'AccountingVoucher', 'JournalEntry', 'ChartAccount', 'AccountLedgerEntry', 'Vendor'],
    responsibleScreens: [
      'Operations > Procurement / Purchases',
      'Accounts > Accounting > Vouchers > Payment Voucher',
      'Accounts > Accounting > Accounting Reports > Supplier Payables',
    ],
  },
  vendors: {
    title: 'Vendor report logic',
    manualAnchor: 'accounting-master-report-logic',
    summary: 'This tab is a vendor master list for accounting setup, statutory details, opening balances, and linked ledgers. Procurement supplier bills and payments are reviewed in purchase, voucher, and payable reports instead.',
    formulas: ['Opening balance comes from the vendor master setup.', 'Ledger link shows whether this accounting vendor is mapped to its own ledger.', 'TDS flags come from vendor statutory setup.'],
    dataSources: ['Vendor master', 'Vendor opening balance setup', 'Linked vendor ledger mapping', 'TDS section setup'],
    backendApis: ['/api/accounting/core/vendors'],
    serverLogic: [
      'The route loads active accounting Vendor rows and merges them with linked-ledger metadata from listVendorBalances().',
      'Procurement suppliers are a separate master and do not become accounting vendor-ledger movement unless they are explicitly mapped to accounting vendor ledgers.',
    ],
    sourceRecords: ['Vendor', 'ChartAccount', 'AccountLedgerEntry'],
    responsibleScreens: [
      'Accounts > Accounting > Vendors / Assets / Periods',
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > TDS Compliance',
    ],
  },
  assets: {
    title: 'Fixed asset report logic',
    manualAnchor: 'accounting-master-report-logic',
    summary: 'Asset report lists active/disposed fixed assets and depreciation setup.',
    formulas: ['Book value = cost minus accumulated depreciation posted through asset workflows.'],
    dataSources: ['Fixed asset master', 'Depreciation posting workflow', 'Chart account mappings for fixed assets and accumulated depreciation'],
    backendApis: ['/api/accounting/core/fixed-assets', '/api/accounting/core/fixed-assets/:id/depreciate'],
    serverLogic: [
      'The list route reads FixedAsset rows sorted by purchase date.',
      'New assets are created through createFixedAsset(), which attaches the fixed-asset, depreciation-expense, and accumulated-depreciation accounts.',
      'Depreciation is posted by runAssetDepreciation() in src/server/services/accountingEngine.ts.',
    ],
    sourceRecords: ['FixedAsset', 'JournalEntry', 'ChartAccount'],
    responsibleScreens: [
      'Accounts > Accounting > Vendors / Assets / Periods',
      'Accounts > Accounting > Vouchers > Journal Voucher',
    ],
  },
  periods: {
    title: 'Financial period report logic',
    manualAnchor: 'accounting-master-report-logic',
    summary: 'Period report shows accounting periods and whether entry locks are active.',
    formulas: ['Closed/locked period status is used by validation checks to flag backdated postings.'],
    dataSources: ['Financial period master'],
    backendApis: ['/api/accounting/core/periods', '/api/accounting/core/periods (POST for lock/unlock)'],
    serverLogic: [
      'The list route calls ensureFinancialPeriod() for all 12 months of the selected year and returns the saved rows.',
      'Lock and unlock updates are handled by setFinancialPeriodLock() and audited in the backend.',
    ],
    sourceRecords: ['FinancialPeriod'],
    responsibleScreens: [
      'Accounts > Accounting > Vendors / Assets / Periods',
      'All accounting entry screens that respect period locks',
    ],
  },
  invoices: {
    title: 'Invoice report logic',
    manualAnchor: 'accounting-transaction-report-logic',
    summary: 'Invoice report lists accounting invoices generated manually or from sales/booking workflows.',
    formulas: ['Balance = invoice total amount minus paid amount.', 'Status is based on posted, partial, paid, draft, or cancelled state.'],
    dataSources: ['Accounting invoice master', 'Invoice-linked payment rows', 'Invoice journal entries'],
    backendApis: ['/api/accounting/core/invoices', '/api/accounting/core/invoices/:id/payments', '/api/accounting/core/invoices/:id/cancel'],
    serverLogic: [
      'Listing reads AccountingInvoice rows filtered by invoiceDate, status, referenceType, and search text.',
      'Invoice creation goes through createInvoice() in src/server/services/accountingEngine.ts, which builds the posting plan, creates the invoice, posts the invoice journal, and may create an immediate or initial payment.',
      'This report tab is read-only and reflects already-created accounting invoices.',
    ],
    sourceRecords: ['AccountingInvoice', 'AccountingPayment', 'JournalEntry'],
    responsibleScreens: [
      'Accounts > Accounting > Invoices & Bills > Invoice Entry',
      'Sales > Orders / Sales Invoice',
      'Service Desk > Generate Invoice',
    ],
  },
  payments: {
    title: 'Payment report logic',
    manualAnchor: 'accounting-transaction-report-logic',
    summary: 'Payment report lists customer/vendor payments posted into books.',
    formulas: ['Payment amount is the saved posted amount by mode and party.', 'Cancelled payments are excluded from final summaries.'],
    dataSources: ['Accounting payment master', 'Invoice balances', 'Payment journal entries'],
    backendApis: ['/api/accounting/core/payments', '/api/accounting/core/invoices/:id/payments'],
    serverLogic: [
      'Listing reads AccountingPayment rows filtered by paymentDate and mode.',
      'recordPayment() in src/server/services/accountingEngine.ts creates the journal, saves the payment row, and updates invoice paid, balance, and status fields.',
    ],
    sourceRecords: ['AccountingPayment', 'AccountingInvoice', 'JournalEntry'],
    responsibleScreens: [
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > Vouchers > Receipt Voucher',
      'Accounts > Accounting > Vouchers > Payment Voucher',
      'Sales > Orders / Sales Invoice',
      'Accounts > Settlements',
    ],
  },
  journals: {
    title: 'Journal console logic',
    manualAnchor: 'accounting-transaction-report-logic',
    summary: 'Journal console shows posted journal entries, line details, and safe manual-journal revision history.',
    formulas: [
      'Journal total equals total debit and total credit for the entry.',
      'Manual journal edit is implemented as reversal of the old entry plus creation of a replacement entry.',
    ],
    dataSources: ['Journal entry headers', 'Journal lines', 'Source workflow metadata carried into journal metadata'],
    backendApis: [
      '/api/accounting/core/journal-entries',
      '/api/accounting/core/journal-entries/:id',
      '/api/accounting/core/journal-entries/:id/cancel',
      '/api/accounting/core/journal-entries/:id (PUT revision)',
    ],
    serverLogic: [
      'Header list reads JournalEntry rows filtered by entryDate, referenceType, and status.',
      'Detail view loads the JournalEntry plus JournalLine rows and edit/cancel capabilities.',
      'Console revision reverses the original entry through cancelJournalEntry() and creates a replacement entry through createJournalEntry().',
    ],
    sourceRecords: ['JournalEntry', 'JournalLine', 'workflow metadata from invoices, payments, purchases, payroll, inventory, treasury, and manual journals'],
    responsibleScreens: [
      'Accounts > Accounting > Vouchers > Journal Voucher',
      'Accounts > Accounting > Invoices & Bills',
      'Accounts > Accounting > Salary & Contract Entry',
      'Accounts > Accounting > Vouchers',
      'Sales > Orders / Sales Invoice',
      'Purchase / stock receipt and bill posting flows',
    ],
  },
  vouchers: {
    title: 'Voucher report logic',
    manualAnchor: 'accounting-transaction-report-logic',
    summary: 'Voucher report lists receipt, payment, journal, and transfer vouchers.',
    formulas: ['Voucher total is the saved voucher amount.', 'Balanced vouchers must have equal debit and credit lines.'],
    dataSources: ['Accounting voucher master', 'Linked ledger postings', 'Voucher metadata such as print state and counterparty'],
    backendApis: ['/api/accounting/vouchers', '/api/accounting/vouchers/:id'],
    serverLogic: [
      'Listing reads AccountingVoucher rows filtered by voucherDate and voucherType.',
      'Voucher creation and edit flows use buildVoucherLedgerPayload() and voucher posting helpers in src/server/routes/accounting.ts.',
      'This report shows voucher documents, not JournalEntry headers from the core journal engine.',
    ],
    sourceRecords: ['AccountingVoucher', 'AccountLedgerEntry'],
    responsibleScreens: [
      'Accounts > Accounting > Vouchers > Receipt Voucher',
      'Accounts > Accounting > Vouchers > Payment Voucher',
      'Accounts > Accounting > Vouchers > Journal Voucher',
      'Accounts > Accounting > Vouchers > Cash-Bank Transfer',
    ],
  },
  salary: {
    title: 'Salary report logic',
    manualAnchor: 'accounting-payroll-report-logic',
    summary: 'Salary report shows payroll payments including gross salary, deductions, net pay, employer contributions, and payroll cost.',
    formulas: ['Net Pay = Gross Salary - statutory deductions - voluntary deductions.', 'Total Payroll Cost = Gross Salary + employer payroll taxes + benefits expense.'],
    dataSources: ['Salary payment master', 'Employee/payroll source data', 'Salary ledger postings and treasury route selection'],
    backendApis: ['/api/accounting/salary'],
    serverLogic: [
      'Listing reads SalaryPayment rows filtered by payDate and optionally month.',
      'Create and update salary flows calculate payroll components, select the treasury route, and post salary component ledger rows through backend accounting helpers.',
    ],
    sourceRecords: ['SalaryPayment', 'AccountLedgerEntry', 'ChartAccount', 'treasury route metadata'],
    responsibleScreens: [
      'Accounts > Accounting > Salary & Contract Entry > Salary Entry',
      'People > Employees / Payroll source data',
    ],
  },
  contracts: {
    title: 'Contract report logic',
    manualAnchor: 'accounting-payroll-report-logic',
    summary: 'Contract report lists contractor payments and related TDS/accounting status.',
    formulas: ['Contract expense = posted contractor payment amount.', 'TDS is calculated from applicable section/rate where enabled.'],
    dataSources: ['Contract payment master', 'TDS settings and transactions', 'Ledger postings for contract payouts'],
    backendApis: ['/api/accounting/contracts'],
    serverLogic: [
      'Listing reads ContractPayment rows filtered by paymentDate and status.',
      'Create contract payment logic resolves gross, net, and TDS amounts, saves the contract row, and posts contract expense, bank/cash, and TDS payable ledger entries when status is paid or partial.',
    ],
    sourceRecords: ['ContractPayment', 'AccountLedgerEntry', 'ChartAccount', 'TDS configuration'],
    responsibleScreens: [
      'Accounts > Accounting > Salary & Contract Entry > Contract Entry',
      'Accounts > Accounting > Vendors / Assets / Periods',
      'Accounts > Accounting > TDS Compliance',
    ],
  },
  daybook: {
    title: 'Day book report logic',
    manualAnchor: 'accounting-book-report-logic',
    summary: 'Day Book is the chronological register of manual income/expense entries and operational accounting movement.',
    formulas: ['Income entries increase income totals.', 'Expense entries increase expense totals.', 'Payment mode decides cash or bank book impact.'],
    dataSources: ['Manual day-book entries with active status'],
    backendApis: ['/api/accounting/day-book/entries'],
    serverLogic: [
      'Listing filters DayBookEntry by active status, entryType, category, paymentMethod, and entryDate.',
      'Totals are computed in the route from the fetched result set before the response is returned.',
      'This report tab does not use the separate consolidated /api/accounting/day-book endpoint.',
    ],
    sourceRecords: ['DayBookEntry'],
    responsibleScreens: [
      'Accounts > Accounting > Income & Expense Entry',
      'Accounts > Accounting > Accounting Reports > Day Book',
    ],
  },
  cash_entries: {
    title: 'Cash book report logic',
    manualAnchor: 'accounting-book-report-logic',
    summary: 'Cash book shows only entries that affect cash-in-hand accounts.',
    formulas: ['Cash closing = opening cash + cash inflows - cash outflows.'],
    dataSources: ['Cash-account ledger rows', 'Sales', 'Returns', 'Salary payments', 'Contract payments', 'Day-book entries', 'Receipt vouchers'],
    backendApis: ['/api/accounting/books/cash'],
    serverLogic: [
      'The route calls buildBookReport("cash") in src/server/routes/accounting.ts.',
      'buildBookReport() uses collectBookOpeningBalance() and collectBookEvents() to merge posted ledger movement with non-posted operational fallback rows while avoiding duplicates through posted reference tracking.',
      'Rows linked to vouchers or journals expose managementType and managementId so the UI can open the source record.',
    ],
    sourceRecords: ['AccountLedgerEntry', 'ChartAccount', 'Sale', 'Return', 'SalaryPayment', 'ContractPayment', 'DayBookEntry', 'ReceiptVoucher'],
    responsibleScreens: [
      'Accounts > Accounting > Cash & Bank Book > Cash Entries',
      'Accounts > Accounting > Vouchers > Receipt Voucher',
      'Accounts > Accounting > Vouchers > Payment Voucher',
      'Sales > Orders / Sales Invoice',
      'Accounts > Accounting > Income & Expense Entry',
    ],
  },
  bank_entries: {
    title: 'Bank book report logic',
    manualAnchor: 'accounting-book-report-logic',
    summary: 'Bank book shows only entries that affect bank accounts.',
    formulas: ['Bank closing = opening bank balance + bank inflows - bank outflows.'],
    dataSources: ['Bank-account ledger rows', 'Sales', 'Returns', 'Salary payments', 'Contract payments', 'Day-book entries', 'Receipt vouchers', 'Bank reconciliation flags'],
    backendApis: ['/api/accounting/books/bank'],
    serverLogic: [
      'The route calls buildBookReport("bank") and then separately queries unreconciled bank AccountLedgerEntry rows to populate reconciliationPending.',
      'collectBookEvents() merges posted ledger movement with fallback operational rows while skipping duplicates based on voucher number, reference number, or source id.',
    ],
    sourceRecords: ['AccountLedgerEntry', 'ChartAccount', 'Sale', 'Return', 'SalaryPayment', 'ContractPayment', 'DayBookEntry', 'ReceiptVoucher'],
    responsibleScreens: [
      'Accounts > Accounting > Cash & Bank Book > Bank Entries',
      'Accounts > Accounting > Treasury & Banks',
      'Accounts > Accounting > Vouchers > Receipt Voucher',
      'Accounts > Accounting > Vouchers > Payment Voucher',
      'Accounts > Accounting > Vouchers > Cash-Bank Transfer',
      'Sales > Orders / Sales Invoice',
    ],
  },
};

const cleanTooltipTitle = (value: string): string => String(value || '').replace(/\s+logic$/i, '').trim();

const uniqueTooltipItems = (items: string[] = []): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const text = String(item || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(text);
  }
  return next;
};

const buildLogicTooltip = (logic: AccountingLogicDefinition): React.ReactNode => {
  const renderBulletList = (items: string[], tone: 'violet' | 'cyan' | 'amber') => (
    <ul className="mt-2 space-y-1.5 text-[11.5px] leading-[18px] text-slate-100">
      {items.map((item) => (
        <li key={`${logic.title}-${item}`} className="flex items-start gap-2 rounded-xl border border-white/8 bg-slate-950/18 px-2.5 py-1.5">
          <span
            className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
              tone === 'violet' ? 'bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.65)]' :
              tone === 'cyan' ? 'bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.65)]' :
              'bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.65)]'
            }`}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );

  const tooltipTitle = cleanTooltipTitle(logic.title);
  const formulas = uniqueTooltipItems(logic.formulas || []);
  const dataSources = uniqueTooltipItems(logic.dataSources || []);
  const responsibleScreens = uniqueTooltipItems(logic.responsibleScreens || []);

  return (
    <div className="max-h-[76vh] w-[min(760px,calc(100vw-24px))] overflow-y-auto rounded-[24px] border border-cyan-300/18 bg-[linear-gradient(180deg,rgba(8,15,40,0.98),rgba(15,23,42,0.96))] p-3 text-[12px] leading-5 text-slate-100 shadow-[0_28px_70px_rgba(7,12,30,0.58)]">
      <div className="rounded-[20px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(34,211,238,0.20),rgba(129,140,248,0.16),rgba(251,191,36,0.10))] px-3.5 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">Quick Report Guide</p>
            <h3 className="mt-1 text-base font-semibold text-white">{tooltipTitle}</h3>
          </div>
          <span className="rounded-full border border-white/12 bg-slate-950/30 px-3 py-1 text-[11px] font-semibold text-cyan-100">
            Easy to read
          </span>
        </div>
        <p className="mt-2.5 text-[12px] leading-5 text-slate-100/92">{logic.summary}</p>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <section className="rounded-[18px] border border-violet-300/20 bg-violet-400/10 p-3">
          <p className="text-sm font-semibold text-white">What you can check here</p>
          <p className="mt-1 text-[11px] leading-[17px] text-violet-100/80">Use this tab when you want to confirm these key numbers or balances.</p>
          {renderBulletList(formulas, 'violet')}
        </section>

        <section className="rounded-[18px] border border-cyan-300/20 bg-cyan-400/10 p-3">
          <p className="text-sm font-semibold text-white">Where the numbers come from</p>
          <p className="mt-1 text-[11px] leading-[17px] text-cyan-100/80">The report checks these saved business records and totals.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {dataSources.map((item) => (
              <span
                key={`${logic.title}-data-${item}`}
                className="rounded-full border border-cyan-200/18 bg-slate-950/24 px-2.5 py-1 text-[10.5px] font-medium leading-4 text-cyan-50"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>

      {responsibleScreens.length ? (
        <section className="mt-2.5 rounded-[18px] border border-amber-300/20 bg-amber-400/10 p-3">
          <p className="text-sm font-semibold text-white">Which screens affect this report</p>
          <p className="mt-1 text-[11px] leading-[17px] text-amber-100/80">If something looks wrong here, check these screens first.</p>
          {renderBulletList(responsibleScreens, 'amber')}
        </section>
      ) : null}
    </div>
  );
};

const AccountingLogicHelpCard: React.FC<{
  logic: AccountingLogicDefinition;
  compact?: boolean;
  helpLabel?: string;
  variant?: 'inline' | 'drawer';
  triggerLabel?: string;
  showManualLink?: boolean;
}> = ({ compact = false, helpLabel = 'Open full help', logic, variant = 'inline', triggerLabel, showManualLink = true }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEscapeKey(() => setIsDrawerOpen(false), { enabled: isDrawerOpen });

  if (variant === 'drawer') {
    return (
      <>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-400/15 hover:text-white"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/30 text-[11px]">?</span>
            <span>{triggerLabel || logic.title}</span>
          </button>
        </div>

        {isDrawerOpen && (
          <div className="fixed inset-0 z-[90]">
            <button
              type="button"
              aria-label="Close logic drawer"
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
              onClick={() => setIsDrawerOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label={logic.title}
              className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-cyan-300/20 bg-slate-950/95 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">Accounting Help</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{logic.title}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-gray-200 transition hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="space-y-5 px-5 py-5 text-sm">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-cyan-50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">How this section is calculated</p>
                    {showManualLink && (
                      <ManualHelpLink
                        anchor={logic.manualAnchor}
                        label={helpLabel}
                        className="bg-slate-950/30 px-2.5 py-1 text-[11px]"
                      />
                    )}
                  </div>
                  <p className="mt-3 text-cyan-50/85">{logic.summary}</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Formula / Logic</p>
                  <ul className="mt-3 space-y-2 text-gray-200">
                    {logic.formulas.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Data Used</p>
                  <ul className="mt-3 space-y-2 text-gray-200">
                    {logic.dataSources.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>

                {logic.responsibleScreens?.length ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Responsible Screens</p>
                    <ul className="mt-3 space-y-2 text-gray-200">
                      {logic.responsibleScreens.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        )}
      </>
    );
  }

  return (
    <details
      className={`rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-50 ${
        compact ? 'px-4 py-2.5 text-sm' : 'p-4 text-sm'
      }`}
    >
      <summary className={`flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 ${compact ? 'text-sm font-semibold' : 'font-semibold'}`}>
        <span>{logic.title}</span>
        {showManualLink && (
          <ManualHelpLink
            anchor={logic.manualAnchor}
            label={helpLabel}
            className={compact ? 'bg-slate-950/30 px-2.5 py-1 text-[11px]' : 'bg-slate-950/30'}
          />
        )}
      </summary>
      <p className="mt-3 text-cyan-50/85">{logic.summary}</p>
      <div className={`mt-3 grid gap-3 ${logic.responsibleScreens?.length ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Formula / Logic</p>
          <ul className="mt-2 space-y-1 text-cyan-50/85">
            {logic.formulas.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Data Used</p>
          <ul className="mt-2 space-y-1 text-cyan-50/85">
            {logic.dataSources.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        {logic.responsibleScreens?.length ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Responsible Screens</p>
            <ul className="mt-2 space-y-1 text-cyan-50/85">
              {logic.responsibleScreens.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
};
const tdsReportDefinitions: Record<TdsReportTabKey, TdsReportDefinition> = {
  computation: {
    title: 'TDS Computation Report',
    itemLabel: 'TDS sections',
    searchPlaceholder: 'Search by section, form, or nature of payment',
    exportSlug: 'tds-computation',
    dataPath: ['compliance', 'tdsComputation'],
    filters: [{ key: 'formType', label: 'Return Form' }, { key: 'dueStatus', label: 'Due Status' }],
    fields: [
      { key: 'sectionCode', header: 'Section' },
      { key: 'formType', header: 'Return' },
      { key: 'natureOfPayment', header: 'Nature of Payment' },
      { key: 'transactionCount', header: 'Txns', kind: 'number' },
      { key: 'partyCount', header: 'Parties', kind: 'number' },
      { key: 'taxableAmount', header: 'Taxable', kind: 'money' },
      { key: 'tdsDeducted', header: 'TDS Deducted', kind: 'money' },
      { key: 'tdsPaid', header: 'Deposited', kind: 'money' },
      { key: 'tdsPending', header: 'Payable', kind: 'money' },
      { key: 'overdueAmount', header: 'Overdue', kind: 'money' },
      { key: 'dueStatus', header: 'Status' },
    ],
  },
  payables: {
    title: 'TDS Payables Report',
    itemLabel: 'payable sections',
    searchPlaceholder: 'Search payables by section, form, or nature',
    exportSlug: 'tds-payables',
    dataPath: ['compliance', 'tdsPayables'],
    filters: [{ key: 'status', label: 'Status' }, { key: 'formType', label: 'Return Form' }],
    fields: [
      { key: 'sectionCode', header: 'Section' },
      { key: 'formType', header: 'Return' },
      { key: 'natureOfPayment', header: 'Nature of Payment' },
      { key: 'pendingTransactions', header: 'Pending Txns', kind: 'number' },
      { key: 'outstandingAmount', header: 'Outstanding', kind: 'money' },
      { key: 'overdueAmount', header: 'Overdue', kind: 'money' },
      { key: 'earliestDueDate', header: 'Earliest Due', kind: 'date' },
      { key: 'status', header: 'Status' },
    ],
  },
  outstanding: {
    title: 'TDS Outstanding Report',
    itemLabel: 'outstanding deductions',
    searchPlaceholder: 'Search by deductee, PAN, section, reference, or residency',
    exportSlug: 'tds-outstanding',
    dataPath: ['compliance', 'tdsOutstanding'],
    filters: [{ key: 'sectionCode', label: 'Section' }, { key: 'residentialStatus', label: 'Residency' }, { key: 'status', label: 'Status' }],
    fields: [
      { key: 'transactionDate', header: 'Date', kind: 'date' },
      { key: 'dueDate', header: 'Due Date', kind: 'date' },
      { key: 'deducteeName', header: 'Deductee' },
      { key: 'pan', header: 'PAN' },
      { key: 'residentialStatus', header: 'Residency' },
      { key: 'sectionCode', header: 'Section' },
      { key: 'referenceNo', header: 'Reference' },
      { key: 'tdsAmount', header: 'TDS', kind: 'money' },
      { key: 'paidAmount', header: 'Paid', kind: 'money' },
      { key: 'balanceAmount', header: 'Balance', kind: 'money' },
      { key: 'status', header: 'Status' },
    ],
  },
  returns: {
    title: 'Quarterly TDS Returns',
    itemLabel: 'return periods',
    searchPlaceholder: 'Search Form 24Q, 26Q, 27Q, or 27EQ',
    exportSlug: 'tds-quarterly-returns',
    dataPath: ['statutory', 'quarterlyReturns'],
    filters: [{ key: 'formType', label: 'Form' }, { key: 'quarter', label: 'Quarter' }, { key: 'status', label: 'Status', kind: 'upper' }],
    fields: [
      { key: 'formType', header: 'Form' },
      { key: 'financialYear', header: 'FY' },
      { key: 'quarter', header: 'Quarter' },
      { key: 'reportName', header: 'Report' },
      { key: 'transactionCount', header: 'Rows', kind: 'number' },
      { key: 'taxableAmount', header: 'Taxable', kind: 'money' },
      { key: 'tdsAmount', header: 'TDS', kind: 'money' },
      { key: 'generatedDrafts', header: 'Drafts', kind: 'number' },
      { key: 'status', header: 'Status', kind: 'upper' },
      { key: 'fvuValidationStatus', header: 'FVU', kind: 'upper' },
      { key: 'acknowledgementNo', header: 'Ack No.' },
      { key: 'fileName', header: 'File' },
    ],
  },
  certificates: {
    title: 'TDS Certificates',
    itemLabel: 'certificates',
    searchPlaceholder: 'Search Form 16, Form 16A, Form 27D, deductee, PAN, or certificate number',
    exportSlug: 'tds-certificates',
    dataPath: ['statutory', 'certificates'],
    filters: [{ key: 'formType', label: 'Form' }, { key: 'status', label: 'Status' }],
    fields: [
      { key: 'formType', header: 'Form' },
      { key: 'period', header: 'Period', kind: 'period' },
      { key: 'deducteeName', header: 'Deductee' },
      { key: 'pan', header: 'PAN' },
      { key: 'certificateNumber', header: 'Certificate No.' },
      { key: 'transactionCount', header: 'Txns', kind: 'number' },
      { key: 'status', header: 'Status' },
      { key: 'emailedTo', header: 'Emailed To' },
      { key: 'createdAt', header: 'Created', kind: 'date' },
    ],
  },
  reconciliation: {
    title: 'Form 26AS / AIS Reconciliation',
    itemLabel: 'reconciliation runs',
    searchPlaceholder: 'Search reconciliation source, quarter, or notes',
    exportSlug: 'tds-reconciliation',
    dataPath: ['reconciliation', 'runs'],
    filters: [{ key: 'sourceType', label: 'Source', kind: 'upper' }, { key: 'quarter', label: 'Quarter' }],
    fields: [
      { key: 'createdAt', header: 'Run Date', kind: 'date' },
      { key: 'sourceType', header: 'Source', kind: 'upper' },
      { key: 'period', header: 'Period', kind: 'period' },
      { key: 'importedRows', header: 'Imported', kind: 'number' },
      { key: 'booksRows', header: 'Books', kind: 'number' },
      { key: 'matchedRows', header: 'Matched', kind: 'number' },
      { key: 'mismatchRows', header: 'Mismatches', kind: 'number' },
      { key: 'missingInBooks', header: 'Missing Books', kind: 'number' },
      { key: 'missingInImport', header: 'Missing Import', kind: 'number' },
      { key: 'notes', header: 'Notes' },
    ],
  },
  mismatches: {
    title: 'TDS Mismatch Report',
    itemLabel: 'mismatch rows',
    searchPlaceholder: 'Search mismatches by source, type, reference, or PAN',
    exportSlug: 'tds-mismatches',
    dataPath: ['reconciliation', 'mismatches'],
    filters: [{ key: 'sourceType', label: 'Source', kind: 'upper' }, { key: 'mismatchType', label: 'Type', kind: 'upper' }],
    fields: [
      { key: 'createdAt', header: 'Run Date', kind: 'date' },
      { key: 'sourceType', header: 'Source', kind: 'upper' },
      { key: 'mismatchType', header: 'Type', kind: 'upper' },
      { key: 'referenceNo', header: 'Reference' },
      { key: 'pan', header: 'PAN' },
      { key: 'bookAmount', header: 'Books', kind: 'money' },
      { key: 'importAmount', header: 'Import', kind: 'money' },
      { key: 'difference', header: 'Difference', kind: 'money' },
      { key: 'notes', header: 'Notes' },
    ],
  },
  challans: {
    title: 'Challan Status Report',
    itemLabel: 'challans',
    searchPlaceholder: 'Search by CIN, BSR, challan serial, bank, or section',
    exportSlug: 'tds-challan-status',
    dataPath: ['challans', 'status'],
    filters: [{ key: 'sectionCode', label: 'Section' }, { key: 'status', label: 'Status' }, { key: 'consumptionStatus', label: 'Consumption' }],
    fields: [
      { key: 'paymentDate', header: 'Payment Date', kind: 'date' },
      { key: 'period', header: 'Period', kind: 'period' },
      { key: 'sectionCode', header: 'Section' },
      { key: 'challanSerialNo', header: 'Challan No.' },
      { key: 'bsrCode', header: 'BSR' },
      { key: 'cin', header: 'CIN' },
      { key: 'bankName', header: 'Bank' },
      { key: 'amount', header: 'Amount', kind: 'money' },
      { key: 'allocatedAmount', header: 'Allocated', kind: 'money' },
      { key: 'unallocatedAmount', header: 'Unallocated', kind: 'money' },
      { key: 'consumptionStatus', header: 'Consumption' },
      { key: 'status', header: 'Status' },
    ],
  },
  payment_register: {
    title: 'TDS Payment Register',
    itemLabel: 'payments',
    searchPlaceholder: 'Search payment register by CIN, BSR, serial, bank, or section',
    exportSlug: 'tds-payment-register',
    dataPath: ['challans', 'paymentRegister'],
    filters: [{ key: 'sectionCode', label: 'Section' }, { key: 'status', label: 'Status' }, { key: 'consumptionStatus', label: 'Consumption' }],
    fields: [
      { key: 'paymentDate', header: 'Payment Date', kind: 'date' },
      { key: 'period', header: 'Period', kind: 'period' },
      { key: 'sectionCode', header: 'Section' },
      { key: 'challanSerialNo', header: 'Challan No.' },
      { key: 'bsrCode', header: 'BSR' },
      { key: 'cin', header: 'CIN' },
      { key: 'bankName', header: 'Bank' },
      { key: 'amount', header: 'Amount', kind: 'money' },
      { key: 'allocatedAmount', header: 'Allocated', kind: 'money' },
      { key: 'unallocatedAmount', header: 'Unallocated', kind: 'money' },
      { key: 'status', header: 'Status' },
    ],
  },
  corrections: {
    title: 'Correction Return Report',
    itemLabel: 'correction returns',
    searchPlaceholder: 'Search by form, token, acknowledgement, or status',
    exportSlug: 'tds-correction-returns',
    dataPath: ['audit', 'correctionReturns'],
    filters: [{ key: 'formType', label: 'Form' }, { key: 'status', label: 'Status' }],
    fields: [
      { key: 'formType', header: 'Form' },
      { key: 'financialYear', header: 'FY' },
      { key: 'quarter', header: 'Quarter' },
      { key: 'status', header: 'Status' },
      { key: 'originalTokenNo', header: 'Original Token' },
      { key: 'correctionTokenNo', header: 'Correction Token' },
      { key: 'acknowledgementNo', header: 'Ack No.' },
      { key: 'updatedAt', header: 'Updated', kind: 'date' },
      { key: 'notes', header: 'Notes' },
    ],
  },
  audit_trail: {
    title: 'TDS Audit Trail Report',
    itemLabel: 'audit events',
    searchPlaceholder: 'Search by action, entity, reference, user, or store',
    exportSlug: 'tds-audit-trail',
    dataPath: ['audit', 'auditTrail'],
    filters: [{ key: 'action', label: 'Action' }, { key: 'entityType', label: 'Entity' }],
    fields: [
      { key: 'createdAt', header: 'Date', kind: 'date' },
      { key: 'action', header: 'Action' },
      { key: 'entityType', header: 'Entity' },
      { key: 'referenceNo', header: 'Reference' },
      { key: 'userId', header: 'User' },
      { key: 'storeKey', header: 'Store' },
      { key: 'details', header: 'Details' },
    ],
  },
  tax_audit_34a: {
    title: 'Tax Audit Report - Clause 34(a)',
    itemLabel: 'tax audit rows',
    searchPlaceholder: 'Search by section, form, or nature',
    exportSlug: 'tds-tax-audit-clause-34a',
    dataPath: ['audit', 'taxAuditClause34'],
    filters: [{ key: 'formType', label: 'Return Form' }, { key: 'sectionCode', label: 'Section' }],
    fields: [
      { key: 'sectionCode', header: 'Section' },
      { key: 'returnSectionCode', header: 'Return Code' },
      { key: 'natureOfPayment', header: 'Nature of Payment' },
      { key: 'formType', header: 'Form' },
      { key: 'amountPaidOrCredited', header: 'Amount Paid/Credited', kind: 'money' },
      { key: 'taxDeductible', header: 'Tax Deductible', kind: 'money' },
      { key: 'taxDeducted', header: 'Tax Deducted', kind: 'money' },
      { key: 'taxPaid', header: 'Tax Paid', kind: 'money' },
      { key: 'taxPayable', header: 'Tax Payable', kind: 'money' },
      { key: 'amountNotDeducted', header: 'Not Deducted Base', kind: 'money' },
      { key: 'remarks', header: 'Remarks' },
    ],
  },
};

const readTdsPath = (source: any, path: string[]) =>
  path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source);

const formatTdsReportDate = (value: unknown) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN');
};

const getTdsReportCellValue = (row: any, field: TdsReportField): unknown => {
  if (field.kind === 'period') return `${row.financialYear || ''} ${row.quarter || ''}`.trim();
  return row[field.key];
};

const renderTdsReportCell = (row: any, field: TdsReportField) => {
  const value = getTdsReportCellValue(row, field);
  if (field.kind === 'money') return formatCurrency(Number(value || 0));
  if (field.kind === 'number') return Number(value || 0);
  if (field.kind === 'date') return formatTdsReportDate(value);
  if (field.kind === 'upper') return String(value || field.empty || '-').replace(/_/g, ' ').toUpperCase();
  const text = String(value ?? '').trim();
  return text || field.empty || '-';
};

const exportTdsReportCell = (row: any, field: TdsReportField) => {
  const value = getTdsReportCellValue(row, field);
  if (field.kind === 'money' || field.kind === 'number') return Number(value || 0);
  if (field.kind === 'date') return value ? String(value).slice(0, 10) : '';
  if (field.kind === 'upper') return String(value || '').replace(/_/g, ' ').toUpperCase();
  return String(value ?? '').trim();
};

const sortTdsReportCell = (row: any, field: TdsReportField) => {
  const value = getTdsReportCellValue(row, field);
  if (field.kind === 'money' || field.kind === 'number') return Number(value || 0);
  if (field.kind === 'date') return value || '';
  return String(value ?? '');
};

const isAccountingTabKey = (value: string | null): value is TabKey =>
  Boolean(value && tabs.some((item) => item.key === value));

const isReportsTabKey = (value: string | null): value is ReportsTabKey =>
  Boolean(value && reportsTabs.some((item) => item.key === value));

const isTdsReportTabKey = (value: string | null): value is TdsReportTabKey =>
  Boolean(value && tdsReportTabs.some((item) => item.key === value));

const paymentModes = ['cash', 'bank', 'upi', 'card', 'cheque', 'online', 'bank_transfer'];
const salaryPaymentModes = ['cash', 'bank', 'upi', 'card', 'cheque'];
const paymentModeOptions = paymentModes.map((mode) => ({ value: mode, label: mode.toUpperCase() }));
const salaryPaymentModeOptions = salaryPaymentModes.map((mode) => ({ value: mode, label: mode.toUpperCase() }));
const debitCreditOptions = [
  { value: 'debit', label: 'Debit / Dr' },
  { value: 'credit', label: 'Credit / Cr' },
];
const accountTypeOptions = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];
const accountSubTypeOptions = [
  { value: 'general', label: 'General' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'customer', label: 'Customer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'stock', label: 'Stock' },
];
const vendorDeducteeTypes = [
  { value: 'vendor', label: 'Vendor' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'professional', label: 'Professional / Consultant' },
  { value: 'landlord', label: 'Landlord / Rent' },
  { value: 'other', label: 'Other' },
];
const vendorTdsSections = [
  { value: '194C', label: '194C - Contractor' },
  { value: '194J', label: '194J - Professional Fees' },
  { value: '194I', label: '194I - Rent' },
  { value: '194-IB', label: '194-IB - Residential Rent' },
  { value: '194B', label: '194B - Prize / Winnings' },
  { value: '194Q', label: '194Q - Purchase of Goods' },
  { value: '192', label: '192 - Salary' },
];

const createSalaryFormState = () => ({
  employeeId: '',
  employeeName: '',
  designation: '',
  month: new Date().toISOString().slice(0, 7),
  payDate: new Date().toISOString().slice(0, 10),
  amount: '',
  bonusAmount: '',
  grossSalary: '',
  employeePf: '',
  employeeEsi: '',
  professionalTax: '',
  tdsAmount: '',
  statutoryDeductions: '',
  retirementContribution: '',
  insurancePremium: '',
  otherDeductions: '',
  voluntaryDeductions: '',
  employerPf: '',
  employerEsi: '',
  employerPayrollTaxes: '',
  benefitsExpense: '',
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
  entryMode: 'expense',
  category: 'General Expense',
  referenceNo: '',
  accountName: '',
  beingPaymentOf: '',
  forPeriod: '',
  receivedBy: '',
  authorizedBy: '',
  debitAccountId: '',
  linkedEntityType: '',
  linkedEntityId: '',
  linkedEntityNumber: '',
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
  groupId: '',
  contact: '',
  phone: '',
  alternatePhone: '',
  email: '',
  gstin: '',
  pan: '',
  address: '',
  isTdsApplicable: true,
  deducteeType: 'vendor',
  tdsSectionCode: '',
  tdsRate: '',
  openingBalance: '',
  openingSide: 'credit',
});

const createGroupFormState = () => ({
  groupName: '',
  groupCode: '',
  under: 'asset',
  parentGroupId: '',
  isActive: true,
});

const createLedgerFormState = () => ({
  accountCode: '',
  accountName: '',
  groupId: '',
  subType: 'general',
  gstNumber: '',
  panNumber: '',
  openingBalance: '',
  openingSide: 'debit',
  isActive: true,
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

const trialBalanceSectionOrder: TrialBalanceSection[] = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses', 'Diagnostics'];

const roundMoney = (value: unknown) => Number(Number(value || 0).toFixed(2));

const normalizeSearchText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const inferTrialBalanceSection = (row: any): TrialBalanceSection => {
  const normalizeSection = (value: unknown): TrialBalanceSection | null => {
    const normalized = normalizeSearchText(value);
    if (!normalized) return null;
    if (normalized === 'asset' || normalized === 'assets') return 'Assets';
    if (normalized === 'liability' || normalized === 'liabilities') return 'Liabilities';
    if (normalized === 'equity' || normalized === 'capital') return 'Equity';
    if (normalized === 'income' || normalized === 'revenue') return 'Income';
    if (normalized === 'expense' || normalized === 'expenses') return 'Expenses';
    if (normalized === 'diagnostic' || normalized === 'diagnostics') return 'Diagnostics';
    return null;
  };

  const directSection = normalizeSection(row?.section) || normalizeSection(row?.reportHead);
  if (directSection) return directSection;

  const accountTypeSection = normalizeSection(row?.accountType) || normalizeSection(row?.under);
  if (accountTypeSection) return accountTypeSection;

  const hints = normalizeSearchText([
    row?.reportGroup,
    row?.groupName,
    row?.parentGroupName,
    row?.ledgerLabel,
    row?.accountName,
    row?.accountCode,
  ].filter(Boolean).join(' '));

  if (!hints) return 'Assets';
  if (/diagnostic|difference|integrity|imbalance|warning/.test(hints)) return 'Diagnostics';
  if (/equity|capital|retained earnings|opening balance equity|reserve/.test(hints)) return 'Equity';
  if (/income|revenue|sales|booking|service|other income/.test(hints)) return 'Income';
  if (/expense|expenses|cogs|cost of goods|salary|contract|payroll|depreciation|stock loss|adjustment/.test(hints)) return 'Expenses';
  if (/liabilit|payable|creditor|loan|duties|tax payable|gst payable|vendor/.test(hints)) return 'Liabilities';
  if (/asset|cash|bank|stock|inventory|receivable|debtor|deposit|advance|fixed asset|current asset|input gst/.test(hints)) return 'Assets';
  return 'Assets';
};

export const Accounting: React.FC = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [collapsedAccountingGroups, setCollapsedAccountingGroups] = useState<Set<string>>(
    () => new Set(accountingMenuGroups.map((group) => group.title).filter((title) => title !== 'Overview'))
  );
  const [mastersTab, setMastersTab] = useState<MastersTabKey>('vendors');
  const [invoicesTab, setInvoicesTab] = useState<InvoicesTabKey>('invoice_entry');
  const [paymentsTab, setPaymentsTab] = useState<PaymentsTabKey>('salary_entry');
  const [openingTab, setOpeningTab] = useState<OpeningTabKey>('balances');
  const [expensesTab, setExpensesTab] = useState<ExpensesTabKey>('entry');
  const [vouchersTab, setVouchersTab] = useState<VouchersTabKey>('receipt');
  const [booksTab, setBooksTab] = useState<BooksTabKey>('summary');
  const [ledgerTab, setLedgerTab] = useState<LedgerTabKey>('create_account');
  const [reportsTab, setReportsTab] = useState<ReportsTabKey>('overview');
  const [tdsReportTab, setTdsReportTab] = useState<TdsReportTabKey>('computation');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [editingDaybookId, setEditingDaybookId] = useState<string | null>(null);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<{ id: string; type: Exclude<VouchersTabKey, 'list'> } | null>(null);
  const [editingJournalEntryId, setEditingJournalEntryId] = useState<string | null>(null);
  const [journalEntryDetail, setJournalEntryDetail] = useState<JournalEntryConsoleDetail | null>(null);
  const [journalEditorForm, setJournalEditorForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    referenceNo: '',
    description: '',
  });
  const [journalEditorLines, setJournalEditorLines] = useState<JournalEditorLine[]>([]);

  const [salaryList, setSalaryList] = useState<SalaryPayment[]>([]);
  const [contractList, setContractList] = useState<ContractPayment[]>([]);
  const [daybookRows, setDaybookRows] = useState<DayBookEntry[]>([]);
  const [voucherRows, setVoucherRows] = useState<VoucherRow[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<ChartAccount[]>([]);
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
  const [trialBalanceSearch, setTrialBalanceSearch] = useState('');
  const [trialBalanceSectionFilter, setTrialBalanceSectionFilter] = useState<'all' | TrialBalanceSection>('all');
  const [trialBalanceGroupFilter, setTrialBalanceGroupFilter] = useState('all');
  const [trialBalanceAbnormalOnly, setTrialBalanceAbnormalOnly] = useState(false);
  const [showAccountingDiagnostics, setShowAccountingDiagnostics] = useState(false);
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [tdsReport, setTdsReport] = useState<any>(null);
  const [tdsDetailedReports, setTdsDetailedReports] = useState<any>(null);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [coreInvoices, setCoreInvoices] = useState<any[]>([]);
  const [corePayments, setCorePayments] = useState<any[]>([]);
  const [coreJournals, setCoreJournals] = useState<any[]>([]);
  const [supplierPayablesReport, setSupplierPayablesReport] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);
  const [bankCsvText, setBankCsvText] = useState('');
  const [bankImportResult, setBankImportResult] = useState<any>(null);
  const [trialBalanceExporting, setTrialBalanceExporting] = useState<'' | 'csv' | 'xlsx' | 'pdf'>('');
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [treasuryRefreshKey, setTreasuryRefreshKey] = useState(0);
  const isSuperAdmin = currentUserRole === 'super_admin';

  const [dayBookDate, setDayBookDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const monthToDateStart = /^\d{4}-\d{2}-\d{2}$/.test(String(endDate || '')) ? `${String(endDate).slice(0, 7)}-01` : endDate;
  const dashboardRangeLabel = `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`;
  const monthToDateLabel = `${formatShortDate(monthToDateStart)} - ${formatShortDate(endDate)}`;
  const selectedRevenueValue = Number(dashboardSummary?.selectedRevenue ?? dashboardSummary?.todayRevenue ?? 0);
  const monthToDateRevenueValue = Number(dashboardSummary?.monthToDateRevenue ?? dashboardSummary?.monthlyRevenue ?? 0);

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
  const [groupForm, setGroupForm] = useState(createGroupFormState);
  const [ledgerForm, setLedgerForm] = useState(createLedgerFormState);
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

  const moneyValue = (value: unknown) => Math.max(0, Number(value || 0));
  const salaryDerived = useMemo(() => {
    const grossSalary = moneyValue(salaryForm.grossSalary || (Number(salaryForm.amount || 0) + Number(salaryForm.bonusAmount || 0)));
    const knownStatutory = moneyValue(salaryForm.employeePf)
      + moneyValue(salaryForm.employeeEsi)
      + moneyValue(salaryForm.professionalTax)
      + moneyValue(salaryForm.tdsAmount);
    const statutoryDeductions = Math.max(knownStatutory, moneyValue(salaryForm.statutoryDeductions));
    const knownVoluntary = moneyValue(salaryForm.retirementContribution)
      + moneyValue(salaryForm.insurancePremium)
      + moneyValue(salaryForm.otherDeductions);
    const voluntaryDeductions = Math.max(knownVoluntary, moneyValue(salaryForm.voluntaryDeductions));
    const knownEmployerTaxes = moneyValue(salaryForm.employerPf) + moneyValue(salaryForm.employerEsi);
    const employerPayrollTaxes = Math.max(knownEmployerTaxes, moneyValue(salaryForm.employerPayrollTaxes));
    const benefitsExpense = moneyValue(salaryForm.benefitsExpense);
    const totalDeductions = statutoryDeductions + voluntaryDeductions;
    const netPay = Math.max(0, grossSalary - totalDeductions);
    const totalPayrollCost = grossSalary + employerPayrollTaxes + benefitsExpense;

    return {
      grossSalary,
      statutoryDeductions,
      voluntaryDeductions,
      employerPayrollTaxes,
      benefitsExpense,
      totalDeductions,
      netPay,
      totalPayrollCost,
    };
  }, [salaryForm]);

  const cashEntries = cashBook?.entries || [];
  const bankEntries = bankBook?.entries || [];
  const reconciliationPending = bankBook?.reconciliationPending || [];
  const trialBalanceRows = useMemo<TrialBalanceRow[]>(
    () => (Array.isArray(trialBalance?.rows) ? trialBalance.rows : []).map((row: any, index: number) => {
      const resolvedSection = inferTrialBalanceSection(row);
      const resolvedReportHead = inferTrialBalanceSection({ ...row, section: row?.reportHead || row?.section });
      return {
        accountId: String(row?.accountId || `tb-row-${index}`),
        accountCode: String(row?.accountCode || ''),
        accountName: String(row?.accountName || 'Unnamed Account'),
        section: resolvedSection,
        reportHead: resolvedReportHead,
        reportGroup: String(row?.reportGroup || row?.parentGroupName || row?.groupName || row?.reportHead || 'Ungrouped'),
        groupName: String(row?.groupName || ''),
        parentGroupName: String(row?.parentGroupName || ''),
        ledgerLabel: String(row?.ledgerLabel || ''),
        normalBalanceSide: row?.normalBalanceSide === 'credit' ? 'credit' : 'debit',
        abnormalBalance: Boolean(row?.abnormalBalance),
        isSubLedger: Boolean(row?.isSubLedger),
        debitBalance: roundMoney(row?.debitBalance || 0),
        creditBalance: roundMoney(row?.creditBalance || 0),
      };
    }),
    [trialBalance]
  );
  const trialBalanceSectionOptions = useMemo(() => {
    const preferred: TrialBalanceSection[] = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
    if (trialBalanceRows.some((row) => row.section === 'Diagnostics')) preferred.push('Diagnostics');
    return preferred.filter((section, index) => preferred.indexOf(section) === index);
  }, [trialBalanceRows]);
  const trialBalanceGroupOptions = useMemo(() => {
    const baseRows = trialBalanceSectionFilter === 'all'
      ? trialBalanceRows
      : trialBalanceRows.filter((row) => row.section === trialBalanceSectionFilter);
    return Array.from(
      new Set(
        baseRows
          .map((row) => String(row.reportGroup || row.parentGroupName || row.groupName || '').trim())
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));
  }, [trialBalanceRows, trialBalanceSectionFilter]);
  const trialBalanceFilteredRows = useMemo(() => {
    const query = normalizeSearchText(trialBalanceSearch);
    return trialBalanceRows.filter((row) => {
      if (trialBalanceSectionFilter !== 'all' && row.section !== trialBalanceSectionFilter) return false;
      if (trialBalanceGroupFilter !== 'all') {
        const groupValue = String(row.reportGroup || row.parentGroupName || row.groupName || '').trim();
        if (groupValue !== trialBalanceGroupFilter) return false;
      }
      if (trialBalanceAbnormalOnly && !row.abnormalBalance) return false;
      if (!query) return true;
      const searchable = [
        row.accountCode,
        row.accountName,
        row.section,
        row.reportGroup,
        row.groupName,
        row.parentGroupName,
        row.ledgerLabel,
      ].join(' ');
      return normalizeSearchText(searchable).includes(query);
    });
  }, [trialBalanceAbnormalOnly, trialBalanceGroupFilter, trialBalanceRows, trialBalanceSearch, trialBalanceSectionFilter]);
  const trialBalanceFilteredTotals = useMemo(
    () => ({
      debit: roundMoney(trialBalanceFilteredRows.reduce((sum, row) => sum + Number(row.debitBalance || 0), 0)),
      credit: roundMoney(trialBalanceFilteredRows.reduce((sum, row) => sum + Number(row.creditBalance || 0), 0)),
    }),
    [trialBalanceFilteredRows]
  );
  const trialBalanceExportRows = useMemo(
    () => trialBalanceFilteredRows.map((row) => ({
      Code: row.accountCode,
      Account: row.accountName,
      Section: row.section,
      Group: row.reportGroup,
      Ledger: row.groupName || '',
      'Ledger Class': row.ledgerLabel || '',
      Debit: row.debitBalance,
      Credit: row.creditBalance,
      'Normal Side': String(row.normalBalanceSide || '').toUpperCase(),
      'Abnormal Balance': row.abnormalBalance ? 'Yes' : 'No',
    })),
    [trialBalanceFilteredRows]
  );
  const trialBalanceSections = useMemo(() => {
    const sectionMap = new Map<string, TrialBalanceRow[]>();
    for (const row of trialBalanceFilteredRows) {
      const key = row.section || 'Assets';
      const bucket = sectionMap.get(key) || [];
      bucket.push(row);
      sectionMap.set(key, bucket);
    }

    return Array.from(sectionMap.entries())
      .sort(
        ([left], [right]) =>
          trialBalanceSectionOrder.indexOf(left as TrialBalanceSection) - trialBalanceSectionOrder.indexOf(right as TrialBalanceSection)
      )
      .map(([section, rows]) => {
        const groupMap = new Map<string, TrialBalanceRow[]>();
        for (const row of rows) {
          const groupKey = String(row.reportGroup || row.parentGroupName || row.groupName || 'Ungrouped').trim() || 'Ungrouped';
          const bucket = groupMap.get(groupKey) || [];
          bucket.push(row);
          groupMap.set(groupKey, bucket);
        }

        const groups = Array.from(groupMap.entries())
          .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
          .map(([groupName, groupRows]) => ({
            groupName,
            rows: [...groupRows].sort((left, right) => {
              const leftGroup = String(left.groupName || '').trim();
              const rightGroup = String(right.groupName || '').trim();
              const groupCompare = leftGroup.localeCompare(rightGroup, undefined, { numeric: true, sensitivity: 'base' });
              if (groupCompare !== 0) return groupCompare;
              const nameCompare = left.accountName.localeCompare(right.accountName, undefined, { sensitivity: 'base' });
              if (nameCompare !== 0) return nameCompare;
              return left.accountCode.localeCompare(right.accountCode, undefined, { numeric: true, sensitivity: 'base' });
            }),
            totals: {
              debit: roundMoney(groupRows.reduce((sum, row) => sum + Number(row.debitBalance || 0), 0)),
              credit: roundMoney(groupRows.reduce((sum, row) => sum + Number(row.creditBalance || 0), 0)),
            },
          }));

        return {
          section,
          rows,
          groups,
          totals: {
            debit: roundMoney(rows.reduce((sum, row) => sum + Number(row.debitBalance || 0), 0)),
            credit: roundMoney(rows.reduce((sum, row) => sum + Number(row.creditBalance || 0), 0)),
          },
        };
      });
  }, [trialBalanceFilteredRows, trialBalanceSectionOrder]);
  const trialBalanceDuplicateNames = useMemo(
    () => (Array.isArray(trialBalance?.diagnostics?.duplicateAccountNames) ? trialBalance.diagnostics.duplicateAccountNames : []),
    [trialBalance]
  );
  const trialBalanceIntegrity = trialBalance?.integrity || null;
  const trialBalanceHasFilters =
    trialBalanceSectionFilter !== 'all'
    || trialBalanceGroupFilter !== 'all'
    || trialBalanceAbnormalOnly
    || normalizeSearchText(trialBalanceSearch).length > 0;
  const vendorGroupOptions = accountGroups.filter((group) => group.isActive !== false && group.under === 'liability');
  const tdsTransactions = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
    return (tdsReport?.transactions || []).filter((row: any) => {
      const timestamp = new Date(row.transactionDate || row.createdAt || 0).getTime();
      if (Number.isNaN(timestamp)) return false;
      return timestamp >= start && timestamp <= end;
    });
  }, [endDate, startDate, tdsReport]);
  const profitLossRows = useMemo(() => {
    if (Array.isArray(profitLoss?.rows) && profitLoss.rows.length > 0) {
      return profitLoss.rows.map((row: any, index: number) => ({
        _id: row._id || `pl-row-${index}`,
        section: row.section || 'Other',
        particulars: row.particulars || row.accountName || 'Ledger line',
        amount: Number(row.amount || 0),
        isTotal: Boolean(row.isTotal),
        isContra: Boolean(row.isContra),
      }));
    }

    return [
      { _id: 'pl-sales-income', section: 'Income', particulars: 'Sales / Service Income', amount: Number(profitLoss?.income?.salesIncome || 0) },
      { _id: 'pl-return-contra', section: 'Income', particulars: 'Less: Sales Returns / Refunds', amount: -Number(profitLoss?.income?.salesReturnContra || 0), isContra: true },
      { _id: 'pl-other-income', section: 'Income', particulars: 'Other Income', amount: Number(profitLoss?.income?.nonSalesIncome || 0) },
      { _id: 'pl-total-income', section: 'Income', particulars: 'Total Income', amount: Number(profitLoss?.income?.totalIncome || 0), isTotal: true },
      { _id: 'pl-cogs-expense', section: 'Expense', particulars: 'Cost of Goods Sold', amount: Number(profitLoss?.expenses?.cogsExpense || 0) },
      { _id: 'pl-salary-expense', section: 'Expense', particulars: 'Salary Expense', amount: Number(profitLoss?.expenses?.salaryExpense || 0) },
      { _id: 'pl-contract-expense', section: 'Expense', particulars: 'Contract Expense', amount: Number(profitLoss?.expenses?.contractExpense || 0) },
      { _id: 'pl-depreciation-expense', section: 'Expense', particulars: 'Depreciation Expense', amount: Number(profitLoss?.expenses?.depreciationExpense || 0) },
      { _id: 'pl-manual-expense', section: 'Expense', particulars: 'Other Ledger / Manual Expense', amount: Number(profitLoss?.expenses?.manualExpense || 0) },
      { _id: 'pl-total-expense', section: 'Expense', particulars: 'Total Expense', amount: Number(profitLoss?.expenses?.totalExpense || 0), isTotal: true },
      {
        _id: 'pl-net-profit',
        section: 'Result',
        particulars: Number(profitLoss?.netProfit || 0) >= 0 ? 'Net Profit' : 'Net Loss',
        amount: Number(profitLoss?.netProfit || 0),
        isTotal: true,
      },
    ];
  }, [profitLoss]);
  const balanceSheetRows = useMemo(
    () => [
      ...(balanceSheet?.assets || []).map((row: any, index: number) => ({
        _id: `asset-${row.accountCode || index}`,
        section: 'Assets',
        accountCode: row.accountCode || '-',
        accountName: row.accountName || 'Asset',
        amount: Number(row.amount || 0),
      })),
      ...(balanceSheet?.liabilities || []).map((row: any, index: number) => ({
        _id: `liability-${row.accountCode || index}`,
        section: 'Liabilities',
        accountCode: row.accountCode || '-',
        accountName: row.accountName || 'Liability',
        amount: Number(row.amount || 0),
      })),
      ...(
        Array.isArray(balanceSheet?.equityRows) && balanceSheet.equityRows.length > 0
          ? balanceSheet.equityRows
          : [{ accountCode: '-', accountName: 'Retained Earnings', amount: Number(balanceSheet?.equity || 0) }]
      ).map((row: any, index: number) => ({
        _id: `equity-${row.accountCode || index}`,
        section: 'Equity',
        accountCode: row.accountCode || '-',
        accountName: row.accountName || 'Equity',
        amount: Number(row.amount || 0),
        diagnostic: Boolean(row.diagnostic),
      })),
    ],
    [balanceSheet]
  );
  const balanceSheetIntegrity = balanceSheet?.integrity || null;
  const recentAccountingActivity = useMemo(() => {
    const rows = [
      ...coreInvoices.map((row: any) => ({
        _id: `invoice-${row._id}`,
        date: row.invoiceDate,
        type: 'Invoice',
        reference: row.invoiceNumber || row.referenceType || '-',
        party: row.customerName || row.vendorName || 'N/A',
        amount: Number(row.totalAmount || 0),
        status: row.status || 'posted',
        effect: deriveActivityEffect({ type: 'invoice', status: row.status }),
        relatedReference: resolveRelatedReference(row.invoiceNumber, row.referenceNo, row.referenceId),
      })),
      ...corePayments.map((row: any) => ({
        _id: `payment-${row._id}`,
        date: row.paymentDate,
        type: 'Payment',
        reference: row.paymentNumber || row.referenceNo || '-',
        party: row.customerName || row.vendorName || 'N/A',
        amount: Number(row.amount || 0),
        status: row.status || 'posted',
        effect: deriveActivityEffect({ type: 'payment', status: row.status }),
        relatedReference: resolveRelatedReference(row.paymentNumber || row.referenceNo, row.invoiceNumber, row.referenceId),
      })),
      ...voucherRows.map((row: any) => ({
        _id: `voucher-${row._id}`,
        date: row.voucherDate,
        type: `Voucher ${String(row.voucherType || '').toUpperCase()}`,
        reference: row.voucherNumber || row.referenceNo || '-',
        party: row.counterpartyName || 'N/A',
        amount: Number(row.totalAmount || 0),
        status: row.isPrinted ? 'printed' : 'saved',
        effect: deriveActivityEffect({ type: 'voucher', status: row.isPrinted ? 'printed' : 'saved' }),
        relatedReference: resolveRelatedReference(row.voucherNumber || row.referenceNo, row.referenceNo, row?.metadata?.linkedEntityNumber),
      })),
      ...coreJournals.map((row: any) => ({
        _id: `journal-${row._id}`,
        date: row.entryDate,
        type: 'Journal',
        reference: row.entryNumber || row.referenceNo || '-',
        party: row.description || row.referenceType || 'N/A',
        amount: Number(row.totalDebit || 0),
        status: row.status || 'posted',
        effect: deriveJournalEffect(row),
        relatedReference: resolveRelatedReference(row.entryNumber || row.referenceNo, row.referenceNo, row?.metadata?.reversalOf, row.referenceId),
      })),
      ...tdsTransactions.map((row: any) => ({
        _id: `tds-${row._id}`,
        date: row.transactionDate,
        type: 'TDS',
        reference: row.referenceNo || row.sectionCode || '-',
        party: row.deducteeName || 'Deductee',
        amount: Number(row.tdsAmount || 0),
        status: row.status || 'deducted',
        effect: deriveActivityEffect({ type: 'tds', status: row.status }),
        relatedReference: resolveRelatedReference(row.referenceNo || row.sectionCode, row.sectionCode),
      })),
    ];
    return rows
      .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())
      .slice(0, 25);
  }, [coreInvoices, coreJournals, corePayments, tdsTransactions, voucherRows]);
  const journalConsoleRows = useMemo(
    () =>
      coreJournals.map((row: any) => ({
        ...row,
        effect: deriveJournalEffect(row),
        relatedReference: resolveRelatedReference(row.entryNumber || row.referenceNo, row.referenceNo, row?.metadata?.reversalOf, row.referenceId),
      })),
    [coreJournals]
  );

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

  function formatShortDate(value?: string | Date) {
    if (!value) return '-';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-IN');
  }

  function normalizeConsoleLabel(value: unknown, fallback = '-') {
    const text = String(value || '').trim();
    if (!text) return fallback;
    return text.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  function resolveLinkedLedgerLabel(row: any) {
    const ledger = row?.ledgerAccountId;
    const code = typeof ledger === 'object' ? String(ledger?.accountCode || '').trim() : String(row?.ledgerAccountCode || '').trim();
    const name = typeof ledger === 'object' ? String(ledger?.accountName || '').trim() : String(row?.ledgerAccountName || '').trim();
    return [code, name].filter(Boolean).join(' - ') || 'Not linked';
  }

  function resolveRelatedReference(primary: unknown, ...candidates: unknown[]) {
    const current = String(primary || '').trim();
    for (const candidate of candidates) {
      const text = String(candidate || '').trim();
      if (text && text !== current) return text;
    }
    return '-';
  }

  function deriveJournalEffect(row: any) {
    const status = String(row?.status || '').trim().toLowerCase();
    const referenceType = String(row?.referenceType || '').trim().toLowerCase();
    const description = String(row?.description || '').trim().toLowerCase();
    if (status.includes('cancel')) return 'Cancelled';
    if (referenceType === 'reversal' || description.startsWith('reversal of')) return 'Reversal';
    if (status === 'draft' || status === 'saved') return 'Draft';
    return 'Posted';
  }

  function deriveActivityEffect(row: any) {
    const status = String(row?.status || '').trim().toLowerCase();
    const type = String(row?.type || '').trim().toLowerCase();
    const party = String(row?.party || '').trim().toLowerCase();
    if (status.includes('cancel')) return 'Cancelled';
    if (party.startsWith('reversal of') || type.includes('reversal')) return 'Reversal';
    if (status === 'saved' || status === 'draft') return 'Draft';
    if (status === 'printed') return 'Ready';
    if (type === 'payment') return 'Settlement';
    if (type === 'invoice' && status === 'paid') return 'Paid';
    if (type === 'invoice' && status === 'posted') return 'Open';
    return 'Posted';
  }

  function toneForBadge(label: unknown): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
    const text = String(label || '').trim().toLowerCase();
    if (!text) return 'neutral';
    if (text.includes('cancel')) return 'danger';
    if (text.includes('reverse')) return 'warning';
    if (text.includes('draft') || text.includes('saved')) return 'warning';
    if (text.includes('ready') || text.includes('open')) return 'info';
    if (text.includes('paid') || text.includes('posted') || text.includes('settlement') || text.includes('printed')) return 'success';
    return 'neutral';
  }

  function renderConsoleBadge(label: unknown, fallback = '-') {
    const text = normalizeConsoleLabel(label, fallback);
    const tone = toneForBadge(text);
    const toneClass =
      tone === 'danger'
        ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
        : tone === 'warning'
          ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
          : tone === 'success'
            ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
            : tone === 'info'
              ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
              : 'border-white/15 bg-white/5 text-gray-200';
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${toneClass}`}>
        {text}
      </span>
    );
  }

  const accountTypeToLabel = (value?: string) => {
    switch (String(value || '').toLowerCase()) {
      case 'asset':
        return 'Assets';
      case 'liability':
        return 'Liabilities';
      case 'income':
        return 'Income';
      case 'expense':
        return 'Expenses';
      default:
        return String(value || '-');
    }
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

  const createIdempotencyKey = (prefix: string) => {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${randomPart}`;
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
      tasks.push({ label: 'Account groups', run: refreshAccountGroups });
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
      tasks.push({ label: 'Chart of accounts', run: refreshChart });
    }
    if (tab === 'books') {
      tasks.push({ label: 'Cash and bank book', run: refreshBooks });
    }
    if (tab === 'ledger') {
      tasks.push({ label: 'Chart of accounts', run: refreshChart });
      tasks.push({ label: 'Account groups', run: refreshAccountGroups });
      tasks.push({ label: 'Ledger masters', run: refreshLedgerAccounts });
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
      tasks.push({ label: 'Chart of accounts', run: refreshChart });
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

  const refreshAccountGroups = async () => {
    const data = await apiJson('/api/accounting/groups');
    setAccountGroups(data.data || []);
  };

  const refreshLedgerAccounts = async () => {
    const data = await apiJson('/api/accounting/ledgers');
    setLedgerAccounts(data.data || []);
  };

  const refreshBooks = async () => {
    const [cashData, bankData] = await Promise.all([
      apiJson(`/api/accounting/books/cash?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/books/bank?startDate=${startDate}&endDate=${endDate}`),
    ]);
    setCashBook(cashData.data || null);
    setBankBook(bankData.data || null);
  };

  const refreshReports = async (includeDiagnostics = showAccountingDiagnostics) => {
    const diagnosticsQuery = includeDiagnostics ? '&showDiagnostics=true' : '';
    const [expenseData, incomeData, trialData, pnlData, bsData, tdsData, tdsReportsData, supplierPayablesData] = await Promise.all([
      apiJson(`/api/accounting/reports/expense?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/income?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/trial-balance?startDate=${startDate}&endDate=${endDate}${diagnosticsQuery}`),
      apiJson(`/api/accounting/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/reports/balance-sheet?asOnDate=${endDate}${includeDiagnostics ? '&showDiagnostics=true' : ''}`),
      apiJson('/api/accounting/tds/bootstrap').catch(() => ({ data: null })),
      apiJson(`/api/accounting/tds/reports?startDate=${startDate}&endDate=${endDate}`).catch(() => ({ data: null })),
      apiJson(`/api/accounting/core/supplier-payables?startDate=${startDate}&endDate=${endDate}`).catch(() => ({ data: null })),
    ]);
    setExpenseReport(expenseData.data || null);
    setIncomeReport(incomeData.data || null);
    setTrialBalance(trialData.data || null);
    setProfitLoss(pnlData.data || null);
    setBalanceSheet(bsData.data || null);
    setTdsReport(tdsData.data || null);
    setTdsDetailedReports(tdsReportsData.data || null);
    setSupplierPayablesReport(supplierPayablesData.data || null);
  };

  const refreshDashboard = async () => {
    const [dashboardData, invoiceData, paymentData, journalData] = await Promise.all([
      apiJson(`/api/accounting/core/dashboard?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
      apiJson(`/api/accounting/core/invoices?limit=200&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/core/payments?limit=200&startDate=${startDate}&endDate=${endDate}`),
      apiJson(`/api/accounting/core/journal-entries?limit=500&startDate=${startDate}&endDate=${endDate}`),
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

  const isEditableJournalConsoleEntry = (row: any) => {
    const referenceType = String(row?.referenceType || '').trim().toLowerCase();
    const status = String(row?.status || '').trim().toLowerCase();
    const referenceNo = String(row?.referenceNo || '').trim().toUpperCase();
    if (status !== 'posted') return false;
    return referenceType === 'manual' || (referenceType === 'payment' && referenceNo.startsWith('PB-'));
  };

  const mapJournalLinesToEditor = (lines: JournalEntryConsoleDetail['lines'] = []): JournalEditorLine[] =>
    (lines || []).map((line) => ({
      accountId: normalizeId(line.accountId),
      debit: String(Number(line.debitAmount || 0) || ''),
      credit: String(Number(line.creditAmount || 0) || ''),
      description: String(line.description || ''),
    }));

  const resetJournalConsoleEditor = () => {
    setEditingJournalEntryId(null);
    setJournalEditorForm({
      entryDate: new Date().toISOString().slice(0, 10),
      referenceNo: '',
      description: '',
    });
    setJournalEditorLines([]);
  };

  const loadJournalConsoleEntry = async (journalId: string) => {
    const response = await apiJson(`/api/accounting/core/journal-entries/${journalId}`);
    const detail: JournalEntryConsoleDetail | null = response?.data || null;
    setJournalEntryDetail(detail);
    return detail;
  };

  const openJournalConsoleEntry = async (journalId: string, editMode = false) => {
    const detail = await loadJournalConsoleEntry(journalId);
    if (!detail?.entry) {
      throw new Error('Journal entry details could not be loaded.');
    }
    if (editMode && !detail?.capabilities?.canEdit) {
      throw new Error('This journal entry is generated by another workflow and cannot be edited directly.');
    }

    setReportsTab('journals');
    setActiveTab('reports');

    if (editMode) {
      setEditingJournalEntryId(journalId);
      setJournalEditorForm({
        entryDate: String(detail.entry.entryDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
        referenceNo: String(detail.entry.referenceNo || ''),
        description: String(detail.entry.description || ''),
      });
      setJournalEditorLines(mapJournalLinesToEditor(detail.lines));
    } else {
      resetJournalConsoleEditor();
    }
  };

  const updateJournalEditorLine = (index: number, field: keyof JournalEditorLine, value: string) => {
    setJournalEditorLines((previous) =>
      previous.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line))
    );
  };

  const addJournalEditorLine = () => {
    setJournalEditorLines((previous) => [...previous, { accountId: '', debit: '', credit: '', description: '' }]);
  };

  const removeJournalEditorLine = (index: number) => {
    setJournalEditorLines((previous) => previous.filter((_, lineIndex) => lineIndex !== index));
  };

  const resetTrialBalanceControls = () => {
    setTrialBalanceSearch('');
    setTrialBalanceSectionFilter('all');
    setTrialBalanceGroupFilter('all');
    setTrialBalanceAbnormalOnly(false);
  };

  const exportTrialBalanceRows = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!trialBalanceExportRows.length || trialBalanceExporting) return;
    setTrialBalanceExporting(format);
    try {
      const fileName = `trial-balance-${startDate}-${endDate}.csv`;
      if (format === 'csv') {
        downloadCsvRows(fileName, trialBalanceExportRows);
        return;
      }
      if (format === 'xlsx') {
        await downloadExcelRows(fileName, trialBalanceExportRows, 'Trial Balance');
        return;
      }
      await downloadPdfRows({
        fileName,
        title: 'Trial Balance',
        subtitle: `${formatShortDate(startDate)} to ${formatShortDate(endDate)}`,
        rows: trialBalanceExportRows,
      });
    } finally {
      setTrialBalanceExporting('');
    }
  };

  const openLedgerFromTrialBalance = async (row: TrialBalanceRow) => {
    if (!row.accountId || row.accountId.startsWith('synthetic-')) return;
    setActiveTab('ledger');
    setLedgerTab('ledger_view');
    setSelectedAccountId(row.accountId);
    await withLoading(() => refreshLedger(row.accountId));
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextTab = params.get('tab');
    const nextReport = params.get('report');
    const nextTdsReport = params.get('tdsReport');

    if (isAccountingTabKey(nextTab)) {
      setActiveTab(nextTab);
    }
    if (nextTab === 'reports' && isReportsTabKey(nextReport)) {
      setReportsTab(nextReport);
    }
    if (nextTab === 'reports' && nextReport === 'tds' && isTdsReportTabKey(nextTdsReport)) {
      setTdsReportTab(nextTdsReport);
    }
  }, [location.search]);

  useEffect(() => {
    withLoading(async () => {
      await loadTabData(activeTab);
    });
  }, [activeTab]);

  useEffect(() => {
    const groupTitle = accountingMenuGroups.find((group) => group.items.some((item) => item.key === activeTab))?.title;
    if (!groupTitle) return;
    setCollapsedAccountingGroups((prev) => {
      if (!prev.has(groupTitle)) return prev;
      const next = new Set(prev);
      next.delete(groupTitle);
      return next;
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
    if (activeTab === 'ledger') setLedgerTab('groups');
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

  useEffect(() => {
    if (editingVendorId || vendorForm.groupId || !accountGroups.length) return;
    const defaultGroup = accountGroups.find((group) => /sundry creditors/i.test(group.groupName))
      || accountGroups.find((group) => group.under === 'liability');
    if (defaultGroup) {
      setVendorForm((prev) => prev.groupId ? prev : { ...prev, groupId: defaultGroup._id });
    }
  }, [accountGroups, editingVendorId, vendorForm.groupId]);

  const handleRefreshCurrentTab = () => {
    if (activeTab === 'treasury') {
      setTreasuryRefreshKey((prev) => prev + 1);
      return;
    }
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

  const loadPayrollComponentsForSalary = async () => {
    const selectedEmployee = employeeMaster.find((row) => row._id === salaryForm.employeeId);
    if (!selectedEmployee) {
      setError('Select an employee before loading payroll components');
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(salaryForm.month || ''))) {
      setError('Select a valid payroll month first');
      return;
    }

    await withLoading(async () => {
      const response = await apiJson(`/api/payroll/generate?month=${encodeURIComponent(salaryForm.month)}`);
      const row = (response.data?.rows || []).find((item: any) => String(item.employeeId || '') === String(selectedEmployee._id));
      if (!row) {
        throw new Error('Payroll row was not found for the selected employee and month');
      }

      setSalaryForm((prev) => ({
        ...prev,
        amount: String(Number(row.basePay || 0)),
        bonusAmount: String(Number(row.overtimePay || 0) + Number(row.arrearsPay || 0)),
        grossSalary: String(Number(row.grossPay || 0)),
        employeePf: String(Number(row.pfEmployee || 0)),
        employeeEsi: String(Number(row.esiEmployee || 0)),
        professionalTax: String(Number(row.professionalTax || 0)),
        tdsAmount: String(Number(row.tdsAmount || 0)),
        statutoryDeductions: String(Number(row.totalDeductions || 0)),
        employerPf: String(Number(row.pfEmployer || 0)),
        employerEsi: String(Number(row.esiEmployer || 0)),
        employerPayrollTaxes: String(Number(row.totalEmployerContribution || 0)),
      }));
      setMessage(`Loaded payroll components for ${selectedEmployee.name} (${salaryForm.month})`);
    });
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
        grossSalary: salaryDerived.grossSalary,
        employeePf: Number(salaryForm.employeePf || 0),
        employeeEsi: Number(salaryForm.employeeEsi || 0),
        professionalTax: Number(salaryForm.professionalTax || 0),
        tdsAmount: Number(salaryForm.tdsAmount || 0),
        statutoryDeductions: salaryDerived.statutoryDeductions,
        retirementContribution: Number(salaryForm.retirementContribution || 0),
        insurancePremium: Number(salaryForm.insurancePremium || 0),
        otherDeductions: Number(salaryForm.otherDeductions || 0),
        voluntaryDeductions: salaryDerived.voluntaryDeductions,
        employerPf: Number(salaryForm.employerPf || 0),
        employerEsi: Number(salaryForm.employerEsi || 0),
        employerPayrollTaxes: salaryDerived.employerPayrollTaxes,
        benefitsExpense: salaryDerived.benefitsExpense,
        netPay: salaryDerived.netPay,
        totalPayrollCost: salaryDerived.totalPayrollCost,
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
      await refreshLedgerAccounts();
    });
  };

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupForm(createGroupFormState());
  };

  const startGroupEdit = (row: AccountGroup) => {
    setEditingGroupId(row._id);
    setGroupForm({
      groupName: row.groupName || '',
      groupCode: row.groupCode || '',
      under: row.under || 'asset',
      parentGroupId: row.parentGroupId || '',
      isActive: row.isActive !== false,
    });
  };

  const saveAccountGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      const payload = {
        ...groupForm,
        parentGroupId: groupForm.parentGroupId || '',
      };
      const path = editingGroupId ? `/api/accounting/groups/${editingGroupId}` : '/api/accounting/groups';
      await apiJson(path, {
        method: editingGroupId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setMessage(editingGroupId ? 'Account group updated' : 'Account group created');
      resetGroupForm();
      await refreshAccountGroups();
      await refreshLedgerAccounts();
      await refreshChart();
    });
  };

  const resolveGroupIdForLedger = (row: ChartAccount) =>
    String(row.groupId || accountGroups.find((group) => group.groupName === row.groupName)?._id || '');

  const resetLedgerForm = () => {
    setEditingLedgerId(null);
    setLedgerForm(createLedgerFormState());
  };

  const startLedgerEdit = (row: ChartAccount) => {
    setEditingLedgerId(row._id);
    setLedgerForm({
      accountCode: row.accountCode || '',
      accountName: row.accountName || '',
      groupId: resolveGroupIdForLedger(row),
      subType: row.subType || 'general',
      gstNumber: row.gstNumber || '',
      panNumber: row.panNumber || '',
      openingBalance: String(row.openingBalance ?? ''),
      openingSide: row.openingSide || 'debit',
      isActive: row.isActive !== false,
    });
  };

  const saveLedgerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      const payload = {
        ...ledgerForm,
        openingBalance: Number(ledgerForm.openingBalance || 0),
      };
      const path = editingLedgerId ? `/api/accounting/ledgers/${editingLedgerId}` : '/api/accounting/ledgers';
      await apiJson(path, {
        method: editingLedgerId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setMessage(editingLedgerId ? 'Ledger updated' : 'Ledger created');
      resetLedgerForm();
      await refreshLedgerAccounts();
      await refreshChart();
      if (selectedAccountId) await refreshLedger(selectedAccountId);
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
      const idempotencyKey = createIdempotencyKey('accounting-invoice');
      await apiJson('/api/accounting/core/invoices', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          ...invoiceForm,
          idempotencyKey,
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
      const idempotencyKey = createIdempotencyKey(`invoice-payment-${invoiceId}`);
      await apiJson(`/api/accounting/core/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ amount: Number(amount), mode: invoiceForm.paymentMode, idempotencyKey }),
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
    if (!(await showConfirmDialog('Archive this entry from active accounting views?', { title: 'Archive Entry', confirmText: 'Archive Entry' }))) return;
    const reason = await showPromptDialog('Enter the archive reason for this entry.', {
      title: 'Archive Reason',
      label: 'Reason',
      defaultValue: 'Archived from accounting console',
      confirmText: 'Archive Entry',
      inputType: 'textarea',
      required: true,
    });
    if (!reason) return;
    await withLoading(async () => {
      await apiJson(`/api/accounting/day-book/entry/${row._id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setMessage('Entry archived');
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
      grossSalary: String(Number(row.grossSalary || (Number(row.baseAmount ?? row.amount ?? 0) + Number(row.bonusAmount || 0)))),
      employeePf: String(Number(row.employeePf || 0)),
      employeeEsi: String(Number(row.employeeEsi || 0)),
      professionalTax: String(Number(row.professionalTax || 0)),
      tdsAmount: String(Number(row.tdsAmount || 0)),
      statutoryDeductions: String(Number(row.statutoryDeductions || 0)),
      retirementContribution: String(Number(row.retirementContribution || 0)),
      insurancePremium: String(Number(row.insurancePremium || 0)),
      otherDeductions: String(Number(row.otherDeductions || 0)),
      voluntaryDeductions: String(Number(row.voluntaryDeductions || 0)),
      employerPf: String(Number(row.employerPf || 0)),
      employerEsi: String(Number(row.employerEsi || 0)),
      employerPayrollTaxes: String(Number(row.employerPayrollTaxes || 0)),
      benefitsExpense: String(Number(row.benefitsExpense || 0)),
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
      groupId: row.groupId || '',
      contact: row.contact || '',
      phone: row.phone || '',
      alternatePhone: row.alternatePhone || '',
      email: row.email || '',
      gstin: row.gstin || '',
      pan: row.pan || '',
      address: row.address || '',
      isTdsApplicable: row.isTdsApplicable !== false,
      deducteeType: row.deducteeType || 'vendor',
      tdsSectionCode: row.tdsSectionCode || '',
      tdsRate: row.tdsRate !== undefined && row.tdsRate !== null ? String(row.tdsRate) : '',
      openingBalance: row.openingBalance !== undefined && row.openingBalance !== null ? String(row.openingBalance) : '',
      openingSide: row.openingSide || 'credit',
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
      const metadata = row.metadata || {};
      setEditingVoucher({ id: voucherId, type: 'payment' });
      setPaymentForm({
        amount: String(Number(row.totalAmount || 0)),
        voucherDate,
        paymentMode: row.paymentMode || 'cash',
        entryMode: metadata.entryMode === 'settlement' ? 'settlement' : 'expense',
        category: row.lines?.find((line) => Number(line.debit || 0) > 0)?.narration || 'General Expense',
        referenceNo: row.referenceNo || '',
        accountName: documentFields.accountName || row.counterpartyName || '',
        beingPaymentOf: documentFields.beingPaymentOf || row.notes || '',
        forPeriod: documentFields.forPeriod || '',
        receivedBy: documentFields.receivedBy || '',
        authorizedBy: documentFields.authorizedBy || '',
        debitAccountId: metadata.debitAccountId || '',
        linkedEntityType: metadata.linkedEntityType || '',
        linkedEntityId: metadata.linkedEntityId || '',
        linkedEntityNumber: metadata.linkedEntityNumber || '',
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
      setError('Only super admin can archive vouchers.');
      return;
    }
    if (!(await showConfirmDialog(`Archive voucher ${row.voucherNumber} from active accounting views?`, { title: 'Archive Voucher', confirmText: 'Archive', severity: 'warning' }))) return;
    const reason = await showPromptDialog('Enter the archive reason for this voucher.', {
      title: 'Archive Reason',
      label: 'Reason',
      defaultValue: `Archived voucher ${row.voucherNumber}`,
      confirmText: 'Archive Voucher',
      inputType: 'textarea',
      required: true,
    });
    if (!reason) return;

    await withLoading(async () => {
      await apiJson(`/api/accounting/vouchers/${row._id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setMessage('Voucher archived');
      await refreshVouchers();
      await refreshBooks();
      await refreshReports();
      await refreshPayments();
    });
  };

  const saveJournalConsoleRevision = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingJournalEntryId) {
      setError('Select a manual journal entry before saving changes.');
      return;
    }

    const normalizedLines = journalEditorLines
      .map((line) => ({
        accountId: normalizeId(line.accountId),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        description: String(line.description || '').trim(),
      }))
      .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
    if (normalizedLines.length < 2) {
      setError('Add at least two journal lines before saving.');
      return;
    }
    const totalDebit = roundMoney(normalizedLines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
    const totalCredit = roundMoney(normalizedLines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
      setError('Journal lines must stay balanced before saving.');
      return;
    }

    const revisionReason = await showPromptDialog('Enter the reason for revising this journal entry.', {
      title: 'Revision Reason',
      label: 'Reason',
      defaultValue: `Revised from accounting console for ${journalEntryDetail?.entry?.entryNumber || 'journal entry'}`,
      confirmText: 'Save Revision',
      inputType: 'textarea',
      required: true,
    });
    if (!revisionReason) return;

    await withLoading(async () => {
      const response = await apiJson(`/api/accounting/core/journal-entries/${editingJournalEntryId}`, {
        method: 'PUT',
        body: JSON.stringify({
          entryDate: journalEditorForm.entryDate,
          referenceNo: journalEditorForm.referenceNo,
          description: journalEditorForm.description,
          revisionReason,
          lines: normalizedLines,
        }),
      });
      const replacementId = String(response?.data?.replacement?._id || '').trim();
      setMessage(String(response?.message || 'Journal entry revised successfully'));
      resetJournalConsoleEditor();
      await refreshDashboard();
      await refreshBooks();
      await refreshReports();
      if (replacementId) {
        await loadJournalConsoleEntry(replacementId);
      }
    });
  };

  const cancelJournalConsoleEdit = () => {
    resetJournalConsoleEditor();
    setMessage('Journal edit cancelled');
  };

  const cancelJournalConsoleEntry = async (row: any) => {
    if (!isEditableJournalConsoleEntry(row)) {
      setError('Only direct manual journals and legacy purchase-bill payment journals can be reversed directly from the console.');
      return;
    }
    if (!(await showConfirmDialog(`Reverse journal entry ${row.entryNumber}?`, {
      title: 'Reverse Journal Entry',
      confirmText: 'Reverse Entry',
      severity: 'warning',
    }))) return;
    const reason = await showPromptDialog('Enter the reason for reversing this journal entry.', {
      title: 'Reversal Reason',
      label: 'Reason',
      defaultValue: `Reversed from accounting console for ${row.entryNumber}`,
      confirmText: 'Reverse Entry',
      inputType: 'textarea',
      required: true,
    });
    if (!reason) return;

    await withLoading(async () => {
      const response = await apiJson(`/api/accounting/core/journal-entries/${row._id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMessage(String(response?.message || 'Journal entry reversed'));
      if (String(journalEntryDetail?.entry?._id || '') === String(row._id || '')) {
        await loadJournalConsoleEntry(String(row._id));
      }
      await refreshDashboard();
      await refreshBooks();
      await refreshReports();
    });
  };

  const openVoucherManager = async (voucherId: string) => {
    const response = await apiJson(`/api/accounting/vouchers/${voucherId}`);
    const voucher = response?.data;
    if (!voucher?._id) {
      throw new Error('Voucher details could not be loaded.');
    }
    setActiveTab('vouchers');
    editVoucher(voucher);
  };

  const openBookEntryManager = async (row: any) => {
    const managementType = String(row?.managementType || '').trim().toLowerCase();
    const managementId = String(row?.managementId || '').trim();
    if (!managementType || !managementId) {
      setError('This book entry is not linked to an editable source record.');
      return;
    }

    await withLoading(async () => {
      if (managementType === 'voucher') {
        await openVoucherManager(managementId);
        return;
      }
      if (managementType === 'journal') {
        await openJournalConsoleEntry(managementId, false);
        return;
      }
      throw new Error('Unsupported source record for this book entry.');
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
              Export Vendor Master CSV
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
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="mb-2 text-white font-semibold">TDS Snapshot</h3>
              <p className="text-sm text-gray-300">Deducted: {formatCurrency(tdsReport?.summary?.deducted || 0)}</p>
              <p className="text-sm text-gray-300">Deposited: {formatCurrency(tdsReport?.summary?.paid || 0)}</p>
              <p className="text-sm text-amber-300">Outstanding: {formatCurrency(tdsReport?.summary?.outstanding || 0)}</p>
              <p className="mt-3 text-xs text-gray-400">{tdsReport?.summary?.overdueCount || 0} overdue deduction(s) in the current TDS workspace.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReportDataTable
              title="Recent Accounting Activity"
              data={recentAccountingActivity}
              itemLabel="recent rows"
              searchPlaceholder="Search recent invoices, payments, vouchers, journals, or TDS"
              exportFileName={`recent-accounting-activity-${startDate}-${endDate}.csv`}
              filters={[
                { key: 'type', label: 'Type', getValue: (row: any) => String(row.type || 'Other') },
                { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'POSTED' },
                { key: 'effect', label: 'Effect', getValue: (row: any) => String(row.effect || 'Posted') },
              ]}
              columns={[
                { key: 'date', header: 'Date', render: (row: any) => formatShortDate(row.date), exportValue: (row: any) => String(row.date || '').slice(0, 10), sortValue: (row: any) => row.date },
                { key: 'type', header: 'Type', accessor: 'type' },
                { key: 'reference', header: 'Reference', accessor: 'reference' },
                { key: 'relatedReference', header: 'Related', render: (row: any) => row.relatedReference || '-', exportValue: (row: any) => row.relatedReference || '-', sortValue: (row: any) => row.relatedReference || '' },
                { key: 'party', header: 'Party / Description', accessor: 'party' },
                { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
                { key: 'effectValue', header: 'Effect', render: (row: any) => renderConsoleBadge(row.effect, 'POSTED'), exportValue: (row: any) => String(row.effect || '').toUpperCase() },
                { key: 'statusValue', header: 'Status', render: (row: any) => renderConsoleBadge(row.status, 'POSTED'), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              ]}
            />
            <ReportDataTable
              title="Recent Journal Entries"
              data={journalConsoleRows}
              itemLabel="journals"
              searchPlaceholder="Search journals by number, type, description, or reference"
              exportFileName={`accounting-journals-${startDate}-${endDate}.csv`}
              filters={[
                { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'POSTED' },
                { key: 'type', label: 'Type', getValue: (row: any) => String(row.referenceType || '').toUpperCase() || 'MANUAL' },
                { key: 'effect', label: 'Effect', getValue: (row: any) => String(row.effect || 'Posted') },
              ]}
              columns={[
                { key: 'entryNumber', header: 'Entry No', accessor: 'entryNumber' },
                { key: 'entryDate', header: 'Date', render: (row: any) => formatShortDate(row.entryDate), exportValue: (row: any) => String(row.entryDate || '').slice(0, 10), sortValue: (row: any) => row.entryDate },
                { key: 'referenceType', header: 'Type', render: (row: any) => String(row.referenceType || '-').toUpperCase(), exportValue: (row: any) => String(row.referenceType || '').toUpperCase() },
                { key: 'relatedReference', header: 'Against', render: (row: any) => row.relatedReference || '-', exportValue: (row: any) => row.relatedReference || '-', sortValue: (row: any) => row.relatedReference || '' },
                { key: 'description', header: 'Description', accessor: 'description' },
                { key: 'totalDebit', header: 'Amount', render: (row: any) => formatCurrency(row.totalDebit || 0), exportValue: (row: any) => Number(row.totalDebit || 0), sortValue: (row: any) => Number(row.totalDebit || 0), align: 'right' },
                { key: 'effectValue', header: 'Effect', render: (row: any) => renderConsoleBadge(row.effect, 'POSTED'), exportValue: (row: any) => String(row.effect || '').toUpperCase() },
                { key: 'statusValue', header: 'Status', render: (row: any) => renderConsoleBadge(row.status, 'POSTED'), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              ]}
            />
          </div>
        </div>
      );
    }

    if (reportsTab === 'vendors') {
      const normalizeVendorKey = (value: any) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const normalizeVendorPhone = (value: any) => String(value || '').replace(/\D/g, '').slice(-10);
      const duplicateVendorBuckets = (vendors || []).reduce((map: Map<string, number>, row: any) => {
        [
          `name:${normalizeVendorKey(row.name)}`,
          String(row.gstin || '').trim() ? `gstin:${String(row.gstin || '').trim().toUpperCase()}` : '',
          String(row.pan || '').trim() ? `pan:${String(row.pan || '').trim().toUpperCase()}` : '',
          normalizeVendorPhone(row.phone) ? `phone:${normalizeVendorPhone(row.phone)}` : '',
          row.ledgerAccountId ? `ledger:${String(row.ledgerAccountId)}` : '',
        ].filter(Boolean).forEach((key) => map.set(key, (map.get(key) || 0) + 1));
        return map;
      }, new Map<string, number>());
      const duplicateVendorFlags = (row: any) => [
        duplicateVendorBuckets.get(`name:${normalizeVendorKey(row.name)}`)! > 1 ? 'Duplicate name' : '',
        String(row.gstin || '').trim() && duplicateVendorBuckets.get(`gstin:${String(row.gstin || '').trim().toUpperCase()}`)! > 1 ? 'Duplicate GSTIN' : '',
        String(row.pan || '').trim() && duplicateVendorBuckets.get(`pan:${String(row.pan || '').trim().toUpperCase()}`)! > 1 ? 'Duplicate PAN' : '',
        normalizeVendorPhone(row.phone) && duplicateVendorBuckets.get(`phone:${normalizeVendorPhone(row.phone)}`)! > 1 ? 'Duplicate phone' : '',
        row.ledgerAccountId && duplicateVendorBuckets.get(`ledger:${String(row.ledgerAccountId)}`)! > 1 ? 'Duplicate ledger' : '',
      ].filter(Boolean);
      const vendorDataQualityFlags = (row: any) => [
        !String(row.pan || '').trim() ? 'Missing PAN' : '',
        !String(row.gstin || '').trim() ? 'Missing GSTIN' : '',
        !String(row.groupName || '').trim() ? 'Missing group' : '',
        !String(row.email || '').trim() ? 'Missing email' : '',
        !String(row.phone || '').trim() ? 'Missing phone' : '',
        row.isTdsApplicable && !String(row.pan || '').trim() ? 'TDS PAN missing' : '',
        resolveLinkedLedgerLabel(row) === 'Not linked' ? 'Unlinked ledger' : '',
        ...duplicateVendorFlags(row),
      ].filter(Boolean);
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3 text-sm text-cyan-100">
            This tab is a vendor master list for accounting setup. Procurement supplier bills and supplier payments are reviewed in purchase bills, payment vouchers, and Accounts Payable reports, so those movements are not shown here unless a vendor is separately linked to its own ledger.
          </div>
          <ReportDataTable
            title="Vendor Master List"
            data={vendors}
            itemLabel="vendor masters"
            searchPlaceholder="Search vendor master records by name, group, contact, phone, PAN, GSTIN, TDS, email, address, or linked ledger"
            exportFileName={`vendor-master-list-${endDate}.csv`}
            filters={[
              {
                key: 'group',
                label: 'Group',
                getValue: (row: any) => row.groupName || 'Ungrouped',
              },
              {
                key: 'tds',
                label: 'TDS',
                getValue: (row: any) => row.isTdsApplicable ? 'TDS Applicable' : 'No TDS',
              },
              {
                key: 'ledgerLink',
                label: 'Ledger Link',
                getValue: (row: any) => resolveLinkedLedgerLabel(row) === 'Not linked' ? 'Not linked' : 'Linked',
              },
              {
                key: 'quality',
                label: 'Data Quality',
                getValue: (row: any) => vendorDataQualityFlags(row).length ? 'Warnings' : 'Complete',
              },
              {
                key: 'incomplete',
                label: 'Completeness',
                getValue: (row: any) => vendorDataQualityFlags(row).some((flag) => String(flag).startsWith('Missing') || String(flag).includes('Unlinked')) ? 'Show incomplete vendors' : 'Complete vendors',
              },
              {
                key: 'duplicates',
                label: 'Duplicates',
                getValue: (row: any) => duplicateVendorFlags(row).length ? 'Show duplicates' : 'No duplicates',
              },
            ]}
            columns={[
              { key: 'name', header: 'Vendor', accessor: 'name' },
              { key: 'dataQuality', header: 'Data Quality', render: (row: any) => {
                const flags = vendorDataQualityFlags(row);
                return flags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {flags.slice(0, 3).map((flag) => (
                      <span key={flag} className="rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-100">{flag}</span>
                    ))}
                    {flags.length > 3 && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-gray-300">+{flags.length - 3}</span>}
                  </div>
                ) : (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-100">Complete</span>
                );
              }, exportValue: (row: any) => vendorDataQualityFlags(row).join(', ') || 'Complete' },
              { key: 'groupName', header: 'Group', render: (row: any) => row.groupName || '-', exportValue: (row: any) => row.groupName || '' },
              { key: 'contact', header: 'Contact', render: (row: any) => row.contact || '-', exportValue: (row: any) => row.contact || '' },
              { key: 'phone', header: 'Phone', render: (row: any) => row.phone || '-', exportValue: (row: any) => row.phone || '' },
              { key: 'alternatePhone', header: 'Alt Phone', render: (row: any) => row.alternatePhone || '-', exportValue: (row: any) => row.alternatePhone || '' },
              { key: 'pan', header: 'PAN', render: (row: any) => row.pan || '-', exportValue: (row: any) => row.pan || '' },
              { key: 'gstin', header: 'GSTIN', render: (row: any) => row.gstin || '-', exportValue: (row: any) => row.gstin || '' },
              { key: 'tdsStatus', header: 'TDS', render: (row: any) => row.isTdsApplicable ? `${row.tdsSectionCode || '-'} @ ${Number(row.tdsRate || 0)}%` : 'No', exportValue: (row: any) => row.isTdsApplicable ? `${row.tdsSectionCode || ''} @ ${Number(row.tdsRate || 0)}%` : 'No' },
              { key: 'email', header: 'Email', render: (row: any) => row.email || '-', exportValue: (row: any) => row.email || '' },
              { key: 'address', header: 'Address', render: (row: any) => row.address || '-', exportValue: (row: any) => row.address || '' },
              { key: 'openingBalance', header: 'Opening', render: (row: any) => `${formatCurrency(row.openingBalance || 0)} ${String(row.openingSide || 'credit').toUpperCase() === 'DEBIT' ? 'Dr' : 'Cr'}`, exportValue: (row: any) => `${Number(row.openingBalance || 0)} ${String(row.openingSide || 'credit').toUpperCase() === 'DEBIT' ? 'Dr' : 'Cr'}`, sortValue: (row: any) => Number(row.openingBalance || 0), align: 'right' },
              { key: 'ledgerAccount', header: 'Linked Ledger', render: (row: any) => resolveLinkedLedgerLabel(row), exportValue: (row: any) => resolveLinkedLedgerLabel(row), sortValue: (row: any) => resolveLinkedLedgerLabel(row) },
            ]}
          />
        </div>
      );
    }

    if (reportsTab === 'supplier_payables') {
      const payablesTotals = supplierPayablesReport?.totals || {};
      const payablesValidation = supplierPayablesReport?.validation || {};
      const payablesReconciliation = supplierPayablesReport?.reconciliation || {};
      const payablesRows = supplierPayablesReport?.rows || [];
      const payablesAgeingRows = supplierPayablesReport?.ageing || [];
      const payablesReconciled = payablesValidation.apReconciled === true || payablesReconciliation.status === 'Reconciled';
      const validationCards = [
        {
          label: 'Bills vs paid',
          value: payablesValidation.totalsMatch ? 'PASS' : 'CHECK',
          tone: payablesValidation.totalsMatch ? 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10' : 'text-amber-300 border-amber-400/25 bg-amber-500/10',
          helper: 'Bill amount should equal paid plus outstanding.',
        },
        {
          label: 'Supplier Payables Reconciled',
          value: payablesReconciled ? 'PASS' : 'CHECK',
          tone: payablesReconciled ? 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10' : 'text-amber-300 border-amber-400/25 bg-amber-500/10',
          helper: 'AP can be non-zero. It passes when documents, ageing, and payable ledgers tie out.',
        },
        {
          label: 'Supplier mapping',
          value: payablesValidation.allSuppliersMapped ? 'PASS' : 'CHECK',
          tone: payablesValidation.allSuppliersMapped ? 'text-emerald-300 border-emerald-400/25 bg-emerald-500/10' : 'text-amber-300 border-amber-400/25 bg-amber-500/10',
          helper: 'Every supplier in this report should be linked to an accounting payable ledger.',
        },
      ];

      return (
        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3 text-sm text-cyan-100">
            This is the procurement supplier transaction report. It shows real supplier bills, settlements, outstanding balances, and ageing. Vendor Master remains a separate setup screen.
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Total Bills</p>
              <p className="text-xl font-semibold text-white">{formatCurrency(payablesTotals.billAmount || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Total Paid</p>
              <p className="text-xl font-semibold text-emerald-300">{formatCurrency(payablesTotals.paidAmount || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Outstanding</p>
              <p className="text-xl font-semibold text-amber-300">{formatCurrency(payablesTotals.outstandingAmount || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Ledger Difference</p>
              <p className="text-xl font-semibold text-cyan-200">{formatCurrency(payablesTotals.validationDifference || 0)}</p>
            </div>
          </div>
          <div className={`rounded-xl border p-4 ${payablesReconciled ? 'border-emerald-400/25 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'}`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">AP Reconciliation</p>
                <p className="mt-1 text-xs text-gray-300">
                  {payablesReconciliation.reason || 'Supplier documents, ageing, and payable ledger movement are compared for the selected range.'}
                </p>
              </div>
              <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${payablesReconciled ? 'border-emerald-300/40 text-emerald-200' : 'border-amber-300/40 text-amber-200'}`}>
                {payablesReconciliation.status || (payablesReconciled ? 'Reconciled' : 'Mismatch')}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-gray-400">AP Control</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(payablesReconciliation.payableControlDirectBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-gray-400">Vendor Sub-ledgers</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(payablesReconciliation.payableSubLedgerBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-gray-400">AP Portfolio</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(payablesReconciliation.payablePortfolioBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-gray-400">Supplier Outstanding</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(payablesReconciliation.supplierOutstandingBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-gray-400">Ageing Outstanding</p>
                <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(payablesReconciliation.supplierAgeingOutstandingBalance || 0)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-xs text-gray-400">Difference</p>
                <p className={`mt-1 text-sm font-semibold ${Math.abs(Number(payablesReconciliation.difference || 0)) <= 0.01 ? 'text-emerald-200' : 'text-amber-200'}`}>
                  {formatCurrency(payablesReconciliation.difference || 0)}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {validationCards.map((card) => (
              <div key={card.label} className={`rounded-xl border p-4 ${card.tone}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{card.label}</p>
                  <span className="rounded-full border border-current/30 px-2 py-1 text-xs font-semibold">{card.value}</span>
                </div>
                <p className="mt-2 text-xs text-current/80">{card.helper}</p>
              </div>
            ))}
          </div>
          <ReportDataTable
            title="Supplier Ageing Summary"
            data={payablesAgeingRows}
            itemLabel="suppliers"
            searchPlaceholder="Search supplier ageing by supplier name or linked ledger"
            exportFileName={`supplier-ageing-${startDate}-${endDate}.csv`}
            filters={[
              {
                key: 'mapping',
                label: 'Mapping',
                getValue: (row: any) => row.payableLedgerAccountId ? 'Mapped' : 'Unmapped',
              },
            ]}
            columns={[
              { key: 'supplierName', header: 'Supplier', accessor: 'supplierName' },
              { key: 'payableLedger', header: 'Linked Ledger', render: (row: any) => row.payableLedgerAccountCode ? `${row.payableLedgerAccountCode} - ${row.payableLedgerAccountName || ''}`.trim() : 'Not linked', exportValue: (row: any) => row.payableLedgerAccountCode ? `${row.payableLedgerAccountCode} - ${row.payableLedgerAccountName || ''}`.trim() : 'Not linked', sortValue: (row: any) => row.payableLedgerAccountCode || row.payableLedgerAccountName || '' },
              { key: 'totalOutstanding', header: 'Outstanding', render: (row: any) => formatCurrency(row.totalOutstanding || 0), exportValue: (row: any) => Number(row.totalOutstanding || 0), sortValue: (row: any) => Number(row.totalOutstanding || 0), align: 'right' },
              { key: 'bucket0To30', header: '0-30 Days', render: (row: any) => formatCurrency(row.bucket0To30 || 0), exportValue: (row: any) => Number(row.bucket0To30 || 0), sortValue: (row: any) => Number(row.bucket0To30 || 0), align: 'right' },
              { key: 'bucket31To60', header: '31-60 Days', render: (row: any) => formatCurrency(row.bucket31To60 || 0), exportValue: (row: any) => Number(row.bucket31To60 || 0), sortValue: (row: any) => Number(row.bucket31To60 || 0), align: 'right' },
              { key: 'bucket61To90', header: '61-90 Days', render: (row: any) => formatCurrency(row.bucket61To90 || 0), exportValue: (row: any) => Number(row.bucket61To90 || 0), sortValue: (row: any) => Number(row.bucket61To90 || 0), align: 'right' },
              { key: 'bucket90Plus', header: '90+ Days', render: (row: any) => formatCurrency(row.bucket90Plus || 0), exportValue: (row: any) => Number(row.bucket90Plus || 0), sortValue: (row: any) => Number(row.bucket90Plus || 0), align: 'right' },
              { key: 'payableLedgerOutstanding', header: 'Ledger Outstanding', render: (row: any) => formatCurrency(row.payableLedgerOutstanding || 0), exportValue: (row: any) => Number(row.payableLedgerOutstanding || 0), sortValue: (row: any) => Number(row.payableLedgerOutstanding || 0), align: 'right' },
              { key: 'validationDifference', header: 'Difference', render: (row: any) => formatCurrency(row.validationDifference || 0), exportValue: (row: any) => Number(row.validationDifference || 0), sortValue: (row: any) => Number(row.validationDifference || 0), align: 'right' },
              { key: 'lastTransactionDate', header: 'Last Transaction', render: (row: any) => row.lastTransactionDate ? formatShortDate(row.lastTransactionDate) : '-', exportValue: (row: any) => row.lastTransactionDate ? String(row.lastTransactionDate).slice(0, 10) : '', sortValue: (row: any) => row.lastTransactionDate || '' },
            ]}
          />
          <ReportDataTable
            title="Supplier Ledger / Procurement Payables"
            data={payablesRows}
            itemLabel="supplier bill rows"
            searchPlaceholder="Search supplier bills by supplier, bill, PO, payment reference, mode, or linked ledger"
            exportFileName={`supplier-payables-${startDate}-${endDate}.csv`}
            filters={[
              { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || 'Pending') },
              { key: 'paymentMode', label: 'Payment Mode', getValue: (row: any) => String(row.paymentMode || 'Unpaid') || 'Unpaid' },
            ]}
            columns={[
              { key: 'supplierName', header: 'Supplier', accessor: 'supplierName' },
              { key: 'purchaseBillNo', header: 'Purchase Bill No', accessor: 'purchaseBillNo' },
              { key: 'purchaseOrderNo', header: 'Purchase Order No', render: (row: any) => row.purchaseOrderNo || '-', exportValue: (row: any) => row.purchaseOrderNo || '' },
              { key: 'billDate', header: 'Bill Date', render: (row: any) => formatShortDate(row.billDate), exportValue: (row: any) => String(row.billDate || '').slice(0, 10), sortValue: (row: any) => row.billDate },
              { key: 'billAmount', header: 'Bill Amount', render: (row: any) => formatCurrency(row.billAmount || 0), exportValue: (row: any) => Number(row.billAmount || 0), sortValue: (row: any) => Number(row.billAmount || 0), align: 'right' },
              { key: 'paidAmount', header: 'Paid Amount', render: (row: any) => formatCurrency(row.paidAmount || 0), exportValue: (row: any) => Number(row.paidAmount || 0), sortValue: (row: any) => Number(row.paidAmount || 0), align: 'right' },
              { key: 'outstandingAmount', header: 'Outstanding', render: (row: any) => formatCurrency(row.outstandingAmount || 0), exportValue: (row: any) => Number(row.outstandingAmount || 0), sortValue: (row: any) => Number(row.outstandingAmount || 0), align: 'right' },
              { key: 'paymentReference', header: 'Payment Reference', render: (row: any) => row.paymentReference || '-', exportValue: (row: any) => row.paymentReference || '' },
              { key: 'paymentMode', header: 'Payment Mode', render: (row: any) => row.paymentMode || '-', exportValue: (row: any) => row.paymentMode || '' },
              { key: 'statusValue', header: 'Status', render: (row: any) => renderConsoleBadge(row.status, 'Pending'), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              { key: 'lastTransactionDate', header: 'Last Transaction', render: (row: any) => formatShortDate(row.lastTransactionDate), exportValue: (row: any) => String(row.lastTransactionDate || '').slice(0, 10), sortValue: (row: any) => row.lastTransactionDate },
              { key: 'trace', header: 'Trace', render: (row: any) => (
                <div className="flex flex-wrap justify-end gap-2">
                  {row.billJournalEntryId && (
                    <button
                      type="button"
                      className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                      onClick={() => void withLoading(async () => openJournalConsoleEntry(String(row.billJournalEntryId), false))}
                    >
                      Bill Journal
                    </button>
                  )}
                  {row.paymentVoucherId && (
                    <button
                      type="button"
                      className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
                      onClick={() => void withLoading(async () => openVoucherManager(String(row.paymentVoucherId)))}
                    >
                      Payment Voucher
                    </button>
                  )}
                  {!row.paymentVoucherId && row.paymentJournalEntryId && (
                    <button
                      type="button"
                      className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
                      onClick={() => void withLoading(async () => openJournalConsoleEntry(String(row.paymentJournalEntryId), false))}
                    >
                      Payment Journal
                    </button>
                  )}
                  {!row.billJournalEntryId && !row.paymentVoucherId && !row.paymentJournalEntryId && (
                    <span className="text-xs text-gray-500">Reference only</span>
                  )}
                </div>
              ), exportValue: () => '', align: 'right' },
            ]}
          />
        </div>
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
            { key: 'grossSalary', header: 'Gross', render: (row: any) => formatCurrency(Number(row.grossSalary || Number(row.baseAmount ?? row.amount ?? 0) + Number(row.bonusAmount || 0))), exportValue: (row: any) => Number(row.grossSalary || Number(row.baseAmount ?? row.amount ?? 0) + Number(row.bonusAmount || 0)), sortValue: (row: any) => Number(row.grossSalary || 0), align: 'right' },
            { key: 'statutoryDeductions', header: 'Statutory', render: (row: any) => formatCurrency(Number(row.statutoryDeductions || 0)), exportValue: (row: any) => Number(row.statutoryDeductions || 0), sortValue: (row: any) => Number(row.statutoryDeductions || 0), align: 'right' },
            { key: 'voluntaryDeductions', header: 'Voluntary', render: (row: any) => formatCurrency(Number(row.voluntaryDeductions || 0)), exportValue: (row: any) => Number(row.voluntaryDeductions || 0), sortValue: (row: any) => Number(row.voluntaryDeductions || 0), align: 'right' },
            { key: 'employerPayrollTaxes', header: 'Employer Tax', render: (row: any) => formatCurrency(Number(row.employerPayrollTaxes || 0)), exportValue: (row: any) => Number(row.employerPayrollTaxes || 0), sortValue: (row: any) => Number(row.employerPayrollTaxes || 0), align: 'right' },
            { key: 'benefitsExpense', header: 'Benefits Expense', render: (row: any) => formatCurrency(Number(row.benefitsExpense || 0)), exportValue: (row: any) => Number(row.benefitsExpense || 0), sortValue: (row: any) => Number(row.benefitsExpense || 0), align: 'right' },
            { key: 'netPay', header: 'Net Pay', render: (row: any) => formatCurrency(Number(row.netPay ?? row.amount ?? 0)), exportValue: (row: any) => Number(row.netPay ?? row.amount ?? 0), sortValue: (row: any) => Number(row.netPay ?? row.amount ?? 0), align: 'right' },
            { key: 'totalPayrollCost', header: 'Payroll Cost', render: (row: any) => formatCurrency(Number(row.totalPayrollCost || row.grossSalary || row.amount || 0)), exportValue: (row: any) => Number(row.totalPayrollCost || row.grossSalary || row.amount || 0), sortValue: (row: any) => Number(row.totalPayrollCost || row.grossSalary || row.amount || 0), align: 'right' },
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
            {
              key: 'manage',
              header: 'Manage',
              render: (row: any) => row.managementType && row.managementId ? (
                <button
                  type="button"
                  className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
                  onClick={() => void openBookEntryManager(row)}
                >
                  Open
                </button>
              ) : (
                <span className="text-xs text-gray-500">Report only</span>
              ),
              exportValue: () => '',
              searchValue: (row: any) => row.managementType ? 'linked' : 'report only',
            },
          ]}
        />
      );
    }

    if (reportsTab === 'journals') {
      return (
        <div className="space-y-4">
          {journalEntryDetail?.entry && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">
                    {editingJournalEntryId ? `Edit Journal ${journalEntryDetail.entry.entryNumber}` : `Journal ${journalEntryDetail.entry.entryNumber}`}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {String(journalEntryDetail.entry.referenceType || 'manual').toUpperCase()} | {String(journalEntryDetail.entry.status || 'posted').toUpperCase()} | {formatShortDate(journalEntryDetail.entry.entryDate)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!editingJournalEntryId && journalEntryDetail.capabilities?.canEdit && (
                    <button type="button" className={buttonClass} onClick={() => void openJournalConsoleEntry(String(journalEntryDetail.entry._id), true)}>
                      <EditIcon />
                      Edit Manual Journal
                    </button>
                  )}
                  {!editingJournalEntryId && journalEntryDetail.capabilities?.canCancel && (
                    <button type="button" className={secondaryButtonClass} onClick={() => void cancelJournalConsoleEntry(journalEntryDetail.entry)}>
                      <CancelIcon />
                      Reverse Entry
                    </button>
                  )}
                  {editingJournalEntryId && (
                    <button type="button" className={secondaryButtonClass} onClick={cancelJournalConsoleEdit}>
                      <CancelIcon />
                      Cancel Edit
                    </button>
                  )}
                </div>
              </div>

              {editingJournalEntryId ? (
                <form onSubmit={saveJournalConsoleRevision} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <FloatingField label="Entry Date" type="date" required value={journalEditorForm.entryDate} onChange={(value) => setJournalEditorForm((prev) => ({ ...prev, entryDate: value }))} />
                    <FloatingField label="Reference No" value={journalEditorForm.referenceNo} onChange={(value) => setJournalEditorForm((prev) => ({ ...prev, referenceNo: value }))} />
                    <FloatingField label="Description" required value={journalEditorForm.description} onChange={(value) => setJournalEditorForm((prev) => ({ ...prev, description: value }))} />
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-300">
                          <th className="px-2 py-2 text-left">Account</th>
                          <th className="px-2 py-2 text-right">Debit</th>
                          <th className="px-2 py-2 text-right">Credit</th>
                          <th className="px-2 py-2 text-left">Description</th>
                          <th className="px-2 py-2 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {journalEditorLines.map((line, index) => (
                          <tr key={`journal-line-${index}`} className="border-t border-white/10">
                            <td className="px-2 py-2 min-w-[260px]">
                              <select
                                value={line.accountId}
                                onChange={(e) => updateJournalEditorLine(index, 'accountId', e.target.value)}
                                className={inputClass}
                              >
                                <option value="" className="bg-gray-900">Select account</option>
                                {chartAccounts.map((account) => (
                                  <option key={account._id} value={account._id} className="bg-gray-900">
                                    {account.accountCode} - {account.accountName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2 min-w-[120px]">
                              <input value={line.debit} onChange={(e) => updateJournalEditorLine(index, 'debit', e.target.value)} type="number" min="0" step="0.01" className={inputClass} />
                            </td>
                            <td className="px-2 py-2 min-w-[120px]">
                              <input value={line.credit} onChange={(e) => updateJournalEditorLine(index, 'credit', e.target.value)} type="number" min="0" step="0.01" className={inputClass} />
                            </td>
                            <td className="px-2 py-2 min-w-[240px]">
                              <input value={line.description} onChange={(e) => updateJournalEditorLine(index, 'description', e.target.value)} className={inputClass} />
                            </td>
                            <td className="px-2 py-2">
                              <button type="button" className="text-xs text-red-300 hover:text-red-200" onClick={() => removeJournalEditorLine(index)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                        {journalEditorLines.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                              No editable journal lines loaded.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={secondaryButtonClass} onClick={addJournalEditorLine}>
                      Add Line
                    </button>
                    <button className={buttonClass}>
                      <SaveIcon />
                      Save Revision
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-gray-300">
                        <th className="px-2 py-2 text-left">Account</th>
                        <th className="px-2 py-2 text-right">Debit</th>
                        <th className="px-2 py-2 text-right">Credit</th>
                        <th className="px-2 py-2 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalEntryDetail.lines.map((line, index) => (
                        <tr key={line._id || `journal-view-line-${index}`} className="border-t border-white/10">
                          <td className="px-2 py-2">{line.accountCode || '-'} - {line.accountName || '-'}</td>
                          <td className="px-2 py-2 text-right">{formatCurrency(Number(line.debitAmount || 0))}</td>
                          <td className="px-2 py-2 text-right">{formatCurrency(Number(line.creditAmount || 0))}</td>
                          <td className="px-2 py-2 text-gray-300">{line.description || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <ReportDataTable
            title="Journal Entries Console"
            data={journalConsoleRows}
            itemLabel="journal entries"
            searchPlaceholder="Search journals by number, type, description, or reference"
            exportFileName={`journal-console-${startDate}-${endDate}.csv`}
            filters={[
              { key: 'status', label: 'Status', getValue: (row: any) => String(row.status || '').toUpperCase() || 'POSTED' },
              { key: 'type', label: 'Type', getValue: (row: any) => String(row.referenceType || '').toUpperCase() || 'MANUAL' },
              { key: 'effect', label: 'Effect', getValue: (row: any) => String(row.effect || 'Posted') },
            ]}
            columns={[
              { key: 'entryNumber', header: 'Entry No', accessor: 'entryNumber' },
              { key: 'entryDate', header: 'Date', render: (row: any) => formatShortDate(row.entryDate), exportValue: (row: any) => String(row.entryDate || '').slice(0, 10), sortValue: (row: any) => row.entryDate },
              { key: 'referenceType', header: 'Type', render: (row: any) => String(row.referenceType || '-').toUpperCase(), exportValue: (row: any) => String(row.referenceType || '').toUpperCase() },
              { key: 'relatedReference', header: 'Against', render: (row: any) => row.relatedReference || '-', exportValue: (row: any) => row.relatedReference || '' },
              { key: 'description', header: 'Description', accessor: 'description' },
              { key: 'totalDebit', header: 'Amount', render: (row: any) => formatCurrency(row.totalDebit || 0), exportValue: (row: any) => Number(row.totalDebit || 0), sortValue: (row: any) => Number(row.totalDebit || 0), align: 'right' },
              { key: 'effectValue', header: 'Effect', render: (row: any) => renderConsoleBadge(row.effect, 'POSTED'), exportValue: (row: any) => String(row.effect || '').toUpperCase() },
              { key: 'statusValue', header: 'Status', render: (row: any) => renderConsoleBadge(row.status, 'POSTED'), exportValue: (row: any) => String(row.status || '').toUpperCase() },
              {
                key: 'manage',
                header: 'Action',
                render: (row: any) => (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={() => void withLoading(async () => { await openJournalConsoleEntry(String(row._id), false); })}>
                      View
                    </button>
                    {isEditableJournalConsoleEntry(row) && (
                      <>
                        <button type="button" className="text-indigo-300 hover:text-indigo-200" onClick={() => void withLoading(async () => { await openJournalConsoleEntry(String(row._id), true); })}>
                          Edit
                        </button>
                        <button type="button" className="text-red-300 hover:text-red-200" onClick={() => void cancelJournalConsoleEntry(row)}>
                          Reverse
                        </button>
                      </>
                    )}
                  </div>
                ),
                exportValue: () => '',
                searchValue: (row: any) => isEditableJournalConsoleEntry(row) ? 'editable' : 'view only',
              },
            ]}
          />
        </div>
      );
    }

    if (reportsTab === 'trial_balance') {
      const overallDebit = roundMoney(trialBalance?.totals?.debitBalance || 0);
      const overallCredit = roundMoney(trialBalance?.totals?.creditBalance || 0);
      const overallDifference = roundMoney(trialBalance?.totals?.balanceDifference || 0);
      const filteredDifference = roundMoney(trialBalanceFilteredTotals.debit - trialBalanceFilteredTotals.credit);
      const hiddenZeroRows = Number(trialBalance?.diagnostics?.hiddenZeroBalanceRows || 0);
      const duplicateCount = trialBalanceDuplicateNames.length;
      const abnormalCount = trialBalanceRows.filter((row) => row.abnormalBalance).length;
      const totalsLabel = trialBalanceHasFilters ? 'Filtered Total' : 'Total';

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Closing Debit</p>
              <p className="text-xl font-semibold text-emerald-300">{formatCurrency(overallDebit)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Closing Credit</p>
              <p className="text-xl font-semibold text-cyan-200">{formatCurrency(overallCredit)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Difference</p>
              <p className={`text-xl font-semibold ${Math.abs(overallDifference) <= 0.01 ? 'text-emerald-300' : 'text-amber-200'}`}>
                {formatCurrency(overallDifference)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Rows / Hidden Zero Rows</p>
              <p className="text-xl font-semibold text-white">{trialBalanceRows.length} / {hiddenZeroRows}</p>
            </div>
          </div>

          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-relaxed text-cyan-100">
            <p>Trial Balance now shows standard closing <span className="font-semibold">Debit</span> and <span className="font-semibold">Credit</span> columns only. Opening and period movement are still used internally to compute those balances.</p>
            <p className="mt-1">Rows are grouped by account head and subgroup, customers/vendors are tagged as sub-ledgers, and zero-only ledgers are hidden from the table.</p>
          </div>

          {trialBalanceIntegrity?.status && trialBalanceIntegrity.status !== 'clean' && (
            <div className={`rounded-xl border p-4 text-sm ${
              trialBalanceIntegrity.status === 'imbalanced'
                ? 'border-rose-300/30 bg-rose-500/10 text-rose-100'
                : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
            }`}>
              <p className="font-semibold">
                Trial Balance integrity: {trialBalanceIntegrity.status === 'imbalanced' ? 'imbalanced' : 'needs review'}
              </p>
              {trialBalanceIntegrity.status === 'imbalanced' ? (
                <p className="mt-1">
                  Closing debit and credit differ by {formatCurrency(trialBalanceIntegrity.difference || 0)}. This should be corrected before relying on the statement.
                </p>
              ) : (
                <p className="mt-1">
                  The statement is numerically balanced, but review is still required because diagnostic rows, duplicate ledger names, or abnormal balances are present.
                </p>
              )}
            </div>
          )}

          {(duplicateCount > 0 || abnormalCount > 0) && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              {duplicateCount > 0 && (
                <p>{duplicateCount} duplicate account name set{duplicateCount > 1 ? 's' : ''} detected in the chart of accounts. New duplicate names are now blocked, but existing ledgers should be merged or deactivated.</p>
              )}
              {abnormalCount > 0 && (
                <p className={duplicateCount > 0 ? 'mt-1' : ''}>{abnormalCount} ledger row{abnormalCount > 1 ? 's show' : ' shows'} a balance on the abnormal side and are highlighted below.</p>
              )}
              {duplicateCount > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {trialBalanceDuplicateNames.slice(0, 8).map((row: any) => (
                    <span key={`${row.accountName}-${row.accountCodes?.join('-')}`} className="rounded-full border border-amber-200/30 bg-amber-950/20 px-2 py-1">
                      {row.accountName}: {Array.isArray(row.accountCodes) ? row.accountCodes.join(', ') : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Trial Balance Report</h3>
                <p className="text-xs text-gray-400">Closing balances grouped by account head and subgroup for {formatShortDate(startDate)} to {formatShortDate(endDate)}.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionIconButton
                  kind="exportCsv"
                  onClick={() => void exportTrialBalanceRows('csv')}
                  disabled={trialBalanceExportRows.length === 0 || Boolean(trialBalanceExporting)}
                  title={trialBalanceExporting === 'csv' ? 'Exporting CSV...' : 'Export CSV'}
                />
                <ActionIconButton
                  kind="exportExcel"
                  onClick={() => void exportTrialBalanceRows('xlsx')}
                  disabled={trialBalanceExportRows.length === 0 || Boolean(trialBalanceExporting)}
                  title={trialBalanceExporting === 'xlsx' ? 'Exporting Excel...' : 'Export Excel'}
                />
                <ActionIconButton
                  kind="exportPdf"
                  onClick={() => void exportTrialBalanceRows('pdf')}
                  disabled={trialBalanceExportRows.length === 0 || Boolean(trialBalanceExporting)}
                  title={trialBalanceExporting === 'pdf' ? 'Exporting PDF...' : 'Export PDF'}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={trialBalanceSearch}
                onChange={(e) => setTrialBalanceSearch(e.target.value)}
                placeholder="Search code, account, group, or ledger class"
                className="w-full max-w-sm rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              />
              <select
                value={trialBalanceSectionFilter}
                onChange={(e) => {
                  const value = e.target.value as 'all' | TrialBalanceSection;
                  setTrialBalanceSectionFilter(value);
                  setTrialBalanceGroupFilter('all');
                }}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="all" className="bg-gray-900">All Account Heads</option>
                {trialBalanceSectionOptions.map((option) => (
                  <option key={option} value={option} className="bg-gray-900">{option}</option>
                ))}
              </select>
              <select
                value={trialBalanceGroupFilter}
                onChange={(e) => setTrialBalanceGroupFilter(e.target.value)}
                className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              >
                <option value="all" className="bg-gray-900">All Groups</option>
                {trialBalanceGroupOptions.map((option) => (
                  <option key={option} value={option} className="bg-gray-900">{option}</option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={trialBalanceAbnormalOnly}
                  onChange={(e) => setTrialBalanceAbnormalOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900 text-amber-300"
                />
                Abnormal only
              </label>
              <label className="inline-flex items-center gap-2 rounded-md border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <input
                  type="checkbox"
                  checked={showAccountingDiagnostics}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setShowAccountingDiagnostics(next);
                    void withLoading(() => refreshReports(next));
                  }}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900 text-amber-300"
                />
                Show diagnostic entries
              </label>
              <button
                type="button"
                className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                onClick={resetTrialBalanceControls}
              >
                Reset
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/20 p-3 text-sm text-gray-300">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>{totalsLabel}: <span className="font-semibold text-white">Debit {formatCurrency(trialBalanceFilteredTotals.debit)}</span> | <span className="font-semibold text-white">Credit {formatCurrency(trialBalanceFilteredTotals.credit)}</span></p>
                <p className={Math.abs(filteredDifference) <= 0.01 ? 'text-emerald-300' : 'text-amber-200'}>
                  {Math.abs(filteredDifference) <= 0.01 ? 'Balanced' : `Difference ${formatCurrency(filteredDifference)}`}
                </p>
              </div>
            </div>

            {trialBalanceFilteredRows.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-gray-400">
                {trialBalanceRows.length === 0
                  ? 'No transactions or opening balances were found for the selected period.'
                  : 'No trial balance rows match the current search and filters.'}
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {trialBalanceSections.map((section) => (
                  <section key={section.section} className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-white">{section.section}</h4>
                        <p className="text-xs text-gray-400">{section.rows.length} ledgers across {section.groups.length} subgroup{section.groups.length > 1 ? 's' : ''}</p>
                      </div>
                      <div className="text-right text-xs text-gray-400">
                        <p>Debit: <span className="font-semibold text-white">{formatCurrency(section.totals.debit)}</span></p>
                        <p>Credit: <span className="font-semibold text-white">{formatCurrency(section.totals.credit)}</span></p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-3">
                      {section.groups.map((group) => (
                        <div key={`${section.section}-${group.groupName}`} className="overflow-x-auto rounded-lg border border-white/10">
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-white/5 px-3 py-2">
                            <div>
                              <p className="text-sm font-semibold text-white">{group.groupName}</p>
                              <p className="text-xs text-gray-400">{group.rows.length} ledger row{group.rows.length > 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                              <p>Debit: <span className="font-semibold text-white">{formatCurrency(group.totals.debit)}</span></p>
                              <p>Credit: <span className="font-semibold text-white">{formatCurrency(group.totals.credit)}</span></p>
                            </div>
                          </div>
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/10 text-gray-300">
                                <th className="px-3 py-2 text-left font-medium">Code</th>
                                <th className="px-3 py-2 text-left font-medium">Account</th>
                                <th className="px-3 py-2 text-right font-medium">Debit</th>
                                <th className="px-3 py-2 text-right font-medium">Credit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <tr key={row.accountId} className={`border-t border-white/10 ${row.abnormalBalance ? 'bg-amber-400/5' : ''}`}>
                                  <td className="px-3 py-2 align-top text-gray-300">{row.accountCode || '-'}</td>
                                  <td className="px-3 py-2 align-top text-gray-200">
                                    <div className="flex flex-col gap-1">
                                      {row.accountId.startsWith('synthetic-') ? (
                                        <span className="font-medium text-white">{row.accountName}</span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="w-fit text-left font-medium text-white underline decoration-dotted underline-offset-4 hover:text-cyan-200"
                                          onClick={() => void openLedgerFromTrialBalance(row)}
                                        >
                                          {row.accountName}
                                        </button>
                                      )}
                                      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                        {row.groupName && row.groupName !== group.groupName && (
                                          <span className="rounded-full border border-white/10 px-2 py-0.5">{row.groupName}</span>
                                        )}
                                        {row.ledgerLabel && (
                                          <span className="rounded-full border border-white/10 px-2 py-0.5">{row.ledgerLabel}</span>
                                        )}
                                        {row.isSubLedger && (
                                          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-cyan-100">Sub-ledger</span>
                                        )}
                                        {row.abnormalBalance && (
                                          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-amber-100">
                                            Abnormal {row.normalBalanceSide === 'debit' ? 'credit' : 'debit'} balance
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className={`px-3 py-2 text-right align-top ${row.abnormalBalance && row.normalBalanceSide === 'credit' ? 'text-amber-200' : 'text-gray-200'}`}>
                                    {formatCurrency(row.debitBalance || 0)}
                                  </td>
                                  <td className={`px-3 py-2 text-right align-top ${row.abnormalBalance && row.normalBalanceSide === 'debit' ? 'text-amber-200' : 'text-gray-200'}`}>
                                    {formatCurrency(row.creditBalance || 0)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/10 bg-white/5 font-semibold text-white">
                                <td colSpan={2} className="px-3 py-2 text-left">Group Total</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(group.totals.debit)}</td>
                                <td className="px-3 py-2 text-right">{formatCurrency(group.totals.credit)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (reportsTab === 'profit_loss') {
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Total Income</p>
              <p className="text-xl font-semibold text-emerald-300">{formatCurrency(profitLoss?.income?.totalIncome || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Total Expense</p>
              <p className="text-xl font-semibold text-red-300">{formatCurrency(profitLoss?.expenses?.totalExpense || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Net Profit / Loss</p>
              <p className={`text-xl font-semibold ${Number(profitLoss?.netProfit || 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatCurrency(profitLoss?.netProfit || 0)}
              </p>
            </div>
          </div>
          {profitLoss?.formula && (
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3 text-xs leading-relaxed text-cyan-100">
              <p><span className="font-semibold">Income:</span> {profitLoss.formula.income}</p>
              <p><span className="font-semibold">Expense:</span> {profitLoss.formula.expense}</p>
              <p><span className="font-semibold">Round-off:</span> POS taxable sales remain sales revenue; GST remains tax payable. Round Off Income or Expense is shown separately, so accounting net profit can differ from store gross profit by the round-off amount.</p>
            </div>
          )}
          {Array.isArray(profitLoss?.diagnosticNotes) && profitLoss.diagnosticNotes.length > 0 && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100">
              {profitLoss.diagnosticNotes.map((note: string, index: number) => (
                <p key={`profit-loss-note-${index}`}>{note}</p>
              ))}
            </div>
          )}
          <ReportDataTable
            title="Profit & Loss Statement"
            data={profitLossRows}
            itemLabel="statement rows"
            searchPlaceholder="Search income, expense, or result lines"
            exportFileName={`profit-loss-${startDate}-${endDate}.csv`}
            filters={[
              { key: 'section', label: 'Section', getValue: (row: any) => String(row.section || 'Other') },
            ]}
            columns={[
              { key: 'section', header: 'Section', accessor: 'section' },
              { key: 'particulars', header: 'Particulars', accessor: 'particulars' },
              {
                key: 'amount',
                header: 'Amount',
                render: (row: any) => <span className={row.isTotal ? 'font-semibold text-white' : ''}>{formatCurrency(row.amount || 0)}</span>,
                exportValue: (row: any) => Number(row.amount || 0),
                sortValue: (row: any) => Number(row.amount || 0),
                align: 'right',
              },
            ]}
          />
        </div>
      );
    }

    if (reportsTab === 'balance_sheet') {
      return (
        <div className="space-y-4">
          <div className="flex justify-end">
            <label className="inline-flex items-center gap-2 rounded-md border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <input
                type="checkbox"
                checked={showAccountingDiagnostics}
                onChange={(e) => {
                  const next = e.target.checked;
                  setShowAccountingDiagnostics(next);
                  void withLoading(() => refreshReports(next));
                }}
                className="h-4 w-4 rounded border-white/20 bg-slate-900 text-amber-300"
              />
              Show diagnostic entries
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Total Assets</p>
              <p className="text-xl font-semibold text-emerald-300">{formatCurrency(balanceSheet?.totals?.totalAssets || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Total Liabilities</p>
              <p className="text-xl font-semibold text-amber-300">{formatCurrency(balanceSheet?.totals?.totalLiabilities || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Retained Earnings</p>
              <p className="text-xl font-semibold text-indigo-200">{formatCurrency(balanceSheet?.retainedEarnings ?? balanceSheet?.equity ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Difference</p>
              <p className={`text-xl font-semibold ${Number(balanceSheet?.totals?.difference || 0) === 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatCurrency(balanceSheet?.totals?.difference || 0)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
            {balanceSheetIntegrity?.status && balanceSheetIntegrity.status !== 'clean' && (
              <section className={`rounded-xl border p-4 text-sm ${
                balanceSheetIntegrity.status === 'imbalanced'
                  ? 'border-rose-300/30 bg-rose-500/10 text-rose-100'
                  : 'border-amber-300/30 bg-amber-300/10 text-amber-100'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-80">Integrity</p>
                    <h3 className="mt-2 text-base font-semibold text-white">
                      {balanceSheetIntegrity.status === 'imbalanced' ? 'Balance Sheet is imbalanced' : 'Balance Sheet needs review'}
                    </h3>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                    balanceSheetIntegrity.status === 'imbalanced'
                      ? 'border-rose-200/30 bg-rose-950/25 text-rose-100'
                      : 'border-amber-200/30 bg-amber-950/25 text-amber-100'
                  }`}>
                    {balanceSheetIntegrity.status === 'imbalanced' ? 'Fix' : 'Review'}
                  </span>
                </div>
                {balanceSheetIntegrity.status === 'imbalanced' ? (
                  <p className="mt-3 leading-6">
                    Assets and liabilities plus equity differ by <span className="font-semibold text-white">{formatCurrency(balanceSheetIntegrity.difference || 0)}</span>. Correct this before close-out.
                  </p>
                ) : (
                  <p className="mt-3 leading-6">
                    The Balance Sheet is mathematically aligned, but diagnostic clearing rows are still being used. Review opening balances and legacy ledger migrations before treating it as production-clean.
                  </p>
                )}
              </section>
            )}

            {(Number(balanceSheet?.diagnostics?.openingBalanceDifference || 0) !== 0 || Number(balanceSheet?.diagnostics?.legacyClearing || 0) !== 0) && (
              <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-amber-100">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/80">Diagnostics</p>
                <h3 className="mt-2 text-base font-semibold text-white">Clearing and migration notes</h3>
                <div className="mt-3 space-y-3 text-sm leading-6">
                  {Number(balanceSheet?.diagnostics?.openingBalanceDifference || 0) !== 0 && (
                    <p>Opening balances are one-sided by {formatCurrency(balanceSheet.diagnostics.openingBalanceDifference)}. The report shows this under Opening Balance Equity / Suspense until opening balances are corrected.</p>
                  )}
                  {Number(balanceSheet?.diagnostics?.legacyClearing || 0) !== 0 && (
                    <p>Legacy records not yet posted to ledger create a clearing adjustment of {formatCurrency(balanceSheet.diagnostics.legacyClearing)}. Migrate those records into ledger entries to remove this diagnostic row.</p>
                  )}
                </div>
              </section>
            )}

            <section className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/80">Explanation</p>
              <h3 className="mt-2 text-base font-semibold text-white">Why this balances</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="rounded-lg border border-cyan-300/15 bg-slate-950/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/75">Assets</p>
                  <p className="mt-2 leading-6 text-cyan-100/85">
                    Cash, bank, receivables, inventory, tax inputs, and other debit balances.
                  </p>
                </div>
                <div className="rounded-lg border border-cyan-300/15 bg-slate-950/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/75">Liabilities + Equity</p>
                  <p className="mt-2 leading-6 text-cyan-100/85">
                    Supplier payables, GST/TDS payable, customer advances, opening balance equity, and retained earnings/current profit.
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-cyan-300/15 bg-slate-950/20 p-3 leading-6 text-cyan-100/85">
                The report is reconciled when <span className="font-semibold text-white">Assets - (Liabilities + Equity)</span> is zero.
              </div>
            </section>
          </div>
          <ReportDataTable
            title={`Balance Sheet as on ${formatShortDate(balanceSheet?.asOnDate || endDate)}`}
            data={balanceSheetRows}
            itemLabel="balance rows"
            searchPlaceholder="Search asset, liability, equity, account code, or account name"
            exportFileName={`balance-sheet-${endDate}.csv`}
            filters={[
              { key: 'section', label: 'Section', getValue: (row: any) => String(row.section || 'Other') },
            ]}
            columns={[
              { key: 'section', header: 'Section', accessor: 'section' },
              { key: 'accountCode', header: 'Code', accessor: 'accountCode' },
              { key: 'accountName', header: 'Account', accessor: 'accountName' },
              { key: 'amount', header: 'Amount', render: (row: any) => formatCurrency(row.amount || 0), exportValue: (row: any) => Number(row.amount || 0), sortValue: (row: any) => Number(row.amount || 0), align: 'right' },
            ]}
          />
        </div>
      );
    }

    if (reportsTab === 'tds') {
      const detailed = tdsDetailedReports || {};
      const summary = detailed.summary || tdsReport?.summary || {};
      const period = detailed.period || {};
      const definition = tdsReportDefinitions[tdsReportTab];
      const detailedRows = (readTdsPath(detailed, definition.dataPath) || []) as any[];
      const detailedFilters = (definition.filters || []).map((filter) => ({
        key: filter.key,
        label: filter.label,
        getValue: (row: any) => String(renderTdsReportCell(row, { key: filter.key, header: filter.label, kind: filter.kind }) || '-'),
      }));
      const detailedColumns = definition.fields.map((field) => ({
        key: field.key,
        header: field.header,
        render: (row: any) => renderTdsReportCell(row, field),
        exportValue: (row: any) => exportTdsReportCell(row, field),
        sortValue: (row: any) => sortTdsReportCell(row, field),
        align: field.kind === 'money' || field.kind === 'number' ? 'right' as const : undefined,
      }));

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">TDS Deducted</p>
              <p className="text-xl font-semibold text-cyan-200">{formatCurrency(summary.deducted || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Deposited</p>
              <p className="text-xl font-semibold text-emerald-300">{formatCurrency(summary.paid || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Outstanding</p>
              <p className="text-xl font-semibold text-amber-300">{formatCurrency(summary.outstanding || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-gray-300">Reports / Mismatches</p>
              <p className="text-xl font-semibold text-white">{summary.reportCount || 12} / {summary.mismatches || 0}</p>
            </div>
          </div>
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
            <p className="font-semibold">TDS report suite is synced with books for {period.startDate || startDate} to {period.endDate || endDate}.</p>
            <p className="mt-1 text-cyan-100/80">Statutory rows cover Form 24Q, 26Q, 27Q, and 27EQ for FY {period.financialYear || 'selected FY'}; certificates cover Form 16, 16A, and 27D.</p>
          </div>
          {tdsReport?.warnings?.length > 0 && (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              {tdsReport.warnings.map((warning: string) => <p key={warning}>{warning}</p>)}
            </div>
          )}
          <CardTabs
            items={tdsReportTabs}
            activeKey={tdsReportTab}
            onChange={setTdsReportTab}
            ariaLabel="TDS report navigation"
            compact
          />
          <ReportDataTable
            key={tdsReportTab}
            title={definition.title}
            data={detailedRows}
            itemLabel={definition.itemLabel}
            searchPlaceholder={definition.searchPlaceholder}
            exportFileName={`${definition.exportSlug}-${period.financialYear || startDate}-${endDate}.csv`}
            filters={detailedFilters}
            columns={detailedColumns}
          />
        </div>
      );
    }

    return null;
  };

  const activeMenuGroup = accountingMenuGroups.find((group) => group.items.some((item) => item.key === activeTab));
  const activeMenuItem = activeMenuGroup?.items.find((item) => item.key === activeTab);
  const reportTabItems = reportsTabs.map((item) => ({
    ...item,
    tooltip: buildLogicTooltip(reportLogicByTab[item.key]),
    tooltipTrigger: 'icon' as const,
    tooltipAriaLabel: `More information about ${item.label}`,
  }));
  const toggleAccountingGroup = (title: string) => {
    setCollapsedAccountingGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Accounting Console</h1>
        <div className="flex items-center gap-2">
          <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <ActionIconButton kind="refresh" onClick={handleRefreshCurrentTab} disabled={loading} title="Refresh" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[205px_minmax(0,1fr)] lg:gap-5">
        <aside className="rounded-xl border border-white/10 bg-white/5 p-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <nav aria-label="Accounting menu navigation" className="space-y-1.5">
            {accountingMenuGroups.map((group) => {
              const groupActive = group.items.some((item) => item.key === activeTab);
              const activeGroupItem = group.items.find((item) => item.key === activeTab);
              const isCollapsed = collapsedAccountingGroups.has(group.title);
              return (
                <section key={group.title} className="rounded-lg border border-white/10 bg-slate-950/20 p-1.5">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
                    onClick={() => toggleAccountingGroup(group.title)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`accounting-menu-group-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-[11px] font-semibold uppercase tracking-[0.16em] ${groupActive ? 'text-indigo-200' : 'text-gray-400'}`}>{group.title}</p>
                      {isCollapsed && activeGroupItem && (
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-indigo-100">{activeGroupItem.label}</p>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {groupActive && <span className="h-1.5 w-1.5 rounded-full bg-indigo-300" aria-hidden="true" />}
                      <svg
                        className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M5 8L10 13L15 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div id={`accounting-menu-group-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="mt-1 space-y-1">
                      {group.items.map((item) => {
                        const isActive = activeTab === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setActiveTab(item.key)}
                            aria-current={isActive ? 'page' : undefined}
                            title={item.description}
                            className={`w-full rounded-md px-2 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                              isActive
                                ? 'border border-indigo-300/40 bg-indigo-500 text-white shadow-md shadow-indigo-950/20'
                                : 'border border-transparent bg-white/5 text-gray-300 hover:border-white/10 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span className="block truncate text-xs font-semibold">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-5">
          {activeMenuGroup && activeMenuItem && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">{activeMenuGroup.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">{activeMenuItem.label}</h2>
                    {activeTab === 'reports' ? (
                      <Tooltip
                        arrow
                        placement="bottom-start"
                        title={buildLogicTooltip(reportLogicByTab[reportsTab])}
                        slotProps={cardTabsTooltipSlotProps}
                        enterDelay={120}
                        leaveDelay={100}
                        disableInteractive={false}
                      >
                        <button
                          type="button"
                          aria-label={`More information about ${activeMenuItem.label}`}
                          data-disable-auto-tooltip="true"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-[11px] font-bold text-cyan-100 transition hover:border-cyan-200/45 hover:bg-cyan-400/16 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                        >
                          i
                        </button>
                      </Tooltip>
                    ) : null}
                  </div>
                  {activeTab !== 'reports' && activeMenuItem.description ? (
                    <p className="mt-1 text-sm text-gray-300">{activeMenuItem.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'reports' ? (
                    <ManualHelpLink
                      anchor={reportLogicByTab[reportsTab].manualAnchor}
                      label="Open full help"
                      className="bg-slate-950/30"
                    />
                  ) : null}
                  <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs font-semibold text-gray-300">
                    {activeMenuGroup.helper}
                  </span>
                </div>
              </div>
            </div>
          )}
          {message && <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
          {error && <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {activeTab === 'dashboard' && (
        <div className="space-y-4">
          <AccountingLogicHelpCard
            logic={dashboardLogic}
            helpLabel="Open full help"
            variant="drawer"
            triggerLabel="Dashboard logic"
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400">Selected Income</p>
                  <p className="mt-1 text-[11px] text-gray-500">{dashboardRangeLabel}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 3V7M16 3V7M3 10H21M10 14H14M10 17H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{formatCurrency(selectedRevenueValue)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400">Month-to-date Income</p>
                  <p className="mt-1 text-[11px] text-gray-500">{monthToDateLabel}</p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-200">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 20H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M7 16V10M12 16V6M17 16V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M5 8L10 5L14 8L19 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-white">{formatCurrency(monthToDateRevenueValue)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400">Expenses</p>
                  <p className="mt-1 text-[11px] text-gray-500">{dashboardRangeLabel}</p>
                </div>
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
                <div>
                  <p className="text-xs text-gray-400">Profit</p>
                  <p className="mt-1 text-[11px] text-gray-500">{dashboardRangeLabel}</p>
                </div>
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
                <div>
                  <p className="text-xs text-gray-400">
                    {Number(dashboardSummary?.gstReceivable || 0) > 0 ? 'GST Receivable' : 'GST Payable'}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Output {formatCurrency(dashboardSummary?.gstOutputTax || 0)} | Input {formatCurrency(dashboardSummary?.gstInputTax || 0)}
                  </p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M9 8H15M9 12H15M9 16H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M16 15.5L18.5 18L21 15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <p className="mt-2 text-xl font-semibold text-amber-300">
                {formatCurrency(Number(dashboardSummary?.gstReceivable || 0) > 0 ? dashboardSummary?.gstReceivable : dashboardSummary?.gstPayable || 0)}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">As on {formatShortDate(endDate)}</p>
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
                <thead><tr className="text-gray-300"><th className="px-2 py-1 text-left">Entry</th><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Amount</th><th className="px-2 py-1 text-left">Effect</th></tr></thead>
                <tbody>
                  {journalConsoleRows.slice(0, 8).map((row) => (
                    <tr key={row._id} className="border-t border-white/10">
                      <td className="px-2 py-1">{row.entryNumber}</td>
                      <td className="px-2 py-1 uppercase text-gray-300">{row.referenceType}</td>
                      <td className="px-2 py-1">{formatCurrency(row.totalDebit || 0)}</td>
                      <td className="px-2 py-1">{renderConsoleBadge(row.effect, 'POSTED')}</td>
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Create Accounting Invoice</h2>
                <ManualHelpLink anchor="transaction-accounting-invoice" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Invoice Date" type="date" value={invoiceForm.invoiceDate} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, invoiceDate: value }))} />
                <FloatingField label="Customer / Party Name" required value={invoiceForm.customerName} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, customerName: value }))} />
              </div>
              <FloatingField label="Description" value={invoiceForm.description} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, description: value }))} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Base Amount" type="number" min="0" step="0.01" required value={invoiceForm.baseAmount} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, baseAmount: value }))} />
                <FloatingField label="GST Amount" type="number" min="0" step="0.01" value={invoiceForm.gstAmount} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, gstAmount: value }))} />
                <FloatingField label="Initial Payment" type="number" min="0" step="0.01" value={invoiceForm.paymentAmount} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, paymentAmount: value }))} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField
                  label="GST Treatment"
                  value={invoiceForm.gstTreatment}
                  onChange={(value) => setInvoiceForm((prev) => ({ ...prev, gstTreatment: value }))}
                  options={[
                    { value: 'none', label: 'No GST' },
                    { value: 'intrastate', label: 'CGST + SGST' },
                    { value: 'interstate', label: 'IGST' },
                  ]}
                />
                <FloatingField label="Payment Mode" value={invoiceForm.paymentMode} onChange={(value) => setInvoiceForm((prev) => ({ ...prev, paymentMode: value }))} options={paymentModeOptions} />
                <FloatingField
                  label="Revenue Account"
                  value={invoiceForm.revenueAccountKey}
                  onChange={(value) => setInvoiceForm((prev) => ({ ...prev, revenueAccountKey: value }))}
                  options={[
                    { value: 'booking_revenue', label: 'Booking Revenue' },
                    { value: 'event_revenue', label: 'Event Revenue' },
                    { value: 'sales_revenue', label: 'Sales Revenue' },
                    { value: 'other_income', label: 'Other Income' },
                  ]}
                />
              </div>
              <button className={buttonClass}>
                <InvoiceIcon />
                Create Invoice
              </button>
            </form>
          )}

          {invoicesTab === 'expense_entry' && (
            <form onSubmit={submitCoreExpense} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Record Expense / Vendor Bill</h2>
                <ManualHelpLink anchor="transaction-expense-vendor-bill" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Expense Date" type="date" value={expenseCoreForm.expenseDate} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, expenseDate: value }))} />
                <FloatingField label="Description" required value={expenseCoreForm.description} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, description: value }))} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Amount" type="number" min="0" step="0.01" required value={expenseCoreForm.amount} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, amount: value }))} />
                <FloatingField label="Paid Amount" type="number" min="0" step="0.01" value={expenseCoreForm.paidAmount} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, paidAmount: value }))} />
                <FloatingField label="Payment Mode" value={expenseCoreForm.paymentMode} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, paymentMode: value }))} options={paymentModeOptions} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Expense Account Name" value={expenseCoreForm.expenseAccountName} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, expenseAccountName: value }))} />
                <FloatingField
                  label="Vendor"
                  value={expenseCoreForm.vendorId}
                  onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, vendorId: value }))}
                  options={[{ value: '', label: 'Select vendor (optional)' }, ...vendors.map((row) => ({ value: row._id, label: row.name }))]}
                />
              </div>
              {!expenseCoreForm.vendorId && (
                <FloatingField label="New Vendor Name (optional)" value={expenseCoreForm.vendorName} onChange={(value) => setExpenseCoreForm((prev) => ({ ...prev, vendorName: value }))} />
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
            <div className="space-y-5">
              <form onSubmit={submitVendor} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-white">{editingVendorId ? 'Edit Vendor Master' : 'Add Vendor'}</h2>
                  <p className="text-xs text-gray-400">Maintain statutory, contact, TDS, and opening balance details for vendor ledgers.</p>
                  {editingVendorId && <p className="mt-1 text-xs text-cyan-300">Edit mode is active. Update the vendor and save changes with confirmation.</p>}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Account Setup</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FloatingField label="Account Name" required value={vendorForm.name} onChange={(value) => setVendorForm((prev) => ({ ...prev, name: value }))} />
                    <FloatingField
                      label="Choose Group"
                      required
                      value={vendorForm.groupId}
                      onChange={(value) => setVendorForm((prev) => ({ ...prev, groupId: value }))}
                      options={[
                        { value: '', label: 'Select vendor group' },
                        ...vendorGroupOptions.map((group) => ({ value: group._id, label: `${group.groupName} (${group.groupCode})` })),
                      ]}
                    />
                    <FloatingField
                      label="Is TDS Applicable"
                      required
                      value={vendorForm.isTdsApplicable ? 'yes' : 'no'}
                      onChange={(value) => setVendorForm((prev) => ({ ...prev, isTdsApplicable: value === 'yes' }))}
                      options={[
                        { value: 'yes', label: 'Yes' },
                        { value: 'no', label: 'No' },
                      ]}
                    />
                    <FloatingField label="Contact Person" value={vendorForm.contact} onChange={(value) => setVendorForm((prev) => ({ ...prev, contact: value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Statutory Information</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <FloatingField
                      label="Deductee Type"
                      required={vendorForm.isTdsApplicable}
                      value={vendorForm.deducteeType}
                      onChange={(value) => setVendorForm((prev) => ({ ...prev, deducteeType: value }))}
                      options={vendorDeducteeTypes}
                    />
                    <FloatingField
                      label="Section Number"
                      required={vendorForm.isTdsApplicable}
                      value={vendorForm.tdsSectionCode}
                      onChange={(value) => setVendorForm((prev) => ({ ...prev, tdsSectionCode: value }))}
                      options={[{ value: '', label: 'Select section' }, ...vendorTdsSections]}
                    />
                    <FloatingField label="TDS Rate (%)" type="number" min="0" step="0.01" required={vendorForm.isTdsApplicable} value={vendorForm.tdsRate} onChange={(value) => setVendorForm((prev) => ({ ...prev, tdsRate: value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Mailing And Tax Registration Details</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <FloatingField label="Primary Phone Number" value={vendorForm.phone} onChange={(value) => setVendorForm((prev) => ({ ...prev, phone: value }))} />
                    <FloatingField label="Alternate Phone Number" value={vendorForm.alternatePhone} onChange={(value) => setVendorForm((prev) => ({ ...prev, alternatePhone: value }))} />
                    <FloatingField label="PAN" maxLength={10} value={vendorForm.pan} onChange={(value) => setVendorForm((prev) => ({ ...prev, pan: value.toUpperCase() }))} />
                    <FloatingField label="GSTIN" value={vendorForm.gstin} onChange={(value) => setVendorForm((prev) => ({ ...prev, gstin: value.toUpperCase() }))} />
                    <FloatingField label="Email Address" type="email" value={vendorForm.email} onChange={(value) => setVendorForm((prev) => ({ ...prev, email: value }))} />
                    <FloatingField label="Address" rows={4} className="md:col-span-2 xl:col-span-1 xl:row-span-2" value={vendorForm.address} onChange={(value) => setVendorForm((prev) => ({ ...prev, address: value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Balances</p>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FloatingField
                      label="Cr/Dr"
                      required
                      value={vendorForm.openingSide}
                      onChange={(value) => setVendorForm((prev) => ({ ...prev, openingSide: value }))}
                      options={[
                        { value: 'credit', label: 'Credit (Cr)' },
                        { value: 'debit', label: 'Debit (Dr)' },
                      ]}
                    />
                    <FloatingField label="Opening Balance" required type="number" min="0" step="0.01" value={vendorForm.openingBalance} onChange={(value) => setVendorForm((prev) => ({ ...prev, openingBalance: value }))} />
                  </div>
                </div>

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

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <ReportDataTable
                  title="Vendor Balances"
                  data={vendors}
                  itemLabel="vendors"
                  searchPlaceholder="Search vendor, group, phone, PAN, GSTIN, TDS section, email, or address"
                  exportFileName={`vendor-master-${endDate}.csv`}
                  filters={[
                    { key: 'group', label: 'Group', getValue: (row: any) => row.groupName || 'Ungrouped' },
                    { key: 'tds', label: 'TDS', getValue: (row: any) => row.isTdsApplicable ? 'TDS Applicable' : 'No TDS' },
                    { key: 'balance', label: 'Balance', getValue: (row: any) => Number(row.balance || 0) > 0 ? 'With Balance' : 'Settled' },
                  ]}
                  columns={[
                    { key: 'name', header: 'Vendor', accessor: 'name' },
                    { key: 'groupName', header: 'Group', render: (row: any) => row.groupName || '-', exportValue: (row: any) => row.groupName || '' },
                    { key: 'phone', header: 'Primary Phone', render: (row: any) => row.phone || '-', exportValue: (row: any) => row.phone || '' },
                    { key: 'alternatePhone', header: 'Alt Phone', render: (row: any) => row.alternatePhone || '-', exportValue: (row: any) => row.alternatePhone || '' },
                    { key: 'pan', header: 'PAN', render: (row: any) => row.pan || '-', exportValue: (row: any) => row.pan || '' },
                    { key: 'gstin', header: 'GSTIN', render: (row: any) => row.gstin || '-', exportValue: (row: any) => row.gstin || '' },
                    { key: 'tdsStatus', header: 'TDS', render: (row: any) => row.isTdsApplicable ? `${row.tdsSectionCode || '-'} @ ${Number(row.tdsRate || 0)}%` : 'No', exportValue: (row: any) => row.isTdsApplicable ? `${row.tdsSectionCode || ''} @ ${Number(row.tdsRate || 0)}%` : 'No' },
                    { key: 'email', header: 'Email', render: (row: any) => row.email || '-', exportValue: (row: any) => row.email || '' },
                    { key: 'openingBalance', header: 'Opening', render: (row: any) => `${formatCurrency(row.openingBalance || 0)} ${String(row.openingSide || 'credit').toUpperCase() === 'DEBIT' ? 'Dr' : 'Cr'}`, exportValue: (row: any) => `${Number(row.openingBalance || 0)} ${String(row.openingSide || 'credit').toUpperCase() === 'DEBIT' ? 'Dr' : 'Cr'}`, sortValue: (row: any) => Number(row.openingBalance || 0), align: 'right' },
                    { key: 'balanceValue', header: 'Balance', render: (row: any) => formatCurrency(row.balance || 0), exportValue: (row: any) => Number(row.balance || 0), sortValue: (row: any) => Number(row.balance || 0), align: 'right' },
                    {
                      key: 'actions',
                      header: 'Action',
                      render: (row: any) => (
                        <button type="button" className={secondaryButtonClass} onClick={() => editVendor(row)}>
                          <EditIcon />
                          Edit
                        </button>
                      ),
                      exportValue: () => '',
                    },
                  ]}
                />
              </div>
            </div>
          )}

          {mastersTab === 'assets' && (
            <div className="grid items-start grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <form onSubmit={submitAsset} className="self-start rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                <h2 className="text-lg font-semibold text-white">Fixed Asset</h2>
                <FloatingField label="Asset Name" required value={assetForm.assetName} onChange={(value) => setAssetForm((prev) => ({ ...prev, assetName: value }))} />
                <FloatingField label="Description" value={assetForm.description} onChange={(value) => setAssetForm((prev) => ({ ...prev, description: value }))} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FloatingField label="Cost" type="number" min="0" step="0.01" required value={assetForm.cost} onChange={(value) => setAssetForm((prev) => ({ ...prev, cost: value }))} />
                  <FloatingField label="Life Years" type="number" min="1" required value={assetForm.lifeYears} onChange={(value) => setAssetForm((prev) => ({ ...prev, lifeYears: value }))} />
                  <FloatingField label="Purchase Date" type="date" value={assetForm.purchaseDate} onChange={(value) => setAssetForm((prev) => ({ ...prev, purchaseDate: value }))} />
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
                <FloatingField label="Year" type="number" value={String(periodYear)} onChange={(value) => setPeriodYear(Number(value || new Date().getFullYear()))} />
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
            <form onSubmit={submitSalary} className="max-w-7xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{editingSalaryId ? 'Edit Salary Payment' : 'Salary Payment'}</h2>
                <ManualHelpLink anchor="transaction-salary-payment" />
              </div>
              {editingSalaryId && <p className="text-xs text-cyan-300">Edit mode is active. Update details and click Save Changes.</p>}
              <FloatingField
                label="Employee"
                required
                value={salaryForm.employeeId}
                disabled={employeeMaster.length === 0 || Boolean(editingSalaryId)}
                onChange={(value) => {
                  const employeeId = value;
                  const selected = employeeMaster.find((row) => row._id === employeeId);
                  setSalaryForm({
                    ...salaryForm,
                    employeeId,
                    employeeName: selected?.name || '',
                    designation: selected?.designation || '',
                  });
                }}
                options={[{ value: '', label: 'Select Employee' }, ...employeeMaster.map((row) => ({ value: row._id, label: `${row.employeeCode} - ${row.name}` }))]}
              />
              <FloatingField label="Designation" value={salaryForm.designation} onChange={() => undefined} readOnly />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Salary Month" type="month" required value={salaryForm.month} onChange={(value) => setSalaryForm({ ...salaryForm, month: value })} />
                <FloatingField label="Pay Date" type="date" required value={salaryForm.payDate} onChange={(value) => setSalaryForm({ ...salaryForm, payDate: value })} />
                <button type="button" className={secondaryButtonClass} onClick={loadPayrollComponentsForSalary}>
                  Load Payroll Components
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Base Salary / Earnings" type="number" min="0" step="0.01" required value={salaryForm.amount} onChange={(value) => setSalaryForm({ ...salaryForm, amount: value })} />
                <FloatingField label="Bonus / OT / Arrears" type="number" min="0" step="0.01" value={salaryForm.bonusAmount} onChange={(value) => setSalaryForm({ ...salaryForm, bonusAmount: value })} />
                <FloatingField label="Gross Salary" type="number" min="0" step="0.01" value={salaryForm.grossSalary} onChange={(value) => setSalaryForm({ ...salaryForm, grossSalary: value })} />
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Statutory Deductions</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <FloatingField label="Employee PF" type="number" min="0" step="0.01" value={salaryForm.employeePf} onChange={(value) => setSalaryForm({ ...salaryForm, employeePf: value })} />
                  <FloatingField label="Employee ESI" type="number" min="0" step="0.01" value={salaryForm.employeeEsi} onChange={(value) => setSalaryForm({ ...salaryForm, employeeEsi: value })} />
                  <FloatingField label="Professional Tax" type="number" min="0" step="0.01" value={salaryForm.professionalTax} onChange={(value) => setSalaryForm({ ...salaryForm, professionalTax: value })} />
                  <FloatingField label="Salary TDS" type="number" min="0" step="0.01" value={salaryForm.tdsAmount} onChange={(value) => setSalaryForm({ ...salaryForm, tdsAmount: value })} />
                  <FloatingField label="Total Statutory" type="number" min="0" step="0.01" value={salaryForm.statutoryDeductions} onChange={(value) => setSalaryForm({ ...salaryForm, statutoryDeductions: value })} />
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Voluntary Deductions & Benefits</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <FloatingField label="Retirement Contribution" type="number" min="0" step="0.01" value={salaryForm.retirementContribution} onChange={(value) => setSalaryForm({ ...salaryForm, retirementContribution: value })} />
                  <FloatingField label="Insurance Premium" type="number" min="0" step="0.01" value={salaryForm.insurancePremium} onChange={(value) => setSalaryForm({ ...salaryForm, insurancePremium: value })} />
                  <FloatingField label="Other Deductions" type="number" min="0" step="0.01" value={salaryForm.otherDeductions} onChange={(value) => setSalaryForm({ ...salaryForm, otherDeductions: value })} />
                  <FloatingField label="Total Voluntary" type="number" min="0" step="0.01" value={salaryForm.voluntaryDeductions} onChange={(value) => setSalaryForm({ ...salaryForm, voluntaryDeductions: value })} />
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">Employer Payroll Taxes & Benefits Expense</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <FloatingField label="Employer PF" type="number" min="0" step="0.01" value={salaryForm.employerPf} onChange={(value) => setSalaryForm({ ...salaryForm, employerPf: value })} />
                  <FloatingField label="Employer ESI" type="number" min="0" step="0.01" value={salaryForm.employerEsi} onChange={(value) => setSalaryForm({ ...salaryForm, employerEsi: value })} />
                  <FloatingField label="Employer Payroll Taxes" type="number" min="0" step="0.01" value={salaryForm.employerPayrollTaxes} onChange={(value) => setSalaryForm({ ...salaryForm, employerPayrollTaxes: value })} />
                  <FloatingField label="Benefits Expense" type="number" min="0" step="0.01" value={salaryForm.benefitsExpense} onChange={(value) => setSalaryForm({ ...salaryForm, benefitsExpense: value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-400">Gross Salary</p>
                  <p className="font-semibold text-white">{formatCurrency(salaryDerived.grossSalary)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-400">Total Deductions</p>
                  <p className="font-semibold text-amber-200">{formatCurrency(salaryDerived.totalDeductions)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-400">Net Pay To Bank/Cash</p>
                  <p className="font-semibold text-emerald-300">{formatCurrency(salaryDerived.netPay)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-gray-400">Total Payroll Cost</p>
                  <p className="font-semibold text-cyan-200">{formatCurrency(salaryDerived.totalPayrollCost)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Notes (optional)" value={salaryForm.notes} onChange={(value) => setSalaryForm({ ...salaryForm, notes: value })} />
                <FloatingField label="Payment Method" value={salaryForm.paymentMethod} onChange={(value) => setSalaryForm({ ...salaryForm, paymentMethod: value })} options={salaryPaymentModeOptions} />
              </div>
              <p className="text-xs text-gray-400">Journal posting: debit gross salary, employer payroll tax, and benefits expenses; credit payroll/PF/ESI/retirement/insurance liabilities and cash or bank only for net pay. Liability settlement is handled later through payment vouchers/challans.</p>
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{editingContractId ? 'Edit Contract Payment' : 'Contract Payment'}</h2>
                <ManualHelpLink anchor="transaction-contract-payment" />
              </div>
              {editingContractId && <p className="text-xs text-cyan-300">Edit mode is active. Update the contract payment and save changes with confirmation.</p>}
              <FloatingField label="Contractor Name" required value={contractForm.contractorName} onChange={(value) => setContractForm({ ...contractForm, contractorName: value })} />
              <FloatingField label="Contract Title" required value={contractForm.contractTitle} onChange={(value) => setContractForm({ ...contractForm, contractTitle: value })} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <FloatingField label="Payment Date" type="date" required value={contractForm.paymentDate} onChange={(value) => setContractForm({ ...contractForm, paymentDate: value })} />
                <FloatingField label="Amount" type="number" min="0" step="0.01" required value={contractForm.amount} onChange={(value) => setContractForm({ ...contractForm, amount: value })} />
                <FloatingField
                  label="Status"
                  value={contractForm.status}
                  onChange={(value) => setContractForm({ ...contractForm, status: value })}
                  options={[
                    { value: 'paid', label: 'PAID' },
                    { value: 'partial', label: 'PARTIAL' },
                    { value: 'pending', label: 'PENDING' },
                  ]}
                />
                <FloatingField label="Payment Method" value={contractForm.paymentMethod} onChange={(value) => setContractForm({ ...contractForm, paymentMethod: value })} options={salaryPaymentModeOptions} />
              </div>
              <FloatingField label="Notes (optional)" rows={2} value={contractForm.notes} onChange={(value) => setContractForm({ ...contractForm, notes: value })} />
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
                      <th className="px-2 py-1 text-left">Gross</th>
                      <th className="px-2 py-1 text-left">Deductions</th>
                      <th className="px-2 py-1 text-left">Net Pay</th>
                      <th className="px-2 py-1 text-left">Cost</th>
                      <th className="px-2 py-1 text-left">Payslip</th>
                      <th className="px-2 py-1 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salaryList.slice(0, 12).map((row) => (
                      <tr key={row._id} className="border-t border-white/10">
                        <td className="px-2 py-1">{row.employeeName}</td>
                        <td className="px-2 py-1">{row.month}</td>
                        <td className="px-2 py-1">{formatCurrency(Number(row.grossSalary || Number(row.baseAmount ?? row.amount ?? 0) + Number(row.bonusAmount || 0)))}</td>
                        <td className="px-2 py-1">{formatCurrency(Number(row.totalDeductions || 0))}</td>
                        <td className="px-2 py-1">{formatCurrency(Number(row.netPay ?? row.amount ?? 0))}</td>
                        <td className="px-2 py-1">{formatCurrency(Number(row.totalPayrollCost || row.grossSalary || row.amount || 0))}</td>
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
                        <td colSpan={8} className="px-2 py-3 text-center text-gray-400">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-white">Opening Balances</h2>
              <ManualHelpLink anchor="transaction-opening-balances" />
            </div>
            <p className="text-sm text-gray-300">Status: {openingStatus?.isLocked ? 'Locked' : 'Open'}</p>

            {openingTab === 'balances' && (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FloatingField label="Cash Amount" type="number" value={openingForm.cashAmount} onChange={(value) => setOpeningForm({ ...openingForm, cashAmount: value })} />
                  <FloatingField label="Bank Amount" type="number" value={openingForm.bankAmount} onChange={(value) => setOpeningForm({ ...openingForm, bankAmount: value })} />
                  <FloatingField label="Opening Stock Value" type="number" value={openingForm.openingStockValue} onChange={(value) => setOpeningForm({ ...openingForm, openingStockValue: value })} />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FloatingField label="Cash Side" value={openingForm.cashSide} onChange={(value) => setOpeningForm({ ...openingForm, cashSide: value })} options={[{ value: 'debit', label: 'Cash Debit' }, { value: 'credit', label: 'Cash Credit' }]} />
                  <FloatingField label="Bank Side" value={openingForm.bankSide} onChange={(value) => setOpeningForm({ ...openingForm, bankSide: value })} options={[{ value: 'debit', label: 'Bank Debit' }, { value: 'credit', label: 'Bank Credit' }]} />
                  <FloatingField label="Opening Stock Side" value={openingForm.openingStockSide} onChange={(value) => setOpeningForm({ ...openingForm, openingStockSide: value })} options={[{ value: 'debit', label: 'Stock Debit' }, { value: 'credit', label: 'Stock Credit' }]} />
                </div>
              </>
            )}

            {openingTab === 'party_openings' && (
              <>
                <FloatingField label="Customer accounts: name:amount:side (one per line)" rows={4} value={openingForm.customerAccountsText} onChange={(value) => setOpeningForm({ ...openingForm, customerAccountsText: value })} />
                <FloatingField label="Supplier accounts: name:amount:side (one per line)" rows={4} value={openingForm.supplierAccountsText} onChange={(value) => setOpeningForm({ ...openingForm, supplierAccountsText: value })} />
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{editingDaybookId ? 'Edit Daily Expense/Income Entry' : 'Daily Expense/Income Entry'}</h2>
                <ManualHelpLink anchor="transaction-daybook-entry" />
              </div>
              {editingDaybookId && <p className="text-xs text-cyan-300">Edit mode is active. Update the entry and save changes with confirmation.</p>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Entry Type" value={manualForm.entryType} onChange={(value) => setManualForm({ ...manualForm, entryType: value })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
                <FloatingField label="Category (rent/electricity/interest/etc)" required value={manualForm.category} onChange={(value) => setManualForm({ ...manualForm, category: value })} />
                <FloatingField label="Amount" type="number" min="0" step="0.01" required value={manualForm.amount} onChange={(value) => setManualForm({ ...manualForm, amount: value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Payment Method" value={manualForm.paymentMethod} onChange={(value) => setManualForm({ ...manualForm, paymentMethod: value })} options={paymentModeOptions} />
                <FloatingField label="Entry Date" type="date" value={manualForm.entryDate} onChange={(value) => setManualForm({ ...manualForm, entryDate: value })} />
                <FloatingField label="Reference No" value={manualForm.referenceNo} onChange={(value) => setManualForm({ ...manualForm, referenceNo: value })} />
              </div>
              <FloatingField label="Narration" rows={2} value={manualForm.narration} onChange={(value) => setManualForm({ ...manualForm, narration: value })} />
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
                          Archive
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-white font-semibold">{editingVoucher?.type === 'receipt' ? 'Edit Receipt Voucher' : 'Receipt Voucher (Income)'}</h3>
                <ManualHelpLink anchor="transaction-receipt-voucher" />
              </div>
              {editingVoucher?.type === 'receipt' && <p className="text-xs text-cyan-300">Edit mode is active. Update the voucher and save changes with confirmation.</p>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Amount" type="number" min="0" step="0.01" required value={receiptForm.amount} onChange={(value) => setReceiptForm({ ...receiptForm, amount: value })} />
                <FloatingField label="Voucher Date" type="date" required value={receiptForm.voucherDate} onChange={(value) => setReceiptForm({ ...receiptForm, voucherDate: value })} />
              </div>
              <FloatingField label="Category (interest/commission/service)" required value={receiptForm.category} onChange={(value) => setReceiptForm({ ...receiptForm, category: value })} />
              <FloatingField label="Payment Mode" value={receiptForm.paymentMode} onChange={(value) => setReceiptForm({ ...receiptForm, paymentMode: value })} options={paymentModeOptions} />
              <FloatingField label="Counterparty" value={receiptForm.counterpartyName} onChange={(value) => setReceiptForm({ ...receiptForm, counterpartyName: value })} />
              <FloatingField label="Reference No" value={receiptForm.referenceNo} onChange={(value) => setReceiptForm({ ...receiptForm, referenceNo: value })} />
              <FloatingField label="Notes (optional)" rows={2} value={receiptForm.notes} onChange={(value) => setReceiptForm({ ...receiptForm, notes: value })} />
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
                    entryMode: paymentForm.entryMode,
                    category: paymentForm.category,
                    referenceNo: paymentForm.referenceNo,
                    counterpartyName: paymentForm.accountName,
                    notes: paymentForm.beingPaymentOf,
                    debitAccountId: paymentForm.entryMode === 'settlement' ? paymentForm.debitAccountId : undefined,
                    linkedEntityType: paymentForm.entryMode === 'settlement' ? paymentForm.linkedEntityType : undefined,
                    linkedEntityId: paymentForm.entryMode === 'settlement' ? paymentForm.linkedEntityId : undefined,
                    linkedEntityNumber: paymentForm.entryMode === 'settlement' ? paymentForm.linkedEntityNumber : undefined,
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-white font-semibold">{editingVoucher?.type === 'payment' ? 'Edit Payment Voucher' : 'Payment Voucher (Reference Layout)'}</h3>
                <ManualHelpLink anchor="transaction-payment-voucher" />
              </div>
              {editingVoucher?.type === 'payment' && <p className="text-xs text-cyan-300">Edit mode is active. Update the voucher and save changes with confirmation.</p>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="No. / Reference No" value={paymentForm.referenceNo} onChange={(value) => setPaymentForm({ ...paymentForm, referenceNo: value })} />
                <FloatingField label="Voucher Date" type="date" required value={paymentForm.voucherDate} onChange={(value) => setPaymentForm({ ...paymentForm, voucherDate: value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField
                  label="Payment Purpose"
                  value={paymentForm.entryMode}
                  onChange={(value) => setPaymentForm({ ...paymentForm, entryMode: value })}
                  options={[
                    { value: 'expense', label: 'Expense Payment' },
                    { value: 'settlement', label: 'Bill / Payable Settlement' },
                  ]}
                />
                <FloatingField label={paymentForm.entryMode === 'settlement' ? 'Supplier / Payee Name' : 'Name of the account'} required value={paymentForm.accountName} onChange={(value) => setPaymentForm({ ...paymentForm, accountName: value })} />
              </div>
              <FloatingField label="Being Payment of" rows={2} required value={paymentForm.beingPaymentOf} onChange={(value) => setPaymentForm({ ...paymentForm, beingPaymentOf: value })} />
              <FloatingField label="For the period" value={paymentForm.forPeriod} onChange={(value) => setPaymentForm({ ...paymentForm, forPeriod: value })} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Amount" type="number" min="0" step="0.01" required value={paymentForm.amount} onChange={(value) => setPaymentForm({ ...paymentForm, amount: value })} />
                <FloatingField label="Payment Mode" value={paymentForm.paymentMode} onChange={(value) => setPaymentForm({ ...paymentForm, paymentMode: value })} options={paymentModeOptions} />
                <FloatingField label={paymentForm.entryMode === 'settlement' ? 'Settlement note / account head' : 'Expense category / account head'} required value={paymentForm.category} onChange={(value) => setPaymentForm({ ...paymentForm, category: value })} />
              </div>
              {paymentForm.entryMode === 'settlement' && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FloatingField
                    label="Payable / Liability Account"
                    required
                    value={paymentForm.debitAccountId}
                    onChange={(value) => setPaymentForm({ ...paymentForm, debitAccountId: value })}
                    options={[
                      { value: '', label: 'Select Liability Account' },
                      ...chartAccounts.map((row) => ({ value: row._id, label: `${row.accountCode} - ${row.accountName}` })),
                    ]}
                  />
                  <FloatingField label="Linked Document Type" value={paymentForm.linkedEntityType} onChange={(value) => setPaymentForm({ ...paymentForm, linkedEntityType: value })} />
                  <FloatingField label="Linked Document No." value={paymentForm.linkedEntityNumber} onChange={(value) => setPaymentForm({ ...paymentForm, linkedEntityNumber: value })} />
                </div>
              )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <FloatingField label="Received by" value={paymentForm.receivedBy} onChange={(value) => setPaymentForm({ ...paymentForm, receivedBy: value })} />
                  <FloatingField label="Authorized by" value={paymentForm.authorizedBy} onChange={(value) => setPaymentForm({ ...paymentForm, authorizedBy: value })} />
                </div>
                <p className="text-xs text-gray-400">
                  {paymentForm.entryMode === 'settlement'
                    ? 'Use settlement mode when the payment clears an existing payable like a supplier bill instead of creating a new expense.'
                    : 'Signature fields are kept out of the voucher form for physical signing. Printed signature lines can be turned on or off from General Settings > Printing Preferences.'}
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-white font-semibold">{editingVoucher?.type === 'journal' ? 'Edit Journal Voucher' : 'Journal Voucher'}</h3>
                <ManualHelpLink anchor="transaction-journal-voucher" />
              </div>
              {editingVoucher?.type === 'journal' && <p className="text-xs text-cyan-300">Edit mode is active. Update the journal and save changes with confirmation.</p>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Voucher Date" type="date" required value={journalForm.voucherDate} onChange={(value) => setJournalForm({ ...journalForm, voucherDate: value })} />
                <FloatingField
                  label="Debit Account"
                  required
                  value={journalForm.debitAccountId}
                  onChange={(value) => setJournalForm({ ...journalForm, debitAccountId: value })}
                  options={[{ value: '', label: 'Debit Account' }, ...chartAccounts.map((row) => ({ value: row._id, label: `${row.accountCode} - ${row.accountName}` }))]}
                />
                <FloatingField
                  label="Credit Account"
                  required
                  value={journalForm.creditAccountId}
                  onChange={(value) => setJournalForm({ ...journalForm, creditAccountId: value })}
                  options={[{ value: '', label: 'Credit Account' }, ...chartAccounts.map((row) => ({ value: row._id, label: `${row.accountCode} - ${row.accountName}` }))]}
                />
              </div>
              <FloatingField label="Amount" type="number" min="0" step="0.01" required value={journalForm.amount} onChange={(value) => setJournalForm({ ...journalForm, amount: value })} />
              <FloatingField label="Reference No" value={journalForm.referenceNo} onChange={(value) => setJournalForm({ ...journalForm, referenceNo: value })} />
              <FloatingField label="Notes (optional)" rows={2} value={journalForm.notes} onChange={(value) => setJournalForm({ ...journalForm, notes: value })} />
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-white font-semibold">{editingVoucher?.type === 'transfer' ? 'Edit Cash-Bank Transfer' : 'Cash-Bank Transfer'}</h3>
                <ManualHelpLink anchor="transaction-cash-bank-transfer" />
              </div>
              {editingVoucher?.type === 'transfer' && <p className="text-xs text-cyan-300">Edit mode is active. Update the transfer and save changes with confirmation.</p>}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FloatingField label="Amount" type="number" min="0" step="0.01" required value={transferForm.amount} onChange={(value) => setTransferForm({ ...transferForm, amount: value })} />
                <FloatingField label="Transfer Date" type="date" required value={transferForm.transferDate} onChange={(value) => setTransferForm({ ...transferForm, transferDate: value })} />
                <FloatingField label="Direction" value={transferForm.direction} onChange={(value) => setTransferForm({ ...transferForm, direction: value })} options={[{ value: 'cash_to_bank', label: 'Cash to Bank' }, { value: 'bank_to_cash', label: 'Bank to Cash' }]} />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Reference No" value={transferForm.referenceNo} onChange={(value) => setTransferForm({ ...transferForm, referenceNo: value })} />
                <FloatingField label="Notes" value={transferForm.notes} onChange={(value) => setTransferForm({ ...transferForm, notes: value })} />
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
                          Archive
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
                    <th className="px-2 py-1 text-left">Manage</th>
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
                      <td className="px-2 py-1">
                        {row.managementType && row.managementId ? (
                          <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={() => void openBookEntryManager(row)}>
                            Open
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">Report only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {cashBookPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-3 text-center text-gray-400">
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
                    <th className="px-2 py-1 text-left">Manage</th>
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
                      <td className="px-2 py-1">
                        {row.managementType && row.managementId ? (
                          <button type="button" className="text-cyan-300 hover:text-cyan-200" onClick={() => void openBookEntryManager(row)}>
                            Open
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">Report only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {bankBookPagination.paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-3 text-center text-gray-400">
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
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-white font-semibold">Bank Reconciliation Pending</h3>
                    <ManualHelpLink anchor="transaction-bank-reconciliation" />
                  </div>
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
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-white font-semibold">CSV Bank Reconciliation</h3>
                  <ManualHelpLink anchor="transaction-csv-bank-reconciliation" />
                </div>
                <p className="text-xs text-gray-400">Paste a bank statement CSV with at least `Date` and `Amount` columns, then compare it against unreconciled bank ledger rows.</p>
              </div>
              <FloatingField
                label="Bank statement CSV"
                rows={6}
                value={bankCsvText}
                onChange={setBankCsvText}
                inputClassName="font-mono"
              />
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

      {activeTab === 'treasury' && (
        <AccountingTreasuryWorkspace
          startDate={startDate}
          endDate={endDate}
          refreshKey={treasuryRefreshKey}
        />
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

          {ledgerTab === 'groups' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
              <form onSubmit={saveAccountGroup} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-white font-semibold">{editingGroupId ? 'Edit Group' : 'Add Group'}</h3>
                    <p className="text-xs text-gray-400">Create the accounting group first, then attach ledgers under it.</p>
                  </div>
                  {editingGroupId && (
                    <button type="button" className={secondaryButtonClass} onClick={resetGroupForm}>
                      Cancel
                    </button>
                  )}
                </div>
                <FloatingField label="Group Name" maxLength={50} required value={groupForm.groupName} onChange={(value) => setGroupForm({ ...groupForm, groupName: value })} />
                <FloatingField
                  label="Group Code (auto if blank)"
                  value={groupForm.groupCode}
                  onChange={(value) => setGroupForm({ ...groupForm, groupCode: value })}
                  disabled={Boolean(editingGroupId && accountGroups.find((group) => group._id === editingGroupId)?.isSystem)}
                />
                <FloatingField
                  label="Under"
                  required
                  value={groupForm.under}
                  onChange={(value) => setGroupForm({ ...groupForm, under: value })}
                  disabled={Boolean(editingGroupId && accountGroups.find((group) => group._id === editingGroupId)?.isSystem)}
                  options={[
                    { value: 'asset', label: 'Assets' },
                    { value: 'liability', label: 'Liabilities' },
                    { value: 'income', label: 'Income' },
                    { value: 'expense', label: 'Expenses' },
                  ]}
                />
                <FloatingField
                  label="Parent Group"
                  value={groupForm.parentGroupId}
                  onChange={(value) => setGroupForm({ ...groupForm, parentGroupId: value })}
                  options={[
                    { value: '', label: 'SELF / No parent group' },
                    ...accountGroups
                      .filter((group) => group._id !== editingGroupId)
                      .map((group) => ({ value: group._id, label: `${group.groupName} (${group.groupCode})` })),
                  ]}
                />
                {editingGroupId && (
                  <label className="flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={groupForm.isActive}
                      onChange={(e) => setGroupForm({ ...groupForm, isActive: e.target.checked })}
                      disabled={Boolean(accountGroups.find((group) => group._id === editingGroupId)?.isSystem)}
                    />
                    Active group
                  </label>
                )}
                <button className={buttonClass} disabled={loading}>
                  <CreateIcon />
                  {editingGroupId ? 'Update Group' : 'Save Group'}
                </button>
              </form>

              <ReportDataTable
                title="Manage Groups"
                data={accountGroups}
                itemLabel="groups"
                searchPlaceholder="Search group name, code, under, or parent"
                exportFileName={`account-groups-${endDate}.csv`}
                filters={[
                  {
                    key: 'under',
                    label: 'Under',
                    getValue: (row: AccountGroup) => accountTypeToLabel(row.under),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    getValue: (row: AccountGroup) => row.isActive === false ? 'Inactive' : 'Active',
                  },
                ]}
                columns={[
                  { key: 'groupName', header: 'Group Name', accessor: 'groupName' },
                  { key: 'groupCode', header: 'Group Code', accessor: 'groupCode' },
                  { key: 'underValue', header: 'Under', render: (row: AccountGroup) => accountTypeToLabel(row.under), exportValue: (row: AccountGroup) => accountTypeToLabel(row.under) },
                  { key: 'parentGroupName', header: 'Parent Group', render: (row: AccountGroup) => row.parentGroupName || 'SELF', exportValue: (row: AccountGroup) => row.parentGroupName || 'SELF' },
                  { key: 'statusValue', header: 'Status', render: (row: AccountGroup) => row.isActive === false ? 'Inactive' : 'Active', exportValue: (row: AccountGroup) => row.isActive === false ? 'Inactive' : 'Active' },
                  {
                    key: 'actions',
                    header: 'Action',
                    render: (row: AccountGroup) => (
                      <button type="button" className={secondaryButtonClass} onClick={() => startGroupEdit(row)}>
                        Edit
                      </button>
                    ),
                    exportValue: () => '',
                  },
                ]}
              />
            </div>
          )}

          {ledgerTab === 'ledgers' && (
            <div className="space-y-4">
              <form onSubmit={saveLedgerAccount} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-white font-semibold">{editingLedgerId ? 'Edit Ledger' : 'Add Ledger'}</h3>
                    <p className="text-xs text-gray-400">Ledger records are saved as chart accounts, so accounting reports stay in sync.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingLedgerId && (
                      <button type="button" className={secondaryButtonClass} onClick={resetLedgerForm}>
                        Cancel
                      </button>
                    )}
                    <button type="button" className={secondaryButtonClass} onClick={() => setLedgerTab('groups')}>
                      Add / Edit Groups
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <FloatingField
                    label="Folio No. / Account Code"
                    value={ledgerForm.accountCode}
                    onChange={(value) => setLedgerForm({ ...ledgerForm, accountCode: value })}
                    disabled={Boolean(editingLedgerId && ledgerAccounts.find((row) => row._id === editingLedgerId)?.isSystem)}
                  />
                  <FloatingField label="Account Name" required value={ledgerForm.accountName} onChange={(value) => setLedgerForm({ ...ledgerForm, accountName: value })} />
                  <FloatingField
                    label="Group"
                    required
                    value={ledgerForm.groupId}
                    onChange={(value) => setLedgerForm({ ...ledgerForm, groupId: value })}
                    options={[
                      { value: '', label: 'Select Group' },
                      ...accountGroups
                        .filter((group) => group.isActive !== false)
                        .map((group) => ({ value: group._id, label: `${group.groupName} - ${accountTypeToLabel(group.under)}` })),
                    ]}
                  />
                  <FloatingField label="GST #" value={ledgerForm.gstNumber} onChange={(value) => setLedgerForm({ ...ledgerForm, gstNumber: value.toUpperCase() })} />
                  <FloatingField label="PAN #" value={ledgerForm.panNumber} onChange={(value) => setLedgerForm({ ...ledgerForm, panNumber: value.toUpperCase() })} />
                  <FloatingField
                    label="Ledger Type"
                    value={ledgerForm.subType}
                    onChange={(value) => setLedgerForm({ ...ledgerForm, subType: value })}
                    disabled={Boolean(editingLedgerId && ledgerAccounts.find((row) => row._id === editingLedgerId)?.isSystem)}
                    options={[
                      { value: 'general', label: 'General Ledger' },
                      { value: 'cash', label: 'Cash' },
                      { value: 'bank', label: 'Bank' },
                      { value: 'customer', label: 'Customer' },
                      { value: 'supplier', label: 'Supplier' },
                      { value: 'stock', label: 'Stock' },
                    ]}
                  />
                  <FloatingField label="Opening Balance" type="number" min="0" step="0.01" value={ledgerForm.openingBalance} onChange={(value) => setLedgerForm({ ...ledgerForm, openingBalance: value })} />
                  <FloatingField label="Opening Side" value={ledgerForm.openingSide} onChange={(value) => setLedgerForm({ ...ledgerForm, openingSide: value })} options={debitCreditOptions} />
                </div>
                {editingLedgerId && (
                  <label className="flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="checkbox"
                      checked={ledgerForm.isActive}
                      onChange={(e) => setLedgerForm({ ...ledgerForm, isActive: e.target.checked })}
                      disabled={Boolean(ledgerAccounts.find((row) => row._id === editingLedgerId)?.isSystem)}
                    />
                    Active ledger
                  </label>
                )}
                <button className={buttonClass} disabled={loading}>
                  <AccountIcon />
                  {editingLedgerId ? 'Update Ledger' : 'Save Ledger'}
                </button>
              </form>

              <ReportDataTable
                title="Manage Ledgers"
                data={ledgerAccounts}
                itemLabel="ledgers"
                searchPlaceholder="Search folio, account, group, GST, or PAN"
                exportFileName={`account-ledgers-${endDate}.csv`}
                filters={[
                  { key: 'group', label: 'Group', getValue: (row: ChartAccount) => row.groupName || row.underLabel || accountTypeToLabel(row.accountType) },
                  { key: 'type', label: 'Type', getValue: (row: ChartAccount) => accountTypeToLabel(row.accountType) },
                  { key: 'status', label: 'Status', getValue: (row: ChartAccount) => row.isActive === false ? 'Inactive' : 'Active' },
                ]}
                columns={[
                  { key: 'folioNo', header: 'Folio No.', render: (row: ChartAccount) => row.accountCode || '-', exportValue: (row: ChartAccount) => row.accountCode || '' },
                  { key: 'accountName', header: 'Account Name', accessor: 'accountName' },
                  { key: 'groupName', header: 'Group', render: (row: ChartAccount) => row.groupName || row.underLabel || accountTypeToLabel(row.accountType), exportValue: (row: ChartAccount) => row.groupName || row.underLabel || accountTypeToLabel(row.accountType) },
                  { key: 'gstNumber', header: 'GST #', render: (row: ChartAccount) => row.gstNumber || '-', exportValue: (row: ChartAccount) => row.gstNumber || '' },
                  { key: 'panNumber', header: 'PAN #', render: (row: ChartAccount) => row.panNumber || '-', exportValue: (row: ChartAccount) => row.panNumber || '' },
                  {
                    key: 'openingBalance',
                    header: 'Opening Balance',
                    render: (row: ChartAccount) => `${formatCurrency(row.openingBalance || 0)} ${String(row.openingSide || 'debit').toUpperCase() === 'CREDIT' ? 'Cr' : 'Dr'}`,
                    exportValue: (row: ChartAccount) => `${Number(row.openingBalance || 0)} ${String(row.openingSide || 'debit').toUpperCase() === 'CREDIT' ? 'Cr' : 'Dr'}`,
                    sortValue: (row: ChartAccount) => Number(row.openingBalance || 0),
                    align: 'right',
                  },
                  {
                    key: 'actions',
                    header: 'Action',
                    render: (row: ChartAccount) => (
                      <button type="button" className={secondaryButtonClass} onClick={() => startLedgerEdit(row)}>
                        Edit
                      </button>
                    ),
                    exportValue: () => '',
                  },
                ]}
              />
            </div>
          )}

          {ledgerTab === 'create_account' && (
            <form onSubmit={saveChartAccount} className="max-w-4xl rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <h3 className="text-white font-semibold">Create Chart Account</h3>
              <FloatingField label="Account Name" value={accountForm.accountName} onChange={(value) => setAccountForm({ ...accountForm, accountName: value })} required />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FloatingField label="Account Type" value={accountForm.accountType} onChange={(value) => setAccountForm({ ...accountForm, accountType: value })} options={accountTypeOptions} />
                <FloatingField label="Sub Type" value={accountForm.subType} onChange={(value) => setAccountForm({ ...accountForm, subType: value })} options={accountSubTypeOptions} />
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
                <FloatingField
                  label="Ledger Account"
                  value={selectedAccountId}
                  onChange={(value) => {
                    const id = value;
                    setSelectedAccountId(id);
                    if (id) withLoading(async () => refreshLedger(id));
                  }}
                  options={[{ value: '', label: 'Select account for ledger' }, ...chartAccounts.map((row) => ({ value: row._id, label: `${row.accountCode} - ${row.accountName}` }))]}
                />
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

      {activeTab === 'gst' && <AccountingGstWorkspace />}

      {activeTab === 'tds' && <AccountingTdsWorkspace />}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          <CardTabs
            ariaLabel="Reports section tabs"
            items={reportTabItems}
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
