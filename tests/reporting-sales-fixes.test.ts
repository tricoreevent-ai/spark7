import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addBookReferenceKey,
  resolveFallbackSaleBookAmount,
  shouldSkipReceiptVoucherBookEntry,
} from '../src/server/services/bookReporting.ts';
import {
  buildDetailedSalesRegisterFromContext,
  normalizeSaleForReporting,
  summarizePosInventoryMovementFromContext,
  summarizePosSalesSummaryByShiftFromContext,
  summarizeStoreGrossProfitFromContext,
} from '../src/server/services/posReporting.ts';
import { computeCOGSFromLines } from '../src/server/services/cogsReporting.ts';
import { saleRevenueAmount } from '../src/server/services/accountingReports.ts';
import {
  buildPosSaleAccountingDiagnostics,
  shouldMarkSalePaymentCompleted,
} from '../src/server/services/salesLedger.ts';

test('store gross profit summary derives gross profit from net sales minus cogs', () => {
  const summary = summarizeStoreGrossProfitFromContext({
    invoices: [
      {
        taxableValue: 2789,
        discountAmount: 0,
        cogsAmount: 1940,
      },
    ] as any,
    returns: [] as any,
  });

  assert.equal(summary.grossSalesBeforeDiscounts, 2789);
  assert.equal(summary.grossSales, 2789);
  assert.equal(summary.netSales, 2789);
  assert.equal(summary.cogs, 1940);
  assert.equal(summary.grossProfit, 849);
  assert.equal(summary.marginPercent, 30.44);
  assert.equal(summary.expectedGrossProfit, 849);
  assert.equal(summary.validationDifference, 0);
  assert.equal(summary.isValid, true);
});

test('store gross profit summary handles zero net sales without margin errors', () => {
  const summary = summarizeStoreGrossProfitFromContext({
    invoices: [] as any,
    returns: [] as any,
  });

  assert.equal(summary.netSales, 0);
  assert.equal(summary.cogs, 0);
  assert.equal(summary.grossProfit, 0);
  assert.equal(summary.marginPercent, 0);
  assert.equal(summary.isValid, true);
});

test('store gross profit summary subtracts returned COGS from net sales gross profit', () => {
  const summary = summarizeStoreGrossProfitFromContext({
    invoices: [
      {
        taxableValue: 500,
        discountAmount: 0,
        cogsAmount: 300,
      },
    ] as any,
    returns: [
      {
        returnedAmount: 100,
      },
    ] as any,
    returnLines: [
      {
        cogsAmount: 60,
      },
    ] as any,
  });

  assert.equal(summary.netSales, 400);
  assert.equal(summary.cogs, 240);
  assert.equal(summary.grossProfit, 160);
});

test('sales reporting normalization keeps gross sales, pre-tax discount, GST, and total definitions aligned', () => {
  const normalized = normalizeSaleForReporting({
    isGstBill: true,
    taxMode: 'exclusive',
    totalAmount: 3291.02,
    roundOffAmount: 0,
    outstandingAmount: 0,
    creditAppliedAmount: 0,
    paymentMethod: 'cash',
    items: [
      {
        productId: 'prod-1',
        productName: 'Badminton Court Shoes',
        quantity: 1,
        unitPrice: 2789,
        discountAmount: 55.78,
        taxableValue: 2789,
        gstRate: 18,
        gstAmount: 502.02,
        cogsAmount: 1940,
      },
    ],
  });

  assert.equal(normalized.grossSalesAmount, 2844.78);
  assert.equal(normalized.lineDiscountAmount, 55.78);
  assert.equal(normalized.invoiceDiscountAmount, 0);
  assert.equal(normalized.totalDiscountAmount, 55.78);
  assert.equal(normalized.taxableValue, 2789);
  assert.equal(normalized.taxAmount, 502.02);
  assert.equal(normalized.totalAmount, 3291.02);
  assert.equal(normalized.amountCollected, 3291.02);
  assert.equal(normalized.storeCreditUsed, 0);
});

