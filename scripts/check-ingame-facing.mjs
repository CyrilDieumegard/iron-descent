// One-off: 4 in-game screenshots, one toward each corner sentry.
import { chromium } from '/Users/redsun/.npm/_npx/dd48173ecf795e2b/node_modules/playwright/index.mjs';

const base = 'http://localhost:5175';
const out = new URL('../.debug/', import.meta.url).pathname;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

// Corner sentries at (±22,±22); camera forward = (-sin yaw, -cos yaw).
const shots = [
  { name: 'corner-nw', yaw: Math.PI / 4 },        // toward (-22,-22)
  { name: 'corner-ne', yaw: -Math.PI / 4 },       // toward ( 22,-22)
  { name: 'corner-sw', yaw: (3 * Math.PI) / 4 },  // toward (-22, 22)
  { name: 'corner-se', yaw: (-3 * Math.PI) / 4 }, // toward ( 22, 22)
];
for (const s of shots) {
  await page.goto(`${base}/?shot&yaw=${s.yaw}&pitch=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.textContent.includes('CLICK TO PLAY') || !document.body.textContent.includes('LOADING MODELS'), { timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}facing-${s.name}.png` });
  console.log('saved facing-' + s.name);
}
await browser.close();
