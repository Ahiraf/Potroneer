import * as THREE from "three";

// Support is an actual upward-facing triangle, never the top of a bounding
// box (which would make a plant float over a gap between branches).
export function surfaceOnItems(root, objects, x, z, ground, ceiling) {
  root.updateWorldMatrix(true, true);
  const origin = root.localToWorld(new THREE.Vector3(x, ceiling + 1, z));
  const direction = new THREE.Vector3(0, -1, 0).transformDirection(root.matrixWorld);
  const ray = new THREE.Raycaster(origin, direction);
  const inverseRoot = root.matrixWorld.clone().invert();
  for (const hit of ray.intersectObjects(objects, true)) {
    if (!hit.face || !hit.object.visible) continue;
    const localMatrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, hit.object.matrixWorld);
    const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(localMatrix));
    if (normal.y < 0.15) continue;
    const point = root.worldToLocal(hit.point.clone());
    if (point.y < ground - 0.003 || point.y > ceiling + 0.001) continue;
    let object = hit.object;
    while (object && !objects.includes(object)) object = object.parent;
    if (object) return { y: point.y, object };
  }
  return null;
}

export function ensurePlacementId(record) {
  return record.uid ??= globalThis.crypto.randomUUID();
}

export function supportedBy(object, ancestor, objects) {
  const seen = new Set();
  let id = object?.userData.record?.supportId;
  while (id && !seen.has(id)) {
    if (id === ancestor?.userData.record?.uid) return true;
    seen.add(id);
    id = objects.find(o => o.userData.record?.uid === id)?.userData.record?.supportId;
  }
  return false;
}

export function attachSupport(root, object, support) {
  const rec = object.userData.record;
  delete rec.supportId;
  delete rec.supportAnchor;
  if (!support) return;
  support.updateWorldMatrix(true, false);
  const point = root.localToWorld(new THREE.Vector3(rec.x, rec.y, rec.z));
  rec.supportId = ensurePlacementId(support.userData.record);
  rec.supportAnchor = support.worldToLocal(point).toArray();
}

// Parents settle first. Anchors are in the support's own coordinates, so a
// stack follows a moved, rotated or resized stone and survives JSON saves.
export function settleSupportedItems(root, objects, groundAt) {
  const byId = new Map(objects.map(o => [o.userData.record?.uid, o]));
  const done = new Set(), visiting = new Set();
  function settle(obj) {
    if (done.has(obj)) return;
    const rec = obj.userData.record;
    if (!rec) return;
    visiting.add(obj);
    const support = byId.get(rec.supportId);
    if (support && support !== obj && !visiting.has(support) && Array.isArray(rec.supportAnchor) &&
        rec.supportAnchor.length === 3 && rec.supportAnchor.every(Number.isFinite)) {
      settle(support);
      support.updateWorldMatrix(true, false);
      const point = root.worldToLocal(support.localToWorld(new THREE.Vector3(...rec.supportAnchor)));
      rec.x = point.x; rec.z = point.z;
      rec.y = Math.max(groundAt(rec.x, rec.z), point.y);
    } else {
      delete rec.supportId;
      delete rec.supportAnchor;
      rec.y = groundAt(rec.x, rec.z);
    }
    obj.position.set(rec.x, rec.y, rec.z);
    obj.updateWorldMatrix(true, true);
    visiting.delete(obj);
    done.add(obj);
  }
  objects.forEach(settle);
}
