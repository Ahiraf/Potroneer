// Potroneer's small, deterministic game layer. The editor remains the source
// of truth for the terrarium; this module owns progression, care simulation,
// tutorials, daily challenges, and the player profile.

export const GAME_KEY = "potroneer-game";
export const AUTOSAVE_KEY = "potroneer-autosave";

export const PLANT_KINDS = new Set([
  "moss",
  "mossball",
  "bonsai",
  "snakeplant",
  "leafy",
  "fern",
  "pink",
  "succulent",
  "airplant",
  "cactus",
  "flowers",
  "pilea",
  "pothos",
  "calathea",
  "venusflytrap",
  "saguaro",
  "pricklypear",
  "pincushion",
]);

// Items become available through play, while a small starter set keeps the
// first session immediately creative rather than feeling like a shop screen.
export const UNLOCKS = [
  { kind: "fern", level: 2 },
  { kind: "mushroom", level: 2 },
  { kind: "bonsai", level: 3 },
  { kind: "flowers", level: 3 },
  { kind: "crystal", level: 4 },
  { kind: "butterfly", level: 4 },
  { kind: "frog", level: 5 },
  { kind: "house", level: 5 },
  { kind: "pond", level: 6 },
  { kind: "deer", level: 7 },
  { kind: "geode", level: 8 },
];

export const TUTORIAL_STEPS = [
  {
    id: "drainage",
    title: "Lay the first layer",
    bn: "প্রথম স্তর দাও",
    body: "Start your garden with pebbles, LECA, or sand.",
    bodyBn: "নুড়ি, লেকা বা বালু দিয়ে বাগানের শুরু করো।",
    action: "layer",
  },
  {
    id: "soil",
    title: "Make a home for roots",
    bn: "শিকড়ের ঘর বানাও",
    body: "Add soil so your plants have somewhere to grow.",
    bodyBn: "গাছের বেড়ে ওঠার জন্য মাটি যোগ করো।",
    action: "soil",
  },
  {
    id: "plant",
    title: "Plant something green",
    bn: "সবুজ কিছু বসাও",
    body: "Choose a plant or moss and place it in the jar.",
    bodyBn: "একটি গাছ বা মস বেছে জারে বসাও।",
    action: "plant",
  },
  {
    id: "water",
    title: "Give it a drink",
    bn: "একটু পানি দাও",
    body: "Use the water tool to keep the soil alive.",
    bodyBn: "মাটি সতেজ রাখতে পানি টুল ব্যবহার করো।",
    action: "water",
  },
  {
    id: "mist",
    title: "Mist the glass",
    bn: "কাচে স্প্রে করো",
    body: "Add a little humidity with the spray tool.",
    bodyBn: "স্প্রে টুল দিয়ে একটু আর্দ্রতা যোগ করো।",
    action: "mist",
  },
  {
    id: "light",
    title: "Turn on a grow light",
    bn: "গ্রো লাইট চালু করো",
    body: "Open Customize jar and switch on the light.",
    bodyBn: "জার কাস্টমাইজ খুলে আলো চালু করো।",
    action: "light",
  },
];

export const DAILY_CHALLENGES = [
  {
    id: "moss-garden",
    title: "Create a moss garden",
    titleBn: "একটি মস বাগান বানাও",
    body: "Place three moss pieces in one terrarium.",
    bodyBn: "একটি টেরারিয়ামে তিনটি মস বসাও।",
    target: 3,
    reward: 120,
  },
  {
    id: "layered-earth",
    title: "Layered earth",
    titleBn: "স্তরে স্তরে মাটি",
    body: "Build four substrate layers.",
    bodyBn: "চারটি বেস স্তর তৈরি করো।",
    target: 4,
    reward: 110,
  },
  {
    id: "green-corner",
    title: "A green corner",
    titleBn: "সবুজ কোণ",
    body: "Place four plants or moss pieces.",
    bodyBn: "চারটি গাছ বা মস বসাও।",
    target: 4,
    reward: 140,
  },
  {
    id: "rainy-day",
    title: "Rainy day",
    titleBn: "বৃষ্টির দিন",
    body: "Water your terrarium five times.",
    bodyBn: "টেরারিয়ামে পাঁচবার পানি দাও।",
    target: 5,
    reward: 100,
  },
  {
    id: "balanced-garden",
    title: "Balanced garden",
    titleBn: "সুষম বাগান",
    body: "Bring plant health above 75%.",
    bodyBn: "গাছের স্বাস্থ্য ৭৫%-এর ওপরে নাও।",
    target: 0.75,
    reward: 160,
  },
];

