export type AccountingPaymentMode =
  | 'cash'
  | 'bank'
  | 'card'
  | 'upi'
  | 'cheque'
  | 'online'
  | 'bank_transfer'
  | 'adjustment';

export type GstTreatment = 'none' | 'intrastate' | 'interstate';

export interface JournalPlanLine {
  accountKey: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface GstBreakup {
  baseAmount: number;
  gstAmount: number;
  totalAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstTreatment: GstTreatment;
}

export interface ReconciliationStatementRow {
  date: string | Date;
  amount: number;
  description?: string;
}

export interface ReconciliationLedgerRow {
  id: string;
  entryDate: string | Date;
  debit?: number;
  credit?: number;
  narration?: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));

export const paymentModeToAccountKey = (mode?: string, overrideAccountKey?: string): string =>
  String(overrideAccountKey || '').trim()
  || (String(mode || 'cash').toLowerCase() === 'cash' ? 'cash_in_hand' : 'bank_account');

export const toPeriodKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const calculateGstBreakup = (input: {
  baseAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  gstRate?: number;
  gstTreatment?: GstTreatment;
}): GstBreakup => {
  const gstTreatment: GstTreatment = input.gstTreatment || 'none';
  const baseAmount = round2(Number(input.baseAmount || 0));

  let gstAmount = round2(Number(input.gstAmount || 0));
  if (gstAmount <= 0 && Number(input.gstRate || 0) > 0 && baseAmount > 0) {
    gstAmount = round2((baseAmount * Number(input.gstRate || 0)) / 100);
  }

  const totalAmount = round2(
    Number(input.totalAmount || 0) > 0 ? Number(input.totalAmount || 0) : baseAmount + gstAmount
  );

  if (gstTreatment === 'none' || gstAmount <= 0) {
    return {
      baseAmount,
      gstAmount: round2(gstAmount),
      totalAmount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      gstTreatment: 'none',
    };
  }

  if (gstTreatment === 'interstate') {
    return {
      baseAmount,
      gstAmount,
      totalAmount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: gstAmount,
      gstTreatment,
    };
  }

  const half = round2(gstAmount / 2);
  const remainder = round2(gstAmount - half);
  return {
    baseAmount,
    gstAmount,
    totalAmount,
    cgstAmount: half,
    sgstAmount: remainder,
    igstAmount: 0,
    gstTreatment: 'intrastate',
  };
};

const stateCodeFromGstin = (gstin?: string): string => {
  const normalized = String(gstin || '').trim().toUpperCase();
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(normalized) ? normalized.slice(0, 2) : '';
};

export const inferGstTreatmentFromPartyGstins = (
  supplierGstin?: string,
  storeGstin?: string
): GstTreatment => {
  const supplierState = stateCodeFromGstin(supplierGstin);
  const storeState = stateCodeFromGstin(storeGstin);
  if (supplierState && storeState && supplierState !== storeState) return 'interstate';
  return 'intrastate';
};

export const buildPurchaseBillTaxPostingPlan = (input: {
  taxableAmount: number;
  taxAmount?: number;
  totalAmount?: number;
  supplierGstin?: string;
  storeGstin?: string;
  payableAccountKey?: string;
  payableDescription?: string;
}): {
  gst: GstBreakup;
  inputTaxLines: JournalPlanLine[];
  payableLine: JournalPlanLine;
} => {
  const taxableAmount = round2(Number(input.taxableAmount || 0));
  if (taxableAmount <= 0) {
    throw new Error('Purchase bill taxable amount must be greater than 0');
  }

  const gst = calculateGstBreakup({
    baseAmount: taxableAmount,
    gstAmount: input.taxAmount,
    totalAmount: input.totalAmount,
    gstTreatment: inferGstTreatmentFromPartyGstins(input.supplierGstin, input.storeGstin),
  });

  const inputTaxLines: JournalPlanLine[] = [];
  if (gst.cgstAmount > 0) {
    inputTaxLines.push({ accountKey: 'cgst_input', debit: gst.cgstAmount, credit: 0, description: 'CGST input credit' });
  }
  if (gst.sgstAmount > 0) {
    inputTaxLines.push({ accountKey: 'sgst_input', debit: gst.sgstAmount, credit: 0, description: 'SGST input credit' });
  }
  if (gst.igstAmount > 0) {
    inputTaxLines.push({ accountKey: 'igst_input', debit: gst.igstAmount, credit: 0, description: 'IGST input credit' });
  }

  const payableLine: JournalPlanLine = {
    accountKey: input.payableAccountKey || 'accounts_payable',
    debit: 0,
    credit: gst.totalAmount,
    description: input.payableDescription || 'Supplier payable',
  };

  validateJournalLines([
    { accountKey: 'stock_in_hand', debit: taxableAmount, credit: 0, description: 'Inventory received at taxable cost' },
    ...inputTaxLines,
    payableLine,
  ]);

  return { gst, inputTaxLines, payableLine };
};

