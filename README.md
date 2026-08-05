# 🌿 Potroneer

Potroneer is a cozy bilingual 3D terrarium builder. Build a little garden inside
a digital glass jar, layer by layer, and make it your own.

Made with [Three.js](https://threejs.org) and [Vite](https://vitejs.dev).

Potroneer also includes a lightweight cozy-game layer: guided objectives, plant
care and growth, XP and unlocks, daily challenges, autosave/restore, synthesized
ambient audio, and touch-friendly camera controls.

The social layer adds accounts, cloud saves, public terrarium sharing, likes,
favorites, remixing, visits, and a daily community challenge. It runs in local
demo mode by default; configure Supabase to make the community shared across
users and devices.

## What you can do

1. **Lay the base.** Pick a substrate — মাটি (soil), বালু (sand), সাদা বালু
   (white sand) or নুড়ি (pebbles) — and tap the jar. Each tap drops one thin
   layer that settles unevenly from the bottom up, like real terrarium
   substrate.
2. **Decorate.** Once there's a base, choose from মস (moss), পাতাগাছ (leafy
   plant), গোলাপি গাছ (pink plant), মাশরুম (mushroom), পাথর (stone) or শামুক
   (snail shell) and tap inside the jar to place it. Everything lands with a
   little random rotation and size so it looks hand-arranged, never gridded.
3. **Admire it.** Drag anywhere to spin the jar. Leave it alone and it slowly
   rotates on its own. Hit **আবার শুরু** to start over.

## How it works

- **`src/scene.js`** — renderer, lighting, image-based environment (for the
  glass), drag-to-rotate with idle auto-spin, and a raycasting helper. Knows
  nothing about terrariums.
- **`src/jar.js`** — the mason-jar silhouette as a revolved `LatheGeometry`,
  rendered with a physically-based transmissive glass material, plus an
  invisible pick-plane used as the click target.
- **`src/builders.js`** — procedural geometry for substrate layers (speckled,
  jittered) and each decoration type.
- **`src/state.js`** — the entire terrarium as a small serialisable model:
  `layers[] = {type, height}` and `decorations[] = {kind, x, z, y, rotation,
  scale}`. The 3D scene is always rebuilt from this, so reset is just emptying
  the arrays.
- **`src/catalog.js`** — the one place that defines every material and its
  colour palette. The tray, the builders and the model all read from it.
- **`src/main.js`** — wires state ↔ scene ↔ tray UI together.

## Run it

```bash
npm install
npm run dev      # opens http://localhost:5173
```

Build for production:

```bash
npm run build
npm run preview
```

## Social setup

1. Create a Supabase project and enable email/password authentication.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor.
3. Copy [`.env.example`](.env.example) to `.env.local` and fill in the project URL and publishable key.
4. Restart Vite. The Community panel will switch from Demo Mode to Cloud.

Without Supabase configuration, Potroneer still supports local demo accounts,
local public-gallery records, likes, favorites, and encoded share links in the
current browser.
