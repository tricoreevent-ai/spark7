import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { config as loadDotenv } from 'dotenv';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { PublicLoginCard } from '../src/client/components/PublicLoginCard';
import { PublicAboutPage, PublicContactPage, PublicHomePage, PublicLoginPage } from '../src/client/pages/PublicSite';
import {
  PUBLIC_SEO_HEAD_MARKER_END,
  PUBLIC_SEO_HEAD_MARKER_START,
  PUBLIC_SEO_ROUTE_LIST,
  PublicSeoRouteKey,
  buildPublicSeoModel,
  renderPublicSeoHeadMarkup,
  resolvePublicSiteConfig,
} from '../src/client/public/publicSeoConfig';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distClientDir = path.join(projectRoot, 'dist', 'client');
const distAssetsDir = path.join(distClientDir, 'assets');
const distIndexPath = path.join(distClientDir, 'index.html');

const toPosix = (value: string): string => value.split(path.sep).join('/');

const loadBuildEnvironment = () => {
  const files = ['.env', '.env.local', '.env.client', '.env.client.local'];
  for (const fileName of files) {
    loadDotenv({
      path: path.join(projectRoot, fileName),
      override: true,
    });
  }
};

const getBuildSiteConfig = () =>
  resolvePublicSiteConfig({
    siteUrl:
      String(process.env.VITE_SITE_URL || '').trim()
      || String(process.env.FRONTEND_URL || '').trim()
      || undefined,
    businessEmail:
      String(process.env.VITE_BUSINESS_EMAIL || '').trim()
      || String(process.env.BUSINESS_EMAIL || '').trim()
      || undefined,
    businessPhone:
      String(process.env.VITE_BUSINESS_PHONE || '').trim()
      || String(process.env.BUSINESS_PHONE || '').trim()
      || undefined,
    gaMeasurementId: String(process.env.VITE_GA_MEASUREMENT_ID || '').trim() || undefined,
    gscVerification: String(process.env.VITE_GSC_VERIFICATION || '').trim() || undefined,
  });

const findMarketingImagePublicPath = async (): Promise<string> => {
  const assetFiles = await fs.readdir(distAssetsDir);
  const marketingImage = assetFiles.find((fileName) => /^spark-dashboard-macbook-.*\.(png|jpg|jpeg|webp)$/i.test(fileName));
  if (!marketingImage) {
    throw new Error('Unable to locate the built homepage marketing image in dist/client/assets.');
  }
  return `/assets/${marketingImage}`;
};

const renderPublicRoute = (routeKey: PublicSeoRouteKey, marketingImagePublicPath: string): string => {
  const loginCard = (
    <PublicLoginCard
      email=""
      tenantSlug=""
      password=""
      otpCode=""
      showPassword={false}
      rememberCredentials={false}
      loading={false}
      error=""
      success=""
      onEmailChange={() => undefined}
      onTenantSlugChange={() => undefined}
      onPasswordChange={() => undefined}
      onOtpCodeChange={() => undefined}
      onShowPasswordChange={() => undefined}
      onRememberCredentialsChange={() => undefined}
      onSubmit={(event) => event.preventDefault()}
      onResendOtp={() => undefined}
      onCancelOtp={() => undefined}
      onResetLoading={() => undefined}
    />
  );

  const element =
    routeKey === 'home' ? (
      <PublicHomePage productImageSrc={marketingImagePublicPath} />
    ) : routeKey === 'about' ? (
      <PublicAboutPage />
    ) : routeKey === 'contact' ? (
      <PublicContactPage />
    ) : routeKey === 'login' ? (
      <PublicLoginPage>{loginCard}</PublicLoginPage>
    ) : null;

  if (!element) {
    throw new Error(`Prerender is not configured for route "${routeKey}".`);
  }

  return renderToString(<StaticRouter location={PUBLIC_SEO_ROUTE_LIST.find((entry) => entry.key === routeKey)?.path || '/'}>{element}</StaticRouter>);
};

