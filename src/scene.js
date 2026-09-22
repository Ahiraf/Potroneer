import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { themeById } from "./themes.js";
import { tableById } from "./tables.js";

// createStudio owns everything render/interaction related but stays ignorant of
// terrariums specifically: it exposes a rotatable `world` group, a raycaster
// helper, and a tap callback. main.js does the terrarium logic on top.
export function createStudio(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  // A high-density canvas is beautiful but expensive once the jar contains
  // many procedural meshes. Keep a crisp cap on desktop and a gentler one on
  // phones so touch sessions stay responsive.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  // Scene moods — like Terrarium Builder's scene customization: same table,
  // different time of day. Each mood re-tints backdrop, lights, fog, ground.
  const MOODS = {
    // Clean product-photo studio: a seamless neutral sweep, cool soft key light
    // and a pale bamboo board under the jar — the look of the reference
    // terrarium shop photos.
    studio: {
      draw: "studio",
      slab: true,
      fog: 0xeef1f4,
      key: 0xffffff,
      keyI: 1.75,
      hemiI: 0.95,
      ground: 0xd0d3d7,
      exposure: 1.06,
    },
    // 3D room environments loaded from GLB scenes in /public. The terrarium
    // sits on its board inside the real room. `room` carries the fit
    // params tuned per model (scale/offset/rotation).
    cafe: {
      room: { file: "cafe-misti.glb", scale: 24, rot: 0, dx: 0, dz: 2.5, floorDrop: 0 },
      bg: 0x2a2320, fog: 0x2a2320, fogNear: 16, fogFar: 44,
      key: 0xffe4bc, keyI: 1.1, hemiI: 0.85, exposure: 1.05, slab: true, env: 1.0,
    },
    gallery3d: {
      room: { file: "silent_hill_3-gallery.glb", scale: 16, rot: 0, dx: 0, dz: -2.0, floorDrop: 0 },
      bg: 0x1a1a1c, fog: 0x1a1a1c, fogNear: 16, fogFar: 46,
      key: 0xf0f0ff, keyI: 1.0, hemiI: 0.75, exposure: 1.0, slab: true, env: 0.9,
    },
    dining: {
      room: { file: "the_grange_dining_room.glb", scale: 15, rot: 0, dx: 0, dz: -1.6, floorDrop: 0 },
      bg: 0x241d16, fog: 0x241d16, fogNear: 14, fogFar: 42,
      key: 0xffe0b0, keyI: 1.15, hemiI: 0.8, exposure: 1.05, slab: true, env: 1.0,
    },
    armory: {
      room: { file: "mafia_the_city_of_lost_heaven-vincenzos_armory.glb", scale: 22, rot: 0, dx: 0, dz: 3, floorDrop: 0 },
      bg: 0x1c1917, fog: 0x1c1917, fogNear: 16, fogFar: 46,
      key: 0xffe0b0, keyI: 1.15, hemiI: 0.85, exposure: 1.04, slab: true, env: 1.0,
    },
    day: {
      wall: ["#e9dfd0", "#d9c9b2"],
      sky: "#e6ede6",
      trees: "rgba(96,88,76,0.5)",
      frame: "#5a4c3e",
      fog: 0xdcccb4,
      key: 0xfff0d8,
      keyI: 1.5,
      hemiI: 0.75,
      ground: 0xd8c3a8,
      exposure: 1.0,
    },
    dusk: {
      wall: ["#e3c3a0", "#c99f7d"],
      sky: "#f2b878",
      trees: "rgba(94,66,48,0.55)",
      frame: "#4c3c2e",
      fog: 0xd4a887,
      key: 0xffc48a,
      keyI: 1.35,
      hemiI: 0.5,
      ground: 0xcda986,
      exposure: 0.95,
    },
    night: {
      wall: ["#39445e", "#262f47"],
      sky: "#141d33",
      trees: "rgba(20,26,44,0.7)",
      frame: "#1c2333",
      fog: 0x2b3550,
      key: 0xa8c0ff,
      keyI: 0.75,
      hemiI: 0.32,
      ground: 0x4e5972,
      exposure: 0.88,
    },
    library: {
      draw: "library", // candlelit study: bookshelves + candle glow
      wall: ["#3a2c1e", "#241a10"],
      fog: 0x2c2114,
      key: 0xffb060,
      keyI: 1.1,
      hemiI: 0.42,
      ground: 0x6b4a2c,
      exposure: 0.92,
    },
    garden: {
      draw: "garden", // sunlit garden bokeh
      fog: 0xcfe0c0,
      key: 0xfff8e0,
      keyI: 1.45,
      hemiI: 0.8,
      ground: 0xc2d0a8,
      exposure: 1.0,
    },
    beach: {
      draw: "beach", // sea horizon and warm sand
      fog: 0xe8dcc8,
      key: 0xfff2d0,
      keyI: 1.6,
      hemiI: 0.85,
      ground: 0xe0d0ae,
      exposure: 1.05,
    },
    space: {
      draw: "space", // starfield and nebulae
      fog: 0x141824,
      key: 0xbcd0ff,
      keyI: 0.9,
      hemiI: 0.25,
      ground: 0x38405a,
      exposure: 0.85,
    },
    mountain: {
      draw: "mountain", // layered peaks at sunset
      fog: 0xd8b8a0,
      key: 0xffc890,
      keyI: 1.3,
      hemiI: 0.55,
      ground: 0xc4a685,
      exposure: 0.95,
    },
    rain: {
      draw: "rain", // grey rainy-day window
      fog: 0xb8c4cc,
      key: 0xdce8f0,
      keyI: 1.0,
      hemiI: 0.6,
      ground: 0xa8b2ba,
      exposure: 0.9,
    },
    // --- painted theme worlds (distinct backdrop per theme, no GLB needed) ---
    town: {
      draw: "scenic", scene: "city",
      sky: ["#f4c98a", "#f7e0c8"],
      glow: "rgba(255,225,170,0.7)", glowX: 720,
      layers: [["#c98f6e", 320, 120], ["#8f5f52", 360, 170], ["#5c3b3e", 400, 210]],
      fog: 0xe6b98a, key: 0xffd8a0, keyI: 1.3, hemiI: 0.6, ground: 0xb98f6a, exposure: 0.98,
      vignette: "rgba(40,24,20,0.3)",
    },
    village: {
      draw: "scenic", scene: "hills",
      sky: ["#bfe3f2", "#eef6e6"],
      glow: "rgba(255,250,220,0.65)", glowX: 340,
      layers: [["#bcd79a", 330, 40], ["#9ec47c", 370, 55], ["#6f9e54", 420, 60]],
      fog: 0xd6ead0, key: 0xfff4d8, keyI: 1.45, hemiI: 0.8, ground: 0xbcd39c, exposure: 1.0,
      vignette: "rgba(40,60,30,0.22)",
    },
    blossom: {
      draw: "scenic", scene: "hills", trees2: "rgba(90,60,66,0.6)", dots: "rgba(246,190,214,0.9)", dotCount: 30, dotR: 3,
      sky: ["#fbd8e6", "#fdeef1"],
      glow: "rgba(255,235,245,0.7)", glowX: 512,
      layers: [["#f0c3d4", 340, 40], ["#e3a9c1", 390, 55], ["#c98aa6", 440, 55]],
      fog: 0xf3cede, key: 0xfff0f4, keyI: 1.4, hemiI: 0.78, ground: 0xe6c1cf, exposure: 1.0,
      vignette: "rgba(70,40,55,0.24)",
    },
    grove: {
      draw: "scenic", scene: "islands", dots: "rgba(150,240,210,0.8)", dotCount: 26, dotR: 2.5,
      sky: ["#8fd6d0", "#d7f2ea"],
      glow: "rgba(210,255,240,0.6)", glowX: 512, orb: "rgba(230,255,248,0.85)", orbR: 40,
      layers: [["#7bc3bd", 320, 45], ["#4f9e9c", 380, 55], ["#2e6e72", 440, 60]],
      fog: 0xa8e0d8, key: 0xdfffee, keyI: 1.2, hemiI: 0.7, ground: 0x7fbdb5, exposure: 0.97,
      vignette: "rgba(15,45,45,0.28)",
    },
    spidercity: {
      draw: "scenic", scene: "city", stars: "rgba(200,220,255,0.9)",
      sky: ["#1b2540", "#2c3352"],
      glow: "rgba(120,150,220,0.4)", glowX: 512,
      layers: [["#2a3556", 320, 130], ["#1c2742", 360, 180], ["#111a30", 400, 220]],
      fog: 0x1f2942, key: 0x9db4ff, keyI: 0.8, hemiI: 0.35, ground: 0x3a4560, exposure: 0.9,
      vignette: "rgba(4,8,20,0.42)",
    },
    lantern: {
      draw: "scenic", scene: "city", dots: "rgba(255,180,90,0.95)", dotCount: 34, dotR: 3.5, stars: "rgba(255,225,180,0.6)",
      sky: ["#2a2140", "#5a3550"],
      glow: "rgba(255,180,110,0.5)", glowX: 512,
      layers: [["#4a3550", 330, 90], ["#39273f", 370, 130], ["#241827", 410, 170]],
      fog: 0x3a2740, key: 0xffc487, keyI: 0.95, hemiI: 0.4, ground: 0x4a3446, exposure: 0.92,
      vignette: "rgba(20,10,20,0.4)",
    },
    valley: {
      draw: "scenic", scene: "peaks",
      sky: ["#cfe6ea", "#eef4ec"],
      glow: "rgba(255,250,230,0.6)", glowX: 620,
      layers: [["#b7ccc0", 300, 70], ["#8faa9a", 360, 90], ["#5f7d6c", 420, 90]],
      fog: 0xd4e2da, key: 0xfff2dc, keyI: 1.25, hemiI: 0.72, ground: 0xaec2b2, exposure: 0.98,
      vignette: "rgba(30,50,40,0.24)",
    },
  };

  // The real backdrop is a surface in the room (see "the backdrop, as a thing
  // in the room" below); this colour only fills what lies past the ends of it.
  scene.background = new THREE.Color(0xeef1f4);

  // Gentle fog fades the far edge of the table into the backdrop so there's no
  // hard horizon seam — the jar sits in one continuous, hazy studio space.
  scene.fog = new THREE.Fog(0xeef1f4, 11, 26);

  // Image-based lighting for believable glass refraction/reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
  scene.environment = envMap;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.8, 6.6);
  camera.lookAt(0, 0.1, 0);

  // --- lighting ----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xfff3e2, 0x6b5540, 0.75);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
  key.position.set(3.5, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.bias = -0.0008;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd9e6ff, 0.35);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  // A back rim light gives the glass a bright edge — the single biggest tell
  // that something is real glass rather than a flat shape.
  const rim = new THREE.DirectionalLight(0xffffff, 1.1);
  rim.position.set(-2, 3, -5);
  scene.add(rim);

  // --- photo lighting ------------------------------------------------------
  // A building light rig and a photographic one want different things. The
  // build rig is bright and high-contrast so you can see what you are doing;
  // a photograph of a terrarium wants the light softer and the jar's contact
  // with the table firmer, because that contact is what stops the whole thing
  // reading as a cut-out pasted onto a tabletop.
  //
  // Softer here means a smaller key-to-fill ratio, not a dimmer scene: the key
  // comes down and the ambient and fill come up, so the exposure holds while
  // the shadows open. Firmer contact means a tighter shadow frustum — the same
  // map over a smaller area is a sharper map — a larger map since a still shot
  // can afford one, and a darker shadow.
  // Shadow settings only. Intensity belongs to the theme and is softened
  // separately (see applyLightIntensities) so the two cannot fight.
  const BUILD_LIGHT = { shadowIntensity: 1, shadowRadius: 1, frustum: 3, mapSize: 1024 };
  const PHOTO_LIGHT = { shadowIntensity: 1, shadowRadius: 2.5, frustum: 2.1, mapSize: 2048 };
  let photoLit = false;

  function applyLightRig(rig) {
    key.shadow.intensity = rig.shadowIntensity;
    key.shadow.radius = rig.shadowRadius;
    key.shadow.camera.left = -rig.frustum;
    key.shadow.camera.right = rig.frustum;
    key.shadow.camera.top = rig.frustum;
    key.shadow.camera.bottom = -rig.frustum;
    key.shadow.camera.updateProjectionMatrix();
    // A shadow map keeps the resolution it was allocated at until the texture
    // is thrown away, so a new size only lands once three rebuilds it.
    const size = quality === "low" ? Math.min(512, rig.mapSize) : rig.mapSize;
    if (key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
  }

  /** Light the scene for a photograph, or put the building rig back. */
  function setPhotoLighting(on) {
    const want = Boolean(on);
    if (want === photoLit) return;
    photoLit = want;
    applyLightRig(want ? PHOTO_LIGHT : BUILD_LIGHT);
    applyLightIntensities();
  }

  // --- render quality ------------------------------------------------------
  // Weaker machines can trade fidelity for a steady frame. What gets cut is
  // everything passive — pixel density, shadow resolution, the soft-shadow
  // filter, the rim light's second shadow pass — and never the interaction
  // loop, because a placement that lands late is worse than one that lands
  // ugly. Callers read `quality` back so particle counts can follow suit.
  const DPR_CAP = () => (window.innerWidth < 700 ? 1.25 : 2);
  let quality = "high";
  function setQuality(level) {
    quality = level === "low" ? "low" : "high";
    const low = quality === "low";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : DPR_CAP()));
    renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    // Whichever rig is in force decides the map's size; quality only caps it.
    const size = low ? 512 : photoLit ? PHOTO_LIGHT.mapSize : BUILD_LIGHT.mapSize;
    if (key.shadow.mapSize.x !== size) {
      key.shadow.mapSize.set(size, size);
      // A shadow map that has already been allocated keeps its old resolution
      // until the texture is thrown away, so the new size only takes effect
      // once three rebuilds it on the next frame.
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    renderer.shadowMap.needsUpdate = true;
    resize();
  }
  function getQuality() {
    return quality;
  }

  // --- the table the jar sits on ----------------------------------------
  // A small round side table rather than an endless floor: a floor plane that
  // runs to the fog swallows the lower half of the screen and buries whatever
  // theme photo is behind it. A real piece of furniture with an edge you can
  // see reads better *and* leaves the backdrop room to breathe.
  //
  // Which table is the user's choice (see src/tables.js). The three surfaces —
  // top, legs, board — are built once and re-dressed on the fly: swapping a
  // style only swaps maps, colours and which leg group is visible, so changing
  // your mind costs nothing and never rebuilds geometry.
  const surfaceTex = {
    wood: makeWoodTexture(),
    marble: makeMarbleTexture(),
    stone: makeStoneTexture(),
    rattan: makeRattanTexture(),
  };
  const TABLE_R = 1.95;
  const TABLE_H = 0.17;
  const table = new THREE.Group();

  const topMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0 });
  const tableTop = new THREE.Mesh(makeTableTop(TABLE_R, TABLE_H), topMat);
  tableTop.receiveShadow = true;
  tableTop.castShadow = true;
  table.add(tableTop);

  // Three understructures, all built up front and toggled by the style.
  const legMat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0 });
  const legGroups = {};

  // Slim, slightly splayed and tapered, running out of frame — enough of them
  // shows to say "table", none of it competes with the jar.
  legGroups.splay = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 4.4, 12), legMat);
    const r = TABLE_R * 0.72;
    leg.position.set(Math.cos(a) * r, -TABLE_H - 2.2, Math.sin(a) * r);
    leg.rotation.z = -Math.cos(a) * 0.07;
    leg.rotation.x = Math.sin(a) * 0.07;
    leg.castShadow = true;
    legGroups.splay.add(leg);
  }

  // Hairpin: thin rods kicked further out, for the metal-legged styles.
  legGroups.hairpin = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 4.4, 8), legMat);
    const r = TABLE_R * 0.8;
    leg.position.set(Math.cos(a) * r, -TABLE_H - 2.2, Math.sin(a) * r);
    leg.rotation.z = -Math.cos(a) * 0.13;
    leg.rotation.x = Math.sin(a) * 0.13;
    leg.castShadow = true;
    legGroups.hairpin.add(leg);
  }

  // Pedestal: one turned column on a wide foot — what marble and terracotta
  // want, and the only style whose base is ever actually in frame.
  legGroups.pedestal = new THREE.Group();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 4.4, 24), legMat);
  column.position.y = -TABLE_H - 2.2;
  column.castShadow = true;
  legGroups.pedestal.add(column);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, 32), legMat);
  foot.position.y = -TABLE_H - 4.32;
  foot.castShadow = true;
  legGroups.pedestal.add(foot);

  for (const group of Object.values(legGroups)) table.add(group);
  scene.add(table);

  // A board under the jar — the cutting board every terrarium build is actually
  // assembled on, and a warm frame for the glass.
  const boardMat = new THREE.MeshStandardMaterial({ map: surfaceTex.wood, roughness: 0.66 });
  const BOARD_H = 0.1;
  const board = new THREE.Mesh(makeTableTop(1.42, BOARD_H), boardMat);
  board.castShadow = true;
  board.receiveShadow = true;
  scene.add(board);

  // Soft ambient-occlusion-style contact shadow right under the jar, layered
  // on top of the cast shadow for a believable grounded feel.
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({
      map: makeRadialShadow(),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.49;
  scene.add(contact);

  // Dressing the table in a style, and then in the room's light. The two are
  // separate on purpose: `tintTable` runs again on every theme change, and it
  // has to start from the style's own colours rather than from whatever the
  // last theme left behind, or the tint compounds and the wood slowly turns to
  // mud as the user browses.
  const tableMats = [topMat, legMat, boardMat];
  let tableStyle = tableById("oak");
  let lastTint = { color: new THREE.Color(0xffffff), mix: 0, dim: 1 };

  function dressTable(style) {
    tableStyle = tableById(style?.id || style);
    const tex = surfaceTex[tableStyle.surface] || surfaceTex.wood;
    topMat.map = tex;
    topMat.roughness = tableStyle.rough;
    topMat.metalness = tableStyle.metal || 0;
    legMat.map = tableStyle.legMetal > 0.4 ? null : tex;
    legMat.roughness = tableStyle.legRough;
    legMat.metalness = tableStyle.legMetal || 0;
    for (const [name, group] of Object.entries(legGroups)) group.visible = name === tableStyle.legs;
    for (const m of tableMats) m.needsUpdate = true;
    tintTable(lastTint.color, lastTint.mix, lastTint.dim);
  }

  // Tint every surface toward the light the scene is actually in, so the table
  // never glows brighter than the picture behind it — and so a moonlit room and
  // a noon window don't hand back the same tabletop.
  // `mix` is hue — how much of the room's colour the wood picks up, which a
  // style is allowed to resist. `dim` is light level, which it is not: a white
  // marble top under a midnight photo has to go grey like everything else in
  // the room, or it sits in the shot like a lamp.
  function tintTable(color, mix = 0, dim = 1) {
    lastTint = { color: color.clone(), mix, dim };
    const take = mix * (tableStyle.tintTake ?? 1);
    const base = [tableStyle.top, tableStyle.leg, tableStyle.board];
    tableMats.forEach((m, i) => {
      m.color.set(base[i]);
      if (take > 0) m.color.lerp(color, take);
      // Colours live in linear space here, so a flat multiply barely reads as
      // darker on screen — 0.6 comes back looking like 0.8. Gamma it first and
      // the number means what the eye thinks it means.
      if (dim !== 1) m.color.multiplyScalar(dim ** 2.2);
      m.needsUpdate = true;
    });
  }

  /** Swap the furniture. Called from the table row in the theme panel. */
  function setTable(id) {
    dressTable(tableById(id));
  }
  dressTable(tableStyle);

  // The jar bases differ per shape; slide the table/board/shadow to meet the
  // chosen jar so everything sits flush.
  let baseY = -1.5;
  function layoutBase() {
    board.position.y = baseY - BOARD_H / 2; // board top flush with the jar floor
    table.position.y = baseY - BOARD_H - TABLE_H / 2;
    contact.position.y = baseY + 0.012;
  }
  function showTable(on) {
    table.visible = on;
    board.visible = on;
    contact.visible = on;
  }
  function setBaseY(y) {
    baseY = y;
    layoutBase();
  }
  setBaseY(-1.5);

  // --- 3D room backgrounds (lazy-loaded GLB scenes) ----------------------
  const roomLoader = new GLTFLoader();
  const roomCache = new Map();
  let roomModel = null;
  let roomToken = 0; // guards against a slow load landing after a mood switch

  function placeRoom(gltf, def) {
    const root = gltf.scene.clone(true);
    // fit: scale so the room's footprint spans ~`scale` units, centre it on the
    // origin and drop its floor to the terrarium base so the jar sits on it.
    let box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = def.scale / Math.max(size.x, size.z, 0.001);
    root.scale.setScalar(s);
    box.setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.x += (def.dx ?? 0) - center.x;
    root.position.z += (def.dz ?? 0) - center.z;
    root.position.y += baseY - box.min.y + (def.floorDrop ?? 0);
    root.rotation.y = def.rot ?? 0;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = true;
        o.frustumCulled = true;
      }
    });
    roomModel = root;
    scene.add(root);
  }

  function setRoom(def) {
    roomToken++;
    if (roomModel) {
      scene.remove(roomModel);
      roomModel = null;
    }
    if (!def) return;
    const token = roomToken;
    const cached = roomCache.get(def.file);
    if (cached) {
      placeRoom(cached, def);
      return;
    }
    // A room model is tens of megabytes over the wire; without this the screen
    // simply sits on the old scene for several seconds and reads as frozen.
    busyReporter?.(1);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      busyReporter?.(-1);
    };
    roomLoader.load(
      `/${def.file}`,
      (gltf) => {
        roomCache.set(def.file, gltf);
        done();
        if (token === roomToken) placeRoom(gltf, def); // still the active mood?
      },
      undefined,
      () => {
        done();
        // model missing/failed — fall back to the neutral studio backdrop so the
        // scene never goes blank
        if (token !== roomToken) return;
        showTable(true);
        shell.visible = true;
        setBackdropTexture(makeStudioBackdrop(MOODS.studio), new THREE.Color(MOODS.studio.fog));
      },
    );
  }

  // How the app above is told that something slow is in flight. It is a
  // delta (+1 starting, -1 finished) rather than a boolean, so two overlapping
  // loads cannot have the first one to finish declare the scene ready.
  let busyReporter = null;

  let moodDef = null; // the active mood definition (its lights get scaled below)
  // Photo themes scale the room light so the table never out-shines the picture.
  // setTimeOfDay() honours it too, otherwise the day-night slider would undo it.
  let photoLight = 1;

  // Every relight goes through here, and there are three of them: the mood
  // scale, a painted mood, and the time-of-day slider. Routing them through
  // one setter is what lets photo mode soften the rig *on top of* whatever the
  // theme asked for, rather than overwriting it — a midnight room should still
  // photograph like a midnight room.
  //
  // Softening is a smaller key-to-ambient ratio, not a dimmer scene: the key
  // comes down and the ambient and fill come up, so exposure holds while the
  // shadows open. Held as the theme's own numbers plus a factor, so it cannot
  // compound when a relight happens while photo mode is already on.
  const themeLight = { key: 1.4, hemi: 0.7, fill: 0.32, rim: 0.8 };
  const PHOTO_SOFTEN = { key: 0.72, hemi: 1.34, fill: 1.5, rim: 0.82 };

  function applyLightIntensities() {
    const f = photoLit ? PHOTO_SOFTEN : null;
    key.intensity = themeLight.key * (f ? f.key : 1);
    hemi.intensity = themeLight.hemi * (f ? f.hemi : 1);
    fill.intensity = themeLight.fill * (f ? f.fill : 1);
    rim.intensity = themeLight.rim * (f ? f.rim : 1);
  }

  function applyLightScale() {
    if (!moodDef) return;
    themeLight.key = (moodDef.keyI ?? 1.4) * photoLight;
    themeLight.hemi = (moodDef.hemiI ?? 0.7) * photoLight;
    // Fill and rim were left at full strength, which put a bright edge on the
    // tabletop no matter how dark the world behind it was.
    themeLight.fill = 0.32 * photoLight;
    themeLight.rim = 0.8 * photoLight;
    applyLightIntensities();
    // The environment map is a room's worth of ambient light that the lamps
    // above don't control, so a polished top kept reflecting a bright studio
    // into a midnight photo — the table read as the only lit thing in the shot.
    // It follows the photo's light like everything else now.
    const envScale = clamp(photoLight, 0.3, 1.1);
    for (const m of tableMats) {
      m.envMapIntensity = envScale;
      m.needsUpdate = true;
    }
    renderer.toneMappingExposure = (moodDef.exposure ?? 1) * clamp(0.8 + photoLight * 0.24, 0.8, 1.06);
  }
  // Switch the whole scene to a different mood — a flat studio/time-of-day
  // backdrop, or a full 3D room environment.
  function setMood(name) {
    const m = MOODS[name];
    if (!m) return;
    moodDef = m;
    // A mood always owns the backdrop it paints: drop the theme photo, and bump
    // the token so a photo still decoding for the previous theme can't land on
    // top of the mood the user just picked.
    activePhoto = null;
    photoToken++;
    if (m.room) {
      // 3D room: the model provides walls + floor; hide the flat ground and
      // swap the canvas backdrop for a solid tone the room sits against.
      setRoom(m.room);
      showTable(false); // the room model brings its own furniture and floor
      shell.visible = false; // the room *is* the backdrop
      scene.background = new THREE.Color(m.bg ?? 0x1a1714);
      scene.fog.color.set(m.fog ?? m.bg ?? 0x1a1714);
      scene.fog.near = m.fogNear ?? 12;
      scene.fog.far = m.fogFar ?? 40;
      scene.environment && (scene.environmentIntensity = m.env ?? 1.0);
    } else {
      setRoom(null);
      showTable(true);
      shell.visible = true;
      setBackdropTexture(makeStudioBackdrop(m), new THREE.Color(m.fog));
      scene.fog.color.set(m.fog);
      scene.fog.near = 11;
      scene.fog.far = 26;
      moodGround.set(m.ground);
      tintTable(moodGround, 0.35); // wood takes on the mood's light
    }
    key.color.set(m.key);
    photoLight = 1; // painted moods light the room at full strength
    themeLight.key = m.keyI;
    themeLight.hemi = m.hemiI;
    applyLightIntensities();
    renderer.toneMappingExposure = m.exposure;
    layoutBase();
  }
  // --- photo backdrops ---------------------------------------------------
  // A theme photo never goes on screen raw. It is redrawn into a canvas that is
  // pushed toward a common brightness (so a white balcony and a midnight cave
  // both sit behind the glass equally well), darkened toward the bottom where
  // the table meets it, and vignetted. Everything here exists to keep the
  // terrarium legible.
  //
  // It is never blurred. Blur was standing in for depth, and it flattened
  // every room into the same soft wash; the picture now sits on the backdrop
  // wall 24 units back and gets its depth from parallax instead. The calm
  // slider lifts haze and drains colour, but it must never destroy the source
  // image's detail.
  const photoCache = new Map();
  const moodGround = new THREE.Color(0xd0d3d7); // the active mood's table colour
  let photoToken = 0;
  let activePhoto = null; // { img, theme } while a photo theme is showing
  // 0 = the photo stays vivid, 1 = pushed right back into a soft dark wash.
  // The theme panel exposes this so the user gets the final say on how much the
  // backdrop is allowed to compete with what they are building.
  let photoCalm = 0.55;

  // Aim every backdrop at the same modest brightness, wherever the photo
  // started: bright balconies get pulled down hard, near-black caves lifted.
  // The table under the jar is scaled by the same factor so one light governs
  // the whole picture.
  function backdropBrightness(theme) {
    const lum = theme.lum ?? 0.35;
    const targetLum = 0.5 - photoCalm * 0.26; // the calm slider picks the target
    return clamp(targetLum / Math.max(lum, 0.05), 0.3, 1.4);
  }

  function drawPhotoBackdrop(img, theme) {
    const w = Math.max(960, Math.round(canvas.clientWidth || window.innerWidth));
    const h = Math.max(600, Math.round(canvas.clientHeight || window.innerHeight));
    const c = document.createElement("canvas");
    // Give it every pixel the source has, and not one more: the photograph is
    // the ceiling on detail, so enlarging a source into a larger intermediate
    // canvas only buys megabytes. How much of it reaches the screen is
    // fitBackdrop's business, not this function's.
    c.width = Math.round(clamp(img.width, 960, 3072));
    c.height = Math.round(c.width * (h / w));
    // A tall, narrow window would otherwise ask for a canvas taller than it is
    // wide by a long way; cap the long edge and let the short one follow.
    if (c.height > 3072) {
      c.width = Math.round(c.width * (3072 / c.height));
      c.height = 3072;
    }
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const bright = backdropBrightness(theme);
    // Calm changes tone and contrast only. A theme selection must never turn
    // into a visibly soft or blurry backdrop, even if a previous session left
    // the calm control near its maximum.
    const sat = (1.05 - photoCalm * 0.35).toFixed(2);
    ctx.filter = `saturate(${sat}) brightness(${bright.toFixed(2)})`;
    // Fit the source inside the output canvas rather than covering it. Cover
    // is correct for a thumbnail, but it is the cause of the selected-theme
    // bug: a portrait viewport makes a 16:9 source grow until it is several
    // times larger than its native resolution, then crops it into a detail.
    // Containment keeps the entire source composition and never upscales it
    // just to satisfy a tall viewport. The remaining letterbox is filled with
    // the theme tone, not a stretched copy of the image.
    const s = Math.min(c.width / img.width, c.height / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.fillStyle = theme.tone || "#20241f";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    ctx.filter = "none";

    // Haze straight behind the jar: the glass and its greens need a calm,
    // low-contrast field to sit against.
    const haze = ctx.createRadialGradient(
      c.width * 0.5, c.height * 0.62, c.width * 0.04,
      c.width * 0.5, c.height * 0.62, c.width * 0.52,
    );
    // Lighter than it was: a sharp picture only needs enough of a knock-back
    // to keep the glass readable, and a heavy wash on a sharp photo reads as a
    // smudge on the lens rather than as distance.
    haze.addColorStop(0, `rgba(8, 10, 9, ${(0.08 + photoCalm * 0.24).toFixed(2)})`);
    haze.addColorStop(0.55, `rgba(8, 10, 9, ${(0.04 + photoCalm * 0.14).toFixed(2)})`);
    haze.addColorStop(1, "rgba(8, 10, 9, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, c.width, c.height);

    // Floor-ward falloff so the table edge fades into the picture.
    const drop = ctx.createLinearGradient(0, c.height * 0.3, 0, c.height);
    drop.addColorStop(0, "rgba(6, 8, 7, 0)");
    drop.addColorStop(0.55, "rgba(6, 8, 7, 0.22)");
    drop.addColorStop(1, "rgba(6, 8, 7, 0.46)");
    ctx.fillStyle = drop;
    ctx.fillRect(0, 0, c.width, c.height);

    // Vignette.
    const vig = ctx.createRadialGradient(
      c.width * 0.5, c.height * 0.5, c.width * 0.3,
      c.width * 0.5, c.height * 0.5, c.width * 0.78,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, `rgba(0,0,0,${(0.14 + photoCalm * 0.24).toFixed(2)})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, c.width, c.height);

    // Sample the finished backdrop where the table's far edge will meet it and
    // use that as the fog colour — the horizon then dissolves instead of
    // ending on a hard line between two different pictures.
    const band = ctx.getImageData(0, Math.round(c.height * 0.42), c.width, Math.max(1, Math.round(c.height * 0.08)));
    let r = 0, g = 0, b = 0;
    const px = band.data.length / 4;
    for (let i = 0; i < band.data.length; i += 4) {
      r += band.data[i];
      g += band.data[i + 1];
      b += band.data[i + 2];
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    tex.generateMipmaps = true;
    return { tex, horizon: new THREE.Color(r / px / 255, g / px / 255, b / px / 255) };
  }

  function applyPhoto(img, theme) {
    activePhoto = { img, theme };
    const { tex, horizon } = drawPhotoBackdrop(img, theme);
    shell.visible = true;
    setBackdropTexture(tex, horizon.clone());
    // Fog takes the colour the backdrop actually has at the horizon, so the far
    // edge of the table melts into the picture.
    const tone = new THREE.Color(theme.tone || "#20241f");
    scene.fog.color.copy(horizon);
    scene.fog.near = 11;
    scene.fog.far = 26;
    // Pull the table into the photo's light too — a moonlit room shouldn't have
    // a noon-bright tabletop under the jar. The tint carries the photo's average
    // colour, a little of its accent so the furniture agrees with the buttons,
    // and its brightness, so a dark world gets dark wood instead of a tabletop
    // that glows out of the picture. How much of it lands is the table's call
    // (`tintTake`): oak takes all of it, white marble a third.
    const accent = new THREE.Color(theme.accent || "#6d9e4f");
    const lum = typeof theme.lum === "number" ? theme.lum : 0.5;
    const tint = new THREE.Color().copy(moodGround).lerp(tone, 0.7).lerp(accent, 0.22);
    tintTable(tint, 0.78, clamp(0.5 + lum * 0.7, 0.5, 1.1));
    // Light the room the way the picture is lit. This used to read
    // `backdropBrightness(theme)` — the *gain* applied to the photo on its way
    // to the canvas — which is backwards: a midnight photo needs the most gain,
    // so the darkest worlds were the ones lit hottest, and their tabletop came
    // out glowing white in front of a black window. The photo's own luminance
    // is the honest number, and it runs the right way round.
    photoLight = clamp(0.3 + lum, 0.35, 1.15);
    applyLightScale();
  }

  /** Theme panel slider: how far photo backdrops are pushed back (0–1). */
  function setBackdropCalm(value) {
    photoCalm = clamp(Number(value) || 0, 0, 1);
    if (activePhoto) applyPhoto(activePhoto.img, activePhoto.theme);
  }

  function setPhoto(theme) {
    const token = ++photoToken;
    const url = `/themes/${theme.id}.jpg`;
    const cached = photoCache.get(url);
    if (cached) {
      applyPhoto(cached, theme);
      return;
    }
    const img = new Image();
    img.onload = () => {
      photoCache.set(url, img);
      if (token === photoToken) applyPhoto(img, theme); // still the active theme?
    };
    img.onerror = () => {
      // Missing asset — keep the mood's painted backdrop rather than a void.
      if (token === photoToken) activePhoto = null;
    };
    img.src = url;
  }

  let currentThemeId = "studio";
  function setTheme(name) {
    const theme = themeById(name);
    currentThemeId = theme.id;
    photoToken++; // cancel any in-flight photo from the previous theme
    activePhoto = null;
    // The mood still drives lights, exposure, fog and the table surface; a photo
    // theme then replaces just the backdrop image on top of that lighting.
    setMood(theme.mood);
    if (theme.photo) setPhoto(theme);
  }
  function setTimeOfDay(value) {
    const phase = ((Number(value) || 0) % 1 + 1) % 1;
    const daylight = Math.max(0, Math.sin((phase - 0.25) * Math.PI * 2) * 0.5 + 0.5);
    themeLight.key = (0.58 + daylight * 1.15) * photoLight;
    themeLight.hemi = (0.25 + daylight * 0.65) * photoLight;
    themeLight.fill = (0.1 + daylight * 0.28) * photoLight;
    themeLight.rim = (0.5 + (1 - daylight) * 0.85) * photoLight;
    applyLightIntensities();
    renderer.toneMappingExposure = (0.82 + daylight * 0.3) * clamp(0.8 + photoLight * 0.24, 0.8, 1.06);
  }
  // Snapshot the current frame as a PNG data-URL (photo mode).
  function capture() {
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  }

  // --- world (rotated by the user) --------------------------------------
  const world = new THREE.Group();
  scene.add(world);

  // --- interaction: drag to rotate, idle auto-spin ----------------------
  const DIST_MIN = 2.6; // close enough to work inside a small jar
  const DIST_MAX = 9.5;
  const rot = { x: 0.05, y: 0.4 };
  const target = { x: 0.05, y: 0.4 };
  const X_MIN = -0.12;
  // Pitch is added to the camera's base elevation, so this is how far above
  // that base a drag may climb. It has to reach ELEV_MAX or the top view is a
  // place only a preset can go and never a place you can drag to.
  const X_MAX = 1.2;
  let dragging = false;
  let autoSpin = false;
  // Camera lock: detailed work inside a small jar means a lot of short presses
  // near the glass, and every one of them can nudge the turntable a few degrees.
  // Locked, the angle simply stops moving — but the press still reads as a tap,
  // and zoom (wheel and pinch) is untouched, because neither of those is what
  // loses your place.
  let camLocked = false;
  let moved = 0;
  let last = { x: 0, y: 0 };
  let lastInteraction = performance.now();
  const IDLE_MS = 2600;
  let tapHandler = null;

  // Object-drag hooks: on pointer-down main.js gets first refusal via
  // grabHandler; if it grabs an existing decoration we move that instead of
  // rotating the jar. mode is "rotate" | "object" | null.
  let mode = null;
  let grabHandler = null;
  let objectDragHandler = null;
  let objectDropHandler = null;
  // Touch has no hover, so a cursor preview cannot follow a pointer that is only
  // over the glass when nothing is being pressed. On a finger they are
  // summoned by contact instead — press to reach in, drag to aim, lift to
  // plant — and this is the hook main.js drives that with. It gets first
  // refusal after grabHandler; refusing means the drag turns the jar as usual.
  let aimHandler = null;
  const activePointers = new Map();
  let pinchDistance = 0;
  let pinchMid = null;

  function markInteraction() {
    lastInteraction = performance.now();
  }

  function resetView() {
    target.x = 0.05;
    target.y = 0.4;
    frameJar(framed.centerY, framed.height, { radius: framed.radius ?? 0 });
    markInteraction();
  }

  /**
   * Named camera angles.
   *
   * `target.x` is pitch above the camera's base elevation and `target.y` turns
   * the world on its turntable, so a preset is just a pair of those plus a
   * re-frame. The three-quarter view is the one the app opens on and the one
   * worth building in; front and side are for reading layer thickness and jar
   * depth; top is for the footprint.
   *
   * A preset remembers what it replaced, so leaving one puts the eye back where
   * the user had it rather than at some canonical pose they never chose.
   */
  const VIEWS = {
    "three-quarter": { x: 0.05, y: 0.4, fill: 0.76 },
    // Slightly above the tabletop rather than level with it. At table height
    // the eye sees along the backdrop's lower edge, where the photograph runs
    // out and its last row of pixels stretches away — a pale band under the
    // jar that is not part of the room. A few degrees up is also the better
    // shot: it reads layer thickness *and* keeps the surface in view.
    front: { x: 0.18, y: 0, fill: 0.78 },
    side: { x: 0.18, y: Math.PI / 2, fill: 0.78 },
    // Pitch is resolved at call time: it is measured from the camera's base
    // elevation, which is declared further down this function. Reading it here
    // would be a TDZ throw during setup — the failure mode that takes the whole
    // module with it.
    top: { x: () => ELEV_MAX - camBaseElev - 0.02, y: 0.4, fill: 0.84 },
  };
  let restorePose = null;

  function setView(name, opts = {}) {
    const v = VIEWS[name];
    if (!v) return false;
    if (name !== "three-quarter" && !restorePose) {
      restorePose = { x: target.x, y: target.y };
    }
    target.x = clamp(typeof v.x === "function" ? v.x() : v.x, X_MIN, X_MAX);
    target.y = v.y;
    // A top-down shot wants the footprint to fill more of the frame than a
    // three-quarter does, since there is no height in the picture to allow for.
    // Photo mode asks for a tighter fill: a picture of a terrarium wants the
    // terrarium in it, not the room it was built in.
    frameJar(framed.centerY, framed.height, {
      radius: framed.radius ?? 0,
      fill: opts.fill ?? v.fill,
    });
    markInteraction();
    return true;
  }

  /** Back to whatever the eye was doing before a preset took over. */
  function restoreViewPose() {
    if (!restorePose) return false;
    target.x = restorePose.x;
    target.y = restorePose.y;
    restorePose = null;
    frameJar(framed.centerY, framed.height, { radius: framed.radius ?? 0 });
    markInteraction();
    return true;
  }

  function onDown(e) {
    markInteraction();
    activePointers.set(e.pointerId ?? 1, { x: e.clientX, y: e.clientY });
    // capture can throw if the pointer has already been released elsewhere
    try {
      canvas.setPointerCapture?.(e.pointerId ?? 1);
    } catch {
      /* not capturable — dragging still works from the window listeners */
    }
    if (activePointers.size >= 2) {
      const points = [...activePointers.values()];
      // A second finger lands mid-gesture, so whatever the first one was doing
      // is over. An aim is abandoned rather than planted — the finger never
      // lifted, and lifting is what plants.
      if (mode === "aim") aimHandler?.cancel?.();
      else if (mode === "object") objectDropHandler?.();
      pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchMid = midpoint(points);
      mode = "pinch";
      dragging = false;
      return;
    }
    const p = pointer(e);
    // Did the user grab a placed decoration? If so, drag it, don't rotate.
    if (grabHandler && grabHandler(p)) {
      mode = "object";
      canvas.style.cursor = "grabbing";
      return;
    }
    // A finger with something picked out of the tray reaches in with the
    // placement cursor instead of turning the jar.
    if (aimHandler?.start?.(p)) {
      mode = "aim";
      return;
    }
    mode = "rotate";
    dragging = true;
    moved = 0;
    last = p;
  }

  function onMove(e) {
    if (activePointers.has(e.pointerId ?? 1)) {
      activePointers.set(e.pointerId ?? 1, { x: e.clientX, y: e.clientY });
    }
    if (mode === "pinch" && activePointers.size >= 2) {
      const points = [...activePointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchDistance > 0) camDistT = clamp(camDistT - (distance - pinchDistance) * 0.008, DIST_MIN, DIST_MAX);
      pinchDistance = distance;
      // Two fingers turn the jar as well as zoom it, so turning it never stops
      // being available however the one-finger drag is being spent.
      const mid = midpoint(points);
      if (pinchMid && !camLocked) {
        target.y += (mid.x - pinchMid.x) * 0.008;
        target.x = clamp(target.x + (mid.y - pinchMid.y) * 0.006, X_MIN, X_MAX);
      }
      pinchMid = mid;
      markInteraction();
      return;
    }
    const p = pointer(e);
    if (mode === "aim") {
      aimHandler?.move?.(p);
      markInteraction();
      return;
    }
    if (mode === "object") {
      objectDragHandler?.(p);
      markInteraction();
      return;
    }
    if (!dragging) return;
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    // `moved` still accumulates while locked: a drag is a drag either way, and
    // a press that travelled should not end as a tap just because the camera
    // refused to follow it.
    moved += Math.abs(dx) + Math.abs(dy);
    if (!camLocked) {
      target.y += dx * 0.008;
      target.x = clamp(target.x + dy * 0.006, X_MIN, X_MAX);
    }
    last = p;
    markInteraction();
  }

  function onUp(e) {
    // Releasing a capture that was never taken throws, and onDown already
    // tolerates the capture failing — so without this the throw would take the
    // rest of onUp with it and the press would end in nothing at all: no tap,
    // no drop, no plant.
    try {
      canvas.releasePointerCapture?.(e.pointerId ?? 1);
    } catch {
      /* nothing was captured — the window listeners carried the gesture */
    }
    activePointers.delete(e.pointerId ?? 1);
    if (mode === "pinch") {
      if (activePointers.size < 2) {
        mode = null;
        pinchDistance = 0;
        pinchMid = null;
      }
      markInteraction();
      return;
    }
    // Lifting the finger is the release: the placement preview clears.
    if (mode === "aim") {
      aimHandler?.end?.(pointer(e));
      mode = null;
      markInteraction();
      return;
    }
    if (mode === "object") {
      objectDropHandler?.();
      canvas.style.cursor = "";
      mode = null;
      markInteraction();
      return;
    }
    if (!dragging) return;
    dragging = false;
    mode = null;
    // A near-stationary press is a tap → placement.
    if (moved < 6 && tapHandler) tapHandler(pointer(e));
    markInteraction();
  }

  // A cancelled pointer never lifted, so an aim in flight is dropped rather
  // than planted — the browser took the gesture away, the user didn't finish it.
  function onCancel(e) {
    if (mode === "aim") {
      activePointers.delete(e.pointerId ?? 1);
      aimHandler?.cancel?.();
      mode = null;
      return;
    }
    onUp(e);
  }

  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);

  // --- zoom: scroll to lean right up to the glass ------------------------
  const camDir = camera.position.clone().normalize();
  // Framing: the vessel is the subject, so the camera is placed from the jar's
  // own height rather than a fixed guess. `frameJar` puts its centre on the
  // camera's axis and backs off just far enough to leave a margin around it.
  let lookAtY = 0.1;
  let framed = { centerY: 0.1, height: 3.0 };
  /**
   * Frame the shot on a vessel of this height and this horizontal reach.
   *
   * `radius` is the widest the vessel gets from its own axis in the XZ plane.
   * It used to be ignored entirely: the distance was solved from height alone,
   * which frames an upright jar correctly and crops everything that is wider
   * than it is tall. A glass house lost its eaves and a bottle on its side ran
   * off both edges of the screen. The turntable makes this worse, not better,
   * because the widest silhouette arrives part-way through a spin — so the fit
   * uses the vessel's greatest horizontal extent, not the one facing us now.
   */
  function frameJar(centerY, height, { fill = 0.76, animate = true, radius = 0 } = {}) {
    framed = { centerY, height, radius };
    lookAtY = centerY;
    const vfov = (camera.fov * Math.PI) / 180;
    const tanV = Math.tan(vfov / 2);
    const tanH = tanV * camera.aspect;
    // Whichever axis runs out of room first decides the distance — and then
    // the vessel's own depth is added on top, because that distance frames the
    // shot at the *centre* of the jar while the corner nearest the lens sits a
    // radius closer and therefore projects larger. Without this the front-lower
    // corner of a wide vessel hangs off the bottom of the screen even though
    // the arithmetic says it fits.
    const distV = height / (2 * fill * tanV);
    const distH = radius > 0 ? radius / (fill * tanH) : 0;
    const dist = Math.max(distV, distH) + radius;
    camDistT = clamp(dist, DIST_MIN, DIST_MAX);
    if (!animate) camDist = camDistT;
    // A shallow bowl and a tall bell jar are shot from different distances, so
    // re-seat the backdrop on the frame this vessel is going to be seen in.
    fitBackdrop();
  }
  // Pitch is an *orbit of the camera*, not a tilt of the jar: the table is a
  // fixed horizontal plane, so leaning the world on its X axis pushed the
  // jar's base straight through the tabletop. Keep the vessel upright and
  // raise/lower the eye instead.
  const camFlat = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
  const camBaseElev = Math.asin(clamp(camDir.y, -1, 1));
  const ELEV_MIN = 0.04; // never drop the eye to (or below) the tabletop
  // 1.45 rad is 83°: steep enough to read a jar's footprint from above, and
  // safely short of 90°, where the eye sits on the axis it is looking down and
  // camera.lookAt has no up vector left to work with.
  const ELEV_MAX = 1.45;
  let camDist = camera.position.length();
  let camDistT = camDist;
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camDistT = clamp(camDistT + e.deltaY * 0.005, DIST_MIN, DIST_MAX);
      markInteraction();
    },
    { passive: false },
  );

  // --- the backdrop, as a thing in the room ------------------------------
  // The backdrop used to hang on `scene.background`: a flat image pasted
  // behind everything, glued to the lens. It cannot move, so however far you
  // lean in or however much you turn the jar, the world behind the glass never
  // shifts — which is exactly why swapping themes felt like changing wallpaper
  // rather than carrying the terrarium into a different room.
  //
  // Here the backdrop is a surface standing in the scene instead: a wide,
  // gently curved wall 24 units back. Because it has a position, the camera's
  // drift and every dolly slide it against the table, and the glass refracts
  // it like anything else in the room. It is also drawn sharp — the depth now
  // comes from parallax, so the picture no longer has to be blurred into a
  // mush to keep the jar readable.
  const SHELL_R = 24;
  // Taller than any shot needs. The picture is mapped onto a band in the
  // middle of it and the edge pixels stretch away above and below, so leaning
  // the camera runs out of *photo* long before it runs out of *wall* — and
  // stretched edge is a far better thing to find at the bottom of the screen
  // than the rim of the geometry.
  const SHELL_H = 56;
  const SHELL_ARC = 2.9; // radians — far wider than the lens ever sees
  const shellMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    fog: false, // fog belongs to the table's far edge, not to the room itself
    toneMapped: true,
  });
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(
      SHELL_R, SHELL_R, SHELL_H, 96, 1, true,
      Math.PI - SHELL_ARC / 2, SHELL_ARC,
    ),
    shellMat,
  );
  shell.renderOrder = -10;
  shell.frustumCulled = false;
  scene.add(shell);

  // Fit the backdrop image to the frame the camera has *right now*, then leave
  // it there. Re-fitting every frame would glue the picture back to the lens
  // and undo the parallax; this only runs when the frame itself changes (a new
  // backdrop, a resize, a different vessel to frame).
  // Margin of real picture around the frame, to cover the eye being raised or
  // lowered and drifting after the fit was taken — without that the wall runs
  // out mid-shot and the bottom of the screen fills with the flat colour behind
  // it. It used to be 1.5, back when the photos were 736px and being enlarged
  // less mattered more than being seen: that showed only the middle 67% of each
  // picture in both axes, so every backdrop arrived cropped into a detail of
  // itself. At 1.15 roughly 87% of the photo is on screen — nearly double the
  // area — and there is still enough spare wall for the parallax sway.
  // A sliver of picture beyond the frame, so a frame computed a moment ago
  // still covers the screen a moment later. The fit now follows the camera (see
  // fitBackdrop), so this no longer has to pay for where the eye might wander —
  // only for the easing lag between one frame and the next.
  const SHELL_OVERSCAN = 1.03;
  const SHELL_THETA0 = Math.PI - SHELL_ARC / 2;

  // Where a ray lands on the shell, in the geometry's own uv. The shell counts
  // as an infinite cylinder here: every ray from an eye inside it meets the far
  // wall exactly once going forward.
  function shellUV(ox, oy, oz, dx, dy, dz) {
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return null; // straight up or down the axis
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - SHELL_R * SHELL_R;
    const disc = b * b - 4 * a * c;
    if (disc <= 0) return null;
    const t = (-b + Math.sqrt(disc)) / (2 * a);
    if (t <= 0) return null;
    const x = ox + dx * t;
    const y = oy + dy * t;
    const z = oz + dz * t;
    // CylinderGeometry lays u along theta measured as atan2(x, z) from
    // thetaStart; unwrap so the arc reads 0..1 across the wall.
    let th = Math.atan2(x, z);
    while (th < SHELL_THETA0) th += Math.PI * 2;
    return { u: (th - SHELL_THETA0) / SHELL_ARC, v: (y + SHELL_H / 2) / SHELL_H };
  }

  // Frame the backdrop on the picture, every time the eye moves.
  //
  // Two things were wrong here. The fit used to size itself by pretending the
  // shell were a flat wall at `SHELL_R + camDistT` and asking how much of it
  // the lens covered; on a cylinder that is wrong in both axes and wrong by
  // different amounts, because the corners of the frame look further round the
  // curve than its centre does. And it ran *once*, for the pose the camera
  // happened to hold at the time.
  //
  // That second part is what survived the first fix and kept the complaints
  // coming. A fit is only true for the pose it was taken at, so tilting the eye
  // afterwards slid the photograph off the frame: the picture arrived looking
  // like a blown-up crop of itself, its floor sat below the bottom of the
  // screen where it could not be reached, and looking down far enough ran off
  // the picture altogether into a smear of stretched edge pixels.
  //
  // So the fit follows the eye. It reads the live camera — the one that has
  // actually been positioned this frame, parallax and easing included — casts
  // the frame's corners, edges and centre at the shell, and takes the box they
  // land in. The photograph is then always the thing on screen, whole, at every
  // pitch and every dolly. What that costs is the backdrop's parallax: it no
  // longer slides or resizes against the jar as the eye moves. A photograph
  // that is always framed is the thing that was asked for, and a terrarium on a
  // table is not a scene that needs the room behind it to swim.
  const FIT_TAPS = [-1, 0, 1];
  // The eye the current fit was taken from, so the tick can tell when it is
  // stale. Seeded off-camera so the very first frame always fits.
  const fitEye = new THREE.Vector3(NaN, NaN, NaN);
  let fitLookAtY = NaN;
  function fitBackdrop() {
    const tex = shellMat.map;
    if (!tex) return;
    // The live eye, not a reconstruction of it: whatever the tick positioned.
    const ox = camera.position.x;
    const oy = camera.position.y;
    const oz = camera.position.z;
    // Camera basis, built the way camera.lookAt builds it.
    let fx0 = -ox;
    let fy0 = lookAtY - oy;
    let fz0 = -oz;
    const fl = Math.hypot(fx0, fy0, fz0) || 1;
    fx0 /= fl; fy0 /= fl; fz0 /= fl;
    // right = forward x worldUp, with worldUp (0,1,0)
    let rx = -fz0;
    let rz = fx0;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    // up = right x forward
    const ux = -rz * fy0;
    const uy = rz * fx0 - rx * fz0;
    const uz = rx * fy0;

    const th = Math.tan(((camera.fov * Math.PI) / 180) / 2);
    const tw = th * camera.aspect;
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const sy of FIT_TAPS) {
      for (const sx of FIT_TAPS) {
        const hit = shellUV(
          ox, oy, oz,
          fx0 + rx * sx * tw + ux * sy * th,
          fy0 + uy * sy * th,
          fz0 + rz * sx * tw + uz * sy * th,
        );
        if (!hit) continue;
        if (hit.u < uMin) uMin = hit.u;
        if (hit.u > uMax) uMax = hit.u;
        if (hit.v < vMin) vMin = hit.v;
        if (hit.v > vMax) vMax = hit.v;
      }
    }
    if (!(uMax > uMin) || !(vMax > vMin)) return; // degenerate — keep the last fit

    const uc = (uMin + uMax) / 2;
    const vc = (vMin + vMax) / 2;
    const uHalf = ((uMax - uMin) / 2) * SHELL_OVERSCAN;
    const vHalf = ((vMax - vMin) / 2) * SHELL_OVERSCAN;

    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // u runs from screen-right to screen-left around the arc, so the picture
    // goes on backwards unless the horizontal repeat is negative.
    tex.repeat.set(-0.5 / uHalf, 0.5 / vHalf);
    tex.offset.set(0.5 - uc * tex.repeat.x, 0.5 - vc * tex.repeat.y);
    tex.needsUpdate = true;
  }

  // Hand the shell a new picture, and a tone for whatever lies past the ends
  // of the wall.
  function setBackdropTexture(tex, tint) {
    const old = shellMat.map;
    shellMat.map = tex;
    shellMat.needsUpdate = true;
    if (old && old !== tex) old.dispose();
    if (tint) scene.background = tint;
    fitBackdrop();
  }

  // --- parallax ----------------------------------------------------------
  // A few centimetres of head movement is what actually tells you a room is a
  // room. The eye drifts with the cursor — far too little to fight the user
  // for control of the camera, but enough that the backdrop slides behind the
  // jar and the two stop looking like one flat picture.
  const PARA_AZ = 0.09; // radians of sway, left to right
  const PARA_EL = 0.05;
  let paraX = 0;
  let paraY = 0;
  let paraTX = 0;
  let paraTY = 0;
  function trackParallax(e) {
    // Mouse only: a finger is never hovering, so on touch this would just drag
    // the camera around underneath whatever the finger is actually doing.
    if (e.pointerType && e.pointerType !== "mouse") return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    paraTX = clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    paraTY = clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  }
  window.addEventListener("pointermove", trackParallax);

  // Initialise the whole scene through the studio mood so the first paint
  // matches the active mood button (backdrop, lights, slab all consistent).
  setMood("studio");

  // --- raycasting --------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Cast from a screen point against `objects`; returns the first hit
  // (world-space point + object) or null.
  function raycast(screen, objects) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((screen.x - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((screen.y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(objects, true);
    return hits.length ? hits[0] : null;
  }

  // --- resize + loop -----------------------------------------------------
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    // The desktop/phone density cap is width-derived, so crossing the
    // breakpoint has to re-apply it — otherwise a window dragged narrow keeps
    // rendering at desktop density on a machine that just said it can't.
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality === "low" ? 1 : DPR_CAP()),
    );
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Backdrop photos are drawn cover-fit for the current viewport, so a resize
    // has to redraw them or the picture stretches.
    if (activePhoto) applyPhoto(activePhoto.img, activePhoto.theme);
    else fitBackdrop();
  }
  window.addEventListener("resize", resize);
  resize();

  let onFrame = null;
  function tick(now) {
    // Auto-spin: on by default only after a pause, so the build drifts back
    // into view; switched on explicitly it turns the whole time, which is how
    // you paint or plant the back of a terrarium without fighting the camera.
    const still = document.body.classList.contains("reduced-motion");
    // Idle drift is the jar showing itself off while you are not touching it —
    // pleasant normally, and exactly the kind of unasked-for movement reduced
    // motion is turned on to stop. The explicit ⟳ toggle is a different thing:
    // the user asked for that one, so it keeps turning.
    const idleDrift = !still && !camLocked && now - lastInteraction > IDLE_MS;
    if (!dragging && mode === null && (autoSpin || idleDrift)) {
      target.y += autoSpin ? 0.0022 : 0.0016;
    }
    // critically-damped-ish easing toward target
    rot.x += (target.x - rot.x) * 0.12;
    rot.y += (target.y - rot.y) * 0.12;
    world.rotation.y = rot.y; // turntable spin only — X tilt would sink the jar

    // smooth dolly zoom
    camDist += (camDistT - camDist) * 0.1;
    // Ease the eye toward the cursor. Reduced motion gets a dead-still camera.
    paraX += ((still ? 0 : paraTX) - paraX) * 0.045;
    paraY += ((still ? 0 : paraTY) - paraY) * 0.045;
    const elev = clamp(camBaseElev + rot.x - paraY * PARA_EL, ELEV_MIN, ELEV_MAX);
    const ce = Math.cos(elev);
    // Swing the eye around the subject rather than turning it: the jar stays
    // centred and the backdrop is what moves, which is the whole point.
    const az = paraX * PARA_AZ;
    const ca = Math.cos(az);
    const sa = Math.sin(az);
    camera.position
      .set(
        (camFlat.x * ca + camFlat.z * sa) * ce,
        Math.sin(elev),
        (camFlat.z * ca - camFlat.x * sa) * ce,
      )
      .multiplyScalar(camDist);
    camera.lookAt(0, lookAtY, 0);
    // The backdrop is framed against the eye that was just positioned. Only
    // when it has actually moved — a still camera re-uses the last fit, so an
    // idle scene costs nothing. Nine ray-cylinder intersections is cheap enough
    // to do on a moving frame and far cheaper than the alternative, which is a
    // photograph that slides off the screen when you tilt.
    if (
      Math.abs(camera.position.x - fitEye.x) > 1e-4 ||
      Math.abs(camera.position.y - fitEye.y) > 1e-4 ||
      Math.abs(camera.position.z - fitEye.z) > 1e-4 ||
      fitLookAtY !== lookAtY
    ) {
      fitEye.copy(camera.position);
      fitLookAtY = lookAtY;
      fitBackdrop();
    }

    onFrame?.(now);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    scene,
    camera,
    renderer,
    world,
    envMap,
    raycast,
    markInteraction,
    setBaseY,
    frameJar,
    setAutoSpin: (on) => (autoSpin = !!on),
    isAutoSpin: () => autoSpin,
    setCameraLock: (on) => (camLocked = !!on),
    // Zoom as a discrete step, so the pinch gesture is not the only way to get
    // closer. A step of the full range's eighth is roughly one comfortable
    // pinch, and it eases in through the same camDistT the wheel drives.
    zoomStep: (direction) => {
      camDistT = clamp(
        camDistT + direction * (DIST_MAX - DIST_MIN) * 0.125,
        DIST_MIN,
        DIST_MAX,
      );
      return (camDistT - DIST_MIN) / (DIST_MAX - DIST_MIN);
    },
    canZoom: (direction) =>
      direction < 0 ? camDistT > DIST_MIN + 0.01 : camDistT < DIST_MAX - 0.01,
    isCameraLocked: () => camLocked,
    setMood,
    setBusyReporter: (fn) => (busyReporter = fn),
    setQuality,
    getQuality,
    setTheme,
    setBackdropCalm,
    setTable,
    setTimeOfDay,
    resetView,
    setPhotoLighting,
    setView,
    restoreViewPose,
    hasViewPose: () => Boolean(restorePose),
    capture,
    setTapHandler: (fn) => (tapHandler = fn),
    setOnFrame: (fn) => (onFrame = fn),
    setGrabHandler: (fn) => (grabHandler = fn),
    setAimHandler: (fns) => (aimHandler = fns),
    setObjectDrag: (fn) => (objectDragHandler = fn),
    setObjectDrop: (fn) => (objectDropHandler = fn),
  };
}

// --- helpers -------------------------------------------------------------

function pointer(e) {
  // `touch` is what tells the handlers there is no hover to fall back on.
  return {
    x: e.clientX,
    y: e.clientY,
    touch: e.pointerType === "touch" || e.pointerType === "pen",
  };
}

function midpoint(points) {
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// A soft warm backdrop: vertical gradient plus a radial glow behind the jar and
// a subtle darkening toward the edges (vignette) — reads like a photographed
// studio wall rather than a flat fill.
// The cozy room from the reference: a warm wall with a big paned window
// behind the table, bare trees blurred outside — the jar sits in a home, not
// a void.
function makeStudioBackdrop(mood) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");

  if (mood.draw) {
    const painters = {
      studio: drawStudio,
      library: drawLibrary,
      garden: drawGarden,
      beach: drawBeach,
      space: drawSpace,
      mountain: drawMountain,
      rain: drawRain,
      scenic: drawScenic,
    };
    painters[mood.draw](ctx, mood);
    const tex0 = new THREE.CanvasTexture(c);
    tex0.colorSpace = THREE.SRGBColorSpace;
    return tex0;
  }

  // wall
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, mood.wall[0]);
  lin.addColorStop(1, mood.wall[1]);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);

  // window: frame + 2×2 panes, centred behind the jar
  const wx = 292;
  const wy = 30;
  const ww = 440;
  const wh = 400;
  ctx.fillStyle = mood.frame;
  ctx.fillRect(wx - 14, wy - 14, ww + 28, wh + 28);

  ctx.fillStyle = mood.sky;
  ctx.fillRect(wx, wy, ww, wh);

  // blurred bare trees outside
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  ctx.filter = "blur(3px)";
  ctx.strokeStyle = mood.trees;
  for (let i = 0; i < 14; i++) {
    const x = wx + Math.random() * ww;
    ctx.lineWidth = 3 + Math.random() * 7;
    ctx.beginPath();
    ctx.moveTo(x, wy + wh);
    ctx.bezierCurveTo(
      x + jitter2(18),
      wy + wh * 0.6,
      x + jitter2(30),
      wy + wh * 0.3,
      x + jitter2(44),
      wy,
    );
    ctx.stroke();
    // a few branches
    for (let b = 0; b < 3; b++) {
      const by = wy + wh * (0.15 + Math.random() * 0.5);
      ctx.lineWidth = 1.5 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x + jitter2(14), by);
      ctx.lineTo(x + jitter2(60), by - 30 - Math.random() * 40);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.filter = "none";

  // muntins dividing the panes
  ctx.fillStyle = mood.frame;
  ctx.fillRect(wx + ww / 2 - 7, wy, 14, wh);
  ctx.fillRect(wx, wy + wh / 2 - 7, ww, 14);

  // soft light spilling from the window
  const glow = ctx.createRadialGradient(512, 240, 60, 512, 240, 460);
  glow.addColorStop(0, "rgba(255,250,238,0.2)");
  glow.addColorStop(1, "rgba(255,250,238,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);

  // vignette
  const vig = ctx.createRadialGradient(512, 256, 260, 512, 256, 640);
  vig.addColorStop(0, "rgba(40,28,18,0)");
  vig.addColorStop(1, "rgba(40,28,18,0.3)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural plank-wood for the tabletop: long grain streaks, subtle plank
// seams and fine scratches — like the scrubbed wooden table in the reference.
function makeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8a6544";
  ctx.fillRect(0, 0, 512, 512);

  // grain streaks
  for (let i = 0; i < 250; i++) {
    const y = Math.random() * 512;
    const w = 40 + Math.random() * 240;
    const x = Math.random() * 512 - 60;
    const light = Math.random() < 0.5;
    ctx.strokeStyle = light
      ? `rgba(190,155,115,${0.06 + Math.random() * 0.1})`
      : `rgba(70,48,30,${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + w * 0.3, y + jitter2(4), x + w * 0.7, y + jitter2(4), x + w, y + jitter2(2));
    ctx.stroke();
  }
  // plank seams
  ctx.strokeStyle = "rgba(50,34,20,0.5)";
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 128 + jitter2(6));
    ctx.lineTo(512, i * 128 + jitter2(6));
    ctx.stroke();
  }
  // pale scratches
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(230,210,180,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + jitter2(70), y + jitter2(14));
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

// The other three tabletops. Each is painted the same way the wood is — a base
// fill, then the marks that make the material read at a glance — and each is
// deliberately low-contrast: this surface sits directly under the glass, and a
// busy tabletop steals the eye from what is growing on it.
function makeMarbleTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f2f1ec";
  ctx.fillRect(0, 0, 512, 512);
  // Veins: a few long forks, each shadowed by hairlines running alongside it.
  for (let i = 0; i < 14; i++) {
    const y = Math.random() * 512;
    const x = -40 + Math.random() * 120;
    const drift = jitter2(160);
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = pass === 0 ? "rgba(150,150,145,0.34)" : `rgba(170,168,160,${0.1 + Math.random() * 0.1})`;
      ctx.lineWidth = pass === 0 ? 1.6 + Math.random() * 1.6 : 0.5;
      const off = pass === 0 ? 0 : jitter2(9);
      ctx.beginPath();
      ctx.moveTo(x, y + off);
      ctx.bezierCurveTo(x + 180, y + drift * 0.4 + off, x + 380, y - drift * 0.5 + off, 560, y + drift + off);
      ctx.stroke();
    }
  }
  // Cloudy mineral blotches so the white is never a flat fill.
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(Math.random() * 512, Math.random() * 512, 2, Math.random() * 512, Math.random() * 512, 40 + Math.random() * 90);
    g.addColorStop(0, "rgba(214,212,205,0.2)");
    g.addColorStop(1, "rgba(214,212,205,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.6, 1.6); // marble wants big slabs, not a tiled pattern
  return tex;
}

function makeStoneTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8d8f90";
  ctx.fillRect(0, 0, 512, 512);
  // Speckle first, then broad cleavage bands: fine grit under flat planes is
  // what separates slate from concrete.
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = Math.random() < 0.5
      ? `rgba(255,255,255,${Math.random() * 0.09})`
      : `rgba(30,32,34,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  for (let i = 0; i < 24; i++) {
    ctx.strokeStyle = `rgba(40,43,46,${0.05 + Math.random() * 0.09})`;
    ctx.lineWidth = 3 + Math.random() * 14;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(140, y + jitter2(22), 340, y + jitter2(22), 532, y + jitter2(30));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function makeRattanTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c9a878";
  ctx.fillRect(0, 0, 512, 512);
  // A woven check: strands one way, strands the other, and the over-under read
  // comes from shading alternate cells rather than from real geometry.
  const S = 32;
  for (let y = 0; y < 512; y += S) {
    for (let x = 0; x < 512; x += S) {
      const over = ((x / S + y / S) | 0) % 2 === 0;
      ctx.fillStyle = over ? "rgba(226,197,150,0.75)" : "rgba(150,116,74,0.5)";
      if (over) ctx.fillRect(x + 1, y + 4, S - 2, S - 8);
      else ctx.fillRect(x + 4, y + 1, S - 8, S - 2);
      ctx.strokeStyle = "rgba(96,72,44,0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, S - 3, S - 3);
    }
  }
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(255,240,214,${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.7;
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + jitter2(26), y + jitter2(26));
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

function jitter2(a) {
  return (Math.random() - 0.5) * 2 * a;
}

// Clean photographer's sweep: a seamless cool-neutral cyclorama with a soft
// pool of light behind the jar and a gentle floor gradient — no window, no
// props, so the terrarium reads like a studio product shot.
function drawStudio(ctx) {
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, "#f4f6f8");
  lin.addColorStop(0.62, "#e5e8ed");
  lin.addColorStop(0.78, "#ccd1d7"); // soft horizon where wall meets floor
  lin.addColorStop(1, "#b6bcc4");
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);

  // broad soft key glow, upper-left like a big softbox
  const glow = ctx.createRadialGradient(420, 150, 40, 460, 210, 620);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);

  // The jar is transmissive glass. On a seamless near-white sweep it refracts
  // white against white, and on the default theme the whole vessel could take a
  // second to find — the app opened on something that looked empty. A soft pool
  // of shade behind where it stands gives the glass a darker field to bend, so
  // the silhouette reads on the first frame without the glass itself changing.
  const pool = ctx.createRadialGradient(512, 320, 50, 512, 350, 430);
  pool.addColorStop(0, "rgba(72,84,99,0.28)");
  pool.addColorStop(0.55, "rgba(72,84,99,0.13)");
  pool.addColorStop(1, "rgba(72,84,99,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, 1024, 512);

  // faint cool vignette to keep the corners from feeling flat
  const vig = ctx.createRadialGradient(512, 250, 300, 512, 250, 720);
  vig.addColorStop(0, "rgba(60,70,84,0)");
  vig.addColorStop(1, "rgba(60,70,84,0.2)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 1024, 512);
}

// Candlelit study: stone wall, tall bookshelves stuffed with book spines and
// pools of warm candle glow — the reference game's cosy library room.
function drawLibrary(ctx, mood) {
  // stone wall
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, mood.wall[0]);
  lin.addColorStop(1, mood.wall[1]);
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);
  // faint stone blocks
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1.5;
  for (let y = 0; y < 512; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
    for (let x = (y / 46) % 2 ? 0 : 45; x < 1024; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 46);
      ctx.stroke();
    }
  }

  // two bookshelves flanking the table
  const spineColors = ["#7a3b2e", "#5a4a2c", "#3e5a3a", "#6b3d55", "#8a6a35", "#44506b"];
  for (const sx of [40, 744]) {
    ctx.fillStyle = "#2a1c10";
    ctx.fillRect(sx, 60, 240, 400);
    for (let shelf = 0; shelf < 4; shelf++) {
      const sy = 84 + shelf * 96;
      ctx.fillStyle = "#1c1209";
      ctx.fillRect(sx + 10, sy, 220, 78);
      // book spines
      let bx = sx + 14;
      while (bx < sx + 216) {
        const bw = 8 + Math.random() * 14;
        const bh = 52 + Math.random() * 22;
        ctx.fillStyle = spineColors[(Math.random() * spineColors.length) | 0];
        ctx.fillRect(bx, sy + 78 - bh, bw, bh);
        bx += bw + 2;
      }
      ctx.fillStyle = "#3a2a18";
      ctx.fillRect(sx + 8, sy + 76, 224, 8);
    }
  }

  // candle glows
  for (const [gx, gy, gr] of [
    [512, 150, 200],
    [180, 320, 130],
    [860, 300, 130],
  ]) {
    const glow = ctx.createRadialGradient(gx, gy, 8, gx, gy, gr);
    glow.addColorStop(0, "rgba(255,180,90,0.4)");
    glow.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 512);
  }

  // vignette
  const vig = ctx.createRadialGradient(512, 256, 240, 512, 256, 640);
  vig.addColorStop(0, "rgba(10,6,2,0)");
  vig.addColorStop(1, "rgba(10,6,2,0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 1024, 512);
}

// Sunlit garden: soft green depth-of-field blur with warm bokeh discs.
function drawGarden(ctx) {
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, "#dcecc8");
  lin.addColorStop(0.5, "#a8c888");
  lin.addColorStop(1, "#6f9a58");
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 40; i++) {
    const r = 12 + Math.random() * 46;
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
    const warm = Math.random() < 0.35;
    g.addColorStop(0, warm ? "rgba(255,244,200,0.5)" : "rgba(220,240,190,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.translate(Math.random() * 1024, Math.random() * 512);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

// Beach: pale sky, sun glow, sea band with sparkle, warm sand below.
function drawBeach(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, "#cfe4ee");
  sky.addColorStop(1, "#f2e4c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 300);
  const sun = ctx.createRadialGradient(700, 130, 10, 700, 130, 180);
  sun.addColorStop(0, "rgba(255,240,200,0.9)");
  sun.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 300);
  const sea = ctx.createLinearGradient(0, 300, 0, 380);
  sea.addColorStop(0, "#7fb2b8");
  sea.addColorStop(1, "#5f96a4");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 300, 1024, 80);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 26; i++) {
    const y = 305 + Math.random() * 68;
    const x = Math.random() * 1024;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14 + Math.random() * 40, y);
    ctx.stroke();
  }
  const sand = ctx.createLinearGradient(0, 380, 0, 512);
  sand.addColorStop(0, "#e8d4a8");
  sand.addColorStop(1, "#d4ba8a");
  ctx.fillStyle = sand;
  ctx.fillRect(0, 380, 1024, 132);
}

// Deep space: stars, two soft nebulae and a big moon.
function drawSpace(ctx) {
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, "#0c101e");
  lin.addColorStop(1, "#1a2236");
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);
  for (const [nx, ny, nr, col] of [
    [280, 160, 220, "rgba(120,90,200,0.22)"],
    [780, 340, 260, "rgba(70,140,190,0.2)"],
  ]) {
    const neb = ctx.createRadialGradient(nx, ny, 10, nx, ny, nr);
    neb.addColorStop(0, col);
    neb.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, 1024, 512);
  }
  for (let i = 0; i < 260; i++) {
    const s = Math.random();
    ctx.fillStyle = `rgba(255,255,255,${0.25 + s * 0.7})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 512, s < 0.92 ? 1 : 2, s < 0.92 ? 1 : 2);
  }
  ctx.fillStyle = "#e8e4da";
  ctx.beginPath();
  ctx.arc(850, 110, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(180,175,165,0.5)";
  for (const [mx, my, mr] of [[838, 96, 9], [864, 122, 6], [846, 128, 4]]) {
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Layered mountain silhouettes at sunset.
function drawMountain(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#f6d8a8");
  sky.addColorStop(0.55, "#e8a878");
  sky.addColorStop(1, "#b06a58");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  const sun = ctx.createRadialGradient(512, 300, 12, 512, 300, 220);
  sun.addColorStop(0, "rgba(255,230,180,0.85)");
  sun.addColorStop(1, "rgba(255,230,180,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);
  const ridges = [
    ["#9a6a5c", 300, 70],
    ["#7a5150", 360, 55],
    ["#593c44", 420, 40],
  ];
  for (const [col, baseY, amp] of ridges) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    let y = baseY;
    for (let x = 0; x <= 1024; x += 40) {
      y = baseY + (Math.random() - 0.5) * amp * 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(1024, 512);
    ctx.closePath();
    ctx.fill();
  }
}

// A rainy day through the window: grey light and streaking raindrops.
function drawRain(ctx) {
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, "#b8c4cc");
  lin.addColorStop(0.6, "#9aa8b2");
  lin.addColorStop(1, "#7e8c96");
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);
  // hazy distant buildings
  ctx.fillStyle = "rgba(90,102,112,0.35)";
  for (let i = 0; i < 9; i++) {
    const w = 60 + Math.random() * 80;
    const h = 90 + Math.random() * 160;
    ctx.fillRect(i * 115 + Math.random() * 20, 512 - h - 120, w, h);
  }
  // rain streaks
  ctx.strokeStyle = "rgba(230,240,248,0.35)";
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 512;
    const len = 10 + Math.random() * 26;
    ctx.lineWidth = 0.8 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + len);
    ctx.stroke();
  }
  // droplets clinging to the "window"
  for (let i = 0; i < 40; i++) {
    const r = 1.5 + Math.random() * 3.5;
    ctx.fillStyle = "rgba(240,248,255,0.4)";
    ctx.beginPath();
    ctx.arc(Math.random() * 1024, Math.random() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Generic scenic backdrop driven entirely by a palette on the mood, so each
// theme can have its own distinct, reliably-rendered world without shipping a
// heavy GLB room. `mood.scene` selects the silhouette style; the colours and
// optional accent dots make each theme read differently at a glance.
function drawScenic(ctx, mood) {
  const [top, bottom] = mood.sky || ["#cfe0ec", "#eef3f0"];
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);

  // a soft light source (sun / moon / glow)
  if (mood.glow) {
    const gx = mood.glowX ?? 512;
    const g = ctx.createRadialGradient(gx, 150, 8, gx, 180, mood.glowR ?? 320);
    g.addColorStop(0, mood.glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);
  }
  if (mood.orb) {
    ctx.fillStyle = mood.orb;
    ctx.beginPath();
    ctx.arc(mood.glowX ?? 512, 150, mood.orbR ?? 46, 0, Math.PI * 2);
    ctx.fill();
  }

  // distant stars / floating sparks scattered high in the sky
  if (mood.stars) {
    ctx.fillStyle = mood.stars;
    for (let i = 0; i < 90; i++) {
      const r = Math.random() * 1.6 + 0.3;
      ctx.globalAlpha = 0.3 + Math.random() * 0.6;
      ctx.beginPath();
      ctx.arc(Math.random() * 1024, Math.random() * 300, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // layered silhouettes from far (light) to near (dark) for depth
  const layers = mood.layers || [[mood.silh || "#33463a", 360, 60]];
  layers.forEach(([color, baseY, amp], li) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    if (mood.scene === "city") {
      let x = -30;
      let i = li * 7;
      const line = [];
      while (x < 1054) {
        const w = 34 + ((i * 37) % 66);
        const h = amp * (0.5 + ((i * 53) % 100) / 100);
        line.push([x, baseY - h, w, h]);
        x += w + 6;
        i++;
      }
      ctx.lineTo(0, baseY);
      line.forEach(([bx, by, bw]) => { ctx.lineTo(bx, by); ctx.lineTo(bx + bw, by); });
      ctx.lineTo(1024, baseY);
    } else if (mood.scene === "peaks") {
      const step = 150 - li * 20;
      for (let x = -step; x <= 1024 + step; x += step) {
        ctx.lineTo(x + step / 2, baseY - amp);
        ctx.lineTo(x + step, baseY + amp * 0.15);
      }
    } else {
      // rolling hills / islands / canopy — smooth waves
      const f1 = 0.005 + li * 0.002;
      const seed = li * 1.7;
      for (let x = 0; x <= 1024; x += 8) {
        const y = baseY - amp * (Math.sin(x * f1 + seed) * 0.6 + Math.sin(x * f1 * 2.3 + seed) * 0.25 + 0.15);
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(1024, 512);
    ctx.closePath();
    ctx.fill();
  });

  // tree / trunk silhouettes standing on the nearest layer (blossom, jungle…)
  if (mood.trees2) {
    ctx.strokeStyle = mood.trees2;
    for (let i = 0; i < 7; i++) {
      const x = 90 + i * 140 + jitter2(30);
      ctx.lineWidth = 5 + Math.random() * 5;
      ctx.beginPath();
      ctx.moveTo(x, 460);
      ctx.bezierCurveTo(x + jitter2(20), 400, x + jitter2(30), 360, x + jitter2(30), 330);
      ctx.stroke();
    }
  }

  // accent dots: lanterns, blossom petals, fireflies drifting mid-scene
  if (mood.dots) {
    for (let i = 0; i < (mood.dotCount ?? 24); i++) {
      const x = Math.random() * 1024;
      const y = 120 + Math.random() * 300;
      const r = mood.dotR ?? 3;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      glow.addColorStop(0, mood.dots);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // gentle vignette to seat the jar
  const vig = ctx.createRadialGradient(512, 256, 260, 512, 256, 680);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, mood.vignette || "rgba(20,20,28,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, 1024, 512);
}

// A round tabletop / board: a turned disc with a softly rounded edge, so the
// rim catches a highlight instead of showing a hard cylinder seam. Lathed, then
// UV-mapped from the top so the wood grain reads across the surface.
function makeTableTop(radius, height) {
  const e = Math.min(height * 0.45, radius * 0.06); // edge round-over
  const pts = [
    [0, height / 2],
    [radius - e, height / 2],
    [radius - e * 0.25, height / 2 - e * 0.3],
    [radius, 0],
    [radius - e * 0.25, -height / 2 + e * 0.3],
    [radius - e, -height / 2],
    [0, -height / 2],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const geo = new THREE.LatheGeometry(pts, 72);
  // planar UVs so the grain runs across the board rather than spiralling
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(
      i,
      (pos.getX(i) / (radius * 2) + 0.5) * 0.9,
      (pos.getZ(i) / (radius * 2) + 0.5) * 0.9,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function makeRadialShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, "rgba(60,40,25,0.55)");
  g.addColorStop(1, "rgba(60,40,25,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
