import mongoose from 'mongoose';
import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { ChartAccount, type AccountType, type IChartAccount } from '../models/ChartAccount.js';
import { ContractPayment } from '../models/ContractPayment.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { Return } from '../models/Return.js';
import { SalaryPayment } from '../models/SalaryPayment.js';
import { Sale } from '../models/Sale.js';

type ProfitLossAccountType = Extract<AccountType, 'income' | 'expense'>;

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
  systemKey?: string;
  groupName?: string;
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

const saleRevenueAmount = (sale: any): number => {
  const itemTaxable = Array.isArray(sale?.items)
    ? sale.items.reduce((sum: number, item: any) => sum + Number(item?.taxableValue || 0), 0)
    : 0;
  if (itemTaxable > 0) return round2(itemTaxable);
  if (sale?.subtotal !== undefined && sale?.subtotal !== null) return round2(Number(sale.subtotal || 0));
  return round2(Math.max(0, Number(sale?.totalAmount || 0) - Number(sale?.totalGst || 0)));
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
  if (name) return name;
  return row.accountType === 'income' ? 'Income' : 'Expense';
};

const isSalesIncomeAccount = (row: Partial<MovementRow>) => {
  const key = String(row.systemKey || '').toLowerCase();
  const name = String(row.accountName || row.category || '').toLowerCase();
  return (
    ['booking_revenue', 'event_revenue', 'sales_revenue'].includes(key) ||
    name.includes('sales') ||
    name.includes('booking revenue') ||
    name.includes('event revenue')
  );
};

