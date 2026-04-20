import { buildBalanceSheetReport, buildProfitLossStatement } from './accountingReports.js';
import { validateGstinLocally } from './gstCompliance.js';
import { buildInventoryValuationRows } from './inventoryCosting.js';
import { CashFloatCount } from '../models/CashFloatCount.js';
import { CreditNote } from '../models/CreditNote.js';
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
  itemType: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
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
  taxableValue: number;
  discountAmount: number;
  taxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  cogsAmount: number;
  outstandingAmount: number;
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
  notes: PosNoteRow[];
  saleLines: PosSaleLine[];
  invoices: PosInvoiceRow[];
}

const postedSaleMatch = (start: Date, end: Date) => ({
  createdAt: { $gte: start, $lte: end },
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
  const invoiceMap = new Map<string, PosInvoiceRow>();
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
      paymentMethod: String(sale.paymentMethod || ''),
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
      taxableValue: 0,
      discountAmount: round2(toNumber(sale.discountAmount)),
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: round2(toNumber(sale.totalAmount)),
      cogsAmount: 0,
      outstandingAmount: round2(toNumber(sale.outstandingAmount)),
      quantity: 0,
      itemCount: Array.isArray(sale.items) ? sale.items.length : 0,
    };

    for (const item of Array.isArray(sale.items) ? sale.items : []) {
      const quantity = round2(toNumber((item as any).quantity));
      const unitPrice = round2(toNumber((item as any).unitPrice));
      const grossLine = round2(quantity * unitPrice);
      const discountAmount = round2(toNumber((item as any).discountAmount));
      const taxableValue = round2(
        (item as any).taxableValue !== undefined
          ? toNumber((item as any).taxableValue)
          : Math.max(0, grossLine - discountAmount)
      );
      const cgstAmount = round2(toNumber((item as any).cgstAmount));
      const sgstAmount = round2(toNumber((item as any).sgstAmount));
      const cessAmount = 0;
      const rawGstAmount = round2(toNumber((item as any).gstAmount));
      const otherTaxAmount = round2(toNumber((item as any).vatAmount));
      const gstTaxAmount = round2(rawGstAmount || cgstAmount + sgstAmount);
      const igstAmount = round2(Math.max(0, gstTaxAmount - cgstAmount - sgstAmount - cessAmount));
      const taxType = String((item as any).taxType || 'gst').toLowerCase();
      const isNonGst = Boolean(sale.isGstBill === false || taxType !== 'gst');
      const taxAmount = round2((isNonGst ? 0 : gstTaxAmount) + (isNonGst ? otherTaxAmount : 0));
      const totalAmount = round2(
        (item as any).lineTotal !== undefined ? toNumber((item as any).lineTotal) : taxableValue + taxAmount
      );
      const isInterState = Boolean(
        igstAmount > 0 || (placeOfSupply && storeStateCode && placeOfSupply !== storeStateCode)
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
        productId: String((item as any).productId || ''),
        productName: String((item as any).productName || ''),
        sku: String((item as any).sku || ''),
        itemType: String((item as any).itemType || 'inventory'),
        hsnCode: upper((item as any).hsnCode) || 'UNSPECIFIED',
        quantity,
        unitPrice,
        discountAmount,
        taxableValue,
        gstRate: round2(toNumber((item as any).gstRate)),
        cgstAmount: isNonGst ? 0 : cgstAmount,
        sgstAmount: isNonGst ? 0 : sgstAmount,
        igstAmount: isNonGst ? 0 : igstAmount,
        cessAmount: isNonGst ? 0 : cessAmount,
        gstTaxAmount: isNonGst ? 0 : gstTaxAmount,
        otherTaxAmount: isNonGst ? otherTaxAmount : 0,
        taxAmount,
        totalAmount,
        cogsAmount: round2(toNumber((item as any).cogsAmount)),
        taxType,
        isNonGst,
      });

      invoiceRow.quantity = round2(invoiceRow.quantity + quantity);
      invoiceRow.taxableValue = round2(invoiceRow.taxableValue + taxableValue);
      invoiceRow.taxAmount = round2(invoiceRow.taxAmount + (isNonGst ? 0 : gstTaxAmount));
      invoiceRow.cgstAmount = round2(invoiceRow.cgstAmount + (isNonGst ? 0 : cgstAmount));
      invoiceRow.sgstAmount = round2(invoiceRow.sgstAmount + (isNonGst ? 0 : sgstAmount));
      invoiceRow.igstAmount = round2(invoiceRow.igstAmount + (isNonGst ? 0 : igstAmount));
      invoiceRow.cessAmount = round2(invoiceRow.cessAmount + (isNonGst ? 0 : cessAmount));
      invoiceRow.cogsAmount = round2(invoiceRow.cogsAmount + round2(toNumber((item as any).cogsAmount)));
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
    notes,
    saleLines,
    invoices: Array.from(invoiceMap.values()).sort((left, right) => right.invoiceDate.getTime() - left.invoiceDate.getTime()),
  };
};

