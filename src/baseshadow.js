import * as THREE from "three";
import { JAR, jarPolar, jarRadiusAt } from "./state.js";

// ---------------------------------------------------------------------------
// Base placement shadow
// ---------------------------------------------------------------------------
// Pouring a substrate layer is the one move in the app where what you are
// holding has no shape you can see. A plant has a ghost of itself under the
// tweezers; a scoop of leca has nothing, so the first layer always lands as a
// surprise. This draws it before you commit: the jar's own cross-section, at
// the exact height the layer would settle, tinted green while the pour is
// possible and dulled to red when it is not.
//
// It is deliberately the *vessel's* outline rather than a generic disc. A
// rectangular case fills rectangularly, and a marker that promised a circle
// there would be lying about the very thing it exists to show.

const VALID = 0x7fd07f;
const INVALID = 0xd8736b;

/** Points around the jar's footprint at height `y`, scaled to `k` of full. */
function footprintPoints(y, k = 1, segments = 72) {
  const radius = jarRadiusAt(y) * k;
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const [x, z] = jarPolar(a, radius);
    points.push(new THREE.Vector2(x, z));
  }
  return points;
}

/** A soft radial falloff, so the marker reads as light on the ground. */
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createBaseShadow() {
  const group = new THREE.Group();
  group.name = "baseShadow";
  group.visible = false;

  // The filled silhouette: the layer's actual footprint, laid flat.
  const fill = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(footprintPoints(0))),
    new THREE.MeshBasicMaterial({
      color: VALID,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.renderOrder = 3;
  group.add(fill);

  // Its edge, drawn brighter — a filled shape alone at this opacity reads as a
  // stain on the substrate rather than as a boundary.
  const edge = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: VALID,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: false,
    }),
  );
  edge.renderOrder = 4;
  group.add(edge);

  // The point the pointer is actually over. The layer itself is jar-wide and
  // centred, so without this the marker would sit perfectly still while the
  // cursor moved across it and stop reading as "yours".
  const dot = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture(),
      color: VALID,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
    }),
  );
  dot.rotation.x = -Math.PI / 2;
  dot.renderOrder = 5;
  group.add(dot);

  let alive = false;
  let fade = 0;
  let valid = true;
  let shapeY = null; // the height the silhouette was last built for
  let released = 0; // 1 right after a placement, decaying — the confirm flash

  /** Rebuild the outline for a new settle height (or a new vessel shape). */
  function reshape(y) {
    const points = footprintPoints(y);
    fill.geometry.dispose();
    fill.geometry = new THREE.ShapeGeometry(new THREE.Shape(points));
    edge.geometry.dispose();
    edge.geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0)),
    );
    shapeY = y;
  }

  /**
   * Park the marker. `y` is the height the layer would settle at, `point` the
   * spot under the cursor, and `ok` whether the pour can actually happen.
   */
  function showAt(y, point, ok = true) {
    if (shapeY === null || Math.abs(shapeY - y) > 0.02) reshape(y);
    group.position.y = y + 0.006;
    if (point) {
      dot.visible = true;
      dot.position.set(point.x, 0.004, point.z);
    } else {
      dot.visible = false;
    }
    valid = ok;
    const colour = ok ? VALID : INVALID;
    fill.material.color.setHex(colour);
    edge.material.color.setHex(colour);
    dot.material.color.setHex(colour);
    if (!alive) {
      alive = true;
      group.visible = true;
    }
  }

  function hide() {
    alive = false;
  }

  /**
   * The layer landed. The marker flares once and then fades out on its own,
   * rather than blinking off the instant the thing it described became real —
   * the flare is what ties the pour to the spot you aimed at.
   */
  function confirm() {
    released = 1;
    alive = false;
  }

  /** A new vessel means a new cross-section; forget the cached outline. */
  function invalidate() {
    shapeY = null;
  }

  function update(now, dt, calm = false) {
    if (!group.visible) return;
    const want = alive ? 1 : 0;
    // The confirm flare outlives the hide that comes with it, so the marker
    // never simply vanishes at the moment of placement.
    if (released > 0) released = Math.max(0, released - dt / 520);
    fade += (want - fade) * Math.min(1, dt / 120);
    const shown = Math.max(fade, released);
    if (shown < 0.02 && !alive) {
      group.visible = false;
      fade = 0;
      return;
    }
    // A slow breath while it waits, and a brief swell as it is released. Both
    // are motion for its own sake, so reduced motion gets neither.
    const breath = calm ? 1 : 1 + Math.sin(now * 0.0035) * 0.012;
    const flare = calm ? 1 : 1 + released * 0.09;
    const s = breath * flare;
    fill.scale.set(s, s, 1);
    edge.scale.set(s, s, 1);
    fill.material.opacity = (valid ? 0.22 : 0.3) * shown;
    edge.material.opacity = (valid ? 0.9 : 0.95) * shown * (1 - released * 0.35);
    const d = (calm ? 0.34 : 0.34 + Math.sin(now * 0.005) * 0.03) * jarRadiusAt(group.position.y);
    dot.scale.set(d, d, 1);
    dot.material.opacity = 0.8 * fade;
  }

  return { group, showAt, hide, confirm, invalidate, update, isValid: () => valid };
}

/** Where a fresh layer of `height` would settle, and whether it fits at all. */
export function layerLanding(top, height, remaining) {
  return { y: Math.min(top, JAR.floorY + JAR.bodyHeight), fits: remaining >= height };
}
