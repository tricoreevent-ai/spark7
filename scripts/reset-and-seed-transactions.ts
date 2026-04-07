import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

import '../src/server/models/registerTenantPlugin.ts';

import { runWithTenantContext } from '../src/server/services/tenantContext.ts';
import { User } from '../src/server/models/User.ts';
import { Product } from '../src/server/models/Product.ts';
import { Order } from '../src/server/models/Order.ts';
import { Sale } from '../src/server/models/Sale.ts';
import { Facility } from '../src/server/models/Facility.ts';
import { FacilityBooking } from '../src/server/models/FacilityBooking.ts';
import { EventBooking } from '../src/server/models/EventBooking.ts';
import { Employee } from '../src/server/models/Employee.ts';
import { SalaryPayment } from '../src/server/models/SalaryPayment.ts';
import { ContractPayment } from '../src/server/models/ContractPayment.ts';
import { DayBookEntry } from '../src/server/models/DayBookEntry.ts';
import { AccountingVoucher } from '../src/server/models/AccountingVoucher.ts';
import { AccountLedgerEntry } from '../src/server/models/AccountLedgerEntry.ts';
import { OpeningBalanceSetup } from '../src/server/models/OpeningBalanceSetup.ts';
import { AccountingInvoice } from '../src/server/models/AccountingInvoice.ts';
import { AccountingPayment } from '../src/server/models/AccountingPayment.ts';
import { JournalEntry } from '../src/server/models/JournalEntry.ts';
import { JournalLine } from '../src/server/models/JournalLine.ts';
import { Vendor } from '../src/server/models/Vendor.ts';
import { FixedAsset } from '../src/server/models/FixedAsset.ts';
import { FinancialPeriod } from '../src/server/models/FinancialPeriod.ts';
import { ChartAccount } from '../src/server/models/ChartAccount.ts';
import { Customer } from '../src/server/models/Customer.ts';
import { ReceiptVoucher } from '../src/server/models/ReceiptVoucher.ts';
import { CreditNote } from '../src/server/models/CreditNote.ts';
import { Return } from '../src/server/models/Return.ts';

const round2 = (value: number) => Number(Number(value || 0).toFixed(2));

const dayStamp = (() => {
  const iso = new Date().toISOString();
  return iso.slice(2, 10).replace(/-/g, '');
})();

const buildMonthDate = (year: number, monthZeroBased: number, day: number, hour: number, minute = 0) =>
  new Date(year, monthZeroBased, day, hour, minute, 0, 0);

const paymentModeToAccountKey = (mode: string) => (String(mode).toLowerCase() === 'cash' ? 'cash_in_hand' : 'bank_account');

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildGst = (baseAmount: number, rate: number, treatment: 'none' | 'intrastate' | 'interstate') => {
  const safeBase = round2(baseAmount);
  const safeRate = round2(rate);
  if (treatment === 'none' || safeRate <= 0) {
    return {
      baseAmount: safeBase,
      gstAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      totalAmount: safeBase,
    };
  }

  const gstAmount = round2((safeBase * safeRate) / 100);
  if (treatment === 'interstate') {
    return {
      baseAmount: safeBase,
      gstAmount,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: gstAmount,
      totalAmount: round2(safeBase + gstAmount),
    };
  }

  const cgstAmount = round2(gstAmount / 2);
  const sgstAmount = round2(gstAmount - cgstAmount);
  return {
    baseAmount: safeBase,
    gstAmount,
    cgstAmount,
    sgstAmount,
    igstAmount: 0,
    totalAmount: round2(safeBase + gstAmount),
  };
};

const modelsToBackup: Array<{ name: string; model: any }> = [
  { name: 'sales', model: Sale },
  { name: 'orders', model: Order },
  { name: 'facilityBookings', model: FacilityBooking },
  { name: 'eventBookings', model: EventBooking },
  { name: 'salaryPayments', model: SalaryPayment },
  { name: 'contractPayments', model: ContractPayment },
  { name: 'dayBookEntries', model: DayBookEntry },
  { name: 'accountingVouchers', model: AccountingVoucher },
  { name: 'accountLedgerEntries', model: AccountLedgerEntry },
  { name: 'openingBalanceSetup', model: OpeningBalanceSetup },
  { name: 'accountingInvoices', model: AccountingInvoice },
  { name: 'accountingPayments', model: AccountingPayment },
  { name: 'journalEntries', model: JournalEntry },
  { name: 'journalLines', model: JournalLine },
  { name: 'vendors', model: Vendor },
  { name: 'fixedAssets', model: FixedAsset },
  { name: 'financialPeriods', model: FinancialPeriod },
  { name: 'receiptVouchers', model: ReceiptVoucher },
  { name: 'creditNotes', model: CreditNote },
  { name: 'returns', model: Return },
];

const modelsToClear: Array<any> = [
  JournalLine,
  JournalEntry,
  AccountingPayment,
  AccountingInvoice,
  AccountingVoucher,
  AccountLedgerEntry,
  DayBookEntry,
  SalaryPayment,
  ContractPayment,
  FacilityBooking,
  EventBooking,
  Sale,
  Order,
  Vendor,
  FixedAsset,
  FinancialPeriod,
  OpeningBalanceSetup,
  ReceiptVoucher,
  CreditNote,
  Return,
];

type SeedContext = {
  tenantId: string;
  operatorId: string;
  operatorEmail: string;
  seedKey: string;
  sequences: Map<string, number>;
  accounts: Map<string, any>;
  products: any[];
  facilities: any[];
  customers: any[];
  employees: any[];
};

const nextNumber = (ctx: SeedContext, prefix: string) => {
  const current = ctx.sequences.get(prefix) || 0;
  const next = current + 1;
  ctx.sequences.set(prefix, next);
  return `${ctx.seedKey}-${prefix}-${String(next).padStart(3, '0')}`;
};

const ensureDatabaseConnection = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured');
  }

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(databaseUrl);
  }
};

const resolveOperator = async () => {
  const users = await User.find({
    tenantId: { $exists: true, $ne: '' },
    isActive: { $ne: false },
  })
    .select('_id tenantId email role createdAt')
    .sort({ createdAt: 1 })
    .lean();

  if (!users.length) {
    throw new Error('No active tenant user found. Cannot determine which tenant to seed.');
  }

  const distinctTenantIds = Array.from(new Set(users.map((user: any) => String(user.tenantId))));
  if (distinctTenantIds.length > 1) {
    console.log(`Found multiple tenants (${distinctTenantIds.join(', ')}). Using the earliest active admin-like user.`);
  }

  const preferred =
    users.find((user: any) => ['admin', 'super_admin', 'manager', 'accountant'].includes(String(user.role || '').toLowerCase()))
    || users[0];

  return {
    tenantId: String(preferred.tenantId),
    operatorId: String(preferred._id),
    operatorEmail: String(preferred.email || ''),
  };
};

