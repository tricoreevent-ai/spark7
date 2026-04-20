const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface ValidationConfig {
  mongo: {
    uri: string;
    readPreference: string;
    serverSelectionTimeoutMs: number;
  };
  tenant: {
    field: string;
    includeRecordsWithoutTenant: boolean;
  };
  numeric: {
    tolerance: number;
    roundOffTolerance: number;
  };
  scheduler: {
    enabled: boolean;
    cron: string;
    timezone: string;
  };
  alerts: {
    emailRecipients: string[];
    slackWebhookUrl: string;
  };
  collections: {
    validationReports: string;
    validationIssueFeedback: string;
    validationSettings: string;
    ledgerEntries: string;
    chartAccounts: string;
    journalEntries: string;
    journalLines: string;
    accountingVouchers: string;
    accountingInvoices: string;
    accountingPayments: string;
    sales: string;
    vendors: string;
    customers: string;
    tdsTransactions: string;
    tdsChallans: string;
    gstReturns: string;
    financialPeriods: string;
    fixedAssets: string;
    bankFeedTransactions: string;
  };
  fields: {
    ledger: {
      accountId: string;
      entryDate: string;
      voucherType: string;
      voucherNumber: string;
      referenceNo: string;
      debit: string;
      credit: string;
      runningBalance: string;
      isDeleted: string;
      paymentMode: string;
      metadata: string;
      createdAt: string;
      updatedAt: string;
    };
    chartAccount: {
      accountCode: string;
      accountName: string;
      accountType: string;
      subType: string;
      systemKey: string;
      groupName: string;
      openingBalance: string;
      openingSide: string;
      isActive: string;
    };
    journalEntry: {
      entryNumber: string;
      entryDate: string;
      status: string;
      totalDebit: string;
      totalCredit: string;
      referenceType: string;
      referenceId: string;
      createdAt: string;
      updatedAt: string;
    };
    journalLine: {
      journalId: string;
      accountId: string;
      entryDate: string;
      debitAmount: string;
      creditAmount: string;
    };
    tdsTransaction: {
      transactionDate: string;
      tdsAmount: string;
      paidAmount: string;
      balanceAmount: string;
      status: string;
      sectionCode: string;
      deducteeName: string;
      referenceNo: string;
      challanId: string;
    };
    tdsChallan: {
      paymentDate: string;
      amount: string;
      allocatedAmount: string;
      unallocatedAmount: string;
      status: string;
      challanSerialNo: string;
      sectionCode: string;
    };
    financialPeriod: {
      startDate: string;
      endDate: string;
      status: string;
      isClosed: string;
      isLocked: string;
      lockedAt: string;
    };
    fixedAsset: {
      acquisitionDate: string;
      cost: string;
      depreciationRate: string;
      accumulatedDepreciation: string;
      status: string;
      assetName: string;
    };
  };
  sequences: Array<{
    checkName: string;
    collection: keyof ValidationConfig['collections'];
    field: string;
    dateField: string;
  }>;
}

