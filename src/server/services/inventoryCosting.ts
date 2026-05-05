import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Inventory } from '../models/Inventory.js';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { InventoryValuationSetting, type InventoryValuationMethod } from '../models/InventoryValuationSetting.js';
import { StockLedgerEntry } from '../models/StockLedgerEntry.js';
import { StockLocation } from '../models/StockLocation.js';
import { createJournalEntry } from './accountingEngine.js';

const round2 = (value: number): number => Number(value.toFixed(2));
const toNumber = (value: unknown): number => Number(value || 0);

const productRequiresStock = (product: any): boolean => {
  const type = String(product?.itemType || 'inventory');
  return type !== 'service' && type !== 'non_inventory';
};

const periodKeyFor = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const normalizeLocationCode = (value?: string): string =>
  String(value || 'MAIN').trim().toUpperCase().replace(/\s+/g, '-') || 'MAIN';

const normalizeBatchNumber = (value?: string): string =>
  String(value || '').trim().toUpperCase() || `BATCH-${Date.now()}`;

export const getDefaultStockLocation = async (createdBy?: string) => {
  const existing = await StockLocation.findOne({ isDefault: true, isActive: true }).sort({ createdAt: 1 });
  if (existing) return existing;

  const byCode = await StockLocation.findOne({ locationCode: 'MAIN' });
  if (byCode) {
    if (!byCode.isDefault) {
      byCode.isDefault = true;
      byCode.isActive = true;
      await byCode.save();
    }
    return byCode;
  }

  return StockLocation.create({
    locationCode: 'MAIN',
    name: 'Main Store',
    locationType: 'store',
    isDefault: true,
    isActive: true,
    createdBy,
  });
};

export const resolveStockLocation = async (input: {
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  warehouseLocation?: string;
  createdBy?: string;
} = {}) => {
  if (input.locationId && mongoose.Types.ObjectId.isValid(input.locationId)) {
    const byId = await StockLocation.findById(input.locationId);
    if (byId) return byId;
  }

  const code = normalizeLocationCode(input.locationCode || input.warehouseLocation);
  if (code && code !== 'MAIN') {
    const byCode = await StockLocation.findOne({ locationCode: code });
    if (byCode) return byCode;
    return StockLocation.create({
      locationCode: code,
      name: String(input.locationName || input.warehouseLocation || code).trim() || code,
      locationType: 'warehouse',
      isDefault: false,
      isActive: true,
      createdBy: input.createdBy,
    });
  }

  return getDefaultStockLocation(input.createdBy);
};

export const getValuationMethod = async (date = new Date()): Promise<InventoryValuationMethod> => {
  const setting = await InventoryValuationSetting.findOne({ periodKey: periodKeyFor(date) });
  return setting?.method || 'weighted_average';
};

