import { BASE_EXERCISE_DB } from "./soma/data.ts";
import type { ExerciseLog, LoggedSet } from "./training-log.ts";

/**
 * Epley, inlined.
 *
 * Imported as a type-only dependency on purpose: pulling the function in at
 * runtime would drag training-seed.json along with it, and this model has no
 * business depending on the seed data.
 */
function e1rmOf(s: LoggedSet): number {
  if (!s.weight || !s.reps) return 0;
  return s.weight * (1 + s.reps / 30);
}

/**
 * Strength of each micro-muscle over time.
 *
 * The hard part is that absolute loads cannot be added across exercises. A
 * cable fly at 25kg and a bench press at 100kg both train the sternal pec, but
 * summing or averaging those kilos produces a number that moves when the
 * EXERCISE SELECTION changes rather than when the muscle gets stronger — drop
 * the bench for a month and the "strength" of your chest collapses.
 *
 * So each exercise is indexed against ITS OWN earliest recorded estimated 1RM,
 * and the micro-muscle's strength is the average of those indices. 100 means
 * "where this muscle started"; 130 means every lift feeding it is up about a
 * third. The number is a trend, not a weight, and it is honest across a
 * changing programme.
 */

export interface MicroPoint {
  date: string;
  index: number; // 100 = baseline
  contributing: number; // how many exercises fed this point
}

export interface MicroMuscle {
  subTarget: string;
  muscle: string; // the parent group, for grouping in the UI
  points: MicroPoint[];
  latest: number;
  change: number; // percentage points since baseline
  exercises: string[];
  /** False when there is too little to read as a trend. */
  usable: boolean;
}

/** Exercise name (lowercased) -> its sub-target, from the app's own catalogue. */
const SUBTARGET_BY_NAME = new Map<string, { subTarget: string; muscle: string }>(
  BASE_EXERCISE_DB.filter((e) => e.subTarget).map((e) => [
    e.name.trim().toLowerCase(),
    { subTarget: e.subTarget, muscle: e.muscle },
  ]),
);

/**
 * Imported names rarely match the catalogue exactly, so fall back to the words.
 *
 * Ordered: the first match wins, and the more specific patterns come first —
 * "incline bench" must be tested before "bench" or every press collapses into
 * one micro-muscle.
 */
const KEYWORD_SUBTARGETS: { pattern: RegExp; subTarget: string; muscle: string }[] = [
  { pattern: /incline.*(bench|press)|press.*incline/i, subTarget: "Upper Pec (Clavicular)", muscle: "Chest" },
  { pattern: /decline.*(bench|press)/i, subTarget: "Lower Pec (Costal)", muscle: "Chest" },
  { pattern: /\bdips?\b/i, subTarget: "Lower Pec (Costal)", muscle: "Chest" },
  { pattern: /(flat )?(bench|chest) press|pec deck|chest fly|crossover/i, subTarget: "Mid/Lower Pec (Sternal)", muscle: "Chest" },
  { pattern: /pulldown|pullup|chinup|lat /i, subTarget: "Lats (Vertical Pull)", muscle: "Back" },
  { pattern: /t-bar|bent over row|cable row|seated row|single arm row|\brow\b/i, subTarget: "Upper Back / Mid-Traps", muscle: "Back" },
  { pattern: /deadlift|back extension|hyper/i, subTarget: "Erectors / Posterior Chain", muscle: "Back" },
  { pattern: /shrug|trap/i, subTarget: "Upper Back / Mid-Traps", muscle: "Back" },
  { pattern: /rear delt|reverse pec|face pull/i, subTarget: "Rear Delt (Posterior)", muscle: "Shoulders" },
  { pattern: /lateral raise|side raise|lateral cable/i, subTarget: "Side Delt (Lateral)", muscle: "Shoulders" },
  { pattern: /shoulder press|overhead press|\bohp\b|front raise/i, subTarget: "Front Delt (Anterior)", muscle: "Shoulders" },
  { pattern: /hammer|brachialis/i, subTarget: "Brachialis & Forearms", muscle: "Biceps" },
  { pattern: /preacher|concentration|short head/i, subTarget: "Short Head (Inner)", muscle: "Biceps" },
  { pattern: /incline.*curl|bayesian|long head.*curl/i, subTarget: "Long Head (Peak)", muscle: "Biceps" },
  { pattern: /curl/i, subTarget: "Overall Biceps", muscle: "Biceps" },
  { pattern: /overhead.*(extension|triceps)|skull/i, subTarget: "Long Head Triceps", muscle: "Triceps" },
  { pattern: /pushdown|pulldown.*triceps|triceps/i, subTarget: "Lateral & Medial Head", muscle: "Triceps" },
  { pattern: /leg extension|rectus/i, subTarget: "Rectus Femoris", muscle: "Legs" },
  { pattern: /squat|hack|leg press/i, subTarget: "Quads (Knee Extensors)", muscle: "Legs" },
  { pattern: /romanian|rdl|stiff leg/i, subTarget: "Hamstrings (Lengthened)", muscle: "Legs" },
  { pattern: /leg curl/i, subTarget: "Hamstrings (Knee Flexion)", muscle: "Legs" },
  { pattern: /hip thrust|glute/i, subTarget: "Glutes (Maximus)", muscle: "Legs" },
  { pattern: /seated calf|soleus/i, subTarget: "Calves (Soleus)", muscle: "Legs" },
  { pattern: /calf|calve/i, subTarget: "Calves (Gastrocnemius)", muscle: "Legs" },
];

