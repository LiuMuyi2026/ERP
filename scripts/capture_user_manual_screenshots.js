#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/carsonlv/desktop/J/nexus-erp';
const { chromium } = require(path.join(ROOT, 'frontend', 'node_modules', 'playwright'));

const OUT = path.join(ROOT, 'docs', 'user-manual', 'images');
fs.mkdirSync(OUT, { recursive: true });

const BASE_URL = 'https://nexus-frontend-5thy.onrender.com';

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 120000 });

  const creds = [
    { ws: 'demo', email: 'sales.demo@nexus.com', password: 'DemoSales2026' },
    { ws: 'demo', email: '1@1.com', password: '1' },
    { ws: 'test', email: 'admin@test.com', password: 'Happy2026' },
  ];

  for (const c of creds) {
    await page.fill('input[name="workspace"]', c.ws).catch(() => {});
    await page.fill('input[name="email"]', c.email).catch(() => {});
    await page.fill('input[name="password"]', c.password).catch(() => {});
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    const url = page.url();
    if (!url.includes('/login')) return;
  }
  throw new Error('Login failed with known credentials');
}

async function full(page, filename) {
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, filename), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  await login(page);

  await page.goto(`${BASE_URL}/demo/crm`, { waitUntil: 'networkidle', timeout: 120000 });
  await full(page, 'crm-overview.png');

  await page.goto(`${BASE_URL}/demo/crm/customers`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1000);
  const addBtn = page.locator('button:has-text("新增客户"), button:has-text("添加客户"), button:has-text("Add Customer")').first();
  if (await addBtn.count()) {
    await addBtn.click();
    await page.waitForTimeout(1000);
  }
  await full(page, 'add-customer-form.png');

  // Customer 360: try click first row/item from customers list
  const firstRow = page.locator('table tbody tr').first();
  if (await firstRow.count()) {
    await firstRow.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  if (!page.url().includes('/customer-360')) {
    // fallback from CRM list
    await page.goto(`${BASE_URL}/demo/crm`, { waitUntil: 'networkidle', timeout: 120000 });
    const detailBtn = page.locator('button:has-text("客户详情"), a:has-text("客户详情")').first();
    if (await detailBtn.count()) {
      await detailBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  await full(page, 'customer-360.png');

  await page.goto(`${BASE_URL}/demo/messages`, { waitUntil: 'networkidle', timeout: 120000 });
  await full(page, 'messages-whatsapp.png');

  const historyTab = page.locator('button:has-text("通讯记录"), [role="tab"]:has-text("通讯记录"), :text("通讯记录")').first();
  if (await historyTab.count()) {
    await historyTab.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
  await full(page, 'messages-history.png');

  await page.goto(`${BASE_URL}/demo/settings`, { waitUntil: 'networkidle', timeout: 120000 });
  // Try open whatsapp settings in left menu
  const waSetting = page.locator('text=WhatsApp 设置, text=WhatsApp').first();
  if (await waSetting.count()) {
    await waSetting.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  await full(page, 'settings-whatsapp.png');

  await page.goto(`${BASE_URL}/demo/hr`, { waitUntil: 'networkidle', timeout: 120000 });
  await full(page, 'hr-with-chat.png');

  await browser.close();

  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log('Captured files:');
  for (const f of files) {
    const s = fs.statSync(path.join(OUT, f));
    console.log(`${f} ${Math.round(s.size / 1024)}KB`);
  }
})();
