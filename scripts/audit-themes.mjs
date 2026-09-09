/**
 * Contrast audit for every theme skin.
 *
 * Panels are translucent, so each token is checked as it is actually composited
 * on screen: the plate resolved over the brightest thing that can sit behind it
 * (a blown-out white photo backdrop), then the text resolved over that plate.
 * A theme that passes here passes over every darker world too.
 *
 * Run with `npm run audit:themes`. Exits non-zero on any failure, so adding a
 * theme with unreadable chrome fails the check instead of shipping.
 */
import { THEMES, themeSkin, contrastRatio } from "../src/themes.js";

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
console.log(`\n${THEMES.length} themes × ${CHECKS.length} checks`);
if (failures) {
  console.error(`FAIL: ${failures} contrast check(s) below the WCAG 2.2 minimum`);
  process.exit(1);
}
console.log("PASS: every theme clears WCAG 2.2 AA for text and control edges");
