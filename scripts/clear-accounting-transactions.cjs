/* eslint-disable no-console */
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const readline = require('readline');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const args = new Set(process.argv.slice(2));
const getArgValue = (prefix) => {
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
};

const dryRun = args.has('--dry-run');
const yes = args.has('--yes');
const tenantId = getArgValue('--tenant=');
const fullReset = args.has('--full-reset');
const resetDerivedBalances = fullReset || args.has('--reset-derived-balances');
const resetOpeningBalances = fullReset || args.has('--reset-opening-balances');

const mongoUrl = process.env.DATABASE_URL || '';

const transactionCollections = [
  'accountledgerentries',
  'journalentries',
  'journallines',
  'accountinginvoices',
  'accountingpayments',
  'accountingvouchers',
  'customerledgerentries',
  'daybookentries',
  'salarypayments',
  'contractpayments',
  'receiptvouchers',
  'creditnotes',
  'sales',
  'returns',
  'orders',
  'quotes',
  'serviceorders',
  'facilitybookings',
  'eventbookings',
  'eventquotations',
  'membersubscriptions',
  'attendances',
  'purchaseorders',
  'purchasebills',
  'deliverychallans',
  'inventories',
  'inventorybatches',
  'stockledgerentries',
  'inventorytransfers',
  'bankfeedtransactions',
  'reconciliationlinks',
  'reconciliationbookstates',
  'dayendclosings',
  'cashfloatcounts',
  'tdstransactions',
  'tdschallans',
  'tdsreturns',
  'tdscertificates',
  'tdsreconciliationruns',
  'gstreturnrecords',
  'gstreconciliationruns',
  'payrollstatutorychallans',
  'payrollarrears',
  'payrollform16',
  'payrollfullfinalsettlements',
  'validation_reports',
  'validation_issue_feedback',
];

const fullResetDeleteCollections = [
  'fixedassets',
  'openingbalancesetups',
  'products',
  'auditlogs',
  'auditflags',
  'recordversions',
  'idempotencykeys',
  'numbersequences',
  'customerenquiries',
  'customercampaigns',
];

const deleteCollections = [...transactionCollections, ...(fullReset ? fullResetDeleteCollections : [])];

const preservedMasterExamples = [
  'tenants',
  'users',
  'chartaccounts',
  'accountgroups',
  'vendors',
  'customers',
  'categories',
  'suppliers',
  'employees',
  'facilities',
  'financialperiods',
  'stocklocations',
  'inventoryvaluationsettings',
  'membershipplans',
  'tdssections',
  'tdsdeducteeprofiles',
  'treasuryaccounts',
  'paymentmethodroutings',
  'appsettings',
  'validation_settings',
];

const prompt = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });

const collectionExists = async (db, name) => {
  const rows = await db.listCollections({ name }).toArray();
  return rows.length > 0;
};

const countDocumentsIfExists = async (db, name, filter) => {
  if (!(await collectionExists(db, name))) return null;
  return db.collection(name).countDocuments(filter);
};

const updateManyIfExists = async (db, name, filter, update) => {
  if (!(await collectionExists(db, name))) return { matchedCount: 0, modifiedCount: 0 };
  return db.collection(name).updateMany(filter, update);
};

const formatFilter = (filter) => (Object.keys(filter).length ? JSON.stringify(filter) : 'ALL DOCUMENTS');
const isAffirmativeConfirmation = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes' || normalized === 'clear sales and accounting data';
};

const pathExists = async (targetPath) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const dedupeTargets = (targets) => {
  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.type}:${target.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const collectRootLogTargets = async () => {
  const entries = await fs.readdir(process.cwd(), { withFileTypes: true }).catch(() => []);
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (/^server-.*\.log$/i.test(entry.name) || /^server-.*\.err\.log$/i.test(entry.name) || /^npm-debug\.log/i.test(entry.name))
    )
    .map((entry) => ({
      type: 'file',
      label: 'root log file',
      path: path.join(process.cwd(), entry.name),
    }));
};

