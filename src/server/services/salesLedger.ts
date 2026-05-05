import cron, { ScheduledTask } from 'node-cron';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { AccountingPayment } from '../models/AccountingPayment.js';
import { JournalEntry } from '../models/JournalEntry.js';
import { JournalLine } from '../models/JournalLine.js';
import { Sale } from '../models/Sale.js';
import { Tenant } from '../models/Tenant.js';
import { createInvoice, createJournalEntry, ensureAccountingChart, recordPayment } from './accountingEngine.js';
import { normalizeSaleForReporting } from './posReporting.js';
import { runWithTenantContext } from './tenantContext.js';

type SalePaymentMode = 'cash' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
type AccountingPaymentMode = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
type GstTreatment = 'none' | 'intrastate' | 'interstate';

interface NormalizedSalePaymentSplit {
  id: string;
  method: SalePaymentMode;
  amount: number;
  receivedAmount: number;
  note?: string;
}

export interface SaleAccountingPlan {
  saleId: string;
  invoiceNumber: string;
  accountingInvoiceNumber: string;
  customerName: string;
  baseAmount: number;
  discountAmount: number;
  roundOffAmount: number;
  gstAmount: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  gstTreatment: GstTreatment;
  paymentMethod: AccountingPaymentMode;
  paymentSplits: Array<{
    id: string;
    method: AccountingPaymentMode;
    amount: number;
    note?: string;
  }>;
}

export interface PosSaleAccountingDiagnostics {
  invoiceTotal: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstTotal: number;
  roundOffAmount: number;
  paymentAmount: number;
  arSettlementAmount: number;
  arBalanceAmount: number;
  cogsAmount: number;
}

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const POS_ROUND_OFF_TOLERANCE = 1;

const normalizePaymentMode = (value: unknown): SalePaymentMode => {
  const method = String(value || 'cash').trim().toLowerCase();
  if (method === 'card') return 'card';
  if (method === 'upi') return 'upi';
  if (method === 'cheque') return 'cheque';
  if (method === 'online') return 'online';
  if (method === 'bank_transfer') return 'bank_transfer';
  return 'cash';
};

const toAccountingPaymentMode = (method: SalePaymentMode): AccountingPaymentMode => {
  if (method === 'card') return 'card';
  if (method === 'upi') return 'upi';
  if (method === 'cheque') return 'cheque';
  if (method === 'online') return 'online';
  if (method === 'bank_transfer') return 'bank_transfer';
  return 'cash';
};

const computeBaseAmount = (sale: any): number => {
  const taxableValue = Array.isArray(sale?.items)
    ? sale.items.reduce((sum: number, item: any) => sum + Number(item?.taxableValue || 0), 0)
    : 0;
  if (taxableValue > 0) return round2(taxableValue);
  return round2(Number(sale?.subtotal || 0));
};

const computeGstTreatment = (sale: any): GstTreatment => {
  if (Boolean(sale?.isGstBill) === false || Number(sale?.totalGst || 0) <= 0) return 'none';
  const hasIgst = Array.isArray(sale?.items)
    && sale.items.some((item: any) => Number(item?.igstAmount || 0) > 0);
  return hasIgst ? 'interstate' : 'intrastate';
};

const sumSaleCogsAmount = async (sale: any): Promise<number> => {
  const directAmount = round2(
    Array.isArray(sale?.items)
      ? sale.items.reduce((sum: number, item: any) => sum + Number(item?.cogsAmount || 0), 0)
      : 0
  );
  if (directAmount > 0) return directAmount;

  const referenceId = String(sale?._id || '').trim();
  const referenceNo = String(sale?.invoiceNumber || sale?.saleNumber || '').trim();
  if (!referenceId && !referenceNo) return 0;

  const journal = await JournalEntry.findOne({
    referenceType: 'inventory_adjustment',
    $or: [
      ...(referenceId ? [{ referenceId }] : []),
      ...(referenceNo ? [{ referenceNo }] : []),
    ],
    status: { $ne: 'cancelled' },
  })
    .sort({ entryDate: -1, createdAt: -1, _id: -1 })
    .select('totalDebit totalCredit')
    .lean();

  return round2(Number(journal?.totalDebit || journal?.totalCredit || 0));
};

