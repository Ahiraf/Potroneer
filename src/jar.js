import * as THREE from "three";
import { JAR, jarPointAt } from "./state.js";
import { getJarModelClone } from "./models.js";
import { grainMaps, substrateUVs } from "./natural-materials.js";

// ---------------------------------------------------------------------------
// Jar shapes
// ---------------------------------------------------------------------------
// Each jar type owns (a) the interior metrics the substrate/decorations must
// fit inside, and (b) a lathe profile describing the glass silhouette. Interior
// metrics get copied into the shared mutable `JAR` object when a jar is chosen,
// so builders always read the current jar's dimensions.

const BASE_JARS = [
  // Reference collection: usable height ends at the mouth. Both the glass
  // and stopper derive from the same dimensions, including custom resizing.
  ...[
    ["cork-cylinder", "সোজা কর্ক জার", .94, 2.35, "straight", 1],
    ["cork-low", "চওড়া কর্ক জার", 1.10, 1.80, "straight", 1],
    ["cork-tall", "সরু কর্ক জার", .78, 2.85, "straight", 1],
    ["cork-taper", "ঢালু কর্ক জার", 1.15, 2.20, "taper", .70],
    ["cork-shoulder", "গোল কাঁধের কর্ক জার", 1.16, 2.15, "shoulder", .76],
  ].map(([id, label, r, h, shape, mouth]) => ({
    id, label, glyph: "🫙", lid: "cork", referenceJar: true, mouth,
    interior: { innerRadius: r, bodyHeight: h, floorY: -h / 2, wallThickness: .035 },
    profile: it => referenceJarProfile(it, shape, mouth),
  })),
  {
    id: "cork",
    label: "কর্ক জার",
    glyph: "🍶",
    lid: "cork",
    interior: { innerRadius: 0.98, bodyHeight: 2.55, floorY: -1.28, wallThickness: 0.055 },
    profile: corkJarProfile,
  },
  {
    id: "dome",
    label: "বেল জার",
    glyph: "🔔",
    lid: false,
    woodBase: true,
    interior: { innerRadius: 1.05, bodyHeight: 2.0, floorY: -1.15, wallThickness: 0.05 },
    profile: domeProfile,
  },
  {
    id: "bottle",
    label: "বোতল",
    glyph: "🍾",
    lid: false,
    bottle: true, // lying on its side, ship-in-a-bottle style
    interior: {
      innerRadius: 0.72,
      bodyHeight: 1.1,
      floorY: -0.42,
      wallThickness: 0.05,
      stretchX: 1.75,
    },
    profile: null,
  },
  {
    id: "mason",
    label: "ম্যাসন",
    glyph: "🫙",
    lid: "metal",
    interior: { innerRadius: 1.02, bodyHeight: 2.3, floorY: -1.15, wallThickness: 0.06 },
    profile: masonProfile,
  },
  {
    id: "globe",
    label: "গোল জার",
    glyph: "🔮",
    lid: false,
    interior: { innerRadius: 1.0, bodyHeight: 1.7, floorY: -1.2, wallThickness: 0.06 },
    profile: globeProfile,
  },
  {
    id: "cylinder",
    label: "লম্বা",
    glyph: "🥛",
    lid: false,
    interior: { innerRadius: 0.82, bodyHeight: 2.75, floorY: -1.4, wallThickness: 0.05 },
    profile: cylinderProfile,
  },
  {
    id: "bowl",
    label: "বাটি",
    glyph: "🥣",
    lid: false,
    interior: { innerRadius: 1.4, bodyHeight: 1.15, floorY: -1.0, wallThickness: 0.06 },
    profile: bowlProfile,
  },
  {
    id: "flask",
    label: "ফ্লাস্ক",
    glyph: "⚗️",
    lid: false,
    interior: { innerRadius: 1.05, bodyHeight: 1.9, floorY: -1.1, wallThickness: 0.05 },
    profile: flaskProfile,
  },
  {
    id: "egg",
    label: "ডিম জার",
    glyph: "🥚",
    lid: false,
    interior: { innerRadius: 0.95, bodyHeight: 2.0, floorY: -1.15, wallThickness: 0.05 },
    profile: eggProfile,
  },
  {
    id: "pyramid",
    label: "পিরামিড",
    glyph: "🔺",
    lid: false,
    poly: "pyramid", // framed glass pyramid, like the blue reference
    interior: { innerRadius: 0.95, bodyHeight: 1.3, floorY: -0.72, wallThickness: 0.04 },
    profile: null,
  },
  {
    id: "ico",
    label: "জিওডেসিক",
    glyph: "⬡",
    lid: false,
    poly: "ico", // black icosahedron frame terrarium
    interior: { innerRadius: 0.95, bodyHeight: 1.1, floorY: -0.6, wallThickness: 0.04 },
    profile: null,
  },
  {
    id: "gem",
    label: "রত্ন",
    glyph: "💠",
    lid: false,
    poly: "gem", // faceted crystal/dodecahedron with wood frame
    interior: { innerRadius: 0.95, bodyHeight: 1.05, floorY: -0.58, wallThickness: 0.04 },
    profile: null,
  },
  {
    id: "hexhouse",
    label: "অষ্টভুজ ঘর",
    glyph: "⬢",
    lid: false,
    geo: "hexhouse", // octagonal glass house with a hinged, knobbed door
    interior: { innerRadius: 0.92, bodyHeight: 1.55, floorY: -0.9, wallThickness: 0.045 },
    profile: null,
  },
  {
    id: "wedge",
    label: "কাত চূড়া",
    glyph: "◺",
    lid: false,
    geo: "wedge", // square tower sheared off at the top, hinged door
    interior: { innerRadius: 0.8, bodyHeight: 1.85, floorY: -1.0, wallThickness: 0.045 },
    profile: null,
  },
  {
    id: "kite",
    label: "ঘুড়ি জার",
    glyph: "◆",
    lid: false,
    geo: "kite", // pointed spire over a short opening band
    interior: { innerRadius: 0.88, bodyHeight: 0.85, floorY: -0.5, wallThickness: 0.045 },
    profile: null,
  },
  {
    id: "hexgem",
    label: "ষড়ভুজ রত্ন",
    glyph: "⬣",
    lid: false,
    geo: "hexgem", // hexagonal body with a flared rim, hinged door
    interior: { innerRadius: 0.92, bodyHeight: 1.5, floorY: -0.86, wallThickness: 0.045 },
    profile: null,
  },
  {
    id: "woodcase",
    label: "কাঠের বাক্স",
    glyph: "🪵",
    lid: false,
    geo: "woodcase", // frameless glass case in a wooden tray
    interior: { innerRadius: 0.62, bodyHeight: 1.15, floorY: -0.62, wallThickness: 0.04 },
    profile: null,
  },
  // ---------------------------------------------------------------------
  // Open vessels
  // ---------------------------------------------------------------------
  // The catalog marks succulents, cacti, crowns of thorns and the whole
  // flowering pack `open` — they need airflow and a dry spell and rot in a
  // sealed jar. Until now the shelf had nothing to put them in but glass, so
  // these are the opaque, open-topped planters: no glass, no lid, no
  // condensation, nothing overhead to trap humidity.
  {
    id: "terracotta",
    label: "টেরাকোটা টব",
    glyph: "🪴",
    lid: false,
    openVessel: true,
    clay: { color: "#b0684a", rough: 0.95 },
    interior: { innerRadius: 1.15, bodyHeight: 1.5, floorY: -0.95, wallThickness: 0.07 },
    profile: potProfile,
  },
  {
    id: "dishgarden",
    label: "ডিশ গার্ডেন",
    glyph: "🍽️",
    lid: false,
    openVessel: true,
    clay: { color: "#8f887c", rough: 0.96 },
    interior: { innerRadius: 1.6, bodyHeight: 0.62, floorY: -0.52, wallThickness: 0.06 },
    profile: dishProfile,
  },
  {
    id: "stoneurn",
    label: "পাথরের আর্ন",
    glyph: "🏺",
    lid: false,
    openVessel: true,
    clay: { color: "#a8a094", rough: 0.96 },
    interior: { innerRadius: 1.12, bodyHeight: 1.2, floorY: -0.5, wallThickness: 0.07 },
    profile: urnProfile,
  },
  {
    id: "troughbox",
    label: "কাঠের ট্রাফ",
    glyph: "🪵",
    lid: false,
    openVessel: true,
    clay: { color: "#9a7448", rough: 0.94, flat: true },
    interior: { innerRadius: 1.3, bodyHeight: 0.9, floorY: -0.66, wallThickness: 0.08 },
    profile: troughProfile,
    segments: 4, // lathed on four segments, so it reads as a square planter
  },
  {
    id: "greenhouse",
    label: "গ্রিনহাউস",
    glyph: "🏠",
    lid: false,
    house: true, // rectangular framed glass house
    interior: {
      innerRadius: 0.85,
      bodyHeight: 1.1,
      floorY: -0.8,
      wallThickness: 0.04,
      stretchX: 1.5,
    },
    profile: null,
  },
];

// Avatar-creator-style variety: every shape is offered in three sizes, so the
// shelf holds dozens of vessels to choose from.
const SIZES = [
  { suffix: "", label: "", r: 1, h: 1 },
  { suffix: "-s", label: "ছোট", r: 0.78, h: 0.78 },
  { suffix: "-l", label: "বড়", r: 1.16, h: 1.2 },
];

