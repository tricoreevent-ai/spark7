import { Router, Response } from 'express';
import { Product } from '../models/Product.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getCurrentTenantId } from '../services/tenantContext.js';
import { validateHsnSacCode } from '../services/gstCompliance.js';

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

const normalizeOptionalHsnCode = (value: any): string => String(value || '').trim().replace(/\s+/g, '');

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
      filter.$or = [{ name: regex }, { sku: regex }, { barcode: regex }, { description: regex }];
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
      taxType,
      stock,
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
      taxType: taxType || 'gst',
      stock: stock || 0,
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
      taxType,
      stock,
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
      ...(taxType !== undefined && { taxType }),
      ...(stock !== undefined && { stock }),
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
      { new: true }
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

    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      tenantId,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
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
