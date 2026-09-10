/**
 * "You are 22g over on fat. Cut the peanuts by 40g."
 *
 * A macro readout tells you that you have overshot. It does not tell you what
 * to do about it, and working that out by hand — which item is carrying the
 * fat, how much of it to drop, what that costs you in protein, what to add
 * back — is arithmetic nobody does at 7am. So the plan gets checked before it
 * is eaten, which is the only moment the answer is still actionable.
 *
 * Two rules keep this honest:
 *
 *  1. **It only ever proposes food that already exists** in the library with
 *     real figures on it. Nothing here invents a nutrition number, and nothing
 *     proposes "some lean protein" — an instruction you cannot log is not an
 *     instruction.
 *  2. **It reports the cost of its own advice.** Cutting the peanuts also
 *     removes protein, and a suggestion that hides that is how you end up
 *     under target on the macro you actually care about.
 */

import type { FoodItem, Goals } from "./types.ts";

/** Under this share of target, an overshoot is not worth a sentence. */
export const OVER_TOLERANCE = 0.05;

/** Nor is it under this many grams — 3g of fat is rounding, not a problem. */
export const MIN_OVER_G = 5;

/** Cuts below this are not worth making, and are not weighable in a kitchen. */
export const MIN_CUT_G = 10;

/** Nobody adds two pounds of anything to fix a plan. */
export const MAX_ADD_G = 400;

/**
 * Short of protein by this share of target and an addition MUST carry some.
 *
 * Protein is the macro with an actual requirement; carbs and fat are largely
 * interchangeable energy. That asymmetry is why this rule exists for protein
 * and not for the other two — and it is what stops the answer to every gap
 * being a scoop of sugar.
 */
export const PROTEIN_PRIORITY = 0.2;

/** Below this improvement in total miss, an addition is noise dressed as advice. */
export const MIN_IMPROVEMENT = 0.05;

export interface Totals {
  cals: number;
  p: number;
  c: number;
  f: number;
}

export type Macro = "p" | "c" | "f";

export const MACRO_NAME: Record<Macro, string> = {
  p: "protein",
  c: "carbs",
  f: "fat",
};

export interface CutSuggestion {
  index: number;
  name: string;
  /** Grams to remove, rounded to something you can actually weigh. */
  grams: number;
  /** What that removal takes with it. */
  costs: Totals;
}

export interface AddSuggestion {
  name: string;
  grams: number;
  gives: Totals;
}

export interface Rebalance {
  projected: Totals;
  /** The macro furthest over its target, or null when nothing is. */
  over: Macro | null;
  overBy: number;
  cut: CutSuggestion | null;
  add: AddSuggestion | null;
  /** One line, always present. Says "nothing to change" when that is the truth. */
  note: string;
}

export function totalsOf(items: FoodItem[]): Totals {
  return (items ?? []).reduce<Totals>(
    (a, i) => ({
      cals: a.cals + (Number(i.cals) || 0),
      p: a.p + (Number(i.p) || 0),
      c: a.c + (Number(i.c) || 0),
      f: a.f + (Number(i.f) || 0),
    }),
    { cals: 0, p: 0, c: 0, f: 0 },
  );
}

/**
 * Macros per gram of an item.
 *
 * Null when the item is not measured in a mass or volume unit. A food logged
 * as "1 piece" cannot be cut by 40g, and pretending otherwise would produce
 * advice the user cannot follow.
 */
export function perGram(item: FoodItem): Totals | null {
  const unit = String(item.unit ?? "").toLowerCase();
  if (unit !== "g" && unit !== "ml") return null;
  const serving = Number(item.serving) || 0;
  if (serving <= 0) return null;
  return {
    cals: (Number(item.cals) || 0) / serving,
    p: (Number(item.p) || 0) / serving,
    c: (Number(item.c) || 0) / serving,
    f: (Number(item.f) || 0) / serving,
  };
}

const round5 = (g: number) => Math.round(g / 5) * 5;

