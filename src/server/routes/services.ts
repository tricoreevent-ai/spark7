import mongoose from 'mongoose';
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceCatalog } from '../models/ServiceCatalog.js';
import { ServiceOrder, type IServiceOrderConsumableLine, type ServiceOrderStatus } from '../models/ServiceOrder.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { Employee } from '../models/Employee.js';
import { Sale } from '../models/Sale.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { consumeStockFefo } from '../services/inventoryCosting.js';

const router = Router();

const round2 = (value: number): number => Number((Number(value || 0) + Number.EPSILON).toFixed(2));
const normalizeText = (value: any): string => String(value || '').trim();
const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const parseNumber = (value: any, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const parsePositive = (value: any, fallback = 0): number => Math.max(0, parseNumber(value, fallback));
const parsePositiveInt = (value: any, fallback = 1): number => Math.max(1, Math.floor(parseNumber(value, fallback)));
const isValidObjectId = (value: any): boolean => mongoose.Types.ObjectId.isValid(String(value || ''));
const toObjectId = (value: string) => new mongoose.Types.ObjectId(value);
const statusOrder: ServiceOrderStatus[] = ['draft', 'open', 'in_progress', 'quality_check', 'completed', 'picked_up', 'cancelled'];

const normalizeStatus = (value: any, fallback: ServiceOrderStatus = 'draft'): ServiceOrderStatus => {
  const normalized = String(value || '').trim().toLowerCase();
  return statusOrder.includes(normalized as ServiceOrderStatus) ? (normalized as ServiceOrderStatus) : fallback;
};

const normalizePriority = (value: any): 'low' | 'medium' | 'high' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'high') return 'high';
  return 'medium';
};

const normalizeDiscountMode = (value: any): 'none' | 'amount' | 'percentage' => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'amount') return 'amount';
  if (normalized === 'percentage') return 'percentage';
  return 'none';
};

const parseDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const slugKey = (value: any): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeSpecificationTemplate = (value: any) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      key: slugKey(row?.key || row?.label),
      label: normalizeText(row?.label),
      inputType: ['text', 'number', 'boolean', 'date', 'select'].includes(String(row?.inputType || ''))
        ? String(row.inputType)
        : 'text',
      required: Boolean(row?.required),
      unit: normalizeText(row?.unit),
      placeholder: normalizeText(row?.placeholder),
      options: Array.isArray(row?.options)
        ? row.options.map((item: any) => normalizeText(item)).filter(Boolean)
        : normalizeText(row?.options)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      defaultValue: normalizeText(row?.defaultValue),
    }))
    .filter((row) => row.key && row.label);
};

const normalizeSpecificationValues = (value: any, template: any[] = []) => {
  const templateMap = new Map(template.map((row) => [String(row.key), row]));
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((row: any) => {
      const key = slugKey(row?.key || row?.label);
      const templateRow = templateMap.get(key);
      return {
        key,
        label: normalizeText(row?.label || templateRow?.label || key),
        inputType: ['text', 'number', 'boolean', 'date', 'select'].includes(String(row?.inputType || templateRow?.inputType || ''))
          ? String(row?.inputType || templateRow?.inputType || 'text')
          : 'text',
        value: normalizeText(row?.value),
        unit: normalizeText(row?.unit || templateRow?.unit),
      };
    })
    .filter((row) => row.key && row.label);

  for (const templateRow of template) {
    if (normalized.some((row) => row.key === String(templateRow.key))) continue;
    normalized.push({
      key: String(templateRow.key),
      label: String(templateRow.label),
      inputType: String(templateRow.inputType || 'text'),
      value: normalizeText(templateRow.defaultValue),
      unit: normalizeText(templateRow.unit),
    });
  }

  return normalized;
};

const normalizeAttachments = (value: any) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      name: normalizeText(row?.name),
      url: normalizeText(row?.url),
      contentType: normalizeText(row?.contentType),
    }))
    .filter((row) => row.name && row.url);
};

const loadProductsMap = async (productIds: string[]) => {
  const validIds = Array.from(new Set(productIds.filter(isValidObjectId)));
  if (!validIds.length) return new Map<string, any>();
  const rows = await Product.find({ _id: { $in: validIds } } as any).select('name sku price cost itemType gstRate stock minStock');
  return new Map(rows.map((row: any) => [String(row._id), row]));
};

