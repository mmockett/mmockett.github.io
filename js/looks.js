// Looks: one style laid over every diorama, so the table reads as one set rather than four kinds of model.
// A look restyles the scene (light, ground, background), simplifies each model's materials (photo textures
// shrink to a few pixels or to one flat colour, fine surface maps go), patches the shaders, and may add a
// screen pass (low resolution and dither, ink lines, glow). Pick one with ?look=<name>.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// ---------------------------------------------------------------- pastel colour
// Any colour moved into a soft pastel range, worked in OKLab so hues keep their character: lightness is lifted into a
// narrow light band and chroma is capped. Greys and blacks pick up a tint by how light they were: dark ones turn
// lilac, middle ones pink, light ones cream. Works on linear RGB.
const oklab = (r, g, b) => {
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s];
};
const fromOklab = (L, a, b) => {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s];
};
const NEUTRAL = [[0.0, 305, .065], [0.45, 345, .06], [0.8, 85, .045]];   // [from lightness, hue°, chroma]: lilac, pink, cream
const P = { lo: .6, hi: .95, cmax: .13 };
function pastel(r, g, b) {
  const [L, A, B] = oklab(Math.max(r, 0), Math.max(g, 0), Math.max(b, 0)), C = Math.hypot(A, B);
  const L2 = P.lo + (P.hi - P.lo) * Math.min(1, L);
  let n = NEUTRAL[0]; for (const e of NEUTRAL) if (L >= e[0]) n = e;
  const na = Math.cos(n[1] * Math.PI / 180) * n[2], nb = Math.sin(n[1] * Math.PI / 180) * n[2];
  const C2 = Math.min(P.cmax, .045 + C * .6), w = THREE.MathUtils.smoothstep(C, .02, .06);
  let a2 = na + ((C ? A / C * C2 : 0) - na) * w, b2 = nb + ((C ? B / C * C2 : 0) - nb) * w;
  for (let i = 0; i < 6; i++) {   // pull chroma in until the colour fits on screen
    const o = fromOklab(L2, a2, b2);
    if (o.every(v => v >= 0 && v <= 1)) return o;
    a2 *= .8; b2 *= .8;
  }
  return fromOklab(L2, 0, 0).map(v => THREE.MathUtils.clamp(v, 0, 1));
}
const pastelColor = c => { const [r, g, b] = pastel(c.r, c.g, c.b); return c.setRGB(r, g, b); };
const s2l = v => (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4), l2s = v => (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055);

