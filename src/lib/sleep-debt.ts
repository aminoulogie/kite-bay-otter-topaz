/**
 * Sleep debt, and the things that actually move it.
 *
 * Debt is the running shortfall against a nightly need, and it does NOT
 * accumulate forever: the body recovers some of it regardless, and a debt
 * figure that only ever climbs is both wrong and useless — after a bad month
 * it would read as an unpayable number nobody acts on.
 *
 * So the running total decays, and a long night pays real debt back rather
 * than merely stopping the bleeding.
 */

export const DEFAULT_NEED_HOURS = 8;

/** Debt older than this has largely been absorbed and stops being counted. */
const DECAY_PER_NIGHT = 0.12;

/** A long night pays back less than hour-for-hour: you cannot fully catch up. */
const REPAYMENT_EFFICIENCY = 0.6;

/** Beyond this the running total is capped — the point is action, not a score. */
const MAX_DEBT_HOURS = 30;

export interface SleepNight {
  date: string;
  hours: number;
  quality?: number; // 1-5
}

export interface DebtPoint {
  date: string;
  hours: number;
  debt: number;
}

export function sleepDebtSeries(
  nights: SleepNight[],
  needHours = DEFAULT_NEED_HOURS,
): DebtPoint[] {
  const sorted = [...nights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: DebtPoint[] = [];
  let debt = 0;

  for (const n of sorted) {
    // Old debt fades whether or not it is repaid.
    debt *= 1 - DECAY_PER_NIGHT;

    const delta = needHours - n.hours;
    if (delta > 0) {
      debt += delta; // short night: straight onto the tab
    } else {
      debt += delta * REPAYMENT_EFFICIENCY; // long night: partial repayment
    }

    debt = Math.max(0, Math.min(MAX_DEBT_HOURS, debt));
    out.push({ date: n.date, hours: n.hours, debt: Math.round(debt * 10) / 10 });
  }
  return out;
}

export function currentDebt(nights: SleepNight[], needHours = DEFAULT_NEED_HOURS): number {
  const s = sleepDebtSeries(nights, needHours);
  return s.length ? s[s.length - 1]!.debt : 0;
}

export function debtLabel(debt: number): string {
  if (debt < 2) return "rested";
  if (debt < 5) return "slightly down";
  if (debt < 10) return "carrying debt";
  return "badly short";
}

/**
 * Nights of extra sleep needed to clear the debt.
 *
 * At the repayment rate above, not hour-for-hour, because that is what
 * actually happens — telling someone one long lie-in clears a week is wrong.
 */
export function nightsToClear(debt: number, extraHoursPerNight = 1.5): number | null {
  if (debt <= 0) return 0;
  const perNight = extraHoursPerNight * REPAYMENT_EFFICIENCY;
  if (perNight <= 0) return null;
  return Math.ceil(debt / perNight);
}

// ------------------------------------------------------------- sleep inputs --

/**
 * Nutrients with real evidence behind them for sleep, and honest wording.
 *
 * Deliberately short. Magnesium and glycine have reasonable support; the rest
 * of the usual list does not, and padding this out would make the app look
 * like it is selling supplements rather than tracking anything.
 */
export interface SleepFactor {
  id: string;
  label: string;
  target: string;
  note: string;
  /** Which nutrient key in the food log backs this, when one does. */
  nutrientKey?: "magnesium" | "calcium" | "potassium" | "zinc";
}

export const SLEEP_FACTORS: SleepFactor[] = [
  {
    id: "magnesium",
    label: "Magnesium",
    target: "300-400mg/day",
    note: "The best-supported of the sleep minerals, and commonly low on a training diet.",
    nutrientKey: "magnesium",
  },
  {
    id: "zinc",
    label: "Zinc",
    target: "8-11mg/day",
    note: "Studied alongside magnesium; the effect on its own is modest.",
    nutrientKey: "zinc",
  },
  {
    id: "caffeine_cutoff",
    label: "Caffeine cutoff",
    target: "8h before bed",
    note: "Half of a dose is still circulating around six hours later.",
  },
  {
    id: "consistency",
    label: "Same bedtime",
    target: "within 30 min",
    note: "A steady schedule moves sleep quality more than most supplements do.",
  },
];
