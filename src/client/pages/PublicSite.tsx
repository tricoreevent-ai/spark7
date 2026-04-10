import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PublicSeo } from '../public/PublicSeo';
import {
  APPLICATION_RIGHTS_NOTE,
  PRIMARY_SEO_PHRASE,
  PRODUCT_BRAND_NAME,
  RIGHTS_HOLDER_ADDRESS,
  RIGHTS_HOLDER_NAME,
  buildWhatsappContactUrl,
  WHATSAPP_DISPLAY_PHONE,
} from '../public/publicBrand';
import { apiUrl, fetchApiJson } from '../utils/api';

const DEFAULT_PUBLIC_MARKETING_IMAGE = new URL('../assets/marketing/spark-dashboard-macbook.png', import.meta.url).href;
const PUBLIC_CONTENT_WIDTH_CLASS = 'max-w-[1600px]';

type PublicPageKey = 'home' | 'products' | 'about' | 'contact' | 'login';

type ActionLink = {
  label: string;
  to: string;
  variant?: 'primary' | 'secondary';
};

type PublicShellProps = {
  active: PublicPageKey;
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  primaryAction?: ActionLink;
  secondaryAction?: ActionLink;
  heroSupplement?: React.ReactNode;
  heroVariant?: 'default' | 'banner';
  heroRight: React.ReactNode;
  children?: React.ReactNode;
};

type PublicHomePageProps = {
  productImageSrc?: string;
};

type PublicLoginPageProps = {
  children: React.ReactNode;
};

const publicNavItems: Array<{ key: PublicPageKey; label: string; to: string }> = [
  { key: 'home', label: 'Home', to: '/' },
  { key: 'products', label: 'Products', to: '/products' },
  { key: 'about', label: 'About', to: '/about' },
  { key: 'contact', label: 'Contact', to: '/contact' },
];

type FeatureShowcaseCard = {
  title: string;
  keyword: string;
  description: string;
  bullets: string[];
  manualTo: string;
  manualLabel: string;
  accent: string;
};

type FeatureWorkstream = {
  title: string;
  description: string;
  bullets: string[];
};

type EventManagementCapability = {
  title: string;
  description: string;
  bullets: string[];
};

type ProductCapabilityRow = {
  area: string;
  detail: string;
};

const homeFeatures = [
  {
    title: 'Facility Booking System',
    description:
      'Manage court reservations, recurring schedules, event bookings, availability rules, and payment follow-up from one sports complex workflow.',
  },
  {
    title: 'Online Court Scheduling',
    description:
      'Keep online court scheduling, front desk follow-up, quotations, and venue availability aligned without separate tools.',
  },
  {
    title: 'Secure Payment Processing',
    description:
      'Track collections, billing, receipts, and secure payment processing alongside the booking and membership records they belong to.',
  },
  {
    title: 'Membership Management',
    description:
      'Create plans, issue subscriptions, track renewals, and monitor member activity from one connected membership management workspace.',
  },
  {
    title: 'Staff Operations',
    description:
      'Store employee details, manage shifts, mark attendance, and support payroll preparation from the same sports facility management software.',
  },
  {
    title: 'Reporting and Controls',
    description:
      'Review accounting entries, settlements, reports, user permissions, SMTP setup, and print configuration in one admin-ready system.',
  },
  {
    title: 'Sports Event Management Application',
    description:
      'Run multiple sports events with publishing, registration windows, payment proof collection, schedules, newsletters, and admin review tools.',
  },
];

const workflowSteps = [
  'Set up facilities, plans, products, users, and pricing structure.',
  'Run front desk sales, facility bookings, memberships, and event reservations.',
  'Track staff attendance, payroll inputs, and operational follow-up.',
  'Close the loop with accounting, settlements, reports, and printable confirmations.',
];

const homeHeroDetails = [
  {
    title: 'Run online court scheduling and facility booking from one flow.',
    description:
      'Control court schedules, event blocks, advance collection, and customer follow-up from one connected facility booking system.',
  },
  {
    title: 'Keep membership management and staff operations in sync.',
    description:
      'Track renewals, attendance, payroll inputs, and operational follow-up without splitting work across separate tools.',
  },
  {
    title: 'Close the day with secure payments and reporting clarity.',
    description:
      'Move from billing to receipts, vouchers, settlements, and reports with a cleaner audit trail for daily review.',
  },
];

const aboutHighlights = [
  {
    title: 'Built for high-activity venues',
    description:
      'Sarva is sports facility management software designed for sports complexes, indoor arenas, clubs, coaching centers, and recreational campuses.',
  },
  {
    title: 'Client-ready architecture',
    description:
      'Each organization can access its own tenant workspace, making it suitable for different clients using the same application product.',
  },
  {
    title: 'Operational depth',
    description:
      'The platform covers bookings, events, products, memberships, employees, finance, and admin controls instead of splitting work across separate tools.',
  },
  {
    title: 'Multi-sport event management',
    description:
      'Sarva also supports a sports event management application for tournaments, leagues, registrations, payment review, matches, newsletters, and partner-facing operations.',
  },
];

const moduleHighlights = [
  { title: 'Home', detail: 'Snapshot dashboard for activity, alerts, reminders, and quick navigation.' },
  { title: 'Sales', detail: 'Quotations, orders, customers, returns, and sales reporting.' },
  { title: 'Catalog', detail: 'Product entry, catalog browsing, procurement, categories, and stock alerts.' },
  { title: 'People', detail: 'Employees, attendance, shifts, and payroll support.' },
  { title: 'Operations', detail: 'Facility setup, bookings, event booking, plans, subscriptions, and memberships.' },
  { title: 'Accounts', detail: 'Accounting records, settlements, and financial review.' },
  { title: 'Admin', detail: 'Settings, company profile, user management, print, and mail configuration.' },
];

