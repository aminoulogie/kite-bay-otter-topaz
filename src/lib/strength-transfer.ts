/**
 * Strength that carries across variations of a lift.
 *
 * EZ-bar preacher curl one week, machine preacher the next, dumbbells after
 * that: the biceps are the same biceps. Rather than every variation starting
 * from scratch, each MOVEMENT GROUP (curls, flat pressing, squats…) keeps one
 * strength score — a barbell-equivalent estimated one-rep max — and every
 * exercise in it has a ratio to that score.
 *
 *   - A ratio starts from published equipment ratios: a dumbbell pair carries
 *     about 80% of the bar (≈40% a hand, the stabilising cost), a Smith or a
 *     selectorised machine about the bar, a hack squat ~1.3× and a leg press
 *     ~2× a back squat.
 *   - Then the ratio becomes YOURS. One session cannot say whether a machine
 *     felt easy because it IS easier or because you got stronger, so the
 *     surprise is split evenly between the two (in log terms); every later
 *     switch between variations splits again, so both numbers settle on
 *     the truth. Repeating the same exercise is pure progress.
 *   - Every set becomes an estimated max (Epley, counting the reps you had
 *     left), so 6 heavy reps on one lift and 12 on another compare fairly.
 *
 * Pure: give it the history, get numbers back. The workout screen turns a
 * suggestion into the usual Smart target, so how hard the last set felt still
 * decides the jump.
 */

import { exerciseKey } from "./exercise-key.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

export type Implement = "barbell" | "ez" | "dumbbell" | "kettlebell" | "smith" | "machine" | "cable" | "bodyweight";

export interface MovementGroup {
  id: string;
  label: string;
}

/** Movement groups, tried in order; the first match wins. */
const GROUPS: { id: string; label: string; test: RegExp; not?: RegExp }[] = [
  { id: "leg-curl", label: "Leg curls", test: /\bleg curl|hamstring curl|nordic/ },
  { id: "curl", label: "Biceps curls", test: /\bcurl/, not: /wrist|jefferson|neck|nordic/ },
  { id: "incline-press", label: "Incline pressing", test: /incline.*(press|bench)|(press|bench).*incline/ },
  { id: "decline-press", label: "Decline pressing", test: /decline.*(press|bench)/ },
  { id: "bench", label: "Flat pressing", test: /bench press|chest press|floor press|\bbench\b/ },
  { id: "ohp", label: "Overhead pressing", test: /shoulder press|overhead press|military press|arnold press/ },
  { id: "fly", label: "Chest flyes", test: /\bfly|flye|pec deck|crossover/ },
  { id: "lateral", label: "Lateral raises", test: /lateral raise|side raise|y raise/ },
  { id: "rear-delt", label: "Rear delts", test: /rear delt|reverse fly|face pull/ },
  { id: "squat", label: "Squats & leg press", test: /squat|leg press/, not: /split squat|bulgarian|sissy|jump/ },
  { id: "split-squat", label: "Lunges & split squats", test: /lunge|split squat|bulgarian|step up/ },
  { id: "rdl", label: "Hip hinges", test: /romanian|\brdl\b|stiff leg|good morning/ },
  { id: "deadlift", label: "Deadlifts", test: /deadlift/ },
  { id: "hip-thrust", label: "Hip thrusts", test: /hip thrust|glute bridge/ },
  { id: "leg-ext", label: "Leg extensions", test: /leg extension/ },
  { id: "calf", label: "Calf raises", test: /calf/ },
  { id: "pulldown", label: "Pulldowns & pull-ups", test: /pulldown|pull down|pull up|pullup|chin up|chinup/ },
  { id: "row", label: "Rows", test: /\brow\b|\brows\b|rowing/, not: /upright/ },
  { id: "triceps", label: "Triceps", test: /tricep|pushdown|push down|skull|french press|overhead extension/ },
  { id: "shrug", label: "Shrugs", test: /shrug/ },
];

