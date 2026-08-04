import * as THREE from "three";
import { createStudio } from "./scene.js";
import { buildJar, buildPickPlane, JAR_TYPES, JAR_BY_ID } from "./jar.js";
import {
  buildLayer,
  buildDecoration,
  buildTerrainCap,
  updateTerrainCap,
  buildJarLamp,
} from "./builders.js";
import { BASE_LAYERS, BASE_BY_ID, DECORATIONS, CATEGORIES } from "./catalog.js";
import {
  createState,
  addLayer,
  addDecoration,
  reset as resetState,
  substrateTop,
  hasBase,
  remainingHeight,
  setJarInterior,
  heightAt,
  sculpt,
  flatten,
  paintMaterial,
  JAR,
} from "./state.js";
import { toggleAmbience } from "./ambience.js";
import { decorationIcon, baseIcon, jarIcon } from "./icons.js";
import { t, tLabel, getLang, setLang } from "./i18n.js";
import { preloadModels, getModelClone } from "./models.js";

// kick off background loading of any real GLB models in /public/models;
// once a model arrives, re-render icons so cards show the real thing
preloadModels((kind) => {
  iconCache.clear();
  renderStrip();
  // if the user is already on a model jar, swap the placeholder for the model
  if (kind === currentJarId) setJar(currentJarId);
});

const canvas = document.getElementById("scene");
const studio = createStudio(canvas);
const state = createState();

// --- scene composition -----------------------------------------------------
const substrateGroup = new THREE.Group();
const decorGroup = new THREE.Group();
studio.world.add(substrateGroup, decorGroup);

// The jar mesh and the raycast pick-plane are rebuilt whenever the jar shape
// changes, so keep mutable references.
let currentJarId = JAR_TYPES[0].id;
let jarGroup = null;
let jarGlass = null;
let jarBuilt = null; // {glassMats, frameMats, frameOrig} of the current jar
const jarCustom = { frame: null, glass: null, w: 1, h: 1 };
let pickPlane = null;
let motes = null;

// jar-mounted grow lamp: mounts over the current jar and lights it from above.
const jarLight = { on: false, height: 0.55, bright: 0.6, color: 0xffe4bc };
const lightGroup = new THREE.Group();
studio.world.add(lightGroup);
function rebuildJarLight() {
  lightGroup.clear();
  if (jarLight.on) lightGroup.add(buildJarLamp(JAR, jarLight));
  studio.markInteraction();
}

// A pinch of dust drifting inside the jar — barely visible, but it makes the
// enclosed air feel alive when the light catches it.
function buildMotes(interior) {
  const n = 55;
  const positions = new Float32Array(n * 3);
  const seeds = [];
  const r = interior.innerRadius * 0.8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * r;
    positions[i * 3] = Math.cos(a) * rr;
    positions[i * 3 + 1] =
      interior.floorY + 0.3 + Math.random() * (interior.bodyHeight - 0.4);
    positions[i * 3 + 2] = Math.sin(a) * rr;
    seeds.push(Math.random() * Math.PI * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xfff6e0,
    size: 0.018,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData = { seeds, interior };
  return pts;
}

function animateMotes(now) {
  if (!motes) return;
  const { seeds, interior } = motes.userData;
  const pos = motes.geometry.attributes.position;
  const top = interior.floorY + interior.bodyHeight - 0.1;
  const bottom = substrateTop(state) + 0.1;
  for (let i = 0; i < seeds.length; i++) {
    let y = pos.getY(i) + 0.0006; // slow rise
    const sway = Math.sin(now * 0.0004 + seeds[i]) * 0.0004;
    if (y > top) y = Math.max(bottom, interior.floorY + 0.3);
    pos.setY(i, y);
    pos.setX(i, pos.getX(i) + sway);
  }
  pos.needsUpdate = true;
}

function setJar(typeId) {
  const type = JAR_BY_ID[typeId];
  if (!type) return;
  currentJarId = typeId;
  // apply the customiser's shape sliders to this jar's interior
  const it = {
    ...type.interior,
    innerRadius: type.interior.innerRadius * jarCustom.w,
    bodyHeight: type.interior.bodyHeight * jarCustom.h,
    floorY: type.interior.floorY * jarCustom.h,
  };
  setJarInterior(it);

  if (jarGroup) studio.world.remove(jarGroup);
  if (pickPlane) studio.world.remove(pickPlane);

  const built = buildJar(typeId, studio.envMap, it);
  jarBuilt = built;
  jarBuilt.frameOrig = built.frameMats.map((m) => m.color.clone());
  applyJarColors();
  jarGroup = built.group;
  jarGlass = built.glass;
  studio.world.add(jarGroup);

  pickPlane = buildPickPlane();
  studio.world.add(pickPlane);

  // Sit the table surface flush against this jar's base.
  studio.setBaseY(type.interior.floorY - type.interior.wallThickness);

  // Fresh dust motes sized to this jar's interior.
  if (motes) studio.world.remove(motes);
  motes = buildMotes(type.interior);
  studio.world.add(motes);

  // The build survives jar changes — you can decorate in the open and slip a
  // jar over it later, like the reference. Just nudge anything that would
  // poke through the new glass back inside the footprint.
  const rx = JAR.innerRadius * JAR.stretchX * 0.9;
  const rz = JAR.innerRadius * 0.9;
  state.decorations.forEach((rec) => {
    const n = Math.hypot(rec.x / rx, rec.z / rz);
    if (n > 1) {
      rec.x /= n;
      rec.z /= n;
      rec.y = substrateTop(state) + heightAt(state, rec.x, rec.z);
    }
  });
  rebuildAll();
  pickPlane.position.y = substrateTop(state) + 0.001;
  rebuildJarLight(); // re-mount the lamp on the new jar shape/size
}

// Re-tint the current jar's glass and frame from the customiser choices.
function applyJarColors() {
  if (!jarBuilt) return;
  jarBuilt.glassMats.forEach((m) => {
    m.color.set(jarCustom.glass ?? 0xffffff);
    if (m.attenuationColor) m.attenuationColor.set(jarCustom.glass ?? 0xd6efe4);
  });
  jarBuilt.frameMats.forEach((m, i) => {
    if (jarCustom.frame) m.color.set(jarCustom.frame);
    else m.color.copy(jarBuilt.frameOrig[i]);
  });
}

// --- tiny tween system (for satisfying "plop" placements) ------------------
const tweens = [];
function tween(dur, apply, ease = easeOutBack) {
  tweens.push({ t: 0, dur, apply, ease });
}
function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeOut(x) {
  return 1 - Math.pow(1 - x, 3);
}
studio.setOnFrame((now) => {
  animateMotes(now);
  const dt = 16.7;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    tw.apply(tw.ease(tw.t));
    if (tw.t >= 1) tweens.splice(i, 1);
  }
});

