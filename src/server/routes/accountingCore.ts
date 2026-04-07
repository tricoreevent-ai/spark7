import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { AccountingPayment } from '../models/AccountingPayment.js';
import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { FixedAsset } from '../models/FixedAsset.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { JournalLine } from '../models/JournalLine.js';
import { Vendor } from '../models/Vendor.js';
import { AuditFlag } from '../models/AuditFlag.js';
import { RecordVersion } from '../models/RecordVersion.js';
import { writeAuditLog } from '../services/audit.js';
import { writeAuditFlags } from '../services/auditFlag.js';
import { writeRecordVersion } from '../services/recordVersion.js';
import {
  buildDashboardSummary,
  cancelInvoice,
  cancelJournalEntry,
  createFixedAsset,
  createInvoice,
  createJournalEntry,
  createVendor,
  ensureFinancialPeriod,
  importBankStatement,
  listVendorBalances,
  recordExpense,
  recordPayment,
  runAssetDepreciation,
  setFinancialPeriodLock,
  toCsv,
} from '../services/accountingEngine.js';
import { ChartAccount } from '../models/ChartAccount.js';

const router = Router();

const isWriterRole = (req: AuthenticatedRequest): boolean => {
  const role = String(req.userRole || '').trim().toLowerCase();
  return ['admin', 'super_admin', 'manager', 'accountant'].includes(role);
};

const requireWriter = (req: AuthenticatedRequest, res: Response): boolean => {
  if (isWriterRole(req)) return true;
  res.status(403).json({ success: false, error: 'Only admin, manager, or accountant can modify accounting records' });
  return false;
};

const canUnlockFinancialPeriod = (req: AuthenticatedRequest): boolean => {
  const role = String(req.userRole || '').trim().toLowerCase();
  return ['admin', 'super_admin', 'accountant'].includes(role);
};

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const toIso = (value?: Date): string | undefined => (value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : undefined);

const toDateWindow = (startDate?: string, endDate?: string): { $gte?: Date; $lte?: Date } | undefined => {
  if (!startDate && !endDate) return undefined;
  const range: { $gte?: Date; $lte?: Date } = {};
  if (startDate) {
    const start = new Date(String(startDate));
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      range.$gte = start;
    }
  }
  if (endDate) {
    const end = new Date(String(endDate));
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
  }
  return Object.keys(range).length ? range : undefined;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
};

const parseBankCsv = (csvText: string) => {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const dateIndex = header.findIndex((cell) => cell.includes('date'));
  const amountIndex = header.findIndex((cell) => cell.includes('amount'));
  const descIndex = header.findIndex((cell) => cell.includes('description') || cell.includes('narration') || cell.includes('particular'));

  if (dateIndex < 0 || amountIndex < 0) {
    throw new Error('CSV must contain Date and Amount columns');
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      date: cells[dateIndex],
      amount: Number(cells[amountIndex] || 0),
      description: descIndex >= 0 ? cells[descIndex] : '',
    };
  }).filter((row) => row.date && Number.isFinite(row.amount));
};

const toClientErrorMessage = (error: unknown, fallback: string): string => {
  const raw = String((error as any)?.message || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (lower.includes('plan executor error during findandmodify')) {
    return 'A database save conflict occurred. Please refresh and retry.';
  }

  if ((lower.includes('e11000') || lower.includes('duplicate key')) && lower.includes('chartaccounts')) {
    if (lower.includes('fixed_assets') || lower.includes('systemkey')) {
      return 'System account setup conflict detected for "Fixed Assets". Please refresh and try again.';
    }
    return 'Duplicate chart account configuration detected. Please refresh and retry.';
  }

  if (lower.includes('e11000') || lower.includes('duplicate key')) {
    return 'Duplicate record detected. Please verify existing data and try again.';
  }

  if (lower.includes('validation failed')) {
    return 'One or more fields are invalid. Please review the form and try again.';
  }

  if (lower.includes('cast to objectid failed')) {
    return 'The selected record is invalid or no longer available.';
  }

  if (lower.includes('mongo') || lower.includes('mongodb')) {
    return 'Database operation failed. Please try again or contact support if this persists.';
  }

  return raw;
};

router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await buildDashboardSummary();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to load accounting dashboard') });
  }
});

