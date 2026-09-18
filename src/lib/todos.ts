/**
 * Two lists rather than one, and a place the old items go.
 *
 * The to-do card used to be a single list that never forgot anything: every
 * item ever added stayed on screen, ticked or not, until somebody deleted it
 * by hand. That is exactly the shape a "mess" takes — six weeks in, the box
 * you actually care about (what is on for today) is buried under everything
 * you have ever jotted down.
 *
 * So a to-do now belongs to one of two lists:
 *
 * **Today** — `scope: "day"`. It is active for exactly the calendar day it
 * was added to, and falls out of the active list the moment that day ends.
 * Nothing deletes it; it just stops being TODAY's business and becomes
 * yesterday's, which is what makes it findable again.
 *
 * **This week** — `scope: "week"`. Active for the Monday-to-Sunday week it
 * was added in, and falls out the same way when the week turns over.
 *
 * `scope` is optional and undefined reads as `"day"` — every to-do made
 * before this existed was a single flat list tied to the day it was added,
 * which is precisely what `"day"` now means. Nothing about an old to-do
 * changes by this file existing.
 *
 * `date` keeps one meaning for both scopes: the day the item was ADDED (or
 * last moved). A day item is active while that IS today; a week item is
 * active while that day falls in the current week — found by walking it back
 * to its own Monday and comparing Mondays, not by asking whether the field
 * happens to hold one already, so a week item is never mis-filed by how it
 * got there.
 *
 * NOTHING IS EVER DELETED BY TIME PASSING. The only thing that removes an
 * item from the active list before its day or week is up is `cleared` — set
 * by hand, from the "Clear done" button — and even that only hides it from
 * the list you are working from. It is still the same item, still findable
 * in the history grouped by the day or week it belonged to.
 */

import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";
import type { TodoItem } from "./types.ts";

export type TodoScope = "day" | "week";

/** Undefined reads as "day" — see the file header for why. */
export function scopeOf(item: Pick<TodoItem, "scope">): TodoScope {
  return item.scope === "week" ? "week" : "day";
}

/** The Monday that starts the week `dateKey` falls in. */
export function mondayOf(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return getLocalDateKey(addDays(d, -dow));
}

/** Whether this item belongs to the list you would see today. */
export function isActive(item: Pick<TodoItem, "scope" | "date" | "cleared">, todayKey: string): boolean {
  if (item.cleared) return false;
  return scopeOf(item) === "week"
    ? mondayOf(item.date) === mondayOf(todayKey)
    : item.date === todayKey;
}

/** Only the items on one list, active right now. */
export function activeOf<T extends TodoItem>(
  items: readonly T[],
  scope: TodoScope,
  todayKey: string,
): T[] {
  return items.filter((t) => scopeOf(t) === scope && isActive(t, todayKey));
}

/**
 * Everything NOT on the active list, for a given scope — the history.
 *
 * Grouped by the day (or the week) it belonged to, newest group first, so
 * looking back reads the way a diary does: most recent on top.
 */
export interface TodoGroup<T> {
  /** A date key (day scope) or a Monday key (week scope). */
  key: string;
  items: T[];
}

export function historyOf<T extends TodoItem>(
  items: readonly T[],
  scope: TodoScope,
  todayKey: string,
): TodoGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const t of items) {
    if (scopeOf(t) !== scope) continue;
    if (isActive(t, todayKey)) continue;
    const key = scope === "week" ? mondayOf(t.date) : t.date;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, items]) => ({ key, items }));
}

/** "Today", "Yesterday", or a short weekday-and-date. */
export function dayGroupLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  const yesterday = getLocalDateKey(addDays(parseLocalDateKey(todayKey), -1));
  if (key === yesterday) return "Yesterday";
  const d = parseLocalDateKey(key);
  const sameYear = d.getFullYear() === parseLocalDateKey(todayKey).getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "This week" for the current Monday, else "the week of 15 Sep". */
export function weekGroupLabel(mondayKey: string, todayKey: string): string {
  if (mondayKey === mondayOf(todayKey)) return "This week";
  const d = parseLocalDateKey(mondayKey);
  return `Week of ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

/** "3/7 done" for whatever is active right now. */
export function progressOf<T extends { done: boolean }>(items: readonly T[]): string {
  const done = items.filter((t) => t.done).length;
  return `${done}/${items.length}`;
}
