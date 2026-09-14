/**
 * Turning a chapter into pages.
 *
 * The whole trick is CSS multi-column: give the text a column exactly as wide
 * as the screen and a fixed height, and the browser lays it out into as many
 * side-by-side columns as it needs. A "page turn" is then a horizontal
 * translate by one column — which is why it is instant, why the text is never
 * re-laid-out mid-swipe, and why this file is arithmetic rather than layout.
 *
 * It is also why every number here has to be exactly right. One pixel out per
 * column and page forty is showing you half of page thirty-nine.
 */

/** The gutter between two pages, and half of it shows at each screen edge. */
export const PAGE_GAP = 40;

/**
 * How many pages a laid-out chapter came to.
 *
 * Columns are `pageWidth` wide with `gap` between them, so n columns measure
 * `n * pageWidth + (n - 1) * gap`. Rounding rather than ceiling: a browser's
 * reported scrollWidth is a fraction of a pixel out often enough that ceil
 * adds a blank page to roughly every other chapter, and a blank page at the
 * end of a chapter reads as the app having lost your place.
 */
export function pageCount(scrollWidth: number, pageWidth: number, gap = PAGE_GAP): number {
  if (!(pageWidth > 0) || !(scrollWidth > 0)) return 1;
  return Math.max(1, Math.round((scrollWidth + gap) / (pageWidth + gap)));
}

/** How far left to slide the column block to bring `page` into view. */
export function pageOffset(page: number, pageWidth: number, gap = PAGE_GAP): number {
  return Math.max(0, page) * (pageWidth + gap);
}

/**
 * Which page a point in the laid-out strip falls on.
 *
 * The inverse of pageOffset, and the half that makes coming back to a book
 * possible: a stored position is an offset in the text, which the browser can
 * turn into an x once the chapter is laid out, which this turns into a page.
 *
 * The gutter belongs to the page BEFORE it — a word that ends up in the gap
 * is the last word of the page it was flowing out of, not the first of the
 * next one.
 */
export function pageForX(x: number, pageWidth: number, gap = PAGE_GAP): number {
  if (!(pageWidth > 0)) return 0;
  return Math.max(0, Math.floor(x / (pageWidth + gap)));
}

/**
 * How far a drag is allowed to move the page.
 *
 * Free travel inside the book; a fifth of it at the two ends, so pulling
 * against the cover says "there is nothing here" the way every list on a
 * phone does, instead of the page simply refusing to move.
 */
export function damp(dx: number, free: boolean): number {
  return free ? dx : dx * 0.2;
}

export function clampPage(page: number, count: number): number {
  if (!Number.isFinite(page)) return 0;
  return Math.min(Math.max(0, Math.floor(page)), Math.max(0, count - 1));
}

/** Travel before a swipe counts as a page turn rather than a tap or a scroll. */
export const TURN_PX = 44;

export type Turn = "prev" | "next" | "stay";

/**
 * What a finished drag meant.
 *
 * Proportional as well as absolute, so a long deliberate drag on a small
 * phone and a short flick on a large one both turn one page. Vertical travel
 * wins outright: a book is a column of text and the commonest thing a thumb
 * does on one is scroll, even when the page itself does not.
 */
export function turnBar(width: number): number {
  return Math.min(TURN_PX, Math.max(16, width * 0.12));
}

export function turnFrom(dx: number, dy: number, width: number): Turn {
  if (Math.abs(dx) <= Math.abs(dy)) return "stay";
  const bar = turnBar(width);
  if (dx <= -bar) return "next";
  if (dx >= bar) return "prev";
  return "stay";
}

/**
 * Whether a gesture in progress has committed to being a page turn.
 *
 * Asked on every move rather than only when the finger lifts, because the
 * answer decides whether the browser is allowed to go on extending a text
 * selection underneath it. Waiting until the end meant a slow swipe arrived
 * with a paragraph selected and turned no page at all — and "slow" is not
 * something a reader should have to avoid being.
 */
export function isTurning(dx: number, dy: number, width: number): boolean {
  return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= turnBar(width);
}

/**
 * Where a tap on the page means to go.
 *
 * The outer sixth of each side turns a page, the middle shows the controls —
 * which is iBooks' arrangement and is the right one: the thumb holding the
 * phone is already near an edge, and the middle of the page is where your
 * eyes are, so tapping there to hide the text would be perverse.
 */
export type Tap = "prev" | "next" | "chrome";

export function tapAt(x: number, width: number): Tap {
  if (!(width > 0)) return "chrome";
  if (x < width / 6) return "prev";
  if (x > width - width / 6) return "next";
  return "chrome";
}

/**
 * Where you are in the whole book, 0..1.
 *
 * Counted in chapters plus the fraction of the one you are in, because a book
 * has no page count until every chapter has been laid out at your font size —
 * and laying out all of them to draw a progress bar would mean a spinner
 * every time you changed the type size.
 */
export function bookProgress(
  chapter: number, chapters: number, page: number, pages: number,
): number {
  if (chapters <= 0) return 0;
  const within = pages > 1 ? Math.min(1, Math.max(0, page / (pages - 1))) : 1;
  const done = Math.min(chapters, Math.max(0, chapter)) + within;
  return Math.min(1, done / chapters);
}
