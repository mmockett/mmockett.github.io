// PLASM: the Ductwork MK1 console, with a small playable maze in its tray.
// The gel slides until something stops it; wells tint it; only white gets through the exit.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { std, shadows, canvasTex, fontsReady } from "../lib/kit.js";

const CELL = 0.26, N = 5, BOARD_Z = 0.15, TOP = 0.32;
const C = 1, M = 2, Y = 4;
const LEVELS = [
  { walls: ["1,1", "3,1", "1,3", "3,3"], wells: { "2,0": C, "0,2": M, "4,2": Y }, start: [0, 0], exit: [2, 4], label: "PHASE 01 · INTAKE" },
  { walls: ["2,1", "2,2", "0,3", "4,1"], wells: { "4,0": C, "1,4": M, "3,3": Y }, start: [0, 0], exit: [4, 4], label: "PHASE 02 · FILTERS" }
];
const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const WELL_COL = { [C]: "#00c8f0", [M]: "#ff2fb0", [Y]: "#ffd800" };

function slide(L, pos, got, d) {
  let [x, y] = pos, g = got; const [dx, dy] = DIRS[d]; const path = [];
  for (;;) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= N || ny >= N || L.walls.has(nx + "," + ny)) break;
    const isExit = nx === L.exit[0] && ny === L.exit[1];
    if (isExit && g !== 7) break;              // the exit only takes white
    x = nx; y = ny; path.push([x, y]);
    const w = L.wells[x + "," + y]; if (w) g |= w;
    if (isExit) break;
  }
  return { pos: [x, y], got: g, path };
}
function solve(L, start, got0) {
  const key = (p, g) => p + ":" + g, q = [[start, got0, []]], seen = new Set([key(start, got0)]);
  while (q.length) {
    const [p, g, moves] = q.shift();
    if (p[0] === L.exit[0] && p[1] === L.exit[1] && g === 7) return moves;
    for (const d of Object.keys(DIRS)) {
      const r = slide(L, p, g, d); if (!r.path.length) continue;
      const k = key(r.pos, r.got); if (!seen.has(k)) { seen.add(k); q.push([r.pos, r.got, [...moves, d]]); }
    }
  }
  return null;
}
// What the gel looks like after collecting: black, one ink, a mix of two, or white.
function gelColour(got) {
  const cs = [C, M, Y].filter(c => got & c).map(c => new THREE.Color(WELL_COL[c]));
  if (!cs.length) return new THREE.Color("#1a1a1c");
  if (cs.length === 3) return new THREE.Color("#f4f4f0");
  const out = new THREE.Color(0, 0, 0); cs.forEach(c => out.add(c)); out.multiplyScalar(1 / cs.length);
  return cs.length === 2 ? out.lerp(new THREE.Color(1, 1, 1), 0.15) : out;
}

