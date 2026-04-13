import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { CreditNote } from '../models/CreditNote.js';
import { Customer } from '../models/Customer.js';
import { GstReconciliationRun } from '../models/GstReconciliationRun.js';
import { GstReturnRecord } from '../models/GstReturnRecord.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { Return } from '../models/Return.js';
import { Sale } from '../models/Sale.js';
import { Supplier } from '../models/Supplier.js';

export interface GstinValidationResult {
  normalizedGstin: string;
  isValid: boolean;
  formatValid: boolean;
  checksumValid: boolean;
  stateCode?: string;
  pan?: string;
  entityCode?: string;
  source: 'local_checksum';
  message: string;
}

export interface HsnValidationResult {
  normalizedCode: string;
  isValid: boolean;
  codeType: 'hsn' | 'sac' | 'unknown';
  length: number;
  requiresMinDigits: number;
  suggestedRate: number;
  matchLevel: 'exact' | 'prefix_4' | 'prefix_2' | 'default';
  message: string;
}

export interface ParsedGstr2bRow {
  supplierGstin: string;
  supplierName?: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  eligible: boolean;
}

interface GstSupplyLine {
  source: 'sale' | 'accounting_invoice';
  sourceId: string;
  sourceReference: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customerId?: string;
  customerName: string;
  customerGstin?: string;
  placeOfSupply: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  gstRate: number;
  quantity: number;
  hsnCode?: string;
  isRegistered: boolean;
  isInterState: boolean;
}

interface GstCreditDebitNoteRow {
  noteNumber: string;
  noteDate: Date;
  referenceInvoiceNumber?: string;
  customerName?: string;
  customerGstin?: string;
  taxableValue: number;
  taxAmount: number;
  totalAmount: number;
  category: 'credit_note' | 'return_adjustment';
}

interface OutwardSourceBundle {
  warnings: string[];
  lines: GstSupplyLine[];
  notes: GstCreditDebitNoteRow[];
}

interface Gstr3bAdjustmentInput {
  itcReversal?: number;
  reverseChargeTax?: number;
  interest?: number;
  lateFee?: number;
  otherItcReduction?: number;
}

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const HSN_RATE_HINTS: Record<string, number> = {
  '9506': 18,
  '950699': 18,
  '6112': 12,
  '6211': 12,
  '9983': 18,
  '9985': 18,
  '9987': 18,
};

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const absoluteNumber = (value: unknown): number => round2(Math.max(0, Number(value || 0)));
const upper = (value: unknown): string => String(value || '').trim().toUpperCase();
const normalizeText = (value: unknown): string => String(value || '').trim();

const normalizeInvoiceToken = (value: unknown): string =>
  upper(value).replace(/[^A-Z0-9]/g, '');

const toBase36Value = (char: string): number => BASE36.indexOf(String(char || '').toUpperCase());

const computeGstinChecksum = (gstinWithoutChecksum: string): string => {
  let factor = 1;
  let sum = 0;
  for (const char of String(gstinWithoutChecksum || '')) {
    const codePoint = toBase36Value(char);
    if (codePoint < 0) return '';
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }
  const checkCodePoint = (36 - (sum % 36)) % 36;
  return BASE36[checkCodePoint] || '';
};

export const validateGstinLocally = (value: unknown): GstinValidationResult => {
  const normalizedGstin = upper(value);
  const formatValid = GSTIN_REGEX.test(normalizedGstin);
  const checksumValid = formatValid && computeGstinChecksum(normalizedGstin.slice(0, 14)) === normalizedGstin.slice(14);
  const isValid = formatValid && checksumValid;
  return {
    normalizedGstin,
    isValid,
    formatValid,
    checksumValid,
    stateCode: normalizedGstin.slice(0, 2) || undefined,
    pan: normalizedGstin.slice(2, 12) || undefined,
    entityCode: normalizedGstin.slice(12, 13) || undefined,
    source: 'local_checksum',
    message: isValid ? 'GSTIN format and checksum are valid.' : 'GSTIN failed format or checksum validation.',
  };
};

export const validateHsnSacCode = (
  value: unknown,
  options: { turnoverBand?: 'up_to_5cr' | 'above_5cr' } = {}
): HsnValidationResult => {
  const normalizedCode = String(value || '').trim().replace(/\s+/g, '');
  const isNumeric = /^\d+$/.test(normalizedCode);
  const isSac = isNumeric && normalizedCode.startsWith('998');
  const codeType: 'hsn' | 'sac' | 'unknown' = isSac ? 'sac' : isNumeric ? 'hsn' : 'unknown';
  const length = normalizedCode.length;
  const requiresMinDigits = options.turnoverBand === 'above_5cr' ? 6 : 4;

  const validHsn = isNumeric && [2, 4, 6, 8].includes(length);
  const validSac = isNumeric && isSac && [5, 6].includes(length);
  const isValid = codeType === 'sac' ? validSac : codeType === 'hsn' ? validHsn : false;

  let matchLevel: 'exact' | 'prefix_4' | 'prefix_2' | 'default' = 'default';
  let suggestedRate = 18;
  if (HSN_RATE_HINTS[normalizedCode]) {
    suggestedRate = HSN_RATE_HINTS[normalizedCode];
    matchLevel = 'exact';
  } else if (HSN_RATE_HINTS[normalizedCode.slice(0, 4)]) {
    suggestedRate = HSN_RATE_HINTS[normalizedCode.slice(0, 4)];
    matchLevel = 'prefix_4';
  } else if (HSN_RATE_HINTS[normalizedCode.slice(0, 2)]) {
    suggestedRate = HSN_RATE_HINTS[normalizedCode.slice(0, 2)];
    matchLevel = 'prefix_2';
  }

  let message = 'HSN/SAC code is valid.';
  if (!isValid) {
    message = 'HSN/SAC code is invalid. Use HSN as 2/4/6/8 digits or SAC as 5/6 digits starting with 998.';
  } else if (codeType === 'hsn' && options.turnoverBand === 'above_5cr' && length < 6) {
    message = 'HSN is valid, but turnover above 5 crore usually requires 6-digit HSN.';
  }

  return {
    normalizedCode,
    isValid,
    codeType,
    length,
    requiresMinDigits,
    suggestedRate,
    matchLevel,
    message,
  };
};

