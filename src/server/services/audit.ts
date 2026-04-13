import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { redactSensitiveData } from '../utils/redaction.js';

interface AuditPayload {
  session?: mongoose.ClientSession;
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

const PRIVATE_IPV4_BLOCKS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
] as const;

const normalizeForKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export const normalizeIpAddress = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const firstHop = raw
    .split(',')
    .map((part) => part.trim())
    .find(Boolean) || '';

  if (!firstHop) return '';

  const cleaned = firstHop.replace(/^\[|\]$/g, '');
  if (cleaned === '::1') return '127.0.0.1';
  if (cleaned.startsWith('::ffff:')) return cleaned.slice(7);
  return cleaned;
};

export const describeIpAddress = (value: unknown): string => {
  const normalized = normalizeIpAddress(value);
  if (!normalized) return 'Not available';
  if (normalized === '127.0.0.1' || normalized === 'localhost') {
    return 'Local device (127.0.0.1)';
  }
  if (PRIVATE_IPV4_BLOCKS.some((pattern) => pattern.test(normalized))) {
    return `Private network (${normalized})`;
  }
  return normalized;
};

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
    const { session, ...auditPayload } = payload;
    let scoped = {
      storeKey: auditPayload.storeKey,
      storeName: auditPayload.storeName,
      storeGstin: auditPayload.storeGstin,
    };

    if ((!scoped.storeKey || (!scoped.storeName && !scoped.storeGstin)) && auditPayload.userId) {
      const userQuery = User.findById(auditPayload.userId).select('businessName gstin');
      const user = session ? await userQuery.session(session) : await userQuery;
      const derived = deriveStoreScope(user, auditPayload.userId);
      scoped = {
        storeKey: scoped.storeKey || derived.storeKey,
        storeName: scoped.storeName || derived.storeName,
        storeGstin: scoped.storeGstin || derived.storeGstin,
      };
    }

    if (!scoped.storeKey) {
      scoped = { ...scoped, ...deriveStoreScope(null, auditPayload.userId) };
    }

    const metadataIp = normalizeIpAddress(auditPayload?.metadata?.ip || auditPayload?.metadata?.ipAddress);
    const ipAddress = normalizeIpAddress(auditPayload.ipAddress) || metadataIp || undefined;

    const document = {
      ...auditPayload,
      storeKey: scoped.storeKey,
      storeName: scoped.storeName,
      storeGstin: scoped.storeGstin,
      ipAddress,
      metadata: redactSensitiveData(payload.metadata || {}),
      before: redactSensitiveData(payload.before || {}),
      after: redactSensitiveData(payload.after || {}),
    };

    if (session) {
      await AuditLog.create([document], { session });
      return;
    }

    await AuditLog.create(document);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};
