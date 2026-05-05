import { Router, Response } from 'express';
import { Product } from '../models/Product.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getCurrentTenantId } from '../services/tenantContext.js';
import { validateHsnSacCode } from '../services/gstCompliance.js';
import { writeAuditLog } from '../services/audit.js';

const router = Router();

const normalizePriceTiers = (value: any): Array<{ tierName: string; minQuantity: number; unitPrice: number }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      tierName: String(row?.tierName || '').trim(),
      minQuantity: Math.max(1, Number(row?.minQuantity || 1)),
      unitPrice: Number(row?.unitPrice || 0),
    }))
    .filter((row) => row.unitPrice > 0)
      .sort((a, b) => a.minQuantity - b.minQuantity || a.tierName.localeCompare(b.tierName));
};

const normalizeVariantMatrix = (
  value: any
): Array<{ size: string; color: string; skuSuffix: string; barcode: string; price: number; isActive: boolean }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row: any) => ({
      size: String(row?.size || '').trim(),
      color: String(row?.color || '').trim(),
      skuSuffix: String(row?.skuSuffix || '').trim().toUpperCase(),
      barcode: String(row?.barcode || '').trim().toUpperCase(),
      price: Math.max(0, Number(row?.price || 0)),
      isActive: row?.isActive !== false,
    }))
    .filter((row) => row.size || row.color || row.skuSuffix || row.barcode || row.price > 0);
};

const normalizeOptionalHsnCode = (value: any): string => String(value || '').trim().replace(/\s+/g, '');
const VALID_ITEM_TYPES = new Set(['inventory', 'service', 'non_inventory']);
const VALID_UNITS = new Set(['piece', 'pcs', 'kg', 'gram', 'liter', 'ml', 'meter', 'box', 'pack', 'dozen']);
const VALID_GST_RATES = new Set([0, 5, 12, 18, 28]);

type BulkRowError = {
  rowNumber: number;
  sku?: string;
  name?: string;
  messages: string[];
};

type BulkDuplicateMode = 'update_existing' | 'skip_existing' | 'error_existing';

type NormalizedBulkProductRow = {
  sourceRowNumber: number;
  name: string;
  sku: string;
  barcode?: string;
  description: string;
  category: string;
  subcategory: string;
  itemType: 'inventory' | 'service' | 'non_inventory';
  price: number;
  wholesalePrice: number;
  promotionalPrice: number;
  promotionStartDate?: Date;
  promotionEndDate?: Date;
  priceTiers: Array<{ tierName: string; minQuantity: number; unitPrice: number }>;
  cost: number;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  taxType: 'gst' | 'vat';
  stock: number;
  openingStockValue: number;
  stockLedgerAccountId?: string;
  returnStock: number;
  damagedStock: number;
  minStock: number;
  autoReorder: boolean;
  reorderQuantity: number;
  unit: string;
  hsnCode: string;
  allowNegativeStock: boolean;
  batchTracking: boolean;
  expiryRequired: boolean;
  serialNumberTracking: boolean;
  variantSize: string;
  variantColor: string;
  variantMatrix: Array<{ size: string; color: string; skuSuffix: string; barcode: string; price: number; isActive: boolean }>;
  imageUrl: string;
  isActive: boolean;
};

const parseBooleanLike = (value: any, defaultValue = false): boolean => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'inactive'].includes(normalized)) return false;
  return defaultValue;
};

const normalizeItemTypeValue = (value: any): 'inventory' | 'service' | 'non_inventory' => {
  const normalized = String(value || 'inventory').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'service') return 'service';
  if (normalized === 'non_inventory') return 'non_inventory';
  return 'inventory';
};

const normalizeUnitValue = (value: any): string => String(value || 'piece').trim().toLowerCase();

const parseOptionalDate = (value: any): Date | null | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseOptionalNumber = (value: any, defaultValue = 0): number | null => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
};

