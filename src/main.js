import { startIntro, introReady, onIntroDone, replayIntro } from "./intro.js";
import * as THREE from "three";
import { createStudio } from "./scene.js";
import { buildJar, buildPickPlane, jarInnerSilhouette, JAR_TYPES, JAR_BY_ID } from "./jar.js";
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
  jarRadiusAt,
  JAR,
} from "./state.js";
import { toggleAmbience, playSfx } from "./ambience.js";
import { decorationIcon, baseIcon, jarIcon } from "./icons.js";
import { t, tLabel, getLang, setLang } from "./i18n.js";
import { preloadModels, getModelClone } from "./models.js";
import { createHand } from "./hand.js";
import {
  claimChallengeReward,
  PLANT_KINDS,
  UNLOCKS,
  getChallenge,
  getTutorial,
  hydrateGameState,
  isKindUnlocked,
  loadAutosave,
  loadGameState,
  progressPercent,
  recordGameAction,
  saveAutosave,
  saveGameState,
  simulateCare,
  xpForLevel,
  ACHIEVEMENTS,
  achievementList,
  achievementCount,
  unlockAchievement,
} from "./game.js";
import { createSocialClient } from "./social.js";
import { createWorldEffects } from "./effects.js";
import { toast, floatText, burst, flyTo, centerTop } from "./juice.js";
import {
  THEMES,
  THEME_GROUPS,
  SEASONS,
  WEATHER,
  COSMETIC_PACKS,
  themeById,
  themeThumb,
  applyThemeSkin,
} from "./themes.js";

// Play the boot sequence right away — it hides the rest of this module's
// start-up work behind the logo sting and trailer.
startIntro();

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

// The builder's hand: tweezers pinched over the jar, following the cursor while
// an ingredient is selected and dipping in to release it — the real gesture the
// reference clips are all built around. It lives in scene space, not `world`,
// so it always reaches in over the player's shoulder however the jar is turned.
const hand = createHand();
studio.scene.add(hand.group);
let handFrame = performance.now();
const state = createState();
const social = createSocialClient();
const worldEffects = createWorldEffects(studio.world);
let socialUser = null;
let socialActiveTab = "explore";
let socialAuthMode = "signin";
let socialRecords = [];
let socialMineRecords = [];
let pendingRemixOf = null;
// A photo world by default: the studio sweep is still one tap away in থিম ▸ আঁকা.
let currentThemeId = "leaf-shadow-wall";
let seasonId = "spring";
let weatherId = "clear";
let cycleEnabled = true;
let timeOfDay = 0.52;
let coopRoom = null;
let coopApplying = false;
let coopTimer = null;
const COMFORT_KEY = "potroneer-comfort";
let savedComfort = {};
try {
  savedComfort = JSON.parse(localStorage.getItem(COMFORT_KEY) || "{}");
} catch {
  savedComfort = {};
}
const comfort = {
  softUi: true,
  reducedMotion: false,
  opacity: 88,
  sound: false,
  ...savedComfort,
};
let focusMode = false;
let radialOpen = false;
let focusToolArmed = false;

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
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = interior.floorY + 0.3 + Math.random() * (interior.bodyHeight - 0.4);
    const rr = Math.sqrt(Math.random()) * jarRadiusAt(y) * 0.8;
    positions[i * 3] = Math.cos(a) * rr;
    positions[i * 3 + 1] = y;
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
  setJarInterior(it, jarInnerSilhouette(typeId, it));

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

  // Sit the table surface flush against the *actual* lowest point of the
  // vessel. Polyhedral jars (geodesic, gem, pyramid) extend below their
  // interior floor metric, so using floorY directly makes them sink into the
  // display slab. Normalize the vessel first, then place the slab at that
  // physical bottom edge.
  jarGroup.updateWorldMatrix(true, true);
  const jarBounds = new THREE.Box3().setFromObject(jarGroup);
  const fallbackBottom = it.floorY - it.wallThickness;
  const hasVisibleVessel = !type.none && jarGroup.children.some((child) => child.visible);
  const actualBottom = hasVisibleVessel && Number.isFinite(jarBounds.min.y) ? jarBounds.min.y : fallbackBottom;
  const targetBottom = fallbackBottom;
  jarGroup.position.y += targetBottom - actualBottom;
  studio.setBaseY(targetBottom);

  // Fresh dust motes sized to this jar's interior.
  if (motes) studio.world.remove(motes);
  motes = buildMotes(type.interior);
  studio.world.add(motes);

  // The build survives jar changes — you can decorate in the open and slip a
  // jar over it later, like the reference. Just nudge anything that would
  // poke through the new glass back inside the footprint.
  const rDec = jarRadiusAt(substrateTop(state)) * 0.9;
  const rx = rDec * JAR.stretchX;
  const rz = rDec;
  state.decorations.forEach((rec) => {
    const n = Math.hypot(rec.x / rx, rec.z / rz);
    if (n > 1) {
      rec.x /= n;
      rec.z /= n;
      rec.y = substrateTop(state) + heightAt(state, rec.x, rec.z);
    }
  });
  rebuildAll();
  placePickPlane(substrateTop(state));
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
  hand.update(now, Math.min(50, now - handFrame));
  handFrame = now;
  animateMotes(now);
  worldEffects.update(now);
  if (cycleEnabled) {
    timeOfDay = (timeOfDay + 0.0000025) % 1;
    studio.setTimeOfDay?.(timeOfDay);
    const timeSlider = document.getElementById("time-cycle");
    if (timeSlider && document.activeElement !== timeSlider) timeSlider.value = Math.round(timeOfDay * 100);
  }
  if (now - lastGameFrame > 2500) {
    lastGameFrame = now;
    syncGameCare(Date.now());
  }
  const dt = 16.7;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    tw.apply(tw.ease(tw.t));
    if (tw.t >= 1) tweens.splice(i, 1);
  }
});

// Park the invisible placement disc at the current surface, shrunk to the
// interior width at that height so taps can't drop decorations outside a
// curved-in jar.
function placePickPlane(y) {
  if (!pickPlane) return;
  pickPlane.position.y = y + 0.001;
  const base = Math.max(0.05, JAR.innerRadius - 0.05);
  const k = Math.max(0.05, jarRadiusAt(y) - 0.05) / base;
  pickPlane.scale.set(k, 1, k);
}

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
    terrainCap = buildTerrainCap(topDef, substrateTop(state));
    updateTerrainCap(terrainCap, state, substrateTop(state));
    substrateGroup.add(terrainCap);
  }
  placePickPlane(substrateTop(state));
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
  applyPlantGrowth();
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
  if (state.decorations.length >= (window.innerWidth < 700 ? 72 : 120)) {
    flashHint(getLang() === "bn" ? "জার ভরে গেছে — কিছু জিনিস সরিয়ে আবার চেষ্টা করো।" : "This garden is full — remove something before adding more.");
    return;
  }
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
  gameAction("plant", def.kind);
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
  while (mistGroup.children.length > 420) mistGroup.remove(mistGroup.children[0]);
  if (performance.now() - lastMistGameAction > 700) {
    lastMistGameAction = performance.now();
    game.care.humidity = Math.min(1, game.care.humidity + 0.12);
    gameAction("mist");
  }
  studio.markInteraction();
}

