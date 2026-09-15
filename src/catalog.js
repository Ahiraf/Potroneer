// The catalog defines every material the user can place. Keeping it as plain
// data (not code) makes the tray, the 3D builders and the save-model all read
// from one source of truth. Colors lean warm and slightly desaturated so the
// whole thing feels hand-mixed rather than printed.

// Ordered the way a real closed terrarium is built, bottom to top:
// drainage (LECA/নুড়ি) → sphagnum barrier → activated charcoal → soil,
// then sands as decorative strata.
// How many millimetres one world unit is.
//
// The app has always known its layers' depths — `layerHeight` below — it just
// never said them out loud. Fixing a scale turns those numbers into something
// a builder can reason about, and lets the app hold an opinion: a drainage bed
// wants depth, a charcoal filter wants almost none.
//
// 100 is chosen so the charcoal default lands on 7mm, which is the middle of
// the quarter-to-half-inch rule real builders quote. Everything else follows
// from it, and a mason jar comes out about 23cm tall — a believable vessel.
//
// The scale is global rather than per-jar on purpose. A 7mm charcoal filter is
// 7mm in a big jar and in a small one; that is the whole point of saying it in
// millimetres. What changes with the jar is how much fits, which
// `remainingHeight` already handles.
export const MM_PER_UNIT = 100;

export const mmToUnits = (mm) => mm / MM_PER_UNIT;
export const unitsToMm = (u) => u * MM_PER_UNIT;

