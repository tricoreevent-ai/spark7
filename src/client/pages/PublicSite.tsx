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

type PublicPageKey = 'home' | 'about' | 'contact' | 'login';

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
  { key: 'about', label: 'About', to: '/about' },
  { key: 'contact', label: 'Contact', to: '/contact' },
];

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
      ? 'border-cyan-400/40 bg-cyan-400/15 text-white shadow-[0_0_24px_rgba(34,211,238,0.18)]'
      : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10 hover:text-white',
  ].join(' ');

const actionClassName = (variant: ActionLink['variant']) =>
  variant === 'secondary'
    ? 'inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10'
    : 'inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-cyan-400 hover:to-emerald-400';

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
    <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Contact Form</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Send an enquiry to {RIGHTS_HOLDER_NAME}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Share your email, optionally add a mobile number, and tell us what you need. We will use your details to
            follow up on rollout, onboarding, or product questions.
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
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
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
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-100">Mobile Number</label>
          <input
            type="tel"
            value={form.mobile}
            onChange={updateField('mobile')}
            placeholder="Optional"
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
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
            placeholder="Tell us about your sports complex, rollout plan, or the modules you want to use."
            required
            rows={5}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
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
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:from-cyan-400 hover:to-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.16),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.14),transparent_30%),linear-gradient(180deg,#020617_0%,#0f172a_46%,#020617_100%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:3.5rem_3.5rem]" />
      <div className="absolute -left-32 top-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative z-10">
        <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
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
                      ? 'inline-flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/15 px-5 py-3 text-sm font-semibold text-white'
                      : 'inline-flex items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-400/12 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20'
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
                className="inline-flex items-center justify-center rounded-full border border-emerald-400/35 bg-emerald-400/12 px-4 py-2 text-sm font-semibold text-emerald-100"
              >
                Login
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          {heroVariant === 'banner' ? (
            <section className="overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.04] shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <div className="grid gap-0 lg:grid-cols-[0.88fr_1.12fr] lg:items-stretch">
                <div className="p-7 sm:p-10 lg:pr-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">{eyebrow}</p>
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

                <div className="border-t border-white/10 p-4 lg:border-l lg:border-t-0 lg:p-5">
                  {heroRight}
                </div>
              </div>
            </section>
          ) : (
            <section className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
              <div className="h-full rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 shadow-[0_30px_90px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:p-10">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">{eyebrow}</p>
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

        <footer className="border-t border-white/10 bg-slate-950/80">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-slate-300 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="space-y-1">
              <p>{PRODUCT_BRAND_NAME} helps sports complexes connect bookings, sales, memberships, staff, and finance in one system.</p>
              <p className="text-xs text-slate-400">{RIGHTS_HOLDER_ADDRESS}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">{APPLICATION_RIGHTS_NOTE}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/user-manual" className="text-cyan-200 transition hover:text-cyan-100">
                User Manual
              </Link>
              <Link to="/contact" className="text-cyan-200 transition hover:text-cyan-100">
                Contact
              </Link>
              <Link to="/login" className="text-cyan-200 transition hover:text-cyan-100">
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
    <div className="relative h-full overflow-hidden rounded-[1.85rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.10),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.78),rgba(2,6,23,0.9))] p-3">
      <div className="mb-3 flex items-center justify-between gap-3 px-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Live product image</p>
        <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-semibold text-slate-200">
          {PRODUCT_BRAND_NAME} Dashboard
        </span>
      </div>
      <img
        src={productImageSrc}
        alt={`${PRODUCT_BRAND_NAME} sports complex management platform dashboard showing bookings, memberships, operations, and reporting`}
        className="h-full w-full rounded-[1.45rem] border border-white/10 object-cover shadow-[0_24px_70px_rgba(2,6,23,0.34)]"
        loading="eager"
      />
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
            <span className="bg-gradient-to-r from-cyan-200 via-white to-emerald-200 bg-clip-text text-transparent">
              {PRIMARY_SEO_PHRASE}
            </span>
          </>
        }
        description={
          <>
            {PRODUCT_BRAND_NAME} is sports facility management software for active venues that need a facility booking
            system, online court scheduling, membership management, secure payment processing, staff operations, and
            reporting in one place.
          </>
        }
        primaryAction={{ label: 'Client Login', to: '/login' }}
        secondaryAction={{ label: 'Explore About', to: '/about', variant: 'secondary' }}
        heroVariant="banner"
        heroSupplement={
          <div className="space-y-5">
            {homeHeroDetails.map((item, index) => (
              <div key={item.title} className="flex items-start gap-4">
                <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-sm font-bold text-cyan-100">
                  {index + 1}
                </span>
                <div>
                  <p className="text-lg font-semibold text-white">{item.title}</p>
                  <p className="mt-2 max-w-2xl text-base leading-8 text-slate-300">{item.description}</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Feature details</p>
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
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Operating Flow</p>
            <div className="mt-4 grid gap-3">
              {workflowSteps.map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-100">
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

export const PublicAboutPage: React.FC = () => {
  return (
    <>
      <PublicSeo routeKey="about" />
      <PublicShell
        active="about"
        eyebrow={`About ${PRODUCT_BRAND_NAME}`}
        title={`${PRODUCT_BRAND_NAME} brings sports facility management software into one operating layer.`}
        description={`${PRODUCT_BRAND_NAME} is positioned as the product, while each customer organization operates inside its own client workspace. That keeps the public brand clear while supporting day-to-day venue operations.`}
        primaryAction={{ label: 'View Contact', to: '/contact' }}
        secondaryAction={{ label: 'Client Login', to: '/login', variant: 'secondary' }}
        heroRight={
          <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Core Modules</p>
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

          <article className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
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
          <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.32)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">How to Engage</p>
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

      <PublicContactForm />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[2rem] border border-emerald-400/20 bg-emerald-400/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Address</p>
          <h2 className="mt-3 text-2xl font-bold text-white">{RIGHTS_HOLDER_NAME}</h2>
          <p className="mt-4 text-base leading-8 text-slate-100">{RIGHTS_HOLDER_ADDRESS}</p>
          <p className="mt-4 text-base font-semibold text-white">Phone / WhatsApp: {WHATSAPP_DISPLAY_PHONE}</p>
          <p className="mt-5 text-sm leading-7 text-slate-200">{APPLICATION_RIGHTS_NOTE}</p>
        </article>

        <article className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Contact Note</p>
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
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-6">
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
        secondaryAction={{ label: 'Need Product Details?', to: '/about', variant: 'secondary' }}
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
