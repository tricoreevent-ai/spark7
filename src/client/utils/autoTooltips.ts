const ROUTE_USAGE: Record<string, string> = {
  '/': 'Open Home dashboard overview',
  '/sales-dashboard': 'Open Sales Dashboard to start billing and review sales flow',
  '/sales': 'Open Sales page to create invoices and complete billing',
  '/orders': 'Open Orders page to manage customer orders',
  '/returns': 'Open Returns page to process refund and return entries',
  '/products': 'Open Product Center for product entry, catalog review, and stock alerts',
  '/products/add': 'Open Product Entry form to create a new product',
  '/products/entry': 'Open Product Entry form to create a new product',
  '/products/catalog': 'Open Product Catalog to search, filter, and edit products',
  '/products/alerts': 'Open Stock Alerts to review low stock and reorder items',
  '/categories': 'Open Categories page to organize product categories',
  '/inventory': 'Open Inventory page to monitor stock and low stock alerts',
  '/settings': 'Open Settings page to configure business and app preferences',
  '/accounting': 'Open Accounting page to manage balances, vouchers, and reports',
  '/reports': 'Open Reports page to view business reports by date range',
  '/employees': 'Open Employees page to manage employee master records',
  '/attendance': 'Open Attendance page to mark and review daily attendance',
  '/shifts': 'Open Shifts page to manage shift scheduling',
  '/payroll': 'Open Payroll page to calculate salary and payouts',
  '/events': 'Open Event Booking calendar for corporate or organizer bookings with multiple facilities',
  '/facilities': 'Open Facility Booking page for independent single-facility bookings',
  '/facilities/setup': 'Open Facility Setup page to create and edit facilities',
  '/memberships': 'Open Memberships page to manage plans and members',
  '/user-management': 'Open Users page to manage users, roles, and access',
};

const BUTTON_USAGE_PATTERNS: Array<{ pattern: RegExp; usage: string }> = [
  { pattern: /\blogout\b/i, usage: 'Sign out from the current account' },
  { pattern: /\blogin\b/i, usage: 'Sign in to your account' },
  { pattern: /\bregister\b/i, usage: 'Create a new account' },
  { pattern: /\bsave\b/i, usage: 'Save current form data' },
  { pattern: /\bupdate\b/i, usage: 'Update the selected record' },
  { pattern: /\bedit\b/i, usage: 'Edit the selected record' },
  { pattern: /\bdelete\b|\bremove\b/i, usage: 'Delete the selected record' },
  { pattern: /\brefresh\b|\breload\b/i, usage: 'Reload latest data from server' },
  { pattern: /\bprint\b/i, usage: 'Print current document' },
  { pattern: /\bexport\b/i, usage: 'Export the current report data' },
  { pattern: /\bbackup\b/i, usage: 'Download a database backup file' },
  { pattern: /\brestore\b/i, usage: 'Restore data from selected backup file' },
  { pattern: /\bapprove\b/i, usage: 'Approve the selected record' },
  { pattern: /\breject\b/i, usage: 'Reject the selected record' },
  { pattern: /\bbook\b/i, usage: 'Create booking for selected slot' },
  { pattern: /\bcalculate\b/i, usage: 'Calculate values using current inputs' },
  { pattern: /\bsearch\b/i, usage: 'Search using entered text or filters' },
  { pattern: /\badd\b|\bcreate\b|\bnew\b/i, usage: 'Create a new record' },
  { pattern: /\bcancel\b|\bclose\b/i, usage: 'Close this action without saving changes' },
  { pattern: /\bnext\b/i, usage: 'Move to the next step' },
  { pattern: /\bback\b|\bprevious\b/i, usage: 'Go back to the previous step' },
];

const normalizeText = (value: string): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[^a-zA-Z0-9]+/, '')
    .trim();

const elementLabel = (node: Element): string => {
  const aria = normalizeText(node.getAttribute('aria-label') || '');
  if (aria) return aria;

  const dataTip = normalizeText(node.getAttribute('data-tooltip') || '');
  if (dataTip) return dataTip;

  const asHtml = node as HTMLElement;
  const text = normalizeText(asHtml.innerText || asHtml.textContent || '');
  if (!text) return '';

  const firstLine = normalizeText(text.split('\n')[0] || '');
  return firstLine || text;
};

const resolvePathFromHref = (href: string): string => {
  const raw = String(href || '').trim();
  if (!raw) return '';

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).pathname || '';
    }
    return new URL(raw, window.location.origin).pathname || '';
  } catch {
    return raw;
  }
};

const getTooltipForLink = (node: Element): string => {
  const explicit = normalizeText(node.getAttribute('data-tooltip') || '');
  if (explicit) return explicit;

  const href = node.getAttribute('href') || '';
  const path = resolvePathFromHref(href);
  if (path && ROUTE_USAGE[path]) return ROUTE_USAGE[path];

  const label = elementLabel(node);
  if (label) return `Open ${label}`;

  if (path) return `Open ${path}`;
  return 'Open link';
};

const getTooltipForButton = (node: Element): string => {
  const explicit = normalizeText(node.getAttribute('data-tooltip') || '');
  if (explicit) return explicit;

  const label = elementLabel(node);
  if (!label) {
    const type = String(node.getAttribute('type') || '').toLowerCase();
    if (type === 'submit') return 'Submit this form';
    return 'Use this button';
  }

  const match = BUTTON_USAGE_PATTERNS.find((entry) => entry.pattern.test(label));
  if (match) return match.usage;

  return `Use this button: ${label}`;
};

const applyTooltip = (node: Element, tooltip: string) => {
  if (!tooltip) return;

  const title = String(node.getAttribute('title') || '').trim();
  const auto = String(node.getAttribute('data-auto-tooltip') || '') === 'true';
  if (title && !auto) return;

  node.setAttribute('title', tooltip);
  node.setAttribute('data-auto-tooltip', 'true');
};

const applyTooltipsToDom = () => {
  const elements = Array.from(document.querySelectorAll('a, button'));

  for (const node of elements) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.hidden) continue;

    const tag = node.tagName.toLowerCase();
    const tooltip = tag === 'a' ? getTooltipForLink(node) : getTooltipForButton(node);
    applyTooltip(node, tooltip);
  }
};

export const initializeAutoTooltips = (): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }

  let queued = false;
  const queueApply = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      applyTooltipsToDom();
    });
  };

  queueApply();

  const observer = new MutationObserver(() => queueApply());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'href', 'disabled', 'data-tooltip'],
  });

  window.addEventListener('hashchange', queueApply);
  window.addEventListener('popstate', queueApply);

  return () => {
    observer.disconnect();
    window.removeEventListener('hashchange', queueApply);
    window.removeEventListener('popstate', queueApply);
  };
};
