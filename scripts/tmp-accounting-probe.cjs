const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000/api';
const EMAIL = 'default.accounting.admin@example.com';
const PASSWORD = 'Sarva@12345';
const TENANT_SLUG = 'default';

const targetPath = process.argv[2] || '/accounting';

async function login() {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      tenantSlug: TENANT_SLUG,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.token) {
    throw new Error(`Login payload missing token: ${JSON.stringify(payload)}`);
  }
  return payload.token;
}

(async () => {
  const token = await login();
  const browser = await chromium
    .launch({ headless: true, channel: 'chrome' })
    .catch(async () => chromium.launch({ headless: true }));
  const page = await browser.newPage();

  await page.addInitScript((tokenValue) => {
    window.localStorage.setItem('token', tokenValue);
    window.localStorage.setItem('sarva_theme_mode', 'dark');
    window.localStorage.setItem('sarva_font_scale', '1');
  }, token);

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(document.body?.innerText?.includes('Default Accounting')), undefined, {
    timeout: 30_000,
  });
  if (targetPath.startsWith('/accounting')) {
    await page.locator('a[href="/accounting"]').click();
    await page.waitForLoadState('networkidle');
    if (targetPath !== '/accounting') {
      await page.evaluate((nextPath) => {
        window.history.pushState({}, '', nextPath);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, targetPath);
      await page.waitForLoadState('networkidle');
    }
  } else if (targetPath !== '/') {
    await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: 'networkidle' });
  }

  const buttons = await page.getByRole('button').evaluateAll((nodes) =>
    nodes
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 80),
  );
  const inputs = await page.locator('input, textarea, select').evaluateAll((nodes) =>
    nodes.slice(0, 80).map((node) => ({
      tag: node.tagName.toLowerCase(),
      type: node.getAttribute('type'),
      placeholder: node.getAttribute('placeholder'),
      name: node.getAttribute('name'),
      id: node.getAttribute('id'),
      value: node.value,
    })),
  );
  const links = await page.locator('a').evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        text: node.textContent?.replace(/\s+/g, ' ').trim(),
        href: node.getAttribute('href'),
      }))
      .filter((item) => item.text || item.href)
      .slice(0, 120),
  );

  console.log(
    JSON.stringify(
      {
        path: targetPath,
        title: await page.title(),
        url: page.url(),
        bodySample: (await page.locator('body').innerText()).slice(0, 5000),
        buttons,
        links,
        inputs,
      },
      null,
      2,
    ),
  );

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
