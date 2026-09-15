import { startIntro, introReady, onIntroDone, replayIntro } from "./intro.js";
import * as THREE from "three";
import { createStudio } from "./scene.js";
import {
  buildJar,
  buildPickPlane,
  jarInnerSilhouette,
  jarSectionFor,
  geoFootprint,
  geoSpecFor,
  JAR_TYPES,
  JAR_BY_ID,
} from "./jar.js";
import {
  buildLayer,
  buildDecoration,
  buildTerrainCap,
  updateTerrainCap,
  buildJarLamp,
} from "./builders.js";
import {
  BASE_LAYERS,
  BASE_BY_ID,
  unitsToMm,
  DECORATIONS,
  CATEGORIES,
  CLEANUP_KINDS,
  HABITATS,
} from "./catalog.js";
import {
  createState,
  addLayer,
  addDecoration,
  reset as resetState,
  substrateBase,
  substrateTop,
  hasBase,
  remainingHeight,
  setJarInterior,
  heightAt,
  sculpt,
  flatten,
  paintMaterial,
  jarRadiusAt,
  clampInsideAt,
  jarGridR,
  clampLayerMm,
  layerMmAdvice,
  remainingMm,
  insideJarAt,
  jarPointAt,
  jarReach,
  JAR,
} from "./state.js";
import { toggleAmbience, playSfx, setVolume, isPlaying } from "./ambience.js";
import { decorationIcon, baseIcon, jarIcon } from "./icons.js";
import { t, tLabel, getLang, setLang } from "./i18n.js";
import { preloadModels, getModelClone, getJarModelInterior } from "./models.js";
import { createHand } from "./hand.js";
import { createCursorGhost } from "./ghost.js";
import { createHandles } from "./handles.js";
import { createBaseShadow } from "./baseshadow.js";
import { createHighlight } from "./highlight.js";
import {
  claimChallengeReward,
  PLANT_KINDS,
  MOSS_KINDS,
  UNLOCKS,
  getChallenge,
  getTutorial,
  isTutorialComplete,
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
import { toast, floatText, burst, flyTo, centerTop, impact } from "./juice.js";
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
import { TABLES, tableById } from "./tables.js";
import { wireDialogs, wireTabs } from "./a11y.js";

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

// A window onto the live scene for development only. `import.meta.env.DEV` is
// statically false in a production build, so this whole block is dropped from
// the bundle rather than shipped behind a runtime check. It exists because the
// interesting questions about this app ("is that substrate actually inside the
// glass?") are answered by measuring the scene graph, not by looking at it.
if (import.meta.env.DEV) {
  window.__potroneer = {
    THREE,
    studio,
    get state() { return state; },
    get jarId() { return currentJarId; },
    get jarGroup() { return jarGroup; },
    get substrate() { return substrateGroup; },
    get terrainCap() { return terrainCap; },
    get pickPlane() { return pickPlane; },
    get baseShadow() { return baseShadow; },
    setJar: (id) => setJar(id),
    // The live interior, reached through *this* module's import. Importing
    // state.js separately from a console gets a second instance with its own
    // JAR — Vite serves versioned module URLs — and measuring the scene
    // against that one silently compares the jar on screen to a default.
    JAR,
    jarReach,
    jarPointAt,
  };
}

// The builder's hand: tweezers pinched over the jar, following the cursor while
// an ingredient is selected and dipping in to release it — the real gesture the
// reference clips are all built around. It lives in scene space, not `world`,
// so it always reaches in over the player's shoulder however the jar is turned.
const hand = createHand();
studio.scene.add(hand.group);

// The cursor ghost rides in `world`, on the substrate, so it turns with the jar.
const cursorGhost = createCursorGhost();
studio.world.add(cursorGhost.group);

// Handles ride in `world` too, so they stay pinned to their pieces as it turns.
const handles = createHandles();
studio.world.add(handles.group);

// The substrate marker: the one thing you can be holding that has no shape of
// its own to preview. Also in `world`, so the outline stays welded to the
// vessel's footprint however the jar is turned.
const baseShadow = createBaseShadow();
studio.world.add(baseShadow.group);

// The shell around whichever piece a press would act on. In `world` beside the
// decorations it is tracking, so it turns with them.
const hoverHighlight = createHighlight();
studio.world.add(hoverHighlight.group);
let handFrame = performance.now();
let lastZoomSync = 0;
const state = createState();
const social = createSocialClient();
const worldEffects = createWorldEffects(studio.world);
let socialUser = null;
let socialActiveTab = "explore";
let socialAuthMode = "signin";
let socialRecords = [];
let socialMineRecords = [];
let pendingRemixOf = null;
// The co-op room an invite link or the join box is pointing at, so the account
// gate can show which room it is asking you to join.
let pendingRoomInvite = null;
// A photo world by default: the studio sweep is still one tap away in থিম ▸ আঁকা.
let currentThemeId = "sunlit-adobe-room";
let tableStyleId = "oak";
let seasonId = "spring";
let weatherId = "clear";
let cycleEnabled = true;
let timeOfDay = 0.52;
// The co-op room as { id, code }, or null. `coopRevision` is the highest
// revision this client has sent or applied; `coopLocalBuild` is the solo jar
// stashed on the way in, so leaving gives it back rather than stranding you in
// somebody else's garden.
let coopRoom = null;
let coopApplying = false;
let coopRevision = 0;
let coopPersistTimer = null;
let coopLocalBuild = null;
let coopStatus = "disconnected";
let coopTimer = null;
// Chosen pour depth per base material, in millimetres. Declared up here with
// the other start-up state because `updateToolStatus` reads it through
// renderDepth() and runs during start-up — a `let` further down the file would
// be a TDZ throw that silently aborts the rest of main.js.
const DEPTH_KEY = "potroneer-layer-mm";
let layerMm = {};
try {
  layerMm = JSON.parse(localStorage.getItem(DEPTH_KEY) || "{}");
} catch {
  layerMm = {};
}

const COMFORT_KEY = "potroneer-comfort";
let savedComfort = {};
try {
  savedComfort = JSON.parse(localStorage.getItem(COMFORT_KEY) || "{}");
} catch {
  savedComfort = {};
}
// What the operating system already knows about this person. Someone who has
// asked their OS for less motion has asked *us* too — they should not have to
// find a checkbox in here before the jar stops spinning at them. The saved
// object still wins, so an explicit in-app choice survives either way.
const prefers = (q) => window.matchMedia?.(q).matches ?? false;
const comfort = {
  softUi: true,
  reducedMotion: prefers("(prefers-reduced-motion: reduce)"),
  reducedTransparency: prefers("(prefers-reduced-transparency: reduce)"),
  highContrast: prefers("(prefers-contrast: more)"),
  textScale: 100,
  opacity: 88,
  sound: false,
  volume: 50,
  // "auto" reads the machine once on first run and picks for you; an explicit
  // choice in the panel pins it to "high"/"low" and stops guessing.
  quality: "auto",
  clickSound: true,
  ...savedComfort,
};

// A first guess at what this machine can carry, used only while `quality` is
// still "auto". Core count and device memory are the two hints browsers
// actually give us, and a phone is assumed to be the tighter budget of the
// two. Nothing here is authoritative — it only decides which setting the panel
// opens on, and one tap overrides it forever.
function guessQuality() {
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory ?? 8;
  const phone = window.matchMedia?.("(max-width: 700px)").matches ?? false;
  if (cores <= 4 || memory <= 4) return "low";
  if (phone && cores <= 6) return "low";
  return "high";
}

// The quality every renderer-side decision reads, with "auto" already resolved.
function qualityLevel() {
  return comfort.quality === "auto" ? guessQuality() : comfort.quality;
}

// How many of a purely decorative thing to spawn. Splashes, condensation
// droplets and sparkles all go through here so that one setting thins all of
// them at once, and so none of them can be thinned to nothing — feedback that
// disappears entirely reads as a bug, not as a performance mode.
function particleBudget(n) {
  return qualityLevel() === "low" ? Math.max(1, Math.round(n * 0.45)) : n;
}
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
// The hinged pane on the geometric jars: {pivot, knob, sign, max}. Opening it
// is purely a scene-graph rotation, so it works the same mid-build and after.
let jarDoor = null;
let jarDoorOpen = false;
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

// The interior the builders fill for this vessel, in world units.
//
// Procedural jars are described by the numbers that also build them, so the
// customiser's width/height sliders scale those numbers directly. A GLB
// terrarium is a fixed object: its interior is *measured* off the mesh (see
// models.js) rather than declared, the sliders don't apply, and the vessel is
// centred on the origin so any size of model frames the same way.
function jarInterior(type) {
  if (type.modelJar) {
    const m = getJarModelInterior(type.id);
    if (m) {
      const bottomY = -m.modelHeight / 2;
      return {
        innerRadius: m.innerRadius,
        bodyHeight: m.bodyHeight,
        floorY: bottomY + m.floorY,
        wallThickness: m.wallThickness,
        stretchX: m.stretchX,
        footprint: m.footprint,
        modelBottomY: bottomY,
        vesselTop: bottomY + m.modelHeight,
      };
    }
  }
  const it = {
    ...type.interior,
    innerRadius: type.interior.innerRadius * jarCustom.w,
    bodyHeight: type.interior.bodyHeight * jarCustom.h,
    floorY: type.interior.floorY * jarCustom.h,
  };
  // A framed geometric vessel is a polygon, not a circle: substrate has to take
  // its outline, and its spire/flare stands above the body the camera would
  // otherwise frame on.
  const spec = geoSpecFor(type.id);
  if (spec) it.footprint = geoFootprint(spec);
  return it;
}

function setJar(typeId) {
  const type = JAR_BY_ID[typeId];
  if (!type) return;
  currentJarId = typeId;
  const it = jarInterior(type);
  // Seed the interior before building, so anything the build reads has sane
  // metrics; the section is refined from the actual glass a few lines down.
  setJarInterior(it, jarInnerSilhouette(typeId, it), null);

  if (jarGroup) studio.world.remove(jarGroup);
  if (pickPlane) studio.world.remove(pickPlane);

  const built = buildJar(typeId, studio.envMap, it);
  jarBuilt = built;
  // Now that the glass exists, take the interior from the panes themselves
  // rather than from the numbers that described them. Everything that fills the
  // jar reads this one table, so what the preview draws, what the substrate is
  // lofted against and where a tap is allowed to land cannot disagree.
  const glassMeshes = [];
  const glassMatSet = new Set(built.glassMats || []);
  built.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Panes only. Stands, cradles, trays and frame struts are furniture, and
    // measuring against them would wall the substrate off from its own jar.
    if (mats.some((m) => glassMatSet.has(m))) glassMeshes.push(o);
  });
  setJarInterior(it, jarInnerSilhouette(typeId, it), jarSectionFor(typeId, it, glassMeshes));
  jarBuilt.frameOrig = built.frameMats.map((m) => m.color.clone());
  applyJarColors();
  jarGroup = built.group;
  jarGlass = built.glass;
  jarDoor = built.door ?? null;
  studio.world.add(jarGroup);

  pickPlane = buildPickPlane(substrateBase());
  studio.world.add(pickPlane);
  baseShadow.invalidate(); // a new vessel means a new footprint to trace

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
  // A model terrarium already sits on its own measured base, so the board goes
  // there; everything else meets the board at its interior floor.
  const targetBottom = it.modelBottomY ?? fallbackBottom;
  jarGroup.position.y += targetBottom - actualBottom;
  studio.setBaseY(targetBottom);
  // Frame the camera on *this* vessel: a bell jar and a shallow bowl should
  // both fill the shot, rather than sharing one distance that suits neither.
  // Measure the top off the mesh where there is one — a kite's spire and a
  // slanted crown both stand well above the body the interior describes, and
  // framing on the interior alone crops them off.
  const declaredTop = it.vesselTop ?? it.floorY + it.bodyHeight + (type.lid ? 0.55 : 0.3);
  const measuredTop = hasVisibleVessel && Number.isFinite(jarBounds.max.y)
    ? jarBounds.max.y + (targetBottom - actualBottom)
    : -Infinity;
  const vesselTop = Math.max(declaredTop, measuredTop);
  // The widest this vessel ever gets from its own axis, measured off the mesh.
  // The turntable turns it, so the shot has to hold the *largest* horizontal
  // extent rather than whichever face happens to be pointing at us — otherwise
  // a glass house or a bottle on its side crops itself part-way through a spin.
  const horizontalRadius = hasVisibleVessel && Number.isFinite(jarBounds.max.x)
    ? Math.max(
        Math.hypot(jarBounds.max.x, jarBounds.max.z),
        Math.hypot(jarBounds.min.x, jarBounds.min.z),
        Math.hypot(jarBounds.max.x, jarBounds.min.z),
        Math.hypot(jarBounds.min.x, jarBounds.max.z),
      )
    : Math.max(it.innerRadius * (it.stretchX || 1), it.innerRadius);
  studio.frameJar(
    (targetBottom + vesselTop) / 2,
    Math.max(1.6, vesselTop - targetBottom),
    { radius: horizontalRadius },
  );

  // A jar without a door can't be left ajar; one with a door keeps whatever the
  // player last chose across a rebuild (the width/height sliders rebuild too).
  // Restored after framing, so a pane standing open never widens the shot.
  if (!jarDoor) jarDoorOpen = false;
  else jarDoor.pivot.rotation.y = jarDoorOpen ? jarDoor.sign * jarDoor.max : 0;
  syncDoorUi();

  // Fresh dust motes sized to this jar's interior.
  if (motes) studio.world.remove(motes);
  motes = buildMotes(it);
  studio.world.add(motes);

  // The build survives jar changes — you can decorate in the open and slip a
  // jar over it later, like the reference. Just nudge anything that would
  // poke through the new glass back inside the footprint.
  const decY = substrateTop(state);
  state.decorations.forEach((rec) => {
    const inside = clampInsideAt(decY, rec.x, rec.z, 0.1);
    if (inside) {
      rec.x = inside.x;
      rec.z = inside.z;
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

// --- the hinged door -------------------------------------------------------
// Swing the pane open or shut. Nothing about the terrarium inside depends on
// it, so this is legal at any point: while you are still pouring layers, or
// years later on a finished jar.
function setJarDoor(open, { animate = true } = {}) {
  if (!jarDoor) return;
  jarDoorOpen = open;
  const to = open ? jarDoor.sign * jarDoor.max : 0;
  const from = jarDoor.pivot.rotation.y;
  if (!animate || calmMotion()) jarDoor.pivot.rotation.y = to;
  else {
    // Opening swings wide and settles; closing lands with a small bounce, the
    // way a real latch-less pane knocks against its frame.
    tween(open ? 460 : 380, (k) => {
      jarDoor.pivot.rotation.y = from + (to - from) * k;
    }, open ? easeOut : easeOutBack);
  }
  syncDoorUi();
  playSfx(open ? "tap" : "plop");
  studio.markInteraction();
}

function toggleJarDoor() {
  setJarDoor(!jarDoorOpen);
}

// Keep the customiser's door row honest about the current vessel.
function syncDoorUi() {
  const row = document.getElementById("door-row");
  const btn = document.getElementById("door-toggle");
  if (!row || !btn) return;
  row.classList.toggle("hidden", !jarDoor);
  btn.textContent = t(jarDoorOpen ? "খোলা" : "বন্ধ");
  btn.classList.toggle("is-on", jarDoorOpen);
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
  const handDt = Math.min(50, now - handFrame);
  hand.update(now, handDt);
  cursorGhost.update(now, handDt);
  handles.update(now, handDt);
  baseShadow.update(now, handDt, calmMotion());
  hoverHighlight.update(now, handDt, calmMotion());
  handFrame = now;
  syncStrata();
  // The wheel and the pinch move the same zoom the buttons do, so the buttons
  // have to notice when a gesture has reached the end of the range — otherwise
  // they sit enabled and do nothing. Four times a second is plenty for a
  // disabled state and costs nothing.
  if (now - lastZoomSync > 250) {
    lastZoomSync = now;
    syncZoomButtons();
  }
  // Ambient drift — dust in the jar and the weather around it — is
  // scenery, not feedback, so reduced motion stops it at the source rather than
  // just hiding it and leaving the maths running. Checked per frame because a
  // new jar rebuilds the motes with their visibility fresh.
  const calm = calmMotion();
  if (motes) motes.visible = !calm;
  if (!calm) {
    animateMotes(now);
    worldEffects.update(now);
  }
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
  // The outline is not a circle, so it cannot be resized by scaling: a bottle's
  // cross-section changes *shape* with height, not just size. Recut it when the
  // surface has moved enough to matter. This runs on substrate changes, not per
  // frame, so rebuilding a 64-gon here costs nothing worth saving.
  if (Math.abs((pickPlane.userData.builtY ?? -1e9) - y) > 0.015) {
    const next = buildPickPlane(y);
    next.position.copy(pickPlane.position);
    studio.world.remove(pickPlane);
    pickPlane.geometry.dispose();
    studio.world.add(next);
    pickPlane = next;
  }
}

// --- rebuild substrate from state -----------------------------------------
let terrainCap = null;

function rebuildSubstrate(animateLast = false) {
  substrateGroup.clear();
  terrainCap = null;
  // The stack starts at the substrate base, not at the jar floor — see
  // substrateBase(). Each layer then starts where the previous one ended;
  // nothing is ever reset back to the floor mid-stack.
  let y = substrateBase();
  state.layers.forEach((layer, idx) => {
    const isTop = idx === state.layers.length - 1;
    // The layer below, so this one's underside can be built as the *same*
    // surface as that one's top rather than a flat disc floating on its peaks.
    const mesh = buildLayer(layer, y, isTop, state.layers[idx - 1] ?? null);
    substrateGroup.add(mesh);
    if (animateLast && isTop) {
      // The layer's vertices carry absolute heights, so scaling the group about
      // the origin would drag it through the floor. Pin the seam instead:
      // y' = k·y + base·(1−k) holds `base` still while the rest rises.
      const base = y;
      const pin = (k) => {
        mesh.scale.y = k;
        mesh.position.y = base * (1 - k);
      };
      pin(0.001);
      tween(360, (p) => pin(0.001 + p * 0.999), easeOut);
    }
    y += layer.height;
  });
  // The sculptable terrain cap rides on the top layer — or, for free-form
  // cursor-painted substrate, directly on the jar floor.
  if (state.layers.length || state.painted) {
    const topDef = state.layers.length
      ? BASE_BY_ID[state.layers[state.layers.length - 1].type]
      : BASE_BY_ID.soil;
    // The cap rides the top layer, so it needs that layer's depth to know how
    // far its skirt may reach without covering the band underneath.
    const topLayer = state.layers[state.layers.length - 1];
    terrainCap = buildTerrainCap(topDef, substrateTop(state), topLayer?.height ?? 0.16);
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

// The comfort "reduced motion" setting, asked of the DOM so the 3D side and
// juice.js are reading the same switch rather than two copies of it.
function calmMotion() {
  return document.body.classList.contains("reduced-motion");
}

// --- undo history ----------------------------------------------------------
// Snapshot the whole build (layers + decorations + terrain) before each
// mutating action; undo pops one and rebuilds the scene from data.
const history = [];
const future = []; // undone states, waiting to be redone

function currentSnapshot() {
  return JSON.stringify({
    jarId: currentJarId,
    layers: state.layers,
    decorations: state.decorations,
    terrain: Array.from(state.terrain),
    terrainMat: Array.from(state.terrainMat),
    painted: state.painted,
  });
}

function snapshot() {
  history.push(currentSnapshot());
  if (history.length > 60) history.shift();
  future.length = 0; // a fresh action ends the redo branch
  updateHistoryUi();
}

function restoreSnapshot(snap) {
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
  updateHistoryUi();
}

// Undo and redo grey out when there is nothing behind or ahead of you, so the
// buttons say what the history actually holds.
function updateHistoryUi() {
  // The rail's pair and the focus HUD's pair are the same two verbs, so they
  // grey out together.
  for (const id of ["undo", "focus-undo"]) {
    document.getElementById(id)?.classList.toggle("is-disabled", history.length === 0);
  }
  for (const id of ["redo", "focus-redo"]) {
    document.getElementById(id)?.classList.toggle("is-disabled", future.length === 0);
  }
}

function rebuildAll() {
  rebuildSubstrate(false);
  decorGroup.clear();
  state.decorations.forEach((rec) => {
    const def = DECORATIONS.find((d) => d.id === rec.id);
    const obj = getModelClone(rec.kind, rec.id) ?? buildDecoration(rec.kind, def?.variant);
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
  updateEmptyCall();
}

function undo() {
  const snap = history.pop();
  if (!snap) return;
  future.push(currentSnapshot()); // so it can be walked forward again
  restoreSnapshot(snap);
}

function redo() {
  const snap = future.pop();
  if (!snap) return;
  history.push(currentSnapshot());
  restoreSnapshot(snap);
}

// --- placement -------------------------------------------------------------
function placeDecoration(worldPoint, def) {
  if (state.decorations.length >= (window.innerWidth < 700 ? 72 : 120)) {
    flashHint(getLang() === "bn" ? "জার ভরে গেছে — কিছু জিনিস সরিয়ে আবার চেষ্টা করো।" : "This garden is full — remove something before adding more.");
    return;
  }
  const local = studio.world.worldToLocal(worldPoint.clone());
  const obj = getModelClone(def.kind, def.id) ?? buildDecoration(def.kind, def.variant);

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

  // Reduced motion gets the plant at full size straight away. The feedback that
  // matters — it appeared, here, where the tweezers were — survives; the
  // overshooting scale-in is the part that does not.
  if (calmMotion()) obj.scale.setScalar(targetScale);
  else tween(420, (p) => obj.scale.setScalar(0.001 + p * targetScale));
  // The ring, the sparks and the plop — the same beat a piece gets when it is
  // set back down, so appearing and being moved read as one family of event.
  confirmPlacement(obj);
  gameAction("plant", def.kind);
}

// --- dragging placed decorations ------------------------------------------
let grabbed = null;
// The piece the pointer is currently over, if any. Read by the tool status
// pill and by the hover highlight, so both always agree about which object a
// press would act on.
let hoverPiece = null;
let hoverAccent = "#6d9e4f";
// The piece waiting for a destination tap, armed from the item menu. Declared
// up here with the other interaction state because `updateToolStatus` reads it
// and runs during start-up — a `let` further down the file would be a TDZ
// throw that silently aborts the rest of main.js.
let movePending = null;

/**
 * Light up the piece a press would act on — and only ever one. Cheap to call
 * from a pointermove: it returns immediately when nothing has changed, so the
 * shell is rebuilt when the answer changes rather than on every mouse event.
 */
// --- picking a piece up ----------------------------------------------------
// A piece that simply jumps to 1.08 scale the instant you touch it reads as a
// glitch; the same change over a sixth of a second reads as the thing coming
// loose in your hand. Both end in exactly the same place, so nothing that
// depends on the lift has to know which one happened.
const LIFT_SCALE = 1.08;
const LIFT_Y = 0.05;

function liftPiece(obj, base) {
  const y0 = obj.position.y;
  if (calmMotion()) {
    obj.scale.setScalar(base * LIFT_SCALE);
    obj.position.y = y0 + LIFT_Y;
    return;
  }
  tween(150, (k) => {
    obj.scale.setScalar(base * (1 + (LIFT_SCALE - 1) * k));
    obj.position.y = y0 + LIFT_Y * k;
  }, easeOut);
}

/**
 * Where a dragged piece may actually stand: inside the vessel at that height,
 * and not standing in another piece. The nudge out of a neighbour is soft and
 * partial, so a crowded jar still lets you push things past each other rather
 * than fighting you — this is a gentle settle, not a collision system.
 */
function snapPlacement(obj, x, z) {
  let nx = x;
  let nz = z;
  // 1. Inside the glass. The margin keeps a plant's leaves off the wall rather
  //    than letting its origin sit exactly on it.
  const scale = obj.userData.baseScale ?? 1;
  const clamped = clampInsideAt(surfaceY(nx, nz), nx, nz, 0.06 + scale * 0.05);
  if (clamped) {
    nx = clamped.x;
    nz = clamped.z;
  }
  // 2. Out of a neighbour's footprint, by a little each frame rather than all
  //    at once, so the piece slides clear instead of snapping away.
  const near = 0.17 * scale;
  for (const other of decorGroup.children) {
    if (other === obj || other.userData.dying) continue;
    const dx = nx - other.position.x;
    const dz = nz - other.position.z;
    const d = Math.hypot(dx, dz);
    const want = near + 0.17 * (other.userData.baseScale ?? 1);
    if (d > 0.0001 && d < want) {
      const push = (want - d) * 0.5;
      nx += (dx / d) * push;
      nz += (dz / d) * push;
    }
  }
  return { x: nx, z: nz };
}

// --- tap and hold ----------------------------------------------------------
// A finger has no right-click and no hover, so the action menu needs a gesture
// of its own. Holding still on a piece for a moment is that gesture. It is
// armed on press and abandoned the moment the finger travels, so it can never
// fire in the middle of a drag the user meant as a drag.
const LONG_PRESS_MS = 480;
const LONG_PRESS_SLOP = 10; // px of travel that still counts as "held still"
let longPress = null;

function startLongPress(screen, obj) {
  cancelLongPress();
  if (!screen || !obj) return;
  longPress = {
    origin: { x: screen.x, y: screen.y },
    obj,
    timer: setTimeout(() => {
      longPress = null;
      // The hold replaces the drag: put the piece back where it was picked up
      // from and open its menu instead.
      if (grabbed === obj) dropPiece({ silent: true });
      openItemPanel(obj);
      playSfx("tap");
      if (navigator.vibrate && !calmMotion()) navigator.vibrate(12);
    }, LONG_PRESS_MS),
  };
}

function moveLongPress(screen) {
  if (!longPress || !screen) return;
  const travelled = Math.hypot(screen.x - longPress.origin.x, screen.y - longPress.origin.y);
  if (travelled > LONG_PRESS_SLOP) cancelLongPress();
}

function cancelLongPress() {
  if (!longPress) return;
  clearTimeout(longPress.timer);
  longPress = null;
}

function setHoverPiece(obj) {
  if (hoverPiece === obj) return;
  hoverPiece = obj;
  hoverHighlight.set(obj, hoverAccent);
  // The readout names the mode for the object under the pointer, so it has to
  // hear about this too.
  updateToolStatus();
  canvas.style.cursor = obj && !grabbed ? "grab" : "";
}

// Pieces that still belong to the garden. A deleted plant stays in the scene
// for the third of a second its dissolve lasts, and for that third of a second
// it must not be hoverable, grabbable or countable — its record is already
// gone from the model, so anything that picked it up would be holding nothing.
function livePieces() {
  return decorGroup.children.filter((o) => !o.userData.dying);
}

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

// What the active-tool pill says for each tool: a mode name, and a verb phrase
// for what the next press does. It lives up here beside TOOLS rather than down
// with the pill's rendering because `selectTool` runs during start-up, long
// before the bottom of this file is evaluated — a const declared down there is
// a temporal-dead-zone throw that takes the rest of main.js with it.
const TOOL_MODES = {
  place: { mode: "বসানোর মোড", glyph: "🥢" },
  water: { mode: "পানির মোড", glyph: "💧", does: "ট্যাপ বা টেনে মাটিতে পানি দাও" },
  mist: { mode: "স্প্রে মোড", glyph: "💦", does: "কাঁচে স্প্রে করতে ট্যাপ করো" },
  raise: { mode: "ভাস্কর্য মোড", glyph: "⛰️", does: "মাটি উঁচু করতে টেনে নাও" },
  lower: { mode: "ভাস্কর্য মোড", glyph: "🕳️", does: "মাটি নিচু করতে টেনে নাও" },
  flatten: { mode: "ভাস্কর্য মোড", glyph: "🫓", does: "মাটি সমান করতে টেনে নাও" },
  grass: { mode: "পেইন্ট মোড", glyph: "🌱", does: "ঘাস আঁকতে টেনে নাও" },
  moss: { mode: "পেইন্ট মোড", glyph: "🖌️", does: "মস আঁকতে টেনে নাও" },
  pebble: { mode: "পেইন্ট মোড", glyph: "🪨", does: "নুড়ি ছড়াতে টেনে নাও" },
};

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
  // the ring follows the stroke, so the affected patch stays visible while you
  // are actually working rather than only before you press
  cursorGhost.setItem(null);
  cursorGhost.showAt(local, brushRadius());

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
// A press with a substrate material is not yet either gesture. Held still and
// released it pours a layer; moved, it becomes a brush stroke that shapes the
// ground. Deciding at press time is what made a tap on the glass do nothing
// visible at all — it opened a paint stroke of zero length and closed it.
let basePress = null;
const BASE_DRAG_SLOP = 7; // px of travel that turns a pour into a stroke
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

// --- placement confirmation ------------------------------------------------
// The moment a piece becomes real. Three small things at once, because one
// alone is easy to miss while you are looking somewhere else on the glass: a
// ring of light opening on the ground where it landed, a scatter of sparks
// around it, and the plop. The scale bounce is the caller's, since where the
// piece comes *from* differs between planting and setting down.
const sparkGeo = new THREE.SphereGeometry(0.012, 5, 4);

function confirmPlacement(obj, { sound = true } = {}) {
  if (sound) playSfx("plop");
  studio.markInteraction();
  if (calmMotion()) return; // the piece appearing is feedback enough

  const at = obj.position;
  const scale = obj.userData.baseScale ?? 1;

  // The glow: a flat ring opening outward and fading, drawn over everything so
  // it stays readable through leaves.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.075, 28),
    new THREE.MeshBasicMaterial({
      color: 0xfff3d0,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(at.x, at.y + 0.006, at.z);
  ring.renderOrder = 5;
  fxGroup.add(ring);
  tween(460, (k) => {
    const r = 1 + k * 5.5 * scale;
    ring.scale.set(r, r, 1);
    ring.material.opacity = 0.75 * (1 - k);
    if (k >= 1) {
      fxGroup.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
  }, easeOut);

  // The sparkle: a handful of motes thrown up and falling back.
  const count = particleBudget(7);
  for (let i = 0; i < count; i++) {
    const spark = new THREE.Mesh(
      sparkGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffeab8,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    const a = Math.random() * Math.PI * 2;
    const reach = (0.06 + Math.random() * 0.12) * scale;
    const rise = (0.1 + Math.random() * 0.11) * scale;
    spark.position.set(at.x, at.y + 0.02, at.z);
    fxGroup.add(spark);
    tween(520 + Math.random() * 160, (k) => {
      spark.position.set(
        at.x + Math.cos(a) * reach * k,
        at.y + 0.02 + rise * k - 0.34 * k * k,
        at.z + Math.sin(a) * reach * k,
      );
      spark.material.opacity = 0.9 * (1 - k * k);
      if (k >= 1) {
        fxGroup.remove(spark);
        spark.material.dispose();
      }
    }, (x) => x);
  }
}

// Spray a cluster of condensation droplets onto the inside of the glass where
// the cursor points — the glass fogs up the more you spray.
function sprayMist(screen) {
  const targets = jarGlass ? [jarGlass, pickPlane] : [pickPlane];
  const hit = studio.raycast(screen, targets);
  if (!hit) return;
  if (screen?.x != null) impact(screen.x, screen.y, { size: 54, tone: "water" });
  const local = studio.world.worldToLocal(hit.point.clone());
  const n = particleBudget(10 + ((Math.random() * 8) | 0));
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
// themeById() falls back rather than trusting the save: a retired theme id
// would otherwise leave the picker with nothing highlighted.
currentThemeId = themeById(game.theme || currentThemeId).id;
tableStyleId = tableById(game.tableStyle || tableStyleId).id;
seasonId = game.season || seasonId;
weatherId = game.weather || weatherId;
timeOfDay = typeof game.timeOfDay === "number" ? game.timeOfDay : timeOfDay;
cycleEnabled = game.cycleEnabled ?? cycleEnabled;
let autosaveTimer = null;
let lastGameFrame = 0;
let lastMistGameAction = 0;
let lastWaterGameAction = 0;
let moldWarned = false;

function gameMetrics() {
  const plantCount = state.decorations.filter((rec) => PLANT_KINDS.has(rec.kind)).length;
  const mossCount = state.decorations.filter((rec) => MOSS_KINDS.has(rec.kind)).length;
  // springtails and isopods are the only decorations the simulation reacts to
  const crewCount = state.decorations.filter((rec) => CLEANUP_KINDS.has(rec.kind)).length;
  return {
    plantCount,
    mossCount,
    crewCount,
    layerCount: state.layers.length,
    hasSoil: state.layers.some((layer) => layer.type === "soil"),
    lightOn: jarLight.on,
  };
}

// `bad` flips the reading: for water or light a full bar is the goal, but for
// mould a full bar is the problem, so the colour has to run the other way.
function setCareMeter(id, value, bad = false) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const label = document.getElementById(`care-${id}`);
  const fill = document.getElementById(`care-${id}-fill`);
  if (label) label.textContent = `${gameLabel(id)} ${toUiDigits(pct)}%`;
  if (fill) {
    fill.style.width = `${pct}%`;
    const level = bad ? 100 - pct : pct;
    fill.style.background = level < 30 ? "var(--danger)" : level < 55 ? "#c9a95e" : "var(--green)";
  }
}

function gameLabel(id) {
  const labels = {
    water: getLang() === "bn" ? "জল" : "Water",
    humidity: getLang() === "bn" ? "আর্দ্রতা" : "Humidity",
    light: getLang() === "bn" ? "আলো" : "Light",
    soil: getLang() === "bn" ? "মাটি" : "Soil",
    mold: getLang() === "bn" ? "মোল্ড" : "Mould",
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
    tableStyle: tableStyleId,
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
      // Painted themes have no photograph and show their gradient swatch. A
      // photo theme shows its thumbnail — and falls back to the same swatch if
      // the file ever fails to arrive, so a missing asset costs a picture
      // rather than leaving a torn-image icon in a gallery of 180 cards.
      const swatch = `<span class="theme-swatch theme-swatch--${theme.id}"></span>`;
      const art = thumb
        ? `<img class="theme-thumb" src="${thumb}" alt="" loading="lazy" decoding="async"
             onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'theme-swatch theme-swatch--fallback'}))" />`
        : swatch;
      button.innerHTML = `${art}<strong>${bn ? theme.bn : theme.label}</strong>`;
      button.addEventListener("click", () => setTheme(theme.id));
      grid.append(button);
    });
  }
  const tables = document.getElementById("table-styles");
  if (tables) {
    tables.innerHTML = "";
    TABLES.forEach((style) => {
      const button = document.createElement("button");
      button.className = `table-chip${style.id === tableStyleId ? " is-active" : ""}`;
      button.type = "button";
      button.textContent = bn ? style.bn : style.label;
      // The chip wears the table it offers, so the row reads as a set of
      // surfaces rather than a set of words.
      button.style.setProperty("--table-top", style.top);
      button.style.setProperty("--table-leg", style.leg);
      button.addEventListener("click", () => setTableStyle(style.id));
      tables.append(button);
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
  // the ghost ring wears the theme accent, like the rest of the interface
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6d9e4f";
  cursorGhost.setColor(accent);
  handles.setColor(accent);
  hoverAccent = accent;
  hoverHighlight.set(hoverPiece, hoverAccent); // re-tint whatever is lit now
  studio.setTheme?.(theme.id);
  worldEffects.setTheme(theme);
  if (theme.weather) setWeather(theme.weather, false);
  renderThemePanel();
  if (reward) unlockGameAchievement("theme-tour");
  scheduleAutosave();
}

/** Swap the furniture under the jar. Remembered with the rest of the build. */
function setTableStyle(id, reward = true) {
  const style = tableById(id);
  tableStyleId = style.id;
  game.tableStyle = style.id;
  studio.setTable?.(style.id);
  renderThemePanel();
  if (reward) toast(getLang() === "bn" ? `টেবিল: ${style.bn}` : `Table: ${style.label}`);
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

// Every committed change goes out to the other gardener, and periodically into
// the room row so somebody joining late — or refreshing — opens into the jar as
// it is now rather than an empty one.
//
// This rides on scheduleAutosave(), which already fires once per *committed*
// action: a finished sculpt stroke, a placed decoration, a watering. Pointer
// moves and animation frames never reach it, which is exactly the granularity
// worth sending.
function broadcastCoopSnapshot() {
  if (!coopRoom || coopApplying) return;
  clearTimeout(coopTimer);
  coopTimer = setTimeout(async () => {
    coopRevision += 1;
    const payload = {
      sender: socialUser?.id,
      revision: coopRevision,
      build: currentBuildData(),
      game,
    };
    try {
      await social.broadcastCoop(payload);
    } catch {
      setCoopStatus("reconnecting");
    }
    // The durable copy is written on a slower clock than the broadcast: the
    // broadcast is what makes it feel live, the row is only there for whoever
    // arrives next, and a free-tier database does not need a write per brush
    // stroke.
    clearTimeout(coopPersistTimer);
    coopPersistTimer = setTimeout(async () => {
      if (!coopRoom) return;
      try {
        const saved = await social.saveCoopState(coopRoom.id, {
          build: payload.build,
          game: payload.game,
          revision: coopRevision,
        });
        if (saved?.revision) coopRevision = Math.max(coopRevision, Number(saved.revision));
      } catch (error) {
        // Losing the durable copy costs a late joiner freshness, not the live
        // session, so it is a status line rather than an interruption.
        coopStatusLine(coopErrorText(error), true);
      }
    }, 4000);
  }, 250);
}

/** A snapshot from the other gardener. */
function applyCoopSnapshot(payload) {
  if (!payload || !payload.build) return;
  if (payload.sender && payload.sender === socialUser?.id) return; // our own echo
  const incoming = Number(payload.revision ?? 0);
  // Last committed write wins, but only if it is actually newer. Without this a
  // snapshot delayed in flight can arrive after a fresher one and quietly undo
  // work that is already on screen.
  if (incoming && incoming <= coopRevision) return;
  coopApplying = true; // stops the applied state bouncing straight back out
  try {
    if (payload.game) hydrateGameState(game, payload.game);
    loadBuildData(payload.build, { history: false });
    coopRevision = incoming || coopRevision + 1;
    renderGameHud();
  } finally {
    coopApplying = false;
  }
  coopStatusLine(
    socialMessage("সঙ্গীর সর্বশেষ পরিবর্তন এসেছে।", "Updated with your partner's latest change."),
  );
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
  // The first thing you make is what earns the progress panel its place.
  syncProgressVisibility();
  maybeOfferCloudKeep();
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
  setCareMeter("mold", game.care.mold ?? 0, true);
  // One nudge when mould first takes hold, not every frame after.
  if ((game.care.mold ?? 0) > 0.45 && !moldWarned) {
    moldWarned = true;
    flashHint(
      gameMetrics().crewCount
        ? "মোল্ড ছড়াচ্ছে — কিছুদিন পানি কম দাও, দলটাকে কাজ করতে দাও।"
        : "মোল্ড ছড়াচ্ছে — কম পানি দাও, আর স্প্রিংটেইল বা আইসোপড যোগ করো।",
    );
  } else if ((game.care.mold ?? 0) < 0.2) {
    moldWarned = false;
  }

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
    // Visiting is free; keeping the remix you make is what needs the account.
    remix.addEventListener("click", () =>
      requireAccount("remix", () => visitSocialRecord(record, true)),
    );
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
    favorite.addEventListener("click", () => {
      // A favourite is a thing kept *somewhere*, so it needs somewhere to live.
      requireAccount("favorite", async () => {
        try {
          const updated = await social.toggleFavorite(record);
          Object.assign(record, updated);
          renderSocialGrid(container, records, mine);
        } catch (error) {
          socialStatus(error.message, true);
        }
      });
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
  // Used to dump you on the account tab with a note and leave you to work out
  // what you had been doing. Now the gate remembers, and publishing carries on
  // by itself once there is an account to publish to.
  if (needsAccount("publish", openPublish)) return;
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
  for (let i = 0, drops = particleBudget(5); i < drops; i++) {
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
  if (isTap && screen?.x != null) impact(screen.x, screen.y, { size: 64, tone: "water" });
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
  // While a move is armed the press is a destination, not a grab: let it fall
  // through to the tap handler rather than starting a drag or a brush stroke.
  if (movePending) return false;
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
    // Aimed inside the jar at all? Off it, the press turns the jar as usual.
    if (!aimInsideJar(screen)) return false;
    basePress = { x: screen.x, y: screen.y, touch: Boolean(screen.touch) };
    basePainting = false;
    // The marker stays up for the whole gesture, so a finger — which has no
    // hover to have shown it beforehand — still sees where this lands.
    const ok = showBaseShadow(screen, true);
    showReleaseHint(screen, ok);
    return true;
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
  const pieces = livePieces();
  if (!pieces.length) return false;
  const hit = studio.raycast(screen, pieces);
  if (!hit) return false;
  const obj = topDecor(hit.object);
  if (!obj) return false;
  grabbed = obj;
  snapshot();
  // The shell follows the piece up, so on a finger — which never had a hover
  // to light it beforehand — the press is acknowledged the instant it lands.
  setHoverPiece(obj);
  startLongPress(screen, obj);
  const base = obj.userData.baseScale ?? 1;
  obj.userData.baseScale = base;
  liftPiece(obj, base);
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
  if (basePress) {
    const travelled = Math.hypot(screen.x - basePress.x, screen.y - basePress.y);
    // Crossed the threshold: this was a stroke all along. The snapshot is
    // taken here rather than on press so a pour and a stroke each leave
    // exactly one entry in the history.
    if (!basePainting && travelled > BASE_DRAG_SLOP) {
      basePainting = true;
      snapshot();
      hideReleaseHint();
    }
    if (basePainting) applyBaseBrush(screen);
    const ok = showBaseShadow(screen, true);
    if (!basePainting) showReleaseHint(screen, ok);
    return;
  }
  if (activeTool !== "place") {
    applyBrush(screen);
    return;
  }
  if (!grabbed) return;
  moveLongPress(screen);
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return;
  const local = studio.world.worldToLocal(hit.point.clone());
  // The piece follows the cursor, but only as far as it is allowed to go — so
  // what you are dragging and where it can actually land stay the same thing.
  const spot = snapPlacement(grabbed, local.x, local.z);
  grabbed.position.x = spot.x;
  grabbed.position.z = spot.z;
  const ground = surfaceY(spot.x, spot.z);
  grabbed.position.y = ground + LIFT_Y;
  const rec = grabbed.userData.record;
  if (rec) {
    rec.x = spot.x;
    rec.z = spot.z;
  }
  // A ring on the ground directly beneath it. Held up in the air the piece
  // hides its own footing, and on a sculpted surface "under the cursor" and
  // "where it will stand" are not the same point.
  cursorGhost.setItem(null);
  cursorGhost.showAt({ x: spot.x, y: ground, z: spot.z }, 0.16 + (grabbed.userData.baseScale ?? 1) * 0.14);
});

studio.setObjectDrop(() => {
  if (activeTool === "water") fadePour(); // stop the pour when the stroke ends
  if (basePress) {
    const wasPainting = basePainting;
    const press = basePress;
    basePainting = false;
    basePress = null;
    hideReleaseHint();
    if (wasPainting) {
      baseShadow.hide();
    } else {
      // Held still and let go: pour a layer where the marker was showing.
      lastPress = { x: press.x, y: press.y };
      tryAddLayer(selected.id);
      // A pour that would not fit leaves the marker red and standing. A mouse
      // has a hover to keep it honest from here; a finger does not, so its
      // marker is put away rather than left frozen over the jar.
      if (press.touch) baseShadow.hide();
    }
    updateHint();
    return;
  }
  lastPaint = null;
  dropPiece();
});

/**
 * Set a dragged piece down. It settles to the ground with the same small
 * overshoot a freshly planted one gets, so moving something and placing
 * something feel like the same act rather than two different ones.
 * `silent` skips the settle — used when a long press takes the drag over.
 */
function dropPiece({ silent = false } = {}) {
  cancelLongPress();
  cursorGhost.hide();
  if (!grabbed) return;
  const obj = grabbed;
  grabbed = null;
  const base = obj.userData.baseScale ?? 1;
  const rec = obj.userData.record;
  const ground = rec ? surfaceY(rec.x, rec.z) : obj.position.y - LIFT_Y;
  if (rec) rec.y = ground;
  // The piece is no longer held, so the cursor stops saying it is — whichever
  // way it was set down.
  canvas.style.cursor = hoverPiece ? "grab" : "";
  if (silent || calmMotion()) {
    obj.scale.setScalar(base);
    obj.position.y = ground;
    if (!silent) confirmPlacement(obj);
    return;
  }
  const fromY = obj.position.y;
  const fromScale = obj.scale.x;
  tween(300, (k) => {
    obj.position.y = fromY + (ground - fromY) * k;
    obj.scale.setScalar(base * (fromScale / base + (1 - fromScale / base) * k));
  }, easeOutBack);
  confirmPlacement(obj);
}

// --- interaction -----------------------------------------------------------
let selected = { group: "base", id: BASE_LAYERS[0].id };

// Drop one substrate layer (used by tap and by drag-from-strip).
// --- strata labels ---------------------------------------------------------
// The front and side views exist to read layer thickness. Seeing the bands is
// not the same as knowing them, so in those two views each band gets its depth
// written beside it: "35 mm soil". Everywhere else this is off, because a
// three-quarter view is for building and a label per band in it is clutter.
const strataEl = document.getElementById("strata");
let strataShown = false;

function syncStrata() {
  if (!strataEl) return;
  const want =
    (activeView === "front" || activeView === "side") && state.layers.length > 0;
  if (!want) {
    if (strataShown) {
      strataEl.classList.add("hidden");
      strataEl.replaceChildren();
      strataShown = false;
    }
    return;
  }
  // Rebuild only when the stack changes; reposition every frame it is up.
  const signature = state.layers.map((l) => `${l.type}:${l.height}`).join("|");
  if (strataEl.dataset.sig !== signature) {
    strataEl.dataset.sig = signature;
    strataEl.replaceChildren(
      ...state.layers.map((l) => {
        const def = BASE_BY_ID[l.type];
        const row = document.createElement("span");
        row.className = "strata-row";
        row.innerHTML =
          `<i class="strata-swatch" style="background:${def?.swatch ?? "#888"}"></i>` +
          `<b>${toUiDigits(Math.round(unitsToMm(l.height)))} ${t("মিমি")}</b>` +
          `<span>${def ? tLabel(def.label) : ""}</span>`;
        return row;
      }),
    );
    strataEl.classList.remove("hidden");
    strataShown = true;
  }
  // Put each label at its band's middle, just clear of the jar's right edge.
  const rect = canvas.getBoundingClientRect();
  const rows = strataEl.children;
  const placed = [];
  let y = substrateBase();
  for (let i = 0; i < state.layers.length; i++) {
    const layer = state.layers[i];
    const mid = y + layer.height / 2;
    y += layer.height;
    _strataV.set(jarGridR() * 1.25, mid, 0);
    studio.world.localToWorld(_strataV).project(studio.camera);
    placed.push({
      x: (_strataV.x * 0.5 + 0.5) * rect.width,
      y: (-_strataV.y * 0.5 + 0.5) * rect.height,
      // Behind the camera, or off the canvas: say nothing rather than
      // something in the wrong place.
      off: _strataV.z > 1,
    });
  }
  // A 6mm filter and a 7mm barrier sit closer together than a label is tall,
  // so their text lands on top of itself. Walk up the stack pushing each label
  // clear of the one below: the labels stop being exactly on their bands, but
  // they stay in order and stay readable, which is the job.
  // Bottom upward, so each push carries into the next comparison. Running it
  // the other way settles each pair against a neighbour that has not moved yet,
  // and the chain comes apart on the third label.
  const LABEL_GAP = 19;
  for (let i = 0; i < placed.length - 1; i++) {
    // Screen Y grows downward, so a *lower* band has the larger y.
    const below = placed[i];
    const above = placed[i + 1];
    if (below.y - above.y < LABEL_GAP) above.y = below.y - LABEL_GAP;
  }
  for (let i = 0; i < placed.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const p = placed[i];
    const offscreen =
      p.off || p.x < 0 || p.x > rect.width || p.y < 0 || p.y > rect.height;
    row.style.opacity = offscreen ? "0" : "1";
    row.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  }
}

const _strataV = new THREE.Vector3();

// --- layer depth -----------------------------------------------------------
// How deep the next pour goes, in millimetres.
//
// The app has always known these depths — every material carries one — it just
// never said them, so "charcoal is thin" was something the code knew and the
// builder could not see or change. Saying it in millimetres also lets the app
// hold an opinion worth having: a drainage bed wants depth, a charcoal filter
// wants almost none, and real builders quote a quarter to half an inch for it.
//
// The chosen depth is remembered *per material*, because they are not one
// setting: someone who likes a deep drainage bed and a thin charcoal filter
// should not have to re-dial either.
/** The depth this material is currently set to pour at. */
function depthFor(id) {
  const def = BASE_BY_ID[id];
  if (!def) return 0;
  const chosen = layerMm[id];
  return clampLayerMm(def, Number.isFinite(chosen) ? chosen : unitsToMm(def.layerHeight));
}

/** A step size that suits the material: 1mm for a filter, 2mm for a bed. */
function depthStep(def) {
  return Math.max(1, Math.round(unitsToMm(def.layerHeight) / 10));
}

function setDepthFor(id, mm) {
  const def = BASE_BY_ID[id];
  if (!def) return;
  layerMm[id] = clampLayerMm(def, mm);
  try {
    localStorage.setItem(DEPTH_KEY, JSON.stringify(layerMm));
  } catch {
    /* private mode: the depth just resets next session */
  }
  renderDepth();
  // The preview answers "will this fit" from the depth, so it has to be retold.
  updateHint();
}

// Advice, not enforcement. Outside the band the app says what the material is
// for and pours anyway — it is not its business to refuse a build.
function depthAdviceText(def, mm) {
  const verdict = layerMmAdvice(def, mm);
  if (!verdict) return "";
  if (def.id === "charcoal" && verdict === "thick") return t("চারকোল ফিল্টার — পাতলা হলেই চলে");
  if (def.chunky && verdict === "thin") return t("ড্রেনেজ আরও গভীর হলে ভালো");
  return t(verdict === "thin" ? "এই স্তরের জন্য বেশি পাতলা" : "এই স্তরের জন্য বেশি মোটা");
}

function renderDepth() {
  const row = document.getElementById("tool-depth");
  const note = document.getElementById("depth-note");
  if (!row || !note) return;
  const def = activeTool === "place" && selected.group === "base" ? BASE_BY_ID[selected.id] : null;
  row.classList.toggle("hidden", !def);
  if (!def) {
    note.textContent = "";
    return;
  }
  const mm = depthFor(def.id);
  const left = remainingMm(state);
  document.getElementById("depth-value").textContent = `${toUiDigits(mm)} ${t("মিমি")}`;
  // Two things worth knowing, in priority order: whether it will fit at all,
  // then whether it is a sensible depth for this material.
  const advice = mm > left ? t("জারে আর জায়গা নেই") : depthAdviceText(def, mm);
  note.textContent = advice || `${toUiDigits(left)} ${t("মিমি")} ${t("বাকি")}`;
  note.classList.toggle("is-warn", Boolean(advice));
}

document.getElementById("depth-down")?.addEventListener("click", () => {
  const def = BASE_BY_ID[selected.id];
  if (def) setDepthFor(def.id, depthFor(def.id) - depthStep(def));
});
document.getElementById("depth-up")?.addEventListener("click", () => {
  const def = BASE_BY_ID[selected.id];
  if (def) setDepthFor(def.id, depthFor(def.id) + depthStep(def));
});

// The stack a real guide would tell you to build, poured in one press at the
// depths those guides quote. It is the fastest way to a jar that is right, and
// the clearest statement of what the depths are *for* — which is most of why
// the millimetres are here at all.
const CLASSIC_STACK = [
  { id: "leca", mm: 25 },      // drainage reservoir
  { id: "sphagnum", mm: 6 },   // barrier so soil does not wash into it
  { id: "charcoal", mm: 7 },   // filter, a quarter inch
  { id: "soil", mm: 35 },      // where things grow
];

document.getElementById("depth-recipe")?.addEventListener("click", () => {
  const needed = CLASSIC_STACK.reduce((sum, l) => sum + l.mm, 0);
  if (remainingMm(state) < needed) {
    flashHint(t("জারে আর জায়গা নেই"));
    return;
  }
  snapshot();
  let poured = 0;
  for (const step of CLASSIC_STACK) {
    if (!addLayer(state, step.id, step.mm)) break;
    poured++;
  }
  if (!poured) return;
  rebuildSubstrate(true);
  confirmBaseShadow();
  updateEmptyCall();
  updateHint();
  gameAction("layer", CLASSIC_STACK[CLASSIC_STACK.length - 1].id);
});

function tryAddLayer(id) {
  const def = BASE_LAYERS.find((b) => b.id === id);
  if (!def) return;
  const mm = depthFor(id);
  if (remainingMm(state) < mm) {
    flashHint("জার প্রায় ভরে গেছে — এবার সাজানো শুরু করো!");
    return;
  }
  snapshot();
  addLayer(state, id, mm);
  rebuildSubstrate(true);
  confirmBaseShadow(); // the marker flares and fades rather than blinking off
  updateEmptyCall();
  if (lastPress) {
    impact(lastPress.x, lastPress.y, { size: 78 });
    burst(lastPress.x, lastPress.y, { count: particleBudget(10), spread: 44, colors: def.colors ?? ["#8a6b47", "#a9895f"] });
  }
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
    cursorGhost.hide();
    handles.hide();
    handCarrying = null; // the tweezers are empty again once this one is let go
    hand.placeAt(hit.point, () => {
      placeDecoration(hit.point, def);
      if (screen?.x != null) {
        impact(screen.x, screen.y, { size: 52, tone: "leaf" });
        burst(screen.x, screen.y, { count: 8, spread: 34, colors: ["#8a6b47", "#a9895f", "#c7b18b"] });
      }
      updateHint();
    });
  }
}

// A miniature of the item, pinched between the tweezer tips while the hand
// carries it to the spot it will be planted.
function handPreview(def) {
  const obj = getModelClone(def.kind, def.id) ?? buildDecoration(def.kind, def.variant);
  const jarK = Math.min(1.25, Math.max(0.55, JAR.innerRadius / 1.0));
  obj.scale.setScalar(0.72 * jarK);
  return obj;
}

// Where the pointer last went down, so feedback can land where you pressed even
// when the action itself only knows about the world.
let lastPress = null;
canvas.addEventListener("pointerdown", (e) => {
  lastPress = { x: e.clientX, y: e.clientY };
});

// Hover is where the interface tells you what a press would do: the tweezers
// carry the piece to the spot it would be planted, a ghost of it stands there,
// a brush ring shows exactly the area a sculpt or paint stroke would cover, and
// every piece already planted wears a handle saying it can be picked back up.
let handCarrying = null;
const BRUSH_TOOLS = new Set(["raise", "lower", "flatten", "grass", "moss", "pebble"]);

function decorHandlePoints() {
  return livePieces().map((obj) => ({
    x: obj.position.x,
    y: obj.position.y,
    z: obj.position.z,
    lift: 0.12 + (obj.userData.baseScale ?? 1) * 0.12,
  }));
}

function clearHover() {
  hand.hide();
  cursorGhost.hide();
  handles.hide();
  baseShadow.hide();
  if (hoverPiece) {
    setHoverPiece(null);
  }
}

// --- base placement marker -------------------------------------------------
// Answers the two questions a pour raises before it happens: where will this
// land, and will it fit? `screen` may be null, which is how the touch path
// says "the finger is out over nothing" — the marker then shows the layer
// still parked at its settle height but dulled to red, rather than blinking
// out and leaving the gesture unanswered.
/**
 * Where a pointer is aiming *inside* the jar, in world-group local space, or
 * null if it is not aiming inside one.
 *
 * The glass is deliberately not a target here. It used to be, so that a press
 * anywhere over the vessel would count — but a wall is a wall from both sides,
 * and the ray hits the *outside* of the far pane, the neck of a bottle, or the
 * crown of a cloche just as readily as it hits the space you meant. Clicking
 * the glass then read as a valid placement. What a pour or a planting is
 * actually aimed at is the surface inside: the sculpted terrain where there is
 * some, and the interior pick plane where there is not. Both are cut to the
 * jar's own footprint, and insideJarAt is the final word.
 *
 * The glass keeps its other jobs — misting it, opening its door — which are
 * about the pane itself rather than about the room behind it.
 */
function aimInsideJar(screen) {
  if (!screen) return null;
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return null;
  const local = studio.world.worldToLocal(hit.point.clone());
  return insideJarAt(local.y, local.x, local.z) ? local : null;
}

/**
 * Park the base marker under the pointer.
 *
 * `holding` is true while a press or touch is actually down. It is the whole
 * difference between the two things this used to conflate: with the pointer
 * merely hovering, aiming away from the jar means there is nothing to preview
 * and the marker goes away; mid-gesture it means *this gesture will not work*,
 * which is worth a red marker and a line of text. Showing a jar-wide marker
 * parked at the centre while the cursor was somewhere else entirely was the
 * worst of both.
 */
function showBaseShadow(screen, holding = false) {
  const def = BASE_LAYERS.find((b) => b.id === selected.id);
  if (!def || activeTool !== "place" || selected.group !== "base") {
    baseShadow.hide();
    hideReleaseHint();
    return false;
  }
  const fits = remainingHeight(state) >= def.layerHeight;
  const y = Math.min(substrateTop(state), JAR.floorY + JAR.bodyHeight);
  const point = aimInsideJar(screen);
  if (!point && !holding) {
    baseShadow.hide();
    hideReleaseHint();
    return false;
  }
  const ok = fits && Boolean(point);
  baseShadow.showAt(y, point, ok);
  return ok;
}

// The marker's job ends the moment the layer is real. It flares once on the
// way out so the pour and the spot you aimed at read as the same event.
function confirmBaseShadow() {
  baseShadow.confirm();
}

// --- "release to place" ----------------------------------------------------
// A finger held down over the glass is a state with no visible edge: nothing
// on screen says the press is being held rather than ignored, or what letting
// go will do. This rides just above the fingertip and says it. It is a DOM
// chip rather than anything in the scene, because it has to stay legible over
// whatever colour the substrate happens to be.
const RELEASE_LIFT = 84; // clears the fingertip and the marker's own lift

function showReleaseHint(p, valid) {
  let el = document.getElementById("release-hint");
  if (!el) {
    el = document.createElement("div");
    el.id = "release-hint";
    el.className = "release-hint";
    document.body.appendChild(el);
  }
  el.textContent = t(valid ? "ছেড়ে দিলে বসে যাবে" : "জারের ভেতরে নিয়ে এসো");
  el.classList.toggle("is-invalid", !valid);
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y - RELEASE_LIFT}px`;
  el.classList.add("is-on");
}

function hideReleaseHint() {
  document.getElementById("release-hint")?.classList.remove("is-on");
}

canvas.addEventListener("pointermove", (e) => {
  if (e.buttons) return; // mid-drag: the stroke itself is the feedback
  const screen = { x: e.clientX, y: e.clientY };

  // Sculpt and paint tools: ring the exact patch the stroke would touch.
  if (BRUSH_TOOLS.has(activeTool)) {
    handles.hide();
    hand.hide();
    setHoverPiece(null);
    const hit = hasBase(state) ? studio.raycast(screen, surfaceTargets()) : null;
    if (!hit) {
      cursorGhost.hide();
      return;
    }
    cursorGhost.setItem(null);
    cursorGhost.showAt(studio.world.worldToLocal(hit.point.clone()), brushRadius());
    return;
  }

  // Holding a substrate material: the marker, not the tweezers. This comes
  // before the hasBase() gate below, because the very first layer — the one
  // where there is no ground at all yet and nothing on screen to aim at — is
  // precisely the pour that most needs showing.
  if (activeTool === "place" && selected.group === "base") {
    hand.hide();
    cursorGhost.hide();
    handles.hide();
    setHoverPiece(null);
    showBaseShadow(screen);
    return;
  }
  baseShadow.hide();

  if (activeTool !== "place" || !hasBase(state)) {
    clearHover();
    handCarrying = null;
    return;
  }

  // Tweezers over a planted piece: offer to pick that one up rather than to
  // plant another on top of it.
  const pieces = livePieces();
  const onPiece = pieces.length ? studio.raycast(screen, pieces) : null;
  if (pieces.length) {
    handles.sync(decorHandlePoints());
    handles.show();
    handles.setHovered(onPiece ? pieces.indexOf(topDecor(onPiece.object)) : -1);
  } else {
    handles.hide();
  }
  setHoverPiece(onPiece ? topDecor(onPiece.object) : null);
  if (onPiece) {
    hand.hide();
    cursorGhost.hide();
    return;
  }

  aimTweezers(screen);
});
canvas.addEventListener("pointerleave", clearHover);

// Reach the tweezers toward `screen` carrying whatever is selected, and report
// the spot they would plant it in (or null if that is nowhere). The mouse
// calls this from its hover; touch, which has no hover, calls it from the
// finger — see the aim handler below.
function aimTweezers(screen) {
  if (selected.group !== "decor") {
    hand.hide();
    cursorGhost.hide();
    handCarrying = null;
    return null;
  }
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) {
    hand.hide();
    cursorGhost.hide();
    return null;
  }
  const def = DECORATIONS.find((d) => d.id === selected.id);
  if (handCarrying !== selected.id) {
    handCarrying = selected.id;
    hand.carry(def ? handPreview(def) : null);
    cursorGhost.setItem(def ? handPreview(def) : null);
  }
  hand.hoverTo(hit.point);
  const local = studio.world.worldToLocal(hit.point.clone());
  // The tap target is deliberately a little wider than the interior (see
  // buildPickPlane), so a hit on it is not by itself a licence to plant. The
  // ghost goes red over the slack, which is the same answer the placement
  // itself will give — rather than looking willing and then refusing.
  const inside = insideJarAt(local.y, local.x, local.z, 0.04);
  cursorGhost.setValid(inside);
  cursorGhost.showAt(local, 0.34 * Math.min(1.25, Math.max(0.55, JAR.innerRadius)));
  return inside ? hit : null;
}

// --- planting with a finger ------------------------------------------------
// The tweezers are the whole gesture of this app — reach, hover, dip, release
// — and on a phone none of it was reachable: the hand rides the mouse's hover,
// and a finger has none, so a tap planted instantly at a point hidden under
// the fingertip. Contact stands in for hover here. Press with something picked
// from the tray and the hand reaches in carrying it; drag and it follows; lift
// and it dips and lets go. Turning the jar stays on one finger with nothing
// selected, and on two fingers always.
//
// The aim also rides above the fingertip, or you would be planting into the
// one spot on the glass you cannot see. It eases up rather than jumping, so a
// straight tap still lands where it was tapped and only a drag lifts clear.
const TOUCH_LIFT = 64;
let aimAt = null; // the lifted screen point the tweezers are held over
let aimLift = 0;

// Where the finger is actually pointing. The full lift is only taken if there
// is still substrate up there — near the back of a small jar it would carry
// the aim off the far rim — so it walks back down toward the fingertip until
// it finds ground, and reports nothing if there is none.
function aimScreen(p) {
  for (const part of [1, 0.66, 0.33, 0]) {
    const screen = { x: p.x, y: p.y - aimLift * part };
    if (studio.raycast(screen, surfaceTargets())) return screen;
  }
  return null;
}

// Substrate is not aimed through here: a press with a base material selected is
// claimed by the grab handler above, which runs first and drives both the
// pour and the brush stroke from one place for mouse and finger alike.
studio.setAimHandler({
  start(p) {
    if (!p.touch) return false; // the mouse has a hover already
    if (focusMode && !focusToolArmed) return false; // that press opens the radial
    if (activeTool !== "place") return false;
    if (selected.group !== "decor") return false;
    if (!hasBase(state)) return false; // let the tap through to flash the hint
    aimLift = 0;
    aimAt = aimScreen(p);
    if (!aimAt) return false; // pressed off the jar → turn it instead
    handles.hide();
    aimTweezers(aimAt);
    return true;
  },
  move(p) {
    aimLift += (TOUCH_LIFT - aimLift) * 0.25;
    aimAt = aimScreen(p);
    // Dragged off the substrate: the tweezers withdraw, so lifting there
    // plants nothing rather than guessing.
    aimTweezers(aimAt ?? { x: p.x, y: p.y });
  },
  end() {
    const screen = aimAt;
    aimAt = null;
    if (screen) tryPlaceDecoration(screen, selected.id);
    else clearHover();
  },
  cancel() {
    aimAt = null;
    clearHover();
  },
});

studio.setTapHandler((screen) => {
  // An armed move owns the next tap on the jar, before any tool gets it — that
  // is the whole bargain the menu made when it armed.
  if (movePending && completeMove(screen)) return;
  // The knob comes before every tool: grabbing it is how you open the jar, and
  // it should work whatever you happen to be holding.
  if (jarDoor && studio.raycast(screen, [jarDoor.knob])) {
    toggleJarDoor();
    return;
  }
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
  if (activeTool === "place" && livePieces().length) {
    const hitD = studio.raycast(screen, livePieces());
    if (hitD) {
      openItemPanel(topDecor(hitD.object));
      return;
    }
  }
  if (selected.group === "base") {
    // Any tap *inside* the jar drops another substrate layer. A tap on the
    // glass itself is not a placement — see aimInsideJar.
    if (!aimInsideJar(screen)) {
      flashHint(t("জারের ভেতরে নিয়ে এসো"));
      return;
    }
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
  updateFocusHud();
  studio.markInteraction();
}

// Two tools are on show; the rest of the tab's tools wait behind one row. Every
// tab has a verb you use constantly and a couple you reach for occasionally,
// and showing all of them all of the time taxes every glance at the screen.
const TOOLS_SHOWN = 2;
let toolsExpanded = false;

function renderTools() {
  toolItemsEl.innerHTML = "";
  const ids = TAB_TOOLS[activeTab];
  const showAll = toolsExpanded || ids.length <= TOOLS_SHOWN + 1;
  const visible = showAll ? ids : ids.slice(0, TOOLS_SHOWN);
  // a hidden tool that is currently selected still shows, or the row would lie
  if (!visible.includes(activeTool) && ids.includes(activeTool)) visible.push(activeTool);

  visible.forEach((tid) => {
    const t2 = TOOLS.find((x) => x.id === tid);
    const btn = document.createElement("button");
    btn.className = "tool-row";
    btn.dataset.id = t2.id;
    btn.classList.toggle("is-active", t2.id === activeTool);
    btn.innerHTML = `<span class="t-icon">${t2.glyph}</span><span class="t-label">${t(t2.label)}</span><span class="t-key">${ids.indexOf(tid) + 1}</span>`;
    btn.addEventListener("click", () => selectTool(t2.id));
    toolItemsEl.appendChild(btn);
  });

  if (!showAll) {
    const more = document.createElement("button");
    more.className = "tool-row tool-row--more";
    more.innerHTML = `<span class="t-icon">⋯</span><span class="t-label">${t("আরও টুল")}</span>`;
    more.addEventListener("click", () => {
      toolsExpanded = true;
      renderTools();
    });
    toolItemsEl.appendChild(more);
  }
  toolItemsEl.style.display = ids.length ? "" : "none";
}

function selectTab(tab) {
  activeTab = tab;
  toolsExpanded = false; // each tab opens on its everyday tools
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
  document.body.classList.toggle("soft-ui", comfort.softUi && !comfort.reducedTransparency);
  document.body.classList.toggle("reduced-motion", comfort.reducedMotion);
  document.body.classList.toggle("reduced-transparency", comfort.reducedTransparency);
  document.body.classList.toggle("high-contrast", comfort.highContrast);
  // Reduced transparency means the plate stops being a dial: it goes solid and
  // the opacity slider stops applying, because "see the world through the menu"
  // is exactly what the person has asked us not to do.
  const alpha = comfort.reducedTransparency
    ? 1
    : Math.max(0.55, Math.min(1, comfort.opacity / 100));
  document.documentElement.style.setProperty("--hud-alpha", `${alpha}`);
  document.documentElement.style.setProperty(
    "--text-scale",
    `${Math.max(0.9, Math.min(2, (comfort.textScale || 100) / 100))}`,
  );
  // Background weather/effects are the first thing to go on a tight budget —
  // they are pure atmosphere and nothing depends on them.
  const level = qualityLevel();
  document.body.classList.toggle("perf-low", level === "low");
  if (worldEffects.root) worldEffects.root.visible = !comfort.reducedMotion && level !== "low";
  studio.setQuality(level);
  document.querySelectorAll(".quality-opt").forEach((button) => {
    const on = button.dataset.quality === level;
    button.classList.toggle("is-active", on);
    button.setAttribute("aria-checked", on ? "true" : "false");
  });
  const clickToggle = document.getElementById("comfort-click");
  if (clickToggle) clickToggle.checked = comfort.clickSound !== false;
  const soft = document.getElementById("comfort-soft");
  const motion = document.getElementById("comfort-motion");
  const opacity = document.getElementById("comfort-opacity");
  const sound = document.getElementById("comfort-sound");
  const transparency = document.getElementById("comfort-transparency");
  const contrastToggle = document.getElementById("comfort-contrast");
  const textScale = document.getElementById("comfort-text");
  if (soft) soft.checked = comfort.softUi;
  if (motion) motion.checked = comfort.reducedMotion;
  if (opacity) {
    opacity.value = comfort.opacity;
    opacity.disabled = comfort.reducedTransparency;
  }
  if (sound) sound.checked = comfort.sound;
  if (transparency) transparency.checked = comfort.reducedTransparency;
  if (contrastToggle) contrastToggle.checked = comfort.highContrast;
  if (textScale) textScale.value = comfort.textScale || 100;
  if (typeof volumeSlider !== "undefined" && volumeSlider) {
    volumeSlider.value = comfort.volume;
    setVolume(comfort.volume / 100);
    paintFader();
  }
  if (typeof soundBtn !== "undefined" && isPlaying() !== comfort.sound) {
    // Autoplay rules mean this only takes on a user gesture; the toggle reports
    // what actually happened rather than what we asked for.
    syncSoundUi(toggleAmbience());
  }
}

// What the user is currently holding, in one line: a brush tool says which
// brush, and "place" says which item is on the tweezers, because in Focus Build
// the tray that would otherwise have told you is folded away.
function currentSelectionLabel() {
  if (activeTool !== "place") {
    const tool = TOOLS.find((entry) => entry.id === activeTool);
    if (tool) return `${tool.glyph} ${t(tool.label)}`;
  }
  const source =
    selected.group === "jar" ? JAR_TYPES : selected.group === "base" ? BASE_LAYERS : DECORATIONS;
  const item = source.find((entry) => entry.id === selected.id);
  return item ? `🥢 ${tLabel(item.label)}` : t("বসাও");
}

// Keeps both readouts of the current selection — the focus HUD and the radial's
// caption — saying the same thing, and greys the history verbs that would do
// nothing. Cheap enough to call from every selection change.
function updateFocusHud() {
  const label = currentSelectionLabel();
  const current = document.getElementById("focus-current");
  if (current) current.textContent = label;
  const radialCurrent = document.getElementById("radial-current");
  if (radialCurrent) radialCurrent.textContent = label;
  updateHistoryUi();
  // Every tool and selection change already lands here, so the status pill
  // rides along rather than needing its own set of call sites to keep in sync.
  updateToolStatus();
}

function openRadial() {
  radialOpen = true;
  updateFocusHud();
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
  if (action === "tray") {
    // The shelf is a place to go, not a tool to hold — arming a tool here would
    // make the next tap on the glass plant whatever was already selected.
    setFocusTrayOpen(true);
    return;
  }
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
  updateFocusHud();
}

// --- Focus Build ------------------------------------------------------------
// The tray comes back as a *drawer*: the same column, the same cards, the same
// selection code — just temporarily on top of the focused workspace. The
// underlying tray-hidden preference is never touched, so whatever the user had
// folded or unfolded before is still that way when they step back out.
let focusTrayOpen = false;

function setFocusTrayOpen(open) {
  focusTrayOpen = focusMode && open;
  document.body.classList.toggle("focus-tray-open", focusTrayOpen);
  const key = focusTrayOpen ? "ট্রে বন্ধ করো" : "ট্রে খোলো";
  for (const id of ["focus-tray", "focus-tray-edge"]) {
    const button = document.getElementById(id);
    if (!button) continue;
    button.setAttribute("aria-expanded", focusTrayOpen ? "true" : "false");
    button.classList.toggle("is-active", focusTrayOpen);
    // Both pulls say what the press will do next, in whichever language is on.
    if (button.dataset.i18n) button.dataset.i18n = key;
    if (button.dataset.i18nTitle) button.dataset.i18nTitle = key;
    const label = t(key);
    button.title = label;
    button.setAttribute("aria-label", label);
    const text = button.querySelector(".focus-text");
    if (text) text.textContent = label;
  }
  if (focusTrayOpen) {
    closeRadial();
    renderStrip(); // the drawer may have been away for a whole build
  } else {
    catFlyoutEl?.classList.add("hidden");
  }
}

let cameraLocked = false;

function setCameraLock(on) {
  cameraLocked = !!on;
  studio.setCameraLock?.(cameraLocked);
  const button = document.getElementById("focus-lock");
  if (!button) return;
  button.classList.toggle("is-active", cameraLocked);
  button.setAttribute("aria-pressed", cameraLocked ? "true" : "false");
  // The tooltip says what the press will *do*, so it flips with the state.
  button.dataset.i18nTitle = cameraLocked ? "ক্যামেরা খোলো" : "ক্যামেরা লক";
  const label = t(button.dataset.i18nTitle);
  button.title = label;
  button.setAttribute("aria-label", label);
  const ico = button.querySelector(".focus-ico");
  if (ico) ico.textContent = cameraLocked ? "🔒" : "🔓";
}

function setFocusMode(on = !focusMode) {
  focusMode = on;
  document.body.classList.toggle("focus-mode", focusMode);
  document.getElementById("focus-hud")?.classList.toggle("hidden", !focusMode);
  const button = document.getElementById("focus-btn");
  if (button) {
    button.classList.toggle("is-active", focusMode);
    button.setAttribute("aria-pressed", focusMode ? "true" : "false");
    // The key moves with the label: otherwise the next language flip would put
    // the "enter" wording back on a button that now leaves.
    button.dataset.i18n = focusMode ? "ফোকাস বিল্ড ছাড়ো" : "ফোকাস বিল্ড";
    const label = t(button.dataset.i18n);
    const text = button.querySelector(".nav-text");
    if (text) text.textContent = label;
    button.title = label;
  }
  document.getElementById("more-menu")?.classList.add("hidden");
  // Entering focus deliberately does NOT re-frame the jar. You step into focus
  // because you have already found the angle you want to work at, and having it
  // snatched back to the default was the single most jarring thing about the
  // old mode. Re-centring is one press away in the HUD instead.
  if (!focusMode) {
    setFocusTrayOpen(false);
    setCameraLock(false); // the only way to unlock lives in the focus HUD
  }
  focusToolArmed = false;
  closeRadial();
  updateFocusHud();
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

// Keyboard verbs. Numbers pick a tool inside the current tab; the rest are the
// things you do constantly with a mouse in the other hand — recentre, hide the
// interface, and nudge the piece you are adjusting a hair at a time.
const NUDGE = 0.03;
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // undo/redo handle their own

  // An armed move is a mode you are standing in, so Escape has to be able to
  // step back out of it — otherwise the next tap anywhere lands the piece.
  if (e.key === "Escape" && movePending) {
    e.preventDefault();
    cancelMove();
    updateHint();
    return;
  }

  const ids = TAB_TOOLS[activeTab];
  const idx = Number(e.key) - 1;
  if (!Number.isNaN(idx) && ids[idx]) {
    selectTool(ids[idx]);
    return;
  }

  const key = e.key.toLowerCase();
  if (key === " " || e.code === "Space") {
    e.preventDefault();
    studio.resetView?.();
    return;
  }
  if (key === "h") {
    e.preventDefault();
    setRailHidden(!document.body.classList.contains("rail-hidden"));
    return;
  }
  if (key === "t") {
    e.preventDefault();
    // Same key, same idea — reach the shelf. In Focus Build that means the
    // temporary drawer, never the persistent preference underneath it.
    if (focusMode) setFocusTrayOpen(!focusTrayOpen);
    else setTrayHidden(!document.body.classList.contains("tray-hidden"));
    return;
  }
  if (key === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if (key === "escape" && cameraMode) {
    setCameraMode(false);
    return;
  }
  // Escape peels one layer at a time: the drawer, then the radial, then the
  // mode itself — so it never drops you out of Focus Build by surprise.
  if (key === "escape" && focusMode) {
    if (focusTrayOpen) setFocusTrayOpen(false);
    else if (radialOpen) closeRadial();
    else setFocusMode(false);
    return;
  }
  if (key === "escape" && adjTarget) {
    adjTarget = null;
    document.getElementById("item-panel")?.classList.add("hidden");
    return;
  }

  // Arrow keys nudge whichever piece the item panel is open on.
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (step && adjTarget?.userData?.record) {
    e.preventDefault();
    const rec = adjTarget.userData.record;
    const amount = NUDGE * (e.shiftKey ? 3 : 1);
    rec.x += step[0] * amount;
    rec.z += step[1] * amount;
    // stay inside the glass at the height the piece actually sits at
    const inside = clampInsideAt(rec.y, rec.x, rec.z, 0.08);
    if (inside) {
      rec.x = inside.x;
      rec.z = inside.z;
    }
    rec.y = surfaceY(rec.x, rec.z);
    adjTarget.position.set(rec.x, rec.y, rec.z);
    studio.markInteraction();
  }
});

// --- HUD: category flyout + favorites + item strip -------------------------
const searchEl = document.getElementById("search");
const stripEl = document.getElementById("item-strip");
const catBtnEl = document.getElementById("cat-btn");
const catFlyoutEl = document.getElementById("cat-flyout");

// The shelf remembers you: the category you were in, where you had scrolled to,
// and the handful of pieces you actually keep reaching for.
const SHELF_KEY = "potroneer-shelf";
const shelf = {
  cat: "plants",
  scroll: 0,
  recent: [], // "group:id", most recent first
  ...JSON.parse(localStorage.getItem(SHELF_KEY) || "{}"),
};
let activeCat = shelf.cat || "plants";
function persistShelf() {
  localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
}
function rememberUse(group, id) {
  const key = `${group}:${id}`;
  shelf.recent = [key, ...shelf.recent.filter((k) => k !== key)].slice(0, 8);
  persistShelf();
}
// The recents live at the top of every category — the shortest path back to the
// piece you used a moment ago, without leaving where you are.
function recentItems() {
  return shelf.recent
    .map((key) => {
      const [group, id] = key.split(":");
      const src =
        group === "jar" ? JAR_TYPES : group === "base" ? BASE_LAYERS : DECORATIONS;
      const item = src.find((x) => x.id === id);
      return item ? { ...item, _group: group, _recent: true } : null;
    })
    .filter(Boolean);
}

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
      shelf.cat = cat.id;
      shelf.scroll = 0;
      persistShelf();
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
    else url = decorationIcon(item.kind, item.variant, item.id);
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
      // Swapping the vessel rebuilds every piece of glass geometry and every
      // layer inside it. On a full jar that is long enough to read as a hang.
      withSceneLoading("নতুন জার বসানো হচ্ছে…", () => setJar(item.id));
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
  const keepScroll = stripEl.scrollTop;
  stripEl.innerHTML = "";

  // Recents ride at the top of every category, unless you are searching or
  // already looking at a list that is itself a shortcut.
  const showRecent = !q && !buildMode && activeCat !== "tray" && activeCat !== "fav";
  const recent = showRecent ? recentItems() : [];
  // Match the name in either language. Labels are authored in Bangla, so an
  // English reader typing "rotala" or "nerite" would otherwise find nothing.
  const hit = (item) =>
    item.label.toLowerCase().includes(q) ||
    tLabel(item.label).toLowerCase().includes(q);
  const items = [...recent, ...stripSource().filter((item) => !q || hit(item))];
  if (recent.length) {
    const head = document.createElement("span");
    head.className = "strip-head";
    head.textContent = t("সদ্য ব্যবহৃত");
    stripEl.appendChild(head);
  }

  items.forEach((item, index) => {
      if (recent.length && index === recent.length) {
        const head = document.createElement("span");
        head.className = "strip-head";
        head.textContent = t("সব");
        stripEl.appendChild(head);
      }
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
      // What the plant actually wants, on the chip itself. A sealed jar suits
      // forest-floor plants and slowly rots desert ones, and that is not
      // something anyone should have to learn the hard way.
      if (item.habitat && HABITATS[item.habitat]) {
        const h = HABITATS[item.habitat];
        card.classList.add(`habitat-${item.habitat}`);
        card.title = `${tLabel(item.label)} — ${t(h.label)} · ${t(h.hint)}`;
        const badge = document.createElement("span");
        badge.className = "item-habitat";
        badge.textContent = { closed: "🫙", open: "🌤️", aquatic: "💧" }[item.habitat];
        badge.title = t(h.hint);
        card.appendChild(badge);
      }
      // The other half of that conversation: which vessels are open. A plant
      // chip carrying 🌤️ and a vessel chip carrying 🌤️ mean the same thing,
      // so the pairing is readable without a manual.
      if (item.openVessel) {
        card.classList.add("habitat-open");
        card.title = `${tLabel(item.label)} — ${t(HABITATS.open.label)} · ${t("খোলা পাত্র: বাতাস চলে, বদ্ধ হয় না")}`;
        const badge = document.createElement("span");
        badge.className = "item-habitat";
        badge.textContent = "🌤️";
        badge.title = t("খোলা পাত্র: বাতাস চলে, বদ্ধ হয় না");
        card.appendChild(badge);
      }
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
            withSceneLoading("নতুন জার বসানো হচ্ছে…", () => setJar(item.id));
          }
        } else {
          selected = { group, id: item.id };
          rememberUse(group, item.id);
          selectTool("place"); // picking a material returns to place mode
        }
        renderStrip();
        updateHint();
        // In Focus Build the shelf is a drawer you visited to fetch one thing:
        // having fetched it, it gets out of the way and the next tap on the
        // glass places rather than reopening the radial.
        if (focusTrayOpen) {
          setFocusTrayOpen(false);
          focusToolArmed = true;
        }
        updateFocusHud();
        studio.markInteraction();
      });
      stripEl.appendChild(card);
    });

  // Put the shelf back where the user left it rather than at the top.
  stripEl.scrollTop = keepScroll || shelf.scroll || 0;
}

stripEl.addEventListener("scroll", () => {
  shelf.scroll = stripEl.scrollTop;
});
window.addEventListener("beforeunload", persistShelf);

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
  // A whole garden arriving at once — from a save, a share link or a co-op
  // peer — is the longest synchronous stall in the app. The message is
  // released on the frame after the rebuild finishes.
  const doneLoading = beginSceneLoading("তোমার টেরারিয়াম তৈরি হচ্ছে…");
  try {
    loadBuildDataNow(build, { history });
  } finally {
    requestAnimationFrame(() => doneLoading());
  }
}

function loadBuildDataNow(build, { history = true } = {}) {
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
  if (build.tableStyle) setTableStyle(build.tableStyle, false);
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

// The progress layer — level, XP, care meters, the daily challenge — does not
// exist until you have actually made something. On a first run the screen is a
// jar and the things you can put in it; scoring a terrarium you have not built
// yet reframes the whole app as something to manage rather than something to
// make. Once you have put the first thing in, it appears and stays for good.
const PROGRESS_SEEN_KEY = "potroneer-progress-seen";
function hasBuiltSomething() {
  return (state.layers?.length || 0) + (state.decorations?.length || 0) > 0;
}
function syncProgressVisibility() {
  let seen = false;
  try {
    seen = localStorage.getItem(PROGRESS_SEEN_KEY) === "1";
  } catch {
    seen = false;
  }
  const earned = seen || hasBuiltSomething() || (game?.level || 1) > 1 || (game?.xp || 0) > 0;
  document.body.classList.toggle("pre-first-build", !earned);
  if (earned && !seen) {
    try {
      localStorage.setItem(PROGRESS_SEEN_KEY, "1");
    } catch {
      /* private mode — it reappears next session once something is in the jar */
    }
  }
}
syncProgressVisibility();

// --- jar customiser (🎨) ----------------------------------------------------
// Frame and glass are picked off a generated spectrum rather than a short list
// of hexes: a neutral ramp across the top, then a hue-by-tone grid underneath.
// Widening the choice is a matter of changing the numbers below.
const SPECTRUM_COLS = 12;

function hslHex(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// One sheet: the leading cell is "default" (null), the rest of the first row is
// a neutral ramp, and each `tones` entry adds a full row of hues.
function spectrumSheet({ neutral, tones }) {
  const cells = [null];
  for (let i = 0; i < SPECTRUM_COLS - 1; i++) {
    const t = i / (SPECTRUM_COLS - 2);
    cells.push(hslHex(0, 0, neutral[0] + (neutral[1] - neutral[0]) * t));
  }
  tones.forEach(([sat, lum]) => {
    for (let i = 0; i < SPECTRUM_COLS; i++) {
      cells.push(hslHex((i * 360) / SPECTRUM_COLS, sat, lum));
    }
  });
  return cells;
}

// Frame came takes the whole range — matte black through brass and painted
// steel to bone white.
const FRAME_COLORS = spectrumSheet({
  neutral: [0.08, 0.97],
  tones: [
    [0.6, 0.2],
    [0.66, 0.34],
    [0.62, 0.48],
    [0.54, 0.63],
    [0.4, 0.78],
  ],
});

// Glass keeps to the pale end: the tint also drives `attenuationColor`, so a
// saturated pick turns the vessel into a solid lump instead of tinted glass.
const GLASS_TINTS = spectrumSheet({
  neutral: [0.62, 0.99],
  tones: [
    [0.26, 0.92],
    [0.4, 0.85],
    [0.5, 0.77],
    [0.56, 0.68],
  ],
});

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

// The spectrum sheets. Same contract as buildSwatches, but laid out as a grid
// and with the current pick echoed beside the label, since one cell out of
// sixty is too small to find by looking for the ring.
function buildSpectrum(containerId, currentId, colors, getActive, onPick) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  el.style.setProperty("--cols", SPECTRUM_COLS);
  colors.forEach((hex) => {
    const b = document.createElement("button");
    b.className = hex ? "sw-cell" : "sw-cell sw-cell--none";
    b.title = hex ?? t("ডিফল্ট");
    if (hex) b.style.setProperty("--sw", hex);
    b.classList.toggle("is-active", getActive() === hex);
    b.addEventListener("click", () => {
      onPick(hex);
      buildSpectrum(containerId, currentId, colors, getActive, onPick);
    });
    el.appendChild(b);
  });
  const cur = document.getElementById(currentId);
  if (cur) {
    const hex = getActive();
    cur.textContent = hex ?? t("ডিফল্ট");
    cur.style.setProperty("--sw", hex ?? "transparent");
    cur.classList.toggle("is-default", !hex);
  }
}

function refreshJarSwatches() {
  buildSpectrum("frame-swatches", "frame-current", FRAME_COLORS, () => jarCustom.frame, (hex) => {
    jarCustom.frame = hex;
    applyJarColors();
  });
  buildSpectrum("glass-swatches", "glass-current", GLASS_TINTS, () => jarCustom.glass, (hex) => {
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

// the hinged door — mirrored by tapping its knob in the scene
document.getElementById("door-toggle").addEventListener("click", toggleJarDoor);

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
  removePiece(adjTarget);
});

// --- move ------------------------------------------------------------------
// Dragging is the fast way to move a piece and it stays the primary one. This
// is the other way in: on a phone, picking a specific fern out of a crowded
// jar with a fingertip is genuinely hard, and once the menu is open the piece
// is already unambiguously chosen. Arming it turns the next tap into "put it
// there" — one tap, no precision grab required.
function armMove(obj) {
  if (!obj?.userData?.record) return;
  movePending = obj;
  itemPanelEl.classList.add("hidden");
  document.body.classList.add("move-armed");
  setHoverPiece(obj); // keep the piece lit so it is clear what is being moved
  flashHint("কোথায় বসাতে চাও সেখানে ট্যাপ করো");
  updateToolStatus();
}

function cancelMove() {
  if (!movePending) return;
  movePending = null;
  document.body.classList.remove("move-armed");
  updateToolStatus();
}

/** Finish an armed move at a screen point. Returns false if it could not land. */
function completeMove(screen) {
  const obj = movePending;
  if (!obj) return false;
  const hit = studio.raycast(screen, surfaceTargets());
  if (!hit) return false; // aimed off the substrate — stay armed, try again
  cancelMove();
  if (!obj.parent) return true; // deleted while the move was armed
  snapshot();
  const local = studio.world.worldToLocal(hit.point.clone());
  const spot = snapPlacement(obj, local.x, local.z);
  const rec = obj.userData.record;
  const ground = surfaceY(spot.x, spot.z);
  rec.x = spot.x;
  rec.z = spot.z;
  rec.y = ground;
  const fromX = obj.position.x;
  const fromZ = obj.position.z;
  const base = obj.userData.baseScale ?? 1;
  if (calmMotion()) {
    obj.position.set(spot.x, ground, spot.z);
  } else {
    // It travels rather than teleporting, so the piece you were moving and the
    // piece that ends up over there are visibly the same piece.
    tween(340, (k) => {
      obj.position.set(
        fromX + (spot.x - fromX) * k,
        ground + Math.sin(k * Math.PI) * 0.12, // a small arc, like a carry
        fromZ + (spot.z - fromZ) * k,
      );
      obj.scale.setScalar(base * (1 + Math.sin(k * Math.PI) * 0.06));
    }, easeOut);
  }
  confirmPlacement(obj);
  return true;
}

document.getElementById("item-move").addEventListener("click", () => armMove(adjTarget));

// --- duplicate -------------------------------------------------------------
// A copy of everything the record carries — kind, scale, tint, rotation — set
// down beside the original rather than exactly on top of it, where it would
// look like nothing had happened.
document.getElementById("item-dupe").addEventListener("click", () => {
  const source = adjTarget;
  if (!source?.userData?.record) return;
  if (state.decorations.length >= (window.innerWidth < 700 ? 72 : 120)) {
    flashHint("জার ভরে গেছে — নকল করা গেল না।");
    return;
  }
  snapshot();
  const rec = source.userData.record;
  const def = DECORATIONS.find((d) => d.id === rec.id);
  const copy = getModelClone(rec.kind, rec.id) ?? buildDecoration(rec.kind, def?.variant);

  // Offset by a little over its own footprint, then let the same spacing rule
  // the drag uses push it the rest of the way clear.
  const a = Math.random() * Math.PI * 2;
  const step = 0.2 * (rec.scale ?? 1);
  const spot = snapPlacement(copy, rec.x + Math.cos(a) * step, rec.z + Math.sin(a) * step);
  const inside = clampInsideAt(rec.y, spot.x, spot.z, 0.08);
  const x = inside ? inside.x : spot.x;
  const z = inside ? inside.z : spot.z;

  const record = {
    id: rec.id,
    kind: rec.kind,
    x,
    z,
    y: surfaceY(x, z),
    rotation: rec.rotation + (Math.random() - 0.5) * 0.5, // never a perfect twin
    scale: rec.scale,
    tint: rec.tint ?? null,
  };
  copy.rotation.y = record.rotation;
  copy.rotation.x = source.rotation.x;
  copy.rotation.z = source.rotation.z;
  copy.position.set(record.x, record.y, record.z);
  copy.userData.record = record;
  copy.userData.baseScale = record.scale;
  if (record.tint) applyTint(copy, record.tint);
  decorGroup.add(copy);
  addDecoration(state, record);

  if (calmMotion()) copy.scale.setScalar(record.scale);
  else tween(380, (k) => copy.scale.setScalar(0.001 + k * record.scale));
  confirmPlacement(copy);
  // The menu follows the copy: duplicating twice in a row should make two
  // copies of what you were looking at, not a copy of a copy of a copy.
  openItemPanel(copy);
  gameAction("plant", rec.kind);
  updateHint();
});

/**
 * Take a piece out of the garden. The data goes immediately — undo, autosave
 * and the hint all read the model, and none of them should see a plant that is
 * only mid-dissolve. The mesh lingers for a third of a second, shrinking and
 * fading, so the removal is something you watched happen at a place rather
 * than a gap you notice afterwards.
 */
function removePiece(obj) {
  if (!obj?.userData?.record) return;
  snapshot();
  const rec = obj.userData.record;
  const i = state.decorations.indexOf(rec);
  if (i >= 0) state.decorations.splice(i, 1);
  if (obj === adjTarget) {
    adjTarget = null;
    itemPanelEl.classList.add("hidden");
  }
  if (obj === grabbed) grabbed = null;
  if (obj === movePending) cancelMove();
  if (obj === hoverPiece) setHoverPiece(null);

  const from = obj.scale.x;
  const at = obj.position.clone();
  obj.userData.dying = true;
  playSfx("tap");
  if (calmMotion()) {
    decorGroup.remove(obj);
  } else {
    // Lifted out and shrunk, like something picked up and carried off. Fading
    // needs transparent materials, and these are shared clones — so the copy
    // is made here, for the third of a second it is needed.
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const many = Array.isArray(o.material);
      const fading = (many ? o.material : [o.material]).map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        return c;
      });
      o.material = many ? fading : fading[0];
    });
    tween(320, (k) => {
      obj.scale.setScalar(from * (1 - k));
      obj.position.y = at.y + k * 0.12;
      obj.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => (m.opacity = 1 - k));
      });
      if (k < 1) return;
      decorGroup.remove(obj);
      // Those clones exist only for this animation. Geometry is left alone —
      // it is shared with every other copy of this plant in the jar.
      obj.traverse((o) => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    }, easeOut);
  }
  updateHint();
  updateEmptyCall();
  studio.markInteraction();
}

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
    const target = el.querySelector(".nav-text, .focus-text");
    if (target) target.textContent = label;
    else el.textContent = label;
    if (el.hasAttribute("title")) el.title = label;
  });
  // Glyph-only buttons carry their whole word in the tooltip, so rewriting
  // their text would throw the glyph away. These get the label without it.
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const label = t(el.dataset.i18nTitle);
    el.title = label;
    el.setAttribute("aria-label", label);
  });
  searchEl.placeholder = t("খোঁজো…");
  // The fold buttons are glyph-only, so they carry their words in the tooltip.
  for (const [id, key] of [
    ["tray-hide", "সাইডবার লুকাও"],
    ["tray-show", "সাইডবার দেখাও"],
  ]) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.title = `${t(key)} (T)`;
    btn.setAttribute("aria-label", t(key));
  }
  const cat = CATEGORIES.find((c) => c.id === activeCat);
  if (cat) catBtnEl.querySelector(".cat-name").textContent = t(cat.label);
  renderTools();
  renderStrip();
  updateHint();
  updateFocusHud(); // the "currently holding" readout is a label like any other
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
// The invitation shows only on a genuinely empty jar, and only until the first
// layer lands — after that this player knows how to start, forever.
function updateEmptyCall() {
  // Everything is looked up on each call: this runs during start-up too, before
  // the module's own constants further down the file have been evaluated.
  const el = document.getElementById("empty-call");
  if (!el) return;
  const started = localStorage.getItem("potroneer-started") === "1";
  const empty = !hasBase(state) && state.decorations.length === 0;
  if (!started && !empty) localStorage.setItem("potroneer-started", "1");
  el.classList.toggle("hidden", started || !empty);
}

function updateHint() {
  // The depth readout says how much room is left, which every pour, undo and
  // reset changes. This is the one call they all already make.
  renderDepth();
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

// --- tool status -----------------------------------------------------------
// One pill that always answers "what happens if I press now?". The tab strip
// already shows which tool is armed, but only while you are looking at it —
// and the moment that matters is the moment your eyes are on the jar. Each
// tool gets a mode name and a verb phrase for its next action, because the
// name alone ("moss brush") does not tell a newcomer whether to tap or drag.
// Looked up on demand, not captured in module-scope consts. `updateFocusHud`
// calls this during start-up, well before this point in the file is evaluated,
// and a `const` read from up there is a TDZ throw that would take the rest of
// main.js down with it — the same trap the phone workspace hit.
function updateToolStatus() {
  const toolStatusEl = document.getElementById("tool-status");
  if (!toolStatusEl) return;
  // The depth row lives in this pill and answers the same question it does —
  // what a press will do — so it is refreshed on the same beat.
  renderDepth();
  const toolStatusGlyphEl = document.getElementById("tool-status-glyph");
  const toolStatusModeEl = document.getElementById("tool-status-mode");
  const toolStatusDoesEl = document.getElementById("tool-status-does");
  const entry = TOOL_MODES[activeTool] ?? TOOL_MODES.place;
  let glyph = entry.glyph;
  let mode = entry.mode;
  let does = entry.does ?? "";

  // The tweezers are three modes wearing one name, and which one you are in
  // depends entirely on what is on them — so this is the case worth spelling
  // out rather than just printing "place".
  // Item names are catalog labels and the verb phrases are dictionary keys, so
  // each half is translated on its own and only then joined — running the
  // joined sentence through t() would miss every time and print raw Bengali
  // into an English UI.
  let holding = null;
  if (activeTool === "place") {
    if (selected.group === "base") {
      const def = BASE_LAYERS.find((entry2) => entry2.id === selected.id);
      mode = "বেস মোড";
      glyph = "🪵";
      holding = def ? tLabel(def.label) : null;
      does = "ট্যাপ করে স্তর দাও";
    } else if (selected.group === "decor") {
      const def = DECORATIONS.find((entry2) => entry2.id === selected.id);
      mode = "বসানোর মোড";
      holding = def ? tLabel(def.label) : null;
      does = "ট্যাপ করে বসাও";
    } else {
      mode = "নির্বাচনের মোড";
      does = "জিনিস বেছে নিতে ট্যাপ করো, সরাতে টেনে নাও";
    }
    // An armed move overrides everything: the next press is a destination.
    if (movePending) {
      mode = "সরানোর মোড";
      glyph = "✥";
      holding = null;
      does = "কোথায় বসাতে চাও সেখানে ট্যাপ করো";
    } else if (hoverPiece) {
      mode = "সরানোর মোড";
      glyph = "✋";
      holding = null;
      does = "তুলতে টেনে নাও, মেনুর জন্য ট্যাপ করো";
    }
  }

  const phrase = does ? (holding ? `${holding} — ${t(does)}` : t(does)) : "";
  toolStatusGlyphEl.textContent = glyph;
  toolStatusModeEl.textContent = t(mode);
  toolStatusDoesEl.textContent = phrase;
  toolStatusEl.classList.toggle("has-does", Boolean(phrase));
  toolStatusEl.dataset.tool = activeTool;
}

// --- loading feedback ------------------------------------------------------
// Counted rather than boolean: a jar rebuild and a room download can overlap,
// and the first to finish must not clear a message the second still needs.
let busyCount = 0;
let busyLabel = "তোমার টেরারিয়াম তৈরি হচ্ছে…";

function renderSceneLoading() {
  const el = document.getElementById("scene-loading");
  if (!el) return;
  el.classList.toggle("hidden", busyCount <= 0);
  const text = document.getElementById("scene-loading-text");
  if (busyCount > 0 && text) text.textContent = t(busyLabel);
}

/** Mark the scene busy; returns the function that marks it done again. */
function beginSceneLoading(label) {
  if (label) busyLabel = label;
  busyCount++;
  renderSceneLoading();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busyCount = Math.max(0, busyCount - 1);
    renderSceneLoading();
  };
}

/**
 * Run slow synchronous work with the message on screen. The browser will not
 * paint between a class change and a blocking rebuild in the same task, so the
 * work is deferred by two frames — otherwise the message appears only after
 * the very thing it was meant to cover has already finished.
 */
function withSceneLoading(label, work) {
  const done = beginSceneLoading(label);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      try {
        work();
      } finally {
        done();
      }
    }),
  );
}

studio.setBusyReporter((delta) => {
  if (delta > 0) {
    busyLabel = "দৃশ্য আনা হচ্ছে…";
    busyCount++;
  } else {
    busyCount = Math.max(0, busyCount - 1);
  }
  renderSceneLoading();
});

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
document.getElementById("redo").addEventListener("click", redo);
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
    e.preventDefault();
    redo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    redo();
    return;
  }
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
// --- photo mode ------------------------------------------------------------
// The filters and the save button were already here; what was missing is the
// *mode* around them. A photograph of a terrarium should not have the shelf,
// the mode tabs and a tool pill in it, and it should not be framed for
// building — which leaves room above the jar for the tweezers to come down.
//
// So opening photo mode clears the building chrome away, pulls the camera in,
// and offers the four angles. Closing it puts all of that back, including the
// camera pose, so stepping in to take a picture never costs you the view you
// were working in.
// A photograph is framed tighter than a workbench. 0.76 leaves headroom for
// the tweezers to come down into; nothing reaches into a picture.
const PHOTO_FILL = 0.9;

function setPhotoMode(on) {
  document.body.classList.toggle("photo-mode", on);
  // Softer key-to-fill and a firmer contact shadow — see setPhotoLighting.
  studio.setPhotoLighting?.(on);
  if (on) {
    clearHover(); // no marker, ghost or tweezers in the shot
    photoReturnView = activeView;
    studio.setView?.("three-quarter", { fill: PHOTO_FILL });
    activeView = null;
  } else {
    // Back to the angle the build was in, or out of presets entirely.
    if (photoReturnView) setCameraView(photoReturnView);
    else if (activeView) setCameraView(activeView);
    photoReturnView = null;
  }
  updateHint();
}
let photoReturnView = null;

document.getElementById("photo").addEventListener("click", () => {
  document.getElementById("photo-panel").classList.remove("hidden");
  renderPhotoFilters();
  setPhotoMode(true);
});
document.getElementById("photo-close").addEventListener("click", () => {
  document.getElementById("photo-panel").classList.add("hidden");
  setPhotoMode(false);
});
document.querySelectorAll(".photo-angle").forEach((b) => {
  b.addEventListener("click", () => {
    // The three-quarter entry is the way *out* of a preset, so asking for it
    // when it is already active would toggle it off. Name it explicitly.
    studio.setView?.(b.dataset.view, { fill: PHOTO_FILL });
    activeView = b.dataset.view === "three-quarter" ? null : b.dataset.view;
    document.querySelectorAll(".photo-angle").forEach((other) => {
      other.classList.toggle("is-active", other === b);
    });
  });
});
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
// --- named camera angles ---------------------------------------------------
// Front, side and top. Pressing the one you are already in steps back out to
// wherever the eye was before, so these are a place to visit rather than a mode
// to escape from. The pressed state is what says which of those two a press
// will do.
let activeView = null;
function setCameraView(name) {
  if (activeView === name) {
    studio.restoreViewPose?.();
    activeView = null;
  } else if (studio.setView?.(name)) {
    activeView = name;
  }
  document.querySelectorAll(".cam-view-btn").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.view === activeView));
    b.classList.toggle("is-active", b.dataset.view === activeView);
  });
}
document.querySelectorAll(".cam-view-btn").forEach((b) => {
  b.addEventListener("click", () => setCameraView(b.dataset.view));
});
// Any hand-drag of the camera means the eye is no longer where a preset put it.
// A *tap* is not that: placing a layer from the top view should leave you in
// the top view. So this waits for real travel before letting the preset go.
const VIEW_DRAG_SLOP = 8;
let viewPressAt = null;
canvas.addEventListener("pointerdown", (e) => {
  viewPressAt = activeView ? { x: e.clientX, y: e.clientY } : null;
});
canvas.addEventListener("pointermove", (e) => {
  if (!viewPressAt || !activeView) return;
  if (Math.hypot(e.clientX - viewPressAt.x, e.clientY - viewPressAt.y) < VIEW_DRAG_SLOP) return;
  viewPressAt = null;
  activeView = null;
  document.querySelectorAll(".cam-view-btn").forEach((b) => {
    b.setAttribute("aria-pressed", "false");
    b.classList.remove("is-active");
  });
});
canvas.addEventListener("pointerup", () => (viewPressAt = null));

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
document.getElementById("coop-btn").addEventListener("click", () => {
  coopModal.classList.remove("hidden");
  renderCoopPanel();
  setCoopStatus(coopStatus);
  if (!social.isCloud) coopStatusLine(coopErrorText({ code: "NO_SUPABASE" }), true);
});
// Closing the panel is not leaving the room. You close it to get at the jar,
// which is the entire point of being in a room together.
document.getElementById("coop-close").addEventListener("click", () => coopModal.classList.add("hidden"));
document.getElementById("coop-create").addEventListener("click", createCoopRoom);
document.getElementById("coop-join").addEventListener("click", joinCoopRoom);
document.getElementById("coop-leave").addEventListener("click", () => {
  // Only worth a confirmation while someone else is actually in there with you;
  // leaving an empty room is not a decision anyone needs protecting from.
  const alone = document.getElementById("coop-partner")?.dataset.alone !== "false";
  if (alone || window.confirm(socialMessage("ঘর ছেড়ে যাবে?", "Leave the room?"))) {
    leaveCoopRoom();
  }
});
document.getElementById("coop-copy-code").addEventListener("click", async () => {
  if (!coopRoom) return;
  await copyCoopText(coopRoom.code, socialMessage("কোড কপি হয়েছে।", "Room code copied."));
});

/** Clipboard access is refused in plenty of ordinary situations; showing the
 *  text is more use than an apology. */
async function copyCoopText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    coopStatusLine(okMessage);
  } catch {
    coopStatusLine(text);
  }
}

// --- co-op session ---------------------------------------------------------

const COOP_STATUS_TEXT = {
  connecting: ["সংযোগ হচ্ছে…", "Connecting…"],
  connected: ["সংযুক্ত", "Connected"],
  reconnecting: ["আবার সংযোগ হচ্ছে…", "Reconnecting…"],
  disconnected: ["সংযোগ নেই", "Disconnected"],
};

const COOP_ERROR_TEXT = {
  NO_SUPABASE: [
    "কো-অপের জন্য একটি যুক্ত Supabase প্রজেক্ট দরকার।",
    "Co-op requires a connected Supabase project.",
  ],
  AUTH_REQUIRED: ["কো-অপে ঢুকতে সাইন ইন করতে হবে।", "You need to sign in to use co-op."],
  SESSION_EXPIRED: [
    "লগইনের মেয়াদ শেষ — আবার সাইন ইন করো।",
    "Your login has expired — sign in again.",
  ],
  ROOM_NOT_FOUND: ["এই কোডে কোনো ঘর নেই।", "No room with that code."],
  ROOM_FULL: ["ঘরটিতে ইতিমধ্যে দুজন আছে।", "That room already has two gardeners."],
  NOT_A_MEMBER: ["এই ঘরে তোমার প্রবেশাধিকার নেই।", "You do not have access to that room."],
  UNAUTHORIZED: ["এই ঘরে ঢোকার অনুমতি নেই।", "Not allowed to join that room."],
  TIMEOUT: ["ঘরে পৌঁছানো গেল না — নেটওয়ার্ক দেখো।", "Could not reach the room — check your network."],
  UNKNOWN: ["কো-অপে সমস্যা হয়েছে।", "Something went wrong with co-op."],
};

function coopErrorText(error) {
  const entry = COOP_ERROR_TEXT[error?.code] ?? COOP_ERROR_TEXT.UNKNOWN;
  return socialMessage(entry[0], entry[1]);
}

function coopStatusLine(text, isError = false) {
  const el = document.getElementById("coop-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", !!isError);
}

function setCoopStatus(status) {
  coopStatus = status;
  const pill = document.getElementById("coop-connection");
  if (pill) {
    const entry = COOP_STATUS_TEXT[status] ?? COOP_STATUS_TEXT.disconnected;
    pill.textContent = socialMessage(entry[0], entry[1]);
    pill.dataset.state = status;
  }
  document.body.classList.toggle("coop-live", status === "connected");
}

function renderCoopPanel({ members = 0, names = [] } = {}) {
  const inRoom = !!coopRoom;
  document.getElementById("coop-room-view")?.classList.toggle("hidden", !inRoom);
  document.getElementById("coop-join-view")?.classList.toggle("hidden", inRoom);
  const me = document.getElementById("coop-me");
  if (me) {
    me.textContent = socialUser
      ? socialUser.displayName ||
        socialUser.user_metadata?.display_name ||
        socialUser.email?.split("@")[0] ||
        "Gardener"
      : socialMessage("অতিথি", "Guest");
  }
  if (inRoom) {
    document.getElementById("coop-code").textContent = coopRoom.code;
    const count = document.getElementById("coop-members");
    if (count) {
      const n = Math.max(members, 1);
      count.textContent =
        getLang() === "bn"
          ? `${toUiDigits(n)} জন যুক্ত`
          : `${n} ${n === 1 ? "gardener" : "gardeners"} connected`;
    }
    const partner = document.getElementById("coop-partner");
    if (partner) {
      const others = names.filter((name) => name && name !== me?.textContent);
      partner.textContent = others.length
        ? others.join(", ")
        : socialMessage("সঙ্গীর অপেক্ষায়…", "Waiting for your partner…");
      // Read by the leave button to decide whether leaving needs confirming.
      partner.dataset.alone = others.length ? "false" : "true";
    }
  }
}

/** Shared by "create" and "join": open the channel and wire it up. */
async function enterCoopRoom(room, { seedFromRoom }) {
  coopRoom = { id: room.id, code: room.code };
  coopRevision = Number(room.revision ?? 0);
  setCoopStatus("connecting");
  renderCoopPanel();

  // Joining somebody's room replaces what is on screen, so the solo jar is put
  // aside first and handed back when you leave. Nothing a person built is ever
  // simply gone.
  if (!coopLocalBuild) coopLocalBuild = { build: currentBuildData(), game: structuredClone(game) };

  try {
    await social.openCoopChannel(room, {
      onSnapshot: applyCoopSnapshot,
      onPresence: (members, names) => renderCoopPanel({ members, names }),
      onStatus: (status) => {
        setCoopStatus(status);
        if (status === "connected") {
          // A reconnect can land after the room moved on, so ask the row what
          // the truth is rather than trusting whatever was last on screen.
          refreshCoopState();
        }
      },
    });
  } catch (error) {
    coopRoom = null;
    setCoopStatus("disconnected");
    renderCoopPanel();
    coopStatusLine(coopErrorText(error), true);
    return false;
  }

  if (seedFromRoom && room.build && Object.keys(room.build).length) {
    // Late joiner: open into the garden as it stands.
    applyCoopSnapshot({ revision: coopRevision, build: room.build, game: room.game });
  } else {
    // Room creator: the room starts as whatever is in front of them.
    broadcastCoopSnapshot();
  }
  unlockGameAchievement("team-gardener");
  scheduleAutosave();
  return true;
}

async function refreshCoopState() {
  if (!coopRoom) return;
  try {
    const fresh = await social.fetchCoopState(coopRoom.id);
    if (!fresh) return;
    const revision = Number(fresh.revision ?? 0);
    if (revision > coopRevision && fresh.build && Object.keys(fresh.build).length) {
      applyCoopSnapshot({ revision, build: fresh.build, game: fresh.game });
    }
  } catch (error) {
    coopStatusLine(coopErrorText(error), true);
  }
}

/** Guard shared by both entry points: cloud configured, and signed in. */
function coopPreflight(resume) {
  if (!social.isCloud) {
    coopStatusLine(coopErrorText({ code: "NO_SUPABASE" }), true);
    return false;
  }
  if (needsAccount("coop", resume)) return false;
  return true;
}

async function createCoopRoom() {
  if (!coopPreflight(createCoopRoom)) return;
  coopStatusLine(socialMessage("ঘর তৈরি হচ্ছে…", "Creating a room…"));
  try {
    const room = await social.createCoopRoom({ build: currentBuildData(), game });
    await enterCoopRoom(room, { seedFromRoom: false });
  } catch (error) {
    coopStatusLine(coopErrorText(error), true);
  }
}

async function joinCoopRoom() {
  const input = document.getElementById("coop-room");
  const code = (input?.value || pendingRoomInvite || "").trim().toUpperCase();
  if (!code) {
    coopStatusLine(socialMessage("রুম কোড দাও।", "Enter a room code."), true);
    return;
  }
  pendingRoomInvite = code;
  document.getElementById("auth-room-code").textContent = code;
  if (!coopPreflight(joinCoopRoom)) return;
  coopStatusLine(socialMessage("ঘরে ঢোকা হচ্ছে…", "Joining the room…"));
  try {
    const room = await social.joinCoopRoomByCode(code);
    await enterCoopRoom(room, { seedFromRoom: true });
  } catch (error) {
    coopStatusLine(coopErrorText(error), true);
  }
}

async function leaveCoopRoom() {
  const room = coopRoom;
  coopRoom = null;
  clearTimeout(coopTimer);
  clearTimeout(coopPersistTimer);
  setCoopStatus("disconnected");
  try {
    await social.leaveCoop(room?.id);
  } catch {
    /* already disconnected */
  }
  // Give back the jar they walked in with.
  if (coopLocalBuild) {
    coopApplying = true;
    try {
      hydrateGameState(game, coopLocalBuild.game);
      loadBuildData(coopLocalBuild.build, { history: false });
      renderGameHud();
    } finally {
      coopApplying = false;
    }
    coopLocalBuild = null;
  }
  renderCoopPanel();
  coopStatusLine(socialMessage("ঘর ছেড়ে এসেছো — নিজের বাগানে ফিরলে।", "Left the room — back in your own garden."));
  scheduleAutosave();
}

// Closing the tab should not leave a ghost in the room. `untrack` on the way
// out is what makes the other side's member count drop promptly instead of
// waiting for a presence timeout.
window.addEventListener("pagehide", () => {
  if (coopRoom) social.closeCoopChannel?.();
});

const soundBtn = document.getElementById("sound");
const volumeSlider = document.getElementById("volume");

// The fader paints its own fill, so the level is readable at a glance rather
// than only under the thumb.
function paintFader() {
  volumeSlider.style.setProperty("--fill", `${volumeSlider.value}%`);
}
function syncSoundUi(on) {
  soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
  soundBtn.classList.toggle("is-active", on);
  soundBtn.querySelector(".sound-ico").textContent = on ? "🔊" : "🔇";
}

soundBtn.addEventListener("click", () => {
  const on = toggleAmbience();
  syncSoundUi(on);
  comfort.sound = on;
  persistComfort();
});

volumeSlider.addEventListener("input", () => {
  comfort.volume = Number(volumeSlider.value);
  setVolume(comfort.volume / 100);
  paintFader();
  // Nudging the fader while muted is a request to hear it.
  if (comfort.volume > 0 && !isPlaying()) {
    toggleAmbience();
    syncSoundUi(true);
    comfort.sound = true;
  }
});
volumeSlider.addEventListener("change", persistComfort);

// Slow auto-spin: the jar turns by itself so the back of the build can be
// worked on without wrestling the camera round to it.
const autoSpinBtn = document.getElementById("autospin");
autoSpinBtn.addEventListener("click", () => {
  const on = !studio.isAutoSpin();
  studio.setAutoSpin(on);
  autoSpinBtn.setAttribute("aria-pressed", on ? "true" : "false");
  autoSpinBtn.classList.toggle("is-active", on);
  studio.markInteraction();
});

// --- rail: fold the whole interface away, and bring it back ----------------
const rail = document.getElementById("rail");
function setRailHidden(hidden) {
  document.body.classList.toggle("rail-hidden", hidden);
  document.getElementById("rail-hide")?.setAttribute("aria-expanded", hidden ? "false" : "true");
  if (hidden) moreMenu?.classList.add("hidden");
}
document.getElementById("rail-hide").addEventListener("click", () => setRailHidden(true));
document.getElementById("rail-show").addEventListener("click", () => setRailHidden(false));
void rail;

// --- left tray column: fold it away by hand, and remember the choice --------
// The rail hides the *whole* interface; this is the smaller, everyday gesture —
// push the item column out of the way to see the jar, keep every other control.
const TRAY_OPEN_KEY = "potroneer-tray-open";
function setTrayHidden(hidden, remember = true) {
  document.body.classList.toggle("tray-hidden", hidden);
  document.getElementById("tray-hide")?.setAttribute("aria-expanded", hidden ? "false" : "true");
  document.getElementById("tray-show")?.setAttribute("aria-expanded", hidden ? "false" : "true");
  if (hidden) catFlyoutEl?.classList.add("hidden");
  if (remember) localStorage.setItem(TRAY_OPEN_KEY, hidden ? "0" : "1");
}
document.getElementById("tray-hide")?.addEventListener("click", () => setTrayHidden(true));
document.getElementById("tray-show")?.addEventListener("click", () => setTrayHidden(false));
setTrayHidden(localStorage.getItem(TRAY_OPEN_KEY) === "0", false);

const moreBtn = document.getElementById("more-btn");
const moreMenu = document.getElementById("more-menu");
moreBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  moreMenu.classList.toggle("hidden");
});
document.getElementById("focus-btn").addEventListener("click", () => setFocusMode());
document.getElementById("focus-exit").addEventListener("click", () => {
  setFocusMode(false);
  // On a phone, leaving is a decision — remember it rather than dropping them
  // back into focus on the next load.
  if (document.body.classList.contains("is-phone")) {
    try {
      localStorage.setItem(PHONE_CHOSE_KEY, "0");
    } catch {
      /* private mode — the phone default simply returns next session */
    }
  }
});
document.getElementById("focus-quick").addEventListener("click", openRadial);
document.getElementById("focus-undo").addEventListener("click", undo);
document.getElementById("focus-redo").addEventListener("click", redo);
document.getElementById("focus-center").addEventListener("click", () => {
  studio.resetView?.();
  studio.markInteraction();
});
document.getElementById("focus-lock").addEventListener("click", () => {
  setCameraLock(!cameraLocked);
  flashHint(cameraLocked ? "ক্যামেরা লক — জার আর ঘুরবে না।" : "ক্যামেরা খোলা — টেনে ঘোরাও।");
});
// Zoom without a second finger. The buttons disable themselves at the ends of
// the range rather than going quietly dead, so the limit is visible.
function syncZoomButtons() {
  const inBtn = document.getElementById("zoom-in");
  const outBtn = document.getElementById("zoom-out");
  if (inBtn) inBtn.disabled = studio.canZoom ? !studio.canZoom(-1) : false;
  if (outBtn) outBtn.disabled = studio.canZoom ? !studio.canZoom(1) : false;
}
for (const [id, direction] of [["zoom-in", -1], ["zoom-out", 1]]) {
  document.getElementById(id)?.addEventListener("click", () => {
    studio.zoomStep?.(direction);
    studio.markInteraction();
    syncZoomButtons();
  });
}
syncZoomButtons();

// Reset: back to the framing the app opened on. Zoom, pitch and turn all drift
// over a long session and there is no way to undo a camera, so this is the one
// control that always gets you back to a shot you can work in.
// --- button click sound ----------------------------------------------------
// One delegated listener rather than a call in every handler, so a control
// added later is audible without anyone remembering to make it so. It rides on
// pointerdown, not click: the sound belongs to the press, and waiting for the
// release puts it noticeably behind the button's own movement.
//
// Gated twice over — the ambience switch has to be on at all (that is what
// unlocks the audio context) and the click sound has its own opt-out, because
// wanting room tone is not the same as wanting a tick on every press.
const CLICKABLE = [
  ".nav-btn", ".hud-btn", ".focus-btn", ".cam-zoom-btn", ".tab", ".cat-btn",
  ".item-chip", ".tool-row", ".social-primary", ".social-ghost", ".auth-mode",
  ".coop-copy", ".item-act", ".quality-opt", ".tray-show", ".tray-hide",
  ".rail-show", ".rail-hide", ".focus-tray-edge", ".cam-exit", ".theme-card",
].join(",");

document.addEventListener(
  "pointerdown",
  (event) => {
    if (comfort.clickSound === false) return;
    const button = event.target.closest?.(CLICKABLE);
    if (!button) return;
    // A press on something that cannot act is not a click.
    if (button.disabled || button.classList.contains("is-disabled")) return;
    playSfx("click");
  },
  true,
);

document.getElementById("cam-reset")?.addEventListener("click", () => {
  studio.resetView?.();
  syncZoomButtons();
  flashHint("ক্যামেরা আবার আগের জায়গায়।");
});

// The phone workspace hides the rail, so the More menu needs a door inside the
// dock or themes, settings and the gallery become unreachable there.
const focusMoreBtn = document.getElementById("focus-more");
focusMoreBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  document.getElementById("more-menu")?.classList.toggle("hidden");
});

// Two ways to the same drawer: the HUD button, and an edge pull for a thumb
// that is already down by the glass.
for (const id of ["focus-tray", "focus-tray-edge"]) {
  document.getElementById(id)?.addEventListener("click", () => setFocusTrayOpen(!focusTrayOpen));
}
// --- camera mode -----------------------------------------------------------
// Composing a photo is its own activity: the interface steps out of the way,
// a 4:5 window shows exactly what the frame will hold, and the last three
// exposures stay on a stack so a good one is never a click away from lost.
const cameraModeEl = document.getElementById("camera-mode");
const shotStackEl = document.getElementById("shot-stack");
const shots = []; // newest first, at most three
let cameraMode = false;
let railWasHidden = false;

function setCameraMode(on) {
  cameraMode = on;
  cameraModeEl.classList.toggle("hidden", !on);
  // Photo mode clears the screen down to the frame and the shutter; the tool
  // readout is HUD like any other and goes with it.
  document.body.classList.toggle("camera-on", on);
  document.getElementById("calm-camera")?.classList.toggle("is-active", on);
  if (on) {
    railWasHidden = document.body.classList.contains("rail-hidden");
    setRailHidden(true);
    studio.resetView?.();
  } else if (!railWasHidden) {
    setRailHidden(false);
  }
}

function renderShots() {
  shotStackEl.innerHTML = "";
  shots.forEach((url, i) => {
    const thumb = document.createElement("button");
    thumb.className = "shot-thumb";
    thumb.style.backgroundImage = `url(${url})`;
    thumb.title = t("ছবি সেভ করো");
    thumb.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `potroneer-${Date.now()}-${i}.png`;
      a.click();
      flashHint("ছবি সেভ হয়ে গেছে! বন্ধুদের দেখাও।");
    });
    shotStackEl.appendChild(thumb);
  });
}

function takeShot() {
  const url = studio.capture();
  shots.unshift(url);
  if (shots.length > 3) shots.pop();
  renderShots();
  playSfx("save");
  const flash = document.createElement("div");
  flash.className = "cam-flash";
  cameraModeEl.appendChild(flash);
  setTimeout(() => flash.remove(), 380);
  unlockGameAchievement("photographer");
}

document.getElementById("calm-camera").addEventListener("click", () => setCameraMode(!cameraMode));
document.getElementById("cam-exit").addEventListener("click", () => setCameraMode(false));
document.getElementById("cam-shutter").addEventListener("click", takeShot);
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
  if (isPlaying() !== comfort.sound) syncSoundUi(toggleAmbience());
  persistComfort();
});
document.getElementById("comfort-click").addEventListener("change", (event) => {
  comfort.clickSound = event.target.checked;
  persistComfort();
});
document.querySelectorAll(".quality-opt").forEach((button) => {
  button.addEventListener("click", () => {
    comfort.quality = button.dataset.quality;
    applyComfortSettings();
    persistComfort();
    flashHint(
      comfort.quality === "low"
        ? t("মসৃণ চলা চালু — ছায়া আর কণা কমানো হলো।")
        : t("ভালো ছবি চালু — পুরো ছায়া আর কণা ফিরে এলো।"),
    );
  });
});
document.getElementById("comfort-transparency").addEventListener("change", (event) => {
  comfort.reducedTransparency = event.target.checked;
  applyComfortSettings();
  persistComfort();
});
document.getElementById("comfort-contrast").addEventListener("change", (event) => {
  comfort.highContrast = event.target.checked;
  applyComfortSettings();
  persistComfort();
});
document.getElementById("comfort-text").addEventListener("input", (event) => {
  comfort.textScale = Number(event.target.value);
  applyComfortSettings();
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
  placePickPlane(substrateBase());
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
studio.setTable?.(tableStyleId); // before the theme, so the first tint lands on it
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


// Dialog and tab keyboard behaviour. These watch the DOM rather than hooking
// each open/close call site, so every panel in the list gets focus trapping,
// Escape and focus return without the code that opens it knowing about any of
// that. See src/a11y.js.
wireDialogs([
  "comfort-modal",
  "theme-panel",
  "achievements-modal",
  "gallery",
  "publish-modal",
  "social-modal",
  "coop-modal",
  // Most of these are launched from the More menu, which closes behind them —
  // so when the opener is gone, focus lands back on the button that reopens it.
], { fallbackFocus: "#more-btn" });
wireTabs("#tabs");

// --- draggable sidebar edges -----------------------------------------------
// Both columns are fixed furniture around a 3D scene, and the right width for
// them is not a number anyone can pick for someone else: it depends on the
// screen, the language (Bengali labels run longer than their English twins),
// the text scale, and whether you are hunting the shelf or watching the jar.
// So the edges are draggable, and the width someone chooses is the width they
// get next time.
//
// One implementation drives all three grips. What differs between them is only
// which way "wider" points — the tray is anchored to the left edge so widening
// means dragging right; the rail and the theme shelf are anchored right, so
// widening means dragging left — and that is a sign, not a second code path.
const PANEL_W_KEY = "potroneer-panel-widths";

let panelWidths = {};
try {
  panelWidths = JSON.parse(localStorage.getItem(PANEL_W_KEY) || "{}");
} catch {
  panelWidths = {};
}

function savePanelWidths() {
  try {
    localStorage.setItem(PANEL_W_KEY, JSON.stringify(panelWidths));
  } catch {
    /* private mode: the drag still works, it just will not be remembered */
  }
}

// Every grip registers what it drives, so the phone listener can put the
// stylesheet back in charge without each grip having to watch the media query.
const panelGrips = [];

// A width is only ever *applied* on a layout that has room for it. On a phone
// the stylesheet narrows the tray to 150px and focus mode takes the column over
// entirely; a desktop-chosen 320px written onto :root would beat both, because
// an inline custom property outranks every media query in the sheet. So on a
// phone the properties are removed rather than overwritten, and the sheet's own
// numbers apply again.
function applyPanelWidth(grip, w) {
  const root = document.documentElement.style;
  if (w == null) {
    for (const name of Object.keys(grip.vars)) root.removeProperty(name);
    return;
  }
  for (const [name, spec] of Object.entries(grip.vars)) {
    const v = typeof spec === "function" ? spec(w) : w + spec;
    root.setProperty(name, `${Math.round(v)}px`);
  }
}

function syncPanelWidths() {
  const phone = document.body.classList.contains("is-phone");
  for (const grip of panelGrips) {
    applyPanelWidth(grip, phone ? null : panelWidths[grip.id] ?? null);
  }
}

// `vars` maps each custom property this panel drives to how it follows the
// panel's width — a number is a fixed lead over it, a function is anything
// else. The tray is the reason that is a map and not a single name: --tray-x and --tray-fx are where things *docked beside* the column
// measure from, and if they do not follow the drag, widening the tray slides it
// underneath the toolbar instead of pushing the toolbar over.
function initPanelGrip({ id, gripId, panelId, vars, min, max, sign }) {
  const grip = document.getElementById(gripId);
  const panel = document.getElementById(panelId);
  if (!grip || !panel) return;

  const entry = { id, vars, min, max };
  panelGrips.push(entry);

  // The width to start a drag from. A panel that has never been dragged has no
  // stored number, so measure what the stylesheet is actually giving it rather
  // than hardcoding a default here and having two sources of truth.
  const currentWidth = () =>
    panelWidths[id] ?? Math.round(panel.getBoundingClientRect().width);

  const clamp = (w) =>
    Math.max(min, Math.min(typeof max === "function" ? max() : max, w));

  function setWidth(w, persist) {
    const next = clamp(w);
    panelWidths[id] = next;
    applyPanelWidth(entry, next);
    if (persist) savePanelWidths();
    return next;
  }

  let startX = 0;
  let startW = 0;
  let dragging = false;

  grip.addEventListener("pointerdown", (e) => {
    // Left button / touch / pen only; a right-click on the edge is not a drag.
    if (e.button !== 0) return;
    if (document.body.classList.contains("is-phone")) return;
    dragging = true;
    startX = e.clientX;
    startW = currentWidth();
    // Capture so the drag survives the pointer outrunning a 16px strip — which
    // it will, because the whole point is to move the edge a long way.
    grip.setPointerCapture?.(e.pointerId);
    grip.classList.add("is-dragging");
    document.body.classList.add("panel-resizing");
    // preventDefault (below) stops the text selection a drag across the HUD
    // would otherwise start — and with it the focus the press would have given
    // the grip, which the arrow keys need. So take the focus explicitly.
    e.preventDefault();
    grip.focus?.({ preventScroll: true });
  });

  grip.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    setWidth(startW + (e.clientX - startX) * sign, false);
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    grip.releasePointerCapture?.(e.pointerId);
    grip.classList.remove("is-dragging");
    document.body.classList.remove("panel-resizing");
    savePanelWidths();
  }
  grip.addEventListener("pointerup", endDrag);
  grip.addEventListener("pointercancel", endDrag);

  // A drag is not an input method everyone has. The grip is a focusable
  // separator, so the arrow keys move it too — the pattern screen-reader users
  // are already told to expect from role="separator" with a tabindex.
  grip.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 48 : 16;
    let delta = 0;
    if (e.key === "ArrowLeft") delta = -step * sign;
    else if (e.key === "ArrowRight") delta = step * sign;
    else if (e.key === "Home") delta = -1e4;
    else if (e.key === "End") delta = 1e4;
    else if (e.key === "Enter" || e.key === " ") {
      // Back to whatever the stylesheet would have given it.
      delete panelWidths[id];
      applyPanelWidth(entry, null);
      savePanelWidths();
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    setWidth(currentWidth() + delta, true);
  });

  // Double-click the edge to forget the choice — the usual escape hatch for a
  // resizer, and the one people try before they look for a reset button.
  grip.addEventListener("dblclick", () => {
    delete panelWidths[id];
    applyPanelWidth(entry, null);
    savePanelWidths();
  });
}

// The tray is anchored left: dragging right widens it (sign +1). --tray-x and
// --tray-fx are the gutters things docked beside it measure from, and they keep
// their original 22px / 12px lead over the column's own width.
initPanelGrip({
  id: "tray",
  gripId: "tray-grip",
  panelId: "hud-bottom",
  vars: { "--tray-w": 0, "--tray-x": 22, "--tray-fx": 12 },
  min: 180,
  max: () => Math.min(420, window.innerWidth * 0.4),
  sign: 1,
});

// The rail is anchored right, so dragging *left* widens it (sign -1).
initPanelGrip({
  id: "rail",
  gripId: "rail-grip",
  panelId: "rail",
  vars: { "--rail-w": 0 },
  min: 150,
  max: () => Math.min(360, window.innerWidth * 0.35),
  sign: -1,
});

// The theme shelf, also anchored right. Widening it grows the cards rather than
// adding columns — the point of a wider shelf is to see the photograph, not to
// fit more postage stamps — so the grid's column floor is derived from the
// panel's width and kept at roughly three across.
initPanelGrip({
  id: "theme",
  gripId: "theme-grip",
  panelId: "theme-panel",
  vars: { "--theme-panel-w": 0, "--theme-card-min": (w) => (w - 72) / 3 },
  min: 300,
  max: () => Math.min(900, window.innerWidth - 24),
  sign: -1,
});

// --- phone workspace -------------------------------------------------------
// A phone is not a small desktop. The desktop composition puts a 150px tray
// down one side and a 148px rail down the other, which on a 390px screen leaves
// the terrarium a corridor to live in. Focus Build already solves this — it is
// the mode where the jar owns the screen and the shelf is a bottom sheet you
// pull up when you want it — so on a phone that *is* the workspace rather than
// a mode you have to discover.
//
// It is still a mode: "বের হও" leaves it, and the choice is remembered, so
// nobody is locked into a layout they did not pick.
// Matches style.css: narrow *or* short-and-sideways. A phone in landscape
// is 844px wide, which sails past a width-only breakpoint while having
// less vertical room than any phone in portrait.
const PHONE_QUERY =
  "(max-width: 700px), (max-height: 460px) and (orientation: landscape)";
const PHONE_CHOSE_KEY = "potroneer-phone-focus";
const phoneMedia = window.matchMedia?.(PHONE_QUERY);

function syncPhoneClass() {
  const phone = phoneMedia?.matches ?? false;
  document.body.classList.toggle("is-phone", phone);
  return phone;
}

function startPhoneWorkspace() {
  const phone = syncPhoneClass();
  if (!phone || focusMode) return;
  let chosen = null;
  try {
    chosen = localStorage.getItem(PHONE_CHOSE_KEY);
  } catch {
    chosen = null;
  }
  // "0" means they left it on purpose last time; respect that.
  if (chosen === "0") return;
  setFocusMode(true);
}

phoneMedia?.addEventListener?.("change", () => {
  const phone = syncPhoneClass();
  placeCameraControls();
  placeMoreMenu();
  // Rotating a tablet or dragging a window narrow should not yank someone out
  // of the layout they are working in, so this only ever opts *in*.
  syncPanelWidths();
  if (phone) startPhoneWorkspace();
});

syncPhoneClass();
startPhoneWorkspace();
// Only now is `is-phone` on <body>, which is what decides whether a stored
// width may be applied at all.
syncPanelWidths();

// --- phone: camera controls move out of the dock ---------------------------
// Eight controls in one bar wraps to two rows on a 390px phone and strands the
// exit button alone on the second. Centre and lock are camera controls, not
// build controls, so on a phone they join zoom in the cluster on the thumb side
// and the dock keeps only the things you press while building. The buttons are
// *moved*, not duplicated, so their existing listeners and state come along.
const camCluster = document.getElementById("cam-zoom");
const focusCenterBtn = document.getElementById("focus-center");
const focusLockBtn = document.getElementById("focus-lock");
const camHome = focusCenterBtn
  ? { parent: focusCenterBtn.parentElement, before: focusCenterBtn.previousElementSibling }
  : null;

// The More menu lives inside the rail, and focus mode removes the rail from the
// page entirely — so on a phone, where focus mode *is* the app, the menu was
// unreachable no matter how the button toggled its class: its ancestor was
// gone, so it rendered at zero height. It moves out to sit beside the dock.
const moreMenuEl = document.getElementById("more-menu");
const moreMenuHome = moreMenuEl?.parentElement ?? null;

function placeMoreMenu() {
  if (!moreMenuEl || !moreMenuHome) return;
  const phone = document.body.classList.contains("is-phone");
  const app = document.getElementById("app");
  if (phone && app && moreMenuEl.parentElement !== app) app.appendChild(moreMenuEl);
  else if (!phone && moreMenuEl.parentElement !== moreMenuHome) {
    moreMenuHome.appendChild(moreMenuEl);
  }
}

function placeCameraControls() {
  if (!camCluster || !focusCenterBtn || !focusLockBtn || !camHome) return;
  const phone = document.body.classList.contains("is-phone");
  if (phone) {
    if (focusCenterBtn.parentElement !== camCluster) {
      camCluster.append(focusCenterBtn, focusLockBtn);
    }
  } else if (focusCenterBtn.parentElement === camCluster) {
    // Back to where they started, after the separator they used to follow.
    camHome.before?.after(focusCenterBtn, focusLockBtn) ??
      camHome.parent.prepend(focusCenterBtn, focusLockBtn);
  }
}

// The dock's height changes with wrapping, language and text scale, so the
// cluster measures it rather than assuming a number and ending up underneath.
const focusDock = document.getElementById("focus-hud");
function syncDockHeight() {
  if (!focusDock) return;
  const h = focusDock.classList.contains("hidden")
    ? 0
    : Math.round(focusDock.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--dock-h", `${h}px`);
}
if (focusDock && window.ResizeObserver) {
  new ResizeObserver(syncDockHeight).observe(focusDock);
}
window.addEventListener("resize", () => {
  placeCameraControls();
  placeMoreMenu();
  syncDockHeight();
});
placeCameraControls();
placeMoreMenu();
syncDockHeight();

// A tap on the jar closes the More menu too, via a listener that knows nothing
// about the dock button — so the button reads its state off the menu rather
// than remembering it, and cannot claim "expanded" over a closed sheet.
if (focusMoreBtn && moreMenuEl) {
  const syncMoreExpanded = () =>
    focusMoreBtn.setAttribute(
      "aria-expanded",
      moreMenuEl.classList.contains("hidden") ? "false" : "true",
    );
  new MutationObserver(syncMoreExpanded).observe(moreMenuEl, {
    attributes: true,
    attributeFilter: ["class"],
  });
  syncMoreExpanded();
}

// ---------------------------------------------------------------------------
// The account gate
// ---------------------------------------------------------------------------
// Potroneer is a guest-first app: you can build, care for, decorate, theme and
// keep a terrarium forever without ever telling us who you are, because all of
// it lives in localStorage. An account buys exactly three things — other
// people's eyes on your jar, other people's hands in it, and the same jar on
// another device — so the gate only appears when you reach for one of those,
// and it says which one.
//
// Nothing here ever discards local work. `requireAccount` resumes the action
// you were taking; signing in migrates what you already built rather than
// replacing it.

const AUTH_REASONS = {
  publish: {
    bn: "প্রকাশ করতে অ্যাকাউন্ট লাগবে — তোমার বাগান তখন অন্যরাও দেখতে পাবে।",
    en: "Publishing needs an account, so other gardeners can find your jar.",
  },
  favorite: {
    bn: "পছন্দ জমা রাখতে অ্যাকাউন্ট লাগবে।",
    en: "Saving a favourite needs an account to keep it in.",
  },
  remix: {
    bn: "রিমিক্স সেভ করতে অ্যাকাউন্ট লাগবে।",
    en: "Saving a remix needs an account to keep it in.",
  },
  coop: {
    bn: "একসঙ্গে বানাতে আর সব ডিভাইসে তোমার ঘর রাখতে অ্যাকাউন্ট খোলো।",
    en: "Create an account to build together and keep your room across devices.",
  },
  sync: {
    bn: "সব ডিভাইসে এই বাগান রাখতে অ্যাকাউন্ট খোলো।",
    en: "Create an account to keep this garden across devices.",
  },
};

const authGate = document.getElementById("auth-gate");
const authGateForm = document.getElementById("auth-gate-form");
const authGateError = document.getElementById("auth-gate-error");
const authGateSubmit = document.getElementById("auth-gate-submit");
const authGateName = document.getElementById("auth-gate-name-field");
let authGateMode = "signup";
let authGateResume = null;

function setAuthGateMode(mode) {
  authGateMode = mode === "signin" ? "signin" : "signup";
  for (const button of authGate.querySelectorAll("[data-gate-mode]")) {
    const active = button.dataset.gateMode === authGateMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  // A name is something we ask for once, when the account is made.
  authGateName.classList.toggle("hidden", authGateMode !== "signup");
  const label = authGateMode === "signup" ? "অ্যাকাউন্ট খোলো" : "সাইন ইন";
  authGateSubmit.dataset.i18n = label;
  authGateSubmit.textContent = t(label);
  document.getElementById("auth-gate-password").autocomplete =
    authGateMode === "signup" ? "new-password" : "current-password";
  authGateError.textContent = "";
}

/**
 * Open the gate, remembering what to do afterwards. Returns true if it opened —
 * i.e. if the caller should stop and let the resume finish the job.
 *
 * This is the guard for a function that re-runs *itself* after auth:
 *
 *     function openPublish() {
 *       if (needsAccount("publish", openPublish)) return;
 *       ...
 *
 * Note it does not invoke `resume` when there is already an account. Having it
 * do that — one call that both guards and runs — read nicely right up until the
 * resume was the calling function itself, at which point it called itself,
 * which called itself, until the stack ran out.
 */
function needsAccount(reason, resume) {
  if (socialUser) return false;
  openAuthGate(reason, resume);
  return true;
}

/**
 * Run `action` now if there is an account, or ask for one first and then run
 * it. For a one-off action that is not the function doing the asking.
 */
function requireAccount(reason, action) {
  if (socialUser) {
    action?.();
    return true;
  }
  openAuthGate(reason, action);
  return false;
}

function openAuthGate(reason, action) {
  authGateResume = action ?? null;
  const copy = AUTH_REASONS[reason] ?? AUTH_REASONS.sync;
  document.getElementById("auth-gate-why").textContent = socialMessage(copy.bn, copy.en);
  document.getElementById("auth-room-preview").classList.toggle(
    "hidden",
    reason !== "coop" || !pendingRoomInvite,
  );
  setAuthGateMode("signup");
  authGate.classList.remove("hidden");
}

function closeAuthGate({ resume = false } = {}) {
  authGate.classList.add("hidden");
  const action = authGateResume;
  authGateResume = null;
  if (resume && action) action();
}

// Supabase speaks in API errors. People do not.
function friendlyAuthError(error) {
  const raw = (error?.message || "").toLowerCase();
  if (raw.includes("already registered") || raw.includes("already been registered")) {
    return socialMessage(
      "এই ইমেইলে অ্যাকাউন্ট আছে — সাইন ইন করো।",
      "There is already an account with this email — sign in instead.",
    );
  }
  // Local demo mode raises its own wording for the same situation.
  if (raw.includes("no demo account") || raw.includes("no account")) {
    return socialMessage(
      "এই ইমেইলে কোনো অ্যাকাউন্ট নেই — উপরে \"অ্যাকাউন্ট খোলো\" বেছে নাও।",
      'No account with that email yet — pick "Create account" above.',
    );
  }
  if (raw.includes("invalid login")) {
    return socialMessage(
      "ইমেইল বা পাসওয়ার্ড মিলছে না। আবার দেখো।",
      "That email and password do not match. Have another look.",
    );
  }
  if (raw.includes("password") && raw.includes("6")) {
    return socialMessage(
      "পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।",
      "Passwords need to be at least 6 characters.",
    );
  }
  if (raw.includes("email") && raw.includes("valid")) {
    return socialMessage("ইমেইলটা ঠিক দেখাচ্ছে না।", "That email address does not look right.");
  }
  if (raw.includes("network") || raw.includes("fetch")) {
    return socialMessage(
      "নেটওয়ার্কে পৌঁছানো যাচ্ছে না। তোমার বাগান নিরাপদে আছে — পরে আবার চেষ্টা করো।",
      "Could not reach the network. Your garden is safe here — try again in a moment.",
    );
  }
  return error?.message || socialMessage("কিছু একটা ভুল হয়েছে।", "Something went wrong.");
}

authGate.querySelectorAll("[data-gate-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthGateMode(button.dataset.gateMode));
});
document.getElementById("auth-gate-close").addEventListener("click", () => closeAuthGate());
document.getElementById("auth-gate-guest").addEventListener("click", () => {
  closeAuthGate();
  flashHint(
    socialMessage(
      "ঠিক আছে — অতিথি হিসেবেই চলুক। বাগান এই ডিভাইসে সেভ থাকছে।",
      "Fine by us — carry on as a guest. Your garden stays saved on this device.",
    ),
  );
});
document.getElementById("auth-gate-reveal").addEventListener("click", (event) => {
  const field = document.getElementById("auth-gate-password");
  const shown = field.type === "text";
  field.type = shown ? "password" : "text";
  event.currentTarget.setAttribute("aria-pressed", shown ? "false" : "true");
  field.focus();
});

authGateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authGateError.textContent = "";
  authGateSubmit.disabled = true;
  const email = document.getElementById("auth-gate-email").value.trim();
  const password = document.getElementById("auth-gate-password").value;
  try {
    if (authGateMode === "signup") {
      const result = await social.signUp({
        email,
        password,
        displayName: document.getElementById("auth-gate-name").value.trim(),
      });
      if (result.needsVerification) {
        authGateError.textContent = socialMessage(
          "ইমেইলে পাঠানো লিঙ্কে ক্লিক করে ফিরে এসে সাইন ইন করো।",
          "Check your email for the confirmation link, then come back and sign in.",
        );
        authGateSubmit.disabled = false;
        return;
      }
    } else {
      await social.signIn({ email, password });
    }
    await renderSocialAccount();
    await migrateGuestWork();
    await refreshSocialFeed();
    closeAuthGate({ resume: true });
  } catch (error) {
    authGateError.textContent = friendlyAuthError(error);
  } finally {
    authGateSubmit.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Carrying a guest's work onto their new account
// ---------------------------------------------------------------------------
// Signing up must never feel like starting over. Everything a guest built is
// already in localStorage and stays exactly where it is — this only *adds* a
// private cloud copy so the same jar can be opened on another device, and
// carries the level and achievements up with it.
//
// Deliberately private (isPublic: false): keeping your garden and showing it to
// strangers are different decisions, and only one of them was made here.
const MIGRATED_KEY = "potroneer-migrated";

function hasSomethingToMigrate() {
  return (state.layers?.length || 0) + (state.decorations?.length || 0) > 0;
}

async function migrateGuestWork() {
  if (!socialUser || !hasSomethingToMigrate()) return;
  let done = [];
  try {
    done = JSON.parse(localStorage.getItem(MIGRATED_KEY) || "[]");
  } catch {
    done = [];
  }
  // Once per account. Signing out and back in should not litter the gallery
  // with copies of the same jar.
  if (done.includes(socialUser.id)) return;
  try {
    await social.saveTerrarium({
      title: socialMessage("আমার বাগান", "My garden"),
      description: socialMessage(
        "এই ডিভাইসে বানানো, অ্যাকাউন্টে নেওয়া হয়েছে।",
        "Built on this device, carried over to this account.",
      ),
      data: autosavePayload(),
      thumbnail: await makeThumbnail(),
      isPublic: false,
    });
    done.push(socialUser.id);
    localStorage.setItem(MIGRATED_KEY, JSON.stringify(done));
    toast(
      socialMessage("তোমার বাগান অ্যাকাউন্টে নেওয়া হয়েছে।", "Your garden is on your account now."),
      { icon: "🌿", duration: 3200 },
    );
  } catch (error) {
    // A failed upload is not a failed sign-in, and it certainly is not a reason
    // to lose anything: the local copy is still the real one.
    flashHint(
      socialMessage(
        "অ্যাকাউন্টে তোলা যায়নি, তবে বাগান এই ডিভাইসে নিরাপদে আছে।",
        "Could not copy it up just now — your garden is safe on this device.",
      ),
    );
    console.warn("[potroneer] guest migration failed", error);
  }
}

// ---------------------------------------------------------------------------
// The one time we bring it up unprompted
// ---------------------------------------------------------------------------
// A guest who has just finished their first terrarium is the one person for
// whom "keep this across devices" is a useful sentence rather than an
// interruption — they have something worth keeping and have just found out they
// like this. So: once, after the tutorial arc completes, as a toast that goes
// away on its own. Never a modal, never twice, never for someone already signed
// in, and taking it opens the same gate everything else does.
const KEEP_PROMPT_KEY = "potroneer-keep-prompt";

function maybeOfferCloudKeep() {
  if (socialUser) return;
  if (!isTutorialComplete(game) || !hasSomethingToMigrate()) return;
  try {
    if (localStorage.getItem(KEEP_PROMPT_KEY) === "1") return;
    localStorage.setItem(KEEP_PROMPT_KEY, "1");
  } catch {
    return; // private mode: better silent than every single session
  }
  toast(
    socialMessage("এই বাগান সব ডিভাইসে রাখতে চাও?", "Keep this garden across devices?"),
    {
      icon: "🌿",
      duration: 7000,
      action: {
        label: socialMessage("রাখো", "Keep it"),
        onClick: () => requireAccount("sync", null),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Arriving from an invite link
// ---------------------------------------------------------------------------
// A link like ?room=MOSS4U is someone saying "come and garden with me". Meeting
// that with a bare login form gives no clue what you are signing up *for*, so
// the room is shown first — its code, and what a shared room actually is — and
// only then are you asked for an account. Continuing as a guest from here is a
// real option: it keeps you in the app, on your own jar, with the invite
// waiting in the co-op panel whenever you want it.
//
// The terrarium already on this device is never touched by any of this.
function openRoomInvite(room) {
  pendingRoomInvite = room;
  document.getElementById("auth-room-code").textContent = room;
  document.getElementById("coop-room").value = room;
  requireAccount("coop", () => {
    document.getElementById("coop-modal")?.classList.remove("hidden");
    joinCoopRoom();
  });
  document.getElementById("auth-room-preview").classList.remove("hidden");
}

function checkRoomInvite() {
  const room = social.invitedRoom?.();
  if (!room) return;
  // Take the code out of the address bar so a refresh — or a shared screenshot
  // of the URL — does not keep re-triggering the invite.
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  window.history.replaceState({}, "", url);
  if (socialUser) {
    document.getElementById("coop-room").value = room;
    document.getElementById("coop-modal")?.classList.remove("hidden");
    flashHint(
      socialMessage(`ঘর ${room}-এ যোগ দিতে "যোগ দাও" চাপো।`, `Press Join to enter room ${room}.`),
    );
    return;
  }
  openRoomInvite(room);
}

// Wait for the intro to finish before an invite takes over the screen.
// (onIntroDone fires straight away if the intro is already gone, and
// introReady() is the *setter* that marks it ready — not a question.)
onIntroDone(checkRoomInvite);

// Copy a link that opens straight into this room. What the other person gets is
// a preview of the room first — see openRoomInvite — not a login form.
document.getElementById("coop-invite")?.addEventListener("click", async () => {
  const code = coopRoom?.code || document.getElementById("coop-room").value.trim().toUpperCase();
  if (!code) {
    coopStatusLine(socialMessage("আগে একটি ঘর বানাও বা কোড দাও।", "Create a room or enter a code first."), true);
    return;
  }
  await copyCoopText(
    social.roomInviteUrl(code),
    socialMessage("আমন্ত্রণ লিঙ্ক কপি হয়েছে।", "Invite link copied."),
  );
});
