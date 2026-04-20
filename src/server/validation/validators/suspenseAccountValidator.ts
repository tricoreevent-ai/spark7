import { ValidationRule } from '../types.js';
import { collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, tenantScopedMatch, withTimer } from './helpers.js';

const SUSPENSE_PATTERN = /(suspense|clearing|temporary|unclassified|round\s*off)/i;

export const suspenseAccountValidator: ValidationRule = {
  name: 'Suspense Account Check',
  description: 'Suspense or clearing accounts should not carry unexplained balances.',
  run: (context) =>
    withTimer('Suspense Account Check', async () => {
      const chart = context.config.fields.chartAccount;
      const ledger = context.config.fields.ledger;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const suspenseAccounts = await collection(context, 'chartAccounts')
        .find(tenantScopedMatch(context, {
          $or: [
            { [chart.accountName]: SUSPENSE_PATTERN },
            { [chart.groupName]: SUSPENSE_PATTERN },
            { [chart.systemKey]: SUSPENSE_PATTERN },
          ],
        }))
        .project({ _id: 1, [chart.accountCode]: 1, [chart.accountName]: 1, [chart.accountType]: 1 })
        .toArray();

      const balances = suspenseAccounts.length
        ? await collection(context, 'ledgerEntries')
            .aggregate([
              {
                $match: scopedMatch(
                  context,
                  {
                    ...dateUntilMatch(ledger.entryDate, context),
                    [ledger.accountId]: { $in: suspenseAccounts.map((account: any) => account._id) },
                  },
                  ledger.isDeleted
                ),
              },
              {
                $group: {
                  _id: field(ledger.accountId),
                  debit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
                  credit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
                  entryCount: { $sum: 1 },
                },
              },
            ])
            .toArray()
        : [];

      const nonZeroBalances = balances
        .map((row: any) => {
          const account = suspenseAccounts.find((item: any) => String(item._id) === String(row._id));
          const balance = roundMoney(Number(row.debit || 0) - Number(row.credit || 0));
          return {
            accountId: row._id,
            accountCode: account?.[chart.accountCode],
            accountName: account?.[chart.accountName],
            balance,
            entryCount: row.entryCount,
          };
        })
        .filter((row) => Math.abs(row.balance) > tolerance);

      return makeResult({
        checkName: 'Suspense Account Check',
        passed: nonZeroBalances.length === 0,
        severity: 'warning',
        expected: { suspenseBalance: 0, tolerance },
        actual: { suspenseAccountCount: suspenseAccounts.length, nonZeroSuspenseAccounts: nonZeroBalances.length },
        diff: nonZeroBalances.reduce((sum, row) => sum + Math.abs(row.balance), 0),
        possibleCauses: [
          'Temporary posting was not cleared',
          'Opening balance difference was parked in suspense',
          'Manual correction was posted to suspense instead of the proper ledger',
        ],
        suggestedFix: nonZeroBalances.length
          ? 'Investigate each suspense/clearing account and reclassify the balance to the proper account with narration.'
          : 'No action required.',
        rawData: { nonZeroBalances },
      });
    }),
};