// ---------------------------------------------------------------- textures
// Photo textures become small: a few dozen pixels drawn with hard edges, or one flat colour with the alpha kept
// (so leaf and petal cards keep their outline). Drawn textures (labels, legends, screens, video) are left alone.
// With `pastel`, every pixel (times the material's colour, which is then set to white) moves into the pastel range,
// and drawn textures on lit surfaces are recoloured too, at their own size.
const cache = new WeakMap();
const ready = img => img && ((img.complete && img.naturalWidth) || (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) || img instanceof HTMLCanvasElement);
function reduceTex(t, { size = 64, flat = false, nearest = false, pastel: toPastel = false }, tint = null) {
  if (!t || t.userData.looked || t.isVideoTexture || t.isDataTexture || t.isRenderTargetTexture || t.isDepthTexture) return t;
  if (t.isCanvasTexture && !toPastel) return t;
  const key = tint ? tint.getHexString() : "-";
  if (!cache.has(t)) cache.set(t, new Map());
  if (cache.get(t).has(key)) return cache.get(t).get(key);
  const img = t.image;
  if (!ready(img)) return undefined;
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = t.isCanvasTexture ? w : Math.max(1, Math.min(size, w)), sh = t.isCanvasTexture ? h : Math.max(1, Math.round(s * h / w));
  const c = document.createElement("canvas"); c.width = s; c.height = sh;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, s, sh);
  if (flat || toPastel) {
    const d = g.getImageData(0, 0, s, sh), p = d.data;
    if (flat) {
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < p.length; i += 4) { const a = p[i + 3] / 255; r += p[i] * a; gg += p[i + 1] * a; b += p[i + 2] * a; n += a; }
      n = Math.max(n, 1e-3);
      for (let i = 0; i < p.length; i += 4) { p[i] = r / n; p[i + 1] = gg / n; p[i + 2] = b / n; p[i + 3] = p[i + 3] > 110 ? 255 : 0; }
    }
    if (toPastel) {
      const srgb = t.colorSpace === THREE.SRGBColorSpace, tr = tint ? tint.r : 1, tg = tint ? tint.g : 1, tb = tint ? tint.b : 1;
      const seen = new Map();
      for (let i = 0; i < p.length; i += 4) {
        const k = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2];
        let o = seen.get(k);
        if (!o) {
          const lin = [p[i], p[i + 1], p[i + 2]].map(v => (srgb ? s2l(v / 255) : v / 255));
          o = pastel(lin[0] * tr, lin[1] * tg, lin[2] * tb).map(v => Math.round((srgb ? l2s(v) : v) * 255));
          seen.set(k, o);
        }
        p[i] = o[0]; p[i + 1] = o[1]; p[i + 2] = o[2];
      }
    }
    g.putImageData(d, 0, 0);
  }
  const o = new THREE.CanvasTexture(c);
  o.colorSpace = t.colorSpace; o.flipY = t.flipY; o.wrapS = t.wrapS; o.wrapT = t.wrapT; o.anisotropy = t.anisotropy;
  o.repeat.copy(t.repeat); o.offset.copy(t.offset); o.center.copy(t.center); o.rotation = t.rotation; o.channel = t.channel;
  if ((nearest || flat) && !t.isCanvasTexture) { o.magFilter = THREE.NearestFilter; o.minFilter = THREE.NearestFilter; o.generateMipmaps = false; }
  o.userData.looked = true;
  cache.get(t).set(key, o);
  return o;
}

// Boxes become cushions: every box is rebuilt with corners rounded to about a third of its smallest side.
const rounded = new WeakMap();
function cushion(o, { k = .3, max = .12 } = {}) {
  const g = o.geometry;
  if (!o.isMesh || !g || !(g.type === "BoxGeometry" || g instanceof RoundedBoxGeometry)) return;
  if ([].concat(o.material).some(m => m.isShaderMaterial || m.visible === false)) return;
  if (!rounded.has(g)) {
    g.computeBoundingBox();
    const sz = g.boundingBox.getSize(new THREE.Vector3()), mid = g.boundingBox.getCenter(new THREE.Vector3());
    const r = Math.min(max, Math.min(sz.x, sz.y, sz.z) * k);
    const n = new RoundedBoxGeometry(sz.x, sz.y, sz.z, 4, r); n.translate(mid.x, mid.y, mid.z);
    rounded.set(g, n);
  }
  o.geometry = rounded.get(g);
}

