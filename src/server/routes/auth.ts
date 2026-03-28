import { Router, Response } from 'express';
import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { hashPassword, comparePassword, generateToken } from '../utils/auth.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { AuthResponse, ErrorResponse, ThemeMode, UiPreferences } from '@shared/types';
import { canAccessPage, getPermissionsForRole, normalizeRoleName, roleExists } from '../services/rbac.js';
import { writeAuditLog } from '../services/audit.js';
import { deriveTenantName, ensureTenantBySlug, ensureUserTenantId, findTenantBySlug, normalizeTenantSlug } from '../services/tenant.js';
import { initializeTenantDefaults } from '../services/databaseBootstrap.js';

const router = Router();
const DEFAULT_THEME_MODE: ThemeMode = 'dark';
const FONT_SCALE_MIN = 0.9;
const FONT_SCALE_MAX = 1.25;
const ENABLE_COMPANY_CREATION_SCREEN = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ENABLE_COMPANY_CREATION_SCREEN || '').trim().toLowerCase()
);
const COMPANY_CREATION_ACCESS_KEY = String(process.env.COMPANY_CREATION_ACCESS_KEY || '').trim();

const normalizeThemeMode = (value: unknown): ThemeMode => {
  return value === 'light' ? 'light' : DEFAULT_THEME_MODE;
};

const normalizeFontScale = (value: unknown): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, num));
};

const normalizeUiPreferences = (value: unknown): Required<UiPreferences> => {
  const source = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
  return {
    themeMode: normalizeThemeMode(source.themeMode),
    fontScale: normalizeFontScale(source.fontScale),
  };
};

const buildAuthUserResponse = async (user: any) => {
  const permissions = await getPermissionsForRole(user.role);
  return {
    _id: user._id.toString(),
    tenantId: user.tenantId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    businessName: user.businessName,
    gstin: user.gstin,
    permissions,
    uiPreferences: normalizeUiPreferences(user.uiPreferences),
  };
};

router.get('/company-creation/config', async (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    success: true,
    enabled: ENABLE_COMPANY_CREATION_SCREEN,
    requiresAccessKey: Boolean(COMPANY_CREATION_ACCESS_KEY),
  });
});

router.post('/company-creation', authMiddleware, async (req: AuthenticatedRequest, res: Response<AuthResponse | ErrorResponse>) => {
  try {
    if (!ENABLE_COMPANY_CREATION_SCREEN) {
      return res.status(403).json({
        success: false,
        error: 'Company creation is disabled by server configuration',
      });
    }

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const actor = await User.findById(req.userId).select('role isActive');
    if (!actor || !actor.isActive) {
      return res.status(403).json({
        success: false,
        error: 'User is inactive or not found',
      });
    }

    const canManageSettings = await canAccessPage(String(actor.role || ''), 'settings');
    if (!canManageSettings) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to create companies',
      });
    }

    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      businessName,
      gstin,
      tenantSlug,
      accessKey,
    } = req.body;

    if (COMPANY_CREATION_ACCESS_KEY && String(accessKey || '').trim() !== COMPANY_CREATION_ACCESS_KEY) {
      return res.status(403).json({
        success: false,
        error: 'Invalid company creation access key',
      });
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedBusinessName = String(businessName || '').trim();

    if (!normalizedEmail || !password || !firstName || !lastName || !normalizedBusinessName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: businessName, firstName, lastName, email, password',
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists with this email',
      });
    }

    const desiredTenantName = deriveTenantName(normalizedBusinessName, normalizedEmail);
    const desiredTenantSlug = normalizeTenantSlug(String(tenantSlug || desiredTenantName));
    let tenant = await findTenantBySlug(desiredTenantSlug);
    if (tenant) {
      const tenantUserExists = await User.exists({ tenantId: tenant._id.toString() });
      if (tenantUserExists) {
        return res.status(409).json({
          success: false,
          error: `Tenant "${tenant.slug}" already exists`,
        });
      }
    } else {
      tenant = await ensureTenantBySlug(desiredTenantSlug, desiredTenantName);
    }

    if (!tenant.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Tenant is inactive',
      });
    }

    await initializeTenantDefaults(tenant._id.toString());

    const hashedPassword = await hashPassword(password);
    const normalizedRole = normalizeRoleName('admin');
    if (!(await roleExists(normalizedRole))) {
      return res.status(500).json({
        success: false,
        error: `Default role "${normalizedRole}" is not configured`,
      });
    }

    const user = new User({
      tenantId: tenant._id.toString(),
      email: normalizedEmail,
      password: hashedPassword,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : undefined,
      businessName: normalizedBusinessName || tenant.name,
      gstin: gstin ? String(gstin).trim().toUpperCase() : undefined,
      role: normalizedRole,
    });
    await user.save();

    const token = generateToken(user._id.toString(), tenant._id.toString());

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      token,
      tenant: {
        _id: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
      },
      user: await buildAuthUserResponse(user),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create company',
    });
  }
});

