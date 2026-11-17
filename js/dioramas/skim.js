// Skim: Lake Ashi in miniature, built from the game's own props.
//   torii   "Hakone Torii" by ling79399 (CC BY 4.0), as Skim bakes it
//   cherry  "Cherry Blossom Trees" by Jagobo (CC BY 4.0), Skim's hero cherry
//   lilies  "Low Poly Lily Pad" by Logan S. and "Lily Blossom" by Aron Mimietz (CC BY 4.0)
//   water   Skim's wave normals (Platinguin's Godot water prototype, MIT); stones and moss from ambientCG / Poly Haven (CC0)
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { loadSKM1, skmGeometry, splitGroups } from "../lib/skm1.js";
import { tex, std, shadows } from "../lib/kit.js";
import { play, ambience } from "../lib/sound.js";

const A = "assets/skim/";
const Y_W = 0.40;      // water level
const RIM = 1.36;

function lathe(points, segs, mat, phiStart = 0, phiLength = Math.PI * 2) {
  // Profiles here run outward; reversed, the faces point up (outward-running ones faced down and were culled from above).
  const g = new THREE.LatheGeometry(points.slice().reverse().map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength);
  return new THREE.Mesh(g, mat);
}

export async function build(ctx) {
  const g = new THREE.Group();
  const { phone, reduced } = ctx;

  // Land: a tray in PLASM's body colour (the same beige as the console and the aquarium's plinth), a shingle beach
  // running down under the water, and the lake bed.
  const BEIGE = "#d8d0bc", tray = std(BEIGE, { roughness: 0.55 });
  const sides = new THREE.Mesh(new THREE.CylinderGeometry(RIM, RIM - 0.04, 0.5, 96, 1, true), tray);
  sides.position.y = 0.25; g.add(sides);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(RIM - 0.04, 64), tray); bottom.rotation.x = Math.PI / 2; bottom.position.y = 0.001; g.add(bottom);
  // The rim's top is turf: a ground in the grass's own middle green, with the blades (below) standing on it.
  const TURF = "#5e8a3c";
  g.add(lathe([[1.1, 0.48], [1.2, 0.5], [RIM, 0.5]], 128, std(TURF, { roughness: 1 })));
  const shingle = new THREE.MeshStandardMaterial({ map: tex(A + "shingle_albedo.jpg", { repeat: [18, 1.5] }), roughness: 0.9 });
  g.add(lathe([[0.86, 0.3], [0.98, Y_W - 0.01], [1.04, Y_W + 0.035], [1.1, 0.48]], 96, shingle));
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), std("#3c4a40")); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.3; g.add(bed);

  // The hills behind the lake, wooded with sugi.
  // A brighter moss green that feathers into the turf where the hill ends, instead of stopping at a line.
  const forest = new THREE.MeshStandardMaterial({ map: tex(A + "moss_albedo.jpg", { repeat: [8, 2] }), color: "#a3c46e", roughness: 1, side: THREE.DoubleSide });
  forest.onBeforeCompile = sh => {
    sh.uniforms.uTray = { value: new THREE.Color(TURF) };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aFade; varying float vFade;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uTray; varying float vFade;")
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = mix(uTray, diffuseColor.rgb, vFade);");
  };
  // Its ends slope down into the rim instead of stopping in a cut face, and the trees thin out with it.
  // ground(r): the tray's surface under the hill (beach top, then the rim), lifted a hair so the feathered edge sits on it.
  const HA = 1.42, ground = r => 0.003 + (r < 1.1 ? 0.47 + (r - 1.06) * 0.25 : r < 1.2 ? 0.48 + (r - 1.1) * 0.2 : 0.5);
  const taper = a => THREE.MathUtils.smoothstep(HA - Math.abs(THREE.MathUtils.euclideanModulo(a, Math.PI * 2) - Math.PI), 0, 0.55);
  const hill = lathe([[1.1, 0.48], [1.125, 0.56], [1.15, 0.62], [1.21, 0.78], [1.28, 0.7], [1.33, 0.58], [RIM, 0.5]], 96, forest, Math.PI - HA, HA * 2);
  { const pa = hill.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), r = Math.hypot(x, z), b = ground(r);
      pa.setY(i, b + (pa.getY(i) - b) * taper(Math.atan2(x, z))); }
    hill.geometry.computeVertexNormals();
    // How green each point is: none where the hill meets the tray (its ends, and its inner and outer edges).
    const fade = new Float32Array(pa.count), S = THREE.MathUtils.smoothstep;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), r = Math.hypot(x, z), e = taper(Math.atan2(x, z));
      fade[i] = Math.pow(e, 0.7) * S(r, 1.1, 1.16) * (1 - S(r, RIM - 0.04, RIM)); }
    hill.geometry.setAttribute("aFade", new THREE.BufferAttribute(fade, 1)); }
  g.add(hill);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const PROF = [[1.1, 0.48], [1.125, 0.56], [1.15, 0.62], [1.21, 0.78], [1.28, 0.7], [1.33, 0.58], [RIM, 0.5]];
  const prof = r => { for (let k = 1; k < PROF.length; k++) if (r <= PROF[k][0]) { const [r0, y0] = PROF[k - 1], [r1, y1] = PROF[k]; return y0 + (y1 - y0) * (r - r0) / (r1 - r0); } return 0.5; };
  const rnd = (k => () => (k = (k * 16807) % 2147483647) / 2147483647)(7);
  const yHill = (a, r) => ground(r) + (prof(r) - ground(r)) * taper(a);

  // Grass over the rim and the hill, after the anime grass tried for Mirror Lake (a port of "Anime Grass GN", a Blender
  // geometry-nodes grass shared as open source, no attribution required): tufts of tapered ribbons bent downwind by
  // scrolling noise, coloured from a broad world-space noise through that grass's four-stop colour ramp, darker at
  // the root, and lit as the ground is (their normals point up), so blades and turf read as one painted sward.
  const grass = (() => {
    const BL = 5, SEG = 4, pos = [], tt = [], idx = [];
    for (let b = 0; b < BL; b++) {
      const yaw = b * 2.4 + 0.3, lean = 0.25 + 0.2 * (b % 2), cx = Math.cos(yaw), cz = Math.sin(yaw), h = 0.75 + 0.25 * ((b * 7) % 4) / 3;
      const ox = cx * 0.25, oz = cz * 0.25, base = pos.length / 3;
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG, w = 0.15 * Math.pow(1 - t, 0.75) + 0.004, x = ox + cx * lean * t * t, z = oz + cz * lean * t * t;
        pos.push(x - cz * w, t * h, z + cx * w, x + cz * w, t * h, z - cx * w); tt.push(t, t);
        if (k < SEG) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute("aT", new THREE.Float32BufferAttribute(tt, 1));
    geo.setIndex(idx);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = ctx.T; sh.uniforms.uWind = grassWind;
      const NOISE = `float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float aT; uniform float uTime, uWind; varying float vT; varying vec2 vW; varying vec3 vUp; ${NOISE}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vT = aT;
          // Patches and wind are worked out where the tuft stands on the model, so they turn with it.
          vec4 wr = instanceMatrix * vec4(0., 0., 0., 1.); vW = wr.xz;
          vUp = normalize(normalMatrix * vec3(0., 1., 0.));     // the model's up, in view space
          float sway = (gn(wr.xz * 9. + uTime * vec2(.9, .5)) - .35) * uWind;
          transformed.xz += vec2(.8, .5) * sway * aT * aT * .6;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying float vT; varying vec2 vW; varying vec3 vUp; ${NOISE}
          vec3 ramp(float x){                    // the .blend's colour ramp (0, .345, .623, 1)
            vec3 a = vec3(.061, .061, .232), b = vec3(.152, .358, .143), c = vec3(.353, .545, .248), d = vec3(.587, .699, .269);
            return x < .345 ? mix(a, b, x / .345) : x < .623 ? mix(b, c, (x - .345) / .278) : mix(c, d, (x - .623) / .377); }`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float n = gn(vW * 3.) * .65 + gn(vW * 11. + 7.) * .35;
          n = floor((.48 + .5 * n) * 6.) / 6.;   // broad painted patches, in a few steps, from the ramp's lighter half
          diffuseColor.rgb = pow(ramp(n), vec3(2.2)) * mix(.78, 1.08, vT);`)
        // Both faces lit as the ground under them (a double-sided blade's back face would otherwise turn dark).
        .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
          normal = normalize(vUp);`);
    };
    const want = phone ? 3200 : 5600, rim0 = 1.105, rim1 = RIM - 0.012;
    const im = new THREE.InstancedMesh(geo, mat, want);
    const yOf = (a, r) => { const b = r < 1.2 ? 0.48 + (r - 1.1) * 0.2 : 0.5; return b + Math.max(0, prof(r) - b) * taper(a); };
    let n = 0;
    for (let tries = 0; n < want && tries < want * 4; tries++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rim0 * rim0 + rnd() * (rim1 * rim1 - rim0 * rim0));
      if (r < rim0 + 0.02 && rnd() < 0.6) continue;                    // a ragged edge to the beach
      const k = 0.022 + 0.018 * rnd();
      p.set(Math.sin(a) * r, yOf(a, r) - 0.002, Math.cos(a) * r); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28); s.set(k * 1.2, k * (1.1 + 0.6 * rnd()), k * 1.2);
      im.setMatrixAt(n++, m4.compose(p, q, s));
    }
    im.count = n; im.receiveShadow = true; im.castShadow = false;
    return im;
  })();
  g.add(grass);

  // Water: a planar mirror rippled with Skim's wave normals.
  const normals = tex(A + "water_normal.png", { srgb: false, repeat: [1, 1] });
  const soft = ctx.look === "memory";
  // Rings from the stone, kept as data so the pastel water can bend its reflection with them: x, z, start, speed.
  // Up to LIVE rings spread at once. Past that the oldest is let go quickly (fading over 0.35 s) rather than cut off,
  // so the pool has spare slots for the new ones meanwhile. ringEnd: when each ring has faded out.
  const NR = 24, LIVE = 14, LIFE = 2.4, rings = Array.from({ length: NR }, () => new THREE.Vector4(0, 0, -99, 0)), ringEnd = new Float32Array(NR).fill(-99);
  let water;
  {
    // A real mirror: the gate, trees and room reflected in the pond, rippled by Skim's wave normals and
    // pushed about by each ring the stone leaves.
    water = new Reflector(new THREE.CircleGeometry(1.0, 72), { textureWidth: phone ? 512 : 1024, textureHeight: phone ? 512 : 1024, clipBias: 0.002, multisample: phone ? 0 : 4, shader: {
      name: "PondShader",
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 }, uN: { value: null }, uRings: { value: [] }, uEnd: { value: null } },
      vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; varying vec2 vL;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main(){ vUv = textureMatrix * vec4(position, 1.); vL = position.xy; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `uniform sampler2D tDiffuse, uN; uniform float uTime; uniform vec4 uRings[${NR}]; uniform float uEnd[${NR}];
        varying vec4 vUv; varying vec3 vW; varying vec2 vL;
        #include <logdepthbuf_pars_fragment>
        void main(){
          #include <logdepthbuf_fragment>
          vec2 p = vec2(vL.x, -vL.y);                       // pond coordinates (x, z)
          // Gentle wind on the surface.
          // Broad, slow swells and a finer layer at half strength, so the reflection wavers instead of breaking up.
          vec2 n = (texture2D(uN, vL * .7 + uTime * .012).xy * 2. - 1.) + .5 * (texture2D(uN, vL * 1.6 - uTime * .01).xy * 2. - 1.);
          n *= .006;
          // Each ring: a short train of waves travelling out, fading as it spreads.
          float crest = 0.;
          for (int i = 0; i < ${NR}; i++) {
            vec4 r = uRings[i]; float age = uTime - r.z;
            if (age < 0. || age > 2.4 || uTime > uEnd[i]) continue;
            vec2 v = p - r.xy; float d = length(v) + 1e-4, R = .01 + age * r.w, x = d - R, w = .018 + age * .012;
            float A = pow(1. - age / 2.4, 2.) * clamp((uEnd[i] - uTime) / .35, 0., 1.), e = exp(-x * x / (w * w)), k = 130.;
            float h = A * sin(k * x) * e, dh = A * (k * cos(k * x) - 2. * x / (w * w) * sin(k * x)) * e;
            n += v / d * dh * .0003; crest += max(h, 0.);
          }
          vec3 V = normalize(cameraPosition - vW), N = normalize(vec3(-n.x * 6., 1., -n.y * 6.));
          float f = .3 + .5 * pow(1. - max(dot(V, N), 0.), 3.);
          vec3 refl = texture2D(tDiffuse, vUv.xy / vUv.w + n).rgb;
          vec3 c = mix(${soft ? "vec3(.5, .74, .8)" : "vec3(.2, .36, .38)"}, refl * vec3(.86, .95, 1.), f);
          c += crest * .1;
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    } });
    const u = water.material.uniforms; u.uTime = ctx.T; u.uN.value = normals; u.uRings.value = rings; u.uEnd.value = ringEnd;
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    // The mirror only needs this diorama: the others are hidden while it draws.
    const mirror = water.onBeforeRender;
    water.onBeforeRender = (r, sc, cam) => {
      let top = g; while (top.parent && top.parent !== sc) top = top.parent;
      const hid = sc.children.filter(o => o !== top && o.visible && !o.isLight);
      hid.forEach(o => { o.visible = false; });
      mirror.call(water, r, sc, cam);
      hid.forEach(o => { o.visible = true; });
    };
  }
  water.rotation.x = -Math.PI / 2; water.position.y = Y_W; water.receiveShadow = false;
  g.add(water);

  // Real props from the game.
  const cherries = [], crowns = [];                 // the cherries, and where each one's crown is (petals fall from them)
  const grassWind = { value: 0.35 };
  const [torii, cherry, pad, blossom] = await Promise.all(["torii.bin", "cherry.bin", "lily_pad.bin", "lily_blossom.bin"].map(f => loadSKM1(A + f)));
  {
    const geo = skmGeometry(torii);
    // A bolder vermilion: the texture's reds lifted and warmed, its black roof and fittings left as they are.
    const mat = new THREE.MeshStandardMaterial({ map: tex(A + "torii.webp", { flipY: false }), roughness: 0.55 });
    mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      float redness = smoothstep(.02, .12, diffuseColor.r - max(diffuseColor.g, diffuseColor.b));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(2.3, 1.5, 1.2), redness);`); };
    const m = new THREE.Mesh(geo, mat);
    const k = 0.058; m.scale.setScalar(k * geo.userData.unit);
    m.position.set(0.05, Y_W, -0.3);
    g.add(m);
  }
  {
    const geo = skmGeometry(cherry);
    const kind = cherry.arrays.kind.data;
    splitGroups(geo, i => kind[i] > 0);
    const bark = new THREE.MeshStandardMaterial({ map: tex(A + "cherry_bark.webp", { flipY: false }), roughness: 0.9 });
    // The blossom in a few shades (the foliage texture tinted): Skim's own pink, a paler near-white, a deeper pink,
    // and a faintly lilac one.
    const cards = ["#ffffff", "#fff3f6", "#ffc6d9", "#f1e0ff"].map(c => new THREE.MeshStandardMaterial({ map: tex(A + "cherry_foliage.webp", { flipY: false }), color: c, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }));
    // The two at the hill's ends stand on the rim as before; the rest along the hill, either side of the gate.
    const TREES = [[-0.92, -0.42, 0.6, 0.135, 0], [0.98, -0.5, 2.6, 0.11, 2],
      [Math.PI + 0.78, 1.24, 1.7, 0.1, 1], [Math.PI - 0.74, 1.25, 4.1, 0.105, 3], [Math.PI + 0.38, 1.27, 0.2, 0.09, 2],
      [Math.PI - 0.4, 1.23, 3.2, 0.095, 0], [Math.PI + 0.06, 1.3, 5.3, 0.08, 1], [Math.PI - 1.28, 1.2, 0.9, 0.08, 1], [Math.PI + 1.3, 1.22, 2.2, 0.075, 3]];
    TREES.forEach(([u, v, ry, k, shade], i) => {
      const m = new THREE.Mesh(geo, [bark, cards[shade]]);
      m.scale.setScalar(k * geo.userData.unit); m.rotation.y = ry;
      if (i < 2) m.position.set(u, 0.49, v);                                       // (x, z) on the rim
      else m.position.set(Math.sin(u) * v, yHill(u, v) - 0.015, Math.cos(u) * v);   // (angle, radius) on the hill
      g.add(m); cherries.push(m);
      crowns.push([m.position.x, m.position.y + k * 3.4, m.position.z]);
    });
  }
  {
    const geo = skmGeometry(pad), mat = new THREE.MeshStandardMaterial({ map: tex(A + "lily_pad.webp", { flipY: false }), roughness: 0.6, side: THREE.DoubleSide });
    const n = 11, pads = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = 0.05 + 0.2 * Math.sqrt(i / n);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
      pads.setMatrixAt(i, m4.compose(p.set(0.55 + Math.cos(a) * r, Y_W + 0.004, 0.32 + Math.sin(a) * r * 0.8), q, s.setScalar((0.045 + 0.02 * Math.abs(Math.sin(i * 5.1))) * geo.userData.unit)));
    }
    g.add(pads);
    const bgeo = skmGeometry(blossom), bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    [[0.58, 0.3], [0.47, 0.44]].forEach(([x, z], i) => { const b = new THREE.Mesh(bgeo, bmat); b.scale.setScalar(0.06 * bgeo.userData.unit); b.position.set(x, Y_W + 0.006, z); b.rotation.y = i * 2; g.add(b); });
  }
  shadows(g);
  water.castShadow = false;

  // Falling petals.
  const NP = phone ? 30 : 70, pp = new Float32Array(NP * 3), pv = [];

  const spawn = (i, anywhere) => {
    const c = crowns[i % crowns.length];
    pp[i * 3] = c[0] + (Math.random() - 0.5) * 0.6; pp[i * 3 + 1] = anywhere ? Y_W + Math.random() * 0.55 : c[1] - Math.random() * 0.2; pp[i * 3 + 2] = c[2] + (Math.random() - 0.5) * 0.5;
    pv[i] = { rest: 0, ph: Math.random() * 6.28 };
  };
  for (let i = 0; i < NP; i++) spawn(i, true);
  const petalsGeo = new THREE.BufferGeometry(); petalsGeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  const petals = new THREE.Points(petalsGeo, new THREE.PointsMaterial({ color: "#f6c9d6", size: 0.018, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
  g.add(petals);

  // Skimming stones and their rings.
  // The stone is a slate lilac in the pastel look.
  // In the pastel look the water itself ripples; elsewhere rings are drawn on it.
  const rings3 = null;
  const rip = {
    add(x, z, t, size = 0.12) {
      rings3?.add(x, z, t, size);
      const live = []; let free = -1;
      for (let i = 0; i < NR; i++) { if (t < ringEnd[i] && t - rings[i].z < LIFE) live.push(i); else if (free < 0) free = i; }
      if (live.length >= LIVE) {                               // full: let the oldest go, quickly
        const old = live.reduce((a, b) => (rings[a].z < rings[b].z ? a : b));
        ringEnd[old] = Math.min(ringEnd[old], t + 0.35);
      }
      if (free < 0) return;                                    // every slot still fading: skip this one
      rings[free].set(x, z, t, size); ringEnd[free] = t + LIFE;
    },
    update(t) { rings3?.update(t); }
  };
  const stone = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), std("#8f8c86", { roughness: 0.5 }));
  if (soft) stone.material.userData.pastel = "#8d86b4";
  stone.scale.set(1, 0.35, 1); stone.castShadow = true; stone.visible = false; g.add(stone);
  let path = null, next = 1.2;
  function throwStone(t, to) {
    // From the near edge, in the middle, out across the pond (through the gate unless you aim elsewhere).
    const from = new THREE.Vector2(0.05, 0.9);
    const end = to ? new THREE.Vector2(to.x, to.z) : new THREE.Vector2(0.05 + (Math.random() - 0.5) * 0.5, -0.45 - Math.random() * 0.25);
    const dir = end.clone().sub(from);
    const hops = []; let u = 0, len = 0.32;
    for (let i = 0; i < 6; i++) { hops.push([u, u + len]); u += len; len *= 0.72; }
    path = { t0: t, from, dir, hops: hops.map(h => [h[0] / u, h[1] / u]), hit: 0, dur: 0.3, thrown: !!to };
  }

  let wind = 0; const wp = new THREE.Vector3();
  const shore = ambience("assets/sound/skim-shoreside.mp4", 0.42);    // Max's own recording of the lakeside, as the game plays it
  return {
    group: g,
    footprint: RIM,
    view: { fit: 1.5, elev: 30, lookY: 0.42 },
    hit: [water],
    update(t, dt, focused) {
      shore.set(!!focused);
      if (!reduced && water.material.uniforms?.time) water.material.uniforms.time.value = t * 0.35;
      // Wind: only while it's the one you're looking at, easing in and out.
      wind += ((focused && !reduced ? 1 : 0) - wind) * Math.min(1, (dt || 0.016) * 2);
      grassWind.value = reduced ? 0 : 0.35 + 0.65 * wind;
      if (wind > 0.002) {
        const gust = wind * (0.6 + 0.4 * Math.sin(t * 0.37));
        cherries.forEach((m, i) => { m.rotation.z = gust * 0.022 * Math.sin(t * 1.1 + i * 2); m.rotation.x = gust * 0.014 * Math.sin(t * 0.83 + i); });
      }
      if (!path && t > next && !reduced) throwStone(t);
      if (path) {
        const k = (t - path.t0) / path.dur, i = Math.floor(k);
        if (i >= path.hops.length) { path = null; next = t + 3; stone.visible = false; }
        else {
          const [a, b] = path.hops[i], f = k - i, u = a + (b - a) * f;
          if (i >= path.hit) {
            const x = path.from.x + path.dir.x * a, z = path.from.y + path.dir.y * a; rip.add(x, z, t, 0.12 * (1 - i * 0.1)); path.hit = i + 1;
            // Skim's own splashes, for a stone you threw (the idle throws stay quiet), softer at each skip.
            if (path.thrown) play(`assets/sound/skim-splash-${1 + Math.floor(Math.random() * 4)}.mp4`, { gain: 0.8 * Math.pow(0.78, i), rate: 0.94 + Math.random() * 0.12 });
          }
          stone.visible = true;
          stone.position.set(path.from.x + path.dir.x * u, Y_W + 0.01 + Math.sin(Math.PI * f) * 0.12 * (1 - i * 0.15), path.from.y + path.dir.y * u);
          stone.rotation.y = t * 25;
        }
      }
      rip.update(t);
      if (!reduced) {
        for (let i = 0; i < NP; i++) {
          const v = pv[i];
          if (pp[i * 3 + 1] > Y_W + 0.008) {
            pp[i * 3] += Math.sin(t * 1.3 + v.ph) * 0.0015 + 0.0006; pp[i * 3 + 2] += Math.cos(t * 1.1 + v.ph) * 0.0012;
            pp[i * 3 + 1] -= dt * 0.08;
          } else if ((v.rest += dt) > 4 || Math.hypot(pp[i * 3], pp[i * 3 + 2]) > 1.0) spawn(i, false);
        }
        petalsGeo.attributes.position.needsUpdate = true;
      }
    },
    pointer(type, hit, t) {
      if (!hit) return;
      const lp = g.worldToLocal(hit.point.clone());
      if (type === "move" && Math.random() < 0.12 && Math.hypot(lp.x, lp.z) < 0.98) rip.add(lp.x, lp.z, t, 0.06);
      if (type === "click" && Math.hypot(lp.x, lp.z) < 0.98) throwStone(t, lp);
    }
  };
}
