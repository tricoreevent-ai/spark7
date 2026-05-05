import { PurchaseOrder } from '../models/PurchaseOrder.js';
import { Sale } from '../models/Sale.js';

const normalizeSerial = (value: any): string => String(value || '').trim().toUpperCase();

const normalizeSerialList = (values: any[]): string[] =>
  Array.from(new Set((values || []).map((value) => normalizeSerial(value)).filter(Boolean)));

export const listAvailableProductSerialNumbers = async (productId: string, limit?: number): Promise<string[]> => {
  const productKey = String(productId || '').trim();
  if (!productKey) return [];

  const purchaseOrders: any[] = await PurchaseOrder.find({
    status: { $in: ['partially_received', 'completed'] },
    'items.productId': productKey,
  }).select('items');

  const receivedSerials = new Set<string>();
  purchaseOrders.forEach((order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    items.forEach((item: any) => {
      if (String(item?.productId || '') !== productKey) return;
      normalizeSerialList(Array.isArray(item?.serialNumbers) ? item.serialNumbers : []).forEach((serial) => {
        receivedSerials.add(serial);
      });
    });
  });

  if (!receivedSerials.size) return [];

  const postedSales: any[] = await Sale.find({
    invoiceStatus: 'posted',
    saleStatus: { $nin: ['cancelled', 'returned'] },
    'items.productId': productKey,
  }).select('items');

  const soldSerials = new Set<string>();
  postedSales.forEach((sale) => {
    const items = Array.isArray(sale?.items) ? sale.items : [];
    items.forEach((item: any) => {
      if (String(item?.productId || '') !== productKey) return;
      normalizeSerialList(Array.isArray(item?.serialNumbers) ? item.serialNumbers : []).forEach((serial) => {
        soldSerials.add(serial);
      });
    });
  });

  const available = Array.from(receivedSerials)
    .filter((serial) => !soldSerials.has(serial))
    .sort((left, right) => left.localeCompare(right));

  return typeof limit === 'number' && limit > 0 ? available.slice(0, limit) : available;
};

export const resolveSaleSerialNumbers = async (args: {
  productId: string;
  productName: string;
  quantity: number;
  serialNumbers?: any[];
}): Promise<{ serialNumbers: string[]; autoAssigned: boolean }> => {
  const requestedQuantity = Math.max(0, Number(args.quantity || 0));
  const providedSerials = normalizeSerialList(Array.isArray(args.serialNumbers) ? args.serialNumbers : []);

  if (providedSerials.length > 0) {
    if (providedSerials.length !== requestedQuantity) {
      throw new Error(`Enter exactly ${requestedQuantity} unique serial number(s) for product ${args.productName}`);
    }

    const availableSet = new Set(await listAvailableProductSerialNumbers(args.productId));
    const unavailable = providedSerials.filter((serial) => !availableSet.has(serial));
    if (unavailable.length) {
      throw new Error(`Serial number(s) not available for product ${args.productName}: ${unavailable.join(', ')}`);
    }

    return { serialNumbers: providedSerials, autoAssigned: false };
  }

  const available = await listAvailableProductSerialNumbers(args.productId, requestedQuantity);
  if (available.length >= requestedQuantity) {
    return { serialNumbers: available.slice(0, requestedQuantity), autoAssigned: true };
  }

  throw new Error(
    `Product ${args.productName} uses serial tracking, but only ${available.length} serial number(s) are available in stock for quantity ${requestedQuantity}. Record serials during stock receipt or turn off serial tracking for this product if item-level serials are not used.`
  );
};