// Wetness darkens + glosses the substrate and freshens the planting. Progressive
// so repeated watering builds up; re-applied after any rebuild.
let wetLevel = 0;
const game = loadGameState();
currentThemeId = game.theme || currentThemeId;
seasonId = game.season || seasonId;
weatherId = game.weather || weatherId;
timeOfDay = typeof game.timeOfDay === "number" ? game.timeOfDay : timeOfDay;
cycleEnabled = game.cycleEnabled ?? cycleEnabled;
let autosaveTimer = null;
let lastGameFrame = 0;
let lastMistGameAction = 0;
let lastWaterGameAction = 0;

function gameMetrics() {
  const plantCount = state.decorations.filter((rec) => PLANT_KINDS.has(rec.kind)).length;
  const mossCount = state.decorations.filter((rec) => rec.kind === "moss" || rec.kind === "mossball").length;
  return {
    plantCount,
    mossCount,
    layerCount: state.layers.length,
    hasSoil: state.layers.some((layer) => layer.type === "soil"),
    lightOn: jarLight.on,
  };
}

function setCareMeter(id, value) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const label = document.getElementById(`care-${id}`);
  const fill = document.getElementById(`care-${id}-fill`);
  if (label) label.textContent = `${gameLabel(id)} ${toUiDigits(pct)}%`;
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.style.background = pct < 30 ? "var(--danger)" : pct < 55 ? "#c9a95e" : "var(--green)";
  }
}

function gameLabel(id) {
  const labels = {
    water: getLang() === "bn" ? "জল" : "Water",
    humidity: getLang() === "bn" ? "আর্দ্রতা" : "Humidity",
    light: getLang() === "bn" ? "আলো" : "Light",
    soil: getLang() === "bn" ? "মাটি" : "Soil",
  };
  return labels[id] ?? id;
}

function toUiDigits(value) {
  if (getLang() !== "bn") return String(value);
  return String(value).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);
}

function currentBuildData() {
  return {
    jarId: currentJarId,
    custom: { ...jarCustom },
    jarLight: { ...jarLight },
    wetLevel,
    layers: state.layers,
    decorations: state.decorations,
    terrain: Array.from(state.terrain),
    terrainMat: Array.from(state.terrainMat),
    painted: state.painted,
    themeId: currentThemeId,
    seasonId,
    weatherId,
    timeOfDay,
    cycleEnabled,
    cosmeticPack: game.cosmeticPack || "starter",
  };
}

function autosavePayload() {
  return {
    game,
    build: currentBuildData(),
  };
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      saveAutosave(autosavePayload());
      saveGameState(game);
      broadcastCoopSnapshot();
      renderGameHud();
      const status = document.getElementById("autosave-status");
      if (status) status.textContent = getLang() === "bn" ? "অটোসেভ হয়েছে" : "Autosaved";
    } catch {
      const status = document.getElementById("autosave-status");
      if (status) status.textContent = getLang() === "bn" ? "সেভ হয়নি" : "Save failed";
    }
  }, 500);
}

function unlockGameAchievement(id) {
  if (!unlockAchievement(game, id)) return;
  playSfx("unlock");
  const achievement = ACHIEVEMENTS.find((item) => item.id === id);
  toast(
    getLang() === "bn" ? `অর্জন: ${achievement?.bn || id}` : `Achievement: ${achievement?.title || id}`,
    { icon: achievement?.icon || "🏅", tone: "achievement", duration: 3200 },
  );
  const { x, y } = centerTop();
  burst(x, y, { count: 22, colors: ["#f0c36a", "#ffe9a8", "#e88fb0", "#7bc3bd"] });
  renderAchievements();
  saveGameState(game);
}

function renderAchievements() {
  const count = document.getElementById("achievement-count");
  if (count) count.textContent = `${achievementCount(game)} / ${ACHIEVEMENTS.length}`;
  const grid = document.getElementById("achievements-grid");
  if (!grid) return;
  grid.innerHTML = "";
  achievementList(game).forEach((item) => {
    const card = document.createElement("div");
    card.className = `achievement-card${item.unlocked ? " is-unlocked" : ""}`;
    card.innerHTML = `<span class="achievement-icon">${item.unlocked ? item.icon : "🔒"}</span><div><strong>${getLang() === "bn" ? item.bn : item.title}</strong><p>${getLang() === "bn" ? item.descBn : item.desc}</p></div>`;
    grid.append(card);
  });
}

// Which theme group the picker is showing. Groups keep 49 worlds browsable:
// the user picks a family first, then a picture.
let themeGroupId = "all";

function renderThemePanel() {
  const tabs = document.getElementById("theme-groups");
  const grid = document.getElementById("theme-grid");
  const bn = getLang() === "bn";
  if (tabs) {
    tabs.innerHTML = "";
    const groups = [{ id: "all", label: "All", bn: "সব", icon: "✦" }, ...THEME_GROUPS];
    groups.forEach((group) => {
      const button = document.createElement("button");
      button.className = `theme-group${group.id === themeGroupId ? " is-active" : ""}`;
      button.innerHTML = `<span>${group.icon}</span>${bn ? group.bn : group.label}`;
      button.addEventListener("click", () => {
        themeGroupId = group.id;
        renderThemePanel();
      });
      tabs.append(button);
    });
  }
  if (grid) {
    grid.innerHTML = "";
    const list = THEMES.filter((theme) => themeGroupId === "all" || theme.group === themeGroupId);
    list.forEach((theme) => {
      const button = document.createElement("button");
      button.className = `theme-card${theme.id === currentThemeId ? " is-active" : ""}`;
      button.dataset.theme = theme.id;
      button.style.setProperty("--card-accent", theme.accent || "#6d9e4f");
      const thumb = themeThumb(theme);
      // Photo themes preview the real backdrop; painted ones show their swatch.
      const art = thumb
        ? `<img class="theme-thumb" src="${thumb}" alt="" loading="lazy" decoding="async" />`
        : `<span class="theme-swatch theme-swatch--${theme.id}"></span>`;
      button.innerHTML = `${art}<strong>${bn ? theme.bn : theme.label}</strong>`;
      button.addEventListener("click", () => setTheme(theme.id));
      grid.append(button);
    });
  }
  const season = document.getElementById("season-select");
  const weather = document.getElementById("weather-select");
  if (season && !season.options.length) SEASONS.forEach((item) => season.add(new Option(getLang() === "bn" ? item.bn : item.label, item.id)));
  if (weather && !weather.options.length) WEATHER.forEach((item) => weather.add(new Option(getLang() === "bn" ? item.bn : item.label, item.id)));
  if (season) season.value = seasonId;
  if (weather) weather.value = weatherId;
  const cycle = document.getElementById("time-cycle-toggle");
  if (cycle) cycle.checked = cycleEnabled;
  const slider = document.getElementById("time-cycle");
  if (slider) slider.value = Math.round(timeOfDay * 100);
  const packs = document.getElementById("cosmetic-packs");
  if (packs) {
    packs.innerHTML = "";
    COSMETIC_PACKS.forEach((pack) => {
      const button = document.createElement("button");
      button.className = `pack-chip${(game.cosmeticPack || "starter") === pack.id ? " is-active" : ""}`;
      button.textContent = getLang() === "bn" ? pack.bn : pack.label;
      button.style.setProperty("--pack-color", pack.color);
      button.addEventListener("click", () => applyCosmeticPack(pack.id));
      packs.append(button);
    });
  }
}

