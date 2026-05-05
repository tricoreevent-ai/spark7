import mongoose from 'mongoose';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { AccountGroup } from '../models/AccountGroup.js';
import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { ChartAccount, type AccountType, type IChartAccount } from '../models/ChartAccount.js';
import { ContractPayment } from '../models/ContractPayment.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { PurchaseBill } from '../models/PurchaseBill.js';
import { Return } from '../models/Return.js';
import { SalaryPayment } from '../models/SalaryPayment.js';
import { Sale } from '../models/Sale.js';
import {
  buildBalanceSheetIntegrity,
  buildBalanceSheetTotals,
  buildProfitLossSummary,
  buildTrialBalanceIntegrity,
  buildTrialBalanceTotals,
} from './accountingReportMath.js';
import { getReportEntries } from './reportInclusion.js';

type ProfitLossAccountType = Extract<AccountType, 'income' | 'expense'>;
type TrialBalanceSection = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses' | 'Diagnostics';

export interface MovementRow {
  _id: string;
  date: Date;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
  accountType: ProfitLossAccountType;
  systemKey?: string;
  groupName?: string;
  category: string;
  source: string;
  amount: number;
  debit: number;
  credit: number;
  paymentMethod?: string;
  reference?: string;
  narration?: string;
  isLegacyFallback?: boolean;
  isContraIncome?: boolean;
}

interface AccountSummaryRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType?: string;
  systemKey?: string;
  section: TrialBalanceSection;
  groupName?: string;
  parentGroupName?: string;
  reportHead: string;
  reportGroup: string;
  ledgerLabel: string;
  normalBalanceSide: 'debit' | 'credit';
  abnormalBalance: boolean;
  isSubLedger: boolean;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
  debitBalance: number;
  creditBalance: number;
}

const round2 = (value: number) => Number(Number(value || 0).toFixed(2));

const fromStartDate = () => new Date('1970-01-01T00:00:00.000Z');

const postedSaleMatch = {
  saleStatus: { $in: ['completed', 'returned'] },
  $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
};

const approvedReturnMatch = { returnStatus: 'approved' };

const sumNumbers = (values: number[]) => round2(values.reduce((sum, value) => sum + Number(value || 0), 0));

const signedChartOpening = (account: Pick<IChartAccount, 'openingBalance' | 'openingSide'>): number => {
  const amount = round2(Number(account.openingBalance || 0));
  if (amount <= 0) return 0;
  return account.openingSide === 'credit' ? -amount : amount;
};

const normalizeLookupKey = (value: unknown): string => String(value || '').trim().toLowerCase();

const accountTypeToTrialBalanceSection = (accountType?: string): TrialBalanceSection => {
  switch (normalizeLookupKey(accountType)) {
    case 'asset':
      return 'Assets';
    case 'liability':
      return 'Liabilities';
    case 'income':
      return 'Income';
    case 'expense':
      return 'Expenses';
    default:
      return 'Assets';
  }
};

const fallbackGroupNameForTrialBalance = (
  account: Pick<IChartAccount, 'groupName' | 'subType' | 'accountType'>
) => {
  if (String(account.groupName || '').trim()) return String(account.groupName || '').trim();
  if (account.subType === 'cash') return 'Cash-in-hand';
  if (account.subType === 'bank') return 'Bank Accounts';
  if (account.subType === 'customer') return 'Sundry Debtors';
  if (account.subType === 'supplier') return 'Sundry Creditors';
  if (account.subType === 'stock') return 'Stock in Hand';
  return accountTypeToTrialBalanceSection(account.accountType);
};

