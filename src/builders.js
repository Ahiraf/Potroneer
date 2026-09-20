import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BASE_BY_ID, BASE_LAYERS, DECOR_BY_ID } from "./catalog.js";
import { JAR, substrateTop, terrainOffsetAt, terrainCeilingAt, jarGridR, jarPointAt, TERRAIN_N } from "./state.js";
import { grainMaps, substrateMaps, substrateUVs } from "./natural-materials.js";
import { naturalGrass, naturalMoss, naturalCanopy, naturalStone } from "./natural-foliage.js";
import { referenceFittonia, referenceAralia, referenceCrag, referenceGravel } from "./reference-botany.js";
import { grainSettings, grainRandom, extraGrainColor } from "./grain-settings.js";
import { naturalRock } from "./natural-rocks.js";

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const _c = new THREE.Color();

// Deterministic-ish jitter helpers so hand-placed things look organic.
function jitter(amount) {
  return (Math.random() - 0.5) * 2 * amount;
}

// Push a soft, slightly matte standard material. Everything in the jar wants to
// look like clay / paper / moss, never glossy plastic.
function craftMaterial(hex, { rough = 0.85, flat = false } = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: rough,
    metalness: 0.0,
    flatShading: flat,
  });
}

// Give a geometry per-vertex colours sampled from a small palette, so a single
// layer reads as many mixed grains instead of one flat tone.
function speckleColors(geometry, palette) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const hex = palette[(Math.random() * palette.length) | 0];
    _c.set(hex);
    // nudge brightness a touch for extra grain
    const k = 0.9 + Math.random() * 0.2;
    colors[i * 3] = _c.r * k;
    colors[i * 3 + 1] = _c.g * k;
    colors[i * 3 + 2] = _c.b * k;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

// ---------------------------------------------------------------------------
// Jar-mounted grow lamp
// ---------------------------------------------------------------------------

// A gooseneck clip lamp clamped to the current jar's rim, arching over the
// opening and shining down into the terrarium — the lamp from the reference
// build. Scales to the jar; `height` (0..1) lifts the head, `bright` (0..1)
// drives the emissive lens and the spotlight. Lives in the world group so it
// rotates with the vessel it's clipped to.
export function buildJarLamp(jar, { height = 0.55, bright = 0.6, color = 0xffe4bc } = {}) {
  const g = new THREE.Group();
  const stretch = jar.stretchX || 1;
  const rimR = jar.innerRadius * stretch;
  const topY = jar.floorY + jar.bodyHeight;
  const metal = new THREE.MeshStandardMaterial({
    color: 0x2d3035,
    roughness: 0.42,
    metalness: 0.6,
  });

  // spring clamp gripping the back rim
  const clampX = -rimR - 0.06;
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.22), metal);
  clamp.position.set(clampX, topY, 0);
  clamp.castShadow = true;
  g.add(clamp);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.1), metal);
  jaw.position.set(clampX + 0.04, topY + 0.07, 0);
  g.add(jaw);

  // gooseneck: climbs off the clamp and arches over the centre of the opening
  const headY = topY + 0.2 + height * jar.bodyHeight * 0.9;
  const head = new THREE.Vector3(0, headY, 0);
  const neck = new THREE.CatmullRomCurve3([
    new THREE.Vector3(clampX, topY + 0.06, 0),
    new THREE.Vector3(clampX * 0.95, headY + 0.12, 0),
    new THREE.Vector3(clampX * 0.45, headY + 0.22, 0),
    head.clone().add(new THREE.Vector3(0, 0.06, 0)),
  ]);
  const neckMesh = new THREE.Mesh(new THREE.TubeGeometry(neck, 28, 0.022, 6), metal);
  neckMesh.castShadow = true;
  g.add(neckMesh);

  // disc head pointing straight down at the substrate
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.05, 22), metal);
  shell.position.copy(head);
  shell.castShadow = true;
  g.add(shell);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 22),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 1.1 + bright * 2.0,
      roughness: 0.4,
    }),
  );
  lens.position.copy(head).add(new THREE.Vector3(0, -0.027, 0));
  lens.rotation.x = -Math.PI / 2; // face down
  g.add(lens);

  // real spotlight pouring down into the jar (candela — three r165+ is
  // physically based, so this needs to be tens, not single digits)
  const spot = new THREE.SpotLight(
    new THREE.Color(color),
    5 + bright * 38,
    0, // infinite range
    Math.PI * 0.36,
    0.5,
    1.3,
  );
  spot.position.copy(head);
  const target = new THREE.Object3D();
  target.position.set(0, jar.floorY, 0);
  g.add(target);
  spot.target = target;
  g.add(spot);
  return g;
}

// ---------------------------------------------------------------------------
// Substrate layers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Substrate volumes
// ---------------------------------------------------------------------------
// A layer used to be a CylinderGeometry: one radius at the bottom, one at the
// top, straight between them. That is a fair description of a mason jar and a
// lie about everything else — and because the radius came from a silhouette
// that had no entry for bottles or glass houses, it was often a lie about the
// mason jar's radius too.
//
// A layer is now lofted: a stack of rings, each measured against the interior
// at its own height, closed with a floor and a top surface. It is a real
// volume with real walls, so it fills a bowl's curve and a bottle's bore the
// way the material would, and the only thing standing between it and the glass
// is the margin we choose.

// Substrate surfaces are shaped by a coherent field rather than per-vertex
// randomness. Per-vertex noise gives a surface that is rough at the scale of
// the mesh — spikes between neighbouring vertices, which read as crystals, not
// soil. This is smooth between samples and only varies over real distance, so
// what it produces is dunes and settling, the shape material actually takes.
//
// It is also a *function of position and seed*, which is what lets the seam
// between two layers close: layer N asks the same field, with layer N−1's
// seed, for its own underside, so the two surfaces are the same surface.
function hash2(seed, i, j) {
  let h = (seed * 374761393 + i * 668265263 + j * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function surfaceBump(seed, x, z) {
  const fx = x;
  const fz = z;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  // smoothstep keeps the field C1 across cell boundaries, so no creases show
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(seed, i, j);
  const b = hash2(seed, i + 1, j);
  const c = hash2(seed, i, j + 1);
  const d = hash2(seed, i + 1, j + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return (top + (bot - top) * sz) * 2 - 1; // -1..1
}

/**
 * How a material settles, from what the catalogue already says about it.
 *
 * `grain` runs 0.35 (fine white sand) to 1.0 (clay balls), and `chunky` marks
 * the materials made of pieces you can see. Sand poured into a jar finds a
 * near-flat surface; leca balls pile into visible lumps a centimetre across.
 * Giving every layer the same gentle noise made them all read as the same
 * beige substance in different colours, which is the flaw this addresses.
 */
function settleProfile(def) {
  const grain = def?.grain ?? 0.8;
  const chunky = Boolean(def?.chunky);
  return {
    // Lump height, as a fraction of the layer's own depth.
    amp: (chunky ? 0.42 : 0.2) * (0.45 + grain * 0.75),
    // Lump *width*: coarse material makes fewer, broader piles; fine material
    // ripples. Below ~1.2 the bumps get wider than a small jar.
    scale: chunky ? 1.35 : 1.4 + (1 - grain) * 2.6,
  };
}

/**
 * The height of a layer's own surface at (x, z): its bank plus its settling.
 * `layer` carries the bank and the seed, so a rebuild reproduces the surface
 * exactly and two neighbouring layers can agree on the seam between them.
 */
export function layerSurface(layer, x, z) {
  if (!layer) return 0;
  const sx = layer.slopeX || 0;
  const sz = layer.slopeZ || 0;
  const def = BASE_BY_ID[layer.type];
  const { amp, scale } = settleProfile(def);
  const lift = Math.min((layer.height || 0.1) * amp, 0.06);
  const raw = x * sx + z * sz + surfaceBump(layerSeed(layer), x * scale, z * scale) * lift;
  // Stored random tilts were larger than thin decorative bands, causing one
  // colour to cut through its neighbour. Bound the shared interface below
  // the smallest supported pour; sculpting still controls the top landscape.
  const limit = Math.min((layer.height || 0.1) * 0.22, 0.006);
  return limit * Math.tanh(raw / Math.max(limit, 0.0001));
}

/** A stable seed per layer, including for builds saved before seeds existed. */
function layerSeed(layer) {
  if (Number.isFinite(layer.seed)) return layer.seed;
  // Derive one from what the record does carry, so old saves keep a fixed
  // (if arbitrary) surface instead of reshuffling on every rebuild.
  return Math.abs(Math.round(((layer.slopeX || 0) * 9173 + (layer.slopeZ || 0) * 3571) * 1000)) + 7;
}

const LAYER_SECTORS = 48;
// Enough vertical divisions to follow a curve without faceting. A bowl's belly
// is the demanding case; below ~5 the wall visibly chords across it.
const LAYER_RINGS = 7;
// How far the substrate stops short of the glass. Small enough to read as
// contact, large enough that no shimmer of z-fighting shows where they meet.
const GLASS_MARGIN = 0.022;

/** One ring of interior-hugging points at height `y`. */
function jarRing(y, sectors = LAYER_SECTORS, margin = GLASS_MARGIN, t = 1) {
  const pts = [];
  for (let i = 0; i < sectors; i++) {
    const a = (i / sectors) * Math.PI * 2;
    pts.push(jarPointAt(y, a, t, margin));
  }
  return pts;
}

/**
 * Loft a closed solid between two heights, hugging the interior the whole way.
 * Returns the geometry plus the indices of its top ring and top centre, so the
 * caller can shape the surface (slope, jitter, sculpted terrain) without having
 * to know how the mesh was wound.
 */
function loftInterior(baseY, topY, {
  sectors = LAYER_SECTORS,
  rings = LAYER_RINGS,
  margin = GLASS_MARGIN,
  t = 1,
} = {}) {
  const positions = [];
  const push = (x, y, z) => positions.push(x, y, z);

  const floorCentre = 0;
  push(0, baseY, 0);
  const ringStart = [];
  for (let r = 0; r <= rings; r++) {
    const y = baseY + ((topY - baseY) * r) / rings;
    ringStart.push(positions.length / 3);
    for (const [x, z] of jarRing(y, sectors, margin, t)) push(x, y, z);
  }
  const topCentre = positions.length / 3;
  push(0, topY, 0);

  const indices = [];
  // floor fan — wound to face down
  const r0 = ringStart[0];
  for (let i = 0; i < sectors; i++) {
    indices.push(0, r0 + i, r0 + ((i + 1) % sectors));
  }
  // side wall
  for (let r = 0; r < rings; r++) {
    const a = ringStart[r];
    const b = ringStart[r + 1];
    for (let i = 0; i < sectors; i++) {
      const j = (i + 1) % sectors;
      indices.push(a + i, b + i, b + j);
      indices.push(a + i, b + j, a + j);
    }
  }
  // top fan
  const rN = ringStart[rings];
  for (let i = 0; i < sectors; i++) {
    indices.push(topCentre, rN + ((i + 1) % sectors), rN + i);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return { geo, floorCentre, ringStart, rings, topRing: rN, topCentre, sectors };
}

// Build one substrate layer as a lofted volume whose top surface is gently
// uneven, with speckled vertex colours. `isTop` layers get scattered
// grains/pebbles on their surface for texture; buried layers stay smooth to
// save geometry.
export function buildLayer(layer, baseY, isTop, below = null, coveredByTerrain = false) {
  const def = BASE_BY_ID[layer.type];
  const group = new THREE.Group();
  const topY = baseY + layer.height;

  const { geo, floorCentre, ringStart, rings, topRing, topCentre, sectors } =
    loftInterior(baseY, topY);

  const pos = geo.attributes.position;
  // Shape the solid between two surfaces: the top of whatever is underneath
  // (or the jar's flat floor for the first layer) and this layer's own. Every
  // ring in between is interpolated across that gap, so the walls stay
  // straight-sided while both faces undulate — and the seam is shared
  // geometry, not two independent guesses at the same height that leave a
  // visible gap when they disagree.
  const lift = (x, z, t) => {
    const under = layerSurface(below, x, z);
    const over = layerSurface(layer, x, z);
    return under + (over - under) * t;
  };

  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const base = ringStart[r];
    for (let i = 0; i < sectors; i++) {
      const v = base + i;
      let x = pos.getX(v);
      let z = pos.getZ(v);
      const y = pos.getY(v) + lift(x, z, t);
      // Raising a vertex moves it to a height where the jar may be narrower —
      // in a bowl or an egg it always is — so re-measure the reach there.
      // Sloping a surface up without this is how substrate creeps out through
      // the wall on the high side, which is exactly where the eye looks.
      [x, z] = jarPointAt(y, Math.atan2(z, x), 1, GLASS_MARGIN);
      pos.setXYZ(v, x, y, z);
    }
  }
  pos.setY(floorCentre, baseY + layerSurface(below, 0, 0));
  pos.setY(topCentre, topY + layerSurface(layer, 0, 0));
  pos.needsUpdate = true;

  if (coveredByTerrain) geo.setIndex(Array.from(geo.index.array).slice(0, -sectors * 3));
  geo.computeVertexNormals();
  // Large vertex speckles looked like marbled stripes. Fine detail now comes
  // from a tiled grain map, while vertices keep the material's actual colour.
  speckleColors(geo, [def.swatch]);
  // Shade each layer down toward its own base. Light reaching into a bed of
  // material falls off with depth, and without it the strata washed together
  // into one pale mass through the glass — the bands were there in the
  // geometry but nothing separated them to the eye. This is also what makes a
  // seam read as a seam: the bright top of one layer meets the dark underside
  // of the next.
  shadeByDepth(geo, baseY, topY);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    ...substrateMaps(def),
    bumpScale: def.chunky ? 0.012 : def.id === "soil" ? 0.007 : 0.0025,
    // Wet-looking soil and dry sand should not share a sheen. Chunky material
    // (leca, pebbles) catches a little more light off its facets.
    roughness: def.chunky ? 0.92 : 0.98,
    metalness: 0,
    // Smooth the broad body so the material colour reads as a real packed
    // layer. The separate grains below keep the surface from becoming plastic.
    flatShading: false,
  });

  // A second top face underneath the sculptable cap intersects it, producing
  // a dark slit around the soil. Keep the volume's walls, but let the cap be
  // the only visible top in the editor. Standalone thumbnails remain closed.
  const texturedGeo = substrateUVs(geo);
  geo.dispose();
  const solid = new THREE.Mesh(texturedGeo, mat);
  solid.castShadow = false;
  solid.receiveShadow = true;
  group.add(solid);

  // The top surface gets loose material scattered over it. Chunky layers also
  // get pieces around their rim: leca and gravel are seen edge-on through the
  // glass for the whole life of the build, and a smooth wall there is the
  // clearest tell that this is one moulded solid rather than a bed of pieces.
  if (isTop && !coveredByTerrain) group.add(scatterGrains(def, layer, topY));
  if (def.chunky) group.add(rimPieces(def, layer, baseY, topY));
  if (grainSettings(layer).grainAmount > 0) {
    group.add(layerExtraGrains(def, layer, baseY, below));
  }
  return group;
}

function extraGrainMesh(count, name) {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: .98 }), count);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

// Particles are packed into each band's visible wall, not a floating shell.
// Clamp them between the two actual sloped interfaces, even for 1mm stripes.
function layerExtraGrains(def, layer, baseY, below) {
  const amount = grainSettings(layer).grainAmount / 100;
  const count = Math.ceil(Math.min(2400, Math.max(180, JAR.innerRadius * Math.PI * 2 * layer.height * 1550)) * amount);
  const mesh = extraGrainMesh(count, "layer-side-grains"), obj = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = grainRandom(layer.seed, i, 0) * Math.PI * 2;
    const t = grainRandom(layer.seed, i, 1);
    const size = Math.min(.006 + grainRandom(layer.seed, i, 2) * .007, layer.height * .13);
    let y = baseY + layer.height * t, x, z;
    for (let pass = 0; pass < 3; pass++) {
      [x, z] = jarPointAt(y, a, 1, GLASS_MARGIN + size * .10);
      const low = baseY + layerSurface(below, x, z) + size;
      const high = baseY + layer.height + layerSurface(layer, x, z) - size;
      y = low + Math.max(0, high - low) * t;
    }
    [x, z] = jarPointAt(y, a, 1, GLASS_MARGIN + size * .10);
    // A sideways bottle narrows quickly above/below the grain's centre. Fit
    // its whole height to the narrowest of those wall sections as well.
    const radius = Math.hypot(x, z);
    let safeRadius = radius;
    for (const dy of [-size, size]) {
      const edge = jarPointAt(y + dy, a, 1, GLASS_MARGIN + size * .10);
      safeRadius = Math.min(safeRadius, Math.hypot(...edge));
    }
    const fit = safeRadius / Math.max(radius, .0001);
    x *= fit; z *= fit;
    obj.position.set(x, y, z);
    obj.rotation.set(0, Math.PI / 2 - a, 0);
    obj.rotateZ(grainRandom(layer.seed, i, 3) * Math.PI * 2);
    obj.scale.set(size, size * .72, size * .36);
    obj.updateMatrix(); mesh.setMatrixAt(i, obj.matrix);
    mesh.setColorAt(i, extraGrainColor(_c, def, layer, i));
  }
  mesh.computeBoundingSphere();
  return mesh;
}

/** Darken a layer's vertices toward its base. */
function shadeByDepth(geo, baseY, topY) {
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  if (!col) return;
  const span = Math.max(1e-4, topY - baseY);
  for (let i = 0; i < pos.count; i++) {
    // 1 at the surface, 0 at the floor of this layer.
    const t = Math.min(1, Math.max(0, (pos.getY(i) - baseY) / span));
    // Weighted to the bottom of the band rather than spread over all of it.
    // A linear ramp from 0.58 darkened the whole layer and, under a dim theme
    // with the wetness tint on top, took the lower strata to black — the bands
    // separated by disappearing, which is not the same as reading clearly.
    // This leaves most of the layer at its own colour and shades the last
    // quarter into the seam below it.
    const shade = Math.pow(1 - t, 3);
    const k = 1 - 0.26 * shade;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}

/**
 * Individual pieces pressed against the inside of the glass, around a chunky
 * layer's rim. Instanced, and only for material that is actually made of
 * visible pieces, so this costs one draw call on two of the seven substrates.
 */
function rimPieces(def, layer, baseY, topY) {
  const count = 360;
  const size = Math.min(def.granule ?? 0.042, layer.height * 0.22);
  const geo = new THREE.SphereGeometry(size, 8, 6);
  speckleColors(geo, def.colors);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      flatShading: false,
    }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Spread around the rim with a little scatter, so they do not read as a
    // bead necklace laid on at even spacing.
    const a = ((i + Math.random() * 0.6) / count) * Math.PI * 2;
    const y = baseY + (topY - baseY) * (0.15 + Math.random() * 0.7);
    // Sitting *in* the wall of the layer: far enough out to touch the glass,
    // far enough in that half the piece stays buried in its own bed.
    const [x, z] = jarPointAt(y, a, 1, GLASS_MARGIN + size * 0.45);
    e.set(jitter(Math.PI), jitter(Math.PI), jitter(Math.PI));
    q.setFromEuler(e);
    const k = 0.62 + Math.random() * 0.75;
    sc.set(k, k * 0.82, k);
    m.compose(_v.set(x, y, z), q, sc);
    mesh.setMatrixAt(i, m);
  }
  mesh.receiveShadow = true;
  return mesh;
}

// Scatter little instanced stones/grains across a layer surface.
const _v = new THREE.Vector3();

function scatterGrains(def, layer, topY) {
  const chunky = def.chunky;
  const count = chunky ? 170 : def.id === "soil" ? 480 : 300;
  const size = def.granule ?? (chunky ? 0.044 : def.organic || def.id === "soil" ? 0.008 : 0.004);
  const geo = chunky
    ? new THREE.SphereGeometry(size, 8, 6)
    : new THREE.IcosahedronGeometry(size, 0);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    flatShading: true,
  });
  speckleColors(geo, def.colors);

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    // sqrt keeps the scatter even per unit area rather than crowding the axis
    const t = Math.sqrt(Math.random());
    const [x, z] = jarPointAt(topY, a, t, GLASS_MARGIN + 0.05);
    e.set(jitter(Math.PI), jitter(Math.PI), jitter(Math.PI));
    q.setFromEuler(e);
    const sc = 0.6 + Math.random() * 0.9;
    s.set(sc, sc * (chunky ? 0.7 : 1), sc);
    // Sit each grain on the undulating surface, half-sunk into it, so the
    // scatter reads as material *in* the bed rather than sprinkled over a lid.
    const gy = topY + layerSurface(layer, x, z) + size * 0.35 * sc;
    m.compose(_v.set(x, gy, z), q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Sculptable terrain cap
// ---------------------------------------------------------------------------

// A polar-grid disc that sits on top of the substrate and deforms live as the
// user sculpts. Dense enough (rings × sectors) to take smooth brush strokes.
export function buildTerrainCap(def, surfaceY = JAR.floorY, topLayerHeight = 0.16) {
  const rings = 32;
  const sectors = 96;
  // The cap takes the jar's own outline at the height it sits, not a circle.
  // Its rim and its skirt are measured separately: the skirt hangs below the
  // surface, and in a bowl or a bottle the interior there is *narrower*, so a
  // skirt cut to the rim's width would hang straight through the glass.
  // The skirt exists to close the seam where the cap meets the solid beneath
  // it, so it only has to reach a little way down. At a fixed 0.12 it reached
  // far further than that: a charcoal band is 0.07 deep, so the cap — painted
  // in the *top* layer's colour — hung straight over it and the layer below,
  // and the strata that were correctly built simply could not be seen. It is a
  // fraction of the layer it rides on now, and never more than a few
  // millimetres of world.
  const skirtDrop = Math.min(0.03, Math.max(0.008, topLayerHeight * 0.22));
  const rim = [];
  const skirt = [];
  for (let s = 0; s < sectors; s++) {
    const a = (s / sectors) * Math.PI * 2;
    rim.push(jarPointAt(surfaceY, a, 1, GLASS_MARGIN + 0.008));
    skirt.push(jarPointAt(surfaceY - skirtDrop, a, 1, GLASS_MARGIN + 0.008));
  }

  const positions = [0, 0, 0]; // centre vertex
  const jitters = [0];
  const ringT = [0]; // 0..1 radial position; 2 marks skirt vertices
  const angles = [0]; // heading of each vertex, kept for re-measuring the reach
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < sectors; s++) {
      // Interpolating toward the measured rim keeps every inner ring inside the
      // outline too, whatever shape that outline is.
      positions.push(rim[s][0] * t, 0, rim[s][1] * t);
      jitters.push(jitter(0.003));
      ringT.push(t);
      angles.push((s / sectors) * Math.PI * 2);
    }
  }
  // skirt: a second copy of the outer rim that drops below the surface, so
  // the terrain reads as a solid mass instead of a floating shell
  const rimStart = 1 + (rings - 1) * sectors;
  const skirtStart = 1 + rings * sectors;
  for (let s = 0; s < sectors; s++) {
    positions.push(skirt[s][0], 0, skirt[s][1]);
    jitters.push(0);
    ringT.push(2);
    angles.push((s / sectors) * Math.PI * 2);
  }

  const indices = [];
  for (let s = 0; s < sectors; s++) {
    indices.push(0, 1 + ((s + 1) % sectors), 1 + s);
  }
  for (let r = 0; r < rings - 1; r++) {
    const a0 = 1 + r * sectors;
    const b0 = 1 + (r + 1) * sectors;
    for (let s = 0; s < sectors; s++) {
      const s1 = (s + 1) % sectors;
      indices.push(a0 + s, b0 + s1, b0 + s);
      indices.push(a0 + s, a0 + s1, b0 + s1);
    }
  }
  // skirt wall quads (double-sided material, so winding is forgiving)
  for (let s = 0; s < sectors; s++) {
    const s1 = (s + 1) % sectors;
    indices.push(rimStart + s, skirtStart + s, skirtStart + s1);
    indices.push(rimStart + s, skirtStart + s1, rimStart + s1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geo.setIndex(indices);
  speckleColors(geo, def.colors);
  const uv = new Float32Array(positions.length / 3 * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    uv[i * 2] = positions[i * 3] / 0.24;
    uv[i * 2 + 1] = positions[i * 3 + 2] / 0.24;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      ...substrateMaps(def),
      bumpScale: 0.006,
      roughness: 0.97,
      metalness: 0,
      flatShading: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.jitters = jitters;
  mesh.userData.ringT = ringT;
  mesh.userData.angles = angles;
  mesh.userData.skirtDrop = skirtDrop;
  mesh.userData.sectors = sectors;
  // per-vertex random seeds so painted materials keep a stable grain
  mesh.userData.seeds = jitters.map(() => (Math.random() * 1024) | 0);
  mesh.userData.fallbackDef = def;
  // Keep loose grains with the editable cap instead of burying them under it.
  // Their transforms are updated with the heightfield, never in the frame loop.
  const grains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.98 }), def.granule ? 1400 : 420);
  grains.name = "surface-grains";
  grains.receiveShadow = true;
  grains.userData.samples = Array.from({ length: grains.count }, (_, i) => ({
    a: i * 2.399963 + (hash2(71, i, 2) - .5) * .55,
    t: Math.sqrt((i + 0.5) / grains.count) * 0.98,
    k: 0.65 + hash2(47, i, 1) * 0.8,
  }));
  mesh.add(grains);
  return mesh;
}

// Re-project the cap's vertices from the current heightfield.
export function terrainSurfaceY(state, x, z) {
  const baseY = substrateTop(state);
  const y = baseY + layerSurface(state.layers.at(-1), x, z) + terrainOffsetAt(state, x, z, GLASS_MARGIN);
  return Math.min(y, terrainCeilingAt(baseY, x, z, GLASS_MARGIN));
}

export function updateTerrainCap(mesh, state, baseY) {
  const pos = mesh.geometry.attributes.position;
  const ringT = mesh.userData.ringT;
  const angles = mesh.userData.angles;
  const drop = mesh.userData.skirtDrop ?? 0.03;
  const topLayer = state.layers.at(-1);
  const margin = topLayer ? GLASS_MARGIN : GLASS_MARGIN + 0.008;
  // When there is a real layer below, join its wall directly instead of
  // drawing a second, inset wall (which read as a black ring around the soil).
  // Free-painted terrain still needs its original skirt to have thickness.
  if (topLayer && !mesh.userData.joinedLayer) {
    mesh.geometry.setIndex(Array.from(mesh.geometry.index.array).slice(0, -mesh.userData.sectors * 6));
    mesh.userData.joinedLayer = true;
  }
  for (let i = 0; i < pos.count; i++) {
    const [x, z] = i === 0 ? [0, 0] : jarPointAt(baseY, angles[i], Math.min(1, ringT[i]), margin);
    if (ringT[i] === 2) {
      // skirt: tuck well below the surface so the side wall closes any gap
      const y = baseY + layerSurface(topLayer, x, z) - drop;
      const [nx, nz] = jarPointAt(y, angles[i], 1, GLASS_MARGIN + 0.008);
      pos.setXYZ(i, nx, y, nz);
      continue;
    }
    const y = terrainSurfaceY(state, x, z);
    pos.setY(i, y);
    if (i === 0) continue; // the centre vertex has no heading to re-measure
    // Only pull in vertices which actually reach the glass; moving every ring
    // sideways with height would disagree with the placement heightfield.
    const [rimX, rimZ] = jarPointAt(y, angles[i], 1, margin);
    const ratio = Math.min(1, Math.hypot(rimX, rimZ) / Math.max(0.00001, Math.hypot(x, z)));
    pos.setXYZ(i, x * ratio, y, z * ratio);
  }
  pos.needsUpdate = true;
  const uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 0.24, pos.getZ(i) / 0.24);
  uv.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  // Raycasting must see the growing hill above the cap's original bounds.
  mesh.geometry.computeBoundingSphere();
  mesh.geometry.computeBoundingBox();

  // recolor vertices from the painted-material map, so soil brushed here and
  // sand brushed there each show their own grain
  const colors = mesh.geometry.attributes.color;
  const seeds = mesh.userData.seeds;
  const fallback = mesh.userData.fallbackDef;
  const R = jarGridR();
  const n = TERRAIN_N;
  for (let i = 0; i < pos.count; i++) {
    const gi = Math.round(((pos.getX(i) + R) / (2 * R)) * (n - 1));
    const gj = Math.round(((pos.getZ(i) + R) / (2 * R)) * (n - 1));
    let def = fallback;
    if (gi >= 0 && gj >= 0 && gi < n && gj < n) {
      const mi = state.terrainMat[gj * n + gi];
      if (mi !== 255 && BASE_LAYERS[mi]) def = BASE_LAYERS[mi];
    }
    const hex = def.swatch;
    _c.set(hex);
    const k = 0.96 + ((seeds[i] % 37) / 37) * 0.08;
    colors.setXYZ(i, _c.r * k, _c.g * k, _c.b * k);
  }
  colors.needsUpdate = true;
  const grains = mesh.getObjectByName("surface-grains");
  if (grains) {
    const dummy = new THREE.Object3D();
    grains.userData.samples.forEach(({ a, t, k }, i) => {
      let [x, z] = jarPointAt(baseY, a, t, GLASS_MARGIN + 0.028);
      const gi = Math.round(((x + R) / (2 * R)) * (n - 1));
      const gj = Math.round(((z + R) / (2 * R)) * (n - 1));
      const mi = gi >= 0 && gj >= 0 && gi < n && gj < n ? state.terrainMat[gj * n + gi] : 255;
      const def = BASE_LAYERS[mi] ?? fallback;
      const size = (def.granule ?? (def.chunky ? 0.033 : def.organic || def.id === "soil" ? 0.009 : 0.0035)) * k;
      const y = terrainSurfaceY(state, x, z);
      const reach = Math.hypot(...jarPointAt(y, a, 1, GLASS_MARGIN + size * 1.8));
      const ratio = Math.min(1, reach / Math.max(.00001, Math.hypot(x,z)));
      x *= ratio; z *= ratio;
      dummy.position.set(x, y + size * 0.3, z);
      dummy.rotation.set(a * 0.7, a, k * 4);
      dummy.scale.set(size, size * 0.65, size);
      dummy.updateMatrix();
      grains.setMatrixAt(i, dummy.matrix);
      grains.setColorAt(i, _c.set(def.colors[i % def.colors.length]).multiplyScalar(0.75 + k * 0.25));
    });
    grains.instanceMatrix.needsUpdate = true;
    grains.instanceColor.needsUpdate = true;
    grains.computeBoundingSphere();
  }
  updateExtraSurfaceGrains(mesh, state, baseY, topLayer, fallback);
}

