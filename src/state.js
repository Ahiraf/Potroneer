// The whole terrarium is described by this small serialisable model. The 3D
// scene is always a pure function of this state, so reset = empty the arrays
// and rebuild. Nothing visual is the source of truth; the data is.

import { BASE_BY_ID, mmToUnits, unitsToMm } from "./catalog.js";
import { grainSettings } from "./grain-settings.js";

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
  // Smooth the existing saved grid without changing its dimensions. Clamp the
  // cubic sample to its neighbours so a steep bank cannot overshoot the lid.
  const sample = (i, j) => t[Math.max(0, Math.min(n - 1, j)) * n + Math.max(0, Math.min(n - 1, i))];
  const cubic = (a, b, c, d, f) => b + 0.5 * f * (c - a + f * (2*a - 5*b + 4*c - d + f * (3*(b-c) + d-a)));
  const rows = [];
  for (let j = -1; j <= 2; j++) {
    rows.push(cubic(sample(u0-1,v0+j), sample(u0,v0+j), sample(u0+1,v0+j), sample(u0+2,v0+j), fu));
  }
  const corners = [sample(u0,v0), sample(u1,v0), sample(u0,v1), sample(u1,v1)];
  return Math.max(Math.min(...corners), Math.min(Math.max(...corners), cubic(...rows, fv)));
}

/** Highest soil surface at this point, bounded by the actual vessel. */
export function terrainCeilingAt(baseY, x, z, margin = 0.025) {
  const ceiling = Math.max(baseY, JAR.floorY + JAR.bodyHeight - 0.045);
  if (insideJarAt(ceiling, x, z, margin)) return ceiling;
  let lo = baseY, hi = ceiling;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (insideJarAt(mid, x, z, margin)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Same edge falloff for the visible hill, its grains and planted items. */
export function terrainOffsetAt(state, x, z, margin = 0.012) {
  const reach = Math.max(0.02, jarReach(substrateTop(state), Math.atan2(z, x)) - margin);
  const t = Math.hypot(x, z) / reach;
  const f = Math.max(0, Math.min(1, (1 - t) / 0.14));
  return heightAt(state, x, z) * f * f * (3 - 2*f);
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
  const baseY = substrateTop(state);
  const maxDown = -Math.max(0, (state.layers.at(-1)?.height ?? 0) - 0.02);
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
      const maxUp = Math.max(0, terrainCeilingAt(baseY, wx, wz) - baseY);
      state.terrain[k] = Math.min(
        maxUp,
        Math.max(maxDown, state.terrain[k] + amount * fall),
      );
    }
  }
}

// The substrate rests a hair above the jar's inner floor rather than on it.
// Two coincident surfaces at exactly floorY z-fight, and which one wins varies
// with the camera — so the bottom of a jar flickered between glass and gravel.
// This is the one place the stack's base is defined; everything that asks
// where the substrate starts asks substrateBase(), so the layers, the terrain
// cap, the pick plane and the placement marker cannot end up on different
// floors.
export const FLOOR_GAP = 0.006;

/** Bottom of the first layer: the jar's floor plus that gap. */
export function substrateBase() {
  return JAR.floorY + FLOOR_GAP;
}

// Top of the stack. Each layer sits on the one below:
//   layer 0 bottom = substrateBase()
//   layer n bottom = layer n-1 top
//   layer n top    = layer n bottom + layer n height
export function substrateTop(state) {
  const h = state.layers.reduce((sum, l) => sum + l.height, 0);
  return substrateBase() + h;
}

// How much headroom is left before layers would reach the jar shoulder.
export function remainingHeight(state) {
  const used = substrateTop(state) - substrateBase();
  return JAR.bodyHeight - FLOOR_GAP - used;
}

// ---------------------------------------------------------------------------
// The stack invariant
// ---------------------------------------------------------------------------
// Said once, here, because six other places are written against it and a
// disagreement between any two of them shows up as a jar built upside down:
//
//   state.layers[0]                       is the BOTTOM band — it sits on the
//                                         jar floor, at substrateBase()
//   state.layers[state.layers.length - 1] is the TOP band — its top is the
//                                         surface everything else rides on
//   band n sits directly on band n-1, with no gap and no overlap
//
// So a new pour is `push`, never `unshift`, and everything that walks the
// stack walks it forwards while adding heights. `layerBounds` is the single
// answer to "where is band n", and `assertStackOrder` is that invariant made
// executable — `tools/check-layer-order.mjs` and the dev build both run it.

