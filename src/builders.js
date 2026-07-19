import * as THREE from "three";
import { BASE_BY_ID, BASE_LAYERS, DECOR_BY_ID } from "./catalog.js";
import { JAR, heightAt, jarGridR, TERRAIN_N } from "./state.js";

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
// Substrate layers
// ---------------------------------------------------------------------------

// Build one substrate layer as a short cylinder whose top rim is gently uneven,
// with speckled vertex colours. `isTop` layers get scattered grains/pebbles on
// their surface for texture; buried layers stay smooth to save geometry.
export function buildLayer(layer, baseY, isTop) {
  const def = BASE_BY_ID[layer.type];
  const group = new THREE.Group();
  const r = JAR.innerRadius - 0.02;

  const geo = new THREE.CylinderGeometry(r, r, layer.height, 40, 2, false);
  // Tilt + jitter the top surface: a gentle directional slope (real substrate
  // is banked asymmetrically for depth) plus per-vertex noise so sediment
  // settles unevenly.
  const sx = layer.slopeX || 0;
  const sz = layer.slopeZ || 0;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > layer.height / 2 - 1e-3) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, y + x * sx + z * sz + jitter(layer.height * 0.25));
    }
  }
  geo.scale(JAR.stretchX, 1, 1); // elliptical footprint for lying bottles
  geo.computeVertexNormals();
  speckleColors(geo, def.colors);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
  });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.y = baseY + layer.height / 2;
  cyl.castShadow = false;
  cyl.receiveShadow = true;
  group.add(cyl);

  if (isTop) {
    group.add(scatterGrains(def, baseY + layer.height / 2));
  }
  return group;
}

// Scatter little instanced stones/grains across a layer surface.
function scatterGrains(def, topY) {
  const chunky = def.chunky;
  const count = chunky ? 90 : 140;
  const size = chunky ? 0.07 : 0.03;
  const geo = chunky
    ? new THREE.IcosahedronGeometry(size, 0)
    : new THREE.TetrahedronGeometry(size, 0);
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
  const rMax = JAR.innerRadius - 0.08;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * rMax;
    const x = Math.cos(a) * rad * JAR.stretchX;
    const z = Math.sin(a) * rad;
    e.set(jitter(Math.PI), jitter(Math.PI), jitter(Math.PI));
    q.setFromEuler(e);
    const sc = 0.6 + Math.random() * 0.9;
    s.set(sc, sc * (chunky ? 0.7 : 1), sc);
    m.compose(new THREE.Vector3(x, topY + size * 0.4, z), q, s);
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
export function buildTerrainCap(def) {
  const rings = 14;
  const sectors = 48;
  const R = JAR.innerRadius - 0.03;

  const positions = [0, 0, 0]; // centre vertex
  const jitters = [0];
  const ringT = [0]; // 0..1 radial position; 2 marks skirt vertices
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * R;
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      positions.push(Math.cos(a) * rad * JAR.stretchX, 0, Math.sin(a) * rad);
      jitters.push(jitter(0.012));
      ringT.push(r / rings);
    }
  }
  // skirt: a second copy of the outer rim that drops below the surface, so
  // the terrain reads as a solid mass instead of a floating shell
  const rimStart = 1 + (rings - 1) * sectors;
  const skirtStart = 1 + rings * sectors;
  for (let s = 0; s < sectors; s++) {
    const a = (s / sectors) * Math.PI * 2;
    positions.push(Math.cos(a) * R * JAR.stretchX, 0, Math.sin(a) * R);
    jitters.push(0);
    ringT.push(2);
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
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.jitters = jitters;
  mesh.userData.ringT = ringT;
  // per-vertex random seeds so painted materials keep a stable grain
  mesh.userData.seeds = jitters.map(() => (Math.random() * 1024) | 0);
  mesh.userData.fallbackDef = def;
  return mesh;
}