function setTheme(id, reward = true) {
  const theme = themeById(id);
  currentThemeId = theme.id;
  game.theme = theme.id;
  // The whole UI wears the theme: buttons, panels, pills and hint all re-tint
  // from the picture's own accent colour.
  applyThemeSkin(theme);
  studio.setTheme?.(theme.id);
  worldEffects.setTheme(theme);
  if (theme.weather) setWeather(theme.weather, false);
  renderThemePanel();
  if (reward) unlockGameAchievement("theme-tour");
  scheduleAutosave();
}

function setSeason(id) {
  const season = SEASONS.find((item) => item.id === id) || SEASONS[0];
  seasonId = season.id;
  game.season = season.id;
  setWeather(season.weather, false);
  renderThemePanel();
  scheduleAutosave();
}

function setWeather(id, reward = true) {
  const weather = WEATHER.some((item) => item.id === id) ? id : "clear";
  weatherId = weather;
  game.weather = weather;
  worldEffects.setWeather(weather);
  if (reward) unlockGameAchievement("weather-watcher");
  renderThemePanel();
  scheduleAutosave();
}

const PACK_STYLES = {
  starter: { frame: null, glass: null }, wizarding: { frame: "#3b2a52", glass: "#d9d0ef" }, cosmic: { frame: "#35476e", glass: "#9dc3e9" },
  jungle: { frame: "#285b3a", glass: "#b9e0bd" }, urban: { frame: "#5f6570", glass: "#c6d3d9" }, village: { frame: "#765338", glass: "#e1c7a4" },
  blossom: { frame: "#92516e", glass: "#f2c9d9" }, avatar: { frame: "#39758a", glass: "#b9e1df" }, hero: { frame: "#842d2b", glass: "#d6e5ef" },
  lantern: { frame: "#7c4f22", glass: "#f4c78d" }, alpine: { frame: "#526d7b", glass: "#cce0ea" }, caucasus: { frame: "#496b55", glass: "#d3e5d8" },
};
function applyCosmeticPack(id) {
  const style = PACK_STYLES[id] || PACK_STYLES.starter;
  game.cosmeticPack = id;
  jarCustom.frame = style.frame;
  jarCustom.glass = style.glass;
  applyJarColors();
  renderThemePanel();
  scheduleAutosave();
}

function broadcastCoopSnapshot() {
  if (!coopRoom || coopApplying) return;
  clearTimeout(coopTimer);
  coopTimer = setTimeout(() => social.broadcastCoop({ sender: socialUser?.id, build: currentBuildData(), game }), 250);
}

function syncGameCare(now = Date.now()) {
  const wasClaimed = game.challenge?.claimed;
  const changed = simulateCare(game, gameMetrics(), now);
  const passiveReward = !wasClaimed ? claimChallengeReward(game) : 0;
  if (changed) {
    applyPlantGrowth();
    renderGameHud();
    saveGameState(game);
  }
  if (passiveReward > 0) {
    playSfx("unlock");
    flashHint(getLang() === "bn" ? "আজকের চ্যালেঞ্জ সম্পূর্ণ! XP পেয়েছো।" : "Daily challenge complete! XP earned.");
    scheduleAutosave();
  }
}

// Float a "+N XP" number up from the XP bar so every rewarded action lands.
function spawnXpFloat(amount) {
  const anchor = document.getElementById("game-xp-value") || document.getElementById("game-panel");
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  floatText(`+${toUiDigits(amount)} XP`, r.left + r.width / 2, r.top, "xp");
}

function gameAction(type, value = null) {
  const result = recordGameAction(game, { type, value }, gameMetrics());
  const achievementByAction = { plant: "first-leaf", water: "caregiver", mist: "mist-maker", light: "night-gardener" };
  if (achievementByAction[type]) unlockGameAchievement(achievementByAction[type]);
  if (result.xpEarned > 0) {
    const sound = type === "water" ? "water" : type === "mist" ? "mist" : type === "plant" || type === "layer" ? "plop" : "save";
    playSfx(result.challengeCompleted ? "unlock" : sound);
    spawnXpFloat(result.xpEarned);
  }
  if (result.levelUp) {
    playSfx("unlock");
    const { x, y } = centerTop();
    toast(getLang() === "bn" ? `লেভেল ${toUiDigits(game.level)}! নতুন জিনিস আনলক হয়েছে।` : `Level ${game.level}! New items unlocked.`, { icon: "⭐", tone: "level", duration: 3000 });
    burst(x, y, { count: 28, spread: 170, colors: ["#f0c36a", "#ffe9a8", "#79a963", "#f5f2e8"] });
    renderStrip();
  }
  if (result.challengeCompleted) {
    const { x, y } = centerTop();
    toast(getLang() === "bn" ? "আজকের চ্যালেঞ্জ সম্পূর্ণ! 🏆" : "Daily challenge complete! 🏆", { icon: "🏆", tone: "challenge", duration: 3000 });
    burst(x, y, { count: 24, colors: ["#f0c36a", "#e88fb0", "#7bc3bd"] });
  }
  if ((game.evolutionStage || 0) >= 4) unlockGameAchievement("evolved");
  if (result.tutorialAdvanced) playSfx("plop");
  applyPlantGrowth();
  scheduleAutosave();
  renderGameHud();
}

function renderGameHud() {
  const levelEl = document.getElementById("game-level");
  const xpFill = document.getElementById("game-xp-fill");
  const xpValue = document.getElementById("game-xp-value");
  if (!levelEl || !xpFill || !xpValue) return;
  const current = xpForLevel(game.level);
  const next = xpForLevel(game.level + 1);
  levelEl.textContent = getLang() === "bn" ? `লেভেল ${toUiDigits(game.level)}` : `Level ${game.level}`;
  const evolution = document.getElementById("game-evolution");
  if (evolution) {
    const stages = getLang() === "bn" ? ["বীজ", "কুঁড়ি", "বর্ধনশীল", "সমৃদ্ধ", "বাস্তুতন্ত্র"] : ["Seed", "Sprout", "Growing", "Thriving", "Ecosystem"];
    evolution.textContent = `${stages[game.evolutionStage || 0]} · ${Math.floor(game.ageDays || 0)}d`;
  }
  xpFill.style.width = `${progressPercent(game)}%`;
  xpValue.textContent = `${toUiDigits(Math.max(0, game.xp - current))} / ${toUiDigits(next - current)} XP`;
  setCareMeter("water", game.care.water);
  setCareMeter("humidity", game.care.humidity);
  setCareMeter("light", game.care.light);
  setCareMeter("soil", game.care.soil);

  const tutorial = getTutorial(game);
  const tutorialTitle = document.getElementById("game-tutorial-title");
  const tutorialBody = document.getElementById("game-tutorial-body");
  const tutorialCheck = document.getElementById("game-tutorial-check");
  const tutorialCta = document.getElementById("game-tutorial-cta");
  if (tutorial) {
    tutorialTitle.textContent = getLang() === "bn" ? tutorial.bn : tutorial.title;
    tutorialBody.textContent = getLang() === "bn" ? tutorial.bodyBn : tutorial.body;
    tutorialCheck.textContent = `${toUiDigits(game.tutorialIndex + 1)} / ${toUiDigits(6)}`;
    tutorialCta?.classList.remove("is-hidden");
    if (tutorialCta) tutorialCta.textContent = t("এখন করো");
  } else {
    tutorialTitle.textContent = getLang() === "bn" ? "তুমি প্রস্তুত!" : "You are ready!";
    tutorialBody.textContent = getLang() === "bn" ? "এখন নিজের ছোট্ট পৃথিবী বানাও।" : "Now build a little world of your own.";
    tutorialCheck.textContent = "✓";
    tutorialCta?.classList.add("is-hidden");
  }

  const challenge = getChallenge(game);
  const challengeTitle = document.getElementById("game-challenge-title");
  const challengeBody = document.getElementById("game-challenge-body");
  const challengeReward = document.getElementById("game-challenge-reward");
  const challengeFill = document.getElementById("game-challenge-fill");
  const challengeValue = document.getElementById("game-challenge-value");
  challengeTitle.textContent = getLang() === "bn" ? challenge.titleBn : challenge.title;
  challengeBody.textContent = getLang() === "bn" ? challenge.bodyBn : challenge.body;
  challengeReward.textContent = `+${toUiDigits(challenge.reward)} XP`;
  challengeFill.style.width = `${Math.min(100, (game.challenge.progress / challenge.target) * 100)}%`;
  challengeValue.textContent = `${toUiDigits(Math.round(game.challenge.progress * 100) / 100)} / ${toUiDigits(challenge.target)}`;

  const restore = document.getElementById("restore-autosave");
  if (restore) restore.classList.toggle("is-hidden", !loadAutosave());
}

