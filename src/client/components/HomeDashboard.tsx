import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageKey, PermissionMatrix } from '@shared/rbac';
import { IUser } from '@shared/types';
import { formatCurrency } from '../config';
import { apiUrl, fetchApiJson } from '../utils/api';
import { getGeneralSettings, resolveGeneralSettingsAssetUrl } from '../utils/generalSettings';

type ModuleCard = {
  key: PageKey;
  title: string;
  desc: string;
  path: string;
  icon: string;
  category: 'Sales' | 'Catalog' | 'People' | 'Operations' | 'Admin';
  accent: string;
};

type SalesTrendPoint = {
  key: string;
  label: string;
  shortDate: string;
  total: number;
};

type CalendarCell = {
  key: string;
  date: Date;
  inMonth: boolean;
};

const toDateKey = (value: Date | string): string => {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), 1);

const buildCalendarCells = (monthDate: Date): CalendarCell[] => {
  const first = startOfMonth(monthDate);
  const startPadding = first.getDay();
  const cells: CalendarCell[] = [];

  for (let i = startPadding; i > 0; i -= 1) {
    const d = new Date(first);
    d.setDate(first.getDate() - i);
    cells.push({ key: `${toDateKey(d)}-p`, date: d, inMonth: false });
  }

  const lastDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= lastDate; day += 1) {
    const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    cells.push({ key: `${toDateKey(d)}-m`, date: d, inMonth: true });
  }

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]?.date || first;
    const d = new Date(last);
    d.setDate(last.getDate() + 1);
    cells.push({ key: `${toDateKey(d)}-n`, date: d, inMonth: false });
  }

  return cells;
};

const modules: ModuleCard[] = [
  { key: 'sales-dashboard', title: 'Sales Dashboard', desc: 'Process invoices and monitor today sales flow.', path: '/sales-dashboard', icon: '01', category: 'Sales', accent: 'from-emerald-500/18 via-emerald-500/6 to-transparent' },
  { key: 'orders', title: 'Orders', desc: 'Track and manage customer order lifecycle.', path: '/orders', icon: '02', category: 'Sales', accent: 'from-emerald-500/18 via-emerald-500/6 to-transparent' },
  { key: 'sales', title: 'Quotations', desc: 'Create quotes and convert approvals into draft invoices.', path: '/sales/quotes', icon: '03', category: 'Sales', accent: 'from-emerald-500/18 via-emerald-500/6 to-transparent' },
  { key: 'reports', title: 'Reports', desc: 'Analyze business reports and revenue trends.', path: '/reports', icon: '04', category: 'Sales', accent: 'from-emerald-500/18 via-emerald-500/6 to-transparent' },
  { key: 'products', title: 'Products', desc: 'Open the product center for catalog and stock alerts.', path: '/products', icon: '05', category: 'Catalog', accent: 'from-sky-500/18 via-sky-500/6 to-transparent' },
  { key: 'inventory', title: 'Inventory', desc: 'Monitor stock movement and replenishment status.', path: '/inventory', icon: '06', category: 'Catalog', accent: 'from-sky-500/18 via-sky-500/6 to-transparent' },
  { key: 'inventory', title: 'Procurement', desc: 'Manage suppliers, POs, and stock receipts.', path: '/inventory/procurement', icon: '07', category: 'Catalog', accent: 'from-sky-500/18 via-sky-500/6 to-transparent' },
  { key: 'employees', title: 'Employees', desc: 'Maintain employee records and profiles.', path: '/employees', icon: '08', category: 'People', accent: 'from-amber-500/18 via-amber-500/6 to-transparent' },
  { key: 'employee-attendance', title: 'Employee Check In', desc: 'Let employees mark their own attendance using current time and GPS.', path: '/attendance/self', icon: '09', category: 'People', accent: 'from-amber-500/18 via-amber-500/6 to-transparent' },
  { key: 'attendance', title: 'Attendance Register', desc: 'Record attendance manually and review staff presence.', path: '/attendance', icon: '10', category: 'People', accent: 'from-amber-500/18 via-amber-500/6 to-transparent' },
  { key: 'payroll', title: 'Payroll', desc: 'Generate payroll from attendance and rates.', path: '/payroll', icon: '11', category: 'People', accent: 'from-amber-500/18 via-amber-500/6 to-transparent' },
  { key: 'facilities', title: 'Facilities', desc: 'Handle single facility bookings.', path: '/facilities', icon: '12', category: 'Operations', accent: 'from-fuchsia-500/18 via-fuchsia-500/6 to-transparent' },
  { key: 'facilities', title: 'Events', desc: 'Manage event bookings and multi-facility schedules.', path: '/events', icon: '13', category: 'Operations', accent: 'from-fuchsia-500/18 via-fuchsia-500/6 to-transparent' },
  { key: 'memberships', title: 'Memberships', desc: 'Control plans, subscribers, and renewals.', path: '/memberships', icon: '14', category: 'Operations', accent: 'from-fuchsia-500/18 via-fuchsia-500/6 to-transparent' },
  { key: 'accounting', title: 'Accounting', desc: 'Manage invoices, vouchers, and books.', path: '/accounting', icon: '15', category: 'Admin', accent: 'from-rose-500/18 via-rose-500/6 to-transparent' },
  { key: 'settings', title: 'Settings', desc: 'Update business setup and application preferences.', path: '/settings', icon: '16', category: 'Admin', accent: 'from-rose-500/18 via-rose-500/6 to-transparent' },
  { key: 'user-management', title: 'Users', desc: 'Configure users, roles, and access.', path: '/user-management', icon: '17', category: 'Admin', accent: 'from-rose-500/18 via-rose-500/6 to-transparent' },
];