// Re-project the cap's vertices from the current heightfield.
export function updateTerrainCap(mesh, state, baseY) {
  const pos = mesh.geometry.attributes.position;
  const jitters = mesh.userData.jitters;
  const ringT = mesh.userData.ringT;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (ringT[i] === 2) {
      // skirt: tuck well below the surface so the side wall closes any gap
      pos.setY(i, baseY - 0.12);
      continue;
    }
    // fade sculpted height to zero at the rim so the edge always sits flush
    // on the layer beneath — no more floating sheet
    const fade = ringT[i] <= 0.82 ? 1 : Math.max(0, (1 - ringT[i]) / 0.18);
    pos.setY(i, baseY + 0.005 + heightAt(state, x, z) * fade + jitters[i]);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();

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
    const hex = def.colors[seeds[i] % def.colors.length];
    _c.set(hex);
    const k = 0.9 + ((seeds[i] % 37) / 37) * 0.2;
    colors.setXYZ(i, _c.r * k, _c.g * k, _c.b * k);
  }
  colors.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

// Return a fresh Object3D for a decoration kind. Every builder models around a
// ~0.35 unit footprint and sits on y=0 (the caller lifts/rotates/scales it).
// `v` is the catalog variant (colour/style overrides).
export function buildDecoration(kind, v = {}) {
  switch (kind) {
    case "moss":
      return buildMoss(v);
    case "leafy":
      return buildLeafy(v);
    case "fern":
      return buildFern(v);
    case "pink":
      return buildPink(v);
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
    case "shell":
      return buildShell(v);
    case "grass":
      return buildGrassTuft();
    case "snakeplant":
      return buildSnakePlant();
    case "deer":
      return buildDeer(v);
    case "pebblepatch":
      return buildPebblePatch();
    case "cactus":
      return buildCactus(v);
    case "flowers":
      return buildFlowers(v);
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
    transparent: true,
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

// A cluster of little daisies on thin stems.
function buildFlowers(v = {}) {
  const g = new THREE.Group();
  const stemMat = craftMaterial("#5f7a3c", { rough: 0.85 });
  const petals = v.petals ?? ["#f6f2ea", "#f2d3e2"];
  const petalMat = craftMaterial(petals[0], { rough: 0.65 });
  const petalMatAlt = craftMaterial(petals[petals.length - 1], { rough: 0.65 });
  const centerMat = craftMaterial("#e8b23a", { rough: 0.7 });
  const petalGeo = new THREE.CircleGeometry(0.022, 6);

  const flowers = 3 + ((Math.random() * 3) | 0);
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
    transparent: true,
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
  const g = new THREE.Group();
  const greens = ["#7a9c40", "#8bad4e", "#6b8c36", "#9cbb5e"];
  const blades = 5 + ((Math.random() * 4) | 0);
  for (let i = 0; i < blades; i++) {
    const h = 0.08 + Math.random() * 0.1;
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.008, h, 4),
      craftMaterial(greens[(Math.random() * greens.length) | 0], {
        rough: 0.85,
      }),
    );
    blade.position.set(jitter(0.04), h / 2, jitter(0.04));
    blade.rotation.set(jitter(0.4), Math.random() * Math.PI, jitter(0.4));
    blade.castShadow = true;
    g.add(blade);
  }
  return g;
}