function applyPlantGrowth() {
  const health = game.care.health;
  const growth = 1 + game.care.growth * 0.12;
  decorGroup.children.forEach((obj) => {
    const rec = obj.userData.record;
    if (!rec || !PLANT_KINDS.has(rec.kind)) return;
    obj.scale.setScalar((obj.userData.baseScale ?? rec.scale ?? 1) * growth);
    obj.userData.vitality = health;
  });
}

function socialStatus(message, isError = false) {
  const el = document.getElementById("social-status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#f0b2a3" : "";
}

function socialMessage(bn, en) {
  return getLang() === "bn" ? bn : en;
}

function socialPlaceholder() {
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#344037"/><circle cx="160" cy="114" r="56" fill="#6d9e4f" opacity=".7"/><path d="M102 146c30-35 42-82 58-82s28 47 58 82" fill="none" stroke="#d6e7bd" stroke-width="5" opacity=".6"/><text x="160" y="32" fill="#eef3e8" text-anchor="middle" font-family="sans-serif" font-size="16">POTRONEER</text></svg>`,
  );
}

function makeThumbnail() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const w = 640;
      const h = Math.round((img.height / img.width) * w);
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => resolve(null);
    img.src = studio.capture();
  });
}

function setSocialRecord(records, updated) {
  const index = records.findIndex((item) => item.id === updated.id);
  if (index >= 0) records[index] = updated;
}

function renderSocialGrid(container, records, mine = false) {
  if (!container) return;
  container.innerHTML = "";
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "social-empty";
    empty.textContent = mine
      ? socialMessage("এখনও কিছু প্রকাশ করোনি।", "You have not published anything yet.")
      : socialMessage("কমিউনিটিতে এখনও কোনো টেরারিয়াম নেই। প্রথমটি তুমি বানাও!", "No public terrariums yet. Make the first one!");
    container.appendChild(empty);
    return;
  }
  records.forEach((record) => {
    const card = document.createElement("article");
    card.className = "social-card";
    const img = document.createElement("img");
    img.src = record.thumbnail || socialPlaceholder();
    img.alt = record.title || "Terrarium";
    const body = document.createElement("div");
    body.className = "social-card-body";
    const title = document.createElement("div");
    title.className = "social-card-title";
    title.textContent = record.title || "Untitled terrarium";
    const meta = document.createElement("div");
    meta.className = "social-card-meta";
    const owner = document.createElement("span");
    owner.textContent = `🌿 ${record.ownerName || "Gardener"}`;
    const likes = document.createElement("span");
    likes.textContent = `♥ ${record.likesCount || 0}`;
    meta.append(owner, likes);
    const actions = document.createElement("div");
    actions.className = "social-card-actions";
    const visit = document.createElement("button");
    visit.className = "social-visit";
    visit.textContent = socialMessage("ভিজিট", "Visit");
    visit.addEventListener("click", () => visitSocialRecord(record, false));
    const remix = document.createElement("button");
    remix.textContent = socialMessage("রিমিক্স", "Remix");
    remix.addEventListener("click", () => visitSocialRecord(record, true));
    const like = document.createElement("button");
    like.classList.toggle("is-active", record.liked);
    like.textContent = `${record.liked ? "♥" : "♡"} ${socialMessage("লাইক", "Like")}`;
    like.addEventListener("click", async () => {
      try {
        const updated = await social.toggleLike(record);
        Object.assign(record, updated);
        renderSocialGrid(container, records, mine);
      } catch (error) {
        socialStatus(error.message, true);
      }
    });
    const favorite = document.createElement("button");
    favorite.classList.toggle("is-active", record.favorited);
    favorite.textContent = `${record.favorited ? "★" : "☆"} ${socialMessage("সংরক্ষণ", "Save")}`;
    favorite.addEventListener("click", async () => {
      try {
        const updated = await social.toggleFavorite(record);
        Object.assign(record, updated);
        renderSocialGrid(container, records, mine);
      } catch (error) {
        socialStatus(error.message, true);
      }
    });
    const share = document.createElement("button");
    share.textContent = socialMessage("শেয়ার", "Share");
    share.addEventListener("click", async () => {
      try {
        const url = await social.shareUrl(record);
        await navigator.clipboard?.writeText(url);
        socialStatus(socialMessage("শেয়ার লিংক কপি হয়েছে।", "Share link copied."));
      } catch (error) {
        socialStatus(error.message, true);
      }
    });
    actions.append(visit, remix, like, favorite, share);
    body.append(title, meta, actions);
    card.append(img, body);
    container.appendChild(card);
  });
}

async function refreshSocialFeed() {
  socialStatus(socialMessage("কমিউনিটি লোড হচ্ছে…", "Loading community…"));
  try {
    socialRecords = await social.listPublic();
    socialMineRecords = await social.listMine();
    renderSocialGrid(document.getElementById("social-explore-grid"), socialRecords);
    renderSocialGrid(document.getElementById("social-mine-grid"), socialMineRecords, true);
    const challenge = getChallenge(game);
    const count = await social.challengeParticipants(game.challenge.date);
    document.getElementById("social-challenge-title").textContent = getLang() === "bn" ? challenge.titleBn : challenge.title;
    document.getElementById("social-challenge-body").textContent = getLang() === "bn" ? challenge.bodyBn : challenge.body;
    document.getElementById("social-challenge-count").textContent = getLang() === "bn" ? `${toUiDigits(count)} জন অংশ নিয়েছে` : `${count} gardeners joined`;
    socialStatus(social.isCloud ? socialMessage("ক্লাউড কমিউনিটি", "Cloud community") : socialMessage("ডেমো কমিউনিটি — Supabase যুক্ত করলে সবার জন্য লাইভ হবে", "Demo community — add Supabase to make it live for everyone."));
  } catch (error) {
    socialStatus(error.message, true);
  }
}

async function renderSocialAccount() {
  socialUser = await social.currentUser();
  document.getElementById("social-mode").textContent = social.isCloud ? "CLOUD" : socialMessage("ডেমো মোড", "DEMO MODE");
  const authCard = document.getElementById("social-auth-card");
  const profileCard = document.getElementById("social-profile-card");
  authCard.classList.toggle("hidden", !!socialUser);
  profileCard.classList.toggle("hidden", !socialUser);
  if (socialUser) {
    const name = socialUser.displayName || socialUser.user_metadata?.display_name || socialUser.email?.split("@")[0] || "Gardener";
    document.getElementById("social-profile-name").textContent = name;
    document.getElementById("social-profile-email").textContent = socialUser.email || "";
  }
}

