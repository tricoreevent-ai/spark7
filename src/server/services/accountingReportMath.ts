export interface ReportMovementLike {
  amount: number;
  source?: string;
  systemKey?: string;
  accountName?: string;
  category?: string;
  isContraIncome?: boolean;
}

export interface TrialBalanceRowLike {
  debit?: number;
  credit?: number;
  debitBalance?: number;
  creditBalance?: number;
  abnormalBalance?: boolean;
}

export interface BalanceSheetRowLike {
  amount?: number;
  diagnostic?: boolean;
}

export interface TrialBalanceIntegrity {
  status: 'clean' | 'diagnostic' | 'imbalanced';
  isBalanced: boolean;
  requiresReview: boolean;
  difference: number;
  abnormalBalanceCount: number;
  duplicateAccountNameCount: number;
  syntheticRowsAdded: number;
  hasDiagnosticRows: boolean;
}

export interface BalanceSheetIntegrity {
  status: 'clean' | 'diagnostic' | 'imbalanced';
  isBalanced: boolean;
  requiresReview: boolean;
  difference: number;
  diagnosticRowCount: number;
  openingBalanceDifference: number;
  legacyClearing: number;
  hasDiagnosticRows: boolean;
}

const round2 = (value: number) => Number(Number(value || 0).toFixed(2));

const sumNumbers = (values: number[]) => round2(values.reduce((sum, value) => sum + Number(value || 0), 0));

const isSalesIncomeAccount = (row: ReportMovementLike) => {
  const key = String(row.systemKey || '').toLowerCase();
  const name = String(row.accountName || row.category || '').toLowerCase();
  return (
    ['booking_revenue', 'event_revenue', 'sales_revenue'].includes(key) ||
    name.includes('sales') ||
    name.includes('booking revenue') ||
    name.includes('event revenue')
  );
};

const isExpenseAccount = (row: ReportMovementLike, keys: string[], names: string[]) => {
  const key = String(row.systemKey || '').toLowerCase();
  const name = String(row.accountName || row.category || '').toLowerCase();
  return keys.includes(key) || names.some((needle) => name.includes(needle));
};

export const buildProfitLossSummary = (
  incomeRows: ReportMovementLike[],
  expenseRows: ReportMovementLike[]
) => {
  const totalIncome = sumNumbers(incomeRows.map((row) => row.amount));
  const totalExpense = sumNumbers(expenseRows.map((row) => row.amount));

  const salesIncome = sumNumbers(
    incomeRows
      .filter((row) => !row.isContraIncome && (isSalesIncomeAccount(row) || row.source === 'legacy_sales'))
      .map((row) => row.amount)
  );
  const salesReturnContra = sumNumbers(
    incomeRows.filter((row) => row.isContraIncome).map((row) => Math.abs(row.amount))
  );
  const nonSalesIncome = round2(totalIncome - salesIncome + salesReturnContra);

  const salaryExpense = sumNumbers(
    expenseRows
      .filter((row) => isExpenseAccount(row, ['salary_expense'], ['salary expense', 'salaries', 'wages']))
      .map((row) => row.amount)
  );
  const contractExpense = sumNumbers(
    expenseRows
      .filter((row) => isExpenseAccount(row, ['contract_expense'], ['contract expense', 'contract payment']))
      .map((row) => row.amount)
  );
  const cogsExpense = sumNumbers(
    expenseRows
      .filter((row) => isExpenseAccount(row, ['cost_of_goods_sold'], ['cost of goods sold', 'cogs']))
      .map((row) => row.amount)
  );
  const stockLossExpense = sumNumbers(
    expenseRows.filter((row) => isExpenseAccount(row, ['stock_loss'], ['stock loss'])).map((row) => row.amount)
  );
  const depreciationExpense = sumNumbers(
    expenseRows
      .filter((row) => isExpenseAccount(row, ['depreciation_expense'], ['depreciation expense']))
      .map((row) => row.amount)
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
  const otherExpense = round2(totalExpense - knownExpense);
  const netProfit = round2(totalIncome - totalExpense);

  return {
    totalIncome,
    totalExpense,
    salesIncome,
    salesReturnContra,
    nonSalesIncome,
    salaryExpense,
    contractExpense,
    cogsExpense,
    stockLossExpense,
    depreciationExpense,
    payrollTaxExpense,
    benefitsExpense,
    otherExpense,
    netProfit,
  };
};

export const buildTrialBalanceTotals = (rows: TrialBalanceRowLike[]) => ({
  debit: round2(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0)),
  credit: round2(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0)),
  debitBalance: round2(rows.reduce((sum, row) => sum + Number(row.debitBalance || 0), 0)),
  creditBalance: round2(rows.reduce((sum, row) => sum + Number(row.creditBalance || 0), 0)),
  debitCreditDifference: round2(rows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0)),
  balanceDifference: round2(
    rows.reduce((sum, row) => sum + Number(row.debitBalance || 0) - Number(row.creditBalance || 0), 0)
  ),
});

