import 'dotenv/config';
import mongoose from 'mongoose';

import '../src/server/models/registerTenantPlugin.ts';

import { AccountingInvoice } from '../src/server/models/AccountingInvoice.ts';
import { Sale } from '../src/server/models/Sale.ts';
import { User } from '../src/server/models/User.ts';
import { buildSaleAccountingPlan, syncPostedSaleToAccounting } from '../src/server/services/salesLedger.ts';
import { findTenantBySlug, resolvePrimaryTenant } from '../src/server/services/tenant.ts';
import { runWithTenantContext } from '../src/server/services/tenantContext.ts';

const readArg = (name: string): string => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
};

const normalizeText = (value: unknown): string => String(value || '').trim();
const normalizeBoolean = (value: string): boolean => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());

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

const resolveOperatorId = async (tenantId: string): Promise<string | undefined> => {
  const explicit = normalizeText(readArg('created-by'));
  if (explicit) return explicit;
  const admin = await User.findOne({
    tenantId,
    role: { $in: ['admin', 'super_admin', 'manager'] },
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: 1 })
    .select('_id')
    .lean();
  return admin?._id ? String(admin._id) : undefined;
};

const main = async () => {
  const invoiceArg = normalizeText(readArg('invoice'));
  const saleIdArg = normalizeText(readArg('sale-id'));
  const dryRun = normalizeBoolean(readArg('dry-run'));
  if (!invoiceArg && !saleIdArg) {
    throw new Error('Provide --invoice=<invoice number> or --sale-id=<sale id>.');
  }

  await connectDb();
  const tenantId = await resolveTenantId();
  const operatorId = await resolveOperatorId(tenantId);

  await runWithTenantContext(tenantId, async () => {
    const sale = await Sale.findOne(
      saleIdArg
        ? { _id: saleIdArg }
        : { $or: [{ invoiceNumber: invoiceArg }, { saleNumber: invoiceArg }] }
    );
    if (!sale) {
      throw new Error(`Sale not found for ${saleIdArg ? `sale id ${saleIdArg}` : `invoice ${invoiceArg}`}`);
    }

    const existingAccountingInvoice = await AccountingInvoice.findOne({
      referenceType: 'sale',
      referenceId: sale._id.toString(),
      status: { $ne: 'cancelled' },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (sale.migratedToLedger && !existingAccountingInvoice) {
      throw new Error(
        `Sale ${sale.invoiceNumber || sale.saleNumber} is already flagged migratedToLedger but has no linked accounting invoice. Review before rerunning.`
      );
    }

    if (existingAccountingInvoice) {
      if (!dryRun) {
        sale.migratedToLedger = true;
        sale.migratedToLedgerAt = sale.migratedToLedgerAt || new Date();
        sale.migratedToLedgerBy = sale.migratedToLedgerBy || operatorId;
        sale.migratedLedgerInvoiceId = String(existingAccountingInvoice._id);
        sale.migratedLedgerInvoiceNumber = String(existingAccountingInvoice.invoiceNumber || '');
        await sale.save();
      }

      console.log(
        JSON.stringify(
          {
            tenantId,
            status: 'already_migrated',
            saleId: sale._id.toString(),
            invoiceNumber: sale.invoiceNumber || sale.saleNumber,
            accountingInvoiceId: String(existingAccountingInvoice._id),
            accountingInvoiceNumber: existingAccountingInvoice.invoiceNumber,
            dryRun,
          },
          null,
          2
        )
      );
      return;
    }

    const plan = await buildSaleAccountingPlan(sale);

    const migrationPlan = {
      tenantId,
      saleId: sale._id.toString(),
      invoiceNumber: sale.invoiceNumber || sale.saleNumber,
      accountingInvoiceNumber: plan.accountingInvoiceNumber,
      customerName: plan.customerName,
      baseAmount: plan.baseAmount,
      discountAmount: plan.discountAmount,
      gstAmount: plan.gstAmount,
      totalAmount: plan.totalAmount,
      paidAmount: plan.paidAmount,
      outstandingAmount: plan.outstandingAmount,
      gstTreatment: plan.gstTreatment,
      paymentMode: plan.paymentMethod,
      paymentSplits: plan.paymentSplits,
      operatorId,
      dryRun,
    };

    if (dryRun) {
      console.log(JSON.stringify({ status: 'dry_run', ...migrationPlan }, null, 2));
      return;
    }

    const result = await syncPostedSaleToAccounting(sale, { userId: operatorId, markMigrated: true });

    console.log(
      JSON.stringify(
        {
          status: 'migrated',
          ...migrationPlan,
          accountingInvoiceId: result.invoice._id.toString(),
          accountingInvoiceNumber: result.invoice.invoiceNumber,
          accountingInvoiceStatus: result.invoice.status,
          journalEntryId: result.invoice.journalEntryId?.toString?.(),
        },
        null,
        2
      )
    );
  });
};

main()
  .catch((error) => {
    console.error('migrate-legacy-pos-sale-ledger failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
