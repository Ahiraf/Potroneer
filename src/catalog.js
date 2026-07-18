// The catalog defines every material the user can place. Keeping it as plain
// data (not code) makes the tray, the 3D builders and the save-model all read
// from one source of truth. Colors lean warm and slightly desaturated so the
// whole thing feels hand-mixed rather than printed.

// Ordered the way a real closed terrarium is built, bottom to top:
// drainage (LECA/নুড়ি) → sphagnum barrier → activated charcoal → soil,
// then sands as decorative strata.
export const BASE_LAYERS = [
  {
    id: "leca",
    label: "লেকা বল",
    swatch: "#a97c54",
    colors: ["#9c6f48", "#a97c54", "#b78a60", "#8d6540"],
    grain: 1.0,
    layerHeight: 0.2,
    chunky: true, // clay balls read as round chunks
  },
  {
    id: "pebbles",
    label: "নুড়ি",
    swatch: "#8a8378",
    colors: ["#736c62", "#8a8378", "#9c948a", "#a89f92"],
    grain: 1.0,
    layerHeight: 0.18,
    chunky: true,
  },
  {
    id: "sphagnum",
    label: "স্ফ্যাগনাম",
    swatch: "#b8a86a",
    colors: ["#a89a58", "#b8a86a", "#c9bb80", "#95884e"],
    grain: 0.8,
    layerHeight: 0.08, // thin fibrous barrier
  },
  {
    id: "charcoal",
    label: "চারকোল",
    swatch: "#2e2b28",
    colors: ["#211f1d", "#2e2b28", "#3a3733", "#161513"],
    grain: 0.9,
    layerHeight: 0.07, // "quarter to half inch maximum" — keep it thin
  },
  {
    id: "soil",
    label: "মাটি",
    swatch: "#5b4433",
    colors: ["#4a3324", "#5b4433", "#6b4f3a"],
    grain: 0.9,
    layerHeight: 0.16,
  },
  {
    id: "sand",
    label: "বালু",
    swatch: "#c8a970",
    colors: ["#bd9c63", "#c8a970", "#d4b784"],
    grain: 0.45,
    layerHeight: 0.13,
  },
  {
    id: "white-sand",
    label: "সাদা বালু",
    swatch: "#e8e0d0",
    colors: ["#ded5c3", "#e8e0d0", "#f1eadd"],
    grain: 0.35,
    layerHeight: 0.12,
  },
];

// Modelled on what real terrarium builders actually use — and expanded
// avatar-creator style: every kind comes in multiple colour/style variants so
// the library feels endless. Each entry carries a `variant` object that its
// builder understands; icons are rendered from the real geometry.
const D = [];
function add(kind, baseLabel, variants) {
  variants.forEach(([suffix, variant], i) => {
    D.push({
      id: i ? `${kind}-${i}` : kind,
      label: suffix ? `${baseLabel} · ${suffix}` : baseLabel,
      kind,
      variant,
    });
  });
}

