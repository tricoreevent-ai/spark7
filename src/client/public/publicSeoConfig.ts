import {
  APPLICATION_RIGHTS_NOTE,
  DEFAULT_PUBLIC_SUPPORT_EMAIL,
  DEFAULT_SITE_URL,
  PRIMARY_SEO_PHRASE,
  PRODUCT_BRAND_NAME,
  RIGHTS_HOLDER_ADDRESS,
  RIGHTS_HOLDER_NAME,
  WHATSAPP_DISPLAY_PHONE,
  WHATSAPP_PHONE_E164,
} from './publicBrand';

export type PublicSeoRouteKey = 'home' | 'about' | 'contact' | 'login' | 'user-manual';

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

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: site.rightsHolderName,
      brand: {
        '@type': 'Brand',
        name: PRODUCT_BRAND_NAME,
      },
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
        'Sports complex management platform for bookings, facility scheduling, memberships, secure payments, staff operations, and reporting.',
      url: canonicalUrl,
      keywords: [PRIMARY_SEO_PHRASE, 'sports facility management software', 'facility booking system'].join(', '),
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
    title: `${PRIMARY_SEO_PHRASE} | ${PRODUCT_BRAND_NAME}`,
    description:
      'Sports Complex Management Platform for bookings, facility scheduling, memberships, secure payments, staff operations, and reporting.',
    keywords: [
      PRIMARY_SEO_PHRASE,
      'sports facility management software',
      'facility booking system',
      'online court scheduling',
      'membership management',
      'secure payment processing',
      'Sarva',
    ],
    robots: 'index,follow',
    prerender: true,
    structuredData: buildHomeStructuredData,
  },
  about: {
    key: 'about',
    path: '/about',
    title: `Sports Facility Management Software | ${PRODUCT_BRAND_NAME}`,
    description:
      'See how Sarva sports facility management software connects bookings, memberships, staff operations, inventory, accounts, and reporting.',
    keywords: [
      'sports facility management software',
      PRIMARY_SEO_PHRASE,
      'sports complex software',
      'facility booking system',
      `${PRODUCT_BRAND_NAME} software`,
    ],
    robots: 'index,follow',
    prerender: true,
  },
  contact: {
    key: 'contact',
    path: '/contact',
    title: `Book a Demo | ${PRODUCT_BRAND_NAME} ${PRIMARY_SEO_PHRASE}`,
    description:
      'Book a demo of Sarva sports complex management platform for facility booking, memberships, secure payments, and daily venue operations.',
    keywords: [
      'sports complex management platform demo',
      'sports facility management software contact',
      'facility booking system demo',
      'Sarva contact',
    ],
    robots: 'index,follow',
    prerender: true,
  },
  login: {
    key: 'login',
    path: '/login',
    title: `Client Login | ${PRODUCT_BRAND_NAME}`,
    description:
      'Secure login for Sarva client workspaces managing sports complex bookings, memberships, staff operations, payments, and reporting.',
    keywords: [
      'Sarva login',
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
  siteName: PRODUCT_BRAND_NAME,
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
      `    <meta property="og:image:alt" content="${escapeHtml(`${PRODUCT_BRAND_NAME} ${PRIMARY_SEO_PHRASE} dashboard`)}" />`
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
