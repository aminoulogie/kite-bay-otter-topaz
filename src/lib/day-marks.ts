/**
 * What happened on a day, across everything the app tracks.
 *
 * The calendar could only answer "did I train", because training was all it
 * read. A day where you ate well, stayed under budget and read for an hour but
 * did not lift looked identical to a day where nothing happened at all.
 *
 * Five marks, one per domain, deliberately boolean. A month grid cell is about
 * forty pixels wide; it can carry "there is something here" for five things,
 * and it cannot carry how much. The day card below answers how much.
 */

import type { Habit, HistorySession, LedgerEntry, MindEntry, NutritionDay } from "./types.ts";

export const DOMAINS = ["train", "food", "money", "mind", "habits"] as const;
export type Domain = (typeof DOMAINS)[number];

/** Tailwind classes per domain, so the grid and the day card agree on colour. */
export const DOMAIN_DOT: Record<Domain, string> = {
  train: "bg-emerald-500",
  food: "bg-orange-400",
  money: "bg-sky-400",
  mind: "bg-violet-400",
  habits: "bg-accent",
};

export const DOMAIN_LABEL: Record<Domain, string> = {
  train: "Trained",
  food: "Ate",
  money: "Spent",
  mind: "Read",
  habits: "Habits",
};

export interface DayMarksInput {
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  ledger: LedgerEntry[];
  mind: MindEntry[];
  habits: Habit[];
}

export type DayMarks = Record<Domain, boolean>;

/**
 * Marks for every day that has anything at all, keyed by date.
 *
 * Built in one pass over each store rather than per day, because the month
 * grid asks about 42 cells and a per-day scan would walk every ledger entry
 * 42 times.
 */
export function buildDayMarks(input: DayMarksInput): Map<string, DayMarks> {
  const out = new Map<string, DayMarks>();
  const mark = (date: string, domain: Domain) => {
    if (!date) return;
    const row = out.get(date) ?? { train: false, food: false, money: false, mind: false, habits: false };
    row[domain] = true;
    out.set(date, row);
  };

  for (const [date, session] of Object.entries(input.history)) {
    if (session) mark(date, "train");
  }
  for (const [date, day] of Object.entries(input.nutrition)) {
    if ((day?.items?.length ?? 0) > 0) mark(date, "food");
  }
  for (const entry of input.ledger) mark(entry.date, "money");
  for (const entry of input.mind) mark(entry.date, "mind");
  for (const habit of input.habits) {
    for (const [date, done] of Object.entries(habit.history ?? {})) {
      // Explicitly true: a habit history carries false for days actively
      // marked not-done, and a red cross is not a thing that happened.
      if (done === true) mark(date, "habits");
    }
  }
  return out;
}

/** The domains present on one day, in a stable order. */
export function domainsOn(marks: Map<string, DayMarks>, date: string): Domain[] {
  const row = marks.get(date);
  if (!row) return [];
  return DOMAINS.filter((d) => row[d]);
}

/**
 * A day's numbers, for the card under the grid.
 *
 * Returns null per domain where nothing was logged rather than zero: "no money
 * logged" and "spent nothing" are different days, and the card says so.
 */
export interface DaySummary {
  spend: number | null;
  income: number | null;
  mindEntries: number;
  habitsDone: number;
  habitsTotal: number;
}

export function summariseDay(input: DayMarksInput, date: string): DaySummary {
  const onDay = input.ledger.filter((e) => e.date === date);
  const spend = onDay.filter((e) => e.kind !== "income");
  const income = onDay.filter((e) => e.kind === "income");
  const sum = (rows: LedgerEntry[]) =>
    Math.round(rows.reduce((a, e) => a + Math.abs(Number(e.amount) || 0), 0) * 100) / 100;

  return {
    spend: spend.length ? sum(spend) : null,
    income: income.length ? sum(income) : null,
    mindEntries: input.mind.filter((m) => m.date === date).length,
    habitsDone: input.habits.filter((h) => h.history?.[date] === true).length,
    habitsTotal: input.habits.length,
  };
}