export function subTargetOf(name: string): { subTarget: string; muscle: string } | null {
  const exact = SUBTARGET_BY_NAME.get(name.trim().toLowerCase());
  if (exact) return exact;
  for (const k of KEYWORD_SUBTARGETS) {
    if (k.pattern.test(name)) return { subTarget: k.subTarget, muscle: k.muscle };
  }
  return null;
}

/** Sessions below this cannot show a trend, only noise. */
const MIN_SESSIONS = 4;

export function microMuscleStrength(log: ExerciseLog[]): MicroMuscle[] {
  // exercise -> its sessions as { date, e1rm }, oldest first
  const perExercise = new Map<string, { date: string; e1rm: number }[]>();
  for (const ex of log) {
    const pts = Object.entries(ex.days)
      .map(([date, sets]) => ({
        date,
        e1rm: sets.reduce((m, s) => Math.max(m, e1rmOf(s)), 0),
      }))
      .filter((p) => p.e1rm > 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (pts.length) perExercise.set(ex.name, pts);
  }

  const grouped = new Map<string, { muscle: string; names: string[] }>();
  for (const name of perExercise.keys()) {
    const st = subTargetOf(name);
    if (!st) continue;
    const g = grouped.get(st.subTarget) ?? { muscle: st.muscle, names: [] };
    g.names.push(name);
    grouped.set(st.subTarget, g);
  }

  const out: MicroMuscle[] = [];
  for (const [subTarget, { muscle, names }] of grouped) {
    // Index each exercise against its own first session, so a heavy lift and a
    // light one contribute on equal terms.
    const indexed = new Map<string, Map<string, number>>();
    for (const n of names) {
      const pts = perExercise.get(n)!;
      const baseline = pts[0]!.e1rm;
      if (baseline <= 0) continue;
      const m = new Map<string, number>();
      for (const p of pts) m.set(p.date, (p.e1rm / baseline) * 100);
      indexed.set(n, m);
    }

    const dates = [...new Set(names.flatMap((n) => [...(indexed.get(n)?.keys() ?? [])]))].sort();
    const points: MicroPoint[] = [];
    // Carry each exercise's last known index forward, so a day that only
    // trained one of the lifts does not read as the others collapsing.
    const lastSeen = new Map<string, number>();

    for (const date of dates) {
      for (const n of names) {
        const v = indexed.get(n)?.get(date);
        if (v != null) lastSeen.set(n, v);
      }
      const vals = [...lastSeen.values()];
      if (!vals.length) continue;
      points.push({
        date,
        index: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
        contributing: vals.length,
      });
    }

    const latest = points.length ? points[points.length - 1]!.index : 100;
    out.push({
      subTarget,
      muscle,
      points,
      latest,
      change: Math.round((latest - 100) * 10) / 10,
      exercises: names.sort(),
      usable: points.length >= MIN_SESSIONS,
    });
  }

  return out.sort((a, b) => b.change - a.change);
}
