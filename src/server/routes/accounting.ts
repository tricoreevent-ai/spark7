import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Sale } from '../models/Sale.js';
import { Return } from '../models/Return.js';
import { SalaryPayment } from '../models/SalaryPayment.js';
import { ContractPayment } from '../models/ContractPayment.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { CreditNote } from '../models/CreditNote.js';
import { ReceiptVoucher } from '../models/ReceiptVoucher.js';
import { ChartAccount, AccountType, AccountSubType } from '../models/ChartAccount.js';
import { AccountGroup, AccountGroupUnder } from '../models/AccountGroup.js';
import { AccountLedgerEntry, LedgerVoucherType } from '../models/AccountLedgerEntry.js';
import { AccountingVoucher, IAccountingVoucherDocumentFields, VoucherType } from '../models/AccountingVoucher.js';
import { OpeningBalanceSetup } from '../models/OpeningBalanceSetup.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { writeRecordVersion } from '../services/recordVersion.js';
import { sendConfiguredMail } from '../services/mail.js';
import { Employee } from '../models/Employee.js';
import { TreasuryAccount } from '../models/TreasuryAccount.js';
import { BankFeedTransaction } from '../models/BankFeedTransaction.js';
import accountingCoreRoutes from './accountingCore.js';
import tdsRoutes from './tds.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import {
  ensureTreasuryDefaults,
  importBankFeed,
  resolveTreasuryRoute,
  upsertPaymentMethodRoute,
  upsertTreasuryAccount,
} from '../services/treasury.js';
import {
  buildBalanceSheetReport,
  buildIncomeExpenseReports,
  buildProfitLossStatement,
  buildRetainedEarningsUntil,
  buildTrialBalanceReport,
} from '../services/accountingReports.js';

const router = Router();
const accountingReportRateLimit = createRateLimitMiddleware({
  bucket: 'accounting-report',
  limit: 30,
  windowMs: 60_000,
  message: 'Too many accounting reports were requested in a short time. Please wait a minute and try again.',
  auditFlagType: 'accounting_report_rate_limit',
});

router.use('/core', accountingCoreRoutes);
router.use('/tds', tdsRoutes);
// Backward-compatibility alias so accounting core APIs work with clients
// that call /api/accounting/* instead of /api/accounting/core/*.
router.use('/', accountingCoreRoutes);

type PaymentMode = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer' | 'adjustment';
type DayBookPaymentMode = 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | 'online';
type BookType = 'cash' | 'bank';

interface BookEvent {
  time: Date;
  source: string;
  type: 'inflow' | 'outflow';
  amount: number;
  narration: string;
  reference: string;
  paymentMethod: string;
}

const toDateRange = (startDate?: string, endDate?: string) => {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const round2 = (value: number) => Number(Number(value || 0).toFixed(2));
const postedSaleMatch = {
  saleStatus: { $in: ['completed', 'returned'] },
  $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
};
const approvedReturnMatch = { returnStatus: 'approved' };

const aggregateSum = async (
  model: any,
  field: string,
  dateField: string,
  start: Date,
  end: Date,
  extraMatch: Record<string, any> = {}
) => {
  const result = await model.aggregate([
    { $match: { ...extraMatch, [dateField]: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: `$${field}` } } },
  ]);
  return result[0]?.total || 0;
};

const normalizePaymentMode = (input?: string): PaymentMode => {
  const value = String(input || 'cash').toLowerCase();
  if (value === 'cash') return 'cash';
  if (value === 'bank') return 'bank';
  if (value === 'card') return 'card';
  if (value === 'upi') return 'upi';
  if (value === 'cheque') return 'cheque';
  if (value === 'online') return 'online';
  if (value === 'bank_transfer') return 'bank_transfer';
  return 'cash';
};

const toDayBookPaymentMode = (mode: PaymentMode): DayBookPaymentMode => {
  if (mode === 'cash') return 'cash';
  if (mode === 'card') return 'card';
  if (mode === 'upi') return 'upi';
  if (mode === 'cheque') return 'cheque';
  if (mode === 'online') return 'online';
  return 'bank';
};

const toBookType = (mode?: string): BookType => (normalizePaymentMode(mode) === 'cash' ? 'cash' : 'bank');
const toDateKey = (value: Date): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const isYearMonth = (value: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '').trim());

const isPayDateWithinMonth = (payDateKey: string, month: string): boolean =>
  String(payDateKey || '').startsWith(`${String(month || '').trim()}-`);

const isPrivileged = (req: AuthenticatedRequest) => {
  const role = String(req.userRole || '').toLowerCase();
  return role === 'admin' || role === 'super_admin' || role === 'manager' || role === 'accountant';
};

const isSuperAdmin = (req: AuthenticatedRequest) => String(req.userRole || '').toLowerCase() === 'super_admin';

const canModifyCreatedRecord = (req: AuthenticatedRequest, createdBy?: string) =>
  isPrivileged(req) || String(createdBy || '') === String(req.userId || '');

const buildSalaryDuplicateFilter = (args: {
  employeeId?: string;
  employeeName?: string;
  month: string;
  payDateKey: string;
  excludeId?: string;
}) => {
  const month = String(args.month || '').trim();
  const payDateKey = String(args.payDateKey || '').trim();
  if (!month || !payDateKey) return null;

  const normalizedName = String(args.employeeName || '').trim();
  const filter: any = { month, payDateKey };
  if (args.excludeId) {
    filter._id = { $ne: args.excludeId };
  }

  if (args.employeeId) {
    const orFilters: any[] = [{ employeeId: args.employeeId }];
    if (normalizedName) {
      const nameRegex = { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' };
      orFilters.push({
        $and: [
          { $or: [{ employeeId: { $exists: false } }, { employeeId: null }] },
          { employeeName: nameRegex },
        ],
      });
    }
    filter.$or = orFilters;
    return filter;
  }

  if (!normalizedName) return null;
  filter.employeeName = { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' };
  return filter;
};

const sendSalaryPayslip = async (args: {
  employeeEmail?: string;
  employeeName: string;
  designation?: string;
  month: string;
  payDate: Date;
  baseAmount: number;
  bonusAmount: number;
  grossSalary?: number;
  statutoryDeductions?: number;
  voluntaryDeductions?: number;
  employerPayrollTaxes?: number;
  benefitsExpense?: number;
  netPay?: number;
  totalAmount: number;
  paymentMethod: string;
  notes?: string;
}): Promise<{ sent: boolean; message: string; recipient?: string }> => {
  const recipient = String(args.employeeEmail || '').trim().toLowerCase();
  if (!recipient) {
    return { sent: false, message: 'Employee email is not available' };
  }

  const formatAmount = (value: number) => `₹${round2(Number(value || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dateLabel = new Date(args.payDate).toLocaleDateString('en-IN');
  const appName = 'SPARK AI';

  try {
    await sendConfiguredMail({
      recipients: [recipient],
      subject: `${appName} Salary Payslip - ${args.month} - ${args.employeeName}`,
      text: [
        `Salary Payslip`,
        `Employee: ${args.employeeName}`,
        `Designation: ${args.designation || '-'}`,
        `Month: ${args.month}`,
        `Pay Date: ${dateLabel}`,
        `Base Salary: ${formatAmount(args.baseAmount)}`,
        `Bonus: ${formatAmount(args.bonusAmount)}`,
        `Gross Salary: ${formatAmount(args.grossSalary ?? args.baseAmount + args.bonusAmount)}`,
        `Statutory Deductions: ${formatAmount(args.statutoryDeductions || 0)}`,
        `Voluntary Deductions: ${formatAmount(args.voluntaryDeductions || 0)}`,
        `Net Pay: ${formatAmount(args.netPay ?? args.totalAmount)}`,
        `Employer Payroll Taxes: ${formatAmount(args.employerPayrollTaxes || 0)}`,
        `Benefits Expense: ${formatAmount(args.benefitsExpense || 0)}`,
        `Payment Method: ${String(args.paymentMethod || '').toUpperCase()}`,
        args.notes ? `Notes: ${args.notes}` : '',
      ].filter(Boolean).join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <h2 style="margin:0 0 8px 0">Salary Payslip</h2>
          <p style="margin:0 0 12px 0">This is your salary payment confirmation.</p>
          <table style="border-collapse:collapse">
            <tr><td style="padding:4px 12px 4px 0"><strong>Employee</strong></td><td style="padding:4px 0">${args.employeeName}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Designation</strong></td><td style="padding:4px 0">${args.designation || '-'}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Month</strong></td><td style="padding:4px 0">${args.month}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Pay Date</strong></td><td style="padding:4px 0">${dateLabel}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Base Salary</strong></td><td style="padding:4px 0">${formatAmount(args.baseAmount)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Bonus</strong></td><td style="padding:4px 0">${formatAmount(args.bonusAmount)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Gross Salary</strong></td><td style="padding:4px 0">${formatAmount(args.grossSalary ?? args.baseAmount + args.bonusAmount)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Statutory Deductions</strong></td><td style="padding:4px 0">${formatAmount(args.statutoryDeductions || 0)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Voluntary Deductions</strong></td><td style="padding:4px 0">${formatAmount(args.voluntaryDeductions || 0)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Net Pay</strong></td><td style="padding:4px 0">${formatAmount(args.netPay ?? args.totalAmount)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Employer Payroll Taxes</strong></td><td style="padding:4px 0">${formatAmount(args.employerPayrollTaxes || 0)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Benefits Expense</strong></td><td style="padding:4px 0">${formatAmount(args.benefitsExpense || 0)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0"><strong>Payment Method</strong></td><td style="padding:4px 0">${String(args.paymentMethod || '').toUpperCase()}</td></tr>
            ${args.notes ? `<tr><td style="padding:4px 12px 4px 0"><strong>Notes</strong></td><td style="padding:4px 0">${args.notes}</td></tr>` : ''}
          </table>
        </div>
      `,
    });
    return { sent: true, message: `Payslip sent to ${recipient}`, recipient };
  } catch (error: any) {
    return { sent: false, message: String(error?.message || 'Failed to send payslip'), recipient };
  }
};

const toClientErrorMessage = (error: unknown, fallback: string): string => {
  const raw = String((error as any)?.message || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (lower.includes('plan executor error during findandmodify')) {
    return 'A database save conflict occurred. Please refresh and retry.';
  }

  if ((lower.includes('e11000') || lower.includes('duplicate key')) && lower.includes('chartaccounts')) {
    if (lower.includes('fixed_assets') || lower.includes('systemkey')) {
      return 'System account setup conflict detected for "Fixed Assets". Please refresh and try again.';
    }
    return 'Duplicate chart account configuration detected. Please refresh and retry.';
  }

  if (lower.includes('e11000') || lower.includes('duplicate key')) {
    return 'Duplicate record detected. Please verify existing data and try again.';
  }

  if (lower.includes('validation failed')) {
    return 'One or more fields are invalid. Please review the form and try again.';
  }

  if (lower.includes('cast to objectid failed')) {
    return 'The selected record is invalid or no longer available.';
  }

  if (lower.includes('mongo') || lower.includes('mongodb')) {
    return 'Database operation failed. Please try again or contact support if this persists.';
  }

  return raw;
};

const CORE_ACCOUNTS: Array<{ accountCode: string; accountName: string; accountType: AccountType; subType: AccountSubType }> = [
  { accountCode: '1000', accountName: 'Cash Account', accountType: 'asset', subType: 'cash' },
  { accountCode: '1010', accountName: 'Bank Account', accountType: 'asset', subType: 'bank' },
  { accountCode: '1200', accountName: 'Opening Stock', accountType: 'asset', subType: 'stock' },
  { accountCode: '1100', accountName: 'Customer Control', accountType: 'asset', subType: 'customer' },
  { accountCode: '2000', accountName: 'Supplier Control', accountType: 'liability', subType: 'supplier' },
  { accountCode: '3000', accountName: 'Sales Income', accountType: 'income', subType: 'general' },
  { accountCode: '3100', accountName: 'Other Income', accountType: 'income', subType: 'general' },
  { accountCode: '4000', accountName: 'Expense', accountType: 'expense', subType: 'general' },
  { accountCode: '4010', accountName: 'Salary Expense', accountType: 'expense', subType: 'general' },
  { accountCode: '4020', accountName: 'Contract Expense', accountType: 'expense', subType: 'general' },
];

const DEFAULT_ACCOUNT_GROUPS: Array<{
  groupName: string;
  groupCode: string;
  under: AccountGroupUnder;
  parentGroupName?: string;
}> = [
  { groupName: 'Current Assets', groupCode: '101', under: 'asset' },
  { groupName: 'Cash-in-hand', groupCode: '201', under: 'asset', parentGroupName: 'Current Assets' },
  { groupName: 'Bank Accounts', groupCode: '211', under: 'asset', parentGroupName: 'Current Assets' },
  { groupName: 'Fixed Assets', groupCode: '235', under: 'asset' },
  { groupName: 'Stock in Hand', groupCode: '251', under: 'asset', parentGroupName: 'Current Assets' },
  { groupName: 'Sundry Debtors', groupCode: '311', under: 'asset', parentGroupName: 'Current Assets' },
  { groupName: 'Loans (Liability)', groupCode: '141', under: 'liability' },
  { groupName: 'Current Liabilities', groupCode: '421', under: 'liability' },
  { groupName: 'Sundry Creditors', groupCode: '441', under: 'liability', parentGroupName: 'Current Liabilities' },
  { groupName: 'Duties & Taxes', groupCode: '481', under: 'liability', parentGroupName: 'Current Liabilities' },
  { groupName: 'Capital Account', groupCode: '121', under: 'liability' },
  { groupName: 'Suspense A/c', groupCode: '154', under: 'asset' },
  { groupName: 'Direct Incomes', groupCode: '317', under: 'income' },
  { groupName: 'Indirect Incomes', groupCode: '370', under: 'income' },
  { groupName: 'Sales Accounts', groupCode: '3110', under: 'income', parentGroupName: 'Direct Incomes' },
  { groupName: 'Direct Expenses', groupCode: '411', under: 'expense' },
  { groupName: 'Indirect Expenses', groupCode: '432', under: 'expense' },
  { groupName: 'Office Expenses', groupCode: '413', under: 'expense', parentGroupName: 'Indirect Expenses' },
  { groupName: 'Repair & Maintenance', groupCode: '499', under: 'expense', parentGroupName: 'Indirect Expenses' },
  { groupName: 'Profit & Loss Account', groupCode: '501', under: 'liability' },
];

const normalizeGroupUnder = (value: unknown): AccountGroupUnder => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['asset', 'assets'].includes(normalized)) return 'asset';
  if (['liability', 'liabilities'].includes(normalized)) return 'liability';
  if (['income', 'incomes'].includes(normalized)) return 'income';
  if (['expense', 'expenses'].includes(normalized)) return 'expense';
  return 'asset';
};

const accountTypeToUnderLabel = (value?: string) => {
  switch (String(value || '').toLowerCase()) {
    case 'asset':
      return 'Assets';
    case 'liability':
      return 'Liabilities';
    case 'income':
      return 'Income';
    case 'expense':
      return 'Expenses';
    default:
      return 'Assets';
  }
};

const getFallbackGroupName = (account: { groupName?: string; subType?: string; accountType?: string }) => {
  if (account.groupName) return account.groupName;
  if (account.subType === 'cash') return 'Cash-in-hand';
  if (account.subType === 'bank') return 'Bank Accounts';
  if (account.subType === 'customer') return 'Sundry Debtors';
  if (account.subType === 'supplier') return 'Sundry Creditors';
  if (account.subType === 'stock') return 'Stock in Hand';
  return accountTypeToUnderLabel(account.accountType);
};

