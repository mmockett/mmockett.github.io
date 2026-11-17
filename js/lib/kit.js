// Small shared helpers for the dioramas.
import * as THREE from "three";

// Bytes loaded so far for each model, keyed by its asset folder (assets/<folder>/...), for the placeholders on the table.
export const loaded = {};
const note = (url, n) => { const m = /assets\/([^/]+)\//.exec(url); if (m) loaded[m[1]] = (loaded[m[1]] || 0) + n; };
export const TEX_BYTES = 1e5;                      // what a texture counts for (an image load gives no byte count)

const texCache = new Map();
const loader = new THREE.TextureLoader();
export function tex(url, { srgb = true, repeat = null, flipY = true } = {}) {
  const key = url + (repeat ? repeat.join("x") : "") + flipY;
  if (texCache.has(key)) return texCache.get(key);
  const t = loader.load(url, () => note(url, TEX_BYTES));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = flipY;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  texCache.set(key, t);
  return t;
}

export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...o });

export function shadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

// A canvas drawn once and used as a texture (labels, legends, CRT text).
export function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.redraw = fn => { fn(g, w, h); t.needsUpdate = true; };
  return t;
}

// Expanding rings on water, from a fixed pool.
export class Ripples {
  constructor(parent, { count = 10, color = "#ffffff", y = 0, opacity = 0.7, width = 0.08 } = {}) {
    this.items = [];
    const geo = new THREE.RingGeometry(1 - width, 1, 48);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
      m.position.y = y; m.visible = false; m.renderOrder = 2;
      parent.add(m);
      this.items.push({ m, t0: -99, size: 0.1, opacity });
    }
    this.i = 0;
  }
  add(x, z, t, size = 0.12) {
    const it = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    it.m.position.x = x; it.m.position.z = z; it.t0 = t; it.size = size; it.m.visible = true;
  }
  update(t) {
    for (const it of this.items) {
      const age = t - it.t0;
      if (age < 0 || age > 2.4) { it.m.visible = false; continue; }
      const s = 0.01 + age * it.size;
      it.m.scale.set(s, 1, s);
      it.m.material.opacity = it.opacity * (1 - age / 2.4) ** 2;
    }
  }
}

export const ease = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const clamp = THREE.MathUtils.clamp;

// Binary assets (models). Where a host can't serve .glb/.bin files, a packed copy of the site sets
// globalThis.PACKED_ASSETS and ships each one as "<file>.js" exporting it in base64.
export async function fetchBinary(url) {
  if (globalThis.PACKED_ASSETS) {
    const b64 = (await import(new URL(url + ".js", location.href).href)).default;
    const s = atob(b64), out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    note(url, out.length);
    return out.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  if (!r.body) { const b = await r.arrayBuffer(); note(url, b.byteLength); return b; }
  // Read it in chunks, counting bytes as they arrive.
  const reader = r.body.getReader(), parts = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); size += value.length; note(url, value.length); }
  const out = new Uint8Array(size); let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out.buffer;
}

// Fonts used inside canvases must be loaded before drawing.
export async function fontsReady(list) {
  try { await Promise.all(list.map(f => document.fonts.load(f))); } catch { /* draw with the fallback */ }
}
