import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PublicSeo } from '../public/PublicSeo';
import {
  APPLICATION_RIGHTS_NOTE,
  PUBLIC_BRAND_NAME,
  PUBLIC_BRAND_TAGLINE,
  PRIMARY_SEO_PHRASE,
  PRODUCT_BRAND_NAME,
  RIGHTS_HOLDER_ADDRESS,
  RIGHTS_HOLDER_NAME,
  buildWhatsappContactUrl,
  WHATSAPP_DISPLAY_PHONE,
} from '../public/publicBrand';
import { apiUrl, fetchApiJson } from '../utils/api';
import { DEFAULT_BRAND_LOGO_PATH } from '../utils/brandAssets';

const DEFAULT_PUBLIC_MARKETING_IMAGE = new URL('../assets/marketing/spark-dashboard-macbook.png', import.meta.url).href;
const APP_DEVELOPMENT_IMAGE = new URL('../assets/marketing/service-app-development.svg', import.meta.url).href;
const MARKETING_EXECUTION_IMAGE = new URL('../assets/marketing/service-marketing-execution.svg', import.meta.url).href;
const EVENT_DELIVERY_IMAGE = new URL('../assets/marketing/service-event-delivery.svg', import.meta.url).href;
const PRODUCT_LINE_VECTOR_IMAGE = new URL('../assets/marketing/public-product-line-snapshot.svg', import.meta.url).href;
const ABOUT_ECOSYSTEM_VECTOR_IMAGE = new URL('../assets/marketing/public-about-ecosystem.svg', import.meta.url).href;
const CONTACT_CONNECT_VECTOR_IMAGE = new URL('../assets/marketing/public-contact-connect.svg', import.meta.url).href;
const FACILITY_BOOKING_CAPABILITY_IMAGE = new URL('../assets/marketing/product-facility-booking.svg', import.meta.url).href;
const MEMBERSHIPS_CAPABILITY_IMAGE = new URL('../assets/marketing/product-memberships.svg', import.meta.url).href;
const RETAIL_INVENTORY_CAPABILITY_IMAGE = new URL('../assets/marketing/product-retail-inventory.svg', import.meta.url).href;
const SALES_CRM_CAPABILITY_IMAGE = new URL('../assets/marketing/product-sales-crm.svg', import.meta.url).href;
const EMPLOYEE_MANAGEMENT_CAPABILITY_IMAGE = new URL('../assets/marketing/product-employee-management.svg', import.meta.url).href;
const ACCOUNTING_CAPABILITY_IMAGE = new URL('../assets/marketing/product-accounting.svg', import.meta.url).href;
const SETTLEMENTS_CAPABILITY_IMAGE = new URL('../assets/marketing/product-settlements-closing.svg', import.meta.url).href;
const ADMIN_CONFIGURATION_CAPABILITY_IMAGE = new URL('../assets/marketing/product-admin-configuration.svg', import.meta.url).href;
const DECORATIVE_BLOB_AMBER_SKY = new URL('../assets/marketing/decorative-blob-amber-sky.svg', import.meta.url).href;
const DECORATIVE_BLOB_EMERALD_ROSE = new URL('../assets/marketing/decorative-blob-emerald-rose.svg', import.meta.url).href;
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
  heroCompact?: boolean;
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
  imageSrc: string;
  imageAlt: string;
};

type ProductCapabilityRow = {
  area: string;
  detail: string;
  imageSrc?: string;
  imageAlt?: string;
};