const ensureDefaultAccountGroups = async () => {
  for (const row of DEFAULT_ACCOUNT_GROUPS.filter((group) => !group.parentGroupName)) {
    await AccountGroup.findOneAndUpdate(
      { groupCode: row.groupCode },
      {
        $setOnInsert: {
          groupName: row.groupName,
          groupCode: row.groupCode,
          under: row.under,
          parentGroupName: 'SELF',
          isSystem: true,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }

  for (const row of DEFAULT_ACCOUNT_GROUPS.filter((group) => group.parentGroupName)) {
    const parent = await AccountGroup.findOne({ groupName: row.parentGroupName });
    await AccountGroup.findOneAndUpdate(
      { groupCode: row.groupCode },
      {
        $setOnInsert: {
          groupName: row.groupName,
          groupCode: row.groupCode,
          under: row.under,
          parentGroupId: parent?._id,
          parentGroupName: parent?.groupName || row.parentGroupName || 'SELF',
          isSystem: true,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }
};

const ensureDefaultChartAccounts = async () => {
  await ensureDefaultAccountGroups();
  const groups = await AccountGroup.find({}).select('_id groupName').lean();
  const groupByName = new Map(groups.map((group: any) => [String(group.groupName), group]));
  const defaultGroupFor = (row: { accountType: AccountType; subType: AccountSubType }) => {
    const groupName = getFallbackGroupName(row);
    return groupByName.get(groupName) || null;
  };

  for (const row of CORE_ACCOUNTS) {
    const group = defaultGroupFor(row);
    await ChartAccount.findOneAndUpdate(
      { accountCode: row.accountCode },
      {
        $setOnInsert: {
          ...row,
          groupId: group?._id,
          groupName: group?.groupName || getFallbackGroupName(row),
          openingBalance: 0,
          openingSide: 'debit',
          isSystem: true,
          isActive: true,
        },
      },
      { upsert: true, new: true }
    );
  }
};

const getCoreAccount = async (subType: 'cash' | 'bank' | 'stock') => {
  await ensureDefaultChartAccounts();
  const account = await ChartAccount.findOne({ subType, isActive: true }).sort({ isSystem: -1, accountCode: 1 });
  if (!account) {
    throw new Error(`${subType} account is not configured`);
  }
  return account;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getOrCreateAccount = async (params: {
  accountName: string;
  accountType: AccountType;
  subType?: AccountSubType;
  createdBy?: string;
  isSystem?: boolean;
}) => {
  const accountName = String(params.accountName || '').trim();
  if (!accountName) throw new Error('accountName is required');

  const existing = await ChartAccount.findOne({
    accountType: params.accountType,
    accountName: { $regex: `^${escapeRegex(accountName)}$`, $options: 'i' },
  });
  if (existing) return existing;

  const accountCode = await generateNumber('chart_account', { prefix: 'AC-', padTo: 5 });
  return ChartAccount.create({
    accountCode,
    accountName,
    accountType: params.accountType,
    subType: params.subType || 'general',
    openingBalance: 0,
    openingSide: 'debit',
    isSystem: Boolean(params.isSystem),
    isActive: true,
    createdBy: params.createdBy,
  });
};

const getOpeningSetup = async () =>
  OpeningBalanceSetup.findOneAndUpdate(
    { setupKey: 'primary' },
    { $setOnInsert: { setupKey: 'primary', isLocked: false } },
    { new: true, upsert: true }
  );

const getAccountClosing = async (accountId: any, endDate?: Date) => {
  const filter: Record<string, any> = { accountId };
  if (endDate) filter.entryDate = { $lte: endDate };
  const last = await AccountLedgerEntry.findOne(filter).sort({ entryDate: -1, createdAt: -1, _id: -1 });
  return Number(last?.runningBalance || 0);
};

const postLedger = async (params: {
  accountId: any;
  entryDate: Date;
  voucherType: LedgerVoucherType;
  voucherNumber?: string;
  referenceNo?: string;
  narration?: string;
  debit?: number;
  credit?: number;
  paymentMode?: PaymentMode;
  createdBy?: string;
  metadata?: Record<string, any>;
}) => {
  const debit = round2(Number(params.debit || 0));
  const credit = round2(Number(params.credit || 0));
  if (debit <= 0 && credit <= 0) throw new Error('Either debit or credit must be greater than 0');

  const runningBalance = round2((await getAccountClosing(params.accountId, params.entryDate)) + debit - credit);
  return AccountLedgerEntry.create({
    accountId: params.accountId,
    entryDate: params.entryDate,
    voucherType: params.voucherType,
    voucherNumber: params.voucherNumber,
    referenceNo: params.referenceNo,
    narration: params.narration,
    debit,
    credit,
    paymentMode: params.paymentMode,
    runningBalance,
    createdBy: params.createdBy,
    metadata: params.metadata,
  });
};

const createVoucherAndLedger = async (params: {
  voucherType: VoucherType;
  voucherDate: Date;
  paymentMode?: PaymentMode;
  referenceNo?: string;
  counterpartyName?: string;
  notes?: string;
  documentFields?: IAccountingVoucherDocumentFields;
  lines: Array<{ accountId: string; debit: number; credit: number; narration?: string }>;
  ledgerMetadata?: Record<string, any>;
  createdBy?: string;
}) => {
  const lines = params.lines
    .map((line) => ({
      accountId: String(line.accountId || '').trim(),
      debit: round2(Number(line.debit || 0)),
      credit: round2(Number(line.credit || 0)),
      narration: line.narration,
    }))
    .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));

  if (lines.length < 2) throw new Error('Voucher requires at least two valid lines');
  const totalDebit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw new Error('Voucher debit and credit totals must match');
  }

  const key =
    params.voucherType === 'receipt'
      ? 'receipt_voucher_manual'
      : params.voucherType === 'payment'
        ? 'payment_voucher'
        : params.voucherType === 'journal'
          ? 'journal_voucher'
          : 'transfer_voucher';
  const prefix =
    params.voucherType === 'receipt'
      ? 'RV-'
      : params.voucherType === 'payment'
        ? 'PV-'
        : params.voucherType === 'journal'
          ? 'JV-'
          : 'TV-';
  const voucherNumber = await generateNumber(key, { prefix, datePart: true, padTo: 5 });

  const accountMap = new Map<string, any>();
  for (const line of lines) {
    const account = await ChartAccount.findById(line.accountId);
    if (!account) throw new Error(`Account not found: ${line.accountId}`);
    accountMap.set(line.accountId, account);
  }

  const voucher = await AccountingVoucher.create({
    voucherNumber,
    voucherType: params.voucherType,
    voucherDate: params.voucherDate,
    paymentMode: params.voucherType === 'journal' ? undefined : params.paymentMode,
    referenceNo: params.referenceNo,
    counterpartyName: params.counterpartyName,
    notes: params.notes,
    documentFields: params.documentFields,
    totalAmount: totalDebit,
    lines: lines.map((line) => {
      const account = accountMap.get(line.accountId);
      return {
        accountId: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: line.debit,
        credit: line.credit,
        narration: line.narration,
      };
    }),
    createdBy: params.createdBy,
  });

  for (const line of lines) {
    await postLedger({
      accountId: line.accountId,
      entryDate: params.voucherDate,
      voucherType: params.voucherType,
      voucherNumber: voucher.voucherNumber,
      referenceNo: params.referenceNo,
      narration: line.narration || params.notes,
      debit: line.debit,
      credit: line.credit,
      paymentMode: params.paymentMode,
      createdBy: params.createdBy,
      metadata: { source: 'voucher', sourceId: voucher._id.toString(), ...(params.ledgerMetadata || {}) },
    });
  }

  return voucher;
};

const createTreasuryAwareReceiptVoucher = async (body: any, createdBy?: string) => {
  const payload = await buildVoucherLedgerPayload('receipt', body, createdBy);
  const route = await resolveTreasuryRoute({
    paymentMethod: payload.paymentMode,
    treasuryAccountId: body?.treasuryAccountId ? String(body.treasuryAccountId) : undefined,
    channelLabel: body?.paymentChannelLabel,
  });

  const voucher = await createVoucherAndLedger({
    voucherType: payload.voucherType,
    voucherDate: payload.voucherDate,
    paymentMode: payload.paymentMode,
    referenceNo: payload.referenceNo,
    counterpartyName: payload.counterpartyName,
    notes: payload.notes,
    documentFields: payload.documentFields,
    lines: payload.lines,
    ledgerMetadata: {
      treasuryAccountId: route.treasuryAccount._id.toString(),
      treasuryAccountName: route.treasuryAccount.displayName,
      paymentChannelLabel: body?.paymentChannelLabel || route.channelLabel,
      processorName: route.processorName,
    },
    createdBy,
  });

  await DayBookEntry.create({
    entryType: 'income',
    category: payload.categoryLabel || 'Service Income',
    amount: round2(voucher.totalAmount),
    paymentMethod: toDayBookPaymentMode(payload.paymentMode || 'cash'),
    treasuryAccountId: route.treasuryAccount._id,
    treasuryAccountName: route.treasuryAccount.displayName,
    narration: payload.notes,
    referenceNo: voucher.voucherNumber,
    entryDate: payload.voucherDate,
    createdBy,
  });

  return { voucher, payload, route };
};

const createTreasuryAwarePaymentVoucher = async (body: any, createdBy?: string) => {
  const payload = await buildVoucherLedgerPayload('payment', body, createdBy);
  const route = await resolveTreasuryRoute({
    paymentMethod: payload.paymentMode,
    treasuryAccountId: body?.treasuryAccountId ? String(body.treasuryAccountId) : undefined,
    channelLabel: body?.paymentChannelLabel,
  });

  const voucher = await createVoucherAndLedger({
    voucherType: payload.voucherType,
    voucherDate: payload.voucherDate,
    paymentMode: payload.paymentMode,
    referenceNo: payload.referenceNo,
    counterpartyName: payload.counterpartyName,
    notes: payload.notes,
    documentFields: payload.documentFields,
    lines: payload.lines,
    ledgerMetadata: {
      treasuryAccountId: route.treasuryAccount._id.toString(),
      treasuryAccountName: route.treasuryAccount.displayName,
      paymentChannelLabel: body?.paymentChannelLabel || route.channelLabel,
      processorName: route.processorName,
    },
    createdBy,
  });

  await DayBookEntry.create({
    entryType: 'expense',
    category: payload.categoryLabel || 'General Expense',
    amount: round2(voucher.totalAmount),
    paymentMethod: toDayBookPaymentMode(payload.paymentMode || 'cash'),
    treasuryAccountId: route.treasuryAccount._id,
    treasuryAccountName: route.treasuryAccount.displayName,
    narration: payload.notes,
    referenceNo: voucher.voucherNumber,
    entryDate: payload.voucherDate,
    createdBy,
  });

  return { voucher, payload, route };
};

const createTreasuryAwareTransferVoucher = async (body: any, createdBy?: string) => {
  const payload = await buildVoucherLedgerPayload('transfer', body, createdBy);
  const direction = String(body?.direction || 'cash_to_bank').toLowerCase() === 'bank_to_cash' ? 'bank_to_cash' : 'cash_to_bank';
  const voucher = await createVoucherAndLedger({
    voucherType: payload.voucherType,
    voucherDate: payload.voucherDate,
    paymentMode: payload.paymentMode,
    referenceNo: payload.referenceNo,
    counterpartyName: payload.counterpartyName,
    notes: payload.notes,
    documentFields: payload.documentFields,
    lines: payload.lines,
    ledgerMetadata: {
      transferDirection: direction,
      fromTreasuryAccountId: body?.fromTreasuryAccountId ? String(body.fromTreasuryAccountId) : undefined,
      toTreasuryAccountId: body?.toTreasuryAccountId ? String(body.toTreasuryAccountId) : undefined,
    },
    createdBy,
  });

  return { voucher, payload };
};

interface VoucherLedgerPayload {
  voucherType: VoucherType;
  voucherDate: Date;
  paymentMode?: PaymentMode;
  referenceNo?: string;
  counterpartyName?: string;
  notes?: string;
  documentFields?: IAccountingVoucherDocumentFields;
  lines: Array<{ accountId: string; debit: number; credit: number; narration?: string }>;
  categoryLabel?: string;
}

const toOptionalText = (value: unknown): string | undefined => {
  const text = String(value || '').trim();
  return text || undefined;
};

const toVoucherDate = (value: unknown, fallback?: Date): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value || '').trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (fallback && !Number.isNaN(new Date(fallback).getTime())) return new Date(fallback);
  return new Date();
};

const extractLineAccountId = (line: any): string =>
  String(line?.accountId?._id || line?.accountId || '').trim();

const normalizeVoucherLines = (lines: Array<{ accountId: string; debit: number; credit: number; narration?: string }>) => {
  const normalized = (lines || [])
    .map((line) => ({
      accountId: String(line.accountId || '').trim(),
      debit: round2(Number(line.debit || 0)),
      credit: round2(Number(line.credit || 0)),
      narration: toOptionalText(line.narration),
    }))
    .filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));

  if (normalized.length < 2) {
    throw new Error('Voucher requires at least two valid lines');
  }

  const totalDebit = round2(normalized.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(normalized.reduce((sum, line) => sum + line.credit, 0));
  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw new Error('Voucher debit and credit totals must match');
  }

  return normalized;
};

