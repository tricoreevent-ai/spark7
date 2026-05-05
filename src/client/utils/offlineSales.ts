import { IProduct } from '@shared/types';

export type OfflineSyncKind = 'posted' | 'draft';
export type OfflinePaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';
export type SalesRoundOffMode = 'none' | 'nearest_050' | 'nearest_1' | 'nearest_5_up' | 'nearest_5_down';

export interface OfflinePaymentSplit {
  id: string;
  method: OfflinePaymentMethod;
  amount: string;
  receivedAmount?: string;
  note?: string;
}

export interface OfflineCartItemSnapshot extends IProduct {
  quantity: number;
  cartId: string;
  selectedVariantSize?: string;
  selectedVariantColor?: string;
  saleSerialTrackingEnabled?: boolean;
  serialNumbers?: string[];
  serialNumbersText?: string;
  batchNo?: string;
  expiryDate?: string;
  offlineStockDiscrepancy?: boolean;
}

export interface OfflineCustomerSnapshot {
  _id: string;
  customerCode?: string;
  memberCode?: string;
  memberSubscriptionId?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  source?: 'customer' | 'member';
  memberStatus?: string;
}

export interface OfflineSaleSnapshot {
  cart: OfflineCartItemSnapshot[];
  paymentMethod: OfflinePaymentMethod;
  invoiceType: 'cash' | 'credit';
  invoiceStatus: 'posted' | 'draft';
  isGstBill: boolean;
  invoiceNumberMode: 'auto' | 'manual';
  manualInvoiceNumber: string;
  paidAmount: string;
  discountType: 'amount' | 'percentage';
  discountValue: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  selectedCustomerId: string;
  saleNotes: string;
  membershipRedeemPoints: string;
  selectedCreditNoteId: string;
  creditNoteAmount: string;
  isWalkInCustomer: boolean;
  membershipLookupCode: string;
  roundOffMode: SalesRoundOffMode;
  paymentSplits: OfflinePaymentSplit[];
  updatedAt: string;
}

export interface OfflineQueuedSale {
  id: string;
  kind: OfflineSyncKind;
  localInvoiceNumber: string;
  saleData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  nextRetryAt: number;
  lastError?: string;
  stockDiscrepancy: boolean;
}

export interface OfflineSavedSaleRecord {
  id: string;
  label: string;
  snapshot: OfflineSaleSnapshot;
  createdAt: string;
  updatedAt: string;
  pendingSync: boolean;
  kind: 'held' | 'draft';
  linkedQueueId?: string;
  localInvoiceNumber?: string;
}

export interface OfflineProductCatalog {
  products: IProduct[];
  updatedAt: string;
}

interface OfflineSalesState {
  activeSale: OfflineSaleSnapshot | null;
  queuedSales: OfflineQueuedSale[];
  heldSales: OfflineSavedSaleRecord[];
  draftSales: OfflineSavedSaleRecord[];
  productCatalog: OfflineProductCatalog;
  customerCache: {
    updatedAt: string;
    customers: OfflineCustomerSnapshot[];
  };
  invoiceCounters: Record<string, number>;
}

interface OfflineSalesBackup {
  savedAt: string;
  state: Pick<OfflineSalesState, 'activeSale' | 'queuedSales' | 'heldSales' | 'draftSales' | 'invoiceCounters'>;
}

const DB_NAME = 'sarva-offline-sales';
const DB_VERSION = 1;
const STORE_NAME = 'keyvalue';
const STATE_KEY = 'state';
const BACKUP_KEY = 'sarva-offline-sales-backup-v1';
const ROUND_OFF_KEY = 'sarva-sales-round-off-mode';
const DEFAULT_PRODUCT_CATALOG: OfflineProductCatalog = { products: [], updatedAt: '' };

const defaultState = (): OfflineSalesState => ({
  activeSale: null,
  queuedSales: [],
  heldSales: [],
  draftSales: [],
  productCatalog: { ...DEFAULT_PRODUCT_CATALOG },
  customerCache: {
    updatedAt: '',
    customers: [],
  },
  invoiceCounters: {},
});