function buildMoss(v = {}) {
  const g = new THREE.Group();
  const greens = v.colors ?? ["#5f8330", "#6f9a3a", "#7faa4a", "#557a2c"];
  // A low cushion: many small bumpy blobs packed into a rounded mound, densest
  // in the middle, so it reads as a soft pillow of moss rather than lumps.
  const blobs = 30 + ((Math.random() * 10) | 0);
  for (let i = 0; i < blobs; i++) {
    const rad = 0.03 + Math.random() * 0.038;
    const geo = new THREE.IcosahedronGeometry(rad, 2);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      p.setXYZ(
        v,
        p.getX(v) + jitter(0.018),
        p.getY(v) + jitter(0.018),
        p.getZ(v) + jitter(0.018),
      );
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(
      geo,
      craftMaterial(greens[(Math.random() * greens.length) | 0], {
        rough: 1.0,
      }),
    );
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.7) * 0.17;
    const mound = 1 - rr / 0.2; // taller toward the centre
    m.position.set(Math.cos(a) * rr, rad * 0.4 + mound * 0.05, Math.sin(a) * rr);
    m.scale.y = 0.8;
    m.castShadow = true;
    g.add(m);
  }
  // A few pale spore stalks (setae) poking up — a signature moss detail.
  const stalkMat = craftMaterial("#c7c98a", { rough: 0.9 });
  for (let s = 0; s < 3 + ((Math.random() * 3) | 0); s++) {
    const h = 0.1 + Math.random() * 0.08;
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.006, h, 5),
      stalkMat,
    );
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * 0.12;
    stalk.position.set(Math.cos(a) * rr, 0.08 + h / 2, Math.sin(a) * rr);
    stalk.rotation.z = jitter(0.25);
    g.add(stalk);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 8, 6),
      craftMaterial("#a98f52", { rough: 0.85 }),
    );
    cap.scale.z = 1.5;
    cap.position.set(stalk.position.x, 0.08 + h, stalk.position.z);
    g.add(cap);
  }
  return g;
}

function buildLeafy(v = {}) {
  const g = new THREE.Group();
  const leafMat = craftMaterial(v.leaf ?? "#3f7d4f", { rough: 0.8 });
  const leafMatDark = craftMaterial(v.dark ?? "#2f6640", { rough: 0.8 });
  const leaves = 6 + ((Math.random() * 3) | 0);

  // A single leaf: a flattened, slightly curled shape via a lathe-ish plane.
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.09, 0.12, 0.07, 0.4, 0, 0.5);
  leafShape.bezierCurveTo(-0.07, 0.4, -0.09, 0.12, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 10);
  // gently curl the leaf along its length
  const lp = leafGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const y = lp.getY(i);
    lp.setZ(i, lp.getZ(i) + Math.sin(y * 2.4) * 0.05);
  }
  leafGeo.computeVertexNormals();

  for (let i = 0; i < leaves; i++) {
    const mat = i % 3 === 0 ? leafMatDark : leafMat;
    const leaf = new THREE.Mesh(leafGeo, mat);
    leaf.material.side = THREE.DoubleSide;
    const a = (i / leaves) * Math.PI * 2 + jitter(0.3);
    const tilt = 0.5 + Math.random() * 0.5;
    leaf.rotation.set(-tilt, a, jitter(0.2));
    const sc = 0.8 + Math.random() * 0.5;
    leaf.scale.setScalar(sc);
    leaf.position.y = 0.02;
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

// Fittonia leaf texture: a deep-green oval with the plant's trademark pink
// vein network, painted once onto a shared canvas and alpha-masked.
const fittoniaTextures = new Map();
function getFittoniaTexture(vein = "#f29dbf") {
  if (fittoniaTextures.has(vein)) return fittoniaTextures.get(vein);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");

  // leaf body
  ctx.fillStyle = "#2e6b3a";
  ctx.beginPath();
  ctx.ellipse(64, 64, 44, 60, 0, 0, Math.PI * 2);
  ctx.fill();

  // vein network — bright pink midrib with branching laterals
  ctx.strokeStyle = vein;
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(64, 118);
  ctx.lineTo(64, 12);
  ctx.stroke();
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const y = 24 + i * 20;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64, y + 8);
      ctx.quadraticCurveTo(64 + s * 22, y - 2, 64 + s * 36, y - 10 + i * 3);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const y = 34 + i * 20;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(64 + s * 18, y);
      ctx.quadraticCurveTo(64 + s * 28, y + 8, 64 + s * 34, y + 4);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  fittoniaTextures.set(vein, tex);
  return tex;
}

