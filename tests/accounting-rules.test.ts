import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBankReconciliationMatches,
  buildDepreciationPostingPlan,
  buildExpensePostingPlan,
  buildGstSetoffSummary,
  buildInvoicePostingPlan,
  buildPaymentPostingPlan,
  buildPosReturnPostingPlan,
  buildPurchaseBillTaxPostingPlan,
  buildRefundPostingPlan,
  calculateGstBreakup,
  inferGstTreatmentFromPartyGstins,
  toPeriodKey,
  validateJournalLines,
} from '../src/server/services/accountingRules.ts';
import {
  buildBalanceSheetIntegrity,
  buildBalanceSheetTotals,
  buildProfitLossSummary,
  buildTrialBalanceIntegrity,
  buildTrialBalanceTotals,
} from '../src/server/services/accountingReportMath.ts';
import { getReportEntries, isReportEntryIncluded } from '../src/server/services/reportInclusion.ts';

test('cash booking posts cash against booking revenue in one balanced entry', () => {
  const plan = buildInvoicePostingPlan({
    baseAmount: 2000,
    paymentAmount: 2000,
    revenueAccountKey: 'booking_revenue',
  });

  assert.equal(plan.postingMode, 'cash_sale');
  assert.equal(plan.invoiceLines.length, 2);
  assert.deepEqual(plan.invoiceLines[0], {
    accountKey: 'cash_in_hand',
    debit: 2000,
    credit: 0,
    description: 'Customer payment received',
  });
  assert.deepEqual(plan.invoiceLines[1], {
    accountKey: 'booking_revenue',
    debit: 0,
    credit: 2000,
    description: 'Recognize revenue',
  });
  assert.doesNotThrow(() => validateJournalLines(plan.invoiceLines));
});

test('credit booking raises receivable first and later payment clears receivable', () => {
  const invoicePlan = buildInvoicePostingPlan({
    baseAmount: 2000,
    paymentAmount: 0,
    revenueAccountKey: 'booking_revenue',
  });

  assert.equal(invoicePlan.postingMode, 'credit_invoice');
  assert.deepEqual(invoicePlan.invoiceLines[0], {
    accountKey: 'accounts_receivable',
    debit: 2000,
    credit: 0,
    description: 'Raise receivable',
  });
  assert.deepEqual(invoicePlan.invoiceLines[1], {
    accountKey: 'booking_revenue',
    debit: 0,
    credit: 2000,
    description: 'Recognize revenue',
  });

  const paymentPlan = buildInvoicePostingPlan({
    baseAmount: 2000,
    paymentAmount: 500,
    revenueAccountKey: 'booking_revenue',
  });

  assert.equal(paymentPlan.postingMode, 'invoice_plus_payment');
  assert.deepEqual(paymentPlan.paymentLines, [
    {
      accountKey: 'cash_in_hand',
      debit: 500,
      credit: 0,
      description: 'Partial payment received',
    },
    {
      accountKey: 'accounts_receivable',
      debit: 0,
      credit: 500,
      description: 'Reduce receivable',
    },
  ]);
});

test('GST invoice splits into CGST and SGST payable for intrastate booking', () => {
  const gst = calculateGstBreakup({
    baseAmount: 1000,
    gstAmount: 180,
    gstTreatment: 'intrastate',
  });

  assert.deepEqual(gst, {
    baseAmount: 1000,
    gstAmount: 180,
    totalAmount: 1180,
    cgstAmount: 90,
    sgstAmount: 90,
    igstAmount: 0,
    gstTreatment: 'intrastate',
  });

  const plan = buildInvoicePostingPlan({
    baseAmount: 1000,
    gstAmount: 180,
    gstTreatment: 'intrastate',
    paymentAmount: 1180,
    revenueAccountKey: 'booking_revenue',
  });

  assert.equal(plan.invoiceLines.length, 4);
  assert.equal(plan.invoiceLines[0].debit, 1180);
  assert.equal(plan.invoiceLines[1].credit, 1000);
  assert.equal(plan.invoiceLines[2].credit, 90);
  assert.equal(plan.invoiceLines[3].credit, 90);
});

