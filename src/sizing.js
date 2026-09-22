import * as THREE from "three";
import { insideJarAt, jarReach, JAR } from "./state.js";

// ---------------------------------------------------------------------------
// How big is a thing, and will it fit?
// ---------------------------------------------------------------------------
// Two questions that were being answered by guesswork, in two different places,
// and both of them wrong in the same way: they reasoned about an object's
// *origin* instead of about the object.
//
//   1. Size. Every piece used to land at `(0.85 + random 0.5) × jarFactor`,
//      applied to whatever the builder happened to produce. But the builders
//      were never written to a common scale — a fern comes out 0.685 units
//      tall and a park bench 0.188, so the same multiplier makes one of them a
//      tree and the other a splinter. A shared random number cannot fix a
//      difference that is 3.6× before the random number is applied.
//
//   2. Containment. Placement clamped the origin inside the glass, which says
//      nothing about the leaves. A tall plant standing legally at the edge of
//      a bowl still has its crown outside the vessel, because the interior is
//      narrower up where the crown is.
//
// Both are answered here, from the same measured bounding box:
//
//      final scale = normalise(measured box → profile target) × user multiplier
//
// `normalise` is what makes the multiplier mean something. At 1.0 a piece is
// at the size this catalogue *intends* it to be, whatever its builder happened
// to emit, so the size slider reads as a percentage of a real default.

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
// A tier is a target size and the axis it is measured on.
//
//   h    — normalise so the object stands this tall. Right for anything whose
//          silhouette is vertical: plants, buildings, figures.
//   w    — normalise so its widest horizontal span is this. Right for things
//          that are a footprint rather than a height: bridges, paths, carpets,
//          a pond. Normalising those by height makes a 20mm-tall stone path
//          the size of a house.
//   cap  — a hard ceiling on the *other* axis, applied afterwards. A fern is
//          0.96 wide and 0.69 tall; cutting it to a medium plant's height
//          still leaves it sprawling, so the cap takes the smaller of the two
//          scales. Nothing is ever scaled *up* by a cap.
//
// The numbers are world units, and one unit is 100mm (see MM_PER_UNIT), so a
// tier of 0.55 is a 55mm plant in a jar whose interior is 230mm tall. They are
// chosen as a set — the point is the relationships between them, not any one
// value.
const TIERS = {
  // ground cover: mosses, carpets, the crawling things. Read as texture.
  carpet: { w: 0.34, cap: 0.1 },
  // small props sitting on the surface: a ladybug, an isopod, a pinecone.
  accent: { h: 0.09, cap: 0.22 },
  // low plants with a spreading rosette rather than a stem.
  plantLow: { h: 0.16, cap: 0.42 },
  // the ordinary middle of the catalogue.
  plantMedium: { h: 0.3, cap: 0.5 },
  // stems and straps that stand up: aquarium plants, snake plant, saguaro.
  plantTall: { h: 0.42, cap: 0.4 },
  // the one plant that is meant to be the thing you look at.
  //
  // Deliberately the tallest plant tier, and deliberately above `fern` and
  // `aglaonema`: a bonsai in a terrarium is the focal piece and a fern is
  // ground furniture around it. That is a decision rather than an accident of
  // whichever builder happened to emit more geometry — which is exactly what
  // it used to be, and why a fern outgrew the bonsai beside it.
  focal: { h: 0.55, cap: 0.46 },
  botanical: { h: .60, cap: .80 },
  botanicalTall: { h: .92, cap: .64 },
  landscapeRock: { h: .48, cap: .55 },

  // --- structures -------------------------------------------------------
  // Structures are read as *objects in a scene*, not as plants, so they get
  // their own ladder. It sits deliberately high: a temple that is technically
  // present but reads as a pebble has failed at the only job it has.
  tower: { h: 0.5, cap: 0.34 },
  temple: { h: 0.46, cap: 0.5 },
  building: { h: 0.42, cap: 0.5 },
  pavilion: { h: 0.4, cap: 0.5 },
  wellTier: { h: 0.34, cap: 0.34 },
  // Seating is short by nature — a bench really is a low thing — so it is
  // normalised on its *length*, which is what you actually recognise it by.
  // Give it a height target instead and it has to become absurdly long to
  // reach a readable height.
  seat: { w: 0.34, cap: 0.3 },
  // Crossings and paving: all footprint, no height.
  span: { w: 0.5, cap: 0.3 },
  ground: { w: 0.42, cap: 0.16 },
  lamp: { h: 0.26, cap: 0.22 },
  rock: { h: 0.22, cap: 0.42 },
  pebble: { w: 0.16, cap: 0.08 },
  // Animals keep their own modest tier: a deer the size of a temple is a
  // different bug from a deer the size of a crumb.
  creature: { h: 0.2, cap: 0.32 },
  creatureTiny: { h: 0.06, cap: 0.18 },
};

