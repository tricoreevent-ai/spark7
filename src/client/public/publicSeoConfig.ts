import {
  APPLICATION_RIGHTS_NOTE,
  DEFAULT_PUBLIC_SUPPORT_EMAIL,
  PUBLIC_BRAND_NAME,
  PUBLIC_BRAND_TAGLINE,
  DEFAULT_SITE_URL,
  PRIMARY_SEO_PHRASE,
  PRODUCT_BRAND_NAME,
  RIGHTS_HOLDER_ADDRESS,
  RIGHTS_HOLDER_NAME,
  WHATSAPP_DISPLAY_PHONE,
  WHATSAPP_PHONE_E164,
} from './publicBrand';
import { DEFAULT_BRAND_LOGO_PATH } from '../utils/brandAssets';

export type PublicSeoRouteKey = 'home' | 'products' | 'about' | 'contact' | 'login' | 'user-manual';

type JsonLdRecord = Record<string, unknown>;

export type PublicSiteConfigInput = {
  siteUrl?: string;
  businessEmail?: string;
  businessPhone?: string;
  gaMeasurementId?: string;
  gscVerification?: string;
};

export type PublicSiteConfig = {
  siteUrl: string;
  siteName: string;
  businessEmail: string;
  businessPhone: string;
  gaMeasurementId?: string;
  gscVerification?: string;
  rightsHolderName: string;
  rightsHolderAddress: string;
  applicationRightsNote: string;
  whatsappDisplayPhone: string;
  whatsappPhoneE164: string;
};

export type PublicSeoBuildContext = {
  site: PublicSiteConfig;
  route: PublicSeoEntry;
  canonicalUrl: string;
  imageUrl?: string;
};

export type PublicSeoEntry = {
  key: PublicSeoRouteKey;
  path: string;
  title: string;
  description: string;
  keywords: string[];
  robots?: string;
  prerender: boolean;
  structuredData?: (context: PublicSeoBuildContext) => JsonLdRecord[];
};

export type PublicSeoModel = {
  title: string;
  description: string;
  canonicalUrl: string;
  keywordsContent: string;
  robots: string;
  ogType: 'website';
  siteName: string;
  imageUrl?: string;
  structuredData: JsonLdRecord[];
  gaMeasurementId?: string;
  gscVerification?: string;
};

export const PUBLIC_SEO_HEAD_MARKER_START = '<!-- PUBLIC_SEO_HEAD:BEGIN -->';
export const PUBLIC_SEO_HEAD_MARKER_END = '<!-- PUBLIC_SEO_HEAD:END -->';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeSiteUrl = (value: string | undefined): string => {
  const fallback = DEFAULT_SITE_URL;
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const normalized = new URL(raw).toString();
    return trimTrailingSlash(normalized);
  } catch {
    return fallback;
  }
};

const absoluteUrl = (siteUrl: string, path: string): string => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return cleanPath === '/' ? siteUrl : `${siteUrl}${cleanPath}`;
};

const buildHomeStructuredData = ({ site, canonicalUrl, imageUrl }: PublicSeoBuildContext): JsonLdRecord[] => {
  const organizationId = `${site.siteUrl}/#organization`;
  const softwareId = `${canonicalUrl}#software`;
  const logoUrl = absoluteUrl(site.siteUrl, DEFAULT_BRAND_LOGO_PATH);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: site.rightsHolderName,
      brand: {
        '@type': 'Brand',
        name: PUBLIC_BRAND_NAME,
        logo: logoUrl,
      },
      logo: logoUrl,
      url: site.siteUrl,
      email: site.businessEmail,
      telephone: `+${site.whatsappPhoneE164}`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: site.rightsHolderAddress,
        addressLocality: 'Bangalore',
        postalCode: '560084',
        addressCountry: 'IN',
      },
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'sales',
          email: site.businessEmail,
          telephone: `+${site.whatsappPhoneE164}`,
          areaServed: 'IN',
          availableLanguage: ['en'],
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      '@id': softwareId,
      name: PRODUCT_BRAND_NAME,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Sports operations software from Sarva Horizon for bookings, facility scheduling, memberships, secure payments, staff operations, and reporting.',
      url: canonicalUrl,
      keywords: [PRIMARY_SEO_PHRASE, PUBLIC_BRAND_TAGLINE, 'sports facility management software', 'facility booking system'].join(', '),
      provider: {
        '@id': organizationId,
      },
      image: imageUrl || undefined,
    },
  ];
};