test('discount-aware GST invoice keeps receivable at collectible total while preserving gross revenue and GST', () => {
  const plan = buildInvoicePostingPlan({
    baseAmount: 2789,
    discountAmount: 66.02,
    gstAmount: 502.02,
    gstTreatment: 'intrastate',
    paymentAmount: 0,
    revenueAccountKey: 'sales_revenue',
  });

  assert.equal(plan.postingMode, 'credit_invoice');
  assert.equal(plan.collectibleTotal, 3225);
  assert.equal(plan.discountAmount, 66.02);
  assert.deepEqual(plan.invoiceLines, [
    {
      accountKey: 'accounts_receivable',
      debit: 3225,
      credit: 0,
      description: 'Raise receivable',
    },
    {
      accountKey: 'sales_discount',
      debit: 66.02,
      credit: 0,
      description: 'Invoice discount',
    },
    {
      accountKey: 'sales_revenue',
      debit: 0,
      credit: 2789,
      description: 'Recognize revenue',
    },
    {
      accountKey: 'cgst_payable',
      debit: 0,
      credit: 251.01,
      description: 'CGST payable',
    },
    {
      accountKey: 'sgst_payable',
      debit: 0,
      credit: 251.01,
      description: 'SGST payable',
    },
  ]);
});

test('cash POS invoice can post round-off gain without leaving the extra amount in receivables', () => {
  const plan = buildInvoicePostingPlan({
    baseAmount: 595.2,
    gstAmount: 71.42,
    gstTreatment: 'intrastate',
    roundOffAmount: 0.38,
    paymentAmount: 667,
    revenueAccountKey: 'sales_revenue',
  });

  assert.equal(plan.postingMode, 'cash_sale');
  assert.equal(plan.collectibleTotal, 667);
  assert.equal(plan.roundOffAmount, 0.38);
  assert.deepEqual(plan.invoiceLines, [
    {
      accountKey: 'cash_in_hand',
      debit: 667,
      credit: 0,
      description: 'Customer payment received',
    },
    {
      accountKey: 'round_off_income',
      debit: 0,
      credit: 0.38,
      description: 'Invoice round-off gain',
    },
    {
      accountKey: 'sales_revenue',
      debit: 0,
      credit: 595.2,
      description: 'Recognize revenue',
    },
    {
      accountKey: 'cgst_payable',
      debit: 0,
      credit: 35.71,
      description: 'CGST payable',
    },
    {
      accountKey: 'sgst_payable',
      debit: 0,
      credit: 35.71,
      description: 'SGST payable',
    },
  ]);
});

test('POS return with direct refund reverses revenue, GST, inventory, and payout in one balanced plan', () => {
  const plan = buildPosReturnPostingPlan({
    revenueAmount: 100,
    gstAmount: 18,
    gstTreatment: 'intrastate',
    cogsAmount: 60,
    restockInventory: true,
    settleRefund: true,
    paymentMode: 'cash',
  });

  assert.deepEqual(plan.lines, [
    { accountKey: 'sales_revenue', debit: 100, credit: 0, description: 'Reverse sales revenue' },
    { accountKey: 'cgst_payable', debit: 9, credit: 0, description: 'Reverse CGST payable' },
    { accountKey: 'sgst_payable', debit: 9, credit: 0, description: 'Reverse SGST payable' },
    { accountKey: 'stock_in_hand', debit: 60, credit: 0, description: 'Return inventory at cost' },
    { accountKey: 'cost_of_goods_sold', debit: 0, credit: 60, description: 'Reverse cost of goods sold' },
    { accountKey: 'cash_in_hand', debit: 0, credit: 118, description: 'Refund payout' },
  ]);
});

test('POS return pending settlement credits receivables instead of cash while still reversing revenue and GST', () => {
  const plan = buildPosReturnPostingPlan({
    revenueAmount: 100,
    gstAmount: 18,
    gstTreatment: 'intrastate',
    cogsAmount: 0,
    restockInventory: false,
    settleRefund: false,
    paymentMode: 'cash',
  });

  assert.deepEqual(plan.lines, [
    { accountKey: 'sales_revenue', debit: 100, credit: 0, description: 'Reverse sales revenue' },
    { accountKey: 'cgst_payable', debit: 9, credit: 0, description: 'Reverse CGST payable' },
    { accountKey: 'sgst_payable', debit: 9, credit: 0, description: 'Reverse SGST payable' },
    { accountKey: 'accounts_receivable', debit: 0, credit: 118, description: 'Return credit pending settlement' },
  ]);
});

