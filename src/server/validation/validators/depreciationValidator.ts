import { ValidationRule } from '../types.js';
import { collection, makeResult, roundMoney, tenantMatch, withTimer } from './helpers.js';

const daysBetween = (start: Date, end: Date): number => {
  const ms = Math.max(0, end.getTime() - start.getTime());
  return Math.ceil(ms / 86_400_000);
};

export const depreciationValidator: ValidationRule = {
  name: 'Depreciation Logic',
  description: 'Active fixed assets should have reasonable depreciation posted up to the report period.',
  run: (context) =>
    withTimer('Depreciation Logic', async () => {
      const assetFields = context.config.fields.fixedAsset;
      const journal = context.config.fields.journalEntry;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const assets = await collection(context, 'fixedAssets')
        .find({
          ...tenantMatch(context),
          [assetFields.status]: { $ne: 'disposed' },
          [assetFields.acquisitionDate]: { $lte: context.periodEnd },
        })
        .project({
          [assetFields.assetName]: 1,
          [assetFields.cost]: 1,
          [assetFields.depreciationRate]: 1,
          [assetFields.accumulatedDepreciation]: 1,
          [assetFields.acquisitionDate]: 1,
          lastDepreciationDate: 1,
        })
        .toArray();

      const depreciationJournals = await collection(context, 'journalEntries').countDocuments({
        ...tenantMatch(context),
        [journal.entryDate]: { $gte: context.periodStart, $lte: context.periodEnd },
        [journal.status]: { $ne: 'cancelled' },
        [journal.referenceType]: 'depreciation',
      });

      const underDepreciated = (assets as any[])
        .map((asset) => {
          const cost = Number(asset[assetFields.cost] || 0);
          const lifeYears = Math.max(1, Number(asset[assetFields.depreciationRate] || 0));
          const purchaseDate = new Date(asset[assetFields.acquisitionDate]);
          const daysHeld = daysBetween(purchaseDate, context.periodEnd);
          const expectedDepreciation = Math.min(cost, (cost / lifeYears / 365) * daysHeld);
          const postedDepreciation = Number(asset[assetFields.accumulatedDepreciation] || 0);
          return {
            assetId: asset._id,
            assetName: asset[assetFields.assetName],
            cost,
            lifeYears,
            purchaseDate,
            expectedDepreciation: roundMoney(expectedDepreciation),
            postedDepreciation: roundMoney(postedDepreciation),
            shortfall: roundMoney(expectedDepreciation - postedDepreciation),
            lastDepreciationDate: asset.lastDepreciationDate,
          };
        })
        .filter((asset) => asset.shortfall > tolerance)
        .slice(0, 100);

      const failed = underDepreciated.length > 0 || (assets.length > 0 && depreciationJournals === 0);

      return makeResult({
        checkName: 'Depreciation Logic',
        passed: !failed,
        severity: 'warning',
        expected: { activeAssetsHaveDepreciationEntries: true },
        actual: {
          activeAssetCount: assets.length,
          depreciationJournalsInPeriod: depreciationJournals,
          underDepreciatedAssetCount: underDepreciated.length,
        },
        diff: underDepreciated.length,
        possibleCauses: [
          'Depreciation run was not executed for the period',
          'Fixed asset life/cost is missing or incorrect',
          'Depreciation journal exists but is not linked using referenceType=depreciation',
        ],
        suggestedFix: failed
          ? 'Run depreciation for active assets and verify the accumulated depreciation and depreciation expense journals.'
          : 'No action required.',
        rawData: { underDepreciated },
      });
    }),
};
