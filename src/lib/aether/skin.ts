/**
 * Skin and soft tissue, read off the pixels rather than the landmarks.
 *
 * The landmark analyser measures SHAPE, which is mostly bone and mostly fixed.
 * Everything that actually changes in a season — redness, tone evenness, oil,
 * the dark under the eyes, how puffy a face is on a given morning — is in the
 * pixels, and none of it was being read.
 *
 * ## The one thing that makes this real rather than noise
 *
 * Skin measurements are meaningless across different lighting. A warmer bulb
 * moves redness more than a month of retinoid does. So every figure here is
 * NORMALISED AGAINST A REFERENCE PATCH ON THE SAME FACE — the forehead for
 * luminance, the mid-cheek for colour — which cancels most of the exposure and
 * white-balance difference between two photographs.
 *
 * That is why these are RELATIVE indices, not absolute measurements. "Your
 * under-eye is 12% darker than your cheek" survives a lighting change.
 * "Your under-eye luminance is 84" does not, and would have you chasing a
 * different bulb every week.
 *
 * Even normalised, a reading taken under harsh side light is not comparable to
 * one taken flat-on. The capture gates already grade lighting; anything below
 * a decent grade should be treated as a photograph of the lamp, not the face.
 */

import type { Pt } from "./geometry.ts";
import { FACE } from "./landmarks.ts";

/** A sampled patch: where it was taken and what was in it. */
export interface Patch {
  /** Mean luminance, 0-255. */
  lum: number;
  /** Mean CIELAB lightness, 0-100. The axis the dermatology literature uses. */
  Lstar: number;
  /** Mean redness on the CIELAB a* axis; positive is red, negative is green. */
  redA: number;
  /** Mean yellowness on b*. */
  yellowB: number;
  /** Standard deviation of luminance — texture and unevenness together. */
  lumSd: number;
  /** Share of pixels bright enough to be a specular highlight, 0-1. */
  specular: number;
  /** How many pixels were actually read. Zero means the patch missed. */
  n: number;
}

export interface SkinReport {
  /**
   * How much darker the under-eye is than the cheek below it, as a percentage
   * of cheek luminance. Positive is darker. Responds to sleep within days.
   */
  underEyeIndex: number | null;
  /** The same for each side, because they are rarely equal. */
  underEyeL: number | null;
  underEyeR: number | null;
  /**
   * Cheek redness relative to forehead. Cancels most of the white balance,
   * which is what makes it comparable week to week.
   */
  erythemaIndex: number | null;
  /**
   * Luminance spread across the cheeks, as a fraction of their mean. Higher is
   * blotchier. Texture and pigment together — this cannot tell them apart.
   */
  unevenness: number | null;
  /** Share of forehead and nose reading as specular highlight. An oil proxy. */
  shine: number | null;
  /** ΔL* between infraorbital and cheek, as the dermatology literature reports it. */
  deltaL: number | null;
  /** ΔITA°, the standard colorimetric descriptor. Negative is darker. */
  deltaITA: number | null;
  /** Δa* — the axis that separates vascular circles from pigmented ones. */
  deltaA: number | null;
  /** Which kind, since pigment and vascular need opposite treatments. */
  circleType: CircleType;
  /** Regions that could not be sampled, so a missing figure is explained. */
  missing: string[];
}

/** sRGB to CIELAB, D65. L* is needed for ITA and the dark-circle subtype. */
function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = f(r);
  const G = f(g);
  const B = f(b);
  // Linear sRGB to XYZ.
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = k(X);
  const fy = k(Y);
  const fz = k(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** A pixel bright enough to be a reflection rather than skin. */
const SPECULAR_LUM = 235;

/**
 * Read a circular patch of pixels centred on a landmark.
 *
 * A circle rather than a polygon: the useful regions here are all roughly
 * round, and a radius scaled to the face means the same patch is read whether
 * the photograph was taken at arm's length or closer.
 */
export function samplePatch(
  data: ImageData,
  centre: Pt,
  radiusFrac: number,
): Patch {
  const cx = centre.x * data.width;
  const cy = centre.y * data.height;
  const r = Math.max(2, radiusFrac * data.width);
  const r2 = r * r;

  let n = 0;
  let sumLstar = 0;
  let sumA = 0;
  let sumB = 0;
  let sumLum = 0;
  let sumLum2 = 0;
  let spec = 0;

  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(data.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(data.height - 1, Math.ceil(cy + r));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * data.width + x) * 4;
      const R = data.data[i]!;
      const G = data.data[i + 1]!;
      const B = data.data[i + 2]!;
      // Rec. 601 luma, which is what "how bright does this look" means here.
      const lum = 0.299 * R + 0.587 * G + 0.114 * B;
      if (lum >= SPECULAR_LUM) spec++;
      const lab = rgbToLab(R, G, B);
      sumLstar += lab.L;
      sumA += lab.a;
      sumB += lab.b;
      sumLum += lum;
      sumLum2 += lum * lum;
      n++;
    }
  }

  if (!n) return { lum: 0, Lstar: 0, redA: 0, yellowB: 0, lumSd: 0, specular: 0, n: 0 };
  const mean = sumLum / n;
  // Population variance, floored at zero — floating point can make it very
  // slightly negative on a perfectly flat patch.
  const variance = Math.max(0, sumLum2 / n - mean * mean);
  return {
    lum: mean,
    Lstar: sumLstar / n,
    redA: sumA / n,
    yellowB: sumB / n,
    lumSd: Math.sqrt(variance),
    specular: spec / n,
    n,
  };
}