test('legacy accounting revenue fallback excludes invoice round-off from sales revenue', () => {
  assert.equal(
    saleRevenueAmount({
      totalAmount: 667,
      totalGst: 71.42,
      roundOffAmount: 0.38,
    }),
    595.2
  );

  assert.equal(
    saleRevenueAmount({
      grossTotal: 666.62,
      totalGst: 71.42,
      roundOffAmount: 0.38,
    }),
    595.2
  );
});

test('detailed sales register keeps pre-rounding subtotal, round-off, and final invoice total separate', () => {
  const report = buildDetailedSalesRegisterFromContext({
    invoices: [
      {
        saleId: 'sale-1',
        invoiceDate: new Date('2026-04-30T13:09:23.000Z'),
        taxableValue: 595.2,
        taxAmount: 71.42,
        totalBeforeRoundOff: 666.62,
        roundOffAmount: 0.38,
        totalAmount: 667,
        amountCollected: 667,
      },
    ] as any,
    saleLines: [
      {
        saleId: 'sale-1',
        invoiceDate: new Date('2026-04-30T13:09:23.000Z'),
        invoiceNumber: 'INV-20260430-00001',
        customerName: 'TriCore Events',
        customerGstin: '',
        productName: 'Procurement UAT Cricket Ball Carton',
        sku: 'PROC-UAT-CRI-001',
        hsnCode: '950669',
        quantity: 1,
        unitPrice: 620,
        taxableValue: 595.2,
        discountAmount: 0,
        taxAmount: 71.42,
        totalAmount: 666.62,
        paymentMethod: 'CASH',
        shiftName: 'General',
      },
    ] as any,
  });

  assert.equal(report.summary.taxableValue, 595.2);
  assert.equal(report.summary.gstAmount, 71.42);
  assert.equal(report.summary.totalBeforeRoundOff, 666.62);
  assert.equal(report.summary.roundOffAmount, 0.38);
  assert.equal(report.summary.totalAmount, 667);
  assert.equal(report.summary.amountCollected, 667);
  assert.equal(report.rows[0].subtotalBeforeRoundOff, 666.62);
  assert.equal(report.rows[0].roundOffAmount, 0.38);
  assert.equal(report.rows[0].finalInvoiceTotal, 667);
  assert.equal(report.rows[0].amountCollected, 667);
});

test('inventory movement summary exposes sold, returned, and net COGS on one shared basis', () => {
  const report = summarizePosInventoryMovementFromContext({
    saleLines: [
      {
        productId: 'prod-1',
        productName: 'GST Shuttle Pack',
        sku: 'SKU-1',
        itemType: 'inventory',
        quantity: 8,
        taxableValue: 800,
        cogsAmount: 480,
      },
      {
        productId: 'prod-2',
        productName: 'Routing Item',
        sku: 'SKU-2',
        itemType: 'inventory',
        quantity: 3,
        taxableValue: 450,
        cogsAmount: 225,
      },
    ] as any,
    returnLines: [
      {
        productId: 'prod-1',
        productName: 'GST Shuttle Pack',
        sku: 'SKU-1',
        itemType: 'inventory',
        quantity: 1,
        taxableValue: 100,
        cogsAmount: 60,
      },
    ] as any,
  });

  assert.equal(report.summary.soldQuantity, 11);
  assert.equal(report.summary.returnQuantity, 1);
  assert.equal(report.summary.netQuantity, 10);
  assert.equal(report.summary.soldCogsAmount, 705);
  assert.equal(report.summary.returnCogsAmount, 60);
  assert.equal(report.summary.cogsAmount, 645);
  assert.equal(report.netRows[0].quantitySold, 7);
  assert.equal(report.netRows[0].cogsAmount, 420);
});

