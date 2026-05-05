import React, { useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { apiUrl, fetchApiJson } from '../utils/api';

interface SaleItemBrief {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  gstRate?: number;
}

interface ReturnModalProps {
  open: boolean;
  saleId: string;
  saleNumber?: string;
  items: SaleItemBrief[];
  token: string;
  onClose: (created?: boolean) => void;
}

const floorSafeInt = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
};

const ReturnModal: React.FC<ReturnModalProps> = ({ open, saleId, saleNumber, items, token, onClose }) => {
  const soldQuantities = useMemo(
    () => items.map((item) => floorSafeInt(Number(item.quantity || 0))),
    [items]
  );
  const [quantities, setQuantities] = useState<number[]>(soldQuantities.map(() => 0));
  const [maxReturnable, setMaxReturnable] = useState<number[]>(soldQuantities);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'upi' | 'bank_transfer' | 'credit_note' | 'original_payment'>('original_payment');
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [error, setError] = useState('');

  useEscapeKey(() => onClose(false), { enabled: open });

  useEffect(() => {
    if (!open) return;
    setQuantities(soldQuantities.map(() => 0));
    setMaxReturnable(soldQuantities);
    setReason('');
    setRefundMethod('original_payment');
    setLoading(false);
    setAvailabilityLoading(false);
    setAvailabilityMessage('');
    setError('');
  }, [open, saleId, soldQuantities]);

  useEffect(() => {
    if (!open || !token || !saleId || items.length === 0) return;
    let disposed = false;

    const loadRemainingQuantities = async () => {
      setAvailabilityLoading(true);
      setAvailabilityMessage('');
      try {
        const response = await fetchApiJson(
          apiUrl(`/api/returns?saleId=${encodeURIComponent(saleId)}&limit=200`),
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const rows = Array.isArray(response?.data) ? response.data : [];
        const returnedByProduct = new Map<string, number>();

        for (const row of rows) {
          const status = String(row?.returnStatus || '').toLowerCase();
          if (status !== 'draft' && status !== 'approved') continue;
          const returnItems = Array.isArray(row?.items) ? row.items : [];
          for (const returnItem of returnItems) {
            const productId = String(returnItem?.productId || '');
            if (!productId) continue;
            const returnQty = Number(returnItem?.returnQuantity || 0);
            if (!Number.isFinite(returnQty) || returnQty <= 0) continue;
            returnedByProduct.set(productId, Number(returnedByProduct.get(productId) || 0) + returnQty);
          }
        }

        const nextMax = soldQuantities.map((soldQty, index) => {
          const productId = String(items[index]?.productId || '');
          const alreadyReturned = Number(returnedByProduct.get(productId) || 0);
          return Math.max(0, soldQty - floorSafeInt(alreadyReturned));
        });

        if (disposed) return;
        setMaxReturnable(nextMax);
        setQuantities((prev) =>
          nextMax.map((maxQty, idx) => {
            const current = floorSafeInt(Number(prev[idx] || 0));
            return Math.min(maxQty, current);
          })
        );
      } catch {
        if (disposed) return;
        setAvailabilityMessage('Could not read past returns. Using sold quantity limits.');
      } finally {
        if (!disposed) setAvailabilityLoading(false);
      }
    };

    void loadRemainingQuantities();
    return () => {
      disposed = true;
    };
  }, [open, saleId, token, items, soldQuantities]);

  if (!open) return null;

  const hasReturnableItems = maxReturnable.some((qty) => qty > 0);
  const selectedQty = quantities.reduce((sum, qty) => sum + floorSafeInt(qty), 0);

  const handleQtyChange = (index: number, val: number) => {
    const maxQty = floorSafeInt(Number(maxReturnable[index] ?? soldQuantities[index] ?? 0));
    const q = Math.max(0, Math.min(maxQty, floorSafeInt(val)));
    const next = [...quantities];
    next[index] = q;
    setQuantities(next);
  };

  const handleSubmit = async () => {
    setError('');
    if (!token) {
      setError('Session expired. Please login again.');
      return;
    }
    if (!hasReturnableItems) {
      setError('All items in this invoice are already fully returned.');
      return;
    }
    const selected = items
      .map((it, i) => {
        const requested = floorSafeInt(Number(quantities[i] || 0));
        const maxQty = floorSafeInt(Number(maxReturnable[i] ?? soldQuantities[i] ?? 0));
        return { ...it, returnQuantity: Math.min(requested, maxQty), originalQuantity: soldQuantities[i] };
      })
      .filter(x => x.returnQuantity > 0);

    if (selected.length === 0) {
      setError('Select at least one item and quantity to return');
      return;
    }
    if (!reason.trim()) {
      setError('Return reason is required');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        saleId,
        items: selected.map(s => ({
          productId: s.productId,
          originalQuantity: s.originalQuantity,
          returnQuantity: s.returnQuantity,
          unitPrice: s.unitPrice,
          gstRate: s.gstRate || 0,
          returnReason: reason || undefined,
        })),
        reason,
        refundMethod,
      };

      await fetchApiJson(apiUrl('/api/returns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      onClose(true);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-white/10 bg-gray-900 p-5 text-gray-100 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">
          Create Return for Invoice {saleNumber || saleId}
        </h3>
        <p className="mt-1 text-xs text-gray-400">Set quantity only for the item(s) being returned.</p>

        {availabilityLoading && (
          <div className="mt-3 rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100">
            Checking returnable quantity...
          </div>
        )}
        {availabilityMessage && (
          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {availabilityMessage}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-gray-300">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Sold Qty</th>
                <th className="px-3 py-2">Available</th>
                <th className="px-3 py-2">Return Qty</th>
                <th className="px-3 py-2">Unit Price</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const soldQty = soldQuantities[i] || 0;
                const maxQty = floorSafeInt(Number(maxReturnable[i] ?? soldQty));
                return (
                  <tr key={`${it.productId}-${i}`} className="border-t border-white/10">
                    <td className="px-3 py-2 text-gray-100">{it.productName}</td>
                    <td className="px-3 py-2 text-gray-300">{soldQty}</td>
                    <td className="px-3 py-2 text-gray-300">{maxQty}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={maxQty}
                        value={quantities[i] || 0}
                        onChange={(e) => handleQtyChange(i, Number(e.target.value))}
                        disabled={maxQty <= 0}
                        className="w-24 rounded border border-white/15 bg-white/5 px-2 py-1 text-sm text-white outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-300">₹{Number(it.unitPrice || 0).toFixed(2)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-center text-gray-500" colSpan={5}>
                    No returnable items found in this invoice.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm text-gray-300">Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter return reason"
              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-300">Refund Method</label>
            <select
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as any)}
              className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            >
              <option value="original_payment" className="bg-gray-900">Original Payment</option>
              <option value="cash" className="bg-gray-900">Cash</option>
              <option value="card" className="bg-gray-900">Card</option>
              <option value="upi" className="bg-gray-900">UPI</option>
              <option value="bank_transfer" className="bg-gray-900">Bank Transfer</option>
              <option value="credit_note" className="bg-gray-900">Credit Note</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Selected return quantity: {selectedQty}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
              onClick={() => onClose(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || availabilityLoading || !hasReturnableItems || selectedQty <= 0}
              onClick={handleSubmit}
            >
              {loading ? 'Processing...' : 'Create Return'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnModal;
