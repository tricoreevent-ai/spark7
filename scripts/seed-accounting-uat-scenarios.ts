import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';

import '../src/server/models/registerTenantPlugin.ts';

import { User } from '../src/server/models/User.ts';
import { Customer } from '../src/server/models/Customer.ts';
import { Employee } from '../src/server/models/Employee.ts';
import { Vendor } from '../src/server/models/Vendor.ts';
import { ChartAccount } from '../src/server/models/ChartAccount.ts';
import { TreasuryAccount } from '../src/server/models/TreasuryAccount.ts';
import { AccountingInvoice } from '../src/server/models/AccountingInvoice.ts';
import { AccountingVoucher } from '../src/server/models/AccountingVoucher.ts';
import { AccountLedgerEntry } from '../src/server/models/AccountLedgerEntry.ts';
import { DayBookEntry } from '../src/server/models/DayBookEntry.ts';
import { SalaryPayment } from '../src/server/models/SalaryPayment.ts';
import { ContractPayment } from '../src/server/models/ContractPayment.ts';
import { PayrollArrear } from '../src/server/models/PayrollArrear.ts';
import { FixedAsset } from '../src/server/models/FixedAsset.ts';
import { FinancialPeriod } from '../src/server/models/FinancialPeriod.ts';
import { ReceiptVoucher } from '../src/server/models/ReceiptVoucher.ts';
import { CreditNote } from '../src/server/models/CreditNote.ts';
import { Sale } from '../src/server/models/Sale.ts';
import { DayEndClosing } from '../src/server/models/DayEndClosing.ts';
import { JournalEntry } from '../src/server/models/JournalEntry.ts';

import { ensureTenantBySlug } from '../src/server/services/tenant.ts';
import { initializeTenantDefaults } from '../src/server/services/databaseBootstrap.ts';
import { runWithTenantContext } from '../src/server/services/tenantContext.ts';
import { hashPassword } from '../src/server/utils/auth.ts';
import {
  createFixedAsset,
  createInvoice,
  createJournalEntry,
  ensureAccountingChart,
  recordExpense,
  runAssetDepreciation,
} from '../src/server/services/accountingEngine.ts';
import { ensureTreasuryDefaults, importBankFeed, applyManualMatch, upsertTreasuryAccount } from '../src/server/services/treasury.ts';
import {
  recordTdsTransaction,
  recordTdsChallan,
  saveTdsCompanySettings,
  seedDefaultTdsSections,
  upsertDeducteeProfile,
} from '../src/server/services/tds.ts';

const SEED_TAG = 'ACC-UAT-20260420';
const DEFAULT_TENANT_SLUG = 'sarva-accounting-uat';
const DEFAULT_TENANT_NAME = 'Sarva Accounting UAT';
const DEFAULT_LOGIN_EMAIL = 'accounting.uat.20260420@example.com';
const DEFAULT_LOGIN_PASSWORD = 'Sarva@12345';
const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type ManifestEntry = {
  scenarioId: string;
  action: 'created' | 'existing' | 'updated' | 'skipped';
  references: string[];
  notes?: string[];
};

const manifest: ManifestEntry[] = [];

const readArg = (name: string) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
};

const TARGET_TENANT_SLUG = readArg('tenant-slug') || DEFAULT_TENANT_SLUG;
const TARGET_TENANT_NAME = readArg('tenant-name') || DEFAULT_TENANT_NAME;
const TARGET_LOGIN_EMAIL = readArg('login-email') || DEFAULT_LOGIN_EMAIL;
const TARGET_LOGIN_PASSWORD = readArg('login-password') || DEFAULT_LOGIN_PASSWORD;
const TENANT_REF_PREFIX = TARGET_TENANT_SLUG.replace(/[^a-z0-9]+/gi, '').toUpperCase() || 'TENANT';

const scopedSeedRef = (value: string) =>
  TARGET_TENANT_SLUG === DEFAULT_TENANT_SLUG ? value : `${TENANT_REF_PREFIX}-${value}`;

const round2 = (value: number) => Number(Number(value || 0).toFixed(2));

const at = (value: string) => new Date(`${value}${value.includes('T') ? '' : 'T10:00:00+05:30'}`);

const dateKey = (value: Date | string) => {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const escapeRegex = (value: string) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pushManifest = (scenarioId: string, action: ManifestEntry['action'], references: string[], notes?: string[]) => {
  manifest.push({ scenarioId, action, references, notes });
};

const setTimestamps = async (model: any, id: string, createdAt: Date, updatedAt?: Date) => {
  await model.updateOne(
    { _id: id },
    { $set: { createdAt, updatedAt: updatedAt || createdAt } },
    { timestamps: false }
  );
};

const normalizeVoucherRows = async (
  journalId: string,
  args: {
    source: string;
    sourceId: string;
    voucherType?: 'opening' | 'expense' | 'income' | 'salary' | 'contract' | 'receipt' | 'payment' | 'journal' | 'transfer' | 'adjustment';
    voucherNumber?: string;
    referenceNo?: string;
  }
) => {
  await AccountLedgerEntry.updateMany(
    { 'metadata.source': 'journal_entry', 'metadata.sourceId': journalId },
    {
      $set: {
        'metadata.source': args.source,
        'metadata.sourceId': args.sourceId,
        'metadata.originalJournalEntryId': journalId,
        ...(args.voucherType ? { voucherType: args.voucherType } : {}),
        ...(args.voucherNumber ? { voucherNumber: args.voucherNumber } : {}),
        ...(args.referenceNo ? { referenceNo: args.referenceNo } : {}),
      },
    }
  );
};

const connectDb = async () => {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 10000 });
  }
};

const initializeTenantDefaultsSafely = async (tenantId: string) => {
  try {
    await initializeTenantDefaults(tenantId);
  } catch (error: any) {
    const message = String(error?.message || '');
    const isGeneralSettingsDuplicate =
      Number(error?.code) === 11000 &&
      message.includes('general_settings');
    if (!isGeneralSettingsDuplicate) throw error;
    console.warn('initializeTenantDefaults warning: reused existing global general_settings record.');
  }
};

const computeGstinChecksum = (first14: string): string => {
  let factor = 1;
  let sum = 0;
  for (const char of String(first14 || '').toUpperCase()) {
    const codePoint = BASE36.indexOf(char);
    if (codePoint < 0) return '';
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }
  const checkCodePoint = (36 - (sum % 36)) % 36;
  return BASE36[checkCodePoint] || '';
};

const buildGstin = (stateCode: string, pan: string, entityCode = '1', defaultLetter = 'Z') => {
  const first14 = `${String(stateCode).padStart(2, '0')}${String(pan).trim().toUpperCase()}${entityCode}${defaultLetter}`;
  return `${first14}${computeGstinChecksum(first14)}`;
};

const ensureAdminUser = async (tenantId: string) => {
  const existingTenantAdmin = await User.findOne({
    tenantId,
    role: { $in: ['admin', 'super_admin'] },
  }).select('+password');
  if (existingTenantAdmin) {
    existingTenantAdmin.isActive = true;
    existingTenantAdmin.isDeleted = false;
    await existingTenantAdmin.save();
    return { user: existingTenantAdmin, action: 'existing' as const, login: existingTenantAdmin.email };
  }

  let user = await User.findOne({ email: TARGET_LOGIN_EMAIL }).select('+password');
  const passwordHash = await hashPassword(TARGET_LOGIN_PASSWORD);
  if (!user) {
    user = await User.create({
      tenantId,
      email: TARGET_LOGIN_EMAIL,
      password: passwordHash,
      firstName: 'Accounting',
      lastName: 'UAT',
      phoneNumber: '9000000001',
      role: 'admin',
      businessName: TARGET_TENANT_NAME,
      isActive: true,
      isDeleted: false,
    });
    return { user, action: 'created' as const, login: TARGET_LOGIN_EMAIL };
  }

  user.tenantId = tenantId;
  user.firstName = 'Accounting';
  user.lastName = 'UAT';
  user.role = 'admin';
  user.businessName = TARGET_TENANT_NAME;
  user.isActive = true;
  user.isDeleted = false;
  user.password = passwordHash;
  await user.save();
  return { user, action: 'updated' as const, login: TARGET_LOGIN_EMAIL };
};

const ensureCustomAccount = async (
  createdBy: string,
  args: {
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'income' | 'expense';
    subType?: 'cash' | 'bank' | 'customer' | 'supplier' | 'stock' | 'general';
    parentSystemKey?: string;
    openingBalance?: number;
    openingSide?: 'debit' | 'credit';
  }
) => {
  let account = await ChartAccount.findOne({
    $or: [
      { accountCode: String(args.code).trim().toUpperCase() },
      { accountName: { $regex: `^${escapeRegex(args.name)}$`, $options: 'i' } },
    ],
  });
  const parent = args.parentSystemKey ? await ChartAccount.findOne({ systemKey: args.parentSystemKey }) : null;

  if (!account) {
    account = await ChartAccount.create({
      accountCode: String(args.code).trim().toUpperCase(),
      accountName: args.name,
      accountType: args.type,
      subType: args.subType || 'general',
      parentAccountId: parent?._id,
      openingBalance: round2(Number(args.openingBalance || 0)),
      openingSide: args.openingSide || (args.type === 'liability' ? 'credit' : 'debit'),
      isSystem: false,
      isActive: true,
      createdBy,
    });
    return account;
  }

  account.accountName = args.name;
  account.accountType = args.type;
  account.subType = args.subType || 'general';
  account.parentAccountId = parent?._id;
  account.openingBalance = round2(Number(args.openingBalance ?? account.openingBalance ?? 0));
  account.openingSide = args.openingSide || account.openingSide || (args.type === 'liability' ? 'credit' : 'debit');
  account.isActive = true;
  await account.save();
  return account;
};