// Kind → tier, where the kind's own tier is not what its category implies.
// Only the exceptions are listed; everything else falls through to CAT_TIER.
const KIND_TIER = {
  pumice: "pebble",
  buttonpebble: "pebble",
  fittoniabush: "botanical",
  aralia: "botanicalTall",
  crag: "landscapeRock",
  mineralpatch: "ground",
  riverpebble: "pebble",
  steppingstone: "ground",
  slatechip: "ground",
  // --- plants -----------------------------------------------------------
  bonsai: "focal",
  snakeplant: "plantTall",
  saguaro: "plantTall",
  pricklypear: "plantTall",
  calathea: "plantTall",
  // Broad-leaf aroids. A tier below the bonsai, on purpose.
  aglaonema: "plantMedium",
  anthurium: "plantMedium",
  alocasia: "plantMedium",
  philodendron: "plantMedium",
  leafy: "plantMedium",
  coleus: "plantMedium",
  fern: "plantMedium",
  pothos: "plantMedium",
  cactus: "plantMedium",
  pilea: "plantLow",
  peperomia: "plantLow",
  succulent: "plantLow",
  haworthia: "plantLow",
  pink: "plantLow",
  venusflytrap: "plantLow",
  selaginella: "plantLow",
  drimiopsis: "plantLow",
  oxalis: "plantLow",
  kalanchoe: "plantLow",
  pincushion: "plantLow",
  // Trailers and climbers: all spread, almost no height.
  ivy: "carpet",
  creepingfig: "carpet",
  babytears: "carpet",
  airplant: "plantLow",

  // --- structures -------------------------------------------------------
  templehall: "temple",
  ziggurat: "temple",
  torii: "temple",
  pagoda: "tower",
  pagodatower: "tower",
  spiraltower: "tower",
  fairytower: "tower",
  ruinedtower: "tower",
  chapel: "tower",
  pavilion: "pavilion",
  house: "building",
  tudorhouse: "building",
  crookedcottage: "building",
  porchcottage: "building",
  logcabin: "building",
  domecottage: "building",
  mushroomhouse: "building",
  witchhat: "building",
  stumphouse: "building",
  shellhouse: "building",
  stilthouse: "building",
  well: "wellTier",
  brickwell: "wellTier",
  wheelwell: "wellTier",
  parkbench: "seat",
  branchbench: "seat",
  bridge: "span",
  taikobashi: "span",
  ropebridge: "span",
  mushroombridge: "span",
  stonepath: "ground",
  pond: "ground",
  brickpile: "ground",
  slateledge: "ground",
  fence: "span",
  brokenwall: "span",
  canyon: "temple",
  rockcave: "pavilion",
  stonestairs: "wellTier",
  coveredwagon: "seat",
  anchor: "wellTier",
  lantern: "lamp",
  oillamp: "lamp",
  moroccanlantern: "lamp",

  // --- creatures --------------------------------------------------------
  deer: "creature",
  wolf: "creature",
  ibex: "creature",
  gnome: "creature",
  mantis: "creature",
  snake: "creature",
  elephant: "creature",
  turtle: "creatureTiny",
  frog: "creatureTiny",
  bird: "creatureTiny",
  butterfly: "creatureTiny",
  ladybug: "creatureTiny",
  isopod: "creatureTiny",
  shrimp: "creatureTiny",
  nerite: "creatureTiny",
  springtails: "carpet",
  shell: "accent",

  // --- odds and ends ----------------------------------------------------
  mossball: "plantLow",
  mushroom: "accent",
  chanterelle: "accent",
  pinecone: "accent",
  log: "ground",
  driftwood: "rock",
  crystal: "rock",
  geode: "rock",
  slate: "ground",
};

// Category → tier, for every kind that does not need naming individually.
const CAT_TIER = {
  moss: "carpet",
  plants: "plantMedium",
  flowers: "plantMedium",
  aquatic: "plantTall",
  mushroom: "accent",
  rocks: "rock",
  animals: "creatureTiny",
  structures: "building",
  wood: "rock",
  lights: "lamp",
};

/** The tier this catalogue entry is sized against. */
export function tierFor(def) {
  if (!def) return TIERS.plantMedium;
  const name = KIND_TIER[def.kind] ?? CAT_TIER[def.cat] ?? "plantMedium";
  return TIERS[name] ?? TIERS.plantMedium;
}

