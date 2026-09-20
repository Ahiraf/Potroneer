import { Color } from "three";

// Model clones can share one material, or an array of materials. Own each
// mesh's colours before editing so another animal, structure or tray icon
// never changes with it. Keep the originals outside serialised scene data.
const originals = new WeakMap();

export function applyTint(object, hex) {
  const tint = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? new Color(hex) : null;
  object?.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material) return;
    let saved = originals.get(mesh);
    if (!saved) {
      if (!tint) return;
      const many = Array.isArray(mesh.material);
      const materials = (many ? mesh.material : [mesh.material]).map(m => m.clone());
      saved = { materials, colors: materials.map(m => m.color?.clone()) };
      originals.set(mesh, saved);
      mesh.material = many ? materials : materials[0];
    }
    saved.materials.forEach((material, i) => {
      const original = saved.colors[i];
      if (!original) return; // depth/shadow materials do not have a base colour
      material.color.copy(original);
      if (tint) material.color.lerp(tint, 0.72);
    });
  });
}
