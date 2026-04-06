import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { ChartAccount } from '../models/ChartAccount.js';
import type { AccountSubType, AccountType } from '../models/ChartAccount.js';
import { AppSetting } from '../models/AppSetting.js';
import { NumberSequence } from '../models/NumberSequence.js';
import { OpeningBalanceSetup } from '../models/OpeningBalanceSetup.js';
import { ensureDefaultRolesAndPermissions } from './rbac.js';
import { backfillLegacyTenantIds } from './tenant.js';
import { runWithTenantContext } from './tenantContext.js';

const RESERVED_COLLECTION_PREFIX = 'system.';

const CORE_ACCOUNTS: Array<{
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType: AccountSubType;
}> = [
  { accountCode: '1000', accountName: 'Cash Account', accountType: 'asset', subType: 'cash' },
  { accountCode: '1010', accountName: 'Bank Account', accountType: 'asset', subType: 'bank' },
  { accountCode: '1100', accountName: 'Customer Control', accountType: 'asset', subType: 'customer' },
  { accountCode: '1200', accountName: 'Opening Stock', accountType: 'asset', subType: 'stock' },
  { accountCode: '2000', accountName: 'Supplier Control', accountType: 'liability', subType: 'supplier' },
  { accountCode: '3000', accountName: 'Sales Income', accountType: 'income', subType: 'general' },
  { accountCode: '3100', accountName: 'Other Income', accountType: 'income', subType: 'general' },
  { accountCode: '4000', accountName: 'Expense', accountType: 'expense', subType: 'general' },
  { accountCode: '4010', accountName: 'Salary Expense', accountType: 'expense', subType: 'general' },
  { accountCode: '4020', accountName: 'Contract Expense', accountType: 'expense', subType: 'general' },
];

const REQUIRED_SEQUENCE_KEYS = [
  'chart_account',
  'chart_account_manual',
  'customer_code',
  'event_booking_number',
  'corporate_event_booking_number',
  'event_payment_receipt_number',
  'sale_number',
  'invoice_number',
  'return_number',
  'credit_note',
  'receipt_voucher',
  'journal_entry',
  'accounting_invoice',
  'accounting_payment',
  'salary_voucher',
  'contract_voucher',
  'opening_balance_voucher',
];

