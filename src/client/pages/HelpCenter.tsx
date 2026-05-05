import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PublicSeo } from '../public/PublicSeo';
import { useEscapeKey } from '../hooks/useEscapeKey';
// Dependencies to add: fuse.js, react-intersection-observer, lucide-react
import Fuse from 'fuse.js';
import { MessageCircle, X, Copy, Send, ChevronDown, ChevronUp, Printer, Search, Filter, ArrowRight, ChevronRight, Sparkles, BookOpen, FileText, BarChart3, LayoutGrid, ArrowUp, Home, ShoppingCart, Boxes, Users, Settings2, Wallet, ShieldCheck } from 'lucide-react';

// Print styles
const printStyles = `
  @media print {
    .no-print { display: none !important; }
    .print-break { page-break-before: always; }
    body { background: white !important; color: black !important; }
    .bg-gray-950, .bg-white/5, .bg-gray-950/30, .bg-gray-950/35 { background: white !important; }
    .text-white, .text-gray-100, .text-gray-200, .text-gray-300 { color: black !important; }
    .border-white/10, .border-white/15 { border-color: #ccc !important; }
    .shadow-lg, .shadow-xl, .shadow-2xl { box-shadow: none !important; }
    .rounded-2xl, .rounded-3xl { border-radius: 4px !important; }
    a { color: blue !important; text-decoration: underline !important; }
    .grid { display: block !important; }
    .flex { display: block !important; }
    .hidden { display: block !important; }
    .lg\\:grid-cols-2, .lg\\:grid-cols-3, .xl\\:grid-cols-2, .xl\\:grid-cols-3 { grid-template-columns: 1fr !important; }
    .lg\\:flex-row { flex-direction: column !important; }
    .lg\\:border-l { border-left: none !important; }
    .lg\\:border-t-0 { border-top: 1px solid #ccc !important; }
    .lg\\:block { display: block !important; }
    .lg\\:hidden { display: none !important; }
  }
`;

type GuideLink = {
  label: string;
  to: string;
};

type OverviewSection = {
  id: string;
  title: string;
  description: string;
  bullets: string[];
};

type ModuleSummary = {
  id: string;
  title: string;
  route: string;
  navigation: string;
  purpose: string;
  description: string;
  keyUses: string[];
  links: GuideLink[];
};

type PageGuide = {
  id: string;
  title: string;
  route: string;
  navigation: string;
  purpose: string;
  description: string;
  keyUses: string[];
  links: GuideLink[];
};

type MenuSection = {
  id: string;
  title: string;
  summary: string;
  accent: string;
  pages: PageGuide[];
};

type ReportTopic = {
  id?: string;
  name: string;
  explanation: string;
};

type ReportLogicSection = {
  id: string;
  title: string;
  description: string;
  topics: ReportTopic[];
};

type SampleEntry = {
  title: string;
  sample: string;
  result: string;
};

type SampleEntryGroup = {
  id: string;
  title: string;
  description: string;
  entries: SampleEntry[];
};

type TopicIndexGroup = {
  title: string;
  links: Array<{ id: string; label: string }>;
};

type TopicTreeState = Record<string, boolean>;

type CsvLogicRow = {
  action: string;
  systemResponse: string;
};

type CsvMatchRow = {
  statementRow: string;
  ledgerRow: string;
  status: string;
};

type FieldGuideRow = {
  field: string;
  whyItMatters: string;
  howToUse: string;
  example: string;
};

type TransactionGuide = {
  id: string;
  title: string;
  navigation: string;
  route: string;
  whatItDoes: string;
  businessLogic: string;
  practicalExample: string;
  reportFlow: string;
  note: string;
  logicTable?: CsvLogicRow[];
  pastedCsvExample?: string;
  matchedExampleRows?: CsvMatchRow[];
  matchedOutcome?: string;
  mismatchExamples?: Array<{ issue: string; explanation: string }>;
  fieldGuide?: FieldGuideRow[];
};

type TransactionGuideSection = {
  id: string;
  title: string;
  description: string;
  guides: TransactionGuide[];
};

const APPLICATION_NAME = 'Sarva';
const APPLICATION_TITLE = 'Sarva Sports Complex Management Platform';

type SearchMatch = {
  key?: string;
  indices: ReadonlyArray<readonly [number, number]>;
};

type AiKnowledgeRow = {
  keywords: string[];
  answer: string;
  sourceLabel: string;
  sourceId: string;
};

const aiKnowledgeBase: AiKnowledgeRow[] = [
  {
    keywords: ['membership', 'plan', 'subscription', 'member'],
    answer: 'Create membership plans from Operations, define pricing and validity, then issue subscriptions to the customer profile that needs the plan.',
    sourceLabel: 'Membership Plan',
    sourceId: 'transaction-membership-plan',
  },
  {
    keywords: ['booking', 'facility', 'court', 'slot', 'schedule'],
    answer: 'Use the facility booking flow to pick the court, date, slot timing, and customer details before confirming the reservation and payment.',
    sourceLabel: 'Facility Booking',
    sourceId: 'transaction-facility-booking',
  },
  {
    keywords: ['sales', 'invoice', 'billing', 'product', 'scan'],
    answer: 'Open the Sales Invoice workspace, search or scan the product, review quantity and payment, then post the invoice so stock and sales reports update together.',
    sourceLabel: 'Sales Invoice',
    sourceId: 'transaction-sales-invoice',
  },
  {
    keywords: ['accounting', 'voucher', 'expense', 'journal', 'entry'],
    answer: 'Use the Accounts area to post the correct voucher type for income, expense, transfer, or settlement so reports and balances remain traceable.',
    sourceLabel: 'Accounting Invoice',
    sourceId: 'transaction-accounting-invoice',
  },
  {
    keywords: ['report', 'gst', 'tax', 'profit', 'summary'],
    answer: 'Reports use posted transactions only, then group sales, returns, taxes, and collections by the selected date range to keep report totals consistent.',
    sourceLabel: 'Report Logic',
    sourceId: 'report-logic',
  },
];

// Mock AI function - replace with real API call
const askAI = async (question: string): Promise<string> => {
  await new Promise((resolve) => setTimeout(resolve, 700 + Math.random() * 600));

  const normalizedQuestion = String(question || '').trim().toLowerCase();
  const matchedRow =
    aiKnowledgeBase.find((row) => row.keywords.some((keyword) => normalizedQuestion.includes(keyword)))
    || aiKnowledgeBase[0];

  return `${matchedRow.answer} [Read more in ${matchedRow.sourceLabel}](#${matchedRow.sourceId})`;
};

type CollapsedSections = Record<string, boolean>;

type ChatMessage = {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
};

type HelpSearchCategory = 'modules' | 'transactions' | 'reports' | 'guides';
type HelpSearchFilter = 'all' | HelpSearchCategory;

type HelpSearchDocument = {
  id: string;
  title: string;
  description: string;
  breadcrumb: string[];
  category: HelpSearchCategory;
  route?: string;
  routeLabel?: string;
  keywords: string[];
  badges: string[];
  quickLinks: GuideLink[];
  updatedLabel?: string;
};

const HELP_SEARCH_SYNONYMS: Record<string, string[]> = {
  bill: ['invoice', 'sales'],
  billing: ['invoice', 'sales'],
  invoice: ['bill', 'sales'],
  staff: ['employee', 'people', 'payroll'],
  employee: ['staff', 'people'],
  client: ['customer', 'crm'],
  customer: ['client', 'crm'],
  payment: ['receipt', 'collection', 'settlement'],
  receipt: ['payment', 'collection'],
  booking: ['reservation', 'facility', 'slot'],
  payroll: ['salary', 'employee'],
  balance: ['trial balance', 'balance sheet', 'opening balance'],
  ledger: ['accounting', 'journal'],
};

const HELP_RESULT_UPDATED_LABELS = ['Updated today', 'Updated 2 days ago', 'Updated 5 days ago', 'Updated 1 week ago'];

const normalizeSearchValue = (value: string) => String(value || '').trim().toLowerCase();

const tokenizeSearch = (value: string): string[] =>
  normalizeSearchValue(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);

