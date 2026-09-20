import { JAR } from "./state.js";
import { DECOR_BY_ID } from "./catalog.js";
import { buildDecoration } from "./builders.js";
import { nativeMetrics, measureObject, normalizeFactor, maxScaleAt, clampBodyInside } from "./sizing.js";

// Shared by the real builder and its visual test fixture. Each entry becomes
// an ordinary save record and independently selectable object.
export function referencePlanting(ground, allowed = () => true) {
  const layout = [
    ["aralia",-.20,-.28,1.28,.4],
    ["fittoniabush-1",.24,-.12,1.22,.6],
    ["fittoniabush",-.34,.05,1.08,1.5],
    ["fittoniabush-2",.40,.18,.87,2.5],
    ["fittoniabush-1",-.10,.34,.75,.8],
    ["crag",.05,.12,1.22,.6],
    ["stone",-.36,.38,1.05,1.2],
    ["fern",.42,-.35,1.65,-.5],
  ];
  for(let i=0;i<12;i++) {
    const a=i*2.399963,r=.38+(i%3)*.17;
    layout.push([i%4===0 ? "moss-2" : "moss",Math.cos(a)*r,Math.sin(a)*r,1.65+(i%3)*.16,a]);
  }
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    layout.push(["mineralpatch",Math.cos(a)*.79,Math.sin(a)*.79,.88,a]);
  }
  const jarK=Math.min(1.25,Math.max(.55,JAR.innerRadius));
  return layout.flatMap(([id,x,z,size,rotation]) => {
    const def=DECOR_BY_ID[id];
    if(!allowed(def.kind)) return [];
    const object=buildDecoration(def.kind,def.variant);
    nativeMetrics(def,object);
    // Existing procedural ferns/moss vary between builds; fit this instance,
    // not the first instance retained by the general size-normalisation cache.
    const metrics=measureObject(object), norm=normalizeFactor(def,object)*jarK;
    let k=maxScaleAt(0,0,ground(0,0),metrics.r,metrics.h,norm*size);
    const spot=clampBodyInside(x*JAR.innerRadius,z*JAR.innerRadius,ground(x*JAR.innerRadius,z*JAR.innerRadius),metrics.r*k,metrics.h*k);
    k=maxScaleAt(spot.x,spot.z,ground(spot.x,spot.z),metrics.r,metrics.h,k);
    if(k < .03) {
      object.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
      return [];
    }
    const record={id,kind:def.kind,x:spot.x,z:spot.z,y:ground(spot.x,spot.z)-metrics.minY*k,rotation,norm,scale:k/norm,tint:null};
    object.position.set(record.x,record.y,record.z);object.rotation.y=rotation;object.scale.setScalar(k);
    object.userData.record=record;object.userData.baseScale=k;
    return [{record,object}];
  });
}
