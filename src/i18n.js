// Tiny two-language dictionary. UI strings are authored in Bangla; `t()` maps
// them to English when the user flips the language button. Composite labels
// ("মস · সবুজ") are translated part by part.

const EN = {
  // tabs
  "ভাস্কর্য": "Sculpting",
  "পেইন্টিং": "Painting",
  "সাজানো": "Decorations",
  "দৃশ্য": "Scene",
  // tools
  "বসাও": "Place",
  "উঁচু": "Raise",
  "নিচু": "Lower",
  "ঘাস": "Grass",
  "নুড়িপথ": "Pebble path",
  // sliders
  "ব্যাসার্ধ": "Radius",
  "শক্তি": "Strength",
  "ফলঅফ": "Falloff",
  // categories
  "পছন্দের": "Favorites",
  "জার": "Jars",
  "বেস স্তর": "Base layers",
  "গাছপালা": "Plants",
  "মাশরুম": "Mushrooms",
  "পাথর ও ক্রিস্টাল": "Rocks & crystals",
  "প্রাণী": "Animals",
  "স্থাপনা": "Structures",
  "কাঠ": "Wood",
  // scene panel
  "পরিবেশ": "Scene",
  "অন্যান্য": "Other",
  "খোঁজো…": "Search…",
  // jars
  "কর্ক জার": "Cork jar",
  "বেল জার": "Bell jar",
  "বোতল": "Bottle",
  "ম্যাসন": "Mason jar",
  "গোল জার": "Globe",
  "লম্বা": "Tall cylinder",
  "বাটি": "Bowl",
  "ফ্লাস্ক": "Flask",
  "ডিম জার": "Egg jar",
  "গ্রিনহাউস": "Greenhouse",
  "ছোট": "Small",
  "বড়": "Large",
  // base layers
  "লেকা বল": "LECA balls",
  "নুড়ি": "Pebbles",
  "স্ফ্যাগনাম": "Sphagnum",
  "চারকোল": "Charcoal",
  "মাটি": "Soil",
  "বালু": "Sand",
  "সাদা বালু": "White sand",
  // decoration base names
  "মস": "Moss",
  "স্নেক প্ল্যান্ট": "Snake plant",
  "পাতাগাছ": "Leafy plant",
  "ফার্ন": "Fern",
  "ফিটোনিয়া": "Fittonia",
  "সাকুলেন্ট": "Succulent",
  "এয়ার প্ল্যান্ট": "Air plant",
  "ক্রিস্টাল": "Crystal",
  "পাথর": "Stone",
  "শামুক": "Snail",
  "ক্যাকটাস": "Cactus",
  "ফুল": "Flowers",
  "সেতু": "Bridge",
  "ছোট্ট ঘর": "Tiny house",
  "লণ্ঠন": "Lantern",
  "প্রজাপতি": "Butterfly",
  "লেডিবাগ": "Ladybug",
  "হরিণ": "Deer",
  // variant suffixes
  "সবুজ": "Green",
  "হলদে": "Yellowish",
  "গাঢ়": "Dark",
  "নীলচে": "Bluish",
  "হালকা": "Light",
  "লালচে": "Reddish",
  "গোলাপি": "Pink",
  "লাল": "Red",
  "সাদা": "White",
  "নীল": "Blue",
  "বেগুনি": "Purple",
  "রুপালি": "Silvery",
  "কমলা": "Orange",
  "বাদামি": "Brown",
  "ফ্যাকাশে": "Pale",
  "স্বচ্ছ": "Clear",
  "বেলে": "Sandy",
  "ধূসর": "Gray",
  "কালো": "Black",
  "ফুলসহ": "Blooming",
  "হলুদ ফুল": "Yellow bloom",
  "ফুলহীন": "No bloom",
  "হলুদ": "Yellow",
  "উষ্ণ": "Warm",
  "শীতল": "Cool",
  // hints
  "আসল টেরারিয়ামের মতো শুরু করো — প্রথমে লেকা বল বা নুড়ি দিয়ে ড্রেনেজ স্তর বানাও।":
    "Start like a real terrarium — lay a drainage layer of LECA balls or pebbles first.",
  "এবার স্ফ্যাগনাম মসের পাতলা স্তর দাও — এটা মাটিকে নিচের ড্রেনেজে মিশে যাওয়া থেকে আটকায়।":
    "Now add a thin sphagnum moss barrier — it keeps soil out of the drainage below.",
  "এক চিমটি চারকোল ছড়াও — বন্ধ জারের ভেতরটা তাজা রাখে।":
    "Sprinkle a little charcoal — it keeps a closed jar fresh.",
  "এখন মূল স্তর — মাটি। গাছের শিকড়ের জন্য একটু পুরু করে দাও।":
    "Now the main layer — soil. Make it thick enough for roots.",
  "সুন্দর! এবার সাজানোর জিনিস বেছে জারের ভেতরে ট্যাপ করে বসাও।":
    "Lovely! Now pick decorations and tap inside the jar to place them.",
  "দারুণ! ⛰️ টুলে মাটি ভাস্কর্য করো, 🌱 টুলে ঘাস আঁকো, জিনিস ধরে টেনে সাজাও।":
    "Great! Sculpt the land with ⛰️, paint grass with 🌱, and drag items to arrange them.",
  "জার প্রায় ভরে গেছে — এবার সাজানো শুরু করো!":
    "The jar is nearly full — time to decorate!",
  "আগে অন্তত একটা বেস স্তর দাও, তারপর গাছ বসাও।":
    "Add at least one base layer first, then plant.",
  "আগে বেস স্তর দাও, তারপর ভাস্কর্য বা ঘাস।":
    "Lay a base layer first, then sculpt or paint.",
  "ছবি সেভ হয়ে গেছে! বন্ধুদের দেখাও।": "Photo saved! Show your friends.",
  "পছন্দ": "Favorite",
};

let lang = localStorage.getItem("terrarium-lang") || "bn";

export function getLang() {
  return lang;
}

export function setLang(l) {
  lang = l;
  localStorage.setItem("terrarium-lang", l);
}

// Translate a single string.
export function t(bn) {
  if (lang === "bn") return bn;
  return EN[bn] ?? bn;
}

// Translate a composite label like "মস · সবুজ" part by part.
export function tLabel(label) {
  if (lang === "bn") return label;
  return label
    .split(" · ")
    .map((part) => EN[part] ?? part)
    .join(" · ");
}
