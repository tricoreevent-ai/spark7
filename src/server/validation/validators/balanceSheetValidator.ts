import { ValidationRule } from '../types.js';
import { absDiff, collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, withTimer } from './helpers.js';

const EQUITY_PATTERN = /(capital|equity|opening balance|retained|profit\s*&?\s*loss|drawings?)/i;

export const balanceSheetValidator: ValidationRule = {
  name: 'Balance Sheet Equation',
  description: 'Assets must equal liabilities plus equity, with current-period net profit included in equity.',
  run: (context) =>
    withTimer('Balance Sheet Equation', async () => {
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
              groupName: `$account.${chart.groupName}`,
              systemKey: `$account.${chart.systemKey}`,
              debit: 1,
              credit: 1,
              signedBalance: { $round: [{ $subtract: ['$debit', '$credit'] }, 2] },
              creditBalance: { $round: [{ $subtract: ['$credit', '$debit'] }, 2] },
              missingAccount: { $eq: ['$account', null] },
            },
          },
        ])
        .toArray();

      let assets = 0;
      let liabilities = 0;
      let equityAccounts = 0;
      let income = 0;
      let expenses = 0;
      const lines: any[] = [];

      for (const row of rows as any[]) {
        const accountType = String(row.accountType || '').toLowerCase();
        const label = `${row.accountName || ''} ${row.groupName || ''} ${row.systemKey || ''}`;
        const isEquity = accountType === 'liability' && EQUITY_PATTERN.test(label);
        const signedBalance = Number(row.signedBalance || 0);
        const creditBalance = Number(row.creditBalance || 0);

        if (accountType === 'asset') assets += signedBalance;
        if (accountType === 'liability' && !isEquity) liabilities += creditBalance;
        if (isEquity) equityAccounts += creditBalance;
        if (accountType === 'income') income += creditBalance;
        if (accountType === 'expense') expenses += signedBalance;

        if (['asset', 'liability', 'income', 'expense'].includes(accountType)) {
          lines.push({
            accountCode: row.accountCode,
            accountName: row.accountName,
            accountType,
            balance: roundMoney(accountType === 'liability' || accountType === 'income' ? creditBalance : signedBalance),
            classification: isEquity ? 'equity' : accountType,
          });
        }
      }

      const netProfit = roundMoney(income - expenses);
      const equity = roundMoney(equityAccounts + netProfit);
      const liabilitiesPlusEquity = roundMoney(liabilities + equity);
      const totalAssets = roundMoney(assets);
      const diff = absDiff(totalAssets, liabilitiesPlusEquity);

      return makeResult({
        checkName: 'Balance Sheet Equation',
        passed: diff <= tolerance,
        severity: 'critical',
        expected: { assets: totalAssets, liabilitiesPlusEquity: totalAssets, includesNetProfit: true, tolerance },
        actual: {
          assets: totalAssets,
          liabilities,
          equityAccounts: roundMoney(equityAccounts),
          netProfit,
          liabilitiesPlusEquity,
          difference: diff,
        },
        diff,
        possibleCauses: [
          'Net profit or loss is not being carried into equity',
          'Opening balance equity does not balance',
          'Ledger account is classified under the wrong account type',
          'A transaction posted to only one side of the ledger',
        ],
        suggestedFix:
          diff > tolerance
            ? 'Compare Trial Balance account classifications, ensure net profit is included in equity, and verify opening balance equity.'
            : 'No action required.',
        rawData: {
          topLines: lines
            .sort((a, b) => Math.abs(Number(b.balance || 0)) - Math.abs(Number(a.balance || 0)))
            .slice(0, 100),
        },
      });
    }),
};
