import mongoose from 'mongoose';
import { computeCOGSFromLines } from './cogsReporting.js';
import { validateGstinLocally } from './gstCompliance.js';
import { buildInventoryValuationRows } from './inventoryCosting.js';
import { getDerivedBookEntriesUntil } from './treasury.js';
import { CashFloatCount } from '../models/CashFloatCount.js';
import { CreditNote } from '../models/CreditNote.js';
import { AccountingPayment } from '../models/AccountingPayment.js';
import { Customer } from '../models/Customer.js';
import { DayEndClosing } from '../models/DayEndClosing.js';
import { MemberSubscription } from '../models/MemberSubscription.js';
import { Product } from '../models/Product.js';
import { ReceiptVoucher } from '../models/ReceiptVoucher.js';
import { Return } from '../models/Return.js';
import { Sale } from '../models/Sale.js';
import { ShiftSchedule } from '../models/ShiftSchedule.js';
import { TreasuryAccount } from '../models/TreasuryAccount.js';
import { User } from '../models/User.js';

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const toNumber = (value: unknown): number => Number(value || 0);
const normalizeText = (value: unknown): string => String(value || '').trim();
const upper = (value: unknown): string => normalizeText(value).toUpperCase();
const validObjectIds = (values: string[]): string[] =>
  Array.from(new Set(values.filter((value) => mongoose.isValidObjectId(value))));
const safeDate = (value: unknown, fallback = new Date()): Date => {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
};
const toDateKey = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const toMonthKey = (value: Date): string => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
const fullNameOfUser = (row: any): string => {
  const first = normalizeText(row?.firstName);
  const last = normalizeText(row?.lastName);
  return [first, last].filter(Boolean).join(' ') || normalizeText(row?.email) || 'Unknown User';
};
const stateCodeFromGstin = (gstin?: string): string => {
  const validation = validateGstinLocally(gstin || '');
  return validation.isValid ? String(validation.stateCode || '') : '';
};
const POS_REPORT_EPOCH = new Date('2000-01-01T00:00:00.000Z');
const isRegisteredGstin = (gstin?: string): boolean => validateGstinLocally(gstin || '').isValid;
const invoiceClassification = (
  invoiceValue: number,
  isRegistered: boolean,
  isInterState: boolean
): 'b2b' | 'b2cl' | 'b2cs' => {
  if (isRegistered) return 'b2b';
  if (isInterState && invoiceValue > 250000) return 'b2cl';
  return 'b2cs';
};
const enumerateMonthKeys = (start: Date, end: Date): string[] => {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const limit = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= limit) {
    keys.push(toMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
};

interface PosSaleLine {
  saleId: string;
  saleNumber: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dateKey: string;
  monthKey: string;
  userId: string;
  cashierName: string;
  shiftName: string;
  paymentMethod: string;
  paymentChannelLabel: string;
  processorName: string;
  treasuryAccountName: string;
  customerId?: string;
  customerName: string;
  customerGstin?: string;
  isRegistered: boolean;
  placeOfSupply: string;
  isInterState: boolean;
  productId: string;
  productName: string;
  sku: string;
  category?: string;
  subcategory?: string;
  itemType: string;
  hsnCode: string;
  variantSize?: string;
  variantColor?: string;
  quantity: number;
  unitPrice: number;
  grossSalesAmount: number;
  lineDiscountAmount: number;
  invoiceDiscountAmount: number;
  discountAmount: number;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  gstTaxAmount: number;
  otherTaxAmount: number;
  taxAmount: number;
  totalAmount: number;
  cogsAmount: number;
  taxType: string;
  isNonGst: boolean;
}

interface PosInvoiceRow {
  saleId: string;
  saleNumber: string;
  invoiceNumber: string;
  invoiceDate: Date;
  dateKey: string;
  monthKey: string;
  userId: string;
  cashierName: string;
  shiftName: string;
  paymentMethod: string;
  paymentSplits?: Array<{ method: string; amount: number }>;
  paymentChannelLabel: string;
  processorName: string;
  treasuryAccountName: string;
  customerId?: string;
  customerName: string;
  customerGstin?: string;
  isRegistered: boolean;
  placeOfSupply: string;
  isInterState: boolean;
  classification: 'b2b' | 'b2cl' | 'b2cs';
  invoiceType: string;
  paymentStatus: string;
  saleStatus: string;
  grossSalesAmount: number;
  taxableValue: number;
  discountAmount: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalBeforeRoundOff: number;
  roundOffAmount: number;
  totalAmount: number;
  cogsAmount: number;
  outstandingAmount: number;
  amountCollected: number;
  storeCreditUsed: number;
  quantity: number;
  itemCount: number;
}

interface PosReturnRow {
  returnId: string;
  returnNumber: string;
  returnDate: Date;
  dateKey: string;
  monthKey: string;
  sourceInvoiceNumber: string;
  saleId?: string;
  customerId?: string;
  customerName: string;
  customerGstin?: string;
  cashierName: string;
  shiftName: string;
  refundMethod: string;
  returnStatus: string;
  refundStatus: string;
  returnedAmount: number;
  returnedTax: number;
  refundAmount: number;
  itemCount: number;
}

interface PosReturnLine {
  returnId: string;
  returnNumber: string;
  returnDate: Date;
  dateKey: string;
  monthKey: string;
  saleId?: string;
  sourceInvoiceNumber: string;
  customerId?: string;
  customerName: string;
  cashierName: string;
  shiftName: string;
  productId: string;
  productName: string;
  sku: string;
  itemType: string;
  hsnCode: string;
  variantSize?: string;
  variantColor?: string;
  quantity: number;
  grossSalesAmount: number;
  discountAmount: number;
  taxableValue: number;
  gstRate: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  cogsAmount: number;
}

interface PosNoteRow {
  noteNumber: string;
  noteDate: Date;
  dateKey: string;
  monthKey: string;
  category: 'credit_note' | 'return_adjustment';
  referenceInvoiceNumber: string;
  customerName: string;
  customerGstin?: string;
  taxableValue: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
}

interface PosReportContext {
  sales: any[];
  returns: PosReturnRow[];
  returnLines: PosReturnLine[];
  notes: PosNoteRow[];
  saleLines: PosSaleLine[];
  invoices: PosInvoiceRow[];
}

export interface StoreGrossProfitSummary {
  grossSalesBeforeDiscounts: number;
  grossSales: number;
  returns: number;
  discounts: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  invoices: number;
  expectedGrossProfit: number;
  validationDifference: number;
  isValid: boolean;
}

interface PosInventoryMovementRow {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  taxableValue: number;
  cogsAmount: number;
  grossProfit: number;
}

export const summarizeStoreGrossProfitFromContext = (
  context: Pick<PosReportContext, 'invoices' | 'returns'> & { returnLines?: Array<{ cogsAmount?: number }> }
): StoreGrossProfitSummary => {
  const grossSalesBeforeDiscounts = round2(
    context.invoices.reduce((sum, row) => sum + Number(row.taxableValue || 0) + Number(row.discountAmount || 0), 0)
  );
  const grossSales = round2(context.invoices.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0));
  const returns = round2(context.returns.reduce((sum, row) => sum + Number(row.returnedAmount || 0), 0));
  const discounts = round2(context.invoices.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0));
  const cogsBasis = computeCOGSFromLines({
    scope: 'pos',
    includeReturns: true,
    saleLines: context.invoices.map((row) => ({ itemType: 'inventory', cogsAmount: row.cogsAmount })),
    returnLines: (context.returnLines || []).map((row) => ({ itemType: 'inventory', cogsAmount: row.cogsAmount })),
    saleCount: context.invoices.length,
    returnCount: context.returns.length,
  });
  const cogs = cogsBasis.netCogsAmount;
  const netSales = round2(grossSales - returns);
  const expectedGrossProfit = round2(netSales - cogs);
  const grossProfit = expectedGrossProfit;
  const validationDifference = round2(grossProfit - expectedGrossProfit);

  return {
    grossSalesBeforeDiscounts,
    grossSales,
    returns,
    discounts,
    netSales,
    cogs,
    grossProfit,
    marginPercent: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
    invoices: context.invoices.length,
    expectedGrossProfit,
    validationDifference,
    isValid: Math.abs(validationDifference) <= 0.01,
  };
};

export const summarizePosInventoryMovementFromContext = (
  context: Pick<PosReportContext, 'saleLines' | 'returnLines'>
): {
  summary: {
    soldItems: number;
    soldQuantity: number;
    returnQuantity: number;
    netQuantity: number;
    soldCogsAmount: number;
    returnCogsAmount: number;
    cogsAmount: number;
  };
  soldRows: PosInventoryMovementRow[];
  returnRows: PosInventoryMovementRow[];
  netRows: PosInventoryMovementRow[];
} => {
  const soldMap = new Map<string, PosInventoryMovementRow>();
  const returnMap = new Map<string, PosInventoryMovementRow>();
  const toKey = (line: { productId?: string; productName?: string }) => `${line.productId || line.productName || ''}`;
  const makeRow = (line: any): PosInventoryMovementRow => ({
    productId: String(line.productId || ''),
    productName: String(line.productName || ''),
    sku: String(line.sku || ''),
    quantitySold: 0,
    taxableValue: 0,
    cogsAmount: 0,
    grossProfit: 0,
  });
  const appendLine = (target: Map<string, PosInventoryMovementRow>, line: any) => {
    const key = toKey(line);
    const current = target.get(key) || makeRow(line);
    current.quantitySold = round2(current.quantitySold + Number(line.quantity || 0));
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.cogsAmount = round2(current.cogsAmount + Number(line.cogsAmount || 0));
    current.grossProfit = round2(current.taxableValue - current.cogsAmount);
    target.set(key, current);
  };

  for (const line of context.saleLines.filter((row) => row.itemType !== 'service' && row.itemType !== 'non_inventory')) {
    appendLine(soldMap, line);
  }
  for (const line of context.returnLines.filter((row) => row.itemType !== 'service' && row.itemType !== 'non_inventory')) {
    appendLine(returnMap, line);
  }

  const netRows = Array.from(new Set([...soldMap.keys(), ...returnMap.keys()]))
    .map((key) => {
      const sold = soldMap.get(key);
      const returned = returnMap.get(key);
      return {
        productId: sold?.productId || returned?.productId || '',
        productName: sold?.productName || returned?.productName || '',
        sku: sold?.sku || returned?.sku || '',
        quantitySold: round2(Number(sold?.quantitySold || 0) - Number(returned?.quantitySold || 0)),
        taxableValue: round2(Number(sold?.taxableValue || 0) - Number(returned?.taxableValue || 0)),
        cogsAmount: round2(Number(sold?.cogsAmount || 0) - Number(returned?.cogsAmount || 0)),
        grossProfit: 0,
      };
    })
    .map((row) => ({
      ...row,
      grossProfit: round2(Number(row.taxableValue || 0) - Number(row.cogsAmount || 0)),
    }))
    .filter((row) => Math.abs(Number(row.quantitySold || 0)) > 0.0001 || Math.abs(Number(row.cogsAmount || 0)) > 0.0001);

  const cogsBasis = computeCOGSFromLines({
    scope: 'inventory',
    includeReturns: true,
    saleLines: context.saleLines,
    returnLines: context.returnLines,
    saleCount: context.saleLines.length,
    returnCount: context.returnLines.length,
  });

  return {
    summary: {
      soldItems: soldMap.size,
      soldQuantity: round2(Array.from(soldMap.values()).reduce((sum, row) => sum + Number(row.quantitySold || 0), 0)),
      returnQuantity: round2(Array.from(returnMap.values()).reduce((sum, row) => sum + Number(row.quantitySold || 0), 0)),
      netQuantity: round2(netRows.reduce((sum, row) => sum + Number(row.quantitySold || 0), 0)),
      soldCogsAmount: cogsBasis.soldCogsAmount,
      returnCogsAmount: cogsBasis.returnCogsAmount,
      cogsAmount: cogsBasis.netCogsAmount,
    },
    soldRows: Array.from(soldMap.values()).sort((left, right) => right.quantitySold - left.quantitySold),
    returnRows: Array.from(returnMap.values()).sort((left, right) => right.quantitySold - left.quantitySold),
    netRows: netRows.sort((left, right) => right.quantitySold - left.quantitySold),
  };
};