export const PUBLIC_SEO_ENTRIES: Record<PublicSeoRouteKey, PublicSeoEntry> = {
  home: {
    key: 'home',
    path: '/',
    title: `${PUBLIC_BRAND_NAME} | ${PUBLIC_BRAND_TAGLINE}`,
    description:
      'Sarva Horizon delivers custom application development, software products, digital marketing, branding support, and event management services for growing teams and organizations.',
    keywords: [
      PUBLIC_BRAND_NAME,
      PUBLIC_BRAND_TAGLINE,
      'application development company',
      'digital marketing services',
      'event management services',
      'custom software development',
      'sports software products',
      PRODUCT_BRAND_NAME,
    ],
    robots: 'index,follow',
    prerender: true,
    structuredData: buildHomeStructuredData,
  },
  products: {
    key: 'products',
    path: '/products',
    title: `Sports Software Products | Sarva Horizon`,
    description:
      'Explore the Sarva Horizon product line: Sarva Sports Complex Management Platform and Sarva Sports Event Management for bookings, memberships, quotations, payments, and event operations.',
    keywords: [
      PRIMARY_SEO_PHRASE,
      'sports software products',
      'sports facility management software',
      'sports event management application',
      'tournament management software',
      'event quotation software',
      'Sarva Horizon',
      `${PRODUCT_BRAND_NAME} products`,
    ],
    robots: 'index,follow',
    prerender: true,
  },
  about: {
    key: 'about',
    path: '/about',
    title: `About ${PUBLIC_BRAND_NAME} | Products, Marketing, and Event Services`,
    description:
      'Learn how Sarva Horizon brings together application development, software products, digital marketing, creative execution, and event management under one brand.',
    keywords: [
      PUBLIC_BRAND_NAME,
      PUBLIC_BRAND_TAGLINE,
      'application development',
      'digital marketing company',
      'event management company',
      `${PRODUCT_BRAND_NAME} software`,
    ],
    robots: 'index,follow',
    prerender: true,
  },
  contact: {
    key: 'contact',
    path: '/contact',
    title: `Contact ${PUBLIC_BRAND_NAME} | Products, Marketing, and Event Services`,
    description:
      'Contact Sarva Horizon for software products, custom application development, digital marketing support, or event management services.',
    keywords: [
      `${PUBLIC_BRAND_NAME} contact`,
      'application development enquiry',
      'digital marketing consultation',
      'event management enquiry',
      `${PRODUCT_BRAND_NAME} demo`,
    ],
    robots: 'index,follow',
    prerender: true,
  },
  login: {
    key: 'login',
    path: '/login',
    title: `Client Login | ${PUBLIC_BRAND_NAME}`,
    description:
      'Secure client login for Sarva software workspaces managed under Sarva Horizon.',
    keywords: [
      `${PRODUCT_BRAND_NAME} login`,
      `${PUBLIC_BRAND_NAME} login`,
      'sports complex software login',
      'client workspace access',
      PRIMARY_SEO_PHRASE,
    ],
    robots: 'noindex,follow',
    prerender: true,
  },
  'user-manual': {
    key: 'user-manual',
    path: '/user-manual',
    title: `${PRODUCT_BRAND_NAME} User Manual | ${PRIMARY_SEO_PHRASE}`,
    description:
      'Sarva user manual for sports complex management platform workflows, module navigation, setup guidance, and day-to-day operations.',
    keywords: [
      'Sarva user manual',
      'sports complex management platform guide',
      'sports facility management software manual',
      'Sarva documentation',
    ],
    robots: 'index,follow',
    prerender: false,
  },
};

export const PUBLIC_SEO_ROUTE_LIST: PublicSeoEntry[] = Object.values(PUBLIC_SEO_ENTRIES);

export const getPublicSeoEntry = (key: PublicSeoRouteKey): PublicSeoEntry => PUBLIC_SEO_ENTRIES[key];