test('shared COGS service handles sale-only, partial returns, and cancelled sales by caller exclusion', () => {
  const saleOnly = computeCOGSFromLines({
    saleLines: [
      { itemType: 'inventory', quantity: 2, cogsAmount: 120 },
      { itemType: 'service', quantity: 1, cogsAmount: 999 },
    ],
    returnLines: [],
  });

  assert.equal(saleOnly.soldCogsAmount, 120);
  assert.equal(saleOnly.returnCogsAmount, 0);
  assert.equal(saleOnly.netCogsAmount, 120);

  const saleWithPartialReturn = computeCOGSFromLines({
    saleLines: [{ itemType: 'inventory', quantity: 5, cogsAmount: 300 }],
    returnLines: [{ itemType: 'inventory', quantity: 2, cogsAmount: 120 }],
  });

  assert.equal(saleWithPartialReturn.soldCogsAmount, 300);
  assert.equal(saleWithPartialReturn.returnCogsAmount, 120);
  assert.equal(saleWithPartialReturn.netCogsAmount, 180);

  const cancelledSaleExcluded = computeCOGSFromLines({
    saleLines: [],
    returnLines: [],
    saleCount: 0,
  });

  assert.equal(cancelledSaleExcluded.netCogsAmount, 0);
});

test('shared COGS service includes reversal journal effect as net accounting COGS', () => {
  const accountingEffect = computeCOGSFromLines({
    scope: 'accounting',
    saleLines: [{ itemType: 'inventory', quantity: 1, cogsAmount: 205 }],
    returnLines: [{ itemType: 'inventory', quantity: 1, cogsAmount: 60 }],
    adjustmentCogsAmount: -25,
  });

  assert.equal(accountingEffect.soldCogsAmount, 205);
  assert.equal(accountingEffect.returnCogsAmount, 60);
  assert.equal(accountingEffect.adjustmentCogsAmount, -25);
  assert.equal(accountingEffect.netCogsAmount, 120);
});

test('sales reporting normalization keeps store credit out of cash collection totals', () => {
  const normalized = normalizeSaleForReporting({
    isGstBill: true,
    taxMode: 'exclusive',
    totalAmount: 3291.02,
    roundOffAmount: 0,
    outstandingAmount: 0,
    creditAppliedAmount: 250,
    paymentMethod: 'cash',
    paymentSplits: [{ method: 'cash', amount: 3041.02 }],
    items: [
      {
        productId: 'prod-1',
        productName: 'Badminton Court Shoes',
        quantity: 1,
        unitPrice: 2789,
        discountAmount: 55.78,
        taxableValue: 2789,
        gstRate: 18,
        gstAmount: 502.02,
        cogsAmount: 1940,
      },
    ],
  });

  assert.equal(normalized.amountCollected, 3041.02);
  assert.equal(normalized.storeCreditUsed, 250);
  assert.deepEqual(normalized.paymentSplits, [{ method: 'cash', amount: 3041.02 }]);
});

test('shift sales summary keeps cash collections in cash and leaves store credit at zero for a cash sale', () => {
  const report = summarizePosSalesSummaryByShiftFromContext({
    invoices: [
      {
        dateKey: '2026-04-30',
        shiftName: 'General',
        grossSalesAmount: 595.2,
        discountAmount: 0,
        taxAmount: 71.42,
        taxableValue: 595.2,
        totalAmount: 667,
        amountCollected: 667,
        storeCreditUsed: 0,
        paymentMethod: 'cash',
        paymentSplits: [{ method: 'cash', amount: 667 }],
      },
    ],
    returns: [],
  } as any);

  assert.equal(report.summary.amountCollected, 667);
  assert.equal(report.summary.storeCreditUsed, 0);
  assert.equal(report.rows[0].cash, 667);
  assert.equal(report.rows[0].bank, 0);
  assert.equal(report.rows[0].card, 0);
  assert.equal(report.rows[0].upi, 0);
  assert.equal(report.rows[0].other, 0);
  assert.equal(report.rows[0].storeCreditUsed, 0);
});

