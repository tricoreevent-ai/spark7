import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { EMPTY_PERMISSIONS, PAGE_META, PageKey, PermissionMatrix } from '@shared/rbac';
import { IUser } from '@shared/types';
import { formatCurrency } from './config';
import { Navbar } from './components/Navbar';
import { HomeDashboard as ModernHomeDashboard } from './components/HomeDashboard';
import { Inventory } from './Inventory';
import { AddProduct } from './pages/AddProduct';
import { Accounting } from './pages/Accounting';
import { AdminReports } from './pages/AdminReports';
import { Attendance } from './pages/Attendance';
import { AttendanceReports } from './pages/AttendanceReports';
import { EmployeeAttendance } from './pages/EmployeeAttendance';
import { Categories } from './pages/Categories';
import { Customers } from './pages/Customers';
import { EditProduct } from './pages/EditProduct';
import { Employees } from './pages/Employees';
import { EventManagement } from './pages/EventManagement';
import { Facilities } from './pages/Facilities';
import { FacilitySetup } from './pages/FacilitySetup';
import { HelpCenter } from './pages/HelpCenter';
import { Memberships } from './pages/Memberships';
import { MembershipReports } from './pages/MembershipReports';
import { Orders } from './pages/Orders';
import { Payroll } from './pages/Payroll';
import { ProductAlerts } from './pages/ProductAlerts';
import { ProductCenter } from './pages/ProductCenter';
import { ProductList } from './pages/ProductList';
import { Procurement } from './pages/Procurement';
import { PublicAboutPage, PublicContactPage, PublicHomePage, PublicLoginPage } from './pages/PublicSite';
import { Quotations } from './pages/Quotations';
import { Reports } from './pages/Reports';
import Returns from './pages/Returns';
import { Sales } from './pages/Sales';
import { SalesDashboard } from './pages/SalesDashboard';
import { SettlementCenter } from './pages/SettlementCenter';
import { Settings } from './pages/Settings';
import { Shifts } from './pages/Shifts';
import { UserManagement } from './pages/UserManagement';
import { apiUrl, fetchApiJson } from './utils/api';
import { initializeAutoTooltips } from './utils/autoTooltips';
import { getGeneralSettings, loadGeneralSettingsFromServer, resolveGeneralSettingsAssetUrl } from './utils/generalSettings';
import {
  FONT_SCALE_STEP,
  ResolvedUiPreferences,
  UI_PREFERENCES_UPDATED_EVENT,
  applyAndPersistUiPreferencesLocal,
  clampFontScale,
  loadUiPreferencesFromServer,
  normalizeUiPreferences,
  readUiPreferencesFromStorage,
  saveUiPreferencesToServer,
} from './utils/uiPreferences';

const SAVED_CREDENTIALS_KEY = 'sarva_saved_credentials';
const CREDENTIALS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SavedCredentials = {
  email: string;
  password: string;
  tenantSlug?: string;
  expiresAt: number;
};

type CompanyCreationConfig = {
  enabled: boolean;
  requiresAccessKey: boolean;
};

const headerIconButtonClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/10 hover:text-white';

const readSavedCredentials = (): SavedCredentials | null => {
  try {
    const raw = localStorage.getItem(SAVED_CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCredentials>;
    const email = String(parsed.email || '').trim();
    const password = String(parsed.password || '');
    const tenantSlug = String(parsed.tenantSlug || '').trim().toLowerCase();
    const expiresAt = Number(parsed.expiresAt || 0);
    if (!email || !password || !Number.isFinite(expiresAt)) {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      return null;
    }
    if (Date.now() > expiresAt) {
      localStorage.removeItem(SAVED_CREDENTIALS_KEY);
      return null;
    }
    return { email, password, tenantSlug, expiresAt };
  } catch {
    localStorage.removeItem(SAVED_CREDENTIALS_KEY);
    return null;
  }
};

const writeSavedCredentials = (email: string, password: string, tenantSlug?: string): void => {
  const payload: SavedCredentials = {
    email: String(email || '').trim().toLowerCase(),
    password: String(password || ''),
    tenantSlug: String(tenantSlug || '').trim().toLowerCase(),
    expiresAt: Date.now() + CREDENTIALS_TTL_MS,
  };
  localStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(payload));
};

const clearSavedCredentials = (): void => {
  localStorage.removeItem(SAVED_CREDENTIALS_KEY);
};

const orderedPages: PageKey[] = [
  'dashboard',
  'sales-dashboard',
  'inventory',
  'sales',
  'customers',
  'orders',
  'products',
  'returns',
  'categories',
  'settings',
  'accounting',
  'reports',
  'employees',
  'attendance',
  'employee-attendance',
  'shifts',
  'payroll',
  'facilities',
  'event-quotations',
  'memberships',
  'user-management',
  'admin-reports',
];

const withDefaultPermissions = (value?: PermissionMatrix): PermissionMatrix => ({
  ...EMPTY_PERMISSIONS,
  ...(value || {}),
});