const parseJsonArrayInput = (value: any): any[] | null => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const validateBulkProductRow = (raw: any, fallbackRowNumber: number): { normalized?: NormalizedBulkProductRow; error?: BulkRowError } => {
  const rowNumber = Math.max(2, Number(raw?.sourceRowNumber || fallbackRowNumber || 2));
  const name = String(raw?.name || '').trim();
  const sku = String(raw?.sku || '').trim().toUpperCase();
  const category = String(raw?.category || '').trim();
  const barcode = String(raw?.barcode || '').trim().toUpperCase();
  const description = String(raw?.description || '').trim();
  const subcategory = String(raw?.subcategory || '').trim();
  const itemType = normalizeItemTypeValue(raw?.itemType);
  const unit = normalizeUnitValue(raw?.unit);
  const taxType = String(raw?.taxType || 'gst').trim().toLowerCase() === 'vat' ? 'vat' : 'gst';
  const hsnCode = normalizeOptionalHsnCode(raw?.hsnCode);
  const variantSize = String(raw?.variantSize || '').trim();
  const variantColor = String(raw?.variantColor || '').trim();
  const imageUrl = String(raw?.imageUrl || '').trim();
  const stockLedgerAccountId = String(raw?.stockLedgerAccountId || '').trim();
  const errors: string[] = [];

  if (!name) errors.push('Product name is required.');
  if (!sku) errors.push('SKU is required.');
  if (!category) errors.push('Category is required.');
  if (!VALID_ITEM_TYPES.has(itemType)) errors.push('Item type must be inventory, service, or non_inventory.');
  if (!VALID_UNITS.has(unit)) errors.push('Unit is not supported by the product master.');

  const price = parseOptionalNumber(raw?.price, NaN);
  if (price === null || Number.isNaN(price) || price < 0) errors.push('Selling price must be a valid number greater than or equal to 0.');

  const wholesalePrice = parseOptionalNumber(raw?.wholesalePrice, 0);
  if (wholesalePrice === null || wholesalePrice < 0) errors.push('Wholesale purchase price must be a valid number greater than or equal to 0.');

  const promotionalPrice = parseOptionalNumber(raw?.promotionalPrice, 0);
  if (promotionalPrice === null || promotionalPrice < 0) errors.push('Promotional price must be a valid number greater than or equal to 0.');

  const cost = parseOptionalNumber(raw?.cost, NaN);
  if (cost === null || Number.isNaN(cost) || cost < 0) errors.push('Cost (buying) must be a valid number greater than or equal to 0.');

  const gstRate = parseOptionalNumber(raw?.gstRate, 18);
  if (gstRate === null || !VALID_GST_RATES.has(gstRate)) errors.push('GST rate must be one of 0, 5, 12, 18, or 28.');

  const cgstRate = parseOptionalNumber(raw?.cgstRate, 0);
  if (cgstRate === null || cgstRate < 0) errors.push('CGST rate must be a valid number greater than or equal to 0.');

  const sgstRate = parseOptionalNumber(raw?.sgstRate, 0);
  if (sgstRate === null || sgstRate < 0) errors.push('SGST rate must be a valid number greater than or equal to 0.');

  const igstRate = parseOptionalNumber(raw?.igstRate, 0);
  if (igstRate === null || igstRate < 0) errors.push('IGST rate must be a valid number greater than or equal to 0.');

  const stock = parseOptionalNumber(raw?.stock, 0);
  if (stock === null || stock < 0) errors.push('Quantity in stock must be a valid number greater than or equal to 0.');

  const openingStockValue = parseOptionalNumber(raw?.openingStockValue, 0);
  if (openingStockValue === null || openingStockValue < 0) errors.push('Opening stock value must be a valid number greater than or equal to 0.');

  const returnStock = parseOptionalNumber(raw?.returnStock, 0);
  if (returnStock === null || returnStock < 0) errors.push('Return stock must be a valid number greater than or equal to 0.');

  const damagedStock = parseOptionalNumber(raw?.damagedStock, 0);
  if (damagedStock === null || damagedStock < 0) errors.push('Damaged stock must be a valid number greater than or equal to 0.');

  const minStock = parseOptionalNumber(raw?.minStock, 10);
  if (minStock === null || minStock < 0) errors.push('Min stock alert must be a valid number greater than or equal to 0.');

  const reorderQuantity = parseOptionalNumber(raw?.reorderQuantity, 0);
  if (reorderQuantity === null || reorderQuantity < 0) errors.push('Preferred reorder quantity must be a valid number greater than or equal to 0.');

  const promotionStartDate = parseOptionalDate(raw?.promotionStartDate);
  if (promotionStartDate === null) errors.push('Promo start date must be a valid date.');

  const promotionEndDate = parseOptionalDate(raw?.promotionEndDate);
  if (promotionEndDate === null) errors.push('Promo end date must be a valid date.');

  if (promotionStartDate instanceof Date && promotionEndDate instanceof Date && promotionEndDate < promotionStartDate) {
    errors.push('Promo end date must be on or after promo start date.');
  }

  if (hsnCode) {
    const hsnValidation = validateHsnSacCode(hsnCode);
    if (!hsnValidation.isValid) {
      errors.push(hsnValidation.message);
    }
  }

  const parsedPriceTiers = parseJsonArrayInput(raw?.priceTiers);
  if (parsedPriceTiers === null) {
    errors.push('Price tiers must be blank or a valid JSON array.');
  }
  const parsedVariantMatrix = parseJsonArrayInput(raw?.variantMatrix);
  if (parsedVariantMatrix === null) {
    errors.push('Variant matrix must be blank or a valid JSON array.');
  }

  if (errors.length) {
    return { error: { rowNumber, sku, name, messages: errors } };
  }

  return {
    normalized: {
      sourceRowNumber: rowNumber,
      name,
      sku,
      ...(barcode ? { barcode } : {}),
      description,
      category,
      subcategory,
      itemType,
      price: Number(price || 0),
      wholesalePrice: Number(wholesalePrice || 0),
      promotionalPrice: Number(promotionalPrice || 0),
      ...(promotionStartDate instanceof Date ? { promotionStartDate } : {}),
      ...(promotionEndDate instanceof Date ? { promotionEndDate } : {}),
      priceTiers: normalizePriceTiers(parsedPriceTiers || []),
      cost: Number(cost || 0),
      gstRate: Number(gstRate || 0),
      cgstRate: Number(cgstRate || 0),
      sgstRate: Number(sgstRate || 0),
      igstRate: Number(igstRate || 0),
      taxType,
      stock: Number(stock || 0),
      openingStockValue: Number(openingStockValue || 0),
      ...(stockLedgerAccountId ? { stockLedgerAccountId } : {}),
      returnStock: Number(returnStock || 0),
      damagedStock: Number(damagedStock || 0),
      minStock: Number(minStock || 0),
      autoReorder: parseBooleanLike(raw?.autoReorder, false),
      reorderQuantity: Number(reorderQuantity || 0),
      unit,
      hsnCode,
      allowNegativeStock: parseBooleanLike(raw?.allowNegativeStock, false),
      batchTracking: parseBooleanLike(raw?.batchTracking, false),
      expiryRequired: parseBooleanLike(raw?.expiryRequired, false),
      serialNumberTracking: parseBooleanLike(raw?.serialNumberTracking, false),
      variantSize,
      variantColor,
      variantMatrix: normalizeVariantMatrix(parsedVariantMatrix || []),
      imageUrl,
      isActive: parseBooleanLike(raw?.isActive, true),
    },
  };
};

