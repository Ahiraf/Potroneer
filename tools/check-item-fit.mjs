// Does every placed item actually stay inside the glass?
//
// Placement used to clamp an object's *origin* to the interior, which says
// nothing about the object. A plant standing legally at the rim of a bowl has
// its crown outside the vessel, because the interior up at crown height is
// narrower than it is down at the soil. This drives the real containment
// routine the app uses — `clampBodyInside` in sizing.js — and then checks the
// answer independently, against the vessel's own measured section:
//
//   • push every catalogue item hard against the wall of every jar shape and
//     confirm the clamp brings the whole body back inside;
//   • do it at the largest size the size slider allows (220%), which is where
//     a containment rule fails if it is going to;
//   • do it on a full substrate stack as well as an empty jar, because a high
//     surface puts the piece up where the vessel has shouldered in.
//
//   node tools/check-item-fit.mjs        (run from the repo root)
//
// Exits non-zero if anything ends up outside, so it can gate a commit.
import * as THREE from "three";

const ctxStub = new Proxy({}, { get: (t, k) => {
  if (k === "canvas") return { width: 256, height: 256 };
  if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern")
    return () => ({ addColorStop() {} });
  if (k === "measureText") return () => ({ width: 10 });
  if (k === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  return () => {};
}});
globalThis.document = {
  createElement: () => ({ width: 256, height: 256, getContext: () => ctxStub, style: {} }),
};

const { JAR_TYPES, jarInnerSilhouette, jarSectionFor, geoSpecFor, geoFootprint } =
  await import("../src/jar.js");
const {
  setJarInterior, createState, addLayer, substrateTop, substrateBase, insideJarAt, JAR,
} = await import("../src/state.js");
const { buildDecoration } = await import("../src/builders.js");
const { DECORATIONS } = await import("../src/catalog.js");
const {
  measureObject, normalizeFactor, clampBodyInside, maxScaleAt, GLASS_CLEARANCE,
} = await import("../src/sizing.js");

// The slider's ceiling. If containment holds here it holds everywhere below.
const MAX_USER_SCALE = 2.2;
// Verified with finer sampling than the clamp itself uses, so the test is not
// simply agreeing with the routine's own approximation.
const VERIFY_RINGS = 32;
const VERIFY_SLICES = 11;
// The clamp works to a clearance of GLASS_CLEARANCE; allow a hair of slack for
// the binary search's last step rather than demanding an exact landing.
const SLACK = 0.004;

function useJar(id) {
  const type = JAR_TYPES.find((j) => j.id === id);
  const it = { ...type.interior };
  const spec = geoSpecFor(id);
  if (spec) it.footprint = geoFootprint(spec);
  setJarInterior(it, jarInnerSilhouette(id, it), jarSectionFor?.(id, it) ?? null);
}

/** Independent check: is a cylinder of (r, h) at (x, z) on `groundY` inside? */
function verify(x, z, groundY, r, h, margin) {
  let worst = Infinity;
  for (let iy = 0; iy < VERIFY_SLICES; iy++) {
    const y = groundY + (h * iy) / (VERIFY_SLICES - 1);
    for (let ia = 0; ia < VERIFY_RINGS; ia++) {
      const a = (ia / VERIFY_RINGS) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (!insideJarAt(y, px, pz, margin - SLACK)) worst = Math.min(worst, -1);
    }
  }
  return worst > 0;
}

// Measure every catalogue kind once, under the mason jar's metrics — native
// geometry does not depend on the vessel.
useJar("mason");
const items = [];
const seen = new Set();
for (const d of DECORATIONS) {
  if (seen.has(d.kind)) continue;
  seen.add(d.kind);
  let obj;
  try {
    obj = buildDecoration(d.kind, d.variant);
  } catch {
    continue;
  }
  items.push({ def: d, native: measureObject(obj), k: normalizeFactor(d, obj) });
}

const fails = [];
let placements = 0;

for (const type of JAR_TYPES) {
  if (type.none) continue;
  for (const filled of [false, true]) {
    useJar(type.id);
    const state = createState();
    if (filled) {
      // A real stack, so the surface sits well up the vessel where the glass
      // has started to close in. This is the case origin-clamping got wrong.
      addLayer(state, "leca", 25);
      addLayer(state, "charcoal", 7);
      addLayer(state, "soil", 35);
    }
    const ground = substrateTop(state);
    if (ground > JAR.floorY + JAR.bodyHeight) continue; // stack refused: not this test

    for (const item of items) {
      const jarK = Math.min(1.25, Math.max(0.55, JAR.innerRadius / 1.0));
      const norm = item.k * jarK;
      for (const user of [1, MAX_USER_SCALE]) {
        // Aim well outside the glass from eight directions — the clamp's job
        // is to bring it back, and a vessel that is not round has to be
        // approached from more than one heading to be tested at all.
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const reach = JAR.innerRadius * 2.5;
          const x0 = Math.cos(a) * reach;
          const z0 = Math.sin(a) * reach;

          // The size slider clamps the scale first; placement clamps position.
          const scale = maxScaleAt(
            0, 0, ground, item.native.r * norm, item.native.h * norm, user, GLASS_CLEARANCE,
          );
          const r = item.native.r * norm * scale;
          const h = item.native.h * norm * scale;
          const spot = clampBodyInside(x0, z0, ground, r, h, GLASS_CLEARANCE);
          placements++;
          if (!verify(spot.x, spot.z, ground, r, h, GLASS_CLEARANCE)) {
            fails.push(
              `${type.id}${filled ? " (filled)" : ""} ${item.def.kind} @${user}× ` +
              `heading ${((a * 180) / Math.PI).toFixed(0)}°: r=${r.toFixed(3)} h=${h.toFixed(3)} ` +
              `landed (${spot.x.toFixed(3)}, ${spot.z.toFixed(3)})`,
            );
          }
        }
      }
    }
  }
}

if (fails.length) {
  console.log(`item fit: ${fails.length} of ${placements} placements left the jar\n`);
  fails.slice(0, 25).forEach((f) => console.log(`  ✗ ${f}`));
  if (fails.length > 25) console.log(`  … and ${fails.length - 25} more`);
  process.exit(1);
}
console.log(`item fit: OK (${placements} placements, every body inside the glass)`);