/** The tier's name, for the debug hook and the sizing audit. */
export function tierNameFor(def) {
  if (!def) return "plantMedium";
  return KIND_TIER[def.kind] ?? CAT_TIER[def.cat] ?? "plantMedium";
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------
// Measured once per catalogue id and kept, because every variant of a kind is
// built from the same geometry at the same size and a Box3 over a few hundred
// leaves is not free. The measurement is taken with the object at identity, so
// what comes back describes the *builder's* output — the thing the profile is
// normalising away.

const measured = new Map();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * The native box of an object, as the three numbers anything downstream needs:
 *
 *   h     how tall it stands
 *   w     its widest horizontal span
 *   r     the radius of the smallest vertical cylinder about the object's own
 *         origin that contains it. This one is the important one: it is taken
 *         from the box corners, so it does not change when the piece is turned
 *         about Y — which means containment can be decided once and stay true
 *         through every rotation, instead of being re-argued per angle.
 *   minY  how far the geometry hangs below its origin, so a piece can be sat
 *         *on* the substrate rather than half-buried in it.
 */
export function measureObject(obj) {
  obj.updateWorldMatrix(true, true);
  _box.setFromObject(obj);
  if (!isFinite(_box.min.x) || _box.isEmpty()) return { h: 0.2, w: 0.2, r: 0.1, minY: 0 };
  _box.getSize(_size);
  const r = Math.hypot(
    Math.max(Math.abs(_box.min.x), Math.abs(_box.max.x)),
    Math.max(Math.abs(_box.min.z), Math.abs(_box.max.z)),
  );
  return { h: _size.y, w: Math.max(_size.x, _size.z), r, minY: _box.min.y };
}

/**
 * The native measurements for a catalogue entry, measuring `sample` the first
 * time it is asked and remembering the answer.
 *
 * Several builders paint their leaves on a canvas, so this cannot be a table
 * computed ahead of time and shipped — it has to happen where there is a DOM.
 * Doing it at first placement costs one Box3 per catalogue entry per session.
 */
export function nativeMetrics(def, sample) {
  const key = def?.id ?? def?.kind ?? "?";
  const hit = measured.get(key);
  if (hit) return hit;
  if (!sample) return null;
  const m = measureObject(sample);
  measured.set(key, m);
  return m;
}

/**
 * The factor that takes this builder's output to the size the catalogue
 * intends. Multiply the user's own multiplier by this, and never the other way
 * round — the whole point is that the user's number is applied to a normalised
 * model, so 100% means the same *kind* of thing for every item in the tray.
 */
export function normalizeFactor(def, sample) {
  const m = nativeMetrics(def, sample);
  if (!m) return 1;
  const tier = tierFor(def);
  let k = tier.h != null
    ? tier.h / Math.max(1e-4, m.h)
    : tier.w / Math.max(1e-4, m.w);
  // The cap only ever shrinks. A bonsai that measures narrow should stay the
  // height its tier asks for, not be inflated sideways to meet a ceiling.
  if (tier.cap != null) {
    const other = tier.h != null ? m.w : m.h;
    if (other > 1e-4) k = Math.min(k, tier.cap / other);
  }
  return k;
}

/**
 * A touch of variation, so a row of the same fern is not a row of clones —
 * but applied *after* normalisation and deliberately small. The old ±25%
 * shuffle was doing the work of a size system and doing it badly; this is
 * garnish on a size that is already correct.
 */
export const SIZE_JITTER = 0.06;
export function sizeJitter() {
  return 1 + (Math.random() * 2 - 1) * SIZE_JITTER;
}

// ---------------------------------------------------------------------------
// Containment
// ---------------------------------------------------------------------------
// "Is this piece inside the jar" asked about the whole piece. The object is
// treated as an upright cylinder of radius `r × scale` rising `h × scale` from
// the surface it stands on — a fair model of a plant or a building, and a
// conservative one, which is the right direction to be wrong in when the
// alternative is leaves through glass.
//
// The check is directional rather than "is the narrowest part of the jar wide
// enough", because vessels are not all round: a bottle lying on its side has
// metres of room along its axis and almost none across it, and a rule built on
// the smallest reach would refuse to place anything in one.

// How finely the footprint and the height are sampled.
//
// A fixed count is the wrong shape for this. What matters is *resolution* —
// how far apart two probes are on the surface of the piece — and a fixed count
// makes that depend on how big the piece is, so the tall things and the wide
// things (exactly the ones that escape) get sampled most coarsely.
//
// Both numbers were settled against tools/check-item-fit.mjs, which pushes
// every catalogue item against the wall of every vessel from eight headings
// and re-checks the result at far higher resolution. Two failures it caught:
// at 12 evenly spaced ring samples a faceted jar let diagonal placements
// through, because the widest point of the footprint in the direction of
// travel fell up to 15° from the nearest probe; and at 7 height slices a
// vessel that pinches between two slices let a tall piece bulge out in the
// gap.
// 4mm between probes, with hard ceilings so a very large piece cannot make a
// drag frame expensive: this runs inside a binary search, so the probe count
// is paid a dozen times over per call.
const PROBE_SPACING = 0.04;
const RING_MIN = 24;
const RING_MAX = 40;
const SLICE_MIN = 5;
const SLICE_MAX = 14;

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.ceil(v)));

