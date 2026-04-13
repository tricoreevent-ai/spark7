import { Router, Response } from 'express';
import { Supplier } from '../models/Supplier.js';
import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { validateGstinLocally } from '../services/gstCompliance.js';

const router = Router();

const toNumber = (value: any): number => Number(value || 0);
const normalizeGstin = (value: any): string => String(value || '').trim().toUpperCase();

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      q = '',
      isActive = 'true',
      skip = 0,
      limit = 50,
    } = req.query;

    const filter: any = {};
    if (String(isActive) !== 'all') {
      filter.isActive = String(isActive) === 'true';
    }
    if (String(q || '').trim()) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { supplierCode: regex },
        { name: regex },
        { contactPerson: regex },
        { phone: regex },
        { email: regex },
        { gstin: regex },
      ];
    }

    const parsedSkip = Math.max(0, Number(skip) || 0);
    const parsedLimit = Math.min(200, Math.max(1, Number(limit) || 50));

    const [rows, total] = await Promise.all([
      Supplier.find(filter).sort({ createdAt: -1 }).skip(parsedSkip).limit(parsedLimit),
      Supplier.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: { total, skip: parsedSkip, limit: parsedLimit },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch suppliers' });
  }
});

router.get('/:id/purchase-history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const rows = await PurchaseOrder.find({ supplierId: supplier._id })
      .sort({ createdAt: -1 })
      .populate('supplierId', 'supplierCode name');

    const totalOrders = rows.length;
    const totalSpend = rows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0);

    res.json({
      success: true,
      data: {
        supplier,
        totalOrders,
        totalSpend: Number(totalSpend.toFixed(2)),
        orders: rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch purchase history' });
  }
});

