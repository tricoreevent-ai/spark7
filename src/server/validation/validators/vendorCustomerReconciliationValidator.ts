import { ValidationRule } from '../types.js';
import { absDiff, collection, dateUntilMatch, field, makeResult, roundMoney, scopedMatch, tenantMatch, withTimer } from './helpers.js';

const toIdText = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'object' && value !== null && '$oid' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).$oid || '').trim();
  }
  return String(value || '').trim();
};

const toDate = (value: unknown): Date | null => {
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const buildAccountsPayableReconciliationSnapshot = (input: {
  payableControlDirectBalance?: number;
  vendorSubLedgerTotal?: number;
  purchaseBills?: Array<{
    _id?: unknown;
    billNumber?: string;
    billDate?: Date | string;
    supplierId?: unknown;
    supplierName?: string;
    totalAmount?: number;
  }>;
  payments?: Array<{
    _id?: unknown;
    linkedBillId?: unknown;
    linkedBillNumber?: string;
    amount?: number;
  }>;
  mappedSupplierCount?: number;
  supplierCount?: number;
  tolerance?: number;
}) => {
  const tolerance = Number(input.tolerance ?? 0.01);
  const supplierOutstandingById = new Map<string, number>();
  let supplierPayableOutstanding = 0;
  for (const bill of input.purchaseBills || []) {
    const billId = toIdText(bill._id);
    const billNumber = String(bill.billNumber || '').trim();
    const linkedPayments = (input.payments || []).filter((payment, index, collection) => {
      const paymentId = toIdText(payment._id) || `${toIdText(payment.linkedBillId)}:${String(payment.linkedBillNumber || '')}:${payment.amount}`;
      const matches =
        (billId && toIdText(payment.linkedBillId) === billId)
        || (billNumber && String(payment.linkedBillNumber || '').trim() === billNumber);
      if (!matches) return false;
      return collection.findIndex((candidate) => {
        const candidateId = toIdText(candidate._id) || `${toIdText(candidate.linkedBillId)}:${String(candidate.linkedBillNumber || '')}:${candidate.amount}`;
        return candidateId === paymentId;
      }) === index;
    });
    const paidAmount = roundMoney(linkedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    const outstanding = roundMoney(Math.max(0, Number(bill.totalAmount || 0) - paidAmount));
    supplierPayableOutstanding = roundMoney(supplierPayableOutstanding + outstanding);
    const supplierKey = toIdText(bill.supplierId) || String(bill.supplierName || '').trim();
    if (supplierKey) {
      supplierOutstandingById.set(supplierKey, roundMoney((supplierOutstandingById.get(supplierKey) || 0) + outstanding));
    }
  }

  const payableControlDirectBalance = roundMoney(input.payableControlDirectBalance || 0);
  const vendorSubLedgerTotal = roundMoney(input.vendorSubLedgerTotal || 0);
  const apControlBalance = roundMoney(payableControlDirectBalance + vendorSubLedgerTotal);
  const supplierAgeingOutstanding = roundMoney(
    Array.from(supplierOutstandingById.values()).reduce((sum, value) => sum + Number(value || 0), 0)
  );
  const apDifference = roundMoney(apControlBalance - supplierPayableOutstanding);
  const ageingDifference = roundMoney(supplierAgeingOutstanding - supplierPayableOutstanding);
  const supplierCount = Number(input.supplierCount || 0);
  const mappedSupplierCount = Number(input.mappedSupplierCount ?? supplierCount);
  const unmappedSupplierCount = Math.max(0, supplierCount - mappedSupplierCount);
  const postingModel =
    Math.abs(apControlBalance) <= tolerance && Math.abs(supplierPayableOutstanding) <= tolerance
      ? 'settled'
      : Math.abs(payableControlDirectBalance) > tolerance && Math.abs(vendorSubLedgerTotal) <= tolerance
        ? 'control_only'
        : Math.abs(payableControlDirectBalance) <= tolerance && Math.abs(vendorSubLedgerTotal) > tolerance
          ? 'supplier_subledger_direct'
          : 'mixed';
  const reconciled =
    Math.abs(apDifference) <= tolerance
    && Math.abs(ageingDifference) <= tolerance
    && unmappedSupplierCount === 0;
  const reason = unmappedSupplierCount > 0
    ? `${unmappedSupplierCount} supplier(s) are missing linked payable ledgers.`
    : Math.abs(apDifference) > tolerance
      ? `AP ledger portfolio differs from supplier payable documents by ${apDifference}.`
      : Math.abs(ageingDifference) > tolerance
        ? `Supplier ageing differs from supplier payable documents by ${ageingDifference}.`
        : supplierPayableOutstanding > tolerance
          ? 'Unpaid supplier bills exist, but AP ledger portfolio, supplier documents, and ageing are reconciled.'
          : 'Supplier payables are fully settled and reconciled at zero AP.';

  return {
    apControlBalance,
    payableControlDirectBalance,
    vendorSubLedgerTotal,
    supplierPayableOutstanding,
    supplierAgeingOutstanding,
    difference: apDifference,
    ageingDifference,
    postingModel,
    status: reconciled ? 'PASS' as const : 'FAIL' as const,
    reason,
    supplierCount,
    mappedSupplierCount,
    unmappedSupplierCount,
  };
};

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
        .project({ _id: 1, [chart.accountName]: 1, [chart.accountCode]: 1, [chart.systemKey]: 1, [chart.openingBalance]: 1, [chart.openingSide]: 1 })
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

      const supplierRows = await collection(context, 'suppliers')
        .find({ ...tenantMatch(context) })
        .project({ _id: 1, name: 1, payableLedgerAccountId: 1, accountingVendorId: 1 })
        .toArray();

      const purchaseBillRows = await collection(context, 'purchaseBills')
        .find({
          ...tenantMatch(context),
          billDate: { $lte: context.periodEnd },
          status: 'posted',
        })
        .project({ _id: 1, billNumber: 1, billDate: 1, supplierId: 1, supplierName: 1, totalAmount: 1 })
        .toArray();

      const purchaseBillIds = purchaseBillRows.map((row: any) => row._id).filter(Boolean);
      const purchaseBillIdTexts = purchaseBillRows.map((row: any) => toIdText(row._id)).filter(Boolean);
      const purchaseBillNumbers = purchaseBillRows.map((row: any) => String(row.billNumber || '').trim()).filter(Boolean);
      const paymentVoucherRows = purchaseBillRows.length
        ? await collection(context, 'accountingVouchers')
            .find({
              ...tenantMatch(context),
              voucherType: 'payment',
              isDeleted: { $ne: true },
              voucherDate: { $lte: context.periodEnd },
              $or: [
                { 'metadata.linkedEntityType': 'purchase_bill', 'metadata.linkedEntityId': { $in: purchaseBillIdTexts } },
                { 'metadata.linkedEntityType': 'purchase_bill', 'metadata.linkedEntityId': { $in: purchaseBillIds } },
                { 'metadata.linkedEntityType': 'purchase_bill', 'metadata.linkedEntityNumber': { $in: purchaseBillNumbers } },
                { referenceNo: { $in: purchaseBillNumbers } },
              ],
            })
            .project({ _id: 1, voucherNumber: 1, voucherDate: 1, referenceNo: 1, totalAmount: 1, metadata: 1 })
            .toArray()
        : [];

      const paymentJournalRows = purchaseBillRows.length
        ? await collection(context, 'journalEntries')
            .find({
              ...tenantMatch(context),
              referenceType: 'payment',
              status: 'posted',
              entryDate: { $lte: context.periodEnd },
              $or: [
                { referenceId: { $in: purchaseBillIdTexts } },
                { referenceId: { $in: purchaseBillIds } },
                { referenceNo: { $in: purchaseBillNumbers } },
              ],
            })
            .project({ _id: 1, entryNumber: 1, entryDate: 1, referenceId: 1, referenceNo: 1, totalDebit: 1, totalCredit: 1 })
            .toArray()
        : [];

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

      const customerRows = await collection(context, 'customers')
        .aggregate([
          { $match: { ...tenantMatch(context) } },
          {
            $group: {
              _id: null,
              customerOpeningBalance: { $sum: { $ifNull: ['$openingBalance', 0] } },
              customerCount: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const supplierAccountById = new Map(supplierAccounts.map((account: any) => [toIdText(account._id), account]));
      const supplierLedgerOpening = supplierAccounts.reduce((sum: number, account: any) => {
        if (String(account?.[chart.systemKey] || '').trim().toLowerCase() === 'accounts_payable') return sum;
        const amount = Number(account?.[chart.openingBalance] || 0);
        return sum + (String(account?.[chart.openingSide] || 'credit').toLowerCase() === 'credit' ? amount : -amount);
      }, 0);
      const payableControlDirectBalance = roundMoney(
        supplierAccounts
          .filter((account: any) => String(account?.[chart.systemKey] || '').trim().toLowerCase() === 'accounts_payable')
          .reduce((sum: number, account: any) => {
            const accountId = toIdText(account._id);
            const movement = supplierLedgerRows.find((row: any) => toIdText(row._id) === accountId);
            const opening = String(account?.[chart.openingSide] || 'credit').toLowerCase() === 'credit'
              ? Number(account?.[chart.openingBalance] || 0)
              : -Number(account?.[chart.openingBalance] || 0);
            return sum + opening + Number(movement?.credit || 0) - Number(movement?.debit || 0);
          }, 0)
      );
      const payableLedger = roundMoney(
        supplierLedgerOpening
        + supplierLedgerRows.reduce((sum: number, row: any) => {
          const account = supplierAccountById.get(toIdText(row._id));
          if (String(account?.[chart.systemKey] || '').trim().toLowerCase() === 'accounts_payable') return sum;
          return sum + Number(row.credit || 0) - Number(row.debit || 0);
        }, 0)
      );
      const vendorOpening = roundMoney(Number(vendorRows[0]?.vendorOpeningCredit || 0) - Number(vendorRows[0]?.vendorOpeningDebit || 0));
      const receivableLedger = roundMoney(
        customerLedgerRows.reduce((sum: number, row: any) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0)
      );
      const invoiceOutstanding = roundMoney(invoiceRows[0]?.invoiceOutstanding || 0);
      const customerOpening = roundMoney(customerRows[0]?.customerOpeningBalance || 0);
      const expectedReceivable = roundMoney(invoiceOutstanding + customerOpening);
      const billedSupplierIds = new Set(purchaseBillRows.map((row: any) => toIdText(row.supplierId)).filter(Boolean));
      const billedSupplierNames = new Set(
        purchaseBillRows
          .filter((row: any) => !toIdText(row.supplierId))
          .map((row: any) => String(row.supplierName || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const payableSupplierRows = supplierRows.filter((row: any) => {
        const supplierId = toIdText(row._id);
        const supplierName = String(row.name || '').trim().toLowerCase();
        return (supplierId && billedSupplierIds.has(supplierId)) || (supplierName && billedSupplierNames.has(supplierName));
      });

      const apReconciliation = buildAccountsPayableReconciliationSnapshot({
        payableControlDirectBalance,
        vendorSubLedgerTotal: payableLedger,
        purchaseBills: purchaseBillRows.map((row: any) => ({
          _id: row._id,
          billNumber: row.billNumber,
          billDate: toDate(row.billDate) || undefined,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          totalAmount: Number(row.totalAmount || 0),
        })),
        payments: [
          ...paymentVoucherRows.map((row: any) => ({
            _id: row._id,
            linkedBillId: row?.metadata?.linkedEntityId,
            linkedBillNumber: row?.metadata?.linkedEntityNumber || row.referenceNo,
            amount: Number(row.totalAmount || 0),
          })),
          ...paymentJournalRows.map((row: any) => ({
            _id: row._id,
            linkedBillId: row.referenceId,
            linkedBillNumber: row.referenceNo,
            amount: Number(row.totalDebit || row.totalCredit || 0),
          })),
        ],
        supplierCount: payableSupplierRows.length,
        mappedSupplierCount: payableSupplierRows.filter((row: any) => Boolean(row.payableLedgerAccountId)).length,
        tolerance,
      });
      const payableDiff = Math.abs(Number(apReconciliation.difference || 0));
      const receivableDiff = absDiff(receivableLedger, expectedReceivable);
      const failed =
        apReconciliation.status === 'FAIL' ||
        (customerAccounts.length > 0 && invoiceRows.length > 0 && receivableDiff > tolerance) ||
        Number(vendorRows[0]?.missingLedgerAccounts || 0) > 0;

      return makeResult({
        checkName: 'Vendor/Customer Reconciliation',
        passed: !failed,
        severity: 'warning',
        expected: {
          vendorSubledgerMatchesPayablesControl: true,
          customerInvoicesMatchReceivablesControl: true,
          apCleanMeans: 'AP reconciled, not AP zero',
          tolerance,
        },
        actual: {
          apControlBalance: apReconciliation.apControlBalance,
          payableControlDirectBalance: apReconciliation.payableControlDirectBalance,
          vendorSubLedgerTotal: apReconciliation.vendorSubLedgerTotal,
          supplierPayableOutstanding: apReconciliation.supplierPayableOutstanding,
          supplierAgeingOutstanding: apReconciliation.supplierAgeingOutstanding,
          payableLedger,
          vendorOpening,
          payableDiff,
          apReconciliationStatus: apReconciliation.status,
          apReconciliationReason: apReconciliation.reason,
          apPostingModel: apReconciliation.postingModel,
          supplierCount: apReconciliation.supplierCount,
          mappedSupplierCount: apReconciliation.mappedSupplierCount,
          unmappedSupplierCount: apReconciliation.unmappedSupplierCount,
          receivableLedger,
          invoiceOutstanding,
          customerOpening,
          expectedReceivable,
          receivableDiff,
          vendorCount: vendorRows[0]?.vendorCount || 0,
          customerCount: customerRows[0]?.customerCount || 0,
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
          purchaseBillRows,
          paymentVoucherRows,
          paymentJournalRows,
          customerAccounts,
          customerLedgerRows,
        },
      });
    }),
};
