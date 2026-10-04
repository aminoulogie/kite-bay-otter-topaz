/**
 * What has to go to Apple Health: pure, so it can be tested without a phone.
 *
 * Each item carries a signature of what SOMA holds. It is sent when the
 * signature differs from the one recorded at the last send, so an edited
 * session is re-sent (and replaces the old one in Health — see saveWorkout's
 * `replace`) while an unchanged one is never sent twice.
 */
import type { HistorySession, NutritionDay } from "./types.ts";

export type HealthItem =
  | { key: string; sig: string; kind: "workout"; id: string; start: number; end: number; kcal: number; title: string }
  | { key: string; sig: string; kind: "sleep"; id: string; start: number; end: number }
  | { key: string; sig: string; kind: "weight"; id: string; at: number; kg: number };

/** Sleep has hours but no clock times in SOMA: filed as ending at 07:30. */
export const WAKE_HOUR = 7.5;

export function durationMs(formatted: string | undefined): number {
  const [m, s] = String(formatted ?? "").split(":").map((x) => Number(x) || 0);
  return ((m ?? 0) * 60 + (s ?? 0)) * 1000;
}

const at = (date: string, hour: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setMinutes(Math.round(hour * 60));
  return d.getTime();
};

export function planHealthSync(input: {
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  synced: Record<string, string>;
  /** Only days on or after this are considered — no rewriting old history. */
  since: string;
}): HealthItem[] {
  const out: HealthItem[] = [];
  for (const [date, s] of Object.entries(input.history)) {
    if (date < input.since || !s?.timestamp || !s.totalSets) continue;
    const key = `workout:${date}`;
    const sig = `${s.timestamp}:${s.totalSets}:${Math.round(s.caloriesBurned || 0)}:${s.split}`;
    if (input.synced[key] === sig) continue;
    const dur = Math.max(durationMs(s.durationFormatted), 5 * 60_000);
    out.push({
      key, sig, kind: "workout", id: `soma-workout-${date}`,
      start: s.timestamp - dur, end: s.timestamp,
      kcal: Math.round(s.caloriesBurned || 0), title: s.split || "Strength",
    });
  }
  for (const [date, d] of Object.entries(input.nutrition)) {
    if (date < input.since || !d) continue;
    const hours = d.sleep?.hours;
    if (hours && hours > 0 && hours < 20) {
      const key = `sleep:${date}`;
      // A clocked night carries its real times; a typed one is filed as
      // ending at WAKE_HOUR.
      const clocked = d.sleep?.start && d.sleep?.end ? { start: d.sleep.start, end: d.sleep.end } : null;
      const sig = clocked ? `${hours}@${clocked.start}` : String(hours);
      if (input.synced[key] !== sig) {
        const end = clocked?.end ?? at(date, WAKE_HOUR);
        const start = clocked?.start ?? end - hours * 3_600_000;
        out.push({ key, sig, kind: "sleep", id: `soma-sleep-${date}`, start, end });
      }
    }
    const kg = d.bodyWeight;
    if (kg && kg > 0) {
      const key = `weight:${date}`;
      const sig = String(kg);
      if (input.synced[key] !== sig) {
        out.push({ key, sig, kind: "weight", id: `soma-weight-${date}`, at: at(date, 8), kg });
      }
    }
  }
  return out;
}
