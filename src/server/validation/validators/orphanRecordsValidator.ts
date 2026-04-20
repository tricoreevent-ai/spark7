import { ValidationRule } from '../types.js';
import { collection, dateUntilMatch, field, makeResult, scopedMatch, tenantMatch, withTimer } from './helpers.js';

export const orphanRecordsValidator: ValidationRule = {
  name: 'Orphan Records',
  description: 'Transactions should not reference missing ledgers, vendors, customers, or journals.',
  run: (context) =>
    withTimer('Orphan Records', async () => {
      const ledger = context.config.fields.ledger;
      const journalLine = context.config.fields.journalLine;

      const orphanLedgerEntries = await collection(context, 'ledgerEntries')
        .aggregate([
          {
            $match: scopedMatch(
              context,
              dateUntilMatch(ledger.entryDate, context),
              ledger.isDeleted
            ),
          },
          {
            $lookup: {
              from: context.config.collections.chartAccounts,
              localField: ledger.accountId,
              foreignField: '_id',
              as: 'account',
            },
          },
          { $match: { account: { $size: 0 } } },
          {
            $project: {
              accountId: field(ledger.accountId),
              entryDate: field(ledger.entryDate),
              voucherType: field(ledger.voucherType),
              voucherNumber: field(ledger.voucherNumber),
              debit: field(ledger.debit),
              credit: field(ledger.credit),
            },
          },
          { $limit: 100 },
        ])
        .toArray();

      const orphanJournalLines = await collection(context, 'journalLines')
        .aggregate([
          { $match: { ...tenantMatch(context), ...dateUntilMatch(journalLine.entryDate, context) } },
          {
            $lookup: {
              from: context.config.collections.journalEntries,
              localField: journalLine.journalId,
              foreignField: '_id',
              as: 'journal',
            },
          },
          {
            $lookup: {
              from: context.config.collections.chartAccounts,
              localField: journalLine.accountId,
              foreignField: '_id',
              as: 'account',
            },
          },
          {
            $match: {
              $or: [{ journal: { $size: 0 } }, { account: { $size: 0 } }],
            },
          },
          {
            $project: {
              journalId: field(journalLine.journalId),
              accountId: field(journalLine.accountId),
              entryDate: field(journalLine.entryDate),
              debitAmount: field(journalLine.debitAmount),
              creditAmount: field(journalLine.creditAmount),
              missingJournal: { $eq: [{ $size: '$journal' }, 0] },
              missingAccount: { $eq: [{ $size: '$account' }, 0] },
            },
          },
          { $limit: 100 },
        ])
        .toArray();

      const orphanVendors = await collection(context, 'vendors')
        .aggregate([
          { $match: { ...tenantMatch(context), ledgerAccountId: { $exists: true, $ne: null } } },
          {
            $lookup: {
              from: context.config.collections.chartAccounts,
              localField: 'ledgerAccountId',
              foreignField: '_id',
              as: 'account',
            },
          },
          { $match: { account: { $size: 0 } } },
          { $project: { name: 1, ledgerAccountId: 1, phone: 1, pan: 1, gstin: 1 } },
          { $limit: 100 },
        ])
        .toArray();

      const totalOrphans = orphanLedgerEntries.length + orphanJournalLines.length + orphanVendors.length;

      return makeResult({
        checkName: 'Orphan Records',
        passed: totalOrphans === 0,
        severity: 'critical',
        expected: { orphanReferenceCount: 0 },
        actual: {
          orphanLedgerEntries: orphanLedgerEntries.length,
          orphanJournalLines: orphanJournalLines.length,
          orphanVendors: orphanVendors.length,
        },
        diff: totalOrphans,
        possibleCauses: [
          'Referenced ledger/vendor/journal was deleted or not migrated',
          'Manual import used stale IDs',
          'Master record was created outside the normal workflow',
        ],
        suggestedFix: totalOrphans
          ? 'Restore or recreate the missing master records, or update the affected transactions to point to valid ledgers.'
          : 'No action required.',
        rawData: { orphanLedgerEntries, orphanJournalLines, orphanVendors },
      });
    }),
};
