/**
 * When the app may replace the Train sheet on its own, and what it keeps when
 * it does.
 *
 * The app rebuilds the sheet from the programme at boot, at midnight, and
 * whenever the programme or its data changes (a restore, a vault sync). It
 * used to decide the sheet was free to rebuild when no set was TICKED — but
 * plenty of lifting is logged by typing the numbers in and ticking at the
 * end, so two exercises typed in and not yet ticked read as "nothing here"
 * and were swapped for the programme's template on the next launch.
 *
 * A sheet is now only untouched when it is exactly what the app itself put
 * there: empty, or the template as it was loaded (`pristine`). Anything
 * typed, added, removed or ticked is the user's. And whenever a sheet is
 * replaced anyway, what was on it goes onto the Undo stack first, so no
 * replacement can be the last anyone sees of a session.
 */
import type { LiveSession } from "./types.ts";

type Sheet = Pick<LiveSession, "exercises" | "undoStack"> & { pristine?: string };

export function liveIsUntouched(live: Sheet): boolean {
  if (live.exercises.some((ex) => ex.sets.some((s) => s.done))) return false;
  if (live.exercises.length === 0) return true;
  // A sheet saved before `pristine` existed cannot prove it is untouched, so
  // it is treated as the user's: keeping a stale template costs a tap,
  // throwing away a session costs the session.
  return live.pristine != null && JSON.stringify(live.exercises) === live.pristine;
}

/** `next`, carrying `old`'s exercises one Undo away if they were the user's. */
export function withRescue<T extends { undoStack: string[] }>(next: T, old: Sheet): T {
  const undoStack = liveIsUntouched(old)
    ? old.undoStack
    : [...old.undoStack, JSON.stringify(old.exercises)].slice(-25);
  return { ...next, undoStack };
}
