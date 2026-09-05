/**
 * Pinch-zoom and pan for the charts, TradingView style.
 *
 * The maths is separated from the gesture handling so it can be tested without
 * a DOM: getting a zoom anchor wrong is the kind of bug that only shows up as
 * "the chart jumps away from my fingers", which is miserable to debug by hand.
 *
 * Two rules shape it:
 *
 * The point under the fingers STAYS under the fingers. Zooming about the
 * centre of the view instead is what makes a chart feel like it is fighting
 * you — you pinch on a spike and the spike slides off screen.
 *
 * A pinch is committed to one axis. A gesture that is mostly horizontal zooms
 * time only; mostly vertical zooms value only. Scaling both at once from a
 * two-finger gesture means neither ends up where the user meant, because
 * fingers are never perfectly aligned.
 */

export interface Domain {
  min: number;
  max: number;
}

export type Axis = "x" | "y" | "both";

/** How far in and out a chart may go, relative to its full extent. */
const MIN_SPAN_RATIO = 0.02; // 50x zoom in
const MAX_SPAN_RATIO = 1; // never further out than the data

/**
 * Zoom a domain about a fixed point.
 *
 * `anchor` is in DATA units, and is the value that must not move. `factor`
 * below 1 zooms in.
 */
export function zoomDomain(
  domain: Domain,
  full: Domain,
  factor: number,
  anchor: number,
): Domain {
  const fullSpan = full.max - full.min;
  if (fullSpan <= 0) return domain;

  const span = domain.max - domain.min;
  const minSpan = fullSpan * MIN_SPAN_RATIO;
  const maxSpan = fullSpan * MAX_SPAN_RATIO;
  const nextSpan = Math.min(maxSpan, Math.max(minSpan, span * factor));

  // Keep the anchor at the same fraction across the view, which is what makes
  // the point under the fingers stay under the fingers.
  const t = span > 0 ? (anchor - domain.min) / span : 0.5;
  let min = anchor - t * nextSpan;
  let max = min + nextSpan;

  // Clamp into the data, preserving the span rather than squashing it — a
  // domain that shrinks at the edge reads as the chart resisting the gesture.
  if (min < full.min) {
    min = full.min;
    max = min + nextSpan;
  }
  if (max > full.max) {
    max = full.max;
    min = max - nextSpan;
  }
  if (min < full.min) min = full.min;

  return { min, max };
}

/** Slide a domain by a distance in data units, without changing its span. */
export function panDomain(domain: Domain, full: Domain, delta: number): Domain {
  const span = domain.max - domain.min;
  let min = domain.min + delta;
  let max = min + span;

  if (min < full.min) {
    min = full.min;
    max = min + span;
  }
  if (max > full.max) {
    max = full.max;
    min = max - span;
  }
  return { min, max };
}

/**
 * Which axis a two-finger gesture is asking for.
 *
 * Uses the angle of the line between the fingers, not the direction of travel:
 * fingers placed side by side mean "time", one above the other means "value",
 * and that reads the same whether the user is spreading or pinching.
 */
export function axisForGesture(dx: number, dy: number, tolerance = 2): Axis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay * tolerance) return "x";
  if (ay > ax * tolerance) return "y";
  return "both";
}

/** Distance between two touch points. */
export function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/** Convert a pixel position within a plot to a value on that axis. */
export function pixelToValue(
  pixel: number,
  plotStart: number,
  plotSize: number,
  domain: Domain,
  invert = false,
): number {
  if (plotSize <= 0) return domain.min;
  const t = Math.min(1, Math.max(0, (pixel - plotStart) / plotSize));
  // Screen y grows downward while a value axis grows upward, so the y axis
  // has to be flipped or dragging up would zoom toward the wrong value.
  const frac = invert ? 1 - t : t;
  return domain.min + frac * (domain.max - domain.min);
}

export function isFullyZoomedOut(domain: Domain, full: Domain): boolean {
  const span = domain.max - domain.min;
  const fullSpan = full.max - full.min;
  return fullSpan <= 0 || span >= fullSpan * 0.999;
}
