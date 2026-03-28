export type ProductItemType = 'inventory' | 'service' | 'non_inventory';

const roundTo2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const normalizeProductItemType = (value: any): ProductItemType => {
  const normalized = String(value || 'inventory').trim().toLowerCase();
  if (normalized === 'service') return 'service';
  if (normalized === 'non_inventory') return 'non_inventory';
  return 'inventory';
};

export const productRequiresStock = (product: any): boolean =>
  normalizeProductItemType(product?.itemType) === 'inventory';

const resolvePromotionPrice = (product: any, now = new Date()): number | null => {
  const promotionalPrice = Number(product?.promotionalPrice || 0);
  if (promotionalPrice <= 0) return null;

  const start = product?.promotionStartDate ? new Date(product.promotionStartDate) : null;
  const end = product?.promotionEndDate ? new Date(product.promotionEndDate) : null;

  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) return null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) return null;

  return roundTo2(promotionalPrice);
};

const normalizeTierName = (value: any): string => String(value || '').trim().toLowerCase();

export const resolveTierPrice = (product: any, quantity: number, customerTier?: string): number | null => {
  const tierRows = Array.isArray(product?.priceTiers) ? product.priceTiers : [];
  if (!tierRows.length) return null;

  const normalizedCustomerTier = normalizeTierName(customerTier);
  const applicable = tierRows
    .map((row: any) => ({
      tierName: normalizeTierName(row?.tierName),
      minQuantity: Math.max(1, Number(row?.minQuantity || 1)),
      unitPrice: Number(row?.unitPrice || 0),
    }))
    .filter((row: { tierName: string; minQuantity: number; unitPrice: number }) => row.unitPrice > 0 && quantity >= row.minQuantity)
    .filter((row: { tierName: string }) => {
      if (!normalizedCustomerTier) return true;
      if (!row.tierName) return true;
      return row.tierName === normalizedCustomerTier;
    })
    .sort((a: { minQuantity: number; unitPrice: number }, b: { minQuantity: number; unitPrice: number }) => {
      if (b.minQuantity !== a.minQuantity) return b.minQuantity - a.minQuantity;
      return a.unitPrice - b.unitPrice;
    });

  return applicable.length ? roundTo2(applicable[0].unitPrice) : null;
};

export const resolveBaseProductPrice = (args: {
  product: any;
  quantity: number;
  pricingMode?: 'retail' | 'wholesale' | 'customer';
  customerTier?: string;
}): number => {
  const retailPrice = Number(args.product?.price || 0);
  const wholesalePrice = Number(args.product?.wholesalePrice || 0);
  const priceCandidates = [retailPrice].filter((value) => value > 0);

  if (args.pricingMode === 'wholesale' && wholesalePrice > 0) {
    priceCandidates.push(wholesalePrice);
  }

  const tierPrice = resolveTierPrice(args.product, Math.max(1, Number(args.quantity || 1)), args.customerTier);
  if (tierPrice !== null) priceCandidates.push(tierPrice);

  if (args.pricingMode !== 'wholesale') {
    const promotionPrice = resolvePromotionPrice(args.product);
    if (promotionPrice !== null) priceCandidates.push(promotionPrice);
  }

  if (!priceCandidates.length) return 0;
  return roundTo2(Math.min(...priceCandidates));
};

export const computeReorderSuggestion = (product: any): number => {
  if (!productRequiresStock(product)) return 0;

  const stock = Math.max(0, Number(product?.stock || 0));
  const minStock = Math.max(0, Number(product?.minStock || 0));
  const reorderQuantity = Math.max(0, Number(product?.reorderQuantity || 0));

  if (stock > minStock) return 0;

  const shortage = Math.max(0, minStock - stock);
  const suggested = shortage + (reorderQuantity > 0 ? reorderQuantity : Math.max(1, shortage));
  return roundTo2(Math.max(reorderQuantity, suggested));
};