router.get('/journal-entries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, referenceType, status, limit = 100, skip = 0 } = req.query;
    const filter: Record<string, any> = {};
    if (referenceType) filter.referenceType = String(referenceType);
    if (status) filter.status = String(status);
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(String(startDate));
      if (endDate) {
        const end = new Date(String(endDate));
        end.setHours(23, 59, 59, 999);
        filter.entryDate.$lte = end;
      }
    }

    const rows = await JournalEntry.find(filter)
      .sort({ entryDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await JournalEntry.countDocuments(filter);
    res.json({ success: true, data: rows, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch journal entries') });
  }
});

router.post('/journal-entries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const { entryDate, referenceType = 'manual', referenceId, referenceNo, description, paymentMode, lines } = req.body;
    const result = await createJournalEntry({
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      referenceType,
      referenceId,
      referenceNo,
      description,
      paymentMode,
      createdBy: req.userId,
      lines: Array.isArray(lines) ? lines : [],
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.status(201).json({ success: true, data: result, message: 'Journal entry created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to create journal entry') });
  }
});

router.post('/journal-entries/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await cancelJournalEntry({
      journalEntryId: String(req.params.id),
      reason: String(req.body?.reason || '').trim() || 'Cancelled by user',
      createdBy: req.userId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.json({ success: true, data: result, message: 'Journal entry cancelled with reversal' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to cancel journal entry') });
  }
});

router.get('/invoices', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, status, referenceType, q, limit = 100, skip = 0 } = req.query;
    const filter: Record<string, any> = {};
    if (status) filter.status = String(status);
    if (referenceType) filter.referenceType = String(referenceType);
    if (q) {
      filter.$or = [
        { invoiceNumber: { $regex: String(q), $options: 'i' } },
        { customerName: { $regex: String(q), $options: 'i' } },
      ];
    }
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) filter.invoiceDate.$gte = new Date(String(startDate));
      if (endDate) {
        const end = new Date(String(endDate));
        end.setHours(23, 59, 59, 999);
        filter.invoiceDate.$lte = end;
      }
    }

    const rows = await AccountingInvoice.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await AccountingInvoice.countDocuments(filter);
    res.json({ success: true, data: rows, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch invoices') });
  }
});

router.post('/invoices', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await createInvoice({
      invoiceDate: req.body?.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
      dueDate: req.body?.dueDate ? new Date(req.body.dueDate) : undefined,
      customerId: req.body?.customerId,
      customerName: String(req.body?.customerName || '').trim(),
      referenceType: req.body?.referenceType || 'manual',
      referenceId: req.body?.referenceId,
      description: req.body?.description,
      baseAmount: Number(req.body?.baseAmount || 0),
      gstAmount: Number(req.body?.gstAmount || 0),
      gstRate: Number(req.body?.gstRate || 0),
      gstTreatment: req.body?.gstTreatment || 'none',
      paymentAmount: Number(req.body?.paymentAmount || 0),
      paymentMode: req.body?.paymentMode || 'cash',
      revenueAccountKey: req.body?.revenueAccountKey || 'booking_revenue',
      createdBy: req.userId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.status(201).json({ success: true, data: result, message: 'Invoice created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to create invoice') });
  }
});

router.post('/invoices/:id/payments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await recordPayment({
      invoiceId: String(req.params.id),
      amount: Number(req.body?.amount || 0),
      mode: req.body?.mode || req.body?.paymentMode || 'cash',
      description: req.body?.description,
      createdBy: req.userId,
      paymentDate: req.body?.paymentDate ? new Date(req.body.paymentDate) : new Date(),
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.status(201).json({ success: true, data: result, message: 'Payment recorded' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to record payment') });
  }
});

router.post('/invoices/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await cancelInvoice({
      invoiceId: String(req.params.id),
      reason: String(req.body?.reason || '').trim() || 'Cancelled by user',
      createdBy: req.userId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.json({ success: true, data: result, message: 'Invoice cancelled' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to cancel invoice') });
  }
});

router.get('/payments', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, mode, limit = 100, skip = 0 } = req.query;
    const filter: Record<string, any> = {};
    if (mode) filter.mode = String(mode);
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(String(startDate));
      if (endDate) {
        const end = new Date(String(endDate));
        end.setHours(23, 59, 59, 999);
        filter.paymentDate.$lte = end;
      }
    }

    const rows = await AccountingPayment.find(filter)
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await AccountingPayment.countDocuments(filter);
    res.json({ success: true, data: rows, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch payments') });
  }
});

router.post('/expenses', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await recordExpense({
      expenseDate: req.body?.expenseDate ? new Date(req.body.expenseDate) : new Date(),
      description: String(req.body?.description || '').trim(),
      amount: Number(req.body?.amount || 0),
      paidAmount: Number(req.body?.paidAmount ?? req.body?.amount ?? 0),
      paymentMode: req.body?.paymentMode || 'cash',
      expenseAccountId: req.body?.expenseAccountId,
      expenseAccountName: req.body?.expenseAccountName || req.body?.category,
      vendorId: req.body?.vendorId,
      vendorName: req.body?.vendorName,
      vendorContact: req.body?.vendorContact,
      vendorPhone: req.body?.vendorPhone,
      createdBy: req.userId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.status(201).json({ success: true, data: result, message: 'Expense recorded' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to record expense') });
  }
});

router.get('/vendors', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [rows, balances] = await Promise.all([
      Vendor.find({ isActive: true }).sort({ name: 1 }),
      listVendorBalances(),
    ]);
    const map = new Map(balances.map((row) => [String(row._id), row]));
    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row.toObject(),
        ...map.get(row._id.toString()),
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch vendors') });
  }
});

