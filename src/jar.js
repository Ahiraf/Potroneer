import * as THREE from "three";
import { JAR } from "./state.js";
import { getJarModelClone } from "./models.js";

// ---------------------------------------------------------------------------
// Jar shapes
// ---------------------------------------------------------------------------
// Each jar type owns (a) the interior metrics the substrate/decorations must
// fit inside, and (b) a lathe profile describing the glass silhouette. Interior
// metrics get copied into the shared mutable `JAR` object when a jar is chosen,
// so builders always read the current jar's dimensions.

const BASE_JARS = [
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
    interior: { innerRadius: 1.02, bodyHeight: 2.4, floorY: -1.15, wallThickness: 0.05 },
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

// The hero jar from the reference: a tall apothecary jar — straight body,
// short shoulder easing into a wide neck, cork stopper on top.
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
  const t0 = Math.PI * 0.72; // near bottom
  const t1 = Math.PI * 0.12; // near top mouth
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = t0 + (t1 - t0) * (i / N);
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
    if (model) {
      model.position.y = it.floorY - it.wallThickness;
      group.add(model);
    } else {
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.0, 0.12, 24),
        regFrame(new THREE.MeshStandardMaterial({ color: "#7a5a3a", roughness: 0.85 })),
      );
      plinth.position.y = it.floorY - 0.06;
      group.add(plinth);
    }
    return { group, glass: ghost, glassMats, frameMats };
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

  if (type.bottle) return buildBottle(it, envMap, group);
  if (type.house) return buildGreenhouse(it, envMap, group);
  if (type.poly) return buildPolyJar(it, envMap, group, type.poly);

  const profile = type.profile(it);
  // Low segment counts (e.g. the greenhouse's 6) leave crisp flat panes.
  const glassGeo = new THREE.LatheGeometry(profile, type.segments || 128);
  glassGeo.computeVertexNormals();

  const glassMat = regGlass(makeGlassMaterial(envMap));

  const glass = new THREE.Mesh(glassGeo, glassMat);
  group.add(glass);

  // Inner floor disc so there's never a gap under the substrate.
  const floorGeo = new THREE.CircleGeometry(it.innerRadius, 48);
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
  if (type.lid) {
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
  if (type.lid === "cork") {
    const corkMat = regFrame(new THREE.MeshStandardMaterial({
      color: "#b98e5f",
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

  return { group, glass };
}

// Real physically-based glass: light transmits and refracts through it
// (`transmission` + `ior` + `thickness`), with a faint green tint from
// attenuation — what sells the jar as a real object.
function makeGlassMaterial(envMap) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.04,
    transmission: 1.0,
    thickness: 0.9,
    ior: 1.5,
    envMap: envMap || null,
    envMapIntensity: 1.15,
    transparent: true,
    side: THREE.DoubleSide,
    clearcoat: 0.5,
    clearcoatRoughness: 0.06,
    attenuationColor: new THREE.Color(0xd6efe4),
    attenuationDistance: 4.0,
    specularIntensity: 1.0,
  });
}

// A wine bottle lying on its side on a wooden cradle — ship-in-a-bottle style,
// neck pointing right, corked. The terrarium bed sits along the belly.
function buildBottle(it, envMap, group) {
  const R = it.innerRadius + it.wallThickness; // cross-section outer radius
  const bodyLen = it.innerRadius * it.stretchX * 2 + 0.3;
  const centerY = it.floorY + it.innerRadius; // glass axis height

  // profile along +Y (revolved), then rotated to lie along +X
  const pts = [];
  pts.push(new THREE.Vector2(0, -bodyLen / 2 - 0.02));
  pts.push(new THREE.Vector2(R * 0.55, -bodyLen / 2 - 0.02));
  pts.push(new THREE.Vector2(R * 0.92, -bodyLen / 2 + 0.06));
  pts.push(new THREE.Vector2(R, -bodyLen / 2 + 0.2));
  pts.push(new THREE.Vector2(R, bodyLen / 2 - 0.2));
  // shoulder into the neck
  pts.push(new THREE.Vector2(R * 0.85, bodyLen / 2 + 0.05));
  pts.push(new THREE.Vector2(R * 0.42, bodyLen / 2 + 0.32));
  pts.push(new THREE.Vector2(R * 0.3, bodyLen / 2 + 0.5));
  pts.push(new THREE.Vector2(R * 0.3, bodyLen / 2 + 0.85));
  pts.push(new THREE.Vector2(R * 0.34, bodyLen / 2 + 0.9));
  pts.push(new THREE.Vector2(R * 0.31, bodyLen / 2 + 0.96));

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

  // dark settled bed filling the curved bilge below the substrate floor, so
  // no gap shows between the flat layers and the round glass.
  const bed = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 12),
    new THREE.MeshStandardMaterial({ color: "#33251a", roughness: 1 }),
  );
  bed.scale.set(it.innerRadius * it.stretchX, it.innerRadius * 0.94, it.innerRadius * 0.97);
  bed.position.y = centerY - 0.06;
  const clipY = it.floorY + 0.02;
  bed.material.clippingPlanes = null; // keep simple: sink it below the floor
  bed.position.y = clipY - it.innerRadius * 0.55;
  group.add(bed);

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
  glassMat.thickness = 0.25;
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
  const count = 340;
  const geo = new THREE.SphereGeometry(0.011, 6, 5);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.45,
    envMap: envMap || null,
    envMapIntensity: 1.6,
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

// Invisible interior disc used purely as a raycast target for taps.
export function buildPickPlane() {
  const geo = new THREE.CircleGeometry(JAR.innerRadius - 0.05, 48);
  geo.scale(JAR.stretchX, 1, 1);
  const plane = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.name = "pickPlane";
  return plane;
}