// --- rebuild substrate from state -----------------------------------------
let terrainCap = null;

function rebuildSubstrate(animateLast = false) {
  substrateGroup.clear();
  terrainCap = null;
  let y = JAR.floorY;
  state.layers.forEach((layer, idx) => {
    const isTop = idx === state.layers.length - 1;
    const mesh = buildLayer(layer, y, isTop);
    substrateGroup.add(mesh);
    if (animateLast && isTop) {
      mesh.scale.y = 0.001;
      mesh.position.y = y - layer.height; // start collapsed at the seam
      tween(
        360,
        (p) => {
          mesh.scale.y = 0.001 + p * 0.999;
          mesh.position.y = (y - layer.height) * (1 - p);
        },
        easeOut,
      );
    }
    y += layer.height;
  });
  // The sculptable terrain cap rides on the top layer — or, for free-form
  // cursor-painted substrate, directly on the jar floor.
  if (state.layers.length || state.painted) {
    const topDef = state.layers.length
      ? BASE_BY_ID[state.layers[state.layers.length - 1].type]
      : BASE_BY_ID.soil;
    terrainCap = buildTerrainCap(topDef);
    updateTerrainCap(terrainCap, state, substrateTop(state));
    substrateGroup.add(terrainCap);
  }
  pickPlane.position.y = substrateTop(state) + 0.001;
  if (wetLevel > 0) applyWetness(); // keep a watered look through rebuilds
}

// Height of the (possibly sculpted) surface at a local point.
function surfaceY(x, z) {
  return substrateTop(state) + heightAt(state, x, z);
}

// Common raycast targets for anything aimed at the substrate surface.
function surfaceTargets() {
  return terrainCap ? [terrainCap, pickPlane] : [pickPlane];
}

// --- undo history ----------------------------------------------------------
// Snapshot the whole build (layers + decorations + terrain) before each
// mutating action; undo pops one and rebuilds the scene from data.
const history = [];
function snapshot() {
  history.push(
    JSON.stringify({
      jarId: currentJarId,
      layers: state.layers,
      decorations: state.decorations,
      terrain: Array.from(state.terrain),
      terrainMat: Array.from(state.terrainMat),
      painted: state.painted,
    }),
  );
  if (history.length > 60) history.shift();
}

function rebuildAll() {
  rebuildSubstrate(false);
  decorGroup.clear();
  state.decorations.forEach((rec) => {
    const def = DECORATIONS.find((d) => d.id === rec.id);
    const obj = getModelClone(rec.kind) ?? buildDecoration(rec.kind, def?.variant);
    obj.rotation.y = rec.rotation;
    obj.position.set(rec.x, rec.y, rec.z);
    obj.scale.setScalar(rec.scale);
    obj.userData.record = rec;
    obj.userData.baseScale = rec.scale;
    if (rec.tint) applyTint(obj, rec.tint);
    decorGroup.add(obj);
  });
  if (wetLevel > 0) applyWetness();
  updateHint();
}

function undo() {
  const snap = history.pop();
  if (!snap) return;
  const d = JSON.parse(snap);
  if (d.jarId && d.jarId !== currentJarId) setJar(d.jarId);
  state.layers.length = 0;
  state.layers.push(...d.layers);
  state.decorations.length = 0;
  state.decorations.push(...d.decorations);
  state.terrain.set(d.terrain);
  if (d.terrainMat) state.terrainMat.set(d.terrainMat);
  state.painted = d.painted ?? false;
  rebuildAll();
  studio.markInteraction();
}

// --- placement -------------------------------------------------------------
function placeDecoration(worldPoint, def) {
  const local = studio.world.worldToLocal(worldPoint.clone());
  const obj = getModelClone(def.kind) ?? buildDecoration(def.kind, def.variant);

  // items scale with the vessel: a small jar gets proportionally small plants
  const jarK = Math.min(1.25, Math.max(0.55, JAR.innerRadius / 1.0));
  const targetScale = (0.85 + Math.random() * 0.5) * jarK;
  const rotation = Math.random() * Math.PI * 2;
  obj.rotation.y = rotation;
  obj.rotation.x = (Math.random() - 0.5) * 0.14; // slight hand-placed lean
  obj.rotation.z = (Math.random() - 0.5) * 0.14;
  obj.position.set(local.x, surfaceY(local.x, local.z), local.z);
  obj.scale.setScalar(0.001);
  decorGroup.add(obj);

  const record = {
    id: def.id,
    kind: def.kind,
    x: local.x,
    z: local.z,
    y: obj.position.y,
    rotation,
    scale: targetScale,
    tint: null,
  };
  addDecoration(state, record);
  // Link mesh ↔ model so dragging can keep the data in sync.
  obj.userData.record = record;
  obj.userData.baseScale = targetScale;

  tween(420, (p) => obj.scale.setScalar(0.001 + p * targetScale));
}

// --- dragging placed decorations ------------------------------------------
let grabbed = null;

// Walk up to the decoration's top-level group (a direct child of decorGroup).
function topDecor(object) {
  let o = object;
  while (o.parent && o.parent !== decorGroup) o = o.parent;
  return o.parent === decorGroup ? o : null;
}

// --- tools (Terrarium Builder-style brushes) -------------------------------
// "place" = tap to add / drag decorations. "raise"/"lower" = terrain sculpt
// brushes. "grass" = paint moss-grass tufts along the drag path.
const TOOLS = [
  { id: "place", label: "চিমটা", glyph: "🥢" },
  { id: "water", label: "পানি", glyph: "💧" },
  { id: "mist", label: "স্প্রে", glyph: "💦" },
  { id: "raise", label: "উঁচু", glyph: "⛰️" },
  { id: "lower", label: "নিচু", glyph: "🕳️" },
  { id: "flatten", label: "সমান", glyph: "🫓" },
  { id: "grass", label: "ঘাস", glyph: "🌱" },
  { id: "moss", label: "মস ব্রাশ", glyph: "🖌️" },
  { id: "pebble", label: "নুড়িপথ", glyph: "🪨" },
];
let activeTool = "place";
let lastPaint = null; // throttles grass spawns along a stroke

// Brush parameters driven by the top slider chips (0–100 each, mapped here).
const brushParams = { radius: 50, strength: 50, falloff: 50 };
function brushRadius() {
  return 0.12 + (brushParams.radius / 100) * 0.45;
}
function brushStrength() {
  return 0.006 + (brushParams.strength / 100) * 0.05;
}
function brushFalloff() {
  return 0.3 + (brushParams.falloff / 100) * 1.3;
}