// ---------------------------------------------------------------- shader patches
const U = { uSnapRes: { value: new THREE.Vector2(320, 180) }, uPointK: { value: 1 }, uPointLine: { value: 1 }, uRimColor: { value: new THREE.Color() }, uRim: { value: 0 } };
const CHUNKS = {
  // Vertices land on a coarse screen grid, so edges creep a little as things move, as on early 3D consoles.
  snap: ["vertex", "#include <project_vertex>", `
    gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnapRes + .5) / uSnapRes * gl_Position.w;`, "uniform vec2 uSnapRes;"],
  // Light falls into three flat bands; highlights become one hard spot.
  toon: ["fragment", "#include <lights_fragment_end>", `
    { vec3 dc = max(diffuseColor.rgb, vec3(.03));
      vec3 lit = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse) / dc;
      float L = max(dot(lit, vec3(.299, .587, .114)), 1e-4);
      float q = mix(.34, .62, smoothstep(.40, .43, L)); q = mix(q, .95, smoothstep(.70, .73, L));
      reflectedLight.directDiffuse *= q / L; reflectedLight.indirectDiffuse *= q / L;
      float s = dot(reflectedLight.directSpecular, vec3(.333));
      reflectedLight.directSpecular = vec3(smoothstep(.30, .34, s) * .22);
      reflectedLight.indirectSpecular *= .15; }`],
  // Points: three.js sizes them for the full canvas, so scale them to the target, never above a material's
  // userData.maxPx (counted in lines of a 600-line screen, so the cap holds at any resolution).
  points: ["vertex", "#include <logdepthbuf_vertex>", `
    gl_PointSize = clamp(gl_PointSize * uPointK, 1., uPointMax * uPointLine);`, "uniform float uPointK, uPointMax, uPointLine;", true],
  // A cool light around every silhouette.
  rim: ["fragment", "#include <opaque_fragment>", `
    { float f = pow(1. - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0., 1.), 2.2);
      outgoingLight += uRimColor * f * uRim; }`, "uniform vec3 uRimColor; uniform float uRim;", true]
};
function patch(m, names) {
  const use = names.filter(n => {
    const [stage, at] = CHUNKS[n];
    const lib = THREE.ShaderLib[{ MeshStandardMaterial: "standard", MeshPhysicalMaterial: "physical", MeshLambertMaterial: "lambert", MeshPhongMaterial: "phong", MeshToonMaterial: "toon", MeshBasicMaterial: "basic", PointsMaterial: "points" }[m.type]];
    if (!lib) return false;
    if (n === "points" && m.type !== "PointsMaterial") return false;
    if (n === "rim" && !lib.fragmentShader.includes("#include <normal_fragment_begin>")) return false;   // unlit materials have no normal
    return (stage === "vertex" ? lib.vertexShader : lib.fragmentShader).includes(at);
  });
  if (!use.length) return;
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.uniforms.uPointMax = { value: m.userData.maxPx || 64 };
    for (const n of use) {
      const [stage, at, code, decl = "", before] = CHUNKS[n], k = stage === "vertex" ? "vertexShader" : "fragmentShader";
      sh[k] = (decl ? decl + "\n" : "") + sh[k].replace(at, before ? code + "\n" + at : at + code);
    }
  };
  m.customProgramCacheKey = () => key + "|look:" + use.join(",");
}

// ---------------------------------------------------------------- screen pass
// The scene is drawn into a texture exactly as it would be drawn to the screen (tone mapped, in display colour),
// then one full-screen shader finishes it. Flagging the target as an XR target is what makes three.js apply
// tone mapping and output colour there; a half-float target keeps it from being converted again on write.
const QUAD_VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }";
const EDGES = `
  uniform sampler2D tDepth; uniform float uNear, uFar;
  float iz(vec2 uv){ float z = texture2D(tDepth, uv).x; return (uFar - z * (uFar - uNear)) / (uNear * uFar); }
  float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
  // Silhouettes from jumps in depth, creases from bends in it, and borders between flat colours.
  float edges(vec2 uv, vec2 e, float crease, float colour){
    float c = iz(uv), l = iz(uv - vec2(e.x, 0.)), r = iz(uv + vec2(e.x, 0.)), d = iz(uv - vec2(0., e.y)), u = iz(uv + vec2(0., e.y));
    float jump = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(d - c))) / c;
    float bend = (abs(l + r - 2. * c) + abs(u + d - 2. * c)) / c;
    float k = max(smoothstep(.03, .06, jump), smoothstep(crease, crease * 2., bend));
    if (colour > 0.) {
      float cl = abs(lum(texture2D(tColor, uv - vec2(e.x, 0.)).rgb) - lum(texture2D(tColor, uv + vec2(e.x, 0.)).rgb))
               + abs(lum(texture2D(tColor, uv - vec2(0., e.y)).rgb) - lum(texture2D(tColor, uv + vec2(0., e.y)).rgb));
      k = max(k, smoothstep(colour, colour * 1.6, cl) * .8);
    }
    return k;
  }`;
