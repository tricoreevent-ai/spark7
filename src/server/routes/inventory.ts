import { Router, Response } from 'express';
import { Inventory } from '../models/Inventory.js';
import { Product } from '../models/Product.js';
import { InventoryTransfer } from '../models/InventoryTransfer.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';

const router = Router();

const toNumber = (value: any): number => Number(value || 0);

type InventoryAction = 'set' | 'add' | 'subtract' | 'stock_in' | 'stock_out';
type InventorySortField = 'name' | 'sku' | 'stock' | 'minStock' | 'category' | 'lastRestockDate';

const normalizeAction = (value: any): InventoryAction => {
  const normalized = String(value || 'set').trim().toLowerCase();
  if (normalized === 'add') return 'add';
  if (normalized === 'subtract') return 'subtract';
  if (normalized === 'stock_in') return 'stock_in';
  if (normalized === 'stock_out') return 'stock_out';
  return 'set';
};

const resolveNextQuantity = (current: number, quantity: number, action: InventoryAction): number => {
  if (action === 'add' || action === 'stock_in') return current + quantity;
  if (action === 'subtract' || action === 'stock_out') {
    if (current < quantity) {
      throw new Error('Insufficient inventory');
    }
    return current - quantity;
  }
  return quantity;
};

const parseOptionalDate = (value: any): Date | undefined => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date value');
  }
  return parsed;
};

const buildInventoryRow = (product: any, inventoryDoc?: any) => ({
  _id: inventoryDoc?._id?.toString?.() || `product-${product._id.toString()}`,
  productId: {
    _id: product._id.toString(),
    name: product.name,
    sku: product.sku,
    barcode: product.barcode || '',
    category: product.category || '',
    subcategory: product.subcategory || '',
    minStock: toNumber(product.minStock),
    unit: product.unit || 'piece',
    stock: toNumber(product.stock),
  },
  quantity: toNumber(product.stock),
  warehouseLocation: inventoryDoc?.warehouseLocation || 'Main Store',
  storeLocation: inventoryDoc?.storeLocation || '',
  rackLocation: inventoryDoc?.rackLocation || '',
  shelfLocation: inventoryDoc?.shelfLocation || '',
  batchNumber: inventoryDoc?.batchNumber || '',
  expiryDate: inventoryDoc?.expiryDate || null,
  adjustmentReason: inventoryDoc?.adjustmentReason || '',
  lastRestockDate: inventoryDoc?.lastRestockDate || product.updatedAt || product.createdAt || new Date(),
});

const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      current = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
};

