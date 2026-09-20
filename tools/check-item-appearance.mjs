import assert from "node:assert/strict";
import * as THREE from "three";
import { applyTint } from "../src/item-appearance.js";
import { DECORATIONS } from "../src/catalog.js";
import { buildDecoration } from "../src/builders.js";

// A canvas stub for procedural textures; these tests check mesh/material data.
const context = new Proxy({}, { get: (_, key) => {
  if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
  if (key === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  return () => {};
} });
globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => context }) };

let tested = 0;
for (const def of DECORATIONS.filter(d => ["structures", "animals"].includes(d.cat))) {
  const root = buildDecoration(def.kind, def.variant);
  const before = [];
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    before.push({ mesh, materials, colors: materials.map(m => m.color?.clone()), geometry: mesh.geometry,
      position: mesh.position.clone(), scale: mesh.scale.clone() });
  });
  assert.ok(before.length, `${def.id} has editable meshes`);
  applyTint(root, "#3279de");
  for (const entry of before) {
    const edited = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
    edited.forEach((material, i) => {
      assert.notEqual(material, entry.materials[i], `${def.id}: don't edit a shared material`);
      if (!entry.colors[i]) return;
      assert.ok(entry.materials[i].color.equals(entry.colors[i]), `${def.id}: other instances keep original colours`);
      const want = entry.colors[i].clone().lerp(new THREE.Color("#3279de"), .72);
      assert.ok(material.color.equals(want), `${def.id}: every colour-bearing material tinted`);
      assert.equal(material.map, entry.materials[i].map, `${def.id}: preserve textures`);
    });
    assert.equal(entry.mesh.geometry, entry.geometry);
    assert.ok(entry.mesh.position.equals(entry.position));
    assert.ok(entry.mesh.scale.equals(entry.scale));
  }
  applyTint(root, "#da62a1");
  applyTint(root, null);
  for (const entry of before) {
    const materials = Array.isArray(entry.mesh.material) ? entry.mesh.material : [entry.mesh.material];
    materials.forEach((m, i) => {
      if (entry.colors[i]) assert.ok(m.color.equals(entry.colors[i]), `${def.id}: Default restores exact colour`);
      m.dispose();
    });
    entry.geometry.dispose();
  }
  tested++;
}

// GLBs may have multiple materials, including colourless depth materials.
const shared = new THREE.MeshStandardMaterial({ color: "#876543" });
const colourless = new THREE.MeshDepthMaterial();
const first = new THREE.Mesh(new THREE.BoxGeometry(), [shared, colourless, shared]);
const sibling = new THREE.Mesh(first.geometry, shared);
const original = shared.color.clone();
applyTint(first, "#aabbcc");
assert.ok(sibling.material.color.equals(original));
assert.equal(first.material.length, 3);
assert.ok(first.material[1].isMeshDepthMaterial);
const stableMaterials = [...first.material];
applyTint(first, "#ff8811");
assert.deepEqual(first.material, stableMaterials, "slider updates reuse owned materials");
applyTint(first, null);
assert.ok(first.material[0].color.equals(original));
assert.ok(first.material[2].color.equals(original));
applyTint(first, "not-a-colour");
assert.ok(first.material[0].color.equals(original));
console.log(`item appearance: OK (${tested} structure/animal variants; shared and multi-material models; exact Default restoration)`);
