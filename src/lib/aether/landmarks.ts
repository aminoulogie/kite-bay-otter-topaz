export const FACE = {
  glabella: 8,
  nasion: 168,
  noseTip: 1,
  noseBottom: 2,
  subnasale: 94,
  upperLip: 13,
  lowerLip: 14,
  chin: 152,
  leftInner: 133,
  leftOuter: 33,
  rightInner: 362,
  rightOuter: 263,
  leftIris: 468,
  rightIris: 473,
  leftBrowInner: 107,
  leftBrowOuter: 46,
  rightBrowInner: 336,
  rightBrowOuter: 276,
  leftAlar: 48,
  rightAlar: 278,
  leftCheek: 50,
  rightCheek: 280,
  leftMouth: 61,
  rightMouth: 291,
  leftGonion: 172,
  rightGonion: 397,
  leftJaw: 176,
  rightJaw: 400,
  leftTemple: 54,
  rightTemple: 284,
  leftTragus: 234,
  rightTragus: 454,
} as const;

export const MIDLINE_KEYS = [
  "glabella",
  "nasion",
  "noseTip",
  "subnasale",
  "upperLip",
  "lowerLip",
  "chin",
] as const;

export type Region = "orbits" | "midface" | "mouth" | "mandible";

export const PAIRS: { name: string; L: keyof typeof FACE; R: keyof typeof FACE; region: Region }[] = [
  { name: "endocanthion", L: "leftInner", R: "rightInner", region: "orbits" },
  { name: "exocanthion", L: "leftOuter", R: "rightOuter", region: "orbits" },
  { name: "brow tail", L: "leftBrowOuter", R: "rightBrowOuter", region: "orbits" },
  { name: "brow head", L: "leftBrowInner", R: "rightBrowInner", region: "orbits" },
  { name: "alare", L: "leftAlar", R: "rightAlar", region: "midface" },
  { name: "cheek", L: "leftCheek", R: "rightCheek", region: "midface" },
  { name: "cheilion", L: "leftMouth", R: "rightMouth", region: "mouth" },
  { name: "gonion", L: "leftGonion", R: "rightGonion", region: "mandible" },
  { name: "jaw body", L: "leftJaw", R: "rightJaw", region: "mandible" },
  { name: "tragus", L: "leftTragus", R: "rightTragus", region: "mandible" },
];

export const EDMA_SEGMENTS: { name: string; a: keyof typeof FACE; b: keyof typeof FACE; side: "L" | "R" | "M" }[] = [
  { name: "palpebral width", a: "leftInner", b: "leftOuter", side: "L" },
  { name: "palpebral width", a: "rightInner", b: "rightOuter", side: "R" },
  { name: "brow span", a: "leftBrowInner", b: "leftBrowOuter", side: "L" },
  { name: "brow span", a: "rightBrowInner", b: "rightBrowOuter", side: "R" },
  { name: "alar to chin", a: "leftAlar", b: "chin", side: "L" },
  { name: "alar to chin", a: "rightAlar", b: "chin", side: "R" },
  { name: "cheilion to pogonion", a: "leftMouth", b: "chin", side: "L" },
  { name: "cheilion to pogonion", a: "rightMouth", b: "chin", side: "R" },
  { name: "gonion to pogonion", a: "leftGonion", b: "chin", side: "L" },
  { name: "gonion to pogonion", a: "rightGonion", b: "chin", side: "R" },
  { name: "exocanthion to cheilion", a: "leftOuter", b: "leftMouth", side: "L" },
  { name: "exocanthion to cheilion", a: "rightOuter", b: "rightMouth", side: "R" },
  { name: "cheek to chin", a: "leftCheek", b: "chin", side: "L" },
  { name: "cheek to chin", a: "rightCheek", b: "chin", side: "R" },
  { name: "tragus to pogonion", a: "leftTragus", b: "chin", side: "L" },
  { name: "tragus to pogonion", a: "rightTragus", b: "chin", side: "R" },
  { name: "exocanthion to gonion", a: "leftOuter", b: "leftGonion", side: "L" },
  { name: "exocanthion to gonion", a: "rightOuter", b: "rightGonion", side: "R" },
];

export const MESH_KEYS: (keyof typeof FACE)[] = [
  "glabella", "nasion", "noseTip", "subnasale", "upperLip", "lowerLip", "chin",
  "leftInner", "leftOuter", "rightInner", "rightOuter", "leftIris", "rightIris",
  "leftBrowInner", "leftBrowOuter", "rightBrowInner", "rightBrowOuter",
  "leftAlar", "rightAlar", "leftCheek", "rightCheek", "leftMouth", "rightMouth",
  "leftGonion", "rightGonion", "leftJaw", "rightJaw", "leftTragus", "rightTragus",
];

export const POSE = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
} as const;

export const ANALYZER_VERSION = "aether-face-1.2.0";