function updateExtraSurfaceGrains(cap, state, baseY, layer, fallback) {
  const { grainAmount } = grainSettings(layer);
  const count = Math.round(grainAmount * 18);
  let grains = cap.getObjectByName("layer-top-grains");
  if (grains && grains.count !== count) {
    cap.remove(grains); grains.geometry.dispose(); grains.material.dispose(); grains = null;
  }
  if (!count) return;
  if (!grains) { grains = extraGrainMesh(count, "layer-top-grains"); cap.add(grains); }
  const obj = new THREE.Object3D(), R = jarGridR(), n = TERRAIN_N;
  for (let i = 0; i < count; i++) {
    const a = grainRandom(layer.seed, i, 4) * Math.PI * 2;
    const t = Math.sqrt(grainRandom(layer.seed, i, 5)) * .98;
    const size = .006 + grainRandom(layer.seed, i, 6) * .009;
    let [x, z] = jarPointAt(baseY, a, t, GLASS_MARGIN + size * 1.8);
    const gi = Math.round(((x + R) / (2 * R)) * (n - 1));
    const gj = Math.round(((z + R) / (2 * R)) * (n - 1));
    const mi = gi >= 0 && gj >= 0 && gi < n && gj < n ? state.terrainMat[gj*n+gi] : 255;
    const def = BASE_LAYERS[mi] ?? fallback;
    const y = terrainSurfaceY(state, x, z);
    const reach = Math.hypot(...jarPointAt(y, a, 1, GLASS_MARGIN + size * 1.8));
    const ratio = Math.min(1, reach / Math.max(.00001, Math.hypot(x,z)));
    x *= ratio; z *= ratio;
    obj.position.set(x, y + size * .32, z);
    obj.rotation.set(a*.7, a, i); obj.scale.set(size, size*.62, size*.85);
    obj.updateMatrix(); grains.setMatrixAt(i, obj.matrix);
    grains.setColorAt(i, extraGrainColor(_c, def, layer, i));
  }
  grains.instanceMatrix.needsUpdate = true;
  grains.instanceColor.needsUpdate = true;
  grains.computeBoundingSphere();
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

// Every builder below describes its shape as dozens of little meshes, because
// that is the clearest way to write "a roof, then a chimney, then a door". The
// renderer doesn't need them apart: one draw call is spent per mesh, so a
// cottage costs forty. Bake collapses the meshes that share a material into a
// single geometry once, at build time.
//
// Anything that has to stay addressable is left alone: lights, sprites,
// instanced meshes, and meshes carrying `userData` (the terrain and layer
// meshes animate through theirs). A merge that can't happen — mismatched
// vertex attributes — quietly keeps the originals rather than dropping them.
function bakeGroup(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (Array.isArray(o.material) || !o.material) return;
    if (Object.keys(o.userData).length) return;
    // Group by material *and* the shape of the geometry's data: merging needs
    // every input to carry the same attributes and to agree on whether it is
    // indexed, so a stray uv set or an unindexed ShapeGeometry buckets apart
    // instead of failing the whole merge.
    const sig = Object.keys(o.geometry.attributes).sort().join(",");
    const key = `${o.material.uuid}|${sig}|${o.geometry.index ? "i" : "n"}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.meshes.push(o);
    else buckets.set(key, { material: o.material, meshes: [o] });
  });
  const _m = new THREE.Matrix4();
  for (const { material, meshes } of buckets.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) =>
      m.geometry.clone().applyMatrix4(_m.copy(m.matrixWorld)),
    );
    let merged = null;
    try {
      merged = mergeGeometries(geos);
    } catch {
      merged = null;
    }
    if (!merged) continue;
    const baked = new THREE.Mesh(merged, material);
    baked.castShadow = meshes.some((m) => m.castShadow);
    baked.receiveShadow = meshes.some((m) => m.receiveShadow);
    for (const m of meshes) m.parent?.remove(m);
    root.add(baked);
  }
  return root;
}

// Return a fresh Object3D for a decoration kind. Every builder models around a
// ~0.35 unit footprint and sits on y=0 (the caller lifts/rotates/scales it).
// `v` is the catalog variant (colour/style overrides).
export function buildDecoration(kind, v = {}) {
  return bakeGroup(buildDecorationParts(kind, v));
}

function buildDecorationParts(kind, v = {}) {
  switch (kind) {
    case "moss":
      return buildMoss(v);
    case "leafy":
      return buildLeafy(v);
    case "fern":
      return buildFern(v);
    case "pink":
      return referenceFittonia({ ...v, compact: true });
    case "fittoniabush":
      return referenceFittonia(v);
    case "aralia":
      return referenceAralia();
    case "crag":
      return referenceCrag(v);
    case "mineralpatch":
      return referenceGravel(v);
    case "succulent":
      return buildSucculent(v);
    case "airplant":
      return buildAirPlant(v);
    case "mushroom":
      return buildMushroom(v);
    case "driftwood":
      return buildDriftwood(v);
    case "crystal":
      return buildCrystal(v);
    case "stone":
      return buildStone(v);
    case "riverpebble":
    case "steppingstone":
    case "slatechip":
    case "granite":
    case "lavastone":
    case "sandstone":
      return naturalRock(kind, v);
    case "slate":
      return buildSlate(v);
    case "bonsai":
      return buildBonsai(v);
    case "mossball":
      return buildMossBall(v);
    case "shell":
      return buildShell(v);
    case "grass":
      return buildGrassTuft();
    case "mosspatch":
      return buildMossPatch();
    case "snakeplant":
      return buildSnakePlant();
    case "deer":
      return buildDeer(v);
    case "pebblepatch":
      return buildPebblePatch();
    case "cactus":
      return buildCactus(v);
    case "flowers":
    case "wedelia":
      return buildFlowers(v);
    // The flowering garden pack.
    case "rainlily":
      return buildRainLily(v);
    case "crownofthorns":
      return buildCrownOfThorns(v);
    case "ruellia":
      return buildRuellia(v);
    case "amaryllis":
      return buildAmaryllis(v);
    case "butterflypea":
      return buildButterflyPea(v);
    case "lantana":
      return buildLantana(v);
    case "coleus":
      return buildColeus(v);
    case "drimiopsis":
      return buildDrimiopsis(v);
    case "kalanchoe":
      return buildKalanchoe(v);
    case "oxalis":
      return buildOxalis(v);
    case "bridge":
      return buildBridge(v);
    case "house":
      return buildHouse(v);
    case "lantern":
      return buildLantern(v);
    case "butterfly":
      return buildButterfly(v);
    case "ladybug":
      return buildLadybug(v);
    case "pilea":
      return buildPilea(v);
    case "pothos":
      return buildPothos(v);
    case "calathea":
      return buildCalathea(v);
    case "venusflytrap":
      return buildVenusFlytrap(v);
    case "frog":
      return buildFrog(v);
    case "turtle":
      return buildTurtle(v);
    case "bird":
      return buildBird(v);
    case "gnome":
      return buildGnome(v);
    case "torii":
      return buildTorii(v);
    case "pagoda":
      return buildPagoda(v);
    case "fence":
      return buildFence(v);
    case "well":
      return buildWell(v);
    case "geode":
      return buildGeode(v);
    case "pinecone":
      return buildPinecone(v);
    case "log":
      return buildLog(v);
    case "pond":
      return buildPond(v);
    case "saguaro":
      return buildSaguaro(v);
    case "pricklypear":
      return buildPricklyPear(v);
    case "pincushion":
      return buildPincushion(v);
    case "cliplight":
      return buildClipLight(v);
    case "striplight":
      return buildStripLight(v);
    case "framelight":
      return buildFrameLight(v);
    case "ringlight":
      return buildRingLight(v);
    // Species pack. Genera that grow the same way share a builder — the kind
    // is the name a person searches for, the variant is the species.
    case "rotala":
    case "ludwigia":
    case "bacopa":
    case "hygrophila":
    case "persicaria":
    case "lindernia":
    case "alternanthera":
    case "cabomba":
    case "myriophyllum":
    case "ambulia":
    case "anacharis":
    case "pogostemon":
      return buildStemPlant(v);
    case "echinodorus":
    case "cryptocoryne":
    case "sagittaria":
    case "waterwisteria":
      return buildAquaticRosette(v);
    case "hydrocotyle":
    case "waterpoppy":
      return buildFloatLeaf(v);
    case "cushionmoss":
    case "starmoss":
    case "smoothcapmoss":
    case "fissidens":
    case "fernmoss":
    case "broomforkmoss":
    case "javamoss":
    case "trachycystis":
    // Selaginella is a spikemoss, not a true moss, but it grows as the same
    // low mat of branching fronds — so it shares the builder and sits with the
    // plants in the tray.
    case "selaginella":
      return buildSpeciesMoss(v);
    case "peperomia":
      return buildPeperomia(v);
    case "babytears":
      return buildBabyTears(v);
    case "creepingfig":
      return buildPothos(v);
    case "aglaonema":
      return buildBroadLeaf(v);
    case "anthurium":
    case "alocasia":
    case "philodendron":
      return buildVeinedAroid(v);
    case "haworthia":
      return buildHaworthia(v);
    case "ivy":
      return buildIvy(v);
    case "nerite":
      return buildNerite(v);
    case "shrimp":
      return buildShrimp(v);
    case "isopod":
      return buildIsopod(v);
    case "springtails":
      return buildSpringtails(v);
    // The printed hardscape set — miniature buildings, ruins and reptile hides.
    case "mushroombridge":
      return buildMushroomBridge(v);
    case "ropebridge":
      return buildRopeBridge(v);
    case "crookedcottage":
      return buildCrookedCottage(v);
    case "tudorhouse":
      return buildTudorHouse(v);
    case "shellhouse":
      return buildShellHouse(v);
    case "logcabin":
      return buildLogCabin(v);
    case "mushroomhouse":
      return buildMushroomHouse(v);
    case "domecottage":
      return buildDomeCottage(v);
    case "witchhat":
      return buildWitchHat(v);
    case "spiraltower":
      return buildSpiralTower(v);
    case "chapel":
      return buildChapel(v);
    case "stumphouse":
      return buildStumpHouse(v);
    case "ziggurat":
      return buildZiggurat(v);
    case "rockcave":
      return buildRockCave(v);
    case "slateledge":
      return buildSlateLedge(v);
    case "canyon":
      return buildCanyon(v);
    case "stonestairs":
      return buildStoneStairs(v);
    case "brokenwall":
      return buildBrokenWall(v);
    case "ruinedtower":
      return buildRuinedTower(v);
    case "templehall":
      return buildTempleHall(v);
    case "pavilion":
      return buildPavilion(v);
    case "anchor":
      return buildAnchor(v);
    // The printed garden set that ships alongside it: crossings, seating,
    // paving, stilt huts and the battery lanterns.
    case "taikobashi":
      return buildTaikoBashi(v);
    case "brickwell":
      return buildBrickWell(v);
    case "parkbench":
      return buildParkBench(v);
    case "stilthouse":
      return buildStiltHouse(v);
    case "brickpile":
      return buildBrickPile(v);
    case "stonepath":
      return buildStonePath(v);
    case "oillamp":
      return buildOilLamp(v);
    case "moroccanlantern":
      return buildMoroccanLantern(v);
    // The printed set, second wave.
    case "branchbench":
      return buildBranchBench(v);
    case "coveredwagon":
      return buildCoveredWagon(v);
    case "wheelwell":
      return buildWheelWell(v);
    case "pagodatower":
      return buildPagodaTower(v);
    case "porchcottage":
      return buildPorchCottage(v);
    case "fairytower":
      return buildFairyTower(v);
    case "chanterelle":
      return buildChanterelle(v);
    case "mantis":
      return buildMantis(v);
    case "snake":
      return buildSnakeCoil(v);
    case "wolf":
      return buildWolf(v);
    case "ibex":
      return buildIbex(v);
    case "elephant":
      return buildElephant(v);
    default:
      return new THREE.Group();
  }
}

// ---------------------------------------------------------------------------
// Pieces from the reference build
// ---------------------------------------------------------------------------

// Sansevieria leaf texture: dark green sword with wavy lighter banding and a
// yellow edge — painted once, shared by every leaf.
let snakeLeafTexture = null;
function getSnakeLeafTexture() {
  if (snakeLeafTexture) return snakeLeafTexture;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");

  // sword silhouette
  ctx.fillStyle = "#35592e";
  ctx.beginPath();
  ctx.moveTo(32, 0); // tip
  ctx.quadraticCurveTo(58, 90, 52, 256);
  ctx.lineTo(12, 256);
  ctx.quadraticCurveTo(6, 90, 32, 0);
  ctx.fill();

  // wavy horizontal banding
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.strokeStyle = "rgba(150,180,110,0.5)";
  for (let y = 14; y < 256; y += 13) {
    ctx.lineWidth = 3 + Math.random() * 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(20, y + jitter(6), 44, y + jitter(6), 64, y);
    ctx.stroke();
  }
  // yellow margins
  ctx.strokeStyle = "rgba(214,190,90,0.85)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.quadraticCurveTo(58, 90, 52, 256);
  ctx.moveTo(32, 0);
  ctx.quadraticCurveTo(6, 90, 12, 256);
  ctx.stroke();
  ctx.restore();

  snakeLeafTexture = new THREE.CanvasTexture(c);
  snakeLeafTexture.colorSpace = THREE.SRGBColorSpace;
  return snakeLeafTexture;
}

// Snake plant: a fan of tall, upright banded sword leaves — the striking
// vertical accent in the reference terrarium.
function buildSnakePlant() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    map: getSnakeLeafTexture(),
    transparent: false,
    alphaTest: 0.5,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const leaves = 6 + ((Math.random() * 4) | 0);
  for (let i = 0; i < leaves; i++) {
    const h = 0.5 + Math.random() * 0.35;
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.11, h, 1, 6), mat);
    // gentle S-curve along the height
    const pos = leaf.geometry.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const t = (pos.getY(v) + h / 2) / h;
      pos.setZ(v, Math.sin(t * Math.PI * 1.2) * 0.03);
    }
    leaf.geometry.computeVertexNormals();
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * 0.09;
    leaf.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr);
    leaf.rotation.y = Math.random() * Math.PI;
    leaf.rotation.x = jitter(0.09);
    leaf.rotation.z = jitter(0.09);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// A little deer figurine — the miniature animal from the reference build.
// A deer with believable anatomy: tapered torso with chest and haunch masses,
// two-segment legs with hooves, a proper head (muzzle, nose, eyes), cupped
// ears, branched antlers, white belly/rump and fawn spots along the back.
function buildDeer(v = {}) {
  const g = new THREE.Group();
  const coat = v.body ?? "#a8794f";
  const bodyMat = craftMaterial(coat, { rough: 0.85 });
  const darkMat = craftMaterial(v.dark ?? "#6e4c2e", { rough: 0.85 });
  const paleMat = craftMaterial(shade(coat, 1.45), { rough: 0.9 });
  const blackMat = craftMaterial("#1c1712", { rough: 0.45 });

  // --- torso: main barrel + deeper chest + rounded haunch
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 12), bodyMat);
  torso.scale.set(1.9, 1, 0.82);
  torso.position.y = 0.185;
  torso.castShadow = true;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), bodyMat);
  chest.scale.set(1.05, 1.08, 0.85);
  chest.position.set(0.07, 0.18, 0);
  chest.castShadow = true;
  g.add(chest);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), bodyMat);
  haunch.scale.set(1.0, 1.12, 0.8);
  haunch.position.set(-0.075, 0.19, 0);
  haunch.castShadow = true;
  g.add(haunch);
  // pale belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), paleMat);
  belly.scale.set(1.7, 0.7, 0.7);
  belly.position.set(0, 0.155, 0);
  g.add(belly);

  // --- legs: upper (thigh) + lower (cannon) + dark hoof, slightly bent
  function leg(x, z, back) {
    const hipY = 0.15;
    const upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.009, 0.085, 8),
      bodyMat,
    );
    upper.position.set(x + (back ? 0.008 : -0.006), hipY - 0.038, z);
    upper.rotation.z = back ? 0.18 : -0.12;
    upper.castShadow = true;
    g.add(upper);
    const lower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.0045, 0.085, 8),
      bodyMat,
    );
    lower.position.set(x + (back ? -0.004 : 0.002), hipY - 0.115, z);
    lower.rotation.z = back ? -0.08 : 0.05;
    lower.castShadow = true;
    g.add(lower);
    const hoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.0055, 0.014, 8),
      blackMat,
    );
    hoof.position.set(x, 0.007, z);
    g.add(hoof);
  }
  leg(0.085, -0.026, false);
  leg(0.085, 0.026, false);
  leg(-0.085, -0.026, true);
  leg(-0.085, 0.026, true);

  // --- neck rising forward, head with muzzle
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.03, 0.13, 10),
    bodyMat,
  );
  neck.position.set(0.115, 0.28, 0);
  neck.rotation.z = -0.42;
  neck.castShadow = true;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), bodyMat);
  head.scale.set(1.15, 1, 0.85);
  head.position.set(0.155, 0.345, 0);
  head.castShadow = true;
  g.add(head);
  // tapering muzzle with a dark nose
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), bodyMat);
  muzzle.scale.set(1.5, 0.8, 0.7);
  muzzle.position.set(0.185, 0.335, 0);
  g.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), blackMat);
  nose.position.set(0.207, 0.336, 0);
  g.add(nose);
  // eyes: glossy dark spheres set into the sides of the head
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), blackMat);
    eye.position.set(0.162, 0.352, s * 0.023);
    g.add(eye);
  }

  // --- cupped ears + branched antlers
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 8), bodyMat);
    ear.scale.z = 0.5; // cupped, not conical
    ear.position.set(0.138, 0.385, s * 0.026);
    ear.rotation.set(s * 0.5, 0, 0.5);
    g.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.022, 6), paleMat);
    inner.scale.z = 0.4;
    inner.position.set(0.14, 0.383, s * 0.027);
    inner.rotation.set(s * 0.5, 0, 0.5);
    g.add(inner);

    // main beam curving back with two tines
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.005, 0.075, 6),
      darkMat,
    );
    beam.position.set(0.143, 0.415, s * 0.015);
    beam.rotation.set(s * 0.3, 0, 0.35);
    g.add(beam);
    for (const [ty, tz, rx] of [
      [0.435, 0.024, 0.9],
      [0.45, 0.01, 0.35],
    ]) {
      const tine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002, 0.0035, 0.04, 5),
        darkMat,
      );
      tine.position.set(0.132, ty, s * tz);
      tine.rotation.set(s * rx, 0, -0.4);
      g.add(tine);
    }
  }

  // --- white rump patch + short tail
  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), paleMat);
  rump.scale.set(0.6, 1, 0.9);
  rump.position.set(-0.125, 0.2, 0);
  g.add(rump);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), bodyMat);
  tail.scale.set(0.7, 1.4, 0.7);
  tail.position.set(-0.132, 0.225, 0);
  tail.rotation.z = 0.5;
  g.add(tail);

  // --- fawn spots scattered along the back
  for (let i = 0; i < 10; i++) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 5), paleMat);
    spot.scale.y = 0.3;
    spot.position.set(
      -0.09 + Math.random() * 0.16,
      0.228 + Math.random() * 0.012,
      jitter(0.032),
    );
    g.add(spot);
  }
  return g;
}

// A patch of small rounded white pebbles — laid by the path brush so you can
// draw a winding stone path through the moss, like the reference.
function buildPebblePatch() {
  const g = new THREE.Group();
  const whites = ["#e8e4dc", "#dcd6cb", "#f0ece4", "#cfc9bd"];
  const n = 5 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const r = 0.02 + Math.random() * 0.016;
    const geo = new THREE.SphereGeometry(r, 8, 6);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      p.setXYZ(v, p.getX(v) * (1 + jitter(0.15)), p.getY(v) * 0.6, p.getZ(v) * (1 + jitter(0.15)));
    }
    geo.computeVertexNormals();
    const pebble = new THREE.Mesh(
      geo,
      craftMaterial(whites[(Math.random() * whites.length) | 0], {
        rough: 0.7,
        flat: true,
      }),
    );
    pebble.position.set(jitter(0.06), r * 0.5, jitter(0.06));
    pebble.rotation.y = Math.random() * Math.PI;
    pebble.castShadow = true;
    pebble.receiveShadow = true;
    g.add(pebble);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Miniature hardscape & fairy-garden pieces
// ---------------------------------------------------------------------------

// A little barrel cactus with pale spines and a pink bloom on top.
function buildCactus(v = {}) {
  const g = new THREE.Group();
  const bodyMat = craftMaterial("#527d40", { rough: 0.75 });
  const ribMat = craftMaterial("#476e37", { rough: 0.8 });
  const r = 0.09 + Math.random() * 0.04;
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), bodyMat);
  body.scale.y = 1.25;
  body.position.y = r * 1.1;
  body.castShadow = true;
  g.add(body);
  // vertical ribs
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(r * 1.02, 0.006, 5, 20, Math.PI),
      ribMat,
    );
    rib.rotation.set(0, a, Math.PI / 2);
    rib.rotation.order = "YXZ";
    rib.scale.y = 1.25;
    rib.position.y = r * 1.1;
    g.add(rib);
  }
  // spines
  const spineMat = craftMaterial("#f2ecd8", { rough: 0.9 });
  for (let i = 0; i < 26; i++) {
    const spine = new THREE.Mesh(
      new THREE.ConeGeometry(0.004, 0.035, 4),
      spineMat,
    );
    const a = Math.random() * Math.PI * 2;
    const t = Math.random() * Math.PI;
    const dir = new THREE.Vector3(
      Math.sin(t) * Math.cos(a),
      Math.cos(t) * 1.25,
      Math.sin(t) * Math.sin(a),
    ).normalize();
    spine.position.copy(dir).multiplyScalar(r * 1.05);
    spine.position.y += r * 1.1;
    spine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.add(spine);
  }
  // bloom
  if (v.bloom !== null) {
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      craftMaterial(v.bloom ?? "#e77fa8", { rough: 0.6 }),
    );
    bloom.scale.y = 0.75;
    bloom.position.y = r * 2.35;
    g.add(bloom);
  }
  return g;
}

// A cluster of little daisies on thin stems. With `foliage` the same plant
// becomes a creeping daisy — the flowers sitting over a mat of toothed leaves
// instead of over bare soil.
function buildFlowers(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial(v.stem ?? "#5f7a3c", { rough: 0.85 });
  const petals = v.petals ?? ["#f6f2ea", "#f2d3e2"];
  const petalMat = craftMaterial(petals[0], { rough: 0.65 });
  const petalMatAlt = craftMaterial(petals[petals.length - 1], { rough: 0.65 });
  const centerMat = craftMaterial(v.center ?? "#e8b23a", { rough: 0.7 });
  const petalGeo = new THREE.CircleGeometry(v.petalR ?? 0.022, 6);

  if (v.foliage) {
    const leafMat = plainLeafMaterial(v.foliage, toothedOutline, "toothed");
    const leafGeo = new THREE.PlaneGeometry(0.055, 0.07);
    leafGeo.translate(0, 0.035, 0);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * 0.12;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.rotation.order = "YXZ";
      leaf.rotation.set(1.25 + jitter(0.25), a, 0);
      leaf.position.set(Math.cos(a) * rr, 0.01 + Math.random() * 0.04, Math.sin(a) * rr);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }

  const flowers = v.blooms ?? 3 + ((Math.random() * 3) | 0);
  for (let f = 0; f < flowers; f++) {
    const h = 0.14 + Math.random() * 0.12;
    const px = jitter(0.1);
    const pz = jitter(0.1);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.007, h, 5),
      stemMat,
    );
    stem.position.set(px, h / 2, pz);
    stem.rotation.z = jitter(0.15);
    g.add(stem);

    const head = new THREE.Group();
    const mat = Math.random() < 0.5 ? petalMat : petalMatAlt;
    for (let p = 0; p < 7; p++) {
      const a = (p / 7) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeo, mat);
      petal.material.side = THREE.DoubleSide;
      petal.position.set(Math.cos(a) * 0.025, 0, Math.sin(a) * 0.025);
      petal.rotation.x = -Math.PI / 2 + 0.25;
      petal.rotation.z = -a;
      petal.scale.set(0.7, 1.4, 1);
      head.add(petal);
    }
    const center = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 6),
      centerMat,
    );
    center.scale.y = 0.6;
    head.add(center);
    head.position.set(px + jitter(0.02), h + 0.01, pz + jitter(0.02));
    head.rotation.set(jitter(0.3), Math.random() * Math.PI, jitter(0.3));
    g.add(head);
  }
  return g;
}

// An arched wooden plank bridge — classic fairy-garden hardscape.
function buildBridge(v = {}) {
  const g = new THREE.Group();
  const woodMat = craftMaterial(v.wood ?? "#7d5c3a", { rough: 0.9, flat: true });
  const darkMat = craftMaterial(v.dark ?? "#66492c", { rough: 0.9, flat: true });
  const planks = 9;
  const span = 0.5;
  const rise = 0.12;
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1);
    const x = (t - 0.5) * span;
    const y = rise * Math.sin(t * Math.PI) + 0.02;
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.016, 0.2),
      i % 2 ? woodMat : darkMat,
    );
    plank.position.set(x, y, 0);
    plank.rotation.z = -Math.cos(t * Math.PI) * 0.45;
    plank.castShadow = true;
    g.add(plank);
  }
  // rails
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.014, 0.14, 6),
        darkMat,
      );
      post.position.set(end * span * 0.42, 0.1, side * 0.09);
      g.add(post);
    }
    const railCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-span * 0.42, 0.17, side * 0.09),
      new THREE.Vector3(0, 0.17 + rise, side * 0.09),
      new THREE.Vector3(span * 0.42, 0.17, side * 0.09),
    );
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(railCurve, 12, 0.01, 5),
      woodMat,
    );
    rail.castShadow = true;
    g.add(rail);
  }
  return g;
}

// A tiny mushroom-cottage with a spotted red roof and a wooden door.
function buildHouse(v = {}) {
  const g = new THREE.Group();
  const wallMat = craftMaterial("#ede0c8", { rough: 0.85 });
  const roofMat = craftMaterial(v.roof ?? "#c9483a", { rough: 0.7 });
  const doorMat = craftMaterial("#6e4f30", { rough: 0.85 });

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 0.18, 14),
    wallMat,
  );
  body.position.y = 0.09;
  body.castShadow = true;
  g.add(body);

  const roof = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), roofMat);
  roof.scale.y = 0.75;
  roof.position.y = 0.18;
  roof.castShadow = true;
  g.add(roof);

  // white spots on the roof
  for (let i = 0; i < 5; i++) {
    const spot = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 6, 5),
      craftMaterial("#f5efe0", { rough: 0.8 }),
    );
    const a = (i / 5) * Math.PI * 2 + jitter(0.4);
    const t = 0.35 + Math.random() * 0.4;
    spot.position.set(
      Math.sin(t) * Math.cos(a) * 0.15,
      0.18 + Math.cos(t) * 0.11,
      Math.sin(t) * Math.sin(a) * 0.15,
    );
    g.add(spot);
  }

  // door + window
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 10, 1, false, 0, Math.PI), doorMat);
  door.rotation.set(Math.PI / 2, 0, 0);
  door.position.set(0, 0.05, 0.125);
  g.add(door);
  const win = new THREE.Mesh(
    new THREE.CircleGeometry(0.02, 8),
    craftMaterial("#f2c05a", { rough: 0.4 }),
  );
  win.position.set(0.09, 0.12, 0.075);
  win.lookAt(0.4, 0.14, 0.35);
  g.add(win);
  return g;
}

// A little garden lantern with a warm glowing core.
function buildLantern(v = {}) {
  const g = new THREE.Group();
  const metalMat = craftMaterial("#4a453e", { rough: 0.6 });
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.013, 0.26, 6),
    metalMat,
  );
  post.position.y = 0.13;
  post.castShadow = true;
  g.add(post);

  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.038, 0.07, 6, 1, true),
    metalMat,
  );
  cage.material = metalMat.clone();
  cage.material.side = THREE.DoubleSide;
  cage.position.y = 0.29;
  g.add(cage);

  // glowing core — emissive so it reads at night mood
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 8, 8),
    new THREE.MeshStandardMaterial({
      color: v.glow ?? 0xffd77a,
      emissive: v.glow ?? 0xffb347,
      emissiveIntensity: 1.6,
      roughness: 0.4,
    }),
  );
  core.position.y = 0.29;
  g.add(core);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.045, 6), metalMat);
  cap.position.y = 0.35;
  g.add(cap);

  const light = new THREE.PointLight(v.glow ?? 0xffb347, 0.5, 1.2);
  light.position.y = 0.29;
  g.add(light);
  return g;
}

// A butterfly resting with wings half-open.
// Real butterfly wings are painted, not solid: a monarch-style pattern with
// black veins radiating through the colour, a dark border with white spots,
// and separate fore/hind wing lobes — all drawn once per colour and alpha-cut.
const butterflyTextures = new Map();
function getButterflyWingTexture(hex) {
  if (butterflyTextures.has(hex)) return butterflyTextures.get(hex);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");

  // wing silhouette: forewing (upper lobe) + hindwing (lower lobe), hinge at
  // the left-centre (48,128)
  const drawSilhouette = () => {
    ctx.beginPath();
    ctx.moveTo(48, 128);
    // forewing sweeps up and out
    ctx.bezierCurveTo(60, 40, 150, 8, 224, 30);
    ctx.bezierCurveTo(240, 40, 232, 90, 190, 118);
    ctx.bezierCurveTo(160, 132, 100, 130, 48, 128);
    // hindwing: rounder, lower lobe
    ctx.moveTo(48, 128);
    ctx.bezierCurveTo(110, 132, 160, 140, 180, 170);
    ctx.bezierCurveTo(192, 196, 170, 232, 130, 236);
    ctx.bezierCurveTo(88, 238, 56, 190, 48, 128);
    ctx.closePath();
  };

  // base colour with a soft radial fade toward the tips
  drawSilhouette();
  ctx.save();
  ctx.clip();
  const base = ctx.createRadialGradient(60, 128, 20, 150, 120, 190);
  base.addColorStop(0, shade(hex, 1.15));
  base.addColorStop(0.75, hex);
  base.addColorStop(1, shade(hex, 0.72));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);

  // black veins radiating from the hinge
  ctx.strokeStyle = "rgba(20,14,10,0.85)";
  ctx.lineCap = "round";
  for (const [cx, cy, ex, ey, w] of [
    [48, 128, 210, 34, 4],
    [48, 128, 226, 60, 3.4],
    [48, 128, 214, 92, 3],
    [48, 128, 186, 116, 2.6],
    [48, 128, 178, 168, 3],
    [48, 128, 172, 206, 2.6],
    [48, 128, 130, 232, 2.4],
    [48, 128, 84, 214, 2.2],
  ]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo((cx + ex) / 2 + 14, (cy + ey) / 2, ex, ey);
    ctx.stroke();
  }

  // dark wing border with white spots, like a monarch's margin
  ctx.lineWidth = 17;
  ctx.strokeStyle = "rgba(24,16,12,0.95)";
  drawSilhouette();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,250,240,0.9)";
  for (const [sx, sy, sr] of [
    [214, 38, 3.4], [226, 62, 3], [212, 92, 3.2], [188, 114, 2.6],
    [178, 172, 3], [166, 204, 2.8], [128, 228, 2.6], [90, 208, 2.4],
    [96, 26, 2.6], [150, 14, 3],
  ]) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  butterflyTextures.set(hex, tex);
  return tex;
}

// lighten/darken a hex colour
function shade(hex, k) {
  const col = new THREE.Color(hex);
  col.r = Math.min(1, col.r * k);
  col.g = Math.min(1, col.g * k);
  col.b = Math.min(1, col.b * k);
  return `#${col.getHexString()}`;
}

function buildButterfly(v = {}) {
  const g = new THREE.Group();
  const hues = ["#6fa8dc", "#e8a33d", "#d17aa0", "#8f7ad1"];
  const hue = v.wing ?? hues[(Math.random() * hues.length) | 0];
  const wingMat = new THREE.MeshStandardMaterial({
    map: getButterflyWingTexture(hue),
    transparent: false,
    alphaTest: 0.5,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  // wing quad maps the full texture; hinge sits at its left-centre edge
  const wingGeo = new THREE.PlaneGeometry(0.13, 0.13);
  wingGeo.translate(0.055, 0, 0); // pivot at the hinge

  const openAngle = 0.55 + Math.random() * 0.5; // resting, partly open
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.rotation.order = "YXZ";
    wing.rotation.x = -Math.PI / 2;
    wing.rotation.y = s > 0 ? 0 : Math.PI; // mirror the left wing
    // tilt each wing up from the body like a resting butterfly
    const lift = new THREE.Group();
    lift.add(wing);
    lift.rotation.z = s * openAngle;
    lift.position.y = 0.028;
    g.add(lift);
    wing.castShadow = true;
  }

  // segmented body: thorax + tapering abdomen + head
  const bodyMat = craftMaterial("#2c241c", { rough: 0.65 });
  const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.02, 3, 8), bodyMat);
  thorax.rotation.x = Math.PI / 2;
  thorax.position.set(0, 0.026, 0.004);
  g.add(thorax);
  const abdomen = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.03, 3, 8), bodyMat);
  abdomen.rotation.x = Math.PI / 2 - 0.25;
  abdomen.position.set(0, 0.02, -0.028);
  g.add(abdomen);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), bodyMat);
  head.position.set(0, 0.03, 0.022);
  g.add(head);

  // antennae with clubbed tips
  for (const s of [-1, 1]) {
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0012, 0.0018, 0.045, 4),
      bodyMat,
    );
    ant.position.set(s * 0.006, 0.05, 0.038);
    ant.rotation.set(0.7, 0, s * 0.35);
    g.add(ant);
    const club = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 6, 6), bodyMat);
    club.position.set(s * 0.013, 0.068, 0.052);
    g.add(club);
  }
  return g;
}

// A ladybug with real beetle anatomy: glossy domed elytra with a centre split
// line, black pronotum with white cheek patches, six bent legs and antennae.
function buildLadybug(v = {}) {
  const g = new THREE.Group();
  const shellColor = v.shell ?? "#c93326";
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(shellColor),
    roughness: 0.18,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });
  const blackMat = craftMaterial("#181410", { rough: 0.4 });

  // domed wing cases (elytra)
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.042, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    shellMat,
  );
  shell.scale.set(1, 0.72, 1.18);
  shell.position.set(0, 0.008, -0.008);
  shell.castShadow = true;
  g.add(shell);

  // the split line where the wing cases meet
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(0.0016, 0.031, 0.092),
    blackMat,
  );
  seam.position.set(0, 0.016, -0.008);
  g.add(seam);

  // spots — flattened dark lenses sitting just proud of the shell
  const spotGeo = new THREE.SphereGeometry(0.0075, 8, 6);
  for (const [sx, sz] of [
    [0.018, 0.012], [-0.018, 0.012],
    [0.026, -0.03], [-0.026, -0.03],
    [0.012, -0.052], [-0.012, -0.052],
  ]) {
    const spot = new THREE.Mesh(spotGeo, blackMat);
    const y = 0.008 + 0.03 * Math.sqrt(Math.max(0, 1 - (sx * sx + (sz + 0.008) * (sz + 0.008)) / 0.0025));
    spot.scale.y = 0.25;
    spot.position.set(sx, y, sz);
    g.add(spot);
  }

  // pronotum (black collar) + head with white cheek patches
  const pronotum = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    blackMat,
  );
  pronotum.scale.set(1.15, 0.6, 0.9);
  pronotum.position.set(0, 0.008, 0.038);
  g.add(pronotum);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), blackMat);
  head.scale.y = 0.65;
  head.position.set(0, 0.008, 0.056);
  g.add(head);
  const cheekMat = craftMaterial("#e8e2d4", { rough: 0.6 });
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), cheekMat);
    cheek.scale.y = 0.5;
    cheek.position.set(s * 0.013, 0.012, 0.042);
    g.add(cheek);
  }

  // six thin bent legs
  for (const s of [-1, 1]) {
    for (const [lz, ang] of [
      [0.03, 0.5],
      [0.0, 0.1],
      [-0.032, -0.45],
    ]) {
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0016, 0.0022, 0.02, 5),
        blackMat,
      );
      upper.position.set(s * 0.036, 0.006, lz);
      upper.rotation.set(ang, 0, s * 1.15);
      g.add(upper);
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.001, 0.0016, 0.014, 5),
        blackMat,
      );
      foot.position.set(s * 0.047, 0.002, lz + Math.sin(ang) * 0.01);
      foot.rotation.set(ang, 0, s * 0.5);
      g.add(foot);
    }
  }

  // antennae
  for (const s of [-1, 1]) {
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0008, 0.0012, 0.016, 4),
      blackMat,
    );
    ant.position.set(s * 0.007, 0.012, 0.066);
    ant.rotation.set(1.1, 0, s * 0.5);
    g.add(ant);
  }
  return g;
}

// A small tuft of grass blades — spawned by the paint brush, not the tray.
function buildGrassTuft() {
  return naturalGrass();
}

function buildMoss(v = {}) {
  return naturalMoss({ colors: v.colors });
}

function buildLeafy(v = {}) {
  return buildBroadLeaf({ leaf: v.leaf ?? "#3f7d4f", mark: v.dark ?? "#2f6640", midrib: "#a7b97b", speckle: 0.4, leaves: 9 });
}

function buildMushroom(v = {}) {
  const g = new THREE.Group();
  const shrooms = 1 + ((Math.random() * 3) | 0);
  // fly-agaric reds with the odd orange, like the reference build
  const capColors = v.caps ?? ["#c9302a", "#d84438", "#b52a24", "#d97a3f"];
  const gillMat = craftMaterial("#e8ddc4", { rough: 0.9, flat: true });
  const stemMat = craftMaterial("#efe7d3", { rough: 0.85 });

  for (let i = 0; i < shrooms; i++) {
    const h = 0.12 + Math.random() * 0.14;
    const px = jitter(0.14);
    const pz = jitter(0.14);
    const lean = jitter(0.14); // real mushrooms rarely stand dead straight

    // stem with a slightly swollen base
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.026, h, 12),
      stemMat,
    );
    stem.position.set(px, h / 2, pz);
    stem.rotation.z = lean;
    stem.castShadow = true;
    g.add(stem);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), stemMat);
    bulb.scale.y = 0.55;
    bulb.position.set(px, 0.012, pz);
    g.add(bulb);

    const capR = 0.06 + Math.random() * 0.05;
    const capX = px - Math.sin(lean) * h * 0.5;
    const capY = h + capR * 0.08;

    // cap: smooth dome with a soft sheen and a darker centre
    const capMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(capColors[(Math.random() * capColors.length) | 0]),
      roughness: 0.35,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
    });
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(capR, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      capMat,
    );
    cap.scale.y = 0.72;
    cap.position.set(capX, capY, pz);
    cap.rotation.z = lean * 0.6;
    cap.castShadow = true;
    g.add(cap);

    // radial gills under the cap — the detail that sells a real mushroom
    const gills = new THREE.Mesh(
      new THREE.ConeGeometry(capR * 0.94, capR * 0.22, 26, 1, true),
      gillMat,
    );
    gills.rotation.x = Math.PI; // open side down
    gills.rotation.z = lean * 0.6;
    gills.position.set(capX, capY - capR * 0.05, pz);
    g.add(gills);

    // wart flecks in a loose ring pattern, flattened against the dome
    const spots = 5 + ((Math.random() * 4) | 0);
    for (let s = 0; s < spots; s++) {
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(capR * (0.08 + Math.random() * 0.07), 6, 5),
        craftMaterial("#f5efe0", { rough: 0.75 }),
      );
      const a = Math.random() * Math.PI * 2;
      const t = 0.25 + Math.random() * 0.85; // polar angle down the dome
      spot.scale.y = 0.35;
      spot.position.set(
        capX + Math.sin(t) * Math.cos(a) * capR * 0.92,
        capY + Math.cos(t) * capR * 0.68,
        pz + Math.sin(t) * Math.sin(a) * capR * 0.92,
      );
      g.add(spot);
    }
  }
  return g;
}

function buildStone(v = {}) {
  return naturalStone(v);
}

// A cluster of small green moss blobs at a point — shared canopy/foliage.
function mossClump(pos, colors, r) {
  return naturalCanopy(pos, colors, r);
}

// A tiny driftwood bonsai: a gnarled tapering trunk that forks into a few
// branches, each capped with a moss/foliage canopy — the "tiny bonsai scape".
function buildBonsai(v = {}) {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: v.wood ?? "#6e5236",
    ...grainMaps("fibre"), bumpScale: 0.002, roughness: 0.96, envMapIntensity: 0.45 });
  const greens = v.colors ?? ["#5f8f3a", "#6f9f44", "#7faf50", "#548030"];
  const H = 0.34 + Math.random() * 0.12;
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(jitter(0.04), H * 0.35, jitter(0.04)),
    new THREE.Vector3(jitter(0.06), H * 0.7, jitter(0.05)),
    new THREE.Vector3(jitter(0.05), H, jitter(0.04)),
  ]);
  const trunkGeo = new THREE.TubeGeometry(trunkCurve, 20, 0.026, 10);
  const tp = trunkGeo.attributes.position;
  for (let ring = 0; ring <= 20; ring++) {
    const centre = trunkCurve.getPointAt(ring / 20);
    const taper = 1 - (ring / 20) * 0.68;
    for (let j = 0; j <= 10; j++) {
      const i = ring * 11 + j;
      tp.setXYZ(i, centre.x + (tp.getX(i) - centre.x) * taper,
        centre.y + (tp.getY(i) - centre.y) * taper, centre.z + (tp.getZ(i) - centre.z) * taper);
    }
  }
  trunkGeo.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeo, woodMat);
  trunk.castShadow = true;
  g.add(trunk);
  // flared roots at the base
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 5), woodMat);
    root.position.set(Math.cos(a) * 0.04, 0.01, Math.sin(a) * 0.04);
    root.rotation.set(Math.PI / 2 - 0.3, -a, 0);
    g.add(root);
  }
  // branches forking off the upper trunk, each with a canopy
  const branches = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < branches; i++) {
    const base = trunkCurve.getPoint(0.55 + Math.random() * 0.4);
    const a = (i / branches) * Math.PI * 2 + jitter(0.4);
    const dir = new THREE.Vector3(Math.cos(a), 0.5 + Math.random() * 0.5, Math.sin(a)).normalize();
    const end = base.clone().addScaledVector(dir, 0.09 + Math.random() * 0.08);
    const br = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([base, base.clone().addScaledVector(dir, 0.05), end]), 8, 0.011, 5),
      woodMat,
    );
    br.castShadow = true;
    g.add(br);
    g.add(mossClump(end, greens, 0.080 + Math.random() * 0.025));
  }
  // crowning canopy
  g.add(mossClump(trunkCurve.getPoint(1), greens, 0.105));
  return g;
}

// A kokedama-style moss ball: a rounded mound densely covered in bright moss
// tufts, sitting on the ground — from the "Tree of Life" mossy landscape.
function buildMossBall(v = {}) {
  return naturalMoss({ colors: v.colors, radius: 0.15, count: 240, ball: true });
}

// Riven slate: a small stack of thin, angular layered slabs leaning on each
// other — the flat hardscape stone glued into towers in the reference build.
function buildSlate(v = {}) {
  const g = new THREE.Group();
  const grays = v.grays ?? ["#6f6b64", "#7d7870", "#5a564f", "#87827a"];
  const n = 2 + ((Math.random() * 3) | 0);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.16 + Math.random() * 0.16;
    const d = 0.1 + Math.random() * 0.1;
    const h = 0.02 + Math.random() * 0.022;
    const geo = new THREE.BoxGeometry(w, h, d, 2, 1, 2);
    // rough, cleaved edges: jitter the rim vertices
    const p = geo.attributes.position;
    for (let vi = 0; vi < p.count; vi++) {
      p.setX(vi, p.getX(vi) * (1 + jitter(0.12)));
      p.setZ(vi, p.getZ(vi) * (1 + jitter(0.12)));
      p.setY(vi, p.getY(vi) + jitter(h * 0.3));
    }
    geo.computeVertexNormals();
    const slab = new THREE.Mesh(
      geo,
      craftMaterial(grays[i % grays.length], { rough: 0.92, flat: true }),
    );
    slab.position.set(jitter(0.035), y + h / 2, jitter(0.035));
    slab.rotation.set(jitter(0.1), Math.random() * Math.PI, jitter(0.14));
    slab.castShadow = true;
    slab.receiveShadow = true;
    g.add(slab);
    y += h * 0.85;
  }
  return g;
}

// A low, small moss cushion spawned by the moss brush along a stroke — a
// lighter cousin of the full moss decoration so many can be painted cheaply.
function buildMossPatch() {
  return naturalMoss({ radius: 0.07, count: 45, dome: 0.018 });
}

function buildShell(v = {}) {
  const g = new THREE.Group();
  const shellMat = craftMaterial(v.shell ?? "#e0c39a", { rough: 0.5 });
  const bandMat = craftMaterial(v.band ?? "#b98a58", { rough: 0.5 }); // darker growth bands
  const bodyMat = craftMaterial("#c7a888", { rough: 0.85 });

  // --- the coiled shell: fat beads spiralling inward, opening (outer turn)
  // largest, standing up in a vertical plane like a real snail shell.
  const coil = new THREE.Group();
  const turns = 2.7;
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = outer opening, 1 = centre
    const ang = t * Math.PI * 2 * turns;
    const dist = 0.19 * (1 - t) + 0.012;
    const rad = 0.07 * (1 - t) + 0.01;
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(rad, 12, 10),
      (i % 7) < 2 ? bandMat : shellMat,
    );
    bead.position.set(Math.cos(ang) * dist, Math.sin(ang) * dist, 0);
    bead.castShadow = true;
    coil.add(bead);
  }
  coil.rotation.y = -0.4;
  coil.position.set(0.02, 0.12, 0);
  g.add(coil);

  // --- the body/foot sliding forward from under the shell
  const footCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.03, 0.02),
    new THREE.Vector3(0.16, 0.035, 0.0),
    new THREE.Vector3(0.28, 0.045, -0.01),
    new THREE.Vector3(0.34, 0.06, -0.01),
  ]);
  const foot = new THREE.Mesh(
    new THREE.TubeGeometry(footCurve, 16, 0.038, 8),
    bodyMat,
  );
  foot.castShadow = true;
  g.add(foot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), bodyMat);
  head.position.set(0.34, 0.07, -0.01);
  head.castShadow = true;
  g.add(head);

  // two little eye-stalks
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.008, 0.07, 5),
      bodyMat,
    );
    stalk.position.set(0.36, 0.12, -0.01 + s * 0.022);
    stalk.rotation.z = -0.5;
    g.add(stalk);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 8),
      craftMaterial("#3a2c22", { rough: 0.4 }),
    );
    eye.position.set(0.385, 0.155, -0.01 + s * 0.022);
    g.add(eye);
  }
  return g;
}