const backupTransactions = async (ctx: SeedContext) => {
  const backupDir = path.join(process.cwd(), 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `transaction-reset-${ctx.seedKey}.json`);

  const snapshot: Record<string, any> = {
    tenantId: ctx.tenantId,
    operatorId: ctx.operatorId,
    createdAt: new Date().toISOString(),
    collections: {},
  };

  for (const { name, model } of modelsToBackup) {
    snapshot.collections[name] = await model.find().lean();
  }

  await fs.writeFile(backupPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return backupPath;
};

const clearTransactions = async () => {
  for (const model of modelsToClear) {
    await model.deleteMany({});
  }
};

const resetChartAccounts = async (ctx: SeedContext) => {
  const existingAccounts = await ChartAccount.find({}).sort({ accountCode: 1 });
  for (const account of existingAccounts) {
    account.openingBalance = 0;
    account.openingSide = account.accountType === 'liability' ? 'credit' : 'debit';
    account.isActive = true;
    account.systemKey = undefined;
    await account.save();
  }

  const attachLegacySystemKey = async (definition: {
    key: string;
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'income' | 'expense';
    subType: 'cash' | 'bank' | 'customer' | 'supplier' | 'stock' | 'general';
  }) => {
    let account = await ChartAccount.findOne({ accountCode: definition.code });
    if (!account) {
      account = await ChartAccount.create({
        accountCode: definition.code,
        accountName: definition.name,
        accountType: definition.type,
        subType: definition.subType,
        openingBalance: 0,
        openingSide: definition.type === 'liability' ? 'credit' : 'debit',
        isSystem: true,
        isActive: true,
        createdBy: ctx.operatorId,
        systemKey: definition.key,
      });
    } else {
      account.accountType = definition.type;
      account.subType = definition.subType;
      account.isSystem = true;
      account.isActive = true;
      account.systemKey = definition.key;
      await account.save();
    }
    return account;
  };

  const ensureAccount = async (definition: {
    key: string;
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'income' | 'expense';
    subType: 'cash' | 'bank' | 'customer' | 'supplier' | 'stock' | 'general';
    parentKey?: string;
  }) => {
    const parent = definition.parentKey ? ctx.accounts.get(definition.parentKey) : null;
    let account =
      (await ChartAccount.findOne({ systemKey: definition.key }))
      || (await ChartAccount.findOne({ accountCode: definition.code }))
      || (await ChartAccount.findOne({ accountName: { $regex: `^${escapeRegex(definition.name)}$`, $options: 'i' } }));

    if (!account) {
      account = await ChartAccount.create({
        accountCode: definition.code,
        accountName: definition.name,
        accountType: definition.type,
        subType: definition.subType,
        parentAccountId: parent?._id,
        openingBalance: 0,
        openingSide: definition.type === 'liability' ? 'credit' : 'debit',
        isSystem: true,
        isActive: true,
        createdBy: ctx.operatorId,
        systemKey: definition.key,
      });
    } else {
      account.accountType = definition.type;
      account.subType = definition.subType;
      account.parentAccountId = parent?._id;
      account.isSystem = true;
      account.isActive = true;
      account.systemKey = definition.key;
      await account.save();
    }
    return account;
  };

  const legacyDefinitions = [
    { key: 'cash_in_hand', code: '1000', name: 'Cash Account', type: 'asset', subType: 'cash' },
    { key: 'bank_account', code: '1010', name: 'Bank Account', type: 'asset', subType: 'bank' },
    { key: 'accounts_receivable', code: '1100', name: 'Customer Control', type: 'asset', subType: 'customer' },
    { key: 'accounts_payable', code: '2000', name: 'Supplier Control', type: 'liability', subType: 'supplier' },
    { key: 'sales_revenue', code: '3000', name: 'Sales Income', type: 'income', subType: 'general' },
    { key: 'other_income', code: '3100', name: 'Other Income', type: 'income', subType: 'general' },
    { key: 'general_expense', code: '4000', name: 'Expense', type: 'expense', subType: 'general' },
    { key: 'salary_expense', code: '4010', name: 'Salary Expense', type: 'expense', subType: 'general' },
    { key: 'contract_expense', code: '4020', name: 'Contract Expense', type: 'expense', subType: 'general' },
    { key: 'stock_opening', code: '1200', name: 'Opening Stock', type: 'asset', subType: 'stock' },
  ] as const;

  for (const definition of legacyDefinitions) {
    const account = await attachLegacySystemKey(definition);
    ctx.accounts.set(definition.key, account);
  }

  const additionalDefinitions = [
    { key: 'booking_revenue', code: '3110', name: 'Booking Revenue', type: 'income', subType: 'general' },
    { key: 'event_revenue', code: '3120', name: 'Event Revenue', type: 'income', subType: 'general' },
    { key: 'cgst_payable', code: '2210', name: 'CGST Payable', type: 'liability', subType: 'general' },
    { key: 'sgst_payable', code: '2220', name: 'SGST Payable', type: 'liability', subType: 'general' },
    { key: 'igst_payable', code: '2230', name: 'IGST Payable', type: 'liability', subType: 'general' },
    { key: 'fixed_assets', code: '1210', name: 'Fixed Asset Register', type: 'asset', subType: 'general' },
    { key: 'accumulated_depreciation', code: '1215', name: 'Accumulated Depreciation', type: 'asset', subType: 'general' },
    { key: 'depreciation_expense', code: '4030', name: 'Depreciation Expense', type: 'expense', subType: 'general' },
  ] as const;

  for (const definition of additionalDefinitions) {
    const account = await ensureAccount(definition);
    ctx.accounts.set(definition.key, account);
  }
};

const ensureMasters = async (ctx: SeedContext) => {
  const ensureProducts = async () => {
    let products = await Product.find({ isActive: true }).sort({ createdAt: 1 }).limit(2);
    const missing = 2 - products.length;

    for (let index = 0; index < missing; index += 1) {
      const count = products.length + index + 1;
      await Product.create({
        name: `Seed Product ${count}`,
        sku: `${ctx.seedKey}-SKU-${String(count).padStart(3, '0')}`,
        category: 'Test Inventory',
        itemType: count === 1 ? 'inventory' : 'service',
        price: count === 1 ? 250 : 300,
        cost: count === 1 ? 150 : 180,
        gstRate: 18,
        hsnCode: '998596',
        stock: 50,
        minStock: 5,
        unit: 'piece',
        isActive: true,
      });
    }

    products = await Product.find({ isActive: true }).sort({ createdAt: 1 }).limit(2);
    return products;
  };

  const ensureFacilities = async () => {
    let facilities = await Facility.find({ active: true }).sort({ createdAt: 1 }).limit(2);
    const missing = 2 - facilities.length;

    const facilitySeedData = [
      { name: 'Seed Football Turf', type: 'football_turf', rate: 1000 },
      { name: 'Seed Badminton Court', type: 'badminton_court', rate: 750 },
    ];

    for (let index = 0; index < missing; index += 1) {
      const row = facilitySeedData[index];
      await Facility.create({
        name: row.name,
        type: row.type,
        hourlyRate: row.rate,
        capacity: row.type === 'football_turf' ? 14 : 4,
        location: 'Test Zone',
        active: true,
        createdBy: ctx.operatorId,
      });
    }

    facilities = await Facility.find({ active: true }).sort({ createdAt: 1 }).limit(2);
    return facilities;
  };

  const ensureCustomers = async () => {
    let customers = await Customer.find({}).sort({ createdAt: 1 }).limit(2);
    const missing = 2 - customers.length;

    const customerSeedData = [
      { code: `${ctx.seedKey}-CUST-001`, name: 'Ace Sports Academy' },
      { code: `${ctx.seedKey}-CUST-002`, name: 'Blue Ribbon Club' },
    ];

    for (let index = 0; index < missing; index += 1) {
      const row = customerSeedData[index];
      await Customer.create({
        customerCode: row.code,
        name: row.name,
        accountType: index === 0 ? 'cash' : 'credit',
        creditLimit: index === 0 ? 0 : 50000,
        creditDays: index === 0 ? 0 : 15,
        outstandingBalance: 0,
        isBlocked: false,
        openingBalance: 0,
        priceOverrides: [],
        contacts: [],
        activityLog: [],
        createdBy: ctx.operatorId,
      });
    }

    customers = await Customer.find({}).sort({ createdAt: 1 }).limit(2);
    return customers;
  };

  const ensureEmployees = async () => {
    let employees = await Employee.find({ active: true }).sort({ createdAt: 1 }).limit(2);
    const missing = 2 - employees.length;

    const employeeSeedData = [
      { code: `${ctx.seedKey}-EMP-001`, name: 'Rahul Sharma', designation: 'Ground Manager', salary: 25000 },
      { code: `${ctx.seedKey}-EMP-002`, name: 'Priya Nair', designation: 'Front Desk Executive', salary: 22000 },
    ];

    for (let index = 0; index < missing; index += 1) {
      const row = employeeSeedData[index];
      await Employee.create({
        employeeCode: row.code,
        name: row.name,
        designation: row.designation,
        employmentType: 'salaried',
        monthlySalary: row.salary,
        paidLeave: true,
        active: true,
        createdBy: ctx.operatorId,
      });
    }

    employees = await Employee.find({ active: true }).sort({ createdAt: 1 }).limit(2);
    return employees;
  };

  ctx.products = await ensureProducts();
  ctx.facilities = await ensureFacilities();
  ctx.customers = await ensureCustomers();
  ctx.employees = await ensureEmployees();
};

const getAccountClosing = async (accountId: any, entryDate?: Date) => {
  const filter: Record<string, any> = { accountId };
  if (entryDate) {
    filter.entryDate = { $lte: entryDate };
  }

  const last = await AccountLedgerEntry.findOne(filter).sort({ entryDate: -1, createdAt: -1, _id: -1 });
  return Number(last?.runningBalance || 0);
};

const postLedgerEntry = async (input: {
  accountId: any;
  relatedAccountId?: any;
  entryDate: Date;
  voucherType: 'opening' | 'expense' | 'income' | 'salary' | 'contract' | 'receipt' | 'payment' | 'journal' | 'transfer' | 'adjustment';
  voucherNumber?: string;
  referenceNo?: string;
  narration?: string;
  paymentMode?: 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer' | 'adjustment';
  debit?: number;
  credit?: number;
  createdBy?: string;
  metadata?: Record<string, any>;
}) => {
  const debit = round2(Number(input.debit || 0));
  const credit = round2(Number(input.credit || 0));
  const runningBalance = round2((await getAccountClosing(input.accountId, input.entryDate)) + debit - credit);

  return AccountLedgerEntry.create({
    accountId: input.accountId,
    relatedAccountId: input.relatedAccountId,
    entryDate: input.entryDate,
    voucherType: input.voucherType,
    voucherNumber: input.voucherNumber,
    referenceNo: input.referenceNo,
    narration: input.narration,
    paymentMode: input.paymentMode,
    debit,
    credit,
    runningBalance,
    createdBy: input.createdBy,
    metadata: input.metadata,
  });
};

const createJournal = async (
  ctx: SeedContext,
  input: {
    entryDate: Date;
    referenceType: 'manual' | 'invoice' | 'payment' | 'expense' | 'refund' | 'booking' | 'event_booking' | 'depreciation' | 'opening' | 'reversal';
    ledgerVoucherType: 'opening' | 'expense' | 'income' | 'salary' | 'contract' | 'receipt' | 'payment' | 'journal' | 'transfer' | 'adjustment';
    referenceId?: string;
    referenceNo?: string;
    description: string;
    paymentMode?: 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer' | 'adjustment';
    lines: Array<{ account: any; debit: number; credit: number; description?: string }>;
    metadata?: Record<string, any>;
  }
) => {
  const totalDebit = round2(input.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const totalCredit = round2(input.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error(`Journal ${input.description} is not balanced`);
  }

  const entryNumber = nextNumber(ctx, 'JE');
  const entry = await JournalEntry.create({
    entryNumber,
    entryDate: input.entryDate,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNo: input.referenceNo,
    description: input.description,
    status: 'posted',
    totalDebit,
    totalCredit,
    createdBy: ctx.operatorId,
    metadata: { seeded: true, ...input.metadata },
  });

  await JournalLine.insertMany(
    input.lines.map((line, index) => ({
      journalId: entry._id,
      entryDate: input.entryDate,
      lineNumber: index + 1,
      accountId: line.account._id,
      accountCode: line.account.accountCode,
      accountName: line.account.accountName,
      description: line.description || input.description,
      debitAmount: round2(line.debit),
      creditAmount: round2(line.credit),
    }))
  );

  for (const line of input.lines) {
    const related = input.lines.find((candidate) => String(candidate.account._id) !== String(line.account._id));
    await postLedgerEntry({
      accountId: line.account._id,
      relatedAccountId: related?.account?._id,
      entryDate: input.entryDate,
      voucherType: input.ledgerVoucherType,
      voucherNumber: entryNumber,
      referenceNo: input.referenceNo,
      narration: line.description || input.description,
      paymentMode: input.paymentMode,
      debit: line.debit,
      credit: line.credit,
      createdBy: ctx.operatorId,
      metadata: { seeded: true, journalEntryId: entry._id.toString(), ...input.metadata },
    });
  }

  return entry;
};

const createAccountingInvoiceSeed = async (
  ctx: SeedContext,
  input: {
    invoiceDate: Date;
    customerId?: string;
    customerName: string;
    referenceType: 'manual' | 'sale' | 'facility_booking' | 'event_booking' | 'expense';
    referenceId?: string;
    description: string;
    baseAmount: number;
    gstRate: number;
    gstTreatment: 'none' | 'intrastate' | 'interstate';
    paymentAmount?: number;
    paymentMode?: 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
    revenueKey: string;
  }
) => {
  const revenueAccount = ctx.accounts.get(input.revenueKey);
  const receivableAccount = ctx.accounts.get('accounts_receivable');
  const cashAccount = ctx.accounts.get(paymentModeToAccountKey(input.paymentMode || 'cash'));
  const gst = buildGst(input.baseAmount, input.gstRate, input.gstTreatment);
  const paidAmount = round2(Math.min(Number(input.paymentAmount || 0), gst.totalAmount));
  const invoiceNumber = nextNumber(ctx, 'AINV');

  const invoiceLines: Array<{ account: any; debit: number; credit: number; description?: string }> = [];
  if (paidAmount >= gst.totalAmount) {
    invoiceLines.push({
      account: cashAccount,
      debit: gst.totalAmount,
      credit: 0,
      description: 'Customer payment received',
    });
  } else {
    invoiceLines.push({
      account: receivableAccount,
      debit: gst.totalAmount,
      credit: 0,
      description: 'Raise receivable',
    });
  }

  invoiceLines.push({
    account: revenueAccount,
    debit: 0,
    credit: gst.baseAmount,
    description: 'Recognize revenue',
  });

  if (gst.cgstAmount > 0) {
    invoiceLines.push({
      account: ctx.accounts.get('cgst_payable'),
      debit: 0,
      credit: gst.cgstAmount,
      description: 'CGST payable',
    });
  }

  if (gst.sgstAmount > 0) {
    invoiceLines.push({
      account: ctx.accounts.get('sgst_payable'),
      debit: 0,
      credit: gst.sgstAmount,
      description: 'SGST payable',
    });
  }

  if (gst.igstAmount > 0) {
    invoiceLines.push({
      account: ctx.accounts.get('igst_payable'),
      debit: 0,
      credit: gst.igstAmount,
      description: 'IGST payable',
    });
  }

  const invoiceJournal = await createJournal(ctx, {
    entryDate: input.invoiceDate,
    referenceType: 'invoice',
    ledgerVoucherType: 'journal',
    referenceId: input.referenceId,
    referenceNo: invoiceNumber,
    description: input.description,
    paymentMode: input.paymentMode,
    metadata: { seeded: true, sourceReferenceType: input.referenceType },
    lines: invoiceLines,
  });

  const invoice = await AccountingInvoice.create({
    invoiceNumber,
    invoiceDate: input.invoiceDate,
    customerId: input.customerId,
    customerName: input.customerName,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    description: input.description,
    baseAmount: gst.baseAmount,
    gstAmount: gst.gstAmount,
    cgstAmount: gst.cgstAmount,
    sgstAmount: gst.sgstAmount,
    igstAmount: gst.igstAmount,
    totalAmount: gst.totalAmount,
    paidAmount: paidAmount >= gst.totalAmount ? gst.totalAmount : 0,
    balanceAmount: paidAmount >= gst.totalAmount ? 0 : gst.totalAmount,
    status: paidAmount >= gst.totalAmount ? 'paid' : 'posted',
    gstTreatment: input.gstTreatment,
    revenueAccountId: revenueAccount._id,
    journalEntryId: invoiceJournal._id,
    createdBy: ctx.operatorId,
    metadata: { seeded: true },
  });

  if (paidAmount >= gst.totalAmount) {
    await AccountingPayment.create({
      paymentNumber: nextNumber(ctx, 'PAY'),
      paymentDate: input.invoiceDate,
      amount: gst.totalAmount,
      mode: input.paymentMode || 'cash',
      invoiceId: invoice._id,
      customerId: input.customerId,
      customerName: input.customerName,
      description: `Immediate settlement for ${invoiceNumber}`,
      journalEntryId: invoiceJournal._id,
      status: 'posted',
      createdBy: ctx.operatorId,
      metadata: { seeded: true, embeddedInInvoiceEntry: true },
    });
    return invoice;
  }

  if (paidAmount > 0) {
    const paymentJournal = await createJournal(ctx, {
      entryDate: input.invoiceDate,
      referenceType: 'payment',
      ledgerVoucherType: 'receipt',
      referenceId: invoice._id.toString(),
      referenceNo: invoiceNumber,
      description: `Partial payment for ${invoiceNumber}`,
      paymentMode: input.paymentMode,
      metadata: { seeded: true, sourceReferenceType: input.referenceType },
      lines: [
        {
          account: cashAccount,
          debit: paidAmount,
          credit: 0,
          description: 'Partial payment received',
        },
        {
          account: receivableAccount,
          debit: 0,
          credit: paidAmount,
          description: 'Reduce receivable',
        },
      ],
    });

    await AccountingPayment.create({
      paymentNumber: nextNumber(ctx, 'PAY'),
      paymentDate: input.invoiceDate,
      amount: paidAmount,
      mode: input.paymentMode || 'cash',
      invoiceId: invoice._id,
      customerId: input.customerId,
      customerName: input.customerName,
      description: `Partial payment for ${invoiceNumber}`,
      journalEntryId: paymentJournal._id,
      status: 'posted',
      createdBy: ctx.operatorId,
      metadata: { seeded: true },
    });

    invoice.paidAmount = paidAmount;
    invoice.balanceAmount = round2(gst.totalAmount - paidAmount);
    invoice.status = invoice.balanceAmount > 0 ? 'partial' : 'paid';
    await invoice.save();
  }

  return invoice;
};

const createVendorSeed = async (ctx: SeedContext, input: { name: string; contact: string; phone: string; code: string }) => {
  let ledgerAccount =
    (await ChartAccount.findOne({ accountCode: input.code }))
    || (await ChartAccount.findOne({ accountName: { $regex: `^${escapeRegex(`Vendor - ${input.name}`)}$`, $options: 'i' } }));

  if (!ledgerAccount) {
    ledgerAccount = await ChartAccount.create({
      accountCode: input.code,
      accountName: `Vendor - ${input.name}`,
      accountType: 'liability',
      subType: 'supplier',
      openingBalance: 0,
      openingSide: 'credit',
      isSystem: false,
      isActive: true,
      createdBy: ctx.operatorId,
    });
  }

  const vendor = await Vendor.create({
    name: input.name,
    contact: input.contact,
    phone: input.phone,
    ledgerAccountId: ledgerAccount._id,
    isActive: true,
    createdBy: ctx.operatorId,
  });

  return { vendor, ledgerAccount };
};

const seedOpeningBalances = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const openingDate = buildMonthDate(year, monthZeroBased, 1, 8, 0);
  const openingVoucher = nextNumber(ctx, 'OB');

  const createPartyAccount = async (code: string, name: string, accountType: 'asset' | 'liability', subType: 'customer' | 'supplier') => {
    let account = await ChartAccount.findOne({ accountCode: code });
    if (!account) {
      account = await ChartAccount.create({
        accountCode: code,
        accountName: name,
        accountType,
        subType,
        openingBalance: 0,
        openingSide: accountType === 'liability' ? 'credit' : 'debit',
        isSystem: false,
        isActive: true,
        createdBy: ctx.operatorId,
      });
    }
    return account;
  };

  const customerOne = await createPartyAccount('CUSOB-001', `Customer - ${ctx.customers[0].name}`, 'asset', 'customer');
  const customerTwo = await createPartyAccount('CUSOB-002', `Customer - ${ctx.customers[1].name}`, 'asset', 'customer');
  const supplierOne = await createPartyAccount('SUPOB-001', 'Supplier - Seed Electricals', 'liability', 'supplier');
  const supplierTwo = await createPartyAccount('SUPOB-002', 'Supplier - Seed Housekeeping', 'liability', 'supplier');

  const openingRows = [
    { account: ctx.accounts.get('cash_in_hand'), amount: 45000, side: 'debit', narration: 'Opening balance - Cash' },
    { account: ctx.accounts.get('bank_account'), amount: 120000, side: 'debit', narration: 'Opening balance - Bank' },
    { account: ctx.accounts.get('stock_opening'), amount: 75000, side: 'debit', narration: 'Opening balance - Stock' },
    { account: customerOne, amount: 8000, side: 'debit', narration: `Opening balance - ${customerOne.accountName}` },
    { account: customerTwo, amount: 5500, side: 'debit', narration: `Opening balance - ${customerTwo.accountName}` },
    { account: supplierOne, amount: 6000, side: 'credit', narration: `Opening balance - ${supplierOne.accountName}` },
    { account: supplierTwo, amount: 4200, side: 'credit', narration: `Opening balance - ${supplierTwo.accountName}` },
  ] as const;

  for (const row of openingRows) {
    row.account.openingBalance = row.amount;
    row.account.openingSide = row.side;
    await row.account.save();
    await postLedgerEntry({
      accountId: row.account._id,
      entryDate: openingDate,
      voucherType: 'opening',
      voucherNumber: openingVoucher,
      narration: row.narration,
      paymentMode: 'adjustment',
      debit: row.side === 'debit' ? row.amount : 0,
      credit: row.side === 'credit' ? row.amount : 0,
      createdBy: ctx.operatorId,
      metadata: { seeded: true, source: 'opening_balance' },
    });
  }

  await OpeningBalanceSetup.create({
    setupKey: 'primary',
    isLocked: false,
    initializedAt: openingDate,
    initializedBy: ctx.operatorId,
  });
};

const seedSalesAndOrders = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const saleOneDate = buildMonthDate(year, monthZeroBased, 5, 11, 30);
  const saleTwoDate = buildMonthDate(year, monthZeroBased, 6, 12, 15);
  const [productOne, productTwo] = ctx.products;
  const [customerOne, customerTwo] = ctx.customers;

  await Order.create({
    orderNumber: nextNumber(ctx, 'ORD'),
    userId: new mongoose.Types.ObjectId(ctx.operatorId),
    items: [{ productId: productOne._id, quantity: 2, price: 250, gstAmount: 90 }],
    totalAmount: 590,
    gstAmount: 90,
    paymentMethod: 'cash',
    paymentStatus: 'completed',
    orderStatus: 'completed',
    notes: 'Seed order - paid at counter',
  });

  await Order.create({
    orderNumber: nextNumber(ctx, 'ORD'),
    userId: new mongoose.Types.ObjectId(ctx.operatorId),
    items: [{ productId: productTwo._id, quantity: 1, price: 300, gstAmount: 54 }],
    totalAmount: 354,
    gstAmount: 54,
    paymentMethod: 'upi',
    paymentStatus: 'pending',
    orderStatus: 'completed',
    notes: 'Seed order - part payment pending',
  });

  const saleOne = await Sale.create({
    saleNumber: nextNumber(ctx, 'SAL'),
    invoiceNumber: nextNumber(ctx, 'SINV'),
    userId: ctx.operatorId,
    invoiceType: 'cash',
    invoiceStatus: 'posted',
    isLocked: true,
    pricingMode: 'retail',
    taxMode: 'exclusive',
    isGstBill: true,
    items: [
      {
        productId: productOne._id.toString(),
        productName: productOne.name,
        sku: productOne.sku,
        itemType: productOne.itemType,
        quantity: 2,
        unitPrice: 250,
        taxableValue: 500,
        gstRate: 18,
        gstAmount: 90,
        cgstAmount: 45,
        sgstAmount: 45,
        lineTotal: 590,
      },
    ],
    subtotal: 500,
    totalGst: 90,
    grossTotal: 590,
    totalAmount: 590,
    paymentMethod: 'cash',
    paymentStatus: 'completed',
    saleStatus: 'completed',
    outstandingAmount: 0,
    customerId: customerOne._id.toString(),
    customerCode: customerOne.customerCode,
    customerName: customerOne.name,
    postedAt: saleOneDate,
    postedBy: ctx.operatorId,
    notes: 'Seed cash sale',
  });

  const saleTwo = await Sale.create({
    saleNumber: nextNumber(ctx, 'SAL'),
    invoiceNumber: nextNumber(ctx, 'SINV'),
    userId: ctx.operatorId,
    invoiceType: 'credit',
    invoiceStatus: 'posted',
    isLocked: true,
    pricingMode: 'retail',
    taxMode: 'exclusive',
    isGstBill: true,
    items: [
      {
        productId: productTwo._id.toString(),
        productName: productTwo.name,
        sku: productTwo.sku,
        itemType: productTwo.itemType,
        quantity: 1,
        unitPrice: 300,
        taxableValue: 300,
        gstRate: 18,
        gstAmount: 54,
        cgstAmount: 27,
        sgstAmount: 27,
        lineTotal: 354,
      },
    ],
    subtotal: 300,
    totalGst: 54,
    grossTotal: 354,
    totalAmount: 354,
    paymentMethod: 'upi',
    paymentStatus: 'pending',
    saleStatus: 'completed',
    outstandingAmount: 204,
    dueDate: buildMonthDate(year, monthZeroBased, 15, 18, 0),
    customerId: customerTwo._id.toString(),
    customerCode: customerTwo.customerCode,
    customerName: customerTwo.name,
    postedAt: saleTwoDate,
    postedBy: ctx.operatorId,
    notes: 'Seed credit sale with partial collection',
  });

  await createAccountingInvoiceSeed(ctx, {
    invoiceDate: saleOneDate,
    customerId: customerOne._id.toString(),
    customerName: customerOne.name,
    referenceType: 'sale',
    referenceId: saleOne._id.toString(),
    description: `Sale invoice for ${saleOne.saleNumber}`,
    baseAmount: 500,
    gstRate: 18,
    gstTreatment: 'intrastate',
    paymentAmount: 590,
    paymentMode: 'cash',
    revenueKey: 'sales_revenue',
  });

  await createAccountingInvoiceSeed(ctx, {
    invoiceDate: saleTwoDate,
    customerId: customerTwo._id.toString(),
    customerName: customerTwo.name,
    referenceType: 'sale',
    referenceId: saleTwo._id.toString(),
    description: `Sale invoice for ${saleTwo.saleNumber}`,
    baseAmount: 300,
    gstRate: 18,
    gstTreatment: 'intrastate',
    paymentAmount: 150,
    paymentMode: 'upi',
    revenueKey: 'sales_revenue',
  });
};

