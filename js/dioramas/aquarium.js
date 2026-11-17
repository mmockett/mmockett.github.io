// Spirit Aquarium: a tank on a low plinth, built on SoundPond's diorama floor and the app's own fish species.
// Fish models: the Spirit Aquarium species as SoundPond bakes them (head +Z, length 1, _RIG = body coordinate, tail, fin).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { std, shadows, fetchBinary, tex } from "../lib/kit.js";
import { ambience } from "../lib/sound.js";

const A = "assets/aquarium/";
const W = 2.2, H = 1.25, D = 1.4, Y0 = 0.34;     // tank inside, and its floor's height
const SPECIES = [
  // id, count, length, glow colour
  ["river-spirit", 6, 0.17, "#ffb070"], ["kodama-tetra", 8, 0.1, "#9fe0ff"], ["star-bit-guppy", 7, 0.09, "#ff9aa8"],
  ["sky-spirit", 4, 0.15, "#a9c8ff"], ["rainbow-spirit", 3, 0.15, "#ffe0a0"], ["mossy-carp", 3, 0.21, "#c8f0b0"],
  ["golden-puffer", 2, 0.13, "#ffd060"], ["golden-koi", 2, 0.23, "#ffc070"]
];

const CAUSTIC = `
float causticAt(vec2 p, float t){
  vec2 q = p * 5.0; float c = 0.0;
  for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.3 + t * 0.7), cos(q.x * 1.1 - t * 0.6)); c += abs(sin(q.x) * sin(q.y)); }
  return pow(clamp(1.0 - c / 3.0, 0.0, 1.0), 5.0);
}`;

// Caustics and a water tint on anything inside the tank.
function underwater(mat, T, { caustics = true, tint = 0.35 } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = T;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vCW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\n#ifdef USE_INSTANCING\nvCW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#else\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#endif");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vCW; uniform float uTime;" + CAUSTIC)
      .replace("#include <opaque_fragment>", `
        ${caustics ? "outgoingLight += vec3(0.85, 1.0, 0.95) * causticAt(vCW.xz, uTime) * 0.55 * smoothstep(0.0, 0.6, normal.y + 0.3);" : ""}
        outgoingLight = mix(outgoingLight, vec3(0.16, 0.42, 0.46), ${tint.toFixed(2)});
        #include <opaque_fragment>`);
  };
  return mat;
}

