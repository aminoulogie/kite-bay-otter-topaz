/**
 * Swipe a row left to reveal Delete, right to confirm it, the way Mail and
 * Reminders do.
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

/**
 * How far the row slides to park.
 *
 * Sized for a round 44px button with air either side rather than for a
 * full-height panel — 44 is the smallest target that is reliably hit with a
 * thumb, and the gap is what keeps it reading as a button beside the row
 * instead of a block welded to it.
 */
export const REVEAL_PX = 72;

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

/**
 * Share of the row's width that commits a CONFIRM — the rightward gesture.
 *
 * Lower than COMMIT_RATIO on purpose. Confirming that you ate a planned meal
 * flips a flag you can flip back; deleting destroys a logged entry. The two
 * are not the same size of decision and should not ask for the same commitment
 * of travel.
 */
export const CONFIRM_RATIO = 0.35;

/**
 * The confirm gesture never parks.
 *
 * Delete reveals a button because the destructive action deserves a second,
 * deliberate tap. Confirming has nothing to reveal — the swipe IS the action —
 * so the row either goes all the way or springs back.
 */
export const CONFIRM_PX = 96;

/** Resistance once the row is dragged past its parked position. */
const RUBBER = 0.55;

/**
 * Resistance on the confirm side, all the way.
 *
 * Heavier than the delete side's rubber because there is no parked position to
 * arrive at — the drag has to feel like it is pushing against something, or a
 * gesture with no landmark reads as the row having come loose.
 */
const RUBBER_RIGHT = 0.75;

export type Lock = "undecided" | "swipe" | "scroll";

/**
 * What a movement means, given where the finger started.
 *
 * Pure so the arbitration can be tested without a browser — it is the part
 * that decides whether the diary scrolls or a row opens, and getting it wrong
 * is the difference between a list that works and one that fights back.
 */
export function decideLock(dx: number, dy: number, allowRight = false): Lock {
  if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return "undecided";
  // A swipe has to be more sideways than vertical. The comparison is against
  // the vertical travel rather than a fixed angle, so a deliberate flick still
  // registers while a scroll never does.
  if (Math.abs(dx) <= Math.abs(dy)) return "scroll";
  // Rightward only counts on a row that has something on that side. On every
  // other row it stays a scroll, so the diary does not twitch sideways.
  return dx < 0 || allowRight ? "swipe" : "scroll";
}

/**
 * How far the row has actually moved, given the finger's travel.
 *
 * On a row with nothing on the right, rightward travel is refused outright —
 * a row that slid towards an empty side would just look broken. On one that
 * has a confirm, it moves against a heavier rubber and reports NEGATIVE.
 *
 * Past the parked position the delete side gets heavier too, which is the
 * feedback that says "this is as far as it goes" without a hard stop.
 */
export function offsetFor(dx: number, allowRight = false): number {
  // Rightward travel comes back NEGATIVE, so one number carries both
  // directions and a caller cannot mistake one for the other.
  // `dx >= 0` rather than `> 0` so a stationary finger returns a plain 0
  // rather than -0, which is the same number and a different string.
  if (dx >= 0) return allowRight && dx > 0 ? -dx * RUBBER_RIGHT : 0;
  const travel = -dx;
  if (travel <= REVEAL_PX) return travel;
  return REVEAL_PX + (travel - REVEAL_PX) * RUBBER;
}

export type Release = "closed" | "open" | "delete" | "confirm";

/** Where the row lands when the finger lifts. */
export function decideRelease(offset: number, rowWidth: number): Release {
  // Rightward: one-shot. Either far enough to mean it, or back where it was.
  if (offset < 0) {
    const travel = -offset;
    const bar = rowWidth > 0 ? Math.min(CONFIRM_PX, rowWidth * CONFIRM_RATIO) : CONFIRM_PX;
    return travel >= bar ? "confirm" : "closed";
  }
  if (rowWidth > 0 && offset >= rowWidth * COMMIT_RATIO) return "delete";
  // Half of the button's width is enough to mean it — below that the row
  // springs shut, so a graze never leaves a delete button sitting open.
  return offset >= REVEAL_PX / 2 ? "open" : "closed";
}