const seedBookings = async (ctx: SeedContext, today: Date, year: number, monthZeroBased: number) => {
  const [facilityOne, facilityTwo] = ctx.facilities;
  const [customerOne, customerTwo] = ctx.customers;

  const bookingOneStart = new Date(today);
  bookingOneStart.setDate(today.getDate() + 1);
  bookingOneStart.setHours(18, 0, 0, 0);
  const bookingOneEnd = new Date(bookingOneStart);
  bookingOneEnd.setHours(20, 0, 0, 0);

  const bookingTwoStart = new Date(today);
  bookingTwoStart.setDate(today.getDate() + 2);
  bookingTwoStart.setHours(19, 0, 0, 0);
  const bookingTwoEnd = new Date(bookingTwoStart);
  bookingTwoEnd.setHours(21, 0, 0, 0);

  const bookingOne = await FacilityBooking.create({
    bookingNumber: nextNumber(ctx, 'FBK'),
    facilityId: facilityOne._id,
    customerId: customerOne._id,
    customerName: customerOne.name,
    startTime: bookingOneStart,
    endTime: bookingOneEnd,
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentMethod: 'bank_transfer',
    bookedUnits: 2,
    amount: 2360,
    totalAmount: 2360,
    gstAmount: 360,
    gstTreatment: 'intrastate',
    advanceAmount: 2360,
    paidAmount: 2360,
    balanceAmount: 0,
    cancellationCharge: 0,
    refundAmount: 0,
    notes: 'Seed fully paid turf booking',
    createdBy: ctx.operatorId,
  });

  const bookingTwo = await FacilityBooking.create({
    bookingNumber: nextNumber(ctx, 'FBK'),
    facilityId: facilityTwo._id,
    customerId: customerTwo._id,
    customerName: customerTwo.name,
    startTime: bookingTwoStart,
    endTime: bookingTwoEnd,
    status: 'booked',
    paymentStatus: 'partial',
    paymentMethod: 'cash',
    bookedUnits: 2,
    amount: 1770,
    totalAmount: 1770,
    gstAmount: 270,
    gstTreatment: 'intrastate',
    advanceAmount: 500,
    paidAmount: 500,
    balanceAmount: 1270,
    cancellationCharge: 0,
    refundAmount: 0,
    notes: 'Seed partial badminton booking',
    createdBy: ctx.operatorId,
  });

  await createAccountingInvoiceSeed(ctx, {
    invoiceDate: buildMonthDate(year, monthZeroBased, 5, 15, 0),
    customerId: customerOne._id.toString(),
    customerName: customerOne.name,
    referenceType: 'facility_booking',
    referenceId: bookingOne._id.toString(),
    description: `Facility booking ${bookingOne.bookingNumber}`,
    baseAmount: 2000,
    gstRate: 18,
    gstTreatment: 'intrastate',
    paymentAmount: 2360,
    paymentMode: 'bank_transfer',
    revenueKey: 'booking_revenue',
  });

  await createAccountingInvoiceSeed(ctx, {
    invoiceDate: buildMonthDate(year, monthZeroBased, 6, 16, 0),
    customerId: customerTwo._id.toString(),
    customerName: customerTwo.name,
    referenceType: 'facility_booking',
    referenceId: bookingTwo._id.toString(),
    description: `Facility booking ${bookingTwo.bookingNumber}`,
    baseAmount: 1500,
    gstRate: 18,
    gstTreatment: 'intrastate',
    paymentAmount: 500,
    paymentMode: 'cash',
    revenueKey: 'booking_revenue',
  });

  const eventOneStart = new Date(today);
  eventOneStart.setDate(today.getDate() + 6);
  eventOneStart.setHours(9, 0, 0, 0);
  const eventOneEnd = new Date(eventOneStart);
  eventOneEnd.setHours(15, 0, 0, 0);

  const eventTwoStart = new Date(today);
  eventTwoStart.setDate(today.getDate() + 12);
  eventTwoStart.setHours(8, 0, 0, 0);
  const eventTwoEnd = new Date(eventTwoStart);
  eventTwoEnd.setHours(18, 0, 0, 0);

  const eventOne = await EventBooking.create({
    eventNumber: nextNumber(ctx, 'EVT'),
    eventName: 'Interstate Football Clinic',
    organizerName: 'Ace Sports Academy',
    organizationName: 'Ace Sports Academy',
    facilityIds: [facilityOne._id],
    startTime: eventOneStart,
    endTime: eventOneEnd,
    status: 'confirmed',
    paymentStatus: 'partial',
    paymentMethod: 'bank_transfer',
    totalAmount: 4720,
    gstAmount: 720,
    gstTreatment: 'interstate',
    advanceAmount: 2000,
    paidAmount: 2000,
    balanceAmount: 2720,
    payments: [
      {
        receiptNumber: nextNumber(ctx, 'EVR'),
        amount: 2000,
        paymentMethod: 'bank_transfer',
        paidAt: buildMonthDate(year, monthZeroBased, 5, 17, 0),
        remarks: 'Advance collected for clinic',
        receivedBy: ctx.operatorEmail,
      },
    ],
    cancellationCharge: 0,
    refundAmount: 0,
    remarks: 'Seed event booking with outstanding balance',
    createdBy: ctx.operatorId,
  });

  const eventTwo = await EventBooking.create({
    eventNumber: nextNumber(ctx, 'EVT'),
    eventName: 'Summer Sports Festival',
    organizerName: 'Blue Ribbon Club',
    organizationName: 'Blue Ribbon Club',
    facilityIds: [facilityOne._id, facilityTwo._id],
    startTime: eventTwoStart,
    endTime: eventTwoEnd,
    status: 'confirmed',
    paymentStatus: 'paid',
    paymentMethod: 'online',
    totalAmount: 7080,
    gstAmount: 1080,
    gstTreatment: 'intrastate',
    advanceAmount: 7080,
    paidAmount: 7080,
    balanceAmount: 0,
    payments: [
      {
        receiptNumber: nextNumber(ctx, 'EVR'),
        amount: 7080,
        paymentMethod: 'online',
        paidAt: buildMonthDate(year, monthZeroBased, 6, 10, 30),
        remarks: 'Full payment collected online',
        receivedBy: ctx.operatorEmail,
      },
    ],
    cancellationCharge: 0,
    refundAmount: 0,
    remarks: 'Seed fully paid event booking',
    createdBy: ctx.operatorId,
  });

  await createAccountingInvoiceSeed(ctx, {
    invoiceDate: buildMonthDate(year, monthZeroBased, 5, 17, 0),
    customerId: customerOne._id.toString(),
    customerName: customerOne.name,
    referenceType: 'event_booking',
    referenceId: eventOne._id.toString(),
    description: `Event booking ${eventOne.eventNumber}`,
    baseAmount: 4000,
    gstRate: 18,
    gstTreatment: 'interstate',
    paymentAmount: 2000,
    paymentMode: 'bank_transfer',
    revenueKey: 'event_revenue',
  });

  await createAccountingInvoiceSeed(ctx, {
    invoiceDate: buildMonthDate(year, monthZeroBased, 6, 10, 30),
    customerId: customerTwo._id.toString(),
    customerName: customerTwo.name,
    referenceType: 'event_booking',
    referenceId: eventTwo._id.toString(),
    description: `Event booking ${eventTwo.eventNumber}`,
    baseAmount: 6000,
    gstRate: 18,
    gstTreatment: 'intrastate',
    paymentAmount: 7080,
    paymentMode: 'online',
    revenueKey: 'event_revenue',
  });
};

