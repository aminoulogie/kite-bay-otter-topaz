import seed from "./training-seed.json";
import type { HistorySession } from "./types";

/**
 * The flat training log behind the Database and Graphs views.
 *
 * Imported spreadsheet history and workouts logged in the app are one dataset
 * here. They are NOT merged into HistorySession: that type carries a split,
 * calories, duration and per-muscle stimulus, none of which the spreadsheet
 * recorded, so filling it would mean inventing four fields per row. Instead
 * both sources project down into the flat shape these views actually need,
 * and HistorySession stays the richer record for sessions that really have
 * that detail.
 */

export interface LoggedSet {
  weight: number; // kg, actual — bar and both sides already resolved on import
  reps: number;
  failure: number; // 0-3, how close to failure (from the f/ff/fff notation)
}

export interface ExerciseLog {
  name: string;
  key: string | null; // muscle key, matching the body map
  group: string; // display grouping: Chest, Back, Legs...
  days: Record<string, LoggedSet[]>; // ISO date -> that day's sets
}

interface Seed {
  version: number;
  records: number;
  exercises: { name: string; key: string | null; group: string; days: Record<string, number[][]> }[];
}

function fromSeed(): ExerciseLog[] {
  return (seed as unknown as Seed).exercises.map((e) => ({
    name: e.name,
    key: e.key,
    group: e.group,
    days: Object.fromEntries(
      Object.entries(e.days).map(([d, sets]) => [
        d,
        sets.map(([weight, reps, failure]) => ({
          weight: weight ?? 0,
          reps: reps ?? 0,
          failure: failure ?? 0,
        })),
      ]),
    ),
  }));
}

/**
 * Fold sessions logged in the app into the imported history.
 *
 * Keyed on exercise name and date, so re-running this — on every render, or
 * after a re-import — cannot duplicate a set. A day present in both wins from
 * the app, since that is the record with real set-by-set detail.
 */
export function buildTrainingLog(history: Record<string, HistorySession>): ExerciseLog[] {
  const byName = new Map<string, ExerciseLog>();
  for (const e of fromSeed()) byName.set(e.name, e);

  for (const session of Object.values(history || {})) {
    if (!session?.exercises?.length) continue;
    const date = new Date(session.timestamp || Date.now()).toISOString().slice(0, 10);

    for (const ex of session.exercises) {
      const done = (ex.sets || []).filter((s) => s.done);
      if (!done.length) continue;

      let entry = byName.get(ex.name);
      if (!entry) {
        entry = { name: ex.name, key: ex.targetKeys?.[0] ?? null, group: ex.muscle || "Other", days: {} };
        byName.set(ex.name, entry);
      }
      entry.days[date] = done.map((s) => ({
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        failure: Math.max(0, (Number(s.failure) || 3) - 3),
      }));
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Epley. Used for the heat scale so a heavy triple ranks above a light twelve. */
export function estimated1RM(s: LoggedSet): number {
  if (!s.weight || !s.reps) return 0;
  return s.weight * (1 + s.reps / 30);
}

export function dayBest(sets: LoggedSet[]): number {
  return sets.reduce((m, s) => Math.max(m, estimated1RM(s)), 0);
}

/** `80x12; 90x12; 100x12` — the format the sheet used, kept. */
export function formatDay(sets: LoggedSet[]): string {
  return sets.map((s) => `${+s.weight.toFixed(1)}x${s.reps}`).join("; ");
}

export function allDates(log: ExerciseLog[]): string[] {
  const s = new Set<string>();
  for (const e of log) for (const d of Object.keys(e.days)) s.add(d);
  return [...s].sort();
}

export function groupsOf(log: ExerciseLog[]): string[] {
  return [...new Set(log.map((e) => e.group))].sort();
}
