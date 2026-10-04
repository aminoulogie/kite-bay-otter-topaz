/**
 * Did each meal happen, on time?
 *
 * Every meal time owns a window: from an hour before it to an hour before the
 * next one (the first from midnight, the last to midnight). Food confirmed in
 * the first part — up to 90 minutes after the meal time — is on time; later
 * inside the window is late. A meal is judged against what the plan gave it:
 * 70% of its calories is "ate what I needed".
 *
 * Verdicts are final. Once one is written it is never recomputed, so a meal
 * marked skipped stays skipped however much is eaten afterwards — the point
 * is an honest record of when food actually went in.
 */

import { minutesOf } from "./meal-pace.ts";

export type VerdictStatus = "ontime" | "late" | "skipped";

export interface MealVerdict {
  status: VerdictStatus;
  label: string;
  time: string;
  /** Calories confirmed inside the window, and what the meal was worth. */
  kcal: number;
  target: number;
  /** When it was decided, epoch ms. */
  at: number;
}

export const ENOUGH = 0.7;
export const BEFORE_MIN = 60;
export const ON_TIME_AFTER_MIN = 90;

export const verdictKey = (slot: { time: string; label: string }) => `${slot.time}|${slot.label}`;

/** Minutes after midnight of `date` for an epoch time, or null if it is another day. */
function minuteOn(date: string, at: number): number | null {
  const d = new Date(at);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return key === date ? d.getHours() * 60 + d.getMinutes() : null;
}

/**
 * Verdicts that can be decided by `nowMin` (minutes after midnight; 1440 or
 * more for a day that is over). Meals still open are left out.
 */
export function judge(
  date: string,
  slots: { label: string; time: string; planned: number }[],
  eaten: { cals?: number; eatenAt?: number }[],
  nowMin: number,
  nowMs: number,
): Record<string, MealVerdict> {
  const out: Record<string, MealVerdict> = {};
  const mins = eaten
    .map((e) => ({ cals: e.cals || 0, m: e.eatenAt ? minuteOn(date, e.eatenAt) : null }))
    .filter((e): e is { cals: number; m: number } => e.m !== null);

  slots.forEach((s, i) => {
    const t = minutesOf(s.time);
    const start = i === 0 ? 0 : t - BEFORE_MIN;
    const end = i === slots.length - 1 ? 1440 : minutesOf(slots[i + 1]!.time) - BEFORE_MIN;
    const onTimeEnd = Math.min(end, t + ON_TIME_AFTER_MIN);
    let onTime = 0;
    let late = 0;
    for (const e of mins) {
      if (e.m >= start && e.m < onTimeEnd) onTime += e.cals;
      else if (e.m >= onTimeEnd && e.m < end) late += e.cals;
    }
    const need = Math.max(1, s.planned * ENOUGH);
    const base = { label: s.label, time: s.time, target: s.planned, at: nowMs };
    if (onTime >= need) out[verdictKey(s)] = { ...base, status: "ontime", kcal: Math.round(onTime) };
    else if (nowMin >= onTimeEnd && onTime + late >= need) out[verdictKey(s)] = { ...base, status: "late", kcal: Math.round(onTime + late) };
    else if (nowMin >= end) out[verdictKey(s)] = { ...base, status: "skipped", kcal: Math.round(onTime + late) };
  });
  return out;
}