// Get all products
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, subcategory, isActive = true, skip = 0, limit = 20, q } = req.query;
    const tenantId = req.tenantId || getCurrentTenantId();

    const isActiveParam = String(isActive ?? '').trim().toLowerCase();
    const filter: any = {};

    // Backwards-compatible: treat missing legacy `isActive` as active.
    // Supports `isActive=all` to return both active + inactive products (admin/product list screens).
    if (isActiveParam === 'all') {
      // no-op: include both
    } else if (isActiveParam === 'false') {
      filter.isActive = false;
    } else {
      filter.isActive = { $ne: false };
    }
    
    // Add tenant filtering if available
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (typeof q === 'string' && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { name: regex },
        { sku: regex },
        { barcode: regex },
        { description: regex },
        { variantSize: regex },
        { variantColor: regex },
        { 'variantMatrix.size': regex },
        { 'variantMatrix.color': regex },
        { 'variantMatrix.barcode': regex },
        { 'variantMatrix.skuSuffix': regex },
      ];
    }

    const products = await Product.find(filter)
      .skip(Number(skip))
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Product.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        total,
        skip: Number(skip),
        limit: Number(limit),
      },
    });
  } catch (error: any) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get products',
    });
  }
});

router.get('/summary', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || getCurrentTenantId();
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Tenant context not found',
      });
    }

    const [summary] = await Product.aggregate([
      {
        $match: {
          tenantId,
          isActive: { $ne: false },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          inventoryProducts: {
            $sum: {
              $cond: [{ $eq: ['$itemType', 'inventory'] }, 1, 0],
            },
          },
          totalStockUnits: { $sum: { $ifNull: ['$stock', 0] } },
          totalShopProductWorth: {
            $sum: {
              $multiply: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$wholesalePrice', 0] }],
            },
          },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalProducts: Number(summary?.totalProducts || 0),
        inventoryProducts: Number(summary?.inventoryProducts || 0),
        totalStockUnits: Number(summary?.totalStockUnits || 0),
        totalShopProductWorth: Number(summary?.totalShopProductWorth || 0),
      },
    });
  } catch (error: any) {
    console.error('Get product summary error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get product summary',
    });
  }
});

