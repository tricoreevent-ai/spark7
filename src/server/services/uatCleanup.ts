import mongoose from 'mongoose';

type PlainRow = Record<string, any>;

export interface UatCleanupCollectionResult {
  name: string;
  before: number;
  deleted: number;
  after: number;
}

export interface UatCleanupResult {
  status: 'PASS' | 'FAIL' | 'DRY_RUN';
  collections: UatCleanupCollectionResult[];
  warnings: string[];
}

export interface UatCleanupInput {
  dryRun?: boolean;
  tags?: string[];
  prefixes?: string[];
  tenantId?: string;
  overrideSafeThreshold?: boolean;
}

const TARGET_COLLECTIONS = [
  'products',
  'suppliers',
  'vendors',
  'chartaccounts',
  'purchaseorders',
  'purchasebills',
  'sales',
  'saleorders',
  'posorders',
  'invoices',
  'payments',
  'receipts',
  'receiptvouchers',
  'returns',
  'accountinginvoices',
  'accountingpayments',
  'customerledgerentries',
  'accountingvouchers',
  'daybookentries',
  'journalentries',
  'journallines',
  'accountledgerentries',
  'stockledgerentries',
  'inventories',
  'inventorybatches',
  'bankfeedtransactions',
  'reconciliationlinks',
  'reconciliationbookstates',
  'auditlogs',
  'record_versions',
] as const;

const SAFE_NAMES = [
  'Procurement UAT',
  'Sales Matrix',
  'Treasury Matrix',
  'Vendor Quality Missing GSTIN Supplier',
];

const DEFAULT_PREFIXES = ['INV-SM-', 'INV-TM-', 'PROC-UAT-'];
const COLLECTION_SAFE_THRESHOLD = 2500;
const TOTAL_SAFE_THRESHOLD = 15000;

const normalize = (value: unknown): string => String(value || '').trim();
const lower = (value: unknown): string => normalize(value).toLowerCase();
const oidText = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'object' && value !== null && '$oid' in (value as PlainRow)) {
    return normalize((value as PlainRow).$oid);
  }
  return normalize(value);
};

const unique = (values: string[]): string[] => Array.from(new Set(values.map(normalize).filter(Boolean)));

const tagVariants = (tags: string[]): string[] =>
  unique(tags.flatMap((tag) => {
    const raw = normalize(tag);
    const unbracketed = raw.replace(/^\[|\]$/g, '');
    return [raw, unbracketed, `[${unbracketed}]`].filter(Boolean);
  }));

const hasAny = (value: unknown, needles: string[]): boolean => {
  const text = lower(value);
  return Boolean(text) && needles.some((needle) => text.includes(lower(needle)));
};

const startsWithAny = (value: unknown, prefixes: string[]): boolean => {
  const text = normalize(value).toUpperCase();
  return Boolean(text) && prefixes.some((prefix) => text.startsWith(prefix.toUpperCase()));
};

const matchesAny = (value: unknown, values: string[]): boolean => values.includes(normalize(value));

const rowText = (row: PlainRow): string => [
  row.name,
  row.accountName,
  row.displayName,
  row.customerName,
  row.supplierName,
  row.description,
  row.notes,
  row.narration,
  row.reason,
  row.referenceNo,
  row.invoiceNumber,
  row.saleNumber,
  row.purchaseNumber,
  row.billNumber,
  row.voucherNumber,
  row.entryNumber,
  row.returnNumber,
  row.supplierCode,
  row.sku,
  row.metadata?.seedTag,
  row.metadata?.uatTag,
  row.metadata?.sourceInvoiceNumber,
  row.metadata?.linkedEntityNumber,
  Array.isArray(row.tags) ? row.tags.join(' ') : '',
  Array.isArray(row.metadata?.tags) ? row.metadata.tags.join(' ') : '',
].map(normalize).filter(Boolean).join(' ');

const explicitUatTagMatch = (row: PlainRow, tags: string[]): boolean => {
  const text = rowText(row);
  return hasAny(text, tags);
};

const fallbackUatMatch = (row: PlainRow, prefixes: string[]): boolean => {
  const references = [
    row.referenceNo,
    row.invoiceNumber,
    row.saleNumber,
    row.purchaseNumber,
    row.billNumber,
    row.voucherNumber,
    row.entryNumber,
    row.returnNumber,
    row.supplierCode,
    row.sku,
    row.metadata?.sourceInvoiceNumber,
    row.metadata?.linkedEntityNumber,
  ];
  const hasReferencePrefix = references.some((value) => startsWithAny(value, prefixes));
  const hasSafeName = hasAny(rowText(row), SAFE_NAMES);
  return hasReferencePrefix && hasSafeName;
};

