import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { Supplier } from '../models/Supplier.js';
import { Product } from '../models/Product.js';
import { Inventory } from '../models/Inventory.js';
import { PurchaseBill } from '../models/PurchaseBill.js';
import { User } from '../models/User.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { cancelJournalEntry, createJournalEntry } from '../services/accountingEngine.js';
import { recordPurchaseReceiptBatch } from '../services/inventoryCosting.js';
import { buildPurchaseBillTaxPostingPlan } from '../services/accountingRules.js';
import { ensureAccountingVendorForSupplier } from '../services/procurementPayables.js';

const router = Router();

const toNumber = (value: any): number => Number(value || 0);
const roundTo2 = (value: number): number => Number(value.toFixed(2));

const buildReceivedBillLines = async (po: any) => {
  const productIds = Array.from(new Set<string>(po.items.map((item: any) => String(item.productId))));
  const products = await Product.find({ _id: { $in: productIds } });
  const productById = new Map(products.map((product: any) => [String(product._id), product]));

  const lines = po.items
    .map((item: any) => {
      const receivedQuantity = toNumber(item.receivedQuantity);
      if (receivedQuantity <= 0) return null;

      const product: any = productById.get(String(item.productId));
      const unitCost = toNumber(item.unitCost);
      const taxableValue = roundTo2(receivedQuantity * unitCost);
      const taxRate = toNumber(product?.gstRate || 0);
      const taxAmount = roundTo2((taxableValue * taxRate) / 100);
      return {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        receivedQuantity,
        unitCost,
        taxableValue,
        taxAmount,
        totalAmount: roundTo2(taxableValue + taxAmount),
        stockLedgerAccountId: product?.stockLedgerAccountId ? String(product.stockLedgerAccountId) : '',
      };
    })
    .filter(Boolean) as Array<any>;

  const subtotal = roundTo2(lines.reduce((sum, line) => sum + toNumber(line.taxableValue), 0));
  const taxAmount = roundTo2(lines.reduce((sum, line) => sum + toNumber(line.taxAmount), 0));
  const totalAmount = roundTo2(subtotal + taxAmount);
  return { lines, subtotal, taxAmount, totalAmount };
};

const parseOptionalDate = (value: any): Date | undefined => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date value');
  }
  return parsed;
};