type ReportPaymentSplit = { method: string; amount: number };

type NormalizedReportSaleLine = {
  productId: string;
  productName: string;
  sku: string;
  category?: string;
  subcategory?: string;
  itemType: string;
  hsnCode: string;
  variantSize?: string;
  variantColor?: string;
  quantity: number;
  unitPrice: number;
  grossSalesAmount: number;
  lineDiscountAmount: number;
  invoiceDiscountAmount: number;
  discountAmount: number;
  taxableValue: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  gstTaxAmount: number;
  otherTaxAmount: number;
  taxAmount: number;
  totalAmount: number;
  cogsAmount: number;
  taxType: string;
  isNonGst: boolean;
};

type NormalizedReportSaleMetrics = {
  grossSalesAmount: number;
  lineDiscountAmount: number;
  invoiceDiscountAmount: number;
  totalDiscountAmount: number;
  taxableValue: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalBeforeRoundOff: number;
  roundOffAmount: number;
  totalAmount: number;
  outstandingAmount: number;
  amountCollected: number;
  storeCreditUsed: number;
  paymentSplits: ReportPaymentSplit[];
  lines: NormalizedReportSaleLine[];
};

const normalizeReportPaymentMethod = (value: unknown): string => {
  const method = normalizeText(value).toLowerCase();
  if (['cash', 'card', 'upi', 'bank_transfer', 'online', 'cheque'].includes(method)) return method;
  return method || 'cash';
};

const normalizeReportPaymentSplits = (sale: any, amountCollected: number): ReportPaymentSplit[] => {
  const raw = Array.isArray(sale?.paymentSplits) ? sale.paymentSplits : [];
  const normalized = raw
    .map((row: any) => ({
      method: normalizeReportPaymentMethod(row?.method || sale?.paymentMethod),
      amount: round2(Math.max(0, Number(row?.amount || 0))),
    }))
    .filter((row: ReportPaymentSplit) => row.amount > 0);

  if (amountCollected <= 0) return [];
  if (!normalized.length) {
    return [{ method: normalizeReportPaymentMethod(sale?.paymentMethod), amount: amountCollected }];
  }

  const currentTotal = round2(normalized.reduce((sum: number, row: ReportPaymentSplit) => sum + Number(row.amount || 0), 0));
  if (Math.abs(currentTotal - amountCollected) <= 0.01) return normalized;

  const adjusted = normalized.map((row: ReportPaymentSplit) => ({ ...row }));
  if (currentTotal < amountCollected) {
    adjusted[0].amount = round2(adjusted[0].amount + (amountCollected - currentTotal));
    return adjusted;
  }

  let excess = round2(currentTotal - amountCollected);
  for (let index = adjusted.length - 1; index >= 0 && excess > 0; index -= 1) {
    const nextAmount = round2(Math.max(0, adjusted[index].amount - excess));
    excess = round2(excess - (adjusted[index].amount - nextAmount));
    adjusted[index].amount = nextAmount;
  }
  return adjusted.filter((row: ReportPaymentSplit) => row.amount > 0);
};

const reconstructGrossLineBase = (item: any, quantity: number): number => {
  const unitPrice = round2(toNumber(item?.unitPrice));
  const discountAmount = round2(Math.max(0, toNumber(item?.discountAmount)));
  const discountPercentage = round2(Math.max(0, toNumber(item?.discountPercentage)));
  let grossUnitPrice = unitPrice;

  if (discountAmount > 0) {
    grossUnitPrice = round2(unitPrice + discountAmount);
  } else if (discountPercentage > 0 && discountPercentage < 100) {
    grossUnitPrice = round2(unitPrice / (1 - discountPercentage / 100));
  }

  return round2(grossUnitPrice * quantity);
};

const toTaxableFromLineBase = (
  lineBase: number,
  gstRate: number,
  args: { isGstBill: boolean; taxMode: 'inclusive' | 'exclusive' }
): number => {
  if (!args.isGstBill) return round2(lineBase);
  if (args.taxMode === 'inclusive' && gstRate > 0) {
    return round2(lineBase * (100 / (100 + gstRate)));
  }
  return round2(lineBase);
};

const resolveStoredLineTaxAmount = (item: any): number => {
  const declared = round2(toNumber(item?.gstAmount));
  if (declared > 0) return declared;
  const split = round2(toNumber(item?.cgstAmount) + toNumber(item?.sgstAmount) + toNumber(item?.igstAmount));
  if (split > 0) return split;
  const vat = round2(toNumber(item?.vatAmount));
  return vat;
};

const buildLegacyInvoiceDiscountShares = (
  discountAmount: number,
  lineTaxableValues: number[]
): number[] => {
  const totalTaxable = round2(lineTaxableValues.reduce((sum, value) => sum + Number(value || 0), 0));
  if (discountAmount <= 0 || totalTaxable <= 0 || !lineTaxableValues.length) {
    return lineTaxableValues.map(() => 0);
  }

  let remaining = round2(discountAmount);
  return lineTaxableValues.map((value, index) => {
    if (index === lineTaxableValues.length - 1) {
      return round2(Math.max(0, Math.min(value, remaining)));
    }
    const share = round2((discountAmount * value) / totalTaxable);
    const applied = round2(Math.max(0, Math.min(value, share)));
    remaining = round2(Math.max(0, remaining - applied));
    return applied;
  });
};

export const normalizeSaleForReporting = (sale: any): NormalizedReportSaleMetrics => {
  const isGstBill = Boolean(sale?.isGstBill !== false);
  const taxMode = String(sale?.taxMode || 'exclusive').toLowerCase() === 'inclusive' ? 'inclusive' : 'exclusive';
  const storeCreditUsed = round2(Math.max(0, toNumber(sale?.creditAppliedAmount)));
  const outstandingAmount = round2(Math.max(0, toNumber(sale?.outstandingAmount)));
  const storedRoundOffAmount = round2(toNumber(sale?.roundOffAmount));
  const storedTotalAmount = round2(toNumber(sale?.totalAmount));
  const amountCollected = round2(Math.max(0, storedTotalAmount - outstandingAmount - storeCreditUsed));

  const baseLines = (Array.isArray(sale?.items) ? sale.items : []).map((item: any) => {
    const quantity = round2(Math.max(0, toNumber(item?.quantity)));
    const gstRate = round2(Math.max(0, toNumber(item?.gstRate)));
    const taxType = String(item?.taxType || 'gst').toLowerCase() === 'vat' ? 'vat' : 'gst';
    const isNonGst = !isGstBill || taxType !== 'gst';
    const taxableStored = round2(
      item?.taxableValue !== undefined
        ? toNumber(item?.taxableValue)
        : toTaxableFromLineBase(reconstructGrossLineBase(item, quantity), gstRate, { isGstBill, taxMode })
    );
    const invoiceDiscountShare = round2(Math.max(0, toNumber((item as any)?.invoiceDiscountShare)));
    const taxableBeforeInvoiceDiscount = round2(taxableStored + invoiceDiscountShare);
    const lineGrossBase = reconstructGrossLineBase(item, quantity);
    const grossSalesAmount = round2(
      Math.max(
        taxableBeforeInvoiceDiscount,
        toTaxableFromLineBase(lineGrossBase, gstRate, { isGstBill, taxMode })
      )
    );
    const lineDiscountAmount = round2(Math.max(0, grossSalesAmount - taxableBeforeInvoiceDiscount));
    const rawTaxAmount = resolveStoredLineTaxAmount(item);
    const cogsAmount = round2(Math.max(0, toNumber(item?.cogsAmount)));

    return {
      item,
      quantity,
      gstRate,
      taxType,
      isNonGst,
      grossSalesAmount,
      lineDiscountAmount,
      taxableBeforeInvoiceDiscount,
      explicitInvoiceDiscountShare: invoiceDiscountShare,
      rawTaxAmount,
      cogsAmount,
    };
  });

  const explicitInvoiceDiscountAmount = round2(
    baseLines.reduce((sum: number, line: any) => sum + Number(line.explicitInvoiceDiscountShare || 0), 0)
  );
  const taxableBeforeInvoiceDiscount = round2(
    baseLines.reduce((sum: number, line: any) => sum + Number(line.taxableBeforeInvoiceDiscount || 0), 0)
  );
  const taxBeforeInvoiceDiscount = round2(baseLines.reduce((sum: number, line: any) => sum + Number(line.rawTaxAmount || 0), 0));
  const storedPreRoundTotal = round2(storedTotalAmount - storedRoundOffAmount);
  const legacyDiscountAfterTax = explicitInvoiceDiscountAmount > 0
    ? 0
    : round2(Math.max(0, taxableBeforeInvoiceDiscount + taxBeforeInvoiceDiscount - storedPreRoundTotal));
  const blendedTaxFactor = taxableBeforeInvoiceDiscount > 0
    ? round2((taxableBeforeInvoiceDiscount + taxBeforeInvoiceDiscount) / taxableBeforeInvoiceDiscount)
    : 1;
  const legacyInvoiceDiscountAmount = legacyDiscountAfterTax > 0
    ? round2(legacyDiscountAfterTax / Math.max(blendedTaxFactor, 1))
    : 0;
  const derivedInvoiceDiscountAmount = explicitInvoiceDiscountAmount > 0
    ? explicitInvoiceDiscountAmount
    : legacyInvoiceDiscountAmount;
  const derivedInvoiceDiscountShares = explicitInvoiceDiscountAmount > 0
    ? baseLines.map((line: any) => round2(line.explicitInvoiceDiscountShare))
    : buildLegacyInvoiceDiscountShares(
        derivedInvoiceDiscountAmount,
        baseLines.map((line: any) => round2(line.taxableBeforeInvoiceDiscount))
      );

  const lines: NormalizedReportSaleLine[] = baseLines.map((line: any, index: number) => {
    const invoiceDiscountAmount = round2(derivedInvoiceDiscountShares[index] || 0);
    const taxableValue = round2(Math.max(0, line.taxableBeforeInvoiceDiscount - invoiceDiscountAmount));
    const taxAmount = line.isNonGst
      ? (line.taxType === 'vat' && isGstBill ? round2((taxableValue * line.gstRate) / 100) : 0)
      : round2((taxableValue * line.gstRate) / 100);
    const hasStoredIgst = round2(toNumber(line.item?.igstAmount)) > 0;
    const cgstAmount = !line.isNonGst && !hasStoredIgst ? round2(taxAmount / 2) : 0;
    const sgstAmount = !line.isNonGst && !hasStoredIgst ? round2(taxAmount - cgstAmount) : 0;
    const igstAmount = !line.isNonGst && hasStoredIgst ? taxAmount : 0;
    const otherTaxAmount = line.taxType === 'vat' ? taxAmount : 0;
    const totalAmount = round2(taxableValue + taxAmount);
    return {
      productId: String(line.item?.productId || ''),
      productName: String(line.item?.productName || ''),
      sku: String(line.item?.sku || ''),
      category: String(line.item?.category || ''),
      subcategory: String(line.item?.subcategory || ''),
      itemType: String(line.item?.itemType || 'inventory'),
      hsnCode: upper(line.item?.hsnCode) || 'UNSPECIFIED',
      variantSize: normalizeText(line.item?.variantSize) || undefined,
      variantColor: normalizeText(line.item?.variantColor) || undefined,
      quantity: line.quantity,
      unitPrice: round2(toNumber(line.item?.unitPrice)),
      grossSalesAmount: round2(line.grossSalesAmount),
      lineDiscountAmount: round2(line.lineDiscountAmount),
      invoiceDiscountAmount,
      discountAmount: round2(line.lineDiscountAmount + invoiceDiscountAmount),
      taxableValue,
      gstRate: round2(line.gstRate),
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessAmount: 0,
      gstTaxAmount: line.isNonGst ? 0 : taxAmount,
      otherTaxAmount,
      taxAmount,
      totalAmount,
      cogsAmount: line.cogsAmount,
      taxType: line.taxType,
      isNonGst: line.isNonGst,
    };
  });

  const grossSalesAmount = round2(lines.reduce((sum, line) => sum + Number(line.grossSalesAmount || 0), 0));
  const lineDiscountAmount = round2(lines.reduce((sum, line) => sum + Number(line.lineDiscountAmount || 0), 0));
  const invoiceDiscountAmount = round2(lines.reduce((sum, line) => sum + Number(line.invoiceDiscountAmount || 0), 0));
  const totalDiscountAmount = round2(lineDiscountAmount + invoiceDiscountAmount);
  const taxableValue = round2(lines.reduce((sum, line) => sum + Number(line.taxableValue || 0), 0));
  const taxAmount = round2(lines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0));
  const cgstAmount = round2(lines.reduce((sum, line) => sum + Number(line.cgstAmount || 0), 0));
  const sgstAmount = round2(lines.reduce((sum, line) => sum + Number(line.sgstAmount || 0), 0));
  const igstAmount = round2(lines.reduce((sum, line) => sum + Number(line.igstAmount || 0), 0));
  const cessAmount = round2(lines.reduce((sum, line) => sum + Number(line.cessAmount || 0), 0));
  const totalBeforeRoundOff = round2(taxableValue + taxAmount);
  const computedTotalAmount = round2(totalBeforeRoundOff + storedRoundOffAmount);
  const totalAmount = Math.abs(storedTotalAmount - computedTotalAmount) <= 0.05
    ? storedTotalAmount
    : computedTotalAmount;

  return {
    grossSalesAmount,
    lineDiscountAmount,
    invoiceDiscountAmount,
    totalDiscountAmount,
    taxableValue,
    taxAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cessAmount,
    totalBeforeRoundOff,
    roundOffAmount: storedRoundOffAmount,
    totalAmount,
    outstandingAmount,
    amountCollected,
    storeCreditUsed,
    paymentSplits: normalizeReportPaymentSplits(sale, amountCollected),
    lines,
  };
};