export const ACHIEVEMENTS = [
  { id: "first-leaf", title: "First Leaf", bn: "প্রথম পাতা", desc: "Place your first plant.", descBn: "প্রথম গাছ বসাও।", icon: "🌱" },
  { id: "caregiver", title: "Gentle Care", bn: "যত্নশীল", desc: "Water your terrarium for the first time.", descBn: "প্রথমবার টেরারিয়ামে পানি দাও।", icon: "💧" },
  { id: "mist-maker", title: "Mist Maker", bn: "কুয়াশার কারিগর", desc: "Mist the glass for the first time.", descBn: "প্রথমবার কাচে স্প্রে করো।", icon: "🌫️" },
  { id: "night-gardener", title: "Night Gardener", bn: "রাতের মালী", desc: "Turn on a grow light.", descBn: "একটি গ্রো লাইট চালু করো।", icon: "💡" },
  { id: "weather-watcher", title: "Weather Watcher", bn: "আবহাওয়া পর্যবেক্ষক", desc: "Choose a weather effect.", descBn: "একটি আবহাওয়া বেছে নাও।", icon: "🌦️" },
  { id: "theme-tour", title: "Theme Collector", bn: "থিম সংগ্রাহক", desc: "Explore a themed world.", descBn: "একটি থিমের পৃথিবী ঘুরে দেখো।", icon: "🎨" },
  { id: "photographer", title: "Tiny Photographer", bn: "ছোট্ট ফটোগ্রাফার", desc: "Capture a filtered photo.", descBn: "ফিল্টার দিয়ে একটি ছবি তোলো।", icon: "📸" },
  { id: "community-gardener", title: "Community Gardener", bn: "কমিউনিটি মালী", desc: "Publish a terrarium.", descBn: "একটি টেরারিয়াম প্রকাশ করো।", icon: "🌐" },
  { id: "remixer", title: "Remix Artist", bn: "রিমিক্স শিল্পী", desc: "Remix another terrarium.", descBn: "অন্যের টেরারিয়াম রিমিক্স করো।", icon: "🪴" },
  { id: "visitor", title: "Garden Visitor", bn: "বাগান অতিথি", desc: "Visit another terrarium.", descBn: "অন্য একটি টেরারিয়াম ভিজিট করো।", icon: "🚪" },
  { id: "team-gardener", title: "Team Gardener", bn: "দলবদ্ধ মালী", desc: "Join a co-op garden.", descBn: "একটি কো-অপ বাগানে যোগ দাও।", icon: "🤝" },
  { id: "evolved", title: "Living Ecosystem", bn: "জীবন্ত বাস্তুতন্ত্র", desc: "Grow your terrarium to stage four.", descBn: "টেরারিয়ামকে চতুর্থ ধাপে বড় করো।", icon: "🌳" },
];

const STARTER_KINDS = ["moss", "mossball", "leafy", "succulent", "airplant", "stone"];
const ACTION_XP = { layer: 12, plant: 24, water: 10, mist: 10, light: 8, save: 6 };
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function challengeForDay(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return DAILY_CHALLENGES[Math.abs(hash) % DAILY_CHALLENGES.length];
}

export function xpForLevel(level) {
  const n = Math.max(0, level - 1);
  return n * 100 + (n * Math.max(0, n - 1) * 25);
}