/** Total load relative to a barbell for the same movement (a dumbbell PAIR, for dumbbells). */
export const IMPLEMENT_FACTOR: Record<Implement, number> = {
  barbell: 1,
  ez: 1,
  smith: 1,
  machine: 1,
  cable: 1,
  // Two dumbbells together move about 80% of the bar: balancing two free
  // weights costs force the bar doesn't ask for. ≈40% a hand.
  dumbbell: 0.8,
  kettlebell: 0.8,
  bodyweight: 1,
};

/** Movement variants that move a different load to the group's barbell lift. */
const VARIANT_FACTOR: { test: RegExp; factor: number }[] = [
  { test: /leg press/, factor: 2 },
  { test: /hack squat|pendulum squat/, factor: 1.3 },
  { test: /belt squat/, factor: 1.2 },
  { test: /front squat/, factor: 0.8 },
  { test: /goblet/, factor: 0.5 },
];

const KIT: [Implement, RegExp][] = [
  ["ez", /\bez\b|ez[- ]bar|e-z/],
  ["dumbbell", /dumbbell|\bdb\b|dumbell|dumbel/],
  ["kettlebell", /kettlebell|\bkb\b/],
  ["smith", /smith/],
  ["cable", /cable|bayesian|pulley|rope/],
  ["machine", /machine|hammer strength|plate loaded|leg press|hack squat|pendulum|pec deck|selectori[sz]ed/],
  ["barbell", /barbell|\bbb\b|\bbar\b/],
];

/**
 * A name that names two kinds of kit ("Romanian Deadlift (DB/Barbell)") says
 * nothing certain about how the weight was logged, so it is read as one load
 * — never doubled as a pair of dumbbells — and its ratio is learned from the
 * sets like a machine's.
 */
export function ambiguousKit(name: string): boolean {
  const n = name.toLowerCase();
  return KIT.filter(([, re]) => re.test(n)).length > 1 && !/\bez\b|ez[- ]bar|smith/.test(n);
}

export function implementOf(name: string, isBW = false): Implement {
  const n = name.toLowerCase();
  if (ambiguousKit(name)) return "machine";
  if (/\bez\b|ez[- ]bar|e-z/.test(n)) return "ez";
  if (/dumbbell|\bdb\b|dumbell|dumbel/.test(n)) return "dumbbell";
  if (/kettlebell|\bkb\b/.test(n)) return "kettlebell";
  if (/smith/.test(n)) return "smith";
  if (/cable|bayesian|pulley|rope/.test(n)) return "cable";
  if (/machine|hammer strength|plate loaded|leg press|hack squat|pendulum|pec deck|selectori[sz]ed/.test(n)) return "machine";
  if (/barbell|\bbb\b|\bbar\b/.test(n)) return "barbell";
  if (isBW || /pull up|pullup|chin up|dip\b|push up|bodyweight/.test(n)) return "bodyweight";
  return "barbell";
}

/** Weight logged per hand / per side, so the total is twice what was typed. */
export function perHand(name: string, implement = implementOf(name)): boolean {
  if (ambiguousKit(name)) return false;
  return implement === "dumbbell" || implement === "kettlebell" || /single arm|one arm|unilateral|single leg|one leg/.test(name.toLowerCase());
}

/** One exercise on one piece of kit: "Preacher Curl (EZ)" and "(Machine)" are two ratios. */
export const variantKey = (name: string, isBW = false) => `${exerciseKey(name)}|${implementOf(name, isBW)}`;

export function groupOf(name: string): MovementGroup | null {
  // Plain lowercase, not exerciseKey: that folds a trailing "s", and "press"
  // would never match again.
  const n = name.toLowerCase().replace(/[-_/]/g, " ");
  for (const g of GROUPS) if (g.test.test(n) && !(g.not && g.not.test(n))) return { id: g.id, label: g.label };
  return null;
}

