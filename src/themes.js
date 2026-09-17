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
  { id: "sacred", label: "Sanctuaries", bn: "উপাসনালয়", icon: "\u{1F54C}" },
  { id: "palace", label: "Palaces", bn: "প্রাসাদ", icon: "\u{1F451}" },
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

  // --- second batch, added 2026-09-13 ---------------------------------------
  // 138 more photographs, weighted heavily toward sacred interiors, palaces and
  // windows. Two new groups carry them: anything else would have left "Places"
  // holding two thirds of the whole catalogue behind one tab.
  { id: "aurora-lake", label: "Aurora Lake", bn: "মেরুজ্যোতির হ্রদ", group: "nature", photo: true, mood: "space", weather: "stars", pack: "cosmic", accent: "#4ebb98", tone: "#305058", lum: 0.289 },
  { id: "golden-maples", label: "Golden Maples", bn: "সোনালি ম্যাপল", group: "nature", photo: true, mood: "day", weather: "leaves", pack: "village", accent: "#e09e29", tone: "#b28659", lum: 0.55 },
  { id: "autumn-leaf-glow", label: "Autumn Leaf", bn: "শরতের পাতা", group: "nature", photo: true, mood: "dusk", weather: "leaves", pack: "village", accent: "#d66d33", tone: "#ae8a5c", lum: 0.559 },
  { id: "frozen-bubble", label: "Frozen Bubble", bn: "বরফের বুদবুদ", group: "nature", photo: true, mood: "mountain", weather: "snow", pack: "alpine", accent: "#5177b8", tone: "#677ba3", lum: 0.477 },
  { id: "golden-jali-screen", label: "Golden Screen", bn: "সোনালি জালি", group: "window", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#c37d46", tone: "#a27d57", lum: 0.511 },
  { id: "shrine-window-dark", label: "Shrine Window", bn: "মাজারের জানালা", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "wizarding", accent: "#389ad1", tone: "#161716", lum: 0.09 },
  { id: "durbar-hall", label: "Durbar Hall", bn: "দরবার হল", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#51b8b6", tone: "#787c74", lum: 0.481 },
  { id: "arched-shopfront", label: "Arched Shopfront", bn: "খিলানের দোকান", group: "window", photo: true, mood: "town", weather: "clear", pack: "urban", accent: "#b87851", tone: "#796c61", lum: 0.431 },
  { id: "starlit-colonnade", label: "Starlit Colonnade", bn: "তারার স্তম্ভশ্রেণি", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#cba679", tone: "#94795d", lum: 0.488 },
  { id: "palm-columns", label: "Palm Columns", bn: "পামের স্তম্ভ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#d29537", tone: "#ab9c81", lum: 0.617 },
  { id: "gilded-dome", label: "Gilded Dome", bn: "সোনালি গম্বুজ", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#cc7f3d", tone: "#c28e55", lum: 0.583 },
  { id: "blue-mosque-glass", label: "Blue Mosque Glass", bn: "নীল মসজিদের কাচ", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#b87851", tone: "#746559", lum: 0.404 },
  { id: "white-mosque-hall", label: "White Mosque", bn: "সাদা মসজিদ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#c4a66f", tone: "#c0bcb6", lum: 0.739 },
  { id: "turquoise-dome", label: "Turquoise Dome", bn: "ফিরোজা গম্বুজ", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#29bae0", tone: "#156a7b", lum: 0.35 },
  { id: "sunray-arcade", label: "Sunray Arcade", bn: "রোদের বারান্দা", group: "window", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b98f50", tone: "#423829", lum: 0.225 },
  { id: "studio-grid-window", label: "Studio Window", bn: "স্টুডিও জানালা", group: "cozy", photo: true, mood: "studio", weather: "clear", pack: "starter", accent: "#d0a48b", tone: "#666769", lum: 0.403 },
  { id: "cherry-sprig", label: "Cherry Sprig", bn: "চেরির ডাল", group: "bloom", photo: true, mood: "blossom", weather: "petals", pack: "blossom", accent: "#d0a18b", tone: "#b2b6b5", lum: 0.71 },
  { id: "marble-stair-hall", label: "Marble Stair Hall", bn: "মার্বেল সিঁড়ি", group: "cozy", photo: true, mood: "studio", weather: "clear", pack: "starter", accent: "#b89551", tone: "#91856a", lum: 0.523 },
  { id: "red-vault-passage", label: "Red Vault", bn: "লাল খিলানপথ", group: "palace", photo: true, mood: "dusk", weather: "sparkle", pack: "lantern", accent: "#d84331", tone: "#240908", lum: 0.058 },
  { id: "carved-wood-hall", label: "Carved Wood Hall", bn: "কাঠের কারুকাজ", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#c66943", tone: "#5d3323", lum: 0.231 },
  { id: "stained-arch-hall", label: "Stained Arch Hall", bn: "রঙিন খিলানের হল", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b87051", tone: "#8c807f", lum: 0.512 },
  { id: "muqarnas-vault", label: "Muqarnas Vault", bn: "মুকারনাস ছাদ", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#b87b51", tone: "#403c3b", lum: 0.239 },
  { id: "muqarnas-oculus", label: "Muqarnas Oculus", bn: "গম্বুজের চোখ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#7088c4", tone: "#5b5a5e", lum: 0.353 },
  { id: "lantern-prayer-hall", label: "Lantern Hall", bn: "লণ্ঠনের হল", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#cc743d", tone: "#1b120b", lum: 0.076 },
  { id: "stucco-lacework", label: "Stucco Lacework", bn: "পলেস্তারার জাল", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#d0b18b", tone: "#797068", lum: 0.445 },
  { id: "zellij-alcove", label: "Zellij Alcove", bn: "জেলিজ কুলুঙ্গি", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b87f51", tone: "#b19075", lum: 0.586 },
  { id: "bookshelf-window", label: "Bookshelf Window", bn: "বইয়ের তাক", group: "cozy", photo: true, mood: "library", weather: "clear", pack: "starter", accent: "#b89251", tone: "#71755f", lum: 0.45 },
  { id: "white-arch-stair", label: "White Arch Stair", bn: "সাদা খিলানের সিঁড়ি", group: "cozy", photo: true, mood: "day", weather: "clear", pack: "starter", accent: "#b87c51", tone: "#9d958e", lum: 0.59 },
  { id: "bougainvillea-door", label: "Bougainvillea Door", bn: "বোগেনভিলিয়ার দরজা", group: "window", photo: true, mood: "beach", weather: "breeze", pack: "starter", accent: "#8ba8d0", tone: "#6c6a71", lum: 0.42 },
  { id: "moorish-gold-hall", label: "Moorish Gold Hall", bn: "মূরিশ সোনালি হল", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#c09459", tone: "#b58e61", lum: 0.576 },
  { id: "stone-arcade-walk", label: "Stone Arcade", bn: "পাথরের বারান্দা", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#ba8357", tone: "#847060", lum: 0.453 },
  { id: "fuji-pagoda", label: "Fuji Pagoda", bn: "ফুজি প্যাগোডা", group: "places", photo: true, mood: "mountain", weather: "clear", pack: "alpine", accent: "#6ba0c8", tone: "#62767b", lum: 0.448 },
  { id: "fan-vault", label: "Fan Vault", bn: "গথিক পাখা-ছাদ", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "wizarding", accent: "#b89251", tone: "#8e8d86", lum: 0.553 },
  { id: "old-town-window", label: "Old Town Window", bn: "পুরোনো শহরের জানালা", group: "window", photo: true, mood: "town", weather: "clear", pack: "urban", accent: "#85b1d1", tone: "#4b4844", lum: 0.284 },
  { id: "wooden-mosque-ring", label: "Wooden Mosque", bn: "কাঠের মসজিদ", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#bd764c", tone: "#856249", lum: 0.406 },
  { id: "cedar-pillar-hall", label: "Cedar Pillars", bn: "সিডার স্তম্ভ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#cc7a3e", tone: "#8b7155", lum: 0.457 },
  { id: "saffron-passage", label: "Saffron Passage", bn: "জাফরানি পথ", group: "palace", photo: true, mood: "dusk", weather: "sparkle", pack: "lantern", accent: "#e06e29", tone: "#c17910", lum: 0.504 },
  { id: "gothic-stone-hall", label: "Gothic Hall", bn: "গথিক হল", group: "magic", photo: true, mood: "library", weather: "sparkle", pack: "wizarding", accent: "#d07e39", tone: "#986e45", lum: 0.456 },
  { id: "lone-tree-snow", label: "Lone Tree in Snow", bn: "বরফে একলা গাছ", group: "nature", photo: true, mood: "mountain", weather: "snow", pack: "alpine", accent: "#8c968c", tone: "#eaeaea", lum: 0.919 },
  { id: "autumn-bay-window", label: "Autumn Bay Window", bn: "শরতের জানালা", group: "window", photo: true, mood: "day", weather: "leaves", pack: "village", accent: "#d19e39", tone: "#75643f", lum: 0.397 },
  { id: "alpine-sill-flowers", label: "Alpine Sill", bn: "পাহাড়ের জানালা", group: "window", photo: true, mood: "mountain", weather: "breeze", pack: "alpine", accent: "#d37537", tone: "#534b40", lum: 0.298 },
  { id: "painted-parlour", label: "Painted Parlour", bn: "আঁকা বৈঠকখানা", group: "cozy", photo: true, mood: "day", weather: "clear", pack: "starter", accent: "#b87651", tone: "#755a45", lum: 0.37 },
  { id: "lattice-room-mono", label: "Lattice Room", bn: "জালির ঘর", group: "places", photo: true, mood: "studio", weather: "clear", pack: "urban", accent: "#8c968c", tone: "#757575", lum: 0.458 },
  { id: "haveli-doorway", label: "Haveli Doorway", bn: "হাভেলির দরজা", group: "palace", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#d0933a", tone: "#4b3619", lum: 0.222 },
  { id: "palace-chamber", label: "Palace Chamber", bn: "প্রাসাদ কক্ষ", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#c58e44", tone: "#3f2d14", lum: 0.184 },
  { id: "jade-palace-corridor", label: "Jade Corridor", bn: "জেড বারান্দা", group: "palace", photo: true, mood: "dusk", weather: "sparkle", pack: "lantern", accent: "#c29447", tone: "#3c422b", lum: 0.247 },
  { id: "frescoed-chamber", label: "Frescoed Chamber", bn: "চিত্রিত কক্ষ", group: "palace", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#cd923c", tone: "#76542a", lum: 0.346 },
  { id: "cobalt-dome", label: "Cobalt Dome", bn: "নীল গম্বুজ", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#6462bf", tone: "#8b7f96", lum: 0.514 },
  { id: "green-glass-windows", label: "Green Glass Windows", bn: "সবুজ কাচের জানালা", group: "window", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#c47645", tone: "#7b6243", lum: 0.397 },
  { id: "brick-column-hall", label: "Brick Columns", bn: "ইটের স্তম্ভ", group: "sacred", photo: true, mood: "dusk", weather: "mist", pack: "lantern", accent: "#bd974c", tone: "#574a2d", lum: 0.293 },
  { id: "sunlit-lattice-door", label: "Sunlit Lattice Door", bn: "রোদে ভরা দরজা", group: "window", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#c67c43", tone: "#bc9264", lum: 0.594 },
  { id: "aged-dome-chandelier", label: "Aged Dome", bn: "পুরোনো গম্বুজ", group: "sacred", photo: true, mood: "dusk", weather: "sparkle", pack: "lantern", accent: "#b88d51", tone: "#82715b", lum: 0.452 },
  { id: "emerald-tilework", label: "Emerald Tilework", bn: "পান্না টাইল", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#b88e51", tone: "#65563d", lum: 0.342 },
  { id: "stained-stone-window", label: "Stained Stone Window", bn: "পাথরের রঙিন জানালা", group: "window", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#ba7f4f", tone: "#6e5032", lum: 0.33 },
  { id: "jewelled-dark-hall", label: "Jewelled Hall", bn: "রত্নখচিত হল", group: "palace", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#b89851", tone: "#4c3f26", lum: 0.252 },
  { id: "white-gold-muqarnas", label: "White Gold Muqarnas", bn: "সাদা-সোনালি মুকারনাস", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#c1a468", tone: "#b9b093", lum: 0.689 },
  { id: "pale-arch-hall", label: "Pale Arch Hall", bn: "ফ্যাকাশে খিলান হল", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "lantern", accent: "#bda25c", tone: "#aeafa5", lum: 0.683 },
  { id: "ottoman-divan-room", label: "Ottoman Divan", bn: "উসমানি বৈঠক", group: "cozy", photo: true, mood: "library", weather: "clear", pack: "lantern", accent: "#c08c4a", tone: "#846c51", lum: 0.436 },
  { id: "lakeside-study", label: "Lakeside Study", bn: "হ্রদের পাঠকক্ষ", group: "cozy", photo: true, mood: "day", weather: "breeze", pack: "starter", accent: "#c37946", tone: "#705a47", lum: 0.366 },
  { id: "river-stone-window", label: "River Window", bn: "নদীর জানালা", group: "window", photo: true, mood: "valley", weather: "breeze", pack: "caucasus", accent: "#5e9fbd", tone: "#7a8884", lum: 0.521 },
  { id: "blue-coffered-nave", label: "Blue Coffered Nave", bn: "নীল ছাদের গির্জা", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "wizarding", accent: "#5173b8", tone: "#888883", lum: 0.533 },
  { id: "alabaster-columns", label: "Alabaster Columns", bn: "শ্বেতপাথরের স্তম্ভ", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#5c80bc", tone: "#4f4e4c", lum: 0.306 },
  { id: "indigo-nave", label: "Indigo Nave", bn: "নীল প্রার্থনাকক্ষ", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "wizarding", accent: "#2a2ddf", tone: "#646179", lum: 0.39 },
  { id: "rudbeckia-field", label: "Golden Daisies", bn: "সোনালি ডেইজি", group: "bloom", photo: true, mood: "garden", weather: "petals", pack: "village", accent: "#df902a", tone: "#85541a", lum: 0.353 },
  { id: "dark-ferns", label: "Dark Ferns", bn: "গাঢ় ফার্ন", group: "nature", photo: true, mood: "garden", weather: "mist", pack: "jungle", accent: "#3bce76", tone: "#031407", lum: 0.059 },
  { id: "lilac-blooms", label: "Lilac Blooms", bn: "বেগুনি ফুল", group: "bloom", photo: true, mood: "garden", weather: "petals", pack: "blossom", accent: "#b851b8", tone: "#6e5a72", lum: 0.377 },
  { id: "night-prayer-glass", label: "Night Prayer Glass", bn: "রাতের রঙিন কাচ", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#b88e51", tone: "#1c1b16", lum: 0.106 },
  { id: "brick-gothic-nave", label: "Brick Gothic Nave", bn: "ইটের গথিক গির্জা", group: "sacred", photo: true, mood: "library", weather: "clear", pack: "wizarding", accent: "#b88b51", tone: "#9f8d79", lum: 0.562 },
  { id: "bright-grid-window", label: "Bright Grid Window", bn: "উজ্জ্বল জানালা", group: "window", photo: true, mood: "studio", weather: "clear", pack: "starter", accent: "#82c3d9", tone: "#aeb2aa", lum: 0.693 },
  { id: "sunlit-book-shelf", label: "Sunlit Shelf", bn: "রোদে ভরা তাক", group: "cozy", photo: true, mood: "day", weather: "clear", pack: "starter", accent: "#b97c50", tone: "#6d5a4b", lum: 0.364 },
  { id: "chapel-green-drapes", label: "Chapel Drapes", bn: "গির্জার পর্দা", group: "sacred", photo: true, mood: "dusk", weather: "sparkle", pack: "wizarding", accent: "#be8e4c", tone: "#8c6d44", lum: 0.44 },
  { id: "mosque-courtyard-dusk", label: "Mosque Courtyard", bn: "মসজিদের উঠোন", group: "sacred", photo: true, mood: "dusk", weather: "clear", pack: "lantern", accent: "#cb9b50", tone: "#998668", lum: 0.532 },
  { id: "grand-mosque-gold", label: "Grand Mosque", bn: "বড় মসজিদ", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#b87c51", tone: "#86725e", lum: 0.459 },
  { id: "conservatory-pines", label: "Conservatory Pines", bn: "কাচঘরের পাইন", group: "window", photo: true, mood: "day", weather: "breeze", pack: "starter", accent: "#b87b51", tone: "#676e63", lum: 0.421 },
  { id: "blue-hydrangea", label: "Blue Hydrangea", bn: "নীল হাইড্রেঞ্জা", group: "bloom", photo: true, mood: "garden", weather: "petals", pack: "blossom", accent: "#4e74bb", tone: "#5d779e", lum: 0.456 },
  { id: "vaulted-water-tunnel", label: "Vaulted Water Tunnel", bn: "জলের সুড়ঙ্গ", group: "sacred", photo: true, mood: "dusk", weather: "mist", pack: "lantern", accent: "#e07729", tone: "#472810", lum: 0.177 },
  { id: "emerald-door", label: "Emerald Door", bn: "পান্না দরজা", group: "palace", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#e06929", tone: "#1c1d15", lum: 0.11 },
  { id: "harbour-gothic-window", label: "Harbour Window", bn: "বন্দরের জানালা", group: "window", photo: true, mood: "day", weather: "breeze", pack: "starter", accent: "#b87a51", tone: "#6e665c", lum: 0.403 },
  { id: "pink-daisies", label: "Pink Daisies", bn: "গোলাপি ডেইজি", group: "bloom", photo: true, mood: "garden", weather: "petals", pack: "blossom", accent: "#eb9470", tone: "#b48063", lum: 0.538 },
  { id: "blue-shutters", label: "Blue Shutters", bn: "নীল শাটার", group: "window", photo: true, mood: "beach", weather: "breeze", pack: "starter", accent: "#297de0", tone: "#5f80a4", lum: 0.484 },
  { id: "rose-window-glass", label: "Rose Window", bn: "গোলাপ জানালা", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#da5e2f", tone: "#5e4034", lum: 0.273 },
  { id: "crimson-carpet-hall", label: "Crimson Carpet Hall", bn: "লাল গালিচার হল", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#e07029", tone: "#82450d", lum: 0.306 },
  { id: "teal-iwan", label: "Teal Iwan", bn: "ফিরোজা ইওয়ান", group: "sacred", photo: true, mood: "dusk", weather: "sparkle", pack: "lantern", accent: "#b8b451", tone: "#474937", lum: 0.281 },
  { id: "spanish-synagogue", label: "Spanish Synagogue", bn: "স্প্যানিশ সিনাগগ", group: "magic", photo: true, mood: "library", weather: "sparkle", pack: "wizarding", accent: "#c17348", tone: "#6d472c", lum: 0.303 },
  { id: "white-prayer-hall", label: "White Prayer Hall", bn: "সাদা প্রার্থনাকক্ষ", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "lantern", accent: "#b88e51", tone: "#5d5a54", lum: 0.353 },
  { id: "bathhouse-pool", label: "Bathhouse Pool", bn: "হাম্মামের চৌবাচ্চা", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#c67443", tone: "#a1734b", lum: 0.478 },
  { id: "carved-mihrab", label: "Carved Mihrab", bn: "খোদাই মিহরাব", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#bd7e4c", tone: "#59402b", lum: 0.266 },
  { id: "rose-stone-court", label: "Rose Stone Court", bn: "গোলাপি পাথরের উঠোন", group: "places", photo: true, mood: "dusk", weather: "clear", pack: "lantern", accent: "#c47245", tone: "#5e4132", lum: 0.276 },
  { id: "white-stucco-room", label: "White Stucco Room", bn: "সাদা পলেস্তারার ঘর", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "lantern", accent: "#b87a51", tone: "#88776d", lum: 0.479 },
  { id: "bosphorus-porthole", label: "Bosphorus Porthole", bn: "বসফরাসের গোল জানালা", group: "window", photo: true, mood: "beach", weather: "breeze", pack: "urban", accent: "#bb764e", tone: "#4a423b", lum: 0.263 },
  { id: "domed-white-mosque", label: "Domed White Mosque", bn: "সাদা গম্বুজ মসজিদ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#bc945b", tone: "#615952", lum: 0.352 },
  { id: "azure-vault", label: "Azure Vault", bn: "আকাশি ছাদ", group: "sacred", photo: true, mood: "night", weather: "sparkle", pack: "wizarding", accent: "#4590c4", tone: "#45413b", lum: 0.257 },
  { id: "stone-rotunda", label: "Stone Rotunda", bn: "পাথরের গোলঘর", group: "sacred", photo: true, mood: "dusk", weather: "sparkle", pack: "wizarding", accent: "#b87651", tone: "#645246", lum: 0.332 },
  { id: "empty-ballroom", label: "Empty Ballroom", bn: "খালি নাচঘর", group: "cozy", photo: true, mood: "dusk", weather: "clear", pack: "starter", accent: "#b87851", tone: "#87654a", lum: 0.416 },
  { id: "mint-mirror-room", label: "Mint Mirror Room", bn: "পুদিনা আয়নাঘর", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#b89251", tone: "#817e60", lum: 0.488 },
  { id: "mosaic-starburst", label: "Mosaic Starburst", bn: "মোজাইক তারা", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#3eadcb", tone: "#84988c", lum: 0.577 },
  { id: "stucco-facade", label: "Stucco Facade", bn: "পলেস্তারার সম্মুখ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b87951", tone: "#635349", lum: 0.336 },
  { id: "mountain-lake-window", label: "Mountain Lake Window", bn: "পাহাড়ি হ্রদের জানালা", group: "window", photo: true, mood: "mountain", weather: "breeze", pack: "alpine", accent: "#d3b788", tone: "#5e6262", lum: 0.382 },
  { id: "pale-stone-arch", label: "Pale Stone Arch", bn: "ফ্যাকাশে পাথরের খিলান", group: "sacred", photo: true, mood: "studio", weather: "clear", pack: "lantern", accent: "#ca9e7d", tone: "#a98f78", lum: 0.577 },
  { id: "timber-ceiling-lamp", label: "Timber Ceiling", bn: "কাঠের ছাদ", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#c37d4a", tone: "#a37d5b", lum: 0.511 },
  { id: "carpet-library-hall", label: "Carpet Library", bn: "গালিচার পাঠাগার", group: "cozy", photo: true, mood: "library", weather: "clear", pack: "lantern", accent: "#c87a48", tone: "#b3876f", lum: 0.56 },
  { id: "open-book-pages", label: "Open Pages", bn: "খোলা পাতা", group: "cozy", photo: true, mood: "library", weather: "clear", pack: "starter", accent: "#c28048", tone: "#51371e", lum: 0.231 },
  { id: "autumn-lake-mirror", label: "Autumn Lake", bn: "শরতের হ্রদ", group: "nature", photo: true, mood: "dusk", weather: "leaves", pack: "village", accent: "#d27137", tone: "#895524", lum: 0.362 },
  { id: "courtyard-green-window", label: "Courtyard Green", bn: "উঠোনের সবুজ", group: "window", photo: true, mood: "garden", weather: "breeze", pack: "jungle", accent: "#b85b51", tone: "#848079", lum: 0.503 },
  { id: "purple-orchid", label: "Purple Orchid", bn: "বেগুনি অর্কিড", group: "bloom", photo: true, mood: "night", weather: "glow", pack: "blossom", accent: "#d829e0", tone: "#32132f", lum: 0.109 },
  { id: "lattice-silhouette", label: "Lattice Silhouette", bn: "জালির ছায়া", group: "places", photo: true, mood: "night", weather: "clear", pack: "urban", accent: "#8c968c", tone: "#343434", lum: 0.204 },
  { id: "chandelier-durbar", label: "Chandelier Durbar", bn: "ঝাড়বাতির দরবার", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#cb693e", tone: "#4a2b1d", lum: 0.19 },
  { id: "rainbow-arch-doors", label: "Rainbow Arch Doors", bn: "রঙধনু খিলান", group: "palace", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#be774b", tone: "#573f2b", lum: 0.26 },
  { id: "sky-through-arch", label: "Sky Through the Arch", bn: "খিলানে আকাশ", group: "places", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#6aa3ea", tone: "#0c0604", lum: 0.029 },
  { id: "colonial-fan-hall", label: "Colonial Hall", bn: "ঔপনিবেশিক হল", group: "places", photo: true, mood: "studio", weather: "clear", pack: "urban", accent: "#c29148", tone: "#5c5855", lum: 0.348 },
  { id: "kyoto-dusk-pagoda", label: "Kyoto Dusk", bn: "কিয়োটোর গোধূলি", group: "places", photo: true, mood: "dusk", weather: "petals", pack: "blossom", accent: "#bc574e", tone: "#717177", lum: 0.443 },
  { id: "tiled-ottoman-room", label: "Tiled Ottoman Room", bn: "টাইলের উসমানি ঘর", group: "cozy", photo: true, mood: "library", weather: "clear", pack: "lantern", accent: "#b87f51", tone: "#7d705f", lum: 0.446 },
  { id: "forest-torii", label: "Forest Torii", bn: "বনের তোরি", group: "places", photo: true, mood: "garden", weather: "mist", pack: "jungle", accent: "#51b8b4", tone: "#43574e", lum: 0.322 },
  { id: "saffron-courtyard", label: "Saffron Courtyard", bn: "জাফরানি উঠোন", group: "palace", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#c7a066", tone: "#725f4c", lum: 0.383 },
  { id: "striped-moorish-stair", label: "Striped Stairwell", bn: "ডোরাকাটা সিঁড়ি", group: "palace", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b85951", tone: "#70524c", lum: 0.344 },
  { id: "fanlight-window", label: "Fanlight Window", bn: "পাখা-জানালা", group: "window", photo: true, mood: "day", weather: "clear", pack: "starter", accent: "#bd894c", tone: "#6e5338", lum: 0.339 },
  { id: "riad-corridor", label: "Riad Corridor", bn: "রিয়াদের বারান্দা", group: "cozy", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#8bb1d0", tone: "#85888b", lum: 0.533 },
  { id: "dusk-fog-window", label: "Dusk Fog Window", bn: "কুয়াশার গোধূলি", group: "window", photo: true, mood: "dusk", weather: "mist", pack: "starter", accent: "#b87351", tone: "#2c251e", lum: 0.149 },
  { id: "jade-carved-door", label: "Jade Carved Door", bn: "জেড খোদাই দরজা", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#43c69c", tone: "#617c72", lum: 0.459 },
  { id: "carpet-glass-room", label: "Carpet and Glass", bn: "গালিচা ও কাচ", group: "cozy", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#b87951", tone: "#1d1a10", lum: 0.102 },
  { id: "golden-sea-door", label: "Golden Sea Door", bn: "সোনালি সাগরের দরজা", group: "window", photo: true, mood: "beach", weather: "breeze", pack: "starter", accent: "#c48c46", tone: "#90734f", lum: 0.465 },
  { id: "turquoise-courtyard", label: "Turquoise Courtyard", bn: "ফিরোজা উঠোন", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#51b4b8", tone: "#7c827b", lum: 0.503 },
  { id: "fjord-cabin-window", label: "Fjord Cabin Window", bn: "ফিয়র্ডের জানালা", group: "window", photo: true, mood: "valley", weather: "mist", pack: "caucasus", accent: "#6d9fc3", tone: "#32332b", lum: 0.197 },
  { id: "peacock-hall", label: "Peacock Hall", bn: "ময়ূর হল", group: "palace", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#4abebf", tone: "#303732", lum: 0.209 },
  { id: "marble-mosque-walk", label: "Marble Walk", bn: "মার্বেলের পথ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b87c51", tone: "#7f5d40", lum: 0.386 },
  { id: "snow-treeline", label: "Snow Treeline", bn: "বরফের গাছসারি", group: "nature", photo: true, mood: "mountain", weather: "snow", pack: "alpine", accent: "#eb8d70", tone: "#d7b8ba", lum: 0.749 },
  { id: "ring-chandelier-hall", label: "Ring Chandelier", bn: "বলয় ঝাড়বাতি", group: "sacred", photo: true, mood: "lantern", weather: "lanterns", pack: "lantern", accent: "#b88f51", tone: "#6e635a", lum: 0.395 },
  { id: "green-window-mosque", label: "Green Window Mosque", bn: "সবুজ জানালার মসজিদ", group: "sacred", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b89d51", tone: "#6c674c", lum: 0.402 },
  { id: "fountain-courtyard", label: "Fountain Courtyard", bn: "ঝর্ণার উঠোন", group: "places", photo: true, mood: "day", weather: "clear", pack: "lantern", accent: "#b87a51", tone: "#99938a", lum: 0.579 },
  { id: "painted-romanesque", label: "Painted Basilica", bn: "চিত্রিত ব্যাসিলিকা", group: "sacred", photo: true, mood: "library", weather: "sparkle", pack: "wizarding", accent: "#b87d51", tone: "#857261", lum: 0.457 },
  { id: "sunset-bedroom-sea", label: "Sunset Bedroom", bn: "সূর্যাস্তের শোবার ঘর", group: "cozy", photo: true, mood: "beach", weather: "breeze", pack: "starter", accent: "#b86b51", tone: "#66463f", lum: 0.299 },
  { id: "golden-mirror-hall", label: "Golden Mirror Hall", bn: "সোনালি আয়না হল", group: "sacred", photo: true, mood: "lantern", weather: "sparkle", pack: "lantern", accent: "#daad30", tone: "#6a551a", lum: 0.333 },
  { id: "mosaic-door-night", label: "Mosaic Door", bn: "মোজাইক দরজা", group: "palace", photo: true, mood: "night", weather: "sparkle", pack: "lantern", accent: "#d17038", tone: "#36291f", lum: 0.168 },
  { id: "three-arch-lookout", label: "Three Arch Lookout", bn: "তিন খিলানের দৃশ্য", group: "window", photo: true, mood: "night", weather: "mist", pack: "alpine", accent: "#518bb8", tone: "#101211", lum: 0.069 },
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