export function rebalance(
  eaten: FoodItem[],
  planned: FoodItem[],
  goals: Goals,
  library: FoodItem[] = [],
): Rebalance {
  const e = totalsOf(eaten);
  const p = totalsOf(planned);
  const projected: Totals = {
    cals: e.cals + p.cals,
    p: e.p + p.p,
    c: e.c + p.c,
    f: e.f + p.f,
  };

  const targets: Record<Macro, number> = {
    p: Number(goals?.protein) || 0,
    c: Number(goals?.carbs) || 0,
    f: Number(goals?.fat) || 0,
  };

  // Which macro is furthest over, measured as a SHARE of its own target. In
  // absolute grams carbs would win almost every time simply for being the
  // biggest number on the card.
  let over: Macro | null = null;
  let overShare = 0;
  let overBy = 0;
  for (const m of ["f", "c", "p"] as Macro[]) {
    const target = targets[m];
    if (target <= 0) continue;
    const excess = projected[m] - target;
    const share = excess / target;
    if (excess >= MIN_OVER_G && share > OVER_TOLERANCE && share > overShare) {
      over = m;
      overShare = share;
      overBy = excess;
    }
  }

  if (!over) {
    return {
      projected,
      over: null,
      overBy: 0,
      cut: null,
      add: null,
      note: planned.length
        ? "The plan lands inside your targets. Nothing to change."
        : "Nothing planned yet.",
    };
  }

  // Which planned item to take it out of: the one densest in the offending
  // macro, so the smallest cut does the most work. Only planned items — food
  // already eaten cannot be un-eaten, and telling someone to have had less
  // breakfast is not advice.
  let cut: CutSuggestion | null = null;
  let bestDensity = 0;
  planned.forEach((item, index) => {
    const pg = perGram(item);
    if (!pg || pg[over!] <= 0) return;
    if (pg[over!] > bestDensity) {
      bestDensity = pg[over!];
      const needed = overBy / pg[over!];
      // Never more than the portion actually contains.
      const grams = round5(Math.min(needed, Number(item.serving) || 0));
      if (grams >= MIN_CUT_G) {
        cut = {
          index,
          name: item.name,
          grams,
          costs: {
            cals: Math.round(pg.cals * grams),
            p: Math.round(pg.p * grams * 10) / 10,
            c: Math.round(pg.c * grams * 10) / 10,
            f: Math.round(pg.f * grams * 10) / 10,
          },
        };
      }
    }
  });

  if (!cut) {
    return {
      projected,
      over,
      overBy: Math.round(overBy),
      cut: null,
      add: null,
      note: `${Math.round(overBy)}g over on ${MACRO_NAME[over]}, but nothing on the plan is weighed in grams — adjust a portion by hand.`,
    };
  }

  // After the cut, is anything short? If so, find a food that fills the gap
  // without putting the offending macro straight back.
  const c = cut as CutSuggestion;
  const after: Totals = {
    cals: projected.cals - c.costs.cals,
    p: projected.p - c.costs.p,
    c: projected.c - c.costs.c,
    f: projected.f - c.costs.f,
  };

  let add: AddSuggestion | null = null;

  /**
   * What to add back.
   *
   * Three attempts at this were wrong, and the wrong answers are instructive:
   *
   *  - Scoring "most of the missing macro per gram of the macro you are over"
   *    picks pure glucose powder every time. It closes one gap perfectly and
   *    leaves every other one where it was.
   *  - Filtering candidates to foods rich in the single worst gap throws away
   *    chicken on a day that is 137g short of protein, because the worst gap
   *    happened to be carbs by a couple of percent.
   *  - Sizing every candidate to close its gap exactly forces a fatty food to
   *    a 400g portion and then rejects it for the fat.
   *
   * So: every food gets scored at several sensible portion sizes, judged on
   * where it leaves the WHOLE day — the total miss across all three macros,
   * each against its own target so carbs do not dominate for being the
   * biggest number.
   */
  const shortBy = (m: Macro) => (targets[m] > 0 ? targets[m] - after[m] : 0);
  const proteinMatters = targets.p > 0 && shortBy("p") >= targets.p * PROTEIN_PRIORITY;

  const missOf = (result: Record<Macro, number>) => {
    let score = 0;
    for (const m of ["p", "c", "f"] as Macro[]) {
      if (targets[m] <= 0) continue;
      score += Math.abs(result[m] - targets[m]) / targets[m];
    }
    return score;
  };
  const doNothing = missOf({ p: after.p, c: after.c, f: after.f });

  let best: { item: FoodItem; grams: number; pg: Totals; score: number } | null = null;
  for (const item of library) {
    // Never the thing it just told you to cut.
    if (item.name.trim().toLowerCase() === c.name.trim().toLowerCase()) continue;
    const pg = perGram(item);
    if (!pg) continue;

    // On a day well short of protein, an addition that carries none is not
    // an answer. Protein is the macro with an actual requirement; carbs and
    // fat are largely interchangeable energy, which is why this rule is
    // written for protein alone and not for the other two.
    if (proteinMatters && pg.p <= 0) continue;

    // Headroom on the macro that is already over, judged against the same 5%
    // tolerance that declared it over — an exact ceiling would reject a food
    // for the gram left over from rounding the cut.
    const ceiling = targets[over] > 0 ? targets[over] * (1 + OVER_TOLERANCE) : Infinity;
    const headroomG = pg[over] > 0 ? (ceiling - after[over]) / pg[over] : Infinity;

    const sizes = new Set<number>();
    for (const m of ["p", "c", "f"] as Macro[]) {
      const gap = shortBy(m);
      if (gap > 0 && pg[m] > 0) sizes.add(gap / pg[m]);
    }
    sizes.add(headroomG);

    for (const raw of sizes) {
      const grams = round5(Math.max(0, Math.min(raw, headroomG, MAX_ADD_G)));
      if (grams < MIN_CUT_G) continue;
      const result: Record<Macro, number> = {
        p: after.p + pg.p * grams,
        c: after.c + pg.c * grams,
        f: after.f + pg.f * grams,
      };
      if (result[over] > ceiling) continue;
      const score = missOf(result);
      if (!best || score < best.score) best = { item, grams, pg, score };
    }
  }

  // An addition that barely moves the day is noise dressed as advice.
  if (best && best.score < doNothing - MIN_IMPROVEMENT) {
    add = {
      name: best.item.name,
      grams: best.grams,
      gives: {
        cals: Math.round(best.pg.cals * best.grams),
        p: Math.round(best.pg.p * best.grams * 10) / 10,
        c: Math.round(best.pg.c * best.grams * 10) / 10,
        f: Math.round(best.pg.f * best.grams * 10) / 10,
      },
    };
  }

  const parts = [
    `${Math.round(overBy)}g over on ${MACRO_NAME[over]}.`,
    `Cut ${c.name} by ${c.grams}g.`,
  ];
  if (add) parts.push(`Add ${add.grams}g ${add.name} to make it back up.`);

  return { projected, over, overBy: Math.round(overBy), cut: c, add, note: parts.join(" ") };
}