const CRT = `
  uniform float uScan, uGlow;
  vec3 row(float x, float y){ return texture2D(tPix, vec2(x, y) / uRes).rgb; }
  void main(){
    vec2 p = vUv * uRes - .5, i = floor(p), f = p - i;
    // Across a row: a soft step from pixel to pixel rather than a hard edge (the linear filter does the blend).
    float sx = i.x + .5 + smoothstep(.15, .85, f.x);
    float bleed = .22;
    vec3 a = vec3(row(sx + bleed, i.y + .5).r, row(sx, i.y + .5).g, row(sx - bleed, i.y + .5).b);
    vec3 b = vec3(row(sx + bleed, i.y + 1.5).r, row(sx, i.y + 1.5).g, row(sx - bleed, i.y + 1.5).b);
    // Down the screen: two beams, each wider the brighter it is.
    float la = dot(a, vec3(.3, .6, .1)), lb = dot(b, vec3(.3, .6, .1));
    float sa = mix(.24, .38, la), sb = mix(.24, .38, lb);
    vec3 beam = a * exp(-f.y * f.y / (2. * sa * sa)) + b * exp(-(1. - f.y) * (1. - f.y) / (2. * sb * sb));
    vec3 even = mix(a, b, smoothstep(.2, .8, f.y));
    vec3 c = mix(even, beam, uScan);
    // Glow: light spilling from bright parts nearby.
    vec3 g = vec3(0.);
    for (int k = 0; k < 8; k++) { float an = float(k) * .785 + .39; vec2 o = vec2(cos(an), sin(an)) * (k < 4 ? 1.6 : 3.2);
      g += max(texture2D(tPix, (p + .5 + o) / uRes).rgb - .86, 0.); }
    c += g * uGlow;
    vec2 v = vUv - .5; c *= 1. - .22 * pow(dot(v, v) * 1.9, 1.6);
    gl_FragColor = vec4(c, 1.); }`;

class Pass {
  constructor(frag, { scale = () => 1, nearest = false, uniforms = {}, snap = .25, before = null, display = null, displayUniforms = {}, samples = 0 } = {}) {
    this.scale = scale; this.snap = snap; this.before = before;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    rt.texture.colorSpace = THREE.SRGBColorSpace; rt.isXRRenderTarget = true;
    rt.texture.minFilter = rt.texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    rt.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.rt = rt;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uRes: { value: new THREE.Vector2() }, uPx: { value: 1 }, uNear: { value: .05 }, uFar: { value: 120 }, uTime: { value: 0 }, ...uniforms },
      vertexShader: QUAD_VS, fragmentShader: "uniform sampler2D tColor; uniform vec2 uRes; uniform float uPx, uTime; varying vec2 vUv;\n" + frag,
      depthTest: false, depthWrite: false
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); q.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(q); this.qc = new THREE.Camera();
    // With a display stage, the finished low-resolution image is kept in its own small target, and a second shader
    // shows it on the screen the way a display would (a CRT's beams, say) instead of as square pixels.
    if (display) {
      this.pix = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      this.dmat = new THREE.ShaderMaterial({
        uniforms: { tPix: { value: this.pix.texture }, uRes: this.mat.uniforms.uRes, uOut: { value: new THREE.Vector2() }, ...displayUniforms },
        vertexShader: QUAD_VS, fragmentShader: "uniform sampler2D tPix; uniform vec2 uRes, uOut; varying vec2 vUv;\n" + display,
        depthTest: false, depthWrite: false
      });
      const dq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dmat); dq.frustumCulled = false;
      this.ds = new THREE.Scene(); this.ds.add(dq);
    }
  }
  setSize(w, h, dpr) {
    const k = this.scale(w, h, dpr), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
    this.rt.setSize(W, H); this.mat.uniforms.uRes.value.set(W, H); this.mat.uniforms.uPx.value = Math.max(1, dpr * k * 0.9);
    if (this.pix) { this.pix.setSize(W, H); this.dmat.uniforms.uOut.value.set(w, h); }
    U.uSnapRes.value.set(W, H).multiplyScalar(this.snap);
    U.uPointK.value = H / h; U.uPointLine.value = Math.max(1, H / 600);
  }
  render(renderer, scene, camera, t) {
    const u = this.mat.uniforms; u.uNear.value = camera.near; u.uFar.value = camera.far; u.uTime.value = t;
    this.before?.(u, camera);
    renderer.setRenderTarget(this.rt); renderer.render(scene, camera);
    if (this.pix) { renderer.setRenderTarget(this.pix); renderer.render(this.qs, this.qc); renderer.setRenderTarget(null); renderer.render(this.ds, this.qc); }
    else { renderer.setRenderTarget(null); renderer.render(this.qs, this.qc); }
  }
}

