import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { initAudio, sfx } from './audio.js';

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('game').innerHTML = '<p style="color:#fff;padding:2em">WebGL is not supported in this browser.</p>';
  throw e;
}
renderer.setSize(innerWidth, innerHeight);
// Cap pixel ratio: full retina (2-3x) costs 4-9x the fragment work for little visible gain.
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a12);
scene.fog = new THREE.Fog(0x0a0a12, 35, 120);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
camera.position.y = 1.7;
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x9fb0ff, 0x3a2a26, 3.0));
scene.add(new THREE.AmbientLight(0x404860, 1.1));
const dl = new THREE.DirectionalLight(0xfff2e0, 2.0);
dl.position.set(5, 10, 3);
dl.castShadow = true;
dl.shadow.mapSize.set(2048, 2048);
dl.shadow.camera.left = dl.shadow.camera.bottom = -32;
dl.shadow.camera.right = dl.shadow.camera.top = 32;
dl.shadow.camera.far = 60;
scene.add(dl);
// Perimeter warm lights. Physical decay means intensity must stay low: at y=2.6 the
// ceiling (y=4) is 1.4m away, and anything much brighter clips to white under ACES.
[[-18, -18], [18, -18], [-18, 18], [18, 18], [0, -18], [0, 18], [-18, 0], [18, 0]].forEach(([x, z]) => {
  const pl = new THREE.PointLight(0xff9950, 7, 40);
  pl.position.set(x, 2.6, z);
  scene.add(pl);
});

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x515b70, roughness: 0.85, metalness: 0.25 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(56, 28, 0x6a7690, 0x39404f);
grid.position.y = 0.02;
scene.add(grid);

const B = 28;
const wallMat = new THREE.MeshStandardMaterial({ color: 0x6a7590, roughness: 0.8, metalness: 0.3 });
const walls = [];
[[0, -B, 60, 2], [0, B, 60, 2], [-B, 0, 2, 60], [B, 0, 2, 60]].forEach(([x, z, w, d]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d), wallMat);
  m.position.set(x, 2, z);
  scene.add(m);
  walls.push(m);
});
// Glowing hazard strips along the walls — extra light + orientation cues
const stripMat = new THREE.MeshStandardMaterial({ color: 0x181410, emissive: 0xff8830, emissiveIntensity: 2.2 });
[[0, -B + 1.05, 56, 0.12], [0, B - 1.05, 56, 0.12], [-B + 1.05, 0, 0.12, 56], [B - 1.05, 0, 0.12, 56]].forEach(([x, z, w, d]) => {
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, d), stripMat);
  s.position.set(x, 3.1, z);
  scene.add(s);
});

// Enclosed hangar ceiling. The slab itself carries a moderate uniform self-glow so it
// always reads as a lit metal surface (never a black void); the light panels sit only
// slightly brighter than the slab so they read as fixtures instead of white holes.
const ceil = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x454f63, roughness: 0.85, metalness: 0.2, emissive: 0x39435a, emissiveIntensity: 0.75 })
);
ceil.rotation.x = Math.PI / 2;
ceil.position.y = 4;
scene.add(ceil);
// 5×5 grid of ceiling light panels. Three's ACES tone mapping scales color by
// exposure/0.6, so emissive intensity must stay LOW (~0.3) to land at a light-gray
// display value instead of clipping to white. Panels are kept small relative to
// their spacing so several are visible with slab around them — that is what makes
// them read as fixtures in a ceiling instead of a hole to the sky.
const panelMat = new THREE.MeshStandardMaterial({ color: 0x4a5160, emissive: 0xcfe0ff, emissiveIntensity: 0.3 });
const panelAltMat = new THREE.MeshStandardMaterial({ color: 0x544a3c, emissive: 0xffc890, emissiveIntensity: 0.28 });
for (let ix = -2; ix <= 2; ix++) {
  for (let iz = -2; iz <= 2; iz++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.4), (ix + iz) % 2 === 0 ? panelMat : panelAltMat);
    p.position.set(ix * 11, 3.95, iz * 10.5);
    scene.add(p);
  }
}
// Crossbeams for structure.
const beamMat = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.7, metalness: 0.5, emissive: 0x0e1420, emissiveIntensity: 1 });
[-20, -9, 2, 11, 20].forEach((z) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(56, 0.35, 0.7), beamMat);
  b.position.set(0, 3.8, z);
  scene.add(b);
});

