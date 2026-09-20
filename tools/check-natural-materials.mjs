import assert from "node:assert/strict";
import * as THREE from "three";
import { BASE_LAYERS, BASE_BY_ID } from "../src/catalog.js";
import { RAINBOW_STACK, REFERENCE_STACKS } from "../src/layer-recipes.js";
import { nerveLeafMaps } from "../src/reference-botany.js";
import { referencePlanting } from "../src/reference-garden.js";
import { bodyFitsAt, measureObject } from "../src/sizing.js";
import { grainMaps } from "../src/natural-materials.js";
import { buildLayer, buildTerrainCap, updateTerrainCap, layerSurface, buildDecoration } from "../src/builders.js";
import { createState, addLayer, substrateBase, substrateTop, stackMm, assertStackOrder, sculpt, paintMaterial, setJarInterior } from "../src/state.js";
import { buildJar, JAR_BY_ID, jarInnerSilhouette } from "../src/jar.js";

// Existing terrain paint indices must stay compatible with saved builds.
assert.deepEqual(BASE_LAYERS.slice(0, 7).map(d => d.id), ["leca", "pebbles", "sphagnum", "charcoal", "soil", "sand", "white-sand"]);
for (const family of ["soil", "sand", "gravel", "rock", "fibre", "cork"]) {
  const maps = grainMaps(family);
  assert.equal(maps, grainMaps(family), "material maps must be cached");
  assert.equal(maps.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(maps.bumpMap.colorSpace, THREE.NoColorSpace);
  const pixels = maps.map.image.data;
  assert.equal(pixels.length, 256 * 256 * 4);
  assert.ok(new Set(pixels).size > 40, `${family} needs real grain variation`);
}

for (const jarId of ["mason", "flask", "bowl"]) {
  const it = JAR_BY_ID[jarId].interior;
  setJarInterior(it, jarInnerSilhouette(jarId, it));
  const state = createState();
  for (const step of RAINBOW_STACK) assert.ok(addLayer(state, step.id, step.mm));
  assert.equal(stackMm(state), 62);
  assertStackOrder(state);
  let base = substrateBase();
  state.layers.forEach((layer, i) => {
    const below = state.layers[i-1];
    const group = buildLayer(layer, base, i === state.layers.length - 1, below, i === state.layers.length - 1);
    const solid = group.children[0];
    assert.ok(solid.material.map && solid.material.bumpMap);
    for (const name of ["position", "normal", "uv", "color"]) {
      assert.ok(Array.from(solid.geometry.attributes[name].array).every(Number.isFinite));
    }
    // Interfaces cannot cross, including old saves with large random slopes.
    for (let a = 0; a < Math.PI * 2; a += .13) {
      const x = Math.cos(a), z = Math.sin(a);
      assert.ok(layer.height + layerSurface(layer,x,z) - layerSurface(below,x,z) > 0);
    }
    base += layer.height;
  });
  const top = state.layers.at(-1);
  const cap = buildTerrainCap(BASE_BY_ID.soil, substrateTop(state), top.height);
  updateTerrainCap(cap,state,substrateTop(state));
  const grains = cap.getObjectByName("surface-grains");
  const before = Array.from(grains.instanceMatrix.array);
  sculpt(state, 0, 0, .12, .45, .6);
  paintMaterial(state, 0, 0, .4, BASE_LAYERS.findIndex(d => d.id === "sand-turquoise"));
  updateTerrainCap(cap,state,substrateTop(state));
  assert.ok(Array.from(grains.instanceMatrix.array).some((v,i) => v !== before[i]), "grains must follow sculpting");
  assert.ok(Array.from(grains.instanceMatrix.array).every(Number.isFinite));
  const after = Array.from(grains.instanceMatrix.array);
  updateTerrainCap(cap,state,substrateTop(state));
  assert.deepEqual(Array.from(grains.instanceMatrix.array), after, "repeated updates must not drift");
  const vessel = buildJar(jarId,null,it);
  vessel.glassMats.filter(m => m.isMeshPhysicalMaterial).forEach(m => {
    assert.ok(m.roughness < .01 && m.thickness < .04, "glass must stay clear");
    assert.equal(m.depthWrite,false);
  });
}

for (const kind of ["grass", "moss", "mosspatch", "mossball", "bonsai", "stone", "pink", "fittoniabush", "aralia", "crag", "mineralpatch"]) {
  const obj = buildDecoration(kind);
  let draws = 0, triangles = 0;
  obj.traverse(o => {
    if (!o.isMesh) return;
    draws++;
    assert.ok(!o.material.isShaderMaterial, "no custom GLSL");
    assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
  });
  assert.ok(draws <= 18, `${kind}: keep dense foliage batched (${draws} meshes)`);
  assert.ok(triangles < 55000, `${kind}: triangle budget (${triangles})`);
}
assert.equal(nerveLeafMaps(),nerveLeafMaps(),"leaf textures are shared, not recreated per plant");
assert.ok(new Set(nerveLeafMaps().map.image.data).size > 100,"fine leaf colour and vein variation");
for (const recipe of Object.values(REFERENCE_STACKS)) {
  for (const step of recipe.steps) assert.ok(BASE_BY_ID[step.id], `unknown recipe material ${step.id}`);
  assert.equal(recipe.steps.reduce((sum,s)=>sum+s.mm,0),50);
}
for (const jarId of ["cork-cylinder","cork-low-s","cork-tall","cork-taper","cork-shoulder-l"]) {
  // Also exercise custom width/height sliders and the matching stopper.
  for (const k of [1,.78]) {
    const original=JAR_BY_ID[jarId].interior;
    const it={...original,innerRadius:original.innerRadius*k,bodyHeight:original.bodyHeight*k};
    setJarInterior(it,jarInnerSilhouette(jarId,it));
    const state=createState();
    for(const step of REFERENCE_STACKS.lime.steps) assert.ok(addLayer(state,step.id,step.mm));
    const ground=(x,z)=>substrateTop(state)+layerSurface(state.layers.at(-1),x,z);
    const planting=referencePlanting(ground);
    assert.equal(planting.length,28);
    const serialized=JSON.parse(JSON.stringify(planting.map(p=>p.record)));
    assert.equal(serialized.length,28,"ordinary JSON save records");
    for(const {record,object} of planting) {
      const k=record.norm*record.scale;
      object.scale.setScalar(1);object.position.set(0,0,0);object.rotation.y=0;
      const m=measureObject(object);
      assert.ok(bodyFitsAt(record.x,record.z,ground(record.x,record.z),m.r*k,m.h*k,.04),`${jarId}: ${record.id} must fit`);
      object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    }
    const jar=buildJar(jarId,null,it);
    assert.ok(jar.frameMats.some(m=>m.map && m.bumpMap),"textured cork stopper");
    jar.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
}
console.log("natural materials: OK (grain maps, save indices, rainbow layers, sculpt/paint, clear glass, batched foliage)");