/**
 * Individual Typology Angle, the standard colorimetric descriptor of skin.
 *
 * ITA° = arctan((L* − 50) / b*) in degrees. Higher is lighter. The clinical
 * literature on dark circles reports ΔITA and ΔL* between the infraorbital
 * region and the adjacent cheek, so reporting the same thing makes a reading
 * here comparable to a published figure rather than to nothing.
 */
export function ita(patch: { Lstar: number; yellowB: number }): number {
  if (!patch.yellowB) return 0;
  return (Math.atan((patch.Lstar - 50) / patch.yellowB) * 180) / Math.PI;
}

/**
 * Which KIND of dark circle, which is the part that decides what helps.
 *
 * Instrumental work on the infraorbital region separates the causes by which
 * colour axis moves: the constitutional and post-inflammatory (pigmented)
 * subtypes shift L* most, while vascular and shadow subtypes shift a*. They
 * respond to completely different things — pigment to sun protection and
 * topical actives over months, vascular to sleep, allergy and fluid overnight —
 * so telling someone "you have dark circles" without the subtype sends half of
 * them at the wrong treatment.
 *
 * Deliberately returns "unclear" when neither axis dominates, rather than
 * picking the larger of two similar numbers and sounding certain.
 */
export type CircleType = "pigmented" | "vascular" | "unclear" | "none";

export function circleSubtype(dL: number, dA: number): CircleType {
  // Under about a point of lightness difference there is nothing to classify.
  if (Math.abs(dL) < 1 && Math.abs(dA) < 0.6) return "none";
  const lDominant = Math.abs(dL) / 4;
  const aDominant = Math.abs(dA);
  if (lDominant > aDominant * 1.5) return "pigmented";
  if (aDominant > lDominant * 1.5) return "vascular";
  return "unclear";
}

