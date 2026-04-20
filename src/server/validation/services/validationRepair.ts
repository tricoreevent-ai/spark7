import mongoose from 'mongoose';
import { AccountGroup } from '../../models/AccountGroup.js';
import { AccountType, ChartAccount, IChartAccount } from '../../models/ChartAccount.js';
import { IVendor, Vendor } from '../../models/Vendor.js';
import { writeAuditLog } from '../../services/audit.js';
import { generateNumber } from '../../services/numbering.js';
import { writeRecordVersion } from '../../services/recordVersion.js';
import { ValidationCheckResult, ValidationRepairLogEntry, ValidationRepairResult, ValidationReportDocument } from '../types.js';

const repairableChecks = ['Orphan Records', 'Vendor/Customer Reconciliation'] as const;

const toCount = (value: unknown): number => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toObjectRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

const toObjectIdString = (value: unknown): string => {
  const raw = String(value || '').trim();
  return mongoose.isValidObjectId(raw) ? raw : '';
};

const exactNameRegex = (value: string): RegExp =>
  new RegExp(`^${String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const vendorLedgerName = (vendorName: string): string => `Vendor - ${String(vendorName || '').trim()}`;

const addLog = (
  logs: ValidationRepairLogEntry[],
  entry: ValidationRepairLogEntry
): void => {
  logs.push(entry);
};

const getRepairableCount = (detail?: ValidationCheckResult): number => {
  if (!detail || detail.status !== 'FAIL') return 0;
  const actual = toObjectRecord(detail.actual);
  if (detail.checkName === 'Orphan Records') {
    return toCount(actual.orphanVendors);
  }
  if (detail.checkName === 'Vendor/Customer Reconciliation') {
    return toCount(actual.missingVendorLedgerAccounts);
  }
  return 0;
};

const findRepairableDetails = (report: ValidationReportDocument): ValidationCheckResult[] =>
  (report.details || []).filter((detail) => repairableChecks.includes(detail.checkName as (typeof repairableChecks)[number]));

const collectVendorTargets = async (): Promise<IVendor[]> => {
  const missingLedgerVendors = await Vendor.find({
    isActive: { $ne: false },
    $or: [
      { ledgerAccountId: { $exists: false } },
      { ledgerAccountId: null },
    ],
  });

  const vendorsWithLedger = await Vendor.find({
    isActive: { $ne: false },
    ledgerAccountId: { $exists: true, $ne: null },
  });

  const referencedLedgerIds = Array.from(
    new Set(
      vendorsWithLedger
        .map((vendor) => toObjectIdString(vendor.ledgerAccountId))
        .filter(Boolean)
    )
  );

  const existingLedgerIds = new Set(
    (
      referencedLedgerIds.length
        ? await ChartAccount.find({ _id: { $in: referencedLedgerIds } }).select('_id').lean()
        : []
    ).map((row: any) => String(row._id))
  );

  const danglingLedgerVendors = vendorsWithLedger.filter((vendor) => !existingLedgerIds.has(toObjectIdString(vendor.ledgerAccountId)));
  const deduped = new Map<string, IVendor>();

  [...missingLedgerVendors, ...danglingLedgerVendors].forEach((vendor) => {
    deduped.set(String(vendor._id), vendor);
  });

  return Array.from(deduped.values());
};

const findReusableVendorLedger = async (vendor: IVendor): Promise<IChartAccount | null> => {
  const name = vendorLedgerName(vendor.name);
  const candidate = await ChartAccount.findOne({
    accountName: { $regex: exactNameRegex(name) },
    subType: 'supplier',
  });

  if (!candidate) return null;

  const alreadyLinked = await Vendor.findOne({
    _id: { $ne: vendor._id },
    ledgerAccountId: candidate._id,
  }).select('_id');

  return alreadyLinked ? null : candidate;
};

const syncVendorLedgerAccount = async (args: {
  vendor: IVendor;
  ledgerAccount: IChartAccount;
  requestedBy?: string;
  reportId: string;
  logs: ValidationRepairLogEntry[];
  counts: ValidationRepairResult['summary'];
}): Promise<IChartAccount> => {
  const { vendor, requestedBy, reportId, logs, counts } = args;
  const ledgerAccount = args.ledgerAccount;
  const before = ledgerAccount.toObject ? ledgerAccount.toObject() : { ...ledgerAccount };
  let changed = false;

  if (!ledgerAccount.isSystem) {
    const targetName = vendorLedgerName(vendor.name);
    if (ledgerAccount.accountName !== targetName) {
      ledgerAccount.accountName = targetName;
      changed = true;
    }
    if (ledgerAccount.subType !== 'supplier') {
      ledgerAccount.subType = 'supplier';
      changed = true;
    }
    const group = vendor.groupId && mongoose.isValidObjectId(vendor.groupId)
      ? await AccountGroup.findById(vendor.groupId)
      : null;
    const targetAccountType = (group?.under as AccountType | undefined) || 'liability';
    if (ledgerAccount.accountType !== targetAccountType) {
      ledgerAccount.accountType = targetAccountType;
      changed = true;
    }
    if (String(ledgerAccount.groupId || '') !== String(vendor.groupId || '')) {
      ledgerAccount.groupId = vendor.groupId || undefined;
      changed = true;
    }
    if (String(ledgerAccount.groupName || '') !== String(vendor.groupName || '')) {
      ledgerAccount.groupName = vendor.groupName || undefined;
      changed = true;
    }
    const openingBalance = Number(vendor.openingBalance || 0);
    if (Number(ledgerAccount.openingBalance || 0) !== openingBalance) {
      ledgerAccount.openingBalance = openingBalance;
      changed = true;
    }
    const openingSide = vendor.openingSide === 'debit' ? 'debit' : 'credit';
    if (ledgerAccount.openingSide !== openingSide) {
      ledgerAccount.openingSide = openingSide;
      changed = true;
    }
  }

  if (changed) {
    await ledgerAccount.save();
    counts.vendorLedgersSynchronized += 1;
    addLog(logs, {
      level: 'success',
      message: `Synchronized ledger master for vendor ${vendor.name}.`,
      entityType: 'chart_account',
      entityId: String(ledgerAccount._id),
    });
    await writeRecordVersion({
      module: 'validation',
      entityType: 'chart_account',
      recordId: String(ledgerAccount._id),
      action: 'VALIDATION_REPAIR',
      changedBy: requestedBy,
      dataSnapshot: ledgerAccount.toObject(),
      metadata: { reportId, reason: 'vendor_ledger_sync' },
    });
    await writeAuditLog({
      module: 'validation',
      action: 'validation_repair_chart_account_synced',
      entityType: 'chart_account',
      entityId: String(ledgerAccount._id),
      referenceNo: ledgerAccount.accountCode,
      userId: requestedBy,
      metadata: { reportId, reason: 'vendor_ledger_sync' },
      before,
      after: ledgerAccount.toObject(),
    });
  }

  return ledgerAccount;
};

const createVendorLedgerAccount = async (args: {
  vendor: IVendor;
  requestedBy?: string;
  reportId: string;
  logs: ValidationRepairLogEntry[];
  counts: ValidationRepairResult['summary'];
}): Promise<IChartAccount> => {
  const { vendor, requestedBy, reportId, logs, counts } = args;
  const reusable = await findReusableVendorLedger(vendor);
  if (reusable) {
    await syncVendorLedgerAccount({
      vendor,
      ledgerAccount: reusable,
      requestedBy,
      reportId,
      logs,
      counts,
    });
    return reusable;
  }

  const group = vendor.groupId && mongoose.isValidObjectId(vendor.groupId)
    ? await AccountGroup.findById(vendor.groupId)
    : null;
  const parentAccount = await ChartAccount.findOne({ systemKey: 'accounts_payable' }).select('_id');
  const ledgerAccount = await ChartAccount.create({
    accountCode: await generateNumber('chart_account_manual', { prefix: 'AC-', padTo: 5 }),
    accountName: vendorLedgerName(vendor.name),
    accountType: (group?.under as AccountType | undefined) || 'liability',
    subType: 'supplier',
    parentAccountId: parentAccount?._id,
    groupId: vendor.groupId || undefined,
    groupName: vendor.groupName || undefined,
    openingBalance: Number(vendor.openingBalance || 0),
    openingSide: vendor.openingSide === 'debit' ? 'debit' : 'credit',
    isSystem: false,
    isActive: true,
    createdBy: requestedBy,
  });

  counts.vendorLedgersCreated += 1;
  addLog(logs, {
    level: 'success',
    message: `Created supplier ledger ${ledgerAccount.accountCode} for vendor ${vendor.name}.`,
    entityType: 'chart_account',
    entityId: String(ledgerAccount._id),
  });
  await writeRecordVersion({
    module: 'validation',
    entityType: 'chart_account',
    recordId: String(ledgerAccount._id),
    action: 'VALIDATION_REPAIR',
    changedBy: requestedBy,
    dataSnapshot: ledgerAccount.toObject(),
    metadata: { reportId, reason: 'vendor_ledger_create' },
  });
  await writeAuditLog({
    module: 'validation',
    action: 'validation_repair_chart_account_created',
    entityType: 'chart_account',
    entityId: String(ledgerAccount._id),
    referenceNo: ledgerAccount.accountCode,
    userId: requestedBy,
    metadata: { reportId, reason: 'vendor_ledger_create' },
    after: ledgerAccount.toObject(),
  });
  return ledgerAccount;
};

const repairVendorLedgerLink = async (args: {
  vendor: IVendor;
  requestedBy?: string;
  reportId: string;
  logs: ValidationRepairLogEntry[];
  counts: ValidationRepairResult['summary'];
}): Promise<'repaired' | 'skipped'> => {
  const { vendor, requestedBy, reportId, logs, counts } = args;
  const vendorBefore = vendor.toObject();
  const currentLedgerId = toObjectIdString(vendor.ledgerAccountId);
  const currentLedger = currentLedgerId ? await ChartAccount.findById(currentLedgerId) : null;

  if (currentLedger) {
    await syncVendorLedgerAccount({
      vendor,
      ledgerAccount: currentLedger,
      requestedBy,
      reportId,
      logs,
      counts,
    });
    addLog(logs, {
      level: 'info',
      message: `Vendor ${vendor.name} is already linked to an active supplier ledger. No link repair was needed.`,
      entityType: 'vendor',
      entityId: String(vendor._id),
    });
    return 'skipped';
  }

  const ledgerAccount = await createVendorLedgerAccount({
    vendor,
    requestedBy,
    reportId,
    logs,
    counts,
  });

  vendor.ledgerAccountId = ledgerAccount._id as mongoose.Types.ObjectId;
  await vendor.save();
  counts.vendorLedgersLinked += 1;
  addLog(logs, {
    level: 'success',
    message: `Linked vendor ${vendor.name} to ledger ${ledgerAccount.accountCode}.`,
    entityType: 'vendor',
    entityId: String(vendor._id),
  });
  await writeRecordVersion({
    module: 'validation',
    entityType: 'vendor',
    recordId: String(vendor._id),
    action: 'VALIDATION_REPAIR',
    changedBy: requestedBy,
    dataSnapshot: vendor.toObject(),
    metadata: { reportId, reason: 'vendor_ledger_link' },
  });
  await writeAuditLog({
    module: 'validation',
    action: 'validation_repair_vendor_linked',
    entityType: 'vendor',
    entityId: String(vendor._id),
    referenceNo: vendor.name,
    userId: requestedBy,
    metadata: {
      reportId,
      linkedLedgerAccountId: String(ledgerAccount._id),
      linkedLedgerAccountCode: ledgerAccount.accountCode,
    },
    before: vendorBefore,
    after: vendor.toObject(),
  });
  return 'repaired';
};

export const repairValidationReportFindings = async (args: {
  report: ValidationReportDocument;
  requestedBy?: string;
}): Promise<ValidationRepairResult> => {
  const reportId = String(args.report._id || '').trim();
  const repairableDetails = findRepairableDetails(args.report);
  const supportedFindingCount = repairableDetails.reduce((sum, detail) => sum + getRepairableCount(detail), 0);
  const logs: ValidationRepairLogEntry[] = [];
  const summary: ValidationRepairResult['summary'] = {
    vendorsReviewed: 0,
    vendorLedgersCreated: 0,
    vendorLedgersLinked: 0,
    vendorLedgersSynchronized: 0,
    manualFollowUps: 0,
  };

  if (!reportId) {
    return {
      reportId: '',
      repaired: false,
      repairedCount: 0,
      skippedCount: 0,
      supportedFindingCount: 0,
      rerunRecommended: false,
      message: 'Validation report ID is missing.',
      logs: [{ level: 'error', message: 'Cannot repair findings without a valid validation report ID.' }],
      summary,
    };
  }

  if (supportedFindingCount <= 0) {
    return {
      reportId,
      repaired: false,
      repairedCount: 0,
      skippedCount: 0,
      supportedFindingCount: 0,
      rerunRecommended: false,
      message: 'This validation report does not contain any supported auto-repair findings.',
      logs: [
        {
          level: 'warning',
          message: 'Only vendor ledger master-link issues can be repaired automatically right now. Balance corrections still need accountant review.',
          entityType: 'validation_report',
          entityId: reportId,
        },
      ],
      summary,
    };
  }

  addLog(logs, {
    level: 'info',
    message: 'Scanning the current tenant database for vendors with missing or dangling ledger links.',
    entityType: 'validation_report',
    entityId: reportId,
  });

  const vendors = await collectVendorTargets();
  summary.vendorsReviewed = vendors.length;

  if (!vendors.length) {
    return {
      reportId,
      repaired: false,
      repairedCount: 0,
      skippedCount: 0,
      supportedFindingCount,
      rerunRecommended: true,
      message: 'No current vendor ledger-link issues were found. The report may already be fixed or may need manual accounting corrections.',
      logs: [
        ...logs,
        {
          level: 'info',
          message: 'No vendors currently need ledger-link repair. Run validation again to confirm whether the earlier finding is already resolved.',
          entityType: 'validation_report',
          entityId: reportId,
        },
      ],
      summary,
    };
  }

  let repairedCount = 0;
  let skippedCount = 0;

  for (const vendor of vendors) {
    try {
      const outcome = await repairVendorLedgerLink({
        vendor,
        requestedBy: args.requestedBy,
        reportId,
        logs,
        counts: summary,
      });
      if (outcome === 'repaired') repairedCount += 1;
      else skippedCount += 1;
    } catch (error: any) {
      skippedCount += 1;
      summary.manualFollowUps += 1;
      addLog(logs, {
        level: 'error',
        message: `Failed to repair vendor ${vendor.name}: ${error?.message || String(error)}`,
        entityType: 'vendor',
        entityId: String(vendor._id),
      });
    }
  }

  const message =
    repairedCount > 0
      ? `Applied ${repairedCount} vendor ledger repair(s). Run Full Validation Now again to confirm the database is clean.`
      : 'No automatic repairs were applied. Manual accounting review is still required for the remaining findings.';

  await writeAuditLog({
    module: 'validation',
    action: 'validation_report_repair_run',
    entityType: 'validation_report',
    entityId: reportId,
    referenceNo: reportId,
    userId: args.requestedBy,
    metadata: {
      repairedCount,
      skippedCount,
      supportedFindingCount,
      summary,
    },
    after: {
      repairedCount,
      skippedCount,
      supportedFindingCount,
      summary,
      logs,
    },
  });

  return {
    reportId,
    repaired: repairedCount > 0,
    repairedCount,
    skippedCount,
    supportedFindingCount,
    rerunRecommended: true,
    message,
    logs,
    summary,
  };
};