// ---------- HUD / overlays ----------
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:16px;bottom:16px;color:#fff;font:20px monospace;pointer-events:none';
document.body.appendChild(hud);
const cross = document.createElement('div');
cross.style.cssText = 'position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;background:#fff;border-radius:50%;box-shadow:0 0 0 1.5px #000;pointer-events:none';
document.body.appendChild(cross);
// ---------- Start menu / pause overlay ----------
const overlay = document.createElement('div');
overlay.style.cssText = 'position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#151a28 0%,#05060a 78%);color:#fff;font-family:monospace;user-select:none';
overlay.innerHTML = `
<div style="text-align:center;max-width:600px;padding:24px">
  <div style="font-size:54px;font-weight:bold;letter-spacing:8px;color:#ffb347;text-shadow:0 0 26px rgba(255,102,0,.8)">IRON&nbsp;DESCENT</div>
  <div style="margin-top:8px;color:#8a94ab;font-size:13px;letter-spacing:2px">ARENA FPS — SURVIVE THE SENTRY WAVES</div>
  <div style="margin:30px auto 0;display:inline-block;text-align:left;font-size:15px;line-height:2;color:#cfd6e4">
    <div><span style="color:#fff;font-weight:bold">WASD</span> move &nbsp;·&nbsp; <span style="color:#fff;font-weight:bold">Mouse</span> aim &amp; shoot</div>
    <div><span style="color:#fff;font-weight:bold">1 / 2</span> weapons &nbsp;·&nbsp; <span style="color:#fff;font-weight:bold">R</span> reload &nbsp;·&nbsp; <span style="color:#fff;font-weight:bold">Space</span> jump &nbsp;·&nbsp; <span style="color:#fff;font-weight:bold">Shift</span> sprint</div>
  </div>
  <div id="id-progress-wrap" style="margin:34px auto 0;width:320px;max-width:80%">
    <div id="id-progress-label" style="font-size:13px;color:#9fb0ff;margin-bottom:8px">LOADING… 0%</div>
    <div style="height:6px;background:#222a3a;border-radius:3px;overflow:hidden"><div id="id-progress-bar" style="height:100%;width:0%;background:#ffb347;transition:width .15s"></div></div>
  </div>
  <button id="id-play" style="display:none;margin-top:34px;padding:14px 64px;font:bold 22px monospace;letter-spacing:4px;color:#0a0a12;background:#ffb347;border:none;border-radius:6px;cursor:pointer;box-shadow:0 0 24px rgba(255,153,51,.5)">PLAY</button>
  <div id="id-resume" style="display:none;margin-top:34px;font-size:22px;color:#ffb347;cursor:pointer">CLICK TO RESUME</div>
  <div style="margin-top:30px;font-size:12px;color:#6a7285">Desktop browser required (mouse + keyboard)</div>
  <div style="margin-top:12px;font-size:13px;color:#8a94ab">
    <a href="https://github.com/CyrilDieumegard/iron-descent" target="_blank" rel="noopener" style="color:#9fb0ff">View source</a>
    &nbsp;·&nbsp; Built with LocalClaw
  </div>
</div>`;
document.body.appendChild(overlay);
const playBtn = overlay.querySelector('#id-play');
const resumeEl = overlay.querySelector('#id-resume');
const progressWrap = overlay.querySelector('#id-progress-wrap');
const progressLabel = overlay.querySelector('#id-progress-label');
const progressBar = overlay.querySelector('#id-progress-bar');
const dmgFx = document.createElement('div');
dmgFx.style.cssText = 'position:fixed;inset:0;background:rgba(255,0,0,.4);opacity:0;pointer-events:none';
document.body.appendChild(dmgFx);
const over = document.createElement('div');
over.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(20,0,0,.85);color:#ff4444;font:32px monospace;text-align:center';
over.innerHTML = 'GAME OVER<br><span style="font-size:18px;color:#fff">press R to restart</span>';
document.body.appendChild(over);
// Wave banner (center-screen, fades out)
const waveBanner = document.createElement('div');
waveBanner.style.cssText = 'position:fixed;left:50%;top:30%;transform:translateX(-50%);color:#ffcc44;font:32px monospace;pointer-events:none;opacity:0;transition:opacity .4s;text-shadow:0 0 12px #000';
document.body.appendChild(waveBanner);
// Hitmarker: white × flash at the crosshair when a shot connects with a sentry.
const hitmark = document.createElement('div');
hitmark.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font:22px monospace;pointer-events:none;opacity:0;text-shadow:0 0 4px #f00';
hitmark.textContent = '✕';
document.body.appendChild(hitmark);
let hitmarkT = 0;
function showHitmarker() { hitmarkT = 0.18; }

// ---------- Radar minimap (top-right) ----------
const radar = document.createElement('canvas');
radar.width = radar.height = 160;
radar.style.cssText = 'position:fixed;right:16px;top:16px;border:1px solid #466;border-radius:50%;background:rgba(0,10,20,.55);pointer-events:none';
document.body.appendChild(radar);
const rctx = radar.getContext('2d');
function drawRadar() {
  const S = 160, C = S / 2, scale = C / 30; // world ±30 → radar radius
  rctx.clearRect(0, 0, S, S);
  rctx.save();
  rctx.beginPath(); rctx.arc(C, C, C - 1, 0, Math.PI * 2); rctx.clip();
  // Arena boundary
  rctx.strokeStyle = 'rgba(80,220,255,.4)';
  rctx.strokeRect(C - B * scale, C - B * scale, B * 2 * scale, B * 2 * scale);
  // Crates
  rctx.fillStyle = 'rgba(150,150,170,.8)';
  for (const ob of obstacles) rctx.fillRect(C + ob.position.x * scale - 2, C + ob.position.z * scale - 2, 4, 4);
  // Pickups
  for (const p of pickups) {
    rctx.fillStyle = p.isHealth ? '#3f6' : '#48f';
    rctx.beginPath(); rctx.arc(C + p.mesh.position.x * scale, C + p.mesh.position.z * scale, 2.5, 0, Math.PI * 2); rctx.fill();
  }
  // Sentries (blink while telegraphing)
  for (const s of sentries) {
    rctx.fillStyle = s.telegraph ? (Math.floor(performance.now() / 120) % 2 ? '#fff' : '#f33') : '#f33';
    rctx.beginPath(); rctx.arc(C + s.mesh.position.x * scale, C + s.mesh.position.z * scale, 3.5, 0, Math.PI * 2); rctx.fill();
  }
  // Player with view direction
  rctx.fillStyle = '#4ff';
  rctx.beginPath(); rctx.arc(C + camera.position.x * scale, C + camera.position.z * scale, 3.5, 0, Math.PI * 2); rctx.fill();
  rctx.strokeStyle = '#4ff';
  rctx.beginPath();
  rctx.moveTo(C + camera.position.x * scale, C + camera.position.z * scale);
  rctx.lineTo(C + (camera.position.x - Math.sin(yaw) * 5) * scale, C + (camera.position.z - Math.cos(yaw) * 5) * scale);
  rctx.stroke();
  rctx.restore();
}