// ---------------------------------------------------------------- the looks
const canvasTex = (w, h, draw, repeat) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
};
function room(env, { bg, fog = bg, near = 16, far = 40, sky, low, hemi, sunC, sun, ground, groundMap }) {
  env.scene.background = new THREE.Color(bg); env.scene.fog = new THREE.Fog(fog, near, far);
  env.hemi.color.set(sky); env.hemi.groundColor.set(low); env.hemi.intensity = hemi;
  env.sun.color.set(sunC); env.sun.intensity = sun;
  env.ground.material.color.set(ground); env.ground.material.map = groundMap || null; env.ground.material.needsUpdate = true;
}

// Rooms for the pastel look: the backdrop, the light bouncing up from it, the tint of shadows where things meet,
// the colour blacks lift to, and the pale edge light.
export const ROOMS = {
  pink: { bg: "#f2cdd1", ground: "#e9bcc2", sky: "#fff3f1", low: "#d898a6", shade: "#c99aae", floor: "#4b3248", sheen: "#fff0f2" },
  butter: { bg: "#f6eaa8", ground: "#ecdc92", sky: "#fffbea", low: "#d6bd72", shade: "#d3b89a", floor: "#4f4034", sheen: "#fffbe8" },
  lilac: { bg: "#ddd4f3", ground: "#cfc4ec", sky: "#f8f5ff", low: "#a796d4", shade: "#ada5d6", floor: "#3a3158", sheen: "#f6f2ff" }
};

