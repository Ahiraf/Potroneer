// The whole terrarium is described by this small serialisable model. The 3D
// scene is always a pure function of this state, so reset = empty the arrays
// and rebuild. Nothing visual is the source of truth; the data is.

import { BASE_BY_ID } from "./catalog.js";

// Interior dimensions of the mason jar, in world units. The shoulder tapers in
// near the top, but layers/decorations live in the straight cylindrical body.
// Mutable: the active jar's interior metrics are copied in here whenever the
// user picks a different jar shape. Builders read these live.
export const JAR = {
  innerRadius: 1.02,
  bodyHeight: 2.3,
  floorY: -1.15, // world Y of the inside floor
  wallThickness: 0.06,
  stretchX: 1, // >1 for lying-down bottles: footprint becomes an ellipse
  // Shape of the vessel seen from above, as a multiplier on the radius at each
  // angle: 1 all the way round for a round jar, reaching out toward the ends
  // of a long rectangular case. Substrate poured into a rectangular terrarium
  // has to *be* rectangular — a disc sitting in the middle of a glass trough
  // is the giveaway that nothing is really being filled. Sampled at even
  // angles from +X counter-clockwise; null means "round" (use stretchX).
  footprint: null,
  // Sampled interior silhouette: [{ y, r }, …] bottom -> top. `innerRadius` is
  // only the *widest* half-extent, so round vessels (globe, bowl, egg, gem)
  // narrow well below it near the floor. Anything that fills the jar has to
  // ask jarRadiusAt(y) instead, or it pokes out through the glass.
  silhouette: null,
  // The interior cross-section as a table of absolute reaches, sampled at NA
  // even angles for each of NY heights: { ys, r, na }, r[iy * na + ia].
  //
  // Why this exists when `silhouette` × `footprint` already describes a shape:
  // that pair is *separable* — one radius curve down the height, one outline
  // around the axis, multiplied. Most vessels are separable, but a bottle
  // lying on its side is not. Its cross-section is as long as the bottle at
  // every height, while its depth across the belly starts at zero on the floor
  // and swells to the full bore at the axis. No single outline scaled by one
  // radius can say that, and pretending otherwise is what drove a flat slab of
  // soil straight out through the round glass. So a vessel may hand over a
  // measured table instead, and everything that fills the jar reads it through
  // jarReach(y, a).
  section: null,
};

export function setJarInterior(interior, silhouette = null, section = null) {
  Object.assign(JAR, { stretchX: 1, footprint: null, section: null }, interior);
  JAR.silhouette = silhouette && silhouette.length >= 2 ? silhouette : null;
  JAR.section = section && section.ys && section.ys.length >= 2 ? section : null;
}

// The footprint multiplier at angle `a` (radians, +X = 0), interpolated
// between samples. 1 when the vessel is round.
export function footprintK(a) {
  const f = JAR.footprint;
  if (!f || !f.length) return 1;
  const n = f.length;
  const t = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * n;
  const i = Math.floor(t) % n;
  const j = (i + 1) % n;
  return f[i] + (f[j] - f[i]) * (t - Math.floor(t));
}

// Largest radius the substrate/terrain/decorations may occupy at height `y`.
// Falls back to the straight-walled innerRadius when the jar has no silhouette.
export function jarRadiusAt(y) {
  const s = JAR.silhouette;
  if (!s) return JAR.innerRadius;
  let r;
  if (y <= s[0].y) r = s[0].r;
  else if (y >= s[s.length - 1].y) r = s[s.length - 1].r;
  else {
    r = s[s.length - 1].r;
    for (let i = 1; i < s.length; i++) {
      if (y <= s[i].y) {
        const a = s[i - 1];
        const b = s[i];
        const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
        r = a.r + (b.r - a.r) * t;
        break;
      }
    }
  }
  return Math.max(0.05, Math.min(r, JAR.innerRadius));
}

// ---------------------------------------------------------------------------
// The interior, asked properly
// ---------------------------------------------------------------------------
// One question underlies every part of filling a jar: *how far out may I go,
// at this height, in this direction?* Substrate volumes, the terrain cap, the
// placement preview, the tap target and decoration clamping are all that same
// question with different callers, and each of them used to answer it its own
// way — which is why they disagreed, and why soil could sit outside glass a
// preview had drawn correctly. They all come here now.