const postedSaleMatch = (start: Date, end: Date) => ({
  createdAt: { $gte: start, $lte: end },
  saleStatus: { $in: ['completed', 'returned'] },
  $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
});
const postedSaleAsOnMatch = (asOnDate: Date) => ({
  createdAt: { $lte: asOnDate },
  saleStatus: { $in: ['completed', 'returned'] },
  $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
});

const loadPosReportContext = async (start: Date, end: Date, storeGstin = ''): Promise<PosReportContext> => {
  const [sales, returns, creditNotes] = await Promise.all([
    Sale.find(postedSaleMatch(start, end)).lean(),
    Return.find({ createdAt: { $gte: start, $lte: end }, returnStatus: 'approved' }).lean(),
    CreditNote.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }).lean(),
  ]);

  const customerIds = new Set<string>();
  const userIds = new Set<string>();
  const saleIds = new Set<string>();
  for (const sale of sales) {
    if (sale.customerId) customerIds.add(String(sale.customerId));
    if (sale.userId) userIds.add(String(sale.userId));
    if (sale._id) saleIds.add(String(sale._id));
  }
  for (const row of returns as any[]) {
    if (row.customerId) customerIds.add(String(row.customerId));
    if (row.userId) userIds.add(String(row.userId));
    if (row.saleId) saleIds.add(String(row.saleId));
  }
  for (const row of creditNotes as any[]) {
    if (row.sourceSaleId) saleIds.add(String(row.sourceSaleId));
  }

  const customers = customerIds.size
    ? await Customer.find({ _id: { $in: Array.from(customerIds) } }).select('_id name gstin').lean()
    : [];
  const users = userIds.size
    ? await User.find({ _id: { $in: Array.from(userIds) } }).select('_id firstName lastName email employeeId').lean()
    : [];
  const employeeIds = Array.from(new Set(users.map((row: any) => String(row.employeeId || '')).filter(Boolean)));
  const saleDateKeys = Array.from(
    new Set(sales.map((row) => toDateKey(safeDate(row.postedAt || row.createdAt || new Date()))))
  );
  const shifts = employeeIds.length && saleDateKeys.length
    ? await ShiftSchedule.find({
        employeeId: { $in: employeeIds },
        dateKey: { $in: saleDateKeys },
      }).select('employeeId dateKey shiftName startTime endTime').lean()
    : [];

  const customerMap = new Map(customers.map((row: any) => [String(row._id), row]));
  const userMap = new Map(users.map((row: any) => [String(row._id), row]));
  const shiftMap = new Map(shifts.map((row: any) => [`${String(row.employeeId)}:${String(row.dateKey)}`, row]));
  const saleMap = new Map(sales.map((row: any) => [String(row._id), row]));
  const storeStateCode = stateCodeFromGstin(storeGstin);

  const saleLines: PosSaleLine[] = [];
  const returnLines: PosReturnLine[] = [];
  const invoiceMap = new Map<string, PosInvoiceRow>();
  const normalizedSaleMetricsMap = new Map<string, NormalizedReportSaleMetrics>();
  for (const sale of sales as any[]) {
    const invoiceDate = safeDate(sale.postedAt || sale.createdAt || new Date());
    const dateKey = toDateKey(invoiceDate);
    const monthKey = toMonthKey(invoiceDate);
    const user = sale.userId ? userMap.get(String(sale.userId)) : undefined;
    const employeeId = user?.employeeId ? String(user.employeeId) : '';
    const shift = employeeId ? shiftMap.get(`${employeeId}:${dateKey}`) : undefined;
    const customer = sale.customerId ? customerMap.get(String(sale.customerId)) : undefined;
    const customerGstin = upper((customer as any)?.gstin);
    const customerName = normalizeText(sale.customerName) || normalizeText((customer as any)?.name) || 'Walk-in Customer';
    const placeOfSupply = stateCodeFromGstin(customerGstin) || storeStateCode;
    const cashierName = user ? fullNameOfUser(user) : 'Unknown User';
    const reportingMetrics = normalizeSaleForReporting(sale);
    normalizedSaleMetricsMap.set(String(sale._id), reportingMetrics);
    const paymentSplits = reportingMetrics.paymentSplits;
    const paymentSummaryLabel = paymentSplits.length > 1
      ? paymentSplits.map((row: { method: string; amount: number }) => row.method.toUpperCase()).join(' + ')
      : paymentSplits[0]?.method
        ? String(paymentSplits[0].method || '').toUpperCase()
        : reportingMetrics.storeCreditUsed > 0
          ? 'STORE CREDIT'
          : String(sale.paymentMethod || '');

    const invoiceRow: PosInvoiceRow = {
      saleId: String(sale._id),
      saleNumber: String(sale.saleNumber || ''),
      invoiceNumber: String(sale.invoiceNumber || sale.saleNumber || ''),
      invoiceDate,
      dateKey,
      monthKey,
      userId: String(sale.userId || ''),
      cashierName,
      shiftName: normalizeText((shift as any)?.shiftName) || 'General',
      paymentMethod: paymentSummaryLabel,
      paymentSplits,
      paymentChannelLabel: normalizeText(sale.paymentChannelLabel),
      processorName: normalizeText(sale.processorName),
      treasuryAccountName: normalizeText(sale.treasuryAccountName),
      customerId: sale.customerId ? String(sale.customerId) : undefined,
      customerName,
      customerGstin: customerGstin || undefined,
      isRegistered: isRegisteredGstin(customerGstin),
      placeOfSupply,
      isInterState: false,
      classification: 'b2cs',
      invoiceType: String(sale.invoiceType || ''),
      paymentStatus: String(sale.paymentStatus || ''),
      saleStatus: String(sale.saleStatus || ''),
      grossSalesAmount: reportingMetrics.grossSalesAmount,
      taxableValue: reportingMetrics.taxableValue,
      discountAmount: reportingMetrics.totalDiscountAmount,
      taxAmount: reportingMetrics.taxAmount,
      cgstAmount: reportingMetrics.cgstAmount,
      sgstAmount: reportingMetrics.sgstAmount,
      igstAmount: reportingMetrics.igstAmount,
      cessAmount: reportingMetrics.cessAmount,
      totalBeforeRoundOff: reportingMetrics.totalBeforeRoundOff,
      roundOffAmount: reportingMetrics.roundOffAmount,
      totalAmount: reportingMetrics.totalAmount,
      cogsAmount: round2(reportingMetrics.lines.reduce((sum, line) => sum + Number(line.cogsAmount || 0), 0)),
      outstandingAmount: reportingMetrics.outstandingAmount,
      amountCollected: reportingMetrics.amountCollected,
      storeCreditUsed: reportingMetrics.storeCreditUsed,
      quantity: round2(reportingMetrics.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)),
      itemCount: reportingMetrics.lines.length,
    };

    for (const line of reportingMetrics.lines) {
      const isInterState = Boolean(
        Number(line.igstAmount || 0) > 0 || (placeOfSupply && storeStateCode && placeOfSupply !== storeStateCode)
      );
      saleLines.push({
        saleId: invoiceRow.saleId,
        saleNumber: invoiceRow.saleNumber,
        invoiceNumber: invoiceRow.invoiceNumber,
        invoiceDate,
        dateKey,
        monthKey,
        userId: invoiceRow.userId,
        cashierName,
        shiftName: invoiceRow.shiftName,
        paymentMethod: invoiceRow.paymentMethod,
        paymentChannelLabel: invoiceRow.paymentChannelLabel,
        processorName: invoiceRow.processorName,
        treasuryAccountName: invoiceRow.treasuryAccountName,
        customerId: invoiceRow.customerId,
        customerName,
        customerGstin: customerGstin || undefined,
        isRegistered: invoiceRow.isRegistered,
        placeOfSupply,
        isInterState,
        productId: line.productId,
        productName: line.productName,
        sku: line.sku,
        category: line.category,
        subcategory: line.subcategory,
        itemType: line.itemType,
        hsnCode: line.hsnCode,
        variantSize: line.variantSize,
        variantColor: line.variantColor,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        grossSalesAmount: line.grossSalesAmount,
        lineDiscountAmount: line.lineDiscountAmount,
        invoiceDiscountAmount: line.invoiceDiscountAmount,
        discountAmount: line.discountAmount,
        taxableValue: line.taxableValue,
        gstRate: line.gstRate,
        cgstAmount: line.cgstAmount,
        sgstAmount: line.sgstAmount,
        igstAmount: line.igstAmount,
        cessAmount: line.cessAmount,
        gstTaxAmount: line.gstTaxAmount,
        otherTaxAmount: line.otherTaxAmount,
        taxAmount: line.taxAmount,
        totalAmount: line.totalAmount,
        cogsAmount: line.cogsAmount,
        taxType: line.taxType,
        isNonGst: line.isNonGst,
      });
      invoiceRow.isInterState = invoiceRow.isInterState || isInterState;
    }

    const invoiceValue = round2(invoiceRow.taxableValue + invoiceRow.taxAmount + invoiceRow.cessAmount);
    invoiceRow.classification = invoiceClassification(invoiceValue, invoiceRow.isRegistered, invoiceRow.isInterState);
    invoiceMap.set(invoiceRow.saleId, invoiceRow);
  }

  const returnsMapped: PosReturnRow[] = (returns as any[]).map((row: any) => {
    const sourceSale = row.saleId ? saleMap.get(String(row.saleId)) : undefined;
    const customer = row.customerId
      ? customerMap.get(String(row.customerId))
      : sourceSale?.customerId
        ? customerMap.get(String(sourceSale.customerId))
        : undefined;
    const customerGstin = upper((customer as any)?.gstin);
    const returnDate = safeDate(row.approvedAt || row.createdAt || new Date());
    const sourceInvoiceDate = sourceSale ? safeDate(sourceSale.postedAt || sourceSale.createdAt || returnDate) : returnDate;
    const dateKey = sourceSale ? toDateKey(sourceInvoiceDate) : toDateKey(returnDate);
    const user = sourceSale?.userId ? userMap.get(String(sourceSale.userId)) : undefined;
    const employeeId = user?.employeeId ? String(user.employeeId) : '';
    const shift = employeeId ? shiftMap.get(`${employeeId}:${dateKey}`) : undefined;
    return {
      returnId: String(row._id),
      returnNumber: String(row.returnNumber || ''),
      returnDate,
      dateKey,
      monthKey: toMonthKey(returnDate),
      sourceInvoiceNumber: String(row.sourceInvoiceNumber || sourceSale?.invoiceNumber || sourceSale?.saleNumber || ''),
      saleId: row.saleId ? String(row.saleId) : undefined,
      customerId: row.customerId ? String(row.customerId) : sourceSale?.customerId ? String(sourceSale.customerId) : undefined,
      customerName:
        normalizeText(row.customerName) ||
        normalizeText(sourceSale?.customerName) ||
        normalizeText((customer as any)?.name) ||
        'Walk-in Customer',
      customerGstin: customerGstin || undefined,
      cashierName: user ? fullNameOfUser(user) : 'Unknown User',
      shiftName: normalizeText((shift as any)?.shiftName) || 'General',
      refundMethod: String(row.refundMethod || ''),
      returnStatus: String(row.returnStatus || ''),
      refundStatus: String(row.refundStatus || ''),
      returnedAmount: round2(toNumber(row.returnedAmount)),
      returnedTax: round2(toNumber(row.returnedGst)),
      refundAmount: round2(toNumber(row.refundAmount)),
      itemCount: Array.isArray(row.items) ? row.items.length : 0,
    };
  });

  for (const row of returns as any[]) {
    const sourceSale = row.saleId ? saleMap.get(String(row.saleId)) : undefined;
    const sourceMetrics = row.saleId ? normalizedSaleMetricsMap.get(String(row.saleId)) : undefined;
    const customer = row.customerId
      ? customerMap.get(String(row.customerId))
      : sourceSale?.customerId
        ? customerMap.get(String(sourceSale.customerId))
        : undefined;
    const returnDate = safeDate(row.approvedAt || row.createdAt || new Date());
    const sourceInvoiceDate = sourceSale ? safeDate(sourceSale.postedAt || sourceSale.createdAt || returnDate) : returnDate;
    const dateKey = sourceSale ? toDateKey(sourceInvoiceDate) : toDateKey(returnDate);
    const user = sourceSale?.userId ? userMap.get(String(sourceSale.userId)) : undefined;
    const employeeId = user?.employeeId ? String(user.employeeId) : '';
    const shift = employeeId ? shiftMap.get(`${employeeId}:${dateKey}`) : undefined;
    const customerName =
      normalizeText(row.customerName) ||
      normalizeText(sourceSale?.customerName) ||
      normalizeText((customer as any)?.name) ||
      'Walk-in Customer';
    for (const item of Array.isArray(row.items) ? row.items : []) {
      const quantity = round2(Math.max(0, toNumber(item?.returnQuantity || item?.quantity)));
      const matchedLine = sourceMetrics?.lines.find((line) =>
        String(line.productId || '') === String(item?.productId || '')
        && String(line.sku || '') === String(item?.sku || '')
      ) || sourceMetrics?.lines.find((line) => String(line.productId || '') === String(item?.productId || ''));
      const grossSalesAmount = matchedLine && Number(matchedLine.quantity || 0) > 0
        ? round2((Number(matchedLine.grossSalesAmount || 0) / Number(matchedLine.quantity || 1)) * quantity)
        : round2(toNumber(item?.unitPrice) * quantity);
      const discountAmount = matchedLine && Number(matchedLine.quantity || 0) > 0
        ? round2((Number(matchedLine.discountAmount || 0) / Number(matchedLine.quantity || 1)) * quantity)
        : 0;
      const taxableValue = round2(
        item?.lineSubtotal !== undefined
          ? toNumber(item?.lineSubtotal)
          : Math.max(0, grossSalesAmount - discountAmount)
      );
      const taxAmount = round2(
        item?.lineTax !== undefined
          ? toNumber(item?.lineTax)
          : matchedLine?.gstRate
            ? (taxableValue * Number(matchedLine.gstRate || 0)) / 100
            : 0
      );
      const hasIgst = Number(matchedLine?.igstAmount || 0) > 0;
      const cgstAmount = hasIgst ? 0 : round2(taxAmount / 2);
      const sgstAmount = hasIgst ? 0 : round2(taxAmount - cgstAmount);
      const igstAmount = hasIgst ? taxAmount : 0;
      const totalAmount = round2(
        item?.lineTotal !== undefined
          ? toNumber(item?.lineTotal)
          : taxableValue + taxAmount
      );
      const cogsAmount = matchedLine && Number(matchedLine.quantity || 0) > 0
        ? round2((Number(matchedLine.cogsAmount || 0) / Number(matchedLine.quantity || 1)) * quantity)
        : 0;

      returnLines.push({
        returnId: String(row._id),
        returnNumber: String(row.returnNumber || ''),
        returnDate,
        dateKey,
        monthKey: toMonthKey(returnDate),
        saleId: row.saleId ? String(row.saleId) : undefined,
        sourceInvoiceNumber: String(row.sourceInvoiceNumber || sourceSale?.invoiceNumber || sourceSale?.saleNumber || ''),
        customerId: row.customerId ? String(row.customerId) : sourceSale?.customerId ? String(sourceSale.customerId) : undefined,
        customerName,
        cashierName: user ? fullNameOfUser(user) : 'Unknown User',
        shiftName: normalizeText((shift as any)?.shiftName) || 'General',
        productId: String(item?.productId || matchedLine?.productId || ''),
        productName: String(item?.productName || matchedLine?.productName || ''),
        sku: String(item?.sku || matchedLine?.sku || ''),
        itemType: String(matchedLine?.itemType || 'inventory'),
        hsnCode: matchedLine?.hsnCode || 'UNSPECIFIED',
        variantSize: matchedLine?.variantSize,
        variantColor: matchedLine?.variantColor,
        quantity,
        grossSalesAmount,
        discountAmount,
        taxableValue,
        gstRate: round2(toNumber(item?.gstRate ?? matchedLine?.gstRate)),
        taxAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        cessAmount: 0,
        totalAmount,
        cogsAmount,
      });
    }
  }

  const notes: PosNoteRow[] = [
    ...(creditNotes as any[]).map((row: any) => {
      const sourceSale = row.sourceSaleId ? saleMap.get(String(row.sourceSaleId)) : undefined;
      const customer = sourceSale?.customerId ? customerMap.get(String(sourceSale.customerId)) : undefined;
      const noteDate = safeDate(row.issuedAt || row.createdAt || new Date());
      return {
        noteNumber: String(row.noteNumber || ''),
        noteDate,
        dateKey: toDateKey(noteDate),
        monthKey: toMonthKey(noteDate),
        category: 'credit_note' as const,
        referenceInvoiceNumber: String(sourceSale?.invoiceNumber || sourceSale?.saleNumber || ''),
        customerName:
          normalizeText(row.customerName) ||
          normalizeText(sourceSale?.customerName) ||
          normalizeText((customer as any)?.name) ||
          'Walk-in Customer',
        customerGstin: upper((customer as any)?.gstin) || undefined,
        taxableValue: round2(toNumber(row.subtotal)),
        taxAmount: round2(toNumber(row.taxAmount)),
        totalAmount: round2(toNumber(row.totalAmount)),
        status: String(row.status || ''),
      };
    }),
    ...returnsMapped.map((row) => ({
      noteNumber: row.returnNumber,
      noteDate: row.returnDate,
      dateKey: row.dateKey,
      monthKey: row.monthKey,
      category: 'return_adjustment' as const,
      referenceInvoiceNumber: row.sourceInvoiceNumber,
      customerName: row.customerName,
      customerGstin: row.customerGstin,
      taxableValue: row.returnedAmount,
      taxAmount: row.returnedTax,
      totalAmount: row.refundAmount,
      status: row.returnStatus,
    })),
  ].sort((left, right) => right.noteDate.getTime() - left.noteDate.getTime());

  return {
    sales,
    returns: returnsMapped.sort((left, right) => right.returnDate.getTime() - left.returnDate.getTime()),
    returnLines: returnLines.sort((left, right) => right.returnDate.getTime() - left.returnDate.getTime()),
    notes,
    saleLines,
    invoices: Array.from(invoiceMap.values()).sort((left, right) => right.invoiceDate.getTime() - left.invoiceDate.getTime()),
  };
};

