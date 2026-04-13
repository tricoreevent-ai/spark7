import mongoose from 'mongoose';
import { ChartAccount } from '../models/ChartAccount.js';
import { TreasuryAccount, type ITreasuryAccount } from '../models/TreasuryAccount.js';
import { PaymentMethodRouting, type IPaymentMethodRouting, type TreasuryPaymentMethod } from '../models/PaymentMethodRouting.js';
import { BankFeedTransaction } from '../models/BankFeedTransaction.js';
import { ReconciliationLink } from '../models/ReconciliationLink.js';
import { ReconciliationBookState } from '../models/ReconciliationBookState.js';
import { CashFloatCount } from '../models/CashFloatCount.js';
import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { Sale } from '../models/Sale.js';
import { ReceiptVoucher } from '../models/ReceiptVoucher.js';
import { Return } from '../models/Return.js';
import { DayBookEntry } from '../models/DayBookEntry.js';
import { AccountingVoucher } from '../models/AccountingVoucher.js';
import { createJournalEntry, ensureAccountingChart } from './accountingEngine.js';
import { generateNumber } from './numbering.js';
import { writeAuditLog } from './audit.js';

export type TreasuryDirection = 'inflow' | 'outflow';

export interface TreasuryImportRow {
  date: string | Date;
  amount: number;
  description?: string;
  referenceNo?: string;
}

export interface DerivedBookEntry {
  key: string;
  treasuryAccountId: string;
  treasuryAccountName: string;
  chartAccountId?: string;
  sourceType: string;
  sourceId: string;
  kind: 'sale' | 'receipt' | 'refund' | 'expense' | 'voucher' | 'transfer' | 'accounting_payment';
  referenceNo?: string;
  description: string;
  amount: number;
  signedAmount: number;
  direction: TreasuryDirection;
  paymentMethod: string;
  paymentChannelLabel?: string;
  processorName?: string;
  bookDate: Date;
  expectedSettlementDate: Date;
  feePercent: number;
  fixedFee: number;
  raw?: Record<string, any>;
}

export interface TreasuryRouteContext {
  treasuryAccount: ITreasuryAccount;
  chartAccountId?: string;
  chartAccountCode?: string;
  chartAccountKey: string;
  settlementDays: number;
  feePercent: number;
  fixedFee: number;
  processorName?: string;
  channelLabel?: string;
}

export interface AutoMatchCandidate {
  type: 'refund' | 'batch' | 'single';
  keys: string[];
  difference: number;
  label: string;
}

const CASH_OVER_SHORT_ACCOUNT = 'Expense - Cash Over / Short';

export const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));

export const normalizeTreasuryPaymentMethod = (value?: string): TreasuryPaymentMethod => {
  const normalized = String(value || 'cash').trim().toLowerCase();
  if (normalized === 'bank') return 'bank';
  if (normalized === 'card') return 'card';
  if (normalized === 'upi') return 'upi';
  if (normalized === 'cheque') return 'cheque';
  if (normalized === 'online') return 'online';
  if (normalized === 'bank_transfer') return 'bank_transfer';
  if (normalized === 'original_payment') return 'original_payment';
  return 'cash';
};

export const startOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const endOfDay = (value: Date) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

export const addDays = (value: Date, days: number) => {
  const date = new Date(value);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
};

export const toDateKey = (value: Date | string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

export const toSignedAmount = (direction: TreasuryDirection, amount: number) =>
  direction === 'inflow' ? round2(Math.abs(amount)) : round2(-Math.abs(amount));

export const toleranceForAmount = (amount: number) => Math.max(1, round2(Math.abs(amount) * 0.0001));

export const withinTolerance = (expected: number, actual: number, tolerance?: number) =>
  Math.abs(round2(expected) - round2(actual)) <= (tolerance ?? toleranceForAmount(actual));

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
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

export const parseTreasuryCsv = (csvText: string): TreasuryImportRow[] => {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const dateIndex = header.findIndex((cell) => cell.includes('date'));
  const amountIndex = header.findIndex((cell) => cell.includes('amount'));
  const descIndex = header.findIndex((cell) => cell.includes('description') || cell.includes('narration') || cell.includes('particular'));
  const refIndex = header.findIndex((cell) => cell.includes('ref') || cell.includes('utr') || cell.includes('transaction'));
  if (dateIndex < 0 || amountIndex < 0) {
    throw new Error('CSV must contain Date and Amount columns');
  }

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      date: cells[dateIndex],
      amount: Number(cells[amountIndex] || 0),
      description: descIndex >= 0 ? cells[descIndex] : '',
      referenceNo: refIndex >= 0 ? cells[refIndex] : '',
    };
  }).filter((row) => row.date && Number.isFinite(row.amount));
};

const maskAccountNumber = (value: string) => {
  const clean = String(value || '').replace(/\s+/g, '');
  if (!clean) return '';
  if (clean.length <= 4) return clean;
  return `${'*'.repeat(Math.max(clean.length - 4, 0))}${clean.slice(-4)}`;
};

const normalizeAccountNumber = (value?: string) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const looksMaskedAccountNumber = (value: string) => /^[x*]+[0-9]{0,4}$/i.test(String(value || '').trim());

const findChartAccountBySystemOrCode = async (key: string) =>
  ChartAccount.findOne({
    $or: [
      { systemKey: String(key).trim().toLowerCase() },
      { accountCode: String(key).trim().toUpperCase() },
    ],
  });