/** Absolute reach from the axis at height `y`, heading `a` (radians, +X = 0). */
export function jarReach(y, a) {
  const sec = JAR.section;
  if (!sec) return jarRadiusAt(y) * footprintK(a); // separable vessels
  const { ys, r, na } = sec;
  // Bracket the height, then the angle, and bilinearly interpolate. A table
  // read with nearest-neighbour shows as facets on a curved belly.
  const n = ys.length;
  let iy = 0;
  if (y <= ys[0]) iy = 0;
  else if (y >= ys[n - 1]) iy = n - 1;
  else {
    while (iy < n - 2 && ys[iy + 1] < y) iy++;
  }
  const iy1 = Math.min(iy + 1, n - 1);
  const span = ys[iy1] - ys[iy];
  const ty = span > 1e-9 ? Math.min(1, Math.max(0, (y - ys[iy]) / span)) : 0;

  const ta = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * na;
  const ia = Math.floor(ta) % na;
  const ia1 = (ia + 1) % na;
  const fa = ta - Math.floor(ta);

  const lo = r[iy * na + ia] * (1 - fa) + r[iy * na + ia1] * fa;
  const hi = r[iy1 * na + ia] * (1 - fa) + r[iy1 * na + ia1] * fa;
  return Math.max(0.02, lo * (1 - ty) + hi * ty);
}

/**
 * A point on the interior boundary at height `y`, heading `a`, pulled in to
 * fraction `t` of the full reach and then held `margin` clear of the glass.
 * The margin is subtracted rather than scaled so it stays a real distance:
 * a 2mm gap at the rim of a bowl is 2mm, not 2mm × however wide the bowl is.
 */
export function jarPointAt(y, a, t = 1, margin = 0) {
  const reach = Math.max(0.02, jarReach(y, a) - margin);
  const d = reach * t;
  return [Math.cos(a) * d, Math.sin(a) * d];
}

/** Is this point inside the interior at that height, with a margin to spare? */
export function insideJarAt(y, x, z, margin = 0) {
  const d = Math.hypot(x, z);
  if (d < 1e-6) return true;
  return d <= Math.max(0.02, jarReach(y, Math.atan2(z, x)) - margin);
}

/**
 * Pull a point back inside the interior at height `y`, or null if it was
 * already in. Everything that places something in the jar goes through this
 * or jarPointAt — there is deliberately no height-blind version to reach for
 * by mistake, because "inside the widest part of the glass" is not the same
 * question and answering it was how soil ended up outside a bowl.
 */
export function clampInsideAt(y, x, z, margin = 0) {
  const d = Math.hypot(x, z);
  if (d < 1e-6) return null;
  const max = Math.max(0.02, jarReach(y, Math.atan2(z, x)) - margin);
  return d > max ? { x: (x / d) * max, z: (z / d) * max } : null;
}

/** The widest the interior ever gets at height `y` — for sizing a grid or box. */
export function jarMaxReachAt(y, samples = 48) {
  let max = 0;
  for (let i = 0; i < samples; i++) {
    max = Math.max(max, jarReach(y, (i / samples) * Math.PI * 2));
  }
  return max;
}

// Widest half-extent the interior ever reaches — the terrain grid spans this.
// A measured section is the authority when there is one: a bottle reaches far
// further along its axis than `innerRadius × stretchX` would suggest, and a
// grid cut to the smaller number leaves the ends of the bottle unsculptable.
export function jarGridR() {
  const sec = JAR.section;
  if (sec) {
    let max = 0;
    for (let i = 0; i < sec.r.length; i++) max = Math.max(max, sec.r[i]);
    return Math.max(0.1, max);
  }
  if (JAR.footprint) {
    let max = 1;
    for (const k of JAR.footprint) max = Math.max(max, k);
    return JAR.innerRadius * max;
  }
  return JAR.innerRadius * JAR.stretchX;
}

// Resolution of the sculptable heightfield laid over the substrate surface.
export const TERRAIN_N = 33;

export function createState() {
  return {
    layers: [], // { type, height, slopeX, slopeZ }   stacked bottom -> top
    decorations: [], // { id, kind, x, z, y, rotation, scale }
    terrain: new Float32Array(TERRAIN_N * TERRAIN_N), // sculpted height deltas
    // which base material was painted at each cell (255 = none / top layer)
    terrainMat: new Uint8Array(TERRAIN_N * TERRAIN_N).fill(255),
    painted: false, // any free-form substrate painted with the cursor?
  };
}

// Stamp a base-material index into the paint map under the brush.
// The terrain grid is a square laid over a vessel that is not one, so most of
// its corner cells are outside the glass. Sculpting them piled soil into thin
// air beside the jar — visible from above as a square shadow around a round
// terrarium — and painting them stained material onto ground that is not there.
// Every brush asks this first.
function cellInsideJar(state, wx, wz) {
  return insideJarAt(substrateTop(state), wx, wz, 0.02);
}

export function paintMaterial(state, x, z, radius, matIndex) {
  const R = jarGridR();
  const n = TERRAIN_N;
  const cell = (2 * R) / (n - 1);
  const r2 = radius * radius * 1.15;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const wx = -R + i * cell;
      const wz = -R + j * cell;
      const d2 = (wx - x) * (wx - x) + (wz - z) * (wz - z);
      if (d2 <= r2 && cellInsideJar(state, wx, wz)) state.terrainMat[j * n + i] = matIndex;
    }
  }
  state.painted = true;
}

