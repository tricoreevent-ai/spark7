import { Router, Response } from 'express';
import type { SortOrder } from 'mongoose';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Quote } from '../models/Quote.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { Sale } from '../models/Sale.js';
import { generateNumber } from '../services/numbering.js';
import { normalizeProductItemType, resolveBaseProductPrice } from '../services/salesPricing.js';
import { writeAuditLog } from '../services/audit.js';

const router = Router();

const roundTo2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();

const reserveUniqueQuoteNumber = async (): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = await generateNumber('quote_number', { prefix: 'QT-', datePart: true, padTo: 5 });
    const exists = await Quote.exists({ quoteNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Unable to create a unique quote number. Please try again.');
};

const reserveUniqueSaleNumber = async (): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = await generateNumber('sale_number', { prefix: 'S7SA/', padTo: 6 });
    const exists = await Sale.exists({ saleNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Unable to create a unique sale number. Please try again.');
};

const reserveUniqueInvoiceNumber = async (): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = await generateNumber('invoice_number', { prefix: 'INV-', datePart: true, padTo: 5 });
    const exists = await Sale.exists({ invoiceNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Unable to create a unique invoice number. Please try again.');
};

const customerPriceForProduct = (customer: any, productId: string): number | null => {
  if (!customer?.priceOverrides || !Array.isArray(customer.priceOverrides)) return null;
  const row = customer.priceOverrides.find((item: any) => String(item.productId) === String(productId));
  if (!row) return null;
  return Number(row.unitPrice || 0);
};

const loadCustomerForQuote = async (input: {
  customerId?: any;
  customerName?: any;
  customerPhone?: any;
  customerEmail?: any;
}) => {
  if (!input.customerId) return null;
  const customer = await Customer.findById(input.customerId);
  if (!customer) throw new Error('Customer not found');

  if (input.customerName) customer.name = String(input.customerName).trim() || customer.name;
  if (input.customerPhone) customer.phone = normalizePhone(input.customerPhone) || customer.phone;
  if (input.customerEmail) customer.email = normalizeEmail(input.customerEmail) || customer.email;
  await customer.save();
  return customer;
};

const normalizeQuoteStatus = (value: any): 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted' => {
  const normalized = String(value || 'draft').trim().toLowerCase();
  if (normalized === 'sent') return 'sent';
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'converted') return 'converted';
  return 'draft';
};

const buildQuoteSort = (sortBy: any, sortDir: any): Record<string, SortOrder> => {
  const field = String(sortBy || 'updatedAt').trim();
  const direction: SortOrder = String(sortDir || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1;

  const safeField = (() => {
    switch (field) {
      case 'createdAt':
      case 'updatedAt':
      case 'validUntil':
      case 'totalAmount':
      case 'customerName':
      case 'quoteNumber':
      case 'quoteStatus':
        return field;
      default:
        return 'updatedAt';
    }
  })();

  return {
    [safeField]: direction,
    updatedAt: safeField === 'updatedAt' ? direction : -1,
    createdAt: safeField === 'createdAt' ? direction : -1,
    _id: -1,
  };
};

const buildQuoteItems = async (args: {
  items: any[];
  pricingMode: 'retail' | 'wholesale' | 'customer';
  taxMode: 'inclusive' | 'exclusive';
  isGstBill: boolean;
  customer?: any;
}) => {
  let subtotal = 0;
  let totalTax = 0;
  const processedItems: any[] = [];

  for (const item of args.items) {
    const product = await Product.findById(item.productId);
    if (!product) throw new Error(`Product not found: ${item.productId}`);

    const quantity = Math.max(0, Number(item.quantity || 0));
    if (quantity <= 0) throw new Error(`Invalid quantity for ${product.name}`);

    const listPrice = (() => {
      if (args.pricingMode === 'customer') {
        const override = customerPriceForProduct(args.customer, String(product._id));
        if (override !== null && override > 0) return roundTo2(override);
      }
      return resolveBaseProductPrice({
        product,
        quantity,
        pricingMode: args.pricingMode,
        customerTier: String(args.customer?.pricingTier || '').trim(),
      });
    })();

    let unitPrice = Number(item.unitPrice ?? listPrice);
    const discountAmount = Number(item.discountAmount || 0);
    const discountPercentage = Number(item.discountPercentage || 0);
    if (discountAmount > 0) {
      unitPrice = Math.max(0, unitPrice - discountAmount);
    } else if (discountPercentage > 0) {
      unitPrice = Math.max(0, unitPrice - (unitPrice * discountPercentage) / 100);
    }

    const gstRate = args.isGstBill
      ? (typeof item.gstRate === 'number' ? Number(item.gstRate) : Number(product.gstRate || 0))
      : 0;
    const taxType = String((item.taxType || (product as any).taxType || 'gst')).toLowerCase() === 'vat' ? 'vat' : 'gst';
    const lineBase = roundTo2(unitPrice * quantity);

    let taxableValue = 0;
    let gstAmount = 0;
    let lineTotal = 0;

    if (!args.isGstBill) {
      taxableValue = lineBase;
      lineTotal = lineBase;
    } else if (args.taxMode === 'inclusive') {
      taxableValue = roundTo2(lineBase * (100 / (100 + gstRate)));
      gstAmount = roundTo2(lineBase - taxableValue);
      lineTotal = lineBase;
    } else {
      taxableValue = lineBase;
      gstAmount = roundTo2((taxableValue * gstRate) / 100);
      lineTotal = roundTo2(taxableValue + gstAmount);
    }

    processedItems.push({
      productId: String(product._id),
      productName: product.name,
      sku: product.sku,
      itemType: normalizeProductItemType((product as any).itemType),
      quantity,
      unitPrice: roundTo2(unitPrice),
      listPrice: roundTo2(listPrice),
      discountAmount: roundTo2(discountAmount),
      discountPercentage: roundTo2(discountPercentage),
      gstRate: roundTo2(gstRate),
      taxType,
      taxableValue: roundTo2(taxableValue),
      gstAmount: roundTo2(gstAmount),
      lineTotal: roundTo2(lineTotal),
    });

    subtotal += taxableValue;
    totalTax += gstAmount;
  }

  return {
    processedItems,
    subtotal: roundTo2(subtotal),
    totalGst: roundTo2(totalTax),
    totalAmount: roundTo2(subtotal + totalTax),
  };
};

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q, status, customerId, skip = 0, limit = 50, sortBy = 'updatedAt', sortDir = 'desc' } = req.query;
    const filter: any = {};

    if (status) filter.quoteStatus = normalizeQuoteStatus(status);
    if (customerId) filter.customerId = String(customerId);
    if (q) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { quoteNumber: regex },
        { quoteGroupCode: regex },
        { customerName: regex },
        { customerPhone: regex },
        { customerEmail: regex },
        { contactPerson: regex },
      ];
    }

    const rows = await Quote.find(filter)
      .sort(buildQuoteSort(sortBy, sortDir))
      .skip(Math.max(0, Number(skip) || 0))
      .limit(Math.max(1, Number(limit) || 50));
    const total = await Quote.countDocuments(filter);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        skip: Math.max(0, Number(skip) || 0),
        limit: Math.max(1, Number(limit) || 50),
        sortBy: String(sortBy || 'updatedAt'),
        sortDir: String(sortDir || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch quotations' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      items,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      contactPerson,
      contactRole,
      validUntil,
      notes,
      quoteStatus = 'draft',
      pricingMode = 'retail',
      taxMode = 'exclusive',
      isGstBill = true,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Quotation must contain at least one item' });
    }

    const customer = await loadCustomerForQuote({ customerId, customerName, customerPhone, customerEmail });
    const pricingModeValue =
      String(pricingMode) === 'wholesale' || String(pricingMode) === 'customer' ? String(pricingMode) as any : 'retail';
    const built = await buildQuoteItems({
      items,
      pricingMode: pricingModeValue,
      taxMode: String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive',
      isGstBill: Boolean(isGstBill),
      customer,
    });

    const quoteNumber = await reserveUniqueQuoteNumber();
    const validUntilDate = validUntil ? new Date(validUntil) : undefined;
    const quote = await Quote.create({
      quoteNumber,
      quoteGroupCode: quoteNumber,
      version: 1,
      quoteStatus: normalizeQuoteStatus(quoteStatus),
      validUntil: validUntilDate && !Number.isNaN(validUntilDate.getTime()) ? validUntilDate : undefined,
      pricingMode: pricingModeValue,
      taxMode: String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive',
      isGstBill: Boolean(isGstBill),
      customerId: customer?._id?.toString() || undefined,
      customerCode: customer?.customerCode || undefined,
      customerName: customer?.name || String(customerName || '').trim() || 'Walk-in Customer',
      customerPhone: customer?.phone || normalizePhone(customerPhone) || undefined,
      customerEmail: customer?.email || normalizeEmail(customerEmail) || undefined,
      contactPerson: String(contactPerson || '').trim(),
      contactRole: String(contactRole || '').trim(),
      items: built.processedItems,
      subtotal: built.subtotal,
      totalGst: built.totalGst,
      totalAmount: built.totalAmount,
      notes: String(notes || '').trim(),
      createdBy: req.userId,
      updatedBy: req.userId,
    });

    await writeAuditLog({
      module: 'quotes',
      action: 'quote_created',
      entityType: 'quote',
      entityId: quote._id.toString(),
      referenceNo: quote.quoteNumber,
      userId: req.userId,
      after: quote.toObject(),
    });

    res.status(201).json({ success: true, data: quote, message: 'Quotation created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create quotation' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch quotation' });
  }
});