function applyBrush(screen) {
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return;
  const local = studio.world.worldToLocal(hit.point.clone());

  if (activeTool === "raise" || activeTool === "lower" || activeTool === "flatten") {
    if (activeTool === "flatten") {
      flatten(state, local.x, local.z, 0.5, brushRadius(), brushFalloff());
    } else {
      const amt = brushStrength() * (activeTool === "raise" ? 1 : -1);
      sculpt(state, local.x, local.z, amt, brushRadius(), brushFalloff());
    }
    if (terrainCap) updateTerrainCap(terrainCap, state, substrateTop(state));
    // Everything planted on the surface rides the terrain up/down.
    decorGroup.children.forEach((obj) => {
      const rec = obj.userData.record;
      if (!rec) return;
      obj.position.y = rec.y = surfaceY(rec.x, rec.z);
    });
  } else if (activeTool === "grass" || activeTool === "pebble" || activeTool === "moss") {
    const dx = lastPaint ? local.x - lastPaint.x : Infinity;
    const dz = lastPaint ? local.z - lastPaint.z : Infinity;
    // stroke spacing scales with brush radius
    const spacingBase =
      activeTool === "pebble" ? 0.05 : activeTool === "moss" ? 0.045 : 0.07;
    const spacing = spacingBase * brushRadius() * 3;
    if (dx * dx + dz * dz < spacing * spacing) return;
    lastPaint = { x: local.x, z: local.z };
    const kind =
      activeTool === "pebble"
        ? "pebblepatch"
        : activeTool === "moss"
          ? "mosspatch"
          : "grass";
    placeDecoration(hit.point, { id: kind, kind });
  }
}

// Free-form substrate painting: with a base material selected, dragging lays
// that material wherever the cursor goes — any size, any shape.
let basePainting = false;
function applyBaseBrush(screen) {
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return;
  const local = studio.world.worldToLocal(hit.point.clone());
  const mi = BASE_LAYERS.findIndex((b) => b.id === selected.id);
  sculpt(state, local.x, local.z, brushStrength() * 0.8, brushRadius(), brushFalloff());
  paintMaterial(state, local.x, local.z, brushRadius(), mi);
  if (!terrainCap) rebuildSubstrate(false); // first stroke creates the cap
  updateTerrainCap(terrainCap, state, substrateTop(state));
  decorGroup.children.forEach((obj) => {
    const rec = obj.userData.record;
    if (!rec) return;
    obj.position.y = rec.y = surfaceY(rec.x, rec.z);
  });
}

// --- care tools: spray (mist on the glass) + water (wets the substrate) ----
const mistGroup = new THREE.Group(); // condensation clinging to the glass
const fxGroup = new THREE.Group(); // ephemeral splashes/ripples
studio.world.add(mistGroup, fxGroup);
const dropGeo = new THREE.SphereGeometry(0.02, 6, 5);
const dropMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  roughness: 0.05,
  metalness: 0,
  transmission: 0.5,
  transparent: true,
  opacity: 0.5,
  clearcoat: 1,
});
const rnd = (a) => (Math.random() - 0.5) * 2 * a;

// Spray a cluster of condensation droplets onto the inside of the glass where
// the cursor points — the glass fogs up the more you spray.
function sprayMist(screen) {
  const targets = jarGlass ? [jarGlass, pickPlane] : [pickPlane];
  const hit = studio.raycast(screen, targets);
  if (!hit) return;
  const local = studio.world.worldToLocal(hit.point.clone());
  const n = 10 + ((Math.random() * 8) | 0);
  for (let i = 0; i < n; i++) {
    const drop = new THREE.Mesh(dropGeo, dropMat);
    const sc = 0.4 + Math.random() * 1.1;
    const run = Math.random() < 0.12;
    drop.scale.set(sc, sc * (run ? 2.6 : 1), sc * 0.5);
    drop.position.set(local.x + rnd(0.12), local.y + rnd(0.12), local.z + rnd(0.12));
    drop.lookAt(0, drop.position.y, 0); // flatten against the wall
    mistGroup.add(drop);
  }
  // cap total droplets so long sprays stay cheap
  while (mistGroup.children.length > 1200) mistGroup.remove(mistGroup.children[0]);
  studio.markInteraction();
}

// Wetness darkens + glosses the substrate and freshens the planting. Progressive
// so repeated watering builds up; re-applied after any rebuild.
let wetLevel = 0;
function applyWetness() {
  const w = Math.sqrt(wetLevel); // fast onset so a splash already reads as wet
  const tint = 1 - 0.6 * w; // strong darkening — wet soil goes deep brown
  substrateGroup.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const m = o.material;
    if (m.userData.baseRough === undefined) m.userData.baseRough = m.roughness;
    m.color.setScalar(tint); // multiplies the baked vertex colours darker
    m.roughness = m.userData.baseRough * (1 - 0.75 * w);
    m.metalness = 0.15 * w; // faint wet sheen
  });
  decorGroup.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.userData.noWet) return;
    const m = o.material;
    if (m.userData.baseRough === undefined) m.userData.baseRough = m.roughness;
    if (m.userData.baseColor === undefined && m.color) m.userData.baseColor = m.color.clone();
    m.roughness = m.userData.baseRough * (1 - 0.6 * w); // glossy wet leaves
    // deepen greens/browns a touch so moss & wood read as freshly watered
    if (m.userData.baseColor) {
      const k = 1 - 0.22 * w;
      m.color.setRGB(m.userData.baseColor.r * k, m.userData.baseColor.g * k, m.userData.baseColor.b * k);
    }
  });
}

// A pouring water stream from above the tap point down to the surface — shown
// while the water tool is dragging, or a quick fade on a single tap.
let pourStream = null;
function ensurePour() {
  if (pourStream) return pourStream;
  const geo = new THREE.CylinderGeometry(0.02, 0.032, 1, 10, 1, true);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2fb,
    roughness: 0.02,
    metalness: 0,
    transmission: 0.35,
    transparent: true,
    opacity: 0.9,
    ior: 1.33,
    clearcoat: 1,
    side: THREE.DoubleSide,
  });
  pourStream = new THREE.Mesh(geo, mat);
  pourStream.visible = false;
  studio.world.add(pourStream);
  return pourStream;
}
function showPour(local) {
  const s = ensurePour();
  const topY = JAR.floorY + JAR.bodyHeight + 0.25;
  const h = Math.max(0.25, topY - local.y);
  s.scale.set(1, h, 1);
  s.position.set(local.x, local.y + h / 2, local.z);
  s.material.opacity = 0.9;
  s.visible = true;
}
function fadePour() {
  if (!pourStream) return;
  tween(340, (p) => {
    if (!pourStream) return;
    pourStream.material.opacity = 0.9 * (1 - p);
    if (p >= 1) {
      pourStream.visible = false;
      pourStream.material.opacity = 0.9;
    }
  }, (x) => x);
}
function hidePour() {
  if (pourStream) pourStream.visible = false;
}