export const JAR_TYPES = [
  // Like the reference: you can build the whole terrarium in the open on the
  // table first, and slip a jar over it whenever you like.
  {
    id: "none",
    label: "জার ছাড়া",
    glyph: "⊘",
    none: true,
    lid: false,
    interior: { innerRadius: 1.45, bodyHeight: 2.4, floorY: -1.15, wallThickness: 0.05 },
    profile: null,
  },
  // Whole-terrarium GLB models as ready-made vessels (added by the user).
  {
    id: "jar-faceted",
    label: "ফ্রেম টেরারিয়াম",
    glyph: "🔶",
    lid: false,
    modelJar: true,
    interior: { innerRadius: 0.8, bodyHeight: 1.0, floorY: -0.35, wallThickness: 0.04 },
    profile: null,
  },
  {
    id: "jar-snake",
    label: "স্নেক টেরারিয়াম",
    glyph: "🦎",
    lid: false,
    modelJar: true,
    interior: { innerRadius: 0.8, bodyHeight: 0.9, floorY: -0.3, wallThickness: 0.04 },
    profile: null,
  },
  {
    id: "jar-herb",
    label: "হার্ব টেরারিয়াম",
    glyph: "🌱",
    lid: false,
    modelJar: true,
    interior: { innerRadius: 0.75, bodyHeight: 1.1, floorY: -0.3, wallThickness: 0.04 },
    profile: null,
  },
  ...BASE_JARS.flatMap((base) =>
    SIZES.map((s) => ({
      ...base,
      id: `${base.id}${s.suffix}`,
      label: s.label ? `${base.label} · ${s.label}` : base.label,
      interior: {
        ...base.interior,
        innerRadius: base.interior.innerRadius * s.r,
        bodyHeight: base.interior.bodyHeight * s.h,
        floorY: base.interior.floorY * s.h,
      },
    })),
  ),
];

export const JAR_BY_ID = Object.fromEntries(JAR_TYPES.map((j) => [j.id, j]));

// ---------------------------------------------------------------------------
// Interior silhouette
// ---------------------------------------------------------------------------
// How wide the *inside* of this vessel is at each height, from the floor up to
// the top of the usable body. Round jars (globe, bowl, egg) and faceted ones
// (gem, geodesic, pyramid) pinch in sharply near the floor, so substrate cut to
// the jar's widest radius would push straight out through the glass. Builders
// read this through JAR.silhouette / jarRadiusAt().
export function jarInnerSilhouette(typeId, it) {
  const type = JAR_BY_ID[typeId] || JAR_TYPES[0];
  if (type.none || type.modelJar || type.bottle || type.house) return null;
  if (type.geo) return geoSilhouette(GEO_SPECS[type.geo], it);
  const floor = it.floorY;
  const top = it.floorY + it.bodyHeight;
  const N = 24;
  const samples = [];

  if (type.poly) {
    // Faceted vessels: use the *inscribed* radius, since a flat pane cuts
    // closer to the axis than the vertices it spans.
    for (let i = 0; i <= N; i++) {
      const y = floor + ((top - floor) * i) / N;
      let r;
      if (type.poly === "pyramid") {
        const h = it.bodyHeight + 1.1;
        const apexY = it.floorY - 0.06 + h;
        const circum = it.innerRadius * 1.55 * Math.max(0, (apexY - y) / h);
        r = circum * Math.SQRT1_2; // square cross-section: apothem
      } else {
        const R = it.innerRadius * (type.poly === "ico" ? 1.4 : 1.42);
        const cy = it.floorY + R * (type.poly === "ico" ? 0.6 : 0.58);
        const inR = R * (type.poly === "ico" ? 0.7558 : 0.7947);
        const dy = Math.min(Math.abs(y - cy), inR);
        r = Math.sqrt(Math.max(0, inR * inR - dy * dy));
      }
      samples.push({ y, r: Math.max(0.05, r - it.wallThickness) });
    }
    return samples;
  }

  if (!type.profile) return null;
  // Drop the axis points that merely close the lathe's base/top cap — they are
  // not wall, and treating them as wall would pinch the floor to nothing.
  let pts = type.profile(it);
  while (pts.length > 2 && pts[0].x < 0.02) pts = pts.slice(1);
  while (pts.length > 2 && pts[pts.length - 1].x < 0.02) pts = pts.slice(0, -1);
  for (let i = 0; i <= N; i++) {
    const y = floor + ((top - floor) * i) / N;
    samples.push({ y, r: Math.max(0.05, latheRadiusAt(pts, y) - it.wallThickness) });
  }
  return samples;
}

// ---------------------------------------------------------------------------
// Interior cross-section
// ---------------------------------------------------------------------------
// `jarInnerSilhouette` above answers "how wide at this height", which is the
// whole truth for a vessel whose outline is the same shape all the way up —
// a cylinder, a bowl, a hexagonal case. Two families are not like that, and
// they are exactly the two that looked broken:
//
//   • a bottle on its side is a *horizontal* bore. Its footprint is as long as
//     the bottle at every height, while its width across the belly starts at
//     nothing on the floor and swells to the full bore at the axis.
//   • a glass house is a rectangle, and a rectangle scaled by one radius is
//     still a rectangle only if you started with one — starting from a circle
//     gives you an ellipse inscribed in the case, with four empty corners.
//
// Both need the footprint to be a function of height, so they hand over a
// sampled table instead. Everything reads it through jarReach(y, a); vessels
// that *are* separable return null and keep the cheaper silhouette path.
// The most reliable description of a vessel's inside is the vessel. The
// formulas below derive a section from each family's *declared* metrics, and
// they are right whenever those metrics match the mesh — but a globe with a
// pedestal, an egg that tapers to a point and a trough whose footprint was
// tuned by eye all had glass somewhere its numbers did not predict, and the
// substrate went where the numbers said.
//
// So the section is *measured* off the built glass where we can: fire a ray out
// from the axis at each sample and take the first pane it meets. That is true
// by construction for every vessel, including ones whose shape nobody wrote
// down — a loaded GLB terrarium measures exactly as well as a lathe.
//
// Rays that meet nothing (an open-bottomed cloche below its rim, a height above
// the glass) leave a hole in the table, which is filled from the analytic
// section afterwards rather than being allowed to read as "infinitely wide".
export function measureInnerSection(glassMeshes, it, fallback = null, radial = false) {
  if (!glassMeshes || !glassMeshes.length) return fallback;
  // A surface of revolution is the same at every heading, so one column of rays
  // describes it exactly and the other 63 are 63 times the work for the same
  // answer. This is the difference between ~400ms and ~6ms on a jar switch,
  // which is the difference between a stall and no stall.
  const cols = radial ? 1 : SECT_NA;
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = true;
  const org = new THREE.Vector3();
  const dir = new THREE.Vector3();

  // Casting from *inside*, the first surface met is a back face. Front-side
  // materials would cull it and report the far wall — or nothing at all.
  const sides = [];
  for (const m of glassMeshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat) continue;
      sides.push([mat, mat.side]);
      mat.side = THREE.DoubleSide;
    }
    m.updateMatrixWorld(true);
  }

  const y0 = it.floorY;
  const y1 = it.floorY + it.bodyHeight;
  const ys = new Float32Array(SECT_NY);
  const r = new Float32Array(SECT_NY * SECT_NA);
  const inset = it.wallThickness * 0.5 + 0.012;
  try {
    for (let iy = 0; iy < SECT_NY; iy++) {
      // Sample a hair above the floor: a ray exactly on it grazes the base pane
      // and reports a hit at zero distance.
      const y = y0 + ((y1 - y0) * iy) / (SECT_NY - 1) + (iy === 0 ? 0.008 : 0);
      ys[iy] = y0 + ((y1 - y0) * iy) / (SECT_NY - 1);
      for (let ia = 0; ia < cols; ia++) {
        const a = (ia / cols) * Math.PI * 2;
        org.set(0, y, 0);
        dir.set(Math.cos(a), 0, Math.sin(a));
        ray.set(org, dir);
        const hits = ray.intersectObjects(glassMeshes, true);
        const v = hits.length ? Math.max(0.02, hits[0].distance - inset) : -1;
        if (radial) r.fill(v, iy * SECT_NA, (iy + 1) * SECT_NA);
        else r[iy * SECT_NA + ia] = v;
      }
    }
  } finally {
    for (const [mat, side] of sides) mat.side = side;
  }

  // Fill the misses from whatever we can say analytically, and if there is
  // nothing to say, from the nearest measured neighbour at the same heading.
  let measured = 0;
  for (let ia = 0; ia < SECT_NA; ia++) {
    const a = (ia / SECT_NA) * Math.PI * 2;
    for (let iy = 0; iy < SECT_NY; iy++) {
      const k = iy * SECT_NA + ia;
      if (r[k] > 0) { measured++; continue; }
      r[k] = fallbackReach(fallback, ys[iy], a, it);
    }
  }
  // A vessel we could barely see is one we should not claim to have measured.
  if (measured < SECT_NY * SECT_NA * 0.35) return fallback;
  void cols;
  return { ys, r, na: SECT_NA };
}

/** Best analytic guess at the reach, for filling gaps in a measured table. */
function fallbackReach(fallback, y, a, it) {
  if (fallback) {
    const { ys, r, na } = fallback;
    let iy = 0;
    while (iy < ys.length - 1 && ys[iy + 1] < y) iy++;
    const ia = Math.round((a / (Math.PI * 2)) * na) % na;
    return r[iy * na + ia];
  }
  return Math.max(0.05, it.innerRadius - it.wallThickness);
}

const SECT_NA = 64; // angular samples — smooth on a belly, cheap to build
const SECT_NY = 28; // height samples

/**
 * The interior of the vessel that was just built, as one table.
 *
 * This is the only thing callers should need. The policy for *how* the table
 * is obtained lives here rather than at the call site, because it is the kind
 * of decision that grows a special case per jar if you let it:
 *
 *   • a bottle is described analytically from the same spec its glass is
 *     lathed from, so measuring it would only re-derive what we already know —
 *     at a cost of ~140ms, the one measurement expensive enough to feel.
 *   • a surface of revolution is identical at every heading, so a single
 *     column of rays describes it exactly.
 *   • everything else is measured properly off its panes, which is what caught
 *     an egg whose declared floor sat below its glass and a trough whose
 *     corners its footprint never knew about.
 *
 * The analytic section is always computed first and handed in as the fallback,
 * so a measurement that sees too little of the vessel degrades to it rather
 * than to nothing.
 */