// ---------- Floating score popups + kill-streak combo ----------
const popupLayer = document.createElement('div');
popupLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden';
document.body.appendChild(popupLayer);
const comboEl = document.createElement('div');
comboEl.style.cssText = 'position:fixed;right:16px;top:190px;color:#fc4;font:24px monospace;pointer-events:none;opacity:0;transition:opacity .3s;text-shadow:0 0 8px #000';
document.body.appendChild(comboEl);
let combo = 0, comboT = 0;
const _pv = new THREE.Vector3();
function spawnScorePopup(worldPos, text, color = '#fc4') {
  _pv.copy(worldPos).project(camera);
  if (_pv.z > 1) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `position:absolute;left:${((_pv.x + 1) / 2 * 100).toFixed(1)}%;top:${((1 - _pv.y) / 2 * 100).toFixed(1)}%;color:${color};font:20px monospace;text-shadow:0 0 6px #000;transition:transform 1s ease-out,opacity 1s`;
  popupLayer.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translateY(-60px)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 1100);
}
function onKill(pos) {
  combo++;
  comboT = 4; // seconds to chain the next kill
  const mult = Math.min(combo, 5);
  const pts = 100 * wave * mult;
  score += pts;
  spawnScorePopup(pos, `+${pts}${mult > 1 ? ' x' + mult : ''}`, mult > 1 ? '#f93' : '#fc4');
  if (combo > 1) { comboEl.textContent = `COMBO x${mult}`; comboEl.style.opacity = 1; sfx.combo(combo); }
}
// Health bar above the text HUD.
const hpBarOuter = document.createElement('div');
hpBarOuter.style.cssText = 'position:fixed;left:16px;bottom:48px;width:220px;height:12px;background:#300;border:1px solid #833;pointer-events:none';
const hpBar = document.createElement('div');
hpBar.style.cssText = 'height:100%;width:100%;background:#e33;transition:width .15s';
hpBarOuter.appendChild(hpBar);
document.body.appendChild(hpBarOuter);

// ---------- GLB asset loading (Meshy models in public/models/, meshopt-compressed) ----------
const ASSETS = { sentry: null, rifle: null, scatter: null, crate: null };

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder); // models are compressed with meshopt

// Real byte-based loading percentage across all in-flight GLB downloads.
const dlBytes = {}; // name -> { loaded, total, done }
function updateProgressUI() {
  let loaded = 0, total = 0, done = 0;
  const names = Object.keys(dlBytes);
  for (const n of names) { loaded += dlBytes[n].loaded; total += dlBytes[n].total || 0; if (dlBytes[n].done) done++; }
  const pct = total > 0 ? Math.min(99, Math.round(loaded / total * 100)) : Math.round(done / Math.max(1, names.length) * 100);
  progressLabel.textContent = `LOADING… ${pct}%`;
  progressBar.style.width = pct + '%';
}

function loadGLB(name) {
  return new Promise((resolve) => {
    dlBytes[name] = { loaded: 0, total: 0, done: false };
    gltfLoader.load(`${import.meta.env.BASE_URL}models/${name}.glb`,
      (gltf) => { ASSETS[name] = gltf.scene; dlBytes[name].done = true; updateProgressUI(); resolve(); },
      (xhr) => { dlBytes[name].loaded = xhr.loaded; if (xhr.total) dlBytes[name].total = xhr.total; updateProgressUI(); },
      (err) => { console.warn(`[assets] failed to load ${name}.glb, using placeholder`, err); dlBytes[name].done = true; resolve(); });
  });
}

// Clone an asset with per-instance materials (so tint/emissive flashes don't affect other instances).
function cloneWithMaterials(proto) {
  // SkeletonUtils.clone handles skinned meshes correctly (Object3D.clone breaks skeletons).
  const c = skeletonClone(proto);
  c.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  return c;
}

// Normalize a model: uniformly scaled to targetSize along `axis`, centered on X/Z, base resting at y=0.
function normalize(obj, targetSize, axis = 'y') {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = targetSize / size[axis];
  obj.scale.setScalar(s);
  const box2 = new THREE.Box3().setFromObject(obj);
  const c = box2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box2.min.y;
  return obj;
}