export const buildGstSetoffSummary = (input: {
  outputTax: number;
  inputTax: number;
  reverseChargeTax?: number;
  interest?: number;
  lateFee?: number;
}) => {
  const outputTax = round2(Number(input.outputTax || 0));
  const inputTax = round2(Number(input.inputTax || 0));
  const reverseChargeTax = round2(Number(input.reverseChargeTax || 0));
  const interest = round2(Number(input.interest || 0));
  const lateFee = round2(Number(input.lateFee || 0));
  const netBalance = round2(outputTax + reverseChargeTax + interest + lateFee - inputTax);

  return {
    outputTax,
    inputTax,
    reverseChargeTax,
    interest,
    lateFee,
    netBalance,
    gstPayable: netBalance > 0 ? netBalance : 0,
    gstReceivable: netBalance < 0 ? Math.abs(netBalance) : 0,
  };
};

export const validateJournalLines = (lines: JournalPlanLine[]): {
  totalDebit: number;
  totalCredit: number;
} => {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('Journal entry requires at least two lines');
  }

  const normalized = lines.map((line) => ({
    accountKey: String(line.accountKey || '').trim(),
    debit: round2(Number(line.debit || 0)),
    credit: round2(Number(line.credit || 0)),
  }));

  normalized.forEach((line) => {
    if (!line.accountKey) throw new Error('Journal line account is required');
    if (line.debit < 0 || line.credit < 0) throw new Error('Negative debit/credit is not allowed');
    if ((line.debit <= 0 && line.credit <= 0) || (line.debit > 0 && line.credit > 0)) {
      throw new Error('Each journal line must have either a debit or a credit amount');
    }
  });

  const totalDebit = round2(normalized.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(normalized.reduce((sum, line) => sum + line.credit, 0));

  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw new Error('Debit and credit totals must match');
  }

  return { totalDebit, totalCredit };
};

