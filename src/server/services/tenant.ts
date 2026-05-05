import mongoose from 'mongoose';
import { Tenant, ITenantDocument } from '../models/Tenant.js';
import { User } from '../models/User.js';

export const DEFAULT_TENANT_SLUG = 'default';
const DEFAULT_TENANT_NAME = 'Default Business';

export const normalizeTenantSlug = (value: string): string => {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || DEFAULT_TENANT_SLUG;
};

export const deriveTenantName = (businessName?: string, fallbackEmail?: string): string => {
  const trimmed = String(businessName || '').trim();
  if (trimmed) return trimmed;
  const fromEmail = String(fallbackEmail || '').split('@')[0]?.trim();
  if (fromEmail) return fromEmail;
  return DEFAULT_TENANT_NAME;
};

export const ensureDefaultTenant = async (): Promise<ITenantDocument> => {
  const existing = await Tenant.findOne({ slug: DEFAULT_TENANT_SLUG });
  if (existing) return existing;
  return Tenant.create({
    name: DEFAULT_TENANT_NAME,
    slug: DEFAULT_TENANT_SLUG,
    isActive: true,
  });
};

export const resolvePrimaryTenant = async (): Promise<ITenantDocument> => {
  const defaultTenant = await ensureDefaultTenant();

  const dominantUserTenant = await User.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        tenantId: { $type: 'string', $ne: '' },
      },
    },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  const dominantTenantId = normalizeTenantValue(dominantUserTenant?.[0]?._id);
  if (dominantTenantId) {
    const dominantTenant = await Tenant.findOne({ _id: dominantTenantId, isActive: true });
    if (dominantTenant) return dominantTenant;
  }

  const earliestActiveTenant = await Tenant.findOne({ isActive: true }).sort({ createdAt: 1 });
  return earliestActiveTenant || defaultTenant;
};

export const ensureTenantBySlug = async (
  slugInput: string,
  nameHint?: string
): Promise<ITenantDocument> => {
  const slug = normalizeTenantSlug(slugInput);
  const existing = await Tenant.findOne({ slug });
  if (existing) return existing;
  return Tenant.create({
    name: String(nameHint || slug).trim() || DEFAULT_TENANT_NAME,
    slug,
    isActive: true,
  });
};

export const findTenantBySlug = async (slugInput: string): Promise<ITenantDocument | null> => {
  const slug = normalizeTenantSlug(slugInput);
  return Tenant.findOne({ slug, isActive: true });
};

const normalizeTenantValue = (value: unknown): string => String(value || '').trim();