function spawnSplash(worldPoint) {
  const local = studio.world.worldToLocal(worldPoint.clone());
  const y = local.y + 0.012;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.05, 18),
    new THREE.MeshBasicMaterial({ color: 0xaad8e2, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(local.x, y, local.z);
  fxGroup.add(ring);
  tween(520, (p) => {
    const s = 1 + p * 3.5;
    ring.scale.set(s, s, s);
    ring.material.opacity = 0.6 * (1 - p);
    if (p >= 1) fxGroup.remove(ring);
  }, (x) => x);
  for (let i = 0; i < 5; i++) {
    const d = new THREE.Mesh(dropGeo, dropMat.clone());
    const a = Math.random() * Math.PI * 2;
    const r = 0.03 + Math.random() * 0.04;
    const vy = 0.14 + Math.random() * 0.08;
    d.position.set(local.x, y, local.z);
    fxGroup.add(d);
    tween(460, (p) => {
      d.position.set(local.x + Math.cos(a) * r * p, y + vy * p - 0.6 * p * p, local.z + Math.sin(a) * r * p);
      d.material.opacity = 0.55 * (1 - p);
      if (p >= 1) fxGroup.remove(d);
    }, (x) => x);
  }
}

let lastWater = 0;
function water(screen, isTap) {
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return;
  wetLevel = Math.min(1, wetLevel + (isTap ? 0.28 : 0.06));
  applyWetness();
  const local = studio.world.worldToLocal(hit.point.clone());
  showPour(local); // pouring stream from above
  if (isTap) fadePour();
  const now = performance.now();
  if (isTap || now - lastWater > 90) {
    spawnSplash(hit.point);
    lastWater = now;
  }
  studio.markInteraction();
}

studio.setGrabHandler((screen) => {
  // Care tools capture the drag as a continuous spray/water stroke.
  if (activeTool === "mist") {
    sprayMist(screen);
    return true;
  }
  if (activeTool === "water") {
    water(screen, false);
    return true;
  }
  // Base material + drag = paint substrate in any shape.
  if (activeTool === "place" && selected.group === "base") {
    const hit = studio.raycast(screen, surfaceTargets());
    if (hit) {
      basePainting = true;
      snapshot();
      applyBaseBrush(screen);
      return true;
    }
    return false; // over empty space → rotate as usual
  }
  // Brush tools capture the drag entirely.
  if (activeTool !== "place") {
    if (!hasBase(state)) {
      flashHint("আগে বেস স্তর দাও, তারপর ভাস্কর্য বা ঘাস।");
      return false;
    }
    lastPaint = null;
    snapshot();
    applyBrush(screen);
    return true;
  }
  // Otherwise try to grab a placed decoration.
  if (!decorGroup.children.length) return false;
  const hit = studio.raycast(screen, decorGroup.children);
  if (!hit) return false;
  const obj = topDecor(hit.object);
  if (!obj) return false;
  grabbed = obj;
  snapshot();
  const base = obj.userData.baseScale ?? 1;
  obj.userData.baseScale = base;
  obj.scale.setScalar(base * 1.08); // lift feedback
  obj.position.y += 0.05;
  return true;
});

studio.setObjectDrag((screen) => {
  if (activeTool === "mist") {
    sprayMist(screen);
    return;
  }
  if (activeTool === "water") {
    water(screen, false);
    return;
  }
  if (basePainting) {
    applyBaseBrush(screen);
    return;
  }
  if (activeTool !== "place") {
    applyBrush(screen);
    return;
  }
  if (!grabbed) return;
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return;
  const local = studio.world.worldToLocal(hit.point.clone());
  grabbed.position.x = local.x;
  grabbed.position.z = local.z;
  grabbed.position.y = surfaceY(local.x, local.z) + 0.05;
  const rec = grabbed.userData.record;
  if (rec) {
    rec.x = local.x;
    rec.z = local.z;
  }
});

studio.setObjectDrop(() => {
  if (activeTool === "water") fadePour(); // stop the pour when the stroke ends
  if (basePainting) {
    basePainting = false;
    updateHint();
    return;
  }
  lastPaint = null;
  if (!grabbed) return;
  grabbed.scale.setScalar(grabbed.userData.baseScale ?? 1);
  const rec = grabbed.userData.record;
  if (rec) grabbed.position.y = rec.y = surfaceY(rec.x, rec.z);
  grabbed = null;
});

// --- interaction -----------------------------------------------------------
let selected = { group: "base", id: BASE_LAYERS[0].id };

// Drop one substrate layer (used by tap and by drag-from-strip).
function tryAddLayer(id) {
  const def = BASE_LAYERS.find((b) => b.id === id);
  if (!def) return;
  if (remainingHeight(state) < def.layerHeight) {
    flashHint("জার প্রায় ভরে গেছে — এবার সাজানো শুরু করো!");
    return;
  }
  snapshot();
  addLayer(state, id);
  rebuildSubstrate(true);
  updateHint();
}

// Place a decoration at a screen point (used by tap and by drag-from-strip).
function tryPlaceDecoration(screen, id) {
  if (!hasBase(state)) {
    flashHint("আগে অন্তত একটা বেস স্তর দাও, তারপর গাছ বসাও।");
    return;
  }
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return;
  const def = DECORATIONS.find((d) => d.id === id);
  if (def) {
    snapshot();
    placeDecoration(hit.point, def);
    updateHint();
  }
}

studio.setTapHandler((screen) => {
  // care tools act on a single tap too
  if (activeTool === "mist") {
    sprayMist(screen);
    return;
  }
  if (activeTool === "water") {
    water(screen, true);
    return;
  }
  // tapping a placed decoration opens the item adjuster instead of placing
  if (activeTool === "place" && decorGroup.children.length) {
    const hitD = studio.raycast(screen, decorGroup.children);
    if (hitD) {
      openItemPanel(topDecor(hitD.object));
      return;
    }
  }
  if (selected.group === "base") {
    // Any tap over the jar drops another substrate layer.
    const hit = studio.raycast(screen, [jarGlass, pickPlane]);
    if (!hit) return;
    tryAddLayer(selected.id);
  } else {
    tryPlaceDecoration(screen, selected.id);
  }
});

// --- HUD: slider chips -----------------------------------------------------
// Only the brush tools use the sliders; grey them out in place mode, like the
// reference UI greys inactive params.
const sliderChips = document.querySelectorAll(".slider-chip");
sliderChips.forEach((chip) => {
  const param = chip.dataset.param;
  const input = chip.querySelector("input");
  const fill = chip.querySelector(".s-fill");
  const val = chip.querySelector(".s-val");
  const render = () => {
    fill.style.width = `${input.value}%`;
    val.textContent = input.value;
  };
  input.addEventListener("input", () => {
    brushParams[param] = Number(input.value);
    render();
    studio.markInteraction();
  });
  render();
});

function updateSliderState() {
  const brushy = activeTool !== "place";
  sliderChips.forEach((c) => c.classList.toggle("is-disabled", !brushy));
}

// --- HUD: mode tabs (ভাস্কর্য / পেইন্টিং / সাজানো / দৃশ্য) --------------------
// Each tab exposes its own tool subset in the left panel, like the reference.
const TAB_TOOLS = {
  sculpt: ["raise", "lower", "flatten"],
  paint: ["grass", "moss", "pebble"],
  decor: ["place", "water", "mist"],
  scene: [],
};
let activeTab = "decor";
const toolItemsEl = document.getElementById("tool-items");
const slidersEl = document.getElementById("sliders");
const scenePanelEl = document.getElementById("scene-panel");
const hudBottomEl = document.getElementById("hud-bottom");

function selectTool(id) {
  activeTool = id;
  if (id !== "water") hidePour(); // put the watering can away
  document
    .querySelectorAll(".tool-row")
    .forEach((c) => c.classList.toggle("is-active", c.dataset.id === id));
  updateSliderState();
  studio.markInteraction();
}

function renderTools() {
  toolItemsEl.innerHTML = "";
  const ids = TAB_TOOLS[activeTab];
  ids.forEach((tid, i) => {
    const t2 = TOOLS.find((x) => x.id === tid);
    const btn = document.createElement("button");
    btn.className = "tool-row";
    btn.dataset.id = t2.id;
    btn.innerHTML = `<span class="t-icon">${t2.glyph}</span><span class="t-label">${t(t2.label)}</span><span class="t-key">${i + 1}</span>`;
    btn.addEventListener("click", () => selectTool(t2.id));
    toolItemsEl.appendChild(btn);
  });
  toolItemsEl.style.display = ids.length ? "" : "none";
}

function selectTab(tab) {
  activeTab = tab;
  // reflect the active tab on <body> so CSS can shift the tool list when the
  // Decorate sidebar is present
  document.body.className = `tab-${tab}`;
  document
    .querySelectorAll(".tab")
    .forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  scenePanelEl.classList.toggle("hidden", tab !== "scene");
  slidersEl.classList.toggle("hidden", tab !== "sculpt" && tab !== "paint");
  hudBottomEl.style.display = tab === "decor" ? "" : "none";
  catFlyoutEl.classList.add("hidden");
  renderTools();
  // sensible default tool per tab
  if (tab === "sculpt") selectTool("raise");
  else if (tab === "paint") selectTool("grass");
  else selectTool("place");
}

document.querySelectorAll(".tab").forEach((b) => {
  b.addEventListener("click", () => selectTab(b.dataset.tab));
});

// number-key shortcuts within the active tab's tool list
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  const ids = TAB_TOOLS[activeTab];
  const idx = Number(e.key) - 1;
  if (ids[idx]) selectTool(ids[idx]);
});

