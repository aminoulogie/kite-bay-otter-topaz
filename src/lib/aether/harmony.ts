/**
 * Your face against published anthropometric norms.
 *
 * "How attractive am I, as a number" has no ground truth to calibrate against,
 * so any single blended score is invented rather than measured. What CAN be
 * measured, precisely, is where each of your proportions sits relative to
 * figures that were actually collected from people and published — which is
 * the analysis a maxillofacial surgeon or orthodontist works from.
 *
 * ## The caveat that is not a hedge
 *
 * Farkas's own large-sample work found the classical canons are frequently NOT
 * met even in faces everyone agrees are attractive, and that the norms differ
 * substantially by ancestry — his 1985 and 2005 papers are largely a record of
 * the canons failing. So a deviation here is a DESCRIPTION, not a defect. That
 * is precisely why this reports "yours is 1.04, the canon is 1.00, that is +4%"
 * and never "you scored 68".
 *
 * Every norm below carries where it came from and how much natural spread it
 * has, because a deviation means nothing without knowing the normal range. A
 * ratio 0.02 off a norm with a spread of 0.10 is dead centre, and reporting it
 * as "off" would be the lie.
 */

import { dist, lineAngleVsHorizontal, type Pt } from "./geometry.ts";
import { FACE } from "./landmarks.ts";

export interface Norm {
  id: string;
  label: string;
  /** What is being divided by what, in words, so the figure is checkable. */
  formula: string;
  /** Published central value. */
  norm: number;
  /**
   * Roughly one standard deviation in adult populations. Used to say how far
   * out a reading is in units that mean something, rather than raw difference.
   */
  spread: number;
  source: string;
  unit?: "deg";
  /**
   * Share of young adults who actually MEET this canon, where a replication
   * reports it. This is the number that reframes the whole card: the orbital
   * canon fits 30.6% of people, the nasoaural 13%, the nasofacial 9.3%. A
   * canon almost nobody meets is a description of a statue, not a target.
   */
  metByPct?: number;
}

/**
 * The measurable canons.
 *
 * Anything needing the trichion is absent: MediaPipe has no hairline, so the
 * classical facial thirds cannot be computed here and are not faked. What
 * remains is everything derivable from soft-tissue landmarks the mesh does
 * carry.
 */
export const NORMS: Norm[] = [
  {
    id: "icd_pfw",
    label: "Eye spacing",
    formula: "inner-corner distance ÷ eye width",
    norm: 1.0,
    spread: 0.1,
    source: "Neoclassical canon; Farkas found mean near 1.0 with wide spread",
    metByPct: 30.6,
  },
  {
    id: "nose_icd",
    label: "Nose width vs eye spacing",
    formula: "alar width ÷ inner-corner distance",
    norm: 1.0,
    spread: 0.12,
    source: "Neoclassical canon (nasal aperture ≈ intercanthal)",
    metByPct: 40,
  },
  {
    id: "mouth_nose",
    label: "Mouth vs nose width",
    formula: "mouth width ÷ alar width",
    norm: 1.5,
    spread: 0.15,
    source: "Neoclassical canon (oral fissure ≈ 1.5 × nasal width)",
    metByPct: 13,
  },
  {
    id: "fifths",
    label: "Facial fifths",
    formula: "face width ÷ eye width",
    norm: 5.0,
    spread: 0.6,
    source: "Rule of fifths; a face is about five eyes wide",
    metByPct: 37,
  },
  {
    id: "mid_lower",
    label: "Midface vs lower third",
    formula: "nasion→subnasale ÷ subnasale→chin",
    norm: 1.0,
    spread: 0.1,
    source: "Vertical thirds, lower two only — no hairline available",
    metByPct: 9.3,
  },
  {
    id: "fwhr",
    label: "Facial width-to-height",
    formula: "cheekbone width ÷ brow-to-lip height",
    norm: 1.9,
    spread: 0.25,
    source:
      "fWHR literature. Reliably predicts judged DOMINANCE and threat, not " +
      "beauty — and the sexual-dimorphism claim it was built on does not " +
      "replicate in faces outside East Asian samples.",
  },
  {
    id: "jaw_cheek",
    label: "Jaw vs cheekbone width",
    formula: "bigonial ÷ bizygomatic",
    norm: 0.78,
    spread: 0.06,
    source: "Craniofacial anthropometry; taper of the lower face",
  },
  {
    id: "canthal",
    label: "Canthal tilt",
    formula: "outer eye corner above inner, in degrees",
    norm: 5.5,
    spread: 2.5,
    source: "Adult means cluster 4–8° positive",
    unit: "deg",
  },
];

export interface Reading {
  norm: Norm;
  /** Your figure. Null when the landmarks for it were not usable. */
  value: number | null;
  /** Difference from the norm, in units of its natural spread. */
  z: number | null;
  /** Percent difference from the norm, which is the readable version. */
  pct: number | null;
  /** Within one spread of the norm — i.e. unremarkable. */
  typical: boolean;
}

