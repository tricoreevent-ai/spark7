import { ValidationRule } from '../types.js';
import { collection, dateRangeMatch, field, makeResult, roundMoney, scopedMatch, withTimer } from './helpers.js';

export const roundOffValidator: ValidationRule = {
  name: 'Round-off Errors',
  description: 'Detect small voucher differences that usually indicate manual round-off or paise-level drift.',
  run: (context) =>
    withTimer('Round-off Errors', async () => {
      const ledger = context.config.fields.ledger;
      const roundOffTolerance = context.config.numeric.roundOffTolerance;

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
              },
              totalDebit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
              totalCredit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
              entryCount: { $sum: 1 },
              firstDate: { $min: field(ledger.entryDate) },
            },
          },
          { $addFields: { diff: { $round: [{ $subtract: ['$totalDebit', '$totalCredit'] }, 2] } } },
          {
            $match: {
              $expr: {
                $and: [
                  { $gt: [{ $abs: '$diff' }, 0.01] },
                  { $lte: [{ $abs: '$diff' }, roundOffTolerance] },
                ],
              },
            },
          },
          { $sort: { firstDate: -1 } },
          { $limit: 100 },
        ])
        .toArray();

      const totalDiff = roundMoney(rows.reduce((sum, row: any) => sum + Math.abs(Number(row.diff || 0)), 0));

      return makeResult({
        checkName: 'Round-off Errors',
        passed: rows.length === 0,
        severity: 'info',
        expected: { smallUnexplainedVoucherDifferences: 0, roundOffTolerance },
        actual: { smallDifferenceCount: rows.length, totalAbsoluteDifference: totalDiff },
        diff: totalDiff,
        possibleCauses: [
          'Manual paise adjustment was made without a round-off ledger',
          'Imported amount was rounded in one side only',
          'GST/TDS calculation used different decimal precision between modules',
        ],
        suggestedFix: rows.length
          ? 'Post differences to the configured round-off ledger or correct the source voucher calculation.'
          : 'No action required.',
        rawData: rows,
      });
    }),
};