router.get('/:id/versions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id).select('quoteGroupCode quoteNumber');
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });
    const rows = await Quote.find({ quoteGroupCode: quote.quoteGroupCode }).sort({ version: -1, createdAt: -1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch quotation versions' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });
    if (quote.quoteStatus === 'converted') {
      return res.status(400).json({ success: false, error: 'Converted quotation cannot be edited' });
    }

    const {
      items,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      contactPerson,
      contactRole,
      validUntil,
      notes,
      quoteStatus = quote.quoteStatus,
      pricingMode = quote.pricingMode || 'retail',
      taxMode = quote.taxMode || 'exclusive',
      isGstBill = quote.isGstBill !== false,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Quotation must contain at least one item' });
    }

    const customer = await loadCustomerForQuote({ customerId, customerName, customerPhone, customerEmail });
    const pricingModeValue =
      String(pricingMode) === 'wholesale' || String(pricingMode) === 'customer' ? String(pricingMode) as any : 'retail';
    const built = await buildQuoteItems({
      items,
      pricingMode: pricingModeValue,
      taxMode: String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive',
      isGstBill: Boolean(isGstBill),
      customer,
    });

    const validUntilDate = validUntil ? new Date(validUntil) : undefined;
    quote.quoteStatus = normalizeQuoteStatus(quoteStatus);
    quote.validUntil = validUntilDate && !Number.isNaN(validUntilDate.getTime()) ? validUntilDate : undefined;
    quote.pricingMode = pricingModeValue;
    quote.taxMode = String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive';
    quote.isGstBill = Boolean(isGstBill);
    quote.customerId = customer?._id?.toString() || undefined;
    quote.customerCode = customer?.customerCode || undefined;
    quote.customerName = customer?.name || String(customerName || '').trim() || 'Walk-in Customer';
    quote.customerPhone = customer?.phone || normalizePhone(customerPhone) || undefined;
    quote.customerEmail = customer?.email || normalizeEmail(customerEmail) || undefined;
    quote.contactPerson = String(contactPerson || '').trim();
    quote.contactRole = String(contactRole || '').trim();
    quote.items = built.processedItems as any;
    quote.subtotal = built.subtotal;
    quote.totalGst = built.totalGst;
    quote.totalAmount = built.totalAmount;
    quote.notes = String(notes || '').trim();
    quote.updatedBy = req.userId;
    await quote.save();

    await writeAuditLog({
      module: 'quotes',
      action: 'quote_updated',
      entityType: 'quote',
      entityId: quote._id.toString(),
      referenceNo: quote.quoteNumber,
      userId: req.userId,
      after: quote.toObject(),
    });

    res.json({ success: true, data: quote, message: 'Quotation updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update quotation' });
  }
});

