import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { isValidReportId } from '../models/ValidationReport.js';
import { createValidationJob, getValidationJobStatus } from '../services/validationJobs.js';
import { getValidationReport, listValidationReports } from '../services/validationRunner.js';
import { repairValidationReportFindings } from '../services/validationRepair.js';
import { slugify } from '../validators/helpers.js';
import { getValidationDbConnection } from '../services/validationDb.js';
import { getValidationConfig } from '../config/validationConfig.js';

const router = Router();

const parseDate = (value: unknown, fallback: Date): Date => {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const monthStart = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const endOfDay = (value: Date): Date => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const routeParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

router.post('/run', (req: AuthenticatedRequest, res: Response) => {
  const periodStart = parseDate(req.body?.periodStart, monthStart());
  const periodEnd = endOfDay(parseDate(req.body?.periodEnd, new Date()));
  const includeRawData = req.body?.includeRawData !== false;
  const ruleNames = Array.isArray(req.body?.rules)
    ? req.body.rules.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : undefined;

  if (periodStart > periodEnd) {
    return res.status(400).json({
      success: false,
      error: 'periodStart must be before periodEnd.',
    });
  }

  const job = createValidationJob({
    periodStart,
    periodEnd,
    tenantId: req.tenantId,
    requestedBy: req.userId,
    includeRawData,
    ruleNames,
  });

  res.status(202).json({
    success: true,
    data: job,
  });
});

router.get('/status/:jobId', (req: AuthenticatedRequest, res: Response) => {
  const job = getValidationJobStatus(routeParam(req.params.jobId));
  if (!job) {
    return res.status(404).json({ success: false, error: 'Validation job not found.' });
  }

  res.json({ success: true, data: job });
});

router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationConfig = getValidationConfig();
    const db = await getValidationDbConnection();
    const stored = await db.collection(validationConfig.collections.validationSettings).findOne({ tenantId: req.tenantId });
    res.json({
      success: true,
      data: {
        scheduleEnabled: stored?.scheduleEnabled ?? validationConfig.scheduler.enabled,
        cron: stored?.cron || validationConfig.scheduler.cron,
        timezone: stored?.timezone || validationConfig.scheduler.timezone,
        alertEmails: stored?.alertEmails || validationConfig.alerts.emailRecipients,
        source: stored ? 'database' : 'environment-defaults',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to load validation settings.' });
  }
});

router.post('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationConfig = getValidationConfig();
    const alertEmails = Array.isArray(req.body?.alertEmails)
      ? req.body.alertEmails.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : String(req.body?.alertEmails || '')
          .split(/[,\n;]+/)
          .map((item) => item.trim())
          .filter(Boolean);
    const payload = {
      tenantId: req.tenantId,
      scheduleEnabled: req.body?.scheduleEnabled !== false,
      cron: String(req.body?.cron || validationConfig.scheduler.cron).trim(),
      timezone: String(req.body?.timezone || validationConfig.scheduler.timezone).trim(),
      alertEmails,
      updatedBy: req.userId,
      updatedAt: new Date(),
    };

    const db = await getValidationDbConnection();
    await db.collection(validationConfig.collections.validationSettings).updateOne(
      { tenantId: req.tenantId },
      { $set: payload, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true, data: payload });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to save validation settings.' });
  }
});

router.get('/reports', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reports = await listValidationReports({
      tenantId: req.tenantId,
      limit: Number(req.query.limit || 20),
      skip: Number(req.query.skip || 0),
    });
    res.json({ success: true, data: reports });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to list validation reports.' });
  }
});

router.get('/report/:reportId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = routeParam(req.params.reportId);
    if (!isValidReportId(reportId)) {
      return res.status(400).json({ success: false, error: 'Invalid report ID.' });
    }
    const report = await getValidationReport({ reportId, tenantId: req.tenantId });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Validation report not found.' });
    }
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to load validation report.' });
  }
});

router.get('/drilldown/:checkName/:reportId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = routeParam(req.params.reportId);
    const checkName = routeParam(req.params.checkName);
    if (!isValidReportId(reportId)) {
      return res.status(400).json({ success: false, error: 'Invalid report ID.' });
    }
    const report = await getValidationReport({ reportId, tenantId: req.tenantId });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Validation report not found.' });
    }

    const requested = slugify(decodeURIComponent(checkName));
    const detail = report.details.find((item) => slugify(item.checkName) === requested || item.rawDataKey === requested);
    const key = detail?.rawDataKey || requested;
    const rawData = report.rawDataSnapshots?.[key];

    res.json({
      success: true,
      data: {
        reportId,
        checkName: detail?.checkName || checkName,
        detail,
        drilldown: rawData || null,
        message: rawData ? 'Drilldown data loaded.' : 'This report does not include raw drilldown data for the requested check.',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to load validation drilldown.' });
  }
});

router.post('/feedback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validationConfig = getValidationConfig();
    const reportId = String(req.body?.reportId || '').trim();
    const checkName = String(req.body?.checkName || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!isValidReportId(reportId)) {
      return res.status(400).json({ success: false, error: 'Invalid report ID.' });
    }
    if (!checkName || !reason) {
      return res.status(400).json({ success: false, error: 'checkName and reason are required.' });
    }

    const report = await getValidationReport({ reportId, tenantId: req.tenantId });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Validation report not found.' });
    }

    const db = await getValidationDbConnection();
    await db.collection(validationConfig.collections.validationIssueFeedback).insertOne({
      reportId,
      checkName,
      reason,
      status: 'false_positive',
      tenantId: req.tenantId,
      createdBy: req.userId,
      createdAt: new Date(),
    });

    res.json({ success: true, data: { saved: true } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to save validation feedback.' });
  }
});

router.post('/repair', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportId = String(req.body?.reportId || '').trim();
    if (!isValidReportId(reportId)) {
      return res.status(400).json({ success: false, error: 'Invalid report ID.' });
    }

    const report = await getValidationReport({ reportId, tenantId: req.tenantId });
    if (!report) {
      return res.status(404).json({ success: false, error: 'Validation report not found.' });
    }

    const result = await repairValidationReportFindings({
      report,
      requestedBy: req.userId,
    });

    res.json({ success: true, data: result, message: result.message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Unable to repair validation findings.' });
  }
});

export default router;