const buildVoucherLedgerPayload = async (
  voucherType: VoucherType,
  body: any,
  createdBy?: string,
  existing?: any
): Promise<VoucherLedgerPayload> => {
  const voucherDate = toVoucherDate(body?.voucherDate ?? body?.transferDate, existing?.voucherDate);
  const referenceNo = toOptionalText(body?.referenceNo ?? existing?.referenceNo);
  const notes = toOptionalText(body?.notes ?? existing?.notes);
  const counterpartyName = toOptionalText(body?.counterpartyName ?? existing?.counterpartyName);

  if (voucherType === 'receipt') {
    const existingIncomeLine = Array.isArray(existing?.lines)
      ? existing.lines.find((line: any) => Number(line.credit || 0) > 0)
      : null;
    const amountNum = round2(Number(body?.amount ?? existing?.totalAmount ?? 0));
    if (amountNum <= 0) throw new Error('amount must be greater than 0');

    const categoryLabel = String(body?.category || existingIncomeLine?.narration || 'Service Income').trim() || 'Service Income';
    const mode = normalizePaymentMode(body?.paymentMode || existing?.paymentMode || 'cash');
    const treasuryRoute = await resolveTreasuryRoute({
      paymentMethod: mode,
      treasuryAccountId: body?.treasuryAccountId ? String(body.treasuryAccountId) : undefined,
      channelLabel: body?.paymentChannelLabel || existing?.paymentChannelLabel,
    });
    const cashBankAccount = await ChartAccount.findById(treasuryRoute.chartAccountId);
    if (!cashBankAccount) throw new Error('Treasury chart account is missing for this receipt');
    const incomeAccount = await getOrCreateAccount({
      accountName: `Income - ${categoryLabel}`,
      accountType: 'income',
      createdBy,
    });

    return {
      voucherType,
      voucherDate,
      paymentMode: mode,
      referenceNo,
      counterpartyName,
      notes,
      categoryLabel,
      lines: normalizeVoucherLines([
        { accountId: cashBankAccount._id.toString(), debit: amountNum, credit: 0, narration: 'Receipt inflow' },
        { accountId: incomeAccount._id.toString(), debit: 0, credit: amountNum, narration: categoryLabel },
      ]),
    };
  }

  if (voucherType === 'payment') {
    const existingExpenseLine = Array.isArray(existing?.lines)
      ? existing.lines.find((line: any) => Number(line.debit || 0) > 0)
      : null;
    const amountNum = round2(Number(body?.amount ?? existing?.totalAmount ?? 0));
    if (amountNum <= 0) throw new Error('amount must be greater than 0');

    const mode = normalizePaymentMode(body?.paymentMode || existing?.paymentMode || 'cash');
    const treasuryRoute = await resolveTreasuryRoute({
      paymentMethod: mode,
      treasuryAccountId: body?.treasuryAccountId ? String(body.treasuryAccountId) : undefined,
      channelLabel: body?.paymentChannelLabel || existing?.paymentChannelLabel,
    });
    const cashBankAccount = await ChartAccount.findById(treasuryRoute.chartAccountId);
    if (!cashBankAccount) throw new Error('Treasury chart account is missing for this payment');
    const categoryLabel = String(body?.category || existingExpenseLine?.narration || 'General Expense').trim() || 'General Expense';
    const expenseAccount = await getOrCreateAccount({
      accountName: `Expense - ${categoryLabel}`,
      accountType: 'expense',
      createdBy,
    });

    const documentFieldsInput = body?.documentFields && typeof body.documentFields === 'object'
      ? body.documentFields
      : (existing?.documentFields || {});
    const documentFields: IAccountingVoucherDocumentFields = {
      accountName: toOptionalText(documentFieldsInput.accountName || counterpartyName),
      beingPaymentOf: toOptionalText(documentFieldsInput.beingPaymentOf || notes),
      forPeriod: toOptionalText(documentFieldsInput.forPeriod),
      receivedBy: toOptionalText(documentFieldsInput.receivedBy),
      authorizedBy: toOptionalText(documentFieldsInput.authorizedBy),
      receivedSign: toOptionalText(documentFieldsInput.receivedSign),
      authorizedSign: toOptionalText(documentFieldsInput.authorizedSign),
    };
    const hasDocumentFields = Object.values(documentFields).some((value) => Boolean(String(value || '').trim()));

    return {
      voucherType,
      voucherDate,
      paymentMode: mode,
      referenceNo,
      counterpartyName: toOptionalText(counterpartyName || documentFields.accountName),
      notes: toOptionalText(notes || documentFields.beingPaymentOf),
      documentFields: hasDocumentFields ? documentFields : undefined,
      categoryLabel,
      lines: normalizeVoucherLines([
        { accountId: expenseAccount._id.toString(), debit: amountNum, credit: 0, narration: categoryLabel },
        { accountId: cashBankAccount._id.toString(), debit: 0, credit: amountNum, narration: 'Payment outflow' },
      ]),
    };
  }

  if (voucherType === 'journal') {
    const fallbackLines = Array.isArray(existing?.lines)
      ? existing.lines.map((line: any) => ({
          accountId: extractLineAccountId(line),
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          narration: line.narration,
        }))
      : [];
    const incomingLines = Array.isArray(body?.lines)
      ? body.lines.map((line: any) => ({
          accountId: extractLineAccountId(line),
          debit: Number(line?.debit || 0),
          credit: Number(line?.credit || 0),
          narration: line?.narration,
        }))
      : [];
    const lines = normalizeVoucherLines(incomingLines.length > 0 ? incomingLines : fallbackLines);

    return {
      voucherType,
      voucherDate,
      paymentMode: 'adjustment',
      referenceNo,
      notes,
      lines,
    };
  }

  const existingDirectionSource = String(existing?.notes || existing?.lines?.[0]?.narration || '').toLowerCase();
  const existingDirection = existingDirectionSource.includes('bank_to_cash') ? 'bank_to_cash' : 'cash_to_bank';
  const direction = String(body?.direction || existingDirection).toLowerCase() === 'bank_to_cash' ? 'bank_to_cash' : 'cash_to_bank';
  const amountNum = round2(Number(body?.amount ?? existing?.totalAmount ?? 0));
  if (amountNum <= 0) throw new Error('amount must be greater than 0');

  const cashRoute = await resolveTreasuryRoute({
    paymentMethod: 'cash',
    treasuryAccountId: body?.fromTreasuryAccountId && direction === 'cash_to_bank'
      ? String(body.fromTreasuryAccountId)
      : body?.toTreasuryAccountId && direction === 'bank_to_cash'
        ? String(body.toTreasuryAccountId)
        : undefined,
  });
  const bankRoute = await resolveTreasuryRoute({
    paymentMethod: 'bank',
    treasuryAccountId: body?.fromTreasuryAccountId && direction === 'bank_to_cash'
      ? String(body.fromTreasuryAccountId)
      : body?.toTreasuryAccountId && direction === 'cash_to_bank'
        ? String(body.toTreasuryAccountId)
        : undefined,
  });
  const cash = await ChartAccount.findById(cashRoute.chartAccountId);
  const bank = await ChartAccount.findById(bankRoute.chartAccountId);
  if (!cash || !bank) throw new Error('Treasury transfer accounts are not configured');
  const debitAccount = direction === 'bank_to_cash' ? cash : bank;
  const creditAccount = direction === 'bank_to_cash' ? bank : cash;

  return {
    voucherType,
    voucherDate,
    paymentMode: 'bank_transfer',
    referenceNo,
    notes,
    lines: normalizeVoucherLines([
      { accountId: debitAccount._id.toString(), debit: amountNum, credit: 0, narration: `Transfer ${direction}` },
      { accountId: creditAccount._id.toString(), debit: 0, credit: amountNum, narration: `Transfer ${direction}` },
    ]),
  };
};

const recalculateRunningBalancesForAccounts = async (accountIds: string[]) => {
  const uniqueIds = Array.from(new Set((accountIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  for (const accountId of uniqueIds) {
    const rows = await AccountLedgerEntry.find({ accountId }).sort({ entryDate: 1, createdAt: 1, _id: 1 });
    let runningBalance = 0;
    for (const row of rows) {
      runningBalance = round2(runningBalance + Number(row.debit || 0) - Number(row.credit || 0));
      if (round2(Number(row.runningBalance || 0)) !== runningBalance) {
        row.runningBalance = runningBalance;
        await row.save();
      }
    }
  }
};

const markLedgerRowsDeleted = async (
  filter: Record<string, any>,
  actorId: string | undefined,
  reason: string
) => {
  await AccountLedgerEntry.updateMany(filter, {
    $set: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actorId,
      deletionReason: reason,
      isReconciled: false,
    },
  });
};

const positiveMoney = (value: any): number => round2(Math.max(0, Number(value || 0)));

const salaryPayrollCostExpression = {
  $ifNull: [
    '$totalPayrollCost',
    {
      $add: [
        { $ifNull: ['$grossSalary', '$amount'] },
        { $ifNull: ['$employerPayrollTaxes', 0] },
        { $ifNull: ['$benefitsExpense', 0] },
      ],
    },
  ],
};

const aggregateSalaryCost = async (start: Date, end: Date) => {
  const result = await SalaryPayment.aggregate([
    { $match: { payDate: { $gte: start, $lte: end } } },
    { $project: { payrollCost: salaryPayrollCostExpression } },
    { $group: { _id: null, total: { $sum: '$payrollCost' } } },
  ]);
  return Number(result[0]?.total || 0);
};

const salaryPayrollCostOfDoc = (row: any) =>
  round2(Number(row?.totalPayrollCost ?? (Number(row?.grossSalary ?? row?.amount ?? 0) + Number(row?.employerPayrollTaxes || 0) + Number(row?.benefitsExpense || 0))));

const resolveSalaryComponents = (body: any, existing?: any) => {
  const baseAmount = body?.amount !== undefined
    ? positiveMoney(body.amount)
    : positiveMoney(existing?.baseAmount ?? existing?.amount);
  const bonusAmount = body?.bonusAmount !== undefined
    ? positiveMoney(body.bonusAmount)
    : positiveMoney(existing?.bonusAmount);
  const fallbackGross = round2(baseAmount + bonusAmount);
  const grossSalary = body?.grossSalary !== undefined
    ? positiveMoney(body.grossSalary)
    : positiveMoney(existing?.grossSalary ?? fallbackGross);

  const employeePf = body?.employeePf !== undefined ? positiveMoney(body.employeePf) : positiveMoney(existing?.employeePf);
  const employeeEsi = body?.employeeEsi !== undefined ? positiveMoney(body.employeeEsi) : positiveMoney(existing?.employeeEsi);
  const professionalTax = body?.professionalTax !== undefined ? positiveMoney(body.professionalTax) : positiveMoney(existing?.professionalTax);
  const tdsAmount = body?.tdsAmount !== undefined ? positiveMoney(body.tdsAmount) : positiveMoney(existing?.tdsAmount);
  const knownStatutory = round2(employeePf + employeeEsi + professionalTax + tdsAmount);
  const statutoryDeductions = body?.statutoryDeductions !== undefined
    ? Math.max(knownStatutory, positiveMoney(body.statutoryDeductions))
    : Math.max(knownStatutory, positiveMoney(existing?.statutoryDeductions));
  const otherStatutoryDeductions = round2(Math.max(0, statutoryDeductions - knownStatutory));

  const retirementContribution = body?.retirementContribution !== undefined ? positiveMoney(body.retirementContribution) : positiveMoney(existing?.retirementContribution);
  const insurancePremium = body?.insurancePremium !== undefined ? positiveMoney(body.insurancePremium) : positiveMoney(existing?.insurancePremium);
  const otherDeductions = body?.otherDeductions !== undefined ? positiveMoney(body.otherDeductions) : positiveMoney(existing?.otherDeductions);
  const knownVoluntary = round2(retirementContribution + insurancePremium + otherDeductions);
  const voluntaryDeductions = body?.voluntaryDeductions !== undefined
    ? Math.max(knownVoluntary, positiveMoney(body.voluntaryDeductions))
    : Math.max(knownVoluntary, positiveMoney(existing?.voluntaryDeductions));
  const unclassifiedVoluntaryDeductions = round2(Math.max(0, voluntaryDeductions - knownVoluntary));
  const totalDeductions = round2(statutoryDeductions + voluntaryDeductions);

  const employerPf = body?.employerPf !== undefined ? positiveMoney(body.employerPf) : positiveMoney(existing?.employerPf);
  const employerEsi = body?.employerEsi !== undefined ? positiveMoney(body.employerEsi) : positiveMoney(existing?.employerEsi);
  const knownEmployerTaxes = round2(employerPf + employerEsi);
  const employerPayrollTaxes = body?.employerPayrollTaxes !== undefined
    ? Math.max(knownEmployerTaxes, positiveMoney(body.employerPayrollTaxes))
    : Math.max(knownEmployerTaxes, positiveMoney(existing?.employerPayrollTaxes));
  const otherEmployerPayrollTaxes = round2(Math.max(0, employerPayrollTaxes - knownEmployerTaxes));
  const benefitsExpense = body?.benefitsExpense !== undefined ? positiveMoney(body.benefitsExpense) : positiveMoney(existing?.benefitsExpense);
  const netPay = round2(Math.max(0, grossSalary - totalDeductions));
  const totalPayrollCost = round2(grossSalary + employerPayrollTaxes + benefitsExpense);

  return {
    baseAmount,
    bonusAmount,
    grossSalary,
    employeePf,
    employeeEsi,
    professionalTax,
    tdsAmount,
    statutoryDeductions,
    otherStatutoryDeductions,
    retirementContribution,
    insurancePremium,
    otherDeductions,
    voluntaryDeductions,
    unclassifiedVoluntaryDeductions,
    totalDeductions,
    employerPf,
    employerEsi,
    employerPayrollTaxes,
    otherEmployerPayrollTaxes,
    benefitsExpense,
    netPay,
    totalPayrollCost,
  };
};

const getPayrollPostingAccounts = async (createdBy?: string) => {
  const account = (accountName: string, accountType: AccountType) => getOrCreateAccount({
    accountName,
    accountType,
    subType: 'general',
    isSystem: true,
    createdBy,
  });

  const [
    salaryExpense,
    employerTaxExpense,
    benefitsExpenseAccount,
    payrollTaxPayable,
    socialSecurityPayable,
    retirementPayable,
    insurancePayable,
    otherDeductionPayable,
    employeeBenefitsPayable,
  ] = await Promise.all([
    account('Salary Expense', 'expense'),
    account('Employer Payroll Tax Expense', 'expense'),
    account('Employee Benefits Expense', 'expense'),
    account('Payroll Tax Payable', 'liability'),
    account('PF / ESI Payable', 'liability'),
    account('Retirement Contributions Payable', 'liability'),
    account('Insurance Premiums Payable', 'liability'),
    account('Other Payroll Deductions Payable', 'liability'),
    account('Employee Benefits Payable', 'liability'),
  ]);

  return {
    salaryExpense,
    employerTaxExpense,
    benefitsExpenseAccount,
    payrollTaxPayable,
    socialSecurityPayable,
    retirementPayable,
    insurancePayable,
    otherDeductionPayable,
    employeeBenefitsPayable,
  };
};

const postSalaryComponentLedger = async (params: {
  payment: any;
  components: ReturnType<typeof resolveSalaryComponents>;
  cashBank: any;
  voucherNumber: string;
  paymentMode: PaymentMode;
  treasuryAccountId?: string;
  createdBy?: string;
}) => {
  const accounts = await getPayrollPostingAccounts(params.createdBy);
  const sourceId = params.payment._id.toString();
  const narration = `Salary payment - ${params.payment.employeeName} (${params.payment.month})`;
  const metadata = {
    source: 'salary_payment',
    sourceId,
    treasuryAccountId: params.treasuryAccountId,
    payrollComponents: true,
  };
  const postedAccountIds: string[] = [];
  const line = async (accountId: any, debit: number, credit: number, note: string) => {
    const debitAmount = round2(debit);
    const creditAmount = round2(credit);
    if (debitAmount <= 0 && creditAmount <= 0) return;
    await postLedger({
      accountId,
      entryDate: params.payment.payDate,
      voucherType: 'salary',
      voucherNumber: params.voucherNumber,
      referenceNo: sourceId,
      narration: `${narration} - ${note}`,
      debit: debitAmount,
      credit: creditAmount,
      paymentMode: normalizePaymentMode(params.paymentMode),
      createdBy: params.createdBy,
      metadata,
    });
    postedAccountIds.push(String(accountId));
  };

  const c = params.components;
  const payrollTaxPayable = round2(c.tdsAmount + c.professionalTax + c.otherStatutoryDeductions + c.otherEmployerPayrollTaxes);
  const socialSecurityPayable = round2(c.employeePf + c.employeeEsi + c.employerPf + c.employerEsi);
  const otherDeductionPayable = round2(c.otherDeductions + c.unclassifiedVoluntaryDeductions);

  await line(accounts.salaryExpense._id, c.grossSalary, 0, 'gross salary');
  await line(accounts.employerTaxExpense._id, c.employerPayrollTaxes, 0, 'employer payroll taxes');
  await line(accounts.benefitsExpenseAccount._id, c.benefitsExpense, 0, 'benefits expense');
  await line(accounts.payrollTaxPayable._id, 0, payrollTaxPayable, 'tax withheld payable');
  await line(accounts.socialSecurityPayable._id, 0, socialSecurityPayable, 'PF / ESI payable');
  await line(accounts.retirementPayable._id, 0, c.retirementContribution, 'retirement contribution payable');
  await line(accounts.insurancePayable._id, 0, c.insurancePremium, 'insurance premium payable');
  await line(accounts.otherDeductionPayable._id, 0, otherDeductionPayable, 'other deduction payable');
  await line(accounts.employeeBenefitsPayable._id, 0, c.benefitsExpense, 'employee benefits payable');
  await line(params.cashBank._id, 0, c.netPay, 'net pay transfer');

  return postedAccountIds;
};

const markDayBookRowsDeleted = async (
  filter: Record<string, any>,
  actorId: string | undefined,
  reason: string
) => {
  await DayBookEntry.updateMany(filter, {
    $set: {
      status: 'cancelled',
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: actorId,
      deletionReason: reason,
      cancelledAt: new Date(),
      cancelledBy: actorId,
      cancellationReason: reason,
    },
  });
};

const replaceVoucherLedgerRows = async (
  voucher: any,
  payload: VoucherLedgerPayload,
  actorId?: string
): Promise<string[]> => {
  const sourceId = voucher._id.toString();
  const previousRows = await AccountLedgerEntry.find({
    'metadata.source': 'voucher',
    'metadata.sourceId': sourceId,
  });
  const affectedAccountIds = new Set<string>(previousRows.map((row) => String(row.accountId || '')));

  await markLedgerRowsDeleted({
    'metadata.source': 'voucher',
    'metadata.sourceId': sourceId,
  }, actorId, `Superseded by voucher update ${voucher.voucherNumber}`);

  for (const line of payload.lines) {
    affectedAccountIds.add(String(line.accountId || ''));
    await postLedger({
      accountId: line.accountId,
      entryDate: payload.voucherDate,
      voucherType: payload.voucherType,
      voucherNumber: voucher.voucherNumber,
      referenceNo: payload.referenceNo,
      narration: line.narration || payload.notes,
      debit: line.debit,
      credit: line.credit,
      paymentMode: payload.paymentMode,
      createdBy: actorId,
      metadata: {
        source: 'voucher',
        sourceId,
      },
    });
  }

  const accountIds = Array.from(affectedAccountIds).filter(Boolean);
  await recalculateRunningBalancesForAccounts(accountIds);
  return accountIds;
};

const syncDayBookWithVoucher = async (voucher: any, categoryLabel?: string, actorId?: string) => {
  if (!voucher || (voucher.voucherType !== 'receipt' && voucher.voucherType !== 'payment')) return;
  const entryType = voucher.voucherType === 'receipt' ? 'income' : 'expense';
  const counterpartLine = Array.isArray(voucher.lines)
    ? voucher.lines.find((line: any) =>
      voucher.voucherType === 'receipt'
        ? Number(line.credit || 0) > 0
        : Number(line.debit || 0) > 0
    )
    : null;
  const resolvedCategory = String(
    categoryLabel
    || counterpartLine?.narration
    || (voucher.voucherType === 'receipt' ? 'Service Income' : 'General Expense')
  ).trim();
  const normalizedMode = normalizePaymentMode(voucher.paymentMode || 'cash');
  const existing = await DayBookEntry.findOne({
    status: 'active',
    referenceNo: voucher.voucherNumber,
    entryType,
  }).sort({ createdAt: -1 });

  if (existing) {
    existing.category = resolvedCategory;
    existing.amount = round2(Number(voucher.totalAmount || 0));
    existing.paymentMethod = toDayBookPaymentMode(normalizedMode);
    existing.narration = voucher.notes;
    existing.entryDate = new Date(voucher.voucherDate);
    await existing.save();
    return;
  }

  await DayBookEntry.create({
    entryType,
    category: resolvedCategory,
    amount: round2(Number(voucher.totalAmount || 0)),
    paymentMethod: toDayBookPaymentMode(normalizedMode),
    narration: voucher.notes,
    referenceNo: voucher.voucherNumber,
    entryDate: voucher.voucherDate,
    createdBy: actorId || voucher.createdBy,
  });
};

// Salary payments
router.get('/employees/master', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const employees = await Employee.find({ active: true }).sort({ name: 1, employeeCode: 1 });
    res.json({
      success: true,
      data: employees.map((row) => ({
        _id: row._id,
        employeeCode: row.employeeCode,
        name: row.name,
        designation: row.designation || '',
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load employee master' });
  }
});

router.post('/salary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { employeeId, employeeName, designation, month, payDate, amount, bonusAmount, paymentMethod, notes } = req.body;

    if (!month || amount === undefined) {
      return res.status(400).json({ success: false, error: 'month and gross salary amount are required' });
    }
    if (!isYearMonth(String(month))) {
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });
    }

    const components = resolveSalaryComponents({ ...req.body, amount, bonusAmount });
    if (components.grossSalary <= 0) {
      return res.status(400).json({ success: false, error: 'gross salary must be greater than 0' });
    }

    let finalEmployeeName = String(employeeName || '').trim();
    let finalDesignation = String(designation || '').trim();
    let finalEmployeeId: any = undefined;
    let employeeEmail = '';

    if (employeeId) {
      const employee = await Employee.findById(employeeId);
      if (!employee || !employee.active) {
        return res.status(400).json({ success: false, error: 'Selected employee not found or inactive' });
      }
      finalEmployeeId = employee._id;
      finalEmployeeName = employee.name;
      finalDesignation = employee.designation || '';
      employeeEmail = String(employee.email || '').trim().toLowerCase();
    }

    if (!finalEmployeeName) {
      return res.status(400).json({ success: false, error: 'employeeId is required from employee master' });
    }

    const payDateValue = payDate ? new Date(payDate) : new Date();
    const payDateKey = toDateKey(payDateValue);
    if (!payDateKey) {
      return res.status(400).json({ success: false, error: 'Invalid pay date' });
    }
    if (!isPayDateWithinMonth(payDateKey, String(month))) {
      return res.status(400).json({ success: false, error: 'Pay date must be within selected salary month' });
    }

    const duplicateFilter = buildSalaryDuplicateFilter({
      employeeId: finalEmployeeId ? String(finalEmployeeId) : undefined,
      employeeName: finalEmployeeName,
      month: String(month),
      payDateKey,
    });
    if (duplicateFilter) {
      const existing = await SalaryPayment.findOne(duplicateFilter).select('_id');
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Salary entry already exists for this employee on the same pay date in this month',
        });
      }
    }

    const salaryMode = ['cash', 'bank', 'card', 'upi', 'cheque'].includes(String(paymentMethod || '').toLowerCase())
      ? String(paymentMethod).toLowerCase()
      : 'bank';

    const payment = await SalaryPayment.create({
      employeeId: finalEmployeeId,
      employeeName: finalEmployeeName,
      designation: finalDesignation,
      month,
      payDate: payDateValue,
      payDateKey,
      baseAmount: components.baseAmount,
      bonusAmount: components.bonusAmount,
      grossSalary: components.grossSalary,
      employeePf: components.employeePf,
      employeeEsi: components.employeeEsi,
      professionalTax: components.professionalTax,
      tdsAmount: components.tdsAmount,
      statutoryDeductions: components.statutoryDeductions,
      retirementContribution: components.retirementContribution,
      insurancePremium: components.insurancePremium,
      otherDeductions: components.otherDeductions,
      voluntaryDeductions: components.voluntaryDeductions,
      totalDeductions: components.totalDeductions,
      employerPf: components.employerPf,
      employerEsi: components.employerEsi,
      employerPayrollTaxes: components.employerPayrollTaxes,
      benefitsExpense: components.benefitsExpense,
      netPay: components.netPay,
      totalPayrollCost: components.totalPayrollCost,
      amount: components.netPay,
      paymentMethod: salaryMode,
      notes,
      createdBy: req.userId,
    });

    const salaryTreasuryRoute = await resolveTreasuryRoute({
      paymentMethod: payment.paymentMethod,
      treasuryAccountId: req.body?.treasuryAccountId ? String(req.body.treasuryAccountId) : undefined,
    });
    const cashBank = await ChartAccount.findById(salaryTreasuryRoute.chartAccountId);
    if (!cashBank) {
      return res.status(400).json({ success: false, error: 'Treasury account is not configured for the selected salary payment method' });
    }
    const voucherNumber = await generateNumber('salary_voucher', { prefix: 'SP-', datePart: true, padTo: 5 });

    await postSalaryComponentLedger({
      payment,
      components,
      cashBank,
      voucherNumber,
      paymentMode: normalizePaymentMode(salaryMode),
      treasuryAccountId: salaryTreasuryRoute.treasuryAccount._id.toString(),
      createdBy: req.userId,
    });

    const payslipStatus = await sendSalaryPayslip({
      employeeEmail,
      employeeName: payment.employeeName,
      designation: payment.designation,
      month: payment.month,
      payDate: payment.payDate,
      baseAmount: Number(payment.baseAmount || components.baseAmount || 0),
      bonusAmount: Number(payment.bonusAmount || components.bonusAmount || 0),
      grossSalary: Number(payment.grossSalary || components.grossSalary || 0),
      statutoryDeductions: Number(payment.statutoryDeductions || components.statutoryDeductions || 0),
      voluntaryDeductions: Number(payment.voluntaryDeductions || components.voluntaryDeductions || 0),
      employerPayrollTaxes: Number(payment.employerPayrollTaxes || components.employerPayrollTaxes || 0),
      benefitsExpense: Number(payment.benefitsExpense || components.benefitsExpense || 0),
      netPay: Number(payment.netPay || components.netPay || 0),
      totalAmount: Number(payment.amount || components.netPay || 0),
      paymentMethod: payment.paymentMethod,
      notes: payment.notes,
    });

    if (payslipStatus.sent) {
      payment.payslipRecipient = payslipStatus.recipient;
      payment.payslipSentAt = new Date();
      await payment.save();
    }

    await writeAuditLog({
      module: 'accounting',
      action: 'salary_payment_created',
      entityType: 'salary_payment',
      entityId: payment._id.toString(),
      referenceNo: voucherNumber,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        employeeId: payment.employeeId?.toString(),
        month: payment.month,
        payDateKey: payment.payDateKey,
        baseAmount: payment.baseAmount,
        bonusAmount: payment.bonusAmount,
        grossSalary: payment.grossSalary,
        statutoryDeductions: payment.statutoryDeductions,
        voluntaryDeductions: payment.voluntaryDeductions,
        employerPayrollTaxes: payment.employerPayrollTaxes,
        benefitsExpense: payment.benefitsExpense,
        netPay: payment.netPay,
        totalPayrollCost: payment.totalPayrollCost,
        totalAmount: payment.amount,
        payslipSent: payslipStatus.sent,
        payslipMessage: payslipStatus.message,
      },
      after: payment.toObject(),
    });
    await writeRecordVersion({
      module: 'accounting',
      entityType: 'salary_payment',
      recordId: payment._id.toString(),
      action: 'CREATE',
      changedBy: req.userId,
      dataSnapshot: payment.toObject(),
    });

    const message = payslipStatus.sent
      ? 'Salary payment recorded and payslip sent'
      : `Salary payment recorded. Payslip not sent: ${payslipStatus.message}`;
    res.status(201).json({ success: true, data: payment, message });
  } catch (error: any) {
    if (Number(error?.code) === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Salary entry already exists for this employee on the same pay date in this month',
      });
    }
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to record salary payment') });
  }
});