const loadStoreGstin = async (userId?: string): Promise<string> => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return '';
  const user = await User.findById(normalizedUserId).select('gstin').lean();
  return String(user?.gstin || '').trim().toUpperCase();
};

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      supplierId = '',
      status = '',
      q = '',
      skip = 0,
      limit = 50,
    } = req.query;

    const filter: any = {};
    if (String(supplierId || '').trim()) filter.supplierId = String(supplierId).trim();
    if (String(status || '').trim()) filter.status = String(status).trim().toLowerCase();
    if (String(q || '').trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { purchaseNumber: regex },
        { notes: regex },
      ];
    }

    const parsedSkip = Math.max(0, Number(skip) || 0);
    const parsedLimit = Math.min(200, Math.max(1, Number(limit) || 50));

    const [rows, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(parsedSkip)
        .limit(parsedLimit)
        .populate('supplierId', 'supplierCode name phone email'),
      PurchaseOrder.countDocuments(filter),
    ]);

    const statusSummary = rows.reduce(
      (acc, row: any) => {
        const key = String(row.status || 'pending');
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    res.json({
      success: true,
      data: rows,
      statusSummary,
      pagination: { total, skip: parsedSkip, limit: parsedLimit },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch purchase orders' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      supplierId,
      expectedDate,
      notes = '',
      items = [],
    } = req.body || {};

    if (!supplierId) {
      return res.status(400).json({ success: false, error: 'supplierId is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item is required' });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const productIds = items.map((row: any) => String(row.productId || '').trim()).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } });
    const productById = new Map(products.map((product: any) => [String(product._id), product]));

    const normalizedItems: any[] = [];
    let subtotal = 0;
    let taxAmount = 0;

    for (const row of items) {
      const productId = String(row?.productId || '').trim();
      const quantity = toNumber(row?.quantity);
      if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ success: false, error: 'Each item must include productId and quantity > 0' });
      }

      const product: any = productById.get(productId);
      if (!product) return res.status(404).json({ success: false, error: `Product not found: ${productId}` });

      const unitCost = Math.max(0, toNumber(row?.unitCost || product.cost || 0));
      const lineTotal = roundTo2(quantity * unitCost);
      const lineTax = roundTo2((lineTotal * toNumber(product.gstRate || 0)) / 100);
      subtotal += lineTotal;
      taxAmount += lineTax;

      normalizedItems.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        quantity,
        receivedQuantity: 0,
        unitCost,
        lineTotal,
        batchNumber: String(row?.batchNumber || '').trim(),
        expiryDate: parseOptionalDate(row?.expiryDate),
        serialNumbers: Array.isArray(row?.serialNumbers) ? row.serialNumbers.map((x: any) => String(x).trim()).filter(Boolean) : [],
      });
    }

    const purchaseNumber =
      String(req.body?.purchaseNumber || '').trim().toUpperCase()
      || (await generateNumber('purchase_order', { prefix: 'PO-', datePart: true, padTo: 5 }));

    const exists = await PurchaseOrder.findOne({ purchaseNumber });
    if (exists) return res.status(409).json({ success: false, error: 'purchaseNumber already exists' });

    const po = await PurchaseOrder.create({
      purchaseNumber,
      supplierId: supplier._id,
      status: 'pending',
      orderDate: new Date(),
      expectedDate: parseOptionalDate(expectedDate),
      items: normalizedItems,
      subtotal: roundTo2(subtotal),
      taxAmount: roundTo2(taxAmount),
      totalAmount: roundTo2(subtotal + taxAmount),
      notes: String(notes || '').trim(),
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'inventory',
      action: 'purchase_order_created',
      entityType: 'purchase_order',
      entityId: po._id.toString(),
      referenceNo: po.purchaseNumber,
      userId: req.userId,
      metadata: {
        supplierId: supplier._id.toString(),
        supplierName: supplier.name,
        itemCount: po.items.length,
      },
      after: {
        status: po.status,
        totalAmount: po.totalAmount,
      },
    });

    const row = await PurchaseOrder.findById(po._id).populate('supplierId', 'supplierCode name');
    res.status(201).json({ success: true, message: 'Purchase order created successfully', data: row });
  } catch (error: any) {
    const status = String(error.message || '').includes('Invalid date value') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to create purchase order' });
  }
});