const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
let openDbPromise: Promise<IDBDatabase> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let productCatalogSearchCache:
  | {
      updatedAt: string;
      count: number;
      rows: Array<{ product: IProduct; searchText: string }>;
    }
  | null = null;

const normalizePaymentMethod = (value: unknown): OfflinePaymentMethod => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'card') return 'card';
  if (normalized === 'upi') return 'upi';
  if (normalized === 'bank_transfer') return 'bank_transfer';
  if (normalized === 'cheque') return 'cheque';
  if (normalized === 'online') return 'online';
  return 'cash';
};

const normalizePaymentSplits = (value: unknown): OfflinePaymentSplit[] =>
  Array.isArray(value)
    ? value.map((row, index) => ({
      id: String((row as any)?.id || `split-${index + 1}`),
      method: normalizePaymentMethod((row as any)?.method),
      amount: String((row as any)?.amount || ''),
      receivedAmount: String((row as any)?.receivedAmount || ''),
      note: String((row as any)?.note || ''),
    }))
    : [];

const normalizeCartItems = (items: unknown): OfflineCartItemSnapshot[] =>
  Array.isArray(items)
    ? items
      .map((row) => {
        const product = row as OfflineCartItemSnapshot;
        const name = String(product?.name || '').trim();
        const sku = String(product?.sku || '').trim();
        const cartId = String(product?.cartId || '').trim();
        if (!name || !cartId) return null;
        return {
          ...product,
          name,
          sku,
          quantity: Math.max(1, Number(product.quantity || 1)),
          cartId,
          selectedVariantSize: String(product.selectedVariantSize || ''),
          selectedVariantColor: String(product.selectedVariantColor || ''),
          serialNumbers: Array.isArray(product.serialNumbers)
            ? product.serialNumbers.map((serial) => String(serial || '').trim()).filter(Boolean)
            : [],
          serialNumbersText: String(product.serialNumbersText || ''),
          batchNo: String(product.batchNo || ''),
          expiryDate: String(product.expiryDate || ''),
          saleSerialTrackingEnabled: Boolean(product.saleSerialTrackingEnabled),
          offlineStockDiscrepancy: Boolean(product.offlineStockDiscrepancy),
        } satisfies OfflineCartItemSnapshot;
      })
      .filter(Boolean) as OfflineCartItemSnapshot[]
    : [];

const normalizeCustomerCache = (value: unknown): OfflineCustomerSnapshot[] =>
  Array.isArray(value)
    ? value
      .map((row) => ({
        _id: String((row as any)?._id || '').trim(),
        customerCode: String((row as any)?.customerCode || '').trim(),
        memberCode: String((row as any)?.memberCode || '').trim(),
        memberSubscriptionId: String((row as any)?.memberSubscriptionId || '').trim(),
        name: String((row as any)?.name || '').trim(),
        phone: String((row as any)?.phone || '').trim(),
        email: String((row as any)?.email || '').trim(),
        address: String((row as any)?.address || '').trim(),
        source: (row as any)?.source === 'member' ? 'member' : 'customer',
        memberStatus: String((row as any)?.memberStatus || '').trim(),
      }))
      .filter((row) => row._id && row.name)
    : [];

const normalizeSnapshot = (value: any): OfflineSaleSnapshot => ({
  cart: normalizeCartItems(value?.cart),
  paymentMethod: normalizePaymentMethod(value?.paymentMethod),
  invoiceType: String(value?.invoiceType || '').toLowerCase() === 'credit' ? 'credit' : 'cash',
  invoiceStatus: String(value?.invoiceStatus || '').toLowerCase() === 'draft' ? 'draft' : 'posted',
  isGstBill: value?.isGstBill !== false,
  invoiceNumberMode: String(value?.invoiceNumberMode || '').toLowerCase() === 'manual' ? 'manual' : 'auto',
  manualInvoiceNumber: String(value?.manualInvoiceNumber || ''),
  paidAmount: String(value?.paidAmount || ''),
  discountType: String(value?.discountType || '').toLowerCase() === 'percentage' ? 'percentage' : 'amount',
  discountValue: String(value?.discountValue || ''),
  customerName: String(value?.customerName || ''),
  customerPhone: String(value?.customerPhone || ''),
  customerEmail: String(value?.customerEmail || ''),
  customerAddress: String(value?.customerAddress || ''),
  selectedCustomerId: String(value?.selectedCustomerId || ''),
  saleNotes: String(value?.saleNotes || ''),
  membershipRedeemPoints: String(value?.membershipRedeemPoints || ''),
  selectedCreditNoteId: String(value?.selectedCreditNoteId || ''),
  creditNoteAmount: String(value?.creditNoteAmount || ''),
  isWalkInCustomer: Boolean(value?.isWalkInCustomer),
  membershipLookupCode: String(value?.membershipLookupCode || ''),
  roundOffMode: normalizeRoundOffMode(value?.roundOffMode),
  paymentSplits: normalizePaymentSplits(value?.paymentSplits),
  updatedAt: String(value?.updatedAt || new Date().toISOString()),
});

