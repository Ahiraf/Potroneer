# assets-src

Original theme photographs, renamed from the raw upload dump to the theme slug
they belong to. Every one is at least 2000px across — a source smaller than that
reads as a blurry wall once the camera leans in, which is why the original
736px-wide set was retired. They are **not** served: `public/themes/` holds the
derived assets the app actually loads.

**Only the first 30 are in git.** The 138 added on 2026-09-13 are listed in
`.gitignore`: 365MB of originals is more history than they earn, on the same
reasoning as the GLB rooms. A clean clone still builds and runs — the derived
backdrops and thumbnails in `public/themes/` are committed — but re-deriving one
of those themes means fetching its photo from Unsplash again to
`assets-src/themes/<slug>.jpg` first. Anything dropped in here is capped at
3200px on the way in; nothing downstream reads more than 2560.

`make-theme-assets.py` regenerates those derivatives from this folder's twin in
`public/` — run it from the repo root:

```
python3 assets-src/make-theme-assets.py > /tmp/themes.json
```

It writes, per theme:

- `public/themes/<slug>.jpg` — backdrop up to 2560×1440, cover-cropped and never
  upscaled (per-photo vertical focus lives in the `FOCUS` table so a portrait
  source's subject survives the 16:9 crop)
- `public/themes/<slug>-thumb.jpg` — 480×300 preview for the theme picker

and prints the palette JSON (`accent` / `tone` / `lum`) that is pasted into the
`PHOTO` list in `src/themes.js`. Those three numbers are what let the UI re-skin
itself and let the scene decide how far to knock each backdrop back.
