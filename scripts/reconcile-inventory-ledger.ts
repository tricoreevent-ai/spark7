import 'dotenv/config';
import mongoose from 'mongoose';

import '../src/server/models/registerTenantPlugin.ts';

import { buildInventoryLedgerSnapshot, reconcileInventoryLedger } from '../src/server/services/inventoryLedger.ts';
import { findTenantBySlug, resolvePrimaryTenant } from '../src/server/services/tenant.ts';
import { runWithTenantContext } from '../src/server/services/tenantContext.ts';

const readArg = (name: string): string => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
};

const normalizeBoolean = (value: string): boolean => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const parseAsOnDateArg = (value: string): Date => {
  const trimmed = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999);
  }
  return new Date(trimmed);
};

const connectDb = async () => {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 10000 });
  }
};

const resolveTenantId = async (): Promise<string> => {
  const tenantSlug = readArg('tenant-slug');
  const tenantId = readArg('tenant-id');
  if (tenantId) return tenantId;
  if (tenantSlug) {
    const tenant = await findTenantBySlug(tenantSlug);
    if (!tenant) throw new Error(`Tenant not found for slug "${tenantSlug}"`);
    return tenant._id.toString();
  }
  const tenant = await resolvePrimaryTenant();
  return tenant._id.toString();
};

const main = async () => {
  const dryRun = normalizeBoolean(readArg('dry-run'));
  const asOnDate = readArg('as-on-date') ? parseAsOnDateArg(readArg('as-on-date')) : new Date();
  const createdBy = readArg('created-by') || undefined;

  await connectDb();
  const tenantId = await resolveTenantId();
  await runWithTenantContext(tenantId, async () => {
    if (dryRun) {
      const preview = await buildInventoryLedgerSnapshot(asOnDate);
      console.log(JSON.stringify({ tenantId, dryRun: true, posted: false, snapshot: preview }, null, 2));
      return;
    }

    const result = await reconcileInventoryLedger({
      asOnDate,
      createdBy,
      referenceNo: `INV-RECON-${asOnDate.toISOString().slice(0, 10)}`,
    });
    console.log(JSON.stringify({ tenantId, dryRun: false, ...result }, null, 2));
  });
};

main()
  .catch((error) => {
    console.error('reconcile-inventory-ledger failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