const parseBoolean = (value: any, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const listInventoryRows = async (args: {
  skip?: number;
  limit?: number;
  includeInactive?: boolean;
  onlyLowStock?: boolean;
  q?: string;
  stockLevel?: string;
  category?: string;
  sortBy?: InventorySortField;
  sortOrder?: 'asc' | 'desc';
}) => {
  const skip = Math.max(0, Number(args.skip || 0));
  const limit = Math.max(1, Number(args.limit || 50));
  const includeInactive = Boolean(args.includeInactive);
  const onlyLowStock = Boolean(args.onlyLowStock);
  const stockLevel = String(args.stockLevel || '').trim().toLowerCase();
  const category = String(args.category || '').trim();
  const sortBy = (String(args.sortBy || 'lastRestockDate').trim() as InventorySortField);
  const sortOrder = String(args.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 1 : -1;

  const filter: any = {};
  if (!includeInactive) filter.isActive = true;
  if (category) filter.category = category;

  if (typeof args.q === 'string' && args.q.trim()) {
    const regex = new RegExp(args.q.trim(), 'i');
    filter.$or = [
      { name: regex },
      { sku: regex },
      { barcode: regex },
      { category: regex },
      { subcategory: regex },
    ];
  }

  const products = await Product.find(filter)
    .skip(skip)
    .limit(limit);

  const productIds = products.map((p) => p._id);
  const inventoryDocs = await Inventory.find({ productId: { $in: productIds } });
  const inventoryByProductId = new Map(
    inventoryDocs.map((doc: any) => [String(doc.productId), doc])
  );

  let rows = products.map((product: any) =>
    buildInventoryRow(product, inventoryByProductId.get(String(product._id)))
  );

  if (onlyLowStock || stockLevel === 'low') {
    rows = rows.filter((row: any) => Number(row.quantity || 0) <= Number(row.productId?.minStock || 0));
  } else if (stockLevel === 'out') {
    rows = rows.filter((row: any) => Number(row.quantity || 0) <= 0);
  } else if (stockLevel === 'in') {
    rows = rows.filter((row: any) => Number(row.quantity || 0) > 0);
  }

  const compareText = (a: any, b: any) => String(a || '').localeCompare(String(b || ''));
  rows.sort((left: any, right: any) => {
    if (sortBy === 'name') return compareText(left.productId?.name, right.productId?.name) * sortOrder;
    if (sortBy === 'sku') return compareText(left.productId?.sku, right.productId?.sku) * sortOrder;
    if (sortBy === 'stock') return (toNumber(left.quantity) - toNumber(right.quantity)) * sortOrder;
    if (sortBy === 'minStock') return (toNumber(left.productId?.minStock) - toNumber(right.productId?.minStock)) * sortOrder;
    if (sortBy === 'category') return compareText(left.productId?.category, right.productId?.category) * sortOrder;
    return (
      (new Date(left.lastRestockDate || 0).getTime() - new Date(right.lastRestockDate || 0).getTime())
      * sortOrder
    );
  });

  const total = await Product.countDocuments(filter);
  return { rows, total, skip, limit };
};

const writeInventoryAudit = async (args: {
  req: AuthenticatedRequest;
  product: any;
  action: InventoryAction;
  requestedQuantity: number;
  previousStock: number;
  nextStock: number;
  reason?: string;
  inventoryDoc?: any;
}) => {
  await writeAuditLog({
    module: 'inventory',
    action: 'stock_adjustment',
    entityType: 'inventory',
    entityId: args.product._id.toString(),
    referenceNo: args.product.sku,
    userId: args.req.userId,
    metadata: {
      action: args.action,
      quantityInput: args.requestedQuantity,
      quantityDelta: args.nextStock - args.previousStock,
      reason: args.reason || '',
      warehouseLocation: args.inventoryDoc?.warehouseLocation || '',
      storeLocation: args.inventoryDoc?.storeLocation || '',
      rackLocation: args.inventoryDoc?.rackLocation || '',
      shelfLocation: args.inventoryDoc?.shelfLocation || '',
      batchNumber: args.inventoryDoc?.batchNumber || '',
      expiryDate: args.inventoryDoc?.expiryDate || null,
    },
    before: {
      stock: args.previousStock,
    },
    after: {
      stock: args.nextStock,
    },
  });
};

// Get inventory for all products (source of truth: Product.stock)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      skip = 0,
      limit = 1000,
      includeInactive = false,
      q = '',
      stockLevel = '',
      category = '',
      sortBy = 'lastRestockDate',
      sortOrder = 'desc',
    } = req.query;
    const result = await listInventoryRows({
      skip: Number(skip),
      limit: Number(limit),
      includeInactive: parseBoolean(includeInactive, false),
      onlyLowStock: false,
      q: String(q || ''),
      stockLevel: String(stockLevel || ''),
      category: String(category || ''),
      sortBy: String(sortBy || 'lastRestockDate') as InventorySortField,
      sortOrder: String(sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 'asc' : 'desc',
    });

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: result.total,
        skip: result.skip,
        limit: result.limit,
      },
    });
  } catch (error: any) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get inventory',
    });
  }
});

// Get low stock items
router.get('/status/low-stock', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { skip = 0, limit = 1000, includeInactive = false, q = '', category = '' } = req.query;
    const result = await listInventoryRows({
      skip: Number(skip),
      limit: Number(limit),
      includeInactive: parseBoolean(includeInactive, false),
      onlyLowStock: true,
      q: String(q || ''),
      category: String(category || ''),
      sortBy: 'stock',
      sortOrder: 'asc',
    });

    res.status(200).json({
      success: true,
      message: `Found ${result.rows.length} low stock items`,
      data: result.rows,
      pagination: {
        total: result.rows.length,
        skip: result.skip,
        limit: result.limit,
      },
    });
  } catch (error: any) {
    console.error('Get low stock items error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get low stock items',
    });
  }
});