// Swim: a travelling wave down the body, stronger towards the tail (SoundPond's rig coordinates).
function swimming(mat, T) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    prev(sh);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec4 _rig;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float b = _rig.x, tl = clamp(_rig.y, 0.0, 1.0);
        float ph = uTime * 7.0 + float(gl_InstanceID) * 1.93;
        transformed.x += sin(ph - b * 5.5) * (b * b * 0.06 + tl * tl * 0.1) * smoothstep(0.15, 0.45, b);`);
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader;
  };
  return mat;
}

export async function build(ctx) {
  const g = new THREE.Group();
  const { phone, reduced, T } = ctx;

  // Plinth
  const wood = std("#d8d0bc", { roughness: 0.55 });      // PLASM's body colour, like Skim's tray
  const cab = new THREE.Mesh(new RoundedBoxGeometry(W + 0.12, Y0, D + 0.12, 3, 0.03), wood); cab.position.y = Y0 / 2; g.add(cab);
  shadows(g);

  // Water volume: the far walls carry the depth gradient and a little light.
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { uTime: T },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: `uniform float uTime; varying vec3 vP;
      void main(){ float h = vP.y / ${H.toFixed(2)} + .5;
        vec3 c = mix(vec3(${ctx.look === "memory" ? ".42,.68,.78" : ".05,.22,.27"}), vec3(${ctx.look === "memory" ? ".8,.94,.95" : ".36,.66,.70"}), smoothstep(.0, 1.05, h));
        float rays = pow(.5 + .5*sin(vP.x*9. + vP.z*4. + sin(uTime*.3)*1.5), 6.) * smoothstep(.2, 1., h) * .18;
        gl_FragColor = vec4(c + rays, 1.); }`
  }));
  back.position.y = Y0 + H / 2; g.add(back);

  // SoundPond's floor: rocks, driftwood, coral and sand, squeezed a little to fit the tank's depth.
  const gltf = new GLTFLoader();   // the models are stored without meshopt compression, so no decoder is needed
  const floor = (await gltf.parseAsync(await fetchBinary(A + (ctx.look ? "floor-lo.glb" : "floor.glb")), A)).scene;
  floor.traverse(o => { if (o.isMesh) { o.material = underwater(new THREE.MeshStandardMaterial({ map: o.material.map, roughness: 0.95, side: o.material.side }), T, { tint: 0.22 }); o.receiveShadow = true; o.castShadow = !phone; } });
  const rimGrid = fetchBinary(A + "rim.bin");
  // The model at its own size, filling the tank (its depth squeezed a little to fit), as before.
  const fb = new THREE.Box3().setFromObject(floor), fs = (W - 0.04) / (fb.max.x - fb.min.x), fz = (D - 0.04) / (fb.max.z - fb.min.z);
  floor.scale.set(fs, fs, fz);
  const fb2 = new THREE.Box3().setFromObject(floor);
  floor.position.set(-(fb2.min.x + fb2.max.x) / 2, Y0 - fb2.min.y + 0.005, -(fb2.min.z + fb2.max.z) / 2);
  g.add(floor);

  // SoundPond's sea bed: the diorama is an oval, and sand fills the tank around it right up to the glass. Level with
  // the oval's rim where it meets it, rising into low dunes towards the glass, diving out of sight under the model,
  // with its cut face showing through the panes. Same height function as SoundPond (ported from its terrainHeight
  // and rim distance grid), worked in SoundPond's metres and mapped into this tank.
  {
    const RIM = { originX: -20.447, originZ: -20.64, cell: 0.5, cols: 83, rows: 79, sandY: -0.524 };
    const PLACE = { width: 20.9746, y: -0.7125, z: -1.2585 }, TERR = { amplitude: 1.6, ramp: 7, sink: 1.2 };
    const rim = new Float32Array(await rimGrid);
    const sdf = (x, z) => {
      const u = (x - RIM.originX) / RIM.cell, v = (z - RIM.originZ) / RIM.cell;
      const cu = THREE.MathUtils.clamp(u, 0, RIM.cols - 1), cv = THREE.MathUtils.clamp(v, 0, RIM.rows - 1);
      const c0 = Math.min(Math.floor(cu), RIM.cols - 2), r0 = Math.min(Math.floor(cv), RIM.rows - 2), fx = cu - c0, fzz = cv - r0;
      const at = (c, r) => rim[r * RIM.cols + c];
      return (at(c0, r0) * (1 - fx) + at(c0 + 1, r0) * fx) * (1 - fzz) + (at(c0, r0 + 1) * (1 - fx) + at(c0 + 1, r0 + 1) * fx) * fzz + Math.hypot(u - cu, v - cv) * RIM.cell;
    };
    const hash = (ix, iz, seed) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const noise = (x, z, seed) => { const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fq = fade(z - iz);
      return ((hash(ix, iz, seed) * (1 - fx) + hash(ix + 1, iz, seed) * fx) * (1 - fq) + (hash(ix, iz + 1, seed) * (1 - fx) + hash(ix + 1, iz + 1, seed) * fx) * fq) * 2 - 1; };
    const dunes = (x, z) => [[46, 0.55], [19, 0.32], [8.5, 0.13]].reduce((sum, [wl, wt], i) => { const a = 0.55 * i + 0.3;
      return sum + wt * noise((x * Math.cos(a) + z * Math.sin(a)) / wl, (-x * Math.sin(a) + z * Math.cos(a)) / wl, 17 + i * 31); }, 0);
    const ss = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const spHeight = (x, z) => { const d = sdf(x, z); return RIM.sandY + TERR.amplitude * dunes(x, z) * ss(0, TERR.ramp, d) - TERR.sink * ss(0, 2.5, -d); };
    // This tank's (x, z) → SoundPond metres, through the model's frame; and SoundPond's heights back into this tank.
    const ox = floor.position.x, oz = floor.position.z, base = floor.position.y;
    const toSP = (x, z) => [(x - ox) / fs * PLACE.width, (z - oz) / fz * PLACE.width + PLACE.z];
    const toY = h => Math.max(Y0 + 0.002, base + (h - PLACE.y) / PLACE.width * fs);
    const height = (x, z) => toY(spHeight(...toSP(x, z)));

    const GAP = 0.004, x0 = -W / 2 + GAP, x1 = W / 2 - GAP, z0 = -D / 2 + GAP, z1 = D / 2 - GAP, cols = 89, rows = 57;
    const pos = [], uv = [], col = [], idx = [];
    const tile = 0.36 * fs;   // SoundPond tiles its sand every 0.36 model widths
    const vert = (x, y, z, shade) => { pos.push(x, y, z); uv.push(x / tile, z / tile); col.push(shade, shade, shade); return pos.length / 3 - 1; };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = x0 + (x1 - x0) * c / (cols - 1), z = z0 + (z1 - z0) * r / (rows - 1); vert(x, height(x, z), z, 1); }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1; idx.push(a, d, b, b, d, e); }
    // The cut face down each pane, darker than the top, as SoundPond shades it.
    const skirt = (edge, flip) => {
      const start = pos.length / 3;
      edge.forEach(i => { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; vert(x, y, z, 0.62); vert(x, Y0 + 0.001, z, 0.5); });
      for (let k = 0; k < edge.length - 1; k++) { const t0 = start + k * 2, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
        if (flip) idx.push(t0, t1, b0, t1, b1, b0); else idx.push(t0, b0, t1, t1, b0, b1); }
    };
    const along = (n, at) => Array.from({ length: n }, (_, k) => at(k));
    skirt(along(cols, c => c), true); skirt(along(cols, c => (rows - 1) * cols + c), false);
    skirt(along(rows, r => r * cols), false); skirt(along(rows, r => r * cols + cols - 1), true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const sandTex = tex(A + "sand.webp", { repeat: [1, 1] });
    const bed = new THREE.Mesh(geo, underwater(new THREE.MeshStandardMaterial({ map: sandTex, vertexColors: true, roughness: 0.95 }), T, { tint: 0.22 }));
    bed.receiveShadow = true; bed.userData.keepVertexColors = true; g.add(bed);
  }

  // Light shafts
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: T },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform float uTime; varying vec2 vUv; void main(){ float a = smoothstep(0.,.5,vUv.x)*smoothstep(1.,.5,vUv.x) * smoothstep(0.,.9,vUv.y) * (.6+.4*sin(uTime*.7+vUv.x*6.)); gl_FragColor = vec4(vec3(.75,.95,.9)*a*.16, 1.); }"
  });
  const shafts = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.22 + 0.1 * (i % 2), H * 1.05), shaftMat);
    s.position.set(-0.8 + i * 0.4, Y0 + H * 0.5, -0.2 + 0.18 * Math.sin(i * 2.1)); s.rotation.z = 0.22; s.rotation.y = 0.3 * Math.sin(i);
    g.add(s); shafts.push(s);
  }

  // Fish
  const fish = [], meshes = [];
  const loaded = await Promise.all(SPECIES.map(async ([id]) => gltf.parseAsync(await fetchBinary(A + `fish/${id}.glb`), A).catch(() => null)));
  SPECIES.forEach(([id, count, len, glow], si) => {
    const src = loaded[si]; if (!src) return;
    let mesh0 = null; src.scene.traverse(o => { if (o.isMesh && !mesh0) mesh0 = o; });
    const n = phone ? Math.max(1, Math.ceil(count / 2)) : count;
    const mat = swimming(underwater(new THREE.MeshStandardMaterial({ map: mesh0.material.map, roughness: 0.5 }), T, { caustics: false, tint: 0.12 }), T);
    const im = new THREE.InstancedMesh(mesh0.geometry, mat, n);
    im.castShadow = !phone; im.frustumCulled = false;
    g.add(im); meshes.push(im);
    // Each fish keeps its own place around its school's centre, so schools stay loose; about a third are curious
    // and come to the pointer.
    for (let i = 0; i < n; i++) fish.push({ im, i, si, len, glow: new THREE.Color(glow), curious: (i + si) % 3 === 0,
      off: new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5), ph: Math.random() * 6.28,
      p: new THREE.Vector3((Math.random() - 0.5) * 1.6, Y0 + 0.45 + Math.random() * 0.6, (Math.random() - 0.5) * 0.9),
      v: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2), q: new THREE.Quaternion() });
  });
  // Bubbles from an airstone, and food you drop in
  const NB = phone ? 14 : 28, bub = new Float32Array(NB * 3);
  const resetBubble = (i, any) => { bub[i * 3] = -0.88 + Math.random() * 0.04; bub[i * 3 + 1] = Y0 + 0.1 + (any ? Math.random() * H * 0.8 : 0); bub[i * 3 + 2] = -0.52 + Math.random() * 0.04; };
  for (let i = 0; i < NB; i++) resetBubble(i, true);
  const bubGeo = new THREE.BufferGeometry(); bubGeo.setAttribute("position", new THREE.BufferAttribute(bub, 3));
  g.add(new THREE.Points(bubGeo, new THREE.PointsMaterial({ color: "#dff6f4", size: 0.02, transparent: true, opacity: 0.7, depthWrite: false })));
  const food = [], foodGeo = new THREE.BufferGeometry(), foodPos = new Float32Array(24 * 3);
  foodGeo.setAttribute("position", new THREE.BufferAttribute(foodPos, 3)); foodGeo.setDrawRange(0, 0);
  const foodPts = new THREE.Points(foodGeo, new THREE.PointsMaterial({ color: "#e8c27a", size: 0.018, userData: { maxPx: 1 } })); foodPts.frustumCulled = false; g.add(foodPts);

  // Glass, rims and the water's surface
  const glass = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, H, D + 0.02), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }",
    fragmentShader: "varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(vN, vV)), 3.); gl_FragColor = vec4(mix(vec3(.55,.8,.8), vec3(1.), f), .07 + f * .45); }"
  }));
  glass.position.y = Y0 + H / 2; glass.renderOrder = 5; g.add(glass);
  const rimMat = std("#141414", { roughness: 0.4, metalness: 0.3 });
  const edge = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rimMat); m.position.set(x, y, z); m.castShadow = y < Y0 + 0.1; g.add(m); };   // only the bottom rails cast: thin top bars drew a wire outline across the table
  [Y0 + 0.012, Y0 + H].forEach(y => { edge(W + 0.05, 0.03, 0.03, 0, y, (D + 0.02) / 2); edge(W + 0.05, 0.03, 0.03, 0, y, -(D + 0.02) / 2); edge(0.03, 0.03, D + 0.05, (W + 0.02) / 2, y, 0); edge(0.03, 0.03, D + 0.05, -(W + 0.02) / 2, y, 0); });
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => edge(0.025, H, 0.025, sx * (W + 0.02) / 2, Y0 + H / 2, sz * (D + 0.02) / 2));
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: T },
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform float uTime; varying vec2 vP; void main(){ float r = sin(vP.x*23.+uTime*1.3)*sin(vP.y*19.-uTime*1.1) + sin((vP.x+vP.y)*31.+uTime*1.7)*.5; gl_FragColor = vec4(vec3(.8,.97,.95), .16 + .1*smoothstep(.6,1.3,r)); }"
  }));
  surface.rotation.x = -Math.PI / 2; surface.position.y = Y0 + H * 0.94; g.add(surface);
  const hitBox = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshBasicMaterial({ visible: false }));
  hitBox.position.y = Y0 + H / 2; g.add(hitBox);

  const lo = new THREE.Vector3(-W / 2 + 0.12, Y0 + 0.32, -D / 2 + 0.12), hi = new THREE.Vector3(W / 2 - 0.12, Y0 + H * 0.88, D / 2 - 0.12);
  const centres = SPECIES.map(() => new THREE.Vector3()), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), fwd = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3(), dir = new THREE.Vector3();
  let lure = null, lureT = -99;
  function place(f) { f.im.setMatrixAt(f.i, m4.compose(f.p, f.q, sc.setScalar(f.len))); }
  fish.forEach(f => { f.q.setFromUnitVectors(fwd, dir.copy(f.v).normalize()); place(f); });
  meshes.forEach(m => m.instanceMatrix.needsUpdate = true);

  const tank = ambience("assets/sound/aquarium-tank.m4a", 0.38);       // the app's own tank ambience
  return {
    group: g,
    footprint: 1.4,
    view: { fit: 1.28, elev: 12, lookY: 0.9, aspectH: 0.6 },
    hit: [hitBox],
    update(t, dt, focused) {
      tank.set(!!focused);
      if (reduced && this._done) return;
      this._done = true;
      dt = Math.min(dt || 0.016, 0.05);
      centres.forEach((c, k) => c.set(Math.sin(t * 0.17 + k * 1.7) * 0.6, Y0 + 0.62 + Math.sin(t * 0.23 + k * 2.3) * 0.25, Math.cos(t * 0.13 + k * 1.1) * 0.35));
      const lureOn = lure && t - lureT < 2.5;
      for (const f of fish) {
        let target = tmp.copy(centres[f.si]).add(f.off).addScaledVector(f.off, 0.4 * Math.sin(t * 0.21 + f.ph)).clamp(lo, hi);
        const lured = lureOn && f.curious;
        if (food.length) { let best = null, bd = 9; for (const fd of food) { const d = fd.p.distanceTo(f.p); if (d < bd) { bd = d; best = fd; } } if (best) { target = best.p; if (bd < 0.05) best.eaten = true; } }
        else if (lured) target = lure;
        dir.subVectors(target, f.p);
        f.v.addScaledVector(dir, dt * (food.length || lured ? 2.2 : 0.8));
        for (const o of fish) { if (o === f) continue; tmp.subVectors(f.p, o.p); const d = tmp.length(); if (d < 0.16 && d > 1e-4) f.v.addScaledVector(tmp, dt * (0.16 - d) * 24); }
        f.v.x += Math.sin(t * 1.3 + f.i * 2.1 + f.si) * dt * 0.15;
        f.v.multiplyScalar(1 - dt * 0.8);
        const sp = f.v.length(), max = (food.length ? 0.55 : 0.32) * (0.6 + f.len * 2);
        if (sp > max) f.v.multiplyScalar(max / sp);
        f.v.y *= 0.92;
        f.p.addScaledVector(f.v, dt);
        for (const ax of ["x", "y", "z"]) if (f.p[ax] < lo[ax]) { f.p[ax] = lo[ax]; f.v[ax] = Math.abs(f.v[ax]); } else if (f.p[ax] > hi[ax]) { f.p[ax] = hi[ax]; f.v[ax] = -Math.abs(f.v[ax]); }
        if (sp > 0.01) f.q.slerp(new THREE.Quaternion().setFromUnitVectors(fwd, dir.copy(f.v).normalize()), Math.min(1, dt * 4));
        place(f);
      }
      meshes.forEach(m => m.instanceMatrix.needsUpdate = true);
      for (let i = 0; i < NB; i++) { bub[i * 3 + 1] += dt * (0.18 + (i % 3) * 0.05); bub[i * 3] += Math.sin(t * 5 + i) * 0.0008; if (bub[i * 3 + 1] > Y0 + H * 0.93) resetBubble(i, false); }
      bubGeo.attributes.position.needsUpdate = true;
      for (let i = food.length - 1; i >= 0; i--) { const fd = food[i]; fd.p.y = Math.max(Y0 + 0.3, fd.p.y - dt * 0.07); if (fd.eaten || t - fd.t0 > 14) food.splice(i, 1); }
      food.forEach((fd, i) => fd.p.toArray(foodPos, i * 3)); foodGeo.setDrawRange(0, food.length); foodGeo.attributes.position.needsUpdate = true;
      shafts.forEach((s, i) => { s.rotation.z = 0.22 + Math.sin(t * 0.25 + i) * 0.05; });
    },
    pointer(type, hit, t) {
      if (!hit) { lure = null; return; }
      const lp = g.worldToLocal(hit.point.clone());
      lp.z = THREE.MathUtils.clamp(lp.z * 0.2, -0.3, 0.3);
      lp.y = THREE.MathUtils.clamp(lp.y, lo.y, hi.y);
      lure = lp; lureT = t;
      if (type === "click") for (let i = 0; i < 6 && food.length < 24; i++) food.push({ p: new THREE.Vector3(lp.x + (Math.random() - 0.5) * 0.12, Y0 + H * 0.9, (Math.random() - 0.5) * 0.3), t0: t });
    }
  };
}