const seedSalaryPayments = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const monthKey = `${year}-${String(monthZeroBased + 1).padStart(2, '0')}`;
  const [employeeOne, employeeTwo] = ctx.employees;
  const salaryRows = [
    { employee: employeeOne, amount: 25000, payDate: buildMonthDate(year, monthZeroBased, 4, 16, 30), mode: 'bank' as const },
    { employee: employeeTwo, amount: 22000, payDate: buildMonthDate(year, monthZeroBased, 5, 16, 45), mode: 'bank' as const },
  ];

  for (const row of salaryRows) {
    await SalaryPayment.create({
      employeeId: row.employee._id,
      employeeName: row.employee.name,
      designation: row.employee.designation,
      month: monthKey,
      payDate: row.payDate,
      amount: row.amount,
      paymentMethod: row.mode,
      notes: 'Seed salary payout',
      createdBy: ctx.operatorId,
    });

    await createJournal(ctx, {
      entryDate: row.payDate,
      referenceType: 'expense',
      ledgerVoucherType: 'salary',
      description: `Salary paid - ${row.employee.name}`,
      paymentMode: row.mode,
      metadata: { seeded: true, module: 'salary' },
      lines: [
        { account: ctx.accounts.get('salary_expense'), debit: row.amount, credit: 0, description: 'Salary expense' },
        { account: ctx.accounts.get('bank_account'), debit: 0, credit: row.amount, description: 'Salary paid through bank' },
      ],
    });
  }
};

