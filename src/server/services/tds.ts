import mongoose from 'mongoose';
import { AppSetting } from '../models/AppSetting.js';
import { Vendor } from '../models/Vendor.js';
import { TdsSection, type ITdsSection, type TdsFormType } from '../models/TdsSection.js';
import { TdsDeducteeProfile, type ITdsDeducteeProfile, type TdsDeducteeType, type TdsResidentialStatus } from '../models/TdsDeducteeProfile.js';
import { TdsTransaction, type ITdsTransaction, type TdsTransactionType } from '../models/TdsTransaction.js';
import { TdsChallan } from '../models/TdsChallan.js';
import { TdsReturn, type TdsReturnStatus } from '../models/TdsReturn.js';
import { TdsCertificate, type TdsCertificateFormType } from '../models/TdsCertificate.js';
import { TdsReconciliationRun, type TdsReconciliationSource } from '../models/TdsReconciliationRun.js';
import { AuditLog } from '../models/AuditLog.js';
import { writeAuditLog } from './audit.js';
import { writeAuditFlag } from './auditFlag.js';
import { writeRecordVersion } from './recordVersion.js';
import { createJournalEntry, ensureAccountingChart } from './accountingEngine.js';

const COMPANY_SETTING_KEY = 'tds_company_settings';
const GOVERNMENT_RATE_REFERENCE = 'Income Tax Department TDS rates page. Review current rates before statutory filing.';

export interface TdsCompanySettings {
  legalName?: string;
  pan?: string;
  tan?: string;
  deductorCategory?: string;
  responsiblePersonName?: string;
  responsiblePersonDesignation?: string;
  email?: string;
  phone?: string;
  address?: string;
  lastReviewedAt?: string;
  notes?: string;
}

export interface TdsCalculationInput {
  transactionDate?: Date | string;
  deducteeProfileId?: string;
  vendorId?: string;
  deducteeName?: string;
  pan?: string;
  sectionId?: string;
  sectionCode?: string;
  transactionType?: TdsTransactionType;
  grossAmount: number;
  taxableAmount?: number;
  rateOverride?: number;
  thresholdPerTransactionOverride?: number;
  thresholdMonthlyOverride?: number;
  thresholdAnnualOverride?: number;
  tdsUseCaseKey?: string;
  tdsUseCaseLabel?: string;
  referenceNo?: string;
  sourceType?: string;
  sourceId?: string;
}

interface RecordTdsInput extends TdsCalculationInput {
  notes?: string;
  postJournal?: boolean;
  createdBy?: string;
  metadata?: Record<string, any>;
}

interface TdsSectionInput {
  sectionCode: string;
  returnSectionCode?: string;
  actReference?: '1961' | '2025' | 'transition';
  sectionName: string;
  natureOfPayment?: string;
  defaultRate: number;
  panMissingRate?: number;
  thresholdPerTransaction?: number;
  thresholdMonthly?: number;
  thresholdAnnual?: number;
  formType?: TdsFormType;
  effectiveFrom?: Date | string;
  effectiveTo?: Date | string;
  isActive?: boolean;
  notes?: string;
  statutoryReference?: string;
  rateMatrix?: Record<string, any>;
}

interface DeducteeProfileInput {
  vendorId?: string;
  deducteeName?: string;
  deducteeType?: TdsDeducteeType;
  residentialStatus?: TdsResidentialStatus;
  pan?: string;
  email?: string;
  phone?: string;
  defaultSectionId?: string;
  lowerDeductionCertificate?: {
    enabled?: boolean;
    certificateNumber?: string;
    rate?: number;
    validFrom?: Date | string;
    validTo?: Date | string;
    amountLimit?: number;
    notes?: string;
  };
  isActive?: boolean;
  notes?: string;
  createdBy?: string;
}

export const roundTds = (value: number): number => Number(Number(value || 0).toFixed(2));

const normalizeText = (value: unknown): string => String(value ?? '').trim();
const normalizeUpper = (value: unknown): string => normalizeText(value).toUpperCase();

export const normalizePan = (value?: string): string => normalizeUpper(value).replace(/[^A-Z0-9]/g, '').slice(0, 10);
export const normalizeTan = (value?: string): string => normalizeUpper(value).replace(/[^A-Z0-9]/g, '').slice(0, 10);
export const isValidPan = (value?: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(value));
export const isValidTan = (value?: string): boolean => /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(normalizeTan(value));

export const panStatus = (value?: string): 'valid' | 'invalid' | 'missing' => {
  const pan = normalizePan(value);
  if (!pan) return 'missing';
  return isValidPan(pan) ? 'valid' : 'invalid';
};

const toDate = (value?: Date | string): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

