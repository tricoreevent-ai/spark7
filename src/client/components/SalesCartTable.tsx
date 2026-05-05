import React from 'react';
import { IProduct } from '@shared/types';
import { Trash2 } from 'lucide-react';

type VariantRow = {
  size?: string;
  color?: string;
  skuSuffix?: string;
  price?: number;
};

export interface SalesCartValidationError {
  expiryDate?: string;
  serialNumbersText?: string;
}

export interface SalesCartTableItem extends Pick<IProduct, '_id' | 'name' | 'sku' | 'price' | 'variantMatrix'> {
  quantity: number;
  cartId: string;
  selectedVariantSize?: string;
  selectedVariantColor?: string;
  batchTracking?: boolean;
  expiryRequired?: boolean;
  batchNo?: string;
  expiryDate?: string;
  serialNumberTracking?: boolean;
  saleSerialTrackingEnabled?: boolean;
  serialNumbersText?: string;
  offlineStockDiscrepancy?: boolean;
}

interface SalesCartTableProps {
  cart: SalesCartTableItem[];
  cartValidationErrors: Record<string, SalesCartValidationError>;
  formatCurrency: (value: number) => string;
  getVariantOptions: (product: Pick<IProduct, 'variantMatrix'> | null | undefined) => VariantRow[];
  variantOptionValue: (size?: string, color?: string) => string;
  variantOptionLabel: (row: VariantRow) => string;
  normalizeSerialNumbers: (value: string) => string[];
  onUpdateVariant: (cartId: string, value: string) => void;
  onUpdateQuantity: (cartId: string, delta: number) => void;
  onSetQuantity: (cartId: string, quantity: number) => void;
  onRemove: (cartId: string) => void;
  onUpdateField: (cartId: string, field: keyof SalesCartTableItem, value: any) => void;
  cartItemRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  expiryInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  serialInputRefs: React.MutableRefObject<Record<string, HTMLTextAreaElement | null>>;
  serialTrackingHelpText: string;
}

const HelpDot: React.FC<{ title: string }> = ({ title }) => (
  <span
    title={title}
    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-[10px] font-bold text-cyan-100"
  >
    ?
  </span>
);

