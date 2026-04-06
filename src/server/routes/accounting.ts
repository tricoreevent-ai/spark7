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
import { AccountLedgerEntry, LedgerVoucherType } from '../models/AccountLedgerEntry.js';
import { AccountingVoucher, VoucherType } from '../models/AccountingVoucher.js';
import { OpeningBalanceSetup } from '../models/OpeningBalanceSetup.js';
import { generateNumber } from '../services/numbering.js';
import { Employee } from '../models/Employee.js';
import accountingCoreRoutes from './accountingCore.js';

const router = Router();

router.use('/core', accountingCoreRoutes);

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

const isPrivileged = (req: AuthenticatedRequest) => {
  const role = String(req.userRole || '').toLowerCase();
  return role === 'admin' || role === 'super_admin' || role === 'manager';
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

const ensureDefaultChartAccounts = async () => {
  for (const row of CORE_ACCOUNTS) {
    await ChartAccount.findOneAndUpdate(
      { accountCode: row.accountCode },
      {
        $setOnInsert: {
          ...row,
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
  lines: Array<{ accountId: string; debit: number; credit: number; narration?: string }>;
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
    paymentMode: params.paymentMode,
    referenceNo: params.referenceNo,
    counterpartyName: params.counterpartyName,
    notes: params.notes,
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
      metadata: { source: 'voucher', sourceId: voucher._id.toString() },
    });
  }

  return voucher;
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
    const { employeeId, employeeName, designation, month, payDate, amount, paymentMethod, notes } = req.body;

    if (!month || amount === undefined) {
      return res.status(400).json({ success: false, error: 'month and amount are required' });
    }

    const amountNum = round2(Number(amount || 0));
    if (amountNum <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be greater than 0' });
    }

    let finalEmployeeName = String(employeeName || '').trim();
    let finalDesignation = String(designation || '').trim();
    let finalEmployeeId: any = undefined;

    if (employeeId) {
      const employee = await Employee.findById(employeeId);
      if (!employee || !employee.active) {
        return res.status(400).json({ success: false, error: 'Selected employee not found or inactive' });
      }
      finalEmployeeId = employee._id;
      finalEmployeeName = employee.name;
      finalDesignation = employee.designation || '';
    }

    if (!finalEmployeeName) {
      return res.status(400).json({ success: false, error: 'employeeId is required from employee master' });
    }

    const salaryMode = ['cash', 'bank', 'card', 'upi', 'cheque'].includes(String(paymentMethod || '').toLowerCase())
      ? String(paymentMethod).toLowerCase()
      : 'bank';

    const payment = await SalaryPayment.create({
      employeeId: finalEmployeeId,
      employeeName: finalEmployeeName,
      designation: finalDesignation,
      month,
      payDate: payDate ? new Date(payDate) : new Date(),
      amount: amountNum,
      paymentMethod: salaryMode,
      notes,
      createdBy: req.userId,
    });

    const salaryExpense = await getOrCreateAccount({
      accountName: 'Salary Expense',
      accountType: 'expense',
      subType: 'general',
      isSystem: true,
      createdBy: req.userId,
    });
    const cashBank = await getCoreAccount(toBookType(payment.paymentMethod) === 'cash' ? 'cash' : 'bank');
    const voucherNumber = await generateNumber('salary_voucher', { prefix: 'SP-', datePart: true, padTo: 5 });

    await postLedger({
      accountId: salaryExpense._id,
      entryDate: payment.payDate,
      voucherType: 'salary',
      voucherNumber,
      referenceNo: payment._id.toString(),
      narration: `Salary payment - ${payment.employeeName} (${payment.month})`,
      debit: amountNum,
      credit: 0,
      paymentMode: normalizePaymentMode(salaryMode),
      createdBy: req.userId,
      metadata: { source: 'salary_payment', sourceId: payment._id.toString() },
    });
    await postLedger({
      accountId: cashBank._id,
      entryDate: payment.payDate,
      voucherType: 'salary',
      voucherNumber,
      referenceNo: payment._id.toString(),
      narration: `Salary payment - ${payment.employeeName} (${payment.month})`,
      debit: 0,
      credit: amountNum,
      paymentMode: normalizePaymentMode(salaryMode),
      createdBy: req.userId,
      metadata: { source: 'salary_payment', sourceId: payment._id.toString() },
    });

    res.status(201).json({ success: true, data: payment, message: 'Salary payment recorded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to record salary payment' });
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

    const entry = await DayBookEntry.create({
      entryType,
      category,
      amount: amountNum,
      paymentMethod: toDayBookPaymentMode(normalizePaymentMode(paymentMethod)),
      narration,
      referenceNo,
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      createdBy: req.userId,
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
    res.json({ success: true, data: updated, message: 'Day-book entry updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update day-book entry' });
  }
});

router.delete('/day-book/entry/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await DayBookEntry.findOne({ _id: req.params.id, status: 'active' });
    if (!existing) return res.status(404).json({ success: false, error: 'Day-book entry not found' });

    if (!isPrivileged(req) && String(existing.createdBy || '') !== String(req.userId || '')) {
      return res.status(403).json({ success: false, error: 'You do not have permission to delete this entry' });
    }

    existing.status = 'cancelled';
    existing.cancelledAt = new Date();
    existing.cancelledBy = req.userId;
    existing.cancellationReason = 'Cancelled from accounting console';
    await existing.save();
    res.json({ success: true, message: 'Day-book entry cancelled' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete day-book entry' });
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
    const { amount, voucherDate, paymentMode, category, referenceNo, counterpartyName, notes } = req.body;
    const amountNum = round2(Number(amount || 0));
    if (amountNum <= 0) return res.status(400).json({ success: false, error: 'amount must be greater than 0' });

    const mode = normalizePaymentMode(paymentMode);
    const cashBankAccount = await getCoreAccount(toBookType(mode) === 'cash' ? 'cash' : 'bank');
    const incomeAccount = await getOrCreateAccount({
      accountName: `Income - ${String(category || 'Service Income').trim()}`,
      accountType: 'income',
      createdBy: req.userId,
    });

    const voucher = await createVoucherAndLedger({
      voucherType: 'receipt',
      voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
      paymentMode: mode,
      referenceNo,
      counterpartyName,
      notes,
      createdBy: req.userId,
      lines: [
        { accountId: cashBankAccount._id.toString(), debit: amountNum, credit: 0, narration: 'Receipt inflow' },
        { accountId: incomeAccount._id.toString(), debit: 0, credit: amountNum, narration: String(category || 'Service Income') },
      ],
    });

    await DayBookEntry.create({
      entryType: 'income',
      category: String(category || 'Service Income'),
      amount: amountNum,
      paymentMethod: toDayBookPaymentMode(mode),
      narration: notes,
      referenceNo: voucher.voucherNumber,
      entryDate: voucher.voucherDate,
      createdBy: req.userId,
    });

    res.status(201).json({ success: true, data: voucher, message: 'Receipt voucher created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create receipt voucher' });
  }
});

router.post('/vouchers/payment', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, voucherDate, paymentMode, category, referenceNo, counterpartyName, notes } = req.body;
    const amountNum = round2(Number(amount || 0));
    if (amountNum <= 0) return res.status(400).json({ success: false, error: 'amount must be greater than 0' });

    const mode = normalizePaymentMode(paymentMode);
    const cashBankAccount = await getCoreAccount(toBookType(mode) === 'cash' ? 'cash' : 'bank');
    const expenseAccount = await getOrCreateAccount({
      accountName: `Expense - ${String(category || 'General Expense').trim()}`,
      accountType: 'expense',
      createdBy: req.userId,
    });

    const voucher = await createVoucherAndLedger({
      voucherType: 'payment',
      voucherDate: voucherDate ? new Date(voucherDate) : new Date(),
      paymentMode: mode,
      referenceNo,
      counterpartyName,
      notes,
      createdBy: req.userId,
      lines: [
        { accountId: expenseAccount._id.toString(), debit: amountNum, credit: 0, narration: String(category || 'General Expense') },
        { accountId: cashBankAccount._id.toString(), debit: 0, credit: amountNum, narration: 'Payment outflow' },
      ],
    });

    await DayBookEntry.create({
      entryType: 'expense',
      category: String(category || 'General Expense'),
      amount: amountNum,
      paymentMethod: toDayBookPaymentMode(mode),
      narration: notes,
      referenceNo: voucher.voucherNumber,
      entryDate: voucher.voucherDate,
      createdBy: req.userId,
    });

    res.status(201).json({ success: true, data: voucher, message: 'Payment voucher created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create payment voucher' });
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
    res.status(500).json({ success: false, error: error.message || 'Failed to create journal voucher' });
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
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch vouchers' });
  }
});

