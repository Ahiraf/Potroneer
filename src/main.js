import * as THREE from "three";
import { createStudio } from "./scene.js";
import { buildJar, buildPickPlane, JAR_TYPES, JAR_BY_ID } from "./jar.js";
import {
  buildLayer,
  buildDecoration,
  buildTerrainCap,
  updateTerrainCap,
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
  JAR,
} from "./state.js";
import { toggleAmbience } from "./ambience.js";
import { decorationIcon, baseIcon, jarIcon } from "./icons.js";
import { t, tLabel, getLang, setLang } from "./i18n.js";

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
let pickPlane = null;
let motes = null;

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

function setJar(typeId, { keepContents = false } = {}) {
  const type = JAR_BY_ID[typeId];
  if (!type) return;
  currentJarId = typeId;
  setJarInterior(type.interior);

  if (jarGroup) studio.world.remove(jarGroup);
  if (pickPlane) studio.world.remove(pickPlane);

  const built = buildJar(typeId, studio.envMap);
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

  // Different jars have different floors/radii, so start their contents fresh.
  if (!keepContents) {
    resetState(state);
    substrateGroup.clear();
    decorGroup.clear();
    tweens.length = 0;
  }
  pickPlane.position.y = substrateTop(state) + 0.001;
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
  // The sculptable terrain cap rides on the top layer, tinted like it.
  if (state.layers.length) {
    const topDef = BASE_BY_ID[state.layers[state.layers.length - 1].type];
    terrainCap = buildTerrainCap(topDef);
    updateTerrainCap(terrainCap, state, substrateTop(state));
    substrateGroup.add(terrainCap);
  }
  pickPlane.position.y = substrateTop(state) + 0.001;
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
      layers: state.layers,
      decorations: state.decorations,
      terrain: Array.from(state.terrain),
    }),
  );
  if (history.length > 60) history.shift();
}

function rebuildAll() {
  rebuildSubstrate(false);
  decorGroup.clear();
  state.decorations.forEach((rec) => {
    const def = DECORATIONS.find((d) => d.id === rec.id);
    const obj = buildDecoration(rec.kind, def?.variant);
    obj.rotation.y = rec.rotation;
    obj.position.set(rec.x, rec.y, rec.z);
    obj.scale.setScalar(rec.scale);
    obj.userData.record = rec;
    obj.userData.baseScale = rec.scale;
    decorGroup.add(obj);
  });
  updateHint();
}

function undo() {
  const snap = history.pop();
  if (!snap) return;
  const d = JSON.parse(snap);
  state.layers.length = 0;
  state.layers.push(...d.layers);
  state.decorations.length = 0;
  state.decorations.push(...d.decorations);
  state.terrain.set(d.terrain);
  rebuildAll();
  studio.markInteraction();
}

// --- placement -------------------------------------------------------------
function placeDecoration(worldPoint, def) {
  const local = studio.world.worldToLocal(worldPoint.clone());
  const obj = buildDecoration(def.kind, def.variant);

  const targetScale = 0.85 + Math.random() * 0.5;
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
  { id: "place", label: "বসাও", glyph: "👆" },
  { id: "raise", label: "উঁচু", glyph: "⛰️" },
  { id: "lower", label: "নিচু", glyph: "🕳️" },
  { id: "grass", label: "ঘাস", glyph: "🌱" },
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

  if (activeTool === "raise" || activeTool === "lower") {
    const amt = brushStrength() * (activeTool === "raise" ? 1 : -1);
    sculpt(state, local.x, local.z, amt, brushRadius(), brushFalloff());
    if (terrainCap) updateTerrainCap(terrainCap, state, substrateTop(state));
    // Everything planted on the surface rides the terrain up/down.
    decorGroup.children.forEach((obj) => {
      const rec = obj.userData.record;
      if (!rec) return;
      obj.position.y = rec.y = surfaceY(rec.x, rec.z);
    });
  } else if (activeTool === "grass" || activeTool === "pebble") {
    const dx = lastPaint ? local.x - lastPaint.x : Infinity;
    const dz = lastPaint ? local.z - lastPaint.z : Infinity;
    // stroke spacing scales with brush radius
    const spacing = (activeTool === "pebble" ? 0.05 : 0.07) * brushRadius() * 3;
    if (dx * dx + dz * dz < spacing * spacing) return;
    lastPaint = { x: local.x, z: local.z };
    const kind = activeTool === "pebble" ? "pebblepatch" : "grass";
    placeDecoration(hit.point, { id: kind, kind });
  }
}

