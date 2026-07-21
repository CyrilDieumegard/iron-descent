// One-off: which way does sentry.glb face?
import { chromium } from '/Users/redsun/.npm/_npx/dd48173ecf795e2b/node_modules/playwright/index.mjs';

const base = 'http://localhost:5175/debug-model.html';
const out = new URL('../.debug/', import.meta.url).pathname;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

for (const side of ['front', 'back']) {
  await page.goto(`${base}?side=${side}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.title === 'done', { timeout: 60000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}orient-${side}.png` });
  console.log('saved orient-' + side);
}
await browser.close();