export function jarSectionFor(typeId, it, glassMeshes) {
  const type = JAR_BY_ID[typeId] || JAR_TYPES[0];
  const analytic = jarInnerSection(typeId, it);
  if (type.bottle) return analytic;
  return measureInnerSection(glassMeshes, it, analytic, jarIsRound(typeId, it));
}

/** Is this vessel a surface of revolution about Y? */
export function jarIsRound(typeId, it) {
  const type = JAR_BY_ID[typeId] || JAR_TYPES[0];
  // A lathe is only a surface of revolution if it has enough segments to be
  // one. The trough is lathed on four, which makes it a square planter wearing
  // a lathe's clothes — measuring it down a single ray would describe a circle
  // that its corners stick straight out of.
  const segments = type.segments || 128;
  return Boolean(
    type.profile &&
      segments >= 24 &&
      !type.poly &&
      !type.geo &&
      !type.bottle &&
      !type.house &&
      !it.footprint,
  );
}

export function jarInnerSection(typeId, it) {
  const type = JAR_BY_ID[typeId] || JAR_TYPES[0];
  if (type.bottle) return bottleSection(it);
  if (type.house) return boxSection(it);
  if (type.poly) return polySection(it, type.poly);
  return null; // separable: silhouette × footprint already describes it
}

// A faceted vessel — square pyramid, icosahedron, dodecahedron — sliced from
// the very geometry the glass is built from, so the soil's outline and the
// panes it sits behind cannot disagree. Each triangle contributes a half-space
// n·p ≤ d; a point is inside when it satisfies all of them, and the reach along
// a heading is the nearest wall that heading runs into.
//
// This replaces treating faceted jars as round at their *inscribed* radius,
// which was safe — it never poked out — but left the corners of every pane
// visibly empty, which is the tell that nothing is really being filled.
function polySection(it, kind) {
  let geo;
  let centerY;
  if (kind === "pyramid") {
    const h = it.bodyHeight + 1.1;
    geo = new THREE.ConeGeometry(it.innerRadius * 1.55, h, 4, 1);
    geo.rotateY(Math.PI / 4);
    centerY = it.floorY - 0.06 + h / 2;
  } else if (kind === "ico") {
    const R = it.innerRadius * 1.4;
    geo = new THREE.IcosahedronGeometry(R, 0);
    centerY = it.floorY + R * 0.6;
  } else {
    const R = it.innerRadius * 1.42;
    geo = new THREE.DodecahedronGeometry(R, 0);
    centerY = it.floorY + R * 0.58;
  }

  const planes = facePlanes(geo);
  geo.dispose();
  const inset = it.wallThickness + 0.02;

  const y0 = it.floorY;
  const y1 = it.floorY + it.bodyHeight;
  return sampleSection(y0, y1, (y, a) => {
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const ly = y - centerY; // the polyhedron is modelled about its own centre
    let best = Infinity;
    for (const pl of planes) {
      const along = pl.nx * dx + pl.nz * dz;
      if (along <= 1e-9) continue; // this wall is behind us, or parallel
      const room = pl.d - inset - pl.ny * ly;
      if (room <= 0) return 0.02; // already outside at this height
      best = Math.min(best, room / along);
    }
    return best === Infinity ? 0.02 : best;
  });
}

/** Outward face planes (n, d) of a convex geometry, deduplicated. */
function facePlanes(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    const d = n.dot(a);
    // Coplanar triangles of the same face collapse to one plane.
    if (out.some((p) => Math.abs(p.nx - n.x) < 1e-4 && Math.abs(p.ny - n.y) < 1e-4 &&
                        Math.abs(p.nz - n.z) < 1e-4 && Math.abs(p.d - d) < 1e-4)) continue;
    out.push({ nx: n.x, ny: n.y, nz: n.z, d });
  }
  if (g !== geo) g.dispose();
  return out;
}

/**
 * Sample `reach(y, a)` into the flat table jarReach() expects.
 *
 * `y0`/`y1` must bracket the vessel's usable body, because jarReach holds the
 * first and last rows for anything outside the table rather than extrapolating.
 * A table that starts above the floor therefore does not leave the floor
 * undefined — it quietly reports the floor as being as wide as the first row.
 */
function sampleSection(y0, y1, reach) {
  const ys = new Float32Array(SECT_NY);
  const r = new Float32Array(SECT_NY * SECT_NA);
  for (let iy = 0; iy < SECT_NY; iy++) {
    const y = y0 + ((y1 - y0) * iy) / (SECT_NY - 1);
    ys[iy] = y;
    for (let ia = 0; ia < SECT_NA; ia++) {
      const a = (ia / SECT_NA) * Math.PI * 2;
      r[iy * SECT_NA + ia] = Math.max(0.02, reach(y, a));
    }
  }
  return { ys, r, na: SECT_NA };
}

// A bottle lying along +X. At height y the bore is a horizontal slice of the
// body of revolution: the half-width across the bottle (±z) at station x is
// sqrt(bore(x)² − dy²), where dy is how far y sits off the bottle's axis. So
// the boundary along a heading is found by walking out until that stops being
// true — a short march, done once per jar, not per frame.
function bottleSection(it) {
  const { bodyLen, centerY, pts } = bottleSpec(it);
  const wall = it.wallThickness;
  // Only the body is fillable; soil does not climb into the neck.
  const xMin = -bodyLen / 2 + 0.12;
  const xMax = bodyLen / 2 - 0.16;

  // Inner bore at station x along the axis, shrunk by the wall.
  const boreAt = (x) => Math.max(0, latheRadiusAt(pts, x) - wall);

  // Half-depth across the belly at station x, at height y.
  const depth = (x, y) => {
    if (x < xMin || x > xMax) return -1;
    const bore = boreAt(x);
    const dy = y - centerY;
    const v = bore * bore - dy * dy;
    return v <= 0 ? -1 : Math.sqrt(v);
  };

  // The bore's lowest point *is* floorY: the bore radius is `innerRadius`, and
  // the axis sits `innerRadius` above the floor. Subtracting the wall again
  // here started the table a wall-thickness too high, and since jarReach holds
  // the end value for anything below the table, every height under it inherited
  // a bed 0.26 wide where the bottle is a knife edge — which is precisely the
  // substrate that was seen fanning out beneath the glass.
  //
  // Every section must span the vessel's whole declared body for this reason:
  // outside the table there is no measurement, only the nearest row repeated.
  const y0 = it.floorY;
  const y1 = it.floorY + it.bodyHeight;

  return sampleSection(y0, y1, (y, a) => {
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // March out along the heading until the point leaves the bore, then bisect
    // for the crossing. 28 coarse steps over the longest possible ray, and 18
    // bisections, put the boundary well inside a tenth of a millimetre.
    const far = bodyLen;
    let lo = 0;
    let hi = far;
    let found = false;
    const inside = (t) => {
      const hz = depth(dx * t, y);
      return hz >= 0 && Math.abs(dz * t) <= hz;
    };
    if (!inside(0.0005)) return 0.02; // this height misses the bore entirely
    const STEPS = 28;
    for (let i = 1; i <= STEPS; i++) {
      const t = (far * i) / STEPS;
      if (!inside(t)) {
        lo = (far * (i - 1)) / STEPS;
        hi = t;
        found = true;
        break;
      }
    }
    if (!found) return far;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  });
}

// A rectangular glass case: half-width `hw` along X, half-depth `hd` along Z.
// The reach along a heading is whichever wall the ray meets first — which is
// what makes the substrate square off into the corners instead of sitting in
// the middle as a disc.
function boxSection(it) {
  const hw = Math.max(0.05, it.innerRadius * (it.stretchX || 1) - it.wallThickness);
  const hd = Math.max(0.05, it.innerRadius - it.wallThickness);
  const y0 = it.floorY;
  const y1 = it.floorY + it.bodyHeight;
  return sampleSection(y0, y1, (_y, a) => {
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const tx = c > 1e-6 ? hw / c : Infinity;
    const tz = s > 1e-6 ? hd / s : Infinity;
    return Math.min(tx, tz);
  });
}

// Outer radius of a lathe profile at height `y` — the tightest of every segment
// spanning that height, so a flared rim can never widen what sits below it.
function latheRadiusAt(pts, y) {
  let r = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo || y > hi) continue;
    const t = hi === lo ? 0 : (y - a.y) / (b.y - a.y);
    r = Math.min(r, a.x + (b.x - a.x) * t);
  }
  if (r === Infinity) {
    // Above/below the profile: hold the nearest end's radius.
    r = y <= pts[0].y ? pts[0].x : pts[pts.length - 1].x;
  }
  return r;
}

// The hero jar from the reference: a tall apothecary jar — straight body,
// short shoulder easing into a wide neck, cork stopper on top.
function referenceJarProfile(it, shape, mouth) {
  const r = it.innerRadius + it.wallThickness;
  const f = it.floorY, h = it.bodyHeight;
  const side = shape === "taper"
    ? [[1, .06], [1, .20], [.98, .36], [.92, .53], [.83, .72], [.73, .91], [mouth, 1]]
    : shape === "shoulder"
      ? [[1, .07], [1, .63], [.995, .71], [.975, .77], [.92, .83], [.84, .88], [mouth, .93], [mouth, 1]]
      : [[1, .04], [1, 1]];
  return [[0, f - it.wallThickness], [.90*r, f - it.wallThickness], [.98*r, f],
    ...side.map(([radius,y]) => [radius*r, f+y*h]),
    [mouth*r+.009, f+h+.008], [mouth*r+.009, f+h+.022], [mouth*r-.012, f+h+.022],
  ].map(([x,y]) => new THREE.Vector2(x,y));
}

function corkJarProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor],
    [rOuter * 0.6, floor],
    [rOuter * 0.92, floor + 0.03],
    [rOuter, floor + 0.1],
    [rOuter, bodyTop],
    [rOuter * 0.96, bodyTop + 0.16],
    [rOuter * 0.78, bodyTop + 0.3],
    [rOuter * 0.72, bodyTop + 0.42],
    [rOuter * 0.72, bodyTop + 0.56],
    [rOuter * 0.75, bodyTop + 0.6],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// A cloche / bell jar: straight sides sweeping into a smooth rounded crown,
// open at the bottom, resting on a wooden base.
function domeProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const bottom = it.floorY;
  const straightTop = it.floorY + it.bodyHeight * 0.72;
  const pts = [
    [rOuter * 1.04, bottom], // slight flare where it meets the base
    [rOuter, bottom + 0.1],
    [rOuter, straightTop],
  ];
  // rounded crown
  const R = rOuter;
  const cy = straightTop;
  const N = 14;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * (Math.PI / 2);
    pts.push([Math.cos(t) * R, cy + Math.sin(t) * R * 0.85]);
  }
  return pts.map((p) => new THREE.Vector2(p[0], p[1]));
}

function masonProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor],
    [rOuter * 0.55, floor],
    [rOuter * 0.9, floor + 0.03],
    [rOuter, floor + 0.12],
    [rOuter, bodyTop],
    [rOuter * 0.98, bodyTop + 0.14],
    [rOuter * 0.78, bodyTop + 0.34],
    [rOuter * 0.66, bodyTop + 0.46],
    [rOuter * 0.64, bodyTop + 0.6],
    [rOuter * 0.66, bodyTop + 0.66],
    [rOuter * 0.64, bodyTop + 0.72],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

function cylinderProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor],
    [rOuter * 0.6, floor],
    [rOuter * 0.94, floor + 0.03],
    [rOuter, floor + 0.1],
    [rOuter, bodyTop + 0.4],
    [rOuter * 1.03, bodyTop + 0.5], // little flared lip
    [rOuter, bodyTop + 0.58],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// A rounded fishbowl: sample a circular arc for the belly, closing in near the
// top to a small mouth.
function globeProfile(it) {
  const R = (it.innerRadius + it.wallThickness) * 1.28;
  const cy = it.floorY - it.wallThickness + R * 0.86;
  const pts = [new THREE.Vector2(0, it.floorY - it.wallThickness)];
  // y = cy − cos(t)·R, so *small* t is the bottom of the sphere and large t the
  // mouth. Walking t downward therefore built the profile top-first, and a
  // lathe fed points in that order joins the base axis straight up to the rim —
  // a cone standing inside the globe. It was invisible through transmissive
  // glass, but it is real geometry: it is what a ray fired out from the axis
  // met first, and so it is what the substrate was being fitted to.
  const tBottom = Math.PI * 0.12;
  const tMouth = Math.PI * 0.72;
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = tBottom + (tMouth - tBottom) * (i / N);
    pts.push(new THREE.Vector2(Math.sin(t) * R, cy - Math.cos(t) * R));
  }
  return pts;
}

// An Erlenmeyer-flask cone: wide base tapering to a narrow neck.
function flaskProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor],
    [rOuter * 0.6, floor],
    [rOuter * 0.95, floor + 0.04],
    [rOuter, floor + 0.12],
    [rOuter * 0.34, bodyTop + 0.25],
    [rOuter * 0.3, bodyTop + 0.6],
    [rOuter * 0.34, bodyTop + 0.68],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// An egg-shaped vessel with a round opening at the top.
function eggProfile(it) {
  const R = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const H = it.bodyHeight + 0.7;
  const pts = [new THREE.Vector2(0, floor)];
  const N = 22;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    // egg curve: fat near the bottom, tapering above
    const y = floor + t * H;
    const r = R * Math.sin(Math.PI * Math.min(t * 0.82 + 0.04, 0.96)) * (1.06 - t * 0.28);
    pts.push(new THREE.Vector2(Math.max(r, R * 0.3), y));
  }
  return pts;
}

// A wide, open, shallow bowl with a softly flared rim.
function bowlProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor],
    [rOuter * 0.5, floor],
    [rOuter * 0.85, floor + 0.05],
    [rOuter * 0.98, floor + 0.25],
    [rOuter, bodyTop - 0.1],
    [rOuter * 1.08, bodyTop + 0.06], // flared rim
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// A classic flower pot: straight battered walls under a proud rolled rim, and
// a foot ring so it does not sit flat on the table.
function potProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor - 0.06],
    [rOuter * 0.64, floor - 0.06],
    [rOuter * 0.68, floor],
    [rOuter * 0.72, floor + 0.02],
    [rOuter * 0.97, bodyTop - 0.12],
    [rOuter * 1.0, bodyTop - 0.06],
    [rOuter * 1.09, bodyTop - 0.04], // the rim, rolled out and back
    [rOuter * 1.09, bodyTop + 0.06],
    [rOuter * 0.99, bodyTop + 0.06],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// A bonsai tray / dish garden: very wide, very shallow, on four stub feet that
// a low foot ring stands in for.
function dishProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor - 0.05],
    [rOuter * 0.84, floor - 0.05],
    [rOuter * 0.88, floor],
    [rOuter * 0.92, floor + 0.03],
    [rOuter, bodyTop - 0.04],
    [rOuter * 1.04, bodyTop + 0.04],
    [rOuter * 0.96, bodyTop + 0.04],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// A footed garden urn: a stem and a spreading base under a bellied bowl with a
// flared lip.
function urnProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const base = it.floorY - it.bodyHeight * 0.55;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, base - 0.08],
    [rOuter * 0.6, base - 0.08],
    [rOuter * 0.62, base],
    [rOuter * 0.3, base + 0.12], // the stem
    [rOuter * 0.28, base + 0.3],
    [rOuter * 0.62, it.floorY - 0.12],
    [rOuter * 0.94, it.floorY + 0.1],
    [rOuter, bodyTop - 0.3],
    [rOuter * 0.96, bodyTop - 0.08],
    [rOuter * 1.1, bodyTop + 0.04], // flared lip
    [rOuter * 1.0, bodyTop + 0.08],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// A wooden trough. Lathed on four segments only, so the "radius" is the
