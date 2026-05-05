import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeSupplierPayablesFromContext } from '../src/server/services/procurementPayables.ts';
import { buildAccountsPayableReconciliationSnapshot } from '../src/server/validation/validators/vendorCustomerReconciliationValidator.ts';

test('supplier payables summary marks fully settled supplier bills as paid with zero outstanding', () => {
  const report = summarizeSupplierPayablesFromContext({
    asOnDate: '2026-05-02',
    suppliers: [
      {
        _id: 'supplier-1',
        name: 'Procurement UAT Sports Wholesale',
        accountingVendorId: 'vendor-1',
        payableLedgerAccountId: 'ledger-1',
        payableLedgerAccountCode: '2101',
        payableLedgerAccountName: 'Vendor - Procurement UAT Sports Wholesale',
      },
    ],
    bills: [
      {
        _id: 'bill-1',
        billNumber: 'PB-20260502-00017',
        purchaseOrderId: 'po-1',
        purchaseNumber: 'PO-20260502-00017',
        supplierId: 'supplier-1',
        supplierName: 'Procurement UAT Sports Wholesale',
        billDate: new Date('2026-05-02T10:00:00.000Z'),
        totalAmount: 39102,
        accountingVendorId: 'vendor-1',
        payableLedgerAccountId: 'ledger-1',
        billJournalEntryId: 'je-bill-1',
        billJournalEntryNumber: 'JE-20260502-00017',
      },
      {
        _id: 'bill-2',
        billNumber: 'PB-20260502-00018',
        purchaseOrderId: 'po-2',
        purchaseNumber: 'PO-20260502-00018',
        supplierId: 'supplier-1',
        supplierName: 'Procurement UAT Sports Wholesale',
        billDate: new Date('2026-05-02T11:00:00.000Z'),
        totalAmount: 20160,
        accountingVendorId: 'vendor-1',
        payableLedgerAccountId: 'ledger-1',
        billJournalEntryId: 'je-bill-2',
        billJournalEntryNumber: 'JE-20260502-00018',
      },
    ],
    payments: [
      {
        _id: 'pv-1',
        kind: 'voucher',
        linkedBillId: 'bill-1',
        linkedBillNumber: 'PB-20260502-00017',
        paymentDate: new Date('2026-05-02T12:00:00.000Z'),
        amount: 39102,
        paymentMode: 'bank',
        paymentReference: 'PV-20260502-00017',
        paymentVoucherId: 'pv-1',
        paymentVoucherNumber: 'PV-20260502-00017',
      },
      {
        _id: 'pv-2',
        kind: 'voucher',
        linkedBillId: 'bill-2',
        linkedBillNumber: 'PB-20260502-00018',
        paymentDate: new Date('2026-05-02T13:00:00.000Z'),
        amount: 20160,
        paymentMode: 'bank',
        paymentReference: 'PV-20260502-00018',
        paymentVoucherId: 'pv-2',
        paymentVoucherNumber: 'PV-20260502-00018',
      },
    ],
    ledgerBalances: [
      {
        accountId: 'ledger-1',
        outstanding: 0,
      },
    ],
  });

  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].status, 'Paid');
  assert.equal(report.rows[0].outstandingAmount, 0);
  assert.equal(report.rows[1].status, 'Paid');
  assert.equal(report.totals.billAmount, 59262);
  assert.equal(report.totals.paidAmount, 59262);
  assert.equal(report.totals.outstandingAmount, 0);
  assert.equal(report.totals.payableLedgerOutstanding, 0);
  assert.equal(report.validation.totalsMatch, true);
  assert.equal(report.validation.outstandingMatchesLedger, true);
  assert.equal(report.validation.allSuppliersMapped, true);
  assert.equal(report.validation.apReconciled, true);
  assert.equal(report.validation.duplicatePayableLedgerLinks, 0);
  assert.equal(report.reconciliation.status, 'Reconciled');
});

