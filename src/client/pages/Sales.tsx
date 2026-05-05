import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from '@mui/material';
import { CardTabs } from '../components/CardTabs';
import { CodeScannerSettingsDialog } from '../components/CodeScannerSettingsDialog';
import { FloatingField } from '../components/FloatingField';
import { ManualHelpLink } from '../components/ManualHelpLink';
import { SalesCartTable } from '../components/SalesCartTable';
import { ActionIconButton } from '../components/ActionIconButton';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useCodeScannerCapture } from '../hooks/useCodeScannerCapture';
import { formatCurrency } from '../config';
import { IProduct } from '@shared/types';
import {
  GeneralSettings,
  getGeneralSettings,
  loadGeneralSettingsFromServer,
} from '../utils/generalSettings';
import { printInvoice, PrintableSale } from '../utils/invoicePrint';
import { showAlertDialog, showConfirmDialog } from '../utils/appDialogs';
import {
  getCodeScannerModeLabel,
  getCodeScannerSettings,
  getCodeScannerSubmitLabel,
  isConfiguredScannerSubmitKey,
  saveCodeScannerSettings,
} from '../utils/codeScanner';
import {
  clearOfflineSalesSnapshot,
  computeRetryDelayMs,
  createOfflineSalesBackup,
  deleteDraftSale,
  deleteHeldSale,
  generateOfflineInvoiceNumber,
  getCachedProductCatalog,
  getOfflineRoundOffMode,
  getOfflineSalesBackup,
  listDraftSales,
  listHeldSales,
  listQueuedOfflineSales,
  loadOfflineSalesSnapshot,
  mergeCachedCustomers,
  OfflinePaymentSplit,
  OfflineSaleSnapshot,
  OfflineSavedSaleRecord,
  replaceCachedProductCatalog,
  restoreOfflineSalesBackup,
  SalesRoundOffMode,
  saveHeldSale,
  saveOfflineRoundOffMode,
  saveOfflineSalesSnapshot,
  searchCachedProducts,
  searchCachedCustomers,
  updateQueuedOfflineSale,
  removeQueuedOfflineSale,
  queueOfflineSale,
} from '../utils/offlineSales';

interface CartItem extends IProduct {
  quantity: number;
  cartId: string;
  selectedVariantSize?: string;
  selectedVariantColor?: string;
  saleSerialTrackingEnabled?: boolean;
  serialNumbers?: string[];
  serialNumbersText?: string;
  batchNo?: string;
  expiryDate?: string;
  offlineStockDiscrepancy?: boolean;
}

interface CartValidationError {
  expiryDate?: string;
  serialNumbersText?: string;
}

interface CompletedSale extends PrintableSale {
  _id?: string;
}

interface MembershipPreview {
  memberId: string;
  memberName: string;
  planName: string;
  discountAmount: number;
  redeemPoints: number;
  redeemValue: number;
  finalPayable: number;
  earnedPoints: number;
  rewardPointsBalance: number;
}

interface CustomerOption {
  _id: string;
  customerCode?: string;
  memberCode?: string;
  memberSubscriptionId?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  source?: 'customer' | 'member';
  memberStatus?: string;
}

interface CustomerCreditNote {
  _id: string;
  noteNumber: string;
  balanceAmount: number;
  totalAmount?: number;
  reason?: string;
  status?: string;
}

interface CustomerCreditBalance {
  totalIssued: number;
  balance: number;
  notes: CustomerCreditNote[];
}

type SalesEditorDialog = 'discount' | 'membership' | 'store_credit' | 'payment' | 'invoice_settings';

type CompactSalesOption = {
  value: string;
  label: string;
  help: string;
  example?: string;
};

type SyncIndicatorState = 'synced' | 'syncing' | 'offline';

const salesTooltipSlotProps = {
  tooltip: {
    sx: {
      bgcolor: '#111827',
      color: '#e5eefc',
      border: '1px solid rgba(103, 232, 249, 0.25)',
      borderRadius: '12px',
      boxShadow: '0 18px 48px rgba(8, 15, 40, 0.45)',
      px: 1.5,
      py: 1.25,
    },
  },
  arrow: {
    sx: {
      color: '#111827',
    },
  },
} as const;

const buildSalesTooltip = (title: string, description: string, example?: string) => (
  <div className="max-w-[280px] space-y-2 text-[12px] leading-5">
    <p className="font-semibold text-white">{title}</p>
    <p>{description}</p>
    {example ? (
      <>
        <p className="font-semibold text-white">Example</p>
        <p>{example}</p>
      </>
    ) : null}
  </div>
);

const focusSalesOptionButton = (group: HTMLElement | null, nextIndex: number) => {
  group?.querySelector<HTMLButtonElement>(`[data-option-index="${nextIndex}"]`)?.focus();
};

const handleSalesOptionKeyDown = (
  event: React.KeyboardEvent<HTMLButtonElement>,
  optionIndex: number,
  options: readonly CompactSalesOption[],
  onSelect: (value: string) => void
) => {
  if (options.length === 0) return;

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(options[optionIndex]?.value || '');
    return;
  }

  let nextIndex = optionIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (optionIndex + 1) % options.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (optionIndex - 1 + options.length) % options.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = options.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  onSelect(options[nextIndex]?.value || '');
  const group = event.currentTarget.closest('[data-option-group]') as HTMLElement | null;
  window.requestAnimationFrame(() => focusSalesOptionButton(group, nextIndex));
};