// Initialize inventory for product and sync Product.stock
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      productId,
      quantity,
      warehouseLocation,
      storeLocation,
      rackLocation,
      shelfLocation,
      batchNumber,
      expiryDate,
      adjustmentReason,
    } = req.body;

    if (!productId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Product ID and quantity are required',
      });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be a non-negative number',
      });
    }

    const parsedExpiry = parseOptionalDate(expiryDate);
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    const current = toNumber(product.stock);
    product.stock = qty;
    await product.save();

    const inventory = await Inventory.findOneAndUpdate(
      { productId },
      {
        productId,
        quantity: qty,
        ...(warehouseLocation !== undefined && { warehouseLocation }),
        ...(storeLocation !== undefined && { storeLocation }),
        ...(rackLocation !== undefined && { rackLocation }),
        ...(shelfLocation !== undefined && { shelfLocation }),
        ...(batchNumber !== undefined && { batchNumber }),
        ...(parsedExpiry !== undefined && { expiryDate: parsedExpiry }),
        ...(adjustmentReason !== undefined && { adjustmentReason }),
        lastRestockDate: new Date(),
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await writeInventoryAudit({
      req,
      product,
      action: 'set',
      requestedQuantity: qty,
      previousStock: current,
      nextStock: qty,
      reason: adjustmentReason,
      inventoryDoc: inventory,
    });

    res.status(201).json({
      success: true,
      message: 'Inventory initialized successfully',
      data: buildInventoryRow(product, inventory),
    });
  } catch (error: any) {
    console.error('Create inventory error:', error);
    const status = String(error.message || '').includes('Invalid date value') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to create inventory',
    });
  }
});

// Bulk stock update
router.put('/bulk-update', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (!updates.length) {
      return res.status(400).json({ success: false, error: 'updates array is required' });
    }

    const updatedRows: any[] = [];
    const failedRows: Array<{ productId?: string; error: string }> = [];

    for (const row of updates) {
      const productId = String(row?.productId || '').trim();
      const action = normalizeAction(row?.action);
      const quantity = Number(row?.quantity);

      if (!productId) {
        failedRows.push({ productId, error: 'productId is required' });
        continue;
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        failedRows.push({ productId, error: 'quantity must be a non-negative number' });
        continue;
      }

      try {
        const product = await Product.findById(productId);
        if (!product) {
          failedRows.push({ productId, error: 'Product not found' });
          continue;
        }

        const parsedExpiry = parseOptionalDate(row?.expiryDate);
        const current = toNumber(product.stock);
        const next = resolveNextQuantity(current, quantity, action);

        if (next < 0) {
          failedRows.push({ productId, error: 'Stock cannot be negative' });
          continue;
        }

        product.stock = next;
        await product.save();

        const inventory = await Inventory.findOneAndUpdate(
          { productId },
          {
            productId,
            quantity: next,
            ...(row?.warehouseLocation !== undefined && { warehouseLocation: row.warehouseLocation }),
            ...(row?.storeLocation !== undefined && { storeLocation: row.storeLocation }),
            ...(row?.rackLocation !== undefined && { rackLocation: row.rackLocation }),
            ...(row?.shelfLocation !== undefined && { shelfLocation: row.shelfLocation }),
            ...(row?.batchNumber !== undefined && { batchNumber: row.batchNumber }),
            ...(parsedExpiry !== undefined && { expiryDate: parsedExpiry }),
            ...(row?.adjustmentReason !== undefined && { adjustmentReason: row.adjustmentReason }),
            lastRestockDate: new Date(),
          },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        await writeInventoryAudit({
          req,
          product,
          action,
          requestedQuantity: quantity,
          previousStock: current,
          nextStock: next,
          reason: row?.adjustmentReason,
          inventoryDoc: inventory,
        });

        updatedRows.push(buildInventoryRow(product, inventory));
      } catch (error: any) {
        failedRows.push({ productId, error: error.message || 'Failed to update row' });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk update completed: ${updatedRows.length} updated, ${failedRows.length} failed`,
      data: {
        updatedCount: updatedRows.length,
        failedCount: failedRows.length,
        rows: updatedRows,
        failedRows,
      },
    });
  } catch (error: any) {
    console.error('Bulk update inventory error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to bulk update inventory',
    });
  }
});

// Export inventory snapshot as CSV (Excel-compatible)
router.get('/export/csv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      includeInactive = false,
      q = '',
      stockLevel = '',
      category = '',
      sortBy = 'name',
      sortOrder = 'asc',
    } = req.query;

    const result = await listInventoryRows({
      skip: 0,
      limit: 5000,
      includeInactive: parseBoolean(includeInactive, false),
      q: String(q || ''),
      stockLevel: String(stockLevel || ''),
      category: String(category || ''),
      sortBy: String(sortBy || 'name') as InventorySortField,
      sortOrder: String(sortOrder || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc',
    });

    const headers = [
      'productId',
      'name',
      'sku',
      'barcode',
      'category',
      'subcategory',
      'quantity',
      'unit',
      'minStock',
      'warehouseLocation',
      'storeLocation',
      'rackLocation',
      'shelfLocation',
      'batchNumber',
      'expiryDate',
      'lastRestockDate',
      'status',
    ];

    const escapeCell = (value: any): string => {
      const text = String(value ?? '');
      if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
      return text;
    };

    const rows = result.rows.map((row: any) => {
      const status = toNumber(row.quantity) <= 0
        ? 'out_of_stock'
        : toNumber(row.quantity) <= toNumber(row.productId?.minStock)
          ? 'low_stock'
          : 'in_stock';
      return [
        row.productId?._id || '',
        row.productId?.name || '',
        row.productId?.sku || '',
        row.productId?.barcode || '',
        row.productId?.category || '',
        row.productId?.subcategory || '',
        toNumber(row.quantity),
        row.productId?.unit || '',
        toNumber(row.productId?.minStock),
        row.warehouseLocation || '',
        row.storeLocation || '',
        row.rackLocation || '',
        row.shelfLocation || '',
        row.batchNumber || '',
        row.expiryDate ? new Date(row.expiryDate).toISOString().slice(0, 10) : '',
        row.lastRestockDate ? new Date(row.lastRestockDate).toISOString() : '',
        status,
      ].map(escapeCell).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=inventory_export_${stamp}.csv`);
    res.send(`\ufeff${csv}`);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to export inventory CSV' });
  }
});