router.post('/bulk-upsert', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || getCurrentTenantId();
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Tenant context not found',
      });
    }

    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({
        success: false,
        error: 'No product rows were provided for bulk upload.',
      });
    }

    if (rows.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Each bulk upload batch supports up to 1000 rows. Split larger files into smaller batches.',
      });
    }

    const duplicateMode: BulkDuplicateMode =
      String(req.body?.duplicateMode || 'update_existing').trim().toLowerCase() === 'skip_existing'
        ? 'skip_existing'
        : String(req.body?.duplicateMode || 'update_existing').trim().toLowerCase() === 'error_existing'
          ? 'error_existing'
          : 'update_existing';

    const rowErrors: BulkRowError[] = [];
    const validRows: NormalizedBulkProductRow[] = [];

    rows.forEach((row: any, index: number) => {
      const validated = validateBulkProductRow(row, index + 2);
      if (validated.error) {
        rowErrors.push(validated.error);
      } else if (validated.normalized) {
        validRows.push(validated.normalized);
      }
    });

    const seenSkus = new Set<string>();
    const seenBarcodes = new Map<string, number>();
    const batchSkus = validRows.map((row) => row.sku);
    const batchBarcodes = validRows.map((row) => row.barcode).filter(Boolean) as string[];
    const existingProducts = validRows.length
      ? await Product.find({
          tenantId,
          $or: [
            { sku: { $in: batchSkus } },
            ...(batchBarcodes.length ? [{ barcode: { $in: batchBarcodes } }] : []),
          ],
        })
          .select('_id sku barcode')
          .lean()
      : [];

    const existingBySku = new Map(existingProducts.map((row: any) => [String(row.sku || '').trim().toUpperCase(), row]));
    const existingByBarcode = new Map(
      existingProducts
        .filter((row: any) => String(row?.barcode || '').trim())
        .map((row: any) => [String(row.barcode || '').trim().toUpperCase(), row])
    );

    const now = new Date();
    const operations: any[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    validRows.forEach((row) => {
      if (seenSkus.has(row.sku)) {
        rowErrors.push({
          rowNumber: row.sourceRowNumber,
          sku: row.sku,
          name: row.name,
          messages: ['Duplicate SKU found in the same upload file.'],
        });
        return;
      }
      seenSkus.add(row.sku);

      if (row.barcode) {
        const seenBarcodeRowNumber = seenBarcodes.get(row.barcode);
        if (seenBarcodeRowNumber) {
          rowErrors.push({
            rowNumber: row.sourceRowNumber,
            sku: row.sku,
            name: row.name,
            messages: [`Duplicate barcode found in the same upload file (also used on row ${seenBarcodeRowNumber}).`],
          });
          return;
        }
        seenBarcodes.set(row.barcode, row.sourceRowNumber);

        const existingBarcodeRow: any = existingByBarcode.get(row.barcode);
        if (existingBarcodeRow && String(existingBarcodeRow.sku || '').trim().toUpperCase() !== row.sku) {
          rowErrors.push({
            rowNumber: row.sourceRowNumber,
            sku: row.sku,
            name: row.name,
            messages: ['This barcode is already assigned to another product in this tenant.'],
          });
          return;
        }
      }

      const existingSkuRow = existingBySku.get(row.sku);
      if (existingSkuRow) {
        if (duplicateMode === 'skip_existing') {
          skippedCount += 1;
          return;
        }
        if (duplicateMode === 'error_existing') {
          rowErrors.push({
            rowNumber: row.sourceRowNumber,
            sku: row.sku,
            name: row.name,
            messages: ['SKU already exists in this tenant. Choose Update Existing or change the SKU.'],
          });
          return;
        }
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      const updateDoc: any = {
        $set: {
          tenantId,
          name: row.name,
          sku: row.sku,
          barcode: row.barcode || undefined,
          description: row.description,
          category: row.category,
          subcategory: row.subcategory,
          itemType: row.itemType,
          price: row.price,
          wholesalePrice: row.wholesalePrice,
          promotionalPrice: row.promotionalPrice,
          promotionStartDate: row.promotionStartDate || undefined,
          promotionEndDate: row.promotionEndDate || undefined,
          priceTiers: row.priceTiers,
          cost: row.cost,
          gstRate: row.gstRate,
          cgstRate: row.cgstRate,
          sgstRate: row.sgstRate,
          igstRate: row.igstRate,
          taxType: row.taxType,
          stock: row.stock,
          openingStockValue: row.openingStockValue,
          stockLedgerAccountId: row.stockLedgerAccountId || undefined,
          returnStock: row.returnStock,
          damagedStock: row.damagedStock,
          minStock: row.minStock,
          autoReorder: row.autoReorder,
          reorderQuantity: row.reorderQuantity,
          unit: row.unit,
          hsnCode: row.hsnCode,
          allowNegativeStock: row.allowNegativeStock,
          batchTracking: row.batchTracking,
          expiryRequired: row.expiryRequired,
          serialNumberTracking: row.serialNumberTracking,
          variantSize: row.variantSize,
          variantColor: row.variantColor,
          variantMatrix: row.variantMatrix,
          imageUrl: row.imageUrl,
          isActive: row.isActive,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      };

      if (row.isActive) {
        updateDoc.$unset = {
          deletedAt: '',
          deletedBy: '',
          deletionReason: '',
        };
      } else {
        updateDoc.$set.deletedAt = now;
        updateDoc.$set.deletedBy = String(req.userId || '');
        updateDoc.$set.deletionReason = 'Marked inactive by bulk product upload';
      }

      operations.push({
        updateOne: {
          filter: { tenantId, sku: row.sku },
          update: updateDoc,
          upsert: true,
        },
      });
    });

    if (operations.length) {
      await Product.bulkWrite(operations, { ordered: false });
    }

    await writeAuditLog({
      module: 'products',
      action: 'product_bulk_upsert',
      entityType: 'product_bulk_upload',
      entityId: tenantId,
      referenceNo: `bulk-products-${now.toISOString()}`,
      userId: req.userId,
      metadata: {
        receivedRows: rows.length,
        processedRows: operations.length,
        createdCount,
        updatedCount,
        skippedCount,
        errorCount: rowErrors.length,
        duplicateMode,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        receivedRows: rows.length,
        processedRows: operations.length,
        createdCount,
        updatedCount,
        skippedCount,
        errorCount: rowErrors.length,
        errors: rowErrors,
        duplicateMode,
      },
    });
  } catch (error: any) {
    console.error('Bulk product upsert error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process bulk product upload',
    });
  }
});