const collectDesktopLogTargets = async () => {
  const appDataRoots = [
    process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  ];
  const appNames = ['SPARK AI', 'sarva', 'Sarva'];
  const targets = [];

  for (const rootDir of appDataRoots) {
    for (const appName of appNames) {
      const logDir = path.join(rootDir, appName, 'logs');
      if (!(await pathExists(logDir))) continue;
      const entries = await fs.readdir(logDir, { withFileTypes: true }).catch(() => []);
      entries
        .filter((entry) => entry.isFile() && /\.log$/i.test(entry.name))
        .forEach((entry) => {
          targets.push({
            type: 'file',
            label: 'desktop log file',
            path: path.join(logDir, entry.name),
          });
        });
    }
  }

  return dedupeTargets(targets);
};

const collectGeneratedUploadTargets = async () => {
  const tenantBaseDir = path.join(process.cwd(), 'uploads', 'tenants');
  if (!(await pathExists(tenantBaseDir))) return [];

  const generatedDirNames = new Set(['generated', 'reports', 'exports', 'validation-reports', 'print-cache', 'tmp', 'temp']);
  const tenantDirs = tenantId
    ? [{ name: tenantId, path: path.join(tenantBaseDir, tenantId) }]
    : (await fs.readdir(tenantBaseDir, { withFileTypes: true }).catch(() => []))
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ name: entry.name, path: path.join(tenantBaseDir, entry.name) }));

  const targets = [];
  for (const tenantDir of tenantDirs) {
    if (!(await pathExists(tenantDir.path))) continue;
    const childDirs = await fs.readdir(tenantDir.path, { withFileTypes: true }).catch(() => []);
    childDirs
      .filter((entry) => entry.isDirectory() && generatedDirNames.has(entry.name.toLowerCase()))
      .forEach((entry) => {
        targets.push({
          type: 'directory',
          label: 'generated report/export folder',
          path: path.join(tenantDir.path, entry.name),
        });
      });
  }

  return targets;
};

const collectFileCleanupTargets = async () => {
  if (!fullReset) return [];
  const targets = [
    ...(await collectRootLogTargets()),
    ...(await collectDesktopLogTargets()),
    ...(await collectGeneratedUploadTargets()),
  ];
  return dedupeTargets(targets);
};

