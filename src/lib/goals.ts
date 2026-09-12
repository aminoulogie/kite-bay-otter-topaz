/**
 * What today's targets actually are.
 *
 * A nutrition day stores the goals it was created with. That snapshot is right
 * for history — rewriting a finished day's target would silently rescore what
 * you ate against a number that did not exist at the time — and it was wrong
 * for everything else, because it meant editing a target in Settings changed
 * nothing you could see until the next day, unless you found a button at the
 * bottom of the card and pressed it.
 *
 * Worse, the old push was a MERGE of the overrides onto the stored goals, which
 * can only ever add keys. Clearing a field to follow the default again removed
 * it from the overrides and left the day carrying the old number for ever —
 * "changing it back" was the one edit guaranteed not to work.
 *
 * So the targets are REBUILT here from the bottom every time: defaults, then
 * the bodyweight-derived protein figure if that setting is on, then whatever
 * the user has explicitly overridden. An override that is gone is gone.
 */

// Imported from the modules themselves rather than the barrel: the test
// runner strips types without a bundler, and a directory import does not
// resolve there.
import { DEFAULT_GOALS } from "./soma/data.ts";
import { SomaIntelligenceEngine } from "./soma/engine.ts";
import type { Goals, Settings } from "./types";

/**
 * The targets a day should have, given the settings in force and the last
 * known bodyweight.
 *
 * Order matters and is the point: an explicit target wins over the derived
 * protein figure, which wins over the default.
 */
export function resolveGoals(settings: Settings | undefined, weightKg?: number): Goals {
  const goals: Goals = { ...DEFAULT_GOALS };
  const s = settings;
  if (s?.autoProteinTarget) {
    const derived = SomaIntelligenceEngine.proteinTargetFor(weightKg, s.proteinPerKg);
    if (derived) goals.protein = derived;
  }
  Object.assign(goals, s?.customGoals ?? {});
  return goals;
}

/** True when two target sets agree on every field. */
export function sameGoals(a: Goals | undefined, b: Goals | undefined): boolean {
  if (!a || !b) return a === b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Goals>;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Which stored days are allowed to follow a target edit.
 *
 * Today always, because that is the day the edit was made for. Any other day
 * only while nothing has been logged against it: an empty future day is a plan
 * and should follow the current target, and an empty past day has nothing to
 * rescore. A past day with food in it keeps the number it was scored under.
 */
export function followsSettings(
  dateKey: string,
  todayKey: string,
  loggedItems: number,
): boolean {
  return dateKey === todayKey || loggedItems === 0;
}
