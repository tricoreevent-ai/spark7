import mongoose from 'mongoose';
import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Sale } from '../models/Sale.js';
import { Return } from '../models/Return.js';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { Customer } from '../models/Customer.js';
import { Product } from '../models/Product.js';
import { AuditLog } from '../models/AuditLog.js';
import { Attendance } from '../models/Attendance.js';
import { User } from '../models/User.js';
import { deriveStoreScope, isAdminAuditViewerRole } from '../services/audit.js';
import { productRequiresStock } from '../services/salesPricing.js';
import { buildBatchStockRows, buildInventoryValuationRows } from '../services/inventoryCosting.js';
import {
  buildPosB2BvsB2CReport,
  buildPosBalanceSheetReport,
  buildPosCustomerWiseSalesReport,
  buildPosDailySalesSummary,
  buildPosGstHandoff,
  getStoreGrossProfit,
  buildPosHsnSalesReport,
  buildPosInventoryMovement,
  buildPosItemWiseSalesReport,
  buildPosMembershipSales,
  buildPosNoteRegister,
  buildPosPaymentReconciliation,
  buildPosProfitLossReport,
  buildPosSalesRegister,
  buildPosSalesSummaryByShift,
  buildPosTaxSummaryReport,
  buildPosTaxabilityReport,
  buildPosZReport,
} from '../services/posReporting.js';

const router = Router();
const toNumber = (value: any): number => Number(value || 0);
const roundTo2 = (value: number): number => Number(value.toFixed(2));
const validObjectIds = (values: string[]): string[] =>
  Array.from(new Set(values.filter((value) => mongoose.isValidObjectId(value))));

const parseDateParam = (raw: string | undefined, fallback: Date, endOfDay = false): Date => {
  const value = String(raw || '').trim();
  let date: Date;

  if (!value) {
    date = new Date(fallback);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    date = new Date(year, month - 1, day);
  } else {
    const parsed = new Date(value);
    date = Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const parseRange = (startDate?: string, endDate?: string) => {
  const today = new Date();
  const start = parseDateParam(startDate, today, false);
  const end = parseDateParam(endDate, today, true);
  if (start > end) {
    const normalizedStart = new Date(end);
    normalizedStart.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(start);
    normalizedEnd.setHours(23, 59, 59, 999);
    return { start: normalizedStart, end: normalizedEnd };
  }
  return { start, end };
};

const getStoreGstin = async (req: AuthenticatedRequest): Promise<string> => {
  if (!req.userId) return '';
  const user = await User.findById(req.userId).select('gstin');
  return String(user?.gstin || '').trim().toUpperCase();
};

const saleMatch = (start: Date, end: Date) => ({
  createdAt: { $gte: start, $lte: end },
  $or: [
    { invoiceStatus: 'posted' },
    { invoiceStatus: null },
    { invoiceStatus: { $exists: false } },
  ],
  saleStatus: { $in: ['completed', 'returned'] },
});

router.get('/daily-sales-summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const rows = await buildPosDailySalesSummary(start, end, storeGstin);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate daily sales summary' });
  }
});

router.get('/item-wise-sales', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosItemWiseSalesReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate item-wise sales report' });
  }
});

router.get('/customer-wise-sales', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosCustomerWiseSalesReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate customer-wise sales report' });
  }
});

router.get('/sales-returns', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);

    const rows = await Return.find({
      createdAt: { $gte: start, $lte: end },
      returnStatus: 'approved',
    }).sort({ createdAt: -1 });
    const summary = rows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.returnedAmount += Number(row.returnedAmount || 0);
        acc.returnedTax += Number(row.returnedGst || 0);
        acc.refundAmount += Number(row.refundAmount || 0);
        return acc;
      },
      { count: 0, returnedAmount: 0, returnedTax: 0, refundAmount: 0 }
    );

    res.json({ success: true, data: { summary, rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate returns report' });
  }
});