function selectSocialTab(tab) {
  socialActiveTab = tab;
  document.querySelectorAll(".social-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.socialTab === tab));
  document.querySelectorAll(".social-view").forEach((view) => view.classList.toggle("hidden", view.id !== `social-${tab}-view`));
  if (tab === "account") renderSocialAccount();
  if (tab === "explore" || tab === "mine") refreshSocialFeed();
}

async function openSocial() {
  document.getElementById("social-modal").classList.remove("hidden");
  selectSocialTab(socialActiveTab);
  await renderSocialAccount();
}

function closeSocial() {
  document.getElementById("social-modal").classList.add("hidden");
}

async function visitSocialRecord(record, remix) {
  if (!record?.data) return;
  loadBuildData(record.data, { history: true });
  pendingRemixOf = remix ? record.id : null;
  unlockGameAchievement(remix ? "remixer" : "visitor");
  closeSocial();
  flashHint(remix ? socialMessage("রিমিক্স শুরু হয়েছে — নিজের মতো করে বদলে সেভ করো।", "Remix started — make it yours and save it.") : socialMessage("অন্য একজনের টেরারিয়াম ভিজিট করছো।", "Visiting another terrarium."));
  studio.markInteraction();
}

function openPublish() {
  if (!socialUser) {
    selectSocialTab("account");
    socialStatus(socialMessage("প্রকাশ করতে আগে সাইন ইন করো।", "Sign in before publishing."));
    return;
  }
  document.getElementById("publish-title").value = `Potroneer's garden`;
  document.getElementById("publish-description").value = "";
  document.getElementById("publish-modal").classList.remove("hidden");
}

async function publishCurrent(event) {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const record = await social.saveTerrarium({
      title: document.getElementById("publish-title").value.trim(),
      description: document.getElementById("publish-description").value.trim(),
      data: currentBuildData(),
      thumbnail: await makeThumbnail(),
      isPublic: document.getElementById("publish-public").checked,
      remixOf: pendingRemixOf,
      challengeDay: game.challenge.date,
    });
    await social.submitChallenge(game.challenge.date, record.id);
    pendingRemixOf = null;
    document.getElementById("publish-modal").classList.add("hidden");
    gameAction("save");
    unlockGameAchievement("community-gardener");
    socialStatus(socialMessage("প্রকাশিত হয়েছে!", "Published to the community!"));
    await refreshSocialFeed();
    selectSocialTab("mine");
  } catch (error) {
    socialStatus(error.message, true);
  } finally {
    submit.disabled = false;
  }
}
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
  if (isTap || now - lastWaterGameAction > 700) {
    lastWaterGameAction = now;
    game.care.water = Math.min(1, game.care.water + (isTap ? 0.22 : 0.08));
    game.care.humidity = Math.min(1, game.care.humidity + 0.03);
    gameAction("water");
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
  gameAction("layer", id);
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
    // The tweezers dip, open, and *then* the plant appears — the hand is doing
    // the placing, not decorating a placement that already happened.
    hand.carry(handPreview(def));
    handCarrying = null; // the tweezers are empty again once this one is let go
    hand.placeAt(hit.point, () => {
      placeDecoration(hit.point, def);
      if (screen?.x != null) burst(screen.x, screen.y, { count: 8, spread: 34, colors: ["#8a6b47", "#a9895f", "#c7b18b"] });
      updateHint();
    });
  }
}

// A miniature of the item, pinched between the tweezer tips while the hand
// carries it to the spot it will be planted.
function handPreview(def) {
  const obj = getModelClone(def.kind) ?? buildDecoration(def.kind, def.variant);
  const jarK = Math.min(1.25, Math.max(0.55, JAR.innerRadius / 1.0));
  obj.scale.setScalar(0.72 * jarK);
  return obj;
}

// While an ingredient is selected the tweezers hover wherever the cursor is over
// the substrate, so you can see exactly where the next piece will go.
let handCarrying = null;
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons) return; // mid-drag: the user is turning the jar, not aiming
  if (activeTool !== "place" || selected.group !== "decor" || !hasBase(state)) {
    hand.hide();
    handCarrying = null;
    return;
  }
  const hit = studio.raycast({ x: e.clientX, y: e.clientY }, surfaceTargets());
  if (!hit) {
    hand.hide();
    return;
  }
  if (handCarrying !== selected.id) {
    handCarrying = selected.id;
    const def = DECORATIONS.find((d) => d.id === selected.id);
    hand.carry(def ? handPreview(def) : null);
  }
  hand.hoverTo(hit.point);
});
canvas.addEventListener("pointerleave", () => hand.hide());

