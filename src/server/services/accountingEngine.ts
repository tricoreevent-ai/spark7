import mongoose from 'mongoose';
import { ChartAccount, type AccountSubType, type AccountType, type IChartAccount } from '../models/ChartAccount.js';
import { AccountLedgerEntry, type LedgerVoucherType } from '../models/AccountLedgerEntry.js';
import { JournalEntry, type IJournalEntry, type JournalReferenceType } from '../models/JournalEntry.js';
import { JournalLine, type IJournalLine } from '../models/JournalLine.js';
import { AccountingInvoice, type IAccountingInvoice } from '../models/AccountingInvoice.js';
import { AccountingPayment, type IAccountingPayment } from '../models/AccountingPayment.js';
import { FinancialPeriod, type IFinancialPeriod } from '../models/FinancialPeriod.js';
import { FixedAsset, type IFixedAsset } from '../models/FixedAsset.js';
import { Vendor, type IVendor } from '../models/Vendor.js';
import { generateNumber } from './numbering.js';
import { writeAuditLog } from './audit.js';
import { writeRecordVersion } from './recordVersion.js';
import {
  buildBankReconciliationMatches,
  buildDepreciationPostingPlan,
  buildInvoicePostingPlan,
  buildRefundPostingPlan,
  paymentModeToAccountKey,
  round2,
  toPeriodKey,
  type AccountingPaymentMode,
  type GstTreatment,
  type ReconciliationLedgerRow,
  type ReconciliationStatementRow,
  validateJournalLines,
} from './accountingRules.js';

type SystemAccountKey =
  | 'assets'
  | 'cash_in_hand'
  | 'bank_account'
  | 'accounts_receivable'
  | 'fixed_assets'
  | 'accumulated_depreciation'
  | 'liabilities'
  | 'accounts_payable'
  | 'gst_payable'
  | 'cgst_payable'
  | 'sgst_payable'
  | 'igst_payable'
  | 'income'
  | 'booking_revenue'
  | 'event_revenue'
  | 'sales_revenue'
  | 'other_income'
  | 'expenses'
  | 'general_expense'
  | 'salary_expense'
  | 'contract_expense'
  | 'depreciation_expense';

interface SystemAccountDefinition {
  key: SystemAccountKey;
  code: string;
  name: string;
  type: AccountType;
  subType?: AccountSubType;
  parentKey?: SystemAccountKey;
}

interface JournalEntryLineInput {
  accountId?: string | mongoose.Types.ObjectId;
  accountKey?: string;
  debit: number;
  credit: number;
  description?: string;
}

interface CreateJournalEntryInput {
  entryDate?: Date;
  referenceType: JournalReferenceType;
  referenceId?: string;
  referenceNo?: string;
  description: string;
  paymentMode?: AccountingPaymentMode;
  createdBy?: string;
  lines: JournalEntryLineInput[];
  metadata?: Record<string, any>;
}

interface CreateInvoiceInput {
  invoiceDate?: Date;
  dueDate?: Date;
  customerId?: string;
  customerName: string;
  referenceType?: 'manual' | 'sale' | 'facility_booking' | 'event_booking';
  referenceId?: string;
  description?: string;
  baseAmount: number;
  gstAmount?: number;
  gstRate?: number;
  gstTreatment?: GstTreatment;
  paymentAmount?: number;
  paymentMode?: AccountingPaymentMode;
  revenueAccountKey?: SystemAccountKey | string;
  invoiceNumber?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  mode?: AccountingPaymentMode;
  description?: string;
  createdBy?: string;
  paymentDate?: Date;
  metadata?: Record<string, any>;
}