router.get('/gross-profit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const summary = await getStoreGrossProfit(start, end);

    res.json({
      success: true,
      data: {
        revenue: summary.netSales,
        costOfGoods: summary.cogs,
        grossProfit: summary.grossProfit,
        marginPercent: summary.marginPercent,
        invoices: summary.invoices,
        validated: summary.isValid,
        validationDifference: summary.validationDifference,
        source: 'store_gross_profit',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate gross profit report' });
  }
});

router.get('/outstanding-receivables', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, scope } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const posOnly = String(scope || '').trim().toLowerCase() === 'pos';

    const [sales, invoices, openingCustomers] = await Promise.all([
      Sale.find({
        createdAt: { $gte: start, $lte: end },
        invoiceType: 'credit',
        $or: [
          { invoiceStatus: 'posted' },
          { invoiceStatus: null },
          { invoiceStatus: { $exists: false } },
        ],
        outstandingAmount: { $gt: 0 },
      }).sort({ dueDate: 1, createdAt: 1 }),
      posOnly
        ? Promise.resolve([])
        : AccountingInvoice.find({
            invoiceDate: { $gte: start, $lte: end },
            status: { $in: ['posted', 'partial'] },
            balanceAmount: { $gt: 0 },
          }).sort({ dueDate: 1, invoiceDate: 1 }),
      posOnly
        ? Promise.resolve([])
        : Customer.find({
            openingBalance: { $gt: 0 },
          }).sort({ name: 1 }),
    ]);

    const saleRows = sales.map((row: any) => ({
      ...(row.toObject?.() || row),
      source: 'sale',
      sourceId: row._id.toString(),
      outstandingAmount: roundTo2(Number(row.outstandingAmount || 0)),
    }));
    const invoiceRows = invoices.map((row: any) => ({
      _id: `accounting-invoice-${row._id.toString()}`,
      source: 'accounting_invoice',
      sourceId: row._id.toString(),
      invoiceNumber: row.invoiceNumber,
      saleNumber: row.invoiceNumber,
      customerId: row.customerId,
      customerName: row.customerName,
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate || row.invoiceDate,
      totalAmount: roundTo2(Number(row.totalAmount || 0)),
      paidAmount: roundTo2(Number(row.paidAmount || 0)),
      outstandingAmount: roundTo2(Number(row.balanceAmount || 0)),
      paymentStatus: row.status,
      invoiceStatus: row.status,
    }));
    const openingRows = openingCustomers.map((row: any) => ({
      _id: `customer-opening-${row._id.toString()}`,
      source: 'customer_opening_balance',
      sourceId: row._id.toString(),
      invoiceNumber: 'Opening Balance',
      saleNumber: 'Opening Balance',
      customerId: row._id.toString(),
      customerName: row.name,
      dueDate: start,
      totalAmount: roundTo2(Number(row.openingBalance || 0)),
      paidAmount: 0,
      outstandingAmount: roundTo2(Number(row.openingBalance || 0)),
      paymentStatus: 'opening',
      invoiceStatus: 'opening',
    }));
    const rows = [...saleRows, ...invoiceRows, ...openingRows]
      .filter((row: any) => Number(row.outstandingAmount || 0) > 0)
      .sort((left: any, right: any) => {
        const leftDate = left.dueDate ? new Date(left.dueDate).getTime() : 0;
        const rightDate = right.dueDate ? new Date(right.dueDate).getTime() : 0;
        return leftDate - rightDate;
      });

    const totalOutstanding = roundTo2(rows.reduce((sum, row: any) => sum + Number(row.outstandingAmount || 0), 0));
    res.json({ success: true, data: { totalOutstanding, rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate outstanding receivables report' });
  }
});

router.get('/attendance-summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);

    const rows = await Attendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$employeeId',
          totalMarked: { $sum: 1 },
          presentDays: {
            $sum: {
              $cond: [{ $eq: ['$status', 'present'] }, 1, 0],
            },
          },
          halfDays: {
            $sum: {
              $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0],
            },
          },
          leaveDays: {
            $sum: {
              $cond: [{ $eq: ['$status', 'leave'] }, 1, 0],
            },
          },
          absentDays: {
            $sum: {
              $cond: [{ $eq: ['$status', 'absent'] }, 1, 0],
            },
          },
          overtimeHours: { $sum: '$overtimeHours' },
        },
      },
      {
        $lookup: {
          from: 'employees',
          localField: '_id',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          employeeId: '$_id',
          employeeCode: '$employee.employeeCode',
          employeeName: '$employee.name',
          designation: '$employee.designation',
          totalMarked: 1,
          presentDays: 1,
          halfDays: 1,
          leaveDays: 1,
          absentDays: 1,
          overtimeHours: { $round: ['$overtimeHours', 2] },
        },
      },
      { $sort: { employeeName: 1 } },
    ]);

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate attendance report' });
  }
});

