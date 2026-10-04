/**
 * A push / pull / legs week built from what was actually trained.
 *
 * Reads the recent sessions, counts how often each exercise came up, sorts
 * each one into push, pull or legs by the muscle it works, and keeps the most
 * repeated ones for each day in the order they were usually done — so the
 * compound you always open with still opens the day.
 */
import type { HistorySession, SessionExercise } from "./types.ts";
import { REST_DAY } from "./programs.ts";

export type Bucket = "push" | "pull" | "legs";

export const SPLIT_NAMES: Record<Bucket, string> = { push: "Push", pull: "Pull", legs: "Legs" };

/**
 * The week, Sunday first (how programmes are stored). Saturday opens the
 * rotation with legs, then push, pull, legs, push, pull — Friday is rest.
 */
export const PPL_WEEK: string[] = [
  "Push", // Sunday
  "Pull", // Monday
  "Legs", // Tuesday
  "Push", // Wednesday
  "Pull", // Thursday
  REST_DAY, // Friday
  "Legs", // Saturday
];

const PULL_NAME = /rear|face ?pull|reverse fly|shrug|curl|row|pull|chin|lat|deadlift/i;
const PUSH_NAME = /press|push|dip|fly|flye|raise|extension|skull|kickback/i;

export function bucketOf(ex: Pick<SessionExercise, "name" | "muscle">): Bucket {
  const m = (ex.muscle || "").toLowerCase();
  const n = ex.name || "";
  if (m === "legs" || m === "core" || m === "glutes" || m === "calves") {
    // A Romanian or stiff-leg deadlift is a leg day lift, whatever its name says.
    return "legs";
  }
  if (m === "chest" || m === "triceps") return "push";
  if (m === "back" || m === "biceps" || m === "neck") return "pull";
  if (m === "shoulders") return /rear|face ?pull|reverse|shrug/i.test(n) ? "pull" : "push";
  // Arms, custom and anything unlabelled: go by the name.
  if (PULL_NAME.test(n) && !/leg curl|hamstring curl/i.test(n)) return "pull";
  if (/leg|squat|lunge|calf|hip thrust|glute/i.test(n)) return "legs";
  if (PUSH_NAME.test(n)) return "push";
  return "legs";
}

export interface BuiltSplit {
  days: Record<Bucket, string[]>;
  /** How many sessions it was built from, and over how many days. */
  sessions: number;
  windowDays: number;
}

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Up to `perDay` exercises a day, most repeated first, kept in usual order. */
export function buildSplit(
  history: Record<string, HistorySession>,
  today: string,
  perDay = 7,
): BuiltSplit {
  let windowDays = 7;
  let picked: HistorySession[] = [];
  for (const span of [7, 14, 28, 56]) {
    windowDays = span;
    const from = addDays(today, -(span - 1));
    picked = Object.entries(history)
      .filter(([d, s]) => d >= from && d <= today && s?.exercises?.some((e) => e.sets?.some((x) => x.done)))
      .map(([, s]) => s);
    if (picked.length >= 3) break;
  }

  const stats = new Map<string, { ex: SessionExercise; count: number; pos: number }>();
  for (const s of picked) {
    const done = s.exercises.filter((e) => e.sets?.some((x) => x.done));
    done.forEach((e, i) => {
      const at = done.length > 1 ? i / (done.length - 1) : 0;
      const cur = stats.get(e.name);
      if (cur) {
        cur.pos = (cur.pos * cur.count + at) / (cur.count + 1);
        cur.count++;
      } else {
        stats.set(e.name, { ex: e, count: 1, pos: at });
      }
    });
  }

  const days: Record<Bucket, string[]> = { push: [], pull: [], legs: [] };
  for (const b of ["push", "pull", "legs"] as const) {
    days[b] = [...stats.values()]
      .filter((s) => bucketOf(s.ex) === b)
      .sort((a, c) => c.count - a.count || a.pos - c.pos)
      .slice(0, perDay)
      .sort((a, c) => a.pos - c.pos)
      .map((s) => s.ex.name);
  }
  return { days, sessions: picked.length, windowDays };
}