// ---------------------------------------------------------------------------
// New elements: fern, succulent, air plant, driftwood, quartz crystal
// ---------------------------------------------------------------------------

function buildFern(v = {}) {
  const g = new THREE.Group();
  const greens = v.colors ?? ["#3f7a34", "#4a8c3c", "#5a9c46", "#356b2c"];
  const leaflet = new THREE.PlaneGeometry(0.075, 0.032);
  const fronds = 5 + ((Math.random() * 4) | 0);

  for (let f = 0; f < fronds; f++) {
    const frond = new THREE.Group();
    const len = 0.38 + Math.random() * 0.22;
    // an arching stem: rises then bends outward
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, len * 0.75, len * 0.28),
      new THREE.Vector3(0, len * 0.82, len),
    );
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 14, 0.007, 5),
      craftMaterial("#4a6b30", { rough: 0.8 }),
    );
    stem.castShadow = true;
    frond.add(stem);

    const mat = craftMaterial(greens[f % greens.length], { rough: 0.72 });
    mat.side = THREE.DoubleSide;
    const pairs = 9;
    for (let i = 1; i < pairs; i++) {
      const t = i / pairs;
      const pos = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const size = (1 - t) * 0.9 + 0.25;
      for (const s of [-1, 1]) {
        const lf = new THREE.Mesh(leaflet, mat);
        lf.position.copy(pos);
        lf.lookAt(pos.clone().add(new THREE.Vector3(s * 0.7, 0.12, tan.z)));
        lf.rotateZ(jitter(0.3));
        lf.scale.setScalar(size);
        lf.castShadow = true;
        frond.add(lf);
      }
    }
    frond.rotation.y = (f / fronds) * Math.PI * 2 + jitter(0.35);
    frond.rotation.x = -0.18 - Math.random() * 0.2;
    g.add(frond);
  }
  return g;
}

function buildSucculent(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#7fb08a", { rough: 0.55 });
  const tipMat = craftMaterial(v.tip ?? "#d98fa8", { rough: 0.55 }); // pink blush tips
  // concentric rings of thick pointed leaves forming a rosette
  const rings = [
    { n: 4, r: 0.02, up: 1.4, len: 0.13, w: 0.045 },
    { n: 6, r: 0.06, up: 0.7, len: 0.16, w: 0.05 },
    { n: 8, r: 0.11, up: 0.25, len: 0.15, w: 0.048 },
  ];
  const up = new THREE.Vector3(0, 1, 0);
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.5;
      const dir = new THREE.Vector3(
        Math.cos(a),
        ring.up,
        Math.sin(a),
      ).normalize();
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(ring.w, ring.len, 6),
        leafMat,
      );
      leaf.quaternion.setFromUnitVectors(up, dir);
      leaf.position
        .copy(dir)
        .multiplyScalar(ring.r + ring.len * 0.4)
        .setY(0.04 + ring.up * 0.05);
      leaf.scale.z = 0.7; // flatten the leaf a touch
      leaf.castShadow = true;
      g.add(leaf);

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(ring.w * 0.55, 8, 6),
        tipMat,
      );
      tip.position
        .copy(dir)
        .multiplyScalar(ring.r + ring.len * 0.95)
        .setY(0.04 + ring.up * 0.05 + ring.len * 0.4);
      g.add(tip);
    }
  });
  return g;
}

function buildAirPlant(v = {}) {
  const g = new THREE.Group();
  const mat = craftMaterial(v.color ?? "#9db98d", { rough: 0.7 }); // silvery green
  mat.side = THREE.DoubleSide;
  const leaves = 11 + ((Math.random() * 5) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.2);
    const reach = 0.16 + Math.random() * 0.16;
    const rise = 0.16 + Math.random() * 0.12;
    // arching blade: up from centre, then curving out and drooping
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(Math.cos(a) * reach * 0.35, rise, Math.sin(a) * reach * 0.35),
      new THREE.Vector3(Math.cos(a) * reach, rise * 0.55, Math.sin(a) * reach),
    );
    const blade = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, 0.011, 4),
      mat,
    );
    blade.scale.x = 1.6; // flatten into a blade
    blade.castShadow = true;
    g.add(blade);
  }
  return g;
}

function buildDriftwood(v = {}) {
  const g = new THREE.Group();
  const woodMat = craftMaterial(v.wood ?? "#6e5236", { rough: 0.92, flat: true });
  // a weathered branch wandering mostly sideways
  const pts = [];
  let x = -0.22,
    y = 0.05,
    z = jitter(0.1);
  for (let i = 0; i <= 5; i++) {
    pts.push(new THREE.Vector3(x, y, z));
    x += 0.08 + Math.random() * 0.05;
    y += 0.015 + jitter(0.04);
    z += jitter(0.07);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const main = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 24, 0.05, 6),
    woodMat,
  );
  main.castShadow = true;
  main.receiveShadow = true;
  g.add(main);

  // a couple of broken-off offshoots reaching up
  for (let b = 0; b < 2; b++) {
    const base = curve.getPoint(0.3 + Math.random() * 0.4);
    const bpts = [base.clone()];
    let bx = base.x,
      by = base.y,
      bz = base.z;
    for (let i = 0; i < 3; i++) {
      bx += jitter(0.06);
      by += 0.05 + Math.random() * 0.05;
      bz += jitter(0.06);
      bpts.push(new THREE.Vector3(bx, by, bz));
    }
    const bm = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bpts), 10, 0.024, 5),
      woodMat,
    );
    bm.castShadow = true;
    g.add(bm);
  }
  return g;
}

function buildCrystal(v = {}) {
  const g = new THREE.Group();
  // amethyst-like quartz: translucent purple hexagonal prisms with pointed tips
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(v.color ?? "#9a77c9"),
    roughness: 0.12,
    metalness: 0,
    transmission: 0.6,
    thickness: 0.3,
    ior: 1.55,
    transparent: true,
    opacity: 0.92,
    clearcoat: 0.5,
    clearcoatRoughness: 0.08,
    flatShading: true,
  });
  const n = 4 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const shard = new THREE.Group();
    const r = 0.028 + Math.random() * 0.022;
    const h = 0.1 + Math.random() * 0.12;
    const point = 0.05 + Math.random() * 0.04;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), mat);
    body.position.y = h / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r, point, 6), mat);
    tip.position.y = h + point / 2;
    shard.add(body, tip);
    const a = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.07;
    shard.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    shard.rotation.set(jitter(0.45), Math.random() * Math.PI, jitter(0.45));
    shard.scale.setScalar(0.75 + Math.random() * 0.55);
    shard.castShadow = true;
    g.add(shard);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Expanded plant cast — the trailing, patterned and carnivorous plants people
// actually crowd their jars with.
// ---------------------------------------------------------------------------

// Pilea peperomioides (Chinese money plant): round, coin-like peltate leaves
// held out on slender petioles that attach at each leaf's centre.
function buildPilea(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#57a04a", { rough: 0.55 });
  leafMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial("#c98f5a", { rough: 0.8 });
  const leaves = 7 + ((Math.random() * 5) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.4);
    const len = 0.12 + Math.random() * 0.12;
    const rise = 0.14 + Math.random() * 0.14;
    const end = new THREE.Vector3(Math.cos(a) * len, rise, Math.sin(a) * len);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(Math.cos(a) * len * 0.4, rise * 0.85, Math.sin(a) * len * 0.4),
      end,
    );
    const petiole = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 8, 0.006, 5),
      stemMat,
    );
    petiole.castShadow = true;
    g.add(petiole);
    const r = 0.045 + Math.random() * 0.025;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 18), leafMat);
    disc.position.copy(end);
    // dish the coin slightly and face it upward
    disc.rotation.x = -Math.PI / 2 + jitter(0.4);
    disc.rotation.z = a;
    disc.castShadow = true;
    g.add(disc);
    // pale petiole dot where it meets the blade (peltate attachment)
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 6, 6),
      craftMaterial(shade(v.leaf ?? "#57a04a", 0.7), { rough: 0.6 }),
    );
    dot.position.copy(end);
    g.add(dot);
  }
  return g;
}

// Peperomia: a low clump of thick, cupped oval leaves on short petioles. The
// leaves are the whole plant at this size — fleshy, glossier than a fern, and
// held at every angle rather than in a tidy rosette.
function buildPeperomia(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#3f7a44", { rough: 0.45 });
  leafMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial(v.stem ?? "#8fae5a", { rough: 0.8 });
  const stripeMat = v.stripe ? craftMaterial(v.stripe, { rough: 0.45 }) : null;
  if (stripeMat) stripeMat.side = THREE.DoubleSide;
  const leaves = 9 + ((Math.random() * 5) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.5);
    const rise = 0.07 + Math.random() * 0.1;
    const out = 0.05 + Math.random() * 0.06;
    const tip = new THREE.Vector3(Math.cos(a) * out, rise, Math.sin(a) * out);
    const petiole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.006, rise, 5),
      stemMat,
    );
    petiole.position.set(tip.x * 0.5, rise / 2, tip.z * 0.5);
    g.add(petiole);
    // A dome rather than a disc: Peperomia leaves are thick, and a flat circle
    // shows a dark unlit back the moment it tips away from the light.
    const r = (v.leafScale ?? 1) * (0.05 + Math.random() * 0.02);
    const blade = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
      leafMat,
    );
    blade.scale.set(0.8, 0.3, 1);
    blade.position.copy(tip);
    blade.rotation.set(0.45 + jitter(0.25), -a, 0);
    blade.castShadow = true;
    g.add(blade);
    // the watermelon cultivar wears silver bands running down the blade
    if (stripeMat) {
      for (let k = -1; k <= 1; k++) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.12, r * 0.02, r * 1.5),
          stripeMat,
        );
        band.position.copy(tip);
        band.rotation.copy(blade.rotation);
        band.translateX(k * r * 0.4);
        band.translateY(r * 0.26);
        g.add(band);
      }
    }
  }
  return g;
}

// Baby tears (Soleirolia / Hemianthus): a dense creeping mat of tiny round
// leaves. Nothing about one leaf is interesting — the plant is the carpet, so
// it is built as a spread of little discs on hair-thin runners.
function buildBabyTears(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#7fbc55", { rough: 0.6 });
  leafMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial(v.stem ?? "#8fc46a", { rough: 0.8 });
  const spread = v.spread ?? 0.2;
  const runners = 9;
  for (let s = 0; s < runners; s++) {
    const a = (s / runners) * Math.PI * 2 + jitter(0.4);
    const len = spread * (0.5 + Math.random() * 0.6);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(Math.cos(a) * len * 0.5, 0.05, Math.sin(a) * len * 0.5),
      new THREE.Vector3(Math.cos(a) * len, 0.015, Math.sin(a) * len),
    );
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0035, 4), stemMat));
    for (let i = 1; i <= 7; i++) {
      const p = curve.getPoint(i / 7);
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.011 + Math.random() * 0.006, 7), leafMat);
        leaf.position.set(p.x + side * 0.008, p.y + 0.006 + Math.random() * 0.01, p.z + jitter(0.008));
        leaf.rotation.set(-Math.PI / 2 + jitter(0.5), 0, jitter(0.6));
        g.add(leaf);
      }
    }
  }
  return g;
}

// Heart-shaped leaf used by trailing vines.
function heartLeafGeo(size = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.05, 0.03, 0.11, 0.05, 0.11, 0.11);
  s.bezierCurveTo(0.11, 0.16, 0.05, 0.17, 0, 0.2);
  s.bezierCurveTo(-0.05, 0.17, -0.11, 0.16, -0.11, 0.11);
  s.bezierCurveTo(-0.11, 0.05, -0.05, 0.03, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 8);
  geo.scale(size, size, size);
  return geo;
}

// Pothos: long vines that spill up and over, dressed in heart-shaped leaves —
// the plant that drapes down the outside of every jar.
function buildPothos(v = {}) {
  const g = new THREE.Group();
  const leaf = v.leaf ?? "#4a8c3e";
  const leafMat = craftMaterial(leaf, { rough: 0.6 });
  leafMat.side = THREE.DoubleSide;
  const variMat = craftMaterial(shade(leaf, 1.5), { rough: 0.6 });
  variMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial(v.stem ?? "#6f8c4a", { rough: 0.8 });
  const leafGeo = heartLeafGeo(v.leafScale ?? 1);
  const vines = v.vines ?? 3 + ((Math.random() * 3) | 0);
  for (let vi = 0; vi < vines; vi++) {
    const a = (vi / vines) * Math.PI * 2 + jitter(0.5);
    // vine rises a little then trails outward and drops (over the rim)
    const reach = (v.reach ?? 0.3) + Math.random() * 0.25;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(Math.cos(a) * 0.1, 0.18, Math.sin(a) * 0.1),
      new THREE.Vector3(Math.cos(a) * reach * 0.7, 0.12, Math.sin(a) * reach * 0.7),
      new THREE.Vector3(Math.cos(a) * reach, -0.04, Math.sin(a) * reach),
    ]);
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 20, 0.006, 5),
      stemMat,
    );
    stem.castShadow = true;
    g.add(stem);
    const n = 5 + ((Math.random() * 3) | 0);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 0.5);
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const lf = new THREE.Mesh(leafGeo, Math.random() < 0.28 ? variMat : leafMat);
      lf.position.copy(p);
      const side = i % 2 ? 1 : -1;
      lf.lookAt(p.clone().add(new THREE.Vector3(side * 0.6, -0.25, tan.z + side * 0.3)));
      lf.rotateZ(jitter(0.4));
      lf.scale.setScalar(0.85 + Math.random() * 0.4);
      lf.castShadow = true;
      g.add(lf);
    }
  }
  return g;
}

// Calathea / prayer-plant leaf: a green oval with a lighter feather pattern
// down the midrib and a coloured underside.
const calatheaTextures = new Map();
function getCalatheaTexture(edge = "#b6d68a") {
  if (calatheaTextures.has(edge)) return calatheaTextures.get(edge);
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 160;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2f6b39";
  ctx.beginPath();
  ctx.ellipse(48, 80, 34, 74, 0, 0, Math.PI * 2);
  ctx.fill();
  // feathered lighter blotches alternating off the midrib
  ctx.fillStyle = edge;
  for (let i = 0; i < 7; i++) {
    const y = 20 + i * 18;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(48 + s * 15, y, 12, 7, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // darker midrib
  ctx.strokeStyle = "#24512c";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(48, 8);
  ctx.lineTo(48, 152);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  calatheaTextures.set(edge, tex);
  return tex;
}

function buildCalathea(v = {}) {
  const g = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({
    map: getCalatheaTexture(v.edge),
    transparent: false,
    alphaTest: 0.5,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const stemMat = craftMaterial("#7a5238", { rough: 0.8 });
  const leafGeo = new THREE.PlaneGeometry(0.13, 0.28, 1, 4);
  // gently cup each leaf along its length
  const lp = leafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    lp.setZ(i, lp.getZ(i) + Math.abs(lp.getX(i)) * 0.4);
  }
  leafGeo.computeVertexNormals();
  const leaves = 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.3);
    const h = 0.14 + Math.random() * 0.14;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.009, h, 5),
      stemMat,
    );
    const lean = 0.35 + Math.random() * 0.35;
    stem.position.set(Math.cos(a) * 0.03, h / 2, Math.sin(a) * 0.03);
    stem.rotation.z = -Math.cos(a) * lean;
    stem.rotation.x = Math.sin(a) * lean;
    g.add(stem);
    const leaf = new THREE.Mesh(leafGeo, topMat);
    leaf.position.set(Math.cos(a) * (0.03 + h * lean * 0.5), h + 0.11, Math.sin(a) * (0.03 + h * lean * 0.5));
    leaf.rotation.y = a + Math.PI / 2;
    leaf.rotation.x = jitter(0.3);
    leaf.rotation.z = -Math.cos(a) * lean * 0.6;
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Venus flytrap: a rosette of hinged traps, each two toothed lobes with a
// reddish inner blush.
function buildVenusFlytrap(v = {}) {
  const g = new THREE.Group();
  const outerMat = craftMaterial("#4f8a3c", { rough: 0.6 });
  const innerMat = craftMaterial(v.inner ?? "#b0402f", { rough: 0.5 });
  innerMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial("#5f7a3a", { rough: 0.8 });
  const traps = 4 + ((Math.random() * 3) | 0);
  for (let i = 0; i < traps; i++) {
    const a = (i / traps) * Math.PI * 2 + jitter(0.3);
    const h = 0.08 + Math.random() * 0.08;
    const rr = 0.04 + Math.random() * 0.03;
    const px = Math.cos(a) * rr;
    const pz = Math.sin(a) * rr;
    // flattened petiole/stem
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.014, h, 6),
      stemMat,
    );
    stem.scale.z = 0.5;
    stem.position.set(px, h / 2, pz);
    stem.rotation.z = -Math.cos(a) * 0.4;
    stem.rotation.x = Math.sin(a) * 0.4;
    g.add(stem);
    const mouth = new THREE.Group();
    mouth.position.set(px + Math.cos(a) * h * 0.3, h, pz + Math.sin(a) * h * 0.3);
    mouth.rotation.y = -a;
    const open = 0.5 + Math.random() * 0.4;
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI, 0, Math.PI / 2),
        outerMat,
      );
      lobe.scale.set(1, 0.5, 0.8);
      lobe.rotation.x = s * open - Math.PI / 2;
      lobe.position.z = 0;
      // red inner face
      const inner = new THREE.Mesh(
        new THREE.CircleGeometry(0.045, 12, 0, Math.PI),
        innerMat,
      );
      inner.rotation.x = s * open - Math.PI / 2;
      inner.position.y = 0.001 * s;
      mouth.add(lobe, inner);
      // marginal teeth (cilia)
      for (let t = 0; t <= 6; t++) {
        const ang = (t / 6) * Math.PI;
        const tooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.004, 0.03, 4),
          outerMat,
        );
        tooth.position.set(Math.cos(ang) * 0.05, 0, 0);
        tooth.rotation.z = -Math.PI / 2 + (ang - Math.PI / 2);
        const holder = new THREE.Group();
        holder.add(tooth);
        holder.rotation.x = s * open - Math.PI / 2;
        mouth.add(holder);
      }
    }
    mouth.traverse((o) => (o.castShadow = true));
    g.add(mouth);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Little creatures & figurines
// ---------------------------------------------------------------------------

// A rounded cartoon frog perched low, with domed eyes and folded legs.
function buildFrog(v = {}) {
  const g = new THREE.Group();
  const skin = v.skin ?? "#5f9c46";
  const skinMat = craftMaterial(skin, { rough: 0.5 });
  const bellyMat = craftMaterial(shade(skin, 1.4), { rough: 0.6 });
  const blackMat = craftMaterial("#141210", { rough: 0.35 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 14), skinMat);
  body.scale.set(1, 0.8, 1.05);
  body.position.y = 0.08;
  body.castShadow = true;
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bellyMat);
  belly.scale.set(1, 0.7, 0.9);
  belly.position.set(0, 0.05, 0.05);
  g.add(belly);
  // eyes bulging up from the head
  for (const s of [-1, 1]) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), skinMat);
    bump.position.set(s * 0.045, 0.15, 0.045);
    g.add(bump);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 10), craftMaterial("#e8c23a", { rough: 0.3 }));
    eye.position.set(s * 0.05, 0.165, 0.06);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 8), blackMat);
    pupil.position.set(s * 0.055, 0.168, 0.078);
    g.add(pupil);
  }
  // smiling mouth line
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.004, 6, 12, Math.PI), blackMat);
  mouth.rotation.x = Math.PI / 2 + 0.5;
  mouth.position.set(0, 0.06, 0.095);
  g.add(mouth);
  // folded front feet
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), skinMat);
    foot.scale.set(1.3, 0.5, 1);
    foot.position.set(s * 0.06, 0.02, 0.09);
    foot.castShadow = true;
    g.add(foot);
    // haunches
    const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), skinMat);
    thigh.scale.set(0.8, 0.7, 1.2);
    thigh.position.set(s * 0.09, 0.05, -0.03);
    g.add(thigh);
  }
  return g;
}

// A domed tortoise with a scute-patterned shell and stubby legs.
function buildTurtle(v = {}) {
  const g = new THREE.Group();
  const shellCol = v.shell ?? "#6f8a3c";
  const shellMat = craftMaterial(shellCol, { rough: 0.6, flat: true });
  const plateMat = craftMaterial(shade(shellCol, 0.65), { rough: 0.7, flat: true });
  const skinMat = craftMaterial(v.skin ?? "#8a9a5c", { rough: 0.7 });

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    shellMat,
  );
  shell.scale.set(1.15, 0.7, 1.4);
  shell.position.y = 0.05;
  shell.castShadow = true;
  g.add(shell);
  // scutes: a ring of raised plates plus a central one
  const centre = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), plateMat);
  centre.scale.y = 0.5;
  centre.position.y = 0.13;
  g.add(centre);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), plateMat);
    plate.scale.y = 0.4;
    plate.position.set(Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.1);
    g.add(plate);
  }
  // head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.05, 8), skinMat);
  neck.rotation.x = 1.1;
  neck.position.set(0, 0.05, 0.15);
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), skinMat);
  head.scale.z = 1.2;
  head.position.set(0, 0.06, 0.19);
  head.castShadow = true;
  g.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), craftMaterial("#141210", { rough: 0.4 }));
    eye.position.set(s * 0.014, 0.07, 0.21);
    g.add(eye);
  }
  // four stubby legs + tail
  for (const [lx, lz] of [[0.09, 0.09], [-0.09, 0.09], [0.09, -0.09], [-0.09, -0.09]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.05, 8), skinMat);
    leg.position.set(lx, 0.025, lz);
    leg.rotation.z = lx > 0 ? 0.5 : -0.5;
    leg.castShadow = true;
    g.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 6), skinMat);
  tail.rotation.x = -1.4;
  tail.position.set(0, 0.05, -0.16);
  g.add(tail);
  return g;
}

// A plump little songbird.
function buildBird(v = {}) {
  const g = new THREE.Group();
  const body = v.body ?? "#c94f3a";
  const bodyMat = craftMaterial(body, { rough: 0.6 });
  const wingMat = craftMaterial(shade(body, 0.7), { rough: 0.65 });
  const bellyMat = craftMaterial(shade(body, 1.5), { rough: 0.7 });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), bodyMat);
  torso.scale.set(1, 1.15, 1.2);
  torso.position.y = 0.09;
  torso.castShadow = true;
  g.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), bellyMat);
  belly.scale.set(1, 1, 0.7);
  belly.position.set(0, 0.07, 0.05);
  g.add(belly);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), bodyMat);
  head.position.set(0, 0.17, 0.02);
  head.castShadow = true;
  g.add(head);
  // beak
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 6), craftMaterial("#e0a02a", { rough: 0.5 }));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.17, 0.075);
  g.add(beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), craftMaterial("#141210", { rough: 0.35 }));
    eye.position.set(s * 0.022, 0.185, 0.045);
    g.add(eye);
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), wingMat);
    wing.scale.set(0.35, 0.9, 1.1);
    wing.position.set(s * 0.06, 0.09, 0);
    wing.rotation.z = s * 0.3;
    wing.castShadow = true;
    g.add(wing);
  }
  // cocked tail
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.08), wingMat);
  tail.position.set(0, 0.11, -0.08);
  tail.rotation.x = -0.6;
  tail.castShadow = true;
  g.add(tail);
  // twig legs
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 4), craftMaterial("#c8922a", { rough: 0.6 }));
    leg.position.set(s * 0.02, 0.02, 0.01);
    g.add(leg);
  }
  return g;
}

// A classic garden gnome: pointed hat, round nose, big beard.
function buildGnome(v = {}) {
  const g = new THREE.Group();
  const hatMat = craftMaterial(v.hat ?? "#c1402f", { rough: 0.75 });
  const coatMat = craftMaterial(v.coat ?? "#4a6b9c", { rough: 0.8 });
  const skinMat = craftMaterial("#e8bd96", { rough: 0.7 });
  const beardMat = craftMaterial("#efe9dd", { rough: 0.9 });
  const bootMat = craftMaterial("#5a4632", { rough: 0.85 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.16, 12), coatMat);
  body.position.y = 0.11;
  body.castShadow = true;
  g.add(body);
  for (const s of [-1, 1]) {
    const boot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), bootMat);
    boot.scale.set(0.8, 0.6, 1.2);
    boot.position.set(s * 0.035, 0.02, 0.02);
    g.add(boot);
  }
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skinMat);
  face.position.y = 0.22;
  g.add(face);
  // fat beard covering most of the face
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 12), beardMat);
  beard.position.set(0, 0.18, 0.02);
  beard.rotation.x = 0.1;
  beard.castShadow = true;
  g.add(beard);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), skinMat);
  nose.position.set(0, 0.225, 0.05);
  g.add(nose);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), craftMaterial("#2a2420", { rough: 0.4 }));
    eye.position.set(s * 0.016, 0.24, 0.044);
    g.add(eye);
  }
  // tall floppy hat
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 14), hatMat);
  hat.position.y = 0.33;
  hat.rotation.z = jitter(0.15);
  hat.castShadow = true;
  g.add(hat);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 16), hatMat);
  brim.rotation.x = Math.PI / 2;
  brim.position.y = 0.255;
  g.add(brim);
  return g;
}

// ---------------------------------------------------------------------------
// Zen / fairy-garden structures
// ---------------------------------------------------------------------------

// A Japanese torii gate — two posts, a curved top lintel and a tie beam.
function buildTorii(v = {}) {
  const g = new THREE.Group();
  const col = v.wood ? "#7a5a38" : "#c1402f";
  const mat = craftMaterial(col, { rough: 0.8 });
  const darkMat = craftMaterial(shade(col, 0.7), { rough: 0.8 });
  const w = 0.34;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.44, 10), mat);
    post.position.set(s * w * 0.5, 0.22, 0);
    post.castShadow = true;
    g.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.03, 10), darkMat);
    base.position.set(s * w * 0.5, 0.015, 0);
    g.add(base);
  }
  // top lintel (kasagi), slightly bowed and overhanging, with a dark trim below
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.035, 0.05), mat);
  lintel.position.y = 0.45;
  lintel.rotation.z = 0; // gentle upward sweep faked with end caps
  lintel.castShadow = true;
  g.add(lintel);
  for (const s of [-1, 1]) {
    const upturn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.05), mat);
    upturn.position.set(s * (w * 0.5 + 0.08), 0.462, 0);
    upturn.rotation.z = s * -0.28;
    g.add(upturn);
  }
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.02, 0.045), darkMat);
  trim.position.y = 0.425;
  g.add(trim);
  // tie beam (nuki) lower down
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.028, 0.04), mat);
  nuki.position.y = 0.37;
  nuki.castShadow = true;
  g.add(nuki);
  // central plaque
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.01), darkMat);
  plaque.position.set(0, 0.41, 0.03);
  g.add(plaque);
  return g;
}

// A tiered stone pagoda / lantern.
function buildPagoda(v = {}) {
  const g = new THREE.Group();
  const stoneMat = craftMaterial(v.stone ?? "#9a938a", { rough: 0.9, flat: true });
  const darkMat = craftMaterial("#7a746b", { rough: 0.9, flat: true });
  let y = 0;
  // base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.06, 6), stoneMat);
  base.position.y = 0.03;
  base.castShadow = true;
  g.add(base);
  y = 0.06;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.24;
    // body block
    const bodyH = 0.08 * k;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * k, 0.055 * k, bodyH, 6),
      stoneMat,
    );
    body.position.y = y + bodyH / 2;
    body.castShadow = true;
    g.add(body);
    // small window on the lowest lantern tier
    if (i === 0) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.04, 0.12),
        craftMaterial("#3a352e", { rough: 0.6 }),
      );
      win.position.y = y + bodyH / 2;
      g.add(win);
    }
    y += bodyH;
    // flared roof
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045 * k, 0.1 * k, 0.05, 6),
      darkMat,
    );
    roof.position.y = y + 0.025;
    roof.castShadow = true;
    g.add(roof);
    y += 0.05;
  }
  // finial
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), darkMat);
  finial.scale.y = 1.5;
  finial.position.y = y + 0.02;
  g.add(finial);
  return g;
}

// One run of pickets on two rails. The printed white fencing is round-topped
// and packed tight; the older garden fence is pointed and sparse.
function picketRun(mat, span, count, h, round) {
  const g = new THREE.Group();
  const t = round ? 0.014 : 0.03;
  for (const ry of [h * 0.36, h * 0.78]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(span, h * 0.09, 0.01), mat);
    rail.position.set(0, ry, 0);
    rail.castShadow = true;
    g.add(rail);
  }
  for (let i = 0; i < count; i++) {
    const x = (i / (count - 1) - 0.5) * span;
    const picket = new THREE.Mesh(new THREE.BoxGeometry(t, h, 0.012), mat);
    picket.position.set(x, h / 2, 0);
    picket.castShadow = true;
    g.add(picket);
    if (round) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(t / 2, t / 2, 0.012, 8, 1, false, 0, Math.PI), mat);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x, h, 0);
      g.add(cap);
    } else {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(t * 0.7, 0.03, 4), mat);
      cap.rotation.y = Math.PI / 4;
      cap.position.set(x, h + 0.014, 0);
      g.add(cap);
    }
  }
  return g;
}

// A picket-fence piece: one run, an L of two, or the square pen the printed
// set clips together out of four.
function buildFence(v = {}) {
  const g = new THREE.Group();
  const mat = craftMaterial(v.wood ? "#9a7548" : "#eae2d2", { rough: 0.85, flat: true });
  const round = v.round === true;
  const h = v.height ?? (round ? 0.12 : 0.22);
  // pickets spaced about two widths apart — packed any tighter the run bakes
  // down into what looks like a solid wall
  const runCount = (span) => (round ? Math.round(span / 0.03) + 1 : 5);
  if (v.pen) {
    const side = v.span ?? 0.3;
    const count = v.pickets ?? runCount(side);
    for (let i = 0; i < 4; i++) {
      const run = picketRun(mat, side, count, h, round);
      run.rotation.y = (i * Math.PI) / 2;
      run.position.set(
        i === 0 ? 0 : i === 2 ? 0 : (i === 1 ? 1 : -1) * side * 0.5,
        0,
        i === 0 ? side * 0.5 : i === 2 ? -side * 0.5 : 0,
      );
      g.add(run);
    }
    return g;
  }
  if (v.corner) {
    const side = v.span ?? 0.28;
    const count = v.pickets ?? runCount(side);
    const a = picketRun(mat, side, count, h, round);
    a.position.z = side * 0.5;
    g.add(a);
    const b = picketRun(mat, side, count, h, round);
    b.rotation.y = Math.PI / 2;
    b.position.x = -side * 0.5;
    g.add(b);
    return g;
  }
  const span = v.span ?? 0.4;
  g.add(picketRun(mat, span, v.pickets ?? runCount(span), h, round));
  return g;
}

// A little wishing well with a peaked shingled roof.
function buildWell(v = {}) {
  const g = new THREE.Group();
  const stoneMat = craftMaterial("#8f8579", { rough: 0.9, flat: true });
  const woodMat = craftMaterial("#7a5636", { rough: 0.85 });
  const roofMat = craftMaterial(v.roof ?? "#9c4636", { rough: 0.8 });

  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 14), stoneMat);
  wall.position.y = 0.06;
  wall.castShadow = true;
  g.add(wall);
  // speckled stones on the rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), stoneMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  g.add(rim);
  // dark water inside
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.088, 16),
    craftMaterial("#2c4a52", { rough: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.1;
  g.add(water);
  // two posts + crossbar + roof
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.2, 6), woodMat);
    post.position.set(s * 0.09, 0.22, 0);
    post.castShadow = true;
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 6), woodMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.3;
  g.add(bar);
  // bucket on a rope
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 4), craftMaterial("#6b6152", { rough: 0.9 }));
  rope.position.set(0.02, 0.26, 0);
  g.add(rope);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.03, 8), woodMat);
  bucket.position.set(0.02, 0.205, 0);
  bucket.castShadow = true;
  g.add(bucket);
  // peaked roof: two slanted boards
  for (const s of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.24), roofMat);
    slope.position.set(s * 0.05, 0.35, 0);
    slope.rotation.z = s * 0.6;
    slope.castShadow = true;
    g.add(slope);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Hardscape & natural bits
// ---------------------------------------------------------------------------

// A cracked-open geode: a rough stone shell lined with a druse of tiny crystals.
function buildGeode(v = {}) {
  const g = new THREE.Group();
  const rockMat = craftMaterial("#8a8177", { rough: 0.95, flat: true });
  const crystalCol = v.color ?? "#9a77c9";
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(crystalCol),
    roughness: 0.15,
    transmission: 0.5,
    thickness: 0.2,
    ior: 1.5,
    transparent: true,
    opacity: 0.92,
    clearcoat: 0.5,
    flatShading: true,
  });
  const liningMat = craftMaterial(shade(crystalCol, 1.25), { rough: 0.5, flat: true });

  // outer rock half-shell, hollow-side up and tilted toward the viewer
  const r = 0.11;
  const shellGeo = new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = shellGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (1 + jitter(0.18)), p.getY(i) * (1 + jitter(0.12)), p.getZ(i) * (1 + jitter(0.18)));
  }
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, rockMat);
  shell.rotation.x = -0.85;
  shell.position.y = r * 0.6;
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(shell);
  // pale crystalline lining just inside the mouth
  const lining = new THREE.Mesh(new THREE.SphereGeometry(r * 0.82, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), liningMat);
  lining.rotation.x = -0.85;
  lining.position.y = r * 0.62;
  g.add(lining);
  // a druse of little crystal points across the opening
  const face = new THREE.Vector3(0, Math.sin(0.85), Math.cos(0.85)).normalize();
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * r * 0.7;
    const point = new THREE.Mesh(
      new THREE.ConeGeometry(0.008 + Math.random() * 0.006, 0.02 + Math.random() * 0.02, 5),
      crystalMat,
    );
    // spread across a disc facing `face`, sitting near the rim
    const u = new THREE.Vector3(1, 0, 0);
    const w2 = new THREE.Vector3().crossVectors(face, u).normalize();
    const u2 = new THREE.Vector3().crossVectors(w2, face).normalize();
    const pos = new THREE.Vector3()
      .addScaledVector(u2, Math.cos(a) * rad)
      .addScaledVector(w2, Math.sin(a) * rad)
      .addScaledVector(face, 0.02)
      .add(new THREE.Vector3(0, r * 0.62, 0));
    point.position.copy(pos);
    point.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), face);
    point.rotation.x += jitter(0.3);
    g.add(point);
  }
  return g;
}

// A pinecone: overlapping woody scales spiralling around an ovoid core.
function buildPinecone(v = {}) {
  const g = new THREE.Group();
  const scaleMat = craftMaterial(v.wood ?? "#7a512e", { rough: 0.85, flat: true });
  const h = 0.16;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.03, h, 8), craftMaterial("#5c3d22", { rough: 0.9 }));
  core.position.y = h / 2 + 0.01;
  g.add(core);
  const scaleGeo = new THREE.ConeGeometry(0.028, 0.05, 4);
  const rows = 7;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1); // 0 bottom → 1 top
    const y = 0.02 + t * h;
    const rad = 0.055 * Math.sin(Math.PI * (0.15 + t * 0.8));
    const perRow = 7;
    for (let i = 0; i < perRow; i++) {
      const a = (i / perRow) * Math.PI * 2 + r * 0.45; // spiral offset
      const scale = new THREE.Mesh(scaleGeo, scaleMat);
      scale.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      // tip pointing outward and slightly down
      scale.rotation.order = "YXZ";
      scale.rotation.y = -a + Math.PI / 2;
      scale.rotation.z = -Math.PI / 2 + (0.4 - t * 0.7);
      scale.scale.setScalar(0.7 + t * 0.5);
      scale.castShadow = true;
      g.add(scale);
    }
  }
  return g;
}

// A mossy fallen log lying on its side, with ringed cut ends and moss on top.
function buildLog(v = {}) {
  const g = new THREE.Group();
  const barkMat = craftMaterial(v.wood ?? "#6e5236", { rough: 0.95, flat: true });
  const ringMat = craftMaterial("#b79a72", { rough: 0.9, flat: true });
  const len = 0.42;
  const r = 0.07;
  const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, len, 12), barkMat);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = jitter(0.2);
  log.position.y = r;
  log.castShadow = true;
  log.receiveShadow = true;
  g.add(log);
  // growth-ring end caps
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.98, 12), ringMat);
    cap.position.set(s * len * 0.5, r, 0);
    cap.rotation.y = s * Math.PI / 2;
    g.add(cap);
    for (let i = 1; i <= 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * i * 0.24, 0.003, 5, 14), craftMaterial("#8a6c48", { rough: 0.9 }));
      ring.position.set(s * (len * 0.5 + 0.001), r, 0);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
    }
  }
  // moss cushions along the top
  const greens = ["#5f8330", "#6f9a3a", "#557a2c"];
  for (let i = 0; i < 8; i++) {
    const mr = 0.02 + Math.random() * 0.02;
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(mr, 1),
      craftMaterial(greens[(Math.random() * greens.length) | 0], { rough: 1 }),
    );
    blob.scale.y = 0.6;
    blob.position.set(jitter(len * 0.42), r + r * 0.85, jitter(r * 0.5));
    blob.castShadow = true;
    g.add(blob);
  }
  // a couple of tiny mushrooms sprouting from the bark
  for (let i = 0; i < 2; i++) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 5), craftMaterial("#efe7d3", { rough: 0.85 }));
    const x = jitter(len * 0.3);
    stem.position.set(x, r + 0.02, 0.03);
    g.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), craftMaterial("#c96a32", { rough: 0.5 }));
    cap.scale.y = 0.7;
    cap.position.set(x, r + 0.035, 0.03);
    g.add(cap);
  }
  return g;
}

