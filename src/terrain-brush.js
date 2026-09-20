import { sculpt, flatten, paintMaterial } from "./state.js";

// Sample the travelled segment at sub-brush spacing, distributing one frame's
// material across it. Pointer frequency cannot change how much soil is added.
export function strokeTerrain(state, from, to, seconds, { radius, strength, falloff, tool="raise", material=-1 }) {
  const dt = Math.min(.05, Math.max(0, seconds));
  const distance = Math.hypot(to.x-from.x,to.z-from.z);
  const steps = Math.min(24,Math.max(1,Math.ceil(distance/(radius*.2))));
  for(let i=1;i<=steps;i++) {
    const x=from.x+(to.x-from.x)*i/steps, z=from.z+(to.z-from.z)*i/steps;
    if(tool==="flatten") flatten(state,x,z,1-Math.exp(-dt*(2+strength/12)/steps),radius,falloff);
    else sculpt(state,x,z,(.006+strength/100*.05)*16*dt/steps*(tool==="lower"?-1:1),radius,falloff);
    if(material>=0) paintMaterial(state,x,z,radius,material);
  }
}
