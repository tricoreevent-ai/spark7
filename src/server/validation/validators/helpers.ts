import { Collection } from 'mongodb';
import { ValidationContext, ValidationCheckResult, ValidationSeverity } from '../types.js';

export const roundMoney = (value: unknown): number => {
  const numeric = Number(value || 0);
  return Number(Number.isFinite(numeric) ? numeric.toFixed(2) : 0);
};

export const absDiff = (a: unknown, b: unknown): number => roundMoney(Math.abs(Number(a || 0) - Number(b || 0)));

export const slugify = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const collection = (context: ValidationContext, key: keyof ValidationContext['config']['collections']): Collection => {
  return context.db.collection(context.config.collections[key]);
};

export const field = (path: string): string => `$${path}`;

export const tenantMatch = (context: ValidationContext): Record<string, unknown> => {
  const tenantId = String(context.tenantId || '').trim();
  if (!tenantId) return {};

  const tenantField = context.config.tenant.field;
  if (!context.config.tenant.includeRecordsWithoutTenant) {
    return { [tenantField]: tenantId };
  }

  return {
    $or: [
      { [tenantField]: tenantId },
      { [tenantField]: { $exists: false } },
      { [tenantField]: null },
      { [tenantField]: '' },
    ],
  };
};

export const activeMatch = (deletedField = 'isDeleted'): Record<string, unknown> => ({
  $or: [{ [deletedField]: { $exists: false } }, { [deletedField]: { $ne: true } }],
});

export const combineMatch = (...parts: Array<Record<string, unknown>>): Record<string, unknown> => {
  const filtered = parts.filter((part) => Object.keys(part).length > 0);
  if (filtered.length === 0) return {};
  if (filtered.length === 1) return filtered[0];
  return { $and: filtered };
};

export const tenantScopedMatch = (
  context: ValidationContext,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => combineMatch(tenantMatch(context), extra);

export const dateRangeMatch = (fieldName: string, context: ValidationContext): Record<string, unknown> => ({
  [fieldName]: { $gte: context.periodStart, $lte: context.periodEnd },
});

export const dateUntilMatch = (fieldName: string, context: ValidationContext): Record<string, unknown> => ({
  [fieldName]: { $lte: context.periodEnd },
});

export const scopedMatch = (
  context: ValidationContext,
  extra: Record<string, unknown> = {},
  deletedField?: string
): Record<string, unknown> => {
  return combineMatch(
    tenantMatch(context),
    deletedField ? activeMatch(deletedField) : {},
    extra
  );
};

export const makeResult = (args: {
  checkName: string;
  passed: boolean;
  severity?: ValidationSeverity;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  diff?: number;
  possibleCauses?: string[];
  suggestedFix?: string;
  rawData?: unknown;
  durationMs?: number;
}): ValidationCheckResult => {
  const rawDataKey = args.rawData ? slugify(args.checkName) : undefined;
  return {
    checkName: args.checkName,
    status: args.passed ? 'PASS' : 'FAIL',
    severity: args.passed ? 'info' : args.severity || 'warning',
    expected: args.expected,
    actual: args.actual,
    diff: args.diff,
    possibleCauses: args.possibleCauses || [],
    suggestedFix: args.suggestedFix || (args.passed ? 'No action required.' : 'Review the drilldown data and post a correcting entry.'),
    rawDataKey,
    rawData: args.rawData,
    durationMs: args.durationMs,
  };
};

export const withTimer = async (
  checkName: string,
  callback: () => Promise<ValidationCheckResult>
): Promise<ValidationCheckResult> => {
  const startedAt = Date.now();
  try {
    const result = await callback();
    result.durationMs = Date.now() - startedAt;
    return result;
  } catch (error: any) {
    return makeResult({
      checkName,
      passed: false,
      severity: 'critical',
      actual: { error: error?.message || String(error) },
      possibleCauses: ['Validation query failed', 'Collection name or field mapping may be incorrect'],
      suggestedFix: 'Check VALIDATION configuration mappings and database permissions, then rerun the validation.',
      durationMs: Date.now() - startedAt,
      rawData: { error: error?.stack || error?.message || String(error) },
    });
  }
};

export const accountNameRegex = (patterns: string[]): RegExp =>
  new RegExp(patterns.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