// A small still-water pool ringed with pebbles — a resin "pond" feature.
function buildPond(v = {}) {
  const g = new THREE.Group();
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(v.water ?? "#3f7d8c"),
    roughness: 0.08,
    metalness: 0,
    transmission: 0.4,
    thickness: 0.1,
    ior: 1.33,
    transparent: true,
    opacity: 0.85,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  // slightly irregular water disc
  const R = 0.16;
  const waterGeo = new THREE.CircleGeometry(R, 24);
  const wp = waterGeo.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i), z = wp.getY(i);
    const d = Math.hypot(x, z);
    if (d > 0.001) {
      const k = 1 + jitter(0.1);
      wp.setXY(i, x * k, z * k);
    }
  }
  waterGeo.computeVertexNormals();
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.012;
  water.receiveShadow = true;
  g.add(water);
  // a sandy/dark basin just under the water so it doesn't read see-through
  const basin = new THREE.Mesh(new THREE.CircleGeometry(R * 1.02, 24), craftMaterial("#4a4034", { rough: 0.9 }));
  basin.rotation.x = -Math.PI / 2;
  basin.position.y = 0.002;
  g.add(basin);
  // pebble ring around the edge
  const grays = ["#8f877b", "#9a9186", "#7d766b", "#a49b8e", "#c0a888"];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + jitter(0.15);
    const pr = 0.016 + Math.random() * 0.014;
    const geo = new THREE.IcosahedronGeometry(pr, 0);
    const pebble = new THREE.Mesh(geo, craftMaterial(grays[(Math.random() * grays.length) | 0], { rough: 0.9, flat: true }));
    const rad = R * (1.02 + Math.random() * 0.12);
    pebble.position.set(Math.cos(a) * rad, pr * 0.55, Math.sin(a) * rad);
    pebble.rotation.set(jitter(Math.PI), jitter(Math.PI), jitter(Math.PI));
    pebble.scale.y = 0.7;
    pebble.castShadow = true;
    g.add(pebble);
  }
  // a lily pad or two floating
  for (let i = 0; i < 2; i++) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.03, 10, 0.3, Math.PI * 2 - 0.6),
      craftMaterial("#4e8c48", { rough: 0.7 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(jitter(0.08), 0.014, jitter(0.08));
    g.add(pad);
  }
  return g;
}

// ---------------------------------------------------------------------------
// More cactus forms — a small desert set beyond the barrel cactus.
// ---------------------------------------------------------------------------

// Scatter pale areole spines over a mesh's surface along a set of directions.
function addSpines(group, points, mat, len = 0.03) {
  const up = new THREE.Vector3(0, 1, 0);
  for (const { pos, dir } of points) {
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.003, len, 4), mat);
    spine.position.copy(pos);
    spine.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    group.add(spine);
  }
}

// Saguaro: a tall fluted column with one or two upturned arms and a crown of
// white blossoms — the iconic desert silhouette.
function buildSaguaro(v = {}) {
  const g = new THREE.Group();
  const green = v.body ?? "#4e7d43";
  const bodyMat = craftMaterial(green, { rough: 0.8 });
  const ribMat = craftMaterial(shade(green, 0.82), { rough: 0.85 });
  const spineMat = craftMaterial("#e8dcc0", { rough: 0.9 });

  const H = 0.46 + Math.random() * 0.16;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.072, H, 14), bodyMat);
  col.position.y = H / 2;
  col.castShadow = true;
  g.add(col);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.058, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    bodyMat,
  );
  crown.position.y = H;
  g.add(crown);
  // vertical rib flutes
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, H * 0.96, 5), ribMat);
    rib.position.set(Math.cos(a) * 0.062, H / 2, Math.sin(a) * 0.062);
    g.add(rib);
  }

  // arms: horizontal elbow then a rising column with a rounded tip
  const arms = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < arms; i++) {
    const s = i === 0 ? 1 : -1;
    const armY = H * (0.45 + Math.random() * 0.15);
    const elbowX = s * 0.14;
    const armH = 0.14 + Math.random() * 0.1;
    const horiz = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.13, 10), bodyMat);
    horiz.rotation.z = Math.PI / 2;
    horiz.position.set(s * 0.08, armY, 0);
    g.add(horiz);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), bodyMat);
    elbow.position.set(elbowX, armY, 0);
    g.add(elbow);
    const vert = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, armH, 10), bodyMat);
    vert.position.set(elbowX, armY + armH / 2, 0);
    vert.castShadow = true;
    g.add(vert);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      bodyMat,
    );
    tip.position.set(elbowX, armY + armH, 0);
    g.add(tip);
  }

  // sparse spines along the ribs
  const pts = [];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = Math.random() * H;
    const r = 0.066;
    pts.push({
      pos: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
    });
  }
  addSpines(g, pts, spineMat, 0.022);

  // crown of blossoms
  if (v.bloom !== null) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 6),
        craftMaterial(v.bloom ?? "#f2ead8", { rough: 0.6 }),
      );
      flower.scale.y = 0.5;
      flower.position.set(Math.cos(a) * 0.03, H + 0.03, Math.sin(a) * 0.03);
      g.add(flower);
    }
  }
  return g;
}

// Prickly pear (Opuntia): flat oval pads budding off one another, dotted with
// spine clusters and topped with a couple of blooms.
function buildPricklyPear(v = {}) {
  const g = new THREE.Group();
  const green = v.body ?? "#5f9c4e";
  const padMat = craftMaterial(green, { rough: 0.72 });
  const spineMat = craftMaterial("#efe6cf", { rough: 0.9 });

  function pad(x, y, tilt, scale) {
    const p = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), padMat);
    mesh.scale.set(0.86, 1.15, 0.3);
    mesh.castShadow = true;
    p.add(mesh);
    // areole dots across both faces
    const dots = [];
    for (let i = 0; i < 16; i++) {
      const u = (Math.random() - 0.5) * 0.16;
      const w = (Math.random() * 0.9 - 0.1) * 0.22;
      const face = Math.random() < 0.5 ? 1 : -1;
      dots.push({
        pos: new THREE.Vector3(u, w + 0.02, face * 0.03),
        dir: new THREE.Vector3(u * 2, 0.5, face),
      });
    }
    addSpines(p, dots, spineMat, 0.02);
    p.position.set(x, y, 0);
    p.rotation.z = tilt;
    p.scale.setScalar(scale);
    return p;
  }

  const base = pad(0, 0.11, 0, 1);
  g.add(base);
  const left = pad(-0.08, 0.24, 0.5, 0.72);
  g.add(left);
  const right = pad(0.09, 0.26, -0.4, 0.8);
  g.add(right);
  if (Math.random() < 0.6) g.add(pad(0.02, 0.36, 0.1, 0.55));

  // blooms on the upper pad rims
  if (v.bloom !== null) {
    const bloomMat = craftMaterial(v.bloom ?? "#e8b23a", { rough: 0.6 });
    for (const [bx, by] of [[0.12, 0.34], [-0.02, 0.4]]) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), bloomMat);
      bloom.scale.y = 0.7;
      bloom.position.set(bx, by, 0.02);
      g.add(bloom);
    }
  }
  return g;
}

// Pincushion (Mammillaria): a low cluster of round tuberculed globes ringed
// with fine spines and a crown of tiny pink flowers.
function buildPincushion(v = {}) {
  const g = new THREE.Group();
  const green = v.body ?? "#5c8a56";
  const bodyMat = craftMaterial(green, { rough: 0.75 });
  const spineMat = craftMaterial("#f0e8d4", { rough: 0.9 });
  const globes = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < globes; i++) {
    const a = (i / globes) * Math.PI * 2;
    const rr = i === 0 ? 0 : 0.05 + Math.random() * 0.02;
    const R = 0.055 + Math.random() * 0.03;
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 14, 12), bodyMat);
    globe.scale.y = 0.85;
    globe.position.set(cx, R * 0.8, cz);
    globe.castShadow = true;
    g.add(globe);
    // tubercles: little bumps in a spiral, each with a spine tuft
    const spts = [];
    for (let j = 0; j < 22; j++) {
      const t = Math.acos(1 - 2 * ((j + 0.5) / 22));
      const ph = j * 2.399;
      const dir = new THREE.Vector3(
        Math.sin(t) * Math.cos(ph),
        Math.cos(t),
        Math.sin(t) * Math.sin(ph),
      );
      const pos = dir.clone().multiplyScalar(R).add(new THREE.Vector3(cx, R * 0.8, cz));
      const bump = new THREE.Mesh(new THREE.SphereGeometry(R * 0.13, 6, 5), bodyMat);
      bump.position.copy(pos);
      g.add(bump);
      spts.push({ pos, dir });
    }
    addSpines(g, spts, spineMat, R * 0.32);
    // flower crown on the biggest globe
    if (i === 0 && v.bloom !== null) {
      for (let f = 0; f < 6; f++) {
        const fa = (f / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(
          new THREE.SphereGeometry(0.012, 6, 5),
          craftMaterial(v.bloom ?? "#e277a2", { rough: 0.6 }),
        );
        petal.scale.set(0.6, 0.4, 1.3);
        petal.position.set(cx + Math.cos(fa) * 0.02, R * 1.5, cz + Math.sin(fa) * 0.02);
        g.add(petal);
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Grow lights — the lamps hobbyists pair with terrariums. Each casts a real
// point light plus an emissive lens so it reads as glowing at any mood.
// ---------------------------------------------------------------------------

function metalMaterial(hex = "#3a3d42") {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.45,
    metalness: 0.5,
  });
}
function lampGlowMaterial(hex) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    emissive: new THREE.Color(hex),
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });
}

// Clip-on flexible gooseneck LED — a clamp at the base, a wavy neck and a small
// downlit disc head. The signature terrarium desk light.
function buildClipLight(v = {}) {
  const g = new THREE.Group();
  const metal = metalMaterial(v.metal ?? "#33363b");
  const glow = v.glow ?? 0xfff0d0;

  // spring clamp
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.13), metal);
  clamp.position.y = 0.03;
  clamp.castShadow = true;
  g.add(clamp);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.05), metal);
  jaw.position.set(0, 0.062, 0.05);
  g.add(jaw);

  // gooseneck: an S-curved tube climbing up and reaching forward
  const head = new THREE.Vector3(0.11, 0.44, 0.02);
  const neck = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(-0.03, 0.2, 0.02),
    new THREE.Vector3(0.04, 0.34, 0.0),
    head.clone(),
  ]);
  const neckMesh = new THREE.Mesh(new THREE.TubeGeometry(neck, 20, 0.012, 6), metal);
  neckMesh.castShadow = true;
  g.add(neckMesh);

  // disc head tilted to point down at the plants
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.025, 18), metal);
  shell.position.copy(head);
  shell.rotation.x = 0.9;
  shell.castShadow = true;
  g.add(shell);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.046, 18), lampGlowMaterial(glow));
  lens.position.copy(head).add(new THREE.Vector3(0, -0.012, 0.016));
  lens.rotation.x = 0.9 - Math.PI / 2;
  g.add(lens);

  const light = new THREE.PointLight(glow, 0.7, 1.8, 2);
  light.position.copy(head).add(new THREE.Vector3(0, -0.06, 0.04));
  g.add(light);
  return g;
}

// LED bar on two slim legs — a small grow-light rack straddling the terrarium.
function buildStripLight(v = {}) {
  const g = new THREE.Group();
  const metal = metalMaterial(v.metal ?? "#3a3d42");
  const glow = v.glow ?? 0xf4f6ff;
  const span = 0.44;
  const H = 0.42;
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, H, 8), metal);
    leg.position.set(s * span * 0.5, H / 2, 0);
    leg.castShadow = true;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.012, 10), metal);
    foot.position.set(s * span * 0.5, 0.006, 0);
    g.add(foot);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(span + 0.06, 0.04, 0.07), metal);
  bar.position.y = H;
  bar.castShadow = true;
  g.add(bar);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(span - 0.02, 0.012, 0.05), lampGlowMaterial(glow));
  strip.position.y = H - 0.024;
  g.add(strip);
  const light = new THREE.PointLight(glow, 0.7, 1.8, 2);
  light.position.set(0, H - 0.1, 0);
  g.add(light);
  return g;
}

// Cantilevered wooden-frame lamp — a warm LED strip tucked under a wooden arm
// reaching over the terrarium, like the display lamp in the reference video.
function buildFrameLight(v = {}) {
  const g = new THREE.Group();
  const woodMat = craftMaterial(v.wood ?? "#a9793f", { rough: 0.7 });
  const glow = v.glow ?? 0xffcf8a;
  const postH = 0.44;
  const reach = 0.34;

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.14), woodMat);
  base.position.y = 0.015;
  base.castShadow = true;
  g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.045, postH, 0.05), woodMat);
  post.position.set(-reach * 0.5, postH / 2, 0);
  post.castShadow = true;
  g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(reach + 0.05, 0.045, 0.05), woodMat);
  arm.position.set(-reach * 0.5 + reach * 0.5, postH, 0);
  arm.castShadow = true;
  g.add(arm);
  // warm LED strip on the underside of the arm
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(reach - 0.02, 0.01, 0.03),
    lampGlowMaterial(glow),
  );
  strip.position.set(0, postH - 0.028, 0);
  g.add(strip);
  const light = new THREE.PointLight(glow, 0.8, 1.6, 2);
  light.position.set(0.02, postH - 0.12, 0);
  g.add(light);
  return g;
}

// Halo ring light on a slim stand — an even, shadow-free glow ring.
function buildRingLight(v = {}) {
  const g = new THREE.Group();
  const metal = metalMaterial(v.metal ?? "#3a3d42");
  const glow = v.glow ?? 0xffffff;
  const standH = 0.3;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.02, 16), metal);
  base.position.y = 0.01;
  g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, standH, 8), metal);
  pole.position.y = standH / 2;
  pole.castShadow = true;
  g.add(pole);
  const ringR = 0.13;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.016, 10, 32), metal);
  ring.position.y = standH + ringR;
  ring.rotation.x = 0.35;
  ring.castShadow = true;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.008, 8, 32), lampGlowMaterial(glow));
  inner.position.y = standH + ringR;
  inner.rotation.x = 0.35;
  inner.position.z = 0.012;
  g.add(inner);
  const light = new THREE.PointLight(glow, 0.6, 1.6, 2);
  light.position.set(0, standH + ringR, 0.1);
  g.add(light);
  return g;
}

// ---------------------------------------------------------------------------
// Species pack
// ---------------------------------------------------------------------------
// The plants, mosses and clean-up crew from the reference photos. Several
// species share one builder on purpose: an aquatic stem is an aquatic stem
// whether the label reads Rotala or Ludwigia. So the *kind* carries the genus
// (which is what a person searches for) and the variant carries that species'
// colour, leaf form and proportions.

// Painters author in a 128×128 box; the canvas is bigger and scaled to match,
// so vein work and leaf margins stay crisp when a leaf fills the frame without
// every outline needing its coordinates rewritten.
const TEX_DESIGN = 128;
const TEX_SIZE = 256;
const speciesTex = new Map();
function speciesTexture(key, paint) {
  if (speciesTex.has(key)) return speciesTex.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = TEX_SIZE;
  const ctx = c.getContext("2d");
  ctx.scale(TEX_SIZE / TEX_DESIGN, TEX_SIZE / TEX_DESIGN);
  paint(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  speciesTex.set(key, tex);
  return tex;
}

// A blade cut out of its own painted silhouette. This is how an arrow-shaped
// Alocasia leaf or a lobed ivy leaf gets a real outline without paying for the
// geometry — the same trick the Fittonia leaves already use.
function paintedLeafMaterial(key, paint) {
  return new THREE.MeshStandardMaterial({
    map: speciesTexture(key, paint),
    transparent: false,
    alphaTest: 0.5,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
}

// Outlines are drawn in a 128×128 box with the tip at the top and the petiole
// joint at the bottom centre, matching a plane whose bottom edge meets a stem.
function lanceOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.bezierCurveTo(104, 44, 100, 100, 64, 124);
  ctx.bezierCurveTo(28, 100, 24, 44, 64, 4);
  ctx.closePath();
}
// A broad heart with two rounded basal lobes flanking a notch, which is where
// the petiole meets it — the Anthurium silhouette.
function heartOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(64, 6);
  ctx.bezierCurveTo(104, 22, 126, 64, 108, 98);
  ctx.bezierCurveTo(98, 116, 78, 122, 68, 106);
  ctx.lineTo(64, 96); // the notch
  ctx.lineTo(60, 106);
  ctx.bezierCurveTo(50, 122, 30, 116, 20, 98);
  ctx.bezierCurveTo(2, 64, 24, 22, 64, 6);
  ctx.closePath();
}
// Narrower, with the basal lobes drawn out into backward points.
function arrowOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.bezierCurveTo(88, 32, 102, 70, 98, 102);
  ctx.bezierCurveTo(96, 118, 88, 126, 82, 122);
  ctx.bezierCurveTo(74, 114, 68, 102, 66, 90);
  ctx.lineTo(64, 86);
  ctx.lineTo(62, 90);
  ctx.bezierCurveTo(60, 102, 54, 114, 46, 122);
  ctx.bezierCurveTo(40, 126, 32, 118, 30, 102);
  ctx.bezierCurveTo(26, 70, 40, 32, 64, 4);
  ctx.closePath();
}
// Ivy / Xanadu: five lobes — a long central one, a pair thrown up and out, a
// pair at the base — all tapering back to the petiole at the bottom point.
function lobedOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(64, 6); // tip of the central lobe
  ctx.quadraticCurveTo(70, 34, 74, 44); // down into the first sinus
  ctx.quadraticCurveTo(88, 30, 104, 34); // out to the upper lobe
  ctx.quadraticCurveTo(96, 56, 88, 66); // back into the second sinus
  ctx.quadraticCurveTo(106, 74, 112, 92); // out to the basal lobe
  ctx.quadraticCurveTo(88, 106, 64, 124); // in to the petiole
  ctx.quadraticCurveTo(40, 106, 16, 92);
  ctx.quadraticCurveTo(22, 74, 40, 66);
  ctx.quadraticCurveTo(32, 56, 24, 34);
  ctx.quadraticCurveTo(40, 30, 54, 44);
  ctx.quadraticCurveTo(58, 34, 64, 6);
  ctx.closePath();
}

// Pale veins radiating out of the base of the blade. Palmate rather than a
// herringbone ladder: parallel rungs read as a fern frond at icon size, which
// is exactly the wrong plant.
function paintVeins(ctx, color, width = 2.4, pairs = 4) {
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(64, 100);
  ctx.lineTo(64, 14);
  ctx.stroke();
  ctx.lineWidth = width * 0.75;
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1); // how far up the blade this vein reaches
    const endY = 100 - t * 82;
    const endX = 30 + (1 - t) * 20;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64, 100);
      ctx.quadraticCurveTo(64 + s * endX * 0.75, endY + 24, 64 + s * endX, endY);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Aquatic stem plants: Rotala, Ludwigia, Bacopa, Hygrophila, Cabomba and the
// rest of the stem rack. `form` is what actually separates them at this scale —
// paired oval leaves, feathery whorls, or fine needles.
function buildStemPlant(v = {}) {
  const g = new THREE.Group();
  const form = v.form ?? "opposite";
  const stemMat = craftMaterial(v.stem ?? "#5d7f3a", { rough: 0.82 });
  const cols = v.colors ?? ["#4f8c3e", "#5f9c4a"];
  const mats = cols.map((c) => {
    const m = craftMaterial(c, { rough: 0.68 });
    m.side = THREE.DoubleSide;
    return m;
  });
  const count = v.stems ?? 4 + ((Math.random() * 3) | 0);
  const scale = v.leafScale ?? 1;

  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.055, 0.02, 0.062, 0.1, 0, 0.145);
  leafShape.bezierCurveTo(-0.062, 0.1, -0.055, 0.02, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 8);
  const lp = leafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++)
    lp.setZ(i, lp.getZ(i) + Math.sin(lp.getY(i) * 9) * 0.013);
  leafGeo.computeVertexNormals();
  const needleGeo = new THREE.ConeGeometry(0.007, 0.1, 4);
  const up = new THREE.Vector3(0, 1, 0);

  for (let s = 0; s < count; s++) {
    const stalk = new THREE.Group();
    const h = (v.height ?? 0.4) * (0.72 + Math.random() * 0.55);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.011, h, 6),
      stemMat,
    );
    stem.position.y = h / 2;
    stem.castShadow = true;
    stalk.add(stem);

    const nodes = Math.max(3, Math.round(h / 0.055));
    for (let n = 1; n <= nodes; n++) {
      const y = (n / (nodes + 0.5)) * h;
      const grow = (0.5 + (n / nodes) * 0.5) * scale; // small at the base
      if (form === "opposite") {
        const twist = n * (Math.PI / 2) + jitter(0.2);
        for (const side of [0, Math.PI]) {
          const leaf = new THREE.Mesh(leafGeo, mats[n % mats.length]);
          leaf.position.y = y;
          leaf.rotation.set(-1.1 + jitter(0.25), twist + side, 0);
          leaf.scale.setScalar(grow);
          leaf.castShadow = true;
          stalk.add(leaf);
        }
      } else {
        // A whorl of fine leaves ringing the node — Cabomba, Myriophyllum,
        // Ambulia and Rotala Vietnam all read this way underwater.
        const arms = form === "needle" ? 9 : 7;
        const droop = form === "needle" ? 0.3 : 0.85;
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2 + n * 0.55;
          const dir = new THREE.Vector3(
            Math.cos(a),
            droop,
            Math.sin(a),
          ).normalize();
          const needle = new THREE.Mesh(needleGeo, mats[i % mats.length]);
          needle.quaternion.setFromUnitVectors(up, dir);
          needle.position.copy(dir).multiplyScalar(0.055 * grow);
          needle.position.y += y;
          needle.scale.setScalar(grow);
          stalk.add(needle);
        }
      }
    }
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * 0.1;
    stalk.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    stalk.rotation.z = jitter(0.16);
    stalk.rotation.x = jitter(0.16);
    g.add(stalk);
  }
  return g;
}

// Rosette aquatics that grow from a crown rather than a stem: sword plants,
// Cryptocoryne, dwarf sagittaria, water wisteria.
function buildAquaticRosette(v = {}) {
  const g = new THREE.Group();
  const cols = v.colors ?? ["#4a8c3e", "#5aa04a"];
  const mats = cols.map((c) => {
    const m = craftMaterial(c, { rough: 0.66 });
    m.side = THREE.DoubleSide;
    return m;
  });
  const leaves = v.leaves ?? 8 + ((Math.random() * 4) | 0);
  const len = v.len ?? 0.32;
  const wide = v.strap ? 0.3 : 1;

  // A spoon blade, widest past the middle, on a short petiole.
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.018 * wide, 0.1, 0.062 * wide, 0.5, 0.03 * wide, 0.9);
  shape.bezierCurveTo(0.014 * wide, 1.0, -0.014 * wide, 1.0, -0.03 * wide, 0.9);
  shape.bezierCurveTo(-0.062 * wide, 0.5, -0.018 * wide, 0.1, 0, 0);
  const geo = new THREE.ShapeGeometry(shape, 12);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // arch the blade over so the rosette flares instead of standing rigid
    p.setY(i, y * len);
    p.setZ(i, p.getZ(i) + y * y * (v.arch ?? 0.12));
    p.setX(i, p.getX(i) * len * 2.2);
  }
  geo.computeVertexNormals();

  for (let i = 0; i < leaves; i++) {
    const leaf = new THREE.Mesh(geo, mats[i % mats.length]);
    const a = (i / leaves) * Math.PI * 2 + jitter(0.28);
    const lean = (v.lean ?? 0.42) + Math.random() * 0.3;
    leaf.rotation.set(-lean, a, 0);
    leaf.scale.setScalar(0.75 + Math.random() * 0.45);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Creeping / floating round leaves on runners: Hydrocotyle and water poppy.
function buildFloatLeaf(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#5aa348", { rough: 0.62 });
  leafMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial(v.stem ?? "#6f8f46", { rough: 0.82 });
  const discGeo = new THREE.CircleGeometry(v.r ?? 0.055, 14);
  const pads = v.pads ?? 12 + ((Math.random() * 6) | 0);

  for (let i = 0; i < pads; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.6) * 0.2;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const h = 0.035 + Math.random() * 0.07;
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.006, h, 5),
      stemMat,
    );
    stalk.position.set(x, h / 2, z);
    stalk.rotation.z = jitter(0.25);
    g.add(stalk);

    const pad = new THREE.Mesh(discGeo, leafMat);
    pad.position.set(x, h, z);
    pad.rotation.set(-Math.PI / 2 + jitter(0.3), 0, jitter(0.4));
    pad.scale.setScalar(0.7 + Math.random() * 0.6);
    pad.castShadow = true;
    g.add(pad);
  }

  // Water poppy earns its name from the three-petal yellow cup.
  if (v.bloom) {
    const petalMat = craftMaterial(v.bloom, { rough: 0.6 });
    petalMat.side = THREE.DoubleSide;
    for (let b = 0; b < 2; b++) {
      const bx = jitter(0.1);
      const bz = jitter(0.1);
      const by = 0.13 + Math.random() * 0.04;
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, by, 5),
        stemMat,
      );
      stalk.position.set(bx, by / 2, bz);
      g.add(stalk);
      for (let i = 0; i < 3; i++) {
        const petal = new THREE.Mesh(new THREE.CircleGeometry(0.032, 8), petalMat);
        const a = (i / 3) * Math.PI * 2;
        petal.position.set(bx + Math.cos(a) * 0.018, by, bz + Math.sin(a) * 0.018);
        petal.rotation.set(-Math.PI / 2 + 0.4, 0, 0);
        petal.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
        g.add(petal);
      }
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 8, 6),
        craftMaterial("#8a6a22", { rough: 0.7 }),
      );
      eye.position.set(bx, by + 0.008, bz);
      g.add(eye);
    }
  }
  return g;
}

// The named terrestrial mosses. They differ by growth habit far more than by
// colour, so `form` does the real work: a tight cushion, star rosettes,
// feathery fronds, or tufts all combed one way.
function buildSpeciesMoss(v = {}) {
  const g = new THREE.Group();
  const cols = v.colors ?? ["#5f8330", "#6f9a3a", "#7faa4a", "#557a2c"];
  const mats = cols.map((c) => craftMaterial(c, { rough: 1.0 }));
  const pick = () => mats[(Math.random() * mats.length) | 0];
  const form = v.form ?? "cushion";
  const spread = v.spread ?? 0.18;

  if (form === "cushion") {
    return naturalMoss({ colors: cols, radius: spread, count: 190, dome: 0.07 });
  }

  if (form === "star") {
    // Tortula / Atrichum: rosettes of pointed leaves, like tiny stars. `rise`
    // is what separates them — a tight upright star, or the wide open one
    // smoothcap makes, each rosette carried clear of the mat on a short stalk.
    const leafLen = v.leafLen ?? 0.038;
    const leafWidth = v.leafWidth ?? 0.007;
    const perStar = v.leaves ?? 7;
    const rise = v.rise ?? 0.85;
    const stalkH = v.stalk ?? 0;
    const geo = new THREE.ConeGeometry(leafWidth, leafLen, 4);
    const up = new THREE.Vector3(0, 1, 0);
    const rosettes = v.rosettes ?? 16 + ((Math.random() * 8) | 0);
    // A carpet is a lot of little leaves, so each rosette is merged down to a
    // single mesh — the draw call count follows the plants, not the leaves.
    const leaf = new THREE.Object3D();
    for (let r = 0; r < rosettes; r++) {
      const a0 = Math.random() * Math.PI * 2;
      const rr = Math.pow(Math.random(), 0.6) * spread;
      const cx = Math.cos(a0) * rr;
      const cz = Math.sin(a0) * rr;
      const cy = 0.02 + Math.random() * 0.02 + stalkH * (0.7 + Math.random() * 0.5);
      const parts = [];
      if (stalkH > 0) {
        parts.push(
          new THREE.CylinderGeometry(0.003, 0.004, cy, 4).translate(cx, cy / 2, cz),
        );
      }
      for (let i = 0; i < perStar; i++) {
        const a = (i / perStar) * Math.PI * 2 + a0;
        const dir = new THREE.Vector3(Math.cos(a), rise, Math.sin(a)).normalize();
        leaf.quaternion.setFromUnitVectors(up, dir);
        leaf.position.set(cx, cy, cz).addScaledVector(dir, leafLen * 0.42);
        leaf.updateMatrix();
        parts.push(geo.clone().applyMatrix4(leaf.matrix));
      }
      const m = new THREE.Mesh(mergeGeometries(parts), pick());
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }

  // "frond" and "fork" are both shoots, one feathery and one combed flat.
  // `needle` swaps the flat leaflets for spikes, which is what turns a shoot
  // into a broom fork tuft; `tip` frosts the top of each one pale.
  const combed = form === "fork";
  const shoots = v.shoots ?? 26 + ((Math.random() * 12) | 0);
  const lean = Math.random() * Math.PI * 2; // fork moss all leans one way
  const needle = v.needle === true;
  const leafLen = v.leafLen ?? 0.026;
  const tipMat = v.tip ? craftMaterial(v.tip, { rough: 1.0 }) : null;
  const leafletGeo = needle
    ? new THREE.ConeGeometry(0.0038, leafLen, 4).translate(0, leafLen / 2, 0)
    : new THREE.PlaneGeometry(leafLen, 0.008);
  const steps = v.steps ?? 7;
  // Each shoot merges into one mesh (two when it has pale tips), so a dense
  // mat stays cheap however many leaflets it takes to close the gaps.
  const lf = new THREE.Object3D();
  for (let s = 0; s < shoots; s++) {
    const shoot = new THREE.Group();
    const len = (v.shootLen ?? 0.09) + Math.random() * (v.shootVary ?? 0.07);
    const mat = pick();
    mat.side = THREE.DoubleSide;
    const body = [
      new THREE.CylinderGeometry(0.0035, 0.0045, len, 4).translate(0, len / 2, 0),
    ];
    const tips = [];
    for (let i = 1; i <= steps; i++) {
      const y = (i / steps) * len;
      const size = combed ? 1 : (1 - i / steps) * 0.7 + 0.5;
      for (const side of [-1, 1]) {
        lf.position.set(side * 0.012 * size, y, 0);
        if (needle) lf.rotation.set(-0.55 + jitter(0.15), 0, side * (0.7 + jitter(0.2)));
        else lf.rotation.set(combed ? -0.9 : -0.35, 0, side * (combed ? 0.9 : 0.4));
        lf.scale.setScalar(size);
        lf.updateMatrix();
        (tipMat && i === steps ? tips : body).push(
          leafletGeo.clone().applyMatrix4(lf.matrix),
        );
      }
    }
    if (needle) {
      // The apex closes in a few upright spikes, pale like the rest of the tip.
      for (let i = 0; i < 3; i++) {
        lf.position.set(0, len, 0);
        lf.rotation.set(jitter(0.3), 0, jitter(0.3));
        lf.scale.setScalar(0.8);
        lf.updateMatrix();
        (tipMat ? tips : body).push(leafletGeo.clone().applyMatrix4(lf.matrix));
      }
    }
    shoot.add(new THREE.Mesh(mergeGeometries(body), mat));
    if (tips.length) shoot.add(new THREE.Mesh(mergeGeometries(tips), tipMat));
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.6) * spread;
    shoot.position.set(Math.cos(a) * rr, 0.01, Math.sin(a) * rr);
    shoot.rotation.y = combed ? lean + jitter(0.3) : Math.random() * Math.PI * 2;
    shoot.rotation.x = combed ? 0.5 + jitter(0.2) : jitter(0.35);
    g.add(shoot);
  }
  return g;
}

// Aglaonema: an upright clump of lance leaves, and the whole point of the
// genus is the paint job — speckles, blush, and a coloured midrib.
function buildBroadLeaf(v = {}) {
  const g = new THREE.Group();
  const base = v.leaf ?? "#3f7a3c";
  const mark = v.mark ?? "#c8dba0";
  const midrib = v.midrib ?? "#e0798f";
  const key = `broad:${base}:${mark}:${midrib}:${v.speckle ?? 1}`;
  const mat = paintedLeafMaterial(key, (ctx) => {
    lanceOutline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    // Splashes of the variegation colour, densest along the veins.
    const blotches = 90 * (v.speckle ?? 1);
    ctx.fillStyle = mark;
    for (let i = 0; i < blotches; i++) {
      const x = 64 + (Math.random() - 0.5) * 108;
      const y = Math.random() * 128;
      const r = 2 + Math.random() * 7;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.5 + Math.random()), Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
    // The midrib is the loud part of an Aglaonema; the laterals only hint.
    ctx.strokeStyle = midrib;
    ctx.lineCap = "round";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(64, 124);
    ctx.lineTo(64, 8);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const y = 20 + i * 17;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(64, y + 8);
        ctx.quadraticCurveTo(64 + s * 24, y, 64 + s * 40, y - 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  const stemMat = craftMaterial(v.stem ?? "#587a3f", { rough: 0.82 });
  const blade = new THREE.PlaneGeometry(0.17, 0.24, 4, 7);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const t = (bp.getY(i) + 0.12) / 0.24;
    bp.setZ(i, t * t * 0.042 + Math.abs(bp.getX(i)) * 0.18);
  }
  blade.computeVertexNormals();
  const leaves = v.leaves ?? 7 + ((Math.random() * 4) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.3);
    const h = 0.1 + Math.random() * 0.12;
    const out = 0.03 + Math.random() * 0.05;
    const petiole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.008, h, 5),
      stemMat,
    );
    petiole.position.set(Math.cos(a) * out * 0.5, h / 2, Math.sin(a) * out * 0.5);
    petiole.rotation.z = -Math.cos(a) * 0.3;
    petiole.rotation.x = Math.sin(a) * 0.3;
    g.add(petiole);

    const leaf = new THREE.Mesh(blade, mat);
    const sc = 0.8 + Math.random() * 0.45;
    leaf.scale.setScalar(sc);
    leaf.position.set(Math.cos(a) * out, h + 0.1 * sc, Math.sin(a) * out);
    leaf.rotation.set(-0.5 - Math.random() * 0.35, -a + Math.PI / 2, 0);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// The velvet-leaved aroids — Anthurium, Alocasia, Philodendron. Same skeleton
// of petioles from a crown; the blade outline and the vein colour tell them
// apart, which is exactly how you tell them apart on a nursery bench.
function buildVeinedAroid(v = {}) {
  const g = new THREE.Group();
  const shape = v.shape ?? "heart";
  const base = v.leaf ?? "#2f5c33";
  const vein = v.vein ?? "#cfe0c2";
  const outline =
    shape === "arrow" ? arrowOutline : shape === "lobed" ? lobedOutline : heartOutline;
  const mat = paintedLeafMaterial(`aroid:${shape}:${base}:${vein}:${v.edge ?? ""}`, (ctx) => {
    outline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    // A darker wash toward the margin gives the blade some depth.
    const grad = ctx.createRadialGradient(64, 64, 10, 64, 64, 72);
    grad.addColorStop(0, "rgba(255,255,255,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    paintVeins(ctx, vein, v.veinWidth ?? 2.6, v.veinPairs ?? 5);
    ctx.restore();
    if (v.edge) {
      ctx.strokeStyle = v.edge;
      ctx.lineWidth = 3;
      outline(ctx);
      ctx.stroke();
    }
  });

  const stemMat = craftMaterial(v.stem ?? "#4e6b39", { rough: 0.8 });
  const blade = new THREE.PlaneGeometry(0.2, 0.22);
  const leaves = v.leaves ?? 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.35);
    const h = (v.stalk ?? 0.16) * (0.7 + Math.random() * 0.6);
    const out = 0.05 + Math.random() * 0.06;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(a) * out * 0.3, h * 0.7, Math.sin(a) * out * 0.3),
      new THREE.Vector3(Math.cos(a) * out, h, Math.sin(a) * out),
    );
    const petiole = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 8, 0.007, 5),
      stemMat,
    );
    petiole.castShadow = true;
    g.add(petiole);

    const leaf = new THREE.Mesh(blade, mat);
    const sc = 0.85 + Math.random() * 0.4;
    leaf.scale.setScalar(sc);
    leaf.position.set(Math.cos(a) * (out + 0.02), h + 0.09 * sc, Math.sin(a) * (out + 0.02));
    leaf.rotation.set(-0.75 - Math.random() * 0.4, -a + Math.PI / 2, 0);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Haworthia: a tight rosette of stiff triangular leaves with pale banding,
// and a yellow sector when the plant is variegated.
function buildHaworthia(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#4a6b3c", { rough: 0.55 });
  const bandMat = craftMaterial(v.band ?? "#cfd8b4", { rough: 0.6 });
  const varieMat = v.variegated
    ? craftMaterial(v.variegated, { rough: 0.55 })
    : null;
  const up = new THREE.Vector3(0, 1, 0);
  const rings = [
    { n: 5, r: 0.02, up: 2.2, len: 0.2, w: 0.028 },
    { n: 7, r: 0.05, up: 1.1, len: 0.19, w: 0.032 },
    { n: 9, r: 0.09, up: 0.45, len: 0.16, w: 0.032 },
  ];
  // One continuous wedge of the rosette goes yellow, the way variegation runs.
  const varieFrom = Math.random() * Math.PI * 2;
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2 + ri * 0.4;
      const inWedge =
        varieMat && Math.abs(((a - varieFrom + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 2.2;
      const dir = new THREE.Vector3(Math.cos(a), ring.up, Math.sin(a)).normalize();
      const leaf = new THREE.Mesh(
        new THREE.ConeGeometry(ring.w, ring.len, 3),
        inWedge ? varieMat : leafMat,
      );
      leaf.quaternion.setFromUnitVectors(up, dir);
      leaf.position.copy(dir).multiplyScalar(ring.r + ring.len * 0.42);
      leaf.position.y += 0.02;
      leaf.castShadow = true;
      g.add(leaf);

      // pale cross-bands up the back of each leaf
      if (!inWedge) {
        for (let b = 1; b <= 3; b++) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(ring.w * 0.2, 6, 4),
            bandMat,
          );
          dot.position
            .copy(dir)
            .multiplyScalar(ring.r + ring.len * (0.2 + b * 0.22));
          dot.position.y += 0.02;
          dot.scale.set(1.8, 0.5, 1);
          g.add(dot);
        }
      }
    }
  });
  return g;
}

// Variegated English ivy: trailing stems that spill sideways rather than
// standing up, with cream-edged lobed leaves.
function buildIvy(v = {}) {
  const g = new THREE.Group();
  const mat = paintedLeafMaterial(`ivy:${v.leaf ?? "#3f7a3e"}:${v.edge ?? "#e6e6c8"}`, (ctx) => {
    lobedOutline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = v.leaf ?? "#3f7a3e";
    ctx.fillRect(0, 0, 128, 128);
    // Cream marbling crowding the margin — kept to a thin band and small
    // blotches, or it swallows the lobes that make the leaf an ivy leaf.
    ctx.fillStyle = v.edge ?? "#e6e6c8";
    for (let i = 0; i < 44; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = 42 + Math.random() * 16;
      ctx.beginPath();
      ctx.ellipse(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr, 3 + Math.random() * 4, 3 + Math.random() * 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
    paintVeins(ctx, "rgba(255,255,255,0.5)", 2, 3);
    ctx.restore();
  });
  const stemMat = craftMaterial(v.stem ?? "#6b5a3a", { rough: 0.85 });
  const blade = new THREE.PlaneGeometry(0.13, 0.13);

  const runners = 4 + ((Math.random() * 3) | 0);
  for (let r = 0; r < runners; r++) {
    const a0 = (r / runners) * Math.PI * 2 + jitter(0.4);
    const len = 0.2 + Math.random() * 0.14;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.06, 0),
      new THREE.Vector3(Math.cos(a0) * len * 0.5, 0.12, Math.sin(a0) * len * 0.5),
      new THREE.Vector3(Math.cos(a0) * len, 0.015, Math.sin(a0) * len),
    );
    const runner = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 12, 0.005, 5),
      stemMat,
    );
    g.add(runner);
    const n = 4;
    for (let i = 1; i <= n; i++) {
      const pos = curve.getPoint(i / (n + 0.4));
      const leaf = new THREE.Mesh(blade, mat);
      leaf.position.copy(pos);
      leaf.position.y += 0.025;
      leaf.rotation.set(-1.2 + jitter(0.4), a0 + jitter(0.5), jitter(0.3));
      leaf.scale.setScalar(0.75 + Math.random() * 0.45);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  return g;
}

