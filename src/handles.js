import * as THREE from "three";

// ---------------------------------------------------------------------------
// Grab handles
// ---------------------------------------------------------------------------
// Pottery Master puts little dots on the clay: before you touch anything, the
// object has already told you where it can be taken hold of. Potroneer's placed
// pieces have always been draggable, but nothing said so. These are those dots
// — one hovering over every planted piece while the tweezers are out, with the
// one under the cursor swelling to say "this is the one you'd pick up".

function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.42, "rgba(255,255,255,0.9)");
  g.addColorStop(0.62, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(c);
}

export function createHandles(max = 140) {
  const group = new THREE.Group();
  group.name = "grabHandles";
  group.visible = false;

  const map = makeDotTexture();
  const sprites = [];
  for (let i = 0; i < max; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
      }),
    );
    sprite.visible = false;
    sprite.renderOrder = 4;
    group.add(sprite);
    sprites.push(sprite);
  }

  let count = 0;
  let hovered = -1;
  let alive = false;
  let fade = 0;

  function setColor(hex) {
    sprites.forEach((s) => s.material.color.set(hex));
  }

  /**
   * Point the handles at the current pieces.
   * `points` is [{x, y, z}] in the same space as this group's parent.
   */
  function sync(points) {
    count = Math.min(points.length, sprites.length);
    for (let i = 0; i < count; i++) {
      const p = points[i];
      sprites[i].position.set(p.x, p.y + (p.lift ?? 0.16), p.z);
    }
    for (let i = count; i < sprites.length; i++) sprites[i].visible = false;
  }

  /** Which handle the cursor is over (-1 for none) — it swells and brightens. */
  function setHovered(index) {
    hovered = index;
  }

  function show() {
    alive = true;
    group.visible = true;
  }

  function hide() {
    alive = false;
  }

  function update(now, dt) {
    if (!group.visible) return;
    const want = alive && count > 0 ? 1 : 0;
    fade += (want - fade) * Math.min(1, dt / 140);
    if (fade < 0.02 && !want) {
      group.visible = false;
      fade = 0;
      return;
    }
    const breath = 1 + Math.sin(now * 0.003) * 0.08;
    for (let i = 0; i < count; i++) {
      const s = sprites[i];
      const isHover = i === hovered;
      s.visible = true;
      const size = (isHover ? 0.17 : 0.092) * breath * (0.5 + fade * 0.5);
      s.scale.set(size, size, 1);
      s.material.opacity = (isHover ? 0.95 : 0.55) * fade;
    }
  }

  return { group, sync, setHovered, setColor, show, hide, update };
}