const deriveTrialBalanceHead = (
  account: Pick<IChartAccount, 'accountType' | 'subType' | 'systemKey' | 'accountName' | 'groupName'>,
  groupLookup: Map<string, { groupName?: string; parentGroupName?: string }>
): {
  section: TrialBalanceSection;
  reportHead: TrialBalanceSection;
  groupName: string;
  parentGroupName: string;
  reportGroup: string;
  ledgerLabel: string;
  normalBalanceSide: 'debit' | 'credit';
  isSubLedger: boolean;
} => {
  const systemKey = String(account.systemKey || '').trim().toLowerCase();
  const subType = String(account.subType || '').trim().toLowerCase();
  const accountName = String(account.accountName || '').trim();
  const resolvedGroupName = fallbackGroupNameForTrialBalance(account);
  const groupRow = groupLookup.get(normalizeLookupKey(resolvedGroupName));
  const parentGroupName = String(groupRow?.parentGroupName || '').trim();
  const visibleParentGroupName = parentGroupName && parentGroupName !== 'SELF' ? parentGroupName : resolvedGroupName;
  const classificationHints = `${accountName} ${resolvedGroupName} ${visibleParentGroupName}`.toLowerCase();

  let section = accountTypeToTrialBalanceSection(account.accountType);
  let reportGroup = visibleParentGroupName || resolvedGroupName || section;
  let ledgerLabel = section === 'Income'
    ? 'Income Ledger'
    : section === 'Expenses'
      ? 'Expense Ledger'
      : section === 'Liabilities'
        ? 'Liability Ledger'
        : 'Asset Ledger';
  let isSubLedger = false;

  if (
    systemKey === 'inventory_opening_reserve'
    || systemKey === 'opening_balance_equity'
    || systemKey === 'capital_account'
    || systemKey === 'retained_earnings'
    || /opening balance equity|capital account|retained earnings|inventory opening reserve|profit & loss account/.test(classificationHints)
  ) {
    section = 'Equity';
    reportGroup = 'Capital & Reserves';
    ledgerLabel = systemKey === 'inventory_opening_reserve' ? 'Inventory Reserve' : 'Equity Ledger';
  } else if (subType === 'customer' || systemKey === 'accounts_receivable') {
    section = 'Assets';
    reportGroup = 'Accounts Receivable';
    ledgerLabel = systemKey === 'accounts_receivable' ? 'Control Account' : 'Customer Sub-ledger';
    isSubLedger = systemKey !== 'accounts_receivable';
  } else if (subType === 'supplier' || systemKey === 'accounts_payable') {
    section = 'Liabilities';
    reportGroup = 'Accounts Payable';
    ledgerLabel = systemKey === 'accounts_payable' ? 'Control Account' : 'Vendor Sub-ledger';
    isSubLedger = systemKey !== 'accounts_payable';
  } else if (subType === 'cash') {
    section = 'Assets';
    reportGroup = 'Current Assets';
    ledgerLabel = 'Cash Ledger';
  } else if (subType === 'bank') {
    section = 'Assets';
    reportGroup = 'Current Assets';
    ledgerLabel = 'Bank Ledger';
  } else if (
    ['gst_input', 'cgst_input', 'sgst_input', 'igst_input'].includes(systemKey)
    || /input gst|cgst input|sgst input|igst input|input tax/.test(classificationHints)
  ) {
    section = 'Assets';
    reportGroup = 'Current Assets';
    ledgerLabel = systemKey === 'gst_input' ? 'Tax Control Account' : 'Input Tax Ledger';
  } else if (subType === 'stock' || systemKey === 'stock_in_hand' || /stock in hand/.test(classificationHints)) {
    section = 'Assets';
    reportGroup = 'Current Assets';
    ledgerLabel = /opening stock/.test(classificationHints) ? 'Inventory Adjustment Ledger' : 'Inventory Ledger';
  } else if (systemKey === 'fixed_assets' || systemKey === 'accumulated_depreciation' || /fixed assets?/.test(classificationHints)) {
    section = 'Assets';
    reportGroup = 'Fixed Assets';
    ledgerLabel = systemKey === 'accumulated_depreciation' ? 'Contra Asset' : 'Fixed Asset Ledger';
  } else if (section === 'Income') {
    reportGroup = visibleParentGroupName || resolvedGroupName || 'Income';
    ledgerLabel = ['booking_revenue', 'event_revenue', 'sales_revenue'].includes(systemKey) || /sales|revenue/.test(classificationHints)
      ? 'Operating Income Ledger'
      : 'Income Ledger';
  } else if (section === 'Expenses') {
    reportGroup = visibleParentGroupName || resolvedGroupName || 'Expenses';
    ledgerLabel = ['cost_of_goods_sold', 'stock_loss'].includes(systemKey) || /cost of goods sold|stock loss|opening stock/.test(classificationHints)
      ? 'Direct Expense Ledger'
      : 'Expense Ledger';
  } else if (section === 'Liabilities') {
    reportGroup = visibleParentGroupName || resolvedGroupName || 'Liabilities';
    ledgerLabel = 'Liability Ledger';
  } else {
    reportGroup = visibleParentGroupName || resolvedGroupName || 'Assets';
    ledgerLabel = 'Asset Ledger';
  }

  return {
    section,
    reportHead: section,
    groupName: resolvedGroupName,
    parentGroupName: visibleParentGroupName || resolvedGroupName || section,
    reportGroup,
    ledgerLabel,
    normalBalanceSide: section === 'Assets' || section === 'Expenses' ? 'debit' : 'credit',
    isSubLedger,
  };
};

const isZeroTrialBalanceRow = (row: Pick<AccountSummaryRow, 'openingBalance' | 'debit' | 'credit' | 'closingBalance'>) =>
  round2(Number(row.openingBalance || 0)) === 0 &&
  round2(Number(row.debit || 0)) === 0 &&
  round2(Number(row.credit || 0)) === 0 &&
  round2(Number(row.closingBalance || 0)) === 0;

const buildTrialBalanceDiagnosticRow = (
  row: Pick<AccountSummaryRow, 'accountId' | 'accountCode' | 'accountName' | 'accountType' | 'openingBalance' | 'debit' | 'credit' | 'closingBalance'>,
  ledgerLabel: string
): AccountSummaryRow => ({
  ...row,
  section: 'Diagnostics',
  groupName: 'Report Diagnostics',
  parentGroupName: 'Report Diagnostics',
  reportHead: 'Diagnostics',
  reportGroup: 'Report Diagnostics',
  ledgerLabel,
  normalBalanceSide: 'credit',
  abnormalBalance: false,
  isSubLedger: false,
  debitBalance: row.closingBalance > 0 ? row.closingBalance : 0,
  creditBalance: row.closingBalance < 0 ? Math.abs(row.closingBalance) : 0,
});

const collectDuplicateTrialBalanceNames = (rows: AccountSummaryRow[]) => {
  const byName = new Map<string, AccountSummaryRow[]>();
  for (const row of rows) {
    if (String(row.accountId || '').startsWith('synthetic-')) continue;
    const key = normalizeLookupKey(row.accountName);
    if (!key) continue;
    const bucket = byName.get(key) || [];
    bucket.push(row);
    byName.set(key, bucket);
  }

  return Array.from(byName.values())
    .filter((bucket) => bucket.length > 1)
    .map((bucket) => ({
      accountName: bucket[0]?.accountName || 'Unnamed Account',
      section: bucket[0]?.section || 'Diagnostics',
      accountCodes: bucket
        .map((row) => String(row.accountCode || '').trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })),
    }))
    .sort((left, right) => left.accountName.localeCompare(right.accountName, undefined, { sensitivity: 'base' }));
};

