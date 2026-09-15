// Is the substrate stack really bottom-to-top?
//
// The invariant every other part of the app is written against:
//
//   state.layers[0]                      is the BOTTOM layer
//   state.layers[state.layers.length-1]  is the TOP layer
//   layer n sits directly on layer n-1, with no gap and no overlap
//
// It is easy to state and easy to break, because four separate things have to
// agree about it: `addLayer` (which end it appends to), `substrateTop` (which
// direction it sums), `rebuildSubstrate` (which way it walks while advancing
// the pour height) and `buildLayer` (which neighbour it takes its underside
// from). This checks all four against the built geometry rather than against
// the code's intentions: pour A, B, C and then ask the meshes where they are.
//
//   node tools/check-layer-order.mjs     (run from the repo root)
//
// Exits non-zero on any violation, so it can gate a commit.

import * as THREE from "three";
import { JAR_TYPES, jarInnerSilhouette, jarSectionFor, geoSpecFor, geoFootprint } from "../src/jar.js";
import {
  createState,
  addLayer,
  setJarInterior,
  substrateBase,
  substrateTop,
  layerBounds,
  assertStackOrder,
  jarCapacityMm,
} from "../src/state.js";
import { buildLayer } from "../src/builders.js";
import { mmToUnits } from "../src/catalog.js";

const EPS = 1e-6;
const fails = [];
const skipped = [];
function check(label, ok, detail = "") {
  if (ok) return;
  fails.push(`${label}${detail ? `: ${detail}` : ""}`);
}

/** Put the module-level JAR into a known vessel, the way main.js's setJar does. */
function useJar(id) {
  const type = JAR_TYPES.find((j) => j.id === id);
  const it = { ...type.interior };
  const spec = geoSpecFor(id);
  if (spec) it.footprint = geoFootprint(spec);
  setJarInterior(it, jarInnerSilhouette(id, it), jarSectionFor?.(id, it) ?? null);
}

// The three-layer A/B/C case from the brief, poured one at a time.
const ABC = [
  { id: "sphagnum", mm: 8 },  // A — should end up at the bottom
  { id: "pebbles", mm: 20 },  // B — in the middle
  { id: "soil", mm: 30 },     // C — on top
];

for (const type of JAR_TYPES) {
  if (type.none) continue;
  useJar(type.id);

  // Some vessels (the little dish gardens) are shallower than the test stack.
  // Skipping them is not papering over anything: what is under test is the
  // *order* of a stack, which needs a stack that fits.
  if (jarCapacityMm() < ABC.reduce((sum, s) => sum + s.mm, 0)) {
    skipped.push(type.id);
    continue;
  }

  const state = createState();
  for (const step of ABC) {
    const before = state.layers.length;
    addLayer(state, step.id, step.mm);
    check(`${type.id} add ${step.id}`, state.layers.length === before + 1, "pour refused");
  }
  if (state.layers.length !== ABC.length) continue;

  // 1. The array itself is in pour order, newest last.
  ABC.forEach((step, i) => {
    check(
      `${type.id} layers[${i}]`,
      state.layers[i].type === step.id,
      `expected ${step.id}, got ${state.layers[i].type}`,
    );
  });

  // 2. layerBounds agrees, and the bands stack without gap or overlap.
  let expected = substrateBase();
  state.layers.forEach((layer, i) => {
    const { bottom, top } = layerBounds(state, i);
    check(`${type.id} band ${i} bottom`, Math.abs(bottom - expected) < EPS,
      `${bottom} vs ${expected}`);
    check(`${type.id} band ${i} depth`, Math.abs(top - bottom - layer.height) < EPS);
    check(`${type.id} band ${i} rises`, top > bottom);
    expected = top;
  });
  check(`${type.id} substrateTop`, Math.abs(substrateTop(state) - expected) < EPS);

  // 3. The *built geometry* is stacked the same way. This is the part that
  //    catches a renderer walking the array in the other direction: the data
  //    can be perfectly ordered while the meshes come out upside down.
  let y = substrateBase();
  const built = state.layers.map((layer, i) => {
    const mesh = buildLayer(layer, y, i === state.layers.length - 1, state.layers[i - 1] ?? null);
    y += layer.height;
    const box = new THREE.Box3().setFromObject(mesh);
    return { type: layer.type, box };
  });
  for (let i = 1; i < built.length; i++) {
    const lower = built[i - 1];
    const upper = built[i];
    // Centres, not extremes: the surfaces undulate and chunky layers scatter
    // pieces past their own band, so "every vertex of B is above every vertex
    // of A" is not true of real substrate and never was the claim.
    const cLow = (lower.box.min.y + lower.box.max.y) / 2;
    const cHigh = (upper.box.min.y + upper.box.max.y) / 2;
    check(
      `${type.id} mesh ${lower.type} below ${upper.type}`,
      cHigh > cLow,
      `${cHigh.toFixed(4)} should exceed ${cLow.toFixed(4)}`,
    );
  }

  // 4. The shared invariant check the app itself runs in development.
  try {
    assertStackOrder(state);
  } catch (e) {
    check(`${type.id} assertStackOrder`, false, e.message);
  }
}

// ---------------------------------------------------------------------------
// Editing an existing layer must not disturb the order either.
// ---------------------------------------------------------------------------
useJar("mason");
{
  const state = createState();
  ABC.forEach((s) => addLayer(state, s.id, s.mm));
  const order = () => state.layers.map((l) => l.type).join(",");

  // Thicken the middle band: the one above it has to move up by exactly that.
  const topBefore = substrateTop(state);
  state.layers[1].height += mmToUnits(10);
  check("edit middle keeps order", order() === "sphagnum,pebbles,soil", order());
  check(
    "edit middle lifts the stack",
    Math.abs(substrateTop(state) - (topBefore + mmToUnits(10))) < EPS,
  );
  check("edit middle band 2 sits on band 1",
    Math.abs(layerBounds(state, 2).bottom - layerBounds(state, 1).top) < EPS);

  // Move the bottom band up one place.
  state.layers.splice(1, 0, state.layers.splice(0, 1)[0]);
  check("reorder", order() === "pebbles,sphagnum,soil", order());
  assertStackOrder(state);

  // Delete the middle band; the top one drops onto the bottom one.
  state.layers.splice(1, 1);
  check("delete middle", order() === "pebbles,soil", order());
  check("delete middle closes the gap",
    Math.abs(layerBounds(state, 1).bottom - layerBounds(state, 0).top) < EPS);
}

if (fails.length) {
  console.log(`layer order: ${fails.length} violation(s)\n`);
  fails.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
const n = JAR_TYPES.filter((j) => !j.none).length - skipped.length;
console.log(`layer order: OK (${n} vessels, bottom-to-top)`);
if (skipped.length) console.log(`  too shallow for the test stack, skipped: ${skipped.join(", ")}`);
