/**
 * Swipe a row left to reveal Delete, the way Mail and Reminders do.
 *
 * The row it runs on already has a press-and-hold that picks the food up and
 * drags it to another meal, so the two gestures have to divide the same finger
 * between them rather than both firing. They divide it by direction and time:
 *
 *   - move sideways before the hold arms -> this is a swipe. useLongPressMove
 *     already cancels its timer once the finger travels more than a few pixels,
 *     so the hold quietly loses and nothing has to reach across to stop it.
 *   - hold still for 300ms -> the drag arms, and the swipe stands down for the
 *     rest of the gesture (the row reports `held`).
 *   - move mostly downwards -> neither. The page scrolls, which is what almost
 *     every touch on this screen is.
 *
 * The last one is why direction is locked once, at the start, instead of being
 * re-read on every move: a finger travelling down a scrolling list wanders
 * sideways by a few pixels constantly, and a row that opened every time it did
 * would make the diary unusable.
 */

/** How far the row slides to park, and the width of the button behind it. */
export const REVEAL_PX = 88;

/**
 * Past this share of the row's width, letting go deletes rather than parks.
 *
 * Apple commits at roughly half. Deleting a logged meal is not deleting a mail
 * you can fish out of a bin, so this sits slightly beyond half — and every
 * delete it commits is undoable for a few seconds regardless.
 */
export const COMMIT_RATIO = 0.55;

/** Travel before the gesture decides what it is. */
export const LOCK_PX = 10;

/** Resistance once the row is dragged past its parked position. */
const RUBBER = 0.55;

export type Lock = "undecided" | "swipe" | "scroll";

/**
 * What a movement means, given where the finger started.
 *
 * Pure so the arbitration can be tested without a browser — it is the part
 * that decides whether the diary scrolls or a row opens, and getting it wrong
 * is the difference between a list that works and one that fights back.
 */
export function decideLock(dx: number, dy: number): Lock {
  if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return "undecided";
  // A swipe has to be both leftwards and more sideways than vertical. The
  // comparison is against the vertical travel rather than a fixed angle, so a
  // deliberate flick still registers while a scroll never does.
  return dx < 0 && Math.abs(dx) > Math.abs(dy) ? "swipe" : "scroll";
}

/**
 * How far the row has actually moved, given the finger's travel.
 *
 * Rightwards is refused outright — there is nothing revealed on that side, and
 * a row that slid right would just look broken. Past the parked position it
 * gets heavier, which is the feedback that says "this is as far as it goes"
 * without a hard stop.
 */
export function offsetFor(dx: number): number {
  const travel = Math.max(0, -dx);
  if (travel <= REVEAL_PX) return travel;
  return REVEAL_PX + (travel - REVEAL_PX) * RUBBER;
}

export type Release = "closed" | "open" | "delete";

/** Where the row lands when the finger lifts. */
export function decideRelease(offset: number, rowWidth: number): Release {
  if (rowWidth > 0 && offset >= rowWidth * COMMIT_RATIO) return "delete";
  // Half of the button's width is enough to mean it — below that the row
  // springs shut, so a graze never leaves a delete button sitting open.
  return offset >= REVEAL_PX / 2 ? "open" : "closed";
}