const normalizeConsumableLines = async (value: any) => {
  const rows = Array.isArray(value) ? value : [];
  const requestedIds = rows.map((row: any) => String(row?.productId || '')).filter(Boolean);
  const productMap = await loadProductsMap(requestedIds);
  const normalized: any[] = [];
  for (const row of rows) {
    const productId = String(row?.productId || '').trim();
    const product = productMap.get(productId);
    const productName = normalizeText(row?.productName || product?.name);
    if (!productName) continue;
    const quantity = round2(parsePositive(row?.quantity || 0));
    if (quantity <= 0) continue;
    normalized.push({
      productId,
      productName,
      sku: normalizeText(row?.sku || product?.sku),
      quantity,
      unitPrice: round2(parsePositive(row?.unitPrice, Number(product?.price || 0))),
      optional: Boolean(row?.optional),
      notes: normalizeText(row?.notes),
      issuedQuantity: round2(parsePositive(row?.issuedQuantity || 0)),
      issueAllocations: Array.isArray(row?.issueAllocations)
        ? row.issueAllocations.map((issue: any) => ({
            batchId: normalizeText(issue?.batchId),
            batchNumber: normalizeText(issue?.batchNumber),
            locationId: normalizeText(issue?.locationId),
            locationCode: normalizeText(issue?.locationCode),
            expiryDate: parseDate(issue?.expiryDate),
            quantity: round2(parsePositive(issue?.quantity || 0)),
            unitCost: round2(parsePositive(issue?.unitCost || 0)),
            valueOut: round2(parsePositive(issue?.valueOut || 0)),
          }))
        : [],
    });
  }
  return normalized;
};

const buildTotals = (input: {
  quantity: number;
  basePrice: number;
  laborCharge: number;
  consumableLines: Array<{ quantity: number; unitPrice: number }>;
  discountMode: 'none' | 'amount' | 'percentage';
  discountValue: number;
  gstRate: number;
}) => {
  const serviceBase = round2((round2(input.basePrice) + round2(input.laborCharge)) * Math.max(1, input.quantity));
  const consumableSubtotal = round2(
    (input.consumableLines || []).reduce((sum, row) => sum + round2(Number(row.quantity || 0) * Number(row.unitPrice || 0)), 0)
  );
  const subtotal = round2(serviceBase + consumableSubtotal);
  const discountAmount =
    input.discountMode === 'percentage'
      ? round2((subtotal * Math.min(100, Math.max(0, input.discountValue))) / 100)
      : input.discountMode === 'amount'
        ? round2(Math.min(subtotal, Math.max(0, input.discountValue)))
        : 0;
  const taxableValue = round2(Math.max(0, subtotal - discountAmount));
  const gstRate = [0, 5, 12, 18, 28].includes(Number(input.gstRate)) ? Number(input.gstRate) : 18;
  const gstAmount = round2((taxableValue * gstRate) / 100);
  const cgstAmount = gstRate > 0 ? round2(gstAmount / 2) : 0;
  const sgstAmount = gstRate > 0 ? round2(gstAmount / 2) : 0;
  return {
    subtotal,
    discountAmount,
    taxableValue,
    gstRate,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount: 0,
    totalAmount: round2(taxableValue + gstAmount),
  };
};

const appendTimeline = (timeline: any[], entry: { action: string; message: string; createdBy?: string; fromStatus?: string; toStatus?: string }) => [
  ...(Array.isArray(timeline) ? timeline : []),
  {
    action: entry.action,
    message: entry.message,
    createdBy: entry.createdBy || '',
    fromStatus: entry.fromStatus || '',
    toStatus: entry.toStatus || '',
    createdAt: new Date(),
  },
];

const ensureCustomerRecord = async (input: {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  createdBy?: string;
}) => {
  if (input.customerId && isValidObjectId(input.customerId)) {
    const existing = await Customer.findById(input.customerId);
    if (existing) return existing;
  }

  const normalizedPhone = normalizePhone(input.customerPhone);
  if (!normalizedPhone) {
    throw new Error('Customer phone is required for a service order.');
  }

  const existingByPhone = await Customer.findOne({ phone: normalizedPhone }).sort({ updatedAt: -1, createdAt: -1 });
  if (existingByPhone) {
    if (normalizeText(input.customerName) && existingByPhone.name !== normalizeText(input.customerName)) {
      existingByPhone.name = normalizeText(input.customerName);
    }
    if (normalizeEmail(input.customerEmail) && existingByPhone.email !== normalizeEmail(input.customerEmail)) {
      existingByPhone.email = normalizeEmail(input.customerEmail);
    }
    await existingByPhone.save();
    return existingByPhone;
  }

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  return Customer.create({
    customerCode,
    name: normalizeText(input.customerName) || `Customer ${normalizedPhone}`,
    phone: normalizedPhone,
    email: normalizeEmail(input.customerEmail),
    customerCategory: 'walk_in',
    accountType: 'cash',
    isBlocked: false,
    createdBy: input.createdBy,
  });
};

const normalizeSortOrder = (value: any): 1 | -1 => (String(value || '').trim().toLowerCase() === 'asc' ? 1 : -1);