const categoryMeta = {
  Sales: { badge: 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/20', summary: 'Revenue, invoices, orders, and customer-facing workstreams.' },
  Catalog: { badge: 'bg-sky-500/15 text-sky-100 ring-sky-400/20', summary: 'Catalog control, stock health, and procurement readiness.' },
  People: { badge: 'bg-amber-500/15 text-amber-100 ring-amber-400/20', summary: 'People operations across attendance, shifts, and payroll.' },
  Operations: { badge: 'bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/20', summary: 'Facilities, events, plans, and active member journeys.' },
  Admin: { badge: 'bg-rose-500/15 text-rose-100 ring-rose-400/20', summary: 'Business controls, accounting, settings, and user access.' },
} as const;

const formatPreviewDate = (value: unknown): string => {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const getPreviewPrimary = (item: any, fallback: string): string =>
  String(item?.eventTitle || item?.memberName || item?.customerName || item?.eventNumber || item?.memberCode || item?.name || fallback);

const getPreviewSecondary = (item: any): string => {
  const facilityLabel = Array.isArray(item?.facilityIds)
    ? item.facilityIds.map((facility: any) => String(facility?.name || '').trim()).filter(Boolean).slice(0, 2).join(', ')
    : '';
  const planLabel = typeof item?.planId === 'object' && item?.planId ? String(item.planId.name || '').trim() : '';
  const dueLabel = Number(item?.balanceAmount || item?.amountDue || 0) > 0
    ? `Due ${formatCurrency(Number(item.balanceAmount || item.amountDue || 0))}`
    : '';
  return [formatPreviewDate(item?.startTime || item?.endDate || item?.paymentDate), facilityLabel || planLabel || String(item?.reminderType || '').trim(), dueLabel]
    .filter(Boolean)
    .join(' • ');
};

export const HomeDashboard: React.FC<{
  user: Partial<IUser>;
  todaySales: number | null;
  permissions: PermissionMatrix;
}> = ({ user, todaySales, permissions }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [brandName, setBrandName] = useState('Spark');
  const [homeLogo, setHomeLogo] = useState('');
  const [homeBackgrounds, setHomeBackgrounds] = useState<string[]>([]);
  const [backgroundRotationSeconds, setBackgroundRotationSeconds] = useState(8);
  const [activeBackgroundIndex, setActiveBackgroundIndex] = useState(0);
  const [eventReminders, setEventReminders] = useState<any[]>([]);
  const [eventPaymentsDue, setEventPaymentsDue] = useState<any[]>([]);
  const [membershipExpiring, setMembershipExpiring] = useState<any[]>([]);
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [salesTrendLoading, setSalesTrendLoading] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshBrand = () => {
      const settings = getGeneralSettings();
      setBrandName(settings.business.tradeName || settings.business.legalName || user.businessName || 'Spark');
      setHomeLogo(resolveGeneralSettingsAssetUrl(settings.business.reportLogoDataUrl || settings.business.invoiceLogoDataUrl || ''));
      setHomeBackgrounds(
        Array.isArray(settings.appearance.homeBackgrounds)
          ? settings.appearance.homeBackgrounds.map((image) => resolveGeneralSettingsAssetUrl(image.url)).filter(Boolean)
          : []
      );
      setBackgroundRotationSeconds(Math.min(60, Math.max(3, Number(settings.appearance.homeBackgroundRotationSeconds || 8))));
    };

    refreshBrand();
    window.addEventListener('storage', refreshBrand);
    window.addEventListener('sarva-settings-updated', refreshBrand as EventListener);
    return () => {
      window.removeEventListener('storage', refreshBrand);
      window.removeEventListener('sarva-settings-updated', refreshBrand as EventListener);
    };
  }, [user.businessName]);

  useEffect(() => {
    if (homeBackgrounds.length <= 1) {
      setActiveBackgroundIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setActiveBackgroundIndex((prev) => ((prev + 1) % homeBackgrounds.length));
    }, backgroundRotationSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [backgroundRotationSeconds, homeBackgrounds]);

  useEffect(() => {
    const loadReminders = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        if (permissions.facilities) {
          const eventData = await fetchApiJson(apiUrl('/api/events/reminders?days=5'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          setEventReminders(Array.isArray(eventData?.data?.upcoming) ? eventData.data.upcoming : []);
          setEventPaymentsDue(Array.isArray(eventData?.data?.paymentDue) ? eventData.data.paymentDue : []);
        } else {
          setEventReminders([]);
          setEventPaymentsDue([]);
        }
      } catch {
        setEventReminders([]);
        setEventPaymentsDue([]);
      }

      try {
        if (permissions.memberships) {
          const membershipData = await fetchApiJson(apiUrl('/api/memberships/subscriptions/expiry-alerts?days=15'), {
            headers: { Authorization: `Bearer ${token}` },
          });
          setMembershipExpiring(Array.isArray(membershipData?.data?.expiring) ? membershipData.data.expiring : []);
        } else {
          setMembershipExpiring([]);
        }
      } catch {
        setMembershipExpiring([]);
      }
    };

    void loadReminders();
  }, [permissions.facilities, permissions.memberships]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !permissions.sales) {
      setSalesTrend([]);
      return;
    }

    const days = Array.from({ length: 7 }, (_, index) => {
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

  const visibleModules = useMemo(
    () => modules.filter((module) => permissions[module.key] || (module.key === 'products' && permissions.sales)),
    [permissions]
  );
  const groupedModules = useMemo(
    () => visibleModules.reduce<Record<string, ModuleCard[]>>((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {}),
    [visibleModules]
  );

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const roleLabel = String(user.role || 'User').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  const quickActions = visibleModules.slice(0, 4);
  const totalAttentionItems = eventReminders.length + eventPaymentsDue.length + membershipExpiring.length;
  const allowedPagesCount = Object.values(permissions).filter(Boolean).length;
  const activeBackgroundImage = homeBackgrounds[activeBackgroundIndex] || '';
  const currentMonth = useMemo(() => startOfMonth(now), [now]);
  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
  const eventCalendarMap = useMemo(() => {
    const map = new Map<string, { upcoming: number; due: number }>();
    const applyMarker = (rawValue: unknown, type: 'upcoming' | 'due') => {
      const key = toDateKey(String(rawValue || ''));
      if (!key) return;
      const current = map.get(key) || { upcoming: 0, due: 0 };
      current[type] += 1;
      map.set(key, current);
    };

    eventReminders.forEach((item) => applyMarker(item?.startTime || item?.paymentDate, 'upcoming'));
    eventPaymentsDue.forEach((item) => applyMarker(item?.paymentDate || item?.startTime, 'due'));
    return map;
  }, [eventPaymentsDue, eventReminders]);
  const todayKey = toDateKey(now);
  const salesPeak = Math.max(1, ...salesTrend.map((point) => point.total));
  const salesWeekTotal = salesTrend.reduce((sum, point) => sum + point.total, 0);
  const salesAverage = salesTrend.length ? salesWeekTotal / salesTrend.length : 0;
  const financeShortcuts = [
    permissions.accounting ? { label: 'Voucher Desk', detail: 'Open accounting, vouchers, cash book, and reports.', path: '/accounting' } : null,
    permissions.accounting ? { label: 'Settlements', detail: 'Review invoice receipts and settlement follow-up.', path: '/accounting/settlements' } : null,
    permissions.reports ? { label: 'Financial Reports', detail: 'Check sales, collection, and trend reports.', path: '/reports' } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; path: string }>;
  const accountantFocusSummary = permissions.accounting
    ? 'Track vouchers, settlements, and daily collections from one place.'
    : 'Finance access is not enabled for this role yet.';
  const nextSteps = [
    permissions['sales-dashboard'] ? { label: 'Start billing', detail: 'Jump into the active billing workspace.', path: '/sales-dashboard' } : null,
    permissions.reports ? { label: 'Review reports', detail: 'Open revenue and trend views for the day.', path: '/reports' } : null,
    permissions.accounting ? { label: 'Close finance tasks', detail: 'Check vouchers, invoices, and settlements.', path: '/accounting' } : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; path: string }>;
  const attentionPanels = [
    { key: 'upcoming', title: 'Upcoming Events', count: eventReminders.length, path: '/events', badge: 'bg-cyan-500/15 text-cyan-100 ring-cyan-400/20', items: eventReminders, emptyText: 'No upcoming events in the next 5 days.' },
    { key: 'due', title: 'Payments Pending', count: eventPaymentsDue.length, path: '/events', badge: 'bg-amber-500/15 text-amber-100 ring-amber-400/20', items: eventPaymentsDue, emptyText: 'No pending event payments.' },
    { key: 'memberships', title: 'Membership Expiry', count: membershipExpiring.length, path: '/memberships', badge: 'bg-rose-500/15 text-rose-100 ring-rose-400/20', items: membershipExpiring, emptyText: 'No expiring memberships in the next 15 days.' },
  ];

  return (
    <div className="relative space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-4 top-0 -z-10 h-80 rounded-[2rem] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),rgba(15,23,42,0))]" />
      <div
        className="pointer-events-none absolute inset-x-4 top-4 -z-10 h-[28rem] rounded-[2rem] opacity-45"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)', backgroundSize: '34px 34px' }}
      />

      <section
        className="sarva-home-hero relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/75 p-5 shadow-[0_32px_80px_rgba(2,6,23,0.34)] backdrop-blur-xl sm:p-6 lg:p-8"
        style={activeBackgroundImage ? { backgroundImage: `linear-gradient(120deg, rgba(2,6,23,0.9), rgba(15,23,42,0.85), rgba(15,23,42,0.68)), url("${activeBackgroundImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">Admin Board</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">{roleLabel}</span>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              {homeLogo ? <img src={homeLogo} alt="Business logo" className="h-20 w-20 rounded-2xl bg-white/8 object-contain p-2" /> : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-indigo-500/20 text-2xl font-semibold text-white">{String(brandName || 'S').slice(0, 1).toUpperCase()}</div>}
              <div className="max-w-3xl">
                <p className="text-sm font-medium text-cyan-100">{greeting}</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{user.firstName ? `${user.firstName}, here’s your control center.` : 'Your control center is ready.'}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{user.businessName || brandName} now opens with live sales movement, a compact event calendar, and faster access to the work that actually needs attention.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">{allowedPagesCount} accessible pages</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">{visibleModules.length} shortcuts ready</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">{totalAttentionItems > 0 ? `${totalAttentionItems} items need review` : 'No urgent items right now'}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_320px]">
              <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4 backdrop-blur-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Sales Pulse</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Last 7 days</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      {permissions.sales ? 'Daily collections trend across the last seven days.' : 'Enable Sales access to view the live sales graph.'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Week Total</p>
                    <p className="mt-2 text-lg font-semibold text-emerald-300">
                      {permissions.sales ? formatCurrency(salesWeekTotal) : 'Locked'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Avg {permissions.sales ? formatCurrency(salesAverage) : 'N/A'}
                    </p>
                  </div>
                </div>

                {permissions.sales ? (
                  <div className="mt-5">
                    <div className="grid h-52 grid-cols-7 items-end gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-black/10 px-4 pb-4 pt-6">
                      {salesTrend.map((point) => {
                        const barHeight = Math.max(8, Math.round((point.total / salesPeak) * 100));
                        const isTodayBar = point.key === todayKey;
                        return (
                          <div key={point.key} className="flex h-full flex-col justify-end gap-2">
                            <div className="text-center text-[11px] font-medium text-slate-400">
                              {point.total > 0 ? formatCurrency(point.total) : '0'}
                            </div>
                            <div className="flex flex-1 items-end justify-center rounded-xl bg-black/10 px-2 py-2">
                              <div
                                className={`w-full rounded-t-xl transition-all ${
                                  isTodayBar
                                    ? 'bg-gradient-to-t from-cyan-400 to-emerald-300 shadow-[0_12px_24px_rgba(45,212,191,0.25)]'
                                    : 'bg-gradient-to-t from-sky-500/70 to-cyan-300/80'
                                }`}
                                style={{ height: `${barHeight}%` }}
                                title={`${point.shortDate}: ${formatCurrency(point.total)}`}
                              />
                            </div>
                            <div className="text-center">
                              <p className="text-xs font-semibold text-white">{point.label}</p>
                              <p className="text-[11px] text-slate-500">{point.shortDate}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                      <span>{salesTrendLoading ? 'Refreshing sales graph...' : 'Chart refreshes from live sales data.'}</span>
                      {permissions.reports && (
                        <button
                          type="button"
                          onClick={() => navigate('/reports')}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-slate-200 transition hover:bg-white/10"
                        >
                          Open Reports
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-10 text-center text-sm text-slate-500">
                    Sales trend is available for roles with sales access.
                  </div>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4 backdrop-blur-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Event Calendar</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">
                      {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">Current month with upcoming events and payment follow-up markers.</p>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                    {eventReminders.length + eventPaymentsDue.length} marks
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {calendarCells.map((cell) => {
                    const cellKey = toDateKey(cell.date);
                    const marker = eventCalendarMap.get(cellKey);
                    const isTodayCell = cellKey === todayKey;
                    return (
                      <div
                        key={cell.key}
                        className={`min-h-[54px] rounded-xl border px-2 py-2 ${
                          cell.inMonth ? 'border-white/10 bg-white/[0.04]' : 'border-white/6 bg-black/10'
                        } ${isTodayCell ? 'ring-1 ring-cyan-400/40' : ''}`}
                      >
                        <div className={`text-xs font-semibold ${cell.inMonth ? 'text-white' : 'text-slate-600'}`}>
                          {cell.date.getDate()}
                        </div>
                        {marker ? (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            {marker.upcoming > 0 ? <span className="h-2 w-2 rounded-full bg-cyan-300" title={`${marker.upcoming} upcoming event(s)`} /> : null}
                            {marker.due > 0 ? <span className="h-2 w-2 rounded-full bg-amber-300" title={`${marker.due} payment due item(s)`} /> : null}
                            <span className="text-[10px] text-slate-400">{marker.upcoming + marker.due}</span>
                          </div>
                        ) : (
                          <div className="mt-3 h-2 w-2 rounded-full bg-transparent" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-cyan-300" /> Upcoming</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-300" /> Payment due</span>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Live Snapshot</p>
                <p className="mt-2 text-xl font-semibold text-white">{todayLabel}</p>
                <p className="text-sm text-slate-300">{timeLabel}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Status</p>
                <p className="mt-1 text-sm font-semibold text-white">{totalAttentionItems > 0 ? 'Needs review' : 'Stable'}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Revenue</p><p className="mt-2 text-lg font-semibold text-emerald-300">{todaySales !== null ? formatCurrency(todaySales) : 'Loading...'}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Attention</p><p className="mt-2 text-lg font-semibold text-amber-300">{totalAttentionItems}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Pages</p><p className="mt-2 text-lg font-semibold text-cyan-200">{allowedPagesCount}</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Modules</p><p className="mt-2 text-lg font-semibold text-indigo-200">{visibleModules.length}</p></div>
            </div>
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Finance Desk</p>
                  <p className="mt-1 text-sm text-slate-300">{accountantFocusSummary}</p>
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-100">
                  {permissions.accounting ? 'Ready' : 'Locked'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Collections</p>
                  <p className="mt-2 text-sm font-semibold text-white">{todaySales !== null ? formatCurrency(todaySales) : 'Loading...'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Review Queue</p>
                  <p className="mt-2 text-sm font-semibold text-white">{totalAttentionItems} items</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {financeShortcuts.length ? financeShortcuts.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="w-full rounded-xl border border-white/10 bg-black/10 px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/10"
                  >
                    <p className="text-sm font-semibold text-white">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p>
                  </button>
                )) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-4 text-sm text-slate-500">
                    Ask an admin to enable accounting or reports access for this dashboard.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5 shadow-[0_18px_40px_rgba(2,6,23,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-200">Quick Launch</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Open core work faster</h2>
            <p className="mt-2 text-sm text-slate-400">Compact shortcuts instead of duplicate dashboard counters.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{quickActions.length} ready</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((card) => (
            <button key={card.path} type="button" onClick={() => navigate(card.path)} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${card.accent} p-4 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_18px_34px_rgba(2,6,23,0.34)]`}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-sm font-semibold text-white">{card.icon}</span>
              <p className="mt-4 text-sm font-semibold text-white">{card.title}</p>
              <p className="mt-1 text-xs leading-6 text-slate-300 line-clamp-2">{card.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(groupedModules).map(([category, categoryCards]) => {
            const meta = categoryMeta[category as keyof typeof categoryMeta] || categoryMeta.Admin;
            return (
              <section key={category} className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5 shadow-[0_22px_48px_rgba(2,6,23,0.24)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ${meta.badge}`}>{category}</span>
                    <h3 className="mt-3 text-xl font-semibold text-white">{categoryCards.length} tools in {category}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{meta.summary}</p>
                  </div>
                  <button type="button" onClick={() => navigate(categoryCards[0]?.path || '/')} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/10">Open hub</button>
                </div>
                <div className="mt-5 grid gap-3">
                  {categoryCards.map((card) => (
                    <button key={card.path} type="button" onClick={() => navigate(card.path)} className={`rounded-2xl border border-white/10 bg-gradient-to-r ${card.accent} p-4 text-left transition duration-300 hover:-translate-y-0.5 hover:border-white/20`}>
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-sm font-semibold text-white">{card.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-white">{card.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{card.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="space-y-6">
          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5 shadow-[0_22px_48px_rgba(2,6,23,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Attention Board</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">What needs action</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Compact follow-up cards similar to modern admin dashboards.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{totalAttentionItems} open</span>
            </div>
            <div className="mt-5 space-y-4">
              {attentionPanels.map((panel) => (
                <div key={panel.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{panel.title}</p>
                      <p className="mt-1 text-xs text-slate-400">{panel.count > 0 ? `${panel.count} item(s) waiting` : panel.emptyText}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ${panel.badge}`}>{panel.count}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {panel.items.slice(0, 3).map((item, index) => (
                      <div key={`${panel.key}-${index}`} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                        <p className="text-sm font-medium text-slate-100">{getPreviewPrimary(item, `${panel.title} ${index + 1}`)}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{getPreviewSecondary(item) || 'Open the module for more details.'}</p>
                      </div>
                    ))}
                    {!panel.items.length ? <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-4 text-sm text-slate-500">{panel.emptyText}</div> : null}
                  </div>
                  <button type="button" onClick={() => navigate(panel.path)} className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/10">Open queue</button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/55 p-5 shadow-[0_22px_48px_rgba(2,6,23,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Recommended Flow</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Next best actions</h2>
            <div className="mt-5 space-y-3">
              {nextSteps.map((step) => (
                <button key={step.path} type="button" onClick={() => navigate(step.path)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition duration-300 hover:-translate-y-0.5 hover:bg-white/10">
                  <p className="text-sm font-semibold text-white">{step.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{step.detail}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
};
