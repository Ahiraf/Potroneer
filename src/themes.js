export const THEMES = [
  { id: "studio", label: "Studio", bn: "স্টুডিও", mood: "studio", weather: "clear", critters: "motes", pack: "starter" },
  { id: "hogwarts", label: "Wizarding Hall", bn: "জাদুর হল", mood: "library", weather: "sparkle", critters: "owls", pack: "wizarding" },
  { id: "space", label: "Astronomy", bn: "মহাকাশ", mood: "space", weather: "stars", critters: "satellites", pack: "cosmic" },
  { id: "jungle", label: "Jungle", bn: "জঙ্গল", mood: "garden", weather: "mist", critters: "fireflies", pack: "jungle" },
  { id: "town", label: "Urban Town", bn: "শহর", mood: "town", weather: "clear", critters: "birds", pack: "urban" },
  { id: "village", label: "Green Village", bn: "সবুজ গ্রাম", mood: "village", weather: "breeze", critters: "birds", pack: "village" },
  { id: "cherry", label: "Cherry Blossom", bn: "চেরি ব্লসম", mood: "blossom", weather: "petals", critters: "butterflies", pack: "blossom" },
  { id: "avatar", label: "Floating Grove", bn: "ভাসমান বন", mood: "grove", weather: "glow", critters: "fireflies", pack: "avatar" },
  { id: "spiderman", label: "Spider City", bn: "স্পাইডার সিটি", mood: "spidercity", weather: "web", critters: "spiders", pack: "hero" },
  { id: "chinese-village", label: "Lantern Village", bn: "লণ্ঠন গ্রাম", mood: "lantern", weather: "lanterns", critters: "fireflies", pack: "lantern" },
  { id: "alpine", label: "Alpine Valley", bn: "পাহাড়ি উপত্যকা", mood: "mountain", weather: "snow", critters: "birds", pack: "alpine" },
  { id: "caucasus", label: "Caucasus Valley", bn: "ককেশাস উপত্যকা", mood: "valley", weather: "breeze", critters: "birds", pack: "caucasus" },
];

export const SEASONS = [
  { id: "spring", label: "Spring", bn: "বসন্ত", weather: "petals" },
  { id: "summer", label: "Summer", bn: "গ্রীষ্ম", weather: "fireflies" },
  { id: "autumn", label: "Autumn", bn: "শরৎ", weather: "leaves" },
  { id: "winter", label: "Winter", bn: "শীত", weather: "snow" },
];

export const WEATHER = [
  { id: "clear", label: "Clear", bn: "পরিষ্কার" },
  { id: "rain", label: "Rain", bn: "বৃষ্টি" },
  { id: "snow", label: "Snow", bn: "তুষার" },
  { id: "petals", label: "Petals", bn: "পাপড়ি" },
  { id: "leaves", label: "Leaves", bn: "পাতা" },
  { id: "fireflies", label: "Fireflies", bn: "জোনাকি" },
  { id: "stars", label: "Stars", bn: "তারা" },
  { id: "mist", label: "Mist", bn: "কুয়াশা" },
  { id: "sparkle", label: "Sparkle", bn: "ঝিলিক" },
  { id: "breeze", label: "Breeze", bn: "মৃদু বাতাস" },
  { id: "glow", label: "Glow", bn: "আভা" },
  { id: "web", label: "Web", bn: "জাল" },
  { id: "lanterns", label: "Lanterns", bn: "লণ্ঠন" },
];

export const COSMETIC_PACKS = [
  { id: "starter", label: "Starter Garden", bn: "স্টার্টার বাগান", color: "#6d9e4f" },
  { id: "wizarding", label: "Wizarding Relics", bn: "জাদুর স্মারক", color: "#9a77c9" },
  { id: "cosmic", label: "Cosmic Glow", bn: "মহাজাগতিক আলো", color: "#5c93c9" },
  { id: "jungle", label: "Jungle Canopy", bn: "জঙ্গলের ছাউনি", color: "#3e995a" },
  { id: "urban", label: "City Objects", bn: "শহুরে জিনিস", color: "#b68a63" },
  { id: "village", label: "Village Life", bn: "গ্রামের জীবন", color: "#c29a5d" },
  { id: "blossom", label: "Blossom Season", bn: "ফুলের ঋতু", color: "#d17aa0" },
  { id: "avatar", label: "Sky Grove", bn: "আকাশ বন", color: "#6b9eb8" },
  { id: "hero", label: "Web City", bn: "ওয়েব শহর", color: "#c94f3f" },
  { id: "lantern", label: "Lantern Night", bn: "লণ্ঠনের রাত", color: "#e4a052" },
  { id: "alpine", label: "Alpine Calm", bn: "পাহাড়ি শান্তি", color: "#aec6d6" },
  { id: "caucasus", label: "Caucasus Valley", bn: "ককেশাস উপত্যকা", color: "#8fae9a" },
];

export function themeById(id) {
  return THEMES.find((theme) => theme.id === id) || THEMES[0];
}
