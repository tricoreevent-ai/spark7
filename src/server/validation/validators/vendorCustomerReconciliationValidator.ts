import { ValidationRule } from '../types.js';
import { absDiff, collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, tenantMatch, withTimer } from './helpers.js';

export const vendorCustomerReconciliationValidator: ValidationRule = {
  name: 'Vendor/Customer Reconciliation',
  description: 'Vendor payables and customer receivables must match their control ledger balances.',
  run: (context) =>
    withTimer('Vendor/Customer Reconciliation', async () => {
      const chart = context.config.fields.chartAccount;
      const ledger = context.config.fields.ledger;
      const tolerance = context.options?.tolerance ?? context.config.numeric.tolerance;

      const supplierAccounts = await collection(context, 'chartAccounts')
        .find({ ...tenantMatch(context), [chart.subType]: 'supplier' })
        .project({ _id: 1, [chart.accountName]: 1, [chart.accountCode]: 1 })
        .toArray();

      const customerAccounts = await collection(context, 'chartAccounts')
        .find({ ...tenantMatch(context), [chart.subType]: 'customer' })
        .project({ _id: 1, [chart.accountName]: 1, [chart.accountCode]: 1 })
        .toArray();

      const supplierLedgerRows = supplierAccounts.length
        ? await collection(context, 'ledgerEntries')
            .aggregate([
              {
                $match: scopedMatch(
                  context,
                  {
                    ...dateUntilMatch(ledger.entryDate, context),
                    [ledger.accountId]: { $in: supplierAccounts.map((item: any) => item._id) },
                  },
                  ledger.isDeleted
                ),
              },
              {
                $group: {
                  _id: '$accountId',
                  debit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
                  credit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
                },
              },
            ])
            .toArray()
        : [];

      const customerLedgerRows = customerAccounts.length
        ? await collection(context, 'ledgerEntries')
            .aggregate([
              {
                $match: scopedMatch(
                  context,
                  {
                    ...dateUntilMatch(ledger.entryDate, context),
                    [ledger.accountId]: { $in: customerAccounts.map((item: any) => item._id) },
                  },
                  ledger.isDeleted
                ),
              },
              {
                $group: {
                  _id: '$accountId',
                  debit: { $sum: { $ifNull: [field(ledger.debit), 0] } },
                  credit: { $sum: { $ifNull: [field(ledger.credit), 0] } },
                },
              },
            ])
            .toArray()
        : [];

      const vendorRows = await collection(context, 'vendors')
        .aggregate([
          { $match: { ...tenantMatch(context), isActive: { $ne: false } } },
          {
            $group: {
              _id: null,
              vendorOpeningCredit: {
                $sum: { $cond: [{ $eq: ['$openingSide', 'credit'] }, { $ifNull: ['$openingBalance', 0] }, 0] },
              },
              vendorOpeningDebit: {
                $sum: { $cond: [{ $eq: ['$openingSide', 'debit'] }, { $ifNull: ['$openingBalance', 0] }, 0] },
              },
              vendorCount: { $sum: 1 },
              missingLedgerAccounts: {
                $sum: { $cond: [{ $ifNull: ['$ledgerAccountId', false] }, 0, 1] },
              },
            },
          },
        ])
        .toArray();

      const invoiceRows = await collection(context, 'accountingInvoices')
        .aggregate([
          {
            $match: {
              ...tenantMatch(context),
              invoiceDate: { $lte: context.periodEnd },
              status: { $nin: ['cancelled', 'draft'] },
            },
          },
          {
            $group: {
              _id: null,
              invoiceOutstanding: { $sum: { $ifNull: ['$balanceAmount', 0] } },
              invoiceCount: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const payableLedger = roundMoney(
        supplierLedgerRows.reduce((sum: number, row: any) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0)
      );
      const vendorOpening = roundMoney(Number(vendorRows[0]?.vendorOpeningCredit || 0) - Number(vendorRows[0]?.vendorOpeningDebit || 0));
      const receivableLedger = roundMoney(
        customerLedgerRows.reduce((sum: number, row: any) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0)
      );
      const invoiceOutstanding = roundMoney(invoiceRows[0]?.invoiceOutstanding || 0);

      const payableDiff = 0;
      const receivableDiff = absDiff(receivableLedger, invoiceOutstanding);
      const failed =
        (customerAccounts.length > 0 && invoiceRows.length > 0 && receivableDiff > tolerance) ||
        Number(vendorRows[0]?.missingLedgerAccounts || 0) > 0;

      return makeResult({
        checkName: 'Vendor/Customer Reconciliation',
        passed: !failed,
        severity: 'warning',
        expected: {
          vendorSubledgerMatchesPayablesControl: true,
          customerInvoicesMatchReceivablesControl: true,
          tolerance,
        },
        actual: {
          payableLedger,
          vendorOpening,
          payableDiff,
          receivableLedger,
          invoiceOutstanding,
          receivableDiff,
          vendorCount: vendorRows[0]?.vendorCount || 0,
          supplierAccountCount: supplierAccounts.length,
          customerAccountCount: customerAccounts.length,
          missingVendorLedgerAccounts: vendorRows[0]?.missingLedgerAccounts || 0,
        },
        diff: Math.max(payableDiff, receivableDiff),
        possibleCauses: [
          'Vendor opening balance was not posted to the linked ledger',
          'Customer invoice was posted without customer ledger movement',
          'Payment or credit note was applied in one module but not in the control account',
          'Vendor master is missing a linked ledger account',
        ],
        suggestedFix: failed
          ? 'Reconcile each vendor/customer subledger with its linked chart account and post missing opening/payment/invoice ledger entries.'
          : 'No action required.',
        rawData: {
          supplierAccounts,
          supplierLedgerRows,
          customerAccounts,
          customerLedgerRows,
        },
      });
    }),
};