// distance to each corner and the result is a square box with sloped sides.
function troughProfile(it) {
  const rOuter = it.innerRadius + it.wallThickness;
  const floor = it.floorY - it.wallThickness;
  const bodyTop = it.floorY + it.bodyHeight;
  return [
    [0.0, floor - 0.07],
    [rOuter * 0.78, floor - 0.07],
    [rOuter * 0.8, floor],
    [rOuter * 0.9, floor + 0.04],
    [rOuter * 1.02, bodyTop],
    [rOuter * 1.1, bodyTop + 0.05], // the capping rail
    [rOuter * 0.98, bodyTop + 0.05],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
}

// ---------------------------------------------------------------------------
// Building the jar mesh
// ---------------------------------------------------------------------------

// Every glass/frame material created while building the current jar is
// registered here so the customiser can re-tint them afterwards.
let glassMats = [];
let frameMats = [];
function regGlass(m) { glassMats.push(m); return m; }
function regFrame(m) { frameMats.push(m); return m; }

export function buildJar(typeId, envMap, itOverride) {
  const type = JAR_BY_ID[typeId] || JAR_TYPES[0];
  const it = itOverride || type.interior;
  const group = new THREE.Group();
  group.name = "jar";
  glassMats = [];
  frameMats = [];

  // Ready-made model terrarium: render the GLB as the vessel itself. While the
  // model is still loading a simple wooden plinth stands in; main.js swaps it
  // as soon as the file arrives.
  if (type.modelJar) {
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.001, 0.001, 0.001),
      new THREE.MeshBasicMaterial(),
    );
    ghost.visible = false;
    group.add(ghost);
    const model = getJarModelClone(type.id);
    // The model is normalised to stand on y = 0, so its own base goes to the
    // base the interior was measured against — that is what keeps the soil
    // inside the glass instead of under it.
    const bottomY = it.modelBottomY ?? it.floorY - it.wallThickness;
    if (model) {
      model.position.y = bottomY;
      group.add(model);
      // Find the model's own panes and register them as glass. Without this a
      // loaded terrarium had *no* glass as far as the rest of the app was
      // concerned: its interior could not be measured (so the substrate fell
      // back to a plain cylinder at innerRadius), and the customiser had
      // nothing to tint. A GLB names its materials, and the one we want says
      // so — failing that, a nearly see-through material is a pane whatever it
      // is called.
      model.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m) return;
          const looksLikeGlass =
            /glass|pane|vitre/i.test(m.name || "") ||
            (m.transparent === true && m.opacity < 0.5) ||
            (m.transmission ?? 0) > 0.2;
          if (!looksLikeGlass) return;
          // Panes do not occlude what is inside them — the same reason the
          // lathed jars stopped writing depth.
          m.depthWrite = false;
          if (m.isMeshPhysicalMaterial && m.transmission > 0) {
            m.roughness = Math.min(m.roughness, 0.006);
            m.thickness = Math.min(m.thickness, 0.025);
          }
          regGlass(m);
        });
      });
    } else {
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 0.12, 24),
        regFrame(new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.85 })),
      );
      plinth.position.y = bottomY + 0.06;
      group.add(plinth);
    }
    // `glass` is what taps and the mist spray are cast against. For a model
    // terrarium the model *is* the glass: handing back the stand-in ghost
    // leaves nothing to tap but the small placement disc, so pouring a layer
    // only worked if you happened to hit it.
    return { group, glass: model ?? ghost, glassMats, frameMats };
  }

  // No jar at all: an invisible stand-in mesh keeps the raycast plumbing happy.
  if (type.none) {
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.001, 0.001, 0.001),
      new THREE.MeshBasicMaterial(),
    );
    ghost.visible = false;
    group.add(ghost);
    return { group, glass: ghost, glassMats, frameMats };
  }

  if (type.geo) {
    const spec = GEO_SPECS[type.geo];
    return buildGeoJar(it, envMap, group, spec, spec.closed);
  }
  if (type.bottle) return buildBottle(it, envMap, group);
  if (type.house) return buildGreenhouse(it, envMap, group);
  if (type.poly) return buildPolyJar(it, envMap, group, type.poly);

  const profile = type.profile(it);
  // Low segment counts (e.g. the greenhouse's 6) leave crisp flat panes.
  const glassGeo = new THREE.LatheGeometry(profile, type.segments || 128);
  glassGeo.computeVertexNormals();

  // An open planter is not glass: matte fired clay, stone or timber, opaque on
  // both faces so you read a solid wall rather than a tinted pane.
  const glassMat = regGlass(
    type.clay ? makeClayMaterial(type.clay) : makeGlassMaterial(envMap),
  );
  if (type.referenceJar) {
    // Keep bright room highlights from hiding the small leaves at the centre.
    glassMat.specularIntensity = .28;
    glassMat.envMapIntensity = .16;
    glassMat.clearcoat = .08;
  }

  const glass = new THREE.Mesh(glassGeo, glassMat);
  group.add(glass);

  // Inner floor disc so there's never a gap under the substrate. Sized to the
  // interior at floor height, not the jar's widest point, or it juts out of a
  // round vessel's underside.
  const sil = jarInnerSilhouette(type.id, it);
  const floorR = sil ? Math.min(it.innerRadius, sil[0].r) : it.innerRadius;
  // A low-segment vessel (the four-sided trough) needs a matching floor, or a
  // round disc juts out past the flat walls and reads as a shadow.
  const floorGeo = new THREE.CircleGeometry(floorR, type.segments || 48);
  const floorMat = new THREE.MeshStandardMaterial({
    color: "#3c2c1e",
    roughness: 1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = it.floorY + 0.001;
  floor.receiveShadow = true;
  group.add(floor);

  // Closed (lidded) jars mist up: fine condensation droplets cling to the
  // lower third of the inner wall, like a real sealed terrarium mid-morning.
  if (type.lid && !type.referenceJar) {
    group.add(buildCondensation(it, envMap));
  }

  const bodyTop = it.floorY + it.bodyHeight;

  // Metal band lid (mason jar).
  if (type.lid === "metal") {
    const ringR = (it.innerRadius + it.wallThickness) * 0.68;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(ringR, ringR, 0.16, 48, 1, true),
      regFrame(new THREE.MeshStandardMaterial({
        color: "#c9b48a",
        roughness: 0.5,
        metalness: 0.6,
        side: THREE.DoubleSide,
        envMap: envMap || null,
      })),
    );
    ring.position.y = bodyTop + 0.62;
    group.add(ring);
  }

  // Cork stopper (apothecary jar) — a fat tan plug sitting in the neck with a
  // wider cap proud of the rim, slightly domed.
  if (type.referenceJar) {
    const neckR = (it.innerRadius + it.wallThickness) * type.mouth;
    const corkMat = regFrame(new THREE.MeshStandardMaterial({
      color: "#bd8e57", ...grainMaps("cork"), bumpScale: .009,
      roughness: .96, envMapIntensity: .25,
    }));
    const h = Math.min(.20, it.bodyHeight * .075);
    const addCork = (rt, rb, height, y) => {
      const source = new THREE.CylinderGeometry(rt, rb, height, 96);
      const part = new THREE.Mesh(substrateUVs(source, .30), corkMat);
      source.dispose();
      part.position.y = y;
      part.castShadow = part.receiveShadow = true;
      group.add(part);
    };
    addCork(neckR*.976, neckR*.96, h*.50, bodyTop - h*.18);
    addCork(neckR*1.03, neckR*1.016, h, bodyTop + h*.5 + .022);
  } else if (type.lid === "cork") {
    const corkMat = regFrame(new THREE.MeshStandardMaterial({
      color: "#b98e5f",
      ...grainMaps("cork"),
      bumpScale: .008,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
    }));
    const neckR = (it.innerRadius + it.wallThickness) * 0.72;
    const plug = new THREE.Mesh(
      new THREE.CylinderGeometry(neckR * 0.96, neckR * 0.9, 0.22, 28),
      corkMat,
    );
    plug.position.y = bodyTop + 0.52;
    group.add(plug);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(neckR * 1.18, neckR * 1.12, 0.16, 28),
      corkMat,
    );
    cap.position.y = bodyTop + 0.7;
    cap.castShadow = true;
    group.add(cap);
    const domeTop = new THREE.Mesh(
      new THREE.SphereGeometry(neckR * 1.18, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      corkMat,
    );
    domeTop.scale.y = 0.18;
    domeTop.position.y = bodyTop + 0.78;
    group.add(domeTop);
  }

  // Wooden display base under the bell jar.
  if (type.woodBase) {
    const baseMat = regFrame(new THREE.MeshStandardMaterial({
      color: "#7a5a3a",
      roughness: 0.8,
      metalness: 0,
    }));
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(
        (it.innerRadius + it.wallThickness) * 1.28,
        (it.innerRadius + it.wallThickness) * 1.34,
        0.14,
        48,
      ),
      baseMat,
    );
    base.position.y = it.floorY - 0.07;
    base.receiveShadow = true;
    base.castShadow = true;
    group.add(base);
  }

  // Return the registered glass/frame materials too, so the customiser can
  // re-tint them (the poly/greenhouse/bottle paths already do this).
  return { group, glass, glassMats, frameMats };
}

// Real physically-based glass: light transmits and refracts through it
// (`transmission` + `ior` + `thickness`), with a faint green tint from
// attenuation — what sells the jar as a real object.
function makeGlassMaterial(envMap) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.006,
    transmission: 1.0,
    // Thin glass. `thickness` drives both the volumetric attenuation and how
    // far refraction displaces what is behind the pane, and at 0.9 — most of
    // the jar's own radius — it displaced the contents into a smear. On a
    // bright room that smear is white, and the whole vessel read as an opaque
    // white cylinder with the terrarium lost inside it. A real jar's wall is a
    // couple of millimetres; this is closer to that.
    thickness: 0.025,
    ior: 1.5,
    envMap: envMap || null,
    // A white room reflected at full strength is the other half of the same
    // problem: the surface blows out and there is nothing to see through.
    // Keep reflections present but stop them from whitening the terrarium
    // layers. The contents should be the visual focus, not the room reflection.
    envMapIntensity: 0.28,
    transparent: true,
    // Glass does not occlude what is inside it. Transmissive materials are
    // rendered in their own pass *before* the transparent one, so a pane that
    // writes depth culls every transparent thing behind it — which meant the
    // dust motes and the base placement marker were both invisible inside the
    // very jar they belong to, with no way to order around it. Opaque contents
    // (substrate, decorations) still occlude the glass correctly, because they
    // are drawn first and the glass still depth-*tests*.
    depthWrite: false,
    side: THREE.DoubleSide,
    clearcoat: 0.2,
    clearcoatRoughness: 0.015,
    attenuationColor: new THREE.Color(0xf4fff9),
    attenuationDistance: 12.0,
    specularIntensity: 0.7,
  });
  return material;
}

// The opaque counterpart to the glass: fired clay, stone or timber. Registered
// through the same `glassMats` list so the vessel customiser can still tint it.
function makeClayMaterial({ color, rough = 0.95, flat = false }) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: 0,
    side: THREE.DoubleSide,
    flatShading: flat,
  });
}

// A wine bottle lying on its side on a wooden cradle — ship-in-a-bottle style,
// neck pointing right, corked. The terrarium bed sits along the belly.
// The bottle described once, so the glass and the soil inside it cannot drift
// apart. `pts` is the lathe profile along +Y (revolved, then laid along +X):
// x is the bore at that station, y the distance along the bottle's axis.
function bottleSpec(it) {
  const R = it.innerRadius + it.wallThickness; // cross-section outer radius
  const bodyLen = it.innerRadius * it.stretchX * 2 + 0.3;
  const centerY = it.floorY + it.innerRadius; // glass axis height
  const pts = [
    [0, -bodyLen / 2 - 0.02],
    [R * 0.55, -bodyLen / 2 - 0.02],
    [R * 0.92, -bodyLen / 2 + 0.06],
    [R, -bodyLen / 2 + 0.2],
    [R, bodyLen / 2 - 0.2],
    // shoulder into the neck
    [R * 0.85, bodyLen / 2 + 0.05],
    [R * 0.42, bodyLen / 2 + 0.32],
    [R * 0.3, bodyLen / 2 + 0.5],
    [R * 0.3, bodyLen / 2 + 0.85],
    [R * 0.34, bodyLen / 2 + 0.9],
    [R * 0.31, bodyLen / 2 + 0.96],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  return { R, bodyLen, centerY, pts };
}

function buildBottle(it, envMap, group) {
  const { R, bodyLen, centerY, pts } = bottleSpec(it);

  const glassGeo = new THREE.LatheGeometry(pts, 96);
  glassGeo.computeVertexNormals();
  const glass = new THREE.Mesh(glassGeo, regGlass(makeGlassMaterial(envMap)));
  glass.rotation.z = -Math.PI / 2; // neck points +x
  glass.position.y = centerY;
  group.add(glass);

  // cork plugging the neck
  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.085, 0.22, 16),
    regFrame(new THREE.MeshStandardMaterial({
      color: "#b98e5f",
      roughness: 0.95,
      flatShading: true,
    })),
  );
  cork.rotation.z = Math.PI / 2;
  cork.position.set(bodyLen / 2 + 0.88, centerY, 0);
  group.add(cork);

  // There used to be a dark "settled bed" sphere here, parked below the floor to
  // hide the gap between flat slab layers and round glass. The layers follow
  // the bore now (see bottleSection), so there is no gap to hide — and the
  // sphere was itself the brown dome that hung visibly under the cradle.

  // wooden cradle: plank + two chocks
  const woodMat = regFrame(new THREE.MeshStandardMaterial({ color: "#6e4f30", roughness: 0.85 }));
  const plank = new THREE.Mesh(
    new THREE.BoxGeometry(bodyLen * 0.9, 0.09, R * 1.7),
    woodMat,
  );
  const glassBottom = centerY - R;
  plank.position.y = glassBottom - 0.1;
  plank.receiveShadow = true;
  plank.castShadow = true;
  group.add(plank);
  for (const s of [-1, 1]) {
    const chock = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, R * 1.5),
      woodMat,
    );
    chock.position.set(s * bodyLen * 0.3, glassBottom - 0.02, 0);
    chock.rotation.x = 0;
    chock.castShadow = true;
    group.add(chock);
  }

  return { group, glass, glassMats, frameMats };
}

