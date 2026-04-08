import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { IUser } from '@shared/types';
import { PageKey, PermissionMatrix } from '@shared/rbac';
import { getGeneralSettings, resolveGeneralSettingsAssetUrl } from '../utils/generalSettings';
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
} from '../utils/uiPreferences';

interface NavbarProps {
  user: Partial<IUser> | null;
  permissions: PermissionMatrix;
  onLogout: () => void;
  showCompanyCreationMenu?: boolean;
}

type MenuCategory = 'Home' | 'Sales' | 'Catalog' | 'People' | 'Operations' | 'Accounts' | 'Admin';
type SearchableMenuItem = {
  path: string;
  name: string;
  icon: string;
  categories: MenuCategory[];
};

const menuItems = [
  { key: 'dashboard' as PageKey, name: 'Dashboard', path: '/', category: 'Home' as MenuCategory, icon: '🏠' },
  { key: 'sales-dashboard' as PageKey, name: 'Sales', path: '/sales-dashboard', category: 'Sales' as MenuCategory, icon: '💰' },
  { key: 'orders' as PageKey, name: 'Orders', path: '/orders', category: 'Sales' as MenuCategory, icon: '📄' },
  { key: 'sales' as PageKey, name: 'Quotations', path: '/sales/quotes', category: 'Sales' as MenuCategory, icon: '🧾' },
  { key: 'returns' as PageKey, name: 'Returns', path: '/returns', category: 'Sales' as MenuCategory, icon: '↩️' },
  { key: 'reports' as PageKey, name: 'Reports', path: '/reports', category: 'Sales' as MenuCategory, icon: '📈' },
  { key: 'sales' as PageKey, name: 'Customers', path: '/customers', category: 'Sales' as MenuCategory, icon: '🧑' },
  { key: 'sales' as PageKey, name: 'Product Entry', path: '/products/entry', category: 'Sales' as MenuCategory, icon: '➕' },
  { key: 'sales' as PageKey, name: 'Product Catalog', path: '/products/catalog', category: 'Sales' as MenuCategory, icon: '📦' },
  { key: 'sales' as PageKey, name: 'Stock Alerts', path: '/products/alerts', category: 'Sales' as MenuCategory, icon: '🚨' },
  { key: 'products' as PageKey, name: 'Products', path: '/products', category: 'Catalog' as MenuCategory, icon: '📦' },
  { key: 'products' as PageKey, name: 'Product Entry', path: '/products/entry', category: 'Catalog' as MenuCategory, icon: '➕' },
  { key: 'products' as PageKey, name: 'Product Catalog', path: '/products/catalog', category: 'Catalog' as MenuCategory, icon: '🗃️' },
  { key: 'products' as PageKey, name: 'Stock Alerts', path: '/products/alerts', category: 'Catalog' as MenuCategory, icon: '🚨' },
  { key: 'inventory' as PageKey, name: 'Procurement', path: '/inventory/procurement', category: 'Catalog' as MenuCategory, icon: '🚚' },
  { key: 'categories' as PageKey, name: 'Categories', path: '/categories', category: 'Catalog' as MenuCategory, icon: '🗂️' },
  { key: 'employees' as PageKey, name: 'Employees', path: '/employees', category: 'People' as MenuCategory, icon: '👥' },
  { key: 'attendance' as PageKey, name: 'Attendance', path: '/attendance', category: 'People' as MenuCategory, icon: '🕒' },
  { key: 'shifts' as PageKey, name: 'Shifts', path: '/shifts', category: 'People' as MenuCategory, icon: '🗓️' },
  { key: 'payroll' as PageKey, name: 'Payroll', path: '/payroll', category: 'People' as MenuCategory, icon: '🧾' },
  { key: 'facilities' as PageKey, name: 'Facility Setup', path: '/facilities/setup', category: 'Operations' as MenuCategory, icon: '🛠️' },
  { key: 'facilities' as PageKey, name: 'Facility Booking', path: '/facilities', category: 'Operations' as MenuCategory, icon: '🏟️' },
  { key: 'facilities' as PageKey, name: 'Event Booking', path: '/events', category: 'Operations' as MenuCategory, icon: '📅' },
  { key: 'memberships' as PageKey, name: 'Create Plan', path: '/membership-plans/create', category: 'Operations' as MenuCategory, icon: '🧩' },
  { key: 'memberships' as PageKey, name: 'Create Subscription', path: '/membership-subscriptions/create', category: 'Operations' as MenuCategory, icon: '📝' },
  { key: 'memberships' as PageKey, name: 'Memberships', path: '/memberships', category: 'Operations' as MenuCategory, icon: '🎫' },
  { key: 'memberships' as PageKey, name: 'Membership Reports', path: '/membership-reports', category: 'Operations' as MenuCategory, icon: '📊' },
  { key: 'accounting' as PageKey, name: 'Accounting', path: '/accounting', category: 'Accounts' as MenuCategory, icon: '📚' },
  { key: 'accounting' as PageKey, name: 'Settlements', path: '/accounting/settlements', category: 'Accounts' as MenuCategory, icon: '💳' },
  { key: 'settings' as PageKey, name: 'Settings', path: '/settings', category: 'Admin' as MenuCategory, icon: '⚙️' },
  { key: 'user-management' as PageKey, name: 'Users', path: '/user-management', category: 'Admin' as MenuCategory, icon: '🛡️' },
];