// Bilinear sample of the sculpted terrain at local (x, z). Grid spans the
// square [-innerRadius, +innerRadius]²; outside the jar it's 0.
export function heightAt(state, x, z) {
  const R = jarGridR();
  const n = TERRAIN_N;
  const u = ((x + R) / (2 * R)) * (n - 1);
  const v = ((z + R) / (2 * R)) * (n - 1);
  if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return 0;
  const u0 = Math.floor(u);
  const v0 = Math.floor(v);
  const u1 = Math.min(u0 + 1, n - 1);
  const v1 = Math.min(v0 + 1, n - 1);
  const fu = u - u0;
  const fv = v - v0;
  const t = state.terrain;
  const a = t[v0 * n + u0] * (1 - fu) + t[v0 * n + u1] * fu;
  const b = t[v1 * n + u0] * (1 - fu) + t[v1 * n + u1] * fu;
  return a * (1 - fv) + b * fv;
}

// Apply a soft gaussian brush to the heightfield. Positive = mound up,
// negative = carve down. Clamped so you can't dig through the substrate or
// pile soil past the jar shoulder.
// Tamp/level: ease terrain heights within the brush toward their local mean,
// so the surface flattens and compacts (the wooden tamper in the reference).
export function flatten(state, x, z, strength = 0.4, radius = 0.3, falloff = 0.8) {
  const R = jarGridR();
  const n = TERRAIN_N;
  const cell = (2 * R) / (n - 1);
  const r2 = radius * radius;
  const cells = [];
  let sum = 0;
  let wsum = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const wx = -R + i * cell;
      const wz = -R + j * cell;
      const d2 = (wx - x) * (wx - x) + (wz - z) * (wz - z);
      if (d2 > r2 * 4) continue;
      if (!cellInsideJar(state, wx, wz)) continue;
      const fall = Math.exp(-d2 / (r2 * falloff));
      const k = j * n + i;
      sum += state.terrain[k] * fall;
      wsum += fall;
      cells.push([k, fall]);
    }
  }
  if (!wsum) return;
  const mean = sum / wsum;
  for (const [k, fall] of cells) {
    state.terrain[k] += (mean - state.terrain[k]) * Math.min(1, strength * fall * 2.5);
  }
}

export function sculpt(state, x, z, amount, radius = 0.3, falloff = 0.8) {
  const R = jarGridR();
  const n = TERRAIN_N;
  const cell = (2 * R) / (n - 1);
  const maxUp = 0.34;
  const maxDown = -0.1;
  const r2 = radius * radius;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const wx = -R + i * cell;
      const wz = -R + j * cell;
      const d2 = (wx - x) * (wx - x) + (wz - z) * (wz - z);
      if (d2 > r2 * 4) continue;
      if (!cellInsideJar(state, wx, wz)) continue;
      const fall = Math.exp(-d2 / (r2 * falloff));
      const k = j * n + i;
      state.terrain[k] = Math.min(
        maxUp,
        Math.max(maxDown, state.terrain[k] + amount * fall),
      );
    }
  }
}

// Total height of substrate stacked so far.
export function substrateTop(state) {
  const h = state.layers.reduce((sum, l) => sum + l.height, 0);
  return JAR.floorY + h;
}

// How much headroom is left before layers would reach the jar shoulder.
export function remainingHeight(state) {
  const used = substrateTop(state) - JAR.floorY;
  return JAR.bodyHeight - used;
}

export function addLayer(state, typeId) {
  const def = BASE_BY_ID[typeId];
  if (!def) return false;
  if (remainingHeight(state) < def.layerHeight) return false; // jar is full
  // Real builds slope the substrate asymmetrically ("odd numbers and
  // asymmetrical angles"); keep a gentle random tilt per layer, stored in the
  // model so rebuilds don't reshuffle the terrain.
  state.layers.push({
    type: typeId,
    height: def.layerHeight,
    slopeX: (Math.random() - 0.5) * 0.08,
    slopeZ: (Math.random() - 0.5) * 0.08,
    // Fixes this layer's settling pattern once, so rebuilding the scene from
    // the same data gives back the same surface — and so the layer above can
    // reproduce this one's top exactly when it builds its own underside.
    seed: (Math.random() * 0x7fffffff) | 0,
  });
  return true;
}

export function addDecoration(state, deco) {
  state.decorations.push(deco);
}

export function reset(state) {
  state.layers.length = 0;
  state.decorations.length = 0;
  state.terrain.fill(0);
  state.terrainMat.fill(255);
  state.painted = false;
}

export function hasBase(state) {
  return state.layers.length > 0 || state.painted;
}