export const buildValidationConfig = (): ValidationConfig => ({
  mongo: {
    uri: String(process.env.VALIDATION_DATABASE_URL || process.env.DATABASE_URL || '').trim(),
    readPreference: String(process.env.VALIDATION_READ_PREFERENCE || 'secondaryPreferred').trim(),
    serverSelectionTimeoutMs: toNumber(process.env.VALIDATION_DB_TIMEOUT_MS, 10000),
  },
  tenant: {
    field: String(process.env.VALIDATION_TENANT_FIELD || 'tenantId').trim(),
    includeRecordsWithoutTenant: parseBoolean(process.env.VALIDATION_INCLUDE_UNTENANTED, true),
  },
  numeric: {
    tolerance: toNumber(process.env.VALIDATION_TOLERANCE, 0.5),
    roundOffTolerance: toNumber(process.env.VALIDATION_ROUND_OFF_TOLERANCE, 1),
  },
  scheduler: {
    enabled: parseBoolean(process.env.VALIDATION_CRON_ENABLED, true),
    cron: String(process.env.VALIDATION_CRON_SCHEDULE || '0 2 * * *').trim(),
    timezone: String(process.env.VALIDATION_CRON_TIMEZONE || 'Asia/Kolkata').trim(),
  },
  alerts: {
    emailRecipients: String(process.env.VALIDATION_ALERT_EMAILS || process.env.SMTP_TO_RECIPIENTS || '')
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    slackWebhookUrl: String(process.env.VALIDATION_SLACK_WEBHOOK_URL || '').trim(),
  },
  collections: {
    validationReports: 'validation_reports',
    validationIssueFeedback: 'validation_issue_feedback',
    validationSettings: 'validation_settings',
    ledgerEntries: 'accountledgerentries',
    chartAccounts: 'chartaccounts',
    journalEntries: 'journalentries',
    journalLines: 'journallines',
    accountingVouchers: 'accountingvouchers',
    accountingInvoices: 'accountinginvoices',
    accountingPayments: 'accountingpayments',
    sales: 'sales',
    vendors: 'vendors',
    customers: 'customers',
    tdsTransactions: 'tdstransactions',
    tdsChallans: 'tdschallans',
    gstReturns: 'gstreturnrecords',
    financialPeriods: 'financialperiods',
    fixedAssets: 'fixedassets',
    bankFeedTransactions: 'bankfeedtransactions',
  },
  fields: {
    ledger: {
      accountId: 'accountId',
      entryDate: 'entryDate',
      voucherType: 'voucherType',
      voucherNumber: 'voucherNumber',
      referenceNo: 'referenceNo',
      debit: 'debit',
      credit: 'credit',
      runningBalance: 'runningBalance',
      isDeleted: 'isDeleted',
      paymentMode: 'paymentMode',
      metadata: 'metadata',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    chartAccount: {
      accountCode: 'accountCode',
      accountName: 'accountName',
      accountType: 'accountType',
      subType: 'subType',
      systemKey: 'systemKey',
      groupName: 'groupName',
      openingBalance: 'openingBalance',
      openingSide: 'openingSide',
      isActive: 'isActive',
    },
    journalEntry: {
      entryNumber: 'entryNumber',
      entryDate: 'entryDate',
      status: 'status',
      totalDebit: 'totalDebit',
      totalCredit: 'totalCredit',
      referenceType: 'referenceType',
      referenceId: 'referenceId',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    journalLine: {
      journalId: 'journalId',
      accountId: 'accountId',
      entryDate: 'entryDate',
      debitAmount: 'debitAmount',
      creditAmount: 'creditAmount',
    },
    tdsTransaction: {
      transactionDate: 'transactionDate',
      tdsAmount: 'tdsAmount',
      paidAmount: 'paidAmount',
      balanceAmount: 'balanceAmount',
      status: 'status',
      sectionCode: 'sectionCode',
      deducteeName: 'deducteeName',
      referenceNo: 'referenceNo',
      challanId: 'challanId',
    },
    tdsChallan: {
      paymentDate: 'paymentDate',
      amount: 'amount',
      allocatedAmount: 'allocatedAmount',
      unallocatedAmount: 'unallocatedAmount',
      status: 'status',
      challanSerialNo: 'challanSerialNo',
      sectionCode: 'sectionCode',
    },
    financialPeriod: {
      startDate: 'startDate',
      endDate: 'endDate',
      status: 'status',
      isClosed: 'isClosed',
      isLocked: 'isLocked',
      lockedAt: 'lockedAt',
    },
    fixedAsset: {
      acquisitionDate: 'purchaseDate',
      cost: 'cost',
      depreciationRate: 'lifeYears',
      accumulatedDepreciation: 'totalDepreciationPosted',
      status: 'status',
      assetName: 'assetName',
    },
  },
  sequences: [
    { checkName: 'Invoice Sequence', collection: 'accountingInvoices', field: 'invoiceNumber', dateField: 'invoiceDate' },
    { checkName: 'Voucher Sequence', collection: 'accountingVouchers', field: 'voucherNumber', dateField: 'voucherDate' },
    { checkName: 'Journal Sequence', collection: 'journalEntries', field: 'entryNumber', dateField: 'entryDate' },
    { checkName: 'Payment Sequence', collection: 'accountingPayments', field: 'paymentNumber', dateField: 'paymentDate' },
  ],
});

export const getValidationConfig = (): ValidationConfig => buildValidationConfig();

export const validationConfig: ValidationConfig = buildValidationConfig();