// A geometric glass greenhouse: rectangular box of clear panes held in a thin
// black metal frame with muntins, topped by a pitched glass roof — modelled on
// the classic Victorian glass terrarium box.
function buildGreenhouse(it, envMap, group) {
  const hw = it.innerRadius * it.stretchX + it.wallThickness; // x half-width
  const hd = it.innerRadius + it.wallThickness; // z half-depth
  const floor = it.floorY - it.wallThickness;
  const wallTop = it.floorY + it.bodyHeight;
  const roofH = 0.62;
  const ridgeY = wallTop + roofH;

  const glassMat = regGlass(makeGlassMaterial(envMap));
  glassMat.thickness = 0.018;
  const frameMat = regFrame(new THREE.MeshStandardMaterial({
    color: 0x232323,
    roughness: 0.45,
    metalness: 0.55,
    envMap: envMap || null,
  }));

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // thin square bar between two points
  function strut(a, b, t = 0.028) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), frameMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.normalize(),
    );
    m.castShadow = true;
    group.add(m);
  }
  function pane(geo, pos, rot) {
    const p = new THREE.Mesh(geo, glassMat);
    p.position.copy(pos);
    if (rot) p.rotation.copy(rot);
    group.add(p);
    return p;
  }

  // --- glass walls
  const wallH = wallTop - floor;
  const frontGeo = new THREE.PlaneGeometry(hw * 2, wallH);
  pane(frontGeo, V(0, floor + wallH / 2, hd), new THREE.Euler(0, 0, 0));
  pane(frontGeo, V(0, floor + wallH / 2, -hd), new THREE.Euler(0, Math.PI, 0));
  const sideGeo = new THREE.PlaneGeometry(hd * 2, wallH);
  const glassSide = pane(
    sideGeo,
    V(hw, floor + wallH / 2, 0),
    new THREE.Euler(0, Math.PI / 2, 0),
  );
  pane(sideGeo, V(-hw, floor + wallH / 2, 0), new THREE.Euler(0, -Math.PI / 2, 0));

  // --- pitched glass roof (ridge runs along x)
  const slant = Math.hypot(hd, roofH);
  const roofGeo = new THREE.PlaneGeometry(hw * 2, slant);
  const pitch = Math.atan2(roofH, hd);
  const rf = pane(
    roofGeo,
    V(0, wallTop + roofH / 2, hd / 2),
    new THREE.Euler(-(Math.PI / 2 - pitch), 0, 0),
  );
  const rb = pane(
    roofGeo,
    V(0, wallTop + roofH / 2, -hd / 2),
    new THREE.Euler(Math.PI / 2 - pitch, Math.PI, 0),
  );

  // --- gable triangles at both x ends
  const tri = new THREE.Shape();
  tri.moveTo(-hd, 0);
  tri.lineTo(hd, 0);
  tri.lineTo(0, roofH);
  tri.closePath();
  const triGeo = new THREE.ShapeGeometry(tri);
  pane(triGeo, V(hw, wallTop, 0), new THREE.Euler(0, Math.PI / 2, 0));
  pane(triGeo, V(-hw, wallTop, 0), new THREE.Euler(0, -Math.PI / 2, 0));

  // --- frame: bottom & top perimeters, corner posts
  for (const y of [floor, wallTop]) {
    strut(V(-hw, y, hd), V(hw, y, hd));
    strut(V(-hw, y, -hd), V(hw, y, -hd));
    strut(V(-hw, y, -hd), V(-hw, y, hd));
    strut(V(hw, y, -hd), V(hw, y, hd));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      strut(V(sx * hw, floor, sz * hd), V(sx * hw, wallTop, sz * hd));
    }
  }
  // muntins: mid verticals + one horizontal rail per wall
  const railY = floor + wallH * 0.55;
  strut(V(-hw, railY, hd), V(hw, railY, hd), 0.02);
  strut(V(-hw, railY, -hd), V(hw, railY, -hd), 0.02);
  strut(V(-hw, railY, -hd), V(-hw, railY, hd), 0.02);
  strut(V(hw, railY, -hd), V(hw, railY, hd), 0.02);
  for (const x of [-hw / 3, hw / 3]) {
    strut(V(x, floor, hd), V(x, wallTop, hd), 0.02);
    strut(V(x, floor, -hd), V(x, wallTop, -hd), 0.02);
  }
  strut(V(hw, floor, 0), V(hw, wallTop, 0), 0.02);
  strut(V(-hw, floor, 0), V(-hw, wallTop, 0), 0.02);

  // roof frame: ridge, hip rafters, mid rafters
  strut(V(-hw, ridgeY, 0), V(hw, ridgeY, 0));
  for (const sx of [-1, 1]) {
    strut(V(sx * hw, wallTop, hd), V(sx * hw, ridgeY, 0));
    strut(V(sx * hw, wallTop, -hd), V(sx * hw, ridgeY, 0));
  }
  for (const x of [-hw / 3, hw / 3, 0]) {
    strut(V(x, wallTop, hd), V(x, ridgeY, 0), 0.02);
    strut(V(x, wallTop, -hd), V(x, ridgeY, 0), 0.02);
  }

  // --- black metal base tray with little feet
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2 + 0.12, 0.08, hd * 2 + 0.12),
    frameMat,
  );
  tray.position.y = floor - 0.04;
  tray.castShadow = true;
  tray.receiveShadow = true;
  group.add(tray);

  // dark soil liner so substrate reads as filling the box
  const liner = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 2 - 0.03, 0.02, hd * 2 - 0.03),
    new THREE.MeshStandardMaterial({ color: 0x33251a, roughness: 1 }),
  );
  liner.position.y = it.floorY + 0.005;
  group.add(liner);

  return { group, glass: glassSide, glassMats, frameMats };
}

// Framed polyhedron terrariums — glass panes inside a visible strut frame,
// like the pyramid / icosahedron / faceted-gem pieces in the references.
function buildPolyJar(it, envMap, group, kind) {
  let geo;
  let centerY;
  if (kind === "pyramid") {
    const h = it.bodyHeight + 1.1;
    geo = new THREE.ConeGeometry(it.innerRadius * 1.55, h, 4, 1);
    geo.rotateY(Math.PI / 4);
    centerY = it.floorY - 0.06 + h / 2;
  } else if (kind === "ico") {
    const R = it.innerRadius * 1.4;
    geo = new THREE.IcosahedronGeometry(R, 0);
    centerY = it.floorY + R * 0.6;
  } else {
    const R = it.innerRadius * 1.42;
    geo = new THREE.DodecahedronGeometry(R, 0);
    centerY = it.floorY + R * 0.58;
  }

  const glassMat = regGlass(makeGlassMaterial(envMap));
  const glass = new THREE.Mesh(geo, glassMat);
  glass.position.y = centerY;
  group.add(glass);

  // frame: a strut along every visible edge
  const frameMat = regFrame(
    new THREE.MeshStandardMaterial({
      color: kind === "gem" ? 0x8a6a44 : 0x26282c,
      roughness: 0.5,
      metalness: kind === "gem" ? 0.1 : 0.55,
      envMap: envMap || null,
    }),
  );
  const edges = new THREE.EdgesGeometry(geo, 5);
  const ep = edges.attributes.position;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < ep.count; i += 2) {
    a.set(ep.getX(i), ep.getY(i) + centerY, ep.getZ(i));
    b.set(ep.getX(i + 1), ep.getY(i + 1) + centerY, ep.getZ(i + 1));
    const dir = b.clone().sub(a);
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, dir.length(), 6),
      frameMat,
    );
    strut.position.copy(a).add(b).multiplyScalar(0.5);
    strut.quaternion.setFromUnitVectors(up, dir.normalize());
    strut.castShadow = true;
    group.add(strut);
  }

  // planter tray under the glass
  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(
      it.innerRadius * 1.18,
      it.innerRadius * 1.26,
      0.16,
      kind === "pyramid" ? 4 : 6,
    ),
    frameMat,
  );
  if (kind === "pyramid") tray.rotation.y = Math.PI / 4;
  tray.position.y = it.floorY - 0.08;
  tray.receiveShadow = true;
  tray.castShadow = true;
  group.add(tray);

  return { group, glass, glassMats, frameMats };
}