// ---------- World pieces (built after assets load) ----------
const obstacles = [];
const sentries = [];
let WEAPONS = null;
let flash = null;
let ready = false;

function enableShadows(root) { root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }

function makeCrate(s) {
  if (ASSETS.crate) {
    const g = new THREE.Group();
    const inner = normalize(cloneWithMaterials(ASSETS.crate), s, 'y');
    enableShadows(inner);
    g.add(inner);
    g.userData.isModel = true;
    g.userData.size = s;
    return g;
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: 0x6b4a2f }));
  m.userData.halfHeight = s / 2;
  m.userData.size = s;
  return m;
}
// Swap placeholder crates for the GLB version once crate.glb finishes its background load.
function upgradeCrates() {
  for (let i = 0; i < obstacles.length; i++) {
    const old = obstacles[i];
    if (old.userData.isModel) continue;
    const m = makeCrate(old.userData.size);
    m.position.copy(old.position);
    m.rotation.copy(old.rotation);
    m.userData.aabb = new THREE.Box3().setFromObject(m);
    scene.remove(old);
    scene.add(m);
    obstacles[i] = m;
  }
  refreshShootTargets();
}
function buildObstacles() {
  const sentrySpawns = [[-22, -22], [22, -22], [-22, 22], [22, 22]];
  for (let i = 0; i < 8; i++) {
    const s = 1.5 + Math.random() * 2;
    // Resample until clear of the player spawn (origin) and sentry corners, so
    // neither the player nor a sentry ever starts inside a crate.
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = (Math.random() - 0.5) * 40;
      z = (Math.random() - 0.5) * 40;
      if (Math.hypot(x, z) < 3.5) continue;
      if (sentrySpawns.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 4)) continue;
      break;
    }
    const m = makeCrate(s);
    m.position.set(x, m.userData.halfHeight || 0, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    scene.add(m);
    // World-space AABB (accounts for the random yaw) used for movement collision.
    m.userData.aabb = new THREE.Box3().setFromObject(m);
    obstacles.push(m);
  }
  refreshShootTargets();
}

// Precomputed flat list for shooting raycasts — rebuilt only when the world changes
// instead of allocating a fresh spread array on every single shot.
const shootTargets = [];
function refreshShootTargets() {
  shootTargets.length = 0;
  for (const s of sentries) shootTargets.push(s.mesh);
  shootTargets.push(...obstacles, ...walls, floor, ceil);
}

// Push `pos` (a Vector3-like with x/z) out of every crate's AABB in the XZ plane,
// treating the mover as a circle of `radius`. Crates act as full-height blockers:
// this stops walking AND jumping through them. Returns true if any push happened.
function collideCrates(pos, radius) {
  let pushed = false;
  for (const ob of obstacles) {
    const b = ob.userData.aabb;
    if (!b) continue;
    // Closest point on the box footprint to the mover's center.
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    pushed = true;
    if (d2 > 1e-9) {
      // Outside the box but within radius: push straight out along the contact normal.
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Center is inside the box: eject along the shallowest penetration axis.
      const toMinX = pos.x - (b.min.x - radius);
      const toMaxX = (b.max.x + radius) - pos.x;
      const toMinZ = pos.z - (b.min.z - radius);
      const toMaxZ = (b.max.z + radius) - pos.z;
      const min = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
      if (min === toMinX) pos.x = b.min.x - radius;
      else if (min === toMaxX) pos.x = b.max.x + radius;
      else if (min === toMinZ) pos.z = b.min.z - radius;
      else pos.z = b.max.z + radius;
    }
  }
  return pushed;
}

function makeSentryMesh(sentry) {
  const proto = ASSETS.sentry;
  if (proto) {
    const g = new THREE.Group();
    const inner = normalize(cloneWithMaterials(proto), 2, 'y');
    enableShadows(inner);
    // Base red glow so sentries read against the dark arena.
    inner.traverse((o) => {
      if (o.isMesh && o.material.emissive) {
        o.material.emissive.setHex(0xff2222);
        o.material.emissiveIntensity = 0.45;
      }
    });
    // Meshy model faces +Z (verified via debug-model.html renders), and the group's
    // +Z is aimed at the player by lookAt — so NO flip: front already points where it walks.
    inner.rotation.y = 0;
    g.add(inner);
    // Red glow light so sentries are visible from across the arena.
    const glow = new THREE.PointLight(0xff3322, 7, 9);
    glow.position.y = 1.4;
    g.add(glow);
    return g;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: 0xcc2233 }));
  mesh.userData.halfHeight = 1;
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xffcc33 }));
  eye.position.set(0, 0.5, 0.51);
  mesh.add(eye);
  return mesh;
}
function flashSentry(s) {
  s.mesh.traverse((o) => {
    if (o.isMesh && o.material.emissive) {
      o.material.emissive.setHex(0xff2222);
      o.material.emissiveIntensity = 1.4;
    }
  });
  setTimeout(() => s.mesh.traverse((o) => {
    if (o.isMesh && o.material.emissive) { o.material.emissive.setHex(0xff2222); o.material.emissiveIntensity = 0.45; }
  }), 120);
}
function spawnSentries() {
  while (sentries.length) scene.remove(sentries.pop().mesh);
  // Wave scaling: +1 sentry per wave (cap 10), +1 HP every 2 waves.
  const count = Math.min(4 + wave - 1, 10);
  const hp = 3 + Math.floor((wave - 1) / 2);
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 30; tries++) {
      // First 4 fill the corners, extras get random edge positions.
      if (i < 4) [x, z] = [[-22, -22], [22, -22], [-22, 22], [22, 22]][i];
      else { x = (Math.random() - 0.5) * 44; z = Math.random() < 0.5 ? -22 : 22; if (Math.random() < 0.5) [x, z] = [z, x]; }
      if (Math.hypot(x - camera.position.x, z - camera.position.z) < 12) continue;
      break;
    }
    const s = { mesh: null, hp, laserT: 2 + Math.random() * 4, telegraph: null, walkT: 0 };
    const mesh = makeSentryMesh(s);
    s.mesh = mesh;
    mesh.position.set(x, mesh.userData.halfHeight || 0, z);
    scene.add(mesh);
    sentries.push(s);
  }
  refreshShootTargets();
}