export const buildPosProfitLossReport = async (start: Date, end: Date) => {
  const context = await loadPosReportContext(start, end);
  const grossProfitSummary = summarizeStoreGrossProfitFromContext(context);
  const {
    grossSalesBeforeDiscounts,
    grossSales,
    returns,
    discounts,
    cogs,
    netSales,
    grossProfit,
  } = grossProfitSummary;

  const registerMap = new Map<string, any>();
  for (const row of context.invoices) {
    const key = `${row.cashierName}|${row.shiftName}`;
    const current = registerMap.get(key) || {
      register: row.cashierName,
      shiftName: row.shiftName,
      invoices: 0,
      returns: 0,
      netSales: 0,
      taxAmount: 0,
      cogsAmount: 0,
      grossProfit: 0,
    };
    current.invoices += 1;
    current.netSales = round2(current.netSales + Number(row.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0));
    current.cogsAmount = round2(current.cogsAmount + Number(row.cogsAmount || 0));
    current.grossProfit = round2(current.netSales - current.cogsAmount);
    registerMap.set(key, current);
  }
  for (const row of context.returns) {
    const key = `${row.cashierName}|${row.shiftName}`;
    const current = registerMap.get(key) || {
      register: row.cashierName,
      shiftName: row.shiftName,
      invoices: 0,
      returns: 0,
      netSales: 0,
      taxAmount: 0,
      cogsAmount: 0,
      grossProfit: 0,
    };
    current.returns = round2(current.returns + Number(row.returnedAmount || 0));
    current.netSales = round2(current.netSales - Number(row.returnedAmount || 0));
    current.taxAmount = round2(current.taxAmount - Number(row.returnedTax || 0));
    current.grossProfit = round2(current.netSales - current.cogsAmount);
    registerMap.set(key, current);
  }
  for (const row of context.returnLines) {
    const key = `${row.cashierName}|${row.shiftName}`;
    const current = registerMap.get(key) || {
      register: row.cashierName,
      shiftName: row.shiftName,
      invoices: 0,
      returns: 0,
      netSales: 0,
      taxAmount: 0,
      cogsAmount: 0,
      grossProfit: 0,
    };
    current.cogsAmount = round2(Math.max(0, current.cogsAmount - Number(row.cogsAmount || 0)));
    current.grossProfit = round2(current.netSales - current.cogsAmount);
    registerMap.set(key, current);
  }

  return {
    statement: {
      rows: [
        { section: 'Sales', particulars: 'Sales Before Discounts', amount: grossSalesBeforeDiscounts },
        { section: 'Sales', particulars: 'Less: Discounts', amount: discounts },
        { section: 'Sales', particulars: 'Net Billed Sales', amount: grossSales },
        { section: 'Sales', particulars: 'Less: Sales Returns / Refunds', amount: returns },
        { section: 'Sales', particulars: 'Net Sales', amount: netSales },
        { section: 'Expense', particulars: 'Cost Of Goods Sold', amount: cogs },
        { section: 'Result', particulars: 'Gross Profit', amount: grossProfit },
      ],
    },
    posSummary: {
      grossSales,
      returns,
      discounts,
      netSales,
      cogs,
      grossProfit,
      marginPercent: grossProfitSummary.marginPercent,
      invoices: grossProfitSummary.invoices,
      expectedGrossProfit: grossProfitSummary.expectedGrossProfit,
      validationDifference: grossProfitSummary.validationDifference,
      isValid: grossProfitSummary.isValid,
    },
    registerRows: Array.from(registerMap.values()).sort((left, right) => right.netSales - left.netSales),
  };
};