interface CreateVendorInput {
  name: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

interface RecordExpenseInput {
  expenseDate?: Date;
  description: string;
  amount: number;
  paidAmount?: number;
  paymentMode?: AccountingPaymentMode;
  expenseAccountId?: string;
  expenseAccountName?: string;
  vendorId?: string;
  vendorName?: string;
  vendorContact?: string;
  vendorPhone?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

interface RecordRefundInput {
  refundDate?: Date;
  description: string;
  baseAmount: number;
  gstAmount?: number;
  gstRate?: number;
  gstTreatment?: GstTreatment;
  paymentMode?: AccountingPaymentMode;
  revenueAccountKey?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

interface CreateFixedAssetInput {
  assetName: string;
  description?: string;
  cost: number;
  lifeYears: number;
  purchaseDate?: Date;
  createdBy?: string;
}

const SYSTEM_ACCOUNTS: SystemAccountDefinition[] = [
  { key: 'assets', code: '1000', name: 'Assets', type: 'asset' },
  { key: 'cash_in_hand', code: '1010', name: 'Cash In Hand', type: 'asset', subType: 'cash', parentKey: 'assets' },
  { key: 'bank_account', code: '1020', name: 'Bank Account', type: 'asset', subType: 'bank', parentKey: 'assets' },
  { key: 'accounts_receivable', code: '1100', name: 'Accounts Receivable', type: 'asset', subType: 'customer', parentKey: 'assets' },
  { key: 'fixed_assets', code: '1200', name: 'Fixed Assets', type: 'asset', parentKey: 'assets' },
  { key: 'accumulated_depreciation', code: '1210', name: 'Accumulated Depreciation', type: 'asset', parentKey: 'assets' },
  { key: 'liabilities', code: '2000', name: 'Liabilities', type: 'liability' },
  { key: 'accounts_payable', code: '2100', name: 'Accounts Payable', type: 'liability', subType: 'supplier', parentKey: 'liabilities' },
  { key: 'gst_payable', code: '2200', name: 'GST Payable', type: 'liability', parentKey: 'liabilities' },
  { key: 'cgst_payable', code: '2210', name: 'CGST Payable', type: 'liability', parentKey: 'gst_payable' },
  { key: 'sgst_payable', code: '2220', name: 'SGST Payable', type: 'liability', parentKey: 'gst_payable' },
  { key: 'igst_payable', code: '2230', name: 'IGST Payable', type: 'liability', parentKey: 'gst_payable' },
  { key: 'income', code: '3000', name: 'Income', type: 'income' },
  { key: 'booking_revenue', code: '3100', name: 'Booking Revenue', type: 'income', parentKey: 'income' },
  { key: 'event_revenue', code: '3110', name: 'Event Revenue', type: 'income', parentKey: 'income' },
  { key: 'sales_revenue', code: '3120', name: 'Sales Revenue', type: 'income', parentKey: 'income' },
  { key: 'other_income', code: '3190', name: 'Other Income', type: 'income', parentKey: 'income' },
  { key: 'expenses', code: '4000', name: 'Expenses', type: 'expense' },
  { key: 'general_expense', code: '4100', name: 'General Expense', type: 'expense', parentKey: 'expenses' },
  { key: 'salary_expense', code: '4110', name: 'Salary Expense', type: 'expense', parentKey: 'expenses' },
  { key: 'contract_expense', code: '4120', name: 'Contract Expense', type: 'expense', parentKey: 'expenses' },
  { key: 'depreciation_expense', code: '4130', name: 'Depreciation Expense', type: 'expense', parentKey: 'expenses' },
];

const normalizePaymentMode = (value?: string): AccountingPaymentMode => {
  const mode = String(value || 'cash').trim().toLowerCase();
  if (mode === 'bank') return 'bank';
  if (mode === 'card') return 'card';
  if (mode === 'upi') return 'upi';
  if (mode === 'cheque') return 'cheque';
  if (mode === 'online') return 'online';
  if (mode === 'bank_transfer') return 'bank_transfer';
  if (mode === 'adjustment') return 'adjustment';
  return 'cash';
};

const journalReferenceToLedgerType = (referenceType: JournalReferenceType): LedgerVoucherType => {
  if (referenceType === 'payment') return 'receipt';
  if (referenceType === 'expense' || referenceType === 'refund') return 'payment';
  if (referenceType === 'depreciation' || referenceType === 'reversal') return 'adjustment';
  if (referenceType === 'opening') return 'opening';
  return 'journal';
};

const getPeriodDates = (month: number, year: number) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  return { startDate, endDate };
};

const getAccountClosing = async (accountId: mongoose.Types.ObjectId | string, endDate?: Date) => {
  const filter: Record<string, any> = { accountId };
  if (endDate) filter.entryDate = { $lte: endDate };
  const last = await AccountLedgerEntry.findOne(filter).sort({ entryDate: -1, createdAt: -1, _id: -1 });
  return Number(last?.runningBalance || 0);
};

const postLedgerEntry = async (input: {
  account: IChartAccount;
  entryDate: Date;
  referenceType: JournalReferenceType;
  journalEntryId: mongoose.Types.ObjectId;
  journalEntryNumber: string;
  referenceNo?: string;
  paymentMode?: AccountingPaymentMode;
  debit: number;
  credit: number;
  description?: string;
  createdBy?: string;
}) => {
  const runningBalance = round2(
    (await getAccountClosing(input.account._id as mongoose.Types.ObjectId, input.entryDate)) + input.debit - input.credit
  );
  return AccountLedgerEntry.create({
    accountId: input.account._id,
    entryDate: input.entryDate,
    voucherType: journalReferenceToLedgerType(input.referenceType),
    voucherNumber: input.journalEntryNumber,
    referenceNo: input.referenceNo,
    narration: input.description,
    paymentMode: input.paymentMode === 'adjustment' ? 'adjustment' : normalizePaymentMode(input.paymentMode),
    debit: round2(input.debit),
    credit: round2(input.credit),
    runningBalance,
    createdBy: input.createdBy,
    metadata: {
      source: 'journal_entry',
      sourceId: input.journalEntryId.toString(),
      referenceType: input.referenceType,
    },
  });
};

const escapeRegex = (value: string): string => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isDuplicateKeyError = (error: any): boolean => {
  if (!error) return false;
  if (Number(error?.code) === 11000) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('e11000') || message.includes('duplicate key');
};

const findSystemAccountByKey = async (key: SystemAccountKey): Promise<IChartAccount | null> =>
  ChartAccount.findOne({ systemKey: key });

const findAccountByCode = async (accountCode: string): Promise<IChartAccount | null> =>
  ChartAccount.findOne({ accountCode: String(accountCode || '').trim().toUpperCase() });

const findFallbackAccount = async (definition: SystemAccountDefinition): Promise<IChartAccount | null> =>
  ChartAccount.findOne({
    $and: [
      {
        $or: [
          { systemKey: definition.key },
          { systemKey: { $exists: false } },
          { systemKey: '' },
        ],
      },
      {
        $or: [
          { accountCode: definition.code },
          { accountName: { $regex: `^${escapeRegex(definition.name)}$`, $options: 'i' } },
        ],
      },
    ],
  });

const allocateSystemAccountCode = async (preferredCode: string): Promise<string> => {
  const base = String(preferredCode || '').trim().toUpperCase();
  if (!base) {
    return generateNumber('chart_account_system', { prefix: 'SYS-', padTo: 5 });
  }

  const direct = await findAccountByCode(base);
  if (!direct) return base;

  if (/^\d+$/.test(base)) {
    const numeric = Number(base);
    for (let offset = 1; offset <= 500; offset += 1) {
      const candidate = String(numeric + offset);
      const exists = await findAccountByCode(candidate);
      if (!exists) return candidate;
    }
  }

  return generateNumber('chart_account_system', { prefix: 'SYS-', padTo: 5 });
};

export const ensureAccountingChart = async (createdBy?: string): Promise<Map<string, IChartAccount>> => {
  const resolved = new Map<string, IChartAccount>();

  for (const definition of SYSTEM_ACCOUNTS) {
    const parentAccount = definition.parentKey
      ? resolved.get(definition.parentKey) || await findSystemAccountByKey(definition.parentKey)
      : null;
    const parentAccountId = parentAccount?._id;
    const payload: Record<string, any> = {
      accountCode: definition.code,
      accountName: definition.name,
      accountType: definition.type,
      subType: definition.subType || 'general',
      parentAccountId,
      systemKey: definition.key,
      isSystem: true,
      isActive: true,
      openingBalance: 0,
      openingSide: definition.type === 'liability' ? 'credit' : 'debit',
    };

    let account: IChartAccount | null =
      await findSystemAccountByKey(definition.key)
      || await findFallbackAccount(definition);

    try {
      if (account) {
        const latestByKey = await findSystemAccountByKey(definition.key);
        if (latestByKey && String(latestByKey._id) !== String(account._id)) {
          account = latestByKey;
          resolved.set(definition.key, account);
          continue;
        }

        const conflictByCode = await ChartAccount.findOne({
          _id: { $ne: account._id },
          accountCode: definition.code,
        }).select('_id accountCode');

        const safePayload = {
          ...payload,
          accountCode: conflictByCode ? account.accountCode : payload.accountCode,
        };

        const needsUpdate =
          account.systemKey !== definition.key
          || account.accountCode !== safePayload.accountCode
          || account.accountName !== definition.name
          || String(account.parentAccountId || '') !== String(parentAccountId || '')
          || account.accountType !== definition.type
          || account.subType !== (definition.subType || 'general')
          || !account.isSystem;
        if (needsUpdate) {
          account = await ChartAccount.findByIdAndUpdate(
            account._id,
            { $set: safePayload, $setOnInsert: { createdBy } },
            { new: true, runValidators: true }
          );
        }
      } else {
        const accountCode = await allocateSystemAccountCode(definition.code);
        account = await ChartAccount.create({ ...payload, accountCode, createdBy });
      }
    } catch (error: any) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      // Concurrent chart initialization can race on tenantId+systemKey unique index.
      account = await findSystemAccountByKey(definition.key);
      if (!account) {
        const codeMatch = await findAccountByCode(definition.code);
        if (codeMatch) {
          try {
            account = await ChartAccount.findByIdAndUpdate(
              codeMatch._id,
              {
                $set: {
                  ...payload,
                  accountCode: codeMatch.accountCode,
                },
                $setOnInsert: { createdBy },
              },
              { new: true, runValidators: true }
            );
          } catch {
            account = await findSystemAccountByKey(definition.key);
          }
        }
      }
      if (!account) {
        const fallbackCode = await allocateSystemAccountCode(definition.code);
        try {
          account = await ChartAccount.create({ ...payload, accountCode: fallbackCode, createdBy });
        } catch {
          account = await findSystemAccountByKey(definition.key);
        }
      }
      if (!account) {
        throw new Error(`System chart setup conflict for "${definition.name}". Please refresh and retry.`);
      }
    }

    if (account) {
      resolved.set(definition.key, account);
      continue;
    }

    throw new Error(`Unable to prepare required system account "${definition.name}"`);
  }