test('supplier payables reconciliation passes for unpaid supplier bills when documents and payable ledgers match', () => {
  const report = summarizeSupplierPayablesFromContext({
    asOnDate: '2026-05-02',
    suppliers: [
      {
        _id: 'supplier-2',
        name: 'Procurement UAT Court Elite Gear',
        accountingVendorId: 'vendor-2',
        payableLedgerAccountId: 'ledger-2',
        payableLedgerAccountCode: '2102',
        payableLedgerAccountName: 'Vendor - Procurement UAT Court Elite Gear',
      },
    ],
    bills: [
      {
        _id: 'bill-3',
        billNumber: 'PB-20260301-00001',
        purchaseOrderId: 'po-3',
        purchaseNumber: 'PO-20260301-00001',
        supplierId: 'supplier-2',
        supplierName: 'Procurement UAT Court Elite Gear',
        billDate: new Date('2026-03-01T10:00:00.000Z'),
        totalAmount: 41182,
        accountingVendorId: 'vendor-2',
        payableLedgerAccountId: 'ledger-2',
      },
    ],
    payments: [
      {
        _id: 'pv-3',
        kind: 'voucher',
        linkedBillId: 'bill-3',
        linkedBillNumber: 'PB-20260301-00001',
        paymentDate: new Date('2026-03-15T10:00:00.000Z'),
        amount: 10000,
        paymentMode: 'bank',
        paymentReference: 'PV-20260315-00001',
        paymentVoucherId: 'pv-3',
        paymentVoucherNumber: 'PV-20260315-00001',
      },
    ],
    ledgerBalances: [
      {
        accountId: 'ledger-2',
        outstanding: 31182,
      },
    ],
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].status, 'Partial');
  assert.equal(report.rows[0].outstandingAmount, 31182);
  assert.equal(report.validation.totalsMatch, true);
  assert.equal(report.validation.outstandingMatchesLedger, true);
  assert.equal(report.validation.apReconciled, true);
  assert.equal(report.reconciliation.payableSubLedgerBalance, 31182);
  assert.equal(report.reconciliation.supplierOutstandingBalance, 31182);
  assert.equal(report.reconciliation.difference, 0);
  assert.equal(report.reconciliation.postingModel, 'supplier_subledger_direct');
  assert.equal(report.reconciliation.status, 'Reconciled');
});

test('supplier payables ageing keeps unpaid amount in the correct bucket and flags ledger mismatch', () => {
  const report = summarizeSupplierPayablesFromContext({
    asOnDate: '2026-05-02',
    suppliers: [
      {
        _id: 'supplier-2',
        name: 'Procurement UAT Court Elite Gear',
        accountingVendorId: 'vendor-2',
        payableLedgerAccountId: 'ledger-2',
        payableLedgerAccountCode: '2102',
        payableLedgerAccountName: 'Vendor - Procurement UAT Court Elite Gear',
      },
    ],
    bills: [
      {
        _id: 'bill-3',
        billNumber: 'PB-20260301-00001',
        purchaseOrderId: 'po-3',
        purchaseNumber: 'PO-20260301-00001',
        supplierId: 'supplier-2',
        supplierName: 'Procurement UAT Court Elite Gear',
        billDate: new Date('2026-03-01T10:00:00.000Z'),
        totalAmount: 41182,
        accountingVendorId: 'vendor-2',
        payableLedgerAccountId: 'ledger-2',
      },
    ],
    payments: [
      {
        _id: 'pv-3',
        kind: 'voucher',
        linkedBillId: 'bill-3',
        linkedBillNumber: 'PB-20260301-00001',
        paymentDate: new Date('2026-03-15T10:00:00.000Z'),
        amount: 10000,
        paymentMode: 'bank',
        paymentReference: 'PV-20260315-00001',
        paymentVoucherId: 'pv-3',
        paymentVoucherNumber: 'PV-20260315-00001',
      },
    ],
    ledgerBalances: [
      {
        accountId: 'ledger-2',
        outstanding: 30000,
      },
    ],
  });

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].status, 'Partial');
  assert.equal(report.rows[0].outstandingAmount, 31182);
  assert.equal(report.ageing.length, 1);
  assert.equal(report.ageing[0].bucket61To90, 31182);
  assert.equal(report.ageing[0].payableLedgerOutstanding, 30000);
  assert.equal(report.ageing[0].validationDifference, 1182);
  assert.equal(report.validation.totalsMatch, true);
  assert.equal(report.validation.outstandingMatchesLedger, false);
  assert.equal(report.validation.apReconciled, false);
  assert.equal(report.reconciliation.status, 'Mismatch');
});