const ensureManualChartAccount = async (args: {
  accountName: string;
  accountType: 'asset' | 'expense';
  subType: 'bank' | 'cash' | 'general';
  parentSystemKey?: string;
  createdBy?: string;
}) => {
  const exact = await ChartAccount.findOne({
    accountType: args.accountType,
    accountName: { $regex: `^${String(args.accountName).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (exact) return exact;

  const parent = args.parentSystemKey ? await ChartAccount.findOne({ systemKey: args.parentSystemKey }) : null;
  const accountCode = await generateNumber('chart_account_treasury', { prefix: 'TA-', padTo: 5 });
  return ChartAccount.create({
    accountCode,
    accountName: args.accountName,
    accountType: args.accountType,
    subType: args.subType,
    parentAccountId: parent?._id,
    openingBalance: 0,
    openingSide: 'debit',
    isSystem: false,
    isActive: true,
    createdBy: args.createdBy,
  });
};

export const ensureTreasuryDefaults = async (createdBy?: string) => {
  await ensureAccountingChart(createdBy);
  const primaryBankChart = await findChartAccountBySystemOrCode('bank_account');
  const cashFloatChart = await findChartAccountBySystemOrCode('cash_in_hand');
  if (!primaryBankChart || !cashFloatChart) {
    throw new Error('Core cash/bank chart accounts are not configured');
  }

  let primaryBank = await TreasuryAccount.findOne({ accountType: 'bank', isPrimary: true });
  if (!primaryBank) {
    primaryBank = await TreasuryAccount.create({
      accountType: 'bank',
      accountName: 'Primary Bank',
      displayName: 'Primary Bank',
      chartAccountId: primaryBankChart._id,
      chartAccountCode: primaryBankChart.accountCode,
      bankName: 'Primary Settlement Bank',
      isPrimary: true,
      isActive: true,
      openingBalance: 0,
      createdBy,
    });
  }

  let cashFloat = await TreasuryAccount.findOne({ accountType: 'cash_float', chartAccountId: cashFloatChart._id });
  if (!cashFloat) {
    cashFloat = await TreasuryAccount.create({
      accountType: 'cash_float',
      accountName: 'Main Cash Float',
      displayName: 'Main Cash Float',
      chartAccountId: cashFloatChart._id,
      chartAccountCode: cashFloatChart.accountCode,
      isPrimary: false,
      isActive: true,
      openingBalance: 0,
      createdBy,
    });
  }

  const defaultRoutes: Array<Partial<IPaymentMethodRouting>> = [
    { paymentMethod: 'cash', treasuryAccountId: cashFloat._id, settlementDays: 0, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'card', treasuryAccountId: primaryBank._id, settlementDays: 1, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'upi', treasuryAccountId: primaryBank._id, settlementDays: 0, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'bank_transfer', treasuryAccountId: primaryBank._id, settlementDays: 0, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'online', treasuryAccountId: primaryBank._id, settlementDays: 1, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'bank', treasuryAccountId: primaryBank._id, settlementDays: 0, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'cheque', treasuryAccountId: primaryBank._id, settlementDays: 1, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
    { paymentMethod: 'original_payment', treasuryAccountId: primaryBank._id, settlementDays: 0, feePercent: 0, fixedFee: 0, isDefault: true, isActive: true },
  ];

  for (const route of defaultRoutes) {
    await PaymentMethodRouting.findOneAndUpdate(
      { paymentMethod: route.paymentMethod, channelLabel: '' },
      { $setOnInsert: { ...route, channelLabel: '', createdBy } },
      { upsert: true, new: true }
    );
  }

  return { primaryBank, cashFloat };
};

const loadTreasuryMaps = async () => {
  await ensureTreasuryDefaults();
  const [accounts, routes] = await Promise.all([
    TreasuryAccount.find({ isActive: true }).sort({ accountType: 1, isPrimary: -1, displayName: 1 }),
    PaymentMethodRouting.find({ isActive: true }).sort({ isDefault: -1, paymentMethod: 1, channelLabel: 1 }),
  ]);
  const accountMap = new Map(accounts.map((row) => [String(row._id), row]));
  const chartAccountMap = new Map(accounts.filter((row) => row.chartAccountId).map((row) => [String(row.chartAccountId), row]));
  return { accounts, routes, accountMap, chartAccountMap };
};

const getRouteMatch = (routes: IPaymentMethodRouting[], paymentMethod: TreasuryPaymentMethod, channelLabel?: string) => {
  const normalizedLabel = String(channelLabel || '').trim().toLowerCase();
  return routes.find((route) => route.paymentMethod === paymentMethod && String(route.channelLabel || '') === normalizedLabel)
    || routes.find((route) => route.paymentMethod === paymentMethod && route.isDefault)
    || routes.find((route) => route.paymentMethod === paymentMethod)
    || null;
};

export const resolveTreasuryRoute = async (args: {
  paymentMethod?: string;
  treasuryAccountId?: string;
  channelLabel?: string;
}): Promise<TreasuryRouteContext> => {
  const { accounts, routes, accountMap } = await loadTreasuryMaps();
  const normalizedMethod = normalizeTreasuryPaymentMethod(args.paymentMethod);

  if (args.treasuryAccountId) {
    const treasuryAccount = accountMap.get(String(args.treasuryAccountId));
    if (!treasuryAccount) throw new Error('Selected treasury account not found');
    const chartAccount = treasuryAccount.chartAccountId ? await ChartAccount.findById(treasuryAccount.chartAccountId) : null;
    if (!chartAccount) throw new Error(`Chart account is not configured for ${treasuryAccount.displayName}`);
    return {
      treasuryAccount,
      chartAccountId: chartAccount._id.toString(),
      chartAccountCode: chartAccount.accountCode,
      chartAccountKey: chartAccount.systemKey || chartAccount.accountCode,
      settlementDays: 0,
      feePercent: 0,
      fixedFee: 0,
      processorName: treasuryAccount.processorName,
      channelLabel: args.channelLabel,
    };
  }

  const route = getRouteMatch(routes, normalizedMethod, args.channelLabel);
  const fallback = route
    ? accountMap.get(String(route.treasuryAccountId))
    : (normalizedMethod === 'cash'
        ? accounts.find((row) => row.accountType === 'cash_float')
        : accounts.find((row) => row.accountType === 'bank' && row.isPrimary));
  if (!fallback) throw new Error(`Treasury route is not configured for ${normalizedMethod}`);
  const chartAccount = fallback.chartAccountId ? await ChartAccount.findById(fallback.chartAccountId) : null;
  if (!chartAccount) throw new Error(`Chart account is missing for ${fallback.displayName}`);

  return {
    treasuryAccount: fallback,
    chartAccountId: chartAccount._id.toString(),
    chartAccountCode: chartAccount.accountCode,
    chartAccountKey: chartAccount.systemKey || chartAccount.accountCode,
    settlementDays: Number(route?.settlementDays || 0),
    feePercent: Number(route?.feePercent || 0),
    fixedFee: Number(route?.fixedFee || 0),
    processorName: route?.processorName || fallback.processorName,
    channelLabel: route?.channelLabel || undefined,
  };
};

export const upsertTreasuryAccount = async (args: {
  id?: string;
  accountType: 'bank' | 'cash_float';
  displayName: string;
  bankName?: string;
  accountNumber?: string;
  branchName?: string;
  ifscCode?: string;
  walletProvider?: string;
  processorName?: string;
  isPrimary?: boolean;
  openingBalance?: number;
  notes?: string;
  createdBy?: string;
}) => {
  await ensureTreasuryDefaults(args.createdBy);
  const displayName = String(args.displayName || '').trim();
  if (!displayName) {
    throw new Error('Treasury account name is required. Add a bank or cash label such as "HDFC Sports Store" or "Main Cash Counter".');
  }

  const existingRow = args.id ? await TreasuryAccount.findById(args.id) : null;
  if (args.id && !existingRow) {
    throw new Error('Selected treasury account was not found. It may have been deleted or changed by another user.');
  }

  const isPrimaryBank = args.accountType === 'bank' ? Boolean(args.isPrimary) : false;
  const rawAccountNumber = normalizeAccountNumber(args.accountNumber);
  const preserveExistingAccountNumber = !rawAccountNumber || looksMaskedAccountNumber(rawAccountNumber);
  if (args.accountType === 'bank' && rawAccountNumber && !looksMaskedAccountNumber(rawAccountNumber) && rawAccountNumber.length < 4) {
    throw new Error('Bank account number must contain at least 4 digits so the account can be identified safely.');
  }

  let chartAccount: any;
  const existingChartAccount = existingRow?.chartAccountId ? await ChartAccount.findById(existingRow.chartAccountId) : null;
  if (args.accountType === 'bank' && isPrimaryBank) {
    chartAccount = await findChartAccountBySystemOrCode('bank_account');
  } else if (existingChartAccount && !existingChartAccount.isSystem) {
    existingChartAccount.accountName = displayName;
    existingChartAccount.accountType = 'asset';
    existingChartAccount.subType = args.accountType === 'bank' ? 'bank' : 'cash';
    existingChartAccount.isActive = true;
    await existingChartAccount.save();
    chartAccount = existingChartAccount;
  } else if (args.accountType === 'cash_float' && existingChartAccount?.systemKey === 'cash_in_hand') {
    chartAccount = existingChartAccount;
  } else if (args.accountType === 'bank' && existingChartAccount?.systemKey === 'bank_account' && existingRow?.isPrimary) {
    chartAccount = await ensureManualChartAccount({
      accountName: displayName,
      accountType: 'asset',
      subType: 'bank',
      parentSystemKey: 'assets',
      createdBy: args.createdBy,
    });
  } else if (args.accountType === 'bank') {
    chartAccount = await ensureManualChartAccount({ accountName: displayName, accountType: 'asset', subType: 'bank', parentSystemKey: 'assets', createdBy: args.createdBy });
  } else {
    chartAccount = await ensureManualChartAccount({ accountName: displayName, accountType: 'asset', subType: 'cash', parentSystemKey: 'assets', createdBy: args.createdBy });
  }
  if (!chartAccount) throw new Error('Chart account could not be prepared for this treasury account');

  if (isPrimaryBank) {
    await TreasuryAccount.updateMany({ _id: { $ne: args.id }, accountType: 'bank', isPrimary: true }, { $set: { isPrimary: false } });
  }

  const nextAccountNumberLast4 = args.accountType === 'bank'
    ? (preserveExistingAccountNumber ? existingRow?.accountNumberLast4 : rawAccountNumber.slice(-4))
    : undefined;
  const nextAccountNumberMasked = args.accountType === 'bank'
    ? (preserveExistingAccountNumber ? existingRow?.accountNumberMasked : maskAccountNumber(rawAccountNumber))
    : undefined;

  if (args.accountType === 'bank' && !nextAccountNumberLast4) {
    throw new Error(
      existingRow
        ? 'Bank account number is required for this bank because no saved number exists yet. Enter the real account number once and save again.'
        : 'Bank account number is required for bank accounts. Enter the real account number and save again.'
    );
  }

  const payload = {
    accountType: args.accountType,
    accountName: displayName,
    displayName,
    chartAccountId: chartAccount._id,
    chartAccountCode: chartAccount.accountCode,
    bankName: String(args.bankName || '').trim() || undefined,
    accountNumberMasked: nextAccountNumberMasked,
    accountNumberLast4: nextAccountNumberLast4,
    branchName: String(args.branchName || '').trim() || undefined,
    ifscCode: String(args.ifscCode || '').trim().toUpperCase() || undefined,
    walletProvider: String(args.walletProvider || '').trim() || undefined,
    processorName: String(args.processorName || '').trim() || undefined,
    isPrimary: isPrimaryBank,
    isActive: true,
    openingBalance: round2(Number(args.openingBalance || 0)),
    notes: String(args.notes || '').trim() || undefined,
  };

  if (args.id) {
    const updated = await TreasuryAccount.findByIdAndUpdate(args.id, payload, { new: true, runValidators: true });
    if (!updated) {
      throw new Error('Treasury account could not be updated because the selected record no longer exists.');
    }
    return updated;
  }
  return TreasuryAccount.create({ ...payload, createdBy: args.createdBy });
};

export const upsertPaymentMethodRoute = async (args: {
  id?: string;
  paymentMethod: TreasuryPaymentMethod;
  treasuryAccountId: string;
  channelLabel?: string;
  processorName?: string;
  settlementDays?: number;
  feePercent?: number;
  fixedFee?: number;
  isDefault?: boolean;
  createdBy?: string;
}) => {
  await ensureTreasuryDefaults(args.createdBy);
  if (!String(args.treasuryAccountId || '').trim()) {
    throw new Error('Treasury account is required for payment routing. Select the bank or cash account that should receive this route.');
  }

  const existingRoute = args.id ? await PaymentMethodRouting.findById(args.id) : null;
  if (args.id && !existingRoute) {
    throw new Error('Selected payment route was not found. Refresh the route list and try editing again.');
  }

  const treasuryAccount = await TreasuryAccount.findById(args.treasuryAccountId);
  if (!treasuryAccount) throw new Error('Treasury account not found');

  const normalizedLabel = String(args.channelLabel || '').trim().toLowerCase();
  const normalizedMethod = normalizeTreasuryPaymentMethod(args.paymentMethod);
  const isDefaultRoute = normalizedLabel ? false : Boolean(args.isDefault ?? true);
  const payload = {
    paymentMethod: normalizedMethod,
    treasuryAccountId: treasuryAccount._id,
    channelLabel: normalizedLabel,
    processorName: String(args.processorName || '').trim() || undefined,
    settlementDays: Math.max(0, Number(args.settlementDays || 0)),
    feePercent: Math.max(0, Number(args.feePercent || 0)),
    fixedFee: Math.max(0, Number(args.fixedFee || 0)),
    isDefault: isDefaultRoute,
    isActive: true,
  };

  if (payload.isDefault) {
    await PaymentMethodRouting.updateMany(
      { _id: { $ne: args.id }, paymentMethod: payload.paymentMethod, channelLabel: '' },
      { $set: { isDefault: false } }
    );
  }

  if (args.id) {
    const updated = await PaymentMethodRouting.findByIdAndUpdate(args.id, payload, { new: true, runValidators: true });
    if (!updated) {
      throw new Error('Payment route could not be updated because the selected route no longer exists.');
    }
    return updated;
  }
  return PaymentMethodRouting.create({ ...payload, createdBy: args.createdBy });
};

export const writeTreasuryAudit = async (args: {
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}) =>
  writeAuditLog({
    module: 'accounting',
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    userId: args.userId,
    metadata: args.metadata,
  });

export const findRefundMatchCandidate = (
  bankAmount: number,
  bankDate: Date,
  description: string,
  candidates: DerivedBookEntry[]
): AutoMatchCandidate | null => {
  const normalizedDesc = String(description || '').toLowerCase();
  const negativeAmount = round2(Math.abs(bankAmount));
  const eligible = candidates
    .filter((entry) => entry.direction === 'outflow' && entry.kind === 'refund')
    .map((entry) => {
      const dateDiff = Math.abs(startOfDay(bankDate).getTime() - startOfDay(entry.expectedSettlementDate).getTime()) / (24 * 60 * 60 * 1000);
      const amountDiff = Math.abs(negativeAmount - entry.amount);
      const refScore =
        (entry.referenceNo && normalizedDesc.includes(String(entry.referenceNo).toLowerCase()) ? 2 : 0)
        + (normalizedDesc.includes('refund') ? 1 : 0);
      return { entry, dateDiff, amountDiff, refScore };
    })
    .filter((row) => row.dateDiff <= 30 && withinTolerance(row.entry.amount, negativeAmount, 1));

  const best = eligible.sort((a, b) =>
    b.refScore - a.refScore
    || a.amountDiff - b.amountDiff
    || a.dateDiff - b.dateDiff
  )[0];
  if (!best) return null;

  return {
    type: 'refund',
    keys: [best.entry.key],
    difference: round2(negativeAmount - best.entry.amount),
    label: `Refund ${best.entry.referenceNo || best.entry.description}`,
  };
};

export const findLumpSumDepositMatch = (
  bankAmount: number,
  bankDate: Date,
  candidates: DerivedBookEntry[]
): AutoMatchCandidate | null => {
  if (bankAmount <= 0) return null;
  const eligible = candidates
    .filter((entry) => {
      const diffDays = Math.abs(startOfDay(bankDate).getTime() - startOfDay(entry.expectedSettlementDate).getTime()) / (24 * 60 * 60 * 1000);
      return diffDays <= 5;
    })
    .sort((a, b) => a.expectedSettlementDate.getTime() - b.expectedSettlementDate.getTime());
  if (!eligible.length) return null;

  const groupedByDay = new Map<string, DerivedBookEntry[]>();
  for (const entry of eligible) {
    const dayKey = toDateKey(entry.expectedSettlementDate);
    const rows = groupedByDay.get(dayKey) || [];
    rows.push(entry);
    groupedByDay.set(dayKey, rows);
  }

  const dayKeys = Array.from(groupedByDay.keys()).sort();
  let best: AutoMatchCandidate | null = null;

  for (let startIndex = 0; startIndex < dayKeys.length; startIndex += 1) {
    for (let endIndex = startIndex; endIndex < Math.min(dayKeys.length, startIndex + 3); endIndex += 1) {
      const windowEntries = dayKeys.slice(startIndex, endIndex + 1).flatMap((key) => groupedByDay.get(key) || []);
      const expectedNet = round2(windowEntries.reduce((sum, entry) => {
        if (entry.direction === 'outflow') return sum - entry.amount;
        const fee = round2((entry.amount * Number(entry.feePercent || 0)) / 100 + Number(entry.fixedFee || 0));
        return sum + round2(entry.amount - fee);
      }, 0));
      const difference = round2(bankAmount - expectedNet);
      if (!withinTolerance(bankAmount, expectedNet, toleranceForAmount(bankAmount))) continue;
      const candidate: AutoMatchCandidate = {
        type: windowEntries.length > 1 ? 'batch' : 'single',
        keys: windowEntries.map((entry) => entry.key),
        difference,
        label: windowEntries.length > 1
          ? `${windowEntries.length} entries from ${dayKeys[startIndex]} to ${dayKeys[endIndex]}`
          : windowEntries[0]?.referenceNo || windowEntries[0]?.description || 'Single entry',
      };
      if (!best || Math.abs(candidate.difference) < Math.abs(best.difference) || candidate.keys.length > best.keys.length) {
        best = candidate;
      }
    }
  }

  return best;
};

const getDerivedBookEntriesUntil = async (endDate: Date): Promise<DerivedBookEntry[]> => {
  const cutoff = endOfDay(endDate);
  const { chartAccountMap } = await loadTreasuryMaps();
  const [ledgerRows, receipts, sales, returns, daybookRows, vouchers] = await Promise.all([
    AccountLedgerEntry.find({ entryDate: { $lte: cutoff }, isDeleted: { $ne: true } }).sort({ entryDate: 1, createdAt: 1, _id: 1 }),
    ReceiptVoucher.find({ entryDate: { $lte: cutoff } }).sort({ entryDate: 1, createdAt: 1 }),
    Sale.find({
      invoiceStatus: 'posted',
      saleStatus: { $in: ['completed', 'returned'] },
      createdAt: { $lte: cutoff },
    }).sort({ createdAt: 1 }),
    Return.find({
      returnStatus: 'approved',
      refundStatus: 'completed',
      createdAt: { $lte: cutoff },
    }).sort({ updatedAt: 1, createdAt: 1 }),
    DayBookEntry.find({
      entryDate: { $lte: cutoff },
      status: 'active',
      isDeleted: { $ne: true },
    }).sort({ entryDate: 1, createdAt: 1 }),
    AccountingVoucher.find({ isDeleted: { $ne: true } }).select('voucherNumber').lean(),
  ]);

  const voucherNumbers = new Set(vouchers.map((row: any) => String(row.voucherNumber || '')));
  const receiptSaleIds = new Set(
    receipts.flatMap((row: any) =>
      Array.isArray(row.allocations)
        ? row.allocations.map((allocation: any) => String(allocation.saleId || '')).filter(Boolean)
        : []
    )
  );
  const saleById = new Map(sales.map((row: any) => [String(row._id), row]));
  const results: DerivedBookEntry[] = [];

  for (const row of ledgerRows) {
    const treasuryAccount = chartAccountMap.get(String(row.accountId || ''));
    if (!treasuryAccount) continue;
    const inflow = Number(row.debit || 0) > 0;
    const amount = round2(Math.max(Number(row.debit || 0), Number(row.credit || 0)));
    if (amount <= 0) continue;
    results.push({
      key: `ledger:${row._id}`,
      treasuryAccountId: String(treasuryAccount._id),
      treasuryAccountName: treasuryAccount.displayName,
      chartAccountId: String(row.accountId || ''),
      sourceType: row.voucherType || 'ledger',
      sourceId: String(row._id),
      kind: row.voucherType === 'transfer'
        ? 'transfer'
        : row.voucherType === 'payment'
          ? 'expense'
          : row.voucherType === 'receipt'
            ? 'receipt'
            : row.voucherType === 'salary' || row.voucherType === 'contract'
              ? 'accounting_payment'
              : 'voucher',
      referenceNo: row.voucherNumber || row.referenceNo,
      description: row.narration || row.voucherType || 'Ledger movement',
      amount,
      signedAmount: toSignedAmount(inflow ? 'inflow' : 'outflow', amount),
      direction: inflow ? 'inflow' : 'outflow',
      paymentMethod: row.paymentMode || (treasuryAccount.accountType === 'cash_float' ? 'cash' : 'bank'),
      processorName: String((row.metadata as any)?.processorName || ''),
      paymentChannelLabel: String((row.metadata as any)?.paymentChannelLabel || ''),
      bookDate: new Date(row.entryDate),
      expectedSettlementDate: new Date(row.entryDate),
      feePercent: 0,
      fixedFee: 0,
      raw: row.toObject?.() || row,
    });
  }

  for (const row of receipts) {
    const route = row.treasuryAccountId
      ? await resolveTreasuryRoute({ treasuryAccountId: String(row.treasuryAccountId) })
      : await resolveTreasuryRoute({ paymentMethod: row.mode, channelLabel: row.paymentChannelLabel });
    results.push({
      key: `receipt:${row._id}`,
      treasuryAccountId: String(route.treasuryAccount._id),
      treasuryAccountName: route.treasuryAccount.displayName,
      chartAccountId: route.chartAccountId,
      sourceType: 'receipt_voucher',
      sourceId: String(row._id),
      kind: 'receipt',
      referenceNo: row.voucherNumber,
      description: `Receipt ${row.voucherNumber}`,
      amount: round2(Number(row.amount || 0)),
      signedAmount: round2(Number(row.amount || 0)),
      direction: 'inflow',
      paymentMethod: row.mode,
      paymentChannelLabel: row.paymentChannelLabel || route.channelLabel,
      processorName: row.processorName || route.processorName,
      bookDate: new Date(row.entryDate),
      expectedSettlementDate: row.expectedSettlementDate ? new Date(row.expectedSettlementDate) : addDays(new Date(row.entryDate), route.settlementDays),
      feePercent: route.feePercent,
      fixedFee: route.fixedFee,
      raw: row.toObject?.() || row,
    });
  }

  for (const row of sales) {
    if (receiptSaleIds.has(String(row._id))) continue;
    const directPaidAmount = round2(
      String(row.invoiceType || 'cash') === 'cash'
        ? Number(row.totalAmount || 0)
        : Math.max(0, Number(row.totalAmount || 0) - Number(row.outstandingAmount || 0) - Number(row.creditAppliedAmount || 0))
    );
    if (directPaidAmount <= 0) continue;
    const route = row.treasuryAccountId
      ? await resolveTreasuryRoute({ treasuryAccountId: String(row.treasuryAccountId) })
      : await resolveTreasuryRoute({ paymentMethod: row.paymentMethod, channelLabel: row.paymentChannelLabel });
    const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
    results.push({
      key: `sale:${row._id}`,
      treasuryAccountId: String(route.treasuryAccount._id),
      treasuryAccountName: route.treasuryAccount.displayName,
      chartAccountId: route.chartAccountId,
      sourceType: 'sale',
      sourceId: String(row._id),
      kind: 'sale',
      referenceNo: row.invoiceNumber || row.saleNumber,
      description: `Sale ${row.invoiceNumber || row.saleNumber}`,
      amount: directPaidAmount,
      signedAmount: directPaidAmount,
      direction: 'inflow',
      paymentMethod: row.paymentMethod,
      paymentChannelLabel: row.paymentChannelLabel || route.channelLabel,
      processorName: row.processorName || route.processorName,
      bookDate: createdAt,
      expectedSettlementDate: row.expectedSettlementDate ? new Date(row.expectedSettlementDate) : addDays(createdAt, route.settlementDays),
      feePercent: route.feePercent,
      fixedFee: route.fixedFee,
      raw: row.toObject?.() || row,
    });
  }

  for (const row of returns) {
    if (String(row.refundMethod || '').toLowerCase() === 'credit_note') continue;
    let method = normalizeTreasuryPaymentMethod(row.refundMethod);
    if (method === 'original_payment') {
      const linkedSale = row.saleId ? saleById.get(String(row.saleId)) : null;
      method = normalizeTreasuryPaymentMethod(linkedSale?.paymentMethod || 'cash');
    }
    const route = row.refundTreasuryAccountId
      ? await resolveTreasuryRoute({ treasuryAccountId: String(row.refundTreasuryAccountId) })
      : await resolveTreasuryRoute({ paymentMethod: method });
    const processedAt = row.refundProcessedAt ? new Date(row.refundProcessedAt) : new Date(row.updatedAt || row.createdAt || new Date());
    results.push({
      key: `return:${row._id}`,
      treasuryAccountId: String(route.treasuryAccount._id),
      treasuryAccountName: route.treasuryAccount.displayName,
      chartAccountId: route.chartAccountId,
      sourceType: 'return',
      sourceId: String(row._id),
      kind: 'refund',
      referenceNo: row.refundReferenceNo || row.returnNumber,
      description: `Refund ${row.returnNumber}`,
      amount: round2(Number(row.refundAmount || 0)),
      signedAmount: round2(-Number(row.refundAmount || 0)),
      direction: 'outflow',
      paymentMethod: method,
      paymentChannelLabel: route.channelLabel,
      processorName: route.processorName,
      bookDate: processedAt,
      expectedSettlementDate: row.refundExpectedSettlementDate ? new Date(row.refundExpectedSettlementDate) : addDays(processedAt, route.settlementDays),
      feePercent: 0,
      fixedFee: 0,
      raw: row.toObject?.() || row,
    });
  }

  for (const row of daybookRows) {
    if (row.referenceNo && voucherNumbers.has(String(row.referenceNo))) continue;
    const route = row.treasuryAccountId
      ? await resolveTreasuryRoute({ treasuryAccountId: String(row.treasuryAccountId) })
      : await resolveTreasuryRoute({ paymentMethod: row.paymentMethod });
    const amount = round2(Number(row.amount || 0));
    if (amount <= 0) continue;
    const direction: TreasuryDirection = row.entryType === 'income' ? 'inflow' : 'outflow';
    results.push({
      key: `daybook:${row._id}`,
      treasuryAccountId: String(route.treasuryAccount._id),
      treasuryAccountName: route.treasuryAccount.displayName,
      chartAccountId: route.chartAccountId,
      sourceType: 'daybook',
      sourceId: String(row._id),
      kind: 'expense',
      referenceNo: row.referenceNo || row._id.toString(),
      description: `${row.category}${row.narration ? ` - ${row.narration}` : ''}`,
      amount,
      signedAmount: toSignedAmount(direction, amount),
      direction,
      paymentMethod: row.paymentMethod,
      paymentChannelLabel: route.channelLabel,
      processorName: route.processorName,
      bookDate: new Date(row.entryDate),
      expectedSettlementDate: new Date(row.entryDate),
      feePercent: 0,
      fixedFee: 0,
      raw: row.toObject?.() || row,
    });
  }

  return results.sort((a, b) => a.expectedSettlementDate.getTime() - b.expectedSettlementDate.getTime());
};

const loadMatchingContext = async (endDate: Date) => {
  const cutoff = endOfDay(endDate);
  const [bookEntries, bankRows, links, states, cashCounts] = await Promise.all([
    getDerivedBookEntriesUntil(cutoff),
    BankFeedTransaction.find({ transactionDate: { $lte: cutoff } }).sort({ transactionDate: 1, createdAt: 1 }),
    ReconciliationLink.find({}).lean(),
    ReconciliationBookState.find({}).lean(),
    CashFloatCount.find({ countDate: { $lte: cutoff } }).sort({ countDate: -1, createdAt: -1 }).lean(),
  ]);

  const linksByBankId = new Map<string, any[]>();
  const linksByBookKey = new Map<string, any[]>();
  for (const link of links) {
    const bankId = String((link as any).bankTransactionId);
    const bankLinks = linksByBankId.get(bankId) || [];
    bankLinks.push(link);
    linksByBankId.set(bankId, bankLinks);

    const bookLinks = linksByBookKey.get(String((link as any).bookEntryKey)) || [];
    bookLinks.push(link);
    linksByBookKey.set(String((link as any).bookEntryKey), bookLinks);
  }

  const stateByBookKey = new Map<string, any>();
  for (const row of states) {
    stateByBookKey.set(`${String((row as any).treasuryAccountId)}::${String((row as any).bookEntryKey)}`, row);
  }

  const latestCashCountByAccount = new Map<string, any>();
  for (const row of cashCounts) {
    const accountId = String((row as any).treasuryAccountId);
    if (!latestCashCountByAccount.has(accountId)) {
      latestCashCountByAccount.set(accountId, row);
    }
  }

  return {
    bookEntries,
    bankRows,
    linksByBankId,
    linksByBookKey,
    stateByBookKey,
    latestCashCountByAccount,
  };
};

const getBankTransactionStatus = (bankAmount: number, links: any[]) => {
  const linkedAmount = round2(links.reduce((sum, row) => sum + Number((row as any).linkedAmount || 0), 0));
  const difference = round2(Math.abs(bankAmount) - linkedAmount);
  const allRefund = links.length > 0 && links.every((row) => String((row as any).kind) === 'refund');
  if (!links.length) return { status: 'unmatched' as const, linkedAmount: 0, difference: round2(Math.abs(bankAmount)) };
  if (withinTolerance(Math.abs(bankAmount), linkedAmount, toleranceForAmount(bankAmount))) {
    return {
      status: allRefund && bankAmount < 0 ? ('refund_linked' as const) : ('matched' as const),
      linkedAmount,
      difference: 0,
    };
  }
  return { status: 'partial' as const, linkedAmount, difference };
};

export const buildTreasuryDashboard = async (args: { startDate?: string; endDate?: string }) => {
  await ensureTreasuryDefaults();
  const start = startOfDay(args.startDate ? new Date(args.startDate) : addDays(new Date(), -7));
  const end = endOfDay(args.endDate ? new Date(args.endDate) : new Date());
  const { accounts } = await loadTreasuryMaps();
  const { bookEntries, bankRows, linksByBankId, linksByBookKey, stateByBookKey, latestCashCountByAccount } = await loadMatchingContext(end);
  const openingCutoff = new Date(start.getTime() - 1);

  const accountRows = accounts.map((account) => {
    const accountId = String(account._id);
    const entriesBefore = bookEntries.filter((entry) => entry.treasuryAccountId === accountId && entry.expectedSettlementDate <= openingCutoff);
    const entriesInRange = bookEntries.filter((entry) => entry.treasuryAccountId === accountId && entry.expectedSettlementDate >= start && entry.expectedSettlementDate <= end);
    const bankBefore = bankRows.filter((row) => String(row.treasuryAccountId) === accountId && new Date(row.transactionDate) <= openingCutoff);
    const bankInRange = bankRows.filter((row) => String(row.treasuryAccountId) === accountId && new Date(row.transactionDate) >= start && new Date(row.transactionDate) <= end);

    const projectedOpening = round2(Number(account.openingBalance || 0) + entriesBefore.reduce((sum, entry) => sum + entry.signedAmount, 0));
    const actualOpening = round2(Number(account.openingBalance || 0) + bankBefore.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const bankRowsWithStatus = bankInRange.map((row) => {
      const links = linksByBankId.get(String(row._id)) || [];
      const summary = row.isIgnored
        ? { status: 'ignored' as const, linkedAmount: 0, difference: 0 }
        : getBankTransactionStatus(Number(row.amount || 0), links);
      return {
        ...((row as any).toObject ? (row as any).toObject() : row),
        linkedAmount: summary.linkedAmount,
        difference: summary.difference,
        status: summary.status,
        links,
      };
    });

    const unmatchedBankTransactions = bankRowsWithStatus.filter((row) => row.status === 'unmatched' || row.status === 'partial');
    const matchedBankTransactions = bankRowsWithStatus.filter((row) => row.status === 'matched' || row.status === 'refund_linked');
    const unmatchedBookEntries = entriesInRange.filter((entry) => {
      if (entry.expectedSettlementDate > endOfDay(new Date())) return false;
      if ((linksByBookKey.get(entry.key) || []).length > 0) return false;
      const state = stateByBookKey.get(`${accountId}::${entry.key}`);
      return !(state && (state.action === 'ignore' || state.action === 'manual_deposit'));
    });

    const projectedBalance = round2(projectedOpening + entriesInRange.reduce((sum, entry) => sum + entry.signedAmount, 0));
    const actualBalance = round2(actualOpening + bankInRange.reduce((sum, row) => sum + Number(row.amount || 0), 0));

    return {
      account: {
        _id: account._id,
        accountType: account.accountType,
        displayName: account.displayName,
        bankName: account.bankName,
        isPrimary: account.isPrimary,
        chartAccountCode: account.chartAccountCode,
        openingBalance: account.openingBalance,
      },
      projectedOpening,
      actualOpening,
      projectedBalance,
      actualBalance,
      variance: round2(actualBalance - projectedBalance),
      matchedBank: {
        count: matchedBankTransactions.length,
        amount: round2(matchedBankTransactions.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)),
      },
      unmatchedBank: {
        count: unmatchedBankTransactions.length,
        amount: round2(unmatchedBankTransactions.reduce((sum, row) => sum + Math.abs(Number(row.amount || 0)), 0)),
        rows: unmatchedBankTransactions,
      },
      unmatchedBook: {
        count: unmatchedBookEntries.length,
        amount: round2(unmatchedBookEntries.reduce((sum, row) => sum + row.amount, 0)),
        rows: unmatchedBookEntries,
      },
      latestCashCount: latestCashCountByAccount.get(accountId) || null,
    };
  });

  return {
    period: { startDate: start, endDate: end },
    accounts: accountRows,
  };
};

export const importBankFeed = async (args: {
  treasuryAccountId: string;
  rows: TreasuryImportRow[];
  createdBy?: string;
}) => {
  await ensureTreasuryDefaults(args.createdBy);
  const treasuryAccount = await TreasuryAccount.findById(args.treasuryAccountId);
  if (!treasuryAccount) throw new Error('Treasury account not found');
  if (treasuryAccount.accountType !== 'bank') throw new Error('Bank feeds can only be imported into bank accounts');

  const created = [];
  for (const row of args.rows) {
    const transactionDate = new Date(row.date);
    if (Number.isNaN(transactionDate.getTime())) continue;
    const doc = await BankFeedTransaction.create({
      treasuryAccountId: treasuryAccount._id,
      transactionDate,
      amount: round2(Number(row.amount || 0)),
      description: String(row.description || '').trim() || undefined,
      referenceNo: String(row.referenceNo || '').trim() || undefined,
      source: 'import',
      matchStatus: 'unmatched',
      isIgnored: false,
      rawPayload: row,
      createdBy: args.createdBy,
    });
    created.push(doc);
  }
  return created;
};

export const applyManualMatch = async (args: {
  bankTransactionId: string;
  bookEntryKeys: string[];
  createdBy?: string;
}) => {
  const bankTransaction = await BankFeedTransaction.findById(args.bankTransactionId);
  if (!bankTransaction) throw new Error('Bank transaction not found');

  const { bookEntries } = await loadMatchingContext(new Date(bankTransaction.transactionDate));
  const selectedEntries = bookEntries.filter((entry) => args.bookEntryKeys.includes(entry.key));
  if (!selectedEntries.length) throw new Error('No valid book entries selected');

  await ReconciliationLink.deleteMany({ bankTransactionId: bankTransaction._id });
  for (const entry of selectedEntries) {
    await ReconciliationLink.create({
      bankTransactionId: bankTransaction._id,
      treasuryAccountId: bankTransaction.treasuryAccountId,
      bookEntryKey: entry.key,
      bookSourceType: entry.sourceType,
      bookSourceId: entry.sourceId,
      bookReferenceNo: entry.referenceNo,
      linkedAmount: entry.amount,
      bookAmount: entry.amount,
      kind: entry.kind,
      createdBy: args.createdBy,
    });
  }

  const links = await ReconciliationLink.find({ bankTransactionId: bankTransaction._id }).lean();
  const status = getBankTransactionStatus(Number(bankTransaction.amount || 0), links);
  bankTransaction.matchStatus = status.status;
  bankTransaction.isIgnored = false;
  await bankTransaction.save();
  return { bankTransaction, links, status };
};

export const setBankTransactionIgnored = async (args: { bankTransactionId: string; ignored: boolean }) => {
  const row = await BankFeedTransaction.findById(args.bankTransactionId);
  if (!row) throw new Error('Bank transaction not found');
  row.isIgnored = args.ignored;
  row.matchStatus = args.ignored ? 'ignored' : 'unmatched';
  await row.save();
  if (!args.ignored) {
    await ReconciliationLink.deleteMany({ bankTransactionId: row._id });
  }
  return row;
};

export const setBookEntryState = async (args: {
  treasuryAccountId: string;
  bookEntryKey: string;
  action: 'ignore' | 'manual_deposit';
  notes?: string;
  createdBy?: string;
}) =>
  ReconciliationBookState.findOneAndUpdate(
    { treasuryAccountId: args.treasuryAccountId, bookEntryKey: args.bookEntryKey },
    {
      treasuryAccountId: args.treasuryAccountId,
      bookEntryKey: args.bookEntryKey,
      action: args.action,
      notes: args.notes,
      createdBy: args.createdBy,
    },
    { upsert: true, new: true, runValidators: true }
  );

export const createExpenseFromBankTransaction = async (args: {
  bankTransactionId: string;
  category: string;
  narration?: string;
  createdBy?: string;
}) => {
  const bankTransaction = await BankFeedTransaction.findById(args.bankTransactionId);
  if (!bankTransaction) throw new Error('Bank transaction not found');
  if (Number(bankTransaction.amount || 0) >= 0) {
    throw new Error('Only outgoing bank transactions can be converted into an expense');
  }
  const treasuryAccount = await TreasuryAccount.findById(bankTransaction.treasuryAccountId);
  if (!treasuryAccount) throw new Error('Treasury account not found');

  const dayBook = await DayBookEntry.create({
    entryType: 'expense',
    category: String(args.category || 'Bank Expense').trim() || 'Bank Expense',
    amount: round2(Math.abs(Number(bankTransaction.amount || 0))),
    paymentMethod: 'bank',
    treasuryAccountId: treasuryAccount._id,
    treasuryAccountName: treasuryAccount.displayName,
    narration: args.narration || bankTransaction.description || 'Imported bank expense',
    referenceNo: bankTransaction.referenceNo || `BANK-${bankTransaction._id.toString().slice(-6).toUpperCase()}`,
    entryDate: bankTransaction.transactionDate,
    createdBy: args.createdBy,
  });

  await applyManualMatch({
    bankTransactionId: bankTransaction._id.toString(),
    bookEntryKeys: [`daybook:${dayBook._id}`],
    createdBy: args.createdBy,
  });
  return dayBook;
};

export const autoMatchTreasuryTransactions = async (args: {
  treasuryAccountId?: string;
  startDate?: string;
  endDate?: string;
  createdBy?: string;
}) => {
  const dashboard = await buildTreasuryDashboard({ startDate: args.startDate, endDate: args.endDate });
  const endDate = dashboard.period.endDate;
  const { bookEntries } = await loadMatchingContext(endDate);
  const matched: Array<{ bankTransactionId: string; candidate: AutoMatchCandidate }> = [];

  for (const account of dashboard.accounts) {
    if (args.treasuryAccountId && String(account.account._id) !== String(args.treasuryAccountId)) continue;
    const accountBookEntries = bookEntries.filter((entry) => entry.treasuryAccountId === String(account.account._id));
    for (const row of account.unmatchedBank.rows) {
      const candidate =
        (Number(row.amount || 0) < 0
          ? findRefundMatchCandidate(Number(row.amount || 0), new Date(row.transactionDate), row.description || '', accountBookEntries)
          : null)
        || findLumpSumDepositMatch(Number(row.amount || 0), new Date(row.transactionDate), accountBookEntries);
      if (!candidate) continue;
      await applyManualMatch({
        bankTransactionId: String(row._id),
        bookEntryKeys: candidate.keys,
        createdBy: args.createdBy,
      });
      matched.push({ bankTransactionId: String(row._id), candidate });
    }
  }

  return matched;
};

export const recordCashFloatCount = async (args: {
  treasuryAccountId: string;
  countDate?: string;
  physicalAmount: number;
  notes?: string;
  createAdjustment?: boolean;
  createdBy?: string;
}) => {
  const treasuryAccount = await TreasuryAccount.findById(args.treasuryAccountId);
  if (!treasuryAccount) throw new Error('Treasury account not found');
  if (treasuryAccount.accountType !== 'cash_float') throw new Error('Cash count can only be recorded for a cash float account');

  const dashboard = await buildTreasuryDashboard({
    startDate: args.countDate || new Date().toISOString().slice(0, 10),
    endDate: args.countDate || new Date().toISOString().slice(0, 10),
  });
  const dashboardRow = dashboard.accounts.find((row) => String(row.account._id) === String(treasuryAccount._id));
  const calculatedBalance = round2(Number(dashboardRow?.projectedBalance || 0));
  const physicalAmount = round2(Number(args.physicalAmount || 0));
  const varianceAmount = round2(physicalAmount - calculatedBalance);
  const countDate = args.countDate ? new Date(args.countDate) : new Date();
  let adjustmentJournalId: mongoose.Types.ObjectId | undefined;

  if (args.createAdjustment && varianceAmount !== 0) {
    const expenseAccount = await ensureManualChartAccount({
      accountName: CASH_OVER_SHORT_ACCOUNT,
      accountType: 'expense',
      subType: 'general',
      parentSystemKey: 'expenses',
      createdBy: args.createdBy,
    });
    const chartAccount = treasuryAccount.chartAccountId ? await ChartAccount.findById(treasuryAccount.chartAccountId) : null;
    if (!chartAccount) throw new Error('Treasury chart account is missing');

    const journal = await createJournalEntry({
      entryDate: countDate,
      referenceType: 'reversal',
      referenceNo: `CASHCOUNT-${toDateKey(countDate)}`,
      description: `Cash float variance adjustment for ${treasuryAccount.displayName}`,
      paymentMode: 'adjustment',
      createdBy: args.createdBy,
      metadata: { treasuryAccountId: treasuryAccount._id.toString(), cashVariance: varianceAmount },
      lines: varianceAmount < 0
        ? [
            { accountId: expenseAccount._id, debit: Math.abs(varianceAmount), credit: 0, description: 'Cash shortage' },
            { accountId: chartAccount._id, debit: 0, credit: Math.abs(varianceAmount), description: 'Reduce cash float' },
          ]
        : [
            { accountId: chartAccount._id, debit: Math.abs(varianceAmount), credit: 0, description: 'Increase cash float' },
            { accountId: expenseAccount._id, debit: 0, credit: Math.abs(varianceAmount), description: 'Cash overage' },
          ],
    });
    adjustmentJournalId = journal.entry._id as mongoose.Types.ObjectId;
  }

  return CashFloatCount.create({
    treasuryAccountId: treasuryAccount._id,
    countDate,
    calculatedBalance,
    physicalAmount,
    varianceAmount,
    adjustmentJournalId,
    notes: args.notes,
    createdBy: args.createdBy,
  });
};
