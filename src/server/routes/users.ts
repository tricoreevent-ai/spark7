import { Router, Response } from 'express';
import { User } from '../models/User.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { hashPassword } from '../utils/auth.js';
import { normalizeRoleName, roleExists } from '../services/rbac.js';

const router = Router();

const sanitizeUser = (user: any) => ({
  _id: user._id.toString(),
  tenantId: user.tenantId,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phoneNumber: user.phoneNumber,
  role: user.role,
  businessName: user.businessName,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const activeAdminCount = async (): Promise<number> =>
  User.countDocuments({ role: 'admin', isActive: true });

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, data: users.map(sanitizeUser) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch users' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      businessName,
      gstin,
      role,
      isActive,
    } = req.body;

    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({
        success: false,
        error: 'email, password, firstName, lastName and role are required',
      });
    }

    const normalizedRole = normalizeRoleName(String(role));
    if (!(await roleExists(normalizedRole))) {
      return res.status(400).json({ success: false, error: `Role "${normalizedRole}" does not exist` });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, error: 'User already exists with this email' });
    }

    const user = await User.create({
      tenantId: req.tenantId,
      email: String(email).toLowerCase().trim(),
      password: await hashPassword(String(password)),
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : undefined,
      businessName: businessName ? String(businessName).trim() : undefined,
      gstin: gstin ? String(gstin).trim().toUpperCase() : undefined,
      role: normalizedRole,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    res.status(201).json({ success: true, data: sanitizeUser(user), message: 'User created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create user' });
  }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates: Record<string, any> = {};
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      businessName,
      gstin,
      role,
      isActive,
    } = req.body;

    if (email !== undefined) updates.email = String(email).toLowerCase().trim();
    if (firstName !== undefined) updates.firstName = String(firstName).trim();
    if (lastName !== undefined) updates.lastName = String(lastName).trim();
    if (phoneNumber !== undefined) updates.phoneNumber = String(phoneNumber).trim();
    if (businessName !== undefined) updates.businessName = String(businessName).trim();
    if (gstin !== undefined) updates.gstin = String(gstin).trim().toUpperCase();
    if (password !== undefined && String(password).trim()) updates.password = await hashPassword(String(password));

    if (role !== undefined) {
      const normalizedRole = normalizeRoleName(String(role));
      if (!(await roleExists(normalizedRole))) {
        return res.status(400).json({ success: false, error: `Role "${normalizedRole}" does not exist` });
      }
      updates.role = normalizedRole;
    }

    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const current = await User.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const changingAdminState =
      current.role === 'admin' &&
      ((updates.role && updates.role !== 'admin') || (updates.isActive !== undefined && updates.isActive === false));

    if (changingAdminState) {
      const adminCount = await activeAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: 'At least one active admin must remain' });
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: sanitizeUser(user), message: 'User updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update user' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (req.userId && target._id.toString() === req.userId) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }

    if (target.role === 'admin' && target.isActive) {
      const adminCount = await activeAdminCount();
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, error: 'At least one active admin must remain' });
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete user' });
  }
});

export default router;
