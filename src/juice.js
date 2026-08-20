// Lightweight DOM "juice": toasts, floating +XP text, and confetti bursts.
// Everything here is pure DOM/CSS layered over the 3D canvas, so it stays crisp,
// never touches the render loop, and honours the comfort "reduced motion"
// setting (bursts/floaters go quiet, toasts stay so feedback is never lost).

let host = null;
function layer() {
  if (!host) {
    host = document.createElement("div");
    host.className = "juice-layer";
    document.body.appendChild(host);
  }
  return host;
}

function calm() {
  return document.body.classList.contains("reduced-motion");
}

// A small badge that slides in from the top-centre for level-ups, challenges,
// achievements — the "something good happened" beat.
export function toast(text, { icon = "✨", tone = "default", duration = 2600 } = {}) {
  const el = document.createElement("div");
  el.className = `toast toast--${tone}`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-text"></span>`;
  el.querySelector(".toast-text").textContent = text;
  layer().appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  const life = calm() ? Math.min(duration, 1800) : duration;
  setTimeout(() => {
    el.classList.remove("is-in");
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 420);
  }, life);
  return el;
}

// A "+12 XP" style number that drifts up and fades from a screen point.
export function floatText(text, x, y, tone = "xp") {
  if (calm()) return;
  const el = document.createElement("div");
  el.className = `float-text float-text--${tone}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer().appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// A quick confetti pop from a screen point — used for the big celebratory beats.
export function burst(x, y, { count = 20, colors, spread = 130 } = {}) {
  if (calm()) return;
  const palette = colors || ["#79a963", "#f0c36a", "#e88fb0", "#7bc3bd", "#f5f2e8"];
  const h = layer();
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.className = "confetti";
    const angle = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.8);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = palette[i % palette.length];
    p.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(angle) * dist - 40}px`);
    p.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    p.style.animationDelay = `${Math.random() * 70}ms`;
    if (Math.random() < 0.4) p.style.borderRadius = "50%";
    h.appendChild(p);
    setTimeout(() => p.remove(), 1150);
  }
}

// Fly a little ghost of an item from a source element to a target element —
// used when an item is added to the build tray so the action reads physically.
export function flyTo(fromEl, toEl, imgSrc) {
  if (calm() || !fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  const ghost = document.createElement("img");
  ghost.className = "fly-ghost";
  ghost.src = imgSrc;
  ghost.style.left = `${a.left + a.width / 2 - 20}px`;
  ghost.style.top = `${a.top + a.height / 2 - 20}px`;
  layer().appendChild(ghost);
  requestAnimationFrame(() => {
    ghost.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(0.35)`;
    ghost.style.opacity = "0.2";
  });
  setTimeout(() => ghost.remove(), 560);
  toEl.classList.remove("bump");
  void toEl.offsetWidth; // restart the keyframe
  toEl.classList.add("bump");
}

// Centre-top of the viewport, where celebratory bursts read best.
export function centerTop() {
  return { x: window.innerWidth / 2, y: Math.min(220, window.innerHeight * 0.28) };
}

// The moment of contact. Every action that touches the terrarium — a layer
// poured, water tipped in, a stroke of the sculpting tool — gets the same
// beat, so the whole app answers a press in one voice instead of some things
// answering and some things not.
export function impact(x, y, { size = 46, tone = "earth" } = {}) {
  if (calm()) return;
  const el = document.createElement("div");
  el.className = `impact impact--${tone}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.setProperty("--impact-size", `${size}px`);
  layer().appendChild(el);
  setTimeout(() => el.remove(), 620);
}
