import { ValidationRule } from '../types.js';
import { collection, makeResult, scopedMatch, tenantScopedMatch, withTimer } from './helpers.js';

export const periodLockValidator: ValidationRule = {
  name: 'Period Locking',
  description: 'Transactions should not be created or modified after their accounting period is closed.',
  run: (context) =>
    withTimer('Period Locking', async () => {
      const period = context.config.fields.financialPeriod;
      const ledger = context.config.fields.ledger;

      const closedPeriods = await collection(context, 'financialPeriods')
        .find(tenantScopedMatch(context, {
          [period.startDate]: { $lte: context.periodEnd },
          [period.endDate]: { $gte: context.periodStart },
          $or: [
            { [period.isClosed]: true },
            { [period.isLocked]: true },
            { [period.status]: { $in: ['closed', 'locked'] } },
          ],
        }))
        .project({
          [period.startDate]: 1,
          [period.endDate]: 1,
          [period.status]: 1,
          [period.isClosed]: 1,
          [period.isLocked]: 1,
          [period.lockedAt]: 1,
        })
        .toArray();

      const violations: any[] = [];
      for (const closedPeriod of closedPeriods as any[]) {
        const lockedAt = closedPeriod[period.lockedAt] ? new Date(closedPeriod[period.lockedAt]) : null;
        const dateMatch = {
          [ledger.entryDate]: {
            $gte: new Date(closedPeriod[period.startDate]),
            $lte: new Date(closedPeriod[period.endDate]),
          },
        };
        const mutationMatch = lockedAt
          ? { $or: [{ [ledger.createdAt]: { $gt: lockedAt } }, { [ledger.updatedAt]: { $gt: lockedAt } }] }
          : {};

        const rows = await collection(context, 'ledgerEntries')
          .find(scopedMatch(context, { ...dateMatch, ...mutationMatch }, ledger.isDeleted))
          .project({
            [ledger.entryDate]: 1,
            [ledger.voucherType]: 1,
            [ledger.voucherNumber]: 1,
            [ledger.debit]: 1,
            [ledger.credit]: 1,
            [ledger.createdAt]: 1,
            [ledger.updatedAt]: 1,
          })
          .limit(50)
          .toArray();

        if (rows.length) {
          violations.push({
            periodStart: closedPeriod[period.startDate],
            periodEnd: closedPeriod[period.endDate],
            lockedAt,
            status: closedPeriod[period.status],
            sampleTransactions: rows,
          });
        }
      }

      return makeResult({
        checkName: 'Period Locking',
        passed: violations.length === 0,
        severity: 'critical',
        expected: { transactionsCreatedOrUpdatedAfterLock: 0 },
        actual: { closedPeriodCount: closedPeriods.length, violationGroups: violations.length },
        diff: violations.length,
        possibleCauses: [
          'Backdated transaction was posted after period close',
          'Closed period was reopened without audit note',
          'Lock metadata is missing, so period controls cannot be verified precisely',
        ],
        suggestedFix: violations.length
          ? 'Review the listed backdated transactions, document the reason, and post adjustment entries in the current open period if required.'
          : 'No action required.',
        rawData: { closedPeriods, violations },
      });
    }),
};