router.get('/cash-vs-credit', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);

    const rows = await Sale.aggregate([
      { $match: saleMatch(start, end) },
      {
        $group: {
          _id: '$invoiceType',
          count: { $sum: 1 },
          amount: { $sum: '$totalAmount' },
        },
      },
    ]);

    const mapped = rows.reduce(
      (acc, row) => {
        if (row._id === 'cash') acc.cash = row;
        if (row._id === 'credit') acc.credit = row;
        return acc;
      },
      { cash: { count: 0, amount: 0 }, credit: { count: 0, amount: 0 } }
    );

    res.json({ success: true, data: mapped });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate cash vs credit report' });
  }
});

router.get('/user-wise-sales', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);

    const rows = await Sale.aggregate([
      { $match: saleMatch(start, end) },
      {
        $group: {
          _id: '$userId',
          invoices: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$totalAmount', 0] } },
          card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$totalAmount', 0] } },
          upi: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, '$totalAmount', 0] } },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate user-wise sales report' });
  }
});

router.get('/tax-summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosTaxSummaryReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate tax summary report' });
  }
});

router.get('/profit-loss-store', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const report = await buildPosProfitLossReport(start, end);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate POS profit and loss report' });
  }
});

router.get('/balance-sheet-store', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { endDate } = req.query;
    const { end } = parseRange(undefined, endDate as string);
    const report = await buildPosBalanceSheetReport(end);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate POS balance sheet report' });
  }
});

router.get('/sales-summary-shift', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosSalesSummaryByShift(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate shift sales summary' });
  }
});

router.get('/hsn-wise-sales', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosHsnSalesReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate HSN-wise sales report' });
  }
});

router.get('/taxability-breakup', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosTaxabilityReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate taxability breakup report' });
  }
});

router.get('/b2b-vs-b2c', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosB2BvsB2CReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate B2B vs B2C report' });
  }
});

router.get('/gst-note-register', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosNoteRegister(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate GST note register' });
  }
});

router.get('/sales-register-detailed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosSalesRegister(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate detailed sales register' });
  }
});

router.get('/payment-reconciliation', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate, scope } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const posOnly = String(scope || '').trim().toLowerCase() === 'pos';
    const report = await buildPosPaymentReconciliation(start, end, storeGstin, {
      includeAccountingCore: !posOnly,
    });
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate payment reconciliation report' });
  }
});

router.get('/z-report', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosZReport(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate Z report' });
  }
});

router.get('/pos-inventory-movement', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosInventoryMovement(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate POS inventory movement report' });
  }
});

router.get('/membership-sales', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const report = await buildPosMembershipSales(start, end);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate membership sales report' });
  }
});

router.get('/gst-handoff', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const storeGstin = await getStoreGstin(req);
    const report = await buildPosGstHandoff(start, end, storeGstin);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate GST handoff dataset report' });
  }
});

