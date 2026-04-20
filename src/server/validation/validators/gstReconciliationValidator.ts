import { ValidationRule } from '../types.js';
import { collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, tenantScopedMatch, withTimer } from './helpers.js';

const GST_ACCOUNT_PATTERN = /(gst|cgst|sgst|igst|cess|input tax|output tax)/i;

export const gstReconciliationValidator: ValidationRule = {
  name: 'GST Reconciliation',
  description: 'GST ledger balances should be reviewed against generated/filed GST returns.',
  run: (context) =>
    withTimer('GST Reconciliation', async () => {
      const chart = context.config.fields.chartAccount;
      const ledger = context.config.fields.ledger;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const gstAccounts = await collection(context, 'chartAccounts')
        .find(tenantScopedMatch(context, {
          $or: [
            { [chart.accountName]: GST_ACCOUNT_PATTERN },
            { [chart.groupName]: GST_ACCOUNT_PATTERN },
            { [chart.systemKey]: GST_ACCOUNT_PATTERN },
          ],
        }))
        .project({ _id: 1, [chart.accountCode]: 1, [chart.accountName]: 1, [chart.accountType]: 1 })
        .toArray();

      const ledgerRows = gstAccounts.length
        ? await collection(context, 'ledgerEntries')
            .aggregate([
              {
                $match: scopedMatch(
                  context,
                  {
                    ...dateUntilMatch(ledger.entryDate, context),
                    [ledger.accountId]: { $in: gstAccounts.map((account: any) => account._id) },
                  },
                  ledger.isDeleted
                ),
              },
              {
                $group: {
                  _id: '$accountId',
                  debit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
                  credit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
                },
              },
            ])
            .toArray()
        : [];

      const returnRows = await collection(context, 'gstReturns')
        .find(tenantScopedMatch(context, {
          generatedAt: { $lte: context.periodEnd },
          returnType: { $in: ['GSTR3B', 'GSTR1'] },
        }))
        .project({ returnType: 1, periodKey: 1, status: 1, filingReference: 1, summary: 1, generatedAt: 1 })
        .sort({ generatedAt: -1 })
        .limit(20)
        .toArray();

      const netPayable = roundMoney(
        ledgerRows.reduce((sum: number, row: any) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0)
      );
      const filedReturns = returnRows.filter((row: any) => ['filed', 'processed'].includes(String(row.status || '').toLowerCase()));
      const failed = Math.abs(netPayable) > tolerance && filedReturns.length === 0;

      return makeResult({
        checkName: 'GST Reconciliation',
        passed: !failed,
        severity: 'warning',
        expected: { gstPayableLedgerReviewedAgainstFiledReturn: true },
        actual: {
          gstAccountCount: gstAccounts.length,
          netGstPayableLedgerBalance: netPayable,
          generatedReturnCount: returnRows.length,
          filedReturnCount: filedReturns.length,
        },
        diff: Math.abs(netPayable),
        possibleCauses: [
          'GST return has not been generated or filed for the period',
          'GST payable/input accounts are not mapped consistently',
          'Manual GST journal was posted without return linkage',
        ],
        suggestedFix: failed
          ? 'Generate or file the pending GST return, then reconcile GST payable/input accounts with the return summary.'
          : 'No action required.',
        rawData: { gstAccounts, ledgerRows, returns: returnRows },
      });
    }),
};
