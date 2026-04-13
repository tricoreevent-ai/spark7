import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../config';
import { Product } from '../hooks/useProducts';
import { apiUrl, fetchApiJson } from '../utils/api';

type FastMovingProduct = {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  salesAmount: number;
  salesCount: number;
};

type DayWindowPoint = {
  key: string;
  label: string;
  shortDate: string;
};

type InventoryMovementPoint = DayWindowPoint & {
  stockIn: number;
  stockOut: number;
  adjustments: number;
  transfers: number;
};

type BarChartItem = {
  id: string;
  label: string;
  subtitle: string;
  value: number;
  valueLabel: string;
  helperLabel?: string;
  barClassName: string;
};

type StackedBarItem = {
  id: string;
  label: string;
  subtitle: string;
  current: number;
  gap: number;
  currentLabel: string;
  targetLabel: string;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
  description: string;
};

type RemoteState<T> = {
  data: T;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string;
};

const toNumber = (value: unknown): number => Number(value || 0);

const isInventoryItem = (product: Product): boolean => (product.itemType || 'inventory') === 'inventory';

const formatQuantity = (value: number): string =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(value || 0));

const toDateKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDayWindow = (days: number): DayWindowPoint[] =>
  Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - 1 - index));
    return {
      key: toDateKey(date),
      label: index % 5 === 0 || index === days - 1
        ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : '',
      shortDate: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    };
  });

const buildEmptyMovementSeries = (days: DayWindowPoint[]): InventoryMovementPoint[] =>
  days.map((day) => ({
    ...day,
    stockIn: 0,
    stockOut: 0,
    adjustments: 0,
    transfers: 0,
  }));

const palette = ['#38bdf8', '#34d399', '#f59e0b', '#f472b6', '#a78bfa', '#f87171'];