test('validation AP reconciliation passes unpaid supplier bills when AP ledger portfolio and ageing match', () => {
  const snapshot = buildAccountsPayableReconciliationSnapshot({
    payableControlDirectBalance: 0,
    vendorSubLedgerTotal: 114304,
    supplierCount: 3,
    mappedSupplierCount: 3,
    purchaseBills: [
      { _id: 'bill-a', billNumber: 'PB-A', supplierId: 'sports', supplierName: 'Sports Wholesale', totalAmount: 59262 },
      { _id: 'bill-b', billNumber: 'PB-B', supplierId: 'aquatics', supplierName: 'Aquatics Supply', totalAmount: 13860 },
      { _id: 'bill-c', billNumber: 'PB-C', supplierId: 'court', supplierName: 'Court Elite Gear', totalAmount: 41182 },
    ],
    payments: [],
  });

  assert.equal(snapshot.status, 'PASS');
  assert.equal(snapshot.apControlBalance, 114304);
  assert.equal(snapshot.vendorSubLedgerTotal, 114304);
  assert.equal(snapshot.supplierPayableOutstanding, 114304);
  assert.equal(snapshot.supplierAgeingOutstanding, 114304);
  assert.equal(snapshot.difference, 0);
  assert.equal(snapshot.postingModel, 'supplier_subledger_direct');
});

test('validation AP reconciliation passes fully paid supplier bills with zero AP', () => {
  const snapshot = buildAccountsPayableReconciliationSnapshot({
    payableControlDirectBalance: 0,
    vendorSubLedgerTotal: 0,
    supplierCount: 1,
    mappedSupplierCount: 1,
    purchaseBills: [
      { _id: 'bill-a', billNumber: 'PB-A', supplierId: 'sports', supplierName: 'Sports Wholesale', totalAmount: 59262 },
    ],
    payments: [
      { _id: 'pv-a', linkedBillId: 'bill-a', linkedBillNumber: 'PB-A', amount: 59262 },
    ],
  });

  assert.equal(snapshot.status, 'PASS');
  assert.equal(snapshot.apControlBalance, 0);
  assert.equal(snapshot.supplierPayableOutstanding, 0);
  assert.equal(snapshot.supplierAgeingOutstanding, 0);
  assert.equal(snapshot.difference, 0);
  assert.equal(snapshot.postingModel, 'settled');
});

test('validation AP reconciliation fails when supplier ageing/documents and AP ledgers mismatch', () => {
  const snapshot = buildAccountsPayableReconciliationSnapshot({
    payableControlDirectBalance: 0,
    vendorSubLedgerTotal: 113000,
    supplierCount: 1,
    mappedSupplierCount: 1,
    purchaseBills: [
      { _id: 'bill-c', billNumber: 'PB-C', supplierId: 'court', supplierName: 'Court Elite Gear', totalAmount: 41182 },
    ],
    payments: [],
  });

  assert.equal(snapshot.status, 'FAIL');
  assert.equal(snapshot.supplierPayableOutstanding, 41182);
  assert.equal(snapshot.supplierAgeingOutstanding, 41182);
  assert.equal(snapshot.difference, 71818);
});
