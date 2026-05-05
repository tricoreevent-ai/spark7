import {
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLES,
  EMPTY_PERMISSIONS,
  FULL_PERMISSIONS,
  PageKey,
  PAGE_KEYS,
  PermissionMatrix,
} from '../../shared/rbac.js';
import { RolePermission } from '../models/RolePermission.js';

const LEGACY_ROLE_MAP: Record<string, string> = {
  user: 'sales',
};

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

export const normalizeRoleName = (role: string): string => {
  const normalized = String(role || '').trim().toLowerCase();
  return LEGACY_ROLE_MAP[normalized] || normalized;
};

const emptyPermissions = (): PermissionMatrix => ({ ...EMPTY_PERMISSIONS });

const mapToObject = (value?: Map<string, boolean> | Record<string, boolean> | null): Record<string, boolean> => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value;
};

export const normalizePermissions = (value?: Map<string, boolean> | Record<string, boolean> | null): PermissionMatrix => {
  const source = mapToObject(value);
  const normalized = emptyPermissions();
  for (const key of PAGE_KEYS) {
    const raw = source[key];
    normalized[key] = typeof raw === 'boolean' ? raw : normalized[key];
  }
  return normalized;
};

const getDefaultPermissionsForRole = (role: string): PermissionMatrix => {
  const normalizedRole = normalizeRoleName(role);
  if (normalizedRole === 'super_admin') {
    return { ...FULL_PERMISSIONS };
  }
  if (hasOwn(DEFAULT_ROLE_PERMISSIONS, normalizedRole)) {
    return { ...(DEFAULT_ROLE_PERMISSIONS as Record<string, PermissionMatrix>)[normalizedRole] };
  }
  return emptyPermissions();
};

const mergeRolePermissionsWithDefaults = (
  role: string,
  value?: Map<string, boolean> | Record<string, boolean> | null
): PermissionMatrix => {
  const defaults = getDefaultPermissionsForRole(role);
  const source = mapToObject(value);
  const merged = { ...defaults };

  for (const key of PAGE_KEYS) {
    if (typeof source[key] === 'boolean') {
      merged[key] = source[key];
    }
  }

  return merged;
};

export const ensureDefaultRolesAndPermissions = async (): Promise<void> => {
  for (const role of DEFAULT_ROLES) {
    const existing = await RolePermission.findOne({ role });
    if (!existing) {
      await RolePermission.create({
        role,
        isSystemRole: true,
        permissions: getDefaultPermissionsForRole(role),
      });
      continue;
    }

    const rawPermissions = mapToObject(existing.permissions as unknown as Map<string, boolean>);
    const normalizedExisting = mergeRolePermissionsWithDefaults(role, rawPermissions);
    const needsUpdate =
      !existing.isSystemRole ||
      PAGE_KEYS.some((key) => typeof rawPermissions[key] !== 'boolean');

    if (needsUpdate) {
      existing.isSystemRole = true;
      existing.permissions = normalizedExisting as unknown as Map<PageKey, boolean>;
      await existing.save();
    }
  }
};

export const getPermissionsForRole = async (role: string): Promise<PermissionMatrix> => {
  const normalizedRole = normalizeRoleName(role);
  if (normalizedRole === 'super_admin') {
    return { ...FULL_PERMISSIONS };
  }
  const roleDoc = await RolePermission.findOne({ role: normalizedRole });

  if (!roleDoc) {
    if (hasOwn(DEFAULT_ROLE_PERMISSIONS, normalizedRole)) {
      return getDefaultPermissionsForRole(normalizedRole);
    }
    return emptyPermissions();
  }

  return mergeRolePermissionsWithDefaults(normalizedRole, roleDoc.permissions as unknown as Map<string, boolean>);
};

export const listRolePermissions = async (): Promise<
  Array<{ role: string; isSystemRole: boolean; permissions: PermissionMatrix }>
> => {
  const docs = await RolePermission.find().sort({ role: 1 });
  return docs.map((doc) => ({
    role: doc.role,
    isSystemRole: doc.isSystemRole,
    permissions: doc.role === 'super_admin'
      ? { ...FULL_PERMISSIONS }
      : mergeRolePermissionsWithDefaults(doc.role, doc.permissions as unknown as Map<string, boolean>),
  }));
};

export const roleExists = async (role: string): Promise<boolean> => {
  const normalizedRole = normalizeRoleName(role);
  if (!normalizedRole) return false;
  return Boolean(await RolePermission.findOne({ role: normalizedRole }).select('_id'));
};

export const createRole = async (
  role: string,
  permissions?: Partial<Record<PageKey, boolean>>
): Promise<{ role: string; isSystemRole: boolean; permissions: PermissionMatrix }> => {
  const normalizedRole = normalizeRoleName(role);
  if (!normalizedRole) {
    throw new Error('Role name is required');
  }

  if (DEFAULT_ROLES.includes(normalizedRole as (typeof DEFAULT_ROLES)[number])) {
    throw new Error('Default role already exists');
  }

  const existing = await RolePermission.findOne({ role: normalizedRole });
  if (existing) {
    throw new Error('Role already exists');
  }

  const mergedPermissions = normalizePermissions(permissions as Record<string, boolean>);
  const created = await RolePermission.create({
    role: normalizedRole,
    isSystemRole: false,
    permissions: mergedPermissions,
  });

  return {
    role: created.role,
    isSystemRole: created.isSystemRole,
    permissions: normalizePermissions(created.permissions as unknown as Map<string, boolean>),
  };
};

export const updateRolePermissions = async (
  role: string,
  permissions: Partial<Record<PageKey, boolean>>
): Promise<{ role: string; isSystemRole: boolean; permissions: PermissionMatrix }> => {
  const normalizedRole = normalizeRoleName(role);
  if (!normalizedRole) {
    throw new Error('Role name is required');
  }

  const mergedPermissions = normalizedRole === 'super_admin'
    ? { ...FULL_PERMISSIONS }
    : normalizePermissions(permissions as Record<string, boolean>);
  const roleDoc = await RolePermission.findOneAndUpdate(
    { role: normalizedRole },
    {
      role: normalizedRole,
      permissions: mergedPermissions,
      isSystemRole: DEFAULT_ROLES.includes(normalizedRole as (typeof DEFAULT_ROLES)[number]),
    },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );

  return {
    role: roleDoc.role,
    isSystemRole: roleDoc.isSystemRole,
    permissions: normalizePermissions(roleDoc.permissions as unknown as Map<string, boolean>),
  };
};

export const deleteRole = async (role: string): Promise<void> => {
  const normalizedRole = normalizeRoleName(role);
  if (!normalizedRole) {
    throw new Error('Role name is required');
  }
  if (DEFAULT_ROLES.includes(normalizedRole as (typeof DEFAULT_ROLES)[number])) {
    throw new Error('Default roles cannot be deleted');
  }
  await RolePermission.findOneAndDelete({ role: normalizedRole });
};

export const canAccessPage = async (role: string, page: PageKey): Promise<boolean> => {
  const permissions = await getPermissionsForRole(role);
  return Boolean(permissions[page]);
};
