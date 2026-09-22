import assert from 'node:assert/strict';
import * as THREE from 'three';
import { JAR_BY_ID, buildJar, jarInnerSilhouette } from '../src/jar.js';
import { DECORATIONS } from '../src/catalog.js';
import { buildDecoration } from '../src/builders.js';
import { normalizeFactor, measureObject } from '../src/sizing.js';
import { createWaterStream, updateWaterStream } from '../src/water-stream.js';

for (const id of ['wood-vase','pear-cork','cork-ball']) {
  for (const suffix of ['', '-s', '-l']) {
    const jar = JAR_BY_ID[id+suffix], it = jar.interior;
    const silhouette = jarInnerSilhouette(jar.id,it);
    assert.ok(silhouette.every(p=>Number.isFinite(p.r)&&p.r>0));
    assert.ok(silhouette.at(-1).r < it.innerRadius*.85, 'neck must taper');
    const built = buildJar(jar.id,null,it);
    const bounds = new THREE.Box3().setFromObject(built.group);
    assert.ok(Number.isFinite(bounds.max.y));
    if (id==='cork-ball') assert.ok(bounds.max.y > it.floorY+it.bodyHeight+.4*it.innerRadius);
    if (id==='wood-vase') assert.equal(jar.lid,false);
  }
}
for (const def of DECORATIONS.filter(d=>['pumice','buttonpebble'].includes(d.kind))) {
  assert.equal(def.cat,'rocks');
  const stone = buildDecoration(def.kind,def.variant);
  const metrics = measureObject(stone), scale = normalizeFactor(def,stone);
  assert.ok(metrics.h*scale < .2,'stones stay miniature');
  stone.traverse(o=>{if(o.isMesh) assert.ok(o.material.bumpMap);});
}
const water = createWaterStream();
water.visible=true;
const geometry=water.children[0].geometry, material=water.userData.material;
for (const h of [.25,1,3.4]) {
  water.userData.height=h;
  updateWaterStream(water,100);
  const before=Array.from(geometry.attributes.position.array);
  updateWaterStream(water,800);
  assert.ok(geometry.attributes.position.array.some((v,i)=>Math.abs(v-before[i])>1e-5));
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.min.y)<1e-6);
  assert.ok(Math.abs(geometry.boundingBox.max.y-h)<1e-6,'stream meets surface and spout');
  assert.ok(Array.from(geometry.attributes.normal.array).every(Number.isFinite));
}
updateWaterStream(water,100,true);
const calm=Array.from(geometry.attributes.position.array);
updateWaterStream(water,900,true);
assert.deepEqual(Array.from(geometry.attributes.position.array),calm);
assert.ok(water.children.slice(1).every(d=>!d.visible));
assert.equal(water.children[0].geometry,geometry);
assert.equal(water.userData.material,material);
assert.equal(material.depthWrite,false);
console.log('Reference additions: 9 jars, 6 miniature stones, animated/reduced-motion water passed.');
