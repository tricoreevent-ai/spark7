import mongoose from 'mongoose';
import { createVendor } from './accountingEngine.js';
import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { AccountingVoucher } from '../models/AccountingVoucher.js';
import { ChartAccount } from '../models/ChartAccount.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { PurchaseBill } from '../models/PurchaseBill.js';
import { Supplier, ISupplierDocument } from '../models/Supplier.js';
import { Vendor, IVendor } from '../models/Vendor.js';
import { getReportEntries } from './reportInclusion.js';

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));

const toIdText = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'object' && value !== null && '$oid' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).$oid || '').trim();
  }
  return String(value || '').trim();
};

const sameId = (left: unknown, right: unknown): boolean => {
  const leftId = toIdText(left);
  const rightId = toIdText(right);
  return Boolean(leftId) && Boolean(rightId) && leftId === rightId;
};

const escapeRegex = (value: string): string =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toDate = (value: unknown): Date | null => {
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateEnd = (value?: Date | string): Date | undefined => {
  const parsed = value ? new Date(value) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime())) return undefined;
  parsed.setHours(23, 59, 59, 999);
  return parsed;
};

const ageBucketKey = (daysOutstanding: number): '0_30' | '31_60' | '61_90' | '90_plus' => {
  if (daysOutstanding <= 30) return '0_30';
  if (daysOutstanding <= 60) return '31_60';
  if (daysOutstanding <= 90) return '61_90';
  return '90_plus';
};

export interface SupplierPayablesRow {
  supplierId: string;
  supplierName: string;
  purchaseBillId: string;
  purchaseBillNo: string;
  purchaseOrderId: string;
  purchaseOrderNo: string;
  billDate: string;
  billAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentReference: string;
  paymentMode: string;
  status: 'Paid' | 'Partial' | 'Pending';
  lastTransactionDate: string;
  accountingVendorId?: string;
  payableLedgerAccountId?: string;
  payableLedgerAccountCode?: string;
  payableLedgerAccountName?: string;
  billJournalEntryId?: string;
  billJournalEntryNumber?: string;
  paymentVoucherId?: string;
  paymentVoucherNumber?: string;
  paymentJournalEntryId?: string;
  paymentJournalEntryNumber?: string;
  paymentCount: number;
}

export interface SupplierAgeingRow {
  supplierId: string;
  supplierName: string;
  totalOutstanding: number;
  bucket0To30: number;
  bucket31To60: number;
  bucket61To90: number;
  bucket90Plus: number;
  payableLedgerOutstanding: number;
  validationDifference: number;
  payableLedgerAccountId?: string;
  payableLedgerAccountCode?: string;
  payableLedgerAccountName?: string;
  accountingVendorId?: string;
  lastTransactionDate?: string;
}

export interface SupplierPayablesReport {
  rows: SupplierPayablesRow[];
  ageing: SupplierAgeingRow[];
  totals: {
    billAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    payableLedgerOutstanding: number;
    validationDifference: number;
    supplierCount: number;
    billCount: number;
    paymentCount: number;
  };
  reconciliation: {
    payableControlAccountId?: string;
    payableControlAccountCode?: string;
    payableControlAccountName?: string;
    payableControlDirectBalance: number;
    payableSubLedgerBalance: number;
    payablePortfolioBalance: number;
    supplierOutstandingBalance: number;
    supplierAgeingOutstandingBalance: number;
    difference: number;
    postingModel: 'settled' | 'control_only' | 'supplier_subledger_direct' | 'mixed';
    status: 'Reconciled' | 'Mismatch';
    reason: string;
  };
  validation: {
    totalsMatch: boolean;
    outstandingMatchesLedger: boolean;
    allSuppliersMapped: boolean;
    apReconciled: boolean;
    mappedSupplierCount: number;
    unmappedSupplierCount: number;
    duplicatePayableLedgerLinks: number;
  };
}

interface SupplierContextRow {
  _id: string;
  name: string;
  accountingVendorId?: string;
  payableLedgerAccountId?: string;
  payableLedgerAccountCode?: string;
  payableLedgerAccountName?: string;
}