// Register endpoint
router.post('/register', async (req: AuthenticatedRequest, res: Response<AuthResponse | ErrorResponse>) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phoneNumber,
      businessName,
      gstin,
      tenantSlug,
    } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedBusinessName = String(businessName || '').trim();

    // Validation
    if (!normalizedEmail || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, firstName, lastName',
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists with this email',
      });
    }

    const desiredTenantName = deriveTenantName(normalizedBusinessName, normalizedEmail);
    const desiredTenantSlug = normalizeTenantSlug(String(tenantSlug || desiredTenantName));

    let tenant = await findTenantBySlug(desiredTenantSlug);
    if (tenant) {
      const tenantUserExists = await User.exists({ tenantId: tenant._id.toString() });
      if (tenantUserExists) {
        return res.status(409).json({
          success: false,
          error: `Tenant "${tenant.slug}" already exists. Please login or contact your administrator.`,
        });
      }
    } else {
      tenant = await ensureTenantBySlug(desiredTenantSlug, desiredTenantName);
    }

    if (!tenant.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Tenant is inactive',
      });
    }
    await initializeTenantDefaults(tenant._id.toString());

    // Hash password
    const hashedPassword = await hashPassword(password);

    const usersCount = await User.countDocuments({ tenantId: tenant._id.toString() });
    const defaultRole = usersCount === 0 ? 'admin' : 'receptionist';
    const normalizedRole = normalizeRoleName(defaultRole);
    if (!(await roleExists(normalizedRole))) {
      return res.status(500).json({
        success: false,
        error: `Default role "${normalizedRole}" is not configured`,
      });
    }

    // Create user
    const user = new User({
      tenantId: tenant._id.toString(),
      email: normalizedEmail,
      password: hashedPassword,
      firstName,
      lastName,
      phoneNumber,
      businessName: normalizedBusinessName || tenant.name,
      gstin,
      role: normalizedRole,
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id!.toString(), tenant._id.toString());

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      tenant: {
        _id: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
      },
      user: await buildAuthUserResponse(user),
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Registration failed',
    });
  }
});