/** Every canon, measured off one set of landmarks. */
export function measureHarmony(pts: Pt[]): Reading[] {
  const at = (k: keyof typeof FACE) => pts[FACE[k]];
  const d = (a: keyof typeof FACE, b: keyof typeof FACE): number | null => {
    const p = at(a);
    const q = at(b);
    return p && q ? dist(p, q) : null;
  };
  const div = (a: number | null, b: number | null): number | null =>
    a != null && b != null && b !== 0 ? a / b : null;

  const icd = d("leftInner", "rightInner");
  const eyeL = d("leftInner", "leftOuter");
  const eyeR = d("rightInner", "rightOuter");
  const eyeW = eyeL != null && eyeR != null ? (eyeL + eyeR) / 2 : (eyeL ?? eyeR);
  const alar = d("leftAlar", "rightAlar");
  const mouth = d("leftMouth", "rightMouth");
  const faceW = d("leftTemple", "rightTemple") ?? d("leftCheek", "rightCheek");
  const cheekW = d("leftCheek", "rightCheek");
  const jawW = d("leftGonion", "rightGonion");
  const midface = d("nasion", "subnasale");
  const lower = d("subnasale", "chin");

  // fWHR uses brow to upper lip, which is the protocol most of that literature
  // follows. Using chin instead would produce a number half the size and it
  // would look like a wildly abnormal face.
  const browToLip = d("glabella", "upperLip");

  const lIn = at("leftInner");
  const lOut = at("leftOuter");
  const rIn = at("rightInner");
  const rOut = at("rightOuter");
  const tiltL = lIn && lOut ? -lineAngleVsHorizontal(lIn, lOut) : null;
  const tiltR = rIn && rOut ? lineAngleVsHorizontal(rOut, rIn) : null;
  const tilt = tiltL != null && tiltR != null ? (tiltL + tiltR) / 2 : (tiltL ?? tiltR);

  const raw: Record<string, number | null> = {
    icd_pfw: div(icd, eyeW),
    nose_icd: div(alar, icd),
    mouth_nose: div(mouth, alar),
    fifths: div(faceW, eyeW),
    mid_lower: div(midface, lower),
    fwhr: div(cheekW, browToLip),
    jaw_cheek: div(jawW, cheekW),
    canthal: tilt,
  };

  return NORMS.map((norm) => {
    const value = raw[norm.id] ?? null;
    if (value == null || !Number.isFinite(value)) {
      return { norm, value: null, z: null, pct: null, typical: false };
    }
    const z = (value - norm.norm) / norm.spread;
    // Percent is meaningless for an angle that can pass through zero, so a
    // degree reading reports the raw difference instead of a ratio of it.
    const pct = norm.unit === "deg" ? value - norm.norm : ((value - norm.norm) / norm.norm) * 100;
    return {
      norm,
      value: Math.round(value * 1000) / 1000,
      z: Math.round(z * 100) / 100,
      pct: Math.round(pct * 10) / 10,
      typical: Math.abs(z) <= 1,
    };
  });
}

/**
 * How many canons you sit inside, out of how many could be measured.
 *
 * Deliberately a COUNT, not a score. Averaging deviations into a percentage
 * would produce exactly the single blended number this file exists to avoid —
 * and it would weight a contested canon equally with a well-established one.
 */
export function harmonySummary(readings: Reading[]): { typical: number; measured: number } {
  const measured = readings.filter((r) => r.value != null);
  return { typical: measured.filter((r) => r.typical).length, measured: measured.length };
}

/** The readings furthest from their norms, worst first. */
export function mostDeviant(readings: Reading[], limit = 3): Reading[] {
  return readings
    .filter((r) => r.z != null)
    .sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!))
    .slice(0, limit);
}

/**
 * Symmetry as a percentage, per region and overall.
 *
 * Alpha is a Procrustes distance — a small number where zero is perfect — and
 * "0.043" tells a person nothing. This turns each region into a percentage
 * where 100 is perfectly even.
 *
 * The scale factor is set so that a typical human face lands in the 90s rather
 * than at 99.9, because everyone is asymmetric and a scale that reports
 * everyone as near-perfect measures nothing.
 */
const REGION_SCALE = 6;

export function symmetryPercent(alpha: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - alpha * 100 * REGION_SCALE)) * 10) / 10;
}

export function regionPercent(regionalValue: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - regionalValue * 100)) * 10) / 10;
}


/**
 * How far this face sits from the population averages, overall.
 *
 * The single most defensible number here, and it is not symmetry. The 2025
 * Scientific Reports work found facial attractiveness robustly predicted by
 * LOW DISTINCTIVENESS — closeness to the average — and by femininity, and NOT
 * by symmetry or masculinity once averageness was accounted for.
 *
 * So this is the root-mean-square of the standardised deviations already
 * computed: one number for "how unusual are my proportions". RMS rather than a
 * plain mean because one large deviation is more distinctive than several
 * small ones, and averaging would hide it.
 *
 * Two things it is NOT. It is not a beauty score: averageness predicts
 * attractiveness on the population level and plenty of striking faces are
 * distinctive. And the effect is much smaller on real photographs than on the
 * computer-morphed faces the famous studies used, which is where most of the
 * popular version of this finding comes from.
 */
export function distinctiveness(readings: Reading[]): { rms: number; measured: number } | null {
  const zs = readings.map((r) => r.z).filter((z): z is number => z != null);
  if (zs.length < 3) return null;
  const rms = Math.sqrt(zs.reduce((a, z) => a + z * z, 0) / zs.length);
  return { rms: Math.round(rms * 100) / 100, measured: zs.length };
}

/**
 * Distinctiveness in words, banded by standard deviations.
 *
 * Bands rather than a number to two decimals, because the input is eight
 * ratios measured off one photograph and pretending to that precision would be
 * the same lie as a blended score.
 */
export function distinctivenessLabel(rms: number): string {
  if (rms < 0.6) return "Close to the population average across the board";
  if (rms < 1.0) return "Typical — most proportions within one standard deviation";
  if (rms < 1.5) return "Somewhat distinctive";
  return "Distinctive — several proportions well outside the usual range";
}