// Get product by ID
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || getCurrentTenantId();
    const filter: any = { _id: req.params.id };
    
    // Add tenant filtering if available
    if (tenantId) {
      filter.tenantId = tenantId;
    }

    const product = await Product.findOne(filter);

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get product',
    });
  }
});

// Create product (requires authentication)
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      sku,
      barcode,
      description,
      category,
      subcategory,
      itemType,
      price,
      wholesalePrice,
      promotionalPrice,
      promotionStartDate,
      promotionEndDate,
      priceTiers,
      cost,
      gstRate,
      cgstRate,
      sgstRate,
      igstRate,
      taxType,
      stock,
      openingStockValue,
      stockLedgerAccountId,
      minStock,
      autoReorder,
      reorderQuantity,
      unit,
      hsnCode,
      allowNegativeStock,
      batchTracking,
      expiryRequired,
        serialNumberTracking,
        variantSize,
        variantColor,
        variantMatrix,
        returnStock,
        damagedStock,
        imageUrl,
    } = req.body;

    // Validation
    if (!name || !sku || !category || price === undefined || cost === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, sku, category, price, cost',
      });
    }

    const normalizedHsnCode = normalizeOptionalHsnCode(hsnCode);
    if (normalizedHsnCode) {
      const hsnValidation = validateHsnSacCode(normalizedHsnCode);
      if (!hsnValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: hsnValidation.message,
        });
      }
    }

    const tenantId = req.tenantId || getCurrentTenantId();
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Tenant context not found',
      });
    }

    // Check if product with same SKU exists in this tenant
    const existingProduct = await Product.findOne({ 
      sku: sku.toUpperCase(),
      tenantId,
    });
    if (existingProduct) {
      return res.status(409).json({
        success: false,
        error: 'Product with this SKU already exists',
      });
    }

    const normalizedBarcode = barcode !== undefined && barcode !== null ? String(barcode).trim().toUpperCase() : '';
    if (normalizedBarcode) {
      const existingBarcode = await Product.findOne({ 
        barcode: normalizedBarcode,
        tenantId,
      });
      if (existingBarcode) {
        return res.status(409).json({
          success: false,
          error: 'Product with this barcode already exists',
        });
      }
    }

    const product = new Product({
      tenantId,
      name,
      sku: sku.toUpperCase(),
      ...(normalizedBarcode && { barcode: normalizedBarcode }),
      description,
      category,
      subcategory: subcategory || '',
      itemType: String(itemType || 'inventory') === 'service'
        ? 'service'
        : String(itemType || 'inventory') === 'non_inventory'
          ? 'non_inventory'
          : 'inventory',
      price,
      wholesalePrice: wholesalePrice || 0,
      promotionalPrice: Number(promotionalPrice || 0),
      promotionStartDate: promotionStartDate || undefined,
      promotionEndDate: promotionEndDate || undefined,
      priceTiers: normalizePriceTiers(priceTiers),
      cost,
      gstRate: gstRate || 18,
      cgstRate: Number(cgstRate || 0),
      sgstRate: Number(sgstRate || 0),
      igstRate: Number(igstRate || 0),
      taxType: taxType || 'gst',
      stock: stock || 0,
      openingStockValue: Number(openingStockValue || 0),
      ...(stockLedgerAccountId && { stockLedgerAccountId }),
      returnStock: returnStock || 0,
      damagedStock: damagedStock || 0,
      minStock: minStock || 10,
      autoReorder: Boolean(autoReorder),
      reorderQuantity: Number(reorderQuantity || 0),
      unit: unit || 'piece',
      hsnCode: normalizedHsnCode,
      allowNegativeStock: Boolean(allowNegativeStock),
      batchTracking: Boolean(batchTracking),
      expiryRequired: Boolean(expiryRequired),
        serialNumberTracking: Boolean(serialNumberTracking),
        variantSize: variantSize || '',
        variantColor: variantColor || '',
        variantMatrix: normalizeVariantMatrix(variantMatrix),
        imageUrl: imageUrl || '',
      });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error: any) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create product',
    });
  }
});