export const LOOKS = {
  // Soft pastel clay: every model recoloured into one pastel set, boxes rounded into cushions, matte surfaces with
  // a pale edge, soft coloured shadows where things meet, in a seamless one-colour room. Drawn at full resolution
  // with multisampling, so edges stay smooth.
  memory: {
    title: "Memory card",
    tex: { size: 128, pastel: true }, patches: ["rim", "points"], dropDetail: true, cushion: true,
    setup(env) {
      const R = ROOMS[env.room] || ROOMS.lilac;
      document.body.dataset.room = env.room in ROOMS ? env.room : "lilac";
      env.renderer.toneMapping = THREE.NeutralToneMapping; env.renderer.toneMappingExposure = 1;
      room(env, { bg: R.bg, near: 26, far: 52, sky: R.sky, low: R.low, hemi: 1.35, sunC: "#fff6ee", sun: 2.2, ground: R.ground });
      env.sun.shadow.mapSize.set(2048, 2048); env.sun.shadow.map?.dispose(); env.sun.shadow.map = null;
      env.sun.shadow.bias = -0.002;
      U.uRimColor.value.set(R.sheen); U.uRim.value = .32;
      return new Pass(`
        uniform sampler2D tDepth; uniform float uNear, uFar, uAoPx, uAoMax, uAoRange;
        uniform vec3 uFloor, uShade;
        float iz(vec2 uv){ float z = texture2D(tDepth, uv).x; return (uFar - z * (uFar - uNear)) / (uNear * uFar); }
        float bayer(vec2 p){ int i = int(mod(p.x, 4.)) + int(mod(p.y, 4.)) * 4;
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return float(m[i]) / 16. - .47; }
        void main(){
          vec2 px = floor(vUv * uRes), uv = vUv;
          vec3 c = texture2D(tColor, uv).rgb;
          // Soft shadow where surfaces meet: pairs of samples on either side; on a flat surface inverse depth is
          // linear, so their sum matches the centre, and any surplus means a hollow. Big jumps (things far in
          // front) are ignored, so nothing gets a halo.
          float zc = iz(uv), R = clamp(uAoPx * zc, 1.5, uAoMax), occ = 0., lim = uAoRange * zc * zc, d = .5;   // the same pattern everywhere, so no grain
          for (int i = 0; i < 16; i++) {
            float a = float(i) * 2.39996 + d * 1.7, r = R * (.25 + .75 * fract(float(i) * .618 + d * .5));
            vec2 o = vec2(cos(a), sin(a)) * r / uRes;
            float p = iz(uv + o), m = iz(uv - o);
            float ok = (1. - smoothstep(lim, lim * 2., max(abs(p - zc), abs(m - zc))))
                     * step(abs(uv.x - .5) + abs(o.x), .5) * step(abs(uv.y - .5) + abs(o.y), .5);   // both samples on screen
            float h = p + m - 2. * zc;
            occ += smoothstep(.004, .03, h / (zc * zc)) * smoothstep(.004, .02, h / zc) * ok;
          }
          occ = clamp(occ / 16. * 1.3, 0., 1.) * (1. - smoothstep(14., 24., 1. / zc));
          c *= mix(vec3(1.), uShade, occ);
          c = mix(uFloor, vec3(1.), c);
          vec2 v = vUv - .5; c *= 1. - .16 * pow(dot(v, v) * 1.9, 1.6);   // corners fall off a little
          c += (bayer(px) + .03) / 255.;                                     // and a dither so the gradients don't band
          gl_FragColor = vec4(c, 1.); }`, {
        samples: 4,
        // Colours here are for the finished (display) image, so they stay in sRGB.
        uniforms: { uAoPx: { value: 0 }, uAoMax: { value: 14 }, uAoRange: { value: .16 }, uFloor: { value: new THREE.Color(R.floor).convertLinearToSRGB() }, uShade: { value: new THREE.Color(R.shade).convertLinearToSRGB() } },
        before(u, camera) { u.uAoMax.value = 14 * Math.max(1, u.uRes.value.y / 600); u.uAoPx.value = .13 * u.uRes.value.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * (camera.view?.enabled ? camera.view.fullHeight / camera.view.height : 1); }
      });
    },
    material(m) {
      const tag = m.userData.pastel;
      if (tag) { m.color?.set(tag); if (m.map?.isCanvasTexture && !m.userData.keepMap) m.map = null; }
      else if (m.color && !m.map && !m.userData.painted) pastelColor(m.color);
      if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) { pastelColor(m.emissive); m.emissiveIntensity *= .5; }
      if ("roughness" in m) { m.roughness = Math.max(m.roughness, .78); m.metalness = 0; }
      if (m.isMeshPhysicalMaterial) { m.clearcoat *= .4; m.clearcoatRoughness = Math.max(m.clearcoatRoughness, .3); }
      m.envMap = null;
    }
  },

  // Glossy pearl plastic, like the clamshell laptops and handhelds of the time: soft colour, clean reflections.
  pearl: {
    title: "Pearl",
    tex: { size: 32, flat: true }, dropDetail: true,
    setup(env) {
      const glow = canvasTex(1024, 1024, (g, w, h) => {
        const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        r.addColorStop(0, "#ffffff"); r.addColorStop(0.08, "#f4f7fb"); r.addColorStop(0.3, "#e3e9f2"); r.addColorStop(1, "#d6dce8");
        g.fillStyle = r; g.fillRect(0, 0, w, h);
      });
      room(env, { bg: "#d6dce8", near: 18, far: 46, sky: "#ffffff", low: "#aeb9cc", hemi: 1.0, sunC: "#fffaf2", sun: 2.0, ground: "#ffffff", groundMap: glow });
      const pm = new THREE.PMREMGenerator(env.renderer);
      env.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      env.scene.environmentIntensity = 0.75;
      return null;
    },
    material(m) {
      if (m.color && !m.vertexColors) { const h = {}; m.color.getHSL(h); m.color.setHSL(h.h, Math.min(1, h.s * 0.85), Math.min(0.92, h.l * 0.82 + 0.17)); }
      if ("roughness" in m) { m.roughness = 0.26; m.metalness = Math.min(m.metalness, 0.1); }
      if (m.isMeshPhysicalMaterial) { m.clearcoat = 1; m.clearcoatRoughness = 0.12; }
    }
  },

  // Cel shading with ink outlines, from the turn of the century's cartoon-rendered games.
  cel: {
    title: "Cel",
    tex: { size: 32, flat: true }, patches: ["toon"], dropDetail: true,
    setup(env) {
      room(env, { bg: "#efe7d4", near: 18, far: 44, sky: "#fffaf0", low: "#b9ab92", hemi: 1.35, sunC: "#fff6e6", sun: 2.6, ground: "#efe7d4" });
      env.sun.shadow.radius = 1; env.renderer.shadowMap.type = THREE.PCFShadowMap;
      return new Pass(EDGES + `
        uniform vec3 uInk;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 e = uPx / uRes;
          vec3 c = texture2D(tColor, vUv).rgb;
          float k = edges(vUv, e, .012, .22);
          c = mix(c, uInk, k * .92);
          c *= 1. - .035 * hash(floor(vUv * uRes / 2.));
          gl_FragColor = vec4(c, 1.); }`, { uniforms: { uInk: { value: new THREE.Color("#2b2420") } } });
    },
    material(m) { if ("roughness" in m) m.roughness = Math.max(0.4, m.roughness); m.envMap = null; }
  },

  // A console's start-up menu: night blue, things lit from the edges, fine light lines, dust drifting up.
  system: {
    title: "System menu", dark: true,
    tex: { size: 32, flat: true }, patches: ["rim"], dropDetail: true,
    setup(env) {
      const grid = canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = "#0b1226"; g.fillRect(0, 0, w, h);
        g.strokeStyle = "rgba(120,160,255,.16)"; g.lineWidth = 2;
        for (let i = 0; i <= 4; i++) { const p = i * w / 4; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke(); }
      }, 60);
      room(env, { bg: "#060a17", near: 10, far: 30, sky: "#a9bfff", low: "#0b1022", hemi: 0.9, sunC: "#d6e4ff", sun: 1.9, ground: "#56627c", groundMap: grid });
      U.uRimColor.value.set("#8fd4ff"); U.uRim.value = 0.6;
      // Dust drifting upward through the whole table.
      const n = env.phone ? 260 : 520, pos = new Float32Array(n * 3), seed = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos.set([(Math.random() - .5) * 18, Math.random() * 4, (Math.random() - .5) * 10], i * 3); seed[i] = Math.random(); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      const dust = new THREE.Points(geo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uS: { value: env.renderer.getPixelRatio() } },
        vertexShader: `uniform float uTime, uS; attribute float aSeed; varying float vA;
          void main(){ vec3 p = position; p.y = mod(p.y + uTime * (.05 + aSeed * .08), 4.); p.x += sin(uTime * .3 + aSeed * 40.) * .15;
            vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
            gl_PointSize = (2. + aSeed * 3.) * uS * 6. / -mv.z; vA = smoothstep(0., .6, p.y) * smoothstep(4., 3., p.y) * (.35 + .65 * aSeed); }`,
        fragmentShader: "varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(.62, .82, 1.) * smoothstep(.5, 0., d) * vA * .7, 1.); }"
      }));
      dust.frustumCulled = false; env.scene.add(dust);
      this.tick = t => { dust.material.uniforms.uTime.value = t; };
      return new Pass(EDGES + `
        uniform vec3 uLine;
        void main(){
          vec2 e = uPx / uRes;
          vec3 c = texture2D(tColor, vUv).rgb;
          float k = edges(vUv, e, .02, 0.);
          c += uLine * k * .4;
          vec3 g = vec3(0.);
          for (int i = 0; i < 12; i++) { float a = float(i) * 2.39996, r = (2. + float(i)) * uPx * .9;
            vec3 s = texture2D(tColor, vUv + vec2(cos(a), sin(a)) * r / uRes).rgb; g += max(s - .55, 0.); }
          c += g * .07;
          c *= mix(1., .62, smoothstep(.35, 1.05, length((vUv - .5) * vec2(1.2, 1.))));
          gl_FragColor = vec4(c, 1.); }`, { uniforms: { uLine: { value: new THREE.Color("#b8e6ff") } } });
    },
    material(m) {
      if (m.color && !m.vertexColors) m.color.multiplyScalar(0.8);
      if ("roughness" in m) m.roughness = Math.max(0.35, m.roughness);
    }
  }
};

