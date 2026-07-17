import * as THREE from "three";
import { BASE_BY_ID, DECOR_BY_ID } from "./catalog.js";
import { JAR, heightAt } from "./state.js";

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
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * R;
    for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2;
      positions.push(Math.cos(a) * rad * JAR.stretchX, 0, Math.sin(a) * rad);
      jitters.push(jitter(0.012));
    }
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
    }),
  );
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.jitters = jitters;
  return mesh;
}

// Re-project the cap's vertices from the current heightfield.
export function updateTerrainCap(mesh, state, baseY) {
  const pos = mesh.geometry.attributes.position;
  const jitters = mesh.userData.jitters;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, baseY + 0.005 + heightAt(state, x, z) + jitters[i]);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
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
function buildDeer(v = {}) {
  const g = new THREE.Group();
  const bodyMat = craftMaterial(v.body ?? "#a8794f", { rough: 0.8 });
  const darkMat = craftMaterial(v.dark ?? "#6e4c2e", { rough: 0.8 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.13, 4, 10), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.17;
  body.castShadow = true;
  g.add(body);

  // legs
  for (const lx of [-0.055, 0.055]) {
    for (const lz of [-0.028, 0.028]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.008, 0.14, 6),
        bodyMat,
      );
      leg.position.set(lx, 0.07, lz);
      leg.castShadow = true;
      g.add(leg);
    }
  }

  // neck + head, looking slightly to one side
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.028, 0.12, 8),
    bodyMat,
  );
  neck.position.set(0.09, 0.26, 0);
  neck.rotation.z = -0.35;
  g.add(neck);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.05, 4, 8), bodyMat);
  head.rotation.z = Math.PI / 2 - 0.4;
  head.position.set(0.135, 0.33, 0);
  head.castShadow = true;
  g.add(head);

  // ears + antlers
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.03, 5), darkMat);
    ear.position.set(0.115, 0.36, s * 0.022);
    ear.rotation.z = 0.4;
    g.add(ear);
    const antler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.006, 0.07, 5),
      darkMat,
    );
    antler.position.set(0.105, 0.4, s * 0.014);
    antler.rotation.set(s * 0.35, 0, 0.25);
    g.add(antler);
    const tine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.005, 0.04, 5),
      darkMat,
    );
    tine.position.set(0.095, 0.42, s * 0.028);
    tine.rotation.set(s * 0.8, 0, -0.3);
    g.add(tine);
  }

  // tail
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 6), darkMat);
  tail.position.set(-0.115, 0.19, 0);
  g.add(tail);
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
function buildButterfly(v = {}) {
  const g = new THREE.Group();
  const hues = ["#6fa8dc", "#e8a33d", "#d17aa0", "#8f7ad1"];
  const wingMat = craftMaterial(v.wing ?? hues[(Math.random() * hues.length) | 0], {
    rough: 0.55,
  });
  wingMat.side = THREE.DoubleSide;

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(0.05, 0.07, 0.1, 0.09, 0.11, 0.04);
  wingShape.bezierCurveTo(0.12, 0.0, 0.07, -0.045, 0.045, -0.05);
  wingShape.bezierCurveTo(0.02, -0.05, 0.0, -0.02, 0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape, 8);

  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.scale.x = s;
    wing.rotation.set(-Math.PI / 2 + s * 0.9, 0, 0);
    wing.rotation.order = "ZXY";
    wing.position.y = 0.035;
    wing.castShadow = true;
    g.add(wing);
  }
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.008, 0.05, 3, 6),
    craftMaterial("#3a3228", { rough: 0.7 }),
  );
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.03;
  g.add(body);
  return g;
}

// A ladybug — red dome, black spots, tiny head.
function buildLadybug(v = {}) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    craftMaterial(v.shell ?? "#c93326", { rough: 0.45 }),
  );
  shell.scale.set(1, 0.75, 1.2);
  shell.position.y = 0.005;
  shell.castShadow = true;
  g.add(shell);
  const spotMat = craftMaterial("#221e1a", { rough: 0.6 });
  for (let i = 0; i < 6; i++) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 6), spotMat);
    const a = Math.random() * Math.PI * 2;
    const t = 0.35 + Math.random() * 0.5;
    const dir = new THREE.Vector3(
      Math.sin(t) * Math.cos(a),
      Math.cos(t) * 0.75,
      Math.sin(t) * Math.sin(a) * 1.2,
    );
    spot.position.copy(dir).multiplyScalar(0.046);
    spot.position.y += 0.005;
    spot.lookAt(dir.multiplyScalar(2));
    g.add(spot);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 7), spotMat);
  head.scale.y = 0.7;
  head.position.set(0, 0.008, 0.055);
  g.add(head);
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
  const blobs = 16 + ((Math.random() * 8) | 0);
  for (let i = 0; i < blobs; i++) {
    const rad = 0.045 + Math.random() * 0.05;
    const geo = new THREE.IcosahedronGeometry(rad, 1);
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
        flat: true,
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
  for (let i = 0; i < shrooms; i++) {
    const h = 0.12 + Math.random() * 0.14;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, h, 8),
      craftMaterial("#efe7d3", { rough: 0.9 }),
    );
    const px = jitter(0.14);
    const pz = jitter(0.14);
    stem.position.set(px, h / 2, pz);
    stem.castShadow = true;
    g.add(stem);

    const capR = 0.06 + Math.random() * 0.05;
    const capGeo = new THREE.SphereGeometry(
      capR,
      12,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2,
    );
    const cap = new THREE.Mesh(
      capGeo,
      craftMaterial(capColors[(Math.random() * capColors.length) | 0], {
        rough: 0.6,
      }),
    );
    cap.scale.y = 0.8;
    cap.position.set(px, h + capR * 0.1, pz);
    cap.castShadow = true;
    g.add(cap);

    // a couple of pale spots on the cap
    for (let s = 0; s < 3; s++) {
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(capR * 0.14, 6, 6),
        craftMaterial("#f5efe0", { rough: 0.8 }),
      );
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * capR * 0.7;
      spot.position.set(
        px + Math.cos(a) * rr,
        h + capR * 0.5,
        pz + Math.sin(a) * rr,
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