export const getIndianFinancialYear = (value?: Date | string): string => {
  const date = toDate(value);
  const year = date.getFullYear();
  const startYear = date.getMonth() >= 3 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

export const getIndianQuarter = (value?: Date | string): 'Q1' | 'Q2' | 'Q3' | 'Q4' => {
  const month = toDate(value).getMonth();
  if (month >= 3 && month <= 5) return 'Q1';
  if (month >= 6 && month <= 8) return 'Q2';
  if (month >= 9 && month <= 11) return 'Q3';
  return 'Q4';
};

const computeDepositDueDate = (transactionDate: Date): Date => {
  const due = new Date(transactionDate);
  due.setMonth(due.getMonth() + 1, 7);
  due.setHours(23, 59, 59, 999);
  return due;
};

export const DEFAULT_TDS_SECTIONS: TdsSectionInput[] = [
  {
    sectionCode: '192',
    sectionName: 'Salary',
    natureOfPayment: 'Salary payments to employees',
    defaultRate: 0,
    panMissingRate: 20,
    thresholdAnnual: 0,
    formType: '24Q',
    notes: 'Use employee slab computation outside the flat-rate calculator; this section is included for Form 24Q tracking.',
  },
  {
    sectionCode: '194C',
    sectionName: 'Contractor payments',
    natureOfPayment: 'Payments to contractors/sub-contractors',
    defaultRate: 2,
    panMissingRate: 20,
    thresholdPerTransaction: 30000,
    thresholdAnnual: 100000,
    formType: '26Q',
    notes: 'Common default uses 2%. If individual/HUF 1% applies, edit this section or use an accountant-reviewed override.',
    rateMatrix: { individualOrHuf: 1, others: 2 },
  },
  {
    sectionCode: '194J',
    sectionName: 'Professional / technical fees',
    natureOfPayment: 'Professional, technical, royalty, and similar fees',
    defaultRate: 10,
    panMissingRate: 20,
    thresholdAnnual: 50000,
    formType: '26Q',
    notes: 'Sports-complex professional services such as coaching, physiotherapy, and event management commonly use 10% with the FY 2025-26 preset threshold of 50000. Some technical/call-center categories can differ.',
  },
  {
    sectionCode: '194H',
    sectionName: 'Commission or brokerage',
    natureOfPayment: 'Commission and brokerage',
    defaultRate: 5,
    panMissingRate: 20,
    thresholdAnnual: 15000,
    formType: '26Q',
  },
  {
    sectionCode: '194I',
    sectionName: 'Rent',
    natureOfPayment: 'Rent on land/building/furniture/equipment',
    defaultRate: 10,
    panMissingRate: 20,
    thresholdMonthly: 50000,
    formType: '26Q',
    notes: 'FY 2025-26 sports-complex presets use 10% for land/building/furniture/fittings and 2% for plant/machinery/equipment, with monthly threshold tracking.',
    rateMatrix: { plantMachineryEquipment: 2, landBuildingFurniture: 10 },
  },
  {
    sectionCode: '194-IB',
    returnSectionCode: '194IB',
    sectionName: 'Residential rent by individual/HUF',
    natureOfPayment: 'Rent of residential property by specified individual/HUF deductors',
    defaultRate: 2,
    panMissingRate: 20,
    thresholdMonthly: 50000,
    formType: '26Q',
    notes: 'Official TDS rate table amended by Finance Act, 2025 shows 194-IB at 2%. Keep accountant-reviewed if a legacy 5% scenario applies.',
  },
  {
    sectionCode: '194B',
    sectionName: 'Winnings / prize money',
    natureOfPayment: 'Prize money for competitions, games, or other winnings',
    defaultRate: 30,
    panMissingRate: 30,
    thresholdPerTransaction: 10000,
    formType: '26Q',
    notes: 'Use for event prize money where winnings exceed the configured prize threshold.',
  },
  {
    sectionCode: '194Q',
    sectionName: 'Purchase of goods',
    natureOfPayment: 'Buyer TDS on purchase of goods',
    defaultRate: 0.1,
    panMissingRate: 5,
    thresholdAnnual: 5000000,
    formType: '26Q',
    notes: 'Apply only where the buyer-side turnover/applicability conditions are satisfied.',
  },
  {
    sectionCode: '195',
    sectionName: 'Non-resident payments',
    natureOfPayment: 'Payments to non-residents',
    defaultRate: 20,
    panMissingRate: 20,
    thresholdAnnual: 0,
    formType: '27Q',
    notes: 'Treaty, surcharge, cess, and nature-of-income rules can materially change this. Use accountant-reviewed rates.',
  },
];

export const getTdsCompanySettings = async (): Promise<TdsCompanySettings> => {
  const row = await AppSetting.findOne({ key: COMPANY_SETTING_KEY }).lean();
  return (row?.value || {}) as TdsCompanySettings;
};

export const saveTdsCompanySettings = async (settings: TdsCompanySettings, updatedBy?: string) => {
  const normalized: TdsCompanySettings = {
    legalName: normalizeText(settings.legalName),
    pan: normalizePan(settings.pan),
    tan: normalizeTan(settings.tan),
    deductorCategory: normalizeText(settings.deductorCategory),
    responsiblePersonName: normalizeText(settings.responsiblePersonName),
    responsiblePersonDesignation: normalizeText(settings.responsiblePersonDesignation),
    email: normalizeText(settings.email).toLowerCase(),
    phone: normalizeText(settings.phone),
    address: normalizeText(settings.address),
    notes: normalizeText(settings.notes),
    lastReviewedAt: new Date().toISOString(),
  };

  if (normalized.pan && !isValidPan(normalized.pan)) {
    throw new Error('Company PAN is invalid. PAN format should be ABCDE1234F.');
  }
  if (normalized.tan && !isValidTan(normalized.tan)) {
    throw new Error('Company TAN is invalid. TAN format should be ABCD12345E.');
  }

  const row = await AppSetting.findOneAndUpdate(
    { key: COMPANY_SETTING_KEY },
    { $set: { value: normalized, updatedBy } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    module: 'accounting',
    action: 'tds_company_settings_saved',
    entityType: 'tds_company_settings',
    entityId: row._id.toString(),
    referenceNo: normalized.tan || normalized.pan || normalized.legalName,
    userId: updatedBy,
    after: normalized,
  });

  return row.value as TdsCompanySettings;
};

export const seedDefaultTdsSections = async (createdBy?: string) => {
  const rows: ITdsSection[] = [];
  for (const section of DEFAULT_TDS_SECTIONS) {
    const payload = {
      ...section,
      sectionCode: normalizeUpper(section.sectionCode),
      returnSectionCode: normalizeUpper(section.returnSectionCode || section.sectionCode),
      actReference: section.actReference || 'transition',
      sectionName: normalizeText(section.sectionName),
      natureOfPayment: normalizeText(section.natureOfPayment),
      panMissingRate: Number(section.panMissingRate ?? 20),
      thresholdPerTransaction: Number(section.thresholdPerTransaction || 0),
      thresholdMonthly: Number(section.thresholdMonthly || 0),
      thresholdAnnual: Number(section.thresholdAnnual || 0),
      formType: section.formType || '26Q',
      effectiveFrom: section.effectiveFrom ? toDate(section.effectiveFrom) : new Date('2025-04-01T00:00:00.000Z'),
      isActive: true,
      isSystemDefault: true,
      statutoryReference: section.statutoryReference || GOVERNMENT_RATE_REFERENCE,
      createdBy,
    };

    const row = await TdsSection.findOneAndUpdate(
      { sectionCode: payload.sectionCode },
      { $setOnInsert: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    rows.push(row);
  }
  return rows;
};

export const upsertTdsSection = async (input: TdsSectionInput, createdBy?: string): Promise<ITdsSection> => {
  const sectionCode = normalizeUpper(input.sectionCode);
  if (!sectionCode) throw new Error('TDS section code is required');
  const sectionName = normalizeText(input.sectionName);
  if (!sectionName) throw new Error('TDS section name is required');
  const defaultRate = Number(input.defaultRate || 0);
  if (!Number.isFinite(defaultRate) || defaultRate < 0) throw new Error('TDS rate must be zero or greater');

  const payload = {
    sectionCode,
    returnSectionCode: normalizeUpper(input.returnSectionCode || sectionCode),
    actReference: input.actReference || 'transition',
    sectionName,
    natureOfPayment: normalizeText(input.natureOfPayment),
    defaultRate,
    panMissingRate: Number(input.panMissingRate ?? 20),
    thresholdPerTransaction: Number(input.thresholdPerTransaction || 0),
    thresholdMonthly: Number(input.thresholdMonthly || 0),
    thresholdAnnual: Number(input.thresholdAnnual || 0),
    formType: input.formType || '26Q',
    effectiveFrom: input.effectiveFrom ? toDate(input.effectiveFrom) : undefined,
    effectiveTo: input.effectiveTo ? toDate(input.effectiveTo) : undefined,
    isActive: input.isActive !== false,
    statutoryReference: normalizeText(input.statutoryReference) || GOVERNMENT_RATE_REFERENCE,
    notes: normalizeText(input.notes),
    rateMatrix: input.rateMatrix || undefined,
    createdBy,
  };

  const row = await TdsSection.findOneAndUpdate(
    { sectionCode },
    { $set: payload, $setOnInsert: { isSystemDefault: false } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    module: 'accounting',
    action: 'tds_section_upserted',
    entityType: 'tds_section',
    entityId: row._id.toString(),
    referenceNo: row.sectionCode,
    userId: createdBy,
    after: row.toObject(),
  });

  return row;
};

export const upsertDeducteeProfile = async (input: DeducteeProfileInput): Promise<ITdsDeducteeProfile> => {
  let vendor: any = null;
  if (input.vendorId) {
    vendor = await Vendor.findById(input.vendorId).lean();
    if (!vendor) throw new Error('Vendor not found for TDS profile');
  }

  const deducteeName = normalizeText(input.deducteeName || vendor?.name);
  if (!deducteeName) throw new Error('Deductee name is required');

  const pan = normalizePan(input.pan);
  const status = panStatus(pan);
  const ldc = input.lowerDeductionCertificate || {};
  const defaultSectionId = input.defaultSectionId && mongoose.isValidObjectId(input.defaultSectionId)
    ? new mongoose.Types.ObjectId(input.defaultSectionId)
    : undefined;

  const payload = {
    vendorId: input.vendorId && mongoose.isValidObjectId(input.vendorId) ? new mongoose.Types.ObjectId(input.vendorId) : undefined,
    deducteeName,
    deducteeType: input.deducteeType || (vendor ? 'vendor' : 'other'),
    residentialStatus: input.residentialStatus || 'resident',
    pan: pan || undefined,
    panStatus: status,
    email: normalizeText(input.email || vendor?.email).toLowerCase() || undefined,
    phone: normalizeText(input.phone || vendor?.phone) || undefined,
    defaultSectionId,
    lowerDeductionCertificate: {
      enabled: Boolean(ldc.enabled),
      certificateNumber: normalizeUpper(ldc.certificateNumber) || undefined,
      rate: ldc.rate === undefined || ldc.rate === null || String(ldc.rate) === '' ? undefined : Number(ldc.rate),
      validFrom: ldc.validFrom ? toDate(ldc.validFrom) : undefined,
      validTo: ldc.validTo ? toDate(ldc.validTo) : undefined,
      amountLimit: ldc.amountLimit === undefined || ldc.amountLimit === null || String(ldc.amountLimit) === '' ? undefined : Number(ldc.amountLimit),
      notes: normalizeText(ldc.notes) || undefined,
    },
    isActive: input.isActive !== false,
    notes: normalizeText(input.notes) || undefined,
    createdBy: input.createdBy,
  };

  const query = payload.vendorId ? { vendorId: payload.vendorId } : { deducteeName, deducteeType: payload.deducteeType };
  const row = await TdsDeducteeProfile.findOneAndUpdate(
    query,
    { $set: payload },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    module: 'accounting',
    action: 'tds_deductee_profile_upserted',
    entityType: 'tds_deductee_profile',
    entityId: row._id.toString(),
    referenceNo: row.deducteeName,
    userId: input.createdBy,
    after: row.toObject(),
  });

  return row;
};

const resolveSection = async (input: Pick<TdsCalculationInput, 'sectionId' | 'sectionCode'>): Promise<ITdsSection> => {
  let section: ITdsSection | null = null;
  if (input.sectionId && mongoose.isValidObjectId(input.sectionId)) {
    section = await TdsSection.findById(input.sectionId);
  }
  if (!section && input.sectionCode) {
    section = await TdsSection.findOne({ sectionCode: normalizeUpper(input.sectionCode), isActive: true });
  }
  if (!section) {
    const seeded = await seedDefaultTdsSections();
    section = seeded.find((row) => row.sectionCode === normalizeUpper(input.sectionCode)) || null;
  }
  if (!section) throw new Error('TDS section not found. Seed or configure TDS sections first.');
  return section;
};

const resolveDeductee = async (input: TdsCalculationInput): Promise<{
  profile: ITdsDeducteeProfile | null;
  vendor: any | null;
  name: string;
  pan?: string;
  panStatus: 'valid' | 'invalid' | 'missing';
}> => {
  let profile: ITdsDeducteeProfile | null = null;
  if (input.deducteeProfileId && mongoose.isValidObjectId(input.deducteeProfileId)) {
    profile = await TdsDeducteeProfile.findById(input.deducteeProfileId);
  }
  if (!profile && input.vendorId && mongoose.isValidObjectId(input.vendorId)) {
    profile = await TdsDeducteeProfile.findOne({ vendorId: input.vendorId, isActive: true });
  }

  const vendor = input.vendorId && mongoose.isValidObjectId(input.vendorId)
    ? await Vendor.findById(input.vendorId).lean()
    : null;
  const pan = normalizePan(input.pan || profile?.pan);
  return {
    profile,
    vendor,
    name: normalizeText(input.deducteeName || profile?.deducteeName || vendor?.name || 'Manual deductee'),
    pan: pan || undefined,
    panStatus: panStatus(pan),
  };
};

const isLdcActive = (profile: ITdsDeducteeProfile | null, transactionDate: Date, taxableAmount: number, priorAnnualAmount: number): boolean => {
  const ldc = profile?.lowerDeductionCertificate;
  if (!ldc?.enabled) return false;
  if (ldc.rate === undefined || ldc.rate === null || !Number.isFinite(Number(ldc.rate))) return false;
  if (ldc.validFrom && transactionDate < new Date(ldc.validFrom)) return false;
  if (ldc.validTo && transactionDate > new Date(ldc.validTo)) return false;
  if (ldc.amountLimit && priorAnnualAmount + taxableAmount > Number(ldc.amountLimit)) return false;
  return true;
};

const coerceOptionalAmount = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return amount;
};

const getMonthRange = (value: Date) => {
  const start = new Date(value);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const buildThresholdDecision = (
  thresholdConfig: { perTransaction: number; monthly: number; annual: number },
  taxableAmount: number,
  priorAnnualAmount: number,
  priorMonthlyAmount: number
) => {
  const projectedAnnualAmount = roundTds(priorAnnualAmount + taxableAmount);
  const projectedMonthlyAmount = roundTds(priorMonthlyAmount + taxableAmount);
  const perTransaction = Number(thresholdConfig.perTransaction || 0);
  const monthly = Number(thresholdConfig.monthly || 0);
  const annual = Number(thresholdConfig.annual || 0);
  const reasons: string[] = [];
  if (perTransaction <= 0 && monthly <= 0 && annual <= 0) reasons.push('No threshold configured');
  if (perTransaction > 0 && taxableAmount > perTransaction) reasons.push(`Transaction amount exceeds ${perTransaction}`);
  if (monthly > 0 && projectedMonthlyAmount > monthly) reasons.push(`Monthly threshold exceeds ${monthly}`);
  if (annual > 0 && projectedAnnualAmount > annual) reasons.push(`Annual threshold exceeds ${annual}`);
  const thresholdBreached = perTransaction <= 0 && monthly <= 0 && annual <= 0 ? true : reasons.length > 0;
  return {
    projectedMonthlyAmount,
    projectedAnnualAmount,
    thresholdBreached,
    thresholdReason: thresholdBreached ? reasons.join('; ') : 'Below configured threshold',
  };
};

export const calculateTds = async (input: TdsCalculationInput) => {
  const transactionDate = toDate(input.transactionDate);
  const section = await resolveSection(input);
  const deductee = await resolveDeductee(input);
  const grossAmount = roundTds(Number(input.grossAmount || 0));
  const taxableAmount = roundTds(Number(input.taxableAmount ?? input.grossAmount ?? 0));
  if (grossAmount <= 0 || taxableAmount <= 0) throw new Error('Gross/taxable amount must be greater than zero');

  const financialYear = getIndianFinancialYear(transactionDate);
  const thresholdConfig = {
    perTransaction: coerceOptionalAmount(input.thresholdPerTransactionOverride) ?? Number(section.thresholdPerTransaction || 0),
    monthly: coerceOptionalAmount(input.thresholdMonthlyOverride) ?? Number(section.thresholdMonthly || 0),
    annual: coerceOptionalAmount(input.thresholdAnnualOverride) ?? Number(section.thresholdAnnual || 0),
  };
  const profileFilter = deductee.profile?._id
    ? { deducteeProfileId: deductee.profile._id }
    : deductee.vendor?._id
      ? { vendorId: deductee.vendor._id }
      : { deducteeName: deductee.name };

  const priorRows = await TdsTransaction.aggregate([
    {
      $match: {
        ...profileFilter,
        financialYear,
        sectionCode: section.sectionCode,
        status: { $ne: 'reversed' },
      },
    },
    { $group: { _id: null, taxableAmount: { $sum: '$taxableAmount' } } },
  ]);
  const priorAnnualAmount = roundTds(Number(priorRows?.[0]?.taxableAmount || 0));
  const monthRange = getMonthRange(transactionDate);
  const priorMonthlyRows = await TdsTransaction.aggregate([
    {
      $match: {
        ...profileFilter,
        sectionCode: section.sectionCode,
        status: { $ne: 'reversed' },
        transactionDate: { $gte: monthRange.start, $lte: monthRange.end },
      },
    },
    { $group: { _id: null, taxableAmount: { $sum: '$taxableAmount' } } },
  ]);
  const priorMonthlyAmount = roundTds(Number(priorMonthlyRows?.[0]?.taxableAmount || 0));
  const threshold = buildThresholdDecision(thresholdConfig, taxableAmount, priorAnnualAmount, priorMonthlyAmount);

  const warnings: string[] = [];
  if (deductee.panStatus !== 'valid') warnings.push('PAN is missing or invalid. Higher-rate TDS rule may apply.');
  if (!deductee.profile) warnings.push('No saved TDS deductee profile found. Save PAN/default section for cleaner return filing.');
  if (!threshold.thresholdBreached) warnings.push('Configured thresholds are not breached. TDS amount is zero unless manually overridden by accountant.');

  const ldcApplied = deductee.panStatus === 'valid' && isLdcActive(deductee.profile, transactionDate, taxableAmount, priorAnnualAmount);
  const profileLdc = deductee.profile?.lowerDeductionCertificate;
  const rateOverride = coerceOptionalAmount(input.rateOverride);
  const baseRate = ldcApplied ? Number(profileLdc?.rate || 0) : (rateOverride ?? Number(section.defaultRate || 0));
  const effectiveRate = deductee.panStatus === 'valid'
    ? baseRate
    : Math.max(baseRate, Number(section.panMissingRate || 20));
  const tdsAmount = threshold.thresholdBreached ? roundTds(taxableAmount * effectiveRate / 100) : 0;

  return {
    transactionDate,
    financialYear,
    quarter: getIndianQuarter(transactionDate),
    section: {
      _id: section._id.toString(),
      sectionCode: section.sectionCode,
      returnSectionCode: section.returnSectionCode || section.sectionCode,
      sectionName: section.sectionName,
      defaultRate: section.defaultRate,
      panMissingRate: section.panMissingRate,
      thresholdPerTransaction: thresholdConfig.perTransaction,
      thresholdMonthly: thresholdConfig.monthly,
      thresholdAnnual: thresholdConfig.annual,
      formType: section.formType,
    },
    deductee: {
      profileId: deductee.profile?._id?.toString(),
      vendorId: deductee.vendor?._id?.toString(),
      name: deductee.name,
      pan: deductee.pan,
      panStatus: deductee.panStatus,
      email: deductee.profile?.email || deductee.vendor?.email,
    },
    grossAmount,
    taxableAmount,
    useCase: input.tdsUseCaseKey || input.tdsUseCaseLabel
      ? {
        key: normalizeText(input.tdsUseCaseKey),
        label: normalizeText(input.tdsUseCaseLabel),
      }
      : undefined,
    priorMonthlyAmount,
    priorAnnualAmount,
    projectedMonthlyAmount: threshold.projectedMonthlyAmount,
    projectedAnnualAmount: threshold.projectedAnnualAmount,
    thresholdBreached: threshold.thresholdBreached,
    thresholdReason: threshold.thresholdReason,
    rate: baseRate,
    effectiveRate,
    tdsAmount,
    dueDate: computeDepositDueDate(transactionDate),
    ldcApplied,
    lowerDeductionCertificateNo: ldcApplied ? profileLdc?.certificateNumber : undefined,
    warnings,
  };
};

export const recordTdsTransaction = async (input: RecordTdsInput): Promise<ITdsTransaction> => {
  const calculation = await calculateTds(input);
  await ensureAccountingChart(input.createdBy);

  const vendorForJournal = calculation.deductee.vendorId
    ? await Vendor.findById(calculation.deductee.vendorId).select('ledgerAccountId')
    : null;
  const debitLine = vendorForJournal?.ledgerAccountId
    ? { accountId: vendorForJournal.ledgerAccountId, debit: calculation.tdsAmount, credit: 0, description: 'Reduce vendor payable by TDS' }
    : { accountKey: 'accounts_payable', debit: calculation.tdsAmount, credit: 0, description: 'Reduce payable by TDS' };

  const journalEntry = input.postJournal && calculation.tdsAmount > 0
    ? await createJournalEntry({
      entryDate: calculation.transactionDate,
      referenceType: 'tds',
      referenceId: input.sourceId,
      referenceNo: input.referenceNo,
      description: `TDS deducted under ${calculation.section.sectionCode} for ${calculation.deductee.name}`,
      paymentMode: 'adjustment',
      createdBy: input.createdBy,
      metadata: {
        sectionCode: calculation.section.sectionCode,
        deducteeName: calculation.deductee.name,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        ...input.metadata,
      },
      lines: [
        debitLine,
        { accountKey: 'tds_payable', debit: 0, credit: calculation.tdsAmount, description: 'TDS liability payable' },
      ],
    })
    : null;

  const row = await TdsTransaction.create({
    transactionDate: calculation.transactionDate,
    financialYear: calculation.financialYear,
    quarter: calculation.quarter,
    deducteeProfileId: calculation.deductee.profileId,
    vendorId: calculation.deductee.vendorId,
    deducteeName: calculation.deductee.name,
    pan: calculation.deductee.pan,
    panStatus: calculation.deductee.panStatus,
    sectionId: calculation.section._id,
    sectionCode: calculation.section.sectionCode,
    returnSectionCode: calculation.section.returnSectionCode,
    sectionName: calculation.section.sectionName,
    transactionType: input.transactionType || 'bill',
    sourceType: normalizeText(input.sourceType) || 'manual',
    sourceId: normalizeText(input.sourceId) || undefined,
    referenceNo: normalizeText(input.referenceNo) || undefined,
    grossAmount: calculation.grossAmount,
    taxableAmount: calculation.taxableAmount,
    priorAnnualAmount: calculation.priorAnnualAmount,
    projectedAnnualAmount: calculation.projectedAnnualAmount,
    thresholdPerTransaction: calculation.section.thresholdPerTransaction,
    thresholdMonthly: calculation.section.thresholdMonthly,
    thresholdAnnual: calculation.section.thresholdAnnual,
    thresholdBreached: calculation.thresholdBreached,
    thresholdReason: calculation.thresholdReason,
    rate: calculation.rate,
    effectiveRate: calculation.effectiveRate,
    tdsAmount: calculation.tdsAmount,
    paidAmount: 0,
    balanceAmount: calculation.tdsAmount,
    dueDate: calculation.dueDate,
    journalEntryId: journalEntry?.entry?._id,
    ldcApplied: calculation.ldcApplied,
    lowerDeductionCertificateNo: calculation.lowerDeductionCertificateNo,
    status: calculation.tdsAmount > 0 ? 'deducted' : 'not_deducted',
    notes: normalizeText(input.notes) || undefined,
    warnings: calculation.warnings,
    metadata: {
      tdsUseCaseKey: normalizeText(input.tdsUseCaseKey) || undefined,
      tdsUseCaseLabel: normalizeText(input.tdsUseCaseLabel) || undefined,
      rateOverride: coerceOptionalAmount(input.rateOverride),
      thresholdPerTransactionOverride: coerceOptionalAmount(input.thresholdPerTransactionOverride),
      thresholdMonthlyOverride: coerceOptionalAmount(input.thresholdMonthlyOverride),
      thresholdAnnualOverride: coerceOptionalAmount(input.thresholdAnnualOverride),
      ...input.metadata,
    },
    createdBy: input.createdBy,
  });

  if (row.tdsAmount > 0 && row.dueDate && row.dueDate.getTime() < Date.now() && row.status === 'deducted') {
    await writeAuditFlag({
      module: 'accounting',
      flagType: 'tds_deposit_overdue',
      severity: 'high',
      entityType: 'tds_transaction',
      entityId: row._id.toString(),
      referenceNo: row.referenceNo || row.sectionCode,
      message: `TDS deposit is overdue for ${row.deducteeName} (${row.sectionCode})`,
      dedupeKey: `tds_deposit_overdue:${row._id.toString()}`,
      detectedBy: input.createdBy,
      metadata: { dueDate: row.dueDate, tdsAmount: row.tdsAmount },
    });
  }

  await writeAuditLog({
    module: 'accounting',
    action: 'tds_transaction_recorded',
    entityType: 'tds_transaction',
    entityId: row._id.toString(),
    referenceNo: row.referenceNo || row.sectionCode,
    userId: input.createdBy,
    after: row.toObject(),
  });

  await writeRecordVersion({
    module: 'accounting',
    entityType: 'tds_transaction',
    recordId: row._id.toString(),
    action: 'CREATE',
    changedBy: input.createdBy,
    dataSnapshot: row.toObject(),
  });

  return row;
};

export const recordTdsChallan = async (input: {
  paymentDate?: Date | string;
  financialYear?: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  sectionCode?: string;
  amount: number;
  bsrCode: string;
  challanSerialNo: string;
  cin?: string;
  bankName?: string;
  depositMode?: string;
  transactionIds?: string[];
  notes?: string;
  createdBy?: string;
}) => {
  const paymentDate = toDate(input.paymentDate);
  const amount = roundTds(Number(input.amount || 0));
  if (amount <= 0) throw new Error('Challan amount must be greater than zero');
  const financialYear = normalizeText(input.financialYear) || getIndianFinancialYear(paymentDate);
  const sectionCode = normalizeUpper(input.sectionCode);

  const challan = await TdsChallan.create({
    paymentDate,
    financialYear,
    quarter: input.quarter || getIndianQuarter(paymentDate),
    sectionCode: sectionCode || undefined,
    amount,
    allocatedAmount: 0,
    unallocatedAmount: amount,
    bsrCode: normalizeText(input.bsrCode),
    challanSerialNo: normalizeText(input.challanSerialNo),
    cin: normalizeUpper(input.cin) || undefined,
    bankName: normalizeText(input.bankName) || undefined,
    depositMode: normalizeText(input.depositMode) || undefined,
    notes: normalizeText(input.notes) || undefined,
    createdBy: input.createdBy,
  });

  let remaining = amount;
  const transactionFilter: Record<string, any> = {
    financialYear,
    status: { $in: ['deducted', 'partial_paid'] },
    balanceAmount: { $gt: 0 },
  };
  if (sectionCode) transactionFilter.sectionCode = sectionCode;
  if (Array.isArray(input.transactionIds) && input.transactionIds.length) {
    transactionFilter._id = { $in: input.transactionIds.filter((id) => mongoose.isValidObjectId(id)) };
  }

  const transactions = await TdsTransaction.find(transactionFilter).sort({ dueDate: 1, transactionDate: 1 });
  const allocatedIds: mongoose.Types.ObjectId[] = [];
  let allocatedAmount = 0;

  for (const tx of transactions) {
    if (remaining <= 0) break;
    const payable = roundTds(Number(tx.balanceAmount ?? tx.tdsAmount ?? 0));
    if (payable <= 0) continue;
    const allocation = roundTds(Math.min(remaining, payable));
    tx.paidAmount = roundTds(Number(tx.paidAmount || 0) + allocation);
    tx.balanceAmount = roundTds(Math.max(0, Number(tx.tdsAmount || 0) - Number(tx.paidAmount || 0)));
    tx.status = tx.balanceAmount <= 0 ? 'paid' : 'partial_paid';
    tx.challanId = challan._id as mongoose.Types.ObjectId;
    tx.challanSerialNo = challan.challanSerialNo;
    await tx.save();
    remaining = roundTds(remaining - allocation);
    allocatedAmount = roundTds(allocatedAmount + allocation);
    allocatedIds.push(tx._id as mongoose.Types.ObjectId);
  }

  challan.allocatedTransactionIds = allocatedIds;
  challan.allocatedAmount = allocatedAmount;
  challan.unallocatedAmount = roundTds(Math.max(0, amount - allocatedAmount));
  await challan.save();

  await writeAuditLog({
    module: 'accounting',
    action: 'tds_challan_recorded',
    entityType: 'tds_challan',
    entityId: challan._id.toString(),
    referenceNo: challan.challanSerialNo,
    userId: input.createdBy,
    after: challan.toObject(),
  });

  return challan;
};

const pipeCell = (value: unknown): string => normalizeText(value).replace(/\|/g, '/');

export const generateTdsReturn = async (input: {
  formType: TdsFormType;
  financialYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  isCorrection?: boolean;
  originalTokenNo?: string;
  notes?: string;
  createdBy?: string;
}) => {
  const formType = input.formType;
  const financialYear = normalizeText(input.financialYear) || getIndianFinancialYear(new Date());
  const quarter = input.quarter;
  const company = await getTdsCompanySettings();
  const sectionsForForm = await TdsSection.find({ formType }).select('sectionCode').lean();
  const sectionCodesForForm = sectionsForForm.map((section: any) => normalizeUpper(section.sectionCode)).filter(Boolean);
  const transactions = await TdsTransaction.find({
    financialYear,
    quarter,
    sectionCode: { $in: sectionCodesForForm },
    status: { $in: ['paid', 'filed', 'partial_paid'] },
  })
    .sort({ sectionCode: 1, transactionDate: 1 })
    .lean();

  const transactionIds = transactions.map((row) => row._id);
  const challanIds = Array.from(new Set(transactions.map((row: any) => String(row.challanId || '')).filter(Boolean)))
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const totalTaxable = roundTds(transactions.reduce((sum: number, row: any) => sum + Number(row.taxableAmount || 0), 0));
  const totalTds = roundTds(transactions.reduce((sum: number, row: any) => sum + Number(row.tdsAmount || 0), 0));
  const fileName = `tds-${formType.toLowerCase()}-${financialYear}-${quarter}.txt`;
  const lines = [
    `SPARK7_TDS_DRAFT|${formType}|${financialYear}|${quarter}|FVU_VALIDATION_REQUIRED`,
    `DEDUCTOR|${pipeCell(company.legalName)}|PAN:${pipeCell(company.pan)}|TAN:${pipeCell(company.tan)}|RESP:${pipeCell(company.responsiblePersonName)}`,
    'TYPE|SECTION|DATE|DEDUCTEE|PAN|REFERENCE|TAXABLE|RATE|TDS|CHALLAN',
    ...transactions.map((row: any) => [
      'DEDUCTION',
      pipeCell(row.returnSectionCode || row.sectionCode),
      new Date(row.transactionDate).toISOString().slice(0, 10),
      pipeCell(row.deducteeName),
      pipeCell(row.pan),
      pipeCell(row.referenceNo),
      roundTds(row.taxableAmount),
      roundTds(row.effectiveRate),
      roundTds(row.tdsAmount),
      pipeCell(row.challanSerialNo),
    ].join('|')),
    `SUMMARY|ROWS:${transactions.length}|TAXABLE:${totalTaxable}|TDS:${totalTds}`,
    'NOTE|This is an internal draft export. Validate/convert with the prescribed e-TDS/FVU workflow before statutory submission.',
  ];

  const filingKey = `${formType}:${financialYear}:${quarter}:${input.isCorrection ? 'correction' : 'regular'}`;
  const row = await TdsReturn.findOneAndUpdate(
    { filingKey },
    {
      $set: {
        formType,
        financialYear,
        quarter,
        status: input.isCorrection ? 'correction' : 'draft',
        transactionIds,
        challanIds,
        fileName,
        fileContent: lines.join('\n'),
        fvuValidationStatus: 'not_validated',
        originalTokenNo: normalizeText(input.originalTokenNo) || undefined,
        summary: { totalRows: transactions.length, totalTaxable, totalTds, fvuReady: false },
        notes: normalizeText(input.notes) || undefined,
        createdBy: input.createdBy,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    module: 'accounting',
    action: 'tds_return_generated',
    entityType: 'tds_return',
    entityId: row._id.toString(),
    referenceNo: row.filingKey,
    userId: input.createdBy,
    after: row.toObject(),
  });

  return row;
};

export const updateTdsReturnStatus = async (id: string, status: TdsReturnStatus, input: {
  acknowledgementNo?: string;
  correctionTokenNo?: string;
  fvuValidationStatus?: 'not_validated' | 'passed' | 'failed';
  fvuValidationMessage?: string;
  createdBy?: string;
}) => {
  const row = await TdsReturn.findById(id);
  if (!row) throw new Error('TDS return record not found');
  row.status = status;
  row.acknowledgementNo = normalizeText(input.acknowledgementNo) || row.acknowledgementNo;
  row.correctionTokenNo = normalizeText(input.correctionTokenNo) || row.correctionTokenNo;
  row.fvuValidationStatus = input.fvuValidationStatus || row.fvuValidationStatus;
  row.fvuValidationMessage = normalizeText(input.fvuValidationMessage) || row.fvuValidationMessage;
  row.filedAt = status === 'filed' ? new Date() : row.filedAt;
  await row.save();
  if (status === 'filed' && row.transactionIds.length) {
    await TdsTransaction.updateMany({ _id: { $in: row.transactionIds }, status: { $ne: 'reversed' } }, { $set: { status: 'filed', returnId: row._id } });
  }
  return row;
};

export const generateTdsCertificate = async (input: {
  deducteeProfileId?: string;
  financialYear: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  formType?: TdsCertificateFormType;
  createdBy?: string;
}) => {
  const financialYear = normalizeText(input.financialYear) || getIndianFinancialYear(new Date());
  const query: Record<string, any> = { financialYear, status: { $in: ['paid', 'filed'] } };
  if (input.quarter) query.quarter = input.quarter;
  if (input.deducteeProfileId && mongoose.isValidObjectId(input.deducteeProfileId)) {
    query.deducteeProfileId = input.deducteeProfileId;
  }
  const transactions = await TdsTransaction.find(query).sort({ transactionDate: 1 }).lean();
  if (!transactions.length) throw new Error('No paid/filed TDS transactions found for the selected certificate period');
  const first: any = transactions[0];
  const company = await getTdsCompanySettings();
  const formType = input.formType || (first.sectionCode === '192' ? 'Form16' : 'Form16A');
  const totalTaxable = roundTds(transactions.reduce((sum: number, row: any) => sum + Number(row.taxableAmount || 0), 0));
  const totalTds = roundTds(transactions.reduce((sum: number, row: any) => sum + Number(row.tdsAmount || 0), 0));
  const certificateNumber = `TDS-${financialYear}-${String(first.pan || first.deducteeName).replace(/[^A-Z0-9]/gi, '').slice(0, 8)}-${Date.now().toString().slice(-5)}`.toUpperCase();
  const fileName = `${certificateNumber.toLowerCase()}.txt`;
  const fileContent = [
    `${formType} DRAFT CERTIFICATE`,
    `Deductor: ${company.legalName || '-'} | TAN: ${company.tan || '-'} | PAN: ${company.pan || '-'}`,
    `Deductee: ${first.deducteeName || '-'} | PAN: ${first.pan || '-'}`,
    `Financial Year: ${financialYear}${input.quarter ? ` | Quarter: ${input.quarter}` : ''}`,
    '',
    'Date | Section | Reference | Taxable Amount | TDS Amount | Challan',
    ...transactions.map((row: any) => [
      new Date(row.transactionDate).toLocaleDateString('en-IN'),
      row.sectionCode,
      row.referenceNo || '-',
      roundTds(row.taxableAmount),
      roundTds(row.tdsAmount),
      row.challanSerialNo || '-',
    ].join(' | ')),
    '',
    `Total taxable amount: ${totalTaxable}`,
    `Total TDS deducted/deposited: ${totalTds}`,
    'Note: Draft for internal review. Statutory certificate issuance should be reconciled with TRACES records before distribution.',
  ].join('\n');

  const row = await TdsCertificate.create({
    formType,
    financialYear,
    quarter: input.quarter,
    deducteeProfileId: first.deducteeProfileId,
    deducteeName: first.deducteeName,
    pan: first.pan,
    certificateNumber,
    transactionIds: transactions.map((tx: any) => tx._id),
    fileName,
    fileContent,
    status: 'generated',
    createdBy: input.createdBy,
  });

  await TdsTransaction.updateMany({ _id: { $in: row.transactionIds } }, { $set: { certificateId: row._id } });
  return row;
};

const parseCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
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

export const parseReconciliationImport = (rawText: string): Array<Record<string, any>> => {
  const raw = normalizeText(rawText);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Array<Record<string, any>>;
    if (Array.isArray(parsed?.rows)) return parsed.rows as Array<Record<string, any>>;
  } catch {
    // Fall through to CSV parsing.
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return header.reduce<Record<string, any>>((row, key, index) => {
      row[key] = cells[index] ?? '';
      return row;
    }, {});
  });
};

const getImportReference = (row: Record<string, any>): string =>
  normalizeUpper(row.referenceNo || row.reference || row.challanSerialNo || row.challan || row.transactionId || row.id);

const getImportPan = (row: Record<string, any>): string => normalizePan(row.pan || row.deducteePan || row.PAN);
const getImportTdsAmount = (row: Record<string, any>): number => roundTds(Number(row.tdsAmount || row.tds || row.amount || row.taxDeducted || 0));

export const runTdsReconciliation = async (input: {
  sourceType?: TdsReconciliationSource;
  financialYear: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  rawText: string;
  notes?: string;
  createdBy?: string;
}) => {
  const importedRows = parseReconciliationImport(input.rawText);
  const query: Record<string, any> = { financialYear: input.financialYear, status: { $ne: 'reversed' } };
  if (input.quarter) query.quarter = input.quarter;
  const bookRows = await TdsTransaction.find(query).lean();

  const importMap = new Map<string, Record<string, any>>();
  importedRows.forEach((row, index) => {
    const key = getImportReference(row) || `${getImportPan(row)}:${getImportTdsAmount(row)}:${index}`;
    importMap.set(key, row);
  });

  const matchedRows: Array<Record<string, any>> = [];
  const mismatchRows: Array<Record<string, any>> = [];
  const missingInImport: Array<Record<string, any>> = [];
  const usedImportKeys = new Set<string>();

  for (const book of bookRows as any[]) {
    const bookReference = normalizeUpper(book.referenceNo || book.challanSerialNo || book._id);
    const bookFallback = `${normalizePan(book.pan)}:${roundTds(book.tdsAmount)}`;
    const matchKey = importMap.has(bookReference) ? bookReference : Array.from(importMap.keys()).find((key) => key.startsWith(bookFallback));
    const imported = matchKey ? importMap.get(matchKey) : undefined;
    if (!imported || !matchKey) {
      missingInImport.push({ bookId: book._id, referenceNo: book.referenceNo, pan: book.pan, tdsAmount: book.tdsAmount });
      continue;
    }
    usedImportKeys.add(matchKey);
    const amountDiff = roundTds(Number(book.tdsAmount || 0) - getImportTdsAmount(imported));
    const panMatches = !getImportPan(imported) || !book.pan || getImportPan(imported) === normalizePan(book.pan);
    if (Math.abs(amountDiff) <= 1 && panMatches) {
      matchedRows.push({ bookId: book._id, importReference: matchKey, amountDiff });
    } else {
      mismatchRows.push({
        bookId: book._id,
        importReference: matchKey,
        bookPan: book.pan,
        importPan: getImportPan(imported),
        bookTds: book.tdsAmount,
        importTds: getImportTdsAmount(imported),
        amountDiff,
      });
    }
  }

  const missingInBooks = Array.from(importMap.entries())
    .filter(([key]) => !usedImportKeys.has(key))
    .map(([key, row]) => ({ importReference: key, ...row }));

  return TdsReconciliationRun.create({
    sourceType: input.sourceType || 'manual',
    financialYear: input.financialYear,
    quarter: input.quarter,
    importedRows,
    matchedRows,
    mismatchRows,
    missingInBooks,
    missingInImport,
    summary: {
      imported: importedRows.length,
      books: bookRows.length,
      matched: matchedRows.length,
      mismatches: mismatchRows.length,
      missingInBooks: missingInBooks.length,
      missingInImport: missingInImport.length,
    },
    notes: normalizeText(input.notes) || undefined,
    createdBy: input.createdBy,
  });
};

const TDS_REPORT_FORMS: TdsFormType[] = ['24Q', '26Q', '27Q', '27EQ'];
const TDS_REPORT_QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
type TdsQuarter = (typeof TDS_REPORT_QUARTERS)[number];

const isTdsQuarter = (value?: string): value is TdsQuarter =>
  TDS_REPORT_QUARTERS.includes(normalizeUpper(value) as TdsQuarter);

const parseReportDate = (value?: string, endOfDay = false): Date | undefined => {
  const text = normalizeText(value);
  if (!text) return undefined;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
    : new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const getFinancialYearDateRange = (financialYear: string): { startDate: Date; endDate: Date } => {
  const match = normalizeText(financialYear).match(/^(\d{4})-\d{2}$/);
  const startYear = match ? Number(match[1]) : Number(getIndianFinancialYear(new Date()).slice(0, 4));
  return {
    startDate: new Date(startYear, 3, 1, 0, 0, 0, 0),
    endDate: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
};

const toIsoDate = (value?: Date): string | undefined => value ? value.toISOString().slice(0, 10) : undefined;

const safeObjectId = (value: unknown): string => String(value || '');

const reportText = (value: unknown, fallback = '-'): string => {
  const text = normalizeText(value);
  return text || fallback;
};

const reportNumber = (value: unknown): number => roundTds(Number(value || 0));

const firstReportValue = (row: Record<string, any>, keys: string[]): unknown => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && normalizeText(value) !== '') return value;
  }
  return undefined;
};

