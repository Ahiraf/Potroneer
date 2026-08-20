import * as THREE from "three";

// ---------------------------------------------------------------------------
// Cursor ghost
// ---------------------------------------------------------------------------
// Townscaper never lets you wonder where a click will land: a translucent tile
// sits under the cursor, on the surface, before you commit. This is that idea
// for a terrarium — a soft footprint ring on the substrate plus a see-through
// copy of the very piece you are holding, standing exactly where it will stand.
// It removes the guesswork that makes placing things feel fiddly.

function makeRingTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.5)");
  g.addColorStop(0.62, "rgba(255,255,255,0.12)");
  g.addColorStop(0.88, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Fade a cloned model into a preview: see-through, unlit by shadows, no z-fight. */
function makeTransparent(object, opacity) {
  object.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const many = Array.isArray(o.material);
    const cloned = (many ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      c.transparent = true;
      c.opacity = opacity;
      c.depthWrite = false;
      return c;
    });
    o.material = many ? cloned : cloned[0];
  });
}

export function createCursorGhost() {
  const group = new THREE.Group();
  group.name = "cursorGhost";
  group.visible = false;

  const footprint = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: makeRingTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      depthTest: false,
    }),
  );
  footprint.rotation.x = -Math.PI / 2;
  footprint.renderOrder = 3;
  group.add(footprint);

  const preview = new THREE.Group();
  group.add(preview);

  let alive = false;
  let fade = 0;
  let radius = 0.5;

  function clearPreview() {
    preview.clear();
  }

  /** Tint the ring to the current theme accent so it belongs to the world. */
  function setColor(hex) {
    footprint.material.color.set(hex);
  }

  /**
   * Park the ghost at a local-space point.
   * `object` (optional) is a fresh clone to show standing there.
   */
  function showAt(point, r = 0.5, object = null) {
    group.position.set(point.x, point.y + 0.004, point.z);
    radius = r;
    if (object) {
      clearPreview();
      makeTransparent(object, 0.4);
      object.position.set(0, 0, 0);
      preview.add(object);
    }
    if (!alive) {
      alive = true;
      group.visible = true;
    }
  }

  /** Swap in a different piece without moving the ghost. */
  function setItem(object) {
    clearPreview();
    if (!object) return;
    makeTransparent(object, 0.4);
    object.position.set(0, 0, 0);
    preview.add(object);
  }

  function hide() {
    alive = false;
  }

  function update(now, dt) {
    if (!group.visible) return;
    const want = alive ? 1 : 0;
    fade += (want - fade) * Math.min(1, dt / 110);
    if (fade < 0.02 && !alive) {
      group.visible = false;
      clearPreview();
      fade = 0;
      return;
    }
    // a slow breath on the ring, so a ghost never reads as a placed object
    const pulse = 1 + Math.sin(now * 0.004) * 0.05;
    const s = radius * 2 * pulse * (0.7 + fade * 0.3);
    footprint.scale.set(s, s, 1);
    footprint.material.opacity = 0.75 * fade;
    preview.scale.setScalar(0.86 + fade * 0.14);
    preview.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => (m.opacity = 0.4 * fade));
    });
  }

  return { group, showAt, setItem, setColor, hide, update };
}
