/**
 * The order of the tabs, and what "next" and "previous" mean.
 *
 * Kept out of the shell because two things now depend on it and they must not
 * disagree: the dock draws them in this order, and a horizontal swipe moves
 * along it. A second copy of the list would eventually swipe to a different
 * tab than the one sitting next to it.
 *
 * Dashboard sits in the middle by design rather than at the left end. What is
 * to its right is the body — train, eat, recover, measure. What is to its left
 * is everything else being tracked. Opening on the middle means either side is
 * one swipe away, and neither is privileged by being the place the app starts.
 */

import type { TabId } from "./types.ts";

export const TAB_ORDER: TabId[] = [
  "mind",
  "looks",
  "money",
  "dashboard",
  "workout",
  "nutrition",
  "habits",
  "body",
  "insights",
  "estimates",
  "settings",
];

/** Where the app opens. */
export const HOME_TAB: TabId = "dashboard";

/**
 * The tab one step along, or null at the ends.
 *
 * Deliberately does NOT wrap. Wrapping would mean one swipe from Setup lands
 * on Mind, which is the far end of the app — a gesture that big should never
 * be an accident, and a hard stop is also the only feedback saying "this is
 * the edge".
 */
export function tabAt(current: TabId, step: number): TabId | null {
  const i = TAB_ORDER.indexOf(current);
  if (i < 0) return null;
  const next = i + step;
  return next >= 0 && next < TAB_ORDER.length ? TAB_ORDER[next]! : null;
}