test('shared report inclusion rule excludes cancelled and diagnostic rows while keeping reversal effects', () => {
  const rows = getReportEntries([
    { referenceType: 'invoice', status: 'posted', amount: 100 },
    { referenceType: 'invoice', status: 'cancelled', amount: 100 },
    { referenceType: 'reversal', status: 'posted', amount: -100 },
    { referenceType: 'manual', status: 'posted', isDiagnosticEntry: true, amount: 25 },
  ] as any);

  assert.deepEqual(rows.map((row: any) => row.amount), [100, -100]);
  assert.equal(isReportEntryIncluded({ referenceType: 'reversal', status: 'posted' }), true);
  assert.equal(isReportEntryIncluded({ referenceType: 'invoice', status: 'cancelled' }), false);
  assert.equal(isReportEntryIncluded({ isDiagnosticEntry: true }), false);
  assert.equal(isReportEntryIncluded({ isDiagnosticEntry: true }, { mode: 'diagnostic' }), true);
});

test('credit invoice with positive round-off keeps receivable equal to rounded payable amount', () => {
  const plan = buildInvoicePostingPlan({
    baseAmount: 595.2,
    gstAmount: 71.42,
    gstTreatment: 'intrastate',
    roundOffAmount: 0.38,
    paymentAmount: 0,
    revenueAccountKey: 'sales_revenue',
  });

  assert.equal(plan.postingMode, 'credit_invoice');
  assert.equal(plan.collectibleTotal, 667);
  assert.deepEqual(plan.invoiceLines, [
    {
      accountKey: 'accounts_receivable',
      debit: 667,
      credit: 0,
      description: 'Raise receivable',
    },
    {
      accountKey: 'round_off_income',
      debit: 0,
      credit: 0.38,
      description: 'Invoice round-off gain',
    },
    {
      accountKey: 'sales_revenue',
      debit: 0,
      credit: 595.2,
      description: 'Recognize revenue',
    },
    {
      accountKey: 'cgst_payable',
      debit: 0,
      credit: 35.71,
      description: 'CGST payable',
    },
    {
      accountKey: 'sgst_payable',
      debit: 0,
      credit: 35.71,
      description: 'SGST payable',
    },
  ]);
});

test('round-down invoices post the difference to round-off expense instead of forcing receivable drift', () => {
  const plan = buildInvoicePostingPlan({
    baseAmount: 595.2,
    gstAmount: 71.42,
    gstTreatment: 'intrastate',
    roundOffAmount: -0.12,
    paymentAmount: 666.5,
    revenueAccountKey: 'sales_revenue',
  });

  assert.equal(plan.collectibleTotal, 666.5);
  assert.deepEqual(plan.invoiceLines[1], {
    accountKey: 'round_off_expense',
    debit: 0.12,
    credit: 0,
    description: 'Invoice round-off loss',
  });
});

test('expense entry debits expense and credits cash when fully paid', () => {
  const plan = buildExpensePostingPlan({
    amount: 5000,
    paidAmount: 5000,
    paymentMode: 'cash',
    expenseAccountKey: 'general_expense',
  });

  assert.equal(plan.postingMode, 'cash_expense');
  assert.deepEqual(plan.expenseLines, [
    {
      accountKey: 'general_expense',
      debit: 5000,
      credit: 0,
      description: 'Record expense',
    },
    {
      accountKey: 'cash_in_hand',
      debit: 0,
      credit: 5000,
      description: 'Expense paid',
    },
  ]);
});

test('ACC-INV-02 unpaid GST invoice raises full receivable until later settlement', () => {
  const plan = buildInvoicePostingPlan({
    baseAmount: 2500,
    gstRate: 5,
    gstTreatment: 'intrastate',
    paymentAmount: 0,
    paymentMode: 'cash',
    revenueAccountKey: 'sales_revenue',
  });

  assert.equal(plan.postingMode, 'credit_invoice');
  assert.deepEqual(plan.invoiceLines, [
    {
      accountKey: 'accounts_receivable',
      debit: 2625,
      credit: 0,
      description: 'Raise receivable',
    },
    {
      accountKey: 'sales_revenue',
      debit: 0,
      credit: 2500,
      description: 'Recognize revenue',
    },
    {
      accountKey: 'cgst_payable',
      debit: 0,
      credit: 62.5,
      description: 'CGST payable',
    },
    {
      accountKey: 'sgst_payable',
      debit: 0,
      credit: 62.5,
      description: 'SGST payable',
    },
  ]);
});

