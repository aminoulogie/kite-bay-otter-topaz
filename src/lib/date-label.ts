import { addDays, getLocalDateKey, parseLocalDateKey } from "./soma/dates.ts";

function shift(date: string, n: number): string {
  return getLocalDateKey(addDays(parseLocalDateKey(date), n));
}

/** "Today", "Yesterday", "Tomorrow", else "Sat 3 Oct" (the year only if it differs). */
export function dateLabel(date: string, today: string, long = false): string {
  if (date === today) return "Today";
  if (date === shift(today, -1)) return "Yesterday";
  if (date === shift(today, 1)) return "Tomorrow";
  const d = parseLocalDateKey(date);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  const year = long && d.getFullYear() !== parseLocalDateKey(today).getFullYear() ? ` ${d.getFullYear()}` : "";
  return `${wd} ${d.getDate()} ${mon}${year}`;
}

export function shiftDate(date: string, n: number): string {
  return shift(date, n);
}