const resolveLegacyBackfillTenantId = async (defaultTenantId: string): Promise<string> => {
  const dominantUserTenant = await User.aggregate([
    { $match: { tenantId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  const dominantTenantId = normalizeTenantValue(dominantUserTenant?.[0]?._id);
  if (dominantTenantId) return dominantTenantId;

  const earliestActiveTenant = await Tenant.findOne({ isActive: true })
    .sort({ createdAt: 1 })
    .select('_id');
  const earliestTenantId = normalizeTenantValue(earliestActiveTenant?._id);
  if (earliestTenantId) return earliestTenantId;

  return defaultTenantId;
};

const ensureTenantOptionalUniqueIndex = async (
  collection: mongoose.mongo.Collection,
  fieldName: string
): Promise<void> => {
  const indexName = `tenantId_1_${fieldName}_1`;
  const expectedKey = { tenantId: 1, [fieldName]: 1 } as Record<string, number>;
  const expectedPartial = { [fieldName]: { $gt: '' } } as Record<string, unknown>;

  const indexes = await collection.indexes();
  const existing = indexes.find((row) => row.name === indexName);
  const alreadyValid = Boolean(
    existing
    && existing.unique === true
    && JSON.stringify(existing.key || {}) === JSON.stringify(expectedKey)
    && JSON.stringify(existing.partialFilterExpression || {}) === JSON.stringify(expectedPartial)
  );
  if (alreadyValid) return;

  if (existing) {
    await collection.dropIndex(indexName);
  }

  await collection.createIndex(expectedKey, {
    name: indexName,
    unique: true,
    partialFilterExpression: expectedPartial,
  });
};

export const ensureUserTenantId = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  const user = await User.findById(userId).select('tenantId businessName email');
  if (!user) return null;

  const currentTenantId = String((user as any).tenantId || '').trim();
  if (currentTenantId) return currentTenantId;

  const tenantName = deriveTenantName(user.businessName, user.email);
  const tenant = await ensureTenantBySlug(tenantName, tenantName);
  (user as any).tenantId = tenant._id.toString();
  if (!user.businessName) {
    user.businessName = tenant.name;
  }
  await user.save();
  return tenant._id.toString();
};

export const backfillLegacyTenantIds = async (): Promise<string> => {
  const defaultTenant = await ensureDefaultTenant();
  const defaultTenantId = defaultTenant._id.toString();
  const targetTenantId = await resolveLegacyBackfillTenantId(defaultTenantId);

  const db = mongoose.connection.db;
  if (!db) return targetTenantId;

  const isDuplicateKeyError = (error: any): boolean =>
    Number(error?.code) === 11000 || String(error?.message || '').includes('E11000');

  const updateManySafely = async (
    collection: mongoose.mongo.Collection,
    filter: Record<string, any>,
    update: any
  ): Promise<{ scanned: number; migrated: number; skipped: number }> => {
    try {
      const result = await collection.updateMany(filter, update);
      return {
        scanned: Number(result.matchedCount || 0),
        migrated: Number(result.modifiedCount || 0),
        skipped: 0,
      };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const cursor = collection.find(filter, { projection: { _id: 1 } });
      const maxDocs = 50_000;
      let scanned = 0;
      let migrated = 0;
      let skipped = 0;

      // Cursor is async iterable in the Mongo driver.
      for await (const doc of cursor as any) {
        if (scanned >= maxDocs) break;
        scanned += 1;

        try {
          const res = await collection.updateOne(
            { $and: [{ _id: doc._id }, filter] } as any,
            update
          );
          migrated += Number(res.modifiedCount || 0);
        } catch (itemError) {
          if (!isDuplicateKeyError(itemError)) throw itemError;
          skipped += 1;
        }
      }

      return { scanned, migrated, skipped };
    }
  };

  const migrateTenantIdSafely = async (
    collection: mongoose.mongo.Collection,
    fromTenantId: string,
    toTenantId: string
  ): Promise<{ scanned: number; migrated: number; skipped: number }> =>
    updateManySafely(collection, { tenantId: fromTenantId }, { $set: { tenantId: toTenantId } });

  const userTenantCounts = await User.aggregate([
    { $match: { tenantId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$tenantId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const userTenantIds = userTenantCounts
    .map((row: any) => normalizeTenantValue(row?._id))
    .filter(Boolean);
  const defaultHasUsers = userTenantIds.includes(defaultTenantId);
  const nonDefaultUserTenantIds = userTenantIds.filter((tenantId) => tenantId !== defaultTenantId);

  // If a previous bootstrap ran before any company/user tenant existed, legacy data may have been moved into the
  // "default" tenant. Once there is exactly one real tenant with users, migrate default-tenant data into it so old
  // products/sales load for the active company.
  const shouldMigrateDefaultTenantData =
    targetTenantId !== defaultTenantId &&
    !defaultHasUsers &&
    nonDefaultUserTenantIds.length === 1 &&
    nonDefaultUserTenantIds[0] === targetTenantId;

  const collectionRows = await db.listCollections({}, { nameOnly: true }).toArray();
  const collections = collectionRows.map((row) => String(row.name || '')).filter(Boolean);

  const excludedCollections = new Set<string>([
    'tenants',
    'rolepermissions',
  ]);

  for (const name of collections) {
    if (excludedCollections.has(name)) continue;
    try {
      const collection = db.collection(name);

      // Clean nullable values on sparse unique fields before tenant reassignment.
      if (name === 'products') {
        await ensureTenantOptionalUniqueIndex(collection, 'barcode');
        await collection.updateMany(
          { $or: [{ barcode: null }, { barcode: '' }, { barcode: /^\s*$/ }] },
          { $unset: { barcode: '' } }
        );
      }
      if (name === 'sales') {
        await ensureTenantOptionalUniqueIndex(collection, 'invoiceNumber');
        await collection.updateMany(
          { $or: [{ invoiceNumber: null }, { invoiceNumber: '' }, { invoiceNumber: /^\s*$/ }] },
          { $unset: { invoiceNumber: '' } }
        );
      }

      // Normalize legacy ObjectId tenant values to string IDs.
      await updateManySafely(
        collection,
        { tenantId: { $type: 'objectId' } } as any,
        [{ $set: { tenantId: { $toString: '$tenantId' } } }] as any
      );

      await updateManySafely(
        collection,
        {
          $or: [
            { tenantId: { $exists: false } },
            { tenantId: null },
            { tenantId: '' },
            { tenantId: /^\s*$/ },
          ],
        },
        { $set: { tenantId: targetTenantId } }
      );

      if (shouldMigrateDefaultTenantData) {
        await migrateTenantIdSafely(collection, defaultTenantId, targetTenantId);
      }
    } catch (error) {
      console.warn(`Tenant backfill warning for ${name}:`, error);
    }
  }

  return targetTenantId;
};
