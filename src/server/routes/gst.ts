import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import { AuditLog } from '../models/AuditLog.js';
import { GstReconciliationRun } from '../models/GstReconciliationRun.js';
import { GstReturnRecord, type GstReturnStatus, type GstReturnType } from '../models/GstReturnRecord.js';
import { GstinValidationCache } from '../models/GstinValidationCache.js';
import { User } from '../models/User.js';
import { writeAuditLog } from '../services/audit.js';
import {
  buildGstr1Preview,
  buildGstr2bReconciliation,
  buildGstr3bPreview,
  buildGstr9Preview,
  financialYearForDate,
  parseGstr2bImportText,
  validateGstinLocally,
  validateHsnSacCode,
} from '../services/gstCompliance.js';

const router = Router();

const gstPreviewRateLimit = createRateLimitMiddleware({
  bucket: 'gst-preview',
  limit: 25,
  windowMs: 60_000,
  message: 'Too many GST previews were requested in a short time. Please wait a minute and try again.',
  auditFlagType: 'gst_preview_rate_limit',
});

const gstSubmitRateLimit = createRateLimitMiddleware({
  bucket: 'gst-submit',
  limit: 10,
  windowMs: 60_000,
  message: 'Too many GST save or submit requests were made in a short time. Please wait a minute and try again.',
  auditFlagType: 'gst_submit_rate_limit',
});

const gstAuditRateLimit = createRateLimitMiddleware({
  bucket: 'gst-audit',
  limit: 20,
  windowMs: 60_000,
  message: 'Too many GST audit log requests were made in a short time. Please wait a minute and try again.',
  auditFlagType: 'gst_audit_rate_limit',
});

const normalizeType = (value: unknown): GstReturnType => {
  const type = String(value || '').trim().toUpperCase();
  if (type === 'GSTR3B') return 'GSTR3B';
  if (type === 'GSTR9') return 'GSTR9';
  return 'GSTR1';
};

const normalizeStatus = (value: unknown): GstReturnStatus => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'saved') return 'saved';
  if (status === 'submitted') return 'submitted';
  if (status === 'filed') return 'filed';
  if (status === 'processed') return 'processed';
  if (status === 'rejected') return 'rejected';
  return 'draft';
};

const buildFilingKey = (returnType: GstReturnType, periodKey?: string, financialYear?: string): string => {
  const scope = returnType === 'GSTR9' ? String(financialYear || '').trim() : String(periodKey || '').trim();
  return `${returnType}:${scope}`;
};