export const SalesCartTable: React.FC<SalesCartTableProps> = ({
  cart,
  cartValidationErrors,
  formatCurrency,
  getVariantOptions,
  variantOptionValue,
  variantOptionLabel,
  normalizeSerialNumbers,
  onUpdateVariant,
  onUpdateQuantity,
  onSetQuantity,
  onRemove,
  onUpdateField,
  cartItemRefs,
  expiryInputRefs,
  serialInputRefs,
  serialTrackingHelpText,
}) => {
  const compactVariantLabel = (row: VariantRow) => {
    const primary = [row.size, row.color].filter(Boolean).join(' / ');
    return primary || row.skuSuffix || 'Variant';
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/10">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <thead className="bg-white/5">
            <tr className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              <th className="w-[31%] px-3 py-2.5 text-left">Item</th>
              <th className="w-[25%] px-3 py-2.5 text-left">Variant</th>
              <th className="w-[14%] px-3 py-2.5 text-center">Qty</th>
              <th className="w-[12%] px-3 py-3 text-center">Serial</th>
              <th className="w-[10%] px-3 py-2.5 text-right">Amount</th>
              <th className="w-[7%] px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => {
              const variantOptions = getVariantOptions(item);
              const useVariantButtons = variantOptions.length > 1 && variantOptions.length <= 4;
              const serialCount = normalizeSerialNumbers(item.serialNumbersText || '').length;
              const serialCountTone = cartValidationErrors[item.cartId]?.serialNumbersText
                ? 'text-rose-300'
                : serialCount > 0 && serialCount !== Number(item.quantity || 0)
                  ? 'text-amber-300'
                  : 'text-gray-500';
              const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
              const hasDetailRow = item.batchTracking || item.expiryRequired || (item.serialNumberTracking && item.saleSerialTrackingEnabled);
              const hasValidationState = Boolean(cartValidationErrors[item.cartId]);

              return (
                <React.Fragment key={item.cartId}>
                  <tr
                    ref={(node) => {
                      cartItemRefs.current[item.cartId] = node;
                    }}
                    className={`${index > 0 ? 'border-t border-white/10' : ''} ${hasValidationState ? 'bg-rose-500/[0.05]' : 'bg-transparent'}`}
                  >
                    <td className="px-3 py-2.5 align-top">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-white">{item.name}</h4>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-400">
                          <span>{formatCurrency(item.price)} each</span>
                          {item.sku ? <span>SKU {item.sku}</span> : null}
                          <span>{item.quantity} unit{item.quantity > 1 ? 's' : ''}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.batchTracking ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-300">
                              Batch
                            </span>
                          ) : null}
                          {item.expiryRequired ? (
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-gray-300">
                              Expiry
                            </span>
                          ) : null}
                          {item.serialNumberTracking ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] ${
                              item.saleSerialTrackingEnabled
                                ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                                : 'border-white/10 bg-white/5 text-gray-300'
                            }`}>
                              {item.saleSerialTrackingEnabled ? 'Serial On' : 'Serial'}
                            </span>
                          ) : null}
                        </div>
                        {item.offlineStockDiscrepancy ? (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                            Offline stock discrepancy flagged
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="min-w-0 space-y-2">
                        {useVariantButtons ? (
                          <div className="flex flex-wrap gap-1.5">
                            {variantOptions.map((row, variantIndex) => {
                              const optionValue = variantOptionValue(row.size, row.color);
                              const isSelected = optionValue === variantOptionValue(item.selectedVariantSize, item.selectedVariantColor);
                              return (
                                <button
                                  key={`${item._id}-${variantIndex}-${optionValue}`}
                                  type="button"
                                  onClick={() => onUpdateVariant(item.cartId, optionValue)}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                    isSelected
                                      ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100'
                                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                                  }`}
                                >
                                  {compactVariantLabel(row)}
                                </button>
                              );
                            })}
                          </div>
                        ) : variantOptions.length > 0 ? (
                          <select
                            value={variantOptionValue(item.selectedVariantSize, item.selectedVariantColor)}
                            onChange={(e) => onUpdateVariant(item.cartId, e.target.value)}
                            className="min-h-[40px] w-full min-w-0 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                          >
                            {variantOptions.map((row, variantIndex) => (
                              <option
                                key={`${item._id}-${variantIndex}-${variantOptionValue(row.size, row.color)}`}
                                value={variantOptionValue(row.size, row.color)}
                                className="bg-gray-900"
                              >
                                {variantOptionLabel(row)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="inline-flex min-h-[40px] items-center rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                            Standard item
                          </div>
                        )}
                        {(item.selectedVariantSize || item.selectedVariantColor) && (
                          <div className="text-[11px] text-cyan-100">
                            {[item.selectedVariantSize, item.selectedVariantColor].filter(Boolean).join(' / ')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-center">
                      <div className="flex justify-center">
                        <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 p-1">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-sm font-semibold text-white hover:bg-white/10"
                            onClick={() => onUpdateQuantity(item.cartId, -1)}
                            aria-label={`Decrease quantity for ${item.name}`}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => {
                              const nextValue = Number(e.target.value || 0);
                              if (!Number.isFinite(nextValue) || nextValue < 1) return;
                              onSetQuantity(item.cartId, Math.floor(nextValue));
                            }}
                            className="h-7 w-14 rounded-md border border-transparent bg-transparent px-1 text-center text-sm font-semibold text-white outline-none focus:border-cyan-400/50 focus:bg-white/5"
                            aria-label={`Quantity for ${item.name}`}
                          />
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 text-sm font-semibold text-white hover:bg-white/10"
                            onClick={() => onUpdateQuantity(item.cartId, 1)}
                            aria-label={`Increase quantity for ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-center">
                      {item.serialNumberTracking ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <label
                            htmlFor={`sale-serial-tracking-${item.cartId}`}
                            className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold ${
                              item.saleSerialTrackingEnabled
                                ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                                : 'border-white/10 bg-white/5 text-gray-300'
                            }`}
                            title={serialTrackingHelpText}
                          >
                            <input
                              id={`sale-serial-tracking-${item.cartId}`}
                              type="checkbox"
                              checked={Boolean(item.saleSerialTrackingEnabled)}
                              onChange={(e) => onUpdateField(item.cartId, 'saleSerialTrackingEnabled', e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-white/20 bg-slate-900/70"
                            />
                            <span>Track</span>
                            <HelpDot title={serialTrackingHelpText} />
                          </label>
                          <div className={`text-[11px] ${item.saleSerialTrackingEnabled ? serialCountTone : 'text-gray-500'}`}>
                            {item.saleSerialTrackingEnabled ? `Captured ${serialCount}/${item.quantity}` : 'Off'}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex min-h-[36px] items-center justify-center text-[11px] text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <div className="text-sm font-semibold text-white">{formatCurrency(lineTotal)}</div>
                      <div className="mt-1 text-[11px] text-gray-400">{formatCurrency(item.price)} x {item.quantity}</div>
                    </td>
                    <td className="px-3 py-2.5 align-top text-right">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                        onClick={() => onRemove(item.cartId)}
                        aria-label={`Delete ${item.name} from cart`}
                        title={`Delete ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Delete</span>
                      </button>
                    </td>
                  </tr>

                  {hasDetailRow ? (
                    <tr className={hasValidationState ? 'bg-rose-500/[0.03]' : 'bg-white/[0.02]'}>
                      <td colSpan={6} className="px-3 pb-4 pt-0">
                        <div className={`rounded-xl border px-3 py-3 ${
                          hasValidationState
                            ? 'border-rose-400/20 bg-rose-500/[0.04]'
                            : 'border-white/10 bg-white/[0.03]'
                        }`}>
                          <div className={`grid gap-3 ${
                            item.serialNumberTracking && (item.batchTracking || item.expiryRequired)
                              ? 'xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]'
                              : ''
                          }`}>
                            {(item.batchTracking || item.expiryRequired) ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                {item.batchTracking ? (
                                  <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Batch Required</label>
                                    <input
                                      value={item.batchNo || ''}
                                      onChange={(e) => onUpdateField(item.cartId, 'batchNo', e.target.value)}
                                      placeholder="Batch / lot number"
                                      className="min-h-[40px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                                    />
                                    <p className="mt-1 text-[11px] text-gray-500">Enter batch / lot number</p>
                                  </div>
                                ) : null}
                                {item.expiryRequired ? (
                                  <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">Expiry Date</label>
                                    <input
                                      type="date"
                                      ref={(node) => {
                                        expiryInputRefs.current[item.cartId] = node;
                                      }}
                                      value={item.expiryDate || ''}
                                      onChange={(e) => onUpdateField(item.cartId, 'expiryDate', e.target.value)}
                                      className={`min-h-[40px] w-full rounded-md border px-3 py-2 text-xs text-white ${
                                        cartValidationErrors[item.cartId]?.expiryDate
                                          ? 'border-rose-400/50 bg-rose-500/10'
                                          : 'border-white/10 bg-white/5'
                                      }`}
                                    />
                                    {cartValidationErrors[item.cartId]?.expiryDate ? (
                                      <p className="mt-1 text-[11px] text-rose-300">{cartValidationErrors[item.cartId]?.expiryDate}</p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {item.serialNumberTracking && item.saleSerialTrackingEnabled ? (
                              <div className="space-y-3">
                                {item.saleSerialTrackingEnabled ? (
                                  <div>
                                    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
                                      Serial Numbers
                                    </label>
                                    <textarea
                                      ref={(node) => {
                                        serialInputRefs.current[item.cartId] = node;
                                      }}
                                      rows={2}
                                      value={item.serialNumbersText || ''}
                                      onChange={(e) => onUpdateField(item.cartId, 'serialNumbersText', e.target.value)}
                                      placeholder="One unique serial per line or comma separated"
                                      className={`w-full rounded-md border px-3 py-2 text-xs text-white ${
                                        cartValidationErrors[item.cartId]?.serialNumbersText
                                          ? 'border-rose-400/50 bg-rose-500/10'
                                          : 'border-white/10 bg-white/5'
                                      }`}
                                    />
                                    <div className={`mt-1 flex items-center justify-between gap-3 text-[11px] ${serialCountTone}`}>
                                      <span>Captured {serialCount} / {item.quantity}</span>
                                      <span className="text-gray-500">One serial per unit</span>
                                    </div>
                                    {cartValidationErrors[item.cartId]?.serialNumbersText ? (
                                      <p className="mt-1 text-[11px] text-rose-300">{cartValidationErrors[item.cartId]?.serialNumbersText}</p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesCartTable;