router.get('/salary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { month, startDate, endDate, limit = 50, skip = 0 } = req.query;
    const filter: any = {};

    if (month) filter.month = month;
    if (startDate || endDate) {
      filter.payDate = {};
      if (startDate) filter.payDate.$gte = new Date(startDate as string);
      if (endDate) filter.payDate.$lte = new Date(endDate as string);
    }

    const items = await SalaryPayment.find(filter)
      .sort({ payDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const total = await SalaryPayment.countDocuments(filter);

    res.json({ success: true, data: items, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch salary payments' });
  }
});

router.put('/salary/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const salaryId = String(req.params.id);
    const payment = await SalaryPayment.findById(salaryId);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Salary payment not found' });
    }

    if (!canModifyCreatedRecord(req, payment.createdBy)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to modify this salary entry' });
    }

    const before = payment.toObject();

    const updatedMonth = String(req.body?.month || payment.month || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(updatedMonth)) {
      return res.status(400).json({ success: false, error: 'Invalid month format. Use YYYY-MM' });
    }

    const updatedPayDate = req.body?.payDate ? new Date(req.body.payDate) : new Date(payment.payDate);
    const updatedPayDateKey = toDateKey(updatedPayDate);
    if (!updatedPayDateKey) {
      return res.status(400).json({ success: false, error: 'Invalid pay date' });
    }
    if (!isPayDateWithinMonth(updatedPayDateKey, updatedMonth)) {
      return res.status(400).json({ success: false, error: 'Pay date must be within selected salary month' });
    }

    const components = resolveSalaryComponents(req.body, payment);
    if (components.grossSalary <= 0) {
      return res.status(400).json({ success: false, error: 'Gross salary must be greater than 0' });
    }

    const updatedMode = req.body?.paymentMethod
      ? (['cash', 'bank', 'card', 'upi', 'cheque'].includes(String(req.body.paymentMethod).toLowerCase())
        ? String(req.body.paymentMethod).toLowerCase()
        : payment.paymentMethod)
      : payment.paymentMethod;

    const duplicateFilter = buildSalaryDuplicateFilter({
      employeeId: payment.employeeId ? String(payment.employeeId) : undefined,
      employeeName: payment.employeeName,
      month: updatedMonth,
      payDateKey: updatedPayDateKey,
      excludeId: payment._id.toString(),
    });
    if (duplicateFilter) {
      const duplicate = await SalaryPayment.findOne(duplicateFilter).select('_id');
      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: 'Salary entry already exists for this employee on the same pay date in this month',
        });
      }
    }

    payment.month = updatedMonth;
    payment.payDate = updatedPayDate;
    payment.payDateKey = updatedPayDateKey;
    payment.baseAmount = components.baseAmount;
    payment.bonusAmount = components.bonusAmount;
    (payment as any).grossSalary = components.grossSalary;
    (payment as any).employeePf = components.employeePf;
    (payment as any).employeeEsi = components.employeeEsi;
    (payment as any).professionalTax = components.professionalTax;
    (payment as any).tdsAmount = components.tdsAmount;
    (payment as any).statutoryDeductions = components.statutoryDeductions;
    (payment as any).retirementContribution = components.retirementContribution;
    (payment as any).insurancePremium = components.insurancePremium;
    (payment as any).otherDeductions = components.otherDeductions;
    (payment as any).voluntaryDeductions = components.voluntaryDeductions;
    (payment as any).totalDeductions = components.totalDeductions;
    (payment as any).employerPf = components.employerPf;
    (payment as any).employerEsi = components.employerEsi;
    (payment as any).employerPayrollTaxes = components.employerPayrollTaxes;
    (payment as any).benefitsExpense = components.benefitsExpense;
    (payment as any).netPay = components.netPay;
    (payment as any).totalPayrollCost = components.totalPayrollCost;
    payment.amount = components.netPay;
    payment.paymentMethod = updatedMode as any;
    if (req.body?.designation !== undefined) payment.designation = String(req.body.designation || '').trim();
    if (req.body?.notes !== undefined) payment.notes = String(req.body.notes || '').trim();
    await payment.save();

    const sourceId = payment._id.toString();
    const oldLedgerRows = await AccountLedgerEntry.find({
      'metadata.source': 'salary_payment',
      'metadata.sourceId': sourceId,
    });
    const oldAccountIds = oldLedgerRows.map((row) => String(row.accountId || '')).filter(Boolean);
    const oldVoucherNo = String(oldLedgerRows[0]?.voucherNumber || '').trim();

    await markLedgerRowsDeleted({
      'metadata.source': 'salary_payment',
      'metadata.sourceId': sourceId,
    }, req.userId, `Superseded by salary payment update ${sourceId}`);

    const salaryTreasuryRoute = await resolveTreasuryRoute({
      paymentMethod: payment.paymentMethod,
      treasuryAccountId: req.body?.treasuryAccountId ? String(req.body.treasuryAccountId) : undefined,
    });
    const cashBank = await ChartAccount.findById(salaryTreasuryRoute.chartAccountId);
    if (!cashBank) {
      return res.status(400).json({ success: false, error: 'Treasury account is not configured for the selected salary payment method' });
    }
    const voucherNumber = oldVoucherNo || await generateNumber('salary_voucher', { prefix: 'SP-', datePart: true, padTo: 5 });

    const newAccountIds = await postSalaryComponentLedger({
      payment,
      components,
      cashBank,
      voucherNumber,
      paymentMode: normalizePaymentMode(payment.paymentMethod),
      treasuryAccountId: salaryTreasuryRoute.treasuryAccount._id.toString(),
      createdBy: req.userId,
    });

    await recalculateRunningBalancesForAccounts([...oldAccountIds, ...newAccountIds, cashBank._id.toString()]);

    await writeAuditLog({
      module: 'accounting',
      action: 'salary_payment_updated',
      entityType: 'salary_payment',
      entityId: payment._id.toString(),
      referenceNo: voucherNumber,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        month: payment.month,
        payDateKey: payment.payDateKey,
        baseAmount: payment.baseAmount,
        bonusAmount: payment.bonusAmount,
        grossSalary: (payment as any).grossSalary,
        statutoryDeductions: (payment as any).statutoryDeductions,
        voluntaryDeductions: (payment as any).voluntaryDeductions,
        employerPayrollTaxes: (payment as any).employerPayrollTaxes,
        benefitsExpense: (payment as any).benefitsExpense,
        netPay: (payment as any).netPay,
        totalPayrollCost: (payment as any).totalPayrollCost,
        totalAmount: payment.amount,
      },
      before,
      after: payment.toObject(),
    });
    await writeRecordVersion({
      module: 'accounting',
      entityType: 'salary_payment',
      recordId: payment._id.toString(),
      action: 'UPDATE',
      changedBy: req.userId,
      dataSnapshot: payment.toObject(),
    });

    res.json({ success: true, data: payment, message: 'Salary payment updated' });
  } catch (error: any) {
    if (Number(error?.code) === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Salary entry already exists for this employee on the same pay date in this month',
      });
    }
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to update salary payment') });
  }
});