// --- HUD: category flyout + favorites + item strip -------------------------
const searchEl = document.getElementById("search");
const stripEl = document.getElementById("item-strip");
const catBtnEl = document.getElementById("cat-btn");
const catFlyoutEl = document.getElementById("cat-flyout");
let activeCat = "plants";

// favorites persist across sessions
const FAV_KEY = "potroneer-favs";
const favs = new Set(
  JSON.parse(localStorage.getItem(FAV_KEY) || localStorage.getItem("terrarium-favs") || "[]"),
);
function toggleFav(key) {
  favs.has(key) ? favs.delete(key) : favs.add(key);
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
}

// Staging tray: the user gathers items here first, then "Build from tray" locks
// the palette to just these so they assemble from their chosen set. Persisted.
const TRAY_KEY = "potroneer-tray";
const tray = new Set(
  JSON.parse(localStorage.getItem(TRAY_KEY) || localStorage.getItem("terrarium-tray") || "[]"),
);
let buildMode = false;
function toggleTray(key) {
  tray.has(key) ? tray.delete(key) : tray.add(key);
  localStorage.setItem(TRAY_KEY, JSON.stringify([...tray]));
}
// All tray items, in group order, tagged for placement.
function trayItems() {
  return [
    ...JAR_TYPES.filter((j) => tray.has(`jar:${j.id}`)).map((j) => ({ ...j, _group: "jar" })),
    ...BASE_LAYERS.filter((b) => tray.has(`base:${b.id}`)).map((b) => ({ ...b, _group: "base" })),
    ...DECORATIONS.filter((d) => tray.has(`decor:${d.id}`)).map((d) => ({ ...d, _group: "decor" })),
  ];
}

// Items for the current category, each tagged with its placement group.
function stripSource() {
  if (buildMode || activeCat === "tray") return trayItems();
  if (activeCat === "jar") return JAR_TYPES.map((j) => ({ ...j, _group: "jar" }));
  if (activeCat === "base")
    return BASE_LAYERS.map((b) => ({ ...b, _group: "base" }));
  if (activeCat === "fav") {
    return [
      ...JAR_TYPES.filter((j) => favs.has(`jar:${j.id}`)).map((j) => ({ ...j, _group: "jar" })),
      ...BASE_LAYERS.filter((b) => favs.has(`base:${b.id}`)).map((b) => ({ ...b, _group: "base" })),
      ...DECORATIONS.filter((d) => favs.has(`decor:${d.id}`)).map((d) => ({ ...d, _group: "decor" })),
    ];
  }
  return DECORATIONS.filter((d) => d.cat === activeCat).map((d) => ({
    ...d,
    _group: "decor",
  }));
}

function renderFlyout() {
  catFlyoutEl.innerHTML = "";
  CATEGORIES.forEach((cat) => {
    const row = document.createElement("button");
    row.className = "cat-row";
    row.classList.toggle("is-active", cat.id === activeCat);
    row.innerHTML = `<span class="c-icon">${cat.icon}</span><span>${t(cat.label)}</span>`;
    row.addEventListener("click", () => {
      activeCat = cat.id;
      catBtnEl.querySelector(".cat-icon").textContent = cat.icon;
      catBtnEl.querySelector(".cat-name").textContent = t(cat.label);
      catFlyoutEl.classList.add("hidden");
      renderStrip();
    });
    catFlyoutEl.appendChild(row);
  });
}

catBtnEl.addEventListener("click", (e) => {
  e.stopPropagation();
  if (buildMode) return; // palette is locked to the tray while building
  renderFlyout();
  catFlyoutEl.classList.toggle("hidden");
});