router.post('/vendors', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await createVendor({
      name: String(req.body?.name || '').trim(),
      contact: req.body?.contact,
      email: req.body?.email,
      phone: req.body?.phone,
      address: req.body?.address,
      createdBy: req.userId,
      metadata: {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    res.status(201).json({ success: true, data: result, message: 'Vendor created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to create vendor') });
  }
});

router.put('/vendors/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;

    const vendor = await Vendor.findById(String(req.params.id));
    if (!vendor || !vendor.isActive) {
      return res.status(404).json({ success: false, error: 'Vendor not found' });
    }

    const nextName = String(req.body?.name ?? vendor.name ?? '').trim();
    if (!nextName) {
      return res.status(400).json({ success: false, error: 'Vendor name is required' });
    }

    const escapedName = nextName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const duplicate = await Vendor.findOne({
      _id: { $ne: vendor._id },
      name: { $regex: `^${escapedName}$`, $options: 'i' },
    });
    if (duplicate) {
      return res.status(409).json({ success: false, error: 'Vendor with this name already exists' });
    }

    const before = vendor.toObject();
    vendor.name = nextName;
    vendor.contact = String(req.body?.contact ?? vendor.contact ?? '').trim() || undefined;
    vendor.phone = String(req.body?.phone ?? vendor.phone ?? '').trim() || undefined;
    vendor.email = String(req.body?.email ?? vendor.email ?? '').trim().toLowerCase() || undefined;
    vendor.address = String(req.body?.address ?? vendor.address ?? '').trim() || undefined;
    await vendor.save();

    if (vendor.ledgerAccountId) {
      const ledgerAccount = await ChartAccount.findById(vendor.ledgerAccountId);
      if (ledgerAccount && ledgerAccount.subType === 'supplier' && !ledgerAccount.isSystem) {
        ledgerAccount.accountName = `Vendor - ${vendor.name}`;
        await ledgerAccount.save();
      }
    }

    await writeAuditLog({
      module: 'accounting',
      action: 'vendor_updated',
      entityType: 'vendor',
      entityId: vendor._id.toString(),
      referenceNo: vendor.name,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        userAgent: req.get('user-agent'),
      },
      before,
      after: vendor.toObject(),
    });

    await writeRecordVersion({
      module: 'accounting',
      entityType: 'vendor',
      recordId: vendor._id.toString(),
      action: 'UPDATE',
      changedBy: req.userId,
      dataSnapshot: vendor.toObject(),
      metadata: {
        userAgent: req.get('user-agent'),
      },
    });

    res.json({ success: true, data: vendor, message: 'Vendor updated' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to update vendor') });
  }
});

router.get('/periods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = Number(req.query?.year || new Date().getFullYear());
    const periods = await Promise.all(Array.from({ length: 12 }, (_, index) => ensureFinancialPeriod(index + 1, year)));
    res.json({ success: true, data: periods });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch financial periods') });
  }
});

router.post('/periods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const isLocked = Boolean(req.body?.isLocked);
    if (!isLocked && !canUnlockFinancialPeriod(req)) {
      return res.status(403).json({ success: false, error: 'Only admin or accountant can unlock a financial period' });
    }
    const result = await setFinancialPeriodLock(
      Number(req.body?.month || 0),
      Number(req.body?.year || 0),
      isLocked,
      req.userId
    );
    await writeAuditLog({
      module: 'accounting',
      action: isLocked ? 'financial_period_locked' : 'financial_period_unlocked',
      entityType: 'financial_period',
      entityId: result._id.toString(),
      referenceNo: result.periodKey,
      userId: req.userId,
      ipAddress: req.ip,
      after: result.toObject(),
      metadata: {
        userAgent: req.get('user-agent'),
      },
    });
    res.json({ success: true, data: result, message: `Period ${result.periodKey} updated` });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to update financial period') });
  }
});

router.get('/fixed-assets', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await FixedAsset.find().sort({ purchaseDate: -1, createdAt: -1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch fixed assets') });
  }
});