// Contract payments
router.post('/contracts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { contractorName, contractTitle, paymentDate, amount, status, paymentMethod, notes } = req.body;

    if (!contractorName || !contractTitle || amount === undefined) {
      return res.status(400).json({ success: false, error: 'contractorName, contractTitle and amount are required' });
    }

    const amountNum = round2(Number(amount || 0));
    if (amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
    }

    const contractMode = ['cash', 'bank', 'card', 'upi', 'cheque'].includes(String(paymentMethod || '').toLowerCase())
      ? String(paymentMethod).toLowerCase()
      : 'bank';

    const payment = await ContractPayment.create({
      contractorName,
      contractTitle,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      amount: amountNum,
      status: status || 'paid',
      paymentMethod: contractMode,
      notes,
      createdBy: req.userId,
    });

    if (payment.status === 'paid' || payment.status === 'partial') {
      const contractExpense = await getOrCreateAccount({
        accountName: 'Contract Expense',
        accountType: 'expense',
        subType: 'general',
        isSystem: true,
        createdBy: req.userId,
      });
      const cashBank = await getCoreAccount(toBookType(payment.paymentMethod) === 'cash' ? 'cash' : 'bank');
      const voucherNumber = await generateNumber('contract_voucher', { prefix: 'CP-', datePart: true, padTo: 5 });

      await postLedger({
        accountId: contractExpense._id,
        entryDate: payment.paymentDate,
        voucherType: 'contract',
        voucherNumber,
        referenceNo: payment._id.toString(),
        narration: `Contract payment - ${payment.contractorName}: ${payment.contractTitle}`,
        debit: amountNum,
        credit: 0,
        paymentMode: normalizePaymentMode(contractMode),
        createdBy: req.userId,
        metadata: { source: 'contract_payment', sourceId: payment._id.toString() },
      });
      await postLedger({
        accountId: cashBank._id,
        entryDate: payment.paymentDate,
        voucherType: 'contract',
        voucherNumber,
        referenceNo: payment._id.toString(),
        narration: `Contract payment - ${payment.contractorName}: ${payment.contractTitle}`,
        debit: 0,
        credit: amountNum,
        paymentMode: normalizePaymentMode(contractMode),
        createdBy: req.userId,
        metadata: { source: 'contract_payment', sourceId: payment._id.toString() },
      });
    }

    res.status(201).json({ success: true, data: payment, message: 'Contract payment recorded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to record contract payment' });
  }
});

router.get('/contracts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, startDate, endDate, limit = 50, skip = 0 } = req.query;
    const filter: any = {};

    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate as string);
      if (endDate) filter.paymentDate.$lte = new Date(endDate as string);
    }

    const items = await ContractPayment.find(filter)
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const total = await ContractPayment.countDocuments(filter);

    res.json({ success: true, data: items, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch contract payments' });
  }
});

router.put('/contracts/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contractId = String(req.params.id);
    const payment = await ContractPayment.findById(contractId);
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Contract payment not found' });
    }

    if (!canModifyCreatedRecord(req, payment.createdBy)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to modify this contract entry' });
    }

    const before = payment.toObject();
    const nextAmount = req.body?.amount !== undefined ? round2(Number(req.body.amount || 0)) : round2(Number(payment.amount || 0));
    if (nextAmount <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
    }

    const nextMode = req.body?.paymentMethod
      ? (['cash', 'bank', 'card', 'upi', 'cheque'].includes(String(req.body.paymentMethod).toLowerCase())
        ? String(req.body.paymentMethod).toLowerCase()
        : payment.paymentMethod)
      : payment.paymentMethod;
    const nextStatus = req.body?.status ? String(req.body.status).toLowerCase() : payment.status;

    payment.contractorName = req.body?.contractorName !== undefined ? String(req.body.contractorName || '').trim() : payment.contractorName;
    payment.contractTitle = req.body?.contractTitle !== undefined ? String(req.body.contractTitle || '').trim() : payment.contractTitle;
    payment.paymentDate = req.body?.paymentDate ? new Date(req.body.paymentDate) : payment.paymentDate;
    payment.amount = nextAmount;
    payment.status = (['paid', 'partial', 'pending'].includes(nextStatus) ? nextStatus : payment.status) as any;
    payment.paymentMethod = nextMode as any;
    payment.notes = req.body?.notes !== undefined ? String(req.body.notes || '').trim() : payment.notes;
    await payment.save();

    const sourceId = payment._id.toString();
    const oldLedgerRows = await AccountLedgerEntry.find({
      'metadata.source': 'contract_payment',
      'metadata.sourceId': sourceId,
    });
    const oldAccountIds = oldLedgerRows.map((row) => String(row.accountId || '')).filter(Boolean);
    const oldVoucherNo = String(oldLedgerRows[0]?.voucherNumber || '').trim();

    await markLedgerRowsDeleted({
      'metadata.source': 'contract_payment',
      'metadata.sourceId': sourceId,
    }, req.userId, `Superseded by contract payment update ${sourceId}`);

    if (payment.status === 'paid' || payment.status === 'partial') {
      const contractExpense = await getOrCreateAccount({
        accountName: 'Contract Expense',
        accountType: 'expense',
        subType: 'general',
        isSystem: true,
        createdBy: req.userId,
      });
      const cashBank = await getCoreAccount(toBookType(payment.paymentMethod) === 'cash' ? 'cash' : 'bank');
      const voucherNumber = oldVoucherNo || await generateNumber('contract_voucher', { prefix: 'CP-', datePart: true, padTo: 5 });

      await postLedger({
        accountId: contractExpense._id,
        entryDate: payment.paymentDate,
        voucherType: 'contract',
        voucherNumber,
        referenceNo: sourceId,
        narration: `Contract payment - ${payment.contractorName}: ${payment.contractTitle}`,
        debit: nextAmount,
        credit: 0,
        paymentMode: normalizePaymentMode(payment.paymentMethod),
        createdBy: req.userId,
        metadata: { source: 'contract_payment', sourceId },
      });
      await postLedger({
        accountId: cashBank._id,
        entryDate: payment.paymentDate,
        voucherType: 'contract',
        voucherNumber,
        referenceNo: sourceId,
        narration: `Contract payment - ${payment.contractorName}: ${payment.contractTitle}`,
        debit: 0,
        credit: nextAmount,
        paymentMode: normalizePaymentMode(payment.paymentMethod),
        createdBy: req.userId,
        metadata: { source: 'contract_payment', sourceId },
      });
      await recalculateRunningBalancesForAccounts([...oldAccountIds, contractExpense._id.toString(), cashBank._id.toString()]);
    } else {
      await recalculateRunningBalancesForAccounts(oldAccountIds);
    }

    await writeAuditLog({
      module: 'accounting',
      action: 'contract_payment_updated',
      entityType: 'contract_payment',
      entityId: payment._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      before,
      after: payment.toObject(),
    });
    await writeRecordVersion({
      module: 'accounting',
      entityType: 'contract_payment',
      recordId: payment._id.toString(),
      action: 'UPDATE',
      changedBy: req.userId,
      dataSnapshot: payment.toObject(),
    });

    res.json({ success: true, data: payment, message: 'Contract payment updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to update contract payment') });
  }
});

// Manual day book entry
router.post('/day-book/entry', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryType, category, amount, paymentMethod, narration, referenceNo, entryDate } = req.body;

    if (!entryType || !category || amount === undefined) {
      return res.status(400).json({ success: false, error: 'entryType, category and amount are required' });
    }

    const amountNum = round2(Number(amount || 0));
    if (amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
    }

    const normalizedMode = normalizePaymentMode(paymentMethod);
    const treasuryRoute = await resolveTreasuryRoute({
      paymentMethod: normalizedMode,
      treasuryAccountId: req.body?.treasuryAccountId ? String(req.body.treasuryAccountId) : undefined,
      channelLabel: req.body?.paymentChannelLabel ? String(req.body.paymentChannelLabel) : undefined,
    });

    const entry = await DayBookEntry.create({
      entryType,
      category,
      amount: amountNum,
      paymentMethod: toDayBookPaymentMode(normalizedMode),
      treasuryAccountId: treasuryRoute.treasuryAccount._id,
      treasuryAccountName: treasuryRoute.treasuryAccount.displayName,
      narration,
      referenceNo,
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'accounting',
      action: 'daybook_entry_created',
      entityType: 'daybook_entry',
      entityId: entry._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        userAgent: req.get('user-agent'),
      },
      after: entry.toObject(),
    });

    await writeRecordVersion({
      module: 'accounting',
      entityType: 'daybook_entry',
      recordId: entry._id.toString(),
      action: 'CREATE',
      changedBy: req.userId,
      dataSnapshot: entry.toObject(),
    });

    res.status(201).json({ success: true, data: entry, message: 'Day book entry added' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to add day book entry' });
  }
});

router.get('/day-book/entries', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryType, startDate, endDate, category, paymentMethod, limit = 100, skip = 0 } = req.query;
    const filter: Record<string, any> = { status: 'active' };
    if (entryType) filter.entryType = String(entryType);
    if (category) filter.category = String(category);
    if (paymentMethod) filter.paymentMethod = String(paymentMethod);
    if (startDate || endDate) {
      filter.entryDate = {};
      if (startDate) filter.entryDate.$gte = new Date(String(startDate));
      if (endDate) {
        const e = new Date(String(endDate));
        e.setHours(23, 59, 59, 999);
        filter.entryDate.$lte = e;
      }
    }

    const rows = await DayBookEntry.find(filter)
      .sort({ entryDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await DayBookEntry.countDocuments(filter);

    const totals = rows.reduce(
      (acc, row) => {
        if (row.entryType === 'income') acc.income += Number(row.amount || 0);
        if (row.entryType === 'expense') acc.expense += Number(row.amount || 0);
        return acc;
      },
      { income: 0, expense: 0 }
    );

    res.json({
      success: true,
      data: {
        rows,
        totals: {
          income: round2(totals.income),
          expense: round2(totals.expense),
          net: round2(totals.income - totals.expense),
        },
      },
      pagination: { total, skip: Number(skip), limit: Number(limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch day-book entries' });
  }
});

router.put('/day-book/entry/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await DayBookEntry.findOne({ _id: req.params.id, status: 'active' });
    if (!existing) return res.status(404).json({ success: false, error: 'Day-book entry not found' });
    const before = existing.toObject();

    if (!isPrivileged(req) && String(existing.createdBy || '') !== String(req.userId || '')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to edit this entry' });
    }

    const updates: Record<string, any> = {};
    if (req.body.entryType !== undefined) updates.entryType = String(req.body.entryType) === 'income' ? 'income' : 'expense';
    if (req.body.category !== undefined) updates.category = String(req.body.category);
    if (req.body.narration !== undefined) updates.narration = String(req.body.narration);
    if (req.body.referenceNo !== undefined) updates.referenceNo = String(req.body.referenceNo);
    if (req.body.paymentMethod !== undefined) updates.paymentMethod = toDayBookPaymentMode(normalizePaymentMode(req.body.paymentMethod));
    if (req.body.amount !== undefined) {
      const amountNum = round2(Number(req.body.amount || 0));
      if (amountNum <= 0) return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
      updates.amount = amountNum;
    }
    if (req.body.entryDate !== undefined) updates.entryDate = new Date(req.body.entryDate);

    const updated = await DayBookEntry.findOneAndUpdate({ _id: req.params.id, status: 'active' }, updates, { new: true, runValidators: true });
    await writeAuditLog({
      module: 'accounting',
      action: 'daybook_entry_updated',
      entityType: 'daybook_entry',
      entityId: String(req.params.id),
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        userAgent: req.get('user-agent'),
      },
      before,
      after: updated?.toObject() || {},
    });
    if (updated) {
      await writeRecordVersion({
        module: 'accounting',
        entityType: 'daybook_entry',
        recordId: updated._id.toString(),
        action: 'UPDATE',
        changedBy: req.userId,
        dataSnapshot: updated.toObject(),
      });
    }
    res.json({ success: true, data: updated, message: 'Day-book entry updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update day-book entry' });
  }
});

router.delete('/day-book/entry/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await DayBookEntry.findOne({ _id: req.params.id, status: 'active' });
    if (!existing) return res.status(404).json({ success: false, error: 'Day-book entry not found' });
    const before = existing.toObject();

    if (!isPrivileged(req) && String(existing.createdBy || '') !== String(req.userId || '')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to delete this entry' });
    }

    const reason = String(req.body?.reason || 'Cancelled from accounting console').trim() || 'Cancelled from accounting console';
    existing.status = 'cancelled';
    existing.isDeleted = true;
    existing.deletedAt = new Date();
    existing.deletedBy = req.userId;
    existing.deletionReason = reason;
    existing.cancelledAt = new Date();
    existing.cancelledBy = req.userId;
    existing.cancellationReason = reason;
    await existing.save();
    await writeAuditLog({
      module: 'accounting',
      action: 'daybook_entry_cancelled',
      entityType: 'daybook_entry',
      entityId: existing._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        userAgent: req.get('user-agent'),
      },
      before,
      after: existing.toObject(),
    });
    await writeRecordVersion({
      module: 'accounting',
      entityType: 'daybook_entry',
      recordId: existing._id.toString(),
      action: 'CANCEL',
      changedBy: req.userId,
      dataSnapshot: existing.toObject(),
    });
    res.json({ success: true, message: 'Day-book entry archived' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to archive day-book entry' });
  }
});

