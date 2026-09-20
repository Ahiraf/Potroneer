// Isolated visual fixture: uses production builders/rendering but never reads
// or writes app storage. Available through the development server only.
import * as THREE from "three";
import { createStudio } from "../src/scene.js";
import { buildJar, JAR_BY_ID, jarInnerSilhouette, jarSectionFor } from "../src/jar.js";
import { buildLayer, buildTerrainCap, updateTerrainCap, layerSurface } from "../src/builders.js";
import { BASE_BY_ID } from "../src/catalog.js";
import { createState, setJarInterior, substrateBase, substrateTop, addLayer } from "../src/state.js";
import { RAINBOW_STACK, REFERENCE_STACKS } from "../src/layer-recipes.js";
import { referencePlanting } from "../src/reference-garden.js";

const studio = createStudio(document.querySelector("canvas"));
studio.setAutoSpin(false);
const params = new URLSearchParams(location.search);
const jarId = JAR_BY_ID[params.get("jar")]?.referenceJar ? params.get("jar") : "cork-taper";
const recipeId = params.get("recipe") ?? "lime";
const recipe = recipeId === "rainbow" ? RAINBOW_STACK : (REFERENCE_STACKS[recipeId] ?? REFERENCE_STACKS.lime).steps;
const it = JAR_BY_ID[jarId].interior;
setJarInterior(it, jarInnerSilhouette(jarId, it));
const vessel = buildJar(jarId, studio.envMap, it);
const panes = [];
vessel.group.traverse(o => { if (o.isMesh && vessel.glassMats.includes(o.material)) panes.push(o); });
vessel.group.updateMatrixWorld(true);
setJarInterior(it, jarInnerSilhouette(jarId, it), jarSectionFor(jarId, it, panes));
studio.world.add(vessel.group);
studio.setBaseY(it.floorY - it.wallThickness);
const state = createState();
for (const step of recipe) addLayer(state, step.id, step.mm);
let y = substrateBase();
state.layers.forEach((layer, i) => {
  studio.world.add(buildLayer(layer, y, i === state.layers.length - 1, state.layers[i - 1], i === state.layers.length - 1));
  y += layer.height;
});
const top = state.layers.at(-1);
const cap = buildTerrainCap(BASE_BY_ID[top.type], substrateTop(state), top.height);
updateTerrainCap(cap, state, substrateTop(state));
studio.world.add(cap);
const ground = (x,z) => substrateTop(state) + layerSurface(top,x,z);

for (const {object} of referencePlanting(ground)) studio.world.add(object);
for (const [id,value] of [["jar-style",jarId],["layer-style",recipeId]]) document.getElementById(id).value=value;
document.getElementById("jar-style").onchange=e=>{params.set("jar",e.target.value);location.search=params.toString();};
document.getElementById("layer-style").onchange=e=>{params.set("recipe",e.target.value);location.search=params.toString();};
const box = new THREE.Box3().setFromObject(vessel.group);
const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
function frame(detail = false) {
  studio.frameJar(detail ? ground(0,0)+.18 : center.y, detail ? 1.35 : size.y,
    { radius: detail ? .82 : size.x/2, fill: .9, animate: true });
  document.querySelector("#whole").setAttribute("aria-pressed", String(!detail));
  document.querySelector("#detail").setAttribute("aria-pressed", String(detail));
}
studio.setView("front");
frame();
document.querySelector("#whole").onclick = () => frame();
document.querySelector("#detail").onclick = () => frame(true);
document.querySelector("#glass").onclick = e => {
  vessel.group.visible = !vessel.group.visible;
  e.currentTarget.textContent = vessel.group.visible ? "Glass on" : "Glass off";
  e.currentTarget.setAttribute("aria-pressed", String(vessel.group.visible));
};
let oldGlass = false;
document.querySelector("#old-glass").onclick = e => {
  oldGlass = !oldGlass;
  for (const mat of vessel.glassMats) {
    mat.roughness = oldGlass ? .08 : .006;
    mat.thickness = oldGlass ? .25 : .025;
  }
  e.currentTarget.setAttribute("aria-pressed", String(oldGlass));
  e.currentTarget.textContent = oldGlass ? "Old glass shown" : "Compare old glass";
};