export const buildPosDailySalesSummary = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const summaryMap = new Map<string, any>();

  for (const row of context.invoices) {
    const current = summaryMap.get(row.dateKey) || {
      dateKey: row.dateKey,
      invoices: 0,
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      taxAmount: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      outstanding: 0,
    };
    current.invoices += 1;
    current.grossSales = round2(current.grossSales + Number(row.grossSalesAmount || 0));
    current.discounts = round2(current.discounts + Number(row.discountAmount || 0));
    current.netSales = round2(current.netSales + Number(row.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0));
    current.totalSales = round2(current.totalSales + Number(row.totalAmount || 0));
    current.amountCollected = round2(current.amountCollected + Number(row.amountCollected || 0));
    current.storeCreditUsed = round2(current.storeCreditUsed + Number(row.storeCreditUsed || 0));
    current.outstanding = round2(current.outstanding + Number(row.outstandingAmount || 0));
    summaryMap.set(row.dateKey, current);
  }

  for (const row of context.returns) {
    const current = summaryMap.get(row.dateKey) || {
      dateKey: row.dateKey,
      invoices: 0,
      grossSales: 0,
      discounts: 0,
      netSales: 0,
      taxAmount: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      outstanding: 0,
    };
    current.netSales = round2(current.netSales - Number(row.returnedAmount || 0));
    current.taxAmount = round2(current.taxAmount - Number(row.returnedTax || 0));
    current.totalSales = round2(current.totalSales - Number(row.refundAmount || 0));
    summaryMap.set(row.dateKey, current);
  }

  return Array.from(summaryMap.values())
    .map((row) => {
      const [year, month, day] = String(row.dateKey || '').split('-').map((value) => Number(value || 0));
      return {
        _id: { year, month, day },
        dateKey: row.dateKey,
        invoices: Number(row.invoices || 0),
        grossSales: round2(Number(row.grossSales || 0)),
        discounts: round2(Number(row.discounts || 0)),
        salesAmount: round2(Number(row.netSales || 0)),
        netSales: round2(Number(row.netSales || 0)),
        taxAmount: round2(Number(row.taxAmount || 0)),
        totalSales: round2(Number(row.totalSales || 0)),
        amountCollected: round2(Number(row.amountCollected || 0)),
        storeCreditUsed: round2(Number(row.storeCreditUsed || 0)),
        outstanding: round2(Number(row.outstanding || 0)),
      };
    })
    .sort((left, right) => String(left.dateKey || '').localeCompare(String(right.dateKey || '')));
};

export const buildPosItemWiseSalesReport = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const summary = new Map<string, any>();

  for (const line of context.saleLines) {
    const key = `${line.productId || line.productName}|${line.variantSize || ''}|${line.variantColor || ''}`;
    const current = summary.get(key) || {
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      category: line.category || '',
      subcategory: line.subcategory || '',
      variantSize: line.variantSize || '',
      variantColor: line.variantColor || '',
      quantity: 0,
      grossSales: 0,
      discount: 0,
      taxableValue: 0,
      tax: 0,
      amount: 0,
      cogs: 0,
      grossProfit: 0,
      marginPercent: 0,
      rankValue: 0,
    };
    current.quantity = round2(current.quantity + Number(line.quantity || 0));
    current.grossSales = round2(current.grossSales + Number(line.grossSalesAmount || 0));
    current.discount = round2(current.discount + Number(line.discountAmount || 0));
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.tax = round2(current.tax + Number(line.taxAmount || 0));
    current.amount = round2(current.amount + Number(line.totalAmount || 0));
    current.cogs = round2(current.cogs + Number(line.cogsAmount || 0));
    summary.set(key, current);
  }

  for (const line of context.returnLines) {
    const key = `${line.productId || line.productName}|${line.variantSize || ''}|${line.variantColor || ''}`;
    const current = summary.get(key) || {
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      category: '',
      subcategory: '',
      variantSize: line.variantSize || '',
      variantColor: line.variantColor || '',
      quantity: 0,
      grossSales: 0,
      discount: 0,
      taxableValue: 0,
      tax: 0,
      amount: 0,
      cogs: 0,
      grossProfit: 0,
      marginPercent: 0,
      rankValue: 0,
    };
    current.quantity = round2(current.quantity - Number(line.quantity || 0));
    current.grossSales = round2(current.grossSales - Number(line.grossSalesAmount || 0));
    current.discount = round2(current.discount - Number(line.discountAmount || 0));
    current.taxableValue = round2(current.taxableValue - Number(line.taxableValue || 0));
    current.tax = round2(current.tax - Number(line.taxAmount || 0));
    current.amount = round2(current.amount - Number(line.totalAmount || 0));
    current.cogs = round2(current.cogs - Number(line.cogsAmount || 0));
    summary.set(key, current);
  }

  const rows = Array.from(summary.values())
    .map((row) => {
      const grossProfit = round2(Number(row.taxableValue || 0) - Number(row.cogs || 0));
      return {
        ...row,
        grossProfit,
        marginPercent: Number(row.taxableValue || 0) > 0 ? round2((grossProfit / Number(row.taxableValue || 0)) * 100) : 0,
        rankValue: round2(Number(row.taxableValue || 0)),
      };
    })
    .sort((left, right) => Number(right.taxableValue || 0) - Number(left.taxableValue || 0))
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  return {
    summary: {
      items: rows.length,
      grossSales: round2(rows.reduce((sum, row) => sum + Number(row.grossSales || 0), 0)),
      discount: round2(rows.reduce((sum, row) => sum + Number(row.discount || 0), 0)),
      taxableValue: round2(rows.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
      tax: round2(rows.reduce((sum, row) => sum + Number(row.tax || 0), 0)),
      amount: round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
      cogs: round2(rows.reduce((sum, row) => sum + Number(row.cogs || 0), 0)),
      grossProfit: round2(rows.reduce((sum, row) => sum + Number(row.grossProfit || 0), 0)),
    },
    rows,
  };
};

export const buildPosCustomerWiseSalesReport = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const summary = new Map<string, any>();

  for (const row of context.invoices) {
    const key = String(row.customerId || row.customerName || 'walkin');
    const current = summary.get(key) || {
      customerId: row.customerId || '',
      customerName: row.customerName || 'Walk-in Customer',
      invoices: 0,
      visitCount: 0,
      grossSales: 0,
      discount: 0,
      returns: 0,
      netSales: 0,
      gst: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      balanceDue: 0,
      avgOrderValue: 0,
    };
    current.invoices += 1;
    current.visitCount += 1;
    current.grossSales = round2(current.grossSales + Number(row.grossSalesAmount || 0));
    current.discount = round2(current.discount + Number(row.discountAmount || 0));
    current.netSales = round2(current.netSales + Number(row.taxableValue || 0));
    current.gst = round2(current.gst + Number(row.taxAmount || 0));
    current.totalSales = round2(current.totalSales + Number(row.totalAmount || 0));
    current.amountCollected = round2(current.amountCollected + Number(row.amountCollected || 0));
    current.storeCreditUsed = round2(current.storeCreditUsed + Number(row.storeCreditUsed || 0));
    current.balanceDue = round2(current.balanceDue + Number(row.outstandingAmount || 0));
    summary.set(key, current);
  }

  for (const row of context.returns) {
    const key = String(row.customerId || row.customerName || 'walkin');
    const current = summary.get(key) || {
      customerId: row.customerId || '',
      customerName: row.customerName || 'Walk-in Customer',
      invoices: 0,
      visitCount: 0,
      grossSales: 0,
      discount: 0,
      returns: 0,
      netSales: 0,
      gst: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      balanceDue: 0,
      avgOrderValue: 0,
    };
    current.returns = round2(current.returns + Number(row.returnedAmount || 0));
    current.netSales = round2(current.netSales - Number(row.returnedAmount || 0));
    current.gst = round2(current.gst - Number(row.returnedTax || 0));
    current.totalSales = round2(current.totalSales - Number(row.refundAmount || 0));
    summary.set(key, current);
  }

  const rows = Array.from(summary.values())
    .map((row) => ({
      ...row,
      avgOrderValue: Number(row.invoices || 0) > 0 ? round2(Number(row.totalSales || 0) / Number(row.invoices || 0)) : 0,
    }))
    .sort((left, right) => Number(right.netSales || 0) - Number(left.netSales || 0));

  return {
    summary: {
      customers: rows.length,
      grossSales: round2(rows.reduce((sum, row) => sum + Number(row.grossSales || 0), 0)),
      discount: round2(rows.reduce((sum, row) => sum + Number(row.discount || 0), 0)),
      returns: round2(rows.reduce((sum, row) => sum + Number(row.returns || 0), 0)),
      netSales: round2(rows.reduce((sum, row) => sum + Number(row.netSales || 0), 0)),
      gst: round2(rows.reduce((sum, row) => sum + Number(row.gst || 0), 0)),
      totalSales: round2(rows.reduce((sum, row) => sum + Number(row.totalSales || 0), 0)),
      amountCollected: round2(rows.reduce((sum, row) => sum + Number(row.amountCollected || 0), 0)),
      storeCreditUsed: round2(rows.reduce((sum, row) => sum + Number(row.storeCreditUsed || 0), 0)),
      balanceDue: round2(rows.reduce((sum, row) => sum + Number(row.balanceDue || 0), 0)),
    },
    rows,
  };
};

export const buildPosSalesAnalyticsSummary = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const grossSales = round2(context.invoices.reduce((sum, row) => sum + Number(row.grossSalesAmount || 0), 0));
  const discounts = round2(context.invoices.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0));
  const salesNet = round2(context.invoices.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0));
  const salesTax = round2(context.invoices.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
  const salesTotal = round2(context.invoices.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0));
  const salesCollected = round2(context.invoices.reduce((sum, row) => sum + Number(row.amountCollected || 0), 0));
  const salesStoreCredit = round2(context.invoices.reduce((sum, row) => sum + Number(row.storeCreditUsed || 0), 0));
  const totalOutstanding = round2(context.invoices.reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0));
  const returnTaxable = round2(context.returns.reduce((sum, row) => sum + Number(row.returnedAmount || 0), 0));
  const returnTax = round2(context.returns.reduce((sum, row) => sum + Number(row.returnedTax || 0), 0));
  const returnTotal = round2(context.returns.reduce((sum, row) => sum + Number(row.refundAmount || 0), 0));
  const totalRoundOff = round2(context.invoices.reduce((sum, row) => sum + (Number(row.totalAmount || 0) - Number(row.taxableValue || 0) - Number(row.taxAmount || 0)), 0));
  const netSales = round2(salesNet - returnTaxable);
  const gstCollected = round2(salesTax - returnTax);
  const grandTotal = round2(salesTotal - returnTotal);
  const averageNetSale = context.invoices.length > 0 ? round2(netSales / context.invoices.length) : 0;
  const byPaymentMethod = new Map<string, { _id: string; count: number; total: number }>();

  for (const invoice of context.invoices) {
    const splits = Array.isArray(invoice.paymentSplits) && invoice.paymentSplits.length
      ? invoice.paymentSplits
      : Number(invoice.amountCollected || 0) > 0
        ? [{ method: invoice.paymentMethod, amount: Number(invoice.amountCollected || 0) }]
        : [];
    for (const split of splits) {
      const method = String(split?.method || invoice.paymentMethod || '').trim().toLowerCase() || 'cash';
      const current = byPaymentMethod.get(method) || { _id: method, count: 0, total: 0 };
      current.count += 1;
      current.total = round2(current.total + Number(split?.amount || 0));
      byPaymentMethod.set(method, current);
    }
  }

  if (salesStoreCredit > 0) {
    const current = byPaymentMethod.get('store_credit') || { _id: 'store_credit', count: 0, total: 0 };
    current.count += context.invoices.filter((row) => Number(row.storeCreditUsed || 0) > 0).length;
    current.total = round2(current.total + salesStoreCredit);
    byPaymentMethod.set('store_credit', current);
  }

  return {
    summary: {
      grossSales,
      discounts,
      returnTaxable,
      netSales,
      gstCollected,
      grandTotal,
      amountCollected: salesCollected,
      storeCreditUsed: salesStoreCredit,
      totalSales: grandTotal,
      totalGst: gstCollected,
      totalTransactions: context.invoices.length,
      averageValue: averageNetSale,
      averageNetSale,
      totalRoundOff,
      totalOutstanding,
      totalCreditInvoices: context.invoices.filter((row) => String(row.invoiceType || '') === 'credit').length,
    },
    byPaymentMethod: Array.from(byPaymentMethod.values()).sort((left, right) => right.total - left.total),
  };
};

export const getStoreGrossProfit = async (start: Date, end: Date): Promise<StoreGrossProfitSummary> => {
  const context = await loadPosReportContext(start, end);
  return summarizeStoreGrossProfitFromContext(context);
};

