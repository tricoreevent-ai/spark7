import { getValidationConfig } from '../config/validationConfig.js';
import { getValidationReportModel } from '../models/ValidationReport.js';
import { ValidationCheckResult, ValidationJobProgressEvent, ValidationReportDocument } from '../types.js';
import { validationRules } from '../validators/index.js';
import { getValidationDbConnection } from './validationDb.js';

const stripRawData = (result: ValidationCheckResult): ValidationCheckResult => {
  const { rawData: _rawData, ...clean } = result;
  return clean;
};

const buildSummary = (details: ValidationCheckResult[]) => {
  const failures = details.filter((detail) => detail.status === 'FAIL');
  return {
    totalChecks: details.length,
    critical: failures.filter((detail) => detail.severity === 'critical').length,
    warning: failures.filter((detail) => detail.severity === 'warning').length,
    info: failures.filter((detail) => detail.severity === 'info').length,
    passed: details.filter((detail) => detail.status === 'PASS').length,
  };
};

export const runAccountingValidation = async (args: {
  periodStart: Date;
  periodEnd: Date;
  tenantId?: string;
  requestedBy?: string;
  jobId?: string;
  includeRawData?: boolean;
  ruleNames?: string[];
  onProgress?: (event: ValidationJobProgressEvent) => void;
}): Promise<ValidationReportDocument> => {
  const config = getValidationConfig();
  const db = await getValidationDbConnection();
  const selectedRuleNames = new Set((args.ruleNames || []).map((name) => name.trim().toLowerCase()).filter(Boolean));
  const selectedRules = selectedRuleNames.size
    ? validationRules.filter((rule) => selectedRuleNames.has(rule.name.toLowerCase()))
    : validationRules;
  const totalChecks = selectedRules.length;
  const emitProgress = (event: ValidationJobProgressEvent) => args.onProgress?.(event);

  const results: ValidationCheckResult[] = [];
  const rawDataSnapshots: Record<string, unknown> = {};

  emitProgress({
    progress: 8,
    currentStep: 'Preparing validation plan',
    message: `Validation workspace ready. ${totalChecks} check(s) scheduled for this run.`,
    completedSteps: 0,
    totalSteps: totalChecks,
  });

  if (totalChecks === 0) {
    emitProgress({
      progress: 72,
      currentStep: 'No matching checks',
      message: 'No validation checks matched the selected filters. Creating an empty report.',
      level: 'warning',
      completedSteps: 0,
      totalSteps: totalChecks,
    });
  }

  for (const [index, rule] of selectedRules.entries()) {
    const beforeProgress = 12 + Math.round((index / Math.max(totalChecks, 1)) * 68);
    emitProgress({
      progress: beforeProgress,
      currentStep: rule.name,
      message: `Running check ${index + 1} of ${totalChecks}: ${rule.name}.`,
      checkName: rule.name,
      completedSteps: index,
      totalSteps: totalChecks,
    });

    const result = await rule.run({
      db,
      config,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      tenantId: args.tenantId,
      requestedBy: args.requestedBy,
      options: {
        includeRawData: args.includeRawData,
        ruleNames: args.ruleNames,
        tolerance: config.numeric.tolerance,
      },
    });

    if (args.includeRawData && result.rawDataKey && result.rawData !== undefined) {
      rawDataSnapshots[result.rawDataKey] = result.rawData;
    }
    results.push(result);

    const afterProgress = 12 + Math.round(((index + 1) / Math.max(totalChecks, 1)) * 68);
    emitProgress({
      progress: afterProgress,
      currentStep: result.checkName,
      message:
        result.status === 'PASS'
          ? `${result.checkName} passed${result.durationMs ? ` in ${result.durationMs} ms` : ''}.`
          : `${result.checkName} finished with ${result.severity} findings${result.durationMs ? ` in ${result.durationMs} ms` : ''}.`,
      level: result.status === 'PASS' ? 'success' : result.severity === 'critical' ? 'error' : 'warning',
      checkName: result.checkName,
      durationMs: result.durationMs,
      completedSteps: index + 1,
      totalSteps: totalChecks,
    });
  }

  const cleanDetails = results.map(stripRawData);
  const summary = buildSummary(cleanDetails);
  const reportModel = getValidationReportModel(db);

  emitProgress({
    progress: 88,
    currentStep: 'Compiling final report',
    message: 'All requested checks finished. Building the summary and saving the report.',
    completedSteps: totalChecks,
    totalSteps: totalChecks,
  });

  const report = await reportModel.create({
    jobId: args.jobId,
    runAt: new Date(),
    completedAt: new Date(),
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    tenantId: args.tenantId,
    requestedBy: args.requestedBy,
    summary,
    details: cleanDetails,
    rawDataSnapshots: args.includeRawData ? rawDataSnapshots : {},
    metadata: {
      validatorVersion: '1.0.0',
      readPreference: config.mongo.readPreference,
      selectedRules: selectedRules.map((rule) => rule.name),
    },
  });

  emitProgress({
    progress: 96,
    currentStep: 'Report ready',
    message: 'Validation report saved successfully.',
    level: 'success',
    completedSteps: totalChecks,
    totalSteps: totalChecks,
  });

  return report.toObject ? report.toObject() : (report as ValidationReportDocument);
};

export const listValidationReports = async (args: {
  tenantId?: string;
  limit?: number;
  skip?: number;
}): Promise<ValidationReportDocument[]> => {
  const db = await getValidationDbConnection();
  const config = getValidationConfig();
  const reportModel = getValidationReportModel(db);
  const query: Record<string, unknown> = {};
  if (args.tenantId) query[config.tenant.field] = args.tenantId;
  return reportModel
    .find(query)
    .select('-rawDataSnapshots')
    .sort({ runAt: -1 })
    .skip(Math.max(0, Number(args.skip || 0)))
    .limit(Math.min(100, Math.max(1, Number(args.limit || 20))))
    .lean();
};

export const getValidationReport = async (args: {
  reportId: string;
  tenantId?: string;
}): Promise<ValidationReportDocument | null> => {
  const db = await getValidationDbConnection();
  const config = getValidationConfig();
  const reportModel = getValidationReportModel(db);
  const query: Record<string, unknown> = { _id: args.reportId };
  if (args.tenantId) query[config.tenant.field] = args.tenantId;
  return reportModel.findOne(query).lean();
};