const ensureCustomer = async (
  createdBy: string,
  args: {
    customerCode: string;
    name: string;
    phone?: string;
    email?: string;
    gstin?: string;
    accountType?: 'cash' | 'credit';
    outstandingBalance?: number;
    openingBalance?: number;
  }
) => {
  const customerCode = scopedSeedRef(args.customerCode);
  let customer = await Customer.findOne({ customerCode });
  if (!customer) {
    customer = await Customer.create({
      customerCode,
      name: args.name,
      phone: args.phone,
      email: args.email,
      gstin: args.gstin,
      customerCategory: args.accountType === 'credit' ? 'corporate' : 'walk_in',
      accountType: args.accountType || 'cash',
      creditLimit: args.accountType === 'credit' ? 250000 : 0,
      creditDays: args.accountType === 'credit' ? 30 : 0,
      outstandingBalance: round2(Number(args.outstandingBalance || 0)),
      openingBalance: round2(Number(args.openingBalance || 0)),
      isBlocked: false,
      createdBy,
    });
    return customer;
  }

  customer.name = args.name;
  customer.phone = args.phone || customer.phone;
  customer.email = args.email || customer.email;
  customer.gstin = args.gstin || customer.gstin;
  customer.accountType = args.accountType || customer.accountType;
  customer.outstandingBalance = round2(Number(args.outstandingBalance ?? customer.outstandingBalance ?? 0));
  customer.openingBalance = round2(Number(args.openingBalance ?? customer.openingBalance ?? 0));
  customer.isBlocked = false;
  await customer.save();
  return customer;
};

const ensureEmployee = async (
  createdBy: string,
  args: {
    employeeCode: string;
    name: string;
    email?: string;
    designation?: string;
    monthlySalary?: number;
    pan?: string;
    pfEnabled?: boolean;
    esiEnabled?: boolean;
    professionalTaxEnabled?: boolean;
    professionalTax?: number;
  }
) => {
  const employeeCode = scopedSeedRef(args.employeeCode);
  let employee = await Employee.findOne({ employeeCode });
  if (!employee) {
    employee = await Employee.create({
      employeeCode,
      name: args.name,
      email: args.email,
      designation: args.designation,
      monthlySalary: round2(Number(args.monthlySalary || 0)),
      employmentType: 'salaried',
      pan: args.pan,
      pfEnabled: args.pfEnabled ?? true,
      esiEnabled: args.esiEnabled ?? true,
      professionalTaxEnabled: args.professionalTaxEnabled ?? false,
      professionalTax: round2(Number(args.professionalTax || 0)),
      active: true,
      createdBy,
    });
    return employee;
  }

  employee.name = args.name;
  employee.email = args.email || employee.email;
  employee.designation = args.designation || employee.designation;
  employee.monthlySalary = round2(Number(args.monthlySalary ?? employee.monthlySalary ?? 0));
  employee.pan = args.pan || employee.pan;
  employee.pfEnabled = args.pfEnabled ?? employee.pfEnabled;
  employee.esiEnabled = args.esiEnabled ?? employee.esiEnabled;
  employee.professionalTaxEnabled = args.professionalTaxEnabled ?? employee.professionalTaxEnabled;
  employee.professionalTax = round2(Number(args.professionalTax ?? employee.professionalTax ?? 0));
  employee.active = true;
  await employee.save();
  return employee;
};

const ensureVendor = async (
  createdBy: string,
  args: {
    ledgerAccountCode: string;
    name: string;
    contact?: string;
    email?: string;
    phone?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    openingBalance?: number;
    openingSide?: 'debit' | 'credit';
    isTdsApplicable?: boolean;
    deducteeType?: string;
    tdsSectionCode?: string;
    tdsRate?: number;
  }
) => {
  const ledgerAccount = await ensureCustomAccount(createdBy, {
    code: scopedSeedRef(args.ledgerAccountCode),
    name: `Vendor - ${args.name}`,
    type: 'liability',
    subType: 'supplier',
    parentSystemKey: 'accounts_payable',
    openingBalance: round2(Number(args.openingBalance || 0)),
    openingSide: args.openingSide || 'credit',
  });

  let vendor = await Vendor.findOne({
    name: { $regex: `^${escapeRegex(args.name)}$`, $options: 'i' },
  });
  if (!vendor) {
    vendor = await Vendor.create({
      name: args.name,
      contact: args.contact,
      email: args.email,
      phone: args.phone,
      gstin: args.gstin,
      pan: args.pan,
      address: args.address,
      openingBalance: round2(Number(args.openingBalance || 0)),
      openingSide: args.openingSide || 'credit',
      isTdsApplicable: Boolean(args.isTdsApplicable),
      deducteeType: args.deducteeType,
      tdsSectionCode: args.tdsSectionCode,
      tdsRate: round2(Number(args.tdsRate || 0)),
      ledgerAccountId: ledgerAccount._id,
      isActive: true,
      createdBy,
    });
    return vendor;
  }

  vendor.contact = args.contact || vendor.contact;
  vendor.email = args.email || vendor.email;
  vendor.phone = args.phone || vendor.phone;
  vendor.gstin = args.gstin || vendor.gstin;
  vendor.pan = args.pan || vendor.pan;
  vendor.address = args.address || vendor.address;
  vendor.openingBalance = round2(Number(args.openingBalance ?? vendor.openingBalance ?? 0));
  vendor.openingSide = args.openingSide || vendor.openingSide || 'credit';
  vendor.isTdsApplicable = args.isTdsApplicable ?? vendor.isTdsApplicable;
  vendor.deducteeType = args.deducteeType || vendor.deducteeType;
  vendor.tdsSectionCode = args.tdsSectionCode || vendor.tdsSectionCode;
  vendor.tdsRate = round2(Number(args.tdsRate ?? vendor.tdsRate ?? 0));
  vendor.ledgerAccountId = ledgerAccount._id as mongoose.Types.ObjectId;
  vendor.isActive = true;
  await vendor.save();
  return vendor;
};

const ensureVoucherDocument = async (
  createdBy: string,
  args: {
    voucherNumber: string;
    voucherType: 'receipt' | 'payment' | 'journal' | 'transfer';
    voucherDate: Date;
    paymentMode?: 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
    referenceNo?: string;
    counterpartyName?: string;
    notes?: string;
    lines: Array<{ accountId: mongoose.Types.ObjectId | string; accountCode: string; accountName: string; debit: number; credit: number; narration?: string }>;
    documentFields?: Record<string, any>;
  }
) => {
  const voucherNumber = scopedSeedRef(args.voucherNumber);
  const referenceNo = args.referenceNo ? scopedSeedRef(args.referenceNo) : undefined;
  let voucher = await AccountingVoucher.findOne({ voucherNumber });
  if (!voucher) {
    voucher = await AccountingVoucher.create({
      voucherNumber,
      voucherType: args.voucherType,
      voucherDate: args.voucherDate,
      paymentMode: args.paymentMode,
      referenceNo,
      counterpartyName: args.counterpartyName,
      notes: args.notes,
      documentFields: args.documentFields,
      totalAmount: round2(args.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)),
      lines: args.lines.map((line) => ({
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: round2(Number(line.debit || 0)),
        credit: round2(Number(line.credit || 0)),
        narration: line.narration,
      })),
      createdBy,
    });
    return { voucher, action: 'created' as const };
  }
  return { voucher, action: 'existing' as const };
};

const ensureReceiptVoucherRow = async (
  createdBy: string,
  args: {
    voucherNumber: string;
    customerId?: string;
    customerName?: string;
    entryDate: Date;
    amount: number;
    unappliedAmount?: number;
    mode: 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque';
    treasuryAccountId?: mongoose.Types.ObjectId | string;
    treasuryAccountName?: string;
    allocations?: Array<{ saleId?: string; saleNumber?: string; amount: number }>;
    notes?: string;
  }
) => {
  const voucherNumber = scopedSeedRef(args.voucherNumber);
  let row = await ReceiptVoucher.findOne({ voucherNumber });
  if (!row) {
    row = await ReceiptVoucher.create({
      voucherNumber,
      customerId: args.customerId,
      customerName: args.customerName,
      entryDate: args.entryDate,
      amount: round2(args.amount),
      unappliedAmount: round2(args.unappliedAmount ?? 0),
      mode: args.mode,
      treasuryAccountId: args.treasuryAccountId,
      treasuryAccountName: args.treasuryAccountName,
      isAdvance: round2(args.unappliedAmount ?? 0) > 0,
      allocations: args.allocations || [],
      notes: args.notes,
      createdBy,
    });
    return { row, action: 'created' as const };
  }
  return { row, action: 'existing' as const };
};

const ensureSale = async (
  createdBy: string,
  args: {
    saleNumber: string;
    invoiceNumber: string;
    createdAt: Date;
    customerId?: string;
    customerCode?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    invoiceType?: 'cash' | 'credit';
    paymentMethod?: 'cash' | 'card' | 'upi' | 'cheque' | 'online' | 'bank_transfer';
    totalAmount: number;
    subtotal?: number;
    totalGst?: number;
    outstandingAmount?: number;
    paymentStatus?: 'pending' | 'completed' | 'failed';
    notes?: string;
  }
) => {
  const saleNumber = scopedSeedRef(args.saleNumber);
  const invoiceNumber = scopedSeedRef(args.invoiceNumber);
  let sale = await Sale.findOne({ saleNumber });
  if (!sale) {
    sale = await Sale.create({
      saleNumber,
      invoiceNumber,
      userId: createdBy,
      invoiceType: args.invoiceType || 'cash',
      invoiceStatus: 'posted',
      isLocked: true,
      pricingMode: 'retail',
      taxMode: 'exclusive',
      isGstBill: true,
      items: [
        {
          productId: '',
          productName: 'UAT Service',
          itemType: 'service',
          category: 'Services',
          quantity: 1,
          unitPrice: round2(Number(args.subtotal ?? args.totalAmount)),
          taxableValue: round2(Number(args.subtotal ?? args.totalAmount)),
          gstRate: Number(args.totalGst || 0) > 0 ? 18 : 0,
          gstAmount: round2(Number(args.totalGst || 0)),
          cgstAmount: round2(Number(args.totalGst || 0) / 2),
          sgstAmount: round2(Number(args.totalGst || 0) / 2),
          lineTotal: round2(Number(args.totalAmount || 0)),
        },
      ],
      subtotal: round2(Number(args.subtotal ?? args.totalAmount)),
      totalGst: round2(Number(args.totalGst || 0)),
      grossTotal: round2(Number(args.totalAmount || 0)),
      roundOffAmount: 0,
      totalAmount: round2(Number(args.totalAmount || 0)),
      paymentMethod: args.paymentMethod || 'cash',
      paymentStatus: args.paymentStatus || (round2(Number(args.outstandingAmount || 0)) > 0 ? 'pending' : 'completed'),
      saleStatus: 'completed',
      outstandingAmount: round2(Number(args.outstandingAmount || 0)),
      creditAppliedAmount: 0,
      customerId: args.customerId,
      customerCode: args.customerCode,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      customerEmail: args.customerEmail,
      postedAt: args.createdAt,
      postedBy: createdBy,
      notes: args.notes,
    });
    await setTimestamps(Sale, sale._id.toString(), args.createdAt, args.createdAt);
    return { sale, action: 'created' as const };
  }
  let mutated = false;
  sale.items = (sale.items || []).map((item: any) => {
    if (String(item?.productId || '') === 'UAT-SERVICE') {
      mutated = true;
      return {
        ...item,
        productId: '',
        itemType: 'service',
        category: item?.category || 'Services',
      };
    }
    return item;
  });
  if (mutated) {
    await sale.save();
  }
  return { sale, action: 'existing' as const };
};

