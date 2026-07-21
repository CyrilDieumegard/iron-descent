#!/usr/bin/env node
// Generate 3D models for iron-descent via Meshy Text-to-3D API v2.
// Usage: node scripts/generate-models.mjs [--preview-only]
// Reads MESHY_API_KEY from env or .env file.

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

const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const MODELS = [
  {
    name: 'sentry',
    prompt: 'Menacing sci-fi combat robot sentry, bipedal military robot with a single glowing red eye visor, dark gunmetal armor plates with orange hazard accents, bulky shoulders, game-ready character, T-pose-free neutral standing pose',
    polycount: 12000,
  },
  {
    name: 'rifle',
    prompt: 'Futuristic assault rifle, sleek sci-fi energy rifle, dark gunmetal body with glowing cyan energy cell accents, long barrel, side profile, game weapon asset',
    polycount: 8000,
  },
  {
    name: 'scatter',
    prompt: 'Heavy futuristic scatter cannon, wide double-barrel sci-fi energy shotgun, bulky industrial dark metal design with glowing orange vents, game weapon asset',
    polycount: 8000,
  },
  {
    name: 'crate',
    prompt: 'Industrial metal cargo crate, worn scuffed steel sci-fi container with yellow and black hazard stripes, reinforced corners, game environment prop',
    polycount: 4000,
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createTask(body) {
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`create failed ${res.status}: ${JSON.stringify(data)}`);
  return data.result; // task id
}

async function getTask(id) {
  const res = await fetch(`${API}/${id}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(`get failed ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function waitForTask(id, label) {
  for (;;) {
    const t = await getTask(id);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'EXPIRED') {
      throw new Error(`${label} task ${id} ${t.status}: ${JSON.stringify(t.task_error)}`);
    }
    console.log(`[${label}] ${t.status} ${t.progress ?? 0}%`);
    await sleep(12000);
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status} for ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`saved ${dest}`);
}

async function generate(model, previewOnly) {
  console.log(`[${model.name}] creating preview task…`);
  const previewId = await createTask({
    mode: 'preview',
    prompt: model.prompt,
    art_style: 'realistic',
    should_remesh: true,
    topology: 'triangle',
    target_polycount: model.polycount,
  });
  console.log(`[${model.name}] preview task ${previewId}`);
  const preview = await waitForTask(previewId, `${model.name}:preview`);

  if (previewOnly) {
    await download(preview.model_urls.glb, join(outDir, `${model.name}.glb`));
    return;
  }

  console.log(`[${model.name}] creating refine task…`);
  const refineId = await createTask({
    mode: 'refine',
    preview_task_id: previewId,
    enable_pbr: true,
  });
  console.log(`[${model.name}] refine task ${refineId}`);
  const refined = await waitForTask(refineId, `${model.name}:refine`);
  await download(refined.model_urls.glb, join(outDir, `${model.name}.glb`));
}

const previewOnly = process.argv.includes('--preview-only');
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const targets = only ? MODELS.filter((m) => m.name === only) : MODELS;

const results = await Promise.allSettled(targets.map((m) => generate(m, previewOnly)));
let failed = 0;
results.forEach((r, i) => {
  if (r.status === 'rejected') { failed++; console.error(`[${targets[i].name}] ERROR: ${r.reason.message}`); }
  else console.log(`[${targets[i].name}] done ✔`);
});
process.exit(failed ? 1 : 0);
