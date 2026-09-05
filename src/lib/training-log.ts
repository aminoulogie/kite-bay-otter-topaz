import seed from "./training-seed.json";
import { exerciseKey } from "./exercise-key";
import { getLocalDateKey } from "./soma/dates";
import type { HistorySession, LiveSession } from "./types";

export interface LoggedSet {
  weight: number;
  reps: number;
  failure: number;
  bodyweight?: boolean;
  added?: number;
}

export interface ExerciseLog {
  name: string;
  key: string | null;
  group: string;
  bw?: boolean;
  days: Record<string, LoggedSet[]>;
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

export function sessionDateKey(session: {
  date?: string;
  forDate?: string;
  timestamp?: number;
}): string {
  if (session.date) return session.date;
  if (session.forDate) return session.forDate;
  if (session.timestamp) return getLocalDateKey(new Date(session.timestamp));
  return getLocalDateKey(new Date());
}

export interface TrainingLogExtras {
  archive?: HistorySession[];
  live?: LiveSession | null;
}

export function buildTrainingLog(
  history: Record<string, HistorySession>,
  bodyweightByDate: Record<string, number> = {},
  extras: TrainingLogExtras = {},
): ExerciseLog[] {
  const byKey = new Map<string, ExerciseLog>();
  for (const e of fromSeed(bodyweightByDate)) byKey.set(exerciseKey(e.name), e);

  const sessions: HistorySession[] = [
    ...(extras.archive || []),
    ...Object.values(history || {}),
  ];

  const live = extras.live;
  if (live?.exercises?.some((ex) => ex.sets.some((s) => s.done))) {
    sessions.push({
      timestamp: live.firstSetAt ?? live.startTime ?? Date.now(),
      date: live.forDate || getLocalDateKey(new Date()),
      split: live.split,
      durationFormatted: "",
      caloriesBurned: 0,
      totalVol: 0,
      totalSets: 0,
      axialVol: 0,
      exercises: live.exercises,
      muscles: {},
    });
  }

  const replaced = new Set<string>();

  for (const session of sessions) {
    if (!session?.exercises?.length) continue;
    const date = sessionDateKey(session);

    for (const ex of session.exercises) {
      const done = (ex.sets || []).filter((s) => s.done);
      if (!done.length) continue;

      const key = exerciseKey(ex.name);
      let entry = byKey.get(key);
      if (!entry) {
        entry = { name: ex.name, key: ex.targetKeys?.[0] ?? null, group: ex.muscle || "Other", days: {} };
        byKey.set(key, entry);
      } else {
        entry.name = ex.name;
        entry.key ??= ex.targetKeys?.[0] ?? null;
      }
      const bw = ex.isBW ? nearestBodyweight(bodyweightByDate, date) : 0;
      const mapped = done.map((s) => {
        const added = Number(s.weight) || 0;
        return {
          weight: ex.isBW ? bw + added : added,
          reps: Number(s.reps) || 0,
          failure: Math.max(0, (Number(s.failure) || 3) - 3),
          ...(ex.isBW ? { bodyweight: true, added } : {}),
        };
      });
      const stamp = `${key}|${date}`;
      if (!replaced.has(stamp)) {
        entry.days[date] = mapped;
        replaced.add(stamp);
      } else {
        entry.days[date] = [...(entry.days[date] || []), ...mapped];
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

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

export function estimated1RM(s: LoggedSet): number {
  if (!s.weight || !s.reps) return 0;
  return s.weight * (1 + s.reps / 30);
}

export function dayBest(sets: LoggedSet[]): number {
  return sets.reduce((m, s) => Math.max(m, estimated1RM(s)), 0);
}

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
