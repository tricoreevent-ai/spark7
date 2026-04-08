import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PermissionMatrix } from '@shared/rbac';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';

interface SalesDashboardProps {
  permissions: PermissionMatrix;
}

type SalesTrendPoint = {
  key: string;
  label: string;
  shortDate: string;
  total: number;
};

type ProductAlertCard = {
  _id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  minStock: number;
  reorderQuantity: number;
  autoReorder: boolean;
  imageUrl?: string;
  itemType?: string;
};

const toDateKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildSalesDays = (): Array<{ key: string; date: Date; label: string; shortDate: string }> =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      key: toDateKey(date),
      date,
      label: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      shortDate: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    };
  });

const getProductInitials = (name: string): string =>
  String(name || 'P')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'P';

const getAlertMeta = (product: ProductAlertCard) => {
  if (Number(product.stock || 0) <= 0) {
    return {
      label: 'Out of stock',
      accent: 'border-rose-400/30 bg-rose-500/15 text-rose-100',
      ring: 'from-rose-500/30 via-rose-500/5 to-transparent',
      priority: 0,
    };
  }

  if (product.autoReorder && Number(product.stock || 0) <= Number(product.minStock || 0)) {
    return {
      label: 'Reorder now',
      accent: 'border-cyan-400/30 bg-cyan-500/15 text-cyan-100',
      ring: 'from-cyan-500/30 via-cyan-500/5 to-transparent',
      priority: 1,
    };
  }

  return {
    label: 'Low stock',
    accent: 'border-amber-400/30 bg-amber-500/15 text-amber-100',
    ring: 'from-amber-500/30 via-amber-500/5 to-transparent',
    priority: 2,
  };
};

const sortAlertCards = (left: ProductAlertCard, right: ProductAlertCard): number => {
  const leftMeta = getAlertMeta(left);
  const rightMeta = getAlertMeta(right);
  const leftGap = Number(left.stock || 0) - Number(left.minStock || 0);
  const rightGap = Number(right.stock || 0) - Number(right.minStock || 0);

  return leftMeta.priority - rightMeta.priority
    || leftGap - rightGap
    || String(left.name || '').localeCompare(String(right.name || ''));
};