/** The science default: this exercise's total load ÷ the group's barbell lift. */
export function defaultRatio(name: string, isBW = false): number {
  const n = name.toLowerCase();
  const variant = VARIANT_FACTOR.find((v) => v.test.test(n))?.factor ?? 1;
  // A machine hack squat or leg press already has its variant factor; the
  // machine itself does not cut the load further.
  const impl = implementOf(name, isBW);
  return variant * (variant !== 1 ? 1 : IMPLEMENT_FACTOR[impl]);
}

/** Reps left in the tank, from however the set was rated. */
export function repsInReserve(s: Pick<WorkoutSet, "rpe" | "closeness" | "failure">): number {
  if (typeof s.rpe === "number" && s.rpe > 0) return Math.max(0, 10 - s.rpe);
  switch (s.closeness) {
    case "reps_left":
      return 3;
    case "one_left":
      return 1;
    case "nothing":
    case "forced":
      return 0;
  }
  // The old 1–5 rating: 1 was easy, 4–5 a grind.
  const f = Number(s.failure) || 3;
  return f <= 1 ? 4 : f === 2 ? 2 : f === 3 ? 1 : 0;
}

/** Epley, counting the reps that were left: 100 kg × 8 with 2 left ≈ 100 × (1 + 10/30). */
export const e1rm = (totalKg: number, reps: number, rir = 0) => totalKg * (1 + (reps + rir) / 30);
export const weightFor = (e1: number, reps: number, rir = 0) => e1 / (1 + (reps + rir) / 30);

/** The total load of a set (both dumbbells, both sides). */
export function totalLoad(name: string, weight: number): number {
  return perHand(name) ? weight * 2 : weight;
}

interface BestSet {
  set: WorkoutSet;
  e1: number;
}

function bestSet(name: string, sets: WorkoutSet[]): BestSet | null {
  let best: BestSet | null = null;
  for (const s of sets) {
    if (!s.done || s.type === "warmup") continue;
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (w <= 0 || r <= 0) continue;
    const e1 = e1rm(totalLoad(name, w), r, repsInReserve(s));
    if (!best || e1 > best.e1) best = { set: s, e1 };
  }
  return best;
}

export interface GroupState {
  group: MovementGroup;
  /** Barbell-equivalent estimated max, after the latest session. */
  strength: number;
  /** Its value over time, oldest first. */
  timeline: { at: string; strength: number; exercise: string }[];
  /** Every session's best estimated max, per variation, in its own kit's terms. */
  points: { at: string; key: string; e1: number }[];
  /** Per exercise key: its ratio to `strength`, and whether it was learned from your own sets. */
  ratios: Map<string, { name: string; ratio: number; learned: boolean }>;
  /** The latest session in the group: which exercise, its best set, when. */
  last: { name: string; set: WorkoutSet; at: string };
}

/**
 * Walk the history in order and build every group's strength and ratios.
 *
 * Each session's best set either (a) teaches the ratio of an exercise seen
 * for the first time — whatever you managed IS that exercise's ratio for you —
 * or (b) moves the group's strength, for an exercise whose ratio is known.
 * `before` (a date key) stops short of a day, so the session being logged
 * never informs itself. Ordered by date key, not timestamp: a backfilled
 * session is stamped when it was typed, not when it was trained.
 */