const GENERAL_SETTINGS_KEY = 'general_settings';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildMailDefaults = () => ({
  smtpHost: String(process.env.SMTP_HOST || '').trim(),
  smtpPort: parseNumber(process.env.SMTP_PORT, 587),
  smtpUser: String(process.env.SMTP_USER || '').trim(),
  smtpPass: String(process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim(),
  smtpFromEmail: String(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '').trim(),
  smtpToRecipients: String(process.env.SMTP_TO_RECIPIENTS || '').trim(),
  smtpSecure: parseBoolean(process.env.SMTP_SECURE, parseNumber(process.env.SMTP_PORT, 587) === 465),
  appName: String(process.env.SMTP_APP_NAME || 'TriCore Events').trim() || 'TriCore Events',
});

const listUserCollections = async (): Promise<string[]> => {
  const db = mongoose.connection.db;
  if (!db) return [];
  const rows = await db.listCollections({}, { nameOnly: true }).toArray();
  return rows
    .map((entry) => String(entry.name || ''))
    .filter((name) => Boolean(name) && !name.startsWith(RESERVED_COLLECTION_PREFIX));
};

const backupDatabaseSnapshot = async (): Promise<string | null> => {
  const shouldBackup = parseBoolean(process.env.AUTO_DB_BACKUP_ON_START, true);
  if (!shouldBackup) return null;

  const db = mongoose.connection.db;
  if (!db) return null;

  const collections = await listUserCollections();
  if (collections.length === 0) return null;

  const backupDir = path.resolve(process.cwd(), process.env.DB_BACKUP_DIR || 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const payload: {
    meta: {
      version: number;
      exportedAt: Date;
      dbName: string;
      collections: string[];
    };
    collections: Record<string, unknown[]>;
  } = {
    meta: {
      version: 1,
      exportedAt: new Date(),
      dbName: db.databaseName,
      collections,
    },
    collections: {},
  };

  for (const name of collections) {
    payload.collections[name] = await db.collection(name).find({}).toArray();
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `db-backup-${db.databaseName}-${stamp}.json`);
  const serialized = JSON.stringify(EJSON.serialize(payload), null, 2);
  await fs.writeFile(filePath, serialized, 'utf8');
  return filePath;
};

const ensureCoreChartAccounts = async (): Promise<void> => {
  await ensureChartAccountIndexes();
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

const ensureChartAccountIndexes = async (): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) return;

  try {
    const collection = db.collection('chartaccounts');
    const indexes = await collection.indexes();
    const hasLegacyUniqueAccountCode = indexes.some(
      (index) => index.name === 'accountCode_1' && index.unique === true
    );
    if (hasLegacyUniqueAccountCode) {
      await collection.dropIndex('accountCode_1');
      console.log('Dropped legacy index chartaccounts.accountCode_1');
    }

    const hasTenantScopedUnique = indexes.some(
      (index) =>
        index.name === 'tenantId_1_accountCode_1' &&
        index.unique === true &&
        index.key?.tenantId === 1 &&
        index.key?.accountCode === 1
    );
    if (!hasTenantScopedUnique) {
      await collection.createIndex({ tenantId: 1, accountCode: 1 }, { unique: true, name: 'tenantId_1_accountCode_1' });
      console.log('Created index chartaccounts.tenantId_1_accountCode_1');
    }
  } catch (error) {
    console.warn('Chart account index migration warning:', error);
  }
};

const ensureBaselineSequences = async (): Promise<void> => {
  for (const key of REQUIRED_SEQUENCE_KEYS) {
    await NumberSequence.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, value: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
};

const ensureOpeningBalanceIndexes = async (): Promise<void> => {
  const db = mongoose.connection.db;
  if (!db) return;

  try {
    const collection = db.collection('openingbalancesetups');
    const indexes = await collection.indexes();
    const hasLegacyUniqueSetupKey = indexes.some(
      (index) => index.name === 'setupKey_1' && index.unique === true
    );
    if (hasLegacyUniqueSetupKey) {
      await collection.dropIndex('setupKey_1');
      console.log('Dropped legacy index openingbalancesetups.setupKey_1');
    }

    const hasTenantScopedUnique = indexes.some(
      (index) =>
        index.name === 'tenantId_1_setupKey_1' &&
        index.unique === true &&
        index.key?.tenantId === 1 &&
        index.key?.setupKey === 1
    );
    if (!hasTenantScopedUnique) {
      await collection.createIndex({ tenantId: 1, setupKey: 1 }, { unique: true, name: 'tenantId_1_setupKey_1' });
      console.log('Created index openingbalancesetups.tenantId_1_setupKey_1');
    }
  } catch (error) {
    console.warn('Opening balance index migration warning:', error);
  }
};

const ensureOpeningBalanceSetup = async (): Promise<void> => {
  await ensureOpeningBalanceIndexes();
  await OpeningBalanceSetup.findOneAndUpdate(
    { setupKey: 'primary' },
    { $setOnInsert: { setupKey: 'primary', isLocked: false } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const syncGeneralMailSettings = async (): Promise<void> => {
  const mailDefaults = buildMailDefaults();
  if (!mailDefaults.smtpHost || !mailDefaults.smtpUser || !mailDefaults.smtpPass) {
    return;
  }

  const existing = await AppSetting.findOne({ key: GENERAL_SETTINGS_KEY }).lean();
  const existingValue = existing?.value && typeof existing.value === 'object' ? existing.value : {};
  const nextValue = {
    ...(existingValue as Record<string, unknown>),
    mail: mailDefaults,
  };

  await AppSetting.findOneAndUpdate(
    { key: GENERAL_SETTINGS_KEY },
    { $set: { value: nextValue } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const initializeTenantDefaults = async (tenantId: string): Promise<void> => {
  await runWithTenantContext(tenantId, async () => {
    await ensureOpeningBalanceSetup();
    await ensureCoreChartAccounts();
    await ensureBaselineSequences();
    await syncGeneralMailSettings();
  });
};

export const bootstrapDatabaseOnStartup = async (): Promise<void> => {
  const baselineEnabled = parseBoolean(process.env.AUTO_DB_BASELINE_INIT, true);
  const existingCollections = await listUserCollections();
  const isLikelyNewDatabase = existingCollections.length === 0;

  const backupPath = await backupDatabaseSnapshot();
  if (backupPath) {
    console.log(`Database backup created: ${backupPath}`);
  }

  const defaultTenantId = await backfillLegacyTenantIds();

  if (!baselineEnabled) {
    return;
  }

  await ensureDefaultRolesAndPermissions();
  await initializeTenantDefaults(defaultTenantId);

  if (isLikelyNewDatabase) {
    console.log('New database detected. Baseline collections and required defaults were initialized.');
  } else {
    console.log('Baseline database defaults verified.');
  }
};