export const SalesDashboard: React.FC<SalesDashboardProps> = ({ permissions }) => {
  const navigate = useNavigate();
  const hasProductWorkspaceAccess = permissions.products || permissions.sales;
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [salesTrendLoading, setSalesTrendLoading] = useState(false);
  const [stockAlerts, setStockAlerts] = useState<ProductAlertCard[]>([]);
  const [stockAlertsLoading, setStockAlertsLoading] = useState(false);
  const [stockAlertsError, setStockAlertsError] = useState('');

  const salesCards = [
    {
      key: 'sales',
      title: 'New Sale (POS)',
      description: 'Open Point of Sale terminal to create new invoices.',
      path: '/sales',
      icon: '➕',
      accent: 'from-emerald-500/20 via-emerald-500/8 to-transparent',
    },
    {
      key: 'orders',
      title: 'Sales History',
      description: 'View and manage past orders and transactions.',
      path: '/orders',
      icon: '📜',
      accent: 'from-cyan-500/20 via-cyan-500/8 to-transparent',
    },
    {
      key: 'returns',
      title: 'Returns',
      description: 'Process and manage product returns.',
      path: '/returns',
      icon: '↩️',
      accent: 'from-amber-500/20 via-amber-500/8 to-transparent',
    },
    {
      key: 'reports',
      title: 'Analytics',
      description: 'View detailed sales reports and insights.',
      path: '/reports',
      icon: '📊',
      accent: 'from-fuchsia-500/20 via-fuchsia-500/8 to-transparent',
    },
  ].filter((card) => permissions[card.key as keyof PermissionMatrix]);

  const productCards = [
    {
      title: 'Product Entry',
      description: 'Add new products, pricing, GST, barcode, and stock settings.',
      path: '/products/entry',
      icon: '➕',
      accent: 'from-emerald-500/20 via-emerald-500/8 to-transparent',
    },
    {
      title: 'Product Catalog',
      description: 'Review and edit the product list used in billing.',
      path: '/products/catalog',
      icon: '📦',
      accent: 'from-sky-500/20 via-sky-500/8 to-transparent',
    },
    {
      title: 'Stock Alerts',
      description: 'Review low-stock and auto-reorder items before selling.',
      path: '/products/alerts',
      icon: '🚨',
      accent: 'from-rose-500/20 via-rose-500/8 to-transparent',
    },
  ];

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || (!permissions.sales && !permissions.reports)) {
      setSalesTrend([]);
      return;
    }

    const days = buildSalesDays();

    const loadSalesTrend = async () => {
      setSalesTrendLoading(true);
      try {
        if (permissions.reports) {
          const response = await fetchApiJson(
            apiUrl(`/api/reports/daily-sales-summary?startDate=${days[0].key}&endDate=${days[days.length - 1].key}`),
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const rows = Array.isArray(response?.data) ? response.data : [];
          const totalsByKey = rows.reduce<Record<string, number>>((acc, row: any) => {
            const key = `${row?._id?.year || ''}-${String(row?._id?.month || '').padStart(2, '0')}-${String(row?._id?.day || '').padStart(2, '0')}`;
            acc[key] = Number(row?.salesAmount || 0);
            return acc;
          }, {});

          setSalesTrend(
            days.map((day) => ({
              key: day.key,
              label: day.label,
              shortDate: day.shortDate,
              total: Number(totalsByKey[day.key] || 0),
            }))
          );
          return;
        }

        const totals = await Promise.all(
          days.map(async (day) => {
            const end = new Date(day.date);
            end.setHours(23, 59, 59, 999);
            const response = await fetchApiJson(
              apiUrl(`/api/sales/analytics/summary?startDate=${day.date.toISOString()}&endDate=${end.toISOString()}`),
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            return Number(response?.data?.summary?.totalSales || 0);
          })
        );

        setSalesTrend(
          days.map((day, index) => ({
            key: day.key,
            label: day.label,
            shortDate: day.shortDate,
            total: Number(totals[index] || 0),
          }))
        );
      } catch {
        setSalesTrend(
          days.map((day) => ({
            key: day.key,
            label: day.label,
            shortDate: day.shortDate,
            total: 0,
          }))
        );
      } finally {
        setSalesTrendLoading(false);
      }
    };

    void loadSalesTrend();
  }, [permissions.reports, permissions.sales]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !hasProductWorkspaceAccess) {
      setStockAlerts([]);
      setStockAlertsError('');
      return;
    }

    const loadStockAlerts = async () => {
      setStockAlertsLoading(true);
      setStockAlertsError('');
      try {
        const pageSize = 250;
        const maxTotal = 50_000;
        let skip = 0;
        let total: number | null = null;
        const merged: ProductAlertCard[] = [];

        while (skip < maxTotal) {
          const response = await fetchApiJson(
            apiUrl(`/api/products?skip=${skip}&limit=${pageSize}&isActive=all`),
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          const rows: ProductAlertCard[] = Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.products)
              ? response.products
              : [];

          merged.push(...rows);

          const nextTotal = Number(response?.pagination?.total);
          if (!Number.isNaN(nextTotal) && nextTotal >= 0) {
            total = nextTotal;
          }

          skip += rows.length;
          if (rows.length === 0) break;
          if (total !== null && skip >= total) break;
        }

        const importantAlerts = merged
          .filter((product) => (product.itemType || 'inventory') === 'inventory')
          .filter((product) => Number(product.stock || 0) <= Number(product.minStock || 0))
          .sort(sortAlertCards)
          .slice(0, 6);

        setStockAlerts(importantAlerts);
      } catch (error: any) {
        setStockAlerts([]);
        setStockAlertsError(error?.message || 'Failed to load stock alerts');
      } finally {
        setStockAlertsLoading(false);
      }
    };

    void loadStockAlerts();
  }, [hasProductWorkspaceAccess]);

  const salesPeak = Math.max(1, ...salesTrend.map((point) => point.total));
  const weekTotal = salesTrend.reduce((sum, point) => sum + point.total, 0);
  const averageDailySales = salesTrend.length ? weekTotal / salesTrend.length : 0;
  const todaySales = salesTrend[salesTrend.length - 1]?.total || 0;
  const peakDay = salesTrend.reduce<SalesTrendPoint | null>(
    (current, point) => (!current || point.total > current.total ? point : current),
    null
  );

  const stockAlertCounts = useMemo(() => ({
    outOfStock: stockAlerts.filter((product) => Number(product.stock || 0) <= 0).length,
    lowStock: stockAlerts.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= Number(product.minStock || 0)).length,
    reorderNow: stockAlerts.filter((product) => product.autoReorder && Number(product.stock || 0) <= Number(product.minStock || 0)).length,
  }), [stockAlerts]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">Sales Control Desk</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Sales Dashboard</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            Track seven-day sales movement, act on urgent stock issues, and jump into billing work without leaving the sales workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate('/sales')}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(16,185,129,0.24)] hover:bg-emerald-400"
          >
            Start Billing
          </button>
          {permissions.orders && (
            <button
              type="button"
              onClick={() => navigate('/orders')}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Open Sales History
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="rounded-[28px] border border-emerald-400/15 bg-gradient-to-br from-emerald-500/16 via-emerald-500/6 to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">Today</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatCurrency(todaySales)}</p>
          <p className="mt-2 text-sm text-emerald-100/80">Current day sales movement from the live trend window.</p>
        </div>
        <div className="rounded-[28px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/16 via-cyan-500/6 to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/90">Last 7 Days</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatCurrency(weekTotal)}</p>
          <p className="mt-2 text-sm text-cyan-100/80">Combined sales from the current seven-day dashboard trend.</p>
        </div>
        <div className="rounded-[28px] border border-fuchsia-400/15 bg-gradient-to-br from-fuchsia-500/16 via-fuchsia-500/6 to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-200/90">Daily Average</p>
          <p className="mt-3 text-3xl font-semibold text-white">{formatCurrency(averageDailySales)}</p>
          <p className="mt-2 text-sm text-fuchsia-100/80">Average daily collection based on the same seven-day window.</p>
        </div>
        <div className="rounded-[28px] border border-amber-400/15 bg-gradient-to-br from-amber-500/16 via-amber-500/6 to-transparent p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/90">Peak Day</p>
          <p className="mt-3 text-3xl font-semibold text-white">{peakDay ? peakDay.label : '--'}</p>
          <p className="mt-2 text-sm text-amber-100/80">
            {peakDay ? `${formatCurrency(peakDay.total)} on ${peakDay.shortDate}` : 'Waiting for sales trend data.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.86))] p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Sales Graph</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">7-day sales trend</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Compare each day quickly before opening the full sales report.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Trend total</p>
              <p className="mt-2 text-2xl font-semibold text-white">{formatCurrency(weekTotal)}</p>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-slate-950/35 p-5">
            {salesTrendLoading ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-slate-400">Loading sales graph...</div>
            ) : (
              <div className="flex h-[280px] items-end gap-3 sm:gap-4">
                {salesTrend.map((point) => {
                  const barHeight = Math.max(14, Math.round((point.total / salesPeak) * 190));
                  const isPeak = point.key === peakDay?.key;
                  return (
                    <div key={point.key} className="flex min-w-0 flex-1 flex-col items-center">
                      <p className={`mb-3 text-xs font-semibold ${isPeak ? 'text-emerald-200' : 'text-slate-400'}`}>
                        {point.total > 0 ? formatCurrency(point.total) : '0'}
                      </p>
                      <div className="flex h-[200px] w-full items-end rounded-[24px] border border-white/10 bg-white/[0.03] p-3">
                        <div
                          className={`w-full rounded-[18px] bg-gradient-to-b ${
                            isPeak
                              ? 'from-emerald-300 via-emerald-400 to-cyan-500 shadow-[0_18px_30px_rgba(16,185,129,0.3)]'
                              : 'from-sky-300 via-sky-400 to-blue-500/90'
                          }`}
                          style={{ height: `${barHeight}px` }}
                        />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-white">{point.label}</p>
                      <p className="text-xs text-slate-500">{point.shortDate}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.9))] p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">Stock Attention</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Important stock alerts</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Focus first on the items that can interrupt sales or need immediate restocking.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-3">
            <div className="rounded-2xl border border-rose-400/15 bg-rose-500/10 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-200">Out of stock</p>
              <p className="mt-2 text-2xl font-semibold text-white">{stockAlertCounts.outOfStock}</p>
            </div>
            <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Below minimum</p>
              <p className="mt-2 text-2xl font-semibold text-white">{stockAlertCounts.lowStock}</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Auto reorder</p>
              <p className="mt-2 text-2xl font-semibold text-white">{stockAlertCounts.reorderNow}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/products/alerts')}
            className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            Open full stock alerts
          </button>
        </section>
      </div>

      {hasProductWorkspaceAccess && (
        <section className="rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))] p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Visual stock alerts</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Products that need attention first</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                These cards highlight the most urgent items using product images, stock levels, and quick actions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/products/catalog')}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Open product catalog
            </button>
          </div>

          {stockAlertsLoading ? (
            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-10 text-center text-sm text-slate-400">
              Loading important stock alerts...
            </div>
          ) : stockAlertsError ? (
            <div className="mt-6 rounded-[28px] border border-rose-400/20 bg-rose-500/10 px-6 py-6 text-sm text-rose-100">
              {stockAlertsError}
            </div>
          ) : stockAlerts.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-dashed border-white/15 bg-white/[0.03] px-6 py-10 text-center text-sm text-slate-300">
              No urgent stock alerts right now.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {stockAlerts.map((product) => {
                const alertMeta = getAlertMeta(product);
                const shortage = Math.max(0, Number(product.minStock || 0) - Number(product.stock || 0));
                return (
                  <article
                    key={product._id}
                    className={`group overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b ${alertMeta.ring} shadow-[0_22px_50px_rgba(2,6,23,0.28)]`}
                  >
                    <div className="relative h-44 overflow-hidden border-b border-white/10 bg-slate-950/40">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_28%),linear-gradient(135deg,rgba(30,41,59,0.9),rgba(15,23,42,0.96))]">
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl font-semibold text-white">
                            {getProductInitials(product.name)}
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${alertMeta.accent}`}>
                          {alertMeta.label}
                        </span>
                        <span className="rounded-full border border-black/20 bg-black/35 px-3 py-1 text-xs font-semibold text-white">
                          {product.category || 'General'}
                        </span>
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-white">{product.name}</h3>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{product.sku || 'No SKU'}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-slate-200">
                          Need {shortage} more
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stock</p>
                          <p className="mt-2 text-lg font-semibold text-white">{Number(product.stock || 0)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Min</p>
                          <p className="mt-2 text-lg font-semibold text-white">{Number(product.minStock || 0)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reorder</p>
                          <p className="mt-2 text-lg font-semibold text-white">{Number(product.reorderQuantity || 0)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/products/edit/${product._id}`)}
                          className="flex-1 rounded-2xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
                        >
                          Edit product
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/products/alerts')}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.08]"
                        >
                          View alerts
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-200">Sales Actions</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {salesCards.map((card) => (
              <button
                key={card.path}
                type="button"
                className={`overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br ${card.accent} p-5 text-left transition-all hover:-translate-y-0.5 hover:bg-white/10`}
                onClick={() => navigate(card.path)}
              >
                <h3 className="text-lg font-medium leading-6 text-white">{card.icon} {card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
              </button>
            ))}
          </div>
        </div>

        {hasProductWorkspaceAccess && (
          <div className="rounded-[32px] border border-sky-500/20 bg-sky-500/5 p-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-200">Product Setup</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Open product entry and stock-monitoring pages directly from the sales area.</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {productCards.map((card) => (
                <button
                  key={card.path}
                  type="button"
                  className={`overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br ${card.accent} p-5 text-left transition-all hover:-translate-y-0.5 hover:bg-white/10`}
                  onClick={() => navigate(card.path)}
                >
                  <h3 className="text-lg font-medium leading-6 text-white">{card.icon} {card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{card.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
