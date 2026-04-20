export type ValidationSeverity = 'critical' | 'warning' | 'info';
export type ValidationStatus = 'PASS' | 'FAIL';
export type ValidationJobLogLevel = 'info' | 'success' | 'warning' | 'error';

export interface ValidationCheckDetail {
  checkName: string;
  status: ValidationStatus;
  severity: ValidationSeverity;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  diff?: number;
  possibleCauses: string[];
  suggestedFix: string;
  rawDataKey?: string;
  durationMs?: number;
}

export interface ValidationSummary {
  totalChecks: number;
  critical: number;
  warning: number;
  info: number;
  passed: number;
}

export interface ValidationReport {
  _id: string;
  jobId?: string;
  runAt: string;
  completedAt?: string;
  periodStart: string;
  periodEnd: string;
  summary: ValidationSummary;
  details: ValidationCheckDetail[];
  rawDataSnapshots?: Record<string, unknown>;
}

export interface ValidationJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  reportId?: string;
  error?: string;
  currentStep?: string;
  completedSteps?: number;
  totalSteps?: number;
  logs: ValidationJobLogEntry[];
}

export interface ValidationJobLogEntry {
  id: string;
  timestamp: string;
  level: ValidationJobLogLevel;
  message: string;
  progress: number;
  sequence: number;
  checkName?: string;
  durationMs?: number;
}

export interface ValidationDrilldownResponse {
  reportId: string;
  checkName: string;
  detail?: ValidationCheckDetail;
  drilldown: unknown;
  message: string;
}

export interface ValidationRunRequest {
  periodStart?: string;
  periodEnd?: string;
  includeRawData?: boolean;
  rules?: string[];
}

export interface ValidationRepairLogEntry {
  level: ValidationJobLogLevel;
  message: string;
  entityType?: 'vendor' | 'chart_account' | 'validation_report';
  entityId?: string;
}

export interface ValidationRepairResult {
  reportId: string;
  repaired: boolean;
  repairedCount: number;
  skippedCount: number;
  supportedFindingCount: number;
  rerunRecommended: boolean;
  message: string;
  logs: ValidationRepairLogEntry[];
  summary: {
    vendorsReviewed: number;
    vendorLedgersCreated: number;
    vendorLedgersLinked: number;
    vendorLedgersSynchronized: number;
    manualFollowUps: number;
  };
}
