import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { AccountingPayment } from '../models/AccountingPayment.js';
import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { FixedAsset } from '../models/FixedAsset.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { JournalLine } from '../models/JournalLine.js';
import { Vendor } from '../models/Vendor.js';
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

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));

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

router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await buildDashboardSummary();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load accounting dashboard' });
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
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch journal entries' });
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
    });
    res.status(201).json({ success: true, data: result, message: 'Journal entry created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to create journal entry' });
  }
});

router.post('/journal-entries/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await cancelJournalEntry({
      journalEntryId: String(req.params.id),
      reason: String(req.body?.reason || '').trim() || 'Cancelled by user',
      createdBy: req.userId,
    });
    res.json({ success: true, data: result, message: 'Journal entry cancelled with reversal' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to cancel journal entry' });
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
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch invoices' });
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
    });
    res.status(201).json({ success: true, data: result, message: 'Invoice created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to create invoice' });
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
    });
    res.status(201).json({ success: true, data: result, message: 'Payment recorded' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to record payment' });
  }
});

router.post('/invoices/:id/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await cancelInvoice({
      invoiceId: String(req.params.id),
      reason: String(req.body?.reason || '').trim() || 'Cancelled by user',
      createdBy: req.userId,
    });
    res.json({ success: true, data: result, message: 'Invoice cancelled' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to cancel invoice' });
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
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch payments' });
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
    });
    res.status(201).json({ success: true, data: result, message: 'Expense recorded' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to record expense' });
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
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch vendors' });
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
    });
    res.status(201).json({ success: true, data: result, message: 'Vendor created' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to create vendor' });
  }
});

router.get('/periods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const year = Number(req.query?.year || new Date().getFullYear());
    const periods = await Promise.all(Array.from({ length: 12 }, (_, index) => ensureFinancialPeriod(index + 1, year)));
    res.json({ success: true, data: periods });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch financial periods' });
  }
});

router.post('/periods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const result = await setFinancialPeriodLock(
      Number(req.body?.month || 0),
      Number(req.body?.year || 0),
      Boolean(req.body?.isLocked),
      req.userId
    );
    res.json({ success: true, data: result, message: `Period ${result.periodKey} updated` });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Failed to update financial period' });
  }
});

router.get('/fixed-assets', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await FixedAsset.find().sort({ purchaseDate: -1, createdAt: -1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch fixed assets' });
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
    res.status(400).json({ success: false, error: error.message || 'Failed to create fixed asset' });
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
    res.status(400).json({ success: false, error: error.message || 'Failed to post depreciation' });
  }
});

router.post('/reconciliation/import', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!requireWriter(req, res)) return;
    const rows = parseBankCsv(String(req.body?.csvText || ''));
    const result = await importBankStatement(rows);
    if (Boolean(req.body?.markMatched) && result.matched.length > 0) {
      const matchedIds = result.matched.map((row) => row.ledger.id);
      await AccountLedgerEntry.updateMany(
        { _id: { $in: matchedIds } },
        { $set: { isReconciled: true, reconciledAt: new Date() } }
      );
    }
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
    res.status(400).json({ success: false, error: error.message || 'Failed to import reconciliation file' });
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
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${reportType}-${Date.now()}.csv`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to export report' });
  }
});

export default router;
