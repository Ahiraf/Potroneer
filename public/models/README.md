# Real 3D models (optional)

Drop CC0/licensed `.glb` files here to replace the procedural geometry with
photo-textured models. Recognised filenames:

deer.glb, butterfly.glb, ladybug.glb, snail.glb, fern.glb, snakeplant.glb,
mushroom.glb, driftwood.glb, stone.glb, succulent.glb

## Per-variant models

A file named after a *kind* is used for every variant of that kind, so one
`leafy.glb` makes পাতাগাছ · সবুজ / হালকা / লালচে all render identically. To give
a variant its own model, name the file after the variant's catalog id instead:

leafy.glb        → all leafy variants (fallback)
leafy-1.glb      → only পাতাগাছ · হালকা
leafy-2.glb      → only পাতাগাছ · লালচে

The id-specific file always wins. Ids are `kind`, `kind-1`, `kind-2`… in the
order the variants are declared in `src/catalog.js`. Only kinds already listed
above are scanned for variant files — nothing else needs registering.

If a kind's variants differ mainly by colour and you only have one model, it is
usually better to delete the kind-level `.glb` and let the procedural builder
keep the variants distinct.

Good free sources: polyhaven.com (models), sketchfab.com (filter: downloadable
+ CC0), quaternius.com. Export/convert to glTF-Binary (.glb) with textures
embedded. Any file present is auto-loaded at startup and normalised to the
right size; anything missing falls back to the built-in procedural version.
