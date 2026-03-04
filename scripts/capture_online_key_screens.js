#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/carsonlv/desktop/J/nexus-erp';
const { chromium } = require(path.join(ROOT, 'frontend', 'node_modules', 'playwright'));

const BASE_URL = 'https://nexus-frontend-5thy.onrender.com';
const OUT_DIR = path.join(ROOT, 'docs', 'user-manual', `online-screens-2026-03-04`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const routes = [
  { path: '/demo', file: '01-dashboard-home.png' },
  { path: '/demo/workspace', file: '02-workspace.png' },
  { path: '/demo/crm', file: '03-crm-overview.png' },
  { path: '/demo/crm/customers', file: '04-crm-customers.png' },
  { path: '/demo/messages', file: '05-messages-center.png' },
  { path: '/demo/orders', file: '06-orders.png' },
  { path: '/demo/hr', file: '07-hr.png' },
  { path: '/demo/accounting', file: '08-accounting.png' },
  { path: '/demo/inventory', file: '09-inventory.png' },
  { path: '/demo/ai-finder', file: '10-ai-finder.png' },
  { path: '/demo/notifications', file: '11-notifications.png' },
  { path: '/demo/settings', file: '12-settings.png' },
  { path: '/demo/operations', file: '13-operations.png' },
  { path: '/demo/admin', file: '14-admin.png' },
];

const creds = [
  { ws: 'demo', email: 'admin2@nexus.com', password: 'NexusAdmin#2026' },
  { ws: 'demo', email: 'sales.demo@nexus.com', password: 'DemoSales2026' },
  { ws: 'demo', email: '1@1.com', password: '1' },
  { ws: 'test', email: 'admin@test.com', password: 'Happy2026' },
];

async function tryLogin(page, c) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.fill('input[name="workspace"]', c.ws).catch(() => {});
  await page.fill('input[name="email"]', c.email).catch(() => {});
  await page.fill('input[name="password"]', c.password).catch(() => {});
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForTimeout(3000);
  return !page.url().includes('/login');
}

async function login(page) {
  for (const c of creds) {
    try {
      if (await tryLogin(page, c)) {
        return c;
      }
    } catch (_) {}
  }
  throw new Error('Unable to login with known credentials');
}

async function shot(page, route) {
  const url = `${BASE_URL}${route.path}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1600);

  // Close obvious modals/toasts that may block content
  const closeBtns = [
    'button[aria-label="Close"]',
    'button[aria-label="关闭"]',
    'button:has-text("关闭")',
    'button:has-text("稍后")',
    'button:has-text("知道了")',
  ];
  for (const sel of closeBtns) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  const out = path.join(OUT_DIR, route.file);
  await page.screenshot({ path: out, fullPage: true });
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const used = await login(page);
  console.log(`Logged in with: ${used.email} (${used.ws})`);

  const ok = [];
  const fail = [];

  for (const r of routes) {
    try {
      const p = await shot(page, r);
      const s = fs.statSync(p);
      ok.push({ route: r.path, file: r.file, kb: Math.round(s.size / 1024) });
      console.log(`OK ${r.path} -> ${r.file} (${Math.round(s.size / 1024)}KB)`);
    } catch (e) {
      fail.push({ route: r.path, err: String(e).slice(0, 220) });
      console.log(`FAIL ${r.path}`);
    }
  }

  await browser.close();

  const indexPath = path.join(OUT_DIR, 'README.txt');
  const lines = [];
  lines.push(`Base URL: ${BASE_URL}`);
  lines.push(`Captured at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('SUCCESS:');
  ok.forEach(x => lines.push(`- ${x.route} -> ${x.file} (${x.kb}KB)`));
  lines.push('');
  lines.push('FAILED:');
  fail.forEach(x => lines.push(`- ${x.route} -> ${x.err}`));
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');

  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Summary: ${indexPath}`);
})();
