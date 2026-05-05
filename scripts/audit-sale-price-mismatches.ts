import 'dotenv/config';
import mongoose from 'mongoose';

import '../src/server/models/registerTenantPlugin.ts';

import { Product } from '../src/server/models/Product.ts';
import { Sale } from '../src/server/models/Sale.ts';
import { findTenantBySlug, resolvePrimaryTenant } from '../src/server/services/tenant.ts';
import { runWithTenantContext } from '../src/server/services/tenantContext.ts';

const PRICE_OVERRIDE_TOLERANCE = 0.01;

const readArg = (name: string): string => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
};

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const hasMeaningfulPriceDifference = (unitPrice: number, listPrice: number): boolean =>
  Math.abs(round2(Number(unitPrice || 0) - Number(listPrice || 0))) > PRICE_OVERRIDE_TOLERANCE;
const normalizeText = (value: unknown): string => String(value || '').trim();

const normalizeVariantValue = (value: unknown): string => normalizeText(value).toLowerCase();
const resolveCatalogFallbackPrice = (product: any, item: any): number => {
  const variantSize = normalizeVariantValue(item?.variantSize);
  const variantColor = normalizeVariantValue(item?.variantColor);
  const variantRows = Array.isArray(product?.variantMatrix) ? product.variantMatrix : [];
  const variantMatch = variantRows.find((row: any) => {
    if (row?.isActive === false) return false;
    return normalizeVariantValue(row?.size) === variantSize && normalizeVariantValue(row?.color) === variantColor;
  });
  const variantPrice = Number(variantMatch?.price || 0);
  if (variantPrice > 0) return round2(variantPrice);
  return round2(Number(product?.price || 0));
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
  const invoiceFilter = normalizeText(readArg('invoice'));
  await connectDb();
  const tenantId = await resolveTenantId();

  await runWithTenantContext(tenantId, async () => {
    const filter: Record<string, any> = {};
    if (invoiceFilter) {
      filter.$or = [{ invoiceNumber: invoiceFilter }, { saleNumber: invoiceFilter }];
    }

    const sales = await Sale.find(filter)
      .select('invoiceNumber saleNumber createdAt customerName items')
      .sort({ createdAt: -1 })
      .lean();

    const productIds = Array.from(
      new Set(
        sales.flatMap((sale: any) =>
          Array.isArray(sale.items) ? sale.items.map((item: any) => String(item?.productId || '').trim()).filter(Boolean) : []
        )
      )
    );
    const products = productIds.length
      ? await Product.find({ _id: { $in: productIds } }).select('name price variantMatrix').lean()
      : [];
    const productById = new Map(products.map((product: any) => [String(product._id), product]));

    const rows: Array<Record<string, any>> = [];
    for (const sale of sales) {
      for (const item of Array.isArray((sale as any).items) ? (sale as any).items : []) {
        const savedListPrice = round2(Number(item?.listPrice || 0));
        const unitPrice = round2(Number(item?.unitPrice || 0));
        const product = productById.get(String(item?.productId || ''));
        const currentCatalogPrice = resolveCatalogFallbackPrice(product, item);
        const expectedListPrice = savedListPrice > 0 ? savedListPrice : currentCatalogPrice;
        const differsFromStoredListPrice = hasMeaningfulPriceDifference(unitPrice, expectedListPrice);
        const differsFromCurrentCatalog = currentCatalogPrice > 0 && hasMeaningfulPriceDifference(unitPrice, currentCatalogPrice);
        if (!differsFromStoredListPrice && !differsFromCurrentCatalog) continue;

        rows.push({
          invoiceNumber: String((sale as any).invoiceNumber || (sale as any).saleNumber || ''),
          saleNumber: String((sale as any).saleNumber || ''),
          customerName: String((sale as any).customerName || ''),
          productName: String(item?.productName || ''),
          sku: String(item?.sku || ''),
          unitPrice,
          expectedListPrice,
          currentCatalogPrice,
          priceDifference: round2(unitPrice - expectedListPrice),
          currentCatalogDifference: round2(unitPrice - currentCatalogPrice),
          variant: [item?.variantSize, item?.variantColor].map((part: any) => normalizeText(part)).filter(Boolean).join(' / '),
          invoiceDate: sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt || ''),
          priceSource: differsFromStoredListPrice
            ? (savedListPrice > 0 ? 'invoice_list_price_mismatch' : 'current_catalog_fallback')
            : 'current_catalog_review',
        });
      }
    }

    console.log(`Tenant: ${tenantId}`);
    console.log(`Sales scanned: ${sales.length}`);
    console.log(`Price mismatches found: ${rows.length}`);
    if (!rows.length) return;

    console.table(
      rows.map((row) => ({
        Invoice: row.invoiceNumber,
        Product: row.productName,
        SKU: row.sku,
        Variant: row.variant,
        SavedListPrice: row.expectedListPrice,
        CurrentCatalogPrice: row.currentCatalogPrice,
        InvoicePrice: row.unitPrice,
        StoredDifference: row.priceDifference,
        CurrentCatalogDifference: row.currentCatalogDifference,
        Source: row.priceSource,
      }))
    );
  });
};

main()
  .catch((error) => {
    console.error('audit-sale-price-mismatches failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
