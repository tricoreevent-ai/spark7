import { ValidationRule } from '../types.js';
import { collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, tenantMatch, withTimer } from './helpers.js';

export const cashBankBookValidator: ValidationRule = {
  name: 'Cash / Bank Book',
  description: 'Cash and bank ledger closing balances should match running balances and uploaded bank statement matches.',
  run: (context) =>
    withTimer('Cash / Bank Book', async () => {
      const chart = context.config.fields.chartAccount;
      const ledger = context.config.fields.ledger;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const accounts = await collection(context, 'chartAccounts')
        .find({
          ...tenantMatch(context),
          [chart.subType]: { $in: ['cash', 'bank'] },
        })
        .project({ _id: 1, [chart.accountCode]: 1, [chart.accountName]: 1, [chart.subType]: 1 })
        .toArray();

      const balanceRows = accounts.length
        ? await collection(context, 'ledgerEntries')
            .aggregate([
              {
                $match: scopedMatch(
                  context,
                  {
                    ...dateUntilMatch(ledger.entryDate, context),
                    [ledger.accountId]: { $in: accounts.map((account: any) => account._id) },
                  },
                  ledger.isDeleted
                ),
              },
              { $sort: { [ledger.accountId]: 1, [ledger.entryDate]: -1, [ledger.createdAt]: -1 } },
              {
                $group: {
                  _id: field(ledger.accountId),
                  debit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
                  credit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
                  latestRunningBalance: { $first: field(ledger.runningBalance) },
                  latestVoucherNumber: { $first: field(ledger.voucherNumber) },
                  latestEntryDate: { $first: field(ledger.entryDate) },
                  entryCount: { $sum: 1 },
                },
              },
            ])
            .toArray()
        : [];

      const mismatches = balanceRows
        .map((row: any) => {
          const account = accounts.find((item: any) => String(item._id) === String(row._id));
          const computedClosing = roundMoney(Number(row.debit || 0) - Number(row.credit || 0));
          const runningClosing = roundMoney(row.latestRunningBalance || 0);
          return {
            accountId: row._id,
            accountCode: account?.[chart.accountCode],
            accountName: account?.[chart.accountName],
            subType: account?.[chart.subType],
            computedClosing,
            latestRunningBalance: runningClosing,
            difference: Math.abs(computedClosing - runningClosing),
            latestVoucherNumber: row.latestVoucherNumber,
            latestEntryDate: row.latestEntryDate,
            entryCount: row.entryCount,
          };
        })
        .filter((row) => row.difference > tolerance);

      const unmatchedBankFeeds = await collection(context, 'bankFeedTransactions').countDocuments({
        ...tenantMatch(context),
        transactionDate: { $gte: context.periodStart, $lte: context.periodEnd },
        isIgnored: { $ne: true },
        matchStatus: { $in: ['unmatched', 'partial'] },
      });

      const failed = mismatches.length > 0 || unmatchedBankFeeds > 0;

      return makeResult({
        checkName: 'Cash / Bank Book',
        passed: !failed,
        severity: mismatches.length ? 'critical' : 'warning',
        expected: { closingBalanceMatchesRunningBalance: true, unmatchedBankFeedTransactions: 0 },
        actual: {
          cashBankAccountCount: accounts.length,
          runningBalanceMismatches: mismatches.length,
          unmatchedBankFeedTransactions: unmatchedBankFeeds,
        },
        diff: mismatches.length + unmatchedBankFeeds,
        possibleCauses: [
          'Running balance was not recalculated after an edit',
          'Bank statement import contains unmatched transactions',
          'Cash/bank transaction was posted to the wrong ledger',
        ],
        suggestedFix: failed
          ? 'Recalculate affected cash/bank ledger balances and match or ignore bank feed transactions after reconciliation.'
          : 'No action required.',
        rawData: { accounts, balanceRows, mismatches },
      });
    }),
};