export const buildInvoicePostingPlan = (input: {
  baseAmount: number;
  discountAmount?: number;
  roundOffAmount?: number;
  gstAmount?: number;
  gstRate?: number;
  gstTreatment?: GstTreatment;
  paymentAmount?: number;
  paymentMode?: AccountingPaymentMode;
  settlementAccountKey?: string;
  revenueAccountKey?: string;
  discountAccountKey?: string;
  roundOffIncomeAccountKey?: string;
  roundOffExpenseAccountKey?: string;
  receivableAccountKey?: string;
}): {
  gst: GstBreakup;
  discountAmount: number;
  roundOffAmount: number;
  collectibleTotal: number;
  invoiceLines: JournalPlanLine[];
  paymentLines: JournalPlanLine[];
  postingMode: 'cash_sale' | 'credit_invoice' | 'invoice_plus_payment';
} => {
  const revenueAccountKey = input.revenueAccountKey || 'booking_revenue';
  const discountAccountKey = input.discountAccountKey || 'sales_discount';
  const roundOffIncomeAccountKey = input.roundOffIncomeAccountKey || 'round_off_income';
  const roundOffExpenseAccountKey = input.roundOffExpenseAccountKey || 'round_off_expense';
  const receivableAccountKey = input.receivableAccountKey || 'accounts_receivable';
  const gst = calculateGstBreakup({
    baseAmount: input.baseAmount,
    gstAmount: input.gstAmount,
    gstRate: input.gstRate,
    gstTreatment: input.gstTreatment,
  });
  const discountAmount = round2(Math.max(0, Math.min(Number(input.discountAmount || 0), gst.totalAmount)));
  const roundOffAmount = round2(Number(input.roundOffAmount || 0));
  const collectibleTotal = round2(Math.max(0, gst.totalAmount - discountAmount + roundOffAmount));
  const paymentAmount = round2(Math.max(0, Math.min(Number(input.paymentAmount || 0), collectibleTotal)));
  const cashAccountKey = paymentModeToAccountKey(input.paymentMode, input.settlementAccountKey);

  const revenueCredits: JournalPlanLine[] = [
    { accountKey: revenueAccountKey, debit: 0, credit: gst.baseAmount, description: 'Recognize revenue' },
  ];
  if (gst.cgstAmount > 0) {
    revenueCredits.push({ accountKey: 'cgst_payable', debit: 0, credit: gst.cgstAmount, description: 'CGST payable' });
  }
  if (gst.sgstAmount > 0) {
    revenueCredits.push({ accountKey: 'sgst_payable', debit: 0, credit: gst.sgstAmount, description: 'SGST payable' });
  }
  if (gst.igstAmount > 0) {
    revenueCredits.push({ accountKey: 'igst_payable', debit: 0, credit: gst.igstAmount, description: 'IGST payable' });
  }

  const discountLines: JournalPlanLine[] = discountAmount > 0
    ? [{ accountKey: discountAccountKey, debit: discountAmount, credit: 0, description: 'Invoice discount' }]
    : [];
  const roundOffLines: JournalPlanLine[] = roundOffAmount > 0
    ? [{ accountKey: roundOffIncomeAccountKey, debit: 0, credit: roundOffAmount, description: 'Invoice round-off gain' }]
    : roundOffAmount < 0
      ? [{ accountKey: roundOffExpenseAccountKey, debit: Math.abs(roundOffAmount), credit: 0, description: 'Invoice round-off loss' }]
      : [];

  if (paymentAmount >= collectibleTotal) {
    const invoiceLines: JournalPlanLine[] = [
      { accountKey: cashAccountKey, debit: collectibleTotal, credit: 0, description: 'Customer payment received' },
      ...discountLines,
      ...roundOffLines,
      ...revenueCredits,
    ];
    validateJournalLines(invoiceLines);
    return { gst, discountAmount, roundOffAmount, collectibleTotal, invoiceLines, paymentLines: [], postingMode: 'cash_sale' };
  }

  const invoiceLines: JournalPlanLine[] = [
    { accountKey: receivableAccountKey, debit: collectibleTotal, credit: 0, description: 'Raise receivable' },
    ...discountLines,
    ...roundOffLines,
    ...revenueCredits,
  ];
  validateJournalLines(invoiceLines);

  if (paymentAmount > 0) {
    const paymentLines: JournalPlanLine[] = [
      { accountKey: cashAccountKey, debit: paymentAmount, credit: 0, description: 'Partial payment received' },
      { accountKey: receivableAccountKey, debit: 0, credit: paymentAmount, description: 'Reduce receivable' },
    ];
    validateJournalLines(paymentLines);
    return { gst, discountAmount, roundOffAmount, collectibleTotal, invoiceLines, paymentLines, postingMode: 'invoice_plus_payment' };
  }

  return { gst, discountAmount, roundOffAmount, collectibleTotal, invoiceLines, paymentLines: [], postingMode: 'credit_invoice' };
};

export const buildPaymentPostingPlan = (input: {
  amount: number;
  paymentMode?: AccountingPaymentMode;
  settlementAccountKey?: string;
  counterAccountKey?: string;
}): JournalPlanLine[] => {
  const amount = round2(Number(input.amount || 0));
  if (amount <= 0) throw new Error('Payment amount must be greater than 0');

  const cashAccountKey = paymentModeToAccountKey(input.paymentMode, input.settlementAccountKey);
  const counterAccountKey = input.counterAccountKey || 'accounts_receivable';
  const lines: JournalPlanLine[] = [
    { accountKey: cashAccountKey, debit: amount, credit: 0, description: 'Payment received' },
    { accountKey: counterAccountKey, debit: 0, credit: amount, description: 'Settle balance' },
  ];
  validateJournalLines(lines);
  return lines;
};