// Nerite snail — the algae crew. A domed spiral with painted bands, a soft
// foot underneath and two eye stalks out front.
function buildNerite(v = {}) {
  const g = new THREE.Group();
  const shellMat = craftMaterial(v.shell ?? "#6b5433", { rough: 0.5 });
  const bandMat = craftMaterial(v.band ?? "#22190f", { rough: 0.55 });
  const bodyMat = craftMaterial(v.body ?? "#b8a389", { rough: 0.8 });
  const R = v.size ?? 0.055;

  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 12), shellMat);
  shell.scale.set(1.15, 0.78, 1);
  shell.position.y = R * 0.72;
  shell.castShadow = true;
  g.add(shell);

  // The tiger's stripes: thin arcs wrapped around the whorl.
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(R * (0.35 + t * 0.72), R * 0.045, 5, 14, Math.PI * 1.5),
      bandMat,
    );
    band.rotation.x = Math.PI / 2;
    band.rotation.z = t * 5.2;
    band.position.y = R * (1.02 - t * 0.42);
    band.scale.set(1.15, 1, 1);
    g.add(band);
  }
  // the apex of the spiral, tucked to one side
  const apex = new THREE.Mesh(new THREE.SphereGeometry(R * 0.34, 10, 8), shellMat);
  apex.position.set(-R * 0.42, R * 1.02, R * 0.1);
  g.add(apex);

  const foot = new THREE.Mesh(new THREE.SphereGeometry(R * 0.9, 12, 8), bodyMat);
  foot.scale.set(1.25, 0.3, 0.85);
  foot.position.set(R * 0.12, R * 0.14, 0);
  g.add(foot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(R * 0.34, 10, 8), bodyMat);
  head.scale.set(1.3, 0.7, 0.9);
  head.position.set(R * 1.05, R * 0.16, 0);
  g.add(head);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.004, R * 0.7, 4),
      bodyMat,
    );
    horn.position.set(R * 1.2, R * 0.42, s * R * 0.2);
    horn.rotation.z = -0.7;
    horn.rotation.x = s * 0.25;
    g.add(horn);
  }
  return g;
}

// Cherry shrimp — a comma of a body with a tail fan and long antennae.
function buildShrimp(v = {}) {
  const g = new THREE.Group();
  const bodyMat = craftMaterial(v.body ?? "#c2402f", { rough: 0.62 });
  const legMat = craftMaterial(v.legs ?? "#d98a76", { rough: 0.8 });
  const L = v.size ?? 0.11;

  // Segments walked along an arc, thickest at the shoulder.
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-L * 0.5, L * 0.16, 0),
    new THREE.Vector3(0, L * 0.34, 0),
    new THREE.Vector3(L * 0.5, L * 0.1, 0),
  );
  const segs = 7;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = L * (0.16 - Math.abs(t - 0.32) * 0.13);
    const seg = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r, L * 0.035), 10, 8), bodyMat);
    seg.position.copy(curve.getPoint(t));
    seg.scale.set(1, 0.95, 1.15);
    seg.castShadow = true;
    g.add(seg);
  }
  // tail fan
  const fanMat = craftMaterial(v.body ?? "#c2402f", { rough: 0.6 });
  fanMat.side = THREE.DoubleSide;
  for (let i = -1; i <= 1; i++) {
    const fan = new THREE.Mesh(new THREE.CircleGeometry(L * 0.16, 6), fanMat);
    fan.position.copy(curve.getPoint(1));
    fan.position.x += L * 0.12;
    fan.rotation.set(Math.PI / 2, 0, 0);
    fan.rotation.y = i * 0.5;
    g.add(fan);
  }
  // legs and antennae
  for (let i = 0; i < 5; i++) {
    const t = 0.18 + i * 0.12;
    const p = curve.getPoint(t);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002, 0.002, L * 0.22, 4),
        legMat,
      );
      leg.position.set(p.x, p.y - L * 0.1, p.z + s * L * 0.06);
      leg.rotation.x = s * 0.6;
      g.add(leg);
    }
  }
  for (const s of [-1, 1]) {
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0018, L * 0.7, 4),
      legMat,
    );
    ant.position.set(-L * 0.8, L * 0.3, s * L * 0.05);
    ant.rotation.z = 1.25;
    ant.rotation.y = s * 0.3;
    g.add(ant);
  }
  return g;
}

// ---------------------------------------------------------------------------
// The printed hardscape set
// ---------------------------------------------------------------------------
// The resin and FDM miniatures people actually buy for a terrarium: fairy
// cottages, temple halls, ruins and reptile hides. These read as buildings
// rather than plants, so they model to a ~0.45 footprint and share a handful of
// roof/masonry helpers instead of repeating the same slab maths ten times.

// Two slanted slabs meeting at a ridge, with the eaves hanging past the wall.
function gableRoof(mat, w, d, h, thick = 0.016) {
  const g = new THREE.Group();
  const a = Math.atan2(h, d / 2);
  const len = Math.hypot(d / 2, h) * 1.12;
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, thick, len), mat);
    panel.position.set(0, h / 2, (s * d) / 4);
    panel.rotation.x = s * a;
    panel.castShadow = true;
    g.add(panel);
  }
  return g;
}

// The tiled hip roof every East-Asian hall in this set wears: a shallow
// pyramid, a deep overhang, and four corner tips swept up off the eave line.
function flaredRoof(mat, w, d, h) {
  const g = new THREE.Group();
  const eave = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), mat);
  eave.position.y = 0.006;
  eave.castShadow = true;
  g.add(eave);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, h, 4), mat);
  cap.rotation.y = Math.PI / 4;
  cap.scale.set((w * 0.92) / 0.707, 1, (d * 0.92) / 0.707);
  cap.position.y = 0.012 + h / 2;
  cap.castShadow = true;
  g.add(cap);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.014, 0.02), mat);
  ridge.position.y = 0.012 + h;
  g.add(ridge);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), mat);
      tip.position.set(sx * w * 0.47, 0.02, sz * d * 0.47);
      tip.rotation.set(sz * -0.9, 0, sx * 0.9);
      g.add(tip);
    }
  }
  return g;
}

// Darker recessed bands so a plain block reads as coursed stone.
function courseLines(g, mat, w, h, d, rows) {
  for (let i = 1; i < rows; i++) {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.005, 0.006, d * 1.005),
      mat,
    );
    line.position.y = (i / rows) * h;
    g.add(line);
  }
}

// A scatter of tumbled blocks — every ruin in this set sheds some.
function rubble(g, mat, count, spread, size = 0.03) {
  for (let i = 0; i < count; i++) {
    const s = size * (0.5 + Math.random());
    const block = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s * 0.8), mat);
    const a = Math.random() * Math.PI * 2;
    const r = spread * (0.55 + Math.random() * 0.6);
    block.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
    block.rotation.set(jitter(0.5), Math.random() * Math.PI, jitter(0.5));
    block.castShadow = true;
    g.add(block);
  }
}

// A limb segment drawn between two points, so the joints of a figurine
// actually meet instead of each bone being posed by eye.
function bone(mat, a, b, r) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, dir.length(), 6), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  m.castShadow = true;
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A round display plinth — the printed cottages all come mounted on one.
function plinth(mat, r, h = 0.022) {
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.03, h, 24), mat);
  disc.position.y = h / 2;
  disc.receiveShadow = true;
  return disc;
}

// A round-topped door slab, used by nearly every cottage here.
function archDoor(mat, w, h) {
  const g = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), mat);
  leaf.position.y = h / 2;
  g.add(leaf);
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(w / 2, w / 2, 0.012, 12, 1, false, 0, Math.PI),
    mat,
  );
  top.rotation.x = Math.PI / 2;
  top.position.y = h;
  g.add(top);
  return g;
}

// A cross-barred window pane with a bright glow behind it.
function panedWindow(frameMat, r) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(r, 12),
    craftMaterial("#f2d089", { rough: 0.4 }),
  );
  g.add(glass);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.13, 5, 14), frameMat);
  g.add(ring);
  for (let i = 0; i < 2; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(r * 2, r * 0.16, r * 0.16),
      frameMat,
    );
    bar.rotation.z = (i * Math.PI) / 2;
    g.add(bar);
  }
  g.position.z = 0.002;
  return g;
}

// A gnarled bare branch — the twisted trees leaning over the witch cottages.
function twistBranch(mat, h, forks = 3) {
  const g = new THREE.Group();
  const pts = [new THREE.Vector3(0, 0, 0)];
  for (let i = 1; i <= 5; i++) {
    pts.push(new THREE.Vector3(Math.sin(i * 1.3) * h * 0.14, (i / 5) * h, Math.cos(i * 0.9) * h * 0.1));
  }
  const trunk = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, h * 0.045, 6),
    mat,
  );
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < forks; i++) {
    const base = pts[2 + (i % 3)];
    const dir = new THREE.Vector3(Math.sin(i * 2.1), 0.9, Math.cos(i * 2.1)).normalize();
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          base,
          base.clone().addScaledVector(dir, h * 0.2),
          base.clone().addScaledVector(dir, h * 0.34).setY(base.y + h * 0.3),
        ),
        8,
        h * 0.022,
        5,
      ),
      mat,
    );
    g.add(arm);
  }
  return g;
}

// The mushroom bridge: an arched plank walk with cut-stump posts, vines over
// the handrail and toadstools crowding both abutments.
function buildMushroomBridge(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#b5854e", { rough: 0.9, flat: true });
  const dark = craftMaterial(v.dark ?? "#96693a", { rough: 0.9, flat: true });
  const span = 0.52;
  const rise = 0.14;
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.19), i % 2 ? wood : dark);
    plank.position.set((t - 0.5) * span, rise * Math.sin(t * Math.PI) + 0.03, 0);
    plank.rotation.z = -Math.cos(t * Math.PI) * 0.5;
    plank.castShadow = true;
    g.add(plank);
  }
  // cut stumps for posts — flat tops, growing taller towards the crown
  for (const side of [-1, 1]) {
    for (const t of [0.06, 0.3, 0.5, 0.7, 0.94]) {
      const y = rise * Math.sin(t * Math.PI) + 0.03;
      const h = 0.1 + Math.sin(t * Math.PI) * 0.05;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, h, 8), wood);
      post.position.set((t - 0.5) * span, y + h / 2, side * 0.1);
      post.castShadow = true;
      g.add(post);
    }
    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-span * 0.46, 0.12, side * 0.1),
          new THREE.Vector3(0, 0.15 + rise, side * 0.1),
          new THREE.Vector3(span * 0.46, 0.12, side * 0.1),
        ),
        14,
        0.009,
        5,
      ),
      dark,
    );
    g.add(rail);
  }
  // stone abutments, then toadstools crowding them
  for (const end of [-1, 1]) {
    const bank = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 7), dark);
    bank.scale.set(1, 0.34, 1.1);
    bank.position.set(end * span * 0.52, 0.01, 0);
    g.add(bank);
    for (let i = 0; i < 7; i++) {
      const capR = 0.022 + Math.random() * 0.014;
      const h = 0.03 + Math.random() * 0.02;
      const x = end * span * (0.46 + Math.random() * 0.16);
      const z = jitter(0.12);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 6), wood);
      stalk.position.set(x, h / 2 + 0.01, z);
      g.add(stalk);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(capR, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        wood,
      );
      cap.scale.y = 0.55;
      cap.position.set(x, h + 0.01, z);
      cap.castShadow = true;
      g.add(cap);
    }
  }
  return g;
}

// The rope-and-plank bridge set: the same walkway flat or arched, slung
// between four lashed posts.
function buildRopeBridge(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#9a9188", { rough: 0.95, flat: true });
  const dark = craftMaterial(v.dark ?? "#7d746b", { rough: 0.95, flat: true });
  const arch = v.arch === true;
  const span = 0.46;
  const rise = arch ? 0.1 : 0;
  const planks = 13;
  for (let i = 0; i < planks; i++) {
    const t = i / (planks - 1);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.011, 0.17), i % 2 ? wood : dark);
    plank.position.set((t - 0.5) * span, rise * Math.sin(t * Math.PI) + 0.09, 0);
    if (arch) plank.rotation.z = -Math.cos(t * Math.PI) * 0.42;
    plank.castShadow = true;
    g.add(plank);
  }
  // legs under the deck, or stone piles under an arch
  for (const end of [-1, 1]) {
    if (arch) {
      const pile = new THREE.Mesh(new THREE.SphereGeometry(0.06, 9, 6), dark);
      pile.scale.set(1, 0.55, 1.2);
      pile.position.set(end * span * 0.48, 0.03, 0);
      g.add(pile);
    } else {
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.09, 6), dark);
        leg.position.set(end * span * 0.34, 0.045, side * 0.06);
        g.add(leg);
      }
    }
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.13, 8), wood);
      post.position.set(end * span * 0.46, 0.14 + rise * 0.15, side * 0.085);
      post.castShadow = true;
      g.add(post);
      // the lashing ring at the top of each post
      const knot = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 5, 10), dark);
      knot.rotation.x = Math.PI / 2;
      knot.position.set(end * span * 0.46, 0.185 + rise * 0.15, side * 0.085);
      g.add(knot);
    }
  }
  // the rope sags between the posts, one strand each side
  for (const side of [-1, 1]) {
    const rope = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-span * 0.46, 0.2, side * 0.085),
          new THREE.Vector3(0, arch ? 0.24 : 0.15, side * 0.085),
          new THREE.Vector3(span * 0.46, 0.2, side * 0.085),
        ),
        14,
        0.006,
        5,
      ),
      dark,
    );
    g.add(rope);
  }
  return g;
}

// The crooked cottage: a leaning house under a swooping roof, with a stacked
// chimney spire and dead trees clawing over it.
function buildCrookedCottage(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#6f6a63", { rough: 0.95 });
  const roofMat = craftMaterial(v.roof ?? "#5c5750", { rough: 0.9, flat: true });
  const woodMat = craftMaterial(v.wood ?? "#4e4a44", { rough: 0.95 });
  g.add(plinth(craftMaterial(v.base ?? "#57534d", { rough: 1.0 }), 0.21));

  const house = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.15), wall);
  body.position.y = 0.12;
  body.castShadow = true;
  house.add(body);
  // the roof is oversized and hangs past the walls, but not so far that it
  // swallows the house under it
  const roof = gableRoof(roofMat, 0.26, 0.21, 0.12, 0.02);
  roof.position.y = 0.225;
  roof.rotation.y = 0.12;
  house.add(roof);
  // a spire of shrinking discs where a chimney would be
  for (let i = 0; i < 5; i++) {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026 - i * 0.005, 0.03 - i * 0.005, 0.016, 10),
      roofMat,
    );
    disc.position.set(0.02, 0.35 + i * 0.022, -0.01);
    house.add(disc);
  }
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 8), roofMat);
  spike.position.set(0.02, 0.47, -0.01);
  house.add(spike);
  const door = archDoor(woodMat, 0.055, 0.075);
  door.position.set(-0.01, 0.015, 0.077);
  house.add(door);
  const win = panedWindow(woodMat, 0.024);
  win.position.set(0.035, 0.15, 0.077);
  house.add(win);
  house.rotation.z = -0.06;
  house.position.y = 0.02;
  g.add(house);

  const branchMat = craftMaterial(v.wood ?? "#4e4a44", { rough: 0.95 });
  for (const [x, z, h, r] of [[-0.14, 0.02, 0.4, 0.4], [0.15, -0.04, 0.32, -1.1]]) {
    const tree = twistBranch(branchMat, h, 3);
    tree.position.set(x, 0.02, z);
    tree.rotation.y = r;
    g.add(tree);
  }
  return g;
}

// The half-timbered house — one builder for the whole street: `storeys` sets
// the height, `dormers` puts eyes in the roof, `barrels` stands casks outside.
function buildTudorHouse(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#8a8b8e", { rough: 0.92 });
  const beam = craftMaterial(v.beam ?? "#55565a", { rough: 0.95, flat: true });
  const roofMat = craftMaterial(v.roof ?? "#7b7c80", { rough: 0.9, flat: true });
  const storeys = v.storeys ?? 2;
  const W = 0.2;
  const D = 0.16;
  const floorH = 0.085;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W * 1.6, 0.018, D * 1.7), beam);
  base.position.y = 0.009;
  base.receiveShadow = true;
  g.add(base);

  for (let s = 0; s < storeys; s++) {
    // each floor juts a little further out than the one below it
    const k = 1 + s * 0.07;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W * k, floorH, D * k), wall);
    floor.position.y = 0.018 + floorH * (s + 0.5);
    floor.castShadow = true;
    g.add(floor);
    // timber frame: a sill, a head and a few uprights on the long faces
    for (const y of [0.018 + floorH * s + 0.006, 0.018 + floorH * (s + 1) - 0.006]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(W * k * 1.02, 0.012, D * k * 1.02), beam);
      band.position.y = y;
      g.add(band);
    }
    for (let i = 0; i < 4; i++) {
      const x = (i / 3 - 0.5) * W * k * 0.9;
      const stud = new THREE.Mesh(new THREE.BoxGeometry(0.012, floorH, D * k * 1.01), beam);
      stud.position.set(x, 0.018 + floorH * (s + 0.5), 0);
      g.add(stud);
    }
    // windows facing front
    for (const x of [-W * 0.28, W * 0.28]) {
      const winPane = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.036, 0.006),
        craftMaterial("#4a4b4f", { rough: 0.6 }),
      );
      winPane.position.set(x, 0.018 + floorH * (s + 0.55), (D * k) / 2 + 0.002);
      g.add(winPane);
    }
  }
  const eaveY = 0.018 + floorH * storeys;
  const roofH = 0.11;
  const roof = gableRoof(roofMat, W * 1.2, D * 1.35, roofH, 0.018);
  roof.position.y = eaveY;
  g.add(roof);
  // ridge tiles
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W * 1.2, 8), roofMat);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = eaveY + roofH;
  g.add(ridge);
  const door = archDoor(beam, 0.045, 0.06);
  door.position.set(0, 0.018, D / 2 + 0.004);
  g.add(door);

  for (const cx of v.chimneys ?? [-W * 0.3, W * 0.34]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.1, 0.034), wall);
    stack.position.set(cx, eaveY + roofH * 0.55, 0);
    stack.castShadow = true;
    g.add(stack);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.012, 0.042), beam);
    cap.position.set(cx, eaveY + roofH * 0.55 + 0.056, 0);
    g.add(cap);
  }
  if (v.dormers) {
    for (const x of [-0.045, 0.045]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.05), roofMat);
      box.position.set(x, eaveY + 0.045, D * 0.35);
      g.add(box);
      const hood = new THREE.Mesh(
        new THREE.CylinderGeometry(0.026, 0.026, 0.05, 10, 1, false, 0, Math.PI),
        roofMat,
      );
      hood.rotation.set(Math.PI / 2, 0, 0);
      hood.position.set(x, eaveY + 0.062, D * 0.35);
      g.add(hood);
    }
  }
  if (v.barrels) {
    for (const x of [-W * 0.62, W * 0.62]) {
      const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.05, 12), beam);
      cask.position.set(x, 0.043, jitter(0.03));
      cask.castShadow = true;
      g.add(cask);
    }
  }
  return g;
}

// The snail-shell house: a big spiral shell with a cottage tucked under its lip.
function buildShellHouse(v = {}) {
  const g = new THREE.Group();
  const shellMat = craftMaterial(v.shell ?? "#a9a49b", { rough: 0.75 });
  const wall = craftMaterial(v.wall ?? "#9a958c", { rough: 0.92 });
  const woodMat = craftMaterial(v.wood ?? "#7d776d", { rough: 0.95 });
  g.add(plinth(craftMaterial(v.base ?? "#8f8a81", { rough: 1.0 }), 0.2));

  // shell: a fat whorl of shrinking spheres winding up to a point
  const turns = 11;
  for (let i = 0; i < turns; i++) {
    const t = i / (turns - 1);
    const r = 0.085 * (1 - t * 0.82);
    const a = t * Math.PI * 2.6;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), shellMat);
    bead.position.set(-0.06 + Math.cos(a) * 0.035 * (1 - t), 0.09 + t * 0.17, Math.sin(a) * 0.035 * (1 - t));
    bead.castShadow = true;
    g.add(bead);
  }
  const port = panedWindow(shellMat, 0.032);
  port.position.set(-0.028, 0.13, 0.075);
  port.rotation.y = 0.3;
  g.add(port);

  // the cottage half, lower and to one side
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.1), wall);
  body.position.set(0.1, 0.075, 0.01);
  body.castShadow = true;
  g.add(body);
  const roof = gableRoof(craftMaterial(v.roof ?? "#8d887f", { rough: 0.9, flat: true }), 0.15, 0.13, 0.05, 0.014);
  roof.position.set(0.1, 0.13, 0.01);
  roof.rotation.y = Math.PI / 2;
  g.add(roof);
  const door = archDoor(woodMat, 0.04, 0.055);
  door.position.set(0.1, 0.02, 0.062);
  g.add(door);
  // barnacle clusters at the foot of the shell
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.014, 8), shellMat);
    b.position.set(-0.09 + jitter(0.06), 0.028, 0.04 + jitter(0.05));
    g.add(b);
  }
  return g;
}

// The log cabin: stacked round logs with a mossy thatch and a stump chimney.
function buildLogCabin(v = {}) {
  const g = new THREE.Group();
  const logMat = craftMaterial(v.wood ?? "#c9bfae", { rough: 0.95, flat: true });
  const dark = craftMaterial(v.dark ?? "#a89e8d", { rough: 0.95 });
  const W = 0.2;
  const D = 0.17;
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const y = 0.018 + i * 0.03;
    for (const s of [-1, 1]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, D, 8), logMat);
      log.rotation.x = Math.PI / 2;
      log.position.set(s * W * 0.5, y, 0);
      log.castShadow = true;
      g.add(log);
    }
    // the back wall only — the front is left open for the door face
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, W, 8), logMat);
    back.rotation.z = Math.PI / 2;
    back.position.set(0, y, -D / 2);
    g.add(back);
  }
  // front face with a round-topped door and two gable windows
  const face = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.19, 0.014), dark);
  face.position.set(0, 0.105, D / 2);
  g.add(face);
  const door = archDoor(logMat, 0.06, 0.09);
  door.position.set(-0.01, 0.014, D / 2 + 0.009);
  g.add(door);
  for (const [x, y] of [[-0.02, 0.14], [0.055, 0.075]]) {
    const win = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.03, 3), logMat);
    win.rotation.x = Math.PI / 2;
    win.position.set(x, y, D / 2 + 0.009);
    g.add(win);
  }
  // thatched roof: fine straws laid over the top
  const straw = craftMaterial(v.thatch ?? "#d5cbb8", { rough: 1.0 });
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, D * 1.15, 4), straw);
    s.rotation.x = Math.PI / 2 + jitter(0.06);
    s.position.set((Math.random() - 0.5) * W * 0.95, 0.2 + jitter(0.006), jitter(0.01));
    g.add(s);
  }
  // the trunk growing out of the roof, cut off ragged
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.16, 9), logMat);
  trunk.position.set(-0.04, 0.28, -0.03);
  trunk.rotation.z = 0.14;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 4), logMat);
    shard.position.set(-0.04 + Math.cos(a) * 0.022, 0.375, -0.03 + Math.sin(a) * 0.022);
    shard.rotation.set(jitter(0.3), 0, jitter(0.3));
    g.add(shard);
  }
  const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.09, 6), logMat);
  limb.position.set(-0.09, 0.32, -0.03);
  limb.rotation.z = 1.15;
  g.add(limb);
  return g;
}

// The toadstool cottage: a barrel of a house under two overhanging caps, with a
// long crooked spire, a balcony and a mailbox.
function buildMushroomHouse(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#a29c92", { rough: 0.92 });
  const capMat = craftMaterial(v.cap ?? "#968f85", { rough: 0.85 });
  const woodMat = craftMaterial(v.wood ?? "#857e74", { rough: 0.95 });
  g.add(plinth(craftMaterial(v.base ?? "#8d877d", { rough: 1.0 }), 0.22));

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.15, 16), wall);
  body.position.y = 0.095;
  body.castShadow = true;
  g.add(body);
  // the big skirted cap over the ground floor
  const cap1 = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    capMat,
  );
  cap1.scale.y = 0.42;
  cap1.position.y = 0.17;
  cap1.castShadow = true;
  g.add(cap1);
  // upper room, smaller cap, then the spire leaning off true
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.1, 14), wall);
  upper.position.y = 0.23;
  upper.castShadow = true;
  g.add(upper);
  const cap2 = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    capMat,
  );
  cap2.scale.y = 0.5;
  cap2.position.y = 0.28;
  g.add(cap2);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.19, 14), capMat);
  spire.position.set(0.012, 0.38, -0.006);
  spire.rotation.z = -0.1;
  spire.castShadow = true;
  g.add(spire);
  // shingle rings up the spire
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042 - i * 0.009, 0.005, 5, 14), capMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.012, 0.32 + i * 0.04, -0.006);
    g.add(ring);
  }
  const door = archDoor(woodMat, 0.055, 0.075);
  door.position.set(0, 0.02, 0.108);
  g.add(door);
  for (const [x, y, z, r] of [[-0.062, 0.11, 0.085, -0.6], [0.07, 0.1, 0.078, 0.7], [0.0, 0.25, 0.07, 0]]) {
    const win = panedWindow(woodMat, 0.019);
    win.position.set(x, y, z);
    win.rotation.y = r;
    g.add(win);
  }
  // balcony off the upper room
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 5, 14, Math.PI), woodMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(-0.03, 0.225, 0.05);
  rail.rotation.z = 0.6;
  g.add(rail);
  // mailbox on a post
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 6), woodMat);
  post.position.set(-0.14, 0.04, 0.05);
  g.add(post);
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10, 1, false, 0, Math.PI), woodMat);
  box.rotation.z = Math.PI / 2;
  box.position.set(-0.14, 0.09, 0.05);
  g.add(box);
  return g;
}

// The dome cottage: a smooth acorn shell of a roof with a brick stair, a stubby
// chimney and a lollipop tree leaning in.
function buildDomeCottage(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#a49d92", { rough: 0.9 });
  const roofMat = craftMaterial(v.roof ?? "#989186", { rough: 0.85 });
  const stone = craftMaterial(v.stone ?? "#8e887d", { rough: 0.95 });
  g.add(plinth(craftMaterial(v.base ?? "#918a80", { rough: 1.0 }), 0.22));

  // a straight-walled drum, with the dome resting on top rather than over it
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.108, 0.11, 16), wall);
  body.position.y = 0.075;
  body.castShadow = true;
  g.add(body);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    roofMat,
  );
  dome.scale.y = 0.95;
  dome.position.y = 0.13;
  dome.castShadow = true;
  g.add(dome);
  // ribs down the dome
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.004, 5, 16, Math.PI), roofMat);
    rib.rotation.y = (i / 6) * Math.PI;
    rib.position.y = 0.13;
    rib.scale.y = 0.95;
    g.add(rib);
  }
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.09, 10), roofMat);
  stack.position.set(0.03, 0.27, -0.02);
  g.add(stack);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.03, 10), roofMat);
  hat.position.set(0.03, 0.33, -0.02);
  g.add(hat);
  const door = archDoor(craftMaterial(v.wood ?? "#877f74", { rough: 0.95 }), 0.05, 0.07);
  door.position.set(0, 0.035, 0.104);
  g.add(door);
  const win = panedWindow(roofMat, 0.02);
  win.position.set(0.072, 0.085, 0.072);
  win.rotation.y = 0.78;
  g.add(win);
  // brick steps up to the door
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.07 + i * 0.008, 0.012, 0.022), stone);
    step.position.set(0, 0.033 - i * 0.012, 0.112 + i * 0.021);
    g.add(step);
  }
  // the lollipop tree: three fat blobs on a bent trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, 0.16, 7), craftMaterial(v.wood ?? "#877f74", { rough: 0.95 }));
  trunk.position.set(-0.15, 0.09, 0.02);
  trunk.rotation.z = 0.16;
  g.add(trunk);
  for (const [dx, dy, r] of [[-0.03, 0.19, 0.045], [0.02, 0.21, 0.04], [-0.005, 0.24, 0.036]]) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), roofMat);
    blob.position.set(-0.15 + dx, dy, 0.02);
    blob.castShadow = true;
    g.add(blob);
  }
  // shrubs banked against the walls
  for (let i = 0; i < 9; i++) {
    const a = 2.2 + (i / 9) * 2.6;
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.022 + Math.random() * 0.012, 9, 7), roofMat);
    bush.position.set(Math.cos(a) * 0.12, 0.03, Math.sin(a) * 0.12);
    g.add(bush);
  }
  return g;
}

// The witch-hat house: a stone drum under a floppy pointed hat, with a bare
// branch over it and a cat sitting on the brim.
function buildWitchHat(v = {}) {
  const g = new THREE.Group();
  const stone = craftMaterial(v.wall ?? "#e6e2da", { rough: 0.95, flat: true });
  const hatMat = craftMaterial(v.hat ?? "#dcd7ce", { rough: 0.9 });
  g.add(plinth(craftMaterial(v.base ?? "#d8d3ca", { rough: 1.0 }), 0.16));

  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.105, 0.17, 14), stone);
  drum.position.y = 0.105;
  drum.castShadow = true;
  g.add(drum);
  // the drum is round, so its courses are rings rather than the box bands the
  // rectangular buildings use
  for (let i = 1; i < 5; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.098 + i * 0.002, 0.004, 5, 18),
      craftMaterial("#cfcac1", { rough: 0.95 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03 + i * 0.037;
    g.add(ring);
  }
  const door = archDoor(craftMaterial(v.wood ?? "#cdc7be", { rough: 0.95 }), 0.05, 0.07);
  door.position.set(0, 0.02, 0.1);
  g.add(door);

  // the hat: a wide brim, then a stack of shrinking discs curling over
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.014, 20), hatMat);
  brim.position.y = 0.2;
  brim.rotation.z = 0.1;
  brim.castShadow = true;
  g.add(brim);
  let hx = 0;
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    hx += 0.008 * t;
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085 * (1 - t * 0.88), 0.095 * (1 - t * 0.8), 0.03, 14),
      hatMat,
    );
    seg.position.set(hx, 0.22 + i * 0.028, -0.004 * i);
    seg.rotation.z = -0.13 * t;
    seg.castShadow = true;
    g.add(seg);
  }
  const branch = twistBranch(craftMaterial(v.wood ?? "#dedad2", { rough: 0.95 }), 0.34, 3);
  branch.position.set(-0.14, 0.02, 0.03);
  branch.rotation.y = 0.5;
  g.add(branch);
  // the cat: a loaf, a head, two ears and an arched tail
  const cat = new THREE.Group();
  const catMat = craftMaterial(v.hat ?? "#dcd7ce", { rough: 0.9 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), catMat);
  torso.scale.set(1.5, 0.9, 0.8);
  cat.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), catMat);
  head.position.set(0.032, 0.018, 0);
  cat.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.012, 4), catMat);
    ear.position.set(0.032, 0.03, s * 0.007);
    cat.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 5, 12, Math.PI * 1.1), catMat);
  tail.position.set(-0.035, 0.012, 0);
  tail.rotation.set(Math.PI / 2, 0, -0.6);
  cat.add(tail);
  cat.position.set(-0.075, 0.245, 0.03);
  cat.rotation.y = -0.5;
  g.add(cat);
  return g;
}

// The spiral tower: a tapering keep with a staircase winding all the way up to
// a shingled cone and two little turrets.
function buildSpiralTower(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#cfc8ba", { rough: 0.92 });
  const roofMat = craftMaterial(v.roof ?? "#c4bcae", { rough: 0.88 });
  const H = 0.46;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.08, H, 16), wall);
  tower.position.y = H / 2;
  tower.castShadow = true;
  g.add(tower);
  // the stair: steps marching around the outside on a rising helix
  const steps = 46;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = t * Math.PI * 3.4;
    const r = 0.08 - t * 0.022;
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.022), roofMat);
    step.position.set(Math.cos(a) * (r + 0.022), 0.02 + t * (H - 0.06), Math.sin(a) * (r + 0.022));
    step.rotation.y = -a;
    step.castShadow = true;
    g.add(step);
    if (i % 3 === 0) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.008), roofMat);
      rail.position.set(Math.cos(a) * (r + 0.042), 0.035 + t * (H - 0.06), Math.sin(a) * (r + 0.042));
      g.add(rail);
    }
  }
  for (const [y, a] of [[0.1, 0.4], [0.22, 2.4], [0.34, 4.2], [0.4, 1.2]]) {
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.036, 0.01),
      craftMaterial(v.wood ?? "#b5ac9e", { rough: 0.8 }),
    );
    const r = 0.078 - (y / H) * 0.02;
    win.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    win.lookAt(Math.cos(a) * 0.4, y, Math.sin(a) * 0.4);
    g.add(win);
  }
  // a corbelled ring of blocks, then the roof cone and its turrets
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), roofMat);
    block.position.set(Math.cos(a) * 0.072, H, Math.sin(a) * 0.072);
    g.add(block);
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 14), roofMat);
  cone.position.y = H + 0.085;
  cone.castShadow = true;
  g.add(cone);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058 - i * 0.011, 0.005, 5, 14), roofMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = H + 0.03 + i * 0.026;
    g.add(ring);
  }
  for (const a of [0.8, 3.9]) {
    const turret = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), roofMat);
    turret.position.set(Math.cos(a) * 0.062, H + 0.045, Math.sin(a) * 0.062);
    g.add(turret);
  }
  return g;
}

// A stone chapel: a nave with a steep roof and a bell tower under a tall spire.
function buildChapel(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#ded7cb", { rough: 0.95, flat: true });
  const roofMat = craftMaterial(v.roof ?? "#cfc7ba", { rough: 0.9, flat: true });
  const woodMat = craftMaterial(v.wood ?? "#c3bbae", { rough: 0.95 });
  const W = 0.19;
  const D = 0.15;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, D), wall);
  nave.position.y = 0.07;
  nave.castShadow = true;
  g.add(nave);
  courseLines(g, craftMaterial("#cdc5b8", { rough: 0.95 }), W, 0.14, D, 5);
  const roof = gableRoof(roofMat, W * 1.15, D * 1.25, 0.11, 0.016);
  roof.position.y = 0.14;
  g.add(roof);
  // porch gable over the door, set at right angles to the nave
  const porch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.06), wall);
  porch.position.set(0.045, 0.055, D * 0.55);
  g.add(porch);
  const porchRoof = gableRoof(roofMat, 0.075, 0.09, 0.05, 0.012);
  porchRoof.rotation.y = Math.PI / 2;
  porchRoof.position.set(0.045, 0.11, D * 0.55);
  g.add(porchRoof);
  const door = archDoor(woodMat, 0.04, 0.06);
  door.position.set(0.045, 0.005, D * 0.55 + 0.032);
  g.add(door);
  for (const [x, z] of [[-0.06, D / 2], [-0.06, -D / 2]]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.008), woodMat);
    win.position.set(x, 0.085, z);
    g.add(win);
  }
  // the tower, capped by a tall shingled spire
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.24, 12), wall);
  tower.position.set(W * 0.42, 0.12, -D * 0.2);
  tower.castShadow = true;
  g.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 12), roofMat);
  spire.position.set(W * 0.42, 0.32, -D * 0.2);
  spire.castShadow = true;
  g.add(spire);
  const louvre = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.008), woodMat);
  louvre.position.set(W * 0.42, 0.2, -D * 0.2 + 0.036);
  g.add(louvre);
  return g;
}

// The stump house: a hollow trunk with root buttresses, a door in the bark, a
// little balcony and a ragged broken crown.
function buildStumpHouse(v = {}) {
  const g = new THREE.Group();
  const bark = craftMaterial(v.wood ?? "#b78b4e", { rough: 0.98, flat: true });
  const dark = craftMaterial(v.dark ?? "#9c7440", { rough: 0.98 });
  const H = 0.34;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, H, 14), bark);
  trunk.position.y = H / 2;
  trunk.castShadow = true;
  g.add(trunk);
  // bark ridges running up the trunk
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, H * 0.95, 0.02), dark);
    ridge.position.set(Math.cos(a) * 0.125, H / 2, Math.sin(a) * 0.125);
    ridge.rotation.y = -a;
    ridge.rotation.z = jitter(0.05);
    g.add(ridge);
  }
  // roots splaying out at the foot
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + jitter(0.2);
    // the cone lies down and points away from the trunk, tip on the ground
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6), bark);
    root.position.set(Math.cos(a) * 0.12, 0.035, Math.sin(a) * 0.12);
    root.rotation.set(Math.PI / 2 + 0.35, 0, 0);
    root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI / 2 - a);
    root.castShadow = true;
    g.add(root);
  }
  // the broken top: short ragged teeth of bark around a hollow rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(0.019, 0.025 + Math.random() * 0.035, 4),
      bark,
    );
    shard.position.set(Math.cos(a) * 0.095, H + 0.015, Math.sin(a) * 0.095);
    shard.rotation.set(jitter(0.12), a, jitter(0.12));
    g.add(shard);
  }
  const hollow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.07, 0.02, 14),
    craftMaterial("#4a3823", { rough: 1.0 }),
  );
  hollow.position.y = H;
  g.add(hollow);
  const door = archDoor(dark, 0.06, 0.085);
  door.position.set(0, 0.03, 0.14);
  g.add(door);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI), dark);
  arch.position.set(0, 0.115, 0.142);
  g.add(arch);
  for (const [x, y, r] of [[-0.09, 0.19, -0.9], [0.085, 0.13, 0.85]]) {
    const win = panedWindow(dark, 0.022);
    win.position.set(x, y, Math.cos(r) * 0.1);
    win.rotation.y = r;
    g.add(win);
  }
  // steps up to the door, then a balcony round the back-right
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.055 + i * 0.012, 0.06 + i * 0.012, 0.012, 14, 1, false, 0, Math.PI), dark);
    step.position.set(0, 0.03 - i * 0.011, 0.15 + i * 0.012);
    g.add(step);
  }
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 12, 1, false, 0, Math.PI), dark);
  balcony.position.set(0.1, 0.2, -0.04);
  balcony.rotation.y = -1.2;
  g.add(balcony);
  const brail = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 5, 12, Math.PI), dark);
  brail.rotation.set(Math.PI / 2, 0, 0);
  brail.rotation.y = -1.2;
  brail.position.set(0.1, 0.225, -0.04);
  g.add(brail);
  return g;
}

