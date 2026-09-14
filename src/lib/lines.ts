/**
 * Finding the lines on a page.
 *
 * There is no such thing as a line in HTML. A paragraph is one box, and where
 * it breaks depends on the font, the size, the width and the language — which
 * is exactly why a line-by-line reading mode cannot be built by wrapping
 * anything in markup. The browser knows, though: a Range over a paragraph
 * reports one client rect per line box it was actually drawn on.
 *
 * So this takes those rects and answers the only questions the reader has:
 * which of them are on this page, what order do they read in, and which ones
 * are really the same line reported twice because the text changed style
 * halfway along it.
 *
 * Pure, and rects are plain numbers, so the ordering can be tested without a
 * browser — which is the part that goes wrong.
 */

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Rects shorter than this are collapsed whitespace, not a line of text. */
const MIN_HEIGHT = 4;
/** Rects narrower than this are a stray space at the end of a line. */
const MIN_WIDTH = 6;

/**
 * The lines of text inside a window, in reading order.
 *
 * `window` is the page: in paged mode only one column is on screen and the
 * rest are laid out off to the right, so the filter is what stops the focus
 * jumping to a line you cannot see. Rects are kept when their CENTRE is
 * inside, not their edges — a line that begins with a hanging quotation mark
 * starts a pixel or two left of the column and must not be thrown away.
 *
 * `tolerance` is how far two rects' tops may differ and still be one line. A
 * word in italics, a superscript, or a larger first letter all report their
 * own rect at a slightly different top, and without this every styled word
 * becomes a line of its own.
 */
export function linesIn(
  rects: readonly Rect[],
  window: { left: number; right: number; top?: number; bottom?: number },
  tolerance = 6,
): Rect[] {
  const inside = rects.filter((r) => {
    const h = r.bottom - r.top;
    const w = r.right - r.left;
    if (h < MIN_HEIGHT || w < MIN_WIDTH) return false;
    const cx = (r.left + r.right) / 2;
    if (cx < window.left || cx > window.right) return false;
    if (window.top !== undefined && r.bottom <= window.top) return false;
    if (window.bottom !== undefined && r.top >= window.bottom) return false;
    return true;
  });

  // Reading order before merging, so "same line" only ever compares rects
  // that are actually adjacent.
  const sorted = [...inside].sort((a, b) => a.top - b.top || a.left - b.left);

  const lines: Rect[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.top - last.top) <= tolerance) {
      // Same line, reported in pieces. The union of the pieces IS the line,
      // and the taller of the two tops/bottoms keeps a superscript inside it.
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
      last.top = Math.min(last.top, r.top);
      last.bottom = Math.max(last.bottom, r.bottom);
      continue;
    }
    lines.push({ ...r });
  }
  return lines;
}

/**
 * Which line the reader should be on after moving by `delta`.
 *
 * Returns null when it has walked off either end, which is the signal to turn
 * the page rather than to clamp — a focus that sticks on the last line while
 * you keep tapping is a reader that has stopped responding.
 */
export function stepLine(current: number, delta: number, count: number): number | null {
  if (count <= 0) return null;
  const next = current + delta;
  if (next < 0 || next >= count) return null;
  return next;
}

/**
 * The line nearest a point.
 *
 * Not used by the tap handler — a tap in line mode always steps, because
 * having to aim at the lit line turns reading into a series of small targets.
 * Kept because "which line is at this y" is the question anything that wants
 * to START somewhere has to ask, and it is one line of arithmetic that is
 * easy to get subtly wrong in the gaps between lines.
 */
export function lineAt(lines: readonly Rect[], y: number): number {
  if (lines.length === 0) return 0;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const gap = y < l.top ? l.top - y : y > l.bottom ? y - l.bottom : 0;
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
    if (gap === 0) break;
  }
  return best;
}