// Tiny water droplets instanced onto the inside of the glass wall, densest
// near the bottom and fading out by a third of the way up — matching how a
// healthy closed terrarium actually mists. A few are stretched vertically to
// read as runs/drips.
function buildCondensation(it, envMap) {
  const count = 85;
  const geo = new THREE.SphereGeometry(0.0045, 6, 5);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.20,
    depthWrite: false,
    envMap: envMap || null,
    envMapIntensity: 0.35,
    clearcoat: 1.0,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const zone = it.bodyHeight * 0.38; // lower third-ish of the wall
  const r = it.innerRadius + it.wallThickness * 0.25; // hugging the glass
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    // bias droplets downward: sqrt-distribution clusters near the substrate
    const h = Math.pow(Math.random(), 1.7) * zone;
    p.set(Math.cos(a) * r, it.floorY + 0.05 + h, Math.sin(a) * r);
    const drip = Math.random() < 0.08;
    const sc = 0.5 + Math.random() * 0.9;
    s.set(sc, drip ? sc * (2.5 + Math.random() * 2) : sc, sc * 0.55);
    // flatten each droplet against the wall (local z faces inward)
    q.setFromEuler(new THREE.Euler(0, -a + Math.PI / 2, 0));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.renderOrder = 5;
  return mesh;
}

// ---------------------------------------------------------------------------
// Framed geometric terrariums
// ---------------------------------------------------------------------------
// The stained-glass style vessels from the product photos: a stack of regular
// polygon rings, glazed pane by pane inside a black came frame. One pane of the
// body is hinged with a little brass knob, so the vessel actually opens — see
// buildGeoJar().
//
// `rings(it)` runs bottom -> top. `k` is the ring's inner radius as a multiple
// of the jar's own, `0` collapses the ring to a point on the axis, and `tiltX`
// shears the ring's height across x to cut a slanted crown. `door.band` names
// which gap between rings the opening pane is cut from; the pane itself is
// always the face pointing at the camera.

// The octagonal glass house: straight body, then two faceted steps drawing in
// to a small flat crown.
const GEO_HEX_HOUSE = {
  sides: 8,
  phase: Math.PI / 8,
  capTop: true,
  capBottom: true,
  closed: true,
  door: { band: 0 },
  rings: (it) => {
    const top = it.floorY + it.bodyHeight;
    return [
      { y: it.floorY - it.wallThickness, k: 1 },
      { y: top, k: 1 },
      { y: top + it.bodyHeight * 0.24, k: 0.76 },
      { y: top + it.bodyHeight * 0.38, k: 0.32 },
    ];
  },
};

// The slant-topped tower: square body on a bevelled foot, sheared off at an
// angle across the top.
const GEO_WEDGE = {
  sides: 4,
  phase: Math.PI / 4,
  capTop: true,
  capBottom: true,
  closed: true,
  door: { band: 1 },
  rings: (it) => {
    const top = it.floorY + it.bodyHeight;
    return [
      { y: it.floorY - it.bodyHeight * 0.3, k: 0.54 },
      { y: it.floorY + it.wallThickness, k: 1 },
      { y: top + it.bodyHeight * 0.3, k: 1, tiltX: 0.46 },
    ];
  },
};

// The kite: a truncated point below, a short upright band you open, and a long
// spire above it.
const GEO_KITE = {
  sides: 6,
  phase: 0,
  capTop: false,
  capBottom: true,
  closed: true,
  door: { band: 1 },
  rings: (it) => {
    const top = it.floorY + it.bodyHeight;
    return [
      { y: it.floorY - it.bodyHeight * 0.5, k: 0.26 },
      { y: it.floorY + it.bodyHeight * 0.08, k: 1 },
      { y: top, k: 1 },
      { y: top + it.bodyHeight * 1.5, k: 0 },
    ];
  },
};

// The hexagonal gem: bevelled foot, upright body, rim flaring back out.
const GEO_HEX_GEM = {
  sides: 6,
  phase: 0,
  capTop: false,
  capBottom: true,
  closed: false,
  door: { band: 1 },
  rings: (it) => {
    const top = it.floorY + it.bodyHeight;
    return [
      { y: it.floorY - it.bodyHeight * 0.26, k: 0.62 },
      { y: it.floorY + it.wallThickness, k: 1 },
      { y: top, k: 1 },
      { y: top + it.bodyHeight * 0.2, k: 1.26 },
    ];
  },
};

// The glued glass case dropped into a wooden tray — frameless, so no came and
// no door; you plant it from the open top.
const GEO_WOOD_CASE = {
  sides: 4,
  phase: Math.PI / 4,
  sx: 1.9,
  capTop: false,
  capBottom: true,
  closed: false,
  frame: false,
  woodTray: true,
  rings: (it) => [
    { y: it.floorY - it.wallThickness, k: 1 },
    { y: it.floorY + it.bodyHeight, k: 1 },
  ],
};

const GEO_SPECS = {
  hexhouse: GEO_HEX_HOUSE,
  wedge: GEO_WEDGE,
  kite: GEO_KITE,
  hexgem: GEO_HEX_GEM,
  woodcase: GEO_WOOD_CASE,
};

// The spec behind a jar id, for callers that need the vessel's real extents or
// footprint before it is built.
export function geoSpecFor(typeId) {
  const type = JAR_BY_ID[typeId];
  return type && type.geo ? GEO_SPECS[type.geo] : null;
}

// --- geometric jars: shared maths -------------------------------------------

// The vertices of one ring, in world space. A regular polygon whose inradius is
// `baseR * ring.k`, optionally stretched along x and sheared into a slant.
function geoRingVerts(spec, ring, baseR) {
  const n = spec.sides;
  const sx = spec.sx || 1;
  const R = (baseR * ring.k) / Math.cos(Math.PI / n);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = spec.phase + (i * Math.PI * 2) / n;
    const x = Math.cos(a) * R * sx;
    const z = Math.sin(a) * R;
    out.push(new THREE.Vector3(x, ring.y + (ring.tiltX || 0) * x, z));
  }
  return out;
}

// The lowest point of a ring — what the interior has to respect when the ring
// is sheared, since the low corner is the first thing substrate would meet.
function geoRingLowY(spec, ring, baseR) {
  if (!ring.tiltX) return ring.y;
  let lo = Infinity;
  for (const v of geoRingVerts(spec, ring, baseR)) lo = Math.min(lo, v.y);
  return lo;
}

// Cross-section outline as a footprint multiplier: how far the wall reaches at
// each heading compared with the narrowest direction. Constant with height,
// because every ring shares one phase and one stretch.
export function geoFootprint(spec) {
  const n = spec.sides;
  const sx = spec.sx || 1;
  const R = 1 / Math.cos(Math.PI / n);
  const poly = [];
  for (let i = 0; i < n; i++) {
    const a = spec.phase + (i * Math.PI * 2) / n;
    poly.push([Math.cos(a) * R * sx, Math.sin(a) * R]);
  }
  const N = 72;
  const raw = [];
  for (let s = 0; s < N; s++) {
    const a = (s / N) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // Nearest edge the ray from the origin crosses.
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % n];
      const ex = x2 - x1;
      const ez = z2 - z1;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (x1 * ez - z1 * ex) / den; // distance along the ray
      const u = (x1 * dz - z1 * dx) / den; // position along the edge
      if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
    }
    raw.push(best === Infinity ? 1 : best);
  }
  const min = Math.min(...raw);
  return raw.map((r) => r / min);
}

// Inner silhouette of a geometric jar: the ring profile read as a lathe, in the
// narrowest direction, since the footprint above widens it per heading.
function geoSilhouette(spec, it) {
  const baseR = it.innerRadius + it.wallThickness;
  const pts = spec
    .rings(it)
    .map((r) => new THREE.Vector2(baseR * r.k, geoRingLowY(spec, r, baseR)));
  const floor = it.floorY;
  const top = it.floorY + it.bodyHeight;
  const N = 24;
  const out = [];
  for (let i = 0; i <= N; i++) {
    const y = floor + ((top - floor) * i) / N;
    out.push({ y, r: Math.max(0.05, latheRadiusAt(pts, y) - it.wallThickness) });
  }
  return out;
}

// --- geometric jars: the mesh ----------------------------------------------