export function levelForXp(xp) {
  let level = 1;
  while (level < 99 && xp >= xpForLevel(level + 1)) level++;
  return level;
}

function baseGameState() {
  return {
    version: 2,
    xp: 0,
    level: 1,
    tutorialIndex: 0,
    care: {
      water: 0.52,
      humidity: 0.46,
      light: 0.48,
      soil: 0.32,
      health: 0.72,
      growth: 0,
    },
    counters: { layer: 0, plant: 0, water: 0, mist: 0, light: 0, save: 0 },
    rewardAt: {},
    lastSim: Date.now(),
    createdAt: Date.now(),
    ageDays: 0,
    evolutionStage: 0,
    achievements: {},
    theme: "leaf-shadow-wall",
    season: "spring",
    weather: "clear",
    cosmeticPack: "starter",
    challenge: null,
  };
}

export function createGameState(saved = {}) {
  const base = baseGameState();
  const game = {
    ...base,
    ...saved,
    care: { ...base.care, ...(saved.care ?? {}) },
    counters: { ...base.counters, ...(saved.counters ?? {}) },
    rewardAt: { ...(saved.rewardAt ?? {}) },
    achievements: { ...(saved.achievements ?? {}) },
  };
  game.level = levelForXp(Number(game.xp) || 0);
  ensureDailyChallenge(game);
  return game;
}

export function loadGameState() {
  try {
    return createGameState(JSON.parse(localStorage.getItem(GAME_KEY) || "{}"));
  } catch {
    return createGameState();
  }
}

export function loadAutosave() {
  try {
    return JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveGameState(game) {
  localStorage.setItem(GAME_KEY, JSON.stringify(game));
}

export function saveAutosave(payload) {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() }));
}

export function hydrateGameState(target, saved) {
  const next = createGameState(saved);
  Object.keys(next).forEach((key) => {
    target[key] = next[key];
  });
  return target;
}

function ensureDailyChallenge(game) {
  const today = dateKey();
  if (game.challenge?.date === today) return;
  const def = challengeForDay(today);
  game.challenge = {
    date: today,
    id: def.id,
    progress: 0,
    completed: false,
    claimed: false,
  };
}

export function getChallenge(game) {
  ensureDailyChallenge(game);
  return DAILY_CHALLENGES.find((c) => c.id === game.challenge.id) ?? DAILY_CHALLENGES[0];
}

export function getTutorial(game) {
  return TUTORIAL_STEPS[Math.min(game.tutorialIndex, TUTORIAL_STEPS.length - 1)] ?? null;
}

export function isTutorialComplete(game) {
  return game.tutorialIndex >= TUTORIAL_STEPS.length;
}

export function isKindUnlocked(game, kind) {
  if (STARTER_KINDS.includes(kind)) return true;
  const unlock = UNLOCKS.find((entry) => entry.kind === kind);
  return !unlock || game.level >= unlock.level;
}

export function unlockedKinds(game) {
  return new Set([
    ...STARTER_KINDS,
    ...UNLOCKS.filter((entry) => game.level >= entry.level).map((entry) => entry.kind),
  ]);
}

function tutorialMatches(game, action) {
  const step = getTutorial(game);
  if (!step) return false;
  if (step.id === "soil") return action.type === "layer" && action.value === "soil";
  if (step.action !== action.type) return false;
  if (step.id === "plant") return PLANT_KINDS.has(action.value);
  return true;
}

function challengeProgress(game, metrics) {
  const id = getChallenge(game).id;
  if (id === "moss-garden") return metrics.mossCount;
  if (id === "layered-earth") return metrics.layerCount;
  if (id === "green-corner") return metrics.plantCount;
  if (id === "rainy-day") return game.counters.water;
  if (id === "balanced-garden") return game.care.health;
  return 0;
}

export function refreshChallenge(game, metrics) {
  const def = getChallenge(game);
  game.challenge.progress = Math.min(def.target, challengeProgress(game, metrics));
  if (!game.challenge.completed && game.challenge.progress >= def.target) {
    game.challenge.completed = true;
    return true;
  }
  return false;
}

