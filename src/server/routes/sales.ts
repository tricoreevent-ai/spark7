import { Router, Response } from 'express';
import { Sale } from '../models/Sale.js';
import { Product } from '../models/Product.js';
import { Customer } from '../models/Customer.js';
import { MemberSubscription } from '../models/MemberSubscription.js';
import { User } from '../models/User.js';
import { ReceiptVoucher } from '../models/ReceiptVoucher.js';
import { CreditNote } from '../models/CreditNote.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { generateNumber } from '../services/numbering.js';
import { recalculateCreditNoteStatus } from '../services/creditNotes.js';
import { postCustomerLedgerEntry } from '../services/customerLedger.js';
import { maxDiscountForRole } from '../services/discountPolicy.js';
import { normalizeProductItemType, productRequiresStock, resolveBaseProductPrice } from '../services/salesPricing.js';
import { writeAuditLog } from '../services/audit.js';
import { adjustBatchForStockChange, consumeStockFefo, postCogsJournal } from '../services/inventoryCosting.js';

const router = Router();

const allowedPaymentMethods = ['cash', 'card', 'upi', 'cheque', 'online', 'bank_transfer'] as const;
type AllowedPaymentMethod = (typeof allowedPaymentMethods)[number];

const roundTo2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizePhoneStrict = (value: any): string => {
  const phone = normalizePhone(value);
  return phone.length === 10 ? phone : '';
};
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const parseBoolean = (value: any, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};
const normalizeSerialNumbers = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((row: any) => String(row || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
};
const normalizeVariantValue = (value: any): string => String(value || '').trim();
const findVariantMatrixRow = (product: any, size: string, color: string) => {
  const rows = Array.isArray((product as any)?.variantMatrix) ? (product as any).variantMatrix : [];
  const normalizedSize = normalizeVariantValue(size).toLowerCase();
  const normalizedColor = normalizeVariantValue(color).toLowerCase();
  if (!normalizedSize && !normalizedColor) return null;
  return rows.find((row: any) => {
    const rowSize = normalizeVariantValue(row?.size).toLowerCase();
    const rowColor = normalizeVariantValue(row?.color).toLowerCase();
    return row?.isActive !== false && rowSize === normalizedSize && rowColor === normalizedColor;
  }) || null;
};
const isDuplicateKeyError = (error: any): boolean =>
  Number(error?.code) === 11000 || String(error?.message || '').includes('E11000');

const toSimpleSalesError = (error: any, fallback: string): string => {
  const message = String(error?.message || '');
  if (isDuplicateKeyError(error)) {
    if (message.includes('saleNumber')) {
      return 'Invoice number conflict happened. Please click Save/Create again.';
    }
    if (message.includes('invoiceNumber')) {
      return 'Invoice number already exists. Please use another invoice number.';
    }
    return 'Duplicate number found. Please try again.';
  }
  return message || fallback;
};

const normalizePaymentMethod = (value: any): AllowedPaymentMethod => {
  const method = String(value || 'cash').toLowerCase().trim();
  if (allowedPaymentMethods.includes(method as AllowedPaymentMethod)) return method as AllowedPaymentMethod;
  return 'cash';
};

const applyRoundOffIfNeeded = (grossTotal: number, applyRoundOff: boolean) => {
  if (!applyRoundOff) {
    return {
      grossTotal: roundTo2(grossTotal),
      roundOffAmount: 0,
      totalAmount: roundTo2(grossTotal),
    };
  }

  const rounded = Math.round(grossTotal);
  const roundOffAmount = roundTo2(rounded - grossTotal);
  return {
    grossTotal: roundTo2(grossTotal),
    roundOffAmount,
    totalAmount: roundTo2(rounded),
  };
};

const customerPriceForProduct = (customer: any, productId: string): number | null => {
  if (!customer?.priceOverrides || !Array.isArray(customer.priceOverrides)) return null;
  const row = customer.priceOverrides.find((item: any) => String(item.productId) === String(productId));
  if (!row) return null;
  return Number(row.unitPrice || 0);
};

const enforceDiscountPolicy = (
  userRole: string,
  itemDiscountPercentages: number[],
  billDiscountPercentage: number
): { allowed: boolean; maxAllowed: number; message?: string } => {
  const maxAllowed = maxDiscountForRole(userRole);
  const maxItem = Math.max(0, ...itemDiscountPercentages);

  if (maxItem > maxAllowed) {
    return {
      allowed: false,
      maxAllowed,
      message: `Item discount ${maxItem}% exceeds role limit ${maxAllowed}%`,
    };
  }
  if (billDiscountPercentage > maxAllowed) {
    return {
      allowed: false,
      maxAllowed,
      message: `Bill discount ${billDiscountPercentage}% exceeds role limit ${maxAllowed}%`,
    };
  }

  return { allowed: true, maxAllowed };
};

const hasItemLevelPriceChange = (items: any[] = []): boolean =>
  items.some((item: any) => {
    const listPrice = Number(item.listPrice || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const discountAmount = Number(item.discountAmount || 0);
    const discountPercentage = Number(item.discountPercentage || 0);
    return unitPrice !== listPrice || discountAmount > 0 || discountPercentage > 0;
  });

const processItems = async (
  items: any[],
  options: {
    validateStock: boolean;
    allowNegativeStock: boolean;
    pricingMode: 'retail' | 'wholesale' | 'customer';
    taxMode: 'inclusive' | 'exclusive';
    isGstBill: boolean;
    customer?: any;
  }
): Promise<{
  processedItems: any[];
  subtotal: number;
  totalTax: number;
  itemDiscountPercentages: number[];
  priceOverrideRequired: boolean;
}> => {
  let subtotal = 0;
  let totalTax = 0;
  let priceOverrideRequired = false;
  const itemDiscountPercentages: number[] = [];
  const processedItems: any[] = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

    const quantity = Number(item.quantity || 0);
    if (quantity <= 0) {
      throw new Error(`Invalid quantity for product ${product.name}`);
    }

    const expiryRequired = Boolean((product as any).expiryRequired);
    if (expiryRequired && !item.expiryDate) {
      throw new Error(`Expiry date is required for product ${product.name}`);
    }
      if (item.expiryDate) {
        const exp = new Date(item.expiryDate);
        if (exp.getTime() < Date.now()) {
          throw new Error(`Cannot sell expired stock for product ${product.name}`);
        }
      }

      const serialNumbers = normalizeSerialNumbers(item.serialNumbers);
      if (Boolean((product as any).serialNumberTracking)) {
        if (serialNumbers.length !== quantity) {
          throw new Error(`Enter exactly ${quantity} serial number(s) for product ${product.name}`);
        }
      }

      const variantSize = normalizeVariantValue(item.variantSize);
      const variantColor = normalizeVariantValue(item.variantColor);
      const variantRow = findVariantMatrixRow(product, variantSize, variantColor);
      if ((variantSize || variantColor) && !variantRow) {
        throw new Error(`Selected size/color combination is not configured for product ${product.name}`);
      }

      const listPrice = (() => {
        if (options.pricingMode === 'customer') {
          const customerPrice = customerPriceForProduct(options.customer, String(product._id));
          if (customerPrice !== null && customerPrice > 0) return customerPrice;
        }

        const basePrice = resolveBaseProductPrice({
          product,
          quantity,
          pricingMode: options.pricingMode,
          customerTier: String(options.customer?.pricingTier || '').trim(),
        });
        const variantPrice = Number((variantRow as any)?.price || 0);
        return variantPrice > 0 ? variantPrice : basePrice;
      })();

    let unitPrice = Number(item.unitPrice ?? listPrice);
    if (unitPrice < listPrice) {
      priceOverrideRequired = true;
    }

    const itemDiscountAmount = Number(item.discountAmount || 0);
    const itemDiscountPercentage = Number(item.discountPercentage || 0);
    itemDiscountPercentages.push(itemDiscountPercentage);

    if (itemDiscountAmount > 0) {
      unitPrice = Math.max(0, unitPrice - itemDiscountAmount);
    } else if (itemDiscountPercentage > 0) {
      unitPrice = Math.max(0, unitPrice - (unitPrice * itemDiscountPercentage) / 100);
    }

    if (options.validateStock && productRequiresStock(product)) {
      const available = Number(product.stock || 0);
      const allowNegative = options.allowNegativeStock || Boolean((product as any).allowNegativeStock);
      if (!allowNegative && available < quantity) {
        throw new Error(`Insufficient stock for product ${product.name} (Available: ${available})`);
      }
    }

    const gstRate = options.isGstBill
      ? (typeof item.gstRate === 'number' ? Number(item.gstRate) : Number(product.gstRate || 0))
      : 0;
    const taxType = String((item.taxType || (product as any).taxType || 'gst')).toLowerCase() === 'vat' ? 'vat' : 'gst';
    const lineBase = roundTo2(unitPrice * quantity);

    let taxableValue = 0;
    let taxAmount = 0;
    let lineTotal = 0;

    if (!options.isGstBill) {
      taxableValue = roundTo2(lineBase);
      taxAmount = 0;
      lineTotal = roundTo2(lineBase);
    } else if (options.taxMode === 'inclusive') {
      taxableValue = roundTo2(lineBase * (100 / (100 + gstRate)));
      taxAmount = roundTo2(lineBase - taxableValue);
      lineTotal = roundTo2(lineBase);
    } else {
      taxableValue = roundTo2(lineBase);
      taxAmount = roundTo2((taxableValue * gstRate) / 100);
      lineTotal = roundTo2(taxableValue + taxAmount);
    }

    const cgst = taxType === 'gst' ? roundTo2(taxAmount / 2) : 0;
    const sgst = taxType === 'gst' ? roundTo2(taxAmount / 2) : 0;
    const vatAmount = taxType === 'vat' ? taxAmount : 0;

      processedItems.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        category: (product as any).category || '',
        subcategory: (product as any).subcategory || '',
        itemType: normalizeProductItemType((product as any).itemType),
        hsnCode: item.hsnCode || product.hsnCode || '',
        batchNo: item.batchNo || '',
        expiryDate: item.expiryDate || undefined,
        serialNumbers,
        variantSize,
        variantColor,
        quantity,
        listPrice: roundTo2(listPrice),
      unitPrice: roundTo2(unitPrice),
      discountAmount: roundTo2(itemDiscountAmount),
      discountPercentage: roundTo2(itemDiscountPercentage),
      taxableValue: roundTo2(taxableValue),
      gstRate: roundTo2(gstRate),
      gstAmount: roundTo2(taxAmount),
      cgstAmount: cgst,
      sgstAmount: sgst,
      taxType,
      vatAmount: roundTo2(vatAmount),
      lineTotal: roundTo2(lineTotal),
    });

    subtotal += taxableValue;
    totalTax += taxAmount;
  }

  return {
    processedItems,
    subtotal: roundTo2(subtotal),
    totalTax: roundTo2(totalTax),
    itemDiscountPercentages,
    priceOverrideRequired,
  };
};

