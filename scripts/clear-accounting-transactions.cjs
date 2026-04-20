/* eslint-disable no-console */
const path = require('path');
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
const resetDerivedBalances = args.has('--reset-derived-balances');
const resetOpeningBalances = args.has('--reset-opening-balances');

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

const preservedMasterExamples = [
  'tenants',
  'users',
  'chartaccounts',
  'accountgroups',
  'vendors',
  'customers',
  'products',
  'categories',
  'suppliers',
  'employees',
  'facilities',
  'fixedassets',
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

const formatFilter = (filter) => (Object.keys(filter).length ? JSON.stringify(filter) : 'ALL DOCUMENTS');

const main = async () => {
  if (!mongoUrl) {
    throw new Error('DATABASE_URL is missing. Add it to .env or pass it through the environment.');
  }

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const filter = tenantId ? { tenantId } : {};

  console.log('');
  console.log('Accounting transaction reset utility');
  console.log('Database:', mongoose.connection.name);
  console.log('Filter:', formatFilter(filter));
  console.log('Mode:', dryRun ? 'DRY RUN - no data will be deleted' : 'DELETE TRANSACTION DATA');
  console.log('');
  console.log('Transaction collections targeted:');
  transactionCollections.forEach((name) => console.log(`- ${name}`));
  console.log('');
  console.log('Master/setup collections preserved, examples:');
  preservedMasterExamples.forEach((name) => console.log(`- ${name}`));
  console.log('');

  const existingCollections = [];
  for (const collectionName of transactionCollections) {
    if (await collectionExists(db, collectionName)) {
      const count = await db.collection(collectionName).countDocuments(filter);
      existingCollections.push({ collectionName, count });
    }
  }

  console.log('Delete plan:');
  existingCollections.forEach((row) => console.log(`- ${row.collectionName}: ${row.count}`));
  if (!existingCollections.length) {
    console.log('No matching transaction collections found.');
    return;
  }

  if (!dryRun && !yes) {
    const answer = await prompt('Type CLEAR ACCOUNTING TRANSACTIONS to continue: ');
    if (answer !== 'CLEAR ACCOUNTING TRANSACTIONS') {
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
      await db.collection('customers').updateMany(filter, { $set: { outstandingBalance: 0 } });
      await db.collection('vendors').updateMany(filter, { $set: { openingBalance: 0 } });
      await db.collection('products').updateMany(filter, {
        $set: {
          stock: 0,
          currentStock: 0,
          quantity: 0,
          reservedQuantity: 0,
          availableQuantity: 0,
        },
      });
      console.log('Reset derived customer/vendor/product balance fields.');
    }

    if (resetOpeningBalances) {
      await db.collection('chartaccounts').updateMany(filter, { $set: { openingBalance: 0, openingSide: 'debit' } });
      await db.collection('vendors').updateMany(filter, { $set: { openingBalance: 0, openingSide: 'credit' } });
      console.log('Reset chart account and vendor opening balances.');
    }
  }

  console.log(dryRun ? 'Dry run completed.' : 'Accounting transaction reset completed.');
};

main()
  .catch((error) => {
    console.error('Reset failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
  });