const isExpenseAccount = (row: Partial<MovementRow>, keys: string[], names: string[]) => {
  const key = String(row.systemKey || '').toLowerCase();
  const name = String(row.accountName || row.category || '').toLowerCase();
  return keys.includes(key) || names.some((needle) => name.includes(needle));
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

  return rows.map((row: any) => {
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
  const [salesRows, returnRows, dayBookRows, voucherNumbers] = await Promise.all([
    Sale.find({ createdAt: { $gte: start, $lte: end }, ...postedSaleMatch }).sort({ createdAt: -1 }),
    Return.find({ createdAt: { $gte: start, $lte: end }, ...approvedReturnMatch }).sort({ createdAt: -1 }),
    DayBookEntry.find({ entryType: 'income', entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: -1 }),
    getVoucherNumberSet('voucher', start, end),
  ]);

  const rows: MovementRow[] = [];
  for (const row of salesRows) {
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
  const [dayBookRows, salaryRows, contractRows, voucherNumbers, salarySourceIds, contractSourceIds] = await Promise.all([
    DayBookEntry.find({ entryType: 'expense', entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: -1 }),
    SalaryPayment.find({ payDate: { $gte: start, $lte: end } }).sort({ payDate: -1 }),
    ContractPayment.find({ paymentDate: { $gte: start, $lte: end }, status: { $in: ['paid', 'partial'] } }).sort({ paymentDate: -1 }),
    getVoucherNumberSet('voucher', start, end),
    getSourceIdSet('salary_payment', start, end),
    getSourceIdSet('contract_payment', start, end),
  ]);

  const rows: MovementRow[] = [];

  for (const row of dayBookRows) {
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

  const grossSalesIncome = sumNumbers(
    incomeRows.filter((row) => !row.isContraIncome && (isSalesIncomeAccount(row) || row.source === 'legacy_sales')).map((row) => row.amount)
  );
  const salesReturnContra = sumNumbers(incomeRows.filter((row) => row.isContraIncome).map((row) => Math.abs(row.amount)));
  const nonSalesIncome = round2(report.totalIncome - grossSalesIncome + salesReturnContra);

  const salaryExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, ['salary_expense'], ['salary expense', 'salaries', 'wages'])).map((row) => row.amount)
  );
  const contractExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, ['contract_expense'], ['contract expense', 'contract payment'])).map((row) => row.amount)
  );
  const cogsExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, ['cost_of_goods_sold'], ['cost of goods sold', 'cogs'])).map((row) => row.amount)
  );
  const stockLossExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, ['stock_loss'], ['stock loss'])).map((row) => row.amount)
  );
  const depreciationExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, ['depreciation_expense'], ['depreciation expense'])).map((row) => row.amount)
  );
  const payrollTaxExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, [], ['employer payroll tax'])).map((row) => row.amount)
  );
  const benefitsExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, [], ['employee benefits'])).map((row) => row.amount)
  );

  const knownExpense = round2(
    salaryExpense +
      contractExpense +
      cogsExpense +
      stockLossExpense +
      depreciationExpense +
      payrollTaxExpense +
      benefitsExpense
  );
  const otherExpense = round2(report.totalExpense - knownExpense);

  const statementRows = [
    { section: 'Income', particulars: 'Sales / Service Income', amount: grossSalesIncome },
    { section: 'Income', particulars: 'Less: Sales Returns / Refunds', amount: round2(-salesReturnContra), isContra: true },
    { section: 'Income', particulars: 'Other Income', amount: nonSalesIncome },
    { section: 'Income', particulars: 'Total Income', amount: report.totalIncome, isTotal: true },
    { section: 'Expense', particulars: 'Cost of Goods Sold', amount: cogsExpense },
    { section: 'Expense', particulars: 'Stock Loss / Adjustments', amount: stockLossExpense },
    { section: 'Expense', particulars: 'Salary Expense', amount: salaryExpense },
    { section: 'Expense', particulars: 'Employer Payroll Tax Expense', amount: payrollTaxExpense },
    { section: 'Expense', particulars: 'Employee Benefits Expense', amount: benefitsExpense },
    { section: 'Expense', particulars: 'Contract Expense', amount: contractExpense },
    { section: 'Expense', particulars: 'Depreciation Expense', amount: depreciationExpense },
    { section: 'Expense', particulars: 'Other Ledger / Manual Expense', amount: otherExpense },
    { section: 'Expense', particulars: 'Total Expense', amount: report.totalExpense, isTotal: true },
    {
      section: 'Result',
      particulars: report.totalIncome - report.totalExpense >= 0 ? 'Net Profit' : 'Net Loss',
      amount: round2(report.totalIncome - report.totalExpense),
      isTotal: true,
    },
  ];

  return {
    period: { startDate: start, endDate: end },
    income: {
      salesIncome: grossSalesIncome,
      salesReturnContra,
      nonSalesIncome,
      totalIncome: report.totalIncome,
      byCategory: report.incomeByCategory,
    },
    expenses: {
      cogsExpense,
      stockLossExpense,
      salaryExpense,
      payrollTaxExpense,
      benefitsExpense,
      contractExpense,
      depreciationExpense,
      manualExpense: otherExpense,
      otherExpense,
      salesReturnExpense: 0,
      totalExpense: report.totalExpense,
      byCategory: report.expenseByCategory,
    },
    netProfit: round2(report.totalIncome - report.totalExpense),
    rows: statementRows,
    detailRows: { income: incomeRows, expenses: expenseRows },
    sourceSummary: report.sourceSummary,
    legacySummary: report.legacySummary,
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

export const buildTrialBalanceReport = async (start: Date, end: Date) => {
  const beforeStart = new Date(start.getTime() - 1);
  const [accounts, openingLedgerIds, beforeSums, periodSums] = await Promise.all([
    getReportAccounts(end),
    accountIdsWithOpeningLedger(),
    ledgerSumsByAccount({ entryDate: { $lte: beforeStart } }),
    ledgerSumsByAccount({ entryDate: { $gte: start, $lte: end } }),
  ]);

  const rows: AccountSummaryRow[] = accounts.map((account) => {
    const id = String(account._id);
    const before = beforeSums.get(id) || { debit: 0, credit: 0 };
    const period = periodSums.get(id) || { debit: 0, credit: 0 };
    const chartOpening = openingLedgerIds.has(id) ? 0 : signedChartOpening(account);
    const opening = round2(chartOpening + before.debit - before.credit);
    const debit = round2(period.debit);
    const credit = round2(period.credit);
    const closing = round2(opening + debit - credit);
    return {
      accountId: id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      systemKey: account.systemKey,
      groupName: account.groupName,
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
      rows.push({
        accountId: 'synthetic-legacy-income',
        accountCode: 'LEGACY-INCOME',
        accountName: 'Legacy Income Not Yet Posted To Ledger',
        accountType: 'income',
        groupName: 'Report Diagnostics',
        openingBalance: 0,
        debit: legacy.incomeDebit,
        credit: legacy.incomeCredit,
        closingBalance: closing,
        debitBalance: closing > 0 ? closing : 0,
        creditBalance: closing < 0 ? Math.abs(closing) : 0,
      });
    }
    if (legacy.expenseDebit > 0 || legacy.expenseCredit > 0) {
      const closing = round2(legacy.expenseDebit - legacy.expenseCredit);
      rows.push({
        accountId: 'synthetic-legacy-expense',
        accountCode: 'LEGACY-EXP',
        accountName: 'Legacy Expense Not Yet Posted To Ledger',
        accountType: 'expense',
        groupName: 'Report Diagnostics',
        openingBalance: 0,
        debit: legacy.expenseDebit,
        credit: legacy.expenseCredit,
        closingBalance: closing,
        debitBalance: closing > 0 ? closing : 0,
        creditBalance: closing < 0 ? Math.abs(closing) : 0,
      });
    }

    const clearingDiff = round2(legacy.expenseDebit + legacy.incomeDebit - legacy.incomeCredit - legacy.expenseCredit);
    if (clearingDiff !== 0) {
      const debit = clearingDiff < 0 ? Math.abs(clearingDiff) : 0;
      const credit = clearingDiff > 0 ? clearingDiff : 0;
      const closing = round2(debit - credit);
      rows.push({
        accountId: 'synthetic-legacy-clearing',
        accountCode: 'LEGACY-CLR',
        accountName: 'Legacy Transaction Clearing (Migration Required)',
        accountType: 'liability',
        groupName: 'Report Diagnostics',
        openingBalance: 0,
        debit,
        credit,
        closingBalance: closing,
        debitBalance: closing > 0 ? closing : 0,
        creditBalance: closing < 0 ? Math.abs(closing) : 0,
      });
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
    rows.push({
      accountId: 'synthetic-opening-equity',
      accountCode: 'OPEN-EQ',
      accountName: 'Opening Balance Equity / Suspense Difference',
      accountType: 'liability',
      groupName: 'Report Diagnostics',
      openingBalance: syntheticOpening,
      debit,
      credit,
      closingBalance: closing,
      debitBalance: closing > 0 ? closing : 0,
      creditBalance: closing < 0 ? Math.abs(closing) : 0,
    });
  }

  return {
    period: { startDate: start, endDate: end },
    rows,
    totals: {
      debit: round2(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0)),
      credit: round2(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0)),
      debitBalance: round2(rows.reduce((sum, row) => sum + Number(row.debitBalance || 0), 0)),
      creditBalance: round2(rows.reduce((sum, row) => sum + Number(row.creditBalance || 0), 0)),
      debitCreditDifference: round2(
        rows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0)
      ),
      balanceDifference: round2(
        rows.reduce((sum, row) => sum + Number(row.debitBalance || 0) - Number(row.creditBalance || 0), 0)
      ),
    },
    diagnostics: {
      legacyFallbackRows: legacy.rowCount,
      legacyNetProfit: legacy.netProfit,
      syntheticRowsAdded: rows.filter((row) => String(row.accountId || '').startsWith('synthetic-')).length,
    },
    formula: 'Opening balance plus period debits minus period credits. Diagnostic rows expose one-sided openings and legacy records not yet migrated into ledger entries.',
  };
};

