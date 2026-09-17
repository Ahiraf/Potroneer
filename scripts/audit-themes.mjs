/**
 * Asset and contrast audit for every theme skin.
 *
 * Panels are translucent, so each token is checked as it is actually composited
 * on screen: the plate resolved over the brightest thing that can sit behind it
 * (a blown-out white photo backdrop), then the text resolved over that plate.
 * A theme that passes here passes over every darker world too.
 *
 * Run with `npm run audit:themes`. Exits non-zero on any asset or contrast
 * failure, so adding a broken theme fails the check instead of shipping.
 */
import fs from "node:fs";
import path from "node:path";
import { THEMES, themePhoto, themeThumb, themeSkin, contrastRatio } from "../src/themes.js";

const WORST_BG = [255, 255, 255];

function parse(value) {
  if (value.startsWith("#")) {
    const h = value.slice(1);
    return [[0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), 1];
  }
  const inner = value.match(/\(([^)]+)\)/)[1];
  const parts = inner.includes("/")
    ? [...inner.split("/")[0].trim().split(/[\s,]+/), inner.split("/")[1].trim()]
    : inner.split(",").map((s) => s.trim());
  return [parts.slice(0, 3).map(Number), parts[3] === undefined ? 1 : Number(parts[3])];
}
const over = ([rgb, a], bg) => rgb.map((v, i) => v * a + bg[i] * (1 - a));

// Read JPEG dimensions without depending on ImageMagick or a native image
// library. This keeps the audit usable in CI and makes the asset contract
// explicit: the picker may use a small thumbnail, but the scene must receive
// the matching full-size image.
function jpegSize(file) {
  const bytes = fs.readFileSync(file);
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    while (bytes[i] === 0xff) i++;
    const marker = bytes[i++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = bytes.readUInt16BE(i);
    const isSize =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSize) return { width: bytes.readUInt16BE(i + 5), height: bytes.readUInt16BE(i + 3) };
    i += length;
  }
  return null;
}

const ASSET_ROOT = path.resolve("public/themes");
const assetFailures = [];
const assetWarnings = [];
for (const theme of THEMES) {
  if (!theme.photo) continue;
  const full = path.join(ASSET_ROOT, path.basename(themePhoto(theme)));
  const thumb = path.join(ASSET_ROOT, path.basename(themeThumb(theme)));
  if (!fs.existsSync(full)) {
    assetFailures.push(`${theme.id}: missing full-size image ${path.basename(full)}`);
  } else {
    const size = jpegSize(full);
    if (!size) assetFailures.push(`${theme.id}: unreadable full-size image ${path.basename(full)}`);
    else {
      if (size.width < 1600 || size.height < 900) {
        assetFailures.push(`${theme.id}: full-size image is only ${size.width}×${size.height}`);
      } else if (size.width < 2000 || size.height < 1100) {
        assetWarnings.push(`${theme.id}: lower-resolution source ${size.width}×${size.height}`);
      }
      const ratio = size.width / size.height;
      if (Math.abs(ratio - 16 / 9) > 0.02) {
        assetFailures.push(`${theme.id}: full-size image has unexpected aspect ratio ${ratio.toFixed(3)}`);
      }
    }
  }
  if (!fs.existsSync(thumb)) {
    assetFailures.push(`${theme.id}: missing picker thumbnail ${path.basename(thumb)}`);
  } else {
    const size = jpegSize(thumb);
    if (!size) assetFailures.push(`${theme.id}: unreadable picker thumbnail ${path.basename(thumb)}`);
    else if (size.width !== 480 || size.height !== 300) {
      assetFailures.push(`${theme.id}: thumbnail is ${size.width}×${size.height}, expected 480×300`);
    }
  }
}

// The checks, as [label, foreground token, background, WCAG minimum].
const CHECKS = [
  ["ink on plate", "--ink", "plate", 4.5],
  ["ink-dim on plate", "--ink-dim", "plate", 4.5],
  ["control border", "--control-border", "plate", 3],
  ["focus ring", "--focus", "plate", 3],
  ["accent-ink on fill", "--accent-ink", "--accent-solid", 4.5],
];

let failures = 0;
const rows = [];
for (const theme of THEMES) {
  const skin = themeSkin(theme);
  const plate = over(
    [skin["--hud-rgb"].split(" ").map(Number), Number(skin["--hud-a"])],
    WORST_BG,
  );
  const row = { id: theme.id, results: [] };
  for (const [label, fgKey, bgKey, min] of CHECKS) {
    const bg = bgKey === "plate" ? plate : over(parse(skin[bgKey]), plate);
    const fg = over(parse(skin[fgKey]), bg);
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= min;
    if (!pass) failures++;
    row.results.push({ label, ratio, min, pass });
  }
  rows.push(row);
}

const worst = (r) => Math.min(...r.results.map((x) => x.ratio / x.min));
rows.sort((a, b) => worst(a) - worst(b));
console.log(
  "theme".padEnd(32) + CHECKS.map(([l]) => l.padStart(18)).join(""),
);
for (const row of rows) {
  const cells = row.results
    .map((r) => `${r.pass ? " " : "!"}${r.ratio.toFixed(2)}/${r.min}`.padStart(18))
    .join("");
  console.log(row.id.padEnd(32) + cells);
}
console.log(`\n${THEMES.length} themes × ${CHECKS.length} contrast checks`);
console.log(`ASSETS: ${THEMES.filter((theme) => theme.photo).length} photo themes checked`);
for (const warning of assetWarnings) console.warn(`WARN: ${warning}`);
if (assetFailures.length) {
  for (const failure of assetFailures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
if (failures) {
  console.error(`FAIL: ${failures} contrast check(s) below the WCAG 2.2 minimum`);
  process.exit(1);
}
console.log("PASS: every theme clears WCAG 2.2 AA for text and control edges");