// Fittonia (nerve plant): a low, creeping cluster of oval leaves with pink
// veining — sits close to the soil like the real plant.
function buildPink(v = {}) {
  const g = new THREE.Group();
  const leafMat = new THREE.MeshStandardMaterial({
    map: getFittoniaTexture(v.vein),
    transparent: true,
    alphaTest: 0.5,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  const stemMat = craftMaterial("#6b7a4a", { rough: 0.85 });
  const leafGeo = new THREE.PlaneGeometry(0.14, 0.19);

  const clusters = 3 + ((Math.random() * 2) | 0);
  for (let cl = 0; cl < clusters; cl++) {
    const cx = jitter(0.12);
    const cz = jitter(0.12);
    const stemH = 0.05 + Math.random() * 0.05;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.012, stemH, 5),
      stemMat,
    );
    stem.position.set(cx, stemH / 2, cz);
    g.add(stem);

    // a whorl of leaves splaying out from each stem, close to the ground
    const leaves = 4 + ((Math.random() * 3) | 0);
    for (let i = 0; i < leaves; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      const a = (i / leaves) * Math.PI * 2 + jitter(0.4);
      const droop = 0.9 + Math.random() * 0.4; // mostly horizontal
      leaf.position.set(
        cx + Math.cos(a) * 0.06,
        stemH + 0.015,
        cz + Math.sin(a) * 0.06,
      );
      leaf.rotation.set(-Math.PI / 2 + (1 - droop) * 0.8, 0, 0);
      leaf.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a);
      leaf.rotation.z += jitter(0.2);
      const sc = 0.8 + Math.random() * 0.4;
      leaf.scale.setScalar(sc);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  return g;
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
  const g = new THREE.Group();
  const rad = 0.12 + Math.random() * 0.08;
  const geo = new THREE.IcosahedronGeometry(rad, 1);
  const p = geo.attributes.position;
  for (let v = 0; v < p.count; v++) {
    p.setXYZ(
      v,
      p.getX(v) * (1 + jitter(0.25)),
      p.getY(v) * (0.7 + jitter(0.15)),
      p.getZ(v) * (1 + jitter(0.25)),
    );
  }
  geo.computeVertexNormals();
  const grays = v.grays ?? ["#8f877b", "#9a9186", "#7d766b", "#a49b8e"];
  const stone = new THREE.Mesh(
    geo,
    craftMaterial(grays[(Math.random() * grays.length) | 0], {
      rough: 0.9,
      flat: true,
    }),
  );
  stone.position.y = rad * 0.55;
  stone.castShadow = true;
  stone.receiveShadow = true;
  g.add(stone);
  return g;
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
  const stemMat = craftMaterial("#6f8c4a", { rough: 0.8 });
  const leafGeo = heartLeafGeo(1);
  const vines = 3 + ((Math.random() * 3) | 0);
  for (let vi = 0; vi < vines; vi++) {
    const a = (vi / vines) * Math.PI * 2 + jitter(0.5);
    // vine rises a little then trails outward and drops (over the rim)
    const reach = 0.3 + Math.random() * 0.25;
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
    transparent: true,
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

// A short picket-fence segment.
function buildFence(v = {}) {
  const g = new THREE.Group();
  const mat = craftMaterial(v.wood ? "#9a7548" : "#eae2d2", { rough: 0.85, flat: true });
  const span = 0.4;
  const pickets = 5;
  // two horizontal rails
  for (const ry of [0.08, 0.17]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.02, 0.012), mat);
    rail.position.set(0, ry, 0);
    rail.castShadow = true;
    g.add(rail);
  }
  for (let i = 0; i < pickets; i++) {
    const x = (i / (pickets - 1) - 0.5) * span;
    const h = 0.22;
    const picket = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.014), mat);
    picket.position.set(x, h / 2, 0);
    picket.castShadow = true;
    g.add(picket);
    // pointed cap
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.021, 0.03, 4),
      mat,
    );
    cap.rotation.y = Math.PI / 4;
    cap.position.set(x, h + 0.014, 0);
    g.add(cap);
  }
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