export const buildPosSaleAccountingDiagnostics = async (
  sale: any,
  invoice: any,
  plan: Pick<SaleAccountingPlan, 'baseAmount' | 'gstAmount' | 'roundOffAmount' | 'paidAmount' | 'totalAmount'>
): Promise<PosSaleAccountingDiagnostics> => {
  const normalized = normalizeSaleForReporting(sale);
  const invoiceTotal = round2(Number(invoice?.totalAmount ?? plan.totalAmount));
  const paidAmount = round2(Number(invoice?.paidAmount ?? plan.paidAmount));
  const arBalanceAmount = round2(Number(invoice?.balanceAmount ?? Math.max(0, invoiceTotal - paidAmount)));
  return {
    invoiceTotal,
    taxableValue: round2(Number(normalized.taxableValue || plan.baseAmount || 0)),
    cgstAmount: round2(Number(normalized.cgstAmount || 0)),
    sgstAmount: round2(Number(normalized.sgstAmount || 0)),
    igstAmount: round2(Number(normalized.igstAmount || 0)),
    gstTotal: round2(Number(normalized.taxAmount || plan.gstAmount || 0)),
    roundOffAmount: round2(Number(plan.roundOffAmount || normalized.roundOffAmount || 0)),
    paymentAmount: paidAmount,
    arSettlementAmount: paidAmount,
    arBalanceAmount,
    cogsAmount: await sumSaleCogsAmount(sale),
  };
};

export const shouldMarkSalePaymentCompleted = (sale: any, invoice: any): boolean => {
  const saleOutstanding = round2(Math.max(0, Number(sale?.outstandingAmount || 0)));
  const invoiceBalance = round2(Math.max(0, Number(invoice?.balanceAmount || 0)));
  const saleTotal = round2(Number(sale?.totalAmount || 0));
  const invoiceTotal = round2(Number(invoice?.totalAmount || 0));
  const invoicePaidAmount = round2(Number(invoice?.paidAmount || 0));
  return (
    String(sale?.invoiceStatus || '').toLowerCase() === 'posted'
    && Boolean(invoice?._id)
    && Boolean(invoice?.journalEntryId)
    && saleOutstanding <= 0.01
    && invoiceBalance <= 0.01
    && Math.abs(saleTotal - invoiceTotal) <= 0.01
    && Math.abs(invoicePaidAmount - invoiceTotal) <= 0.01
  );
};

const normalizeSalePaymentSplits = (sale: any, paidAmount: number): NormalizedSalePaymentSplit[] => {
  const raw = Array.isArray(sale?.paymentSplits) ? sale.paymentSplits : [];
  const normalized = raw
    .map((row: any, index: number) => ({
      id: String(row?.id || `split-${index + 1}`),
      method: normalizePaymentMode(row?.method || sale?.paymentMethod),
      amount: round2(Math.max(0, Number(row?.amount || 0))),
      receivedAmount: round2(Math.max(0, Number(row?.receivedAmount || row?.amount || 0))),
      note: String(row?.note || '').trim() || undefined,
    }))
    .filter((row: NormalizedSalePaymentSplit) => row.amount > 0);

  if (paidAmount <= 0) return [];
  if (!normalized.length) {
    return [{
      id: 'primary',
      method: normalizePaymentMode(sale?.paymentMethod),
      amount: paidAmount,
      receivedAmount: paidAmount,
    }];
  }

  const currentTotal = round2(normalized.reduce((sum: number, row: NormalizedSalePaymentSplit) => sum + row.amount, 0));
  if (Math.abs(currentTotal - paidAmount) <= 0.01) return normalized;

  if (currentTotal < paidAmount) {
    const first = normalized[0];
    first.amount = round2(first.amount + (paidAmount - currentTotal));
    first.receivedAmount = round2(Math.max(first.receivedAmount, first.amount));
    return normalized;
  }

  let excess = round2(currentTotal - paidAmount);
  const adjusted = normalized.map((row: NormalizedSalePaymentSplit) => ({ ...row }));
  for (let index = adjusted.length - 1; index >= 0 && excess > 0; index -= 1) {
    const nextAmount = round2(Math.max(0, adjusted[index].amount - excess));
    excess = round2(excess - (adjusted[index].amount - nextAmount));
    adjusted[index].amount = nextAmount;
    adjusted[index].receivedAmount = round2(Math.max(nextAmount, adjusted[index].receivedAmount));
  }
  return adjusted.filter((row: NormalizedSalePaymentSplit) => row.amount > 0);
};

