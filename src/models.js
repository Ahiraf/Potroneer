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
  // complete showpiece terrariums (placed as objects, lovely in no-jar mode)
  "sp-faceted": { file: "sp-faceted.glb", size: 1.25 },
  "sp-snake": { file: "sp-snake.glb", size: 1.0 },
  "sp-herb": { file: "sp-herb.glb", size: 1.1 },
};

const cache = new Map();

export function preloadModels(onLoaded) {
  const loader = new GLTFLoader();
  Object.entries(MODEL_FILES).forEach(([kind, { file, size }]) => {
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
        scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        cache.set(kind, scene);
        onLoaded?.(kind);
      },
      undefined,
      () => {}, // missing file → procedural fallback, no error spam
    );
  });
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