const loadFastMovingProducts = async (token: string): Promise<FastMovingProduct[]> => {
  const response = await fetchApiJson(apiUrl('/api/reports/inventory-fast-moving?days=30&limit=6'), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const rows = Array.isArray(response?.data) ? response.data : [];
  return rows.map((row: any) => ({
    productId: String(row?.productId || row?._id || ''),
    productName: String(row?.productName || 'Unnamed product'),
    sku: String(row?.sku || ''),
    quantitySold: toNumber(row?.quantitySold),
    salesAmount: toNumber(row?.salesAmount),
    salesCount: toNumber(row?.salesCount),
  }));
};

const loadInventoryMovement = async (token: string, days: DayWindowPoint[]): Promise<InventoryMovementPoint[]> => {
  const startDate = days[0]?.key || toDateKey(new Date());
  const endDate = days[days.length - 1]?.key || startDate;
  const buckets = new Map<string, InventoryMovementPoint>(
    buildEmptyMovementSeries(days).map((day) => [day.key, day])
  );

  const pageSize = 1000;
  const maxTotal = 10_000;
  let skip = 0;
  let total: number | null = null;

  while (skip < maxTotal) {
    const response = await fetchApiJson(
      apiUrl(`/api/reports/inventory-movement?startDate=${startDate}&endDate=${endDate}&skip=${skip}&limit=${pageSize}`),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const rows = Array.isArray(response?.data) ? response.data : [];
    const nextTotal = Number(response?.pagination?.total);
    if (!Number.isNaN(nextTotal) && nextTotal >= 0) {
      total = nextTotal;
    }

    rows.forEach((row: any) => {
      const createdAt = row?.createdAt ? new Date(row.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return;

      const key = toDateKey(createdAt);
      const bucket = buckets.get(key);
      if (!bucket) return;

      const action = String(row?.action || '');
      const nestedAction = String(row?.metadata?.action || '').trim().toLowerCase();
      const quantityDelta = Math.abs(toNumber(row?.metadata?.quantityDelta));
      const quantityInput = Math.abs(toNumber(row?.metadata?.quantityInput));

      if (action === 'purchase_stock_received') {
        bucket.stockIn += Math.abs(toNumber(row?.metadata?.receivedQuantity));
        return;
      }

      if (action === 'purchase_stock_returned') {
        bucket.stockOut += Math.abs(toNumber(row?.metadata?.returnQuantity));
        return;
      }

      if (action === 'stock_transfer') {
        bucket.transfers += Math.abs(toNumber(row?.metadata?.quantity));
        return;
      }

      if (action !== 'stock_adjustment') return;

      if (nestedAction === 'add' || nestedAction === 'stock_in') {
        bucket.stockIn += quantityDelta || quantityInput;
        return;
      }

      if (nestedAction === 'subtract' || nestedAction === 'stock_out') {
        bucket.stockOut += quantityDelta || quantityInput;
        return;
      }

      bucket.adjustments += quantityDelta || quantityInput;
    });

    skip += rows.length;
    if (rows.length === 0) break;
    if (total !== null && skip >= total) break;
  }

  return days.map((day) => buckets.get(day.key) || {
    ...day,
    stockIn: 0,
    stockOut: 0,
    adjustments: 0,
    transfers: 0,
  });
};

const ChartEmpty: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-400">
    {message}
  </div>
);

const ChartError: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
    {message}
  </div>
);

const HorizontalBarList: React.FC<{ items: BarChartItem[]; emptyMessage: string }> = ({ items, emptyMessage }) => {
  const maxValue = Math.max(1, ...items.map((item) => item.value));

  if (items.length === 0) {
    return <ChartEmpty message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const width = Math.max(8, Math.round((item.value / maxValue) * 100));
        return (
          <div key={item.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.label}</p>
                <p className="truncate text-xs text-slate-400">{item.subtitle}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-white">{item.valueLabel}</p>
                {item.helperLabel ? <p className="text-xs text-slate-500">{item.helperLabel}</p> : null}
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/8">
              <div className={`h-full rounded-full ${item.barClassName}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const StackedBarList: React.FC<{ items: StackedBarItem[]; emptyMessage: string }> = ({ items, emptyMessage }) => {
  if (items.length === 0) {
    return <ChartEmpty message={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const total = Math.max(1, item.current + item.gap);
        const currentWidth = Math.round((item.current / total) * 100);
        const gapWidth = Math.max(0, 100 - currentWidth);

        return (
          <div key={item.id} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{item.label}</p>
                <p className="truncate text-xs text-slate-400">{item.subtitle}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-white">{item.currentLabel}</p>
                <p className="text-xs text-slate-500">{item.targetLabel}</p>
              </div>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full bg-gradient-to-r from-amber-300 via-amber-400 to-orange-500"
                style={{ width: `${currentWidth}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-rose-500/60 to-rose-400/85"
                style={{ width: `${gapWidth}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const buildLinePath = (
  values: number[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  peak: number
): string => {
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  return values.map((value, index) => {
    const x = padding.left + (index * innerWidth) / Math.max(1, values.length - 1);
    const y = padding.top + innerHeight - ((value / peak) * innerHeight);
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
};

const MovementTrendChart: React.FC<{ points: InventoryMovementPoint[] }> = ({ points }) => {
  const width = 760;
  const height = 240;
  const padding = { top: 20, right: 20, bottom: 30, left: 20 };
  const allValues = points.flatMap((point) => [point.stockIn, point.stockOut]);
  const peak = Math.max(1, ...allValues);
  const hasMovement = allValues.some((value) => value > 0);
  const stockInPath = buildLinePath(points.map((point) => point.stockIn), width, height, padding, peak);
  const stockOutPath = buildLinePath(points.map((point) => point.stockOut), width, height, padding, peak);
  const labelPoints = points.filter((point, index) => point.label || index === 0 || index === points.length - 1);

  if (!hasMovement) {
    return <ChartEmpty message="No stock movement was recorded in the current 30-day window." />;
  }

  return (
    <div>
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/35 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[240px] w-full" role="img" aria-label="30 day inventory movement">
          {[0.25, 0.5, 0.75, 1].map((step) => {
            const y = padding.top + (height - padding.top - padding.bottom) * (1 - step);
            const value = Math.round(peak * step);
            return (
              <g key={step}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 8" />
                <text x={width - padding.right} y={y - 6} fill="rgba(148,163,184,0.72)" fontSize="11" textAnchor="end">
                  {formatQuantity(value)}
                </text>
              </g>
            );
          })}
          <path d={stockInPath} fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={stockOutPath} fill="none" stroke="#fb7185" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => {
            const innerWidth = width - padding.left - padding.right;
            const innerHeight = height - padding.top - padding.bottom;
            const x = padding.left + (index * innerWidth) / Math.max(1, points.length - 1);
            const stockInY = padding.top + innerHeight - ((point.stockIn / peak) * innerHeight);
            const stockOutY = padding.top + innerHeight - ((point.stockOut / peak) * innerHeight);
            return (
              <g key={point.key}>
                <circle cx={x} cy={stockInY} r="3.5" fill="#34d399" />
                <circle cx={x} cy={stockOutY} r="3.5" fill="#fb7185" />
              </g>
            );
          })}
          {labelPoints.map((point) => {
            const index = points.findIndex((entry) => entry.key === point.key);
            const x = padding.left + (index * (width - padding.left - padding.right)) / Math.max(1, points.length - 1);
            return (
              <text key={point.key} x={x} y={height - 6} fill="rgba(148,163,184,0.78)" fontSize="11" textAnchor="middle">
                {point.shortDate}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-300">
        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">Stock in line</span>
        <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-rose-100">Stock out line</span>
      </div>
    </div>
  );
};

const DonutBreakdownChart: React.FC<{ segments: DonutSegment[]; totalValue: number }> = ({ segments, totalValue }) => {
  if (segments.length === 0 || totalValue <= 0) {
    return <ChartEmpty message="Inventory value will appear here once stock and cost values are available." />;
  }

  const size = 196;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
      <div className="mx-auto">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-[196px] w-[196px]" role="img" aria-label="Inventory value by category">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          {segments.map((segment) => {
            const length = circumference * (segment.value / totalValue);
            const circle = (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += length;
            return circle;
          })}
          <text x="50%" y="48%" textAnchor="middle" fill="#f8fafc" fontSize="16" fontWeight="700">
            {formatCurrency(totalValue)}
          </text>
          <text x="50%" y="60%" textAnchor="middle" fill="rgba(148,163,184,0.82)" fontSize="12">
            Cost value
          </text>
        </svg>
      </div>
      <div className="space-y-3">
        {segments.map((segment) => {
          const percent = totalValue > 0 ? (segment.value / totalValue) * 100 : 0;
          return (
            <div key={segment.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                    <p className="truncate text-sm font-semibold text-white">{segment.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{segment.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-white">{formatCurrency(segment.value)}</p>
                  <p className="text-xs text-slate-500">{percent.toFixed(1)}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ProductCenterInsights: React.FC<{ products: Product[] }> = ({ products }) => {
  const dayWindow = useMemo(() => buildDayWindow(30), []);
  const emptyMovementSeries = useMemo(() => buildEmptyMovementSeries(dayWindow), [dayWindow]);
  const [fastMovingState, setFastMovingState] = useState<RemoteState<FastMovingProduct[]>>({
    data: [],
    status: 'idle',
    error: '',
  });
  const [movementState, setMovementState] = useState<RemoteState<InventoryMovementPoint[]>>({
    data: emptyMovementSeries,
    status: 'idle',
    error: '',
  });

  const inventoryItems = useMemo(
    () => products.filter(isInventoryItem),
    [products]
  );

  const stockOnHandItems = useMemo<BarChartItem[]>(
    () => inventoryItems
      .filter((product) => toNumber(product.stock) > 0)
      .sort((left, right) => toNumber(right.stock) - toNumber(left.stock))
      .slice(0, 6)
      .map((product, index) => ({
        id: product._id,
        label: product.name,
        subtitle: `${product.category || 'Uncategorized'}${product.sku ? ` | ${product.sku}` : ''}`,
        value: toNumber(product.stock),
        valueLabel: `${formatQuantity(toNumber(product.stock))} ${product.unit || 'pcs'}`,
        helperLabel: `Min ${formatQuantity(toNumber(product.minStock))}`,
        barClassName: index === 0
          ? 'bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-500'
          : 'bg-gradient-to-r from-sky-400/80 via-cyan-400/85 to-blue-500/80',
      })),
    [inventoryItems]
  );

  const lowStockPressureItems = useMemo<StackedBarItem[]>(
    () => inventoryItems
      .filter((product) => toNumber(product.minStock) > 0 && toNumber(product.stock) <= toNumber(product.minStock))
      .sort((left, right) => {
        const leftRatio = toNumber(left.stock) / Math.max(1, toNumber(left.minStock));
        const rightRatio = toNumber(right.stock) / Math.max(1, toNumber(right.minStock));
        return leftRatio - rightRatio || String(left.name || '').localeCompare(String(right.name || ''));
      })
      .slice(0, 6)
      .map((product) => {
        const current = Math.max(0, toNumber(product.stock));
        const minimum = Math.max(0, toNumber(product.minStock));
        return {
          id: product._id,
          label: product.name,
          subtitle: `${product.category || 'Uncategorized'}${product.sku ? ` | ${product.sku}` : ''}`,
          current,
          gap: Math.max(0, minimum - current),
          currentLabel: `${formatQuantity(current)} ${product.unit || 'pcs'}`,
          targetLabel: `Target ${formatQuantity(minimum)}`,
        };
      }),
    [inventoryItems]
  );

  const categoryBreakdown = useMemo(() => {
    const values = inventoryItems.reduce<Map<string, number>>((acc, product) => {
      const category = String(product.category || 'Uncategorized').trim() || 'Uncategorized';
      const next = toNumber(product.stock) * toNumber(product.cost);
      acc.set(category, (acc.get(category) || 0) + next);
      return acc;
    }, new Map<string, number>());

    const rows = Array.from(values.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value);

    const topRows = rows.slice(0, 5);
    const otherValue = rows.slice(5).reduce((sum, row) => sum + row.value, 0);
    const segments = topRows.map((row, index) => ({
      label: row.label,
      value: row.value,
      color: palette[index % palette.length],
      description: 'Live inventory value based on current stock and unit cost.',
    }));

    if (otherValue > 0) {
      segments.push({
        label: 'Other categories',
        value: otherValue,
        color: palette[segments.length % palette.length],
        description: 'Combined value for the remaining categories in the catalog.',
      });
    }

    return {
      totalValue: rows.reduce((sum, row) => sum + row.value, 0),
      segments,
    };
  }, [inventoryItems]);

  const fastMovingItems = useMemo<BarChartItem[]>(
    () => fastMovingState.data.map((row, index) => ({
      id: row.productId || `${row.productName}-${index}`,
      label: row.productName,
      subtitle: row.sku ? `SKU ${row.sku}` : 'Sales-backed fast mover',
      value: row.quantitySold,
      valueLabel: `${formatQuantity(row.quantitySold)} sold`,
      helperLabel: formatCurrency(row.salesAmount),
      barClassName: index === 0
        ? 'bg-gradient-to-r from-emerald-300 via-emerald-400 to-cyan-500'
        : 'bg-gradient-to-r from-emerald-400/80 via-teal-400/85 to-cyan-500/80',
    })),
    [fastMovingState.data]
  );

  const movementSummary = useMemo(
    () => movementState.data.reduce(
      (acc, point) => ({
        stockIn: acc.stockIn + point.stockIn,
        stockOut: acc.stockOut + point.stockOut,
        adjustments: acc.adjustments + point.adjustments,
        transfers: acc.transfers + point.transfers,
      }),
      { stockIn: 0, stockOut: 0, adjustments: 0, transfers: 0 }
    ),
    [movementState.data]
  );

  useEffect(() => {
    let ignore = false;
    const token = localStorage.getItem('token');

    if (!token) {
      setFastMovingState({ data: [], status: 'error', error: 'Sign in to load fast-moving product data.' });
      setMovementState({ data: emptyMovementSeries, status: 'error', error: 'Sign in to load 30-day stock movement.' });
      return undefined;
    }

    setFastMovingState((current) => ({ ...current, status: 'loading', error: '' }));
    setMovementState((current) => ({ ...current, status: 'loading', error: '' }));

    const loadInsights = async () => {
      const [fastMovingResult, movementResult] = await Promise.allSettled([
        loadFastMovingProducts(token),
        loadInventoryMovement(token, dayWindow),
      ]);

      if (ignore) return;

      if (fastMovingResult.status === 'fulfilled') {
        setFastMovingState({
          data: fastMovingResult.value,
          status: 'ready',
          error: '',
        });
      } else {
        setFastMovingState({
          data: [],
          status: 'error',
          error: fastMovingResult.reason instanceof Error ? fastMovingResult.reason.message : 'Failed to load fast-moving products.',
        });
      }

      if (movementResult.status === 'fulfilled') {
        setMovementState({
          data: movementResult.value,
          status: 'ready',
          error: '',
        });
      } else {
        setMovementState({
          data: emptyMovementSeries,
          status: 'error',
          error: movementResult.reason instanceof Error ? movementResult.reason.message : 'Failed to load stock movement history.',
        });
      }
    };

    void loadInsights();

    return () => {
      ignore = true;
    };
  }, [dayWindow, emptyMovementSeries]);

  return (
    <section className="mb-8 overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9))] p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Product Graphs</p>
          <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Visual stock and product insights</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            These charts turn the live catalog into a quick control view for stock on hand, category value, fast movers, and 30-day stock movement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/products/catalog" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
            Open Catalog
          </Link>
          <Link to="/inventory" className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20">
            Inventory Workspace
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-5 xl:col-span-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Line Graph</p>
              <h3 className="mt-2 text-xl font-semibold text-white">30-day stock movement history</h3>
              <p className="mt-2 text-sm text-slate-400">
                Follow how much stock came in versus moved out across the last 30 days.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">
                In {formatQuantity(movementSummary.stockIn)}
              </span>
              <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-rose-100">
                Out {formatQuantity(movementSummary.stockOut)}
              </span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-amber-100">
                Adjustments {formatQuantity(movementSummary.adjustments)}
              </span>
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-sky-100">
                Transfers {formatQuantity(movementSummary.transfers)}
              </span>
            </div>
          </div>
          <div className="mt-5">
            {movementState.status === 'loading' ? (
              <ChartEmpty message="Loading stock movement history..." />
            ) : (
              <MovementTrendChart points={movementState.data} />
            )}
          </div>
          {movementState.status === 'error' ? <div className="mt-4"><ChartError message={movementState.error} /></div> : null}
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Donut Chart</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Inventory value by category</h3>
              <p className="mt-2 text-sm text-slate-400">
                High-level category mix based on current stock value at cost.
              </p>
            </div>
            <Link to="/categories" className="text-sm font-semibold text-fuchsia-200 hover:text-fuchsia-100">
              Categories
            </Link>
          </div>
          <div className="mt-5">
            <DonutBreakdownChart segments={categoryBreakdown.segments} totalValue={categoryBreakdown.totalValue} />
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Bar Chart</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Current stock on hand</h3>
              <p className="mt-2 text-sm text-slate-400">
                The highest-stock inventory items in the live catalog right now.
              </p>
            </div>
            <Link to="/products/catalog" className="text-sm font-semibold text-sky-200 hover:text-sky-100">
              Product list
            </Link>
          </div>
          <div className="mt-5">
            <HorizontalBarList
              items={stockOnHandItems}
              emptyMessage="No stocked inventory items are available yet."
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Bar Chart</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Top-selling products</h3>
              <p className="mt-2 text-sm text-slate-400">
                Fast-moving products ranked from the last 30 days of sales activity.
              </p>
            </div>
            <Link to="/reports" className="text-sm font-semibold text-emerald-200 hover:text-emerald-100">
              Reports
            </Link>
          </div>
          <div className="mt-5">
            {fastMovingState.status === 'loading' ? (
              <ChartEmpty message="Loading fast-moving products..." />
            ) : (
              <HorizontalBarList
                items={fastMovingItems}
                emptyMessage="No sales-backed fast-moving products were found in the current 30-day window."
              />
            )}
          </div>
          {fastMovingState.status === 'error' ? <div className="mt-4"><ChartError message={fastMovingState.error} /></div> : null}
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-5 xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Stacked Bar</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Low-stock pressure against minimum levels</h3>
              <p className="mt-2 text-sm text-slate-400">
                Compare current quantity versus the gap remaining to reach minimum stock.
              </p>
            </div>
            <Link to="/products/alerts" className="text-sm font-semibold text-amber-200 hover:text-amber-100">
              Stock alerts
            </Link>
          </div>
          <div className="mt-5">
            <StackedBarList
              items={lowStockPressureItems}
              emptyMessage="All tracked inventory items are currently above their minimum stock level."
            />
          </div>
        </section>
      </div>
    </section>
  );
};