const stateCodeFromGstin = (gstin?: string): string => {
  const validation = validateGstinLocally(gstin || '');
  return validation.isValid ? String(validation.stateCode || '') : '';
};

export const normalizePeriodInput = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return raw;
  if (/^\d{6}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
  }
  return '';
};

const monthCodeForPeriod = (periodKey: string): string => periodKey.replace('-', '');

const buildPeriodWindow = (periodKey: string): { start: Date; end: Date } => {
  const normalized = normalizePeriodInput(periodKey);
  if (!normalized) throw new Error('Period must be in YYYY-MM format');
  const [year, month] = normalized.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
};

export const normalizeFinancialYearInput = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{4}$/.test(raw)) return raw;
  return '';
};

const buildFinancialYearWindow = (financialYear: string): { start: Date; end: Date; months: string[] } => {
  const normalized = normalizeFinancialYearInput(financialYear);
  if (!normalized) throw new Error('Financial year must be in YYYY-YYYY format');
  const [startYear, endYear] = normalized.split('-').map(Number);
  const start = new Date(startYear, 3, 1);
  const end = new Date(endYear, 2, 31, 23, 59, 59, 999);
  const months: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
  }
  return { start, end, months };
};

export const financialYearForDate = (value: Date): string => {
  const date = new Date(value);
  const year = date.getFullYear();
  if (date.getMonth() >= 3) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
};

const safeDate = (value: unknown, fallback?: Date): Date => {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return fallback ? new Date(fallback) : new Date();
};

const dayDifference = (left: Date, right: Date): number =>
  Math.floor(Math.abs(left.getTime() - right.getTime()) / 86_400_000);

const isEligible2bItc = (value: unknown): boolean => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['y', 'yes', 'eligible', 'true', '1'].includes(normalized);
};

const buildInvoiceClassification = (invoiceValue: number, isRegistered: boolean, isInterState: boolean): 'b2b' | 'b2cl' | 'b2cs' => {
  if (isRegistered) return 'b2b';
  if (isInterState && invoiceValue > 250000) return 'b2cl';
  return 'b2cs';
};