// Login endpoint
router.post('/login', async (req: AuthenticatedRequest, res: Response<AuthResponse | ErrorResponse>) => {
  try {
    const { email, password, tenantSlug } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const requestedTenantSlug = String(tenantSlug || '').trim();
    const normalizedRequestedTenantSlug = requestedTenantSlug
      ? normalizeTenantSlug(requestedTenantSlug)
      : '';

    // Validation
    if (!normalizedEmail || !password) {
      console.warn('[auth] Login failed: missing credentials', {
        email: normalizedEmail || undefined,
        tenantSlug: normalizedRequestedTenantSlug || undefined,
      });
      await writeAuditLog({
        module: 'auth',
        action: 'login_failed',
        entityType: 'session',
        metadata: {
          email: normalizedEmail || undefined,
          reason: 'missing_credentials',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    let tenantFilterId: string | undefined;
    if (requestedTenantSlug) {
      const scopedTenant = await findTenantBySlug(requestedTenantSlug);
      if (scopedTenant) {
        tenantFilterId = scopedTenant._id.toString();
      }
    }

    // Find user with password field
    const userQuery: Record<string, unknown> = { email: normalizedEmail };
    if (tenantFilterId) {
      userQuery.tenantId = tenantFilterId;
    }
    const user = await User.findOne(userQuery).select('+password');
    if (!user) {
      console.warn('[auth] Login failed: user not found', {
        email: normalizedEmail,
        tenantSlug: normalizedRequestedTenantSlug || undefined,
      });
      await writeAuditLog({
        module: 'auth',
        action: 'login_failed',
        entityType: 'session',
        metadata: {
          email: normalizedEmail,
          reason: 'user_not_found',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Compare password
    const hashedPassword = String(user.password || '');
    const isValidPassword = await comparePassword(password, hashedPassword);
    if (!isValidPassword) {
      console.warn('[auth] Login failed: invalid password', {
        email: normalizedEmail,
        tenantSlug: normalizedRequestedTenantSlug || undefined,
      });
      await writeAuditLog({
        module: 'auth',
        action: 'login_failed',
        entityType: 'session',
        userId: user._id.toString(),
        metadata: {
          email: normalizedEmail,
          reason: 'invalid_password',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      console.warn('[auth] Login failed: inactive user', {
        email: normalizedEmail,
        tenantSlug: normalizedRequestedTenantSlug || undefined,
      });
      await writeAuditLog({
        module: 'auth',
        action: 'login_failed',
        entityType: 'session',
        userId: user._id.toString(),
        metadata: {
          email: normalizedEmail,
          reason: 'inactive_user',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        },
      });
      return res.status(403).json({
        success: false,
        error: 'User account is inactive',
      });
    }

    const resolvedTenantId = String((user as any).tenantId || '').trim() || await ensureUserTenantId(user._id.toString()) || '';
    if (!resolvedTenantId) {
      console.warn('[auth] Login failed: user tenant missing', {
        email: normalizedEmail,
        tenantSlug: normalizedRequestedTenantSlug || undefined,
      });
      return res.status(403).json({
        success: false,
        error: 'User tenant is not configured',
      });
    }
    const tenant = await Tenant.findById(resolvedTenantId).select('_id name slug isActive');
    if (!tenant || !tenant.isActive) {
      console.warn('[auth] Login failed: tenant inactive or missing', {
        email: normalizedEmail,
        tenantId: resolvedTenantId,
        tenantSlug: normalizedRequestedTenantSlug || undefined,
      });
      return res.status(403).json({
        success: false,
        error: 'Tenant account is inactive',
      });
    }

    if (normalizedRequestedTenantSlug) {
      const tenantSlugMatches = normalizeTenantSlug(tenant.slug) === normalizedRequestedTenantSlug;
      const businessSlugMatches = normalizeTenantSlug(user.businessName || tenant.name || '') === normalizedRequestedTenantSlug;
      let allowLegacyBootstrapByBusiness = false;

      if (!tenantSlugMatches && !businessSlugMatches) {
        const activeTenantCount = await Tenant.countDocuments({ isActive: true });
        const legacyDefaultTenant = normalizeTenantSlug(tenant.slug) === 'default';

        if (activeTenantCount === 1 && legacyDefaultTenant) {
          const tenantUsers = await User.find({ tenantId: tenant._id.toString() }).select('businessName');
          allowLegacyBootstrapByBusiness = tenantUsers.some(
            (row) => normalizeTenantSlug(String(row.businessName || '')) === normalizedRequestedTenantSlug
          );
        }
      }

      if (!tenantSlugMatches && !businessSlugMatches && !allowLegacyBootstrapByBusiness) {
        console.warn('[auth] Login failed: tenant mismatch', {
          email: normalizedEmail,
          requestedTenantSlug: normalizedRequestedTenantSlug,
          tenantSlug: tenant.slug,
        });
        return res.status(401).json({
          success: false,
          error: 'Invalid tenant or credentials',
        });
      }

      // Legacy migration path: if tenant slug is old/default but business slug is requested, align slug.
      if (!tenantSlugMatches && (businessSlugMatches || allowLegacyBootstrapByBusiness)) {
        const conflict = await Tenant.findOne({ slug: normalizedRequestedTenantSlug, _id: { $ne: tenant._id } }).select('_id');
        if (!conflict) {
          tenant.slug = normalizedRequestedTenantSlug;
          if (!tenant.name || tenant.name.toLowerCase() === 'default business') {
            tenant.name = user.businessName || tenant.name;
          }
          await tenant.save();
        }
      }
    }

    // Generate token
    const token = generateToken(user._id!.toString(), resolvedTenantId);
    await writeAuditLog({
      module: 'auth',
      action: 'login',
      entityType: 'session',
      userId: user._id.toString(),
      metadata: {
        email: normalizedEmail,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      tenant: {
        _id: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
      },
      user: await buildAuthUserResponse(user),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Login failed',
    });
  }
});

router.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const user = userId ? await User.findById(userId) : null;

    await writeAuditLog({
      module: 'auth',
      action: 'logout',
      entityType: 'session',
      userId: userId || undefined,
      metadata: {
        email: user?.email,
        ip: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    res.status(200).json({ success: true, message: 'Logout successful' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Logout failed' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const tenantId = String((user as any).tenantId || req.tenantId || '');
    const tenant = tenantId
      ? await Tenant.findById(tenantId).select('_id name slug isActive')
      : null;

    res.status(200).json({
      success: true,
      message: 'User retrieved successfully',
      tenant: tenant ? {
        _id: tenant._id.toString(),
        name: tenant.name,
        slug: tenant.slug,
        isActive: tenant.isActive,
      } : undefined,
      user: await buildAuthUserResponse(user),
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user',
    });
  }
});

router.get('/preferences', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.userId).select('uiPreferences');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const uiPreferences = normalizeUiPreferences(user.uiPreferences);
    res.status(200).json({ success: true, uiPreferences });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load preferences' });
  }
});

router.put('/preferences', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uiPreferences = normalizeUiPreferences(req.body);
    const user = await User.findByIdAndUpdate(
      req.userId,
      { uiPreferences },
      { new: true }
    ).select('uiPreferences');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await writeAuditLog({
      module: 'auth',
      action: 'preferences_updated',
      entityType: 'user_preferences',
      userId: req.userId,
      metadata: {
        themeMode: uiPreferences.themeMode,
        fontScale: uiPreferences.fontScale,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      uiPreferences: normalizeUiPreferences(user.uiPreferences),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update preferences' });
  }
});

// Update profile
router.put('/profile', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { firstName, lastName, phoneNumber, businessName, gstin, address } = req.body;

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(phoneNumber && { phoneNumber }),
        ...(businessName && { businessName }),
        ...(gstin && { gstin }),
        ...(address && { address }),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        businessName: user.businessName,
        gstin: user.gstin,
        uiPreferences: normalizeUiPreferences(user.uiPreferences),
      },
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update profile',
    });
  }
});

export default router;