const homeFeatures = [
  {
    title: 'Custom Application Development',
    description:
      'Build tailored web applications, admin dashboards, booking flows, and internal tools that fit the way your team actually works.',
  },
  {
    title: 'Software Products',
    description:
      'Launch ready-made software products like the Sarva sports operations platform while keeping room for custom add-ons and future scale.',
  },
  {
    title: 'Website and Landing Page Delivery',
    description:
      'Create branded websites, service pages, campaign landing pages, and digital experiences that support lead generation and conversion.',
  },
  {
    title: 'Marketing and Digital Marketing',
    description:
      'Support campaign planning, digital promotion, audience reach, content coordination, and growth-focused execution across channels.',
  },
  {
    title: 'Brand and Creative Support',
    description:
      'Shape messaging, campaign creatives, presentation assets, and visual communication that keep your brand sharper and more consistent.',
  },
  {
    title: 'Event Management',
    description:
      'Plan and manage sports events, branded activations, launches, registrations, schedules, communication, and delivery support.',
  },
  {
    title: 'Operations and Reporting Systems',
    description:
      'Connect processes, dashboards, approvals, reporting views, and operational visibility so delivery stays easier to track and improve.',
  },
  {
    title: 'Ongoing Growth Support',
    description:
      'Keep improving products, campaigns, and event outcomes with iterative refinement, reporting reviews, and next-phase planning.',
  },
];

const workflowSteps = [
  'Understand the brief, audience, process gaps, and growth goals.',
  'Design the right mix of product build, campaign execution, and event support.',
  'Launch, manage, and coordinate delivery across software, marketing, and on-ground activity.',
  'Review results, improve performance, and scale the next phase with better clarity.',
];

const homeHeroDetails = [
  {
    title: 'Build custom applications and digital products around real business workflows.',
    description:
      'From operational platforms to admin dashboards and client-facing experiences, Sarva Horizon turns ideas into practical systems.',
  },
  {
    title: 'Plan marketing and digital marketing that connects visibility with growth.',
    description:
      'We support messaging, campaign direction, digital promotion, and branded communication that helps teams move with more focus.',
  },
  {
    title: 'Execute events, activations, and software rollouts with stronger coordination.',
    description:
      'Products, campaigns, and events all need delivery discipline. We help clients launch with clearer planning and follow-through.',
  },
];

const aboutHighlights = [
  {
    title: 'Application development with delivery focus',
    description:
      'Sarva Horizon designs and builds practical applications, dashboards, workflow tools, and digital products for organizations that need more than generic templates.',
  },
  {
    title: 'Marketing and digital growth support',
    description:
      'The team also works across marketing, digital marketing, campaign communication, and branded visibility so growth is supported beyond the software layer.',
  },
  {
    title: 'Event management and activation',
    description:
      'Sarva Horizon handles event planning, organizer coordination, registration workflows, branded activations, and managed execution for real-world programmes.',
  },
  {
    title: 'Sarva product line',
    description:
      'Sarva remains the software product line inside the wider Sarva Horizon brand, with dedicated solutions for sports complex operations and sports event management.',
  },
];

const moduleHighlights = [
  { title: 'Application Development', detail: 'Custom web apps, operational dashboards, portals, and workflow tools.' },
  { title: 'Software Products', detail: 'Sarva product experiences for sports operations and event management.' },
  { title: 'Web and Landing Pages', detail: 'Public websites, structured service pages, and conversion-focused launch assets.' },
  { title: 'Marketing', detail: 'Campaign planning, communication strategy, creative direction, and brand support.' },
  { title: 'Digital Marketing', detail: 'Digital reach, lead generation support, campaign execution, and optimisation review.' },
  { title: 'Event Management', detail: 'Sports events, branded activations, coordination, and delivery workflows.' },
  { title: 'Ongoing Support', detail: 'Iteration, reporting, rollout support, and next-stage execution planning.' },
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
    title: 'Application development and digital systems',
    description:
      'Build portals, internal systems, client dashboards, booking flows, and custom digital products that solve day-to-day operational needs.',
    bullets: ['Custom web applications and portals', 'Dashboards, admin tools, and business workflows', 'Product enhancement and rollout support'],
    imageSrc: APP_DEVELOPMENT_IMAGE,
    imageAlt: 'Interface illustration representing application development and digital systems',
  },
  {
    title: 'Marketing and digital marketing execution',
    description:
      'Support campaigns, digital visibility, content coordination, and growth-oriented communication with a more structured execution rhythm.',
    bullets: ['Campaign planning and creative alignment', 'Digital promotion and lead generation support', 'Performance review and improvement loops'],
    imageSrc: MARKETING_EXECUTION_IMAGE,
    imageAlt: 'Analytics and campaign illustration representing marketing and digital marketing execution',
  },
  {
    title: 'Event management and activation delivery',
    description:
      'Coordinate tournaments, launches, branded activations, registrations, communication, and on-ground execution with better operational follow-through.',
    bullets: ['Event planning, scheduling, and coordination', 'Registration, communication, and logistics support', 'Post-event reporting, media, and follow-up'],
    imageSrc: EVENT_DELIVERY_IMAGE,
    imageAlt: 'Calendar and logistics illustration representing event management and activation delivery',
  },
];

