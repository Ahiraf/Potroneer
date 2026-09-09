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
  { id: "places", label: "Places", bn: "জায়গা", icon: "\u{1F3EF}" },
];

// --- painted worlds (backdrops drawn by scene.js) ---------------------------
const PAINTED = [
  { id: "studio", label: "Studio", bn: "স্টুডিও", mood: "studio", weather: "clear", pack: "starter", accent: "#6d9e4f", tone: "#e3e6ea", lum: 0.86 },
  { id: "hogwarts", label: "Wizarding Hall", bn: "জাদুর হল", mood: "library", weather: "sparkle", pack: "wizarding", accent: "#c08a4a", tone: "#2c2114", lum: 0.14 },
  { id: "space", label: "Astronomy", bn: "মহাকাশ", mood: "space", weather: "stars", pack: "cosmic", accent: "#7ea6dd", tone: "#141824", lum: 0.1 },
  { id: "jungle", label: "Jungle", bn: "জঙ্গল", mood: "garden", weather: "mist", pack: "jungle", accent: "#5aa863", tone: "#9db08c", lum: 0.62 },
  { id: "town", label: "Urban Town", bn: "শহর", mood: "town", weather: "clear", pack: "urban", accent: "#d09a5e", tone: "#c99070", lum: 0.55 },
  { id: "village", label: "Green Village", bn: "সবুজ গ্রাম", mood: "village", weather: "breeze", pack: "village", accent: "#7fae5c", tone: "#c3dcc0", lum: 0.76 },
  { id: "cherry", label: "Cherry Blossom", bn: "চেরি ব্লসম", mood: "blossom", weather: "petals", pack: "blossom", accent: "#dd8bab", tone: "#eec6d6", lum: 0.79 },
  { id: "avatar", label: "Floating Grove", bn: "ভাসমান বন", mood: "grove", weather: "glow", pack: "avatar", accent: "#54b3ad", tone: "#a9ded6", lum: 0.75 },
  { id: "spiderman", label: "Spider City", bn: "স্পাইডার সিটি", mood: "spidercity", weather: "web", pack: "hero", accent: "#c9584a", tone: "#232d48", lum: 0.16 },
  { id: "chinese-village", label: "Lantern Village", bn: "লণ্ঠন গ্রাম", mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#e4a052", tone: "#3a2740", lum: 0.2 },
  { id: "alpine", label: "Alpine Valley", bn: "পাহাড়ি উপত্যকা", mood: "mountain", weather: "snow", pack: "alpine", accent: "#8fb6cf", tone: "#d8b8a0", lum: 0.72 },
  { id: "caucasus", label: "Caucasus Valley", bn: "ককেশাস উপত্যকা", mood: "valley", weather: "breeze", pack: "caucasus", accent: "#7fa892", tone: "#d4e2da", lum: 0.84 },
].map((t) => ({ ...t, group: "painted" }));

// --- photo worlds (assets in /public/themes) --------------------------------
// Every photograph here is sourced at 2000px or wider. An earlier set of 37 came
// from phone wallpapers around 736px across, and they went visibly soft as soon
// as the camera leaned toward the backdrop wall; they were retired rather than
// upscaled, since no runtime work puts back detail the photo never had.
const PHOTO = [
  { id: "shoji-corridor", label: "Shoji Corridor", bn: "শোজি বারান্দা", group: "cozy", photo: true, mood: "library", weather: "clear", pack: "starter", accent: "#ba7c4f", tone: "#29261c", lum: 0.148 },
  { id: "firelit-sitting-room", label: "Firelit Room", bn: "আগুনের ঘর", group: "cozy", photo: true, mood: "dusk", weather: "clear", pack: "starter", accent: "#c57344", tone: "#624634", lum: 0.294 },
  { id: "gallery-window-room", label: "Gallery Room", bn: "গ্যালারি ঘর", group: "cozy", photo: true, mood: "studio", weather: "clear", pack: "starter", accent: "#83c3d8", tone: "#adb1aa", lum: 0.69 },
  { id: "sunlit-adobe-room", label: "Adobe Room", bn: "মাটির ঘর", group: "cozy", photo: true, mood: "day", weather: "clear", pack: "starter", accent: "#b87e51", tone: "#483c33", lum: 0.243 },
  { id: "window-seat-nook", label: "Window Seat", bn: "জানালার আসন", group: "cozy", photo: true, mood: "day", weather: "breeze", pack: "starter", accent: "#b88f51", tone: "#817a6a", lum: 0.481 },
  { id: "linen-curtain-window", label: "Linen Curtains", bn: "লিনেন পর্দা", group: "window", photo: true, mood: "day", weather: "breeze", pack: "starter", accent: "#b88b51", tone: "#959694", lum: 0.586 },
  { id: "arched-autumn-window", label: "Arched Autumn Window", bn: "খিলানের শরৎ জানালা", group: "window", photo: true, mood: "day", weather: "leaves", pack: "village", accent: "#d29f37", tone: "#74643f", lum: 0.395 },
  { id: "alpine-window", label: "Alpine Window", bn: "আল্পসের জানালা", group: "window", photo: true, mood: "mountain", weather: "breeze", pack: "alpine", accent: "#d27637", tone: "#534b40", lum: 0.298 },
  { id: "cottage-sill-vases", label: "Cottage Sill", bn: "কুটিরের জানালা", group: "window", photo: true, mood: "day", weather: "breeze", pack: "starter", accent: "#b5d08b", tone: "#afb8a8", lum: 0.709 },
  { id: "garden-porthole", label: "Garden Window", bn: "বাগানের জানালা", group: "window", photo: true, mood: "garden", weather: "breeze", pack: "jungle", accent: "#95b851", tone: "#525747", lum: 0.333 },
  { id: "courtyard-window", label: "Courtyard Window", bn: "উঠোনের জানালা", group: "window", photo: true, mood: "garden", weather: "breeze", pack: "jungle", accent: "#b85c51", tone: "#86827a", lum: 0.511 },
  { id: "sunset-sea-window", label: "Sunset Sea Window", bn: "সূর্যাস্তের সাগর জানালা", group: "window", photo: true, mood: "beach", weather: "breeze", pack: "starter", accent: "#dba580", tone: "#79746e", lum: 0.456 },
  { id: "paris-window", label: "Paris Window", bn: "প্যারিসের জানালা", group: "window", photo: true, mood: "town", weather: "clear", pack: "urban", accent: "#b87e51", tone: "#746d64", lum: 0.432 },
  { id: "dusk-mist-window", label: "Dusk Mist Window", bn: "কুয়াশার গোধূলি জানালা", group: "window", photo: true, mood: "dusk", weather: "mist", pack: "starter", accent: "#b87451", tone: "#2d251e", lum: 0.151 },
  { id: "white-cherry-branch", label: "White Cherry Branch", bn: "সাদা চেরি ডাল", group: "bloom", photo: true, mood: "blossom", weather: "petals", pack: "blossom", accent: "#d0b98b", tone: "#c4c4ba", lum: 0.767 },
  { id: "sakura-canal-night", label: "Sakura Canal", bn: "সাকুরা খাল", group: "bloom", photo: true, mood: "lantern", weather: "petals", pack: "blossom", accent: "#ba574f", tone: "#875758", lum: 0.38 },
  { id: "platform-nine-and-three-quarters", label: "Platform 9\u00be", bn: "প্ল্যাটফর্ম ৯¾", group: "magic", photo: true, mood: "night", weather: "sparkle", pack: "wizarding", accent: "#517ab8", tone: "#232d41", lum: 0.173 },
  { id: "wizard-study", label: "Wizard's Study", bn: "জাদুকরের পাঠকক্ষ", group: "magic", photo: true, mood: "library", weather: "sparkle", pack: "wizarding", accent: "#b87551", tone: "#473a39", lum: 0.238 },
  { id: "wizard-alley", label: "Wizard Alley", bn: "জাদুর গলি", group: "magic", photo: true, mood: "town", weather: "sparkle", pack: "wizarding", accent: "#b87d51", tone: "#554d46", lum: 0.307 },
  { id: "common-room-hearth", label: "Common Room", bn: "আরামকক্ষ", group: "magic", photo: true, mood: "library", weather: "sparkle", pack: "wizarding", accent: "#b99351", tone: "#473b2a", lum: 0.235 },
  { id: "castle-moonrise", label: "Castle Moonrise", bn: "চাঁদের দুর্গ", group: "magic", photo: true, mood: "night", weather: "sparkle", pack: "wizarding", accent: "#b87451", tone: "#827d79", lum: 0.492 },
  { id: "temple-dragon-dusk", label: "Temple Dragon", bn: "মন্দিরের ড্রাগন", group: "places", photo: true, mood: "dusk", weather: "sparkle", pack: "lantern", accent: "#d38a73", tone: "#b88878", lum: 0.569 },
  { id: "palace-courtyard", label: "Palace Courtyard", bn: "প্রাসাদ প্রাঙ্গণ", group: "places", photo: true, mood: "town", weather: "clear", pack: "lantern", accent: "#b87251", tone: "#5b5550", lum: 0.338 },
  { id: "great-wall-autumn", label: "Great Wall", bn: "মহাপ্রাচীর", group: "places", photo: true, mood: "mountain", weather: "mist", pack: "alpine", accent: "#be774b", tone: "#736d62", lum: 0.43 },
  { id: "lake-boat-village", label: "Lake Boat Village", bn: "হ্রদের নৌকা গ্রাম", group: "places", photo: true, mood: "village", weather: "mist", pack: "village", accent: "#8bc1d0", tone: "#9daba9", lum: 0.658 },
  { id: "misty-autumn-road", label: "Misty Autumn Road", bn: "কুয়াশার শরৎ পথ", group: "nature", photo: true, mood: "dusk", weather: "mist", pack: "village", accent: "#b8b451", tone: "#3b402a", lum: 0.24 },
  { id: "foggy-forest-road", label: "Foggy Forest Road", bn: "কুয়াশার বনপথ", group: "nature", photo: true, mood: "night", weather: "mist", pack: "jungle", accent: "#9ab851", tone: "#222013", lum: 0.124 },
  { id: "autumn-avenue", label: "Autumn Avenue", bn: "শরতের সড়ক", group: "nature", photo: true, mood: "dusk", weather: "breeze", pack: "village", accent: "#b88e51", tone: "#5f4f3c", lum: 0.318 },
  { id: "golden-facade", label: "Golden Facade", bn: "সোনালি অট্টালিকা", group: "window", photo: true, mood: "town", weather: "clear", pack: "urban", accent: "#89b6d1", tone: "#b1aba0", lum: 0.671 },
  { id: "day-sky", label: "Day Sky", bn: "দিনের আকাশ", group: "window", photo: true, mood: "day", weather: "clear", pack: "starter", accent: "#5189b8", tone: "#7a8c9c", lum: 0.539 },
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
/** Relative luminance of an [r,g,b] triple, per WCAG 2.2. */
function relLum([r, g, b]) {
  const c = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
/** WCAG 2.2 contrast ratio between two [r,g,b] triples. */
export function contrastRatio(a, b) {
  const l1 = relLum(a);
  const l2 = relLum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** A translucent colour resolved against an opaque background. */
function over(hex, alpha, bg) {
  return hexToRgb(hex).map((v, i) => v * alpha + bg[i] * (1 - alpha));
}
/**
 * Walk `hex` toward `toward` in small steps until it clears `target` against
 * `bg`, and return the first shade that does. This is what keeps a theme from
 * being able to define unreadable chrome: the designer picks the direction,
 * the contrast requirement picks the distance.
 */
function toContrast(hex, toward, bg, target) {
  let out = hex;
  for (let t = 0; t <= 1.0001; t += 0.04) {
    out = mix(hex, toward, Math.min(1, t));
    if (contrastRatio(hexToRgb(out), bg) >= target) break;
  }
  return out;
}

// Panels are translucent, so the worst background any HUD text can ever sit
// over is a blown-out white photo shining through the plate. Every guarantee
// below is solved against that case — pass here and you pass everywhere else.
const WORST_BG = [255, 255, 255];
const INK_TARGET = 5; // primary text, kept above the 4.5:1 floor for headroom
const DIM_TARGET = 4.5; // WCAG 1.4.3, secondary text
const CONTROL_TARGET = 3; // WCAG 1.4.11, the edge of an interactive control
const ACCENT_TARGET = 4.5; // a label sitting on a filled accent button

/**
 * The CSS custom properties that repaint every button, panel and pill for a
 * theme. Panels stay deliberately dark and translucent even under a bright
 * photo: the terrarium is the subject, and dark chrome keeps its glass and
 * greens readable no matter what is behind it. Only the accent, the tint and
 * the amount of glass change from theme to theme.
 *
 * Every text and control token here is *solved* rather than picked, so no
 * theme — including ones added later — can define chrome that fails contrast.
 * `npm run audit:themes` checks the whole matrix.
 */
export function themeSkin(theme) {
  const accent = theme.accent || "#6d9e4f";
  const tone = theme.tone || "#1a1d1a";
  const lum = typeof theme.lum === "number" ? theme.lum : 0.4;
  // Panel base: the picture's own colour pulled down toward black, so each
  // theme's chrome feels related to its backdrop without ever competing. How
  // far down used to be a flat 0.78, which pulled every world to nearly the
  // same near black and made switching themes look like it only changed the
  // wallpaper. 0.70 lets the tone read — a moonlit blue room gets blue panels.
  // Bright worlds sink further and sit more opaque: a white gallery wall
  // shining through a 0.82 plate used to lift it until the text on top landed
  // at 4.53:1, a rounding error away from failing.
  const glare = Math.max(0, lum - 0.45);
  const panel = mix(tone, "#0e100e", Math.min(0.9, 0.7 + glare * 0.34));
  const panelUp = mix(tone, "#12140f", Math.min(0.76, 0.54 + glare * 0.34));
  const hudA = Math.min(0.94, 0.82 + glare * 0.22);
  const plate = over(panel, hudA, WORST_BG);

  // Text: start from the themed tint, then walk back toward white until it
  // clears the bar over that worst-case plate.
  const ink = toContrast(mix("#ffffff", accent, 0.1), "#ffffff", plate, INK_TARGET);
  const inkDim = toContrast(mix(ink, panel, 0.45), ink, plate, DIM_TARGET);
  // Control edges get their own token: panel hairlines can stay decorative,
  // but the outline of something you can click has to be seen.
  const controlBorder = toContrast(mix(panel, "#ffffff", 0.28), "#ffffff", plate, CONTROL_TARGET);

  // A filled accent button: pick whichever label colour the accent supports
  // best, then nudge the fill itself until that label clears 4.5:1. The hue is
  // preserved, so the theme still looks like itself.
  const darkInk = "#15180f";
  const lightInk = "#f5f6ef";
  const accentRgb = hexToRgb(accent);
  const accentInk =
    contrastRatio(hexToRgb(darkInk), accentRgb) >= contrastRatio(hexToRgb(lightInk), accentRgb)
      ? darkInk
      : lightInk;
  const accentSolid = toContrast(
    accent,
    accentInk === darkInk ? "#ffffff" : "#0f1109",
    hexToRgb(accentInk),
    ACCENT_TARGET,
  );

  return {
    "--accent": accent,
    // The fill for anything that puts --accent-ink on top of it. Same hue as
    // --accent, lightened or darkened only as far as the label needs.
    "--accent-solid": accentSolid,
    "--accent-soft": rgba(accent, 0.85),
    "--accent-dim": rgba(accent, 0.22),
    "--accent-line": rgba(accent, 0.42),
    "--accent-ink": accentInk,
    // Channels + base alpha rather than a finished colour: style.css composes
    // them with --hud-alpha so the comfort slider fades the *plate* and leaves
    // the text alone. It used to fade the whole element, text included, which
    // is why turning the HUD down made it progressively unreadable.
    "--hud-rgb": hexToRgb(panel).join(" "),
    "--hud-a": `${hudA}`,
    "--hud-raised-rgb": hexToRgb(panelUp).join(" "),
    "--hud-solid": panel,
    "--hud-border": rgba(mix(accent, "#ffffff", 0.45), 0.22),
    "--control-border": controlBorder,
    "--ink": ink,
    "--ink-dim": inkDim,
    "--focus": toContrast(mix(accent, "#ffffff", 0.5), "#ffffff", plate, CONTROL_TARGET),
    "--glow": rgba(accent, 0.3),
    // The picture's own average colour, for anything that wants to mix its own
    // shade rather than take a ready-made one — the page behind the canvas
    // wears it, so even the letterbox belongs to the active world.
    "--theme-tone": tone,
  };
}

/** Apply a theme's skin to the document (all UI chrome follows). */
export function applyThemeSkin(theme, root = document.documentElement) {
  const skin = themeSkin(theme);
  for (const [key, value] of Object.entries(skin)) root.style.setProperty(key, value);
  root.dataset.themeGroup = theme.group || "painted";
}