export function strengthGroups(history: Record<string, HistorySession>, before?: string): Map<string, GroupState> {
  const out = new Map<string, GroupState>();
  const sessions = Object.entries(history)
    .filter(([d, s]) => s && Array.isArray(s.exercises) && (!before || d < before))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [date, session] of sessions) {
    for (const ex of session.exercises) {
      if (ex.isBW) continue;
      const group = groupOf(ex.name);
      if (!group) continue;
      const best = bestSet(ex.name, ex.sets ?? []);
      if (!best) continue;
      const key = variantKey(ex.name, ex.isBW);
      const at = date;
      let g = out.get(group.id);
      if (!g) {
        const ratio = defaultRatio(ex.name, ex.isBW);
        g = {
          group,
          strength: best.e1 / ratio,
          timeline: [],
          points: [],
          ratios: new Map([[key, { name: ex.name, ratio, learned: true }]]),
          last: { name: ex.name, set: best.set, at },
        };
        out.set(group.id, g);
      } else {
        const known = g.ratios.get(key);
        if (known && variantKey(g.last.name) === key) {
          // Same exercise again: whatever changed is you.
          g.strength = best.e1 / known.ratio;
        } else {
          // A switch. Predicted from the group's strength; the surprise is
          // half the kit, half you.
          const ratio = known?.ratio ?? defaultRatio(ex.name, ex.isBW);
          const surprise = Math.sqrt(best.e1 / (g.strength * ratio));
          g.ratios.set(key, { name: ex.name, ratio: ratio * surprise, learned: true });
          g.strength *= surprise;
        }
        g.last = { name: ex.name, set: best.set, at };
      }
      g.timeline.push({ at, strength: g.strength, exercise: ex.name });
      g.points.push({ at, key, e1: best.e1 });
    }
  }
  return out;
}

export interface Transfer {
  /** The weight to put in the Smart target's "last set": per hand for dumbbells. */
  weight: number;
  reps: number;
  /** The set it came from, with its rating, so the usual progression applies. */
  set: WorkoutSet;
  from: { name: string; weight: number; reps: number; at: string };
  /** Whether this exercise's ratio is learned from your own sets, or the science default. */
  learned: boolean;
  group: MovementGroup;
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

/**
 * What a previous set of a RELATED exercise means for this one, or null when
 * this exercise's own last session is the latest in its group (the normal
 * Smart target already has it) or nothing related has been done.
 */
export function transferFor(
  name: string,
  history: Record<string, HistorySession>,
  opts: { before?: string; isBW?: boolean; ownLast?: { reps: number; at: string } | null } = {},
): Transfer | null {
  if (opts.isBW) return null;
  const group = groupOf(name);
  if (!group) return null;
  const g = strengthGroups(history, opts.before).get(group.id);
  if (!g) return null;
  const key = variantKey(name, opts.isBW);
  if (variantKey(g.last.name) === key) return null;
  if (opts.ownLast && opts.ownLast.at >= g.last.at) return null;
  const known = g.ratios.get(key);
  const ratio = known?.ratio ?? defaultRatio(name, opts.isBW);
  const src = g.last.set;
  // The reps you usually do on THIS exercise, else the set it comes from.
  const reps = opts.ownLast?.reps || Number(src.reps) || 8;
  const rir = repsInReserve(src);
  let w = weightFor(g.strength * ratio, reps, rir);
  if (perHand(name)) w /= 2;
  const step = perHand(name) ? 0.5 : 2.5;
  w = Math.max(step, roundTo(w, step));
  return {
    weight: w,
    reps,
    set: src,
    from: { name: g.last.name, weight: Number(src.weight) || 0, reps: Number(src.reps) || 0, at: g.last.at },
    learned: !!known?.learned,
    group: g.group,
  };
}

/**
 * How much stronger the group got since `since` (a date key), as a fraction.
 *
 * Measured within each variation — its own best then against its own best
 * now — and averaged (geometrically) across variations. Never from the
 * group's strength line itself: that line spends its first switches learning
 * the ratios, and read straight it would call the calibration progress.
 */
export function progressSince(g: GroupState, since: string): number | null {
  const byKey = new Map<string, { at: string; e1: number }[]>();
  for (const p of g.points) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]);
  const logs: number[] = [];
  for (const pts of byKey.values()) {
    if (pts.length < 2) continue;
    const early = [...pts].reverse().find((p) => p.at <= since) ?? pts[0]!;
    const late = pts[pts.length - 1]!;
    if (late.at <= early.at || early.e1 <= 0) continue;
    logs.push(Math.log(late.e1 / early.e1));
  }
  if (!logs.length) return null;
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length) - 1;
}