/** Where band `index` starts and ends, in world Y. */
export function layerBounds(state, index) {
  let bottom = substrateBase();
  for (let i = 0; i < index; i++) bottom += state.layers[i].height;
  return { bottom, top: bottom + (state.layers[index]?.height ?? 0) };
}

/**
 * Throw if the stack has stopped being a bottom-to-top stack. Cheap enough to
 * call after every mutation, and only wired up in development — in production
 * a thrown assertion here would take the whole build down over a cosmetic
 * disagreement, which is a worse outcome than the disagreement.
 */
export function assertStackOrder(state) {
  let y = substrateBase();
  state.layers.forEach((layer, i) => {
    if (!BASE_BY_ID[layer.type]) throw new Error(`layer ${i}: unknown material ${layer.type}`);
    if (!(layer.height > 0)) throw new Error(`layer ${i}: height ${layer.height} is not positive`);
    const { bottom, top } = layerBounds(state, i);
    if (Math.abs(bottom - y) > 1e-6) {
      throw new Error(`layer ${i}: starts at ${bottom}, but band ${i - 1} ends at ${y}`);
    }
    if (!(top > bottom)) throw new Error(`layer ${i}: does not rise`);
    y = top;
  });
  if (Math.abs(substrateTop(state) - y) > 1e-6) {
    throw new Error(`substrateTop ${substrateTop(state)} disagrees with the walked stack ${y}`);
  }
  return true;
}

/**
 * Take an array of layer records from a save, a share link or a co-op peer and
 * make it safe to stack.
 *
 * Saves have always been written bottom-first, so the order is left alone
 * unless the payload explicitly says otherwise — flipping an old build "to be
 * safe" would turn every correct save upside down, which is the failure this
 * function exists to prevent, not cause. What it does do is drop records the
 * renderer cannot use (unknown material, zero or negative depth — see
 * `addLayer`: the app never creates an invisible band, so one in a save is
 * corruption) and fill in the fields that post-date the oldest saves.
 */
export function adoptLayers(raw, order = "bottom-to-top") {
  const list = Array.isArray(raw) ? raw.slice() : [];
  if (order === "top-to-bottom") list.reverse();
  return list
    .filter((l) => l && BASE_BY_ID[l.type] && Number(l.height) > 0)
    .map((l) => ({
      type: l.type,
      height: Number(l.height),
      slopeX: Number(l.slopeX) || 0,
      slopeZ: Number(l.slopeZ) || 0,
      seed: Number.isFinite(l.seed) ? l.seed : (Math.random() * 0x7fffffff) | 0,
      ...grainSettings(l),
    }));
}

/**
 * Pour a layer *on top of* everything already poured.
 *
 * `mm` is the depth the builder asked for; leaving it out takes the material's
 * own default. Returns false without touching the stack when the pour cannot
 * happen — nothing left in the jar, or a depth of zero, which would be an
 * invisible band you could never see to select or delete again.
 *
 * Layers are stored in world units, not millimetres. Millimetres are how the
 * app talks about depth — to the builder, and in the advice it gives — but the
 * geometry has always been in units and every save ever written holds units.
 * Converting at the door keeps both true, and keeps old builds loadable.
 */
export function addLayer(state, typeId, mm = null, grain = {}) {
  const def = BASE_BY_ID[typeId];
  if (!def) return false;
  const want = mm == null ? unitsToMm(def.layerHeight) : Math.round(Number(mm) || 0);
  if (want < LAYER_MM_COMMIT_MIN) return false; // no invisible bands
  const height = mmToUnits(want);
  if (remainingHeight(state) + 1e-9 < height) return false; // jar is full
  // Real builds slope the substrate asymmetrically ("odd numbers and
  // asymmetrical angles"); keep a gentle random tilt per layer, stored in the
  // model so rebuilds don't reshuffle the terrain.
  state.layers.push({
    type: typeId,
    ...grainSettings(grain),
    height,
    slopeX: (Math.random() - 0.5) * 0.08,
    slopeZ: (Math.random() - 0.5) * 0.08,
    // Fixes this layer's settling pattern once, so rebuilding the scene from
    // the same data gives back the same surface — and so the layer above can
    // reproduce this one's top exactly when it builds its own underside.
    seed: (Math.random() * 0x7fffffff) | 0,
  });
  return true; // pushed, so the newest band is the top one — see the invariant
}

