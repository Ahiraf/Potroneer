import * as THREE from "three";
import { grainMaps, leafBlade } from "./natural-materials.js";

// Fine reticulate veins, made on the CPU. Solid, folded leaf geometry means
// no transparent rectangles, sorting artefacts or shader hooks through glass.
const leafMaps = new Map();
const fract = n => n - Math.floor(n);
const rand = n => fract(Math.sin(n * 127.13 + 13.7) * 43758.5453);
export function nerveLeafMaps(vein = "#eaa4ba", base = "#254b24") {
  const key = `${vein}:${base}`;
  if (leafMaps.has(key)) return leafMaps.get(key);
  const size = 256, pixels = new Uint8Array(size*size*4), bump = new Uint8Array(size*size*4);
  const vc = new THREE.Color(vein).convertLinearToSRGB();
  const bc = new THREE.Color(base).convertLinearToSRGB();
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const t=y/(size-1), u=x/(size-1)*2-1, a=Math.abs(u);
    const n=rand(x+y*size), wave=Math.sin(t*35+u*8)*.015;
    const phase=t*7.3-a*.70-a*a*.15+wave;
    const lateral=Math.abs(Math.sin(phase*Math.PI));
    const secondary=Math.abs(Math.sin((a*5.7+t*9.2+Math.sin(t*32)*.10)*Math.PI));
    const mid=Math.max(0,1-a/.025);
    const branch=Math.max(0,1-lateral/.13)*(1-a*.65);
    const net=Math.max(0,1-secondary/.09)*.48*(1-a*.42);
    const v=Math.min(1,Math.max(mid,branch,net));
    const mottling=.77+n*.14+Math.sin(u*17+t*53)*.035;
    const i=(y*size+x)*4;
    ["r","g","b"].forEach((c,k) => {
      pixels[i+k]=Math.round(255*(bc[c]*mottling*(1-v)+vc[c]*v*.94));
      bump[i+k]=Math.round(95+v*60+n*15);
    });
    pixels[i+3]=bump[i+3]=255;
  }
  const make = (data, color) => {
    const tx=new THREE.DataTexture(data,size,size);
    tx.colorSpace=color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tx.magFilter=THREE.LinearFilter; tx.minFilter=THREE.LinearMipmapLinearFilter;
    tx.generateMipmaps=true; tx.anisotropy=4; tx.needsUpdate=true;
    return tx;
  };
  const result={map:make(pixels,true),bumpMap:make(bump,false)};
  leafMaps.set(key,result);
  return result;
}

function stem(group, from, to, material, radius=.004) {
  const delta=to.clone().sub(from);
  const m=new THREE.Mesh(new THREE.CylinderGeometry(radius*.65,radius,delta.length(),6),material);
  m.position.copy(from).add(to).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  m.castShadow=true; group.add(m);
}

export function referenceFittonia(v={}) {
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({
    ...nerveLeafMaps(v.vein,v.base), bumpScale:.0009,
    roughness:.72, envMapIntensity:.35, side:THREE.DoubleSide,
  });
  const stemMat=new THREE.MeshStandardMaterial({color:"#566038",roughness:.9});
  const count=v.compact ? 4 : 6;
  for (let s=0;s<count;s++) {
    const a=s*2.39996, r=s===0 ? 0 : .055+rand(s)*.05;
    const h=.25+rand(s+10)*.20;
    const origin=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);
    const top=origin.clone().add(new THREE.Vector3(Math.cos(a)*.045,h,Math.sin(a)*.045));
    stem(g,origin,top,stemMat,.006);
    for(let row=0;row<3;row++) for(let side=0;side<2;side++) {
      const angle=a+row*1.28+side*Math.PI;
      const node=origin.clone().lerp(top,.38+row*.27);
      const petiole=node.clone().add(new THREE.Vector3(Math.sin(angle)*.025,.015,Math.cos(angle)*.025));
      stem(g,node,petiole,stemMat,.0025);
      const length=(.16+rand(s*11+row)*.055)*(1-row*.13);
      const geo=leafBlade(length,length*.78,-.18,10,6);
      const leaf=new THREE.Mesh(geo,mat);
      leaf.position.copy(petiole);
      leaf.rotation.order="YXZ";
      leaf.rotation.set(.88+rand(s+row*21)*.40,angle,(rand(row+s*7)-.5)*.22);
      leaf.castShadow=leaf.receiveShadow=true;
      g.add(leaf);
    }
  }
  // Keep the original low Fittonia's native proportions for saved records.
  if(v.compact) {
    g.scale.set(.88,.29,.88);
    return new THREE.Group().add(g); // root stays identity for mesh batching
  }
  return g;
}