router.put('/:id/receive', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const po: any = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    if (po.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Cancelled purchase orders cannot be received' });
    }

    const rows = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!rows.length) {
      return res.status(400).json({ success: false, error: 'items array is required for receiving stock' });
    }

    const productIds: string[] = Array.from(new Set<string>(po.items.map((item: any) => String(item.productId))));
    const products = await Product.find({ _id: { $in: productIds } });
    const productById = new Map(products.map((product: any) => [String(product._id), product]));

    for (const row of rows) {
      const productId = String(row?.productId || '').trim();
      const receiveQty = toNumber(row?.receivedQuantity);
      if (!productId || !Number.isFinite(receiveQty) || receiveQty <= 0) {
        return res.status(400).json({ success: false, error: 'Each receive row must include productId and receivedQuantity > 0' });
      }

      const item = po.items.find((entry: any) => String(entry.productId) === productId);
      if (!item) return res.status(404).json({ success: false, error: `Item not found in purchase order: ${productId}` });

      const remaining = toNumber(item.quantity) - toNumber(item.receivedQuantity);
      if (receiveQty > remaining) {
        return res.status(400).json({ success: false, error: `Receive quantity exceeds pending quantity for ${item.sku}` });
      }

      item.receivedQuantity = toNumber(item.receivedQuantity) + receiveQty;
      if (row?.batchNumber !== undefined) item.batchNumber = String(row.batchNumber || '').trim();
      if (row?.expiryDate !== undefined) item.expiryDate = parseOptionalDate(row.expiryDate);

      const serialNumbers = Array.isArray(row?.serialNumbers) ? row.serialNumbers.map((x: any) => String(x).trim()).filter(Boolean) : [];
      if (serialNumbers.length) {
        const merged = new Set<string>([...(item.serialNumbers || []), ...serialNumbers]);
        item.serialNumbers = Array.from(merged);
      }

      const product: any = productById.get(productId);
      if (!product) return res.status(404).json({ success: false, error: `Product not found: ${productId}` });

      const currentStock = toNumber(product.stock);
      const nextStock = currentStock + receiveQty;
      product.stock = nextStock;
      await product.save();

      await recordPurchaseReceiptBatch({
        productId: product._id.toString(),
        quantity: receiveQty,
        unitCost: toNumber(item.unitCost || product.cost || 0),
        previousProductStock: currentStock,
        batchNumber: row?.batchNumber || item.batchNumber || po.purchaseNumber,
        expiryDate: row?.expiryDate !== undefined ? parseOptionalDate(row.expiryDate) : item.expiryDate,
        warehouseLocation: row?.warehouseLocation,
        sourceId: po._id.toString(),
        referenceNo: po.purchaseNumber,
        createdBy: req.userId,
      });

      const inventory = await Inventory.findOneAndUpdate(
        { productId: product._id },
        {
          productId: product._id,
          quantity: nextStock,
          ...(row?.warehouseLocation !== undefined && { warehouseLocation: row.warehouseLocation }),
          ...(row?.storeLocation !== undefined && { storeLocation: row.storeLocation }),
          ...(row?.rackLocation !== undefined && { rackLocation: row.rackLocation }),
          ...(row?.shelfLocation !== undefined && { shelfLocation: row.shelfLocation }),
          ...(row?.batchNumber !== undefined && { batchNumber: row.batchNumber }),
          ...(row?.expiryDate !== undefined && { expiryDate: parseOptionalDate(row.expiryDate) }),
          adjustmentReason: `Stock received against ${po.purchaseNumber}`,
          lastRestockDate: new Date(),
        },
        { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      await writeAuditLog({
        module: 'inventory',
        action: 'purchase_stock_received',
        entityType: 'purchase_order',
        entityId: po._id.toString(),
        referenceNo: po.purchaseNumber,
        userId: req.userId,
        metadata: {
          productId: product._id.toString(),
          sku: product.sku,
          receivedQuantity: receiveQty,
          warehouseLocation: inventory?.warehouseLocation || '',
          batchNumber: inventory?.batchNumber || '',
          expiryDate: inventory?.expiryDate || null,
        },
        before: { stock: currentStock },
        after: { stock: nextStock },
      });
    }

    const allReceived = po.items.every((item: any) => toNumber(item.receivedQuantity) >= toNumber(item.quantity));
    const anyReceived = po.items.some((item: any) => toNumber(item.receivedQuantity) > 0);
    po.status = allReceived ? 'completed' : anyReceived ? 'partially_received' : 'pending';
    po.receivedDate = anyReceived ? new Date() : undefined;
    await po.save();

    const updated = await PurchaseOrder.findById(po._id).populate('supplierId', 'supplierCode name');
    res.json({ success: true, message: 'Stock received successfully', data: updated });
  } catch (error: any) {
    const status = String(error.message || '').includes('Invalid date value') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to receive stock' });
  }
});