const buildOutwardSourceBundle = async (window: { start: Date; end: Date }, storeGstin?: string): Promise<OutwardSourceBundle> => {
  const warnings: string[] = [];
  const postedSaleMatch = {
    createdAt: { $gte: window.start, $lte: window.end },
    saleStatus: { $in: ['completed', 'returned'] },
    $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
  };
  const invoiceMatch = {
    invoiceDate: { $gte: window.start, $lte: window.end },
    status: { $in: ['posted', 'partial', 'paid'] },
    referenceType: { $ne: 'sale' },
  };

  const [sales, invoices, creditNotes, returns] = await Promise.all([
    Sale.find(postedSaleMatch).sort({ createdAt: 1 }),
    AccountingInvoice.find(invoiceMatch).sort({ invoiceDate: 1 }),
    CreditNote.find({ createdAt: { $gte: window.start, $lte: window.end }, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 }),
    Return.find({
      createdAt: { $gte: window.start, $lte: window.end },
      returnStatus: 'approved',
      $or: [{ creditNoteId: { $exists: false } }, { creditNoteId: null }, { creditNoteId: '' }],
    }).sort({ createdAt: 1 }),
  ]);

  const customerIds = new Set<string>();
  const saleIdsForNotes = new Set<string>();
  for (const sale of sales) {
    if (sale.customerId) customerIds.add(String(sale.customerId));
  }
  for (const invoice of invoices) {
    if (invoice.customerId) customerIds.add(String(invoice.customerId));
  }
  for (const note of creditNotes) {
    if (note.sourceSaleId) saleIdsForNotes.add(String(note.sourceSaleId));
  }
  for (const row of returns) {
    if (row.customerId) customerIds.add(String(row.customerId));
    if (row.saleId) saleIdsForNotes.add(String(row.saleId));
  }

  const [customers, sourceSales] = await Promise.all([
    customerIds.size ? Customer.find({ _id: { $in: Array.from(customerIds) } }).select('_id name gstin phone email') : [],
    saleIdsForNotes.size ? Sale.find({ _id: { $in: Array.from(saleIdsForNotes) } }).select('_id customerId invoiceNumber saleNumber customerName') : [],
  ]);

  const customerMap = new Map(customers.map((row) => [String(row._id), row]));
  const saleMap = new Map(sourceSales.map((row) => [String(row._id), row]));
  const storeStateCode = stateCodeFromGstin(storeGstin);

  const lines: GstSupplyLine[] = [];
  for (const sale of sales) {
    const customer = sale.customerId ? customerMap.get(String(sale.customerId)) : undefined;
    const customerGstin = upper(customer?.gstin);
    const isRegistered = validateGstinLocally(customerGstin).isValid;
    for (const item of sale.items || []) {
      const taxableValue = round2(
        Number(item.taxableValue ?? round2((Number(item.quantity || 0) * Number(item.unitPrice || 0)) - Number(item.discountAmount || 0)))
      );
      const cgst = absoluteNumber(item.cgstAmount);
      const sgst = absoluteNumber(item.sgstAmount);
      const gstAmount = absoluteNumber(item.gstAmount);
      const igst = absoluteNumber(item.gstAmount !== undefined ? gstAmount - cgst - sgst : 0);
      const placeOfSupply = stateCodeFromGstin(customerGstin) || storeStateCode;
      const isInterState = Boolean(igst > 0 || (placeOfSupply && storeStateCode && placeOfSupply !== storeStateCode));
      lines.push({
        source: 'sale',
        sourceId: String(sale._id),
        sourceReference: sale.saleNumber,
        invoiceNumber: String(sale.invoiceNumber || sale.saleNumber),
        invoiceDate: safeDate(sale.postedAt || sale.createdAt),
        customerId: sale.customerId || undefined,
        customerName: String(sale.customerName || customer?.name || 'Walk-in Customer'),
        customerGstin: customerGstin || undefined,
        placeOfSupply,
        taxableValue,
        cgst,
        sgst,
        igst,
        cess: 0,
        gstRate: absoluteNumber(item.gstRate),
        quantity: absoluteNumber(item.quantity) || 1,
        hsnCode: normalizeText(item.hsnCode) || undefined,
        isRegistered,
        isInterState,
      });
    }
  }

  for (const invoice of invoices) {
    const customer = invoice.customerId ? customerMap.get(String(invoice.customerId)) : undefined;
    const customerGstin = upper(customer?.gstin);
    const isRegistered = validateGstinLocally(customerGstin).isValid;
    const placeOfSupply = stateCodeFromGstin(customerGstin) || storeStateCode;
    const isInterState = Boolean(Number(invoice.igstAmount || 0) > 0 || (placeOfSupply && storeStateCode && placeOfSupply !== storeStateCode));
    if (!normalizeText((invoice.metadata as any)?.hsnCode)) {
      warnings.push(`Accounting invoice ${invoice.invoiceNumber} has no HSN/SAC code. Review before portal upload.`);
    }
    lines.push({
      source: 'accounting_invoice',
      sourceId: String(invoice._id),
      sourceReference: invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: safeDate(invoice.invoiceDate),
      customerId: invoice.customerId || undefined,
      customerName: String(invoice.customerName || customer?.name || 'Unspecified customer'),
      customerGstin: customerGstin || undefined,
      placeOfSupply,
      taxableValue: absoluteNumber(invoice.baseAmount),
      cgst: absoluteNumber(invoice.cgstAmount),
      sgst: absoluteNumber(invoice.sgstAmount),
      igst: absoluteNumber(invoice.igstAmount),
      cess: 0,
      gstRate: invoice.baseAmount ? round2((Number(invoice.gstAmount || 0) / Number(invoice.baseAmount || 1)) * 100) : 0,
      quantity: 1,
      hsnCode: normalizeText((invoice.metadata as any)?.hsnCode) || undefined,
      isRegistered,
      isInterState,
    });
  }

  const notes: GstCreditDebitNoteRow[] = [];
  for (const note of creditNotes) {
    const sourceSale = note.sourceSaleId ? saleMap.get(String(note.sourceSaleId)) : undefined;
    const customer = sourceSale?.customerId ? customerMap.get(String(sourceSale.customerId)) : undefined;
    notes.push({
      noteNumber: note.noteNumber,
      noteDate: safeDate(note.issuedAt || note.createdAt),
      referenceInvoiceNumber: sourceSale?.invoiceNumber || sourceSale?.saleNumber,
      customerName: note.customerName || sourceSale?.customerName || customer?.name,
      customerGstin: upper(customer?.gstin) || undefined,
      taxableValue: absoluteNumber(note.subtotal),
      taxAmount: absoluteNumber(note.taxAmount),
      totalAmount: absoluteNumber(note.totalAmount),
      category: 'credit_note',
    });
  }

  for (const row of returns) {
    const sourceSale = row.saleId ? saleMap.get(String(row.saleId)) : undefined;
    const customer = row.customerId ? customerMap.get(String(row.customerId)) : sourceSale?.customerId ? customerMap.get(String(sourceSale.customerId)) : undefined;
    notes.push({
      noteNumber: row.returnNumber,
      noteDate: safeDate(row.approvedAt || row.createdAt),
      referenceInvoiceNumber: row.sourceInvoiceNumber || sourceSale?.invoiceNumber || sourceSale?.saleNumber,
      customerName: row.customerName || sourceSale?.customerName || customer?.name,
      customerGstin: upper(customer?.gstin) || undefined,
      taxableValue: absoluteNumber(row.returnedAmount),
      taxAmount: absoluteNumber(row.returnedGst),
      totalAmount: absoluteNumber(row.refundAmount),
      category: 'return_adjustment',
    });
  }

  return { warnings: Array.from(new Set(warnings)), lines, notes };
};

