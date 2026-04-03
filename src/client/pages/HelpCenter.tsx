import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getGeneralSettings } from '../utils/generalSettings';

type ScreenGroup = {
  title: string;
  summary: string;
  accent: string;
  screens: Array<{ name: string; purpose: string }>;
};

type ManualSection = {
  id: string;
  title: string;
  intro: string;
  bullets: string[];
};

const screenGroups: ScreenGroup[] = [
  {
    title: 'Home and Sales',
    summary: 'Use these screens for billing, quotations, customer follow-up, and reviewing daily transactions.',
    accent: 'from-emerald-500/20 to-sky-500/10',
    screens: [
      { name: 'Dashboard', purpose: 'Open the app, review reminders, and jump into the right work area quickly.' },
      { name: 'Sales Dashboard', purpose: 'Start billing, access POS actions, and move into the sales workflow.' },
      { name: 'Sales History', purpose: 'Review completed invoices, edit eligible records, and print previous bills.' },
      { name: 'Quotations', purpose: 'Create customer estimates, save revisions, approve quotes, and convert them later.' },
      { name: 'Customer Management', purpose: 'Store customer details, track collections, and review activity history.' },
      { name: 'Return Management', purpose: 'Record item returns, refunds, and approvals against earlier sales.' },
    ],
  },
  {
    title: 'Catalog and Stock',
    summary: 'Use these screens to maintain items, categories, suppliers, purchase flow, and stock visibility.',
    accent: 'from-sky-500/20 to-cyan-500/10',
    screens: [
      { name: 'Products', purpose: 'Open the product workspace and move into entry, catalog, or alert views.' },
      { name: 'Add New Product', purpose: 'Create a new item with code, rate, stock, tax, and status details.' },
      { name: 'Product Catalog', purpose: 'Search and update existing products without creating duplicates.' },
      { name: 'Stock Alerts', purpose: 'Monitor low stock, inactive products, and items that need attention.' },
      { name: 'Procurement', purpose: 'Manage suppliers, purchase orders, receipts, and inventory inflow.' },
      { name: 'Categories', purpose: 'Group products so filtering, search, and reporting stay organized.' },
    ],
  },
  {
    title: 'People and Operations',
    summary: 'Use these screens to manage employees, attendance, facilities, event bookings, and memberships.',
    accent: 'from-amber-500/20 to-fuchsia-500/10',
    screens: [
      { name: 'Employees', purpose: 'Maintain employee master records and salary-related details.' },
      { name: 'Attendance Register', purpose: 'Mark daily attendance and lock entries after saving.' },
      { name: 'Shift Scheduling', purpose: 'Assign working hours, weekly off patterns, and notes for staff.' },
      { name: 'Payroll', purpose: 'Review month-wise attendance-based payroll calculations and export data.' },
      { name: 'Facility Setup', purpose: 'Create and maintain the facilities available for bookings.' },
      { name: 'Facility Booking', purpose: 'Reserve courts, halls, or other facilities for customer slots.' },
      { name: 'Event Booking', purpose: 'Manage organizer-led events with facilities, timing, and payment status.' },
      { name: 'Memberships', purpose: 'Create plans, add subscriptions, and manage renewals or member profiles.' },
      { name: 'Membership Reports', purpose: 'Review plan performance, reminders, renewals, and usage trends.' },
    ],
  },
  {
    title: 'Accounts and Admin',
    summary: 'Use these screens for finance workflows, reporting, settings, and access control.',
    accent: 'from-cyan-500/20 to-rose-500/10',
    screens: [
      { name: 'Accounting Console', purpose: 'Work with vouchers, day book, opening balances, books, and finance reports.' },
      { name: 'Settlement Center', purpose: 'Create receipt vouchers, manage credit notes, and close the business day.' },
      { name: 'Advanced Reports', purpose: 'Run operational and financial reports using date filters and exports.' },
      { name: 'General Settings', purpose: 'Update business profile, mail, invoice, print, and backup settings.' },
      { name: 'User Management', purpose: 'Create users, assign roles, and control which pages each role can open.' },
    ],
  },
];

