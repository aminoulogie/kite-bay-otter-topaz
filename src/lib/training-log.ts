import seed from "./training-seed.json";
import { exerciseKey } from "./exercise-key";
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
  /**
   * True when the body itself was the load. Pull-ups at 78kg bodyweight are
   * not "0kg": recording them as zero made every bodyweight lift plot as a
   * flat line on the floor and contribute nothing to volume.
   */
  bodyweight?: boolean;
  /** Extra plate hung on a bodyweight movement, if any. */
  added?: number;
}

export interface ExerciseLog {
  name: string;
  key: string | null; // muscle key, matching the body map
  group: string; // display grouping: Chest, Back, Legs...
  /** The body is the load; any logged number is an added plate. */
  bw?: boolean;
  days: Record<string, LoggedSet[]>; // ISO date -> that day's sets
}

interface Seed {
  version: number;
  records: number;
  exercises: {
    name: string; key: string | null; group: string; bw?: boolean;
    days: Record<string, number[][]>;
  }[];
}

function fromSeed(bodyweightByDate: Record<string, number>): ExerciseLog[] {
  return (seed as unknown as Seed).exercises.map((e) => ({
    name: e.name,
    key: e.key,
    group: e.group,
    bw: e.bw,
    days: Object.fromEntries(
      Object.entries(e.days).map(([d, sets]) => [
        d,
        sets.map(([weight, reps, failure]) => {
          const added = weight ?? 0;
          // On a bodyweight lift the sheet recorded only the added plate, so
          // reading it literally plots pull-ups as a flat zero and contributes
          // nothing to volume.
          const bw = e.bw ? nearestBodyweight(bodyweightByDate, d) : 0;
          return {
            weight: e.bw ? bw + added : added,
            reps: reps ?? 0,
            failure: failure ?? 0,
            ...(e.bw ? { bodyweight: true, added } : {}),
          };
        }),
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

export function buildTrainingLog(
  history: Record<string, HistorySession>,
  /** date -> bodyweight in kg, so bodyweight lifts carry their real load */
  bodyweightByDate: Record<string, number> = {},
): ExerciseLog[] {
  // Keyed on the shared form of the name, not the name itself — see
  // exerciseKey. Keying on the raw name is what split every exercise the two
  // vocabularies spell differently into two separate rows.
  const byKey = new Map<string, ExerciseLog>();
  for (const e of fromSeed(bodyweightByDate)) byKey.set(exerciseKey(e.name), e);

  for (const session of Object.values(history || {})) {
    if (!session?.exercises?.length) continue;
    const date = new Date(session.timestamp || Date.now()).toISOString().slice(0, 10);

    for (const ex of session.exercises) {
      const done = (ex.sets || []).filter((s) => s.done);
      if (!done.length) continue;

      const key = exerciseKey(ex.name);
      let entry = byKey.get(key);
      if (!entry) {
        entry = { name: ex.name, key: ex.targetKeys?.[0] ?? null, group: ex.muscle || "Other", days: {} };
        byKey.set(key, entry);
      } else {
        // Show the name the app itself uses. Logging "Leg Extensions" in Train
        // and reading "Leg Extension" here looks like a different exercise, and
        // this is the name the user actually picked.
        entry.name = ex.name;
        // The seed carries no muscle key for some rows; the catalogue does, and
        // the body map and micro-muscle grouping both read it.
        entry.key ??= ex.targetKeys?.[0] ?? null;
      }
      // On a bodyweight movement the logged number is the ADDED plate, so the
      // real load is the body plus that. Falling back to the nearest known
      // bodyweight keeps older sessions from collapsing to zero.
      const bw = ex.isBW ? nearestBodyweight(bodyweightByDate, date) : 0;
      entry.days[date] = done.map((s) => {
        const added = Number(s.weight) || 0;
        return {
          weight: ex.isBW ? bw + added : added,
          reps: Number(s.reps) || 0,
          failure: Math.max(0, (Number(s.failure) || 3) - 3),
          ...(ex.isBW ? { bodyweight: true, added } : {}),
        };
      });
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The bodyweight nearest a given date.
 *
 * Bodyweight is logged sporadically, so an exact match is the exception. The
 * closest reading is far better than zero, and better than a fixed default.
 */
function nearestBodyweight(byDate: Record<string, number>, date: string): number {
  const entries = Object.entries(byDate).filter(([, v]) => v > 0);
  if (!entries.length) return 0;
  let best = entries[0]!;
  let bestGap = Infinity;
  for (const e of entries) {
    const gap = Math.abs(new Date(e[0]).getTime() - new Date(date).getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = e;
    }
  }
  return best[1];
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
/** `80kg x 12; 90kg x 12` — units kept, because "80x12" reads as a score. */
export function formatDay(sets: LoggedSet[]): string {
  return sets.map(formatSet).join("; ");
}

export function formatSet(s: LoggedSet): string {
  if (s.bodyweight) {
    const extra = s.added ? ` +${+s.added.toFixed(1)}` : "";
    return `BW${extra} ${+s.weight.toFixed(1)}kg x ${s.reps}`;
  }
  return `${+s.weight.toFixed(1)}kg x ${s.reps}`;
}

/** The heaviest set of a day, as text — "80kg x 12", not a bare number. */
export function topSetLabel(sets: LoggedSet[]): string {
  if (!sets.length) return "—";
  const top = sets.reduce((a, b) => (b.weight > a.weight ? b : a));
  return formatSet(top);
}

export function allDates(log: ExerciseLog[]): string[] {
  const s = new Set<string>();
  for (const e of log) for (const d of Object.keys(e.days)) s.add(d);
  return [...s].sort();
}

export function groupsOf(log: ExerciseLog[]): string[] {
  return [...new Set(log.map((e) => e.group))].sort();
}