const seedContractPayments = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const rows = [
    {
      contractorName: 'Green Field Maintenance',
      contractTitle: 'Weekly turf maintenance',
      paymentDate: buildMonthDate(year, monthZeroBased, 4, 17, 30),
      amount: 6500,
      paymentMethod: 'bank' as const,
    },
    {
      contractorName: 'Prime Coaching Associates',
      contractTitle: 'Weekend coaching support',
      paymentDate: buildMonthDate(year, monthZeroBased, 6, 11, 0),
      amount: 7200,
      paymentMethod: 'upi' as const,
    },
  ];

  for (const row of rows) {
    await ContractPayment.create({
      contractorName: row.contractorName,
      contractTitle: row.contractTitle,
      paymentDate: row.paymentDate,
      amount: row.amount,
      status: 'paid',
      paymentMethod: row.paymentMethod,
      notes: 'Seed contractor payout',
      createdBy: ctx.operatorId,
    });

    await createJournal(ctx, {
      entryDate: row.paymentDate,
      referenceType: 'expense',
      ledgerVoucherType: 'contract',
      description: `${row.contractTitle} payment`,
      paymentMode: row.paymentMethod === 'upi' ? 'upi' : 'bank',
      metadata: { seeded: true, module: 'contract' },
      lines: [
        { account: ctx.accounts.get('contract_expense'), debit: row.amount, credit: 0, description: 'Contract expense' },
        {
          account: ctx.accounts.get(paymentModeToAccountKey(row.paymentMethod)),
          debit: 0,
          credit: row.amount,
          description: 'Contract payment settled',
        },
      ],
    });
  }
};

