import * as THREE from "three";

// ---------------------------------------------------------------------------
// Hover highlight
// ---------------------------------------------------------------------------
// The grab handles say "these pieces can be picked up". They do not say *which
// one* this press would take — with a dozen plants crowded into a small jar,
// the nearest dot and the piece actually under the cursor are often not the
// same thing, and you find out by picking up the wrong fern.
//
// This draws the answer on the piece itself: a soft shell around the exact
// object a press would act on. It is built as an inverted hull — the piece's
// own geometry, grown slightly and drawn inside-out — so it hugs a fern's
// fronds and a cottage's gables rather than ringing both with the same
// generic circle. Only ever one object at a time, so the cost is one clone.

export function createHighlight() {
  const group = new THREE.Group();
  group.name = "hoverHighlight";
  group.visible = false;
  group.renderOrder = 2;

  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.BackSide, // inside-out: only the grown shell's far face shows
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  let current = null; // the object the shell was built from
  let alive = false;
  let fade = 0;
  let grow = 1.05;

  function clearShell() {
    for (const child of [...group.children]) {
      child.geometry?.dispose?.();
      group.remove(child);
    }
  }

  /**
   * Build the shell from `object`'s meshes. Geometry is shared with the
   * original rather than copied — an inverted hull only needs the same
   * vertices drawn with a different material, and cloning a fern's worth of
   * buffers on every hover change is exactly the stutter this should not add.
   */
  function build(object) {
    clearShell();
    object.updateWorldMatrix(true, false);
    const inverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
    object.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const shell = new THREE.Mesh(o.geometry, material);
      // Meshes deep inside the piece carry their own local transform; bake the
      // path from the piece's root down to this mesh so the shell sits exactly
      // over it rather than collapsing to the root's origin.
      o.updateWorldMatrix(true, false);
      shell.matrixAutoUpdate = false;
      shell.matrix.multiplyMatrices(inverse, o.matrixWorld);
      shell.renderOrder = 2;
      group.add(shell);
    });
  }

  /** Highlight `object` (a decoration group), or nothing when given null. */
  function set(object, colour = 0xffffff) {
    if (object === current) {
      if (object) material.color.set(colour);
      return;
    }
    current = object;
    if (!object) {
      alive = false;
      return;
    }
    build(object);
    material.color.set(colour);
    alive = true;
    group.visible = true;
  }

  function hide() {
    set(null);
  }

  /** Track the piece as it is dragged, so the shell never lags behind it. */
  function follow() {
    if (!current || !group.visible) return;
    group.position.copy(current.position);
    group.quaternion.copy(current.quaternion);
    group.scale.copy(current.scale).multiplyScalar(grow);
  }

  function update(now, dt, calm = false) {
    if (!group.visible) return;
    const want = alive ? 1 : 0;
    fade += (want - fade) * Math.min(1, dt / 110);
    if (fade < 0.02 && !alive) {
      group.visible = false;
      fade = 0;
      clearShell();
      return;
    }
    // The shell breathes very slightly, which is what keeps it reading as a
    // light on the piece rather than as a second, larger piece behind it.
    const pulse = calm ? 0 : Math.sin(now * 0.005) * 0.008;
    grow = 1.028 + fade * 0.022 + pulse;
    material.opacity = 0.3 * fade;
    follow();
  }

  return { group, set, hide, follow, update, current: () => current };
}
