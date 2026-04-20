import crypto from 'crypto';
import { ValidationJobProgressEvent, ValidationJobStatus } from '../types.js';
import { runAccountingValidation } from './validationRunner.js';
import { sendValidationAlerts } from './validationAlerts.js';
import { redactSensitiveData } from '../../utils/redaction.js';

const jobs = new Map<string, ValidationJobStatus>();
const MAX_LOG_ENTRIES = 200;

const clampProgress = (value: number): number => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const ensureJobDefaults = (job: ValidationJobStatus): ValidationJobStatus => {
  if (!Array.isArray(job.logs)) job.logs = [];
  if (typeof job.completedSteps !== 'number') job.completedSteps = 0;
  if (typeof job.totalSteps !== 'number') job.totalSteps = 0;
  return job;
};

const appendProgress = (job: ValidationJobStatus, event: ValidationJobProgressEvent): ValidationJobStatus => {
  const nextJob = ensureJobDefaults(job);
  const progress = clampProgress(event.progress ?? nextJob.progress);
  const lastSequence = nextJob.logs[nextJob.logs.length - 1]?.sequence || 0;
  nextJob.progress = progress;
  if (typeof event.currentStep === 'string' && event.currentStep.trim()) {
    nextJob.currentStep = event.currentStep.trim();
  }
  if (typeof event.completedSteps === 'number') {
    nextJob.completedSteps = Math.max(0, Math.round(event.completedSteps));
  }
  if (typeof event.totalSteps === 'number') {
    nextJob.totalSteps = Math.max(0, Math.round(event.totalSteps));
  }
  nextJob.logs = [
    ...nextJob.logs,
    {
      id: `${nextJob.jobId}-${lastSequence + 1}-${Date.now()}`,
      timestamp: new Date(),
      level: event.level || 'info',
      message: event.message,
      progress,
      sequence: lastSequence + 1,
      checkName: event.checkName,
      durationMs: event.durationMs,
    },
  ].slice(-MAX_LOG_ENTRIES);
  return nextJob;
};

const createJobStatus = (jobId: string, status: ValidationJobStatus['status']): ValidationJobStatus => {
  const base: ValidationJobStatus = {
    jobId,
    status,
    progress: 0,
    startedAt: new Date(),
    currentStep: status === 'queued' ? 'Queued' : 'Preparing validation workspace',
    completedSteps: 0,
    totalSteps: 0,
    logs: [],
  };

  return appendProgress(base, {
    progress: 0,
    currentStep: base.currentStep,
    message:
      status === 'queued'
        ? 'Validation request queued. Waiting for the validation worker to start.'
        : 'Validation worker created. Preparing to load configuration and start the checks.',
  });
};

const normalizeEndOfDay = (value: Date): Date => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

export const createValidationJob = (args: {
  periodStart: Date;
  periodEnd: Date;
  tenantId?: string;
  requestedBy?: string;
  includeRawData?: boolean;
  ruleNames?: string[];
}): ValidationJobStatus => {
  const jobId = crypto.randomUUID();
  const status = createJobStatus(jobId, 'queued');
  jobs.set(jobId, status);

  setImmediate(() => {
    void runValidationJob({
      ...args,
      jobId,
      periodEnd: normalizeEndOfDay(args.periodEnd),
    });
  });

  return status;
};

export const runValidationJob = async (args: {
  jobId: string;
  periodStart: Date;
  periodEnd: Date;
  tenantId?: string;
  requestedBy?: string;
  includeRawData?: boolean;
  ruleNames?: string[];
}): Promise<ValidationJobStatus> => {
  const existing = ensureJobDefaults(jobs.get(args.jobId) || createJobStatus(args.jobId, 'queued'));
  existing.status = 'running';
  existing.startedAt = existing.startedAt || new Date();
  jobs.set(
    args.jobId,
    appendProgress(existing, {
      progress: 3,
      currentStep: 'Preparing validation workspace',
      message: 'Validation worker started. Loading configuration, date filters, and database access.',
    })
  );

  try {
    const report = await runAccountingValidation({
      ...args,
      onProgress: (event) => {
        const job = jobs.get(args.jobId);
        if (!job) return;
        jobs.set(args.jobId, appendProgress(job, event));
      },
    });
    const completed = ensureJobDefaults(jobs.get(args.jobId) || existing);
    completed.status = 'completed';
    completed.completedAt = new Date();
    completed.reportId = String(report._id || '');

    if (report.summary.critical > 0) {
      let alertDeliveryFailed = false;
      jobs.set(
        args.jobId,
        appendProgress(completed, {
          progress: 98,
          currentStep: 'Sending critical alerts',
          message: `${report.summary.critical} critical issue(s) found. Sending validation alerts now.`,
          level: 'warning',
        })
      );
      await sendValidationAlerts(report).catch((error) => {
        alertDeliveryFailed = true;
        const job = jobs.get(args.jobId);
        if (job) {
          jobs.set(
            args.jobId,
            appendProgress(job, {
              progress: 99,
              currentStep: 'Alert delivery issue',
              message: `Critical issues were found, but alert delivery failed: ${error?.message || String(error)}`,
              level: 'error',
            })
          );
        }
        console.error('Validation alert failed:', redactSensitiveData(error));
      });
      const alerted = jobs.get(args.jobId);
      if (alerted && !alertDeliveryFailed) {
        jobs.set(
          args.jobId,
          appendProgress(alerted, {
            progress: 99,
            currentStep: 'Alerts sent',
            message: 'Critical issue alerts were dispatched successfully.',
            level: 'success',
          })
        );
      }
    } else {
      jobs.set(
        args.jobId,
        appendProgress(completed, {
          progress: 99,
          currentStep: 'Finalizing run',
          message: 'No critical alerts were needed. Finalizing the validation run.',
          level: 'success',
        })
      );
    }

    const finalized = ensureJobDefaults(jobs.get(args.jobId) || completed);
    finalized.status = 'completed';
    finalized.progress = 100;
    finalized.completedAt = completed.completedAt;
    finalized.reportId = completed.reportId;
    jobs.set(
      args.jobId,
      appendProgress(finalized, {
        progress: 100,
        currentStep: 'Completed',
        message: 'Validation run completed. The report is ready for review.',
        level: 'success',
      })
    );

    return jobs.get(args.jobId)!;
  } catch (error: any) {
    const failed = ensureJobDefaults(jobs.get(args.jobId) || existing);
    failed.status = 'failed';
    failed.completedAt = new Date();
    failed.error = error?.message || String(error);
    jobs.set(
      args.jobId,
      appendProgress(failed, {
        progress: 100,
        currentStep: 'Failed',
        message: failed.error || 'Validation job failed.',
        level: 'error',
      })
    );
    console.error('Validation job failed:', redactSensitiveData(error));
    return jobs.get(args.jobId)!;
  }
};

export const getValidationJobStatus = (jobId: string): ValidationJobStatus | null => jobs.get(jobId) || null;

export const createSystemValidationRun = async (args: {
  periodStart: Date;
  periodEnd: Date;
  tenantId?: string;
  requestedBy?: string;
  includeRawData?: boolean;
}): Promise<ValidationJobStatus> => {
  const jobId = crypto.randomUUID();
  jobs.set(jobId, createJobStatus(jobId, 'running'));
  return runValidationJob({ ...args, jobId });
};