// Opening balances
router.get('/opening-balances/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureDefaultChartAccounts();
    const setup = await getOpeningSetup();
    const accounts = await ChartAccount.find({
      subType: { $in: ['cash', 'bank', 'stock', 'customer', 'supplier'] },
      isActive: true,
    }).sort({ accountType: 1, accountCode: 1 });

    const rows = await Promise.all(
      accounts.map(async (account) => ({
        _id: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        subType: account.subType,
        openingBalance: account.openingBalance,
        openingSide: account.openingSide,
        closingBalance: round2(await getAccountClosing(account._id)),
      }))
    );

    res.json({
      success: true,
      data: {
        isLocked: Boolean(setup.isLocked),
        initializedAt: setup.initializedAt,
        lockedAt: setup.lockedAt,
        accounts: rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load opening balance status' });
  }
});

router.post('/opening-balances', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureDefaultChartAccounts();
    const setup = await getOpeningSetup();
    if (setup.isLocked) {
      return res.status(423).json({ success: false, error: 'Opening balances are locked' });
    }

    const openingDate = req.body.openingDate ? new Date(req.body.openingDate) : new Date();
    const voucherNumber = await generateNumber('opening_balance_voucher', { prefix: 'OB-', datePart: true, padTo: 4 });

    const parseLine = (line: any) => ({
      amount: round2(Number(line?.amount || 0)),
      side: String(line?.side || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit',
    });

    const cash = parseLine(req.body.cashAccount || { amount: req.body.cashAmount, side: req.body.cashSide });
    const bank = parseLine(req.body.bankAccount || { amount: req.body.bankAmount, side: req.body.bankSide });
    const stock = parseLine(req.body.openingStock || { amount: req.body.openingStockValue, side: req.body.openingStockSide });

    const posted: Array<Record<string, any>> = [];
    let openingDebitTotal = 0;
    let openingCreditTotal = 0;
    const postOpening = async (account: any, amount: number, side: 'debit' | 'credit', narration: string) => {
      if (amount <= 0) return;
      await postLedger({
        accountId: account._id,
        entryDate: openingDate,
        voucherType: 'opening',
        voucherNumber,
        narration,
        debit: side === 'debit' ? amount : 0,
        credit: side === 'credit' ? amount : 0,
        createdBy: req.userId,
        metadata: { source: 'opening_balance' },
      });
      openingDebitTotal = round2(openingDebitTotal + (side === 'debit' ? amount : 0));
      openingCreditTotal = round2(openingCreditTotal + (side === 'credit' ? amount : 0));
      account.openingBalance = round2(Number(account.openingBalance || 0) + amount);
      account.openingSide = side;
      await account.save();
      posted.push({
        accountId: account._id,
        accountName: account.accountName,
        amount,
        side,
      });
    };

    const cashAccount = await getCoreAccount('cash');
    const bankAccount = await getCoreAccount('bank');
    const stockAccount = await getCoreAccount('stock');

    const cashSide: 'debit' | 'credit' = String(cash.side).toLowerCase() === 'credit' ? 'credit' : 'debit';
    const bankSide: 'debit' | 'credit' = String(bank.side).toLowerCase() === 'credit' ? 'credit' : 'debit';
    const stockSide: 'debit' | 'credit' = String(stock.side).toLowerCase() === 'credit' ? 'credit' : 'debit';

    await postOpening(cashAccount, cash.amount, cashSide, 'Opening balance - Cash');
    await postOpening(bankAccount, bank.amount, bankSide, 'Opening balance - Bank');
    await postOpening(stockAccount, stock.amount, stockSide, 'Opening balance - Stock');

    const customerAccounts = Array.isArray(req.body.customerAccounts) ? req.body.customerAccounts : [];
    const supplierAccounts = Array.isArray(req.body.supplierAccounts) ? req.body.supplierAccounts : [];

    for (const row of customerAccounts) {
      const name = String(row?.name || row?.accountName || '').trim();
      const amount = round2(Number(row?.amount || 0));
      const side: 'debit' | 'credit' = String(row?.side || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit';
      if (!name || amount <= 0) continue;
      const account = await getOrCreateAccount({
        accountName: name.startsWith('Customer -') ? name : `Customer - ${name}`,
        accountType: 'asset',
        subType: 'customer',
        createdBy: req.userId,
      });
      await postOpening(account, amount, side, `Opening balance - Customer (${name})`);
    }

    for (const row of supplierAccounts) {
      const name = String(row?.name || row?.accountName || '').trim();
      const amount = round2(Number(row?.amount || 0));
      const side: 'debit' | 'credit' = String(row?.side || 'credit').toLowerCase() === 'debit' ? 'debit' : 'credit';
      if (!name || amount <= 0) continue;
      const account = await getOrCreateAccount({
        accountName: name.startsWith('Supplier -') ? name : `Supplier - ${name}`,
        accountType: 'liability',
        subType: 'supplier',
        createdBy: req.userId,
      });
      await postOpening(account, amount, side, `Opening balance - Supplier (${name})`);
    }

    const openingDifference = round2(openingDebitTotal - openingCreditTotal);
    if (openingDifference !== 0) {
      const equityAccount = await getOrCreateAccount({
        accountName: 'Opening Balance Equity',
        accountType: 'liability',
        subType: 'general',
        isSystem: true,
        createdBy: req.userId,
      });
      const equitySide: 'debit' | 'credit' = openingDifference > 0 ? 'credit' : 'debit';
      await postOpening(
        equityAccount,
        Math.abs(openingDifference),
        equitySide,
        'Opening balance auto-balancing entry'
      );
    }

    setup.initializedAt = new Date();
    setup.initializedBy = req.userId;
    if (Boolean(req.body.lockAfterSave)) {
      setup.isLocked = true;
      setup.lockedAt = new Date();
      setup.lockedBy = req.userId;
    }
    await setup.save();

    res.status(201).json({
      success: true,
      data: {
        voucherNumber,
        posted,
        isLocked: setup.isLocked,
      },
      message: 'Opening balances saved',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to save opening balances' });
  }
});

router.post('/opening-balances/lock', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const setup = await getOpeningSetup();
    setup.isLocked = true;
    setup.lockedAt = new Date();
    setup.lockedBy = req.userId;
    await setup.save();
    res.json({ success: true, data: setup, message: 'Opening balances locked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to lock opening balances' });
  }
});

// Account groups, ledger masters, and chart of accounts
router.get('/groups', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureDefaultAccountGroups();
    const rows = await AccountGroup.find({}).sort({ under: 1, groupName: 1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load account groups' });
  }
});

router.post('/groups', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupName = String(req.body.groupName || '').trim();
    if (!groupName) {
      return res.status(400).json({ success: false, error: 'Group name is required' });
    }

    const under = normalizeGroupUnder(req.body.under);
    const groupCode = req.body.groupCode
      ? String(req.body.groupCode).trim().toUpperCase()
      : await generateNumber('account_group', { prefix: 'GR-', padTo: 4 });

    const existing = await AccountGroup.findOne({
      $or: [
        { groupName: { $regex: `^${escapeRegex(groupName)}$`, $options: 'i' } },
        { groupCode },
      ],
    });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Group name or code already exists' });
    }

    const parent = req.body.parentGroupId ? await AccountGroup.findById(req.body.parentGroupId) : null;
    const created = await AccountGroup.create({
      groupName,
      groupCode,
      under,
      parentGroupId: parent?._id,
      parentGroupName: parent?.groupName || 'SELF',
      isSystem: false,
      isActive: true,
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'accounting',
      action: 'CREATE',
      entityType: 'account_group',
      entityId: created._id.toString(),
      referenceNo: created.groupCode,
      userId: req.userId,
      ipAddress: req.ip,
      after: created.toObject(),
    });

    res.status(201).json({ success: true, data: created, message: 'Account group created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create account group' });
  }
});

router.put('/groups/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await AccountGroup.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Account group not found' });

    const before = row.toObject();
    if (req.body.groupName !== undefined) {
      const groupName = String(req.body.groupName || '').trim();
      if (!groupName) return res.status(400).json({ success: false, error: 'Group name is required' });
      row.groupName = groupName;
    }
    if (req.body.groupCode !== undefined && !row.isSystem) {
      const groupCode = String(req.body.groupCode || '').trim().toUpperCase();
      if (groupCode) row.groupCode = groupCode;
    }
    if (req.body.under !== undefined && !row.isSystem) {
      row.under = normalizeGroupUnder(req.body.under);
    }
    if (req.body.parentGroupId !== undefined) {
      const parentId = String(req.body.parentGroupId || '').trim();
      if (parentId && parentId !== row._id.toString()) {
        const parent = await AccountGroup.findById(parentId);
        row.parentGroupId = parent?._id;
        row.parentGroupName = parent?.groupName || 'SELF';
      } else {
        row.parentGroupId = undefined;
        row.parentGroupName = 'SELF';
      }
    }
    if (req.body.isActive !== undefined && !row.isSystem) row.isActive = Boolean(req.body.isActive);

    await row.save();

    await ChartAccount.updateMany(
      { groupId: row._id },
      { $set: { groupName: row.groupName, accountType: row.under } }
    );

    await writeAuditLog({
      module: 'accounting',
      action: 'UPDATE',
      entityType: 'account_group',
      entityId: row._id.toString(),
      referenceNo: row.groupCode,
      userId: req.userId,
      ipAddress: req.ip,
      before,
      after: row.toObject(),
    });

    res.json({ success: true, data: row, message: 'Account group updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update account group' });
  }
});

router.get('/ledgers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureDefaultChartAccounts();
    const { groupId, q, isActive } = req.query;
    const filter: Record<string, any> = {};
    if (groupId) filter.groupId = groupId;
    if (isActive !== undefined) filter.isActive = String(isActive) === 'true';
    if (q) {
      filter.$or = [
        { accountCode: { $regex: String(q), $options: 'i' } },
        { accountName: { $regex: String(q), $options: 'i' } },
        { groupName: { $regex: String(q), $options: 'i' } },
        { gstNumber: { $regex: String(q), $options: 'i' } },
        { panNumber: { $regex: String(q), $options: 'i' } },
      ];
    }

    const rows = await ChartAccount.find(filter).sort({ accountType: 1, accountCode: 1 });
    const data = rows.map((row: any) => ({
      ...row.toObject(),
      folioNo: row.accountCode,
      groupName: getFallbackGroupName(row),
      underLabel: accountTypeToUnderLabel(row.accountType),
    }));
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load ledgers' });
  }
});

router.post('/ledgers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountName = String(req.body.accountName || '').trim();
    const groupId = String(req.body.groupId || '').trim();
    if (!accountName || !groupId) {
      return res.status(400).json({ success: false, error: 'Account name and group are required' });
    }

    const group = await AccountGroup.findById(groupId);
    if (!group) return res.status(404).json({ success: false, error: 'Selected group was not found' });

    const safeSubType: AccountSubType = ['cash', 'bank', 'customer', 'supplier', 'stock', 'general'].includes(String(req.body.subType))
      ? (String(req.body.subType) as AccountSubType)
      : 'general';

    const code = req.body.accountCode
      ? String(req.body.accountCode).trim().toUpperCase()
      : await generateNumber('ledger_account', { prefix: 'LD-', padTo: 5 });

    const exists = await ChartAccount.findOne({ accountCode: code });
    if (exists) {
      return res.status(409).json({ success: false, error: 'Folio number / account code already exists' });
    }

    const created = await ChartAccount.create({
      accountCode: code,
      accountName,
      accountType: group.under,
      subType: safeSubType,
      groupId: group._id,
      groupName: group.groupName,
      towerBlockFlat: String(req.body.towerBlockFlat || '').trim(),
      gstNumber: String(req.body.gstNumber || '').trim().toUpperCase(),
      panNumber: String(req.body.panNumber || '').trim().toUpperCase(),
      openingBalance: round2(Number(req.body.openingBalance || 0)),
      openingSide: String(req.body.openingSide || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit',
      isSystem: false,
      isActive: true,
      createdBy: req.userId,
    });

    await writeAuditLog({
      module: 'accounting',
      action: 'CREATE',
      entityType: 'ledger',
      entityId: created._id.toString(),
      referenceNo: created.accountCode,
      userId: req.userId,
      ipAddress: req.ip,
      after: created.toObject(),
    });

    res.status(201).json({ success: true, data: created, message: 'Ledger created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create ledger' });
  }
});

router.put('/ledgers/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await ChartAccount.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Ledger not found' });

    const before = row.toObject();
    if (req.body.accountName !== undefined) {
      const accountName = String(req.body.accountName || '').trim();
      if (!accountName) return res.status(400).json({ success: false, error: 'Account name is required' });
      row.accountName = accountName;
    }
    if (req.body.accountCode !== undefined && !row.isSystem) {
      const nextCode = String(req.body.accountCode || '').trim().toUpperCase();
      if (nextCode && nextCode !== row.accountCode) {
        const duplicate = await ChartAccount.findOne({ accountCode: nextCode, _id: { $ne: row._id } });
        if (duplicate) return res.status(409).json({ success: false, error: 'Folio number / account code already exists' });
        row.accountCode = nextCode;
      }
    }
    if (req.body.groupId !== undefined) {
      const group = await AccountGroup.findById(req.body.groupId);
      if (!group) return res.status(404).json({ success: false, error: 'Selected group was not found' });
      row.groupId = group._id;
      row.groupName = group.groupName;
      if (!row.isSystem) row.accountType = group.under;
    }
    if (req.body.subType !== undefined && !row.isSystem) {
      row.subType = ['cash', 'bank', 'customer', 'supplier', 'stock', 'general'].includes(String(req.body.subType))
        ? (String(req.body.subType) as AccountSubType)
        : row.subType;
    }
    if (req.body.towerBlockFlat !== undefined) row.towerBlockFlat = String(req.body.towerBlockFlat || '').trim();
    if (req.body.gstNumber !== undefined) row.gstNumber = String(req.body.gstNumber || '').trim().toUpperCase();
    if (req.body.panNumber !== undefined) row.panNumber = String(req.body.panNumber || '').trim().toUpperCase();
    if (req.body.openingBalance !== undefined) row.openingBalance = round2(Number(req.body.openingBalance || 0));
    if (req.body.openingSide !== undefined) {
      row.openingSide = String(req.body.openingSide || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit';
    }
    if (req.body.isActive !== undefined && !row.isSystem) row.isActive = Boolean(req.body.isActive);

    await row.save();

    await writeAuditLog({
      module: 'accounting',
      action: 'UPDATE',
      entityType: 'ledger',
      entityId: row._id.toString(),
      referenceNo: row.accountCode,
      userId: req.userId,
      ipAddress: req.ip,
      before,
      after: row.toObject(),
    });

    res.json({ success: true, data: row, message: 'Ledger updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update ledger' });
  }
});

// Chart of accounts and ledger
router.get('/chart-accounts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await ensureDefaultChartAccounts();
    const { accountType, subType, q, isActive } = req.query;
    const filter: Record<string, any> = {};
    if (accountType) filter.accountType = String(accountType);
    if (subType) filter.subType = String(subType);
    if (isActive !== undefined) filter.isActive = String(isActive) === 'true';
    if (q) {
      filter.$or = [
        { accountCode: { $regex: String(q), $options: 'i' } },
        { accountName: { $regex: String(q), $options: 'i' } },
      ];
    }
    const rows = await ChartAccount.find(filter).sort({ accountType: 1, accountCode: 1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load chart accounts' });
  }
});

router.post('/chart-accounts', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountCode, accountName, accountType, subType = 'general' } = req.body;
    if (!accountName || !accountType) {
      return res.status(400).json({ success: false, error: 'accountName and accountType are required' });
    }

    const safeType: AccountType = ['asset', 'liability', 'income', 'expense'].includes(String(accountType))
      ? (String(accountType) as AccountType)
      : 'asset';

    const safeSubType: AccountSubType = ['cash', 'bank', 'customer', 'supplier', 'stock', 'general'].includes(String(subType))
      ? (String(subType) as AccountSubType)
      : 'general';

    const code = accountCode
      ? String(accountCode).trim().toUpperCase()
      : await generateNumber('chart_account_manual', { prefix: 'AC-', padTo: 5 });

    const exists = await ChartAccount.findOne({ accountCode: code });
    if (exists) {
      return res.status(409).json({ success: false, error: 'Account code already exists' });
    }

    const created = await ChartAccount.create({
      accountCode: code,
      accountName: String(accountName).trim(),
      accountType: safeType,
      subType: safeSubType,
      openingBalance: 0,
      openingSide: 'debit',
      isSystem: false,
      isActive: true,
      createdBy: req.userId,
    });

    res.status(201).json({ success: true, data: created, message: 'Chart account created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create chart account' });
  }
});

router.put('/chart-accounts/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await ChartAccount.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Chart account not found' });

    const updates: Record<string, any> = {};
    if (req.body.accountName !== undefined) updates.accountName = String(req.body.accountName).trim();
    if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
    if (req.body.subType !== undefined && !row.isSystem) {
      updates.subType = ['cash', 'bank', 'customer', 'supplier', 'stock', 'general'].includes(String(req.body.subType))
        ? String(req.body.subType)
        : row.subType;
    }

    const updated = await ChartAccount.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    res.json({ success: true, data: updated, message: 'Chart account updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update chart account' });
  }
});

router.get('/chart-accounts/:id/ledger', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const account = await ChartAccount.findById(req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Chart account not found' });

    const { startDate, endDate, limit = 500, skip = 0 } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const opening = await getAccountClosing(account._id, new Date(start.getTime() - 1));

    const filter = { accountId: account._id, entryDate: { $gte: start, $lte: end } };
    const rows = await AccountLedgerEntry.find(filter)
      .sort({ entryDate: 1, createdAt: 1, _id: 1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await AccountLedgerEntry.countDocuments(filter);

    const totals = rows.reduce(
      (acc, row) => {
        acc.debit += Number(row.debit || 0);
        acc.credit += Number(row.credit || 0);
        return acc;
      },
      { debit: 0, credit: 0 }
    );

    res.json({
      success: true,
      data: {
        account,
        openingBalance: round2(opening),
        totals: {
          debit: round2(totals.debit),
          credit: round2(totals.credit),
          closing: round2(opening + totals.debit - totals.credit),
        },
        rows,
      },
      pagination: { total, skip: Number(skip), limit: Number(limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load ledger' });
  }
});

// Vouchers
router.post('/vouchers/receipt', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { voucher } = await createTreasuryAwareReceiptVoucher(req.body, req.userId);
    res.status(201).json({ success: true, data: voucher, message: 'Receipt voucher created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to create receipt voucher') });
  }
});

router.post('/vouchers/payment', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { voucher } = await createTreasuryAwarePaymentVoucher(req.body, req.userId);
    res.status(201).json({ success: true, data: voucher, message: 'Payment voucher created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to create payment voucher') });
  }
});