studio.setTapHandler((screen) => {
  if (focusMode && radialOpen) return;
  if (focusMode && !focusToolArmed) {
    openRadial();
    return;
  }
  if (focusMode) focusToolArmed = false;
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
  document.body.classList.remove("tab-sculpt", "tab-paint", "tab-decor", "tab-scene");
  document.body.classList.add(`tab-${tab}`);
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

function persistComfort() {
  localStorage.setItem(COMFORT_KEY, JSON.stringify(comfort));
}

function applyComfortSettings() {
  document.body.classList.toggle("soft-ui", comfort.softUi);
  document.body.classList.toggle("reduced-motion", comfort.reducedMotion);
  document.documentElement.style.setProperty("--hud-alpha", `${Math.max(0.55, Math.min(1, comfort.opacity / 100))}`);
  if (worldEffects.root) worldEffects.root.visible = !comfort.reducedMotion;
  const soft = document.getElementById("comfort-soft");
  const motion = document.getElementById("comfort-motion");
  const opacity = document.getElementById("comfort-opacity");
  const sound = document.getElementById("comfort-sound");
  if (soft) soft.checked = comfort.softUi;
  if (motion) motion.checked = comfort.reducedMotion;
  if (opacity) opacity.value = comfort.opacity;
  if (sound) sound.checked = comfort.sound;
  if (typeof soundBtn !== "undefined" && soundBtn.classList.contains("is-active") !== comfort.sound) {
    const on = toggleAmbience();
    soundBtn.classList.toggle("is-active", on);
  }
}

function openRadial() {
  radialOpen = true;
  document.getElementById("radial-menu")?.classList.remove("hidden");
}

function closeRadial() {
  radialOpen = false;
  document.getElementById("radial-menu")?.classList.add("hidden");
}

function focusPlantTool() {
  activeCat = "plants";
  const plant = DECORATIONS.find((item) => item.cat === "plants" && isKindUnlocked(game, item.kind));
  if (plant) selected = { group: "decor", id: plant.id };
  renderStrip();
  selectTab("decor");
  selectTool("place");
  flashHint("একটি গাছ বেছে জারের ভেতরে ট্যাপ করো।");
}

function chooseRadialAction(action) {
  closeRadial();
  focusToolArmed = action !== "photo";
  if (action === "plant") focusPlantTool();
  else if (action === "water" || action === "mist") {
    selectTab("decor");
    selectTool(action);
    flashHint(action === "water" ? "জারের মাটিতে ট্যাপ করে পানি দাও।" : "কাচে ট্যাপ করে স্প্রে করো।");
  } else if (action === "decor") {
    selectTab("decor");
    selectTool("place");
    flashHint("একটি সাজানোর জিনিস বেছে জারে ট্যাপ করো।");
  } else if (action === "photo") {
    document.getElementById("photo-panel")?.classList.remove("hidden");
    renderPhotoFilters();
  }
}

function setFocusMode(on = !focusMode) {
  focusMode = on;
  document.body.classList.toggle("focus-mode", focusMode);
  document.getElementById("focus-hud")?.classList.toggle("hidden", !focusMode);
  document.getElementById("focus-btn")?.classList.toggle("is-active", focusMode);
  const button = document.getElementById("focus-btn");
  if (button) button.textContent = t(focusMode ? "ফোকাস থেকে বের হও" : "ফোকাস");
  document.getElementById("more-menu")?.classList.add("hidden");
  if (focusMode) studio.resetView?.();
  closeRadial();
}

function runTutorialStep() {
  const tutorial = getTutorial(game);
  if (!tutorial) return;
  if (tutorial.action === "layer") {
    activeCat = "base";
    selected = { group: "base", id: BASE_LAYERS[0].id };
    selectTab("decor");
    renderStrip();
    flashHint("প্রথম বেস স্তরটি বেছে জারে ট্যাপ করো।");
  } else if (tutorial.action === "soil") {
    activeCat = "base";
    selected = { group: "base", id: "soil" };
    selectTab("decor");
    renderStrip();
    flashHint("মাটি বেছে জারে ট্যাপ করো।");
  } else if (tutorial.action === "plant") {
    focusPlantTool();
  } else if (tutorial.action === "water" || tutorial.action === "mist") {
    selectTab("decor");
    selectTool(tutorial.action);
  } else if (tutorial.action === "light") {
    refreshJarSwatches();
    jarPanelEl.classList.remove("hidden");
  }
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
  // nudge the player toward step 2 of the flow: items are waiting in the tray
  // but the build hasn't started yet
  buildToggleEl.classList.toggle("is-ready", n > 0 && !buildMode);
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
      const locked = group === "decor" && !isKindUnlocked(game, item.kind);
      const card = document.createElement("button");
      card.className = "item-chip";
      card.dataset.id = item.id;
      card.classList.toggle("is-locked", locked);
      const inTray = tray.has(favKey);
      card.innerHTML =
        `<span class="fav-btn ${favs.has(favKey) ? "is-fav" : ""}" title="পছন্দ">${favs.has(favKey) ? "♥" : "♡"}</span>` +
        `<span class="tray-btn ${inTray ? "is-in" : ""}" title="${t("ট্রে")}">${inTray ? "✓" : "＋"}</span>` +
        `<img class="item-img" draggable="false" src="${iconFor(group, item)}" alt="">` +
        `<span class="item-label">${tLabel(item.label)}</span>` +
        (locked ? `<span class="item-lock">🔒</span>` : "");
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
        const added = !tray.has(favKey);
        toggleTray(favKey);
        if (added) {
          playSfx("plop");
          flyTo(card, buildToggleEl, iconFor(group, item));
        }
        updateTrayUI();
        renderStrip();
      });

      const isBtn = (el) =>
        el.classList.contains("fav-btn") || el.classList.contains("tray-btn");
      card.addEventListener("pointerdown", (e) => {
        if (isBtn(e.target) || locked) return;
        beginChipDrag(group, item, e);
      });
      card.addEventListener("click", (e) => {
        if (isBtn(e.target)) return;
        if (chipDrag?.ghost) return; // was a drag, not a click
        if (locked) {
          const unlock = UNLOCKS.find((entry) => entry.kind === item.kind);
          flashHint(
            getLang() === "bn"
              ? `লেভেল ${toUiDigits(unlock?.level ?? 2)}-এ এটি আনলক হবে।`
              : `Unlocks at level ${unlock?.level ?? 2}.`,
          );
          return;
        }
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

function loadBuildData(build, { history = true } = {}) {
  if (!build) return;
  if (history) snapshot();
  Object.assign(jarCustom, { frame: null, glass: null, w: 1, h: 1 }, build.custom ?? {});
  Object.assign(jarLight, { on: false, height: 0.55, bright: 0.6, color: 0xffe4bc }, build.jarLight ?? {});
  state.layers.length = 0;
  state.layers.push(...(build.layers ?? []));
  state.decorations.length = 0;
  state.decorations.push(...(build.decorations ?? []));
  state.terrain.fill(0);
  state.terrain.set(build.terrain ?? []);
  state.terrainMat.fill(255);
  if (build.terrainMat) state.terrainMat.set(build.terrainMat);
  state.painted = build.painted ?? false;
  if (build.themeId) setTheme(build.themeId, false);
  if (build.seasonId) {
    seasonId = build.seasonId;
    game.season = seasonId;
  }
  if (build.weatherId) setWeather(build.weatherId, false);
  if (typeof build.timeOfDay === "number") {
    timeOfDay = build.timeOfDay;
    studio.setTimeOfDay?.(timeOfDay);
  }
  if (typeof build.cycleEnabled === "boolean") cycleEnabled = build.cycleEnabled;
  if (build.cosmeticPack) applyCosmeticPack(build.cosmeticPack);
  wetLevel = build.wetLevel ?? 0;
  setJar(build.jarId ?? currentJarId);
  document.getElementById("jar-w").value = Math.round(jarCustom.w * 100);
  document.getElementById("jar-h").value = Math.round(jarCustom.h * 100);
  document.getElementById("light-h").value = Math.round(jarLight.height * 100);
  document.getElementById("light-b").value = Math.round(jarLight.bright * 100);
  lightToggleEl.textContent = t(jarLight.on ? "চালু" : "বন্ধ");
  lightToggleEl.classList.toggle("is-on", jarLight.on);
  rebuildJarLight();
  mistGroup.clear();
  fxGroup.clear();
  hidePour();
  rebuildAll();
  renderGameHud();
  renderStrip();
  renderThemePanel();
  studio.markInteraction();
}

function restoreAutosave() {
  const payload = loadAutosave();
  if (!payload?.build) return;
  if (payload.game) hydrateGameState(game, payload.game);
  loadBuildData(payload.build);
  flashHint(getLang() === "bn" ? "শেষ অটোসেভ ফেরত আনা হয়েছে।" : "Last autosave restored.");
  playSfx("save");
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
      gameAction("save");
      playSfx("save");
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
      loadBuildData({
        jarId: e.jarId,
        custom: e.custom,
        layers: e.layers,
        decorations: e.decorations,
        terrain: e.terrain,
        terrainMat: e.terrainMat,
        painted: e.painted,
      });
      galleryEl.classList.add("hidden");
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

document.getElementById("community-btn").addEventListener("click", openSocial);
document.getElementById("social-close").addEventListener("click", closeSocial);
document.getElementById("social-refresh").addEventListener("click", refreshSocialFeed);
document.querySelectorAll(".social-tab").forEach((button) => {
  button.addEventListener("click", () => selectSocialTab(button.dataset.socialTab));
});
document.querySelectorAll(".auth-mode").forEach((button) => {
  button.addEventListener("click", () => {
    socialAuthMode = button.dataset.authMode;
    document.querySelectorAll(".auth-mode").forEach((item) => item.classList.toggle("is-active", item === button));
    document.getElementById("social-display-name").classList.toggle("hidden", socialAuthMode !== "signup");
    document.getElementById("social-display-name").required = socialAuthMode === "signup";
    document.getElementById("social-auth-submit").textContent = socialMessage(
      socialAuthMode === "signup" ? "অ্যাকাউন্ট খোলো" : "সাইন ইন",
      socialAuthMode === "signup" ? "Create account" : "Sign in",
    );
  });
});
document.getElementById("social-auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = document.getElementById("social-auth-submit");
  submit.disabled = true;
  try {
    const email = document.getElementById("social-email").value.trim();
    const password = document.getElementById("social-password").value;
    if (socialAuthMode === "signup") {
      const result = await social.signUp({
        email,
        password,
        displayName: document.getElementById("social-display-name").value.trim(),
      });
      socialStatus(result.needsVerification ? socialMessage("ইমেইল ভেরিফাই করে আবার সাইন ইন করো।", "Verify your email, then sign in.") : socialMessage("অ্যাকাউন্ট তৈরি হয়েছে।", "Account created."));
    } else {
      await social.signIn({ email, password });
      socialStatus(socialMessage("সাইন ইন সফল হয়েছে।", "Signed in successfully."));
    }
    await renderSocialAccount();
    await refreshSocialFeed();
  } catch (error) {
    socialStatus(error.message, true);
  } finally {
    submit.disabled = false;
  }
});
document.getElementById("social-signout").addEventListener("click", async () => {
  await social.signOut();
  await renderSocialAccount();
  await refreshSocialFeed();
  socialStatus(socialMessage("সাইন আউট হয়েছে।", "Signed out."));
});
document.getElementById("social-publish-current").addEventListener("click", openPublish);
document.getElementById("publish-close").addEventListener("click", () => document.getElementById("publish-modal").classList.add("hidden"));
document.getElementById("publish-form").addEventListener("submit", publishCurrent);

document.getElementById("restore-autosave").addEventListener("click", restoreAutosave);
// The progress panel starts folded to a single line: the terrarium is what the
// screen is for, and level/XP/care are a glance away rather than a wall.
const PROGRESS_OPEN_KEY = "potroneer-progress-open";
function setProgressOpen(open) {
  const panel = document.getElementById("game-panel");
  panel.classList.toggle("is-collapsed", !open);
  document.getElementById("game-panel-toggle").textContent = open ? "−" : "+";
  try {
    localStorage.setItem(PROGRESS_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private mode — the panel just reverts to folded next session */
  }
}
document.getElementById("game-panel-toggle").addEventListener("click", () => {
  setProgressOpen(document.getElementById("game-panel").classList.contains("is-collapsed"));
});
try {
  setProgressOpen(localStorage.getItem(PROGRESS_OPEN_KEY) === "1");
} catch {
  setProgressOpen(false);
}

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
  game.care.light = jarLight.on ? Math.max(game.care.light, 0.72) : Math.min(game.care.light, 0.5);
  gameAction("light");
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
  const context = document.getElementById("item-context");
  const definition = DECORATIONS.find((item) => item.id === rec.id);
  if (context) context.textContent = definition ? tLabel(definition.label) : t("নির্বাচিত আইটেম");
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
    // Icon buttons keep their glyph: only the label span gets rewritten, and
    // the tooltip follows so the icon-only layout stays readable.
    const label = t(el.dataset.i18n);
    const target = el.querySelector(".nav-text");
    if (target) target.textContent = label;
    else el.textContent = label;
    if (el.hasAttribute("title")) el.title = label;
  });
  searchEl.placeholder = t("খোঁজো…");
  const cat = CATEGORIES.find((c) => c.id === activeCat);
  if (cat) catBtnEl.querySelector(".cat-name").textContent = t(cat.label);
  renderTools();
  renderStrip();
  updateHint();
  renderGameHud();
  updateTrayUI();
}

langBtn.addEventListener("click", () => {
  setLang(getLang() === "bn" ? "en" : "bn");
  applyLang();
});

// Hint-bar elements and the digit map: declared before the init block below
// because applyLang()/updateHint() run during the first paint and read them.
// (In English the hint step number is transliterated, so booting in English
// used to hit this const before it was initialised.)
const BN_DIGITS = { "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6" };
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
renderGameHud();

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

const PHOTO_FILTERS = [
  { id: "natural", label: "Natural", css: "none" },
  { id: "film", label: "Film", css: "contrast(1.08) saturate(0.86) sepia(0.12)" },
  { id: "moss", label: "Moss", css: "saturate(1.2) hue-rotate(12deg) brightness(1.04)" },
  { id: "moon", label: "Moon", css: "contrast(1.1) saturate(0.72) hue-rotate(190deg) brightness(0.96)" },
];
let photoFilterId = "natural";
function renderPhotoFilters() {
  const el = document.getElementById("photo-filters");
  if (!el) return;
  el.innerHTML = "";
  PHOTO_FILTERS.forEach((filter) => {
    const button = document.createElement("button");
    button.className = `photo-filter${filter.id === photoFilterId ? " is-active" : ""}`;
    button.textContent = filter.label;
    button.addEventListener("click", () => { photoFilterId = filter.id; renderPhotoFilters(); });
    el.append(button);
  });
}
async function captureFilteredPhoto() {
  const source = studio.capture();
  const filter = PHOTO_FILTERS.find((item) => item.id === photoFilterId) || PHOTO_FILTERS[0];
  const img = new Image();
  await new Promise((resolve) => { img.onload = resolve; img.src = source; });
  const output = document.createElement("canvas");
  output.width = img.width;
  output.height = img.height;
  const context = output.getContext("2d");
  context.filter = filter.css;
  context.drawImage(img, 0, 0);
  if (photoFilterId === "moon") {
    const vignette = context.createRadialGradient(img.width / 2, img.height / 2, img.width * 0.2, img.width / 2, img.height / 2, img.width * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(4,8,20,.34)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, img.width, img.height);
  }
  return output.toDataURL("image/png");
}
document.getElementById("photo").addEventListener("click", () => {
  document.getElementById("photo-panel").classList.remove("hidden");
  renderPhotoFilters();
});
document.getElementById("photo-close").addEventListener("click", () => document.getElementById("photo-panel").classList.add("hidden"));
document.getElementById("photo-capture").addEventListener("click", async () => {
  const a = document.createElement("a");
  a.href = await captureFilteredPhoto();
  a.download = `potroneer-${photoFilterId}-${Date.now()}.png`;
  a.click();
  unlockGameAchievement("photographer");
  flashHint("ছবি সেভ হয়ে গেছে! বন্ধুদের দেখাও।");
});

const themePanelEl = document.getElementById("theme-panel");
document.getElementById("theme-btn").addEventListener("click", () => {
  themePanelEl.classList.toggle("hidden");
  renderThemePanel();
});
document.getElementById("theme-close").addEventListener("click", () => themePanelEl.classList.add("hidden"));

// How far photo backdrops are pushed behind the glass. Remembered across
// sessions: how much background a person can live with is a personal setting.
const CALM_KEY = "potroneer-backdrop-calm";
const calmInput = document.getElementById("backdrop-calm");
function applyBackdropCalm(value, save = true) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  calmInput.value = v;
  studio.setBackdropCalm?.(v / 100);
  if (!save) return;
  try {
    localStorage.setItem(CALM_KEY, String(v));
  } catch {
    /* private mode — the slider just resets next session */
  }
}
calmInput.addEventListener("input", (event) => applyBackdropCalm(event.target.value));
try {
  applyBackdropCalm(localStorage.getItem(CALM_KEY) ?? 45, false);
} catch {
  applyBackdropCalm(45, false);
}
document.getElementById("season-select").addEventListener("change", (event) => setSeason(event.target.value));
document.getElementById("weather-select").addEventListener("change", (event) => setWeather(event.target.value));
document.getElementById("time-cycle-toggle").addEventListener("change", (event) => {
  cycleEnabled = event.target.checked;
  scheduleAutosave();
});
document.getElementById("time-cycle").addEventListener("input", (event) => {
  timeOfDay = Number(event.target.value) / 100;
  studio.setTimeOfDay?.(timeOfDay);
  cycleEnabled = false;
  document.getElementById("time-cycle-toggle").checked = false;
  scheduleAutosave();
});

