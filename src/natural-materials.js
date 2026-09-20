import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// CPU-made, tileable material maps. Ordinary Three.js materials use these;
// there is no custom shader or extra asset download. One shared set per grain
// family keeps texture memory independent of the number of layers/items.
const cache = new Map();
const fract = (v) => v - Math.floor(v);
const hash = (x, y, seed = 1) => fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453);
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

function texture(data, size, color = false) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function grainMaps(family = "sand") {
  if (cache.has(family)) return cache.get(family);
  const size = 256;
  const albedo = new Uint8Array(size * size * 4);
  const height = new Uint8Array(size * size * 4);
  const coarse = family === "gravel" || family === "rock";
  const cells = family === "cork" ? 22 : family === "rock" ? 26 : coarse ? 9 : family === "soil" ? 29 : 62;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / size * cells, gy = y / size * cells;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      let nearest = 10, second = 10, seed = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy;
        const wx = (cx + cells) % cells, wy = (cy + cells) % cells;
        const px = cx + 0.15 + hash(wx, wy, 2) * 0.7;
        const py = cy + 0.15 + hash(wx, wy, 3) * 0.7;
        const dist = Math.hypot(gx - px, gy - py);
        if (dist < nearest) { second = nearest; nearest = dist; seed = hash(wx, wy, 5); }
        else if (dist < second) second = dist;
      }
      const edge = Math.min(1, (second - nearest) * (coarse ? 7 : 12));
      const noise = hash(x, y, 17);
      let shade = 170 + seed * 67 + noise * 18;
      let relief = edge * 150 + seed * 45 + noise * 22;
      if (family === "soil") shade = 116 + edge * 45 + seed * 65 + noise * 24;
      if (family === "gravel") shade = 110 + edge * 76 + seed * 50 + noise * 16;
      if (family === "rock") {
        // Small recessed pits, not spheres glued to the outside of a stone.
        const pore = seed > 0.48 ? Math.max(0, 1 - nearest / 0.29) : 0;
        shade = 192 + noise * 28 - pore * 132;
        relief = 175 + noise * 35 - pore * 160;
      }
      if (family === "fibre") {
        const fibre = Math.pow(Math.max(0, Math.sin(x * 0.7 + Math.sin(y * 0.055) * 6)), 9);
        shade = 149 + noise * 52 + fibre * 38;
        relief = 60 + fibre * 145 + noise * 34;
      }
      if (family === "cork") {
        const pore = seed > .76 && nearest < .22 ? 65 : 0;
        shade = 95 + seed*111 + edge*30 + noise*28 - pore;
        relief = 65 + edge*85 + seed*50 + noise*35 - pore;
      }
      const i = (y * size + x) * 4;
      albedo[i] = albedo[i + 1] = albedo[i + 2] = clamp(shade);
      height[i] = height[i + 1] = height[i + 2] = clamp(relief);
      albedo[i + 3] = height[i + 3] = 255;
    }
  }
  const maps = { map: texture(albedo, size, true), bumpMap: texture(height, size) };
  cache.set(family, maps);
  return maps;
}

export function substrateMaps(def) {
  return grainMaps(def.chunky ? "gravel" : def.id === "sphagnum" ? "fibre" :
    def.organic || def.id === "soil" || def.id === "charcoal" ? "soil" : "sand");
}

// Project side walls in real-world units, so thin sand bands do not stretch
// their grains. Split the wrap seam per triangle; top/bottom use a flat map.
export function substrateUVs(source, tile = 0.24) {
  const geo = source.toNonIndexed();
  const p = geo.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const vertical = Math.abs(ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().y) < 0.65;
    const angles = [a, b, c].map(v => Math.atan2(v.z, v.x) / (Math.PI * 2));
    const wraps = Math.max(...angles) - Math.min(...angles) > 0.5;
    [a, b, c].forEach((v, j) => {
      const u = angles[j] + (wraps && angles[j] < 0 ? 1 : 0);
      uv[(i + j) * 2] = vertical ? u * Math.PI * 2 / tile : v.x / tile;
      uv[(i + j) * 2 + 1] = vertical ? v.y / tile : v.z / tile;
    });
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  // Only the wrap/top seams need split vertices. Re-index everything else so
  // detailed maps do not multiply GPU memory or containment-check work.
  const indexed = mergeVertices(geo, 1e-5);
  geo.dispose();
  return indexed;
}

// A folded, bending blade with an actual pointed outline. Width/height are
// geometry, not alpha transparency, so leaves stay crisp through glass.
export function leafBlade(length, width, bend = 0.25, segments = 5, crossSegments = 2) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = width * Math.pow(Math.sin(Math.PI * t), 0.8) * 0.5 + 0.00001;
    for (let j = 0; j <= crossSegments; j++) {
      const s = j / crossSegments * 2 - 1;
      positions.push(s * w, length * t, length * bend * t * t + (1-s*s) * w * 0.16);
      uvs.push(j / crossSegments, t);
    }
    if (i < segments) for (let j = 0; j < crossSegments; j++) {
      const row = crossSegments + 1, n = i * row + j;
      indices.push(n, n + 1, n + row, n + 1, n + row + 1, n + row);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function tintBlade(geo, hex) {
  const base = new THREE.Color(hex).multiplyScalar(0.55), c = new THREE.Color();
  const uv = geo.attributes.uv;
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    // Shadowed base, fresh tips, subtle light-catching midrib.
    c.copy(base).multiplyScalar((0.60 + uv.getY(i) * 0.42) * (i % 3 === 1 ? 1.12 : 1));
    c.toArray(colors, i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}