// --- staging tray: "Build from tray" toggle --------------------------------
const buildToggleEl = document.getElementById("build-toggle");
function updateTrayUI() {
  const n = tray.size;
  const label = t("ট্রে থেকে বানাও");
  buildToggleEl.textContent = n ? `${label} (${n})` : label;
  buildToggleEl.classList.toggle("is-on", buildMode);
  catBtnEl.classList.toggle("is-locked", buildMode);
}
buildToggleEl.addEventListener("click", () => {
  if (!buildMode && tray.size === 0) {
    flashHint("আগে ট্রেতে আইটেম যোগ করো (＋)");
    return;
  }
  buildMode = !buildMode;
  if (buildMode) {
    activeCat = "tray";
    catBtnEl.querySelector(".cat-icon").textContent = "🧰";
    catBtnEl.querySelector(".cat-name").textContent = t("ট্রে");
    catFlyoutEl.classList.add("hidden");
    // jump to Decorate so the tray palette + tweezers/water/spray tools are all
    // ready together — the full build-from-tray flow
    if (activeTab !== "decor") selectTab("decor");
    flashHint("ট্রে থেকে বেছে চিমটা দিয়ে বসাও, পানি ঢালো, স্প্রে করো।");
  }
  updateTrayUI();
  renderStrip();
});
window.addEventListener("pointerdown", (e) => {
  if (!catFlyoutEl.contains(e.target) && e.target !== catBtnEl) {
    catFlyoutEl.classList.add("hidden");
  }
});

// Real 3D thumbnails, rendered once per item then cached.
const iconCache = new Map();
function iconFor(group, item) {
  const key = `${group}:${item.id}`;
  if (!iconCache.has(key)) {
    let url;
    if (group === "jar" && item.id === "none") url = noJarIcon();
    else if (group === "jar") url = jarIcon(item.id);
    else if (group === "base") url = baseIcon(item.id, item.layerHeight);
    else url = decorationIcon(item.kind, item.variant);
    iconCache.set(key, url);
  }
  return iconCache.get(key);
}

// simple "no jar" card: a dashed circle drawn on canvas
let noJarIconUrl = null;
function noJarIcon() {
  if (noJarIconUrl) return noJarIconUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgba(232,230,223,0.7)";
  ctx.lineWidth = 4;
  ctx.setLineDash([9, 7]);
  ctx.beginPath();
  ctx.arc(48, 48, 32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(26, 70);
  ctx.lineTo(70, 26);
  ctx.stroke();
  noJarIconUrl = c.toDataURL("image/png");
  return noJarIconUrl;
}

// --- drag an item chip straight into the jar -------------------------------
let chipDrag = null; // { group, item, ghost, moved }

function beginChipDrag(group, item, e) {
  chipDrag = { group, item, ghost: null, sx: e.clientX, sy: e.clientY };
}

window.addEventListener("pointermove", (e) => {
  if (!chipDrag) return;
  const dx = e.clientX - chipDrag.sx;
  const dy = e.clientY - chipDrag.sy;
  if (!chipDrag.ghost && dx * dx + dy * dy > 64) {
    const img = document.createElement("img");
    img.className = "drag-ghost";
    img.src = iconFor(chipDrag.group, chipDrag.item);
    document.body.appendChild(img);
    chipDrag.ghost = img;
  }
  if (chipDrag.ghost) {
    chipDrag.ghost.style.left = `${e.clientX - 26}px`;
    chipDrag.ghost.style.top = `${e.clientY - 26}px`;
  }
});

window.addEventListener("pointerup", (e) => {
  if (!chipDrag) return;
  const { group, item, ghost } = chipDrag;
  chipDrag = null;
  if (!ghost) return; // no drag happened — the click handler takes it
  ghost.remove();
  // Dropped over the 3D scene?
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (el !== canvas) return;
  const screen = { x: e.clientX, y: e.clientY };
  if (group === "jar") {
    if (item.id !== currentJarId) {
      snapshot();
      setJar(item.id);
    }
  } else if (group === "base") {
    selected = { group: "base", id: item.id };
    tryAddLayer(item.id);
  } else {
    selected = { group: "decor", id: item.id };
    tryPlaceDecoration(screen, item.id);
  }
  renderStrip();
  studio.markInteraction();
});

function renderStrip() {
  const q = searchEl.value.trim().toLowerCase();
  stripEl.innerHTML = "";
  stripSource()
    .filter((item) => !q || item.label.toLowerCase().includes(q))
    .forEach((item) => {
      const group = item._group;
      const favKey = `${group}:${item.id}`;
      const card = document.createElement("button");
      card.className = "item-chip";
      card.dataset.id = item.id;
      const inTray = tray.has(favKey);
      card.innerHTML =
        `<span class="fav-btn ${favs.has(favKey) ? "is-fav" : ""}" title="পছন্দ">${favs.has(favKey) ? "♥" : "♡"}</span>` +
        `<span class="tray-btn ${inTray ? "is-in" : ""}" title="${t("ট্রে")}">${inTray ? "✓" : "＋"}</span>` +
        `<img class="item-img" draggable="false" src="${iconFor(group, item)}" alt="">` +
        `<span class="item-label">${tLabel(item.label)}</span>`;
      const active =
        group === "jar"
          ? item.id === currentJarId
          : selected.group === group && selected.id === item.id;
      card.classList.toggle("is-active", active);

      card.querySelector(".fav-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFav(favKey);
        renderStrip();
      });
      card.querySelector(".tray-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleTray(favKey);
        updateTrayUI();
        renderStrip();
      });

      const isBtn = (el) =>
        el.classList.contains("fav-btn") || el.classList.contains("tray-btn");
      card.addEventListener("pointerdown", (e) => {
        if (isBtn(e.target)) return;
        beginChipDrag(group, item, e);
      });
      card.addEventListener("click", (e) => {
        if (isBtn(e.target)) return;
        if (chipDrag?.ghost) return; // was a drag, not a click
        if (group === "jar") {
          if (item.id !== currentJarId) {
            snapshot();
            setJar(item.id);
          }
        } else {
          selected = { group, id: item.id };
          selectTool("place"); // picking a material returns to place mode
        }
        renderStrip();
        updateHint();
        studio.markInteraction();
      });
      stripEl.appendChild(card);
    });
}

searchEl.addEventListener("input", renderStrip);

// --- gallery: save & revisit whole terrariums ------------------------------
const GAL_KEY = "potroneer-gallery";
const galleryEl = document.getElementById("gallery");
const galGridEl = document.getElementById("gal-grid");

function loadGallery() {
  try {
    return JSON.parse(
      localStorage.getItem(GAL_KEY) || localStorage.getItem("terrarium-gallery") || "[]",
    );
  } catch {
    return [];
  }
}

function saveTerrarium() {
  const full = studio.capture();
  const img = new Image();
  img.onload = () => {
    // downscale the screenshot so dozens of saves fit in localStorage
    const c = document.createElement("canvas");
    const w = 320;
    const h = Math.round((img.height / img.width) * w);
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    const entries = loadGallery();
    entries.unshift({
      id: Date.now(),
      jarId: currentJarId,
      custom: { ...jarCustom },
      layers: state.layers,
      decorations: state.decorations,
      terrain: Array.from(state.terrain),
      terrainMat: Array.from(state.terrainMat),
      painted: state.painted,
      thumb: c.toDataURL("image/jpeg", 0.72),
    });
    try {
      localStorage.setItem(GAL_KEY, JSON.stringify(entries.slice(0, 24)));
      flashHint("টেরারিয়াম সংরক্ষিত!");
    } catch {
      flashHint("জায়গা নেই — গ্যালারি থেকে কিছু মুছে ফেলো।");
    }
  };
  img.src = full;
}