add("moss", "মস", [
  ["সবুজ", { colors: ["#5f8330", "#6f9a3a", "#7faa4a", "#557a2c"] }],
  ["হলদে", { colors: ["#8a9a3a", "#9cab4c", "#aebc5e", "#7a8a30"] }],
  ["গাঢ়", { colors: ["#3d5c22", "#4a6b2c", "#576f35", "#324d1c"] }],
  ["নীলচে", { colors: ["#4a7a5c", "#5c8c6b", "#6e9c7a", "#3d6b4e"] }],
]);
add("snakeplant", "স্নেক প্ল্যান্ট", [["", {}]]);
add("leafy", "পাতাগাছ", [
  ["সবুজ", { leaf: "#3f7d4f", dark: "#2f6640" }],
  ["হালকা", { leaf: "#5c9c5a", dark: "#447a44" }],
  ["লালচে", { leaf: "#8a5c3f", dark: "#6b422c" }],
]);
add("fern", "ফার্ন", [
  ["সবুজ", { colors: ["#3f7a34", "#4a8c3c", "#5a9c46", "#356b2c"] }],
  ["হালকা", { colors: ["#5c9c4e", "#6cae5c", "#7cbe6a", "#4c8c40"] }],
  ["গাঢ়", { colors: ["#2c5a24", "#35682c", "#3f7534", "#24491c"] }],
]);
add("pink", "ফিটোনিয়া", [
  ["গোলাপি", { vein: "#f29dbf" }],
  ["লাল", { vein: "#e05545" }],
  ["সাদা", { vein: "#e8f0e4" }],
]);
add("succulent", "সাকুলেন্ট", [
  ["সবুজ", { leaf: "#7fb08a", tip: "#d98fa8" }],
  ["নীল", { leaf: "#8aa8b8", tip: "#c9a0d1" }],
  ["বেগুনি", { leaf: "#9c8ab0", tip: "#d1a0c0" }],
  ["গোলাপি", { leaf: "#c99aa8", tip: "#e0b0c0" }],
]);
add("airplant", "এয়ার প্ল্যান্ট", [
  ["সবুজ", { color: "#9db98d" }],
  ["রুপালি", { color: "#adc0b2" }],
]);
add("mushroom", "মাশরুম", [
  ["লাল", { caps: ["#c9302a", "#d84438", "#b52a24"] }],
  ["কমলা", { caps: ["#d97a3f", "#e08c4e", "#c96a32"] }],
  ["বাদামি", { caps: ["#9c7048", "#8a5f3a", "#ab7f56"] }],
  ["সাদা", { caps: ["#e8e0d0", "#ded4c0", "#f0e8da"] }],
]);
add("driftwood", "কাঠ", [
  ["গাঢ়", { wood: "#6e5236" }],
  ["ফ্যাকাশে", { wood: "#a08a6a" }],
]);
add("crystal", "ক্রিস্টাল", [
  ["বেগুনি", { color: "#9a77c9" }],
  ["নীল", { color: "#6a9ac9" }],
  ["গোলাপি", { color: "#d18ab0" }],
  ["সবুজ", { color: "#6ab98a" }],
  ["স্বচ্ছ", { color: "#d8e4e0" }],
]);
add("stone", "পাথর", [
  ["ধূসর", { grays: ["#8f877b", "#9a9186", "#7d766b", "#a49b8e"] }],
  ["কালো", { grays: ["#4a4642", "#3a3733", "#565048", "#2e2b28"] }],
  ["বেলে", { grays: ["#c0a888", "#b09878", "#cbb494", "#a58c6c"] }],
]);
add("shell", "শামুক", [
  ["বাদামি", { shell: "#e0c39a", band: "#b98a58" }],
  ["ধূসর", { shell: "#c9c4ba", band: "#948e82" }],
]);
add("cactus", "ক্যাকটাস", [
  ["ফুলসহ", { bloom: "#e77fa8" }],
  ["হলুদ ফুল", { bloom: "#e8c04a" }],
  ["ফুলহীন", { bloom: null }],
]);
add("flowers", "ফুল", [
  ["সাদা", { petals: ["#f6f2ea"] }],
  ["গোলাপি", { petals: ["#f2d3e2", "#e8b8d0"] }],
  ["হলুদ", { petals: ["#f2e0a0", "#eed488"] }],
  ["নীল", { petals: ["#b8c8e8", "#a0b4dc"] }],
]);
add("bridge", "সেতু", [
  ["গাঢ়", { wood: "#7d5c3a", dark: "#66492c" }],
  ["হালকা", { wood: "#ab8a5e", dark: "#8f7048" }],
]);
add("house", "ছোট্ট ঘর", [
  ["লাল", { roof: "#c9483a" }],
  ["নীল", { roof: "#4a6b9c" }],
  ["সবুজ", { roof: "#4e7a4a" }],
]);
add("lantern", "লণ্ঠন", [
  ["উষ্ণ", { glow: 0xffb347 }],
  ["শীতল", { glow: 0x9ecfff }],
]);
add("butterfly", "প্রজাপতি", [
  ["নীল", { wing: "#6fa8dc" }],
  ["কমলা", { wing: "#e8a33d" }],
  ["গোলাপি", { wing: "#d17aa0" }],
  ["বেগুনি", { wing: "#8f7ad1" }],
]);
add("ladybug", "লেডিবাগ", [
  ["লাল", { shell: "#c93326" }],
  ["হলুদ", { shell: "#d9a32a" }],
]);
add("deer", "হরিণ", [
  ["বাদামি", { body: "#a8794f", dark: "#6e4c2e" }],
  ["সাদা", { body: "#ddd5c8", dark: "#a89a88" }],
]);

// Category assignment for the flyout panel (like the reference game's
// Favorites / Mushrooms / Rocks / Structures / Pine / Wood / Plant list).
const CAT_BY_KIND = {
  moss: "plants",
  snakeplant: "plants",
  leafy: "plants",
  fern: "plants",
  pink: "plants",
  succulent: "plants",
  airplant: "plants",
  cactus: "plants",
  flowers: "plants",
  mushroom: "mushroom",
  stone: "rocks",
  crystal: "rocks",
  shell: "animals",
  butterfly: "animals",
  ladybug: "animals",
  deer: "animals",
  bridge: "structures",
  house: "structures",
  lantern: "structures",
  driftwood: "wood",
};
D.forEach((d) => (d.cat = CAT_BY_KIND[d.kind] || "plants"));

export const DECORATIONS = D;

export const CATEGORIES = [
  { id: "fav", label: "পছন্দের", icon: "❤️" },
  { id: "jar", label: "জার", icon: "🫙" },
  { id: "base", label: "বেস স্তর", icon: "🟤" },
  { id: "plants", label: "গাছপালা", icon: "🌿" },
  { id: "mushroom", label: "মাশরুম", icon: "🍄" },
  { id: "rocks", label: "পাথর ও ক্রিস্টাল", icon: "💎" },
  { id: "animals", label: "প্রাণী", icon: "🦌" },
  { id: "structures", label: "স্থাপনা", icon: "🏠" },
  { id: "wood", label: "কাঠ", icon: "🪵" },
];

export const BASE_BY_ID = Object.fromEntries(BASE_LAYERS.map((b) => [b.id, b]));
export const DECOR_BY_ID = Object.fromEntries(
  DECORATIONS.map((d) => [d.id, d]),
);