export function referenceAralia() {
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({
    ...nerveLeafMaps("#617e39","#234c1d"),bumpScale:.0007,
    roughness:.78,envMapIntensity:.3,side:THREE.DoubleSide,
  });
  const stems=new THREE.MeshStandardMaterial({color:"#526b2e",roughness:.9});
  for(let s=0;s<3;s++) {
    const a=s*2.39996;
    const root=new THREE.Vector3(Math.cos(a)*.05,0,Math.sin(a)*.05);
    const tip=new THREE.Vector3(Math.cos(a)*.12,.68+s*.13,Math.sin(a)*.12);
    stem(g,root,tip,stems,.009);
    for(let row=0;row<5;row++) {
      const angle=a+row*2.39996;
      const node=root.clone().lerp(tip,.30+row*.16);
      const end=node.clone().add(new THREE.Vector3(Math.sin(angle)*.12,.08,Math.cos(angle)*.12));
      stem(g,node,end,stems,.004);
      for(let j=0;j<3;j++) {
        const geo=leafBlade(.15,.09,-.24,14,4), p=geo.attributes.position;
        for(let i=0;i<p.count;i++) {
          const t=geo.attributes.uv.getY(i);
          p.setX(i,p.getX(i)*(.86+.14*Math.cos(t*Math.PI*8)));
        }
        geo.computeVertexNormals();
        const leaf=new THREE.Mesh(geo,mat);
        leaf.position.copy(end); leaf.rotation.order="YXZ";
        leaf.rotation.set(.8+j*.20,angle+(j-1)*1.1,0);
        leaf.castShadow=leaf.receiveShadow=true; g.add(leaf);
      }
    }
  }
  return g;
}

export function referenceCrag(v={}) {
  const g=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:v.color ?? "#a69e82",...grainMaps("rock"),bumpScale:.012,roughness:.98});
  for(let k=0;k<3;k++) {
    const geo=new THREE.SphereGeometry(1,18,14), p=geo.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const jag=.88+Math.sin(y*17+x*7+z*5)*.19+Math.sin(x*21+z*16)*.07;
      p.setXYZ(i,x*jag*.18+Math.sin(y*9)*.025,Math.min(.72,Math.max(-.8,y))*.29+.232,z*jag*.14);
    }
    geo.computeVertexNormals();
    const rock=new THREE.Mesh(geo,mat);
    rock.scale.setScalar(1-k*.23); rock.position.set(k*.09,0,k*.035);
    rock.rotation.y=k*.9; rock.castShadow=rock.receiveShadow=true; g.add(rock);
  }
  return g;
}

export function referenceGravel(v={}) {
  const mat=new THREE.MeshStandardMaterial({...grainMaps("rock"),bumpScale:.003,roughness:.95});
  const mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mat,70);
  const o=new THREE.Object3D(),color=new THREE.Color();
  const palette=v.colors ?? ["#bd8f47","#e0bf79","#92723e"];
  for(let i=0;i<70;i++) {
    const a=i*2.39996,r=Math.sqrt((i+.5)/70)*.23,s=.014+rand(i)*.013;
    o.position.set(Math.cos(a)*r,s*.56,Math.sin(a)*r*.8);
    o.scale.set(s,s*.65,s*.8); o.rotation.set(rand(i)*2,a,rand(i+3)); o.updateMatrix();
    mesh.setMatrixAt(i,o.matrix); mesh.setColorAt(i,color.set(palette[i%palette.length]));
  }
  mesh.castShadow=mesh.receiveShadow=true;
  const g=new THREE.Group();g.add(mesh);return g;
}