const buildOrderPayload = async (body: any, req: AuthenticatedRequest, existing?: any) => {
  const quantity = parsePositiveInt(body?.quantity, Number(existing?.quantity || 1));
  const serviceCatalogId = normalizeText(body?.serviceCatalogId || existing?.serviceCatalogId);
  const serviceCatalog = serviceCatalogId && isValidObjectId(serviceCatalogId)
    ? await ServiceCatalog.findById(serviceCatalogId)
    : null;

  const assignedStaffId = normalizeText(body?.assignedStaffId || existing?.assignedStaffId);
  const assignedStaff = assignedStaffId && isValidObjectId(assignedStaffId)
    ? await Employee.findById(assignedStaffId).select('_id name designation')
    : null;

  const customer = await ensureCustomerRecord({
    customerId: body?.customerId || existing?.customerId,
    customerName: body?.customerName || existing?.customerName,
    customerPhone: body?.customerPhone || existing?.customerPhone,
    customerEmail: body?.customerEmail || existing?.customerEmail,
    createdBy: req.userId,
  });

  const specificationTemplate = normalizeSpecificationTemplate(body?.specificationTemplate || serviceCatalog?.specificationTemplate || []);
  const specificationValues = normalizeSpecificationValues(body?.specificationValues, specificationTemplate);
  const rawConsumableLines =
    Array.isArray(body?.consumableLines) && body.consumableLines.length
      ? body.consumableLines
      : Array.isArray(serviceCatalog?.consumables)
        ? serviceCatalog?.consumables
        : [];
  const basePrice = round2(parsePositive(body?.basePrice, Number(serviceCatalog?.basePrice || existing?.basePrice || 0)));
  const laborCharge = round2(parsePositive(body?.laborCharge, Number(serviceCatalog?.laborCharge || existing?.laborCharge || 0)));
  const gstRate = parsePositive(body?.gstRate, Number(serviceCatalog?.gstRate || existing?.gstRate || 18));
  const discountMode = normalizeDiscountMode(body?.discountMode || existing?.discountMode);
  const discountValue = round2(parsePositive(body?.discountValue, Number(existing?.discountValue || 0)));
  const consumableLines = await normalizeConsumableLines(rawConsumableLines);
  const totals = buildTotals({
    quantity,
    basePrice,
    laborCharge,
    consumableLines,
    discountMode,
    discountValue,
    gstRate,
  });

  return {
    customerId: String(customer._id),
    customerCode: normalizeText(customer.customerCode),
    customerName: normalizeText(customer.name),
    customerPhone: normalizePhone(customer.phone),
    customerEmail: normalizeEmail(customer.email),
    serviceCatalogId: serviceCatalog ? String(serviceCatalog._id) : serviceCatalogId,
    serviceCode: normalizeText(serviceCatalog?.serviceCode || body?.serviceCode || existing?.serviceCode),
    serviceName: normalizeText(serviceCatalog?.name || body?.serviceName || existing?.serviceName),
    serviceCategory: normalizeText(serviceCatalog?.category || body?.serviceCategory || existing?.serviceCategory),
    quantity,
    equipmentName: normalizeText(body?.equipmentName || existing?.equipmentName),
    equipmentBrand: normalizeText(body?.equipmentBrand || existing?.equipmentBrand),
    equipmentModel: normalizeText(body?.equipmentModel || existing?.equipmentModel),
    equipmentSerialNumber: normalizeText(body?.equipmentSerialNumber || existing?.equipmentSerialNumber).toUpperCase(),
    currentCondition: normalizeText(body?.currentCondition || existing?.currentCondition),
    specificationValues,
    requestedCompletionDate: parseDate(body?.requestedCompletionDate) || existing?.requestedCompletionDate,
    specialInstructions: normalizeText(body?.specialInstructions || existing?.specialInstructions),
    consumableLines,
    attachments: normalizeAttachments(body?.attachments || existing?.attachments),
    basePrice,
    laborCharge,
    discountMode,
    discountValue,
    discountAmount: totals.discountAmount,
    subtotal: totals.subtotal,
    taxableValue: totals.taxableValue,
    gstRate: totals.gstRate,
    gstAmount: totals.gstAmount,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    totalAmount: totals.totalAmount,
    status: normalizeStatus(body?.status, normalizeStatus(existing?.status, 'draft')),
    assignedStaffId: assignedStaff ? String(assignedStaff._id) : '',
    assignedStaffName: normalizeText(assignedStaff?.name || body?.assignedStaffName || existing?.assignedStaffName),
    priority: normalizePriority(body?.priority || existing?.priority),
    internalNotes: normalizeText(body?.internalNotes || existing?.internalNotes),
    customerFacingNotes: normalizeText(body?.customerFacingNotes || existing?.customerFacingNotes),
  };
};

const issueConsumablesForOrder = async (order: any, userId?: string) => {
  const updatedLines: IServiceOrderConsumableLine[] = [];

  for (const line of order.consumableLines || []) {
    const productId = String(line.productId || '').trim();
    if (!productId || !isValidObjectId(productId)) {
      updatedLines.push(line);
      continue;
    }

    const quantity = round2(parsePositive(line.quantity || 0));
    const alreadyIssued = round2(parsePositive(line.issuedQuantity || 0));
    const remaining = round2(Math.max(0, quantity - alreadyIssued));
    if (remaining <= 0) {
      updatedLines.push(line);
      continue;
    }

    const issue = await consumeStockFefo({
      productId,
      quantity: remaining,
      transactionType: 'sale_invoice',
      referenceType: 'service_order',
      referenceId: String(order._id),
      referenceNo: order.orderNumber,
      createdBy: userId,
    });

    updatedLines.push({
      ...(line as any),
      issuedQuantity: round2(alreadyIssued + remaining - Number(issue.shortQuantity || 0)),
      issueAllocations: [...(Array.isArray(line.issueAllocations) ? line.issueAllocations : []), ...(issue.allocations || [])],
    } as any);
  }

  return {
    consumableLines: updatedLines,
    inventoryIssued: updatedLines.every((line) => round2(parsePositive(line.issuedQuantity || 0)) >= round2(parsePositive(line.quantity || 0))),
  };
};