export const saleRevenueAmount = (sale: any): number => {
  const itemTaxable = Array.isArray(sale?.items)
    ? sale.items.reduce((sum: number, item: any) => sum + Number(item?.taxableValue || 0), 0)
    : 0;
  if (itemTaxable > 0) return round2(itemTaxable);
  if (sale?.subtotal !== undefined && sale?.subtotal !== null) return round2(Number(sale.subtotal || 0));
  if (sale?.grossTotal !== undefined && sale?.grossTotal !== null) {
    return round2(Math.max(0, Number(sale.grossTotal || 0) - Number(sale?.totalGst || 0)));
  }
  return round2(
    Math.max(
      0,
      Number(sale?.totalAmount || 0) - Number(sale?.totalGst || 0) - Number(sale?.roundOffAmount || 0)
    )
  );
};

const returnRevenueAmount = (row: any): number => {
  if (row?.returnedAmount !== undefined && row?.returnedAmount !== null) {
    return round2(Number(row.returnedAmount || 0));
  }
  return round2(Math.max(0, Number(row?.refundAmount || 0) - Number(row?.returnedGst || 0)));
};

const salaryPayrollCostOfDoc = (row: any) =>
  round2(
    Number(
      row?.totalPayrollCost ??
        (Number(row?.grossSalary ?? row?.amount ?? 0) + Number(row?.employerPayrollTaxes || 0) + Number(row?.benefitsExpense || 0))
    )
  );

const getSourceIdSet = async (source: string, start: Date, end: Date): Promise<Set<string>> => {
  const ids = await AccountLedgerEntry.distinct('metadata.sourceId', {
    'metadata.source': source,
    isDeleted: { $ne: true },
    entryDate: { $gte: start, $lte: end },
  });
  return new Set(ids.map((id) => String(id || '')).filter(Boolean));
};

const getVoucherNumberSet = async (source: string, start: Date, end: Date): Promise<Set<string>> => {
  const numbers = await AccountLedgerEntry.distinct('voucherNumber', {
    'metadata.source': source,
    isDeleted: { $ne: true },
    entryDate: { $gte: start, $lte: end },
  });
  return new Set(numbers.map((value) => String(value || '').trim()).filter(Boolean));
};

const categoryFromAccount = (row: any): string => {
  const name = String(row.accountName || row.category || 'Other').trim();
  if (name) return name.replace(/^(Income|Expense)\s*-\s*/i, '').trim();
  return row.accountType === 'income' ? 'Income' : 'Expense';
};

const isSalesIncomeRow = (row: MovementRow) => {
  const key = String(row.systemKey || '').toLowerCase();
  const name = String(row.accountName || row.category || '').toLowerCase();
  return (
    ['booking_revenue', 'event_revenue', 'sales_revenue'].includes(key) ||
    row.source === 'legacy_sales' ||
    name.includes('sales') ||
    name.includes('booking revenue') ||
    name.includes('event revenue')
  );
};

const byCategory = (rows: MovementRow[]) => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const category = String(row.category || 'Other');
    totals.set(category, round2(Number(totals.get(category) || 0) + Number(row.amount || 0)));
  }
  return Array.from(totals.entries()).map(([category, amount]) => ({ category, amount }));
};

const summarizeLegacyRows = (incomeRows: MovementRow[], expenseRows: MovementRow[]) => {
  const legacyIncomeRows = incomeRows.filter((row) => row.isLegacyFallback);
  const legacyExpenseRows = expenseRows.filter((row) => row.isLegacyFallback);
  const incomeCredit = sumNumbers(legacyIncomeRows.filter((row) => row.amount >= 0).map((row) => row.amount));
  const incomeDebit = sumNumbers(legacyIncomeRows.filter((row) => row.amount < 0).map((row) => Math.abs(row.amount)));
  const expenseDebit = sumNumbers(legacyExpenseRows.filter((row) => row.amount >= 0).map((row) => row.amount));
  const expenseCredit = sumNumbers(legacyExpenseRows.filter((row) => row.amount < 0).map((row) => Math.abs(row.amount)));
  const netProfit = round2(incomeCredit - incomeDebit - expenseDebit + expenseCredit);
  return {
    incomeCredit,
    incomeDebit,
    expenseDebit,
    expenseCredit,
    netProfit,
    rowCount: legacyIncomeRows.length + legacyExpenseRows.length,
  };
};

export const getLedgerMovementRows = async (
  accountType: ProfitLossAccountType,
  start: Date,
  end: Date
): Promise<MovementRow[]> => {
  const rows = await AccountLedgerEntry.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        voucherType: { $ne: 'opening' },
        entryDate: { $gte: start, $lte: end },
      },
    },
    { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
    { $unwind: '$account' },
    { $match: { 'account.accountType': accountType } },
    {
      $project: {
        entryDate: 1,
        accountId: 1,
        voucherType: 1,
        voucherNumber: 1,
        referenceNo: 1,
        narration: 1,
        paymentMode: 1,
        debit: 1,
        credit: 1,
        metadata: 1,
        accountCode: '$account.accountCode',
        accountName: '$account.accountName',
        accountType: '$account.accountType',
        systemKey: '$account.systemKey',
        groupName: '$account.groupName',
      },
    },
    { $sort: { entryDate: -1, createdAt: -1, _id: -1 } },
  ]);

  return getReportEntries(rows, { mode: 'default', includeReversal: true }).map((row: any) => {
    const debit = round2(Number(row.debit || 0));
    const credit = round2(Number(row.credit || 0));
    return {
      _id: String(row._id),
      date: row.entryDate,
      accountId: String(row.accountId || ''),
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType,
      systemKey: row.systemKey,
      groupName: row.groupName,
      category: categoryFromAccount(row),
      source: `ledger_${row.voucherType || accountType}`,
      amount: round2(accountType === 'income' ? credit - debit : debit - credit),
      debit,
      credit,
      paymentMethod: row.paymentMode,
      reference: row.voucherNumber || row.referenceNo || String(row._id),
      narration: row.narration,
    };
  });
};