export const buildExpensePostingPlan = (input: {
  amount: number;
  paidAmount?: number;
  paymentMode?: AccountingPaymentMode;
  settlementAccountKey?: string;
  expenseAccountKey?: string;
  payableAccountKey?: string;
}): {
  expenseLines: JournalPlanLine[];
  paymentLines: JournalPlanLine[];
  postingMode: 'cash_expense' | 'credit_expense' | 'expense_plus_payment';
} => {
  const totalAmount = round2(Number(input.amount || 0));
  const paidAmount = round2(Math.max(0, Number(input.paidAmount ?? input.amount ?? 0)));
  const expenseAccountKey = input.expenseAccountKey || 'general_expense';
  const payableAccountKey = input.payableAccountKey || 'accounts_payable';
  const settlementKey = paymentModeToAccountKey(input.paymentMode, input.settlementAccountKey);

  if (totalAmount <= 0) throw new Error('Expense amount must be greater than 0');

  if (paidAmount >= totalAmount) {
    const expenseLines: JournalPlanLine[] = [
      { accountKey: expenseAccountKey, debit: totalAmount, credit: 0, description: 'Record expense' },
      { accountKey: settlementKey, debit: 0, credit: totalAmount, description: 'Expense paid' },
    ];
    validateJournalLines(expenseLines);
    return { expenseLines, paymentLines: [], postingMode: 'cash_expense' };
  }

  const expenseLines: JournalPlanLine[] = [
    { accountKey: expenseAccountKey, debit: totalAmount, credit: 0, description: 'Record vendor expense' },
    { accountKey: payableAccountKey, debit: 0, credit: totalAmount, description: 'Create payable' },
  ];
  validateJournalLines(expenseLines);

  if (paidAmount > 0) {
    const paymentLines: JournalPlanLine[] = [
      { accountKey: payableAccountKey, debit: paidAmount, credit: 0, description: 'Reduce payable' },
      { accountKey: settlementKey, debit: 0, credit: paidAmount, description: 'Vendor payment' },
    ];
    validateJournalLines(paymentLines);
    return { expenseLines, paymentLines, postingMode: 'expense_plus_payment' };
  }

  return { expenseLines, paymentLines: [], postingMode: 'credit_expense' };
};

export const buildRefundPostingPlan = (input: {
  baseAmount: number;
  gstAmount?: number;
  gstRate?: number;
  gstTreatment?: GstTreatment;
  paymentMode?: AccountingPaymentMode;
  settlementAccountKey?: string;
  revenueAccountKey?: string;
}): { gst: GstBreakup; lines: JournalPlanLine[] } => {
  const revenueAccountKey = input.revenueAccountKey || 'booking_revenue';
  const settlementKey = paymentModeToAccountKey(input.paymentMode, input.settlementAccountKey);
  const gst = calculateGstBreakup({
    baseAmount: input.baseAmount,
    gstAmount: input.gstAmount,
    gstRate: input.gstRate,
    gstTreatment: input.gstTreatment,
  });
  const lines: JournalPlanLine[] = [
    { accountKey: revenueAccountKey, debit: gst.baseAmount, credit: 0, description: 'Reverse revenue' },
  ];
  if (gst.cgstAmount > 0) {
    lines.push({ accountKey: 'cgst_payable', debit: gst.cgstAmount, credit: 0, description: 'Reverse CGST payable' });
  }
  if (gst.sgstAmount > 0) {
    lines.push({ accountKey: 'sgst_payable', debit: gst.sgstAmount, credit: 0, description: 'Reverse SGST payable' });
  }
  if (gst.igstAmount > 0) {
    lines.push({ accountKey: 'igst_payable', debit: gst.igstAmount, credit: 0, description: 'Reverse IGST payable' });
  }
  lines.push({ accountKey: settlementKey, debit: 0, credit: gst.totalAmount, description: 'Refund payout' });
  validateJournalLines(lines);
  return { gst, lines };
};