const DashboardHome: React.FC<{
  user: Partial<IUser>;
  todaySales: number | null;
  permissions: PermissionMatrix;
}> = ({ user, todaySales, permissions }) => {
  const navigate = useNavigate();
  const [now, setNow] = useState<Date>(new Date());
  const [brandName, setBrandName] = useState('Sarva');
  const [homeLogo, setHomeLogo] = useState('');
  const [homeBackgrounds, setHomeBackgrounds] = useState<string[]>([]);
  const [backgroundRotationSeconds, setBackgroundRotationSeconds] = useState(8);
  const [activeBackgroundIndex, setActiveBackgroundIndex] = useState(0);
  const [eventReminders, setEventReminders] = useState<any[]>([]);
  const [eventPaymentsDue, setEventPaymentsDue] = useState<any[]>([]);
  const [membershipExpiring, setMembershipExpiring] = useState<any[]>([]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshBrand = () => {
      const settings = getGeneralSettings();
      const name = settings.business.tradeName || settings.business.legalName || user.businessName || 'Sarva';
      const logo = settings.business.reportLogoDataUrl || settings.business.invoiceLogoDataUrl || '';
      const backgrounds = Array.isArray(settings.appearance.homeBackgrounds)
        ? settings.appearance.homeBackgrounds
          .map((image) => resolveGeneralSettingsAssetUrl(image.url))
          .filter(Boolean)
        : [];
      setBrandName(name);
      setHomeLogo(logo);
      setHomeBackgrounds(backgrounds);
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
    if (activeBackgroundIndex < homeBackgrounds.length) return;
    setActiveBackgroundIndex(0);
  }, [activeBackgroundIndex, homeBackgrounds.length]);

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

  const modules: Array<{
    key: PageKey;
    title: string;
    desc: string;
    path: string;
    icon: string;
    category: 'Sales' | 'Catalog' | 'People' | 'Operations' | 'Admin';
    accent: string;
  }> = [
    {
      key: 'sales-dashboard',
      title: 'Sales Dashboard',
      desc: 'Process invoices and monitor today sales flow.',
      path: '/sales-dashboard',
      icon: '💰',
      category: 'Sales',
      accent: 'from-emerald-500/25 to-emerald-400/10',
    },
    {
      key: 'orders',
      title: 'Orders',
      desc: 'Track and manage customer order lifecycle.',
      path: '/orders',
      icon: '📄',
      category: 'Sales',
      accent: 'from-emerald-500/25 to-emerald-400/10',
    },
    {
      key: 'sales',
      title: 'Quotations',
      desc: 'Create quotes, revisions, and convert approvals into draft invoices.',
      path: '/sales/quotes',
      icon: '🧾',
      category: 'Sales',
      accent: 'from-emerald-500/25 to-emerald-400/10',
    },
    {
      key: 'returns',
      title: 'Returns',
      desc: 'Handle returns, approvals and reconciliation.',
      path: '/returns',
      icon: '↩️',
      category: 'Sales',
      accent: 'from-emerald-500/25 to-emerald-400/10',
    },
    {
      key: 'reports',
      title: 'Reports',
      desc: 'Analyze business reports and trends.',
      path: '/reports',
      icon: '📈',
      category: 'Sales',
      accent: 'from-emerald-500/25 to-emerald-400/10',
    },
    {
      key: 'customers',
      title: 'Customer CRM',
      desc: 'Manage customer profiles, enquiries, follow-up, and history in one desk.',
      path: '/customers',
      icon: '🧑',
      category: 'Sales',
      accent: 'from-emerald-500/25 to-emerald-400/10',
    },
    {
      key: 'products',
      title: 'Product Center',
      desc: 'Open the product center for entry, catalog review, and stock alerts.',
      path: '/products',
      icon: '📦',
      category: 'Catalog',
      accent: 'from-sky-500/25 to-sky-400/10',
    },
    {
      key: 'products',
      title: 'Product Entry',
      desc: 'Create new product records with stock, pricing, and tax settings.',
      path: '/products/entry',
      icon: '➕',
      category: 'Catalog',
      accent: 'from-sky-500/25 to-sky-400/10',
    },
    {
      key: 'categories',
      title: 'Categories',
      desc: 'Organize catalog with category structure.',
      path: '/categories',
      icon: '🗂️',
      category: 'Catalog',
      accent: 'from-sky-500/25 to-sky-400/10',
    },
    {
      key: 'inventory',
      title: 'Inventory',
      desc: 'Monitor stock movement and availability.',
      path: '/inventory',
      icon: '📊',
      category: 'Catalog',
      accent: 'from-sky-500/25 to-sky-400/10',
    },
    {
      key: 'inventory',
      title: 'Procurement',
      desc: 'Manage suppliers, purchase orders and stock receipts.',
      path: '/inventory/procurement',
      icon: '🚚',
      category: 'Catalog',
      accent: 'from-sky-500/25 to-sky-400/10',
    },
    {
      key: 'employees',
      title: 'Employees',
      desc: 'Maintain employee records and profile data.',
      path: '/employees',
      icon: '👥',
      category: 'People',
      accent: 'from-amber-500/25 to-amber-400/10',
    },
    {
      key: 'attendance',
      title: 'Attendance',
      desc: 'Record and manage day-wise attendance.',
      path: '/attendance',
      icon: '🕒',
      category: 'People',
      accent: 'from-amber-500/25 to-amber-400/10',
    },
    {
      key: 'attendance',
      title: 'Attendance Reports',
      desc: 'Review employee-wise attendance detail and print monthly sheets.',
      path: '/attendance/reports',
      icon: '📋',
      category: 'People',
      accent: 'from-amber-500/25 to-amber-400/10',
    },
    {
      key: 'employee-attendance',
      title: 'Employee Check In',
      desc: 'Let employees mark their own check-in and check-out using current time and GPS.',
      path: '/attendance/self',
      icon: '📍',
      category: 'People',
      accent: 'from-amber-500/25 to-amber-400/10',
    },
    {
      key: 'shifts',
      title: 'Shifts',
      desc: 'Plan shift schedule and weekly offs.',
      path: '/shifts',
      icon: '🗓️',
      category: 'People',
      accent: 'from-amber-500/25 to-amber-400/10',
    },
    {
      key: 'payroll',
      title: 'Payroll',
      desc: 'Generate payroll from attendance and rates.',
      path: '/payroll',
      icon: '🧾',
      category: 'People',
      accent: 'from-amber-500/25 to-amber-400/10',
    },
    {
      key: 'facilities',
      title: 'Facility Booking',
      desc: 'Single facility booking for walk-in / independent customers.',
      path: '/facilities',
      icon: '🏟️',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'facilities',
      title: 'Event Booking',
      desc: 'Corporate and organizer events with multiple facilities.',
      path: '/events',
      icon: '📅',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'event-quotations',
      title: 'Event Quotations',
      desc: 'Prepare and revise event quotations before confirming the booking.',
      path: '/events/quotations',
      icon: '📑',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'memberships',
      title: 'Create Plan',
      desc: 'Create and maintain membership plans (admin).',
      path: '/membership-plans/create',
      icon: '🧩',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'memberships',
      title: 'Create Subscription',
      desc: 'Register a member and assign a plan.',
      path: '/membership-subscriptions/create',
      icon: '📝',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'memberships',
      title: 'Memberships',
      desc: 'Configure plans and active member cycles.',
      path: '/memberships',
      icon: '🎫',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'memberships',
      title: 'Membership Reports',
      desc: 'Review lifecycle, renewal and benefit analytics.',
      path: '/membership-reports',
      icon: '📊',
      category: 'Operations',
      accent: 'from-fuchsia-500/25 to-fuchsia-400/10',
    },
    {
      key: 'accounting',
      title: 'Accounting',
      desc: 'Manage accounting entries and settlements.',
      path: '/accounting',
      icon: '📚',
      category: 'Admin',
      accent: 'from-rose-500/25 to-rose-400/10',
    },
    {
      key: 'accounting',
      title: 'Settlements',
      desc: 'Handle receipts, credit notes, and day-end closing.',
      path: '/accounting/settlements',
      icon: '💳',
      category: 'Admin',
      accent: 'from-rose-500/25 to-rose-400/10',
    },
    {
      key: 'settings',
      title: 'Settings',
      desc: 'Update business setup and preferences.',
      path: '/settings',
      icon: '⚙️',
      category: 'Admin',
      accent: 'from-rose-500/25 to-rose-400/10',
    },
    {
      key: 'user-management',
      title: 'Users',
      desc: 'Configure users, roles and page access.',
      path: '/user-management',
      icon: '🛡️',
      category: 'Admin',
      accent: 'from-rose-500/25 to-rose-400/10',
    },
    {
      key: 'admin-reports',
      title: 'Admin Reports',
      desc: 'Review audit logs, login history, and system activity.',
      path: '/admin/reports',
      icon: '🗂️',
      category: 'Admin',
      accent: 'from-rose-500/25 to-rose-400/10',
    },
  ];

  const visibleModules = modules.filter((module) => {
    if (module.key === 'products') return permissions.products || permissions.sales;
    if (module.key === 'customers') return permissions.customers || permissions.sales;
    if (module.key === 'event-quotations') return permissions['event-quotations'] || permissions.facilities;
    return permissions[module.key];
  });
  const quickActions = visibleModules.slice(0, 5);
  const allowedPagesCount = Object.values(permissions).filter(Boolean).length;

  const groupedModules = visibleModules.reduce<Record<string, typeof visibleModules>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const roleLabel = String(user.role || 'User')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const todayLabel = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const activeBackgroundImage = homeBackgrounds[activeBackgroundIndex] || '';

  return (
    <div className="sarva-dashboard space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div
        className="sarva-dashboard-hero sarva-animate-rise relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/20 via-cyan-500/10 to-transparent p-5 sm:p-6 lg:p-8"
        style={
          activeBackgroundImage
            ? {
                backgroundImage: `linear-gradient(120deg, rgba(2, 6, 23, 0.84), rgba(15, 23, 42, 0.78), rgba(8, 47, 73, 0.58)), url("${activeBackgroundImage}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div className="pointer-events-none absolute -right-20 -top-16 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl lg:h-60 lg:w-60" />
        <div className="pointer-events-none absolute -bottom-24 left-20 h-44 w-44 rounded-full bg-cyan-500/20 blur-3xl lg:h-60 lg:w-60" />
        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-3">
              {homeLogo ? (
                <img
                  src={homeLogo}
                  alt="Business logo"
                  className="h-20 w-20 rounded-lg border border-white/20 bg-white/10 object-contain p-2 sm:h-24 sm:w-24"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-xl font-bold text-indigo-100 sm:h-24 sm:w-24">
                  {String(brandName || 'S').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">Welcome Back</p>
                <p className="text-sm font-semibold text-indigo-100">{brandName}</p>
              </div>
            </div>
            <h2 className="mt-2 text-3xl font-bold text-white">Hello, {user.firstName}</h2>
            <p className="mt-2 text-sm text-gray-200">
              <span className="font-semibold text-white">{user.businessName || 'Your Business'}</span> dashboard overview.
            </p>
            <p className="mt-1 text-xs text-gray-300">
              Role: <span className="font-semibold text-white">{roleLabel}</span> | Access: <span className="font-semibold text-white">{allowedPagesCount}</span> pages
            </p>
          </div>
          <div className="sarva-animate-rise w-full rounded-xl border border-white/10 bg-black/20 p-4 sm:max-w-sm lg:ml-auto" style={{ animationDelay: '90ms' }}>
            <p className="text-xs uppercase tracking-[0.16em] text-gray-300">Today</p>
            <p className="mt-1 text-lg font-semibold text-white">{todayLabel}</p>
            <p className="text-sm text-gray-300">{timeLabel}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-[11px] text-gray-400">Today's Sales</p>
                <p className="text-sm font-semibold text-emerald-300">
                  {todaySales !== null ? formatCurrency(todaySales) : 'Loading...'}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <p className="text-[11px] text-gray-400">Quick Actions</p>
                <p className="text-sm font-semibold text-indigo-200">{quickActions.length}</p>
              </div>
            </div>
            {homeBackgrounds.length > 1 ? (
              <div className="mt-4 flex items-center gap-2">
                {homeBackgrounds.map((_, index) => (
                  <button
                    key={`hero-bg-${index}`}
                    type="button"
                    onClick={() => setActiveBackgroundIndex(index)}
                    className={`h-2.5 rounded-full transition ${
                      index === activeBackgroundIndex ? 'w-8 bg-cyan-300' : 'w-2.5 bg-white/35 hover:bg-white/60'
                    }`}
                    title={`Show background ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sarva-animate-rise rounded-xl border border-white/10 bg-white/5 p-4" style={{ animationDelay: '130ms' }}>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {quickActions.map((card, quickIndex) => (
            <button
              key={card.path}
              type="button"
              onClick={() => navigate(card.path)}
              className={`sarva-animate-rise rounded-lg border border-white/10 bg-gradient-to-br ${card.accent} p-3 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_12px_28px_rgba(2,6,23,0.35)]`}
              style={{ animationDelay: `${180 + quickIndex * 45}ms` }}
            >
              <p className="text-sm font-semibold text-white">{card.icon} {card.title}</p>
              <p className="mt-1 text-xs text-gray-300 line-clamp-2">{card.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {(eventReminders.length > 0 || eventPaymentsDue.length > 0 || membershipExpiring.length > 0) && (
        <div className="sarva-animate-rise rounded-xl border border-amber-500/20 bg-amber-500/5 p-4" style={{ animationDelay: '220ms' }}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-amber-200">Reminders</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-300">Upcoming Events (5 days)</p>
              <p className="mt-1 text-2xl font-semibold text-white">{eventReminders.length}</p>
              <button
                type="button"
                onClick={() => navigate('/events')}
                className="mt-2 rounded bg-indigo-500/20 px-2 py-1 text-xs text-indigo-200 hover:bg-indigo-500/30"
              >
                Open Event Calendar
              </button>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-300">Event Payments Pending</p>
              <p className="mt-1 text-2xl font-semibold text-amber-300">{eventPaymentsDue.length}</p>
              <button
                type="button"
                onClick={() => navigate('/events')}
                className="mt-2 rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/30"
              >
                Collect Payments
              </button>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/10 p-3">
              <p className="text-xs text-gray-300">Membership Expiry Alerts (15 days)</p>
              <p className="mt-1 text-2xl font-semibold text-rose-300">{membershipExpiring.length}</p>
              <button
                type="button"
                onClick={() => navigate('/memberships')}
                className="mt-2 rounded bg-rose-500/20 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/30"
              >
                Review Memberships
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(groupedModules).map(([category, categoryCards], categoryIndex) => (
          <div
            key={category}
            className="sarva-animate-rise rounded-xl border border-white/10 bg-white/5 p-4"
            style={{ animationDelay: `${280 + categoryIndex * 70}ms` }}
          >
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">{category}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {categoryCards.map((card, cardIndex) => (
                <button
                  key={card.path}
                  type="button"
                  onClick={() => navigate(card.path)}
                  className={`sarva-animate-rise rounded-xl border border-white/10 bg-gradient-to-br ${card.accent} p-4 text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_16px_30px_rgba(2,6,23,0.35)]`}
                  style={{ animationDelay: `${320 + categoryIndex * 70 + cardIndex * 30}ms` }}
                >
                  <h4 className="text-lg font-semibold text-white">
                    {card.icon} {card.title}
                  </h4>
                  <p className="mt-2 text-sm text-gray-200">{card.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sarva-animate-rise rounded-xl border border-white/10 bg-white/5 p-4" style={{ animationDelay: '420ms' }}>
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">Recommended Next Steps</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
          <button
            type="button"
            onClick={() => permissions.sales && navigate('/sales-dashboard')}
            className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-left text-sm text-gray-200 transition duration-300 hover:-translate-y-0.5 hover:bg-white/10"
          >
            Start billing from <span className="font-semibold text-white">Sales Dashboard</span>.
          </button>
          <button
            type="button"
            onClick={() => permissions.reports && navigate('/reports')}
            className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-left text-sm text-gray-200 transition duration-300 hover:-translate-y-0.5 hover:bg-white/10"
          >
            Review performance in <span className="font-semibold text-white">Reports</span>.
          </button>
          <button
            type="button"
            onClick={() => permissions.inventory && navigate('/inventory')}
            className="rounded-md border border-white/10 bg-black/10 px-3 py-2 text-left text-sm text-gray-200 transition duration-300 hover:-translate-y-0.5 hover:bg-white/10"
          >
            Check stock status in <span className="font-semibold text-white">Inventory</span>.
          </button>
        </div>
      </div>
    </div>
  );
};

const AccessDenied: React.FC = () => (
  <div className="mx-auto max-w-3xl px-4 py-16 text-center">
    <h1 className="text-2xl font-bold text-white">Access Denied</h1>
    <p className="mt-2 text-gray-300">Your role does not have access to any pages right now. Contact an administrator.</p>
  </div>
);

const CompanyCreateAdminPage: React.FC<{ token: string; requiresAccessKey: boolean }> = ({ token, requiresAccessKey }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessKey, setAccessKey] = useState('');

  const inputClass =
    'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-400';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await fetchApiJson(apiUrl('/api/auth/company-creation'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          businessName: businessName.trim(),
          tenantSlug: tenantSlug.trim() || undefined,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          accessKey: requiresAccessKey ? accessKey : undefined,
        }),
      });

      setSuccess('Company created successfully.');
      setBusinessName('');
      setTenantSlug('');
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setAccessKey('');
    } catch (submitError) {
      setError(String((submitError as Error)?.message || submitError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 sm:p-6">
        <h1 className="text-2xl font-bold text-white">Create Company</h1>
        <p className="mt-1 text-sm text-gray-300">
          Backend-controlled onboarding. Only users with admin settings access can use this screen.
        </p>
        <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            className={inputClass}
            placeholder="Company Name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
          />
          <input
            className={inputClass}
            placeholder="Tenant Slug (optional)"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
          />
          <input
            className={inputClass}
            placeholder="Owner First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <input
            className={inputClass}
            placeholder="Owner Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
          <input
            type="email"
            className={inputClass}
            placeholder="Owner Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className={inputClass}
            placeholder="Owner Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {requiresAccessKey && (
            <input
              type="password"
              className={inputClass}
              placeholder="Company Creation Access Key"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              required
            />
          )}
          <div className="md:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
            >
              {loading ? 'Creating...' : 'Create Company'}
            </button>
            {success && <span className="text-sm text-emerald-300">{success}</span>}
            {error && <span className="text-sm text-rose-300">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
};

const SHORTCUT_PANEL_STORAGE_KEY = 'sarva_shortcuts_panel_open';

const GlobalShortcutsPanel: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState<boolean>(() => localStorage.getItem(SHORTCUT_PANEL_STORAGE_KEY) !== '0');
  const isSalesPage = location.pathname === '/sales';

  useEffect(() => {
    localStorage.setItem(SHORTCUT_PANEL_STORAGE_KEY, open ? '1' : '0');
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = String(target?.tagName || '').toLowerCase();
      const isTypingTarget =
        tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable);

      const key = String(event.key || '').toLowerCase();
      if (!isTypingTarget && (event.key === '?' || (event.ctrlKey && key === '/'))) {
        event.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-3 right-3 z-40 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-black/80"
        title="Show keyboard shortcuts"
      >
        Shortcuts
      </button>
      {open && (
        <div className="fixed bottom-12 right-3 z-40 w-64 rounded-lg border border-cyan-400/25 bg-slate-950/90 p-3 text-[11px] text-gray-200 shadow-xl backdrop-blur">
          <p className="mb-2 font-semibold text-cyan-200">Keyboard Shortcuts</p>
          <div className="space-y-1">
            <p><span className="text-white">?</span> Toggle shortcuts panel</p>
            <p><span className="text-white">Esc</span> Close shortcuts panel</p>
            {isSalesPage ? (
              <>
                <p><span className="text-white">Ctrl + K</span> Focus product search</p>
                <p><span className="text-white">/</span> Focus product search</p>
                <p><span className="text-white">F2</span> Toggle product views</p>
                <p><span className="text-white">Ctrl + Enter</span> Create/Save invoice</p>
                <p><span className="text-white">Ctrl + S / F9</span> Create/Save invoice</p>
                <p><span className="text-white">Alt + 1/2/3/4</span> Cash/Card/UPI/Bank</p>
                <p><span className="text-white">Alt + P / Alt + D</span> Post / Draft</p>
                <p><span className="text-white">Alt + G / Alt + N</span> GST / Non-GST</p>
              </>
            ) : (
              <p className="text-gray-300">Open <span className="text-white">Sales</span> page for billing shortcuts.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberCredentials, setRememberCredentials] = useState(false);
  const [tenantSlug, setTenantSlug] = useState('');
  const [pendingOtpChallengeId, setPendingOtpChallengeId] = useState('');
  const [pendingOtpEmail, setPendingOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [companyCreationConfig, setCompanyCreationConfig] = useState<CompanyCreationConfig>({
    enabled: false,
    requiresAccessKey: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState<Partial<IUser> | null>(null);
  const [token, setToken] = useState('');
  const [todaySales, setTodaySales] = useState<number | null>(null);
  const [headerBrandName, setHeaderBrandName] = useState('Sarva');
  const [headerBrandLogo, setHeaderBrandLogo] = useState('');
  const [headerUiPreferences, setHeaderUiPreferences] = useState<ResolvedUiPreferences>(() => readUiPreferencesFromStorage());
  const headerUiPreferencesRef = useRef<ResolvedUiPreferences>(headerUiPreferences);
  const loginFormRef = useRef<HTMLFormElement | null>(null);

  const permissions = useMemo(
    () => withDefaultPermissions((user?.permissions as PermissionMatrix | undefined) || undefined),
    [user]
  );
  const hasProductWorkspaceAccess = permissions.products || permissions.sales;
  const hasCustomerCrmAccess = permissions.customers || permissions.sales;
  const hasEventQuotationAccess = permissions['event-quotations'] || permissions.facilities;
  const hasEventWorkspaceAccess = permissions.facilities || permissions['event-quotations'];

  const fallbackPath = useMemo(() => {
    const firstAllowed = orderedPages.find((page) => permissions[page]);
    return firstAllowed ? PAGE_META[firstAllowed].path : '/forbidden';
  }, [permissions]);

  const syncGeneralSettingsFromServer = async (activeToken: string) => {
    try {
      await loadGeneralSettingsFromServer(activeToken, { force: true });
      window.dispatchEvent(new Event('sarva-settings-updated'));
    } catch {
      // keep existing local settings if server shared settings are unavailable
    }
  };

  const syncUiPreferencesFromServer = async () => {
    try {
      const serverPreferences = await loadUiPreferencesFromServer();
      if (!serverPreferences) return;
      applyAndPersistUiPreferencesLocal(serverPreferences);
    } catch {
      // keep local values if server sync is unavailable
    }
  };

  const syncClientSettingsFromServer = async (activeToken: string) => {
    await Promise.allSettled([
      syncGeneralSettingsFromServer(activeToken),
      syncUiPreferencesFromServer(),
    ]);
  };

  const setAndSyncHeaderUiPreferences = (next: ResolvedUiPreferences, persistRemote = true) => {
    const normalized = applyAndPersistUiPreferencesLocal(next);
    setHeaderUiPreferences(normalized);
    headerUiPreferencesRef.current = normalized;

    if (!persistRemote) return;

    void saveUiPreferencesToServer(normalized)
      .then((saved) => {
        if (!saved) return;
        const synced = applyAndPersistUiPreferencesLocal(saved);
        setHeaderUiPreferences(synced);
        headerUiPreferencesRef.current = synced;
      })
      .catch(() => {
        // ignore remote save failures
      });
  };

  const clearPendingLoginOtp = () => {
    setPendingOtpChallengeId('');
    setPendingOtpEmail('');
    setOtpCode('');
  };

  const startPendingLoginOtp = (data: any) => {
    setPendingOtpChallengeId(String(data?.otpChallengeId || ''));
    setPendingOtpEmail(String(data?.otpEmail || ''));
    setOtpCode('');
    setError('');
    setSuccess(String(data?.message || 'OTP sent to your email address.'));
    window.history.replaceState({}, '', '/login');
  };

  const finalizeLogin = async (sessionToken: string, sessionUser: Partial<IUser>) => {
    localStorage.setItem('token', sessionToken);
    setToken(sessionToken);
    setUser(sessionUser);
    clearPendingLoginOtp();
    await syncClientSettingsFromServer(sessionToken);
    window.history.replaceState({}, '', '/');
    setIsLoggedIn(true);
  };

  const reloadMe = async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) return;

    const data = await fetchApiJson(apiUrl('/api/auth/me'), {
      headers: {
        Authorization: `Bearer ${storedToken}`,
      },
    });
    setUser(data.user);
    setToken(storedToken);
    await syncClientSettingsFromServer(storedToken);
    setIsLoggedIn(true);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          await reloadMe();
          return;
        } catch (authError) {
          localStorage.removeItem('token');
          console.error('Auth check failed:', authError);
        }
      }

      try {
        const saved = readSavedCredentials();
        if (!saved) return;
        setRememberCredentials(true);
        setEmail(saved.email);
        setPassword(saved.password);
        setTenantSlug(String(saved.tenantSlug || ''));

        const data = await fetchApiJson(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: saved.email,
            password: saved.password,
            tenantSlug: String(saved.tenantSlug || '').trim() || undefined,
          }),
        });

        if (data?.otpRequired) {
          startPendingLoginOtp(data);
          return;
        }

        await finalizeLogin(data.token, data.user);
        setEmail('');
        setPassword('');
        setError('');
      } catch (savedLoginError) {
        clearSavedCredentials();
        setRememberCredentials(false);
        console.error('Saved credential auto-login failed:', savedLoginError);
      }
    };
    void checkAuth();
  }, []);

  useEffect(() => {
    const loadCompanyCreationConfig = async () => {
      try {
        const data = await fetchApiJson(apiUrl('/api/auth/company-creation/config'));
        setCompanyCreationConfig({
          enabled: Boolean(data?.enabled),
          requiresAccessKey: Boolean(data?.requiresAccessKey),
        });
      } catch {
        setCompanyCreationConfig({ enabled: false, requiresAccessKey: false });
      }
    };
    void loadCompanyCreationConfig();
  }, []);

  useEffect(() => {
    const cleanup = initializeAutoTooltips();
    return () => cleanup();
  }, []);

  useEffect(() => {
    headerUiPreferencesRef.current = headerUiPreferences;
  }, [headerUiPreferences]);

  useEffect(() => {
    const refreshHeaderBrand = () => {
      const settings = getGeneralSettings();
      const name = settings.business.tradeName || settings.business.legalName || user?.businessName || 'Sarva';
      const logo = resolveGeneralSettingsAssetUrl(
        settings.business.reportLogoDataUrl || settings.business.invoiceLogoDataUrl || ''
      );
      setHeaderBrandName(name);
      setHeaderBrandLogo(logo);
    };

    refreshHeaderBrand();
    window.addEventListener('storage', refreshHeaderBrand);
    window.addEventListener('sarva-settings-updated', refreshHeaderBrand as EventListener);
    return () => {
      window.removeEventListener('storage', refreshHeaderBrand);
      window.removeEventListener('sarva-settings-updated', refreshHeaderBrand as EventListener);
    };
  }, [user?.businessName]);

  useEffect(() => {
    const localPreferences = readUiPreferencesFromStorage();
    const initialPreferences = user?.uiPreferences
      ? normalizeUiPreferences(user.uiPreferences)
      : localPreferences;
    setAndSyncHeaderUiPreferences(initialPreferences, false);

    const loadServerPreferences = async () => {
      try {
        const serverPreferences = await loadUiPreferencesFromServer();
        if (!serverPreferences) return;
        setAndSyncHeaderUiPreferences(serverPreferences, false);
      } catch {
        // ignore preference fetch failures
      }
    };
    void loadServerPreferences();
  }, [user?._id]);

  useEffect(() => {
    const onPreferencesUpdate = (event: Event) => {
      const detail = (event as CustomEvent<ResolvedUiPreferences>).detail;
      if (!detail) return;
      const normalized = normalizeUiPreferences(detail);
      setHeaderUiPreferences(normalized);
      headerUiPreferencesRef.current = normalized;
    };

    window.addEventListener(UI_PREFERENCES_UPDATED_EVENT, onPreferencesUpdate as EventListener);
    return () => {
      window.removeEventListener(UI_PREFERENCES_UPDATED_EVENT, onPreferencesUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (isLoggedIn) return;
    const form = loginFormRef.current;
    if (!form) return;

    // Defensive: keep login controls interactive even if stale attributes get injected.
    const controls = form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button');
    controls.forEach((control) => {
      control.disabled = false;
      if (control instanceof HTMLInputElement) {
        control.readOnly = false;
      }
      control.removeAttribute('disabled');
      control.removeAttribute('readonly');
      control.style.pointerEvents = 'auto';
      control.style.opacity = '1';
    });
  }, [isLoggedIn, loading]);

  useEffect(() => {
    if (isLoggedIn) return;
    // Defensive cleanup for any stale modal backdrops that may block login interaction.
    const containers = document.querySelectorAll<HTMLElement>('.swal2-container, .modal-backdrop');
    containers.forEach((container) => {
      const popup = container.querySelector<HTMLElement>('.swal2-popup');
      const popupVisible =
        !!popup && popup.offsetParent !== null && !popup.classList.contains('swal2-hide');
      if (!popupVisible) {
        container.remove();
      }
    });
  }, [isLoggedIn, loading]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;

    if (!isLoggedIn) {
      html.classList.add('sarva-login-unlocked');
      body.classList.add('sarva-login-unlocked');
      html.style.pointerEvents = 'auto';
      body.style.pointerEvents = 'auto';
      html.style.opacity = '1';
      body.style.opacity = '1';
      html.style.filter = 'none';
      body.style.filter = 'none';
      body.style.removeProperty('inert');
      body.removeAttribute('inert');
      body.removeAttribute('aria-hidden');
      return;
    }

    html.classList.remove('sarva-login-unlocked');
    body.classList.remove('sarva-login-unlocked');
  }, [isLoggedIn]);

  useEffect(() => {
    if (!loading) return;
    // Safety reset so the login form does not stay blocked on network hangs.
    const timer = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (isLoggedIn && token && permissions.sales) {
      const fetchTodaySales = async () => {
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          const data = await fetchApiJson(
            apiUrl(`/api/sales/analytics/summary?startDate=${today.toISOString()}&endDate=${tomorrow.toISOString()}`),
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          setTodaySales(data.data.summary.totalSales);
        } catch (fetchError) {
          console.error(fetchError);
        }
      };
      fetchTodaySales();
      return;
    }

    setTodaySales(null);
  }, [isLoggedIn, permissions.sales, token]);

  useEffect(() => {
    if (!isLoggedIn || !token) return;

    const syncNow = () => {
      void syncClientSettingsFromServer(token);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncNow();
    };

    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(syncNow, 90_000);

    return () => {
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [isLoggedIn, token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      const data = await fetchApiJson(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          tenantSlug: tenantSlug.trim() || undefined,
        }),
      });

      if (data?.otpRequired) {
        if (!rememberCredentials) {
          clearSavedCredentials();
        }
        startPendingLoginOtp(data);
        return;
      }

      if (rememberCredentials) {
        writeSavedCredentials(email, password, tenantSlug);
      } else {
        clearSavedCredentials();
      }
      await finalizeLogin(data.token, data.user);
      setEmail('');
      setPassword('');
      setTenantSlug('');
      setError('');
    } catch (err) {
      setError(String((err as Error)?.message || err));
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !pendingOtpChallengeId) return;

    setLoading(true);
    setError('');

    try {
      const data = await fetchApiJson(apiUrl('/api/auth/verify-login-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challengeId: pendingOtpChallengeId,
          otp: otpCode.trim(),
        }),
      });

      if (rememberCredentials) {
        writeSavedCredentials(email, password, tenantSlug);
      } else {
        clearSavedCredentials();
      }

      await finalizeLogin(data.token, data.user);
      setEmail('');
      setPassword('');
      setTenantSlug('');
      setError('');
      setSuccess('');
    } catch (err) {
      setError(String((err as Error)?.message || err));
      console.error('OTP verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendLoginOtp = async () => {
    if (loading || !pendingOtpChallengeId) return;

    setLoading(true);
    setError('');

    try {
      const data = await fetchApiJson(apiUrl('/api/auth/resend-login-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          challengeId: pendingOtpChallengeId,
        }),
      });

      setPendingOtpChallengeId(String(data?.otpChallengeId || pendingOtpChallengeId));
      setPendingOtpEmail(String(data?.otpEmail || pendingOtpEmail));
      setOtpCode('');
      setSuccess(String(data?.message || 'OTP sent to your email address.'));
    } catch (err) {
      setError(String((err as Error)?.message || err));
      console.error('OTP resend error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOtpLogin = () => {
    clearPendingLoginOtp();
    setError('');
    setSuccess('');
  };

  const handleLogout = async () => {
    const activeToken = token || localStorage.getItem('token');
    if (activeToken) {
      try {
        await fetchApiJson(apiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });
      } catch (logoutError) {
        console.error('Logout audit failed:', logoutError);
      }
    }

    localStorage.removeItem('token');
    clearSavedCredentials();
    setIsLoggedIn(false);
    setUser(null);
    setToken('');
    setEmail('');
    setPassword('');
    setTenantSlug('');
    setShowPassword(false);
    setRememberCredentials(false);
    setSuccess('');
    clearPendingLoginOtp();
  };

  const updateThemeMode = (themeMode: 'dark' | 'light') => {
    setAndSyncHeaderUiPreferences({
      ...headerUiPreferencesRef.current,
      themeMode,
    });
  };

  const bumpFontScale = (direction: 1 | -1) => {
    setAndSyncHeaderUiPreferences({
      ...headerUiPreferencesRef.current,
      fontScale: clampFontScale(headerUiPreferencesRef.current.fontScale + direction * FONT_SCALE_STEP),
    });
  };

  const publicLoginForm = (
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Client Login</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Sign in to your Sarva workspace</h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Use your email, password, and tenant or company identifier to enter the correct client environment.
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
          Secure Access
        </span>
      </div>

      <form ref={loginFormRef} onSubmit={pendingOtpChallengeId ? handleVerifyLoginOtp : handleLogin} className="mt-6 space-y-4">
        {pendingOtpChallengeId ? (
          <>
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              Enter the OTP sent to <span className="font-semibold text-white">{pendingOtpEmail || email}</span> to finish login.
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              required
              className="pointer-events-auto opacity-100 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              disabled={false}
              readOnly={false}
              className="pointer-events-auto opacity-100 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <input
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase())}
              placeholder="Company or tenant id"
              className="pointer-events-auto opacity-100 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />

            <div className="space-y-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                disabled={false}
                readOnly={false}
                className="pointer-events-auto opacity-100 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  disabled={false}
                  className="pointer-events-auto opacity-100 h-4 w-4 rounded border-white/20 bg-white/5 accent-cyan-500"
                />
                Show password
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberCredentials}
                  onChange={(e) => setRememberCredentials(e.target.checked)}
                  disabled={false}
                  className="pointer-events-auto opacity-100 h-4 w-4 rounded border-white/20 bg-white/5 accent-cyan-500"
                />
                Keep me signed in for 7 days
              </label>
            </div>
          </>
        )}

        {error ? <div className="rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>
        ) : null}

        {pendingOtpChallengeId ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="submit"
              disabled={false}
              className="pointer-events-auto opacity-100 w-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:from-cyan-400 hover:to-emerald-400"
            >
              {loading ? 'Please wait...' : 'Verify OTP'}
            </button>
            <button
              type="button"
              onClick={() => void handleResendLoginOtp()}
              className="pointer-events-auto opacity-100 w-full rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Resend OTP
            </button>
            <button
              type="button"
              onClick={handleCancelOtpLogin}
              className="pointer-events-auto opacity-100 w-full rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={false}
              className="pointer-events-auto opacity-100 w-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:from-cyan-400 hover:to-emerald-400"
            >
              {loading ? 'Please wait...' : 'Login'}
            </button>
            <a
              href="/user-manual"
              className="pointer-events-auto flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              User Manual
            </a>
          </div>
        )}
        {loading ? (
          <button
            type="button"
            onClick={() => setLoading(false)}
            className="w-full rounded-full border border-white/20 bg-transparent px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 hover:bg-white/10"
          >
            Reset Login Form
          </button>
        ) : null}
      </form>
    </section>
  );
  return (
    <BrowserRouter>
      {isLoggedIn && user ? (
        <div className="sarva-shell min-h-screen bg-transparent flex flex-col">
          <header className="hidden lg:flex items-center justify-between gap-4 border-b border-white/8 bg-slate-950/95 px-5 py-3 shadow-[0_18px_42px_rgba(2,6,23,0.18)] backdrop-blur-xl">
            <div className="min-w-0 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {headerBrandLogo ? (
                  <img src={headerBrandLogo} alt="Brand logo" className="h-7 w-7 object-contain" />
                ) : (
                  <span className="text-sm font-bold text-white">{String(headerBrandName || 'S').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <p className="truncate text-sm font-semibold text-white">{headerBrandName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="Decrease text size so more content fits on the screen"
                aria-label="Decrease text size"
                onClick={() => bumpFontScale(-1)}
                className={headerIconButtonClass}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 5h8M8 5v10" strokeLinecap="round" />
                  <path d="M5.5 15.5 8 9l2.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 15h3" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                title="Increase text size for easier reading"
                aria-label="Increase text size"
                onClick={() => bumpFontScale(1)}
                className={headerIconButtonClass}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 5h8M8 5v10" strokeLinecap="round" />
                  <path d="M5.5 15.5 8 9l2.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 15h3M14 13.5v3" strokeLinecap="round" />
                </svg>
              </button>
              <a
                href="/user-manual"
                title="Open the user manual and screen-by-screen help"
                aria-label="Open user manual"
                className={headerIconButtonClass}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M8.85 8.05a1.5 1.5 0 0 1 2.52 1.34c-.17.74-.92 1.1-1.37 1.6-.28.31-.41.63-.41 1.26" strokeLinecap="round" />
                  <circle cx="10" cy="14.3" r=".7" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <button
                type="button"
                title="Switch to dark mode"
                aria-label="Switch to dark mode"
                onClick={() => updateThemeMode('dark')}
                className={`${headerIconButtonClass} ${headerUiPreferences.themeMode === 'dark' ? 'border-sky-400/30 bg-sky-500/15 text-white' : ''}`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M13.8 2.8a6.6 6.6 0 1 0 3.4 11.9A7.4 7.4 0 0 1 13.8 2.8Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                title="Switch to light mode"
                aria-label="Switch to light mode"
                onClick={() => updateThemeMode('light')}
                className={`${headerIconButtonClass} ${headerUiPreferences.themeMode === 'light' ? 'border-amber-400/30 bg-amber-500/15 text-amber-100' : ''}`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="3.2" />
                  <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" strokeLinecap="round" />
                </svg>
              </button>
              <button
                type="button"
                title="Logout from the application"
                aria-label="Logout"
                onClick={handleLogout}
                className={`${headerIconButtonClass} border-rose-400/20 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M7.5 3.5h-2A1.5 1.5 0 0 0 4 5v10a1.5 1.5 0 0 0 1.5 1.5h2" strokeLinecap="round" />
                  <path d="M11.5 6.5 15 10l-3.5 3.5M8 10h7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 lg:flex">
            <Navbar
              onLogout={handleLogout}
              user={user}
              permissions={permissions}
              showCompanyCreationMenu={Boolean(companyCreationConfig.enabled && permissions.settings)}
            />

            <div className="min-w-0 flex-1">
              <Routes>
              <Route
                path="/"
                element={
                  permissions.dashboard ? (
                    <ModernHomeDashboard user={user} todaySales={todaySales} permissions={permissions} />
                  ) : (
                    <Navigate to={fallbackPath} replace />
                  )
                }
              />

              <Route path="/sales-dashboard" element={permissions['sales-dashboard'] ? <SalesDashboard permissions={permissions} /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/inventory" element={permissions.inventory ? <Inventory /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/inventory/procurement" element={permissions.inventory ? <Procurement /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/sales" element={permissions.sales ? <Sales /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/sales/quotes" element={permissions.sales ? <Quotations /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/customers" element={hasCustomerCrmAccess ? <Customers /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/orders" element={permissions.orders ? <Orders /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/products" element={hasProductWorkspaceAccess ? <ProductCenter /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/products/catalog" element={hasProductWorkspaceAccess ? <ProductList /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/products/alerts" element={hasProductWorkspaceAccess ? <ProductAlerts /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/products/add" element={<Navigate to="/products/entry" replace />} />
              <Route path="/products/entry" element={hasProductWorkspaceAccess ? <AddProduct /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/products/edit/:id" element={hasProductWorkspaceAccess ? <EditProduct /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/returns" element={permissions.returns ? <Returns /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/categories" element={permissions.categories ? <Categories /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/settings" element={permissions.settings ? <Settings /> : <Navigate to={fallbackPath} replace />} />
              <Route
                path="/admin/company-create"
                element={
                  permissions.settings && companyCreationConfig.enabled ? (
                    <CompanyCreateAdminPage token={token} requiresAccessKey={companyCreationConfig.requiresAccessKey} />
                  ) : (
                    <Navigate to={fallbackPath} replace />
                  )
                }
              />
              <Route path="/accounting" element={permissions.accounting ? <Accounting /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/accounting/settlements" element={permissions.accounting ? <SettlementCenter /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/reports" element={permissions.reports ? <Reports /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/help" element={<Navigate to="/user-manual" replace />} />
              <Route path="/user-manual" element={<HelpCenter />} />
              <Route path="/employees" element={permissions.employees ? <Employees /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/attendance/reports" element={permissions.attendance ? <AttendanceReports /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/attendance" element={permissions.attendance ? <Attendance currentUserRole={user.role as string | undefined} /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/attendance/self" element={permissions['employee-attendance'] ? <EmployeeAttendance /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/shifts" element={permissions.shifts ? <Shifts /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/payroll" element={permissions.payroll ? <Payroll /> : <Navigate to={fallbackPath} replace />} />
              <Route
                path="/events"
                element={
                  hasEventWorkspaceAccess ? (
                    <EventManagement
                      initialView="bookings"
                      canManageBookings={permissions.facilities}
                      canManageQuotations={hasEventQuotationAccess}
                    />
                  ) : (
                    <Navigate to={fallbackPath} replace />
                  )
                }
              />
              <Route
                path="/events/quotations"
                element={
                  hasEventWorkspaceAccess ? (
                    <EventManagement
                      initialView="quotations"
                      canManageBookings={permissions.facilities}
                      canManageQuotations={hasEventQuotationAccess}
                    />
                  ) : (
                    <Navigate to={fallbackPath} replace />
                  )
                }
              />
              <Route path="/facilities" element={permissions.facilities ? <Facilities /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/facilities/setup" element={permissions.facilities ? <FacilitySetup /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/memberships" element={permissions.memberships ? <Memberships /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/membership-plans/create" element={permissions.memberships ? <Memberships mode="plan" /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/membership-subscriptions/create" element={permissions.memberships ? <Memberships mode="member-create" /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/membership-reports" element={permissions.memberships ? <MembershipReports /> : <Navigate to={fallbackPath} replace />} />
              <Route
                path="/user-management"
                element={permissions['user-management'] ? <UserManagement onReloadMe={reloadMe} /> : <Navigate to={fallbackPath} replace />}
              />
              <Route path="/admin/reports" element={permissions['admin-reports'] ? <AdminReports /> : <Navigate to={fallbackPath} replace />} />
              <Route path="/forbidden" element={<AccessDenied />} />
              <Route path="*" element={<Navigate to={fallbackPath} replace />} />
              </Routes>
              <GlobalShortcutsPanel />
            </div>
          </div>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/about" element={<PublicAboutPage />} />
          <Route path="/contact" element={<PublicContactPage />} />
          <Route path="/login" element={<PublicLoginPage>{publicLoginForm}</PublicLoginPage>} />
          <Route path="/help" element={<Navigate to="/user-manual" replace />} />
          <Route path="/user-manual" element={<HelpCenter isPublic />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default App;