function renderGallery() {
  const entries = loadGallery();
  galGridEl.innerHTML = "";
  if (!entries.length) {
    galGridEl.innerHTML = `<p class="gal-empty">${t("গ্যালারি খালি — 💾 দিয়ে সংরক্ষণ করো।")}</p>`;
    return;
  }
  entries.forEach((e) => {
    const card = document.createElement("div");
    card.className = "gal-card";
    const date = new Date(e.id).toLocaleDateString(
      getLang() === "bn" ? "bn-BD" : "en-GB",
      { day: "numeric", month: "short" },
    );
    card.innerHTML = `<img src="${e.thumb}" alt=""><div class="gal-meta"><span>${date}</span><span class="gal-actions"><button class="gal-load">${t("লোড")}</button><button class="gal-del">✕</button></span></div>`;
    card.querySelector(".gal-load").addEventListener("click", () => {
      snapshot();
      Object.assign(jarCustom, e.custom ?? { frame: null, glass: null, w: 1, h: 1 });
      document.getElementById("jar-w").value = Math.round(jarCustom.w * 100);
      document.getElementById("jar-h").value = Math.round(jarCustom.h * 100);
      setJar(e.jarId);
      state.layers.length = 0;
      state.layers.push(...e.layers);
      state.decorations.length = 0;
      state.decorations.push(...e.decorations);
      state.terrain.set(e.terrain);
      if (e.terrainMat) state.terrainMat.set(e.terrainMat);
      state.painted = e.painted ?? false;
      rebuildAll();
      galleryEl.classList.add("hidden");
      studio.markInteraction();
    });
    card.querySelector(".gal-del").addEventListener("click", () => {
      const rest = loadGallery().filter((x) => x.id !== e.id);
      localStorage.setItem(GAL_KEY, JSON.stringify(rest));
      renderGallery();
    });
    galGridEl.appendChild(card);
  });
}

document.getElementById("save").addEventListener("click", saveTerrarium);
document.getElementById("gallery-btn").addEventListener("click", () => {
  renderGallery();
  galleryEl.classList.toggle("hidden");
});
document.getElementById("gal-close").addEventListener("click", () => {
  galleryEl.classList.add("hidden");
});

// --- jar customiser (🎨) ----------------------------------------------------
const FRAME_COLORS = [null, "#26282c", "#b08d3e", "#a05a32", "#e8e4dc", "#7a5a34", "#3a5a8c", "#c76a94"];
const GLASS_TINTS = [null, "#cfe8d8", "#cfe0f0", "#f0d9b0", "#f0d0dc", "#ded0f0", "#b8bcc0"];
const ITEM_TINTS = [null, "#c94f3f", "#e8a33d", "#e8d24a", "#6faa4e", "#4a9c8c", "#5a7ac9", "#9a6ac9", "#d17aa0", "#f2ece0"];

const jarPanelEl = document.getElementById("jar-panel");
const itemPanelEl = document.getElementById("item-panel");

function buildSwatches(containerId, colors, getActive, onPick) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  colors.forEach((hex) => {
    const b = document.createElement("button");
    b.className = hex ? "swatch" : "swatch swatch--none";
    if (hex) b.style.setProperty("--sw", hex);
    b.classList.toggle("is-active", getActive() === hex);
    b.addEventListener("click", () => {
      onPick(hex);
      buildSwatches(containerId, colors, getActive, onPick);
    });
    el.appendChild(b);
  });
}

function refreshJarSwatches() {
  buildSwatches("frame-swatches", FRAME_COLORS, () => jarCustom.frame, (hex) => {
    jarCustom.frame = hex;
    applyJarColors();
  });
  buildSwatches("glass-swatches", GLASS_TINTS, () => jarCustom.glass, (hex) => {
    jarCustom.glass = hex;
    applyJarColors();
  });
}

document.getElementById("jar-custom-btn").addEventListener("click", () => {
  itemPanelEl.classList.add("hidden");
  refreshJarSwatches();
  jarPanelEl.classList.toggle("hidden");
});
document.querySelectorAll(".cfg-close").forEach((b) =>
  b.addEventListener("click", () => {
    document.getElementById(b.dataset.close).classList.add("hidden");
  }),
);
document.getElementById("jar-w").addEventListener("input", (e) => {
  jarCustom.w = Number(e.target.value) / 100;
  setJar(currentJarId);
});
document.getElementById("jar-h").addEventListener("input", (e) => {
  jarCustom.h = Number(e.target.value) / 100;
  setJar(currentJarId);
});

// jar-mounted lamp controls
const lightToggleEl = document.getElementById("light-toggle");
lightToggleEl.addEventListener("click", () => {
  jarLight.on = !jarLight.on;
  lightToggleEl.textContent = t(jarLight.on ? "চালু" : "বন্ধ");
  lightToggleEl.classList.toggle("is-on", jarLight.on);
  rebuildJarLight();
});
document.getElementById("light-h").addEventListener("input", (e) => {
  jarLight.height = Number(e.target.value) / 100;
  if (jarLight.on) rebuildJarLight();
});
document.getElementById("light-b").addEventListener("input", (e) => {
  jarLight.bright = Number(e.target.value) / 100;
  if (jarLight.on) rebuildJarLight();
});

// --- item adjuster: size / rotation / colour for any placed decoration ------
let adjTarget = null;

// tint every mesh of an object toward a hue (or restore its own colours)
function applyTint(obj, hex) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.origColor) {
      o.material = o.material.clone(); // avoid tinting shared materials
      o.userData.origColor = o.material.color.clone();
    }
    if (hex) o.material.color.copy(o.userData.origColor).lerp(new THREE.Color(hex), 0.72);
    else o.material.color.copy(o.userData.origColor);
  });
}

