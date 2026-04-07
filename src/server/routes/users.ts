import { Router, Response } from 'express';
import { User } from '../models/User.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { hashPassword } from '../utils/auth.js';
import { normalizeRoleName, roleExists } from '../services/rbac.js';
import { writeAuditLog } from '../services/audit.js';
import { writeRecordVersion } from '../services/recordVersion.js';

const router = Router();
const nonDeletedFilter = { isDeleted: { $ne: true } };
const protectedRoles = new Set(['admin', 'super_admin']);

const normalizeEmailAddress = (value: unknown): string => String(value || '').trim().toLowerCase();
const isProtectedRole = (role: unknown): boolean => protectedRoles.has(normalizeRoleName(String(role || '')));

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
  isDeleted: Boolean(user.isDeleted),
  deletedAt: user.deletedAt,
  deletedBy: user.deletedBy,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const activeUserCount = async (): Promise<number> =>
  User.countDocuments({ isActive: true, ...nonDeletedFilter });

const ensureEmailIsAvailable = async (email: string, excludeUserId?: string): Promise<boolean> => {
  const existing = await User.findOne({
    email,
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}),
  }).select('_id');
  return !existing;
};

const getProtectedStatusError = async (args: {
  current: any;
  actorUserId?: string;
  nextIsActive: boolean;
}): Promise<string> => {
  if (args.nextIsActive) {
    return '';
  }

  if (args.actorUserId && args.current._id.toString() === args.actorUserId) {
    return 'You cannot deactivate your own account';
  }

  if (isProtectedRole(args.current.role)) {
    return 'Admin and super admin users cannot be deactivated';
  }

  if (args.current.isActive) {
    const totalActiveUsers = await activeUserCount();
    if (totalActiveUsers <= 1) {
      return 'At least one active user must remain';
    }
  }

  return '';
};

router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await User.find(nonDeletedFilter).sort({ createdAt: -1 });
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
    const normalizedEmail = normalizeEmailAddress(email);
    const nextIsActive = isActive !== undefined ? Boolean(isActive) : true;
    if (!(await roleExists(normalizedRole))) {
      return res.status(400).json({ success: false, error: `Role "${normalizedRole}" does not exist` });
    }

    if (!nextIsActive && isProtectedRole(normalizedRole)) {
      return res.status(400).json({ success: false, error: 'Admin and super admin users must remain active' });
    }

    if (!(await ensureEmailIsAvailable(normalizedEmail))) {
      return res.status(409).json({ success: false, error: 'User already exists with this email' });
    }

    const user = await User.create({
      tenantId: req.tenantId,
      email: normalizedEmail,
      password: await hashPassword(String(password)),
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : undefined,
      businessName: businessName ? String(businessName).trim() : undefined,
      gstin: gstin ? String(gstin).trim().toUpperCase() : undefined,
      role: normalizedRole,
      isActive: nextIsActive,
    });

    const after = sanitizeUser(user);
    await writeAuditLog({
      module: 'users',
      action: 'user_created',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      after,
      metadata: {
        createdRole: after.role,
        userAgent: req.get('user-agent'),
      },
    });

    await writeRecordVersion({
      module: 'users',
      entityType: 'user',
      recordId: user._id.toString(),
      action: 'CREATE',
      changedBy: req.userId,
      dataSnapshot: after,
      metadata: {
        userAgent: req.get('user-agent'),
      },
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

    if (email !== undefined) {
      const normalizedEmail = normalizeEmailAddress(email);
      if (!normalizedEmail) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      updates.email = normalizedEmail;
    }
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

    const current = await User.findOne({ _id: req.params.id, ...nonDeletedFilter });
    if (!current) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const before = sanitizeUser(current);

    if (updates.email && !(await ensureEmailIsAvailable(updates.email, current._id.toString()))) {
      return res.status(409).json({ success: false, error: 'User already exists with this email' });
    }

    const nextIsActive = updates.isActive !== undefined ? Boolean(updates.isActive) : Boolean(current.isActive);
    const statusError = await getProtectedStatusError({
      current,
      actorUserId: req.userId,
      nextIsActive,
    });
    if (statusError) {
      return res.status(400).json({ success: false, error: statusError });
    }

    if (!nextIsActive && updates.role && isProtectedRole(updates.role)) {
      return res.status(400).json({ success: false, error: 'Admin and super admin users must remain active' });
    }

    if (updates.isActive !== undefined && updates.isActive === false && updates.role && normalizeRoleName(String(updates.role)) !== normalizeRoleName(String(current.role))) {
      if (isProtectedRole(current.role)) {
        return res.status(400).json({ success: false, error: 'Admin and super admin users cannot be deactivated' });
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...nonDeletedFilter },
      updates,
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const after = sanitizeUser(user);

    await writeAuditLog({
      module: 'users',
      action: 'user_updated',
      entityType: 'user',
      entityId: user._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      before,
      after,
      metadata: {
        changedFields: Object.keys(updates),
        userAgent: req.get('user-agent'),
      },
    });

    await writeRecordVersion({
      module: 'users',
      entityType: 'user',
      recordId: user._id.toString(),
      action: 'UPDATE',
      changedBy: req.userId,
      dataSnapshot: after,
      metadata: {
        changedFields: Object.keys(updates),
        userAgent: req.get('user-agent'),
      },
    });

    res.json({ success: true, data: sanitizeUser(user), message: 'User updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update user' });
  }
});

