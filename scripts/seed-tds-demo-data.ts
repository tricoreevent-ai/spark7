import 'dotenv/config';
import mongoose from 'mongoose';

import '../src/server/models/registerTenantPlugin.ts';

import { runWithTenantContext } from '../src/server/services/tenantContext.ts';
import { resolvePrimaryTenant } from '../src/server/services/tenant.ts';
import {
  generateTdsCertificate,
  generateTdsReturn,
  getIndianFinancialYear,
  recordTdsChallan,
  recordTdsTransaction,
  runTdsReconciliation,
  saveTdsCompanySettings,
  seedDefaultTdsSections,
  upsertDeducteeProfile,
} from '../src/server/services/tds.ts';
import { TdsCertificate } from '../src/server/models/TdsCertificate.ts';
import { TdsChallan } from '../src/server/models/TdsChallan.ts';
import { TdsDeducteeProfile } from '../src/server/models/TdsDeducteeProfile.ts';
import { TdsReconciliationRun } from '../src/server/models/TdsReconciliationRun.ts';
import { TdsTransaction } from '../src/server/models/TdsTransaction.ts';
import { User } from '../src/server/models/User.ts';

let createdBy: string | undefined;
const financialYear = getIndianFinancialYear(new Date('2026-04-15T10:00:00+05:30'));
const quarter = 'Q1' as const;

const demoTransactions = [
  {
    referenceNo: `TDS-DEMO-${financialYear}-RENT-LAND`,
    transactionDate: '2026-04-02',
    deducteeName: 'Prestige Sports Infrastructure LLP',
    pan: 'AALFP1234E',
    sectionCode: '194I',
    grossAmount: 125000,
    rateOverride: 10,
    thresholdMonthlyOverride: 50000,
    tdsUseCaseKey: 'sports_facility_building_rent',
    tdsUseCaseLabel: 'Sports facility rent - land/building',
    sourceType: 'facility_rent',
    notes: 'Demo monthly building rent for TDS testing.',
  },
  {
    referenceNo: `TDS-DEMO-${financialYear}-EQUIPMENT`,
    transactionDate: '2026-04-04',
    deducteeName: 'Court Equipment Leasing Co.',
    pan: 'AACCC5678Q',
    sectionCode: '194I',
    grossAmount: 85000,
    rateOverride: 2,
    thresholdMonthlyOverride: 50000,
    tdsUseCaseKey: 'sports_facility_equipment_rent',
    tdsUseCaseLabel: 'Sports facility rent - equipment',
    sourceType: 'facility_rent',
    notes: 'Demo shuttle machine and court equipment rent.',
  },
  {
    referenceNo: `TDS-DEMO-${financialYear}-CONTRACTOR`,
    transactionDate: '2026-04-05',
    deducteeName: 'Elite Facility Services Pvt Ltd',
    pan: 'AACCE5678Q',
    sectionCode: '194C',
    grossAmount: 120000,
    rateOverride: 2,
    thresholdPerTransactionOverride: 30000,
    thresholdAnnualOverride: 100000,
    tdsUseCaseKey: 'contract_labour_company_firm',
    tdsUseCaseLabel: 'Contract labour - Company/Firm',
    sourceType: 'contract_labour',
    notes: 'Demo housekeeping and maintenance contractor bill.',
  },
  {
    referenceNo: `TDS-DEMO-${financialYear}-COACH`,
    transactionDate: '2026-04-07',
    deducteeName: 'Coach Anil Kumar',
    pan: 'ABCDE2345F',
    sectionCode: '194J',
    grossAmount: 65000,
    rateOverride: 10,
    thresholdAnnualOverride: 50000,
    tdsUseCaseKey: 'professional_services',
    tdsUseCaseLabel: 'Professional services',
    sourceType: 'professional_services',
    notes: 'Demo professional coaching fee.',
  },
  {
    referenceNo: `TDS-DEMO-${financialYear}-PRIZE`,
    transactionDate: '2026-04-09',
    deducteeName: 'Rahul Tournament Winner',
    pan: 'AABPM3456G',
    sectionCode: '194B',
    grossAmount: 25000,
    rateOverride: 30,
    thresholdPerTransactionOverride: 10000,
    tdsUseCaseKey: 'event_prize_money',
    tdsUseCaseLabel: 'Event prize money',
    sourceType: 'event_prize',
    notes: 'Demo tournament prize money deduction.',
  },
];

const connectDb = async () => {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured. Add it to .env before seeding TDS demo data.');
  }
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 10000 });
  }
};

const ensureProfile = async (input: (typeof demoTransactions)[number]) => {
  const existing = await TdsDeducteeProfile.findOne({ deducteeName: input.deducteeName, deducteeType: 'vendor' });
  if (existing) return existing;
  return upsertDeducteeProfile({
    deducteeName: input.deducteeName,
    deducteeType: 'vendor',
    residentialStatus: 'resident',
    pan: input.pan,
    email: `${input.deducteeName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`,
    phone: '9000000000',
    notes: 'Demo TDS testing profile.',
    createdBy,
  });
};

