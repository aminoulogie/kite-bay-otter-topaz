/**
 * Matching a programme's day label to a routine that exists.
 *
 * A programme day is a label — "Push", "Upper", "Legs" — while a routine is a
 * list of exercises stored under a full name like "Push B (Hypertrophy & Long
 * Muscle Length)". The two were compared with an exact lookup, so every
 * template in the programme builder produced days that loaded ZERO exercises:
 * the Train tab opened on "Push", found no routine called "Push", and showed
 * an empty session. Nothing could be rated, because there was nothing there.
 *
 * Matching is deliberately conservative — exact name, then prefix, then the
 * leading word — so "Legs A" never quietly loads "Legs B", and a label that
 * genuinely has no routine still returns null rather than the nearest thing.
 */

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Labels that mean the same training day under a different vocabulary.
 *
 * "Lower" and "Legs" are the same session; which word a programme uses depends
 * on whether it thinks in upper/lower or in push/pull/legs. Without this a
 * PPL-UL programme had a Lower day that loaded nothing, because the routine it
 * meant was filed under Legs.
 */
const SYNONYMS: Record<string, string[]> = {
  lower: ["legs"],
  legs: ["lower"],
  upper: ["push", "pull"],
  arms: ["pull", "push"],
};

/** The word a split is identified by: "Push B (…)" → "push". */
function head(name: string): string {
  return norm(name).split(/[\s(/-]+/)[0] ?? "";
}

/**
 * The routine to load for a programme day, or null if nothing fits.
 *
 * @param label the programme day's name
 * @param routineNames every routine the user has, preset and custom
 */
export function resolveSplitName(label: string, routineNames: string[]): string | null {
  if (!label) return null;
  const want = norm(label);

  // 1. The name as given.
  const exact = routineNames.find((n) => norm(n) === want);
  if (exact) return exact;

  // 2. A routine whose name starts with the label — "Push" → "Push B (…)".
  //    Longest label wins so "Legs A" is preferred over the bare "Legs".
  const prefixed = routineNames
    .filter((n) => norm(n).startsWith(want))
    .sort((a, b) => a.length - b.length);
  if (prefixed.length) return prefixed[0]!;

  // 3. Same leading word, which is what "Upper" and "Upper A (…)" share.
  const wantHead = head(label);
  if (wantHead) {
    const sameHead = routineNames
      .filter((n) => head(n) === wantHead)
      .sort((a, b) => a.length - b.length);
    if (sameHead.length) return sameHead[0]!;
  }

  // 4. A different word for the same day — Lower is Legs.
  for (const alt of SYNONYMS[wantHead] ?? []) {
    const match = routineNames
      .filter((n) => head(n) === alt)
      .sort((a, b) => a.length - b.length);
    if (match.length) return match[0]!;
  }

  return null;
}
