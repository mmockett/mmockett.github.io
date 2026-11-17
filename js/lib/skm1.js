// Reader for Skim's baked mesh format (SKM1), so the game's own props load here unchanged.
//   'SKM1' | uint32 json length | json | buffers   (writer: skim/tools/bake/meshbin.ts)
import * as THREE from "three";
import { fetchBinary } from "./kit.js";

const KINDS = { f32: Float32Array, u32: Uint32Array, u16: Uint16Array, i16: Int16Array, u8: Uint8Array, i8: Int8Array };

export async function loadSKM1(url) {
  const buf = await fetchBinary(url);
  const n = new DataView(buf).getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  const base = 8 + n, arrays = {};
  for (const [name, a] of Object.entries(head.arrays)) {
    arrays[name] = { ...a, data: new KINDS[a.kind](buf, base + a.offset, a.count * a.itemSize) };
  }
  return { arrays, meta: head.meta || {} };
}

// A BufferGeometry in metres. Quantised positions are scaled back by meta.scale.
export function skmGeometry(skm, { index = "index" } = {}) {
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(skm.arrays)) {
    if (name === "index" || name === "indexFar" || name === "crown") continue;
    const attr = new THREE.BufferAttribute(a.data, a.itemSize, a.normalized);
    g.setAttribute(name === "colour" ? "color" : name, attr);
  }
  g.setIndex(new THREE.BufferAttribute(skm.arrays[index].data, 1));
  const p = skm.arrays.position;
  g.userData.unit = p.kind === "i16" && p.normalized ? (skm.meta.scale || 1) : 1;
  return g;
}

// Split a geometry's triangles into two groups by a per-vertex test (the cherry's bark and blossom cards).
export function splitGroups(g, test) {
  const idx = g.index.array, a = [], b = [];
  for (let i = 0; i < idx.length; i += 3) (test(idx[i]) ? b : a).push(idx[i], idx[i + 1], idx[i + 2]);
  const out = new (idx.length > 65535 || g.attributes.position.count > 65535 ? Uint32Array : Uint16Array)(a.length + b.length);
  out.set(a); out.set(b, a.length);
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.clearGroups(); g.addGroup(0, a.length, 0); g.addGroup(a.length, b.length, 1);
  return g;
}