export async function build(ctx) {
  const { reduced } = ctx;
  const paint = ctx.paint || (c => c);          // a look may recolour what changes while playing
  const g = new THREE.Group(), root = new THREE.Group(); root.scale.setScalar(0.88); g.add(root);
  const beige = std("#d8d0bc", { roughness: 0.55 }), beigeDark = std("#c6bda7", { roughness: 0.6 }), ink = std("#0e0d0c", { roughness: 0.7 });
  await fontsReady(["500 40px 'IBM Plex Mono'", "600 40px Inter"]);

  // Casing
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.0, TOP, 2.4, 4, 0.09), beige); base.position.y = TOP / 2; root.add(base);
  // The monitor: a CRT of its own sitting on the console behind the vat, on a low foot, with a deep tapered back,
  // vents on top and a chin with its knobs and power light. Its glass, the vat and the row of keys share one width.
  const VW = N * CELL + 0.2, MZ = -0.62, SY = TOP + 0.64;          // that width, the monitor's front face, the screen's centre
  const foot = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.06, 0.46, 2, 0.02), beigeDark); foot.position.set(0, TOP + 0.03, MZ - 0.36); root.add(foot);
  // Everything above the foot tilts back on it a little, so the screen faces up toward you as you look down on it.
  const PIV = new THREE.Vector3(0, TOP + 0.06, MZ - 0.18), mon = new THREE.Group();
  mon.position.copy(PIV); mon.position.y += 0.012; mon.rotation.x = -0.17; root.add(mon);
  const monAdd = m => { m.position.sub(PIV); mon.add(m); };
  const shell = new THREE.Mesh(new RoundedBoxGeometry(VW + 0.24, 1.1, 0.36, 4, 0.09), beige); shell.position.set(0, TOP + 0.06 + 0.55, MZ - 0.18); monAdd(shell);
  { const box = new RoundedBoxGeometry(VW - 0.04, 0.92, 0.46, 3, 0.07), pa = box.attributes.position;
    for (let i = 0; i < pa.count; i++) { const k = 0.56 + 0.44 * (pa.getZ(i) / 0.46 + 0.5); pa.setX(i, pa.getX(i) * k); pa.setY(i, pa.getY(i) * k); }
    box.computeVertexNormals();
    const rear = new THREE.Mesh(new THREE.BufferGeometry().copy(box), beige); rear.position.set(0, SY + 0.02, MZ - 0.36 - 0.2); monAdd(rear); }
  for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.022), beigeDark); v.position.set(0, TOP + 1.162, MZ - 0.07 - i * 0.034); monAdd(v); }
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(VW, 0.78, 0.05, 3, 0.04), std("#2a2621", { roughness: 0.4 })); bezel.position.set(0, SY, MZ + 0.005); monAdd(bezel);
  [-0.6, -0.48].forEach(x => { const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), beigeDark); kn.rotation.x = Math.PI / 2; kn.position.set(x, TOP + 0.15, MZ + 0.012); monAdd(kn); });
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), new THREE.MeshBasicMaterial({ color: "#7dffb0" })); led.position.set(0.62, TOP + 0.15, MZ + 0.002); monAdd(led);
  const label = (text, w, x, y) => {
    const t = canvasTex(512, 64, (c, cw, ch) => { c.fillStyle = "rgba(0,0,0,0)"; c.clearRect(0, 0, cw, ch); c.font = "500 30px 'IBM Plex Mono', monospace"; c.fillStyle = "#8d856f"; c.letterSpacing = "6px"; c.textBaseline = "middle"; c.fillText(text, 4, ch / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6 }));
    m.position.set(x, y, MZ + 0.003); monAdd(m);
  };
  label("DUCTWORK MK1", 0.46, -0.14, TOP + 0.15);
  label("PLASM LABS INC.", 0.46, 0.34, TOP + 0.15);

  // The CRT: a bulged glass with its text drawn on a canvas, then curved, scanned and glowed in the shader.
  let L = null, got = 0, won = 0;
  const crtTex = canvasTex(1024, 480, () => {});
  function drawCRT() {
    crtTex.userData.redraw((c, w, h) => {
      c.fillStyle = "#06120e"; c.fillRect(0, 0, w, h);
      const grad = c.createLinearGradient(40, 0, 230, 0); grad.addColorStop(0, "#6f7bff"); grad.addColorStop(0.5, "#ff5ab8"); grad.addColorStop(1, "#ffb347");
      c.font = "600 54px Inter, sans-serif"; c.fillStyle = grad; c.fillText("PLASM", 40, 82);
      c.font = "500 24px 'IBM Plex Mono', monospace"; c.fillStyle = "rgba(90,200,150,.45)"; c.fillText("CHROMATERMINAL", 760, 72);
      c.fillStyle = "#57e3a6"; c.font = "500 30px 'IBM Plex Mono', monospace"; c.fillText(L.label, 40, 150);
      c.fillStyle = "rgba(90,200,150,.25)"; c.fillRect(40, 175, w - 80, 2);
      c.fillStyle = "#0b1d17"; c.fillRect(40, 205, w - 80, 86);
      const dots = [["K", 0, "#222"], ["C", C, WELL_COL[C]], ["M", M, WELL_COL[M]], ["Y", Y, WELL_COL[Y]]];
      dots.forEach(([t, bit, col], i) => {
        const x = 150 + i * 190, on = bit ? (got & bit) : got === 0;
        c.beginPath(); c.arc(x, 248, 28, 0, 7); c.fillStyle = on ? col : "rgba(255,255,255,.06)"; c.fill();
        c.lineWidth = 3; c.strokeStyle = on ? "#fff" : "rgba(255,255,255,.25)"; c.stroke();
        c.fillStyle = on && bit ? "#0b1d17" : "rgba(255,255,255,.6)"; c.font = "600 22px Inter"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(t, x, 249); c.textAlign = "left"; c.textBaseline = "alphabetic";
      });
      c.fillStyle = "#ffcf5a"; c.font = "500 24px 'IBM Plex Mono', monospace"; c.fillText(won ? "EXIT OPEN →" : "SWIPE →", 840, 200);
      c.fillStyle = "#8fe8c2"; c.font = "400 26px 'IBM Plex Mono', monospace";
      const lines = won ? ["White. The exit takes it.", "Next phase in a moment."] : ["You slide until something stops you. All three", "wells make white, and white opens the exit."];
      lines.forEach((l, i) => c.fillText(l, 40, 350 + i * 36));
      c.fillStyle = "rgba(143,232,194,.4)"; c.font = "400 20px 'IBM Plex Mono', monospace"; c.fillText("SWIPE THE FLOOR", 40, 440);
    });
  }
  const screenGeo = new THREE.PlaneGeometry(VW - 0.1, 0.66, 40, 20);
  { const pa = screenGeo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i) / ((VW - 0.1) / 2), y = pa.getY(i) / 0.33; pa.setZ(i, 0.035 * (1 - x * x * 0.6) * (1 - y * y * 0.6)); } screenGeo.computeVertexNormals(); }
  const screen = new THREE.Mesh(screenGeo, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: crtTex }, uTime: ctx.T, uFocus: { value: 0 } },
    vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: `uniform sampler2D uMap; uniform float uTime, uFocus; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vec2 q = vUv*2.-1.; q *= 1. + .06*dot(q,q); vec2 uv = q*.5+.5;
        vec3 c = texture2D(uMap, uv).rgb;
        c += texture2D(uMap, uv + vec2(.003, 0.)).rgb * .25;                     // a little bloom along the scan
        c *= .82 + .18*sin(uv.y*480.); c *= .97 + .03*sin(uTime*40.);
        float bar = fract(uv.y*.6 + uTime*.11) - .5; c *= 1. + uFocus*.16*exp(-bar*bar*90.);   // the slow roll of a CRT's refresh
        c *= smoothstep(1.05, .75, max(abs(q.x), abs(q.y)*1.1));
        float f = pow(1. - max(dot(vN, vV), 0.), 3.); c += vec3(.25,.32,.3)*f*.35;   // glass sheen
        gl_FragColor = vec4(c, 1.); }`
  }));
  screen.position.set(0, SY, MZ + 0.03); monAdd(screen);

  // Tray: the duct floor, its beige lip, walls, wells and the exit
  const floorTex = canvasTex(1024, 1024, (c, w, h) => {
    c.fillStyle = "#14110e"; c.fillRect(0, 0, w, h);
    const v = c.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(150,95,30,.45)");
    c.fillStyle = v; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { c.strokeStyle = `rgba(255,220,170,${0.02 + Math.random() * 0.05})`; c.lineWidth = 1; c.beginPath(); const x = Math.random() * w, y = Math.random() * h; c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 12); c.stroke(); }
    c.strokeStyle = "rgba(205,145,60,.55)"; c.lineWidth = 3;
    for (let i = 0; i <= N; i++) { const p = 12 + i * (w - 24) / N; c.beginPath(); c.moveTo(p, 12); c.lineTo(p, h - 12); c.stroke(); c.beginPath(); c.moveTo(12, p); c.lineTo(w - 12, p); c.stroke(); }
  });
  const tray = new THREE.Mesh(new THREE.PlaneGeometry(N * CELL + 0.05, N * CELL + 0.05), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, emissive: "#ffffff", emissiveMap: floorTex, emissiveIntensity: 0.25 }));
  tray.rotation.x = -Math.PI / 2; tray.position.set(0, TOP + 0.002, BOARD_Z); root.add(tray);
  const lipW = N * CELL + 0.2;
  [[0, -lipW / 2 + 0.05, lipW, 0.1], [0, lipW / 2 - 0.05, lipW, 0.1], [-lipW / 2 + 0.05, 0, 0.1, lipW], [lipW / 2 - 0.05, 0, 0.1, lipW]].forEach(([x, z, w, d]) => {
    const lip = new THREE.Mesh(new RoundedBoxGeometry(w, 0.06, d, 2, 0.02), beigeDark); lip.position.set(x, TOP + 0.03, BOARD_Z + z); root.add(lip);
  });
  const cellPos = (x, y) => new THREE.Vector3((x - 2) * CELL, TOP, BOARD_Z + (y - 2) * CELL);
  const levelGroup = new THREE.Group(); root.add(levelGroup);
  const wallGeo = new RoundedBoxGeometry(CELL * 0.96, 0.07, CELL * 0.96, 2, 0.012);
  const wallEdge = new THREE.LineBasicMaterial({ color: "#d4882a", transparent: true, opacity: 0.7 });
  let wellMeshes = {};
  let exitGlow = null;
  function buildLevel(i) {
    levelGroup.clear(); wellMeshes = {};
    const src = LEVELS[i];
    L = { ...src, walls: new Set(src.walls), idx: i };
    for (const k of L.walls) {
      const [x, y] = k.split(",").map(Number), p = cellPos(x, y);
      const w = new THREE.Mesh(wallGeo, ink); w.position.copy(p).add(new THREE.Vector3(0, 0.035, 0)); w.castShadow = true; levelGroup.add(w);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL * 0.96, 0.07, CELL * 0.96)), wallEdge); e.position.copy(w.position); levelGroup.add(e);
    }
    for (const [k, col] of Object.entries(L.wells)) {
      const [x, y] = k.split(",").map(Number), p = cellPos(x, y);
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 32), new THREE.MeshStandardMaterial({ color: WELL_COL[col], emissive: WELL_COL[col], emissiveIntensity: 0.6, roughness: 0.25 }));
      well.position.copy(p).add(new THREE.Vector3(0, 0.006, 0)); levelGroup.add(well); wellMeshes[k] = well;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.008, 8, 40), std("#8b8478", { metalness: 0.6, roughness: 0.35 })); ring.rotation.x = Math.PI / 2; ring.position.copy(well.position); levelGroup.add(ring);
    }
    const ep = cellPos(...L.exit);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.022, 16, 48), std("#b9b6ae", { metalness: 0.85, roughness: 0.25 })); ring.rotation.x = Math.PI / 2; ring.position.copy(ep).add(new THREE.Vector3(0, 0.02, 0)); ring.castShadow = true; levelGroup.add(ring);
    exitGlow = new THREE.Mesh(new THREE.CircleGeometry(0.065, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25 })); exitGlow.rotation.x = -Math.PI / 2; exitGlow.position.copy(ep).add(new THREE.Vector3(0, 0.004, 0)); levelGroup.add(exitGlow);
    ctx.dress?.(levelGroup);
    for (const w of Object.values(wellMeshes)) { w.userData.glow = w.material.emissiveIntensity; w.userData.hitAt = -9; }
    reset();
  }

  // Keys along the front, with their icons printed straight on the key
  const icon = draw => canvasTex(128, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = "#5a5446"; c.fillStyle = "#5a5446"; c.lineWidth = 7; c.lineCap = "round"; c.lineJoin = "round"; draw(c); });
  const ICONS = [
    c => { c.beginPath(); c.arc(64, 70, 26, Math.PI * 1.1, Math.PI * 0.2, false); c.stroke(); c.beginPath(); c.moveTo(34, 42); c.lineTo(36, 62); c.lineTo(56, 58); c.stroke(); },   // undo
    c => { c.beginPath(); c.arc(64, 64, 28, -1.2, 4.6); c.stroke(); c.beginPath(); c.moveTo(80, 30); c.lineTo(86, 46); c.lineTo(70, 50); c.stroke(); },                       // restart
    c => { c.beginPath(); c.arc(64, 54, 22, Math.PI * 0.8, Math.PI * 2.2); c.stroke(); c.beginPath(); c.moveTo(52, 84); c.lineTo(76, 84); c.moveTo(55, 96); c.lineTo(73, 96); c.stroke(); }, // hint
    c => { [[38, 38], [70, 38], [38, 70], [70, 70]].forEach(([x, y]) => c.strokeRect(x, y, 20, 20)); },                                                                     // levels
    c => { [40, 64, 88].forEach((y, i) => { c.beginPath(); c.moveTo(34, y); c.lineTo(94, y); c.stroke(); c.beginPath(); c.arc([52, 80, 60][i], y, 7, 0, 7); c.fill(); }); }     // settings
  ];
  const KG = 0.05, KW = (VW - 4 * KG) / 5;          // five keys spanning the vat's width
  const keys = ICONS.map((draw, i) => {
    const k = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(KW, 0.1, 0.22, 3, 0.035), beigeDark); body.position.y = 0.05; k.add(body);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), new THREE.MeshStandardMaterial({ map: icon(draw), roughness: 0.6, transparent: true, depthWrite: false })); top.rotation.x = -Math.PI / 2; top.position.y = 0.101; k.add(top);
    k.position.set((i - 2) * (KW + KG), TOP - 0.02, 1.02); root.add(k);
    body.userData.key = i; top.userData.key = i; top.userData.print = true; k.userData.press = 0;
    return k;
  });

  // The gel
  const gel = new THREE.Mesh(new THREE.SphereGeometry(0.1, 40, 24), new THREE.MeshPhysicalMaterial({ color: "#1a1a1c", roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, emissive: "#000000" }));
  gel.castShadow = true; gel.material.userData.painted = true; root.add(gel);
  const glowLight = new THREE.PointLight("#ffb050", 0.6, 1.4); glowLight.position.set(0, TOP + 0.35, BOARD_Z); root.add(glowLight);

  // Splashes: thin rings that spread from a well as the gel crosses it, and from the exit when a level is done.
  const ringGeo = new THREE.RingGeometry(0.86, 1, 48); ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.visible = false; m.renderOrder = 3; root.add(m); return { m, t0: -9, size: 0.2, life: 0.6 };
  });
  let ri = 0;
  function splash(p, col, t, { delay = 0, size = 0.2, life = 0.6 } = {}) {
    const r = rings[ri]; ri = (ri + 1) % rings.length;
    r.m.position.set(p.x, TOP + 0.016, p.z); r.m.material.color.copy(paint(new THREE.Color(col))); r.t0 = t + delay; r.size = size; r.life = life;
  }
  let gelHit = -9;

  let pos, history, anim = null, lastUser = -99, autoAt = 1.5, wonAt = -1;
  function reset() { gel.visible = true; pos = [...L.start]; got = 0; won = 0; history = []; anim = null; placeGel(cellPos(...pos), 1); setGel(); drawCRT(); }
  function setGel() { const c = paint(gelColour(got)); gel.material.color.copy(c); gel.material.emissive.copy(c).multiplyScalar(got ? 0.25 : 0); if (exitGlow) exitGlow.material.opacity = got === 7 ? 0.9 : 0.25; }
  function placeGel(p, sq) { gel.position.set(p.x, TOP + 0.1 * sq, p.z); gel.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); }
  function move(d, t, user) {
    if (anim || won) return;
    if (user) lastUser = t;
    const r = slide(L, pos, got, d); if (!r.path.length) { anim = { t0: t, dur: 0.18, from: cellPos(...pos), to: cellPos(...pos), bump: DIRS[d], path: [] }; return; }
    history.push({ pos: [...pos], got });
    anim = { t0: t, dur: 0.1 + r.path.length * 0.075, from: cellPos(...pos), to: cellPos(...r.pos), path: r.path, after: r };
  }
  function press(i, t) {
    keys[i].userData.press = 1;
    if (i === 0 && history.length && !anim) { const h = history.pop(); pos = h.pos; got = h.got; won = 0; placeGel(cellPos(...pos), 1); setGel(); drawCRT(); }
    if (i === 1) reset();
    if (i === 2) { const s = solve(L, pos, got); if (s?.length) move(s[0], t, true); }
    if (i === 3) buildLevel((L.idx + 1) % LEVELS.length);
    lastUser = t;
  }
  buildLevel(0);
  shadows(root); screen.castShadow = false; tray.castShadow = false;
  keys.forEach(k => k.children.forEach(o => { if (o.userData.print) o.castShadow = false; }));

  const hitPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), new THREE.MeshBasicMaterial({ visible: false })); hitPlane.rotation.x = -Math.PI / 2; hitPlane.position.y = TOP + 0.01; root.add(hitPlane);
  const keyHits = keys.flatMap(k => k.children);

  return {
    group: g,
    footprint: 1.35,
    view: { fit: 1.05, elev: 36, lookY: 0.66, aspectH: 1.25 },
    hit: [...keyHits, hitPlane],
    cursor: "grab",
    update(t, dt, focused) {
      const fu = screen.material.uniforms.uFocus; fu.value += ((focused && !reduced ? 1 : 0) - fu.value) * Math.min(1, (dt || 0.016) * 3);
      if (anim) {
        const k = Math.min(1, (t - anim.t0) / anim.dur), e = 1 - Math.pow(1 - k, 3);
        if (anim.bump) { const b = Math.sin(Math.PI * k) * 0.03; placeGel(anim.from.clone().add(new THREE.Vector3(anim.bump[0] * b, 0, anim.bump[1] * b)), 1 - 0.1 * Math.sin(Math.PI * k)); }
        else {
          placeGel(anim.from.clone().lerp(anim.to, e), 1 - 0.12 * Math.sin(Math.PI * k));
          const reached = Math.floor(e * anim.path.length + 0.0001);
          for (let j = anim.seen || 0; j < reached; j++) {
            const key = anim.path[j][0] + "," + anim.path[j][1], w = L.wells[key];
            if (!w) continue;
            // Crossing a well: it flares and splashes its ink, and the gel jolts as it takes the colour.
            wellMeshes[key].userData.hitAt = t; gelHit = t;
            splash(cellPos(...anim.path[j]), WELL_COL[w], t);
            if (!(got & w)) { got |= w; setGel(); drawCRT(); }
          }
          anim.seen = Math.max(anim.seen || 0, reached);
        }
        if (k >= 1) {
          if (anim.after) { pos = anim.after.pos; got = anim.after.got; setGel(); if (pos[0] === L.exit[0] && pos[1] === L.exit[1] && got === 7) {
            won = 1; wonAt = t; drawCRT();
            // Done: the exit flares, the gel drops into it, and rings of all three inks spread from it.
            const ep = cellPos(...L.exit);
            [C, M, Y].forEach((c, i) => splash(ep, WELL_COL[c], t, { delay: 0.35 + i * 0.14, size: 0.55, life: 1.1 }));
            splash(ep, "#ffffff", t, { delay: 0.25, size: 0.3, life: 0.7 });
            Object.values(wellMeshes).forEach((w, i) => { w.userData.hitAt = t + 0.5 + i * 0.12; });
          } }
          anim = null;
        }
      } else if (won && t - wonAt > 2.8) buildLevel((L.idx + 1) % LEVELS.length);
      else if (!won && !reduced && t - lastUser > 6 && t > autoAt) {         // left alone, it plays the level itself
        const s = solve(L, pos, got);
        if (s && s.length) move(s[0], t, false); else reset();
        autoAt = t + 1.1;
      }
      if (won) {
        const k = THREE.MathUtils.clamp((t - wonAt) / 0.55, 0, 1), ep = cellPos(...L.exit);
        const sq = 1 - k * k, bulge = 1 + 0.25 * Math.sin(k * Math.PI);
        gel.position.set(ep.x, TOP + 0.1 * Math.max(sq, 0.05) - k * 0.12, ep.z);
        gel.scale.set(sq * bulge, sq, sq * bulge);
        gel.visible = sq > 0.02;
        if (exitGlow) exitGlow.material.opacity = 0.1 + 0.8 * (1 - Math.min(1, Math.max(0, t - wonAt - 0.6) / 2)) + 0.6 * Math.exp(-Math.abs(t - wonAt - 0.5) * 6);
      } else if (!anim || !anim.bump) {
        if (!anim) gel.scale.set(1, 1, 1);
        const f = t >= gelHit ? Math.exp(-(t - gelHit) * 9) : 0;
        if (f > 0.01) gel.scale.multiply(new THREE.Vector3(1 + 0.22 * f, 1 - 0.25 * f, 1 + 0.22 * f));
        gel.material.emissiveIntensity = 1 + 2.5 * f;
      }
      for (const w of Object.values(wellMeshes)) {
        const a = t - w.userData.hitAt, f = a >= 0 ? Math.exp(-a * 5) : 0;
        w.scale.set(1 + 0.35 * f, 1 + 4 * f, 1 + 0.35 * f); w.material.emissiveIntensity = w.userData.glow * (1 + 2.2 * f);
      }
      for (const r of rings) {
        const a = (t - r.t0) / r.life;
        r.m.visible = a >= 0 && a < 1;
        if (r.m.visible) { const e = 1 - Math.pow(1 - a, 2); r.m.scale.setScalar(0.06 + r.size * e); r.m.material.opacity = 0.9 * (1 - a); }
      }
      keys.forEach(k => { k.userData.press *= 0.85; k.position.y = TOP - 0.02 - k.userData.press * 0.03; });
    },
    pointer(type, hit, t, e, drag) {
      if (type === "click" && hit?.object.userData.key !== undefined) { press(hit.object.userData.key, t); return; }
      if (type === "swipe" && drag) { const { dx, dy } = drag; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"), t, true); return; }
      if (type === "click" && hit) {                                // a tap pushes the gel towards where you tapped
        const lp = root.worldToLocal(hit.point.clone()), gp = gel.position;
        const dx = lp.x - gp.x, dz = lp.z - gp.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.08) move(Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "right" : "left") : (dz > 0 ? "down" : "up"), t, true);
      }
    },
    key(e, t) {
      const d = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" }[e.key];
      if (d) { e.preventDefault(); move(d, t, true); }
      if (e.key === "z" || e.key === "u") press(0, t);
      if (e.key === "r") press(1, t);
    }
  };
}