router.put('/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (typeof req.body?.isActive !== 'boolean') {
      return res.status(400).json({ success: false, error: 'isActive boolean is required' });
    }

    const current = await User.findOne({ _id: req.params.id, ...nonDeletedFilter });
    if (!current) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const nextIsActive = Boolean(req.body.isActive);
    const statusError = await getProtectedStatusError({
      current,
      actorUserId: req.userId,
      nextIsActive,
    });
    if (statusError) {
      return res.status(400).json({ success: false, error: statusError });
    }

    const before = sanitizeUser(current);
    current.isActive = nextIsActive;
    await current.save();
    const after = sanitizeUser(current);

    await writeAuditLog({
      module: 'users',
      action: nextIsActive ? 'user_activated' : 'user_deactivated',
      entityType: 'user',
      entityId: current._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      before,
      after,
      metadata: {
        userAgent: req.get('user-agent'),
      },
    });

    await writeRecordVersion({
      module: 'users',
      entityType: 'user',
      recordId: current._id.toString(),
      action: 'UPDATE',
      changedBy: req.userId,
      dataSnapshot: after,
      metadata: {
        changedFields: ['isActive'],
        userAgent: req.get('user-agent'),
      },
    });

    res.json({
      success: true,
      data: after,
      message: nextIsActive ? 'User activated successfully' : 'User deactivated successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update user status' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const target = await User.findOne({ _id: req.params.id, ...nonDeletedFilter });
    if (!target) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const before = sanitizeUser(target);

    if (req.userId && target._id.toString() === req.userId) {
      return res.status(400).json({ success: false, error: 'You cannot delete your own account' });
    }

    if (isProtectedRole(target.role)) {
      return res.status(400).json({ success: false, error: 'Admin and super admin users cannot be deleted' });
    }

    if (target.isActive) {
      const totalActiveUsers = await activeUserCount();
      if (totalActiveUsers <= 1) {
        return res.status(400).json({ success: false, error: 'At least one active user must remain' });
      }
    }

    target.isDeleted = true;
    target.deletedAt = new Date();
    target.deletedBy = req.userId;
    target.isActive = false;
    await target.save();

    const after = sanitizeUser(target);

    await writeAuditLog({
      module: 'users',
      action: 'user_soft_deleted',
      entityType: 'user',
      entityId: target._id.toString(),
      userId: req.userId,
      ipAddress: req.ip,
      before,
      after,
      metadata: {
        userAgent: req.get('user-agent'),
      },
    });

    await writeRecordVersion({
      module: 'users',
      entityType: 'user',
      recordId: target._id.toString(),
      action: 'SOFT_DELETE',
      changedBy: req.userId,
      dataSnapshot: after,
      metadata: {
        userAgent: req.get('user-agent'),
      },
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete user' });
  }
});

export default router;