const getLegacyIncomeRows = async (start: Date, end: Date): Promise<MovementRow[]> => {
  const [salesRows, returnRows, dayBookRows, voucherNumbers, dayBookSourceIds, migratedLedgerSales, migratedReturnJournals] = await Promise.all([
    Sale.find({ createdAt: { $gte: start, $lte: end }, ...postedSaleMatch }).sort({ createdAt: -1 }),
    Return.find({ createdAt: { $gte: start, $lte: end }, ...approvedReturnMatch }).sort({ createdAt: -1 }),
    DayBookEntry.find({ entryType: 'income', entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: -1 }),
    getVoucherNumberSet('voucher', start, end),
    getSourceIdSet('daybook_entry', start, end),
    AccountingInvoice.find({
      referenceType: 'sale',
      referenceId: { $exists: true, $ne: '' },
      status: { $ne: 'cancelled' },
      invoiceDate: { $gte: start, $lte: end },
    })
      .select('referenceId')
      .lean(),
    JournalEntry.find({
      referenceType: 'refund',
      status: { $ne: 'cancelled' },
      entryDate: { $gte: start, $lte: end },
      referenceId: { $exists: true, $ne: '' },
    })
      .select('referenceId')
      .lean(),
  ]);

  const rows: MovementRow[] = [];
  const migratedSaleIds = new Set(
    migratedLedgerSales
      .map((row: any) => String(row?.referenceId || '').trim())
      .filter(Boolean)
  );
  const migratedReturnIds = new Set(
    migratedReturnJournals
      .map((row: any) => String(row?.referenceId || '').trim())
      .filter(Boolean)
  );
  for (const row of salesRows) {
    if (Boolean((row as any).ledgerPosted) || Boolean((row as any).migratedToLedger) || migratedSaleIds.has(String((row as any)._id || ''))) {
      continue;
    }
    const amount = saleRevenueAmount(row);
    if (amount <= 0) continue;
    rows.push({
      _id: `legacy-sale-${row._id}`,
      date: row.createdAt || new Date(),
      accountType: 'income',
      category: 'Sales / POS Revenue',
      source: 'legacy_sales',
      amount,
      debit: 0,
      credit: amount,
      paymentMethod: row.paymentMethod,
      reference: row.invoiceNumber || row.saleNumber,
      narration: row.customerName || 'POS sale',
      isLegacyFallback: true,
    });
  }

  for (const row of returnRows) {
    if (migratedReturnIds.has(String((row as any)._id || ''))) {
      continue;
    }
    const amount = returnRevenueAmount(row);
    if (amount <= 0) continue;
    rows.push({
      _id: `legacy-return-${row._id}`,
      date: row.createdAt || new Date(),
      accountType: 'income',
      category: 'Sales Returns / Refunds',
      source: 'legacy_sales_return',
      amount: round2(-amount),
      debit: amount,
      credit: 0,
      paymentMethod: row.refundMethod,
      reference: row.returnNumber,
      narration: row.reason,
      isLegacyFallback: true,
      isContraIncome: true,
    });
  }

  for (const row of dayBookRows) {
    if (dayBookSourceIds.has(String(row._id))) continue;
    const reference = String(row.referenceNo || '').trim();
    if (reference && voucherNumbers.has(reference)) continue;
    const amount = round2(Number(row.amount || 0));
    if (amount <= 0) continue;
    rows.push({
      _id: `legacy-daybook-income-${row._id}`,
      date: row.entryDate,
      accountType: 'income',
      category: row.category || 'Manual Income',
      source: 'legacy_daybook_income',
      amount,
      debit: 0,
      credit: amount,
      paymentMethod: row.paymentMethod,
      reference: reference || String(row._id),
      narration: row.narration,
      isLegacyFallback: true,
    });
  }

  return rows.sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime());
};

const getLegacyExpenseRows = async (start: Date, end: Date): Promise<MovementRow[]> => {
  const [dayBookRows, salaryRows, contractRows, voucherNumbers, dayBookSourceIds, salarySourceIds, contractSourceIds] = await Promise.all([
    DayBookEntry.find({ entryType: 'expense', entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: -1 }),
    SalaryPayment.find({ payDate: { $gte: start, $lte: end } }).sort({ payDate: -1 }),
    ContractPayment.find({ paymentDate: { $gte: start, $lte: end }, status: { $in: ['paid', 'partial'] } }).sort({ paymentDate: -1 }),
    getVoucherNumberSet('voucher', start, end),
    getSourceIdSet('daybook_entry', start, end),
    getSourceIdSet('salary_payment', start, end),
    getSourceIdSet('contract_payment', start, end),
  ]);

  const rows: MovementRow[] = [];

  for (const row of dayBookRows) {
    if (dayBookSourceIds.has(String(row._id))) continue;
    const reference = String(row.referenceNo || '').trim();
    if (reference && voucherNumbers.has(reference)) continue;
    const amount = round2(Number(row.amount || 0));
    if (amount <= 0) continue;
    rows.push({
      _id: `legacy-daybook-expense-${row._id}`,
      date: row.entryDate,
      accountType: 'expense',
      category: row.category || 'Manual Expense',
      source: 'legacy_daybook_expense',
      amount,
      debit: amount,
      credit: 0,
      paymentMethod: row.paymentMethod,
      reference: reference || String(row._id),
      narration: row.narration,
      isLegacyFallback: true,
    });
  }

  for (const row of salaryRows) {
    if (salarySourceIds.has(String(row._id))) continue;
    const amount = salaryPayrollCostOfDoc(row);
    if (amount <= 0) continue;
    rows.push({
      _id: `legacy-salary-${row._id}`,
      date: row.payDate,
      accountType: 'expense',
      category: 'Salary Expense',
      source: 'legacy_salary',
      amount,
      debit: amount,
      credit: 0,
      paymentMethod: row.paymentMethod,
      reference: String(row._id),
      narration: `${row.employeeName} (${row.month}) - payroll cost`,
      isLegacyFallback: true,
    });
  }

  for (const row of contractRows) {
    if (contractSourceIds.has(String(row._id))) continue;
    const amount = round2(Number(row.amount || 0));
    if (amount <= 0) continue;
    rows.push({
      _id: `legacy-contract-${row._id}`,
      date: row.paymentDate,
      accountType: 'expense',
      category: 'Contract Expense',
      source: 'legacy_contract',
      amount,
      debit: amount,
      credit: 0,
      paymentMethod: row.paymentMethod,
      reference: String(row._id),
      narration: `${row.contractorName} - ${row.contractTitle}`,
      isLegacyFallback: true,
    });
  }

  return rows.sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime());
};