router.get('/inventory-stock-summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || 'false') === 'true';
    const category = String(req.query.category || '').trim();
    const filter: any = {};
    if (!includeInactive) filter.isActive = true;
    if (category) filter.category = category;

    const rows = (await Product.find(filter).select('name sku category subcategory stock minStock cost price unit updatedAt itemType openingStockValue'))
      .filter((row: any) => productRequiresStock(row));
    const totalProducts = rows.length;
    const inStock = rows.filter((row: any) => toNumber(row.stock) > 0).length;
    const lowStock = rows.filter((row: any) => toNumber(row.stock) > 0 && toNumber(row.stock) <= toNumber(row.minStock)).length;
    const outOfStock = rows.filter((row: any) => toNumber(row.stock) <= 0).length;
    const totalUnits = rows.reduce((sum, row: any) => sum + toNumber(row.stock), 0);
    const valuation = await buildInventoryValuationRows();
    const valuationCost = toNumber(valuation.summary?.value);
    const valuationRetail = rows.reduce((sum, row: any) => sum + (toNumber(row.stock) * toNumber(row.price)), 0);
    const openingStockValue = rows.reduce((sum, row: any) => sum + toNumber(row.openingStockValue), 0);

    res.json({
      success: true,
      data: {
        totalProducts,
        inStock,
        lowStock,
        outOfStock,
        totalUnits: roundTo2(totalUnits),
        valuationCost: roundTo2(valuationCost),
        valuationRetail: roundTo2(valuationRetail),
        openingStockValue: roundTo2(openingStockValue),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate inventory stock summary' });
  }
});

router.get('/inventory-low-stock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeInactive = String(req.query.includeInactive || 'false') === 'true';
    const category = String(req.query.category || '').trim();
    const q = String(req.query.q || '').trim();
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 250));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const filter: any = {};
    if (!includeInactive) filter.isActive = true;
    if (category) filter.category = category;
    if (q) {
      const regex = new RegExp(q, 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }];
    }

    const rows = (await Product.find(filter).select('name sku barcode category subcategory stock minStock unit cost price updatedAt itemType'))
      .filter((row: any) => productRequiresStock(row));
    const low = rows
      .filter((row: any) => toNumber(row.stock) <= toNumber(row.minStock))
      .sort((a: any, b: any) => toNumber(a.stock) - toNumber(b.stock));

    const paged = low.slice(skip, skip + limit);
    res.json({
      success: true,
      data: paged,
      pagination: { total: low.length, skip, limit },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate low stock report' });
  }
});