const normalizeSavedSaleRecord = (value: any, kind: 'held' | 'draft'): OfflineSavedSaleRecord | null => {
  const id = String(value?.id || '').trim();
  if (!id) return null;
  return {
    id,
    label: String(value?.label || '').trim() || (kind === 'held' ? 'Held sale' : 'Draft sale'),
    snapshot: normalizeSnapshot(value?.snapshot || {}),
    createdAt: String(value?.createdAt || new Date().toISOString()),
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
    pendingSync: Boolean(value?.pendingSync),
    kind,
    linkedQueueId: String(value?.linkedQueueId || '').trim() || undefined,
    localInvoiceNumber: String(value?.localInvoiceNumber || '').trim() || undefined,
  };
};

const normalizeQueuedSale = (value: any): OfflineQueuedSale | null => {
  const id = String(value?.id || '').trim();
  const localInvoiceNumber = String(value?.localInvoiceNumber || '').trim();
  if (!id || !localInvoiceNumber || !value?.saleData || typeof value.saleData !== 'object') return null;
  return {
    id,
    kind: String(value?.kind || '').toLowerCase() === 'draft' ? 'draft' : 'posted',
    localInvoiceNumber,
    saleData: value.saleData,
    createdAt: String(value?.createdAt || new Date().toISOString()),
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
    retryCount: Math.max(0, Number(value?.retryCount || 0)),
    nextRetryAt: Number(value?.nextRetryAt || 0),
    lastError: String(value?.lastError || '').trim() || undefined,
    stockDiscrepancy: Boolean(value?.stockDiscrepancy),
  };
};

const normalizeProductCatalog = (value: any): OfflineProductCatalog => ({
  updatedAt: String(value?.updatedAt || ''),
  products: Array.isArray(value?.products) ? value.products : [],
});

const normalizeRoundOffMode = (value: unknown): SalesRoundOffMode => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'nearest_050') return 'nearest_050';
  if (normalized === 'nearest_1') return 'nearest_1';
  if (normalized === 'nearest_5_up') return 'nearest_5_up';
  if (normalized === 'nearest_5_down') return 'nearest_5_down';
  return 'none';
};

const normalizeState = (value: any): OfflineSalesState => ({
  activeSale: value?.activeSale ? normalizeSnapshot(value.activeSale) : null,
  queuedSales: Array.isArray(value?.queuedSales)
    ? value.queuedSales.map(normalizeQueuedSale).filter(Boolean) as OfflineQueuedSale[]
    : [],
  heldSales: Array.isArray(value?.heldSales)
    ? value.heldSales.map((row: any) => normalizeSavedSaleRecord(row, 'held')).filter(Boolean) as OfflineSavedSaleRecord[]
    : [],
  draftSales: Array.isArray(value?.draftSales)
    ? value.draftSales.map((row: any) => normalizeSavedSaleRecord(row, 'draft')).filter(Boolean) as OfflineSavedSaleRecord[]
    : [],
  productCatalog: normalizeProductCatalog(value?.productCatalog),
  customerCache: {
    updatedAt: String(value?.customerCache?.updatedAt || ''),
    customers: normalizeCustomerCache(value?.customerCache?.customers),
  },
  invoiceCounters: value?.invoiceCounters && typeof value.invoiceCounters === 'object'
    ? Object.fromEntries(
      Object.entries(value.invoiceCounters).map(([key, count]) => [key, Math.max(0, Number(count || 0))])
    )
    : {},
});