const generateInvoiceForOrder = async (order: any, userId?: string, options?: { paymentMethod?: string; markPaid?: boolean }) => {
  if (order.saleId) {
    const existing = await Sale.findById(order.saleId);
    if (existing) return existing;
  }

  const saleNumber = await generateNumber('sale_number', { prefix: 'S7SA/', padTo: 6 });
  const invoiceNumber = await generateNumber('invoice_number', { prefix: 'INV-', datePart: true, padTo: 5 });
  const unitPrice = round2(order.quantity > 0 ? Number(order.taxableValue || 0) / Number(order.quantity || 1) : Number(order.taxableValue || 0));
  const markPaid = Boolean(options?.markPaid);

  const sale = new Sale({
    saleNumber,
    invoiceNumber,
    userId: userId || order.createdBy || 'system',
    invoiceType: markPaid ? 'cash' : 'credit',
    invoiceStatus: 'posted',
    isLocked: true,
    pricingMode: 'retail',
    taxMode: 'exclusive',
    isGstBill: Number(order.gstRate || 0) > 0,
    items: [
      {
        productId: String(order.serviceCatalogId || order._id),
        productName: order.serviceName,
        sku: order.serviceCode || order.orderNumber,
        category: 'Service',
        subcategory: order.serviceCategory || 'General',
        itemType: 'service',
        quantity: Number(order.quantity || 1),
        unitPrice,
        listPrice: unitPrice,
        taxableValue: Number(order.taxableValue || 0),
        gstRate: Number(order.gstRate || 0),
        gstAmount: Number(order.gstAmount || 0),
        cgstAmount: Number(order.cgstAmount || 0),
        sgstAmount: Number(order.sgstAmount || 0),
        lineTotal: Number(order.totalAmount || 0),
      },
    ],
    subtotal: Number(order.taxableValue || 0),
    totalGst: Number(order.gstAmount || 0),
    grossTotal: Number(order.totalAmount || 0),
    roundOffAmount: 0,
    totalAmount: Number(order.totalAmount || 0),
    paymentMethod: ['cash', 'card', 'upi', 'cheque', 'online', 'bank_transfer'].includes(String(options?.paymentMethod || 'cash'))
      ? String(options?.paymentMethod || 'cash')
      : 'cash',
    paymentStatus: markPaid ? 'completed' : 'pending',
    saleStatus: 'completed',
    outstandingAmount: markPaid ? 0 : Number(order.totalAmount || 0),
    customerId: order.customerId || undefined,
    customerCode: order.customerCode || '',
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || '',
    notes: `Service invoice for ${order.orderNumber}`,
    discountAmount: Number(order.discountAmount || 0),
    discountPercentage: order.discountMode === 'percentage' ? Number(order.discountValue || 0) : 0,
    postedAt: new Date(),
    postedBy: userId,
  });

  await sale.save();
  return sale;
};

router.get('/lookups', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [catalogRows, employees, products] = await Promise.all([
      ServiceCatalog.find({ active: true }).sort({ category: 1, name: 1 }).lean(),
      Employee.find({ active: true }).select('_id name designation employeeCode').sort({ name: 1 }).lean(),
      Product.find({ isActive: { $ne: false } })
        .select('_id name sku category subcategory itemType price cost gstRate stock minStock')
        .sort({ name: 1 })
        .lean(),
    ]);

    res.json({ success: true, data: { catalog: catalogRows, employees, products } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load service lookups' });
  }
});