const achievementsModal = document.getElementById("achievements-modal");
document.getElementById("achievements-btn").addEventListener("click", () => { renderAchievements(); achievementsModal.classList.remove("hidden"); });
document.getElementById("achievements-close").addEventListener("click", () => achievementsModal.classList.add("hidden"));

const coopModal = document.getElementById("coop-modal");
document.getElementById("coop-btn").addEventListener("click", () => coopModal.classList.remove("hidden"));
document.getElementById("coop-close").addEventListener("click", () => coopModal.classList.add("hidden"));
document.getElementById("coop-join").addEventListener("click", joinCoopRoom);
document.getElementById("coop-leave").addEventListener("click", leaveCoopRoom);

async function joinCoopRoom() {
  const input = document.getElementById("coop-room");
  const room = (input.value.trim() || Math.random().toString(36).slice(2, 8)).toUpperCase();
  input.value = room;
  const status = document.getElementById("coop-status");
  try {
    const result = await social.joinCoop(room, (payload) => {
      if (!payload || payload.sender === socialUser?.id || !payload.build) return;
      coopApplying = true;
      if (payload.game) hydrateGameState(game, payload.game);
      loadBuildData(payload.build, { history: false });
      coopApplying = false;
      renderGameHud();
    }, (members) => { status.textContent = `${members} ${members === 1 ? "gardener" : "gardeners"} connected`; });
    coopRoom = room;
    status.textContent = result.demo ? `Demo room ${room} — sign in for live co-op` : `Room ${room} connected`;
    unlockGameAchievement("team-gardener");
    scheduleAutosave();
  } catch (error) {
    status.textContent = error.message;
  }
}
async function leaveCoopRoom() {
  await social.leaveCoop();
  coopRoom = null;
  document.getElementById("coop-status").textContent = "Co-op room closed";
}