// The stepped ruin: a tiered pyramid with a long stair up the front and a
// pillared chamber under the top platform.
function buildZiggurat(v = {}) {
  const g = new THREE.Group();
  const stone = craftMaterial(v.stone ?? "#c2a880", { rough: 0.98, flat: true });
  const dark = craftMaterial(v.dark ?? "#a78e69", { rough: 0.98, flat: true });
  const tiers = 4;
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const w = 0.36 - i * 0.07;
    const h = 0.05 - i * 0.004;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), i % 2 ? stone : dark);
    slab.position.set(jitter(0.006), y + h / 2, jitter(0.006));
    slab.rotation.y = jitter(0.05);
    slab.castShadow = true;
    g.add(slab);
    // a course line so each tier reads as cut blocks, not a solid box
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.008, w * 0.84), dark);
    lip.position.y = y + h;
    g.add(lip);
    y += h;
  }
  // the pillared chamber under the top tier
  for (const x of [-0.055, -0.018, 0.018, 0.055]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.048, 8), stone);
    col.position.set(x, y - 0.024, 0.05);
    g.add(col);
  }
  // the stair down the front
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.026), stone);
    step.position.set(0, 0.01 + i * 0.019, 0.17 - i * 0.014);
    step.castShadow = true;
    g.add(step);
  }
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.16), dark);
    cheek.position.set(s * 0.048, 0.09, 0.11);
    cheek.rotation.x = -0.86;
    g.add(cheek);
  }
  rubble(g, dark, 10, 0.22, 0.035);
  return g;
}

// A reptile hide carved from rock: chunky low-poly boulders piled into a cave,
// either a squat blocky mound or a bare standing arch.
function buildRockCave(v = {}) {
  const g = new THREE.Group();
  const rockMat = craftMaterial(v.stone ?? "#8e8b72", { rough: 1.0, flat: true });
  const shade = craftMaterial(v.dark ?? "#6e6c58", { rough: 1.0, flat: true });
  const arch = v.arch === true;
  const R = 0.2;
  // two legs and a lintel — the mouth of the hide
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const sz = 0.075 - i * 0.008;
      const block = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), i % 2 ? rockMat : shade);
      block.position.set(s * (R * 0.62 - i * 0.012), 0.03 + i * 0.055, jitter(0.02));
      block.rotation.set(jitter(0.6), Math.random() * Math.PI, jitter(0.6));
      block.scale.set(1.1, 0.85, 1);
      block.castShadow = true;
      g.add(block);
    }
  }
  for (let i = 0; i < 3; i++) {
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), rockMat);
    cap.position.set((i - 1) * 0.075, 0.235, jitter(0.02));
    cap.rotation.set(jitter(0.4), Math.random() * Math.PI, jitter(0.4));
    cap.scale.set(1.2, 0.6, 1.1);
    cap.castShadow = true;
    g.add(cap);
  }
  // the dark interior, so the mouth reads as a hole and not a gap
  const hollow = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 9),
    craftMaterial("#241f18", { rough: 1.0 }),
  );
  hollow.scale.set(1, 1.1, 1.3);
  hollow.position.set(0, 0.09, -0.02);
  g.add(hollow);
  if (!arch) {
    // the blocky version piles a whole shoulder of rock behind and above the
    // mouth — never in front of it, or the hide stops reading as a hide
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (0.15 + Math.random() * 0.7);
      const rr = 0.09 + Math.random() * 0.12;
      const sz = 0.045 + Math.random() * 0.045;
      const block = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), i % 3 ? rockMat : shade);
      block.position.set(Math.cos(a) * rr * 1.3, 0.06 + Math.random() * 0.2, -0.05 - Math.sin(a) * rr * 0.8);
      block.rotation.set(jitter(0.7), Math.random() * Math.PI, jitter(0.7));
      block.scale.set(1.2, 0.7, 1.05);
      block.castShadow = true;
      g.add(block);
    }
  }
  return g;
}

// Stacked slate: broad thin plates layered into shelves with a stair climbing
// between them — the shale hide that looks like a card house of stone.
function buildSlateLedge(v = {}) {
  const g = new THREE.Group();
  const slateMat = craftMaterial(v.stone ?? "#4a4a4e", { rough: 0.85, flat: true });
  const edge = craftMaterial(v.dark ?? "#3a3a3e", { rough: 0.85, flat: true });
  const levels = [
    [0.0, 0.21, 0],
    [0.052, 0.16, -0.05],
    [0.1, 0.13, 0.045],
    [0.145, 0.1, -0.03],
    [0.185, 0.075, 0.02],
  ];
  levels.forEach(([y, r, xoff], i) => {
    // each shelf is two or three overlapping plates, not one clean disc
    for (let p = 0; p < 3; p++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.7 + p * 0.15), r * (0.72 + p * 0.15), 0.012, 9), p ? slateMat : edge);
      plate.position.set(xoff + jitter(0.03), y + p * 0.005, jitter(0.03));
      plate.rotation.y = Math.random() * Math.PI;
      plate.castShadow = true;
      g.add(plate);
    }
    // squat props holding the next shelf up, leaving a gap to hide under
    if (i < levels.length - 1) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + i;
        const prop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), edge);
        prop.position.set(xoff + Math.cos(a) * r * 0.5, y + 0.03, Math.sin(a) * r * 0.5);
        g.add(prop);
      }
    }
  });
  // the stair up the middle
  for (let i = 0; i < 10; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.022), slateMat);
    step.position.set(0.02, 0.02 + i * 0.02, 0.12 - i * 0.014);
    g.add(step);
  }
  return g;
}

// The canyon: two layered rock stacks leaning together into a bridge, with a
// cave mouth through the base of one side.
function buildCanyon(v = {}) {
  const g = new THREE.Group();
  const rockMat = craftMaterial(v.stone ?? "#b98f63", { rough: 1.0, flat: true });
  const bandMat = craftMaterial(v.dark ?? "#a07a51", { rough: 1.0, flat: true });
  for (const s of [-1, 1]) {
    const layers = 7;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const w = 0.16 - t * 0.05;
      const slab = new THREE.Mesh(
        new THREE.CylinderGeometry(w, w * 1.06, 0.036, 7),
        i % 2 ? rockMat : bandMat,
      );
      slab.position.set(s * (0.14 - t * 0.03) + jitter(0.012), 0.02 + i * 0.038, jitter(0.02));
      slab.rotation.y = Math.random() * Math.PI;
      slab.scale.z = 0.75;
      slab.castShadow = true;
      g.add(slab);
    }
    // a shelf jutting out of each stack
    const shelf = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.095, 0.026, 7), rockMat);
    shelf.position.set(s * 0.2, 0.14 + s * 0.05, 0.03);
    shelf.scale.z = 0.7;
    shelf.castShadow = true;
    g.add(shelf);
  }
  // the span bridging the two towers
  const span = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.14), rockMat);
  span.position.set(0, 0.29, 0);
  span.rotation.z = -0.06;
  span.castShadow = true;
  g.add(span);
  const under = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.1), bandMat);
  under.position.set(0, 0.26, 0);
  g.add(under);
  // the cave mouth on the left foot
  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 9),
    craftMaterial("#241f18", { rough: 1.0 }),
  );
  mouth.scale.set(1, 1.1, 1.4);
  mouth.position.set(-0.14, 0.06, 0.04);
  g.add(mouth);
  return g;
}

// A rough flight of stone steps, cut as one block and weathered along the treads.
function buildStoneStairs(v = {}) {
  const g = new THREE.Group();
  const stone = craftMaterial(v.stone ?? "#b8b3ab", { rough: 1.0, flat: true });
  const dark = craftMaterial(v.dark ?? "#98938b", { rough: 1.0, flat: true });
  const steps = 11;
  const rise = 0.021;
  const run = 0.029;
  for (let i = 0; i < steps; i++) {
    const y = 0.01 + i * rise;
    const z = 0.15 - i * run;
    // each tread sits on the block of stone below it, so the flight is solid
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.1, y + 0.02, run), i % 2 ? stone : dark);
    riser.position.set(jitter(0.003), (y + 0.02) / 2, z);
    riser.rotation.y = jitter(0.04);
    riser.castShadow = true;
    g.add(riser);
    // chipped edges along the nose of the tread
    for (let k = 0; k < 3; k++) {
      const chip = new THREE.Mesh(new THREE.DodecahedronGeometry(0.01, 0), stone);
      chip.position.set((k - 1) * 0.033 + jitter(0.008), y + 0.016, z + run * 0.5);
      chip.rotation.set(jitter(1), jitter(1), jitter(1));
      g.add(chip);
    }
  }
  // rough side walls following the slope
  for (const s of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const y = 0.01 + i * rise;
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.014, y + 0.03, run), dark);
      cheek.position.set(s * 0.055 + jitter(0.004), (y + 0.03) / 2, 0.15 - i * run);
      g.add(cheek);
    }
  }
  return g;
}

// A broken brick wall spilling its rubble across the ground.
function buildBrokenWall(v = {}) {
  const g = new THREE.Group();
  const brick = craftMaterial(v.stone ?? "#7f8288", { rough: 0.98, flat: true });
  const dark = craftMaterial(v.dark ?? "#666a70", { rough: 0.98, flat: true });
  const cols = 8;
  const rows = 5;
  for (let c = 0; c < cols; c++) {
    // the wall steps down as it goes: tall at the left, gone at the right
    const hRows = Math.max(0, Math.round(rows - (c / (cols - 1)) * (rows + 0.6)));
    for (let r = 0; r < hRows; r++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.042, 0.026, 0.036),
        (c + r) % 2 ? brick : dark,
      );
      b.position.set(-0.16 + c * 0.045 + (r % 2 ? 0.008 : 0), 0.015 + r * 0.028, jitter(0.004));
      b.rotation.y = jitter(0.06);
      b.castShadow = true;
      g.add(b);
    }
  }
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.05), dark);
  post.position.set(-0.185, 0.075, 0);
  post.castShadow = true;
  g.add(post);
  // the collapsed half, scattered forward
  for (let i = 0; i < 16; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.022, 0.03), i % 2 ? brick : dark);
    b.position.set(0.02 + Math.random() * 0.16, 0.012 + Math.random() * 0.03, jitter(0.07));
    b.rotation.set(jitter(0.8), Math.random() * Math.PI, jitter(0.8));
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

// A ruined watchtower: a coursed round tower torn open down one side, with a
// stair spiralling up the broken shell.
function buildRuinedTower(v = {}) {
  const g = new THREE.Group();
  const stone = craftMaterial(v.stone ?? "#cfc9ab", { rough: 0.98, flat: true });
  const dark = craftMaterial(v.dark ?? "#b0aa8e", { rough: 0.98, flat: true });
  const rows = 12;
  for (let r = 0; r < rows; r++) {
    const y = 0.02 + r * 0.032;
    const rad = 0.105 - r * 0.003;
    const n = 16;
    // each course loses more of its arc as the tower climbs — that missing
    // wedge is the breach — and the last blocks of a course drop out at random
    const gap = 0.9 + Math.pow(r / rows, 1.5) * 3.4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // the breach faces the same way as the door, so you always see into it
      const off = Math.abs(Math.atan2(Math.sin(a - 1.9), Math.cos(a - 1.9)));
      if (off < gap / 2) continue;
      if (off < gap / 2 + 0.35 && Math.random() < 0.5) continue;
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.028, 0.026), (i + r) % 2 ? stone : dark);
      block.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      block.rotation.y = -a;
      block.castShadow = true;
      g.add(block);
    }
  }
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.075, 0.03),
    craftMaterial("#2a271f", { rough: 1.0 }),
  );
  door.position.set(0, 0.058, 0.1);
  g.add(door);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.012, 6, 12, Math.PI), stone);
  arch.position.set(0, 0.095, 0.1);
  g.add(arch);
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.05, 0.03),
    craftMaterial("#2a271f", { rough: 1.0 }),
  );
  win.position.set(-0.075, 0.24, 0.06);
  win.rotation.y = -0.9;
  g.add(win);
  // the stair inside the breach
  for (let i = 0; i < 7; i++) {
    const a = 4.4 + i * 0.28;
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.03), dark);
    step.position.set(Math.cos(a) * 0.075, 0.2 + i * 0.028, Math.sin(a) * 0.075);
    step.rotation.y = -a;
    g.add(step);
  }
  rubble(g, dark, 12, 0.15, 0.032);
  return g;
}

// The temple hall: a red timber hall on a plinth under black tiled roofs.
// `tiers` gives it one or two storeys, `wall` walls the courtyard in.
function buildTempleHall(v = {}) {
  const g = new THREE.Group();
  const body = craftMaterial(v.body ?? "#b8552f", { rough: 0.88 });
  const tile = craftMaterial(v.tile ?? "#2e2c2a", { rough: 0.7, flat: true });
  const stoneMat = craftMaterial(v.stone ?? "#d8d3c8", { rough: 0.95 });
  const tiers = v.tiers ?? 2;
  const W = 0.24;
  const D = 0.18;

  const base = new THREE.Mesh(new THREE.BoxGeometry(W * 1.25, 0.03, D * 1.3), stoneMat);
  base.position.y = 0.015;
  base.receiveShadow = true;
  g.add(base);
  let y = 0.03;
  for (let t = 0; t < tiers; t++) {
    const k = 1 - t * 0.16;
    const h = 0.085;
    const hall = new THREE.Mesh(new THREE.BoxGeometry(W * k, h, D * k), body);
    hall.position.y = y + h / 2;
    hall.castShadow = true;
    g.add(hall);
    // lattice windows and a dark doorway on the front
    for (const x of [-W * k * 0.32, W * k * 0.32]) {
      const lat = new THREE.Mesh(new THREE.BoxGeometry(W * k * 0.22, h * 0.5, 0.006), tile);
      lat.position.set(x, y + h * 0.55, (D * k) / 2 + 0.002);
      g.add(lat);
    }
    const way = new THREE.Mesh(
      new THREE.BoxGeometry(W * k * 0.22, h * 0.7, 0.008),
      craftMaterial("#241f1b", { rough: 0.9 }),
    );
    way.position.set(0, y + h * 0.35, (D * k) / 2 + 0.002);
    g.add(way);
    // corner posts, then the roof over this storey
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, h, 6), body);
        post.position.set(sx * W * k * 0.5, y + h / 2, sz * D * k * 0.5);
        g.add(post);
      }
    }
    y += h;
    const roof = flaredRoof(tile, W * k * 1.4, D * k * 1.45, 0.055);
    roof.position.y = y;
    g.add(roof);
    y += 0.055 + 0.012;
    if (t === 0 && tiers > 1) {
      // the balcony rail that rings the upper storey
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.016, D * 0.95), body);
      rail.position.y = y + 0.008;
      g.add(rail);
      y += 0.016;
    }
  }
  // the entrance steps
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.02), stoneMat);
    step.position.set(0, 0.026 - i * 0.011, D * 0.66 + i * 0.019);
    g.add(step);
  }
  if (v.walled) {
    // a low courtyard wall with a break at the front for the stair
    for (const [w, d, x, z] of [
      [W * 1.7, 0.016, 0, -D * 0.95],
      [0.016, D * 1.9, -W * 0.85, 0],
      [0.016, D * 1.9, W * 0.85, 0],
      [W * 0.55, 0.016, -W * 0.58, D * 0.95],
      [W * 0.55, 0.016, W * 0.58, D * 0.95],
    ]) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), stoneMat);
      seg.position.set(x, 0.045, z);
      seg.castShadow = true;
      g.add(seg);
    }
    const yard = new THREE.Mesh(new THREE.BoxGeometry(W * 1.7, 0.02, D * 1.9), stoneMat);
    yard.position.y = 0.01;
    g.add(yard);
  }
  return g;
}

// A garden pavilion: an open platform, columns, a railing and a flared roof —
// with an optional second eave and a stone podium under it.
function buildPavilion(v = {}) {
  const g = new THREE.Group();
  const body = craftMaterial(v.body ?? "#8e3a2c", { rough: 0.88 });
  const tile = craftMaterial(v.tile ?? "#2e2c2a", { rough: 0.7, flat: true });
  const stoneMat = craftMaterial(v.stone ?? "#ded8cc", { rough: 0.95 });
  const S = v.size ?? 0.16;
  let y = 0;
  if (v.podium) {
    const podium = new THREE.Mesh(new THREE.BoxGeometry(S * 1.9, 0.05, S * 1.9), stoneMat);
    podium.position.y = 0.025;
    podium.castShadow = true;
    g.add(podium);
    for (let i = 0; i < 4; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(S * 0.6, 0.012, 0.018), stoneMat);
      step.position.set(0, 0.044 - i * 0.012, S * 0.95 + i * 0.017);
      g.add(step);
    }
    y = 0.05;
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(S * 1.5, 0.022, S * 1.5), stoneMat);
  deck.position.y = y + 0.011;
  deck.castShadow = true;
  g.add(deck);
  y += 0.022;
  const colH = S * 0.72;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.045, S * 0.05, colH, 8), body);
      col.position.set(sx * S * 0.6, y + colH / 2, sz * S * 0.6);
      col.castShadow = true;
      g.add(col);
    }
  }
  // balustrade between the columns, one side left open as the entrance
  for (const [x, z, rot] of [
    [0, -S * 0.6, 0],
    [-S * 0.6, 0, Math.PI / 2],
    [S * 0.6, 0, Math.PI / 2],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(S * 1.2, 0.012, 0.012), body);
    rail.position.set(x, y + colH * 0.42, z);
    rail.rotation.y = rot;
    g.add(rail);
    for (let i = -2; i <= 2; i++) {
      const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, colH * 0.4, 5), body);
      const off = i * S * 0.26;
      baluster.position.set(
        x + (rot ? 0 : off),
        y + colH * 0.22,
        z + (rot ? off : 0),
      );
      g.add(baluster);
    }
  }
  y += colH;
  const roof = flaredRoof(tile, S * 1.9, S * 1.9, S * 0.42);
  roof.position.y = y;
  g.add(roof);
  if (v.doubleEave) {
    // a second, wider eave slung below the first
    const lower = flaredRoof(tile, S * 2.2, S * 2.2, S * 0.3);
    lower.position.y = y - colH * 0.42;
    lower.scale.setScalar(0.86);
    g.add(lower);
  }
  const finial = new THREE.Mesh(new THREE.SphereGeometry(S * 0.05, 8, 8), tile);
  finial.scale.y = 1.6;
  finial.position.y = y + S * 0.47;
  g.add(finial);
  return g;
}

// A ship's anchor with rope wound round the shank — the nautical ornament.
function buildAnchor(v = {}) {
  const g = new THREE.Group();
  const metal = craftMaterial(v.metal ?? "#c8a97e", { rough: 0.6 });
  const ropeMat = craftMaterial(v.rope ?? "#b89a70", { rough: 0.95 });
  const H = 0.34;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, H, 10), metal);
  shank.position.y = H / 2;
  shank.castShadow = true;
  g.add(shank);
  // the ring at the head, plus the two small stock rings
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 7, 16), metal);
  ring.position.y = H + 0.03;
  ring.castShadow = true;
  g.add(ring);
  const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), metal);
  stock.rotation.z = Math.PI / 2;
  stock.position.y = H - 0.03;
  g.add(stock);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.006, 6, 12), metal);
    eye.position.set(s * 0.095, H - 0.03, 0);
    eye.rotation.y = Math.PI / 2;
    g.add(eye);
  }
  // the arms sweep up from the crown into barbed flukes
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0.02, 0),
          new THREE.Vector3(s * 0.11, 0.0, 0),
          new THREE.Vector3(s * 0.14, 0.1, 0),
        ),
        14,
        0.012,
        7,
      ),
      metal,
    );
    arm.castShadow = true;
    g.add(arm);
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.055, 4), metal);
    fluke.position.set(s * 0.145, 0.125, 0);
    fluke.rotation.z = s * -0.35;
    fluke.scale.z = 0.4;
    g.add(fluke);
  }
  // rope: a twist down the shank and a coil round the crown
  const rope = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.02, H + 0.02, 0.02),
        new THREE.Vector3(-0.03, H * 0.7, 0.02),
        new THREE.Vector3(0.03, H * 0.42, -0.02),
        new THREE.Vector3(-0.02, H * 0.16, 0.02),
      ]),
      20,
      0.007,
      6,
    ),
    ropeMat,
  );
  g.add(rope);
  for (let i = 0; i < 2; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.04 + i * 0.012, 0.007, 6, 16), ropeMat);
    coil.rotation.x = Math.PI / 2 + 0.15;
    coil.position.set(-0.01, 0.03 + i * 0.012, 0.01);
    g.add(coil);
  }
  return g;
}

// ---------------------------------------------------------------------------
// The clean-up crew
// ---------------------------------------------------------------------------
// A bioactive terrarium runs on these two: springtails graze the mould before
// it spreads, isopods break down leaf litter. They are the only decorations
// that do a job rather than sit there, so the care simulation counts them.

// An isopod: a segmented armoured back, seven pairs of legs and two antennae.
function buildIsopod(v = {}) {
  const g = new THREE.Group();
  const shell = craftMaterial(v.shell ?? "#8a8378", { rough: 0.65 });
  const patch = v.patch ? craftMaterial(v.patch, { rough: 0.65 }) : null;
  const legMat = craftMaterial(v.legs ?? "#c9c2b4", { rough: 0.8 });
  const L = v.size ?? 0.1;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    // widest across the middle, tapering to head and tail
    const w = L * (0.34 - Math.abs(t - 0.42) * 0.3);
    const plate = new THREE.Mesh(
      new THREE.SphereGeometry(w, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      patch && i % 2 ? patch : shell,
    );
    plate.scale.set(1, 0.55, 0.62);
    plate.position.set((t - 0.5) * L, w * 0.3, 0);
    plate.castShadow = true;
    g.add(plate);
    if (i < segs - 1) {
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, w * 0.9, 4),
          legMat,
        );
        leg.position.set((t - 0.5) * L, w * 0.15, s * w * 0.55);
        leg.rotation.x = s * 1.0;
        g.add(leg);
      }
    }
  }
  for (const s of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, L * 0.34, 4), legMat);
    ant.position.set(L * 0.5, L * 0.08, s * L * 0.06);
    ant.rotation.set(s * 0.4, 0, 1.15);
    g.add(ant);
  }
  return g;
}

// Springtails: too small to model one of, so the decoration is what you
// actually see — a pale drift of them across the soil.
function buildSpringtails(v = {}) {
  const g = new THREE.Group();
  const mat = craftMaterial(v.body ?? "#e6e2d6", { rough: 0.7 });
  const spread = v.spread ?? 0.13;
  const count = 26 + ((Math.random() * 10) | 0);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.55) * spread;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 5), mat);
    body.scale.set(1.7, 0.8, 0.8);
    body.position.set(Math.cos(a) * r, 0.006 + Math.random() * 0.012, Math.sin(a) * r);
    body.rotation.y = Math.random() * Math.PI;
    g.add(body);
  }
  // a few caught mid-jump, which is the only way you ever notice them
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const hop = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 5), mat);
    hop.scale.set(1.6, 0.8, 0.8);
    hop.position.set(Math.cos(a) * spread * 0.7, 0.035 + Math.random() * 0.025, Math.sin(a) * spread * 0.7);
    g.add(hop);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Printed creature figurines
// ---------------------------------------------------------------------------

// A praying mantis reared up on four legs with its raptorial arms folded.
function buildMantis(v = {}) {
  const g = new THREE.Group();
  const mat = craftMaterial(v.body ?? "#e8e6de", { rough: 0.7 });
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 9), mat);
  abdomen.scale.set(1.9, 0.7, 0.7);
  abdomen.position.set(-0.05, 0.11, 0);
  abdomen.rotation.z = 0.25;
  abdomen.castShadow = true;
  g.add(abdomen);
  // the thorax rears up, carrying the head at the top
  const thorax = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.11, 8), mat);
  thorax.position.set(0.035, 0.19, 0);
  thorax.rotation.z = 0.45;
  g.add(thorax);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 9), mat);
  head.scale.set(1.1, 0.85, 0.8);
  head.position.set(0.065, 0.25, 0);
  head.castShadow = true;
  g.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mat);
    eye.position.set(0.078, 0.258, s * 0.019);
    g.add(eye);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.11, 4), mat);
    ant.position.set(0.085, 0.31, s * 0.012);
    ant.rotation.z = -0.35 + s * 0.05;
    ant.rotation.x = s * 0.2;
    g.add(ant);
  }
  // raptorial arms: elbow out and forward, forearm folded back under it with
  // a row of teeth along the inside edge
  for (const s of [-1, 1]) {
    const shoulder = V(0.055, 0.215, s * 0.022);
    const elbow = V(0.125, 0.145, s * 0.03);
    const claw = V(0.075, 0.09, s * 0.032);
    g.add(bone(mat, shoulder, elbow, 0.009));
    g.add(bone(mat, elbow, claw, 0.008));
    for (let i = 1; i < 6; i++) {
      const p = elbow.clone().lerp(claw, i / 6);
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, 4), mat);
      tooth.position.set(p.x, p.y, p.z);
      tooth.rotation.z = -0.7;
      g.add(tooth);
    }
  }
  // wing case over the abdomen
  const wing = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat);
  wing.scale.set(1.8, 0.35, 0.55);
  wing.position.set(-0.04, 0.14, 0);
  wing.rotation.z = 0.28;
  g.add(wing);
  // four walking legs: hip up under the body, knee out high, foot on the ground
  for (const s of [-1, 1]) {
    for (const [hx, fx] of [[0.005, 0.075], [-0.06, -0.035]]) {
      const hip = V(hx, 0.125, s * 0.03);
      const knee = V(hx + 0.02, 0.185, s * 0.085);
      const foot = V(fx, 0.006, s * 0.1);
      g.add(bone(mat, hip, knee, 0.006));
      g.add(bone(mat, knee, foot, 0.005));
      const toe = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), mat);
      toe.position.copy(foot);
      g.add(toe);
    }
  }
  return g;
}

// A snake coiled around a piece of driftwood on a round base.
function buildSnakeCoil(v = {}) {
  const g = new THREE.Group();
  const skin = craftMaterial(v.body ?? "#b58a63", { rough: 0.85 });
  const woodMat = craftMaterial(v.wood ?? "#a37c56", { rough: 0.95, flat: true });
  g.add(plinth(craftMaterial(v.base ?? "#a8815b", { rough: 1.0 }), 0.17));
  // the branch it is wrapped around, splintered at the top
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.28, 8), woodMat);
  branch.position.set(0.02, 0.16, -0.01);
  branch.rotation.z = -0.35;
  branch.castShadow = true;
  g.add(branch);
  for (let i = 0; i < 5; i++) {
    const splint = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.06, 4), woodMat);
    splint.position.set(0.08 + jitter(0.02), 0.29 + jitter(0.02), -0.01 + jitter(0.02));
    splint.rotation.set(jitter(0.4), 0, -0.5 + jitter(0.3));
    g.add(splint);
  }
  // the body: a rising helix of segments, thinning towards the head
  const segs = 46;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const a = t * Math.PI * 4.6;
    const r = 0.085 - t * 0.035;
    const y = 0.03 + t * 0.2;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.022 - t * 0.009, 10, 8), skin);
    seg.position.set(Math.cos(a) * r + t * 0.02, y, Math.sin(a) * r);
    seg.scale.set(1, 0.85, 1);
    seg.castShadow = true;
    g.add(seg);
  }
  const a = Math.PI * 4.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 9), skin);
  head.scale.set(1.4, 0.75, 0.9);
  head.position.set(Math.cos(a) * 0.05 + 0.045, 0.235, Math.sin(a) * 0.05);
  head.rotation.y = -a;
  head.castShadow = true;
  g.add(head);
  return g;
}

// A wolf howling from a rock outcrop.
function buildWolf(v = {}) {
  const g = new THREE.Group();
  const fur = craftMaterial(v.body ?? "#b9b6ae", { rough: 0.9 });
  const rock = craftMaterial(v.stone ?? "#a9a69e", { rough: 1.0, flat: true });
  // the outcrop: a few stacked slabs
  for (let i = 0; i < 4; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.24 - i * 0.03, 0.035, 0.17 - i * 0.02), rock);
    slab.position.set(jitter(0.015) - i * 0.012, 0.018 + i * 0.034, jitter(0.012));
    slab.rotation.y = jitter(0.2);
    slab.castShadow = true;
    g.add(slab);
  }
  const y0 = 0.15;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 9), fur);
  torso.scale.set(2.35, 0.62, 0.6);
  torso.position.set(-0.03, y0 + 0.075, 0);
  torso.castShadow = true;
  g.add(torso);
  // shoulders and ruff, then a neck carrying the head back into the howl
  const ruff = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 9), fur);
  ruff.scale.set(0.8, 1.15, 0.95);
  ruff.position.set(0.055, y0 + 0.095, 0);
  ruff.castShadow = true;
  g.add(ruff);
  g.add(bone(fur, V(0.055, y0 + 0.105, 0), V(0.092, y0 + 0.17, 0), 0.017));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 9), fur);
  head.scale.set(1.15, 0.85, 0.8);
  head.position.set(0.096, y0 + 0.178, 0);
  head.castShadow = true;
  g.add(head);
  // the muzzle points up and forward — the whole pose is the howl
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.06, 8), fur);
  muzzle.position.set(0.118, y0 + 0.203, 0);
  muzzle.rotation.z = -0.65;
  muzzle.castShadow = true;
  g.add(muzzle);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.024, 5), fur);
    ear.position.set(0.082, y0 + 0.192, s * 0.013);
    ear.rotation.z = 0.1;
    g.add(ear);
  }
  // legs braced on the rock, shoulder to paw
  for (const s of [-1, 1]) {
    for (const [hx, px] of [[0.03, 0.042], [-0.055, -0.062]]) {
      g.add(bone(fur, V(hx, y0 + 0.062, s * 0.028), V(px, y0 - 0.005, s * 0.032), 0.008));
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), fur);
      paw.position.set(px, y0 - 0.006, s * 0.034);
      g.add(paw);
    }
  }
  const tail = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-0.1, y0 + 0.07, 0),
        new THREE.Vector3(-0.16, y0 + 0.06, 0.01),
        new THREE.Vector3(-0.185, y0 + 0.02, 0.02),
      ),
      10,
      0.013,
      6,
    ),
    fur,
  );
  tail.castShadow = true;
  g.add(tail);
  return g;
}

// An ibex rearing on a boulder, big ridged horns curving back over its spine.
function buildIbex(v = {}) {
  const g = new THREE.Group();
  const coat = craftMaterial(v.body ?? "#7e7c78", { rough: 0.92, flat: true });
  const rock = craftMaterial(v.stone ?? "#6e6c68", { rough: 1.0, flat: true });
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), rock);
  boulder.scale.set(1.3, 0.7, 1.1);
  boulder.position.y = 0.05;
  boulder.castShadow = true;
  g.add(boulder);
  const y0 = 0.11;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 9), coat);
  torso.scale.set(1.15, 1.5, 1.0);
  torso.position.set(0, y0 + 0.11, 0);
  torso.rotation.z = 0.35;
  torso.castShadow = true;
  g.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), coat);
  chest.scale.set(1.1, 1, 1);
  chest.position.set(0.028, y0 + 0.16, 0);
  g.add(chest);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.07, 7), coat);
  neck.position.set(0.035, y0 + 0.2, 0);
  neck.rotation.z = -0.5;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.023, 10, 8), coat);
  head.scale.set(1.5, 0.8, 0.8);
  head.position.set(0.075, y0 + 0.225, 0);
  head.rotation.z = -0.25;
  head.castShadow = true;
  g.add(head);
  // horns: ringed tubes sweeping up and back over the shoulders
  for (const s of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0.062, y0 + 0.245, s * 0.014),
      new THREE.Vector3(0.02, y0 + 0.34, s * 0.02),
      new THREE.Vector3(-0.055, y0 + 0.3, s * 0.022),
    );
    const horn = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 6), coat);
    horn.castShadow = true;
    g.add(horn);
    for (let i = 0; i <= 8; i++) {
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0025, 4, 8), coat);
      ridge.position.copy(curve.getPoint(i / 8));
      ridge.lookAt(curve.getPoint(Math.min(1, i / 8 + 0.08)));
      g.add(ridge);
    }
  }
  // forelegs pawing the air, hindlegs folded down onto the boulder
  for (const s of [-1, 1]) {
    const shoulder = V(0.03, y0 + 0.15, s * 0.028);
    g.add(bone(coat, shoulder, V(0.095, y0 + 0.115, s * 0.03), 0.008));
    g.add(bone(coat, V(0.095, y0 + 0.115, s * 0.03), V(0.115, y0 + 0.05, s * 0.032), 0.006));
    const hip = V(-0.03, y0 + 0.07, s * 0.03);
    g.add(bone(coat, hip, V(-0.05, y0 + 0.005, s * 0.034), 0.009));
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6), coat);
    hoof.position.set(-0.05, y0 - 0.002, s * 0.034);
    g.add(hoof);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 5), coat);
  tail.position.set(-0.045, y0 + 0.19, 0);
  tail.rotation.z = 1.6;
  g.add(tail);
  return g;
}

// A tiny faceted elephant — the fits-on-a-fingertip miniature.
function buildElephant(v = {}) {
  const g = new THREE.Group();
  const hide = craftMaterial(v.body ?? "#5b5f66", { rough: 0.95, flat: true });
  const tuskMat = craftMaterial(v.tusk ?? "#ded8cc", { rough: 0.7 });
  const S = v.size ?? 0.13;
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(S * 0.42, 0), hide);
  body.scale.set(1.35, 0.95, 0.85);
  body.position.set(-S * 0.06, S * 0.52, 0);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.DodecahedronGeometry(S * 0.25, 0), hide);
  head.scale.set(1, 1.05, 0.85);
  head.position.set(S * 0.42, S * 0.58, 0);
  head.castShadow = true;
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CircleGeometry(S * 0.2, 7), hide);
    ear.position.set(S * 0.4, S * 0.6, s * S * 0.19);
    ear.rotation.set(0, s * 1.1, 0.2);
    ear.material.side = THREE.DoubleSide;
    g.add(ear);
  }
  // trunk: shrinking segments curling down and under
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(S * (0.08 - t * 0.035), 8, 6), hide);
    seg.position.set(S * (0.6 + t * 0.1 - t * t * 0.06), S * (0.48 - t * 0.34), 0);
    g.add(seg);
  }
  for (const s of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(S * 0.022, S * 0.2, 5), tuskMat);
    tusk.position.set(S * 0.58, S * 0.4, s * S * 0.08);
    tusk.rotation.set(0, 0, 1.9);
    g.add(tusk);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.09, S * 0.1, S * 0.34, 6), hide);
      leg.position.set(sx * S * 0.22 - S * 0.05, S * 0.17, sz * S * 0.16);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(S * 0.015, S * 0.02, S * 0.22, 5), hide);
  tail.position.set(-S * 0.44, S * 0.42, 0);
  tail.rotation.z = 0.35;
  g.add(tail);
  return g;
}

// ---------------------------------------------------------------------------
// The printed garden set: bridges, benches, paths, stilt houses and lanterns
// ---------------------------------------------------------------------------

// The vermilion drum bridge (taiko-bashi): a steep red arch with a pale slat
// deck, fretwork rail panels and a black giboshi finial on every post.
function buildTaikoBashi(v = {}) {
  const g = new THREE.Group();
  const lac = craftMaterial(v.lacquer ?? "#d63a1e", { rough: 0.6 });
  const deckMat = craftMaterial(v.deck ?? "#e9e4d8", { rough: 0.9, flat: true });
  const finialMat = craftMaterial(v.finial ?? "#2e2b28", { rough: 0.5 });
  const span = v.span ?? 0.46;
  const rise = v.rise ?? 0.13;
  const width = 0.19;
  const deckY = (t) => rise * Math.sin(t * Math.PI) + 0.04;

  // deck: a run of thin rods, each tilted to the arch's slope
  const slats = 22;
  for (let i = 0; i < slats; i++) {
    const t = i / (slats - 1);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, width, 6), deckMat);
    rod.rotation.set(Math.PI / 2, 0, -Math.cos(t * Math.PI) * 0.6);
    rod.position.set((t - 0.5) * span, deckY(t), 0);
    rod.castShadow = true;
    g.add(rod);
  }
  // the two lacquered stringers the deck rests on
  const archPts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    archPts.push(new THREE.Vector3((t - 0.5) * span, deckY(t) - 0.016, 0));
  }
  const archCurve = new THREE.CatmullRomCurve3(archPts);
  for (const side of [-1, 1]) {
    const beam = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 16, 0.012, 6), lac);
    beam.position.z = side * width * 0.42;
    beam.castShadow = true;
    g.add(beam);

    // railing: posts, a matching top rail, and a pierced panel between them
    const posts = 6;
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const y = deckY(t);
      const x = (t - 0.5) * span;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.075, 0.014), lac);
      post.position.set(x, y + 0.037, side * width * 0.46);
      post.castShadow = true;
      g.add(post);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), finialMat);
      knob.position.set(x, y + 0.082, side * width * 0.46);
      g.add(knob);
      if (i === posts - 1) continue;
      // fretwork: a lattice of thin bars filling the bay to the next post
      const t2 = (i + 1) / (posts - 1);
      const x2 = (t2 - 0.5) * span;
      const mid = (x + x2) / 2;
      const midY = (y + deckY(t2)) / 2 + 0.045;
      const bay = Math.abs(x2 - x) - 0.014;
      const tilt = Math.atan2(deckY(t2) - y, x2 - x);
      for (let b = 0; b < 3; b++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bay, 0.006, 0.008), lac);
        bar.position.set(mid, midY + (b - 1) * 0.019, side * width * 0.46);
        bar.rotation.z = tilt;
        g.add(bar);
      }
      for (let b = 0; b < 3; b++) {
        const stile = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.008), lac);
        const f = (b + 1) / 4;
        stile.position.set(x + (x2 - x) * f, y + (deckY(t2) - y) * f + 0.045, side * width * 0.46);
        g.add(stile);
      }
    }
    // rail cap over the posts
    const cap = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(archPts.map((p) => p.clone().setY(p.y + 0.09))),
        16,
        0.009,
        5,
      ),
      lac,
    );
    cap.position.z = side * width * 0.46;
    g.add(cap);
  }
  // abutment blocks so the arch lands on something
  for (const end of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, width * 1.05), lac);
    foot.position.set(end * span * 0.5, 0.025, 0);
    foot.castShadow = true;
    g.add(foot);
  }
  return g;
}

