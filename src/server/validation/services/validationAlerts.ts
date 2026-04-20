import { getValidationConfig } from '../config/validationConfig.js';
import { ValidationReportDocument } from '../types.js';
import { sendConfiguredMail } from '../../services/mail.js';
import { getValidationDbConnection } from './validationDb.js';

const formatDate = (value: Date): string => new Date(value).toISOString().slice(0, 10);

const buildCriticalSummary = (report: ValidationReportDocument): string => {
  const criticalChecks = report.details
    .filter((detail) => detail.status === 'FAIL' && detail.severity === 'critical')
    .map((detail) => `${detail.checkName}: ${detail.suggestedFix}`)
    .slice(0, 10);

  return [
    `Accounting validation found ${report.summary.critical} critical issue(s).`,
    `Period: ${formatDate(report.periodStart)} to ${formatDate(report.periodEnd)}`,
    `Report ID: ${String(report._id || '')}`,
    '',
    ...criticalChecks,
  ].join('\n');
};

export const sendValidationAlerts = async (report: ValidationReportDocument): Promise<void> => {
  if (!report.summary.critical) return;
  const validationConfig = getValidationConfig();

  const message = buildCriticalSummary(report);
  const html = `
    <h2>Accounting Validation Alert</h2>
    <p><strong>${report.summary.critical}</strong> critical issue(s) were found.</p>
    <p>Period: ${formatDate(report.periodStart)} to ${formatDate(report.periodEnd)}</p>
    <p>Report ID: ${String(report._id || '')}</p>
    <ul>
      ${report.details
        .filter((detail) => detail.status === 'FAIL' && detail.severity === 'critical')
        .slice(0, 10)
        .map((detail) => `<li><strong>${detail.checkName}</strong>: ${detail.suggestedFix}</li>`)
        .join('')}
    </ul>
  `;

  let emailRecipients = validationConfig.alerts.emailRecipients;
  if (report.tenantId) {
    try {
      const db = await getValidationDbConnection();
      const stored = await db.collection(validationConfig.collections.validationSettings).findOne({ tenantId: report.tenantId });
      if (Array.isArray(stored?.alertEmails) && stored.alertEmails.length) {
        emailRecipients = stored.alertEmails.map((item: unknown) => String(item || '').trim()).filter(Boolean);
      }
    } catch {
      // Fall back to environment recipients.
    }
  }

  if (emailRecipients.length) {
    await sendConfiguredMail({
      recipients: emailRecipients,
      subject: `Critical accounting validation issues: ${report.summary.critical}`,
      text: message,
      html,
    });
  }

  if (validationConfig.alerts.slackWebhookUrl) {
    await fetch(validationConfig.alerts.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
      }),
    });
  }
};
