import * as THREE from "three";

const maps = new Map();
const fract = x => x - Math.floor(x);
const hash = (x,y,s) => fract(Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453);
const clamp = x => Math.max(0,Math.min(255,Math.round(x)));

// Shared mineral maps: broad veining, fine mineral grains and tiny recessed
// pores. Colour, relief and roughness describe the same features.
export function rockMaps(family = "river") {
  if (maps.has(family)) return maps.get(family);
  const size = 256, colour = new Uint8Array(size*size*4), relief = colour.slice(), roughness = colour.slice();
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const u=x/size*Math.PI*2, v=y/size*Math.PI*2;
    const broad=(Math.sin(u*3+Math.sin(v*2)) + Math.cos(v*4+Math.sin(u)))*.5;
    const grain=hash(x,y,13), fleck=hash(x>>1,y>>1,7);
    const vein=Math.exp(-Math.abs(Math.sin(u*2+v*3+Math.sin(v*2)*.7))*40);
    const pore=Math.max(0,(hash(x>>2,y>>2,23)-.76)/.24);
    let c=211+broad*14+(grain-.5)*14+vein*19, h=135+(grain-.5)*12, r=173+grain*20;
    if (family==="granite") { c=154+fleck*84+(grain-.5)*30; h=110+fleck*36; r=213+grain*24; }
    if (family==="lava") { c=192+broad*18-pore*90; h=164-pore*126+grain*12; r=232+grain*20; }
    if (family==="slate") { const seam=Math.sin(v*24+Math.sin(u)*1.5); c=199+broad*15+seam*12+vein*20; h=125+seam*13+grain*9; r=211+grain*20; }
    if (family==="sandstone") { c=202+Math.sin(v*12+Math.sin(u)*.5)*13+(grain-.5)*24; h=120+grain*35; r=231+grain*18; }
    const i=(y*size+x)*4;
    for (let k=0;k<3;k++) { colour[i+k]=clamp(c); relief[i+k]=clamp(h); roughness[i+k]=clamp(r); }
    colour[i+3]=relief[i+3]=roughness[i+3]=255;
  }
  function texture(data,srgb=false) {
    const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
    t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.magFilter=THREE.LinearFilter; t.minFilter=THREE.LinearMipmapLinearFilter;
    t.generateMipmaps=true; t.anisotropy=4;
    if(srgb) t.colorSpace=THREE.SRGBColorSpace;
    t.needsUpdate=true; return t;
  }
  const result={map:texture(colour,true),bumpMap:texture(relief),roughnessMap:texture(roughness)};
  maps.set(family,result); return result;
}

const SHAPES={
  riverpebble:{size:[.13,.055,.092],family:"river",flat:false},
  steppingstone:{size:[.22,.044,.135],family:"river",flat:true},
  slatechip:{size:[.20,.032,.13],family:"slate",flat:true},
  granite:{size:[.15,.16,.13],family:"granite",flat:false},
  lavastone:{size:[.15,.18,.13],family:"lava",flat:false},
  sandstone:{size:[.20,.12,.14],family:"sandstone",flat:true},
};

export function naturalRock(kind="riverpebble", {color="#70716a",seed=1}={}) {
  const spec=SHAPES[kind] ?? SHAPES.riverpebble;
  const group=new THREE.Group();
  const geo=new THREE.SphereGeometry(1,40,24);
  const p=geo.attributes.position, colours=new Float32Array(p.count*3), base=new THREE.Color(color), c=new THREE.Color();
  const phase=seed*1.731;
  let minY=Infinity;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const a=Math.atan2(z,x);
    const weather=1+.055*Math.sin(x*5+z*3+phase)*Math.cos(y*4-phase)+.025*Math.sin(z*11+x*7);
    const edge=1+.07*Math.sin(a*5+phase)+.035*Math.cos(a*3-phase);
    // A broad, gently uneven upper face and rounded perimeter for real steps;
    // rougher stones retain broken shoulders and a heavier silhouette.
    const yy=spec.flat ? Math.max(-.42,Math.min(.50,y*1.8))+.025*Math.sin(x*9+z*5+phase) : Math.max(-.74,y*weather);
    const py=yy*spec.size[1];
    p.setXYZ(i,x*spec.size[0]*weather*(spec.flat?edge:1),py,z*spec.size[2]*weather*(spec.flat?edge:1));
    minY=Math.min(minY,py);
    const m=.90+.09*Math.sin(x*4+z*6+phase)*Math.cos(y*5)+.035*Math.sin(x*19+z*13);
    c.copy(base).multiplyScalar(m);
    colours.set([c.r,c.g,c.b],i*3);
  }
  geo.translate(0,-minY,0);
  geo.setAttribute("color",new THREE.BufferAttribute(colours,3));
  geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({
    vertexColors:true,...rockMaps(spec.family),roughness:1,
    bumpScale:spec.family==="lava"?.008:spec.family==="river"?.0013:.003,
    metalness:0,envMapIntensity:.45,
  });
  const stone=new THREE.Mesh(geo,material);
  stone.castShadow=stone.receiveShadow=true;
  group.add(stone); return group;
}
