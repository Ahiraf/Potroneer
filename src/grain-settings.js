// Serializable, bounded settings shared by pouring, saved layers and rendering.
// Zero means the existing clean look, not a migration of the user's old jars.
export function grainSettings(value = {}) {
  const n = Number(value?.grainAmount);
  return {
    grainAmount: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n / 10) * 10)) : 0,
    grainColor: value?.grainColor === "mixed" ? "mixed" : "matching",
  };
}

export function grainRandom(seed, index, channel = 0) {
  let n = Math.imul((seed | 0) ^ Math.imul(index + 1, 374761393), 668265263) ^ Math.imul(channel + 1, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function extraGrainColor(target, def, layer, index) {
  const n = grainRandom(layer?.seed ?? 1, index, 8);
  target.set(def.swatch);
  if (layer?.grainColor === "mixed" && n > .58) {
    // Cream mineral grains, ochre grit and dark organic particles. Keep most
    // grains material-coloured so a coloured sand band stays recognisable.
    target.set(["#b9a27c", "#6d5035", "#29231d", "#d4c4a5"][index % 4]);
  }
  return target.multiplyScalar(.50 + grainRandom(layer?.seed ?? 1, index, 9) * .85);
}