router.put('/:id/return', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const po: any = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });

    const rows = Array.isArray(req.body?.items) ? req.body.items : [];
    const reason = String(req.body?.reason || '').trim();
    if (!rows.length) {
      return res.status(400).json({ success: false, error: 'items array is required for purchase return' });
    }
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Return reason is required' });
    }

    for (const row of rows) {
      const productId = String(row?.productId || '').trim();
      const returnQty = toNumber(row?.quantity);
      if (!productId || !Number.isFinite(returnQty) || returnQty <= 0) {
        return res.status(400).json({ success: false, error: 'Each return row must include productId and quantity > 0' });
      }

      const item = po.items.find((entry: any) => String(entry.productId) === productId);
      if (!item) return res.status(404).json({ success: false, error: `Item not found in purchase order: ${productId}` });
      if (toNumber(item.receivedQuantity) < returnQty) {
        return res.status(400).json({ success: false, error: `Return quantity exceeds received quantity for ${item.sku}` });
      }

      const product: any = await Product.findById(productId);
      if (!product) return res.status(404).json({ success: false, error: `Product not found: ${productId}` });

      const currentStock = toNumber(product.stock);
      if (currentStock < returnQty) {
        return res.status(400).json({ success: false, error: `Insufficient stock to return for ${product.sku}` });
      }

      product.stock = currentStock - returnQty;
      await product.save();

      await Inventory.findOneAndUpdate(
        { productId: product._id },
        {
          productId: product._id,
          quantity: product.stock,
          adjustmentReason: `Purchase return against ${po.purchaseNumber}`,
          lastRestockDate: new Date(),
        },
        { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      item.receivedQuantity = Math.max(0, toNumber(item.receivedQuantity) - returnQty);

      await writeAuditLog({
        module: 'inventory',
        action: 'purchase_stock_returned',
        entityType: 'purchase_order',
        entityId: po._id.toString(),
        referenceNo: po.purchaseNumber,
        userId: req.userId,
        metadata: {
          productId: product._id.toString(),
          sku: product.sku,
          returnQuantity: returnQty,
          reason,
        },
        before: { stock: currentStock },
        after: { stock: product.stock },
      });
    }

    const allReceived = po.items.every((item: any) => toNumber(item.receivedQuantity) >= toNumber(item.quantity));
    const anyReceived = po.items.some((item: any) => toNumber(item.receivedQuantity) > 0);
    po.status = allReceived ? 'completed' : anyReceived ? 'partially_received' : 'returned';
    po.returnReason = reason;
    await po.save();

    const updated = await PurchaseOrder.findById(po._id).populate('supplierId', 'supplierCode name');
    res.json({ success: true, message: 'Purchase return processed successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to process purchase return' });
  }
});