const seedDayBookEntries = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const incomeDate = buildMonthDate(year, monthZeroBased, 5, 13, 0);
  const expenseDate = buildMonthDate(year, monthZeroBased, 6, 14, 30);

  await DayBookEntry.create({
    entryType: 'income',
    category: 'Misc Income',
    amount: 1800,
    paymentMethod: 'cash',
    narration: 'Academy practice session usage',
    referenceNo: nextNumber(ctx, 'DBI'),
    entryDate: incomeDate,
    status: 'active',
    createdBy: ctx.operatorId,
  });

  await createJournal(ctx, {
    entryDate: incomeDate,
    referenceType: 'manual',
    ledgerVoucherType: 'income',
    description: 'Day book income - Academy practice session usage',
    paymentMode: 'cash',
    metadata: { seeded: true, module: 'day_book' },
    lines: [
      { account: ctx.accounts.get('cash_in_hand'), debit: 1800, credit: 0, description: 'Cash received' },
      { account: ctx.accounts.get('other_income'), debit: 0, credit: 1800, description: 'Misc income booked' },
    ],
  });

  await DayBookEntry.create({
    entryType: 'expense',
    category: 'Petty Expense',
    amount: 950,
    paymentMethod: 'cash',
    narration: 'Refreshments for operations team',
    referenceNo: nextNumber(ctx, 'DBE'),
    entryDate: expenseDate,
    status: 'active',
    createdBy: ctx.operatorId,
  });

  await createJournal(ctx, {
    entryDate: expenseDate,
    referenceType: 'manual',
    ledgerVoucherType: 'expense',
    description: 'Day book expense - Refreshments for operations team',
    paymentMode: 'cash',
    metadata: { seeded: true, module: 'day_book' },
    lines: [
      { account: ctx.accounts.get('general_expense'), debit: 950, credit: 0, description: 'Petty expense booked' },
      { account: ctx.accounts.get('cash_in_hand'), debit: 0, credit: 950, description: 'Cash paid' },
    ],
  });
};