/** Halfway between two points, used to place patches the mesh has no point for. */
function between(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * Every skin figure for one capture.
 *
 * `scale` is the intercanthal distance, which is used to size the patches: it
 * is one of the most stable dimensions on a face, so patches sized by it are
 * the same patch of skin at any camera distance.
 */
export function analyseSkin(data: ImageData, pts: Pt[]): SkinReport {
  const missing: string[] = [];
  const at = (k: keyof typeof FACE) => pts[FACE[k]];

  const lInner = at("leftInner");
  const rInner = at("rightInner");
  const lOuter = at("leftOuter");
  const rOuter = at("rightOuter");
  const lCheek = at("leftCheek");
  const rCheek = at("rightCheek");
  const glabella = at("glabella");
  const noseTip = at("noseTip");

  if (!lInner || !rInner) {
    return {
      underEyeIndex: null, underEyeL: null, underEyeR: null,
      erythemaIndex: null, unevenness: null, shine: null,
      deltaL: null, deltaITA: null, deltaA: null, circleType: "none",
      missing: ["eyes — nothing could be measured without them"],
    };
  }
  const scale = Math.hypot(rInner.x - lInner.x, rInner.y - lInner.y) || 0.1;
  // A patch about a fifth of the inter-eye distance: big enough to average out
  // pores, small enough to stay inside the region it is named after.
  const rad = scale * 0.22;

  /**
   * Under-eye against the cheek directly below it.
   *
   * Placed by walking down from the eye corner rather than at a fixed offset,
   * so it lands under the eye on a long face and a round one alike.
   */
  const underEye = (inner: Pt | undefined, outer: Pt | undefined, cheek: Pt | undefined) => {
    if (!inner || !outer || !cheek) return null;
    const eyeMid = between(inner, outer, 0.5);
    const infra = between(eyeMid, cheek, 0.35);
    const ref = between(eyeMid, cheek, 0.95);
    const dark = samplePatch(data, infra, rad * 0.8);
    const light = samplePatch(data, ref, rad * 0.8);
    if (!dark.n || !light.n || light.lum <= 0) return null;
    // As a percentage of the reference, so exposure cancels.
    return Math.round(((light.lum - dark.lum) / light.lum) * 1000) / 10;
  };

  const underEyeL = underEye(lInner, lOuter, lCheek);
  const underEyeR = underEye(rInner, rOuter, rCheek);

  /**
   * The same comparison in the units the clinical literature uses, averaged
   * over both sides. Reported alongside the relative index rather than instead
   * of it: ΔL* is comparable to published figures, the percentage is the one a
   * person can read.
   */
  let deltaL: number | null = null;
  let deltaITA: number | null = null;
  let deltaA: number | null = null;
  const infraPatches: { dark: ReturnType<typeof samplePatch>; ref: ReturnType<typeof samplePatch> }[] = [];
  for (const [inner, outer, cheek] of [
    [lInner, lOuter, lCheek],
    [rInner, rOuter, rCheek],
  ] as const) {
    if (!inner || !outer || !cheek) continue;
    const eyeMid = between(inner, outer, 0.5);
    const dark = samplePatch(data, between(eyeMid, cheek, 0.35), rad * 0.8);
    const ref = samplePatch(data, between(eyeMid, cheek, 0.95), rad * 0.8);
    if (dark.n && ref.n) infraPatches.push({ dark, ref });
  }
  if (infraPatches.length) {
    const mean = (f: (p: (typeof infraPatches)[number]) => number) =>
      infraPatches.reduce((a, p) => a + f(p), 0) / infraPatches.length;
    deltaL = Math.round(mean((p) => p.dark.Lstar - p.ref.Lstar) * 100) / 100;
    deltaA = Math.round(mean((p) => p.dark.redA - p.ref.redA) * 100) / 100;
    deltaITA = Math.round(mean((p) => ita(p.dark) - ita(p.ref)) * 10) / 10;
  }
  if (underEyeL == null && underEyeR == null) missing.push("under-eye");
  const both = [underEyeL, underEyeR].filter((v): v is number => v != null);
  const underEyeIndex = both.length ? Math.round((both.reduce((a, b) => a + b, 0) / both.length) * 10) / 10 : null;

  /** Cheek redness relative to the forehead, which cancels white balance. */
  let erythemaIndex: number | null = null;
  let unevenness: number | null = null;
  if (lCheek && rCheek && glabella) {
    const cl = samplePatch(data, lCheek, rad);
    const cr = samplePatch(data, rCheek, rad);
    const fh = samplePatch(data, glabella, rad);
    if (cl.n && cr.n && fh.n) {
      const cheekA = (cl.redA + cr.redA) / 2;
      erythemaIndex = Math.round((cheekA - fh.redA) * 100) / 100;
      const meanLum = (cl.lum + cr.lum) / 2;
      const sd = (cl.lumSd + cr.lumSd) / 2;
      unevenness = meanLum > 0 ? Math.round((sd / meanLum) * 1000) / 10 : null;
    }
  }
  if (erythemaIndex == null) missing.push("cheeks or forehead");

  /** Shine across the T-zone. */
  let shine: number | null = null;
  if (glabella && noseTip) {
    const fh = samplePatch(data, glabella, rad);
    const nose = samplePatch(data, noseTip, rad * 0.7);
    if (fh.n && nose.n) shine = Math.round(((fh.specular + nose.specular) / 2) * 1000) / 10;
  }

  return {
    underEyeIndex, underEyeL, underEyeR, erythemaIndex, unevenness, shine,
    deltaL, deltaITA, deltaA,
    circleType: deltaL != null && deltaA != null ? circleSubtype(deltaL, deltaA) : "none",
    missing,
  };
}

/**
 * How puffy a face is, from the landmarks alone.
 *
 * Cheek width over intercanthal distance. The denominator is essentially fixed
 * bone, so a change in this ratio is a change in soft tissue — water on a
 * salty night, or fat over months. One of the few genuinely responsive numbers
 * a phone can measure, and the one that moves with sodium and sleep.
 *
 * It cannot tell water from fat. Only the timescale can: overnight is water,
 * over a season is not.
 */
export function puffinessRatio(pts: Pt[]): number | null {
  const lInner = pts[FACE.leftInner];
  const rInner = pts[FACE.rightInner];
  const lCheek = pts[FACE.leftCheek];
  const rCheek = pts[FACE.rightCheek];
  if (!lInner || !rInner || !lCheek || !rCheek) return null;
  const inter = Math.hypot(rInner.x - lInner.x, rInner.y - lInner.y);
  const cheek = Math.hypot(rCheek.x - lCheek.x, rCheek.y - lCheek.y);
  if (!inter) return null;
  return Math.round((cheek / inter) * 1000) / 1000;
}