const openDatabase = (): Promise<IDBDatabase> => {
  if (!isBrowser) return Promise.reject(new Error('IndexedDB is not available'));
  if (openDbPromise) return openDbPromise;

  openDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error || new Error('Could not open offline sales database'));
    request.onsuccess = () => resolve(request.result);
  });

  return openDbPromise;
};

const readStoreValue = async <T>(key: string): Promise<T | undefined> => {
  const database = await openDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error || new Error(`Could not read "${key}" from offline sales database`));
  });
};

const writeStoreValue = async <T>(key: string, value: T): Promise<void> => {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(`Could not write "${key}" to offline sales database`));
  });
};

const readBackup = (): OfflineSalesBackup | null => {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(BACKUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const state = normalizeState(parsed?.state || {});
    return {
      savedAt: String(parsed?.savedAt || ''),
      state: {
        activeSale: state.activeSale,
        queuedSales: state.queuedSales,
        heldSales: state.heldSales,
        draftSales: state.draftSales,
        invoiceCounters: state.invoiceCounters,
      },
    };
  } catch {
    return null;
  }
};

const readState = async (): Promise<OfflineSalesState> => {
  if (!isBrowser) return defaultState();

  try {
    const stored = await readStoreValue<any>(STATE_KEY);
    if (!stored) return defaultState();
    return normalizeState(stored);
  } catch {
    const backup = readBackup();
    if (backup) {
      const restored = normalizeState(backup.state);
      await writeStoreValue(STATE_KEY, restored);
      return restored;
    }
    return defaultState();
  }
};

const writeState = async (state: OfflineSalesState): Promise<void> => {
  if (!isBrowser) return;
  await writeStoreValue(STATE_KEY, normalizeState(state));
};

const withState = async <T>(mutator: (state: OfflineSalesState) => Promise<T> | T): Promise<T> => {
  let result!: T;
  writeChain = writeChain.then(async () => {
    const state = await readState();
    result = await mutator(state);
    await writeState(state);
  }).catch(async () => {
    const state = await readState();
    result = await mutator(state);
    await writeState(state);
  });
  await writeChain;
  return result;
};

const upsertCustomerRows = (
  existing: OfflineCustomerSnapshot[],
  incoming: OfflineCustomerSnapshot[]
): OfflineCustomerSnapshot[] => {
  const byKey = new Map<string, OfflineCustomerSnapshot>();
  [...incoming, ...existing].forEach((row) => {
    const phoneKey = String(row.phone || '').trim();
    const idKey = String(row._id || '').trim();
    const key = phoneKey || idKey;
    if (!key) return;
    if (!byKey.has(key)) {
      byKey.set(key, row);
    }
  });
  return Array.from(byKey.values()).slice(0, 300);
};

const buildProductSearchText = (product: IProduct): string =>
  [
    String(product.name || ''),
    String(product.sku || ''),
    String(product.barcode || ''),
    String(product.description || ''),
    String(product.category || ''),
    String(product.subcategory || ''),
    ...(Array.isArray(product.variantMatrix)
      ? product.variantMatrix.flatMap((row) => [
          String(row?.size || ''),
          String(row?.color || ''),
          String(row?.barcode || ''),
          String(row?.skuSuffix || ''),
        ])
      : []),
  ]
    .join(' ')
    .toLowerCase();

const getCatalogSearchRows = (catalog: OfflineProductCatalog) => {
  const updatedAt = String(catalog.updatedAt || '');
  const count = Array.isArray(catalog.products) ? catalog.products.length : 0;

  if (
    productCatalogSearchCache
    && productCatalogSearchCache.updatedAt === updatedAt
    && productCatalogSearchCache.count === count
  ) {
    return productCatalogSearchCache.rows;
  }

  const rows = (Array.isArray(catalog.products) ? catalog.products : []).map((product) => ({
    product,
    searchText: buildProductSearchText(product),
  }));

  productCatalogSearchCache = {
    updatedAt,
    count,
    rows,
  };

  return rows;
};