router.get('/inventory-valuation', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const category = String(req.query.category || '').trim();
    const valuation = await buildInventoryValuationRows({
      locationId: String(req.query.locationId || '').trim() || undefined,
    });
    const valuationRows = category
      ? valuation.rows.filter((row: any) => String(row.category || '').toLowerCase() === category.toLowerCase())
      : valuation.rows;

    const mapped = valuationRows.map((row: any) => {
      const stock = toNumber(row.quantity ?? row.stock);
      const unitCost = toNumber(row.unitCost);
      const productName = row.productName || row.name || '';
      const unitPrice = toNumber(row.unitPrice || row.price || 0);
      const costValue = toNumber(row.stockValue ?? row.costValue);
      const openingStockValue = toNumber(row.openingStockValue);
      const retailValue = unitPrice > 0 ? stock * unitPrice : 0;
      return {
        productId: row.productId || row._id,
        name: productName,
        sku: row.sku,
        category: row.category,
        subcategory: row.subcategory || '',
        locationCode: row.locationCode || '',
        locationName: row.locationName || '',
        batchNumber: row.batchNumber || '',
        expiryDate: row.expiryDate || null,
        valuationMethod: valuation.method,
        stock,
        unit: row.unit || 'piece',
        unitCost: roundTo2(unitCost),
        unitPrice: roundTo2(unitPrice),
        openingStockValue: roundTo2(openingStockValue),
        costValue: roundTo2(costValue),
        retailValue: roundTo2(retailValue),
        potentialMarginValue: roundTo2(retailValue - costValue),
      };
    });

    const summary = mapped.reduce(
      (acc, row) => {
        acc.totalCostValue += toNumber(row.costValue);
        acc.totalOpeningStockValue += toNumber(row.openingStockValue);
        acc.totalRetailValue += toNumber(row.retailValue);
        acc.totalMarginValue += toNumber(row.potentialMarginValue);
        return acc;
      },
      { totalCostValue: 0, totalOpeningStockValue: 0, totalRetailValue: 0, totalMarginValue: 0 }
    );

    res.json({
      success: true,
      data: {
        rows: mapped,
        method: valuation.method,
        summary: {
          totalCostValue: roundTo2(summary.totalCostValue),
          totalOpeningStockValue: roundTo2(summary.totalOpeningStockValue),
          totalRetailValue: roundTo2(summary.totalRetailValue),
          totalMarginValue: roundTo2(summary.totalMarginValue),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate inventory valuation report' });
  }
});

router.get('/inventory-batch-stock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await buildBatchStockRows({
      productId: String(req.query.productId || '').trim() || undefined,
      locationId: String(req.query.locationId || '').trim() || undefined,
      includeExpired: String(req.query.includeExpired || 'false') === 'true',
    });
    const summary = rows.reduce(
      (acc: any, row: any) => {
        acc.quantity += toNumber(row.quantity);
        acc.availableQuantity += toNumber(row.availableQuantity);
        acc.reservedQuantity += toNumber(row.reservedQuantity);
        acc.stockValue += toNumber(row.stockValue);
        return acc;
      },
      { quantity: 0, availableQuantity: 0, reservedQuantity: 0, stockValue: 0 }
    );

    res.json({
      success: true,
      data: rows,
      summary: {
        quantity: roundTo2(summary.quantity),
        availableQuantity: roundTo2(summary.availableQuantity),
        reservedQuantity: roundTo2(summary.reservedQuantity),
        stockValue: roundTo2(summary.stockValue),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate batch stock report' });
  }
});

router.get('/inventory-movement', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = parseRange(startDate as string, endDate as string);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 300));
    const skip = Math.max(0, Number(req.query.skip) || 0);
    const productId = String(req.query.productId || '').trim();

    const filter: any = {
      module: 'inventory',
      createdAt: { $gte: start, $lte: end },
      action: {
        $in: [
          'stock_adjustment',
          'purchase_stock_received',
          'purchase_stock_returned',
          'stock_transfer',
        ],
      },
    };
    if (productId) {
      filter.$or = [{ entityId: productId }, { 'metadata.productId': productId }];
    }

    const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await AuditLog.countDocuments(filter);

    const summary = rows.reduce(
      (acc, row: any) => {
        const action = String(row.action || '');
        const nestedAction = String(row.metadata?.action || '').toLowerCase();
        if (action === 'purchase_stock_received') {
          acc.stockIn += toNumber(row.metadata?.receivedQuantity);
        } else if (action === 'purchase_stock_returned') {
          acc.stockOut += toNumber(row.metadata?.returnQuantity);
        } else if (action === 'stock_transfer') {
          acc.transferred += toNumber(row.metadata?.quantity);
        } else if (action === 'stock_adjustment') {
          const delta = toNumber(row.metadata?.quantityDelta);
          if (nestedAction === 'set') {
            acc.adjustments += Math.abs(delta);
          } else if (nestedAction === 'add' || nestedAction === 'stock_in') {
            acc.stockIn += Math.abs(delta || toNumber(row.metadata?.quantityInput));
          } else if (nestedAction === 'subtract' || nestedAction === 'stock_out') {
            acc.stockOut += Math.abs(delta || toNumber(row.metadata?.quantityInput));
          } else {
            acc.adjustments += Math.abs(delta);
          }
        }
        return acc;
      },
      { stockIn: 0, stockOut: 0, transferred: 0, adjustments: 0 }
    );

    res.json({
      success: true,
      data: rows,
      summary: {
        stockIn: roundTo2(summary.stockIn),
        stockOut: roundTo2(summary.stockOut),
        transferred: roundTo2(summary.transferred),
        adjustments: roundTo2(summary.adjustments),
      },
      pagination: { total, skip, limit },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate inventory movement report' });
  }
});