// ---------- Pickups (dropped by sentries: health or ammo) ----------
const pickups = [];
const pickupHealthMat = new THREE.MeshStandardMaterial({ color: 0x22cc44, emissive: 0x22cc44, emissiveIntensity: 0.9 });
const pickupAmmoMat = new THREE.MeshStandardMaterial({ color: 0x3388ff, emissive: 0x3388ff, emissiveIntensity: 0.9 });
function spawnPickup(pos) {
  const isHealth = Math.random() < 0.5;
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), isHealth ? pickupHealthMat : pickupAmmoMat);
  m.position.copy(pos).setY(0.7);
  scene.add(m);
  pickups.push({ mesh: m, isHealth, t: Math.random() * 6 });
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt * 3;
    p.mesh.rotation.y += dt * 2.5;
    p.mesh.position.y = 0.7 + Math.sin(p.t) * 0.15;
    const d = Math.hypot(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);
    if (d < 1.3 && !dead) {
      if (p.isHealth) health = Math.min(MAX_HEALTH, health + 25);
      else { WEAPONS.RIFLE.ammo = WEAPONS.RIFLE.max; WEAPONS.SCATTER.ammo = WEAPONS.SCATTER.max; }
      sfx.pickup();
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

// Meshy weapons have their muzzle along -X; wrap so the muzzle points down -Z (camera forward).
function makeWeaponModel(name, length, fallbackGeo, fallbackColor) {
  const g = new THREE.Group();
  if (ASSETS[name]) {
    const inner = cloneWithMaterials(ASSETS[name]);
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const s = length / size.x;
    inner.scale.setScalar(s);
    inner.rotation.y = -Math.PI / 2; // -X (muzzle) -> -Z
    const box2 = new THREE.Box3().setFromObject(inner);
    const c = box2.getCenter(new THREE.Vector3());
    inner.position.sub(c);
    g.add(inner);
    g.userData.isModel = true;
  } else {
    g.add(new THREE.Mesh(fallbackGeo, new THREE.MeshStandardMaterial({ color: fallbackColor })));
  }
  return g;
}

function buildWeapons() {
  const rifleMesh = makeWeaponModel('rifle', 0.75, new THREE.BoxGeometry(0.15, 0.15, 0.6), 0x3a3a52);
  rifleMesh.position.set(0.25, -0.2, -0.5);
  const scatterMesh = makeWeaponModel('scatter', 0.7, new THREE.BoxGeometry(0.34, 0.22, 0.34), 0x54383a);
  scatterMesh.position.set(0.25, -0.2, -0.42);
  scatterMesh.visible = false;
  camera.add(rifleMesh, scatterMesh);
  WEAPONS = { RIFLE: { ammo: 30, max: 30, cd: 0, mesh: rifleMesh, z: -0.5 }, SCATTER: { ammo: 12, max: 12, cd: 0.65, mesh: scatterMesh, z: -0.42 } };
  flash = new THREE.PointLight(0xffaa33, 0, 12);
  flash.position.set(0.25, -0.1, -1);
  camera.add(flash);
}
// Swap the placeholder scattergun for the GLB version once scatter.glb finishes loading.
function upgradeScatter() {
  const old = WEAPONS.SCATTER.mesh;
  if (old.userData.isModel) return;
  const m = makeWeaponModel('scatter', 0.7, new THREE.BoxGeometry(0.34, 0.22, 0.34), 0x54383a);
  m.position.copy(old.position);
  m.visible = old.visible;
  camera.remove(old);
  camera.add(m);
  WEAPONS.SCATTER.mesh = m;
}

// ---------- Explosions (POOLED particle bursts + fixed light pool) ----------
// Perf note: the old version added a new PointLight per explosion. Three.js recompiles
// EVERY material's shader whenever the light count changes → huge hitch on each shot.
// Now: a fixed pool of lights always in the scene (count never changes) and a pool of
// reusable spark meshes — shooting never triggers shader recompiles or GC spikes.
const SPARK_POOL_SIZE = 160;
const sparkPool = [];
const sparkGeo = new THREE.SphereGeometry(0.06, 6, 6);
for (let i = 0; i < SPARK_POOL_SIZE; i++) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  m.visible = false;
  scene.add(m);
  sparkPool.push({ m, vel: new THREE.Vector3(), active: false });
}
const LIGHT_POOL_SIZE = 3;
const lightPool = [];
for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
  const l = new THREE.PointLight(0xffaa33, 0, 14);
  scene.add(l);
  lightPool.push({ l, life: 0, max: 0.6 });
}
function spawnExplosion(pos, color = 0xffaa33, count = 26, power = 7) {
  let spawned = 0;
  for (const p of sparkPool) {
    if (spawned >= count) break;
    if (p.active) continue;
    p.active = true;
    p.m.visible = true;
    p.m.material.color.setHex(color);
    p.m.position.copy(pos);
    p.m.scale.setScalar(1);
    p.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      .multiplyScalar(power * (0.4 + Math.random() * 0.9));
    spawned++;
  }
  // Grab the oldest light slot (or a free one).
  let slot = lightPool.find((x) => x.life <= 0) || lightPool[0];
  slot.l.color.setHex(color);
  slot.l.position.copy(pos);
  slot.life = slot.max = 0.6;
  slot.l.intensity = 60;
}
function updateExplosions(dt) {
  for (const p of sparkPool) {
    if (!p.active) continue;
    p.vel.y -= 12 * dt; // gravity pulls sparks down
    p.m.position.addScaledVector(p.vel, dt);
    const s = p.m.scale.x - dt * 1.8;
    if (s <= 0.01) { p.active = false; p.m.visible = false; continue; }
    p.m.scale.setScalar(s);
  }
  for (const slot of lightPool) {
    if (slot.life <= 0) continue;
    slot.life -= dt;
    slot.l.intensity = Math.max(0, 60 * (slot.life / slot.max));
  }
}