const replacePublicSeoHead = (html: string, headMarkup: string): string => {
  const markerBlock = `${PUBLIC_SEO_HEAD_MARKER_START}\n${headMarkup}\n    ${PUBLIC_SEO_HEAD_MARKER_END}`;
  if (html.includes(PUBLIC_SEO_HEAD_MARKER_START) && html.includes(PUBLIC_SEO_HEAD_MARKER_END)) {
    return html.replace(
      new RegExp(`${PUBLIC_SEO_HEAD_MARKER_START}[\\s\\S]*?${PUBLIC_SEO_HEAD_MARKER_END}`),
      markerBlock
    );
  }
  return html.replace('</head>', `${markerBlock}\n  </head>`);
};

const injectRootMarkup = (html: string, markup: string): string => {
  if (html.includes('<div id="root"></div>')) {
    return html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  }
  return html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${markup}</div>`);
};

const assetPrefixForOutput = (outputFilePath: string): string => {
  const relativePath = toPosix(path.relative(path.dirname(outputFilePath), distClientDir));
  return relativePath ? `${relativePath}/` : './';
};

const rewriteBuildAssetPaths = (html: string, outputFilePath: string): string => {
  const prefix = assetPrefixForOutput(outputFilePath);
  return html.replace(/((?:src|href)=["'])\.\/([^"']+)(["'])/g, (_match, start, target, end) => {
    return `${start}${prefix}${target}${end}`;
  });
};

const outputPathForRoute = (routePath: string): string =>
  routePath === '/'
    ? distIndexPath
    : path.join(distClientDir, routePath.replace(/^\/+/, ''), 'index.html');

const writePrerenderedRoute = async (templateHtml: string, routeKey: PublicSeoRouteKey, marketingImagePublicPath: string) => {
  const route = PUBLIC_SEO_ROUTE_LIST.find((entry) => entry.key === routeKey);
  if (!route) {
    throw new Error(`Unknown public SEO route "${routeKey}".`);
  }

  const outputFilePath = outputPathForRoute(route.path);
  const markup = renderPublicRoute(routeKey, marketingImagePublicPath);
  const siteConfig = getBuildSiteConfig();
  const seoModel = buildPublicSeoModel(routeKey, siteConfig, routeKey === 'home' ? marketingImagePublicPath : undefined);
  const routeHtml = injectRootMarkup(
    replacePublicSeoHead(rewriteBuildAssetPaths(templateHtml, outputFilePath), renderPublicSeoHeadMarkup(seoModel)),
    markup
  );

  await fs.mkdir(path.dirname(outputFilePath), { recursive: true });
  await fs.writeFile(outputFilePath, routeHtml, 'utf8');
};

const writeRobotsTxt = async (siteUrl: string) => {
  const content = ['User-agent: *', 'Allow: /', `Sitemap: ${siteUrl}/sitemap.xml`, ''].join('\n');
  await fs.writeFile(path.join(distClientDir, 'robots.txt'), content, 'utf8');
};

const writeSitemapXml = async (siteUrl: string) => {
  const lastModified = new Date().toISOString();
  const urlEntries = PUBLIC_SEO_ROUTE_LIST.map((route) => {
    const routeUrl = route.path === '/' ? siteUrl : `${siteUrl}${route.path}`;
    return [
      '  <url>',
      `    <loc>${routeUrl}</loc>`,
      `    <lastmod>${lastModified}</lastmod>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlEntries,
    '</urlset>',
    '',
  ].join('\n');

  await fs.writeFile(path.join(distClientDir, 'sitemap.xml'), xml, 'utf8');
};

const main = async () => {
  loadBuildEnvironment();

  const templateHtml = await fs.readFile(distIndexPath, 'utf8');
  const siteConfig = getBuildSiteConfig();
  const marketingImagePublicPath = await findMarketingImagePublicPath();

  const prerenderTargets = PUBLIC_SEO_ROUTE_LIST.filter((route) => route.prerender);
  for (const route of prerenderTargets) {
    await writePrerenderedRoute(templateHtml, route.key, marketingImagePublicPath);
  }

  await writeRobotsTxt(siteConfig.siteUrl);
  await writeSitemapXml(siteConfig.siteUrl);

  console.log(
    `Generated public SEO assets for ${prerenderTargets.map((route) => route.path).join(', ')} and sitemap entries for ${PUBLIC_SEO_ROUTE_LIST.length} routes.`
  );
};

main().catch((error) => {
  console.error('Failed to generate public SEO assets:', error);
  process.exitCode = 1;
});