router.get('/inventory-dead-stock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.max(1, Number(req.query.days) || 90);
    const includeInactive = String(req.query.includeInactive || 'false') === 'true';
    const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const productFilter: any = { stock: { $gt: 0 } };
    if (!includeInactive) productFilter.isActive = true;
    const products = (await Product.find(productFilter).select('name sku category subcategory stock minStock unit updatedAt itemType'))
      .filter((row: any) => productRequiresStock(row));

    const recentSales = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: cutoff },
          saleStatus: { $in: ['completed', 'returned'] },
        },
      },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', qty: { $sum: '$items.quantity' } } },
    ]);
    const recentSoldIds = new Set(recentSales.map((row: any) => String(row._id)));

    const lastSaleRows = await Sale.aggregate([
      { $match: { saleStatus: { $in: ['completed', 'returned'] } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', lastSoldAt: { $max: '$createdAt' } } },
    ]);
    const lastSaleMap = new Map(lastSaleRows.map((row: any) => [String(row._id), row.lastSoldAt]));

    const deadStock = products
      .filter((product: any) => !recentSoldIds.has(String(product._id)))
      .map((product: any) => {
        const lastSoldAt = lastSaleMap.get(String(product._id));
        const daysSinceLastSale = lastSoldAt
          ? Math.floor((Date.now() - new Date(lastSoldAt).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          category: product.category,
          subcategory: product.subcategory || '',
          stock: toNumber(product.stock),
          unit: product.unit || 'piece',
          lastSoldAt: lastSoldAt || null,
          daysSinceLastSale,
        };
      })
      .sort((a, b) => toNumber(b.stock) - toNumber(a.stock));

    res.json({
      success: true,
      data: deadStock,
      summary: {
        daysWindow: days,
        deadStockCount: deadStock.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate dead stock report' });
  }
});

router.get('/inventory-fast-moving', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.max(1, Number(req.query.days) || 30);
    const resultLimit = Math.min(500, Math.max(1, Number(req.query.limit) || 20));
    const since = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const rows = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          saleStatus: { $in: ['completed', 'returned'] },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          sku: { $first: '$items.sku' },
          quantitySold: { $sum: '$items.quantity' },
          salesAmount: { $sum: '$items.lineTotal' },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { quantitySold: -1, salesAmount: -1 } },
      { $limit: resultLimit },
    ]);

    res.json({
      success: true,
      data: rows.map((row: any) => ({
        productId: row._id,
        productName: row.productName || '',
        sku: row.sku || '',
        quantitySold: roundTo2(toNumber(row.quantitySold)),
        salesAmount: roundTo2(toNumber(row.salesAmount)),
        salesCount: toNumber(row.salesCount),
      })),
      summary: {
        daysWindow: days,
        count: rows.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate fast moving report' });
  }
});

router.get('/audit-logs', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUser = req.userId ? await User.findById(req.userId).select('role businessName gstin') : null;
    if (!currentUser) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    if (!isAdminAuditViewerRole(currentUser.role)) {
      return res.status(403).json({ success: false, error: 'Only admin users can view audit logs' });
    }

    const { module, action, entityType, userId, limit = 200, skip = 0 } = req.query;
    const { storeKey } = deriveStoreScope(currentUser, currentUser._id.toString());
    const filter: any = {};
    filter.storeKey = storeKey;
    if (module) filter.module = String(module);
    if (action) filter.action = String(action);
    if (entityType) filter.entityType = String(entityType);
    if (userId) filter.userId = String(userId);

    const parsedLimit = Math.min(500, Math.max(1, Number(limit) || 200));
    const parsedSkip = Math.max(0, Number(skip) || 0);

    const rows = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit);

    const total = await AuditLog.countDocuments(filter);
    res.json({ success: true, data: rows, pagination: { total, skip: parsedSkip, limit: parsedLimit } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch audit logs' });
  }
});

export default router;
