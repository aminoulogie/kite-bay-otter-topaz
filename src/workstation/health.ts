/** Day-by-day health series for the workstation's Health page. */

import { addDays, getLocalDateKey, parseLocalDateKey } from "../lib/soma/dates.ts";
import type { HistorySession, NutritionDay } from "../lib/types.ts";

export interface DayPoint {
  date: string;
  value: number | null;
}

/** The last `n` date keys ending today, oldest first. */
export function lastDays(today: string, n: number): string[] {
  const t = parseLocalDateKey(today);
  return Array.from({ length: n }, (_, i) => getLocalDateKey(addDays(t, i - n + 1)));
}

/** Calories and protein eaten per day; null where nothing was logged. */
export function intake(nutrition: Record<string, NutritionDay | undefined>, days: string[]) {
  return days.map((date) => {
    const items = nutrition[date]?.items ?? [];
    if (!items.length) return { date, cals: null as number | null, protein: null as number | null };
    return {
      date,
      cals: Math.round(items.reduce((a, i) => a + (i.cals || 0), 0)),
      protein: Math.round(items.reduce((a, i) => a + (i.p || 0), 0)),
    };
  });
}

export function weights(nutrition: Record<string, NutritionDay | undefined>, days: string[]): DayPoint[] {
  return days.map((date) => ({ date, value: nutrition[date]?.bodyWeight || null }));
}

export function sleep(nutrition: Record<string, NutritionDay | undefined>, days: string[]): DayPoint[] {
  return days.map((date) => ({ date, value: nutrition[date]?.sleep?.hours ?? null }));
}

/** Average of the non-null values, or null. */
export function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Training volume per Monday-start week, the last `weeks` weeks. */
export function weeklyVolume(history: Record<string, HistorySession | undefined>, today: string, weeks: number) {
  const t = parseLocalDateKey(today);
  const monday = addDays(t, -((t.getDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const start = getLocalDateKey(addDays(monday, (i - weeks + 1) * 7));
    const end = getLocalDateKey(addDays(monday, (i - weeks + 2) * 7));
    let vol = 0;
    let sessions = 0;
    for (const [d, s] of Object.entries(history)) {
      if (s && d >= start && d < end) {
        vol += Number(s.totalVol) || 0;
        sessions++;
      }
    }
    return { week: start, volume: Math.round(vol), sessions };
  });
}
