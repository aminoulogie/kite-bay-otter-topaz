/**
 * What the literature actually says, with effect sizes, so the app can rank
 * its own measurements honestly instead of by how much people talk about them.
 *
 * The looksmaxxing world is obsessed with symmetry and with the neoclassical
 * canons. The research says both matter far less than assumed, and that skin —
 * which nobody in that world measures — has several times the effect size of
 * either. An app that reports symmetry in a giant font and skin in a footnote
 * is reproducing the folklore rather than the evidence.
 *
 * Every entry carries its source and its number. Where a finding is contested
 * that is recorded too, because "r = 0.2 and probably inflated by publication
 * bias" is a different claim from "r = 0.2".
 */

export interface Finding {
  id: string;
  claim: string;
  /** Correlation or effect size where one is reported. */
  r?: number;
  /** How much weight the app should give this, 0-1, from the evidence. */
  weight: number;
  source: string;
  /** Where the finding is disputed, said plainly rather than smoothed over. */
  caveat?: string;
}

export const FINDINGS: Finding[] = [
  {
    id: "skin-homogeneity",
    claim: "Even skin tone is the strongest measurable predictor of perceived age",
    r: -0.62,
    weight: 1,
    source:
      "Fink, Matts et al. — colour homogeneity vs perceived age, r = −0.62. " +
      "Haemoglobin evenness predicts attractiveness better than melanin.",
  },
  {
    id: "averageness",
    claim: "Closeness to the population average is the strongest SHAPE predictor",
    weight: 0.85,
    source:
      "Scientific Reports 2025 — attractiveness predicted by low distinctiveness " +
      "and femininity; NOT by symmetry or masculinity.",
    caveat:
      "Effects measured on unmanipulated photographs are much smaller than on " +
      "computer-morphed faces, which is where the famous results come from.",
  },
  {
    id: "skin-colour",
    claim: "Redness and yellowness in skin read as health",
    weight: 0.7,
    source:
      "Stephen, Law Smith, Stirrat & Perrett 2009 — raising a* and b* on " +
      "colour-calibrated faces increased rated health.",
    caveat: "Culturally specific; the direction differs between observer groups.",
  },
  {
    id: "symmetry",
    claim: "Facial symmetry has a small association with attractiveness",
    r: 0.2,
    weight: 0.25,
    source: "Van Dongen & Gangestad meta-analysis — mean r ≈ 0.2 across outcomes.",
    caveat:
      "Recent equivalence tests find effects significantly SMALLER than the " +
      "meta-analytic figure, and the 2025 shape paper found symmetry did not " +
      "predict attractiveness at all once averageness was accounted for. " +
      "Treat 0.2 as a ceiling, not an estimate.",
  },
  {
    id: "canons",
    claim: "The neoclassical canons describe almost nobody",
    weight: 0.15,
    source:
      "Farkas 1985/2005 and replications — the orbital canon fits 30.6% of " +
      "young adults, nasoaural 13.0%, nasofacial 9.3%. Horizontal canons do " +
      "best at ~37–40%.",
    caveat:
      "Validity drops further outside European-descent samples: several canons " +
      "fit Southern Chinese and Tibetan faces essentially never.",
  },
  {
    id: "fwhr",
    claim: "Facial width-to-height predicts perceived dominance, not beauty",
    weight: 0.3,
    source:
      "Meta-analyses — fWHR reliably relates to judged threat and dominant " +
      "behaviour.",
    caveat:
      "The sexual-dimorphism claim it was built on does not replicate in faces; " +
      "re-analysis found sex differences only in East Asian samples, and small.",
  },
];

export function finding(id: string): Finding | undefined {
  return FINDINGS.find((f) => f.id === id);
}

/**
 * The order the Looks tab should show things in.
 *
 * Sorted by evidence weight, which puts skin first and the canons last —
 * roughly the inverse of the order the subject is usually discussed in.
 */
export function byWeight(): Finding[] {
  return [...FINDINGS].sort((a, b) => b.weight - a.weight);
}
