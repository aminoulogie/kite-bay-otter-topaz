/**
 * Moving between photographs, the way a story does.
 *
 * A month grid is how you FIND a photo; it is a poor way to look through a
 * run of them. Going back to the grid and hunting for the next square breaks
 * the one thing pictures taken on a schedule are good for — watching something
 * change across weeks.
 *
 * The subtlety is what "next" means. Not the next calendar day: most days have
 * no photograph, and stepping through them is a run of dead taps with an empty
 * frame at the end of each. Next means **the next day that actually has one**,
 * which is also what makes the position readable — "4 of 17" counts pictures,
 * not dates.
 *
 * Deliberately no wrapping. Running off the end of December into January is
 * disorienting in a set ordered by time, and the hard stop is the only signal
 * saying "that is all of them".
 */

/** The next dated photo after `from`, or null at the end. */
export function nextPhotoDate(dates: string[], from: string): string | null {
  for (const d of sorted(dates)) if (d > from) return d;
  return null;
}

/** The previous dated photo before `from`, or null at the start. */
export function prevPhotoDate(dates: string[], from: string): string | null {
  const list = sorted(dates);
  for (let i = list.length - 1; i >= 0; i--) if (list[i]! < from) return list[i]!;
  return null;
}

/**
 * Which picture this is, and how many there are.
 *
 * `index` is null when the day being viewed has no photograph of its own —
 * opening an empty day to capture one is a normal thing to do, and the viewer
 * still has to be able to step out of it in either direction.
 */
export function positionIn(dates: string[], date: string): { index: number | null; total: number } {
  const list = sorted(dates);
  const i = list.indexOf(date);
  return { index: i < 0 ? null : i, total: list.length };
}

/** Unique and ascending, whatever order they arrived in. */
function sorted(dates: string[]): string[] {
  return [...new Set(dates ?? [])].filter(Boolean).sort();
}

/** Which half of a frame was tapped, for story-style navigation. */
export const TAP_BACK_FRACTION = 0.33;

export function tapSide(x: number, width: number): "prev" | "next" | null {
  if (!(width > 0)) return null;
  const f = x / width;
  if (f < 0) return null;
  if (f > 1) return null;
  return f < TAP_BACK_FRACTION ? "prev" : "next";
}