// Update product (requires authentication)
router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      sku,
      barcode,
      description,
      category,
      subcategory,
      itemType,
      price,
      wholesalePrice,
      promotionalPrice,
      promotionStartDate,
      promotionEndDate,
      priceTiers,
      cost,
      gstRate,
      cgstRate,
      sgstRate,
      igstRate,
      taxType,
      stock,
      openingStockValue,
      stockLedgerAccountId,
      returnStock,
      damagedStock,
      minStock,
      autoReorder,
      reorderQuantity,
      unit,
      isActive,
      hsnCode,
      allowNegativeStock,
      batchTracking,
      expiryRequired,
        serialNumberTracking,
        variantSize,
        variantColor,
        variantMatrix,
        imageUrl,
      } = req.body;

    const updates: any = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(category !== undefined && { category }),
      ...(subcategory !== undefined && { subcategory }),
      ...(itemType !== undefined && {
        itemType: String(itemType) === 'service'
          ? 'service'
          : String(itemType) === 'non_inventory'
            ? 'non_inventory'
            : 'inventory',
      }),
      ...(price !== undefined && { price }),
      ...(wholesalePrice !== undefined && { wholesalePrice }),
      ...(promotionalPrice !== undefined && { promotionalPrice: Number(promotionalPrice || 0) }),
      ...(promotionStartDate !== undefined && { promotionStartDate: promotionStartDate || undefined }),
      ...(promotionEndDate !== undefined && { promotionEndDate: promotionEndDate || undefined }),
      ...(priceTiers !== undefined && { priceTiers: normalizePriceTiers(priceTiers) }),
      ...(cost !== undefined && { cost }),
      ...(gstRate !== undefined && { gstRate }),
      ...(cgstRate !== undefined && { cgstRate: Number(cgstRate || 0) }),
      ...(sgstRate !== undefined && { sgstRate: Number(sgstRate || 0) }),
      ...(igstRate !== undefined && { igstRate: Number(igstRate || 0) }),
      ...(taxType !== undefined && { taxType }),
      ...(stock !== undefined && { stock }),
      ...(openingStockValue !== undefined && { openingStockValue: Number(openingStockValue || 0) }),
      ...(stockLedgerAccountId !== undefined && { stockLedgerAccountId: stockLedgerAccountId || undefined }),
      ...(returnStock !== undefined && { returnStock }),
      ...(damagedStock !== undefined && { damagedStock }),
      ...(minStock !== undefined && { minStock }),
      ...(autoReorder !== undefined && { autoReorder: Boolean(autoReorder) }),
      ...(reorderQuantity !== undefined && { reorderQuantity: Number(reorderQuantity || 0) }),
      ...(unit !== undefined && { unit }),
      ...(isActive !== undefined && { isActive }),
      ...(hsnCode !== undefined && { hsnCode }),
      ...(allowNegativeStock !== undefined && { allowNegativeStock: Boolean(allowNegativeStock) }),
      ...(batchTracking !== undefined && { batchTracking: Boolean(batchTracking) }),
      ...(expiryRequired !== undefined && { expiryRequired: Boolean(expiryRequired) }),
      ...(serialNumberTracking !== undefined && { serialNumberTracking: Boolean(serialNumberTracking) }),
      ...(variantSize !== undefined && { variantSize }),
      ...(variantColor !== undefined && { variantColor }),
      ...(variantMatrix !== undefined && { variantMatrix: normalizeVariantMatrix(variantMatrix) }),
      ...(imageUrl !== undefined && { imageUrl }),
    };

    const tenantId = req.tenantId || getCurrentTenantId();
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Tenant context not found',
      });
    }

    if (sku !== undefined) {
      const normalizedSku = String(sku).trim().toUpperCase();
      const existingSku = await Product.findOne({
        _id: { $ne: String(req.params.id) },
        sku: normalizedSku,
        tenantId,
      } as any);
      if (existingSku) {
        return res.status(409).json({
          success: false,
          error: 'Product with this SKU already exists',
        });
      }
      updates.sku = normalizedSku;
    }

    if (barcode !== undefined) {
      const normalizedBarcode = String(barcode || '').trim().toUpperCase();
      if (normalizedBarcode) {
        const existingBarcode = await Product.findOne({
          _id: { $ne: String(req.params.id) },
          barcode: normalizedBarcode,
          tenantId,
        } as any);
        if (existingBarcode) {
          return res.status(409).json({
            success: false,
            error: 'Product with this barcode already exists',
          });
        }
      }
      updates.barcode = normalizedBarcode || undefined;
    }

    if (hsnCode !== undefined) {
      const normalizedHsnCode = normalizeOptionalHsnCode(hsnCode);
      if (normalizedHsnCode) {
        const hsnValidation = validateHsnSacCode(normalizedHsnCode);
        if (!hsnValidation.isValid) {
          return res.status(400).json({
            success: false,
            error: hsnValidation.message,
          });
        }
      }
      updates.hsnCode = normalizedHsnCode;
    }

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      updates,
      { returnDocument: 'after' }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product,
    });
  } catch (error: any) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update product',
    });
  }
});

// Delete product (requires authentication)
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.tenantId || getCurrentTenantId();
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        error: 'Tenant context not found',
      });
    }

    const product = await Product.findOne({ _id: req.params.id, tenantId });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    const before = product.toObject();
    product.isActive = false;
    (product as any).deletedAt = new Date();
    (product as any).deletedBy = req.userId;
    (product as any).deletionReason = String(req.body?.reason || req.query?.reason || 'Product removed from catalog').trim();
    await product.save();

    await writeAuditLog({
      module: 'products',
      action: 'product_soft_deleted',
      entityType: 'product',
      entityId: product._id.toString(),
      referenceNo: product.sku,
      userId: req.userId,
      metadata: {
        reason: (product as any).deletionReason,
      },
      before,
      after: product.toObject(),
    });

    res.status(200).json({
      success: true,
      message: 'Product removed from active catalog',
      data: product,
    });
  } catch (error: any) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete product',
    });
  }
});

export default router;