const matchesCustomerQuery = (customer: OfflineCustomerSnapshot, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    String(customer.name || ''),
    String(customer.phone || ''),
    String(customer.customerCode || ''),
    String(customer.memberCode || ''),
    String(customer.email || ''),
  ]
    .map((value) => value.toLowerCase())
    .some((value) => value.includes(needle));
};

const buildSavedSaleLabel = (snapshot: OfflineSaleSnapshot, kind: 'held' | 'draft'): string => {
  const customer = String(snapshot.customerName || '').trim() || (snapshot.isWalkInCustomer ? 'Walk-in customer' : '');
  const itemCount = snapshot.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const lead = customer || `${itemCount} item${itemCount === 1 ? '' : 's'}`;
  return kind === 'held' ? `Held: ${lead}` : `Draft: ${lead}`;
};

export const generateOfflineInvoiceNumber = async (date = new Date()): Promise<string> =>
  withState((state) => {
    const dateKey = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('');
    const next = Math.max(0, Number(state.invoiceCounters[dateKey] || 0)) + 1;
    state.invoiceCounters[dateKey] = next;
    return `INV-${dateKey}-${String(next).padStart(3, '0')}`;
  });

export const getOfflineRoundOffMode = (): SalesRoundOffMode => {
  if (typeof localStorage === 'undefined') return 'none';
  return normalizeRoundOffMode(localStorage.getItem(ROUND_OFF_KEY));
};

export const saveOfflineRoundOffMode = (mode: SalesRoundOffMode): SalesRoundOffMode => {
  const normalized = normalizeRoundOffMode(mode);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ROUND_OFF_KEY, normalized);
  }
  return normalized;
};

export const loadOfflineSalesSnapshot = async (): Promise<OfflineSaleSnapshot | null> => {
  const state = await readState();
  return state.activeSale;
};

export const saveOfflineSalesSnapshot = async (snapshot: OfflineSaleSnapshot): Promise<void> => {
  await withState((state) => {
    state.activeSale = normalizeSnapshot({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    });
  });
};

export const clearOfflineSalesSnapshot = async (): Promise<void> => {
  await withState((state) => {
    state.activeSale = null;
  });
};

