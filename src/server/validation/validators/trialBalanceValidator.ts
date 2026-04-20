import { ValidationRule } from '../types.js';
import { absDiff, collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, withTimer } from './helpers.js';

export const trialBalanceValidator: ValidationRule = {
  name: 'Trial Balance',
  description: 'Sum of all debit ledger balances must equal sum of all credit ledger balances.',
  run: (context) =>
    withTimer('Trial Balance', async () => {
      const ledger = context.config.fields.ledger;
      const chart = context.config.fields.chartAccount;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const rows = await collection(context, 'ledgerEntries')
        .aggregate([
          {
            $match: scopedMatch(
              context,
              dateUntilMatch(ledger.entryDate, context),
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
          {
            $lookup: {
              from: context.config.collections.chartAccounts,
              localField: '_id',
              foreignField: '_id',
              as: 'account',
            },
          },
          { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              accountId: '$_id',
              accountCode: `$account.${chart.accountCode}`,
              accountName: `$account.${chart.accountName}`,
              accountType: `$account.${chart.accountType}`,
              subType: `$account.${chart.subType}`,
              debit: 1,
              credit: 1,
              entryCount: 1,
              signedBalance: { $round: [{ $subtract: ['$debit', '$credit'] }, 2] },
              missingAccount: { $eq: ['$account', null] },
            },
          },
          {
            $group: {
              _id: null,
              totalDebitBalance: {
                $sum: {
                  $cond: [{ $gt: ['$signedBalance', 0] }, '$signedBalance', 0],
                },
              },
              totalCreditBalance: {
                $sum: {
                  $cond: [{ $lt: ['$signedBalance', 0] }, { $abs: '$signedBalance' }, 0],
                },
              },
              accountCount: { $sum: 1 },
              missingAccountCount: { $sum: { $cond: ['$missingAccount', 1, 0] } },
              accounts: {
                $push: {
                  accountId: '$accountId',
                  accountCode: '$accountCode',
                  accountName: '$accountName',
                  accountType: '$accountType',
                  debit: '$debit',
                  credit: '$credit',
                  balance: '$signedBalance',
                  entryCount: '$entryCount',
                  missingAccount: '$missingAccount',
                },
              },
            },
          },
        ])
        .toArray();

      const totalDebit = roundMoney(rows[0]?.totalDebitBalance || 0);
      const totalCredit = roundMoney(rows[0]?.totalCreditBalance || 0);
      const diff = absDiff(totalDebit, totalCredit);
      const accounts = (rows[0]?.accounts || [])
        .sort((a: any, b: any) => Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0)))
        .slice(0, 100);

      return makeResult({
        checkName: 'Trial Balance',
        passed: diff <= tolerance && Number(rows[0]?.missingAccountCount || 0) === 0,
        severity: 'critical',
        expected: { totalDebit, totalCredit: totalDebit, tolerance },
        actual: {
          totalDebit,
          totalCredit,
          difference: diff,
          accountCount: rows[0]?.accountCount || 0,
          missingAccountCount: rows[0]?.missingAccountCount || 0,
        },
        diff,
        possibleCauses: [
          'Unbalanced voucher posting',
          'Ledger entry references a missing chart account',
          'Opening balance was entered without the balancing equity side',
        ],
        suggestedFix:
          diff > tolerance
            ? 'Drill down into high-balance accounts, verify opening entries, and correct any voucher where debit and credit do not match.'
            : 'No action required.',
        rawData: { accounts },
      });
    }),
};
