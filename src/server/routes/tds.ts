import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Vendor } from '../models/Vendor.js';
import { TdsReturn } from '../models/TdsReturn.js';
import { TdsCertificate } from '../models/TdsCertificate.js';
import {
  buildTdsDashboard,
  buildTdsReports,
  calculateTds,
  generateTdsCertificate,
  generateTdsReturn,
  getIndianFinancialYear,
  recordTdsChallan,
  recordTdsTransaction,
  runTdsReconciliation,
  saveTdsCompanySettings,
  seedDefaultTdsSections,
  updateTdsReturnStatus,
  upsertDeducteeProfile,
  upsertTdsSection,
} from '../services/tds.js';

const router = Router();

const isWriterRole = (req: AuthenticatedRequest): boolean => {
  const role = String(req.userRole || '').trim().toLowerCase();
  return ['admin', 'super_admin', 'manager', 'accountant'].includes(role);
};

const requireWriter = (req: AuthenticatedRequest, res: Response): boolean => {
  if (isWriterRole(req)) return true;
  res.status(403).json({ success: false, error: 'Only admin, manager, or accountant can modify TDS records' });
  return false;
};

const toClientError = (error: unknown, fallback: string): string => {
  const raw = String((error as any)?.message || '').trim();
  if (!raw) return fallback;
  if (raw.toLowerCase().includes('duplicate key')) return 'Duplicate TDS record detected. Refresh and verify existing records.';
  if (raw.toLowerCase().includes('cast to objectid failed')) return 'Selected TDS record is invalid or no longer available.';
  return raw;
};

router.get('/bootstrap', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await seedDefaultTdsSections();
    const [dashboard, vendors] = await Promise.all([
      buildTdsDashboard(),
      Vendor.find({ isActive: true })
        .sort({ name: 1 })
        .select('name email phone alternatePhone gstin pan isTdsApplicable deducteeType tdsSectionCode tdsRate ledgerAccountId')
        .lean(),
    ]);
    res.json({
      success: true,
      data: {
        ...dashboard,
        vendors,
        currentFinancialYear: getIndianFinancialYear(new Date()),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: toClientError(error, 'Failed to load TDS workspace') });
  }
});

router.get('/reports', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await buildTdsReports({
      startDate: String(req.query.startDate || ''),
      endDate: String(req.query.endDate || ''),
      financialYear: String(req.query.financialYear || ''),
      quarter: String(req.query.quarter || ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: toClientError(error, 'Failed to load TDS reports') });
  }
});

router.post('/company', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await saveTdsCompanySettings(req.body || {}, req.userId);
    res.json({ success: true, data, message: 'TDS company settings saved' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to save TDS company settings') });
  }
});

router.post('/sections/seed', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await seedDefaultTdsSections(req.userId);
    res.json({ success: true, data, message: 'Default TDS sections are ready' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to seed TDS sections') });
  }
});

router.post('/sections', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await upsertTdsSection(req.body || {}, req.userId);
    res.json({ success: true, data, message: 'TDS section saved' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to save TDS section') });
  }
});

router.post('/deductees', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await upsertDeducteeProfile({ ...(req.body || {}), createdBy: req.userId });
    res.json({ success: true, data, message: 'TDS deductee profile saved' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to save TDS deductee profile') });
  }
});

router.post('/calculate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await calculateTds(req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to calculate TDS') });
  }
});

router.post('/transactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await recordTdsTransaction({ ...(req.body || {}), createdBy: req.userId });
    res.status(201).json({ success: true, data, message: 'TDS transaction recorded' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to record TDS transaction') });
  }
});

router.post('/challans', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await recordTdsChallan({ ...(req.body || {}), createdBy: req.userId });
    res.status(201).json({ success: true, data, message: 'TDS challan recorded and allocated' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to record TDS challan') });
  }
});

router.post('/returns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await generateTdsReturn({ ...(req.body || {}), createdBy: req.userId });
    res.status(201).json({ success: true, data, message: 'Draft TDS return generated' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to generate TDS return') });
  }
});

router.post('/returns/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await updateTdsReturnStatus(String(req.params.id), req.body?.status, { ...(req.body || {}), createdBy: req.userId });
    res.json({ success: true, data, message: 'TDS return status updated' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to update TDS return status') });
  }
});

router.get('/returns/:id/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await TdsReturn.findById(String(req.params.id)).lean();
    if (!row) return res.status(404).json({ success: false, error: 'TDS return not found' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName || 'tds-return.txt'}"`);
    res.send(row.fileContent || '');
  } catch (error) {
    res.status(500).json({ success: false, error: toClientError(error, 'Failed to download TDS return') });
  }
});

router.post('/certificates', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await generateTdsCertificate({ ...(req.body || {}), createdBy: req.userId });
    res.status(201).json({ success: true, data, message: 'Draft TDS certificate generated' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to generate TDS certificate') });
  }
});

router.get('/certificates/:id/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await TdsCertificate.findById(String(req.params.id)).lean();
    if (!row) return res.status(404).json({ success: false, error: 'TDS certificate not found' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName || 'tds-certificate.txt'}"`);
    res.send(row.fileContent || '');
  } catch (error) {
    res.status(500).json({ success: false, error: toClientError(error, 'Failed to download TDS certificate') });
  }
});

router.post('/reconciliation', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const data = await runTdsReconciliation({ ...(req.body || {}), createdBy: req.userId });
    res.status(201).json({ success: true, data, message: 'TDS reconciliation run saved' });
  } catch (error) {
    res.status(400).json({ success: false, error: toClientError(error, 'Failed to reconcile TDS data') });
  }
});

export default router;
