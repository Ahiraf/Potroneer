// Renders real 3D thumbnails for the item strip — every chip shows the actual
// object it places (like the reference game's decorations panel), not a colour
// swatch. One shared offscreen renderer paints each catalog item once at
// startup and hands back data-URLs.

import * as THREE from "three";
import { buildDecoration, buildLayer } from "./builders.js";
import { buildJar } from "./jar.js";

const SIZE = 96;

let renderer = null;
let scene = null;
let camera = null;

function ensureStudio() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(SIZE, SIZE);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff3e2, 0x6b5540, 1.1));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(-3, 2, -4);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
}

const _box = new THREE.Box3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();

function snapshot(object) {
  ensureStudio();
  scene.add(object);
  _box.setFromObject(object);
  _box.getCenter(_center);
  _box.getSize(_size);
  const radius = Math.max(_size.x, _size.y, _size.z) * 0.5 || 0.5;
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360) + radius * 0.4;
  camera.position
    .set(1, 0.72, 1)
    .normalize()
    .multiplyScalar(dist)
    .add(_center);
  camera.lookAt(_center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(object);
  return url;
}

// One thumbnail per decoration variant.
export function decorationIcon(kind, variant) {
  return snapshot(buildDecoration(kind, variant));
}

// Base materials: render a little layer disc with its speckle + grains.
export function baseIcon(typeId, layerHeight) {
  const mesh = buildLayer({ type: typeId, height: Math.max(layerHeight, 0.14) }, 0, true);
  mesh.scale.set(0.55, 1.6, 0.55);
  return snapshot(mesh);
}

// Jars: render the actual glass vessel.
export function jarIcon(typeId) {
  const { group } = buildJar(typeId, null);
  return snapshot(group);
}

// Free the GPU context once all thumbnails are made.
export function disposeIconStudio() {
  renderer?.dispose();
  renderer = scene = camera = null;
}