router.post('/:id/revise', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });

    const quoteNumber = await reserveUniqueQuoteNumber();
    const revised = await Quote.create({
      quoteNumber,
      quoteGroupCode: quote.quoteGroupCode || quote.quoteNumber,
      version: Number(quote.version || 1) + 1,
      sourceQuoteId: quote._id.toString(),
      quoteStatus: 'draft',
      validUntil: quote.validUntil,
      pricingMode: quote.pricingMode || 'retail',
      taxMode: quote.taxMode || 'exclusive',
      isGstBill: quote.isGstBill !== false,
      customerId: quote.customerId,
      customerCode: quote.customerCode,
      customerName: quote.customerName,
      customerPhone: quote.customerPhone,
      customerEmail: quote.customerEmail,
      contactPerson: quote.contactPerson,
      contactRole: quote.contactRole,
      items: quote.items,
      subtotal: quote.subtotal,
      totalGst: quote.totalGst,
      totalAmount: quote.totalAmount,
      notes: quote.notes,
      createdBy: req.userId,
      updatedBy: req.userId,
    });

    await writeAuditLog({
      module: 'quotes',
      action: 'quote_revised',
      entityType: 'quote',
      entityId: revised._id.toString(),
      referenceNo: revised.quoteNumber,
      userId: req.userId,
      metadata: {
        sourceQuoteId: quote._id.toString(),
        sourceQuoteNumber: quote.quoteNumber,
      },
      after: revised.toObject(),
    });

    res.status(201).json({ success: true, data: revised, message: 'Quotation revision created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to revise quotation' });
  }
});