const trialOfferBenefits = [
  'Discovery call for products, application builds, marketing support, or events',
  'Scope discussion with the right mix of software, campaign, and delivery services',
  'WhatsApp and email follow-up for planning, proposals, and next steps',
  'Optional walkthrough of the Sarva software product line where relevant',
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
    imageSrc: FACILITY_BOOKING_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of sports court booking, scheduling, and event quotation workflow',
  },
  {
    area: 'Memberships',
    detail: 'Plan creation, subscriptions, renewals, expiry alerts, member benefits, and membership reporting.',
    imageSrc: MEMBERSHIPS_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of membership cards, renewal flow, and member benefits',
  },
  {
    area: 'Retail and inventory',
    detail: 'Product catalog, stock alerts, procurement, purchase orders, stock receipts, and returns.',
    imageSrc: RETAIL_INVENTORY_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of inventory boxes, barcode tracking, and stock movement',
  },
  {
    area: 'Sales and CRM',
    detail: 'Customer profiles, enquiries, campaigns, quotations, invoices, credit notes, and collection follow-up.',
    imageSrc: SALES_CRM_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of customer CRM, sales pipeline, and quotation follow-up',
  },
  {
    area: 'Employee management',
    detail: 'GPS-ready self check-in, attendance register, shifts, and payroll support.',
    imageSrc: EMPLOYEE_MANAGEMENT_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of attendance, GPS check-in, and workforce scheduling',
  },
  {
    area: 'Accounting',
    detail:
      'Invoicing, vendor bills, vouchers, cash and bank books, CSV bank reconciliation, and financial statements.',
    imageSrc: ACCOUNTING_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of accounting ledgers, vouchers, and financial reporting',
  },
  {
    area: 'Settlements and closing',
    detail: 'Receipt allocation, day-end cash review, and variance reporting.',
    imageSrc: SETTLEMENTS_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of settlement receipts, closing review, and balance checks',
  },
  {
    area: 'Admin and configuration',
    detail: 'User roles, company setup, SMTP and printing preferences, and backup controls.',
    imageSrc: ADMIN_CONFIGURATION_CAPABILITY_IMAGE,
    imageAlt: 'Vector illustration of admin settings, user roles, and system configuration',
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
    title: 'Book a consultation',
    description:
      'Use the Contact page to discuss software products, custom application development, marketing requirements, or event execution support.',
  },
  {
    title: 'Explore the product line',
    description:
      'Sarva software products remain available for sports complex operations and sports event management when your requirement is product-led.',
  },
  {
    title: 'Work with one coordinated team',
    description:
      `${PUBLIC_BRAND_NAME} brings together application development, digital marketing, event management, and service delivery under one brand.`,
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
            Ask for a discovery call, proposal discussion, or product walkthrough to find the right starting point.
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
            placeholder="Tell us about your application requirement, software interest, marketing goal, digital campaign, or event management need."
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
  heroCompact = false,
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
              <Link to="/" className="group flex items-center gap-3">
                <img
                  src={DEFAULT_BRAND_LOGO_PATH}
                  alt={`${PUBLIC_BRAND_NAME} logo`}
                  className="h-12 w-12 shrink-0 object-contain drop-shadow-[0_10px_26px_rgba(2,6,23,0.35)] transition group-hover:scale-[1.02]"
                />
                <div className="min-w-0">
                  <p className="text-2xl font-bold tracking-tight text-white">{PUBLIC_BRAND_NAME}</p>
                </div>
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
            <section className={`grid gap-8 ${heroCompact ? 'lg:grid-cols-[0.76fr_1.24fr] lg:gap-6' : 'lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch'}`}>
              <div
                className={`h-full rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-xl ${
                  heroCompact ? 'p-6 sm:p-7 lg:p-8' : 'p-7 sm:p-10'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">{eyebrow}</p>
                <h1
                  className={`max-w-3xl font-bold leading-tight text-white ${
                    heroCompact ? 'mt-4 text-3xl sm:text-4xl' : 'mt-5 text-4xl sm:text-5xl'
                  }`}
                >
                  {title}
                </h1>
                <p
                  className={`max-w-3xl text-slate-300 ${
                    heroCompact ? 'mt-4 text-sm leading-7 sm:text-base' : 'mt-5 text-base leading-8 sm:text-lg'
                  }`}
                >
                  {description}
                </p>

                <div className={`${heroCompact ? 'mt-6' : 'mt-7'} flex flex-wrap gap-3`}>
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
                  <div className={`${heroCompact ? 'mt-6 pt-6' : 'mt-8 pt-8'} border-t border-white/10`}>
                    {heroSupplement}
                  </div>
                ) : null}
              </div>

              <div className={`${heroCompact ? 'space-y-3 lg:pl-1' : 'space-y-4'}`}>{heroRight}</div>
            </section>
          )}

          {children ? <div className="mt-10 space-y-8">{children}</div> : null}
        </main>

        <footer className="border-t border-white/10 bg-zinc-950/84">
          <div className={`mx-auto flex ${PUBLIC_CONTENT_WIDTH_CLASS} flex-col gap-4 px-4 py-6 text-sm text-slate-300 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8`}>
            <div className="flex items-start gap-3">
              <img
                src={DEFAULT_BRAND_LOGO_PATH}
                alt={`${PUBLIC_BRAND_NAME} logo`}
                className="h-12 w-12 shrink-0 object-contain drop-shadow-[0_10px_26px_rgba(2,6,23,0.35)]"
              />
              <div className="space-y-1">
                <p>{PUBLIC_BRAND_NAME} brings together software products, custom application development, digital marketing, and event services under one brand.</p>
                <p className="text-xs text-slate-400">{RIGHTS_HOLDER_ADDRESS}</p>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">{APPLICATION_RIGHTS_NOTE}</p>
              </div>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">{PUBLIC_BRAND_NAME}</p>
            <h2 className="mt-3 text-xl font-bold leading-tight text-white sm:text-2xl lg:text-[2rem]">
              Products, campaigns, and event execution delivered through one sharper service brand.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
              Sarva Horizon covers custom applications, the Sarva software line, marketing support, digital marketing,
              creative delivery, and event management for clients that want one coordinated team.
            </p>
            <div className="mt-5 rounded-[1.35rem] border border-sky-400/20 bg-sky-400/10 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                Software products
              </p>
              <p className="mt-2 text-sm font-semibold text-white">Sarva Sports Platform and Event Products</p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                The Sarva product line remains part of the portfolio for sports complex operations, event workflows,
                registrations, quotations, and reporting.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            'Custom application development',
            'Software products and digital tools',
            'Digital marketing and brand growth',
            'Event management and activations',
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
        eyebrow={PUBLIC_BRAND_TAGLINE}
        title={
          <>
            Build, market, and launch with{' '}
            <span className="bg-gradient-to-r from-amber-200 via-stone-100 to-sky-200 bg-clip-text text-transparent">
              {PUBLIC_BRAND_NAME}
            </span>
          </>
        }
        description={
          <>
            {PUBLIC_BRAND_NAME} combines custom application development, the Sarva software products, marketing,
            digital marketing, creative support, and event management for teams that want stronger execution from one
            connected brand.
          </>
        }
        primaryAction={{ label: `Talk to ${PUBLIC_BRAND_NAME}`, to: '/contact' }}
        secondaryAction={{ label: 'Explore Products', to: '/products', variant: 'secondary' }}
        heroVariant="banner"
        heroSupplement={
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Service highlights</p>
              <h2 className="mt-2 text-2xl font-bold text-white">A broader delivery model across products, growth, and events</h2>
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Service areas</p>
              <h2 className="mt-2 text-2xl font-bold text-white">What Sarva Horizon handles beyond a single software story</h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-300">
              Sarva is still the software product line, but the wider Sarva Horizon brand also supports application
              development, marketing, digital growth, creative execution, and event delivery.
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Integrated delivery</p>
            <h2 className="mt-3 text-2xl font-bold text-white">
              {PUBLIC_BRAND_NAME} works across application development, marketing, digital campaigns, and event management.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Some clients come for the Sarva software products. Others need a broader partner across custom digital
              builds, campaign support, branded execution, and managed events. This public site now reflects that
              wider service reality.
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
                Start a Conversation
              </Link>
            </div>
          </article>

          <div className="grid gap-4 md:grid-cols-3">
            {eventManagementCapabilities.map((item) => (
              <article key={item.title} className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5">
                <div className="overflow-hidden rounded-[1.45rem] border border-white/10 bg-black/20">
                  <img
                    src={item.imageSrc}
                    alt={item.imageAlt}
                    className="h-40 w-full object-cover object-center"
                    loading="lazy"
                  />
                </div>
                <p className="mt-4 text-lg font-semibold text-white">{item.title}</p>
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
            <h2 className="mt-3 text-2xl font-bold text-white">One coordinated partner for build, launch, and growth</h2>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Many teams split app development, marketing execution, creative work, and event operations across too
              many vendors. {PUBLIC_BRAND_NAME} brings those delivery layers closer together so strategy and execution stay
              more aligned.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Contact {PUBLIC_BRAND_NAME}
              </Link>
              <Link
                to="/about"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                About {PUBLIC_BRAND_NAME}
              </Link>
              <Link
                to="/products"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Explore Products
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                Client Login
              </Link>
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">How We Work</p>
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
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <img
              src={DECORATIVE_BLOB_AMBER_SKY}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 hidden h-40 w-40 opacity-70 md:block"
            />
            <img
              src={DECORATIVE_BLOB_EMERALD_ROSE}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-14 -left-14 hidden h-36 w-36 opacity-60 md:block"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Product Line Snapshot</p>
            <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-white/10 bg-slate-950/45">
              <img
                src={PRODUCT_LINE_VECTOR_IMAGE}
                alt="Sales dashboard snapshot showing summary cards, a seven-day sales graph, and stock alerts"
                className="h-[250px] w-full bg-[#0b1120] object-contain object-center"
                loading="lazy"
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <article className="rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(245,158,11,0.14),rgba(24,24,27,0.9))] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">Platform product</p>
                <p className="mt-2 text-base font-semibold text-white">Venue-wide operating system</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Bookings, memberships, CRM, inventory, people, and finance in one connected workspace.</p>
              </article>
              <article className="rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(24,24,27,0.9))] p-4 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100">Event product</p>
                <p className="mt-2 text-base font-semibold text-white">Focused event control</p>
                <p className="mt-2 text-sm leading-6 text-slate-200">Registrations, quotations, schedules, payments, and organizer workflows without the full ERP stack.</p>
              </article>
            </div>
            <div className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-4">
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
            <article key={item.title} className="rounded-[1.8rem] bg-[linear-gradient(180deg,rgba(39,39,42,0.9),rgba(24,24,27,0.75))] p-6 shadow-[0_16px_36px_rgba(2,6,23,0.16)]">
              <div className="h-1.5 w-12 rounded-full bg-gradient-to-r from-amber-300 to-sky-300" />
              <p className="mt-4 text-lg font-semibold text-white">{item.title}</p>
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
            <div className="mt-5 rounded-[1.5rem] bg-black/20 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">Who it is for</p>
              <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {sportsComplexPlatformAudience.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-100">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-slate-950/30 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">Why teams choose it</p>
              <ul className="mt-4 space-y-3">
              {sportsComplexPlatformReasons.map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-100">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-300" />
                  <span>{item}</span>
                </li>
              ))}
              </ul>
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
              <article key={item.area} className="rounded-[1.7rem] bg-zinc-900/72 p-5 shadow-[0_16px_34px_rgba(2,6,23,0.18)]">
                {item.imageSrc ? (
                  <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/45 shadow-[0_14px_34px_rgba(2,6,23,0.22)]">
                    <img
                      src={item.imageSrc}
                      alt={item.imageAlt || item.area}
                      className="h-36 w-full object-cover object-center"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                <div className="mt-4 h-1.5 w-10 rounded-full bg-amber-300/80" />
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-amber-100">{item.area}</p>
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
                className="relative overflow-hidden rounded-[2rem] bg-zinc-900/78 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.22)]"
              >
                <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${feature.accent}`} />
                <div className="relative z-10">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">{feature.keyword}</p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-100/90">Product capability</p>
                  <h3 className="mt-4 text-2xl font-bold text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{feature.description}</p>
                  <ul className="mt-5 space-y-3">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 rounded-xl bg-white/[0.05] px-4 py-3 text-sm leading-6 text-slate-200">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-white/80" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
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
                      Talk to {PUBLIC_BRAND_NAME}
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
            <div className="mt-5 rounded-[1.5rem] bg-black/20 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-100">Who it is for</p>
              <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {sportsEventManagementAudience.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-100">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 rounded-[1.5rem] bg-slate-950/30 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-100">Why teams choose it</p>
              <ul className="mt-4 space-y-3">
              {sportsEventManagementReasons.map((item) => (
                <li key={item} className="flex items-start gap-3 rounded-xl bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-100">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sky-300" />
                  <span>{item}</span>
                </li>
              ))}
              </ul>
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
                About {PUBLIC_BRAND_NAME}
              </Link>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-2">
            {sportsEventManagementCapabilitiesDetailed.map((item) => (
              <article key={item.area} className="rounded-[1.7rem] bg-zinc-900/78 p-5 shadow-[0_16px_34px_rgba(2,6,23,0.18)]">
                <div className="h-1.5 w-10 rounded-full bg-sky-300/80" />
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.16em] text-sky-100">{item.area}</p>
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
                <div key={row.label} className="rounded-3xl bg-slate-950/35 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-100">{row.label}</p>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-2xl bg-amber-300/10 p-4">
                      <p className="text-sm font-semibold text-white">Sports Complex Management Platform</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">{row.platform}</p>
                    </div>
                    <div className="rounded-2xl bg-sky-400/10 p-4">
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
            <ul className="mt-5 space-y-3">
              {[
                { label: 'Operations and facility workflows', to: '/user-manual#operations-menu' },
                { label: 'Event quotation and booking conversion', to: '/user-manual#transaction-event-quotation' },
                { label: 'Customer CRM desk', to: '/user-manual#customers' },
                { label: 'Membership setup and reports', to: '/user-manual#memberships' },
                { label: 'Accounting and settlements', to: '/user-manual#accounting' },
                { label: 'Settings, users, and controls', to: '/user-manual#settings' },
              ].map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="group flex items-start gap-3 rounded-xl bg-white/[0.05] px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08]"
                  >
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-300 transition group-hover:bg-sky-300" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-3xl bg-white/[0.06] p-5">
              <p className="text-sm font-semibold text-white">Need help choosing the right product?</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                We can walk through your venue workflow, event requirements, reporting needs, and rollout timeline to
                recommend the best Sarva Horizon starting point.
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
        eyebrow={`About ${PUBLIC_BRAND_NAME}`}
        title={`${PUBLIC_BRAND_NAME} brings products, campaigns, and event execution into one brand.`}
        description={`${PUBLIC_BRAND_NAME} is the wider company identity across application development, digital marketing, event delivery, and service execution. Sarva remains the software product line inside that portfolio.`}
        primaryAction={{ label: 'View Contact', to: '/contact' }}
        secondaryAction={{ label: 'Client Login', to: '/login', variant: 'secondary' }}
        heroRight={
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <img
              src={DECORATIVE_BLOB_AMBER_SKY}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-14 hidden h-40 w-40 opacity-70 md:block"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Brand Ecosystem</p>
            <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-white/10 bg-slate-950/45">
              <img
                src={ABOUT_ECOSYSTEM_VECTOR_IMAGE}
                alt="Vector illustration showing Sarva Horizon connecting software products, application builds, marketing growth, and event delivery"
                className="h-[255px] w-full object-cover object-center"
                loading="lazy"
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { title: 'Software products', detail: 'Sarva product line for sports platform and event operations.' },
                { title: 'Application builds', detail: 'Custom portals, dashboards, workflow tools, and websites.' },
                { title: 'Marketing growth', detail: 'Campaign direction, digital visibility, and communication support.' },
                { title: 'Event delivery', detail: 'Planning, logistics, activations, and managed execution.' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl bg-white/[0.05] px-4 py-3">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">{item.detail}</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Who {PUBLIC_BRAND_NAME} Supports</p>
            <div className="mt-4 grid gap-3">
              {[
                'Sports venues, academies, and clubs needing operational software or digital execution',
                'Startups and businesses looking for custom applications, websites, and internal workflow tools',
                'Brands that need marketing, digital marketing, creative coordination, and launch support',
                'Event organizers, associations, and schools managing programmes, tournaments, and activations',
                'Teams that prefer one partner across build, launch, communication, and delivery follow-through',
                'Organizations that want the Sarva software line as part of a wider service relationship',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm leading-7 text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">Brand Structure</p>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Sarva Horizon is the public-facing company brand. Sarva remains the software product identity used for
              the sports complex and sports event management applications. That keeps the company story broader while
              letting the product line stay focused.
            </p>
            <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold text-white">Why that matters</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">
                The public site can now represent Sarva Horizon as a wider services brand, while the Products and User
                Manual pages still give clear visibility into the Sarva software experience.
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
        title={`Talk to ${PUBLIC_BRAND_NAME} about products, applications, marketing, or event execution.`}
        description={`${PUBLIC_BRAND_NAME} can support custom application development, the Sarva software line, digital marketing, creative delivery, and event management depending on what your team needs next.`}
        primaryAction={{ label: 'Explore Products', to: '/products' }}
        secondaryAction={{ label: 'Client Login', to: '/login', variant: 'secondary' }}
        heroRight={
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-900/72 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <img
              src={DECORATIVE_BLOB_EMERALD_ROSE}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-16 hidden h-40 w-40 opacity-70 md:block"
            />
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">How to Engage</p>
            <div className="mt-4 overflow-hidden rounded-[1.7rem] border border-white/10 bg-slate-950/45">
              <img
                src={CONTACT_CONNECT_VECTOR_IMAGE}
                alt="Vector illustration showing Sarva Horizon contact paths for products, applications, marketing, and events"
                className="h-[255px] w-full object-cover object-center"
                loading="lazy"
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                'New project enquiry',
                'Marketing and digital support',
                'Events and activations',
                'Existing client team',
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white">
                  {item}
                </div>
              ))}
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
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">How We Can Start</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Start with the service mix that fits your next move.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-100">
              Some teams need a product demo. Others need a custom application plan, digital marketing support, or
              event execution help. We can start with the right scope instead of forcing every conversation into one
              narrow path.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href={whatsappContactUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-50"
              >
                Start on WhatsApp
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
            Use this public page when you want to talk about Sarva Horizon more broadly, whether the need is a
            software product, an application build, digital marketing support, or event delivery. Existing product
            clients can continue through the Login route when they need direct workspace access.
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
              About {PUBLIC_BRAND_NAME}
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
            The Home and About pages explain what {PUBLIC_BRAND_NAME} does as a broader services brand, while the User
            Manual goes deeper into the Sarva software workflows, forms, and modules. Existing clients can go straight
            to Login, and new prospects can start from Contact or About.
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
              About {PUBLIC_BRAND_NAME}
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
        description={`Client organizations sign in with their user credentials and tenant or company identifier to access their Sarva software workspace securely.`}
        primaryAction={{ label: 'Back to Home', to: '/', variant: 'secondary' }}
        secondaryAction={{ label: 'Explore Products', to: '/products', variant: 'secondary' }}
        heroCompact
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