// One look, applied to a table: env holds { renderer, scene, hemi, sun, ground, phone }.
export function useLook(name, env) {
  const L = LOOKS[name]; if (!L) return null;
  document.body.dataset.look = name;
  if (L.dark) document.body.classList.add("dark-hdr");
  if (!env.room) { try { env.room = new URLSearchParams(location.search).get("room") || sessionStorage.getItem("room"); } catch { /* the default room */ } }
  const pass = L.setup(env);
  const pending = new Set();
  function dressMat(m) {
    if (m.userData.looked) return true;
    if (m.isShaderMaterial || m.isRawShaderMaterial) { m.userData.looked = true; return true; }
    let wait = false;
    const lit = "roughness" in m || m.isMeshLambertMaterial || m.isMeshPhongMaterial;
    const opts = lit ? L.tex : { ...L.tex, pastel: false };
    const tagged = !!m.userData.pastel;
    for (const k of ["map", "emissiveMap"]) if (m[k] && !(tagged && k === "map")) {
      const tint = k === "map" && opts.pastel ? m.color : null;
      const r = reduceTex(m[k], opts, tint);
      if (r === undefined) wait = true;
      else { if (tint && r !== m[k]) m.color.set(1, 1, 1); m[k] = r; }
    }
    if (wait) return false;
    if (L.dropDetail) for (const k of ["normalMap", "bumpMap", "roughnessMap", "metalnessMap", "displacementMap", "clearcoatNormalMap"]) if (m[k]) m[k] = null;
    L.material?.(m);
    if (L.patches) patch(m, L.patches);
    m.userData.looked = true; m.needsUpdate = true;
    return true;
  }
  function dress(root) {
    root.traverse(o => {
      if (!o.material) return;
      if (L.cushion) cushion(o);
      const mats = [].concat(o.material);
      // Vertex colours (Skim's blossom) go pastel with everything else.
      const vc = o.geometry?.attributes.color;
      if (L.tex.pastel && vc && !vc.userData?.looked && !o.userData.keepVertexColors && mats.some(m => m.vertexColors && !m.isShaderMaterial)) {
        for (let i = 0; i < vc.count; i++) { const [r, g, b] = pastel(vc.getX(i), vc.getY(i), vc.getZ(i)); vc.setXYZ(i, r, g, b); }
        vc.userData = { looked: true }; vc.needsUpdate = true;
      }
      for (const m of mats) if (!dressMat(m)) pending.add(m);
    });
  }
  return {
    name, title: L.title, pass,
    dress,
    // Colours a diorama sets while running go through the look too.
    paint: L.tex.pastel ? c => pastelColor(c.clone()) : c => c,
    retry() { for (const m of pending) if (dressMat(m)) pending.delete(m); },
    tick(t) { L.tick?.(t); },
    setSize(w, h, dpr) { pass?.setSize(w, h, dpr); },
    render(renderer, scene, camera, t) { if (pass) pass.render(renderer, scene, camera, t); else renderer.render(scene, camera); }
  };
}
