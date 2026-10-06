/**
 * When you train, said once and read everywhere.
 *
 * Train shows it on the session, the Time tab puts it on the day, and Fuel
 * builds the eating around it: a pre-workout meal an hour before and a
 * post-workout meal half an hour after, which is the only way a pre-workout
 * gets eaten at the right time rather than remembered in the car park.
 *
 * One time for every training day, a different one per weekday if wanted,
 * and a one-off for a single date. Rest days — as the programme decides them
 * — have no session at all.
 */

import { cleanTimes, minutesOf, type MealTime } from "./meal-pace.ts";
import { parseLocalDateKey } from "./soma/dates.ts";

export interface WorkoutTimeSettings {
  /** "HH:MM" on any training day without its own time. */
  time: string;
  /** How long a session runs, in minutes. */
  mins: number;
  /** Per weekday, 0 = Sunday. A time, or absent to use `time`. */
  days?: Partial<Record<number, string>>;
  /** One date only: a time, or "" for no session that day. */
  dates?: Record<string, string>;
}

export const DEFAULT_WORKOUT_TIME: WorkoutTimeSettings = { time: "18:00", mins: 75 };

/** Before the session, the pre-workout meal: inside the "light meal" window. */
export const PRE_BEFORE_MIN = 60;
/** After the session, the post-workout meal. */
export const POST_AFTER_MIN = 30;

const valid = (t: unknown): t is string => typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t);

export function hhmmOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export interface WorkoutSlot {
  date: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  time: string;
}

/** The session on `date`, or null on a rest day or a day switched off. */
export function workoutSlot(date: string, s: WorkoutTimeSettings | undefined, isRest: boolean): WorkoutSlot | null {
  const cfg = s ?? DEFAULT_WORKOUT_TIME;
  const one = cfg.dates?.[date];
  if (one === "") return null;
  if (isRest && !valid(one)) return null;
  const weekday = parseLocalDateKey(date).getDay();
  const time = valid(one) ? one : valid(cfg.days?.[weekday]) ? cfg.days![weekday]! : valid(cfg.time) ? cfg.time : DEFAULT_WORKOUT_TIME.time;
  const start = minutesOf(time);
  const mins = Math.max(15, Math.min(300, Math.round(cfg.mins || DEFAULT_WORKOUT_TIME.mins)));
  return { date, start, end: Math.min(1439, start + mins), time: hhmmOf(start) };
}

/**
 * The slot, moved to when training ACTUALLY started.
 *
 * The scheduled time is a plan, and the plan is wrong the moment you walk in
 * an hour late — but it is the plan that the pre-workout meal, the post-
 * workout meal and the day's whole macro split are built around. One logged
 * set is the app finding out where you really are, so from that moment the
 * day is rebuilt around the real time instead of the intended one.
 *
 * `startedAt` is minutes after midnight. Null leaves the plan alone, which is
 * what every day before you touch a barbell wants.
 *
 * The length stays the planned length while the session is open: how long you
 * will be in there is not known until you leave, and a post-workout meal that
 * creeps later with every set is worse than one placed on a sane estimate.
 * Once the session is saved its real length is known and `mins` carries it.
 */
export function startedSlot(
  slot: WorkoutSlot | null,
  startedAt: number | null,
  mins?: number,
): WorkoutSlot | null {
  if (!slot) return null;
  if (startedAt == null || !Number.isFinite(startedAt)) return slot;
  const start = Math.max(0, Math.min(1439, Math.round(startedAt)));
  const length = Number.isFinite(Number(mins)) && Number(mins) > 0
    ? Math.round(Number(mins))
    : slot.end - slot.start;
  return { date: slot.date, start, end: Math.min(1439, start + length), time: hhmmOf(start) };
}

/** Minutes after midnight for an epoch time, in the device's own zone. */
export function minutesAt(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * The real start of a session already saved to history.
 *
 * The duration clock runs from the first set to the moment Save is pressed,
 * and the timestamp IS that moment — so the subtraction gives back the first
 * set to the minute rather than approximating it. "47:30" is minutes:seconds,
 * not hours:minutes, which is the trap in reading this field.
 */
export function savedStart(session: { timestamp?: number; durationFormatted?: string } | undefined): number | null {
  const at = Number(session?.timestamp);
  if (!Number.isFinite(at) || at <= 0) return null;
  const m = /^(\d+):(\d{2})$/.exec(String(session?.durationFormatted ?? ""));
  if (!m) return null;
  const mins = Number(m[1]);
  if (!Number.isFinite(mins)) return null;
  return minutesAt(at - mins * 60000);
}

/**
 * The day's eating times with the session in them.
 *
 * Any meal that would land from two hours before the session to an hour
 * after it is taken out — nobody eats dinner mid-set — and its share goes to
 * a Pre-workout meal an hour before (40%) and a Post-workout meal half an
 * hour after (60%), never less than 10% and 15% of the day.
 */
export function mealsAround(times: MealTime[] | undefined, slot: WorkoutSlot | null): MealTime[] {
  const list = cleanTimes(times);
  if (!slot) return list;
  // Two hours out: a snack an hour before the pre-workout meal is the same
  // feed twice, and protein spaced under ~3 h apart does less (Areta 2013).
  const from = slot.start - 120;
  const to = slot.end + 60;
  const kept: MealTime[] = [];
  let moved = 0;
  for (const t of list) {
    const m = minutesOf(t.time);
    if (m >= from && m <= to) moved += t.share;
    else kept.push(t);
  }
  const pre = { label: "Pre-workout", time: hhmmOf(Math.max(0, slot.start - PRE_BEFORE_MIN)), share: Math.max(10, Math.round(moved * 0.4)) };
  const post = { label: "Post-workout", time: hhmmOf(Math.min(1439, slot.end + POST_AFTER_MIN)), share: Math.max(15, Math.round(moved * 0.6)) };
  return cleanTimes([...kept, pre, post]);
}

/** Minutes from now to the session's start; negative once it has begun. */
export function minutesUntil(slot: WorkoutSlot | null, now: Date): number | null {
  if (!slot) return null;
  return slot.start - (now.getHours() * 60 + now.getMinutes());
}
