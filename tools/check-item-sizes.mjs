// What size does every catalogue item actually come out at?
//
// The sizing system's claim is that a normalised model is comparable to the
// models around it — a bonsai reads as the focal plant, a park bench reads as
// furniture, and neither is decided by which builder happened to emit more
// geometry. This prints the ladder so that claim can be checked, and fails if
// anything lands outside the range a jar can hold.
//
//   node tools/check-item-sizes.mjs            everything, grouped by tier
//   node tools/check-item-sizes.mjs bonsai fern aglaonema parkbench
//
// Runs under Node with a stub canvas, because several builders paint their
// leaves on one. Geometry size never depends on those pixels.
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

const { buildDecoration } = await import("../src/builders.js");
const { DECORATIONS, MM_PER_UNIT } = await import("../src/catalog.js");
const { measureObject, normalizeFactor, tierNameFor } = await import("../src/sizing.js");
const { JAR } = await import("../src/state.js");

const want = process.argv.slice(2);
const rows = [];
const seen = new Set();
const broken = [];

for (const d of DECORATIONS) {
  if (seen.has(d.kind)) continue;
  seen.add(d.kind);
  if (want.length && !want.includes(d.kind)) continue;
  let obj;
  try {
    obj = buildDecoration(d.kind, d.variant);
  } catch (e) {
    broken.push(`${d.kind}: ${e.message}`);
    continue;
  }
  const native = measureObject(obj);
  const k = normalizeFactor(d, obj);
  rows.push({
    kind: d.kind,
    tier: tierNameFor(d),
    h: native.h * k,
    w: native.w * k,
    r: native.r * k,
    k,
  });
}

rows.sort((a, b) => a.tier.localeCompare(b.tier) || b.h - a.h);
let tier = null;
for (const r of rows) {
  if (r.tier !== tier) {
    tier = r.tier;
    console.log(`\n── ${tier}`);
  }
  console.log(
    `   ${r.kind.padEnd(18)} ${(r.h * MM_PER_UNIT).toFixed(0).padStart(4)}mm tall  ` +
    `${(r.w * MM_PER_UNIT).toFixed(0).padStart(4)}mm wide   ×${r.k.toFixed(2)}`,
  );
}

// Nothing may be so large that it cannot stand in the reference jar at all,
// and nothing so small it is a speck. Both are sizing bugs, not style.
const MAX_H = JAR.bodyHeight * 0.45;
const MAX_R = JAR.innerRadius * 0.75;
// The floor is on the *larger* of the two axes, not on height: paving, ponds
// and moss carpets are supposed to be flat, and a path 2mm tall and 42mm
// across is a correctly sized path rather than a speck.
const MIN_SIZE = 0.03;
const bad = rows.filter((r) => r.h > MAX_H || r.r > MAX_R || Math.max(r.h, r.w) < MIN_SIZE);
console.log("");
if (broken.length) {
  console.log(`${broken.length} builder(s) threw:`);
  broken.forEach((b) => console.log(`  ✗ ${b}`));
}
if (bad.length) {
  console.log(`${bad.length} item(s) outside the usable range:`);
  bad.forEach((r) =>
    console.log(`  ✗ ${r.kind} h=${r.h.toFixed(3)} (max ${MAX_H.toFixed(2)}) w=${r.w.toFixed(3)} r=${r.r.toFixed(2)} (max ${MAX_R.toFixed(2)})`),
  );
}
if (bad.length || broken.length) process.exit(1);
console.log(`item sizes: OK (${rows.length} kinds normalised)`);
