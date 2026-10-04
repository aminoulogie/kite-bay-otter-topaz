/** Filtering and week maths for the workstation's Tasks page. */

import { isActive, mondayOf, scopeOf } from "../lib/todos.ts";
import { addDays, getLocalDateKey, parseLocalDateKey } from "../lib/soma/dates.ts";
import type { TodoItem } from "../lib/types.ts";

export type TaskFilter = "today" | "week" | "due" | "open" | "done";

export const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "due", label: "Deadlines" },
  { id: "open", label: "All open" },
  { id: "done", label: "Done" },
];

export function filterTasks(todos: TodoItem[], f: TaskFilter, today: string): TodoItem[] {
  const live = todos.filter((t) => !t.cleared);
  switch (f) {
    case "today":
      return live.filter((t) => !t.done && (isActive(t, today) && scopeOf(t) === "day" || t.slot?.date === today || t.due === today));
    case "week":
      return live.filter((t) => !t.done && (isActive(t, today) && scopeOf(t) === "week"));
    case "due":
      return live.filter((t) => !t.done && t.due).sort((a, b) => a.due!.localeCompare(b.due!));
    case "open":
      return live.filter((t) => !t.done);
    case "done":
      return todos.filter((t) => t.done).slice(-200).reverse();
  }
}

export function counts(todos: TodoItem[], today: string): Record<TaskFilter, number> {
  const out = {} as Record<TaskFilter, number>;
  for (const f of ["today", "week", "due", "open"] as TaskFilter[]) out[f] = filterTasks(todos, f, today).length;
  out.done = 0;
  return out;
}

/** The seven date keys of the week starting on `monday`. */
export function weekOf(monday: string): string[] {
  const d = parseLocalDateKey(monday);
  return Array.from({ length: 7 }, (_, i) => getLocalDateKey(addDays(d, i)));
}

export const thisMonday = (today: string) => mondayOf(today);

/** Snap a pixel offset in the calendar to a start minute. */
export function minuteAt(y: number, hourPx: number, firstHour: number, step = 15): number {
  const m = firstHour * 60 + (y / hourPx) * 60;
  return Math.max(0, Math.min(24 * 60 - step, Math.round(m / step) * step));
}

export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