// ---------- Enemy laser beams ----------
const lasers = [];
const laserBeamMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.9 });
const laserWarnMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.25 });
function makeBeam(from, to, mat, thickness) {
  const len = from.distanceTo(to);
  // Shared unit cylinder — scaled per beam instead of allocating new geometry each shot.
  const m = new THREE.Mesh(beamGeo, mat);
  m.scale.set(thickness, len, thickness);
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(UP, _beamDir.copy(to).sub(from).normalize());
  return m;
}
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const UP = new THREE.Vector3(0, 1, 0);
const _beamDir = new THREE.Vector3();
// True if a straight line from the sentry's eye to the player is not blocked by a crate.
const losRay = new THREE.Raycaster();
function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  losRay.set(from, dir.normalize());
  losRay.far = dist - 0.5;
  return losRay.intersectObjects(obstacles, true).length === 0;
}

// ---------- Game state ----------
const keys = {};
let yaw = 0, pitch = 0, yVel = 0, grounded = true, recoil = 0, cur = 'RIFLE', fireCd = 0;
let bobT = 0, stepT = 0, moving = false;
let health = 100, score = 0, dead = false, hurtCd = 0, dmgF = 0;
let wave = 0, wavePause = 0; // wavePause > 0 → intermission countdown before next wave
const MAX_HEALTH = 100;
const ray = new THREE.Raycaster();
const clock = new THREE.Clock();

// Raycast hits child meshes; walk up to find the owning sentry / obstacle.
function sentryFromObject(obj) {
  let o = obj;
  while (o) {
    const s = sentries.find((x) => x.mesh === o);
    if (s) return s;
    o = o.parent;
  }
  return null;
}
function obstacleFromObject(obj) {
  let o = obj;
  while (o) {
    if (obstacles.includes(o)) return o;
    o = o.parent;
  }
  return null;
}