router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [statusBreakdown, activeCount, pendingPickupCount, draftCount, revenueRows, completionRows, recentActivity, lowStockIds] = await Promise.all([
      ServiceOrder.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ServiceOrder.countDocuments({ status: { $in: ['open', 'in_progress', 'quality_check', 'completed'] } }),
      ServiceOrder.countDocuments({ status: 'completed' }),
      ServiceOrder.countDocuments({ status: 'draft' }),
      ServiceOrder.aggregate([
        { $match: { createdAt: { $gte: monthStart }, status: { $in: ['completed', 'picked_up'] } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      ServiceOrder.aggregate([
        { $match: { completedAt: { $exists: true, $ne: null }, status: { $in: ['completed', 'picked_up'] } } },
        {
          $project: {
            hours: {
              $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 1000 * 60 * 60],
            },
          },
        },
        { $group: { _id: null, averageHours: { $avg: '$hours' } } },
      ]),
      ServiceOrder.find()
        .select('orderNumber customerName serviceName status assignedStaffName priority updatedAt createdAt')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      ServiceCatalog.distinct('consumables.productId', { 'consumables.productId': { $ne: '' } }),
    ]);

    const validStockIds = Array.from(new Set((lowStockIds || []).filter((id: any) => isValidObjectId(id)).map(String)));
    const lowStockAlerts = validStockIds.length
      ? await Product.aggregate([
          { $match: { _id: { $in: validStockIds.map(toObjectId) }, isActive: { $ne: false } } },
          { $match: { $expr: { $lte: ['$stock', '$minStock'] } } },
          { $project: { name: 1, sku: 1, category: 1, stock: 1, minStock: 1 } },
          { $sort: { stock: 1, name: 1 } },
          { $limit: 8 },
        ])
      : [];

    res.json({
      success: true,
      data: {
        summary: {
          activeOrders: activeCount,
          pendingPickup: pendingPickupCount,
          pendingApproval: draftCount,
          averageCompletionHours: round2(Number(completionRows?.[0]?.averageHours || 0)),
          averageCompletionDays: round2(Number(completionRows?.[0]?.averageHours || 0) / 24),
          revenueThisMonth: round2(Number(revenueRows?.[0]?.total || 0)),
        },
        statusBreakdown: statusBreakdown.map((row: any) => ({ status: row._id || 'draft', count: Number(row.count || 0) })),
        recentActivity,
        lowStockAlerts,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load service dashboard' });
  }
});

router.get('/catalog', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeOnly = String(req.query.activeOnly || '').trim().toLowerCase() === 'true';
    const rows = await ServiceCatalog.find(activeOnly ? { active: true } : {}).sort({ category: 1, name: 1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load service catalog' });
  }
});

router.post('/catalog/seed-defaults', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const defaults = [
      {
        name: 'Badminton Racquet Stringing',
        category: 'Stringing',
        description: 'Professional badminton racquet string installation for Spark players.',
        basePrice: 300,
        laborCharge: 150,
        estimatedDurationMinutes: 75,
        gstRate: 18,
        defaultTension: '24 lbs',
        specificationTemplate: [
          { key: 'tension', label: 'Tension', inputType: 'text', required: true, unit: 'lbs', defaultValue: '24 lbs' },
          { key: 'string_pattern', label: 'String Pattern', inputType: 'select', options: ['Standard', 'Two-piece', 'Custom'], defaultValue: 'Standard' },
          { key: 'pre_stretch', label: 'Pre-stretch', inputType: 'boolean', defaultValue: 'No' },
          { key: 'preferred_string_type', label: 'Preferred String Type', inputType: 'text', placeholder: 'Yonex BG80 / BG65 / Li-Ning No.1' },
        ],
      },
      {
        name: 'Badminton Grip Change',
        category: 'Regrip',
        description: 'Remove worn grip and apply a fresh replacement or overgrip.',
        basePrice: 80,
        laborCharge: 40,
        estimatedDurationMinutes: 20,
        gstRate: 18,
        specificationTemplate: [
          { key: 'grip_type', label: 'Grip Type', inputType: 'select', options: ['Replacement Grip', 'Overgrip'], defaultValue: 'Overgrip' },
          { key: 'grip_color', label: 'Grip Color', inputType: 'text', placeholder: 'Black / White / Neon Yellow' },
          { key: 'wrap_finish', label: 'Wrap Finish', inputType: 'select', options: ['Dry', 'Tacky', 'Cushion'], defaultValue: 'Tacky' },
        ],
      },
      {
        name: 'Racquet Grommet Replacement',
        category: 'Repair',
        description: 'Replace damaged or worn racquet grommets before restringing.',
        basePrice: 120,
        laborCharge: 60,
        estimatedDurationMinutes: 30,
        gstRate: 18,
        specificationTemplate: [
          { key: 'grommet_area', label: 'Grommet Area', inputType: 'text', placeholder: 'Top frame / side / full set' },
          { key: 'string_removal_required', label: 'String Removal Required', inputType: 'boolean', defaultValue: 'Yes' },
        ],
      },
      {
        name: 'Cricket Bat Knocking',
        category: 'Customisation',
        description: 'Prepare new cricket bats with machine or manual knocking.',
        basePrice: 450,
        laborCharge: 250,
        estimatedDurationMinutes: 180,
        gstRate: 18,
        specificationTemplate: [
          { key: 'knocking_type', label: 'Knocking Type', inputType: 'select', options: ['Manual', 'Machine'], defaultValue: 'Machine' },
          { key: 'target_session', label: 'Target Session', inputType: 'text', placeholder: 'Standard / Match prep' },
        ],
      },
      {
        name: 'Equipment Calibration',
        category: 'Calibration',
        description: 'Calibration or tuning of small sports equipment or measurement devices.',
        basePrice: 350,
        laborCharge: 200,
        estimatedDurationMinutes: 90,
        gstRate: 18,
        specificationTemplate: [
          { key: 'target_value', label: 'Target Value', inputType: 'text', placeholder: 'Required calibration value' },
          { key: 'current_reading', label: 'Current Reading', inputType: 'text', placeholder: 'Observed reading before service' },
        ],
      },
    ];

    const saved: any[] = [];
    for (const row of defaults) {
      const existing = await ServiceCatalog.findOne({ name: row.name });
      if (existing) {
        saved.push(existing);
        continue;
      }
      const serviceCode = await generateNumber('service_catalog', { prefix: 'SRV-', padTo: 4 });
      const created = await ServiceCatalog.create({
        ...row,
        serviceCode,
        active: true,
        consumables: [],
        createdBy: req.userId,
      });
      saved.push(created);
    }

    res.json({ success: true, data: saved, message: 'Spark starter services are ready.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to seed service catalog' });
  }
});

router.post('/catalog', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const name = normalizeText(req.body?.name);
    const category = normalizeText(req.body?.category);
    if (!name || !category) {
      return res.status(400).json({ success: false, error: 'Service name and category are required.' });
    }

    const serviceCode = await generateNumber('service_catalog', { prefix: 'SRV-', padTo: 4 });
    const consumables = await normalizeConsumableLines(req.body?.consumables || []);
    const specificationTemplate = normalizeSpecificationTemplate(req.body?.specificationTemplate);

    const service: any = await ServiceCatalog.create({
      serviceCode,
      name,
      category,
      description: normalizeText(req.body?.description),
      basePrice: round2(parsePositive(req.body?.basePrice || 0)),
      laborCharge: round2(parsePositive(req.body?.laborCharge || 0)),
      estimatedDurationMinutes: parsePositiveInt(req.body?.estimatedDurationMinutes, 60),
      consumables,
      gstRate: parsePositive(req.body?.gstRate, 18),
      defaultTension: normalizeText(req.body?.defaultTension),
      specificationTemplate,
      active: req.body?.active !== false,
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'services',
      action: 'catalog_created',
      entityType: 'service_catalog',
      entityId: String(service._id),
      referenceNo: service.serviceCode,
      userId: req.userId,
      after: service.toObject(),
    });

    res.status(201).json({ success: true, data: service, message: 'Service catalog entry created.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create service catalog entry' });
  }
});

