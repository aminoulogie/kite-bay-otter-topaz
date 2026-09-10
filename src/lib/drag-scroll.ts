/**
 * Scrolling the list while a row is held.
 *
 * Once a drag properly suppresses the browser's own scrolling — which it must,
 * or the page moves instead of the row — the list can no longer be scrolled by
 * the finger holding the row. On a seven-day programme that is fine. On a
 * diary with thirty foods in it, the target is usually off screen and the drag
 * becomes impossible to complete.
 *
 * So while a row is held, holding the finger near the top or bottom edge
 * scrolls the list under it, faster the closer to the edge. This is what every
 * touch drag implementation ends up doing, because there is no other gesture
 * left to spend.
 */

/** How close to an edge before the list starts moving. */
export const EDGE_PX = 76;

/** Pixels per frame at the very edge. ~14 is brisk without overshooting. */
export const MAX_SPEED = 14;

/**
 * How fast to scroll, given how deep into the edge zone the finger is.
 *
 * Ramped rather than constant: a constant speed either crawls when you are
 * trying to cross a long list or bolts the moment you stray near the bottom of
 * the screen. Squared so the slow end is generous — most of the zone is a
 * gentle nudge and only the last few pixels are fast.
 */
export function edgeVelocity(clientY: number, top: number, bottom: number): number {
  const height = bottom - top;
  // A viewport too short for two edge zones would scroll in both directions at
  // once from the middle, which reads as the list vibrating.
  const edge = Math.min(EDGE_PX, height / 3);
  if (edge <= 0) return 0;

  if (clientY < top + edge) {
    const depth = (top + edge - clientY) / edge;
    return -Math.round(MAX_SPEED * Math.min(1, depth) ** 2);
  }
  if (clientY > bottom - edge) {
    const depth = (clientY - (bottom - edge)) / edge;
    return Math.round(MAX_SPEED * Math.min(1, depth) ** 2);
  }
  return 0;
}

/** The nearest ancestor that actually scrolls, or null for the window. */
export function scrollableFrom(el: Element | null): HTMLElement | null {
  let node = el as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight + 4) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

let frame = 0;
let velocity = 0;
let container: HTMLElement | null = null;

function tick() {
  frame = 0;
  if (!velocity) return;
  if (container) container.scrollTop += velocity;
  else window.scrollBy(0, velocity);
  frame = requestAnimationFrame(tick);
}

/**
 * Point the auto-scroller at wherever the finger is now.
 *
 * Called on every move. Cheap when the finger is nowhere near an edge, which
 * is almost always.
 */
export function updateDragScroll(clientY: number, under: Element | null): void {
  container = scrollableFrom(under);
  const box = container?.getBoundingClientRect();
  velocity = edgeVelocity(
    clientY,
    box ? box.top : 0,
    box ? box.bottom : window.innerHeight,
  );
  if (velocity && !frame) frame = requestAnimationFrame(tick);
  if (!velocity && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

export function stopDragScroll(): void {
  velocity = 0;
  container = null;
  if (frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}