const SalesTooltipChip: React.FC<{
  title: React.ReactNode;
  ariaLabel: string;
  className?: string;
}> = ({ title, ariaLabel, className = '' }) => (
  <Tooltip arrow placement="top-start" title={title} slotProps={salesTooltipSlotProps}>
    <button
      type="button"
      aria-label={ariaLabel}
      className={`inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 transition hover:border-cyan-300/70 hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 ${className}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
        <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 8.35v4.7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        <circle cx="10" cy="5.7" r="1" fill="currentColor" />
      </svg>
    </button>
  </Tooltip>
);

const SalesSectionHeader: React.FC<{
  title: string;
  tooltip: React.ReactNode;
  compact?: boolean;
}> = ({ title, tooltip, compact = false }) => (
  <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{title}</p>
    <SalesTooltipChip title={tooltip} ariaLabel={`${title} help`} />
  </div>
);

const CompactOptionGroup: React.FC<{
  title: string;
  titleTooltip: React.ReactNode;
  options: readonly CompactSalesOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  accentClassByValue?: Record<string, string>;
  columnsClassName?: string;
  className?: string;
}> = ({
  title,
  titleTooltip,
  options,
  selectedValue,
  onSelect,
  accentClassByValue = {},
  columnsClassName = 'grid grid-cols-2 gap-2',
  className = '',
}) => (
  <div className={`rounded-xl border border-white/10 bg-black/10 p-3 ${className}`}>
    <SalesSectionHeader title={title} tooltip={titleTooltip} compact />
    <div role="radiogroup" aria-label={title} className={columnsClassName} data-option-group={title}>
      {options.map((option, optionIndex) => {
        const selected = selectedValue === option.value;
        const selectedClass =
          accentClassByValue[option.value]
          || 'border-indigo-400/40 bg-indigo-500/85 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]';
        return (
          <Tooltip
            key={option.value}
            arrow
            placement="top-start"
            title={buildSalesTooltip(option.label, option.help, option.example)}
            slotProps={salesTooltipSlotProps}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${title}: ${option.label}`}
              data-option-index={optionIndex}
              onClick={() => onSelect(option.value)}
              onKeyDown={(event) => handleSalesOptionKeyDown(event, optionIndex, options, onSelect)}
              className={`group flex min-h-[50px] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${
                selected
                  ? selectedClass
                  : 'border-white/10 bg-white/5 text-gray-200 hover:border-white/20 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="min-w-0 text-[13px] font-semibold leading-4">{option.label}</span>
              <span
                aria-hidden="true"
                className={`inline-flex h-3 w-3 shrink-0 rounded-full border transition ${
                  selected
                    ? 'border-white/50 bg-white/90'
                    : 'border-white/20 bg-transparent group-hover:border-white/35'
                }`}
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  </div>
);

const SalesChoiceRow: React.FC<{
  title: string;
  titleTooltip: React.ReactNode;
  options: readonly CompactSalesOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  accentClassByValue?: Record<string, string>;
  className?: string;
}> = ({
  title,
  titleTooltip,
  options,
  selectedValue,
  onSelect,
  accentClassByValue = {},
  className = '',
}) => (
  <div className={`grid gap-2 xl:grid-cols-[132px_minmax(0,1fr)] xl:items-center ${className}`}>
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-200">{title}</span>
      <SalesTooltipChip title={titleTooltip} ariaLabel={`${title} help`} />
    </div>
    <div role="radiogroup" aria-label={title} className="grid grid-cols-2 gap-2" data-option-group={title}>
      {options.map((option, optionIndex) => {
        const selected = selectedValue === option.value;
        const selectedClass =
          accentClassByValue[option.value]
          || 'border-indigo-400/40 bg-indigo-500/85 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]';
        return (
          <Tooltip
            key={option.value}
            arrow
            placement="top-start"
            title={buildSalesTooltip(option.label, option.help, option.example)}
            slotProps={salesTooltipSlotProps}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${title}: ${option.label}`}
              data-option-index={optionIndex}
              onClick={() => onSelect(option.value)}
              onKeyDown={(event) => handleSalesOptionKeyDown(event, optionIndex, options, onSelect)}
              className={`group flex min-h-[46px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${
                selected
                  ? selectedClass
                  : 'border-white/10 bg-white/5 text-gray-200 hover:border-white/20 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="min-w-0 text-[13px] font-semibold leading-4">{option.label}</span>
              <span
                aria-hidden="true"
                className={`inline-flex h-3 w-3 shrink-0 rounded-full border transition ${
                  selected
                    ? 'border-white/50 bg-white/90'
                    : 'border-white/20 bg-transparent group-hover:border-white/35'
                }`}
              />
            </button>
          </Tooltip>
        );
      })}
    </div>
  </div>
);

const SalesDialog: React.FC<{
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
  onSubmit?: () => void;
  submitLabel?: string;
}> = ({ title, description, onClose, children, maxWidthClassName = 'max-w-3xl', onSubmit, submitLabel = 'Done' }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const firstFocusable =
      dialog.querySelector<HTMLElement>('[data-sales-dialog-autofocus="true"]')
      || dialog.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([data-sales-dialog-close])'
      );
    firstFocusable?.focus();
  }, []);

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onSubmit || event.defaultPrevented || event.shiftKey || event.key !== 'Enter') return;

    const target = event.target as HTMLElement | null;
    const tagName = String(target?.tagName || '').toLowerCase();
    const inputType = target instanceof HTMLInputElement ? String(target.type || '').toLowerCase() : '';
    if (tagName === 'textarea' || tagName === 'select' || tagName === 'button') return;
    if (inputType === 'checkbox' || inputType === 'radio' || inputType === 'submit') return;

    event.preventDefault();
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/70 px-4 py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDownCapture={handleKeyDownCapture}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-[28px] border border-white/10 bg-gray-950/95 p-5 shadow-2xl sm:p-6 ${maxWidthClassName}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Sales Workspace</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{title}</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-400">{description}</p>
          </div>
          <button
            type="button"
            data-sales-dialog-close="true"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10"
            aria-label={`Close ${title}`}
            title="Close dialog (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="mt-5">{children}</div>
        {onSubmit ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">Press Enter to save and close. Press Esc to cancel.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onSubmit}
                className="min-h-[42px] rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                {submitLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const normalizePhone = (value: string): string => String(value || '').replace(/\D+/g, '').slice(-10);
type ProductViewMode = 'grid' | 'table' | 'title' | 'image';
const PRODUCT_VIEW_MODE_KEY = 'sales-product-view-mode';
const CATALOG_VISIBILITY_KEY = 'sales-catalog-visible';
const PRODUCTS_PER_PAGE = 12;
const PRODUCT_FETCH_BATCH_SIZE = 36;
const PRODUCT_SCROLL_THRESHOLD_PX = 140;
const CATALOG_SEARCH_DEBOUNCE_MS = 140;
const CATALOG_SEARCH_RESULT_LIMIT = 48;
const getCatalogProductId = (product: Pick<IProduct, '_id' | 'sku' | 'name'> | null | undefined) =>
  String(product?._id || product?.sku || product?.name || '');
const requiresStockTracking = (product: Pick<IProduct, 'itemType'> | null | undefined): boolean =>
  String(product?.itemType || 'inventory') === 'inventory';
const itemTypeLabel = (product: Pick<IProduct, 'itemType'> | null | undefined): string =>
  String(product?.itemType || 'inventory').replace('_', ' ');
const toSimpleWarning = (message?: string): string => {
  const text = String(message || '').trim();
  const normalized = text.toLowerCase();
  if (!text) return 'Could not save invoice. Please try again.';
  if (normalized.includes('e11000') || normalized.includes('duplicate key')) {
    if (text.includes('saleNumber')) return 'Invoice number conflict happened. Please click Save/Create again.';
    if (text.includes('invoiceNumber')) return 'Invoice number already exists. Please use another invoice number.';
    return 'Duplicate number found. Please try again.';
  }
  return text;
};

const normalizeVariantValue = (value: unknown): string => String(value || '').trim();
const getVariantOptions = (product: Pick<IProduct, 'variantMatrix'> | null | undefined) =>
  Array.isArray(product?.variantMatrix)
    ? product.variantMatrix.filter((row) =>
      row?.isActive !== false && (
        normalizeVariantValue(row?.size)
        || normalizeVariantValue(row?.color)
        || normalizeVariantValue(row?.skuSuffix)
        || normalizeVariantValue(row?.barcode)
        || Number(row?.price || 0) > 0
      )
    )
    : [];
const variantOptionValue = (size?: string, color?: string) => `${normalizeVariantValue(size)}|||${normalizeVariantValue(color)}`;
const variantOptionLabel = (row: { size?: string; color?: string; skuSuffix?: string; price?: number }) => {
  const parts = [normalizeVariantValue(row.size), normalizeVariantValue(row.color)].filter(Boolean);
  const base = parts.join(' / ') || normalizeVariantValue(row.skuSuffix) || 'Variant';
  const extraPrice = Number(row.price || 0) > 0 ? ` • ${formatCurrency(Number(row.price || 0))}` : '';
  return `${base}${extraPrice}`;
};
const resolveVariantRow = (
  product: Pick<IProduct, 'variantMatrix' | 'price'> | null | undefined,
  size?: string,
  color?: string
) => {
  const normalizedSize = normalizeVariantValue(size).toLowerCase();
  const normalizedColor = normalizeVariantValue(color).toLowerCase();
  return getVariantOptions(product).find((row) =>
    normalizeVariantValue(row.size).toLowerCase() === normalizedSize
    && normalizeVariantValue(row.color).toLowerCase() === normalizedColor
  ) || null;
};
const variantUnitPrice = (
  product: Pick<IProduct, 'variantMatrix' | 'price' | 'promotionalPrice' | 'promotionStartDate' | 'promotionEndDate' | 'priceTiers'>,
  size?: string,
  color?: string
): number => resolveCatalogUnitPrice(product, 1, size, color);
const findVariantByCode = (product: IProduct, rawCode: string) => {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  return getVariantOptions(product).find((row) => String(row.barcode || '').trim().toUpperCase() === code) || null;
};
const normalizeSerialNumbers = (value: string): string[] =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[\n,]+/)
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean)
    )
  );

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash', help: 'Choose cash when the customer is paying across the counter right now.', example: 'Example: the bill is 750 and the customer pays with notes immediately.' },
  { value: 'card', label: 'Card', help: 'Choose card for POS machine, debit card, credit card, or swipe terminal collection.', example: 'Example: the cashier charges the bill on a card machine and gets the approval slip.' },
  { value: 'upi', label: 'UPI', help: 'Choose UPI when payment is collected by QR scan or UPI transfer.', example: 'Example: the customer scans the QR code and shows the successful UPI screen.' },
  { value: 'bank_transfer', label: 'Bank Transfer', help: 'Choose bank transfer for direct bank receipt such as NEFT, IMPS, RTGS, or office transfer.', example: 'Example: a school or company transfers the invoice amount from its bank account.' },
] as const;

const invoiceTypeOptions = [
  { value: 'cash', label: 'Paid Now', help: 'Use this when the sale should be treated as immediate collection.', example: 'Example: a walk-in customer buys goods and pays today.' },
  { value: 'credit', label: 'Pay Later', help: 'Use this when the sale is delivered now but some or all money will be collected later.', example: 'Example: a school takes the stock today and will settle the payment next week.' },
] as const;

const invoiceStatusOptions = [
  { value: 'posted', label: 'Finalise Invoice', help: 'Use this to finalize the bill and update stock, sales, and accounting immediately.', example: 'Example: the cashier has reviewed the bill and is ready to complete it.' },
  { value: 'draft', label: 'Save as Draft', help: 'Use this to keep a working invoice without final posting.', example: 'Example: staff is still waiting for approval, final quantities, or customer confirmation.' },
] as const;

const taxBillOptions = [
  { value: 'gst', label: 'GST Bill', help: 'Use the normal GST invoice when tax must be calculated and shown on the bill.', example: 'Example: a standard taxable retail sale with GST breakup on the invoice.' },
  { value: 'non_gst', label: 'Non-GST Bill', help: 'Use this only when the bill should be saved without GST billing.', example: 'Example: a non-taxable transaction or a business case where GST should not be applied.' },
] as const;

const invoiceNumberOptions = [
  { value: 'auto', label: 'Auto Number', help: 'Let the system generate the next running invoice number.', example: 'Example: normal day-to-day billing where numbering should stay continuous.' },
  { value: 'manual', label: 'Manual Number', help: 'Use a specific invoice number only when business rules require it.', example: 'Example: you are matching a pre-printed book or migrating a number from another system.' },
] as const;

const roundTo2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const resolvePromotionalUnitPrice = (
  product: Pick<IProduct, 'promotionalPrice' | 'promotionStartDate' | 'promotionEndDate'>,
  now = new Date()
): number | null => {
  const promotionalPrice = Number(product.promotionalPrice || 0);
  if (promotionalPrice <= 0) return null;

  const start = product.promotionStartDate ? new Date(product.promotionStartDate) : null;
  const end = product.promotionEndDate ? new Date(product.promotionEndDate) : null;
  if (start && !Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) return null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < now.getTime()) return null;

  return roundTo2(promotionalPrice);
};

const resolveTierUnitPrice = (
  product: Pick<IProduct, 'priceTiers'>,
  quantity: number
): number | null => {
  const rows = Array.isArray(product.priceTiers) ? product.priceTiers : [];
  if (!rows.length) return null;

  const normalizedQuantity = Math.max(1, Number(quantity || 1));
  const applicable = rows
    .map((row) => ({
      minQuantity: Math.max(1, Number(row?.minQuantity || 1)),
      unitPrice: Number(row?.unitPrice || 0),
    }))
    .filter((row) => row.unitPrice > 0 && normalizedQuantity >= row.minQuantity)
    .sort((a, b) => {
      if (b.minQuantity !== a.minQuantity) return b.minQuantity - a.minQuantity;
      return a.unitPrice - b.unitPrice;
    });

  return applicable.length ? roundTo2(applicable[0].unitPrice) : null;
};

const resolveCatalogUnitPrice = (
  product: Pick<IProduct, 'price' | 'promotionalPrice' | 'promotionStartDate' | 'promotionEndDate' | 'priceTiers' | 'variantMatrix'>,
  quantity: number,
  size?: string,
  color?: string
): number => {
  const row = resolveVariantRow(product, size, color);
  const rowPrice = Number(row?.price || 0);
  if (rowPrice > 0) return roundTo2(rowPrice);

  const candidates = [Number(product.price || 0)].filter((value) => value > 0);
  const tierPrice = resolveTierUnitPrice(product, quantity);
  if (tierPrice !== null) candidates.push(tierPrice);

  const promotionalPrice = resolvePromotionalUnitPrice(product);
  if (promotionalPrice !== null) candidates.push(promotionalPrice);

  if (!candidates.length) return 0;
  return roundTo2(Math.min(...candidates));
};

const syncCartPricing = (items: CartItem[]) => {
  const changes: Array<{ name: string; previousPrice: number; nextPrice: number }> = [];
  const nextItems = items.map((item) => {
    const nextPrice = resolveCatalogUnitPrice(
      item,
      Number(item.quantity || 1),
      item.selectedVariantSize,
      item.selectedVariantColor
    );
    const previousPrice = roundTo2(Number(item.price || 0));
    if (Math.abs(previousPrice - nextPrice) <= 0.01) return item;

    changes.push({
      name: item.name,
      previousPrice,
      nextPrice,
    });
    return {
      ...item,
      price: nextPrice,
    };
  });

  return { items: nextItems, changes };
};

const roundByMode = (value: number, mode: SalesRoundOffMode) => {
  const amount = Math.max(0, Number(value || 0));
  if (mode === 'nearest_050') return Math.round(amount * 2) / 2;
  if (mode === 'nearest_1') return Math.round(amount);
  if (mode === 'nearest_5_up') return Math.ceil(amount / 5) * 5;
  if (mode === 'nearest_5_down') return Math.floor(amount / 5) * 5;
  return amount;
};

const roundOffModeOptions: Array<{ value: SalesRoundOffMode; label: string }> = [
  { value: 'none', label: 'Never round off' },
  { value: 'nearest_050', label: 'Nearest 0.50 rupee' },
  { value: 'nearest_1', label: 'Nearest 1 rupee' },
  { value: 'nearest_5_up', label: 'Round up to 5 rupees' },
  { value: 'nearest_5_down', label: 'Round down to 5 rupees' },
];

const splitPaymentMethodOptions: Array<{ value: OfflinePaymentSplit['method']; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
];

const createPaymentSplitRow = (method: OfflinePaymentSplit['method'] = 'cash'): OfflinePaymentSplit => ({
  id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  method,
  amount: '',
  receivedAmount: '',
  note: '',
});

export const Sales = () => {
  const [products, setProducts] = useState<IProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCatalogPanel, setShowCatalogPanel] = useState<boolean>(() => localStorage.getItem(CATALOG_VISIBILITY_KEY) === '1');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedCatalogSearchTerm, setDebouncedCatalogSearchTerm] = useState('');
  const [catalogSearchResults, setCatalogSearchResults] = useState<IProduct[]>([]);
  const [catalogSearchLoading, setCatalogSearchLoading] = useState(false);
  const [inlineProductSearch, setInlineProductSearch] = useState('');
  const [inlineSearchResults, setInlineSearchResults] = useState<IProduct[]>([]);
  const [inlineSearchLoading, setInlineSearchLoading] = useState(false);
  const [inlineActiveIndex, setInlineActiveIndex] = useState(0);
  const [productViewMode, setProductViewMode] = useState<ProductViewMode>(() => {
    const saved = localStorage.getItem(PRODUCT_VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'table' || saved === 'title' || saved === 'image') return saved;
    return 'grid';
  });
  const [enableProductScanner, setEnableProductScanner] = useState(false);
  const [showScannerSettings, setShowScannerSettings] = useState(false);
  const [scannerSettings, setScannerSettings] = useState(() => getCodeScannerSettings());
  const [scanCode, setScanCode] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [catalogSelectedProductId, setCatalogSelectedProductId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [productTotalCount, setProductTotalCount] = useState(0);
  const [activeProductId, setActiveProductId] = useState('');
  const [addFeedbackText, setAddFeedbackText] = useState('');
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [quickSearchResults, setQuickSearchResults] = useState<IProduct[]>([]);
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickActiveIndex, setQuickActiveIndex] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [processing, setProcessing] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'cash' | 'credit'>('cash');
  const [invoiceStatus, setInvoiceStatus] = useState<'posted' | 'draft'>('posted');
  const [isGstBill, setIsGstBill] = useState(true);
  const [invoiceNumberMode, setInvoiceNumberMode] = useState<'auto' | 'manual'>('auto');
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [roundOffMode, setRoundOffMode] = useState<SalesRoundOffMode>(() => getOfflineRoundOffMode());
  const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [settings, setSettings] = useState<GeneralSettings>(() => getGeneralSettings());
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState('');
  const [checkoutWarningMessage, setCheckoutWarningMessage] = useState('');
  const [cartValidationErrors, setCartValidationErrors] = useState<Record<string, CartValidationError>>({});

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isWalkInCustomer, setIsWalkInCustomer] = useState(false);
  const [membershipLookupCode, setMembershipLookupCode] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerMatches, setCustomerMatches] = useState<CustomerOption[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [customerActiveIndex, setCustomerActiveIndex] = useState(0);
  const [saleNotes, setSaleNotes] = useState('');
  const [membershipRedeemPoints, setMembershipRedeemPoints] = useState('');
  const [membershipPreview, setMembershipPreview] = useState<MembershipPreview | null>(null);
  const [applyingMembership, setApplyingMembership] = useState(false);
  const [customerCredit, setCustomerCredit] = useState<CustomerCreditBalance | null>(null);
  const [loadingCustomerCredit, setLoadingCustomerCredit] = useState(false);
  const [selectedCreditNoteId, setSelectedCreditNoteId] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');
  const [paymentSplits, setPaymentSplits] = useState<OfflinePaymentSplit[]>([createPaymentSplitRow('cash')]);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [syncIndicatorState, setSyncIndicatorState] = useState<SyncIndicatorState>('synced');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [queuedSalesCount, setQueuedSalesCount] = useState(0);
  const [heldSales, setHeldSales] = useState<OfflineSavedSaleRecord[]>([]);
  const [draftSales, setDraftSales] = useState<OfflineSavedSaleRecord[]>([]);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeSnapshot, setResumeSnapshot] = useState<OfflineSaleSnapshot | null>(null);
  const [showOfflineTools, setShowOfflineTools] = useState(false);
  const [activeSalesDialog, setActiveSalesDialog] = useState<SalesEditorDialog | null>(null);
  const [showBillingMoreOptions, setShowBillingMoreOptions] = useState(false);
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState('');
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
  const productFetchSeqRef = useRef(0);
  const activeProductTimerRef = useRef<number | null>(null);
  const activeProductAnimationFrameRef = useRef<number | null>(null);
  const addFeedbackTimerRef = useRef<number | null>(null);
  const cartItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const expiryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const serialInputRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const quickSearchSeqRef = useRef(0);
  const catalogSearchSeqRef = useRef(0);
  const quickSearchInputRef = useRef<HTMLInputElement | null>(null);
  const inlineSearchSeqRef = useRef(0);
  const inlineSearchInputRef = useRef<HTMLInputElement | null>(null);
  const scannerInputRef = useRef<HTMLInputElement | null>(null);
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);
  const catalogDialogRef = useRef<HTMLDivElement | null>(null);
  const catalogTableRef = useRef<HTMLDivElement | null>(null);
  const offlineSnapshotLoadedRef = useRef(false);

  const updateSyncIndicator = (queuedCount: number, online = isOnline, syncing = syncingQueue) => {
    if (!online && queuedCount > 0) {
      setSyncIndicatorState('offline');
      return;
    }
    if (syncing) {
      setSyncIndicatorState('syncing');
      return;
    }
    if (!online) {
      setSyncIndicatorState('offline');
      return;
    }
    setSyncIndicatorState(queuedCount > 0 ? 'syncing' : 'synced');
  };

  const resetPaymentSplits = (method: OfflinePaymentSplit['method'] = 'cash') => {
    setPaymentSplits([createPaymentSplitRow(method)]);
  };

  const clearSaleEditor = (options?: { preserveCheckoutMessage?: boolean }) => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerAddress('');
    setSelectedCustomerId('');
    setCustomerMatches([]);
    setSearchingCustomers(false);
    setCustomerActiveIndex(0);
    setSaleNotes('');
    setInvoiceType('cash');
    setInvoiceStatus('posted');
    setIsGstBill(true);
    setInvoiceNumberMode('auto');
    setManualInvoiceNumber('');
    setPaidAmount('');
    setDiscountType('amount');
    setDiscountValue('');
    setMembershipRedeemPoints('');
    setMembershipPreview(null);
    setCustomerCredit(null);
    setSelectedCreditNoteId('');
    setCreditNoteAmount('');
    setCartValidationErrors({});
    setCheckoutWarningMessage('');
    setIsWalkInCustomer(false);
    setMembershipLookupCode('');
    setPaymentMethod('cash');
    resetPaymentSplits('cash');
    setShowBillingMoreOptions(false);
    if (!options?.preserveCheckoutMessage) {
      setCheckoutMessage('');
    }
    void clearOfflineSalesSnapshot();
  };

  const buildOfflineSnapshot = (): OfflineSaleSnapshot => ({
    cart,
    paymentMethod: paymentMethod as OfflinePaymentSplit['method'],
    invoiceType,
    invoiceStatus,
    isGstBill,
    invoiceNumberMode,
    manualInvoiceNumber,
    paidAmount,
    discountType,
    discountValue,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    selectedCustomerId,
    saleNotes,
    membershipRedeemPoints,
    selectedCreditNoteId,
    creditNoteAmount,
    isWalkInCustomer,
    membershipLookupCode,
    roundOffMode,
    paymentSplits,
    updatedAt: new Date().toISOString(),
  });

  const applyOfflineSnapshot = (snapshot: OfflineSaleSnapshot | null) => {
    if (!snapshot) return;
    setCart(snapshot.cart as CartItem[]);
    setPaymentMethod(snapshot.paymentMethod);
    setInvoiceType(snapshot.invoiceType);
    setInvoiceStatus(snapshot.invoiceStatus);
    setIsGstBill(snapshot.isGstBill);
    setInvoiceNumberMode(snapshot.invoiceNumberMode);
    setManualInvoiceNumber(snapshot.manualInvoiceNumber);
    setPaidAmount(snapshot.paidAmount);
    setDiscountType(snapshot.discountType);
    setDiscountValue(snapshot.discountValue);
    setCustomerName(snapshot.customerName);
    setCustomerPhone(snapshot.customerPhone);
    setCustomerEmail(snapshot.customerEmail);
    setCustomerAddress(snapshot.customerAddress);
    setSelectedCustomerId(snapshot.selectedCustomerId);
    setSaleNotes(snapshot.saleNotes);
    setMembershipRedeemPoints(snapshot.membershipRedeemPoints);
    setSelectedCreditNoteId(snapshot.selectedCreditNoteId);
    setCreditNoteAmount(snapshot.creditNoteAmount);
    setIsWalkInCustomer(snapshot.isWalkInCustomer);
    setMembershipLookupCode(snapshot.membershipLookupCode);
    setRoundOffMode(snapshot.roundOffMode);
    setPaymentSplits(snapshot.paymentSplits.length ? snapshot.paymentSplits : [createPaymentSplitRow(snapshot.paymentMethod)]);
    setCartValidationErrors({});
    setCheckoutWarningMessage('');
  };

  const refreshOfflineCollections = async () => {
    const [queued, held, drafts, cachedCatalog] = await Promise.all([
      listQueuedOfflineSales(),
      listHeldSales(),
      listDraftSales(),
      getCachedProductCatalog(),
    ]);
    setQueuedSalesCount(queued.length);
    setHeldSales(held);
    setDraftSales(drafts);
    setCatalogUpdatedAt(cachedCatalog.updatedAt || '');
    updateSyncIndicator(queued.length, navigator.onLine, syncingQueue);
  };

  const restoreLatestBackup = async () => {
    const backup = getOfflineSalesBackup();
    if (!backup) {
      await showAlertDialog('No local backup is available yet.');
      return;
    }
    const confirmed = await showConfirmDialog(
      `Recover the last local sales backup from ${new Date(backup.savedAt).toLocaleString('en-IN')}?`,
      {
        title: 'Recover Local Backup',
        confirmText: 'Recover',
        cancelText: 'Cancel',
        severity: 'warning',
      }
    );
    if (!confirmed) return;
    const restored = await restoreOfflineSalesBackup();
    if (!restored) {
      await showAlertDialog('Could not restore the last local backup.');
      return;
    }
    setResumeSnapshot(restored.state.activeSale || null);
    setShowResumePrompt(Boolean(restored.state.activeSale?.cart?.length));
    await refreshOfflineCollections();
    await showAlertDialog('Recovered the last local backup.');
  };

  const syncQueuedSales = async (manual = false) => {
    if (!navigator.onLine) {
      setSyncMessage('Offline mode is active. Pending sales will sync when the internet returns.');
      updateSyncIndicator(queuedSalesCount, false, false);
      return;
    }
    if (syncingQueue) return;

    const queue = await listQueuedOfflineSales();
    setQueuedSalesCount(queue.length);
    if (!queue.length) {
      setSyncMessage(manual ? 'Everything is already synced.' : '');
      updateSyncIndicator(0, true, false);
      return;
    }

    setSyncingQueue(true);
    updateSyncIndicator(queue.length, true, true);
    try {
      const token = localStorage.getItem('token');
      let syncedCount = 0;

      for (const item of queue) {
        if (item.nextRetryAt && item.nextRetryAt > Date.now()) continue;
        try {
          const response = await fetch('/api/sales', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(item.saleData),
          });
          const data = await response.json();
          if (data?.success) {
            syncedCount += 1;
            await removeQueuedOfflineSale(item.id);
            continue;
          }

          const errorText = String(data?.error || data?.message || 'Could not sync the queued sale.');
          if (errorText.toLowerCase().includes('invoice number already exists')) {
            const lookup = await fetch(`/api/sales?q=${encodeURIComponent(item.localInvoiceNumber)}&limit=1`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });
            const lookupData = await lookup.json();
            if (lookupData?.success && Array.isArray(lookupData?.data) && lookupData.data.some((row: any) =>
              String(row?.invoiceNumber || row?.saleNumber || '') === item.localInvoiceNumber
            )) {
              syncedCount += 1;
              await removeQueuedOfflineSale(item.id);
              continue;
            }
          }

          await updateQueuedOfflineSale(item.id, (current) => ({
            ...current,
            retryCount: current.retryCount + 1,
            nextRetryAt: Date.now() + computeRetryDelayMs(current.retryCount),
            lastError: errorText,
          }));
        } catch (error: any) {
          await updateQueuedOfflineSale(item.id, (current) => ({
            ...current,
            retryCount: current.retryCount + 1,
            nextRetryAt: Date.now() + computeRetryDelayMs(current.retryCount),
            lastError: error?.message || 'Network sync failed',
          }));
        }
      }

      const remaining = await listQueuedOfflineSales();
      setQueuedSalesCount(remaining.length);
      setSyncMessage(
        remaining.length === 0
          ? `All local sales are synced${syncedCount ? ` (${syncedCount} uploaded)` : ''}.`
          : manual
            ? `${syncedCount} queued sale${syncedCount === 1 ? '' : 's'} synced. ${remaining.length} still pending.`
            : ''
      );
      updateSyncIndicator(remaining.length, true, false);
      await refreshOfflineCollections();
    } finally {
      setSyncingQueue(false);
      const remaining = await listQueuedOfflineSales();
      setQueuedSalesCount(remaining.length);
      updateSyncIndicator(remaining.length, navigator.onLine, false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const merged = await loadGeneralSettingsFromServer(localStorage.getItem('token') || undefined);
      if (!cancelled) {
        setSettings(merged);
      }
    };
    const refreshFromStorage = () => setSettings(getGeneralSettings());

    void loadSettings();
    window.addEventListener('sarva-settings-updated', refreshFromStorage as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('sarva-settings-updated', refreshFromStorage as EventListener);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const snapshot = await loadOfflineSalesSnapshot();
      offlineSnapshotLoadedRef.current = true;
      if (snapshot?.cart?.length) {
        setResumeSnapshot(snapshot);
        setShowResumePrompt(true);
      }
      await refreshOfflineCollections();
      if (navigator.onLine) {
        void syncQueuedSales(false);
      }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(PRODUCT_VIEW_MODE_KEY, productViewMode);
  }, [productViewMode]);

  useEffect(() => {
    localStorage.setItem(CATALOG_VISIBILITY_KEY, showCatalogPanel ? '1' : '0');
  }, [showCatalogPanel]);

  useEffect(() => {
    saveOfflineRoundOffMode(roundOffMode);
  }, [roundOffMode]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void refreshOfflineCollections();
      void syncQueuedSales(false);
    };
    const onOffline = () => {
      setIsOnline(false);
      updateSyncIndicator(queuedSalesCount, false, false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [queuedSalesCount]);

  useEffect(() => {
    if (!offlineSnapshotLoadedRef.current) return;
    void saveOfflineSalesSnapshot(buildOfflineSnapshot());
  }, [
    cart,
    paymentMethod,
    invoiceType,
    invoiceStatus,
    isGstBill,
    invoiceNumberMode,
    manualInvoiceNumber,
    paidAmount,
    discountType,
    discountValue,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    selectedCustomerId,
    saleNotes,
    membershipRedeemPoints,
    selectedCreditNoteId,
    creditNoteAmount,
    isWalkInCustomer,
    membershipLookupCode,
    roundOffMode,
    paymentSplits,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void createOfflineSalesBackup();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (navigator.onLine) {
        void syncQueuedSales(false);
      } else {
        updateSyncIndicator(queuedSalesCount, false, false);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [queuedSalesCount, syncingQueue]);

  useEffect(() => {
    if (!enableProductScanner || !scannerSettings.autoFocusInput) return;
    const timer = window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [enableProductScanner, scannerSettings.autoFocusInput]);

  useEffect(() => {
    setProductPage(1);
  }, [searchTerm, productViewMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedCatalogSearchTerm(searchTerm.trim());
    }, CATALOG_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const fetchProducts = async (forceRefresh = false) => {
    const requestId = ++productFetchSeqRef.current;
    if (forceRefresh) setRefreshingCatalog(true);
    setLoading(true);
    setLoadingMoreProducts(false);
    setHasMoreProducts(false);

    try {
      const cached = await getCachedProductCatalog();
      if (requestId !== productFetchSeqRef.current) return;
      if (cached.products.length) {
        setProducts(cached.products);
        setProductTotalCount(cached.products.length);
        setCatalogUpdatedAt(cached.updatedAt || '');
        setLoading(false);
      }

      if (!navigator.onLine) {
        if (!cached.products.length) {
          setProducts([]);
          setProductTotalCount(0);
        }
        return;
      }

      const token = localStorage.getItem('token');
      const allProducts: IProduct[] = [];
      let skip = 0;
      let total = 0;

      while (true) {
        const params = new URLSearchParams({
          skip: String(skip),
          limit: '200',
        });
        const response = await fetch(`/api/products?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!data?.success) break;
        const rows: IProduct[] = Array.isArray(data.data) ? data.data : [];
        total = Math.max(total, Number(data?.pagination?.total || 0), rows.length);
        allProducts.push(...rows);
        skip += rows.length;
        if (!rows.length || (total > 0 && skip >= total)) break;
      }

      if (requestId !== productFetchSeqRef.current) return;
      if (allProducts.length) {
        setProducts(allProducts);
        setProductTotalCount(allProducts.length);
        setCatalogUpdatedAt(new Date().toISOString());
        await replaceCachedProductCatalog(allProducts);
      } else if (!cached.products.length) {
        setProducts([]);
        setProductTotalCount(0);
      }
    } catch (error) {
      console.error('Error fetching product catalog:', error);
    } finally {
      if (requestId !== productFetchSeqRef.current) return;
      setLoading(false);
      setRefreshingCatalog(false);
    }
  };

  useEffect(() => {
    if (!showCatalogPanel) return;
    void fetchProducts(false);
    const focusTimer = window.setTimeout(() => {
      productSearchInputRef.current?.focus();
      productSearchInputRef.current?.select();
    }, 20);
    return () => window.clearTimeout(focusTimer);
  }, [showCatalogPanel]);

  useEffect(() => {
    if (!showCatalogPanel) return;

    const handleFocusIn = (event: FocusEvent) => {
      const dialog = catalogDialogRef.current;
      const target = event.target as Node | null;
      if (!dialog || !target || dialog.contains(target)) return;

      productSearchInputRef.current?.focus();
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, [showCatalogPanel]);

  useEffect(() => {
    if (!showQuickAddModal) return;
    setQuickSearchTerm('');
    setQuickSearchResults(products.slice(0, 12));
    setQuickActiveIndex(0);
    const focusTimer = window.setTimeout(() => {
      quickSearchInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(focusTimer);
  }, [showQuickAddModal]);

  useEffect(() => {
    if (!showQuickAddModal) return;

    const query = quickSearchTerm.trim();
    if (!query) {
      setQuickSearchLoading(false);
      setQuickActiveIndex(0);
      setQuickSearchResults(products.slice(0, 12));
      return;
    }

    const requestId = ++quickSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setQuickSearchLoading(true);
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/products?skip=0&limit=20&q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (requestId !== quickSearchSeqRef.current) return;
          const rows = data?.success && Array.isArray(data.data) ? data.data : [];
          setQuickSearchResults(rows);
          setQuickActiveIndex(0);
        } catch {
          if (requestId !== quickSearchSeqRef.current) return;
          setQuickSearchResults([]);
        } finally {
          if (requestId !== quickSearchSeqRef.current) return;
          setQuickSearchLoading(false);
        }
      })();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [quickSearchTerm, showQuickAddModal, products]);

  useEffect(() => {
    const query = inlineProductSearch.trim();
    if (query.length < 2) {
      setInlineSearchResults([]);
      setInlineSearchLoading(false);
      setInlineActiveIndex(0);
      return;
    }

    const requestId = ++inlineSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setInlineSearchLoading(true);
          const cachedRows = await searchCachedProducts(query, 8);
          if (requestId !== inlineSearchSeqRef.current) return;
          if (cachedRows.length > 0) {
            setInlineSearchResults(cachedRows);
            setInlineActiveIndex(0);
          }

          const token = localStorage.getItem('token');
          const response = await fetch(`/api/products?skip=0&limit=8&q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (requestId !== inlineSearchSeqRef.current) return;
          const rows: IProduct[] = data?.success && Array.isArray(data.data) ? data.data : [];
          setInlineSearchResults(rows);
          setInlineActiveIndex(0);
        } catch {
          if (requestId !== inlineSearchSeqRef.current) return;
          setInlineSearchResults([]);
        } finally {
          if (requestId !== inlineSearchSeqRef.current) return;
          setInlineSearchLoading(false);
        }
      })();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [inlineProductSearch]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key || '').toLowerCase();
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || '').toLowerCase();
      const isTypingTarget =
        tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);

      if (event.ctrlKey && key === 'k') {
        event.preventDefault();
        setShowCatalogPanel(true);
        window.setTimeout(() => {
          productSearchInputRef.current?.focus();
          productSearchInputRef.current?.select();
        }, 30);
        return;
      }

      if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'F2') {
        event.preventDefault();
        setShowCatalogPanel((prev) => !prev);
        return;
      }

      if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        const checkoutButton = document.getElementById('sales-checkout-btn') as HTMLButtonElement | null;
        if (checkoutButton && !checkoutButton.disabled) checkoutButton.click();
        return;
      }

      if ((event.ctrlKey && key === 's') || (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === 'F9')) {
        event.preventDefault();
        const checkoutButton = document.getElementById('sales-checkout-btn') as HTMLButtonElement | null;
        if (checkoutButton && !checkoutButton.disabled) checkoutButton.click();
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        switch (key) {
          case '1':
            event.preventDefault();
            setPaymentMethod('cash');
            return;
          case '2':
            event.preventDefault();
            setPaymentMethod('card');
            return;
          case '3':
            event.preventDefault();
            setPaymentMethod('upi');
            return;
          case '4':
            event.preventDefault();
            setPaymentMethod('bank_transfer');
            return;
          case 'p':
            event.preventDefault();
            setInvoiceStatus('posted');
            return;
          case 'd':
            event.preventDefault();
            setInvoiceStatus('draft');
            return;
          case 'g':
            event.preventDefault();
            setIsGstBill(true);
            return;
          case 'n':
            event.preventDefault();
            setIsGstBill(false);
            return;
          default:
            break;
        }
      }

      if (!isTypingTarget && key === '/') {
        event.preventDefault();
        setShowCatalogPanel(true);
        window.setTimeout(() => {
          productSearchInputRef.current?.focus();
          productSearchInputRef.current?.select();
        }, 30);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (activeProductTimerRef.current) window.clearTimeout(activeProductTimerRef.current);
      if (activeProductAnimationFrameRef.current) window.cancelAnimationFrame(activeProductAnimationFrameRef.current);
      if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isWalkInCustomer) {
      setCustomerMatches([]);
      setCustomerActiveIndex(0);
      setSearchingCustomers(false);
      return;
    }
    const phone = normalizePhone(customerPhone);
    if (phone.length < 4) {
      setCustomerMatches([]);
      setCustomerActiveIndex(0);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        try {
          setSearchingCustomers(true);
          if (!navigator.onLine) {
            const offlineRows = await searchCachedCustomers(phone);
            setCustomerMatches(offlineRows as CustomerOption[]);
            setCustomerActiveIndex(0);
            return;
          }
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/customers/search-unified?q=${encodeURIComponent(phone)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (!data?.success) {
            const offlineRows = await searchCachedCustomers(phone);
            setCustomerMatches(offlineRows as CustomerOption[]);
            setCustomerActiveIndex(0);
            return;
          }
          const rows = Array.isArray(data.data) ? data.data : [];
          await mergeCachedCustomers(rows);
          setCustomerMatches(rows);
          setCustomerActiveIndex(0);
        } catch {
          const offlineRows = await searchCachedCustomers(phone);
          setCustomerMatches(offlineRows as CustomerOption[]);
          setCustomerActiveIndex(0);
        } finally {
          setSearchingCustomers(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [customerPhone, isWalkInCustomer]);

  useEffect(() => {
    if (isWalkInCustomer) {
      setCustomerCredit(null);
      setSelectedCreditNoteId('');
      setCreditNoteAmount('');
      setLoadingCustomerCredit(false);
      return;
    }
    const phone = normalizePhone(customerPhone);
    if (phone.length !== 10) {
      setCustomerCredit(null);
      setSelectedCreditNoteId('');
      setCreditNoteAmount('');
      setLoadingCustomerCredit(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setLoadingCustomerCredit(true);
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/credit-notes/customer/balance?customerPhone=${encodeURIComponent(phone)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (cancelled) return;
          if (!data?.success) {
            setCustomerCredit(null);
            setSelectedCreditNoteId('');
            setCreditNoteAmount('');
            return;
          }
          const nextCredit: CustomerCreditBalance = {
            totalIssued: Number(data?.data?.totalIssued || 0),
            balance: Number(data?.data?.balance || 0),
            notes: Array.isArray(data?.data?.notes) ? data.data.notes : [],
          };
          setCustomerCredit(nextCredit);
          setSelectedCreditNoteId((prev) => {
            const stillExists = nextCredit.notes.some((row) => row._id === prev && Number(row.balanceAmount || 0) > 0);
            return stillExists ? prev : '';
          });
          setCreditNoteAmount((prev) => prev);
        } catch {
          if (cancelled) return;
          setCustomerCredit(null);
          setSelectedCreditNoteId('');
          setCreditNoteAmount('');
        } finally {
          if (!cancelled) setLoadingCustomerCredit(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerPhone, isWalkInCustomer]);

  useEffect(() => {
    if (invoiceType === 'credit' || isWalkInCustomer) {
      if (selectedCreditNoteId) setSelectedCreditNoteId('');
      if (creditNoteAmount) setCreditNoteAmount('');
    }
  }, [creditNoteAmount, invoiceType, isWalkInCustomer, selectedCreditNoteId]);

  useEffect(() => {
    if (!selectedCreditNoteId) {
      if (creditNoteAmount) setCreditNoteAmount('');
      return;
    }

    const note = (customerCredit?.notes || []).find((row) => row._id === selectedCreditNoteId) || null;
    if (!note || invoiceType === 'credit' || isWalkInCustomer) {
      setSelectedCreditNoteId('');
      setCreditNoteAmount('');
      return;
    }

    const maxAllowed = Math.max(0, Math.min(Number(note.balanceAmount || 0), Number(calculateTotals().total || 0)));
    const nextAmount = Math.max(0, Number(creditNoteAmount || 0));
    if (nextAmount > maxAllowed) {
      setCreditNoteAmount(String(roundTo2(maxAllowed)));
    }
  }, [creditNoteAmount, customerCredit, invoiceType, isWalkInCustomer, selectedCreditNoteId, cart, discountType, discountValue, roundOffMode, isGstBill]);

  const selectCustomer = (customer: CustomerOption) => {
    setIsWalkInCustomer(false);
    setSelectedCustomerId(customer.source === 'customer' ? customer._id : '');
    setCustomerPhone(customer.phone || '');
    setCustomerName(customer.name || '');
    setCustomerEmail(customer.email || '');
    setCustomerAddress(customer.address || '');
    setMembershipLookupCode(customer.memberCode || '');
    setSelectedCreditNoteId('');
    setCreditNoteAmount('');
    setCustomerMatches([]);
    setCustomerActiveIndex(0);
  };

  const triggerProductFeedback = (product: IProduct) => {
    const productId = String(product._id || '');
    if (productId) {
      if (activeProductTimerRef.current) window.clearTimeout(activeProductTimerRef.current);
      if (activeProductAnimationFrameRef.current) window.cancelAnimationFrame(activeProductAnimationFrameRef.current);
      setActiveProductId('');
      activeProductAnimationFrameRef.current = window.requestAnimationFrame(() => {
        setActiveProductId(productId);
        activeProductTimerRef.current = window.setTimeout(() => setActiveProductId(''), 420);
      });
    }

    setAddFeedbackText(`${product.name} added to cart`);
    if (addFeedbackTimerRef.current) window.clearTimeout(addFeedbackTimerRef.current);
    addFeedbackTimerRef.current = window.setTimeout(() => setAddFeedbackText(''), 1200);
  };

  const addProductFromQuickSearch = (product: IProduct) => {
    addToCart(product);
    setShowQuickAddModal(false);
    setQuickSearchTerm('');
    setQuickSearchResults(products.slice(0, 12));
    setQuickActiveIndex(0);
  };

  const addProductFromInlineSearch = (product: IProduct) => {
    addToCart(product);
    setInlineProductSearch('');
    setInlineSearchResults([]);
    setInlineActiveIndex(0);
    window.setTimeout(() => {
      inlineSearchInputRef.current?.focus();
      inlineSearchInputRef.current?.select();
    }, 20);
  };

  const closeCatalogPanel = () => {
    setShowCatalogPanel(false);
    setSearchTerm('');
    setProductPage(1);
    setCatalogSelectedProductId('');
    window.setTimeout(() => {
      if (enableProductScanner) {
        scannerInputRef.current?.focus();
        scannerInputRef.current?.select();
        return;
      }
      inlineSearchInputRef.current?.focus();
      inlineSearchInputRef.current?.select();
    }, 30);
  };

  const addToCart = (product: IProduct, preferredVariant?: { size?: string; color?: string } | null) => {
    const allowOfflineOverstock = !navigator.onLine;
    if (requiresStockTracking(product) && product.stock <= 0 && !allowOfflineOverstock) {
      void showAlertDialog('Out of stock!');
      return;
    }

    const variantOptions = getVariantOptions(product);
    const defaultVariant = preferredVariant
      ? resolveVariantRow(product, preferredVariant.size, preferredVariant.color) || variantOptions[0]
      : variantOptions[0];
    const defaultVariantSize = normalizeVariantValue(preferredVariant?.size || defaultVariant?.size);
    const defaultVariantColor = normalizeVariantValue(preferredVariant?.color || defaultVariant?.color);

    let added = false;
    let warningMessage = '';
    let discrepancyFlagged = false;
    setCart((prev) => {
      const totalForProduct = prev
        .filter((item) => item._id === product._id)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const existing = prev.find((item) =>
        item._id === product._id
        && normalizeVariantValue(item.selectedVariantSize) === defaultVariantSize
        && normalizeVariantValue(item.selectedVariantColor) === defaultVariantColor
      );
      if (existing) {
        if (requiresStockTracking(product) && totalForProduct >= product.stock) {
          if (!allowOfflineOverstock) {
            warningMessage = 'Cannot add more than available stock';
            return prev;
          }
          discrepancyFlagged = true;
        }
        added = true;
        return prev.map((item) =>
          item.cartId === existing.cartId
            ? {
              ...item,
              quantity: item.quantity + 1,
              price: resolveCatalogUnitPrice(
                item,
                item.quantity + 1,
                item.selectedVariantSize,
                item.selectedVariantColor
              ),
              offlineStockDiscrepancy: item.offlineStockDiscrepancy || discrepancyFlagged,
            }
            : item
        );
      }
      if (requiresStockTracking(product) && totalForProduct >= product.stock) {
        if (!allowOfflineOverstock) {
          warningMessage = 'Cannot add more than available stock';
          return prev;
        }
        discrepancyFlagged = true;
      }
      added = true;
      return [
        ...prev,
        {
          ...product,
          quantity: 1,
          price: variantUnitPrice(product, defaultVariantSize, defaultVariantColor),
          cartId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          selectedVariantSize: defaultVariantSize,
          selectedVariantColor: defaultVariantColor,
          saleSerialTrackingEnabled: false,
          serialNumbers: [],
          serialNumbersText: '',
          batchNo: '',
          expiryDate: '',
          offlineStockDiscrepancy: discrepancyFlagged,
        },
      ];
    });
    if (warningMessage) {
      void showAlertDialog(warningMessage);
      return;
    }
    if (discrepancyFlagged) {
      setCheckoutWarningMessage('One or more items exceed the cached stock count and will be flagged for reconciliation after sync.');
    }
    if (added) {
      triggerProductFeedback(product);
      closeCatalogPanel();
    }
  };

  const applyCartQuantityChange = (cartId: string, resolveQuantity: (currentQuantity: number) => number) => {
    let warningMessage = '';
    const allowOfflineOverstock = !navigator.onLine;
    let discrepancyFlagged = false;
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartId === cartId) {
          const newQty = Math.floor(resolveQuantity(item.quantity));
          if (!Number.isFinite(newQty) || newQty < 1 || newQty === item.quantity) return item;
          const siblingQty = prev
            .filter((row) => row._id === item._id && row.cartId !== item.cartId)
            .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
          const exceedsCachedStock = requiresStockTracking(item) && siblingQty + newQty > item.stock;
          if (exceedsCachedStock && !allowOfflineOverstock) {
            warningMessage = 'Stock limit reached';
            return item;
          }
          if (exceedsCachedStock) discrepancyFlagged = true;
          return {
            ...item,
            quantity: newQty,
            price: resolveCatalogUnitPrice(
              item,
              newQty,
              item.selectedVariantSize,
              item.selectedVariantColor
            ),
            offlineStockDiscrepancy: exceedsCachedStock,
          };
        }
        return item;
      })
    );
    setCartValidationErrors((prev) => {
      if (!prev[cartId]) return prev;
      const next = { ...prev };
      delete next[cartId];
      return next;
    });
    setCheckoutWarningMessage('');
    if (warningMessage) {
      void showAlertDialog(warningMessage);
    } else if (discrepancyFlagged) {
      setCheckoutWarningMessage('One or more items exceed the cached stock count and will be flagged for reconciliation after sync.');
    }
  };

  const updateQuantity = (cartId: string, delta: number) => {
    applyCartQuantityChange(cartId, (currentQuantity) => currentQuantity + delta);
  };

  const setCartQuantity = (cartId: string, quantity: number) => {
    applyCartQuantityChange(cartId, () => quantity);
  };

  const removeFromCart = (cartId: string) => {
    setCart((prev) => prev.filter((item) => item.cartId !== cartId));
    setCartValidationErrors((prev) => {
      if (!prev[cartId]) return prev;
      const next = { ...prev };
      delete next[cartId];
      return next;
    });
    setCheckoutWarningMessage('');
  };

  const updateCartItemField = (cartId: string, field: keyof CartItem, value: any) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartId !== cartId) return item;
        if (field === 'saleSerialTrackingEnabled') {
          return {
            ...item,
            saleSerialTrackingEnabled: Boolean(value),
            serialNumbersText: value ? item.serialNumbersText || '' : '',
            serialNumbers: value ? item.serialNumbers || [] : [],
          };
        }
        return { ...item, [field]: value };
      })
    );
    if (field === 'expiryDate' || field === 'serialNumbersText' || field === 'saleSerialTrackingEnabled') {
      setCartValidationErrors((prev) => {
        const current = prev[cartId];
        if (!current) return prev;
        const next = { ...prev };
        const updated = { ...current };
        if (field === 'saleSerialTrackingEnabled') {
          delete updated.serialNumbersText;
        } else {
          delete updated[field];
        }
        if (!updated.expiryDate && !updated.serialNumbersText) {
          delete next[cartId];
        } else {
          next[cartId] = updated;
        }
        return next;
      });
      setCheckoutWarningMessage('');
    }
  };

  const updateCartVariant = (cartId: string, value: string) => {
    const [size, color] = String(value || '').split('|||');
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartId !== cartId) return item;
        return {
          ...item,
          selectedVariantSize: normalizeVariantValue(size),
          selectedVariantColor: normalizeVariantValue(color),
          price: resolveCatalogUnitPrice(item, Number(item.quantity || 1), size, color),
        };
      })
    );
    setCheckoutWarningMessage('');
  };

  const focusCartValidationField = (cartId: string, field: keyof CartValidationError) => {
    const card = cartItemRefs.current[cartId];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.setTimeout(() => {
      if (field === 'expiryDate') {
        expiryInputRefs.current[cartId]?.focus();
        return;
      }
      if (field === 'serialNumbersText') {
        serialInputRefs.current[cartId]?.focus();
      }
    }, 180);
  };

  const focusScannerInput = () => {
    if (!scannerSettings.autoFocusInput) return;
    window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select();
    }, 20);
  };

  const findProductByCode = (rawCode: string): IProduct | null => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return null;

    const exact = products.find((product) => {
      const sku = String(product.sku || '').trim().toUpperCase();
      const barcode = String(product.barcode || '').trim().toUpperCase();
      const variantBarcodeMatch = getVariantOptions(product).some(
        (row) => String(row.barcode || '').trim().toUpperCase() === code
      );
      return sku === code || barcode === code || variantBarcodeMatch;
    });
    if (exact) return exact;

    const startsWith = products.find((product) => {
      const sku = String(product.sku || '').trim().toUpperCase();
      const barcode = String(product.barcode || '').trim().toUpperCase();
      const variantBarcodeMatch = getVariantOptions(product).some(
        (row) => String(row.barcode || '').trim().toUpperCase().startsWith(code)
      );
      return sku.startsWith(code) || barcode.startsWith(code) || variantBarcodeMatch;
    });
    return startsWith || null;
  };

  const fetchProductByCode = async (rawCode: string): Promise<IProduct | null> => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return null;

    try {
      const cachedRows = await searchCachedProducts(code, 25);
      const cachedMatch =
        cachedRows.find((product) => {
          const sku = String(product.sku || '').trim().toUpperCase();
          const barcode = String(product.barcode || '').trim().toUpperCase();
          return sku === code || barcode === code;
        }) || cachedRows[0];
      if (cachedMatch) return cachedMatch;

      if (!navigator.onLine) return null;

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/products?limit=15&q=${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!data?.success || !Array.isArray(data.data)) return null;
      const rows: IProduct[] = data.data;
      await replaceCachedProductCatalog([
        ...rows,
        ...products.filter((product) => !rows.some((row) => String(row._id || '') === String(product._id || ''))),
      ]);
      const matched =
        rows.find((product) => {
          const sku = String(product.sku || '').trim().toUpperCase();
          const barcode = String(product.barcode || '').trim().toUpperCase();
          return sku === code || barcode === code;
        }) || rows[0];
      if (!matched) return null;

      setProducts((prev) => {
        const id = String(matched._id || '');
        if (!id) return prev;
        if (prev.some((item) => String(item._id || '') === id)) return prev;
        return [matched, ...prev];
      });

      return matched;
    } catch {
      return null;
    }
  };

  const handleProductCodeScan = async (rawCode?: string) => {
    const code = String(rawCode ?? scanCode ?? '').trim();
    if (!code) {
      await showAlertDialog('Please scan or enter a product code.');
      return;
    }

    const matched = findProductByCode(code) || (await fetchProductByCode(code));
    if (!matched) {
      await showAlertDialog('Product not found for this code. Please check SKU/barcode and try again.');
      return;
    }

    addToCart(matched, findVariantByCode(matched, code));
    setScanCode('');
    focusScannerInput();
  };

  useCodeScannerCapture({
    enabled: enableProductScanner,
    settings: scannerSettings,
    onScan: (value) => {
      setScanCode(value);
      void handleProductCodeScan(value);
    },
  });

  const calculateTotals = (sourceCart: CartItem[] = cart) => {
    const subtotal = sourceCart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const gst = isGstBill
      ? sourceCart.reduce((acc, item) => {
        const itemTotal = item.price * item.quantity;
        return acc + (itemTotal * (item.gstRate || 18)) / 100;
      }, 0)
      : 0;
    const grossTotal = subtotal + gst;
    const parsedDiscount = Math.max(0, Number(discountValue || 0));

    let discountAmount = 0;
    let discountPercentage = 0;
    if (discountType === 'percentage') {
      discountPercentage = Math.min(100, parsedDiscount);
      discountAmount = (grossTotal * discountPercentage) / 100;
    } else {
      discountAmount = Math.min(grossTotal, parsedDiscount);
      discountPercentage = grossTotal > 0 ? (discountAmount / grossTotal) * 100 : 0;
    }

    const netTotal = Math.max(0, grossTotal - discountAmount);
    const roundedTotal = roundTo2(roundByMode(netTotal, roundOffMode));
    const roundOffAmount = roundTo2(roundedTotal - netTotal);
    return {
      subtotal,
      gst,
      grossTotal,
      discountAmount,
      discountPercentage,
      netTotal,
      roundOffAmount,
      total: roundedTotal,
    };
  };

  const doPrintInvoice = (sale: CompletedSale) => {
    const latestSettings = getGeneralSettings();
    const ok = printInvoice(sale, latestSettings);
    if (!ok) {
      void showAlertDialog('Unable to open print window. Please allow popups and try again.');
      return;
    }
    setShowInvoicePrompt(false);
  };

  const applyMembershipBenefits = async () => {
    if (normalizePhone(customerPhone).length !== 10) {
      await showAlertDialog('Enter a valid 10-digit customer phone to apply membership');
      return;
    }
    if (cart.length === 0) {
      await showAlertDialog('Add items before applying membership');
      return;
    }

    setApplyingMembership(true);
    try {
      const token = localStorage.getItem('token');
      const totals = calculateTotals();
      const response = await fetch('/api/memberships/pos/apply-benefits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mobile: normalizePhone(customerPhone),
          cartTotal: totals.grossTotal,
          redeemPoints: Number(membershipRedeemPoints || 0),
          commit: false,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        await showAlertDialog(data.error || 'Failed to apply membership benefits');
        return;
      }
      const preview: MembershipPreview = data.data;
      setMembershipPreview(preview);
      setDiscountType('amount');
      setDiscountValue(String(Math.max(0, Number(preview.discountAmount || 0) + Number(preview.redeemValue || 0))));
    } catch (error) {
      console.error('Membership apply error:', error);
      await showAlertDialog('Failed to apply membership benefits');
    } finally {
      setApplyingMembership(false);
    }
  };

  useEffect(() => {
    setMembershipPreview(null);
  }, [customerPhone, cart.length]);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    const normalizedCustomerPhone = isWalkInCustomer ? '' : normalizePhone(customerPhone);
    if (!isWalkInCustomer && normalizedCustomerPhone.length !== 10) {
      await showAlertDialog('Customer phone is required unless this sale is marked as Walk-in Customer. Enter a valid 10-digit phone number or switch the sale to Walk-in Customer.');
      return;
    }
    if (invoiceNumberMode === 'manual' && !manualInvoiceNumber.trim()) {
      await showAlertDialog('Manual invoice number is required when Invoice Numbering is set to Manual Number.');
      return;
    }

    const nextValidationErrors: Record<string, CartValidationError> = {};
    let firstInvalid: { cartId: string; field: keyof CartValidationError } | null = null;

    for (const item of cart) {
      if (item.expiryRequired && !String(item.expiryDate || '').trim()) {
        nextValidationErrors[item.cartId] = {
          ...(nextValidationErrors[item.cartId] || {}),
          expiryDate: `Expiry date is required for ${item.name} before saving this sale.`,
        };
        if (!firstInvalid) firstInvalid = { cartId: item.cartId, field: 'expiryDate' };
      }
      if (item.serialNumberTracking && item.saleSerialTrackingEnabled) {
        const serialCount = normalizeSerialNumbers(item.serialNumbersText || '').length;
        if (serialCount > 0 && serialCount !== Number(item.quantity || 0)) {
          nextValidationErrors[item.cartId] = {
            ...(nextValidationErrors[item.cartId] || {}),
            serialNumbersText: `${item.name} needs exactly ${item.quantity} unique serial number(s) when entered manually. Currently captured ${serialCount}.`,
          };
          if (!firstInvalid) firstInvalid = { cartId: item.cartId, field: 'serialNumbersText' };
        }
      }
    }

    if (firstInvalid) {
      setCartValidationErrors(nextValidationErrors);
      setCheckoutWarningMessage('Complete the highlighted serial / expiry details before saving the invoice.');
      focusCartValidationField(firstInvalid.cartId, firstInvalid.field);
      return;
    }

    setCartValidationErrors({});
    setCheckoutWarningMessage('');

    setProcessing(true);
    setCheckoutMessage('');

    try {
      const token = localStorage.getItem('token');
      const pricingSync = syncCartPricing(cart);
      if (pricingSync.changes.length) {
        setCart(pricingSync.items);
        const preview = pricingSync.changes
          .slice(0, 3)
          .map((change) => `${change.name}: ${formatCurrency(change.previousPrice)} -> ${formatCurrency(change.nextPrice)}`)
          .join('\n');
        const remainder = pricingSync.changes.length > 3
          ? `\n${pricingSync.changes.length - 3} more item(s) were refreshed.`
          : '';
        await showAlertDialog(
          `Catalog pricing was refreshed for ${pricingSync.changes.length} item(s). Review the updated total and click Post Invoice again.\n\n${preview}${remainder}`
        );
        return;
      }

      const activeCart = pricingSync.items;
      const totals = calculateTotals(activeCart);
      const canApplyStoreCredit = !isWalkInCustomer && invoiceType !== 'credit';
      const selectedCreditNote = canApplyStoreCredit
        ? (customerCredit?.notes || []).find((row) => row._id === selectedCreditNoteId && Number(row.balanceAmount || 0) > 0) || null
        : null;
      const requestedCreditAmount = selectedCreditNote
        ? Math.max(0, Number(creditNoteAmount || 0))
        : 0;
      const appliedCreditAmount = selectedCreditNote
        ? Math.min(requestedCreditAmount, Number(selectedCreditNote.balanceAmount || 0), Number(totals.total || 0))
        : 0;

      const normalizedSplits = paymentSplits
        .map((row) => ({
          ...row,
          amountValue: Math.max(0, Number(row.amount || 0)),
          receivedValue: Math.max(0, Number(row.receivedAmount || row.amount || 0)),
        }))
        .filter((row) => row.amountValue > 0);
      const splitTotal = roundTo2(normalizedSplits.reduce((sum, row) => sum + row.amountValue, 0));
      const primaryPaymentMethod = (normalizedSplits[0]?.method || paymentMethod) as OfflinePaymentSplit['method'];
      const computedPaidAmount = normalizedSplits.length
        ? splitTotal
        : paidAmount
          ? Number(paidAmount)
          : invoiceType === 'credit'
            ? undefined
            : Math.max(0, Number(totals.total || 0) - appliedCreditAmount);
      const finalCustomerName = customerName.trim() || (isWalkInCustomer ? 'Walk-in Customer' : undefined);
      const stockDiscrepancy = activeCart.some((item) => Boolean(item.offlineStockDiscrepancy));

      if (invoiceType === 'cash' && normalizedSplits.length > 0 && splitTotal + appliedCreditAmount < Number(totals.total || 0)) {
        await showAlertDialog('Split payments are less than the sale total. Add the remaining payment or switch the invoice type to Pay Later.');
        return;
      }

      const paymentSplitNote = normalizedSplits.length
        ? `Split payment: ${normalizedSplits.map((row) => `${row.method.toUpperCase()} ${formatCurrency(row.amountValue)}`).join(', ')}`
        : '';
      const cashSplit = normalizedSplits.find((row) => row.method === 'cash');
      const changeDueNote = cashSplit && cashSplit.receivedValue > cashSplit.amountValue
        ? `Cash received ${formatCurrency(cashSplit.receivedValue)}. Change due ${formatCurrency(cashSplit.receivedValue - cashSplit.amountValue)}.`
        : '';
      const composedNotes = [
        saleNotes.trim(),
        membershipLookupCode.trim() ? `Membership ID: ${membershipLookupCode.trim()}` : '',
        paymentSplitNote,
        changeDueNote,
        stockDiscrepancy ? 'Offline stock discrepancy flagged for reconciliation.' : '',
      ]
        .filter(Boolean)
        .join('\n');

      const saleData = {
        items: activeCart.map((item) => ({
          productId: item._id,
          sku: item.sku,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          gstRate: item.gstRate,
          batchNo: item.batchNo || undefined,
          expiryDate: item.expiryDate || undefined,
          serialTrackingEnabled: Boolean(item.serialNumberTracking && item.saleSerialTrackingEnabled),
          serialNumbers: item.serialNumberTracking && item.saleSerialTrackingEnabled ? normalizeSerialNumbers(item.serialNumbersText || '') : undefined,
          variantSize: item.selectedVariantSize || undefined,
          variantColor: item.selectedVariantColor || undefined,
        })),
        paymentMethod: primaryPaymentMethod,
        invoiceType,
        invoiceStatus,
        isGstBill,
        invoiceNumber: invoiceNumberMode === 'manual' ? manualInvoiceNumber.trim() : undefined,
        autoInvoiceNumber: invoiceNumberMode === 'auto',
        applyRoundOff: roundOffMode !== 'none',
        paidAmount: computedPaidAmount,
        isWalkInCustomer,
        customerId: isWalkInCustomer ? undefined : selectedCustomerId || undefined,
        customerName: finalCustomerName,
        customerPhone: normalizedCustomerPhone || undefined,
        customerEmail: isWalkInCustomer ? undefined : customerEmail.trim() || undefined,
        customerAddress: isWalkInCustomer ? undefined : customerAddress.trim() || undefined,
        notes: composedNotes || undefined,
        subtotal: totals.subtotal,
        totalGst: totals.gst,
        discountAmount: totals.discountAmount,
        discountPercentage: totals.discountPercentage,
        totalAmount: totals.total,
        paymentSplits: normalizedSplits.map((row) => ({
          id: row.id,
          method: row.method,
          amount: row.amountValue,
          receivedAmount: row.receivedValue,
          note: row.note,
        })),
        creditNoteId: selectedCreditNote?._id || undefined,
        creditNoteAmount: appliedCreditAmount > 0 ? appliedCreditAmount : undefined,
        allowNegativeStock: stockDiscrepancy || undefined,
      };

      if (!navigator.onLine) {
        const offlineInvoiceNumber = invoiceNumberMode === 'manual' && manualInvoiceNumber.trim()
          ? manualInvoiceNumber.trim()
          : await generateOfflineInvoiceNumber();
        const queuedSaleData = {
          ...saleData,
          invoiceNumber: offlineInvoiceNumber,
          autoInvoiceNumber: false,
        };
        await queueOfflineSale({
          kind: invoiceStatus === 'draft' ? 'draft' : 'posted',
          localInvoiceNumber: offlineInvoiceNumber,
          saleData: queuedSaleData,
          snapshot: buildOfflineSnapshot(),
          stockDiscrepancy,
        });
        await refreshOfflineCollections();
        clearSaleEditor({ preserveCheckoutMessage: true });
        setCheckoutMessage(
          invoiceStatus === 'draft'
            ? `Draft ${offlineInvoiceNumber} saved locally and will sync when online.`
            : `Invoice ${offlineInvoiceNumber} saved locally and will sync when online.`
        );
        setSyncMessage('Changes saved locally. Background sync will upload them automatically when the internet returns.');
        updateSyncIndicator(await listQueuedOfflineSales().then((rows) => rows.length), false, false);
        return;
      }

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(saleData),
      });

      const data = await response.json();
      if (!data.success) {
        const serverMessage = String(data.error || data.message || 'Could not save invoice.');
        const normalizedServerMessage = serverMessage.toLowerCase();

        if (normalizedServerMessage.includes('price override reason is required')) {
          await showAlertDialog(
            'One or more item prices do not match the active catalog price anymore. Review the current item price and total, then click Post Invoice again.'
          );
          return;
        }

        if (normalizedServerMessage.includes('product not found')) {
          await showAlertDialog(toSimpleWarning(serverMessage));
          return;
        }

        await showAlertDialog(toSimpleWarning(serverMessage));
        return;
      }

      const completed: CompletedSale = {
        ...data.data,
        customerName: data?.data?.customerName || finalCustomerName || customerName || 'Walk-in Customer',
        customerPhone: data?.data?.customerPhone || normalizedCustomerPhone,
        customerEmail: data?.data?.customerEmail || customerEmail,
        notes: composedNotes || saleNotes,
        invoiceNumber: data.data.invoiceNumber || data.data.saleNumber,
      };

      setCompletedSale(completed);

      if (data?.data?.customerPhone || data?.data?.customerName) {
        await mergeCachedCustomers([{
          _id: String(data?.data?.customerId || selectedCustomerId || normalizedCustomerPhone || completed.invoiceNumber || ''),
          customerCode: String(data?.data?.customerCode || ''),
          name: String(data?.data?.customerName || finalCustomerName || 'Walk-in Customer'),
          phone: String(data?.data?.customerPhone || normalizedCustomerPhone || ''),
          email: String(data?.data?.customerEmail || customerEmail || ''),
          address: String(customerAddress || ''),
          source: 'customer',
        }]);
      }

      if (membershipPreview && normalizedCustomerPhone) {
        void fetch('/api/memberships/pos/apply-benefits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            mobile: normalizedCustomerPhone,
            cartTotal: totals.grossTotal,
            redeemPoints: Number(membershipRedeemPoints || 0),
            commit: true,
            reference: completed.invoiceNumber || completed.saleNumber,
          }),
        }).catch((membershipCommitError) => {
          console.error('Membership benefit commit failed:', membershipCommitError);
        });
      }

      clearSaleEditor({ preserveCheckoutMessage: true });
      void fetchProducts(true);
      await refreshOfflineCollections();

      if (invoiceStatus === 'draft') {
        setCheckoutMessage(`Draft invoice ${completed.invoiceNumber} saved successfully.`);
        return;
      }

      if (settings.printing.autoPrintAfterSale) {
        doPrintInvoice(completed);
        setCheckoutMessage(`Sale completed. Invoice ${completed.invoiceNumber} sent to print.`);
      } else if (settings.printing.promptAfterSale) {
        setShowInvoicePrompt(true);
        setCheckoutMessage(`Sale completed. Invoice ${completed.invoiceNumber} is ready.`);
      } else {
        setCheckoutMessage(`Sale completed successfully. Invoice ${completed.invoiceNumber} generated.`);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      await showAlertDialog('Could not process invoice. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleHoldSale = async () => {
    if (!cart.length) return;
    await saveHeldSale(buildOfflineSnapshot());
    await refreshOfflineCollections();
    clearSaleEditor({ preserveCheckoutMessage: true });
    setCheckoutMessage('Current sale moved to Hold and saved locally.');
  };

  const hasActiveSaleDraft = () =>
    cart.length > 0
    || Boolean(customerPhone.trim())
    || Boolean(customerName.trim())
    || Boolean(customerEmail.trim())
    || Boolean(customerAddress.trim())
    || Boolean(saleNotes.trim())
    || Boolean(discountValue.trim())
    || Boolean(creditNoteAmount.trim())
    || Boolean(selectedCreditNoteId)
    || Boolean(membershipLookupCode.trim());

  const handleStartNewSale = async () => {
    if (!hasActiveSaleDraft()) {
      clearSaleEditor();
      return;
    }

    const confirmed = await showConfirmDialog(
      'Start a new sale and clear the current invoice details from the screen?',
      {
        title: 'Start New Sale',
        confirmText: 'Clear Sale',
        cancelText: 'Keep Working',
        severity: 'warning',
      }
    );
    if (!confirmed) return;
    clearSaleEditor();
  };

  const handleRecallSales = () => {
    setShowOfflineTools(true);
  };

  const handleQuickPrint = async () => {
    if (completedSale) {
      doPrintInvoice(completedSale);
      return;
    }
    await showAlertDialog('Complete a sale first, then use Print to open the invoice window.');
  };

  const handleLoadSavedSale = async (record: OfflineSavedSaleRecord) => {
    if (hasActiveSaleDraft()) {
      const confirmed = await showConfirmDialog(
        `Load this ${record.kind === 'held' ? 'held sale' : 'draft'} into the billing screen and replace the current sale?`,
        {
          title: record.kind === 'held' ? 'Resume Held Sale' : 'Load Draft Sale',
          confirmText: 'Load Sale',
          cancelText: 'Keep Current Sale',
          severity: 'warning',
        }
      );
      if (!confirmed) return;
    }

    applyOfflineSnapshot(record.snapshot);

    if (record.kind === 'held') {
      await deleteHeldSale(record.id);
    }

    await refreshOfflineCollections();
    setShowOfflineTools(false);
    setCheckoutMessage(
      record.kind === 'held'
        ? 'Held sale restored to the billing screen.'
        : 'Draft sale loaded to the billing screen.'
    );
  };

  const handleDeleteSavedSale = async (record: OfflineSavedSaleRecord) => {
    const confirmed = await showConfirmDialog(
      `Delete this ${record.kind === 'held' ? 'held sale' : 'draft sale'} from local recall?`,
      {
        title: record.kind === 'held' ? 'Delete Held Sale' : 'Delete Draft Sale',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        severity: 'warning',
      }
    );
    if (!confirmed) return;

    if (record.kind === 'held') {
      await deleteHeldSale(record.id);
    } else if (record.linkedQueueId) {
      await removeQueuedOfflineSale(record.linkedQueueId);
    } else {
      await deleteDraftSale(record.id);
    }

    await refreshOfflineCollections();
  };

  useEffect(() => {
    if (!showCatalogPanel) {
      catalogSearchSeqRef.current += 1;
      return;
    }

    const query = debouncedCatalogSearchTerm.trim();
    if (!query) {
      catalogSearchSeqRef.current += 1;
      setCatalogSearchLoading(false);
      setCatalogSearchResults([]);
      return;
    }

    const requestId = ++catalogSearchSeqRef.current;
    setCatalogSearchLoading(true);

    void (async () => {
      try {
        let rows: IProduct[] = [];

        if (navigator.onLine) {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/products?limit=${CATALOG_SEARCH_RESULT_LIMIT}&q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          if (data?.success && Array.isArray(data.data)) {
            rows = data.data;
          }
        }

        if (!rows.length) {
          rows = await searchCachedProducts(query, CATALOG_SEARCH_RESULT_LIMIT);
        }

        if (requestId !== catalogSearchSeqRef.current) return;
        setCatalogSearchResults(rows);
      } catch (error) {
        if (requestId !== catalogSearchSeqRef.current) return;
        console.error('Error searching cached catalog:', error);
        try {
          const rows = await searchCachedProducts(query, CATALOG_SEARCH_RESULT_LIMIT);
          if (requestId !== catalogSearchSeqRef.current) return;
          setCatalogSearchResults(rows);
        } catch (fallbackError) {
          if (requestId !== catalogSearchSeqRef.current) return;
          console.error('Error searching fallback catalog:', fallbackError);
          setCatalogSearchResults([]);
        }
      } finally {
        if (requestId === catalogSearchSeqRef.current) {
          setCatalogSearchLoading(false);
        }
      }
    })();
  }, [debouncedCatalogSearchTerm, showCatalogPanel]);

  const filteredProducts = useMemo(
    () => (debouncedCatalogSearchTerm ? catalogSearchResults : products),
    [catalogSearchResults, debouncedCatalogSearchTerm, products]
  );

  const productViewOptions: Array<{ key: ProductViewMode; label: string }> = [
    { key: 'grid', label: 'Grid' },
    { key: 'table', label: 'Table' },
    { key: 'title', label: 'Title List' },
    { key: 'image', label: 'Image Tiles' },
  ];

  const pagedProducts = useMemo(() => {
    const totalRows = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / PRODUCTS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, productPage), totalPages);
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    return {
      rows: filteredProducts.slice(startIndex, endIndex),
      totalRows,
      totalPages,
      currentPage,
      startDisplay: totalRows ? startIndex + 1 : 0,
      endDisplay: Math.min(endIndex, totalRows),
    };
  }, [filteredProducts, productPage]);
  const catalogVisibleRows = pagedProducts.rows;
  const catalogKeyboardRows = filteredProducts;
  const catalogKeyboardIndexById = useMemo(
    () =>
      new Map(
        catalogKeyboardRows.map((product, index) => [getCatalogProductId(product), index] as const)
      ),
    [catalogKeyboardRows]
  );

  const focusCatalogTable = () => {
    window.requestAnimationFrame(() => {
      catalogTableRef.current?.focus();
    });
  };

  const focusCatalogSearchInput = (options?: { select?: boolean }) => {
    window.requestAnimationFrame(() => {
      productSearchInputRef.current?.focus();
      if (options?.select) {
        productSearchInputRef.current?.select();
      }
    });
  };

  const selectCatalogProduct = (product: IProduct, options?: { focusTable?: boolean }) => {
    const nextId = getCatalogProductId(product);
    setCatalogSelectedProductId(nextId);
    if (options?.focusTable) {
      focusCatalogTable();
    }
  };

  const moveCatalogSelection = (direction: 'next' | 'prev') => {
    if (!catalogKeyboardRows.length) return;

    const currentIndex = Math.max(0, catalogKeyboardIndexById.get(catalogSelectedProductId) ?? 0);
    const nextIndex = direction === 'next'
      ? Math.min(catalogKeyboardRows.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    const nextProduct = catalogKeyboardRows[nextIndex];
    if (!nextProduct) return;

    const nextId = getCatalogProductId(nextProduct);
    const nextPage = Math.floor(nextIndex / PRODUCTS_PER_PAGE) + 1;
    if (nextPage !== productPage) {
      setProductPage(nextPage);
    }
    setCatalogSelectedProductId(nextId);
  };

  useEffect(() => {
    if (!showCatalogPanel || productViewMode !== 'table') {
      if (!showCatalogPanel) setCatalogSelectedProductId('');
      return;
    }

    if (!catalogVisibleRows.length) {
      setCatalogSelectedProductId('');
      return;
    }

    setCatalogSelectedProductId((prev) => {
      const stillVisible = catalogVisibleRows.some((row) => getCatalogProductId(row) === prev);
      return stillVisible ? prev : getCatalogProductId(catalogVisibleRows[0]);
    });
  }, [catalogVisibleRows, productViewMode, showCatalogPanel]);

  useEffect(() => {
    if (!showCatalogPanel || productViewMode !== 'table' || !catalogSelectedProductId) return;
    if (!catalogKeyboardIndexById.has(catalogSelectedProductId) && catalogVisibleRows.length > 0) {
      setCatalogSelectedProductId(getCatalogProductId(catalogVisibleRows[0]));
    }
  }, [catalogKeyboardIndexById, catalogSelectedProductId, catalogVisibleRows, productViewMode, showCatalogPanel]);

  useEffect(() => {
    if (!showCatalogPanel || productViewMode !== 'table' || !catalogSelectedProductId) return;

    window.requestAnimationFrame(() => {
      const selectedRow = document.getElementById(`catalog-row-${catalogSelectedProductId}`);
      selectedRow?.scrollIntoView({ block: 'nearest' });
    });
  }, [catalogSelectedProductId, productPage, productViewMode, showCatalogPanel]);

  const handleCatalogTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (productViewMode !== 'table' || filteredProducts.length === 0) return;

    const isPlainCharacter =
      event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;

    if (isPlainCharacter) {
      event.preventDefault();
      const typedCharacter = event.key;
      setSearchTerm((prev) => `${prev}${typedCharacter}`);
      setProductPage(1);
      focusCatalogSearchInput();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      setSearchTerm((prev) => prev.slice(0, -1));
      setProductPage(1);
      focusCatalogSearchInput();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!catalogSelectedProductId) {
        setCatalogSelectedProductId(getCatalogProductId(filteredProducts[0]));
        return;
      }
      moveCatalogSelection('next');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!catalogSelectedProductId) {
        const lastProduct = filteredProducts[filteredProducts.length - 1];
        if (!lastProduct) return;
        const lastIndex = filteredProducts.length - 1;
        setProductPage(Math.floor(lastIndex / PRODUCTS_PER_PAGE) + 1);
        setCatalogSelectedProductId(getCatalogProductId(lastProduct));
        return;
      }
      moveCatalogSelection('prev');
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const firstProduct = filteredProducts[0];
      if (!firstProduct) return;
      setProductPage(1);
      setCatalogSelectedProductId(getCatalogProductId(firstProduct));
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const lastIndex = filteredProducts.length - 1;
      const lastProduct = filteredProducts[lastIndex];
      if (!lastProduct) return;
      setProductPage(Math.floor(lastIndex / PRODUCTS_PER_PAGE) + 1);
      setCatalogSelectedProductId(getCatalogProductId(lastProduct));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedProduct = catalogKeyboardRows[catalogKeyboardIndexById.get(catalogSelectedProductId) ?? -1];
      if (selectedProduct) {
        addToCart(selectedProduct);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      focusCatalogSearchInput({ select: true });
    }
  };

  const handleCatalogDialogKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showCatalogPanel) return;

    const dialog = catalogDialogRef.current;
    const target = event.target as HTMLElement | null;
    const tag = String(target?.tagName || '').toLowerCase();
    const isTypingTarget =
      tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);
    const isCatalogRowTarget = Boolean(target?.closest('tr[role="row"]'));
    const isCatalogTableTarget = Boolean(target?.closest('[data-catalog-table="true"]'));

    if (event.key === 'Tab' && dialog) {
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
          return;
        }
      }
    }

    if (isTypingTarget || isCatalogRowTarget || isCatalogTableTarget) return;

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && filteredProducts.length > 0) {
      event.preventDefault();
      if (productViewMode !== 'table') {
        setProductViewMode('table');
      }

      if (!catalogSelectedProductId) {
        const nextProduct = event.key === 'ArrowUp' ? filteredProducts[filteredProducts.length - 1] : filteredProducts[0];
        if (!nextProduct) return;
        const nextId = getCatalogProductId(nextProduct);
        const nextIndex = catalogKeyboardIndexById.get(nextId) ?? 0;
        setProductPage(Math.floor(Math.max(0, nextIndex) / PRODUCTS_PER_PAGE) + 1);
        setCatalogSelectedProductId(nextId);
        focusCatalogTable();
        return;
      }

      moveCatalogSelection(event.key === 'ArrowDown' ? 'next' : 'prev');
      focusCatalogTable();
    }
  };

  const { subtotal, gst, grossTotal, discountAmount, netTotal, roundOffAmount, total } = calculateTotals();
  const availableCreditNotes = (customerCredit?.notes || []).filter((row) => Number(row.balanceAmount || 0) > 0);
  const canUseStoreCredit = !isWalkInCustomer && invoiceType !== 'credit';
  const selectedCreditNote = availableCreditNotes.find((row) => row._id === selectedCreditNoteId) || null;
  const selectedCreditNoteBalance = Number(selectedCreditNote?.balanceAmount || 0);
  const previewCreditNoteBalance = Number((selectedCreditNote || availableCreditNotes[0])?.balanceAmount || 0);
  const isStoreCreditApplied = canUseStoreCredit && Boolean(selectedCreditNoteId);
  const previewStoreCreditLimit = canUseStoreCredit
    ? Math.min(previewCreditNoteBalance, Number(total || 0))
    : 0;
  const maxUsableStoreCredit = isStoreCreditApplied
    ? Math.min(selectedCreditNoteBalance, Number(total || 0))
    : 0;
  const requestedCreditAmount = isStoreCreditApplied
    ? Math.max(0, Number(creditNoteAmount || 0))
    : 0;
  const appliedStoreCredit = isStoreCreditApplied
    ? Math.min(requestedCreditAmount, selectedCreditNoteBalance, Number(total || 0))
    : 0;
  const postCreditCollectNow = Math.max(0, Number(total || 0) - appliedStoreCredit);
  const normalizedPaymentSplits = paymentSplits
    .map((row) => ({
      ...row,
      amountValue: Math.max(0, Number(row.amount || 0)),
      receivedValue: Math.max(0, Number(row.receivedAmount || row.amount || 0)),
    }))
    .filter((row) => row.amountValue > 0);
  const splitPaidAmount = roundTo2(normalizedPaymentSplits.reduce((sum, row) => sum + row.amountValue, 0));
  const cashSplit = normalizedPaymentSplits.find((row) => row.method === 'cash');
  const cashChangeDue = cashSplit && cashSplit.receivedValue > cashSplit.amountValue
    ? roundTo2(cashSplit.receivedValue - cashSplit.amountValue)
    : 0;
  const effectivePaidAmount = normalizedPaymentSplits.length
    ? splitPaidAmount
    : paidAmount
      ? Number(paidAmount || 0)
      : invoiceType === 'credit'
        ? 0
        : Math.max(0, Number(total || 0) - appliedStoreCredit);
  const outstandingAmount = Math.max(0, total - effectivePaidAmount - appliedStoreCredit);
  const normalizedCustomerPhone = isWalkInCustomer ? '' : normalizePhone(customerPhone);
  const hasValidCustomerPhone = normalizedCustomerPhone.length === 10;
  const willCreateNewCustomer =
    !isWalkInCustomer && !searchingCustomers && hasValidCustomerPhone && customerMatches.length === 0 && !selectedCustomerId;
  const recallCount = heldSales.length + draftSales.length;
  const invoicePreviewLabel = invoiceNumberMode === 'manual'
    ? manualInvoiceNumber.trim() || 'Enter manual invoice number'
    : 'Auto number on save';
  const invoicePreviewTone = invoiceNumberMode === 'manual' && !manualInvoiceNumber.trim()
    ? 'text-amber-200'
    : 'text-white';
  const invoiceDateLabel = new Date().toLocaleDateString('en-IN');
  const cartUnitCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const currentCollectionLabel = invoiceType === 'credit'
    ? 'Expected Outstanding'
    : splitPaidAmount > 0
      ? 'Balance to Collect'
      : 'Collect Now';
  const currentCollectionValue = invoiceType === 'credit'
    ? outstandingAmount
    : Math.max(0, postCreditCollectNow - splitPaidAmount);
  const checkoutActionAmount = invoiceStatus === 'draft'
    ? Number(total || 0)
    : invoiceType === 'credit'
      ? outstandingAmount
      : currentCollectionValue;
  const primaryCheckoutLabel = processing
    ? 'Processing...'
    : invoiceStatus === 'draft'
      ? `Save Draft ${formatCurrency(checkoutActionAmount)}`
      : `Post Invoice ${formatCurrency(checkoutActionAmount)}`;
  const isMinimalMode = !showCatalogPanel;
  const availableStoreCreditBalance = Number(customerCredit?.balance || 0);
  const storeCreditStatusLabel = loadingCustomerCredit
    ? 'Checking credit balance...'
    : !canUseStoreCredit
      ? isWalkInCustomer
        ? 'Store credit is disabled for Walk-in Customer invoices.'
        : 'Store credit is disabled for Pay Later invoices.'
      : availableCreditNotes.length === 0
        ? 'No store credit available'
        : `${availableCreditNotes.length} usable credit note${availableCreditNotes.length === 1 ? '' : 's'} ready`;
  const handleClearStoreCredit = () => {
    setSelectedCreditNoteId('');
    setCreditNoteAmount('');
  };
  const handleApplyStoreCredit = () => {
    if (!canUseStoreCredit) return;
    const note = selectedCreditNote || availableCreditNotes[0];
    if (!note) return;

    const noteBalance = Number(note.balanceAmount || 0);
    const typedAmount = Math.max(0, Number(creditNoteAmount || 0));
    const nextAmount = roundTo2(Math.min(typedAmount > 0 ? typedAmount : noteBalance, noteBalance, Number(total || 0)));

    setSelectedCreditNoteId(note._id);
    setCreditNoteAmount(nextAmount > 0 ? String(nextAmount) : '');
  };
  const selectPrimaryPaymentMethod = (method: typeof paymentMethod) => {
    setPaymentMethod(method);
    setPaymentSplits((prev) =>
      prev.length <= 1
        ? [{
            ...createPaymentSplitRow(method as OfflinePaymentSplit['method']),
            amount: prev[0]?.amount || '',
            receivedAmount: prev[0]?.receivedAmount || '',
          }]
        : prev
    );
  };
  const selectedPaymentMethodLabel = paymentMethodOptions.find((option) => option.value === paymentMethod)?.label || 'Cash';
  const selectedInvoiceTypeLabel = invoiceTypeOptions.find((option) => option.value === invoiceType)?.label || 'Paid Now';
  const selectedInvoiceStatusLabel = invoiceStatusOptions.find((option) => option.value === invoiceStatus)?.label || 'Finalise Invoice';
  const selectedTaxModeLabel = isGstBill ? 'GST Bill' : 'Non-GST Bill';
  const discountSummary = discountAmount > 0
    ? `${formatCurrency(discountAmount)} applied to this invoice.`
    : 'No bill-level discount is applied yet.';
  const membershipSummary = membershipPreview
    ? `${membershipPreview.memberName} saved ${formatCurrency(Number(membershipPreview.discountAmount || 0) + Number(membershipPreview.redeemValue || 0))}.`
    : hasValidCustomerPhone
      ? 'Membership lookup is ready for this customer.'
      : 'Enter a valid customer phone to unlock points and member pricing.';
  const storeCreditSummary = loadingCustomerCredit
    ? 'Checking available store credit for this customer...'
    : !canUseStoreCredit
      ? isWalkInCustomer
        ? 'Store credit stays disabled for Walk-in Customer invoices.'
        : 'Store credit stays disabled for Pay Later invoices.'
      : isStoreCreditApplied
        ? `${formatCurrency(appliedStoreCredit)} applied${selectedCreditNote ? ` from ${selectedCreditNote.noteNumber}` : ''}.`
        : availableCreditNotes.length > 0
          ? `${availableCreditNotes.length} usable credit note${availableCreditNotes.length === 1 ? '' : 's'} available.`
          : 'No usable store credit is available right now.';
  const paymentSummary = paymentSplits.length > 1
    ? `${paymentSplits.length} payment methods are active. ${formatCurrency(splitPaidAmount)} is assigned in splits.`
    : invoiceType === 'credit'
      ? `${selectedPaymentMethodLabel} is selected for partial collections. Outstanding after posting: ${formatCurrency(outstandingAmount)}.`
      : `${selectedPaymentMethodLabel} is selected. Collect now: ${formatCurrency(currentCollectionValue)}${cashChangeDue > 0 ? ` • Change due ${formatCurrency(cashChangeDue)}` : ''}.`;
  const invoiceSettingsSummary = `${selectedInvoiceTypeLabel} • ${selectedInvoiceStatusLabel} • ${selectedTaxModeLabel}`;
  const discountDialogContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
        Choose whether the discount should be a flat amount or a percentage. The applied value updates the grand total immediately.
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <FloatingField
          className="min-w-0"
          label="Mode"
          value={discountType}
          onChange={(value) => setDiscountType(value as 'amount' | 'percentage')}
          options={[
            { value: 'amount', label: 'Amount' },
            { value: 'percentage', label: '%' },
          ]}
        />
        <FloatingField
          className="min-w-0"
          label={discountType === 'percentage' ? 'Discount %' : 'Discount'}
          type="number"
          min="0"
          step="0.01"
          value={discountValue}
          onChange={setDiscountValue}
        />
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm text-gray-300">
          <span>Gross before discount</span>
          <span>{formatCurrency(grossTotal)}</span>
          <span>Discount applied</span>
          <span>- {formatCurrency(discountAmount)}</span>
          <span>Total after discount</span>
          <span>{formatCurrency(netTotal)}</span>
        </div>
      </div>
    </div>
  );
  const membershipDialogContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
        Use membership when the customer is eligible for member discounts or wants to redeem reward points against this sale.
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-gray-300">Points & Membership</span>
          <SalesTooltipChip
            title={buildSalesTooltip(
              'Membership benefits',
              'Use this when the customer should receive member discount or point redemption based on the mobile number.',
              'Example: enter the member phone number, type redeem points if needed, and click Apply.'
            )}
            ariaLabel="Membership help"
          />
        </div>
        <div className="mb-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400">
          {hasValidCustomerPhone
            ? 'Membership lookup is ready for this customer. Apply redeem points or member discounts here.'
            : 'Enter a valid customer phone number above to unlock membership benefits and points.'}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px] sm:items-end">
          <FloatingField
            className="min-w-0"
            label="Redeem Points"
            type="number"
            min="0"
            step="1"
            value={membershipRedeemPoints}
            onChange={setMembershipRedeemPoints}
          />
          <button
            type="button"
            onClick={applyMembershipBenefits}
            disabled={applyingMembership || !hasValidCustomerPhone}
            className="min-h-[48px] rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applyingMembership ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
      {membershipPreview && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          <div className="font-semibold text-white">{membershipPreview.memberName} ({membershipPreview.planName})</div>
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm">
            <span>Saved on this bill</span>
            <span>{formatCurrency(Number(membershipPreview.discountAmount || 0) + Number(membershipPreview.redeemValue || 0))}</span>
            <span>Points after bill</span>
            <span>{Number(membershipPreview.rewardPointsBalance || 0)}</span>
            <span>Points earned now</span>
            <span>{Number(membershipPreview.earnedPoints || 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
  const storeCreditDialogContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/10 p-4 min-h-[128px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Store Credit</span>
            <SalesTooltipChip
              title={buildSalesTooltip(
                'Store credit',
                'Apply a credit note or available store credit balance against this sale.',
                'Example: choose a credit note and apply part or all of the available amount to reduce the bill.'
              )}
              ariaLabel="Store credit help"
            />
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Available</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatCurrency(availableStoreCreditBalance)}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className={`rounded-xl border px-3 py-2 text-xs ${
            !canUseStoreCredit
              ? 'border-amber-400/20 bg-amber-500/10 text-amber-100'
              : 'border-white/10 bg-white/5 text-gray-300'
          }`}>
            {storeCreditStatusLabel}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sales-store-credit-amount" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              Apply Amount
            </label>
            <input
              id="sales-store-credit-amount"
              type="number"
              min="0"
              max={previewStoreCreditLimit > 0 ? String(previewStoreCreditLimit) : undefined}
              step="0.01"
              value={creditNoteAmount}
              onChange={(e) => setCreditNoteAmount(e.target.value)}
              disabled={!canUseStoreCredit || availableCreditNotes.length === 0}
              placeholder="0.00"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white placeholder:text-gray-500 focus:border-cyan-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sales-store-credit-note" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              Credit Note
            </label>
            <select
              id="sales-store-credit-note"
              value={selectedCreditNoteId}
              onChange={(e) => {
                const noteId = e.target.value;
                setSelectedCreditNoteId(noteId);
                const note = availableCreditNotes.find((row) => row._id === noteId) || null;
                const nextAmount = note
                  ? roundTo2(Math.min(Number(note.balanceAmount || 0), Number(total || 0)))
                  : 0;
                setCreditNoteAmount(note ? String(nextAmount) : '');
              }}
              disabled={!canUseStoreCredit || availableCreditNotes.length === 0}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white focus:border-cyan-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" className="bg-gray-900">
                {availableCreditNotes.length === 0 ? 'No store credit available' : 'Select store credit / credit note'}
              </option>
              {availableCreditNotes.map((row) => (
                <option key={row._id} value={row._id} className="bg-gray-900">
                  {row.noteNumber} • {formatCurrency(Number(row.balanceAmount || 0))} • {row.reason || 'Credit'}
                </option>
              ))}
            </select>
          </div>

          {selectedCreditNote && (
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-3 text-xs text-cyan-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{selectedCreditNote.noteNumber}</span>
                <span>Balance {formatCurrency(Number(selectedCreditNote.balanceAmount || 0))}</span>
              </div>
              <p className="mt-1 text-cyan-100/80">{selectedCreditNote.reason || 'Customer store credit note selected for this invoice.'}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-gray-500">
              Max usable now: <span className="font-semibold text-white">{formatCurrency(previewStoreCreditLimit)}</span>
              <span className="ml-3 text-gray-400">Collect after credit: {formatCurrency(postCreditCollectNow)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canUseStoreCredit || availableCreditNotes.length === 0 || previewStoreCreditLimit <= 0}
                onClick={handleApplyStoreCredit}
                className="min-h-[42px] rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply Credit
              </button>
              {isStoreCreditApplied && (
                <button
                  type="button"
                  onClick={handleClearStoreCredit}
                  className="min-h-[42px] rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
  const paymentDialogContent = (
    <div className="space-y-4">
      <CompactOptionGroup
        title="Payment Method"
        titleTooltip={buildSalesTooltip(
          'Payment Method',
          'Choose how money is being collected for this bill right now.',
          'Example: choose UPI for QR payment or Bank Transfer when the customer pays directly from their bank.'
        )}
        options={paymentMethodOptions}
        selectedValue={paymentMethod}
        onSelect={(value) => selectPrimaryPaymentMethod(value as typeof paymentMethod)}
        columnsClassName="grid grid-cols-2 gap-2"
      />

      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SalesSectionHeader
            title="Split Payments"
            tooltip={buildSalesTooltip(
              'Split payments',
              'Split the amount across multiple payment methods and capture cash received to calculate change due.',
              'Example: Cash 1000 and UPI 1274 for the same sale.'
            )}
            compact
          />
          <button
            type="button"
            onClick={() => setPaymentSplits((prev) => [...prev, createPaymentSplitRow('upi')])}
            className="min-h-[38px] rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
          >
            Add Split
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {paymentSplits.map((split, index) => {
            const splitAmount = Math.max(0, Number(split.amount || 0));
            const splitReceived = Math.max(0, Number(split.receivedAmount || split.amount || 0));
            const splitChange = split.method === 'cash' && splitReceived > splitAmount
              ? splitReceived - splitAmount
              : 0;
            return (
              <div key={split.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="space-y-3">
                  <FloatingField
                    className="min-w-0"
                    label={`Method ${index + 1}`}
                    value={split.method}
                    onChange={(value) => setPaymentSplits((prev) => prev.map((row) => row.id === split.id ? { ...row, method: value as OfflinePaymentSplit['method'] } : row))}
                    options={splitPaymentMethodOptions}
                    inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                  />
                  <FloatingField
                    className="min-w-0"
                    label="Amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={split.amount}
                    onChange={(value) => setPaymentSplits((prev) => prev.map((row) => row.id === split.id ? { ...row, amount: value } : row))}
                    inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setPaymentSplits((prev) => prev.length === 1 ? [createPaymentSplitRow(paymentMethod as OfflinePaymentSplit['method'])] : prev.filter((row) => row.id !== split.id))}
                    className="min-h-[44px] rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                  >
                    Remove Split
                  </button>
                </div>
                {split.method === 'cash' && (
                  <div className="mt-3 space-y-2">
                    <FloatingField
                      className="min-w-0"
                      label="Cash Received"
                      type="number"
                      min="0"
                      step="0.01"
                      value={split.receivedAmount || ''}
                      onChange={(value) => setPaymentSplits((prev) => prev.map((row) => row.id === split.id ? { ...row, receivedAmount: value } : row))}
                      inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                    />
                    <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                      Change Due: {formatCurrency(splitChange)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-right text-xs text-gray-400">
            Applied via splits: <span className="font-semibold text-white">{formatCurrency(splitPaidAmount)}</span>
          </div>
        </div>
      </div>

      {invoiceType === 'credit' && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
          <SalesSectionHeader
            title="Credit Settlement"
            tooltip={buildSalesTooltip(
              'Credit settlement',
              'When the invoice type is Credit, you can still record any partial payment collected now and keep the remaining balance outstanding.',
              'Example: for a 10000 invoice, collect 3000 now and keep 7000 as receivable.'
            )}
            compact
          />
          <FloatingField
            className="mt-3"
            label="Paid Amount (optional)"
            type="number"
            min="0"
            step="0.01"
            value={paidAmount}
            onChange={setPaidAmount}
          />
          <div className="mt-3 rounded-xl border border-amber-400/25 bg-black/10 px-3 py-2 text-sm text-amber-100">
            Outstanding: <span className="font-semibold">{formatCurrency(outstandingAmount)}</span>
          </div>
        </div>
      )}
    </div>
  );
  const invoiceSettingsDialogContent = (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-3">
        <CompactOptionGroup
          title="Invoice Type"
          titleTooltip={buildSalesTooltip(
            'Invoice Type',
            'Choose whether this sale is settled now or should remain outstanding as receivable.',
            'Example: choose Paid Now for immediate collection and Pay Later when money will come later.'
          )}
          options={invoiceTypeOptions}
          selectedValue={invoiceType}
          onSelect={(value) => {
            setInvoiceType(value as 'cash' | 'credit');
            if (value === 'cash') setPaidAmount('');
          }}
          accentClassByValue={{
            cash: 'border-emerald-400/40 bg-emerald-500/85 text-white',
            credit: 'border-white/20 bg-white/15 text-white',
          }}
        />

        <CompactOptionGroup
          title="Save Mode"
          titleTooltip={buildSalesTooltip(
            'Invoice Save',
            'Choose whether the invoice should be finalized immediately or kept as a draft.',
            'Example: use Finalise Invoice for normal checkout and Save as Draft when staff still needs approval.'
          )}
          options={invoiceStatusOptions}
          selectedValue={invoiceStatus}
          onSelect={(value) => setInvoiceStatus(value as 'posted' | 'draft')}
          accentClassByValue={{
            posted: 'border-cyan-400/40 bg-cyan-500/85 text-white',
            draft: 'border-white/20 bg-white/15 text-white',
          }}
        />

        <CompactOptionGroup
          title="Tax Mode"
          titleTooltip={buildSalesTooltip(
            'Tax Bill',
            'Choose whether this invoice should be saved with GST billing or without GST.',
            'Example: use GST Bill for normal taxable sales and Non-GST Bill only when the transaction should not carry GST.'
          )}
          options={taxBillOptions}
          selectedValue={isGstBill ? 'gst' : 'non_gst'}
          onSelect={(value) => setIsGstBill(value === 'gst')}
          accentClassByValue={{
            gst: 'border-cyan-400/40 bg-cyan-500/85 text-white',
            non_gst: 'border-white/20 bg-white/15 text-white',
          }}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm text-gray-300">Invoice Notes</span>
          <SalesTooltipChip
            title={buildSalesTooltip(
              'Invoice notes',
              'Use notes for anything the cashier or back office should remember for this specific invoice.',
              'Example: mention promised delivery timing, approved special rate, or customer reminder details.'
            )}
            ariaLabel="Invoice notes help"
          />
        </div>
        <FloatingField
          label="Invoice Notes (optional)"
          rows={3}
          value={saleNotes}
          onChange={setSaleNotes}
          inputClassName="min-h-[92px]"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Advanced Options</p>
            <p className="mt-1 text-[11px] text-gray-400">
              Email, address, round-off, numbering, and print profile stay here so the cashier flow remains cleaner.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowBillingMoreOptions((prev) => !prev)}
            className="min-h-[40px] rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            {showBillingMoreOptions ? 'Hide Options' : 'Show Options'}
          </button>
        </div>
      </div>

      {showBillingMoreOptions && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-gray-300">Invoice Numbering</span>
                <SalesTooltipChip
                  title={buildSalesTooltip(
                    'Invoice numbering',
                    'Choose whether the system should generate the invoice number automatically or whether staff should type a manual number for this bill.',
                    'Example: use manual numbering only when matching a pre-printed book or migration sequence.'
                  )}
                  ariaLabel="Invoice numbering help"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setInvoiceNumberMode('auto')}
                  className={`min-h-[48px] rounded-xl px-3 py-2 text-sm font-semibold ${
                    invoiceNumberMode === 'auto'
                      ? 'bg-indigo-500/85 text-white'
                      : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  Auto Number
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceNumberMode('manual')}
                  className={`min-h-[48px] rounded-xl px-3 py-2 text-sm font-semibold ${
                    invoiceNumberMode === 'manual'
                      ? 'bg-indigo-500/85 text-white'
                      : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  Manual Number
                </button>
              </div>
              {invoiceNumberMode === 'manual' && (
                <FloatingField
                  className="mt-3"
                  label="Manual Invoice Number"
                  required
                  value={manualInvoiceNumber}
                  onChange={setManualInvoiceNumber}
                />
              )}
            </div>

            {!isWalkInCustomer ? (
              <FloatingField
                label="Email ID (optional)"
                type="email"
                value={customerEmail}
                onChange={setCustomerEmail}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-gray-400">
                Email and address stay hidden while this invoice is marked as Walk-in Customer.
              </div>
            )}

            {!isWalkInCustomer ? (
              <FloatingField
                label="Address (optional)"
                rows={3}
                value={customerAddress}
                onChange={setCustomerAddress}
                inputClassName="min-h-[92px]"
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-gray-300">Round-off Mode</span>
                <SalesTooltipChip
                  title={buildSalesTooltip(
                    'Round-off',
                    'Choose how the final total should be rounded after discounts and tax are calculated.',
                    'Example: nearest 1 rupee can turn 999.62 into 1000.00 at checkout.'
                  )}
                  ariaLabel="Round-off help"
                />
              </div>
              <div className="grid gap-2">
                {roundOffModeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRoundOffMode(option.value)}
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                      roundOffMode === option.value
                        ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    <span>{option.label}</span>
                    {roundOffMode === option.value ? <span className="text-[11px] font-semibold">Active</span> : null}
                  </button>
                ))}
              </div>
            </div>

            {settings.printing.showPrintPreviewHint && (
              <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-gray-300">
                <div className="font-semibold text-white">Print Profile</div>
                <div className="mt-1 text-xs text-gray-400">
                  Active profile: {settings.printing.profile}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-gray-300">
              <div className="font-semibold text-white">Invoice Snapshot</div>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs">
                <span>Invoice number</span>
                <span className={invoicePreviewTone}>{invoicePreviewLabel}</span>
                <span>Business date</span>
                <span className="text-white">{invoiceDateLabel}</span>
                <span>Customer mode</span>
                <span className="text-white">{isWalkInCustomer ? 'Walk-in' : 'Linked customer'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  const billSummaryPanel = (
    <div className="space-y-4 xl:sticky xl:top-4">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_60px_rgba(8,15,40,0.16)]">
      <SalesSectionHeader
        title="Bill Summary"
        tooltip={buildSalesTooltip(
          'Bill summary and posting',
          'Keep totals, discount, membership, store credit, payment capture, and invoice posting together on the right so checkout stays focused.',
          'Example: review the total, apply discount or store credit, capture payment, and then post the invoice.'
        )}
      />

      <div className="mt-4 rounded-[24px] border border-indigo-400/20 bg-indigo-500/[0.08] p-5">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm text-gray-200">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
          <span>{isGstBill ? 'GST (18%)' : 'GST'}</span>
          <span>{formatCurrency(gst)}</span>
          <span>Discount</span>
          <span>- {formatCurrency(discountAmount)}</span>
          <span>Store Credit</span>
          <span>- {formatCurrency(appliedStoreCredit)}</span>
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-100/80">Grand Total</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{formatCurrency(total)}</p>
              <p className="mt-1 text-xs text-indigo-100/70">
                {isGstBill ? `Gross ${formatCurrency(grossTotal)} • Round-off ${formatCurrency(roundOffAmount)}` : 'Non-GST billing is active for this invoice.'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 sm:min-w-[150px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{currentCollectionLabel}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(currentCollectionValue)}</p>
              <p className="mt-1 text-[11px] text-gray-500">
                {invoiceType === 'credit'
                  ? 'Outstanding stays open after the amount collected now.'
                  : 'This already reflects discounts, store credit, and split payments.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Payment</p>
                <p className="mt-1 text-xs text-gray-400">{paymentSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSalesDialog('payment')}
                className="min-h-[38px] rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Details
              </button>
            </div>
            <div role="radiogroup" aria-label="Payment method" className="mt-3 grid gap-2 sm:grid-cols-2" data-option-group="sales-payment-inline">
              {paymentMethodOptions.map((option, optionIndex) => {
                const selected = paymentMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Payment Method: ${option.label}`}
                    data-option-index={optionIndex}
                    onClick={() => selectPrimaryPaymentMethod(option.value)}
                    onKeyDown={(event) => handleSalesOptionKeyDown(event, optionIndex, paymentMethodOptions, (value) => selectPrimaryPaymentMethod(value as typeof paymentMethod))}
                    className={`group flex min-h-[42px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${
                      selected
                        ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span
                      aria-hidden="true"
                      className={`inline-flex h-3 w-3 shrink-0 rounded-full border transition ${
                        selected
                          ? 'border-cyan-100/70 bg-cyan-100'
                          : 'border-white/25 bg-transparent group-hover:border-white/40'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Adjust Bill</p>
                <p className="mt-1 text-xs text-gray-400">
                  Keep discounts, loyalty, store credit, and invoice settings secondary until you need them.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSalesDialog('invoice_settings')}
                className="min-h-[38px] rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
              >
                Settings
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setActiveSalesDialog('discount')}
                className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Discount
              </button>
              <button
                type="button"
                onClick={() => setActiveSalesDialog('store_credit')}
                className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Store Credit
              </button>
              <button
                type="button"
                onClick={() => setActiveSalesDialog('membership')}
                className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Points
              </button>
              <button
                type="button"
                onClick={() => setActiveSalesDialog('invoice_settings')}
                className="min-h-[42px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Invoice Settings
              </button>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[11px] text-gray-400">
              <span>Discount</span>
              <span className="text-right text-white">{discountAmount > 0 ? formatCurrency(discountAmount) : 'None'}</span>
              <span>Store credit</span>
              <span className="text-right text-white">{appliedStoreCredit > 0 ? formatCurrency(appliedStoreCredit) : 'None'}</span>
              <span>Points & membership</span>
              <span className="text-right text-white">{membershipPreview ? membershipPreview.memberName : 'Not applied'}</span>
              <span>Invoice mode</span>
              <span className="text-right text-white">{invoiceSettingsSummary}</span>
            </div>
          </div>

          {checkoutWarningMessage && (
            <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {checkoutWarningMessage}
            </p>
          )}

          <div className="rounded-2xl border border-white/10 bg-gray-950/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)]">
              <button
                type="button"
                onClick={() => void handleHoldSale()}
                disabled={cart.length === 0 || processing}
                className="min-h-[52px] rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="block">Hold</span>
                <span className="mt-1 block text-[11px] font-medium text-amber-100/70">Keep for later</span>
              </button>
              <button
                id="sales-checkout-btn"
                className="min-h-[52px] rounded-xl bg-emerald-500 px-4 py-2.5 font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={cart.length === 0 || processing}
                onClick={handleCheckout}
              >
                <span className="block">{primaryCheckoutLabel}</span>
                <span className="mt-1 block text-[11px] font-medium text-emerald-50/80">Shortcut: Ctrl+Enter or F9</span>
              </button>
            </div>
          </div>

          {checkoutMessage && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {checkoutMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const handleProductListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!hasMoreProducts || loading || loadingMoreProducts) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining <= PRODUCT_SCROLL_THRESHOLD_PX) {
      void fetchProducts(false);
    }
  };

  useEscapeKey(() => {
    if (activeSalesDialog) {
      setActiveSalesDialog(null);
      return;
    }
    if (showScannerSettings) {
      setShowScannerSettings(false);
      return;
    }
    if (showInvoicePrompt) {
      setShowInvoicePrompt(false);
      return;
    }
    if (showQuickAddModal) {
      setShowQuickAddModal(false);
      return;
    }
    if (showOfflineTools) {
      setShowOfflineTools(false);
      return;
    }
    if (showResumePrompt) {
      setShowResumePrompt(false);
      return;
    }
    if (showCatalogPanel) {
      setShowCatalogPanel(false);
    }
  }, {
    enabled: Boolean(activeSalesDialog) || showScannerSettings || showInvoicePrompt || showQuickAddModal || showOfflineTools || showResumePrompt || showCatalogPanel,
  });

  return (
    <>
      <div className={`relative w-full max-w-none px-4 lg:px-6 xl:px-8 ${isMinimalMode ? 'min-h-[calc(100vh-78px)] py-2' : 'min-h-[calc(100vh-80px)] py-6'}`}>
        {showCatalogPanel && (
        <div className="fixed inset-0 z-50 bg-black/75 px-4 py-4 sm:px-6">
          <div
            ref={catalogDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Product Catalog"
            tabIndex={-1}
            onKeyDownCapture={handleCatalogDialogKeyDownCapture}
            className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-gray-950/95 shadow-2xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Add Product</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Product Catalog</h3>
                <p className="mt-1 text-xs text-gray-400">
                  Search by name, SKU, barcode, or variant from the locally cached catalog.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                  isOnline
                    ? 'bg-emerald-500/15 text-emerald-100'
                    : 'bg-amber-500/15 text-amber-100'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                  {isOnline ? 'Using local catalog with online refresh' : 'Offline local catalog'}
                </span>
                <ActionIconButton
                  kind="refresh"
                  onClick={() => void fetchProducts(true)}
                  disabled={refreshingCatalog}
                  title={refreshingCatalog ? 'Refreshing...' : 'Refresh Local Catalog'}
                />
                <button
                  type="button"
                  onClick={() => setShowCatalogPanel(false)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
                  aria-label="Close product catalog"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3 text-xs text-gray-400">
              <span>{catalogUpdatedAt ? `Catalog updated ${new Date(catalogUpdatedAt).toLocaleString('en-IN')}` : 'Local catalog not loaded yet'}</span>
              <span>{productTotalCount ? `${productTotalCount} products available offline` : 'No cached products yet'}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex justify-end">
            <CardTabs
              compact
              frame={false}
              ariaLabel="Product view tabs"
              items={productViewOptions}
              activeKey={productViewMode}
              onChange={setProductViewMode}
              listClassName="flex flex-wrap justify-end gap-2 border-b-0 px-0 pt-0"
            />
          </div>

          <div className="mb-5 flex flex-col gap-3">
            <div className="min-w-0">
              <input
                ref={productSearchInputRef}
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && filteredProducts.length > 0) {
                    e.preventDefault();
                    setProductViewMode('table');
                    setProductPage(1);
                    const firstProduct = filteredProducts[0];
                    if (!firstProduct) return;
                    setCatalogSelectedProductId(getCatalogProductId(firstProduct));
                    focusCatalogTable();
                    return;
                  }
                  if (e.key === 'ArrowUp' && filteredProducts.length > 0) {
                    e.preventDefault();
                    setProductViewMode('table');
                    const lastIndex = filteredProducts.length - 1;
                    const lastProduct = filteredProducts[lastIndex];
                    if (!lastProduct) return;
                    setProductPage(Math.floor(lastIndex / PRODUCTS_PER_PAGE) + 1);
                    setCatalogSelectedProductId(getCatalogProductId(lastProduct));
                    focusCatalogTable();
                    return;
                  }
                }}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-gray-500 outline-none focus:border-indigo-400"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
                <p>Press the down arrow to move from search into the product table.</p>
                {debouncedCatalogSearchTerm ? (
                  <p className="text-cyan-200/80">
                    {catalogSearchLoading
                      ? 'Searching top matches...'
                      : `Showing up to ${CATALOG_SEARCH_RESULT_LIMIT} matching products for faster search.`}
                  </p>
                ) : (
                  <p>Browse the cached catalog page by page when you are not searching.</p>
                )}
              </div>
            </div>
          </div>

          {(loading || catalogSearchLoading) && (
            <p className="rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-300">
              {loading
                ? 'Loading products... You can continue billing while the list keeps loading.'
                : 'Searching products...'}
            </p>
          )}
          {!loading && !catalogSearchLoading && filteredProducts.length === 0 && (
            <p className="rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-gray-400">No products found.</p>
          )}

          {!loading && !catalogSearchLoading && filteredProducts.length > 0 && productViewMode === 'grid' && (
            <div className="max-h-[68vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pagedProducts.rows.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    className={`rounded-lg border border-white/10 bg-black/20 p-4 text-left transition duration-150 hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.98] ${
                      activeProductId === String(product._id || '') ? 'sarva-product-added ring-2 ring-emerald-400/60' : ''
                    }`}
                    onClick={() => addToCart(product)}
                  >
                    <h3 className="text-base font-semibold text-white">{product.name}</h3>
                    <p className="text-sm text-gray-400">{product.sku}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold text-indigo-300">{formatCurrency(product.price)}</span>
                      <span className="rounded bg-white/10 px-2 py-1 text-xs text-gray-300">
                        {requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && !catalogSearchLoading && filteredProducts.length > 0 && productViewMode === 'title' && (
            <div className="space-y-2">
              {pagedProducts.rows.map((product) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className={`flex w-full items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-left transition duration-150 hover:bg-white/10 active:scale-[0.99] ${
                    activeProductId === String(product._id || '') ? 'sarva-product-added ring-2 ring-emerald-400/60' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</p>
                    <p className="text-[11px] text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!loading && !catalogSearchLoading && filteredProducts.length > 0 && productViewMode === 'table' && (
            <div
              ref={catalogTableRef}
              data-catalog-table="true"
              tabIndex={0}
              onKeyDown={handleCatalogTableKeyDown}
              className="overflow-x-auto rounded-lg border border-white/10 outline-none focus:ring-2 focus:ring-cyan-400/50"
              role="grid"
              aria-label="Product catalog results"
              aria-activedescendant={catalogSelectedProductId ? `catalog-row-${catalogSelectedProductId}` : undefined}
            >
              <table className="min-w-full divide-y divide-white/10 bg-black/20">
                <thead className="bg-white/5">
                  <tr>
                    {['Product', 'SKU', 'Price', 'Stock', 'Action'].map((header) => (
                      <th key={header} className="px-3 py-2 text-left text-xs font-semibold text-gray-300">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {pagedProducts.rows.map((product) => (
                    <tr
                      key={product._id}
                      id={`catalog-row-${getCatalogProductId(product)}`}
                      role="row"
                      aria-selected={catalogSelectedProductId === getCatalogProductId(product)}
                      onClick={() => selectCatalogProduct(product, { focusTable: true })}
                      onDoubleClick={() => addToCart(product)}
                      className={`cursor-pointer outline-none transition ${
                        catalogSelectedProductId === getCatalogProductId(product)
                          ? 'bg-cyan-500/12 ring-1 ring-inset ring-cyan-400/40'
                          : activeProductId === String(product._id || '')
                            ? 'sarva-product-added bg-emerald-500/10'
                            : 'hover:bg-white/5'
                      }`}
                    >
                      <td className="px-3 py-2 text-sm font-medium text-white">{product.name}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{product.sku}</td>
                      <td className="px-3 py-2 text-sm text-indigo-300">{formatCurrency(product.price)}</td>
                      <td className="px-3 py-2 text-sm text-gray-300">{requiresStockTracking(product) ? product.stock : itemTypeLabel(product)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(product);
                          }}
                          className={`rounded-md px-2 py-1 text-xs font-semibold text-white transition duration-150 active:scale-95 ${
                            activeProductId === String(product._id || '') ? 'sarva-product-added bg-emerald-500' : 'bg-indigo-500/80 hover:bg-indigo-400'
                          }`}
                        >
                          {activeProductId === String(product._id || '') ? 'Added' : 'Add'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !catalogSearchLoading && filteredProducts.length > 0 && productViewMode === 'image' && (
            <div className="max-h-[68vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pagedProducts.rows.map((product) => (
                  <button
                    key={product._id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className={`overflow-hidden rounded-lg border border-white/10 bg-black/20 text-left transition duration-150 hover:-translate-y-0.5 hover:bg-white/10 active:scale-[0.98] ${
                      activeProductId === String(product._id || '') ? 'sarva-product-added ring-2 ring-emerald-400/60' : ''
                    }`}
                  >
                    <div className="flex h-32 items-center justify-center bg-white/5">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-4xl font-bold text-white/20">{String(product.name || '?').slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-white">{product.name}</h3>
                      <p className="text-xs text-gray-400">{product.sku}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</span>
                        <span className="text-xs text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && hasMoreProducts && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
              <span>
                Loaded {products.length} of {productTotalCount || products.length} products
              </span>
              <button
                type="button"
                onClick={() => void fetchProducts(false)}
                disabled={loadingMoreProducts}
                className="rounded border border-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMoreProducts ? 'Loading more...' : 'Load more'}
              </button>
            </div>
          )}

          {!loading && !catalogSearchLoading && filteredProducts.length > PRODUCTS_PER_PAGE && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-300">
              <span>
                Showing {pagedProducts.startDisplay}-{pagedProducts.endDisplay} of {pagedProducts.totalRows}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagedProducts.currentPage <= 1}
                  onClick={() => setProductPage((prev) => Math.max(1, prev - 1))}
                  className="rounded border border-white/15 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <span>
                  Page {pagedProducts.currentPage} / {pagedProducts.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagedProducts.currentPage >= pagedProducts.totalPages}
                  onClick={() => setProductPage((prev) => Math.min(pagedProducts.totalPages, prev + 1))}
                  className="rounded border border-white/15 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
            </div>
          </div>
        </div>
        )}

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-4 shadow-[0_18px_60px_rgba(8,15,40,0.16)]">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-white">Sales Invoice</h1>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                    invoiceStatus === 'draft'
                      ? 'bg-white/10 text-gray-200'
                      : 'bg-emerald-500/15 text-emerald-100'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${invoiceStatus === 'draft' ? 'bg-gray-300' : 'bg-emerald-300'}`} />
                    {invoiceStatus === 'draft' ? 'Draft Mode' : 'Ready to Post'}
                  </span>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${
                    syncIndicatorState === 'synced'
                      ? 'bg-emerald-500/15 text-emerald-100'
                      : syncIndicatorState === 'syncing'
                        ? 'bg-cyan-500/15 text-cyan-100'
                        : 'bg-amber-500/15 text-amber-100'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${
                      syncIndicatorState === 'synced'
                        ? 'bg-emerald-300'
                        : syncIndicatorState === 'syncing'
                          ? 'bg-cyan-300'
                          : 'bg-amber-300'
                    }`} />
                    {syncIndicatorState === 'synced'
                      ? 'Synced'
                      : syncIndicatorState === 'syncing'
                        ? 'Syncing'
                        : 'Offline'}
                    {queuedSalesCount > 0 ? ` • ${queuedSalesCount} pending` : ''}
                  </span>
                  <ManualHelpLink anchor="transaction-sales-invoice" />
                </div>
                <p className="mt-2 max-w-3xl text-sm text-gray-400">
                  Fast billing, payment capture, GST and invoice posting.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleStartNewSale()}
                  className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  New Sale
                </button>
                <button
                  type="button"
                  onClick={() => void handleHoldSale()}
                  disabled={cart.length === 0 || processing}
                  className="min-h-[44px] rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Hold
                </button>
                <Tooltip
                  arrow
                  placement="bottom-start"
                  title={buildSalesTooltip(
                    'Recall',
                    'Recall reopens held sales and local draft invoices saved on this device so the cashier can continue without re-entering items.',
                    'Example: hold a half-finished sale while the customer checks one more product, then click Recall and reopen the same invoice when they return.'
                  )}
                  slotProps={salesTooltipSlotProps}
                >
                  <button
                    type="button"
                    onClick={handleRecallSales}
                    className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Recall{recallCount > 0 ? ` (${recallCount})` : ''}
                  </button>
                </Tooltip>
                <Tooltip
                  arrow
                  placement="bottom-start"
                  title={buildSalesTooltip(
                    'Sync Now',
                    'Sync Now pushes queued offline sales to the server and refreshes local sync status after the connection is back.',
                    'Example: if morning billing continued during an internet outage, click Sync Now after the connection returns so those invoices reach the main server and reports.'
                  )}
                  slotProps={salesTooltipSlotProps}
                >
                  <span>
                    <button
                      type="button"
                      onClick={() => void syncQueuedSales(true)}
                      disabled={syncingQueue}
                      className="min-h-[44px] rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {syncingQueue ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </span>
                </Tooltip>
                <button
                  type="button"
                  onClick={() => setShowOfflineTools(true)}
                  className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  More
                </button>
              </div>
            </div>
          </div>

          {syncMessage && (
            <p className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              {syncMessage}
            </p>
          )}

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_60px_rgba(8,15,40,0.12)]">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">Customer</p>
                    <SalesTooltipChip
                      title={buildSalesTooltip(
                        'Customer lookup',
                        'Start the invoice by selecting or typing the customer contact so billing can reuse existing profiles and balances.',
                        'Example: enter the customer mobile number, choose the match, then continue adding items.'
                      )}
                      ariaLabel="Customer lookup help"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 px-3 py-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={isWalkInCustomer}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsWalkInCustomer(checked);
                        if (checked) {
                          setCustomerPhone('');
                          setCustomerEmail('');
                          setCustomerAddress('');
                          setSelectedCustomerId('');
                          setCustomerMatches([]);
                          setCustomerCredit(null);
                          setSelectedCreditNoteId('');
                          setCreditNoteAmount('');
                        }
                      }}
                    />
                    Walk-in Customer
                  </label>
                </div>

                {!isWalkInCustomer ? (
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,0.9fr)]">
                    <div>
                      <FloatingField
                        label="Customer Phone"
                        required
                        value={customerPhone}
                        name="lookup_customer"
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="numeric"
                        dataLpignore="true"
                        onChange={(value) => {
                          setCustomerPhone(value);
                          setSelectedCustomerId('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (!customerMatches.length) return;
                            setCustomerActiveIndex((prev) => (prev >= customerMatches.length - 1 ? 0 : prev + 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (!customerMatches.length) return;
                            setCustomerActiveIndex((prev) => (prev <= 0 ? customerMatches.length - 1 : prev - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            if (!customerMatches.length) return;
                            e.preventDefault();
                            const selected = customerMatches[customerActiveIndex] || customerMatches[0];
                            if (selected) selectCustomer(selected);
                          }
                        }}
                      />
                      {searchingCustomers && <p className="mt-2 text-[11px] text-gray-400">Searching customers...</p>}
                      {!searchingCustomers && customerMatches.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-1">
                          {customerMatches.map((customer, index) => (
                            <button
                              key={customer._id}
                              type="button"
                              onClick={() => selectCustomer(customer)}
                              className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                                customerActiveIndex === index ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-200 hover:bg-white/10'
                              }`}
                            >
                              {customer.name} | {customer.phone || '-'} {customer.customerCode ? `(${customer.customerCode})` : ''}
                              {customer.source === 'member' && (
                                <span className="ml-1 text-cyan-200">[Member{customer.memberCode ? ` ${customer.memberCode}` : ''}]</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <FloatingField label="Customer Name" value={customerName} onChange={setCustomerName} />
                    <FloatingField
                      label="Membership / Member ID (optional)"
                      value={membershipLookupCode}
                      onChange={setMembershipLookupCode}
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-gray-400">
                    Walk-in customer mode is active. Customer lookup, store credit, and CRM linking stay skipped until you turn it off.
                  </div>
                )}

                {(willCreateNewCustomer || selectedCustomerId) && (
                  <div className="flex flex-wrap gap-2">
                    {willCreateNewCustomer ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                        New customer will be created from this phone number on save.
                      </span>
                    ) : null}
                    {!!selectedCustomerId ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
                        Existing customer selected from database.
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Invoice No.</p>
                  <p className={`mt-2 text-base font-semibold ${invoicePreviewTone}`}>{invoicePreviewLabel}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setInvoiceNumberMode('auto')}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                        invoiceNumberMode === 'auto'
                          ? 'bg-indigo-500/85 text-white'
                          : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceNumberMode('manual')}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                        invoiceNumberMode === 'manual'
                          ? 'bg-indigo-500/85 text-white'
                          : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      Manual
                    </button>
                  </div>
                  {invoiceNumberMode === 'manual' && (
                    <FloatingField
                      className="mt-3"
                      label="Manual Invoice Number"
                      required
                      value={manualInvoiceNumber}
                      onChange={setManualInvoiceNumber}
                    />
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Date</p>
                  <p className="mt-2 text-base font-semibold text-white">{invoiceDateLabel}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      invoiceStatus === 'draft' ? 'bg-white/10 text-gray-200' : 'bg-emerald-500/15 text-emerald-100'
                    }`}>
                      {invoiceStatus === 'draft' ? 'Draft Mode' : 'Ready to Post'}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      isGstBill ? 'bg-cyan-500/15 text-cyan-100' : 'bg-amber-500/15 text-amber-100'
                    }`}>
                      {isGstBill ? 'GST Bill' : 'Non-GST Bill'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Tax Bill</p>
                      <p className="mt-2 text-sm font-semibold text-white">GST Bill</p>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={isGstBill}
                        onChange={(e) => setIsGstBill(e.target.checked)}
                        className="peer sr-only"
                      />
                      <span className="h-6 w-11 rounded-full bg-white/10 transition peer-checked:bg-indigo-500/90" />
                      <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                    </label>
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Use this quick toggle here, or adjust the full tax mode in More Options below.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`${isMinimalMode ? 'space-y-3' : 'space-y-4'}`}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)] xl:items-start">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_14px_40px_rgba(8,15,40,0.12)]">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">Scan / Search Product</p>
                          <SalesTooltipChip
                            title={buildSalesTooltip(
                              'Scan or search product',
                              'Use one fast entry lane for barcode scan, SKU lookup, or typed search before sending the sale into the detailed product catalog.',
                              'Example: scan a football barcode, or type the first few letters of a product name and press Enter to add it.'
                            )}
                            ariaLabel="Scan or search product help"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {enableProductScanner
                            ? `Scanner mode active • Submit with ${getCodeScannerSubmitLabel(scannerSettings.submitKey)}`
                            : 'Search by product name, SKU, or barcode. Use the down arrow inside results and press Enter to add.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowScannerSettings(true)}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                          title="Code Scanner settings"
                        >
                          <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                            <path d="M11.983 1.722a1 1 0 0 0-1.966 0l-.143.86a7.329 7.329 0 0 0-1.62.669l-.708-.507a1 1 0 0 0-1.37.12L4.6 4.44a1 1 0 0 0 .12 1.37l.507.708a7.329 7.329 0 0 0-.669 1.62l-.86.143a1 1 0 0 0 0 1.966l.86.143c.13.564.354 1.105.669 1.62l-.507.708a1 1 0 0 0-.12 1.37l1.576 1.576a1 1 0 0 0 1.37.12l.708-.507c.515.315 1.056.539 1.62.669l.143.86a1 1 0 0 0 1.966 0l.143-.86a7.33 7.33 0 0 0 1.62-.669l.708.507a1 1 0 0 0 1.37-.12l1.576-1.576a1 1 0 0 0-.12-1.37l-.507-.708a7.33 7.33 0 0 0 .669-1.62l.86-.143a1 1 0 0 0 0-1.966l-.86-.143a7.33 7.33 0 0 0-.669-1.62l.507-.708a1 1 0 0 0 .12-1.37L13.824 2.864a1 1 0 0 0-1.37-.12l-.708.507a7.329 7.329 0 0 0-1.62-.669l-.143-.86ZM10 12.75A2.75 2.75 0 1 1 10 7.25a2.75 2.75 0 0 1 0 5.5Z" />
                          </svg>
                          Settings
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnableProductScanner((prev) => !prev)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                            enableProductScanner ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-200'
                          }`}
                        >
                          {enableProductScanner ? 'Scanner On' : 'Scanner Off'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                          {enableProductScanner ? (
                            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-100">
                              Ready to scan...
                            </span>
                          ) : (
                            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 font-semibold text-cyan-100">
                              Fast add mode
                            </span>
                          )}
                          <span>{enableProductScanner ? 'Scan and submit directly to add items.' : 'Type, press Down Arrow, then Enter to add.'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCatalogPanel(true)}
                          className="min-h-[38px] rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          Full Catalog
                        </button>
                      </div>

                      <div className="relative min-w-0 flex-1">
                        <input
                          ref={(node) => {
                            if (enableProductScanner) {
                              scannerInputRef.current = node;
                            } else {
                              inlineSearchInputRef.current = node;
                            }
                          }}
                          type="text"
                          value={enableProductScanner ? scanCode : inlineProductSearch}
                          onChange={(e) => {
                            if (enableProductScanner) {
                              setScanCode(e.target.value);
                              return;
                            }
                            setInlineProductSearch(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (enableProductScanner) {
                              if (isConfiguredScannerSubmitKey(e.key, scannerSettings.submitKey)) {
                                e.preventDefault();
                                void handleProductCodeScan();
                              }
                              return;
                            }

                            if (e.key === 'ArrowDown') {
                              if (!inlineSearchResults.length) return;
                              e.preventDefault();
                              setInlineActiveIndex((prev) => Math.min(prev + 1, inlineSearchResults.length - 1));
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              if (!inlineSearchResults.length) return;
                              e.preventDefault();
                              setInlineActiveIndex((prev) => Math.max(prev - 1, 0));
                              return;
                            }
                            if (e.key === 'Enter') {
                              if (!inlineSearchResults.length) return;
                              e.preventDefault();
                              const selected = inlineSearchResults[inlineActiveIndex] || inlineSearchResults[0];
                              if (selected) addProductFromInlineSearch(selected);
                            }
                          }}
                          placeholder={enableProductScanner ? `Scan SKU / barcode and press ${getCodeScannerSubmitLabel(scannerSettings.submitKey)}` : 'Scan barcode or search product by name, code'}
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400"
                        />

                        {!enableProductScanner && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-2">
                            {inlineSearchLoading ? (
                              <div className="rounded-2xl border border-white/10 bg-gray-950/95 px-3 py-3 text-sm text-gray-300 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                                Searching products...
                              </div>
                            ) : inlineProductSearch.trim().length >= 2 && inlineSearchResults.length === 0 ? (
                              <div className="rounded-2xl border border-white/10 bg-gray-950/95 px-3 py-3 text-sm text-gray-400 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                                No matching products found. Use Full Catalog for deeper search.
                              </div>
                            ) : inlineSearchResults.length > 0 ? (
                              <div className="overflow-hidden rounded-2xl border border-white/10 bg-gray-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                                {inlineSearchResults.map((product, index) => (
                                  <button
                                    key={product._id}
                                    type="button"
                                    onMouseEnter={() => setInlineActiveIndex(index)}
                                    onClick={() => addProductFromInlineSearch(product)}
                                    className={`flex w-full items-center justify-between gap-3 border-b border-white/10 px-3 py-2 text-left last:border-b-0 ${
                                      inlineActiveIndex === index ? 'bg-cyan-500/15 text-cyan-100' : 'text-gray-200 hover:bg-white/10'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold">{product.name}</div>
                                      <div className="truncate text-[11px] text-gray-400">{product.sku}</div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <div className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</div>
                                      <div className="text-[11px] text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</div>
                                    </div>
                                  </button>
                                ))}
                                <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-[11px] text-gray-500">
                                  <span>Enter adds the highlighted product.</span>
                                  <button
                                    type="button"
                                    onClick={() => setShowCatalogPanel(true)}
                                    className="font-semibold text-cyan-100 hover:text-white"
                                  >
                                    Open full catalog
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
                      <span>Shortcut: `Ctrl + K` or `/`</span>
                      <span>
                        {recallCount > 0
                          ? `${heldSales.length} held sale${heldSales.length === 1 ? '' : 's'} and ${draftSales.length} draft${draftSales.length === 1 ? '' : 's'} available in Recall.`
                          : 'Use Recall from the header when you need to reopen held or draft sales.'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_60px_rgba(8,15,40,0.14)]">
                  <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <SalesSectionHeader
                        title={`Items (${cart.length})`}
                        tooltip={buildSalesTooltip(
                          'Items in current sale',
                          'Review added products here, change quantity, switch variants, and fill any required stock controls like batch or expiry before checkout.',
                          'Example: add two shoes, switch the size and color, then continue to customer and payment details.'
                        )}
                      />
                      <p className="mt-2 text-sm text-gray-400">
                        Keep the billing table visible while you scan, search, edit quantities, and review stock-controlled item details.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] font-semibold text-gray-300">
                        {cart.length} line{cart.length === 1 ? '' : 's'}
                      </span>
                      <span className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] font-semibold text-gray-300">
                        {cartUnitCount} unit{cartUnitCount === 1 ? '' : 's'}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                        isGstBill ? 'bg-cyan-500/15 text-cyan-100' : 'bg-amber-500/15 text-amber-100'
                      }`}>
                        {isGstBill ? 'GST Bill' : 'Non-GST Bill'}
                      </span>
                    </div>
                  </div>

                  <div className={`${isMinimalMode ? 'mt-4' : 'mt-4 max-h-[54vh] overflow-y-auto pr-1'}`}>
                    {cart.length === 0 ? (
                      <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/10 text-sm text-gray-400">
                        <div className="space-y-3 text-center">
                          <p>No items have been added yet.</p>
                          <button
                            type="button"
                            onClick={() => setShowCatalogPanel(true)}
                            className="min-h-[44px] rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-400"
                          >
                            Add First Product
                          </button>
                        </div>
                      </div>
                    ) : (
                      <SalesCartTable
                        cart={cart}
                        cartValidationErrors={cartValidationErrors}
                        formatCurrency={formatCurrency}
                        getVariantOptions={getVariantOptions}
                        variantOptionValue={variantOptionValue}
                        variantOptionLabel={variantOptionLabel}
                        normalizeSerialNumbers={normalizeSerialNumbers}
                        onUpdateVariant={updateCartVariant}
                        onUpdateQuantity={updateQuantity}
                        onSetQuantity={setCartQuantity}
                        onRemove={removeFromCart}
                        onUpdateField={updateCartItemField}
                        cartItemRefs={cartItemRefs}
                        expiryInputRefs={expiryInputRefs}
                        serialInputRefs={serialInputRefs}
                        serialTrackingHelpText="Turn this on only when each sold unit needs a unique serial number recorded for warranty, audit, or service follow-up."
                      />
                    )}
                  </div>
                </div>
              </div>

              {billSummaryPanel}
            </div>
          </div>

          <div className="hidden">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_60px_rgba(8,15,40,0.14)]">
              <SalesSectionHeader
                title="Invoice Settings"
                tooltip={buildSalesTooltip(
                  'Billing details and notes',
                  'Use this area for invoice behaviour, notes, and lower-frequency billing fields that do not need to stay in the cashier’s main line of sight.',
                  'Example: keep Paid Now + Finalise + GST Bill active, then add a note or open More Options only when you need extra details.'
                )}
              />
              <p className="mt-2 text-sm text-gray-400">
                Keep invoice type, save mode, tax mode, notes, and advanced settings together at the bottom so the cashier can finish billing without a crowded main workspace.
              </p>
              <div className="space-y-4">
                <div className="grid gap-3 xl:grid-cols-3">
                  <CompactOptionGroup
                    title="Invoice Type"
                    titleTooltip={buildSalesTooltip(
                      'Invoice Type',
                      'Choose whether this sale is settled now or should remain outstanding as receivable.',
                      'Example: choose Paid Now for immediate collection and Pay Later when money will come later.'
                    )}
                    options={invoiceTypeOptions}
                    selectedValue={invoiceType}
                    onSelect={(value) => {
                      setInvoiceType(value as 'cash' | 'credit');
                      if (value === 'cash') setPaidAmount('');
                    }}
                    accentClassByValue={{
                      cash: 'border-emerald-400/40 bg-emerald-500/85 text-white',
                      credit: 'border-white/20 bg-white/15 text-white',
                    }}
                  />

                  <CompactOptionGroup
                    title="Save Mode"
                    titleTooltip={buildSalesTooltip(
                      'Invoice Save',
                      'Choose whether the invoice should be finalized immediately or kept as a draft.',
                      'Example: use Finalise Invoice for normal checkout and Save as Draft when staff still needs approval.'
                    )}
                    options={invoiceStatusOptions}
                    selectedValue={invoiceStatus}
                    onSelect={(value) => setInvoiceStatus(value as 'posted' | 'draft')}
                    accentClassByValue={{
                      posted: 'border-cyan-400/40 bg-cyan-500/85 text-white',
                      draft: 'border-white/20 bg-white/15 text-white',
                    }}
                  />

                  <CompactOptionGroup
                    title="Tax Mode"
                    titleTooltip={buildSalesTooltip(
                      'Tax Bill',
                      'Choose whether this invoice should be saved with GST billing or without GST.',
                      'Example: use GST Bill for normal taxable sales and Non-GST Bill only when the transaction should not carry GST.'
                    )}
                    options={taxBillOptions}
                    selectedValue={isGstBill ? 'gst' : 'non_gst'}
                    onSelect={(value) => setIsGstBill(value === 'gst')}
                    accentClassByValue={{
                      gst: 'border-cyan-400/40 bg-cyan-500/85 text-white',
                      non_gst: 'border-white/20 bg-white/15 text-white',
                    }}
                  />
                </div>

                <FloatingField
                  label="Invoice Notes (optional)"
                  rows={3}
                  value={saleNotes}
                  onChange={setSaleNotes}
                  inputClassName="min-h-[92px]"
                />

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Advanced Options</p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      Email, address, print profile, and round-off controls stay here so the fast billing line stays clean.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBillingMoreOptions((prev) => !prev)}
                    className="min-h-[40px] rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    {showBillingMoreOptions ? 'Hide Options' : 'Show Options'}
                  </button>
                </div>

                {showBillingMoreOptions && (
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                    <div className="space-y-4">
                      {!isWalkInCustomer ? (
                        <FloatingField
                          label="Email ID (optional)"
                          type="email"
                          value={customerEmail}
                          onChange={setCustomerEmail}
                        />
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-gray-400">
                          Email and address stay hidden while this invoice is marked as Walk-in Customer.
                        </div>
                      )}

                      {!isWalkInCustomer ? (
                        <FloatingField
                          label="Address (optional)"
                          rows={3}
                          value={customerAddress}
                          onChange={setCustomerAddress}
                          inputClassName="min-h-[92px]"
                        />
                      ) : null}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">Round-off Mode</div>
                            <div className="mt-1 text-xs text-gray-400">
                              {roundOffModeOptions.find((option) => option.value === roundOffMode)?.label || 'Never round off'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowOfflineTools(true)}
                            className="min-h-[40px] rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                          >
                            Change
                          </button>
                        </div>
                      </div>

                      {settings.printing.showPrintPreviewHint && (
                        <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-gray-300">
                          <div className="font-semibold text-white">Print Profile</div>
                          <div className="mt-1 text-xs text-gray-400">
                            Active profile: {settings.printing.profile}
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-gray-300">
                        <div className="font-semibold text-white">Invoice Snapshot</div>
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-xs">
                          <span>Invoice number</span>
                          <span className={invoicePreviewTone}>{invoicePreviewLabel}</span>
                          <span>Business date</span>
                          <span className="text-white">{invoiceDateLabel}</span>
                          <span>Customer mode</span>
                          <span className="text-white">{isWalkInCustomer ? 'Walk-in' : 'Linked customer'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="hidden rounded-xl border border-white/10 bg-white/5 p-4">
              <SalesSectionHeader
                title="Customer & Invoice"
                tooltip={buildSalesTooltip(
                  'Customer and invoice details',
                  'Start with customer phone because it can find an existing customer or create a new profile automatically when the invoice is saved.',
                  'Example: type the customer mobile number, use Arrow Down and Enter to select a match, then continue billing.'
                )}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                  <label className="inline-flex items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={isWalkInCustomer}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsWalkInCustomer(checked);
                        if (checked) {
                          setCustomerPhone('');
                          setCustomerEmail('');
                          setCustomerAddress('');
                          setSelectedCustomerId('');
                          setCustomerMatches([]);
                          setCustomerCredit(null);
                          setSelectedCreditNoteId('');
                          setCreditNoteAmount('');
                        }
                      }}
                    />
                    Walk-in Customer
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {isWalkInCustomer
                      ? 'Phone, email, address, and customer lookup are skipped for this sale.'
                      : 'Phone is required unless you switch this sale to Walk-in Customer. The app checks the local cache first and creates or syncs the customer when needed.'}
                  </span>
                </div>

                {!isWalkInCustomer && (
                  <div className="md:col-span-2 grid gap-3 xl:grid-cols-2">
                    <div>
                      <FloatingField
                        label="Customer Phone"
                        required
                        value={customerPhone}
                        name="lookup_customer"
                        autoComplete="new-password"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        inputMode="numeric"
                        dataLpignore="true"
                        onChange={(value) => {
                          setCustomerPhone(value);
                          setSelectedCustomerId('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            if (!customerMatches.length) return;
                            setCustomerActiveIndex((prev) => (prev >= customerMatches.length - 1 ? 0 : prev + 1));
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            if (!customerMatches.length) return;
                            setCustomerActiveIndex((prev) => (prev <= 0 ? customerMatches.length - 1 : prev - 1));
                            return;
                          }
                          if (e.key === 'Enter') {
                            if (!customerMatches.length) return;
                            e.preventDefault();
                            const selected = customerMatches[customerActiveIndex] || customerMatches[0];
                            if (selected) selectCustomer(selected);
                          }
                        }}
                      />
                      {searchingCustomers && <p className="mt-2 text-[11px] text-gray-400">Searching customers...</p>}
                      {!searchingCustomers && customerMatches.length > 0 && (
                        <div className="mt-2 max-h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-1">
                          {customerMatches.map((customer, index) => (
                            <button
                              key={customer._id}
                              type="button"
                              onClick={() => selectCustomer(customer)}
                              className={`block w-full rounded px-2 py-1 text-left text-xs transition ${
                                customerActiveIndex === index ? 'bg-cyan-500/20 text-cyan-100' : 'text-gray-200 hover:bg-white/10'
                              }`}
                            >
                              {customer.name} | {customer.phone || '-'} {customer.customerCode ? `(${customer.customerCode})` : ''}
                              {customer.source === 'member' && (
                                <span className="ml-1 text-indigo-200">[Member{customer.memberCode ? ` ${customer.memberCode}` : ''}]</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <FloatingField
                      label="Membership ID (optional)"
                      value={membershipLookupCode}
                      onChange={setMembershipLookupCode}
                    />
                  </div>
                )}

                {(willCreateNewCustomer || selectedCustomerId) && (
                  <div className="md:col-span-2 flex flex-wrap gap-2">
                    {willCreateNewCustomer ? (
                      <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                        New customer will be created from this phone number on save.
                      </span>
                    ) : null}
                    {!!selectedCustomerId ? (
                      <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-200">
                        Existing customer selected from database.
                      </span>
                    ) : null}
                  </div>
                )}

                <FloatingField label="Customer Name" value={customerName} onChange={setCustomerName} />
                {!isWalkInCustomer ? (
                  <FloatingField label="Email ID (optional)" type="email" value={customerEmail} onChange={setCustomerEmail} />
                ) : (
                  <div className="hidden md:block" />
                )}
                <div className="md:col-span-2 grid gap-3 xl:grid-cols-2">
                  {!isWalkInCustomer ? (
                    <FloatingField
                      label="Address (optional)"
                      rows={2}
                      value={customerAddress}
                      onChange={setCustomerAddress}
                      inputClassName="min-h-[54px]"
                    />
                  ) : (
                    <div className="hidden xl:block" />
                  )}
                  <FloatingField
                    label="Invoice Notes (optional)"
                    rows={2}
                    value={saleNotes}
                    onChange={setSaleNotes}
                    inputClassName="min-h-[54px]"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <SalesChoiceRow
                      title="Invoice Numbering"
                      titleTooltip={buildSalesTooltip(
                        'Invoice Numbering',
                        'Choose whether the system should generate the next running invoice number or staff should enter a specific number manually.',
                        'Example: use Auto Number for normal daily billing and Manual Number only for pre-printed or migrated invoice numbers.'
                      )}
                      options={invoiceNumberOptions}
                      selectedValue={invoiceNumberMode}
                      onSelect={(value) => setInvoiceNumberMode(value as 'auto' | 'manual')}
                    />
                  </div>
                </div>

                {invoiceNumberMode === 'manual' && (
                  <FloatingField
                    className="md:col-span-2"
                    label="Manual Invoice Number"
                    required
                    value={manualInvoiceNumber}
                    onChange={setManualInvoiceNumber}
                  />
                )}
              </div>
            </div>

            <div className="hidden rounded-xl border border-white/10 bg-white/5 p-4 xl:sticky xl:top-4">
              <SalesSectionHeader
                title="Bill Summary & Posting"
                tooltip={buildSalesTooltip(
                  'Totals and checkout controls',
                  'Review totals, discount, membership, credit, payment mode, and invoice behavior here before completing the sale.',
                  'Example: apply a discount, choose UPI, keep it as a cash invoice, post it now, and finish as a GST bill.'
                )}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.66fr)_minmax(420px,1.34fr)]">
                <div className="space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm text-gray-300">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                      <span>GST</span>
                      <span>{formatCurrency(gst)}</span>
                      <span>Gross Total</span>
                      <span>{formatCurrency(grossTotal)}</span>
                      <span>Discount Applied</span>
                      <span>- {formatCurrency(discountAmount)}</span>
                      <span>Store Credit Applied</span>
                      <span>- {formatCurrency(appliedStoreCredit)}</span>
                      {splitPaidAmount > 0 && (
                        <>
                          <span>Split Payments</span>
                          <span>{formatCurrency(splitPaidAmount)}</span>
                        </>
                      )}
                      {cashChangeDue > 0 && (
                        <>
                          <span>Cash Change Due</span>
                          <span>{formatCurrency(cashChangeDue)}</span>
                        </>
                      )}
                      <span>Net Total</span>
                      <span>{formatCurrency(netTotal)}</span>
                      <span>Round-off</span>
                      <span>{formatCurrency(roundOffAmount)}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-lg font-semibold text-white">
                      <span>Total</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm text-gray-300">
                      <span>{invoiceType === 'credit' ? 'Expected Outstanding' : splitPaidAmount > 0 ? 'Balance to Collect' : 'Collect Now'}</span>
                      <span>{formatCurrency(invoiceType === 'credit' ? outstandingAmount : Math.max(0, total - appliedStoreCredit - splitPaidAmount))}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-sm text-gray-300">Discount</span>
                      <SalesTooltipChip
                        title={buildSalesTooltip(
                          'Discount',
                          'Apply either a flat amount or a percentage discount to the current bill.',
                          'Example: choose Amount and enter 100 for a flat 100 discount, or choose % and enter 10 for a 10 percent discount.'
                        )}
                        ariaLabel="Discount help"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                      <FloatingField
                        className="min-w-0"
                        label="Mode"
                        value={discountType}
                        onChange={(value) => setDiscountType(value as 'amount' | 'percentage')}
                        options={[
                          { value: 'amount', label: 'Amount' },
                          { value: 'percentage', label: '%' },
                        ]}
                        inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                      />
                      <FloatingField
                        className="min-w-0"
                        label={discountType === 'percentage' ? 'Discount %' : 'Discount'}
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountValue}
                        onChange={setDiscountValue}
                        inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-sm text-gray-300">Membership</span>
                      <SalesTooltipChip
                        title={buildSalesTooltip(
                          'Membership benefits',
                          'Use this when the customer should receive member discount or point redemption based on the mobile number.',
                          'Example: enter the member phone number, type redeem points if needed, and click Apply.'
                        )}
                        ariaLabel="Membership help"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-end">
                      <FloatingField
                        className="min-w-0"
                        label="Redeem Points"
                        type="number"
                        min="0"
                        step="1"
                        value={membershipRedeemPoints}
                        onChange={setMembershipRedeemPoints}
                        inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                      />
                      <button
                        type="button"
                        onClick={applyMembershipBenefits}
                        disabled={applyingMembership || !hasValidCustomerPhone}
                        className="min-h-[44px] rounded-md bg-indigo-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {applyingMembership ? 'Applying...' : 'Apply'}
                      </button>
                    </div>
                  </div>

                  {membershipPreview && (
                    <div className="rounded border border-cyan-400/20 bg-cyan-500/10 px-2 py-2 text-xs text-cyan-100">
                      <div>{membershipPreview.memberName} ({membershipPreview.planName})</div>
                      <div>Saved: {formatCurrency(Number(membershipPreview.discountAmount || 0) + Number(membershipPreview.redeemValue || 0))}</div>
                      <div>Points after bill: {Number(membershipPreview.rewardPointsBalance || 0)}</div>
                    </div>
                  )}

                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300">Store Credit</span>
                        <SalesTooltipChip
                          title={buildSalesTooltip(
                            'Store credit',
                            'Apply a credit note or available store credit balance against this sale.',
                            'Example: choose a credit note and apply part or all of the available amount to reduce the bill.'
                          )}
                          ariaLabel="Store credit help"
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {loadingCustomerCredit
                          ? 'Checking...'
                          : customerCredit?.balance
                            ? `Available ${formatCurrency(Number(customerCredit.balance || 0))}`
                            : 'No credit balance'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_176px] sm:items-end">
                      <select
                        value={selectedCreditNoteId}
                        onChange={(e) => {
                          const noteId = e.target.value;
                          setSelectedCreditNoteId(noteId);
                          const note = (customerCredit?.notes || []).find((row) => row._id === noteId);
                          setCreditNoteAmount(note ? String(Number(note.balanceAmount || 0)) : '');
                        }}
                        className="min-w-0 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white sm:min-h-[44px]"
                      >
                        <option value="" className="bg-gray-900">Select store credit / credit note</option>
                        {(customerCredit?.notes || [])
                          .filter((row) => Number(row.balanceAmount || 0) > 0)
                          .map((row) => (
                            <option key={row._id} value={row._id} className="bg-gray-900">
                              {row.noteNumber} • {formatCurrency(Number(row.balanceAmount || 0))} • {row.reason || 'Credit'}
                            </option>
                          ))}
                      </select>
                      <FloatingField
                        className="min-w-0"
                        label="Apply Amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={creditNoteAmount}
                        onChange={setCreditNoteAmount}
                        inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <CompactOptionGroup
                    title="Payment Method"
                    titleTooltip={buildSalesTooltip(
                      'Payment Method',
                      'Choose how money is being collected for this bill right now.',
                      'Example: choose UPI for QR payment or Bank Transfer when the customer pays directly from their bank.'
                    )}
                    options={paymentMethodOptions}
                    selectedValue={paymentMethod}
                    onSelect={(value) => selectPrimaryPaymentMethod(value as typeof paymentMethod)}
                    columnsClassName="grid grid-cols-2 gap-2 2xl:grid-cols-4"
                  />

                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <SalesSectionHeader
                      title="Split Payments"
                      tooltip={buildSalesTooltip(
                        'Split payments',
                        'Split the amount across multiple payment methods and capture cash received to calculate change due.',
                        'Example: Cash 1000 and UPI 1274 for the same sale.'
                      )}
                      compact
                    />
                    <div className="space-y-3">
                      {paymentSplits.map((split, index) => {
                        const splitAmount = Math.max(0, Number(split.amount || 0));
                        const splitReceived = Math.max(0, Number(split.receivedAmount || split.amount || 0));
                        const splitChange = split.method === 'cash' && splitReceived > splitAmount
                          ? splitReceived - splitAmount
                          : 0;
                        return (
                          <div key={split.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="grid gap-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end">
                              <FloatingField
                                className="min-w-0"
                                label={`Method ${index + 1}`}
                                value={split.method}
                                onChange={(value) => setPaymentSplits((prev) => prev.map((row) => row.id === split.id ? { ...row, method: value as OfflinePaymentSplit['method'] } : row))}
                                options={splitPaymentMethodOptions}
                                inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                              />
                              <FloatingField
                                className="min-w-0"
                                label="Amount"
                                type="number"
                                min="0"
                                step="0.01"
                                value={split.amount}
                                onChange={(value) => setPaymentSplits((prev) => prev.map((row) => row.id === split.id ? { ...row, amount: value } : row))}
                                inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => setPaymentSplits((prev) => prev.length === 1 ? [createPaymentSplitRow(paymentMethod as OfflinePaymentSplit['method'])] : prev.filter((row) => row.id !== split.id))}
                                className="min-h-[44px] rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                              >
                                Remove
                              </button>
                            </div>
                            {split.method === 'cash' && (
                              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <FloatingField
                                  className="min-w-0"
                                  label="Cash Received"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={split.receivedAmount || ''}
                                  onChange={(value) => setPaymentSplits((prev) => prev.map((row) => row.id === split.id ? { ...row, receivedAmount: value } : row))}
                                  inputClassName="min-h-[44px] px-2 pb-1.5 pt-3 text-xs"
                                />
                                <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                                  Change Due: {formatCurrency(splitChange)}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentSplits((prev) => [...prev, createPaymentSplitRow('upi')])}
                          className="min-h-[44px] rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                        >
                          Add Split
                        </button>
                        <div className="text-right text-xs text-gray-400">
                          Applied via splits: <span className="font-semibold text-white">{formatCurrency(splitPaidAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <SalesSectionHeader
                      title="Invoice Settings"
                      tooltip={buildSalesTooltip(
                        'Invoice Settings',
                        'Use these choices to decide whether payment is collected now or later, whether the bill is posted now or saved as draft, and whether GST should apply.',
                        'Example: choose Paid Now, Finalise Invoice, and GST Bill for a normal counter sale.'
                      )}
                      compact
                    />
                    <div className="space-y-3">
                      <SalesChoiceRow
                        title="Invoice Type"
                        titleTooltip={buildSalesTooltip(
                          'Invoice Type',
                          'Choose whether this sale is settled now or should remain outstanding as receivable.',
                          'Example: choose Paid Now for immediate payment and Pay Later when money will come later.'
                        )}
                        options={invoiceTypeOptions}
                        selectedValue={invoiceType}
                        onSelect={(value) => {
                          setInvoiceType(value as 'cash' | 'credit');
                          if (value === 'cash') setPaidAmount('');
                        }}
                        accentClassByValue={{
                          cash: 'border-emerald-400/40 bg-emerald-500/85 text-white',
                          credit: 'border-amber-400/40 bg-amber-500/85 text-white',
                        }}
                      />

                      <SalesChoiceRow
                        title="Save Mode"
                        titleTooltip={buildSalesTooltip(
                          'Invoice Save',
                          'Choose whether the invoice should be finalized immediately or kept as a draft.',
                          'Example: use Finalise Invoice for normal checkout and Save as Draft when staff still needs approval.'
                        )}
                        options={invoiceStatusOptions}
                        selectedValue={invoiceStatus}
                        onSelect={(value) => setInvoiceStatus(value as 'posted' | 'draft')}
                        accentClassByValue={{
                          posted: 'border-indigo-400/40 bg-indigo-500/85 text-white',
                          draft: 'border-slate-300/20 bg-slate-500/80 text-white',
                        }}
                      />

                      <SalesChoiceRow
                        title="Tax Mode"
                        titleTooltip={buildSalesTooltip(
                          'Tax Bill',
                          'Choose whether this invoice should be saved with GST billing or without GST.',
                          'Example: use GST Bill for normal taxable sales and Non-GST Bill only when the transaction should not carry GST.'
                        )}
                        options={taxBillOptions}
                        selectedValue={isGstBill ? 'gst' : 'non_gst'}
                        onSelect={(value) => setIsGstBill(value === 'gst')}
                        accentClassByValue={{
                          gst: 'border-cyan-400/40 bg-cyan-500/85 text-white',
                          non_gst: 'border-amber-400/40 bg-amber-500/85 text-white',
                        }}
                      />
                    </div>
                  </div>

                  {invoiceType === 'credit' && (
                    <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                      <SalesSectionHeader
                        title="Credit Settlement"
                        tooltip={buildSalesTooltip(
                          'Credit settlement',
                          'When the invoice type is Credit, you can still record any partial payment collected now and keep the remaining balance outstanding.',
                          'Example: for a 10000 invoice, collect 3000 now and keep 7000 as receivable.'
                        )}
                        compact
                      />
                      <FloatingField
                        className="mb-2"
                        label="Paid Amount (optional)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={paidAmount}
                        onChange={setPaidAmount}
                      />
                      <div className="rounded border border-amber-400/25 bg-black/10 px-3 py-2 text-sm text-amber-100">
                        Outstanding: <span className="font-semibold">{formatCurrency(outstandingAmount)}</span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-white/10 bg-black/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Round-off Mode</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {roundOffModeOptions.find((option) => option.value === roundOffMode)?.label || 'Never round off'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOfflineTools(true)}
                        className="min-h-[44px] rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                      >
                        Change
                      </button>
                      <SalesTooltipChip
                        title={buildSalesTooltip(
                          'Round-off',
                          'Round-off is now controlled from Store Tools so the billing screen stays cleaner.',
                          'Example: set nearest 1 rupee to round 999.62 to 1000.'
                        )}
                        ariaLabel="Round-off help"
                      />
                    </div>
                  </div>

                  {checkoutWarningMessage && (
                    <p className="rounded border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {checkoutWarningMessage}
                    </p>
                  )}

                  <div className="sticky bottom-3 z-10 grid gap-3 rounded-xl border border-white/10 bg-gray-950/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:grid-cols-[160px_minmax(0,1fr)]">
                    <button
                      type="button"
                      onClick={() => void handleHoldSale()}
                      disabled={cart.length === 0 || processing}
                      className="min-h-[48px] rounded-md border border-amber-400/25 bg-amber-500/10 px-4 py-2.5 font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Hold
                    </button>
                    <button
                      id="sales-checkout-btn"
                      className="min-h-[52px] w-full rounded-md bg-emerald-500 px-4 py-2.5 font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={cart.length === 0 || processing}
                      onClick={handleCheckout}
                    >
                      {primaryCheckoutLabel}
                    </button>
                  </div>

                  {checkoutMessage && (
                    <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                      {checkoutMessage}
                    </p>
                  )}

                  {settings.printing.showPrintPreviewHint && (
                    <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                      <span>Print profile: {settings.printing.profile}</span>
                      <SalesTooltipChip
                        title={buildSalesTooltip(
                          'Print profile',
                          'This shows which invoice print layout is currently active. You can change print size and behavior from Settings.',
                          'Example: profile A4 uses the full-page format, while other profiles may use smaller counter-print layouts.'
                        )}
                        ariaLabel="Print profile help"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeSalesDialog === 'discount' && (
        <SalesDialog
          title="Discount"
          description="Apply a flat amount or percentage discount without crowding the main checkout rail. Press Enter to save and close, or Esc to cancel."
          onClose={() => setActiveSalesDialog(null)}
          onSubmit={() => setActiveSalesDialog(null)}
          submitLabel="Save Discount"
        >
          {discountDialogContent}
        </SalesDialog>
      )}

      {activeSalesDialog === 'membership' && (
        <SalesDialog
          title="Points & Membership"
          description="Review member benefits, redeem points, and confirm the savings for this invoice."
          onClose={() => setActiveSalesDialog(null)}
        >
          {membershipDialogContent}
        </SalesDialog>
      )}

      {activeSalesDialog === 'store_credit' && (
        <SalesDialog
          title="Store Credit"
          description="Select the customer credit note, choose the amount to apply, and see how it changes the amount to collect."
          onClose={() => setActiveSalesDialog(null)}
        >
          {storeCreditDialogContent}
        </SalesDialog>
      )}

      {activeSalesDialog === 'payment' && (
        <SalesDialog
          title="Payment Method"
          description="Capture the payment mode, split collections, cash received, and any change due in one focused popup."
          onClose={() => setActiveSalesDialog(null)}
          maxWidthClassName="max-w-4xl"
        >
          {paymentDialogContent}
        </SalesDialog>
      )}

      {activeSalesDialog === 'invoice_settings' && (
        <SalesDialog
          title="Invoice Settings"
          description="Manage invoice type, save mode, tax mode, notes, numbering, round-off, and advanced billing fields here."
          onClose={() => setActiveSalesDialog(null)}
          maxWidthClassName="max-w-5xl"
        >
          {invoiceSettingsDialogContent}
        </SalesDialog>
      )}

      {showResumePrompt && resumeSnapshot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-gray-950 p-6 shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Resume Last Sale</p>
            <h3 className="mt-2 text-xl font-semibold text-white">An unfinished sale was restored locally</h3>
            <p className="mt-2 text-sm text-gray-300">
              {resumeSnapshot.cart.length} item{resumeSnapshot.cart.length === 1 ? '' : 's'} were found from the last session.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  await clearOfflineSalesSnapshot();
                  setResumeSnapshot(null);
                  setShowResumePrompt(false);
                }}
                className="min-h-[44px] rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => {
                  applyOfflineSnapshot(resumeSnapshot);
                  setShowResumePrompt(false);
                }}
                className="min-h-[44px] rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Resume Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {showOfflineTools && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-gray-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Store Tools</p>
                <h3 className="mt-1 text-xl font-semibold text-white">Recall, sync, and offline controls</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOfflineTools(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20"
                aria-label="Close store tools"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]">
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Recall Queue</div>
                      <p className="mt-1 text-xs text-gray-400">
                        Resume held sales, reopen draft invoices, or delete old local entries that are no longer needed.
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/10 px-3 py-1 text-[11px] font-semibold text-gray-300">
                      {recallCount} saved sale{recallCount === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Held Sales</div>
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
                          {heldSales.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {heldSales.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-gray-400">
                            No held sales are waiting in local storage.
                          </p>
                        ) : (
                          heldSales.map((record) => {
                            const heldUnits = record.snapshot.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                            const heldCustomer = record.snapshot.customerName
                              || record.snapshot.customerPhone
                              || (record.snapshot.isWalkInCustomer ? 'Walk-in customer' : 'Customer not selected');

                            return (
                              <div key={record.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-white">{record.label}</div>
                                    <div className="mt-1 text-xs text-gray-400">{heldCustomer}</div>
                                  </div>
                                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-200">
                                    Hold
                                  </span>
                                </div>
                                <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px] text-gray-400">
                                  <span>Items</span>
                                  <span className="text-white">{heldUnits}</span>
                                  <span>Saved</span>
                                  <span className="text-white">{new Date(record.updatedAt).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleLoadSavedSale(record)}
                                    className="min-h-[40px] rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400"
                                  >
                                    Resume
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteSavedSale(record)}
                                    className="min-h-[40px] rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Local Drafts</div>
                        <span className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-100">
                          {draftSales.length}
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {draftSales.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-gray-400">
                            No local drafts are waiting to be reopened.
                          </p>
                        ) : (
                          draftSales.map((record) => {
                            const draftUnits = record.snapshot.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                            const draftCustomer = record.snapshot.customerName
                              || record.snapshot.customerPhone
                              || (record.snapshot.isWalkInCustomer ? 'Walk-in customer' : 'Customer not selected');

                            return (
                              <div key={record.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-white">
                                      {record.localInvoiceNumber || record.label}
                                    </div>
                                    <div className="mt-1 text-xs text-gray-400">{draftCustomer}</div>
                                  </div>
                                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                    record.pendingSync ? 'bg-amber-500/15 text-amber-100' : 'bg-white/10 text-gray-200'
                                  }`}>
                                    {record.pendingSync ? 'Pending Sync' : 'Draft'}
                                  </span>
                                </div>
                                <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px] text-gray-400">
                                  <span>Items</span>
                                  <span className="text-white">{draftUnits}</span>
                                  <span>Saved</span>
                                  <span className="text-white">{new Date(record.updatedAt).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleLoadSavedSale(record)}
                                    className="min-h-[40px] rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-400"
                                  >
                                    Load Draft
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDeleteSavedSale(record)}
                                    className="min-h-[40px] rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-sm font-semibold text-white">Round-off Mode</div>
                  <div className="space-y-2">
                    {roundOffModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setRoundOffMode(option.value)}
                        className={`flex min-h-[44px] w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                          roundOffMode === option.value
                            ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100'
                            : 'border-white/10 bg-black/10 text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <span>{option.label}</span>
                        {roundOffMode === option.value ? <span className="text-[11px] font-semibold">Active</span> : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">Sync & Recovery</div>
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      onClick={() => void syncQueuedSales(true)}
                      disabled={syncingQueue}
                      className="min-h-[44px] rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {syncingQueue ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <ActionIconButton
                      kind="refresh"
                      onClick={() => void fetchProducts(true)}
                      disabled={refreshingCatalog}
                      title={refreshingCatalog ? 'Refreshing Catalog...' : 'Refresh Local Catalog'}
                    />
                    <button
                      type="button"
                      onClick={() => void restoreLatestBackup()}
                      className="min-h-[44px] rounded-md border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20"
                    >
                      Recover Last Backup
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleQuickPrint()}
                      className="min-h-[44px] rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                    >
                      Print Last Completed Invoice
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2">
                    <span>Queued for sync</span>
                    <span className="font-semibold text-white">{queuedSalesCount}</span>
                    <span>Held sales</span>
                    <span className="font-semibold text-white">{heldSales.length}</span>
                    <span>Local drafts</span>
                    <span className="font-semibold text-white">{draftSales.length}</span>
                    <span>Catalog updated</span>
                    <span className="font-semibold text-white">{catalogUpdatedAt ? new Date(catalogUpdatedAt).toLocaleString('en-IN') : 'Not yet'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-xl border border-white/15 bg-gray-950/95 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Quick Product Add</h3>
                <p className="text-xs text-gray-400">Type product name/SKU, then tap item or press Enter.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddModal(false)}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                Close
              </button>
            </div>

            <input
              ref={quickSearchInputRef}
              type="text"
              value={quickSearchTerm}
              onChange={(e) => setQuickSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setShowQuickAddModal(false);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  const maxIndex = Math.max(0, quickSearchResults.length - 1);
                  setQuickActiveIndex((prev) => Math.min(maxIndex, prev + 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setQuickActiveIndex((prev) => Math.max(0, prev - 1));
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const selected = quickSearchResults[quickActiveIndex];
                  if (selected) addProductFromQuickSearch(selected);
                }
              }}
              placeholder="Start typing product name / SKU..."
              className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-cyan-400"
            />

            <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {quickSearchLoading && (
                <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">Searching products...</p>
              )}
              {!quickSearchLoading && quickSearchResults.length === 0 && (
                <p className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">No matching product found.</p>
              )}
              {!quickSearchLoading && quickSearchResults.map((product, index) => (
                <button
                  key={product._id}
                  type="button"
                  onClick={() => addProductFromQuickSearch(product)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    index === quickActiveIndex
                      ? 'border-cyan-400/60 bg-cyan-500/15'
                      : 'border-white/10 bg-black/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-indigo-300">{formatCurrency(product.price)}</p>
                      <p className="text-[11px] text-gray-400">{requiresStockTracking(product) ? `Stock: ${product.stock}` : itemTypeLabel(product)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {addFeedbackText && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 shadow-lg lg:hidden">
          {addFeedbackText}
        </div>
      )}

      {showInvoicePrompt && completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-gray-900 p-6">
            <h3 className="text-xl font-semibold text-white">Sale Completed</h3>
            <p className="mt-2 text-sm text-gray-300">
              Invoice <span className="font-semibold text-white">{completedSale.invoiceNumber || completedSale.saleNumber}</span> is ready.
            </p>
            <p className="mt-1 text-sm text-gray-300">
              Total: <span className="font-semibold text-white">{formatCurrency(completedSale.totalAmount)}</span>
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Printing uses system dialog and supports all installed printers (A4/Thermal/Network).
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
                onClick={() => setShowInvoicePrompt(false)}
              >
                Skip for Now
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                onClick={() => doPrintInvoice(completedSale)}
              >
                Print Invoice
              </button>
            </div>
          </div>
        </div>
      )}
      <CodeScannerSettingsDialog
        open={showScannerSettings}
        settings={scannerSettings}
        onClose={() => setShowScannerSettings(false)}
        onSave={(nextSettings) => {
          const saved = saveCodeScannerSettings(nextSettings);
          setScannerSettings(saved);
          setShowScannerSettings(false);
          if (enableProductScanner) focusScannerInput();
        }}
      />
    </>
  );
};
