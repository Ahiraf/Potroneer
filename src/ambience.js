// Gentle generative ambience — sparse wind-chime plucks on a pentatonic scale,
// synthesized with WebAudio so there are no audio assets to load. Starts only
// on user gesture (browser autoplay rules) via the sound toggle.

const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66]; // C pentatonic-ish
let ctx = null;
let master = null;
let timer = null;
let playing = false;

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
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  ctx.resume();
  master.gain.setValueAtTime(0.5, ctx.currentTime);
  playing = true;
  pluck();
  schedule();
  return true;
}
