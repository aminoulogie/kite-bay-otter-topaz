import { RING_DEFS, latestWeight, ringValues, share } from "./rings.ts";
import { addDays, getLocalDateKey } from "./soma/dates.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

/**
 * Today's rings, for the iPhone home-screen widget
 * (ios/App/SomaWidgets, written through ios/App/App/WidgetBridgePlugin.swift).
 *
 * The web side works the numbers out, exactly as the rings in the app do, and
 * hands the widget a finished snapshot: the widget only draws. Two places
 * computing the same ring would sooner or later disagree about it.
 */
export interface WidgetSnapshot {
  date: string;
  rings: { id: string; label: string; unit: string; value: number; goal: number; from: string; to: string }[];
  week: { date: string; f: number[] }[];
}

interface Sources {
  nutrition: Record<string, NutritionDay | undefined>;
  history: Record<string, HistorySession | undefined | null>;
  customGoals?: Partial<Record<"cals" | "protein" | "water", number>>;
}

export function widgetSnapshot(s: Sources, now = new Date()): WidgetSnapshot {
  const weight = latestWeight(s.nutrition);
  const on = (d: string) => ringValues(s.nutrition[d], s.history[d], weight, s.customGoals ?? {});
  const date = getLocalDateKey(now);
  const today = on(date);
  // Monday to Sunday of this week, as the week strip above the rings shows.
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = getLocalDateKey(addDays(monday, i));
    const v = on(d);
    return { date: d, f: RING_DEFS.map((r) => Math.round(share(v[r.id]) * 1000) / 1000) };
  });
  return {
    date,
    rings: RING_DEFS.map((r) => ({
      id: r.id,
      label: r.label,
      unit: r.unit,
      value: Math.round(today[r.id].value),
      goal: Math.round(today[r.id].goal),
      from: r.from,
      to: r.to,
    })),
    week,
  };
}