export const buildPosBalanceSheetReport = async (asOnDate: Date) => {
  const [context, valuation, cashAccounts, cashCounts, dayClosings, unsettledSales, openCreditSales, treasuryEntries] = await Promise.all([
    loadPosReportContext(POS_REPORT_EPOCH, asOnDate),
    buildInventoryValuationRows({ date: asOnDate }),
    TreasuryAccount.find({ accountType: 'cash_float', isActive: true }).select('_id displayName openingBalance').lean(),
    CashFloatCount.find({ countDate: { $lte: asOnDate } }).sort({ countDate: -1, createdAt: -1 }).lean(),
    DayEndClosing.find({ businessDate: { $lte: asOnDate } }).sort({ businessDate: -1 }).limit(7).lean(),
    Sale.find({
      ...postedSaleAsOnMatch(asOnDate),
      paymentMethod: { $ne: 'cash' },
      paymentStatus: { $in: ['pending', 'completed'] },
      expectedSettlementDate: { $exists: true, $gt: asOnDate },
    })
      .select('invoiceNumber saleNumber customerName paymentMethod paymentStatus totalAmount expectedSettlementDate treasuryAccountName')
      .lean(),
    Sale.find({
      ...postedSaleAsOnMatch(asOnDate),
      invoiceType: 'credit',
      outstandingAmount: { $gt: 0 },
    })
      .select('invoiceNumber saleNumber customerName dueDate outstandingAmount paymentMethod')
      .sort({ dueDate: 1, createdAt: 1 })
      .lean(),
    getDerivedBookEntriesUntil(asOnDate),
  ]);

  const latestCashCountByAccount = new Map<string, any>();
  for (const row of cashCounts as any[]) {
    const key = String(row.treasuryAccountId || '');
    if (!key || latestCashCountByAccount.has(key)) continue;
    latestCashCountByAccount.set(key, row);
  }

  const cashDrawerRows = (cashAccounts as any[]).map((account: any) => {
    const latest = latestCashCountByAccount.get(String(account._id));
    const calculatedBalance = round2(
      toNumber(account.openingBalance)
      + (treasuryEntries as any[])
        .filter((entry: any) => String(entry.treasuryAccountId || '') === String(account._id))
        .reduce((sum: number, entry: any) => sum + Number(entry.signedAmount || 0), 0)
    );
    return {
      treasuryAccountId: String(account._id),
      drawerName: String(account.displayName || 'Cash Drawer'),
      openingBalance: round2(toNumber(account.openingBalance)),
      calculatedBalance,
      physicalAmount: round2(toNumber(latest?.physicalAmount)),
      varianceAmount: round2(toNumber(latest?.varianceAmount)),
      countDate: latest?.countDate || null,
    };
  });

  const undepositedRows = (unsettledSales as any[])
    .map((row: any) => ({
      referenceNo: String(row.invoiceNumber || row.saleNumber || ''),
      customerName: String(row.customerName || 'Walk-in Customer'),
      paymentMethod: String(row.paymentMethod || ''),
      treasuryAccountName: String(row.treasuryAccountName || ''),
      expectedSettlementDate: row.expectedSettlementDate,
      amount: round2(toNumber(row.totalAmount)),
      source: 'sale',
    }))
    .sort(
    (left, right) =>
      safeDate(left.expectedSettlementDate, asOnDate).getTime() - safeDate(right.expectedSettlementDate, asOnDate).getTime()
  );

  const receivableRows = (openCreditSales as any[]).map((row: any) => ({
    invoiceNumber: String(row.invoiceNumber || row.saleNumber || ''),
    customerName: String(row.customerName || 'Walk-in Customer'),
    dueDate: row.dueDate || null,
    paymentMethod: String(row.paymentMethod || ''),
    outstandingAmount: round2(toNumber(row.outstandingAmount)),
  }));

  const inventoryValue = round2(toNumber((valuation as any)?.summary?.value));
  const cashDrawerBalance = round2(
    cashDrawerRows.reduce((sum, row) => sum + Number(row.calculatedBalance || 0), 0)
  );
  const pendingSettlementAmount = round2(undepositedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const receivableBalance = round2(receivableRows.reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0));
  const taxCollected = round2(context.invoices.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
  const taxReversal = round2(context.notes.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0));
  const netOutputTax = round2(taxCollected - taxReversal);

  const assetRows: Array<{ accountName: string; amount: number }> = [
    { accountName: 'Catalog Inventory', amount: inventoryValue },
    { accountName: 'POS Credit Receivables', amount: receivableBalance },
    { accountName: 'Cash Drawers', amount: cashDrawerBalance },
    { accountName: 'Pending Digital Settlements', amount: pendingSettlementAmount },
  ].filter((row) => Number(row.amount || 0) !== 0);

  if (netOutputTax < 0) {
    assetRows.push({ accountName: 'GST Recoverable From Sales', amount: Math.abs(netOutputTax) });
  }

  const liabilityRows: Array<{ accountName: string; amount: number }> = [];
  if (netOutputTax > 0) {
    liabilityRows.push({ accountName: 'Output GST Payable (POS)', amount: netOutputTax });
  }

  const totalAssets = round2(assetRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalLiabilities = round2(liabilityRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalEquity = round2(totalAssets - totalLiabilities);

  return {
    report: {
      assets: assetRows,
      liabilities: liabilityRows,
      equityRows: [{ accountName: 'Store Net Position', amount: totalEquity }],
      totals: {
        totalAssets,
        totalLiabilities,
        totalEquity,
      },
    },
    operationalSummary: {
      cashDrawerBalance,
      undepositedReceipts: pendingSettlementAmount,
      inventoryValue,
      salesReceivables: receivableBalance,
      taxPayable: Math.max(0, netOutputTax),
      latestDayEndCash:
        (dayClosings as any[]).length > 0
          ? round2(toNumber((dayClosings as any[])[0]?.physicalClosingCash || (dayClosings as any[])[0]?.systemClosingCash))
          : 0,
    },
    cashDrawerRows,
    undepositedRows,
    receivableRows,
  };
};

export const summarizePosSalesSummaryByShiftFromContext = (
  context: Pick<PosReportContext, 'invoices' | 'returns'>
) => {
  const summaryMap = new Map<string, any>();

  for (const row of context.invoices) {
    const key = `${row.dateKey}|${row.shiftName}`;
    const current = summaryMap.get(key) || {
      dateKey: row.dateKey,
      shiftName: row.shiftName,
      invoices: 0,
      grossSales: 0,
      discounts: 0,
      taxes: 0,
      returns: 0,
      netSales: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      cash: 0,
      card: 0,
      upi: 0,
      bank: 0,
      other: 0,
    };
    current.invoices += 1;
    current.grossSales = round2(current.grossSales + Number(row.grossSalesAmount || 0));
    current.discounts = round2(current.discounts + Number(row.discountAmount || 0));
    current.taxes = round2(current.taxes + Number(row.taxAmount || 0));
    current.netSales = round2(current.netSales + Number(row.taxableValue || 0));
    current.totalSales = round2(current.totalSales + Number(row.totalAmount || 0));
    current.amountCollected = round2(current.amountCollected + Number(row.amountCollected || 0));
    current.storeCreditUsed = round2(current.storeCreditUsed + Number(row.storeCreditUsed || 0));
    const paymentSplits = Array.isArray(row.paymentSplits) && row.paymentSplits.length
      ? row.paymentSplits
      : Number(row.amountCollected || 0) > 0
        ? [{ method: row.paymentMethod, amount: Number(row.amountCollected || 0) }]
        : [];
    for (const split of paymentSplits) {
      const method = String(split?.method || '').toLowerCase();
      const amount = round2(Number(split?.amount || 0));
      if (amount <= 0) continue;
      if (method === 'cash') current.cash = round2(current.cash + amount);
      else if (method === 'card') current.card = round2(current.card + amount);
      else if (method === 'upi') current.upi = round2(current.upi + amount);
      else if (method === 'bank_transfer' || method === 'online' || method === 'cheque') current.bank = round2(current.bank + amount);
      else current.other = round2(current.other + amount);
    }
    summaryMap.set(key, current);
  }

  for (const row of context.returns) {
    const key = `${row.dateKey}|${row.shiftName}`;
    const current = summaryMap.get(key) || {
      dateKey: row.dateKey,
      shiftName: row.shiftName,
      invoices: 0,
      grossSales: 0,
      discounts: 0,
      taxes: 0,
      returns: 0,
      netSales: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      cash: 0,
      card: 0,
      upi: 0,
      bank: 0,
      other: 0,
    };
    current.returns = round2(current.returns + Number(row.returnedAmount || 0));
    current.netSales = round2(current.netSales - Number(row.returnedAmount || 0));
    current.taxes = round2(current.taxes - Number(row.returnedTax || 0));
    current.totalSales = round2(current.totalSales - Number(row.refundAmount || 0));
    summaryMap.set(key, current);
  }

  const rows = Array.from(summaryMap.values())
    .map((row) => ({
      ...row,
      netSalesAfterReturns: round2(Number(row.netSales || 0)),
      totalSalesAfterReturns: round2(Number(row.totalSales || 0)),
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.shiftName.localeCompare(right.shiftName));

  return {
    summary: {
      grossSales: round2(rows.reduce((sum, row) => sum + Number(row.grossSales || 0), 0)),
      returns: round2(rows.reduce((sum, row) => sum + Number(row.returns || 0), 0)),
      discounts: round2(rows.reduce((sum, row) => sum + Number(row.discounts || 0), 0)),
      taxes: round2(rows.reduce((sum, row) => sum + Number(row.taxes || 0), 0)),
      netSales: round2(rows.reduce((sum, row) => sum + Number(row.netSalesAfterReturns || 0), 0)),
      totalSales: round2(rows.reduce((sum, row) => sum + Number(row.totalSalesAfterReturns || 0), 0)),
      amountCollected: round2(rows.reduce((sum, row) => sum + Number(row.amountCollected || 0), 0)),
      storeCreditUsed: round2(rows.reduce((sum, row) => sum + Number(row.storeCreditUsed || 0), 0)),
      shifts: rows.length,
    },
    rows,
  };
};

export const buildPosSalesSummaryByShift = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  return summarizePosSalesSummaryByShiftFromContext(context);
};

export const buildPosTaxSummaryReport = async (start: Date, end: Date, storeGstin = '') => {
  const [context, rawReturns] = await Promise.all([
    loadPosReportContext(start, end, storeGstin),
    Return.find({ createdAt: { $gte: start, $lte: end }, returnStatus: 'approved' }).lean(),
  ]);
  const salesMap = new Map<number, any>();
  const returnMap = new Map<number, any>();
  const invoiceBySaleId = new Map(context.invoices.map((row) => [row.saleId, row]));

  for (const line of context.saleLines) {
    if (line.isNonGst) continue;
    const key = round2(line.gstRate);
    const current = salesMap.get(key) || {
      gstRate: key,
      taxableValue: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
    };
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount + Number(line.gstTaxAmount || 0));
    current.cgstAmount = round2(current.cgstAmount + Number(line.cgstAmount || 0));
    current.sgstAmount = round2(current.sgstAmount + Number(line.sgstAmount || 0));
    current.igstAmount = round2(current.igstAmount + Number(line.igstAmount || 0));
    current.cessAmount = round2(current.cessAmount + Number(line.cessAmount || 0));
    salesMap.set(key, current);
  }

  for (const row of rawReturns as any[]) {
    const saleId = row.saleId ? String(row.saleId) : '';
    const invoice = saleId ? invoiceBySaleId.get(saleId) : undefined;
    for (const item of Array.isArray(row.items) ? row.items : []) {
      const key = round2(toNumber((item as any).gstRate));
      const lineTax = round2(toNumber((item as any).lineTax));
      const isInterState = Boolean(invoice?.isInterState);
      const igstAmount = isInterState ? lineTax : 0;
      const splitTax = isInterState ? 0 : round2(lineTax / 2);
      const current = returnMap.get(key) || {
        gstRate: key,
        taxableValue: 0,
        taxAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
      };
      current.taxableValue = round2(current.taxableValue + toNumber((item as any).lineSubtotal));
      current.taxAmount = round2(current.taxAmount + lineTax);
      current.cgstAmount = round2(current.cgstAmount + splitTax);
      current.sgstAmount = round2(current.sgstAmount + splitTax);
      current.igstAmount = round2(current.igstAmount + igstAmount);
      returnMap.set(key, current);
    }
  }

  const salesTax = Array.from(salesMap.values()).sort((left, right) => left.gstRate - right.gstRate);
  const returnTax = Array.from(returnMap.values()).sort((left, right) => left.gstRate - right.gstRate);
  return {
    salesTax,
    returnTax,
    summary: {
      salesTax: round2(salesTax.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)),
      returnTax: round2(returnTax.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)),
      netTax: round2(
        salesTax.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)
          - returnTax.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)
      ),
    },
  };
};

