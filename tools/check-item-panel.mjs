import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DECORATIONS, DECOR_BY_ID } from "../src/catalog.js";

// Exercise the actual inspector functions with small DOM doubles. This is a
// logic test, not a substitute for checking the rendered layout in a browser.
const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const elements = new Map();
function element() {
  const classes = new Set(["hidden"]);
  return {
    children: [], attributes: {}, style: { setProperty() {} }, dataset: {}, value: "",
    classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: name => classes.has(name),
      toggle(name, force) { const on = force ?? !classes.has(name); on ? classes.add(name) : classes.delete(name); },
    },
    replaceChildren() { this.children = []; },
    add(child) { this.children.push(child); },
    appendChild(child) { this.children.push(child); },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(name, callback) { this[name] = callback; },
    set innerHTML(value) { this.children = []; },
  };
}
const document = {
  body: element(), createElement: element,
  getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  querySelectorAll() { return []; },
};
const context = vm.createContext({
  document, DECOR_BY_ID, Option: class { constructor(text, value) { this.text = text; this.value = value; } },
  t: s => s, tLabel: s => s, toUiDigits: String,
  activeTab: "decor", adjTarget: null, adjSelection: -1, movePending: null,
  toolsExpanded: false, SPECTRUM_COLS: 12, pieces: [], tintCalls: [], saves: 0, gestures: 0,
  studio: { markInteraction() {} },
  revealEditor() {}, refreshJarSwatches() {},
  syncBuildingPanelButtons() {},
  endGesture() {}, cancelMove() {}, renderTools() {}, selectTool() {}, clearHover() {}, stopTerrainBrush() {},
});
vm.runInContext(`
  const livePieces = () => pieces;
  const beginGesture = () => gestures++;
  const scheduleAutosave = () => saves++;
  const applyTint = (obj, hex) => tintCalls.push({obj, hex});
  const itemPanelEl = document.getElementById('item-panel');
  const jarPanelEl = document.getElementById('jar-panel');
  const layerPanelEl = document.getElementById('layer-panel');
  const scenePanelEl = document.getElementById('scene-panel');
  const buildingToolsEl = document.getElementById('building-tools');
  const slidersEl = document.getElementById('sliders');
  const hudBottomEl = document.getElementById('hud-bottom');
  const catFlyoutEl = document.getElementById('cat-flyout');
`, context);
for (const name of ["hslHex", "spectrumSheet", "buildSpectrum", "selectTab", "openJarPanel", "showItemPanel", "openItemPanel", "renderItemPanel", "renderItemColors", "renderItemSize", "changeItemTint"]) {
  const fn = source.match(new RegExp(`^function ${name}\\([^]*?^}`, "m"))?.[0];
  assert.ok(fn, `${name} is the production implementation`);
  vm.runInContext(fn, context);
}
vm.runInContext("const ITEM_TINTS = spectrumSheet({neutral:[.08,.97],tones:[[.6,.2],[.66,.34],[.62,.48],[.54,.63],[.4,.78]]}); selectTab('building');", context);
assert.equal(elements.get("jar-panel").classList.contains("hidden"), false, "Building starts with Customize jar");
vm.runInContext("showItemPanel()", context);
assert.equal(elements.get("item-controls").disabled, true);
assert.equal(elements.get("item-swatches").children.length, 72);
assert.equal(elements.has("item-select"), false, "item selection uses the jar, not a dropdown");
const variants = DECORATIONS.filter(d => ["animals", "structures"].includes(d.cat));
context.pieces = variants.map(def => ({userData: {record: {id:def.id, rotation:0, scale:1, tint:null}}}));
vm.runInContext("showItemPanel()", context);
assert.equal(elements.get("item-controls").disabled, true, "items stay unselected until tapped in the jar");
for (const obj of context.pieces) {
  context.next = obj;
  vm.runInContext("openItemPanel(next)", context);
  assert.equal(context.adjTarget, obj);
  assert.equal(elements.get("item-controls").disabled, false);
}
vm.runInContext("changeItemTint('#124abc')", context);
assert.equal(context.pieces.at(-1).userData.record.tint, "#124abc");
assert.ok(context.pieces.slice(0,-1).every(o => o.userData.record.tint === null));
assert.equal(elements.get("item-color-hex").value, "#124abc");
assert.equal(context.saves, 1);
vm.runInContext("changeItemTint('invalid'); changeItemTint(null)", context);
assert.equal(context.pieces.at(-1).userData.record.tint, null);
assert.equal(context.saves, 2);
vm.runInContext("selectTab('decor')", context);
assert.ok(elements.get("item-panel").classList.contains("hidden"));
vm.runInContext("selectTab('building')", context);
assert.equal(elements.get("jar-panel").classList.contains("hidden"), false);
vm.runInContext("showItemPanel()", context);
assert.equal(context.adjTarget, context.pieces.at(-1), "selection survives switching tabs");
context.pieces = [];
vm.runInContext("renderItemPanel()", context);
assert.equal(context.adjTarget, null, "never edit a detached/deleted object");
assert.equal(elements.get("item-controls").disabled, true);
assert.equal(elements.get("item-panel").classList.contains("hidden"), false);
console.log(`item panel: OK (Building visibility, empty state, ${variants.length} selectable variants, isolated edits, spectrum, autosave requests, stale selection)`);