const safePrimaryMatch = (row: PlainRow, tags: string[], prefixes: string[]): boolean =>
  explicitUatTagMatch(row, tags) || fallbackUatMatch(row, prefixes);

const tenantFilter = (tenantId: string): PlainRow => {
  const values: any[] = [tenantId];
  if (mongoose.isValidObjectId(tenantId)) values.push(new mongoose.Types.ObjectId(tenantId));
  return { tenantId: { $in: values } };
};

const idSet = (rows: PlainRow[]): string[] => unique(rows.map((row) => oidText(row._id)));

const deleteByIds = async (collectionName: string, ids: string[], dryRun: boolean): Promise<number> => {
  if (!ids.length || dryRun) return ids.length;
  const objectIds = ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
  const collection = mongoose.connection.db!.collection(collectionName);
  const result = await collection.deleteMany({ _id: { $in: objectIds } });
  return Number(result.deletedCount || 0);
};

export const cleanupUatData = async (input: UatCleanupInput): Promise<UatCleanupResult> => {
  const tenantId = normalize(input.tenantId);
  if (!tenantId) throw new Error('tenantId is required for targeted UAT cleanup');
  if (!mongoose.connection.db) throw new Error('Database connection is not ready');

  const tags = tagVariants(input.tags?.length ? input.tags : ['PROC-UAT-2026-04-28', 'POS-MATRIX-UAT', 'TREASURY-MATRIX-UAT']);
  const prefixes = unique([...(input.prefixes || []), ...DEFAULT_PREFIXES]);
  const db = mongoose.connection.db;
  const warnings: string[] = [];
  const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegexes = tags.map((tag) => new RegExp(escapeRegex(tag), 'i'));
  const nameRegexes = SAFE_NAMES.map((name) => new RegExp(escapeRegex(name), 'i'));
  const prefixRegexes = prefixes.map((prefix) => new RegExp(`^${escapeRegex(prefix)}`, 'i'));
  const containsPrefixRegexes = prefixes.map((prefix) => new RegExp(escapeRegex(prefix), 'i'));
  const refFields = ['referenceNo', 'invoiceNumber', 'saleNumber', 'purchaseNumber', 'billNumber', 'voucherNumber', 'entryNumber', 'returnNumber', 'supplierCode', 'sku', 'metadata.sourceInvoiceNumber', 'metadata.linkedEntityNumber'];
  const textFields = ['name', 'accountName', 'displayName', 'customerName', 'supplierName', 'description', 'notes', 'narration', 'reason', 'metadata.seedTag', 'metadata.uatTag', 'tags', 'metadata.tags'];
  const regexOr = (fields: string[], regexes: RegExp[]): PlainRow[] =>
    fields.flatMap((field) => regexes.map((regex) => ({ [field]: regex })));
  const byIds = (ids: string[]): any[] => {
    const clean = unique(ids);
    return clean.flatMap((id) => mongoose.isValidObjectId(id) ? [id, new mongoose.Types.ObjectId(id)] : [id]);
  };
  const inIds = (field: string, ids: string[]): PlainRow | null => {
    const values = byIds(ids);
    return values.length ? { [field]: { $in: values } } : null;
  };
  const inValues = (field: string, values: string[]): PlainRow | null =>
    values.length ? { [field]: { $in: unique(values) } } : null;
  const and = (...parts: PlainRow[]): PlainRow => ({ $and: parts.filter(Boolean) });
  const or = (...parts: Array<PlainRow | null | undefined>): PlainRow[] => parts.filter(Boolean) as PlainRow[];
  const findRows = async (name: string, orFilters: PlainRow[], projection: PlainRow = {}): Promise<PlainRow[]> => {
    if (!orFilters.length) return [];
    return db.collection(name).find({ ...tenantFilter(tenantId), $or: orFilters }, { projection }).toArray() as Promise<PlainRow[]>;
  };

  const explicitFilters = () => or(...regexOr(textFields, tagRegexes), ...regexOr(refFields, prefixRegexes));
  const fallbackFilters = () => [
    and({ $or: regexOr(refFields, prefixRegexes) }, { $or: regexOr(textFields, nameRegexes) }),
  ];
  const primaryFilters = () => [...explicitFilters(), ...fallbackFilters()];

  const products = await findRows('products', or(...primaryFilters(), ...regexOr(['sku'], prefixRegexes), ...regexOr(['name'], nameRegexes)), { _id: 1, sku: 1 });
  const suppliers = await findRows('suppliers', or(...primaryFilters(), ...regexOr(['supplierCode'], prefixRegexes), ...regexOr(['name'], nameRegexes)), { _id: 1, supplierCode: 1 });
  const vendors = await findRows('vendors', or(...primaryFilters(), ...regexOr(['name'], nameRegexes), { name: /^procurement uat /i }), { _id: 1, ledgerAccountId: 1, name: 1 });

  const productIds = idSet(products);
  const supplierIds = idSet(suppliers);
  const vendorIds = idSet(vendors);
  const vendorLedgerIds = unique(vendors.map((row) => oidText(row.ledgerAccountId)));

  const purchaseOrders = await findRows('purchaseorders', or(
    ...primaryFilters(),
    inIds('supplierId', supplierIds),
    inIds('items.productId', productIds),
  ), { _id: 1, purchaseNumber: 1 });
  const purchaseIds = idSet(purchaseOrders);
  const purchaseNumbers = unique(purchaseOrders.map((row) => normalize(row.purchaseNumber)));

  const purchaseBills = await findRows('purchasebills', or(
    ...primaryFilters(),
    inIds('purchaseOrderId', purchaseIds),
    inValues('purchaseNumber', purchaseNumbers),
    inIds('supplierId', supplierIds),
  ), { _id: 1, billNumber: 1, journalEntryId: 1 });
  const billIds = idSet(purchaseBills);
  const billNumbers = unique(purchaseBills.map((row) => normalize(row.billNumber)));

  const sales = await findRows('sales', or(
    ...primaryFilters(),
    and({ $or: regexOr(['invoiceNumber', 'saleNumber'], prefixRegexes) }, { $or: regexOr(['customerName', 'notes'], nameRegexes) }),
  ), { _id: 1, invoiceNumber: 1, saleNumber: 1 });
  const saleIds = idSet(sales);
  const saleNumbers = unique(sales.flatMap((row) => [normalize(row.saleNumber), normalize(row.invoiceNumber)]));

  const returns = await findRows('returns', or(
    ...primaryFilters(),
    inIds('saleId', saleIds),
    inValues('sourceInvoiceNumber', saleNumbers),
  ), { _id: 1, returnNumber: 1 });
  const returnIds = idSet(returns);
  const returnNumbers = unique(returns.map((row) => normalize(row.returnNumber)));

  const accountingInvoices = await findRows('accountinginvoices', or(
    ...primaryFilters(),
    inIds('referenceId', saleIds),
    inIds('metadata.sourceSaleId', saleIds),
    inValues('invoiceNumber', saleNumbers),
    inValues('metadata.sourceInvoiceNumber', saleNumbers),
  ), { _id: 1, invoiceNumber: 1, journalEntryId: 1 });
  const accountingInvoiceIds = idSet(accountingInvoices);
  const accountingInvoiceNumbers = unique(accountingInvoices.map((row) => normalize(row.invoiceNumber)));

  const accountingPayments = await findRows('accountingpayments', or(
    ...primaryFilters(),
    inIds('invoiceId', accountingInvoiceIds),
    inIds('metadata.sourceSaleId', saleIds),
    inValues('metadata.sourceInvoiceNumber', saleNumbers),
  ), { _id: 1, paymentNumber: 1, journalEntryId: 1 });
  const accountingPaymentIds = idSet(accountingPayments);
  const accountingPaymentNumbers = unique(accountingPayments.map((row) => normalize(row.paymentNumber)));

  const receiptVouchers = await findRows('receiptvouchers', or(
    ...primaryFilters(),
    inIds('allocations.saleId', saleIds),
    inValues('allocations.saleNumber', saleNumbers),
  ), { _id: 1, voucherNumber: 1 });
  const receiptVoucherIds = idSet(receiptVouchers);
  const receiptVoucherNumbers = unique(receiptVouchers.map((row) => normalize(row.voucherNumber)));

  const accountingVouchers = await findRows('accountingvouchers', or(
    ...primaryFilters(),
    inValues('referenceNo', [...billNumbers, ...saleNumbers]),
    inIds('metadata.linkedEntityId', [...billIds, ...accountingInvoiceIds]),
    inValues('metadata.linkedEntityNumber', [...billNumbers, ...saleNumbers]),
  ), { _id: 1, voucherNumber: 1 });
  const voucherIds = idSet(accountingVouchers);
  const voucherNumbers = unique(accountingVouchers.map((row) => normalize(row.voucherNumber)));

  const taggedReferences = unique([...purchaseNumbers, ...billNumbers, ...saleNumbers, ...returnNumbers, ...accountingInvoiceNumbers, ...accountingPaymentNumbers, ...receiptVoucherNumbers, ...voucherNumbers]);

  const directJournals = await findRows('journalentries', or(
    ...primaryFilters(),
    inValues('referenceNo', taggedReferences),
    inIds('referenceId', [...billIds, ...accountingInvoiceIds, ...accountingPaymentIds, ...voucherIds]),
    inIds('metadata.sourceSaleId', saleIds),
    inValues('metadata.sourceInvoiceNumber', saleNumbers),
  ), { _id: 1, entryNumber: 1 });
  const directJournalIds = unique([...idSet(directJournals), ...purchaseBills.map((row) => oidText(row.journalEntryId)), ...accountingInvoices.map((row) => oidText(row.journalEntryId)), ...accountingPayments.map((row) => oidText(row.journalEntryId))]);
  const directJournalNumbers = unique(directJournals.map((row) => normalize(row.entryNumber)));
  const reversalJournals = await findRows('journalentries', or(
    inIds('metadata.reversalOf', directJournalIds),
    inValues('referenceNo', directJournalNumbers),
  ), { _id: 1, entryNumber: 1 });
  const journalIds = unique([...directJournalIds, ...idSet(reversalJournals)]);
  const journalNumbers = unique([...directJournalNumbers, ...reversalJournals.map((row) => normalize(row.entryNumber))]);

  const chartAccounts = await findRows('chartaccounts', or(
    ...primaryFilters(),
    inIds('_id', vendorLedgerIds),
    { accountName: /^vendor - procurement uat /i },
  ), { _id: 1 });
  const chartAccountIds = idSet(chartAccounts);

  const plans = [
    { name: 'products', ids: productIds },
    { name: 'suppliers', ids: supplierIds },
    { name: 'vendors', ids: vendorIds },
    { name: 'chartaccounts', ids: chartAccountIds },
    { name: 'purchaseorders', ids: purchaseIds },
    { name: 'purchasebills', ids: billIds },
    { name: 'sales', ids: saleIds },
    { name: 'saleorders', ids: idSet(await findRows('saleorders', or(inValues('invoiceNumber', saleNumbers), inValues('referenceNo', saleNumbers)), { _id: 1 })) },
    { name: 'posorders', ids: idSet(await findRows('posorders', or(inValues('invoiceNumber', saleNumbers), inValues('referenceNo', saleNumbers)), { _id: 1 })) },
    { name: 'invoices', ids: idSet(await findRows('invoices', or(inValues('invoiceNumber', saleNumbers), inValues('referenceNo', saleNumbers)), { _id: 1 })) },
    { name: 'payments', ids: idSet(await findRows('payments', or(inValues('referenceNo', saleNumbers), inValues('invoiceNumber', saleNumbers)), { _id: 1 })) },
    { name: 'receipts', ids: idSet(await findRows('receipts', or(inValues('referenceNo', saleNumbers), inValues('voucherNumber', receiptVoucherNumbers)), { _id: 1 })) },
    { name: 'receiptvouchers', ids: receiptVoucherIds },
    { name: 'returns', ids: returnIds },
    { name: 'accountinginvoices', ids: accountingInvoiceIds },
    { name: 'accountingpayments', ids: accountingPaymentIds },
    { name: 'customerledgerentries', ids: idSet(await findRows('customerledgerentries', or(inIds('referenceId', [...saleIds, ...receiptVoucherIds]), inValues('referenceNo', [...saleNumbers, ...receiptVoucherNumbers])), { _id: 1 })) },
    { name: 'accountingvouchers', ids: voucherIds },
    { name: 'daybookentries', ids: idSet(await findRows('daybookentries', or(inValues('referenceNo', [...voucherNumbers, ...billNumbers, ...saleNumbers, ...receiptVoucherNumbers, ...accountingInvoiceNumbers])), { _id: 1 })) },
    { name: 'journalentries', ids: journalIds },
    { name: 'journallines', ids: idSet(await findRows('journallines', or(inIds('journalId', journalIds)), { _id: 1 })) },
    { name: 'accountledgerentries', ids: idSet(await findRows('accountledgerentries', or(
      inValues('referenceNo', taggedReferences),
      inValues('voucherNumber', [...journalNumbers, ...voucherNumbers, ...receiptVoucherNumbers, ...accountingPaymentNumbers]),
      inIds('metadata.sourceId', [...journalIds, ...accountingInvoiceIds, ...accountingPaymentIds, ...voucherIds]),
      inIds('metadata.sourceSaleId', saleIds),
      inIds('accountId', chartAccountIds),
      inIds('relatedAccountId', chartAccountIds),
    ), { _id: 1 })) },
    { name: 'stockledgerentries', ids: idSet(await findRows('stockledgerentries', or(inValues('referenceNo', [...purchaseNumbers, ...saleNumbers]), inIds('referenceId', saleIds), inIds('productId', productIds)), { _id: 1 })) },
    { name: 'inventories', ids: idSet(await findRows('inventories', or(inIds('productId', productIds)), { _id: 1 })) },
    { name: 'inventorybatches', ids: idSet(await findRows('inventorybatches', or(inIds('productId', productIds), inIds('sourceId', purchaseIds), inValues('referenceNo', purchaseNumbers)), { _id: 1 })) },
    { name: 'bankfeedtransactions', ids: idSet(await findRows('bankfeedtransactions', or(inValues('referenceNo', taggedReferences), ...regexOr(['description'], containsPrefixRegexes)), { _id: 1 })) },
    { name: 'reconciliationlinks', ids: idSet(await findRows('reconciliationlinks', or(inValues('bookReferenceNo', taggedReferences), inValues('bankReferenceNo', taggedReferences)), { _id: 1 })) },
    { name: 'reconciliationbookstates', ids: idSet(await findRows('reconciliationbookstates', or(inValues('bookReferenceNo', taggedReferences), ...regexOr(['bookEntryKey'], taggedReferences.map((reference) => new RegExp(escapeRegex(reference), 'i')))), { _id: 1 })) },
    { name: 'auditlogs', ids: idSet(await findRows('auditlogs', or(inValues('referenceNo', taggedReferences), inIds('entityId', [...purchaseIds, ...billIds, ...saleIds, ...returnIds, ...accountingInvoiceIds, ...accountingPaymentIds, ...receiptVoucherIds, ...voucherIds, ...journalIds, ...productIds, ...supplierIds, ...vendorIds, ...chartAccountIds])), { _id: 1 })) },
    { name: 'record_versions', ids: idSet(await findRows('record_versions', or(inIds('recordId', [...purchaseIds, ...billIds, ...saleIds, ...returnIds, ...accountingInvoiceIds, ...accountingPaymentIds, ...receiptVoucherIds, ...voucherIds, ...journalIds, ...productIds, ...supplierIds, ...vendorIds, ...chartAccountIds])), { _id: 1 })) },
  ];

  const plansWithCounts = plans.map((plan) => ({ ...plan, before: plan.ids.length }));

  const unsafe = plansWithCounts.find((plan) => plan.ids.length > COLLECTION_SAFE_THRESHOLD);
  const totalCandidates = plansWithCounts.reduce((sum, plan) => sum + plan.ids.length, 0);
  if (!input.overrideSafeThreshold && (unsafe || totalCandidates > TOTAL_SAFE_THRESHOLD)) {
    throw new Error(`UAT cleanup aborted by safe threshold. collection=${unsafe?.name || 'total'} candidates=${unsafe?.ids.length || totalCandidates}`);
  }

  const collections: UatCleanupCollectionResult[] = [];
  for (const plan of plansWithCounts) {
    const deleted = await deleteByIds(plan.name, plan.ids, Boolean(input.dryRun));
    const after = input.dryRun ? plan.before : Math.max(0, plan.before - deleted);
    collections.push({ name: plan.name, before: plan.before, deleted, after });
  }

  if (totalCandidates === 0) warnings.push('No UAT-tagged/generated records matched the cleanup request.');

  return {
    status: input.dryRun ? 'DRY_RUN' : 'PASS',
    collections,
    warnings,
  };
};
