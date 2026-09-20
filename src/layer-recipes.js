export const CLASSIC_STACK = [
  { id: "leca", mm: 25 },
  { id: "sphagnum", mm: 6 },
  { id: "charcoal", mm: 7 },
  { id: "soil", mm: 35 },
];

export const RAINBOW_STACK = [
  { id: "pebbles", mm: 12 },
  ...["violet", "turquoise", "emerald", "gold", "amber", "coral"].map(color => ({ id: `sand-${color}`, mm: 4 })),
  { id: "charcoal", mm: 4 },
  { id: "soil", mm: 22 },
];

// Visual layer recipes inspired by the supplied photos. Thin accent sands
// are separate editable bands; these are design presets, not care advice.
const striped = (accent, dressing) => [
  {id:"gravel-black",mm:8}, {id:"forest-soil",mm:12},
  {id:accent,mm:2}, {id:"forest-soil",mm:5},
  {id:accent,mm:2}, {id:"forest-soil",mm:17}, {id:dressing,mm:4},
];
export const REFERENCE_STACKS = {
  lime: {label:"সবুজ জোড়া দাগ", steps:striped("sand-lime","gravel-black")},
  blush: {label:"গোলাপি জোড়া দাগ", steps:striped("sand-blush","gravel-ivory")},
  ember: {label:"লাল জোড়া দাগ", steps:striped("sand-coral","gravel-honey")},
  woodland: {label:"বনমাটির স্তর", steps:[
    {id:"gravel-honey",mm:8},{id:"forest-soil",mm:14},
    {id:"sand-amber",mm:3},{id:"forest-soil",mm:21},{id:"gravel-rust",mm:4},
  ]},
};