export const buildIncomeExpenseReports = async (start: Date, end: Date) => {
  const [ledgerIncomeRows, ledgerExpenseRows, legacyIncomeRows, legacyExpenseRows] = await Promise.all([
    getLedgerMovementRows('income', start, end),
    getLedgerMovementRows('expense', start, end),
    getLegacyIncomeRows(start, end),
    getLegacyExpenseRows(start, end),
  ]);

  const incomeRows = [...ledgerIncomeRows, ...legacyIncomeRows].sort(
    (a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime()
  );
  const expenseRows = [...ledgerExpenseRows, ...legacyExpenseRows].sort(
    (a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime()
  );
  const legacySummary = summarizeLegacyRows(incomeRows, expenseRows);

  return {
    incomeRows,
    expenseRows,
    totalIncome: sumNumbers(incomeRows.map((row) => row.amount)),
    totalExpense: sumNumbers(expenseRows.map((row) => row.amount)),
    incomeByCategory: byCategory(incomeRows),
    expenseByCategory: byCategory(expenseRows),
    sourceSummary: {
      ledgerIncomeRows: ledgerIncomeRows.length,
      ledgerExpenseRows: ledgerExpenseRows.length,
      legacyIncomeRows: legacyIncomeRows.length,
      legacyExpenseRows: legacyExpenseRows.length,
    },
    legacySummary,
  };
};

export const buildProfitLossStatement = async (start: Date, end: Date) => {
  const report = await buildIncomeExpenseReports(start, end);
  const incomeRows = report.incomeRows;
  const expenseRows = report.expenseRows;
  const summary = buildProfitLossSummary(incomeRows, expenseRows);
  const diagnosticNotes: string[] = [];
  const nonSalesIncomeCategories = byCategory(
    incomeRows.filter((row) => !row.isContraIncome && !isSalesIncomeRow(row))
  ).filter((row) => round2(Number(row.amount || 0)) !== 0);
  const nonSalesStatementRows =
    nonSalesIncomeCategories.length > 0
      ? nonSalesIncomeCategories.map((row) => ({
          section: 'Income',
          particulars: row.category,
          amount: row.amount,
        }))
      : [{ section: 'Income', particulars: 'Other Income', amount: summary.nonSalesIncome }];

  const statementRows = [
    { section: 'Income', particulars: 'Sales / Service Income', amount: summary.salesIncome },
    { section: 'Income', particulars: 'Less: Sales Returns / Refunds', amount: round2(-summary.salesReturnContra), isContra: true },
    ...nonSalesStatementRows,
    { section: 'Income', particulars: 'Total Income', amount: summary.totalIncome, isTotal: true },
    { section: 'Expense', particulars: 'Cost of Goods Sold', amount: summary.cogsExpense },
    { section: 'Expense', particulars: 'Stock Loss / Adjustments', amount: summary.stockLossExpense },
    { section: 'Expense', particulars: 'Salary Expense', amount: summary.salaryExpense },
    { section: 'Expense', particulars: 'Employer Payroll Tax Expense', amount: summary.payrollTaxExpense },
    { section: 'Expense', particulars: 'Employee Benefits Expense', amount: summary.benefitsExpense },
    { section: 'Expense', particulars: 'Contract Expense', amount: summary.contractExpense },
    { section: 'Expense', particulars: 'Depreciation Expense', amount: summary.depreciationExpense },
    { section: 'Expense', particulars: 'Other Ledger / Manual Expense', amount: summary.otherExpense },
    { section: 'Expense', particulars: 'Total Expense', amount: summary.totalExpense, isTotal: true },
    {
      section: 'Result',
      particulars: summary.netProfit >= 0 ? 'Net Profit' : 'Net Loss',
      amount: summary.netProfit,
      isTotal: true,
    },
  ];

  if (round2(summary.totalIncome) === 0 && round2(summary.totalExpense) === 0) {
    const capitalizedPurchases = await PurchaseBill.aggregate([
      {
        $match: {
          status: 'posted',
          billDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          total: { $sum: '$totalAmount' },
        },
      },
    ]);
    const purchaseSummary = capitalizedPurchases[0];
    if (purchaseSummary?.count) {
      diagnosticNotes.push(
        `${purchaseSummary.count} purchase bill${purchaseSummary.count > 1 ? 's were' : ' was'} posted in this period for `
        + `${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(round2(Number(purchaseSummary.total || 0)))}. `
        + 'Those entries were capitalized to inventory, so Profit & Loss stays at zero until the stock is sold, consumed, or adjusted.'
      );
    } else {
      diagnosticNotes.push('No income or expense postings were found in this period, so Profit & Loss correctly remains at zero.');
    }
  }

  if (round2(summary.totalIncome) === 0) {
    diagnosticNotes.push('No sales, service revenue, or other income postings were found in the selected period.');
  }

  return {
    period: { startDate: start, endDate: end },
    income: {
      salesIncome: summary.salesIncome,
      salesReturnContra: summary.salesReturnContra,
      nonSalesIncome: summary.nonSalesIncome,
      totalIncome: summary.totalIncome,
      byCategory: report.incomeByCategory,
    },
    expenses: {
      cogsExpense: summary.cogsExpense,
      stockLossExpense: summary.stockLossExpense,
      salaryExpense: summary.salaryExpense,
      payrollTaxExpense: summary.payrollTaxExpense,
      benefitsExpense: summary.benefitsExpense,
      contractExpense: summary.contractExpense,
      depreciationExpense: summary.depreciationExpense,
      manualExpense: summary.otherExpense,
      otherExpense: summary.otherExpense,
      salesReturnExpense: 0,
      totalExpense: summary.totalExpense,
      byCategory: report.expenseByCategory,
    },
    netProfit: summary.netProfit,
    rows: statementRows,
    detailRows: { income: incomeRows, expenses: expenseRows },
    sourceSummary: report.sourceSummary,
    legacySummary: report.legacySummary,
    diagnosticNotes,
    formula: {
      income: 'Income ledger credits minus debits, plus legacy POS/manual income fallbacks, less sales-return contra income. GST collected is excluded from legacy POS revenue.',
      expense: 'Expense ledger debits minus credits, plus legacy manual/payroll/contract fallbacks only when no ledger posting exists.',
      netProfit: 'Total income minus total expense.',
    },
  };
};

const ledgerSumsByAccount = async (match: Record<string, any>) => {
  const rows = await AccountLedgerEntry.aggregate([
    { $match: { isDeleted: { $ne: true }, ...match } },
    {
      $group: {
        _id: '$accountId',
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
  ]);
  return new Map(
    rows.map((row: any) => [
      String(row._id),
      {
        debit: round2(Number(row.debit || 0)),
        credit: round2(Number(row.credit || 0)),
      },
    ])
  );
};

const accountIdsWithLedgerRows = async (end?: Date) => {
  const match: Record<string, any> = { isDeleted: { $ne: true } };
  if (end) match.entryDate = { $lte: end };
  const ids = await AccountLedgerEntry.distinct('accountId', match);
  return ids.map((id) => new mongoose.Types.ObjectId(String(id)));
};

const accountIdsWithOpeningLedger = async () => {
  const ids = await AccountLedgerEntry.distinct('accountId', {
    isDeleted: { $ne: true },
    voucherType: 'opening',
  });
  return new Set(ids.map((id) => String(id)));
};

const getOpeningLedgerDifference = async (end: Date) => {
  const rows = await AccountLedgerEntry.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        voucherType: 'opening',
        entryDate: { $lte: end },
      },
    },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' }, count: { $sum: 1 } } },
  ]);
  return {
    debit: round2(Number(rows[0]?.debit || 0)),
    credit: round2(Number(rows[0]?.credit || 0)),
    difference: round2(Number(rows[0]?.debit || 0) - Number(rows[0]?.credit || 0)),
    count: Number(rows[0]?.count || 0),
  };
};

