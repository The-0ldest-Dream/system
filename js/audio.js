// Web Audio SFX + optional ambient. Off by default for music.
let ctx = null;
let ambientNodes = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.08, when = 0, endFreq) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

export const sfx = {
  click()     { tone(880, 0.05, 'sine', 0.06, 0, 620); },
  complete()  { tone(660, 0.14, 'sine', 0.09); tone(990, 0.22, 'sine', 0.08, 0.09); },
  rankUp()    { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.11, i * 0.11)); },
  glitch()    { for (let i = 0; i < 4; i++) tone(260 - i * 30, 0.09, 'sawtooth', 0.06, i * 0.06, 70); },
  penalty()   { tone(140, 0.35, 'square', 0.07, 0, 90); tone(140, 0.35, 'square', 0.07, 0.42, 90); },
  point()     { tone(740, 0.07, 'sine', 0.07, 0, 980); },
  bossOn()    { tone(220, 0.12, 'sawtooth', 0.09, 0, 330); tone(165, 0.1, 'square', 0.06, 0.06); },
  theme()     { tone(440, 0.4, 'sine', 0.08, 0, 880); },
  dayDone()   { tone(659, 0.18, 'sine', 0.09); tone(880, 0.22, 'sine', 0.08, 0.1); },
  treeTap()   { tone(392, 0.22, 'sine', 0.08, 0, 523); },
  unlock()    { [660, 880, 1320].forEach((f, i) => tone(f, 0.2, 'triangle', 0.09, i * 0.08)); },
  fail()      { tone(220, 0.4, 'square', 0.08, 0, 110); },
};

// Ambient: soft A-minor pad + 16 Hz binaural beat (needs headphones).
export function startAmbient() {
  if (ambientNodes) return;
  const c = getCtx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.5, c.currentTime + 4);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -22; comp.knee.value = 24; comp.ratio.value = 3;
  const warm = c.createBiquadFilter();
  warm.type = 'lowpass'; warm.frequency.value = 2200; warm.Q.value = 0.5;
  warm.connect(comp); comp.connect(master); master.connect(c.destination);
  const all = [];
  const osc = (f, g, dest, ch) => {
    const o = c.createOscillator(), a = c.createGain();
    o.type = 'sine'; o.frequency.value = f; a.gain.value = g;
    o.connect(a); a.connect(dest, 0, ch || 0); all.push(o); return o;
  };
  const merger = c.createChannelMerger(2); merger.connect(warm);
  osc(220, 0.28, merger, 0); const r1 = osc(236, 0.28, merger, 1);
  osc(440, 0.10, merger, 0); const r2 = osc(456, 0.10, merger, 1);
  const drift = c.createOscillator(); drift.frequency.value = 0.03; all.push(drift);
  const dg = c.createGain(); dg.gain.value = 2.5;
  drift.connect(dg); dg.connect(r1.frequency); dg.connect(r2.frequency);
  [110, 261.63, 329.63, 440].forEach(f => { osc(f, 0.05, warm); osc(f * 1.002, 0.05, warm); });
  all.forEach(o => o.start());
  ambientNodes = { master, all };
}

export function stopAmbient() {
  if (!ambientNodes) return;
  const c = getCtx();
  const { master, all } = ambientNodes;
  ambientNodes = null;
  if (!c) return;
  master.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
  setTimeout(() => { all.forEach(o => { try { o.stop(); } catch {} }); }, 1500);
}