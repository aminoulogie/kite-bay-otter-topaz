/**
 * Where the on-screen keyboard is, and what has to move out of its way.
 *
 * iOS does not resize the layout viewport when the keyboard opens. The page
 * keeps its full height and the keyboard is simply drawn on top of the bottom
 * third of it, so everything pinned with `position: fixed` — every sheet in
 * this app — stays exactly where it was, underneath the keys. What the user
 * sees is a field they have just tapped disappearing behind the keyboard, and
 * the browser scrolling the page around by itself trying to rescue it.
 *
 * The visual viewport is the only thing that knows. `visualViewport.height`
 * shrinks by the height of the keyboard while `window.innerHeight` does not,
 * and the difference between them IS the keyboard. Everything here is that one
 * subtraction and what to do with the answer.
 *
 * Pure on purpose: the DOM half lives in use-keyboard.ts, so the arithmetic
 * that decides how far something moves can be tested without a browser.
 */

/**
 * Below this, the gap is browser chrome rather than a keyboard.
 *
 * Safari's collapsing address bar, the bottom toolbar and the accessory strip
 * above a hardware keyboard all shrink the visual viewport by a few dozen
 * pixels. Treating those as a keyboard would lift every sheet permanently and
 * leave a strip of backdrop along the bottom of the screen for no reason. A
 * real software keyboard is never under 200px on any phone.
 */
export const KEYBOARD_MIN = 90;

/** Breathing room between the bottom of a field and the top of the keys. */
export const FIELD_GAP = 12;

export interface ViewportLike {
  height: number;
  offsetTop: number;
}

/**
 * How many pixels of the window the keyboard is covering.
 *
 * `offsetTop` matters as much as `height`: when the page is zoomed or scrolled
 * within the visual viewport the visible slice is offset from the top of the
 * layout viewport, and ignoring that reports a keyboard taller than it is.
 */
export function insetFrom(
  viewport: ViewportLike | null | undefined,
  innerHeight: number,
): number {
  if (!viewport) return 0;
  const height = Number(viewport.height);
  const offset = Number(viewport.offsetTop) || 0;
  const window_ = Number(innerHeight);
  if (!Number.isFinite(height) || !Number.isFinite(window_)) return 0;
  const covered = Math.round(window_ - (height + offset));
  return covered >= KEYBOARD_MIN ? covered : 0;
}

/**
 * How far to scroll so a field sits just above the keyboard.
 *
 * Positive scrolls the content up (the field moves up the screen); negative
 * pulls it back down. Zero means leave it alone, which is the answer far more
 * often than it looks — a field already in clear space must not be nudged
 * simply because it was focused, and that unnecessary nudge is most of what
 * reads as "the app jumps when I type".
 *
 * The lift is capped at `top - gap` so a tall field, or one near the top of
 * the screen, is never pushed off the top edge to satisfy its own bottom.
 */
export function liftFor(
  top: number,
  bottom: number,
  keyboardTop: number,
  gap: number = FIELD_GAP,
): number {
  if (![top, bottom, keyboardTop, gap].every((n) => Number.isFinite(n))) return 0;

  // Above the visible area: scrolled past, so bring it back down.
  if (top < gap) return Math.round(top - gap);

  const over = bottom + gap - keyboardTop;
  if (over <= 0) return 0;
  return Math.round(Math.min(over, top - gap));
}

/** The y coordinate, in client space, where the keyboard begins. */
export function keyboardTopFrom(
  viewport: ViewportLike | null | undefined,
  innerHeight: number,
): number {
  if (!viewport) return Number(innerHeight) || 0;
  const height = Number(viewport.height);
  const offset = Number(viewport.offsetTop) || 0;
  if (!Number.isFinite(height)) return Number(innerHeight) || 0;
  return height + offset;
}

/** Fields the keyboard opens for. A button focused by tab does not count. */
export const FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]';
