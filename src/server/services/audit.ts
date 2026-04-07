import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';

interface AuditPayload {
  storeKey?: string;
  storeName?: string;
  storeGstin?: string;
  module: string;
  action: string;
  entityType: string;
  entityId?: string;
  referenceNo?: string;
  userId?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
  before?: Record<string, any>;
  after?: Record<string, any>;
}

const normalizeForKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export const deriveStoreScope = (
  user?: { _id?: string | { toString: () => string }; businessName?: string; gstin?: string } | null,
  fallbackUserId?: string
): { storeKey: string; storeName?: string; storeGstin?: string } => {
  const gstin = String(user?.gstin || '').trim().toUpperCase();
  const businessName = String(user?.businessName || '').trim();

  if (gstin) {
    return {
      storeKey: `gstin:${gstin}`,
      storeName: businessName || undefined,
      storeGstin: gstin,
    };
  }

  if (businessName) {
    return {
      storeKey: `business:${normalizeForKey(businessName) || 'default'}`,
      storeName: businessName,
    };
  }

  if (fallbackUserId) {
    return { storeKey: `user:${fallbackUserId}` };
  }

  return { storeKey: 'unknown' };
};

export const isAdminAuditViewerRole = (role?: string): boolean => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'super_admin';
};

export const writeAuditLog = async (payload: AuditPayload): Promise<void> => {
  try {
    let scoped = {
      storeKey: payload.storeKey,
      storeName: payload.storeName,
      storeGstin: payload.storeGstin,
    };

    if ((!scoped.storeKey || (!scoped.storeName && !scoped.storeGstin)) && payload.userId) {
      const user = await User.findById(payload.userId).select('businessName gstin');
      const derived = deriveStoreScope(user, payload.userId);
      scoped = {
        storeKey: scoped.storeKey || derived.storeKey,
        storeName: scoped.storeName || derived.storeName,
        storeGstin: scoped.storeGstin || derived.storeGstin,
      };
    }

    if (!scoped.storeKey) {
      scoped = { ...scoped, ...deriveStoreScope(null, payload.userId) };
    }

    const metadataIp = String(payload?.metadata?.ip || payload?.metadata?.ipAddress || '').trim();
    const ipAddress = String(payload.ipAddress || '').trim() || metadataIp || undefined;

    await AuditLog.create({
      ...payload,
      storeKey: scoped.storeKey,
      storeName: scoped.storeName,
      storeGstin: scoped.storeGstin,
      ipAddress,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};