const manualSections: ManualSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    intro: 'The login page is the starting point for all users, and this manual is available there before sign-in.',
    bullets: [
      'Open the application in Chrome or Microsoft Edge for the best experience.',
      'Enter your email, password, and company or tenant name when your organization requires it.',
      'Use the User Manual button on the login page whenever you need onboarding help before signing in.',
      'If your account is missing or your password is wrong, contact your administrator instead of creating duplicate users.',
    ],
  },
  {
    id: 'navigation',
    title: 'How Navigation Works',
    intro: 'SPARK AI shows only the screens your role is allowed to open, so menus can differ between users.',
    bullets: [
      'Use the top navigation categories to move between Home, Sales, Catalog, People, Operations, Accounts, and Admin.',
      'Use quick-action cards on the dashboard to jump into frequent tasks faster.',
      'Use search, filters, tabs, and date selectors at the top of pages before assuming data is missing.',
      'If a screen is not visible in your menu, your role probably does not include that page yet.',
    ],
  },
  {
    id: 'daily-work',
    title: 'Daily Workflows',
    intro: 'Most teams move through a repeatable set of screen flows each day.',
    bullets: [
      'Sales teams usually start in Sales Dashboard, continue in Sales History, and use Quotations or Customers as needed.',
      'Catalog teams move between Product Entry, Product Catalog, Stock Alerts, Categories, and Procurement.',
      'Operations teams work from Facility Setup, Facility Booking, Event Booking, Memberships, and Membership Reports.',
      'People and finance teams rely on Employees, Attendance Register, Shift Scheduling, Payroll, Accounting Console, and Settlement Center.',
    ],
  },
  {
    id: 'best-practices',
    title: 'Best Practices',
    intro: 'A few habits prevent most user errors and make the system easier for the next person using it.',
    bullets: [
      'Check dates, amounts, customer names, and statuses before saving any transaction.',
      'Use search and filters before scrolling large tables so you do not miss the right record.',
      'Avoid creating duplicate products, customers, members, or employees when an edit would be better.',
      'Log out when you finish work on a shared computer.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    intro: 'Most common issues are caused by filters, date ranges, permissions, or temporary browser/network problems.',
    bullets: [
      'For login issues, re-check email, password, and tenant name, then refresh and try again.',
      'For blank pages or missing data, clear filters, confirm the date range, and use the page refresh action.',
      'For Failed to fetch or network errors, refresh the browser tab and verify your internet connection.',
      'For printing or download issues, allow pop-ups and retry from Chrome or Edge.',
    ],
  },
];

export const HelpCenter: React.FC<{ isPublic?: boolean }> = ({ isPublic = false }) => {
  const settings = useMemo(() => getGeneralSettings(), []);
  const supportEmail = settings.business.email?.trim() || '';
  const supportPhone = settings.business.phone?.trim() || '';
  const brandName = settings.business.tradeName || settings.business.legalName || 'SPARK AI';

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-[0_24px_80px_rgba(15,23,42,0.35)]">
          <div className="grid gap-0 lg:grid-cols-[1.5fr_0.9fr]">
            <div className="bg-gradient-to-br from-indigo-500/20 via-sky-500/10 to-transparent p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">
                {isPublic ? 'Public User Manual' : 'User Manual'}
              </p>
              <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">How to use {brandName}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-gray-200 sm:text-base">
                This guide is based on the actual SPARK AI screens in the app. It explains what each work area is for,
                where to start common tasks, and how to troubleshoot the issues users hit most often.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {isPublic ? (
                  <>
                    <Link
                      to="/"
                      className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                    >
                      Back to Login
                    </Link>
                    <a
                      href="#screen-directory"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Browse Screens
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
                    <Link
                      to="/sales-dashboard"
                      className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/10"
                    >
                      Open Sales Dashboard
                    </Link>
                  </>
                )}
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs text-gray-300">
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Login available without sign-in</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Role-based screen visibility</span>
                <span className="rounded-full border border-white/10 bg-gray-950/30 px-3 py-1">Covers sales, operations, people, accounts</span>
              </div>
            </div>

            <div className="border-t border-white/10 bg-gray-950/35 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Quick Support</p>
                  <p className="mt-2 text-sm text-white">Share these details when reporting an issue:</p>
                </div>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Page name and action you were trying to complete</li>
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Date and time of the issue</li>
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Screenshot of the message or unexpected result</li>
                  <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Whether the problem happens every time or only sometimes</li>
                </ul>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-gray-400">Contact</p>
                  <p className="mt-2 text-sm text-gray-100">
                    {supportEmail ? supportEmail : 'Contact your administrator or internal support desk.'}
                  </p>
                  {supportPhone ? <p className="mt-1 text-sm text-gray-300">{supportPhone}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {manualSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">{section.title}</p>
              <p className="mt-2 text-sm leading-6 text-gray-300">{section.intro}</p>
            </a>
          ))}
        </section>

        <section id="screen-directory" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Screen Directory</p>
              <h2 className="text-2xl font-bold text-white">Where each screen fits</h2>
            </div>
            <p className="max-w-2xl text-sm text-gray-300">
              Use this as a quick map when you know the job you need to do but are not sure which screen name to open.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {screenGroups.map((group) => (
              <article
                key={group.title}
                className={`rounded-3xl border border-white/10 bg-gradient-to-br ${group.accent} p-6 shadow-[0_18px_60px_rgba(15,23,42,0.28)]`}
              >
                <h3 className="text-xl font-semibold text-white">{group.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-200">{group.summary}</p>
                <div className="mt-5 grid gap-3">
                  {group.screens.map((screen) => (
                    <div key={screen.name} className="rounded-2xl border border-white/10 bg-gray-950/30 px-4 py-3">
                      <p className="text-sm font-semibold text-white">{screen.name}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-300">{screen.purpose}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          {manualSections.map((section) => (
            <article key={section.id} id={section.id} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              <p className="mt-2 text-sm leading-7 text-gray-300">{section.intro}</p>
              <ul className="mt-4 space-y-3">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="rounded-2xl border border-white/10 bg-gray-950/25 px-4 py-3 text-sm leading-6 text-gray-200">
                    {bullet}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};