const featureShowcaseCards: FeatureShowcaseCard[] = [
  {
    title: 'Facility Booking System',
    keyword: 'facility booking system',
    description:
      'Run court, turf, hall, pool, and venue reservations from one sports facility management software workflow.',
    bullets: ['Court and venue availability control', 'Advance collection and balance follow-up', 'Printable booking confirmations'],
    manualTo: '/user-manual#operations-menu',
    manualLabel: 'Read operations guide',
    accent: 'from-cyan-500/20 via-sky-500/10 to-transparent',
  },
  {
    title: 'Online Court Scheduling',
    keyword: 'online court scheduling',
    description:
      'Keep online court scheduling, recurring slots, and front-desk changes aligned without separate trackers.',
    bullets: ['Date and slot-level scheduling', 'Linked customer history and follow-up', 'Operational visibility for active venues'],
    manualTo: '/user-manual#facility-booking',
    manualLabel: 'Open facility booking topic',
    accent: 'from-emerald-500/20 via-teal-500/10 to-transparent',
  },
  {
    title: 'Event Quotations and Booking',
    keyword: 'event quotation software',
    description:
      'Prepare event quotations, revise older versions, preview the PDF, send the quotation by email, and convert the approved quote into a booking.',
    bullets: ['Version history for revised quotes', 'PDF preview, print, and email output', 'Booking conversion without retyping event data'],
    manualTo: '/user-manual#transaction-event-quotation',
    manualLabel: 'Read event quotation guide',
    accent: 'from-fuchsia-500/20 via-purple-500/10 to-transparent',
  },
  {
    title: 'Customer CRM and Sales Desk',
    keyword: 'sports facility management software crm',
    description:
      'Track customer profiles, enquiries, campaign follow-up, quotations, orders, returns, and payment history from one connected sales desk.',
    bullets: ['Profiles, enquiries, campaigns, and reports', 'Faster follow-up from lead to booking or sale', 'Repeat-customer and collection visibility'],
    manualTo: '/user-manual#customers',
    manualLabel: 'Read customer CRM guide',
    accent: 'from-amber-500/20 via-orange-500/10 to-transparent',
  },
  {
    title: 'Membership Management',
    keyword: 'membership management',
    description:
      'Create plans, issue subscriptions, manage active members, track renewals, and monitor membership reports from one system.',
    bullets: ['Plan and subscription setup', 'Renewal and expiry visibility', 'Revenue and growth reporting'],
    manualTo: '/user-manual#memberships',
    manualLabel: 'Read membership guide',
    accent: 'from-indigo-500/20 via-violet-500/10 to-transparent',
  },
  {
    title: 'Secure Payment Processing and Controls',
    keyword: 'secure payment processing',
    description:
      'Support billing, receipts, vouchers, settlements, and audit-friendly accounting control with cleaner daily finance workflows.',
    bullets: ['Receipt, payment, and journal vouchers', 'Settlement and reconciliation workspace', 'Shared settings, mail, print, and user permissions'],
    manualTo: '/user-manual#accounting',
    manualLabel: 'Read accounting guide',
    accent: 'from-slate-400/20 via-cyan-500/10 to-transparent',
  },
  {
    title: 'Sports Event Management Application',
    keyword: 'sports event management application',
    description:
      'Manage multiple sports events with public event pages, registration control, payment proof collection, matches, newsletters, reports, and admin settings.',
    bullets: ['Publish events and control registration windows', 'Collect registrations, sign-in, and payment proof', 'Manage matches, reports, newsletters, users, and settings'],
    manualTo: '/contact',
    manualLabel: 'Request event walkthrough',
    accent: 'from-rose-500/20 via-fuchsia-500/10 to-transparent',
  },
];

const featureWorkstreams: FeatureWorkstream[] = [
  {
    title: 'Front Desk and Revenue Flow',
    description: 'Handle enquiries, quotations, bookings, POS activity, and receipts without splitting context across tools.',
    bullets: ['Customer CRM tabs for profiles, enquiries, campaigns, and reports', 'Quotations, orders, returns, and invoice follow-up', 'Direct handoff from interest to confirmed booking or sale'],
  },
  {
    title: 'Venue Operations',
    description: 'Coordinate availability, event schedules, membership services, and operational follow-up from one platform.',
    bullets: ['Facility setup and booking control', 'Multi-date events and event quotation workflow', 'Membership plans, subscriptions, and member review'],
  },
  {
    title: 'People and Administration',
    description: 'Keep staff activity and shared business settings aligned with the operational workflow.',
    bullets: ['Employees, attendance, shifts, and payroll support', 'User management and permission control', 'Company profile, print preferences, and SMTP setup'],
  },
  {
    title: 'Accounts and Reporting',
    description: 'Close the loop with financial review, settlements, and management-ready reporting.',
    bullets: ['Accounting console with vouchers and books', 'Settlement and reconciliation review', 'Sales, operational, membership, and finance reporting'],
  },
  {
    title: 'Sports Event Operations',
    description: 'Extend the platform with a dedicated event management application for public registrations and tournament operations.',
    bullets: ['Public event website, event detail pages, and newsletters', 'User dashboard for registrations and payment states', 'Admin portal for events, registrations, matches, reports, users, and settings'],
  },
];

