/**
 * What is still open at the end of a day, for the evening check-in.
 *
 * One list, so the button on Home and the sheet itself can never disagree
 * about how many things are left.
 */
import type { Habit, HistorySession, NutritionDay } from "./types.ts";

export interface CheckinState {
  sleep: boolean;
  weight: boolean;
  creatine: boolean;
  /** Habits not yet ticked today. */
  habits: Habit[];
  /** Foods still grayed out (planned, not eaten). */
  planned: number;
  /** A planned training day with no session and no saved rest. */
  workout: boolean;
}

export function checkinFor(input: {
  date: string;
  nutrition: Record<string, NutritionDay>;
  habits: Habit[];
  session: HistorySession | null | undefined;
  restSaved: boolean;
  isTrainingDay: boolean;
}): CheckinState {
  const day = input.nutrition[input.date];
  return {
    sleep: day?.sleep?.hours == null,
    weight: !day?.bodyWeight,
    creatine: !(day?.creatine ?? 0),
    habits: (input.habits ?? []).filter((h) => h.history?.[input.date] !== true),
    planned: day?.planned?.length ?? 0,
    workout: input.isTrainingDay && !input.session && !input.restSaved,
  };
}

/** How many things are open. Weight is optional and never counted. */
export function openCount(s: CheckinState): number {
  return (s.sleep ? 1 : 0) + (s.creatine ? 1 : 0) + s.habits.length + s.planned + (s.workout ? 1 : 0);
}

/** From five in the afternoon — before that the day is still being lived. */
export const CHECKIN_FROM_HOUR = 17;
