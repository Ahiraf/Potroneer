import assert from "node:assert/strict";
import * as THREE from "three";
import { grainSettings } from "../src/grain-settings.js";
import { BASE_BY_ID } from "../src/catalog.js";
import { JAR_BY_ID, jarInnerSilhouette, jarSectionFor, buildJar } from "../src/jar.js";
import { createState, setJarInterior, addLayer, setLayerGrain, adoptLayers, substrateBase, substrateTop, stackMm, insideJarAt, sculpt, paintMaterial } from "../src/state.js";
import { buildLayer, buildTerrainCap, updateTerrainCap, layerSurface } from "../src/builders.js";

assert.deepEqual(grainSettings(), {grainAmount:0,grainColor:"matching"});
for(const value of [null,NaN,Infinity,-100,"bad"])
  assert.equal(grainSettings({grainAmount:value}).grainAmount,0);
assert.equal(grainSettings({grainAmount:1e8,grainColor:"bad"}).grainAmount,100);
const matrix=new THREE.Matrix4(), point=new THREE.Vector3();
let vertices=0;
for(const jarId of ["mason","cork-taper","cork-shoulder","bowl","hexhouse","bottle"]) {
  const it=JAR_BY_ID[jarId].interior;
  const built=buildJar(jarId,null,it), panes=[];
  built.group.traverse(o=>{if(o.isMesh && built.glassMats.includes(o.material)) panes.push(o);});
  built.group.updateMatrixWorld(true);
  setJarInterior(it,jarInnerSilhouette(jarId,it),jarSectionFor(jarId,it,panes));
  const state=createState();
  addLayer(state,"soil",20); addLayer(state,"sand-amber",1); addLayer(state,"forest-soil",25);
  const beforeDepth=stackMm(state), original=JSON.stringify(state.layers);
  const old=adoptLayers([{type:"soil",height:.20,seed:1}]);
  assert.equal(old[0].grainAmount,0,"old saves stay clean");
  const base=substrateBase();
  const layer=state.layers[0];
  assert.equal(buildLayer(layer,base,false).getObjectByName("layer-side-grains"),undefined);
  setLayerGrain(state,0,{grainAmount:30});
  const low=buildLayer(layer,base,false).getObjectByName("layer-side-grains");
  setLayerGrain(state,0,{grainAmount:100});
  const high=buildLayer(layer,base,false).getObjectByName("layer-side-grains");
  assert.ok(high.count>low.count,"more grain increases particle count");
  assert.deepEqual(high.instanceMatrix.array.slice(0,low.count*16),low.instanceMatrix.array,"existing grains don't jump when density changes");
  setLayerGrain(state,0,{grainColor:"mixed"});
  const mixed=buildLayer(layer,base,false).getObjectByName("layer-side-grains");
  assert.deepEqual(mixed.instanceMatrix.array,high.instanceMatrix.array,"colour does not change positions");
  assert.notDeepEqual(mixed.instanceColor.array,high.instanceColor.array);
  let y=base;
  for(let index=0;index<state.layers.length;index++) {
    setLayerGrain(state,index,{grainAmount:100,grainColor:"mixed"});
    const l=state.layers[index], below=state.layers[index-1];
    const grain=buildLayer(l,y,false,below).getObjectByName("layer-side-grains");
    const pos=grain.geometry.attributes.position;
    for(let i=0;i<grain.count;i++) {
      grain.getMatrixAt(i,matrix);
      for(let v=0;v<pos.count;v++) {
        point.fromBufferAttribute(pos,v).applyMatrix4(matrix); vertices++;
        assert.ok(insideJarAt(point.y,point.x,point.z,0),`${jarId}: side grain outside jar`);
        assert.ok(point.y>=y+layerSurface(below,point.x,point.z)-.001,`${jarId}: grain below interface`);
        assert.ok(point.y<=y+l.height+layerSurface(l,point.x,point.z)+.001,`${jarId}: grain above interface`);
      }
    }
    y+=l.height;
  }
  assert.equal(stackMm(state),beforeDepth);
  const restored=adoptLayers(JSON.parse(JSON.stringify(state.layers)));
  assert.deepEqual(restored,state.layers,"save/reload preserves every layer's setting");
  const top=state.layers.at(-1), cap=buildTerrainCap(BASE_BY_ID[top.type],substrateTop(state),top.height);
  updateTerrainCap(cap,state,substrateTop(state));
  let grains=cap.getObjectByName("layer-top-grains");
  assert.equal(grains.count,1800);
  const first=Array.from(grains.instanceMatrix.array);
  updateTerrainCap(cap,state,substrateTop(state));
  assert.deepEqual(Array.from(grains.instanceMatrix.array),first,"top grains don't drift");
  sculpt(state,0,0,.12,.45,.6); paintMaterial(state,0,0,.4,5);
  updateTerrainCap(cap,state,substrateTop(state));
  assert.notDeepEqual(Array.from(grains.instanceMatrix.array),first,"top grains follow sculpting");
  setLayerGrain(state,2,{grainAmount:0}); updateTerrainCap(cap,state,substrateTop(state));
  assert.equal(cap.getObjectByName("layer-top-grains"),undefined,"zero removes all extra top grains");
  state.layers=adoptLayers(JSON.parse(original));
  assert.equal(buildLayer(state.layers[0],base,false).getObjectByName("layer-side-grains"),undefined,"undo to clean appearance");
}
console.log(`layer grain: OK (${vertices} grain vertices inside jars and layer boundaries; clean defaults, density, colour, saves and sculpting)`);