const eventManagementCapabilities: EventManagementCapability[] = [
  {
    title: 'Public event website and discovery',
    description:
      'Publish events, control registration windows, showcase banners, list featured tournaments, and support public newsletters, contact, and partner access.',
    bullets: ['Public event catalog and event detail pages', 'Corporate and sponsor-facing communication', 'Newsletter publishing and announcement flow'],
  },
  {
    title: 'Registration and payment flow',
    description:
      'Let participants sign in, register for paid or free events, and submit payment proof for review when the event requires payment confirmation.',
    bullets: ['Registration workflow with sign-in', 'Paid-event proof upload and review', 'User dashboard for registration and payment status'],
  },
  {
    title: 'Admin event control',
    description:
      'Operate multi-sport events from one admin portal covering events, registrations, matches, accounting, reports, users, settings, and the training manual.',
    bullets: ['Event creation, status control, and visibility', 'Match scheduling and knockout generation', 'Accounting, alerts, reports, backups, and SMTP-ready settings'],
  },
];

const trialOfferBenefits = [
  '30-day guided trial request for one client workspace',
  'Basic setup support for facilities, users, and starter workflow mapping',
  'WhatsApp and email follow-up during the trial period',
  'A practical review of bookings, memberships, payments, and reporting before rollout',
];

const productLineHighlights = [
  {
    title: 'Two purpose-built products',
    description:
      'Sarva Horizon presents a full sports complex management platform and a dedicated sports event management product, so organizations can choose the software depth they actually need.',
  },
  {
    title: 'Standalone today, ecosystem-ready tomorrow',
    description:
      'Each product works on its own, while the shared Sarva approach makes it easier to expand from focused event operations into a broader venue operating platform later.',
  },
  {
    title: 'Professional, operations-first design',
    description:
      'Both products are shaped around real booking desks, finance review, participant coordination, and management reporting instead of generic business templates.',
  },
];

const sportsComplexPlatformAudience = [
  'Sports complex owners and operators',
  'Front desk and operations teams',
  'Sales and CRM staff',
  'HR and payroll managers',
  'Accountants and finance teams',
  'Administrators and system managers',
];

const sportsEventManagementAudience = [
  'Tournament organizers',
  'Sports clubs and associations',
  'Schools and colleges running sports meets',
  'Corporate sports event planners',
  'Community sports leagues',
];

const sportsComplexPlatformCapabilities: ProductCapabilityRow[] = [
  {
    area: 'Facility and event booking',
    detail:
      'Court, pool, hall, and slot booking with event quotations, revision history, PDF preview, email sending, and booking conversion.',
  },
  {
    area: 'Memberships',
    detail: 'Plan creation, subscriptions, renewals, expiry alerts, member benefits, and membership reporting.',
  },
  {
    area: 'Retail and inventory',
    detail: 'Product catalog, stock alerts, procurement, purchase orders, stock receipts, and returns.',
  },
  {
    area: 'Sales and CRM',
    detail: 'Customer profiles, enquiries, campaigns, quotations, invoices, credit notes, and collection follow-up.',
  },
  {
    area: 'Employee management',
    detail: 'GPS-ready self check-in, attendance register, shifts, and payroll support.',
  },
  {
    area: 'Accounting',
    detail:
      'Invoicing, vendor bills, vouchers, cash and bank books, CSV bank reconciliation, and financial statements.',
  },
  {
    area: 'Settlements and closing',
    detail: 'Receipt allocation, day-end cash review, and variance reporting.',
  },
  {
    area: 'Admin and configuration',
    detail: 'User roles, company setup, SMTP and printing preferences, and backup controls.',
  },
];

const sportsEventManagementCapabilitiesDetailed: ProductCapabilityRow[] = [
  {
    area: 'Event creation and scheduling',
    detail: 'Define event name, dates, slots, facilities, and venue timelines for one or multiple sports events.',
  },
  {
    area: 'Quotation management',
    detail: 'Generate professional event quotations with revision history, PDF preview, print, email, and booking conversion.',
  },
  {
    area: 'Participant and team registration',
    detail: 'Capture organizer, participant, and team details with sign-in and registration control.',
  },
  {
    area: 'Facility allocation',
    detail: 'Block courts, pitches, pools, or halls for the full event duration without double-booking.',
  },
  {
    area: 'Payment tracking',
    detail: 'Record advances, payment proof, balance dues, and settlement follow-up for each event.',
  },
  {
    area: 'Schedule and calendar visibility',
    detail: 'Review event timelines, admin planning views, and operational schedules in one place.',
  },
  {
    area: 'Printable confirmations and reports',
    detail: 'Issue booking confirmations and review event revenue, occupancy, and payment-status summaries.',
  },
];

const sportsComplexPlatformReasons = [
  'One source of truth for bookings, memberships, CRM, staff, and finance',
  'Real-time visibility into operations, attendance, revenue, and control points',
  'Audit-ready reporting with traceable entries across the business workflow',
  'Scales from a single facility to a large multi-sport arena',
];

const sportsEventManagementReasons = [
  'Focused and simple for event organizers who do not need a full ERP platform',
  'Fast quotation-to-booking flow for smoother organizer communication',
  'Works well as a standalone event operations product',
  'A practical entry point for organizations digitizing sports events',
];

const productComparisonRows = [
  {
    label: 'Best fit',
    platform: 'Sports complexes, arenas, clubs, academies, and venues managing day-to-day business operations.',
    events: 'Tournament organizers, sports associations, schools, corporate event teams, and league operators.',
  },
  {
    label: 'Core strength',
    platform: 'Full operating system for bookings, memberships, CRM, staff, accounting, and administration.',
    events: 'Dedicated event lifecycle management from publishing and registration to schedules and reporting.',
  },
  {
    label: 'Ideal buying moment',
    platform: 'When a venue wants one connected system across front desk, operations, people, and finance.',
    events: 'When a team needs event-specific software without adding retail, HR, or full complex workflows.',
  },
  {
    label: 'Growth path',
    platform: 'Use as the long-term operational backbone for sports facility scale-up.',
    events: 'Start with event operations now and expand into the broader Sarva ecosystem later.',
  },
];

