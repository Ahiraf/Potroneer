// Boot sequence — a console-game style opening: studio logo sting, a short
// three-beat trailer of what the app does, then a title card with the Enter
// button. The markup lives in index.html so it paints before the Three.js
// bundle finishes loading; this module only drives the timeline.
//
// Rules it follows so it never becomes an obstacle:
//   • always skippable (button, Esc, or clicking the backdrop)
//   • only the full version plays once — repeat visits get a ~1.4s logo sting
//   • reduced motion / prefers-reduced-motion → static title card, no animation
//   • sound is opt-in (a gesture is required anyway) and off by default

const SEEN_KEY = "potroneer-intro-seen";

const el = (id) => document.getElementById(id);
const root = el("intro");

let done = false;
let ready = false;
let timers = [];
let audioOn = false;
let audioCtx = null;
const listeners = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}
function at(ms, fn) {
  timers.push(setTimeout(fn, ms));
}

// --- language ---------------------------------------------------------------
// Copy is authored in Bengali in the HTML with an English `data-en` twin, so the
// intro follows the app's language without pulling in the whole i18n table.
function applyLang() {
  let lang = "bn";
  try {
    lang = localStorage.getItem("potroneer-lang") || localStorage.getItem("terrarium-lang") || "bn";
  } catch {
    lang = "bn";
  }
  if (lang !== "en" || !root) return;
  root.querySelectorAll("[data-en]").forEach((node) => {
    node.textContent = node.dataset.en;
  });
}

// --- the sting --------------------------------------------------------------
// A few soft chime tones, synthesized so there are no audio assets to ship.
// Only ever heard after the user taps the speaker button (autoplay rules).
function tone(freq, start, dur, gainPeak = 0.14) {
  const now = audioCtx.currentTime + start;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  gain.connect(audioCtx.destination);
  for (const detune of [0, 5]) {
    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }
}

function chord(kind) {
  if (!audioOn) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  const sets = {
    logo: [
      [523.25, 0, 2.4, 0.12],
      [659.25, 0.12, 2.2, 0.1],
      [783.99, 0.24, 2.6, 0.11],
    ],
    beat: [[880.0, 0, 1.1, 0.07]],
    enter: [
      [659.25, 0, 1.4, 0.1],
      [987.77, 0.1, 1.6, 0.08],
    ],
  };
  (sets[kind] || sets.beat).forEach(([f, s, d, g]) => tone(f, s, d, g));
}

// --- drifting motes ---------------------------------------------------------
function seedMotes(count = 18) {
  const host = el("intro-motes");
  if (!host) return;
  for (let i = 0; i < count; i++) {
    const mote = document.createElement("i");
    mote.style.left = `${Math.random() * 100}%`;
    mote.style.top = `${40 + Math.random() * 60}%`;
    mote.style.setProperty("--drift", `${-60 - Math.random() * 140}px`);
    mote.style.setProperty("--sway", `${Math.random() * 60 - 30}px`);
    mote.style.animationDelay = `${Math.random() * 6}s`;
    mote.style.animationDuration = `${7 + Math.random() * 7}s`;
    mote.style.opacity = `${0.25 + Math.random() * 0.45}`;
    host.appendChild(mote);
  }
}

// --- timeline ---------------------------------------------------------------
function showAct(name) {
  if (!root) return;
  root.dataset.phase = name;
  root.querySelectorAll(".intro-act").forEach((act) => {
    act.classList.toggle("is-active", act.dataset.act === name);
  });
}

function armTitle() {
  showAct("title");
  const bar = el("intro-progress-bar");
  if (bar) bar.style.width = "100%";
  refreshReady();
}

function refreshReady() {
  const start = el("intro-start");
  const loading = el("intro-loading");
  if (!start) return;
  if (ready) {
    start.disabled = false;
    start.classList.add("is-ready");
    loading?.classList.add("is-hidden");
  }
}

function runFull(calm) {
  const beats = [
    ["logo", 0],
    ["beat1", 2900],
    ["beat2", 5200],
    ["beat3", 7500],
  ];
  if (calm) {
    // No motion budget for a trailer — go straight to the title card.
    armTitle();
    return;
  }
  seedMotes();
  const bar = el("intro-progress-bar");
  beats.forEach(([name, ms], i) => {
    at(ms, () => {
      showAct(name);
      chord(i === 0 ? "logo" : "beat");
      if (bar) bar.style.width = `${(i / beats.length) * 82}%`;
    });
  });
  at(9700, armTitle);
}

function runShort(calm) {
  if (!calm) seedMotes(10);
  showAct("logo");
  chord("logo");
  at(calm ? 400 : 1500, () => {
    // Returning visitor: no title card, just hand them the studio.
    if (ready) finish();
    else {
      armTitle();
      root?.classList.add("is-express");
    }
  });
}

function finish() {
  if (done || !root) return;
  done = true;
  clearTimers();
  chord("enter");
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — the intro just plays again next time */
  }
  root.classList.add("is-leaving");
  document.body.classList.remove("intro-open");
  setTimeout(() => {
    root.classList.add("hidden");
    root.querySelectorAll(".intro-act").forEach((a) => a.classList.remove("is-active"));
  }, 620);
  listeners.forEach((fn) => {
    try {
      fn({ audioOn });
    } catch {
      /* a listener must never keep the intro on screen */
    }
  });
}

function wire() {
  el("intro-skip")?.addEventListener("click", finish);
  el("intro-start")?.addEventListener("click", finish);
  el("intro-audio")?.addEventListener("click", (event) => {
    event.stopPropagation();
    audioOn = !audioOn;
    const btn = event.currentTarget;
    btn.textContent = audioOn ? "🔊" : "🔇";
    btn.setAttribute("aria-pressed", String(audioOn));
    btn.classList.toggle("is-on", audioOn);
    if (audioOn) chord("beat");
  });
  root?.addEventListener("click", (event) => {
    // Clicking anywhere on the backdrop advances — but only once the title card
    // is up, so a stray click doesn't eat the trailer the user wanted to see.
    if (event.target.closest("button")) return;
    if (root.dataset.phase === "title") finish();
  });
  window.addEventListener("keydown", (event) => {
    if (done) return;
    if (event.key === "Escape") finish();
    if ((event.key === "Enter" || event.key === " ") && root?.dataset.phase === "title") finish();
  });
}

/** Called by main.js once the scene is actually usable. */
export function introReady() {
  ready = true;
  refreshReady();
  if (root?.classList.contains("is-express")) finish();
}

/** Run a callback when the intro is dismissed (returns `{ audioOn }`). */
export function onIntroDone(fn) {
  if (done) fn({ audioOn });
  else listeners.push(fn);
}

/** Play the full trailer again on demand (More ▸ ইন্ট্রো). */
export function replayIntro() {
  if (!root) return;
  done = false;
  clearTimers();
  root.classList.remove("hidden", "is-leaving", "is-express");
  document.body.classList.add("intro-open");
  const bar = el("intro-progress-bar");
  if (bar) bar.style.width = "0%";
  const start = el("intro-start");
  if (start) start.disabled = false;
  runFull(isCalm());
}

function isCalm() {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  try {
    return JSON.parse(localStorage.getItem("potroneer-comfort") || "{}").reducedMotion === true;
  } catch {
    return false;
  }
}

export function startIntro() {
  if (!root) return;
  // The module booted, so the "bundle never ran" escape hatch is no longer
  // needed — the timeline below owns the overlay from here on.
  clearTimeout(window.__introFailsafe);
  applyLang();
  wire();
  const calm = isCalm();
  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    seen = false;
  }
  if (seen) runShort(calm);
  else runFull(calm);
}
