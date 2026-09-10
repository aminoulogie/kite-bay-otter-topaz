/**
 * What the block actually did.
 *
 * A mesocycle ends and nothing happens. The next one starts on the same
 * templates, with the same set counts, and whatever the last eight weeks
 * proved gets proved again. The information to do better was all there — every
 * session, every rating, every reading — and no screen ever put it in one
 * place at the one moment it is useful.
 *
 * That moment is narrow: the deload week, and the first week of the next
 * block. Outside it, a review of a block still running is a distraction, so
 * `dueNow` says when to show it and the card obeys.
 *
 * Everything here is measured, never advised beyond what was measured. The
 * verdicts are statements about what happened with the obvious consequence
 * attached — "chest averaged 4 sets a week, below its minimum of 8" — and
 * never a training philosophy the data cannot support.
 */

import { lastNDays } from "./coach-brief.ts";
import { landmarksFor, type Landmarks, type TrainingGoal } from "./goal-mode.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

/** Weeks in a block, deload included. Matches the engine's 9-week clock. */
export const BLOCK_WEEKS = 9;

/** Below this many logged sessions the review says so instead of reporting. */
export const MIN_SESSIONS = 6;

/** A lift needs a reading at each end of the block before a change means anything. */
export const MIN_LIFT_READINGS = 2;

export interface MesoBlock {
  /** 1-based: block 1 is weeks 1-9, block 2 is weeks 10-18. */
  index: number;
  startWeek: number;
  endWeek: number;
  /** Week within the block, 1-based. */
  weekInBlock: number;
}

export function blockOf(weekNumber: number): MesoBlock {
  const w = Math.max(1, Math.floor(weekNumber) || 1);
  const index = Math.floor((w - 1) / BLOCK_WEEKS) + 1;
  const startWeek = (index - 1) * BLOCK_WEEKS + 1;
  return { index, startWeek, endWeek: startWeek + BLOCK_WEEKS - 1, weekInBlock: w - startWeek + 1 };
}

/**
 * Whether the review is worth showing right now.
 *
 * The deload (last week of a block) and the first week of the next one. A
 * review of a block still four weeks from finishing is noise, and one shown
 * every week stops being read by the time it matters.
 */
export function dueNow(weekNumber: number, isDeload: boolean): boolean {
  const b = blockOf(weekNumber);
  return isDeload || b.weekInBlock === BLOCK_WEEKS || b.weekInBlock === 1;
}

export interface VolumeLine {
  label: string;
  /** Mean working sets per week across the block. */
  perWeek: number;
  mev: number;
  mav: number;
  tier: "under" | "optimal" | "high" | "over";
}

export interface LiftLine {
  name: string;
  from: number;
  to: number;
  deltaPct: number;
  readings: number;
}

export interface MesoReview {
  block: MesoBlock;
  /** Date keys the block covers, first and last. */
  from: string;
  to: string;
  weeks: number;
  sessions: number;
  sessionsPerWeek: number;
  volume: VolumeLine[];
  lifts: LiftLine[];
  bodyweight: { from: number; to: number; delta: number } | null;
  /** Plain statements about what happened, most important first. */
  verdicts: string[];
  /** True when there is not enough logged to review, with `verdicts` saying so. */
  thin: boolean;
}

export interface MesoReviewInput {
  today: string;
  weekNumber: number;
  isDeload: boolean;
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  goal?: TrainingGoal;
  /** The engine's hypertrophy landmarks, keyed by muscle. */
  landmarks: Record<string, Landmarks>;
  /** est1RM for one exercise from one session, injected so this stays pure. */
  estimate1RM: (weight: number, reps: number) => number;
}

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * The window the review covers.
 *
 * Weeks elapsed inside the block, not the whole nine — a review shown in week
 * 1 of a new block covers the block that just ended, and one shown on the
 * deload covers the eight weeks up to it.
 */
export function blockWindow(input: Pick<MesoReviewInput, "today" | "weekNumber">): {
  from: string;
  to: string;
  weeks: number;
} {
  const b = blockOf(input.weekNumber);
  // In week 1 of a new block the interesting period is the block before it.
  const weeks = b.weekInBlock === 1 ? BLOCK_WEEKS : b.weekInBlock;
  const days = lastNDays(input.today, weeks * 7);
  return { from: days[0]!, to: days[days.length - 1]!, weeks };
}