const contactOptions = [
  {
    title: 'Request a walkthrough',
    description:
      'Use the Contact page to book a demo, discuss onboarding, and review how the sports complex management platform fits your venue.',
  },
  {
    title: 'Client access',
    description:
      'Existing client organizations can sign in from the Login link using their email, password, and tenant or company identifier.',
  },
  {
    title: 'Training and rollout',
    description:
      `${PRODUCT_BRAND_NAME} works well for front desk, operations, sales, HR, accounts, and administration teams that need a shared system with clear process flow.`,
  },
];

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-full border px-4 py-2 text-sm font-semibold transition',
    isActive
      ? 'border-amber-300/40 bg-amber-300/12 text-white shadow-[0_0_24px_rgba(251,191,36,0.2)]'
      : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10 hover:text-white',
  ].join(' ');

const actionClassName = (variant: ActionLink['variant']) =>
  variant === 'secondary'
    ? 'inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10'
    : 'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-amber-300 hover:to-orange-400';

const whatsappContactUrl = buildWhatsappContactUrl();

const PublicContactForm: React.FC = () => {
  const [form, setForm] = React.useState({
    name: '',
    email: '',
    mobile: '',
    message: '',
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');

  const updateField = (field: 'name' | 'email' | 'mobile' | 'message') =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetchApiJson(apiUrl('/api/public/contact'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      setSuccess(String(response.message || 'Your enquiry has been sent successfully.'));
      setForm({
        name: '',
        email: '',
        mobile: '',
        message: '',
      });
    } catch (submitError) {
      setError(String((submitError as Error)?.message || submitError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Contact Form</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Send an enquiry to {RIGHTS_HOLDER_NAME}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Share your email, optionally add a mobile number, and tell us what you need. We will use your details to
            follow up on rollout, onboarding, or product questions.
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-200">
            Ask for the 30-day guided trial if you want to evaluate the platform before rollout.
          </p>
        </div>
        <a
          href={whatsappContactUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-green-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-emerald-400 hover:to-green-300"
        >
          WhatsApp {WHATSAPP_DISPLAY_PHONE}
        </a>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-100">Full Name</label>
          <input
            type="text"
            value={form.name}
            onChange={updateField('name')}
            placeholder="Enter your name"
            required
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-300 focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-100">Email Address</label>
          <input
            type="email"
            value={form.email}
            onChange={updateField('email')}
            placeholder="name@company.com"
            required
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-300 focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-100">Mobile Number</label>
          <input
            type="tel"
            value={form.mobile}
            onChange={updateField('mobile')}
            placeholder="Optional"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-300 focus:outline-none"
          />
          <p className="text-xs text-slate-400">Optional. Add this only if you want a phone or WhatsApp follow-up.</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-100">WhatsApp Contact</label>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <p>{WHATSAPP_DISPLAY_PHONE}</p>
            <a href={whatsappContactUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-semibold text-emerald-200 hover:text-emerald-100">
              Open WhatsApp chat
            </a>
          </div>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <label className="text-sm font-semibold text-slate-100">Message</label>
          <textarea
            value={form.message}
            onChange={updateField('message')}
            placeholder="Tell us about your sports complex, rollout plan, the modules you want, or that you want the 30-day trial offer."
            required
            rows={5}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-amber-300 focus:outline-none"
          />
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 lg:col-span-2">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 lg:col-span-2">
            {success}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 lg:col-span-2">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-amber-300 hover:to-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Sending enquiry...' : 'Send Contact Enquiry'}
          </button>
          <a
            href={whatsappContactUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            Contact on WhatsApp
          </a>
        </div>
      </form>
    </section>
  );
};

const PublicShell: React.FC<PublicShellProps> = ({
  active,
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  heroSupplement,
  heroVariant = 'default',
  heroRight,
  children,
}) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_34%),radial-gradient(circle_at_80%_18%,rgba(56,189,248,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.10),transparent_28%),linear-gradient(180deg,#09090b_0%,#16110f_44%,#06080d_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:3.5rem_3.5rem]" />
      <div className="absolute -left-32 top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative z-10">
        <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-xl">
          <div className={`mx-auto flex ${PUBLIC_CONTENT_WIDTH_CLASS} flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8`}>
            <div className="flex items-center justify-between gap-4">
              <Link to="/" className="group">
                <p className="text-2xl font-bold tracking-tight text-white">{PRODUCT_BRAND_NAME}</p>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400 transition group-hover:text-slate-200">
                  {PRIMARY_SEO_PHRASE}
                </p>
              </Link>

              <div className="hidden items-center gap-3 md:flex">
                <nav className="flex items-center gap-2">
                  {publicNavItems.map((item) => (
                    <NavLink key={item.key} to={item.to} end={item.to === '/'} className={navLinkClassName}>
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
                <Link
                  to="/login"
                  className={
                    active === 'login'
                      ? 'inline-flex items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/12 px-5 py-3 text-sm font-semibold text-white'
                      : 'inline-flex items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/16'
                  }
                >
                  Client Login
                </Link>
              </div>
            </div>

            <nav className="flex items-center gap-2 overflow-x-auto md:hidden">
              {publicNavItems.map((item) => (
                <NavLink key={item.key} to={item.to} end={item.to === '/'} className={navLinkClassName}>
                  {item.label}
                </NavLink>
              ))}
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100"
              >
                Login
              </Link>
            </nav>
          </div>
        </header>

        <main className={`mx-auto ${PUBLIC_CONTENT_WIDTH_CLASS} px-4 py-10 sm:px-6 lg:px-8 lg:py-14`}>
          {heroVariant === 'banner' ? (
            <section className="overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.04] shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <div className="p-3 sm:p-4 lg:p-5">
                {heroRight}
              </div>

              <div className={`grid gap-0 ${heroSupplement ? 'lg:grid-cols-[0.94fr_1.06fr]' : ''} lg:items-stretch`}>
                <div className="border-t border-white/10 p-6 sm:p-8 lg:pr-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">{eyebrow}</p>
                  <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
                    {title}
                  </h1>
                  <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">{description}</p>

                  <div className="mt-7 flex flex-wrap gap-3">
                    {primaryAction ? (
                      <Link to={primaryAction.to} className={actionClassName(primaryAction.variant)}>
                        {primaryAction.label}
                      </Link>
                    ) : null}
                    {secondaryAction ? (
                      <Link to={secondaryAction.to} className={actionClassName(secondaryAction.variant || 'secondary')}>
                      {secondaryAction.label}
                    </Link>
                  ) : null}
                </div>
                </div>

                {heroSupplement ? (
                  <div className="border-t border-white/10 p-6 sm:p-8 lg:border-l lg:border-t-0">
                    {heroSupplement}
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
              <div className="h-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:p-10">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">{eyebrow}</p>
                <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
                  {title}
                </h1>
                <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">{description}</p>

                <div className="mt-7 flex flex-wrap gap-3">
                  {primaryAction ? (
                    <Link to={primaryAction.to} className={actionClassName(primaryAction.variant)}>
                      {primaryAction.label}
                    </Link>
                  ) : null}
                  {secondaryAction ? (
                    <Link to={secondaryAction.to} className={actionClassName(secondaryAction.variant || 'secondary')}>
                      {secondaryAction.label}
                    </Link>
                  ) : null}
                </div>

                {heroSupplement ? (
                  <div className="mt-8 border-t border-white/10 pt-8">
                    {heroSupplement}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">{heroRight}</div>
            </section>
          )}

          {children ? <div className="mt-10 space-y-8">{children}</div> : null}
        </main>

        <footer className="border-t border-white/10 bg-zinc-950/84">
          <div className={`mx-auto flex ${PUBLIC_CONTENT_WIDTH_CLASS} flex-col gap-4 px-4 py-6 text-sm text-slate-300 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8`}>
            <div className="space-y-1">
              <p>{PRODUCT_BRAND_NAME} helps sports complexes connect bookings, sales, memberships, staff, and finance in one system.</p>
              <p className="text-xs text-slate-400">{RIGHTS_HOLDER_ADDRESS}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">{APPLICATION_RIGHTS_NOTE}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/products" className="text-amber-200 transition hover:text-amber-100">
                Products
              </Link>
              <Link to="/user-manual" className="text-amber-200 transition hover:text-amber-100">
                User Manual
              </Link>
              <Link to="/contact" className="text-amber-200 transition hover:text-amber-100">
                Contact
              </Link>
              <Link to="/login" className="text-amber-200 transition hover:text-amber-100">
                Client Login
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

const PublicHomeProductShot: React.FC<{ productImageSrc: string }> = ({ productImageSrc }) => {
  return (
    <div className="relative overflow-hidden rounded-[1.95rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_30%),linear-gradient(180deg,rgba(24,24,27,0.82),rgba(3,7,18,0.94))] p-2">
      <img
        src={productImageSrc}
        alt={`${PRODUCT_BRAND_NAME} sports complex management platform dashboard showing bookings, memberships, operations, and reporting`}
        className="h-[340px] w-full rounded-[1.55rem] border border-white/10 object-cover object-center shadow-[0_24px_70px_rgba(2,6,23,0.34)] sm:h-[430px] lg:h-[520px]"
        loading="eager"
      />
      <div className="pointer-events-none absolute inset-[0.5rem] rounded-[1.55rem] bg-[linear-gradient(180deg,rgba(12,10,9,0.12),rgba(10,10,10,0.08)_26%,rgba(5,7,12,0.76)_100%)]" />
      <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        <div className="max-w-[36rem]">
          <div className="rounded-[1.6rem] border border-white/15 bg-zinc-950/58 px-5 py-5 shadow-[0_20px_50px_rgba(2,6,23,0.24)] backdrop-blur-md sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">Sarva Platform</p>
            <h2 className="mt-3 text-xl font-bold leading-tight text-white sm:text-2xl lg:text-[2rem]">
              One connected sports complex command center for front desk, operations, finance, and growth teams.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
              Manage facility booking, online court scheduling, event quotations, memberships, collections, staff
              activity, and reporting from one polished workspace.
            </p>
            <div className="mt-5 rounded-[1.35rem] border border-sky-400/20 bg-sky-400/10 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                Also available
              </p>
              <p className="mt-2 text-sm font-semibold text-white">Sarva Sports Event Management</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Multi-sport event publishing, registrations, payment proof review, matches, newsletters, and reports.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            'Facility booking and schedule control',
            'Memberships, CRM, and event quotations',
            'Multi-sport events, registrations, and matches',
            'Payments, reporting, and admin controls',
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/15 bg-zinc-950/48 px-4 py-3 text-sm font-semibold text-slate-100 shadow-[0_18px_40px_rgba(2,6,23,0.18)] backdrop-blur-md"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PublicHomePage: React.FC<PublicHomePageProps> = ({ productImageSrc = DEFAULT_PUBLIC_MARKETING_IMAGE }) => {
  return (
    <>
      <PublicSeo routeKey="home" imagePath={productImageSrc} />
      <PublicShell
        active="home"
        eyebrow={PRIMARY_SEO_PHRASE}
        title={
          <>
            The All-in-One{' '}
            <span className="bg-gradient-to-r from-amber-200 via-stone-100 to-sky-200 bg-clip-text text-transparent">
              {PRIMARY_SEO_PHRASE}
            </span>
          </>
        }
        description={
          <>
            {PRODUCT_BRAND_NAME} is sports facility management software for active venues that need a facility booking
            system, online court scheduling, membership management, secure payment processing, staff operations,
            reporting, and a sports event management application for multi-sport events.
          </>
        }
        primaryAction={{ label: 'Client Login', to: '/login' }}
        secondaryAction={{ label: 'Explore Products', to: '/products', variant: 'secondary' }}
        heroVariant="banner"
        heroSupplement={
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Operational highlights</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Built for the way sports venues actually run every day</h2>
            </div>
            {homeHeroDetails.map((item, index) => (
              <div key={item.title} className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-4">
                <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-sm font-bold text-amber-100">
                  {index + 1}
                </span>
                <div>
                  <p className="text-lg font-semibold text-white">{item.title}</p>
                  <p className="mt-2 max-w-2xl text-base leading-8 text-slate-300">{item.description}</p>
                </div>
                </div>
              </div>
            ))}
          </div>
        }
        heroRight={<PublicHomeProductShot productImageSrc={productImageSrc} />}
      >
        <section className="space-y-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Feature details</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Operational modules that power one connected venue workflow</h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              Each feature below supports a real business area, but the value comes from how {PRODUCT_BRAND_NAME} keeps them connected
              inside one daily operating flow.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {homeFeatures.map((feature) => (
              <article key={feature.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">{feature.title}</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Sports Event Management</p>
            <h2 className="mt-3 text-2xl font-bold text-white">
              Sarva also includes a sports event management application for multi-sport tournaments and event series.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Teams can publish events, manage registrations, collect payment proof, review participants, plan matches,
              monitor accounting, publish newsletters, and operate the event admin portal from one connected flow.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/products"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-amber-400 px-5 py-3 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-amber-300"
              >
                Explore Products
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Request Event Demo
              </Link>
            </div>
          </article>

          <div className="grid gap-4 md:grid-cols-3">
            {eventManagementCapabilities.map((item) => (
              <article key={item.title} className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
                <p className="text-lg font-semibold text-white">{item.title}</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.bullets.map((bullet) => (
                    <span
                      key={bullet}
                      className="rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-xs font-semibold text-slate-200"
                    >
                      {bullet}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Why It Works</p>
            <h2 className="mt-3 text-2xl font-bold text-white">A single workflow from enquiry to settlement</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Sports complexes often split work between booking registers, accounting sheets, and disconnected software.
              {PRODUCT_BRAND_NAME} brings those steps together so staff can work faster and management can follow the full customer and
              revenue lifecycle with less manual coordination.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Contact {PRODUCT_BRAND_NAME}
              </Link>
              <Link
                to="/user-manual"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                View User Manual
              </Link>
              <Link
                to="/about"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                About the Platform
              </Link>
              <Link
                to="/products"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                View Products
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Operating Flow</p>
            <div className="mt-4 grid gap-3">
              {workflowSteps.map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/15 text-sm font-bold text-sky-100">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-7 text-slate-200">{step}</p>
                </div>
              ))}
            </div>
          </article>
        </section>
      </PublicShell>
    </>
  );
};

export const PublicProductsPage: React.FC = () => {
  return (
    <>
      <PublicSeo routeKey="products" />
      <PublicShell
        active="products"
        eyebrow="Sarva Horizon Product Line"
        title={`Two powerful software products built for modern sports organizations.`}
        description={`Sarva Horizon brings together the Sarva Sports Complex Management Platform and Sarva Sports Event Management, giving venue teams and event organizers a cleaner path to run operations professionally.`}
        primaryAction={{ label: 'Book a Demo', to: '/contact' }}
        secondaryAction={{ label: 'Open User Manual', to: '/user-manual', variant: 'secondary' }}
        heroRight={
          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Product Line Snapshot</p>
            <div className="mt-4 grid gap-4">
              <article className="rounded-[1.7rem] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(24,24,27,0.9))] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">Product 1</p>
                <h2 className="mt-3 text-xl font-bold text-white">Sarva Sports Complex Management Platform</h2>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  ERP-style sports venue software for bookings, memberships, CRM, inventory, HR, accounting, and
                  day-end operational control.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Multi-facility venues', 'Front desk teams', 'Finance and admin control'].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-amber-50"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </article>

              <article className="rounded-[1.7rem] border border-sky-400/15 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(24,24,27,0.9))] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100">Product 2</p>
                <h2 className="mt-3 text-xl font-bold text-white">Sarva Sports Event Management</h2>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  Focused event software for tournaments, registrations, quotations, schedules, payment review, and
                  organizer workflows.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Tournament organizers', 'Schools and leagues', 'Corporate sports events'].map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-sky-50"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
              <p className="text-sm font-semibold text-white">One vision, flexible adoption</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                Choose the product that fits your scale today and expand into the broader Sarva ecosystem when your
                operations grow.
              </p>
            </div>
          </section>
        }
      >
        <section className="grid gap-4 md:grid-cols-3">
          {productLineHighlights.map((item) => (
            <article key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(24,24,27,0.94))] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Product 1</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Sarva Sports Complex Management Platform</h2>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              All-in-one business management for multi-facility sports complexes, arenas, and fitness centers. It
              connects facility operations, retail sales, inventory, memberships, HR, accounting, and customer
              relationships into one operating system.
            </p>
            <div className="mt-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">Who it is for</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sportsComplexPlatformAudience.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              {sportsComplexPlatformReasons.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm font-semibold text-slate-100">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-amber-300 hover:to-orange-400"
              >
                Book Platform Demo
              </Link>
              <Link
                to="/user-manual"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Open Platform Manual
              </Link>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-2">
            {sportsComplexPlatformCapabilities.map((item) => (
              <article key={item.area} className="rounded-[1.7rem] border border-white/10 bg-zinc-900/72 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-100">{item.area}</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200">Platform Deep Dive</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Inside the Sarva Sports Complex Management Platform</h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              These capability cards map directly to the live workflows already documented in the Sarva user manual,
              so the public product story stays aligned with the real software.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {featureShowcaseCards.map((feature) => (
              <article
                key={feature.title}
                className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/78 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.22)]"
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${feature.accent}`} />
                <div className="relative z-10">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                      {feature.keyword}
                    </span>
                    <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                      Product capability
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-bold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{feature.description}</p>
                  <div className="mt-5 grid gap-2">
                    {feature.bullets.map((bullet) => (
                      <div key={bullet} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-slate-200">
                        {bullet}
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      to={feature.manualTo}
                      className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
                    >
                      {feature.manualLabel}
                    </Link>
                    <Link
                      to="/contact"
                      className="inline-flex items-center justify-center rounded-full border border-sky-400/25 bg-sky-400/12 px-4 py-2.5 text-sm font-semibold text-sky-100 hover:bg-sky-400/18"
                    >
                      Talk to Sarva
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(24,24,27,0.94))] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Product 2</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Sarva Sports Event Management</h2>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              Dedicated, lightweight software to plan, run, and track sports events from local leagues to large
              tournaments. It is designed for organizers who need event-specific workflows without the full retail,
              HR, and complex-management stack.
            </p>
            <div className="mt-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-100">Who it is for</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sportsEventManagementAudience.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              {sportsEventManagementReasons.map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm font-semibold text-slate-100">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-amber-400 px-5 py-3 text-sm font-semibold text-white transition hover:from-sky-400 hover:to-amber-300"
              >
                Ask for Event Product Demo
              </Link>
              <Link
                to="/about"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                About Sarva
              </Link>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-2">
            {sportsEventManagementCapabilitiesDetailed.map((item) => (
              <article key={item.area} className="rounded-[1.7rem] border border-white/10 bg-zinc-900/78 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-100">{item.area}</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">How to Choose</p>
            <div className="mt-4 grid gap-3">
              {productComparisonRows.map((row) => (
                <div key={row.label} className="rounded-3xl border border-white/10 bg-slate-950/35 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">{row.label}</p>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
                      <p className="text-sm font-semibold text-white">Sports Complex Management Platform</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">{row.platform}</p>
                    </div>
                    <div className="rounded-2xl border border-sky-400/15 bg-sky-400/10 p-4">
                      <p className="text-sm font-semibold text-white">Sports Event Management</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">{row.events}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Next Step</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Sarva Horizon gives you a choice between a full operating platform and a focused event product. If you
              want the deeper screen-by-screen detail behind the sports complex platform, the public user manual is the
              best place to continue.
            </p>
            <div className="mt-5 grid gap-3">
              {[
                { label: 'Operations and facility workflows', to: '/user-manual#operations-menu' },
                { label: 'Event quotation and booking conversion', to: '/user-manual#transaction-event-quotation' },
                { label: 'Customer CRM desk', to: '/user-manual#customers' },
                { label: 'Membership setup and reports', to: '/user-manual#memberships' },
                { label: 'Accounting and settlements', to: '/user-manual#accounting' },
                { label: 'Settings, users, and controls', to: '/user-manual#settings' },
              ].map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold text-white">Need help choosing the right product?</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                We can walk through your venue workflow, event requirements, reporting needs, and rollout timeline to
                recommend the best Sarva starting point.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-amber-300 hover:to-orange-400"
              >
                Book a Demo
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                Client Login
              </Link>
            </div>
          </article>
        </section>
      </PublicShell>
    </>
  );
};

export const PublicAboutPage: React.FC = () => {
  return (
    <>
      <PublicSeo routeKey="about" />
      <PublicShell
        active="about"
        eyebrow={`About ${PRODUCT_BRAND_NAME}`}
        title={`${PRODUCT_BRAND_NAME} brings sports facility management software into one operating layer.`}
        description={`${PRODUCT_BRAND_NAME} is positioned as the product, while each customer organization operates inside its own client workspace. That keeps the public brand clear while supporting day-to-day venue operations and dedicated sports event management use cases.`}
        primaryAction={{ label: 'View Contact', to: '/contact' }}
        secondaryAction={{ label: 'Client Login', to: '/login', variant: 'secondary' }}
        heroRight={
          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Core Modules</p>
            <div className="mt-4 grid gap-3">
              {moduleHighlights.map((module) => (
                <div key={module.title} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-sm font-semibold text-white">{module.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{module.detail}</p>
                </div>
              ))}
            </div>
          </section>
        }
      >
        <section className="grid gap-4 lg:grid-cols-3">
          {aboutHighlights.map((item) => (
            <article key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Who {PRODUCT_BRAND_NAME} Supports</p>
            <div className="mt-4 grid gap-3">
              {[
                'Front desk teams handling walk-in bookings, sales, and receipts',
                'Operations teams managing courts, turfs, pools, schedules, and event coordination',
                'Sales teams preparing quotations, orders, customer follow-up, and product transactions',
                'HR and payroll teams maintaining employees, attendance, shifts, and payroll records',
                'Accounts teams responsible for settlements, payment review, and reporting',
                'Administrators managing permissions, company settings, print, mail, and overall system control',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm leading-7 text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Product Positioning</p>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              {PRODUCT_BRAND_NAME} should remain the public application identity. Client businesses such as sports centers, clubs, or
              venue operators use the product inside their own tenant workspace, but the product itself should not be
              hardcoded with a client name. This public site reflects that separation clearly.
            </p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold text-white">Professional public experience</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                The public site explains how one sports complex management platform can support bookings, memberships,
                staff operations, finance, and administration without splitting work across disconnected systems.
              </p>
            </div>
          </article>
        </section>
      </PublicShell>
    </>
  );
};

export const PublicContactPage: React.FC = () => {
  return (
    <>
      <PublicSeo routeKey="contact" />
      <PublicShell
        active="contact"
        eyebrow="Contact"
        title={`Book a demo of the ${PRODUCT_BRAND_NAME} ${PRIMARY_SEO_PHRASE}.`}
        description={`Use ${PRODUCT_BRAND_NAME} for sports complexes that need one platform across front desk, operations, memberships, inventory, people, accounts, and admin workflows.`}
        primaryAction={{ label: 'Client Login', to: '/login' }}
        secondaryAction={{ label: 'Read the Manual', to: '/user-manual', variant: 'secondary' }}
        heroRight={
          <section className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">How to Engage</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">New implementation</p>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  Discuss rollout priorities, demo requirements, and the modules your sports complex needs first.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Existing client team</p>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  Use the login route with your tenant or company identifier to enter your own workspace securely.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-sm font-semibold text-white">WhatsApp Contact</p>
                <p className="mt-2 text-sm leading-7 text-slate-200">
                  Reach {RIGHTS_HOLDER_NAME} directly on WhatsApp at {WHATSAPP_DISPLAY_PHONE} for quick product enquiries.
                </p>
                <a href={whatsappContactUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-emerald-100 hover:text-white">
                  Open WhatsApp
                </a>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold text-white">Training and documentation</p>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  The built-in user manual explains every major form, menu, and route with direct hyperlinks.
                </p>
              </div>
            </div>
          </section>
        }
      >
      <section className="grid gap-4 lg:grid-cols-3">
        {contactOptions.map((item) => (
          <article key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-lg font-semibold text-white">{item.title}</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-amber-300/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.16),rgba(16,185,129,0.10),rgba(15,23,42,0.92))] p-6 shadow-[0_24px_70px_rgba(2,6,23,0.28)]">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">One-Month Trial Offer</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Try Sarva for 30 days with guided onboarding support.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-100">
              If you want to evaluate the sports complex management platform before full rollout, ask for the
              30-day guided trial. We can help you test facility booking system workflows, online court scheduling,
              membership management, secure payment processing, and reporting with a practical demo-first setup.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={whatsappContactUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-50"
              >
                Ask for 30-Day Trial
              </a>
              <Link
                to="/products"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
              >
                View Products
              </Link>
              <Link
                to="/user-manual"
                className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Read User Manual
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            {trialOfferBenefits.map((benefit) => (
              <div key={benefit} className="rounded-2xl border border-white/15 bg-slate-950/35 px-4 py-4 text-sm font-semibold leading-6 text-white">
                {benefit}
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicContactForm />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Address</p>
          <h2 className="mt-3 text-2xl font-bold text-white">{RIGHTS_HOLDER_NAME}</h2>
          <p className="mt-4 text-base leading-8 text-slate-100">{RIGHTS_HOLDER_ADDRESS}</p>
          <p className="mt-4 text-base font-semibold text-white">Phone / WhatsApp: {WHATSAPP_DISPLAY_PHONE}</p>
          <p className="mt-5 text-sm leading-7 text-slate-200">{APPLICATION_RIGHTS_NOTE}</p>
        </article>

        <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Contact Note</p>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Use this public page when sharing the product with new prospects, venue operators, or implementation teams.
            Existing client organizations can continue through the Login route, while {RIGHTS_HOLDER_NAME} remains the
            published address and rights holder shown on the public-facing site.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={whatsappContactUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/12 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20"
            >
              WhatsApp {WHATSAPP_DISPLAY_PHONE}
            </a>
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Client Login
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              About {PRODUCT_BRAND_NAME}
            </Link>
            <Link
              to="/products"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Product Line
            </Link>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Need the product overview?</p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="max-w-3xl text-sm leading-7 text-slate-300">
            The Home and About pages explain what {PRODUCT_BRAND_NAME} does, while the User Manual goes deeper into each form, page,
            and module. Existing clients can go straight to Login, and new prospects can start from Contact or About.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Public Home
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              About {PRODUCT_BRAND_NAME}
            </Link>
            <Link
              to="/products"
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              Explore Products
            </Link>
          </div>
        </div>
      </section>
      </PublicShell>
    </>
  );
};

export const PublicLoginPage: React.FC<PublicLoginPageProps> = ({ children }) => {
  return (
    <>
      <PublicSeo routeKey="login" />
      <PublicShell
        active="login"
        eyebrow="Client Access"
        title={`Secure login for ${PRODUCT_BRAND_NAME} client workspaces.`}
        description={`Client organizations sign in with their user credentials and tenant or company identifier to access their own ${PRIMARY_SEO_PHRASE.toLowerCase()} workspace.`}
        primaryAction={{ label: 'Back to Home', to: '/', variant: 'secondary' }}
        secondaryAction={{ label: 'Explore Products', to: '/products', variant: 'secondary' }}
        heroRight={children}
      >
      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: 'Tenant-based access',
            description:
              'Use the company or tenant field to reach the correct client workspace without mixing one client account with another.',
          },
          {
            title: 'Built-in documentation',
            description:
              'Open the User Manual any time to understand the forms, modules, and workflows available after login.',
          },
          {
            title: 'Ready for operations',
            description:
              'After login, teams can move into bookings, sales, memberships, accounting, reporting, and admin controls.',
          },
        ].map((item) => (
          <article key={item.title} className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <p className="text-lg font-semibold text-white">{item.title}</p>
            <p className="mt-3 text-sm leading-7 text-slate-300">{item.description}</p>
          </article>
        ))}
      </section>
      </PublicShell>
    </>
  );
};
