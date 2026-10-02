/**
 * Habits that tick themselves.
 *
 * Most habits are a number SOMA already holds — the session that was saved,
 * the protein that was eaten, the water, the steps Apple Health counted.
 * Asking you to also tick a box for them is asking twice. A habit with a rule
 * here is ticked the moment its number is reached.
 *
 * Only ever TICKS. A rule never takes a tick away: a habit you ticked by hand
 * stays ticked, and one the rule ticked stays ticked if the food is later
 * moved — taking a day back is your call, not the app's.
 */
import type { HabitAuto, HistorySession, MindEntry, NutritionDay } from "./types.ts";
import type { ScreenTimeDay } from "./screen-time.ts";
import { foodTotals } from "./day-inputs.ts";
import { totalWaterMl } from "./hydration.ts";

export interface AutoContext {
  date: string;
  day?: NutritionDay;
  session?: HistorySession | null;
  mind: MindEntry[];
  screen?: ScreenTimeDay;
  /** Apple Health today, when connected. */
  health?: { steps?: number; activeKcal?: number } | null;
  /** When "Going to sleep" was tapped for the night that ended today (ms). */
  bedtimeMs?: number | null;
  /** Spent today vs. the daily share of the monthly budget, if one is set. */
  spend?: { spent: number; dailyBudget: number } | null;
}

export const AUTO_LABELS: Record<HabitAuto["kind"], string> = {
  workout: "A workout is saved",
  protein: "Protein target reached",
  water: "Water goal reached",
  calories: "Calories near target",
  creatine: "Creatine logged",
  sleep: "Slept at least…",
  bedtime: "In bed before…",
  steps: "Steps (Apple Health)",
  activeKcal: "Active calories (Apple Health)",
  reading: "Read at least… (Mind)",
  mind: "Logged in Mind",
  screen: "Screen time under…",
  underBudget: "Spent under the daily budget",
};

/** Whether the rule's condition is met today. */
export function autoDone(rule: HabitAuto, c: AutoContext): boolean {
  const day = c.day;
  switch (rule.kind) {
    case "workout":
      return !!c.session && (c.session.totalSets ?? 0) > 0;
    case "protein": {
      const target = day?.goals?.protein ?? 0;
      return target > 0 && foodTotals(day).p >= target;
    }
    case "water": {
      const goal = day?.goals?.water ?? 0;
      return goal > 0 && totalWaterMl(day) >= goal;
    }
    case "calories": {
      const goal = day?.goals?.cals ?? 0;
      const kcal = foodTotals(day).cals;
      return goal > 0 && (day?.items?.length ?? 0) > 0 && Math.abs(kcal - goal) <= goal * (rule.within / 100);
    }
    case "creatine":
      return (day?.creatine ?? 0) > 0;
    case "sleep":
      return (day?.sleep?.hours ?? 0) >= rule.hours;
    case "bedtime": {
      if (!c.bedtimeMs) return false;
      const [h, m] = rule.before.split(":").map(Number);
      const t = new Date(c.bedtimeMs);
      // A bedtime after midnight counts as "late" against an evening limit.
      const mins = t.getHours() * 60 + t.getMinutes();
      const asMins = mins < 12 * 60 ? mins + 24 * 60 : mins;
      const limit = (h ?? 23) * 60 + (m ?? 0);
      const limitAs = limit < 12 * 60 ? limit + 24 * 60 : limit;
      return asMins <= limitAs;
    }
    case "steps":
      return (c.health?.steps ?? 0) >= rule.min;
    case "activeKcal":
      return (c.health?.activeKcal ?? 0) >= rule.min;
    case "reading":
      return c.mind.filter((e) => e.date === c.date && e.kind === "book").reduce((t, e) => t + (e.count ?? 0), 0) >= rule.minutes;
    case "mind":
      return c.mind.some((e) => e.date === c.date && (e.kind === rule.mindKind || (rule.mindKind === "research" && e.kind === "article")));
    case "screen":
      return c.screen != null && c.screen.total > 0 && c.screen.total <= rule.under;
    case "underBudget":
      return !!c.spend && c.spend.dailyBudget > 0 && c.spend.spent <= c.spend.dailyBudget;
  }
}

/** A rule to suggest from a habit's name, for habits that predate rules. */
export function suggestAuto(name: string): HabitAuto | null {
  const n = name.toLowerCase();
  if (/\b(train|gym|lift|workout)\b/.test(n)) return { kind: "workout" };
  if (/protein/.test(n)) return { kind: "protein" };
  if (/hydrat|water|drink/.test(n)) return { kind: "water" };
  if (/creatine/.test(n)) return { kind: "creatine" };
  const steps = /(\d+(?:[.,]\d+)?)\s*(k)?\s*steps?/.exec(n);
  if (steps) return { kind: "steps", min: Math.round(parseFloat(steps[1]!.replace(",", ".")) * (steps[2] ? 1000 : 1)) };
  if (/\bsteps?\b|walk/.test(n)) return { kind: "steps", min: 8000 };
  if (/\bread/.test(n)) return { kind: "reading", minutes: 20 };
  if (/sleep/.test(n)) return { kind: "sleep", hours: 7 };
  return null;
}

/** One line describing a rule, for the habit card. */
export function describeAuto(rule: HabitAuto): string {
  switch (rule.kind) {
    case "sleep": return `Slept ${rule.hours} h+`;
    case "bedtime": return `In bed before ${rule.before}`;
    case "steps": return `${rule.min.toLocaleString()} steps`;
    case "activeKcal": return `${rule.min} active kcal`;
    case "reading": return `Read ${rule.minutes} min`;
    case "calories": return `Calories within ${rule.within}%`;
    case "screen": return `Screen under ${rule.under} min`;
    case "mind": return `Logged ${rule.mindKind} in Mind`;
    default: return AUTO_LABELS[rule.kind];
  }
}
