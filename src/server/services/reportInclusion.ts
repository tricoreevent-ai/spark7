export type ReportInclusionMode = 'default' | 'diagnostic' | 'audit';

export interface ReportEntryLike {
  status?: string;
  sourceStatus?: string;
  referenceType?: string;
  isDeleted?: boolean;
  isDiagnosticEntry?: boolean;
  metadata?: Record<string, any>;
}

const normalize = (value: unknown): string => String(value || '').trim().toLowerCase();

export const isReportEntryIncluded = (
  entry: ReportEntryLike,
  options: {
    includeCancelled?: boolean;
    includeReversal?: boolean;
    includeDiagnostics?: boolean;
    mode?: ReportInclusionMode;
  } = {}
): boolean => {
  if (entry.isDeleted) return false;
  const mode = options.mode || 'default';
  const status = normalize(entry.status || entry.sourceStatus || entry.metadata?.status || entry.metadata?.sourceStatus);
  const referenceType = normalize(entry.referenceType || entry.metadata?.referenceType || entry.metadata?.sourceReferenceType);
  const diagnostic = Boolean(entry.isDiagnosticEntry || entry.metadata?.isDiagnosticEntry);

  if (diagnostic && mode !== 'diagnostic' && !options.includeDiagnostics) return false;
  if (status === 'cancelled' && !options.includeCancelled) return false;
  if (referenceType === 'reversal' && options.includeReversal === false) return false;
  return true;
};

export const getReportEntries = <T extends ReportEntryLike>(
  entries: T[],
  options: {
    includeCancelled?: boolean;
    includeReversal?: boolean;
    includeDiagnostics?: boolean;
    mode?: ReportInclusionMode;
  } = {}
): T[] => entries.filter((entry) => isReportEntryIncluded(entry, options));
