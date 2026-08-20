import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { themeById } from "./themes.js";

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.25 : 1.6));
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

  scene.background = makeStudioBackdrop(MOODS.studio);

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

  // --- the table the jar sits on ----------------------------------------
  // A small round side table rather than an endless floor: a floor plane that
  // runs to the fog swallows the lower half of the screen and buries whatever
  // theme photo is behind it. A real piece of furniture with an edge you can
  // see reads better *and* leaves the backdrop room to breathe.
  const woodTex = makeWoodTexture();
  const TABLE_R = 1.95;
  const TABLE_H = 0.17;
  const table = new THREE.Group();
  const tableMats = [];

  const topMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xd8bb92,
    roughness: 0.72,
    metalness: 0,
  });
  tableMats.push(topMat);
  const tableTop = new THREE.Mesh(makeTableTop(TABLE_R, TABLE_H), topMat);
  tableTop.receiveShadow = true;
  tableTop.castShadow = true;
  table.add(tableTop);

  // Legs: slim, slightly splayed and tapered, running out of frame — enough of
  // them shows to say "table", none of it competes with the jar.
  const legMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xb08c62,
    roughness: 0.78,
  });
  tableMats.push(legMat);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 4.4, 12), legMat);
    const r = TABLE_R * 0.72;
    leg.position.set(Math.cos(a) * r, -TABLE_H - 2.2, Math.sin(a) * r);
    leg.rotation.z = -Math.cos(a) * 0.07;
    leg.rotation.x = Math.sin(a) * 0.07;
    leg.castShadow = true;
    table.add(leg);
  }
  scene.add(table);

  // A bamboo board under the jar — the cutting board every terrarium build is
  // actually assembled on, and a warm frame for the glass.
  const boardMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0xe8cfa4,
    roughness: 0.66,
  });
  tableMats.push(boardMat);
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

  // Tint every wooden part toward the light the scene is actually in, so the
  // table never glows brighter than the picture behind it.
  const TABLE_BASE = [0xd8bb92, 0xb08c62, 0xe8cfa4];
  function tintTable(color, mix = 0) {
    tableMats.forEach((m, i) => {
      m.color.set(TABLE_BASE[i]);
      if (mix > 0) m.color.lerp(color, mix);
      m.needsUpdate = true;
    });
  }

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
    roomLoader.load(
      `/${def.file}`,
      (gltf) => {
        roomCache.set(def.file, gltf);
        if (token === roomToken) placeRoom(gltf, def); // still the active mood?
      },
      undefined,
      () => {
        // model missing/failed — fall back to the neutral studio backdrop so the
        // scene never goes blank
        if (token !== roomToken) return;
        showTable(true);
        scene.background = makeStudioBackdrop(MOODS.studio);
      },
    );
  }

  let moodDef = null; // the active mood definition (its lights get scaled below)
  // Photo themes scale the room light so the table never out-shines the picture.
  // setTimeOfDay() honours it too, otherwise the day-night slider would undo it.
  let photoLight = 1;
  function applyLightScale() {
    if (!moodDef) return;
    key.intensity = (moodDef.keyI ?? 1.4) * photoLight;
    hemi.intensity = (moodDef.hemiI ?? 0.7) * photoLight;
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
      scene.background = new THREE.Color(m.bg ?? 0x1a1714);
      scene.fog.color.set(m.fog ?? m.bg ?? 0x1a1714);
      scene.fog.near = m.fogNear ?? 12;
      scene.fog.far = m.fogFar ?? 40;
      scene.environment && (scene.environmentIntensity = m.env ?? 1.0);
    } else {
      setRoom(null);
      showTable(true);
      scene.background = makeStudioBackdrop(m);
      scene.fog.color.set(m.fog);
      scene.fog.near = 11;
      scene.fog.far = 26;
      moodGround.set(m.ground);
      tintTable(moodGround, 0.35); // wood takes on the mood's light
    }
    key.color.set(m.key);
    photoLight = 1; // painted moods light the room at full strength
    key.intensity = m.keyI;
    hemi.intensity = m.hemiI;
    renderer.toneMappingExposure = m.exposure;
    layoutBase();
  }
  // --- photo backdrops ---------------------------------------------------
  // A theme photo never goes on screen raw. It is redrawn into a canvas that is
  // blurred (so the sharp jar reads as the subject), pushed toward a common
  // brightness (so a white balcony and a midnight cave both sit behind the
  // glass equally well), darkened toward the bottom where the table meets it,
  // and vignetted. Everything here exists to keep the terrarium legible.
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
    c.width = Math.min(1920, w);
    c.height = Math.round(c.width * (h / w));
    const ctx = c.getContext("2d");

    const bright = backdropBrightness(theme);
    const blur = Math.max(2, Math.round((c.width / 260) * (0.6 + photoCalm))); // depth of field
    const sat = (1.05 - photoCalm * 0.35).toFixed(2);
    ctx.filter = `blur(${blur}px) saturate(${sat}) brightness(${bright.toFixed(2)})`;
    // Overscan so the blur never smears in a transparent edge.
    const pad = blur * 3;
    const s = Math.max((c.width + pad * 2) / img.width, (c.height + pad * 2) / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    ctx.filter = "none";

    // Haze straight behind the jar: the glass and its greens need a calm,
    // low-contrast field to sit against.
    const haze = ctx.createRadialGradient(
      c.width * 0.5, c.height * 0.62, c.width * 0.04,
      c.width * 0.5, c.height * 0.62, c.width * 0.52,
    );
    haze.addColorStop(0, `rgba(8, 10, 9, ${(0.14 + photoCalm * 0.34).toFixed(2)})`);
    haze.addColorStop(0.55, `rgba(8, 10, 9, ${(0.07 + photoCalm * 0.2).toFixed(2)})`);
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
    return { tex, horizon: new THREE.Color(r / px / 255, g / px / 255, b / px / 255) };
  }

  function applyPhoto(img, theme) {
    activePhoto = { img, theme };
    scene.background?.dispose?.();
    const { tex, horizon } = drawPhotoBackdrop(img, theme);
    scene.background = tex;
    // Fog takes the colour the backdrop actually has at the horizon, so the far
    // edge of the table melts into the picture.
    const tone = new THREE.Color(theme.tone || "#20241f");
    scene.fog.color.copy(horizon);
    scene.fog.near = 11;
    scene.fog.far = 26;
    // Pull the table into the photo's light too — a moonlit room shouldn't have
    // a noon-bright tabletop under the jar.
    tintTable(new THREE.Color().copy(moodGround).lerp(tone, 0.55), 0.6);
    // Dim the room's own light to match how far back the photo was pushed: the
    // table and the jar then sit in the same light as the picture behind them,
    // instead of a bright tabletop against a dark wall.
    const b = backdropBrightness(theme);
    photoLight = clamp(0.4 + b * 0.5, 0.42, 1.1);
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
    key.intensity = (0.58 + daylight * 1.15) * photoLight;
    hemi.intensity = (0.25 + daylight * 0.65) * photoLight;
    fill.intensity = (0.1 + daylight * 0.28) * photoLight;
    rim.intensity = 0.5 + (1 - daylight) * 0.85;
    renderer.toneMappingExposure = (0.82 + daylight * 0.3) * clamp(0.8 + photoLight * 0.24, 0.8, 1.06);
  }
  // Initialise the whole scene through the studio mood so the first paint
  // matches the active mood button (background, lights, slab all consistent).
  setMood("studio");

  // Snapshot the current frame as a PNG data-URL (photo mode).
  function capture() {
    renderer.render(scene, camera);
    return canvas.toDataURL("image/png");
  }

  // --- world (rotated by the user) --------------------------------------
  const world = new THREE.Group();
  scene.add(world);

  // --- interaction: drag to rotate, idle auto-spin ----------------------
  const rot = { x: 0.05, y: 0.4 };
  const target = { x: 0.05, y: 0.4 };
  const X_MIN = -0.12;
  const X_MAX = 0.5;
  let dragging = false;
  let autoSpin = false;
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
  const activePointers = new Map();
  let pinchDistance = 0;

  function markInteraction() {
    lastInteraction = performance.now();
  }

  function resetView() {
    target.x = 0.05;
    target.y = 0.4;
    camDistT = 6.6;
    markInteraction();
  }

  function onDown(e) {
    markInteraction();
    activePointers.set(e.pointerId ?? 1, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture?.(e.pointerId ?? 1);
    if (activePointers.size >= 2) {
      const points = [...activePointers.values()];
      pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
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
      if (pinchDistance > 0) camDistT = clamp(camDistT - (distance - pinchDistance) * 0.008, 3.2, 9.5);
      pinchDistance = distance;
      markInteraction();
      return;
    }
    const p = pointer(e);
    if (mode === "object") {
      objectDragHandler?.(p);
      markInteraction();
      return;
    }
    if (!dragging) return;
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    target.y += dx * 0.008;
    target.x = clamp(target.x + dy * 0.006, X_MIN, X_MAX);
    last = p;
    markInteraction();
  }

  function onUp(e) {
    canvas.releasePointerCapture?.(e.pointerId ?? 1);
    activePointers.delete(e.pointerId ?? 1);
    if (mode === "pinch") {
      if (activePointers.size < 2) {
        mode = null;
        pinchDistance = 0;
      }
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

  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);

  // --- zoom: scroll to lean right up to the glass ------------------------
  const camDir = camera.position.clone().normalize();
  // Pitch is an *orbit of the camera*, not a tilt of the jar: the table is a
  // fixed horizontal plane, so leaning the world on its X axis pushed the
  // jar's base straight through the tabletop. Keep the vessel upright and
  // raise/lower the eye instead.
  const camFlat = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
  const camBaseElev = Math.asin(clamp(camDir.y, -1, 1));
  const ELEV_MIN = 0.04; // never drop the eye to (or below) the tabletop
  const ELEV_MAX = 1.15;
  let camDist = camera.position.length();
  let camDistT = camDist;
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camDistT = clamp(camDistT + e.deltaY * 0.005, 3.2, 9.5);
      markInteraction();
    },
    { passive: false },
  );

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
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Backdrop photos are drawn cover-fit for the current viewport, so a resize
    // has to redraw them or the picture stretches.
    if (activePhoto) applyPhoto(activePhoto.img, activePhoto.theme);
  }
  window.addEventListener("resize", resize);
  resize();

  let onFrame = null;
  function tick(now) {
    // Auto-spin: on by default only after a pause, so the build drifts back
    // into view; switched on explicitly it turns the whole time, which is how
    // you paint or plant the back of a terrarium without fighting the camera.
    if (!dragging && mode === null && (autoSpin || now - lastInteraction > IDLE_MS)) {
      target.y += autoSpin ? 0.0022 : 0.0016;
    }
    // critically-damped-ish easing toward target
    rot.x += (target.x - rot.x) * 0.12;
    rot.y += (target.y - rot.y) * 0.12;
    world.rotation.y = rot.y; // turntable spin only — X tilt would sink the jar

    // smooth dolly zoom
    camDist += (camDistT - camDist) * 0.1;
    const elev = clamp(camBaseElev + rot.x, ELEV_MIN, ELEV_MAX);
    const ce = Math.cos(elev);
    camera.position
      .set(camFlat.x * ce, Math.sin(elev), camFlat.z * ce)
      .multiplyScalar(camDist);
    camera.lookAt(0, 0.1, 0);

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
    setAutoSpin: (on) => (autoSpin = !!on),
    isAutoSpin: () => autoSpin,
    setMood,
    setTheme,
    setBackdropCalm,
    setTimeOfDay,
    resetView,
    capture,
    setTapHandler: (fn) => (tapHandler = fn),
    setOnFrame: (fn) => (onFrame = fn),
    setGrabHandler: (fn) => (grabHandler = fn),
    setObjectDrag: (fn) => (objectDragHandler = fn),
    setObjectDrop: (fn) => (objectDropHandler = fn),
  };
}

