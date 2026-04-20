import { Connection } from 'mongoose';
import { ValidationConfig } from './config/validationConfig.js';

export type ValidationSeverity = 'critical' | 'warning' | 'info';
export type ValidationStatus = 'PASS' | 'FAIL';
export type ValidationJobLogLevel = 'info' | 'success' | 'warning' | 'error';

export interface ValidationCheckResult {
  checkName: string;
  status: ValidationStatus;
  severity: ValidationSeverity;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  diff?: number;
  possibleCauses: string[];
  suggestedFix: string;
  rawDataKey?: string;
  rawData?: unknown;
  durationMs?: number;
}

export interface ValidationRunSummary {
  totalChecks: number;
  critical: number;
  warning: number;
  info: number;
  passed: number;
}

export interface ValidationReportDocument {
  _id?: unknown;
  jobId?: string;
  runAt: Date;
  completedAt?: Date;
  periodStart: Date;
  periodEnd: Date;
  tenantId?: string;
  requestedBy?: string;
  summary: ValidationRunSummary;
  details: ValidationCheckResult[];
  rawDataSnapshots?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ValidationContext {
  db: Connection;
  config: ValidationConfig;
  periodStart: Date;
  periodEnd: Date;
  tenantId?: string;
  requestedBy?: string;
  options?: {
    includeRawData?: boolean;
    ruleNames?: string[];
    tolerance?: number;
  };
}

export interface ValidationRule {
  name: string;
  description: string;
  run: (context: ValidationContext) => Promise<ValidationCheckResult>;
}

export interface ValidationJobLogEntry {
  id: string;
  timestamp: Date;
  level: ValidationJobLogLevel;
  message: string;
  progress: number;
  sequence: number;
  checkName?: string;
  durationMs?: number;
}

export interface ValidationJobProgressEvent {
  progress?: number;
  currentStep?: string;
  message: string;
  level?: ValidationJobLogLevel;
  checkName?: string;
  durationMs?: number;
  completedSteps?: number;
  totalSteps?: number;
}

export interface ValidationJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  reportId?: string;
  error?: string;
  currentStep?: string;
  completedSteps?: number;
  totalSteps?: number;
  logs: ValidationJobLogEntry[];
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