router.get('/vouchers/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await AccountingVoucher.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: 'Voucher not found' });
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch voucher' });
  }
});

router.post('/vouchers/:id/mark-printed', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await AccountingVoucher.findByIdAndUpdate(req.params.id, { isPrinted: true }, { new: true });
    if (!row) return res.status(404).json({ success: false, error: 'Voucher not found' });
    res.json({ success: true, data: row, message: 'Voucher marked as printed' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update voucher print status' });
  }
});

// Transfer between cash and bank
router.post('/transfer', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, transferDate, direction = 'cash_to_bank', referenceNo, notes } = req.body;
    const amountNum = round2(Number(amount || 0));
    if (amountNum <= 0) return res.status(400).json({ success: false, error: 'amount must be greater than 0' });

    const cash = await getCoreAccount('cash');
    const bank = await getCoreAccount('bank');
    const debitAccount = direction === 'bank_to_cash' ? cash : bank;
    const creditAccount = direction === 'bank_to_cash' ? bank : cash;

    const voucher = await createVoucherAndLedger({
      voucherType: 'transfer',
      voucherDate: transferDate ? new Date(transferDate) : new Date(),
      paymentMode: 'bank_transfer',
      referenceNo,
      notes,
      createdBy: req.userId,
      lines: [
        { accountId: debitAccount._id.toString(), debit: amountNum, credit: 0, narration: `Transfer ${direction}` },
        { accountId: creditAccount._id.toString(), debit: 0, credit: amountNum, narration: `Transfer ${direction}` },
      ],
    });

    res.status(201).json({ success: true, data: voucher, message: 'Cash/Bank transfer recorded' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to save transfer' });
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
  const fromStart = new Date('1970-01-01T00:00:00.000Z');

  const sales = await aggregateSum(Sale, 'totalAmount', 'createdAt', fromStart, end, postedSaleMatch);
  const returns = await aggregateSum(Return, 'refundAmount', 'createdAt', fromStart, end, approvedReturnMatch);
  const creditRefunds = await CreditNote.aggregate([
    { $unwind: '$entries' },
    {
      $match: {
        'entries.type': 'refund',
        'entries.createdAt': { $gte: fromStart, $lte: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$entries.amount' } } },
  ]);
  const salaries = await aggregateSum(SalaryPayment, 'amount', 'payDate', fromStart, end);
  const contracts = await aggregateSum(ContractPayment, 'amount', 'paymentDate', fromStart, end, {
    status: { $in: ['paid', 'partial'] },
  });
  const manualIncome = await aggregateSum(DayBookEntry, 'amount', 'entryDate', fromStart, end, { entryType: 'income', status: 'active' });
  const manualExpense = await aggregateSum(DayBookEntry, 'amount', 'entryDate', fromStart, end, { entryType: 'expense', status: 'active' });

  const income = sales + manualIncome;
  const expense = returns + (creditRefunds[0]?.total || 0) + salaries + contracts + manualExpense;

  return income - expense;
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
        amount: s.amount,
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

router.get('/reports/expense', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);

    const [manualExpenses, salaries, contracts, returns] = await Promise.all([
      DayBookEntry.find({ entryType: 'expense', entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: -1 }),
      SalaryPayment.find({ payDate: { $gte: start, $lte: end } }).sort({ payDate: -1 }),
      ContractPayment.find({ paymentDate: { $gte: start, $lte: end }, status: { $in: ['paid', 'partial'] } }).sort({ paymentDate: -1 }),
      Return.find({ createdAt: { $gte: start, $lte: end }, ...approvedReturnMatch }).sort({ createdAt: -1 }),
    ]);

    const rows: Array<Record<string, any>> = [];
    manualExpenses.forEach((row) =>
      rows.push({
        date: row.entryDate,
        category: row.category,
        source: 'expense',
        amount: round2(Number(row.amount || 0)),
        paymentMethod: row.paymentMethod,
        reference: row.referenceNo || row._id,
        narration: row.narration,
      })
    );
    salaries.forEach((row) =>
      rows.push({
        date: row.payDate,
        category: 'Salary',
        source: 'salary',
        amount: round2(Number(row.amount || 0)),
        paymentMethod: row.paymentMethod,
        reference: row._id,
        narration: `${row.employeeName} (${row.month})`,
      })
    );
    contracts.forEach((row) =>
      rows.push({
        date: row.paymentDate,
        category: 'Contract',
        source: 'contract',
        amount: round2(Number(row.amount || 0)),
        paymentMethod: row.paymentMethod,
        reference: row._id,
        narration: `${row.contractorName} - ${row.contractTitle}`,
      })
    );
    returns.forEach((row) =>
      rows.push({
        date: row.createdAt,
        category: 'Sales Return',
        source: 'return',
        amount: round2(Number(row.refundAmount || 0)),
        paymentMethod: row.refundMethod,
        reference: row.returnNumber,
        narration: row.reason,
      })
    );

    rows.sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime());

    const byCategoryMap = new Map<string, number>();
    rows.forEach((row) => {
      byCategoryMap.set(
        String(row.category || 'Other'),
        round2((byCategoryMap.get(String(row.category || 'Other')) || 0) + Number(row.amount || 0))
      );
    });

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        totalExpense: round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        byCategory: Array.from(byCategoryMap.entries()).map(([category, amount]) => ({ category, amount })),
        rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate expense report' });
  }
});

router.get('/reports/income', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);

    const [salesRows, incomeRows] = await Promise.all([
      Sale.find({ createdAt: { $gte: start, $lte: end }, ...postedSaleMatch }).sort({ createdAt: -1 }),
      DayBookEntry.find({ entryType: 'income', entryDate: { $gte: start, $lte: end }, status: 'active' }).sort({ entryDate: -1 }),
    ]);

    const rows: Array<Record<string, any>> = [
      ...salesRows.map((row) => ({
        date: row.createdAt,
        category: 'Sales',
        source: 'sales',
        amount: round2(Number(row.totalAmount || 0)),
        paymentMethod: row.paymentMethod,
        reference: row.invoiceNumber || row.saleNumber,
      })),
      ...incomeRows.map((row) => ({
        date: row.entryDate,
        category: row.category,
        source: 'income',
        amount: round2(Number(row.amount || 0)),
        paymentMethod: row.paymentMethod,
        reference: row.referenceNo || row._id,
      })),
    ].sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime());

    const byCategoryMap = new Map<string, number>();
    rows.forEach((row) => {
      byCategoryMap.set(
        String(row.category || 'Other'),
        round2((byCategoryMap.get(String(row.category || 'Other')) || 0) + Number(row.amount || 0))
      );
    });

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        totalIncome: round2(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        byCategory: Array.from(byCategoryMap.entries()).map(([category, amount]) => ({ category, amount })),
        rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate income report' });
  }
});

