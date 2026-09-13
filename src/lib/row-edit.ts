/**
 * Reading values back out of a row editor.
 *
 * Separate from the component so the sheet stays a component and nothing else,
 * and so these two can be tested without rendering anything.
 */

export type EditValues = Record<string, string>;

/** A field's value as a number, or undefined when it was left blank. */
export function numOf(values: EditValues, key: string): number | undefined {
  // A comma is a decimal point on this user's keyboard, and has been treated as
  // one everywhere else in the app since the set-weight fields were fixed.
  const raw = (values?.[key] ?? "").trim().replace(",", ".");
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** A field's value trimmed, or undefined when it was left blank. */
export function textOf(values: EditValues, key: string): string | undefined {
  const raw = (values?.[key] ?? "").trim();
  return raw ? raw : undefined;
}