router.post('/:id/approve', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });

    const approvedByName = String(req.body?.approvedByName || '').trim();
    if (!approvedByName) {
      return res.status(400).json({ success: false, error: 'Approved by name is required' });
    }

    quote.quoteStatus = 'approved';
    quote.approval = {
      approvedByName,
      approvedAt: new Date(),
      method: String(req.body?.method || 'digital') === 'manual' ? 'manual' : 'digital',
      notes: String(req.body?.notes || '').trim(),
    } as any;
    quote.updatedBy = req.userId;
    await quote.save();

    await writeAuditLog({
      module: 'quotes',
      action: 'quote_approved',
      entityType: 'quote',
      entityId: quote._id.toString(),
      referenceNo: quote.quoteNumber,
      userId: req.userId,
      metadata: quote.approval as any,
    });

    res.json({ success: true, data: quote, message: 'Quotation approved digitally' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to approve quotation' });
  }
});

router.post('/:id/convert', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });
    if (quote.convertedSaleId) {
      return res.status(400).json({ success: false, error: 'Quotation already converted to invoice' });
    }

    const invoiceType = String(req.body?.invoiceType || 'cash').trim().toLowerCase() === 'credit' ? 'credit' : 'cash';
    const saleNumber = await reserveUniqueSaleNumber();
    const invoiceNumber = await reserveUniqueInvoiceNumber();
    const dueDate = invoiceType === 'credit' ? new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)) : undefined;
    const totalAmount = Number(quote.totalAmount || 0);

    const sale = await Sale.create({
      saleNumber,
      invoiceNumber,
      userId: req.userId || req.body?.userId,
      invoiceType,
      invoiceStatus: 'draft',
      isLocked: false,
      pricingMode: quote.pricingMode || 'retail',
      taxMode: quote.taxMode || 'exclusive',
      isGstBill: quote.isGstBill !== false,
      items: quote.items.map((item: any) => ({
        ...item,
        itemType: item?.itemType || 'inventory',
      })),
      subtotal: Number(quote.subtotal || 0),
      totalGst: Number(quote.totalGst || 0),
      grossTotal: totalAmount,
      roundOffAmount: 0,
      totalAmount,
      paymentMethod: 'cash',
      paymentStatus: invoiceType === 'credit' ? 'pending' : 'completed',
      saleStatus: 'draft',
      outstandingAmount: invoiceType === 'credit' ? totalAmount : 0,
      creditAppliedAmount: 0,
      dueDate,
      customerId: quote.customerId || undefined,
      customerCode: quote.customerCode || undefined,
      customerName: quote.customerName || 'Walk-in Customer',
      customerPhone: quote.customerPhone || undefined,
      customerEmail: quote.customerEmail || undefined,
      notes: quote.notes || `Converted from quotation ${quote.quoteNumber}`,
    });

    quote.quoteStatus = 'converted';
    quote.convertedSaleId = sale._id.toString();
    quote.convertedSaleNumber = sale.invoiceNumber || sale.saleNumber;
    quote.updatedBy = req.userId;
    await quote.save();

    await writeAuditLog({
      module: 'quotes',
      action: 'quote_converted',
      entityType: 'quote',
      entityId: quote._id.toString(),
      referenceNo: quote.quoteNumber,
      userId: req.userId,
      metadata: {
        convertedSaleId: sale._id.toString(),
        convertedSaleNumber: sale.invoiceNumber || sale.saleNumber,
      },
    });

    res.json({
      success: true,
      message: 'Quotation converted to draft invoice',
      data: {
        quote,
        sale,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to convert quotation' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await Quote.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Quotation not found' });
    if (quote.quoteStatus === 'converted') {
      return res.status(400).json({ success: false, error: 'Converted quotation cannot be deleted' });
    }

    await Quote.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Quotation deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete quotation' });
  }
});

export default router;
