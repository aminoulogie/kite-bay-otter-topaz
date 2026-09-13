/**
 * One word a day, from the languages you are actually learning.
 *
 * The rule that shapes everything here: **the word for a given day is the same
 * word every time you open the app that day.** A tracker that hands you a
 * different word on every render is a tracker you cannot learn from — you
 * would never see the same word twice, and "today's word" would be a slot
 * machine rather than a commitment.
 *
 * So the draw is DERIVED from the date and the language rather than stored or
 * randomised: same day, same language, same word, on every device, for ever.
 * Words you have already learned are skipped, which is the only thing that
 * moves the sequence on.
 */

import { WORDS, type LangCode, type Level, type Word } from "./words.ts";

export interface LangTrack {
  code: LangCode;
  level: Level;
  /** Words already taken, as written. Order is the order they were learned. */
  learned: string[];
}

/** A small, stable hash. Same input, same number, everywhere. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Everything in a language that has not been learned yet. */
export function remaining(code: LangCode, learned: readonly string[]): Word[] {
  const done = new Set(learned ?? []);
  return (WORDS[code] ?? []).filter((w) => !done.has(w.w));
}

/**
 * Today's word for one language, or null once the list is finished.
 *
 * Picked by hashing the date together with the language, so two languages
 * never hand you their word from the same position in their lists — which
 * would make three tracks feel like one list read three times.
 */
export function wordFor(code: LangCode, date: string, learned: readonly string[]): Word | null {
  const pool = remaining(code, learned);
  if (!pool.length) return null;
  return pool[hash(`${date}:${code}`) % pool.length] ?? null;
}

export interface DayDraw {
  code: LangCode;
  word: Word | null;
  /** How many are left after this one. */
  left: number;
  learnedCount: number;
  total: number;
}

export function drawFor(track: LangTrack, date: string): DayDraw {
  const total = (WORDS[track.code] ?? []).length;
  const pool = remaining(track.code, track.learned);
  return {
    code: track.code,
    word: wordFor(track.code, date, track.learned),
    left: Math.max(0, pool.length - 1),
    learnedCount: total - pool.length,
    total,
  };
}

/** Today's draw for every language being learned. */
export function drawAll(tracks: readonly LangTrack[], date: string): DayDraw[] {
  return (tracks ?? []).map((t) => drawFor(t, date));
}

/**
 * Mark a word learned.
 *
 * Appending rather than replacing, and ignoring a word already in the list, so
 * a double tap cannot record the same word twice and quietly shorten the pool
 * it is drawn from.
 */
export function learn(track: LangTrack, word: string): LangTrack {
  const w = String(word ?? "").trim();
  if (!w || track.learned.includes(w)) return track;
  return { ...track, learned: [...track.learned, w] };
}

export function unlearn(track: LangTrack, word: string): LangTrack {
  if (!track.learned.includes(word)) return track;
  return { ...track, learned: track.learned.filter((x) => x !== word) };
}

/** Progress through a language's list, 0-100. */
export function progress(track: LangTrack): number {
  const total = (WORDS[track.code] ?? []).length;
  if (!total) return 0;
  const done = track.learned.filter((w) => WORDS[track.code]!.some((x) => x.w === w)).length;
  return Math.round((done / total) * 100);
}
