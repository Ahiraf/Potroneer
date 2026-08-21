// Real-model pipeline: if a photo-textured GLB exists in /public/models for a
// decoration kind, it is used instead of the procedural geometry — this is the
// path to true photorealism (scanned/PBR assets from Poly Haven, Sketchfab
// CC0, Quaternius, etc.). Models load in the background at startup; anything
// missing simply falls back to the procedural builder, so the app always works.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// kind → { file, size } where size is the target world height/footprint the
// model is normalised to (matching the procedural builders' scale).
const MODEL_FILES = {
  deer: { file: "deer.glb", size: 0.45 },
  butterfly: { file: "butterfly.glb", size: 0.14 },
  ladybug: { file: "ladybug.glb", size: 0.09 },
  shell: { file: "snail.glb", size: 0.2 },
  fern: { file: "fern.glb", size: 0.5 },
  leafy: { file: "leafy.glb", size: 0.45 },
  snakeplant: { file: "snakeplant.glb", size: 0.7 },
  mushroom: { file: "mushroom.glb", size: 0.25 },
  driftwood: { file: "driftwood.glb", size: 0.5 },
  stone: { file: "stone.glb", size: 0.25 },
  succulent: { file: "succulent.glb", size: 0.3 },
};

// Complete terrarium models used as JAR types — the whole vessel is the model.
const JAR_MODEL_FILES = {
  "jar-faceted": { file: "sp-faceted.glb", size: 2.3 },
  "jar-snake": { file: "sp-snake.glb", size: 2.0 },
  "jar-herb": { file: "sp-herb.glb", size: 2.1 },
};

const cache = new Map();
// id → measured interior of a whole-terrarium model (see measureInterior)
const jarInteriors = new Map();

export function preloadModels(onLoaded) {
  const loader = new GLTFLoader();
  const all = { ...MODEL_FILES, ...JAR_MODEL_FILES };
  Object.entries(all).forEach(([kind, { file, size }]) => {
    loader.load(
      `/models/${file}`,
      (gltf) => {
        const scene = gltf.scene;
        // normalise: sit on y=0, scale to the target size
        const box = new THREE.Box3().setFromObject(scene);
        const dims = new THREE.Vector3();
        box.getSize(dims);
        const s = size / Math.max(dims.x, dims.y, dims.z);
        scene.scale.setScalar(s);
        box.setFromObject(scene);
        scene.position.y -= box.min.y;
        if (JAR_MODEL_FILES[kind]) {
          // A vessel has to stand on the spot the build is centred on. Exported
          // terrariums rarely sit on their own origin — this one starts in the
          // positive corner of its own space — so a jar model that is only
          // dropped to y = 0 ends up standing beside the table with the soil
          // poured where it should have been.
          const centre = box.getCenter(new THREE.Vector3());
          scene.position.x -= centre.x;
          scene.position.z -= centre.z;
        }
        scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        cache.set(kind, scene);
        if (JAR_MODEL_FILES[kind]) jarInteriors.set(kind, measureInterior(scene));
        onLoaded?.(kind);
      },
      undefined,
      () => {}, // missing file → procedural fallback, no error spam
    );
  });
}