const seedScenarioData = async (tenantId: string, createdBy: string) => {
  await ensureAccountingChart(createdBy);
  const treasuryDefaults = await ensureTreasuryDefaults(createdBy);

  const cashAccount = await ChartAccount.findOne({ systemKey: 'cash_in_hand' });
  const bankAccount = await ChartAccount.findOne({ systemKey: 'bank_account' });
  const otherIncomeAccount = await ChartAccount.findOne({ systemKey: 'other_income' });
  const salaryExpenseAccount = await ChartAccount.findOne({ systemKey: 'salary_expense' });
  const contractExpenseAccount = await ChartAccount.findOne({ systemKey: 'contract_expense' });

  if (!cashAccount || !bankAccount || !otherIncomeAccount || !salaryExpenseAccount || !contractExpenseAccount) {
    throw new Error('Core chart accounts are missing after accounting chart bootstrap.');
  }

  treasuryDefaults.cashFloat.openingBalance = 25000;
  treasuryDefaults.primaryBank.openingBalance = 180000;
  await treasuryDefaults.cashFloat.save();
  await treasuryDefaults.primaryBank.save();

  cashAccount.openingBalance = 25000;
  cashAccount.openingSide = 'debit';
  bankAccount.openingBalance = 180000;
  bankAccount.openingSide = 'debit';
  await cashAccount.save();
  await bankAccount.save();

  const repairsAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT4101',
    name: 'Repairs',
    type: 'expense',
    parentSystemKey: 'expenses',
  });
  const maintenanceAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT4102',
    name: 'Maintenance',
    type: 'expense',
    parentSystemKey: 'expenses',
  });
  const cleaningAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT4103',
    name: 'Cleaning Expense',
    type: 'expense',
    parentSystemKey: 'expenses',
  });
  const officeSuppliesAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT4104',
    name: 'Office Supplies',
    type: 'expense',
    parentSystemKey: 'expenses',
  });
  const sponsorshipIncomeAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT3201',
    name: 'Sponsorship Income',
    type: 'income',
    parentSystemKey: 'income',
  });
  const tournamentEntryFeesAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT3202',
    name: 'Tournament Entry Fees',
    type: 'income',
    parentSystemKey: 'income',
  });
  const courtRentalAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT3101',
    name: 'Court Rental',
    type: 'income',
    parentSystemKey: 'income',
  });
  const pfPayableAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT2201',
    name: 'PF Payable',
    type: 'liability',
    parentSystemKey: 'liabilities',
  });
  const esiPayableAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT2202',
    name: 'ESI Payable',
    type: 'liability',
    parentSystemKey: 'liabilities',
  });
  const professionalTaxPayableAccount = await ensureCustomAccount(createdBy, {
    code: 'UAT2203',
    name: 'Professional Tax Payable',
    type: 'liability',
    parentSystemKey: 'liabilities',
  });
  await ensureCustomAccount(createdBy, {
    code: 'UAT2300',
    name: 'Opening Balance Equity',
    type: 'liability',
    parentSystemKey: 'liabilities',
  });

  const sunrise = await ensureCustomer(createdBy, {
    customerCode: 'UAT-CUST-SUNRISE',
    name: 'Sunrise Sports School',
    phone: '9876500001',
    email: 'accounts@sunrise-school.example.com',
    gstin: buildGstin('32', 'AABCS1234F'),
    accountType: 'credit',
    outstandingBalance: 15000,
    openingBalance: 15000,
  });
  const walkIn = await ensureCustomer(createdBy, {
    customerCode: 'UAT-CUST-WALKIN',
    name: 'Walk-in Customer',
    phone: '9876500002',
    accountType: 'cash',
  });
  const amit = await ensureCustomer(createdBy, {
    customerCode: 'UAT-CUST-AMIT',
    name: 'Amit Sharma',
    phone: '9876500003',
    accountType: 'cash',
  });
  const anjali = await ensureCustomer(createdBy, {
    customerCode: 'UAT-CUST-ANJALI',
    name: 'Anjali Nair',
    phone: '9876500004',
    email: 'anjali@example.com',
    accountType: 'credit',
  });

  const nikhil = await ensureEmployee(createdBy, {
    employeeCode: 'UAT-EMP-NIKHIL',
    name: 'Nikhil Raj',
    email: 'nikhil.raj@example.com',
    designation: 'Front Desk Executive',
    monthlySalary: 22000,
    pan: 'ABCDE1234F',
    pfEnabled: true,
    esiEnabled: true,
  });
  const priya = await ensureEmployee(createdBy, {
    employeeCode: 'UAT-EMP-PRIYA',
    name: 'Priya',
    email: 'priya@example.com',
    designation: 'Operations Supervisor',
    monthlySalary: 25000,
    pan: 'AAACP1234K',
    pfEnabled: true,
    esiEnabled: true,
  });

  const brightPower = await ensureVendor(createdBy, {
    ledgerAccountCode: 'UATV001',
    name: 'Bright Power Services',
    contact: 'Arun Das',
    phone: '9846112233',
    email: 'support@brightpower.in',
    address: 'Thrissur Road, Kochi',
    openingBalance: 7000,
    openingSide: 'credit',
  });
  await ensureVendor(createdBy, {
    ledgerAccountCode: 'UATV002',
    name: 'Kochi Electricals',
    contact: 'Rajesh',
    phone: '9847012345',
    email: 'rajesh@kochi-electricals.example.com',
    address: 'Kaloor, Kochi',
    gstin: buildGstin('32', 'AAAAA1234A'),
    pan: 'AAAAA1234A',
  });
  const cleanPro = await ensureVendor(createdBy, {
    ledgerAccountCode: 'UATV003',
    name: 'CleanPro Services',
    contact: 'Ramesh',
    phone: '9847012399',
    email: 'ops@cleanpro.example.com',
  });
  const eliteSports = await ensureVendor(createdBy, {
    ledgerAccountCode: 'UATV004',
    name: 'Elite Sports Equipment',
    contact: 'Elite Accounts',
    phone: '9847012488',
    email: 'accounts@elite-sports.example.com',
    pan: 'AACCE4567L',
  });
  const noPanVendor = await ensureVendor(createdBy, {
    ledgerAccountCode: 'UATV005',
    name: 'NoPAN Traders',
    contact: 'Vendor Desk',
    phone: '9847012567',
    email: 'desk@nopan.example.com',
  });
  const aceSports = await ensureVendor(createdBy, {
    ledgerAccountCode: 'UATV006',
    name: 'Ace Sports',
    contact: 'Purchase Desk',
    phone: '9847012876',
    email: 'payments@acesports.example.com',
    pan: 'AABCA9876L',
  });

  pushManifest('ACC-VEN-01', 'updated', ['Kochi Electricals'], ['Vendor master ensured with GSTIN and PAN for UAT tenant.']);
  pushManifest('ACC-OPN-01', 'updated', ['Cash In Hand opening = 25000', 'Bank Account opening = 180000'], ['Primary treasury opening balances refreshed.']);
  pushManifest('ACC-OPN-02', 'updated', ['UAT-CUST-SUNRISE'], ['Customer opening balance and outstanding were set to 15000.']);
  pushManifest('ACC-OPN-03', 'updated', ['Bright Power Services'], ['Vendor opening balance was set to 7000 credit.']);

  const existingHdfcCurrent = await TreasuryAccount.findOne({ displayName: 'HDFC Operations Current' }).select('_id');
  const hdfcCurrent = await upsertTreasuryAccount({
    id: existingHdfcCurrent?._id?.toString(),
    accountType: 'bank',
    displayName: 'HDFC Operations Current',
    bankName: 'HDFC',
    accountNumber: '50100123456789',
    ifscCode: 'HDFC0001234',
    openingBalance: 200000,
    notes: `${SEED_TAG} - ACC-BNK-01`,
    createdBy,
  });
  pushManifest('ACC-BNK-01', 'created', ['HDFC Operations Current'], ['Treasury account created or refreshed with 200000 opening balance.']);

  try {
    await saveTdsCompanySettings({
      legalName: 'Sarva Sports Complex Private Limited',
      pan: 'AABCS1234F',
      tan: 'BLRS12345F',
      deductorCategory: 'company',
      responsiblePersonName: 'Accounting UAT',
      responsiblePersonDesignation: 'Accounts Manager',
      email: TARGET_LOGIN_EMAIL,
      phone: '9000000001',
      address: 'Sarva Sports Complex, Kochi, Kerala',
      notes: `${SEED_TAG} company settings`,
    }, createdBy);
  } catch (error: any) {
    const message = String(error?.message || '');
    const isCompanySettingsDuplicate = Number(error?.code) === 11000 && message.includes('tds_company_settings');
    if (!isCompanySettingsDuplicate) throw error;
    console.warn('saveTdsCompanySettings warning: reused existing global tds_company_settings record.');
  }
  await seedDefaultTdsSections(createdBy);

  const invoiceOneNumber = scopedSeedRef('AINV-UAT-INV01');
  let invoiceOne = await AccountingInvoice.findOne({ invoiceNumber: invoiceOneNumber });
  if (!invoiceOne) {
    const created = await createInvoice({
      invoiceNumber: invoiceOneNumber,
      invoiceDate: at('2026-04-01T10:00:00+05:30'),
      dueDate: at('2026-04-30T18:00:00+05:30'),
      customerId: sunrise._id.toString(),
      customerName: sunrise.name,
      description: 'Court rental - ACC-INV-01',
      baseAmount: 12000,
      gstRate: 18,
      gstTreatment: 'intrastate',
      paymentAmount: 5000,
      paymentMode: 'bank_transfer',
      revenueAccountKey: courtRentalAccount.accountCode,
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-INV-01' },
    });
    invoiceOne = created.invoice;
    await setTimestamps(AccountingInvoice, invoiceOne._id.toString(), at('2026-04-01T10:00:00+05:30'));
    pushManifest('ACC-INV-01', 'created', [invoiceOne.invoiceNumber], ['Partial payment 5000 recorded through accounting payment flow.']);
  } else {
    pushManifest('ACC-INV-01', 'existing', [invoiceOne.invoiceNumber]);
  }

  const invoiceTwoNumber = scopedSeedRef('AINV-UAT-INV02');
  let invoiceTwo = await AccountingInvoice.findOne({ invoiceNumber: invoiceTwoNumber });
  if (!invoiceTwo) {
    const created = await createInvoice({
      invoiceNumber: invoiceTwoNumber,
      invoiceDate: at('2026-04-05T11:00:00+05:30'),
      customerId: walkIn._id.toString(),
      customerName: walkIn.name,
      description: 'Walk-in counter invoice - ACC-INV-02',
      baseAmount: 2500,
      gstRate: 5,
      gstTreatment: 'intrastate',
      paymentAmount: 0,
      paymentMode: 'cash',
      revenueAccountKey: tournamentEntryFeesAccount.accountCode,
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-INV-02' },
    });
    invoiceTwo = created.invoice;
    await setTimestamps(AccountingInvoice, invoiceTwo._id.toString(), at('2026-04-05T11:00:00+05:30'));
    pushManifest('ACC-INV-02', 'created', [invoiceTwo.invoiceNumber]);
  } else {
    pushManifest('ACC-INV-02', 'existing', [invoiceTwo.invoiceNumber]);
  }

  const existingInv03 = await JournalEntry.findOne({ 'metadata.scenarioId': 'ACC-INV-03' });
  if (!existingInv03) {
    await recordExpense({
      expenseDate: at('2026-04-10T09:30:00+05:30'),
      description: 'LED floodlight repair - ACC-INV-03',
      amount: 4500,
      paidAmount: 2000,
      paymentMode: 'bank',
      expenseAccountId: repairsAccount._id.toString(),
      vendorId: brightPower._id.toString(),
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-INV-03', dueDate: '2026-05-10' },
    });
    pushManifest('ACC-INV-03', 'created', ['LED floodlight repair'], ['Vendor expense posted with 2000 partial payment and 2500 payable outstanding.']);
  } else {
    pushManifest('ACC-INV-03', 'existing', ['LED floodlight repair']);
  }

  let asset = await FixedAsset.findOne({ assetName: 'Court 3 LED Floodlight' });
  if (!asset) {
    asset = await createFixedAsset({
      assetName: 'Court 3 LED Floodlight',
      description: 'ACC-ASS-01',
      cost: 25000,
      lifeYears: 6.6666666667,
      purchaseDate: at('2026-04-01T09:00:00+05:30'),
      createdBy,
    });
    await setTimestamps(FixedAsset, asset._id.toString(), at('2026-04-01T09:00:00+05:30'));
  }
  if (!asset.lastDepreciationDate || dateKey(asset.lastDepreciationDate) !== '2026-04-30') {
    await runAssetDepreciation(asset._id.toString(), { postingDate: at('2026-04-30T18:00:00+05:30'), createdBy });
  }
  pushManifest('ACC-ASS-01', 'updated', [asset.assetName], ['Asset exists with monthly depreciation close to 312.50 using 6.6667 year life.']);

  let salary = await SalaryPayment.findOne({
    employeeId: nikhil._id,
    month: '2026-04',
    payDateKey: '2026-04-30',
  });
  if (!salary) {
    salary = await SalaryPayment.create({
      employeeId: nikhil._id,
      employeeName: nikhil.name,
      designation: nikhil.designation,
      month: '2026-04',
      payDate: at('2026-04-30T17:00:00+05:30'),
      payDateKey: '2026-04-30',
      baseAmount: 22000,
      bonusAmount: 0,
      grossSalary: 22000,
      employeePf: 1200,
      employeeEsi: 440,
      professionalTax: 0,
      tdsAmount: 0,
      statutoryDeductions: 1640,
      retirementContribution: 0,
      insurancePremium: 0,
      otherDeductions: 0,
      voluntaryDeductions: 0,
      totalDeductions: 1640,
      employerPf: 0,
      employerEsi: 0,
      employerPayrollTaxes: 0,
      benefitsExpense: 0,
      netPay: 20360,
      totalPayrollCost: 22000,
      amount: 20360,
      paymentMethod: 'bank',
      notes: `${SEED_TAG} ACC-SAL-01`,
      createdBy,
    });
    await setTimestamps(SalaryPayment, salary._id.toString(), at('2026-04-30T17:00:00+05:30'));
    const salaryJournal = await createJournalEntry({
      entryDate: at('2026-04-30T17:00:00+05:30'),
      referenceType: 'manual',
      referenceId: salary._id.toString(),
      referenceNo: scopedSeedRef('SP-UAT-01'),
      description: 'Salary payment - ACC-SAL-01',
      paymentMode: 'bank',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-SAL-01' },
      lines: [
        { accountKey: 'salary_expense', debit: 22000, credit: 0, description: 'Gross salary expense' },
        { accountId: pfPayableAccount._id, debit: 0, credit: 1200, description: 'Employee PF payable' },
        { accountId: esiPayableAccount._id, debit: 0, credit: 440, description: 'Employee ESI payable' },
        { accountKey: 'bank_account', debit: 0, credit: 20360, description: 'Net salary paid' },
      ],
    });
    await normalizeVoucherRows(salaryJournal.entry._id.toString(), {
      source: 'salary_payment',
      sourceId: salary._id.toString(),
      voucherType: 'salary',
      voucherNumber: scopedSeedRef('SP-UAT-01'),
      referenceNo: salary._id.toString(),
    });
    pushManifest('ACC-SAL-01', 'created', [scopedSeedRef('SP-UAT-01')]);
  } else {
    pushManifest('ACC-SAL-01', 'existing', [salary._id.toString()]);
  }

  let arrears = await PayrollArrear.findOne({ employeeId: priya._id, payoutMonth: '2026-04' });
  if (!arrears) {
    arrears = await PayrollArrear.create({
      employeeId: priya._id,
      employeeCode: priya.employeeCode,
      employeeName: priya.name,
      effectiveMonth: '2026-02',
      payoutMonth: '2026-04',
      previousMonthlySalary: 25000,
      revisedMonthlySalary: 28000,
      monthlyDifference: 3000,
      monthsCount: 2,
      arrearsAmount: 6000,
      reason: `${SEED_TAG} ACC-SAL-03`,
      status: 'approved',
      createdBy,
      approvedBy: createdBy,
      approvedAt: at('2026-04-28T12:00:00+05:30'),
    });
    await setTimestamps(PayrollArrear, arrears._id.toString(), at('2026-04-28T12:00:00+05:30'));
    pushManifest('ACC-SAL-03', 'created', [arrears._id.toString()]);
  } else {
    pushManifest('ACC-SAL-03', 'existing', [arrears._id.toString()]);
  }

  let contract = await ContractPayment.findOne({ contractorName: 'Suresh Tennis Coach', contractTitle: 'April coaching' });
  if (!contract) {
    contract = await ContractPayment.create({
      contractorName: 'Suresh Tennis Coach',
      contractTitle: 'April coaching',
      paymentDate: at('2026-07-15T15:00:00+05:30'),
      amount: 50000,
      status: 'paid',
      paymentMethod: 'bank',
      notes: `${SEED_TAG} ACC-SAL-02 gross=50000 tds=5000 net bank effect 45000`,
      createdBy,
    });
    await setTimestamps(ContractPayment, contract._id.toString(), at('2026-07-15T15:00:00+05:30'));
    const contractJournal = await createJournalEntry({
      entryDate: at('2026-07-15T15:00:00+05:30'),
      referenceType: 'manual',
      referenceId: contract._id.toString(),
      referenceNo: scopedSeedRef('CP-UAT-01'),
      description: 'Contract payment with TDS - ACC-SAL-02',
      paymentMode: 'bank',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-SAL-02' },
      lines: [
        { accountKey: 'contract_expense', debit: 50000, credit: 0, description: 'Contract expense' },
        { accountKey: 'tds_payable', debit: 0, credit: 5000, description: 'TDS withheld' },
        { accountKey: 'bank_account', debit: 0, credit: 45000, description: 'Net bank payout' },
      ],
    });
    await normalizeVoucherRows(contractJournal.entry._id.toString(), {
      source: 'contract_payment',
      sourceId: contract._id.toString(),
      voucherType: 'contract',
      voucherNumber: scopedSeedRef('CP-UAT-01'),
      referenceNo: contract._id.toString(),
    });
    const coachProfile = await upsertDeducteeProfile({
      deducteeName: 'Suresh Tennis Coach',
      deducteeType: 'vendor',
      residentialStatus: 'resident',
      pan: 'ABCDE2345F',
      email: 'coach.suresh@example.com',
      phone: '9000000201',
      notes: `${SEED_TAG} ACC-SAL-02`,
      createdBy,
    });
    await recordTdsTransaction({
      transactionDate: '2026-07-15',
      transactionType: 'payment',
      deducteeProfileId: coachProfile._id.toString(),
      deducteeName: 'Suresh Tennis Coach',
      pan: 'ABCDE2345F',
      sectionCode: '194J',
      grossAmount: 50000,
      taxableAmount: 50000,
      referenceNo: scopedSeedRef('TDS-UAT-SAL02'),
      sourceType: 'contract_payment',
      sourceId: contract._id.toString(),
      tdsUseCaseKey: 'professional_services',
      tdsUseCaseLabel: 'Professional services',
      postJournal: false,
      notes: `${SEED_TAG} ACC-SAL-02`,
      createdBy,
      metadata: { scenarioId: 'ACC-SAL-02', seedTag: SEED_TAG },
    });
    pushManifest('ACC-SAL-02', 'created', [scopedSeedRef('CP-UAT-01'), scopedSeedRef('TDS-UAT-SAL02')], ['Contract payment saved at gross amount to match contract expense reports.']);
  } else {
    pushManifest('ACC-SAL-02', 'existing', [contract._id.toString()]);
  }

  let dayExpense = await DayBookEntry.findOne({ referenceNo: 'PB-001' });
  if (!dayExpense) {
    dayExpense = await DayBookEntry.create({
      entryType: 'expense',
      category: 'Office Supplies',
      amount: 850,
      paymentMethod: 'cash',
      treasuryAccountId: treasuryDefaults.cashFloat._id,
      treasuryAccountName: treasuryDefaults.cashFloat.displayName,
      narration: 'Notebooks and pens',
      referenceNo: 'PB-001',
      entryDate: at('2026-04-03T13:00:00+05:30'),
      createdBy,
    });
    await setTimestamps(DayBookEntry, dayExpense._id.toString(), at('2026-04-03T13:00:00+05:30'));
    pushManifest('ACC-DAY-01', 'created', ['PB-001']);
  } else {
    pushManifest('ACC-DAY-01', 'existing', ['PB-001']);
  }

  let dayIncome = await DayBookEntry.findOne({ referenceNo: 'SP-APR-01' });
  if (!dayIncome) {
    dayIncome = await DayBookEntry.create({
      entryType: 'income',
      category: 'Sponsorship',
      amount: 25000,
      paymentMethod: 'bank',
      treasuryAccountId: treasuryDefaults.primaryBank._id,
      treasuryAccountName: treasuryDefaults.primaryBank.displayName,
      narration: 'Local tournament sponsor contribution',
      referenceNo: 'SP-APR-01',
      entryDate: at('2026-04-07T14:00:00+05:30'),
      createdBy,
    });
    await setTimestamps(DayBookEntry, dayIncome._id.toString(), at('2026-04-07T14:00:00+05:30'));
    pushManifest('ACC-DAY-02', 'created', ['SP-APR-01'], ['Day-book stores taxable amount 25000 only; GST split remains a known UI/report validation point.']);
  } else {
    pushManifest('ACC-DAY-02', 'existing', ['SP-APR-01']);
  }

  const reconciledDaybookRef = 'UAT-DAY-RECON-01';
  let reconciledDaybook = await DayBookEntry.findOne({ referenceNo: reconciledDaybookRef });
  if (!reconciledDaybook) {
    reconciledDaybook = await DayBookEntry.create({
      entryType: 'expense',
      category: 'Bank Charges',
      amount: 2000,
      paymentMethod: 'bank',
      treasuryAccountId: hdfcCurrent._id,
      treasuryAccountName: hdfcCurrent.displayName,
      narration: 'Reconciled bank charge entry',
      referenceNo: reconciledDaybookRef,
      entryDate: at('2026-04-01T10:30:00+05:30'),
      createdBy,
    });
    await setTimestamps(DayBookEntry, reconciledDaybook._id.toString(), at('2026-04-01T10:30:00+05:30'));
    const imported = await importBankFeed({
      treasuryAccountId: hdfcCurrent._id.toString(),
      rows: [{ date: '2026-04-01', amount: -2000, description: 'Bank charge', referenceNo: 'BANK-CHARGE-UAT-01' }],
      createdBy,
    });
    if (imported[0]) {
      await applyManualMatch({
        bankTransactionId: imported[0]._id.toString(),
        bookEntryKeys: [`daybook:${reconciledDaybook._id}`],
        createdBy,
      });
    }
    pushManifest('ACC-DAY-03', 'created', [reconciledDaybookRef], ['A reconciled bank-linked day-book entry was created for edit-block testing.']);
  } else {
    pushManifest('ACC-DAY-03', 'existing', [reconciledDaybookRef]);
  }

  const receiptVoucherDocNumber = 'UAT-RV-001';
  const receiptVoucherAmount = 1200;
  const receiptVoucherDoc = await ensureVoucherDocument(createdBy, {
    voucherNumber: receiptVoucherDocNumber,
    voucherType: 'receipt',
    voucherDate: at('2026-04-12T11:00:00+05:30'),
    paymentMode: 'cash',
    referenceNo: 'RCPT-001',
    counterpartyName: amit.name,
    notes: 'Locker rent - ACC-VCH-01',
    lines: [
      { accountId: cashAccount._id, accountCode: cashAccount.accountCode, accountName: cashAccount.accountName, debit: receiptVoucherAmount, credit: 0, narration: 'Cash received' },
      { accountId: otherIncomeAccount._id, accountCode: otherIncomeAccount.accountCode, accountName: otherIncomeAccount.accountName, debit: 0, credit: receiptVoucherAmount, narration: 'Other income' },
    ],
    documentFields: { accountName: 'Other Income' },
  });
  if (receiptVoucherDoc.action === 'created') {
    const daybook = await DayBookEntry.create({
      entryType: 'income',
      category: 'Other Income',
      amount: receiptVoucherAmount,
      paymentMethod: 'cash',
      treasuryAccountId: treasuryDefaults.cashFloat._id,
      treasuryAccountName: treasuryDefaults.cashFloat.displayName,
      narration: 'Locker rent',
      referenceNo: receiptVoucherDocNumber,
      entryDate: at('2026-04-12T11:00:00+05:30'),
      createdBy,
    });
    await setTimestamps(DayBookEntry, daybook._id.toString(), at('2026-04-12T11:00:00+05:30'));
    const journal = await createJournalEntry({
      entryDate: at('2026-04-12T11:00:00+05:30'),
      referenceType: 'manual',
      referenceId: receiptVoucherDoc.voucher._id.toString(),
      referenceNo: receiptVoucherDocNumber,
      description: 'Receipt voucher - ACC-VCH-01',
      paymentMode: 'cash',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-VCH-01' },
      lines: [
        { accountKey: 'cash_in_hand', debit: receiptVoucherAmount, credit: 0, description: 'Cash receipt' },
        { accountKey: 'other_income', debit: 0, credit: receiptVoucherAmount, description: 'Other income' },
      ],
    });
    await normalizeVoucherRows(journal.entry._id.toString(), {
      source: 'voucher',
      sourceId: receiptVoucherDoc.voucher._id.toString(),
      voucherType: 'receipt',
      voucherNumber: receiptVoucherDocNumber,
      referenceNo: 'RCPT-001',
    });
    pushManifest('ACC-VCH-01', 'created', [receiptVoucherDocNumber]);
  } else {
    pushManifest('ACC-VCH-01', 'existing', [receiptVoucherDocNumber]);
  }

  const paymentVoucherDocNumber = 'UAT-PV-001';
  const paymentVoucherAmount = 3500;
  const paymentVoucherDoc = await ensureVoucherDocument(createdBy, {
    voucherNumber: paymentVoucherDocNumber,
    voucherType: 'payment',
    voucherDate: at('2026-04-15T16:00:00+05:30'),
    paymentMode: 'bank_transfer',
    referenceNo: 'PV-0415',
    counterpartyName: cleanPro.name,
    notes: 'One-time cleaning service - ACC-VCH-02',
    lines: [
      { accountId: cleaningAccount._id, accountCode: cleaningAccount.accountCode, accountName: cleaningAccount.accountName, debit: paymentVoucherAmount, credit: 0, narration: 'Cleaning expense' },
      { accountId: bankAccount._id, accountCode: bankAccount.accountCode, accountName: bankAccount.accountName, debit: 0, credit: paymentVoucherAmount, narration: 'Bank payment' },
    ],
    documentFields: { receivedBy: 'Ramesh', accountName: 'Cleaning Expense' },
  });
  if (paymentVoucherDoc.action === 'created') {
    const daybook = await DayBookEntry.create({
      entryType: 'expense',
      category: 'Cleaning Expense',
      amount: paymentVoucherAmount,
      paymentMethod: 'bank',
      treasuryAccountId: treasuryDefaults.primaryBank._id,
      treasuryAccountName: treasuryDefaults.primaryBank.displayName,
      narration: 'One-time cleaning service',
      referenceNo: paymentVoucherDocNumber,
      entryDate: at('2026-04-15T16:00:00+05:30'),
      createdBy,
    });
    await setTimestamps(DayBookEntry, daybook._id.toString(), at('2026-04-15T16:00:00+05:30'));
    const journal = await createJournalEntry({
      entryDate: at('2026-04-15T16:00:00+05:30'),
      referenceType: 'manual',
      referenceId: paymentVoucherDoc.voucher._id.toString(),
      referenceNo: paymentVoucherDocNumber,
      description: 'Payment voucher - ACC-VCH-02',
      paymentMode: 'bank_transfer',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-VCH-02' },
      lines: [
        { accountId: cleaningAccount._id, debit: paymentVoucherAmount, credit: 0, description: 'Cleaning expense' },
        { accountKey: 'bank_account', debit: 0, credit: paymentVoucherAmount, description: 'Bank payment' },
      ],
    });
    await normalizeVoucherRows(journal.entry._id.toString(), {
      source: 'voucher',
      sourceId: paymentVoucherDoc.voucher._id.toString(),
      voucherType: 'payment',
      voucherNumber: paymentVoucherDocNumber,
      referenceNo: 'PV-0415',
    });
    pushManifest('ACC-VCH-02', 'created', [paymentVoucherDocNumber]);
  } else {
    pushManifest('ACC-VCH-02', 'existing', [paymentVoucherDocNumber]);
  }

  const journalVoucherDocNumber = 'UAT-JV-001';
  const journalVoucherDoc = await ensureVoucherDocument(createdBy, {
    voucherNumber: journalVoucherDocNumber,
    voucherType: 'journal',
    voucherDate: at('2026-04-18T10:00:00+05:30'),
    referenceNo: 'JV-CORR-01',
    notes: 'Reclassification from Repairs to Maintenance - ACC-VCH-03',
    lines: [
      { accountId: maintenanceAccount._id, accountCode: maintenanceAccount.accountCode, accountName: maintenanceAccount.accountName, debit: 1500, credit: 0, narration: 'Reclassification in' },
      { accountId: repairsAccount._id, accountCode: repairsAccount.accountCode, accountName: repairsAccount.accountName, debit: 0, credit: 1500, narration: 'Reclassification out' },
    ],
  });
  if (journalVoucherDoc.action === 'created') {
    const journal = await createJournalEntry({
      entryDate: at('2026-04-18T10:00:00+05:30'),
      referenceType: 'manual',
      referenceId: journalVoucherDoc.voucher._id.toString(),
      referenceNo: journalVoucherDocNumber,
      description: 'Journal voucher - ACC-VCH-03',
      paymentMode: 'adjustment',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-VCH-03' },
      lines: [
        { accountId: maintenanceAccount._id, debit: 1500, credit: 0, description: 'Maintenance reclass' },
        { accountId: repairsAccount._id, debit: 0, credit: 1500, description: 'Repairs reclass' },
      ],
    });
    await normalizeVoucherRows(journal.entry._id.toString(), {
      source: 'voucher',
      sourceId: journalVoucherDoc.voucher._id.toString(),
      voucherType: 'journal',
      voucherNumber: journalVoucherDocNumber,
      referenceNo: 'JV-CORR-01',
    });
    pushManifest('ACC-VCH-03', 'created', [journalVoucherDocNumber]);
  } else {
    pushManifest('ACC-VCH-03', 'existing', [journalVoucherDocNumber]);
  }

  const transferVoucherDocNumber = 'UAT-TV-001';
  const transferVoucherDoc = await ensureVoucherDocument(createdBy, {
    voucherNumber: transferVoucherDocNumber,
    voucherType: 'transfer',
    voucherDate: at('2026-04-20T12:00:00+05:30'),
    paymentMode: 'bank_transfer',
    referenceNo: 'DEP-001',
    notes: 'Cash deposit - ACC-BNK-02',
    lines: [
      { accountId: bankAccount._id, accountCode: bankAccount.accountCode, accountName: bankAccount.accountName, debit: 15000, credit: 0, narration: 'Cash to bank' },
      { accountId: cashAccount._id, accountCode: cashAccount.accountCode, accountName: cashAccount.accountName, debit: 0, credit: 15000, narration: 'Cash to bank' },
    ],
  });
  if (transferVoucherDoc.action === 'created') {
    const journal = await createJournalEntry({
      entryDate: at('2026-04-20T12:00:00+05:30'),
      referenceType: 'manual',
      referenceId: transferVoucherDoc.voucher._id.toString(),
      referenceNo: transferVoucherDocNumber,
      description: 'Transfer voucher - ACC-BNK-02',
      paymentMode: 'bank_transfer',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-BNK-02' },
      lines: [
        { accountKey: 'bank_account', debit: 15000, credit: 0, description: 'Bank deposit' },
        { accountKey: 'cash_in_hand', debit: 0, credit: 15000, description: 'Cash deposit' },
      ],
    });
    await normalizeVoucherRows(journal.entry._id.toString(), {
      source: 'voucher',
      sourceId: transferVoucherDoc.voucher._id.toString(),
      voucherType: 'transfer',
      voucherNumber: transferVoucherDocNumber,
      referenceNo: 'DEP-001',
    });
    pushManifest('ACC-BNK-02', 'created', [transferVoucherDocNumber]);
  } else {
    pushManifest('ACC-BNK-02', 'existing', [transferVoucherDocNumber]);
  }

  const chequeVoucherDocNumber = 'UAT-PV-CHEQUE-001';
  const chequeVoucher = await ensureVoucherDocument(createdBy, {
    voucherNumber: chequeVoucherDocNumber,
    voucherType: 'payment',
    voucherDate: at('2026-04-22T11:00:00+05:30'),
    paymentMode: 'cheque',
    referenceNo: 'CHQ-123456',
    counterpartyName: aceSports.name,
    notes: 'Cheque issued to Ace Sports - ACC-BNK-03',
    lines: [
      { accountId: repairsAccount._id, accountCode: repairsAccount.accountCode, accountName: repairsAccount.accountName, debit: 22000, credit: 0, narration: 'Cheque issue' },
      { accountId: bankAccount._id, accountCode: bankAccount.accountCode, accountName: bankAccount.accountName, debit: 0, credit: 22000, narration: 'Cheque issue' },
    ],
  });
  pushManifest('ACC-BNK-03', chequeVoucher.action, [chequeVoucherDocNumber], ['Cheque issue document was seeded; bank clearance can be tested with later reconciliation workflows.']);

  const exactReceipt = await ensureReceiptVoucherRow(createdBy, {
    voucherNumber: 'UAT-STMT-RCPT-01',
    customerId: anjali._id.toString(),
    customerName: anjali.name,
    entryDate: at('2026-04-01T12:30:00+05:30'),
    amount: 2000,
    unappliedAmount: 2000,
    mode: 'bank_transfer',
    treasuryAccountId: hdfcCurrent._id,
    treasuryAccountName: hdfcCurrent.displayName,
    notes: 'ACC-BB-01 exact bank reconciliation receipt',
  });
  if (exactReceipt.action === 'created') {
    const bankRows = await importBankFeed({
      treasuryAccountId: hdfcCurrent._id.toString(),
      rows: [{ date: '2026-04-01', amount: 2000, description: 'UPI receipt from Anjali', referenceNo: 'UPI-UAT-2000' }],
      createdBy,
    });
    if (bankRows[0]) {
      await applyManualMatch({
        bankTransactionId: bankRows[0]._id.toString(),
        bookEntryKeys: [`receipt:${exactReceipt.row._id}`],
        createdBy,
      });
    }
    pushManifest('ACC-BB-01', 'created', ['UAT-STMT-RCPT-01', 'UPI-UAT-2000']);
  } else {
    pushManifest('ACC-BB-01', 'existing', ['UAT-STMT-RCPT-01']);
  }

  const mismatchReceipt = await ensureReceiptVoucherRow(createdBy, {
    voucherNumber: 'UAT-STMT-RCPT-02',
    customerId: anjali._id.toString(),
    customerName: anjali.name,
    entryDate: at('2026-04-02T12:30:00+05:30'),
    amount: 1800,
    unappliedAmount: 1800,
    mode: 'bank_transfer',
    treasuryAccountId: hdfcCurrent._id,
    treasuryAccountName: hdfcCurrent.displayName,
    notes: 'ACC-BB-02 mismatch bank reconciliation receipt',
  });
  if (mismatchReceipt.action === 'created') {
    await importBankFeed({
      treasuryAccountId: hdfcCurrent._id.toString(),
      rows: [{ date: '2026-04-02', amount: 2000, description: 'UPI mismatch', referenceNo: 'UPI-UAT-2000-MISMATCH' }],
      createdBy,
    });
    pushManifest('ACC-BB-02', 'created', ['UAT-STMT-RCPT-02', 'UPI-UAT-2000-MISMATCH']);
  } else {
    pushManifest('ACC-BB-02', 'existing', ['UAT-STMT-RCPT-02']);
  }

  const settlementSale = await ensureSale(createdBy, {
    saleNumber: 'UAT-SALE-SET-001',
    invoiceNumber: 'INV-101',
    createdAt: at('2026-04-20T10:00:00+05:30'),
    customerId: sunrise._id.toString(),
    customerCode: sunrise.customerCode,
    customerName: sunrise.name,
    customerPhone: sunrise.phone,
    customerEmail: sunrise.email,
    invoiceType: 'credit',
    paymentMethod: 'bank_transfer',
    totalAmount: 9160,
    subtotal: 7762.71,
    totalGst: 1397.29,
    outstandingAmount: 9160,
    paymentStatus: 'pending',
    notes: `${SEED_TAG} ACC-SET-01`,
  });
  const settlementReceipt = await ensureReceiptVoucherRow(createdBy, {
    voucherNumber: 'UAT-SET-001',
    customerId: sunrise._id.toString(),
    customerName: sunrise.name,
    entryDate: at('2026-04-25T15:30:00+05:30'),
    amount: 9160,
    unappliedAmount: 0,
    mode: 'bank_transfer',
    treasuryAccountId: treasuryDefaults.primaryBank._id,
    treasuryAccountName: treasuryDefaults.primaryBank.displayName,
    allocations: [{ saleId: settlementSale.sale._id.toString(), saleNumber: settlementSale.sale.invoiceNumber, amount: 9160 }],
    notes: 'ACC-SET-01 settlement receipt',
  });
  if (settlementReceipt.action === 'created') {
    await Sale.updateOne({ _id: settlementSale.sale._id }, { $set: { outstandingAmount: 0, paymentStatus: 'completed' } });
    pushManifest('ACC-SET-01', 'created', ['INV-101', 'UAT-SET-001']);
  } else {
    pushManifest('ACC-SET-01', 'existing', ['INV-101', 'UAT-SET-001']);
  }

  const dayEndShortDate = at('2026-04-26T23:59:00+05:30');
  const dayEndShortKey = scopedSeedRef(dateKey(dayEndShortDate));
  await DayEndClosing.findOneAndUpdate(
    { dateKey: dayEndShortKey },
    {
      dateKey: dayEndShortKey,
      businessDate: dayEndShortDate,
      openingCash: 12000,
      cashSales: 25000,
      cashReceipts: 0,
      cashExpenses: 8500,
      systemClosingCash: 28500,
      physicalClosingCash: 28200,
      variance: -300,
      notes: `${SEED_TAG} ACC-SET-02`,
      closedBy: createdBy,
    },
    { upsert: true, new: true, runValidators: true }
  );
  pushManifest('ACC-SET-02', 'updated', [dayEndShortKey]);

  const dayEndOverDate = at('2026-04-27T23:59:00+05:30');
  const dayEndOverKey = scopedSeedRef(dateKey(dayEndOverDate));
  await DayEndClosing.findOneAndUpdate(
    { dateKey: dayEndOverKey },
    {
      dateKey: dayEndOverKey,
      businessDate: dayEndOverDate,
      openingCash: 12000,
      cashSales: 25000,
      cashReceipts: 0,
      cashExpenses: 8500,
      systemClosingCash: 28500,
      physicalClosingCash: 28800,
      variance: 300,
      notes: `${SEED_TAG} ACC-SET-03`,
      closedBy: createdBy,
    },
    { upsert: true, new: true, runValidators: true }
  );
  pushManifest('ACC-SET-03', 'updated', [dayEndOverKey]);
};