const issueStockForSale = async (sale: any, items: any[], userId?: string) => {
  let totalCogs = 0;
  const issuedItems: any[] = [];

  for (const item of items) {
    const product = await Product.findById(item.productId).select('name sku itemType allowNegativeStock');
    if (!product || !productRequiresStock(product)) {
      issuedItems.push(item);
      continue;
    }

    const issue = await consumeStockFefo({
      productId: String(item.productId),
      quantity: Number(item.quantity || 0),
      allowNegative: Boolean((product as any).allowNegativeStock),
      referenceType: 'sale',
      referenceId: sale._id?.toString?.(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      createdBy: userId,
    });

    const cogsAmount = roundTo2(Number(issue.cogsValue || 0));
    totalCogs = roundTo2(totalCogs + cogsAmount);
    issuedItems.push({
      ...(item.toObject?.() || item),
      batchAllocations: issue.allocations || [],
      cogsAmount,
    });
  }

  if (totalCogs > 0) {
    await postCogsJournal({
      cogsValue: totalCogs,
      referenceType: 'sale',
      referenceId: sale._id?.toString?.(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      createdBy: userId,
      metadata: {
        saleNumber: sale.saleNumber,
        invoiceNumber: sale.invoiceNumber,
      },
    });
  }

  return { items: issuedItems, cogsValue: totalCogs };
};

const quantityMapFromItems = (items: any[] = []): Map<string, number> => {
  const map = new Map<string, number>();
  for (const item of items) {
    const productId = String(item.productId);
    const qty = Number(item.quantity || 0);
    map.set(productId, Number((Number(map.get(productId) || 0) + qty).toFixed(4)));
  }
  return map;
};

const createReceipt = async (input: {
  amount: number;
  mode: AllowedPaymentMethod;
  sale: any;
  customerId?: string;
  customerName?: string;
  createdBy?: string;
  notes?: string;
}) => {
  if (input.amount <= 0) return null;
  const voucherNumber = await generateNumber('receipt_voucher', { prefix: 'RV-', datePart: true, padTo: 5 });

  const receipt = await ReceiptVoucher.create({
    voucherNumber,
    customerId: input.customerId || undefined,
    customerName: input.customerName,
    entryDate: new Date(),
    amount: roundTo2(input.amount),
    unappliedAmount: 0,
    mode: input.mode,
    isAdvance: false,
    allocations: [
      {
        saleId: input.sale._id.toString(),
        saleNumber: input.sale.invoiceNumber || input.sale.saleNumber,
        amount: roundTo2(input.amount),
      },
    ],
    notes: input.notes,
    createdBy: input.createdBy,
  });

  return receipt;
};

const applyCreditNoteToSale = async (args: {
  sale: any;
  creditNoteId?: string;
  requestedAmount?: number;
  userId?: string;
}) => {
  const creditNoteId = String(args.creditNoteId || '').trim();
  if (!creditNoteId) return { applied: 0, creditNote: null };

  const note = await CreditNote.findById(creditNoteId);
  if (!note) {
    throw new Error('Credit note not found');
  }

  if (Number(note.balanceAmount || 0) <= 0) {
    throw new Error('Credit note has no available balance');
  }

  const requested = Number(args.requestedAmount || note.balanceAmount || 0);
  const available = Number(note.balanceAmount || 0);
  const applyOn = Math.min(
    Math.max(0, requested),
    available,
    Math.max(0, Number(args.sale.outstandingAmount || 0) || Number(args.sale.totalAmount || 0))
  );

  if (applyOn <= 0) return { applied: 0, creditNote: note };

  note.balanceAmount = roundTo2(available - applyOn);
  note.entries.push({
    type: 'adjustment',
    amount: applyOn,
    referenceSaleId: args.sale._id.toString(),
    note: `Adjusted against invoice ${args.sale.invoiceNumber || args.sale.saleNumber}`,
    byUserId: args.userId,
    createdAt: new Date(),
  } as any);
  note.status = recalculateCreditNoteStatus(note as any) as any;
  await note.save();

  args.sale.creditAppliedAmount = roundTo2(Number(args.sale.creditAppliedAmount || 0) + applyOn);
  args.sale.outstandingAmount = roundTo2(
    Math.max(0, Number(args.sale.outstandingAmount || 0) - applyOn)
  );
  if (Number(args.sale.outstandingAmount || 0) <= 0) {
    args.sale.paymentStatus = 'completed';
  }

  return { applied: applyOn, creditNote: note };
};

const postSaleFinancials = async (sale: any, opts: { userId?: string; paidAmount: number }) => {
  const paidAmount = roundTo2(Number(opts.paidAmount || 0));
  if (!sale.customerId) {
    return;
  }

  if (sale.invoiceType === 'credit' && Number(sale.totalAmount || 0) > 0) {
    await postCustomerLedgerEntry({
      customerId: sale.customerId,
      entryType: 'invoice',
      referenceType: 'sale',
      referenceId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      narration: 'Invoice posted',
      debit: Number(sale.totalAmount || 0),
      credit: 0,
      dueDate: sale.dueDate || undefined,
      createdBy: opts.userId,
    });
  }

  if (paidAmount > 0) {
    await createReceipt({
      amount: paidAmount,
      mode: normalizePaymentMethod(sale.paymentMethod),
      sale,
      customerId: sale.customerId || undefined,
      customerName: sale.customerName,
      createdBy: opts.userId,
      notes: 'Invoice payment',
    });

    await postCustomerLedgerEntry({
      customerId: sale.customerId,
      entryType: 'payment',
      referenceType: 'sale',
      referenceId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      narration: 'Payment received against invoice',
      debit: 0,
      credit: paidAmount,
      createdBy: opts.userId,
    });
  }
};

const getRequestUserRole = async (userId?: string): Promise<string> => {
  if (!userId) return 'receptionist';
  const user = await User.findById(userId);
  return String(user?.role || 'receptionist');
};

const resolveCustomer = async (body: {
  customerId?: any;
  customerName?: any;
  customerPhone?: any;
  customerEmail?: any;
  customerAddress?: any;
  createdBy?: string;
}) => {
  const normalizedPhone = normalizePhoneStrict(body.customerPhone);
  const normalizedEmail = normalizeEmail(body.customerEmail);
  const normalizedName = String(body.customerName || '').trim();
  const normalizedAddress = String(body.customerAddress || '').trim();

  if (body.customerId) {
    const customer = await Customer.findById(body.customerId);
    if (!customer) throw new Error('Customer not found');
    let changed = false;
    if (normalizedPhone && customer.phone !== normalizedPhone) {
      customer.phone = normalizedPhone;
      changed = true;
    }
    if (normalizedEmail && customer.email !== normalizedEmail) {
      customer.email = normalizedEmail;
      changed = true;
    }
    if (normalizedName && customer.name !== normalizedName) {
      customer.name = normalizedName;
      changed = true;
    }
    if (normalizedAddress && customer.address !== normalizedAddress) {
      customer.address = normalizedAddress;
      changed = true;
    }
    if (changed) await customer.save();
    return customer;
  }

  if (!normalizedPhone) return null;

  const byPhone = await Customer.findOne({ phone: normalizedPhone }).sort({ updatedAt: -1, createdAt: -1 });
  if (byPhone) {
    let changed = false;
    if (normalizedName && byPhone.name !== normalizedName) {
      byPhone.name = normalizedName;
      changed = true;
    }
    if (normalizedEmail && !byPhone.email) {
      byPhone.email = normalizedEmail;
      changed = true;
    }
    if (normalizedAddress && byPhone.address !== normalizedAddress) {
      byPhone.address = normalizedAddress;
      changed = true;
    }
    if (changed) await byPhone.save();
    return byPhone;
  }

  const member = normalizedPhone
    ? await MemberSubscription.findOne({ phone: normalizedPhone })
      .select('memberName fullName email')
      .sort({ updatedAt: -1, createdAt: -1 })
    : null;
  const memberName = String(member?.memberName || member?.fullName || '').trim();
  const memberEmail = normalizeEmail(member?.email);
  const finalName = normalizedName || memberName || (normalizedPhone ? `Customer ${normalizedPhone}` : '');
  const finalEmail = normalizedEmail || memberEmail || '';

  if (!normalizedPhone) return null;

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  const created = await Customer.create({
    customerCode,
    name: finalName,
    phone: normalizedPhone,
    email: finalEmail || undefined,
    address: normalizedAddress || undefined,
    accountType: 'cash',
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    outstandingBalance: 0,
    createdBy: body.createdBy,
  });
  return created;
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

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      items,
      paymentMethod,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      notes,
      discountAmount,
      discountPercentage,
      invoiceType = 'cash',
      invoiceStatus = 'posted',
      invoiceNumber,
      autoInvoiceNumber = true,
      applyRoundOff = false,
      paidAmount,
      customerId,
      customerCode,
      pricingMode = 'retail',
      taxMode = 'exclusive',
      isGstBill = true,
      dueDate,
      creditDays,
      allowNegativeStock = false,
      allowCreditLimitOverride = false,
      overrideApprovedBy,
      creditNoteId,
      creditNoteAmount,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Sales must have at least one item' });
    }

    const normalizedCustomerPhone = normalizePhoneStrict(customerPhone);
    if (!normalizedCustomerPhone) {
      return res.status(400).json({ success: false, error: 'A valid 10-digit customer phone number is required' });
    }

    const userRole = await getRequestUserRole(req.userId);
    const normalizedInvoiceType = String(invoiceType || 'cash').toLowerCase() === 'credit' ? 'credit' : 'cash';
    const normalizedInvoiceStatus = String(invoiceStatus || 'posted').toLowerCase() === 'draft' ? 'draft' : 'posted';
    const shouldPost = normalizedInvoiceStatus === 'posted';

    const customer = await resolveCustomer({
      customerId,
      customerName,
      customerPhone: normalizedCustomerPhone,
      customerEmail,
      customerAddress,
      createdBy: req.userId,
    });
    if (!customer) {
      return res.status(400).json({ success: false, error: 'Customer could not be created from the provided phone number' });
    }
    if (customer?.isBlocked) {
      return res.status(403).json({ success: false, error: 'Customer account is blocked for billing' });
    }

    const manualInvoiceNumber = String(invoiceNumber || '').trim();
    if (manualInvoiceNumber) {
      const existingByInvoice = await Sale.findOne({ invoiceNumber: manualInvoiceNumber });
      if (existingByInvoice) {
        return res.status(409).json({ success: false, error: 'Invoice number already exists' });
      }
    }

    const finalPricingMode =
      String(pricingMode) === 'wholesale' || String(pricingMode) === 'customer' ? String(pricingMode) : 'retail';
    const finalTaxMode = String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive';
    const finalIsGstBill = parseBoolean(isGstBill, true);

    const { processedItems, subtotal, totalTax, itemDiscountPercentages, priceOverrideRequired } = await processItems(items, {
      validateStock: shouldPost,
      allowNegativeStock: Boolean(allowNegativeStock),
      pricingMode: finalPricingMode as any,
      taxMode: finalTaxMode as any,
      isGstBill: finalIsGstBill,
      customer,
    });

    const parsedDiscountAmount = Number(discountAmount || 0);
    const parsedDiscountPercentage = Number(discountPercentage || 0);
    const policy = enforceDiscountPolicy(userRole, itemDiscountPercentages, parsedDiscountPercentage);
    const requiresApproval = !policy.allowed || priceOverrideRequired;

    if (requiresApproval && !overrideApprovedBy) {
      return res.status(403).json({
        success: false,
        error: policy.message || 'Price override approval is required before posting this invoice',
        data: { requiresApproval: true, maxDiscountAllowed: policy.maxAllowed },
      });
    }

    let grossTotal = subtotal + totalTax;
    if (parsedDiscountAmount > 0) {
      grossTotal -= parsedDiscountAmount;
    } else if (parsedDiscountPercentage > 0) {
      grossTotal -= (grossTotal * parsedDiscountPercentage) / 100;
    }
    if (grossTotal < 0) grossTotal = 0;

    const totals = applyRoundOffIfNeeded(grossTotal, Boolean(applyRoundOff));

    const paid = Number(paidAmount ?? (normalizedInvoiceType === 'credit' ? 0 : totals.totalAmount));
    let outstandingAmount = normalizedInvoiceType === 'credit'
      ? Math.max(0, totals.totalAmount - Math.max(0, paid))
      : 0;

    let finalDueDate: Date | undefined;
    if (normalizedInvoiceType === 'credit') {
      if (dueDate) {
        finalDueDate = new Date(dueDate);
      } else {
        const d = new Date();
        const days = Number(creditDays ?? customer?.creditDays ?? 0);
        d.setDate(d.getDate() + Math.max(days, 0));
        finalDueDate = d;
      }
    }

    if (normalizedInvoiceType === 'credit' && customer) {
      const projected = Number(customer.outstandingBalance || 0) + outstandingAmount;
      if (Number(customer.creditLimit || 0) > 0 && projected > Number(customer.creditLimit) && !allowCreditLimitOverride) {
        customer.isBlocked = true;
        await customer.save();
        return res.status(400).json({
          success: false,
          error: `Credit limit exceeded for customer. Limit: ${customer.creditLimit}, projected: ${roundTo2(projected)}. Customer has been auto-blocked.`,
        });
      }
    }

    let sale: any = null;
    let lastDuplicateError: any = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const generatedSaleNumber = await reserveUniqueSaleNumber();
      const generatedInvoiceNumber = manualInvoiceNumber
        || (autoInvoiceNumber ? await reserveUniqueInvoiceNumber() : '');

      sale = new Sale({
        saleNumber: generatedSaleNumber,
        invoiceNumber: generatedInvoiceNumber || generatedSaleNumber,
        userId: req.userId || req.body.userId,
        invoiceType: normalizedInvoiceType,
        invoiceStatus: normalizedInvoiceStatus,
        isLocked: shouldPost,
        pricingMode: finalPricingMode,
        taxMode: finalTaxMode,
        isGstBill: finalIsGstBill,
        items: processedItems,
        subtotal,
        totalGst: totalTax,
        grossTotal: totals.grossTotal,
        roundOffAmount: totals.roundOffAmount,
        totalAmount: totals.totalAmount,
        paymentMethod: normalizePaymentMethod(paymentMethod),
        paymentStatus: outstandingAmount > 0 ? 'pending' : 'completed',
        saleStatus: shouldPost ? 'completed' : 'draft',
        outstandingAmount,
        creditAppliedAmount: 0,
        dueDate: finalDueDate,
        customerId: customer?._id?.toString() || undefined,
        customerCode: customer?.customerCode || customerCode,
        customerName: customer?.name || customerName || `Customer ${normalizedCustomerPhone}`,
        customerPhone: customer?.phone || normalizedCustomerPhone,
        customerEmail: customer?.email || normalizeEmail(customerEmail) || undefined,
        notes,
        discountAmount: parsedDiscountAmount || 0,
        discountPercentage: parsedDiscountPercentage || 0,
        priceOverrideRequired: requiresApproval && !overrideApprovedBy,
        priceOverrideApprovedBy: overrideApprovedBy || undefined,
        postedAt: shouldPost ? new Date() : undefined,
        postedBy: shouldPost ? req.userId : undefined,
      });

      try {
        await sale.save();
        lastDuplicateError = null;
        break;
      } catch (saveError: any) {
        if (!isDuplicateKeyError(saveError)) {
          throw saveError;
        }

        // Manual invoice number conflicts should be fixed by user input.
        if (manualInvoiceNumber && String(saveError?.message || '').includes('invoiceNumber')) {
          throw new Error('Invoice number already exists. Please use another invoice number.');
        }

        lastDuplicateError = saveError;
      }
    }

    if (!sale?._id) {
      if (lastDuplicateError) {
        throw new Error('Could not generate a unique invoice number. Please try again in a few seconds.');
      }
      throw new Error('Could not save invoice. Please try again.');
    }

    if (shouldPost) {
      const creditApplied = await applyCreditNoteToSale({
        sale,
        creditNoteId: creditNoteId ? String(creditNoteId) : undefined,
        requestedAmount: Number(creditNoteAmount || 0),
        userId: req.userId,
      });

      const stockIssue = await issueStockForSale(sale, processedItems, req.userId);
      sale.items = stockIssue.items;
      await postSaleFinancials(sale, { userId: req.userId, paidAmount: paid });
      if (creditApplied.applied > 0 && sale.customerId) {
        await postCustomerLedgerEntry({
          customerId: sale.customerId,
          entryType: 'credit_note',
          referenceType: 'credit_note',
          referenceId: String(creditNoteId),
          referenceNo: creditApplied.creditNote?.noteNumber,
          narration: `Credit note adjusted against invoice ${sale.invoiceNumber || sale.saleNumber}`,
          debit: 0,
          credit: creditApplied.applied,
          createdBy: req.userId,
        });
      }
      await sale.save();
    }

    await writeAuditLog({
      module: 'sales',
      action: shouldPost ? 'invoice_posted' : 'invoice_draft_created',
      entityType: 'sale',
      entityId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      userId: req.userId,
      after: sale.toObject(),
    });

    if (
      hasItemLevelPriceChange(processedItems) ||
      parsedDiscountAmount > 0 ||
      parsedDiscountPercentage > 0 ||
      requiresApproval ||
      Boolean(overrideApprovedBy)
    ) {
      await writeAuditLog({
        module: 'price_changes',
        action: 'invoice_pricing_applied',
        entityType: 'sale',
        entityId: sale._id.toString(),
        referenceNo: sale.invoiceNumber || sale.saleNumber,
        userId: req.userId,
        metadata: {
          invoiceStatus: sale.invoiceStatus,
          billDiscountAmount: parsedDiscountAmount,
          billDiscountPercentage: parsedDiscountPercentage,
          requiresOverrideApproval: requiresApproval,
          overrideApprovedBy: overrideApprovedBy || undefined,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: shouldPost ? 'Invoice posted successfully' : 'Draft invoice created',
      data: sale,
    });
  } catch (error: any) {
    const msg = toSimpleSalesError(error, 'Failed to create invoice');
    const raw = String(error?.message || '');
    const status = isDuplicateKeyError(error)
      || raw.includes('already exists')
      || raw.includes('unique invoice number')
      ? 409
      : raw.includes('Insufficient stock')
      || raw.includes('Product not found')
      || raw.includes('Invalid quantity')
      || raw.includes('required')
      ? 400
      : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.post('/:id/approve-price-override', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const approverRole = await getRequestUserRole(req.userId);
    if (!['admin', 'manager'].includes(approverRole)) {
      return res.status(403).json({ success: false, error: 'Only admin/manager can approve price override' });
    }

    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

    sale.priceOverrideRequired = false;
    sale.priceOverrideApprovedBy = req.userId;
    await sale.save();

    await writeAuditLog({
      module: 'price_changes',
      action: 'price_override_approved',
      entityType: 'sale',
      entityId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      userId: req.userId,
      metadata: {
        approvedBy: req.userId,
      },
      after: sale.toObject(),
    });

    res.json({ success: true, data: sale, message: 'Price override approved' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to approve price override' });
  }
});

router.post('/:id/post', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    if (sale.isLocked || sale.invoiceStatus === 'posted') {
      return res.status(400).json({ success: false, error: 'Invoice already posted/locked' });
    }

    if (sale.priceOverrideRequired && !sale.priceOverrideApprovedBy) {
      return res.status(400).json({ success: false, error: 'Price override approval pending' });
    }

    for (const item of sale.items as any[]) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ success: false, error: `Product not found: ${item.productId}` });
      if (!productRequiresStock(product)) continue;

      const allowNegative = Boolean((product as any).allowNegativeStock);
      if (!allowNegative && Number(product.stock || 0) < Number(item.quantity || 0)) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product ${product.name} (Available: ${product.stock})`,
        });
      }
    }

    const stockIssue = await issueStockForSale(sale, sale.items as any[], req.userId);
    sale.items = stockIssue.items;

    sale.invoiceStatus = 'posted';
    sale.saleStatus = 'completed';
    sale.isLocked = true;
    sale.postedAt = new Date();
    sale.postedBy = req.userId;

    if (sale.invoiceType === 'cash') {
      sale.paymentStatus = 'completed';
      sale.outstandingAmount = 0;
    } else {
      sale.paymentStatus = Number(sale.outstandingAmount || 0) > 0 ? 'pending' : 'completed';
    }

    await sale.save();
    const paidAmount = Math.max(0, Number(sale.totalAmount || 0) - Number(sale.outstandingAmount || 0));
    await postSaleFinancials(sale, { userId: req.userId, paidAmount });

    await writeAuditLog({
      module: 'sales',
      action: 'invoice_posted',
      entityType: 'sale',
      entityId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      userId: req.userId,
      after: sale.toObject(),
    });

    res.json({ success: true, message: 'Draft posted and invoice locked', data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to post draft' });
  }
});

router.post('/:id/payments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    if (sale.invoiceStatus !== 'posted') return res.status(400).json({ success: false, error: 'Invoice is not posted' });

    const { amount, paymentMethod = 'cash', notes } = req.body;
    const payAmount = Number(amount || 0);
    if (payAmount <= 0) return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
    if (Number(sale.outstandingAmount || 0) <= 0) {
      return res.status(400).json({ success: false, error: 'No outstanding balance for this invoice' });
    }

    const usable = Math.min(payAmount, Number(sale.outstandingAmount || 0));
    sale.outstandingAmount = roundTo2(Number(sale.outstandingAmount || 0) - usable);
    if (sale.outstandingAmount <= 0) {
      sale.outstandingAmount = 0;
      sale.paymentStatus = 'completed';
    } else {
      sale.paymentStatus = 'pending';
    }
    sale.paymentMethod = normalizePaymentMethod(paymentMethod);
    await sale.save();

    const receipt = await createReceipt({
      amount: usable,
      mode: normalizePaymentMethod(paymentMethod),
      sale,
      customerId: sale.customerId || undefined,
      customerName: sale.customerName,
      createdBy: req.userId,
      notes,
    });

    if (sale.customerId) {
      await postCustomerLedgerEntry({
        customerId: sale.customerId,
        entryType: 'payment',
        referenceType: 'receipt',
        referenceId: receipt?._id?.toString(),
        referenceNo: receipt?.voucherNumber,
        narration: `Payment received against invoice ${sale.invoiceNumber || sale.saleNumber}`,
        debit: 0,
        credit: usable,
        createdBy: req.userId,
      });
    }

    await writeAuditLog({
      module: 'sales',
      action: 'invoice_payment',
      entityType: 'sale',
      entityId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      userId: req.userId,
      metadata: { paymentAmount: usable, paymentMethod: sale.paymentMethod, receiptVoucher: receipt?.voucherNumber },
    });

    res.json({ success: true, data: { sale, receipt }, message: 'Payment recorded successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to record payment' });
  }
});

router.put('/:id/edit-posted', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    if (sale.invoiceStatus !== 'posted' || !sale.isLocked) {
      return res.status(400).json({ success: false, error: 'Only posted invoices can be edited here' });
    }

    const before = sale.toObject();
    const userRole = await getRequestUserRole(req.userId);
    const {
      items,
      notes,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      paymentMethod,
      discountAmount,
      discountPercentage,
      applyRoundOff = true,
      pricingMode = sale.pricingMode || 'retail',
      taxMode = sale.taxMode || 'exclusive',
      isGstBill = sale.isGstBill !== false,
      allowNegativeStock = false,
      overrideApprovedBy = sale.priceOverrideApprovedBy,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items are required to update invoice' });
    }

    const customer = await resolveCustomer({
      customerId: customerId || sale.customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      createdBy: req.userId,
    });
    if (customer?.isBlocked) {
      return res.status(403).json({ success: false, error: 'Customer account is blocked for billing' });
    }
    const { processedItems, subtotal, totalTax, itemDiscountPercentages, priceOverrideRequired } = await processItems(items, {
      validateStock: false,
      allowNegativeStock: true,
      pricingMode: String(pricingMode) === 'customer' || String(pricingMode) === 'wholesale' ? String(pricingMode) as any : 'retail',
      taxMode: String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive',
      isGstBill: parseBoolean(isGstBill, sale.isGstBill !== false),
      customer,
    });

    const oldQtyMap = quantityMapFromItems((sale.items as any[]) || []);
    const newQtyMap = quantityMapFromItems(processedItems);
    const allProductIds = Array.from(new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]));

    for (const productId of allProductIds) {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ success: false, error: `Product not found: ${productId}` });
      }
      if (!productRequiresStock(product)) continue;
      const oldQty = Number(oldQtyMap.get(productId) || 0);
      const newQty = Number(newQtyMap.get(productId) || 0);
      const allowNegative = Boolean(allowNegativeStock) || Boolean((product as any).allowNegativeStock);
      const availableForEdit = Number(product.stock || 0) + oldQty;
      if (!allowNegative && newQty > availableForEdit) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product ${product.name} (Available for edit: ${availableForEdit})`,
        });
      }
    }

    let grossTotal = subtotal + totalTax;
    const parsedDiscountAmount = Number(discountAmount || 0);
    const parsedDiscountPercentage = Number(discountPercentage || 0);
    const policy = enforceDiscountPolicy(userRole, itemDiscountPercentages, parsedDiscountPercentage);
    const requiresApproval = !policy.allowed || priceOverrideRequired;
    if (requiresApproval && !overrideApprovedBy) {
      return res.status(403).json({
        success: false,
        error: policy.message || 'Price override approval is required',
      });
    }

    if (parsedDiscountAmount > 0) grossTotal -= parsedDiscountAmount;
    else if (parsedDiscountPercentage > 0) grossTotal -= (grossTotal * parsedDiscountPercentage) / 100;
    if (grossTotal < 0) grossTotal = 0;
    const totals = applyRoundOffIfNeeded(grossTotal, Boolean(applyRoundOff));

    for (const productId of allProductIds) {
      const product = await Product.findById(productId).select('itemType');
      if (!product || !productRequiresStock(product)) continue;
      const oldQty = Number(oldQtyMap.get(productId) || 0);
      const newQty = Number(newQtyMap.get(productId) || 0);
      const delta = newQty - oldQty;
      if (delta !== 0) {
        await adjustBatchForStockChange({
          productId,
          deltaQuantity: -delta,
          referenceType: 'sale_edit',
          referenceId: sale._id.toString(),
          referenceNo: sale.invoiceNumber || sale.saleNumber,
          createdBy: req.userId,
        });
      }
    }

    const oldOutstanding = Number(sale.outstandingAmount || 0);
    const oldTotal = Number(sale.totalAmount || 0);
    const paidSoFar = Math.max(0, oldTotal - oldOutstanding);
    const newOutstanding = Math.max(0, totals.totalAmount - paidSoFar);

    sale.items = processedItems;
    sale.subtotal = subtotal;
    sale.totalGst = totalTax;
    sale.grossTotal = totals.grossTotal;
    sale.roundOffAmount = totals.roundOffAmount;
    sale.totalAmount = totals.totalAmount;
    sale.notes = notes;
    sale.customerId = customer?._id?.toString() || sale.customerId || undefined;
    sale.customerCode = customer?.customerCode || sale.customerCode;
    sale.customerName = customer?.name || customerName || sale.customerName || 'Walk-in Customer';
    sale.customerPhone = customer?.phone || normalizePhoneStrict(customerPhone) || sale.customerPhone;
    sale.customerEmail = customer?.email || normalizeEmail(customerEmail) || sale.customerEmail;
    sale.paymentMethod = normalizePaymentMethod(paymentMethod || sale.paymentMethod);
    sale.discountAmount = parsedDiscountAmount || 0;
    sale.discountPercentage = parsedDiscountPercentage || 0;
    sale.outstandingAmount = roundTo2(newOutstanding);
    sale.paymentStatus = newOutstanding > 0 ? 'pending' : 'completed';
    sale.pricingMode = String(pricingMode) === 'wholesale' || String(pricingMode) === 'customer' ? String(pricingMode) as any : 'retail';
    sale.taxMode = String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive';
    sale.isGstBill = parseBoolean(isGstBill, sale.isGstBill !== false);
    sale.priceOverrideRequired = requiresApproval && !overrideApprovedBy;
    sale.priceOverrideApprovedBy = overrideApprovedBy || undefined;

    await sale.save();

    await writeAuditLog({
      module: 'sales',
      action: 'invoice_posted_edited',
      entityType: 'sale',
      entityId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      userId: req.userId,
      metadata: {
        paidSoFar: roundTo2(paidSoFar),
        outstandingAmount: roundTo2(newOutstanding),
      },
      before,
      after: sale.toObject(),
    });

    if (
      hasItemLevelPriceChange(processedItems) ||
      hasItemLevelPriceChange(before.items as any[]) ||
      parsedDiscountAmount !== Number(before.discountAmount || 0) ||
      parsedDiscountPercentage !== Number(before.discountPercentage || 0)
    ) {
      await writeAuditLog({
        module: 'price_changes',
        action: 'invoice_posted_pricing_updated',
        entityType: 'sale',
        entityId: sale._id.toString(),
        referenceNo: sale.invoiceNumber || sale.saleNumber,
        userId: req.userId,
        metadata: {
          billDiscountAmount: parsedDiscountAmount,
          billDiscountPercentage: parsedDiscountPercentage,
          requiresOverrideApproval: requiresApproval,
          overrideApprovedBy: overrideApprovedBy || undefined,
        },
      });
    }

    res.json({ success: true, message: 'Posted invoice updated successfully', data: sale });
  } catch (error: any) {
    const msg = error?.message || 'Failed to update posted invoice';
    const status = msg.includes('Product not found') || msg.includes('Invalid quantity') || msg.includes('Insufficient stock') ? 400 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      status,
      paymentMethod,
      invoiceType,
      invoiceStatus,
      q,
      customerName,
      customerPhone,
      customerEmail,
      customerId,
      skip = 0,
      limit = 20,
    } = req.query;

    const filter: any = {};

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }

    if (status) filter.saleStatus = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (invoiceType) filter.invoiceType = invoiceType;
    if (invoiceStatus) filter.invoiceStatus = invoiceStatus;
    if (customerName) filter.customerName = { $regex: String(customerName), $options: 'i' };
    if (customerPhone) filter.customerPhone = { $regex: String(customerPhone), $options: 'i' };
    if (customerEmail) filter.customerEmail = { $regex: String(customerEmail), $options: 'i' };
    if (customerId) filter.customerId = String(customerId);
    if (typeof q === 'string' && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { saleNumber: regex },
        { invoiceNumber: regex },
        { customerName: regex },
        { customerPhone: regex },
        { customerEmail: regex },
      ];
    }

    const sales = await Sale.find(filter)
      .skip(Number(skip))
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Sale.countDocuments(filter);
    res.status(200).json({
      success: true,
      data: sales,
      pagination: { total, skip: Number(skip), limit: Number(limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get sales' });
  }
});

router.get('/customer/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { customerName, customerPhone, customerEmail, customerId, limit = 100 } = req.query;
    if (!customerId && !customerName && !customerPhone && !customerEmail) {
      return res.status(400).json({ success: false, error: 'Provide customerId or customerName or customerPhone or customerEmail' });
    }

    const filter: any = {};
    if (customerId) filter.customerId = String(customerId);
    if (customerName) filter.customerName = { $regex: String(customerName), $options: 'i' };
    if (customerPhone) filter.customerPhone = String(customerPhone);
    if (customerEmail) filter.customerEmail = String(customerEmail).toLowerCase();

    const rows = await Sale.find(filter).sort({ createdAt: -1 }).limit(Number(limit));
    const summary = rows.reduce(
      (acc, row: any) => {
        acc.totalInvoiced += Number(row.totalAmount || 0);
        acc.totalOutstanding += Number(row.outstandingAmount || 0);
        return acc;
      },
      { totalInvoiced: 0, totalOutstanding: 0 }
    );

    res.json({ success: true, data: { invoices: rows, summary } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load customer history' });
  }
});

router.get('/analytics/summary', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const matchStage: any = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate as string);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate as string);
    }

    const summary = await Sale.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalGst: { $sum: '$totalGst' },
          totalTransactions: { $sum: 1 },
          averageValue: { $avg: '$totalAmount' },
          totalRoundOff: { $sum: '$roundOffAmount' },
          totalOutstanding: { $sum: '$outstandingAmount' },
          totalCreditInvoices: { $sum: { $cond: [{ $eq: ['$invoiceType', 'credit'] }, 1, 0] } },
        },
      },
    ]);

    const paymentSummary = await Sale.aggregate([
      { $match: matchStage },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
    ]);

    res.json({
      success: true,
      data: {
        summary: summary[0] || {
          totalSales: 0,
          totalGst: 0,
          totalTransactions: 0,
          averageValue: 0,
          totalRoundOff: 0,
          totalOutstanding: 0,
          totalCreditInvoices: 0,
        },
        byPaymentMethod: paymentSummary,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get analytics' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    res.json({ success: true, data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to get sale' });
  }
});