const levenshteinDistance = (left: string, right: string): number => {
  const a = normalizeSearchValue(left);
  const b = normalizeSearchValue(right);
  if (!a) return b.length;
  if (!b) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= b.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const overviewSections: OverviewSection[] = [
  {
    id: 'introduction',
    title: 'Introduction',
    description:
      'Sarva is an integrated business and operations management platform designed to handle all activities of a sports complex in one structured system.',
    bullets: [
      'It connects sales, inventory, employee management, facility booking, memberships, and accounting in a single application.',
      'It reduces the need for separate systems and manual work by giving the business one centralized operational solution.',
      'It is designed for front desk staff, operations teams, sales teams, HR managers, accountants, and administrators.',
    ],
  },
  {
    id: 'objective',
    title: 'Objective of the Application',
    description:
      'The main objective of the application is to streamline daily operations and improve efficiency across every department of the sports complex business.',
    bullets: [
      'Manage bookings, sales transactions, quotations, returns, and customer follow-up in a traceable way.',
      'Maintain products, categories, procurement, inventory levels, employees, attendance, and payroll from the same platform.',
      'Track financial transactions, settlements, permissions, and reports so management can make better operational decisions.',
    ],
  },
  {
    id: 'structure',
    title: 'Application Structure',
    description:
      'The application is divided into seven main modules so users can move directly to the work area that matches their role and daily responsibility.',
    bullets: ['Home', 'Sales', 'Catalog', 'People', 'Operations', 'Accounts', 'Admin'],
  },
  {
    id: 'navigation-flow',
    title: 'User Navigation Flow',
    description:
      'A typical operating flow starts with system setup by administrators and then moves through catalog, operations, sales, people, accounts, and reporting.',
    bullets: [
      'Admin sets up company profile, users, permissions, and system settings.',
      'Catalog team adds products and categories, while Operations configures facilities, plans, memberships, and bookings.',
      'Sales handles customers and transactions, People manages employees and payroll, Accounts tracks finance, and management reviews reports.',
    ],
  },
  {
    id: 'latest-highlights',
    title: 'Latest Feature Highlights',
    description:
      'Recent Sarva updates improve customer CRM, event quotations, memberships, and the public product website experience.',
    bullets: [
      'Customer CRM now separates profiles, enquiries, campaigns, and reports for cleaner follow-up and review.',
      'Event quotations now support revision history, PDF preview, professional print output, mail sending, and booking conversion.',
      'Membership workflows cover plan setup, subscription issue, active-member review, renewals, and membership reporting.',
      'The public Sarva website now includes Home, Products, About, Contact, Login, and the public User Manual.',
    ],
  },
];

const moduleSummaries: ModuleSummary[] = [
  {
    id: 'module-home',
    title: 'Home',
    route: '/',
    navigation: 'Top menu > Home',
    purpose: 'The Home page serves as the central dashboard of the application.',
    description:
      'Users can view summaries such as bookings, sales activity, alerts, reminders, and shortcuts without opening each separate module. It gives a quick understanding of the current business status in one place.',
    keyUses: ['Monitor daily activity', 'View recent transactions', 'Identify pending actions', 'Access quick navigation'],
    links: [
      { label: 'Open Dashboard', to: '/' },
      { label: 'Open User Manual', to: '/user-manual' },
    ],
  },
  {
    id: 'module-sales',
    title: 'Sales',
    route: '/sales-dashboard',
    navigation: 'Top menu > Sales',
    purpose: 'The Sales module manages all customer-related transactions and revenue activity in a structured way.',
    description:
      'It handles the full sales cycle from dashboard monitoring, quotations, and CRM handling to orders, returns, campaigns, and performance review. It ensures that all commercial transactions are recorded and easy to trace later.',
    keyUses: ['Open sales dashboard actions', 'Manage customer orders', 'Provide quotations', 'Handle CRM follow-up and campaigns', 'View sales reports'],
    links: [
      { label: 'Sales Dashboard', to: '/sales-dashboard' },
      { label: 'Sales Orders', to: '/orders' },
      { label: 'Quotations', to: '/sales/quotes' },
    ],
  },
  {
    id: 'module-catalog',
    title: 'Catalog',
    route: '/products',
    navigation: 'Top menu > Catalog',
    purpose: 'The Catalog module manages product and inventory information used across the system.',
    description:
      'It stores product details, organizes them into categories, tracks stock levels, and supports replenishment activity. This module supports both sales and procurement work.',
    keyUses: ['Maintain product data', 'Monitor stock', 'Organize inventory', 'Support sales'],
    links: [
      { label: 'Product Center', to: '/products' },
      { label: 'Product Entry', to: '/products/entry' },
      { label: 'Product Catalog', to: '/products/catalog' },
    ],
  },
  {
    id: 'module-people',
    title: 'People',
    route: '/employees',
    navigation: 'Top menu > People',
    purpose: 'The People module manages employee data and workforce operations.',
    description:
      'It centralizes employee information, employee self attendance, manual attendance review, shifts, and payroll so the organization can manage staff records and workforce operations with better consistency and accuracy.',
    keyUses: ['Store employee data', 'Track employee self attendance', 'Review manual attendance', 'Manage shifts', 'Process payroll'],
    links: [
      { label: 'Employees', to: '/employees' },
      { label: 'Employee Check In', to: '/attendance/self' },
      { label: 'Attendance Reports', to: '/attendance/reports' },
      { label: 'Attendance Register', to: '/attendance' },
      { label: 'Payroll', to: '/payroll' },
    ],
  },
  {
    id: 'module-operations',
    title: 'Operations',
    route: '/facilities',
    navigation: 'Top menu > Operations',
    purpose: 'The Operations module manages service-related activities of the sports complex.',
    description:
      'It includes facility setup, bookings, event management, memberships, subscription plans, and related operational services. It focuses on how customers use the sports complex and its services.',
    keyUses: ['Manage bookings', 'Organize events', 'Handle memberships', 'Create plans'],
    links: [
      { label: 'Facility Booking', to: '/facilities' },
      { label: 'Event Booking', to: '/events' },
      { label: 'Memberships', to: '/memberships' },
    ],
  },
  {
    id: 'module-accounts',
    title: 'Accounts',
    route: '/accounting',
    navigation: 'Top menu > Accounts',
    purpose: 'The Accounts module manages financial transactions and records.',
    description:
      'It gives finance and operations teams one accounting workspace for posting, review, reconciliation, vouchers, and exports. Inside Accounting, users switch sections from the left sidebar menu instead of jumping between separate pages.',
    keyUses: [
      'Track finances section-wise',
      'Create invoices, payments, and vouchers',
      'Control periods, assets, and openings',
      'Run reconciliation and ledger review',
      'Generate financial reports and exports',
    ],
    links: [
      { label: 'Accounting', to: '/accounting' },
      { label: 'Settlements', to: '/accounting/settlements' },
      { label: 'Validation Dashboard', to: '/accounting/validation' },
      { label: 'Reports', to: '/reports' },
    ],
  },
  {
    id: 'module-validation',
    title: 'Validation',
    route: '/accounting/validation',
    navigation: 'Top menu > Validation > Validation Dashboard',
    purpose: 'The Validation module checks accounting health before management review, audit, and statutory work.',
    description:
      'It runs read-only accounting checks such as trial balance equality, balance sheet equation, TDS reconciliation, missing number sequences, closed-period postings, orphan references, and suspense balances. It also gives a Validation Command Center log, run history, drill-down review, and assistant guidance while keeping accounting data unchanged.',
    keyUses: [
      'Run accounting validation checks',
      'Review critical and warning findings',
      'Drill down into failed checks',
      'Export validation reports for audit follow-up',
      'Configure scheduled validation alerts',
    ],
    links: [
      { label: 'Open Validation Dashboard', to: '/accounting/validation' },
      { label: 'Open Accounting Reports', to: '/accounting?tab=reports' },
    ],
  },
  {
    id: 'module-admin',
    title: 'Admin',
    route: '/settings',
    navigation: 'Top menu > Admin',
    purpose: 'The Admin module controls system configuration and access.',
    description:
      'It allows administrators to manage users, permissions, business settings, company setup, mail and print preferences, admin reporting, and other shared system behavior across the organization.',
    keyUses: ['Manage users', 'Control access', 'Configure system', 'Review admin activity reports'],
    links: [
      { label: 'Settings', to: '/settings' },
      { label: 'Users', to: '/user-management' },
      { label: 'Company Create', to: '/admin/company-create' },
      { label: 'Admin Reports', to: '/admin/reports' },
    ],
  },
];

const menuSections: MenuSection[] = [
  {
    id: 'catalog-menu',
    title: 'Catalog Menu',
    summary:
      'The Catalog menu is used to control the full lifecycle of products and stock, from initial entry to procurement and stock monitoring.',
    accent: 'from-sky-500/20 via-cyan-500/10 to-transparent',
    pages: [
      {
        id: 'product-center',
        title: 'Product Center',
        route: '/products',
        navigation: 'Top menu > Catalog > Product Center',
        purpose: 'Gives one entry point for catalog setup, stock review, and product monitoring.',
        description:
          'This page is the catalog landing workspace. It summarizes total products, low stock, out-of-stock items, auto-reorder candidates, promotion activity, stock value, low-stock urgency, and recently updated products so users can decide whether to open Product Entry, Product Catalog, Stock Alerts, Categories, or Procurement next.',
        keyUses: ['Review catalog health', 'Open the right catalog workflow quickly', 'Watch stock-value and promotion signals', 'Jump into recent product edits'],
        links: [
          { label: 'Open Product Center', to: '/products' },
          { label: 'Open Product Entry', to: '/products/entry' },
          { label: 'Open Product Catalog', to: '/products/catalog' },
        ],
      },
      {
        id: 'product-entry',
        title: 'Product Entry',
        route: '/products/entry',
        navigation: 'Top menu > Catalog > Product Entry',
        purpose: 'Creates or updates the full product master used by sales, stock, and catalog reports.',
        description:
          'This page is the detailed product master form. Users fill identity fields such as Product Name, SKU, and Barcode; organize the item with Category, Subcategory, and Item Type; define Description, selling and buying prices, GST and HSN, stock opening values, units, reorder controls, variant combinations, price tiers, and tracking flags. The same layout is used for both add and edit so the entire product setup stays in one workspace.',
        keyUses: ['Create item masters', 'Define pricing and GST setup', 'Set stock, reorder, and opening values', 'Build size/color variant and tier-pricing rows'],
        links: [
          { label: 'Open Product Entry', to: '/products/entry' },
          { label: 'Open Product Catalog', to: '/products/catalog' },
          { label: 'Open Categories', to: '/categories' },
        ],
      },
      {
        id: 'product-catalog',
        title: 'Product Catalog',
        route: '/products/catalog',
        navigation: 'Top menu > Catalog > Product Catalog',
        purpose: 'Reviews, filters, sorts, and edits the full product list.',
        description:
          'This page gives a full product list with search, category/status/stock filters, sort controls, pagination, configurable visible columns, and direct edit/delete actions. Summary cards at the top react to the filtered list, so users can immediately see how many items remain after filters, the filtered stock total, low-stock count, visible-column count, and auto-reorder count.',
        keyUses: ['Search and filter the catalog', 'Change visible columns', 'Review stock and status by product', 'Open edit/delete actions quickly'],
        links: [
          { label: 'Open Product Catalog', to: '/products/catalog' },
          { label: 'Open Stock Alerts', to: '/products/alerts' },
          { label: 'Open Product Entry', to: '/products/entry' },
        ],
      },
      {
        id: 'stock-alerts',
        title: 'Stock Alerts',
        route: '/products/alerts',
        navigation: 'Top menu > Catalog > Stock Alerts',
        purpose: 'Monitors low stock, stock-outs, reorder queue, and inactive items.',
        description:
          'This page turns product conditions into action queues. It separates inventory items into Low Stock, Out of Stock, Auto-Reorder Queue, and Inactive Products so catalog managers and purchasers can work the highest-priority exceptions first.',
        keyUses: ['Identify low stock', 'Review out-of-stock items', 'Follow auto-reorder suggestions', 'Jump to product editing from alert lists'],
        links: [
          { label: 'Open Stock Alerts', to: '/products/alerts' },
          { label: 'Open Procurement', to: '/inventory/procurement' },
          { label: 'Open Product Catalog', to: '/products/catalog' },
        ],
      },
      {
        id: 'procurement',
        title: 'Procurement',
        route: '/inventory/procurement',
        navigation: 'Top menu > Catalog > Procurement',
        purpose: 'Handles purchasing and restocking.',
        description:
          'This section manages supplier purchases and inventory replenishment activity. It supports restocking decisions and helps the team follow purchasing activity in a more controlled way.',
        keyUses: ['Purchase products', 'Track procurement'],
        links: [
          { label: 'Open Procurement', to: '/inventory/procurement' },
          { label: 'Open Stock Alerts', to: '/products/alerts' },
          { label: 'Open Product Catalog', to: '/products/catalog' },
        ],
      },
      {
        id: 'categories',
        title: 'Categories',
        route: '/categories',
        navigation: 'Top menu > Catalog > Categories',
        purpose: 'Organizes products into groups.',
        description:
          'This page helps structure product data into logical groups. A good category setup improves product entry, search, analysis, and stock review throughout the application.',
        keyUses: ['Create groups', 'Improve search'],
        links: [
          { label: 'Open Categories', to: '/categories' },
          { label: 'Open Product Entry', to: '/products/entry' },
          { label: 'Open Product Catalog', to: '/products/catalog' },
        ],
      },
    ],
  },
  {
    id: 'people-menu',
    title: 'People Menu',
    summary:
      'The People menu centralizes employee records and workforce management so HR and operations can coordinate staffing accurately.',
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent',
    pages: [
      {
        id: 'employees',
        title: 'Employees',
        route: '/employees',
        navigation: 'Top menu > People > Employees',
        purpose: 'Stores employee details.',
        description:
          'This page maintains all staff information in one place. It acts as the base employee master for attendance, shifts, payroll, and general HR administration.',
        keyUses: ['Store employee data', 'Review staff details', 'Maintain employee records'],
        links: [
          { label: 'Open Employees', to: '/employees' },
          { label: 'Open Attendance', to: '/attendance' },
          { label: 'Open Payroll', to: '/payroll' },
        ],
      },
      {
        id: 'employee-attendance',
        title: 'Employee Check In',
        route: '/attendance/self',
        navigation: 'Top menu > People > Employee Check In',
        purpose: 'Lets employees mark attendance themselves from the sports complex.',
        description:
          'This page is the self attendance screen. Employees use a mobile device, allow GPS, and tap check in or check out. The system saves the current time automatically and can reject the action if the employee is outside the allowed sports complex area.',
        keyUses: ['Self check-in', 'Self check-out', 'Current-time capture', 'GPS-based attendance control'],
        links: [
          { label: 'Open Employee Check In', to: '/attendance/self' },
          { label: 'Open Attendance Reports', to: '/attendance/reports' },
          { label: 'Open Attendance Register', to: '/attendance' },
          { label: 'Open Employees', to: '/employees' },
        ],
      },
      {
        id: 'attendance',
        title: 'Attendance Register',
        route: '/attendance',
        navigation: 'Top menu > People > Attendance Register',
        purpose: 'Tracks employee presence through supervisor or admin manual entry.',
        description:
          'This page records daily attendance for monitoring, operational review, payroll support, and manual correction. It is meant for supervisors or administrators when an entry must be reviewed or updated manually.',
        keyUses: ['Track attendance', 'Review daily presence', 'Correct attendance', 'Support payroll'],
        links: [
          { label: 'Open Attendance Register', to: '/attendance' },
          { label: 'Open Attendance Reports', to: '/attendance/reports' },
          { label: 'Open Employee Check In', to: '/attendance/self' },
          { label: 'Open Employees', to: '/employees' },
          { label: 'Open Shifts', to: '/shifts' },
        ],
      },
      {
        id: 'attendance-reports',
        title: 'Attendance Reports',
        route: '/attendance/reports',
        navigation: 'Top menu > People > Attendance Reports',
        purpose: 'Reviews attendance in report format.',
        description:
          'This page gives two attendance report styles in one place. The employee-wise detail report shows date-wise check-in, check-out, total worked time, overtime, and map links for the attendance entry location. The monthly attendance sheet shows one full month in one grid with date columns and tick marks for presence, making it easy to print or export.',
        keyUses: ['Review date-wise attendance detail', 'Check total worked time', 'Open GPS map links', 'Print monthly attendance sheet', 'Export attendance reports'],
        links: [
          { label: 'Open Attendance Reports', to: '/attendance/reports' },
          { label: 'Open Attendance Register', to: '/attendance' },
          { label: 'Open Employee Check In', to: '/attendance/self' },
          { label: 'Open Payroll', to: '/payroll' },
        ],
      },
      {
        id: 'shifts',
        title: 'Shifts',
        route: '/shifts',
        navigation: 'Top menu > People > Shifts',
        purpose: 'Manages employee schedules.',
        description:
          'This page assigns work timing and shift patterns so the business can plan staff coverage correctly across operating hours. It helps align people availability with facility activity.',
        keyUses: ['Manage schedules', 'Assign working hours', 'Support proper coverage'],
        links: [
          { label: 'Open Shifts', to: '/shifts' },
          { label: 'Open Attendance', to: '/attendance' },
          { label: 'Open Payroll', to: '/payroll' },
        ],
      },
      {
        id: 'payroll',
        title: 'Payroll',
        route: '/payroll',
        navigation: 'Top menu > People > Payroll',
        purpose: 'Calculates salaries.',
        description:
          'This page processes employee payments based on attendance and shifts. It gives the organization a structured way to calculate salary-related output and review pay records.',
        keyUses: ['Calculate salaries', 'Review pay information', 'Process payroll'],
        links: [
          { label: 'Open Payroll', to: '/payroll' },
          { label: 'Open Employees', to: '/employees' },
          { label: 'Open Attendance', to: '/attendance' },
          { label: 'Open Attendance Reports', to: '/attendance/reports' },
        ],
      },
    ],
  },
  {
    id: 'sales-menu',
    title: 'Sales Menu',
    summary:
      'The Sales menu handles customer-facing commercial activity, from pre-sales discussion through confirmed transactions and follow-up reporting.',
    accent: 'from-emerald-500/20 via-teal-500/10 to-transparent',
    pages: [
      {
        id: 'sales-dashboard',
        title: 'Sales Dashboard',
        route: '/sales-dashboard',
        navigation: 'Top menu > Sales > Sales Dashboard',
        purpose: 'Gives the sales team a quick action and monitoring workspace.',
        description:
          'This dashboard brings together sales shortcuts, seven-day sales trend visibility, and product stock alerts so the front desk or sales team can move quickly between billing, returns, analytics, and stock-sensitive selling decisions.',
        keyUses: ['Open POS quickly', 'Review recent sales trend', 'Track stock alerts before selling', 'Jump to orders, returns, and reports'],
        links: [
          { label: 'Open Sales Dashboard', to: '/sales-dashboard' },
          { label: 'Open Sales Orders', to: '/orders' },
          { label: 'Open Reports', to: '/reports' },
        ],
      },
      {
        id: 'sales-orders',
        title: 'Sales Orders',
        route: '/orders',
        navigation: 'Top menu > Sales > Sales Orders',
        purpose: 'Records confirmed sales.',
        description:
          'This page tracks completed transactions and allows users to review the history of confirmed sales. It is the main operational record for finalized customer orders.',
        keyUses: ['Track completed transactions', 'Review order history', 'Support sales follow-up'],
        links: [
          { label: 'Open Sales Orders', to: '/orders' },
          { label: 'Open Sales Dashboard', to: '/sales-dashboard' },
          { label: 'Open Customers', to: '/customers' },
        ],
      },
      {
        id: 'quotations',
        title: 'Quotations',
        route: '/sales/quotes',
        navigation: 'Top menu > Sales > Quotations',
        purpose: 'Provides price estimates.',
        description:
          'This page helps customers and sales staff review pricing before purchase confirmation. It supports estimate preparation, internal review, and better customer decision-making.',
        keyUses: ['Prepare estimates', 'Support customer decisions', 'Track quote activity'],
        links: [
          { label: 'Open Quotations', to: '/sales/quotes' },
          { label: 'Open Sales Orders', to: '/orders' },
          { label: 'Open Customers', to: '/customers' },
        ],
      },
      {
        id: 'returns',
        title: 'Returns',
        route: '/returns',
        navigation: 'Top menu > Sales > Returns',
        purpose: 'Handles returned items.',
        description:
          'This page records return activity and helps maintain accurate transaction, customer, and stock records after an item comes back from a customer.',
        keyUses: ['Handle returned items', 'Maintain accurate records', 'Support refund workflows'],
        links: [
          { label: 'Open Returns', to: '/returns' },
          { label: 'Open Sales Orders', to: '/orders' },
          { label: 'Open Reports', to: '/reports' },
        ],
      },
      {
        id: 'reports',
        title: 'Reports',
        route: '/reports',
        navigation: 'Top menu > Sales > Reports',
        purpose: 'Provides sales insights.',
        description:
          'This page is the tabbed Sales & POS reporting workspace for sales-facing and catalog-facing reports only. It includes store-level sales Profit & Loss, store-level sales Balance Sheet, shift/day summaries, item and customer sales analysis, returns, gross profit, GST classifications, detailed sales registers, payment reconciliation, Z-report, POS inventory movement, GST handoff datasets, receivables, cash-vs-credit, user-wise sales, and tax summary. The top date filter changes every active tab, and Excel/PDF export always uses the currently selected tab.',
        keyUses: ['Switch report tabs by business question', 'Apply one date range to every tab', 'Export the active report to Excel or PDF', 'Review sales-only P&L and Balance Sheet logic without opening Accounting reports'],
        links: [
          { label: 'Open Reports', to: '/reports' },
          { label: 'Open Sales Orders', to: '/orders' },
          { label: 'Open Accounting', to: '/accounting' },
        ],
      },
      {
        id: 'customers',
        title: 'Customer Profiles',
        route: '/customers/profiles',
        navigation: 'Top menu > Sales > Customer Profiles',
        purpose: 'Maintains customer master and preference details.',
        description:
          'This route opens the CRM desk on the Profiles tab. Users create and maintain the main customer record here, including contact details, optional email and address, preferences, notes, contact roles, and readiness for booking or sales use.',
        keyUses: ['Create customer profiles', 'Maintain customer preferences', 'Store contact roles and notes', 'Prepare reusable customer master data'],
        links: [
          { label: 'Open Customer Profiles', to: '/customers/profiles' },
          { label: 'Open Customer Enquiries', to: '/customers/enquiries' },
          { label: 'Open CRM Campaigns', to: '/customers/campaigns' },
          { label: 'Open Customer Reports', to: '/customers/reports' },
        ],
      },
      {
        id: 'customer-enquiries',
        title: 'CRM Enquiries',
        route: '/customers/enquiries',
        navigation: 'Top menu > Sales > CRM Enquiries',
        purpose: 'Tracks leads, follow-up, and conversion progress.',
        description:
          'This route opens the CRM desk on the Enquiries tab. Teams capture walk-in, phone, and website leads here, assign owners, track next actions, link an enquiry to an existing or new customer, and convert the enquiry into a quotation or booking flow.',
        keyUses: ['Capture new leads', 'Assign follow-up ownership', 'Track enquiry status', 'Convert leads into sales activity'],
        links: [
          { label: 'Open Customer Enquiries', to: '/customers/enquiries' },
          { label: 'Open Customer Profiles', to: '/customers/profiles' },
          { label: 'Open Quotations', to: '/sales/quotes' },
          { label: 'Open Facility Booking', to: '/facilities' },
        ],
      },
      {
        id: 'customer-campaigns',
        title: 'CRM Campaigns',
        route: '/customers/campaigns',
        navigation: 'Top menu > Sales > CRM Campaigns',
        purpose: 'Runs brochure campaigns and saved follow-up drafts.',
        description:
          'This route opens the CRM desk on the Campaigns tab. Users can draft promotional communication, segment recipients, save campaign drafts, send brochure-style outreach, and keep campaign activity inside the CRM instead of separate spreadsheets or mail tools.',
        keyUses: ['Create campaign drafts', 'Send brochure campaigns', 'Keep campaign history', 'Reuse customer CRM data for outreach'],
        links: [
          { label: 'Open CRM Campaigns', to: '/customers/campaigns' },
          { label: 'Open Customer Profiles', to: '/customers/profiles' },
          { label: 'Open CRM Reports', to: '/customers/reports' },
        ],
      },
      {
        id: 'customer-reports',
        title: 'CRM Reports',
        route: '/customers/reports',
        navigation: 'Top menu > Sales > CRM Reports',
        purpose: 'Shows CRM conversion, retention, and collection trends.',
        description:
          'This route opens the CRM desk on the Reports tab. It summarizes customer counts, enquiry conversion rate, repeat-customer trends, preferred facilities and time slots, pending follow-up cases, and collection watchlist signals for sales and front desk review.',
        keyUses: ['Review CRM performance', 'Track conversion rate', 'Monitor repeat-customer behaviour', 'Watch collection follow-up cases'],
        links: [
          { label: 'Open CRM Reports', to: '/customers/reports' },
          { label: 'Open Customer Profiles', to: '/customers/profiles' },
          { label: 'Open Customer Enquiries', to: '/customers/enquiries' },
          { label: 'Open Quotations', to: '/sales/quotes' },
        ],
      },
    ],
  },
  {
    id: 'operations-menu',
    title: 'Operations Menu',
    summary:
      'The Operations menu is focused on arena usage, services, bookings, events, and membership-based customer engagement.',
    accent: 'from-fuchsia-500/20 via-purple-500/10 to-transparent',
    pages: [
      {
        id: 'facility-setup',
        title: 'Facility Setup',
        route: '/facilities/setup',
        navigation: 'Top menu > Operations > Facility Setup',
        purpose: 'Defines sports facilities.',
        description:
          'This page configures courts, halls, pools, grounds, and other facility types that the arena makes available to customers. It is the basic setup page required before live booking can happen.',
        keyUses: ['Define facilities', 'Configure rates and rules', 'Prepare booking setup'],
        links: [
          { label: 'Open Facility Setup', to: '/facilities/setup' },
          { label: 'Open Facility Booking', to: '/facilities' },
          { label: 'Open Event Booking', to: '/events' },
        ],
      },
      {
        id: 'facility-booking',
        title: 'Facility Booking',
        route: '/facilities',
        navigation: 'Top menu > Operations > Facility Booking',
        purpose: 'Manages bookings.',
        description:
          'This page allows reservation of facilities for customers by date, time, and slot. It helps front desk and operations teams manage customer usage of sports infrastructure efficiently.',
        keyUses: ['Manage bookings', 'Reserve facilities', 'Track customer usage'],
        links: [
          { label: 'Open Facility Booking', to: '/facilities' },
          { label: 'Open Facility Setup', to: '/facilities/setup' },
          { label: 'Open Customers', to: '/customers' },
        ],
      },
      {
        id: 'event-booking',
        title: 'Event Booking',
        route: '/events',
        navigation: 'Top menu > Operations > Event Booking',
        purpose: 'Handles events.',
        description:
          'This page manages event registrations, organizer details, facility allocation, quotation preparation, schedule planning, payment tracking, and printable event confirmations. It supports both single-date and multi-date event workflows, while the linked quotation flow now supports preview, print, email, and booking conversion.',
        keyUses: ['Manage registrations', 'Prepare event quotations', 'Preview, print, or mail quotations', 'Track event payments'],
        links: [
          { label: 'Open Event Booking', to: '/events' },
          { label: 'Open Event Quotations Topic', to: '/user-manual#transaction-event-quotation' },
          { label: 'Open Facility Setup', to: '/facilities/setup' },
          { label: 'Open Settings', to: '/settings' },
        ],
      },
      {
        id: 'create-plan',
        title: 'Create Plan',
        route: '/membership-plans/create',
        navigation: 'Top menu > Operations > Create Plan',
        purpose: 'Defines service plans.',
        description:
          'This page creates pricing and usage packages that can later be attached to members. It is where service rules, pricing structure, and access limits are defined before subscriptions are issued.',
        keyUses: ['Create pricing packages', 'Define usage rules', 'Support membership setup'],
        links: [
          { label: 'Open Create Plan', to: '/membership-plans/create' },
          { label: 'Open Memberships', to: '/memberships' },
          { label: 'Open Membership Reports', to: '/membership-reports' },
        ],
      },
      {
        id: 'create-subscription',
        title: 'Create Subscription',
        route: '/membership-subscriptions/create',
        navigation: 'Top menu > Operations > Create Subscription',
        purpose: 'Manages recurring services.',
        description:
          'This page handles subscription-based access by linking a member to a plan, payment setup, and active period. It is used when a customer joins a recurring service model.',
        keyUses: ['Create subscriptions', 'Assign members to plans', 'Handle recurring access'],
        links: [
          { label: 'Open Create Subscription', to: '/membership-subscriptions/create' },
          { label: 'Open Create Plan', to: '/membership-plans/create' },
          { label: 'Open Memberships', to: '/memberships' },
        ],
      },
      {
        id: 'memberships',
        title: 'Memberships',
        route: '/memberships',
        navigation: 'Top menu > Operations > Memberships',
        purpose: 'Manages members.',
        description:
          'This page tracks membership details, plan status, and active member records. It gives staff a consolidated place to review current member information and ongoing membership activity.',
        keyUses: ['Track membership details', 'Review member status', 'Support customer service'],
        links: [
          { label: 'Open Memberships', to: '/memberships' },
          { label: 'Open Create Subscription', to: '/membership-subscriptions/create' },
          { label: 'Open Membership Reports', to: '/membership-reports' },
        ],
      },
      {
        id: 'membership-reports',
        title: 'Membership Reports',
        route: '/membership-reports',
        navigation: 'Top menu > Operations > Membership Reports',
        purpose: 'Analyzes membership data.',
        description:
          'This page provides insights on usage, renewals, and growth so management can evaluate how the membership business is performing and where attention is needed.',
        keyUses: ['Analyze usage', 'Review renewals', 'Monitor growth'],
        links: [
          { label: 'Open Membership Reports', to: '/membership-reports' },
          { label: 'Open Memberships', to: '/memberships' },
          { label: 'Open Create Plan', to: '/membership-plans/create' },
        ],
      },
    ],
  },
  {
    id: 'accounts-menu',
    title: 'Accounts Menu',
    summary:
      'The Accounts menu gives finance and management teams a controlled workspace for daily accounting, vouchers, reconciliation, and period-end reporting.',
    accent: 'from-cyan-500/20 via-blue-500/10 to-transparent',
    pages: [
      {
        id: 'accounting',
        title: 'Accounting',
        route: '/accounting',
        navigation: 'Top menu > Accounts > Accounting > Left Sidebar Sections',
        purpose: 'Runs the full accounting workspace.',
        description:
          'This page is the central accounting console. Use the left sidebar to move between MIS Dashboard, Invoices & Payments, Vendors / Assets / Periods, Salary & Contract, Opening Balances, Expenses & Income, Vouchers, Cash & Bank Book, Chart & Ledger, and Financial Reports. The Payment Voucher section supports reference-style business fields such as account name, payment purpose, period, and received or authorized details, while printed signature lines can be turned on or off from Settings.',
        keyUses: [
          'Track income, expense, and GST indicators',
          'Manage invoices, payments, vendors, assets, and periods',
          'Record salary, contract, opening, and manual day-book entries',
          'Create and print receipt/payment/journal/transfer vouchers',
          'Reconcile bank entries and export financial statements',
        ],
        links: [
          { label: 'Open Accounting', to: '/accounting' },
          { label: 'Open Settlements', to: '/accounting/settlements' },
          { label: 'Open Reports', to: '/reports' },
        ],
      },
      {
        id: 'settlements',
        title: 'Settlements',
        route: '/accounting/settlements',
        navigation: 'Top menu > Accounts > Settlements',
        purpose: 'Handles payment reconciliation.',
        description:
          'This page ensures transactions match the money actually received, adjusted, or closed. It is important for reconciliation, payment clarity, and clean end-of-day finance control.',
        keyUses: ['Perform reconciliation', 'Handle settlement activity', 'Review receipt matching'],
        links: [
          { label: 'Open Settlements', to: '/accounting/settlements' },
          { label: 'Open Accounting', to: '/accounting' },
          { label: 'Open Reports', to: '/reports' },
        ],
      },
    ],
  },
  {
    id: 'validation-menu',
    title: 'Validation Menu',
    summary:
      'The Validation menu is a separate accountant-friendly workspace for checking whether reports and ledgers are reliable before decision making.',
    accent: 'from-emerald-500/20 via-cyan-500/10 to-transparent',
    pages: [
      {
        id: 'validation-dashboard-page',
        title: 'Validation Dashboard',
        route: '/accounting/validation',
        navigation: 'Top menu > Validation > Validation Dashboard',
        purpose: 'Runs read-only accounting validation and shows exceptions with drill-down evidence.',
        description:
          'This dashboard calls the validation APIs to run checks without modifying accounting collections. The page includes a live Validation Command Center log panel, run controls and schedule settings, summary cards, health gauge, run timeline, saved report list, detailed failures, drill-down records, export options, repair support for selected findings, and an assistant panel for common accounting questions.',
        keyUses: [
          'Run Full Validation Now',
          'Watch activity logs in the Validation Command Center',
          'Review critical, warning, info, and passed checks',
          'Open failed checks and read likely causes',
          'Drill down into source records behind a failure',
          'Export validation results to PDF or Excel',
        ],
        links: [
          { label: 'Open Validation Dashboard', to: '/accounting/validation' },
          { label: 'Open Accounting Reports', to: '/accounting?tab=reports' },
        ],
      },
    ],
  },
  {
    id: 'admin-menu',
    title: 'Admin Menu',
    summary:
      'The Admin menu is responsible for system configuration, security, and shared setup across the entire application.',
    accent: 'from-rose-500/20 via-pink-500/10 to-transparent',
    pages: [
      {
        id: 'settings',
        title: 'Settings',
        route: '/settings',
        navigation: 'Top menu > Admin > Settings',
        purpose: 'Controls system behavior.',
        description:
          'This page manages application configuration and preferences such as business profile, logos, print settings, mail settings, database tools, and shared operating preferences. Inside Settings, use the left sidebar menu to move between Appearance, Business Details, Mail Settings, Invoice Configuration, Printing Preferences, Security, and Backup & Restore.',
        keyUses: ['Manage configuration', 'Control preferences', 'Use the settings sidebar by section', 'Support system setup'],
        links: [
          { label: 'Open Settings', to: '/settings' },
          { label: 'Open Users', to: '/user-management' },
          { label: 'Open Company Create', to: '/admin/company-create' },
        ],
      },
      {
        id: 'users',
        title: 'Users',
        route: '/user-management',
        navigation: 'Top menu > Admin > Users',
        purpose: 'Manages user access.',
        description:
          'This page controls user accounts, roles, and permissions. Administrators use it to decide who can access the system and which modules or pages each user is allowed to open.',
        keyUses: ['Manage users', 'Control roles', 'Manage permissions'],
        links: [
          { label: 'Open Users', to: '/user-management' },
          { label: 'Open Settings', to: '/settings' },
          { label: 'Open Dashboard', to: '/' },
        ],
      },
      {
        id: 'company-create',
        title: 'Company Create',
        route: '/admin/company-create',
        navigation: 'Top menu > Admin > Company Create',
        purpose: 'Defines company details.',
        description:
          'This page stores organization-level company information used during onboarding and system setup. It is typically used by administrators when creating or updating company-level configuration.',
        keyUses: ['Store company details', 'Support onboarding', 'Maintain organization setup'],
        links: [
          { label: 'Open Company Create', to: '/admin/company-create' },
          { label: 'Open Settings', to: '/settings' },
          { label: 'Open Users', to: '/user-management' },
        ],
      },
      {
        id: 'admin-reports',
        title: 'Admin Reports',
        route: '/admin/reports',
        navigation: 'Top menu > Admin > Reports',
        purpose: 'Reviews system activity, audit trails, and login events.',
        description:
          'This page is the admin-facing reporting workspace for system controls. It provides an overview of audit volume and warning thresholds, then splits into Audit Logs, Login Activity, and Transaction Logs so administrators can search system actions, export review data, and manage retention housekeeping.',
        keyUses: ['Review overview metrics', 'Search audit logs', 'Track login activity', 'Inspect transaction log history', 'Export admin report data'],
        links: [
          { label: 'Open Admin Reports', to: '/admin/reports' },
          { label: 'Open Settings', to: '/settings' },
          { label: 'Open Users', to: '/user-management' },
        ],
      },
    ],
  },
];

const quickLinks = [
  ...moduleSummaries.map((module) => ({
    id: module.id,
    title: module.title,
    route: module.route,
    navigation: module.navigation,
    category: 'Main Module',
  })),
  ...menuSections.flatMap((section) =>
    section.pages.map((page) => ({
      id: page.id,
      title: page.title,
      route: page.route,
      navigation: page.navigation,
      category: section.title,
    }))
  ),
];

const navigationFlowSteps: string[] = [
  'Admin sets up company details, users, permissions, settings, and shared system controls.',
  'Catalog team adds products, categories, stock structure, and procurement-related setup.',
  'Operations team prepares facilities, plans, subscriptions, bookings, and event workflows.',
  'Sales team manages customers, quotations, orders, returns, and commercial follow-up.',
  'People module maintains employees, attendance, shifts, and payroll processing.',
  'Accounts tracks financial transactions, reconciliation, settlements, and reporting for management review.',
  'Validation checks the accounting data health separately before audit, filing, or fresh test cycles.',
];

const finalSummaryPoints: string[] = [
  'The application combines sports complex operations, sales, staff, inventory, memberships, and finance into one connected platform.',
  'Each module plays a specific role so the overall business workflow stays structured, efficient, and easier to monitor.',
  'Use the hyperlinks in this manual to open the correct page quickly and use the menu path descriptions when training new users.',
];

const reportLogicSections: ReportLogicSection[] = [
  {
    id: 'report-logic-general',
    title: 'General Rules Used Across Reports',
    description:
      'These rules explain why report totals change after new entries, payments, corrections, or cancellations are saved.',
    topics: [
      {
        name: 'Selected period',
        explanation:
          'Reports normally show only the entries that fall inside the selected day, month, or custom date range.',
      },
      {
        name: 'Final status only',
        explanation:
          'Most final reports count records that are active, posted, approved, or completed. Draft, cancelled, archived, or inactive records are usually left out.',
      },
      {
        name: 'Payments change balances',
        explanation:
          'When money is collected later, the original transaction stays in the report, but the outstanding amount reduces.',
      },
      {
        name: 'Corrections update totals',
        explanation:
          'Returns, refunds, credit notes, and cancellations reduce or correct the original business result shown in reports.',
      },
    ],
  },
  {
    id: 'report-logic-catalog',
    title: 'Catalog Screen Logic',
    description:
      'These notes explain what the catalog pages show, how the top cards behave, and what the main product fields mean before the data reaches sales or stock reports.',
    topics: [
      {
        id: 'product-center-logic',
        name: 'Product Center Metrics',
        explanation:
          'Product Center counts all products for the active tenant. Total Products is the full product count. Inventory, Services, and Non-Inventory are split by item type. Low Stock means inventory items where stock is more than 0 but less than or equal to Min Stock. Out of Stock means stock is 0 or below. Auto-Reorder counts inventory items where Auto Reorder is enabled and stock is at or below Min Stock. Promotions count products with a promotional price greater than 0 whose date window is active today. Stock Value is the cost-based estimate calculated as stock multiplied by cost for inventory items.',
      },
      {
        id: 'product-entry-logic',
        name: 'Product Entry Field Guide',
        explanation:
          'Product Name is the visible item label used across sales and reports. SKU and Barcode are identity codes used for search, billing, and scanning. Category and Subcategory organize the catalog; Item Type controls whether the record behaves as inventory, service, or non-inventory. Price is the main selling price, Cost is the buying or landed cost, Wholesale Price is an alternate selling rate, and Promotional Price only matters inside its Promo Start and Promo End window. GST Rate with CGST, SGST, and IGST controls sales tax treatment; HSN or SAC Code supports GST classification. Initial Stock and Opening Stock Value seed opening quantity and valuation, Min Stock drives low-stock logic, Auto Reorder plus Preferred Reorder Quantity create replenishment suggestions, Unit defines the selling/counting unit, and Variant Size plus Variant Color are comma-separated helpers used to generate the editable variant matrix. Price tiers store bulk pricing by tier name, minimum quantity, and unit price. Batch Tracking, Expiry Required, Serial Number Tracking, and Allow Negative Stock change stock-control behavior.',
      },
      {
        id: 'product-catalog-logic',
        name: 'Product Catalog Fields, Filters, And Cards',
        explanation:
          'The search box scans name, SKU, barcode, category, subcategory, description, HSN code, tax type, variant size, variant color, and serial-tracking text. Category, status, and stock filters narrow the visible rows before cards and pagination are calculated. Filtered Products is the number of rows left after search and filters. Total Stock is the sum of stock for those filtered rows. Low Stock counts filtered rows where stock is more than 0 and less than or equal to Min Stock. Visible Columns is the number of selected table columns plus the Actions column. Auto-Reorder counts filtered rows where Auto Reorder is enabled and stock is at or below Min Stock.',
      },
      {
        id: 'stock-alerts-logic',
        name: 'Stock Alerts Rules',
        explanation:
          'Stock Alerts reviews inventory items only for low-stock and stock-out sections. Low Stock shows inventory items where stock is more than 0 and less than or equal to Min Stock. Out of Stock shows inventory items where stock is 0 or below. Auto-Reorder Queue uses the same threshold but only includes products with Auto Reorder enabled. Inactive Products lists catalog rows where Status is inactive, even if stock still exists.',
      },
    ],
  },
  {
    id: 'report-logic-sales',
    title: 'Sales And Customer Reports',
    description:
      'These reports summarize store-level POS sales, receivables, GST datasets, payment mix, catalog movement, and operational sales performance.',
    topics: [
      {
        id: 'sales-reports-tabs',
        name: 'Sales Reports Menu Tabs',
        explanation:
          'The Sales & POS Reports page is a tabbed workspace for sales-facing and catalog-facing reports only. Start Date and End Date apply to every tab when Refresh is pressed. Export Excel and Export PDF always use the active tab. The top summary cards are driven by the loaded tab datasets: Gross Profit comes from the Gross Profit report, Revenue comes from gross-sales revenue, Outstanding Receivables comes from open POS credit balances, Sales Return uses the approved refund total, and Tax Summary shows sales tax less return tax reversal for the selected period. The available tabs cover store-level sales Profit & Loss, store-level sales Balance Sheet, shift summaries, day-wise sales, item and customer analysis, returns, gross profit, GST classification and note registers, sales registers, payment reconciliation, Z-report, POS inventory movement, GST handoff datasets, receivables, cash vs credit, user-wise sales, and tax summary.',
      },
      {
        name: 'Profit & Loss (Store-level)',
        explanation:
          'A sales-only profit summary. Sales Before Discounts is taxable value plus discount amount. Less Discounts is the saved invoice discount. Net Billed Sales is taxable sales after discounts. Less Sales Returns uses approved returned amount. Net Sales equals billed sales minus returns. COGS is the saved POS item cost, and Gross Profit equals Net Sales minus COGS. This view excludes accounting-only ledger entries such as payroll, vendor bills, and non-POS expenses.',
      },
      {
        name: 'Balance Sheet (Store-level)',
        explanation:
          'A POS-focused balance snapshot. Assets include catalog inventory value, open POS credit receivables, cash drawer cash, and pending digital settlements. Liabilities include output GST payable after return/note reversals. Store Net Position is total assets minus liabilities. This report is designed for POS and inventory oversight rather than the statutory accounting balance sheet.',
      },
      {
        name: 'Sales Summary (Daily / Shift)',
        explanation:
          'Groups posted sales by business day and shift. It compares counter performance, invoice counts, returns, net sales, tax, COGS, and gross profit for each day or shift, making it useful for front desk and cashier review.',
      },
      {
        name: 'Daily Sales Summary',
        explanation:
          'Lists posted invoices by date. Invoice count is the number of bills, sales amount is the saved total, tax amount is the GST on those invoices, and outstanding is the unpaid balance still due.',
      },
      {
        name: 'Item-wise Sales',
        explanation:
          'Sums sales invoice item lines by product. It shows quantity sold, taxable value, tax amount, and line total for each item so you can see which products drive revenue and volume.',
      },
      {
        name: 'Customer-wise Sales',
        explanation:
          'Groups posted invoices by customer. It shows invoice count, total billed value, tax, total amount, and outstanding balance for each customer, helping track customer revenue and credit exposure.',
      },
      {
        name: 'Sales Returns',
        explanation:
          'Uses approved return records only. It shows returned goods value, returned GST, and refund or adjustment value so you can understand how returns affect net sales and tax.',
      },
      {
        name: 'Gross Profit',
        explanation:
          'Compares posted sales revenue against saved item cost. Revenue is total sales value, cost of goods is item cost, Gross Profit is revenue minus cost, and Margin % shows profit as a percentage of revenue.',
      },
      {
        name: 'HSN-wise Sales',
        explanation:
          'Groups posted sales by HSN/SAC classification. It shows taxable value and GST by code, allowing easy review of product classification and GST reporting categories.',
      },
      {
        name: 'Taxable / Exempt / Nil / Non-GST',
        explanation:
          'Separates billed values into GST treatment buckets. It shows how much revenue was taxable, exempt, nil-rated, or outside GST so you can confirm the sales mix for tax compliance.',
      },
      {
        name: 'B2B vs B2C Invoice Report',
        explanation:
          'Classifies invoices as B2B when a valid customer GSTIN exists and B2C otherwise. It shows counts and values for registered-party versus consumer billing.',
      },
      {
        name: 'Credit / Debit Note Register (GST)',
        explanation:
          'Lists GST-impacting note records from credit note and sales return workflows. It shows taxable value and tax adjustments linked to the original invoice and correction type.',
      },
      {
        name: 'Sales Register (Detailed)',
        explanation:
          'Lists every posted invoice row with customer, document number, GSTIN, taxable value, tax split, total value, and status. This is the most detailed sales register for audit review and export.',
      },
      {
        name: 'Payment Reconciliation Report',
        explanation:
          'Compares posted invoice values with payment settlement values. It shows invoice count, taxable value, tax, total billed amount, outstanding amount, and pending settlement when payments are not completed.',
      },
      {
        name: 'Z-Report (End of Day)',
        explanation:
          'Summarizes end-of-day counter performance. It shows day invoice totals, approved returns, payment mode totals, and closing cash values for daily billing close review.',
      },
      {
        name: 'Inventory Movement (POS only)',
        explanation:
          'Shows stock movement caused only by posted POS invoice sales. It helps verify how selling activity reduced inventory quantities without mixing procurement or adjustment activity.',
      },
      {
        name: 'GST Handoff Datasets',
        explanation:
          'Prepares GST-facing export datasets from sales transactions, returns, and note activity. It is used to hand off sales-side data for GST review, verification, or filing preparation.',
      },
      {
        name: 'Outstanding Receivables',
        explanation:
          'Lists remaining unpaid credit invoices. Total outstanding is the sum of unpaid sales credit balances for the selected period, helping track what customers still owe.',
      },
      {
        name: 'Cash vs Credit Sales',
        explanation:
          'Splits invoices into cash and credit categories by invoice payment type. It shows invoice count and value for immediate collections versus receivable-based billing.',
      },
      {
        name: 'User-wise Sales',
        explanation:
          'Groups posted invoices by the staff user who handled them. It shows invoice count, billed value, and payment-mode mix so you can review staff sales performance.',
      },
      {
        name: 'Tax Summary',
        explanation:
          'Summarizes GST totals by tax rate and includes approved return tax reversals. It shows billed taxable value and tax amounts so you can validate sales tax for the filtered date range.',
      },
    ],
  },
  {
    id: 'report-logic-inventory',
    title: 'Inventory And Stock Reports',
    description:
      'These reports explain stock position, stock value, movement, and product performance.',
    topics: [
      {
        name: 'Inventory Stock Summary',
        explanation:
          'Uses the current stock saved for each stock-tracked product and shows how many items are in stock, low on stock, or out of stock, along with their current value.',
      },
      {
        name: 'Low Stock Report',
        explanation:
          'Shows products where current stock is at or below the minimum stock level defined in product setup.',
      },
      {
        name: 'Inventory Valuation',
        explanation:
          'Multiplies current quantity by cost price and by selling price to show stock value at cost, stock value at retail, and the possible margin between them.',
      },
      {
        name: 'Inventory Movement',
        explanation:
          'Summarizes stock coming in, stock going out, transfers, and adjustments using the receive, return, transfer, and stock correction activity already saved.',
      },
      {
        name: 'Dead Stock And Fast Moving',
        explanation:
          'Dead stock means items still in hand but not sold within the selected period. Fast moving means items with the highest quantity sold in that period.',
      },
    ],
  },
  {
    id: 'report-logic-people',
    title: 'Attendance And Payroll Figures',
    description:
      'These figures come from employee setup, daily attendance, overtime, and payroll generation.',
    topics: [
      {
        name: 'Attendance Detail And Monthly Sheet',
        explanation:
          'The employee-wise detail report reads each saved attendance row and shows the date, employee, status, check-in, check-out, worked time, overtime, and location link. The monthly sheet reads the same attendance rows and places them into a one-month calendar-style grid with a tick mark wherever presence was recorded.',
      },
      {
        name: 'Payroll Output',
        explanation:
          'Uses attendance, weekly offs, overtime, and employee salary or rate setup to calculate base pay, overtime pay, payable days, and total salary due for the month.',
      },
    ],
  },
  {
    id: 'report-logic-accounts',
    title: 'Accounts And Settlement Reports',
    description:
      'These reports explain how income, expense, balances, vouchers, books, and day-end collections are derived.',
    topics: [
      {
        id: 'accounting-dashboard-logic',
        name: 'Accounting Dashboard',
        explanation:
          'The dashboard uses the selected period and current accounting data to show selected revenue, month-to-date revenue, expense, profit, GST payable, recent activity, and compliance snapshots. Selected Revenue is income posted between the chosen start and end dates. Month-to-date Revenue is income from the first day of the selected end-date month through the selected end date. Expense includes posted expense ledger movement inside the selected range, with payroll, contract cost, and legacy fallback expenses used only where a ledger posting is not already available.',
      },
      {
        id: 'accounting-report-logic',
        name: 'Accounting Reports Overview',
        explanation:
          'The overview tab combines the selected date range into Total Income, Total Expense, Net Profit/Loss, Balance Sheet position, TDS snapshot, recent accounting activity, and recent journal entries. Total Income is income ledger credits minus income ledger debits, with legacy sales or manual income fallback rows included only where required. Total Expense is expense ledger debits minus expense ledger credits, with payroll, contract, and manual expense fallback rows included only where required.',
      },
      {
        id: 'accounting-trial-balance-logic',
        name: 'Trial Balance',
        explanation:
          'Trial Balance starts with each ledger opening balance, adds all debit movement inside the selected period, subtracts all credit movement inside the selected period, and calculates closing balance. Debit balance and credit balance are derived from that closing balance. The total debit balance should equal total credit balance when the books are balanced.',
      },
      {
        id: 'accounting-profit-loss-logic',
        name: 'Profit And Loss',
        explanation:
          'Profit & Loss compares period income against period expenses. Income is income-ledger credits minus debits, excluding opening entries. Expense is expense-ledger debits minus credits, excluding opening entries. Net Profit/Loss is Total Income minus Total Expense. Legacy sales, day book, salary, and contract rows are used only as fallback when source documents do not already have ledger postings.',
      },
      {
        id: 'accounting-balance-sheet-logic',
        name: 'Balance Sheet',
        explanation:
          'Balance Sheet is calculated as on the selected end date. Assets use debit-positive closing balances of asset accounts. Liabilities use credit-positive closing balances of liability accounts. Equity includes capital, opening balance accounts, and retained earnings. Retained earnings is profit or loss accumulated up to the selected date. Difference is Assets minus Liabilities plus Equity, and should become zero after diagnostics are resolved.',
      },
      {
        id: 'accounting-tds-report-logic',
        name: 'TDS Report Suite',
        explanation:
          'TDS reports follow the complete deduction lifecycle. TDS Deducted is the sum of TDS transaction amounts. Deposited is the non-cancelled challan payment recorded against TDS. Outstanding is deducted amount minus deposited or allocated amount. The suite also includes computation, payables, outstanding, quarterly returns, certificates, 26AS/AIS reconciliation, mismatch checks, challan status, payment register, correction returns, audit trail, and Tax Audit Clause 34(a).',
      },
      {
        id: 'accounting-master-report-logic',
        name: 'Master Reports',
        explanation:
          'Vendor, asset, and financial-period reports come from master setup. Vendor balances use vendor opening balance and linked supplier ledger movement where available. Fixed asset book value is cost minus accumulated depreciation posted through asset workflows. Financial period status tells the system whether a date range is open or locked.',
      },
      {
        id: 'accounting-transaction-report-logic',
        name: 'Invoice, Payment, And Voucher Reports',
        explanation:
          'Invoice balance is invoice total minus paid amount. Payment reports show posted customer and vendor payment amounts by party and mode. Voucher reports show receipt, payment, journal, and transfer vouchers. Balanced vouchers must have equal debit and credit ledger lines.',
      },
      {
        id: 'accounting-payroll-report-logic',
        name: 'Salary And Contract Reports',
        explanation:
          'Salary reports show gross salary, statutory deductions, voluntary deductions, net pay, employer payroll taxes, benefits expense, and total payroll cost. Net Pay is Gross Salary minus deductions. Total Payroll Cost is Gross Salary plus employer payroll taxes plus benefits expense. Contract reports show contractor payments and TDS status where applicable.',
      },
      {
        id: 'accounting-book-report-logic',
        name: 'Day Book, Cash Book, And Bank Book',
        explanation:
          'Day Book is the chronological register of manual income, manual expense, and operational accounting movement. Cash Book includes only entries that affect cash-in-hand accounts, and closing cash is opening cash plus cash inflows minus cash outflows. Bank Book includes only entries that affect bank accounts, and closing bank is opening bank balance plus bank inflows minus bank outflows.',
      },
      {
        name: 'MIS Summary, Collections, And Day-End',
        explanation:
          'The MIS summary combines major income and expense totals. Daily collection compares cash sales, cash receipts, and cash expenses. Day-end starts with opening cash, applies the day’s cash movement, and compares system cash with physical cash counted.',
      },
    ],
  },
  {
    id: 'report-logic-validation',
    title: 'Validation Dashboard And Accounting Health',
    description:
      'These checks are separate from normal reports. They help accountants confirm whether report totals can be trusted.',
    topics: [
      {
        id: 'validation-dashboard-logic',
        name: 'Validation Dashboard',
        explanation:
          'The Validation Dashboard calls the read-only validation API. It runs checks such as double-entry integrity, trial balance, balance sheet equation, TDS/GST reconciliation, missing sequences, closed-period postings, orphan references, suspense balances, depreciation checks, and round-off differences. Results are stored in validation report collections and do not modify existing accounting transactions.',
      },
      {
        name: 'Validation Health Score',
        explanation:
          'The health score is a management indicator based on how many checks passed and how many critical or warning failures exist. Critical issues reduce confidence most, warnings reduce it moderately, and passed checks improve the score.',
      },
      {
        name: 'Drill Down And False Positive Feedback',
        explanation:
          'When a check fails, the user can open drill-down data to see the source records behind the issue. If an auditor confirms the issue is acceptable, the feedback is saved separately without changing accounting data.',
      },
    ],
  },
  {
    id: 'report-logic-membership',
    title: 'Membership Reports',
    description:
      'These reports explain member counts, renewals, revenue, expiring memberships, and benefit usage.',
    topics: [
      {
        name: 'Active, Expired, And Expiring Counts',
        explanation:
          'These figures come from the current membership status and the saved end dates of member subscriptions.',
      },
      {
        name: 'Revenue, Renewal Rate, And Retention',
        explanation:
          'Revenue comes from amounts collected for subscriptions and renewals. Renewal rate compares renewals in the period with active members. Retention looks at how many members stayed long enough to have renewal history.',
      },
      {
        name: 'Most Popular Plan',
        explanation:
          'This is the plan with the highest number of subscriptions assigned to it.',
      },
      {
        name: 'Reminder Channels And Benefit Analytics',
        explanation:
          'Reminder analytics show sent or failed reminder activity. Benefit analytics summarize discounts, point redemption, savings, and points earned when membership benefits are used at billing time.',
      },
    ],
  },
];

const sampleEntrySections: SampleEntryGroup[] = [
  {
    id: 'sample-bookings',
    title: 'Booking And Event Screens',
    description:
      'Use these examples when training front desk and operations teams to enter bookings consistently.',
    entries: [
      {
        title: 'Facility Booking',
        sample:
          'Facility Badminton Court 2, Booking Date 2026-04-10, Customer Phone 9876543210, Customer Name Rahul Menon, Customer Email rahul@example.com, Start Time 18:00, End Time 19:00, Courts 1, Payment Status Paid, Amount 600, Notes Weekend coaching slot.',
        result:
          'The booking appears in the facility board, customer history, and booking-related revenue views.',
      },
      {
        title: 'Event Booking',
        sample:
          'Event Name Summer Shuttle League, Organizer Metro Sports Club, Phone 9895012345, Email events@metrosports.in, Facilities Court 1 and Court 2, Date Range 2026-05-01 to 2026-05-03, Time 09:00 to 18:00, Status Confirmed, Total Amount 18000, Advance 5000 by Bank Transfer, Remarks Inter-club doubles tournament.',
        result:
          'The event schedule is reserved, the balance due is tracked, and event-payment follow-up becomes available.',
      },
    ],
  },
  {
    id: 'sample-sales',
    title: 'Sales Screens',
    description:
      'These examples show how a normal sale, quotation, and return can be entered by staff.',
    entries: [
      {
        title: 'Sales Invoice',
        sample:
          'Sell Yonex Mavis 350 Shuttle quantity 10 and Badminton Grip quantity 4, Customer Phone 9847001122, Customer Name Anjali Nair, Membership / Member ID ANJ-MEMBER-02, Email ID anjali@example.com, Discount Mode Amount with Discount 100, Payment Method UPI, Invoice Type Paid Now, Save Mode Finalise Invoice, Tax Mode GST Bill, Notes Counter sale after coaching session.',
        result:
          'Sales, item-wise sales, customer-wise sales, GST totals, payment-mode summaries, and stock movement update immediately after final posting.',
      },
      {
        title: 'Quotation',
        sample:
          'Customer Rising Stars Academy, Contact Person Vivek Joseph, Phone 9846011122, Valid Until 2026-04-30, Tax Mode Tax exclusive, GST Quote On, Items Team Jersey quantity 30 and Practice Cone Set quantity 6, Notes Delivery within 5 working days.',
        result:
          'The quote stays in the quotation register and affects final sales only after conversion to an invoice.',
      },
      {
        title: 'Sales Return',
        sample:
          'Source Invoice INV-260407-00012, Return Item Shuttle tubes quantity 2, Reason Damaged seal, Refund Method Original payment, Refund Amount 720.',
        result:
          'Approved return totals move into return and refund-related reports and correct the original business result.',
      },
    ],
  },
  {
    id: 'sample-membership',
    title: 'Membership Screens',
    description:
      'These examples help staff set up plans, issue subscriptions, and renew members correctly.',
    entries: [
      {
        title: 'Create Plan',
        sample:
          'Plan Name Monthly Badminton Prime, Plan Type Paid, Status Active, Billing Cycle Monthly, Validity Days 30, Grace Days 5, Plan Price 2500, Discount 10 percent, Points per Currency 1, Minimum Redeem Points 100, Auto Renew On, Description Evening access with member discounts.',
        result:
          'The plan becomes available for new subscriptions and future membership benefit calculations.',
      },
      {
        title: 'Create Subscription',
        sample:
          'Plan Monthly Badminton Prime, Full Name Sreya Thomas, Mobile 9895123456, Email sreya@example.com, Start Date 2026-04-08, Amount Paid 2500, Reminder Days 7, Auto Renew Off, Notes Student discount approved.',
        result:
          'The member appears in membership lists, expiry alerts, reminder activity, and membership reports.',
      },
      {
        title: 'Membership Renewal',
        sample:
          'Renew Sreya Thomas using Renewal Type Manual, Amount Paid 2500, Notes Renewed at front desk.',
        result:
          'Renewal history, renewal revenue, and renewal-rate analytics are updated.',
      },
    ],
  },
  {
    id: 'sample-people',
    title: 'People Screens',
    description:
      'These examples help HR and supervisors enter attendance and generate payroll in a consistent way.',
    entries: [
      {
        title: 'Employee Check In',
        sample:
          'Employee opens the page at the sports complex, allows mobile GPS, taps Check In Now at 09:02, and later taps Check Out Now at 18:11 before leaving.',
        result:
          'The system captures both times automatically and the saved day supports attendance summary and payroll review.',
      },
      {
        title: 'Attendance Entry',
        sample:
          'Status Present, Check In 09:00, Check Out 18:15, Overtime Hours 0.5, Notes Covered evening shift.',
        result:
          'The employee’s daily attendance summary and monthly payroll input are updated.',
      },
      {
        title: 'Payroll Generation',
        sample:
          'Select Month 2026-04 and click Generate.',
        result:
          'The system calculates payable days, overtime pay, and total payout from attendance and employee setup.',
      },
    ],
  },
  {
    id: 'sample-accounts',
    title: 'Accounts Screens',
    description:
      'These examples show realistic entries for day-to-day accounting, voucher, and balance work.',
    entries: [
      {
        title: 'Accounting Invoice',
        sample:
          'Invoice Date 2026-04-07, Customer Sunrise Sports School, Description Coaching court rental for April week 1, Base Amount 12000, GST Amount 2160, Initial Payment 5000, GST Treatment Intrastate, Payment Mode Bank Transfer, Revenue Account Booking Revenue.',
        result:
          'Income increases and any unpaid portion appears in receivables and outstanding reports.',
      },
      {
        title: 'Expense Or Vendor Bill',
        sample:
          'Expense Date 2026-04-07, Description LED floodlight repair, Amount 4500, Paid Amount 2000, Payment Mode Bank Transfer, Expense Account Repairs and Maintenance, Vendor Bright Power Services.',
        result:
          'Expense totals, vendor balances, and profit-and-loss expense figures update.',
      },
      {
        title: 'Salary Payment',
        sample:
          'Employee EMP-014 Nikhil Raj, Month 2026-04, Pay Date 2026-04-30, Amount 22000, Bonus Amount 1500, Payment Method Bank Transfer, Notes Festival incentive.',
        result:
          'Salary history, expense reports, and payslip tracking are updated.',
      },
      {
        title: 'Contract Payment',
        sample:
          'Contractor Aqua Tech Solutions, Contract Title Pool filtration AMC, Payment Date 2026-04-18, Amount 8000, Status Paid, Payment Method Bank Transfer, Notes Quarterly maintenance payment.',
        result:
          'Contract expense moves into payment history and accounting expense totals.',
      },
      {
        title: 'Daily Expense Or Income Entry',
        sample:
          'Expense example: Category Electricity, Amount 3250, Payment Method Cash, Reference EB-APR-07. Income example: Category Sponsorship, Amount 10000, Payment Method Bank Transfer, Reference SP-APR-01.',
        result:
          'These entries flow into income, expense, profit-and-loss, cash-book, or bank-book views depending on type and payment mode.',
      },
      {
        title: 'Receipt, Payment, Journal, And Transfer Vouchers',
        sample:
          'Receipt Voucher: Amount 3500, Category Other Income, Counterparty Arena Cafe. Payment Voucher: Reference PV-APR-07-03, Account Petty Cash Expense, Being Payment Of Plumbing repair, Amount 1800, Mode Cash. Journal Voucher: Debit Prepaid Expenses, Credit Bank Charges Payable, Amount 2500. Cash-Bank Transfer: Amount 15000, Direction Cash to Bank, Notes Daily cash deposit.',
        result:
          'These voucher entries affect receipt history, payment history, ledger balances, cash book, and bank book.',
      },
      {
        title: 'Opening Balances',
        sample:
          'Cash 25000 debit, Bank 180000 debit, Opening Stock 52000 debit, Customer Sunrise Sports School 15000 debit, Supplier Bright Power Services 7000 credit.',
        result:
          'These become the opening point for ledgers, trial balance, and balance sheet reporting.',
      },
    ],
  },
  {
    id: 'sample-settlement',
    title: 'Settlement Screens',
    description:
      'Use these entries when collecting balances, managing credit, and closing the day.',
    entries: [
      {
        title: 'Settlement Receipt Voucher',
        sample:
          'Customer Sunrise Sports School, Amount 8000, Mode Bank Transfer, Notes Part payment against April invoice, then allocate that amount against the outstanding invoice shown on screen.',
        result:
          'Outstanding receivable reduces and collection reports increase.',
      },
      {
        title: 'Credit Note',
        sample:
          'Customer Anjali Nair, Reason Wrong product billed, Subtotal 1200, Tax 216, Total 1416, Notes To be adjusted against next purchase.',
        result:
          'Customer credit balance increases and can later be adjusted or refunded.',
      },
      {
        title: 'Day-End Closing',
        sample:
          'Business Date 2026-04-07, Opening Cash 12000, Physical Closing Cash 28450, Notes Includes tournament walk-in collections.',
        result:
          'The system compares expected closing cash with physical cash and shows the difference as variance.',
      },
    ],
  },
  {
    id: 'sample-procurement',
    title: 'Inventory And Procurement Screens',
    description:
      'These examples show how purchasing and stock receipt activity should be entered.',
    entries: [
      {
        title: 'Create Purchase Order',
        sample:
          'Supplier Ace Sports Wholesale, Expected Date 2026-04-12, Item 1 Yonex Mavis 350 Shuttle quantity 50 at unit cost 720, Item 2 Replacement Net quantity 4 at unit cost 950, Notes Restocking before district tournament.',
        result:
          'The purchase order enters the procurement register, but stock rises only after goods are received.',
      },
      {
        title: 'Receive Stock',
        sample:
          'Against the purchase order, receive Shuttle quantity 40, Warehouse Main Store, Batch SH-APR-26-A, Expiry Date 2027-04-01.',
        result:
          'Stock on hand increases and inventory movement shows a stock-in entry. After receipt, use Create Bill to post inventory value debit and supplier payable credit to accounting.',
      },
      {
        title: 'Create Purchase Bill From Receipt',
        sample:
          'After receiving goods for PO-20260412-00001, click Create Bill in Procurement.',
        result:
          'The system creates or recreates the linked purchase bill, posts a journal entry to Stock in Hand and Accounts Payable, and writes audit history.',
      },
      {
        title: 'Purchase Return',
        sample:
          'Return Replacement Net quantity 1 with Reason Damaged stitching from supplier pack.',
        result:
          'Received stock reduces and inventory movement records stock going back out.',
      },
    ],
  },
];

const salesInvoiceFieldGuide: FieldGuideRow[] = [
  {
    field: 'Quick actions: New Sale, Hold, Recall, Print, Sync Now, More',
    whyItMatters: 'These controls manage the current bill lifecycle without forcing staff to leave the billing page.',
    howToUse: 'Use New Sale to start over, Hold to park the bill, Recall to reopen held or draft bills, Print for invoice output, Sync Now for offline queue upload, and More for recovery or round-off tools.',
    example: 'Hold a half-finished bill during a phone call, then reopen it from Recall when the customer returns.',
  },
  {
    field: 'Walk-in Customer',
    whyItMatters: 'Walk-in mode tells the system to save the sale without customer lookup, customer credit, or CRM linking.',
    howToUse: 'Turn it on only when the sale truly does not need customer identification. Leave it off for customer-linked billing.',
    example: 'Use Walk-in Customer for a quick anonymous counter sale of grips and shuttle tubes.',
  },
  {
    field: 'Customer Phone',
    whyItMatters: 'This is the main customer identity field and it controls lookup, repeat billing, store credit, and receivable linking.',
    howToUse: 'Enter a valid 10-digit mobile number, use Arrow keys to move through matches, and press Enter to select an existing customer when a match appears.',
    example: 'Type 9847001122, press Arrow Down to highlight Anjali Nair, then press Enter.',
  },
  {
    field: 'Customer Name',
    whyItMatters: 'The visible invoice name must stay aligned with the customer who is actually being billed.',
    howToUse: 'Confirm or edit the name after selecting the customer phone. Keep it blank only until the correct linked customer is identified.',
    example: 'After selecting the phone match, confirm Customer Name shows Anjali Nair.',
  },
  {
    field: 'Membership / Member ID (optional)',
    whyItMatters: 'This helps the cashier connect the bill to a member reference during customer verification.',
    howToUse: 'Type the member code or reference when the customer belongs to a membership or loyalty flow.',
    example: 'Enter ANJ-MEMBER-02 while verifying a known member at the front desk.',
  },
  {
    field: 'Invoice No., Auto / Manual, and Manual Invoice Number',
    whyItMatters: 'Invoice numbering must stay clean for audit, print output, and migrated or pre-printed number workflows.',
    howToUse: 'Use Auto for normal billing. Switch to Manual only when a specific external or legacy invoice number must be preserved, then fill Manual Invoice Number.',
    example: 'Choose Manual and enter MAN-APR-001 for a migrated legacy invoice reference.',
  },
  {
    field: 'Date and Tax Bill quick toggle',
    whyItMatters: 'The invoice date, current status, and GST quick toggle tell staff what business mode the bill is in before checkout.',
    howToUse: 'Review the current date card and use the GST quick switch only when tax mode needs to change immediately.',
    example: 'Switch GST off for a non-taxable invoice before reviewing totals.',
  },
  {
    field: 'Scanner Settings and Scanner On / Off',
    whyItMatters: 'Different counters use different barcode devices and submit keys.',
    howToUse: 'Open Scanner Settings to set behavior, then turn scanner mode on only when staff is actively scanning SKU or barcode input.',
    example: 'Enable scanner mode before a rush-hour batch of barcode-based sales.',
  },
  {
    field: 'Scan / Search Product',
    whyItMatters: 'This is the fastest product-entry lane on the billing screen.',
    howToUse: 'In scanner mode, scan and submit with the configured key. In manual mode, type product name, SKU, or barcode, move through results with Arrow keys, and press Enter to add the highlighted result.',
    example: 'Type TEN, Arrow Down to Tennis Racket, then press Enter to add it.',
  },
  {
    field: 'Open Product Search',
    whyItMatters: 'The full product catalog dialog is needed when quick search is not enough or staff needs the full list.',
    howToUse: 'Open the dialog, search the cached catalog, move row by row with the keyboard, and press Enter or click the row to add the product.',
    example: 'Open Product Search, search Football, highlight Football A, and press Enter to add it.',
  },
  {
    field: 'Items table',
    whyItMatters: 'This is the live billing grid that decides what stock will move and what value will be charged.',
    howToUse: 'Review every row after adding products. Confirm item, variant, quantity, row amount, and any stock-control details before checkout.',
    example: 'After adding 3 items, check that every row shows the right product and price before payment.',
  },
  {
    field: 'Variant',
    whyItMatters: 'Variant-level size, color, and price must match the exact unit sold.',
    howToUse: 'Pick the correct variant in the row whenever the product has size, color, or variant-specific pricing.',
    example: 'Change the row from Size 5 / White to Size 6 / Blue before posting.',
  },
  {
    field: 'Quantity',
    whyItMatters: 'Quantity directly affects stock reduction, line totals, taxable value, and final billing amount.',
    howToUse: 'Use the minus and plus buttons in the row to reduce or increase units for that line.',
    example: 'Press plus once to change a shuttle tube row from 1 unit to 2 units.',
  },
  {
    field: 'Serial Tracking',
    whyItMatters: 'Serial capture should happen only on the rows that truly require unit-level traceability.',
    howToUse: 'Leave it off for normal retail items. Turn it on only for serial-enabled products that need warranty, audit, or service follow-up tracking.',
    example: 'Turn Serial Tracking on for a warranty racket and leave it off for grips or cones.',
  },
  {
    field: 'Batch No and Expiry Date',
    whyItMatters: 'These fields preserve traceability and compliance for stock that is batch-controlled or expiry-controlled.',
    howToUse: 'Fill them only for the rows whose product setup requires batch and expiry data.',
    example: 'Enter batch LOT-APR-02 and expiry 2026-12-31 for a nutrition item.',
  },
  {
    field: 'Serial Numbers',
    whyItMatters: 'This stores the actual serial list used by the sale when serial tracking is enabled on the row.',
    howToUse: 'Enter one serial per line or comma-separated values until the captured count matches the billed quantity.',
    example: 'Enter RK-2401-001 and RK-2401-002 for two serial-tracked rackets.',
  },
  {
    field: 'Bill Summary totals',
    whyItMatters: 'This is the cashier’s last financial checkpoint before posting.',
    howToUse: 'Review Subtotal, GST, Discount, Store Credit, Grand Total, Round-off, and the current collection figure before clicking the final action button.',
    example: 'Confirm that Grand Total is Rs3,150 and Collect Now is also Rs3,150 before taking payment.',
  },
  {
    field: 'Discount',
    whyItMatters: 'Discount changes the payable amount and affects net sales and tax basis.',
    howToUse: 'Choose Amount for flat discount or % for percentage discount, then enter the number.',
    example: 'Choose Amount and enter 100 for a flat Rs100 discount.',
  },
  {
    field: 'Points & Membership',
    whyItMatters: 'This area applies member benefits and loyalty-point redemption to the current bill.',
    howToUse: 'Enter Redeem Points, then click Apply after identifying the customer with a valid phone number.',
    example: 'Enter 200 redeem points and click Apply to preview the benefit.',
  },
  {
    field: 'Store Credit',
    whyItMatters: 'Store credit reduces the collectible amount without changing the item rows.',
    howToUse: 'Review available balance, choose a credit note, enter Apply Amount, then click Apply Credit. Clear removes the selection.',
    example: 'Select CN-APR-02 and apply Rs300 to reduce the bill by Rs300.',
  },
  {
    field: 'Payment Method',
    whyItMatters: 'Collection reporting depends on the real payment channel used by the customer.',
    howToUse: 'Choose Cash, Card, UPI, or Bank Transfer to match the actual payment mode.',
    example: 'Choose UPI when the customer completes the bill by scanning the QR code.',
  },
  {
    field: 'Split Payments',
    whyItMatters: 'Mixed-mode collection must be captured accurately for reconciliation and cashier control.',
    howToUse: 'Add split rows, enter Method and Amount, and use Cash Received for cash rows so the screen can show Change Due.',
    example: 'Use Cash Rs1,000 and UPI Rs1,500 on the same bill.',
  },
  {
    field: 'Credit Settlement',
    whyItMatters: 'Partial collection on a Pay Later invoice must leave the correct outstanding balance behind.',
    howToUse: 'When Invoice Type is Pay Later, enter the amount collected now and review the Outstanding figure before posting.',
    example: 'For a Rs10,000 credit invoice, record Rs3,000 paid now and leave Rs7,000 outstanding.',
  },
  {
    field: 'Invoice Type, Save Mode, and Tax Mode',
    whyItMatters: 'These controls decide whether the invoice is settled or receivable, draft or posted, and GST or non-GST.',
    howToUse: 'Choose Paid Now or Pay Later, Finalise Invoice or Save as Draft, and GST Bill or Non-GST Bill before final checkout.',
    example: 'For a normal counter sale use Paid Now, Finalise Invoice, and GST Bill.',
  },
  {
    field: 'Invoice Notes',
    whyItMatters: 'Notes preserve context that may matter later for service, audit, or customer follow-up.',
    howToUse: 'Add short meaningful notes only when the sale needs explanation beyond the standard line items and payment fields.',
    example: 'Enter Counter sale after coaching session.',
  },
  {
    field: 'Advanced Options: Email, Address, Round-off, Print Profile, Snapshot',
    whyItMatters: 'These are lower-frequency billing details that still matter for delivery, print behavior, and final review.',
    howToUse: 'Open Advanced Options for Email ID, Address, Round-off Mode, Print Profile, and Invoice Snapshot review when those details are needed.',
    example: 'Enter customer email for delivery, confirm the print profile, and review the invoice snapshot before save.',
  },
  {
    field: 'Hold and Post Invoice / Save Draft button',
    whyItMatters: 'These are the final actions that convert the screen state into a stored billing transaction.',
    howToUse: 'Use Hold to park the sale. Use the final button only after all row details, totals, and collection values are verified.',
    example: 'Click Hold during interruption, then return later and press Post Invoice Rs2,593.64 after review.',
  },
];

const transactionGuideSections: TransactionGuideSection[] = [
  {
    id: 'transactions-front-desk',
    title: 'Front Desk, Booking, And Sales Transactions',
    description:
      'These screens are used by front desk, sales, and customer-service teams to record customer activity and money movement.',
    guides: [
      {
        id: 'transaction-facility-booking',
        title: 'Facility Booking',
        navigation: 'Top menu > Operations > Facility Booking',
        route: '/facilities',
        whatItDoes:
          'Use this screen to reserve a facility slot for a customer by date, time, and number of courts or units.',
        businessLogic:
          'The screen checks the selected facility, time slot, and customer details before saving the booking. If payment is marked as paid or partial, the booking immediately becomes part of operational follow-up and collection tracking.',
        practicalExample:
          'Book Badminton Court 2 for Rahul Menon on 2026-04-10 from 18:00 to 19:00, mark payment as paid, enter amount 600, and save the note Weekend coaching slot.',
        reportFlow:
          'The saved booking feeds facility schedules, customer history, occupancy review, and any booking-related income views used by management.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-event-booking',
        title: 'Event Booking',
        navigation: 'Top menu > Operations > Event Booking',
        route: '/events',
        whatItDoes:
          'Use this screen to reserve one or more facilities for an organizer over a single date or a date range.',
        businessLogic:
          'The screen blocks the selected facilities for the event dates, stores the organizer and contact details, and keeps track of total amount, advance received, and balance still due.',
        practicalExample:
          'Create Summer Shuttle League for Metro Sports Club from 2026-05-01 to 2026-05-03, use Court 1 and Court 2 from 09:00 to 18:00, total 18000, advance 5000 by bank transfer, and save Remarks as Inter-club doubles tournament.',
        reportFlow:
          'The event becomes visible in the event calendar, payment-due reminders, and any collection or organizer follow-up views tied to events.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-event-quotation',
        title: 'Event Quotation',
        navigation: 'Top menu > Operations > Event Booking > Event Quotations',
        route: '/events',
        whatItDoes:
          'Use this screen to prepare a professional quotation for one or more sports facilities before the organizer confirms the event booking.',
        businessLogic:
          'The screen loads default facility charges from the selected courts or other facilities, lets the user edit every amount, applies discount and GST, and saves the quotation with version history. Users can preview the PDF, print it, or send it by email directly from the quotation flow. A revised quote does not remove the old one; the older version stays in history and the latest version becomes the working copy.',
        practicalExample:
          'Create a quotation for State Badminton Camp using Full Court 1 and Full Court 2 for 2026-05-10 to 2026-05-12 from 09:00 to 13:00, refresh facility pricing, give 10 percent discount, apply 18 percent GST, edit the default terms, save the quote, preview the PDF, and then send it by email to the organizer before the dates are confirmed.',
        reportFlow:
          'The quotation stays in event quotation tracking and does not block the facility permanently until the user loads it into the booking form and saves the actual event booking. Once the booking is created from the quotation, the quote is marked as booked and the event moves into calendar and payment follow-up views.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-sales-invoice',
        title: 'Sales Invoice',
        navigation: 'Top menu > Sales > Sales Dashboard',
        route: '/sales',
        whatItDoes:
          'Use this screen to create a customer bill for products, apply discount, membership, or store credit, and then save the invoice as a paid-now sale, pay-later invoice, draft, or held bill.',
        businessLogic:
          'The screen works in five stages. First, the cashier chooses linked-customer or walk-in mode. Second, items are added by scanner, typed search, or the full catalog dialog. Third, row-level controls such as variant, quantity, batch, expiry, and optional serial tracking are completed only for the products that need them. Fourth, discount, points, store credit, and payment settings shape the collectible amount. Finally, invoice type, save mode, tax mode, and optional round-off decide how the invoice is saved and how it appears in reports.',
        practicalExample:
          'Sell Yonex Mavis 350 Shuttle quantity 10 and Badminton Grip quantity 4 to Anjali Nair, keep Walk-in off, confirm Customer Phone 9847001122, apply Discount Amount 100, choose UPI payment, keep Paid Now + Finalise Invoice + GST Bill, then post the bill.',
        reportFlow:
          'The invoice updates daily sales, item-wise sales, customer-wise sales, tax summaries, user-wise sales, stock movement, and receivable totals when credit is used.',
        fieldGuide: salesInvoiceFieldGuide,
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-quotation',
        title: 'Quotation',
        navigation: 'Top menu > Sales > Quotations',
        route: '/sales/quotes',
        whatItDoes:
          'Use this screen to prepare a price offer before the customer commits to a final sale.',
        businessLogic:
          'A quotation is a proposal, not a finished sale. It stores items, price, tax mode, validity date, and notes, but it affects final sales reports only after the quote is approved and converted into an invoice.',
        practicalExample:
          'Create a quote for Rising Stars Academy with Team Jersey quantity 30 and Practice Cone Set quantity 6, set valid until 2026-04-30, mark it as GST quote, and save delivery notes.',
        reportFlow:
          'The quotation appears in quotation tracking and approval follow-up. Once converted, the resulting invoice moves into sales and financial reports.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-returns',
        title: 'Returns',
        navigation: 'Top menu > Sales > Returns',
        route: '/returns',
        whatItDoes:
          'Use this screen to review, approve, reject, and track customer returns and their refund method.',
        businessLogic:
          'A return does not change the business result until it is approved. Once approved, the returned value and refund amount become part of return and refund tracking.',
        practicalExample:
          'Open return INV-260407-00012, confirm that 2 shuttle tubes are being returned because of damaged seal, approve the return, and allow refund through original payment.',
        reportFlow:
          'Approved returns update return reports, reduce the corrected business result, and affect refund-related expense views.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
    ],
  },
  {
    id: 'transactions-membership-people',
    title: 'Membership, Attendance, And Payroll Transactions',
    description:
      'These screens manage recurring members and the internal staff activity that supports the business.',
    guides: [
      {
        id: 'transaction-membership-plan',
        title: 'Create Plan',
        navigation: 'Top menu > Operations > Create Plan',
        route: '/membership-plans/create',
        whatItDoes:
          'Use this screen to define the rules, price, duration, discounts, and benefits of a membership plan before assigning it to members.',
        businessLogic:
          'A plan acts as the business rule book for future members. It tells the system what to charge, how long the plan lasts, what benefits apply, and whether renewal or one-time fees should be allowed.',
        practicalExample:
          'Create Monthly Badminton Prime with price 2500, validity 30 days, grace 5 days, discount 10 percent, minimum redeem points 100, and Auto Renew enabled.',
        reportFlow:
          'The plan itself does not create revenue, but it shapes future subscription value, renewal logic, benefit usage, and plan popularity reporting.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-membership-subscription',
        title: 'Create Subscription',
        navigation: 'Top menu > Operations > Create Subscription',
        route: '/membership-subscriptions/create',
        whatItDoes:
          'Use this screen to register a member under a chosen plan and start the active membership period.',
        businessLogic:
          'The screen links one member to one active plan, records the amount paid, calculates the membership dates, and starts reminder and renewal tracking from that point onward.',
        practicalExample:
          'Assign Monthly Badminton Prime to Sreya Thomas, mobile 9895123456, email sreya@example.com, start date 2026-04-08, amount paid 2500, reminder days 7, and save Notes as Student discount approved.',
        reportFlow:
          'The subscription updates active-member counts, revenue from memberships, expiry alerts, reminder lists, and future renewal reports.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-employee-attendance',
        title: 'Employee Check In',
        navigation: 'Top menu > People > Employee Check In',
        route: '/attendance/self',
        whatItDoes:
          'Use this screen when an employee should mark personal attendance from the sports complex without typing times manually.',
        businessLogic:
          'The system records the current time when the employee taps check in or check out. If location restriction is enabled, the employee must allow GPS and remain inside the allowed sports complex area for the action to be accepted.',
        practicalExample:
          'On 2026-04-08, Rakesh Kumar arrives at 09:02, opens Employee Check In, allows location access, and taps Check In Now. At 18:11, he opens the page again from the arena and taps Check Out Now.',
        reportFlow:
          'The saved check-in and check-out become the attendance record for the day and support attendance summary plus payroll review for the month.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-attendance',
        title: 'Attendance Register',
        navigation: 'Top menu > People > Attendance Register',
        route: '/attendance',
        whatItDoes:
          'Use this screen to enter or correct attendance manually for each employee, including status, check-in, check-out, and overtime.',
        businessLogic:
          'Attendance is the base record for staff presence. Once saved and locked, it becomes the official attendance entry used for payroll and attendance reporting. This manual screen is mainly for supervisor review, corrections, and back-dated entry.',
        practicalExample:
          'For one employee, set Status to Present, Check In to 09:00, Check Out to 18:15, Overtime Hours to 0.5, and Notes to Covered evening shift, then click Save.',
        reportFlow:
          'Attendance feeds attendance summary reports and monthly payroll generation.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-payroll',
        title: 'Payroll Generation',
        navigation: 'Top menu > People > Payroll',
        route: '/payroll',
        whatItDoes:
          'Use this screen to generate payroll for a selected month after attendance has been recorded.',
        businessLogic:
          'The system reads the month, checks attendance and pay setup, calculates payable days, overtime, gross pay, PF, ESI, professional tax, salary TDS, employer PF/ESI contribution, total deductions, and net payout for each employee.',
        practicalExample:
          'Choose Month 2026-04 and click Generate. Review the table for employee count, net payout, employer contribution, payable days, gross salary, deductions, and net salary.',
        reportFlow:
          'Payroll output helps HR and finance review salary liability, statutory deductions, employer contribution, and salary payment planning for the month.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
    ],
  },
  {
    id: 'transactions-accounts',
    title: 'Accounting And Settlement Transactions',
    description:
      'These screens manage invoices, expenses, vouchers, balances, reconciliation, receipts, credits, and end-of-day finance control.',
    guides: [
      {
        id: 'transaction-accounting-invoice',
        title: 'Accounting Invoice',
        navigation: 'Top menu > Accounts > Accounting > Invoices & Payments',
        route: '/accounting',
        whatItDoes:
          'Use this screen to raise a finance-side invoice for a party and record any initial payment received at the time of billing.',
        businessLogic:
          'The invoice creates income for the business. If the invoice is not fully paid, the remaining amount becomes a receivable that stays pending until collected later.',
        practicalExample:
          'Create an invoice for Sunrise Sports School dated 2026-04-07 with base amount 12000, GST 2160, initial payment 5000, bank transfer mode, and Booking Revenue account.',
        reportFlow:
          'The invoice updates income totals, receivables, party balance views, and report summaries.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-expense-vendor-bill',
        title: 'Expense Or Vendor Bill',
        navigation: 'Top menu > Accounts > Accounting > Invoices & Payments',
        route: '/accounting',
        whatItDoes:
          'Use this screen to record a business expense and optionally link it to a vendor with full or part payment.',
        businessLogic:
          'The screen stores the expense amount, paid amount, payment mode, and vendor. Any unpaid amount remains as vendor payable until cleared.',
        practicalExample:
          'Record LED floodlight repair dated 2026-04-07 for 4500, mark 2000 as paid by bank transfer, choose Repairs and Maintenance, and link vendor Bright Power Services.',
        reportFlow:
          'The entry updates expense reports, vendor balances, cash or bank movement, and profit-and-loss expense totals.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-salary-payment',
        title: 'Salary Payment',
        navigation: 'Top menu > Accounts > Accounting > Salary & Contract',
        route: '/accounting',
        whatItDoes:
          'Use this screen to record salary actually paid to an employee for a chosen month.',
        businessLogic:
          'The screen records month, pay date, amount, optional bonus, and payment method. Duplicate salary for the same employee on the same date in the same month is blocked, and a payslip is sent after payment.',
        practicalExample:
          'Choose employee EMP-014 Nikhil Raj, month 2026-04, pay date 2026-04-30, amount 22000, bonus 1500, payment method Bank Transfer, and note Festival incentive.',
        reportFlow:
          'The salary payment feeds salary history, expense reports, profit-and-loss expense totals, and payslip tracking.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-contract-payment',
        title: 'Contract Payment',
        navigation: 'Top menu > Accounts > Accounting > Salary & Contract',
        route: '/accounting',
        whatItDoes:
          'Use this screen to record payments made to contractors or service providers.',
        businessLogic:
          'The screen records contractor name, contract title, payment date, amount, status, and payment method so the business can track both paid and partially paid contract obligations.',
        practicalExample:
          'Enter Aqua Tech Solutions for Pool filtration AMC, payment date 2026-04-18, amount 8000, status Paid, payment method Bank Transfer, and note Quarterly maintenance payment.',
        reportFlow:
          'The payment appears in contract history and moves into expense and profit-and-loss reporting.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-daybook-entry',
        title: 'Daily Expense Or Income Entry',
        navigation: 'Top menu > Accounts > Accounting > Expenses & Income',
        route: '/accounting',
        whatItDoes:
          'Use this screen to record day-to-day income or expense that does not come through the normal invoice flow.',
        businessLogic:
          'The entry type tells the system whether the amount should increase income or increase expense. Payment method decides whether the entry affects cash or bank movement.',
        practicalExample:
          'Save an Expense entry for Electricity, amount 3250, cash payment, date 2026-04-07, reference EB-APR-07, and narration Utility cash payment.',
        reportFlow:
          'The entry updates income or expense reports, profit-and-loss, and cash-book or bank-book views based on payment method.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-opening-balances',
        title: 'Opening Balances',
        navigation: 'Top menu > Accounts > Accounting > Opening Balances',
        route: '/accounting',
        whatItDoes:
          'Use this screen to enter the starting balances for cash, bank, stock, customers, and suppliers before live accounting begins.',
        businessLogic:
          'Opening balances act as the starting point for all future account totals. Once locked, they become the base from which ledgers, trial balance, and balance sheet continue.',
        practicalExample:
          'Enter Cash 25000 debit, Bank 180000 debit, Stock 52000 debit, Customer Sunrise Sports School 15000 debit, and Supplier Bright Power Services 7000 credit, then save and lock if confirmed.',
        reportFlow:
          'These figures become the opening position for ledger balances, trial balance, balance sheet, and later period reporting.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-receipt-voucher',
        title: 'Receipt Voucher',
        navigation: 'Top menu > Accounts > Accounting > Vouchers',
        route: '/accounting',
        whatItDoes:
          'Use this screen to record money coming into the business outside the main sales billing flow.',
        businessLogic:
          'A receipt voucher increases cash or bank based on payment mode and records the source of the money for later review.',
        practicalExample:
          'Create a receipt voucher dated 2026-04-07 for 3500, category Other Income, payment mode Cash, counterparty Arena Cafe, reference RCPT-APR-07-01, and notes Stall space fee collection.',
        reportFlow:
          'The voucher feeds receipt history, cash or bank movement, and collection-related reporting.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-payment-voucher',
        title: 'Payment Voucher',
        navigation: 'Top menu > Accounts > Accounting > Vouchers',
        route: '/accounting',
        whatItDoes:
          'Use this screen to record money paid out by the business for a specific account, purpose, and period.',
        businessLogic:
          'A payment voucher captures who or what was paid, why it was paid, how much was paid, and whether cash or bank was used. It is the formal record of that outgoing payment.',
        practicalExample:
          'Create payment voucher PV-APR-07-03 for Petty Cash Expense, Being Payment Of Plumbing repair at spectator wash area, For the period April 2026, Amount 1800, Payment Mode Cash, Category Repairs and Maintenance, Received By Manoj, Authorized By Admin Desk.',
        reportFlow:
          'The voucher updates payment history and affects cash-book or bank-book totals depending on payment mode.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-journal-voucher',
        title: 'Journal Voucher',
        navigation: 'Top menu > Accounts > Accounting > Vouchers',
        route: '/accounting',
        whatItDoes:
          'Use this screen to move value between accounts when no direct cash or bank payment is being made.',
        businessLogic:
          'A journal voucher changes account balances by debiting one account and crediting another. It is used for adjustments, allocations, and non-cash accounting corrections.',
        practicalExample:
          'Debit Prepaid Expenses, credit Bank Charges Payable, enter amount 2500, reference JV-APR-07-02, and note Yearly software subscription allocation.',
        reportFlow:
          'The journal affects ledger balances, trial balance, balance sheet, and account-level review.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-cash-bank-transfer',
        title: 'Cash-Bank Transfer',
        navigation: 'Top menu > Accounts > Accounting > Vouchers',
        route: '/accounting',
        whatItDoes:
          'Use this screen to move money between the cash account and the bank account.',
        businessLogic:
          'The transfer does not create new income or expense. It simply moves value from cash to bank or from bank to cash, while keeping both balances correct.',
        practicalExample:
          'Transfer 15000 on 2026-04-07 from Cash to Bank with reference DEP-APR-07 and notes Daily cash deposit.',
        reportFlow:
          'The transfer appears in both cash-book and bank-book reporting and helps explain balance movement between the two.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-bank-reconciliation',
        title: 'Bank Reconciliation Pending',
        navigation: 'Top menu > Accounts > Accounting > Cash & Bank Book > Reconciliation',
        route: '/accounting',
        whatItDoes:
          'Use this screen to manually mark bank ledger rows as reconciled after confirming they are already matched with the real bank statement.',
        businessLogic:
          'A bank entry stays pending until the business confirms that it really appeared in the bank statement. Once reconciled, it is treated as cleared and no longer needs follow-up in pending reconciliation review.',
        practicalExample:
          'Tick the bank ledger row for a cleared UPI receipt and click Reconcile Selected after confirming the same transaction is visible in the bank statement.',
        reportFlow:
          'Reconciled items stop appearing in pending bank reconciliation review, which gives finance teams a cleaner list of only unresolved bank items.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-csv-bank-reconciliation',
        title: 'CSV Bank Reconciliation',
        navigation: 'Top menu > Accounts > Accounting > Cash & Bank Book > CSV Compare',
        route: '/accounting',
        whatItDoes:
          'This screen matches bank statement entries with system ledger entries so the business can confirm that all bank transactions are recorded.',
        businessLogic:
          'The screen compares the pasted statement rows with unreconciled bank ledger rows. If date and amount line up, the row is treated as a likely match. If the user chooses Compare And Mark Matched, the matched ledger items are treated as cleared so they do not remain in future reconciliation follow-up.',
        practicalExample:
          'Real situation: a UPI payment of 2000 on April 1, 2026 is already present in the system ledger. The user pastes Date,Amount,Description on the first line and 2026-04-01,2000,UPI receipt on the next line, clicks Compare CSV, confirms the match, and then clicks Compare And Mark Matched.',
        reportFlow:
          'Matched bank rows move out of future reconciliation-pending review, which keeps bank follow-up reports focused only on unresolved or missing transactions.',
        note:
          'The help icon on this screen opens this manual section directly.',
        logicTable: [
          {
            action: 'Paste CSV',
            systemResponse:
              'The system reads the pasted bank statement rows and prepares them for comparison with unreconciled bank ledger entries.',
          },
          {
            action: 'Click Compare CSV',
            systemResponse:
              'The system checks statement rows against unreconciled ledger rows and shows matched rows, unmatched statement rows, and unmatched ledger rows without changing reconciliation status.',
          },
          {
            action: 'Click Compare And Mark Matched',
            systemResponse:
              'The system compares the rows again and then marks the matched ledger entries as reconciled so they no longer appear in future reconciliation reports.',
          },
        ],
        pastedCsvExample: 'Date,Amount,Description\n2026-04-01,2000,UPI receipt',
        matchedExampleRows: [
          {
            statementRow: '2026-04-01 | 2000 | UPI receipt',
            ledgerRow: '2026-04-01 | Bank receipt | 2000 | UPI collection',
            status: 'Matched',
          },
        ],
        matchedOutcome:
          'After the user clicks Compare And Mark Matched, the UPI receipt is reconciled and will not appear again in future bank reconciliation pending reports.',
        mismatchExamples: [
          {
            issue: 'Date mismatch',
            explanation:
              'If the statement shows 2026-04-01 but the ledger row was saved as 2026-04-02, the user should review whether the bank date or posting date needs correction.',
          },
          {
            issue: 'Amount mismatch',
            explanation:
              'If the statement shows 2000 but the ledger shows 1800 or 2200, the user should check whether tax, charges, or manual entry error caused the difference.',
          },
          {
            issue: 'Missing entry',
            explanation:
              'If the statement row has no matching ledger row at all, the transaction may not have been recorded in the system yet and should be entered before reconciliation is completed.',
          },
        ],
      },
      {
        id: 'transaction-settlement-receipt',
        title: 'Settlement Receipt Voucher',
        navigation: 'Top menu > Accounts > Settlements',
        route: '/accounting/settlements',
        whatItDoes:
          'Use this screen to collect money from a customer and allocate that money against one or more outstanding invoices.',
        businessLogic:
          'The receipt records incoming money first. Allocation then decides which open invoices should be reduced by that amount. If marked as advance, the money stays ready for future adjustment.',
        practicalExample:
          'Collect 8000 from Sunrise Sports School by bank transfer and allocate that 8000 against the outstanding April invoice shown in the receivables list.',
        reportFlow:
          'The receipt reduces outstanding receivables, increases collection totals, and updates receipt-voucher history.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-credit-note',
        title: 'Credit Note',
        navigation: 'Top menu > Accounts > Settlements',
        route: '/accounting/settlements',
        whatItDoes:
          'Use this screen to create customer credit that can later be adjusted against a sale or refunded.',
        businessLogic:
          'A credit note records value owed back to the customer because of overbilling, return, or adjustment. The credit stays open until it is used or refunded.',
        practicalExample:
          'Create a credit note for Anjali Nair with reason Wrong product billed, subtotal 1200, tax 216, total 1416, and note To be adjusted against next purchase.',
        reportFlow:
          'Credit-note balances feed customer credit summaries, adjustment history, and refund-related reporting.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-day-end-closing',
        title: 'Day-End Closing',
        navigation: 'Top menu > Accounts > Settlements',
        route: '/accounting/settlements',
        whatItDoes:
          'Use this screen to compare system cash with physical cash counted at the end of the day.',
        businessLogic:
          'The screen starts with opening cash, adds cash sales and cash receipts, subtracts cash expenses, and calculates expected closing cash. The user then enters physical closing cash so any shortage or excess becomes visible as variance.',
        practicalExample:
          'For business date 2026-04-07, enter opening cash 12000 and physical closing cash 28450, then save Notes as Includes tournament walk-in collections.',
        reportFlow:
          'Day-end closing feeds daily closure review and helps management see whether counted cash matches system cash.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
    ],
  },
  {
    id: 'transactions-procurement',
    title: 'Procurement And Stock Transactions',
    description:
      'These screens manage supplier orders and the stock movement that happens after the order is created.',
    guides: [
      {
        id: 'transaction-purchase-order',
        title: 'Create Purchase Order',
        navigation: 'Top menu > Catalog > Procurement',
        route: '/inventory/procurement',
        whatItDoes:
          'Use this screen to place an order with a supplier for products that need to be restocked.',
        businessLogic:
          'A purchase order records what the business intends to buy, from whom, in what quantity, and at what expected cost. It does not increase stock until goods are actually received.',
        practicalExample:
          'Create a purchase order for Ace Sports Wholesale with Yonex Mavis 350 Shuttle quantity 50 at cost 720 and Replacement Net quantity 4 at cost 950, with expected date 2026-04-12.',
        reportFlow:
          'The purchase order helps procurement planning and supplier follow-up, while stock reports change only after receiving goods.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-receive-stock',
        title: 'Receive Stock',
        navigation: 'Top menu > Catalog > Procurement',
        route: '/inventory/procurement',
        whatItDoes:
          'Use this screen to confirm that ordered goods have arrived and should be added into stock.',
        businessLogic:
          'Receiving stock moves the purchase order closer to completion and increases the live stock quantity for the items actually received.',
        practicalExample:
          'Against the open purchase order, receive Shuttle quantity 40 into Main Store, set batch SH-APR-26-A, and expiry date 2027-04-01.',
        reportFlow:
          'Received stock increases inventory on hand and updates stock movement and valuation-related views.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
      {
        id: 'transaction-purchase-return',
        title: 'Purchase Return',
        navigation: 'Top menu > Catalog > Procurement',
        route: '/inventory/procurement',
        whatItDoes:
          'Use this screen to send previously received supplier stock back out when it is damaged, incorrect, or unwanted.',
        businessLogic:
          'A purchase return reduces the received quantity and records the reason so supplier follow-up and stock records stay correct.',
        practicalExample:
          'Return Replacement Net quantity 1 with reason Damaged stitching from supplier pack.',
        reportFlow:
          'The return reduces stock on hand and updates inventory movement for stock going back to the supplier.',
        note:
          'The help button on this screen opens this manual section directly.',
      },
    ],
  },
];

const reportDataFlowSteps: string[] = [
  'Master data is prepared first so transactions have valid products, facilities, employees, vendors, plans, customers, and account names to use.',
  'Daily transactions are then entered through booking, sales, membership, attendance, accounting, voucher, settlement, and procurement screens.',
  'Payments, receipts, refunds, credit adjustments, and transfers update balances after the original transaction is saved.',
  'Record status decides whether a transaction is counted in final reports. Posted, approved, active, completed, and saved entries usually count, while draft or cancelled entries usually do not.',
  'The chosen date range decides which saved entries are included in the final report view.',
  'Reports then summarize those saved entries into totals, balances, counts, rankings, trends, and exception lists.',
];

const reportDataFlowEffects: string[] = [
  'A booking entry creates usage history and future operational review data.',
  'A sales invoice creates revenue and may also create an outstanding amount if not fully paid.',
  'A payment reduces what is still due without removing the original transaction history.',
  'A return, refund, or credit note corrects the earlier business result.',
  'An attendance entry builds employee presence history and payroll input.',
  'A payroll run converts attendance and salary setup into monthly salary figures.',
  'A voucher or day-book entry changes cash, bank, income, or expense balances.',
  'A membership entry creates renewal, expiry, and benefit usage history.',
  'A stock receipt changes inventory quantity and stock-related reports.',
];

const topicIndexGroups: TopicIndexGroup[] = [
  {
    title: 'Overview Topics',
    links: overviewSections.map((section) => ({ id: section.id, label: section.title })),
  },
  {
    title: 'Main Modules',
    links: moduleSummaries.map((module) => ({ id: module.id, label: module.title })),
  },
  ...menuSections.map((section) => ({
    title: section.title,
    links: section.pages.map((page) => ({ id: page.id, label: page.title })),
  })),
  {
    title: 'Transaction Screens',
    links: [
      { id: 'transaction-guides', label: 'Transaction Screen Guides' },
      ...transactionGuideSections.flatMap((section) => [
        { id: section.id, label: section.title },
        ...section.guides.map((guide) => ({ id: guide.id, label: guide.title })),
      ]),
    ],
  },
  {
    title: 'Reports And Examples',
    links: [
      { id: 'report-logic', label: 'Report Logic In Simple Terms' },
      ...reportLogicSections.flatMap((section) => [
        { id: section.id, label: section.title },
        ...section.topics
          .filter((topic) => Boolean(topic.id))
          .map((topic) => ({ id: String(topic.id), label: `${section.title}: ${topic.name}` })),
      ]),
      { id: 'sample-entries', label: 'Sample Data Entry Examples' },
      ...sampleEntrySections.map((section) => ({ id: section.id, label: section.title })),
      { id: 'report-data-flow', label: 'How Data Moves From Entry Screen To Report' },
      { id: 'final-summary', label: 'Final Summary' },
    ],
  },
];

const TOPIC_TREE_STORAGE_KEY = 'helpCenterTopicTreeState';

const createDefaultTopicTreeState = (): TopicTreeState =>
  topicIndexGroups.reduce<TopicTreeState>((acc, group, index) => {
    acc[group.title] = index < 4;
    return acc;
  }, {});

const resolveTopicGroupMeta = (title: string) => {
  const normalized = title.toLowerCase();

  if (normalized.includes('overview')) {
    return { icon: BookOpen, tone: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100' };
  }
  if (normalized.includes('main modules')) {
    return { icon: LayoutGrid, tone: 'border-indigo-400/20 bg-indigo-500/10 text-indigo-100' };
  }
  if (normalized.includes('home')) {
    return { icon: Home, tone: 'border-sky-400/20 bg-sky-500/10 text-sky-100' };
  }
  if (normalized.includes('sales')) {
    return { icon: ShoppingCart, tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' };
  }
  if (normalized.includes('catalog')) {
    return { icon: Boxes, tone: 'border-amber-400/20 bg-amber-500/10 text-amber-100' };
  }
  if (normalized.includes('people')) {
    return { icon: Users, tone: 'border-fuchsia-400/20 bg-fuchsia-500/10 text-fuchsia-100' };
  }
  if (normalized.includes('accounts')) {
    return { icon: Wallet, tone: 'border-violet-400/20 bg-violet-500/10 text-violet-100' };
  }
  if (normalized.includes('validation')) {
    return { icon: ShieldCheck, tone: 'border-teal-400/20 bg-teal-500/10 text-teal-100' };
  }
  if (normalized.includes('admin') || normalized.includes('operations')) {
    return { icon: Settings2, tone: 'border-rose-400/20 bg-rose-500/10 text-rose-100' };
  }
  if (normalized.includes('transaction')) {
    return { icon: FileText, tone: 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100' };
  }
  if (normalized.includes('report')) {
    return { icon: BarChart3, tone: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' };
  }

  return { icon: Sparkles, tone: 'border-white/10 bg-white/5 text-gray-100' };
};

export const HelpCenter: React.FC<{ isPublic?: boolean }> = ({ isPublic = false }) => {
  const location = useLocation();
  const routeActionLabel = isPublic ? 'Login to open' : 'Open page';

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<HelpSearchFilter>('all');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('helpCenterRecentSearches');
      return saved ? JSON.parse(saved) : ['balance', 'attendance', 'invoice', 'booking', 'payroll'];
    } catch {
      return ['balance', 'attendance', 'invoice', 'booking', 'payroll'];
    }
  });
  const [recentViewedTopics, setRecentViewedTopics] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('helpCenterRecentTopics');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Chatbot state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Collapsible sections state
  const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>(() => {
    const saved = localStorage.getItem('helpCenterCollapsedSections');
    return saved ? JSON.parse(saved) : {};
  });

  // TOC state
  const [activeSection, setActiveSection] = useState<string>('');
  const [topicTreeState, setTopicTreeState] = useState<TopicTreeState>(() => {
    try {
      const saved = localStorage.getItem(TOPIC_TREE_STORAGE_KEY);
      return saved ? { ...createDefaultTopicTreeState(), ...JSON.parse(saved) } : createDefaultTopicTreeState();
    } catch {
      return createDefaultTopicTreeState();
    }
  });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const resolveRouteTarget = (to: string) => (isPublic && to !== '/user-manual' ? '/login' : to);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Collapsible sections persistence
  useEffect(() => {
    localStorage.setItem('helpCenterCollapsedSections', JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  useEffect(() => {
    localStorage.setItem(TOPIC_TREE_STORAGE_KEY, JSON.stringify(topicTreeState));
  }, [topicTreeState]);

  // Hash scrolling
  useEffect(() => {
    const hash = String(location.hash || '').replace(/^#/, '').trim();
    if (!hash) return;

    const scrollToHash = () => {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const timer = window.setTimeout(scrollToHash, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const scrollToSection = useCallback((sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (window.location.hash !== `#${sectionId}`) {
      window.history.replaceState(null, '', `#${sectionId}`);
    }
  }, []);

  const toggleTopicTreeGroup = useCallback((groupTitle: string) => {
    setTopicTreeState((prev) => ({ ...prev, [groupTitle]: !prev[groupTitle] }));
  }, []);

  const expandAllTopicGroups = useCallback(() => {
    setTopicTreeState(
      topicIndexGroups.reduce<TopicTreeState>((acc, group) => {
        acc[group.title] = true;
        return acc;
      }, {})
    );
  }, []);

  const collapseAllTopicGroups = useCallback(() => {
    setTopicTreeState(
      topicIndexGroups.reduce<TopicTreeState>((acc, group) => {
        acc[group.title] = false;
        return acc;
      }, {})
    );
  }, []);

  // TOC intersection observer
  const sectionIds = useMemo(() => topicIndexGroups.flatMap(group => group.links.map(link => link.id)), []);
  useEffect(() => {
    const observedSections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));

    if (!observedSections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => {
            if (left.intersectionRatio !== right.intersectionRatio) {
              return right.intersectionRatio - left.intersectionRatio;
            }
            return left.boundingClientRect.top - right.boundingClientRect.top;
          });

        if (visibleEntries[0]) {
          setActiveSection(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: '-120px 0px -62% 0px',
        threshold: [0.05, 0.2, 0.4, 0.7],
      }
    );

    observedSections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [sectionIds]);

  const helpSearchDocuments = useMemo<HelpSearchDocument[]>(() => {
    const documents: HelpSearchDocument[] = [];

    overviewSections.forEach((section, index) => {
      documents.push({
        id: section.id,
        title: section.title,
        description: section.description,
        breadcrumb: ['Help Guide', 'Overview'],
        category: 'guides',
        route: '/user-manual',
        routeLabel: 'User Manual',
        keywords: [...section.bullets, 'guide', 'manual', 'overview'],
        badges: ['Guide'],
        quickLinks: [{ label: 'Open Table of Contents', to: '/user-manual#topic-index' }],
        updatedLabel: HELP_RESULT_UPDATED_LABELS[index % HELP_RESULT_UPDATED_LABELS.length],
      });
    });

    moduleSummaries.forEach((module, index) => {
      documents.push({
        id: module.id,
        title: module.title,
        description: module.description,
        breadcrumb: ['Modules', module.title],
        category: 'modules',
        route: module.route,
        routeLabel: routeActionLabel,
        keywords: [module.purpose, module.navigation, ...module.keyUses],
        badges: ['Module'],
        quickLinks: module.links,
        updatedLabel: HELP_RESULT_UPDATED_LABELS[(index + 1) % HELP_RESULT_UPDATED_LABELS.length],
      });
    });

    menuSections.forEach((section, sectionIndex) => {
      section.pages.forEach((page, pageIndex) => {
        documents.push({
          id: page.id,
          title: page.title,
          description: page.description,
          breadcrumb: [section.title, page.title],
          category: 'modules',
          route: page.route,
          routeLabel: routeActionLabel,
          keywords: [page.purpose, page.navigation, ...page.keyUses],
          badges: [section.title],
          quickLinks: page.links,
          updatedLabel: HELP_RESULT_UPDATED_LABELS[(sectionIndex + pageIndex + 2) % HELP_RESULT_UPDATED_LABELS.length],
        });
      });
    });

    reportLogicSections.forEach((section, sectionIndex) => {
      section.topics.forEach((topic, topicIndex) => {
        documents.push({
          id: topic.id || section.id,
          title: topic.name,
          description: topic.explanation,
          breadcrumb: ['Reports', section.title],
          category: 'reports',
          route: '/reports',
          routeLabel: routeActionLabel,
          keywords: [section.description, section.title, 'report', 'logic', 'summary'],
          badges: ['Report'],
          quickLinks: [{ label: 'Open Reports', to: '/reports' }],
          updatedLabel: HELP_RESULT_UPDATED_LABELS[(sectionIndex + topicIndex + 1) % HELP_RESULT_UPDATED_LABELS.length],
        });
      });
    });

    sampleEntrySections.forEach((section, sectionIndex) => {
      section.entries.forEach((entry, entryIndex) => {
        documents.push({
          id: section.id,
          title: entry.title,
          description: `${entry.sample} ${entry.result}`,
          breadcrumb: ['Reports', section.title],
          category: 'reports',
          route: '/reports',
          routeLabel: routeActionLabel,
          keywords: [section.description, entry.sample, entry.result, 'example'],
          badges: ['Example'],
          quickLinks: [{ label: 'Open Reports', to: '/reports' }],
          updatedLabel: HELP_RESULT_UPDATED_LABELS[(sectionIndex + entryIndex + 3) % HELP_RESULT_UPDATED_LABELS.length],
        });
      });
    });

    transactionGuideSections.forEach((section, sectionIndex) => {
      section.guides.forEach((guide, guideIndex) => {
        documents.push({
          id: guide.id,
          title: guide.title,
          description: guide.whatItDoes,
          breadcrumb: ['Transactions', section.title],
          category: 'transactions',
          route: guide.route,
          routeLabel: routeActionLabel,
          keywords: [guide.navigation, guide.businessLogic, guide.practicalExample, guide.reportFlow, guide.note],
          badges: ['Guide', section.title],
          quickLinks: [{ label: routeActionLabel, to: guide.route }],
          updatedLabel: HELP_RESULT_UPDATED_LABELS[(sectionIndex + guideIndex) % HELP_RESULT_UPDATED_LABELS.length],
        });
      });
    });

    return documents.map((document) => ({
      ...document,
      keywords: Array.from(new Set(
        document.keywords
          .flatMap((value) => {
            const tokens = tokenizeSearch(value);
            const expanded = tokens.flatMap((token) => [token, ...(HELP_SEARCH_SYNONYMS[token] || [])]);
            return [...tokens, ...expanded];
          })
      )),
    }));
  }, [routeActionLabel]);

  const helpSearchDocumentMap = useMemo(
    () => new Map(helpSearchDocuments.map((document) => [document.id, document])),
    [helpSearchDocuments]
  );

  const helpSearchVocabulary = useMemo(() => {
    const words = new Set<string>();
    helpSearchDocuments.forEach((document) => {
      [document.title, document.description, ...document.breadcrumb, ...document.keywords].forEach((value) => {
        tokenizeSearch(value).forEach((token) => words.add(token));
      });
    });
    Object.entries(HELP_SEARCH_SYNONYMS).forEach(([key, values]) => {
      words.add(key);
      values.forEach((value) => words.add(value));
    });
    return Array.from(words);
  }, [helpSearchDocuments]);

  const expandedSearchQuery = useMemo(() => {
    const tokens = tokenizeSearch(debouncedQuery);
    if (!tokens.length) return '';
    const expanded = tokens.flatMap((token) => [token, ...(HELP_SEARCH_SYNONYMS[token] || [])]);
    return Array.from(new Set([debouncedQuery.trim(), ...expanded])).join(' ');
  }, [debouncedQuery]);

  const didYouMean = useMemo(() => {
    const tokens = tokenizeSearch(debouncedQuery);
    if (!tokens.length) return '';

    const correctedTokens = tokens.map((token) => {
      let bestWord = token;
      let bestDistance = Number.POSITIVE_INFINITY;

      helpSearchVocabulary.forEach((candidate) => {
        const distance = levenshteinDistance(token, candidate);
        if (
          distance < bestDistance
          && distance <= Math.max(1, Math.floor(candidate.length / 3))
        ) {
          bestWord = candidate;
          bestDistance = distance;
        }
      });

      return bestWord;
    });

    const suggestion = correctedTokens.join(' ').trim();
    return suggestion && suggestion !== normalizeSearchValue(debouncedQuery) ? suggestion : '';
  }, [debouncedQuery, helpSearchVocabulary]);

  const fuse = useMemo(() => new Fuse(helpSearchDocuments, {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'breadcrumb', weight: 0.18 },
      { name: 'keywords', weight: 0.2 },
      { name: 'description', weight: 0.12 },
    ],
    threshold: 0.34,
    includeMatches: true,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
    shouldSort: true,
  }), [helpSearchDocuments]);

  const baseSearchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    const normalizedQuery = normalizeSearchValue(debouncedQuery);
    const queryTokens = tokenizeSearch(debouncedQuery);

    return fuse.search(expandedSearchQuery).map((result) => {
      const titleNormalized = normalizeSearchValue(result.item.title);
      const exactTitleMatch = titleNormalized === normalizedQuery;
      const partialTitleMatch = normalizedQuery.length >= 2 && titleNormalized.includes(normalizedQuery);
      const keywordMatch = queryTokens.some((token) => result.item.keywords.some((keyword) => keyword.includes(token)));
      const breadcrumbMatch = queryTokens.some((token) => result.item.breadcrumb.some((crumb) => normalizeSearchValue(crumb).includes(token)));

      return {
        ...result.item,
        matches: result.matches as SearchMatch[] | undefined,
        score: Number(result.score || 0),
        exactTitleMatch,
        partialTitleMatch,
        keywordMatch,
        breadcrumbMatch,
      };
    }).sort((left, right) => {
      if (left.exactTitleMatch !== right.exactTitleMatch) return left.exactTitleMatch ? -1 : 1;
      if (left.partialTitleMatch !== right.partialTitleMatch) return left.partialTitleMatch ? -1 : 1;
      if (left.keywordMatch !== right.keywordMatch) return left.keywordMatch ? -1 : 1;
      if (left.breadcrumbMatch !== right.breadcrumbMatch) return left.breadcrumbMatch ? -1 : 1;
      return left.score - right.score;
    });
  }, [debouncedQuery, expandedSearchQuery, fuse]);

  const resultCountsByFilter = useMemo(() => ({
    all: baseSearchResults.length,
    modules: baseSearchResults.filter((result) => result.category === 'modules').length,
    transactions: baseSearchResults.filter((result) => result.category === 'transactions').length,
    reports: baseSearchResults.filter((result) => result.category === 'reports').length,
    guides: baseSearchResults.filter((result) => result.category === 'guides').length,
  }), [baseSearchResults]);

  const filteredItems = useMemo(() => {
    const filtered = searchFilter === 'all'
      ? baseSearchResults
      : baseSearchResults.filter((result) => result.category === searchFilter);
    return filtered.slice(0, 12);
  }, [baseSearchResults, searchFilter]);

  const suggestionItems = useMemo(() => filteredItems.slice(0, 5), [filteredItems]);

  const popularTopics = useMemo(
    () => ['trial-balance-report', 'transaction-facility-booking', 'manual-attendance-review', 'transaction-sales-invoice', 'attendance-register']
      .map((id) => helpSearchDocumentMap.get(id))
      .filter((item): item is HelpSearchDocument => Boolean(item)),
    [helpSearchDocumentMap]
  );

  const quickNavigationCards = useMemo(
    () => moduleSummaries.slice(0, 6).map((module) => ({
      id: module.id,
      label: module.title,
      route: module.route,
    })),
    []
  );

  const quickActionCards = useMemo(() => {
    const actions: Array<{ label: string; to: string }> = [];
    filteredItems.forEach((item) => {
      if (item.route && !actions.some((action) => action.to === item.route)) {
        actions.push({
          label: `${routeActionLabel} ${item.title}`,
          to: item.route,
        });
      }
      item.quickLinks.forEach((link) => {
        if (!actions.some((action) => action.to === link.to && action.label === link.label)) {
          actions.push({ label: link.label, to: link.to });
        }
      });
    });
    return actions.slice(0, 4);
  }, [filteredItems, routeActionLabel]);

  useEffect(() => {
    try {
      localStorage.setItem('helpCenterRecentSearches', JSON.stringify(recentSearches.slice(0, 8)));
    } catch {
      // ignore local storage failures
    }
  }, [recentSearches]);

  useEffect(() => {
    try {
      localStorage.setItem('helpCenterRecentTopics', JSON.stringify(recentViewedTopics.slice(0, 8)));
    } catch {
      // ignore local storage failures
    }
  }, [recentViewedTopics]);

  useEffect(() => {
    setSelectedSuggestionIndex(-1);
    suggestionButtonRefs.current = [];
  }, [debouncedQuery, searchFilter]);

  useEffect(() => {
    const handleSlashFocus = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== '/') return;
      const target = event.target as HTMLElement | null;
      const tagName = String(target?.tagName || '').toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleSlashFocus);
    return () => window.removeEventListener('keydown', handleSlashFocus);
  }, []);

  const rememberRecentSearch = useCallback((value: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return;
    setRecentSearches((prev) => [normalized, ...prev.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())].slice(0, 8));
  }, []);

  const rememberViewedTopic = useCallback((id: string) => {
    if (!id) return;
    setRecentViewedTopics((prev) => [id, ...prev.filter((entry) => entry !== id)].slice(0, 8));
  }, []);

  const handleOpenSearchItem = useCallback((item: Pick<HelpSearchDocument, 'id'>) => {
    rememberViewedTopic(item.id);
    if (debouncedQuery.trim()) {
      rememberRecentSearch(debouncedQuery);
    }
    scrollToSection(item.id);
  }, [debouncedQuery, rememberRecentSearch, rememberViewedTopic, scrollToSection]);

  const applySearchQuery = useCallback((nextQuery: string) => {
    setSearchQuery(nextQuery);
    setDebouncedQuery(nextQuery);
    setSelectedSuggestionIndex(-1);
    if (nextQuery.trim()) {
      rememberRecentSearch(nextQuery);
    }
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [rememberRecentSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedSuggestionIndex(-1);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  const applyDidYouMean = useCallback(() => {
    if (!didYouMean) return;
    applySearchQuery(didYouMean);
  }, [applySearchQuery, didYouMean]);

  const handleSearchInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!debouncedQuery.trim() || suggestionItems.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = selectedSuggestionIndex >= 0
        ? Math.min(selectedSuggestionIndex + 1, suggestionItems.length - 1)
        : 0;
      setSelectedSuggestionIndex(nextIndex);
      suggestionButtonRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = selectedSuggestionIndex >= 0
        ? Math.max(selectedSuggestionIndex - 1, 0)
        : suggestionItems.length - 1;
      setSelectedSuggestionIndex(nextIndex);
      suggestionButtonRefs.current[nextIndex]?.focus();
      return;
    }

    if (event.key === 'Enter' && suggestionItems[0]) {
      event.preventDefault();
      handleOpenSearchItem(suggestionItems[Math.max(selectedSuggestionIndex, 0)]);
    }
  }, [debouncedQuery, handleOpenSearchItem, selectedSuggestionIndex, suggestionItems]);

  const getMatchRanges = useCallback((matches: SearchMatch[] | undefined, key: 'title' | 'description') => {
    if (!Array.isArray(matches)) return [];
    return matches
      .filter((match) => match.key === key)
      .flatMap((match) => match.indices || [])
      .sort((left, right) => left[0] - right[0]);
  }, []);

  const renderHighlightedText = useCallback((text: string, ranges: ReadonlyArray<readonly [number, number]>) => {
    if (!ranges.length) return text;

    const nodes: React.ReactNode[] = [];
    let cursor = 0;

    ranges.forEach(([start, end], index) => {
      if (start > cursor) {
        nodes.push(<React.Fragment key={`plain-${index}-${cursor}`}>{text.slice(cursor, start)}</React.Fragment>);
      }
      nodes.push(
        <mark key={`hit-${index}-${start}`} className="rounded bg-amber-300/20 px-0.5 text-amber-100">
          {text.slice(start, end + 1)}
        </mark>
      );
      cursor = end + 1;
    });

    if (cursor < text.length) {
      nodes.push(<React.Fragment key={`plain-tail-${cursor}`}>{text.slice(cursor)}</React.Fragment>);
    }

    return nodes;
  }, []);

  // Chatbot functions
  const handleSendMessage = useCallback(async () => {
    if (!currentQuestion.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: currentQuestion,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setCurrentQuestion('');
    setIsTyping(true);

    try {
      const aiResponse = await askAI(currentQuestion);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiResponse,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  }, [currentQuestion]);

  useEffect(() => {
    if (!isChatOpen) return;
    setChatMessages((prev) => {
      if (prev.length) return prev;
      return [
        {
          id: 'help-center-welcome',
          type: 'ai',
          content: 'Ask about memberships, billing, reports, bookings, or accounting setup. [Read more in Table of Contents](#topic-index)',
          timestamp: new Date(),
        },
      ];
    });
  }, [isChatOpen]);

  useEscapeKey(() => setIsChatOpen(false), { enabled: isChatOpen });

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  const copySectionLink = useCallback((sectionId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${sectionId}`;
    copyToClipboard(url);
  }, [copyToClipboard]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const renderChatContent = useCallback((content: string) => {
    const nodes: React.ReactNode[] = [];
    const linkPattern = /\[([^\]]+)\]\((#[^)]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(
          <React.Fragment key={`chat-text-${lastIndex}`}>
            {content.slice(lastIndex, match.index)}
          </React.Fragment>
        );
      }

      const [, label, hash] = match;
      nodes.push(
        <button
          key={`chat-link-${hash}-${match.index}`}
          type="button"
          onClick={() => {
            setIsChatOpen(false);
            scrollToSection(String(hash || '').replace(/^#/, ''));
          }}
          className="font-semibold text-cyan-200 underline underline-offset-2 hover:text-cyan-100"
        >
          {label}
        </button>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      nodes.push(
        <React.Fragment key={`chat-tail-${lastIndex}`}>
          {content.slice(lastIndex)}
        </React.Fragment>
      );
    }

    return nodes;
  }, [scrollToSection]);

  useEffect(() => {
    const hash = String(location.hash || '').replace(/^#/, '').trim();
    if (!hash) return;

    const scrollToHash = () => {
      const target = document.getElementById(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const timer = window.setTimeout(scrollToHash, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const hasSearchResultsView = debouncedQuery.trim().length >= 2;
  const showSuggestions = hasSearchResultsView && suggestionItems.length > 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      {isPublic ? <PublicSeo routeKey="user-manual" /> : null}
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.95fr]">
            <div className="bg-gradient-to-br from-indigo-500/20 via-sky-500/10 to-transparent p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">
                {isPublic ? 'Public User Manual' : 'User Manual and Product Documentation'}
              </p>
              <h1 className="mt-2 text-3xl font-bold text-white sm:text-[2.15rem]">{APPLICATION_TITLE}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-200 sm:text-base">
                Search the manual, jump to the exact section you need, and move quickly across modules,
                transactions, and reports without leaving this page.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {isPublic ? (
                  <>
                    <Link
                      to="/login"
                      className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                    >
                      Back to Login
                    </Link>
                    <a
                      href="#topic-index"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Open Table of Contents
                    </a>
                  </>
                ) : (
                  <>
                    <Link
                      to="/"
                      className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                    >
                      Go to Dashboard
                    </Link>
                    <a
                      href="#topic-index"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Open Table of Contents
                    </a>
                  </>
                )}
              </div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs text-gray-300">
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Fast help search</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Direct section links</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Keyboard friendly</span>
              </div>

            </div>

            <div className="border-t border-white/10 bg-gray-950/35 p-5 sm:p-6 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Search Help Fast</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400 no-print">
                      <span>Press</span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-semibold text-gray-200">/</span>
                      <span>to search</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        placeholder='Search help... (e.g., "trial balance", "booking", "payroll")'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchInputKeyDown}
                        className="w-full rounded-2xl border border-indigo-400/40 bg-gray-950/50 py-3 pl-12 pr-28 text-base text-white placeholder-gray-500 shadow-[0_0_0_1px_rgba(129,140,248,0.12)] focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                        {hasSearchResultsView ? (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
                            {resultCountsByFilter.all}
                          </span>
                        ) : null}
                        {searchQuery.trim() ? (
                          <button
                            type="button"
                            onClick={clearSearch}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                            aria-label="Clear search"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <button
                      onClick={() => setIsChatOpen(true)}
                      className="rounded-2xl border border-purple-300/25 bg-purple-500/20 px-3 py-3 text-sm text-purple-200 hover:bg-purple-500/30 transition-colors no-print"
                      title="Ask AI Assistant"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handlePrint}
                      className="rounded-2xl border border-white/15 bg-gray-950/30 px-3 py-3 text-sm text-gray-400 hover:text-white hover:bg-gray-950/50 no-print"
                      title="Print Manual"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                    {showSuggestions ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-300">
                          <p>
                            Showing results for <span className="font-semibold text-indigo-200">"{debouncedQuery}"</span>
                          </p>
                          {didYouMean ? (
                            <button type="button" onClick={applyDidYouMean} className="text-sm text-gray-300 hover:text-white">
                              Did you mean <span className="font-semibold text-indigo-200">"{didYouMean}"</span>?
                            </button>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          {suggestionItems.map((item, index) => (
                            <button
                              key={`suggestion-${item.id}`}
                              ref={(node) => {
                                suggestionButtonRefs.current[index] = node;
                              }}
                              type="button"
                              onClick={() => handleOpenSearchItem(item)}
                              onFocus={() => setSelectedSuggestionIndex(index)}
                              onKeyDown={(event) => {
                                if (event.key === 'ArrowDown') {
                                  event.preventDefault();
                                  const nextIndex = Math.min(index + 1, suggestionItems.length - 1);
                                  suggestionButtonRefs.current[nextIndex]?.focus();
                                  setSelectedSuggestionIndex(nextIndex);
                                  return;
                                }
                                if (event.key === 'ArrowUp') {
                                  event.preventDefault();
                                  if (index === 0) {
                                    searchInputRef.current?.focus();
                                    setSelectedSuggestionIndex(-1);
                                    return;
                                  }
                                  const nextIndex = Math.max(index - 1, 0);
                                  suggestionButtonRefs.current[nextIndex]?.focus();
                                  setSelectedSuggestionIndex(nextIndex);
                                }
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                                selectedSuggestionIndex === index
                                  ? 'bg-indigo-500/15 text-white'
                                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-white">
                                  {renderHighlightedText(item.title, getMatchRanges(item.matches as SearchMatch[] | undefined, 'title'))}
                                </p>
                                <p className="truncate text-xs text-gray-400">{item.breadcrumb.join(' → ')}</p>
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => document.getElementById('search-results-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-200 hover:text-indigo-100"
                        >
                          View all results for "{debouncedQuery}"
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    ) : hasSearchResultsView ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-gray-300">
                          <Search className="h-4 w-4 text-indigo-200" />
                          <p>No instant suggestions found for <span className="font-semibold text-indigo-200">"{debouncedQuery}"</span>.</p>
                        </div>
                        {didYouMean ? (
                          <button
                            type="button"
                            onClick={applyDidYouMean}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 hover:bg-white/10"
                          >
                            Search instead for "{didYouMean}"
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {popularTopics.slice(0, 4).map((topic) => (
                            <button
                              key={`fallback-topic-${topic.id}`}
                              type="button"
                              onClick={() => handleOpenSearchItem(topic)}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/10"
                            >
                              {topic.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm text-gray-300">
                          <Sparkles className="h-4 w-4 text-indigo-200" />
                          <p>Search across help content, modules, transactions, and reports.</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">Popular topics</p>
                            <div className="mt-3 space-y-2">
                              {popularTopics.slice(0, 4).map((topic) => (
                                <button
                                  key={`hero-topic-${topic.id}`}
                                  type="button"
                                  onClick={() => handleOpenSearchItem(topic)}
                                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-gray-100 hover:bg-white/10"
                                >
                                  <span>{topic.title}</span>
                                  <ChevronRight className="h-4 w-4 text-gray-500" />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">Quick links</p>
                            <div className="mt-3 space-y-2">
                              {quickNavigationCards.slice(0, 4).map((card) => (
                                <Link
                                  key={`hero-quick-link-${card.id}`}
                                  to={resolveRouteTarget(card.route)}
                                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-100 hover:bg-white/10"
                                >
                                  <span>{card.label}</span>
                                  <ArrowRight className="h-4 w-4 text-gray-500" />
                                </Link>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                    <Filter className="h-3.5 w-3.5" />
                    <span>
                      {hasSearchResultsView
                        ? `Showing ${filteredItems.length} ranked help matches in ${searchFilter === 'all' ? 'all categories' : searchFilter}.`
                        : 'Start typing to search titles, descriptions, routes, and keywords across the full manual.'}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Quick Navigation</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {quickNavigationCards.map((card) => (
                      <Link
                        key={card.id}
                        to={resolveRouteTarget(card.route)}
                        className="inline-flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-100 hover:bg-white/10"
                      >
                        <span>{card.label}</span>
                        <ArrowRight className="h-4 w-4 text-gray-500" />
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="search-results-panel" className="scroll-mt-28 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-200" />
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-200">Popular Topics</p>
              </div>
              <div className="mt-4 space-y-2">
                {popularTopics.map((topic) => (
                  <button
                    key={`popular-topic-${topic.id}`}
                    type="button"
                    onClick={() => handleOpenSearchItem(topic)}
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-gray-950/30 px-3 py-2 text-left text-sm text-gray-100 hover:bg-white/10"
                  >
                    <span>{topic.title}</span>
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-indigo-200" />
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-200">Browse Modules</p>
              </div>
              <div className="mt-4 space-y-2">
                {quickNavigationCards.map((card) => (
                  <Link
                    key={`browse-module-${card.id}`}
                    to={resolveRouteTarget(card.route)}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-gray-950/30 px-3 py-2 text-sm text-gray-100 hover:bg-white/10"
                  >
                    <span>{card.label}</span>
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  </Link>
                ))}
              </div>
            </div>
          </aside>

          <div className="space-y-4">
            {hasSearchResultsView ? (
              <>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Search Results</p>
                      <h2 className="mt-1 text-2xl font-bold text-white">
                        Search results for <span className="text-indigo-300">"{debouncedQuery}"</span>{' '}
                        <span className="text-lg font-medium text-gray-400">({resultCountsByFilter.all} results)</span>
                      </h2>
                    </div>
                    {didYouMean ? (
                      <button type="button" onClick={applyDidYouMean} className="text-sm text-gray-300 hover:text-white">
                        Did you mean <span className="font-semibold text-indigo-200">"{didYouMean}"</span>?
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-400">Filter by:</span>
                      {([
                        { key: 'all', label: 'All', count: resultCountsByFilter.all },
                        { key: 'modules', label: 'Modules', count: resultCountsByFilter.modules },
                        { key: 'transactions', label: 'Transactions', count: resultCountsByFilter.transactions },
                        { key: 'reports', label: 'Reports', count: resultCountsByFilter.reports },
                      ] as const).map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setSearchFilter(filter.key)}
                          className={`rounded-xl border px-3 py-2 text-sm transition ${
                            searchFilter === filter.key
                              ? 'border-indigo-400/40 bg-indigo-500/85 text-white'
                              : 'border-white/10 bg-gray-950/30 text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {filter.label} ({filter.count})
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Search className="h-4 w-4" />
                      <span>Press Enter to open the top result.</span>
                    </div>
                  </div>
                </div>

                {filteredItems.length > 0 ? (
                  <div className="space-y-3">
                    {filteredItems.map((item, index) => (
                      <button
                        key={`search-result-${item.id}-${index}`}
                        type="button"
                        onClick={() => handleOpenSearchItem(item)}
                        className="w-full rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:border-white/20 hover:bg-white/10"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 gap-4">
                            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
                              item.category === 'reports'
                                ? 'bg-blue-500/20 text-blue-200'
                                : item.category === 'transactions'
                                  ? 'bg-emerald-500/20 text-emerald-200'
                                  : item.category === 'modules'
                                    ? 'bg-amber-500/20 text-amber-100'
                                    : 'bg-indigo-500/20 text-indigo-200'
                            }`}>
                              {item.category === 'reports' ? <BarChart3 className="h-6 w-6" /> : null}
                              {item.category === 'transactions' ? <FileText className="h-6 w-6" /> : null}
                              {item.category === 'modules' ? <LayoutGrid className="h-6 w-6" /> : null}
                              {item.category === 'guides' ? <BookOpen className="h-6 w-6" /> : null}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xl font-semibold text-white">
                                {index + 1}. {renderHighlightedText(item.title, getMatchRanges(item.matches as SearchMatch[] | undefined, 'title'))}
                              </p>
                              <p className="mt-1 text-sm text-gray-400">{item.breadcrumb.join(' > ')}</p>
                              <p className="mt-3 text-sm leading-6 text-gray-300">
                                {renderHighlightedText(item.description, getMatchRanges(item.matches as SearchMatch[] | undefined, 'description'))}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.badges.map((badge) => (
                                  <span key={`${item.id}-${badge}`} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-gray-200">
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-left lg:text-right">
                            <p className="text-sm text-gray-300">{item.updatedLabel || 'Updated recently'}</p>
                            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-gray-500">{item.category}</p>
                            <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-200">
                              Open topic
                              <ChevronRight className="h-4 w-4" />
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-8 text-center">
                    <p className="text-lg font-semibold text-white">No results found for "{debouncedQuery}"</p>
                    <p className="mt-2 text-sm text-gray-400">Try a simpler keyword, switch the filter, or use a corrected spelling.</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {didYouMean ? (
                        <button type="button" onClick={applyDidYouMean} className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400">
                          Search for "{didYouMean}"
                        </button>
                      ) : null}
                      {popularTopics.slice(0, 3).map((topic) => (
                        <button
                          key={`empty-topic-${topic.id}`}
                          type="button"
                          onClick={() => handleOpenSearchItem(topic)}
                          className="rounded-xl border border-white/10 bg-gray-950/30 px-4 py-2 text-sm text-gray-200 hover:bg-white/10"
                        >
                          {topic.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Discover Help</p>
                  <h2 className="mt-1 text-2xl font-bold text-white">Start with a topic or module</h2>
                  <p className="mt-2 max-w-3xl text-sm text-gray-300">
                    This help center supports typo-tolerant search, direct deep links, quick module navigation, and AI-guided help for staff who need the answer fast.
                  </p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-gray-950/30 p-4">
                    <p className="text-sm font-semibold text-white">Popular Topics</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {popularTopics.map((topic) => (
                        <button
                          key={`discover-topic-${topic.id}`}
                          type="button"
                          onClick={() => handleOpenSearchItem(topic)}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left hover:bg-white/10"
                        >
                          <p className="font-semibold text-white">{topic.title}</p>
                          <p className="mt-2 text-xs text-gray-400">{topic.breadcrumb.join(' > ')}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-gray-950/30 p-4">
                    <p className="text-sm font-semibold text-white">Recently Viewed</p>
                    <div className="mt-4 space-y-3">
                      {recentViewedTopics.length ? recentViewedTopics
                        .map((id) => helpSearchDocumentMap.get(id))
                        .filter((item): item is HelpSearchDocument => Boolean(item))
                        .slice(0, 5)
                        .map((topic) => (
                          <button
                            key={`recent-topic-${topic.id}`}
                            type="button"
                            onClick={() => handleOpenSearchItem(topic)}
                            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:bg-white/10"
                          >
                            <div>
                              <p className="font-medium text-white">{topic.title}</p>
                              <p className="mt-1 text-xs text-gray-400">{topic.breadcrumb.join(' > ')}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                          </button>
                        )) : (
                        <p className="text-sm text-gray-500">Open a few help topics and they will appear here for quick return access.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-200">Quick Actions</p>
              </div>
              <div className="mt-4 space-y-2">
                {(quickActionCards.length ? quickActionCards : [{ label: 'Browse all modules', to: '/user-manual#topic-index' }]).map((action) => (
                  action.to.startsWith('/user-manual#') ? (
                    <button
                      key={`quick-action-${action.label}`}
                      type="button"
                      onClick={() => scrollToSection(action.to.split('#')[1] || 'topic-index')}
                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-gray-950/30 px-3 py-2 text-left text-sm text-gray-100 hover:bg-white/10"
                    >
                      <span>{action.label}</span>
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    </button>
                  ) : (
                    <Link
                      key={`quick-action-${action.label}`}
                      to={resolveRouteTarget(action.to)}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-gray-950/30 px-3 py-2 text-sm text-gray-100 hover:bg-white/10"
                    >
                      <span>{action.label}</span>
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    </Link>
                  )
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section id="topic-index" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Table of Contents</p>
              <h2 className="text-2xl font-bold text-white">Jump directly to any topic in this manual</h2>
            </div>
            <div className="flex flex-wrap gap-2 no-print">
              <button
                type="button"
                onClick={expandAllTopicGroups}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={collapseAllTopicGroups}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-white/10"
              >
                Collapse all
              </button>
            </div>
          </div>

          <p className="max-w-3xl text-sm text-gray-300">
            Use this navigation tree to move straight to the explanation you need instead of scrolling through the full manual.
          </p>

          <div className="grid gap-4 xl:grid-cols-2">
            {topicIndexGroups.map((group) => (
              <article key={group.title} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                {(() => {
                  const groupMeta = resolveTopicGroupMeta(group.title);
                  const GroupIcon = groupMeta.icon;
                  const isOpen = topicTreeState[group.title] !== false;

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleTopicTreeGroup(group.title)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3 text-left hover:bg-white/5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${groupMeta.tone}`}>
                            <GroupIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">{group.title}</p>
                            <p className="mt-1 text-xs text-gray-400">{group.links.length} topic{group.links.length === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <div className={`rounded-full border border-white/10 p-1.5 text-gray-300 transition ${isOpen ? 'bg-white/10' : 'bg-transparent'}`}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="relative mt-4 ml-5 space-y-2 border-l border-white/10 pl-5">
                          {group.links.map((link) => (
                            <button
                              key={`${group.title}-${link.id}`}
                              type="button"
                              onClick={() => scrollToSection(link.id)}
                              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition before:absolute before:-left-[1.4rem] before:top-1/2 before:h-px before:w-4 before:-translate-y-1/2 before:bg-white/10 ${
                                activeSection === link.id
                                  ? 'bg-indigo-500/15 text-white'
                                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span className={`h-2 w-2 shrink-0 rounded-full ${activeSection === link.id ? 'bg-indigo-300' : 'bg-gray-500/70'}`} />
                              <span>{link.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        </section>

        <div className="space-y-6">
            <section id="overview" className="scroll-mt-28 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Overview</p>
                  <h2 className="text-2xl font-bold text-white">Introduction, objective, structure, and flow</h2>
                </div>
                <div className="flex gap-2 no-print">
                  <button
                    onClick={() => toggleSection('overview')}
                    className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                  >
                    {collapsedSections['overview'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => copySectionLink('overview')}
                    className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                    title="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {!collapsedSections['overview'] && (
                <>
                  <p className="max-w-2xl text-sm text-gray-300">
                    These sections explain what the application is for and how the business typically moves through the
                    system.
                  </p>

                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    {overviewSections.map((section) => (
                      <article key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
                        <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-gray-300">{section.description}</p>
                        <ul className="mt-4 space-y-2">
                          {section.bullets.map((bullet, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                              <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-indigo-400"></span>
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

        <section id="main-modules" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Main Menu Modules</p>
              <h2 className="text-2xl font-bold text-white">Seven core modules of the application</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Each module below includes a direct route hyperlink, a purpose statement, and a longer description of how
              the module supports the overall business.
            </p>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            {moduleSummaries.map((module) => (
              <article key={module.id} id={module.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{module.navigation}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{module.title}</h3>
                    <p className="mt-3 text-sm font-semibold text-sky-200">{module.purpose}</p>
                    <p className="mt-3 text-sm leading-7 text-gray-300">{module.description}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-gray-950/25 p-4 text-sm text-gray-100">
                    <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Direct Route</p>
                    <code className="mt-2 block text-sm text-sky-200">{module.route}</code>
                    <Link
                      to={resolveRouteTarget(module.route)}
                      className="mt-3 inline-flex rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
                    >
                      {routeActionLabel}
                    </Link>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-200">Key Uses</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {module.keyUses.map((item) => (
                      <span
                        key={`${module.id}-${item}`}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-100"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {module.links.map((link) => (
                    <Link
                      key={`${module.id}-${link.to}-${link.label}`}
                      to={resolveRouteTarget(link.to)}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-white/10"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="quick-links" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Quick Hyperlinks</p>
              <h2 className="text-2xl font-bold text-white">Direct links to modules and pages</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Use the anchor link to jump to the explanation on this page, or use the route link to open the actual
              screen in the application.
            </p>
          </div>

          <div className="grid items-start gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {quickLinks.map((item) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-400">{item.category}</p>
                  </div>
                  <a
                    href={`#${item.id}`}
                    className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-semibold text-gray-100 hover:bg-white/10"
                  >
                    View Guide
                  </a>
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-300">{item.navigation}</p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-gray-950/25 px-3 py-2">
                  <code className="text-xs text-sky-200">{item.route}</code>
                  <Link
                    to={resolveRouteTarget(item.route)}
                    className="rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400"
                  >
                    {routeActionLabel}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="menu-guides" className="scroll-mt-28 space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Detailed Menu Guides</p>
              <h2 className="text-2xl font-bold text-white">Expanded description of every major page</h2>
            </div>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => toggleSection('menu-guides')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
              >
                {collapsedSections['menu-guides'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                onClick={() => copySectionLink('menu-guides')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!collapsedSections['menu-guides'] && (
            <>
              <p className="max-w-2xl text-sm text-gray-300">
                Each page card below includes purpose, a longer description, key uses, and direct hyperlinks to related
                screens.
              </p>

              {menuSections.map((section) => (
                <article
                  key={section.id}
                  id={section.id}
                  className={`scroll-mt-28 rounded-3xl border border-white/10 bg-gradient-to-br ${section.accent} p-6 shadow-[0_18px_60px_rgba(15,23,42,0.28)]`}
                >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-200">{section.title}</p>
                  <h3 className="text-xl font-bold text-white">{section.summary}</h3>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                {section.pages.map((page) => (
                  <article key={page.id} id={page.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-gray-950/35 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{page.navigation}</p>
                        <h4 className="mt-2 text-xl font-semibold text-white">{page.title}</h4>
                        <p className="mt-3 text-sm font-semibold text-indigo-200">{page.purpose}</p>
                        <p className="mt-3 max-w-4xl text-sm leading-7 text-gray-300">{page.description}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-100">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Direct Route</p>
                        <code className="mt-2 block text-sm text-sky-200">{page.route}</code>
                        <Link
                          to={resolveRouteTarget(page.route)}
                          className="mt-3 inline-flex rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
                        >
                          {routeActionLabel}
                        </Link>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-200">Key Uses</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {page.keyUses.map((item) => (
                          <span
                            key={`${page.id}-${item}`}
                            className="rounded-full border border-white/15 bg-gray-950/25 px-3 py-1.5 text-xs font-semibold text-gray-100"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {page.links.map((link) => (
                        <Link
                          key={`${page.id}-${link.to}-${link.label}`}
                          to={resolveRouteTarget(link.to)}
                          className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-white/10"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ))}
            </>
          )}
        </section>

        <section id="transaction-guides" className="scroll-mt-28 space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Transaction Screen Guides</p>
              <h2 className="text-2xl font-bold text-white">Practical, screen-by-screen guidance for daily entries</h2>
            </div>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => toggleSection('transaction-guides')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
              >
                {collapsedSections['transaction-guides'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                onClick={() => copySectionLink('transaction-guides')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!collapsedSections['transaction-guides'] && (
            <>
              <p className="max-w-2xl text-sm text-gray-300">
                Each guide below explains what the screen does, how it works in business terms, one realistic example,
                and how the saved entry flows into reports.
              </p>

              {transactionGuideSections.map((section) => (
                <article key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">{section.title}</p>
                  <h3 className="text-xl font-bold text-white">{section.description}</h3>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                {section.guides.map((guide) => (
                  <article key={guide.id} id={guide.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-gray-950/35 p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{guide.navigation}</p>
                        <h4 className="mt-2 text-xl font-semibold text-white">{guide.title}</h4>
                        <p className="mt-3 max-w-4xl text-sm leading-7 text-gray-300">{guide.whatItDoes}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-100">
                        <p className="text-xs uppercase tracking-[0.14em] text-gray-400">Screen Route</p>
                        <code className="mt-2 block text-sm text-sky-200">{guide.route}</code>
                        <Link
                          to={resolveRouteTarget(guide.route)}
                          className="mt-3 inline-flex rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
                        >
                          {routeActionLabel}
                        </Link>
                      </div>
                    </div>

                    <div className="mt-5 grid items-start gap-4 xl:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-cyan-200">How The Screen Works</p>
                        <p className="mt-3 text-sm leading-6 text-gray-300">{guide.businessLogic}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-emerald-200">Practical Example</p>
                        <p className="mt-3 text-sm leading-6 text-gray-300">{guide.practicalExample}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-amber-200">How It Flows Into Reports</p>
                        <p className="mt-3 text-sm leading-6 text-gray-300">{guide.reportFlow}</p>
                      </div>
                    </div>

                    {guide.logicTable?.length ? (
                      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="mb-3 text-sm font-semibold text-fuchsia-200">Action And Response Logic</p>
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-300">
                              <th className="px-2 py-2">User Action</th>
                              <th className="px-2 py-2">System Response</th>
                            </tr>
                          </thead>
                          <tbody>
                            {guide.logicTable.map((row) => (
                              <tr key={`${guide.id}-${row.action}`} className="border-t border-white/10">
                                <td className="px-2 py-2 font-semibold text-white">{row.action}</td>
                                <td className="px-2 py-2 text-gray-300">{row.systemResponse}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    {guide.pastedCsvExample ? (
                      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm font-semibold text-cyan-200">Example CSV Paste</p>
                          <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/10 bg-gray-950/35 p-3 text-sm leading-6 text-gray-200">{guide.pastedCsvExample}</pre>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <p className="text-sm font-semibold text-emerald-200">Matched Example Status</p>
                          <table className="mt-3 min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-300">
                                <th className="px-2 py-2">Statement Row</th>
                                <th className="px-2 py-2">Ledger Row</th>
                                <th className="px-2 py-2">Match Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(guide.matchedExampleRows || []).map((row) => (
                                <tr key={`${guide.id}-${row.statementRow}`} className="border-t border-white/10">
                                  <td className="px-2 py-2 text-gray-300">{row.statementRow}</td>
                                  <td className="px-2 py-2 text-gray-300">{row.ledgerRow}</td>
                                  <td className="px-2 py-2 font-semibold text-emerald-300">{row.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {guide.matchedOutcome ? <p className="mt-3 text-sm leading-6 text-gray-300">{guide.matchedOutcome}</p> : null}
                        </div>
                      </div>
                    ) : null}

                    {guide.mismatchExamples?.length ? (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-rose-200">Common Mismatch Examples</p>
                        <div className="mt-3 grid items-start gap-3 xl:grid-cols-3">
                          {guide.mismatchExamples.map((row) => (
                            <div key={`${guide.id}-${row.issue}`} className="rounded-2xl border border-white/10 bg-gray-950/35 p-4">
                              <p className="text-sm font-semibold text-white">{row.issue}</p>
                              <p className="mt-2 text-sm leading-6 text-gray-300">{row.explanation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {guide.fieldGuide?.length ? (
                      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="mb-3 text-sm font-semibold text-sky-200">Field Guide</p>
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-300">
                              <th className="px-2 py-2">Field</th>
                              <th className="px-2 py-2">Why It Matters</th>
                              <th className="px-2 py-2">How To Use It</th>
                              <th className="px-2 py-2">Example</th>
                            </tr>
                          </thead>
                          <tbody>
                            {guide.fieldGuide.map((row) => (
                              <tr key={`${guide.id}-${row.field}`} className="border-t border-white/10 align-top">
                                <td className="px-2 py-2 font-semibold text-white">{row.field}</td>
                                <td className="px-2 py-2 text-gray-300">{row.whyItMatters}</td>
                                <td className="px-2 py-2 text-gray-300">{row.howToUse}</td>
                                <td className="px-2 py-2 text-gray-300">{row.example}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-300">
                      <span className="font-semibold text-gray-100">Note:</span> {guide.note}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ))}
            </>
          )}
        </section>

        <section id="report-logic" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Report Logic</p>
              <h2 className="text-2xl font-bold text-white">How report figures are derived in simple business language</h2>
            </div>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => toggleSection('report-logic')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
              >
                {collapsedSections['report-logic'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                onClick={() => copySectionLink('report-logic')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!collapsedSections['report-logic'] && (
            <>
              <p className="max-w-2xl text-sm text-gray-300">
                These notes explain what each report figure means and which saved transactions feed that figure, without
                using technical or code-level language.
              </p>

              <div className="grid gap-4">
                {reportLogicSections.map((section) => (
                  <article key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-xl font-semibold text-white">{section.title}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-300">{section.description}</p>
                <div className="mt-5 grid items-start gap-3 xl:grid-cols-2">
                  {section.topics.map((topic) => (
                    <div
                      key={`${section.id}-${topic.name}`}
                      id={topic.id}
                      className="scroll-mt-28 rounded-2xl border border-white/10 bg-gray-950/30 p-4"
                    >
                      <p className="text-sm font-semibold text-cyan-200">{topic.name}</p>
                      <p className="mt-2 text-sm leading-6 text-gray-300">{topic.explanation}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
            </>
          )}
        </section>

        <section id="sample-entries" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Sample Entries</p>
              <h2 className="text-2xl font-bold text-white">Realistic examples for each major transaction screen</h2>
            </div>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => toggleSection('sample-entries')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
              >
                {collapsedSections['sample-entries'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                onClick={() => copySectionLink('sample-entries')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!collapsedSections['sample-entries'] && (
            <>
              <p className="max-w-2xl text-sm text-gray-300">
                These examples can be used during training so staff know the style of values to enter on booking, sales,
                membership, accounting, settlement, and procurement screens.
              </p>

              <div className="grid gap-4">
                {sampleEntrySections.map((section) => (
                  <article key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-xl font-semibold text-white">{section.title}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-300">{section.description}</p>
                <div className="mt-5 grid items-start gap-4 xl:grid-cols-2">
                  {section.entries.map((entry) => (
                    <div key={`${section.id}-${entry.title}`} className="rounded-2xl border border-white/10 bg-gray-950/30 p-4">
                      <p className="text-sm font-semibold text-indigo-200">{entry.title}</p>
                      <p className="mt-3 text-sm leading-6 text-gray-300">
                        <span className="font-semibold text-gray-100">Sample values:</span> {entry.sample}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-gray-300">
                        <span className="font-semibold text-gray-100">Result:</span> {entry.result}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
            </>
          )}
        </section>

        <section id="report-data-flow" className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Report Data Flow</p>
              <h2 className="text-2xl font-bold text-white">How reports get their data from daily work</h2>
            </div>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => toggleSection('report-data-flow')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
              >
                {collapsedSections['report-data-flow'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                onClick={() => copySectionLink('report-data-flow')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!collapsedSections['report-data-flow'] && (
            <>
              <p className="max-w-2xl text-sm text-gray-300">
                This flow shows how the business moves from data entry to report output in plain language.
              </p>

              <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-white/10 bg-gray-950/30 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-200">Step By Step Flow</p>
              <ul className="mt-4 space-y-3">
                {reportDataFlowSteps.map((step) => (
                  <li key={step} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-gray-200">
                    {step}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-gray-950/30 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-200">What That Means In Practice</p>
              <ul className="mt-4 space-y-3">
                {reportDataFlowEffects.map((effect) => (
                  <li key={effect} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-gray-200">
                    {effect}
                  </li>
                ))}
              </ul>
            </div>
          </div>
            </>
          )}
        </section>

        <section id="final-summary" className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Final Summary</p>
              <h2 className="mt-2 text-2xl font-bold text-white">One complete platform for sports complex operations</h2>
            </div>
            <div className="flex gap-2 no-print">
              <button
                onClick={() => toggleSection('final-summary')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
              >
                {collapsedSections['final-summary'] ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
              <button
                onClick={() => copySectionLink('final-summary')}
                className="rounded-lg border border-white/15 bg-gray-950/30 px-3 py-1 text-xs text-gray-300 hover:bg-white/10"
                title="Copy link"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!collapsedSections['final-summary'] && (
            <>
              <p className="mt-4 max-w-4xl text-sm leading-7 text-gray-300">
                {APPLICATION_NAME} is a complete system for managing sports facility operations, sales, staff,
                memberships, and financial activity in one place. Each module plays a specific role, which keeps the
                overall workflow smooth, structured, and efficient.
              </p>
              <ul className="mt-4 space-y-2">
                {finalSummaryPoints.map((point) => (
                  <li
                    key={point}
                    className="rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3 text-sm leading-6 text-gray-200"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  </div>

    <button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-24 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-gray-950/80 text-white shadow-[0_16px_36px_rgba(15,23,42,0.35)] transition hover:bg-gray-900 no-print"
      aria-label="Back to top"
      title="Back to top"
    >
      <ArrowUp className="h-4 w-4" />
    </button>

    <button
      type="button"
      onClick={() => setIsChatOpen(true)}
      className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full border border-purple-300/25 bg-purple-500/85 text-white shadow-[0_18px_40px_rgba(147,51,234,0.32)] transition hover:bg-purple-400 no-print"
      aria-label="Open AI help assistant"
      title="Ask AI Help Assistant"
    >
      <MessageCircle className="h-5 w-5" />
    </button>

    {/* AI Chatbot Modal */}
    {isChatOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 no-print">
        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-gray-950 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">AI Help Assistant</h3>
            <button
              onClick={() => setIsChatOpen(false)}
              className="rounded-lg p-1 text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 h-96 overflow-y-auto rounded-lg border border-white/10 bg-gray-900/50 p-4">
            {chatMessages.map((message, index) => (
              <div key={index} className={`mb-4 flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                    message.type === 'user'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-700 text-gray-200'
                  }`}
                >
                  {message.type === 'ai' ? renderChatContent(message.content) : message.content}
                  {message.type === 'ai' && (
                    <button
                      onClick={() => void copyToClipboard(message.content)}
                      className="ml-2 text-xs text-gray-400 hover:text-white"
                      title="Copy response"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="max-w-xs rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-200">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-gray-400"></div>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.1s' }}></div>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-gray-400" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={currentQuestion}
              onChange={(e) => setCurrentQuestion(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me anything about the help manual..."
              className="flex-1 rounded-lg border border-white/15 bg-gray-950/30 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={!currentQuestion.trim() || isTyping}
              className="rounded-lg border border-white/15 bg-indigo-500 px-3 py-2 text-sm text-white hover:bg-indigo-400 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