function buildGeoJar(it, envMap, group, spec, closedLid) {
  const n = spec.sides;
  const baseR = it.innerRadius + it.wallThickness;
  const rings = spec.rings(it).map((r) => ({
    k: r.k,
    apex: r.k < 1e-4,
    verts: geoRingVerts(spec, r, baseR),
  }));

  const glassMat = regGlass(makeGlassMaterial(envMap));
  glassMat.thickness = 0.018;
  const frameMat = regFrame(
    new THREE.MeshStandardMaterial({
      color: 0x1e1e20,
      roughness: 0.42,
      metalness: 0.6,
      envMap: envMap || null,
    }),
  );

  // Which pane opens: the one facing the camera, on the band the spec names.
  const band = spec.door ? spec.door.band : -1;
  let doorFace = -1;
  if (band >= 0) {
    let bestZ = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const z = (rings[band].verts[i].z + rings[band].verts[j].z) / 2;
      if (z > bestZ) {
        bestZ = z;
        doorFace = i;
      }
    }
  }

  // --- glass: every pane but the door, plus the caps
  const tris = [];
  const push = (...v) => v.forEach((p) => tris.push(p.x, p.y, p.z));
  for (let s = 0; s < rings.length - 1; s++) {
    const lo = rings[s];
    const hi = rings[s + 1];
    for (let i = 0; i < n; i++) {
      if (s === band && i === doorFace) continue;
      const j = (i + 1) % n;
      const A = lo.verts[i];
      const B = lo.verts[j];
      const C = hi.verts[j];
      const D = hi.verts[i];
      if (lo.apex) push(A, C, D);
      else if (hi.apex) push(A, B, C);
      else push(A, B, C, A, C, D);
    }
  }
  const capFan = (verts, flip) => {
    for (let i = 1; i < n - 1; i++) {
      if (flip) push(verts[0], verts[i + 1], verts[i]);
      else push(verts[0], verts[i], verts[i + 1]);
    }
  };
  if (spec.capBottom && !rings[0].apex) capFan(rings[0].verts, true);
  const topRing = rings[rings.length - 1];
  if (spec.capTop && !topRing.apex) capFan(topRing.verts, false);

  const glassGeo = new THREE.BufferGeometry();
  glassGeo.setAttribute("position", new THREE.Float32BufferAttribute(tris, 3));
  glassGeo.computeVertexNormals();
  const glass = new THREE.Mesh(glassGeo, glassMat);
  group.add(glass);

  // --- came: a square bar down every edge of the cage
  const up = new THREE.Vector3(0, 1, 0);
  const bar = (a, b, t) => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-4) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, len, t), frameMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.castShadow = true;
    return m;
  };
  if (spec.frame !== false) {
    const t = spec.strut || 0.03;
    rings.forEach((ring) => {
      if (ring.apex) return;
      for (let i = 0; i < n; i++) {
        const m = bar(ring.verts[i], ring.verts[(i + 1) % n], t);
        if (m) group.add(m);
      }
    });
    for (let s = 0; s < rings.length - 1; s++) {
      for (let i = 0; i < n; i++) {
        const a = rings[s].apex ? rings[s].verts[0] : rings[s].verts[i];
        const b = rings[s + 1].apex ? rings[s + 1].verts[0] : rings[s + 1].verts[i];
        const m = bar(a, b, t);
        if (m) group.add(m);
      }
    }
  }

  // --- the door itself
  let door = null;
  if (doorFace >= 0) {
    door = buildJarDoor({
      group,
      spec,
      lo: rings[band],
      hi: rings[band + 1],
      i: doorFace,
      n,
      glassMat,
      frameMat,
      envMap,
    });
  }

  // --- floor the substrate lands on, cut to the polygon
  const floorRing = {
    k: latheRadiusAt(
      spec.rings(it).map((r) => new THREE.Vector2(baseR * r.k, geoRingLowY(spec, r, baseR))),
      it.floorY,
    ) / baseR * 0.985,
    y: it.floorY + 0.002,
  };
  const floorVerts = geoRingVerts(spec, floorRing, baseR);
  const floorTris = [];
  for (let i = 1; i < n - 1; i++) {
    for (const v of [floorVerts[0], floorVerts[i], floorVerts[i + 1]]) {
      floorTris.push(v.x, v.y, v.z);
    }
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(floorTris, 3));
  floorGeo.computeVertexNormals();
  const floorMesh = new THREE.Mesh(
    floorGeo,
    new THREE.MeshStandardMaterial({ color: "#3c2c1e", roughness: 1, side: THREE.DoubleSide }),
  );
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // --- wooden tray the frameless case drops into
  if (spec.woodTray) {
    const woodMat = regFrame(
      new THREE.MeshStandardMaterial({ color: "#96693a", roughness: 0.9, metalness: 0 }),
    );
    const hw = it.innerRadius * (spec.sx || 1) + it.wallThickness;
    const hd = it.innerRadius + it.wallThickness;
    const lip = 0.09;
    // A shallow tray the case sits down into — the glass is meant to be the
    // thing you look at, not the joinery holding it.
    const wallH = it.bodyHeight * 0.34;
    const bottom = it.floorY - it.wallThickness;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry((hw + lip) * 2, 0.1, (hd + lip) * 2),
      woodMat,
    );
    slab.position.y = bottom - 0.05;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
    for (const sz of [-1, 1]) {
      const side = new THREE.Mesh(
        new THREE.BoxGeometry((hw + lip) * 2, wallH, lip),
        woodMat,
      );
      side.position.set(0, bottom + wallH / 2, sz * (hd + lip / 2));
      side.castShadow = true;
      group.add(side);
    }
    for (const sx2 of [-1, 1]) {
      const end = new THREE.Mesh(
        new THREE.BoxGeometry(lip, wallH, hd * 2),
        woodMat,
      );
      end.position.set(sx2 * (hw + lip / 2), bottom + wallH / 2, 0);
      end.castShadow = true;
      group.add(end);
    }
  }

  if (closedLid) group.add(buildCondensation(it, envMap));

  return { group, glass, glassMats, frameMats, door };
}

// One hinged pane: glass, its own came frame, and the brass knob you grab. The
// whole thing hangs off a group pivoted on the hinge edge, so opening it is a
// single rotation — nothing about the build inside has to know.
function buildJarDoor({ group, spec, lo, hi, i, n, glassMat, frameMat, envMap }) {
  const j = (i + 1) % n;
  const A = lo.verts[i]; // hinge, bottom
  const B = lo.verts[j]; // free edge, bottom
  const C = hi.verts[j];
  const D = hi.verts[i];

  // Outward normal of this pane, for the knob's stand-off and the swing sense.
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  const len = Math.hypot(dx, dz) || 1;
  const outX = dz / len;
  const outZ = -dx / len;

  const pivot = new THREE.Group();
  pivot.name = "jarDoor";
  pivot.position.set(A.x, 0, A.z);
  const rel = (v) => new THREE.Vector3(v.x - A.x, v.y, v.z - A.z);
  const a = rel(A);
  const b = rel(B);
  const c = rel(C);
  const d = rel(D);

  // Nudge the pane a hair outward so it does not z-fight the cage it sits in.
  const bias = 0.006;
  const quad = [a, b, c, a, c, d];
  const pos = [];
  quad.forEach((v) => pos.push(v.x + outX * bias, v.y, v.z + outZ * bias));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const pane = new THREE.Mesh(geo, glassMat);
  pivot.add(pane);

  const up = new THREE.Vector3(0, 1, 0);
  const t = (spec.strut || 0.03) * 1.05;
  for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]]) {
    const p2 = p.clone().addScaledVector(new THREE.Vector3(outX, 0, outZ), bias);
    const q2 = q.clone().addScaledVector(new THREE.Vector3(outX, 0, outZ), bias);
    const dir = q2.clone().sub(p2);
    const l = dir.length();
    if (l < 1e-4) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(t, l, t), frameMat);
    m.position.copy(p2).add(q2).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, dir.normalize());
    m.castShadow = true;
    pivot.add(m);
  }

  // Aged brass knob, low on the free edge exactly like the real hardware.
  const brass = new THREE.MeshStandardMaterial({
    color: 0xa8813c,
    roughness: 0.34,
    metalness: 0.95,
    envMap: envMap || null,
    envMapIntensity: 1.3,
  });
  const across = 0.86;
  const upAt = 0.26;
  const low = a.clone().lerp(b, across);
  const high = d.clone().lerp(c, across);
  const seat = low.clone().lerp(high, upAt);
  const knob = new THREE.Group();
  knob.name = "jarKnob";
  knob.position.copy(seat);
  const outward = new THREE.Vector3(outX, 0, outZ);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.022, 16), brass);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 12), brass);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 14), brass);
  collar.quaternion.setFromUnitVectors(up, outward);
  stem.quaternion.copy(collar.quaternion);
  collar.position.copy(outward).multiplyScalar(0.02);
  stem.position.copy(outward).multiplyScalar(0.055);
  ball.position.copy(outward).multiplyScalar(0.12);
  ball.castShadow = true;
  knob.add(collar, stem, ball);
  // A brass ball is a few pixels wide on a phone. Give the tap a target it can
  // actually hit — invisible, but still solid to the raycaster.
  const grab = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  grab.position.copy(outward).multiplyScalar(0.12);
  knob.add(grab);
  pivot.add(knob);

  group.add(pivot);

  // Which way the free edge travels when the group turns +y.
  const sign = Math.sign(dz * outX - dx * outZ) || 1;
  return { pivot, knob, sign, max: Math.PI * 0.62 };
}

// Invisible interior target used purely as a raycast surface for taps. Cut to
// the interior *at the height it sits*, so a tap lands where the substrate
// really is: a disc sized to the widest part of the jar accepted taps out over
// the table for a bowl, and out through the belly for a bottle on its side.
export function buildPickPlane(y = JAR.floorY, bodyHeight = JAR.bodyHeight) {
  const SEG = 64;
  const positions = [0, 0, 0];
  // The target is cut to the widest the interior gets in a short band *above*
  // the surface, not to the surface itself. Two reasons, and the first is not
  // subtle: where a vessel pinches at its floor — a bottle lying on its side
  // comes to a keel, an egg to a point — the cross-section right at the floor
  // is a sliver a millimetre wide, and a tap target that shape is one nobody
  // can hit. The first layer of a bottle became unpourable.
  //
  // Widening it is safe because this plane only answers "are you pointing into
  // the jar?". A poured layer fills the whole cross-section wherever you aimed,
  // and a decoration is put back inside by clampInsideAt at the height it
  // actually lands. So the forgiving thing here cannot place anything outside.
  const band = Math.min(0.25, Math.max(0.06, bodyHeight * 0.25));
  const reachAtAngle = (a) => {
    let best = 0;
    for (let k = 0; k <= 3; k++) {
      const [x, z] = jarPointAt(y + (band * k) / 3, a, 1, 0.01);
      best = Math.max(best, Math.hypot(x, z));
    }
    return best;
  };
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const d = reachAtAngle(a);
    // Built in XY and laid down by the rotation below, which turns local +Y
    // into world −Z — hence the flip.
    positions.push(Math.cos(a) * d, -Math.sin(a) * d, 0);
  }
  const indices = [];
  for (let i = 0; i < SEG; i++) indices.push(0, 1 + i, 1 + ((i + 1) % SEG));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const plane = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.name = "pickPlane";
  plane.userData.builtY = y;
  return plane;
}
