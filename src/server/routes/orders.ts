import { Router, Response } from 'express';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { DeliveryChallan } from '../models/DeliveryChallan.js';
import { Sale } from '../models/Sale.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import {
  consumeStockFefo,
  dispatchReservedStock,
  postCogsJournal,
  reserveStockFefo,
} from '../services/inventoryCosting.js';

const router = Router();

const roundTo2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const toNumber = (value: any): number => Number(value || 0);

// Generate order number
const generateOrderNumber = (): string => {
  const date = new Date();
  const timestamp = date.getTime();
  return `ORD-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${timestamp.toString().slice(-6)}`;
};

const salesPaymentMethodForOrder = (method: string) => (method === 'check' ? 'cheque' : method);

const summarizeOrderStatus = (order: any) => {
  const totalQty = order.items.reduce((sum: number, item: any) => sum + toNumber(item.quantity), 0);
  const totalReserved = order.items.reduce((sum: number, item: any) => sum + toNumber(item.reservedQuantity), 0);
  const totalDelivered = order.items.reduce((sum: number, item: any) => sum + toNumber(item.deliveredQuantity), 0);
  const totalInvoiced = order.items.reduce((sum: number, item: any) => sum + toNumber(item.invoicedQuantity), 0);
  const totalBackOrder = order.items.reduce((sum: number, item: any) => sum + toNumber(item.backOrderQuantity), 0);

  if (totalInvoiced >= totalQty && totalQty > 0) {
    order.orderStatus = 'invoiced';
  } else if (totalDelivered >= totalQty && totalQty > 0) {
    order.orderStatus = 'dispatched';
  } else if (totalDelivered > 0) {
    order.orderStatus = 'partially_dispatched';
  } else if (totalBackOrder > 0 && totalReserved > 0) {
    order.orderStatus = 'partially_reserved';
  } else if (totalBackOrder > 0) {
    order.orderStatus = 'back_order';
  } else if (totalReserved >= totalQty && totalQty > 0) {
    order.orderStatus = 'reserved';
  } else if (totalReserved > 0) {
    order.orderStatus = 'partially_reserved';
  } else {
    order.orderStatus = 'pending';
  }

  order.reservationStatus = totalReserved >= totalQty && totalQty > 0
    ? 'reserved'
    : totalBackOrder > 0
      ? 'back_order'
      : totalReserved > 0
        ? 'partial'
        : 'not_reserved';
  order.deliveryStatus = totalDelivered >= totalQty && totalQty > 0
    ? 'dispatched'
    : totalDelivered > 0
      ? 'partial'
      : 'not_dispatched';
};

const pendingReservationQuantity = (item: any): number =>
  roundTo2(Math.max(0, toNumber(item.quantity) - toNumber(item.reservedQuantity)));

const pendingDispatchAllocations = (item: any) => {
  const alreadyDeliveredByBatch = new Map<string, number>();
  for (const allocation of item.deliveryAllocations || []) {
    const key = String(allocation.batchId || allocation.batchNumber || '');
    alreadyDeliveredByBatch.set(key, roundTo2(toNumber(alreadyDeliveredByBatch.get(key)) + toNumber(allocation.quantity)));
  }

  const allocations: any[] = [];
  for (const allocation of item.reservationAllocations || []) {
    const key = String(allocation.batchId || allocation.batchNumber || '');
    const delivered = toNumber(alreadyDeliveredByBatch.get(key));
    const available = roundTo2(toNumber(allocation.quantity) - delivered);
    if (available <= 0) continue;
    allocations.push({
      batchId: allocation.batchId,
      batchNumber: allocation.batchNumber,
      locationId: allocation.locationId,
      locationCode: allocation.locationCode,
      quantity: available,
      unitCost: toNumber(allocation.unitCost),
    });
  }
  return allocations;
};

const pendingInvoiceAllocations = (item: any) => {
  const pendingQty = roundTo2(Math.max(0, toNumber(item.deliveredQuantity) - toNumber(item.invoicedQuantity)));
  if (pendingQty <= 0) return [];

  const allocations: any[] = [];
  let remaining = pendingQty;
  for (const allocation of item.deliveryAllocations || []) {
    if (remaining <= 0) break;
    const qty = Math.min(remaining, toNumber(allocation.quantity));
    if (qty <= 0) continue;
    allocations.push({
      batchId: allocation.batchId,
      batchNumber: allocation.batchNumber,
      locationId: allocation.locationId,
      locationCode: allocation.locationCode,
      quantity: qty,
      unitCost: toNumber(allocation.unitCost),
    });
    remaining = roundTo2(remaining - qty);
  }
  return allocations;
};