export const buildPosHsnSalesReport = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const summary = new Map<string, any>();
  for (const line of context.saleLines) {
    const key = line.hsnCode || 'UNSPECIFIED';
    const current = summary.get(key) || {
      hsnCode: key,
      quantity: 0,
      taxableValue: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 0,
    };
    current.quantity = round2(current.quantity + Number(line.quantity || 0));
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount + Number(line.gstTaxAmount || 0));
    current.cgstAmount = round2(current.cgstAmount + Number(line.cgstAmount || 0));
    current.sgstAmount = round2(current.sgstAmount + Number(line.sgstAmount || 0));
    current.igstAmount = round2(current.igstAmount + Number(line.igstAmount || 0));
    current.cessAmount = round2(current.cessAmount + Number(line.cessAmount || 0));
    current.totalAmount = round2(current.totalAmount + Number(line.totalAmount || 0));
    summary.set(key, current);
  }
  for (const line of context.returnLines) {
    const key = line.hsnCode || 'UNSPECIFIED';
    const current = summary.get(key) || {
      hsnCode: key,
      quantity: 0,
      taxableValue: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 0,
    };
    current.quantity = round2(current.quantity - Number(line.quantity || 0));
    current.taxableValue = round2(current.taxableValue - Number(line.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount - Number(line.taxAmount || 0));
    current.cgstAmount = round2(current.cgstAmount - Number(line.cgstAmount || 0));
    current.sgstAmount = round2(current.sgstAmount - Number(line.sgstAmount || 0));
    current.igstAmount = round2(current.igstAmount - Number(line.igstAmount || 0));
    current.cessAmount = round2(current.cessAmount - Number(line.cessAmount || 0));
    current.totalAmount = round2(current.totalAmount - Number(line.totalAmount || 0));
    summary.set(key, current);
  }
  return {
    summary: {
      hsnCodes: summary.size,
      taxableValue: round2(
        context.saleLines.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)
        - context.returnLines.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)
      ),
      taxAmount: round2(
        context.saleLines.reduce((sum, row) => sum + Number(row.gstTaxAmount || 0), 0)
        - context.returnLines.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)
      ),
    },
    rows: Array.from(summary.values()).sort((left, right) => left.hsnCode.localeCompare(right.hsnCode)),
  };
};

export const buildPosTaxabilityReport = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const rows = [
    {
      category: 'Taxable',
      taxableValue: round2(
        context.saleLines
          .filter((row) => !row.isNonGst && Number(row.gstRate || 0) > 0)
          .reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)
      ),
      taxAmount: round2(
        context.saleLines
          .filter((row) => !row.isNonGst && Number(row.gstRate || 0) > 0)
          .reduce((sum, row) => sum + Number(row.gstTaxAmount || 0), 0)
      ),
    },
    { category: 'Exempt', taxableValue: 0, taxAmount: 0 },
    {
      category: 'Nil Rated',
      taxableValue: round2(
        context.saleLines
          .filter((row) => !row.isNonGst && Number(row.gstRate || 0) <= 0)
          .reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)
      ),
      taxAmount: 0,
    },
    {
      category: 'Non GST',
      taxableValue: round2(
        context.saleLines.filter((row) => row.isNonGst).reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)
      ),
      taxAmount: 0,
    },
  ];

  return {
    rows,
    notes: [
      'POS items currently distinguish GST vs non-GST from the bill and tax type.',
      'Zero-rate GST lines are treated as nil-rated. Exempt value remains zero until item master explicitly tags exempt supplies.',
    ],
  };
};

export const buildPosB2BvsB2CReport = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const rows = context.invoices.map((row) => ({
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate,
    customerName: row.customerName,
    customerGstin: row.customerGstin || '',
    classification: row.classification.toUpperCase(),
    paymentMethod: row.paymentMethod,
    taxableValue: row.taxableValue,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    placeOfSupply: row.placeOfSupply || '',
    shiftName: row.shiftName,
  }));

  return {
    summary: {
      b2bInvoices: rows.filter((row) => row.classification === 'B2B').length,
      b2clInvoices: rows.filter((row) => row.classification === 'B2CL').length,
      b2csInvoices: rows.filter((row) => row.classification === 'B2CS').length,
      taxableValue: round2(rows.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
    },
    rows,
  };
};

export const buildPosNoteRegister = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  return {
    summary: {
      notes: context.notes.length,
      taxableValue: round2(context.notes.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
      taxAmount: round2(context.notes.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)),
      totalAmount: round2(context.notes.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
    },
    rows: context.notes,
  };
};

export const buildDetailedSalesRegisterFromContext = (context: Pick<PosReportContext, 'saleLines' | 'invoices'>) => {
  const invoiceBySaleId = new Map(context.invoices.map((row) => [row.saleId, row]));
  const renderedInvoiceIds = new Set<string>();

  const rows = [...context.saleLines]
    .sort(
      (left, right) =>
        right.invoiceDate.getTime() - left.invoiceDate.getTime()
        || String(left.invoiceNumber || '').localeCompare(String(right.invoiceNumber || ''))
        || String(left.productName || '').localeCompare(String(right.productName || ''))
    )
    .map((line) => {
      const invoice = invoiceBySaleId.get(line.saleId);
      const isInvoiceHeaderRow = !renderedInvoiceIds.has(line.saleId);
      renderedInvoiceIds.add(line.saleId);
      return {
        invoiceDate: line.invoiceDate,
        invoiceNumber: line.invoiceNumber,
        customerName: line.customerName,
        customerGstin: line.customerGstin || '',
        itemName: line.productName,
        sku: line.sku,
        hsnCode: line.hsnCode,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxableValue: line.taxableValue,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        subtotalBeforeRoundOff: line.totalAmount,
        roundOffAmount: isInvoiceHeaderRow ? round2(Number(invoice?.roundOffAmount || 0)) : null,
        finalInvoiceTotal: isInvoiceHeaderRow ? round2(Number(invoice?.totalAmount || line.totalAmount || 0)) : null,
        amountCollected: isInvoiceHeaderRow ? round2(Number(invoice?.amountCollected || 0)) : null,
        paymentMethod: line.paymentMethod,
        shiftName: line.shiftName,
      };
    });

  return {
    summary: {
      rows: rows.length,
      invoices: context.invoices.length,
      taxableValue: round2(context.invoices.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
      gstAmount: round2(context.invoices.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)),
      totalBeforeRoundOff: round2(
        context.invoices.reduce(
          (sum, row) =>
            sum
            + Number(
              row.totalBeforeRoundOff !== undefined
                ? row.totalBeforeRoundOff
                : round2(Number(row.taxableValue || 0) + Number(row.taxAmount || 0) + Number(row.cessAmount || 0))
            ),
          0
        )
      ),
      roundOffAmount: round2(context.invoices.reduce((sum, row) => sum + Number(row.roundOffAmount || 0), 0)),
      totalAmount: round2(context.invoices.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
      amountCollected: round2(context.invoices.reduce((sum, row) => sum + Number(row.amountCollected || 0), 0)),
    },
    rows,
  };
};

export const buildPosSalesRegister = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  return buildDetailedSalesRegisterFromContext(context);
};

export const buildPosPaymentReconciliation = async (
  start: Date,
  end: Date,
  storeGstin = '',
  options: { includeAccountingCore?: boolean } = {}
) => {
  const includeAccountingCore = options.includeAccountingCore !== false;
  const context = await loadPosReportContext(start, end, storeGstin);
  const accountingPayments = includeAccountingCore
    ? await AccountingPayment.find({
        paymentDate: { $gte: start, $lte: end },
        status: 'posted',
      }).sort({ paymentDate: 1, createdAt: 1 })
    : [];
  const summary = new Map<string, any>();
  for (const row of context.invoices) {
    const channel = row.paymentChannelLabel || row.processorName || 'direct';
    const invoiceCollected = round2(Number(row.amountCollected || 0));
    const paymentSplits = Array.isArray(row.paymentSplits) && row.paymentSplits.length
      ? row.paymentSplits
      : invoiceCollected > 0
        ? [{ method: row.paymentMethod, amount: invoiceCollected }]
        : [];
    for (const split of paymentSplits) {
      const method = String(split?.method || row.paymentMethod || '').trim().toLowerCase() || 'cash';
      const collectedAmount = round2(Number(split?.amount || 0));
      if (collectedAmount <= 0) continue;
      const ratio = invoiceCollected > 0 ? collectedAmount / invoiceCollected : 0;
      const key = `pos|${method}|${channel}`;
      const current = summary.get(key) || {
        source: 'pos',
        paymentMethod: method,
        channel,
        invoices: 0,
        payments: 0,
        amountCollected: 0,
        storeCreditUsed: 0,
        settlementAmount: 0,
        outstandingAmount: 0,
        pendingSettlement: 0,
        taxableValue: 0,
        taxAmount: 0,
      };
      current.invoices += 1;
      current.amountCollected = round2(current.amountCollected + collectedAmount);
      current.settlementAmount = round2(current.settlementAmount + collectedAmount);
      current.taxableValue = round2(current.taxableValue + Number(row.taxableValue || 0) * ratio);
      current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0) * ratio);
      if (row.paymentStatus !== 'completed') {
        current.pendingSettlement = round2(current.pendingSettlement + collectedAmount);
      }
      summary.set(key, current);
    }
    if (Number(row.storeCreditUsed || 0) > 0) {
      const ratio = Number(row.totalAmount || 0) > 0 ? Number(row.storeCreditUsed || 0) / Number(row.totalAmount || 0) : 0;
      const key = 'pos|store_credit|customer-credit';
      const current = summary.get(key) || {
        source: 'pos',
        paymentMethod: 'store_credit',
        channel: 'customer-credit',
        invoices: 0,
        payments: 0,
        amountCollected: 0,
        storeCreditUsed: 0,
        settlementAmount: 0,
        outstandingAmount: 0,
        pendingSettlement: 0,
        taxableValue: 0,
        taxAmount: 0,
      };
      current.invoices += 1;
      current.storeCreditUsed = round2(current.storeCreditUsed + Number(row.storeCreditUsed || 0));
      current.settlementAmount = round2(current.settlementAmount + Number(row.storeCreditUsed || 0));
      current.taxableValue = round2(current.taxableValue + Number(row.taxableValue || 0) * ratio);
      current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0) * ratio);
      summary.set(key, current);
    }
  }
  for (const row of accountingPayments as any[]) {
    const key = `accounting|${row.mode}|accounting-core`;
    const current = summary.get(key) || {
      source: 'accounting_core',
      paymentMethod: row.mode,
      channel: 'accounting-core',
      invoices: 0,
      payments: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      settlementAmount: 0,
      outstandingAmount: 0,
      pendingSettlement: 0,
      taxableValue: 0,
      taxAmount: 0,
      paymentNumbers: [] as string[],
    };
    current.payments += 1;
    current.amountCollected = round2(current.amountCollected + Number(row.amount || 0));
    current.settlementAmount = round2(current.settlementAmount + Number(row.amount || 0));
    current.paymentNumbers = [...(current.paymentNumbers || []), row.paymentNumber].filter(Boolean).slice(0, 25);
    summary.set(key, current);
  }
  return {
    summary: {
      methods: summary.size,
      amountCollected: round2(
        context.invoices.reduce((sum, row) => sum + Number(row.amountCollected || 0), 0) +
        (accountingPayments as any[]).reduce((sum, row) => sum + Number(row.amount || 0), 0)
      ),
      storeCreditUsed: round2(context.invoices.reduce((sum, row) => sum + Number(row.storeCreditUsed || 0), 0)),
      settlementAmount: round2(
        context.invoices.reduce((sum, row) => sum + Number(row.amountCollected || 0) + Number(row.storeCreditUsed || 0), 0) +
        (accountingPayments as any[]).reduce((sum, row) => sum + Number(row.amount || 0), 0)
      ),
      outstandingAmount: round2(context.invoices.reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0)),
    },
    rows: Array.from(summary.values()).sort((left, right) => right.settlementAmount - left.settlementAmount),
  };
};