router.put('/catalog/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const service = await ServiceCatalog.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, error: 'Service catalog entry not found.' });
    }

    const before = service.toObject();
    const name = normalizeText(req.body?.name);
    const category = normalizeText(req.body?.category);
    if (!name || !category) {
      return res.status(400).json({ success: false, error: 'Service name and category are required.' });
    }

    service.name = name;
    service.category = category;
    service.description = normalizeText(req.body?.description);
    service.basePrice = round2(parsePositive(req.body?.basePrice || 0));
    service.laborCharge = round2(parsePositive(req.body?.laborCharge || 0));
    service.estimatedDurationMinutes = parsePositiveInt(req.body?.estimatedDurationMinutes, 60);
    service.consumables = await normalizeConsumableLines(req.body?.consumables || []);
    service.gstRate = parsePositive(req.body?.gstRate, 18) as any;
    service.defaultTension = normalizeText(req.body?.defaultTension);
    service.specificationTemplate = normalizeSpecificationTemplate(req.body?.specificationTemplate) as any;
    service.active = req.body?.active !== false;
    await service.save();

    await writeAuditLog({
      module: 'services',
      action: 'catalog_updated',
      entityType: 'service_catalog',
      entityId: String(service._id),
      referenceNo: service.serviceCode,
      userId: req.userId,
      before,
      after: service.toObject(),
    });

    res.json({ success: true, data: service, message: 'Service catalog entry updated.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update service catalog entry' });
  }
});

router.get('/orders', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = normalizeText(req.query.q);
    const status = normalizeText(req.query.status);
    const assignedStaffId = normalizeText(req.query.assignedStaffId);
    const serviceCatalogId = normalizeText(req.query.serviceCatalogId);
    const sortBy = ['createdAt', 'updatedAt', 'requestedCompletionDate', 'totalAmount', 'status'].includes(String(req.query.sortBy || ''))
      ? String(req.query.sortBy)
      : 'updatedAt';
    const sortOrder = normalizeSortOrder(req.query.sortOrder);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 250)));

    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (assignedStaffId) filter.assignedStaffId = assignedStaffId;
    if (serviceCatalogId) filter.serviceCatalogId = serviceCatalogId;
    if (q) {
      const phone = normalizePhone(q);
      filter.$or = [
        { orderNumber: { $regex: q, $options: 'i' } },
        { customerName: { $regex: q, $options: 'i' } },
        { customerPhone: { $regex: q, $options: 'i' } },
        { serviceName: { $regex: q, $options: 'i' } },
        { equipmentBrand: { $regex: q, $options: 'i' } },
        { equipmentModel: { $regex: q, $options: 'i' } },
        { equipmentSerialNumber: { $regex: q, $options: 'i' } },
        ...(phone ? [{ customerPhone: phone }] : []),
      ];
    }

    const rows = await ServiceOrder.find(filter).sort({ [sortBy]: sortOrder }).limit(limit);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load service orders' });
  }
});