  return resolved;
};

export const ensureFinancialPeriod = async (month: number, year: number, createdBy?: string): Promise<IFinancialPeriod> => {
  const safeMonth = Math.max(1, Math.min(12, Number(month || 0)));
  const safeYear = Math.max(2000, Number(year || 0));
  const periodKey = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
  const { startDate, endDate } = getPeriodDates(safeMonth, safeYear);
  return FinancialPeriod.findOneAndUpdate(
    { periodKey },
    {
      $setOnInsert: {
        periodKey,
        month: safeMonth,
        year: safeYear,
        startDate,
        endDate,
        isLocked: false,
        createdBy,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export const assertPeriodOpen = async (date: Date): Promise<IFinancialPeriod> => {
  const period = await ensureFinancialPeriod(date.getMonth() + 1, date.getFullYear());
  if (period.isLocked) {
    throw new Error(`Financial period ${period.periodKey} is locked`);
  }
  return period;
};

export const setFinancialPeriodLock = async (month: number, year: number, isLocked: boolean, userId?: string) => {
  const period = await ensureFinancialPeriod(month, year, userId);
  const before = period.toObject();
  period.isLocked = isLocked;
  period.lockedAt = isLocked ? new Date() : undefined;
  period.lockedBy = isLocked ? userId : undefined;
  await period.save();

  await writeAuditLog({
    module: 'accounting',
    action: isLocked ? 'financial_period_locked' : 'financial_period_unlocked',
    entityType: 'financial_period',
    entityId: period._id.toString(),
    referenceNo: period.periodKey,
    userId,
    before,
    after: period.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'financial_period',
    recordId: period._id.toString(),
    action: isLocked ? 'LOCK' : 'UNLOCK',
    changedBy: userId,
    dataSnapshot: period.toObject(),
  });

  return period;
};

const resolveAccount = async (input: {
  accountId?: string | mongoose.Types.ObjectId;
  accountKey?: string;
  fallbackName?: string;
  fallbackType?: AccountType;
  fallbackSubType?: AccountSubType;
  parentSystemKey?: SystemAccountKey;
  createdBy?: string;
}): Promise<IChartAccount> => {
  if (input.accountId) {
    const byId = await ChartAccount.findById(input.accountId);
    if (!byId) throw new Error(`Account not found: ${input.accountId}`);
    return byId;
  }

  if (input.accountKey) {
    const byKey = await ChartAccount.findOne({
      $or: [{ systemKey: String(input.accountKey).toLowerCase() }, { accountCode: String(input.accountKey).toUpperCase() }],
    });
    if (byKey) return byKey;
  }

  if (!input.fallbackName || !input.fallbackType) {
    throw new Error(`Account not configured for ${input.accountKey || 'requested line'}`);
  }

  const parentAccount = input.parentSystemKey
    ? await ChartAccount.findOne({ systemKey: input.parentSystemKey })
    : null;

  const existing = await ChartAccount.findOne({
    accountType: input.fallbackType,
    accountName: { $regex: `^${String(input.fallbackName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existing) return existing;

  const accountCode = await generateNumber('chart_account_manual', { prefix: 'AC-', padTo: 5 });
  return ChartAccount.create({
    accountCode,
    accountName: String(input.fallbackName).trim(),
    accountType: input.fallbackType,
    subType: input.fallbackSubType || 'general',
    parentAccountId: parentAccount?._id,
    openingBalance: 0,
    openingSide: input.fallbackType === 'liability' ? 'credit' : 'debit',
    isSystem: false,
    isActive: true,
    createdBy: input.createdBy,
  });
};

const buildAuditAfterSnapshot = (
  entry: IJournalEntry,
  lines: IJournalLine[]
): Record<string, any> => ({
  entryNumber: entry.entryNumber,
  entryDate: entry.entryDate,
  referenceType: entry.referenceType,
  referenceId: entry.referenceId,
  referenceNo: entry.referenceNo,
  description: entry.description,
  status: entry.status,
  totalDebit: entry.totalDebit,
  totalCredit: entry.totalCredit,
  lines: lines.map((line) => ({
    lineNumber: line.lineNumber,
    accountCode: line.accountCode,
    accountName: line.accountName,
    description: line.description,
    debitAmount: line.debitAmount,
    creditAmount: line.creditAmount,
  })),
});

export const createJournalEntry = async (input: CreateJournalEntryInput): Promise<{
  entry: IJournalEntry;
  lines: IJournalLine[];
}> => {
  const entryDate = input.entryDate ? new Date(input.entryDate) : new Date();
  await assertPeriodOpen(entryDate);
  await ensureAccountingChart(input.createdBy);

  const resolvedLines = await Promise.all(
    (input.lines || []).map(async (line) => {
      const account = await resolveAccount({
        accountId: line.accountId,
        accountKey: line.accountKey,
        createdBy: input.createdBy,
      });
      return {
        account,
        debit: round2(Number(line.debit || 0)),
        credit: round2(Number(line.credit || 0)),
        description: line.description,
      };
    })
  );

  const validation = validateJournalLines(
    resolvedLines.map((line) => ({
      accountKey: line.account.systemKey || line.account.accountCode,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    }))
  );

  const entryNumber = await generateNumber('journal_entry', { prefix: 'JE-', datePart: true, padTo: 5 });
  const entry = await JournalEntry.create({
    entryNumber,
    entryDate,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNo: input.referenceNo,
    description: input.description,
    status: 'posted',
    totalDebit: validation.totalDebit,
    totalCredit: validation.totalCredit,
    createdBy: input.createdBy,
    metadata: input.metadata,
  });

  const inserted = await JournalLine.insertMany(
    resolvedLines.map((line, index) => ({
      journalId: entry._id,
      entryDate,
      lineNumber: index + 1,
      accountId: line.account._id,
      accountCode: line.account.accountCode,
      accountName: line.account.accountName,
      description: line.description,
      debitAmount: line.debit,
      creditAmount: line.credit,
    }))
  );

  for (const line of resolvedLines) {
    await postLedgerEntry({
      account: line.account,
      entryDate,
      referenceType: input.referenceType,
      journalEntryId: entry._id as mongoose.Types.ObjectId,
      journalEntryNumber: entry.entryNumber,
      referenceNo: input.referenceNo,
      paymentMode: input.paymentMode,
      debit: line.debit,
      credit: line.credit,
      description: line.description || input.description,
      createdBy: input.createdBy,
    });
  }

  await writeAuditLog({
    module: 'accounting',
    action: 'journal_entry_created',
    entityType: 'journal_entry',
    entityId: entry._id.toString(),
    referenceNo: entry.entryNumber,
    userId: input.createdBy,
    metadata: input.metadata,
    after: buildAuditAfterSnapshot(entry, inserted as unknown as IJournalLine[]),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'journal_entry',
    recordId: entry._id.toString(),
    action: 'CREATE',
    changedBy: input.createdBy,
    dataSnapshot: buildAuditAfterSnapshot(entry, inserted as unknown as IJournalLine[]),
    metadata: input.metadata,
  });

  return { entry, lines: inserted as unknown as IJournalLine[] };
};

export const createVendor = async (input: CreateVendorInput): Promise<IVendor> => {
  await ensureAccountingChart(input.createdBy);
  const existing = await Vendor.findOne({ name: { $regex: `^${input.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (existing) return existing;

  const ledgerAccount = await resolveAccount({
    fallbackName: `Vendor - ${input.name}`,
    fallbackType: 'liability',
    fallbackSubType: 'supplier',
    parentSystemKey: 'accounts_payable',
    createdBy: input.createdBy,
  });

  const vendor = await Vendor.create({
    name: input.name,
    contact: input.contact,
    email: input.email,
    phone: input.phone,
    address: input.address,
    ledgerAccountId: ledgerAccount._id,
    isActive: true,
    createdBy: input.createdBy,
  });

  await writeAuditLog({
    module: 'accounting',
    action: 'vendor_created',
    entityType: 'vendor',
    entityId: vendor._id.toString(),
    referenceNo: vendor.name,
    userId: input.createdBy,
    metadata: input.metadata,
    after: vendor.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'vendor',
    recordId: vendor._id.toString(),
    action: 'CREATE',
    changedBy: input.createdBy,
    dataSnapshot: vendor.toObject(),
    metadata: input.metadata,
  });

  return vendor;
};

const buildInvoiceStatus = (paidAmount: number, totalAmount: number): IAccountingInvoice['status'] => {
  if (totalAmount <= 0 || paidAmount >= totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'posted';
};

export const createInvoice = async (input: CreateInvoiceInput): Promise<{
  invoice: IAccountingInvoice;
  journalEntry: IJournalEntry;
  payment?: IAccountingPayment | null;
}> => {
  const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
  await assertPeriodOpen(invoiceDate);
  await ensureAccountingChart(input.createdBy);

  const postingPlan = buildInvoicePostingPlan({
    baseAmount: input.baseAmount,
    gstAmount: input.gstAmount,
    gstRate: input.gstRate,
    gstTreatment: input.gstTreatment,
    paymentAmount: input.paymentAmount,
    paymentMode: normalizePaymentMode(input.paymentMode),
    revenueAccountKey: input.revenueAccountKey || 'booking_revenue',
  });

  const invoiceNumber = input.invoiceNumber || await generateNumber('accounting_invoice', {
    prefix: 'AINV-',
    datePart: true,
    padTo: 5,
  });

  const initialPaidAmount = Math.min(round2(Number(input.paymentAmount || 0)), postingPlan.gst.totalAmount);
  const invoice = await AccountingInvoice.create({
    invoiceNumber,
    invoiceDate,
    dueDate: input.dueDate,
    customerId: input.customerId,
    customerName: String(input.customerName || '').trim() || 'Walk-in Customer',
    referenceType: input.referenceType || 'manual',
    referenceId: input.referenceId,
    description: input.description,
    baseAmount: postingPlan.gst.baseAmount,
    gstAmount: postingPlan.gst.gstAmount,
    cgstAmount: postingPlan.gst.cgstAmount,
    sgstAmount: postingPlan.gst.sgstAmount,
    igstAmount: postingPlan.gst.igstAmount,
    totalAmount: postingPlan.gst.totalAmount,
    paidAmount: initialPaidAmount,
    balanceAmount: round2(Math.max(0, postingPlan.gst.totalAmount - initialPaidAmount)),
    status: buildInvoiceStatus(initialPaidAmount, postingPlan.gst.totalAmount),
    gstTreatment: postingPlan.gst.gstTreatment,
    createdBy: input.createdBy,
    metadata: {
      postingMode: postingPlan.postingMode,
      ...input.metadata,
    },
  });

  const invoiceJournal = await createJournalEntry({
    entryDate: invoiceDate,
    referenceType: 'invoice',
    referenceId: invoice._id.toString(),
    referenceNo: invoice.invoiceNumber,
    description: input.description || `Invoice ${invoice.invoiceNumber}`,
    paymentMode: normalizePaymentMode(input.paymentMode),
    createdBy: input.createdBy,
    metadata: {
      sourceReferenceType: input.referenceType || 'manual',
      sourceReferenceId: input.referenceId,
      ...input.metadata,
    },
    lines: postingPlan.invoiceLines.map((line) => ({
      accountKey: line.accountKey,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    })),
  });

  invoice.journalEntryId = invoiceJournal.entry._id as mongoose.Types.ObjectId;
  await invoice.save();

  let payment: IAccountingPayment | null = null;
  if (postingPlan.postingMode === 'cash_sale') {
    const paymentNumber = await generateNumber('accounting_payment', { prefix: 'PAY-', datePart: true, padTo: 5 });
    payment = await AccountingPayment.create({
      paymentNumber,
      paymentDate: invoiceDate,
      amount: invoice.totalAmount,
      mode: normalizePaymentMode(input.paymentMode),
      invoiceId: invoice._id,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      description: `Immediate settlement for ${invoice.invoiceNumber}`,
      journalEntryId: invoiceJournal.entry._id,
      status: 'posted',
      createdBy: input.createdBy,
      metadata: { embeddedInInvoiceEntry: true },
    });
  } else if (initialPaidAmount > 0) {
    const recorded = await recordPayment({
      invoiceId: invoice._id.toString(),
      amount: initialPaidAmount,
      mode: normalizePaymentMode(input.paymentMode),
      description: `Initial payment for ${invoice.invoiceNumber}`,
      createdBy: input.createdBy,
      paymentDate: invoiceDate,
      metadata: { initialInvoicePayment: true },
    });
    payment = recorded.payment;
  }

  await writeAuditLog({
    module: 'accounting',
    action: 'invoice_created',
    entityType: 'accounting_invoice',
    entityId: invoice._id.toString(),
    referenceNo: invoice.invoiceNumber,
    userId: input.createdBy,
    metadata: {
      postingMode: postingPlan.postingMode,
      sourceReferenceType: input.referenceType || 'manual',
      sourceReferenceId: input.referenceId,
      ...input.metadata,
    },
    after: invoice.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'accounting_invoice',
    recordId: invoice._id.toString(),
    action: 'CREATE',
    changedBy: input.createdBy,
    dataSnapshot: invoice.toObject(),
    metadata: {
      postingMode: postingPlan.postingMode,
      sourceReferenceType: input.referenceType || 'manual',
      sourceReferenceId: input.referenceId,
      ...input.metadata,
    },
  });

  return { invoice, journalEntry: invoiceJournal.entry, payment };
};

export const recordPayment = async (input: RecordPaymentInput): Promise<{
  invoice: IAccountingInvoice;
  payment: IAccountingPayment;
  journalEntry: IJournalEntry;
}> => {
  const invoice = await AccountingInvoice.findById(input.invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'cancelled') throw new Error('Cancelled invoice cannot accept payments');

  const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
  await assertPeriodOpen(paymentDate);
  await ensureAccountingChart(input.createdBy);

  const outstanding = round2(
    Number(invoice.balanceAmount || Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0)))
  );
  if (outstanding <= 0) {
    throw new Error('Invoice has no outstanding balance');
  }

  const amount = round2(Math.min(outstanding, Number(input.amount || 0)));
  if (amount <= 0) throw new Error('Payment amount must be greater than 0');

  const cashAccountKey = paymentModeToAccountKey(normalizePaymentMode(input.mode));
  const journal = await createJournalEntry({
    entryDate: paymentDate,
    referenceType: 'payment',
    referenceId: invoice._id.toString(),
    referenceNo: invoice.invoiceNumber,
    description: input.description || `Payment for ${invoice.invoiceNumber}`,
    paymentMode: normalizePaymentMode(input.mode),
    createdBy: input.createdBy,
    metadata: input.metadata,
    lines: [
      { accountKey: cashAccountKey, debit: amount, credit: 0, description: 'Payment received' },
      { accountKey: 'accounts_receivable', debit: 0, credit: amount, description: 'Reduce receivable' },
    ],
  });

  const paymentNumber = await generateNumber('accounting_payment', { prefix: 'PAY-', datePart: true, padTo: 5 });
  const payment = await AccountingPayment.create({
    paymentNumber,
    paymentDate,
    amount,
    mode: normalizePaymentMode(input.mode),
    invoiceId: invoice._id,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    description: input.description || `Payment for ${invoice.invoiceNumber}`,
    journalEntryId: journal.entry._id,
    status: 'posted',
    createdBy: input.createdBy,
    metadata: input.metadata,
  });

  invoice.paidAmount = round2(Number(invoice.paidAmount || 0) + amount);
  invoice.balanceAmount = round2(Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0)));
  invoice.status = buildInvoiceStatus(Number(invoice.paidAmount || 0), Number(invoice.totalAmount || 0));
  await invoice.save();

  await writeAuditLog({
    module: 'accounting',
    action: 'invoice_payment_recorded',
    entityType: 'accounting_payment',
    entityId: payment._id.toString(),
    referenceNo: payment.paymentNumber,
    userId: input.createdBy,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      amount,
      paymentMode: payment.mode,
      ...input.metadata,
    },
    after: payment.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'accounting_payment',
    recordId: payment._id.toString(),
    action: 'CREATE',
    changedBy: input.createdBy,
    dataSnapshot: payment.toObject(),
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      amount,
      paymentMode: payment.mode,
      ...input.metadata,
    },
  });

  return { invoice, payment, journalEntry: journal.entry };
};

export const recordExpense = async (input: RecordExpenseInput): Promise<{
  expenseEntry: IJournalEntry;
  paymentEntry?: IJournalEntry | null;
  vendor?: IVendor | null;
}> => {
  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();
  await assertPeriodOpen(expenseDate);
  await ensureAccountingChart(input.createdBy);

  let vendor: IVendor | null = null;
  if (input.vendorId) {
    vendor = await Vendor.findById(input.vendorId);
    if (!vendor) throw new Error('Vendor not found');
  } else if (input.vendorName) {
    vendor = await createVendor({
      name: input.vendorName,
      contact: input.vendorContact,
      phone: input.vendorPhone,
      createdBy: input.createdBy,
    });
  }

  const expenseAccount = await resolveAccount({
    accountId: input.expenseAccountId,
    fallbackName: input.expenseAccountName || 'Expense - General',
    fallbackType: 'expense',
    fallbackSubType: 'general',
    parentSystemKey: 'expenses',
    createdBy: input.createdBy,
  });

  const payableAccount = vendor
    ? await resolveAccount({ accountId: vendor.ledgerAccountId, createdBy: input.createdBy })
    : await resolveAccount({ accountKey: 'accounts_payable', createdBy: input.createdBy });
  const settlementKey = paymentModeToAccountKey(normalizePaymentMode(input.paymentMode));
  const amount = round2(Number(input.amount || 0));
  const paidAmount = round2(Math.max(0, Number(input.paidAmount ?? input.amount ?? 0)));

  if (amount <= 0) throw new Error('Expense amount must be greater than 0');

  const expenseLines =
    paidAmount >= amount
      ? [
          { accountId: expenseAccount._id, debit: amount, credit: 0, description: input.description },
          { accountKey: settlementKey, debit: 0, credit: amount, description: 'Expense paid' },
        ]
      : [
          { accountId: expenseAccount._id, debit: amount, credit: 0, description: input.description },
          { accountId: payableAccount._id, debit: 0, credit: amount, description: 'Expense payable' },
        ];

  const expenseEntry = await createJournalEntry({
    entryDate: expenseDate,
    referenceType: 'expense',
    description: input.description,
    paymentMode: normalizePaymentMode(input.paymentMode),
    createdBy: input.createdBy,
    metadata: {
      vendorId: vendor?._id?.toString(),
      vendorName: vendor?.name,
      ...input.metadata,
    },
    lines: expenseLines,
  });

  let paymentEntry: IJournalEntry | null = null;
  if (paidAmount > 0 && paidAmount < amount) {
    const paymentJournal = await createJournalEntry({
      entryDate: expenseDate,
      referenceType: 'payment',
      referenceId: vendor?._id?.toString(),
      description: `${input.description} payment`,
      paymentMode: normalizePaymentMode(input.paymentMode),
      createdBy: input.createdBy,
      metadata: {
        vendorId: vendor?._id?.toString(),
        vendorName: vendor?.name,
        ...input.metadata,
      },
      lines: [
        { accountId: payableAccount._id, debit: paidAmount, credit: 0, description: 'Reduce payable' },
        { accountKey: settlementKey, debit: 0, credit: paidAmount, description: 'Vendor payment' },
      ],
    });

    paymentEntry = paymentJournal.entry;

    const paymentNumber = await generateNumber('accounting_payment', { prefix: 'PAY-', datePart: true, padTo: 5 });
    await AccountingPayment.create({
      paymentNumber,
      paymentDate: expenseDate,
      amount: paidAmount,
      mode: normalizePaymentMode(input.paymentMode),
      vendorId: vendor?._id,
      description: `${input.description} payment`,
      journalEntryId: paymentEntry._id,
      status: 'posted',
      createdBy: input.createdBy,
      metadata: {
        vendorId: vendor?._id?.toString(),
        vendorName: vendor?.name,
      },
    });
  }

  await writeAuditLog({
    module: 'accounting',
    action: 'expense_recorded',
    entityType: 'journal_entry',
    entityId: expenseEntry.entry._id.toString(),
    referenceNo: expenseEntry.entry.entryNumber,
    userId: input.createdBy,
    metadata: {
      vendorId: vendor?._id?.toString(),
      vendorName: vendor?.name,
      amount,
      paidAmount: Math.min(amount, paidAmount),
      ...input.metadata,
    },
    after: expenseEntry.entry.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'journal_entry',
    recordId: expenseEntry.entry._id.toString(),
    action: 'CREATE',
    changedBy: input.createdBy,
    dataSnapshot: expenseEntry.entry.toObject(),
    metadata: {
      vendorId: vendor?._id?.toString(),
      vendorName: vendor?.name,
      amount,
      paidAmount: Math.min(amount, paidAmount),
      ...input.metadata,
    },
  });

  return { expenseEntry: expenseEntry.entry, paymentEntry, vendor };
};

export const recordRefund = async (input: RecordRefundInput): Promise<{
  journalEntry: IJournalEntry;
}> => {
  const refundDate = input.refundDate ? new Date(input.refundDate) : new Date();
  await assertPeriodOpen(refundDate);
  await ensureAccountingChart(input.createdBy);

  const plan = buildRefundPostingPlan({
    baseAmount: input.baseAmount,
    gstAmount: input.gstAmount,
    gstRate: input.gstRate,
    gstTreatment: input.gstTreatment,
    paymentMode: normalizePaymentMode(input.paymentMode),
    revenueAccountKey: input.revenueAccountKey || 'booking_revenue',
  });

  const journal = await createJournalEntry({
    entryDate: refundDate,
    referenceType: 'refund',
    referenceId: input.referenceId,
    referenceNo: input.referenceNo,
    description: input.description,
    paymentMode: normalizePaymentMode(input.paymentMode),
    createdBy: input.createdBy,
    metadata: input.metadata,
    lines: plan.lines.map((line) => ({
      accountKey: line.accountKey,
      debit: line.debit,
      credit: line.credit,
      description: line.description,
    })),
  });

  return { journalEntry: journal.entry };
};

export const cancelJournalEntry = async (input: {
  journalEntryId: string;
  reason?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}): Promise<{ original: IJournalEntry; reversal: IJournalEntry }> => {
  const original = await JournalEntry.findById(input.journalEntryId);
  if (!original) throw new Error('Journal entry not found');
  if (original.status === 'cancelled') throw new Error('Journal entry is already cancelled');

  const lines = await JournalLine.find({ journalId: original._id }).sort({ lineNumber: 1 });
  if (!lines.length) throw new Error('Journal entry has no lines to reverse');

  const reversal = await createJournalEntry({
    entryDate: new Date(),
    referenceType: 'reversal',
    referenceId: original._id.toString(),
    referenceNo: original.entryNumber,
    description: `Reversal of ${original.entryNumber}`,
    paymentMode: 'adjustment',
    createdBy: input.createdBy,
    metadata: { reversalOf: original._id.toString(), cancellationReason: input.reason, ...input.metadata },
    lines: lines.map((line) => ({
      accountId: line.accountId,
      debit: Number(line.creditAmount || 0),
      credit: Number(line.debitAmount || 0),
      description: `Reversal - ${line.description || original.description}`,
    })),
  });

  original.status = 'cancelled';
  original.reversedEntryId = reversal.entry._id as mongoose.Types.ObjectId;
  original.cancellationReason = input.reason;
  original.cancelledAt = new Date();
  original.cancelledBy = input.createdBy;
  await original.save();

  await writeAuditLog({
    module: 'accounting',
    action: 'journal_entry_cancelled',
    entityType: 'journal_entry',
    entityId: original._id.toString(),
    referenceNo: original.entryNumber,
    userId: input.createdBy,
    metadata: {
      reversalEntryNumber: reversal.entry.entryNumber,
      reason: input.reason,
      ...input.metadata,
    },
    after: {
      originalEntry: original.toObject(),
      reversalEntry: reversal.entry.toObject(),
    },
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'journal_entry',
    recordId: original._id.toString(),
    action: 'CANCEL',
    changedBy: input.createdBy,
    dataSnapshot: original.toObject(),
    metadata: {
      reason: input.reason,
      reversalEntryNumber: reversal.entry.entryNumber,
      ...input.metadata,
    },
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'journal_entry',
    recordId: reversal.entry._id.toString(),
    action: 'CREATE_REVERSAL',
    changedBy: input.createdBy,
    dataSnapshot: reversal.entry.toObject(),
    metadata: {
      reversalOf: original._id.toString(),
      reason: input.reason,
      ...input.metadata,
    },
  });

  return { original, reversal: reversal.entry };
};

export const cancelInvoice = async (input: {
  invoiceId: string;
  reason?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}) => {
  const invoice = await AccountingInvoice.findById(input.invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'cancelled') throw new Error('Invoice already cancelled');
  const before = invoice.toObject();

  if (invoice.balanceAmount > 0 && invoice.journalEntryId) {
    await cancelJournalEntry({
      journalEntryId: invoice.journalEntryId.toString(),
      reason: input.reason || `Cancel invoice ${invoice.invoiceNumber}`,
      createdBy: input.createdBy,
      metadata: input.metadata,
    });
  }

  invoice.status = 'cancelled';
  invoice.cancelledAt = new Date();
  invoice.cancelledBy = input.createdBy;
  invoice.cancellationReason = input.reason;
  await invoice.save();

  await writeAuditLog({
    module: 'accounting',
    action: 'invoice_cancelled',
    entityType: 'accounting_invoice',
    entityId: invoice._id.toString(),
    referenceNo: invoice.invoiceNumber,
    userId: input.createdBy,
    metadata: {
      reason: input.reason,
      ...input.metadata,
    },
    before,
    after: invoice.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'accounting_invoice',
    recordId: invoice._id.toString(),
    action: 'CANCEL',
    changedBy: input.createdBy,
    dataSnapshot: invoice.toObject(),
    metadata: {
      reason: input.reason,
      ...input.metadata,
    },
  });

  return invoice;
};

export const createFixedAsset = async (input: CreateFixedAssetInput): Promise<IFixedAsset> => {
  const accounts = await ensureAccountingChart(input.createdBy);
  return FixedAsset.create({
    assetName: input.assetName,
    description: input.description,
    cost: round2(Number(input.cost || 0)),
    lifeYears: Number(input.lifeYears || 0),
    purchaseDate: input.purchaseDate || new Date(),
    assetAccountId: accounts.get('fixed_assets')?._id,
    depreciationExpenseAccountId: accounts.get('depreciation_expense')?._id,
    accumulatedDepreciationAccountId: accounts.get('accumulated_depreciation')?._id,
    totalDepreciationPosted: 0,
    createdBy: input.createdBy,
  });
};

export const runAssetDepreciation = async (assetId: string, input: { postingDate?: Date; createdBy?: string }) => {
  const asset = await FixedAsset.findById(assetId);
  if (!asset) throw new Error('Asset not found');
  if (asset.status !== 'active') throw new Error('Only active assets can be depreciated');

  const postingDate = input.postingDate ? new Date(input.postingDate) : new Date();
  await assertPeriodOpen(postingDate);
  await ensureAccountingChart(input.createdBy);

  const plan = buildDepreciationPostingPlan({ cost: Number(asset.cost || 0), lifeYears: Number(asset.lifeYears || 0) });
  const journal = await createJournalEntry({
    entryDate: postingDate,
    referenceType: 'depreciation',
    referenceId: asset._id.toString(),
    referenceNo: asset.assetName,
    description: `Monthly depreciation - ${asset.assetName}`,
    paymentMode: 'adjustment',
    createdBy: input.createdBy,
    metadata: { assetId: asset._id.toString(), assetName: asset.assetName },
    lines: [
      {
        accountId: asset.depreciationExpenseAccountId,
        debit: plan.monthlyDepreciation,
        credit: 0,
        description: 'Depreciation expense',
      },
      {
        accountId: asset.accumulatedDepreciationAccountId,
        debit: 0,
        credit: plan.monthlyDepreciation,
        description: 'Accumulated depreciation',
      },
    ],
  });

  asset.totalDepreciationPosted = round2(Number(asset.totalDepreciationPosted || 0) + plan.monthlyDepreciation);
  asset.lastDepreciationDate = postingDate;
  await asset.save();

  return { asset, journalEntry: journal.entry, monthlyDepreciation: plan.monthlyDepreciation };
};

export const listVendorBalances = async (): Promise<Array<Record<string, any>>> => {
  const vendors = await Vendor.find({ isActive: true }).populate('ledgerAccountId', 'accountCode accountName');
  const rows = await Promise.all(
    vendors.map(async (vendor) => {
      const ledgerAccount = await ChartAccount.findById(vendor.ledgerAccountId);
      const closing = ledgerAccount ? await getAccountClosing(ledgerAccount._id as mongoose.Types.ObjectId) : 0;
      const totalCredits = await AccountLedgerEntry.aggregate([
        { $match: { accountId: ledgerAccount?._id } },
        { $group: { _id: null, total: { $sum: '$credit' } } },
      ]);
      const totalDebits = await AccountLedgerEntry.aggregate([
        { $match: { accountId: ledgerAccount?._id } },
        { $group: { _id: null, total: { $sum: '$debit' } } },
      ]);
      return {
        _id: vendor._id,
        name: vendor.name,
        contact: vendor.contact,
        phone: vendor.phone,
        email: vendor.email,
        ledgerAccountId: vendor.ledgerAccountId,
        totalPayable: round2(Number(totalCredits[0]?.total || 0)),
        paid: round2(Number(totalDebits[0]?.total || 0)),
        balance: round2(Math.abs(closing)),
      };
    })
  );
  return rows;
};

export const importBankStatement = async (statementRows: ReconciliationStatementRow[]) => {
  const bankAccount = await resolveAccount({ accountKey: 'bank_account' });
  const ledgerRows = await AccountLedgerEntry.find({
    accountId: bankAccount._id,
    isReconciled: false,
  }).sort({ entryDate: 1, createdAt: 1 });

  const normalizedLedger: ReconciliationLedgerRow[] = ledgerRows.map((row) => ({
    id: row._id.toString(),
    entryDate: row.entryDate,
    debit: row.debit,
    credit: row.credit,
    narration: row.narration,
  }));

  return buildBankReconciliationMatches(statementRows, normalizedLedger);
};

const escapeCsvCell = (value: unknown): string => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

export const toCsv = (rows: Array<Record<string, any>>): string => {
  if (!rows.length) return '';
  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(',')),
  ].join('\n');
};

export const buildDashboardSummary = async (today = new Date()) => {
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayIncome, monthIncome, monthExpense, gstPayableAgg] = await Promise.all([
    JournalLine.aggregate([
      { $match: { entryDate: { $gte: startOfToday, $lte: endOfToday } } },
      { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.accountType': 'income' } },
      { $group: { _id: null, total: { $sum: '$creditAmount' } } },
    ]),
    JournalLine.aggregate([
      { $match: { entryDate: { $gte: startOfMonth, $lte: endOfToday } } },
      { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.accountType': 'income' } },
      { $group: { _id: null, total: { $sum: '$creditAmount' } } },
    ]),
    JournalLine.aggregate([
      { $match: { entryDate: { $gte: startOfMonth, $lte: endOfToday } } },
      { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.accountType': 'expense' } },
      { $group: { _id: null, total: { $sum: '$debitAmount' } } },
    ]),
    JournalLine.aggregate([
      { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.systemKey': { $in: ['cgst_payable', 'sgst_payable', 'igst_payable'] } } },
      { $group: { _id: null, credit: { $sum: '$creditAmount' }, debit: { $sum: '$debitAmount' } } },
    ]),
  ]);

  const todayRevenue = round2(Number(todayIncome[0]?.total || 0));
  const monthlyRevenue = round2(Number(monthIncome[0]?.total || 0));
  const expenses = round2(Number(monthExpense[0]?.total || 0));
  const gstPayable = round2(Number(gstPayableAgg[0]?.credit || 0) - Number(gstPayableAgg[0]?.debit || 0));

  return {
    todayRevenue,
    monthlyRevenue,
    expenses,
    profit: round2(monthlyRevenue - expenses),
    gstPayable,
    periodKey: toPeriodKey(today),
  };
};