export const buildPosZReport = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const dayEndRows = await DayEndClosing.find({
    businessDate: { $gte: start, $lte: end },
  }).sort({ businessDate: -1 }).lean();
  const dayEndMap = new Map((dayEndRows as any[]).map((row: any) => [String(row.dateKey || ''), row]));

  const summaryMap = new Map<string, any>();
  for (const row of context.invoices) {
    const current = summaryMap.get(row.dateKey) || {
      dateKey: row.dateKey,
      invoices: 0,
      grossSales: 0,
      taxAmount: 0,
      returns: 0,
      discounts: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      cashSales: 0,
      digitalSales: 0,
      systemClosingCash: 0,
      physicalClosingCash: 0,
      variance: 0,
    };
    current.invoices += 1;
    current.grossSales = round2(current.grossSales + Number(row.grossSalesAmount || 0));
    current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0));
    current.discounts = round2(current.discounts + Number(row.discountAmount || 0));
    current.totalSales = round2(current.totalSales + Number(row.totalAmount || 0));
    current.amountCollected = round2(current.amountCollected + Number(row.amountCollected || 0));
    current.storeCreditUsed = round2(current.storeCreditUsed + Number(row.storeCreditUsed || 0));
    const paymentSplits = Array.isArray(row.paymentSplits) && row.paymentSplits.length
      ? row.paymentSplits
      : Number(row.amountCollected || 0) > 0
        ? [{ method: row.paymentMethod, amount: Number(row.amountCollected || 0) }]
        : [];
    for (const split of paymentSplits) {
      const method = String(split?.method || '').toLowerCase();
      const amount = round2(Number(split?.amount || 0));
      if (amount <= 0) continue;
      if (method === 'cash') current.cashSales = round2(current.cashSales + amount);
      else current.digitalSales = round2(current.digitalSales + amount);
    }
    summaryMap.set(row.dateKey, current);
  }
  for (const row of context.returns) {
    const current = summaryMap.get(row.dateKey) || {
      dateKey: row.dateKey,
      invoices: 0,
      grossSales: 0,
      taxAmount: 0,
      returns: 0,
      discounts: 0,
      totalSales: 0,
      amountCollected: 0,
      storeCreditUsed: 0,
      cashSales: 0,
      digitalSales: 0,
      systemClosingCash: 0,
      physicalClosingCash: 0,
      variance: 0,
    };
    current.returns = round2(current.returns + Number(row.returnedAmount || 0));
    current.taxAmount = round2(current.taxAmount - Number(row.returnedTax || 0));
    current.totalSales = round2(current.totalSales - Number(row.refundAmount || 0));
    summaryMap.set(row.dateKey, current);
  }

  const rows = Array.from(summaryMap.values())
    .map((row) => {
      const closing = dayEndMap.get(row.dateKey);
      return {
        ...row,
        netSales: round2(Number(row.grossSales || 0) - Number(row.discounts || 0) - Number(row.returns || 0)),
        systemClosingCash: round2(toNumber((closing as any)?.systemClosingCash)),
        physicalClosingCash: round2(toNumber((closing as any)?.physicalClosingCash)),
        variance: round2(toNumber((closing as any)?.variance)),
        cashReceipts: round2(toNumber((closing as any)?.cashReceipts)),
        cashExpenses: round2(toNumber((closing as any)?.cashExpenses)),
      };
    })
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  return {
    summary: {
      days: rows.length,
      grossSales: round2(rows.reduce((sum, row) => sum + Number(row.grossSales || 0), 0)),
      returns: round2(rows.reduce((sum, row) => sum + Number(row.returns || 0), 0)),
      discounts: round2(rows.reduce((sum, row) => sum + Number(row.discounts || 0), 0)),
      netSales: round2(rows.reduce((sum, row) => sum + Number(row.netSales || 0), 0)),
      totalSales: round2(rows.reduce((sum, row) => sum + Number(row.totalSales || 0), 0)),
      cashSales: round2(rows.reduce((sum, row) => sum + Number(row.cashSales || 0), 0)),
      digitalSales: round2(rows.reduce((sum, row) => sum + Number(row.digitalSales || 0), 0)),
      storeCreditUsed: round2(rows.reduce((sum, row) => sum + Number(row.storeCreditUsed || 0), 0)),
    },
    rows,
  };
};

export const buildPosInventoryMovement = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const movement = summarizePosInventoryMovementFromContext(context);
  const soldProductIds = new Set<string>();
  for (const row of movement.soldRows) {
    soldProductIds.add(String(row.productId || ''));
  }

  const soldInventoryProductIds = validObjectIds(Array.from(soldProductIds));
  const stockAlerts = soldInventoryProductIds.length
    ? await Product.find({ _id: { $in: soldInventoryProductIds } })
        .select('_id name sku stock minStock itemType')
        .lean()
    : [];

  return {
    summary: {
      soldItems: movement.summary.soldItems,
      quantitySold: movement.summary.netQuantity,
      soldQuantity: movement.summary.soldQuantity,
      returnQuantity: movement.summary.returnQuantity,
      soldCogsAmount: movement.summary.soldCogsAmount,
      returnCogsAmount: movement.summary.returnCogsAmount,
      cogsAmount: movement.summary.cogsAmount,
      stockAlerts: (stockAlerts as any[]).filter((row: any) => toNumber(row.stock) <= toNumber(row.minStock)).length,
    },
    soldRows: movement.soldRows,
    returnRows: movement.returnRows,
    netRows: movement.netRows,
    stockAlerts: (stockAlerts as any[])
      .filter((row: any) => String(row.itemType || 'inventory') === 'inventory' && toNumber(row.stock) <= toNumber(row.minStock))
      .map((row: any) => ({
        productId: String(row._id),
        productName: String(row.name || ''),
        sku: String(row.sku || ''),
        stock: round2(toNumber(row.stock)),
        minStock: round2(toNumber(row.minStock)),
        alert: toNumber(row.stock) <= 0 ? 'Out of stock' : 'Low stock',
      }))
      .sort((left, right) => left.stock - right.stock),
  };
};

export const buildPosMembershipSales = async (start: Date, end: Date) => {
  const subscriptions = await MemberSubscription.find({
    $or: [
      { createdAt: { $gte: start, $lte: end } },
      { 'renewalHistory.renewalDate': { $gte: start, $lte: end } },
    ],
  })
    .populate('planId')
    .lean();

  const rows: any[] = [];
  for (const row of subscriptions as any[]) {
    const plan = row.planId as any;
    const renewalHistory = Array.isArray(row.renewalHistory) ? row.renewalHistory : [];
    const renewalTotal = round2(renewalHistory.reduce((sum: number, item: any) => sum + toNumber(item.amountPaid), 0));
    const initialPaid = round2(Math.max(0, toNumber(row.amountPaid) - renewalTotal));

    if (row.createdAt && safeDate(row.createdAt) >= start && safeDate(row.createdAt) <= end) {
      const totalDays = Math.max(1, Math.round((safeDate(row.endDate).getTime() - safeDate(row.startDate).getTime()) / 86_400_000));
      const earnedDays = Math.max(
        0,
        Math.min(totalDays, Math.round((Math.min(safeDate(row.endDate).getTime(), end.getTime()) - safeDate(row.startDate).getTime()) / 86_400_000))
      );
      const recognized = round2((initialPaid * earnedDays) / totalDays);
      rows.push({
        eventType: 'New Subscription',
        eventDate: safeDate(row.createdAt),
        memberCode: String(row.memberCode || ''),
        memberName: String(row.memberName || ''),
        planName: String(plan?.name || ''),
        amountPaid: initialPaid,
        amountDue: round2(toNumber(row.amountDue)),
        recognizedRevenue: recognized,
        deferredRevenue: round2(Math.max(0, initialPaid - recognized)),
      });
    }

    for (const renewal of renewalHistory) {
      const renewalDate = safeDate(renewal?.renewalDate);
      if (renewalDate < start || renewalDate > end) continue;
      const totalDays = Math.max(1, Number(renewal?.daysExtended || plan?.durationDays || 30));
      const recognizedDays = Math.max(
        0,
        Math.min(totalDays, Math.round((Math.min(safeDate(renewal?.newEndDate, end).getTime(), end.getTime()) - renewalDate.getTime()) / 86_400_000))
      );
      const amountPaid = round2(toNumber(renewal?.amountPaid));
      const recognized = round2((amountPaid * recognizedDays) / totalDays);
      rows.push({
        eventType: 'Renewal',
        eventDate: renewalDate,
        memberCode: String(row.memberCode || ''),
        memberName: String(row.memberName || ''),
        planName: String(plan?.name || ''),
        amountPaid,
        amountDue: 0,
        recognizedRevenue: recognized,
        deferredRevenue: round2(Math.max(0, amountPaid - recognized)),
      });
    }
  }

  rows.sort((left, right) => right.eventDate.getTime() - left.eventDate.getTime());
  return {
    summary: {
      events: rows.length,
      amountPaid: round2(rows.reduce((sum, row) => sum + Number(row.amountPaid || 0), 0)),
      recognizedRevenue: round2(rows.reduce((sum, row) => sum + Number(row.recognizedRevenue || 0), 0)),
      deferredRevenue: round2(rows.reduce((sum, row) => sum + Number(row.deferredRevenue || 0), 0)),
      openReceivables: round2(rows.reduce((sum, row) => sum + Number(row.amountDue || 0), 0)),
    },
    rows,
  };
};

export const buildPosGstHandoff = async (start: Date, end: Date, storeGstin = '') => {
  const [context, taxSummary, hsnReport, advanceReceipts] = await Promise.all([
    loadPosReportContext(start, end, storeGstin),
    buildPosTaxSummaryReport(start, end, storeGstin),
    buildPosHsnSalesReport(start, end, storeGstin),
    ReceiptVoucher.find({
      entryDate: { $gte: start, $lte: end },
      isAdvance: true,
    })
      .select('voucherNumber customerName entryDate mode amount unappliedAmount')
      .lean(),
  ]);

  const monthKeys = enumerateMonthKeys(start, end);
  const monthlyMap = new Map(
    monthKeys.map((key) => [key, { monthKey: key, taxableValue: 0, taxAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, cessAmount: 0 }])
  );
  for (const line of context.saleLines.filter((row) => !row.isNonGst)) {
    const current = monthlyMap.get(line.monthKey) || {
      monthKey: line.monthKey,
      taxableValue: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
    };
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount + Number(line.gstTaxAmount || 0));
    current.cgstAmount = round2(current.cgstAmount + Number(line.cgstAmount || 0));
    current.sgstAmount = round2(current.sgstAmount + Number(line.sgstAmount || 0));
    current.igstAmount = round2(current.igstAmount + Number(line.igstAmount || 0));
    current.cessAmount = round2(current.cessAmount + Number(line.cessAmount || 0));
    monthlyMap.set(line.monthKey, current);
  }
  const monthlyTaxLiability = Array.from(monthlyMap.values()).sort((left, right) => left.monthKey.localeCompare(right.monthKey));

  return {
    summary: {
      b2bInvoices: context.invoices.filter((row) => row.classification === 'b2b').length,
      b2cInvoices: context.invoices.filter((row) => row.classification !== 'b2b').length,
      hsnRows: hsnReport.rows.length,
      notes: context.notes.length,
      advanceReceipts: (advanceReceipts as any[]).length,
      taxLiability: round2(monthlyTaxLiability.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)),
    },
    b2bInvoices: context.invoices.filter((row) => row.classification === 'b2b'),
    b2cInvoices: context.invoices.filter((row) => row.classification !== 'b2b'),
    hsnSummary: hsnReport.rows,
    notes: context.notes,
    advanceReceipts: (advanceReceipts as any[]).map((row: any) => ({
      voucherNumber: String(row.voucherNumber || ''),
      entryDate: row.entryDate,
      customerName: String(row.customerName || 'Walk-in Customer'),
      mode: String(row.mode || ''),
      amount: round2(toNumber(row.amount)),
      unappliedAmount: round2(toNumber(row.unappliedAmount)),
    })),
    monthlyTaxLiability,
    taxSummary,
  };
};