export const buildTdsReports = async (input: {
  startDate?: string;
  endDate?: string;
  financialYear?: string;
  quarter?: string;
} = {}) => {
  const startDate = parseReportDate(input.startDate);
  const endDate = parseReportDate(input.endDate, true);
  const financialYear = normalizeText(input.financialYear) || getIndianFinancialYear(endDate || startDate || new Date());
  const financialYearRange = getFinancialYearDateRange(financialYear);
  const rangeStart = startDate || financialYearRange.startDate;
  const rangeEnd = endDate || financialYearRange.endDate;
  const quarter = isTdsQuarter(input.quarter) ? normalizeUpper(input.quarter) as TdsQuarter : undefined;

  const transactionFilter: Record<string, any> = { status: { $ne: 'reversed' } };
  if (rangeStart || rangeEnd) {
    transactionFilter.transactionDate = {};
    if (rangeStart) transactionFilter.transactionDate.$gte = rangeStart;
    if (rangeEnd) transactionFilter.transactionDate.$lte = rangeEnd;
  }
  if (quarter) transactionFilter.quarter = quarter;

  const statutoryTransactionFilter: Record<string, any> = { financialYear, status: { $ne: 'reversed' } };
  if (quarter) statutoryTransactionFilter.quarter = quarter;

  const challanFilter: Record<string, any> = { status: { $ne: 'cancelled' } };
  if (financialYear) challanFilter.financialYear = financialYear;
  if (quarter) challanFilter.quarter = quarter;
  if (rangeStart || rangeEnd) {
    challanFilter.paymentDate = {};
    if (rangeStart) challanFilter.paymentDate.$gte = rangeStart;
    if (rangeEnd) challanFilter.paymentDate.$lte = rangeEnd;
  }

  const returnFilter: Record<string, any> = { financialYear };
  if (quarter) returnFilter.quarter = quarter;

  const certificateFilter: Record<string, any> = { financialYear };
  if (quarter) certificateFilter.quarter = quarter;

  const reconciliationFilter: Record<string, any> = { financialYear };
  if (quarter) reconciliationFilter.quarter = quarter;

  const auditFilter: Record<string, any> = {
    module: 'accounting',
    $or: [
      { entityType: { $regex: '^tds', $options: 'i' } },
      { action: { $regex: '^tds', $options: 'i' } },
    ],
  };
  if (rangeStart || rangeEnd) {
    auditFilter.createdAt = {};
    if (rangeStart) auditFilter.createdAt.$gte = rangeStart;
    if (rangeEnd) auditFilter.createdAt.$lte = rangeEnd;
  }

  const [
    company,
    sections,
    profiles,
    transactions,
    statutoryTransactions,
    challans,
    returns,
    certificates,
    reconciliationRuns,
    auditLogs,
  ] = await Promise.all([
    getTdsCompanySettings(),
    TdsSection.find().sort({ sectionCode: 1, effectiveFrom: -1 }).lean(),
    TdsDeducteeProfile.find().sort({ deducteeName: 1 }).lean(),
    TdsTransaction.find(transactionFilter).sort({ transactionDate: -1, createdAt: -1 }).lean(),
    TdsTransaction.find(statutoryTransactionFilter).sort({ transactionDate: -1, createdAt: -1 }).lean(),
    TdsChallan.find(challanFilter).sort({ paymentDate: -1, createdAt: -1 }).lean(),
    TdsReturn.find(returnFilter).sort({ createdAt: -1 }).lean(),
    TdsCertificate.find(certificateFilter).sort({ createdAt: -1 }).lean(),
    TdsReconciliationRun.find(reconciliationFilter).sort({ createdAt: -1 }).lean(),
    AuditLog.find(auditFilter).sort({ createdAt: -1 }).limit(500).lean(),
  ]);

  const sectionLookup = new Map<string, any>();
  (sections as any[]).forEach((section) => {
    if (!sectionLookup.has(section.sectionCode)) sectionLookup.set(section.sectionCode, section);
  });
  const profileLookup = new Map<string, any>();
  (profiles as any[]).forEach((profile) => profileLookup.set(safeObjectId(profile._id), profile));

  const buildComputation = (rows: any[]) => {
    const grouped = new Map<string, any>();
    rows.forEach((row) => {
      const section = sectionLookup.get(row.sectionCode) || {};
      const key = row.sectionCode || 'UNMAPPED';
      const existing = grouped.get(key) || {
        _id: key,
        sectionCode: key,
        returnSectionCode: row.returnSectionCode || section.returnSectionCode || key,
        formType: section.formType || '26Q',
        natureOfPayment: section.natureOfPayment || row.sectionName || 'TDS deduction',
        transactionCount: 0,
        partyCountSet: new Set<string>(),
        taxableAmount: 0,
        tdsDeducted: 0,
        tdsPaid: 0,
        tdsPending: 0,
        notDeductedTaxableAmount: 0,
        overdueAmount: 0,
        earliestDueDate: undefined as Date | undefined,
      };
      const balance = Number(row.balanceAmount || 0);
      existing.transactionCount += 1;
      existing.partyCountSet.add(reportText(row.deducteeProfileId || row.deducteeName || row.pan, 'unknown'));
      existing.taxableAmount += Number(row.taxableAmount || 0);
      existing.tdsDeducted += Number(row.tdsAmount || 0);
      existing.tdsPaid += Number(row.paidAmount || 0);
      existing.tdsPending += balance;
      if (row.status === 'not_deducted' || Number(row.tdsAmount || 0) <= 0) {
        existing.notDeductedTaxableAmount += Number(row.taxableAmount || 0);
      }
      if (balance > 0 && row.dueDate) {
        const dueDate = new Date(row.dueDate);
        if (!Number.isNaN(dueDate.getTime())) {
          if (!existing.earliestDueDate || dueDate < existing.earliestDueDate) existing.earliestDueDate = dueDate;
          if (dueDate.getTime() < Date.now()) existing.overdueAmount += balance;
        }
      }
      grouped.set(key, existing);
    });

    return Array.from(grouped.values()).map((row) => ({
      ...row,
      partyCount: row.partyCountSet.size,
      taxableAmount: roundTds(row.taxableAmount),
      tdsDeducted: roundTds(row.tdsDeducted),
      tdsPaid: roundTds(row.tdsPaid),
      tdsPending: roundTds(row.tdsPending),
      notDeductedTaxableAmount: roundTds(row.notDeductedTaxableAmount),
      overdueAmount: roundTds(row.overdueAmount),
      earliestDueDate: row.earliestDueDate,
      dueStatus: row.tdsPending <= 0 ? 'Cleared' : row.overdueAmount > 0 ? 'Overdue' : 'Pending',
      partyCountSet: undefined,
    })).sort((left, right) => String(left.sectionCode).localeCompare(String(right.sectionCode), undefined, { numeric: true }));
  };

  const tdsComputation = buildComputation(transactions as any[]);
  const tdsPayables = tdsComputation
    .filter((row) => Number(row.tdsPending || 0) > 0)
    .map((row) => ({
      _id: `payable-${row.sectionCode}`,
      sectionCode: row.sectionCode,
      natureOfPayment: row.natureOfPayment,
      formType: row.formType,
      pendingTransactions: row.transactionCount,
      outstandingAmount: row.tdsPending,
      overdueAmount: row.overdueAmount,
      earliestDueDate: row.earliestDueDate,
      status: row.dueStatus,
    }));

  const tdsOutstanding = (transactions as any[])
    .filter((row) => Number(row.balanceAmount || 0) > 0)
    .map((row) => {
      const profile = row.deducteeProfileId ? profileLookup.get(safeObjectId(row.deducteeProfileId)) : undefined;
      const dueDate = row.dueDate ? new Date(row.dueDate) : undefined;
      const isOverdue = dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now();
      return {
        _id: safeObjectId(row._id),
        transactionDate: row.transactionDate,
        dueDate: row.dueDate,
        deducteeName: row.deducteeName,
        pan: row.pan || profile?.pan || '',
        residentialStatus: profile?.residentialStatus || 'resident',
        sectionCode: row.sectionCode,
        referenceNo: row.referenceNo,
        taxableAmount: reportNumber(row.taxableAmount),
        tdsAmount: reportNumber(row.tdsAmount),
        paidAmount: reportNumber(row.paidAmount),
        balanceAmount: reportNumber(row.balanceAmount),
        status: isOverdue ? 'Overdue' : 'Pending',
      };
    });

  const returnsByKey = new Map<string, any[]>();
  (returns as any[]).forEach((row) => {
    const key = `${row.formType}:${row.quarter}`;
    returnsByKey.set(key, [...(returnsByKey.get(key) || []), row]);
  });
  const quartersToShow = quarter ? [quarter] : [...TDS_REPORT_QUARTERS];
  const quarterlyReturns = TDS_REPORT_FORMS.flatMap((formType) =>
    quartersToShow.map((targetQuarter) => {
      const txRows = (statutoryTransactions as any[]).filter((row) =>
        row.quarter === targetQuarter && (sectionLookup.get(row.sectionCode)?.formType || '26Q') === formType
      );
      const returnRows = returnsByKey.get(`${formType}:${targetQuarter}`) || [];
      const latestReturn = returnRows[0];
      const taxableAmount = roundTds(txRows.reduce((sum, row) => sum + Number(row.taxableAmount || 0), 0));
      const tdsAmount = roundTds(txRows.reduce((sum, row) => sum + Number(row.tdsAmount || 0), 0));
      return {
        _id: `${formType}-${financialYear}-${targetQuarter}`,
        formType,
        financialYear,
        quarter: targetQuarter,
        reportName: formType === '24Q' ? 'Salary TDS Return' : formType === '27EQ' ? 'TCS Return' : 'Non-salary TDS Return',
        transactionCount: txRows.length,
        taxableAmount,
        tdsAmount,
        generatedDrafts: returnRows.length,
        status: latestReturn?.status || (tdsAmount > 0 ? 'pending_draft' : 'no_data'),
        fvuValidationStatus: latestReturn?.fvuValidationStatus || 'not_validated',
        acknowledgementNo: latestReturn?.acknowledgementNo || '',
        fileName: latestReturn?.fileName || '',
        updatedAt: latestReturn?.updatedAt || latestReturn?.createdAt,
      };
    })
  );

  const certificateRows = (certificates as any[]).map((row) => ({
    _id: safeObjectId(row._id),
    formType: row.formType,
    financialYear: row.financialYear,
    quarter: row.quarter || 'Annual',
    deducteeName: row.deducteeName,
    pan: row.pan || '',
    certificateNumber: row.certificateNumber || '',
    transactionCount: Array.isArray(row.transactionIds) ? row.transactionIds.length : 0,
    status: row.status,
    emailedTo: row.emailedTo || '',
    emailedAt: row.emailedAt,
    fileName: row.fileName || '',
    createdAt: row.createdAt,
  }));

  const challanStatus = (challans as any[]).map((row) => ({
    _id: safeObjectId(row._id),
    paymentDate: row.paymentDate,
    financialYear: row.financialYear,
    quarter: row.quarter || '',
    sectionCode: row.sectionCode || 'All sections',
    challanSerialNo: row.challanSerialNo,
    bsrCode: row.bsrCode,
    cin: row.cin || '',
    bankName: row.bankName || '',
    amount: reportNumber(row.amount),
    allocatedAmount: reportNumber(row.allocatedAmount),
    unallocatedAmount: reportNumber(row.unallocatedAmount),
    status: row.status,
    consumptionStatus: Number(row.unallocatedAmount || 0) > 0 ? 'Partly consumed' : 'Fully allocated',
  }));

  const paymentRegister = [...challanStatus].sort((left, right) =>
    new Date(left.paymentDate || 0).getTime() - new Date(right.paymentDate || 0).getTime()
  );

  const reconciliationRows = (reconciliationRuns as any[]).map((row) => ({
    _id: safeObjectId(row._id),
    sourceType: row.sourceType,
    financialYear: row.financialYear,
    quarter: row.quarter || 'All',
    importedRows: Number(row.summary?.imported || row.importedRows?.length || 0),
    booksRows: Number(row.summary?.books || 0),
    matchedRows: Number(row.summary?.matched || row.matchedRows?.length || 0),
    mismatchRows: Number(row.summary?.mismatches || row.mismatchRows?.length || 0),
    missingInBooks: Number(row.summary?.missingInBooks || row.missingInBooks?.length || 0),
    missingInImport: Number(row.summary?.missingInImport || row.missingInImport?.length || 0),
    notes: row.notes || '',
    createdAt: row.createdAt,
  }));

  const buildMismatchRows = (run: any, bucket: 'mismatch' | 'missing_in_books' | 'missing_in_import', rows: Array<Record<string, any>>) =>
    rows.map((row, index) => {
      const bookAmount = reportNumber(firstReportValue(row, ['bookTds', 'booksAmount', 'tdsAmountBooks', 'bookAmount']));
      const importAmount = reportNumber(firstReportValue(row, ['importTds', 'importAmount', 'tdsAmount', 'taxDeducted', 'amount']));
      const difference = bucket === 'mismatch'
        ? reportNumber(firstReportValue(row, ['amountDiff', 'difference']) ?? (bookAmount - importAmount))
        : bucket === 'missing_in_books'
          ? reportNumber(importAmount)
          : reportNumber(bookAmount || firstReportValue(row, ['tdsAmount']));
      return {
        _id: `${safeObjectId(run._id)}-${bucket}-${index}`,
        sourceType: run.sourceType,
        financialYear: run.financialYear,
        quarter: run.quarter || 'All',
        mismatchType: bucket,
        referenceNo: reportText(firstReportValue(row, ['referenceNo', 'importReference', 'challanSerialNo', 'transactionId', 'bookId'])),
        pan: reportText(firstReportValue(row, ['pan', 'bookPan', 'importPan', 'PAN'])),
        bookAmount,
        importAmount,
        difference,
        notes: reportText(firstReportValue(row, ['reason', 'status', 'notes']), ''),
        createdAt: run.createdAt,
      };
    });

  const mismatchRows = (reconciliationRuns as any[]).flatMap((run) => [
    ...buildMismatchRows(run, 'mismatch', run.mismatchRows || []),
    ...buildMismatchRows(run, 'missing_in_books', run.missingInBooks || []),
    ...buildMismatchRows(run, 'missing_in_import', run.missingInImport || []),
  ]);

  const correctionReturns = (returns as any[])
    .filter((row) => row.status === 'correction' || row.originalTokenNo || row.correctionTokenNo)
    .map((row) => ({
      _id: safeObjectId(row._id),
      formType: row.formType,
      financialYear: row.financialYear,
      quarter: row.quarter,
      status: row.status,
      originalTokenNo: row.originalTokenNo || '',
      correctionTokenNo: row.correctionTokenNo || '',
      acknowledgementNo: row.acknowledgementNo || '',
      updatedAt: row.updatedAt || row.createdAt,
      notes: row.notes || '',
    }));

  const auditTrail = (auditLogs as any[]).map((row) => ({
    _id: safeObjectId(row._id),
    createdAt: row.createdAt,
    action: row.action,
    entityType: row.entityType,
    referenceNo: row.referenceNo || '',
    userId: row.userId || '',
    storeKey: row.storeKey || '',
    details: row.metadata?.summary || row.metadata?.message || row.after?.status || '',
  }));

  const taxAuditClause34 = tdsComputation.map((row) => ({
    _id: `clause34-${row.sectionCode}`,
    sectionCode: row.sectionCode,
    returnSectionCode: row.returnSectionCode,
    natureOfPayment: row.natureOfPayment,
    formType: row.formType,
    amountPaidOrCredited: row.taxableAmount,
    taxDeductible: row.tdsDeducted,
    taxDeducted: row.tdsDeducted,
    taxPaid: row.tdsPaid,
    taxPayable: row.tdsPending,
    amountNotDeducted: row.notDeductedTaxableAmount,
    remarks: row.tdsPending > 0 ? 'Pending challan deposit / reconciliation' : 'Matched with deposited amount in books',
  }));

  const summaryTotals = (transactions as any[]).reduce(
    (acc, row) => {
      acc.taxable += Number(row.taxableAmount || 0);
      acc.deducted += Number(row.tdsAmount || 0);
      acc.paid += Number(row.paidAmount || 0);
      acc.outstanding += Number(row.balanceAmount || 0);
      return acc;
    },
    { taxable: 0, deducted: 0, paid: 0, outstanding: 0 }
  );

  return {
    period: {
      startDate: toIsoDate(rangeStart),
      endDate: toIsoDate(rangeEnd),
      financialYear,
      quarter: quarter || 'All',
    },
    company,
    summary: {
      taxable: roundTds(summaryTotals.taxable),
      deducted: roundTds(summaryTotals.deducted),
      paid: roundTds(summaryTotals.paid),
      outstanding: roundTds(summaryTotals.outstanding),
      reportCount: 12,
      returnDrafts: (returns as any[]).length,
      certificates: certificateRows.length,
      challans: challanStatus.length,
      reconciliationRuns: reconciliationRows.length,
      mismatches: mismatchRows.length,
    },
    statutory: {
      quarterlyReturns,
      certificates: certificateRows,
      certificateForms: ['Form16', 'Form16A', 'Form27D'],
    },
    compliance: {
      tdsComputation,
      tdsPayables,
      tdsOutstanding,
    },
    reconciliation: {
      runs: reconciliationRows,
      mismatches: mismatchRows,
    },
    challans: {
      status: challanStatus,
      paymentRegister,
    },
    audit: {
      correctionReturns,
      auditTrail,
      taxAuditClause34,
    },
  };
};

