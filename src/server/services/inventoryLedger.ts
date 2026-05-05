import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { ChartAccount } from '../models/ChartAccount.js';
import { createJournalEntry, ensureAccountingChart } from './accountingEngine.js';
import { buildInventoryValuationRows } from './inventoryCosting.js';

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const normalizeAsOnDate = (value: Date): Date => {
  const date = new Date(value);
  if (
    date.getHours() === 0
    && date.getMinutes() === 0
    && date.getSeconds() === 0
    && date.getMilliseconds() === 0
  ) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
};

const signedOpeningBalance = (account: any): number => {
  const amount = round2(Number(account?.openingBalance || 0));
  if (amount <= 0) return 0;
  return String(account?.openingSide || 'debit').toLowerCase() === 'credit' ? -amount : amount;
};

export const buildInventoryLedgerSnapshot = async (asOnDate = new Date()) => {
  const effectiveAsOnDate = normalizeAsOnDate(asOnDate);
  await ensureAccountingChart();
  const stockAccount = await ChartAccount.findOne({ systemKey: 'stock_in_hand', isActive: true }).lean();
  if (!stockAccount) {
    throw new Error('Stock In Hand account is missing from the chart of accounts');
  }

  const [valuation, totals] = await Promise.all([
    buildInventoryValuationRows({ date: effectiveAsOnDate }),
    AccountLedgerEntry.aggregate([
      {
        $match: {
          accountId: stockAccount._id,
          entryDate: { $lte: effectiveAsOnDate },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: null,
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
        },
      },
    ]),
  ]);

  const ledgerDebit = round2(Number(totals?.[0]?.debit || 0));
  const ledgerCredit = round2(Number(totals?.[0]?.credit || 0));
  const ledgerBalance = round2(signedOpeningBalance(stockAccount) + ledgerDebit - ledgerCredit);
  const catalogValue = round2(Number(valuation.summary?.value || 0));
  const difference = round2(catalogValue - ledgerBalance);

  return {
    asOnDate: effectiveAsOnDate,
    valuationMethod: valuation.method,
    catalogValue,
    ledgerValue: ledgerBalance,
    difference,
    stockAccountId: String(stockAccount._id),
    stockAccountCode: stockAccount.accountCode,
    stockAccountName: stockAccount.accountName,
  };
};

export const reconcileInventoryLedger = async (input: {
  asOnDate?: Date;
  createdBy?: string;
  referenceNo?: string;
}) => {
  const asOnDate = normalizeAsOnDate(input.asOnDate ? new Date(input.asOnDate) : new Date());
  const snapshot = await buildInventoryLedgerSnapshot(asOnDate);
  if (Math.abs(snapshot.difference) <= 0.01) {
    return {
      posted: false,
      snapshot,
      journalEntry: null,
    };
  }

  const difference = snapshot.difference;
  const journal = await createJournalEntry({
    entryDate: asOnDate,
    referenceType: 'inventory_adjustment',
    referenceNo: input.referenceNo || `INV-RECON-${asOnDate.toISOString().slice(0, 10)}`,
    description: 'Inventory valuation reconciliation from catalog to accounting ledger',
    paymentMode: 'adjustment',
    createdBy: input.createdBy,
    metadata: {
      source: 'inventory_ledger_reconciliation',
      catalogValue: snapshot.catalogValue,
      previousLedgerValue: snapshot.ledgerValue,
      difference,
    },
    lines:
      difference > 0
        ? [
            { accountKey: 'stock_in_hand', debit: difference, credit: 0, description: 'Raise stock ledger to catalog value' },
            { accountKey: 'inventory_opening_reserve', debit: 0, credit: difference, description: 'Inventory opening reserve offset' },
          ]
        : [
            { accountKey: 'inventory_opening_reserve', debit: Math.abs(difference), credit: 0, description: 'Reverse excess stock reserve' },
            { accountKey: 'stock_in_hand', debit: 0, credit: Math.abs(difference), description: 'Reduce stock ledger to catalog value' },
          ],
  });

  return {
    posted: true,
    snapshot,
    journalEntry: journal.entry,
  };
};