export const setValuationMethodForPeriod = async (input: {
  periodKey?: string;
  method: InventoryValuationMethod;
  effectiveFrom?: Date;
  createdBy?: string;
}) => {
  const effectiveFrom = input.effectiveFrom || new Date();
  const periodKey = input.periodKey || periodKeyFor(effectiveFrom);
  const periodStart = new Date(Number(periodKey.slice(0, 4)), Number(periodKey.slice(5, 7)) - 1, 1);

  const existing = await InventoryValuationSetting.findOne({ periodKey });
  if (existing && existing.method !== input.method) {
    const movementExists = await StockLedgerEntry.exists({ createdAt: { $gte: periodStart } });
    if (movementExists) {
      throw new Error('Valuation method can be changed only before stock movements exist for the period');
    }
  }

  return InventoryValuationSetting.findOneAndUpdate(
    { periodKey },
    {
      periodKey,
      method: input.method,
      effectiveFrom: periodStart,
      createdBy: input.createdBy,
    },
    { returnDocument: 'after', upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
};

const writeStockLedger = async (payload: Record<string, any>) => {
  return StockLedgerEntry.create({
    quantityIn: 0,
    quantityOut: 0,
    reservedDelta: 0,
    dispatchedDelta: 0,
    unitCost: 0,
    valueIn: 0,
    valueOut: 0,
    ...payload,
  });
};

export const ensureLegacyBatchForProduct = async (product: any, createdBy?: string) => {
  if (!productRequiresStock(product)) return null;
  const existingCount = await InventoryBatch.countDocuments({ productId: product._id });
  const batchTotal = existingCount
    ? await InventoryBatch.aggregate([
      { $match: { productId: product._id } },
      { $group: { _id: null, quantity: { $sum: '$quantity' } } },
    ])
    : [];
  const trackedQty = toNumber(batchTotal?.[0]?.quantity);
  const productStock = toNumber(product.stock);
  const gap = round2(productStock - trackedQty);
  if (gap <= 0) return null;

  const location = await getDefaultStockLocation(createdBy);
  const batch = await InventoryBatch.create({
    productId: product._id,
    locationId: location._id,
    locationCode: location.locationCode,
    locationName: location.name,
    batchNumber: 'LEGACY-OPENING',
    receivedDate: product.createdAt || new Date(),
    originalQuantity: gap,
    quantity: gap,
    reservedQuantity: 0,
    dispatchedQuantity: 0,
    unitCost: toNumber(product.cost),
    sourceType: 'legacy',
    referenceNo: product.sku,
    status: 'active',
    createdBy,
  });

  await writeStockLedger({
    productId: product._id,
    locationId: location._id,
    batchId: batch._id,
    transactionType: 'legacy_opening',
    referenceType: 'product',
    referenceId: product._id.toString(),
    referenceNo: product.sku,
    quantityIn: gap,
    unitCost: toNumber(product.cost),
    valueIn: round2(gap * toNumber(product.cost)),
    oldQuantity: 0,
    newQuantity: gap,
    createdBy,
  });

  return batch;
};

export const recordPurchaseReceiptBatch = async (input: {
  productId: string;
  quantity: number;
  unitCost: number;
  previousProductStock?: number;
  batchNumber?: string;
  expiryDate?: Date;
  manufacturingDate?: Date;
  locationId?: string;
  warehouseLocation?: string;
  sourceId?: string;
  referenceNo?: string;
  sourceType?: 'opening' | 'purchase' | 'adjustment' | 'transfer' | 'legacy';
  transactionType?: 'purchase_receive' | 'adjustment_gain' | 'transfer_in';
  referenceType?: string;
  createdBy?: string;
}) => {
  const product: any = await Product.findById(input.productId);
  if (!product || !productRequiresStock(product)) return null;
  const quantity = round2(Math.max(0, toNumber(input.quantity)));
  if (quantity <= 0) return null;

  const location = await resolveStockLocation({
    locationId: input.locationId,
    warehouseLocation: input.warehouseLocation,
    createdBy: input.createdBy,
  });
  const batchNumber = normalizeBatchNumber(input.batchNumber || input.referenceNo);
  const beforeStock = toNumber(input.previousProductStock ?? (toNumber(product.stock) - quantity));
  const oldCost = toNumber(product.cost);
  const unitCost = round2(Math.max(0, toNumber(input.unitCost || oldCost)));

  const batch: any = await InventoryBatch.findOne({
    productId: product._id,
    locationId: location._id,
    batchNumber,
  });
  const oldQuantity = toNumber(batch?.quantity);
  const oldReserved = toNumber(batch?.reservedQuantity);
  const oldDispatched = toNumber(batch?.dispatchedQuantity);

  let savedBatch: any;
  if (batch) {
    batch.quantity = round2(oldQuantity + quantity);
    batch.originalQuantity = round2(toNumber(batch.originalQuantity) + quantity);
    batch.unitCost = unitCost;
    batch.expiryDate = input.expiryDate || batch.expiryDate;
    batch.manufacturingDate = input.manufacturingDate || batch.manufacturingDate;
    batch.status = 'active';
    savedBatch = await batch.save();
  } else {
    savedBatch = await InventoryBatch.create({
      productId: product._id,
      locationId: location._id,
      locationCode: location.locationCode,
      locationName: location.name,
      batchNumber,
      manufacturingDate: input.manufacturingDate,
      expiryDate: input.expiryDate,
      receivedDate: new Date(),
      originalQuantity: quantity,
      quantity,
      reservedQuantity: 0,
      dispatchedQuantity: 0,
      unitCost,
      sourceType: input.sourceType || 'purchase',
      sourceId: input.sourceId,
      referenceNo: input.referenceNo,
      status: 'active',
      createdBy: input.createdBy,
    });
  }

  const valuationMethod = await getValuationMethod();
  if (valuationMethod === 'weighted_average') {
    const nextStock = Math.max(0, beforeStock + quantity);
    product.cost = nextStock > 0 ? round2(((beforeStock * oldCost) + (quantity * unitCost)) / nextStock) : unitCost;
    await product.save();
  }

  await writeStockLedger({
    productId: product._id,
    locationId: location._id,
    batchId: savedBatch._id,
    transactionType: input.transactionType || 'purchase_receive',
    referenceType: input.referenceType || 'purchase_order',
    referenceId: input.sourceId,
    referenceNo: input.referenceNo,
    quantityIn: quantity,
    unitCost,
    valueIn: round2(quantity * unitCost),
    oldQuantity,
    newQuantity: toNumber(savedBatch.quantity),
    oldReservedQuantity: oldReserved,
    newReservedQuantity: toNumber(savedBatch.reservedQuantity),
    oldDispatchedQuantity: oldDispatched,
    newDispatchedQuantity: toNumber(savedBatch.dispatchedQuantity),
    createdBy: input.createdBy,
  });

  return savedBatch;
};

const activeBatchQuery = (productId: string, locationId?: string) => {
  const now = new Date();
  const query: Record<string, any> = {
    productId,
    quantity: { $gt: 0 },
    status: { $nin: ['depleted', 'expired'] },
    $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gte: now } }],
  };
  if (locationId) query.locationId = locationId;
  return query;
};