router.post('/vouchers/journal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { voucherDate, referenceNo, notes, lines } = req.body;
    if (!Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ success: false, error: 'Journal voucher requires at least two lines' });
    }

    const voucher = await createVoucherAndLedger({
      voucherType: 'journal',
      voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
      paymentMode: 'adjustment',
      referenceNo,
      notes,
      createdBy: req.userId,
      lines: lines.map((line: any) => ({
        accountId: String(line.accountId || ''),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        narration: line.narration,
      })),
    });

    res.status(201).json({ success: true, data: voucher, message: 'Journal voucher created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to create journal voucher') });
  }
});

router.get('/vouchers', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { voucherType, startDate, endDate, limit = 100, skip = 0 } = req.query;
    const filter: Record<string, any> = {};
    if (voucherType) filter.voucherType = String(voucherType);
    if (startDate || endDate) {
      filter.voucherDate = {};
      if (startDate) filter.voucherDate.$gte = new Date(String(startDate));
      if (endDate) {
        const e = new Date(String(endDate));
        e.setHours(23, 59, 59, 999);
        filter.voucherDate.$lte = e;
      }
    }
    const rows = await AccountingVoucher.find(filter)
      .sort({ voucherDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await AccountingVoucher.countDocuments(filter);

    res.json({ success: true, data: rows, pagination: { total, skip: Number(skip), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch vouchers') });
  }
});

router.get('/vouchers/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await AccountingVoucher.findById(String(req.params.id));
    if (!row) return res.status(404).json({ success: false, error: 'Voucher not found' });
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to fetch voucher') });
  }
});

const updateVoucherHandler = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const voucherId = String(req.params.id);
    const voucher = await AccountingVoucher.findById(voucherId);
    if (!voucher) return res.status(404).json({ success: false, error: 'Voucher not found' });

    if (!canModifyCreatedRecord(req, voucher.createdBy)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to modify this voucher' });
    }

    const before = voucher.toObject();
    const payload = await buildVoucherLedgerPayload(voucher.voucherType as VoucherType, req.body || {}, req.userId, voucher);
    const accountMap = new Map<string, any>();
    for (const line of payload.lines) {
      const account = await ChartAccount.findById(line.accountId);
      if (!account) {
        return res.status(400).json({ success: false, error: `Account not found: ${line.accountId}` });
      }
      accountMap.set(line.accountId, account);
    }

    voucher.voucherDate = payload.voucherDate;
    voucher.paymentMode = payload.voucherType === 'journal'
      ? undefined
      : (payload.paymentMode as any);
    voucher.referenceNo = payload.referenceNo;
    voucher.counterpartyName = payload.counterpartyName;
    voucher.notes = payload.notes;
    voucher.documentFields = payload.documentFields;
    voucher.totalAmount = round2(payload.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
    voucher.lines = payload.lines.map((line) => {
      const account = accountMap.get(line.accountId);
      return {
        accountId: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        debit: line.debit,
        credit: line.credit,
        narration: line.narration,
      };
    }) as any;
    voucher.isPrinted = false;
    await voucher.save();

    await replaceVoucherLedgerRows(voucher, payload, req.userId);
    await syncDayBookWithVoucher(voucher, payload.categoryLabel, req.userId);

    const after = voucher.toObject();
    await writeAuditLog({
      module: 'accounting',
      action: 'voucher_updated',
      entityType: 'voucher',
      entityId: voucher._id.toString(),
      referenceNo: voucher.voucherNumber,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        voucherType: voucher.voucherType,
        userAgent: req.get('user-agent'),
      },
      before,
      after,
    });
    await writeRecordVersion({
      module: 'accounting',
      entityType: 'voucher',
      recordId: voucher._id.toString(),
      action: 'UPDATE',
      changedBy: req.userId,
      dataSnapshot: after,
      metadata: {
        voucherType: voucher.voucherType,
      },
    });

    res.json({ success: true, data: voucher, message: 'Voucher updated successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, error: toClientErrorMessage(error, 'Failed to update voucher') });
  }
};

router.put('/vouchers/:id', authMiddleware, updateVoucherHandler);
router.post('/vouchers/:id/update', authMiddleware, updateVoucherHandler);

router.delete('/vouchers/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ success: false, error: 'Only super admin can archive vouchers' });
    }

    const voucherId = String(req.params.id);
    const voucher = await AccountingVoucher.findById(voucherId);
    if (!voucher) return res.status(404).json({ success: false, error: 'Voucher not found' });
    const before = voucher.toObject();
    const reason = String(req.body?.reason || `Archived from accounting console for voucher ${voucher.voucherNumber}`).trim()
      || `Archived from accounting console for voucher ${voucher.voucherNumber}`;

    const sourceId = voucher._id.toString();
    const ledgerRows = await AccountLedgerEntry.find({
      'metadata.source': 'voucher',
      'metadata.sourceId': sourceId,
    }).select('accountId');
    const accountIds = ledgerRows.map((row) => String(row.accountId || ''));

    await markLedgerRowsDeleted({
      'metadata.source': 'voucher',
      'metadata.sourceId': sourceId,
    }, req.userId, reason);
    await markDayBookRowsDeleted({ referenceNo: voucher.voucherNumber }, req.userId, reason);
    voucher.isDeleted = true;
    voucher.deletedAt = new Date();
    voucher.deletedBy = req.userId;
    voucher.deletionReason = reason;
    await voucher.save();
    await recalculateRunningBalancesForAccounts(accountIds);

    await writeAuditLog({
      module: 'accounting',
      action: 'voucher_archived',
      entityType: 'voucher',
      entityId: sourceId,
      referenceNo: voucher.voucherNumber,
      userId: req.userId,
      ipAddress: req.ip,
      metadata: {
        voucherType: voucher.voucherType,
        reason,
        userAgent: req.get('user-agent'),
      },
      before,
      after: voucher.toObject(),
    });
    await writeRecordVersion({
      module: 'accounting',
      entityType: 'voucher',
      recordId: sourceId,
      action: 'ARCHIVE',
      changedBy: req.userId,
      dataSnapshot: voucher.toObject(),
      metadata: {
        voucherType: voucher.voucherType,
        reason,
      },
    });

    res.json({ success: true, message: 'Voucher archived successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to archive voucher') });
  }
});

router.post('/vouchers/:id/mark-printed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await AccountingVoucher.findByIdAndUpdate(String(req.params.id), { isPrinted: true }, { new: true });
    if (!row) return res.status(404).json({ success: false, error: 'Voucher not found' });
    res.json({ success: true, data: row, message: 'Voucher marked as printed' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to update voucher print status') });
  }
});

// Transfer between cash and bank
router.post('/transfer', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { voucher } = await createTreasuryAwareTransferVoucher(req.body, req.userId);
    res.status(201).json({ success: true, data: voucher, message: 'Cash/Bank transfer recorded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to save transfer') });
  }
});

router.post('/treasury/sample-spark7', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isPrivileged(req)) {
      return res.status(403).json({ success: false, error: 'Only admin, manager, or accountant can load treasury sample data' });
    }

    await ensureTreasuryDefaults(req.userId);

    const findAccount = async (displayName: string) =>
      TreasuryAccount.findOne({
        displayName: { $regex: `^${escapeRegex(displayName)}$`, $options: 'i' },
      });

    const existingCash = await TreasuryAccount.findOne({ accountType: 'cash_float' }).sort({ isPrimary: -1, createdAt: 1 });
    const existingHdfc = await findAccount('HDFC Sports Store');
    const existingIcici = await findAccount('ICICI Facility Rent');

    const cashAccount = await upsertTreasuryAccount({
      id: existingCash?._id?.toString(),
      accountType: 'cash_float',
      displayName: 'Main Cash Counter',
      walletProvider: 'Front Desk Counter',
      openingBalance: Number(existingCash?.openingBalance ?? 12000),
      notes: 'Spark7 sample cash counter for treasury testing',
      createdBy: req.userId,
    });

    const hdfcAccount = await upsertTreasuryAccount({
      id: existingHdfc?._id?.toString(),
      accountType: 'bank',
      displayName: 'HDFC Sports Store',
      bankName: 'HDFC Bank',
      accountNumber: '50100123456789',
      branchName: 'Kakkanad',
      ifscCode: 'HDFC0001234',
      processorName: 'Sports Store QR',
      openingBalance: Number(existingHdfc?.openingBalance ?? 25000),
      isPrimary: true,
      notes: 'Spark7 sample bank for sports store and commission collections',
      createdBy: req.userId,
    });

    const iciciAccount = await upsertTreasuryAccount({
      id: existingIcici?._id?.toString(),
      accountType: 'bank',
      displayName: 'ICICI Facility Rent',
      bankName: 'ICICI Bank',
      accountNumber: '12340567890123',
      branchName: 'Kaloor',
      ifscCode: 'ICIC0000456',
      processorName: 'Facility Rentals',
      openingBalance: Number(existingIcici?.openingBalance ?? 18000),
      isPrimary: false,
      notes: 'Spark7 sample bank for room rent and facility rental collections',
      createdBy: req.userId,
    });

    await Promise.all([
      upsertPaymentMethodRoute({
        paymentMethod: 'cash',
        treasuryAccountId: cashAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: true,
        createdBy: req.userId,
      }),
      upsertPaymentMethodRoute({
        paymentMethod: 'upi',
        treasuryAccountId: hdfcAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: true,
        createdBy: req.userId,
      }),
      upsertPaymentMethodRoute({
        paymentMethod: 'bank_transfer',
        treasuryAccountId: hdfcAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: true,
        createdBy: req.userId,
      }),
      upsertPaymentMethodRoute({
        paymentMethod: 'upi',
        channelLabel: 'sports_store',
        treasuryAccountId: hdfcAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: false,
        createdBy: req.userId,
      }),
      upsertPaymentMethodRoute({
        paymentMethod: 'upi',
        channelLabel: 'room_rent',
        treasuryAccountId: iciciAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: false,
        createdBy: req.userId,
      }),
      upsertPaymentMethodRoute({
        paymentMethod: 'bank_transfer',
        channelLabel: 'room_rent',
        treasuryAccountId: iciciAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: false,
        createdBy: req.userId,
      }),
      upsertPaymentMethodRoute({
        paymentMethod: 'upi',
        channelLabel: 'commission',
        treasuryAccountId: hdfcAccount!._id.toString(),
        settlementDays: 0,
        feePercent: 0,
        fixedFee: 0,
        isDefault: false,
        createdBy: req.userId,
      }),
    ]);

    const createdReferences: string[] = [];
    const skippedReferences: string[] = [];

    const createVoucherIfMissing = async (referenceNo: string, run: () => Promise<void>) => {
      const existing = await AccountingVoucher.findOne({ referenceNo: String(referenceNo).trim() });
      if (existing) {
        skippedReferences.push(referenceNo);
        return;
      }
      await run();
      createdReferences.push(referenceNo);
    };

    await createVoucherIfMissing('SPARK7-ROOMRENT-001', async () => {
      await createTreasuryAwareReceiptVoucher({
        amount: 12000,
        voucherDate: '2026-04-08',
        paymentMode: 'bank_transfer',
        category: 'Room Rent Income',
        referenceNo: 'SPARK7-ROOMRENT-001',
        counterpartyName: 'Badminton Court Morning Slot',
        notes: 'Spark7 sample room rent collection routed to ICICI',
        treasuryAccountId: iciciAccount!._id.toString(),
        paymentChannelLabel: 'room_rent',
      }, req.userId);
    });

    await createVoucherIfMissing('SPARK7-ROOMRENT-002', async () => {
      await createTreasuryAwareReceiptVoucher({
        amount: 8500,
        voucherDate: '2026-04-09',
        paymentMode: 'upi',
        category: 'Room Rent Income',
        referenceNo: 'SPARK7-ROOMRENT-002',
        counterpartyName: 'Table Tennis Hall Evening Slot',
        notes: 'Spark7 sample second room rent collection',
        treasuryAccountId: iciciAccount!._id.toString(),
        paymentChannelLabel: 'room_rent',
      }, req.userId);
    });

    await createVoucherIfMissing('SPARK7-COMMISSION-001', async () => {
      await createTreasuryAwareReceiptVoucher({
        amount: 3500,
        voucherDate: '2026-04-09',
        paymentMode: 'upi',
        category: 'Commission Income',
        referenceNo: 'SPARK7-COMMISSION-001',
        counterpartyName: 'District Tournament Organizer',
        notes: 'Spark7 sample commission collection routed to HDFC',
        treasuryAccountId: hdfcAccount!._id.toString(),
        paymentChannelLabel: 'commission',
      }, req.userId);
    });

    await createVoucherIfMissing('SPARK7-RENTPAY-001', async () => {
      await createTreasuryAwarePaymentVoucher({
        amount: 5500,
        voucherDate: '2026-04-10',
        paymentMode: 'bank_transfer',
        category: 'Facility Rent Expense',
        referenceNo: 'SPARK7-RENTPAY-001',
        counterpartyName: 'ABC Estates',
        notes: 'Spark7 sample rent payment from HDFC account',
        treasuryAccountId: hdfcAccount!._id.toString(),
        documentFields: {
          accountName: 'ABC Estates',
          beingPaymentOf: 'Monthly facility rent',
          forPeriod: 'April 2026',
          receivedBy: 'Landlord',
          authorizedBy: 'Manager',
        },
      }, req.userId);
    });

    await createVoucherIfMissing('SPARK7-HDFC-TRANSFER-001', async () => {
      await createTreasuryAwareTransferVoucher({
        amount: 6000,
        transferDate: '2026-04-09',
        direction: 'cash_to_bank',
        referenceNo: 'SPARK7-HDFC-TRANSFER-001',
        notes: 'Spark7 sample transfer from cash counter to HDFC',
        fromTreasuryAccountId: cashAccount!._id.toString(),
        toTreasuryAccountId: hdfcAccount!._id.toString(),
      }, req.userId);
    });

    await createVoucherIfMissing('SPARK7-ICICI-TRANSFER-001', async () => {
      await createTreasuryAwareTransferVoucher({
        amount: 4000,
        transferDate: '2026-04-10',
        direction: 'cash_to_bank',
        referenceNo: 'SPARK7-ICICI-TRANSFER-001',
        notes: 'Spark7 sample transfer from cash counter to ICICI',
        fromTreasuryAccountId: cashAccount!._id.toString(),
        toTreasuryAccountId: iciciAccount!._id.toString(),
      }, req.userId);
    });

    const createdBankRefs: string[] = [];
    const skipBankRefIfExists = async (treasuryAccountId: string, referenceNo: string, row: { date: string; amount: number; description: string }) => {
      const existing = await BankFeedTransaction.findOne({ treasuryAccountId, referenceNo });
      if (existing) return;
      await importBankFeed({
        treasuryAccountId,
        rows: [{ date: row.date, amount: row.amount, description: row.description, referenceNo }],
        createdBy: req.userId,
      });
      createdBankRefs.push(referenceNo);
    };

    await skipBankRefIfExists(hdfcAccount!._id.toString(), 'SPARK7-COMMISSION-001', {
      date: '2026-04-09',
      amount: 3500,
      description: 'Commission collection credited to HDFC',
    });
    await skipBankRefIfExists(hdfcAccount!._id.toString(), 'SPARK7-HDFC-TRANSFER-001', {
      date: '2026-04-09',
      amount: 6000,
      description: 'Cash deposit from counter to HDFC',
    });
    await skipBankRefIfExists(hdfcAccount!._id.toString(), 'SPARK7-RENTPAY-001', {
      date: '2026-04-10',
      amount: -5500,
      description: 'Facility rent payment debited from HDFC',
    });
    await skipBankRefIfExists(iciciAccount!._id.toString(), 'SPARK7-ROOMRENT-001', {
      date: '2026-04-08',
      amount: 12000,
      description: 'Room rent collection credited to ICICI',
    });
    await skipBankRefIfExists(iciciAccount!._id.toString(), 'SPARK7-ROOMRENT-002', {
      date: '2026-04-09',
      amount: 8500,
      description: 'Second room rent collection credited to ICICI',
    });
    await skipBankRefIfExists(iciciAccount!._id.toString(), 'SPARK7-ICICI-TRANSFER-001', {
      date: '2026-04-10',
      amount: 4000,
      description: 'Cash deposit from counter to ICICI',
    });

    res.status(201).json({
      success: true,
      data: {
        accounts: {
          cash: cashAccount,
          hdfc: hdfcAccount,
          icici: iciciAccount,
        },
        createdReferences,
        skippedReferences,
        createdBankRefs,
      },
      message: `Spark7 sample treasury data loaded. Created ${createdReferences.length} voucher(s) and ${createdBankRefs.length} bank row(s).`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: toClientErrorMessage(error, 'Failed to load Spark7 treasury sample data') });
  }
});

