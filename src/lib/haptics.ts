/**
 * Haptics, where the platform allows them.
 *
 * iOS Safari and WKWebView expose no vibration API at all — navigator.vibrate
 * is absent, not merely ignored. The native build goes through the Capacitor
 * haptics plugin instead (below); the PWA on iPhone stays silent.
 *
 * Every call is guarded, because a missing API here must never break a set
 * being logged.
 */

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

type Pattern = number | number[];

/**
 * In the native iOS build the Taptic Engine is reachable through the
 * Capacitor plugin, so each named haptic maps to its closest iOS feel there.
 * Everywhere else the vibration pattern is used (Android, desktop), and on
 * iOS Safari nothing happens — as before.
 */
type NativeFeel = { impact: ImpactStyle } | { notify: NotificationType };

function native(feel: NativeFeel): boolean {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    if ("impact" in feel) void Haptics.impact({ style: feel.impact }).catch(() => {});
    else void Haptics.notification({ type: feel.notify }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

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
export const tapLight = () => native({ impact: ImpactStyle.Light }) || buzz(8);

/** A set marked done. */
export const tapMedium = () => native({ impact: ImpactStyle.Medium }) || buzz(14);

/** A personal record. Two pulses, so it is felt as an event rather than a tap. */
export const tapSuccess = () => native({ notify: NotificationType.Success }) || buzz([12, 40, 22]);

/** Something refused — a warning, not a punishment. */
export const tapWarn = () => native({ notify: NotificationType.Warning }) || buzz([18, 60, 18]);

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
