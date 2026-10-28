/**
 * Spending plans from people who are known for them, to hold a month against.
 *
 * Each splits income into a few shares. Categories are matched to a share by
 * name (rent and groceries are needs, restaurants and shopping are wants),
 * and money set aside (a "save" entry) is the saving share. Anything a name
 * does not place counts as a want: the honest default for unplanned spending.
 */

export type Share = "needs" | "wants" | "save" | "give";

export interface SpendTemplate {
  id: string;
  name: string;
  by: string;
  note: string;
  shares: Partial<Record<Share, number>>;
}

export const TEMPLATES: SpendTemplate[] = [
  { id: "50-30-20", name: "50/30/20", by: "Elizabeth Warren (All Your Worth, 2005)", note: "Half on needs, under a third on wants, a fifth saved.", shares: { needs: 0.5, wants: 0.3, save: 0.2 } },
  { id: "70-20-10", name: "70/20/10", by: "a common rule for steady earners", note: "Live on 70%, save 20%, give or pay debt with 10%.", shares: { needs: 0.5, wants: 0.2, save: 0.2, give: 0.1 } },
  { id: "pay-yourself-first", name: "Pay yourself first", by: "George S. Clason (The Richest Man in Babylon) and David Bach", note: "Put at least a fifth away the day you're paid; spend the rest freely.", shares: { needs: 0.5, wants: 0.3, save: 0.2 } },
  { id: "60-solution", name: "The 60% solution", by: "Richard Jenkins (MSN Money, 2006)", note: "Committed costs 60%, then 10% each: retirement, long-term, short-term saving, fun.", shares: { needs: 0.6, wants: 0.1, save: 0.3 } },
  { id: "80-20", name: "80/20", by: "a simple version of paying yourself first", note: "Save a fifth, and don't track the rest.", shares: { needs: 0.55, wants: 0.25, save: 0.2 } },
  { id: "freelancer", name: "Freelancer's buffer", by: "after Paul Jarvis (Company of One) and others", note: "Irregular income: a bigger saving share builds a few months' runway.", shares: { needs: 0.5, wants: 0.15, save: 0.3, give: 0.05 } },
];

const NEEDS = /rent|housing|home|mortgage|grocer|food|supermarket|util|electric|water|gas|internet|phone|mobile|transport|fuel|car|bus|taxi|health|pharma|medic|doctor|insur|school|educat|debt|loan|bill/i;
const GIVE = /gift|charity|donat|zakat|sadaq|give/i;

/** Which share a spending category belongs to. */
export function shareOf(category: string): Share {
  if (GIVE.test(category)) return "give";
  if (NEEDS.test(category)) return "needs";
  return "wants";
}

export interface PlanRow {
  share: Share;
  actual: number;
  target: number;
  /** Shares of income, 0–1. */
  actualPct: number;
  targetPct: number;
}

/**
 * A month against a template: what went to each share and what the template
 * says should have, from the month's income (or what was spent and saved, when
 * no income was logged).
 */
export function comparePlan(
  spentByCategory: Record<string, number>,
  saved: number,
  income: number,
  t: SpendTemplate,
): PlanRow[] {
  const actual: Record<Share, number> = { needs: 0, wants: 0, save: Math.max(0, saved), give: 0 };
  for (const [c, v] of Object.entries(spentByCategory)) actual[shareOf(c)] += Math.max(0, v);
  const base = income > 0 ? income : Object.values(actual).reduce((a, b) => a + b, 0);
  const rows: PlanRow[] = [];
  for (const share of ["needs", "wants", "save", "give"] as Share[]) {
    const tp = t.shares[share] ?? 0;
    if (!tp && !actual[share]) continue;
    rows.push({
      share,
      actual: actual[share],
      target: base * tp,
      actualPct: base > 0 ? actual[share] / base : 0,
      targetPct: tp,
    });
  }
  return rows;
}

/**
 * Monthly budgets from a template: each share's amount, split over its
 * categories in proportion to what they took last time (evenly, if nothing).
 */
export function budgetsFrom(
  t: SpendTemplate,
  income: number,
  categories: readonly string[],
  lastSpent: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const share of ["needs", "wants", "give"] as Share[]) {
    const cats = categories.filter((c) => shareOf(c) === share);
    if (!cats.length) continue;
    const pot = income * (t.shares[share] ?? 0);
    const weight = cats.reduce((a, c) => a + Math.max(0, lastSpent[c] ?? 0), 0);
    for (const c of cats) {
      const w = weight > 0 ? Math.max(0, lastSpent[c] ?? 0) / weight : 1 / cats.length;
      out[c] = Math.round((pot * w) / 100) * 100;
    }
  }
  return out;
}