export const BASE_LAYERS = [
  {
    id: "leca",
    label: "লেকা বল",
    swatch: "#a97c54",
    colors: ["#9c6f48", "#a97c54", "#b78a60", "#8d6540"],
    grain: 1.0,
    layerHeight: 0.2,
    // Drainage wants depth — this is the reservoir the roots stay out of.
    minMm: 10,
    maxMm: 45,
    chunky: true, // clay balls read as round chunks
  },
  {
    id: "pebbles",
    label: "নুড়ি",
    swatch: "#8a8378",
    colors: ["#736c62", "#8a8378", "#9c948a", "#a89f92"],
    grain: 1.0,
    layerHeight: 0.18,
    // Same job as leca, heavier.
    minMm: 10,
    maxMm: 40,
    chunky: true,
  },
  {
    id: "sphagnum",
    label: "স্ফ্যাগনাম",
    swatch: "#b8a86a",
    colors: ["#a89a58", "#b8a86a", "#c9bb80", "#95884e"],
    grain: 0.8,
    layerHeight: 0.08, // thin fibrous barrier
    // A barrier, not a layer: just enough to stop soil washing down.
    minMm: 4,
    maxMm: 14,
  },
  {
    id: "charcoal",
    label: "চারকোল",
    swatch: "#2e2b28",
    colors: ["#211f1d", "#2e2b28", "#3a3733", "#161513"],
    grain: 0.9,
    layerHeight: 0.07, // "quarter to half inch maximum" — keep it thin
    // The one real hard rule in the stack: a filter, never a bed.
    minMm: 3,
    maxMm: 12,
  },
  {
    id: "soil",
    label: "মাটি",
    swatch: "#5b4433",
    colors: ["#4a3324", "#5b4433", "#6b4f3a"],
    grain: 0.9,
    layerHeight: 0.16,
    // Where things actually grow, so it earns the most depth.
    minMm: 10,
    maxMm: 60,
  },
  {
    id: "sand",
    label: "বালু",
    swatch: "#c8a970",
    colors: ["#bd9c63", "#c8a970", "#d4b784"],
    grain: 0.45,
    layerHeight: 0.13,
    // Decorative as much as functional.
    minMm: 5,
    maxMm: 30,
  },
  {
    id: "white-sand",
    label: "সাদা বালু",
    swatch: "#e8e0d0",
    colors: ["#ded5c3", "#e8e0d0", "#f1eadd"],
    grain: 0.35,
    layerHeight: 0.12,
    // Decorative as much as functional.
    minMm: 5,
    maxMm: 30,
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
add("bonsai", "বনসাই", [
  ["সবুজ", { wood: "#6e5236", colors: ["#5f8f3a", "#6f9f44", "#7faf50", "#548030"] }],
  ["গাঢ়", { wood: "#5a4230", colors: ["#3f6b2c", "#4a7a34", "#57883c", "#345c24"] }],
  ["শরৎ", { wood: "#6e5236", colors: ["#b0862f", "#c0942f", "#9a7028", "#caa23a"] }],
]);
add("mossball", "মস বল", [
  ["সবুজ", { colors: ["#5f9a30", "#6faa3a", "#7fba4a", "#57922c", "#4e8a28"] }],
  ["হলদে", { colors: ["#8a9a3a", "#9cab4c", "#aebc5e", "#7a8a30"] }],
  ["গাঢ়", { colors: ["#3d5c22", "#4a6b2c", "#576f35", "#324d1c"] }],
]);
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
add("slate", "স্লেট", [
  ["ধূসর", { grays: ["#6f6b64", "#7d7870", "#5a564f", "#87827a"] }],
  ["কালো", { grays: ["#3d3a36", "#4a463f", "#302d2a", "#565049"] }],
  ["মরচে", { grays: ["#7a6650", "#8a7358", "#6a5642", "#94815f"] }],
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
add("pilea", "পাইলিয়া", [
  ["সবুজ", { leaf: "#57a04a" }],
  ["গাঢ়", { leaf: "#3f7a38" }],
]);
add("pothos", "পথোস", [
  ["সবুজ", { leaf: "#4a8c3e" }],
  ["গোল্ডেন", { leaf: "#7fa83e" }],
]);
add("calathea", "ক্যালাথিয়া", [
  ["গোলাপি", { edge: "#e2a6c0" }],
  ["রুপালি", { edge: "#bcd6b0" }],
]);
add("venusflytrap", "ভেনাস ফ্লাইট্র্যাপ", [
  ["লাল", { inner: "#b0402f" }],
  ["সবুজ", { inner: "#8a6a3a" }],
]);
add("frog", "ব্যাঙ", [
  ["সবুজ", { skin: "#5f9c46" }],
  ["হলুদ", { skin: "#c9a83a" }],
  ["নীল", { skin: "#4a8ca8" }],
]);
add("turtle", "কচ্ছপ", [
  ["সবুজ", { shell: "#6f8a3c", skin: "#8a9a5c" }],
  ["বাদামি", { shell: "#8a6a3c", skin: "#a8895c" }],
]);
add("bird", "পাখি", [
  ["লাল", { body: "#c94f3a" }],
  ["নীল", { body: "#4a7ec9" }],
  ["হলুদ", { body: "#e0b23a" }],
]);
add("gnome", "বামন", [
  ["লাল", { hat: "#c1402f", coat: "#4a6b9c" }],
  ["নীল", { hat: "#3f6b9c", coat: "#8a5236" }],
  ["সবুজ", { hat: "#4e7a3a", coat: "#9c5c48" }],
]);
add("torii", "তোরি গেট", [
  ["লাল", { wood: false }],
  ["কাঠ", { wood: true }],
]);
add("pagoda", "প্যাগোডা", [
  ["ধূসর", { stone: "#9a938a" }],
  ["বেলে", { stone: "#c0aa86" }],
]);
add("fence", "বেড়া", [
  ["সাদা", { wood: false }],
  ["কাঠ", { wood: true }],
  // the printed white picket set: round-topped, packed tight, and clipping
  // together into a corner or a whole pen
  ["পিকেট", { round: true }],
  ["পিকেট কোণা", { round: true, corner: true }],
  ["পিকেট ঘের", { round: true, pen: true }],
]);
add("well", "কুয়া", [
  ["লাল", { roof: "#9c4636" }],
  ["নীল", { roof: "#46689c" }],
]);
add("geode", "জিওড", [
  ["বেগুনি", { color: "#9a77c9" }],
  ["নীল", { color: "#5c93c9" }],
  ["গোলাপি", { color: "#d18ab0" }],
]);
add("pinecone", "পাইনকোন", [
  ["বাদামি", { wood: "#7a512e" }],
  ["গাঢ়", { wood: "#5c3d22" }],
]);
add("log", "গুঁড়ি", [
  ["গাঢ়", { wood: "#6e5236" }],
  ["ফ্যাকাশে", { wood: "#a08a6a" }],
]);
add("pond", "জলাশয়", [
  ["নীল", { water: "#3f7d8c" }],
  ["সবুজ", { water: "#4a8c7a" }],
]);
add("saguaro", "সাগুয়ারো", [
  ["সবুজ", { body: "#4e7d43" }],
  ["ফুলসহ", { body: "#4e7d43", bloom: "#f2ead8" }],
  ["নীলচে", { body: "#5c8a6e" }],
]);
add("pricklypear", "প্রিকলি পিয়ার", [
  ["হলুদ ফুল", { bloom: "#e8b23a" }],
  ["গোলাপি ফুল", { bloom: "#e277a2" }],
  ["ফুলহীন", { bloom: null }],
]);
add("pincushion", "পিনকুশন", [
  ["গোলাপি ফুল", { bloom: "#e277a2" }],
  ["হলুদ ফুল", { bloom: "#e8c04a" }],
  ["ফুলহীন", { bloom: null }],
]);
add("cliplight", "ক্লিপ লাইট", [
  ["উষ্ণ", { glow: 0xffcf8a }],
  ["দিবা", { glow: 0xf4f6ff }],
  ["গ্রো", { glow: 0xd96bd9 }],
]);
add("striplight", "স্ট্রিপ লাইট", [
  ["দিবা", { glow: 0xf4f6ff }],
  ["উষ্ণ", { glow: 0xffcf8a }],
  ["গ্রো", { glow: 0xd96bd9 }],
]);
add("framelight", "কাঠের ল্যাম্প", [
  ["উষ্ণ", { wood: "#a9793f", glow: 0xffcf8a }],
  ["দিবা", { wood: "#a9793f", glow: 0xf4f6ff }],
]);
add("ringlight", "রিং লাইট", [
  ["সাদা", { glow: 0xffffff }],
  ["উষ্ণ", { glow: 0xffcf8a }],
]);

// ---------------------------------------------------------------------------
// Species pack
// ---------------------------------------------------------------------------
// Real species from the reference photos, named. Where a genus grows the same
// way for every species (all the aquarium stem plants, all the velvet aroids)
// the kind is the genus and the variants are the species — so searching
// "রোটালা" finds all five Rotalas, and the builder is written once.

// Named terrestrial mosses. Habit separates these far more than colour does,
// so each carries the `form` its builder switches on.
add("cushionmoss", "কুশন মস", [
  ["", { form: "cushion", colors: ["#7faa4a", "#8fba58", "#9ac264", "#6f9a3a"] }],
]);
add("starmoss", "স্টার মস", [
  ["", { form: "star", colors: ["#7fa83c", "#8fb84c", "#6f983a"] }],
]);
// Smoothcap grows as separate plants, each a wide-open star on a short stalk,
// so it sits looser and brighter than the tight star mosses beside it.
add("smoothcapmoss", "ক্যাথরিন মস", [
  ["", {
    form: "star",
    colors: ["#6f9e34", "#7fb043", "#5f8e2c", "#8cbc55"],
    rosettes: 46, leaves: 9, leafLen: 0.036, leafWidth: 0.005,
    rise: 0.42, stalk: 0, spread: 0.2,
  }],
]);
add("fissidens", "ফিসিডেন্স মস", [
  ["", { form: "frond", colors: ["#4a7a2e", "#5a8c3a", "#3f6b26"] }],
]);
add("fernmoss", "ফার্ন মস", [
  ["", { form: "frond", colors: ["#6f9a3a", "#7faa4a", "#5f8a30"] }],
]);
// Dicranum: spiky needle tufts with pale tips, every one swept the same way.
add("broomforkmoss", "ব্রুম ফর্ক মস", [
  ["", {
    form: "fork",
    colors: ["#5f9e2e", "#72b23a", "#4f8e26"],
    needle: true, tip: "#c2d98a",
    shoots: 80, shootLen: 0.085, shootVary: 0.04, leafLen: 0.024, steps: 12,
  }],
]);
add("javamoss", "জাভা মস", [
  ["", { form: "frond", colors: ["#3f6b2c", "#4a7a34", "#356024"], spread: 0.2 }],
]);
// Trachycystis packs short fine-leaved shoots into a dense low mat — no gaps
// and no comb to it, just crowded upright growth.
add("trachycystis", "ট্র্যাকিসিস্টিস মস", [
  ["", {
    form: "frond",
    colors: ["#4a7a28", "#5f9233", "#6ea63c", "#3f6b22"],
    shoots: 120, shootLen: 0.05, shootVary: 0.022,
    leafLen: 0.014, steps: 10, spread: 0.16,
  }],
]);

// Aquarium stem plants. `form` is what the eye actually reads at this size:
// paired oval leaves, a feathery whorl, or fine needles.
add("rotala", "রোটালা", [
  ["বাংলাদেশ", { form: "opposite", colors: ["#5f9c4a", "#6fac56"], stem: "#6b8a3e" }],
  ["ভিয়েতনাম", { form: "whorl", colors: ["#8a9c3a", "#9aac4a"], stem: "#7a8a3a" }],
  ["বাটারফ্লাই", { form: "opposite", colors: ["#8fb84a", "#9fc85a"], stem: "#a8863a", leafScale: 1.15 }],
  ["অরেঞ্জ জুস", { form: "opposite", colors: ["#d98a4a", "#e09c5c", "#c97a3a"], stem: "#b06a3a" }],
  ["রোটান্ডিফোলিয়া", { form: "opposite", colors: ["#c8cf6a", "#9fc85a"], stem: "#8a9c3a" }],
]);
add("ludwigia", "লুডউইজিয়া", [
  ["পেরুয়েনসিস", { form: "opposite", colors: ["#b0364a", "#c04658"], stem: "#8a2f3a", leafScale: 1.1 }],
  ["পালুস্ট্রিস", { form: "opposite", colors: ["#8a3f3a", "#9c4f46"], stem: "#6e332e" }],
  ["ডায়মন্ড", { form: "opposite", colors: ["#7a3a4e", "#8c4a5e", "#5f2c3c"], stem: "#5f2c3c" }],
  ["মেটা", { form: "whorl", colors: ["#d0304a", "#e0405a"], stem: "#a02a3a" }],
  ["সুপার রেড", { form: "opposite", colors: ["#c2365c", "#d2466c"], stem: "#96284a" }],
]);
add("bacopa", "বাকোপা", [
  ["মনিয়েরি", { form: "opposite", colors: ["#5faa4a", "#6fba5a"], stem: "#6f9a42", leafScale: 0.75 }],
  ["ক্যারোলিনিয়ানা", { form: "opposite", colors: ["#6f9a46", "#8a9a4a"], stem: "#7a8a3e", leafScale: 1.05 }],
  ["অ্যামপ্লেক্সিকলিস", { form: "opposite", colors: ["#7faa50", "#8fba60"], stem: "#6f9a42", leafScale: 1.25 }],
]);
add("hygrophila", "হাইগ্রোফিলা", [
  ["করিম্বোসা", { form: "opposite", colors: ["#4a8c3e", "#5a9c4a"], stem: "#5d7f3a", leafScale: 1.3 }],
  ["অ্যাঙ্গুস্টিফোলিয়া", { form: "opposite", colors: ["#3f8c3a", "#4f9c46"], stem: "#4e7a34", leafScale: 1.5, height: 0.5 }],
  ["গ্রিন অলিভ", { form: "opposite", colors: ["#7a8a46", "#8a7a4a", "#6b7a3a"], stem: "#7a6a3a", leafScale: 1.15 }],
]);
add("persicaria", "পার্সিকেরিয়া", [
  ["সাও পাওলো", { form: "opposite", colors: ["#8a4a9c", "#9c5aac", "#7a3a8c"], stem: "#6e3a7a", leafScale: 1.2, height: 0.46 }],
]);
add("lindernia", "লিন্ডারনিয়া", [
  ["ভ্যারিগেটেড", { form: "opposite", colors: ["#c8d060", "#a8c04a"], stem: "#8a9c3a", leafScale: 0.85 }],
]);
add("alternanthera", "অল্টারনানথেরা", [
  ["রেইনেকি", { form: "opposite", colors: ["#b04a56", "#8a5a4a", "#c05a66"], stem: "#7a4a42", leafScale: 1.1 }],
]);
add("cabomba", "ক্যাবোম্বা", [
  ["", { form: "whorl", colors: ["#6faa3a", "#7fba4a", "#5f9a30"], stem: "#6b8a3a" }],
]);
add("myriophyllum", "মিরিওফাইলাম", [
  ["অ্যাকোয়াটিকাম", { form: "whorl", colors: ["#7fba5a", "#8fca6a", "#6faa4a"], stem: "#7a9a4a" }],
]);
add("ambulia", "অ্যাম্বুলিয়া", [
  ["", { form: "whorl", colors: ["#9fc84a", "#afd85a", "#8fb83a"], stem: "#8a9c3a" }],
]);
add("anacharis", "অ্যানাকারিস", [
  ["ডেনসা", { form: "needle", colors: ["#3f7a34", "#4f8a40"], stem: "#4a6b30", height: 0.5 }],
]);
add("pogostemon", "পোগোস্টেমন", [
  ["স্টেলাটাস", { form: "needle", colors: ["#8faa5a", "#9fba6a"], stem: "#7a9a4a" }],
  ["অ্যারোমেটিক মিনি", { form: "needle", colors: ["#a8c85a", "#b8d86a"], stem: "#8a9c3a", height: 0.3 }],
]);

// Aquatics that grow from a crown instead of a stem.
add("echinodorus", "সোর্ড লিলি", [
  ["", { colors: ["#4a8c3e", "#5aa04a"], len: 0.34, leaves: 9 }],
]);
add("cryptocoryne", "ক্রিপ্টোকোরিন", [
  ["সবুজ", { colors: ["#3f7a3a", "#4f8a46"], len: 0.28 }],
  ["বাদামি", { colors: ["#7a5a3a", "#8a6a46", "#6b4a30"], len: 0.28 }],
]);
add("sagittaria", "ডোয়ার্ফ স্যাজিটেরিয়া", [
  ["", { colors: ["#5faa4a", "#6fba5a"], strap: true, len: 0.26, leaves: 14, lean: 0.2 }],
]);
add("waterwisteria", "ওয়াটার উইস্টেরিয়া", [
  ["মার্বেল কুইন", { colors: ["#c8d060", "#9fc84a", "#a8c85a"], len: 0.24, arch: 0.2 }],
]);

// Creeping and floating round leaves.
add("hydrocotyle", "হাইড্রোকোটাইল", [
  ["ট্রাইপার্টিটা", { leaf: "#6fba4a", stem: "#7a9a46", r: 0.038, pads: 20 }],
  // Pennywort: the same runner habit with much bigger coins, and a marsh plant
  // rather than a submerged one — it wants a wet bank.
  ["আমব্রেলাটা", { leaf: "#5fb03a", stem: "#6f9a3e", r: 0.062, pads: 14 }],
]);
add("waterpoppy", "ওয়াটার পপি", [
  ["", { leaf: "#5faa48", stem: "#6f8f46", r: 0.06, pads: 10, bloom: "#f0e08a" }],
]);

// The variegated aroids from the nursery bench.
add("aglaonema", "অ্যাগ্লোনিমা", [
  ["গোলাপি", { leaf: "#3f7a3c", mark: "#d8e0a0", midrib: "#e0798f" }],
  ["লাল", { leaf: "#4a6b34", mark: "#c96a6a", midrib: "#d0404a", speckle: 1.3 }],
  ["সাদা ছোপ", { leaf: "#3f7a3c", mark: "#eef0dc", midrib: "#cfe0b0", speckle: 1.6 }],
  ["রুপালি", { leaf: "#4a7a4a", mark: "#c0d0c4", midrib: "#dce6dc", speckle: 0.8 }],
  ["সবুজ", { leaf: "#376b34", mark: "#7faa4a", midrib: "#a8c86a", speckle: 0.5 }],
]);
add("anthurium", "অ্যান্থুরিয়াম", [
  ["ক্লারিনার্ভিয়াম", { shape: "heart", leaf: "#2f5c33", vein: "#dce8cc", veinWidth: 3.2 }],
  ["ক্রিস্টালিনাম", { shape: "heart", leaf: "#25482c", vein: "#c8d8c0", veinWidth: 2.6, veinPairs: 6 }],
]);
add("alocasia", "অ্যালোকেসিয়া", [
  ["পলি", { shape: "arrow", leaf: "#28502c", vein: "#d8e4cc", veinWidth: 3.4, edge: "#d8e4cc" }],
  ["সিলভার ড্রাগন", { shape: "arrow", leaf: "#8faa96", vein: "#3f5c3f", veinWidth: 3.6 }],
  ["ব্ল্যাক ভেলভেট", { shape: "heart", leaf: "#1e2a22", vein: "#cfd8c4", veinWidth: 3.0 }],
]);
add("philodendron", "ফিলোডেনড্রন", [
  ["জ্যানাডু", { shape: "lobed", leaf: "#3a7038", vein: "#8fb070", veinWidth: 2.0, leaves: 8 }],
  ["গোলাপি", { shape: "heart", leaf: "#5f6b3a", vein: "#d09a9c", veinWidth: 2.2 }],
  ["সবুজ", { shape: "heart", leaf: "#356b38", vein: "#8fb878", veinWidth: 2.0 }],
]);
add("haworthia", "হাওরথিয়া", [
  ["সবুজ", { leaf: "#4a6b3c", band: "#cfd8b4" }],
  ["ভ্যারিগেটেড", { leaf: "#4a6b3c", band: "#cfd8b4", variegated: "#dcc850" }],
]);
add("ivy", "আইভি", [
  ["ভ্যারিগেটেড", { leaf: "#3f7a3e", edge: "#e6e6c8" }],
  ["সবুজ", { leaf: "#35682f", edge: "#7faa5a" }],
]);

// The plants closed-jar hobbyists reach for first and this catalog was
// missing: a spikemoss, the fleshy Peperomias, a baby-tears carpet and a
// creeping fig to climb the glass.
add("selaginella", "স্পাইক মস", [
  ["সবুজ", { form: "frond", colors: ["#4a8c3a", "#5a9c46", "#3f7a30"], shoots: 34, shootLen: 0.07, leafLen: 0.018, steps: 8 }],
  ["নীলচে", { form: "frond", colors: ["#4a7a6b", "#5a8c7a", "#3f6b5c"], shoots: 34, shootLen: 0.07, leafLen: 0.018, steps: 8 }],
]);
add("peperomia", "পেপেরোমিয়া", [
  ["সবুজ", { leaf: "#3f7a44" }],
  ["ওয়াটারমেলন", { leaf: "#2f6b46", stripe: "#cfe0c0", leafScale: 1.15 }],
  ["লালচে", { leaf: "#6b4a52", stem: "#a8646a" }],
]);
add("babytears", "বেবি টিয়ার্স", [
  ["সবুজ", {}],
  ["সোনালি", { leaf: "#a8c455", stem: "#b0cc6a" }],
]);
add("creepingfig", "ক্রিপিং ফিগ", [
  ["সবুজ", { leaf: "#3d6b33", stem: "#7a6a45", leafScale: 0.55, vines: 5, reach: 0.24 }],
  ["ভ্যারিগেটেড", { leaf: "#5f8a4a", stem: "#8a7a55", leafScale: 0.55, vines: 5, reach: 0.24 }],
]);

// ---------------------------------------------------------------------------
// The flowering garden pack
// ---------------------------------------------------------------------------
// The nursery-bench flowers from the reference photos. Worth saying plainly:
// almost none of these are closed-terrarium plants. Rain lilies, crowns of
// thorns, amaryllis, ruellia, lantana, butterfly pea and the creeping daisy are
// full-sun garden plants that rot in a sealed humid jar — they are marked
// `open` below so the tray chip says so. The three that genuinely do belong
// under glass (purple shamrock, coleus, and pennywort on a wet bank) are marked
// accordingly.

// Zephyranthes. Fourteen cultivars of one plant, which is exactly how they are
// sold — the clump of grassy leaves is identical and the tepals do all the
// telling apart.
add("rainlily", "রেইন লিলি", [
  ["সাদা", { tepal: "#f4f2e8", throat: "#d8e08a", stamen: "#e8c04a", rise: 0.45 }],
  ["আইভরি", { tepal: "#f6f4ec", throat: "#efe6c8", stamen: "#e8a83a", len: 0.065, rise: 0.35 }],
  ["হলুদ", { tepal: "#f0c832", throat: "#e0a828", stamen: "#d8b83a" }],
  ["সানশাইন", { tepal: "#f2d466", throat: "#e8c04a", stamen: "#d8c05a", rise: 0.6 }],
  ["কিং র‍্যানসম", { tepal: "#f4dc2a", edge: "#d98a3a", throat: "#4a7a34", stamen: "#d9a83a" }],
  ["লামদুয়ান রেড", { tepal: "#c81e4a", throat: "#e8d83a", stamen: "#e8c04a", style: "#5f9a3a" }],
  ["রেড জয়", { tepal: "#d81e28", throat: "#b03a6a", stamen: "#e8c83a", rise: 0.4 }],
  ["রাস্টিক রে", { tepal: "#e06a2a", stripe: "#f2c83a", throat: "#d8b83a", stamen: "#e8c04a" }],
  ["পিংক ফেয়ারি", { tepal: "#f0d8e0", throat: "#e8e0a0", stamen: "#e8a83a", rise: 0.4 }],
  ["সুইট হার্ট", { tepal: "#e8a8c8", stripe: "#f6ecf0", throat: "#eee8c0", stamen: "#e8a83a" }],
  ["হার্ট থ্রব", { tepal: "#e06a9c", stripe: "#f6e8f0", throat: "#f2ead0", stamen: "#e8c04a" }],
  ["জোডিয়াক সারপ্রাইজ", { tepal: "#e88ab0", stripe: "#f8eef2", throat: "#e8e8a8", stamen: "#e8c04a" }],
  ["ক্যাপ্রিকর্ন", { tepal: "#e89ab8", stripe: "#f6eedc", throat: "#dce88a", stamen: "#e8c83a", rise: 0.4 }],
  ["লাবুফেরোসা", { tepal: "#e07aa8", stripe: "#fbf4f6", throat: "#e8e08a", stamen: "#e8c04a" }],
  ["স্মল হাইব্রিড", { tepal: "#e8829c", stripe: "#f2dc6a", throat: "#e8d05a", stamen: "#e8c04a", len: 0.062 }],
]);

// Euphorbia milii. The paired bracts are the colour; the thorns are optional,
// because the thornless cultivar is the one on the bench.
add("crownofthorns", "কাঁটামুকুট", [
  ["লাল", { bract: "#d9384f", eye: "#e8b23a" }],
  ["কাঁটাবিহীন লাল", { bract: "#e0384a", eye: "#e8c04a", thorns: false, leaf: "#7fa08a" }],
  ["গোলাপি", { bract: "#e85088", eye: "#e05a2a", leaf: "#4a8a44" }],
  ["হরিদ্রা মুকুট", { bract: "#eef0b8", eye: "#d94a28", leaf: "#3f7a3c" }],
  ["ফাল্গুনী", { bract: "#f0e4c0", eye: "#e8a83a", leaf: "#4a7a40" }],
  ["সাঁঝবাতি মুকুট", { bract: "#f0b09a", eye: "#c98a3a", leaf: "#3f7a3c" }],
]);

add("ruellia", "রুয়েলিয়া", [
  ["বেগুনি", { petal: "#8f6ad1", throat: "#5a2f9c" }],
  ["সাদা", { petal: "#f4f2ea", throat: "#d8dcc0", leaf: "#4a8a3e" }],
]);
add("amaryllis", "অ্যামারিলিস", [
  ["পিচ", { tepal: "#f0a882", stripe: "#f6d0b8", throat: "#a8c06a", stamen: "#e0a89a" }],
]);
add("butterflypea", "অপরাজিতা", [
  ["নীল", { petal: "#4a35b0", flash: "#eef0c0" }],
]);
add("lantana", "ল্যান্টানা", [
  ["বেগুনি", { bloom: "#9a3ec0", bloomEdge: "#c46ad8" }],
]);
add("wedelia", "ওয়েডেলিয়া", [
  ["হলুদ", { petals: ["#f2c81e", "#e8bc18"], center: "#c98a28", foliage: "#3f6b33", petalR: 0.02 }],
]);

// Grown for the leaves, not the bloom — these three sit with the plants.
add("coleus", "কলিয়াস", [
  ["মেজেন্টা", { leaf: "#a51e63", margin: "#d8d84a", vein: "#d88ab0" }],
  ["লালচে", { leaf: "#8a2a30", margin: "#c8d05a", vein: "#d09a8a", stem: "#8a5a4a" }],
]);
add("drimiopsis", "ড্রিমিওপসিস", [
  ["ছোপ পাতা", { leaf: "#b8c9a0", spot: "#3f6b34" }],
]);
add("kalanchoe", "ক্যালানচো", [
  ["ভ্যারিগেটেড", { leaf: "#9ab08a", edge: "#d98a8a", bloom: "#e0452a" }],
]);
add("oxalis", "অক্সালিস", [
  ["বেগুনি", { leaf: "#6e3d66", petal: "#f0d8e8" }],
]);

// The clean-up crew.
add("nerite", "নেরাইট শামুক", [
  ["টাইগার", { shell: "#6b5433", band: "#22190f" }],
  ["জেব্রা", { shell: "#c8a45c", band: "#2e2418" }],
]);
add("shrimp", "চেরি চিংড়ি", [
  ["লাল", { body: "#c2402f" }],
  ["হলুদ", { body: "#d9b03a", legs: "#e8cf7a" }],
]);
// The bioactive crew. These two are the only decorations with a job: the care
// simulation counts them and they eat the mould back (see CLEANUP_KINDS).
add("isopod", "আইসোপড", [
  ["ধূসর", { shell: "#8a8378" }],
  ["ডেইরি কাউ", { shell: "#e0dbd0", patch: "#3a3733" }],
  ["কমলা", { shell: "#d08a3a", legs: "#e8c48a" }],
]);
add("springtails", "স্প্রিংটেইল", [
  ["সাদা", {}],
  ["গোলাপি", { body: "#e6cfd0" }],
]);

// ---------------------------------------------------------------------------
// The printed hardscape set
// ---------------------------------------------------------------------------
// The 3D-printed miniatures people buy alongside the plants: fairy cottages,
// temple halls, ruins and reptile hides. Where one shape covers several of the
// printed pieces (a half-timbered cottage and a three-storey townhouse are the
// same building with another floor) the kind is the shape and the variants are
// the pieces, so the builder is written once.

add("mushroombridge", "মাশরুম সেতু", [
  ["কাঠ", { wood: "#b5854e", dark: "#96693a" }],
  ["ফ্যাকাশে", { wood: "#cdbba0", dark: "#ae9c82" }],
]);
add("ropebridge", "দড়ির সেতু", [
  ["সোজা", { arch: false }],
  ["খিলান", { arch: true }],
  ["কাঠের", { arch: false, wood: "#a98a5e", dark: "#8a6d45" }],
]);
add("crookedcottage", "হেলানো কুটির", [
  ["গাঢ়", {}],
  ["ফ্যাকাশে", { wall: "#c9c3b8", roof: "#b3ada2", wood: "#a49d92", base: "#bdb7ac" }],
]);
add("tudorhouse", "টিউডর ঘর", [
  ["কুটির", { storeys: 1, dormers: true, barrels: true, chimneys: [-0.06, 0.068] }],
  ["দোতলা", { storeys: 2, dormers: true, chimneys: [0.068] }],
  ["সরাইখানা", { storeys: 3, chimneys: [-0.05, 0.05] }],
  ["বাদামি", { storeys: 2, wall: "#c9b48d", beam: "#7a5c3a", roof: "#8a6a46", dormers: true }],
]);
add("shellhouse", "শঙ্খ ঘর", [["", {}]]);
add("logcabin", "কাঠের কেবিন", [
  ["ফ্যাকাশে", {}],
  ["বাদামি", { wood: "#a8845a", dark: "#8a6a45", thatch: "#c2a874" }],
]);
add("mushroomhouse", "মাশরুম কুটির", [
  ["ধূসর", {}],
  ["লাল ছাদ", { cap: "#b45a48", wall: "#e0d6c4" }],
]);
add("domecottage", "গম্বুজ কুটির", [["", {}]]);
add("witchhat", "ডাইনির টুপি ঘর", [
  ["সাদা", {}],
  ["গাঢ়", { wall: "#6e6a62", hat: "#5c5850", wood: "#5a564e", base: "#66625a" }],
]);
add("spiraltower", "প্যাঁচানো টাওয়ার", [["", {}]]);
add("chapel", "গির্জা", [
  ["সাদা", {}],
  ["পাথুরে", { wall: "#b7b0a2", roof: "#8f8778", wood: "#8a8274" }],
]);
add("stumphouse", "গুঁড়ি ঘর", [
  ["বাদামি", {}],
  ["ধূসর", { wood: "#9a9186", dark: "#7f776c" }],
]);
add("ziggurat", "ধাপ মন্দির", [
  ["বেলেপাথর", {}],
  ["ধূসর", { stone: "#a8a49a", dark: "#8d897f" }],
]);
add("rockcave", "পাথুরে গুহা", [
  ["শ্যাওলা", {}],
  ["খিলান", { arch: true, stone: "#c9a86e", dark: "#a8874f" }],
  ["ধূসর", { stone: "#8f8b84", dark: "#6f6c66" }],
]);
add("slateledge", "স্লেট ধাপ", [
  ["কালো", {}],
  ["ধূসর", { stone: "#6f6f74", dark: "#57575c" }],
]);
add("canyon", "ক্যানিয়ন", [
  ["বেলেপাথর", {}],
  ["লালচে", { stone: "#b3714a", dark: "#96593a" }],
]);
add("stonestairs", "পাথুরে সিঁড়ি", [
  ["ধূসর", {}],
  ["বেলেপাথর", { stone: "#c9b48d", dark: "#ab9670" }],
]);
add("brokenwall", "ভাঙা দেয়াল", [["", {}]]);
add("ruinedtower", "ভাঙা টাওয়ার", [["", {}]]);
add("templehall", "চীনা মন্দির", [
  ["দোতলা", { tiers: 2 }],
  ["একতলা", { tiers: 1 }],
  ["প্রাচীরঘেরা", { tiers: 2, walled: true }],
  ["কাঠের", { tiers: 1, body: "#8a6a4a", tile: "#3a3733" }],
  // the two-tier hall inside a railed courtyard, slate-blue tiles over a
  // terracotta frame
  ["জাপানি", { tiers: 2, walled: true, body: "#c08a68", tile: "#9fb2bf", stone: "#c08a68" }],
]);
add("pavilion", "মণ্ডপ", [
  ["ছোট", { size: 0.12 }],
  ["দোতলা ছাউনি", { size: 0.16, doubleEave: true }],
  ["পাথরের ভিত", { size: 0.15, podium: true }],
  ["সাদা", { size: 0.15, podium: true, body: "#c9c2b4", tile: "#4a4742" }],
]);
add("anchor", "নোঙর", [
  ["বালি", {}],
  ["ধূসর", { metal: "#9a958c", rope: "#b0a893" }],
]);

// The printed garden set: the crossings, seating, paving and stilt huts that
// go around the buildings, plus the battery lanterns sold with them.
add("taikobashi", "লাল খিলান সেতু", [
  ["সিঁদুরে", {}],
  ["ছোট", { span: 0.34, rise: 0.1 }],
  ["কাঠের", { lacquer: "#a5703f", deck: "#d8cbb0", finial: "#4a4038" }],
]);
add("brickwell", "ইটের কুয়া", [
  ["ধূসর ইট", {}],
  ["লাল ইট", { brick: "#b0674a", mortar: "#96543c" }],
]);
add("parkbench", "পার্ক বেঞ্চ", [
  ["কাঠ ও লোহা", {}],
  ["সবুজ লোহা", { iron: "#3c5a44" }],
  ["সাদা", { wood: "#e2dac8", iron: "#8f8a80" }],
]);
add("stilthouse", "মাচা ঘর", [
  ["পাহারা ঘর", {}],
  ["কুটির", { cottage: true, wood: "#d0a63f", dark: "#b58e30" }],
  ["ছোট মাচা", { platform: true }],
]);
add("brickpile", "ইটের স্তূপ", [
  ["লাল", {}],
  ["ধূসর", { brick: "#a29c94", hole: "#6b665f" }],
]);
add("stonepath", "পাথরের পথ", [
  ["বাঁকা", {}],
  ["ধূসর", { stone: "#a8a49c", dark: "#8d8981" }],
  ["সোজা", { straight: true }],
]);
add("oillamp", "হারিকেন", [
  ["সাদা", {}],
  ["লাল", { shell: "#e04a2c" }],
  ["ক্যাম্প", { caged: true, shell: "#3a3733" }],
]);
add("moroccanlantern", "মরক্কোন লণ্ঠন", [
  ["সাদা", {}],
  ["লাল", { shell: "#e04a2c" }],
]);

// The second wave of printed miniatures: the terracotta branch bench, the
// covered wagon, the winch well, the pagoda watchtower, the porched cottage,
// the fairy tower — and the chanterelle troop that goes with the moss. Each is
// offered in the colours the sets actually ship in (raw terracotta, bone-white
// resin, sandstone).
add("branchbench", "ডাল বেঞ্চ", [
  ["টেরাকোটা", {}],
  ["সাদা", { wood: "#e4ded2", dark: "#c9c2b4" }],
]);
add("coveredwagon", "ঢাকা গাড়ি", [
  ["টেরাকোটা", {}],
  ["ক্যানভাস", { canvas: "#e0d8c4", wood: "#a8794f", dark: "#8a6039" }],
]);
add("wheelwell", "চাকা কুয়া", [
  ["টেরাকোটা", {}],
  ["কাঠের", { wood: "#a8845a", dark: "#8a6a45" }],
]);
add("pagodatower", "প্যাগোডা টাওয়ার", [
  ["বেলেপাথর", {}],
  ["ধূসর", { stone: "#b0aca2", dark: "#949086" }],
]);
add("porchcottage", "বারান্দা কুটির", [
  ["সাদা", {}],
  ["বাদামি", { wall: "#d8c8a8", roof: "#a8815a", trim: "#c2ab86", shade: "#7a6247" }],
]);
add("fairytower", "পরি টাওয়ার", [
  ["সাদা", {}],
  ["ধূসর ছাদ", { roof: "#a8b0b8", trim: "#c4c8cc" }],
]);
add("chanterelle", "শ্যান্টারেল", [
  ["কমলা", {}],
  ["ফ্যাকাশে", { cap: "#e8c47a", gill: "#d0a85c", stem: "#a8845a" }],
]);

// The printed figurines that come with the same sets.
add("mantis", "ম্যান্টিস", [
  ["সাদা", {}],
  ["সবুজ", { body: "#7fa356" }],
]);
add("snake", "সাপ", [
  ["বালি", {}],
  ["গাঢ়", { body: "#6f5a44", wood: "#7d6046", base: "#7a5f45" }],
]);
add("wolf", "নেকড়ে", [
  ["ধূসর", {}],
  ["কালো", { body: "#5e5c58", stone: "#7a7772" }],
]);
add("ibex", "আইবেক্স", [["", {}]]);
add("elephant", "হাতি", [["", {}]]);

// Category assignment for the flyout panel (like the reference game's
// Favorites / Mushrooms / Rocks / Structures / Pine / Wood / Plant list).
const CAT_BY_KIND = {
  moss: "moss",
  mossball: "moss",
  cushionmoss: "moss",
  starmoss: "moss",
  smoothcapmoss: "moss",
  fissidens: "moss",
  fernmoss: "moss",
  broomforkmoss: "moss",
  javamoss: "moss",
  trachycystis: "moss",
  rotala: "aquatic",
  ludwigia: "aquatic",
  bacopa: "aquatic",
  hygrophila: "aquatic",
  persicaria: "aquatic",
  lindernia: "aquatic",
  alternanthera: "aquatic",
  cabomba: "aquatic",
  myriophyllum: "aquatic",
  ambulia: "aquatic",
  anacharis: "aquatic",
  pogostemon: "aquatic",
  echinodorus: "aquatic",
  cryptocoryne: "aquatic",
  sagittaria: "aquatic",
  waterwisteria: "aquatic",
  hydrocotyle: "aquatic",
  waterpoppy: "aquatic",
  aglaonema: "plants",
  anthurium: "plants",
  alocasia: "plants",
  philodendron: "plants",
  haworthia: "plants",
  ivy: "plants",
  selaginella: "plants",
  peperomia: "plants",
  babytears: "plants",
  creepingfig: "plants",
  nerite: "animals",
  shrimp: "animals",
  isopod: "animals",
  springtails: "animals",
  bonsai: "plants",
  snakeplant: "plants",
  leafy: "plants",
  fern: "plants",
  pink: "plants",
  succulent: "plants",
  airplant: "plants",
  cactus: "plants",
  // the flowering pack gets its own section — a flower is what people come
  // looking for, and hunting for it among sixty foliage plants is no fun
  flowers: "flowers",
  rainlily: "flowers",
  crownofthorns: "flowers",
  ruellia: "flowers",
  amaryllis: "flowers",
  butterflypea: "flowers",
  lantana: "flowers",
  wedelia: "flowers",
  // grown for the leaves, so they stay with the plants
  coleus: "plants",
  drimiopsis: "plants",
  kalanchoe: "plants",
  oxalis: "plants",
  pilea: "plants",
  pothos: "plants",
  calathea: "plants",
  venusflytrap: "plants",
  saguaro: "plants",
  pricklypear: "plants",
  pincushion: "plants",
  cliplight: "lights",
  striplight: "lights",
  framelight: "lights",
  ringlight: "lights",
  mushroom: "mushroom",
  stone: "rocks",
  slate: "rocks",
  crystal: "rocks",
  geode: "rocks",
  shell: "animals",
  butterfly: "animals",
  ladybug: "animals",
  deer: "animals",
  frog: "animals",
  turtle: "animals",
  bird: "animals",
  gnome: "animals",
  bridge: "structures",
  house: "structures",
  lantern: "structures",
  torii: "structures",
  pagoda: "structures",
  fence: "structures",
  well: "structures",
  pond: "structures",
  // the printed set: buildings, ruins and hides are structures; the figurines
  // that ship with them belong with the other creatures
  mushroombridge: "structures",
  ropebridge: "structures",
  crookedcottage: "structures",
  tudorhouse: "structures",
  shellhouse: "structures",
  logcabin: "structures",
  mushroomhouse: "structures",
  domecottage: "structures",
  witchhat: "structures",
  spiraltower: "structures",
  chapel: "structures",
  stumphouse: "structures",
  ziggurat: "structures",
  rockcave: "structures",
  slateledge: "structures",
  canyon: "structures",
  stonestairs: "structures",
  brokenwall: "structures",
  ruinedtower: "structures",
  templehall: "structures",
  pavilion: "structures",
  anchor: "structures",
  taikobashi: "structures",
  brickwell: "structures",
  parkbench: "structures",
  stilthouse: "structures",
  brickpile: "structures",
  stonepath: "structures",
  oillamp: "structures",
  moroccanlantern: "structures",
  branchbench: "structures",
  coveredwagon: "structures",
  wheelwell: "structures",
  pagodatower: "structures",
  porchcottage: "structures",
  fairytower: "structures",
  chanterelle: "mushroom",
  mantis: "animals",
  snake: "animals",
  wolf: "animals",
  ibex: "animals",
  elephant: "animals",
  driftwood: "wood",
  pinecone: "wood",
  log: "wood",
};
D.forEach((d) => (d.cat = CAT_BY_KIND[d.kind] || "plants"));

// What each plant actually wants, which is not the same question as what
// category it sits in. A sealed jar is a humid, still, low-light box: forest
// floor plants love it, desert plants rot in it within weeks, and the aquarium
// species need their roots in water. The tray says so on the chip rather than
// letting someone discover it three months in.
//
//   closed  — thrives sealed and humid, the classic terrarium plant
//   open    — needs airflow and a dry spell; put it in an open vessel
//   aquatic — submerged or emersed; wants water, not damp soil
export const HABITATS = {
  closed: { label: "বদ্ধ জারে", hint: "আর্দ্র, বদ্ধ জারে ভালো থাকে" },
  open: { label: "খোলা পাত্রে", hint: "বাতাস চলাচল আর শুকনো সময় দরকার" },
  aquatic: { label: "জলজ", hint: "পানিতে বা ভেজা তীরে বাঁচে" },
};

const HABITAT_BY_KIND = {
  // forest-floor plants and mosses — the ones a closed jar is built for
  moss: "closed", mossball: "closed", cushionmoss: "closed", starmoss: "closed",
  smoothcapmoss: "closed", fissidens: "closed", fernmoss: "closed",
  broomforkmoss: "closed", javamoss: "closed", trachycystis: "closed",
  selaginella: "closed", peperomia: "closed", babytears: "closed",
  creepingfig: "closed", fern: "closed", pink: "closed", pilea: "closed",
  pothos: "closed", calathea: "closed", ivy: "closed", leafy: "closed",
  aglaonema: "closed", anthurium: "closed", alocasia: "closed",
  philodendron: "closed", venusflytrap: "closed",
  // these want air and a dry spell — they rot in a sealed jar
  succulent: "open", cactus: "open", saguaro: "open", pricklypear: "open",
  pincushion: "open", haworthia: "open", airplant: "open", snakeplant: "open",
  bonsai: "open", flowers: "open",
  // the flowering pack: sun, airflow and a dry spell between waterings. A
  // sealed jar kills every one of these, so say it on the chip.
  rainlily: "open", crownofthorns: "open", ruellia: "open", amaryllis: "open",
  butterflypea: "open", lantana: "open", wedelia: "open", kalanchoe: "open",
  drimiopsis: "open",
  // the two that really are shade-and-humidity plants
  oxalis: "closed", coleus: "closed",
  // aquarium species: submerged or emersed on a wet bank
  rotala: "aquatic", ludwigia: "aquatic", bacopa: "aquatic",
  hygrophila: "aquatic", persicaria: "aquatic", lindernia: "aquatic",
  alternanthera: "aquatic", cabomba: "aquatic", myriophyllum: "aquatic",
  ambulia: "aquatic", anacharis: "aquatic", pogostemon: "aquatic",
  echinodorus: "aquatic", cryptocoryne: "aquatic", sagittaria: "aquatic",
  waterwisteria: "aquatic", hydrocotyle: "aquatic", waterpoppy: "aquatic",
  nerite: "aquatic", shrimp: "aquatic",
};
D.forEach((d) => (d.habitat = HABITAT_BY_KIND[d.kind] ?? null));

// The two decorations that do a job: while either is in the jar, mould gets
// grazed back instead of spreading. `src/game.js` reads this.
export const CLEANUP_KINDS = new Set(["springtails", "isopod"]);

export const DECORATIONS = D;

export const CATEGORIES = [
  { id: "fav", label: "পছন্দের", icon: "❤️" },
  { id: "tray", label: "ট্রে", icon: "🧰" },
  { id: "jar", label: "জার", icon: "🫙" },
  { id: "base", label: "বেস স্তর", icon: "🟤" },
  { id: "plants", label: "গাছপালা", icon: "🌿" },
  { id: "flowers", label: "ফুলগাছ", icon: "🌸" },
  { id: "moss", label: "মস", icon: "🌱" },
  { id: "aquatic", label: "জলজ গাছ", icon: "🌊" },
  { id: "mushroom", label: "মাশরুম", icon: "🍄" },
  { id: "rocks", label: "পাথর ও ক্রিস্টাল", icon: "💎" },
  { id: "animals", label: "প্রাণী", icon: "🦌" },
  { id: "structures", label: "স্থাপনা", icon: "🏠" },
  { id: "wood", label: "কাঠ", icon: "🪵" },
  { id: "lights", label: "আলো", icon: "💡" },
];

export const BASE_BY_ID = Object.fromEntries(BASE_LAYERS.map((b) => [b.id, b]));
export const DECOR_BY_ID = Object.fromEntries(
  DECORATIONS.map((d) => [d.id, d]),
);