function startPlaying() { if (!ready) return; initAudio(); renderer.domElement.requestPointerLock(); }
playBtn.addEventListener('click', startPlaying);
resumeEl.addEventListener('click', startPlaying);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.style.display = locked ? 'none' : 'flex';
  if (!locked && ready) { progressWrap.style.display = 'none'; playBtn.style.display = 'none'; resumeEl.style.display = 'block'; }
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.002;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * 0.002));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!ready) return;
  if (e.code === 'Space' && grounded) { yVel = 8; grounded = false; sfx.jump(); }
  if (e.code === 'Digit1' || e.code === 'Digit2') { const next = e.code === 'Digit1' ? 'RIFLE' : 'SCATTER'; if (next !== cur) { cur = next; WEAPONS.RIFLE.mesh.visible = cur === 'RIFLE'; WEAPONS.SCATTER.mesh.visible = cur === 'SCATTER'; sfx.weaponSwitch(); } }
  if (e.code === 'KeyR' && !dead) { WEAPONS[cur].ammo = WEAPONS[cur].max; sfx.reload(); }
  if (e.code === 'KeyR' && dead) {
    dead = false; health = MAX_HEALTH; score = 0; wave = 0; wavePause = 1.5;
    WEAPONS.RIFLE.ammo = 30; WEAPONS.SCATTER.ammo = 12;
    camera.position.set(0, 1.7, 0);
    while (pickups.length) scene.remove(pickups.pop().mesh);
    over.style.display = 'none';
  }
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', () => {
  if (!ready) return;
  const w = WEAPONS[cur];
  if (document.pointerLockElement !== renderer.domElement || dead || fireCd > 0) return;
  if (w.ammo <= 0) { sfx.emptyClick(); return; }
  w.ammo--;
  fireCd = w.cd;
  (cur === 'SCATTER' ? sfx.shootScatter : sfx.shootRifle)();
  recoil = cur === 'SCATTER' ? 2.4 : 1;
  flash.intensity = 80;
  const hitSet = new Set();
  for (let i = 0, n = cur === 'SCATTER' ? 7 : 1; i < n; i++) {
    ray.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * 0.06 * (n > 1), (Math.random() - 0.5) * 0.06 * (n > 1)), camera);
    const hit = ray.intersectObjects(shootTargets, true)[0];
    if (!hit) continue;
    const s = sentryFromObject(hit.object);
    if (s) {
      if (hitSet.has(s)) continue;
      hitSet.add(s);
      if (--s.hp <= 0) {
        if (s.telegraph) { scene.remove(s.telegraph.mesh); s.telegraph = null; }
        spawnExplosion(s.mesh.position.clone().setY(s.mesh.position.y + 1), 0xff5522, 46, 9);
        sfx.explosion();
        if (Math.random() < 0.4) spawnPickup(s.mesh.position);
        scene.remove(s.mesh); sentries.splice(sentries.indexOf(s), 1);
        onKill(s.mesh.position.clone().setY(s.mesh.position.y + 1.5));
        refreshShootTargets();
      } else {
        flashSentry(s);
        sfx.hitSentry();
        showHitmarker();
        spawnExplosion(hit.point, 0xffcc44, 18, 5);
      }
    } else {
      const ob = obstacleFromObject(hit.object);
      if (ob) ob.traverse((x) => { if (x.isMesh) x.material.color.setHex(0xff3333); });
      spawnExplosion(hit.point, 0xffaa33, 14, 4);
    }
  }
  // Wave cleared → short intermission, then a bigger wave.
  if (!sentries.length && wavePause <= 0) { wavePause = 3; sfx.waveClear(); }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked && !dead) {
    const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 9 : 5;
    const f = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
    const r = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
    moving = (f !== 0 || r !== 0) && grounded;
    stepT -= dt * (speed / 5);
    if (moving && stepT <= 0) { stepT = 0.45; sfx.step(); }
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    camera.position.x = Math.max(-B + 1, Math.min(B - 1, camera.position.x + (-sin * f + cos * r) * speed * dt));
    camera.position.z = Math.max(-B + 1, Math.min(B - 1, camera.position.z + (-cos * f - sin * r) * speed * dt));
    collideCrates(camera.position, 0.45); // player body radius — crates stay solid
    yVel -= 20 * dt;
    camera.position.y += yVel * dt;
    if (camera.position.y <= 1.7) { if (!grounded && yVel < -6) sfx.land(); camera.position.y = 1.7; yVel = 0; grounded = true; }
    // Weapon bob: gentle sway while moving on the ground.
    bobT += dt * (moving ? (keys['ShiftLeft'] || keys['ShiftRight'] ? 11 : 7) : 2);
    const bobAmp = moving ? 0.02 : 0.005;
    WEAPONS[cur].mesh.position.x = 0.25 + Math.sin(bobT) * bobAmp;
    WEAPONS[cur].mesh.position.y = -0.2 + Math.abs(Math.cos(bobT)) * bobAmp * 0.8;
  }
  if (!dead) {
    hurtCd = Math.max(0, hurtCd - dt);
    for (const s of sentries) {
      const dx = camera.position.x - s.mesh.position.x, dz = camera.position.z - s.mesh.position.z;
      const d = Math.hypot(dx, dz) || 1;
      // Face the player with yaw ONLY. Explicit atan2 instead of lookAt: lookAt
      // goes degenerate when the sentry stands exactly on the camera's X/Z and
      // can leave the model flipped upside down / sunk into the floor.
      s.mesh.rotation.set(0, Math.atan2(dx, dz), 0, 'YXZ');
      if (locked) {
        s.mesh.position.x = Math.max(-B + 1, Math.min(B - 1, s.mesh.position.x + dx / d * 1.3 * dt));
        s.mesh.position.z = Math.max(-B + 1, Math.min(B - 1, s.mesh.position.z + dz / d * 1.3 * dt));
        collideCrates(s.mesh.position, 0.6); // sentries slide around crates instead of ghosting through
        // Walk animation: procedural bob+sway (sentry.glb ships without baked clips).
        s.walkT += dt * 6;
        const bob = Math.abs(Math.sin(s.walkT)) * 0.07;
        s.mesh.position.y = (s.mesh.userData.halfHeight || 0) + bob;
        s.mesh.rotation.z = Math.sin(s.walkT) * 0.05; // slight side-to-side swagger (YXZ: roll after yaw)
        if (d < 1.3 && hurtCd <= 0) {
          hurtCd = 1.1; health -= 5; dmgF = 1; sfx.playerHurt();
          if (health <= 0) { dead = true; over.style.display = 'flex'; sfx.gameOver(); document.exitPointerLock(); }
        }
      }
      // --- Enemy laser: telegraph (thin beam) then fire (thick damaging beam) ---
      if (s.telegraph) {
        s.telegraph.t -= dt;
        if (s.telegraph.t <= 0) {
          scene.remove(s.telegraph.mesh);
          const from = s.mesh.position.clone().setY(s.mesh.position.y + 1.4);
          const to = camera.position.clone();
          if (locked && !dead && hasLineOfSight(from, to) && from.distanceTo(to) < 32) {
            const beam = makeBeam(from, to, laserBeamMat.clone(), 0.05);
            scene.add(beam);
            lasers.push({ mesh: beam, life: 0.18 });
            sfx.laserFire();
            spawnExplosion(to.clone().add(new THREE.Vector3(0, -0.3, 0)), 0xff2222, 10, 3);
            health -= 8; dmgF = 1; sfx.playerHurt();
            if (health <= 0) { dead = true; over.style.display = 'flex'; sfx.gameOver(); document.exitPointerLock(); }
          }
          s.telegraph = null;
          s.laserT = 3 + Math.random() * 4;
        }
      } else if (locked) {
        s.laserT -= dt;
        if (s.laserT <= 0 && d > 2.5 && d < 32) {
          const from = s.mesh.position.clone().setY(s.mesh.position.y + 1.4);
          const to = camera.position.clone();
          if (hasLineOfSight(from, to)) {
            const beam = makeBeam(from, to, laserWarnMat.clone(), 0.015);
            scene.add(beam);
            s.telegraph = { mesh: beam, t: 0.7 };
            sfx.laserWarn();
          } else {
            s.laserT = 0.5; // retry soon when cover breaks
          }
        }
      }
    }
    // Fade out active laser beams.
    for (let i = lasers.length - 1; i >= 0; i--) {
      lasers[i].life -= dt;
      lasers[i].mesh.material.opacity = Math.max(0, lasers[i].life / 0.18) * 0.9;
      if (lasers[i].life <= 0) { scene.remove(lasers[i].mesh); lasers.splice(i, 1); }
    }
    updateExplosions(dt);
    updatePickups(dt);
    // Wave intermission countdown.
    if (wavePause > 0) {
      wavePause -= dt;
      if (wavePause <= 0) { wave++; spawnSentries(); }
    }
  }
  dmgF = Math.max(0, dmgF - dt * 2);
  dmgFx.style.opacity = dmgF;
  fireCd = Math.max(0, fireCd - dt);
  recoil = Math.max(0, recoil - dt * 6);
  const w = WEAPONS[cur];
  w.mesh.position.z = w.z + recoil * 0.15;
  flash.intensity = Math.max(0, flash.intensity - dt * 500);
  hud.textContent = 'WAVE ' + Math.max(1, wave) + ' | HEALTH ' + health + ' | SENTRIES ' + sentries.length + ' | SCORE ' + score + ' | ' + cur + ' ' + w.ammo + '/' + w.max + (w.ammo ? '' : ' (R reload)') + ' | [1] rifle [2] scatter';
  hpBar.style.width = Math.max(0, health / MAX_HEALTH * 100) + '%';
  hpBar.style.background = health > 50 ? '#3c4' : health > 25 ? '#ec3' : '#e33';
  waveBanner.style.opacity = wavePause > 0 ? 1 : 0;
  if (wavePause > 0) waveBanner.textContent = wave === 0 ? 'GET READY…' : 'WAVE ' + (wave + 1) + ' INCOMING';
  hitmarkT = Math.max(0, hitmarkT - dt);
  hitmark.style.opacity = hitmarkT > 0 ? 1 : 0;
  comboT = Math.max(0, comboT - dt);
  if (comboT <= 0 && combo > 0) { combo = 0; comboEl.style.opacity = 0; }
  drawRadar();
  renderer.render(scene, camera);
}

// Boot: load only what the first seconds of gameplay need (rifle + first enemy),
// then stream the remaining models in the background so time-to-playable stays low.
Promise.all([loadGLB('sentry'), loadGLB('rifle')]).then(() => {
  buildObstacles();
  buildWeapons();
  wave = 1;
  spawnSentries();
  ready = true;
  progressLabel.textContent = 'LOADING… 100%';
  progressBar.style.width = '100%';
  progressWrap.style.display = 'none';
  playBtn.style.display = 'inline-block';
  // Background load: shotgun + crates swap in seamlessly when ready.
  loadGLB('scatter').then(() => { if (ASSETS.scatter) upgradeScatter(); });
  loadGLB('crate').then(() => { if (ASSETS.crate) upgradeCrates(); });
  // Headless screenshot helpers: ?shot hides the overlay, &yaw=&pitch= preset the camera.
  const qs = new URLSearchParams(location.search);
  if (qs.has('yaw')) yaw = parseFloat(qs.get('yaw')) || 0;
  if (qs.has('pitch')) pitch = Math.max(-1.5, Math.min(1.5, parseFloat(qs.get('pitch')) || 0));
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  if (qs.has('shot')) overlay.style.display = 'none';
  animate();
});