// Import products + inventory from rows array or CSV text
router.post('/import/products', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';

    let rows: Array<Record<string, any>> = [];
    if (incomingRows && incomingRows.length > 0) {
      rows = incomingRows;
    } else if (csvText.trim()) {
      const parsed = parseCsvRows(csvText);
      if (parsed.length < 2) {
        return res.status(400).json({ success: false, error: 'CSV must include a header row and at least one data row' });
      }
      const headers = parsed[0].map((value) => value.trim().toLowerCase());
      rows = parsed.slice(1).map((cells) =>
        headers.reduce((acc: Record<string, any>, header, idx) => {
          acc[header] = cells[idx] ?? '';
          return acc;
        }, {})
      );
    } else {
      return res.status(400).json({ success: false, error: 'Provide rows[] or csvText for import' });
    }

    const imported: any[] = [];
    const failedRows: Array<{ rowIndex: number; sku?: string; error: string }> = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      const name = String(row.name || row.productname || '').trim();
      const sku = String(row.sku || '').trim().toUpperCase();
      const category = String(row.category || 'General').trim() || 'General';

      if (!name || !sku) {
        failedRows.push({ rowIndex: i + 1, sku, error: 'name and sku are required' });
        continue;
      }

      const stock = Math.max(0, toNumber(row.stock ?? row.quantity ?? 0));
      const minStock = Math.max(0, toNumber(row.minstock ?? row.minStock ?? 10));
      const barcode = String(row.barcode || '').trim().toUpperCase();
      const price = Math.max(0, toNumber(row.price ?? row.sellingprice ?? 0));
      const cost = Math.max(0, toNumber(row.cost ?? row.costprice ?? 0));
      const unit = String(row.unit || 'piece').trim().toLowerCase() || 'piece';
      const gstRateRaw = toNumber(row.gstrate ?? row.gstRate ?? 18);
      const allowedGst = [0, 5, 12, 18, 28];
      const gstRate = allowedGst.includes(gstRateRaw) ? gstRateRaw : 18;
      const description = String(row.description || '').trim();
      const subcategory = String(row.subcategory || '').trim();
      const imageUrl = String(row.imageurl || row.imageUrl || '').trim();

      try {
        let product: any = await Product.findOne({ sku });

        const payload: any = {
          name,
          sku,
          category,
          subcategory,
          description,
          price,
          cost,
          gstRate,
          minStock,
          unit,
          stock,
          imageUrl,
          batchTracking: parseBoolean(row.batchtracking ?? row.batchTracking, false),
          expiryRequired: parseBoolean(row.expiryrequired ?? row.expiryRequired, false),
          serialNumberTracking: parseBoolean(row.serialnumbertracking ?? row.serialNumberTracking, false),
          variantSize: String(row.variantsize ?? row.variantSize ?? '').trim(),
          variantColor: String(row.variantcolor ?? row.variantColor ?? '').trim(),
        };
        if (barcode) payload.barcode = barcode;

        if (product) {
          product = await Product.findByIdAndUpdate(product._id, payload, { new: true, runValidators: true });
        } else {
          product = await Product.create(payload);
        }

        const parsedExpiry = parseOptionalDate(row.expirydate ?? row.expiryDate);
        await Inventory.findOneAndUpdate(
          { productId: product._id },
          {
            productId: product._id,
            quantity: stock,
            ...((row.warehouselocation !== undefined || row.warehouseLocation !== undefined) && { warehouseLocation: row.warehouselocation ?? row.warehouseLocation }),
            ...((row.storelocation !== undefined || row.storeLocation !== undefined) && { storeLocation: row.storelocation ?? row.storeLocation }),
            ...((row.racklocation !== undefined || row.rackLocation !== undefined) && { rackLocation: row.racklocation ?? row.rackLocation }),
            ...((row.shelflocation !== undefined || row.shelfLocation !== undefined) && { shelfLocation: row.shelflocation ?? row.shelfLocation }),
            ...((row.batchnumber !== undefined || row.batchNumber !== undefined) && { batchNumber: row.batchnumber ?? row.batchNumber }),
            ...(parsedExpiry !== undefined && { expiryDate: parsedExpiry }),
            adjustmentReason: 'Bulk import',
            lastRestockDate: new Date(),
          },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        );

        imported.push({
          productId: product._id.toString(),
          sku: product.sku,
          name: product.name,
          stock: toNumber(product.stock),
        });
      } catch (error: any) {
        failedRows.push({ rowIndex: i + 1, sku, error: error.message || 'Failed to import row' });
      }
    }

    await writeAuditLog({
      module: 'inventory',
      action: 'inventory_import',
      entityType: 'inventory',
      referenceNo: `rows:${rows.length}`,
      userId: req.userId,
      metadata: {
        importedCount: imported.length,
        failedCount: failedRows.length,
      },
    });

    res.json({
      success: true,
      message: `Import completed: ${imported.length} succeeded, ${failedRows.length} failed`,
      data: {
        importedCount: imported.length,
        failedCount: failedRows.length,
        imported,
        failedRows,
      },
    });
  } catch (error: any) {
    const status = String(error.message || '').includes('Invalid date value') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to import inventory' });
  }
});