export const buildTrialBalanceIntegrity = (
  rows: TrialBalanceRowLike[],
  diagnostics: {
    syntheticRowsAdded?: number;
    duplicateAccountNames?: Array<unknown>;
  } = {},
  tolerance = 0.01
): TrialBalanceIntegrity => {
  const totals = buildTrialBalanceTotals(rows);
  const syntheticRowsAdded = Number(diagnostics.syntheticRowsAdded || 0);
  const duplicateAccountNameCount = Array.isArray(diagnostics.duplicateAccountNames)
    ? diagnostics.duplicateAccountNames.length
    : 0;
  const abnormalBalanceCount = rows.filter((row) => Boolean(row.abnormalBalance)).length;
  const difference = round2(totals.balanceDifference);
  const hasDiagnosticRows = syntheticRowsAdded > 0;
  const isBalanced = Math.abs(difference) <= tolerance;
  const requiresReview = !isBalanced || hasDiagnosticRows || duplicateAccountNameCount > 0 || abnormalBalanceCount > 0;

  return {
    status: !isBalanced ? 'imbalanced' : requiresReview ? 'diagnostic' : 'clean',
    isBalanced,
    requiresReview,
    difference,
    abnormalBalanceCount,
    duplicateAccountNameCount,
    syntheticRowsAdded,
    hasDiagnosticRows,
  };
};

export const buildBalanceSheetTotals = (
  assets: BalanceSheetRowLike[],
  liabilities: BalanceSheetRowLike[],
  equityRows: BalanceSheetRowLike[]
) => {
  const totalAssets = round2(assets.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalEquity = round2(equityRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const liabilitiesAndEquity = round2(totalLiabilities + totalEquity);

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    liabilitiesAndEquity,
    difference: round2(totalAssets - liabilitiesAndEquity),
  };
};

export const buildBalanceSheetIntegrity = (
  totals: ReturnType<typeof buildBalanceSheetTotals>,
  diagnostics: {
    openingBalanceDifference?: number;
    legacyClearing?: number;
    diagnosticRowCount?: number;
  } = {},
  tolerance = 0.01
): BalanceSheetIntegrity => {
  const difference = round2(Number(totals?.difference || 0));
  const openingBalanceDifference = round2(Number(diagnostics.openingBalanceDifference || 0));
  const legacyClearing = round2(Number(diagnostics.legacyClearing || 0));
  const diagnosticRowCount = Number(diagnostics.diagnosticRowCount || 0);
  const hasDiagnosticRows = diagnosticRowCount > 0 || Math.abs(openingBalanceDifference) > tolerance || Math.abs(legacyClearing) > tolerance;
  const isBalanced = Math.abs(difference) <= tolerance;
  const requiresReview = !isBalanced || hasDiagnosticRows;

  return {
    status: !isBalanced ? 'imbalanced' : requiresReview ? 'diagnostic' : 'clean',
    isBalanced,
    requiresReview,
    difference,
    diagnosticRowCount,
    openingBalanceDifference,
    legacyClearing,
    hasDiagnosticRows,
  };
};
