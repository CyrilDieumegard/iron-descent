// Procedural WebAudio sound engine — zero audio assets, everything synthesized.
// The AudioContext is created lazily on first user gesture (pointer-lock click)
// to satisfy browser autoplay policies.

let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

function noiseBuffer(seconds = 0.5) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// Short burst of filtered noise — base for gunshots and explosions.
function noiseBurst({ duration = 0.15, freq = 1200, q = 0.8, gain = 1, decay = 12 }) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * (1 + decay / 20));
  src.connect(filter).connect(g).connect(master);
  src.start();
}

// Oscillator blip with pitch slide — laser, UI, pickups.
function tone({ type = 'square', from = 440, to = from, duration = 0.1, gain = 0.5 }) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), ctx.currentTime + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export const sfx = {
  shootRifle()   { noiseBurst({ duration: 0.08, freq: 2500, gain: 0.9 }); tone({ type: 'square', from: 900, to: 200, duration: 0.06, gain: 0.25 }); },
  shootScatter() { noiseBurst({ duration: 0.22, freq: 1400, gain: 1.2 }); tone({ type: 'sawtooth', from: 300, to: 60, duration: 0.18, gain: 0.35 }); },
  explosion()    { noiseBurst({ duration: 0.6, freq: 500, gain: 1.4, decay: 20 }); tone({ type: 'sine', from: 120, to: 30, duration: 0.5, gain: 0.6 }); },
  hitSentry()    { tone({ type: 'square', from: 1400, to: 900, duration: 0.05, gain: 0.3 }); },
  laserWarn()    { tone({ type: 'sawtooth', from: 200, to: 800, duration: 0.5, gain: 0.12 }); },
  laserFire()    { tone({ type: 'sawtooth', from: 1800, to: 300, duration: 0.15, gain: 0.4 }); noiseBurst({ duration: 0.1, freq: 3000, gain: 0.4 }); },
  playerHurt()   { tone({ type: 'sine', from: 220, to: 80, duration: 0.25, gain: 0.7 }); noiseBurst({ duration: 0.15, freq: 300, gain: 0.5 }); },
  reload()       { tone({ type: 'square', from: 500, to: 500, duration: 0.04, gain: 0.25 }); setTimeout(() => tone({ type: 'square', from: 800, to: 800, duration: 0.04, gain: 0.25 }), 120); },
  weaponSwitch() { tone({ type: 'square', from: 600, to: 900, duration: 0.05, gain: 0.2 }); },
  emptyClick()   { tone({ type: 'square', from: 1200, to: 1000, duration: 0.03, gain: 0.15 }); },
  pickup()       { tone({ type: 'sine', from: 600, to: 1200, duration: 0.12, gain: 0.35 }); setTimeout(() => tone({ type: 'sine', from: 900, to: 1800, duration: 0.1, gain: 0.25 }), 80); },
  waveClear()    { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ type: 'square', from: f, to: f, duration: 0.15, gain: 0.3 }), i * 120)); },
  gameOver()     { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => tone({ type: 'sawtooth', from: f, to: f * 0.9, duration: 0.3, gain: 0.35 }), i * 200)); },
  jump()         { tone({ type: 'sine', from: 200, to: 400, duration: 0.08, gain: 0.15 }); },
  step()         { noiseBurst({ duration: 0.04, freq: 350, gain: 0.12 }); },
  land()         { noiseBurst({ duration: 0.1, freq: 250, gain: 0.3 }); tone({ type: 'sine', from: 120, to: 60, duration: 0.1, gain: 0.25 }); },
  combo(n)       { tone({ type: 'square', from: 500 + n * 100, to: 800 + n * 150, duration: 0.12, gain: 0.3 }); },
};
