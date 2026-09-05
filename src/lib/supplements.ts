/**
 * Supplements, graded by the evidence behind them.
 *
 * The grade is the point. A list that presents creatine and BCAA as equals is
 * worse than no list, because it launders a marketing claim into something
 * that looks like a recommendation. Each entry says what it does, what it does
 * NOT do, and how good the evidence actually is — including the ones where the
 * honest answer is "this is probably a waste of money for you".
 *
 * Nothing here is dosed automatically or pushed. The app tracks what you
 * choose to take; it does not tell you to take anything.
 */

export type Evidence = "strong" | "moderate" | "weak" | "none";

export interface Supplement {
  id: string;
  name: string;
  evidence: Evidence;
  /** What it is actually for. */
  what: string;
  dose: string;
  timing: string;
  /** The caveat that usually goes unsaid. */
  caveat?: string;
  /** True when a normal diet generally covers it and a pill is redundant. */
  foodCovers?: boolean;
}

export const SUPPLEMENTS: Supplement[] = [
  {
    id: "creatine",
    name: "Creatine monohydrate",
    evidence: "strong",
    what: "More reps at a given weight, and more total work over weeks. The most reliably effective legal supplement there is.",
    dose: "3–5g daily",
    timing: "Any time. Consistency matters, timing does not.",
    caveat: "Monohydrate only. The expensive forms have no advantage and much less data.",
  },
  {
    id: "protein",
    name: "Whey / protein powder",
    evidence: "strong",
    what: "A convenient way to hit a protein target. It is food, not a drug.",
    dose: "Whatever closes the gap to your daily target",
    timing: "Anywhere in the day.",
    caveat: "No benefit over the same protein from food. If you already hit your target, this does nothing.",
    foodCovers: true,
  },
  {
    id: "caffeine",
    name: "Caffeine",
    evidence: "strong",
    what: "Genuine improvements in output and perceived effort.",
    dose: "3–6mg per kg bodyweight",
    timing: "45–60 min before training",
    caveat: "Half of a dose is still circulating six hours later. Late sessions cost sleep, and sleep costs more than the caffeine gained.",
  },
  {
    id: "vitamin_d",
    name: "Vitamin D3",
    evidence: "moderate",
    what: "Worth taking if you are deficient, which is common indoors and at northern latitudes. Does nothing if you are not.",
    dose: "1000–2000 IU daily",
    timing: "With a meal containing fat.",
    caveat: "The only item here worth a blood test first — supplementing blind is guessing.",
  },
  {
    id: "omega3",
    name: "Omega-3 (EPA/DHA)",
    evidence: "moderate",
    what: "General health, and modest support for recovery and joint comfort.",
    dose: "1–2g combined EPA + DHA",
    timing: "With food.",
    caveat: "If you eat oily fish twice a week you already have this.",
    foodCovers: true,
  },
  {
    id: "magnesium",
    name: "Magnesium",
    evidence: "moderate",
    what: "Sleep quality and cramping, if you are short. Training diets often are.",
    dose: "200–400mg elemental",
    timing: "Evening.",
    caveat: "Glycinate or citrate. Oxide is poorly absorbed and mostly passes through.",
    foodCovers: true,
  },
  {
    id: "beta_alanine",
    name: "Beta-alanine",
    evidence: "moderate",
    what: "Helps in the 1–4 minute effort range. For an 8–12 rep set it does very little.",
    dose: "3–5g daily",
    timing: "Any time; it works by accumulating over weeks.",
    caveat: "The tingling is harmless and is not the effect working.",
  },
  {
    id: "citrulline",
    name: "L-Citrulline",
    evidence: "weak",
    what: "May add a rep or two on higher-rep sets. The pump is real; the strength effect is small.",
    dose: "6–8g",
    timing: "60 min before training",
  },
  {
    id: "bcaa",
    name: "BCAAs",
    evidence: "none",
    what: "Almost certainly pointless if you eat enough protein. Whole protein contains these already, in better ratios.",
    dose: "—",
    timing: "—",
    caveat: "The studies showing a benefit used subjects eating very little protein. That is not you if you are hitting your target.",
    foodCovers: true,
  },
  {
    id: "glutamine",
    name: "Glutamine",
    evidence: "none",
    what: "No demonstrated effect on strength, size or recovery in healthy trainees.",
    dose: "—",
    timing: "—",
    caveat: "Kept on this list precisely because it is widely sold and does nothing.",
  },
  {
    id: "testosterone_boosters",
    name: "Testosterone boosters",
    evidence: "none",
    what: "Tribulus, D-aspartic acid and similar do not raise testosterone in healthy men.",
    dose: "—",
    timing: "—",
    caveat: "Listed so it is on the record as not working, rather than absent and assumed untested.",
  },
];

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  strong: "Strong evidence",
  moderate: "Some evidence",
  weak: "Weak evidence",
  none: "No good evidence",
};

export const EVIDENCE_TONE: Record<Evidence, string> = {
  strong: "text-emerald-400",
  moderate: "text-lime-400",
  weak: "text-warn",
  none: "text-orange-400",
};

export const SUPPLEMENT_LOG_KEY = "soma-supplements";

/** Which supplements the user has chosen to take. Nothing is on by default. */
export function loadTaken(): string[] {
  try {
    const raw = localStorage.getItem(SUPPLEMENT_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveTaken(ids: string[]): void {
  try {
    localStorage.setItem(SUPPLEMENT_LOG_KEY, JSON.stringify(ids));
  } catch {
    /* not worth breaking the screen over */
  }
}
