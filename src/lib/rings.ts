/**
 * The day's four rings, for any date: calories and protein eaten, water
 * drunk, calories burnt training — each against its goal.
 *
 * Pulled out of the Home card so the week strip and the calendar can draw
 * the same rings for other days. Confirmed food only, as everywhere else: a
 * planned meal is not food yet.
 */
import { DEFAULT_GOALS } from "./soma/data.ts";
import { totalWaterMl } from "./hydration.ts";
import { sessionBurn } from "./training-burn.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

export type RingId = "cals" | "protein" | "water" | "burnt";

export interface RingDef {
  id: RingId;
  label: string;
  unit: string;
  /** Start and end of the ring's gradient, as the watch draws it. */
  from: string;
  to: string;
}

/** Outer to inner. */
export const RING_DEFS: RingDef[] = [
  // Vivid, as the watch draws them: a deep start running to a bright end.
  { id: "cals", label: "Calories", unit: "CAL", from: "#fa114f", to: "#ff4fa0" },
  { id: "protein", label: "Protein", unit: "G", from: "#7dff00", to: "#d8ff2e" },
  { id: "water", label: "Water", unit: "ML", from: "#00d8ff", to: "#3dffe8" },
  { id: "burnt", label: "Burned", unit: "CAL", from: "#ff6a00", to: "#ffc000" },
];

/** What a day of training is meant to cost, when nothing else says. */
export const BURN_TARGET = 500;

export interface RingValue {
  value: number;
  goal: number;
}

export function ringValues(
  day: NutritionDay | undefined,
  session: HistorySession | undefined | null,
  bodyweight: number,
  fallback: Partial<Record<"cals" | "protein" | "water", number>> = {},
): Record<RingId, RingValue> {
  const eaten = day?.items ?? [];
  const goals = { ...DEFAULT_GOALS, ...fallback, ...(day?.goals ?? {}) } as Record<string, number>;
  return {
    cals: { value: eaten.reduce((a, i) => a + (i.cals || 0), 0), goal: goals.cals || 2400 },
    protein: { value: eaten.reduce((a, i) => a + (i.p || 0), 0), goal: goals.protein || 160 },
    water: { value: totalWaterMl(day), goal: goals.water || 3500 },
    burnt: { value: sessionBurn(session, bodyweight || undefined).gross, goal: BURN_TARGET },
  };
}

/** The share of a goal reached, 0 upwards — past 1 is a ring going round again. */
export function share(v: RingValue): number {
  return v.goal > 0 ? Math.max(0, v.value / v.goal) : 0;
}

/** Latest weighed bodyweight, for the burn model. */
export function latestWeight(nutrition: Record<string, { bodyWeight?: number } | undefined>): number {
  const dated = Object.keys(nutrition ?? {}).filter((k) => nutrition[k]?.bodyWeight).sort();
  return dated.length ? nutrition[dated[dated.length - 1]!]!.bodyWeight ?? 0 : 0;
}
