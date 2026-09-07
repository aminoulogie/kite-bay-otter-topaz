/**
 * Working out what a lift trains from its name alone.
 *
 * Every exercise in the shipped database carries `targetKeys`, so nothing here
 * runs for those. It exists for the two cases that do not: an exercise the user
 * typed themselves, and a routine entry naming a lift that is not in the
 * database. Both used to fall through to a stub with `targetKeys: []`, and an
 * empty key list silently broke three things downstream — the set-rating sheet
 * had no muscles to offer, recovery had nothing to charge the work to, and the
 * body heatmap stayed cold after a session that clearly happened.
 *
 * Deliberately keyword matching rather than anything cleverer. It is guessing
 * from a label a human wrote, and a rule you can read is one you can correct.
 */

/** Muscle-region keys, matching lib/recovery.ts. */
export const MUSCLE_KEYS = [
  "chest", "deltoids", "deltoids_back", "biceps", "triceps", "triceps_back",
  "upper_back", "trapezius", "trapezius_back", "lower_back", "abs", "obliques",
  "quadriceps", "hamstring", "gluteal", "adductors", "adductors_back",
  "calves", "calves_back", "forearm", "forearm_back",
] as const;

/**
 * Ordered most specific first: "leg curl" has to win over "leg", or every
 * hamstring movement is filed as quads.
 */
const RULES: { match: RegExp; keys: string[]; muscle: string; subTarget: string }[] = [
  { match: /calf|calve|soleus|gastroc/, keys: ["calves", "calves_back"], muscle: "Legs", subTarget: "Calves" },
  { match: /leg curl|ham(string)?|nordic|good ?morning/, keys: ["hamstring"], muscle: "Legs", subTarget: "Hamstrings" },
  { match: /hip thrust|glute|kickback/, keys: ["gluteal"], muscle: "Legs", subTarget: "Glutes" },
  { match: /rdl|romanian|deadlift/, keys: ["hamstring", "gluteal", "lower_back"], muscle: "Legs", subTarget: "Posterior chain" },
  { match: /leg extension|hack|squat|leg press|lunge|split squat|sissy/, keys: ["quadriceps", "gluteal"], muscle: "Legs", subTarget: "Quads" },
  { match: /adduct|abduct/, keys: ["adductors", "adductors_back"], muscle: "Legs", subTarget: "Adductors" },

  { match: /rear delt|reverse (pec|fly)|face pull/, keys: ["deltoids_back", "trapezius_back"], muscle: "Shoulders", subTarget: "Rear delts" },
  { match: /lateral raise|side raise|y-?raise|upright row/, keys: ["deltoids", "deltoids_back"], muscle: "Shoulders", subTarget: "Side delts" },
  { match: /shoulder press|overhead press|\bohp\b|arnold|military/, keys: ["deltoids", "triceps", "triceps_back"], muscle: "Shoulders", subTarget: "Front delts" },
  { match: /shrug|trap/, keys: ["trapezius", "trapezius_back"], muscle: "Back", subTarget: "Traps" },

  { match: /pulldown|pull-?up|chin-?up|pullover/, keys: ["upper_back", "biceps"], muscle: "Back", subTarget: "Lats" },
  { match: /\brow\b|rowing/, keys: ["upper_back", "trapezius_back", "biceps"], muscle: "Back", subTarget: "Upper back" },
  { match: /back extension|hyperextension|erector/, keys: ["lower_back"], muscle: "Back", subTarget: "Erectors" },

  { match: /curl/, keys: ["biceps", "forearm"], muscle: "Biceps", subTarget: "Biceps" },
  { match: /pushdown|skullcrusher|skull crusher|tricep|overhead extension|kick-?back/, keys: ["triceps", "triceps_back"], muscle: "Triceps", subTarget: "Triceps" },
  { match: /wrist|forearm|grip/, keys: ["forearm", "forearm_back"], muscle: "Arms", subTarget: "Forearms" },

  { match: /\bdip\b|dips/, keys: ["chest", "triceps", "triceps_back"], muscle: "Chest", subTarget: "Lower chest" },
  { match: /bench|chest press|push-?up|pec deck|chest fly|\bfly\b/, keys: ["chest", "deltoids", "triceps"], muscle: "Chest", subTarget: "Chest" },

  { match: /crunch|sit-?up|plank|ab wheel|leg raise|hanging knee/, keys: ["abs", "obliques"], muscle: "Core", subTarget: "Abs" },
  { match: /oblique|russian twist|woodchop/, keys: ["obliques"], muscle: "Core", subTarget: "Obliques" },
];

export interface MuscleGuess {
  targetKeys: string[];
  muscle: string;
  subTarget: string;
}

/**
 * Best guess at what a named lift trains.
 *
 * Returns an empty key list only when nothing matched at all, so callers can
 * still tell "unknown" from "guessed", rather than being handed a confident
 * default that would charge the work to the wrong muscle.
 */
export function guessMuscles(name: string): MuscleGuess {
  const n = (name || "").toLowerCase();
  for (const rule of RULES) {
    if (rule.match.test(n)) {
      return { targetKeys: [...rule.keys], muscle: rule.muscle, subTarget: rule.subTarget };
    }
  }
  return { targetKeys: [], muscle: "Custom", subTarget: "" };
}

/** Just the keys, for the common call site. */
export function guessTargetKeys(name: string): string[] {
  return guessMuscles(name).targetKeys;
}