router.post('/fixed-assets', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await createFixedAsset({
      assetName: String(req.body?.assetName || '').trim(),
      description: req.body?.description,
      cost: Number(req.body?.cost || 0),
      lifeYears: Number(req.body?.lifeYears || 0),
      purchaseDate: req.body?.purchaseDate ? new Date(req.body.purchaseDate) : new Date(),
      createdBy: req.userId,
    });
    res.status(201).json({ success: true, data: result, message: 'Fixed asset created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to create fixed asset') });
  }
});

router.post('/fixed-assets/:id/depreciate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await runAssetDepreciation(String(req.params.id), {
      postingDate: req.body?.postingDate ? new Date(req.body.postingDate) : new Date(),
      createdBy: req.userId,
    });
    res.json({ success: true, data: result, message: 'Depreciation posted' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to post depreciation') });
  }
});

router.post('/reconciliation/import', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const rows = parseBankCsv(String(req.body?.csvText || ''));
    const result = await importBankStatement(rows);
    const markMatched = Boolean(req.body?.markMatched);
    if (Boolean(req.body?.markMatched) && result.matched.length > 0) {
      const matchedIds = result.matched.map((row) => row.ledger.id);
      await AccountLedgerEntry.updateMany(
        { _id: { $in: matchedIds } },
        { $set: { isReconciled: true, reconciledAt: new Date() } }
      );
    }

    await writeAuditLog({
      module: 'accounting',
      action: 'bank_reconciliation_imported',
      entityType: 'bank_reconciliation',
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        markMatched,
        statementRows: rows.length,
        matchedCount: result.matched.length,
        unmatchedStatementCount: result.unmatchedStatementRows.length,
        unmatchedLedgerCount: result.unmatchedLedgerRows.length,
        matches: result.matched.slice(0, 500).map((row) => {
          const bankAmount = round2(Number(row.statement?.amount || 0));
          const systemAmount = round2(Math.max(Number(row.ledger?.debit || 0), Number(row.ledger?.credit || 0)));
          return {
            ledgerEntryId: row.ledger?.id,
            bankAmount,
            systemAmount,
            difference: round2(bankAmount - systemAmount),
          };
        }),
      },
    });

    const mismatchRows = result.matched
      .map((row) => {
        const bankAmount = round2(Number(row.statement?.amount || 0));
        const systemAmount = round2(Math.max(Number(row.ledger?.debit || 0), Number(row.ledger?.credit || 0)));
        return {
          ledgerEntryId: row.ledger?.id,
          bankAmount,
          systemAmount,
          difference: round2(bankAmount - systemAmount),
        };
      })
      .filter((row) => row.difference !== 0);

    await writeAuditFlags([
      ...(result.unmatchedStatementRows.length > 0
        ? [{
            module: 'accounting',
            flagType: 'bank_unmatched_statement_rows',
            severity: 'high' as const,
            message: `${result.unmatchedStatementRows.length} bank statement rows are not matched in system ledger`,
            detectedBy: req.userId,
            metadata: {
              statementRows: rows.length,
              unmatchedStatementRows: result.unmatchedStatementRows.slice(0, 250),
            },
          }]
        : []),
      ...(result.unmatchedLedgerRows.length > 0
        ? [{
            module: 'accounting',
            flagType: 'bank_unmatched_ledger_rows',
            severity: 'high' as const,
            message: `${result.unmatchedLedgerRows.length} ledger rows are not matched in imported statement`,
            detectedBy: req.userId,
            metadata: {
              statementRows: rows.length,
              unmatchedLedgerRows: result.unmatchedLedgerRows.slice(0, 250),
            },
          }]
        : []),
      ...(mismatchRows.length > 0
        ? [{
            module: 'accounting',
            flagType: 'bank_amount_mismatch',
            severity: 'critical' as const,
            message: `${mismatchRows.length} reconciled rows have amount differences`,
            detectedBy: req.userId,
            metadata: {
              mismatches: mismatchRows.slice(0, 250),
            },
          }]
        : []),
    ]);

    res.json({
      success: true,
      data: {
        matched: result.matched,
        unmatchedStatementRows: result.unmatchedStatementRows,
        unmatchedLedgerRows: result.unmatchedLedgerRows,
      },
      message: `Matched ${result.matched.length} bank rows`,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to import reconciliation file') });
  }
});

router.get('/audit/flags', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status = 'open', severity, module = 'accounting', limit = 200, skip = 0 } = req.query;
    const detectedAtRange = toDateWindow(req.query?.startDate as string, req.query?.endDate as string);
    const filter: Record<string, any> = {
      module: String(module || 'accounting'),
    };
    if (status) filter.status = String(status);
    if (severity) filter.severity = String(severity);
    if (detectedAtRange) filter.detectedAt = detectedAtRange;

    const rows = await AuditFlag.find(filter)
      .sort({ detectedAt: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Math.max(1, Math.min(1000, Number(limit) || 200)));
    const total = await AuditFlag.countDocuments(filter);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        skip: Number(skip),
        limit: Math.max(1, Math.min(1000, Number(limit) || 200)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch audit flags') });
  }
});

