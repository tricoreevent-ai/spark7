import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Sale } from '../models/Sale.js';
import { ReceiptVoucher } from '../models/ReceiptVoucher.js';
import { DayEndClosing } from '../models/DayEndClosing.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { Customer } from '../models/Customer.js';
import { generateNumber } from '../services/numbering.js';
import { postCustomerLedgerEntry } from '../services/customerLedger.js';
import { writeAuditLog } from '../services/audit.js';

const router = Router();

const dateKey = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

const dayRange = (input?: string) => {
  const d = input ? new Date(input) : new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

router.post('/receipts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerId, customerName, amount, mode = 'cash', notes, allocations = [], isAdvance } = req.body;
    const amountNum = Number(amount || 0);

    if (amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
    }

    const voucherNumber = await generateNumber('receipt_voucher', { prefix: 'RV-', datePart: true, padTo: 5 });
    const cleanAllocations = Array.isArray(allocations)
      ? allocations
          .map((row: any) => ({
            saleId: row.saleId ? String(row.saleId) : undefined,
            amount: Number(row.amount || 0),
          }))
          .filter((row: any) => row.saleId && row.amount > 0)
      : [];

    let allocatedTotal = 0;
    const finalizedAllocations: Array<{ saleId: string; saleNumber: string; amount: number }> = [];

    for (const alloc of cleanAllocations) {
      const sale = await Sale.findById(alloc.saleId);
      if (!sale) continue;

      const outstanding = Number(sale.outstandingAmount || 0);
      if (outstanding <= 0) continue;

      const usable = Math.min(Number(alloc.amount), outstanding, amountNum - allocatedTotal);
      if (usable <= 0) continue;

      sale.outstandingAmount = Number((outstanding - usable).toFixed(2));
      if (sale.outstandingAmount <= 0) {
        sale.outstandingAmount = 0;
        sale.paymentStatus = 'completed';
      } else {
        sale.paymentStatus = 'pending';
      }
      await sale.save();

      allocatedTotal += usable;
      finalizedAllocations.push({
        saleId: sale._id.toString(),
        saleNumber: sale.invoiceNumber || sale.saleNumber,
        amount: Number(usable.toFixed(2)),
      });
    }

    const unapplied = Number((amountNum - allocatedTotal).toFixed(2));
    const receipt = await ReceiptVoucher.create({
      voucherNumber,
      customerId: customerId || undefined,
      customerName,
      entryDate: new Date(),
      amount: amountNum,
      unappliedAmount: unapplied > 0 ? unapplied : 0,
      mode,
      isAdvance: Boolean(isAdvance) || unapplied > 0,
      allocations: finalizedAllocations,
      notes,
      createdBy: req.userId,
    });

    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (customer) {
        await postCustomerLedgerEntry({
          customerId: customer._id,
          entryType: unapplied > 0 ? 'advance' : 'payment',
          referenceType: 'receipt',
          referenceId: receipt._id.toString(),
          referenceNo: receipt.voucherNumber,
          narration: unapplied > 0 ? 'Advance receipt' : 'Receipt against invoices',
          debit: 0,
          credit: amountNum,
          createdBy: req.userId,
        });
      }
    }

    await writeAuditLog({
      module: 'settlement',
      action: 'receipt_create',
      entityType: 'receipt',
      entityId: receipt._id.toString(),
      referenceNo: receipt.voucherNumber,
      userId: req.userId,
      after: receipt.toObject(),
    });

    res.status(201).json({ success: true, data: receipt, message: 'Receipt voucher created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create receipt voucher' });
  }
});