router.get('/:id/print', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

    const format = String(req.query.format || 'a4').toLowerCase() === 'thermal' ? 'thermal' : 'a4';
    res.json({
      success: true,
      data: {
        format,
        invoice: sale,
        printableAt: new Date(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to prepare printable invoice' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });
    const before = sale.toObject();

    if (sale.isLocked || sale.invoiceStatus === 'posted') {
      return res.status(400).json({ success: false, error: 'Invoice is locked after posting and cannot be modified' });
    }

    const userRole = await getRequestUserRole(req.userId);
    const {
      items,
      notes,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      paymentMethod,
      discountAmount,
      discountPercentage,
      applyRoundOff = true,
      pricingMode = sale.pricingMode || 'retail',
      taxMode = sale.taxMode || 'exclusive',
      isGstBill = sale.isGstBill !== false,
      allowNegativeStock = false,
      overrideApprovedBy = sale.priceOverrideApprovedBy,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items are required to update draft' });
    }

    const customer = await resolveCustomer({
      customerId: customerId || sale.customerId,
      customerName,
      customerPhone,
      customerEmail,
      customerAddress,
      createdBy: req.userId,
    });
    if (customer?.isBlocked) {
      return res.status(403).json({ success: false, error: 'Customer account is blocked for billing' });
    }
    const { processedItems, subtotal, totalTax, itemDiscountPercentages, priceOverrideRequired } = await processItems(items, {
      validateStock: false,
      allowNegativeStock: Boolean(allowNegativeStock),
      pricingMode: String(pricingMode) === 'customer' || String(pricingMode) === 'wholesale' ? String(pricingMode) as any : 'retail',
      taxMode: String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive',
      isGstBill: parseBoolean(isGstBill, sale.isGstBill !== false),
      customer,
    });

    let grossTotal = subtotal + totalTax;
    const parsedDiscountAmount = Number(discountAmount || 0);
    const parsedDiscountPercentage = Number(discountPercentage || 0);
    const policy = enforceDiscountPolicy(userRole, itemDiscountPercentages, parsedDiscountPercentage);
    const requiresApproval = !policy.allowed || priceOverrideRequired;
    if (requiresApproval && !overrideApprovedBy) {
      return res.status(403).json({
        success: false,
        error: policy.message || 'Price override approval is required',
      });
    }

    if (parsedDiscountAmount > 0) grossTotal -= parsedDiscountAmount;
    else if (parsedDiscountPercentage > 0) grossTotal -= (grossTotal * parsedDiscountPercentage) / 100;
    if (grossTotal < 0) grossTotal = 0;
    const totals = applyRoundOffIfNeeded(grossTotal, Boolean(applyRoundOff));

    sale.items = processedItems;
    sale.subtotal = subtotal;
    sale.totalGst = totalTax;
    sale.grossTotal = totals.grossTotal;
    sale.roundOffAmount = totals.roundOffAmount;
    sale.totalAmount = totals.totalAmount;
    sale.notes = notes;
    sale.customerId = customer?._id?.toString() || sale.customerId || undefined;
    sale.customerCode = customer?.customerCode || sale.customerCode;
    sale.customerName = customer?.name || customerName || sale.customerName || 'Walk-in Customer';
    sale.customerPhone = customer?.phone || normalizePhoneStrict(customerPhone) || sale.customerPhone;
    sale.customerEmail = customer?.email || normalizeEmail(customerEmail) || sale.customerEmail;
    sale.paymentMethod = normalizePaymentMethod(paymentMethod || sale.paymentMethod);
    sale.discountAmount = parsedDiscountAmount || 0;
    sale.discountPercentage = parsedDiscountPercentage || 0;
    sale.outstandingAmount = sale.invoiceType === 'credit' ? totals.totalAmount : 0;
    sale.pricingMode = String(pricingMode) === 'wholesale' || String(pricingMode) === 'customer' ? String(pricingMode) as any : 'retail';
    sale.taxMode = String(taxMode) === 'inclusive' ? 'inclusive' : 'exclusive';
    sale.isGstBill = parseBoolean(isGstBill, sale.isGstBill !== false);
    sale.priceOverrideRequired = requiresApproval && !overrideApprovedBy;
    sale.priceOverrideApprovedBy = overrideApprovedBy || undefined;

    await sale.save();

    await writeAuditLog({
      module: 'sales',
      action: 'invoice_draft_updated',
      entityType: 'sale',
      entityId: sale._id.toString(),
      referenceNo: sale.invoiceNumber || sale.saleNumber,
      userId: req.userId,
      after: sale.toObject(),
    });

    if (
      hasItemLevelPriceChange(processedItems) ||
      hasItemLevelPriceChange(before.items as any[]) ||
      parsedDiscountAmount !== Number(before.discountAmount || 0) ||
      parsedDiscountPercentage !== Number(before.discountPercentage || 0)
    ) {
      await writeAuditLog({
        module: 'price_changes',
        action: 'invoice_pricing_updated',
        entityType: 'sale',
        entityId: sale._id.toString(),
        referenceNo: sale.invoiceNumber || sale.saleNumber,
        userId: req.userId,
        metadata: {
          billDiscountAmount: parsedDiscountAmount,
          billDiscountPercentage: parsedDiscountPercentage,
          requiresOverrideApproval: requiresApproval,
          overrideApprovedBy: overrideApprovedBy || undefined,
        },
        before: {
          items: before.items,
          discountAmount: before.discountAmount,
          discountPercentage: before.discountPercentage,
          totalAmount: before.totalAmount,
        },
        after: {
          items: sale.items,
          discountAmount: sale.discountAmount,
          discountPercentage: sale.discountPercentage,
          totalAmount: sale.totalAmount,
        },
      });
    }

    res.json({ success: true, message: 'Draft updated successfully', data: sale });
  } catch (error: any) {
    const msg = error?.message || 'Failed to update sale';
    const status = msg.includes('Product not found') || msg.includes('Invalid quantity') ? 400 : 500;
    res.status(status).json({ success: false, error: msg });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ success: false, error: 'Sale not found' });

    if (sale.isLocked || sale.invoiceStatus === 'posted') {
      return res.status(400).json({ success: false, error: 'Posted invoices cannot be deleted' });
    }

    await Sale.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Draft deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete sale' });
  }
});

export default router;
