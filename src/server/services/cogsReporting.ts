import { AccountLedgerEntry } from '../models/AccountLedgerEntry.js';
import { Return } from '../models/Return.js';
import { Sale } from '../models/Sale.js';

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));
const toNumber = (value: unknown): number => Number(value || 0);
const normalizeText = (value: unknown): string => String(value || '').trim();

export type CogsScope = 'pos' | 'inventory' | 'accounting';

export interface CogsLineLike {
  productId?: string;
  productName?: string;
  sku?: string;
  itemType?: string;
  quantity?: number;
  cogsAmount?: number;
  sourceType?: 'sale' | 'return' | 'adjustment';
  sourceId?: string;
}

export interface CogsComputation {
  scope: CogsScope;
  includeReturns: boolean;
  salesCogs: number;
  returnCogs: number;
  netCogs: number;
  itemRows: CogsLineLike[];
  soldCogsAmount: number;
  returnCogsAmount: number;
  adjustmentCogsAmount: number;
  netCogsAmount: number;
  saleCount: number;
  returnCount: number;
  source: 'operational_sales_returns' | 'accounting_ledger';
}

const isInventoryLine = (line: CogsLineLike): boolean => {
  const itemType = normalizeText(line.itemType || 'inventory').toLowerCase();
  return itemType !== 'service' && itemType !== 'non_inventory';
};

export const computeCOGSFromLines = (input: {
  scope?: CogsScope;
  includeReturns?: boolean;
  saleLines?: CogsLineLike[];
  returnLines?: CogsLineLike[];
  adjustmentCogsAmount?: number;
  saleCount?: number;
  returnCount?: number;
}): CogsComputation => {
  const includeReturns = input.includeReturns !== false;
  const soldCogsAmount = round2(
    (input.saleLines || [])
      .filter(isInventoryLine)
      .reduce((sum, line) => sum + Math.max(0, toNumber(line.cogsAmount)), 0)
  );
  const returnCogsAmount = includeReturns
    ? round2(
        (input.returnLines || [])
          .filter(isInventoryLine)
          .reduce((sum, line) => sum + Math.max(0, toNumber(line.cogsAmount)), 0)
      )
    : 0;
  const adjustmentCogsAmount = round2(toNumber(input.adjustmentCogsAmount));
  const netCogsAmount = round2(Math.max(0, soldCogsAmount - returnCogsAmount + adjustmentCogsAmount));
  const itemRows = [
    ...(input.saleLines || []).filter(isInventoryLine).map((line) => ({ ...line, sourceType: 'sale' as const })),
    ...(includeReturns ? (input.returnLines || []).filter(isInventoryLine).map((line) => ({ ...line, sourceType: 'return' as const })) : []),
  ];

  return {
    scope: input.scope || 'pos',
    includeReturns,
    salesCogs: soldCogsAmount,
    returnCogs: returnCogsAmount,
    netCogs: netCogsAmount,
    itemRows,
    soldCogsAmount,
    returnCogsAmount,
    adjustmentCogsAmount,
    netCogsAmount,
    saleCount: Number(input.saleCount ?? (input.saleLines || []).length),
    returnCount: Number(input.returnCount ?? (input.returnLines || []).length),
    source: 'operational_sales_returns',
  };
};

const saleLineCogs = (sale: any): CogsLineLike[] =>
  (Array.isArray(sale?.items) ? sale.items : []).map((item: any) => ({
    productId: String(item?.productId || ''),
    productName: String(item?.productName || ''),
    sku: String(item?.sku || ''),
    itemType: String(item?.itemType || 'inventory'),
    quantity: toNumber(item?.quantity),
    cogsAmount: Math.max(0, toNumber(item?.cogsAmount)),
  }));

const returnLineCogs = (returnRow: any, saleById: Map<string, any>): CogsLineLike[] => {
  const sourceSale = returnRow?.saleId ? saleById.get(String(returnRow.saleId)) : null;
  const sourceLines = saleLineCogs(sourceSale);
  return (Array.isArray(returnRow?.items) ? returnRow.items : []).map((item: any) => {
    const quantity = Math.max(0, toNumber(item?.returnQuantity ?? item?.quantity));
    const matched = sourceLines.find((line) =>
      String(line.productId || '') === String(item?.productId || '')
      && String(line.sku || '') === String(item?.sku || '')
    ) || sourceLines.find((line) => String(line.productId || '') === String(item?.productId || ''));
    const unitCogs = matched && toNumber(matched.quantity) > 0
      ? toNumber(matched.cogsAmount) / toNumber(matched.quantity)
      : 0;
    return {
      productId: String(item?.productId || matched?.productId || ''),
      productName: String(item?.productName || matched?.productName || ''),
      sku: String(item?.sku || matched?.sku || ''),
      itemType: String(matched?.itemType || item?.itemType || 'inventory'),
      quantity,
      cogsAmount: round2(unitCogs * quantity),
    };
  });
};

export const computeCOGS = async (input: {
  fromDate: Date;
  toDate: Date;
  scope?: CogsScope;
  includeReturns?: boolean;
}): Promise<CogsComputation> => {
  const scope = input.scope || 'pos';
  const includeReturns = input.includeReturns !== false;

  if (scope === 'accounting') {
    const rows = await AccountLedgerEntry.aggregate([
      {
        $match: {
          isDeleted: { $ne: true },
          voucherType: { $ne: 'opening' },
          entryDate: { $gte: input.fromDate, $lte: input.toDate },
        },
      },
      { $lookup: { from: 'chartaccounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
      { $unwind: '$account' },
      { $match: { 'account.systemKey': 'cost_of_goods_sold' } },
      {
        $group: {
          _id: null,
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
          count: { $sum: 1 },
        },
      },
    ]);
    const row = rows[0] || {};
    const netCogsAmount = round2(toNumber(row.debit) - toNumber(row.credit));
    return {
      scope,
      includeReturns,
      salesCogs: round2(toNumber(row.debit)),
      returnCogs: round2(toNumber(row.credit)),
      netCogs: netCogsAmount,
      itemRows: [],
      soldCogsAmount: round2(toNumber(row.debit)),
      returnCogsAmount: round2(toNumber(row.credit)),
      adjustmentCogsAmount: 0,
      netCogsAmount,
      saleCount: Number(row.count || 0),
      returnCount: 0,
      source: 'accounting_ledger',
    };
  }

  const [sales, returns] = await Promise.all([
    Sale.find({
      createdAt: { $gte: input.fromDate, $lte: input.toDate },
      saleStatus: { $in: ['completed', 'returned'] },
      $or: [{ invoiceStatus: 'posted' }, { invoiceStatus: null }, { invoiceStatus: { $exists: false } }],
    }).lean(),
    includeReturns
      ? Return.find({
          createdAt: { $gte: input.fromDate, $lte: input.toDate },
          returnStatus: 'approved',
        }).lean()
      : Promise.resolve([]),
  ]);
  const saleById = new Map((sales as any[]).map((sale) => [String(sale._id), sale]));
  const saleLines = (sales as any[]).flatMap(saleLineCogs);
  const returnLines = (returns as any[]).flatMap((row) => returnLineCogs(row, saleById));
  return computeCOGSFromLines({
    scope,
    includeReturns,
    saleLines,
    returnLines,
    saleCount: sales.length,
    returnCount: returns.length,
  });
};