test('shift sales summary routes bank transfer collections to bank only', () => {
  const report = summarizePosSalesSummaryByShiftFromContext({
    invoices: [
      {
        dateKey: '2026-04-30',
        shiftName: 'Late',
        grossSalesAmount: 1107.14,
        discountAmount: 0,
        taxAmount: 132.86,
        taxableValue: 1107.14,
        totalAmount: 1240,
        amountCollected: 1240,
        storeCreditUsed: 0,
        paymentMethod: 'bank_transfer',
        paymentSplits: [{ method: 'bank_transfer', amount: 1240 }],
      },
    ],
    returns: [],
  } as any);

  assert.equal(report.summary.amountCollected, 1240);
  assert.equal(report.rows[0].bank, 1240);
  assert.equal(report.rows[0].cash, 0);
  assert.equal(report.rows[0].card, 0);
  assert.equal(report.rows[0].upi, 0);
  assert.equal(report.rows[0].other, 0);
});

test('fallback sale cash-book amount uses actual collected amount instead of full invoice total', () => {
  const amount = resolveFallbackSaleBookAmount({
    totalAmount: 1000,
    outstandingAmount: 400,
    creditAppliedAmount: 100,
    paymentMethod: 'cash',
    items: [],
  });

  assert.equal(amount, 500);
});

test('receipt vouchers linked to a sale are suppressed in cash book when the accounting payment already posted that sale', () => {
  const postedRefs = new Set<string>();
  addBookReferenceKey(postedRefs, 'sale-123');
  addBookReferenceKey(postedRefs, 'INV-0001');

  assert.equal(
    shouldSkipReceiptVoucherBookEntry(postedRefs, {
      _id: 'receipt-1',
      voucherNumber: 'RV-0001',
      allocations: [{ saleId: 'sale-123', saleNumber: 'INV-0001', amount: 667 }],
    }),
    true
  );
});

test('POS accounting diagnostics summarize the posted invoice, settlement, GST, round-off, and COGS in one object', async () => {
  const diagnostics = await buildPosSaleAccountingDiagnostics(
    {
      totalAmount: 667,
      outstandingAmount: 0,
      roundOffAmount: 0.38,
      items: [
        {
          productId: 'prod-1',
          productName: 'Procurement UAT Cricket Ball Carton',
          quantity: 1,
          unitPrice: 595.2,
          taxableValue: 595.2,
          gstRate: 12,
          gstAmount: 71.42,
          cgstAmount: 35.71,
          sgstAmount: 35.71,
          cogsAmount: 400,
        },
      ],
    },
    {
      totalAmount: 667,
      paidAmount: 667,
      balanceAmount: 0,
    },
    {
      baseAmount: 595.2,
      gstAmount: 71.42,
      roundOffAmount: 0.38,
      paidAmount: 667,
      totalAmount: 667,
    } as any
  );

  assert.deepEqual(diagnostics, {
    invoiceTotal: 667,
    taxableValue: 595.2,
    cgstAmount: 35.71,
    sgstAmount: 35.71,
    igstAmount: 0,
    gstTotal: 71.42,
    roundOffAmount: 0.38,
    paymentAmount: 667,
    arSettlementAmount: 667,
    arBalanceAmount: 0,
    cogsAmount: 400,
  });
});

test('sale completion only marks fully paid invoices complete when accounting receivable is also zero', () => {
  assert.equal(
    shouldMarkSalePaymentCompleted(
      {
        invoiceStatus: 'posted',
        outstandingAmount: 0,
        totalAmount: 667,
      },
      {
        _id: 'ainv-1',
        journalEntryId: 'je-1',
        totalAmount: 667,
        paidAmount: 667,
        balanceAmount: 0,
      }
    ),
    true
  );

  assert.equal(
    shouldMarkSalePaymentCompleted(
      {
        invoiceStatus: 'posted',
        outstandingAmount: 0,
        totalAmount: 667,
      },
      {
        _id: 'ainv-1',
        journalEntryId: 'je-1',
        totalAmount: 666.62,
        paidAmount: 667,
        balanceAmount: 0,
      }
    ),
    false
  );
});
