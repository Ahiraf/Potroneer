// Does the substrate actually fit inside the glass?
//
// For every jar type this builds the vessel, stacks three layers the way the
// app does, then fires a ray outward from the axis at each substrate vertex
// and compares how far that vertex sits from the axis with how far the glass
// is in that direction. A positive number is substrate outside the vessel.
//
// It measures against the *built panes*, not against the metrics the jar was
// declared with, which is the point: the interior model and the mesh drifting
// apart is the bug this guards.
//
//   node tools/check-substrate-fit.mjs          (run from the repo root)
//
// Exits non-zero if any jar leaks, so it can gate a commit.

import * as THREE from "three";
import {
  JAR_TYPES,
  jarInnerSilhouette,
  jarSectionFor,
  geoSpecFor,
  geoFootprint,
  buildJar,
} from "../src/jar.js";
import { setJarInterior, substrateBase } from "../src/state.js";
import { buildLayer } from "../src/builders.js";

const LAYERS = [
  { type: "leca", height: 0.2 },
  { type: "charcoal", height: 0.07 },
  { type: "soil", height: 0.16 },
];
const TOLERANCE = 0.001; // 1mm of slack for floating-point noise

const ray = new THREE.Raycaster();
const org = new THREE.Vector3();
const dir = new THREE.Vector3();
const leaked = [];
let slowest = 0;

for (const type of JAR_TYPES) {
  if (type.none) continue;
  const it = { ...type.interior };
  const spec = geoSpecFor(type.id);
  if (spec) it.footprint = geoFootprint(spec);
  setJarInterior(it, jarInnerSilhouette(type.id, it), null);

  let built;
  try {
    built = buildJar(type.id, null, it);
  } catch (e) {
    console.log(`${type.id.padEnd(14)} BUILD FAILED: ${e.message}`);
    leaked.push(type.id);
    continue;
  }

  built.group.updateMatrixWorld(true);
  const glassMats = new Set(built.glassMats || []);
  const panes = [];
  built.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Panes only. Stands, cradles, trays and frame struts are furniture the
    // substrate is allowed to sit above or beside.
    if (mats.some((m) => glassMats.has(m))) panes.push(o);
  });
  if (!panes.length) {
    console.log(`${type.id.padEnd(14)} (no glass to measure — skipped)`);
    continue;
  }

  const t0 = Date.now();
  setJarInterior(it, jarInnerSilhouette(type.id, it), jarSectionFor(type.id, it, panes));
  slowest = Math.max(slowest, Date.now() - t0);

  // Same base the app stacks from — a hair above the jar floor, not on it.
  let y = substrateBase();
  let worst = -Infinity;
  let worstY = null;
  LAYERS.forEach((spec, i) => {
    const layer = { ...spec, slopeX: 0.04, slopeZ: -0.03, seed: 1234 + i };
    const group = buildLayer(layer, y, i === LAYERS.length - 1, LAYERS[i - 1] ?? null);
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry?.attributes?.position) return;
      const pos = o.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const px = pos.getX(k);
        const py = pos.getY(k);
        const pz = pos.getZ(k);
        const d = Math.hypot(px, pz);
        if (d < 1e-4) continue;
        org.set(0, py, 0);
        dir.set(px / d, 0, pz / d);
        ray.set(org, dir);
        const hits = ray.intersectObjects(panes, true);
        if (!hits.length) continue;
        const out = d - hits[0].distance;
        if (out > worst) {
          worst = out;
          worstY = py;
        }
      }
    });
    y += spec.height;
  });

  const leak = worst > TOLERANCE;
  if (leak) leaked.push(type.id);
  console.log(
    `${type.id.padEnd(14)} clearance ${(-worst).toFixed(4).padStart(8)}` +
      `  at y=${worstY?.toFixed(3) ?? "—"}${leak ? "   <<< OUTSIDE THE GLASS" : ""}`,
  );
}

console.log(`\nslowest interior measurement: ${slowest}ms`);
if (leaked.length) {
  console.log(`FAIL — substrate outside the glass in: ${leaked.join(", ")}`);
  process.exit(1);
}
console.log(`PASS — substrate is inside the glass in every jar.`);