// Create order. Stock is not deducted here; use /:id/reserve to reserve available batches.
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items, paymentMethod, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required and must not be empty',
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'Payment method is required',
      });
    }

    let totalAmount = 0;
    let totalGstAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product with ID ${item.productId} not found`,
        });
      }

      const quantity = toNumber(item.quantity);
      if (quantity <= 0) {
        return res.status(400).json({ success: false, error: `Invalid quantity for ${product.name}` });
      }

      const unitPrice = toNumber(item.unitPrice || product.price);
      const itemPrice = roundTo2(unitPrice * quantity);
      const gstRate = toNumber((item.gstRate ?? product.gstRate) || 0);
      const gstAmount = roundTo2((itemPrice * gstRate) / 100);

      orderItems.push({
        productId: item.productId,
        productName: product.name,
        sku: product.sku,
        quantity,
        price: itemPrice,
        gstRate,
        gstAmount,
        reservedQuantity: 0,
        deliveredQuantity: 0,
        invoicedQuantity: 0,
        backOrderQuantity: 0,
        reservationAllocations: [],
        deliveryAllocations: [],
      });

      totalAmount += itemPrice;
      totalGstAmount += gstAmount;
    }

    const order = new Order({
      orderNumber: generateOrderNumber(),
      userId: req.userId,
      items: orderItems,
      totalAmount: roundTo2(totalAmount + totalGstAmount),
      gstAmount: roundTo2(totalGstAmount),
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      reservationStatus: 'not_reserved',
      deliveryStatus: 'not_dispatched',
      notes,
    });

    await order.save();

    await writeAuditLog({
      module: 'orders',
      action: 'sales_order_created',
      entityType: 'order',
      entityId: order._id.toString(),
      referenceNo: order.orderNumber,
      userId: req.userId,
      after: order.toObject(),
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully. Use reserve stock to allocate inventory.',
      data: order,
    });
  } catch (error: any) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create order',
    });
  }
});

router.get('/backorders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { skip = 0, limit = 50 } = req.query;
    const filter: any = {
      userId: req.userId,
      'items.backOrderQuantity': { $gt: 0 },
      orderStatus: { $ne: 'cancelled' },
    };

    const [rows, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(Number(skip)).limit(Number(limit)),
      Order.countDocuments(filter),
    ]);

    res.json({ success: true, data: rows, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch back-orders' });
  }
});

router.post('/:id/reserve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order: any = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.userId.toString() !== req.userId) return res.status(403).json({ success: false, error: 'Unauthorized to reserve this order' });
    if (order.orderStatus === 'cancelled') return res.status(400).json({ success: false, error: 'Cancelled orders cannot be reserved' });

    let totalReservedNow = 0;
    let totalBackOrder = 0;

    for (const item of order.items as any[]) {
      const pendingQty = pendingReservationQuantity(item);
      if (pendingQty <= 0) {
        totalBackOrder += toNumber(item.backOrderQuantity);
        continue;
      }

      const result = await reserveStockFefo({
        productId: String(item.productId),
        quantity: pendingQty,
        locationId: String(req.body?.locationId || '').trim() || undefined,
        referenceType: 'order',
        referenceId: order._id.toString(),
        referenceNo: order.orderNumber,
        createdBy: req.userId,
      });

      item.reservationAllocations = [
        ...(item.reservationAllocations || []),
        ...(result.allocations || []),
      ];
      item.reservedQuantity = roundTo2(toNumber(item.reservedQuantity) + toNumber(result.reservedQuantity));
      item.backOrderQuantity = roundTo2(Math.max(0, toNumber(item.quantity) - toNumber(item.reservedQuantity)));
      totalReservedNow = roundTo2(totalReservedNow + toNumber(result.reservedQuantity));
      totalBackOrder = roundTo2(totalBackOrder + toNumber(item.backOrderQuantity));
    }

    summarizeOrderStatus(order);
    await order.save();

    await writeAuditLog({
      module: 'orders',
      action: 'sales_order_stock_reserved',
      entityType: 'order',
      entityId: order._id.toString(),
      referenceNo: order.orderNumber,
      userId: req.userId,
      metadata: { reservedQuantity: totalReservedNow, backOrderQuantity: totalBackOrder },
      after: order.toObject(),
    });

    res.json({
      success: true,
      message: totalBackOrder > 0 ? 'Stock partially reserved; back-order created for pending quantity' : 'Stock reserved successfully',
      data: order,
    });
  } catch (error: any) {
    const status = String(error.message || '').includes('Insufficient') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to reserve stock' });
  }
});

router.post('/:id/delivery-challan', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order: any = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.userId.toString() !== req.userId) return res.status(403).json({ success: false, error: 'Unauthorized to dispatch this order' });
    if (order.orderStatus === 'cancelled') return res.status(400).json({ success: false, error: 'Cancelled orders cannot be dispatched' });

    const challanItems: any[] = [];
    for (const item of order.items as any[]) {
      const allocations = pendingDispatchAllocations(item);
      if (!allocations.length) continue;

      const moved = await dispatchReservedStock({
        productId: String(item.productId),
        allocations,
        referenceType: 'delivery_challan',
        referenceId: order._id.toString(),
        referenceNo: order.orderNumber,
        createdBy: req.userId,
      });
      const movedQty = roundTo2(moved.reduce((sum: number, row: any) => sum + toNumber(row.quantity), 0));
      if (movedQty <= 0) continue;

      item.deliveryAllocations = [...(item.deliveryAllocations || []), ...moved];
      item.deliveredQuantity = roundTo2(toNumber(item.deliveredQuantity) + movedQty);
      challanItems.push({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: movedQty,
        allocations: moved,
      });
    }

    if (!challanItems.length) {
      return res.status(400).json({ success: false, error: 'No reserved stock is available to dispatch' });
    }

    const challan = await DeliveryChallan.create({
      challanNumber: await generateNumber('delivery_challan', { prefix: 'DC-', datePart: true, padTo: 5 }),
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: 'issued',
      challanDate: new Date(),
      items: challanItems,
      notes: String(req.body?.notes || '').trim(),
      createdBy: req.userId,
    });

    order.deliveryChallanIds = [...(order.deliveryChallanIds || []), challan._id];
    summarizeOrderStatus(order);
    await order.save();

    await writeAuditLog({
      module: 'orders',
      action: 'delivery_challan_created',
      entityType: 'delivery_challan',
      entityId: challan._id.toString(),
      referenceNo: challan.challanNumber,
      userId: req.userId,
      metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber },
      after: challan.toObject(),
    });

    res.status(201).json({ success: true, message: 'Delivery challan generated', data: { order, challan } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create delivery challan' });
  }
});

router.post('/:id/invoice', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order: any = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.userId.toString() !== req.userId) return res.status(403).json({ success: false, error: 'Unauthorized to invoice this order' });
    if (order.orderStatus === 'cancelled') return res.status(400).json({ success: false, error: 'Cancelled orders cannot be invoiced' });

    const saleItems: any[] = [];
    let subtotal = 0;
    let totalGst = 0;
    let totalCogs = 0;

    for (const item of order.items as any[]) {
      const invoiceQty = roundTo2(Math.max(0, toNumber(item.deliveredQuantity) - toNumber(item.invoicedQuantity)));
      if (invoiceQty <= 0) continue;

      const allocations = pendingInvoiceAllocations(item);
      if (!allocations.length) continue;

      const stockIssue = await consumeStockFefo({
        productId: String(item.productId),
        quantity: invoiceQty,
        allocations,
        referenceType: 'order_invoice',
        referenceId: order._id.toString(),
        referenceNo: order.orderNumber,
        createdBy: req.userId,
      });

      const unitPrice = toNumber(item.price) / Math.max(1, toNumber(item.quantity));
      const taxableValue = roundTo2(unitPrice * invoiceQty);
      const gstRate = toNumber(item.gstRate);
      const gstAmount = roundTo2((taxableValue * gstRate) / 100);
      subtotal = roundTo2(subtotal + taxableValue);
      totalGst = roundTo2(totalGst + gstAmount);
      totalCogs = roundTo2(totalCogs + toNumber(stockIssue.cogsValue));

      saleItems.push({
        productId: String(item.productId),
        productName: item.productName,
        sku: item.sku,
        itemType: 'inventory',
        quantity: invoiceQty,
        unitPrice: roundTo2(unitPrice),
        listPrice: roundTo2(unitPrice),
        taxableValue,
        gstRate,
        gstAmount,
        cgstAmount: roundTo2(gstAmount / 2),
        sgstAmount: roundTo2(gstAmount / 2),
        taxType: 'gst',
        lineTotal: roundTo2(taxableValue + gstAmount),
        batchAllocations: stockIssue.allocations,
        cogsAmount: roundTo2(toNumber(stockIssue.cogsValue)),
      });

      item.invoicedQuantity = roundTo2(toNumber(item.invoicedQuantity) + invoiceQty);
    }

    if (!saleItems.length) {
      return res.status(400).json({ success: false, error: 'Dispatch stock before creating an invoice' });
    }

    const totalAmount = roundTo2(subtotal + totalGst);
    const paid = order.paymentStatus === 'completed' ? totalAmount : 0;
    const sale = await Sale.create({
      saleNumber: await generateNumber('sale_number', { prefix: 'S7SA/', padTo: 6 }),
      invoiceNumber: await generateNumber('invoice_number', { prefix: 'INV-', datePart: true, padTo: 5 }),
      userId: req.userId,
      invoiceType: paid >= totalAmount ? 'cash' : 'credit',
      invoiceStatus: 'posted',
      isLocked: true,
      pricingMode: 'retail',
      taxMode: 'exclusive',
      isGstBill: true,
      items: saleItems,
      subtotal,
      totalGst,
      grossTotal: totalAmount,
      roundOffAmount: 0,
      totalAmount,
      paymentMethod: salesPaymentMethodForOrder(order.paymentMethod),
      paymentStatus: paid >= totalAmount ? 'completed' : 'pending',
      saleStatus: 'completed',
      outstandingAmount: roundTo2(totalAmount - paid),
      customerName: 'Sales Order Customer',
      notes: `Generated from order ${order.orderNumber}${req.body?.notes ? ` - ${req.body.notes}` : ''}`,
      postedAt: new Date(),
      postedBy: req.userId,
    });

    if (totalCogs > 0) {
      await postCogsJournal({
        cogsValue: totalCogs,
        referenceType: 'order_invoice',
        referenceId: sale._id.toString(),
        referenceNo: sale.invoiceNumber || sale.saleNumber,
        createdBy: req.userId,
        metadata: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
        },
      });
    }

    order.invoiceSaleId = sale._id;
    summarizeOrderStatus(order);
    await order.save();

    await DeliveryChallan.updateMany(
      { _id: { $in: order.deliveryChallanIds || [] }, status: 'issued' },
      { $set: { status: 'invoiced' } }
    );

    await writeAuditLog({
      module: 'orders',
      action: 'sales_order_invoiced',
      entityType: 'order',
      entityId: order._id.toString(),
      referenceNo: order.orderNumber,
      userId: req.userId,
      metadata: {
        saleId: sale._id.toString(),
        invoiceNumber: sale.invoiceNumber,
        totalCogs,
      },
      after: order.toObject(),
    });

    res.status(201).json({ success: true, message: 'Invoice created from delivery challan', data: { order, sale } });
  } catch (error: any) {
    const status = String(error.message || '').includes('Insufficient') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to create invoice from order' });
  }
});

// Get orders for current user
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderStatus, paymentStatus, q = '', skip = 0, limit = 20 } = req.query;

    const filter: any = { userId: req.userId };
    if (orderStatus) filter.orderStatus = orderStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (String(q || '').trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { orderNumber: regex },
        { notes: regex },
        { 'items.productName': regex },
        { 'items.sku': regex },
      ];
    }

    const orders = await Order.find(filter)
      .populate('items.productId', 'name sku price')
      .skip(Number(skip))
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Order.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        total,
        skip: Number(skip),
        limit: Number(limit),
      },
    });
  } catch (error: any) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get orders',
    });
  }
});

// Get order by ID
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('userId', 'email firstName lastName businessName')
      .populate('items.productId', 'name sku price');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (order.userId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view this order',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get order',
    });
  }
});

// Update order status
router.put('/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderStatus, paymentStatus } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    if (order.userId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to update this order',
      });
    }

    if (orderStatus) order.orderStatus = orderStatus;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    await order.save();

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order,
    });
  } catch (error: any) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update order status',
    });
  }
});

export default router;
