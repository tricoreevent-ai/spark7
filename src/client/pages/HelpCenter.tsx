import React, { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PublicSeo } from '../public/PublicSeo';
import { getGeneralSettings } from '../utils/generalSettings';

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

type CsvLogicRow = {
  action: string;
  systemResponse: string;
};

type CsvMatchRow = {
  statementRow: string;
  ledgerRow: string;
  status: string;
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
};

type TransactionGuideSection = {
  id: string;
  title: string;
  description: string;
  guides: TransactionGuide[];
};

const APPLICATION_NAME = 'Sarva';
const APPLICATION_TITLE = 'Sarva Sports Complex Management Platform';

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
      'It handles the full sales cycle from quotations and customer handling to orders, returns, and performance review. It ensures that all commercial transactions are recorded and easy to trace later.',
    keyUses: ['Manage customer orders', 'Provide quotations', 'Track sales', 'Handle returns', 'View sales reports'],
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
      { label: 'Reports', to: '/reports' },
    ],
  },
  {
    id: 'module-admin',
    title: 'Admin',
    route: '/settings',
    navigation: 'Top menu > Admin',
    purpose: 'The Admin module controls system configuration and access.',
    description:
      'It allows administrators to manage users, permissions, business settings, company setup, mail and print preferences, and other shared system behavior across the organization.',
    keyUses: ['Manage users', 'Control access', 'Configure system'],
    links: [
      { label: 'Settings', to: '/settings' },
      { label: 'Users', to: '/user-management' },
      { label: 'Company Create', to: '/admin/company-create' },
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
        id: 'product-entry',
        title: 'Product Entry',
        route: '/products/entry',
        navigation: 'Top menu > Catalog > Product Entry',
        purpose: 'Used to create and manage product details.',
        description:
          'This page allows users to add new products and update core product information so items can be used correctly in sales, inventory, alerts, and reporting. It is the main starting point for creating a new item master in the application.',
        keyUses: ['Add products', 'Update pricing', 'Maintain data'],
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
        purpose: 'Displays all products in the system.',
        description:
          'This page gives a full product list with search, filters, and navigation controls. It is useful for checking the current catalog, reviewing product information, and confirming whether an item already exists before adding or editing.',
        keyUses: ['View products', 'Search items', 'Check availability'],
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
        purpose: 'Monitors inventory levels.',
        description:
          'This page notifies users when stock is low or when other product conditions need attention. It helps the business act early, avoid stock-outs, and plan replenishment before sales are affected.',
        keyUses: ['Identify low stock', 'Plan restocking'],
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
        id: 'sales-orders',
        title: 'Sales Orders',
        route: '/orders',
        navigation: 'Top menu > Sales > Orders',
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
          'This page analyzes business performance by showing operational and revenue information through filters, tabs, exports, and summaries. It helps users understand what is happening in the business over time.',
        keyUses: ['Analyze performance', 'Review business data', 'Support decision-making'],
        links: [
          { label: 'Open Reports', to: '/reports' },
          { label: 'Open Sales Orders', to: '/orders' },
          { label: 'Open Accounting', to: '/accounting' },
        ],
      },
      {
        id: 'customers',
        title: 'Customers and CRM',
        route: '/customers/profiles',
        navigation: 'Sales > Customers > Profiles / Enquiries / Campaigns / Reports',
        purpose: 'Runs the customer CRM desk.',
        description:
          'This page combines customer profiles, enquiry follow-up, campaigns, visit and payment history, repeat-customer review, and customer collection watchlists in one place. It helps the team convert leads faster and serve repeat customers with better context.',
        keyUses: ['Maintain customer profiles', 'Track enquiries and follow-up', 'Run campaigns', 'Review CRM reports'],
        links: [
          { label: 'Open Customer Profiles', to: '/customers/profiles' },
          { label: 'Open Customer Enquiries', to: '/customers/enquiries' },
          { label: 'Open Customer Reports', to: '/customers/reports' },
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
    id: 'report-logic-sales',
    title: 'Sales And Customer Reports',
    description:
      'These reports summarize invoices, item lines, customers, returns, tax, user performance, and pending collections.',
    topics: [
      {
        name: 'Daily Sales Summary',
        explanation:
          'Adds all posted invoices day by day. Invoice count is the number of bills, sales amount is the saved bill total, tax amount comes from GST on those invoices, and outstanding is the unpaid balance still left.',
      },
      {
        name: 'Item-wise Sales',
        explanation:
          'Reads each product line from saved sales invoices. Quantity sold is the total quantity, amount is the total line value, and tax comes from the GST recorded for those item lines.',
      },
      {
        name: 'Customer-wise Sales',
        explanation:
          'Groups posted invoices customer by customer. It shows how many invoices each customer received, the total billed value, and what is still pending from that customer.',
      },
      {
        name: 'Sales Returns',
        explanation:
          'Uses approved return entries only. Returned amount is the value of goods coming back, returned tax is the tax reversal, and refund amount is the money given back or adjusted.',
      },
      {
        name: 'Gross Profit',
        explanation:
          'Compares what was sold against the saved item cost. Revenue is sales value, cost of goods is item cost, and gross profit is the difference between them.',
      },
      {
        name: 'Outstanding Receivables',
        explanation:
          'Lists posted credit invoices that still have balance left to collect. Total outstanding is the sum of all remaining unpaid amounts.',
      },
      {
        name: 'Cash vs Credit And User-wise Sales',
        explanation:
          'Cash vs Credit separates invoices by invoice type, while User-wise Sales groups invoices by the staff user who handled them and shows totals by payment mode.',
      },
      {
        name: 'Tax Summary',
        explanation:
          'Builds GST totals from invoice item lines and approved return lines so the business can see billed tax and reversed tax by tax rate.',
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
        name: 'Income And Expense Reports',
        explanation:
          'Income combines posted sales and manual income entries. Expense combines manual expenses, salary payments, contract payments, and approved refund-related outflows.',
      },
      {
        name: 'Trial Balance',
        explanation:
          'Starts with the opening balance of each account, adds period debits, subtracts period credits, and shows the closing balance for that account.',
      },
      {
        name: 'Profit And Loss',
        explanation:
          'Compares total income against total expense for the selected period. Net profit is simply income minus expense.',
      },
      {
        name: 'Balance Sheet',
        explanation:
          'Shows the business position as on a date by listing asset balances on one side and liability or earnings balances on the other side.',
      },
      {
        name: 'Cash Book And Bank Book',
        explanation:
          'Show all entries that affected cash or bank during the period, including receipts, payments, expenses, transfers, and collections.',
      },
      {
        name: 'MIS Summary, Collections, And Day-End',
        explanation:
          'The MIS summary combines major income and expense totals. Daily collection compares cash sales, cash receipts, and cash expenses. Day-end starts with opening cash, applies the day’s cash movement, and compares system cash with physical cash counted.',
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
          'Sell Yonex Mavis 350 Shuttle quantity 10 and Badminton Grip quantity 4, Customer Phone 9847001122, Customer Name Anjali Nair, Customer Email anjali@example.com, Discount 100 amount, Payment Method UPI, Invoice Type Cash Invoice, Invoice Status Post Invoice, GST Bill On, Notes Counter sale after coaching session.',
        result:
          'Sales, item-wise sales, customer-wise sales, GST totals, and stock movement update immediately.',
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
          'Stock on hand increases and inventory movement shows a stock-in entry.',
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
          'Use this screen to create a customer bill for products, apply discount or membership benefits, and post the invoice as cash or credit.',
        businessLogic:
          'The screen totals the cart, applies discount, adds GST when chosen, and then saves the invoice. Cash invoices normally close immediately, while credit invoices keep an outstanding balance until payment is collected later.',
        practicalExample:
          'Sell Yonex Mavis 350 Shuttle quantity 10 and Badminton Grip quantity 4 to Anjali Nair, apply discount 100, choose UPI payment, select Cash Invoice and Post Invoice, then create the bill.',
        reportFlow:
          'The invoice updates daily sales, item-wise sales, customer-wise sales, tax summaries, user-wise sales, stock movement, and receivable totals when credit is used.',
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
          'The system reads the month, checks attendance and pay setup, and then calculates payable days, overtime, base pay, overtime pay, and total payout for each employee.',
        practicalExample:
          'Choose Month 2026-04 and click Generate. Review the table for employee count, total payout, payable days, overtime hours, and total salary.',
        reportFlow:
          'Payroll output helps HR and finance review salary liability for the month and supports salary payment planning.',
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
      ...reportLogicSections.map((section) => ({ id: section.id, label: section.title })),
      { id: 'sample-entries', label: 'Sample Data Entry Examples' },
      ...sampleEntrySections.map((section) => ({ id: section.id, label: section.title })),
      { id: 'report-data-flow', label: 'How Data Moves From Entry Screen To Report' },
      { id: 'final-summary', label: 'Final Summary' },
    ],
  },
];

export const HelpCenter: React.FC<{ isPublic?: boolean }> = ({ isPublic = false }) => {
  const location = useLocation();
  const settings = useMemo(() => getGeneralSettings(), []);
  const supportEmail = settings.business.email?.trim() || '';
  const supportPhone = settings.business.phone?.trim() || '';
  const routeActionLabel = isPublic ? 'Login to open' : 'Open page';
  const resolveRouteTarget = (to: string) => (isPublic && to !== '/user-manual' ? '/login' : to);

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

  return (
    <>
      {isPublic ? <PublicSeo routeKey="user-manual" /> : null}
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
          <div className="grid gap-0 lg:grid-cols-[1.55fr_0.95fr]">
            <div className="bg-gradient-to-br from-indigo-500/20 via-sky-500/10 to-transparent p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">
                {isPublic ? 'Public User Manual' : 'User Manual and Product Documentation'}
              </p>
              <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{APPLICATION_TITLE}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-200 sm:text-base">
                This manual explains how the application is structured, what each module is used for, and how every
                major page or form supports day-to-day business operations. Each section below includes direct
                hyperlinks so staff can jump to the exact screen they need.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
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
                      Open Topic Index
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
                      Open Topic Index
                    </a>
                  </>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-gray-300">
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Module-by-module guide</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Direct hyperlinks included</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Expanded page descriptions</span>
              </div>
            </div>

            <div className="border-t border-white/10 bg-gray-950/35 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Quick Orientation</p>
                  <p className="mt-2 text-sm text-white">The application usually follows this sequence in real usage:</p>
                </div>
                <ul className="space-y-2 text-sm text-gray-300">
                  {navigationFlowSteps.map((step) => (
                    <li key={step} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      {step}
                    </li>
                  ))}
                </ul>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Support Contact</p>
                  <p className="mt-2 text-sm text-gray-100">
                    {supportEmail ? supportEmail : 'Contact your administrator or internal support desk.'}
                  </p>
                  {supportPhone ? <p className="mt-1 text-sm text-gray-300">{supportPhone}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="topic-index" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Topic Index</p>
              <h2 className="text-2xl font-bold text-white">Jump directly to any topic in this manual</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Use this index to move straight to the explanation you need instead of scrolling through the full manual.
            </p>
          </div>

          <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
            {topicIndexGroups.map((group) => (
              <article key={group.title} className="mb-4 break-inside-avoid rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">{group.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.links.map((link) => (
                    <a
                      key={`${group.title}-${link.id}`}
                      href={`#${link.id}`}
                      className="rounded-full border border-white/15 bg-gray-950/30 px-3 py-1.5 text-xs font-semibold text-gray-100 hover:bg-white/10"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="overview" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Overview</p>
              <h2 className="text-2xl font-bold text-white">Introduction, objective, structure, and flow</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              These sections explain what the application is for and how the business typically moves through the
              system.
            </p>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            {overviewSections.map((section) => (
              <article key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">{section.title}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-300">{section.description}</p>
                <ul className="mt-4 space-y-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3 text-sm leading-6 text-gray-200">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
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
            <p className="max-w-2xl text-sm text-gray-300">
              Each page card below includes purpose, a longer description, key uses, and direct hyperlinks to related
              screens.
            </p>
          </div>

          {menuSections.map((section) => (
            <section
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
            </section>
          ))}
        </section>

        <section id="transaction-guides" className="scroll-mt-28 space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Transaction Screen Guides</p>
              <h2 className="text-2xl font-bold text-white">Practical, screen-by-screen guidance for daily entries</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Each guide below explains what the screen does, how it works in business terms, one realistic example,
              and how the saved entry flows into reports.
            </p>
          </div>

          {transactionGuideSections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
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

                    <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-300">
                      <span className="font-semibold text-gray-100">Note:</span> {guide.note}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </section>

        <section id="report-logic" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Report Logic</p>
              <h2 className="text-2xl font-bold text-white">How report figures are derived in simple business language</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              These notes explain what each report figure means and which saved transactions feed that figure, without
              using technical or code-level language.
            </p>
          </div>

          <div className="grid gap-4">
            {reportLogicSections.map((section) => (
              <article key={section.id} id={section.id} className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-xl font-semibold text-white">{section.title}</h3>
                <p className="mt-3 text-sm leading-7 text-gray-300">{section.description}</p>
                <div className="mt-5 grid items-start gap-3 xl:grid-cols-2">
                  {section.topics.map((topic) => (
                    <div key={`${section.id}-${topic.name}`} className="rounded-2xl border border-white/10 bg-gray-950/30 p-4">
                      <p className="text-sm font-semibold text-cyan-200">{topic.name}</p>
                      <p className="mt-2 text-sm leading-6 text-gray-300">{topic.explanation}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="sample-entries" className="scroll-mt-28 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Sample Entries</p>
              <h2 className="text-2xl font-bold text-white">Realistic examples for each major transaction screen</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              These examples can be used during training so staff know the style of values to enter on booking, sales,
              membership, accounting, settlement, and procurement screens.
            </p>
          </div>

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
        </section>

        <section id="report-data-flow" className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Report Data Flow</p>
              <h2 className="text-2xl font-bold text-white">How reports get their data from daily work</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              This flow shows how the business moves from data entry to report output in plain language.
            </p>
          </div>

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
        </section>

        <section id="final-summary" className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Final Summary</p>
          <h2 className="mt-2 text-2xl font-bold text-white">One complete platform for sports complex operations</h2>
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
        </section>
      </div>
      </div>
    </>
  );
};