// The brick wishing well: a coursed drum of bricks under a flat cut-out arch
// with a hook hanging off it, and a spare bucket on the ground.
function buildBrickWell(v = {}) {
  const g = new THREE.Group();
  const brick = craftMaterial(v.brick ?? "#b9b4ab", { rough: 0.95, flat: true });
  const mortar = craftMaterial(v.mortar ?? "#9a958c", { rough: 0.95, flat: true });
  const wood = craftMaterial(v.wood ?? "#c8a06a", { rough: 0.9, flat: true });
  const r = 0.11;

  // drum: individual bricks per course, offset half a brick each row
  // Short bricks laid tight on a drum, half a brick offset each course — long
  // boxes on a radius this small stick their corners out and read as a cog.
  const rows = 8;
  const per = 20;
  for (let row = 0; row < rows; row++) {
    const y = 0.012 + row * 0.0155;
    for (let i = 0; i < per; i++) {
      const a = ((i + (row % 2 ? 0.5 : 0)) / per) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.012, 0.009), brick);
      b.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      b.rotation.y = -a;
      b.castShadow = true;
      g.add(b);
    }
  }
  // a flat capstone ring, so the top course doesn't end in a scalloped edge
  for (let i = 0; i < per; i++) {
    const a = (i / per) * Math.PI * 2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.012, 0.03), brick);
    cap.position.set(Math.cos(a) * (r + 0.002), 0.132, Math.sin(a) * (r + 0.002));
    cap.rotation.y = -a;
    cap.castShadow = true;
    g.add(cap);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.14, 24, 1, true), mortar);
  core.material = mortar.clone();
  core.material.side = THREE.DoubleSide;
  core.position.y = 0.07;
  g.add(core);
  const shaft = new THREE.Mesh(new THREE.CircleGeometry(r - 0.018, 16), craftMaterial("#1d1c1a", { rough: 1 }));
  shaft.rotation.x = -Math.PI / 2;
  shaft.position.y = 0.03;
  g.add(shaft);

  // the flat sawn frame: two uprights, a shallow arched header, a hook
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.24, 0.014), wood);
    post.position.set(s * (r - 0.01), 0.12, 0);
    post.castShadow = true;
    g.add(post);
  }
  const headerPts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    headerPts.push(new THREE.Vector3((t - 0.5) * (r * 2.5), 0.215 + Math.sin(t * Math.PI) * 0.03, 0));
  }
  const header = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(headerPts), 12, 0.011, 4),
    wood,
  );
  header.scale.z = 1.3;
  header.castShadow = true;
  g.add(header);
  const hookArm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.012), wood);
  hookArm.position.set(0.01, 0.222, 0);
  g.add(hookArm);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.006, 5, 10, Math.PI * 1.5), wood);
  hook.position.set(0.02, 0.2, 0);
  g.add(hook);

  // spare bucket, coursed like the well
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.021, 0.036, 10, 1, true), wood);
  bucket.material = wood.clone();
  bucket.material.side = THREE.DoubleSide;
  bucket.position.set(-0.13, 0.018, 0.09);
  bucket.castShadow = true;
  g.add(bucket);
  const bucketFloor = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), wood);
  bucketFloor.rotation.x = -Math.PI / 2;
  bucketFloor.position.set(-0.13, 0.004, 0.09);
  g.add(bucketFloor);
  return g;
}

// A park bench: slatted timber on cast-iron ends with a scrolled armrest.
function buildParkBench(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#c9975a", { rough: 0.9, flat: true });
  const iron = craftMaterial(v.iron ?? "#33302c", { rough: 0.55 });
  const w = 0.3;
  const seatY = 0.075;

  const front = -0.058;
  const back = 0.055;
  const rake = 0.26; // how far the back leans away from vertical
  for (const s of [-1, 1]) {
    const z = s * 0.055;
    // cast end: a foot bar, the front standard carrying the arm, and the
    // raked back standard the seat is bolted between
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.022), iron);
    foot.position.set(0, 0.006, z);
    foot.castShadow = true;
    g.add(foot);
    const frontLeg = new THREE.Mesh(new THREE.BoxGeometry(0.015, seatY + 0.05, 0.016), iron);
    frontLeg.position.set(front, (seatY + 0.05) / 2, z);
    frontLeg.castShadow = true;
    g.add(frontLeg);
    const backLeg = new THREE.Mesh(new THREE.BoxGeometry(0.015, seatY + 0.01, 0.016), iron);
    backLeg.position.set(back, (seatY + 0.01) / 2, z);
    backLeg.castShadow = true;
    g.add(backLeg);
    // the arm, running back from the front standard into the back stile
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.016), iron);
    arm.position.set((front + back) / 2 + 0.008, seatY + 0.052, z);
    arm.castShadow = true;
    g.add(arm);
    // the scroll the arm curls into at the front
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.006, 5, 14, Math.PI * 1.5), iron);
    scroll.rotation.set(0, Math.PI / 2, -0.6);
    scroll.position.set(front - 0.006, seatY + 0.036, z);
    g.add(scroll);
    // the raked back stile, rising off the back leg
    const stileH = 0.115;
    const stile = new THREE.Mesh(new THREE.BoxGeometry(0.014, stileH, 0.016), iron);
    stile.position.set(back + Math.sin(rake) * stileH * 0.5, seatY + Math.cos(rake) * stileH * 0.5, z);
    stile.rotation.z = -rake;
    stile.castShadow = true;
    g.add(stile);
  }
  // Seat slats between the standards.
  //
  // Four of them rather than three, and half again as thick. From above — the
  // one view where a bench had nothing to say — a seat is read by its slats
  // and the gaps between them, and three thin boards over a 107mm span came
  // out as a single smudged strip. Four thicker boards with clear gaps give
  // the top view a grain to read, and the extra thickness is what keeps them
  // from disappearing at the camera distance the jar is actually viewed from.
  const SLAT = 0.013; // thick enough to catch light on its edge
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.03, SLAT, w), wood);
    slat.position.set(front + 0.02 + i * 0.038, seatY + 0.007, 0);
    slat.castShadow = true;
    g.add(slat);
  }
  // Back slats, raked with the stiles. Three, so the back never reads as the
  // same thing as the seat: from above the eye separates a bench from a bare
  // plank by seeing *two* surfaces at different angles, and the raked back
  // sitting proud of the seat is that second surface.
  for (let i = 0; i < 3; i++) {
    const up = 0.028 + i * 0.04;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.03, SLAT, w), wood);
    slat.position.set(back + Math.sin(rake) * up + 0.008, seatY + Math.cos(rake) * up, 0);
    slat.rotation.z = Math.PI / 2 - rake;
    slat.castShadow = true;
    g.add(slat);
  }
  return g;
}

// The stilt houses: one hut lifted on braced legs with a ladder up to its
// veranda. `cottage` gives it a tiled roof and a chimney, `platform` drops the
// hut entirely and leaves the little lookout deck.
function buildStiltHouse(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#e6dba6", { rough: 0.92, flat: true });
  const dark = craftMaterial(v.dark ?? "#cdc088", { rough: 0.92, flat: true });
  const platform = v.platform === true;
  const legH = v.legH ?? (platform ? 0.16 : 0.3);
  const w = platform ? 0.13 : 0.19;
  const d = platform ? 0.12 : 0.17;

  // splayed legs with an X brace on each side
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, legH, 6), wood);
      leg.position.set(sx * w * 0.42, legH / 2, sz * d * 0.42);
      leg.rotation.set(sz * -0.05, 0, sx * -0.05);
      leg.castShadow = true;
      g.add(leg);
    }
    for (const flip of [-1, 1]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, Math.hypot(d * 0.84, legH * 0.55), 0.008),
        wood,
      );
      brace.position.set(sx * w * 0.42, legH * 0.6, 0);
      brace.rotation.x = flip * Math.atan2(d * 0.84, legH * 0.55);
      g.add(brace);
    }
  }
  // deck + balustrade
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), wood);
  deck.position.y = legH;
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);
  const rails = 9;
  for (let i = 0; i < rails; i++) {
    const t = i / (rails - 1);
    for (const sz of [-1, 1]) {
      const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5), wood);
      baluster.position.set((t - 0.5) * w * 0.94, legH + 0.021, sz * d * 0.47);
      g.add(baluster);
    }
  }
  for (const sz of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.006, 0.008), wood);
    cap.position.set(0, legH + 0.038, sz * d * 0.47);
    g.add(cap);
  }

  if (!platform) {
    // the hut sits on the back half of the deck, veranda in front
    const bw = w * 0.66;
    const bd = d * 0.78;
    const bh = v.cottage ? 0.075 : 0.062;
    const bx = w * 0.14;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wood);
    body.position.set(bx, legH + 0.006 + bh / 2, 0);
    body.castShadow = true;
    g.add(body);
    // window openings punched dark into the long wall
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.2, bh * 0.4, 0.006),
        craftMaterial("#2b2823", { rough: 1 }),
      );
      win.position.set(bx + (i - 1) * bw * 0.28, legH + 0.012 + bh * 0.62, bd / 2);
      g.add(win);
    }
    const roofW = bw * 1.3;
    const roofD = bd * 1.35;
    const roofH = v.cottage ? 0.055 : 0.045;
    const roof = gableRoof(dark, roofW, roofD, roofH);
    roof.position.set(bx, legH + 0.006 + bh, 0);
    g.add(roof);
    // battens laid on the panels, so the roof reads as printed corrugation
    const pitch = Math.atan2(roofH, roofD / 2);
    const slope = Math.hypot(roofD / 2, roofH) * 1.05;
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const batten = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.004, slope), dark);
        batten.position.set(
          bx + (i / 6 - 0.5) * roofW * 0.92,
          legH + 0.006 + bh + roofH / 2 + Math.cos(pitch) * 0.008,
          (s * roofD) / 4 + s * Math.sin(pitch) * 0.008,
        );
        batten.rotation.x = s * pitch;
        g.add(batten);
      }
    }
    if (v.cottage) {
      const stack = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.06, 0.022), dark);
      stack.position.set(bx - bw * 0.36, legH + bh + 0.05, -bd * 0.2);
      stack.castShadow = true;
      g.add(stack);
    }
  }

  // Ladder up to the deck. Built upright in its own group and then leaned, so
  // the rungs stay between the rails instead of drifting off them.
  const ladder = new THREE.Group();
  const lh = legH + 0.05;
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.007, lh, 0.007), wood);
    rail.position.set(0, lh / 2, sz * 0.019);
    rail.castShadow = true;
    ladder.add(rail);
  }
  const rungs = Math.max(4, Math.round(lh / 0.035));
  for (let i = 0; i < rungs; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.038), wood);
    rung.position.set(0, ((i + 0.5) / rungs) * lh, 0);
    ladder.add(rung);
  }
  const lean = 0.055; // the top tips in against the deck edge
  ladder.rotation.z = -Math.atan2(lean, lh);
  ladder.position.set(-w * 0.5 - 0.03, 0, d * 0.24);
  g.add(ladder);
  return g;
}

// A heap of the printed mini bricks — three cored holes through each, some
// stacked, the rest tipped over where they landed.
function buildBrickPile(v = {}) {
  const g = new THREE.Group();
  const brick = craftMaterial(v.brick ?? "#c96a3c", { rough: 0.95, flat: true });
  const hole = craftMaterial(v.hole ?? "#7d3f22", { rough: 1 });
  const L = 0.07;
  const H = 0.03;
  const W = 0.036;

  function oneBrick() {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), brick);
    body.position.y = H / 2;
    body.castShadow = true;
    b.add(body);
    // the three cores, sunk into both faces so they read from either side
    for (let i = -1; i <= 1; i++) {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H * 1.02, 10), hole);
      core.position.set(i * L * 0.28, H / 2, 0);
      b.add(core);
    }
    return b;
  }
  const placements = [
    [0, 0, 0, 0],
    [-0.055, 0, 0.045, 0.7],
    [0.06, 0, 0.04, -0.5],
    [0.005, H, -0.01, 0.25],
    [-0.05, 0, -0.05, 1.9],
    [0.055, 0, -0.055, 2.5],
    [0.0, 0, 0.09, 1.2],
  ];
  for (const [x, y, z, rot] of placements) {
    const b = oneBrick();
    b.position.set(x, y, z);
    b.rotation.y = rot + jitter(0.12);
    g.add(b);
  }
  // one stood on edge, leaning against the stack
  const edge = oneBrick();
  edge.position.set(-0.085, 0.03, -0.005); // lifted so the tipped brick rests on the ground
  edge.rotation.set(Math.PI / 2 - 0.25, 0.4, 0);
  g.add(edge);
  return g;
}

// The cobbled path pieces: flagstones laid along an S-curve (or a straight
// run), each tilted and sized a little differently so the seam lines wander.
function buildStonePath(v = {}) {
  const g = new THREE.Group();
  const stone = craftMaterial(v.stone ?? "#c9945e", { rough: 0.95, flat: true });
  const dark = craftMaterial(v.dark ?? "#ab7a48", { rough: 0.95, flat: true });
  const len = 0.44;
  const curve = v.straight
    ? new THREE.CatmullRomCurve3([
        new THREE.Vector3(-len / 2, 0, 0),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(len / 2, 0, 0),
      ])
    : new THREE.CatmullRomCurve3([
        new THREE.Vector3(-len / 2, 0, 0.09),
        new THREE.Vector3(-len / 6, 0, -0.04),
        new THREE.Vector3(len / 6, 0, 0.04),
        new THREE.Vector3(len / 2, 0, -0.09),
      ]);

  // A bedding ribbon first — otherwise the cobbles read as stepping stones
  // dropped in a line rather than one continuous paved run.
  const bed = 26;
  for (let i = 0; i < bed; i++) {
    const t = i / (bed - 1);
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const yaw = Math.atan2(tan.z, tan.x);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.009, 0.078), dark);
    slab.position.set(p.x, 0.0045, p.z);
    slab.rotation.y = -yaw;
    slab.receiveShadow = true;
    g.add(slab);
  }
  // then the cobbles on top, two abreast, overlapping along the run
  const steps = 20;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const yaw = Math.atan2(tan.z, tan.x);
    for (const s of [-1, 1]) {
      const sw = 0.036 + Math.random() * 0.008;
      const sl = 0.03 + Math.random() * 0.006;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(sl, 0.012, sw), (i + (s > 0 ? 1 : 0)) % 2 ? stone : dark);
      slab.position.set(
        p.x - Math.sin(yaw) * s * 0.019,
        0.011 + jitter(0.0012),
        p.z + Math.cos(yaw) * s * 0.019,
      );
      slab.rotation.set(jitter(0.05), -yaw + jitter(0.1), jitter(0.04));
      slab.castShadow = true;
      slab.receiveShadow = true;
      g.add(slab);
    }
  }
  return g;
}

// The little battery hurricane lamps: a pressed shell with a glass globe and a
// steady flame-shaped bulb. `caged` swaps the globe for the barred camping
// lamp with the wide brim.
function buildOilLamp(v = {}) {
  const g = new THREE.Group();
  const shellHex = v.shell ?? "#efeae0";
  const shell = craftMaterial(shellHex, { rough: 0.55 });
  const wire = craftMaterial(v.wire ?? "#b9b6ae", { rough: 0.35 });
  const glow = v.glow ?? 0xffb347;
  const caged = v.caged === true;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.03, 14), shell);
  base.position.y = 0.015;
  base.castShadow = true;
  g.add(base);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.012, 14), shell);
  collar.position.y = 0.036;
  g.add(collar);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.014, 0.05, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfff0c0,
      emissive: glow,
      emissiveIntensity: 1.8,
      roughness: 0.4,
    }),
  );
  flame.position.y = 0.07;
  g.add(flame);

  if (caged) {
    // six uprights around the bulb instead of glass
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.062, 0.007), shell);
      bar.position.set(Math.cos(a) * 0.03, 0.073, Math.sin(a) * 0.03);
      bar.rotation.y = -a;
      g.add(bar);
    }
  } else {
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 14, 12),
      new THREE.MeshStandardMaterial({
        color: 0xe8f0f2,
        roughness: 0.15,
        metalness: 0.0,
        transparent: true,
        opacity: 0.32,
      }),
    );
    globe.scale.set(1, 1.15, 1);
    globe.position.y = 0.078;
    g.add(globe);
    // the pinched neck at the top of the chimney
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.014, 14), shell);
    neck.position.y = 0.116;
    g.add(neck);
  }

  // vented cap: a pierced band under a small conical hood
  const bandY = caged ? 0.112 : 0.13;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.016, 12, 1, true), shell);
  band.material = shell.clone();
  band.material.side = THREE.DoubleSide;
  band.position.y = bandY;
  g.add(band);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(caged ? 0.05 : 0.036, 0.022, 12), shell);
  hood.position.y = bandY + 0.02;
  hood.castShadow = true;
  g.add(hood);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 6), shell);
  knob.position.y = bandY + 0.036;
  g.add(knob);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 5, 14), wire);
  ring.position.y = bandY + 0.05;
  g.add(ring);

  if (!caged) {
    // the fixed side handle the globe lamps carry
    for (const s of [-1, 1]) {
      const handle = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(s * 0.04, 0.03, 0),
            new THREE.Vector3(s * 0.062, 0.08, 0),
            new THREE.Vector3(s * 0.042, 0.126, 0),
          ]),
          10,
          0.005,
          5,
        ),
        shell,
      );
      g.add(handle);
    }
  }

  const light = new THREE.PointLight(glow, 0.45, 0.9);
  light.position.y = 0.08;
  g.add(light);
  return g;
}

// The pierced Moroccan lanterns: a hexagonal body with warm panels behind a
// fretwork frame, a stepped dome and a carrying ring.
function buildMoroccanLantern(v = {}) {
  const g = new THREE.Group();
  const shell = craftMaterial(v.shell ?? "#f2ece2", { rough: 0.6 });
  const wire = craftMaterial(v.wire ?? "#b9b6ae", { rough: 0.35 });
  const glow = v.glow ?? 0xffbb52;
  const r = 0.038;
  const bodyH = 0.09;

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.15, 0.014, 6), shell);
  foot.position.y = 0.007;
  foot.castShadow = true;
  g.add(foot);

  // glowing core, then the frame that sits in front of it
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.9, r * 0.9, bodyH, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffd88f,
      emissive: glow,
      emissiveIntensity: 1.5,
      roughness: 0.5,
    }),
  );
  core.position.y = 0.014 + bodyH / 2;
  g.add(core);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.009, bodyH, 0.009), shell);
    post.position.set(Math.cos(a) * r, 0.014 + bodyH / 2, Math.sin(a) * r);
    post.rotation.y = -a;
    post.castShadow = true;
    g.add(post);
  }
  for (const ry of [0.016, 0.014 + bodyH - 0.004]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.008, 6), shell);
    rim.position.y = ry;
    g.add(rim);
  }

  // stepped dome: a wide pierced skirt, then the tapering cone
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, 0.03, 6), shell);
  skirt.position.y = 0.014 + bodyH + 0.014;
  skirt.castShadow = true;
  g.add(skirt);
  const dome = new THREE.Mesh(new THREE.ConeGeometry(r * 0.78, 0.05, 6), shell);
  dome.position.y = 0.014 + bodyH + 0.048;
  dome.castShadow = true;
  g.add(dome);
  // the pierced diamonds in the dome — light comes through them, so they sit
  // just under the surface and glow rather than standing proud of it
  const pierceMat = new THREE.MeshStandardMaterial({
    color: 0xffd88f,
    emissive: glow,
    emissiveIntensity: 1.2,
    roughness: 0.5,
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const cut = new THREE.Mesh(new THREE.OctahedronGeometry(0.006), pierceMat);
    cut.position.set(Math.cos(a) * r * 0.42, 0.014 + bodyH + 0.04, Math.sin(a) * r * 0.42);
    cut.scale.set(1, 1.3, 1);
    g.add(cut);
  }
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 6), shell);
  finial.position.y = 0.014 + bodyH + 0.078;
  g.add(finial);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.003, 5, 14), wire);
  ring.position.y = 0.014 + bodyH + 0.095;
  g.add(ring);

  const light = new THREE.PointLight(glow, 0.5, 1.0);
  light.position.y = 0.014 + bodyH / 2;
  g.add(light);
  return g;
}

// ---------------------------------------------------------------------------
// The flowering garden pack
// ---------------------------------------------------------------------------
// The nursery-bench flowers from the reference photos. Almost none of these are
// closed-jar species — they are full-sun garden plants — so they carry the
// `open` habitat in the catalog and the tray chip says so before anyone seals
// one into a humid box. Where a genus flowers the same way for every cultivar
// (all fourteen rain lilies, all the crowns of thorns) the kind is the genus
// and the variants are the cultivars, so the builder is written once.

// A tepal: pointed at the tip, tapering back to nothing where it joins the
// throat, which is the shape every lily-form flower here is made of.
function tepalOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(64, 4);
  ctx.bezierCurveTo(98, 40, 100, 88, 64, 124);
  ctx.bezierCurveTo(28, 88, 30, 40, 64, 4);
  ctx.closePath();
}

// The broad rounded standard petal of a pea flower, notched at the top and
// tapering back to the calyx at the bottom.
function standardOutline(ctx) {
  ctx.beginPath();
  ctx.moveTo(64, 14);
  ctx.bezierCurveTo(96, 6, 124, 34, 122, 66);
  ctx.bezierCurveTo(120, 98, 96, 122, 64, 124);
  ctx.bezierCurveTo(32, 122, 8, 98, 6, 66);
  ctx.bezierCurveTo(4, 34, 32, 6, 64, 14);
  ctx.closePath();
}

// An ovate blade with a scalloped margin — Coleus, Lantana and the toothed
// leaves that come with them.
function toothedOutline(ctx) {
  const tip = 6;
  const base = 122;
  const teeth = 11;
  const half = (y) => {
    const t = (y - tip) / (base - tip); // 0 at the tip, 1 at the petiole joint
    const w = 48 * Math.sin(Math.PI * Math.pow(t, 0.62));
    return w * (1 + 0.09 * Math.sin(t * Math.PI * 2 * teeth)); // the teeth
  };
  ctx.beginPath();
  ctx.moveTo(64, tip);
  for (let y = tip; y <= base; y += 2) ctx.lineTo(64 + half(y), y);
  for (let y = base; y >= tip; y -= 2) ctx.lineTo(64 - half(y), y);
  ctx.closePath();
}

// A flat leaf cut from a plain silhouette, for the plants whose leaves are one
// colour and whose interest is all in the flower.
function plainLeafMaterial(color, outline = lanceOutline, shape = "lance") {
  return paintedLeafMaterial(`plain:${color}:${shape}`, (ctx) => {
    outline(ctx);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

// Tepals painted from the cultivar's own markings. A rain lily catalogue is
// almost entirely this: one flower, repainted — a wash out of the throat, an
// optional pale midstripe, an optional darker rim.
function tepalMaterial(v) {
  const base = v.tepal ?? "#f2f0e6";
  const throat = v.throat ?? null;
  const stripe = v.stripe ?? null;
  const edge = v.edge ?? null;
  const key = `tepal:${base}:${throat}:${stripe}:${edge}`;
  return paintedLeafMaterial(key, (ctx) => {
    tepalOutline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    // The throat sits at the bottom of the box: that end joins the centre.
    if (throat) {
      const grad = ctx.createLinearGradient(0, 128, 0, 40);
      grad.addColorStop(0, throat);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
    }
    if (stripe) {
      const grad = ctx.createLinearGradient(34, 0, 94, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, stripe);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
    }
    if (edge) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = 12;
      tepalOutline(ctx);
      ctx.stroke();
    }
    // Every one of these has fine veins running the length of the tepal.
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#5a4030";
    ctx.lineWidth = 1.2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(64 + i * 3, 120);
      ctx.quadraticCurveTo(64 + i * 10, 64, 64 + i * 2.5, 10);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// A whorl of tepals around a throat. `rise` is how far the flower has opened:
// low for a flat star, high for a cup still closing.
function flowerHead(mat, { petals = 6, len = 0.09, width = 0.045, rise = 0.5, r = 0.004 } = {}) {
  const head = new THREE.Group();
  const geo = new THREE.PlaneGeometry(width, len);
  geo.translate(0, len / 2, 0); // hinge the tepal at its own base
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + jitter(0.08);
    const tepal = new THREE.Mesh(geo, mat);
    tepal.rotation.order = "YXZ";
    tepal.rotation.set(Math.PI / 2 - rise - jitter(0.12), a, 0);
    tepal.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tepal.castShadow = true;
    head.add(tepal);
  }
  return head;
}

// The stamens and style standing out of the throat.
function flowerStamens(head, { color = "#e8c04a", n = 6, len = 0.03, style = null } = {}) {
  const mat = craftMaterial(color, { rough: 0.6 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lean = 0.5 + jitter(0.15);
    const fil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0018, 0.0018, len, 4),
      mat,
    );
    fil.rotation.order = "YXZ";
    fil.rotation.set(lean, a, 0);
    fil.position.set(
      Math.sin(lean) * Math.cos(a) * len * 0.5,
      Math.cos(lean) * len * 0.5,
      Math.sin(lean) * Math.sin(a) * len * 0.5,
    );
    head.add(fil);
    const anther = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 5), mat);
    anther.scale.set(1, 0.5, 0.5);
    anther.position.set(
      Math.sin(lean) * Math.cos(a) * len,
      Math.cos(lean) * len,
      Math.sin(lean) * Math.sin(a) * len,
    );
    head.add(anther);
  }
  if (style) {
    const s = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, len * 1.2, 4),
      craftMaterial(style, { rough: 0.6 }),
    );
    s.position.y = len * 0.6;
    head.add(s);
  }
  return head;
}

// Rain lily (Zephyranthes): a clump of grassy strap leaves with six-tepal
// stars held just above it. Fourteen cultivars in the pack, one plant.
function buildRainLily(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#4a8a3c", { rough: 0.72 });
  leafMat.side = THREE.DoubleSide;

  // the grass clump — narrow blades arching out of a tight crown
  const blades = v.blades ?? 16 + ((Math.random() * 8) | 0);
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + jitter(0.3);
    const reach = 0.06 + Math.random() * 0.08;
    const rise = 0.13 + Math.random() * 0.1;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(Math.cos(a) * reach * 0.3, rise, Math.sin(a) * reach * 0.3),
      new THREE.Vector3(Math.cos(a) * reach, rise * 0.45, Math.sin(a) * reach),
    );
    const blade = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.005, 4), leafMat);
    blade.scale.x = 1.3;
    blade.castShadow = true;
    g.add(blade);
  }

  // the flowers, each on its own hollow scape
  const stemMat = craftMaterial(v.scape ?? "#5f8a3e", { rough: 0.8 });
  const mat = tepalMaterial(v);
  const n = v.blooms ?? 2 + ((Math.random() * 2) | 0);
  for (let f = 0; f < n; f++) {
    const h = 0.17 + Math.random() * 0.08;
    const px = jitter(0.06);
    const pz = jitter(0.06);
    const scape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.007, h, 6),
      stemMat,
    );
    scape.position.set(px, h / 2, pz);
    scape.rotation.z = jitter(0.12);
    g.add(scape);

    const head = flowerHead(mat, {
      petals: 6,
      len: v.len ?? 0.105,
      width: v.width ?? 0.052,
      rise: v.rise ?? 0.55,
      r: 0.006,
    });
    flowerStamens(head, {
      color: v.stamen ?? "#e8c04a",
      len: (v.len ?? 0.105) * 0.26,
      style: v.style ?? "#eaf0d8",
    });
    head.position.set(px, h, pz);
    head.rotation.y = Math.random() * Math.PI;
    g.add(head);
  }
  return g;
}

// Crown of thorns (Euphorbia milii): thick ridged stems, a rosette of leaves at
// each tip, and pairs of round bracts that read as the flower. The thornless
// cultivar is the same plant with the spines left off.
function buildCrownOfThorns(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial(v.stem ?? "#6e7a52", { rough: 0.88 });
  const thornMat = craftMaterial(v.thorn ?? "#5a4a38", { rough: 0.95 });
  const leafMat = plainLeafMaterial(v.leaf ?? "#3f7a42");
  const bractMat = craftMaterial(v.bract ?? "#d94a5c", { rough: 0.62 });
  bractMat.side = THREE.DoubleSide;
  const eyeMat = craftMaterial(v.eye ?? "#e8b23a", { rough: 0.7 });
  const leafGeo = new THREE.PlaneGeometry(0.044, 0.072);
  leafGeo.translate(0, 0.036, 0);

  const stems = v.stems ?? 3;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + jitter(0.4);
    const lean = 0.1 + Math.random() * 0.12;
    const h = 0.2 + Math.random() * 0.09;
    const bx = Math.cos(a) * 0.035;
    const bz = Math.sin(a) * 0.035;
    const tx = bx + Math.cos(a) * Math.sin(lean) * h;
    const tz = bz + Math.sin(a) * Math.sin(lean) * h;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.011, h, 6),
      stemMat,
    );
    stem.position.set((bx + tx) / 2, h / 2, (bz + tz) / 2);
    stem.rotation.order = "YXZ";
    stem.rotation.set(lean, a + Math.PI / 2, 0);
    stem.castShadow = true;
    g.add(stem);

    if (v.thorns !== false) {
      for (let i = 0; i < 22; i++) {
        const t = 0.1 + Math.random() * 0.85;
        const ta = Math.random() * Math.PI * 2;
        const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.0018, 0.019, 4), thornMat);
        const dir = new THREE.Vector3(Math.cos(ta), 0.2, Math.sin(ta)).normalize();
        thorn.position.set(
          bx + (tx - bx) * t + dir.x * 0.016,
          h * t,
          bz + (tz - bz) * t + dir.z * 0.016,
        );
        thorn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(thorn);
      }
    }

    // the leaf rosette crowning the stem
    for (let i = 0; i < 10; i++) {
      const la = (i / 5) * Math.PI * 2 + jitter(0.25);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.rotation.order = "YXZ";
      leaf.rotation.set(0.75 + jitter(0.3), la, 0);
      leaf.position.set(tx, h - 0.008 - (i / 10) * 0.05, tz);
      leaf.castShadow = true;
      g.add(leaf);
    }

    // the bract pairs, held above the leaves on short pedicels
    const heads = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < heads; i++) {
      const ha = Math.random() * Math.PI * 2;
      const hx = tx + Math.cos(ha) * 0.022;
      const hz = tz + Math.sin(ha) * 0.022;
      const hy = h + 0.012 + Math.random() * 0.022;
      const pedicel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0025, 0.003, hy - h + 0.02, 4),
        stemMat,
      );
      pedicel.position.set((tx + hx) / 2, (h + hy) / 2 - 0.01, (tz + hz) / 2);
      g.add(pedicel);
      for (const side of [-1, 1]) {
        const bract = new THREE.Mesh(new THREE.CircleGeometry(0.017, 10), bractMat);
        bract.position.set(hx + side * 0.011, hy, hz);
        bract.rotation.set(-0.45, 0, side * 0.25);
        g.add(bract);
      }
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 7, 6), eyeMat);
      eye.scale.y = 0.65;
      eye.position.set(hx, hy + 0.006, hz);
      g.add(eye);
    }
  }
  return g;
}

// Ruellia 'Katie': a dense tussock of narrow leaves with short-lived trumpets
// sitting right down in it.
function buildRuellia(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#3f7a3a", { rough: 0.75 });
  leafMat.side = THREE.DoubleSide;
  const leaves = 22 + ((Math.random() * 10) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.4);
    const reach = 0.07 + Math.random() * 0.09;
    const rise = 0.1 + Math.random() * 0.1;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(Math.cos(a) * reach * 0.4, rise, Math.sin(a) * reach * 0.4),
      new THREE.Vector3(Math.cos(a) * reach, rise * 0.6, Math.sin(a) * reach),
    );
    const blade = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.006, 4), leafMat);
    blade.scale.x = 1.5;
    blade.castShadow = true;
    g.add(blade);
  }

  const petalMat = tepalMaterial({ tepal: v.petal ?? "#8f7ad1", throat: v.throat ?? "#5f3f9c" });
  const tubeMat = craftMaterial(v.throat ?? "#6f5aa8", { rough: 0.7 });
  const n = 3 + ((Math.random() * 2) | 0);
  for (let f = 0; f < n; f++) {
    const h = 0.1 + Math.random() * 0.05;
    const px = jitter(0.07);
    const pz = jitter(0.07);
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.006, 0.055, 7, 1, true),
      tubeMat,
    );
    tube.material.side = THREE.DoubleSide;
    tube.position.set(px, h + 0.028, pz);
    g.add(tube);
    // five broad, shallow lobes flaring off the mouth of the tube
    const head = flowerHead(petalMat, {
      petals: 5,
      len: 0.058,
      width: 0.056,
      rise: 0.3,
      r: 0.015,
    });
    head.position.set(px, h + 0.055, pz);
    head.rotation.y = Math.random() * Math.PI;
    g.add(head);
  }
  return g;
}

// Amaryllis (Hippeastrum): two strap leaves and a fat hollow scape carrying a
// pair of big sideways trumpets.
function buildAmaryllis(v = {}) {
  const g = new THREE.Group();
  // Strap leaves: blunt-tipped and arching, not the stiff triangles a bare
  // plane gives you.
  const leafMat = craftMaterial(v.leaf ?? "#3f7a3c", { rough: 0.7 });
  leafMat.side = THREE.DoubleSide;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + jitter(0.3);
    const reach = 0.12 + Math.random() * 0.07;
    const rise = 0.24 + Math.random() * 0.08;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(Math.cos(a) * reach * 0.25, rise, Math.sin(a) * reach * 0.25),
      new THREE.Vector3(Math.cos(a) * reach, rise * 0.55, Math.sin(a) * reach),
    );
    const leaf = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.011, 4), leafMat);
    leaf.scale.x = 1.8;
    leaf.castShadow = true;
    g.add(leaf);
  }

  const h = 0.32;
  const scape = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.015, h, 7),
    craftMaterial(v.scape ?? "#5f8a44", { rough: 0.8 }),
  );
  scape.position.y = h / 2;
  scape.castShadow = true;
  g.add(scape);

  // One open trumpet with a fat bud beside it — a Hippeastrum scape opens one
  // flower at a time, and two overlapping stars just read as a mess.
  const mat = tepalMaterial(v);
  const a = Math.random() * Math.PI * 2;
  const head = flowerHead(mat, {
    petals: 6,
    len: v.len ?? 0.12,
    width: v.width ?? 0.07,
    rise: 0.85,
    r: 0.012,
  });
  flowerStamens(head, { color: v.stamen ?? "#e0b8a0", len: 0.05, style: v.style ?? "#e0b8a0" });
  head.rotation.order = "YXZ";
  head.rotation.set(1.2, a, 0);
  head.position.set(Math.cos(a) * 0.02, h - 0.005, Math.sin(a) * 0.02);
  g.add(head);

  const bud = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.085, 6), mat);
  bud.rotation.order = "YXZ";
  bud.rotation.set(0.5, a + Math.PI, 0);
  bud.position.set(-Math.cos(a) * 0.035, h + 0.02, -Math.sin(a) * 0.035);
  bud.castShadow = true;
  g.add(bud);
  return g;
}

// Butterfly pea (Clitoria ternatea): a twining vine whose flower is one big
// rounded standard petal with a pale flash at its throat.
function buildButterflyPea(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial(v.stem ?? "#6f9a46", { rough: 0.82 });
  const leafMat = plainLeafMaterial(v.leaf ?? "#5aa348");
  const leafGeo = new THREE.PlaneGeometry(0.05, 0.062);
  leafGeo.translate(0, 0.031, 0);

  const vines = 3;
  for (let i = 0; i < vines; i++) {
    const a = (i / vines) * Math.PI * 2 + jitter(0.4);
    const reach = 0.1 + Math.random() * 0.06;
    const rise = 0.2 + Math.random() * 0.09;
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0.01, 0),
      new THREE.Vector3(Math.cos(a) * 0.03, rise * 0.5, Math.sin(a) * 0.03),
      new THREE.Vector3(Math.cos(a) * reach * 0.8, rise, Math.sin(a) * reach * 0.8),
      new THREE.Vector3(Math.cos(a) * reach, rise * 0.8, Math.sin(a) * reach),
    );
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.004, 4), stemMat));
    for (let j = 1; j <= 4; j++) {
      const p = curve.getPoint(j / 5);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.copy(p);
      leaf.rotation.order = "YXZ";
      leaf.rotation.set(1.2 + jitter(0.3), a + jitter(1.0), 0);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }

  // the standard petal, big and flat, with the keel tucked under it
  // The standard is one broad petal with a white-into-cream flash running out
  // of the throat, which is the whole of what a butterfly pea looks like.
  const petal = v.petal ?? "#4a35b0";
  const flash = v.flash ?? "#eef0c0";
  const petalMat = paintedLeafMaterial(`clitoria:${petal}:${flash}`, (ctx) => {
    standardOutline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = petal;
    ctx.fillRect(0, 0, 128, 128);
    const grad = ctx.createRadialGradient(64, 104, 4, 64, 104, 62);
    grad.addColorStop(0, flash);
    grad.addColorStop(0.45, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#2a1f5c";
    ctx.lineWidth = 1.4;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(64, 120);
      ctx.quadraticCurveTo(64 + i * 12, 70, 64 + i * 15, 20);
      ctx.stroke();
    }
    ctx.restore();
  });
  const keelMat = craftMaterial(v.keel ?? "#8f7ad1", { rough: 0.66 });
  for (let f = 0; f < 2; f++) {
    const a = f * 2.3 + jitter(0.5);
    const px = Math.cos(a) * 0.07;
    const pz = Math.sin(a) * 0.07;
    const py = 0.15 + Math.random() * 0.05;
    const bloom = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.095), petalMat);
    bloom.rotation.order = "YXZ";
    bloom.rotation.set(-0.5, a, 0);
    bloom.position.set(px, py, pz);
    bloom.castShadow = true;
    g.add(bloom);
    const keel = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), keelMat);
    keel.scale.set(1, 0.6, 1.5);
    keel.position.set(px, py - 0.022, pz);
    g.add(keel);
  }
  return g;
}

