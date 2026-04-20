import { ValidationReport } from '../types';

const now = new Date();
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

export const mockValidationReports: ValidationReport[] = [
  {
    _id: 'mock-report-003',
    jobId: 'mock-job-003',
    runAt: daysAgo(0),
    completedAt: daysAgo(0),
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    periodEnd: now.toISOString(),
    summary: { totalChecks: 13, critical: 1, warning: 2, info: 1, passed: 9 },
    details: [
      {
        checkName: 'Trial Balance',
        status: 'PASS',
        severity: 'info',
        expected: { totalDebit: 1002289, totalCredit: 1002289 },
        actual: { totalDebit: 1002289, totalCredit: 1002289, difference: 0 },
        possibleCauses: [],
        suggestedFix: 'No action required.',
      },
      {
        checkName: 'TDS Reconciliation',
        status: 'FAIL',
        severity: 'warning',
        expected: { outstandingEqualsDeductedMinusDeposited: 14000 },
        actual: { deducted: 30600, deposited: 16600, computedOutstanding: 14000 },
        diff: 14000,
        possibleCauses: ['TDS was deducted but challan has not been recorded', 'Challan exists but was not allocated'],
        suggestedFix: 'Record or allocate the pending TDS challan and verify the TDS Payable ledger.',
        rawDataKey: 'tds-reconciliation',
      },
      {
        checkName: 'Balance Sheet Equation',
        status: 'FAIL',
        severity: 'critical',
        expected: { assets: 199175, liabilitiesPlusEquity: 199175 },
        actual: { assets: 199175, liabilitiesPlusEquity: 195000, difference: 4175 },
        diff: 4175,
        possibleCauses: ['Opening balance equity does not balance', 'Ledger account is classified incorrectly'],
        suggestedFix: 'Compare Trial Balance classifications and verify opening balance equity.',
        rawDataKey: 'balance-sheet-equation',
      },
    ],
    rawDataSnapshots: {
      'tds-reconciliation': {
        openItems: [
          { deducteeName: 'Urban Utility Services', sectionCode: '194C', tdsAmount: 12000, balanceAmount: 12000 },
          { deducteeName: 'Apex Sports Supplies', sectionCode: '194J', tdsAmount: 2000, balanceAmount: 2000 },
        ],
      },
      'balance-sheet-equation': {
        topLines: [
          { accountCode: '1010', accountName: 'Cash In Hand', accountType: 'asset', balance: -40242 },
          { accountCode: '3100', accountName: 'Opening Balance Equity', accountType: 'liability', balance: 448633 },
        ],
      },
    },
  },
  {
    _id: 'mock-report-002',
    runAt: daysAgo(1),
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    periodEnd: daysAgo(1),
    summary: { totalChecks: 13, critical: 0, warning: 3, info: 0, passed: 10 },
    details: [],
  },
  {
    _id: 'mock-report-001',
    runAt: daysAgo(2),
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    periodEnd: daysAgo(2),
    summary: { totalChecks: 13, critical: 2, warning: 4, info: 1, passed: 6 },
    details: [],
  },
];

export const mockDrilldown = {
  reportId: 'mock-report-003',
  checkName: 'TDS Reconciliation',
  detail: mockValidationReports[0].details[1],
  drilldown: mockValidationReports[0].rawDataSnapshots?.['tds-reconciliation'],
  message: 'Mock drilldown data loaded.',
};
