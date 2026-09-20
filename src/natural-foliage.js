import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { grainMaps, leafBlade, tintBlade } from "./natural-materials.js";

const TAU = Math.PI * 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const greens = ["#456d24", "#628f30", "#799f39", "#385b23", "#8aa449"];

function foliageMesh(parts) {
  const geometry = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, envMapIntensity: 0.35, side: THREE.DoubleSide,
  }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function naturalGrass() {
  const group = new THREE.Group(), parts = [];
  for (let i = 0; i < 28; i++) {
    const length = 0.065 + Math.random() * 0.14;
    const blade = tintBlade(leafBlade(length, 0.006 + Math.random() * 0.005, 0.25 + Math.random() * 0.7), pick(greens));
    blade.rotateX((Math.random() - 0.5) * 0.3);
    blade.rotateY(Math.random() * TAU);
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 0.036;
    blade.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    parts.push(blade);
  }
  group.add(foliageMesh(parts));
  return group;
}

export function naturalMoss({ colors = greens, radius = 0.19, count = 190, dome = 0.065, ball = false } = {}) {
  const group = new THREE.Group(), parts = [];
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, ball ? Math.PI : Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(colors[0]).multiplyScalar(.32), ...grainMaps("soil"), bumpScale: 0.004, roughness: 1, envMapIntensity: 0.25 }));
  mound.scale.set(radius * (ball ? 0.88 : 0.92), ball ? radius * 0.76 : dome * 0.80, radius * (ball ? 0.88 : 0.92));
  mound.position.y = ball ? radius * 0.70 : 0;
  mound.castShadow = mound.receiveShadow = true;
  group.add(mound);
  const transform = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963 + Math.random() * 0.5;
    const t = Math.sqrt((i + 0.5) / count);
    let x, y, z;
    if (ball) {
      const polar = Math.acos(1 - 1.62 * (i + 0.5) / count);
      x = Math.cos(a) * Math.sin(polar) * radius * 0.88;
      z = Math.sin(a) * Math.sin(polar) * radius * 0.88;
      y = radius * 0.70 + Math.cos(polar) * radius * 0.76;
      transform.rotation.set(Math.sin(a) * polar * 0.55, a, -Math.cos(a) * polar * 0.55);
    } else {
      const r = t * radius * (0.90 + 0.07 * Math.sin(a * 5));
      x = Math.cos(a) * r; z = Math.sin(a) * r;
      y = dome * 0.80 * Math.sqrt(Math.max(0, 1 - (r / (radius * 0.92)) ** 2));
      transform.rotation.set((Math.random() - 0.5) * 0.6, a, (Math.random() - 0.5) * 0.6);
    }
    transform.position.set(x, y, z);
    transform.updateMatrix();
    const shootH = (0.023 + Math.random() * 0.028) * Math.min(1, radius / 0.12);
    const hex = pick(colors);
    // Spiralling pairs of tiny lance leaves are what make moss look feathery,
    // instead of an arrangement of green balls or oversized cones.
    for (let j = 0; j < 7; j++) {
      const blade = tintBlade(leafBlade(shootH * (0.62 + j * 0.045), shootH * 0.17, 0.30, 3), hex);
      blade.rotateZ(0.65 + Math.random() * 0.45);
      blade.rotateY(j * 2.399963);
      blade.translate(0, shootH * j / 9, 0);
      blade.applyMatrix4(transform.matrix);
      parts.push(blade);
    }
  }
  group.add(foliageMesh(parts));
  return group;
}

// Canopies are sprays of individually folded leaves, with gaps between them.
// Their outline and shadows remain readable from outside a closed jar.
export function naturalCanopy(position, colors, radius) {
  const group = new THREE.Group(), parts = [];
  const twigMat = new THREE.MeshStandardMaterial({ color: "#685035", roughness: 0.96 });
  for (let shoot = 0; shoot < 18; shoot++) {
    const a = shoot * 2.399963;
    const dir = new THREE.Vector3(Math.cos(a), -0.15 + Math.random() * 0.85, Math.sin(a)).normalize();
    const length = radius * (0.8 + Math.random() * 0.9);
    const tip = dir.clone().multiplyScalar(length);
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0018, length, 4), twigMat);
    twig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    twig.position.copy(tip).multiplyScalar(0.5);
    group.add(twig);
    for (let j = 0; j < 8; j++) {
      const base = tip.clone().multiplyScalar(0.18 + j * 0.11);
      const geo = tintBlade(leafBlade(radius * (0.55 + Math.random() * 0.30), radius * 0.40, 0.28), pick(colors));
      geo.rotateX(0.75 + Math.random() * 0.65);
      geo.rotateY(a + (j % 2 ? 0.95 : -0.95));
      geo.translate(base.x, base.y, base.z);
      parts.push(geo);
    }
  }
  group.add(foliageMesh(parts));
  group.position.copy(position);
  return group;
}

export function naturalStone({ grays = ["#8f877b", "#9a9186", "#7d766b", "#a49b8e"] } = {}) {
  const group = new THREE.Group();
  const radius = 0.12 + Math.random() * 0.08;
  const geometry = new THREE.SphereGeometry(radius, 28, 20);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / radius, y = p.getY(i) / radius, z = p.getZ(i) / radius;
    const k = 1 + 0.09 * Math.sin(x * 8 + z * 4) * Math.cos(y * 7) + 0.07 * Math.cos(z * 11 + y * 3);
    p.setXYZ(i, x * radius * k, Math.max(-0.56, y * k * 0.8) * radius, z * radius * k * 0.86);
  }
  geometry.computeVertexNormals();
  const stone = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: pick(grays), ...grainMaps("rock"), bumpScale: 0.005, roughness: 0.94, envMapIntensity: 0.5,
  }));
  stone.position.y = radius * 0.56;
  stone.castShadow = stone.receiveShadow = true;
  group.add(stone);
  return group;
}
