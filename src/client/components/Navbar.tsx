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
  { key: 'sales-dashboard' as PageKey, name: 'Sales Dashboard', path: '/sales-dashboard', category: 'Sales' as MenuCategory, icon: '💰' },
  { key: 'orders' as PageKey, name: 'Orders', path: '/orders', category: 'Sales' as MenuCategory, icon: '📄' },
  { key: 'sales' as PageKey, name: 'Quotations', path: '/sales/quotes', category: 'Sales' as MenuCategory, icon: '🧾' },
  { key: 'returns' as PageKey, name: 'Returns', path: '/returns', category: 'Sales' as MenuCategory, icon: '↩️' },
  { key: 'reports' as PageKey, name: 'Reports', path: '/reports', category: 'Sales' as MenuCategory, icon: '📈' },
  { key: 'customers' as PageKey, name: 'Customer Profiles', path: '/customers/profiles', category: 'Sales' as MenuCategory, icon: '🧑' },
  { key: 'customers' as PageKey, name: 'CRM Enquiries', path: '/customers/enquiries', category: 'Sales' as MenuCategory, icon: '📞' },
  { key: 'customers' as PageKey, name: 'CRM Campaigns', path: '/customers/campaigns', category: 'Sales' as MenuCategory, icon: '📣' },
  { key: 'customers' as PageKey, name: 'CRM Reports', path: '/customers/reports', category: 'Sales' as MenuCategory, icon: '📊' },
  { key: 'products' as PageKey, name: 'Product Center', path: '/products', category: 'Catalog' as MenuCategory, icon: '📦' },
  { key: 'products' as PageKey, name: 'Product Entry', path: '/products/entry', category: 'Catalog' as MenuCategory, icon: '➕' },
  { key: 'products' as PageKey, name: 'Product Catalog', path: '/products/catalog', category: 'Catalog' as MenuCategory, icon: '🗃️' },
  { key: 'products' as PageKey, name: 'Stock Alerts', path: '/products/alerts', category: 'Catalog' as MenuCategory, icon: '🚨' },
  { key: 'inventory' as PageKey, name: 'Procurement', path: '/inventory/procurement', category: 'Catalog' as MenuCategory, icon: '🚚' },
  { key: 'categories' as PageKey, name: 'Categories', path: '/categories', category: 'Catalog' as MenuCategory, icon: '🗂️' },
  { key: 'employees' as PageKey, name: 'Employees', path: '/employees', category: 'People' as MenuCategory, icon: '👥' },
  { key: 'employee-attendance' as PageKey, name: 'Employee Check In', path: '/attendance/self', category: 'People' as MenuCategory, icon: '📍' },
  { key: 'attendance' as PageKey, name: 'Attendance Reports', path: '/attendance/reports', category: 'People' as MenuCategory, icon: '📋' },
  { key: 'attendance' as PageKey, name: 'Attendance Register', path: '/attendance', category: 'People' as MenuCategory, icon: '🕒' },
  { key: 'shifts' as PageKey, name: 'Shifts', path: '/shifts', category: 'People' as MenuCategory, icon: '🗓️' },
  { key: 'payroll' as PageKey, name: 'Payroll', path: '/payroll', category: 'People' as MenuCategory, icon: '🧾' },
  { key: 'facilities' as PageKey, name: 'Facility Setup', path: '/facilities/setup', category: 'Operations' as MenuCategory, icon: '🛠️' },
  { key: 'facilities' as PageKey, name: 'Facility Booking', path: '/facilities', category: 'Operations' as MenuCategory, icon: '🏟️' },
  { key: 'facilities' as PageKey, name: 'Event Booking', path: '/events', category: 'Operations' as MenuCategory, icon: '📅' },
  { key: 'event-quotations' as PageKey, name: 'Event Quotations', path: '/events/quotations', category: 'Operations' as MenuCategory, icon: '📑' },
  { key: 'memberships' as PageKey, name: 'Create Plan', path: '/membership-plans/create', category: 'Operations' as MenuCategory, icon: '🧩' },
  { key: 'memberships' as PageKey, name: 'Create Subscription', path: '/membership-subscriptions/create', category: 'Operations' as MenuCategory, icon: '📝' },
  { key: 'memberships' as PageKey, name: 'Memberships', path: '/memberships', category: 'Operations' as MenuCategory, icon: '🎫' },
  { key: 'memberships' as PageKey, name: 'Membership Reports', path: '/membership-reports', category: 'Operations' as MenuCategory, icon: '📊' },
  { key: 'accounting' as PageKey, name: 'Accounting', path: '/accounting', category: 'Accounts' as MenuCategory, icon: '📚' },
  { key: 'accounting' as PageKey, name: 'Settlements', path: '/accounting/settlements', category: 'Accounts' as MenuCategory, icon: '💳' },
  { key: 'settings' as PageKey, name: 'Settings', path: '/settings', category: 'Admin' as MenuCategory, icon: '⚙️' },
  { key: 'user-management' as PageKey, name: 'Users', path: '/user-management', category: 'Admin' as MenuCategory, icon: '🛡️' },
  { key: 'admin-reports' as PageKey, name: 'Reports', path: '/admin/reports', category: 'Admin' as MenuCategory, icon: '🗂️' },
];

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