router.post('/orders', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = await buildOrderPayload(req.body, req);
    if (!payload.serviceName) {
      return res.status(400).json({ success: false, error: 'Service type is required.' });
    }

    const orderNumber = await generateNumber('service_order', { prefix: 'SO-', datePart: true, padTo: 5 });
    const order: any = await ServiceOrder.create({
      orderNumber,
      ...payload,
      paymentStatus: 'unpaid',
      inventoryIssued: false,
      timeline: appendTimeline([], {
        action: 'created',
        message: `Service order created with status ${payload.status.replace('_', ' ')}`,
        createdBy: req.userId,
        toStatus: payload.status,
      }),
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'services',
      action: 'order_created',
      entityType: 'service_order',
      entityId: String(order._id),
      referenceNo: order.orderNumber,
      userId: req.userId,
      after: order.toObject(),
    });

    res.status(201).json({ success: true, data: order, message: 'Service order created.' });
  } catch (error: any) {
    const message = String(error?.message || '');
    const status = message.includes('required') ? 400 : 500;
    res.status(status).json({ success: false, error: message || 'Failed to create service order' });
  }
});

router.put('/orders/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await ServiceOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Service order not found.' });
    }

    const before = order.toObject();
    const payload = await buildOrderPayload(req.body, req, order);

    if (order.inventoryIssued || order.saleId) {
      payload.consumableLines = order.consumableLines as any;
      payload.quantity = Number(order.quantity || 1);
      payload.basePrice = Number(order.basePrice || 0);
      payload.laborCharge = Number(order.laborCharge || 0);
      payload.discountMode = String(order.discountMode || 'none') as any;
      payload.discountValue = Number(order.discountValue || 0);
      payload.discountAmount = Number(order.discountAmount || 0);
      payload.subtotal = Number(order.subtotal || 0);
      payload.taxableValue = Number(order.taxableValue || 0);
      payload.gstRate = Number(order.gstRate || 0);
      payload.gstAmount = Number(order.gstAmount || 0);
      payload.cgstAmount = Number(order.cgstAmount || 0);
      payload.sgstAmount = Number(order.sgstAmount || 0);
      payload.igstAmount = Number(order.igstAmount || 0);
      payload.totalAmount = Number(order.totalAmount || 0);
    }

    Object.assign(order, payload);
    order.timeline = appendTimeline(order.timeline, {
      action: 'updated',
      message: 'Service order details updated.',
      createdBy: req.userId,
      toStatus: order.status,
    }) as any;
    await order.save();

    await writeAuditLog({
      module: 'services',
      action: 'order_updated',
      entityType: 'service_order',
      entityId: String(order._id),
      referenceNo: order.orderNumber,
      userId: req.userId,
      before,
      after: order.toObject(),
    });

    res.json({ success: true, data: order, message: 'Service order updated.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update service order' });
  }
});

router.post('/orders/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await ServiceOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Service order not found.' });
    }

    const nextStatus = normalizeStatus(req.body?.status, order.status as ServiceOrderStatus);
    const previousStatus = normalizeStatus(order.status, 'draft');
    if (previousStatus === 'cancelled' && nextStatus !== 'cancelled') {
      return res.status(400).json({ success: false, error: 'Cancelled service orders cannot be reopened.' });
    }

    if (nextStatus === 'completed' && !order.inventoryIssued) {
      const issueResult = await issueConsumablesForOrder(order, req.userId);
      order.consumableLines = issueResult.consumableLines as any;
      order.inventoryIssued = issueResult.inventoryIssued;
      order.completedAt = order.completedAt || new Date();
    }

    if (nextStatus === 'picked_up') {
      order.pickedUpAt = order.pickedUpAt || new Date();
      if (!order.completedAt) order.completedAt = new Date();
    }

    order.status = nextStatus;
    if (String(req.body?.paymentStatus || '').trim()) {
      const paymentStatus = String(req.body.paymentStatus).trim().toLowerCase();
      if (['unpaid', 'partially_paid', 'paid'].includes(paymentStatus)) {
        order.paymentStatus = paymentStatus as any;
      }
    }
    order.timeline = appendTimeline(order.timeline, {
      action: 'status_changed',
      message: `Status changed from ${previousStatus.replace('_', ' ')} to ${nextStatus.replace('_', ' ')}`,
      createdBy: req.userId,
      fromStatus: previousStatus,
      toStatus: nextStatus,
    }) as any;
    await order.save();

    await writeAuditLog({
      module: 'services',
      action: 'order_status_changed',
      entityType: 'service_order',
      entityId: String(order._id),
      referenceNo: order.orderNumber,
      userId: req.userId,
      metadata: { fromStatus: previousStatus, toStatus: nextStatus },
      after: order.toObject(),
    });

    res.json({ success: true, data: order, message: 'Service order status updated.' });
  } catch (error: any) {
    const message = String(error?.message || '');
    const status = message.includes('stock') ? 400 : 500;
    res.status(status).json({ success: false, error: message || 'Failed to update service order status' });
  }
});

