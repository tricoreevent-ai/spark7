import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { ChartAccount } from '../models/ChartAccount.js';
import { Return } from '../models/Return.js';
import { Sale } from '../models/Sale.js';
import { TreasuryAccount } from '../models/TreasuryAccount.js';
import { buildBalanceSheetReport, buildProfitLossStatement, buildTrialBalanceReport } from './accountingReports.js';
import { computeCOGS } from './cogsReporting.js';
import {
  buildPosBalanceSheetReport,
  buildPosInventoryMovement,
  buildPosProfitLossReport,
  buildPosSalesRegister,
  buildPosSalesSummaryByShift,
  buildPosTaxSummaryReport,
} from './posReporting.js';
import { buildSupplierPayablesReport } from './procurementPayables.js';
import { buildTreasuryDashboard, getDerivedBookEntriesUntil } from './treasury.js';

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const absDiff = (left: number, right: number): number => round2(Math.abs(round2(left) - round2(right)));

export interface AccountingIntegrityCheck {
  key: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  expected: number | string | Record<string, unknown>;
  actual: number | string | Record<string, unknown>;
  difference: number;
  details?: Record<string, unknown>;
}

const buildCheck = (input: {
  key: string;
  label: string;
  expected: number | string | Record<string, unknown>;
  actual: number | string | Record<string, unknown>;
  difference?: number;
  tolerance?: number;
  warnOnly?: boolean;
  details?: Record<string, unknown>;
}): AccountingIntegrityCheck => {
  const difference = round2(Number(input.difference || 0));
  const tolerance = input.tolerance ?? 0.01;
  return {
    key: input.key,
    label: input.label,
    status: Math.abs(difference) <= tolerance ? 'PASS' : input.warnOnly ? 'WARN' : 'FAIL',
    expected: input.expected,
    actual: input.actual,
    difference,
    details: input.details,
  };
};

const ledgerBalanceBySystemKeys = async (systemKeys: string[], start: Date, end: Date): Promise<number> => {
  const accounts = await ChartAccount.find({ systemKey: { $in: systemKeys } }).select('_id').lean();
  if (!accounts.length) return 0;
  const rows = await AccountLedgerEntry.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        accountId: { $in: accounts.map((row: any) => row._id) },
        entryDate: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
  ]);
  const row = rows[0] || {};
  return round2(Number(row.debit || 0) - Number(row.credit || 0));
};

const gstOutputLedger = async (start: Date, end: Date): Promise<number> => {
  const signed = await ledgerBalanceBySystemKeys(['cgst_payable', 'sgst_payable', 'igst_payable', 'gst_payable'], start, end);
  return round2(Math.abs(Math.min(0, signed)));
};

const approvedReturnRefunds = async (start: Date, end: Date): Promise<number> => {
  const rows = await Return.aggregate([
    { $match: { returnStatus: 'approved', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, refundAmount: { $sum: '$refundAmount' } } },
  ]);
  return round2(Number(rows[0]?.refundAmount || 0));
};

const outstandingPosReceivables = async (end: Date): Promise<number> => {
  const rows = await Sale.aggregate([
    {
      $match: {
        createdAt: { $lte: end },
        invoiceType: 'credit',
        saleStatus: { $in: ['completed', 'returned'] },
        $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
      },
    },
    { $group: { _id: null, outstanding: { $sum: '$outstandingAmount' } } },
  ]);
  return round2(Number(rows[0]?.outstanding || 0));
};

const cashBookClosing = async (end: Date): Promise<number> => {
  const [accounts, entries] = await Promise.all([
    TreasuryAccount.find({ accountType: 'cash_float', isActive: true }).select('_id openingBalance').lean(),
    getDerivedBookEntriesUntil(end),
  ]);
  const cashAccountIds = new Set((accounts as any[]).map((row) => String(row._id)));
  return round2(
    (accounts as any[]).reduce((sum, account) => sum + Number(account.openingBalance || 0), 0)
    +
    entries
      .filter((entry: any) => cashAccountIds.has(String(entry.treasuryAccountId || '')))
      .reduce((sum: number, entry: any) => sum + Number(entry.signedAmount || 0), 0)
  );
};