router.get('/receipts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, mode, userId, limit = 100, skip = 0 } = req.query;
    const filter: any = {};

    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(String(startDate));
      if (endDate) {
        const e = new Date(String(endDate));
        e.setHours(23, 59, 59, 999);
        filter.entryDate.$lte = e;
      }
    }
    if (mode) filter.mode = mode;
    if (userId) filter.createdBy = String(userId);

    const rows = await ReceiptVoucher.find(filter)
      .sort({ entryDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await ReceiptVoucher.countDocuments(filter);

    res.json({ success: true, data: rows, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch receipts' });
  }
});

router.get('/collections/daily', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = dayRange(req.query.date ? String(req.query.date) : undefined);

    const [cashSalesAgg, receiptAgg, expenseAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, invoiceStatus: 'posted', paymentMethod: 'cash' } },
        { $group: { _id: '$userId', invoices: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
      ]),
      ReceiptVoucher.aggregate([
        { $match: { entryDate: { $gte: start, $lte: end }, mode: 'cash' } },
        { $group: { _id: '$createdBy', vouchers: { $sum: 1 }, total: { $sum: '$amount' } } },
      ]),
      DayBookEntry.aggregate([
        { $match: { entryDate: { $gte: start, $lte: end }, entryType: 'expense', paymentMethod: 'cash', status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const cashSalesTotal = cashSalesAgg.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const cashReceiptTotal = receiptAgg.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const cashExpenseTotal = Number(expenseAgg[0]?.total || 0);

    res.json({
      success: true,
      data: {
        date: start,
        cashSalesTotal,
        cashReceiptTotal,
        cashExpenseTotal,
        netCashCollection: Number((cashSalesTotal + cashReceiptTotal - cashExpenseTotal).toFixed(2)),
        salesByUser: cashSalesAgg,
        receiptsByUser: receiptAgg,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate daily collection summary' });
  }
});

router.get('/collections/user-wise', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(String(startDate)) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(String(endDate)) : new Date();
    end.setHours(23, 59, 59, 999);

    const [salesByUser, receiptByUser] = await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, invoiceStatus: 'posted' } },
        { $group: { _id: '$userId', invoices: { $sum: 1 }, salesTotal: { $sum: '$totalAmount' } } },
      ]),
      ReceiptVoucher.aggregate([
        { $match: { entryDate: { $gte: start, $lte: end } } },
        { $group: { _id: '$createdBy', receipts: { $sum: 1 }, receiptTotal: { $sum: '$amount' } } },
      ]),
    ]);

    const map = new Map<string, any>();
    for (const row of salesByUser) {
      map.set(String(row._id || 'unknown'), {
        userId: row._id,
        invoices: Number(row.invoices || 0),
        salesTotal: Number(row.salesTotal || 0),
        receipts: 0,
        receiptTotal: 0,
      });
    }
    for (const row of receiptByUser) {
      const key = String(row._id || 'unknown');
      const current = map.get(key) || { userId: row._id, invoices: 0, salesTotal: 0, receipts: 0, receiptTotal: 0 };
      current.receipts = Number(row.receipts || 0);
      current.receiptTotal = Number(row.receiptTotal || 0);
      map.set(key, current);
    }

    res.json({ success: true, data: Array.from(map.values()) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate user-wise collection report' });
  }
});

router.post('/day-end/close', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { businessDate, openingCash = 0, physicalClosingCash = 0, notes } = req.body;
    const day = businessDate ? new Date(businessDate) : new Date();
    const { start, end } = dayRange(day.toISOString());
    const key = dateKey(start);

    const [cashSalesAgg, cashReceiptsAgg, cashExpensesAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, invoiceStatus: 'posted', paymentMethod: 'cash' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      ReceiptVoucher.aggregate([
        { $match: { entryDate: { $gte: start, $lte: end }, mode: 'cash' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      DayBookEntry.aggregate([
        { $match: { entryDate: { $gte: start, $lte: end }, entryType: 'expense', paymentMethod: 'cash', status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const cashSales = Number(cashSalesAgg[0]?.total || 0);
    const cashReceipts = Number(cashReceiptsAgg[0]?.total || 0);
    const cashExpenses = Number(cashExpensesAgg[0]?.total || 0);
    const systemClosingCash = Number((Number(openingCash || 0) + cashSales + cashReceipts - cashExpenses).toFixed(2));
    const physical = Number(physicalClosingCash || 0);
    const variance = Number((physical - systemClosingCash).toFixed(2));
    const before = await DayEndClosing.findOne({ dateKey: key });

    const closing = await DayEndClosing.findOneAndUpdate(
      { dateKey: key },
      {
        dateKey: key,
        businessDate: start,
        openingCash: Number(openingCash || 0),
        cashSales,
        cashReceipts,
        cashExpenses,
        systemClosingCash,
        physicalClosingCash: physical,
        variance,
        notes,
        closedBy: req.userId,
      },
      { returnDocument: 'after', upsert: true, runValidators: true }
    );

    await writeAuditLog({
      module: 'day_end',
      action: 'day_end_close',
      entityType: 'day_end_closing',
      entityId: closing?._id?.toString(),
      referenceNo: key,
      userId: req.userId,
      metadata: {
        businessDate: start,
        variance,
      },
      before: before ? before.toObject() : undefined,
      after: closing ? closing.toObject() : undefined,
    });

    res.json({ success: true, data: closing, message: 'Day-end closing saved' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to save day-end closing' });
  }
});

router.get('/day-end/report', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const key = dateKey(date);
    const row = await DayEndClosing.findOne({ dateKey: key });
    if (!row) return res.status(404).json({ success: false, error: 'Day-end closing not found for selected date' });
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch day-end report' });
  }
});

export default router;
