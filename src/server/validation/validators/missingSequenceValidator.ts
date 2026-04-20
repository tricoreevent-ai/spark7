import { ValidationRule } from '../types.js';
import { collection, makeResult, scopedMatch, withTimer } from './helpers.js';

interface ParsedSequence {
  source: string;
  prefix: string;
  number: number;
  date?: Date;
}

const parseSequence = (value: unknown): ParsedSequence | null => {
  const source = String(value || '').trim();
  const match = source.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  return {
    source,
    prefix: match[1],
    number: Number(match[2]),
  };
};

export const missingSequenceValidator: ValidationRule = {
  name: 'Missing Sequences',
  description: 'Detect gaps in invoice, voucher, journal, and payment number sequences.',
  run: (context) =>
    withTimer('Missing Sequences', async () => {
      const gaps: any[] = [];
      const scanned: any[] = [];

      for (const sequence of context.config.sequences) {
        const collectionName = context.config.collections[sequence.collection];
        const docs = await collection(context, sequence.collection)
          .find(
            scopedMatch(context, {
              [sequence.dateField]: { $gte: context.periodStart, $lte: context.periodEnd },
              [sequence.field]: { $exists: true, $nin: ['', null] },
            })
          )
          .project({ [sequence.field]: 1, [sequence.dateField]: 1 })
          .sort({ [sequence.dateField]: 1 })
          .limit(10000)
          .toArray();

        const groups = new Map<string, ParsedSequence[]>();
        for (const doc of docs as any[]) {
          const parsed = parseSequence(doc[sequence.field]);
          if (!parsed || !Number.isFinite(parsed.number)) continue;
          parsed.date = doc[sequence.dateField];
          const group = groups.get(parsed.prefix) || [];
          group.push(parsed);
          groups.set(parsed.prefix, group);
        }

        for (const [prefix, values] of groups.entries()) {
          const unique = Array.from(new Map(values.map((item) => [item.number, item])).values()).sort((a, b) => a.number - b.number);
          if (unique.length < 2) continue;
          const min = unique[0].number;
          const max = unique[unique.length - 1].number;
          const span = max - min + 1;
          const missing: number[] = [];
          if (span <= 5000) {
            const present = new Set(unique.map((item) => item.number));
            for (let number = min; number <= max; number += 1) {
              if (!present.has(number)) missing.push(number);
            }
          }
          if (missing.length > 0) {
            gaps.push({
              checkName: sequence.checkName,
              collection: collectionName,
              field: sequence.field,
              prefix,
              min,
              max,
              missingCount: missing.length,
              missingNumbers: missing.slice(0, 100),
            });
          }
          scanned.push({ checkName: sequence.checkName, collection: collectionName, prefix, documents: unique.length, min, max });
        }
      }

      return makeResult({
        checkName: 'Missing Sequences',
        passed: gaps.length === 0,
        severity: 'warning',
        expected: { sequenceGaps: 0 },
        actual: { sequenceGaps: gaps.length },
        diff: gaps.length,
        possibleCauses: [
          'Record was deleted or cancelled after number generation',
          'Manual number was skipped',
          'Multiple numbering series were mixed in one period',
        ],
        suggestedFix: gaps.length
          ? 'Review the missing number ranges, verify whether records were cancelled, and document the reason in the audit trail.'
          : 'No action required.',
        rawData: { gaps, scanned },
      });
    }),
};
