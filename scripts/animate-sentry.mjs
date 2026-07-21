#!/usr/bin/env node
// Rig the sentry model and bake a walk animation via Meshy's Rigging & Animation API.
//
// ⚠️ Meshy APIs are ASYNC (minutes per task) — this is an offline build step, NOT
// something the game can call at runtime. Run once, it writes
// public/models/sentrywalk.glb, and the game automatically plays the clip.
//
// Usage:
//   node scripts/animate-sentry.mjs --model-url=https://example.com/sentry.glb
//   node scripts/animate-sentry.mjs --model-url=... --action=walk   (name filter)
//
// The rigging API needs a publicly reachable model URL (Meshy downloads it).
// Reads MESHY_API_KEY from env or .env.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'models');
mkdirSync(outDir, { recursive: true });

let key = process.env.MESHY_API_KEY;
if (!key && existsSync(join(root, '.env'))) {
  const m = readFileSync(join(root, '.env'), 'utf8').match(/MESHY_API_KEY=(\S+)/);
  if (m) key = m[1];
}
if (!key) { console.error('Missing MESHY_API_KEY'); process.exit(1); }

const argVal = (flag) => process.argv.find((a) => a.startsWith(`--${flag}=`))?.split('=')[1];
const modelUrl = argVal('model-url');
const actionFilter = (argVal('action') || 'walk').toLowerCase();
if (!modelUrl) {
  console.error('Usage: node scripts/animate-sentry.mjs --model-url=<public URL of sentry.glb> [--action=walk]');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, url, body) {
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function waitFor(url, label) {
  for (;;) {
    const t = await api('GET', url);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'EXPIRED') {
      throw new Error(`${label} ${t.status}: ${JSON.stringify(t.task_error)}`);
    }
    console.log(`[${label}] ${t.status} ${t.progress ?? 0}%`);
    await sleep(12000);
  }
}

// 1. Rig the model (auto-skeleton).
console.log('[rig] creating rigging task…');
const rig = await api('POST', 'https://api.meshy.ai/openapi/v1/rigging', { model_url: modelUrl });
const rigId = rig.result;
console.log(`[rig] task ${rigId}`);
const rigged = await waitFor(`https://api.meshy.ai/openapi/v1/rigging/${rigId}`, 'rig');

// 2. Pick a walk animation from the animation library.
console.log('[anim] fetching animation library…');
const lib = await api('GET', 'https://api.meshy.ai/openapi/v1/animations');
const actions = lib.result || lib;
const match = actions.find((a) => a.name?.toLowerCase().includes(actionFilter));
if (!match) {
  console.error(`No animation matching "${actionFilter}". Available:`);
  for (const a of actions) console.error(`  - id=${a.id} name=${a.name}`);
  process.exit(1);
}
console.log(`[anim] using "${match.name}" (id ${match.id})`);

// 3. Apply the animation to the rigged character.
const anim = await api('POST', 'https://api.meshy.ai/openapi/v1/animation', {
  rig_task_id: rigId,
  action_id: match.id,
});
const animId = anim.result;
console.log(`[anim] task ${animId}`);
const done = await waitFor(`https://api.meshy.ai/openapi/v1/animation/${animId}`, 'anim');

// 4. Download the animated GLB.
const glbUrl = done.result?.model_urls?.glb || done.result?.animated_glb_url || done.model_urls?.glb;
if (!glbUrl) throw new Error(`No GLB URL in result: ${JSON.stringify(done).slice(0, 500)}`);
const res = await fetch(glbUrl);
if (!res.ok) throw new Error(`download failed ${res.status}`);
const dest = join(outDir, 'sentrywalk.glb');
writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
console.log(`saved ${dest} — the game will now play the baked walk clip automatically.`);