export const buildTdsDashboard = async () => {
  const [company, sections, profiles, transactions, challans, returns, certificates, reconciliationRuns] = await Promise.all([
    getTdsCompanySettings(),
    TdsSection.find({ isActive: true }).sort({ sectionCode: 1 }).lean(),
    TdsDeducteeProfile.find({ isActive: true }).sort({ deducteeName: 1 }).lean(),
    TdsTransaction.find({ status: { $ne: 'reversed' } }).sort({ transactionDate: -1, createdAt: -1 }).limit(200).lean(),
    TdsChallan.find({ status: { $ne: 'cancelled' } }).sort({ paymentDate: -1, createdAt: -1 }).limit(50).lean(),
    TdsReturn.find().sort({ createdAt: -1 }).limit(50).lean(),
    TdsCertificate.find().sort({ createdAt: -1 }).limit(50).lean(),
    TdsReconciliationRun.find().sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  const totals = transactions.reduce(
    (acc: Record<string, number>, row: any) => {
      acc.taxable += Number(row.taxableAmount || 0);
      acc.deducted += Number(row.tdsAmount || 0);
      acc.paid += Number(row.paidAmount || 0);
      acc.outstanding += Number(row.balanceAmount || 0);
      if (row.status === 'filed') acc.filed += Number(row.tdsAmount || 0);
      return acc;
    },
    { taxable: 0, deducted: 0, paid: 0, outstanding: 0, filed: 0 }
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = roundTds(totals[key]);
  });

  const now = Date.now();
  const overdue = transactions.filter((row: any) => Number(row.balanceAmount || 0) > 0 && row.dueDate && new Date(row.dueDate).getTime() < now);
  const warnings: string[] = [];
  if (!company.tan) warnings.push('Company TAN is not configured. TDS challans and returns require TAN.');
  if (!company.pan) warnings.push('Company PAN is not configured.');
  if (overdue.length) warnings.push(`${overdue.length} TDS deduction(s) look overdue for challan deposit.`);

  return {
    company,
    summary: {
      sectionsCount: sections.length,
      profilesCount: profiles.length,
      ...totals,
      overdueCount: overdue.length,
    },
    warnings,
    sections,
    profiles,
    transactions,
    challans,
    returns,
    certificates,
    reconciliationRuns,
  };
};
