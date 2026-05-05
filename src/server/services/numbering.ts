import mongoose from 'mongoose';
import { NumberSequence } from '../models/NumberSequence.js';
import { getCurrentTenantId } from './tenantContext.js';

const safePrefix = (value: string): string =>
  String(value || '')
    .replace(/[^A-Za-z0-9/_-]/g, '')
    .toUpperCase();

const isDuplicateKeyError = (error: unknown): boolean => {
  const row = error as { code?: number; message?: string };
  return Number(row?.code) === 11000 || String(row?.message || '').includes('E11000');
};

const runSequenceIncrement = async (
  filter: Record<string, unknown>,
  session?: mongoose.ClientSession
): Promise<number> => {
  const query = NumberSequence.findOneAndUpdate(
    filter,
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
  );
  const doc = session ? await query.session(session) : await query;
  return Number(doc.value || 0);
};

export const nextSequence = async (key: string, session?: mongoose.ClientSession): Promise<number> => {
  const normalizedKey = String(key).toLowerCase().trim();
  const currentTenantId = getCurrentTenantId();

  try {
    return await runSequenceIncrement({ key: normalizedKey }, session);
  } catch (error) {
    if (!isDuplicateKeyError(error) || !currentTenantId) {
      throw error;
    }

    // Older databases may still have sequence rows created before tenant scoping.
    // Repair a legacy row with empty tenantId and retry under the active tenant.
    const repairQuery = NumberSequence.findOneAndUpdate(
      {
        key: normalizedKey,
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
          { tenantId: /^\s*$/ },
        ],
      },
      { $set: { tenantId: currentTenantId } },
      { sort: { updatedAt: -1 }, returnDocument: 'after' }
    );
    if (session) {
      await repairQuery.session(session);
    } else {
      await repairQuery;
    }

    return runSequenceIncrement({ key: normalizedKey, tenantId: currentTenantId }, session);
  }
};

export const generateNumber = async (
  key: string,
  options: { prefix: string; padTo?: number; datePart?: boolean },
  session?: mongoose.ClientSession
): Promise<string> => {
  const seq = await nextSequence(key, session);
  const padTo = Number(options.padTo || 6);
  const prefix = safePrefix(options.prefix);
  const datePart = options.datePart ? new Date().toISOString().slice(0, 10).replace(/-/g, '') : '';
  const serial = String(seq).padStart(padTo, '0');

  if (datePart) {
    return `${prefix}${datePart}-${serial}`;
  }
  return `${prefix}${serial}`;
};