const seedExtendedScenarioData = async (createdBy: string) => {
  const walkIn = await Customer.findOne({ customerCode: scopedSeedRef('UAT-CUST-WALKIN') });
  const sunrise = await Customer.findOne({ customerCode: scopedSeedRef('UAT-CUST-SUNRISE') });
  const repairsAccount = await ChartAccount.findOne({ accountCode: 'UAT4101' });
  const maintenanceAccount = await ChartAccount.findOne({ accountCode: 'UAT4102' });
  const otherIncomeAccount = await ChartAccount.findOne({ systemKey: 'other_income' });
  const courtRentalAccount = await ChartAccount.findOne({ accountCode: 'UAT3101' });
  const eliteSports = await Vendor.findOne({ name: { $regex: '^Elite Sports Equipment$', $options: 'i' } });
  const noPanVendor = await Vendor.findOne({ name: { $regex: '^NoPAN Traders$', $options: 'i' } });
  const brightPower = await Vendor.findOne({ name: { $regex: '^Bright Power Services$', $options: 'i' } });
  if (!walkIn || !sunrise || !repairsAccount || !maintenanceAccount || !otherIncomeAccount || !courtRentalAccount || !eliteSports || !noPanVendor || !brightPower) {
    throw new Error('Extended scenario prerequisites are missing.');
  }

  const mis03ExpenseRef = scopedSeedRef('MIS03-EXP');
  if (!(await JournalEntry.findOne({ referenceNo: mis03ExpenseRef }))) {
    await createJournalEntry({
      entryDate: at('2026-05-05T11:00:00+05:30'),
      referenceType: 'manual',
      referenceId: brightPower._id.toString(),
      referenceNo: mis03ExpenseRef,
      description: 'Dashboard net-expense seed bill - ACC-MIS-03',
      paymentMode: 'adjustment',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-MIS-03', entryType: 'expense_seed' },
      lines: [
        { accountId: repairsAccount._id, debit: 5000, credit: 0, description: 'Repairs expense seed' },
        { accountKey: 'accounts_payable', debit: 0, credit: 5000, description: 'Vendor payable seed' },
      ],
    });
  }
  const mis03CreditRef = scopedSeedRef('MIS03-CN');
  if (!(await JournalEntry.findOne({ referenceNo: mis03CreditRef }))) {
    await createJournalEntry({
      entryDate: at('2026-05-08T11:00:00+05:30'),
      referenceType: 'manual',
      referenceId: brightPower._id.toString(),
      referenceNo: mis03CreditRef,
      description: 'Dashboard vendor credit adjustment - ACC-MIS-03',
      paymentMode: 'adjustment',
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-MIS-03', entryType: 'credit_adjustment' },
      lines: [
        { accountKey: 'accounts_payable', debit: 2000, credit: 0, description: 'Reduce payable for vendor credit' },
        { accountId: repairsAccount._id, debit: 0, credit: 2000, description: 'Reverse repairs expense' },
      ],
    });
  }
  pushManifest('ACC-MIS-03', 'updated', [mis03ExpenseRef, mis03CreditRef], ['Use May 2026 on the MIS Dashboard: repairs expense 5000 less vendor credit adjustment 2000 leaves net expense 3000.']);

  for (const invoiceNumber of [scopedSeedRef('AINV-UAT-GST-B2B'), scopedSeedRef('AINV-UAT-GST-B2C')]) {
    if (await AccountingInvoice.findOne({ invoiceNumber })) continue;
    await createInvoice({
      invoiceNumber,
      invoiceDate: at(invoiceNumber.endsWith('B2B') ? '2026-06-05T10:00:00+05:30' : '2026-06-07T10:00:00+05:30'),
      customerId: invoiceNumber.endsWith('B2B') ? sunrise._id.toString() : walkIn._id.toString(),
      customerName: invoiceNumber.endsWith('B2B') ? sunrise.name : walkIn.name,
      description: 'GST outward seed batch',
      baseAmount: invoiceNumber.endsWith('B2B') ? 120000 : 50000,
      gstRate: 18,
      gstTreatment: 'intrastate',
      paymentAmount: 0,
      paymentMode: invoiceNumber.endsWith('B2B') ? 'bank_transfer' : 'cash',
      revenueAccountKey: invoiceNumber.endsWith('B2B') ? courtRentalAccount.accountCode : otherIncomeAccount.accountCode,
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-GST-01' },
    });
  }
  pushManifest('ACC-GST-01', 'updated', [scopedSeedRef('AINV-UAT-GST-B2B'), scopedSeedRef('AINV-UAT-GST-B2C')]);

  const gstCreditNoteNumber = scopedSeedRef('CN-UAT-GST-001');
  let gstCreditNote = await CreditNote.findOne({ noteNumber: gstCreditNoteNumber });
  if (!gstCreditNote) {
    gstCreditNote = await CreditNote.create({
      noteNumber: gstCreditNoteNumber,
      customerName: sunrise.name,
      customerPhone: sunrise.phone,
      customerEmail: sunrise.email,
      reason: 'Sales return GST reversal - ACC-GST-03',
      subtotal: 10000,
      taxAmount: 1800,
      totalAmount: 11800,
      balanceAmount: 11800,
      status: 'open',
      entries: [],
      issuedBy: createdBy,
      issuedAt: at('2026-06-25T12:00:00+05:30'),
      notes: `${SEED_TAG} ACC-GST-03`,
    });
    await setTimestamps(CreditNote, gstCreditNote._id.toString(), at('2026-06-25T12:00:00+05:30'));
  }
  pushManifest('ACC-GST-03', 'updated', [gstCreditNoteNumber]);
  pushManifest('ACC-GST-02', 'updated', ['June 2026 GST batch'], ['Use June 2026 in GST reconciliation tools for the seeded outward-tax dataset.']);

  const eliteProfile = await upsertDeducteeProfile({
    vendorId: eliteSports._id.toString(),
    deducteeName: eliteSports.name,
    deducteeType: 'vendor',
    residentialStatus: 'resident',
    pan: eliteSports.pan,
    email: eliteSports.email,
    phone: eliteSports.phone,
    notes: `${SEED_TAG} ACC-TDS-01`,
    createdBy,
  });
  const tds194iRef = scopedSeedRef('TDS-UAT-194I-01');
  if (!(await (await import('../src/server/models/TdsTransaction.ts')).TdsTransaction.findOne({ referenceNo: tds194iRef }))) {
    await recordTdsTransaction({
      transactionDate: '2026-08-10',
      transactionType: 'bill',
      deducteeProfileId: eliteProfile._id.toString(),
      vendorId: eliteSports._id.toString(),
      deducteeName: eliteSports.name,
      pan: eliteSports.pan,
      sectionCode: '194I',
      grossAmount: 80000,
      taxableAmount: 80000,
      rateOverride: 2,
      thresholdMonthlyOverride: 50000,
      tdsUseCaseKey: 'sports_facility_equipment_rent',
      tdsUseCaseLabel: 'Sports facility rent - equipment',
      referenceNo: tds194iRef,
      sourceType: 'vendor_bill',
      sourceId: eliteSports._id.toString(),
      postJournal: true,
      notes: `${SEED_TAG} ACC-TDS-01`,
      createdBy,
      metadata: { scenarioId: 'ACC-TDS-01', seedTag: SEED_TAG },
    });
  }
  pushManifest('ACC-TDS-01', 'updated', [tds194iRef]);

  const noPanProfile = await upsertDeducteeProfile({
    vendorId: noPanVendor._id.toString(),
    deducteeName: noPanVendor.name,
    deducteeType: 'vendor',
    residentialStatus: 'resident',
    pan: '',
    email: noPanVendor.email,
    phone: noPanVendor.phone,
    notes: `${SEED_TAG} ACC-TDS-02`,
    createdBy,
  });
  const TdsTransactionModel = (await import('../src/server/models/TdsTransaction.ts')).TdsTransaction;
  const tdsNoPanRef = scopedSeedRef('TDS-UAT-NOPAN-01');
  if (!(await TdsTransactionModel.findOne({ referenceNo: tdsNoPanRef }))) {
    await recordTdsTransaction({
      transactionDate: '2026-08-12',
      transactionType: 'bill',
      deducteeProfileId: noPanProfile._id.toString(),
      vendorId: noPanVendor._id.toString(),
      deducteeName: noPanVendor.name,
      pan: '',
      sectionCode: '194C',
      grossAmount: 100000,
      taxableAmount: 100000,
      rateOverride: 2,
      thresholdPerTransactionOverride: 30000,
      thresholdAnnualOverride: 100000,
      tdsUseCaseKey: 'contract_labour_company_firm',
      tdsUseCaseLabel: 'Contract labour - Company/Firm',
      referenceNo: tdsNoPanRef,
      sourceType: 'vendor_bill',
      sourceId: noPanVendor._id.toString(),
      postJournal: true,
      notes: `${SEED_TAG} ACC-TDS-02`,
      createdBy,
      metadata: { scenarioId: 'ACC-TDS-02', seedTag: SEED_TAG },
    });
  }
  pushManifest('ACC-TDS-02', 'updated', [tdsNoPanRef], ['PAN left blank intentionally so higher-rate TDS applies.']);

  const additionalLandlordProfile = await upsertDeducteeProfile({
    deducteeName: 'Sarva Infrastructure Holdings LLP',
    deducteeType: 'vendor',
    residentialStatus: 'resident',
    pan: 'AALFS6789Q',
    email: 'finance@infrastructure-holdings.example.com',
    phone: '9000000333',
    notes: `${SEED_TAG} ACC-TDS-03 support`,
    createdBy,
  });
  const tdsBldRef = scopedSeedRef('TDS-UAT-194I-BLD-01');
  if (!(await TdsTransactionModel.findOne({ referenceNo: tdsBldRef }))) {
    await recordTdsTransaction({
      transactionDate: '2026-08-14',
      transactionType: 'bill',
      deducteeProfileId: additionalLandlordProfile._id.toString(),
      deducteeName: 'Sarva Infrastructure Holdings LLP',
      pan: 'AALFS6789Q',
      sectionCode: '194I',
      grossAmount: 184000,
      taxableAmount: 184000,
      rateOverride: 10,
      thresholdMonthlyOverride: 50000,
      tdsUseCaseKey: 'sports_facility_building_rent',
      tdsUseCaseLabel: 'Sports facility rent - land/building',
      referenceNo: tdsBldRef,
      sourceType: 'vendor_bill',
      sourceId: 'landlord-seed',
      postJournal: true,
      notes: `${SEED_TAG} ACC-TDS-03 support`,
      createdBy,
      metadata: { scenarioId: 'ACC-TDS-03', seedTag: SEED_TAG },
    });
  }
  const TdsChallanModel = (await import('../src/server/models/TdsChallan.ts')).TdsChallan;
  const tdsChallanSerial = scopedSeedRef('UAT281Q1');
  if (!(await TdsChallanModel.findOne({ challanSerialNo: tdsChallanSerial }))) {
    await recordTdsChallan({
      paymentDate: '2026-08-20',
      financialYear: '2026-27',
      quarter: 'Q2',
      amount: 45000,
      bsrCode: '0510301',
      challanSerialNo: tdsChallanSerial,
      cin: scopedSeedRef('UAT281Q1HDFC'),
      bankName: 'HDFC Bank',
      depositMode: 'online',
      notes: `${SEED_TAG} ACC-TDS-03`,
      createdBy,
    });
  }
  pushManifest('ACC-TDS-03', 'updated', [tdsChallanSerial], ['Combined challan seeded to cover 194I, 194C, and 194J outstanding buckets.']);

  for (const invoiceNumber of [scopedSeedRef('AINV-UATSEQ-001'), scopedSeedRef('AINV-UATSEQ-002'), scopedSeedRef('AINV-UATSEQ-004')]) {
    if (await AccountingInvoice.findOne({ invoiceNumber })) continue;
    await createInvoice({
      invoiceNumber,
      invoiceDate: at('2026-10-05T10:00:00+05:30'),
      customerName: walkIn.name,
      customerId: walkIn._id.toString(),
      description: 'Missing sequence validator seed',
      baseAmount: 1000,
      gstRate: 0,
      gstTreatment: 'none',
      paymentAmount: 0,
      paymentMode: 'cash',
      revenueAccountKey: otherIncomeAccount.accountCode,
      createdBy,
      metadata: { seedTag: SEED_TAG, scenarioId: 'ACC-VAL-03' },
    });
  }
  pushManifest('ACC-VAL-03', 'updated', [scopedSeedRef('AINV-UATSEQ-001'), scopedSeedRef('AINV-UATSEQ-002'), scopedSeedRef('AINV-UATSEQ-004')], ['Invoice sequence intentionally leaves 003 missing.']);

  const lockedPeriodKey = scopedSeedRef('2026-11');
  let lockedPeriod = await FinancialPeriod.findOne({ periodKey: lockedPeriodKey });
  if (!lockedPeriod) {
    lockedPeriod = await FinancialPeriod.create({
      periodKey: lockedPeriodKey,
      month: 11,
      year: 2026,
      startDate: at('2026-11-01T00:00:00+05:30'),
      endDate: at('2026-11-30T23:59:59+05:30'),
      isLocked: true,
      lockedAt: at('2026-11-01T08:00:00+05:30'),
      lockedBy: createdBy,
      createdBy,
    });
  } else {
    lockedPeriod.isLocked = true;
    lockedPeriod.lockedAt = at('2026-11-01T08:00:00+05:30');
    lockedPeriod.lockedBy = createdBy;
    await lockedPeriod.save();
  }
  const lockedVoucherNumber = scopedSeedRef('UAT-LOCKED-001');
  if (!(await AccountLedgerEntry.findOne({ voucherNumber: lockedVoucherNumber }))) {
    await AccountLedgerEntry.create({
      accountId: repairsAccount._id,
      entryDate: at('2026-11-15T10:00:00+05:30'),
      voucherType: 'journal',
      voucherNumber: lockedVoucherNumber,
      referenceNo: lockedVoucherNumber,
      narration: 'Locked period backdated posting seed',
      paymentMode: 'adjustment',
      debit: 5000,
      credit: 0,
      runningBalance: 5000,
      createdBy,
      metadata: { source: 'manual_locked_period_seed', sourceId: lockedVoucherNumber, scenarioId: 'ACC-PER-01' },
    });
  }
  pushManifest('ACC-PER-01', 'updated', [lockedPeriodKey, lockedVoucherNumber], ['Locked period and backdated ledger row were seeded for closed-period validation.']);

  const unbalancedVoucherNumber = scopedSeedRef('UAT-UNBAL-001');
  if (!(await AccountLedgerEntry.findOne({ voucherNumber: unbalancedVoucherNumber }))) {
    await AccountLedgerEntry.create({
      accountId: repairsAccount._id,
      entryDate: at('2026-12-10T10:00:00+05:30'),
      voucherType: 'journal',
      voucherNumber: unbalancedVoucherNumber,
      referenceNo: unbalancedVoucherNumber,
      narration: 'Unbalanced ledger seed for validation',
      paymentMode: 'adjustment',
      debit: 5000,
      credit: 0,
      runningBalance: 5000,
      createdBy,
      metadata: { source: 'manual_unbalanced_seed', sourceId: unbalancedVoucherNumber, scenarioId: 'ACC-VAL-02' },
    });
  }
  pushManifest('ACC-VAL-02', 'updated', [unbalancedVoucherNumber], ['Single-sided ledger row intentionally breaks double-entry integrity in December 2026.']);

  pushManifest('ACC-VAL-01', 'updated', ['April 2026'], ['Use April 2026 for the healthiest seeded month. Negative validation seeds were isolated into October-November-December 2026.']);
  pushManifest('ACC-MIS-01', 'updated', [scopedSeedRef('AINV-UAT-INV01'), scopedSeedRef('AINV-UAT-INV02'), 'PB-001', 'SP-APR-01', scopedSeedRef('SP-UAT-01'), scopedSeedRef('UAT-PV-001')], ['Use April 2026 on the MIS Dashboard and Accounting Reports overview for the core healthy-month report pack.']);
  pushManifest('ACC-MIS-02', 'updated', [scopedSeedRef('AINV-UAT-GST-B2B'), scopedSeedRef('AINV-UAT-GST-B2C'), scopedSeedRef('CP-UAT-01')], ['June 2026 contains seeded revenue while July 2026 contains expense-only activity, which helps verify month-to-date revenue resets across months.']);
  pushManifest('ACC-TB-01', 'updated', ['April 2026'], ['Run Trial Balance for 2026-04-01 to 2026-04-30 after seeding the UAT tenant.']);
  pushManifest('ACC-PL-01', 'updated', ['April 2026'], ['Run Profit & Loss for 2026-04-01 to 2026-04-30 and cross-check the result against MIS Dashboard overview cards.']);
  pushManifest('ACC-BS-01', 'updated', ['2026-04-30'], ['Run Balance Sheet as on 2026-04-30 after April seeds are loaded.']);
  pushManifest('ACC-CHA-01', 'updated', ['UAT3202'], ['Tournament Entry Fees chart account ensured for ledger/report testing.']);
  pushManifest('ACC-LED-01', 'updated', ['UAT3101'], ['Court Rental income account receives seeded accounting invoices for ledger drill-down.']);
  pushManifest('ACC-LED-02', 'updated', ['UAT-CUST-SUNRISE'], ['Sunrise Sports School has invoices and payment activity for customer-wise ledger review.']);
  pushManifest('ACC-CB-01', 'updated', ['Primary cash/book openings'], ['Cash and bank openings plus vouchers/day-book rows were seeded; totals are cumulative across the full UAT dataset.']);
};

