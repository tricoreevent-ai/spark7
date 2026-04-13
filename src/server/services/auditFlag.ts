import { AuditFlag, type AuditFlagSeverity, type AuditFlagStatus } from '../models/AuditFlag.js';
import { deriveStoreScope } from './audit.js';
import { User } from '../models/User.js';
import { redactSensitiveData } from '../utils/redaction.js';

interface WriteAuditFlagInput {
  storeKey?: string;
  storeName?: string;
  storeGstin?: string;
  module: string;
  flagType: string;
  severity?: AuditFlagSeverity;
  status?: AuditFlagStatus;
  entityType?: string;
  entityId?: string;
  referenceNo?: string;
  message: string;
  dedupeKey?: string;
  metadata?: Record<string, any>;
  detectedBy?: string;
  detectedAt?: Date;
}

const normalizeDedupeKey = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, '_')
    .slice(0, 256);

export const writeAuditFlag = async (input: WriteAuditFlagInput): Promise<void> => {
  try {
    const module = String(input.module || '').trim();
    const flagType = String(input.flagType || '').trim();
    const message = String(input.message || '').trim();
    if (!module || !flagType || !message) return;

    let scoped = {
      storeKey: input.storeKey,
      storeName: input.storeName,
      storeGstin: input.storeGstin,
    };

    if ((!scoped.storeKey || (!scoped.storeName && !scoped.storeGstin)) && input.detectedBy) {
      const user = await User.findById(input.detectedBy).select('businessName gstin');
      const derived = deriveStoreScope(user, input.detectedBy);
      scoped = {
        storeKey: scoped.storeKey || derived.storeKey,
        storeName: scoped.storeName || derived.storeName,
        storeGstin: scoped.storeGstin || derived.storeGstin,
      };
    }

    if (!scoped.storeKey) {
      scoped = { ...scoped, ...deriveStoreScope(null, input.detectedBy) };
    }

    const dedupeKey = input.dedupeKey ? normalizeDedupeKey(input.dedupeKey) : '';

    if (dedupeKey) {
      const existing = await AuditFlag.findOne({ dedupeKey, status: 'open' }).select('_id').lean();
      if (existing) return;
    }

    await AuditFlag.create({
      storeKey: scoped.storeKey,
      storeName: scoped.storeName,
      storeGstin: scoped.storeGstin,
      module,
      flagType,
      severity: input.severity || 'medium',
      status: input.status || 'open',
      entityType: input.entityType,
      entityId: input.entityId,
      referenceNo: input.referenceNo,
      message,
      dedupeKey: dedupeKey || undefined,
      metadata: redactSensitiveData(input.metadata || {}),
      detectedBy: input.detectedBy,
      detectedAt: input.detectedAt || new Date(),
    });
  } catch (error) {
    console.error('Failed to write audit flag:', error);
  }
};

export const writeAuditFlags = async (flags: WriteAuditFlagInput[]): Promise<void> => {
  for (const flag of flags || []) {
    await writeAuditFlag(flag);
  }
};
