import assert from "node:assert/strict";
import * as THREE from "three";
import { createState, addLayer, sculpt, heightAt, substrateTop, setJarInterior, insideJarAt, JAR } from "../src/state.js";
import { JAR_BY_ID, jarInnerSilhouette, jarSectionFor } from "../src/jar.js";
import { buildTerrainCap, updateTerrainCap, terrainSurfaceY, buildDecoration } from "../src/builders.js";
import { BASE_BY_ID, DECORATIONS } from "../src/catalog.js";
import { strokeTerrain } from "../src/terrain-brush.js";
import { surfaceOnItems, attachSupport, settleSupportedItems, supportedBy } from "../src/placement.js";
import { measureObject, normalizeFactor } from "../src/sizing.js";

function jar(id="mason") {
  const interior=JAR_BY_ID[id].interior;
  setJarInterior(interior,jarInnerSilhouette(id,interior),jarSectionFor(id,interior));
}
function ground() { const s=createState(); addLayer(s,"soil",30); return s; }
jar();
const params={radius:.38,strength:50,falloff:.95};
const a=ground(),b=ground(),centre={x:0,z:0};
for(let i=0;i<60;i++) strokeTerrain(a,centre,centre,1/60,params);
for(let i=0;i<144;i++) strokeTerrain(b,centre,centre,1/144,params);
assert.ok(Math.abs(heightAt(a,0,0)-heightAt(b,0,0))<1e-5,"same hold time gives same height at 60 and 144 Hz");
assert.ok(heightAt(a,0,0)>.4,"hold to raise passes the old .34-unit hill limit");
for(let i=0;i<600;i++) strokeTerrain(a,centre,centre,1/60,params);
assert.ok(terrainSurfaceY(a,0,0)<=JAR.floorY+JAR.bodyHeight,"hill stays under the lid");
const before=heightAt(a,0,0);
strokeTerrain(a,centre,centre,1/30,{...params,tool:"lower"});
assert.ok(heightAt(a,0,0)<before,"lower remains responsive at the height ceiling");
const painted=ground();
strokeTerrain(painted,{x:-.4,z:0},{x:.4,z:0},.05,{...params,radius:.12,material:4});
for(let x=-.3;x<=.4;x+=.1) assert.ok(heightAt(painted,x,0)>0,"fast drag fills intermediate positions");
assert.ok(painted.painted);

for(const id of ["mason","cork-cylinder","globe","bowl","flask"]) {
  jar(id);
  const s=ground(),cap=buildTerrainCap(BASE_BY_ID.soil,substrateTop(s),s.layers[0].height);
  updateTerrainCap(cap,s,substrateTop(s));
  const initialBound=cap.geometry.boundingSphere.clone();
  sculpt(s,0,0,1.15,.45,.9);
  updateTerrainCap(cap,s,substrateTop(s));
  const p=cap.geometry.attributes.position;
  for(let i=0;i<p.count;i++) {
    assert.ok(Number.isFinite(p.getY(i)),"finite terrain");
    assert.ok(insideJarAt(p.getY(i),p.getX(i),p.getZ(i),-.001),`${id}: tall hill inside glass`);
  }
  assert.ok(!cap.geometry.boundingSphere.equals(initialBound),"picking bounds follow taller terrain");
  const ray=new THREE.Raycaster(new THREE.Vector3(0,JAR.floorY+JAR.bodyHeight+1,0),new THREE.Vector3(0,-1,0));
  cap.updateMatrixWorld(true);
  const hit=ray.intersectObject(cap,false)[0];
  assert.ok(hit,"raised hill is still raycastable");
  assert.ok(Math.abs(hit.point.y-terrainSurfaceY(s,0,0))<.005,"visible and placement heights agree");
}

// A stack under a turned/scaled world: box tops, empty gaps, a third level,
// support movement, rotation, resizing, removal and JSON restoration.
const root=new THREE.Group(); root.rotation.set(.15,.5,0); root.scale.setScalar(1.3);
function box(w,h,d,x=0,z=0) {
  const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial());
  mesh.position.y=h/2; group.add(mesh); root.add(group);
  group.position.set(x,0,z);
  group.userData.record={uid:crypto.randomUUID(),x,y:0,z,rotation:0,scale:1};
  return group;
}
const stone=box(.6,.15,.5),wood=box(.3,.12,.15),plant=box(.08,.2,.08);
wood.visible=false; plant.visible=false;
const contact=surfaceOnItems(root,[stone],.05,0,0,3);
assert.ok(Math.abs(contact.y-.15)<1e-6,"surface uses the actual stone top in rotated world");
assert.equal(surfaceOnItems(root,[stone],.9,0,0,3),null,"empty space cannot support an item");
wood.visible=true; wood.position.set(.05,contact.y,0);
Object.assign(wood.userData.record,{x:.05,y:contact.y});
attachSupport(root,wood,stone);
plant.visible=true; plant.position.set(.05,.27,0);
Object.assign(plant.userData.record,{x:.05,y:.27});
attachSupport(root,plant,wood);
assert.ok(supportedBy(plant,stone,[stone,wood,plant]),"exclude the whole subtree when moving a base");
stone.userData.record.x=.3; stone.position.x=.3; stone.rotation.y=.4; stone.scale.setScalar(1.5);
settleSupportedItems(root,[plant,wood,stone],()=>.1);
assert.ok(Math.abs(wood.userData.record.y-.325)<1e-5,"support height includes resized stone and changed ground");
assert.ok(Math.abs(plant.userData.record.y-.445)<1e-5,"third level remains stacked");
const saved=JSON.parse(JSON.stringify([stone,wood,plant].map(o=>o.userData.record)));
[stone,wood,plant].forEach((o,i)=>o.userData.record=saved[i]);
settleSupportedItems(root,[stone,wood,plant],()=>.1);
assert.ok(Math.abs(plant.position.y-.445)<1e-5,"save/load keeps links and height");
settleSupportedItems(root,[wood,plant],()=>.1);
assert.equal(wood.userData.record.supportId,undefined,"removing base detaches its immediate child");
assert.ok(Math.abs(plant.position.y-.22)<1e-5,"upper levels follow the settling child");

const kinds=["riverpebble","steppingstone","slatechip","granite","lavastone","sandstone"];
const additions=DECORATIONS.filter(d=>kinds.includes(d.kind));
assert.equal(additions.length,18);
for(const def of additions) {
  const first=buildDecoration(def.kind,def.variant), second=buildDecoration(def.kind,def.variant);
  const m=measureObject(first),k=normalizeFactor(def,first);
  assert.ok(m.minY>=-1e-6 && m.h>0,"natural stones sit on a flat base");
  assert.ok(m.w*k<=.43,"rocks remain useful terrarium-sized pieces");
  assert.deepEqual(first.children[0].geometry.attributes.position.array,second.children[0].geometry.attributes.position.array,"saved steps keep their shape");
  const mat=first.children[0].material;
  assert.ok(mat.map && mat.bumpMap && mat.roughnessMap,"real mineral texture and surface variation");
}
console.log("landscaping: OK (continuous strokes, tall hills, containment, picking, stacking, movement, removal, saved supports, 18 natural stones)");