// Transfer stock location metadata between warehouses/stores/racks/shelves
router.post('/transfer', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      productId,
      quantity,
      fromWarehouseLocation = '',
      fromStoreLocation = '',
      fromRackLocation = '',
      fromShelfLocation = '',
      toWarehouseLocation = '',
      toStoreLocation = '',
      toRackLocation = '',
      toShelfLocation = '',
      reason = '',
    } = req.body || {};

    if (!productId) return res.status(400).json({ success: false, error: 'productId is required' });
    const transferQty = toNumber(quantity);
    if (!Number.isFinite(transferQty) || transferQty <= 0) {
      return res.status(400).json({ success: false, error: 'quantity must be greater than 0' });
    }
    if (!String(toWarehouseLocation || '').trim()) {
      return res.status(400).json({ success: false, error: 'toWarehouseLocation is required' });
    }

    const product: any = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    if (toNumber(product.stock) < transferQty) {
      return res.status(400).json({ success: false, error: 'Insufficient stock for transfer' });
    }

    const inventoryDoc: any = await Inventory.findOneAndUpdate(
      { productId: product._id },
      {
        productId: product._id,
        quantity: toNumber(product.stock),
        warehouseLocation: String(toWarehouseLocation || '').trim(),
        storeLocation: String(toStoreLocation || '').trim(),
        rackLocation: String(toRackLocation || '').trim(),
        shelfLocation: String(toShelfLocation || '').trim(),
        adjustmentReason: String(reason || '').trim() || 'Stock location transfer',
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const transfer = await InventoryTransfer.create({
      productId: product._id,
      quantity: transferQty,
      fromWarehouseLocation: String(fromWarehouseLocation || '').trim(),
      fromStoreLocation: String(fromStoreLocation || '').trim(),
      fromRackLocation: String(fromRackLocation || '').trim(),
      fromShelfLocation: String(fromShelfLocation || '').trim(),
      toWarehouseLocation: String(toWarehouseLocation || '').trim(),
      toStoreLocation: String(toStoreLocation || '').trim(),
      toRackLocation: String(toRackLocation || '').trim(),
      toShelfLocation: String(toShelfLocation || '').trim(),
      reason: String(reason || '').trim(),
      transferredBy: req.userId,
    });

    await writeAuditLog({
      module: 'inventory',
      action: 'stock_transfer',
      entityType: 'inventory_transfer',
      entityId: transfer._id.toString(),
      referenceNo: product.sku,
      userId: req.userId,
      metadata: {
        productId: product._id.toString(),
        sku: product.sku,
        quantity: transferQty,
        fromWarehouseLocation: transfer.fromWarehouseLocation,
        toWarehouseLocation: transfer.toWarehouseLocation,
        reason: transfer.reason,
      },
      after: {
        warehouseLocation: inventoryDoc?.warehouseLocation || '',
        storeLocation: inventoryDoc?.storeLocation || '',
        rackLocation: inventoryDoc?.rackLocation || '',
        shelfLocation: inventoryDoc?.shelfLocation || '',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Stock transferred successfully',
      data: transfer,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to transfer stock' });
  }
});

router.get('/transfers/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId = '', skip = 0, limit = 100, dateFrom = '', dateTo = '' } = req.query;

    const filter: any = {};
    if (String(productId || '').trim()) filter.productId = String(productId).trim();

    const from = parseOptionalDate(dateFrom);
    const to = parseOptionalDate(dateTo);
    if (from || to) {
      filter.transferredAt = {};
      if (from) filter.transferredAt.$gte = from;
      if (to) filter.transferredAt.$lte = to;
    }

    const parsedSkip = Math.max(0, Number(skip) || 0);
    const parsedLimit = Math.min(500, Math.max(1, Number(limit) || 100));

    const [rows, total] = await Promise.all([
      InventoryTransfer.find(filter)
        .sort({ transferredAt: -1 })
        .skip(parsedSkip)
        .limit(parsedLimit)
        .populate('productId', 'name sku barcode unit'),
      InventoryTransfer.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: { total, skip: parsedSkip, limit: parsedLimit },
    });
  } catch (error: any) {
    const status = String(error.message || '').includes('Invalid date value') ? 400 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to fetch transfer history' });
  }
});