/** Default clearance between a piece and the glass, in world units (≈6mm). */
export const GLASS_CLEARANCE = 0.06;

/**
 * Does a cylinder of radius `r` and height `h`, standing at (x, z) on ground
 * `groundY`, fit inside the vessel with `margin` to spare?
 */
export function bodyFitsAt(x, z, groundY, r, h, margin = GLASS_CLEARANCE) {
  // The ceiling. `jarReach` describes the interior *wall*, and above the rim it
  // simply holds the last sample it has — so a plant taller than the headroom
  // left over the substrate read as perfectly contained while its crown stood
  // in the air above an open vessel or through the lid of a closed one. The
  // interior has a top as well as sides, and this is it.
  if (groundY + h > JAR.floorY + JAR.bodyHeight) return false;
  const slices = clampInt(h / PROBE_SPACING + 1, SLICE_MIN, SLICE_MAX);
  const rings = clampInt((2 * Math.PI * r) / PROBE_SPACING, RING_MIN, RING_MAX);
  // Rotate the ring so one sample always lands on the point of the footprint
  // furthest from the jar's axis — the direction the piece is being pushed,
  // and the one that goes through the glass first. Evenly spaced samples alone
  // can straddle it, which is exactly how diagonal placements used to escape.
  const out = Math.atan2(z, x) || 0;
  for (let iy = 0; iy < slices; iy++) {
    // The top slice matters most — that is where a jar shoulders in — so it is
    // always one of the samples rather than something the loop approaches.
    const y = groundY + (h * iy) / (slices - 1);
    for (let ia = 0; ia < rings; ia++) {
      const a = out + (ia / rings) * Math.PI * 2;
      if (!insideJarAt(y, x + Math.cos(a) * r, z + Math.sin(a) * r, margin)) return false;
    }
  }
  return true;
}

/**
 * Pull (x, z) in until the whole body fits, and say where it ended up.
 *
 * Moving straight toward the axis is the right retreat for every vessel shape
 * here: the interior always contains its own axis, so the path inward is the
 * one direction guaranteed to reach somewhere legal.
 */
export function clampBodyInside(x, z, groundY, r, h, margin = GLASS_CLEARANCE) {
  if (bodyFitsAt(x, z, groundY, r, h, margin)) return { x, z, moved: false };
  let lo = 0; // the axis: legal unless the piece is too big for the jar at all
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (bodyFitsAt(x * mid, z * mid, groundY, r, h, margin)) lo = mid;
    else hi = mid;
  }
  // Settle a hair short of the boundary the search converged on. A clamp that
  // lands *exactly* on its own tolerance is fragile by construction: the
  // boundary is the one the sampling found, and any finer look — the checker in
  // tools/check-item-fit.mjs, or the eye, at a facet the samples straddled —
  // finds it a fraction of a millimetre over.
  const t = lo * SETTLE;
  return { x: x * t, z: z * t, moved: true };
}

// How far inside its own answer a clamp settles — 1% of the distance from the
// axis, well under a millimetre at the rim of the biggest vessel here. The
// probes are spaced 4mm apart on the piece's surface, so the boundary they
// find is approximate by that much; settling inside it is what turns an
// approximate answer into a safe one.
const SETTLE = 0.99;

/**
 * The largest scale at which this piece still fits where it stands, never more
 * than `want`. Used by the size slider, so dragging it up runs the model into
 * the glass and stops rather than pushing it through.
 */
export function maxScaleAt(x, z, groundY, nativeR, nativeH, want, margin = GLASS_CLEARANCE) {
  if (bodyFitsAt(x, z, groundY, nativeR * want, nativeH * want, margin)) return want;
  let lo = 0;
  let hi = want;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (bodyFitsAt(x, z, groundY, nativeR * mid, nativeH * mid, margin)) lo = mid;
    else hi = mid;
  }
  return lo * SETTLE;
}

/**
 * How far apart two pieces should stand, from their measured footprints rather
 * than from a constant. The old rule spaced everything by 0.17 whatever it was,
 * so a temple and a springtail claimed the same patch of ground.
 */
export function spacingFor(radiusA, radiusB) {
  return (radiusA + radiusB) * 0.72;
}

/** The interior's narrowest reach at a height — for sizing a hint, not a fit. */
export function jarMinReachAt(y, samples = 24) {
  let min = Infinity;
  for (let i = 0; i < samples; i++) {
    min = Math.min(min, jarReach(y, (i / samples) * Math.PI * 2));
  }
  return min;
}