// Lantana: toothed leaves under a tight dome of many tiny florets, the outer
// ring usually a shade off the middle.
function buildLantana(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial(v.stem ?? "#6f8a42", { rough: 0.85 });
  const leafMat = plainLeafMaterial(v.leaf ?? "#5f9a46", toothedOutline, "toothed");
  const leafGeo = new THREE.PlaneGeometry(0.05, 0.06);
  leafGeo.translate(0, 0.03, 0);
  const inner = craftMaterial(v.bloom ?? "#a04ac0", { rough: 0.6 });
  const outer = craftMaterial(v.bloomEdge ?? v.bloom ?? "#c46ad8", { rough: 0.6 });

  const stems = 3;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + jitter(0.4);
    const h = 0.14 + Math.random() * 0.07;
    const px = Math.cos(a) * 0.035;
    const pz = Math.sin(a) * 0.035;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, h, 5), stemMat);
    stem.position.set(px, h / 2, pz);
    stem.rotation.z = -Math.cos(a) * 0.18;
    stem.rotation.x = Math.sin(a) * 0.18;
    g.add(stem);

    // leaves in opposite pairs up the stem
    for (let i = 1; i <= 2; i++) {
      for (const side of [0, Math.PI]) {
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.rotation.order = "YXZ";
        leaf.rotation.set(1.1 + jitter(0.2), a + side, 0);
        leaf.position.set(px, (h * i) / 3, pz);
        leaf.castShadow = true;
        g.add(leaf);
      }
    }

    // the flower dome: florets packed on a shallow cap
    const head = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const fa = Math.random() * Math.PI * 2;
      const fr = Math.sqrt(Math.random()) * 0.026;
      const floret = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 6, 5),
        fr > 0.016 ? outer : inner,
      );
      floret.scale.y = 0.55;
      floret.position.set(Math.cos(fa) * fr, 0.012 - fr * 0.25, Math.sin(fa) * fr);
      head.add(floret);
    }
    head.position.set(px, h, pz);
    g.add(head);
  }
  return g;
}

// Coleus: grown for the leaves, not the spike. Magenta blades with a scalloped
// yellow margin, in opposite pairs up short square stems.
function buildColeus(v = {}) {
  const g = new THREE.Group();
  const base = v.leaf ?? "#a51e63";
  const margin = v.margin ?? "#d8d84a";
  const vein = v.vein ?? "#d88ab0";
  const mat = paintedLeafMaterial(`coleus:${base}:${margin}:${vein}`, (ctx) => {
    toothedOutline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    // the margin is painted by stroking the outline from the inside
    ctx.strokeStyle = margin;
    ctx.lineWidth = 9;
    toothedOutline(ctx);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = vein;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(64, 120);
    ctx.lineTo(64, 12);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const y = 30 + i * 18;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(64, y + 10);
        ctx.quadraticCurveTo(64 + s * 22, y + 2, 64 + s * 36, y - 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  const stemMat = craftMaterial(v.stem ?? "#8a5a6a", { rough: 0.85 });
  const leafGeo = new THREE.PlaneGeometry(0.085, 0.1);
  leafGeo.translate(0, 0.05, 0);
  const stems = v.stems ?? 3;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + jitter(0.4);
    const h = 0.15 + Math.random() * 0.07;
    const px = Math.cos(a) * 0.03;
    const pz = Math.sin(a) * 0.03;
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.009, h, 0.009), stemMat);
    stem.position.set(px, h / 2, pz);
    g.add(stem);
    // three pairs, each turned a quarter from the pair below it
    for (let i = 1; i <= 3; i++) {
      const twist = a + (i % 2) * (Math.PI / 2);
      for (const side of [0, Math.PI]) {
        const leaf = new THREE.Mesh(leafGeo, mat);
        const sc = 0.7 + i * 0.14;
        leaf.scale.setScalar(sc);
        leaf.rotation.order = "YXZ";
        leaf.rotation.set(0.9 + jitter(0.2), twist + side, 0);
        leaf.position.set(px, (h * i) / 3.4, pz);
        leaf.castShadow = true;
        g.add(leaf);
      }
    }
  }
  return g;
}

// Drimiopsis: a low rosette of blotched blades with a short white raceme
// standing out of the middle of it.
function buildDrimiopsis(v = {}) {
  const g = new THREE.Group();
  const base = v.leaf ?? "#b8c9a0";
  const spot = v.spot ?? "#3f6b34";
  const mat = paintedLeafMaterial(`drimiopsis:${base}:${spot}`, (ctx) => {
    heartOutline(ctx);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = spot;
    for (let i = 0; i < 54; i++) {
      const x = 64 + (Math.random() - 0.5) * 96;
      const y = 10 + Math.random() * 108;
      const r = 3 + Math.random() * 7;
      ctx.globalAlpha = 0.55 + Math.random() * 0.35;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  const stemMat = craftMaterial(v.stem ?? "#7fa06a", { rough: 0.8 });
  const blade = new THREE.PlaneGeometry(0.1, 0.11);
  blade.translate(0, 0.055, 0);
  const leaves = v.leaves ?? 5 + ((Math.random() * 3) | 0);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + jitter(0.3);
    const h = 0.04 + Math.random() * 0.04;
    const petiole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, h, 5), stemMat);
    petiole.position.set(Math.cos(a) * 0.015, h / 2, Math.sin(a) * 0.015);
    g.add(petiole);
    const leaf = new THREE.Mesh(blade, mat);
    leaf.rotation.order = "YXZ";
    leaf.rotation.set(1.15 + jitter(0.2), a, 0);
    leaf.position.set(Math.cos(a) * 0.02, h, Math.sin(a) * 0.02);
    leaf.castShadow = true;
    g.add(leaf);
  }

  // the raceme: buds packed up a bare scape, greenest at the tip
  const budMat = craftMaterial(v.bud ?? "#eef2e0", { rough: 0.65 });
  const tipMat = craftMaterial(v.budTip ?? "#d8e888", { rough: 0.65 });
  for (let s = 0; s < (v.spikes ?? 2); s++) {
    const sa = Math.random() * Math.PI * 2;
    const sx = Math.cos(sa) * 0.02;
    const sz = Math.sin(sa) * 0.02;
    const h = 0.15 + Math.random() * 0.05;
    const scape = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, h, 5), stemMat);
    scape.position.set(sx, h / 2, sz);
    g.add(scape);
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const bud = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075 * (1 - t * 0.45), 6, 5),
        t > 0.7 ? tipMat : budMat,
      );
      const ba = i * 2.4;
      bud.position.set(
        sx + Math.cos(ba) * 0.006 * (1 - t * 0.5),
        h + t * 0.05,
        sz + Math.sin(ba) * 0.006 * (1 - t * 0.5),
      );
      g.add(bud);
    }
  }
  return g;
}

// Kalanchoe: fleshy scalloped paddles with a pink margin, and a flat-topped
// cluster of small tubular florets on top.
function buildKalanchoe(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial(v.stem ?? "#8a7a5c", { rough: 0.85 });
  const leafMat = craftMaterial(v.leaf ?? "#9ab08a", { rough: 0.58 });
  const edgeMat = craftMaterial(v.edge ?? "#d98a8a", { rough: 0.6 });
  const floretMat = craftMaterial(v.bloom ?? "#e0452a", { rough: 0.62 });
  const budMat = craftMaterial(v.bud ?? "#e8a04a", { rough: 0.62 });

  const stems = v.stems ?? 3;
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + jitter(0.4);
    const h = 0.16 + Math.random() * 0.07;
    const px = Math.cos(a) * 0.035;
    const pz = Math.sin(a) * 0.035;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, h, 5), stemMat);
    stem.position.set(px, h / 2, pz);
    stem.rotation.z = -Math.cos(a) * 0.2;
    stem.rotation.x = Math.sin(a) * 0.2;
    g.add(stem);

    for (let i = 1; i <= 3; i++) {
      const twist = a + (i % 2) * (Math.PI / 2);
      for (const side of [0, Math.PI]) {
        const dir = twist + side;
        const pad = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), leafMat);
        pad.scale.set(1, 0.28, 0.8);
        pad.position.set(
          px + Math.cos(dir) * 0.026,
          (h * i) / 3.4,
          pz + Math.sin(dir) * 0.026,
        );
        pad.rotation.set(0, -dir, 0.35);
        pad.castShadow = true;
        g.add(pad);
        // the blushed margin: a slightly wider, flatter paddle showing only at
        // the rim of the green one
        const rim = new THREE.Mesh(new THREE.SphereGeometry(0.029, 10, 8), edgeMat);
        rim.scale.set(1, 0.22, 0.82);
        rim.position.copy(pad.position);
        rim.rotation.copy(pad.rotation);
        g.add(rim);
      }
    }

    // the corymb — florets on short pedicels, all reaching the same height
    for (let i = 0; i < 16; i++) {
      const fa = Math.random() * Math.PI * 2;
      const fr = Math.sqrt(Math.random()) * 0.03;
      const fy = h + 0.03 - fr * 0.3;
      const pedicel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0018, 0.0018, 0.03, 4),
        stemMat,
      );
      pedicel.position.set(px + Math.cos(fa) * fr * 0.6, fy - 0.015, pz + Math.sin(fa) * fr * 0.6);
      g.add(pedicel);
      const floret = new THREE.Mesh(
        new THREE.SphereGeometry(0.0065, 7, 6),
        i % 3 === 0 ? budMat : floretMat,
      );
      floret.scale.set(1, 1.5, 1);
      floret.position.set(px + Math.cos(fa) * fr, fy, pz + Math.sin(fa) * fr);
      floret.rotation.set(jitter(0.4), 0, jitter(0.4));
      g.add(floret);
    }
  }
  return g;
}

// Purple shamrock (Oxalis triangularis): trefoils of deep purple triangles that
// fold at night, with pale pink bells over them.
function buildOxalis(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial(v.stem ?? "#9a7fa8", { rough: 0.82 });
  const leafMat = craftMaterial(v.leaf ?? "#6e3d66", { rough: 0.66 });
  leafMat.side = THREE.DoubleSide;

  // one leaflet: a wide triangle notched on its outer edge, hinged at the point
  const tri = new THREE.Shape();
  tri.moveTo(0, 0);
  tri.bezierCurveTo(0.03, 0.04, 0.054, 0.054, 0.046, 0.068);
  tri.bezierCurveTo(0.036, 0.078, 0.014, 0.066, 0, 0.05);
  tri.bezierCurveTo(-0.014, 0.066, -0.036, 0.078, -0.046, 0.068);
  tri.bezierCurveTo(-0.054, 0.054, -0.03, 0.04, 0, 0);
  tri.closePath();
  const leafletGeo = new THREE.ShapeGeometry(tri);

  const stalks = v.stalks ?? 6 + ((Math.random() * 3) | 0);
  for (let s = 0; s < stalks; s++) {
    const a = (s / stalks) * Math.PI * 2 + jitter(0.4);
    const h = 0.07 + Math.random() * 0.09;
    const px = Math.cos(a) * 0.02;
    const pz = Math.sin(a) * 0.02;
    const tx = Math.cos(a) * 0.03;
    const tz = Math.sin(a) * 0.03;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0035, h, 5), stemMat);
    stalk.position.set((px + tx) / 2, h / 2, (pz + tz) / 2);
    stalk.rotation.order = "YXZ";
    stalk.rotation.set(0.3, a + Math.PI / 2, 0);
    g.add(stalk);

    for (let i = 0; i < 3; i++) {
      const la = a + (i / 3) * Math.PI * 2;
      const leaflet = new THREE.Mesh(leafletGeo, leafMat);
      leaflet.rotation.order = "YXZ";
      leaflet.rotation.set(Math.PI / 2 - 0.22 - jitter(0.12), la, 0);
      leaflet.position.set(tx, h, tz);
      leaflet.castShadow = true;
      g.add(leaflet);
    }
  }

  // the flowers: little pale trumpets held above the leaves
  const petalMat = tepalMaterial({ tepal: v.petal ?? "#f0d8e8", throat: v.throat ?? "#d8e888" });
  for (let f = 0; f < 4; f++) {
    const a = Math.random() * Math.PI * 2;
    const h = 0.16 + Math.random() * 0.05;
    const px = Math.cos(a) * 0.03;
    const pz = Math.sin(a) * 0.03;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, h, 4), stemMat);
    stalk.position.set(px, h / 2, pz);
    g.add(stalk);
    const head = flowerHead(petalMat, {
      petals: 5,
      len: 0.026,
      width: 0.018,
      rise: 0.7,
      r: 0.003,
    });
    head.position.set(px, h, pz);
    head.rotation.y = Math.random() * Math.PI;
    g.add(head);
  }
  return g;
}

// ---------------------------------------------------------------------------
// The printed miniature set, second wave
// ---------------------------------------------------------------------------
// More of the resin/FDM miniatures sold alongside the plants: a branch bench, a
// covered wagon, a winch well, a pagoda watchtower, a porched cottage, a fairy
// tower, and the chanterelles people tuck in beside the moss. Same rules as the
// first wave — matte craft materials, roughly an inch tall, and no piece bigger
// than the jar it has to fit inside.

// A rustic bench built out of knobbly branches: split-log seat, forked legs,
// and an upright palisade back under an arched top rail.
function buildBranchBench(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#b3663f", { rough: 0.92, flat: true });
  const dark = craftMaterial(v.dark ?? "#96522f", { rough: 0.94, flat: true });
  const w = 0.26;
  const seatY = 0.062;

  // four legs, each a short length of branch with a knot swelling at the foot
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.016, seatY, 6),
        dark,
      );
      leg.position.set(sx * w * 0.4, seatY / 2, sz * 0.038);
      leg.rotation.z = sx * 0.1;
      leg.castShadow = true;
      g.add(leg);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 7, 6), dark);
      knot.scale.y = 0.55;
      knot.position.set(sx * w * 0.4, 0.008, sz * 0.038);
      g.add(knot);
    }
  }

  // the seat: a split log, flat on top and bellied underneath
  const seat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, 0.1), wood);
  seat.position.y = seatY + 0.009;
  seat.castShadow = true;
  g.add(seat);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, w, 10, 1, false, 0, Math.PI), wood);
  belly.rotation.set(0, 0, Math.PI / 2);
  belly.rotation.order = "YXZ";
  belly.scale.set(1, 1, 0.26);
  belly.position.y = seatY + 0.004;
  g.add(belly);

  // the arms — a rolled log end on a short post at each side
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.05, 6), dark);
    post.position.set(sx * w * 0.48, seatY + 0.043, -0.01);
    g.add(post);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.075, 8), wood);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(sx * w * 0.48, seatY + 0.07, 0.012);
    roll.castShadow = true;
    g.add(roll);
  }

  // the back: branches of uneven height, a few forked, under an arched rail
  const uprights = 9;
  for (let i = 0; i < uprights; i++) {
    const t = i / (uprights - 1);
    const x = (t - 0.5) * w * 0.86;
    // tallest in the middle, following the arch of the rail
    const h = 0.05 + Math.sin(t * Math.PI) * 0.05 + jitter(0.008);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.008, h, 5),
      i % 2 ? wood : dark,
    );
    stick.position.set(x, seatY + 0.018 + h / 2, -0.04);
    stick.rotation.z = jitter(0.12);
    stick.castShadow = true;
    g.add(stick);
    if (i % 3 === 1) {
      // a fork branching off the taller sticks
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 5), wood);
      fork.position.set(x + 0.012, seatY + 0.018 + h * 0.8, -0.04);
      fork.rotation.z = -0.6;
      g.add(fork);
    }
  }
  // the arched top rail, sampled as short segments along a shallow curve
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const t = (i + 0.5) / segs;
    const x = (t - 0.5) * w * 0.96;
    const y = seatY + 0.09 + Math.sin(t * Math.PI) * 0.022;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, w / segs + 0.006, 6), wood);
    rail.rotation.z = Math.PI / 2 - Math.cos(t * Math.PI) * 0.4;
    rail.position.set(x, y, -0.04);
    rail.castShadow = true;
    g.add(rail);
  }
  return g;
}

// A pioneer wagon: planked bed on spoked wheels, a hooped canvas tilt with a
// dark opening at the back, a driver's bench and the draught pole out front.
function buildCoveredWagon(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#b3663f", { rough: 0.92, flat: true });
  const dark = craftMaterial(v.dark ?? "#96522f", { rough: 0.94, flat: true });
  const canvas = craftMaterial(v.canvas ?? "#b3663f", { rough: 0.95 });
  const shade = craftMaterial("#2a1a12", { rough: 1 });
  const L = 0.2;
  const W = 0.1;
  const bedY = 0.055;

  const bed = new THREE.Mesh(new THREE.BoxGeometry(L, 0.022, W), wood);
  bed.position.y = bedY;
  bed.castShadow = true;
  g.add(bed);

  // the tilt: a half-cylinder of canvas over the bed, ribbed by its hoops
  const tilt = new THREE.Mesh(
    new THREE.CylinderGeometry(W * 0.56, W * 0.56, L * 0.86, 16, 1, true, 0, Math.PI),
    canvas,
  );
  tilt.material.side = THREE.DoubleSide;
  tilt.rotation.set(0, 0, Math.PI / 2);
  tilt.rotation.order = "YXZ";
  tilt.position.set(-L * 0.04, bedY + 0.012, 0);
  tilt.castShadow = true;
  g.add(tilt);
  for (let i = 0; i < 4; i++) {
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(W * 0.57, 0.004, 5, 14, Math.PI),
      dark,
    );
    hoop.rotation.z = 0;
    hoop.position.set(-L * 0.4 + i * (L * 0.72) / 3, bedY + 0.012, 0);
    hoop.rotation.y = Math.PI / 2;
    g.add(hoop);
  }
  // the gathered ends: a dark mouth at the front, cinched canvas behind
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(W * 0.4, 14, 0, Math.PI), shade);
  mouth.rotation.z = 0;
  mouth.position.set(L * 0.395, bedY + 0.012, 0);
  mouth.rotation.y = Math.PI / 2;
  g.add(mouth);
  const stern = new THREE.Mesh(new THREE.SphereGeometry(W * 0.55, 12, 8, 0, Math.PI), canvas);
  stern.rotation.y = -Math.PI / 2;
  stern.scale.set(0.45, 1, 1);
  stern.position.set(-L * 0.43, bedY + 0.012, 0);
  g.add(stern);

  // the driver's footboard and bench, out in front of the tilt
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, W * 0.9), wood);
  board.position.set(L * 0.56, bedY - 0.004, 0);
  g.add(board);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.01, W * 0.8), dark);
  bench.position.set(L * 0.47, bedY + 0.022, 0);
  g.add(bench);

  // the pole, with its swingletree at the tip
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.11, 6), wood);
  pole.rotation.z = Math.PI / 2 - 0.12;
  pole.position.set(L * 0.82, bedY - 0.022, 0);
  pole.castShadow = true;
  g.add(pole);
  const tree = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 6), dark);
  tree.rotation.x = Math.PI / 2;
  tree.position.set(L * 1.07, bedY - 0.035, 0);
  g.add(tree);

  // four spoked wheels, the rear pair larger, as they always are
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const R = sx < 0 ? 0.042 : 0.032;
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.006, 6, 20), wood));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0022, 0.0022, R * 2, 4),
          wood,
        );
        spoke.rotation.z = a;
        wheel.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.016, 8), dark);
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);
      wheel.position.set(sx * L * 0.3, R, sz * (W / 2 + 0.012));
      wheel.castShadow = true;
      g.add(wheel);
    }
  }
  return g;
}

// A log-built wishing well with the winch wheel standing clear of the roof —
// stacked log courses, a shingled pitch on two posts, and a bucket on the rim.
function buildWheelWell(v = {}) {
  const g = new THREE.Group();
  const wood = craftMaterial(v.wood ?? "#b3663f", { rough: 0.92, flat: true });
  const dark = craftMaterial(v.dark ?? "#96522f", { rough: 0.94, flat: true });
  const shade = craftMaterial("#2a1a12", { rough: 1 });
  const W = 0.13;
  const courses = 4;
  const logR = 0.011;

  // the curb: four log courses, the ends crossing at the corners
  for (let c = 0; c < courses; c++) {
    const y = logR + c * logR * 1.9;
    const along = c % 2 === 0;
    for (const s of [-1, 1]) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(logR, logR, W + 0.03, 8),
        c % 2 ? dark : wood,
      );
      log.rotation.z = Math.PI / 2;
      if (!along) log.rotation.y = Math.PI / 2;
      log.position.set(along ? 0 : s * W * 0.5, y, along ? s * W * 0.5 : 0);
      log.castShadow = true;
      g.add(log);
    }
  }
  const rimY = logR + (courses - 1) * logR * 1.9 + logR;
  const water = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.004, W * 0.82), shade);
  water.position.y = rimY - 0.012;
  g.add(water);

  // two posts carrying the roof, and the winch drum slung between them
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.1, 6), wood);
    post.position.set(sx * W * 0.42, rimY + 0.05, 0);
    post.castShadow = true;
    g.add(post);
  }
  // the drum runs from the wheel's hub across to the far post
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W * 1.3, 10), dark);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(-W * 0.3, rimY + 0.052, 0);
  g.add(drum);
  for (let i = 0; i < 7; i++) {
    // the rope coiled along the drum
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0022, 4, 12), wood);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(-W * 0.62 + i * (W * 0.64) / 6, rimY + 0.052, 0);
    g.add(coil);
  }

  // the big spoked wheel that cranks it, standing out past one post
  const wheel = new THREE.Group();
  const R = 0.048;
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.007, 6, 22), wood));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.82, 0.005, 5, 20), wood));
  for (let i = 0; i < 10; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, R * 2, 4), wood);
    spoke.rotation.z = (i / 10) * Math.PI * 2;
    wheel.add(spoke);
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8), dark));
  wheel.children[wheel.children.length - 1].rotation.x = Math.PI / 2;
  wheel.rotation.y = Math.PI / 2;
  wheel.position.set(-W * 1.02, rimY + 0.052, 0);
  wheel.castShadow = true;
  g.add(wheel);
  // the A-frame standard the wheel turns on
  const standard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.14, 0.016), wood);
  standard.position.set(-W * 1.12, rimY + 0.006, 0);
  standard.castShadow = true;
  g.add(standard);

  // a shingled pitch, laid course by course over both slopes
  const ridgeY = rimY + 0.108;
  for (const sz of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const shingle = new THREE.Mesh(new THREE.BoxGeometry(W * 1.35, 0.005, 0.028), dark);
      shingle.position.set(0, ridgeY - t * 0.03 - 0.004, sz * (0.012 + t * 0.045));
      shingle.rotation.x = sz * 0.62;
      shingle.castShadow = true;
      g.add(shingle);
    }
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, W * 1.4, 6), wood);
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = ridgeY + 0.004;
  g.add(ridge);

  // the bucket, hung on the rim
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.02, 9), dark);
  bucket.position.set(W * 0.34, rimY + 0.01, W * 0.3);
  bucket.castShadow = true;
  g.add(bucket);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0018, 4, 10, Math.PI), wood);
  handle.position.set(W * 0.34, rimY + 0.02, W * 0.3);
  g.add(handle);
  return g;
}

// A square stone watchtower with a pagoda crown: block courses, a hooded door
// over steps, a slit window, a railed gallery and a ball finial.
function buildPagodaTower(v = {}) {
  const g = new THREE.Group();
  const stone = craftMaterial(v.stone ?? "#c9b48d", { rough: 0.95, flat: true });
  const dark = craftMaterial(v.dark ?? "#ab9670", { rough: 0.95, flat: true });
  const shade = craftMaterial("#2a241c", { rough: 1 });
  const H = 0.2;
  const W = 0.1;

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W * 1.35, 0.016, W * 1.35), dark);
  plinth.position.y = 0.008;
  plinth.receiveShadow = true;
  g.add(plinth);

  // the shaft, battered slightly inward, drawn as stacked courses of blocks
  const courses = 7;
  for (let c = 0; c < courses; c++) {
    const t = c / courses;
    const k = W * (1 - t * 0.16);
    const course = new THREE.Mesh(
      new THREE.BoxGeometry(k, H / courses - 0.002, k),
      c % 2 ? stone : dark,
    );
    course.position.y = 0.016 + (c + 0.5) * (H / courses);
    course.castShadow = true;
    g.add(course);
  }
  const shaftTop = 0.016 + H;

  // the hooded doorway and its steps
  const doorW = W * 0.34;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.042, 0.006), shade);
  door.position.set(0, 0.016 + 0.026, W * 0.5 + 0.002);
  g.add(door);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.6, 0.008, 0.018), stone);
  hood.position.set(0, 0.016 + 0.052, W * 0.5 + 0.006);
  hood.rotation.x = 0.35;
  hood.castShadow = true;
  g.add(hood);
  for (const sx of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.046, 0.008), stone);
    jamb.position.set(sx * doorW * 0.6, 0.016 + 0.026, W * 0.5 + 0.004);
    g.add(jamb);
  }
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(doorW * 1.5, 0.007, 0.014), dark);
    step.position.set(0, 0.014 - i * 0.005, W * 0.54 + i * 0.013);
    g.add(step);
  }
  // the slit window above it, three bars deep
  for (let i = 0; i < 3; i++) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.022, 0.005), shade);
    slit.position.set((i - 1) * 0.009, 0.016 + H * 0.66, W * 0.46);
    g.add(slit);
  }

  // the gallery: a deck ringed by a low railing on turned posts
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 1.28, 0.008, W * 1.28), stone);
  deck.position.y = shaftTop + 0.004;
  deck.castShadow = true;
  g.add(deck);
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(sx ? 0.006 : W * 1.2, 0.004, sz ? 0.006 : W * 1.2),
      dark,
    );
    rail.position.set(sx * W * 0.6, shaftTop + 0.024, sz * W * 0.6);
    g.add(rail);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.02, 0.005), dark);
    // walk the square, not a circle: clamp the unit vector to the deck edge
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const m = Math.max(Math.abs(cx), Math.abs(cz));
    post.position.set((cx / m) * W * 0.58, shaftTop + 0.014, (cz / m) * W * 0.58);
    g.add(post);
  }

  // the lantern storey and its flared pagoda roof
  const lanternH = 0.03;
  const lantern = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.64, lanternH, W * 0.64),
    stone,
  );
  lantern.position.y = shaftTop + 0.034 + lanternH / 2;
  lantern.castShadow = true;
  g.add(lantern);
  for (const sz of [-1, 1]) {
    const opening = new THREE.Mesh(new THREE.BoxGeometry(W * 0.38, lanternH * 0.62, 0.004), shade);
    opening.position.set(0, shaftTop + 0.034 + lanternH / 2, sz * W * 0.33);
    g.add(opening);
  }
  const roofY = shaftTop + 0.034 + lanternH;
  const roof = flaredRoof(dark, W * 1.05, W * 1.05, 0.034);
  roof.position.y = roofY;
  g.add(roof);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.012, 8), stone);
  neck.position.y = roofY + 0.04;
  g.add(neck);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), stone);
  finial.position.y = roofY + 0.054;
  finial.castShadow = true;
  g.add(finial);
  return g;
}

// A storybook cottage with a porched side wing: steep gable with a round
// window, a chimney, a dormer, and a rail-and-post veranda reached by steps.
function buildPorchCottage(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#ece9e2", { rough: 0.92, flat: true });
  const roof = craftMaterial(v.roof ?? "#dcd8cf", { rough: 0.9, flat: true });
  const trim = craftMaterial(v.trim ?? "#cfcabf", { rough: 0.92, flat: true });
  const shade = craftMaterial(v.shade ?? "#8f8a80", { rough: 1 });
  const W = 0.1;
  const D = 0.09;
  const wallH = 0.085;

  const base = new THREE.Mesh(new THREE.BoxGeometry(W * 1.9, 0.01, D * 1.5), trim);
  base.position.set(W * 0.28, 0.005, 0);
  base.receiveShadow = true;
  g.add(base);

  // the main block
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, D), wall);
  body.position.set(-W * 0.36, 0.01 + wallH / 2, 0);
  body.castShadow = true;
  g.add(body);
  // its steep gable roof: two slopes meeting at a ridge
  const gableTop = 0.01 + wallH + 0.062;
  for (const sz of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(W * 1.16, 0.008, D * 0.78), roof);
    slope.position.set(-W * 0.36, 0.01 + wallH + 0.03, sz * D * 0.29);
    slope.rotation.x = sz * 0.92;
    slope.castShadow = true;
    g.add(slope);
  }
  // the gable end walls filling the triangle under the slopes
  for (const sz of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-W / 2, 0);
    tri.lineTo(W / 2, 0);
    tri.lineTo(0, 0.062);
    tri.closePath();
    const end = new THREE.Mesh(new THREE.ShapeGeometry(tri), wall);
    end.material.side = THREE.DoubleSide;
    end.position.set(-W * 0.36, 0.01 + wallH, (sz * D) / 2);
    g.add(end);
  }
  const roundWin = new THREE.Mesh(new THREE.CircleGeometry(0.012, 14), shade);
  roundWin.position.set(-W * 0.36, 0.01 + wallH + 0.022, D / 2 + 0.002);
  g.add(roundWin);
  for (const rot of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.003, 0.003), trim);
    bar.rotation.z = rot;
    bar.position.set(-W * 0.36, 0.01 + wallH + 0.022, D / 2 + 0.004);
    g.add(bar);
  }
  // the arched front door and its steps
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.042, 0.005), shade);
  door.position.set(-W * 0.36, 0.032, D / 2 + 0.002);
  g.add(door);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 12, 1, false, 0, Math.PI), shade);
  arch.rotation.set(Math.PI / 2, 0, 0);
  arch.position.set(-W * 0.36, 0.053, D / 2 + 0.002);
  g.add(arch);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.007, 0.013), trim);
    step.position.set(-W * 0.36, 0.009 - i * 0.003, D / 2 + 0.012 + i * 0.012);
    g.add(step);
    for (const sx of [-1, 1]) {
      const newel = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.016, 0.005), trim);
      newel.position.set(-W * 0.36 + sx * 0.02, 0.016 - i * 0.003, D / 2 + 0.012 + i * 0.012);
      g.add(newel);
    }
  }
  // the chimney
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.016), wall);
  stack.position.set(-W * 0.22, gableTop - 0.012, -D * 0.16);
  stack.castShadow = true;
  g.add(stack);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 0.022), trim);
  cap.position.set(-W * 0.22, gableTop + 0.014, -D * 0.16);
  g.add(cap);
  // a dormer poking out of the near slope
  const dormer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.018), wall);
  dormer.position.set(-W * 0.58, 0.01 + wallH + 0.024, D * 0.2);
  dormer.castShadow = true;
  g.add(dormer);
  const dormerRoof = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.022), roof);
  dormerRoof.rotation.x = 0.5;
  dormerRoof.position.set(-W * 0.58, 0.01 + wallH + 0.036, D * 0.2);
  g.add(dormerRoof);

  // the side wing, lower, with the veranda across its front
  const wingH = 0.05;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, wingH, D * 0.72), wall);
  wing.position.set(W * 0.52, 0.01 + wingH / 2, -D * 0.1);
  wing.castShadow = true;
  g.add(wing);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.008, D * 0.5), trim);
  deck.position.set(W * 0.52, 0.014, D * 0.28);
  g.add(deck);
  for (let i = 0; i < 4; i++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.046, 0.005), trim);
    post.position.set(W * 0.24 + i * (W * 0.56) / 3, 0.041, D * 0.46);
    post.castShadow = true;
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.004, 0.005), trim);
  rail.position.set(W * 0.52, 0.03, D * 0.46);
  g.add(rail);
  // the veranda's shed roof, and a matching slope over the wing
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.006, D * 0.62), roof);
  porchRoof.rotation.x = 0.42;
  porchRoof.position.set(W * 0.52, 0.07, D * 0.3);
  porchRoof.castShadow = true;
  g.add(porchRoof);
  for (const sz of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.006, D * 0.42), roof);
    slope.position.set(W * 0.52, 0.01 + wingH + 0.016, -D * 0.1 + sz * D * 0.17);
    slope.rotation.x = sz * 0.75;
    slope.castShadow = true;
    g.add(slope);
  }
  return g;
}

// A fairy tower: a round turret with a tall shingled cone and a spire, a gabled
// entry porch at its foot, and a crooked stovepipe chimney out of the side.
function buildFairyTower(v = {}) {
  const g = new THREE.Group();
  const wall = craftMaterial(v.wall ?? "#ece9e2", { rough: 0.92, flat: true });
  const roof = craftMaterial(v.roof ?? "#dcd8cf", { rough: 0.9, flat: true });
  const trim = craftMaterial(v.trim ?? "#cfcabf", { rough: 0.92, flat: true });
  const shade = craftMaterial(v.shade ?? "#8f8a80", { rough: 1 });
  const R = 0.05;
  const towerH = 0.12;

  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.6, R * 1.65, 0.012, 28), trim);
  plate.position.y = 0.006;
  plate.receiveShadow = true;
  g.add(plate);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R, towerH, 22), wall);
  tower.position.y = 0.012 + towerH / 2;
  tower.castShadow = true;
  g.add(tower);
  // the scattered pebble bosses that print sets always stud these with
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = 0.03 + Math.random() * (towerH - 0.04);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 5), wall);
    boss.position.set(Math.cos(a) * R * 0.93, y, Math.sin(a) * R * 0.93);
    g.add(boss);
  }
  // the pointed lancet window on the front
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.024, 0.005), shade);
  win.position.set(0, 0.012 + towerH * 0.6, R * 0.9);
  g.add(win);
  const winTop = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.012, 4), shade);
  winTop.rotation.y = Math.PI / 4;
  winTop.position.set(0, 0.012 + towerH * 0.6 + 0.018, R * 0.9);
  g.add(winTop);

  // the cone, laid as overlapping shingle courses so it is not a bare spike
  const coneY = 0.012 + towerH;
  const coneH = 0.1;
  const courses = 6;
  for (let i = 0; i < courses; i++) {
    const t = i / courses;
    const rr = R * 1.18 * (1 - t);
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(rr * 0.82, rr, coneH / courses + 0.004, 20, 1, true),
      roof,
    );
    band.material.side = THREE.DoubleSide;
    band.position.y = coneY + t * coneH + coneH / courses / 2;
    band.castShadow = true;
    g.add(band);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.036, 10), roof);
  spire.position.y = coneY + coneH + 0.016;
  spire.castShadow = true;
  g.add(spire);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), trim);
  ball.position.y = coneY + coneH + 0.04;
  g.add(ball);
  // a dormer sitting in the cone
  const dormer = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.014), wall);
  dormer.position.set(0, coneY + 0.026, R * 0.78);
  g.add(dormer);
  const dormerCap = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.016, 4), roof);
  dormerCap.rotation.y = Math.PI / 4;
  dormerCap.position.set(0, coneY + 0.042, R * 0.78);
  g.add(dormerCap);

  // the entry porch at the foot, with its own steep gable and arched door
  const porchH = 0.05;
  const porch = new THREE.Mesh(new THREE.BoxGeometry(0.05, porchH, 0.03), wall);
  porch.position.set(0, 0.012 + porchH / 2, R * 0.85);
  porch.castShadow = true;
  g.add(porch);
  for (const sz of [1, -1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.005, 0.026), roof);
    slope.position.set(0, 0.012 + porchH + 0.009, R * 0.85 + sz * 0.009);
    slope.rotation.x = sz * 0.8;
    slope.castShadow = true;
    g.add(slope);
  }
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.011, 0.006, 12, 1, false, 0, Math.PI),
    shade,
  );
  arch.rotation.set(Math.PI / 2, 0, 0);
  arch.position.set(0, 0.012 + 0.03, R * 0.85 + 0.016);
  g.add(arch);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.005), shade);
  leaf.position.set(0, 0.012 + 0.015, R * 0.85 + 0.016);
  g.add(leaf);

  // the stovepipe, leaning out of the side of the turret
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8), wall);
  pipe.rotation.z = -0.35;
  pipe.position.set(R * 0.95, 0.012 + towerH * 0.78, 0);
  pipe.castShadow = true;
  g.add(pipe);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 8), trim);
  collar.rotation.z = -0.35;
  collar.position.set(R * 1.05, 0.012 + towerH * 0.78 + 0.026, 0);
  g.add(collar);
  return g;
}

// Chanterelles: funnel caps with a wavy rim and false gills running down the
// stem, in a little troop the way they actually fruit.
function buildChanterelle(v = {}) {
  const g = new THREE.Group();
  const capColor = v.cap ?? "#e0922f";
  const capMat = craftMaterial(capColor, { rough: 0.82 });
  capMat.side = THREE.DoubleSide;
  const gillMat = craftMaterial(v.gill ?? "#c97a2a", { rough: 0.88 });
  gillMat.side = THREE.DoubleSide;
  const stemMat = craftMaterial(v.stem ?? "#8a5a3a", { rough: 0.9 });

  const troop = [
    { x: 0, z: 0, s: 1 },
    { x: -0.05, z: 0.03, s: 0.62 },
    { x: 0.045, z: 0.035, s: 0.5 },
  ];
  for (const m of troop) {
    const h = 0.12 * m.s;
    const capR = 0.055 * m.s;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(capR * 0.34, capR * 0.16, h, 10),
      stemMat,
    );
    stem.position.set(m.x, h / 2, m.z);
    stem.castShadow = true;
    g.add(stem);

    // the cap is a shallow funnel: a lathe flaring up and out from the stem,
    // then its rim pushed into waves so it reads as a chanterelle and not a
    // parasol
    const pts = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = capR * (0.34 + Math.pow(t, 0.7) * 0.66);
      // dished in the middle, lifting again at the edge
      const y = h + (-0.03 + Math.pow(t, 2.2) * 0.05) * m.s;
      pts.push(new THREE.Vector2(r, y));
    }
    const capGeo = new THREE.LatheGeometry(pts, 30);
    const p = capGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const rr = Math.hypot(x, z);
      const edge = Math.min(1, rr / capR);
      const wave = Math.sin(Math.atan2(z, x) * 7) * 0.007 * m.s * Math.pow(edge, 4);
      p.setY(i, p.getY(i) + wave);
      if (rr > 0.0001) {
        const k = 1 + Math.pow(edge, 4) * Math.sin(Math.atan2(z, x) * 7 + 1.2) * 0.05;
        p.setX(i, x * k);
        p.setZ(i, z * k);
      }
    }
    capGeo.computeVertexNormals();
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.castShadow = true;
    g.add(cap);
    cap.position.set(m.x, 0, m.z);

    // the false gills: blunt ridges running from under the rim onto the stem
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const gill = new THREE.Mesh(new THREE.PlaneGeometry(capR * 0.42, 0.009 * m.s), gillMat);
      gill.rotation.order = "YXZ";
      gill.rotation.set(Math.PI / 2, a, 0.55);
      gill.position.set(
        m.x + Math.cos(a) * capR * 0.52,
        h - 0.016 * m.s,
        m.z + Math.sin(a) * capR * 0.52,
      );
      g.add(gill);
    }
  }
  // the flat pad of litter the troop is printed on
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.008, 20), stemMat);
  pad.position.y = 0.004;
  pad.receiveShadow = true;
  g.add(pad);
  return g;
}