const seedLegacyVouchers = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const receiptVoucherNumber = nextNumber(ctx, 'VRC');
  const paymentVoucherNumber = nextNumber(ctx, 'VPM');

  const receiptDate = buildMonthDate(year, monthZeroBased, 5, 18, 0);
  const paymentDate = buildMonthDate(year, monthZeroBased, 6, 18, 15);

  const receiptLines = [
    { account: ctx.accounts.get('cash_in_hand'), debit: 2200, credit: 0, narration: 'Sponsor cash received' },
    { account: ctx.accounts.get('other_income'), debit: 0, credit: 2200, narration: 'Sponsor contribution' },
  ];

  await AccountingVoucher.create({
    voucherNumber: receiptVoucherNumber,
    voucherType: 'receipt',
    voucherDate: receiptDate,
    paymentMode: 'cash',
    referenceNo: nextNumber(ctx, 'REF'),
    counterpartyName: 'Seed Local Sponsor',
    notes: 'Seed receipt voucher',
    totalAmount: 2200,
    lines: receiptLines.map((line) => ({
      accountId: line.account._id,
      accountCode: line.account.accountCode,
      accountName: line.account.accountName,
      debit: line.debit,
      credit: line.credit,
      narration: line.narration,
    })),
    isPrinted: false,
    createdBy: ctx.operatorId,
  });

  for (const line of receiptLines) {
    await postLedgerEntry({
      accountId: line.account._id,
      entryDate: receiptDate,
      voucherType: 'receipt',
      voucherNumber: receiptVoucherNumber,
      narration: line.narration,
      paymentMode: 'cash',
      debit: line.debit,
      credit: line.credit,
      createdBy: ctx.operatorId,
      metadata: { seeded: true, source: 'legacy_voucher' },
    });
  }

  const paymentLines = [
    { account: ctx.accounts.get('general_expense'), debit: 1400, credit: 0, narration: 'Minor maintenance expense' },
    { account: ctx.accounts.get('bank_account'), debit: 0, credit: 1400, narration: 'Bank payment issued' },
  ];

  await AccountingVoucher.create({
    voucherNumber: paymentVoucherNumber,
    voucherType: 'payment',
    voucherDate: paymentDate,
    paymentMode: 'bank',
    referenceNo: nextNumber(ctx, 'REF'),
    counterpartyName: 'Seed Maintenance Vendor',
    notes: 'Seed payment voucher',
    totalAmount: 1400,
    lines: paymentLines.map((line) => ({
      accountId: line.account._id,
      accountCode: line.account.accountCode,
      accountName: line.account.accountName,
      debit: line.debit,
      credit: line.credit,
      narration: line.narration,
    })),
    isPrinted: false,
    createdBy: ctx.operatorId,
  });

  for (const line of paymentLines) {
    await postLedgerEntry({
      accountId: line.account._id,
      entryDate: paymentDate,
      voucherType: 'payment',
      voucherNumber: paymentVoucherNumber,
      narration: line.narration,
      paymentMode: 'bank',
      debit: line.debit,
      credit: line.credit,
      createdBy: ctx.operatorId,
      metadata: { seeded: true, source: 'legacy_voucher' },
    });
  }
};

const seedVendorsAndExpenses = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const vendorOne = await createVendorSeed(ctx, {
    name: 'Apex Sports Supplies',
    contact: 'Karan Mehta',
    phone: '9876543210',
    code: 'VEND-001',
  });

  const vendorTwo = await createVendorSeed(ctx, {
    name: 'Urban Utility Services',
    contact: 'Anita Joseph',
    phone: '9876501234',
    code: 'VEND-002',
  });

  const expenseOneDate = buildMonthDate(year, monthZeroBased, 3, 11, 0);
  const expenseTwoDate = buildMonthDate(year, monthZeroBased, 4, 11, 30);
  const paymentOneDate = buildMonthDate(year, monthZeroBased, 3, 16, 0);
  const paymentTwoDate = buildMonthDate(year, monthZeroBased, 5, 12, 0);

  await createJournal(ctx, {
    entryDate: expenseOneDate,
    referenceType: 'expense',
    ledgerVoucherType: 'expense',
    description: 'Purchase of sports consumables',
    paymentMode: 'bank',
    metadata: { seeded: true, module: 'vendor' },
    lines: [
      { account: ctx.accounts.get('general_expense'), debit: 8500, credit: 0, description: 'Consumable expense' },
      { account: vendorOne.ledgerAccount, debit: 0, credit: 8500, description: 'Amount payable to vendor' },
    ],
  });

  const vendorOnePaymentJournal = await createJournal(ctx, {
    entryDate: paymentOneDate,
    referenceType: 'payment',
    ledgerVoucherType: 'payment',
    description: 'Payment to Apex Sports Supplies',
    paymentMode: 'bank',
    metadata: { seeded: true, module: 'vendor' },
    lines: [
      { account: vendorOne.ledgerAccount, debit: 8500, credit: 0, description: 'Clear vendor payable' },
      { account: ctx.accounts.get('bank_account'), debit: 0, credit: 8500, description: 'Bank payment made' },
    ],
  });

  await AccountingPayment.create({
    paymentNumber: nextNumber(ctx, 'PAY'),
    paymentDate: paymentOneDate,
    amount: 8500,
    mode: 'bank',
    vendorId: vendorOne.vendor._id,
    description: 'Full settlement for sports consumables',
    journalEntryId: vendorOnePaymentJournal._id,
    status: 'posted',
    createdBy: ctx.operatorId,
    metadata: { seeded: true, vendorName: vendorOne.vendor.name },
  });

  await createJournal(ctx, {
    entryDate: expenseTwoDate,
    referenceType: 'expense',
    ledgerVoucherType: 'expense',
    description: 'Facility utility services',
    paymentMode: 'bank',
    metadata: { seeded: true, module: 'vendor' },
    lines: [
      { account: ctx.accounts.get('general_expense'), debit: 6200, credit: 0, description: 'Utility expense' },
      { account: vendorTwo.ledgerAccount, debit: 0, credit: 6200, description: 'Amount payable to vendor' },
    ],
  });

  const vendorTwoPaymentJournal = await createJournal(ctx, {
    entryDate: paymentTwoDate,
    referenceType: 'payment',
    ledgerVoucherType: 'payment',
    description: 'Part payment to Urban Utility Services',
    paymentMode: 'cash',
    metadata: { seeded: true, module: 'vendor' },
    lines: [
      { account: vendorTwo.ledgerAccount, debit: 2500, credit: 0, description: 'Reduce vendor payable' },
      { account: ctx.accounts.get('cash_in_hand'), debit: 0, credit: 2500, description: 'Cash paid to vendor' },
    ],
  });

  await AccountingPayment.create({
    paymentNumber: nextNumber(ctx, 'PAY'),
    paymentDate: paymentTwoDate,
    amount: 2500,
    mode: 'cash',
    vendorId: vendorTwo.vendor._id,
    description: 'Part payment for utility services',
    journalEntryId: vendorTwoPaymentJournal._id,
    status: 'posted',
    createdBy: ctx.operatorId,
    metadata: { seeded: true, vendorName: vendorTwo.vendor.name },
  });
};