export const buildPosReturnPostingPlan = (input: {
  revenueAmount: number;
  gstAmount?: number;
  gstRate?: number;
  gstTreatment?: GstTreatment;
  cogsAmount?: number;
  restockInventory?: boolean;
  settleRefund?: boolean;
  paymentMode?: AccountingPaymentMode;
  settlementAccountKey?: string;
  counterAccountKey?: string;
  revenueAccountKey?: string;
}): { gst: GstBreakup; lines: JournalPlanLine[] } => {
  const revenueAccountKey = input.revenueAccountKey || 'sales_revenue';
  const counterAccountKey = input.counterAccountKey || 'accounts_receivable';
  const settlementKey = paymentModeToAccountKey(input.paymentMode, input.settlementAccountKey);
  const gst = calculateGstBreakup({
    baseAmount: input.revenueAmount,
    gstAmount: input.gstAmount,
    gstRate: input.gstRate,
    gstTreatment: input.gstTreatment,
  });
  const cogsAmount = round2(Number(input.cogsAmount || 0));
  const lines: JournalPlanLine[] = [
    { accountKey: revenueAccountKey, debit: gst.baseAmount, credit: 0, description: 'Reverse sales revenue' },
  ];

  if (gst.cgstAmount > 0) {
    lines.push({ accountKey: 'cgst_payable', debit: gst.cgstAmount, credit: 0, description: 'Reverse CGST payable' });
  }
  if (gst.sgstAmount > 0) {
    lines.push({ accountKey: 'sgst_payable', debit: gst.sgstAmount, credit: 0, description: 'Reverse SGST payable' });
  }
  if (gst.igstAmount > 0) {
    lines.push({ accountKey: 'igst_payable', debit: gst.igstAmount, credit: 0, description: 'Reverse IGST payable' });
  }
  if (input.restockInventory !== false && cogsAmount > 0) {
    lines.push({ accountKey: 'stock_in_hand', debit: cogsAmount, credit: 0, description: 'Return inventory at cost' });
    lines.push({ accountKey: 'cost_of_goods_sold', debit: 0, credit: cogsAmount, description: 'Reverse cost of goods sold' });
  }

  lines.push({
    accountKey: input.settleRefund === false ? counterAccountKey : settlementKey,
    debit: 0,
    credit: gst.totalAmount,
    description: input.settleRefund === false ? 'Return credit pending settlement' : 'Refund payout',
  });
  validateJournalLines(lines);
  return { gst, lines };
};

export const buildDepreciationPostingPlan = (input: { cost: number; lifeYears: number }): {
  monthlyDepreciation: number;
  lines: JournalPlanLine[];
} => {
  const cost = round2(Number(input.cost || 0));
  const lifeYears = Number(input.lifeYears || 0);
  if (cost <= 0 || lifeYears <= 0) throw new Error('Asset cost and lifeYears must be greater than 0');

  const monthlyDepreciation = round2(cost / (lifeYears * 12));
  const lines: JournalPlanLine[] = [
    { accountKey: 'depreciation_expense', debit: monthlyDepreciation, credit: 0, description: 'Depreciation expense' },
    { accountKey: 'accumulated_depreciation', debit: 0, credit: monthlyDepreciation, description: 'Accrued depreciation' },
  ];
  validateJournalLines(lines);
  return { monthlyDepreciation, lines };
};

const sameAmount = (statementAmount: number, ledgerAmount: number): boolean =>
  round2(Math.abs(statementAmount)) === round2(Math.abs(ledgerAmount));

const withinDateWindow = (a: Date, b: Date, maxDiffDays = 1): boolean =>
  Math.abs(a.getTime() - b.getTime()) <= maxDiffDays * ONE_DAY_MS;

export const buildBankReconciliationMatches = (
  statementRows: ReconciliationStatementRow[],
  ledgerRows: ReconciliationLedgerRow[]
): {
  matched: Array<{ statement: ReconciliationStatementRow; ledger: ReconciliationLedgerRow }>;
  unmatchedStatementRows: ReconciliationStatementRow[];
  unmatchedLedgerRows: ReconciliationLedgerRow[];
} => {
  const remainingLedger = [...ledgerRows];
  const matched: Array<{ statement: ReconciliationStatementRow; ledger: ReconciliationLedgerRow }> = [];
  const unmatchedStatementRows: ReconciliationStatementRow[] = [];

  for (const statement of statementRows) {
    const statementDate = new Date(statement.date);
    const ledgerIndex = remainingLedger.findIndex((ledger) => {
      const ledgerDate = new Date(ledger.entryDate);
      const ledgerAmount = round2(Math.max(Number(ledger.debit || 0), Number(ledger.credit || 0)));
      return sameAmount(statement.amount, ledgerAmount) && withinDateWindow(statementDate, ledgerDate);
    });

    if (ledgerIndex >= 0) {
      const [ledger] = remainingLedger.splice(ledgerIndex, 1);
      matched.push({ statement, ledger });
    } else {
      unmatchedStatementRows.push(statement);
    }
  }

  return {
    matched,
    unmatchedStatementRows,
    unmatchedLedgerRows: remainingLedger,
  };
};
