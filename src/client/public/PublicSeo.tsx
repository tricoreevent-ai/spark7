import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PublicSeoRouteKey, buildPublicSeoModel, resolvePublicSiteConfig } from './publicSeoConfig';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type PublicSeoProps = {
  routeKey: PublicSeoRouteKey;
  imagePath?: string;
};

const upsertMeta = (selector: string, attribute: 'name' | 'property', value: string, content?: string): void => {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, value);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
};

const upsertLink = (selector: string, rel: string, href?: string): void => {
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!href) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
};

const upsertScript = (id: string, attrs: Partial<Record<'src' | 'type' | 'async', string>>, text?: string): void => {
  let element = document.getElementById(id) as HTMLScriptElement | null;
  if (!text && !attrs.src) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('script');
    element.id = id;
    document.head.appendChild(element);
  }

  if (attrs.type) {
    element.type = attrs.type;
  } else {
    element.removeAttribute('type');
  }

  if (attrs.src) {
    element.src = attrs.src;
  } else {
    element.removeAttribute('src');
  }

  if (attrs.async === 'true') {
    element.async = true;
  } else {
    element.async = false;
  }

  element.textContent = text || '';
};

const runtimeSiteConfig = () =>
  resolvePublicSiteConfig({
    siteUrl:
      String((import.meta as any)?.env?.VITE_SITE_URL || '').trim() ||
      (typeof window !== 'undefined' ? window.location.origin : undefined),
    businessEmail: String((import.meta as any)?.env?.VITE_BUSINESS_EMAIL || '').trim() || undefined,
    businessPhone: String((import.meta as any)?.env?.VITE_BUSINESS_PHONE || '').trim() || undefined,
    gaMeasurementId: String((import.meta as any)?.env?.VITE_GA_MEASUREMENT_ID || '').trim() || undefined,
    gscVerification: String((import.meta as any)?.env?.VITE_GSC_VERIFICATION || '').trim() || undefined,
  });

export const PublicSeo: React.FC<PublicSeoProps> = ({ routeKey, imagePath }) => {
  const location = useLocation();

  useEffect(() => {
    const site = runtimeSiteConfig();
    const model = buildPublicSeoModel(routeKey, site, imagePath);

    document.title = model.title;
    upsertMeta('meta[name="description"]', 'name', 'description', model.description);
    upsertMeta('meta[name="keywords"]', 'name', 'keywords', model.keywordsContent);
    upsertMeta('meta[name="robots"]', 'name', 'robots', model.robots);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', model.ogType);
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', model.siteName);
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', model.title);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', model.description);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', model.canonicalUrl);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', model.imageUrl);
    upsertMeta(
      'meta[property="og:image:alt"]',
      'property',
      'og:image:alt',
      model.imageUrl ? `${model.siteName} sports complex management platform dashboard` : undefined
    );
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', model.imageUrl ? 'summary_large_image' : 'summary');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', model.title);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', model.description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', model.imageUrl);
    upsertMeta(
      'meta[name="google-site-verification"]',
      'name',
      'google-site-verification',
      model.gscVerification
    );
    upsertLink('link[rel="canonical"]', 'canonical', model.canonicalUrl);

    upsertScript(
      'sarva-public-jsonld',
      { type: 'application/ld+json' },
      model.structuredData.length > 0 ? JSON.stringify(model.structuredData.length === 1 ? model.structuredData[0] : model.structuredData) : undefined
    );

    if (model.gaMeasurementId) {
      upsertScript(
        'sarva-ga-loader',
        {
          src: `https://www.googletagmanager.com/gtag/js?id=${model.gaMeasurementId}`,
          async: 'true',
        }
      );

      window.dataLayer = window.dataLayer || [];
      window.gtag =
        window.gtag ||
        ((...args: unknown[]) => {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push(args);
        });

      upsertScript(
        'sarva-ga-inline',
        {},
        [
          'window.dataLayer = window.dataLayer || [];',
          'window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };',
          'window.gtag(\'js\', new Date());',
        ].join('\n')
      );

      window.gtag('config', model.gaMeasurementId, {
        page_path: `${location.pathname}${location.search}${location.hash}`,
        page_title: model.title,
      });
    } else {
      upsertScript('sarva-ga-loader', {}, undefined);
      upsertScript('sarva-ga-inline', {}, undefined);
    }
  }, [imagePath, location.hash, location.pathname, location.search, routeKey]);

  return null;
};
