// Sound for the models: one AudioContext, woken by the first press on the page (browsers keep it silent until
// then), a small room for the synthesised voices, recorded one-shots, and ambient loops that fade in while their
// model is open and out as you leave it. Sound is never load-bearing: anything that fails is just quiet.
let ac = null, master = null, room = null;
const buffers = new Map();

export function audio() {
  if (!ac) {
    try { ac = new (globalThis.AudioContext || globalThis.webkitAudioContext)(); } catch { return null; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  }
  return ac;
}
export const running = () => !!ac && ac.state === "running";
export function unlock() { const a = audio(); if (a && a.state !== "running") a.resume().catch(() => {}); }
export function out() { audio(); return master; }

// PLASM's room: a second of decaying noise as the impulse, its top rolled off, mixed in at 0.28.
export function roomSend() {
  const a = audio(); if (!a) return null;
  if (!room) {
    const n = Math.floor(a.sampleRate * 1.1), buf = a.createBuffer(2, n, a.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * Math.min(1, t * 40); } }
    room = a.createGain(); room.gain.value = 0.28;
    const conv = a.createConvolver(); conv.buffer = buf;
    const damp = a.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 3200;
    room.connect(conv); conv.connect(damp); damp.connect(master);
  }
  return room;
}

export function load(url) {
  if (!buffers.has(url)) buffers.set(url, fetch(url).then(r => r.arrayBuffer()).then(b => audio()?.decodeAudioData(b)).catch(() => null));
  return buffers.get(url);
}

// A recorded one-shot.
export async function play(url, { gain = 1, rate = 1 } = {}) {
  if (!running()) return;
  const buf = await load(url); if (!buf || !running()) return;
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buf; src.playbackRate.value = rate; g.gain.value = gain;
  src.connect(g).connect(master); src.start();
}

// An ambient loop. set(on) fades it towards its level or to silence; it starts when first wanted and the page
// has been pressed, and stops itself once faded out.
export function ambience(url, level = 0.5) {
  let src = null, g = null, want = false, starting = false;
  const begin = async () => {
    audio(); if (src || starting || !running()) return;
    starting = true; const buf = await load(url); starting = false;
    if (!buf || src || !want || !running()) return;
    g = ac.createGain(); g.gain.value = 0.0001;
    src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(g).connect(master); src.start();
    g.gain.setTargetAtTime(level, ac.currentTime, 0.6);
  };
  return {
    set(on) {
      if (on && !src) { want = true; begin(); return; }
      if (on === want) return;
      want = on;
      if (!src) return;
      const now = ac.currentTime;
      g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      if (on) g.gain.setTargetAtTime(level, now, 0.6);
      else { g.gain.setTargetAtTime(0.0001, now, 0.5); const s = src; setTimeout(() => { if (!want && src === s) { s.stop(); src = null; } }, 3500); }
    }
  };
}

// PLASM's voice: one oscillator, an exponential decay, a gentle low-pass on every note, and a send to the room.
export function tone(f, t = 0.12, type = "sine", vol = 0.15, glideTo = null) {
  if (!running()) return;
  try {
    const now = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f, now);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now + t);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.001, now + t);
    lp.type = "lowpass"; lp.frequency.value = 4200; lp.Q.value = 0.7;
    o.connect(g).connect(lp); lp.connect(master); const r = roomSend(); if (r) lp.connect(r);
    o.start(now); o.stop(now + t + 0.02);
  } catch { /* quiet */ }
}
