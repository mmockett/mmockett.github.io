// The table: one three.js scene holding a diorama per project. Click one to fly in; its panel opens beside it.
import * as THREE from "three";
import { ease, loaded, TEX_BYTES } from "./lib/kit.js";
import { useLook } from "./looks.js";

const DIORAMAS = {
  skim: () => import("./dioramas/skim.js"),
  aquarium: () => import("./dioramas/aquarium.js"),
  plasm: () => import("./dioramas/plasm.js"),
  opxy: () => import("./dioramas/opxy.js"),
  plinth: () => import("./dioramas/plinth.js")
};

// Roughly how many bytes each model's own files come to, so its placeholder can fill as they arrive (kit.js counts
// them by asset folder); a model with none fills on a timer instead.
const EXPECT = { skim: 1024892 + 7 * TEX_BYTES, aquarium: 3568952 + TEX_BYTES };

export function mountTable({ canvas, projects, labels, phone, reduced, look: lookName, onOpen, onClose, onHover, onDismiss, onRow }) {
  // The scene is sized from the canvas as laid out, not from the window: on iPhone and iPad (and inside an embedding
  // frame) innerWidth/innerHeight can disagree with the box the canvas fills, or change without a resize event,
  // and either one stretches the picture. A ResizeObserver, and a check each frame, keep the two in step.
  let VW = canvas.clientWidth || innerWidth, VH = canvas.clientHeight || innerHeight;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance"});
  // Drawn at up to twice the screen's resolution: phones at their own (capped at 2), and 1x desktop screens
  // supersampled at 1.5 for smoother edges. The frame loop steps this down if frames run slow.
  let dpr = phone ? Math.min(devicePixelRatio, 2) : Math.min(Math.max(devicePixelRatio, 1.5), 2);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const BG = new THREE.Color("#e9e4d8");
  scene.background = BG;           // no fog: the table is flat page colour, and fog faded the models whenever the camera stood back
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 120);
  const T = { value: 0 };

  const hemi = new THREE.HemisphereLight("#fff6e8", "#a99f8c", 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff1db", 2.4);
  sun.position.set(-6, 11, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(phone ? 2048 : 4096, phone ? 2048 : 4096); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8, near: 1, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun);
  // The table is the page's own colour, flat (it takes no light and no shadow), so it meets the header, the panel
  // and the page around it without a step.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ color: "#e9e4d8", toneMapped: false }));
  // No floor is drawn in the page's own look: with no shadows on it, it only showed where a turned model cut through
  // it, and the background is the same colour. (The other looks, for comparing, still dress one.)
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = false; ground.visible = !!lookName; scene.add(ground);
  const look = lookName ? useLook(lookName, { renderer, scene, hemi, sun, ground, phone }) : null;
  look?.dress(ground);

  const ctx = { THREE, renderer, scene, camera, phone, reduced, T, look: look?.name || null, paint: look?.paint, dress: look?.dress };
  // Each stand keeps its place on the table (base) apart from where it is drawn just now (lifted on hover).
  const stands = projects.map((p, i) => ({ p, i, d: null, root: new THREE.Group(), base: new THREE.Vector3(), lift: 0 }));
  stands.forEach(s => scene.add(s.root));

  // Lay the dioramas out in one gentle arc. While the whole row fits with each model at least MIN_PX across, the
  // camera shows it all; narrower than that it becomes a carousel, zooming in to one model per screen, and you move
  // along the row by dragging, swiping, the wheel, the arrow keys or the arrows, settling on a model. The change
  // between the two eases over a moment rather than jumping, and the field of view follows the window's shape.
  const SLOT = 3.35, n = stands.length, ROW_HALF = (n * SLOT) / 2 + 1.0, MIN_PX = 240, ONE = SLOT * 0.64;
  let half = ROW_HALF, halfTarget = ROW_HALF, panMax = 0, pan = 0, panTarget = 0, snapTimer = 0, rowKey = "";
  const arcZ = x => -Math.cos(x / 7) * 0.9 + 0.9;
  const clampPan = x => THREE.MathUtils.clamp(x, -panMax, panMax);
  function layout(first) {
    stands.forEach((s, i) => { const x = (i - (n - 1) / 2) * SLOT; s.base.set(x, 0, arcZ(x)); s.root.position.copy(s.base); });
    const fits = VW * SLOT / (2 * ROW_HALF) >= MIN_PX, was = halfTarget < ROW_HALF;
    halfTarget = fits ? ROW_HALF : Math.max(ONE, 1.1 * VW / VH);        // one model, tall enough for the tallest
    panMax = ROW_HALF - halfTarget;
    if (first || reduced) half = halfTarget;
    if (!fits && (first || !was)) pan = panTarget = -panMax;         // entering the carousel: from the start of the row
    if (fits) panTarget = 0;
    panTarget = clampPan(panTarget);
  }
  const scrolls = () => panMax > 0.05;
  // The overview camera, about 27° up, seeing `half` either side of x along the row.
  function overviewAt(x) {
    const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = Math.max(half / Math.tan(hf / 2), 7), el = THREE.MathUtils.degToRad(27);
    const k = THREE.MathUtils.clamp((ROW_HALF - half) / (ROW_HALF - ONE), 0, 1);   // 0 seeing the whole row … 1 at one model
    const look = new THREE.Vector3(x, 0.6, 0.5 + arcZ(x) * k);       // close in, follow the arc to the model in view
    return { pos: look.clone().add(new THREE.Vector3(0, Math.sin(el) * dist, Math.cos(el) * dist)), look };
  }
  const snapTo = x => { panTarget = clampPan(THREE.MathUtils.clamp(Math.round(x / SLOT + (n - 1) / 2), 0, n - 1) * SLOT - (n - 1) / 2 * SLOT); };
  const worldPerPx = () => (2 * half) / VW;

  // Camera. In focus the projection is shifted (setViewOffset) so the model sits centred in the space the panel leaves,
  // at whatever distance fits its size into that space.
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), off: new THREE.Vector2() };
  let tween = null, focus = null;
  function freeArea() {
    // Same breakpoint as the page's CSS: the panel becomes a bottom sheet only on narrow windows.
    // The header bar takes the top of the window, so the model is framed in the space below it.
    const top = document.querySelector(".hdr")?.offsetHeight || 0;
    if (VW <= 760) { const sheet = VH * 0.58; return { w: VW, h: VH - sheet - top, off: new THREE.Vector2(0, (sheet - top) / 2) }; }
    const panel = Math.min(520, VW * 0.42); return { w: VW - panel, h: VH - top, off: new THREE.Vector2(panel / 2, -top / 2) };
  }
  function viewFor(s) {
    const v = s.d?.view || {}, c = s.base, free = freeArea();   // its place on the table, wherever it is drawn just now
    const fit = (v.fit || (s.d?.footprint || 1.4) * 1.15) * 1.08, el = THREE.MathUtils.degToRad(v.elev ?? 30);
    const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const hFree = 2 * Math.atan(Math.tan(hf / 2) * free.w / VW), vFree = 2 * Math.atan(Math.tan(vf / 2) * free.h / VH);
    const d = Math.max(fit / Math.tan(hFree / 2), fit * (v.aspectH || 0.75) / Math.tan(vFree / 2));
    const look = c.clone().add(new THREE.Vector3(0, v.lookY ?? 0.5, 0));
    const pos = look.clone().add(new THREE.Vector3(0, Math.sin(el) * d, Math.cos(el) * d));
    return { pos, look, off: free.off };
  }
  // A move between two models eases back and up a little on the way, so it reads as one travelling shot;
  // its length follows the distance, so neighbours are quick and the far end of the row is not rushed.
  function fly(to, ms, travel = false) {
    const off = to.off || new THREE.Vector2();
    if (reduced) { cam.pos.copy(to.pos); cam.look.copy(to.look); cam.off.copy(off); tween = null; return; }
    const span = cam.look.distanceTo(to.look);
    ms ??= THREE.MathUtils.clamp(850 + span * 110, 900, 1700);
    tween = { t0: performance.now(), ms, fp: cam.pos.clone(), fl: cam.look.clone(), fo: cam.off.clone(), to: { ...to, off }, arc: travel ? Math.min(span * 0.22, 1.6) : 0 };
  }
  function open(id) {
    const s = stands.find(x => x.p.id === id); if (!s) return false;
    const from = focus; focus = s; fly(viewFor(s), undefined, !!from && from !== s); onOpen?.(s.p); return true;
  }
  function close() {
    if (!focus) return; focus.d?.pointer?.("leave", null, T.value);
    if (scrolls()) pan = panTarget = clampPan(focus.base.x);  // back on the row where the model you had open stands
    focus = null; fly(overviewAt(panTarget)); onClose?.();
  }

  // Labels under each model
  // Each label is the project's own logo where it has one (markup from the page's own SITE data).
  labels.innerHTML = stands.map(s => `<button type="button" class="label" data-id="${s.p.id}" aria-label="${s.p.name}${s.p.platform ? ", " + s.p.platform : ""}"><b>${s.p.logo || s.p.short || s.p.name}</b></button>`).join("");
  const labelEls = [...labels.children];

  // Placeholders: while a model loads, its app icon stands where it will be, faded, filling with colour from left to
  // right as the model's files arrive; once the model is on the table the icon fades away.
  const holds = document.createElement("div"); holds.className = "holds"; labels.before(holds);
  stands.forEach(s => {
    const p = s.p, face = p.icon ? `<img src="${p.icon}" alt="">` : `<span class="glyph">${p.glyph || p.name[0]}</span>`;
    const el = document.createElement("div"); el.className = "hold";
    el.innerHTML = `<div class="g">${face}</div><div class="c">${face}</div>`;
    holds.append(el); Object.assign(s, { hold: el, shown: 0, born: performance.now(), readyAt: 0 });
  });
  const hc = new THREE.Vector3();
  function placeHolds(now, dt) {
    for (const s of stands) {
      const el = s.hold; if (!el) continue;
      const want = s.d ? 1 : EXPECT[s.p.diorama] ? Math.min(0.96, (loaded[s.p.diorama] || 0) / EXPECT[s.p.diorama]) : 0.9 * (1 - Math.exp(-(now - s.born) / 700));
      s.shown = Math.max(s.shown, s.shown + (want - s.shown) * Math.min(1, dt * 6));
      el.style.setProperty("--p", s.shown.toFixed(3));
      hc.copy(s.base).setY(0.6).project(camera);
      el.style.transform = `translate(${(hc.x * 0.5 + 0.5) * VW}px, ${(-hc.y * 0.5 + 0.5) * VH}px) translate(-50%, -50%)`;
      if (s.d && s.shown > 0.985) {
        s.readyAt ||= now;
        if (now - s.readyAt > 150) el.classList.add("done");     // the model has drawn a few frames by now
        if (now - s.readyAt > 900) { el.remove(); s.hold = null; }
      }
    }
  }

  labelEls.forEach(el => el.addEventListener("click", () => { location.hash = el.dataset.id; }));

  // Pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hot = null, down = null;
  function cast(e, list) {
    const r = canvas.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / VW * 2 - 1, -((e.clientY - r.top) / VH) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(list, true)[0] || null;
  }
  const hitboxes = () => stands.filter(s => s.hitbox).map(s => s.hitbox);
  canvas.addEventListener("pointermove", e => {
    if (down?.spin) {                                         // shift-dragging a model round
      const sp = down.spin, s = sp.s;
      s.yaw = sp.yaw + (e.clientX - down.x) * 0.009; s.pitch = THREE.MathUtils.clamp(sp.pitch + (e.clientY - down.y) * 0.006, -0.55, 0.7);
      s.spunAt = performance.now(); canvas.style.cursor = "grabbing"; return;
    }
    if (focus?.d) {
      const h = cast(e, focus.d.hit || []);
      focus.d.pointer?.(down ? "drag" : "move", h, T.value, e, down && { dx: e.clientX - down.x, dy: e.clientY - down.y });
      canvas.style.cursor = h ? (focus.d.cursor || "pointer") : "default";
      hot = null; return;
    }
    if (scrolls() && down) {                                   // dragging along the row
      const dx = e.clientX - down.x; down.vx = (e.clientX - (down.lx ?? down.x)) / Math.max(1, e.timeStamp - (down.lt ?? down.t0)); down.lx = e.clientX; down.lt = e.timeStamp;
      if (Math.abs(dx) > 6) { panTarget = pan = THREE.MathUtils.clamp(down.pan - dx * worldPerPx(), -panMax - 0.8, panMax + 0.8); hot = null; canvas.style.cursor = "grabbing"; return; }
    }
    const h = cast(e, hitboxes());
    hot = h ? h.object.userData.stand : null;
    canvas.style.cursor = hot ? "pointer" : scrolls() ? "grab" : "default";
    onHover?.(hot?.p);
  });
  canvas.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), t0: e.timeStamp, pan };
    // With shift held, a drag turns the model freely: the open one, or on the table the one under the pointer.
    if (e.shiftKey) { const s = focus || cast(e, hitboxes())?.object.userData.stand; if (s?.spin) { down.spin = { s, yaw: s.yaw, pitch: s.pitch }; return; } }
    if (!focus && e.pointerType !== "mouse") { const h = cast(e, hitboxes()); hot = h ? h.object.userData.stand : null; } if (focus?.d) { const h = cast(e, focus.d.hit || []); focus.d.pointer?.("down", h, T.value, e); } });
  canvas.addEventListener("pointerup", e => {
    const d = down; down = null; if (!d) return;
    if (d.spin) { d.spin.s.spunAt = performance.now(); canvas.style.cursor = "grab"; return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y, moved = Math.hypot(dx, dy);
    if (focus?.d) {
      const h = cast(e, focus.d.hit || []);
      if (moved > 14) { focus.d.pointer?.("swipe", h, T.value, e, { dx, dy }); return; }
      if (h) { focus.d.pointer?.("click", h, T.value, e); return; }
      focus.d.pointer?.("up", null, T.value, e);
      const other = cast(e, hitboxes());
      if (other && other.object.userData.stand !== focus) location.hash = other.object.userData.stand.p.id;
      else if (!other) onDismiss?.();
      return;
    }
    if (moved < 10) { const h = cast(e, hitboxes()); if (h) location.hash = h.object.userData.stand.p.id; }
    else if (scrolls()) snapTo(pan - (d.vx || 0) * 260 * worldPerPx());   // a flick carries on to the next model
  });
  canvas.addEventListener("pointerleave", () => { hot = null; focus?.d?.pointer?.("leave", null, T.value); });
  addEventListener("keyup", e => { if (e.key === "Shift" && !down) canvas.style.cursor = "default"; });
  addEventListener("keydown", e => {
    if (e.key === "Shift" && !down) canvas.style.cursor = "grab";
    if (focus?.d?.key && !e.target.closest("input, textarea")) focus.d.key(e, T.value);
    if (!focus && scrolls() && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); snapTo(panTarget + (e.key === "ArrowLeft" ? -SLOT : SLOT)); }
  });
  // A wheel or trackpad scrolls the row too, then settles on the nearest model.
  canvas.addEventListener("wheel", e => {
    if (focus || !scrolls()) return; e.preventDefault();
    panTarget = THREE.MathUtils.clamp(panTarget + (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * worldPerPx(), -panMax - 0.6, panMax + 0.6);
    clearTimeout(snapTimer); snapTimer = setTimeout(() => snapTo(panTarget), 140);
  }, { passive: false });

  // Build every diorama in parallel; each appears as soon as it's ready.
  const ready = Promise.all(stands.map(async s => {
    const name = DIORAMAS[s.p.diorama] ? s.p.diorama : "plinth";
    try {
      const mod = await DIORAMAS[name]();
      s.d = await mod.build({ ...ctx, project: s.p });
    } catch (err) {
      console.error(`[table] ${s.p.id}:`, err);
      s.d = await (await DIORAMAS.plinth()).build({ ...ctx, project: s.p });
    }
    look?.dress(s.d.group);
    // The model hangs from a pivot at about its middle, so shift-drag turns it about itself.
    const cy = s.d.view?.lookY ?? 0.5;
    s.spin = new THREE.Group(); s.spin.position.y = cy; s.d.group.position.y -= cy; s.spin.add(s.d.group); s.root.add(s.spin);
    Object.assign(s, { yaw: 0, pitch: 0, spunAt: -1e9 });
    const r = s.d.footprint || 1.4;
    s.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2.4, 16), new THREE.MeshBasicMaterial({ visible: false }));
    s.hitbox.position.y = 1.1; s.hitbox.userData.stand = s; s.root.add(s.hitbox);
    if (focus === s) fly(viewFor(s), 1);
  }));

  let laidOut = false;
  function resize() {
    VW = canvas.clientWidth || innerWidth; VH = canvas.clientHeight || innerHeight;
    renderer.setSize(VW, VH, false); sizeLook();
    // The field of view widens as the window gets taller, without a step.
    camera.aspect = VW / VH; camera.fov = THREE.MathUtils.clamp(30 + (VH / VW - 0.85) * 22, 30, 40); camera.updateProjectionMatrix();
    layout(!laidOut); laidOut = true;
    const to = focus ? viewFor(focus) : overviewAt(pan); cam.pos.copy(to.pos); cam.look.copy(to.look); cam.off.copy(to.off || new THREE.Vector2()); tween = null;
  }
  function sizeLook() { const b = renderer.getDrawingBufferSize(new THREE.Vector2()); look?.setSize(b.x, b.y, renderer.getPixelRatio()); }
  addEventListener("resize", resize); resize();
  if (globalThis.ResizeObserver) new ResizeObserver(() => { if (canvas.clientWidth !== VW || canvas.clientHeight !== VH) resize(); }).observe(canvas);

  // Frame loop: paused while hidden; resolution steps down if frames run slow.
  const t0 = performance.now(); let last = t0, slow = 0, frames = 0;
  const v3 = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    if (canvas.clientWidth !== VW || canvas.clientHeight !== VH) resize();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (++frames > 30) { if (dt > 0.026) slow++; else slow = Math.max(0, slow - 0.5); if (slow > 40 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(VW, VH, false); sizeLook(); slow = 0; } }
    T.value = reduced ? 6 : (now - t0) / 1000;
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.ms), e = ease(k);
      cam.pos.lerpVectors(tween.fp, tween.to.pos, e); cam.look.lerpVectors(tween.fl, tween.to.look, e); cam.off.lerpVectors(tween.fo, tween.to.off, e);
      if (tween.arc) { const b = Math.sin(Math.PI * e) * tween.arc; v3.subVectors(cam.pos, cam.look).normalize(); cam.pos.addScaledVector(v3, b).y += b * 0.35; }
      if (k >= 1) tween = null;
    }
    half += (halfTarget - half) * (reduced ? 1 : Math.min(1, dt * 5));   // into or out of the carousel, eased
    if (!focus && !tween) {                                   // on the table: the camera rides the pan along the row
      pan += (panTarget - pan) * (reduced ? 1 : Math.min(1, dt * 7));
      const o = overviewAt(pan); cam.pos.copy(o.pos); cam.look.copy(o.look); cam.off.set(0, 0);
    }
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    if (cam.off.lengthSq() > 0.25) camera.setViewOffset(VW, VH, cam.off.x, cam.off.y, VW, VH); else camera.clearViewOffset();
    for (const s of stands) {
      const want = !focus && hot === s && !reduced ? 0.12 : 0;
      s.lift += (want - s.lift) * (reduced ? 1 : Math.min(1, dt * 8));
      s.root.position.set(s.base.x, s.lift, s.base.z);
      if (s.spin) {                                           // after a turn, a short pause, then slowly back to rest
        if (down?.spin?.s !== s && now - s.spunAt > 900) {
          s.yaw = Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw));
          const k = reduced ? 1 : Math.min(1, dt * 1.6); s.yaw -= s.yaw * k; s.pitch -= s.pitch * k;
        }
        s.spin.rotation.set(s.pitch, s.yaw, 0);
      }
      // Only the model you're looking at animates in focus; all of them do on the table.
      if (s.d && (!focus || focus === s || !reduced)) s.d.update?.(T.value, dt, focus === s);
    }
    // Labels sit just in front of each model; the labels of one row (the whole arc, or each pair of the two columns)
    // share one baseline, the lowest of them.
    const at = stands.map(s => { v3.copy(s.base); v3.z += (s.d?.footprint || 1.4) + 0.25; v3.project(camera); return [(v3.x * 0.5 + 0.5) * VW, (-v3.y * 0.5 + 0.5) * VH]; });
    const rowY = stands.map(a => Math.max(...stands.map((b, j) => (Math.abs(b.base.z - a.base.z) < 1.2 ? at[j][1] : -Infinity))));
    labelEls.forEach((el, i) => {
      el.style.transform = `translate(${at[i][0]}px, ${rowY[i]}px) translate(-50%, 0)`;
      el.classList.toggle("hot", hot === stands[i]);
    });
    camera.updateMatrixWorld(); placeHolds(now, dt);
    // Tell the page whether the row scrolls, whether it is at either end, and the height of the models on screen
    // (for the arrows); only when one of them changes.
    if (!focus) {
      v3.set(pan, 0.6, 0.5).project(camera);
      const row = { scrolls: scrolls(), atStart: panTarget <= -panMax + 0.05, atEnd: panTarget >= panMax - 0.05, y: Math.round((-v3.y * 0.5 + 0.5) * VH) };
      const key = JSON.stringify(row);
      if (key !== rowKey) { rowKey = key; onRow?.(row); document.documentElement.style.setProperty("--row-y", `${row.y}px`); }
    } else if (rowKey) { rowKey = ""; onRow?.({ scrolls: scrolls(), atStart: false, atEnd: false }); }
    if (look) { if (frames % 20 === 0) look.retry(); look.tick(T.value); look.render(renderer, scene, camera, T.value); }
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // One model along the row (the arrows on the table).
  const step = d => { if (!focus && scrolls()) snapTo(panTarget + d * SLOT); };

  return { open, close, step, ready, get focus() { return focus?.p.id || null; }, renderer, scene };
}