router.post('/orders/:id/generate-invoice', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const order = await ServiceOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Service order not found.' });
    }

    if (!['completed', 'picked_up'].includes(String(order.status))) {
      return res.status(400).json({ success: false, error: 'Generate the invoice after the service is completed.' });
    }

    if (!order.inventoryIssued && Array.isArray(order.consumableLines) && order.consumableLines.length) {
      const issueResult = await issueConsumablesForOrder(order, req.userId);
      order.consumableLines = issueResult.consumableLines as any;
      order.inventoryIssued = issueResult.inventoryIssued;
    }

    const sale = await generateInvoiceForOrder(order, req.userId, {
      paymentMethod: normalizeText(req.body?.paymentMethod || 'cash'),
      markPaid: req.body?.markPaid !== false,
    });

    order.saleId = String(sale._id);
    order.saleNumber = normalizeText(sale.saleNumber);
    order.invoiceNumber = normalizeText(sale.invoiceNumber);
    order.paymentStatus = sale.paymentStatus === 'completed' ? 'paid' : 'unpaid';
    order.timeline = appendTimeline(order.timeline, {
      action: 'invoice_generated',
      message: `Invoice ${sale.invoiceNumber || sale.saleNumber} generated from service order.`,
      createdBy: req.userId,
    }) as any;
    await order.save();

    await writeAuditLog({
      module: 'services',
      action: 'invoice_generated',
      entityType: 'service_order',
      entityId: String(order._id),
      referenceNo: order.orderNumber,
      userId: req.userId,
      metadata: { saleId: String(sale._id), invoiceNumber: sale.invoiceNumber },
      after: order.toObject(),
    });

    res.json({ success: true, data: { order, sale }, message: 'Sales invoice generated from service order.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate invoice from service order' });
  }
});

router.get('/reports/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = parseDate(req.query.startDate) || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = parseDate(req.query.endDate) || new Date();
    endDate.setHours(23, 59, 59, 999);

    const match = { createdAt: { $gte: startDate, $lte: endDate }, status: { $in: ['completed', 'picked_up'] } };

    const [revenueByType, staffPerformance, pendingPickups, gstByRate, consumableUsage] = await Promise.all([
      ServiceOrder.aggregate([
        { $match: match },
        {
          $group: {
            _id: { serviceName: '$serviceName', category: '$serviceCategory' },
            jobs: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { revenue: -1, '_id.serviceName': 1 } },
      ]),
      ServiceOrder.aggregate([
        { $match: match },
        {
          $project: {
            assignedStaffName: 1,
            totalAmount: 1,
            completionHours: {
              $cond: [
                { $and: [{ $ifNull: ['$completedAt', false] }, { $ifNull: ['$createdAt', false] }] },
                { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 1000 * 60 * 60] },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: '$assignedStaffName',
            jobs: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
            averageCompletionHours: { $avg: '$completionHours' },
          },
        },
        { $sort: { revenue: -1, _id: 1 } },
      ]),
      ServiceOrder.find({ status: 'completed' })
        .select('orderNumber customerName serviceName totalAmount requestedCompletionDate completedAt assignedStaffName')
        .sort({ completedAt: 1, requestedCompletionDate: 1 })
        .limit(25)
        .lean(),
      ServiceOrder.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$gstRate',
            taxableValue: { $sum: '$taxableValue' },
            taxAmount: { $sum: '$gstAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      ServiceOrder.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate }, status: { $in: ['in_progress', 'completed', 'picked_up'] } } },
        { $unwind: { path: '$consumableLines', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: {
              productId: '$consumableLines.productId',
              productName: '$consumableLines.productName',
              sku: '$consumableLines.sku',
            },
            quantity: { $sum: '$consumableLines.quantity' },
            issuedQuantity: { $sum: '$consumableLines.issuedQuantity' },
            chargeValue: { $sum: { $multiply: ['$consumableLines.quantity', '$consumableLines.unitPrice'] } },
          },
        },
        { $sort: { quantity: -1, '_id.productName': 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        revenueByType: revenueByType.map((row: any) => ({
          serviceName: row._id?.serviceName || 'Service',
          category: row._id?.category || '',
          jobs: Number(row.jobs || 0),
          revenue: round2(Number(row.revenue || 0)),
        })),
        staffPerformance: staffPerformance.map((row: any) => ({
          staffName: row._id || 'Unassigned',
          jobs: Number(row.jobs || 0),
          revenue: round2(Number(row.revenue || 0)),
          averageCompletionHours: round2(Number(row.averageCompletionHours || 0)),
        })),
        pendingPickups,
        gstByRate: gstByRate.map((row: any) => ({
          gstRate: Number(row._id || 0),
          taxableValue: round2(Number(row.taxableValue || 0)),
          taxAmount: round2(Number(row.taxAmount || 0)),
        })),
        consumableUsage: consumableUsage.map((row: any) => ({
          productId: row._id?.productId || '',
          productName: row._id?.productName || 'Consumable',
          sku: row._id?.sku || '',
          quantity: round2(Number(row.quantity || 0)),
          issuedQuantity: round2(Number(row.issuedQuantity || 0)),
          chargeValue: round2(Number(row.chargeValue || 0)),
        })),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load service reports' });
  }
});

export default router;