router.post('/:id/bill', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const po: any = await PurchaseOrder.findById(req.params.id).populate('supplierId', 'supplierCode name gstin');
    if (!po) return res.status(404).json({ success: false, error: 'Purchase order not found' });

    const { lines, subtotal, taxAmount, totalAmount } = await buildReceivedBillLines(po);
    if (!lines.length || totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Receive stock before creating a purchase bill',
      });
    }

    const supplierName = typeof po.supplierId === 'string'
      ? ''
      : String(po.supplierId?.name || '');
    const supplierGstin = typeof po.supplierId === 'string'
      ? ''
      : String(po.supplierId?.gstin || '').trim().toUpperCase();
    const supplierDocument = typeof po.supplierId === 'string'
      ? await Supplier.findById(po.supplierId)
      : await Supplier.findById(po.supplierId?._id);
    if (!supplierDocument) {
      return res.status(404).json({ success: false, error: 'Supplier not found for purchase bill posting' });
    }
    const supplierAccounting = await ensureAccountingVendorForSupplier({
      supplier: supplierDocument,
      createdBy: req.userId,
      metadata: {
        source: 'purchase_bill',
        purchaseOrderId: po._id.toString(),
        purchaseNumber: po.purchaseNumber,
      },
    });
    const storeGstin = await loadStoreGstin(req.userId);

    const existing: any = await PurchaseBill.findOne({
      purchaseOrderId: po._id,
      status: { $in: ['posted', 'draft'] },
    }).sort({ createdAt: -1 });

    const before = existing?.toObject?.();
    if (existing?.journalEntryId) {
      await cancelJournalEntry({
        journalEntryId: String(existing.journalEntryId),
        reason: `Recreate purchase bill for ${po.purchaseNumber}`,
        createdBy: req.userId,
        metadata: {
          purchaseOrderId: po._id.toString(),
          purchaseNumber: po.purchaseNumber,
        },
      });
    }

    const taxPosting = buildPurchaseBillTaxPostingPlan({
      taxableAmount: subtotal,
      taxAmount,
      totalAmount,
      supplierGstin,
      storeGstin,
      payableDescription: `Supplier payable - ${supplierName || po.purchaseNumber}`,
    });
    const payableLine = {
      accountId: supplierAccounting.payableLedgerAccountId,
      debit: 0,
      credit: taxPosting.gst.totalAmount,
      description: `Supplier payable - ${supplierName || po.purchaseNumber}`,
    };

    const journalLines = [
      ...lines.map((line) => ({
        ...(line.stockLedgerAccountId ? { accountId: line.stockLedgerAccountId } : { accountKey: 'stock_in_hand' }),
        debit: toNumber(line.taxableValue),
        credit: 0,
        description: `Inventory received - ${line.sku}`,
      })),
      ...taxPosting.inputTaxLines,
      payableLine,
    ];

    const journal = await createJournalEntry({
      entryDate: new Date(),
      referenceType: 'purchase_bill',
      referenceId: po._id.toString(),
      referenceNo: po.purchaseNumber,
      description: `Purchase bill from goods receipt ${po.purchaseNumber}`,
      paymentMode: 'adjustment',
      createdBy: req.userId,
      metadata: {
        purchaseOrderId: po._id.toString(),
        purchaseNumber: po.purchaseNumber,
        supplierId: String(po.supplierId?._id || po.supplierId || ''),
        supplierName,
        supplierGstin,
        accountingVendorId: supplierAccounting.vendor._id.toString(),
        payableLedgerAccountId: supplierAccounting.payableLedgerAccountId,
        storeGstin,
        gstTreatment: taxPosting.gst.gstTreatment,
        cgstAmount: taxPosting.gst.cgstAmount,
        sgstAmount: taxPosting.gst.sgstAmount,
        igstAmount: taxPosting.gst.igstAmount,
        generatedFromReceipt: true,
      },
      lines: journalLines,
    });

    const billPayload = {
      purchaseOrderId: po._id,
      purchaseNumber: po.purchaseNumber,
      supplierId: po.supplierId?._id || po.supplierId,
      supplierName: supplierName || 'Supplier',
      accountingVendorId: supplierAccounting.vendor._id,
      payableLedgerAccountId: supplierAccounting.vendor.ledgerAccountId,
      billDate: new Date(),
      status: 'posted' as const,
      lines: lines.map(({ stockLedgerAccountId, ...line }) => line),
      subtotal,
      taxAmount,
      totalAmount,
      journalEntryId: journal.entry._id,
      revisionReason: existing ? 'Recreated from latest receipt quantities' : '',
      createdBy: req.userId,
    };

    const bill = existing
      ? await PurchaseBill.findByIdAndUpdate(existing._id, billPayload, { returnDocument: 'after', runValidators: true })
      : await PurchaseBill.create({
        billNumber: await generateNumber('purchase_bill', { prefix: 'PB-', datePart: true, padTo: 5 }),
        ...billPayload,
      });

    await writeAuditLog({
      module: 'inventory',
      action: existing ? 'purchase_bill_recreated' : 'purchase_bill_created',
      entityType: 'purchase_bill',
      entityId: bill?._id?.toString?.(),
      referenceNo: bill?.billNumber || po.purchaseNumber,
      userId: req.userId,
      metadata: {
        purchaseOrderId: po._id.toString(),
        purchaseNumber: po.purchaseNumber,
        journalEntryNumber: journal.entry.entryNumber,
        subtotal,
        taxAmount,
        totalAmount,
      },
      before,
      after: bill ? (bill.toObject?.() || bill) : undefined,
    });

    res.status(existing ? 200 : 201).json({
      success: true,
      message: existing ? 'Purchase bill recreated from latest receipt' : 'Purchase bill created from goods receipt',
      data: bill,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create purchase bill' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await PurchaseOrder.findById(req.params.id)
      .populate('supplierId', 'supplierCode name phone email');
    if (!row) return res.status(404).json({ success: false, error: 'Purchase order not found' });
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch purchase order' });
  }
});

export default router;