const writeManifest = async (
  tenantId: string,
  options: { tenantSlug: string; loginEmail?: string; loginPassword?: string | null }
) => {
  const dir = path.join(process.cwd(), 'backups');
  await fs.mkdir(dir, { recursive: true });
  const safeSlug = String(options.tenantSlug || 'tenant').replace(/[^a-z0-9_-]/gi, '-');
  const filePath = path.join(dir, `accounting-uat-seed-manifest-${safeSlug}.json`);
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        seedTag: SEED_TAG,
        generatedAt: new Date().toISOString(),
        tenantSlug: options.tenantSlug,
        tenantId,
        login: options.loginEmail
          ? { email: options.loginEmail, password: options.loginPassword ?? null }
          : null,
        manifest,
      },
      null,
      2
    ),
    'utf8'
  );
  return filePath;
};

const main = async () => {
  await connectDb();
  const tenant = await ensureTenantBySlug(TARGET_TENANT_SLUG, TARGET_TENANT_NAME);
  const tenantId = tenant._id.toString();
  await initializeTenantDefaultsSafely(tenantId);
  const { user, action: userAction, login } = await ensureAdminUser(tenantId);

  await runWithTenantContext(tenantId, async () => {
    await seedScenarioData(tenantId, user._id.toString());
    await seedExtendedScenarioData(user._id.toString());
  });

  const manifestPath = await writeManifest(tenantId, {
    tenantSlug: TARGET_TENANT_SLUG,
    loginEmail: userAction === 'existing' ? undefined : login,
    loginPassword: userAction === 'existing' ? null : TARGET_LOGIN_PASSWORD,
  });
  console.log(JSON.stringify({
    success: true,
    tenant: { id: tenantId, slug: TARGET_TENANT_SLUG, name: TARGET_TENANT_NAME },
    login: userAction === 'existing' ? null : { email: TARGET_LOGIN_EMAIL, password: TARGET_LOGIN_PASSWORD },
    seededByExistingUser: userAction === 'existing' ? login : null,
    userAction,
    scenarioCount: manifest.length,
    manifestPath,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error('Failed to seed accounting UAT scenarios.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