router.get('/audit/integrity-check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entryDateRange = toDateWindow(req.query?.startDate as string, req.query?.endDate as string);
    const invoiceDateRange = toDateWindow(req.query?.startDate as string, req.query?.endDate as string);
    const paymentDateRange = toDateWindow(req.query?.startDate as string, req.query?.endDate as string);
    const cashLimit = Math.max(0, Number(req.query?.cashLimit || 10000));

    const journalLineMatch: Record<string, any> = {};
    if (entryDateRange) journalLineMatch.entryDate = entryDateRange;

    const invoiceMatch: Record<string, any> = {
      status: { $in: ['posted', 'partial', 'paid', 'cancelled'] },
    };
    if (invoiceDateRange) invoiceMatch.invoiceDate = invoiceDateRange;

    const paymentMatch: Record<string, any> = {};
    if (paymentDateRange) paymentMatch.paymentDate = paymentDateRange;

    const [
      journalTotalsAgg,
      unbalancedEntries,
      orphanJournalLines,
      invoicesMissingJournal,
      paymentsMissingInvoice,
      negativeBalances,
      manualJournalEntries,
      backdatedEntries,
      cashTransactionsAboveLimit,
      cancelledInvoices,
      cancelledJournalEntries,
      editedInvoiceVersions,
    ] = await Promise.all([
        JournalLine.aggregate([
          { $match: journalLineMatch },
          {
            $group: {
              _id: null,
              totalDebit: { $sum: '$debitAmount' },
              totalCredit: { $sum: '$creditAmount' },
            },
          },
        ]),
        JournalEntry.find({
          ...(entryDateRange ? { entryDate: entryDateRange } : {}),
          $expr: { $ne: ['$totalDebit', '$totalCredit'] },
        })
          .sort({ entryDate: -1, createdAt: -1 })
          .limit(250)
          .select('entryNumber entryDate totalDebit totalCredit status'),
        JournalLine.aggregate([
          { $match: journalLineMatch },
          {
            $lookup: {
              from: 'journalentries',
              localField: 'journalId',
              foreignField: '_id',
              as: 'journal',
            },
          },
          {
            $lookup: {
              from: 'chartaccounts',
              localField: 'accountId',
              foreignField: '_id',
              as: 'account',
            },
          },
          {
            $match: {
              $or: [
                { journal: { $eq: [] } },
                { account: { $eq: [] } },
              ],
            },
          },
          {
            $project: {
              _id: 1,
              journalId: 1,
              accountId: 1,
              entryDate: 1,
              accountCode: 1,
              accountName: 1,
              debitAmount: 1,
              creditAmount: 1,
              hasJournal: { $gt: [{ $size: '$journal' }, 0] },
              hasAccount: { $gt: [{ $size: '$account' }, 0] },
            },
          },
          { $limit: 250 },
        ]),
        AccountingInvoice.find({
          ...invoiceMatch,
          $or: [
            { journalEntryId: { $exists: false } },
            { journalEntryId: null },
          ],
        })
          .sort({ invoiceDate: -1, createdAt: -1 })
          .limit(250)
          .select('invoiceNumber invoiceDate customerName totalAmount status journalEntryId'),
        AccountingPayment.aggregate([
          { $match: paymentMatch },
          {
            $lookup: {
              from: 'accountinginvoices',
              localField: 'invoiceId',
              foreignField: '_id',
              as: 'invoice',
            },
          },
          {
            $match: {
              invoiceId: { $ne: null },
              invoice: { $eq: [] },
            },
          },
          {
            $project: {
              _id: 1,
              paymentNumber: 1,
              paymentDate: 1,
              amount: 1,
              mode: 1,
              invoiceId: 1,
            },
          },
          { $limit: 250 },
        ]),
        AccountLedgerEntry.aggregate([
          ...(entryDateRange ? [{ $match: { entryDate: entryDateRange } }] : []),
          { $sort: { accountId: 1, entryDate: -1, createdAt: -1 } },
          {
            $group: {
              _id: '$accountId',
              runningBalance: { $first: '$runningBalance' },
            },
          },
          { $match: { runningBalance: { $lt: 0 } } },
          {
            $lookup: {
              from: 'chartaccounts',
              localField: '_id',
              foreignField: '_id',
              as: 'account',
            },
          },
          { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 0,
              accountId: '$_id',
              accountCode: '$account.accountCode',
              accountName: '$account.accountName',
              accountType: '$account.accountType',
              runningBalance: 1,
            },
          },
          { $limit: 250 },
        ]),
        JournalEntry.find({
          ...(entryDateRange ? { entryDate: entryDateRange } : {}),
          referenceType: 'manual',
          status: { $ne: 'cancelled' },
        })
          .sort({ entryDate: -1, createdAt: -1 })
          .limit(250)
          .select('entryNumber entryDate description totalDebit totalCredit status createdAt'),
        JournalEntry.find({
          ...(entryDateRange ? { entryDate: entryDateRange } : {}),
          $expr: { $gt: [{ $subtract: ['$createdAt', '$entryDate'] }, 86_400_000] },
        })
          .sort({ entryDate: -1, createdAt: -1 })
          .limit(250)
          .select('entryNumber entryDate createdAt description referenceType referenceNo status'),
        AccountingPayment.find({
          ...paymentMatch,
          mode: 'cash',
          amount: { $gt: cashLimit },
        })
          .sort({ paymentDate: -1, createdAt: -1 })
          .limit(250)
          .select('paymentNumber paymentDate amount mode invoiceId customerName description'),
        AccountingInvoice.find({
          ...(invoiceDateRange ? { invoiceDate: invoiceDateRange } : {}),
          status: 'cancelled',
        })
          .sort({ cancelledAt: -1, updatedAt: -1 })
          .limit(250)
          .select('invoiceNumber invoiceDate customerName totalAmount status cancelledAt cancellationReason'),
        JournalEntry.find({
          ...(entryDateRange ? { entryDate: entryDateRange } : {}),
          status: 'cancelled',
        })
          .sort({ cancelledAt: -1, updatedAt: -1 })
          .limit(250)
          .select('entryNumber entryDate referenceType referenceNo status cancelledAt cancellationReason'),
        RecordVersion.find({
          module: 'accounting',
          entityType: 'accounting_invoice',
          action: { $in: ['UPDATE', 'ADJUST'] },
          ...(entryDateRange ? { changedAt: entryDateRange } : {}),
        })
          .sort({ changedAt: -1, createdAt: -1 })
          .limit(250)
          .select('recordId versionNumber action changedBy changedAt metadata'),
      ]);

    const totalDebit = round2(Number(journalTotalsAgg[0]?.totalDebit || 0));
    const totalCredit = round2(Number(journalTotalsAgg[0]?.totalCredit || 0));
    const debitCreditMismatch = round2(totalDebit - totalCredit);
    const cancelledRecordsCount = cancelledInvoices.length + cancelledJournalEntries.length;

    const findings = {
      debitCreditMismatch,
      unbalancedJournalEntries: unbalancedEntries.length,
      orphanJournalLines: orphanJournalLines.length,
      invoicesMissingJournal: invoicesMissingJournal.length,
      paymentsMissingInvoice: paymentsMissingInvoice.length,
      negativeRunningBalances: negativeBalances.length,
      manualJournalEntries: manualJournalEntries.length,
      editedInvoices: editedInvoiceVersions.length,
      backdatedEntries: backdatedEntries.length,
      cashTransactionsAboveLimit: cashTransactionsAboveLimit.length,
      cancelledRecords: cancelledRecordsCount,
    };

    const windowKey = `${toIso(entryDateRange?.$gte) || 'all'}:${toIso(entryDateRange?.$lte) || 'all'}`;

    await writeAuditFlags([
      ...(debitCreditMismatch !== 0
        ? [{
            module: 'accounting',
            flagType: 'debit_credit_mismatch',
            severity: 'critical' as const,
            message: `Debit/Credit mismatch detected: ${debitCreditMismatch}`,
            dedupeKey: `debit_credit_mismatch:${windowKey}`,
            detectedBy: req.userId,
            metadata: { totalDebit, totalCredit, mismatch: debitCreditMismatch },
          }]
        : []),
      ...(unbalancedEntries.length > 0
        ? [{
            module: 'accounting',
            flagType: 'unbalanced_journal_entries',
            severity: 'critical' as const,
            message: `${unbalancedEntries.length} unbalanced journal entries detected`,
            dedupeKey: `unbalanced_journal_entries:${windowKey}`,
            detectedBy: req.userId,
            metadata: { entries: unbalancedEntries.slice(0, 250) },
          }]
        : []),
      ...(orphanJournalLines.length > 0
        ? [{
            module: 'accounting',
            flagType: 'orphan_journal_lines',
            severity: 'critical' as const,
            message: `${orphanJournalLines.length} orphan journal lines detected`,
            dedupeKey: `orphan_journal_lines:${windowKey}`,
            detectedBy: req.userId,
            metadata: { rows: orphanJournalLines.slice(0, 250) },
          }]
        : []),
      ...(invoicesMissingJournal.length > 0
        ? [{
            module: 'accounting',
            flagType: 'invoices_missing_journal',
            severity: 'high' as const,
            message: `${invoicesMissingJournal.length} invoices missing journal links`,
            dedupeKey: `invoices_missing_journal:${windowKey}`,
            detectedBy: req.userId,
            metadata: { invoices: invoicesMissingJournal.slice(0, 250) },
          }]
        : []),
      ...(paymentsMissingInvoice.length > 0
        ? [{
            module: 'accounting',
            flagType: 'payments_missing_invoice',
            severity: 'high' as const,
            message: `${paymentsMissingInvoice.length} payments linked to missing invoices`,
            dedupeKey: `payments_missing_invoice:${windowKey}`,
            detectedBy: req.userId,
            metadata: { payments: paymentsMissingInvoice.slice(0, 250) },
          }]
        : []),
      ...(negativeBalances.length > 0
        ? [{
            module: 'accounting',
            flagType: 'negative_running_balances',
            severity: 'high' as const,
            message: `${negativeBalances.length} accounts have negative running balances`,
            dedupeKey: `negative_running_balances:${windowKey}`,
            detectedBy: req.userId,
            metadata: { accounts: negativeBalances.slice(0, 250) },
          }]
        : []),
      ...(manualJournalEntries.length > 0
        ? [{
            module: 'accounting',
            flagType: 'manual_journal_entries',
            severity: 'medium' as const,
            message: `${manualJournalEntries.length} manual journal entries found`,
            dedupeKey: `manual_journal_entries:${windowKey}`,
            detectedBy: req.userId,
            metadata: { entries: manualJournalEntries.slice(0, 250) },
          }]
        : []),
      ...(editedInvoiceVersions.length > 0
        ? [{
            module: 'accounting',
            flagType: 'edited_invoices',
            severity: 'high' as const,
            message: `${editedInvoiceVersions.length} edited invoices detected`,
            dedupeKey: `edited_invoices:${windowKey}`,
            detectedBy: req.userId,
            metadata: { versions: editedInvoiceVersions.slice(0, 250) },
          }]
        : []),
      ...(backdatedEntries.length > 0
        ? [{
            module: 'accounting',
            flagType: 'backdated_entries',
            severity: 'high' as const,
            message: `${backdatedEntries.length} backdated journal entries detected`,
            dedupeKey: `backdated_entries:${windowKey}`,
            detectedBy: req.userId,
            metadata: { entries: backdatedEntries.slice(0, 250) },
          }]
        : []),
      ...(cashTransactionsAboveLimit.length > 0
        ? [{
            module: 'accounting',
            flagType: 'cash_transactions_above_limit',
            severity: 'critical' as const,
            message: `${cashTransactionsAboveLimit.length} cash transactions exceeded limit ${cashLimit}`,
            dedupeKey: `cash_transactions_above_limit:${cashLimit}:${windowKey}`,
            detectedBy: req.userId,
            metadata: { cashLimit, transactions: cashTransactionsAboveLimit.slice(0, 250) },
          }]
        : []),
      ...(cancelledRecordsCount > 0
        ? [{
            module: 'accounting',
            flagType: 'cancelled_records',
            severity: 'medium' as const,
            message: `${cancelledRecordsCount} cancelled records detected`,
            dedupeKey: `cancelled_records:${windowKey}`,
            detectedBy: req.userId,
            metadata: {
              cancelledInvoices: cancelledInvoices.slice(0, 250),
              cancelledJournalEntries: cancelledJournalEntries.slice(0, 250),
            },
          }]
        : []),
    ]);

    await writeAuditLog({
      module: 'accounting',
      action: 'integrity_check_run',
      entityType: 'integrity_check',
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        startDate: toIso(entryDateRange?.$gte),
        endDate: toIso(entryDateRange?.$lte),
        cashLimit,
        findings,
      },
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalDebit,
          totalCredit,
          debitCreditEqual: debitCreditMismatch === 0,
          allInvoicesLinkedToEntries: invoicesMissingJournal.length === 0,
          noOrphanRecords: orphanJournalLines.length === 0 && paymentsMissingInvoice.length === 0,
          noNegativeBalances: negativeBalances.length === 0,
          noManualJournalEntries: manualJournalEntries.length === 0,
          noBackdatedEntries: backdatedEntries.length === 0,
          noCashTransactionsAboveLimit: cashTransactionsAboveLimit.length === 0,
        },
        findings,
        details: {
          unbalancedJournalEntries: unbalancedEntries,
          orphanJournalLines,
          invoicesMissingJournal,
          paymentsMissingInvoice,
          negativeRunningBalances: negativeBalances,
          manualJournalEntries,
          editedInvoices: editedInvoiceVersions,
          backdatedEntries,
          cashTransactionsAboveLimit,
          cancelledInvoices,
          cancelledJournalEntries,
          cashLimit,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to run integrity check') });
  }
});