const aggregateHsnSummary = (lines: GstSupplyLine[]) => {
  const summary = new Map<string, { hsnCode: string; quantity: number; taxableValue: number; cgst: number; sgst: number; igst: number; cess: number }>();
  for (const line of lines) {
    const hsnCode = normalizeText(line.hsnCode) || 'UNSPECIFIED';
    const current = summary.get(hsnCode) || {
      hsnCode,
      quantity: 0,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
    };
    current.quantity = round2(current.quantity + Number(line.quantity || 0));
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.cgst = round2(current.cgst + Number(line.cgst || 0));
    current.sgst = round2(current.sgst + Number(line.sgst || 0));
    current.igst = round2(current.igst + Number(line.igst || 0));
    current.cess = round2(current.cess + Number(line.cess || 0));
    summary.set(hsnCode, current);
  }
  return Array.from(summary.values()).sort((left, right) => left.hsnCode.localeCompare(right.hsnCode));
};

export const buildGstr1Preview = async (input: { periodKey: string; storeGstin?: string }) => {
  const periodKey = normalizePeriodInput(input.periodKey);
  const { start, end } = buildPeriodWindow(periodKey);
  const bundle = await buildOutwardSourceBundle({ start, end }, input.storeGstin);

  const invoiceMap = new Map<string, any>();
  for (const line of bundle.lines) {
    const key = `${line.source}:${line.sourceId}`;
    const current = invoiceMap.get(key) || {
      source: line.source,
      sourceId: line.sourceId,
      sourceReference: line.sourceReference,
      invoiceNumber: line.invoiceNumber,
      invoiceDate: line.invoiceDate,
      customerName: line.customerName,
      customerGstin: line.customerGstin,
      placeOfSupply: line.placeOfSupply,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      cess: 0,
      invoiceValue: 0,
      lines: [] as GstSupplyLine[],
      isRegistered: line.isRegistered,
      isInterState: line.isInterState,
    };
    current.taxableValue = round2(current.taxableValue + line.taxableValue);
    current.cgst = round2(current.cgst + line.cgst);
    current.sgst = round2(current.sgst + line.sgst);
    current.igst = round2(current.igst + line.igst);
    current.cess = round2(current.cess + line.cess);
    current.invoiceValue = round2(current.invoiceValue + line.taxableValue + line.cgst + line.sgst + line.igst + line.cess);
    current.lines.push(line);
    invoiceMap.set(key, current);
  }

  const invoiceRows = Array.from(invoiceMap.values()).map((row) => ({
    ...row,
    classification: buildInvoiceClassification(row.invoiceValue, row.isRegistered, row.isInterState),
  }));

  const b2b = invoiceRows.filter((row) => row.classification === 'b2b');
  const b2cl = invoiceRows.filter((row) => row.classification === 'b2cl');
  const b2cs = invoiceRows.filter((row) => row.classification === 'b2cs');
  const hsnSummary = aggregateHsnSummary(bundle.lines);

  const summary = {
    periodKey,
    periodCode: monthCodeForPeriod(periodKey),
    counts: {
      totalInvoices: invoiceRows.length,
      b2b: b2b.length,
      b2cl: b2cl.length,
      b2cs: b2cs.length,
      notes: bundle.notes.length,
      hsn: hsnSummary.length,
    },
    totals: {
      taxableValue: round2(invoiceRows.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
      cgst: round2(invoiceRows.reduce((sum, row) => sum + Number(row.cgst || 0), 0)),
      sgst: round2(invoiceRows.reduce((sum, row) => sum + Number(row.sgst || 0), 0)),
      igst: round2(invoiceRows.reduce((sum, row) => sum + Number(row.igst || 0), 0)),
      cess: round2(invoiceRows.reduce((sum, row) => sum + Number(row.cess || 0), 0)),
      noteValue: round2(bundle.notes.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
      noteTax: round2(bundle.notes.reduce((sum, row) => sum + Number(row.taxAmount || 0), 0)),
    },
  };

  return {
    summary,
    warnings: bundle.warnings,
    invoiceRows,
    noteRows: bundle.notes,
    hsnSummary,
    payload: {
      schemaVersion: 'sarva-gst-offline-v1',
      filingMode: 'offline_prepare_only',
      gstin: upper(input.storeGstin),
      fp: monthCodeForPeriod(periodKey),
      generatedAt: new Date().toISOString(),
      b2b: b2b.map((row) => ({
        ctin: row.customerGstin,
        pos: row.placeOfSupply,
        inum: row.invoiceNumber,
        idt: row.invoiceDate.toISOString().slice(0, 10),
        val: row.invoiceValue,
        txval: row.taxableValue,
        cgst: row.cgst,
        sgst: row.sgst,
        igst: row.igst,
        cess: row.cess,
      })),
      b2cl: b2cl.map((row) => ({
        pos: row.placeOfSupply,
        inum: row.invoiceNumber,
        idt: row.invoiceDate.toISOString().slice(0, 10),
        val: row.invoiceValue,
        txval: row.taxableValue,
        igst: row.igst,
        cess: row.cess,
      })),
      b2cs: b2cs.map((row) => ({
        pos: row.placeOfSupply || '',
        inum: row.invoiceNumber,
        idt: row.invoiceDate.toISOString().slice(0, 10),
        val: row.invoiceValue,
        txval: row.taxableValue,
        cgst: row.cgst,
        sgst: row.sgst,
        igst: row.igst,
        cess: row.cess,
      })),
      cdnr: bundle.notes
        .filter((row) => validateGstinLocally(row.customerGstin).isValid)
        .map((row) => ({
          ctin: row.customerGstin,
          ntNum: row.noteNumber,
          ntDt: row.noteDate.toISOString().slice(0, 10),
          rsn: row.category,
          inum: row.referenceInvoiceNumber || '',
          txval: row.taxableValue,
          tax: row.taxAmount,
          val: row.totalAmount,
        })),
      cdnur: bundle.notes
        .filter((row) => !validateGstinLocally(row.customerGstin).isValid)
        .map((row) => ({
          ntNum: row.noteNumber,
          ntDt: row.noteDate.toISOString().slice(0, 10),
          rsn: row.category,
          inum: row.referenceInvoiceNumber || '',
          txval: row.taxableValue,
          tax: row.taxAmount,
          val: row.totalAmount,
        })),
      hsn: hsnSummary,
      meta: {
        warnings: bundle.warnings,
        sourceCounts: summary.counts,
      },
    },
  };
};

export const buildGstr3bPreview = async (input: {
  periodKey: string;
  storeGstin?: string;
  adjustments?: Gstr3bAdjustmentInput;
}) => {
  const periodKey = normalizePeriodInput(input.periodKey);
  const { start, end } = buildPeriodWindow(periodKey);
  const bundle = await buildOutwardSourceBundle({ start, end }, input.storeGstin);
  const latestReconciliation = await GstReconciliationRun.findOne({ periodKey }).sort({ createdAt: -1 });
  const itcReversal = absoluteNumber(input.adjustments?.itcReversal);
  const reverseChargeTax = absoluteNumber(input.adjustments?.reverseChargeTax);
  const interest = absoluteNumber(input.adjustments?.interest);
  const lateFee = absoluteNumber(input.adjustments?.lateFee);
  const otherItcReduction = absoluteNumber(input.adjustments?.otherItcReduction);

  let taxableValue = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;
  let nilExemptNonGst = 0;

  for (const line of bundle.lines) {
    const taxValue = round2(Number(line.cgst || 0) + Number(line.sgst || 0) + Number(line.igst || 0) + Number(line.cess || 0));
    if (line.gstRate <= 0 || taxValue <= 0) {
      nilExemptNonGst = round2(nilExemptNonGst + Number(line.taxableValue || 0));
      continue;
    }
    taxableValue = round2(taxableValue + Number(line.taxableValue || 0));
    cgst = round2(cgst + Number(line.cgst || 0));
    sgst = round2(sgst + Number(line.sgst || 0));
    igst = round2(igst + Number(line.igst || 0));
    cess = round2(cess + Number(line.cess || 0));
  }

  const eligibleItc = latestReconciliation?.eligibleItc || { cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 };
  const grossItc = {
    cgst: absoluteNumber(eligibleItc.cgst),
    sgst: absoluteNumber(eligibleItc.sgst),
    igst: absoluteNumber(eligibleItc.igst),
    cess: absoluteNumber(eligibleItc.cess),
  };
  const grossItcTotal = round2(grossItc.cgst + grossItc.sgst + grossItc.igst + grossItc.cess);
  const itcReduction = round2(itcReversal + otherItcReduction);
  const netItc = round2(Math.max(0, grossItcTotal - itcReduction));
  const grossOutputTax = round2(cgst + sgst + igst + cess);
  const netTaxPayable = round2(Math.max(0, grossOutputTax + reverseChargeTax + interest + lateFee - netItc));

  const summary = {
    periodKey,
    periodCode: monthCodeForPeriod(periodKey),
    isNilReturn: grossOutputTax === 0 && nilExemptNonGst === 0 && netItc === 0,
    latestReconciliationId: latestReconciliation?._id?.toString() || null,
    outwardTaxableValue: taxableValue,
    grossOutputTax,
    netItc,
    netTaxPayable,
  };

  return {
    summary,
    warnings: bundle.warnings,
    tables: {
      table3_1: {
        outwardTaxableSupplies: { taxableValue, cgst, sgst, igst, cess },
        reverseCharge: { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: reverseChargeTax },
      },
      table4: {
        availableItc: grossItc,
        totalAvailable: grossItcTotal,
        reversal: {
          itcReversal,
          otherItcReduction,
          totalReversal: itcReduction,
        },
        netAvailable: netItc,
      },
      table5: {
        exemptNilNonGst: {
          totalValue: nilExemptNonGst,
        },
      },
      table6: {
        reverseCharge: {
          totalTax: reverseChargeTax,
        },
      },
      table7: {
        interestAndLateFee: {
          interest,
          lateFee,
        },
      },
      table8: {
        otherSupplies: {
          totalValue: 0,
        },
      },
    },
    payload: {
      schemaVersion: 'sarva-gst-offline-v1',
      filingMode: 'offline_prepare_only',
      gstin: upper(input.storeGstin),
      periodCode: monthCodeForPeriod(periodKey),
      generatedAt: new Date().toISOString(),
      summary,
      tables: {
        table3_1: {
          taxable: taxableValue,
          cgst,
          sgst,
          igst,
          cess,
        },
        table4: {
          grossItc,
          itcReversal,
          otherItcReduction,
          netItc,
        },
        table5: {
          nilExemptNonGst,
        },
        table6: { reverseChargeTax },
        table7: { interest, lateFee },
      },
      source: {
        latestReconciliationId: latestReconciliation?._id?.toString() || null,
      },
    },
  };
};

export const buildGstr9Preview = async (input: { financialYear: string; storeGstin?: string }) => {
  const financialYear = normalizeFinancialYearInput(input.financialYear);
  const { start, end, months } = buildFinancialYearWindow(financialYear);
  const bundle = await buildOutwardSourceBundle({ start, end }, input.storeGstin);
  const [savedReturns, reconciliationRuns] = await Promise.all([
    GstReturnRecord.find({ financialYear, returnType: { $in: ['GSTR1', 'GSTR3B'] } }).sort({ generatedAt: 1 }),
    GstReconciliationRun.find({ periodKey: { $in: months } }).sort({ createdAt: -1 }),
  ]);

  const monthBuckets = new Map<string, { outwardTaxableValue: number; tax: number; notes: number }>();
  for (const month of months) {
    monthBuckets.set(month, { outwardTaxableValue: 0, tax: 0, notes: 0 });
  }

  for (const line of bundle.lines) {
    const periodKey = `${line.invoiceDate.getFullYear()}-${String(line.invoiceDate.getMonth() + 1).padStart(2, '0')}`;
    const current = monthBuckets.get(periodKey);
    if (!current) continue;
    current.outwardTaxableValue = round2(current.outwardTaxableValue + Number(line.taxableValue || 0));
    current.tax = round2(current.tax + Number(line.cgst || 0) + Number(line.sgst || 0) + Number(line.igst || 0) + Number(line.cess || 0));
  }
  for (const note of bundle.notes) {
    const periodKey = `${note.noteDate.getFullYear()}-${String(note.noteDate.getMonth() + 1).padStart(2, '0')}`;
    const current = monthBuckets.get(periodKey);
    if (!current) continue;
    current.notes = round2(current.notes + Number(note.totalAmount || 0));
  }

  const latestRunByPeriod = new Map<string, any>();
  for (const run of reconciliationRuns) {
    if (!latestRunByPeriod.has(run.periodKey)) latestRunByPeriod.set(run.periodKey, run);
  }

  const reconciledItc = Array.from(latestRunByPeriod.values()).reduce((sum, run) => sum + Number(run?.eligibleItc?.total || 0), 0);
  const claimedItc = savedReturns
    .filter((row) => row.returnType === 'GSTR3B')
    .reduce((sum, row) => sum + Number(row.summary?.netItc || row.summary?.netITC || 0), 0);

  const monthlyBreakdown = months.map((periodKey) => {
    const monthSummary = monthBuckets.get(periodKey) || { outwardTaxableValue: 0, tax: 0, notes: 0 };
    const gstr1 = savedReturns.find((row) => row.returnType === 'GSTR1' && row.periodKey === periodKey);
    const gstr3b = savedReturns.find((row) => row.returnType === 'GSTR3B' && row.periodKey === periodKey);
    return {
      periodKey,
      outwardTaxableValue: monthSummary.outwardTaxableValue,
      tax: monthSummary.tax,
      noteValue: monthSummary.notes,
      gstr1Status: gstr1?.status || 'not_saved',
      gstr3bStatus: gstr3b?.status || 'not_saved',
      eligibleItc: round2(Number(latestRunByPeriod.get(periodKey)?.eligibleItc?.total || 0)),
    };
  });

  const summary = {
    financialYear,
    outwardTaxableValue: round2(bundle.lines.reduce((sum, line) => sum + Number(line.taxableValue || 0), 0)),
    outwardTax: round2(bundle.lines.reduce((sum, line) => sum + Number(line.cgst || 0) + Number(line.sgst || 0) + Number(line.igst || 0) + Number(line.cess || 0), 0)),
    noteValue: round2(bundle.notes.reduce((sum, note) => sum + Number(note.totalAmount || 0), 0)),
    reconciledItc: round2(reconciledItc),
    claimedItc: round2(claimedItc),
    table8Difference: round2(claimedItc - reconciledItc),
  };

  return {
    summary,
    warnings: bundle.warnings,
    monthlyBreakdown,
    payload: {
      schemaVersion: 'sarva-gst-offline-v1',
      filingMode: 'offline_prepare_only',
      gstin: upper(input.storeGstin),
      financialYear,
      generatedAt: new Date().toISOString(),
      summary,
      monthlyBreakdown,
      tables: {
        table4: {
          outwardTaxableValue: summary.outwardTaxableValue,
          outwardTax: summary.outwardTax,
        },
        table8: {
          itcAsPerReconciliation: summary.reconciledItc,
          itcClaimedIn3B: summary.claimedItc,
          difference: summary.table8Difference,
        },
      },
    },
  };
};

const splitPurchaseTax = (taxAmount: number, supplierGstin: string, storeGstin?: string) => {
  const supplierState = stateCodeFromGstin(supplierGstin);
  const storeState = stateCodeFromGstin(storeGstin);
  if (supplierState && storeState && supplierState !== storeState) {
    return { cgst: 0, sgst: 0, igst: round2(taxAmount), cess: 0 };
  }
  return {
    cgst: round2(taxAmount / 2),
    sgst: round2(taxAmount / 2),
    igst: 0,
    cess: 0,
  };
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
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

const pickKey = (row: Record<string, any>, candidates: string[]): any => {
  for (const candidate of candidates) {
    const hit = Object.keys(row).find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (hit) return row[hit];
  }
  return undefined;
};

export const parseGstr2bImportText = (text: unknown): ParsedGstr2bRow[] => {
  const raw = String(text || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((row) => ({
        supplierGstin: upper(pickKey(row, ['supplierGstin', 'gstin', 'ctin'])),
        supplierName: normalizeText(pickKey(row, ['supplierName', 'legalName', 'tradeName'])),
        invoiceNumber: normalizeText(pickKey(row, ['invoiceNumber', 'inum', 'invoiceNo'])),
        invoiceDate: normalizeText(pickKey(row, ['invoiceDate', 'idt', 'date'])),
        taxableValue: absoluteNumber(pickKey(row, ['taxableValue', 'txval', 'taxable'])),
        cgst: absoluteNumber(pickKey(row, ['cgst', 'cgstAmount'])),
        sgst: absoluteNumber(pickKey(row, ['sgst', 'sgstAmount'])),
        igst: absoluteNumber(pickKey(row, ['igst', 'igstAmount'])),
        cess: absoluteNumber(pickKey(row, ['cess', 'cessAmount'])),
        eligible: isEligible2bItc(pickKey(row, ['eligible', 'eligibility', 'itcEligibility'])),
      })).filter((row) => row.supplierGstin && row.invoiceNumber);
    }
  } catch {
    // JSON parsing is optional. CSV parsing below handles plain-text imports.
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const mapped: Record<string, string> = {};
    headers.forEach((header, index) => {
      mapped[header] = cells[index] || '';
    });
    return mapped;
  });

  return rows.map((row) => ({
    supplierGstin: upper(pickKey(row, ['supplierGstin', 'gstin', 'ctin', 'supplier gstin'])),
    supplierName: normalizeText(pickKey(row, ['supplierName', 'supplier name', 'legalName', 'tradeName'])),
    invoiceNumber: normalizeText(pickKey(row, ['invoiceNumber', 'invoice number', 'inum', 'invoiceNo'])),
    invoiceDate: normalizeText(pickKey(row, ['invoiceDate', 'invoice date', 'idt', 'date'])),
    taxableValue: absoluteNumber(pickKey(row, ['taxableValue', 'taxable value', 'txval', 'taxable'])),
    cgst: absoluteNumber(pickKey(row, ['cgst', 'cgst amount'])),
    sgst: absoluteNumber(pickKey(row, ['sgst', 'sgst amount'])),
    igst: absoluteNumber(pickKey(row, ['igst', 'igst amount'])),
    cess: absoluteNumber(pickKey(row, ['cess', 'cess amount'])),
    eligible: isEligible2bItc(pickKey(row, ['eligible', 'eligibility', 'itcEligibility', 'itc eligibility'])),
  })).filter((row) => row.supplierGstin && row.invoiceNumber);
};

export const buildGstr2bReconciliation = async (input: {
  periodKey: string;
  importRows: ParsedGstr2bRow[];
  decisions?: Record<string, 'pending' | 'accept_supplier' | 'keep_ledger' | 'ignore'>;
  storeGstin?: string;
}) => {
  const periodKey = normalizePeriodInput(input.periodKey);
  const { start, end } = buildPeriodWindow(periodKey);
  const purchaseOrders = await PurchaseOrder.find({
    orderDate: { $gte: start, $lte: end },
    status: { $in: ['pending', 'partially_received', 'completed', 'returned'] },
  }).populate('supplierId', 'name supplierCode gstin');

  const supplierIds = Array.from(
    new Set(
      purchaseOrders
        .map((row: any) => String(row.supplierId?._id || row.supplierId || '').trim())
        .filter(Boolean)
    )
  );
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds } }).select('_id name supplierCode gstin')
    : [];
  const supplierMap = new Map(suppliers.map((row) => [String(row._id), row]));

  const ledgerRows = purchaseOrders.map((order) => {
    const supplier = supplierMap.get(String((order as any).supplierId?._id || order.supplierId));
    const supplierGstin = upper((supplier as any)?.gstin);
    const taxSplit = splitPurchaseTax(Number(order.taxAmount || 0), supplierGstin, input.storeGstin);
    return {
      supplierGstin,
      supplierName: String((supplier as any)?.name || (order as any).supplierId?.name || ''),
      invoiceNumber: String(order.purchaseNumber || '').trim(),
      invoiceDate: safeDate(order.orderDate),
      taxableValue: absoluteNumber(order.subtotal),
      cgst: absoluteNumber(taxSplit.cgst),
      sgst: absoluteNumber(taxSplit.sgst),
      igst: absoluteNumber(taxSplit.igst),
      cess: absoluteNumber(taxSplit.cess),
      totalTax: round2(taxSplit.cgst + taxSplit.sgst + taxSplit.igst + taxSplit.cess),
    };
  });

  const remainingImportRows = [...input.importRows];
  const rows: Array<Record<string, any>> = [];
  const tolerance = 0.01;

  for (const ledger of ledgerRows) {
    const candidates = remainingImportRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        upper(row.supplierGstin) === upper(ledger.supplierGstin)
        && normalizeInvoiceToken(row.invoiceNumber) === normalizeInvoiceToken(ledger.invoiceNumber)
        && dayDifference(safeDate(row.invoiceDate), ledger.invoiceDate) <= 5
      )
      .sort((left, right) => {
        const leftDiff = dayDifference(safeDate(left.row.invoiceDate), ledger.invoiceDate);
        const rightDiff = dayDifference(safeDate(right.row.invoiceDate), ledger.invoiceDate);
        if (leftDiff !== rightDiff) return leftDiff - rightDiff;
        const leftValue = Math.abs(Number(left.row.taxableValue || 0) - Number(ledger.taxableValue || 0));
        const rightValue = Math.abs(Number(right.row.taxableValue || 0) - Number(ledger.taxableValue || 0));
        return leftValue - rightValue;
      });

    const candidate = candidates[0];
    const key = `${upper(ledger.supplierGstin) || 'NO_GSTIN'}|${normalizeInvoiceToken(ledger.invoiceNumber)}|${ledger.invoiceDate.toISOString().slice(0, 10)}`;
    if (!candidate) {
      rows.push({
        key,
        category: 'missing_in_gstr2b',
        decision: input.decisions?.[key] || 'pending',
        supplierGstin: ledger.supplierGstin,
        invoiceNumber: ledger.invoiceNumber,
        invoiceDate: ledger.invoiceDate,
        ledger,
        gst2b: null,
        differences: {},
        recommendedAction: ledger.supplierGstin
          ? 'Ask supplier to upload or amend the invoice in GSTR-1/2B.'
          : 'Add supplier GSTIN before matching this purchase.',
      });
      continue;
    }

    const imported = candidate.row;
    remainingImportRows.splice(candidate.index, 1);
    const differences = {
      taxableValue: round2(Math.abs(Number(ledger.taxableValue || 0) - Number(imported.taxableValue || 0))),
      cgst: round2(Math.abs(Number(ledger.cgst || 0) - Number(imported.cgst || 0))),
      sgst: round2(Math.abs(Number(ledger.sgst || 0) - Number(imported.sgst || 0))),
      igst: round2(Math.abs(Number(ledger.igst || 0) - Number(imported.igst || 0))),
      cess: round2(Math.abs(Number(ledger.cess || 0) - Number(imported.cess || 0))),
      dateDays: dayDifference(safeDate(imported.invoiceDate), ledger.invoiceDate),
    };

    const matched =
      differences.taxableValue <= tolerance
      && differences.cgst <= tolerance
      && differences.sgst <= tolerance
      && differences.igst <= tolerance
      && differences.cess <= tolerance;

    rows.push({
      key,
      category: matched ? 'matched' : 'partial_match',
      decision: input.decisions?.[key] || (matched ? 'accept_supplier' : 'pending'),
      supplierGstin: ledger.supplierGstin,
      invoiceNumber: ledger.invoiceNumber,
      invoiceDate: ledger.invoiceDate,
      ledger,
      gst2b: imported,
      differences,
      recommendedAction: matched
        ? 'Ready for ITC claim.'
        : 'Review value mismatch and accept supplier or keep ledger value.',
    });
  }

  for (const imported of remainingImportRows) {
    const key = `${upper(imported.supplierGstin) || 'NO_GSTIN'}|${normalizeInvoiceToken(imported.invoiceNumber)}|${safeDate(imported.invoiceDate).toISOString().slice(0, 10)}`;
    rows.push({
      key,
      category: 'missing_in_ledger',
      decision: input.decisions?.[key] || 'pending',
      supplierGstin: imported.supplierGstin,
      invoiceNumber: imported.invoiceNumber,
      invoiceDate: safeDate(imported.invoiceDate),
      ledger: null,
      gst2b: imported,
      differences: {},
      recommendedAction: 'Book the purchase or check if the invoice belongs to another period.',
    });
  }

  const eligibleItc = rows.reduce(
    (acc, row) => {
      const decision = String(row.decision || 'pending');
      const category = String(row.category || '');
      const gst2b = row.gst2b || {};
      const ledger = row.ledger || {};
      const eligible = isEligible2bItc(gst2b.eligible);
      const countsTowardItc =
        eligible
        && (category === 'matched' || category === 'reconciled' || (category === 'partial_match' && ['accept_supplier', 'keep_ledger'].includes(decision)));

      if (!countsTowardItc) return acc;

      const ledgerIgst = ledger.igst ?? gst2b.igst ?? 0;
      const ledgerCgst = ledger.cgst ?? gst2b.cgst ?? 0;
      const ledgerSgst = ledger.sgst ?? gst2b.sgst ?? 0;
      const ledgerCess = ledger.cess ?? gst2b.cess ?? 0;
      const igst = round2(Math.min(Number(gst2b.igst || 0), Number(ledgerIgst || 0)));
      const cgst = round2(Math.min(Number(gst2b.cgst || 0), Number(ledgerCgst || 0)));
      const sgst = round2(Math.min(Number(gst2b.sgst || 0), Number(ledgerSgst || 0)));
      const cess = round2(Math.min(Number(gst2b.cess || 0), Number(ledgerCess || 0)));

      acc.igst = round2(acc.igst + igst);
      acc.cgst = round2(acc.cgst + cgst);
      acc.sgst = round2(acc.sgst + sgst);
      acc.cess = round2(acc.cess + cess);
      acc.total = round2(acc.total + igst + cgst + sgst + cess);
      return acc;
    },
    { igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 }
  );

  const summary = {
    periodKey,
    importedRowsCount: input.importRows.length,
    ledgerRowsCount: ledgerRows.length,
    matched: rows.filter((row) => row.category === 'matched').length,
    partialMatch: rows.filter((row) => row.category === 'partial_match').length,
    missingInGstr2b: rows.filter((row) => row.category === 'missing_in_gstr2b').length,
    missingInLedger: rows.filter((row) => row.category === 'missing_in_ledger').length,
    reconciled: rows.filter((row) => row.category === 'reconciled').length,
  };

  return {
    summary,
    rows,
    eligibleItc,
  };
};
