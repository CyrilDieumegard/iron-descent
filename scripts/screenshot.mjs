// Headless screenshots of the running dev server for visual debugging.
// Usage: node scripts/screenshot.mjs [baseUrl] [outDir]
import { chromium } from '/Users/redsun/.npm/_npx/dd48173ecf795e2b/node_modules/playwright/index.mjs';

const base = process.argv[2] || 'http://localhost:5175';
const out = process.argv[3] || new URL('../.debug/', import.meta.url).pathname;

const shots = [
  { name: 'fix3-forward', yaw: 0, pitch: 0 },
  { name: 'fix3-up', yaw: 0, pitch: 0.7 },
  { name: 'fix3-up-steep', yaw: 0, pitch: 1.4 },
  { name: 'fix3-corner', yaw: 0.8, pitch: 0.15 },
  { name: 'fix3-down', yaw: Math.PI, pitch: -0.4 },
  { name: 'fix3-wall', yaw: Math.PI / 2, pitch: 0.1 },
];

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

for (const s of shots) {
  await page.goto(`${base}/?shot&yaw=${s.yaw}&pitch=${s.pitch}`, { waitUntil: 'load' });
  // Wait until models are loaded (overlay shows CLICK TO PLAY or is hidden by ?shot).
  await page.waitForFunction(() => document.body.textContent.includes('CLICK TO PLAY') || !document.body.textContent.includes('LOADING MODELS'), { timeout: 90000 });
  await page.waitForTimeout(1200); // a few frames
  await page.screenshot({ path: `${out}${s.name}.png` });
  console.log('saved', s.name);
}
await browser.close();
