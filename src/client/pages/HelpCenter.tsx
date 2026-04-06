import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
      'It centralizes employee information, attendance, shifts, and payroll so the organization can manage staff records and workforce operations with better consistency and accuracy.',
    keyUses: ['Store employee data', 'Track attendance', 'Manage shifts', 'Process payroll'],
    links: [
      { label: 'Employees', to: '/employees' },
      { label: 'Attendance', to: '/attendance' },
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
      'It helps the business maintain income and expense records, review financial activity, and complete settlement and reconciliation processes in a structured way.',
    keyUses: ['Track finances', 'Maintain records', 'Perform settlements'],
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
        id: 'attendance',
        title: 'Attendance',
        route: '/attendance',
        navigation: 'Top menu > People > Attendance',
        purpose: 'Tracks employee presence.',
        description:
          'This page records daily attendance for monitoring, operational review, and payroll support. It helps the organization maintain reliable employee presence data.',
        keyUses: ['Track attendance', 'Review daily presence', 'Support payroll'],
        links: [
          { label: 'Open Attendance', to: '/attendance' },
          { label: 'Open Employees', to: '/employees' },
          { label: 'Open Shifts', to: '/shifts' },
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
        title: 'Customers',
        route: '/customers',
        navigation: 'Top menu > Sales > Customers',
        purpose: 'Stores customer data.',
        description:
          'This page keeps customer history, contact details, and interactions in one place. It helps the team manage repeat business, contact follow-up, and better service continuity.',
        keyUses: ['Store customer data', 'Track customer history', 'Support customer interactions'],
        links: [
          { label: 'Open Customers', to: '/customers' },
          { label: 'Open Quotations', to: '/sales/quotes' },
          { label: 'Open Sales Orders', to: '/orders' },
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
          'This page manages event registrations, organizer details, facility allocation, schedule planning, and payment tracking. It supports both single-date and multi-date event workflows with printable confirmations.',
        keyUses: ['Manage registrations', 'Handle event schedules', 'Track event payments'],
        links: [
          { label: 'Open Event Booking', to: '/events' },
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
      'The Accounts menu gives finance and management teams a controlled way to review financial records and settlement activity.',
    accent: 'from-cyan-500/20 via-blue-500/10 to-transparent',
    pages: [
      {
        id: 'accounting',
        title: 'Accounting',
        route: '/accounting',
        navigation: 'Top menu > Accounts > Accounting',
        purpose: 'Maintains financial records.',
        description:
          'This page tracks income, expenses, and accounting activity. It provides the financial backbone of the system and helps the business maintain organized records for review and control.',
        keyUses: ['Track income', 'Track expenses', 'Maintain records'],
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
          'This page manages application configuration and preferences such as business profile, logos, print settings, mail settings, database tools, and shared operating preferences.',
        keyUses: ['Manage configuration', 'Control preferences', 'Support system setup'],
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

export const HelpCenter: React.FC<{ isPublic?: boolean }> = ({ isPublic = false }) => {
  const settings = useMemo(() => getGeneralSettings(), []);
  const supportEmail = settings.business.email?.trim() || '';
  const supportPhone = settings.business.phone?.trim() || '';
  const routeActionLabel = isPublic ? 'Login to open' : 'Open page';
  const resolveRouteTarget = (to: string) => (isPublic && to !== '/user-manual' ? '/login' : to);

  return (
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
                      href="#quick-links"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Jump to Hyperlinks
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
                      href="#menu-guides"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Jump to Detailed Pages
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

        <section id="overview" className="space-y-4">
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

          <div className="grid gap-4 lg:grid-cols-2">
            {overviewSections.map((section) => (
              <article key={section.id} id={section.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
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

        <section id="main-modules" className="space-y-4">
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

          <div className="grid gap-4 xl:grid-cols-2">
            {moduleSummaries.map((module) => (
              <article key={module.id} id={module.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
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

        <section id="quick-links" className="space-y-4">
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

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
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

        <section id="menu-guides" className="space-y-6">
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
              className={`rounded-3xl border border-white/10 bg-gradient-to-br ${section.accent} p-6 shadow-[0_18px_60px_rgba(15,23,42,0.28)]`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-200">{section.title}</p>
                  <h3 className="text-xl font-bold text-white">{section.summary}</h3>
                </div>
              </div>

              <div className="mt-5 grid gap-5">
                {section.pages.map((page) => (
                  <article key={page.id} id={page.id} className="rounded-3xl border border-white/10 bg-gray-950/35 p-5">
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

        <section id="final-summary" className="rounded-3xl border border-white/10 bg-white/5 p-6">
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
  );
};
