import * as THREE from "three";

// Reuse a small mesh and droplets for an entire watering stroke.
export function createWaterStream() {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf0fbff, roughness: .045, metalness: 0, transmission: .72,
    thickness: .025, ior: 1.333, transparent: true, opacity: .68,
    depthWrite: false, clearcoat: 1, side: THREE.DoubleSide,
  });
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 12, 32, true);
  const source = geometry.attributes.position.array.slice();
  const stream = new THREE.Mesh(geometry, material);
  stream.frustumCulled = false;
  group.add(stream);
  const dropGeometry = new THREE.SphereGeometry(.012, 10, 8);
  for (let i=0;i<12;i++) {
    const drop = new THREE.Mesh(dropGeometry, material);
    group.add(drop);
  }
  group.visible = false;
  group.userData.height = 1;
  group.userData.material = material;
  group.userData.source = source;
  return group;
}

export function updateWaterStream(group, now, calm = false) {
  if (!group?.visible) return;
  const stream = group.children[0], p = stream.geometry.attributes.position;
  const source = group.userData.source, h = group.userData.height;
  const amount = Math.max(.2, Math.min(2, group.userData.amount ?? 1));
  const time = calm ? 0 : now * .001;
  for (let i=0;i<p.count;i++) {
    const u = source[i*3+1]+.5; // zero at the soil, one at the spout
    const fall = 1-u;
    // Gravity narrows the stream as it accelerates; surface tension creates
    // travelling necks and highlights, with both endpoints kept in place.
    const radius = Math.sqrt(amount) * (.012 + .009*u) * (1+.15*Math.sin(fall*35-time*19));
    const bend = Math.sin(u*Math.PI);
    p.setXYZ(i, source[i*3]*radius + bend*(.032+.004*Math.sin(time*7+u*13)),
      u*h, source[i*3+2]*radius + bend*.005*Math.sin(time*6+u*19));
  }
  p.needsUpdate = true;
  stream.geometry.computeVertexNormals();
  for (let i=1;i<group.children.length;i++) {
    const drop = group.children[i];
    const phase = (time*1.25+i*.083)%1;
    const a = i*2.399;
    drop.position.set(Math.cos(a)*(.025+phase*.02), h*(1-phase*phase), Math.sin(a)*.028);
    drop.scale.set(.42,.7+phase*1.1,.42);
    drop.visible = !calm && i <= Math.round(6*amount);
  }
}
