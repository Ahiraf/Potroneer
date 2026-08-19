// Themes = "where the terrarium sits". Two kinds live in the same list:
//   • painted  — procedural backdrops drawn in scene.js (the original twelve)
//   • photo    — a real photograph from /public/themes, cover-cropped to 16:9
//                with a matching 480×300 thumbnail for the picker
//
// Every theme also carries the three numbers the rest of the app themes itself
// from: `accent` (the picture's signature colour), `tone` (its average colour)
// and `lum` (0–1 average brightness). `themeSkin()` turns those into the CSS
// custom properties that repaint the whole UI, and scene.js uses `lum` to
// decide how far to knock the backdrop back so the glass always reads.

export const THEME_GROUPS = [
  { id: "painted", label: "Painted", bn: "আঁকা", icon: "\u{1F3A8}" },
  { id: "cozy", label: "Cozy rooms", bn: "আরামের ঘর", icon: "\u{1FA91}" },
  { id: "window", label: "Windows", bn: "জানালা", icon: "\u{1FA9F}" },
  { id: "nature", label: "Nature", bn: "প্রকৃতি", icon: "\u{1F33F}" },
  { id: "bloom", label: "Blossom", bn: "ফুল", icon: "\u{1F338}" },
  { id: "magic", label: "Magic", bn: "জাদু", icon: "\u{2728}" },
];