const buildLocalReference = (returnType: GstReturnType): string =>
  `LOCAL-${returnType}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

const GST_MONTH_REQUIRED_MESSAGE = 'Return period is required. Select the filing month before continuing.';
const GST_GSTIN_REQUIRED_MESSAGE = 'GSTIN is required. Enter the 15-character GSTIN you want to validate.';
const GST_HSN_REQUIRED_MESSAGE = 'HSN or SAC code is required. Enter the code you want to validate.';
const GST_RECONCILIATION_IMPORT_REQUIRED_MESSAGE =
  'GSTR-2B import data is required. Paste the JSON or CSV export before previewing or saving the match.';
const GST_RECONCILIATION_IMPORT_INVALID_MESSAGE =
  'No valid GSTR-2B rows were found in the pasted data. Use JSON array or CSV and include supplier GSTIN and invoice number columns.';

const getStoreGstin = async (req: AuthenticatedRequest): Promise<string> => {
  if (!req.userId) return '';
  const user = await User.findById(req.userId).select('gstin');
  return String(user?.gstin || '').trim().toUpperCase();
};

router.get('/meta', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const storeGstin = await getStoreGstin(req);
    res.json({
      success: true,
      data: {
        storeGstin,
        currentFinancialYear: financialYearForDate(new Date()),
        supported: {
          gstinValidation: true,
          hsnValidation: true,
          gstr1Preview: true,
          gstr3bPreview: true,
          gstr9Preview: true,
          reconciliationImport: true,
          filingHistory: true,
          offlineJsonExport: true,
        },
        externalOnly: {
          gstnOtpAuth: false,
          directGstnSubmission: false,
          liveGstr2bFetch: false,
          liveEinvoiceIrn: false,
          liveEwayBill: false,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load GST workspace metadata' });
  }
});

router.post('/validate/gstin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = validateGstinLocally(req.body?.gstin);
    const normalizedGstin = validation.normalizedGstin;
    if (!normalizedGstin) {
      return res.status(400).json({ success: false, error: GST_GSTIN_REQUIRED_MESSAGE });
    }

    const now = new Date();
    const cached = await GstinValidationCache.findOne({
      gstin: normalizedGstin,
      expiresAt: { $gt: now },
    });

    if (cached) {
      return res.json({
        success: true,
        data: {
          gstin: cached.gstin,
          isValid: cached.isValid,
          formatValid: cached.formatValid,
          checksumValid: cached.checksumValid,
          stateCode: cached.stateCode,
          pan: cached.pan,
          registrationStatus: cached.registrationStatus || 'not_queried',
          legalName: cached.legalName || '',
          address: cached.address || '',
          source: cached.source,
          validatedAt: cached.validatedAt,
          expiresAt: cached.expiresAt,
          message: cached.isValid ? 'GSTIN is valid in local checksum validation cache.' : 'GSTIN is invalid in local checksum validation cache.',
          supportsLiveLookup: false,
        },
      });
    }

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const document = await GstinValidationCache.findOneAndUpdate(
      { gstin: normalizedGstin },
      {
        $set: {
          gstin: normalizedGstin,
          isValid: validation.isValid,
          formatValid: validation.formatValid,
          checksumValid: validation.checksumValid,
          stateCode: validation.stateCode,
          pan: validation.pan,
          registrationStatus: 'not_queried',
          source: 'local_checksum',
          validatedAt: now,
          expiresAt,
          metadata: {
            userId: req.userId,
            ipAddress: req.ip,
          },
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await writeAuditLog({
      module: 'gst',
      action: 'gstin_validated',
      entityType: 'gstin',
      referenceNo: normalizedGstin,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        isValid: validation.isValid,
        source: 'local_checksum',
      },
    });

    res.json({
      success: true,
      data: {
        gstin: document.gstin,
        isValid: document.isValid,
        formatValid: document.formatValid,
        checksumValid: document.checksumValid,
        stateCode: document.stateCode,
        pan: document.pan,
        registrationStatus: document.registrationStatus || 'not_queried',
        legalName: document.legalName || '',
        address: document.address || '',
        source: document.source,
        validatedAt: document.validatedAt,
        expiresAt: document.expiresAt,
        message: validation.message,
        supportsLiveLookup: false,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to validate GSTIN' });
  }
});

router.post('/validate/hsn', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!String(req.body?.code || '').trim()) {
      return res.status(400).json({ success: false, error: GST_HSN_REQUIRED_MESSAGE });
    }
    const result = validateHsnSacCode(req.body?.code, {
      turnoverBand: req.body?.turnoverBand === 'above_5cr' ? 'above_5cr' : 'up_to_5cr',
    });
    await writeAuditLog({
      module: 'gst',
      action: 'hsn_validated',
      entityType: 'hsn_sac',
      referenceNo: result.normalizedCode,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        isValid: result.isValid,
        codeType: result.codeType,
      },
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to validate HSN/SAC' });
  }
});

router.post('/returns/preview', gstPreviewRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const returnType = normalizeType(req.body?.returnType);
    const storeGstin = await getStoreGstin(req);

    if (returnType === 'GSTR9') {
      const financialYear = String(req.body?.financialYear || '').trim() || financialYearForDate(new Date());
      const preview = await buildGstr9Preview({ financialYear, storeGstin });
      return res.json({ success: true, data: { returnType, financialYear, ...preview } });
    }

    const periodKey = String(req.body?.periodKey || '').trim();
    if (!periodKey) {
      return res.status(400).json({ success: false, error: GST_MONTH_REQUIRED_MESSAGE });
    }

    if (returnType === 'GSTR3B') {
      const preview = await buildGstr3bPreview({
        periodKey,
        storeGstin,
        adjustments: {
          itcReversal: Number(req.body?.adjustments?.itcReversal || 0),
          reverseChargeTax: Number(req.body?.adjustments?.reverseChargeTax || 0),
          interest: Number(req.body?.adjustments?.interest || 0),
          lateFee: Number(req.body?.adjustments?.lateFee || 0),
          otherItcReduction: Number(req.body?.adjustments?.otherItcReduction || 0),
        },
      });
      return res.json({ success: true, data: { returnType, periodKey, financialYear: financialYearForDate(new Date(`${periodKey}-01`)), ...preview } });
    }

    const preview = await buildGstr1Preview({ periodKey, storeGstin });
    return res.json({ success: true, data: { returnType, periodKey, financialYear: financialYearForDate(new Date(`${periodKey}-01`)), ...preview } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to prepare GST return preview' });
  }
});

router.get('/returns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query?.returnType) filter.returnType = normalizeType(req.query.returnType);
    if (req.query?.periodKey) filter.periodKey = String(req.query.periodKey);
    if (req.query?.financialYear) filter.financialYear = String(req.query.financialYear);
    const rows = await GstReturnRecord.find(filter).sort({ generatedAt: -1, createdAt: -1 }).limit(100);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load GST return history' });
  }
});

router.post('/returns/save', gstSubmitRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const returnType = normalizeType(req.body?.returnType);
    const storeGstin = await getStoreGstin(req);
    let preview: any;
    let periodKey = '';
    let financialYear = '';

    if (returnType === 'GSTR9') {
      financialYear = String(req.body?.financialYear || '').trim() || financialYearForDate(new Date());
      preview = await buildGstr9Preview({ financialYear, storeGstin });
    } else if (returnType === 'GSTR3B') {
      periodKey = String(req.body?.periodKey || '').trim();
      if (!periodKey) {
        return res.status(400).json({ success: false, error: GST_MONTH_REQUIRED_MESSAGE });
      }
      financialYear = financialYearForDate(new Date(`${periodKey}-01`));
      preview = await buildGstr3bPreview({
        periodKey,
        storeGstin,
        adjustments: {
          itcReversal: Number(req.body?.adjustments?.itcReversal || 0),
          reverseChargeTax: Number(req.body?.adjustments?.reverseChargeTax || 0),
          interest: Number(req.body?.adjustments?.interest || 0),
          lateFee: Number(req.body?.adjustments?.lateFee || 0),
          otherItcReduction: Number(req.body?.adjustments?.otherItcReduction || 0),
        },
      });
    } else {
      periodKey = String(req.body?.periodKey || '').trim();
      if (!periodKey) {
        return res.status(400).json({ success: false, error: GST_MONTH_REQUIRED_MESSAGE });
      }
      financialYear = financialYearForDate(new Date(`${periodKey}-01`));
      preview = await buildGstr1Preview({ periodKey, storeGstin });
    }

    const filingKey = buildFilingKey(returnType, periodKey, financialYear);
    const historyEntry = {
      status: 'saved' as GstReturnStatus,
      changedAt: new Date(),
      changedBy: req.userId,
      note: 'Return saved from GST workspace',
    };

    const record = await GstReturnRecord.findOneAndUpdate(
      { filingKey },
      {
        $set: {
          filingKey,
          returnType,
          periodKey: periodKey || undefined,
          periodCode: periodKey ? periodKey.replace('-', '') : undefined,
          financialYear: financialYear || undefined,
          gstin: storeGstin || undefined,
          status: 'saved',
          generatedAt: new Date(),
          generatedBy: req.userId,
          summary: preview.summary || {},
          payload: preview.payload || {},
          warnings: Array.isArray(preview.warnings) ? preview.warnings : [],
          notes: String(req.body?.notes || '').trim() || undefined,
          sourceMetrics: {
            counts: preview.summary?.counts || {},
            totals: preview.summary?.totals || {},
          },
        },
        $push: { statusHistory: historyEntry },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await writeAuditLog({
      module: 'gst',
      action: 'return_saved',
      entityType: 'gst_return',
      entityId: record._id.toString(),
      referenceNo: filingKey,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        returnType,
        periodKey,
        financialYear,
      },
    });

    res.status(201).json({ success: true, data: record, message: 'GST return saved locally for filing history.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to save GST return record' });
  }
});

router.post('/returns/:id/submit', gstSubmitRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const record = await GstReturnRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'GST return record not found' });
    }
    const filingReference = record.filingReference || buildLocalReference(record.returnType);
    record.status = 'submitted';
    record.filingReference = filingReference;
    record.submittedAt = new Date();
    record.statusHistory = [
      ...(record.statusHistory || []),
      {
        status: 'submitted',
        changedAt: new Date(),
        changedBy: req.userId,
        note: String(req.body?.note || 'Marked submitted from offline GST workspace'),
      },
    ];
    await record.save();

    await writeAuditLog({
      module: 'gst',
      action: 'return_submitted',
      entityType: 'gst_return',
      entityId: record._id.toString(),
      referenceNo: filingReference,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        returnType: record.returnType,
        periodKey: record.periodKey,
        financialYear: record.financialYear,
      },
    });

    res.json({
      success: true,
      data: record,
      message: 'GST return marked as submitted locally. This is internal tracking and not direct GSTN filing.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to submit GST return record' });
  }
});

router.post('/returns/:id/status', gstSubmitRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const record = await GstReturnRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'GST return record not found' });
    }

    const status = normalizeStatus(req.body?.status);
    record.status = status;
    if (status === 'filed') record.filedAt = new Date();
    if (status === 'processed') record.processedAt = new Date();
    if (status === 'rejected') record.rejectedAt = new Date();
    record.statusHistory = [
      ...(record.statusHistory || []),
      {
        status,
        changedAt: new Date(),
        changedBy: req.userId,
        note: String(req.body?.note || '').trim() || undefined,
      },
    ];
    await record.save();

    await writeAuditLog({
      module: 'gst',
      action: 'return_status_updated',
      entityType: 'gst_return',
      entityId: record._id.toString(),
      referenceNo: record.filingReference || record.filingKey,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        status,
        returnType: record.returnType,
        periodKey: record.periodKey,
        financialYear: record.financialYear,
      },
    });

    res.json({ success: true, data: record, message: 'GST return status updated.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update GST return status' });
  }
});

router.post('/reconciliation/preview', gstPreviewRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const periodKey = String(req.body?.periodKey || '').trim();
    const importText = String(req.body?.importText || '').trim();
    if (!periodKey) {
      return res.status(400).json({ success: false, error: GST_MONTH_REQUIRED_MESSAGE });
    }
    if (!importText) {
      return res.status(400).json({ success: false, error: GST_RECONCILIATION_IMPORT_REQUIRED_MESSAGE });
    }
    const importRows = parseGstr2bImportText(importText);
    if (!importRows.length) {
      return res.status(400).json({ success: false, error: GST_RECONCILIATION_IMPORT_INVALID_MESSAGE });
    }
    const storeGstin = await getStoreGstin(req);
    const data = await buildGstr2bReconciliation({
      periodKey,
      importRows,
      decisions: req.body?.decisions || {},
      storeGstin,
    });
    res.json({ success: true, data: { ...data, importedRowsCount: importRows.length } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to preview GSTR-2B reconciliation' });
  }
});

router.post('/reconciliation/runs', gstSubmitRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const periodKey = String(req.body?.periodKey || '').trim();
    const importText = String(req.body?.importText || '').trim();
    if (!periodKey) {
      return res.status(400).json({ success: false, error: GST_MONTH_REQUIRED_MESSAGE });
    }
    if (!importText) {
      return res.status(400).json({ success: false, error: GST_RECONCILIATION_IMPORT_REQUIRED_MESSAGE });
    }
    const importRows = parseGstr2bImportText(importText);
    if (!importRows.length) {
      return res.status(400).json({ success: false, error: GST_RECONCILIATION_IMPORT_INVALID_MESSAGE });
    }
    const storeGstin = await getStoreGstin(req);
    const data = await buildGstr2bReconciliation({
      periodKey,
      importRows,
      decisions: req.body?.decisions || {},
      storeGstin,
    });

    const run = await GstReconciliationRun.create({
      periodKey,
      gstin: storeGstin || undefined,
      source: 'manual_import',
      importedRowsCount: importRows.length,
      summary: data.summary,
      eligibleItc: data.eligibleItc,
      rows: data.rows,
      importSample: importText.slice(0, 5000),
      notes: String(req.body?.notes || '').trim() || undefined,
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'gst',
      action: 'reconciliation_saved',
      entityType: 'gstr2b_reconciliation',
      entityId: run._id.toString(),
      referenceNo: periodKey,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        importedRowsCount: importRows.length,
        eligibleItc: data.eligibleItc,
      },
    });

    res.status(201).json({ success: true, data: run, message: 'GSTR-2B reconciliation run saved.' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to save reconciliation run' });
  }
});

router.get('/reconciliation/runs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: Record<string, any> = {};
    if (req.query?.periodKey) filter.periodKey = String(req.query.periodKey);
    const rows = await GstReconciliationRun.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load reconciliation history' });
  }
});

router.get('/audit', gstAuditRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 50)));
    const rows = await AuditLog.find({ module: 'gst' }).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load GST audit trail' });
  }
});

export default router;