router.get('/reports/trial-balance', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const accounts = await ChartAccount.find({ isActive: true }).sort({ accountType: 1, accountCode: 1 });
    const rows: Array<Record<string, any>> = [];

    for (const account of accounts) {
      const opening = await getAccountClosing(account._id, new Date(start.getTime() - 1));
      const agg = await AccountLedgerEntry.aggregate([
        { $match: { accountId: account._id, entryDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      ]);
      const debit = round2(Number(agg[0]?.debit || 0));
      const credit = round2(Number(agg[0]?.credit || 0));
      const closing = round2(opening + debit - credit);

      rows.push({
        accountId: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        openingBalance: round2(opening),
        debit,
        credit,
        closingBalance: closing,
        debitBalance: closing > 0 ? closing : 0,
        creditBalance: closing < 0 ? Math.abs(closing) : 0,
      });
    }

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        rows,
        totals: {
          debitBalance: round2(rows.reduce((sum, row) => sum + Number(row.debitBalance || 0), 0)),
          creditBalance: round2(rows.reduce((sum, row) => sum + Number(row.creditBalance || 0), 0)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate trial balance' });
  }
});

router.get('/reports/profit-loss', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);

    const salesIncome = await aggregateSum(Sale, 'totalAmount', 'createdAt', start, end, {
      ...postedSaleMatch,
    });
    const nonSalesIncome = await aggregateSum(DayBookEntry, 'amount', 'entryDate', start, end, { entryType: 'income', status: 'active' });
    const salaryExpense = await aggregateSum(SalaryPayment, 'amount', 'payDate', start, end);
    const contractExpense = await aggregateSum(ContractPayment, 'amount', 'paymentDate', start, end, { status: { $in: ['paid', 'partial'] } });
    const returnExpense = await aggregateSum(Return, 'refundAmount', 'createdAt', start, end, approvedReturnMatch);
    const manualExpense = await aggregateSum(DayBookEntry, 'amount', 'entryDate', start, end, { entryType: 'expense', status: 'active' });

    const totalIncome = round2(salesIncome + nonSalesIncome);
    const totalExpense = round2(salaryExpense + contractExpense + returnExpense + manualExpense);

    res.json({
      success: true,
      data: {
        period: { startDate: start, endDate: end },
        income: { salesIncome: round2(salesIncome), nonSalesIncome: round2(nonSalesIncome), totalIncome },
        expenses: {
          salaryExpense: round2(salaryExpense),
          contractExpense: round2(contractExpense),
          salesReturnExpense: round2(returnExpense),
          manualExpense: round2(manualExpense),
          totalExpense,
        },
        netProfit: round2(totalIncome - totalExpense),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate profit and loss statement' });
  }
});

router.get('/reports/balance-sheet', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const asOnDate = req.query.asOnDate ? new Date(String(req.query.asOnDate)) : new Date();
    asOnDate.setHours(23, 59, 59, 999);
    const accounts = await ChartAccount.find({ isActive: true }).sort({ accountType: 1, accountCode: 1 });

    const assets: Array<Record<string, any>> = [];
    const liabilities: Array<Record<string, any>> = [];

    for (const account of accounts) {
      const closing = round2(await getAccountClosing(account._id, asOnDate));
      if (account.accountType === 'asset' && closing !== 0) {
        assets.push({ accountCode: account.accountCode, accountName: account.accountName, amount: closing });
      }
      if (account.accountType === 'liability') {
        const amount = round2(closing < 0 ? Math.abs(closing) : closing === 0 ? 0 : -closing);
        if (amount !== 0) liabilities.push({ accountCode: account.accountCode, accountName: account.accountName, amount });
      }
    }

    const retainedEarnings = round2(await computeNetUntil(asOnDate));
    const totalAssets = round2(assets.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const totalLiabilities = round2(liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const liabilitiesAndEquity = round2(totalLiabilities + retainedEarnings);

    res.json({
      success: true,
      data: {
        asOnDate,
        assets,
        liabilities,
        equity: retainedEarnings,
        totals: {
          totalAssets,
          totalLiabilities,
          liabilitiesAndEquity,
          difference: round2(totalAssets - liabilitiesAndEquity),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate balance sheet' });
  }
});

router.get('/reports/cash-book', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);
    const data = await buildBookReport('cash', start, end);
    res.json({ success: true, data: { period: { startDate: start, endDate: end }, ...data } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate cash book report' });
  }
});

router.get('/reports/bank-book', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/reports/summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const { start, end } = toDateRange(startDate as string | undefined, endDate as string | undefined);

    const salesIncome = await aggregateSum(Sale, 'totalAmount', 'createdAt', start, end, postedSaleMatch);
    const manualIncome = await aggregateSum(DayBookEntry, 'amount', 'entryDate', start, end, { entryType: 'income', status: 'active' });

    const salaryExpense = await aggregateSum(SalaryPayment, 'amount', 'payDate', start, end);
    const contractExpense = await aggregateSum(ContractPayment, 'amount', 'paymentDate', start, end, {
      status: { $in: ['paid', 'partial'] },
    });
    const returnsExpense = await aggregateSum(Return, 'refundAmount', 'createdAt', start, end, approvedReturnMatch);
    const manualExpense = await aggregateSum(DayBookEntry, 'amount', 'entryDate', start, end, { entryType: 'expense', status: 'active' });
    const [creditIssuedRows, creditBalanceRows, creditAdjustRows, creditRefundRows] = await Promise.all([
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
    const totalIncome = salesIncome + manualIncome;
    const totalExpense = salaryExpense + contractExpense + returnsExpense + creditRefundExpense + manualExpense;

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
          salesIncome,
          manualIncome,
          totalIncome,
        },
        expenses: {
          salaryExpense,
          contractExpense,
          returnsExpense,
          creditRefundExpense,
          manualExpense,
          totalExpense,
        },
        creditNotes: {
          issued: creditIssuedRows[0]?.total || 0,
          adjusted: creditAdjustRows[0]?.total || 0,
          refunded: creditRefundRows[0]?.total || 0,
          customerCreditBalance: creditBalanceRows[0]?.total || 0,
        },
        netProfit: totalIncome - totalExpense,
        counts: {
          salaryPayments: salaryCount,
          contractPayments: contractCount,
          dayBookEntries: dayBookCount,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate report summary' });
  }
});

export default router;