interface SupplierPayablesContextBill {
  _id: string;
  purchaseOrderId?: string;
  purchaseNumber?: string;
  billNumber: string;
  billDate: Date;
  supplierId: string;
  supplierName: string;
  totalAmount: number;
  accountingVendorId?: string;
  payableLedgerAccountId?: string;
  billJournalEntryId?: string;
  billJournalEntryNumber?: string;
}

interface SupplierPayablesContextPayment {
  _id: string;
  kind: 'voucher' | 'journal';
  linkedBillId?: string;
  linkedBillNumber?: string;
  paymentDate: Date;
  amount: number;
  paymentMode?: string;
  paymentReference: string;
  paymentVoucherId?: string;
  paymentVoucherNumber?: string;
  paymentJournalEntryId?: string;
  paymentJournalEntryNumber?: string;
}

interface SupplierPayablesContextLedgerBalance {
  accountId: string;
  outstanding: number;
}

export const summarizeSupplierPayablesFromContext = (input: {
  bills: SupplierPayablesContextBill[];
  payments: SupplierPayablesContextPayment[];
  suppliers: SupplierContextRow[];
  ledgerBalances?: SupplierPayablesContextLedgerBalance[];
  payableControlLedger?: {
    accountId?: string;
    accountCode?: string;
    accountName?: string;
    outstanding?: number;
  };
  asOnDate?: Date | string;
}): SupplierPayablesReport => {
  const asOnDate = toDateEnd(input.asOnDate) || new Date();
  const supplierById = new Map<string, SupplierContextRow>(
    (input.suppliers || []).map((row) => [toIdText(row._id), row]),
  );
  const paymentsByBillId = new Map<string, SupplierPayablesContextPayment[]>();
  const paymentsByBillNumber = new Map<string, SupplierPayablesContextPayment[]>();
  for (const payment of input.payments || []) {
    const linkedBillId = toIdText(payment.linkedBillId);
    const linkedBillNumber = String(payment.linkedBillNumber || '').trim();
    if (linkedBillId) {
      paymentsByBillId.set(linkedBillId, [...(paymentsByBillId.get(linkedBillId) || []), payment]);
    }
    if (linkedBillNumber) {
      paymentsByBillNumber.set(linkedBillNumber, [...(paymentsByBillNumber.get(linkedBillNumber) || []), payment]);
    }
  }

  const ledgerOutstandingByAccountId = new Map<string, number>(
    (input.ledgerBalances || []).map((row) => [toIdText(row.accountId), round2(Number(row.outstanding || 0))]),
  );

  const rows: SupplierPayablesRow[] = (input.bills || []).map((bill) => {
    const linkedPayments = [
      ...(paymentsByBillId.get(toIdText(bill._id)) || []),
      ...(paymentsByBillNumber.get(String(bill.billNumber || '').trim()) || []),
    ].filter((payment, index, collection) =>
      collection.findIndex((candidate) => toIdText(candidate._id) === toIdText(payment._id)) === index,
    );

    const paidAmount = round2(linkedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    const outstandingAmount = round2(Math.max(0, Number(bill.totalAmount || 0) - paidAmount));
    const paymentReferences = Array.from(
      new Set(
        linkedPayments
          .map((payment) => payment.paymentReference)
          .map((value) => String(value || '').trim())
          .filter(Boolean),
      ),
    );
    const paymentModes = Array.from(
      new Set(
        linkedPayments
          .map((payment) => String(payment.paymentMode || '').trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    const paymentVoucher = linkedPayments.find((payment) => payment.kind === 'voucher');
    const paymentJournal = linkedPayments.find((payment) => payment.kind === 'journal');
    const latestPayment = [...linkedPayments]
      .sort((left, right) => right.paymentDate.getTime() - left.paymentDate.getTime())[0];
    const lastTransaction = latestPayment?.paymentDate || bill.billDate;
    const supplier = supplierById.get(toIdText(bill.supplierId));

    let status: 'Paid' | 'Partial' | 'Pending' = 'Pending';
    if (outstandingAmount <= 0.01) status = 'Paid';
    else if (paidAmount > 0) status = 'Partial';

    return {
      supplierId: toIdText(bill.supplierId),
      supplierName: String(bill.supplierName || supplier?.name || '').trim() || 'Supplier',
      purchaseBillId: toIdText(bill._id),
      purchaseBillNo: String(bill.billNumber || '').trim(),
      purchaseOrderId: toIdText(bill.purchaseOrderId),
      purchaseOrderNo: String(bill.purchaseNumber || '').trim(),
      billDate: bill.billDate.toISOString(),
      billAmount: round2(Number(bill.totalAmount || 0)),
      paidAmount,
      outstandingAmount,
      paymentReference: paymentReferences.join(', '),
      paymentMode: paymentModes.join(', '),
      status,
      lastTransactionDate: lastTransaction.toISOString(),
      accountingVendorId: toIdText(bill.accountingVendorId || supplier?.accountingVendorId) || undefined,
      payableLedgerAccountId: toIdText(bill.payableLedgerAccountId || supplier?.payableLedgerAccountId) || undefined,
      payableLedgerAccountCode: supplier?.payableLedgerAccountCode,
      payableLedgerAccountName: supplier?.payableLedgerAccountName,
      billJournalEntryId: toIdText(bill.billJournalEntryId) || undefined,
      billJournalEntryNumber: String(bill.billJournalEntryNumber || '').trim() || undefined,
      paymentVoucherId: toIdText(paymentVoucher?.paymentVoucherId || paymentVoucher?._id) || undefined,
      paymentVoucherNumber: String(paymentVoucher?.paymentVoucherNumber || '').trim() || undefined,
      paymentJournalEntryId: toIdText(paymentJournal?.paymentJournalEntryId || paymentJournal?._id) || undefined,
      paymentJournalEntryNumber: String(paymentJournal?.paymentJournalEntryNumber || '').trim() || undefined,
      paymentCount: linkedPayments.length,
    };
  }).sort((left, right) => {
    const dateDelta = new Date(right.billDate).getTime() - new Date(left.billDate).getTime();
    if (dateDelta !== 0) return dateDelta;
    return left.purchaseBillNo.localeCompare(right.purchaseBillNo, undefined, { numeric: true, sensitivity: 'base' });
  });

  const ageingBySupplier = new Map<string, SupplierAgeingRow>();
  for (const row of rows) {
    const key = row.supplierId || row.supplierName;
    const supplier = supplierById.get(row.supplierId);
    const existing = ageingBySupplier.get(key) || {
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      totalOutstanding: 0,
      bucket0To30: 0,
      bucket31To60: 0,
      bucket61To90: 0,
      bucket90Plus: 0,
      payableLedgerOutstanding: round2(
        ledgerOutstandingByAccountId.get(toIdText(row.payableLedgerAccountId || supplier?.payableLedgerAccountId)) || 0,
      ),
      validationDifference: 0,
      payableLedgerAccountId: row.payableLedgerAccountId || supplier?.payableLedgerAccountId,
      payableLedgerAccountCode: row.payableLedgerAccountCode || supplier?.payableLedgerAccountCode,
      payableLedgerAccountName: row.payableLedgerAccountName || supplier?.payableLedgerAccountName,
      accountingVendorId: row.accountingVendorId || supplier?.accountingVendorId,
      lastTransactionDate: row.lastTransactionDate,
    };

    existing.totalOutstanding = round2(existing.totalOutstanding + row.outstandingAmount);
    const transactionDate = toDate(row.billDate) || asOnDate;
    const daysOutstanding = row.outstandingAmount > 0
      ? Math.max(0, Math.floor((asOnDate.getTime() - transactionDate.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;
    const bucket = ageBucketKey(daysOutstanding);
    if (row.outstandingAmount > 0) {
      if (bucket === '0_30') existing.bucket0To30 = round2(existing.bucket0To30 + row.outstandingAmount);
      if (bucket === '31_60') existing.bucket31To60 = round2(existing.bucket31To60 + row.outstandingAmount);
      if (bucket === '61_90') existing.bucket61To90 = round2(existing.bucket61To90 + row.outstandingAmount);
      if (bucket === '90_plus') existing.bucket90Plus = round2(existing.bucket90Plus + row.outstandingAmount);
    }
    const currentLast = toDate(existing.lastTransactionDate);
    const nextLast = toDate(row.lastTransactionDate);
    if (!currentLast || (nextLast && nextLast.getTime() > currentLast.getTime())) {
      existing.lastTransactionDate = row.lastTransactionDate;
    }
    ageingBySupplier.set(key, existing);
  }

  const ageing = Array.from(ageingBySupplier.values())
    .map((row) => ({
      ...row,
      totalOutstanding: round2(row.totalOutstanding),
      payableLedgerOutstanding: round2(row.payableLedgerOutstanding),
      validationDifference: round2(row.totalOutstanding - row.payableLedgerOutstanding),
    }))
    .sort((left, right) => left.supplierName.localeCompare(right.supplierName, undefined, { numeric: true, sensitivity: 'base' }));

  const payableLedgerIds = ageing
    .map((row) => toIdText(row.payableLedgerAccountId))
    .filter(Boolean);
  const duplicatePayableLedgerLinks = payableLedgerIds.length - new Set(payableLedgerIds).size;

  const totals = {
    billAmount: round2(rows.reduce((sum, row) => sum + row.billAmount, 0)),
    paidAmount: round2(rows.reduce((sum, row) => sum + row.paidAmount, 0)),
    outstandingAmount: round2(rows.reduce((sum, row) => sum + row.outstandingAmount, 0)),
    payableLedgerOutstanding: round2(ageing.reduce((sum, row) => sum + row.payableLedgerOutstanding, 0)),
    validationDifference: round2(ageing.reduce((sum, row) => sum + row.validationDifference, 0)),
    supplierCount: ageing.length,
    billCount: rows.length,
    paymentCount: rows.reduce((sum, row) => sum + Number(row.paymentCount || 0), 0),
  };

  const payableControlDirectBalance = round2(Number(input.payableControlLedger?.outstanding || 0));
  const payableSubLedgerBalance = round2(totals.payableLedgerOutstanding);
  const payablePortfolioBalance = round2(payableControlDirectBalance + payableSubLedgerBalance);
  const supplierOutstandingBalance = round2(totals.outstandingAmount);
  const supplierAgeingOutstandingBalance = round2(ageing.reduce((sum, row) => sum + Number(row.totalOutstanding || 0), 0));
  const reconciliationDifference = round2(payablePortfolioBalance - supplierOutstandingBalance);
  const postingModel =
    payablePortfolioBalance <= 0.01
      ? 'settled'
      : payableControlDirectBalance > 0.01 && payableSubLedgerBalance <= 0.01
        ? 'control_only'
        : payableControlDirectBalance <= 0.01 && payableSubLedgerBalance > 0.01
          ? 'supplier_subledger_direct'
          : 'mixed';

  const mappedSupplierCount = ageing.filter((row) => Boolean(toIdText(row.payableLedgerAccountId))).length;
  const totalsMatch = Math.abs(round2(totals.billAmount - (totals.paidAmount + totals.outstandingAmount))) <= 0.01;
  const outstandingMatchesLedger = Math.abs(round2(totals.outstandingAmount - totals.payableLedgerOutstanding)) <= 0.01;
  const allSuppliersMapped = mappedSupplierCount === ageing.length;
  const apReconciled = totalsMatch && outstandingMatchesLedger && allSuppliersMapped && Math.abs(reconciliationDifference) <= 0.01;
  const reconciliationReason = !allSuppliersMapped
    ? 'One or more suppliers are not linked to an accounting payable ledger.'
    : !totalsMatch
      ? 'Supplier bill amount does not equal paid amount plus outstanding amount.'
      : !outstandingMatchesLedger
        ? `Supplier outstanding differs from linked payable ledgers by ${round2(totals.outstandingAmount - totals.payableLedgerOutstanding)}.`
        : Math.abs(reconciliationDifference) > 0.01
          ? `Accounts Payable portfolio differs from supplier documents by ${reconciliationDifference}.`
          : postingModel === 'supplier_subledger_direct'
            ? 'Supplier documents, ageing, and payable sub-ledgers match. The direct AP control ledger is not carrying the balance by design.'
            : postingModel === 'control_only'
              ? 'Supplier documents and the direct AP control ledger match.'
              : postingModel === 'mixed'
                ? 'Supplier documents match a mixed AP posting model using both control and supplier sub-ledgers.'
                : 'Supplier documents, ageing, and payable ledgers are fully reconciled.';
  const validation = {
    totalsMatch,
    outstandingMatchesLedger,
    allSuppliersMapped,
    apReconciled,
    mappedSupplierCount,
    unmappedSupplierCount: Math.max(0, ageing.length - mappedSupplierCount),
    duplicatePayableLedgerLinks: Math.max(0, duplicatePayableLedgerLinks),
  };

  return {
    rows,
    ageing,
    totals,
    reconciliation: {
      payableControlAccountId: toIdText(input.payableControlLedger?.accountId) || undefined,
      payableControlAccountCode: String(input.payableControlLedger?.accountCode || '').trim() || undefined,
      payableControlAccountName: String(input.payableControlLedger?.accountName || '').trim() || undefined,
      payableControlDirectBalance,
      payableSubLedgerBalance,
      payablePortfolioBalance,
      supplierOutstandingBalance,
      supplierAgeingOutstandingBalance,
      difference: reconciliationDifference,
      postingModel,
      status: apReconciled ? 'Reconciled' : 'Mismatch',
      reason: reconciliationReason,
    },
    validation,
  };
};

export const ensureAccountingVendorForSupplier = async (input: {
  supplier: ISupplierDocument;
  createdBy?: string;
  metadata?: Record<string, any>;
}): Promise<{ vendor: IVendor; payableLedgerAccountId: string }> => {
  const supplier = input.supplier;
  let vendor: IVendor | null = null;
  const linkedVendorId = toIdText((supplier as any).accountingVendorId);
  if (linkedVendorId && mongoose.isValidObjectId(linkedVendorId)) {
    vendor = await Vendor.findById(linkedVendorId);
  }

  const supplierGstin = String((supplier as any).gstin || '').trim().toUpperCase();
  if (!vendor && supplierGstin) {
    vendor = await Vendor.findOne({ gstin: supplierGstin });
  }

  if (!vendor) {
    const supplierName = String((supplier as any).name || '').trim();
    vendor = await Vendor.findOne({
      name: { $regex: `^${escapeRegex(supplierName)}$`, $options: 'i' },
    });
  }

  if (!vendor) {
    vendor = await createVendor({
      name: String((supplier as any).name || '').trim(),
      contact: String((supplier as any).contactPerson || '').trim() || undefined,
      email: String((supplier as any).email || '').trim().toLowerCase() || undefined,
      phone: String((supplier as any).phone || '').trim() || undefined,
      gstin: supplierGstin || undefined,
      address: String((supplier as any).address || '').trim() || undefined,
      createdBy: input.createdBy,
      metadata: {
        ...(input.metadata || {}),
        source: 'procurement_supplier',
        supplierId: supplier._id.toString(),
        supplierCode: String((supplier as any).supplierCode || '').trim(),
      },
    });
  }

  const payableLedgerAccountId = toIdText(vendor.ledgerAccountId);
  const supplierUpdates: Record<string, unknown> = {};
  if (!sameId((supplier as any).accountingVendorId, vendor._id)) {
    supplierUpdates.accountingVendorId = vendor._id;
  }
  if (!sameId((supplier as any).payableLedgerAccountId, payableLedgerAccountId)) {
    supplierUpdates.payableLedgerAccountId = vendor.ledgerAccountId;
  }
  if (Object.keys(supplierUpdates).length > 0 || !(supplier as any).accountingLinkedAt) {
    supplierUpdates.accountingLinkedAt = new Date();
    await Supplier.findByIdAndUpdate(supplier._id, supplierUpdates, { runValidators: true });
    Object.assign(supplier, supplierUpdates);
  }

  return { vendor, payableLedgerAccountId };
};

export const buildSupplierPayablesReport = async (input: {
  startDate?: Date | string;
  endDate?: Date | string;
  supplierId?: string;
} = {}): Promise<SupplierPayablesReport> => {
  const billFilter: Record<string, any> = {};
  billFilter.status = 'posted';
  if (input.supplierId && mongoose.isValidObjectId(String(input.supplierId))) {
    billFilter.supplierId = new mongoose.Types.ObjectId(String(input.supplierId));
  }
  if (input.startDate || input.endDate) {
    billFilter.billDate = {};
    if (input.startDate) billFilter.billDate.$gte = new Date(input.startDate);
    const endDate = toDateEnd(input.endDate);
    if (endDate) billFilter.billDate.$lte = endDate;
  }

  const bills = await PurchaseBill.find(billFilter)
    .sort({ billDate: -1, createdAt: -1 })
    .select('billNumber purchaseOrderId purchaseNumber supplierId supplierName billDate totalAmount accountingVendorId payableLedgerAccountId journalEntryId')
    .lean();

  if (!bills.length) {
    return {
      rows: [],
      ageing: [],
      totals: {
        billAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
        payableLedgerOutstanding: 0,
        validationDifference: 0,
        supplierCount: 0,
        billCount: 0,
        paymentCount: 0,
      },
      reconciliation: {
        payableControlDirectBalance: 0,
        payableSubLedgerBalance: 0,
        payablePortfolioBalance: 0,
        supplierOutstandingBalance: 0,
        supplierAgeingOutstandingBalance: 0,
        difference: 0,
        postingModel: 'settled',
        status: 'Reconciled',
        reason: 'No supplier bills matched the selected filter.',
      },
      validation: {
        totalsMatch: true,
        outstandingMatchesLedger: true,
        allSuppliersMapped: true,
        apReconciled: true,
        mappedSupplierCount: 0,
        unmappedSupplierCount: 0,
        duplicatePayableLedgerLinks: 0,
      },
    };
  }

  const supplierIds = Array.from(new Set(bills.map((row) => toIdText(row.supplierId)).filter(Boolean)));
  const billIds = bills.map((row) => toIdText(row._id)).filter(Boolean);
  const billNumbers = bills.map((row) => String(row.billNumber || '').trim()).filter(Boolean);
  const vendorIds = Array.from(new Set(
    bills.map((row) => toIdText((row as any).accountingVendorId)).filter(Boolean),
  ));
  const billJournalIds = Array.from(new Set(
    bills.map((row) => toIdText((row as any).journalEntryId)).filter(Boolean),
  ));

  const [suppliers, vendors, billJournals, paymentVouchers, paymentJournals, payableControlAccount] = await Promise.all([
    Supplier.find({ _id: { $in: supplierIds } })
      .select('name accountingVendorId payableLedgerAccountId')
      .lean(),
    vendorIds.length
      ? Vendor.find({ _id: { $in: vendorIds } }).select('name ledgerAccountId').lean()
      : Promise.resolve([]),
    billJournalIds.length
      ? JournalEntry.find({ _id: { $in: billJournalIds } }).select('entryNumber').lean()
      : Promise.resolve([]),
    AccountingVoucher.find({
      voucherType: 'payment',
      'metadata.entryMode': 'settlement',
      $or: [
        { 'metadata.linkedEntityType': 'purchase_bill', 'metadata.linkedEntityId': { $in: billIds } },
        { 'metadata.linkedEntityType': 'purchase_bill', 'metadata.linkedEntityNumber': { $in: billNumbers } },
        { referenceNo: { $in: billNumbers } },
      ],
      ...(input.endDate ? { voucherDate: { $lte: toDateEnd(input.endDate) } } : {}),
    })
      .select('voucherNumber voucherDate paymentMode totalAmount metadata')
      .lean(),
    JournalEntry.find({
      referenceType: 'payment',
      status: 'posted',
      $or: [
        { referenceId: { $in: billIds } },
        { referenceNo: { $in: billNumbers } },
      ],
      ...(input.endDate ? { entryDate: { $lte: toDateEnd(input.endDate) } } : {}),
    })
      .select('entryNumber entryDate referenceId referenceNo totalDebit totalCredit metadata')
      .lean(),
    ChartAccount.findOne({ systemKey: 'accounts_payable', isActive: true })
      .select('accountCode accountName openingBalance openingSide')
      .lean(),
  ]);

  const vendorById = new Map(vendors.map((row) => [toIdText(row._id), row]));
  const billJournalById = new Map(billJournals.map((row) => [toIdText(row._id), row]));

  const supplierContexts: SupplierContextRow[] = suppliers.map((supplier: any) => {
    const vendor = vendorById.get(toIdText(supplier.accountingVendorId));
    return {
      _id: toIdText(supplier._id),
      name: String(supplier.name || '').trim(),
      accountingVendorId: toIdText(supplier.accountingVendorId) || undefined,
      payableLedgerAccountId: toIdText(supplier.payableLedgerAccountId || vendor?.ledgerAccountId) || undefined,
      payableLedgerAccountCode: '',
      payableLedgerAccountName: '',
    };
  });

  const payableLedgerIds = Array.from(new Set(
    supplierContexts.map((row) => toIdText(row.payableLedgerAccountId)).filter(Boolean),
  ));

  const [payableLedgers, ledgerRows, payableControlLedgerRows] = await Promise.all([
    payableLedgerIds.length
      ? ChartAccount.find({ _id: { $in: payableLedgerIds } })
        .select('accountCode accountName openingBalance openingSide')
        .lean()
      : Promise.resolve([]),
    payableLedgerIds.length
      ? AccountLedgerEntry.find({
        accountId: { $in: payableLedgerIds },
        ...(input.endDate ? { entryDate: { $lte: toDateEnd(input.endDate) } } : {}),
      })
        .select('accountId debit credit')
        .lean()
      : Promise.resolve([]),
    payableControlAccount
      ? AccountLedgerEntry.find({
        accountId: (payableControlAccount as any)._id,
        ...(input.endDate ? { entryDate: { $lte: toDateEnd(input.endDate) } } : {}),
      })
        .select('debit credit')
        .lean()
      : Promise.resolve([]),
  ]);

  const payableLedgerById = new Map(payableLedgers.map((row: any) => [toIdText(row._id), row]));
  const supplierContextsWithLedger = supplierContexts.map((row) => ({
    ...row,
    payableLedgerAccountCode: String(payableLedgerById.get(toIdText(row.payableLedgerAccountId))?.accountCode || '').trim() || undefined,
    payableLedgerAccountName: String(payableLedgerById.get(toIdText(row.payableLedgerAccountId))?.accountName || '').trim() || undefined,
  }));

  const ledgerBalanceByAccountId = new Map<string, SupplierPayablesContextLedgerBalance>();
  for (const ledger of payableLedgers as any[]) {
    const accountId = toIdText(ledger._id);
    const openingBalance = round2(Number(ledger.openingBalance || 0));
    const openingCredit = String(ledger.openingSide || 'credit').toLowerCase() === 'credit' ? openingBalance : 0;
    const openingDebit = String(ledger.openingSide || 'credit').toLowerCase() === 'debit' ? openingBalance : 0;
    const movements = (ledgerRows as any[]).filter((row) => sameId(row.accountId, accountId));
    const totalCredits = round2(movements.reduce((sum, row) => sum + Number(row.credit || 0), 0));
    const totalDebits = round2(movements.reduce((sum, row) => sum + Number(row.debit || 0), 0));
    ledgerBalanceByAccountId.set(accountId, {
      accountId,
      outstanding: round2(Math.max(0, openingCredit + totalCredits - openingDebit - totalDebits)),
    });
  }

  const includedPaymentVouchers = getReportEntries(paymentVouchers as any[], { includeCancelled: false, includeReversal: true });
  const includedPaymentJournals = getReportEntries(paymentJournals as any[], { includeCancelled: false, includeReversal: true });

  const paymentContexts: SupplierPayablesContextPayment[] = [
    ...includedPaymentVouchers.map((row: any) => ({
      _id: toIdText(row._id),
      kind: 'voucher' as const,
      linkedBillId: toIdText(row?.metadata?.linkedEntityId) || undefined,
      linkedBillNumber: String(row?.metadata?.linkedEntityNumber || row.referenceNo || '').trim() || undefined,
      paymentDate: toDate(row.voucherDate) || new Date(),
      amount: round2(Number(row.totalAmount || 0)),
      paymentMode: String(row.paymentMode || '').trim() || undefined,
      paymentReference: String(row.voucherNumber || row.referenceNo || '').trim(),
      paymentVoucherId: toIdText(row._id) || undefined,
      paymentVoucherNumber: String(row.voucherNumber || '').trim() || undefined,
    })),
    ...includedPaymentJournals.map((row: any) => ({
      _id: toIdText(row._id),
      kind: 'journal' as const,
      linkedBillId: toIdText(row.referenceId) || undefined,
      linkedBillNumber: String(row.referenceNo || '').trim() || undefined,
      paymentDate: toDate(row.entryDate) || new Date(),
      amount: round2(Number(row.totalDebit || row.totalCredit || 0)),
      paymentMode: String(row?.metadata?.paymentMode || '').trim() || undefined,
      paymentReference: String(row.entryNumber || row.referenceNo || '').trim(),
      paymentJournalEntryId: toIdText(row._id) || undefined,
      paymentJournalEntryNumber: String(row.entryNumber || '').trim() || undefined,
    })),
  ];

  const billContexts: SupplierPayablesContextBill[] = bills.map((row: any) => ({
    _id: toIdText(row._id),
    purchaseOrderId: toIdText(row.purchaseOrderId) || undefined,
    purchaseNumber: String(row.purchaseNumber || '').trim() || undefined,
    billNumber: String(row.billNumber || '').trim(),
    billDate: toDate(row.billDate) || new Date(),
    supplierId: toIdText(row.supplierId),
    supplierName: String(row.supplierName || '').trim(),
    totalAmount: round2(Number(row.totalAmount || 0)),
    accountingVendorId: toIdText(row.accountingVendorId) || undefined,
    payableLedgerAccountId: toIdText(row.payableLedgerAccountId) || undefined,
    billJournalEntryId: toIdText(row.journalEntryId) || undefined,
    billJournalEntryNumber: String(billJournalById.get(toIdText(row.journalEntryId))?.entryNumber || '').trim() || undefined,
  }));

  const payableControlLedger = payableControlAccount
    ? (() => {
      const openingBalance = round2(Number((payableControlAccount as any).openingBalance || 0));
      const openingCredit = String((payableControlAccount as any).openingSide || 'credit').toLowerCase() === 'credit' ? openingBalance : 0;
      const openingDebit = String((payableControlAccount as any).openingSide || 'credit').toLowerCase() === 'debit' ? openingBalance : 0;
      const totalCredits = round2((payableControlLedgerRows as any[]).reduce((sum, row: any) => sum + Number(row.credit || 0), 0));
      const totalDebits = round2((payableControlLedgerRows as any[]).reduce((sum, row: any) => sum + Number(row.debit || 0), 0));
      return {
        accountId: toIdText((payableControlAccount as any)._id),
        accountCode: String((payableControlAccount as any).accountCode || '').trim(),
        accountName: String((payableControlAccount as any).accountName || '').trim(),
        outstanding: round2(Math.max(0, openingCredit + totalCredits - openingDebit - totalDebits)),
      };
    })()
    : null;

  return summarizeSupplierPayablesFromContext({
    bills: billContexts,
    payments: paymentContexts,
    suppliers: supplierContextsWithLedger,
    ledgerBalances: Array.from(ledgerBalanceByAccountId.values()),
    payableControlLedger: payableControlLedger || undefined,
    asOnDate: input.endDate,
  });
};