// --------------------------------------------------------------------------
// Where the inside of a whole-terrarium model actually is
// --------------------------------------------------------------------------
// A jar type in jar.js declares its interior by hand, which works for the
// procedural vessels because the same numbers also *build* them. A GLB has no
// such contract: the hand-written guess is unrelated to the mesh, so substrate
// stacked from it ends up under the glass rather than in it. Measure the model
// instead, once, right after it is normalised:
//   • rays down through it find the floor you would pour soil onto;
//   • rays back up from there find the ceiling;
//   • rays in from outside trace the outline of the inner wall.
// Several of these models are scanned with their own contents — a plant, a
// pebble, a moss bed already inside the glass — so every reading is taken from
// a spread of probes and reduced with a median: one obstacle cannot move it,
// but a real surface, which all the probes agree on, does.
// Everything is in the normalised model's own space (bottom of the model at
// y = 0). Returns null if the model is too odd to read, and the declared
// interior is used as before.
function measureInterior(root) {
  root.updateWorldMatrix(true, true);
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.visible) meshes.push(o);
  });
  if (!meshes.length) return null;

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const height = size.y;
  if (!(height > 0)) return null;

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const halfX = size.x / 2;
  const halfZ = size.z / 2;
  const skin = height * 0.03;

  // Which way a hit surface faces, in world space. It is what separates a
  // floor from a ceiling: both are just surfaces the ray passed through.
  const nrm = new THREE.Vector3();
  const nmat = new THREE.Matrix3();
  function facing(hit) {
    if (!hit.face) return 0;
    nmat.getNormalMatrix(hit.object.matrixWorld);
    return nrm.copy(hit.face.normal).applyNormalMatrix(nmat).normalize().y;
  }

  // The floor is the highest upward-facing surface inside the vessel: the
  // glass bottom if it is empty, the top of its own soil bed if the model was
  // exported already planted. Anything level with the outer shell's own lid is
  // the outside of the vessel, not somewhere to pour.
  function floorAt(x, z) {
    ray.set(new THREE.Vector3(x, box.max.y + height, z), down);
    const ups = ray
      .intersectObjects(meshes, true)
      .filter((h) => facing(h) > 0.5 && h.point.y < box.max.y - skin)
      .map((h) => h.point.y);
    if (ups.length) return Math.max(...ups);
    // No readable up-facing surface (single-sided glass, odd exports): fall
    // back to the lowest hit that isn't the shell's own underside.
    const ys = ray
      .intersectObjects(meshes, true)
      .map((h) => h.point.y)
      .sort((a, b) => a - b);
    return ys.find((y) => y > box.min.y + skin) ?? ys[0];
  }
  const floorSamples = [];
  for (const fx of [-0.3, 0, 0.3]) {
    for (const fz of [-0.3, 0, 0.3]) {
      const y = floorAt(mid.x + halfX * fx, mid.z + halfZ * fz);
      if (y !== undefined) floorSamples.push(y);
    }
  }
  if (!floorSamples.length) return null;
  const floorY = clamp(median(floorSamples) - box.min.y, 0, height * 0.5);

  // Ceiling: back up from just above the floor. The first hit is the inside of
  // the lid or dome; an open-topped vessel simply has none.
  const ceilSamples = [];
  for (const fx of [-0.25, 0, 0.25]) {
    ray.set(new THREE.Vector3(mid.x + halfX * fx, box.min.y + floorY + skin, mid.z), up);
    // Only a downward-facing surface is a ceiling; a leaf's topside is not.
    const hit = ray.intersectObjects(meshes, true).find((h) => facing(h) < -0.5);
    ceilSamples.push(hit ? hit.point.y - box.min.y : height);
  }
  const ceilY = median(ceilSamples);
  const bodyHeight = clamp((ceilY - floorY) * 0.9, height * 0.15, height);

  // Walls, read from the outside in. Firing outward from the axis is the
  // obvious way round and the wrong one: the first thing an outward ray meets
  // in a planted model is a stem, and the vessel measures as a sliver. Coming
  // in from beyond the model, the first surface is always the outside of the
  // glass and the second is its inside — the contents are further in still and
  // cannot get in the way.
  const probeY = box.min.y + floorY + Math.min(bodyHeight * 0.2, height * 0.08);
  const dir = new THREE.Vector3();
  const back = new THREE.Vector3();
  const from = new THREE.Vector3();
  const reach = Math.max(halfX, halfZ) * 2 + height;
  function wallAt(a) {
    dir.set(Math.cos(a), 0, Math.sin(a));
    from.set(mid.x + dir.x * reach, probeY, mid.z + dir.z * reach);
    ray.set(from, back.copy(dir).negate());
    const hits = ray.intersectObjects(meshes, true);
    if (!hits.length) return null; // open that way — a bottle down its length
    const p = hits.length > 1 ? hits[1].point : hits[0].point;
    return Math.abs((p.x - mid.x) * dir.x + (p.z - mid.z) * dir.z);
  }
  // Walk the whole way round rather than sampling two axes: a glass trough is
  // not an ellipse, and substrate poured into one has to reach its corners.
  // Where the ray finds nothing the vessel is open that way, so the model's own
  // bounding box is the limit.
  const FOOT_N = 48;
  const radii = new Array(FOOT_N);
  for (let i = 0; i < FOOT_N; i++) {
    const a = (i / FOOT_N) * Math.PI * 2;
    const boxLimit = Math.min(
      Math.abs(halfX / (Math.cos(a) || 1e-6)),
      Math.abs(halfZ / (Math.sin(a) || 1e-6)),
    );
    const r = wallAt(a);
    radii[i] = clamp(r === null ? boxLimit : r, boxLimit * 0.3, boxLimit);
  }
  // One spoke landing on a seam or a leaf leaves a notch in the outline;
  // smooth each reading against its neighbours so the substrate has a clean
  // edge rather than a dent.
  const smooth = radii.map((_, i) =>
    median([radii[(i - 1 + FOOT_N) % FOOT_N], radii[i], radii[(i + 1) % FOOT_N]]),
  );
  // Leave the glass some room: soil pressed exactly against the inner wall
  // z-fights with it, and the jitter every builder adds would poke through.
  const MARGIN = 0.84;
  const rMin = Math.min(...smooth);
  const innerRadius = Math.max(0.08, rMin * MARGIN);
  // The footprint is stored relative to that smallest radius, so it survives
  // any later rescaling of the vessel.
  const footprint = Float32Array.from(smooth, (r) => clamp(r / rMin, 1, 6));

  return {
    innerRadius,
    bodyHeight,
    floorY,
    wallThickness: Math.max(0.02, height * 0.02),
    stretchX: 1, // the footprint carries the shape now
    footprint,
    modelHeight: height,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function median(values) {
  return percentile(values, 0.5);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// The measured interior of a whole-terrarium model, in the model's own space
// (its lowest point at y = 0), or null while it is still loading.
export function getJarModelInterior(id) {
  return jarInteriors.get(id) ?? null;
}

// A fresh instance of the loaded model for this kind, or null to use the
// procedural builder.
export function getModelClone(kind) {
  const m = cache.get(kind);
  if (!m) return null;
  const wrap = new THREE.Group();
  wrap.add(m.clone(true));
  return wrap;
}

// Clone of a whole-terrarium jar model, or null while still loading.
export function getJarModelClone(id) {
  return getModelClone(id);
}

export function isJarModelLoaded(id) {
  return cache.has(id);
}
