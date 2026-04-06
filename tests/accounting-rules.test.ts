import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBankReconciliationMatches,
  buildDepreciationPostingPlan,
  buildExpensePostingPlan,
  buildInvoicePostingPlan,
  buildRefundPostingPlan,
  calculateGstBreakup,
  toPeriodKey,
  validateJournalLines,
} from '../src/server/services/accountingRules.ts';

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