export const buildRetainedEarningsUntil = async (end: Date) => {
  const report = await buildProfitLossStatement(fromStartDate(), end);
  return round2(report.netProfit);
};

export const buildBalanceSheetReport = async (asOnDate: Date) => {
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

  for (const account of accounts) {
    const id = String(account._id);
    const totals = ledgerSums.get(id) || { debit: 0, credit: 0 };
    const chartOpening = openingLedgerIds.has(id) ? 0 : signedChartOpening(account);
    const closing = round2(chartOpening + totals.debit - totals.credit);
    if (account.accountType === 'asset' && closing !== 0) {
      assets.push({ accountCode: account.accountCode, accountName: account.accountName, amount: closing });
    }
    if (account.accountType === 'liability') {
      const amount = round2(closing < 0 ? Math.abs(closing) : closing === 0 ? 0 : -closing);
      if (amount !== 0) liabilities.push({ accountCode: account.accountCode, accountName: account.accountName, amount });
    }
  }

  const openingBalanceEquity = round2(openingLedgerDifference.difference);
  const legacyClearing = round2(-Number(profitLoss.legacySummary?.netProfit || 0));
  const equityRows = [
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
  const totalEquity = round2(equityRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalAssets = round2(assets.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const liabilitiesAndEquity = round2(totalLiabilities + totalEquity);

  return {
    asOnDate,
    assets,
    liabilities,
    equity: totalEquity,
    retainedEarnings,
    equityRows,
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      liabilitiesAndEquity,
      difference: round2(totalAssets - liabilitiesAndEquity),
    },
    diagnostics: {
      openingBalanceDifference: openingBalanceEquity,
      openingBalanceLedgerRows: openingLedgerDifference.count,
      legacyNetProfit: profitLoss.legacySummary?.netProfit || 0,
      legacyClearing,
      sourceSummary: profitLoss.sourceSummary,
      note:
        openingBalanceEquity !== 0 || legacyClearing !== 0
          ? 'Diagnostic equity rows are added so the Balance Sheet stays explainable while legacy/opening data is corrected or migrated.'
          : 'Balance Sheet is fully derived from posted ledger balances and retained earnings.',
    },
    formula: 'Assets use debit-positive ledger balances; liabilities use credit-positive balances; equity includes retained earnings plus transparent diagnostic clearing rows for one-sided openings or legacy records.',
  };
};
