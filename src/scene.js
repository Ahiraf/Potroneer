import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// createStudio owns everything render/interaction related but stays ignorant of
// terrariums specifically: it exposes a rotatable `world` group, a raycaster
// helper, and a tap callback. main.js does the terrarium logic on top.
export function createStudio(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();

  // Scene moods — like Terrarium Builder's scene customization: same table,
  // different time of day. Each mood re-tints backdrop, lights, fog, ground.
  const MOODS = {
    // Clean product-photo studio: a seamless neutral sweep, cool soft key light
    // and a dark riven-slate slab under the jar — the look of the reference
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
  // A large matte surface catching the key light's shadow grounds the jar in a
  // real space instead of floating on a gradient.
  const woodTex = makeWoodTexture();
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({
      map: null, // studio (default) uses a plain neutral sweep; moods add wood
      color: 0xd0d3d7,
      roughness: 0.9,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Soft ambient-occlusion-style contact shadow right under the jar, layered
  // on top of the cast shadow for a believable grounded feel.
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({
      map: makeRadialShadow(),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.49;
  scene.add(contact);

  // A dark riven-slate display slab that sits under the jar in Studio mood —
  // the charcoal cheese-board plinth the reference terrariums are shot on.
  const SLAB_H = 0.16;
  const slate = new THREE.Mesh(makeSlateSlab(), makeSlateMaterial());
  slate.castShadow = true;
  slate.receiveShadow = true;
  slate.visible = true; // studio is the default mood
  scene.add(slate);

  // The jar bases differ per shape; slide the table/slab/shadow to meet the
  // chosen jar so everything sits flush. `slabOn` toggles the slate plinth.
  let baseY = -1.5;
  let slabOn = true;
  function layoutBase() {
    if (slabOn) {
      slate.visible = true;
      slate.position.y = baseY - SLAB_H / 2; // top flush with the jar floor
      ground.position.y = baseY - SLAB_H; // table tucks just under the slab
      contact.position.y = baseY + 0.012; // AO shadow lands on the slab
    } else {
      slate.visible = false;
      ground.position.y = baseY;
      contact.position.y = baseY + 0.01;
    }
  }
  function setBaseY(y) {
    baseY = y;
    layoutBase();
  }
  setBaseY(-1.5);

  // Switch the whole scene to a different time-of-day mood.
  function setMood(name) {
    const m = MOODS[name];
    if (!m) return;
    scene.background = makeStudioBackdrop(m);
    scene.fog.color.set(m.fog);
    key.color.set(m.key);
    key.intensity = m.keyI;
    hemi.intensity = m.hemiI;
    ground.material.color.set(m.ground);
    // Studio mood swaps the warm wood table for a plain neutral sweep + slate.
    ground.material.map = m.slab ? null : woodTex;
    ground.material.needsUpdate = true;
    renderer.toneMappingExposure = m.exposure;
    slabOn = !!m.slab;
    layoutBase();
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

  function markInteraction() {
    lastInteraction = performance.now();
  }

  function onDown(e) {
    markInteraction();
    canvas.setPointerCapture?.(e.pointerId ?? 1);
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

  // --- zoom: scroll to lean right up to the glass ------------------------
  const camDir = camera.position.clone().normalize();
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
  }
  window.addEventListener("resize", resize);
  resize();

  let onFrame = null;
  function tick(now) {
    // idle auto-rotation once the user has been still for a moment
    if (!dragging && mode === null && now - lastInteraction > IDLE_MS) {
      target.y += 0.0016;
    }
    // critically-damped-ish easing toward target
    rot.x += (target.x - rot.x) * 0.12;
    rot.y += (target.y - rot.y) * 0.12;
    world.rotation.x = rot.x;
    world.rotation.y = rot.y;

    // smooth dolly zoom
    camDist += (camDistT - camDist) * 0.1;
    camera.position.copy(camDir).multiplyScalar(camDist);
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
    setMood,
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

// A slightly-irregular slab footprint (riven slate is never a perfect rect):
// a bevelled box, wider than deep, like a charcoal serving board.
function makeSlateSlab() {
  const geo = new THREE.BoxGeometry(3.9, 0.16, 2.6, 1, 1, 1);
  // chamfer the top edge a touch by nudging the top rim inward
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0.07) {
      p.setX(i, p.getX(i) * 0.97);
      p.setZ(i, p.getZ(i) * 0.97);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function makeSlateMaterial() {
  return new THREE.MeshStandardMaterial({
    map: makeSlateTexture(),
    color: 0x40454a,
    roughness: 0.68,
    metalness: 0.08,
  });
}

// Dark cloven slate: near-black base with horizontal cleavage striations and a
// scatter of cooler and warm mineral flecks, plus a faint sheen streak.
function makeSlateTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  const base = ctx.createLinearGradient(0, 0, 512, 512);
  base.addColorStop(0, "#31353a");
  base.addColorStop(1, "#23262a");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  // horizontal cleavage lines
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 512;
    const x = Math.random() * 512 - 40;
    const w = 60 + Math.random() * 260;
    const dark = Math.random() < 0.55;
    ctx.strokeStyle = dark
      ? `rgba(14,16,18,${0.15 + Math.random() * 0.25})`
      : `rgba(120,130,140,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + w * 0.3, y + jitter2(3), x + w * 0.7, y + jitter2(3), x + w, y + jitter2(2));
    ctx.stroke();
  }
  // mineral flecks
  for (let i = 0; i < 260; i++) {
    const warm = Math.random() < 0.3;
    ctx.fillStyle = warm
      ? `rgba(190,150,110,${0.08 + Math.random() * 0.15})`
      : `rgba(150,160,170,${0.06 + Math.random() * 0.14})`;
    const r = 0.5 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