export const listQueuedOfflineSales = async (): Promise<OfflineQueuedSale[]> => {
  const state = await readState();
  return [...state.queuedSales].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const queueOfflineSale = async (args: {
  kind: OfflineSyncKind;
  localInvoiceNumber: string;
  saleData: Record<string, any>;
  snapshot: OfflineSaleSnapshot;
  stockDiscrepancy: boolean;
}): Promise<OfflineQueuedSale> =>
  withState((state) => {
    const createdAt = new Date().toISOString();
    const queueRow: OfflineQueuedSale = {
      id: `${args.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: args.kind,
      localInvoiceNumber: args.localInvoiceNumber,
      saleData: args.saleData,
      createdAt,
      updatedAt: createdAt,
      retryCount: 0,
      nextRetryAt: 0,
      stockDiscrepancy: Boolean(args.stockDiscrepancy),
    };
    state.queuedSales.push(queueRow);

    if (args.kind === 'draft') {
      const record: OfflineSavedSaleRecord = {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: buildSavedSaleLabel(args.snapshot, 'draft'),
        snapshot: normalizeSnapshot(args.snapshot),
        createdAt,
        updatedAt: createdAt,
        pendingSync: true,
        kind: 'draft',
        linkedQueueId: queueRow.id,
        localInvoiceNumber: args.localInvoiceNumber,
      };
      state.draftSales = [record, ...state.draftSales];
    }

    return queueRow;
  });

export const updateQueuedOfflineSale = async (
  queueId: string,
  updater: (current: OfflineQueuedSale) => OfflineQueuedSale
): Promise<OfflineQueuedSale | null> =>
  withState((state) => {
    const index = state.queuedSales.findIndex((row) => row.id === queueId);
    if (index < 0) return null;
    const next = normalizeQueuedSale({
      ...updater(state.queuedSales[index]),
      updatedAt: new Date().toISOString(),
    });
    if (!next) return null;
    state.queuedSales[index] = next;
    return next;
  });

export const removeQueuedOfflineSale = async (queueId: string): Promise<void> => {
  await withState((state) => {
    state.queuedSales = state.queuedSales.filter((row) => row.id !== queueId);
    state.draftSales = state.draftSales.filter((row) => row.linkedQueueId !== queueId);
  });
};

export const listHeldSales = async (): Promise<OfflineSavedSaleRecord[]> => {
  const state = await readState();
  return [...state.heldSales].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const listDraftSales = async (): Promise<OfflineSavedSaleRecord[]> => {
  const state = await readState();
  return [...state.draftSales].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const saveHeldSale = async (snapshot: OfflineSaleSnapshot): Promise<OfflineSavedSaleRecord> =>
  withState((state) => {
    const createdAt = new Date().toISOString();
    const record: OfflineSavedSaleRecord = {
      id: `held-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: buildSavedSaleLabel(snapshot, 'held'),
      snapshot: normalizeSnapshot(snapshot),
      createdAt,
      updatedAt: createdAt,
      pendingSync: false,
      kind: 'held',
    };
    state.heldSales = [record, ...state.heldSales];
    return record;
  });

export const deleteHeldSale = async (id: string): Promise<void> => {
  await withState((state) => {
    state.heldSales = state.heldSales.filter((row) => row.id !== id);
  });
};

export const deleteDraftSale = async (id: string): Promise<void> => {
  await withState((state) => {
    state.draftSales = state.draftSales.filter((row) => row.id !== id);
  });
};

export const replaceCachedProductCatalog = async (products: IProduct[]): Promise<void> => {
  await withState((state) => {
    state.productCatalog = {
      products: Array.isArray(products) ? products : [],
      updatedAt: new Date().toISOString(),
    };
  });
  productCatalogSearchCache = null;
};

export const getCachedProductCatalog = async (): Promise<OfflineProductCatalog> => {
  const state = await readState();
  return state.productCatalog;
};

export const searchCachedProducts = async (query: string, limit = 120): Promise<IProduct[]> => {
  const state = await readState();
  const maxResults = Math.max(1, limit);
  const needle = String(query || '').trim().toLowerCase();
  const products = Array.isArray(state.productCatalog.products) ? state.productCatalog.products : [];

  if (!needle) {
    return products.slice(0, maxResults);
  }

  const indexedRows = getCatalogSearchRows(state.productCatalog);
  const results: IProduct[] = [];

  for (const row of indexedRows) {
    if (!row.searchText.includes(needle)) continue;
    results.push(row.product);
    if (results.length >= maxResults) break;
  }

  return results;
};

export const mergeCachedCustomers = async (customers: OfflineCustomerSnapshot[]): Promise<void> => {
  await withState((state) => {
    state.customerCache = {
      updatedAt: new Date().toISOString(),
      customers: upsertCustomerRows(state.customerCache.customers, normalizeCustomerCache(customers)),
    };
  });
};

export const searchCachedCustomers = async (query: string, limit = 25): Promise<OfflineCustomerSnapshot[]> => {
  const state = await readState();
  return state.customerCache.customers
    .filter((customer) => matchesCustomerQuery(customer, query))
    .slice(0, Math.max(1, limit));
};

export const createOfflineSalesBackup = async (): Promise<OfflineSalesBackup> => {
  const state = await readState();
  const backup: OfflineSalesBackup = {
    savedAt: new Date().toISOString(),
    state: {
      activeSale: state.activeSale,
      queuedSales: state.queuedSales,
      heldSales: state.heldSales,
      draftSales: state.draftSales,
      invoiceCounters: state.invoiceCounters,
    },
  };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  }
  return backup;
};

export const getOfflineSalesBackup = (): OfflineSalesBackup | null => readBackup();

export const restoreOfflineSalesBackup = async (): Promise<OfflineSalesBackup | null> => {
  const backup = readBackup();
  if (!backup) return null;
  const current = await readState();
  await writeState(normalizeState({
    ...current,
    ...backup.state,
  }));
  return backup;
};

export const computeRetryDelayMs = (retryCount: number): number => {
  if (retryCount <= 0) return 30_000;
  if (retryCount === 1) return 60_000;
  return 300_000;
};