const seedFixedAssets = async (ctx: SeedContext, year: number, monthZeroBased: number) => {
  const assetRows = [
    { assetName: 'LED Flood Light Set', cost: 120000, lifeYears: 5, purchaseDate: buildMonthDate(year, monthZeroBased, 1, 10, 30) },
    { assetName: 'Gym Treadmill', cost: 90000, lifeYears: 6, purchaseDate: buildMonthDate(year, monthZeroBased, 2, 10, 0) },
  ];

  for (const row of assetRows) {
    await createJournal(ctx, {
      entryDate: row.purchaseDate,
      referenceType: 'manual',
      ledgerVoucherType: 'payment',
      description: `Asset purchase - ${row.assetName}`,
      paymentMode: 'bank',
      metadata: { seeded: true, module: 'asset_purchase' },
      lines: [
        { account: ctx.accounts.get('fixed_assets'), debit: row.cost, credit: 0, description: 'Asset capitalization' },
        { account: ctx.accounts.get('bank_account'), debit: 0, credit: row.cost, description: 'Bank paid for asset' },
      ],
    });

    const asset = await FixedAsset.create({
      assetName: row.assetName,
      description: 'Seed fixed asset for accounting validation',
      cost: row.cost,
      lifeYears: row.lifeYears,
      purchaseDate: row.purchaseDate,
      assetAccountId: ctx.accounts.get('fixed_assets')._id,
      depreciationExpenseAccountId: ctx.accounts.get('depreciation_expense')._id,
      accumulatedDepreciationAccountId: ctx.accounts.get('accumulated_depreciation')._id,
      totalDepreciationPosted: 0,
      status: 'active',
      createdBy: ctx.operatorId,
    });

    const depreciationDate = new Date(row.purchaseDate);
    depreciationDate.setDate(depreciationDate.getDate() + 4);
    depreciationDate.setHours(18, 0, 0, 0);
    const monthlyDepreciation = round2(row.cost / (row.lifeYears * 12));

    await createJournal(ctx, {
      entryDate: depreciationDate,
      referenceType: 'depreciation',
      ledgerVoucherType: 'adjustment',
      referenceId: asset._id.toString(),
      referenceNo: asset.assetName,
      description: `Monthly depreciation - ${asset.assetName}`,
      paymentMode: 'adjustment',
      metadata: { seeded: true, module: 'depreciation' },
      lines: [
        {
          account: ctx.accounts.get('depreciation_expense'),
          debit: monthlyDepreciation,
          credit: 0,
          description: 'Depreciation expense',
        },
        {
          account: ctx.accounts.get('accumulated_depreciation'),
          debit: 0,
          credit: monthlyDepreciation,
          description: 'Accumulated depreciation',
        },
      ],
    });

    asset.totalDepreciationPosted = monthlyDepreciation;
    asset.lastDepreciationDate = depreciationDate;
    await asset.save();
  }
};

const seedFinancialPeriods = async (ctx: SeedContext, year: number) => {
  for (let month = 1; month <= 12; month += 1) {
    await FinancialPeriod.create({
      periodKey: `${year}-${String(month).padStart(2, '0')}`,
      month,
      year,
      startDate: new Date(year, month - 1, 1, 0, 0, 0, 0),
      endDate: new Date(year, month, 0, 23, 59, 59, 999),
      isLocked: false,
      createdBy: ctx.operatorId,
    });
  }
};

const summarizeCounts = async () => ({
  sales: await Sale.countDocuments(),
  orders: await Order.countDocuments(),
  facilityBookings: await FacilityBooking.countDocuments(),
  eventBookings: await EventBooking.countDocuments(),
  salaryPayments: await SalaryPayment.countDocuments(),
  contractPayments: await ContractPayment.countDocuments(),
  dayBookEntries: await DayBookEntry.countDocuments(),
  vouchers: await AccountingVoucher.countDocuments(),
  invoices: await AccountingInvoice.countDocuments(),
  payments: await AccountingPayment.countDocuments(),
  journalEntries: await JournalEntry.countDocuments(),
  journalLines: await JournalLine.countDocuments(),
  vendors: await Vendor.countDocuments(),
  fixedAssets: await FixedAsset.countDocuments(),
  periods: await FinancialPeriod.countDocuments(),
  ledgerEntries: await AccountLedgerEntry.countDocuments(),
});

const main = async () => {
  await ensureDatabaseConnection();
  const operator = await resolveOperator();
  const seedKey = `SEED-${dayStamp}-${operator.tenantId.slice(-4).toUpperCase()}`;
  const ctx: SeedContext = {
    ...operator,
    seedKey,
    sequences: new Map<string, number>(),
    accounts: new Map<string, any>(),
    products: [],
    facilities: [],
    customers: [],
    employees: [],
  };

  console.log(`Seeding tenant ${ctx.tenantId} using operator ${ctx.operatorEmail || ctx.operatorId}`);

  await runWithTenantContext(ctx.tenantId, async () => {
    const backupPath = await backupTransactions(ctx);
    console.log(`Backup created at ${backupPath}`);

    await clearTransactions();
    await resetChartAccounts(ctx);
    await ensureMasters(ctx);

    const today = new Date();
    const year = today.getFullYear();
    const monthZeroBased = today.getMonth();

    await seedOpeningBalances(ctx, year, monthZeroBased);
    await seedSalesAndOrders(ctx, year, monthZeroBased);
    await seedBookings(ctx, today, year, monthZeroBased);
    await seedSalaryPayments(ctx, year, monthZeroBased);
    await seedContractPayments(ctx, year, monthZeroBased);
    await seedDayBookEntries(ctx, year, monthZeroBased);
    await seedLegacyVouchers(ctx, year, monthZeroBased);
    await seedVendorsAndExpenses(ctx, year, monthZeroBased);
    await seedFixedAssets(ctx, year, monthZeroBased);
    await seedFinancialPeriods(ctx, year);

    const counts = await summarizeCounts();
    console.log('Seed summary:');
    console.log(JSON.stringify(counts, null, 2));
  });
};

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