export function claimChallengeReward(game) {
  if (!game.challenge?.completed || game.challenge.claimed) return 0;
  const reward = getChallenge(game).reward;
  game.challenge.claimed = true;
  game.xp += reward;
  game.level = levelForXp(game.xp);
  return reward;
}

export function simulateCare(game, metrics, now = Date.now()) {
  ensureDailyChallenge(game);
  const elapsedHours = clamp((now - (game.lastSim || now)) / 3600000, 0, 0.25);
  if (elapsedHours <= 0) return false;
  game.lastSim = now;

  const care = game.care;
  care.water = clamp(care.water - elapsedHours * 0.12);
  care.humidity = clamp(care.humidity - elapsedHours * 0.08);
  care.light = clamp(care.light + ((metrics.lightOn ? 0.9 : 0.42) - care.light) * elapsedHours * 2);
  const soilTarget = metrics.hasSoil ? 0.7 : 0.28;
  care.soil = clamp(care.soil + (soilTarget - care.soil) * elapsedHours * 1.5);

  const waterBalance = 1 - Math.abs(care.water - 0.62) / 0.62;
  const humidityBalance = 1 - Math.abs(care.humidity - 0.58) / 0.58;
  const lightBalance = 1 - Math.abs(care.light - 0.68) / 0.68;
  const targetHealth = clamp(
    0.15 + care.soil * 0.24 + waterBalance * 0.24 + humidityBalance * 0.18 + lightBalance * 0.19,
  );
  care.health = clamp(care.health + (targetHealth - care.health) * Math.min(1, elapsedHours * 2.5));
  if (metrics.plantCount > 0 && care.health > 0.55) {
    care.growth = clamp(care.growth + (care.health - 0.5) * elapsedHours * 0.025);
  }
  game.ageDays = Math.max(0, (now - (game.createdAt || now)) / 86400000);
  game.evolutionStage = Math.min(4, Math.floor(care.growth * 4 + game.ageDays / 14));
  refreshChallenge(game, metrics);
  return true;
}

export function unlockAchievement(game, id, now = Date.now()) {
  if (!ACHIEVEMENTS.some((achievement) => achievement.id === id) || game.achievements?.[id]) return false;
  game.achievements[id] = now;
  return true;
}

export function achievementList(game) {
  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: Boolean(game.achievements?.[achievement.id]),
    unlockedAt: game.achievements?.[achievement.id] ?? null,
  }));
}

export function achievementCount(game) {
  return Object.keys(game.achievements ?? {}).length;
}

export function recordGameAction(game, action, metrics, now = Date.now()) {
  ensureDailyChallenge(game);
  simulateCare(game, metrics, now);
  const type = action.type;
  game.counters[type] = (game.counters[type] || 0) + 1;

  // Continuous water/mist strokes stay rewarding without turning into an XP
  // exploit from pointermove frequency.
  const rewardCooldown = type === "water" || type === "mist" ? 5000 : 0;
  const lastReward = game.rewardAt[type] || 0;
  const xpEarned = now - lastReward >= rewardCooldown ? ACTION_XP[type] || 0 : 0;
  if (xpEarned) {
    game.rewardAt[type] = now;
    game.xp += xpEarned;
  }

  const oldLevel = game.level;
  game.level = levelForXp(game.xp);
  const tutorialAdvanced = tutorialMatches(game, action);
  if (tutorialAdvanced) game.tutorialIndex++;

  const challengeCompleted = refreshChallenge(game, metrics);
  const challengeXp = claimChallengeReward(game);
  return {
    xpEarned: xpEarned + challengeXp,
    levelUp: game.level > oldLevel,
    tutorialAdvanced,
    challengeCompleted,
  };
}

export function progressPercent(game) {
  const current = xpForLevel(game.level);
  const next = xpForLevel(game.level + 1);
  return clamp((game.xp - current) / Math.max(1, next - current)) * 100;
}
