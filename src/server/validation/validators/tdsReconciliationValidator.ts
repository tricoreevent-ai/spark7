import { ValidationRule } from '../types.js';
import { collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, tenantScopedMatch, withTimer } from './helpers.js';

const TDS_ACCOUNT_PATTERN = /(tds|tax deducted at source).*payable|tds payable|section 192|section 194/i;

export const tdsReconciliationValidator: ValidationRule = {
  name: 'TDS Reconciliation',
  description: 'TDS deducted must reconcile with challan deposits and the TDS payable ledger.',
  run: (context) =>
    withTimer('TDS Reconciliation', async () => {
      const tds = context.config.fields.tdsTransaction;
      const challan = context.config.fields.tdsChallan;
      const ledger = context.config.fields.ledger;
      const chart = context.config.fields.chartAccount;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const transactionRows = await collection(context, 'tdsTransactions')
        .aggregate([
          {
            $match: scopedMatch(context, {
              ...dateUntilMatch(tds.transactionDate, context),
              [tds.status]: { $ne: 'reversed' },
            }),
          },
          {
            $group: {
              _id: null,
              deducted: { $sum: { $ifNull: [field(tds.tdsAmount), 0] } },
              markedPaid: { $sum: { $ifNull: [field(tds.paidAmount), 0] } },
              storedOutstanding: { $sum: { $ifNull: [field(tds.balanceAmount), 0] } },
              count: { $sum: 1 },
              openItems: {
                $push: {
                  transactionDate: field(tds.transactionDate),
                  deducteeName: field(tds.deducteeName),
                  sectionCode: field(tds.sectionCode),
                  referenceNo: field(tds.referenceNo),
                  tdsAmount: field(tds.tdsAmount),
                  paidAmount: field(tds.paidAmount),
                  balanceAmount: field(tds.balanceAmount),
                  status: field(tds.status),
                },
              },
            },
          },
        ])
        .toArray();

      const challanRows = await collection(context, 'tdsChallans')
        .aggregate([
          {
            $match: scopedMatch(context, {
              ...dateUntilMatch(challan.paymentDate, context),
              [challan.status]: { $ne: 'cancelled' },
            }),
          },
          {
            $group: {
              _id: null,
              deposited: { $sum: { $ifNull: [field(challan.amount), 0] } },
              allocated: { $sum: { $ifNull: [field(challan.allocatedAmount), 0] } },
              unallocated: { $sum: { $ifNull: [field(challan.unallocatedAmount), 0] } },
              count: { $sum: 1 },
              challans: {
                $push: {
                  paymentDate: field(challan.paymentDate),
                  challanSerialNo: field(challan.challanSerialNo),
                  sectionCode: field(challan.sectionCode),
                  amount: field(challan.amount),
                  allocatedAmount: field(challan.allocatedAmount),
                  unallocatedAmount: field(challan.unallocatedAmount),
                  status: field(challan.status),
                },
              },
            },
          },
        ])
        .toArray();

      const tdsAccounts = await collection(context, 'chartAccounts')
        .find(tenantScopedMatch(context, {
          $or: [
            { [chart.accountName]: TDS_ACCOUNT_PATTERN },
            { [chart.systemKey]: /tds/i },
            { [chart.groupName]: TDS_ACCOUNT_PATTERN },
          ],
        }))
        .project({ _id: 1, [chart.accountCode]: 1, [chart.accountName]: 1, [chart.accountType]: 1 })
        .toArray();

      const ledgerRows = tdsAccounts.length
        ? await collection(context, 'ledgerEntries')
            .aggregate([
              {
                $match: scopedMatch(
                  context,
                  {
                    ...dateUntilMatch(ledger.entryDate, context),
                    [ledger.accountId]: { $in: tdsAccounts.map((account: any) => account._id) },
                  },
                  ledger.isDeleted
                ),
              },
              {
                $group: {
                  _id: null,
                  debit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
                  credit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
                },
              },
            ])
            .toArray()
        : [];

      const deducted = roundMoney(transactionRows[0]?.deducted || 0);
      const deposited = roundMoney(challanRows[0]?.deposited || 0);
      const allocated = roundMoney(challanRows[0]?.allocated || 0);
      const storedOutstanding = roundMoney(transactionRows[0]?.storedOutstanding || 0);
      const computedOutstanding = roundMoney(deducted - deposited);
      const ledgerOutstanding = roundMoney(Number(ledgerRows[0]?.credit || 0) - Number(ledgerRows[0]?.debit || 0));
      const transactionVsChallanDiff = Math.abs(computedOutstanding - storedOutstanding);
      const ledgerDiff = tdsAccounts.length ? Math.abs(computedOutstanding - ledgerOutstanding) : 0;
      const failed = transactionVsChallanDiff > tolerance || ledgerDiff > tolerance;

      return makeResult({
        checkName: 'TDS Reconciliation',
        passed: !failed,
        severity: computedOutstanding > tolerance ? 'warning' : 'critical',
        expected: {
          outstandingEqualsDeductedMinusDeposited: computedOutstanding,
          ledgerOutstanding: computedOutstanding,
          tolerance,
        },
        actual: {
          deducted,
          deposited,
          allocated,
          storedOutstanding,
          computedOutstanding,
          ledgerOutstanding: tdsAccounts.length ? ledgerOutstanding : 'No TDS payable ledger found',
          transactionCount: transactionRows[0]?.count || 0,
          challanCount: challanRows[0]?.count || 0,
        },
        diff: roundMoney(Math.max(transactionVsChallanDiff, ledgerDiff)),
        possibleCauses: [
          'TDS was deducted but challan has not been recorded',
          'Challan exists but was not allocated to TDS transactions',
          'TDS payable ledger account is missing or mapped incorrectly',
          'A TDS transaction was reversed but the ledger was not reversed',
        ],
        suggestedFix:
          computedOutstanding > tolerance
            ? 'Record or allocate the pending TDS challan, then verify that the TDS Payable ledger balance reduces by the deposited amount.'
            : 'No action required.',
        rawData: {
          tdsAccounts,
          openItems: (transactionRows[0]?.openItems || []).filter((item: any) => Number(item.balanceAmount || 0) > tolerance).slice(0, 100),
          challans: (challanRows[0]?.challans || []).slice(0, 100),
        },
      });
    }),
};