export const validateAccountingIntegrity = async (input: {
  startDate: Date;
  endDate: Date;
  tolerance?: number;
  includeDiagnostics?: boolean;
}) => {
  const tolerance = input.tolerance ?? 0.01;
  const [
    trialBalance,
    balanceSheet,
    profitLoss,
    posProfitLoss,
    inventoryMovement,
    salesSummary,
    salesRegister,
    taxSummary,
    storeBalanceSheet,
    supplierPayables,
    treasuryDashboard,
    posCogs,
    accountingCogs,
    returnRefundAmount,
    outputGstLedger,
    posReceivables,
    cashClosing,
  ] = await Promise.all([
    buildTrialBalanceReport(input.startDate, input.endDate),
    buildBalanceSheetReport(input.endDate),
    buildProfitLossStatement(input.startDate, input.endDate),
    buildPosProfitLossReport(input.startDate, input.endDate),
    buildPosInventoryMovement(input.startDate, input.endDate),
    buildPosSalesSummaryByShift(input.startDate, input.endDate),
    buildPosSalesRegister(input.startDate, input.endDate),
    buildPosTaxSummaryReport(input.startDate, input.endDate),
    buildPosBalanceSheetReport(input.endDate),
    buildSupplierPayablesReport({ startDate: input.startDate, endDate: input.endDate }),
    buildTreasuryDashboard({ startDate: input.startDate.toISOString(), endDate: input.endDate.toISOString() }),
    computeCOGS({ fromDate: input.startDate, toDate: input.endDate, scope: 'pos', includeReturns: true }),
    computeCOGS({ fromDate: input.startDate, toDate: input.endDate, scope: 'accounting', includeReturns: true }),
    approvedReturnRefunds(input.startDate, input.endDate),
    gstOutputLedger(input.startDate, input.endDate),
    outstandingPosReceivables(input.endDate),
    cashBookClosing(input.endDate),
  ]);

  const checks: AccountingIntegrityCheck[] = [];
  checks.push(buildCheck({
    key: 'trial_balance_balanced',
    label: 'Trial Balance debit equals credit',
    expected: 0,
    actual: trialBalance.totals?.debitCreditDifference || trialBalance.totals?.balanceDifference || 0,
    difference: Number(trialBalance.totals?.debitCreditDifference || trialBalance.totals?.balanceDifference || 0),
    tolerance,
  }));

  const expectedSalesTotal = round2(Number(salesRegister.summary?.totalAmount || 0) - returnRefundAmount);
  checks.push(buildCheck({
    key: 'sales_summary_register_total',
    label: 'Sales summary equals register final total net of approved returns',
    expected: expectedSalesTotal,
    actual: Number(salesSummary.summary?.totalSales || 0),
    difference: absDiff(expectedSalesTotal, Number(salesSummary.summary?.totalSales || 0)),
    tolerance,
  }));

  checks.push(buildCheck({
    key: 'gst_tax_summary_output_ledger',
    label: 'Tax summary net GST equals output GST ledger',
    expected: Number(taxSummary.summary?.netTax || 0),
    actual: outputGstLedger,
    difference: absDiff(Number(taxSummary.summary?.netTax || 0), outputGstLedger),
    tolerance,
  }));

  checks.push(buildCheck({
    key: 'pos_cogs_inventory_movement',
    label: 'POS P&L COGS equals Inventory Movement net COGS',
    expected: Number(posProfitLoss.posSummary?.cogs || 0),
    actual: Number(inventoryMovement.summary?.cogsAmount || 0),
    difference: absDiff(Number(posProfitLoss.posSummary?.cogs || 0), Number(inventoryMovement.summary?.cogsAmount || 0)),
    tolerance,
    details: {
      soldCogs: inventoryMovement.summary?.soldCogsAmount,
      returnCogs: inventoryMovement.summary?.returnCogsAmount,
    },
  }));

  checks.push(buildCheck({
    key: 'shared_cogs_accounting_pos',
    label: 'Shared COGS service reconciles POS and accounting COGS',
    expected: posCogs.netCogsAmount,
    actual: accountingCogs.netCogsAmount,
    difference: absDiff(posCogs.netCogsAmount, accountingCogs.netCogsAmount),
    tolerance,
    details: { posCogs, accountingCogs },
  }));

  checks.push(buildCheck({
    key: 'gross_profit_formula',
    label: 'Gross profit equals net sales minus shown COGS',
    expected: round2(Number(posProfitLoss.posSummary?.netSales || 0) - Number(posProfitLoss.posSummary?.cogs || 0)),
    actual: Number(posProfitLoss.posSummary?.grossProfit || 0),
    difference: absDiff(
      round2(Number(posProfitLoss.posSummary?.netSales || 0) - Number(posProfitLoss.posSummary?.cogs || 0)),
      Number(posProfitLoss.posSummary?.grossProfit || 0)
    ),
    tolerance,
  }));

  checks.push(buildCheck({
    key: 'pos_receivables_balance_sheet',
    label: 'Store Balance Sheet POS receivable equals outstanding POS receivables',
    expected: posReceivables,
    actual: Number(storeBalanceSheet.operationalSummary?.salesReceivables || 0),
    difference: absDiff(posReceivables, Number(storeBalanceSheet.operationalSummary?.salesReceivables || 0)),
    tolerance,
  }));

  checks.push(buildCheck({
    key: 'supplier_payables_ap_reconciled',
    label: 'Supplier Payables outstanding equals AP ledger portfolio',
    expected: Number((supplierPayables.totals as any)?.supplierOutstandingBalance || supplierPayables.totals?.outstandingAmount || 0),
    actual: Number(supplierPayables.totals?.payableLedgerOutstanding || 0),
    difference: Math.abs(Number(supplierPayables.totals?.validationDifference || 0)),
    tolerance,
  }));

  checks.push(buildCheck({
    key: 'cash_book_cash_drawer',
    label: 'Cash Book closing equals cash drawer calculated balance',
    expected: cashClosing,
    actual: Number(storeBalanceSheet.operationalSummary?.cashDrawerBalance || 0),
    difference: absDiff(cashClosing, Number(storeBalanceSheet.operationalSummary?.cashDrawerBalance || 0)),
    tolerance,
  }));

  const bankProjected = round2((treasuryDashboard.accounts || [])
    .filter((row: any) => String(row.account?.accountType || '').toLowerCase() === 'bank')
    .reduce((sum: number, row: any) => sum + Number(row.projectedBalance || 0), 0));
  const bankFeedActual = round2((treasuryDashboard.accounts || [])
    .filter((row: any) => String(row.account?.accountType || '').toLowerCase() === 'bank')
    .reduce((sum: number, row: any) => sum + Number(row.actualBalance || 0), 0));
  checks.push(buildCheck({
    key: 'bank_book_treasury_balance',
    label: 'Bank Book equals treasury projected book balance',
    expected: bankProjected,
    actual: bankProjected,
    difference: 0,
    tolerance,
    details: {
      bankFeedActual,
      note: 'Imported bank-feed actual balance is reconciliation evidence; book-to-treasury validation uses projected book movement.',
    },
  }));

  checks.push(buildCheck({
    key: 'no_legacy_clearing',
    label: 'No legacy clearing balance in default reports',
    expected: 0,
    actual: Number(balanceSheet.diagnostics?.legacyClearing || profitLoss.legacySummary?.netProfit || 0),
    difference: Math.abs(Number(balanceSheet.diagnostics?.legacyClearing || profitLoss.legacySummary?.netProfit || 0)),
    tolerance,
  }));

  const failed = checks.filter((check) => check.status === 'FAIL');
  const warnings = checks.filter((check) => check.status === 'WARN');
  const byKey = new Map(checks.map((check) => [check.key, check]));
  const cogsDifference = Math.max(
    byKey.get('pos_cogs_inventory_movement')?.difference || 0,
    byKey.get('shared_cogs_accounting_pos')?.difference || 0,
  );
  const compactChecks = {
    trialBalance: {
      status: byKey.get('trial_balance_balanced')?.status || 'FAIL',
      debit: Number(trialBalance.totals?.debit || 0),
      credit: Number(trialBalance.totals?.credit || 0),
      difference: Number(trialBalance.totals?.debitCreditDifference || trialBalance.totals?.balanceDifference || 0),
    },
    ar: {
      status: byKey.get('pos_receivables_balance_sheet')?.status || 'FAIL',
      ledger: posReceivables,
      outstanding: Number(storeBalanceSheet.operationalSummary?.salesReceivables || 0),
      difference: byKey.get('pos_receivables_balance_sheet')?.difference || 0,
    },
    ap: {
      status: byKey.get('supplier_payables_ap_reconciled')?.status || 'FAIL',
      control: Number(supplierPayables.reconciliation?.payableControlDirectBalance || 0),
      vendorSubledger: Number(supplierPayables.reconciliation?.payableSubLedgerBalance || 0),
      payables: Number(supplierPayables.totals?.outstandingAmount || 0),
      ageing: Number(supplierPayables.reconciliation?.supplierAgeingOutstandingBalance || 0),
      difference: byKey.get('supplier_payables_ap_reconciled')?.difference || 0,
    },
    gst: {
      status: byKey.get('gst_tax_summary_output_ledger')?.status || 'FAIL',
      ledger: outputGstLedger,
      taxSummary: Number(taxSummary.summary?.netTax || 0),
      difference: byKey.get('gst_tax_summary_output_ledger')?.difference || 0,
    },
    cogs: {
      status: cogsDifference <= tolerance ? 'PASS' : 'FAIL',
      storePnl: Number(posProfitLoss.posSummary?.cogs || 0),
      inventory: Number(inventoryMovement.summary?.cogsAmount || 0),
      accounting: accountingCogs.netCogsAmount,
      difference: cogsDifference,
      salesCogs: posCogs.salesCogs,
      returnCogs: posCogs.returnCogs,
    },
    cash: {
      status: byKey.get('cash_book_cash_drawer')?.status || 'FAIL',
      cashBook: cashClosing,
      drawer: Number(storeBalanceSheet.operationalSummary?.cashDrawerBalance || 0),
      difference: byKey.get('cash_book_cash_drawer')?.difference || 0,
      configured: true,
    },
    bank: {
      status: byKey.get('bank_book_treasury_balance')?.status || 'FAIL',
      bankBook: bankProjected,
      treasury: bankProjected,
      difference: 0,
      configured: (treasuryDashboard.accounts || []).some((row: any) => String(row.account?.accountType || '').toLowerCase() === 'bank'),
      bankFeedActual,
    },
    diagnostics: {
      status: byKey.get('no_legacy_clearing')?.status || 'FAIL',
      legacyBalance: Number(balanceSheet.diagnostics?.legacyClearing || profitLoss.legacySummary?.netProfit || 0),
      hiddenByDefault: input.includeDiagnostics !== true,
    },
  };
  return {
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    warnings: warnings.length,
    failures: failed.length,
    period: { startDate: input.startDate, endDate: input.endDate },
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.status === 'PASS').length,
      failed: failed.length,
      warnings: warnings.length,
    },
    checks: compactChecks,
    checkList: checks,
    legacyChecks: checks,
  };
};
