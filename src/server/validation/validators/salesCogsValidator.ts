import { ValidationRule } from '../types.js';
import {
  absDiff,
  activeMatch,
  collection,
  combineMatch,
  makeResult,
  roundMoney,
  tenantMatch,
  tenantScopedMatch,
  withTimer,
} from './helpers.js';

export const salesCogsValidator: ValidationRule = {
  name: 'Sales COGS Posting',
  description: 'Every posted inventory sale should have a matching COGS debit and stock credit.',
  run: (context) =>
    withTimer('Sales COGS Posting', async () => {
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;
      const ledger = context.config.fields.ledger;

      const rows = await collection(context, 'sales')
        .aggregate([
          {
            $match: tenantScopedMatch(context, {
              saleStatus: { $in: ['completed', 'returned'] },
              invoiceStatus: 'posted',
            }),
          },
          {
            $project: {
              saleNumber: 1,
              invoiceNumber: 1,
              totalAmount: 1,
              postedAt: 1,
              createdAt: 1,
              inventoryItemCount: {
                $size: {
                  $filter: {
                    input: { $ifNull: ['$items', []] },
                    as: 'item',
                    cond: {
                      $and: [
                        { $gt: [{ $ifNull: ['$$item.quantity', 0] }, 0] },
                        { $ne: [{ $ifNull: ['$$item.itemType', 'inventory'] }, 'service'] },
                        { $ne: [{ $ifNull: ['$$item.itemType', 'inventory'] }, 'non_inventory'] },
                      ],
                    },
                  },
                },
              },
              recordedCogs: {
                $round: [
                  {
                    $reduce: {
                      input: { $ifNull: ['$items', []] },
                      initialValue: 0,
                      in: {
                        $add: ['$$value', { $ifNull: ['$$this.cogsAmount', 0] }],
                      },
                    },
                  },
                  2,
                ],
              },
            },
          },
          {
            $match: {
              inventoryItemCount: { $gt: 0 },
            },
          },
          {
            $lookup: {
              from: context.config.collections.ledgerEntries,
              let: {
                saleNumber: '$saleNumber',
                invoiceNumber: '$invoiceNumber',
              },
              pipeline: [
                {
                  $match: combineMatch(
                    tenantMatch(context),
                    activeMatch(ledger.isDeleted),
                    {
                      $expr: {
                        $or: [
                          { $eq: ['$referenceNo', '$$invoiceNumber'] },
                          { $eq: ['$referenceNo', '$$saleNumber'] },
                          { $eq: ['$metadata.saleNumber', '$$saleNumber'] },
                          { $eq: ['$metadata.invoiceNumber', '$$invoiceNumber'] },
                        ],
                      },
                    }
                  ),
                },
                {
                  $lookup: {
                    from: context.config.collections.chartAccounts,
                    localField: 'accountId',
                    foreignField: '_id',
                    as: 'account',
                  },
                },
                { $unwind: { path: '$account', preserveNullAndEmptyArrays: false } },
                {
                  $match: {
                    'account.systemKey': { $in: ['cost_of_goods_sold', 'stock_in_hand'] },
                  },
                },
                {
                  $group: {
                    _id: '$account.systemKey',
                    debit: { $sum: { $ifNull: ['$debit', 0] } },
                    credit: { $sum: { $ifNull: ['$credit', 0] } },
                  },
                },
              ],
              as: 'cogsLedger',
            },
          },
        ])
        .toArray();

      const violations = (rows as any[])
        .map((row) => {
          const cogsRow = Array.isArray(row.cogsLedger)
            ? row.cogsLedger.find((entry: any) => String(entry?._id || '') === 'cost_of_goods_sold')
            : null;
          const stockRow = Array.isArray(row.cogsLedger)
            ? row.cogsLedger.find((entry: any) => String(entry?._id || '') === 'stock_in_hand')
            : null;
          const cogsDebit = roundMoney(cogsRow?.debit || 0);
          const stockCredit = roundMoney(stockRow?.credit || 0);
          const difference = absDiff(cogsDebit, stockCredit);
          const missingCogsLedger = cogsDebit <= tolerance || stockCredit <= tolerance;
          const recordedCogs = roundMoney(row.recordedCogs || 0);
          const saleReference = String(row.invoiceNumber || row.saleNumber || '').trim();

          if (!missingCogsLedger && difference <= tolerance) return null;

          return {
            saleReference,
            saleNumber: row.saleNumber,
            invoiceNumber: row.invoiceNumber,
            postedAt: row.postedAt || row.createdAt || null,
            totalAmount: roundMoney(row.totalAmount || 0),
            inventoryItemCount: Number(row.inventoryItemCount || 0),
            saleRecordedCogs: recordedCogs,
            cogsDebit,
            stockCredit,
            difference,
            issue: missingCogsLedger ? 'Missing COGS ledger posting' : 'COGS debit and stock credit do not match',
          };
        })
        .filter(Boolean)
        .sort((left: any, right: any) => Math.abs(Number(right.totalAmount || 0)) - Math.abs(Number(left.totalAmount || 0)));

      return makeResult({
        checkName: 'Sales COGS Posting',
        passed: violations.length === 0,
        severity: 'critical',
        expected: { postedInventorySalesWithoutCogs: 0, tolerance },
        actual: { violations: violations.length },
        diff: violations.length,
        possibleCauses: [
          'Inventory issue completed without posting the matching COGS journal',
          'Stock ledger posted but accounting COGS journal failed',
          'Legacy sale migration skipped stock-cost linkage',
        ],
        suggestedFix: violations.length
          ? 'Review the listed posted sales, verify stock issue allocations, and post or repair the missing COGS journal before relying on profit figures.'
          : 'No action required.',
        rawData: {
          affectedSales: violations.slice(0, 100),
        },
      });
    }),
};