const ensureTransaction = async (input: (typeof demoTransactions)[number], deducteeProfileId: string) => {
  const existing = await TdsTransaction.findOne({ referenceNo: input.referenceNo });
  if (existing) return existing;
  return recordTdsTransaction({
    transactionDate: input.transactionDate,
    transactionType: 'payment',
    deducteeProfileId,
    deducteeName: input.deducteeName,
    pan: input.pan,
    sectionCode: input.sectionCode,
    grossAmount: input.grossAmount,
    taxableAmount: input.grossAmount,
    rateOverride: input.rateOverride,
    thresholdPerTransactionOverride: input.thresholdPerTransactionOverride,
    thresholdMonthlyOverride: input.thresholdMonthlyOverride,
    thresholdAnnualOverride: input.thresholdAnnualOverride,
    tdsUseCaseKey: input.tdsUseCaseKey,
    tdsUseCaseLabel: input.tdsUseCaseLabel,
    referenceNo: input.referenceNo,
    sourceType: input.sourceType,
    sourceId: input.referenceNo,
    postJournal: false,
    notes: input.notes,
    createdBy,
    metadata: {
      seededDemo: true,
      tdsUseCaseKey: input.tdsUseCaseKey,
      tdsUseCaseLabel: input.tdsUseCaseLabel,
    },
  });
};

const main = async () => {
  await connectDb();
  const tenant = await resolvePrimaryTenant();
  const tenantId = tenant._id.toString();

  await runWithTenantContext(tenantId, async () => {
    const seedUser = await User.findOne({
      isDeleted: { $ne: true },
      isActive: { $ne: false },
      role: { $in: ['super_admin', 'admin'] },
    })
      .sort({ role: -1, createdAt: 1 })
      .select('_id');
    createdBy = seedUser?._id.toString();

    await saveTdsCompanySettings({
      legalName: 'Spark 7 Sports Arena Private Limited',
      pan: 'AABCS1234F',
      tan: 'BLRS12345F',
      deductorCategory: 'company',
      responsiblePersonName: 'Dinesh Chirayil',
      responsiblePersonDesignation: 'Director',
      email: 'accounts@spark7.in',
      phone: '9980100494',
      address: 'Spark7 Sports Arena, Bengaluru, Karnataka',
      notes: 'Demo configuration for validating TDS screens and reports.',
    }, createdBy);

    await seedDefaultTdsSections(createdBy);

    const profileByName = new Map<string, any>();
    for (const tx of demoTransactions) {
      const profile = await ensureProfile(tx);
      profileByName.set(tx.deducteeName, profile);
      await ensureTransaction(tx, profile._id.toString());
    }

    const challanSerialNo = `SP7TDS${financialYear.replace(/\D/g, '')}01`;
    const existingChallan = await TdsChallan.findOne({ challanSerialNo });
    if (!existingChallan) {
      const payableRefs = demoTransactions.slice(0, 3).map((row) => row.referenceNo);
      const payableRows = await TdsTransaction.find({ referenceNo: { $in: payableRefs }, balanceAmount: { $gt: 0 } });
      const amount = payableRows.reduce((sum, row) => sum + Number(row.balanceAmount || 0), 0);
      if (amount > 0) {
        await recordTdsChallan({
          paymentDate: '2026-04-12',
          financialYear,
          quarter,
          amount,
          bsrCode: '0510301',
          challanSerialNo,
          cin: `${challanSerialNo}HDFC`,
          bankName: 'HDFC Bank',
          depositMode: 'online',
          notes: 'Demo challan allocated to rent and contractor TDS.',
          createdBy,
        });
      }
    }

    await generateTdsReturn({
      formType: '26Q',
      financialYear,
      quarter,
      notes: 'Demo 26Q working file for TDS report testing.',
      createdBy,
    });

    const rentProfile = profileByName.get('Prestige Sports Infrastructure LLP');
    if (rentProfile) {
      const existingCertificate = await TdsCertificate.findOne({
        formType: 'Form16A',
        financialYear,
        quarter,
        deducteeProfileId: rentProfile._id,
      });
      if (!existingCertificate) {
        await generateTdsCertificate({
          deducteeProfileId: rentProfile._id.toString(),
          financialYear,
          quarter,
          formType: 'Form16A',
          createdBy,
        });
      }
    }

    const existingReconciliation = await TdsReconciliationRun.findOne({
      sourceType: 'form26as',
      financialYear,
      quarter,
      notes: 'Demo reconciliation import for TDS screen testing.',
    });
    if (!existingReconciliation) {
      await runTdsReconciliation({
        sourceType: 'form26as',
        financialYear,
        quarter,
        rawText: [
          'referenceNo,pan,tdsAmount',
          `${demoTransactions[0].referenceNo},${demoTransactions[0].pan},12500`,
          `${demoTransactions[1].referenceNo},${demoTransactions[1].pan},1600`,
          `TDS-DEMO-${financialYear}-GOVT-ONLY,AABPG9999K,999`,
        ].join('\n'),
        notes: 'Demo reconciliation import for TDS screen testing.',
        createdBy,
      });
    }

    const totals = await TdsTransaction.aggregate([
      { $match: { referenceNo: { $regex: `^TDS-DEMO-${financialYear}` } } },
      { $group: { _id: null, count: { $sum: 1 }, tds: { $sum: '$tdsAmount' }, outstanding: { $sum: '$balanceAmount' } } },
    ]);

    const summary = totals[0] || { count: 0, tds: 0, outstanding: 0 };
    console.log(`Seeded TDS demo data for tenant ${tenant.name} (${tenantId}).`);
    console.log(`Financial year ${financialYear}, transactions ${summary.count}, TDS ${summary.tds}, outstanding ${summary.outstanding}.`);
  });
};

main()
  .catch((error) => {
    console.error('Failed to seed TDS demo data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