router.get('/exports/:reportType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const reportType = String(req.params.reportType || '').toLowerCase();
    const startDate = req.query?.startDate ? new Date(String(req.query.startDate)) : undefined;
    const endDate = req.query?.endDate ? new Date(String(req.query.endDate)) : undefined;
    if (endDate) endDate.setHours(23, 59, 59, 999);

    let rows: Array<Record<string, any>> = [];

    if (reportType === 'invoices') {
      const filter: Record<string, any> = {};
      if (startDate || endDate) {
        filter.invoiceDate = {};
        if (startDate) filter.invoiceDate.$gte = startDate;
        if (endDate) filter.invoiceDate.$lte = endDate;
      }
      rows = (await AccountingInvoice.find(filter).sort({ invoiceDate: -1 })).map((row) => ({
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate.toISOString(),
        customerName: row.customerName,
        totalAmount: row.totalAmount,
        paidAmount: row.paidAmount,
        balanceAmount: row.balanceAmount,
        gstAmount: row.gstAmount,
        status: row.status,
      }));
    } else if (reportType === 'trial-balance') {
      const accounts = await ChartAccount.find({ isActive: true }).sort({ accountType: 1, accountCode: 1 });
      rows = await Promise.all(
        accounts.map(async (account) => {
          const filter: Record<string, any> = { accountId: account._id };
          if (startDate || endDate) {
            filter.entryDate = {};
            if (startDate) filter.entryDate.$gte = startDate;
            if (endDate) filter.entryDate.$lte = endDate;
          }
          const totals = await JournalLine.aggregate([
            { $match: filter },
            { $group: { _id: null, debit: { $sum: '$debitAmount' }, credit: { $sum: '$creditAmount' } } },
          ]);
          return {
            accountCode: account.accountCode,
            accountName: account.accountName,
            accountType: account.accountType,
            debit: round2(Number(totals[0]?.debit || 0)),
            credit: round2(Number(totals[0]?.credit || 0)),
          };
        })
      );
    } else if (reportType === 'ledger') {
      const accountId = String(req.query?.accountId || '').trim();
      if (!accountId) {
        return res.status(400).json({ success: false, error: 'accountId is required for ledger export' });
      }
      const filter: Record<string, any> = { accountId };
      if (startDate || endDate) {
        filter.entryDate = {};
        if (startDate) filter.entryDate.$gte = startDate;
        if (endDate) filter.entryDate.$lte = endDate;
      }
      rows = (await JournalLine.find(filter).sort({ entryDate: 1, createdAt: 1 })).map((row) => ({
        entryDate: row.entryDate.toISOString(),
        accountCode: row.accountCode,
        accountName: row.accountName,
        description: row.description,
        debitAmount: row.debitAmount,
        creditAmount: row.creditAmount,
      }));
    } else if (reportType === 'profit-loss') {
      rows = await JournalLine.aggregate([
        { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
        { $unwind: '$account' },
        { $match: startDate || endDate ? { entryDate: { ...(startDate ? { $gte: startDate } : {}), ...(endDate ? { $lte: endDate } : {}) } } : {} },
        {
          $group: {
            _id: { accountType: '$account.accountType', accountCode: '$account.accountCode', accountName: '$account.accountName' },
            debit: { $sum: '$debitAmount' },
            credit: { $sum: '$creditAmount' },
          },
        },
        { $sort: { '_id.accountType': 1, '_id.accountCode': 1 } },
      ]).then((agg) => agg.map((row) => ({
        accountType: row._id.accountType,
        accountCode: row._id.accountCode,
        accountName: row._id.accountName,
        debit: round2(Number(row.debit || 0)),
        credit: round2(Number(row.credit || 0)),
      })));
    } else if (reportType === 'vendors') {
      rows = await listVendorBalances();
    } else {
      return res.status(404).json({ success: false, error: 'Unsupported export type' });
    }

    const csv = toCsv(rows);
    await writeAuditLog({
      module: 'accounting',
      action: 'report_exported',
      entityType: 'financial_report',
      userId: req.userId,
      referenceNo: reportType,
      ipAddress: req.ip,
      metadata: {
        reportType,
        rowCount: rows.length,
        startDate: startDate ? startDate.toISOString() : undefined,
        endDate: endDate ? endDate.toISOString() : undefined,
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}-${Date.now()}.csv`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to export report') });
  }
});

export default router;
