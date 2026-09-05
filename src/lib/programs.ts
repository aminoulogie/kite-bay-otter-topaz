/**
 * Training programmes: the sequence of days the whole app is scheduled from.
 *
 * One array drives the calendar labels, the Train tab's "today is Legs B", the
 * backfill screen, rest-day detection in the day score, and the projections in
 * Ahead. Making that array come from a user-chosen programme is the whole
 * feature — nothing downstream needs to know a programme exists, it just reads
 * the sequence it is given.
 *
 * Two shapes, because two things get called a "routine":
 *
 *   cycle — a repeating run of N days that ignores the calendar week. PPLULR
 *           is six days and simply rolls; a Thursday is whatever the cycle
 *           says it is.
 *   week  — pinned to weekdays. Sunday through Saturday, and any day left
 *           unassigned is a rest day rather than a hole.
 *
 * Supporting only the first makes "I train Mon/Wed/Fri" unexpressible;
 * supporting only the second makes a six-day rotation impossible.
 */

export const REST_DAY = "Rest & Active Recovery";

export const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

export type ProgramKind = "cycle" | "week";

/** Fallback phase for a cycle with no anchor of its own. */
const CYCLE_EPOCH = "2026-01-04"; // a Sunday, so an unanchored cycle lines up with the week

export interface Program {
  id: string;
  name: string;
  kind: ProgramKind;
  /**
   * Split names in order. For a week this is exactly 7, indexed from Sunday.
   * For a cycle it is however many days the rotation runs.
   */
  days: string[];
  /**
   * ISO date the cycle starts from. Ignored for a week programme, which is
   * anchored to the calendar itself.
   *
   * Stored per programme so switching does not silently re-phase the other
   * one — a rotation that restarts every time you glance at another programme
   * would make the schedule unpredictable.
   */
  anchor?: string;
  builtIn?: boolean;
}

export function isRestSplit(name: string): boolean {
  return name.toLowerCase().includes("rest");
}

/** A week with every day rest, ready to be filled in. */
export function emptyWeek(): string[] {
  return WEEKDAYS.map(() => REST_DAY);
}

/**
 * Pad or trim a week to exactly seven days.
 *
 * Unassigned days become rest rather than being dropped, which is what makes
 * "add push, pull, rest, push" produce a complete week instead of a
 * four-day fragment.
 */
export function normaliseWeek(days: string[]): string[] {
  const out = days.slice(0, 7);
  while (out.length < 7) out.push(REST_DAY);
  return out.map((d) => d || REST_DAY);
}

export function makeProgram(partial: Partial<Program> & { name: string }): Program {
  const kind = partial.kind ?? "cycle";
  const days = kind === "week" ? normaliseWeek(partial.days ?? []) : (partial.days ?? [REST_DAY]);
  return {
    id: partial.id ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: partial.name,
    kind,
    days: days.length ? days : [REST_DAY],
    anchor: partial.anchor,
    builtIn: partial.builtIn,
  };
}

/**
 * Local calendar date, not UTC.
 *
 * The whole app keys days locally; anchoring in UTC would stamp tomorrow for
 * anyone saving late in the evening east of Greenwich and phase their entire
 * cycle by a day.
 */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(fromIso: string, to: Date): number {
  const [y, m, d] = fromIso.split("-").map(Number);
  const a = Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/**
 * Which split a given date falls on.
 *
 * The modulo is written to stay positive: a plain `%` returns a negative index
 * for dates before the anchor, which would silently read off the end of the
 * array and give every past day the wrong split.
 */
export function splitForDate(program: Program, date: Date): string {
  if (!program.days.length) return REST_DAY;

  if (program.kind === "week") {
    // getDay() is already Sunday-indexed, which is why WEEKDAYS starts there.
    return normaliseWeek(program.days)[date.getDay()] ?? REST_DAY;
  }

  // A fixed epoch, never "today": today recomputed on each call would make the
  // current date day 1 every day, so the cycle would sit on its first split
  // forever instead of advancing. Programmes saved through the builder always
  // carry an anchor, so this only catches hand-edited or future-written data —
  // where advancing from an arbitrary date is wrong but silent-freezing is worse.
  const anchor = program.anchor ?? CYCLE_EPOCH;
  const diff = daysBetween(anchor, date);
  const len = program.days.length;
  const idx = ((diff % len) + len) % len;
  return program.days[idx] ?? REST_DAY;
}

/** Move an entry, for drag-to-reorder. Out-of-range indices leave it untouched. */
export function reorder(days: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= days.length || to >= days.length) {
    return days;
  }
  const next = [...days];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export const PROGRAMS_KEY = "soma-programs";
export const ACTIVE_PROGRAM_KEY = "soma-active-program";

/**
 * Resolve the active programme from raw state.
 *
 * A plain function over its inputs, deliberately taking the fallback rather
 * than building one: anything that constructs a Program returns a new object,
 * and a new object coming out of a zustand selector makes the store see a
 * changed snapshot on every render. React then re-renders until it throws
 * #185. That is exactly how this shipped broken once, so the only programme
 * objects in play are ones created a single time and passed in.
 */
export function resolveActiveProgram(
  programs: Program[],
  activeId: string | null,
  fallback: Program,
): Program {
  if (!activeId) return fallback;
  return programs.find((p) => p.id === activeId) ?? fallback;
}

/**
 * The rotation the app shipped with, as a programme.
 *
 * Kept so that an install which never opens this screen behaves exactly as it
 * did before, and so "what was I on?" always has an answer.
 *
 * Call this once and hold the result — see resolveActiveProgram above.
 */
export function defaultProgram(rotation: string[]): Program {
  return makeProgram({
    id: "built-in",
    name: "Default rotation",
    kind: "cycle",
    days: [...rotation],
    // The date the shipped rotation was anchored to, so switching away and
    // back does not shift every historical label by a day.
    anchor: "2026-08-23",
    builtIn: true,
  });
}

export function loadPrograms(): Program[] {
  try {
    const raw = localStorage.getItem(PROGRAMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is Program =>
        !!p && typeof p.name === "string" && Array.isArray(p.days) && typeof p.id === "string",
    );
  } catch {
    return [];
  }
}

export function savePrograms(programs: Program[]): void {
  try {
    localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));
  } catch {
    /* a full store must not lose the programme being edited */
  }
}

export function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROGRAM_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_PROGRAM_KEY, id);
  } catch {
    /* selection is not worth breaking the screen over */
  }
}

/** How many training days a week this programme actually works out to. */
export function trainingDaysPerWeek(program: Program): number {
  const training = program.days.filter((d) => !isRestSplit(d)).length;
  if (program.kind === "week") return training;
  // A cycle does not align to weeks, so this is the average rather than a count.
  return Math.round((training / program.days.length) * 7 * 10) / 10;
}
