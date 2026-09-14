import * as THREE from "three";
import { JAR, jarPointAt, jarReach } from "./state.js";

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

// The marker traces the same outline the substrate is lofted against, through
// the same function — so what it promises and what lands are the one shape by
// construction, not by two pieces of code agreeing to be careful.
const PREVIEW_MARGIN = 0.022;

/**
 * The interior boundary at height `y`, as a flat ring of world XZ points.
 *
 * Everything here lives in the horizontal plane already — no geometry is built
 * in XY and rotated down afterwards. That rotation was the source of two bugs
 * at once: the outline never got it, so it stood up as a vertical hoop around
 * the jar; and the fill that did get it came out mirrored, because rotating
 * −90° about X sends (x, y, 0) to (x, 0, −y), not (x, 0, y). A symmetric jar
 * hid the mirror. An asymmetric one (kite, wedge) would not have.
 */
function footprintRing(y, k = 1, segments = 72) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const [x, z] = jarPointAt(y, a, k, PREVIEW_MARGIN);
    pts.push(x, z);
  }
  return pts;
}

/** A filled disc of that ring, as a triangle fan about the centre, in XZ. */
function ringFillGeometry(ring) {
  const n = ring.length / 2;
  const pos = new Float32Array((n + 1) * 3); // centre + ring
  for (let i = 0; i < n; i++) {
    pos[(i + 1) * 3] = ring[i * 2];
    pos[(i + 1) * 3 + 2] = ring[i * 2 + 1];
  }
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** The same ring as a closed outline, in XZ. */
function ringEdgeGeometry(ring) {
  const n = ring.length / 2;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = ring[i * 2];
    pos[i * 3 + 2] = ring[i * 2 + 1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
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

  // The marker is depth-tested like anything else in the room. It used to be
  // drawn with depthTest off so it could never be hidden — which meant a wide,
  // bright outline painted itself over the table, the jar and whatever else
  // was in front of it, reading as a hoop floating in the scene rather than as
  // a mark on the substrate. depthWrite stays off so it does not occlude the
  // things it lies against, and polygonOffset lifts it off the surface it sits
  // a few millimetres above without letting them z-fight.
  const surfaceMaterial = (opts) =>
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
      ...opts,
    });

  // The filled silhouette: the layer's actual footprint, laid flat.
  const fill = new THREE.Mesh(
    ringFillGeometry(footprintRing(0)),
    surfaceMaterial({ color: VALID, opacity: 0.22 }),
  );
  fill.renderOrder = 3;
  group.add(fill);

  // Its edge, drawn brighter — a filled shape alone at this opacity reads as a
  // stain on the substrate rather than as a boundary.
  const edge = new THREE.LineLoop(
    ringEdgeGeometry(footprintRing(0)),
    new THREE.LineBasicMaterial({
      color: VALID,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      depthTest: true,
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
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  // A symmetric quad, so rotating it down carries no mirror the way a shaped
  // outline would.
  dot.rotation.x = -Math.PI / 2;
  dot.renderOrder = 5;
  group.add(dot);

  let alive = false;
  let fade = 0;
  let valid = true;
  let shapeY = null; // the height the silhouette was last built for
  let released = 0; // 1 right after a placement, decaying — the confirm flash
  let dotAngle = 0; // heading of the cursor dot, for sizing it to the local reach

  /** Rebuild the outline for a new settle height (or a new vessel shape). */
  function reshape(y) {
    const ring = footprintRing(y);
    fill.geometry.dispose();
    fill.geometry = ringFillGeometry(ring);
    edge.geometry.dispose();
    edge.geometry = ringEdgeGeometry(ring);
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
      dotAngle = Math.atan2(point.z, point.x) || 0;
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
    // Both live in XZ now, so the swell is in X and Z — scaling Y would lift
    // the marker off the surface instead of widening it.
    fill.scale.set(s, 1, s);
    edge.scale.set(s, 1, s);
    fill.material.opacity = (valid ? 0.22 : 0.3) * shown;
    edge.material.opacity = (valid ? 0.9 : 0.95) * shown * (1 - released * 0.35);
    const d =
      (calm ? 0.34 : 0.34 + Math.sin(now * 0.005) * 0.03) *
      jarReach(group.position.y, dotAngle);
    dot.scale.set(d, d, 1);
    dot.material.opacity = 0.8 * fade;
  }

  return { group, showAt, hide, confirm, invalidate, update, isValid: () => valid };
}

/** Where a fresh layer of `height` would settle, and whether it fits at all. */
export function layerLanding(top, height, remaining) {
  return { y: Math.min(top, JAR.floorY + JAR.bodyHeight), fits: remaining >= height };
}