const soundBtn = document.getElementById("sound");
soundBtn.addEventListener("click", () => {
  const on = toggleAmbience();
  soundBtn.classList.toggle("is-active", on); // keep the text label, highlight when on
  comfort.sound = on;
  persistComfort();
});

const moreBtn = document.getElementById("more-btn");
const moreMenu = document.getElementById("more-menu");
moreBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  moreMenu.classList.toggle("hidden");
});
document.getElementById("focus-btn").addEventListener("click", () => setFocusMode());
document.getElementById("focus-exit").addEventListener("click", () => setFocusMode(false));
document.getElementById("focus-quick").addEventListener("click", openRadial);
document.getElementById("calm-camera").addEventListener("click", () => {
  studio.resetView?.();
  flashHint("ক্যামেরা কেন্দ্রে ফিরে এসেছে।");
});
document.querySelectorAll("[data-radial-action]").forEach((button) => {
  button.addEventListener("click", () => chooseRadialAction(button.dataset.radialAction));
});
document.getElementById("game-tutorial-cta").addEventListener("click", runTutorialStep);

const comfortModal = document.getElementById("comfort-modal");
document.getElementById("comfort-btn").addEventListener("click", () => {
  moreMenu.classList.add("hidden");
  comfortModal.classList.remove("hidden");
  applyComfortSettings();
});
document.getElementById("comfort-close").addEventListener("click", () => comfortModal.classList.add("hidden"));
document.getElementById("comfort-soft").addEventListener("change", (event) => {
  comfort.softUi = event.target.checked;
  applyComfortSettings();
  persistComfort();
});
document.getElementById("comfort-motion").addEventListener("change", (event) => {
  comfort.reducedMotion = event.target.checked;
  applyComfortSettings();
  persistComfort();
});
document.getElementById("comfort-opacity").addEventListener("input", (event) => {
  comfort.opacity = Number(event.target.value);
  applyComfortSettings();
  persistComfort();
});
document.getElementById("comfort-sound").addEventListener("change", (event) => {
  comfort.sound = event.target.checked;
  if (soundBtn.classList.contains("is-active") !== comfort.sound) {
    const on = toggleAmbience();
    soundBtn.classList.toggle("is-active", on);
  }
  persistComfort();
});
document.getElementById("comfort-camera").addEventListener("click", () => {
  studio.resetView?.();
  comfortModal.classList.add("hidden");
  flashHint("ক্যামেরা শান্ত অবস্থায় ফিরে এসেছে।");
});
applyComfortSettings();

window.addEventListener("pointerdown", (event) => {
  if (!moreMenu.contains(event.target) && event.target !== moreBtn) moreMenu.classList.add("hidden");
  if (radialOpen && !document.getElementById("radial-menu").contains(event.target) && event.target !== canvas) closeRadial();
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
  game.care.water = 0.52;
  game.care.humidity = 0.46;
  game.care.light = jarLight.on ? 0.75 : 0.48;
  game.care.soil = 0.32;
  game.care.health = 0.72;
  game.care.growth = 0;
  placePickPlane(JAR.floorY);
  tweens.length = 0;
  updateHint();
  scheduleAutosave();
  renderGameHud();
  studio.markInteraction();
});

updateHint();
renderGameHud();
renderThemePanel();
renderAchievements();
applyThemeSkin(themeById(currentThemeId));
studio.setTheme?.(currentThemeId);
worldEffects.setTheme(themeById(currentThemeId));
worldEffects.setWeather(weatherId);
studio.setTimeOfDay?.(timeOfDay);

// Open a shared cloud terrarium or an encoded local demo link when the app is
// launched from a social URL.
social.loadFromUrl().then((record) => {
  if (!record?.data) return;
  loadBuildData(record.data, { history: false });
  flashHint(socialMessage("শেয়ার করা টেরারিয়াম লোড হয়েছে।", "Shared terrarium loaded."));
}).catch(() => {});
renderSocialAccount().catch(() => {});

// --- intro hand-off --------------------------------------------------------
// The scene is built and the HUD is populated, so the intro's Enter button can
// go live. Anything slow left over (GLB models, shared links) keeps streaming
// in behind the studio, which is fine — the jar is already usable.
introReady();

onIntroDone(({ audioOn }) => {
  // The intro's speaker button already counts as the gesture WebAudio needs, so
  // carrying that choice into the ambience keeps the sound continuous.
  if (audioOn && !comfort.sound) {
    const on = toggleAmbience();
    soundBtn.classList.toggle("is-active", on);
    comfort.sound = on;
    persistComfort();
  }
  studio.markInteraction?.();
  flashHint("জার ঘোরাতে টেনে ধরো — নিচের তাক থেকে জিনিস বেছে নাও।");
});

document.getElementById("intro-replay")?.addEventListener("click", () => {
  moreMenu.classList.add("hidden");
  replayIntro();
});