export const buildPosProfitLossReport = async (start: Date, end: Date) => {
  const [statement, context] = await Promise.all([
    buildProfitLossStatement(start, end),
    loadPosReportContext(start, end),
  ]);

  const grossSales = round2(context.invoices.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0));
  const returns = round2(context.returns.reduce((sum, row) => sum + Number(row.returnedAmount || 0), 0));
  const discounts = round2(context.invoices.reduce((sum, row) => sum + Number(row.discountAmount || 0), 0));
  const cogs = round2(context.invoices.reduce((sum, row) => sum + Number(row.cogsAmount || 0), 0));
  const netSales = round2(Math.max(0, grossSales - returns));
  const grossProfit = round2(netSales - cogs);

  const registerMap = new Map<string, any>();
  for (const row of context.invoices) {
    const key = `${row.cashierName}|${row.shiftName}`;
    const current = registerMap.get(key) || {
      register: row.cashierName,
      shiftName: row.shiftName,
      invoices: 0,
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

  return {
    statement,
    posSummary: {
      grossSales,
      returns,
      discounts,
      netSales,
      cogs,
      grossProfit,
      marginPercent: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
      invoices: context.invoices.length,
    },
    registerRows: Array.from(registerMap.values()).sort((left, right) => right.netSales - left.netSales),
  };
};

export const buildPosBalanceSheetReport = async (asOnDate: Date) => {
  const [report, valuation, cashAccounts, cashCounts, dayClosings, unsettledSales, unsettledReceipts, memberSubs] = await Promise.all([
    buildBalanceSheetReport(asOnDate),
    buildInventoryValuationRows({ date: asOnDate }),
    TreasuryAccount.find({ accountType: 'cash_float', isActive: true }).select('_id displayName openingBalance').lean(),
    CashFloatCount.find({ countDate: { $lte: asOnDate } }).sort({ countDate: -1, createdAt: -1 }).lean(),
    DayEndClosing.find({ businessDate: { $lte: asOnDate } }).sort({ businessDate: -1 }).limit(7).lean(),
    Sale.find({
      createdAt: { $lte: asOnDate },
      paymentMethod: { $ne: 'cash' },
      paymentStatus: { $in: ['pending', 'completed'] },
      expectedSettlementDate: { $exists: true, $gt: asOnDate },
      $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
    })
      .select('invoiceNumber saleNumber customerName paymentMethod paymentStatus totalAmount expectedSettlementDate treasuryAccountName')
      .lean(),
    ReceiptVoucher.find({
      entryDate: { $lte: asOnDate },
      mode: { $ne: 'cash' },
      expectedSettlementDate: { $exists: true, $gt: asOnDate },
    })
      .select('voucherNumber customerName mode amount expectedSettlementDate treasuryAccountName')
      .lean(),
    MemberSubscription.find({
      createdAt: { $lte: asOnDate },
      amountDue: { $gt: 0 },
    }).select('memberCode memberName amountDue amountPaid startDate endDate').lean(),
  ]);

  const latestCashCountByAccount = new Map<string, any>();
  for (const row of cashCounts as any[]) {
    const key = String(row.treasuryAccountId || '');
    if (!key || latestCashCountByAccount.has(key)) continue;
    latestCashCountByAccount.set(key, row);
  }

  const cashDrawerRows = (cashAccounts as any[]).map((account: any) => {
    const latest = latestCashCountByAccount.get(String(account._id));
    return {
      treasuryAccountId: String(account._id),
      drawerName: String(account.displayName || 'Cash Drawer'),
      openingBalance: round2(toNumber(account.openingBalance)),
      calculatedBalance: round2(toNumber(latest?.calculatedBalance)),
      physicalAmount: round2(toNumber(latest?.physicalAmount)),
      varianceAmount: round2(toNumber(latest?.varianceAmount)),
      countDate: latest?.countDate || null,
    };
  });

  const undepositedRows = [
    ...(unsettledSales as any[]).map((row: any) => ({
      referenceNo: String(row.invoiceNumber || row.saleNumber || ''),
      customerName: String(row.customerName || 'Walk-in Customer'),
      paymentMethod: String(row.paymentMethod || ''),
      treasuryAccountName: String(row.treasuryAccountName || ''),
      expectedSettlementDate: row.expectedSettlementDate,
      amount: round2(toNumber(row.totalAmount)),
      source: 'sale',
    })),
    ...(unsettledReceipts as any[]).map((row: any) => ({
      referenceNo: String(row.voucherNumber || ''),
      customerName: String(row.customerName || 'Walk-in Customer'),
      paymentMethod: String(row.mode || ''),
      treasuryAccountName: String(row.treasuryAccountName || ''),
      expectedSettlementDate: row.expectedSettlementDate,
      amount: round2(toNumber(row.amount)),
      source: 'receipt',
    })),
  ].sort(
    (left, right) =>
      safeDate(left.expectedSettlementDate, asOnDate).getTime() - safeDate(right.expectedSettlementDate, asOnDate).getTime()
  );

  const membershipReceivableRows = (memberSubs as any[]).map((row: any) => ({
    memberCode: String(row.memberCode || ''),
    memberName: String(row.memberName || 'Member'),
    amountDue: round2(toNumber(row.amountDue)),
    amountPaid: round2(toNumber(row.amountPaid)),
    startDate: row.startDate || null,
    endDate: row.endDate || null,
  }));

  return {
    report,
    operationalSummary: {
      cashDrawerBalance: round2(
        cashDrawerRows.reduce((sum, row) => sum + Number(row.physicalAmount || row.calculatedBalance || 0), 0)
      ),
      undepositedReceipts: round2(undepositedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
      inventoryValue: round2(toNumber((valuation as any)?.summary?.value)),
      membershipReceivables: round2(
        membershipReceivableRows.reduce((sum, row) => sum + Number(row.amountDue || 0), 0)
      ),
      latestDayEndCash:
        (dayClosings as any[]).length > 0
          ? round2(toNumber((dayClosings as any[])[0]?.physicalClosingCash || (dayClosings as any[])[0]?.systemClosingCash))
          : 0,
    },
    cashDrawerRows,
    undepositedRows,
    membershipReceivableRows,
  };
};

export const buildPosSalesSummaryByShift = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
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
      cash: 0,
      card: 0,
      upi: 0,
      other: 0,
    };
    current.invoices += 1;
    current.grossSales = round2(current.grossSales + Number(row.totalAmount || 0));
    current.discounts = round2(current.discounts + Number(row.discountAmount || 0));
    current.taxes = round2(current.taxes + Number(row.taxAmount || 0));
    current.netSales = round2(current.netSales + Number(row.taxableValue || 0));
    const method = String(row.paymentMethod || '').toLowerCase();
    if (method === 'cash') current.cash = round2(current.cash + Number(row.totalAmount || 0));
    else if (method === 'card') current.card = round2(current.card + Number(row.totalAmount || 0));
    else if (method === 'upi') current.upi = round2(current.upi + Number(row.totalAmount || 0));
    else current.other = round2(current.other + Number(row.totalAmount || 0));
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
      cash: 0,
      card: 0,
      upi: 0,
      other: 0,
    };
    current.returns = round2(current.returns + Number(row.refundAmount || 0));
    current.netSales = round2(current.netSales - Number(row.returnedAmount || 0));
    summaryMap.set(key, current);
  }

  const rows = Array.from(summaryMap.values())
    .map((row) => ({
      ...row,
      netSalesAfterReturns: round2(Number(row.netSales || 0)),
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.shiftName.localeCompare(right.shiftName));

  return {
    summary: {
      grossSales: round2(rows.reduce((sum, row) => sum + Number(row.grossSales || 0), 0)),
      returns: round2(rows.reduce((sum, row) => sum + Number(row.returns || 0), 0)),
      discounts: round2(rows.reduce((sum, row) => sum + Number(row.discounts || 0), 0)),
      taxes: round2(rows.reduce((sum, row) => sum + Number(row.taxes || 0), 0)),
      netSales: round2(rows.reduce((sum, row) => sum + Number(row.netSalesAfterReturns || 0), 0)),
      shifts: rows.length,
    },
    rows,
  };
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
  return {
    summary: {
      hsnCodes: summary.size,
      taxableValue: round2(context.saleLines.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
      taxAmount: round2(context.saleLines.reduce((sum, row) => sum + Number(row.gstTaxAmount || 0), 0)),
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

export const buildPosSalesRegister = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const rows = context.saleLines
    .map((line) => ({
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
      totalAmount: line.totalAmount,
      paymentMethod: line.paymentMethod,
      shiftName: line.shiftName,
    }))
    .sort((left, right) => right.invoiceDate.getTime() - left.invoiceDate.getTime());
  return {
    summary: {
      rows: rows.length,
      invoices: context.invoices.length,
      taxableValue: round2(rows.reduce((sum, row) => sum + Number(row.taxableValue || 0), 0)),
      totalAmount: round2(rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
    },
    rows,
  };
};

export const buildPosPaymentReconciliation = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const summary = new Map<string, any>();
  for (const row of context.invoices) {
    const key = `${row.paymentMethod}|${row.paymentChannelLabel || row.processorName || 'direct'}`;
    const current = summary.get(key) || {
      paymentMethod: row.paymentMethod,
      channel: row.paymentChannelLabel || row.processorName || 'direct',
      invoices: 0,
      taxableValue: 0,
      taxAmount: 0,
      totalAmount: 0,
      outstandingAmount: 0,
      pendingSettlement: 0,
    };
    current.invoices += 1;
    current.taxableValue = round2(current.taxableValue + Number(row.taxableValue || 0));
    current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0));
    current.totalAmount = round2(current.totalAmount + Number(row.totalAmount || 0));
    current.outstandingAmount = round2(current.outstandingAmount + Number(row.outstandingAmount || 0));
    if (row.paymentStatus !== 'completed') {
      current.pendingSettlement = round2(current.pendingSettlement + Number(row.totalAmount || 0));
    }
    summary.set(key, current);
  }
  return {
    summary: {
      methods: summary.size,
      totalAmount: round2(context.invoices.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
      outstandingAmount: round2(context.invoices.reduce((sum, row) => sum + Number(row.outstandingAmount || 0), 0)),
    },
    rows: Array.from(summary.values()).sort((left, right) => right.totalAmount - left.totalAmount),
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
      cashSales: 0,
      digitalSales: 0,
      systemClosingCash: 0,
      physicalClosingCash: 0,
      variance: 0,
    };
    current.invoices += 1;
    current.grossSales = round2(current.grossSales + Number(row.totalAmount || 0));
    current.taxAmount = round2(current.taxAmount + Number(row.taxAmount || 0));
    current.discounts = round2(current.discounts + Number(row.discountAmount || 0));
    if (row.paymentMethod === 'cash') current.cashSales = round2(current.cashSales + Number(row.totalAmount || 0));
    else current.digitalSales = round2(current.digitalSales + Number(row.totalAmount || 0));
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
      cashSales: 0,
      digitalSales: 0,
      systemClosingCash: 0,
      physicalClosingCash: 0,
      variance: 0,
    };
    current.returns = round2(current.returns + Number(row.refundAmount || 0));
    summaryMap.set(row.dateKey, current);
  }

  const rows = Array.from(summaryMap.values())
    .map((row) => {
      const closing = dayEndMap.get(row.dateKey);
      return {
        ...row,
        netSales: round2(Number(row.grossSales || 0) - Number(row.returns || 0)),
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
      netSales: round2(rows.reduce((sum, row) => sum + Number(row.netSales || 0), 0)),
      cashSales: round2(rows.reduce((sum, row) => sum + Number(row.cashSales || 0), 0)),
    },
    rows,
  };
};

export const buildPosInventoryMovement = async (start: Date, end: Date, storeGstin = '') => {
  const context = await loadPosReportContext(start, end, storeGstin);
  const soldMap = new Map<string, any>();
  const soldProductIds = new Set<string>();
  for (const line of context.saleLines.filter((row) => row.itemType !== 'service' && row.itemType !== 'non_inventory')) {
    const key = `${line.productId || line.productName}`;
    soldProductIds.add(String(line.productId || ''));
    const current = soldMap.get(key) || {
      productId: line.productId,
      productName: line.productName,
      sku: line.sku,
      quantitySold: 0,
      taxableValue: 0,
      cogsAmount: 0,
      grossProfit: 0,
    };
    current.quantitySold = round2(current.quantitySold + Number(line.quantity || 0));
    current.taxableValue = round2(current.taxableValue + Number(line.taxableValue || 0));
    current.cogsAmount = round2(current.cogsAmount + Number(line.cogsAmount || 0));
    current.grossProfit = round2(current.taxableValue - current.cogsAmount);
    soldMap.set(key, current);
  }

  const stockAlerts = soldProductIds.size
    ? await Product.find({ _id: { $in: Array.from(soldProductIds) } })
        .select('_id name sku stock minStock itemType')
        .lean()
    : [];

  return {
    summary: {
      soldItems: soldMap.size,
      quantitySold: round2(Array.from(soldMap.values()).reduce((sum, row) => sum + Number(row.quantitySold || 0), 0)),
      cogsAmount: round2(Array.from(soldMap.values()).reduce((sum, row) => sum + Number(row.cogsAmount || 0), 0)),
      stockAlerts: (stockAlerts as any[]).filter((row: any) => toNumber(row.stock) <= toNumber(row.minStock)).length,
    },
    soldRows: Array.from(soldMap.values()).sort((left, right) => right.quantitySold - left.quantitySold),
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