// --- helpers -------------------------------------------------------------

function pointer(e) {
  return { x: e.clientX, y: e.clientY };
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

function jitter2(a) {
  return (Math.random() - 0.5) * 2 * a;
}

// Clean photographer's sweep: a seamless cool-neutral cyclorama with a soft
// pool of light behind the jar and a gentle floor gradient — no window, no
// props, so the terrarium reads like a studio product shot.
function drawStudio(ctx) {
  const lin = ctx.createLinearGradient(0, 0, 0, 512);
  lin.addColorStop(0, "#f4f6f8");
  lin.addColorStop(0.62, "#e7eaee");
  lin.addColorStop(0.78, "#d3d7dc"); // soft horizon where wall meets floor
  lin.addColorStop(1, "#c4c8ce");
  ctx.fillStyle = lin;
  ctx.fillRect(0, 0, 1024, 512);

  // broad soft key glow, upper-left like a big softbox
  const glow = ctx.createRadialGradient(420, 150, 40, 460, 210, 620);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);

  // faint cool vignette to keep the corners from feeling flat
  const vig = ctx.createRadialGradient(512, 250, 300, 512, 250, 720);
  vig.addColorStop(0, "rgba(60,70,84,0)");
  vig.addColorStop(1, "rgba(60,70,84,0.16)");
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