const getReportAccounts = async (end?: Date) => {
  const ledgerAccountIds = await accountIdsWithLedgerRows(end);
  const filter =
    ledgerAccountIds.length > 0
      ? { $or: [{ isActive: true }, { _id: { $in: ledgerAccountIds } }] }
      : { isActive: true };
  return ChartAccount.find(filter).sort({ accountType: 1, accountCode: 1 });
};

export const buildTrialBalanceReport = async (
  start: Date,
  end: Date,
  options: { includeDiagnostics?: boolean } = {}
) => {
  const beforeStart = new Date(start.getTime() - 1);
  const [accounts, groups, openingLedgerIds, beforeSums, periodSums] = await Promise.all([
    getReportAccounts(end),
    AccountGroup.find({ isActive: true }).select('groupName parentGroupName').lean(),
    accountIdsWithOpeningLedger(),
    ledgerSumsByAccount({ entryDate: { $lte: beforeStart } }),
    ledgerSumsByAccount({ entryDate: { $gte: start, $lte: end } }),
  ]);
  const groupLookup = new Map(
    groups.map((group: any) => [
      normalizeLookupKey(group?.groupName),
      {
        groupName: String(group?.groupName || '').trim(),
        parentGroupName: String(group?.parentGroupName || '').trim(),
      },
    ])
  );

  const rows: AccountSummaryRow[] = accounts.map((account) => {
    const id = String(account._id);
    const before = beforeSums.get(id) || { debit: 0, credit: 0 };
    const period = periodSums.get(id) || { debit: 0, credit: 0 };
    const chartOpening = openingLedgerIds.has(id) ? 0 : signedChartOpening(account);
    const opening = round2(chartOpening + before.debit - before.credit);
    const debit = round2(period.debit);
    const credit = round2(period.credit);
    const closing = round2(opening + debit - credit);
    const head = deriveTrialBalanceHead(account, groupLookup);
    const abnormalBalance = closing !== 0
      && (
        (head.normalBalanceSide === 'debit' && closing < 0)
        || (head.normalBalanceSide === 'credit' && closing > 0)
      );
    return {
      accountId: id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      subType: account.subType,
      systemKey: account.systemKey,
      section: head.section,
      groupName: head.groupName,
      parentGroupName: head.parentGroupName,
      reportHead: head.reportHead,
      reportGroup: head.reportGroup,
      ledgerLabel: head.ledgerLabel,
      normalBalanceSide: head.normalBalanceSide,
      abnormalBalance,
      isSubLedger: head.isSubLedger,
      openingBalance: opening,
      debit,
      credit,
      closingBalance: closing,
      debitBalance: closing > 0 ? closing : 0,
      creditBalance: closing < 0 ? Math.abs(closing) : 0,
    };
  });

  const profitLossBridge = await buildIncomeExpenseReports(start, end);
  const legacy = profitLossBridge.legacySummary;
  if (legacy.rowCount > 0) {
    if (legacy.incomeCredit > 0 || legacy.incomeDebit > 0) {
      const closing = round2(legacy.incomeDebit - legacy.incomeCredit);
      rows.push(buildTrialBalanceDiagnosticRow({
        accountId: 'synthetic-legacy-income',
        accountCode: 'LEGACY-INCOME',
        accountName: 'Legacy Income Not Yet Posted To Ledger',
        accountType: 'income',
        openingBalance: 0,
        debit: legacy.incomeDebit,
        credit: legacy.incomeCredit,
        closingBalance: closing,
      }, 'Legacy Income Bridge'));
    }
    if (legacy.expenseDebit > 0 || legacy.expenseCredit > 0) {
      const closing = round2(legacy.expenseDebit - legacy.expenseCredit);
      rows.push(buildTrialBalanceDiagnosticRow({
        accountId: 'synthetic-legacy-expense',
        accountCode: 'LEGACY-EXP',
        accountName: 'Legacy Expense Not Yet Posted To Ledger',
        accountType: 'expense',
        openingBalance: 0,
        debit: legacy.expenseDebit,
        credit: legacy.expenseCredit,
        closingBalance: closing,
      }, 'Legacy Expense Bridge'));
    }

    const clearingDiff = round2(legacy.expenseDebit + legacy.incomeDebit - legacy.incomeCredit - legacy.expenseCredit);
    if (clearingDiff !== 0) {
      const debit = clearingDiff < 0 ? Math.abs(clearingDiff) : 0;
      const credit = clearingDiff > 0 ? clearingDiff : 0;
      const closing = round2(debit - credit);
      rows.push(buildTrialBalanceDiagnosticRow({
        accountId: 'synthetic-legacy-clearing',
        accountCode: 'LEGACY-CLR',
        accountName: 'Legacy Transaction Clearing (Migration Required)',
        accountType: 'liability',
        openingBalance: 0,
        debit,
        credit,
        closingBalance: closing,
      }, 'Legacy Clearing'));
    }
  }

  const periodDifference = round2(rows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0));
  const closingDifference = round2(rows.reduce((sum, row) => sum + Number(row.closingBalance || 0), 0));
  if (periodDifference !== 0 || closingDifference !== 0) {
    const syntheticPeriodDiff = round2(-periodDifference);
    const syntheticOpening = round2(-closingDifference - syntheticPeriodDiff);
    const debit = syntheticPeriodDiff > 0 ? syntheticPeriodDiff : 0;
    const credit = syntheticPeriodDiff < 0 ? Math.abs(syntheticPeriodDiff) : 0;
    const closing = round2(syntheticOpening + debit - credit);
    rows.push(buildTrialBalanceDiagnosticRow({
      accountId: 'synthetic-opening-equity',
      accountCode: 'OPEN-EQ',
      accountName: 'Opening Balance Equity / Suspense Difference',
      accountType: 'liability',
      openingBalance: syntheticOpening,
      debit,
      credit,
      closingBalance: closing,
    }, 'Opening Difference'));
  }

  const diagnosticRows = rows.filter((row) => row.section === 'Diagnostics' || String(row.accountId || '').startsWith('synthetic-'));
  const visibleRows = rows.filter((row) =>
    !isZeroTrialBalanceRow(row)
    && (options.includeDiagnostics || (row.section !== 'Diagnostics' && !String(row.accountId || '').startsWith('synthetic-')))
  );
  const duplicateAccountNames = collectDuplicateTrialBalanceNames(rows);
  const diagnostics = {
    legacyFallbackRows: legacy.rowCount,
    legacyNetProfit: legacy.netProfit,
    syntheticRowsAdded: diagnosticRows.length,
    diagnosticRows,
    diagnosticsHidden: !options.includeDiagnostics && diagnosticRows.length > 0,
    hiddenZeroBalanceRows: rows.length - visibleRows.length,
    duplicateAccountNames,
  };
  const totals = buildTrialBalanceTotals(visibleRows);
  const integrity = buildTrialBalanceIntegrity(visibleRows, diagnostics);

  return {
    period: { startDate: start, endDate: end },
    rows: visibleRows,
    totals,
    diagnostics,
    integrity,
    formula: 'Opening balance plus period debits minus period credits. Only rows with non-zero opening, movement, or ending balance are shown. Diagnostic rows expose one-sided openings and legacy records not yet migrated into ledger entries.',
  };
};