function openItemPanel(obj) {
  if (!obj?.userData?.record) return;
  adjTarget = obj;
  jarPanelEl.classList.add("hidden");
  const rec = obj.userData.record;
  document.getElementById("item-size").value = Math.round((rec.scale ?? 1) * 100);
  const deg = ((rec.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  document.getElementById("item-rot").value = Math.round((deg / (Math.PI * 2)) * 360);
  buildSwatches("item-swatches", ITEM_TINTS, () => rec.tint ?? null, (hex) => {
    rec.tint = hex;
    applyTint(adjTarget, hex);
  });
  itemPanelEl.classList.remove("hidden");
  studio.markInteraction();
}

document.getElementById("item-size").addEventListener("input", (e) => {
  if (!adjTarget) return;
  const sc = Number(e.target.value) / 100;
  const rec = adjTarget.userData.record;
  rec.scale = sc;
  adjTarget.userData.baseScale = sc;
  adjTarget.scale.setScalar(sc);
});
document.getElementById("item-rot").addEventListener("input", (e) => {
  if (!adjTarget) return;
  const rad = (Number(e.target.value) / 360) * Math.PI * 2;
  adjTarget.userData.record.rotation = rad;
  adjTarget.rotation.y = rad;
});
document.getElementById("item-del").addEventListener("click", () => {
  if (!adjTarget) return;
  snapshot();
  const rec = adjTarget.userData.record;
  const i = state.decorations.indexOf(rec);
  if (i >= 0) state.decorations.splice(i, 1);
  decorGroup.remove(adjTarget);
  adjTarget = null;
  itemPanelEl.classList.add("hidden");
  updateHint();
});

// --- language toggle -------------------------------------------------------
const TAB_LABELS = { sculpt: "ভাস্কর্য", paint: "পেইন্টিং", decor: "সাজানো", scene: "দৃশ্য" };
const langBtn = document.getElementById("lang");

function applyLang() {
  document.documentElement.lang = getLang();
  langBtn.textContent = getLang() === "bn" ? "EN" : "বাং";
  document.querySelectorAll(".tab").forEach((b) => {
    b.textContent = t(TAB_LABELS[b.dataset.tab]);
  });
  document.querySelectorAll(".slider-chip").forEach((chip) => {
    const names = { radius: "ব্যাসার্ধ", strength: "শক্তি", falloff: "ফলঅফ" };
    chip.querySelector(".s-label").textContent = t(names[chip.dataset.param]);
  });
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  searchEl.placeholder = t("খোঁজো…");
  const cat = CATEGORIES.find((c) => c.id === activeCat);
  if (cat) catBtnEl.querySelector(".cat-name").textContent = t(cat.label);
  renderTools();
  renderStrip();
  updateHint();
  updateTrayUI();
}

langBtn.addEventListener("click", () => {
  setLang(getLang() === "bn" ? "en" : "bn");
  applyLang();
});

// Hint-bar elements: declared before the init block below because
// applyLang()/updateHint() run during the first paint and read them.
const hintEl = document.getElementById("hint");
const hintStepEl = hintEl.querySelector(".hint-step");
const hintTextEl = hintEl.querySelector("p");
let flashTimer = null;

// Build the starting jar, then draw the UI.
setJar(currentJarId);
selected = { group: "base", id: BASE_LAYERS[0].id };
selectTab("decor");
renderStrip();
applyLang();

// --- hint / progress -------------------------------------------------------
// (hintEl / hintStepEl / hintTextEl / flashTimer are declared above the init
// block so first-paint applyLang()/updateHint() can use them.)

// Walks the user through the order a real closed terrarium is built:
// drainage → sphagnum barrier → charcoal → soil → plants.
function updateHint() {
  const laid = new Set(state.layers.map((l) => l.type));
  if (!hasBase(state)) {
    setHint("১", "বেস উপাদান বেছে ট্যাপ করো (গোল স্তর) বা ড্র্যাগ করে ইচ্ছেমতো আকৃতিতে মাটি আঁকো।");
  } else if (!laid.has("sphagnum") && !laid.has("soil")) {
    setHint("২", "এবার স্ফ্যাগনাম মসের পাতলা স্তর দাও — এটা মাটিকে নিচের ড্রেনেজে মিশে যাওয়া থেকে আটকায়।");
  } else if (!laid.has("charcoal") && !laid.has("soil")) {
    setHint("৩", "এক চিমটি চারকোল ছড়াও — বন্ধ জারের ভেতরটা তাজা রাখে।");
  } else if (!laid.has("soil")) {
    setHint("৪", "এখন মূল স্তর — মাটি। গাছের শিকড়ের জন্য একটু পুরু করে দাও।");
  } else if (state.decorations.length === 0) {
    setHint("৫", "সুন্দর! এবার সাজানোর জিনিস বেছে জারের ভেতরে ট্যাপ করে বসাও।");
  } else {
    setHint("৬", "দারুণ! ⛰️ টুলে মাটি ভাস্কর্য করো, 🌱 টুলে ঘাস আঁকো, জিনিস ধরে টেনে সাজাও।");
  }
}

const BN_DIGITS = { "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6" };
function setHint(step, text) {
  hintStepEl.textContent = getLang() === "en" ? (BN_DIGITS[step] ?? step) : step;
  hintTextEl.textContent = t(text);
}

function flashHint(text) {
  hintTextEl.textContent = t(text);
  hintEl.classList.add("is-flash");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    hintEl.classList.remove("is-flash");
    updateHint();
  }, 2200);
}

// --- topbar: photo mode, ambience, scene moods -----------------------------
document.getElementById("undo").addEventListener("click", undo);
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  }
});

document.getElementById("photo").addEventListener("click", () => {
  const url = studio.capture();
  const a = document.createElement("a");
  a.href = url;
  a.download = `potroneer-${Date.now()}.png`;
  a.click();
  flashHint("ছবি সেভ হয়ে গেছে! বন্ধুদের দেখাও।");
});

const soundBtn = document.getElementById("sound");
soundBtn.addEventListener("click", () => {
  const on = toggleAmbience();
  soundBtn.classList.toggle("is-active", on); // keep the text label, highlight when on
});

document.querySelectorAll(".mood-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    studio.setMood(btn.dataset.mood);
    document
      .querySelectorAll(".mood-btn")
      .forEach((b) => b.classList.toggle("is-active", b === btn));
    studio.markInteraction();
  });
});

// পরিবেশ (background) navbar button toggles the picker; click-away closes it.
const bgBtnEl = document.getElementById("bg-btn");
bgBtnEl.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = scenePanelEl.classList.toggle("hidden");
  bgBtnEl.classList.toggle("is-active", !open);
});
window.addEventListener("pointerdown", (e) => {
  if (
    !scenePanelEl.classList.contains("hidden") &&
    !scenePanelEl.contains(e.target) &&
    e.target !== bgBtnEl
  ) {
    scenePanelEl.classList.add("hidden");
    bgBtnEl.classList.remove("is-active");
  }
});

// --- reset -----------------------------------------------------------------
document.getElementById("reset").addEventListener("click", () => {
  snapshot();
  resetState(state);
  substrateGroup.clear();
  decorGroup.clear();
  mistGroup.clear(); // wipe condensation + wetness too
  fxGroup.clear();
  hidePour();
  wetLevel = 0;
  pickPlane.position.y = JAR.floorY + 0.001;
  tweens.length = 0;
  updateHint();
  studio.markInteraction();
});

updateHint();
