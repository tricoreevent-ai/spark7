import { ValidationRule } from '../types.js';
import { collection, dateRangeMatch, field, makeResult, roundMoney, scopedMatch, withTimer } from './helpers.js';

export const doubleEntryValidator: ValidationRule = {
  name: 'Double-entry Integrity',
  description: 'Every voucher-level transaction should have equal debits and credits.',
  run: (context) =>
    withTimer('Double-entry Integrity', async () => {
      const ledger = context.config.fields.ledger;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;
      const rows = await collection(context, 'ledgerEntries')
        .aggregate([
          {
            $match: scopedMatch(
              context,
              dateRangeMatch(ledger.entryDate, context),
              ledger.isDeleted
            ),
          },
          {
            $group: {
              _id: {
                voucherType: field(ledger.voucherType),
                voucherNumber: {
                  $ifNull: [
                    field(ledger.voucherNumber),
                    { $ifNull: [field(ledger.referenceNo), { $toString: '$_id' }] },
                  ],
                },
                sourceId: { $ifNull: [`$${ledger.metadata}.sourceId`, ''] },
              },
              totalDebit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
              totalCredit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
              lineCount: { $sum: 1 },
              accounts: { $addToSet: field(ledger.accountId) },
              firstDate: { $min: field(ledger.entryDate) },
              lastUpdatedAt: { $max: field(ledger.updatedAt) },
            },
          },
          {
            $addFields: {
              diff: { $round: [{ $subtract: ['$totalDebit', '$totalCredit'] }, 2] },
            },
          },
          {
            $match: {
              $expr: { $gt: [{ $abs: '$diff' }, tolerance] },
            },
          },
          { $sort: { firstDate: -1, diff: -1 } },
          { $limit: 100 },
        ])
        .toArray();

      const largestDiff = rows.reduce((max, row: any) => Math.max(max, Math.abs(Number(row.diff || 0))), 0);

      return makeResult({
        checkName: 'Double-entry Integrity',
        passed: rows.length === 0,
        severity: 'critical',
        expected: { voucherDebitsEqualCredits: true, tolerance },
        actual: { imbalancedVouchers: rows.length, largestDiff: roundMoney(largestDiff) },
        diff: roundMoney(largestDiff),
        possibleCauses: [
          'Voucher was partially posted to the ledger',
          'Manual ledger adjustment missed the opposite side',
          'Deleted or reversed line was excluded from only one side',
        ],
        suggestedFix: rows.length
          ? 'Open the listed voucher numbers, verify all debit and credit lines, then post a correction or reversal voucher.'
          : 'No action required.',
        rawData: rows,
      });
    }),
};