const pathMatches = (currentPath: string, itemPath: string): boolean => {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
};

export const Navbar: React.FC<NavbarProps> = ({ user, permissions, onLogout, showCompanyCreationMenu = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [desktopCategory, setDesktopCategory] = useState<MenuCategory | null>(null);
  const [isDesktopSubmenuOpen, setIsDesktopSubmenuOpen] = useState(true);
  const [mobileExpandedCategory, setMobileExpandedCategory] = useState<MenuCategory | null>(null);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [isMenuSearchOpen, setIsMenuSearchOpen] = useState(false);
  const [brandName, setBrandName] = useState('Sarva');
  const [brandLogo, setBrandLogo] = useState('');
  const [uiPreferences, setUiPreferences] = useState<ResolvedUiPreferences>(() => readUiPreferencesFromStorage());
  const uiPreferencesRef = useRef<ResolvedUiPreferences>(uiPreferences);
  const menuSearchRef = useRef<HTMLDivElement | null>(null);
  const allowedMenuItems = useMemo(() => {
    const base = menuItems.filter((item) => permissions[item.key]);
    if (showCompanyCreationMenu && permissions.settings) {
      base.push({
        key: 'settings' as PageKey,
        name: 'Company Create',
        path: '/admin/company-create',
        category: 'Admin' as MenuCategory,
        icon: '🏢',
      });
    }
    return base;
  }, [permissions, showCompanyCreationMenu]);
  const themeMode = uiPreferences.themeMode;
  const fontScale = uiPreferences.fontScale;

  const setAndSyncUiPreferences = (next: ResolvedUiPreferences, persistRemote = true) => {
    const normalized = applyAndPersistUiPreferencesLocal(next);
    setUiPreferences(normalized);
    uiPreferencesRef.current = normalized;

    if (!persistRemote) return;
    void saveUiPreferencesToServer(normalized)
      .then((saved) => {
        if (!saved) return;
        const synced = applyAndPersistUiPreferencesLocal(saved);
        setUiPreferences(synced);
        uiPreferencesRef.current = synced;
      })
      .catch(() => {
        // ignore remote preference save failures
      });
  };

  useEffect(() => {
    const refreshBrand = () => {
      const settings = getGeneralSettings();
      const name = settings.business.tradeName || settings.business.legalName || 'Sarva';
      const logo = resolveGeneralSettingsAssetUrl(
        settings.business.reportLogoDataUrl || settings.business.invoiceLogoDataUrl || ''
      );
      setBrandName(name);
      setBrandLogo(logo);
    };

    refreshBrand();
    window.addEventListener('storage', refreshBrand);
    window.addEventListener('sarva-settings-updated', refreshBrand as EventListener);
    return () => {
      window.removeEventListener('storage', refreshBrand);
      window.removeEventListener('sarva-settings-updated', refreshBrand as EventListener);
    };
  }, []);

  useEffect(() => {
    uiPreferencesRef.current = uiPreferences;
  }, [uiPreferences]);

  useEffect(() => {
    const localPreferences = readUiPreferencesFromStorage();
    const initialPreferences = user?.uiPreferences
      ? normalizeUiPreferences(user.uiPreferences)
      : localPreferences;
    setAndSyncUiPreferences(initialPreferences, false);

    const loadServerPreferences = async () => {
      try {
        const serverPreferences = await loadUiPreferencesFromServer();
        if (!serverPreferences) return;
        setAndSyncUiPreferences(serverPreferences, false);
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
      setUiPreferences(normalized);
      uiPreferencesRef.current = normalized;
    };

    window.addEventListener(UI_PREFERENCES_UPDATED_EVENT, onPreferencesUpdate as EventListener);
    return () => {
      window.removeEventListener(UI_PREFERENCES_UPDATED_EVENT, onPreferencesUpdate as EventListener);
    };
  }, []);

  const bumpFont = (direction: 1 | -1) => {
    const next = {
      ...uiPreferencesRef.current,
      fontScale: clampFontScale(uiPreferencesRef.current.fontScale + direction * FONT_SCALE_STEP),
    };
    setAndSyncUiPreferences(next);
  };

  const setTheme = (nextTheme: 'dark' | 'light') => {
    const next = {
      ...uiPreferencesRef.current,
      themeMode: nextTheme,
    };
    setAndSyncUiPreferences(next);
  };

  const categoryOrder: MenuCategory[] = ['Home', 'Sales', 'Catalog', 'People', 'Operations', 'Accounts', 'Admin'];
  const categoryIcons: Record<MenuCategory, string> = {
    Home: '🏠',
    Sales: '💰',
    Catalog: '📦',
    People: '👥',
    Operations: '🏟️',
    Accounts: '📚',
    Admin: '⚙️',
  };
  const categoryStyles: Record<MenuCategory, { button: string; panel: string; label: string }> = {
    Home: {
      button: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20',
      panel: 'from-indigo-500/20 to-indigo-400/5',
      label: 'text-indigo-200',
    },
    Sales: {
      button: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20',
      panel: 'from-emerald-500/20 to-emerald-400/5',
      label: 'text-emerald-200',
    },
    Catalog: {
      button: 'border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20',
      panel: 'from-sky-500/20 to-sky-400/5',
      label: 'text-sky-200',
    },
    People: {
      button: 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
      panel: 'from-amber-500/20 to-amber-400/5',
      label: 'text-amber-200',
    },
    Operations: {
      button: 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20',
      panel: 'from-fuchsia-500/20 to-fuchsia-400/5',
      label: 'text-fuchsia-200',
    },
    Accounts: {
      button: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20',
      panel: 'from-cyan-500/20 to-cyan-400/5',
      label: 'text-cyan-200',
    },
    Admin: {
      button: 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
      panel: 'from-rose-500/20 to-rose-400/5',
      label: 'text-rose-200',
    },
  };

  const groupedMenuItems = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          items: allowedMenuItems.filter((item) => item.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [allowedMenuItems]
  );

  const activeCategory = useMemo(() => {
    const activeItem = allowedMenuItems.find((item) => pathMatches(location.pathname, item.path));
    return activeItem?.category || groupedMenuItems[0]?.category || null;
  }, [allowedMenuItems, groupedMenuItems, location.pathname]);

  const openCategory = useMemo(() => {
    const exists = groupedMenuItems.some((group) => group.category === desktopCategory);
    if (desktopCategory && exists) return desktopCategory;
    return activeCategory;
  }, [activeCategory, desktopCategory, groupedMenuItems]);
  const searchableMenuItems = useMemo(() => {
    const itemsByPath = new Map<string, SearchableMenuItem>();

    allowedMenuItems.forEach((item) => {
      const existing = itemsByPath.get(item.path);
      if (existing) {
        if (!existing.categories.includes(item.category)) {
          existing.categories = [...existing.categories, item.category];
        }
        return;
      }

      itemsByPath.set(item.path, {
        path: item.path,
        name: item.name,
        icon: item.icon,
        categories: [item.category],
      });
    });

    return Array.from(itemsByPath.values());
  }, [allowedMenuItems]);
  const filteredSearchResults = useMemo(() => {
    const query = menuSearchQuery.trim().toLowerCase();
    if (!query) return [];

    return searchableMenuItems
      .filter((item) => {
        const haystack = [item.name, item.path, item.categories.join(' ')]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [menuSearchQuery, searchableMenuItems]);

  const activeGroup = groupedMenuItems.find((group) => group.category === activeCategory) || groupedMenuItems[0];
  const openGroup = groupedMenuItems.find((group) => group.category === openCategory) || groupedMenuItems[0];
  const activeItem = allowedMenuItems.find((item) => pathMatches(location.pathname, item.path));
  const displayName = `${String(user?.firstName || '').trim()} ${String(user?.lastName || '').trim()}`.trim()
    || String(user?.firstName || user?.email || 'Workspace User').trim();
  const roleLabel = String(user?.role || 'user')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  const profileInitial = String(displayName || 'U').charAt(0).toUpperCase();
  const workspaceLabel = activeItem?.name || activeGroup?.category || 'Workspace';
  const menuSearchTooltip =
    'Search pages or tabs by typing part of the name, like Sales, Reports, Payroll, Voucher, or Attendance. Press Enter to open the first match.';

  useEffect(() => {
    setIsDesktopSubmenuOpen(false);
    setDesktopCategory(null);
    setIsMenuSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isOpen) return;
    setMobileExpandedCategory(activeCategory);
  }, [activeCategory, isOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuSearchRef.current?.contains(event.target as Node)) {
        setIsMenuSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  const categoryButtonClass = (category: MenuCategory, selected: boolean) => {
    const base = 'cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition';
    if (selected) return `${base} border-slate-700 bg-white text-slate-950 shadow-[0_10px_30px_rgba(15,23,42,0.28)]`;
    return `${base} border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-white`;
  };

  const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
    `cursor-pointer rounded-xl px-3 py-2 text-sm font-medium transition-all ${
      isActive
        ? 'bg-sky-500 text-white shadow-[0_16px_32px_rgba(14,165,233,0.28)]'
        : 'text-slate-300 hover:-translate-y-0.5 hover:bg-white/5 hover:text-white'
    }`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-sky-500 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const desktopMegaLinkClass = ({ isActive }: { isActive: boolean }) =>
    `cursor-pointer group rounded-2xl border px-4 py-3 text-left transition ${
      isActive
        ? 'border-sky-400/40 bg-sky-500/10 text-white shadow-[0_16px_30px_rgba(14,165,233,0.18)]'
        : 'border-white/10 bg-slate-950/35 text-slate-200 hover:border-white/20 hover:bg-white/[0.05] hover:text-white'
    }`;

  const menuSearchInputClass = 'w-full rounded-2xl border border-white/10 bg-white/[0.04] py-2.5 pl-11 pr-12 text-sm text-white placeholder-slate-500 outline-none transition focus:border-sky-400/40 focus:bg-white/[0.06]';

  const handleDesktopCategoryClick = (category: MenuCategory) => {
    if (category === 'Home') {
      setDesktopCategory(null);
      setIsDesktopSubmenuOpen(false);
      navigate('/');
      return;
    }

    const isSameCategory = category === desktopCategory;
    setDesktopCategory(category);
    setIsDesktopSubmenuOpen(isSameCategory ? !isDesktopSubmenuOpen : true);
  };

  const handleDesktopCategoryHover = (category: MenuCategory) => {
    setDesktopCategory(category);
    if (category === 'Home') {
      setIsDesktopSubmenuOpen(false);
      return;
    }
    setIsDesktopSubmenuOpen(true);
  };

  const handleMobileCategoryToggle = (category: MenuCategory) => {
    setMobileExpandedCategory((current) => (current === category ? null : category));
  };

  const navigateFromSearch = (item: SearchableMenuItem) => {
    setMenuSearchQuery('');
    setIsMenuSearchOpen(false);
    setIsDesktopSubmenuOpen(false);
    setIsOpen(false);
    navigate(item.path);
  };

  return (
    <nav className="sarva-app-nav sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 shadow-[0_18px_42px_rgba(2,6,23,0.22)] backdrop-blur-xl">
      <div className="w-full px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900/80">
                  {brandLogo ? (
                    <img
                      src={brandLogo}
                      alt="Brand logo"
                      className="h-8 w-8 object-contain"
                    />
                  ) : (
                    <span className="text-sm font-bold text-white">{String(brandName || 'S').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{brandName}</p>
                  <p className="truncate text-xs text-slate-400">Application Workspace</p>
                </div>
              </div>

              <div className="hidden xl:flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">
                  {String((activeGroup?.category || 'WS')).slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current Workspace</p>
                  <p className="truncate text-sm font-medium text-slate-100">{workspaceLabel}</p>
                </div>
              </div>
            </div>

            <div className="hidden shrink-0 items-center gap-2 lg:flex">
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  title="Decrease font size"
                  onClick={() => bumpFont(-1)}
                  className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                >
                  a-
                </button>
                <button
                  type="button"
                  title="Increase font size"
                  onClick={() => bumpFont(1)}
                  className="cursor-pointer rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                >
                  A+
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                <button
                  type="button"
                  title="Dark mode"
                  onClick={() => setTheme('dark')}
                  className={`cursor-pointer rounded-xl px-2.5 py-2 text-sm transition ${
                    themeMode === 'dark' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  🌙
                </button>
                <button
                  type="button"
                  title="Light mode"
                  onClick={() => setTheme('light')}
                  className={`cursor-pointer rounded-xl px-2.5 py-2 text-sm transition ${
                    themeMode === 'light' ? 'bg-amber-500/20 text-amber-100' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  ☀️
                </button>
              </div>
              <button
                type="button"
                title="User Manual"
                aria-label="Open user manual"
                onClick={() => navigate('/user-manual')}
                className="cursor-pointer flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-base font-semibold text-slate-100 hover:bg-white/10"
              >
                ?
              </button>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sm font-semibold text-sky-100">
                  {profileInitial}
                </div>
                <div className="min-w-0">
                  <p className="max-w-36 truncate text-sm font-semibold text-white">{displayName}</p>
                  <p className="max-w-36 truncate text-xs text-slate-400">{roleLabel}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="cursor-pointer rounded-xl bg-rose-500/12 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
                >
                  Logout
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen((v) => !v)}
              className="cursor-pointer inline-flex items-center rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10 lg:hidden"
            >
              {isOpen ? 'Close' : 'Menu'}
            </button>
          </div>

          <div className="hidden lg:block">
            <div
              className="space-y-3"
              onMouseLeave={() => {
                setIsDesktopSubmenuOpen(false);
                setDesktopCategory(null);
              }}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
                  {groupedMenuItems.map((group) => (
                    <button
                      key={group.category}
                      type="button"
                      onClick={() => handleDesktopCategoryClick(group.category)}
                      onMouseEnter={() => handleDesktopCategoryHover(group.category)}
                      onFocus={() => handleDesktopCategoryHover(group.category)}
                      aria-expanded={group.category === openCategory ? isDesktopSubmenuOpen : false}
                      aria-controls={`desktop-submenu-${group.category.toLowerCase()}`}
                      className={categoryButtonClass(group.category, group.category === activeCategory)}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{group.category}</span>
                        <span
                          className={`text-[10px] transition-transform ${
                            group.category === openCategory && isDesktopSubmenuOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div ref={menuSearchRef} className="relative w-full xl:max-w-sm">
                  <span
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="8.5" cy="8.5" r="5.25" />
                      <path d="M12.5 12.5 16.25 16.25" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={menuSearchQuery}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setMenuSearchQuery(nextValue);
                      setIsMenuSearchOpen(Boolean(nextValue.trim()));
                    }}
                    onFocus={() => {
                      if (menuSearchQuery.trim()) setIsMenuSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        setIsMenuSearchOpen(false);
                        return;
                      }
                      if (event.key === 'Enter' && filteredSearchResults[0]) {
                        event.preventDefault();
                        navigateFromSearch(filteredSearchResults[0]);
                      }
                    }}
                    placeholder="Search page or tab"
                    title={menuSearchTooltip}
                    aria-label="Search page or tab"
                    className={menuSearchInputClass}
                  />
                  <span
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    title={menuSearchTooltip}
                    aria-label="Search help"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-slate-300">
                      i
                    </span>
                  </span>

                  {isMenuSearchOpen && (
                    <div className="absolute right-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/98 shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
                      {filteredSearchResults.length > 0 ? (
                        <div role="listbox" aria-label="Menu search results" className="max-h-96 overflow-y-auto py-2">
                          {filteredSearchResults.map((item) => (
                            <button
                              key={`${item.path}-${item.name}`}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                navigateFromSearch(item);
                              }}
                              className="cursor-pointer flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05]"
                            >
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-base">
                                {item.icon}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-white">{item.name}</span>
                                <span className="mt-1 block text-xs text-slate-400">{item.categories.join(' / ')}</span>
                                <span className="mt-1 block text-[11px] text-slate-500">{item.path}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-4 text-sm text-slate-400">No matching page or tab found.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {openGroup && isDesktopSubmenuOpen && (
                <div
                  id={`desktop-submenu-${openGroup.category.toLowerCase()}`}
                  className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {openGroup.category} menu
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        Choose a destination in {openGroup.category}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Open one page and the submenu will hide automatically.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsDesktopSubmenuOpen(false)}
                      className="cursor-pointer inline-flex items-center justify-center rounded-2xl border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200 hover:bg-white/5"
                    >
                      Hide submenu
                    </button>
                  </div>

                  <div
                    id={`desktop-submenu-links-${openGroup.category.toLowerCase()}`}
                    className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                  >
                    {openGroup.items.map((item) => (
                      <NavLink
                        key={item.name}
                        to={item.path}
                        className={desktopMegaLinkClass}
                        onClick={() => {
                          setDesktopCategory(null);
                          setIsDesktopSubmenuOpen(false);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 text-base">
                            {item.icon}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-inherit">{item.name}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400 transition group-hover:text-slate-300">
                              Open the {item.name.toLowerCase()} page in the {openGroup.category.toLowerCase()} module.
                            </p>
                          </div>
                        </div>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-white/10 bg-slate-950 lg:hidden">
          <div className="space-y-4 px-4 py-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/15 text-sm font-semibold text-sky-100">
                  {profileInitial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                  <p className="truncate text-xs text-slate-400">{roleLabel}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Search page or tab
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="8.5" cy="8.5" r="5.25" />
                    <path d="M12.5 12.5 16.25 16.25" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={menuSearchQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setMenuSearchQuery(nextValue);
                    setIsMenuSearchOpen(Boolean(nextValue.trim()));
                  }}
                  placeholder="Type to search..."
                  title={menuSearchTooltip}
                  aria-label="Search page or tab"
                  className={menuSearchInputClass}
                />
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  title={menuSearchTooltip}
                  aria-label="Search help"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-slate-300">
                    i
                  </span>
                </span>
              </div>
              {isMenuSearchOpen && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                  {filteredSearchResults.length > 0 ? (
                    <div className="max-h-80 overflow-y-auto py-2">
                      {filteredSearchResults.map((item) => (
                        <button
                          key={`mobile-${item.path}-${item.name}`}
                          type="button"
                          onClick={() => navigateFromSearch(item)}
                          className="cursor-pointer flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05]"
                        >
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-base">
                            {item.icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-white">{item.name}</span>
                            <span className="mt-1 block text-xs text-slate-400">{item.categories.join(' / ')}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-sm text-slate-400">No matching page or tab found.</div>
                  )}
                </div>
              )}
            </div>
            {groupedMenuItems.map((group) => {
              const isExpanded = mobileExpandedCategory === group.category;
              return (
                <div
                  key={group.category}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <button
                    type="button"
                    onClick={() => handleMobileCategoryToggle(group.category)}
                    aria-expanded={isExpanded}
                    aria-controls={`mobile-submenu-${group.category.toLowerCase()}`}
                    className="cursor-pointer flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${categoryStyles[group.category].label}`}>
                        {group.category}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {isExpanded ? 'Tap to collapse submenu' : `${group.items.length} destinations`}
                      </p>
                    </div>
                    <span
                      className={`text-xs text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>
                  {isExpanded && (
                    <div id={`mobile-submenu-${group.category.toLowerCase()}`} className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.name}
                          to={item.path}
                          className={mobileLinkClass}
                          onClick={() => setIsOpen(false)}
                        >
                          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-black/20 text-xs">
                            {item.icon}
                          </span>
                          {item.name}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Decrease font size"
                  onClick={() => bumpFont(-1)}
                  className="cursor-pointer rounded-xl border border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                >
                  a-
                </button>
                <button
                  type="button"
                  title="Increase font size"
                  onClick={() => bumpFont(1)}
                  className="cursor-pointer rounded-xl border border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
                >
                  A+
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 p-1">
                <button
                  type="button"
                  title="Dark mode"
                  onClick={() => setTheme('dark')}
                  className={`cursor-pointer rounded-xl px-2.5 py-2 text-sm ${
                    themeMode === 'dark' ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  🌙
                </button>
                <button
                  type="button"
                  title="Light mode"
                  onClick={() => setTheme('light')}
                  className={`cursor-pointer rounded-xl px-2.5 py-2 text-sm ${
                    themeMode === 'light' ? 'bg-amber-500/20 text-amber-100' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  ☀️
                </button>
              </div>
              <button
                type="button"
                title="User Manual"
                aria-label="Open user manual"
                onClick={() => {
                  navigate('/user-manual');
                  setIsOpen(false);
                }}
                className="cursor-pointer rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                ? Help
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <div>
                <p className="text-sm font-semibold text-white">{workspaceLabel}</p>
                <p className="text-xs text-slate-500">Current workspace</p>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  onLogout();
                }}
                className="cursor-pointer rounded-xl bg-rose-500/12 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
