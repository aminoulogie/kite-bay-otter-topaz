/**
 * Haptics, where the platform allows them.
 *
 * iOS Safari and WKWebView expose no vibration API at all — navigator.vibrate
 * is absent, not merely ignored — so on the platform this app is built for,
 * these are no-ops. They are still worth having: Android and desktop Chrome do
 * support them, and a Capacitor haptics plugin can be dropped in behind this
 * same interface later without touching a single call site.
 *
 * Every call is guarded, because a missing API here must never break a set
 * being logged.
 */

type Pattern = number | number[];

function buzz(pattern: Pattern): void {
  try {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === "function") nav.vibrate(pattern);
  } catch {
    /* haptics are a nicety; never let one break the action it accompanies */
  }
}

/** Selection: a tap that changed something. Deliberately very short. */
export const tapLight = () => buzz(8);

/** A set marked done. */
export const tapMedium = () => buzz(14);

/** A personal record. Two pulses, so it is felt as an event rather than a tap. */
export const tapSuccess = () => buzz([12, 40, 22]);

/** Something refused — a warning, not a punishment. */
export const tapWarn = () => buzz([18, 60, 18]);

/**
 * Whether motion should be minimised.
 *
 * Checked at call time rather than cached: the setting can change while the
 * app is open, and a cached value would keep animating for someone who has
 * just asked it to stop.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