router.get('/:id/performance', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const rows = await PurchaseOrder.find({ supplierId: supplier._id });
    const totalOrders = rows.length;
    const completedOrders = rows.filter((row) => row.status === 'completed').length;
    const pendingOrders = rows.filter((row) => row.status === 'pending' || row.status === 'partially_received').length;
    const returnedOrders = rows.filter((row) => row.status === 'returned').length;
    const totalSpend = rows.reduce((sum, row) => sum + toNumber(row.totalAmount), 0);

    const completedWithEta = rows.filter((row) => row.status === 'completed' && row.expectedDate && row.receivedDate);
    const onTimeOrders = completedWithEta.filter(
      (row) => row.expectedDate && row.receivedDate && new Date(row.receivedDate).getTime() <= new Date(row.expectedDate).getTime()
    ).length;

    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    const returnRate = totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;
    const onTimeRate = completedWithEta.length > 0 ? (onTimeOrders / completedWithEta.length) * 100 : 100;
    const performanceScore = Math.max(0, Math.min(100, (completionRate * 0.45) + (onTimeRate * 0.45) - (returnRate * 0.1)));

    supplier.performanceScore = Number(performanceScore.toFixed(2));
    await supplier.save();

    res.json({
      success: true,
      data: {
        supplierId: supplier._id,
        supplierCode: supplier.supplierCode,
        supplierName: supplier.name,
        totalOrders,
        completedOrders,
        pendingOrders,
        returnedOrders,
        totalSpend: Number(totalSpend.toFixed(2)),
        completionRate: Number(completionRate.toFixed(2)),
        onTimeRate: Number(onTimeRate.toFixed(2)),
        returnRate: Number(returnRate.toFixed(2)),
        performanceScore: supplier.performanceScore,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch supplier performance' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });
    res.json({ success: true, data: supplier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch supplier' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      supplierCode,
      name,
      contactPerson = '',
      phone = '',
      email = '',
      gstin = '',
      address = '',
      notes = '',
      performanceScore = 100,
      isActive = true,
    } = req.body || {};

    if (!String(name || '').trim()) {
      return res.status(400).json({ success: false, error: 'Supplier name is required' });
    }

    const normalizedGstin = normalizeGstin(gstin);
    if (normalizedGstin) {
      const gstValidation = validateGstinLocally(normalizedGstin);
      if (!gstValidation.isValid) {
        return res.status(400).json({ success: false, error: gstValidation.message });
      }
    }

    const finalCode = String(supplierCode || '').trim().toUpperCase()
      || (await generateNumber('supplier', { prefix: 'SUP-', padTo: 5 }));

    const exists = await Supplier.findOne({ supplierCode: finalCode });
    if (exists) return res.status(409).json({ success: false, error: 'Supplier code already exists' });

    const supplier = await Supplier.create({
      supplierCode: finalCode,
      name: String(name).trim(),
      contactPerson: String(contactPerson || '').trim(),
      phone: String(phone || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      gstin: normalizedGstin,
      address: String(address || '').trim(),
      notes: String(notes || '').trim(),
      performanceScore: Math.max(0, Math.min(100, toNumber(performanceScore))),
      isActive: Boolean(isActive),
    });

    await writeAuditLog({
      module: 'inventory',
      action: 'supplier_created',
      entityType: 'supplier',
      entityId: supplier._id.toString(),
      referenceNo: supplier.supplierCode,
      userId: req.userId,
      after: {
        supplierCode: supplier.supplierCode,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        gstin: supplier.gstin,
      },
    });

    res.status(201).json({ success: true, message: 'Supplier created successfully', data: supplier });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create supplier' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });

    const updates: any = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name || '').trim();
    if (req.body.contactPerson !== undefined) updates.contactPerson = String(req.body.contactPerson || '').trim();
    if (req.body.phone !== undefined) updates.phone = String(req.body.phone || '').trim();
    if (req.body.email !== undefined) updates.email = String(req.body.email || '').trim().toLowerCase();
    if (req.body.gstin !== undefined) {
      const normalizedGstin = normalizeGstin(req.body.gstin);
      if (normalizedGstin) {
        const gstValidation = validateGstinLocally(normalizedGstin);
        if (!gstValidation.isValid) {
          return res.status(400).json({ success: false, error: gstValidation.message });
        }
      }
      updates.gstin = normalizedGstin;
    }
    if (req.body.address !== undefined) updates.address = String(req.body.address || '').trim();
    if (req.body.notes !== undefined) updates.notes = String(req.body.notes || '').trim();
    if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive);
    if (req.body.performanceScore !== undefined) {
      updates.performanceScore = Math.max(0, Math.min(100, toNumber(req.body.performanceScore)));
    }

    if (req.body.supplierCode !== undefined) {
      const nextCode = String(req.body.supplierCode || '').trim().toUpperCase();
      if (!nextCode) return res.status(400).json({ success: false, error: 'supplierCode cannot be empty' });
      const codeTaken = await Supplier.findOne({
        _id: { $ne: supplier._id },
        supplierCode: nextCode,
      });
      if (codeTaken) return res.status(409).json({ success: false, error: 'Supplier code already exists' });
      updates.supplierCode = nextCode;
    }

    const updated = await Supplier.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });

    await writeAuditLog({
      module: 'inventory',
      action: 'supplier_updated',
      entityType: 'supplier',
      entityId: supplier._id.toString(),
      referenceNo: updated?.supplierCode,
      userId: req.userId,
      before: {
        supplierCode: supplier.supplierCode,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        gstin: supplier.gstin,
        isActive: supplier.isActive,
      },
      after: {
        supplierCode: updated?.supplierCode,
        name: updated?.name,
        phone: updated?.phone,
        email: updated?.email,
        gstin: updated?.gstin,
        isActive: updated?.isActive,
      },
    });

    res.json({ success: true, message: 'Supplier updated successfully', data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update supplier' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ success: false, error: 'Supplier not found' });

    supplier.isActive = false;
    await supplier.save();

    await writeAuditLog({
      module: 'inventory',
      action: 'supplier_deactivated',
      entityType: 'supplier',
      entityId: supplier._id.toString(),
      referenceNo: supplier.supplierCode,
      userId: req.userId,
      after: { isActive: false },
    });

    res.json({ success: true, message: 'Supplier deactivated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to deactivate supplier' });
  }
});

export default router;
