// OP–XY: my own model of the device, laid out from teenage engineering's published layout diagram (a 17 × 6 grid of
// ~15.5 mm keys on a 288 × 102 × 29 mm body).
// The screen plays the real screen recordings of the instruments. The keys play notes; the encoders shape them.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { std, canvasTex, fontsReady } from "../lib/kit.js";

const DW = 731, DD = 262;                 // the diagram's outline, in its own units
const W = 2.5, U = W / DW, D = DD * U;    // world size of the body
const H = 29 / 288 * W;                   // its thickness
const BASE = 0.002;                       // the body sits on the table
const TOPY = BASE + H;
const X = dx => (dx - DW / 2) * U, Z = dy => (dy - DD / 2) * U;
const cc = (c, r) => [12 + 39.8 * (c + 0.5), 12 + 39.8 * (r + 0.5)];

// Every key: its centre in diagram units, what's printed on it, and a note if it's on the keyboard.
function keyList() {
  const k = [];
  ["~", "◐", "▤", "≡"].forEach((g, c) => k.push({ at: cc(c, 2), g }));
  [1, 2, 3, 4].forEach((n, i) => k.push({ at: cc(4 + i, 2), g: String(n) }));
  for (let i = 0; i < 8; i++) k.push({ at: cc(8 + i, 2), g: String(i + 1), small: true });
  k.push({ at: cc(16, 2), g: "⋯" });
  for (let i = 0; i < 16; i++) k.push({ at: cc(i, 3), g: "", step: true, shade: i >> 2 });   // four of each shade, dark to light
  k.push({ at: cc(16, 3), g: "▭" });
  [["●", "#ff4a3d"], ["▶"], ["■"]].forEach(([g, col], c) => k.push({ at: cc(c, 4), g, col }));
  // The black keys share out the row above the white keys with no gaps: each run of two or three between the
  // breaks (E–F, B–C) splits its run's width evenly. An embossed circle on each marks where its note falls,
  // between the two white keys below, so it sits to one side of the key or in its middle.
  const blackSemis = [1, 3, 5, 8, 10, 13, 15, 17, 20, 22], runs = [[3, 4, 3], [7, 3, 2], [10, 4, 3], [14, 3, 2]];   // [first column, columns, keys]
  let bi = 0;
  for (const [c0, cols, n] of runs) for (let j = 0; j < n; j++, bi++) {
    const left = 12 + 39.8 * c0, w = 39.8 * cols / n, y = cc(0, 4)[1];
    k.push({ at: [left + w * (j + 0.5), y], w: (w - 5.8) / 34, mark: [12 + 39.8 * (c0 + j + 1), y], g: String((bi + 1) % 10), note: blackSemis[bi], dot: true });
  }
  ["−", "+", "shift"].forEach((g, c) => k.push({ at: cc(c, 5), g }));
  const whiteSemis = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19, 21, 23];
  whiteSemis.forEach((s, i) => k.push({ at: cc(3 + i, 5), g: "", note: s }));
  k.push({ at: cc(2, 1), g: "▢" }, { at: cc(3, 1), g: "♩" }, { at: cc(16, 0), g: "◉" }, { at: cc(16, 1), g: "com" });
  return k;   // 68 keys
}

