import { useEffect, useRef, useState } from "react";

/**
 * A form value scoped to the day being viewed.
 *
 * Every panel on the Body tab holds its field in useState seeded from the
 * store — weight, sleep hours and quality, measurements. That is right while
 * you are typing and wrong the moment the date changes: the state was seeded
 * once, so browsing to another day left yesterday's weight sitting in the box
 * over a button that said "Save for" a different date. Type nothing, tap save,
 * and you have written the wrong day's figure.
 *
 * The reset is keyed on the DATE, not on the stored value. Re-seeding whenever
 * the store changed would fight the user: every keystroke saves nothing yet,
 * but a save elsewhere in the app would yank a half-typed number out from
 * under them. A new date is a new form; a new value for the same date is not.
 *
 * `initial` is read through a ref so a caller can pass an inline expression
 * without the effect re-running on every render.
 */
export function useDayDraft<T>(date: string, initial: () => T): [T, (v: T) => void] {
  const read = useRef(initial);
  read.current = initial;

  const [value, setValue] = useState<T>(() => read.current());
  // Tracked separately from `date` so the very first render does not count as
  // a change and re-seed something already seeded.
  const seededFor = useRef(date);

  useEffect(() => {
    if (seededFor.current === date) return;
    seededFor.current = date;
    setValue(read.current());
  }, [date]);

  return [value, setValue];
}
