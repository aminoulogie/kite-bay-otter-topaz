/**
 * Where you were, kept as a place in the TEXT rather than a page number.
 *
 * A page number is not a fact about a book, it is a fact about a book at one
 * font size on one screen. Store 7 and come back with the type one point
 * bigger and you are somewhere else entirely — usually a page or two short,
 * which is exactly the kind of small wrongness that makes a reader stop
 * trusting the app and start remembering the page themselves.
 *
 * So a position is an offset in characters from the start of the chapter.
 * That is invariant: the same offset is the same sentence whatever the text
 * is set in, at any margin, on any phone, in either orientation. Turning it
 * back into a page is a lookup done after the browser has laid the chapter
 * out — see the reader — and this file is the arithmetic that lookup needs.
 */

/** Where node `index` begins, counting every character before it. */
export function offsetOf(lengths: readonly number[], index: number): number {
  let acc = 0;
  for (let i = 0; i < Math.min(index, lengths.length); i++) acc += lengths[i] ?? 0;
  return acc;
}

export function totalLength(lengths: readonly number[]): number {
  return offsetOf(lengths, lengths.length);
}

export interface Spot {
  /** Index into the list of text runs. */
  index: number;
  /** Characters into that run. */
  into: number;
}

/**
 * Which run holds this offset, and how far into it.
 *
 * An offset past the end comes back as the last character rather than as
 * nothing: a chapter that has been edited, or a book re-imported from a
 * different edition, should open at its end rather than refuse to open at
 * the place it was asked for.
 */
export function locate(lengths: readonly number[], offset: number): Spot {
  if (lengths.length === 0) return { index: 0, into: 0 };
  const want = Math.max(0, Math.floor(offset));
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] ?? 0;
    if (want < acc + len) return { index: i, into: want - acc };
    acc += len;
  }
  const last = lengths.length - 1;
  return { index: last, into: Math.max(0, (lengths[last] ?? 1) - 1) };
}

/**
 * A stored position, made safe.
 *
 * Rides in the backup, so it comes back from a file. A negative or absurd
 * offset is a position the book does not have, and the honest answer to one
 * is the beginning rather than a crash.
 */
export function cleanOffset(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}