// Get inventory for specific product
router.get('/:productId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    const inventoryDoc = await Inventory.findOne({ productId: req.params.productId });
    const row = buildInventoryRow(product, inventoryDoc || undefined);

    res.status(200).json({
      success: true,
      data: row,
    });
  } catch (error: any) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get inventory',
    });
  }
});

// Update inventory quantity and sync Product.stock
router.put('/:productId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      quantity,
      action = 'set',
      warehouseLocation,
      storeLocation,
      rackLocation,
      shelfLocation,
      expiryDate,
      batchNumber,
      adjustmentReason,
    } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Quantity is required',
      });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be a non-negative number',
      });
    }

    const parsedExpiry = parseOptionalDate(expiryDate);
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    const normalizedAction = normalizeAction(action);
    const current = toNumber(product.stock);
    const next = resolveNextQuantity(current, qty, normalizedAction);

    if (next < 0) {
      return res.status(400).json({
        success: false,
        error: 'Stock cannot be negative',
      });
    }

    product.stock = next;
    await product.save();

    const inventory = await Inventory.findOneAndUpdate(
      { productId: req.params.productId },
      {
        productId: req.params.productId,
        quantity: next,
        ...(warehouseLocation !== undefined && { warehouseLocation }),
        ...(storeLocation !== undefined && { storeLocation }),
        ...(rackLocation !== undefined && { rackLocation }),
        ...(shelfLocation !== undefined && { shelfLocation }),
        ...(parsedExpiry !== undefined && { expiryDate: parsedExpiry }),
        ...(batchNumber !== undefined && { batchNumber }),
        ...(adjustmentReason !== undefined && { adjustmentReason }),
        lastRestockDate: new Date(),
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await writeInventoryAudit({
      req,
      product,
      action: normalizedAction,
      requestedQuantity: qty,
      previousStock: current,
      nextStock: next,
      reason: adjustmentReason,
      inventoryDoc: inventory,
    });

    res.status(200).json({
      success: true,
      message: 'Inventory updated successfully',
      data: buildInventoryRow(product, inventory),
    });
  } catch (error: any) {
    console.error('Update inventory error:', error);
    const status = String(error.message || '').includes('Invalid date value') || String(error.message || '').includes('Insufficient inventory')
      ? 400
      : 500;
    res.status(status).json({
      success: false,
      error: error.message || 'Failed to update inventory',
    });
  }
});

export default router;