// --- painted worlds (backdrops drawn by scene.js) ---------------------------
const PAINTED = [
  { id: "studio", label: "Studio", bn: "স্টুডিও", mood: "studio", weather: "clear", critters: "motes", pack: "starter", accent: "#6d9e4f", tone: "#e3e6ea", lum: 0.86 },
  { id: "hogwarts", label: "Wizarding Hall", bn: "জাদুর হল", mood: "library", weather: "sparkle", critters: "owls", pack: "wizarding", accent: "#c08a4a", tone: "#2c2114", lum: 0.14 },
  { id: "space", label: "Astronomy", bn: "মহাকাশ", mood: "space", weather: "stars", critters: "satellites", pack: "cosmic", accent: "#7ea6dd", tone: "#141824", lum: 0.1 },
  { id: "jungle", label: "Jungle", bn: "জঙ্গল", mood: "garden", weather: "mist", critters: "fireflies", pack: "jungle", accent: "#5aa863", tone: "#9db08c", lum: 0.62 },
  { id: "town", label: "Urban Town", bn: "শহর", mood: "town", weather: "clear", critters: "birds", pack: "urban", accent: "#d09a5e", tone: "#c99070", lum: 0.55 },
  { id: "village", label: "Green Village", bn: "সবুজ গ্রাম", mood: "village", weather: "breeze", critters: "birds", pack: "village", accent: "#7fae5c", tone: "#c3dcc0", lum: 0.76 },
  { id: "cherry", label: "Cherry Blossom", bn: "চেরি ব্লসম", mood: "blossom", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#dd8bab", tone: "#eec6d6", lum: 0.79 },
  { id: "avatar", label: "Floating Grove", bn: "ভাসমান বন", mood: "grove", weather: "glow", critters: "fireflies", pack: "avatar", accent: "#54b3ad", tone: "#a9ded6", lum: 0.75 },
  { id: "spiderman", label: "Spider City", bn: "স্পাইডার সিটি", mood: "spidercity", weather: "web", critters: "spiders", pack: "hero", accent: "#c9584a", tone: "#232d48", lum: 0.16 },
  { id: "chinese-village", label: "Lantern Village", bn: "লণ্ঠন গ্রাম", mood: "lantern", weather: "lanterns", critters: "fireflies", pack: "lantern", accent: "#e4a052", tone: "#3a2740", lum: 0.2 },
  { id: "alpine", label: "Alpine Valley", bn: "পাহাড়ি উপত্যকা", mood: "mountain", weather: "snow", critters: "birds", pack: "alpine", accent: "#8fb6cf", tone: "#d8b8a0", lum: 0.72 },
  { id: "caucasus", label: "Caucasus Valley", bn: "ককেশাস উপত্যকা", mood: "valley", weather: "breeze", critters: "birds", pack: "caucasus", accent: "#7fa892", tone: "#d4e2da", lum: 0.84 },
].map((t) => ({ ...t, group: "painted" }));

// --- photo worlds (assets in /public/themes) --------------------------------
const PHOTO = [
  { id: "cartoon-room", label: "Cartoon Room", bn: "কার্টুন ঘর", group: "cozy", photo: true, mood: "day", weather: "clear", critters: "motes", pack: "starter", accent: "#d0ba8b", tone: "#c9c2a9", lum: 0.759 },
  { id: "library-city-window", label: "City Library Window", bn: "শহরের লাইব্রেরি", group: "cozy", photo: true, mood: "library", weather: "sparkle", critters: "owls", pack: "wizarding", accent: "#517ab8", tone: "#2d2a2c", lum: 0.169 },
  { id: "leaf-shadow-wall", label: "Leaf Shadows", bn: "পাতার ছায়া", group: "cozy", photo: true, mood: "day", weather: "breeze", critters: "motes", pack: "starter", accent: "#d0bb8b", tone: "#cfc5ad", lum: 0.774 },
  { id: "moonlit-bedroom", label: "Moonlit Bedroom", bn: "জ্যোৎস্না ঘর", group: "cozy", photo: true, mood: "night", weather: "stars", critters: "fireflies", pack: "starter", accent: "#4d69bc", tone: "#5c6390", lum: 0.396 },
  { id: "moonlit-library", label: "Moonlit Library", bn: "জ্যোৎস্না লাইব্রেরি", group: "cozy", photo: true, mood: "library", weather: "sparkle", critters: "owls", pack: "wizarding", accent: "#519eb8", tone: "#416069", lum: 0.353 },
  { id: "quiet-beige-wall", label: "Quiet Wall", bn: "শান্ত দেয়াল", group: "cozy", photo: true, mood: "studio", weather: "clear", critters: "motes", pack: "starter", accent: "#c9a77b", tone: "#bfa585", lum: 0.661 },
  { id: "tatami-room", label: "Tatami Room", bn: "তাতামি ঘর", group: "cozy", photo: true, mood: "day", weather: "clear", critters: "motes", pack: "starter", accent: "#b88e51", tone: "#8c7760", lum: 0.478 },
  { id: "breezy-window", label: "Breezy Window", bn: "হাওয়ার জানালা", group: "window", photo: true, mood: "day", weather: "breeze", critters: "birds", pack: "starter", accent: "#d2bc89", tone: "#c7bf9d", lum: 0.747 },
  { id: "forest-stream-window", label: "Forest Stream", bn: "বনের ঝরনা", group: "window", photo: true, mood: "garden", weather: "mist", critters: "birds", pack: "jungle", accent: "#b9bd5e", tone: "#888a6d", lum: 0.531 },
  { id: "night-town-window", label: "Night Town Window", bn: "রাতের শহরের জানালা", group: "window", photo: true, mood: "night", weather: "stars", critters: "fireflies", pack: "urban", accent: "#4d6ebc", tone: "#343e5f", lum: 0.244 },
  { id: "old-town-night", label: "Old Town Night", bn: "পুরোনো শহরের রাত", group: "window", photo: true, mood: "town", weather: "stars", critters: "birds", pack: "urban", accent: "#5188b8", tone: "#1e242b", lum: 0.137 },
  { id: "seaside-balcony", label: "Seaside Balcony", bn: "সমুদ্র বারান্দা", group: "window", photo: true, mood: "beach", weather: "breeze", critters: "birds", pack: "starter", accent: "#7ea6dd", tone: "#e1e6ed", lum: 0.901 },
  { id: "starry-town-window", label: "Starry Town", bn: "তারার শহর", group: "window", photo: true, mood: "night", weather: "stars", critters: "fireflies", pack: "urban", accent: "#3f7bca", tone: "#253549", lum: 0.202 },
  { id: "white-steps-lake", label: "White Steps Lake", bn: "সাদা সিঁড়ি হ্রদ", group: "window", photo: true, mood: "valley", weather: "breeze", critters: "birds", pack: "caucasus", accent: "#ccb383", tone: "#bdbeb9", lum: 0.744 },
  { id: "snowflake-blue", label: "Blue Snowflake", bn: "নীল তুষারকণা", group: "nature", photo: true, mood: "night", weather: "snow", critters: "motes", pack: "alpine", accent: "#2989e0", tone: "#0a213b", lum: 0.116 },
  { id: "cave-lookout-pines", label: "Cave Lookout", bn: "গুহার জানালা", group: "nature", photo: true, mood: "mountain", weather: "breeze", critters: "birds", pack: "alpine", accent: "#72b851", tone: "#2e3b2c", lum: 0.218 },
  { id: "daisy-meadow-swing", label: "Daisy Meadow", bn: "ডেইজি মাঠ", group: "nature", photo: true, mood: "village", weather: "breeze", critters: "butterflies", pack: "village", accent: "#bdbc5f", tone: "#71725a", lum: 0.438 },
  { id: "golden-swan-forest", label: "Golden Swan Forest", bn: "সোনালি রাজহাঁস বন", group: "nature", photo: true, mood: "dusk", weather: "mist", critters: "birds", pack: "village", accent: "#bb8759", tone: "#8b745b", lum: 0.466 },
  { id: "lavender-dusk", label: "Lavender Dusk", bn: "ল্যাভেন্ডার গোধূলি", group: "nature", photo: true, mood: "dusk", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#d0b08b", tone: "#b7adb3", lum: 0.688 },
  { id: "mushroom-moon-forest", label: "Mushroom Moon Forest", bn: "ব্যাঙের ছাতার বন", group: "nature", photo: true, mood: "garden", weather: "fireflies", critters: "fireflies", pack: "jungle", accent: "#519eb8", tone: "#2f464b", lum: 0.258 },
  { id: "snowy-pine-window", label: "Snowy Pines", bn: "তুষার পাইন", group: "nature", photo: true, mood: "mountain", weather: "snow", critters: "birds", pack: "alpine", accent: "#518bb8", tone: "#8f96a0", lum: 0.586 },
  { id: "willow-swan-lake", label: "Willow Swan Lake", bn: "উইলো রাজহাঁস হ্রদ", group: "nature", photo: true, mood: "garden", weather: "mist", critters: "birds", pack: "village", accent: "#92b851", tone: "#364035", lum: 0.238 },
  { id: "yellow-blossom-brick", label: "Golden Blossom", bn: "সোনালি ফুল", group: "bloom", photo: true, mood: "day", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#c69a45", tone: "#b9a783", lum: 0.66 },
  { id: "pink-blossom-wall", label: "Pink Blossom Wall", bn: "গোলাপি ফুলের দেয়াল", group: "bloom", photo: true, mood: "blossom", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#d0918b", tone: "#bcbfb9", lum: 0.745 },
  { id: "sunflower-curtain", label: "Sunflower Curtain", bn: "সূর্যমুখী পর্দা", group: "bloom", photo: true, mood: "day", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#e8ba72", tone: "#e6be7d", lum: 0.76 },
  { id: "rose-sunlit-wall", label: "Sunlit Roses", bn: "রোদে গোলাপ", group: "bloom", photo: true, mood: "blossom", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#d0a98b", tone: "#decdbe", lum: 0.814 },
  { id: "white-blossom-wall", label: "White Blossom Wall", bn: "সাদা ফুলের দেয়াল", group: "bloom", photo: true, mood: "day", weather: "petals", critters: "butterflies", pack: "blossom", accent: "#d0b88b", tone: "#a5aa9c", lum: 0.66 },
  { id: "candlelit-cathedral", label: "Candlelit Cathedral", bn: "মোমবাতির ক্যাথিড্রাল", group: "magic", photo: true, mood: "library", weather: "snow", critters: "owls", pack: "wizarding", accent: "#517eb8", tone: "#3f4a63", lum: 0.288 },
  { id: "castle-arches", label: "Castle Arches", bn: "দুর্গের খিলান", group: "magic", photo: true, mood: "library", weather: "sparkle", critters: "owls", pack: "wizarding", accent: "#5192b8", tone: "#2d3a41", lum: 0.218 },
  { id: "castle-night-window", label: "Castle Window", bn: "দুর্গের জানালা", group: "magic", photo: true, mood: "night", weather: "sparkle", critters: "owls", pack: "wizarding", accent: "#5170b8", tone: "#25314c", lum: 0.19 },
  { id: "keyhole-valley", label: "Keyhole Valley", bn: "চাবির ফুটোয় উপত্যকা", group: "magic", photo: true, mood: "valley", weather: "glow", critters: "butterflies", pack: "caucasus", accent: "#b87a51", tone: "#493e35", lum: 0.251 },
  { id: "lantern-terrace", label: "Lantern Terrace", bn: "লণ্ঠন বারান্দা", group: "magic", photo: true, mood: "lantern", weather: "lanterns", critters: "fireflies", pack: "lantern", accent: "#b87051", tone: "#4d4050", lum: 0.265 },
  { id: "mossy-portal", label: "Mossy Portal", bn: "শ্যাওলার দরজা", group: "magic", photo: true, mood: "garden", weather: "glow", critters: "fireflies", pack: "jungle", accent: "#b89451", tone: "#343028", lum: 0.19 },
  { id: "patronus-forest", label: "Patronus Forest", bn: "রক্ষাকবচ বন", group: "magic", photo: true, mood: "night", weather: "glow", critters: "fireflies", pack: "wizarding", accent: "#5180b8", tone: "#15232f", lum: 0.129 },
  { id: "spirit-stag-cave", label: "Spirit Stag Cave", bn: "আলোর হরিণ গুহা", group: "magic", photo: true, mood: "night", weather: "glow", critters: "fireflies", pack: "wizarding", accent: "#2994e0", tone: "#02070b", lum: 0.023 },
  { id: "starlit-hall", label: "Starlit Hall", bn: "তারাভরা হল", group: "magic", photo: true, mood: "space", weather: "stars", critters: "satellites", pack: "cosmic", accent: "#517db8", tone: "#2a3848", lum: 0.214 },
  { id: "winter-castle-window", label: "Winter Castle", bn: "শীতের দুর্গ", group: "magic", photo: true, mood: "mountain", weather: "snow", critters: "owls", pack: "alpine", accent: "#5178b8", tone: "#313743", lum: 0.215 },
];

export const THEMES = [...PAINTED, ...PHOTO];

/** Backdrop image for a photo theme (full size), or null for painted ones. */
export function themePhoto(theme) {
  return theme?.photo ? `/themes/${theme.id}.jpg` : null;
}
/** Picker thumbnail for a photo theme, or null for painted ones. */
export function themeThumb(theme) {
  return theme?.photo ? `/themes/${theme.id}-thumb.jpg` : null;
}

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

// --- turning a theme into a UI skin -----------------------------------------

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function mix(a, b, t) {
  const [x, y, z] = hexToRgb(a);
  const [p, q, r] = hexToRgb(b);
  const c = (u, v) => Math.round(u + (v - u) * t);
  return `#${[c(x, p), c(y, q), c(z, r)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
/** Relative luminance, used to keep text contrast on the accent colour. */
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The CSS custom properties that repaint every button, panel and pill for a
 * theme. Panels stay deliberately dark and translucent even under a bright
 * photo: the terrarium is the subject, and dark chrome keeps its glass and
 * greens readable no matter what is behind it. Only the accent, the tint and
 * the amount of glass change from theme to theme.
 */
export function themeSkin(theme) {
  const accent = theme.accent || "#6d9e4f";
  const tone = theme.tone || "#1a1d1a";
  // Panel base: the picture's own colour pulled far down toward black, so each
  // theme's chrome feels related to its backdrop without ever competing.
  const panel = mix(tone, "#0e100e", 0.78);
  const panelUp = mix(tone, "#12140f", 0.62);
  const bright = luminance(accent) > 0.45;
  return {
    "--accent": accent,
    "--accent-soft": rgba(accent, 0.85),
    "--accent-dim": rgba(accent, 0.22),
    "--accent-line": rgba(accent, 0.42),
    // Text that sits ON the accent (buttons): dark on light accents, light on dark.
    "--accent-ink": bright ? "#15180f" : "#f5f6ef",
    "--hud": rgba(panel, 0.82),
    "--hud-strong": rgba(panel, 0.94),
    "--hud-solid": panel,
    "--hud-raised": rgba(panelUp, 0.9),
    "--hud-border": rgba(mix(accent, "#ffffff", 0.5), 0.16),
    "--ink": mix("#ffffff", accent, 0.1),
    "--ink-dim": rgba(mix("#ffffff", accent, 0.25), 0.66),
    "--glow": rgba(accent, 0.3),
  };
}

/** Apply a theme's skin to the document (all UI chrome follows). */
export function applyThemeSkin(theme, root = document.documentElement) {
  const skin = themeSkin(theme);
  for (const [key, value] of Object.entries(skin)) root.style.setProperty(key, value);
  root.dataset.themeGroup = theme.group || "painted";
}