studio.setGrabHandler((screen) => {
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
  sculpt: ["raise", "lower"],
  paint: ["grass", "pebble"],
  decor: ["place"],
  scene: [],
};
let activeTab = "decor";
const toolItemsEl = document.getElementById("tool-items");
const slidersEl = document.getElementById("sliders");
const scenePanelEl = document.getElementById("scene-panel");
const hudBottomEl = document.getElementById("hud-bottom");

function selectTool(id) {
  activeTool = id;
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
const FAV_KEY = "terrarium-favs";
const favs = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
function toggleFav(key) {
  favs.has(key) ? favs.delete(key) : favs.add(key);
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
}

// Items for the current category, each tagged with its placement group.
function stripSource() {
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
  renderFlyout();
  catFlyoutEl.classList.toggle("hidden");
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
    if (group === "jar") url = jarIcon(item.id);
    else if (group === "base") url = baseIcon(item.id, item.layerHeight);
    else url = decorationIcon(item.kind, item.variant);
    iconCache.set(key, url);
  }
  return iconCache.get(key);
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
    if (item.id !== currentJarId) setJar(item.id);
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
      card.innerHTML =
        `<span class="fav-btn ${favs.has(favKey) ? "is-fav" : ""}" title="পছন্দ">${favs.has(favKey) ? "♥" : "♡"}</span>` +
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

      card.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("fav-btn")) return;
        beginChipDrag(group, item, e);
      });
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("fav-btn")) return;
        if (chipDrag?.ghost) return; // was a drag, not a click
        if (group === "jar") {
          if (item.id !== currentJarId) setJar(item.id);
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
}

langBtn.addEventListener("click", () => {
  setLang(getLang() === "bn" ? "en" : "bn");
  applyLang();
});

// Build the starting jar, then draw the UI.
setJar(currentJarId);
selected = { group: "base", id: BASE_LAYERS[0].id };
selectTab("decor");
renderStrip();
applyLang();

// --- hint / progress -------------------------------------------------------
const hintEl = document.getElementById("hint");
const hintStepEl = hintEl.querySelector(".hint-step");
const hintTextEl = hintEl.querySelector("p");
let flashTimer = null;

// Walks the user through the order a real closed terrarium is built:
// drainage → sphagnum barrier → charcoal → soil → plants.
function updateHint() {
  const laid = new Set(state.layers.map((l) => l.type));
  if (!hasBase(state)) {
    setHint("১", "আসল টেরারিয়ামের মতো শুরু করো — প্রথমে লেকা বল বা নুড়ি দিয়ে ড্রেনেজ স্তর বানাও।");
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
  a.download = `terrarium-${Date.now()}.png`;
  a.click();
  flashHint("ছবি সেভ হয়ে গেছে! বন্ধুদের দেখাও।");
});

const soundBtn = document.getElementById("sound");
soundBtn.addEventListener("click", () => {
  const on = toggleAmbience();
  soundBtn.textContent = on ? "🔔" : "🔕";
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

// --- reset -----------------------------------------------------------------
document.getElementById("reset").addEventListener("click", () => {
  snapshot();
  resetState(state);
  substrateGroup.clear();
  decorGroup.clear();
  pickPlane.position.y = JAR.floorY + 0.001;
  tweens.length = 0;
  updateHint();
  studio.markInteraction();
});

updateHint();