export const buildRetainedEarningsUntil = async (end: Date) => {
  const report = await buildProfitLossStatement(fromStartDate(), end);
  return round2(report.netProfit);
};

export const buildBalanceSheetReport = async (
  asOnDate: Date,
  options: { includeDiagnostics?: boolean } = {}
) => {
  const [accounts, openingLedgerIds, ledgerSums, profitLoss, openingLedgerDifference] = await Promise.all([
    getReportAccounts(asOnDate),
    accountIdsWithOpeningLedger(),
    ledgerSumsByAccount({ entryDate: { $lte: asOnDate } }),
    buildProfitLossStatement(fromStartDate(), asOnDate),
    getOpeningLedgerDifference(asOnDate),
  ]);
  const retainedEarnings = round2(profitLoss.netProfit);

  const assets: Array<Record<string, any>> = [];
  const liabilities: Array<Record<string, any>> = [];
  const receivableDetails: Array<Record<string, any>> = [];
  const payableDetails: Array<Record<string, any>> = [];
  const customerAdvanceDetails: Array<Record<string, any>> = [];
  const vendorAdvanceDetails: Array<Record<string, any>> = [];
  let accountsReceivable = 0;
  let accountsPayable = 0;
  let customerAdvances = 0;
  let vendorAdvances = 0;
  const receivableControl = accounts.find((account) => account.systemKey === 'accounts_receivable');
  const payableControl = accounts.find((account) => account.systemKey === 'accounts_payable');

  for (const account of accounts) {
    const id = String(account._id);
    const totals = ledgerSums.get(id) || { debit: 0, credit: 0 };
    const chartOpening = openingLedgerIds.has(id) ? 0 : signedChartOpening(account);
    const closing = round2(chartOpening + totals.debit - totals.credit);

    if (account.accountType === 'asset' && (account.subType === 'customer' || account.systemKey === 'accounts_receivable')) {
      if (closing > 0) {
        accountsReceivable = round2(accountsReceivable + closing);
        receivableDetails.push({ accountCode: account.accountCode, accountName: account.accountName, amount: closing });
      } else if (closing < 0) {
        const amount = Math.abs(closing);
        customerAdvances = round2(customerAdvances + amount);
        customerAdvanceDetails.push({ accountCode: account.accountCode, accountName: account.accountName, amount });
      }
      continue;
    }

    if (account.accountType === 'liability' && (account.subType === 'supplier' || account.systemKey === 'accounts_payable')) {
      if (closing < 0) {
        const amount = Math.abs(closing);
        accountsPayable = round2(accountsPayable + amount);
        payableDetails.push({ accountCode: account.accountCode, accountName: account.accountName, amount });
      } else if (closing > 0) {
        vendorAdvances = round2(vendorAdvances + closing);
        vendorAdvanceDetails.push({ accountCode: account.accountCode, accountName: account.accountName, amount: closing });
      }
      continue;
    }

    if (account.accountType === 'asset' && closing !== 0) {
      assets.push({ accountCode: account.accountCode, accountName: account.accountName, amount: closing });
    }
    if (account.accountType === 'liability') {
      const amount = round2(closing < 0 ? Math.abs(closing) : closing === 0 ? 0 : -closing);
      if (amount !== 0) liabilities.push({ accountCode: account.accountCode, accountName: account.accountName, amount });
    }
  }

  if (accountsReceivable !== 0) {
    assets.push({
      accountCode: receivableControl?.accountCode || 'AR',
      accountName: 'Accounts Receivable',
      amount: accountsReceivable,
      details: receivableDetails,
    });
  }
  if (vendorAdvances !== 0) {
    assets.push({
      accountCode: 'VEND-ADV',
      accountName: 'Vendor Advances',
      amount: vendorAdvances,
      details: vendorAdvanceDetails,
    });
  }
  if (accountsPayable !== 0) {
    liabilities.push({
      accountCode: payableControl?.accountCode || 'AP',
      accountName: 'Accounts Payable',
      amount: accountsPayable,
      details: payableDetails,
    });
  }
  if (customerAdvances !== 0) {
    liabilities.push({
      accountCode: 'CUST-ADV',
      accountName: 'Customer Advances',
      amount: customerAdvances,
      details: customerAdvanceDetails,
    });
  }

  const openingBalanceEquity = round2(openingLedgerDifference.difference);
  const legacyClearing = round2(-Number(profitLoss.legacySummary?.netProfit || 0));
  const allEquityRows = [
    {
      accountCode: 'P&L',
      accountName: 'Retained Earnings / Current Profit',
      amount: retainedEarnings,
    },
    ...(openingBalanceEquity !== 0
      ? [{
          accountCode: 'OPEN-EQ',
          accountName: 'Opening Balance Equity / Suspense Difference',
          amount: openingBalanceEquity,
          diagnostic: true,
        }]
      : []),
    ...(legacyClearing !== 0
      ? [{
          accountCode: 'LEGACY-CLR',
          accountName: 'Legacy Transaction Clearing (Migration Required)',
          amount: legacyClearing,
          diagnostic: true,
        }]
      : []),
  ];
  const diagnosticEquityRows = allEquityRows.filter((row) => Boolean((row as any).diagnostic));
  const equityRows = options.includeDiagnostics
    ? allEquityRows
    : allEquityRows.filter((row) => !Boolean((row as any).diagnostic));
  const totals = buildBalanceSheetTotals(assets, liabilities, equityRows);
  const diagnostics = {
    openingBalanceDifference: openingBalanceEquity,
    openingBalanceLedgerRows: openingLedgerDifference.count,
    legacyNetProfit: profitLoss.legacySummary?.netProfit || 0,
    legacyClearing,
    sourceSummary: profitLoss.sourceSummary,
    diagnosticRows: diagnosticEquityRows,
    diagnosticsHidden: !options.includeDiagnostics && diagnosticEquityRows.length > 0,
    note:
      openingBalanceEquity !== 0 || legacyClearing !== 0
        ? 'Diagnostic equity rows are added so the Balance Sheet stays explainable while legacy/opening data is corrected or migrated.'
        : 'Balance Sheet is fully derived from posted ledger balances and retained earnings.',
  };
  const integrity = buildBalanceSheetIntegrity(totals, {
    openingBalanceDifference: diagnostics.openingBalanceDifference,
    legacyClearing: diagnostics.legacyClearing,
    diagnosticRowCount: equityRows.filter((row) => Boolean(row.diagnostic)).length,
  });

  return {
    asOnDate,
    assets,
    liabilities,
    equity: totals.totalEquity,
    retainedEarnings,
    equityRows,
    totals,
    diagnostics,
    integrity,
    formula: 'Assets use debit-positive ledger balances; liabilities use credit-positive balances; equity includes retained earnings plus transparent diagnostic clearing rows for one-sided openings or legacy records.',
  };
};
