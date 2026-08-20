// Gentle generative ambience — sparse wind-chime plucks on a pentatonic scale,
// synthesized with WebAudio so there are no audio assets to load. Starts only
// on user gesture (browser autoplay rules) via the sound toggle.

const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66]; // C pentatonic-ish
let ctx = null;
let master = null;
let timer = null;
let playing = false;
// 0..1, the level the user set on the fader. Kept separate from `playing` so
// muting and un-muting restores the volume they chose rather than a default.
let volume = 0.5;

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function pluck() {
  const now = ctx.currentTime;
  const freq = NOTES[(Math.random() * NOTES.length) | 0];
  const dur = 2.6 + Math.random() * 1.8;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16 + Math.random() * 0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  gain.connect(master);

  // two slightly detuned sines make it shimmer like a real chime
  for (const detune of [0, 4]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  }
}

function schedule() {
  timer = setTimeout(() => {
    if (!playing) return;
    pluck();
    if (Math.random() < 0.3) setTimeout(pluck, 250 + Math.random() * 300); // occasional double-strike
    schedule();
  }, 2800 + Math.random() * 5200);
}

export function toggleAmbience() {
  if (playing) {
    playing = false;
    clearTimeout(timer);
    master?.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
    return false;
  }
  ensureAudio();
  master.gain.setValueAtTime(volume, ctx.currentTime);
  playing = true;
  pluck();
  schedule();
  return true;
}

/** Set the output level (0–1). Takes effect immediately when sound is on. */
export function setVolume(value) {
  volume = Math.min(1, Math.max(0, Number(value) || 0));
  if (playing && master) master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.08);
  return volume;
}

export function getVolume() {
  return volume;
}

export function isPlaying() {
  return playing;
}

// Short, quiet interaction sounds keep the editor feeling physical without
// requiring audio assets. They are intentionally gated by the ambience toggle
// so a silent session stays completely silent.
export function playSfx(kind = "tap") {
  if (!playing) return;
  ensureAudio();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  const settings = {
    plop: [220, 120, 0.16, 0.16],
    water: [420, 660, 0.1, 0.12],
    mist: [760, 980, 0.07, 0.08],
    unlock: [520, 1040, 0.3, 0.18],
    save: [360, 540, 0.12, 0.1],
  }[kind] ?? [360, 420, 0.08, 0.08];
  osc.type = kind === "water" || kind === "mist" ? "sine" : "triangle";
  osc.frequency.setValueAtTime(settings[0], now);
  osc.frequency.exponentialRampToValueAtTime(settings[1], now + settings[2]);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(settings[3], now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + settings[2] + 0.12);
  osc.connect(gain);
  gain.connect(master);
  osc.start(now);
  osc.stop(now + settings[2] + 0.16);
}
