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

The advanced world layer adds selectable themes (Wizarding Hall, Astronomy,
Jungle, Urban Town, Green Village, Cherry Blossom, Floating Grove, Spider City,
Lantern Village, Alpine Valley, and Caucasus Valley), seasons, day/night cycles, weather, animated
critters, real-time evolution stages, filtered photo mode, achievements,
cosmetic packs, and live co-op building rooms.

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
- **`src/themes.js`** and **`src/effects.js`** — theme presets, seasons, weather,
  animated insects/small animals, and lightweight scene effects.

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
3. Copy [`.env.example`](.env.example) to `.env` and fill in the project URL and publishable key.
4. Restart Vite. The Community panel will switch from Demo Mode to Cloud.

Without Supabase configuration, Potroneer still supports local demo accounts,
local public-gallery records, likes, favorites, and encoded share links in the
current browser. Co-op is the one feature with no offline stand-in — a room that
silently syncs with nobody is worse than being told it needs a project behind
it, so it says so.

## Co-op setup

Two people, one jar, over Supabase Realtime. Everything below fits inside the
free tier, and there is no server to run: Vercel serves the static build,
Supabase does auth, storage and the websocket.

### 1. Database

Run [`supabase/schema.sql`](supabase/schema.sql). Re-running it is safe — every
statement is `create ... if not exists`, `create or replace`, or a `drop policy
if exists` before the policy. It adds:

| Object | Purpose |
| --- | --- |
| `coop_rooms` | code, owner, latest `build`/`game` state, `revision` |
| `coop_room_members` | room ↔ user, primary key on both |
| `create_coop_room()` | allocates a free code and adds you as owner + member |
| `join_coop_room(code)` | validates the code and adds you, in one definer call |
| `save_coop_state(...)` | atomic state write with a revision bump |
| `leave_coop_room(id)` | drops your membership, deletes the room if empty |
| `is_coop_member*()` | `security definer` membership tests used by the policies |

### 2. Realtime

Realtime is on by default for new Supabase projects. Co-op uses **broadcast and
presence only** — it does not listen to `postgres_changes`, so no table needs
adding to the `supabase_realtime` publication.

### 3. Private channel authorization

This is the part that makes the rooms actually private, and it is the last two
policies in the schema file. Supabase authorizes a private channel with RLS on
`realtime.messages`: the policies check the channel topic (`coop:ABC123`)
against your room membership, so knowing a room code is not enough to listen in
— you have to have been let into the room. Confirm after running the schema:

```sql
select policyname from pg_policies
 where schemaname = 'realtime' and tablename = 'messages';
-- expect: Co-op members can read room messages
--         Co-op members can write room messages
```

If those are missing, private channels refuse every subscription and co-op will
report "Not allowed to join that room."

### 4. Auth redirect URLs

Supabase ▸ Authentication ▸ URL Configuration:

- **Site URL** — your production origin, e.g. `https://potroneer.vercel.app`
- **Redirect URLs** — add the same origin, plus
  `https://*-your-team.vercel.app` if you want preview deployments to be able
  to confirm email links.

### 5. Vercel

Vercel ▸ Project ▸ Settings ▸ Environment Variables, for Production *and*
Preview:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your publishable (anon) key |

Vite inlines `VITE_*` variables at build time, so **redeploy after changing
them** — editing a variable does not update an existing build.

Only ever use the publishable key here. Anything in a `VITE_*` variable is
compiled into the bundle and readable by anyone who opens the page; the
service-role key bypasses RLS and would hand over every room in the project.

### How it behaves

- **Guests** can build everything, forever. Pressing Co-op explains why an
  account is needed and opens the sign-in sheet, then returns to what you were
  doing. Your local jar is stashed on the way into a room and handed back when
  you leave.
- **Snapshots** are sent on committed actions — a finished sculpt stroke, a
  placed decoration, a watering — not per frame. Each carries a sender id and a
  monotonic revision; an older revision arriving late is ignored rather than
  undoing newer work.
- **Late joiners and refreshes** read the room's stored state, so you open into
  the garden as it is rather than an empty jar.
- **Conflicts** are last-committed-wins with revision protection, which is the
  right amount of machinery for two people who are talking to each other.

### Testing it

Two browser profiles, two accounts:

1. `npm run build && npm run preview` (or use the Vercel URL).
2. Window A: Co-op ▸ Create a room, copy the code.
3. Window B: sign in as the second account, Co-op ▸ paste code ▸ Join.
4. Both should show **Connected** and a member count of 2.
5. Add a base layer in A; it should appear in B within a second.
6. Place and drag decorations in both; change a theme; water the jar.
7. Refresh B — it should reconnect and recover the current jar.
8. Leave in B; A's member count should drop to 1.
9. From a third account, try joining with the same code: it should be refused
   as full. Try a made-up code: "No room with that code."