const categoryLandingPaths: Partial<Record<MenuCategory, string>> = {
  Home: '/',
  Sales: '/sales-dashboard',
  Catalog: '/products',
  People: '/employees',
  Operations: '/facilities',
  Accounts: '/accounting',
  Admin: '/settings',
};

const pathMatches = (currentPath: string, itemPath: string): boolean => {
  if (itemPath === '/') return currentPath === '/';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
};

const menuSearchTooltip =
  'Search pages or tabs by typing part of the name, like Sales, Reports, Payroll, Voucher, Attendance, or Settings. Press Enter to open the first result.';

const mobileHeaderIconButtonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/10 hover:text-white';
const mobileHeaderButtonGroupClass =
  'inline-flex items-stretch overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';
const mobileHeaderButtonGroupItemClass =
  'inline-flex h-8 w-8 items-center justify-center text-slate-200 transition hover:bg-white/10 hover:text-white';
const mobileHeaderUserLabelClass =
  'flex h-8 max-w-[132px] items-center gap-1.5 px-2.5 text-xs font-semibold text-slate-100';

export const Navbar: React.FC<NavbarProps> = ({ user, permissions, onLogout, showCompanyCreationMenu = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [desktopExpandedCategory, setDesktopExpandedCategory] = useState<MenuCategory | null>(null);
  const [mobileExpandedCategory, setMobileExpandedCategory] = useState<MenuCategory | null>(null);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [isMenuSearchOpen, setIsMenuSearchOpen] = useState(false);
  const [brandName, setBrandName] = useState('Sarva');
  const [brandLogo, setBrandLogo] = useState('');
  const [uiPreferences, setUiPreferences] = useState<ResolvedUiPreferences>(() => readUiPreferencesFromStorage());
  const uiPreferencesRef = useRef<ResolvedUiPreferences>(uiPreferences);
  const menuSearchRef = useRef<HTMLDivElement | null>(null);

  const allowedMenuItems = useMemo(() => {
    const base = menuItems.filter((item) => {
      if (item.key === 'customers') return permissions.customers || permissions.sales;
      if (item.key === 'event-quotations') return permissions['event-quotations'] || permissions.facilities;
      if (item.key === 'products') return permissions.products || permissions.sales;
      return permissions[item.key];
    });
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

  const groupedMenuItems = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          items: allowedMenuItems.filter((item) => item.category === category),
        }))
        .filter((group) => group.category !== 'Home' && group.items.length > 0),
    [allowedMenuItems]
  );

  const homeItem = useMemo(
    () => allowedMenuItems.find((item) => item.path === '/'),
    [allowedMenuItems]
  );

  const activeCategory = useMemo(() => {
    const activeItem = allowedMenuItems.find((item) => pathMatches(location.pathname, item.path));
    return activeItem?.category || groupedMenuItems[0]?.category || null;
  }, [allowedMenuItems, groupedMenuItems, location.pathname]);

  const activeItem = useMemo(
    () => allowedMenuItems.find((item) => pathMatches(location.pathname, item.path)),
    [allowedMenuItems, location.pathname]
  );

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
        const haystack = [item.name, item.path, item.categories.join(' ')].join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [menuSearchQuery, searchableMenuItems]);

  const workspaceLabel = activeItem?.name || activeCategory || 'Workspace';
  const headerUserName =
    [String(user?.firstName || '').trim(), String(user?.lastName || '').trim()].filter(Boolean).join(' ').trim() ||
    String(user?.email || '').trim() ||
    'User';

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
        // ignore remote save failures
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

  useEffect(() => {
    setDesktopExpandedCategory(activeCategory);
    setMobileExpandedCategory(activeCategory);
    setIsMobileOpen(false);
    setIsMenuSearchOpen(false);
  }, [activeCategory, location.pathname]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuSearchRef.current?.contains(event.target as Node)) {
        setIsMenuSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const setTheme = (nextTheme: 'dark' | 'light') => {
    const next = {
      ...uiPreferencesRef.current,
      themeMode: nextTheme,
    };
    setAndSyncUiPreferences(next);
  };

  const bumpFont = (direction: 1 | -1) => {
    const next = {
      ...uiPreferencesRef.current,
      fontScale: clampFontScale(uiPreferencesRef.current.fontScale + direction * FONT_SCALE_STEP),
    };
    setAndSyncUiPreferences(next);
  };

  const navigateFromSearch = (item: SearchableMenuItem) => {
    setMenuSearchQuery('');
    setIsMenuSearchOpen(false);
    setIsMobileOpen(false);
    navigate(item.path);
  };

  const sidebarSectionButtonClass = (selected: boolean) =>
    `flex w-full items-center justify-between gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold transition ${
      selected
        ? 'bg-white/10 text-white'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const sidebarSectionLinkClass = (selected: boolean) =>
    `flex flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold transition ${
      selected
        ? 'bg-white/10 text-white'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const sidebarSectionToggleClass = (selected: boolean) =>
    `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition ${
      selected
        ? 'bg-white/10 text-white'
        : 'hover:bg-white/5 hover:text-white'
    }`;

  const desktopSubmenuLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition ${
      isActive
        ? 'bg-sky-500/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const homeLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${
      isActive ? 'bg-sky-500/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const searchInputClass =
    'w-full rounded-xl border border-white/10 bg-white/5 py-1.5 pl-9 pr-10 text-[12px] text-white placeholder-slate-500 outline-none transition focus:border-sky-400/35 focus:bg-white/10';

  const renderSearchBlock = (mobile = false) => (
    <div ref={mobile ? undefined : menuSearchRef} className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
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
        className={searchInputClass}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2" title={menuSearchTooltip} aria-label="Search help">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.04] text-[11px] font-semibold text-slate-300">
          i
        </span>
      </span>

      {isMenuSearchOpen && (
        <div className={`absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/98 shadow-[0_20px_60px_rgba(2,6,23,0.45)] ${mobile ? '' : 'left-0'}`}>
          {filteredSearchResults.length > 0 ? (
          <div role="listbox" aria-label="Menu search results" className="max-h-96 overflow-y-auto py-1.5">
              {filteredSearchResults.map((item) => (
                <button
                  key={`${mobile ? 'mobile' : 'desktop'}-${item.path}-${item.name}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    navigateFromSearch(item);
                  }}
                  onClick={() => navigateFromSearch(item)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-sm">
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-white">{item.name}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">{item.categories.join(' / ')}</span>
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
  );

  const renderMenuGroups = (
    expandedCategory: MenuCategory | null,
    onToggle: (category: MenuCategory) => void,
    onNavigate?: (category?: MenuCategory) => void
  ) => (
    <div className="space-y-1.5">
      {groupedMenuItems.map((group) => {
        const isExpanded = expandedCategory === group.category;
        const isActiveGroup = activeCategory === group.category;
        const landingPath = categoryLandingPaths[group.category] || group.items[0]?.path || '/';
        return (
          <div key={group.category} className="rounded-xl border border-white/8 bg-white/[0.03] p-1">
            <div className="flex min-w-0 items-center gap-1">
              <NavLink
                to={landingPath}
                onClick={() => onNavigate?.(group.category)}
                className={sidebarSectionLinkClass(isActiveGroup)}
              >
                <span className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-xs">
                    {categoryIcons[group.category]}
                  </span>
                  <span className="block text-[13px] font-semibold text-inherit">{group.category}</span>
                </span>
              </NavLink>
              <button
                type="button"
                onClick={() => onToggle(group.category)}
                className={sidebarSectionToggleClass(isActiveGroup || isExpanded)}
                aria-expanded={isExpanded}
                aria-controls={`sidebar-group-${group.category.toLowerCase()}`}
                title={isExpanded ? `Hide ${group.category} menu` : `Show ${group.category} menu`}
                aria-label={isExpanded ? `Hide ${group.category} menu` : `Show ${group.category} menu`}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-black/20 text-xs">
                  {isExpanded ? '▴' : '▾'}
                </span>
              </button>
            </div>

            {isExpanded ? (
              <div id={`sidebar-group-${group.category.toLowerCase()}`} className="mt-1 space-y-0.5 border-t border-white/6 pt-1">
                {group.items.map((item) => (
                  <NavLink
                    key={`${group.category}-${item.path}`}
                    to={item.path}
                    className={desktopSubmenuLinkClass}
                    onClick={() => onNavigate?.()}
                  >
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-black/20 text-[11px]">
                      {item.icon}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-inherit">{item.name}</span>
                  </NavLink>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  const themeMode = uiPreferences.themeMode;

  return (
    <>
      <aside className="hidden h-full w-[256px] shrink-0 overflow-x-hidden border-r border-white/8 bg-slate-950/95 shadow-[20px_0_40px_rgba(2,6,23,0.22)] backdrop-blur-xl lg:flex lg:flex-col">
        <div className="flex h-full flex-col p-2.5">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-2.5">
            {renderSearchBlock(false)}
          </div>

          <div className="mt-2.5 flex-1 overflow-y-auto overflow-x-hidden pr-1">
            {homeItem ? (
              <div className="mb-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1">
                <NavLink to={homeItem.path} className={homeLinkClass}>
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/20 text-xs">
                    {homeItem.icon}
                  </span>
                  <span className="min-w-0 truncate text-[12px] font-semibold text-inherit">Home</span>
                </NavLink>
              </div>
            ) : null}
            {renderMenuGroups(desktopExpandedCategory, (category) =>
              setDesktopExpandedCategory((current) => (current === category ? null : category)),
              () => setDesktopExpandedCategory(null)
            )}
          </div>

        </div>
      </aside>

      <div className="sticky top-0 z-40 border-b border-white/8 bg-slate-950/95 px-4 py-2.5 shadow-[0_18px_42px_rgba(2,6,23,0.22)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{brandName}</p>
            <p className="truncate text-[11px] text-slate-500">{workspaceLabel}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div className={mobileHeaderButtonGroupClass}>
              <button
                type="button"
                title="Decrease text size so more content fits on the screen"
                aria-label="Decrease text size"
                onClick={() => bumpFont(-1)}
                className={`${mobileHeaderButtonGroupItemClass} border-r border-white/10`}
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
                onClick={() => bumpFont(1)}
                className={mobileHeaderButtonGroupItemClass}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 5h8M8 5v10" strokeLinecap="round" />
                  <path d="M5.5 15.5 8 9l2.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12.5 15h3M14 13.5v3" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              title="Open the user manual and screen-by-screen help"
              aria-label="Open user manual"
              onClick={() => navigate('/user-manual')}
              className={mobileHeaderIconButtonClass}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                <circle cx="10" cy="10" r="7" />
                <path d="M8.85 8.05a1.5 1.5 0 0 1 2.52 1.34c-.17.74-.92 1.1-1.37 1.6-.28.31-.41.63-.41 1.26" strokeLinecap="round" />
                <circle cx="10" cy="14.3" r=".7" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <div className={mobileHeaderButtonGroupClass}>
              <button
                type="button"
                title="Switch to dark mode"
                aria-label="Switch to dark mode"
                onClick={() => setTheme('dark')}
                className={`${mobileHeaderButtonGroupItemClass} border-r border-white/10 ${themeMode === 'dark' ? 'bg-sky-500/15 text-white' : ''}`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M13.8 2.8a6.6 6.6 0 1 0 3.4 11.9A7.4 7.4 0 0 1 13.8 2.8Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                title="Switch to light mode"
                aria-label="Switch to light mode"
                onClick={() => setTheme('light')}
                className={`${mobileHeaderButtonGroupItemClass} ${themeMode === 'light' ? 'bg-amber-500/15 text-amber-100' : ''}`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <circle cx="10" cy="10" r="3.2" />
                  <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className={mobileHeaderButtonGroupClass}>
              <div className={mobileHeaderUserLabelClass} title={headerUserName}>
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-slate-200">
                  <svg viewBox="0 0 20 20" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="1.7">
                    <circle cx="10" cy="6.5" r="2.75" />
                    <path d="M5.5 15.5a4.5 4.5 0 0 1 9 0" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="truncate">{headerUserName}</span>
              </div>
              <button
                type="button"
                title="Logout from the application"
                aria-label="Logout"
                onClick={onLogout}
                className={`${mobileHeaderButtonGroupItemClass} border-l border-white/10 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                  <path d="M7.5 3.5h-2A1.5 1.5 0 0 0 4 5v10a1.5 1.5 0 0 0 1.5 1.5h2" strokeLinecap="round" />
                  <path d="M11.5 6.5 15 10l-3.5 3.5M8 10h7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              title={isMobileOpen ? 'Close menu' : 'Open menu'}
              aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsMobileOpen((current) => !current)}
              className={mobileHeaderIconButtonClass}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.7">
                {isMobileOpen ? (
                  <>
                    <path d="M5 5 15 15M15 5 5 15" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <path d="M4 6.5h12M4 10h12M4 13.5h12" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {isMobileOpen ? (
          <div className="mt-3 space-y-3 rounded-3xl border border-white/8 bg-white/[0.04] p-3">
            {renderSearchBlock(true)}

            <div className="max-h-[50vh] overflow-y-auto pr-1">
              {homeItem ? (
                <div className="mb-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1">
                  <NavLink
                    to={homeItem.path}
                    className={homeLinkClass}
                    onClick={() => setIsMobileOpen(false)}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/20 text-xs">
                      {homeItem.icon}
                    </span>
                    <span className="min-w-0 truncate text-[12px] font-semibold text-inherit">Home</span>
                  </NavLink>
                </div>
              ) : null}
              {renderMenuGroups(
                mobileExpandedCategory,
                (category) => setMobileExpandedCategory((current) => (current === category ? null : category)),
                () => {
                  setMobileExpandedCategory(null);
                  setIsMobileOpen(false);
                }
              )}
            </div>

          </div>
        ) : null}
      </div>
    </>
  );
};