const main = async () => {
  if (!mongoUrl) {
    throw new Error('DATABASE_URL is missing. Add it to .env or pass it through the environment.');
  }

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const filter = tenantId ? { tenantId } : {};

  console.log('');
  console.log('Sales + accounting data reset utility');
  console.log('Database:', mongoose.connection.name);
  console.log('Filter:', formatFilter(filter));
  console.log('Mode:', dryRun ? 'DRY RUN - no data will be deleted' : 'DELETE SALES + ACCOUNTING DATA');
  console.log('Derived reset:', resetDerivedBalances ? 'YES' : 'NO');
  console.log('Opening-balance reset:', resetOpeningBalances ? 'YES' : 'NO');
  console.log('');
  console.log('Collections targeted for deletion:');
  deleteCollections.forEach((name) => console.log(`- ${name}`));
  console.log('');
  console.log('Master/setup collections preserved, examples:');
  preservedMasterExamples.forEach((name) => console.log(`- ${name}`));
  console.log('');

  const existingCollections = [];
  for (const collectionName of deleteCollections) {
    if (await collectionExists(db, collectionName)) {
      const count = await db.collection(collectionName).countDocuments(filter);
      existingCollections.push({ collectionName, count });
    }
  }
  const fileCleanupTargets = await collectFileCleanupTargets();

  console.log('Delete plan:');
  existingCollections.forEach((row) => console.log(`- ${row.collectionName}: ${row.count}`));
  if (!existingCollections.length) {
    console.log('No matching transaction collections found.');
  }

  const additionalActions = [];
  if (resetDerivedBalances) {
    const customerCount = await countDocumentsIfExists(db, 'customers', filter);
    additionalActions.push(`- reset customers.outstandingBalance: ${customerCount ?? 0}`);
    if (!fullReset) {
      const productCount = await countDocumentsIfExists(db, 'products', filter);
      additionalActions.push(`- reset product stock-style fields: ${productCount ?? 0}`);
    }
  }
  if (resetOpeningBalances) {
    const chartAccountCount = await countDocumentsIfExists(db, 'chartaccounts', filter);
    const vendorCount = await countDocumentsIfExists(db, 'vendors', filter);
    const customerCount = await countDocumentsIfExists(db, 'customers', filter);
    const treasuryCount = await countDocumentsIfExists(db, 'treasuryaccounts', filter);
    additionalActions.push(`- reset chart account opening balances: ${chartAccountCount ?? 0}`);
    additionalActions.push(`- reset vendor opening balances: ${vendorCount ?? 0}`);
    additionalActions.push(`- reset customer opening balances: ${customerCount ?? 0}`);
    if (!fullReset) {
      const productCount = await countDocumentsIfExists(db, 'products', filter);
      additionalActions.push(`- reset product opening stock values: ${productCount ?? 0}`);
    }
    additionalActions.push(`- reset treasury account opening balances: ${treasuryCount ?? 0}`);
    if (!fullReset) {
      const openingSetupCount = await countDocumentsIfExists(db, 'openingbalancesetups', filter);
      additionalActions.push(`- unlock/clear opening balance setup state: ${openingSetupCount ?? 0}`);
    }
  }
  if (fullReset) {
    const productCount = await countDocumentsIfExists(db, 'products', filter);
    additionalActions.push(`- delete product catalog rows while preserving categories: ${productCount ?? 0}`);
  }

  if (additionalActions.length) {
    console.log('');
    console.log('Additional reset actions:');
    additionalActions.forEach((line) => console.log(line));
  }

  if (fileCleanupTargets.length) {
    console.log('');
    console.log('File cleanup targets:');
    fileCleanupTargets.forEach((target) => console.log(`- ${target.label}: ${target.path}`));
  }

  if (!existingCollections.length && !additionalActions.length && !fileCleanupTargets.length) {
    console.log('Nothing matched the requested reset scope.');
    return;
  }

  if (!dryRun && !yes) {
    const answer = await prompt('Type Y/YES or CLEAR SALES AND ACCOUNTING DATA to continue: ');
    if (!isAffirmativeConfirmation(answer)) {
      console.log('Cancelled. No data was deleted.');
      return;
    }
  }

  if (!dryRun) {
    for (const row of existingCollections) {
      const result = await db.collection(row.collectionName).deleteMany(filter);
      console.log(`Deleted ${result.deletedCount} from ${row.collectionName}`);
    }

    if (resetDerivedBalances) {
      await updateManyIfExists(db, 'customers', filter, { $set: { outstandingBalance: 0 } });
      if (!fullReset) {
        await updateManyIfExists(db, 'products', filter, {
          $set: {
            stock: 0,
            currentStock: 0,
            quantity: 0,
            reservedQuantity: 0,
            availableQuantity: 0,
            returnStock: 0,
            damagedStock: 0,
          },
        });
        console.log('Reset derived customer/product balance and stock fields.');
      } else {
        console.log('Reset customer outstanding balances.');
      }
    }

    if (resetOpeningBalances) {
      await updateManyIfExists(db, 'chartaccounts', filter, { $set: { openingBalance: 0, openingSide: 'debit' } });
      await updateManyIfExists(db, 'vendors', filter, { $set: { openingBalance: 0, openingSide: 'credit' } });
      await updateManyIfExists(db, 'customers', filter, { $set: { openingBalance: 0 } });
      if (!fullReset) {
        await updateManyIfExists(db, 'products', filter, { $set: { openingStockValue: 0 } });
      }
      await updateManyIfExists(db, 'treasuryaccounts', filter, { $set: { openingBalance: 0 } });
      await updateManyIfExists(db, 'openingbalancesetups', filter, {
        $set: { isLocked: false },
        $unset: {
          initializedAt: '',
          initializedBy: '',
          lockedAt: '',
          lockedBy: '',
        },
      });
      console.log(
        fullReset
          ? 'Reset ledger/customer/vendor/treasury opening balances and removed opening balance setup records when present.'
          : 'Reset ledger/customer/product/treasury opening balances and cleared opening balance setup state.'
      );
    }

    for (const target of fileCleanupTargets) {
      await fs.rm(target.path, { recursive: target.type === 'directory', force: true }).catch(() => undefined);
      console.log(`Deleted ${target.label}: ${target.path}`);
    }
  }

  console.log(dryRun ? 'Dry run completed.' : 'Sales and accounting data reset completed.');
};

main()
  .catch((error) => {
    console.error('Reset failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
