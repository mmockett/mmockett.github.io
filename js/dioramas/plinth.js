// For a project without a diorama of its own: a plinth holding its icon, so a new section still has a place on the table.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tex, std, shadows, canvasTex } from "../lib/kit.js";

export async function build({ project }) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.3, 1.4, 3, 0.04), std("#d9d3c5", { roughness: 0.8 }));
  base.position.y = 0.15; g.add(base);
  const face = project.icon
    ? new THREE.MeshStandardMaterial({ map: tex(project.icon), roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (c, w, h) => { c.fillStyle = "#111"; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "600 90px Inter, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(project.glyph || project.name[0], w / 2, h / 2); }) });
  const card = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.06, 4, 0.12), [std("#eee"), std("#eee"), std("#eee"), std("#eee"), face, std("#eee")]);
  card.position.set(0, 0.8, 0); card.rotation.x = -0.12; g.add(card);
  shadows(g);
  return { group: g, footprint: 1.0, view: { fit: 0.9, elev: 20, lookY: 0.6 }, hit: [card], update(t) { card.rotation.y = Math.sin(t * 0.5) * 0.15; } };
}
