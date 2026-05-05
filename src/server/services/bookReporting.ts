import { normalizeSaleForReporting } from './posReporting.js';

const round2 = (value: number): number => Number(Number(value || 0).toFixed(2));

export const addBookReferenceKey = (postedRefs: Set<string>, value: unknown): void => {
  const key = String(value || '').trim();
  if (key) postedRefs.add(key);
};

export const resolveFallbackSaleBookAmount = (sale: any): number =>
  round2(Number(normalizeSaleForReporting(sale).amountCollected || 0));

export const shouldSkipReceiptVoucherBookEntry = (postedRefs: Set<string>, row: any): boolean => {
  const voucherNumber = String(row?.voucherNumber || '').trim();
  const rowId = String(row?._id || '').trim();
  if ((voucherNumber && postedRefs.has(voucherNumber)) || (rowId && postedRefs.has(rowId))) {
    return true;
  }

  const allocationRefs = Array.isArray(row?.allocations)
    ? row.allocations.flatMap((allocation: any) => [
        String(allocation?.saleId || '').trim(),
        String(allocation?.saleNumber || '').trim(),
      ])
    : [];

  return allocationRefs.some((value: string) => value && postedRefs.has(value));
};