/** Appearance only: never change depth, slopes, ordering or decoration data. */
export function setLayerGrain(state, index, settings) {
  const layer = state.layers[index];
  if (!layer) return false;
  const next = grainSettings({ ...layer, ...settings });
  if ((layer.grainAmount ?? 0) === next.grainAmount && (layer.grainColor ?? "matching") === next.grainColor) return false;
  Object.assign(layer, next);
  return true;
}

// ---------------------------------------------------------------------------
// Editing a band that is already poured
// ---------------------------------------------------------------------------
// All three of these only touch `state.layers`. Everything downstream — the
// bands themselves, the terrain cap, the decorations sitting on it, the pick
// plane, the strata labels — is rebuilt from the array afterwards, so there is
// exactly one thing to get right here and it is the array.

/** Re-cut band `index` to `mm` millimetres. False if it will not fit. */
export function setLayerMm(state, index, mm) {
  const layer = state.layers[index];
  if (!layer) return false;
  const want = Math.round(Number(mm) || 0);
  if (want < LAYER_MM_COMMIT_MIN) return false;
  if (want > maxLayerMm(state, index)) return false;
  layer.height = mmToUnits(want);
  return true;
}

/** Slide band `index` one place down (-1) or up (+1) the stack. */
export function moveLayer(state, index, dir) {
  const to = index + (dir < 0 ? -1 : 1);
  if (index < 0 || index >= state.layers.length) return false;
  if (to < 0 || to >= state.layers.length) return false;
  const [layer] = state.layers.splice(index, 1);
  state.layers.splice(to, 0, layer);
  return true;
}

/** Take band `index` out; everything above it drops by that much. */
export function removeLayer(state, index) {
  if (index < 0 || index >= state.layers.length) return false;
  state.layers.splice(index, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Depth, in millimetres
// ---------------------------------------------------------------------------
/**
 * The depths a material may be poured at.
 *
 * `minMm`/`maxMm` in the catalogue are *advice* — the range real builders work
 * in — and the app says so rather than enforcing it: a charcoal filter thicker
 * than half an inch does nothing useful, but it is not the app's business to
 * refuse. What is enforced is physical rather than editorial, and there are
 * only two of those rules:
 *
 *   • the control may sit at 0mm, but 0mm is not a layer. Committing it would
 *     make a band with no height: invisible, unselectable, undeletable. So the
 *     slider goes to zero and the *commit* is what refuses.
 *   • the committed stack may never be deeper than the jar's usable interior.
 *     That is not a fixed 120mm — it is whatever this vessel has left, and
 *     when an existing band is being edited it is that plus the band's own
 *     depth, because re-cutting a 30mm band to 40mm only needs 10mm more.
 */
export const LAYER_MM_MIN = 0;
export const LAYER_MM_COMMIT_MIN = 1;

/** Every millimetre this vessel could ever hold, empty. */
export function jarCapacityMm() {
  return Math.max(0, Math.floor(unitsToMm(JAR.bodyHeight - FLOOR_GAP)));
}

/**
 * The most a band may be set to. `index` is the band being edited, or -1 for a
 * fresh pour — the difference is whether the band's current depth counts as
 * already spent.
 */
export function maxLayerMm(state, index = -1) {
  const own = index >= 0 ? state.layers[index]?.height ?? 0 : 0;
  return Math.max(0, Math.floor(unitsToMm(remainingHeight(state) + own)));
}

/** Hold `mm` to the physical range; `maxMm` is whatever the jar allows. */
export function clampLayerMm(mm, maxMm = jarCapacityMm()) {
  const v = Math.round(Number(mm) || 0);
  return Math.max(LAYER_MM_MIN, Math.min(Math.max(LAYER_MM_MIN, maxMm), v));
}

/** Is this depth outside what the material is actually for? */
export function layerMmAdvice(def, mm) {
  if (!def) return null;
  if (def.minMm != null && mm < def.minMm) return "thin";
  if (def.maxMm != null && mm > def.maxMm) return "thick";
  return null;
}

/** How much depth the jar has left, in millimetres. */
export function remainingMm(state) {
  return Math.max(0, Math.floor(unitsToMm(remainingHeight(state))));
}

/** Total substrate poured so far, in millimetres. */
export function stackMm(state) {
  return Math.round(unitsToMm(state.layers.reduce((sum, l) => sum + l.height, 0)));
}

/** Depth of one band, in millimetres — what the editor and the labels show. */
export function layerDepthMm(layer) {
  return Math.round(unitsToMm(layer?.height ?? 0));
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