// Cash and bank books
router.get('/books/cash', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildBookReport('cash', start, end);
    res.json({ success: true, data: { period: { startDate: start, endDate: end }, ...data } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load cash book' });
  }
});

router.get('/books/bank', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildBookReport('bank', start, end);
    const bankAccount = await getCoreAccount('bank');
    const reconciliationPending = await AccountLedgerEntry.find({
      accountId: bankAccount._id,
      entryDate: { $gte: start, $lte: end },
      isReconciled: false,
      voucherType: { $in: ['receipt', 'payment', 'journal', 'transfer', 'salary', 'contract', 'adjustment'] },
    }).sort({ entryDate: -1, createdAt: -1 });

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        ...data,
        reconciliationPending,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load bank book' });
  }
});

router.post('/books/bank/reconcile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entryIds } = req.body;
    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return res.json({
        success: true,
        data: { matched: 0, modified: 0 },
        message: 'Select at least one bank entry to reconcile',
      });
    }

    const result = await AccountLedgerEntry.updateMany(
      { _id: { $in: entryIds } },
      { $set: { isReconciled: true, reconciledAt: new Date() } }
    );

    res.json({
      success: true,
      data: { matched: Number(result.matchedCount || 0), modified: Number(result.modifiedCount || 0) },
      message: 'Bank entries reconciled',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to reconcile bank entries' });
  }
});

const computeNetUntil = async (end: Date) => {
  return buildRetainedEarningsUntil(end);
};

const collectBookEvents = async (book: BookType, start: Date, end: Date): Promise<BookEvent[]> => {
  await ensureDefaultChartAccounts();
  const cashAccount = await getCoreAccount('cash');
  const bankAccount = await getCoreAccount('bank');

  const [sales, returns, salaries, contracts, daybookRows, receiptRows, transferRows] = await Promise.all([
    Sale.find({ createdAt: { $gte: start, $lte: end }, ...postedSaleMatch }).sort({ createdAt: 1 }),
    Return.find({ createdAt: { $gte: start, $lte: end }, ...approvedReturnMatch }).sort({ createdAt: 1 }),
    SalaryPayment.find({ payDate: { $gte: start, $lte: end } }).sort({ payDate: 1 }),
    ContractPayment.find({ paymentDate: { $gte: start, $lte: end }, status: { $in: ['paid', 'partial'] } }).sort({ paymentDate: 1 }),
    DayBookEntry.find({ entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: 1 }),
    ReceiptVoucher.find({ entryDate: { $gte: start, $lte: end } }).sort({ entryDate: 1 }),
    AccountLedgerEntry.find({
      voucherType: 'transfer',
      accountId: { $in: [cashAccount._id, bankAccount._id] },
      entryDate: { $gte: start, $lte: end },
    }).sort({ entryDate: 1 }),
  ]);

  const events: BookEvent[] = [];

  for (const row of sales) {
    if (toBookType(row.paymentMethod) !== book) continue;
    events.push({
      time: row.createdAt || new Date(),
      source: 'sale',
      type: 'inflow',
      amount: round2(Number(row.totalAmount || 0)),
      narration: `Sale ${row.invoiceNumber || row.saleNumber}`,
      reference: row.invoiceNumber || row.saleNumber,
      paymentMethod: row.paymentMethod,
    });
  }

  for (const row of returns) {
    if (toBookType(row.refundMethod) !== book) continue;
    events.push({
      time: row.createdAt || new Date(),
      source: 'return',
      type: 'outflow',
      amount: round2(Number(row.refundAmount || 0)),
      narration: `Return ${row.returnNumber}`,
      reference: row.returnNumber,
      paymentMethod: row.refundMethod,
    });
  }

  for (const row of salaries) {
    if (toBookType(row.paymentMethod) !== book) continue;
    events.push({
      time: row.payDate,
      source: 'salary',
      type: 'outflow',
      amount: round2(Number(row.amount || 0)),
      narration: `Salary ${row.employeeName}`,
      reference: row._id.toString(),
      paymentMethod: row.paymentMethod,
    });
  }

  for (const row of contracts) {
    if (toBookType(row.paymentMethod) !== book) continue;
    events.push({
      time: row.paymentDate,
      source: 'contract',
      type: 'outflow',
      amount: round2(Number(row.amount || 0)),
      narration: `Contract ${row.contractorName}`,
      reference: row._id.toString(),
      paymentMethod: row.paymentMethod,
    });
  }

  for (const row of daybookRows) {
    if (toBookType(row.paymentMethod) !== book) continue;
    events.push({
      time: row.entryDate,
      source: 'daybook',
      type: row.entryType === 'income' ? 'inflow' : 'outflow',
      amount: round2(Number(row.amount || 0)),
      narration: `${row.category}${row.narration ? ` - ${row.narration}` : ''}`,
      reference: row.referenceNo || row._id.toString(),
      paymentMethod: row.paymentMethod,
    });
  }

  for (const row of receiptRows) {
    if (toBookType(row.mode) !== book) continue;
    events.push({
      time: row.entryDate,
      source: 'receipt',
      type: 'inflow',
      amount: round2(Number(row.amount || 0)),
      narration: `Receipt ${row.voucherNumber}`,
      reference: row.voucherNumber,
      paymentMethod: row.mode,
    });
  }

  for (const row of transferRows) {
    const isCashAccount = row.accountId.toString() === cashAccount._id.toString();
    const match = (book === 'cash' && isCashAccount) || (book === 'bank' && !isCashAccount);
    if (!match) continue;
    const amount = round2(Number(row.debit > 0 ? row.debit : row.credit));
    if (amount <= 0) continue;
    events.push({
      time: row.entryDate,
      source: 'transfer',
      type: row.debit > 0 ? 'inflow' : 'outflow',
      amount,
      narration: row.narration || 'Cash/Bank transfer',
      reference: row.voucherNumber || row.referenceNo || row._id.toString(),
      paymentMethod: 'bank_transfer',
    });
  }

  return events.sort((a, b) => a.time.getTime() - b.time.getTime());
};

const buildBookReport = async (book: BookType, start: Date, end: Date) => {
  const beforeStart = new Date(start.getTime() - 1);
  const [history, current] = await Promise.all([
    collectBookEvents(book, new Date('1970-01-01T00:00:00.000Z'), beforeStart),
    collectBookEvents(book, start, end),
  ]);
  const openingBalance = round2(history.reduce((sum, row) => sum + (row.type === 'inflow' ? row.amount : -row.amount), 0));
  const totalInflow = round2(current.filter((row) => row.type === 'inflow').reduce((sum, row) => sum + row.amount, 0));
  const totalOutflow = round2(current.filter((row) => row.type === 'outflow').reduce((sum, row) => sum + row.amount, 0));
  return {
    openingBalance,
    totalInflow,
    totalOutflow,
    closingBalance: round2(openingBalance + totalInflow - totalOutflow),
    entries: current,
  };
};

// Day book consolidated view
router.get('/day-book', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date } = req.query;
    const baseDate = date ? new Date(date as string) : new Date();

    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(23, 59, 59, 999);

    const [sales, returns, salaries, contracts, manualEntries, creditNotes] = await Promise.all([
      Sale.find({ createdAt: { $gte: start, $lte: end }, ...postedSaleMatch }).sort({ createdAt: 1 }),
      Return.find({ createdAt: { $gte: start, $lte: end }, ...approvedReturnMatch }).sort({ createdAt: 1 }),
      SalaryPayment.find({ payDate: { $gte: start, $lte: end } }).sort({ payDate: 1 }),
      ContractPayment.find({ paymentDate: { $gte: start, $lte: end }, status: { $in: ['paid', 'partial'] } }).sort({ paymentDate: 1 }),
      DayBookEntry.find({ entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: 1 }),
      CreditNote.find({ 'entries.createdAt': { $gte: start, $lte: end } }),
    ]);

    const entries = [
      ...sales.map((s) => ({
        time: s.createdAt,
        source: 'sale',
        type: 'income',
        amount: s.totalAmount,
        narration: `Sale ${s.saleNumber}`,
        paymentMethod: s.paymentMethod,
        reference: s.saleNumber,
      })),
      ...returns.map((r) => ({
        time: r.createdAt,
        source: 'return',
        type: 'expense',
        amount: r.refundAmount,
        narration: `Return ${r.returnNumber}`,
        paymentMethod: r.refundMethod,
        reference: r.returnNumber,
      })),
      ...salaries.map((s) => ({
        time: s.payDate,
        source: 'salary',
        type: 'expense',
        amount: salaryPayrollCostOfDoc(s),
        narration: `Salary - ${s.employeeName} (${s.month})`,
        paymentMethod: s.paymentMethod,
        reference: s._id,
      })),
      ...contracts.map((c) => ({
        time: c.paymentDate,
        source: 'contract',
        type: 'expense',
        amount: c.amount,
        narration: `Contract - ${c.contractorName}: ${c.contractTitle}`,
        paymentMethod: c.paymentMethod,
        reference: c._id,
      })),
      ...manualEntries.map((e) => ({
        time: e.entryDate,
        source: 'manual',
        type: e.entryType,
        amount: e.amount,
        narration: `${e.category}${e.narration ? ` - ${e.narration}` : ''}`,
        paymentMethod: e.paymentMethod,
        reference: e.referenceNo || e._id,
      })),
      ...creditNotes.flatMap((note) =>
        (note.entries || [])
          .filter((entry) => entry.createdAt && entry.createdAt >= start && entry.createdAt <= end)
          .map((entry) => ({
            time: entry.createdAt,
            source: `credit_note_${entry.type}`,
            type: entry.type === 'refund' ? 'expense' : 'income',
            amount: entry.amount,
            narration: `Credit Note ${note.noteNumber} - ${entry.type}`,
            paymentMethod: entry.paymentMethod || 'adjustment',
            reference: note.noteNumber,
          }))
      ),
    ].sort((a, b) => new Date(a.time as any).getTime() - new Date(b.time as any).getTime());

    const totalIncome = entries.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
    const totalExpense = entries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);

    const previousDay = new Date(start);
    previousDay.setMilliseconds(previousDay.getMilliseconds() - 1);
    const openingBalance = await computeNetUntil(previousDay);
    const closingBalance = openingBalance + totalIncome - totalExpense;

    res.json({
      success: true,
      data: {
        date: start,
        openingBalance,
        totalIncome,
        totalExpense,
        closingBalance,
        entries,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load day book' });
  }
});

router.get('/reports/expense', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const report = await buildIncomeExpenseReports(start, end);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        totalExpense: report.totalExpense,
        byCategory: report.expenseByCategory,
        rows: report.expenseRows,
        sourceSummary: report.sourceSummary,
        formula: 'Expense ledger debits minus credits, plus legacy expense rows only when no ledger posting exists.',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate expense report' });
  }
});

router.get('/reports/income', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const report = await buildIncomeExpenseReports(start, end);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        totalIncome: report.totalIncome,
        byCategory: report.incomeByCategory,
        rows: report.incomeRows,
        sourceSummary: report.sourceSummary,
        formula: 'Income ledger credits minus debits. Legacy POS sales are included net of GST, and sales returns reduce income.',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate income report' });
  }
});

router.get('/reports/trial-balance', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildTrialBalanceReport(start, end);

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate trial balance' });
  }
});

router.get('/reports/profit-loss', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildProfitLossStatement(start, end);

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate profit and loss statement' });
  }
});

router.get('/reports/balance-sheet', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const asOnDate = req.query.asOnDate ? new Date(String(req.query.asOnDate)) : new Date();
    asOnDate.setHours(23, 59, 59, 999);
    const data = await buildBalanceSheetReport(asOnDate);

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate balance sheet' });
  }
});

router.get('/reports/cash-book', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildBookReport('cash', start, end);
    res.json({ success: true, data: { period: { startDate: start, endDate: end }, ...data } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate cash book report' });
  }
});

router.get('/reports/bank-book', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildBookReport('bank', start, end);
    res.json({ success: true, data: { period: { startDate: start, endDate: end }, ...data } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate bank book report' });
  }
});

// Basic reports summary
router.get('/reports/summary', authMiddleware, accountingReportRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const [profitLoss, creditIssuedRows, creditBalanceRows, creditAdjustRows, creditRefundRows] = await Promise.all([
      buildProfitLossStatement(start, end),
      CreditNote.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      CreditNote.aggregate([
        { $group: { _id: null, total: { $sum: '$balanceAmount' } } },
      ]),
      CreditNote.aggregate([
        { $unwind: '$entries' },
        { $match: { 'entries.type': 'adjustment', 'entries.createdAt': { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$entries.amount' } } },
      ]),
      CreditNote.aggregate([
        { $unwind: '$entries' },
        { $match: { 'entries.type': 'refund', 'entries.createdAt': { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$entries.amount' } } },
      ]),
    ]);

    const creditRefundExpense = creditRefundRows[0]?.total || 0;

    const [salaryCount, contractCount, dayBookCount] = await Promise.all([
      SalaryPayment.countDocuments({ payDate: { $gte: start, $lte: end } }),
      ContractPayment.countDocuments({ paymentDate: { $gte: start, $lte: end } }),
      DayBookEntry.countDocuments({ entryDate: { $gte: start, $lte: end }, status: 'active' }),
    ]);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        income: {
          salesIncome: profitLoss.income.salesIncome,
          salesReturnContra: profitLoss.income.salesReturnContra,
          manualIncome: profitLoss.income.nonSalesIncome,
          totalIncome: profitLoss.income.totalIncome,
        },
        expenses: {
          salaryExpense: profitLoss.expenses.salaryExpense,
          contractExpense: profitLoss.expenses.contractExpense,
          returnsExpense: 0,
          creditRefundExpense,
          manualExpense: profitLoss.expenses.manualExpense,
          cogsExpense: profitLoss.expenses.cogsExpense,
          depreciationExpense: profitLoss.expenses.depreciationExpense,
          payrollTaxExpense: profitLoss.expenses.payrollTaxExpense,
          benefitsExpense: profitLoss.expenses.benefitsExpense,
          totalExpense: profitLoss.expenses.totalExpense,
        },
        creditNotes: {
          issued: creditIssuedRows[0]?.total || 0,
          adjusted: creditAdjustRows[0]?.total || 0,
          refunded: creditRefundRows[0]?.total || 0,
          customerCreditBalance: creditBalanceRows[0]?.total || 0,
        },
        netProfit: profitLoss.netProfit,
        counts: {
          salaryPayments: salaryCount,
          contractPayments: contractCount,
          dayBookEntries: dayBookCount,
        },
        sourceSummary: profitLoss.sourceSummary,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate report summary' });
  }
});

export default router;
