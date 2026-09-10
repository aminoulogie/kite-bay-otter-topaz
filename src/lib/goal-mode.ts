/**
 * What you are actually training for, and what that does to the volume
 * landmarks.
 *
 * The MEV/MAV/MRV table in the engine is a hypertrophy table. It is the right
 * table if the goal is size, and the wrong one for everything else: a lifter
 * chasing a heavier squat does not need sixteen sets of quads a week, and one
 * holding muscle through a busy month does not need to be told they are eight
 * sets short of growing.
 *
 * Rather than four tables to keep in sync, the hypertrophy figures stay the
 * one source of truth and each goal states how it bends them:
 *
 *  - **Hypertrophy** — the table as published. Nothing changes.
 *  - **Strength** — about three quarters of the sets, because the work is
 *    heavier and slower and the fatigue per set is higher. Intensity, not
 *    volume, is doing the job.
 *  - **Recomp** — the floor stays, the ceiling drops to MAV. In a deficit
 *    recovery is the binding constraint, so the productive band's top is as
 *    far as it is sensible to go.
 *  - **Maintain** — MEV becomes the target, not the floor. Far less work than
 *    people expect holds muscle; anything above it is spent for nothing.
 *
 * The mesocycle clock is deliberately untouched by any of this. Deload weeks
 * are a property of the calendar, and moving them when the goal changes would
 * relabel every past week.
 */

export type TrainingGoal = "hypertrophy" | "strength" | "recomp" | "maintain";

export const DEFAULT_GOAL: TrainingGoal = "hypertrophy";

export interface Landmarks {
  mev: number;
  mav: number;
  mrv: number;
  label: string;
}

export interface GoalMode {
  id: TrainingGoal;
  label: string;
  /** One line, shown next to the picker. Says what changes, not what it means. */
  blurb: string;
  /** How the published hypertrophy landmarks are bent. */
  shape: (lm: Landmarks) => Landmarks;
}

/** Sets are whole things. Rounded up so a scaled floor never lands below one. */
const up = (n: number) => Math.max(1, Math.ceil(n));

export const STRENGTH_SET_SCALE = 0.75;

export const GOAL_MODES: Record<TrainingGoal, GoalMode> = {
  hypertrophy: {
    id: "hypertrophy",
    label: "Hypertrophy",
    blurb: "Full volume landmarks — the most sets you can recover from.",
    shape: (lm) => ({ ...lm }),
  },
  strength: {
    id: "strength",
    label: "Strength",
    blurb: "About three quarters of the sets. The load does the work.",
    shape: (lm) => ({
      ...lm,
      mev: up(lm.mev * STRENGTH_SET_SCALE),
      mav: up(lm.mav * STRENGTH_SET_SCALE),
      mrv: up(lm.mrv * STRENGTH_SET_SCALE),
    }),
  },
  recomp: {
    id: "recomp",
    label: "Recomp",
    blurb: "Same floor, ceiling capped at MAV — recovery is the limit in a deficit.",
    // MRV collapses onto MAV, so "high" can no longer be reported: in a
    // deficit there is no band above the productive one worth sitting in.
    shape: (lm) => ({ ...lm, mrv: lm.mav }),
  },
  maintain: {
    id: "maintain",
    label: "Maintain",
    blurb: "MEV is the target, not the floor. Holding muscle takes less than you think.",
    shape: (lm) => ({ ...lm, mav: lm.mev, mrv: up(lm.mev * 1.5) }),
  },
};

export const GOAL_LIST = Object.values(GOAL_MODES);

export function goalMode(goal: TrainingGoal | undefined | null): GoalMode {
  return GOAL_MODES[goal ?? DEFAULT_GOAL] ?? GOAL_MODES[DEFAULT_GOAL];
}

/** One muscle's landmarks under a goal. */
export function landmarksFor(lm: Landmarks, goal: TrainingGoal | undefined | null): Landmarks {
  const out = goalMode(goal).shape(lm);
  // Whatever a mode does, the three have to stay in order or volumeStatus
  // reports a set count as both "below MEV" and "past MRV".
  const mev = up(out.mev);
  const mav = Math.max(mev, up(out.mav));
  const mrv = Math.max(mav, up(out.mrv));
  return { ...out, mev, mav, mrv };
}

/** The whole table under a goal, keyed as the engine keys it. */
export function landmarkTable<T extends Record<string, Landmarks>>(
  base: T,
  goal: TrainingGoal | undefined | null,
): Record<string, Landmarks> {
  const out: Record<string, Landmarks> = {};
  for (const [key, lm] of Object.entries(base)) out[key] = landmarksFor(lm, goal);
  return out;
}

/**
 * Re-reads a volume report against a goal's landmarks.
 *
 * The engine's report is computed once, against the hypertrophy table. Rather
 * than thread the goal through every call site of `volumeReport`, the rows are
 * re-judged here — the set counts are goal-independent, only the verdict moves.
 */
export interface ReportRow extends Landmarks {
  key: string;
  sets: number;
  tier: string;
  note: string;
}

export function statusFor(sets: number, lm: Landmarks): { tier: string; note: string } {
  if (sets === 0) return { tier: "none", note: "Not trained this week" };
  const s = (n: number) => `${n} set${n === 1 ? "" : "s"}`;
  if (sets < lm.mev) return { tier: "under", note: `Below MEV (${lm.mev}) — add ${s(Math.ceil(lm.mev - sets))}` };
  if (sets <= lm.mav) return { tier: "optimal", note: `In the productive range (${lm.mev}-${lm.mav})` };
  if (sets <= lm.mrv) return { tier: "high", note: `Above MAV (${lm.mav}) — sustainable only if recovery holds` };
  return { tier: "over", note: `Past MRV (${lm.mrv}) — cut ${s(Math.ceil(sets - lm.mrv))}` };
}

export function applyGoal(rows: ReportRow[], goal: TrainingGoal | undefined | null): ReportRow[] {
  const order: Record<string, number> = { over: 0, under: 1, none: 2, high: 3, optimal: 4 };
  return rows
    .map((r) => {
      const lm = landmarksFor({ mev: r.mev, mav: r.mav, mrv: r.mrv, label: r.label }, goal);
      return { ...r, ...lm, ...statusFor(r.sets, lm) };
    })
    .sort((a, b) => (order[a.tier]! - order[b.tier]!) || b.sets - a.sets);
}