test('ACC-INV-03 vendor bill partial payment creates payable and later settlement lines', () => {
  const plan = buildExpensePostingPlan({
    amount: 4500,
    paidAmount: 2000,
    paymentMode: 'bank',
    expenseAccountKey: 'repairs_expense',
  });

  assert.equal(plan.postingMode, 'expense_plus_payment');
  assert.deepEqual(plan.expenseLines, [
    {
      accountKey: 'repairs_expense',
      debit: 4500,
      credit: 0,
      description: 'Record vendor expense',
    },
    {
      accountKey: 'accounts_payable',
      debit: 0,
      credit: 4500,
      description: 'Create payable',
    },
  ]);
  assert.deepEqual(plan.paymentLines, [
    {
      accountKey: 'accounts_payable',
      debit: 2000,
      credit: 0,
      description: 'Reduce payable',
    },
    {
      accountKey: 'bank_account',
      debit: 0,
      credit: 2000,
      description: 'Vendor payment',
    },
  ]);
});

test('purchase bill posts stock at taxable cost and parks intrastate GST in input ledgers', () => {
  const plan = buildPurchaseBillTaxPostingPlan({
    taxableAmount: 100000,
    taxAmount: 14304,
    totalAmount: 114304,
  });

  assert.equal(plan.gst.gstTreatment, 'intrastate');
  assert.deepEqual(plan.inputTaxLines, [
    {
      accountKey: 'cgst_input',
      debit: 7152,
      credit: 0,
      description: 'CGST input credit',
    },
    {
      accountKey: 'sgst_input',
      debit: 7152,
      credit: 0,
      description: 'SGST input credit',
    },
  ]);
  assert.deepEqual(plan.payableLine, {
    accountKey: 'accounts_payable',
    debit: 0,
    credit: 114304,
    description: 'Supplier payable',
  });
});

test('purchase GST treatment switches to interstate when supplier and store GSTIN states differ', () => {
  assert.equal(
    inferGstTreatmentFromPartyGstins('29ABCDE1234F1Z5', '27ABCDE1234F1Z5'),
    'interstate'
  );

  const plan = buildPurchaseBillTaxPostingPlan({
    taxableAmount: 2500,
    taxAmount: 450,
    supplierGstin: '29ABCDE1234F1Z5',
    storeGstin: '27ABCDE1234F1Z5',
  });

  assert.equal(plan.gst.gstTreatment, 'interstate');
  assert.deepEqual(plan.inputTaxLines, [
    {
      accountKey: 'igst_input',
      debit: 450,
      credit: 0,
      description: 'IGST input credit',
    },
  ]);
  assert.equal(plan.payableLine.credit, 2950);
});

test('GST set-off summary returns payable when output tax exceeds input tax', () => {
  const summary = buildGstSetoffSummary({
    outputTax: 18000,
    inputTax: 14304,
  });

  assert.deepEqual(summary, {
    outputTax: 18000,
    inputTax: 14304,
    reverseChargeTax: 0,
    interest: 0,
    lateFee: 0,
    netBalance: 3696,
    gstPayable: 3696,
    gstReceivable: 0,
  });
});

test('GST set-off summary returns receivable when input tax exceeds output tax', () => {
  const summary = buildGstSetoffSummary({
    outputTax: 7200,
    inputTax: 9500,
  });

  assert.deepEqual(summary, {
    outputTax: 7200,
    inputTax: 9500,
    reverseChargeTax: 0,
    interest: 0,
    lateFee: 0,
    netBalance: -2300,
    gstPayable: 0,
    gstReceivable: 2300,
  });
});

test('ACC-SET-01 settlement receipt clears receivable through bank', () => {
  const lines = buildPaymentPostingPlan({
    amount: 9160,
    paymentMode: 'bank_transfer',
  });

  assert.deepEqual(lines, [
    {
      accountKey: 'bank_account',
      debit: 9160,
      credit: 0,
      description: 'Payment received',
    },
    {
      accountKey: 'accounts_receivable',
      debit: 0,
      credit: 9160,
      description: 'Settle balance',
    },
  ]);
});

test('refund reverses revenue and credits cash or bank', () => {
  const plan = buildRefundPostingPlan({
    baseAmount: 1000,
    paymentMode: 'cash',
    revenueAccountKey: 'booking_revenue',
  });

  assert.deepEqual(plan.lines, [
    {
      accountKey: 'booking_revenue',
      debit: 1000,
      credit: 0,
      description: 'Reverse revenue',
    },
    {
      accountKey: 'cash_in_hand',
      debit: 0,
      credit: 1000,
      description: 'Refund payout',
    },
  ]);
});