const loadFefoBatches = async (product: any, locationId?: string) => {
  await ensureLegacyBatchForProduct(product);
  const batches = await InventoryBatch.find(activeBatchQuery(product._id.toString(), locationId))
    .sort({ expiryDate: 1, receivedDate: 1, createdAt: 1 });
  return batches.sort((left: any, right: any) => {
    const leftExpiry = left.expiryDate ? new Date(left.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    const rightExpiry = right.expiryDate ? new Date(right.expiryDate).getTime() : Number.MAX_SAFE_INTEGER;
    return leftExpiry - rightExpiry
      || new Date(left.receivedDate || left.createdAt || 0).getTime() - new Date(right.receivedDate || right.createdAt || 0).getTime();
  });
};

export const reserveStockFefo = async (input: {
  productId: string;
  quantity: number;
  locationId?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
}) => {
  const product: any = await Product.findById(input.productId);
  if (!product || !productRequiresStock(product)) return { allocations: [], reservedQuantity: 0, backOrderQuantity: 0 };
  const requested = round2(Math.max(0, toNumber(input.quantity)));
  if (requested <= 0) return { allocations: [], reservedQuantity: 0, backOrderQuantity: 0 };

  const batches = await loadFefoBatches(product, input.locationId);
  let remaining = requested;
  const allocations: any[] = [];

  for (const batch of batches as any[]) {
    const available = round2(toNumber(batch.quantity) - toNumber(batch.reservedQuantity) - toNumber(batch.dispatchedQuantity));
    if (available <= 0) continue;
    const useQty = Math.min(remaining, available);
    const oldReserved = toNumber(batch.reservedQuantity);
    batch.reservedQuantity = round2(oldReserved + useQty);
    await batch.save();

    await Inventory.findOneAndUpdate(
      { productId: product._id },
      { $inc: { reservedQuantity: useQty }, productId: product._id },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );

    await writeStockLedger({
      productId: product._id,
      locationId: batch.locationId,
      batchId: batch._id,
      transactionType: 'sale_reserve',
      referenceType: input.referenceType || 'order',
      referenceId: input.referenceId,
      referenceNo: input.referenceNo,
      reservedDelta: useQty,
      unitCost: toNumber(batch.unitCost),
      oldQuantity: toNumber(batch.quantity),
      newQuantity: toNumber(batch.quantity),
      oldReservedQuantity: oldReserved,
      newReservedQuantity: toNumber(batch.reservedQuantity),
      createdBy: input.createdBy,
    });

    allocations.push({
      batchId: batch._id.toString(),
      batchNumber: batch.batchNumber,
      locationId: batch.locationId?.toString?.() || String(batch.locationId),
      locationCode: batch.locationCode,
      expiryDate: batch.expiryDate,
      quantity: useQty,
      unitCost: toNumber(batch.unitCost),
    });
    remaining = round2(remaining - useQty);
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    await writeStockLedger({
      productId: product._id,
      transactionType: 'back_order',
      referenceType: input.referenceType || 'order',
      referenceId: input.referenceId,
      referenceNo: input.referenceNo,
      metadata: { backOrderQuantity: remaining },
      createdBy: input.createdBy,
    });
  }

  return {
    allocations,
    reservedQuantity: round2(requested - remaining),
    backOrderQuantity: round2(remaining),
  };
};

export const dispatchReservedStock = async (input: {
  productId: string;
  allocations: Array<{ batchId?: string; quantity: number }>;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
}) => {
  const moved: any[] = [];
  for (const allocation of input.allocations || []) {
    if (!allocation.batchId) continue;
    const qty = round2(Math.max(0, toNumber(allocation.quantity)));
    if (qty <= 0) continue;
    const batch: any = await InventoryBatch.findById(allocation.batchId);
    if (!batch) continue;
    const oldReserved = toNumber(batch.reservedQuantity);
    const oldDispatched = toNumber(batch.dispatchedQuantity);
    const moveQty = Math.min(qty, oldReserved);
    if (moveQty <= 0) continue;
    batch.reservedQuantity = round2(oldReserved - moveQty);
    batch.dispatchedQuantity = round2(oldDispatched + moveQty);
    await batch.save();

    await Inventory.findOneAndUpdate(
      { productId: batch.productId },
      { $inc: { reservedQuantity: -moveQty }, productId: batch.productId },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );

    await writeStockLedger({
      productId: batch.productId,
      locationId: batch.locationId,
      batchId: batch._id,
      transactionType: 'sale_dispatch',
      referenceType: input.referenceType || 'delivery_challan',
      referenceId: input.referenceId,
      referenceNo: input.referenceNo,
      reservedDelta: -moveQty,
      dispatchedDelta: moveQty,
      unitCost: toNumber(batch.unitCost),
      oldQuantity: toNumber(batch.quantity),
      newQuantity: toNumber(batch.quantity),
      oldReservedQuantity: oldReserved,
      newReservedQuantity: toNumber(batch.reservedQuantity),
      oldDispatchedQuantity: oldDispatched,
      newDispatchedQuantity: toNumber(batch.dispatchedQuantity),
      createdBy: input.createdBy,
    });
    moved.push({ ...allocation, quantity: moveQty, batchNumber: batch.batchNumber, locationId: batch.locationId });
  }
  return moved;
};

export const consumeStockFefo = async (input: {
  productId: string;
  quantity: number;
  locationId?: string;
  allocations?: Array<{ batchId?: string; quantity: number }>;
  allowNegative?: boolean;
  productStockAlreadyAdjusted?: boolean;
  transactionType?: 'sale_invoice' | 'adjustment_loss' | 'transfer_out';
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
}) => {
  const product: any = await Product.findById(input.productId);
  if (!product || !productRequiresStock(product)) return { allocations: [], cogsValue: 0 };
  const requested = round2(Math.max(0, toNumber(input.quantity)));
  if (requested <= 0) return { allocations: [], cogsValue: 0 };

  const allocationBatchIds = (input.allocations || [])
    .map((item) => item.batchId)
    .filter((batchId): batchId is string => Boolean(batchId));

  const batches = input.allocations?.length
    ? (await InventoryBatch.find({ _id: { $in: allocationBatchIds } } as any))
    : await loadFefoBatches(product, input.locationId);

  const allocationQuantityByBatch = new Map<string, number>();
  for (const allocation of input.allocations || []) {
    if (allocation.batchId) allocationQuantityByBatch.set(String(allocation.batchId), toNumber(allocation.quantity));
  }

  let remaining = requested;
  let cogsValue = 0;
  const consumed: any[] = [];
  const valuationMethod = await getValuationMethod();

  for (const batch of batches as any[]) {
    const batchId = batch._id.toString();
    const available = input.allocations?.length
      ? Math.min(toNumber(allocationQuantityByBatch.get(batchId)), toNumber(batch.quantity))
      : round2(toNumber(batch.quantity) - toNumber(batch.reservedQuantity) - toNumber(batch.dispatchedQuantity));
    if (available <= 0) continue;
    const useQty = Math.min(remaining, available);
    const oldQuantity = toNumber(batch.quantity);
    const oldDispatched = toNumber(batch.dispatchedQuantity);
    batch.quantity = round2(oldQuantity - useQty);
    if (oldDispatched > 0) {
      batch.dispatchedQuantity = round2(Math.max(0, oldDispatched - useQty));
    }
    batch.status = batch.quantity <= 0 ? 'depleted' : 'active';
    await batch.save();

    const issueUnitCost = valuationMethod === 'weighted_average'
      ? toNumber(product.cost)
      : toNumber(batch.unitCost);
    const valueOut = round2(useQty * issueUnitCost);
    cogsValue = round2(cogsValue + valueOut);

    await writeStockLedger({
      productId: product._id,
      locationId: batch.locationId,
      batchId: batch._id,
      transactionType: input.transactionType || 'sale_invoice',
      referenceType: input.referenceType || 'sale',
      referenceId: input.referenceId,
      referenceNo: input.referenceNo,
      quantityOut: useQty,
      dispatchedDelta: oldDispatched > 0 ? -Math.min(useQty, oldDispatched) : 0,
      unitCost: issueUnitCost,
      valueOut,
      oldQuantity,
      newQuantity: toNumber(batch.quantity),
      oldDispatchedQuantity: oldDispatched,
      newDispatchedQuantity: toNumber(batch.dispatchedQuantity),
      createdBy: input.createdBy,
    });

    consumed.push({
      batchId,
      batchNumber: batch.batchNumber,
      locationId: batch.locationId?.toString?.() || String(batch.locationId),
      locationCode: batch.locationCode,
      expiryDate: batch.expiryDate,
      quantity: useQty,
      unitCost: issueUnitCost,
      valueOut,
    });
    remaining = round2(remaining - useQty);
    if (remaining <= 0) break;
  }

  if (remaining > 0 && !input.allowNegative) {
    throw new Error(`Insufficient non-expired batch stock for ${product.name} (short by ${remaining})`);
  }

  if (!input.productStockAlreadyAdjusted) {
    product.stock = round2(Math.max(0, toNumber(product.stock) - (requested - remaining)));
    await product.save();
  }
  await Inventory.findOneAndUpdate(
    { productId: product._id },
    { productId: product._id, quantity: product.stock, lastRestockDate: new Date() },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return { allocations: consumed, cogsValue: round2(cogsValue), shortQuantity: round2(remaining) };
};

export const postCogsJournal = async (input: {
  cogsValue: number;
  referenceType: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}, options: { skipChartEnsure?: boolean } = {}) => {
  const amount = round2(toNumber(input.cogsValue));
  if (amount <= 0) return null;
  return createJournalEntry({
    entryDate: new Date(),
    referenceType: 'inventory_adjustment',
    referenceId: input.referenceId,
    referenceNo: input.referenceNo,
    description: `COGS posting - ${input.referenceNo || input.referenceType}`,
    paymentMode: 'adjustment',
    createdBy: input.createdBy,
    metadata: { source: 'inventory_costing', ...input.metadata },
    lines: [
      { accountKey: 'cost_of_goods_sold', debit: amount, credit: 0, description: 'Cost of goods sold' },
      { accountKey: 'stock_in_hand', debit: 0, credit: amount, description: 'Inventory issue at cost' },
    ],
  }, options.skipChartEnsure ? { skipChartEnsure: true } : {});
};

export const adjustBatchForStockChange = async (input: {
  productId: string;
  deltaQuantity: number;
  unitCost?: number;
  batchNumber?: string;
  expiryDate?: Date;
  warehouseLocation?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
}) => {
  const product: any = await Product.findById(input.productId);
  if (!product || !productRequiresStock(product)) return null;
  const delta = round2(toNumber(input.deltaQuantity));
  if (delta === 0) return null;
  if (delta > 0) {
    const beforeStock = toNumber(product.stock);
    product.stock = round2(beforeStock + delta);
    await product.save();
    await Inventory.findOneAndUpdate(
      { productId: product._id },
      { productId: product._id, quantity: product.stock, lastRestockDate: new Date() },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );

    return recordPurchaseReceiptBatch({
      productId: input.productId,
      quantity: delta,
      unitCost: input.unitCost || product.cost || 0,
      previousProductStock: beforeStock,
      batchNumber: input.batchNumber || input.referenceNo || `ADJ-${Date.now()}`,
      expiryDate: input.expiryDate,
      warehouseLocation: input.warehouseLocation,
      sourceId: input.referenceId,
      referenceNo: input.referenceNo,
      sourceType: 'adjustment',
      transactionType: 'adjustment_gain',
      referenceType: input.referenceType || 'inventory_adjustment',
      createdBy: input.createdBy,
    });
  }

  return consumeStockFefo({
    productId: input.productId,
    quantity: Math.abs(delta),
    transactionType: 'adjustment_loss',
    referenceType: input.referenceType || 'inventory_adjustment',
    referenceId: input.referenceId,
    referenceNo: input.referenceNo,
    createdBy: input.createdBy,
  });
};

export const buildBatchStockRows = async (input: { productId?: string; locationId?: string; includeExpired?: boolean } = {}) => {
  const filter: Record<string, any> = {};
  if (input.productId) filter.productId = input.productId;
  if (input.locationId) filter.locationId = input.locationId;
  if (!input.includeExpired) {
    filter.status = { $ne: 'depleted' };
  }
  const rows = await InventoryBatch.find(filter)
    .populate('productId', 'name sku category unit cost price')
    .sort({ locationCode: 1, expiryDate: 1, receivedDate: 1 });

  const now = Date.now();
  return rows.map((row: any) => {
    const expired = row.expiryDate ? new Date(row.expiryDate).getTime() < now : false;
    return {
      _id: row._id,
      productId: row.productId?._id || row.productId,
      productName: row.productId?.name || '',
      sku: row.productId?.sku || '',
      category: row.productId?.category || '',
      locationId: row.locationId,
      locationCode: row.locationCode,
      locationName: row.locationName,
      batchNumber: row.batchNumber,
      manufacturingDate: row.manufacturingDate,
      expiryDate: row.expiryDate,
      expired,
      quantity: toNumber(row.quantity),
      reservedQuantity: toNumber(row.reservedQuantity),
      dispatchedQuantity: toNumber(row.dispatchedQuantity),
      availableQuantity: round2(toNumber(row.quantity) - toNumber(row.reservedQuantity) - toNumber(row.dispatchedQuantity)),
      unitCost: toNumber(row.unitCost),
      stockValue: round2(toNumber(row.quantity) * toNumber(row.unitCost)),
      status: expired ? 'expired' : row.status,
    };
  });
};

export const transferStockBetweenLocations = async (input: {
  productId: string;
  quantity: number;
  fromLocationId?: string;
  fromWarehouseLocation?: string;
  toLocationId?: string;
  toWarehouseLocation?: string;
  reason?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
}) => {
  const product: any = await Product.findById(input.productId);
  if (!product || !productRequiresStock(product)) return { allocations: [], quantity: 0, value: 0 };

  const requested = round2(Math.max(0, toNumber(input.quantity)));
  if (requested <= 0) throw new Error('Transfer quantity must be greater than 0');

  const fromLocation = await resolveStockLocation({
    locationId: input.fromLocationId,
    warehouseLocation: input.fromWarehouseLocation,
    createdBy: input.createdBy,
  });
  const toLocation = await resolveStockLocation({
    locationId: input.toLocationId,
    warehouseLocation: input.toWarehouseLocation,
    createdBy: input.createdBy,
  });

  if (String(fromLocation._id) === String(toLocation._id)) {
    throw new Error('Source and destination locations must be different');
  }

  const batches = await loadFefoBatches(product, fromLocation._id.toString());
  const availableTotal = round2((batches as any[]).reduce((sum, batch: any) => (
    sum + Math.max(0, toNumber(batch.quantity) - toNumber(batch.reservedQuantity) - toNumber(batch.dispatchedQuantity))
  ), 0));
  if (availableTotal < requested) {
    throw new Error(`Insufficient available stock in ${fromLocation.name} (short by ${round2(requested - availableTotal)})`);
  }

  let remaining = requested;
  let totalValue = 0;
  const allocations: any[] = [];

  for (const sourceBatch of batches as any[]) {
    const available = round2(
      toNumber(sourceBatch.quantity)
      - toNumber(sourceBatch.reservedQuantity)
      - toNumber(sourceBatch.dispatchedQuantity)
    );
    if (available <= 0) continue;

    const moveQty = Math.min(remaining, available);
    const sourceOldQty = toNumber(sourceBatch.quantity);
    sourceBatch.quantity = round2(sourceOldQty - moveQty);
    sourceBatch.status = sourceBatch.quantity <= 0 ? 'depleted' : 'active';
    await sourceBatch.save();

    const value = round2(moveQty * toNumber(sourceBatch.unitCost));
    totalValue = round2(totalValue + value);

    await writeStockLedger({
      productId: product._id,
      locationId: fromLocation._id,
      batchId: sourceBatch._id,
      transactionType: 'transfer_out',
      referenceType: 'inventory_transfer',
      referenceId: input.referenceId,
      referenceNo: input.referenceNo,
      quantityOut: moveQty,
      unitCost: toNumber(sourceBatch.unitCost),
      valueOut: value,
      oldQuantity: sourceOldQty,
      newQuantity: toNumber(sourceBatch.quantity),
      metadata: { reason: input.reason || '', toLocationCode: toLocation.locationCode },
      createdBy: input.createdBy,
    });

    let destinationBatch: any = await InventoryBatch.findOne({
      productId: product._id,
      locationId: toLocation._id,
      batchNumber: sourceBatch.batchNumber,
    });
    const destinationOldQty = toNumber(destinationBatch?.quantity);
    if (destinationBatch) {
      destinationBatch.quantity = round2(destinationOldQty + moveQty);
      destinationBatch.originalQuantity = round2(toNumber(destinationBatch.originalQuantity) + moveQty);
      destinationBatch.status = 'active';
      await destinationBatch.save();
    } else {
      destinationBatch = await InventoryBatch.create({
        productId: product._id,
        locationId: toLocation._id,
        locationCode: toLocation.locationCode,
        locationName: toLocation.name,
        batchNumber: sourceBatch.batchNumber,
        manufacturingDate: sourceBatch.manufacturingDate,
        expiryDate: sourceBatch.expiryDate,
        receivedDate: new Date(),
        originalQuantity: moveQty,
        quantity: moveQty,
        reservedQuantity: 0,
        dispatchedQuantity: 0,
        unitCost: toNumber(sourceBatch.unitCost),
        sourceType: 'transfer',
        sourceId: input.referenceId,
        referenceNo: input.referenceNo,
        status: 'active',
        createdBy: input.createdBy,
      });
    }

    await writeStockLedger({
      productId: product._id,
      locationId: toLocation._id,
      batchId: destinationBatch._id,
      transactionType: 'transfer_in',
      referenceType: 'inventory_transfer',
      referenceId: input.referenceId,
      referenceNo: input.referenceNo,
      quantityIn: moveQty,
      unitCost: toNumber(sourceBatch.unitCost),
      valueIn: value,
      oldQuantity: destinationOldQty,
      newQuantity: toNumber(destinationBatch.quantity),
      metadata: { reason: input.reason || '', fromLocationCode: fromLocation.locationCode },
      createdBy: input.createdBy,
    });

    allocations.push({
      batchId: sourceBatch._id.toString(),
      destinationBatchId: destinationBatch._id.toString(),
      batchNumber: sourceBatch.batchNumber,
      fromLocationId: fromLocation._id.toString(),
      fromLocationCode: fromLocation.locationCode,
      toLocationId: toLocation._id.toString(),
      toLocationCode: toLocation.locationCode,
      quantity: moveQty,
      unitCost: toNumber(sourceBatch.unitCost),
      value,
    });

    remaining = round2(remaining - moveQty);
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    throw new Error(`Insufficient available stock in ${fromLocation.name} (short by ${remaining})`);
  }

  return { allocations, quantity: requested, value: totalValue };
};

export const buildInventoryValuationRows = async (input: { locationId?: string; date?: Date } = {}) => {
  const method = await getValuationMethod(input.date || new Date());
  if (method === 'fifo') {
    const rows = await buildBatchStockRows({ locationId: input.locationId, includeExpired: true });
    const summary = rows.reduce(
      (acc, row) => {
        acc.quantity += toNumber(row.quantity);
        acc.value += toNumber(row.stockValue);
        return acc;
      },
      { quantity: 0, value: 0 }
    );
    return {
      method,
      rows,
      summary: { quantity: round2(summary.quantity), value: round2(summary.value) },
    };
  }

  const products = await Product.find({ isActive: { $ne: false } }).select('name sku category subcategory stock unit cost price itemType');
  const rows = products
    .filter((product: any) => productRequiresStock(product))
    .map((product: any) => ({
      productId: product._id,
      productName: product.name,
      sku: product.sku,
      category: product.category,
      quantity: toNumber(product.stock),
      unitCost: toNumber(product.cost),
      stockValue: round2(toNumber(product.stock) * toNumber(product.cost)),
      method,
    }));
  const summary = rows.reduce(
    (acc, row) => {
      acc.quantity += toNumber(row.quantity);
      acc.value += toNumber(row.stockValue);
      return acc;
    },
    { quantity: 0, value: 0 }
  );
  return {
    method,
    rows,
    summary: { quantity: round2(summary.quantity), value: round2(summary.value) },
  };
};