export function mesoReview(input: MesoReviewInput): MesoReview {
  const block = blockOf(input.weekNumber);
  const { from, to, weeks } = blockWindow(input);

  const sessions = Object.entries(input.history).filter(
    ([d, s]) => d >= from && d <= to && (s?.exercises?.length ?? 0) > 0,
  );

  const base: Omit<MesoReview, "verdicts" | "thin"> = {
    block,
    from,
    to,
    weeks,
    sessions: sessions.length,
    sessionsPerWeek: round(sessions.length / weeks),
    volume: [],
    lifts: [],
    bodyweight: null,
  };

  if (sessions.length < MIN_SESSIONS) {
    return {
      ...base,
      thin: true,
      verdicts: [
        `Only ${sessions.length} session${sessions.length === 1 ? "" : "s"} logged in these ${weeks} weeks — not enough to review the block.`,
      ],
    };
  }

  // --- Volume, averaged per week and credited once per muscle LABEL. Two keys
  //     for one muscle (triceps and triceps_back) would otherwise double it.
  const setsByLabel = new Map<string, number>();
  for (const [, session] of sessions) {
    for (const ex of session?.exercises ?? []) {
      const working = (ex.sets ?? []).filter(
        (s) => s.done && s.type !== "warmup" && s.type !== "dropset",
      ).length;
      if (!working) continue;
      const labels = new Set<string>();
      for (const k of ex.targetKeys ?? []) {
        const lm = input.landmarks[k];
        if (lm) labels.add(lm.label);
      }
      for (const label of labels) setsByLabel.set(label, (setsByLabel.get(label) ?? 0) + working);
    }
  }

  const seen = new Set<string>();
  const volume: VolumeLine[] = [];
  for (const [key, lm] of Object.entries(input.landmarks)) {
    void key;
    if (seen.has(lm.label)) continue;
    seen.add(lm.label);
    const total = setsByLabel.get(lm.label) ?? 0;
    if (total === 0) continue;
    const scaled = landmarksFor(lm, input.goal);
    const perWeek = round(total / weeks);
    const tier: VolumeLine["tier"] =
      perWeek < scaled.mev ? "under"
      : perWeek <= scaled.mav ? "optimal"
      : perWeek <= scaled.mrv ? "high"
      : "over";
    volume.push({ label: lm.label, perWeek, mev: scaled.mev, mav: scaled.mav, tier });
  }
  const order = { over: 0, under: 1, high: 2, optimal: 3 } as const;
  volume.sort((a, b) => order[a.tier] - order[b.tier] || b.perWeek - a.perWeek);

  // --- Strength, per lift, first reading against last.
  const byLift = new Map<string, { date: string; est: number }[]>();
  for (const [date, session] of sessions) {
    for (const ex of session?.exercises ?? []) {
      let best = 0;
      for (const s of ex.sets ?? []) {
        if (!s.done || s.type === "warmup" || s.type === "dropset") continue;
        const raw = Number(s.weight) || 0;
        const w = ex.usesBar && raw > 0 ? (ex.barWeight || 20) + raw : raw;
        const est = input.estimate1RM(w, Number(s.reps) || 0);
        if (est > best) best = est;
      }
      if (best > 0) {
        const list = byLift.get(ex.name) ?? [];
        list.push({ date, est: best });
        byLift.set(ex.name, list);
      }
    }
  }

  const lifts: LiftLine[] = [];
  for (const [name, readings] of byLift) {
    if (readings.length < MIN_LIFT_READINGS) continue;
    readings.sort((a, b) => (a.date < b.date ? -1 : 1));
    const first = readings[0]!.est;
    const last = readings[readings.length - 1]!.est;
    if (!(first > 0)) continue;
    lifts.push({
      name,
      from: round(first),
      to: round(last),
      deltaPct: round(((last - first) / first) * 100),
      readings: readings.length,
    });
  }
  lifts.sort((a, b) => b.deltaPct - a.deltaPct || (a.name < b.name ? -1 : 1));

  // --- Bodyweight across the same window.
  const weights = Object.entries(input.nutrition)
    .filter(([d, n]) => d >= from && d <= to && !!n?.bodyWeight)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const bodyweight =
    weights.length >= 2
      ? {
          from: round(weights[0]![1].bodyWeight!),
          to: round(weights[weights.length - 1]![1].bodyWeight!),
          delta: round(weights[weights.length - 1]![1].bodyWeight! - weights[0]![1].bodyWeight!),
        }
      : null;

  // --- Verdicts. Each is a measured statement with its consequence, ordered
  //     by how much it would change the next block.
  const verdicts: string[] = [];

  const over = volume.filter((v) => v.tier === "over");
  if (over.length) {
    verdicts.push(
      `${over.map((v) => v.label.toLowerCase()).join(", ")} ran past the recoverable ceiling all block. Start the next one lower and climb.`,
    );
  }
  const under = volume.filter((v) => v.tier === "under");
  if (under.length) {
    const worst = under[0]!;
    verdicts.push(
      `${worst.label} averaged ${worst.perWeek} sets a week against a minimum of ${worst.mev}. It was maintained, not grown.`,
    );
  }

  const gained = lifts.filter((l) => l.deltaPct > 2);
  const flat = lifts.filter((l) => Math.abs(l.deltaPct) <= 2);
  const lost = lifts.filter((l) => l.deltaPct < -2);
  if (gained.length) {
    const top = gained[0]!;
    verdicts.push(
      `${top.name} moved ${top.deltaPct > 0 ? "+" : ""}${top.deltaPct}% (${top.from} → ${top.to}). ${gained.length} of ${lifts.length} lifts gained.`,
    );
  }
  // Every lift flat is always worth saying, however few there are — that IS
  // the whole block. Otherwise it takes a real cluster, not one lift in two.
  if (
    lifts.length > 0 &&
    (flat.length === lifts.length || flat.length >= Math.max(2, Math.ceil(lifts.length / 2)))
  ) {
    verdicts.push(
      `${flat.length} of ${lifts.length} lifts finished where they started. Same load, same reps, same result — change the variation or the set count, not the effort.`,
    );
  }
  if (lost.length) {
    verdicts.push(
      `${lost.map((l) => l.name).slice(0, 3).join(", ")} went backwards. Worth checking against sleep and food over the same weeks before blaming the programme.`,
    );
  }

  if (bodyweight) {
    const perWeek = round(bodyweight.delta / weeks, 2);
    verdicts.push(
      `Bodyweight ${bodyweight.delta >= 0 ? "up" : "down"} ${Math.abs(bodyweight.delta)} kg across the block, ${Math.abs(perWeek)} kg a week.`,
    );
  }

  if (base.sessionsPerWeek < 3) {
    verdicts.push(
      `${base.sessionsPerWeek} session${base.sessionsPerWeek === 1 ? "" : "s"} a week. Frequency, not programming, was the limit on this block.`,
    );
  }

  if (!verdicts.length) {
    verdicts.push("Volume in range, lifts moving, nothing to change. Run it again.");
  }

  return { ...base, volume, lifts, bodyweight, verdicts, thin: false };
}
