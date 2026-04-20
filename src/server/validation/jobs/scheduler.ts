import cron, { ScheduledTask } from 'node-cron';
import { getValidationConfig } from '../config/validationConfig.js';
import { createSystemValidationRun } from '../services/validationJobs.js';
import { redactSensitiveData } from '../../utils/redaction.js';

let scheduledTask: ScheduledTask | null = null;

const currentMonthStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

export const startValidationScheduler = (): void => {
  const validationConfig = getValidationConfig();
  if (scheduledTask || !validationConfig.scheduler.enabled) {
    if (!validationConfig.scheduler.enabled) {
      console.log('Accounting validation scheduler is disabled.');
    }
    return;
  }

  scheduledTask = cron.schedule(
    validationConfig.scheduler.cron,
    () => {
      const periodEnd = new Date();
      periodEnd.setHours(23, 59, 59, 999);
      void createSystemValidationRun({
        periodStart: currentMonthStart(),
        periodEnd,
        tenantId: String(process.env.VALIDATION_CRON_TENANT_ID || '').trim() || undefined,
        requestedBy: 'system-cron',
        includeRawData: true,
      }).catch((error) => {
        console.error('Scheduled accounting validation failed:', redactSensitiveData(error));
      });
    },
    {
      timezone: validationConfig.scheduler.timezone,
    }
  );

  console.log(
    `Accounting validation scheduler enabled: ${validationConfig.scheduler.cron} (${validationConfig.scheduler.timezone})`
  );
};

export const stopValidationScheduler = (): void => {
  scheduledTask?.stop();
  scheduledTask = null;
};
