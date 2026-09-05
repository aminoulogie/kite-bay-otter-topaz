/**
 * The key two spellings of the same exercise share.
 *
 * The imported sheet was canonicalised to "Leg Extension" while the app's own
 * catalogue calls it "Leg Extensions", so an exact-name merge filed them as two
 * exercises: the imported one sorted first with more sessions, and everything
 * logged in the app since sat in a near-identical row below it. The Database
 * looked like it had simply stopped recording new workouts.
 *
 * Deliberately narrow. It folds away the four things that actually differ
 * between the two vocabularies — a parenthetical qualifier, hyphen vs space,
 * punctuation, and a trailing plural — and nothing else. Every pair it merges
 * across the shipped catalogue and the imported seed is a real duplicate; no
 * two distinct exercises collide. Widening it further (dropping equipment
 * words, say) would start merging "Seated Leg Curl" into "Lying Leg Curl",
 * which are different lifts with different numbers.
 */
export function exerciseKey(name: string): string {
  return name
    .toLowerCase()
    // "Pec Deck Fly (Machine)" and "Pec Deck Fly" are the same movement.
    .replace(/\(.*?\)/g, "")
    .replace(/[-/]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    // "Leg Extensions" -> "leg extension". Trailing only, so "Triceps" and
    // "Tricep" also meet without touching anything mid-word.
    .replace(/\b(\w+?)s\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