test('ACC-GST-03 refund reverses GST liability along with revenue', () => {
  const plan = buildRefundPostingPlan({
    baseAmount: 10000,
    gstAmount: 1800,
    gstTreatment: 'intrastate',
    paymentMode: 'bank_transfer',
    revenueAccountKey: 'sales_revenue',
  });

  assert.deepEqual(plan.lines, [
    {
      accountKey: 'sales_revenue',
      debit: 10000,
      credit: 0,
      description: 'Reverse revenue',
    },
    {
      accountKey: 'cgst_payable',
      debit: 900,
      credit: 0,
      description: 'Reverse CGST payable',
    },
    {
      accountKey: 'sgst_payable',
      debit: 900,
      credit: 0,
      description: 'Reverse SGST payable',
    },
    {
      accountKey: 'bank_account',
      debit: 0,
      credit: 11800,
      description: 'Refund payout',
    },
  ]);
});

test('monthly depreciation is cost divided by life years times twelve', () => {
  const plan = buildDepreciationPostingPlan({
    cost: 120000,
    lifeYears: 5,
  });

  assert.equal(plan.monthlyDepreciation, 2000);
  assert.deepEqual(plan.lines, [
    {
      accountKey: 'depreciation_expense',
      debit: 2000,
      credit: 0,
      description: 'Depreciation expense',
    },
    {
      accountKey: 'accumulated_depreciation',
      debit: 0,
      credit: 2000,
      description: 'Accrued depreciation',
    },
  ]);
});

test('bank reconciliation matches statement rows by amount and nearby date', () => {
  const result = buildBankReconciliationMatches(
    [
      { date: '2026-04-02', amount: 2000, description: 'UPI booking' },
      { date: '2026-04-03', amount: 999, description: 'Unmatched row' },
    ],
    [
      { id: 'L1', entryDate: '2026-04-02T00:00:00.000Z', debit: 2000, credit: 0, narration: 'Booking collection' },
      { id: 'L2', entryDate: '2026-04-05T00:00:00.000Z', debit: 500, credit: 0, narration: 'Other' },
    ]
  );

  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.ledger.id, 'L1');
  assert.equal(result.unmatchedStatementRows.length, 1);
  assert.equal(result.unmatchedLedgerRows.length, 1);
});

test('ACC-BB-02 bank reconciliation leaves amount mismatches unreconciled', () => {
  const result = buildBankReconciliationMatches(
    [
      { date: '2026-04-02', amount: 2000, description: 'UPI bank statement row' },
    ],
    [
      { id: 'L1', entryDate: '2026-04-02T00:00:00.000Z', debit: 1800, credit: 0, narration: 'UPI ledger row' },
    ]
  );

  assert.equal(result.matched.length, 0);
  assert.deepEqual(result.unmatchedStatementRows, [
    { date: '2026-04-02', amount: 2000, description: 'UPI bank statement row' },
  ]);
  assert.deepEqual(result.unmatchedLedgerRows, [
    { id: 'L1', entryDate: '2026-04-02T00:00:00.000Z', debit: 1800, credit: 0, narration: 'UPI ledger row' },
  ]);
});

test('period key is year-month formatted for locking checks', () => {
  assert.equal(toPeriodKey(new Date('2026-04-06T10:00:00.000Z')), '2026-04');
});

test('journal validation rejects unbalanced lines', () => {
  assert.throws(
    () =>
      validateJournalLines([
        { accountKey: 'cash_in_hand', debit: 1000, credit: 0 },
        { accountKey: 'booking_revenue', debit: 0, credit: 900 },
      ]),
    /Debit and credit totals must match/
  );
});

test('ACC-PL-01 profit and loss summary classifies report rows into expected totals', () => {
  const summary = buildProfitLossSummary(
    [
      {
        amount: 100000,
        source: 'ledger_invoice',
        systemKey: 'sales_revenue',
        accountName: 'Sales Revenue',
      },
      {
        amount: 25000,
        source: 'legacy_daybook_income',
        accountName: 'Sponsorship',
      },
    ],
    [
      {
        amount: 45000,
        source: 'ledger_salary',
        systemKey: 'salary_expense',
        accountName: 'Salary Expense',
      },
      {
        amount: 8000,
        source: 'ledger_expense',
        accountName: 'Repairs and Maintenance',
      },
      {
        amount: 2000,
        source: 'ledger_depreciation',
        systemKey: 'depreciation_expense',
        accountName: 'Depreciation Expense',
      },
    ]
  );

  assert.equal(summary.totalIncome, 125000);
  assert.equal(summary.salesIncome, 100000);
  assert.equal(summary.salesReturnContra, 0);
  assert.equal(summary.nonSalesIncome, 25000);
  assert.equal(summary.salaryExpense, 45000);
  assert.equal(summary.depreciationExpense, 2000);
  assert.equal(summary.otherExpense, 8000);
  assert.equal(summary.totalExpense, 55000);
  assert.equal(summary.netProfit, 70000);
});

