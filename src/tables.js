// The table the terrarium sits on. It is the one piece of furniture in the
// shot and it touches the jar, so it does as much for the mood as the backdrop
// does — a marble pedestal and a rattan side table put the same jar in two
// different homes.
//
// Every entry is procedural, like the plants: a canvas-painted surface plus a
// leg style, not a downloaded model. That keeps a table one small data row
// instead of a multi-megabyte GLB, and keeps it in the same matte, muted family
// as everything else in the scene. `surface` picks the painter in scene.js
// (`wood`, `marble`, `stone`, `rattan`); `legs` picks the understructure.
//
// `tintTake` is how far this table lets the active theme recolour it (0–1).
// Wood happily takes the light of whatever room it is standing in; white marble
// that goes fully green under a jungle photo just reads as broken, so it only
// takes a third of the tint.

export const TABLES = [
  {
    id: "oak", label: "Oak", bn: "ওক",
    surface: "wood", legs: "splay", tintTake: 1,
    top: "#d8bb92", leg: "#b08c62", board: "#e8cfa4",
    rough: 0.72, metal: 0, legRough: 0.78, legMetal: 0,
  },
  {
    id: "walnut", label: "Walnut", bn: "আখরোট",
    surface: "wood", legs: "splay", tintTake: 0.9,
    top: "#8d6141", leg: "#6b4830", board: "#c9a274",
    rough: 0.62, metal: 0, legRough: 0.7, legMetal: 0,
  },
  {
    id: "birch", label: "Pale Birch", bn: "ফ্যাকাশে বার্চ",
    surface: "wood", legs: "splay", tintTake: 1,
    top: "#e7d7bb", leg: "#d2bd9c", board: "#efe2c8",
    rough: 0.8, metal: 0, legRough: 0.82, legMetal: 0,
  },
  {
    id: "marble", label: "White Marble", bn: "সাদা মার্বেল",
    surface: "marble", legs: "pedestal", tintTake: 0.4,
    top: "#ecebe6", leg: "#d5d2ca", board: "#d9c9a8",
    rough: 0.4, metal: 0.04, legRough: 0.44, legMetal: 0.04,
  },
  {
    id: "slate", label: "Dark Slate", bn: "গাঢ় স্লেট",
    surface: "stone", legs: "hairpin", tintTake: 0.5,
    top: "#4c5154", leg: "#2f3335", board: "#8f7a5c",
    rough: 0.62, metal: 0.05, legRough: 0.36, legMetal: 0.8,
  },
  {
    id: "terracotta", label: "Terracotta", bn: "পোড়ামাটি",
    surface: "stone", legs: "pedestal", tintTake: 0.7,
    top: "#b8734f", leg: "#8f5439", board: "#dcb98c",
    rough: 0.86, metal: 0, legRough: 0.88, legMetal: 0,
  },
  {
    id: "rattan", label: "Rattan", bn: "বেতের",
    surface: "rattan", legs: "splay", tintTake: 0.85,
    top: "#cfa96e", leg: "#a57f4c", board: "#e3cb9c",
    rough: 0.88, metal: 0, legRough: 0.86, legMetal: 0,
  },
  {
    id: "steel-ash", label: "Steel & Ash", bn: "স্টিল ও অ্যাশ",
    surface: "wood", legs: "hairpin", tintTake: 0.75,
    top: "#c9c2b4", leg: "#585d61", board: "#cbbca0",
    rough: 0.55, metal: 0.08, legRough: 0.34, legMetal: 0.85,
  },
];

export function tableById(id) {
  return TABLES.find((table) => table.id === id) || TABLES[0];
}