export async function build(ctx) {
  const { reduced, phone, project } = ctx;
  // The four shades the device uses for its encoders and its step keys (in pairs, dark to light, twice across the
  // sixteen): greys on the black body, or four purples on the pastel one, which keeps it all one colour.
  const soft = ctx.look === "memory";
  const SHADES = soft ? ["#5f4b9e", "#806cc4", "#ab9be3", "#e4dcfa"] : ["#3a3a3a", "#787878", "#b7b7b7", "#efefef"];
  const KEY = soft ? "#9b88d8" : "#1c1c1c";
  await fontsReady(["400 64px 'IBM Plex Mono'", "500 64px Inter"]);
  const g = new THREE.Group();

  // Body: black anodised aluminium
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 5, 0.035), new THREE.MeshStandardMaterial({ color: "#121212", metalness: 0.55, roughness: 0.38 }));
  body.position.y = BASE + H / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
  // Keys: one instanced body, one instanced legend (each key reads its own cell of a drawn atlas)
  const keys = keyList(), NK = keys.length, COLS = 16, CELLPX = 128;
  const atlas = canvasTex(COLS * CELLPX, Math.ceil(NK / COLS) * CELLPX, (c) => {
    keys.forEach((k, i) => {
      const x = (i % COLS) * CELLPX + CELLPX / 2, y = Math.floor(i / COLS) * CELLPX + CELLPX / 2;
      c.strokeStyle = "rgba(235,235,235,.85)"; c.lineWidth = 2.5;
      if (k.dot) {   // the embossed circle, drawn at the note's place (its legend sits there, not at the key's centre)
        c.fillStyle = "rgba(235,235,235,.22)"; c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill(); c.stroke();
        c.fillStyle = "rgba(240,240,240,.92)"; c.font = "400 30px 'IBM Plex Mono', monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(k.g, x, y + 2);
        return;
      }
      if (k.shade >= 2) c.strokeStyle = "rgba(40,30,70,.55)";   // dark print on the pale step keys
      c.beginPath(); c.arc(x, y, k.step ? 34 : 40, 0, 7); c.stroke();
      if (k.g) { c.fillStyle = k.col || "rgba(240,240,240,.92)"; c.font = `${k.g.length > 1 ? "400 26px" : k.small ? "400 30px" : "400 40px"} 'IBM Plex Mono', monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(k.g, x, y + 2); }
    });
  });
  const KS = 34 * U, KH = 0.024;
  const keyMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(KS, KH, KS, 2, 0.011), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.1 }), NK);
  keys.forEach((k, i) => keyMesh.setColorAt(i, new THREE.Color(k.shade !== undefined ? SHADES[k.shade] : KEY)));
  const legendGeo = new THREE.PlaneGeometry(KS * 0.86, KS * 0.86); legendGeo.rotateX(-Math.PI / 2);
  const rect = new Float32Array(NK * 4);
  keys.forEach((k, i) => { rect.set([(i % COLS) / COLS, 1 - (Math.floor(i / COLS) + 1) / Math.ceil(NK / COLS), 1 / COLS, 1 / Math.ceil(NK / COLS)], i * 4); });
  legendGeo.setAttribute("aRect", new THREE.InstancedBufferAttribute(rect, 4));
  const legend = new THREE.InstancedMesh(legendGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uMap: { value: atlas }, uLit: { value: new Float32Array(NK) } },
    vertexShader: "attribute vec4 aRect; varying vec2 vUv; void main(){ vUv = aRect.xy + uv * aRect.zw; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }",
    fragmentShader: "uniform sampler2D uMap; varying vec2 vUv; void main(){ vec4 t = texture2D(uMap, vUv); gl_FragColor = vec4(t.rgb, t.a); }"
  }), NK);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), wide = new THREE.Vector3(), p = new THREE.Vector3();
  const press = new Float32Array(NK);
  function placeKey(i) {
    const k = keys[i], y = TOPY + KH / 2 - press[i] * 0.012, at = k.mark || k.at;
    keyMesh.setMatrixAt(i, m4.compose(p.set(X(k.at[0]), y, Z(k.at[1])), q, wide.set(k.w || 1, 1, 1)));
    legend.setMatrixAt(i, m4.compose(p.set(X(at[0]), y + KH / 2 + 0.0008, Z(at[1])), q, one));
  }
  for (let i = 0; i < NK; i++) placeKey(i);
  keyMesh.castShadow = true; g.add(keyMesh, legend);

  // Screen: the real recordings, one instrument after another
  const sx0 = 175, sx1 = 327, sy0 = 18, sy1 = 86;
  const glassFrame = new THREE.Mesh(new THREE.BoxGeometry((sx1 - sx0 + 10) * U, 0.004, (sy1 - sy0 + 10) * U), std("#050505", { roughness: 0.15, metalness: 0.2 }));
  glassFrame.position.set(X((sx0 + sx1) / 2), TOPY + 0.001, Z((sy0 + sy1) / 2)); g.add(glassFrame);
  const screens = project.screens || ["media/opxy-nexus.mp4"];
  let screenTex;
  if (reduced) screenTex = new THREE.TextureLoader().load(screens[0].replace(".mp4", ".jpg"));
  else {
    const vid = document.createElement("video");
    Object.assign(vid, { muted: true, playsInline: true, crossOrigin: "anonymous", preload: "auto" });
    let si = 0; vid.src = screens[0];
    vid.addEventListener("ended", () => { si = (si + 1) % screens.length; vid.src = screens[si]; vid.play().catch(() => {}); });
    vid.play().catch(() => {});
    screenTex = new THREE.VideoTexture(vid);
  }
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry((sx1 - sx0) * U, (sy1 - sy0) * U), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  scr.rotation.x = -Math.PI / 2; scr.position.set(X((sx0 + sx1) / 2), TOPY + 0.0035, Z((sy0 + sy1) / 2)); g.add(scr);

  // Speaker grille and volume
  const grille = canvasTex(256, 256, (c, w, h) => { c.clearRect(0, 0, w, h); for (let i = 0; i < 11; i++) for (let j = 0; j < 11; j++) { c.beginPath(); c.arc(18 + i * 22, 18 + j * 22, 5.5, 0, 7); c.fillStyle = "#000"; c.fill(); c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 1.2; c.stroke(); } });
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(64 * U, 64 * U), new THREE.MeshBasicMaterial({ map: grille, transparent: true, toneMapped: false }));
  gr.rotation.x = -Math.PI / 2; gr.position.set(X(52), TOPY + 0.001, Z(52)); g.add(gr);
  const vol = new THREE.Mesh(new THREE.CylinderGeometry(13 * U, 13 * U, 0.03, 32), std("#161616", { metalness: 0.4, roughness: 0.4 })); vol.position.set(X(cc(2, 1)[0] - 17 + 13), TOPY + 0.015, Z(31.9)); vol.castShadow = true; g.add(vol);   // its left edge in line with the key below

  // Encoders: the four shades, dark to light, knurled
  const ENC_X = [370, 450, 529, 609], ENC_COL = SHADES;
  const ER = 14 * U, EH = 0.05;              // about the size of the volume knob, as on the device
  const encGeo = new THREE.CylinderGeometry(ER, ER, EH, 72, 1);
  { const pa = encGeo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), r = Math.hypot(x, z); if (r > ER * 0.98) { const a = Math.atan2(z, x), k = 1 + 0.04 * Math.sign(Math.sin(a * 24)); pa.setX(i, x * k); pa.setZ(i, z * k); } } encGeo.computeVertexNormals(); }
  const encs = ENC_X.map((x, i) => {
    const e = new THREE.Group();
    const m = new THREE.Mesh(encGeo, std(ENC_COL[i], { roughness: 0.45, metalness: 0.15 })); m.position.y = EH / 2; m.castShadow = true; e.add(m);
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 10 * U), new THREE.MeshBasicMaterial({ color: i < 2 ? "#e8e8e8" : "#111" })); notch.position.set(0, EH + 0.0015, -5 * U); e.add(notch);
    e.position.set(X(x), TOPY, Z(51.8)); g.add(e);
    m.userData.enc = i; notch.userData.enc = i; e.userData.value = [0.55, 0.25, 0.4, 0.7][i]; e.rotation.y = -e.userData.value * 4.5 + 2.25;
    return e;
  });

  // Sides: pitch bend on the front edge; jacks, USB-C and the power switch on the right
  const bend = new THREE.Mesh(new RoundedBoxGeometry(80 * U, H * 0.32, 0.01, 2, 0.004), std("#2a2a2a", { roughness: 0.6 })); bend.position.set(X(92), BASE + H * 0.5, D / 2 + 0.003); g.add(bend);
  const jackMat = std("#050505"), ringMat = new THREE.MeshStandardMaterial({ color: "#bdbdbd", metalness: 0.9, roughness: 0.3 });
  [-0.28, -0.14, 0.0, 0.14, 0.28].forEach((z, i) => {
    if (i === 1) { const usb = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.028, 0.075, 2, 0.012), jackMat); usb.position.set(W / 2 + 0.001, BASE + H * 0.5, z); g.add(usb); return; }
    const j = new THREE.Mesh(new THREE.CircleGeometry(0.018, 24), jackMat); j.rotation.y = Math.PI / 2; j.position.set(W / 2 + 0.002, BASE + H * 0.5, z); g.add(j);
    const r = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.024, 24), ringMat); r.rotation.y = Math.PI / 2; r.position.copy(j.position).add(new THREE.Vector3(0.0005, 0, 0)); g.add(r);
  });
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.05), std("#7a7a7a", { metalness: 0.6 })); sw.position.set(W / 2 + 0.003, BASE + H * 0.5, -0.4); g.add(sw);

  // Sound: a small two-oscillator voice, shaped by the encoders
  let ac = null;
  function voice(semi, t) {
    try {
      ac = ac || new AudioContext();
      const now = ac.currentTime, f = 174.61 * Math.pow(2, semi / 12);
      const [cut, res, dec, lvl] = encs.map(e => e.userData.value);
      const out = ac.createGain(), filt = ac.createBiquadFilter();
      filt.type = "lowpass"; filt.Q.value = 0.5 + res * 14;
      filt.frequency.setValueAtTime(300 + cut * 6000, now); filt.frequency.exponentialRampToValueAtTime(200 + cut * 900, now + 0.2 + dec * 1.2);
      out.gain.setValueAtTime(0.0001, now); out.gain.exponentialRampToValueAtTime(0.18 * lvl + 0.02, now + 0.008); out.gain.exponentialRampToValueAtTime(0.0001, now + 0.25 + dec * 1.8);
      [-6, 6].forEach(det => { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det; o.connect(filt); o.start(now); o.stop(now + 0.3 + dec * 1.9); });
      filt.connect(out).connect(ac.destination);
    } catch { /* no audio: the keys still move */ }
  }

  body.material.userData.pastel = "#bba9ea";
  keyMesh.material.userData.pastel = "#ffffff";
  vol.material.userData.pastel = "#806cc4";
  encs.forEach((e, i) => { e.children[0].material.userData.pastel = SHADES[i]; });

  // While it's the one you're looking at, a playhead walks the sixteen steps (sixteenths at 120 BPM): the step
  // under it dips and swaps to the far end of the shades, the way a lit step reads on the device.
  const steps = keys.map((k, i) => (k.step ? i : -1)).filter(i => i >= 0);
  const stepCol = steps.map(i => new THREE.Color(SHADES[keys[i].shade]));
  const lit = steps.map(i => new THREE.Color(keys[i].shade >= 2 ? SHADES[0] : "#ffffff"));
  const cTmp = new THREE.Color();
  let playAmp = 0, playAt = -1;

  let dragEnc = null, dragStart = 0;
  return {
    group: g,
    footprint: 1.3,
    view: { fit: 1.36, elev: 52, lookY: 0.05, aspectH: 0.5 },
    hit: [keyMesh, ...encs.flatMap(e => e.children), body],
    update(t, dt, focused) {
      playAmp += ((focused && !reduced ? 1 : 0) - playAmp) * Math.min(1, (dt || 0.016) * 4);
      const at = playAmp > 0.01 ? Math.floor(t * 8) % 16 : -1;
      if (at !== playAt || (playAmp > 0.01 && playAmp < 0.99)) {
        steps.forEach((i, j) => keyMesh.setColorAt(i, cTmp.copy(stepCol[j]).lerp(lit[j], j === at ? 0.55 * playAmp : 0)));
        keyMesh.instanceColor.needsUpdate = true;
        if (at >= 0 && at !== playAt) press[steps[at]] = Math.max(press[steps[at]], 0.45 * playAmp);
        playAt = at;
      }
      for (let i = 0; i < NK; i++) if (press[i] > 0.001) { press[i] *= 0.82; placeKey(i); }
      keyMesh.instanceMatrix.needsUpdate = true; legend.instanceMatrix.needsUpdate = true;
    },
    pointer(type, hit, t, e, drag) {
      if (type === "down" && hit?.object.userData.enc !== undefined) { dragEnc = encs[hit.object.userData.enc]; dragStart = dragEnc.userData.value; return; }
      if (type === "drag" && dragEnc && drag) { const v = THREE.MathUtils.clamp(dragStart - drag.dy / 200, 0, 1); dragEnc.userData.value = v; dragEnc.rotation.y = -v * 4.5 + 2.25; return; }
      if (type === "swipe" || type === "up") { dragEnc = null; return; }
      if (type === "click") {
        dragEnc = null;
        if (hit?.object === keyMesh && hit.instanceId !== undefined) {
          const k = keys[hit.instanceId]; press[hit.instanceId] = 1; placeKey(hit.instanceId);
          if (k.note !== undefined) voice(k.note, t);       // only the keyboard plays; the other keys just press
        } else if (hit?.object.userData.enc !== undefined) { const en = encs[hit.object.userData.enc]; en.userData.value = (en.userData.value + 0.1) % 1; en.rotation.y = -en.userData.value * 4.5 + 2.25; }
      }
    }
  };
}