test('ACC-TB-01 trial balance totals return zero differences for balanced rows', () => {
  const totals = buildTrialBalanceTotals([
    { debit: 120000, credit: 0, debitBalance: 120000, creditBalance: 0 },
    { debit: 0, credit: 120000, debitBalance: 0, creditBalance: 120000 },
    { debit: 55000, credit: 0, debitBalance: 55000, creditBalance: 0 },
    { debit: 0, credit: 55000, debitBalance: 0, creditBalance: 55000 },
  ]);

  assert.equal(totals.debit, 175000);
  assert.equal(totals.credit, 175000);
  assert.equal(totals.debitCreditDifference, 0);
  assert.equal(totals.balanceDifference, 0);
});

test('trial balance integrity stays clean when no diagnostics or abnormal rows exist', () => {
  const integrity = buildTrialBalanceIntegrity(
    [
      { debitBalance: 5000, creditBalance: 0 },
      { debitBalance: 0, creditBalance: 5000 },
    ],
    {
      syntheticRowsAdded: 0,
      duplicateAccountNames: [],
    }
  );

  assert.deepEqual(integrity, {
    status: 'clean',
    isBalanced: true,
    requiresReview: false,
    difference: 0,
    abnormalBalanceCount: 0,
    duplicateAccountNameCount: 0,
    syntheticRowsAdded: 0,
    hasDiagnosticRows: false,
  });
});

test('trial balance integrity marks diagnostic state when synthetic rows are present', () => {
  const integrity = buildTrialBalanceIntegrity(
    [
      { debitBalance: 5000, creditBalance: 0, abnormalBalance: true },
      { debitBalance: 0, creditBalance: 5000 },
    ],
    {
      syntheticRowsAdded: 1,
      duplicateAccountNames: [{ accountName: 'Cash' }],
    }
  );

  assert.equal(integrity.status, 'diagnostic');
  assert.equal(integrity.isBalanced, true);
  assert.equal(integrity.requiresReview, true);
  assert.equal(integrity.syntheticRowsAdded, 1);
  assert.equal(integrity.duplicateAccountNameCount, 1);
  assert.equal(integrity.abnormalBalanceCount, 1);
});

test('ACC-BS-01 balance sheet totals keep difference at zero when sections match', () => {
  const totals = buildBalanceSheetTotals(
    [
      { amount: 42000 },
      { amount: 15000 },
      { amount: 25000 },
    ],
    [
      { amount: 5000 },
    ],
    [
      { amount: 77000 },
    ]
  );

  assert.equal(totals.totalAssets, 82000);
  assert.equal(totals.totalLiabilities, 5000);
  assert.equal(totals.totalEquity, 77000);
  assert.equal(totals.liabilitiesAndEquity, 82000);
  assert.equal(totals.difference, 0);
});

test('balance sheet integrity stays clean when statement balances without diagnostic rows', () => {
  const totals = buildBalanceSheetTotals([{ amount: 10000 }], [{ amount: 4000 }], [{ amount: 6000 }]);
  const integrity = buildBalanceSheetIntegrity(totals, {
    openingBalanceDifference: 0,
    legacyClearing: 0,
    diagnosticRowCount: 0,
  });

  assert.deepEqual(integrity, {
    status: 'clean',
    isBalanced: true,
    requiresReview: false,
    difference: 0,
    diagnosticRowCount: 0,
    openingBalanceDifference: 0,
    legacyClearing: 0,
    hasDiagnosticRows: false,
  });
});

test('balance sheet integrity marks diagnostic state when explanatory clearing rows are needed', () => {
  const totals = buildBalanceSheetTotals([{ amount: 10000 }], [{ amount: 4000 }], [{ amount: 6000 }]);
  const integrity = buildBalanceSheetIntegrity(totals, {
    openingBalanceDifference: 1200,
    legacyClearing: 0,
    diagnosticRowCount: 1,
  });

  assert.equal(integrity.status, 'diagnostic');
  assert.equal(integrity.isBalanced, true);
  assert.equal(integrity.requiresReview, true);
  assert.equal(integrity.hasDiagnosticRows, true);
  assert.equal(integrity.openingBalanceDifference, 1200);
});