const resolveAccountingInvoiceNumber = async (sale: any): Promise<string> => {
  const requested = String(sale?.invoiceNumber || sale?.saleNumber || '').trim();
  if (!requested) return '';
  const duplicate = await AccountingInvoice.findOne({
    invoiceNumber: requested,
    referenceId: { $ne: String(sale?._id || '') },
  })
    .select('_id')
    .lean();
  return duplicate ? `${requested}-ACCT` : requested;
};

const updateSaleLedgerLinks = async (
  sale: any,
  args: {
    invoice: any;
    paymentIds?: string[];
    userId?: string;
    markMigrated?: boolean;
  }
) => {
  const mergedPaymentIds = Array.from(
    new Set(
      [...(Array.isArray(sale.accountingPaymentIds) ? sale.accountingPaymentIds : []), ...(args.paymentIds || [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  sale.ledgerPosted = true;
  sale.ledgerPostedAt = sale.ledgerPostedAt || new Date();
  sale.ledgerPostedBy = sale.ledgerPostedBy || args.userId;
  sale.accountingInvoiceId = String(args.invoice?._id || '');
  sale.accountingInvoiceNumber = String(args.invoice?.invoiceNumber || '');
  sale.accountingPaymentIds = mergedPaymentIds;
  if (args.markMigrated) {
    sale.migratedToLedger = true;
    sale.migratedToLedgerAt = sale.migratedToLedgerAt || new Date();
    sale.migratedToLedgerBy = sale.migratedToLedgerBy || args.userId;
    sale.migratedLedgerInvoiceId = String(args.invoice?._id || '');
    sale.migratedLedgerInvoiceNumber = String(args.invoice?.invoiceNumber || '');
  }
  await sale.save();
};

export const buildSaleAccountingPlan = async (sale: any): Promise<SaleAccountingPlan> => {
  const normalized = normalizeSaleForReporting(sale);
  const baseAmount = round2(Number(normalized.taxableValue || computeBaseAmount(sale)));
  const gstAmount = round2(Number(normalized.taxAmount || sale?.totalGst || 0));
  const totalAmount = round2(Number(sale?.totalAmount || 0));
  const outstandingAmount = round2(Math.max(0, Number(sale?.outstandingAmount || 0)));
  const paidAmount = round2(Math.max(0, totalAmount - outstandingAmount));
  const paymentSplits = normalizeSalePaymentSplits(sale, paidAmount);
  const derivedDiscountAmount = round2(Number(normalized.invoiceDiscountAmount || 0));
  const roundOffAmount = round2(Number(sale?.roundOffAmount ?? normalized.roundOffAmount ?? 0));
  const reconstructedTotal = round2(baseAmount + gstAmount - derivedDiscountAmount + roundOffAmount);

  if (Math.abs(reconstructedTotal - totalAmount) > 0.01) {
    throw new Error(
      `POS accounting mismatch for ${String(sale?.invoiceNumber || sale?.saleNumber || sale?._id || '').trim() || 'sale'}: `
      + `expected total ₹${reconstructedTotal.toFixed(2)} from taxable + GST + round-off, but sale stores ₹${totalAmount.toFixed(2)}.`
    );
  }
  if (Math.abs(roundOffAmount) > POS_ROUND_OFF_TOLERANCE + 0.01) {
    throw new Error(
      `POS round-off for ${String(sale?.invoiceNumber || sale?.saleNumber || sale?._id || '').trim() || 'sale'} `
      + `is ₹${roundOffAmount.toFixed(2)}, which is outside the auto-post tolerance of ₹${POS_ROUND_OFF_TOLERANCE.toFixed(2)}.`
    );
  }

  return {
    saleId: String(sale?._id || ''),
    invoiceNumber: String(sale?.invoiceNumber || sale?.saleNumber || '').trim(),
    accountingInvoiceNumber: await resolveAccountingInvoiceNumber(sale),
    customerName: String(sale?.customerName || 'Walk-in Customer').trim() || 'Walk-in Customer',
    baseAmount,
    discountAmount: derivedDiscountAmount,
    roundOffAmount,
    gstAmount,
    totalAmount,
    paidAmount,
    outstandingAmount,
    gstTreatment: computeGstTreatment(sale),
    paymentMethod: toAccountingPaymentMode(normalizePaymentMode(sale?.paymentMethod)),
    paymentSplits: paymentSplits.map((row) => ({
      id: row.id,
      method: toAccountingPaymentMode(row.method),
      amount: row.amount,
      note: row.note,
    })),
  };
};

const buildInvoiceStatus = (paidAmount: number, totalAmount: number): 'posted' | 'partial' | 'paid' => {
  if (totalAmount <= 0 || paidAmount >= totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'posted';
};

const loadPostedInvoiceReceivableAmount = async (invoice: any): Promise<number> => {
  const referenceId = String(invoice?._id || '').trim();
  const referenceNo = String(invoice?.invoiceNumber || '').trim();
  const journalRows = await JournalEntry.find({
    referenceType: 'invoice',
    status: { $ne: 'cancelled' },
    $or: [
      ...(referenceId ? [{ referenceId }] : []),
      ...(referenceNo ? [{ referenceNo }] : []),
    ],
  })
    .select('_id')
    .lean();
  const journalIds = journalRows
    .map((row: any) => row?._id)
    .filter(Boolean);
  if (!journalIds.length) return 0;

  const receivableLines = await JournalLine.find({
    journalId: { $in: journalIds },
    accountCode: '1100',
  })
    .select('debitAmount creditAmount')
    .lean();

  return round2(
    receivableLines.reduce(
      (sum: number, row: any) => sum + Number(row?.debitAmount || 0) - Number(row?.creditAmount || 0),
      0
    )
  );
};

const reconcileExistingInvoiceToPlan = async (
  invoice: any,
  plan: SaleAccountingPlan,
  sale: any,
  userId?: string,
  skipChartEnsure = false
) => {
  const totalDifference = round2(Number(invoice?.totalAmount || 0) - plan.totalAmount);
  const discountDifference = round2(plan.discountAmount - Number(invoice?.discountAmount || 0));
  const currentRoundOffAmount = round2(Number(invoice?.metadata?.roundOffAmount || 0));
  const postedReceivableAmount = await loadPostedInvoiceReceivableAmount(invoice);
  const receivableAmountAfterDiscountAlignment = round2(postedReceivableAmount - discountDifference);
  const receivableDifference = round2(plan.totalAmount - receivableAmountAfterDiscountAlignment);
  if (Math.abs(totalDifference) <= 0.01 && Math.abs(discountDifference) <= 0.01 && Math.abs(receivableDifference) <= 0.01 && Math.abs(plan.roundOffAmount - currentRoundOffAmount) <= 0.01) {
    return invoice;
  }

  const reconciliationLines: Array<{ accountKey: string; debit: number; credit: number; description: string }> = [];
  if (Math.abs(discountDifference) > 0.01) {
    if (discountDifference > 0) {
      reconciliationLines.push(
        { accountKey: 'sales_discount', debit: discountDifference, credit: 0, description: 'Increase invoice discount to match POS total' },
        { accountKey: 'accounts_receivable', debit: 0, credit: discountDifference, description: 'Reduce receivable to collectible total' }
      );
    } else {
      reconciliationLines.push(
        { accountKey: 'accounts_receivable', debit: Math.abs(discountDifference), credit: 0, description: 'Increase receivable to collectible total' },
        { accountKey: 'sales_discount', debit: 0, credit: Math.abs(discountDifference), description: 'Reverse excess invoice discount' }
      );
    }
  }
  if (Math.abs(receivableDifference) > 0.01) {
    if (Math.abs(receivableDifference) > POS_ROUND_OFF_TOLERANCE + 0.01) {
      throw new Error(
        `POS receivable repair for ${plan.invoiceNumber} needs ₹${receivableDifference.toFixed(2)}, `
        + `which exceeds the round-off auto-adjustment tolerance of ₹${POS_ROUND_OFF_TOLERANCE.toFixed(2)}.`
      );
    }
    if (receivableDifference > 0) {
      reconciliationLines.push(
        { accountKey: 'accounts_receivable', debit: receivableDifference, credit: 0, description: 'Increase receivable to rounded invoice total' },
        { accountKey: 'round_off_income', debit: 0, credit: receivableDifference, description: 'Round-off gain to match POS total' }
      );
    } else {
      reconciliationLines.push(
        { accountKey: 'round_off_expense', debit: Math.abs(receivableDifference), credit: 0, description: 'Round-off loss to match POS total' },
        { accountKey: 'accounts_receivable', debit: 0, credit: Math.abs(receivableDifference), description: 'Reduce receivable to rounded invoice total' }
      );
    }
  }

  if (reconciliationLines.length > 0) {
    await createJournalEntry({
      entryDate: sale.postedAt || sale.createdAt || new Date(),
      referenceType: 'invoice',
      referenceId: invoice._id.toString(),
      referenceNo: invoice.invoiceNumber,
      description: `POS invoice reconciliation for ${plan.invoiceNumber}`,
      paymentMode: 'adjustment',
      createdBy: userId,
      metadata: {
        source: 'pos_sale_invoice_reconciliation',
        sourceSaleId: String(sale._id),
        sourceInvoiceNumber: plan.invoiceNumber,
        discountDifference,
        roundOffDifference: receivableDifference,
      },
      lines: reconciliationLines,
    }, skipChartEnsure ? { skipChartEnsure: true } : {});
  }

  invoice.baseAmount = plan.baseAmount;
  invoice.discountAmount = plan.discountAmount;
  invoice.gstAmount = plan.gstAmount;
  invoice.totalAmount = plan.totalAmount;
  invoice.balanceAmount = round2(Math.max(0, Number(invoice.paidAmount || 0) < plan.totalAmount ? plan.totalAmount - Number(invoice.paidAmount || 0) : 0));
  invoice.status = buildInvoiceStatus(round2(Number(invoice.paidAmount || 0)), plan.totalAmount);
  invoice.metadata = {
    ...(invoice.metadata || {}),
    roundOffAmount: plan.roundOffAmount,
    invoiceDiscountAmount: plan.discountAmount,
  };
  await invoice.save();
  return invoice;
};

export const syncPostedSaleToAccounting = async (
  saleInput: any,
  opts: { userId?: string; markMigrated?: boolean; chartPrepared?: boolean } = {}
) => {
  const sale = saleInput?._id && typeof saleInput.save === 'function'
    ? saleInput
    : await Sale.findById(String(saleInput?._id || saleInput));
  if (!sale) {
    throw new Error('Sale not found for accounting sync');
  }
  if (String(sale.invoiceStatus || '').toLowerCase() !== 'posted') {
    return { sale, invoice: null, payments: [] as any[], synced: false, reason: 'invoice_not_posted' };
  }

  const plan = await buildSaleAccountingPlan(sale);
  if (!opts.chartPrepared) {
    await ensureAccountingChart(opts.userId);
  }
  let invoice: any = await AccountingInvoice.findOne({
    referenceType: 'sale',
    referenceId: String(sale._id),
    status: { $ne: 'cancelled' },
  });

  if (!invoice) {
    const created = await createInvoice({
      invoiceDate: sale.postedAt || sale.createdAt || new Date(),
      dueDate: sale.dueDate || undefined,
      customerId: sale.customerId || undefined,
      customerName: plan.customerName,
      referenceType: 'sale',
      referenceId: String(sale._id),
      description: `POS invoice ${plan.invoiceNumber} posted into accounting ledger`,
      baseAmount: plan.baseAmount,
      discountAmount: plan.discountAmount,
      roundOffAmount: plan.roundOffAmount,
      gstAmount: plan.gstAmount,
      gstRate: plan.baseAmount > 0 && plan.gstAmount > 0 ? round2((plan.gstAmount / plan.baseAmount) * 100) : undefined,
      gstTreatment: plan.gstTreatment,
      paymentAmount: 0,
      paymentMode: plan.paymentMethod,
      revenueAccountKey: 'sales_revenue',
      invoiceNumber: plan.accountingInvoiceNumber,
      createdBy: opts.userId,
      metadata: {
        source: opts.markMigrated ? 'legacy_pos_sale_migration' : 'pos_sale_invoice',
        sourceInvoiceNumber: plan.invoiceNumber,
        sourceSaleId: String(sale._id),
        roundOffAmount: plan.roundOffAmount,
        invoiceDiscountAmount: plan.discountAmount,
      },
    }, { skipChartEnsure: true });
    invoice = created.invoice as any;
  }
  invoice = await reconcileExistingInvoiceToPlan(invoice, plan, sale, opts.userId, true);

  const payments: any[] = [];
  const alreadyPaid = round2(Number(invoice.paidAmount || 0));
  const remainingToPost = round2(Math.max(0, plan.paidAmount - alreadyPaid));
  if (remainingToPost > 0) {
    const splits = plan.paymentSplits.length
      ? plan.paymentSplits
      : [{ id: 'primary', method: plan.paymentMethod, amount: remainingToPost }];
    let remaining = remainingToPost;
    for (const split of splits) {
      if (remaining <= 0) break;
      const amount = round2(Math.min(remaining, Number(split.amount || 0)));
      if (amount <= 0) continue;
      const recorded = await recordPayment({
        invoiceId: invoice._id.toString(),
        amount,
        mode: split.method,
        description: `POS payment for ${plan.invoiceNumber}`,
        createdBy: opts.userId,
        paymentDate: sale.postedAt || sale.createdAt || new Date(),
        metadata: {
          source: opts.markMigrated ? 'legacy_pos_sale_migration_payment' : 'pos_sale_payment',
          sourceSaleId: String(sale._id),
          sourceInvoiceNumber: plan.invoiceNumber,
          splitId: split.id,
          splitNote: split.note,
        },
      }, { skipChartEnsure: true });
      payments.push(recorded.payment);
      remaining = round2(remaining - amount);
    }
    if (remaining > 0) {
      const recorded = await recordPayment({
        invoiceId: invoice._id.toString(),
        amount: remaining,
        mode: plan.paymentMethod,
        description: `POS payment for ${plan.invoiceNumber}`,
        createdBy: opts.userId,
        paymentDate: sale.postedAt || sale.createdAt || new Date(),
        metadata: {
          source: opts.markMigrated ? 'legacy_pos_sale_migration_payment' : 'pos_sale_payment',
          sourceSaleId: String(sale._id),
          sourceInvoiceNumber: plan.invoiceNumber,
          splitId: 'remainder',
        },
      }, { skipChartEnsure: true });
      payments.push(recorded.payment);
    }
    invoice = (await AccountingInvoice.findById(invoice._id)) || invoice;
  }

  sale.paymentStatus = shouldMarkSalePaymentCompleted(sale, invoice) ? 'completed' : 'pending';
  await updateSaleLedgerLinks(sale, {
    invoice,
    paymentIds: payments.map((row) => row._id?.toString?.()).filter(Boolean),
    userId: opts.userId,
    markMigrated: opts.markMigrated,
  });

  const diagnostics = await buildPosSaleAccountingDiagnostics(sale, invoice, plan);
  return { sale, invoice, payments, synced: true, plan, diagnostics };
};

export const recordSalePaymentInAccounting = async (
  saleInput: any,
  input: {
    amount: number;
    mode?: SalePaymentMode | AccountingPaymentMode;
    userId?: string;
    paymentDate?: Date;
    notes?: string;
  }
) => {
  const sale = saleInput?._id && typeof saleInput.save === 'function'
    ? saleInput
    : await Sale.findById(String(saleInput?._id || saleInput));
  if (!sale) throw new Error('Sale not found for accounting payment sync');
  if (String(sale.invoiceStatus || '').toLowerCase() !== 'posted') {
    return { sale, payment: null, invoice: null, synced: false, reason: 'invoice_not_posted' };
  }
  await ensureAccountingChart(input.userId);

  let invoice: any = sale.accountingInvoiceId
    ? await AccountingInvoice.findById(String(sale.accountingInvoiceId))
    : await AccountingInvoice.findOne({
      referenceType: 'sale',
      referenceId: String(sale._id),
      status: { $ne: 'cancelled' },
    });

  if (!invoice) {
    const synced = await syncPostedSaleToAccounting(sale, { userId: input.userId, markMigrated: true });
    return { sale: synced.sale, payment: null, invoice: synced.invoice, synced: true, reason: 'invoice_synced_from_sale' };
  }

  const recorded = await recordPayment({
    invoiceId: invoice._id.toString(),
    amount: round2(Math.max(0, Number(input.amount || 0))),
    mode: toAccountingPaymentMode(normalizePaymentMode(input.mode || sale.paymentMethod)),
    description: input.notes || `Payment for ${sale.invoiceNumber || sale.saleNumber}`,
    createdBy: input.userId,
    paymentDate: input.paymentDate || new Date(),
    metadata: {
      source: 'pos_sale_payment',
      sourceSaleId: String(sale._id),
      sourceInvoiceNumber: sale.invoiceNumber || sale.saleNumber,
    },
  }, { skipChartEnsure: true });

  sale.paymentStatus = shouldMarkSalePaymentCompleted(sale, recorded.invoice) ? 'completed' : 'pending';
  await updateSaleLedgerLinks(sale, {
    invoice: recorded.invoice,
    paymentIds: [recorded.payment._id.toString()],
    userId: input.userId,
    markMigrated: true,
  });

  const plan = await buildSaleAccountingPlan(sale);
  const diagnostics = await buildPosSaleAccountingDiagnostics(sale, recorded.invoice, plan);
  return { sale, payment: recorded.payment, invoice: recorded.invoice, synced: true, diagnostics };
};

export const backfillPostedSalesToAccounting = async (input: { limit?: number; userId?: string } = {}) => {
  const limit = Math.max(1, Math.min(500, Number(input.limit || 250)));
  const sales = await Sale.find({
    $and: [
      { saleStatus: { $in: ['completed', 'returned'] } },
      { $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }] },
      {
        $or: [
          { ledgerPosted: { $ne: true } },
          { accountingInvoiceId: { $exists: false } },
          { accountingInvoiceId: '' },
          { migratedToLedger: { $ne: true } },
        ],
      },
    ],
  })
    .sort({ postedAt: 1, createdAt: 1, _id: 1 })
    .limit(limit);

  const results: Array<{ saleId: string; invoiceNumber: string; status: 'synced' | 'failed'; error?: string }> = [];
  for (const sale of sales) {
    try {
      await syncPostedSaleToAccounting(sale, { userId: input.userId, markMigrated: true });
      results.push({
        saleId: sale._id.toString(),
        invoiceNumber: sale.invoiceNumber || sale.saleNumber,
        status: 'synced',
      });
    } catch (error: any) {
      results.push({
        saleId: sale._id.toString(),
        invoiceNumber: sale.invoiceNumber || sale.saleNumber,
        status: 'failed',
        error: String(error?.message || error || 'Unknown sync failure'),
      });
    }
  }

  return {
    scanned: sales.length,
    synced: results.filter((row) => row.status === 'synced').length,
    failed: results.filter((row) => row.status === 'failed').length,
    results,
  };
};

let scheduledTask: ScheduledTask | null = null;

export const startSalesLedgerScheduler = (): void => {
  if (scheduledTask) return;
  const enabled = !['0', 'false', 'no', 'off'].includes(String(process.env.POS_LEDGER_SYNC_ENABLED || 'true').trim().toLowerCase());
  if (!enabled) {
    console.log('POS sales-to-ledger scheduler is disabled.');
    return;
  }

  const cronExpression = String(process.env.POS_LEDGER_SYNC_CRON || '15 2 * * *').trim() || '15 2 * * *';
  const timezone = String(process.env.POS_LEDGER_SYNC_TIMEZONE || process.env.TZ || 'Asia/Calcutta').trim() || 'Asia/Calcutta';
  const limit = Math.max(1, Math.min(500, Number(process.env.POS_LEDGER_SYNC_LIMIT || 250)));

  scheduledTask = cron.schedule(
    cronExpression,
    () => {
      void (async () => {
        const tenants = await Tenant.find({ isActive: true }).select('_id').lean();
        for (const tenant of tenants as any[]) {
          const tenantId = String(tenant?._id || '').trim();
          if (!tenantId) continue;
          await runWithTenantContext(tenantId, async () => {
            try {
              const result = await backfillPostedSalesToAccounting({ limit, userId: 'system-cron' });
              if (result.synced > 0 || result.failed > 0) {
                console.log(`POS ledger sync for tenant ${tenantId}: scanned ${result.scanned}, synced ${result.synced}, failed ${result.failed}`);
              }
            } catch (error) {
              console.error(`POS ledger sync failed for tenant ${tenantId}:`, error);
            }
          });
        }
      })().catch((error) => {
        console.error('POS ledger scheduler run failed:', error);
      });
    },
    { timezone }
  );

  console.log(`POS sales-to-ledger scheduler enabled: ${cronExpression} (${timezone})`);
};
