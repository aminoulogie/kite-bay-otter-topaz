/**
 * The daily series behind the Charts page: one value per day per measure,
 * with the day's target and floor where the measure has them.
 *
 * Pure: everything it reads is passed in, so a range of days can be built and
 * tested without a store.
 */
import { bodyweightOn, buildDayInputs, foodTotals, previousSameSplit } from "./day-inputs.ts";
import { scoreDay } from "./day-score.ts";
import { habitDayScore, KEEP_AT } from "./habit-score.ts";
import { totalWaterMl } from "./hydration.ts";
import type { HungerEntry, Phase } from "./hunger.ts";
import type { Habit, HistorySession, NutritionDay } from "./types.ts";
import { totalSleepHours } from "./naps.ts";

export type SeriesId = "score" | "calories" | "protein" | "sleep" | "habits" | "weight" | "water" | "volume";

export interface SeriesDef {
  id: SeriesId;
  label: string;
  unit: string;
  /** Categorical slot, 1-8, fixed per measure so a colour always means the same thing. */
  slot: number;
  decimals: number;
  /** A trend line (moving average) instead of target/floor lines. */
  trend?: number;
  /** Logged now and then, not daily: draw through the gaps. */
  connect?: boolean;
  /** Draw as bars (a value only on some days, like volume on training days). */
  bars?: boolean;
}

export const SERIES: SeriesDef[] = [
  { id: "score", label: "Day score", unit: "", slot: 1, decimals: 0 },
  { id: "calories", label: "Calories", unit: "kcal", slot: 2, decimals: 0 },
  { id: "protein", label: "Protein", unit: "g", slot: 3, decimals: 0 },
  { id: "sleep", label: "Sleep", unit: "h", slot: 4, decimals: 1 },
  { id: "habits", label: "Habits", unit: "%", slot: 5, decimals: 0 },
  { id: "weight", label: "Weight", unit: "kg", slot: 6, decimals: 1, trend: 7, connect: true },
  { id: "water", label: "Water", unit: "L", slot: 7, decimals: 1 },
  { id: "volume", label: "Volume", unit: "kg", slot: 8, decimals: 0, bars: true },
];

export interface Point {
  date: string;
  value: number | null;
  target: number | null;
  min: number | null;
}

export interface ChartInput {
  dates: string[];
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  habits: Habit[];
  hunger: HungerEntry[];
  phase: Phase | undefined;
  restDays: Record<string, number>;
  /** Whether a date was a planned training day, from the programme. */
  isTrainingDay: (date: string) => boolean;
}

export function datesBack(days: number, end = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}

const r = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export function buildSeries(id: SeriesId, input: ChartInput): Point[] {
  const firstSession = Object.keys(input.history).sort()[0] ?? null;
  return input.dates.map((date) => {
    const day = input.nutrition[date];
    const logged = (day?.items?.length ?? 0) > 0;
    switch (id) {
      case "score": {
        const session = input.history[date] ?? null;
        const training = input.isTrainingDay(date);
        const s = scoreDay(
          buildDayInputs({
            date, session, previous: previousSameSplit(input.history, date), nutrition: input.nutrition,
            isRestDay: !session && (!!input.restDays[date] || !training), isTrainingDay: training, firstSession,
            bodyweightKg: bodyweightOn(input.nutrition, date), hunger: input.hunger, phase: input.phase, habits: input.habits,
          }),
        );
        return { date, value: s.tracked > 0 ? s.score : null, target: 80, min: 70 };
      }
      case "calories": {
        const t = day?.goals?.cals ?? null;
        return { date, value: logged ? Math.round(foodTotals(day).cals) : null, target: t, min: t ? Math.round(t * 0.9) : null };
      }
      case "protein": {
        const t = day?.goals?.protein ?? null;
        return { date, value: logged ? Math.round(foodTotals(day).p) : null, target: t, min: t ? Math.round(t * 0.8) : null };
      }
      case "sleep":
        return { date, value: totalSleepHours(day), target: 8, min: 7 };
      case "habits":
        return { date, value: habitDayScore(input.habits, date).score, target: 100, min: KEEP_AT };
      case "weight":
        return { date, value: day?.bodyWeight ?? null, target: null, min: null };
      case "water": {
        const goal = day?.goals?.water ?? null;
        const ml = totalWaterMl(day);
        return { date, value: ml > 0 ? r(ml / 1000, 2) : null, target: goal ? r(goal / 1000, 2) : null, min: goal ? r((goal * 0.75) / 1000, 2) : null };
      }
      case "volume": {
        const s = input.history[date];
        return { date, value: s?.totalVol ? Math.round(s.totalVol) : null, target: null, min: null };
      }
    }
  });
}

/** A trailing moving average over the last `n` logged values. */
export function movingAverage(points: Point[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  const window: number[] = [];
  for (const p of points) {
    if (p.value != null) {
      window.push(p.value);
      if (window.length > n) window.shift();
    }
    out.push(window.length >= Math.min(3, n) ? window.reduce((a, b) => a + b, 0) / window.length : null);
  }
  return out;
}

export interface SeriesStats {
  latest: number | null;
  average: number | null;
  /** Change of this period's average against the one before it, in %. */
  change: number | null;
  /** Days at or above the floor, of the days with a value. */
  onTarget: { hit: number; of: number } | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function statsOf(points: Point[], previous: Point[]): SeriesStats {
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const prev = previous.map((p) => p.value).filter((v): v is number => v != null);
  const a = avg(vals);
  const b = avg(prev);
  const withFloor = points.filter((p) => p.value != null && p.min != null);
  return {
    latest: vals.length ? vals[vals.length - 1]! : null,
    average: a,
    change: a != null && b != null && b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null,
    onTarget: withFloor.length ? { hit: withFloor.filter((p) => p.value! >= p.min!).length, of: withFloor.length } : null,
  };
}