export const resolvePublicSiteConfig = (input: PublicSiteConfigInput = {}): PublicSiteConfig => ({
  siteUrl: normalizeSiteUrl(input.siteUrl),
  siteName: PUBLIC_BRAND_NAME,
  businessEmail: String(input.businessEmail || DEFAULT_PUBLIC_SUPPORT_EMAIL).trim() || DEFAULT_PUBLIC_SUPPORT_EMAIL,
  businessPhone: String(input.businessPhone || WHATSAPP_DISPLAY_PHONE).trim() || WHATSAPP_DISPLAY_PHONE,
  gaMeasurementId: String(input.gaMeasurementId || '').trim() || undefined,
  gscVerification: String(input.gscVerification || '').trim() || undefined,
  rightsHolderName: RIGHTS_HOLDER_NAME,
  rightsHolderAddress: RIGHTS_HOLDER_ADDRESS,
  applicationRightsNote: APPLICATION_RIGHTS_NOTE,
  whatsappDisplayPhone: WHATSAPP_DISPLAY_PHONE,
  whatsappPhoneE164: WHATSAPP_PHONE_E164,
});

export const buildPublicSeoModel = (
  key: PublicSeoRouteKey,
  site: PublicSiteConfig,
  imagePath?: string
): PublicSeoModel => {
  const route = getPublicSeoEntry(key);
  const canonicalUrl = absoluteUrl(site.siteUrl, route.path);
  const imageUrl = imagePath
    ? imagePath.startsWith('http://') || imagePath.startsWith('https://')
      ? imagePath
      : absoluteUrl(site.siteUrl, imagePath.startsWith('/') ? imagePath : `/${imagePath}`)
    : undefined;
  const structuredData = route.structuredData ? route.structuredData({ site, route, canonicalUrl, imageUrl }) : [];

  return {
    title: route.title,
    description: route.description,
    canonicalUrl,
    keywordsContent: route.keywords.join(', '),
    robots: route.robots || 'index,follow',
    ogType: 'website',
    siteName: site.siteName,
    imageUrl,
    structuredData,
    gaMeasurementId: site.gaMeasurementId,
    gscVerification: site.gscVerification,
  };
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeJsonForScript = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export const renderPublicSeoHeadMarkup = (model: PublicSeoModel): string => {
  const lines = [
    `    <title>${escapeHtml(model.title)}</title>`,
    `    <meta name="description" content="${escapeHtml(model.description)}" />`,
    `    <meta name="keywords" content="${escapeHtml(model.keywordsContent)}" />`,
    `    <meta name="robots" content="${escapeHtml(model.robots)}" />`,
    `    <link rel="icon" type="image/png" href="${escapeHtml(DEFAULT_BRAND_LOGO_PATH)}" />`,
    `    <link rel="apple-touch-icon" href="${escapeHtml(DEFAULT_BRAND_LOGO_PATH)}" />`,
    `    <link rel="canonical" href="${escapeHtml(model.canonicalUrl)}" />`,
    `    <meta property="og:type" content="${escapeHtml(model.ogType)}" />`,
    `    <meta property="og:site_name" content="${escapeHtml(model.siteName)}" />`,
    `    <meta property="og:title" content="${escapeHtml(model.title)}" />`,
    `    <meta property="og:description" content="${escapeHtml(model.description)}" />`,
    `    <meta property="og:url" content="${escapeHtml(model.canonicalUrl)}" />`,
    `    <meta name="twitter:card" content="${model.imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `    <meta name="twitter:title" content="${escapeHtml(model.title)}" />`,
    `    <meta name="twitter:description" content="${escapeHtml(model.description)}" />`,
  ];

  if (model.imageUrl) {
    lines.push(`    <meta property="og:image" content="${escapeHtml(model.imageUrl)}" />`);
    lines.push(
      `    <meta property="og:image:alt" content="${escapeHtml(`${model.siteName} brand and services overview`)}" />`
    );
    lines.push(`    <meta name="twitter:image" content="${escapeHtml(model.imageUrl)}" />`);
  }

  if (model.gscVerification) {
    lines.push(
      `    <meta name="google-site-verification" content="${escapeHtml(model.gscVerification)}" />`
    );
  }

  for (const item of model.structuredData) {
    lines.push(`    <script type="application/ld+json">${escapeJsonForScript(item)}</script>`);
  }

  if (model.gaMeasurementId) {
    lines.push(
      `    <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(model.gaMeasurementId)}"></script>`
    );
    lines.push(
      `    <script>window.dataLayer=window.dataLayer||[];function gtag(){window.dataLayer.push(arguments);}window.gtag=window.gtag||gtag;gtag('js',new Date());gtag('config','${escapeHtml(
        model.gaMeasurementId
      )}',{page_path:'${escapeHtml(new URL(model.canonicalUrl).pathname)}',page_title:'${escapeHtml(model.title)}'});</script>`
    );
  }

  return lines.join('\n');
};
