/**
 * The coach brief: at most three things worth doing, ranked.
 *
 * The app computes a great deal — volume landmarks, sleep debt, stalls,
 * protein, hunger, habits — and shows all of it, on five different tabs. That
 * is a dashboard, not a coach. Nobody reads twenty rows and works out which
 * one matters; they read the top one and act, or they read none.
 *
 * So this file answers one question: given everything logged, what are the
 * next three moves? Three because a list of ten is a list of none, and ranked
 * because "you are over MRV on chest" and "you missed a habit" are not the
 * same size of problem.
 *
 * Three rules hold the whole thing together:
 *
 *  1. **Deterministic.** No model, no sampling, no phrasing that changes
 *     between renders. The same logged data produces the same three lines in
 *     the same order, every time, on every screen that asks. A coach that
 *     says something different each time you look is noise.
 *
 *  2. **Every action carries its number.** `why` is not commentary, it is the
 *     figure the rule fired on. If a line cannot cite what produced it, it is
 *     an opinion and does not belong here.
 *
 *  3. **It withholds.** With four days logged there is nothing honest to say,
 *     and saying it anyway teaches the user to ignore the card. Each rule has
 *     its own data floor on top of the global one, so a brief never fires on
 *     a sample too small to mean anything.
 */

import { hungerOn, type HungerEntry, type Phase } from "./hunger.ts";
import type { HistorySession, NutritionDay, TabId } from "./types.ts";

/** Which question is being asked: "what now" or "how is the week going". */
export type BriefHorizon = "today" | "week";

export interface BriefAction {
  id: string;
  /** The instruction, imperative and one line. */
  text: string;
  /** The figure the rule fired on. Never a restatement of the instruction. */
  why: string;
  tab: TabId;
  /** Fixed per rule, so ordering never depends on iteration order. */
  weight: number;
}

export interface Brief {
  actions: BriefAction[];
  /** Set when the brief is deliberately empty, with the reason. */
  withheld: string | null;
}

/** One row of the weekly volume report, goal-scaled by the caller. */
export interface VolumeRow {
  label: string;
  sets: number;
  mev: number;
  mav: number;
  mrv: number;
  tier: string;
}

/** A lift the trend detector has called flat. */
export interface StalledLift {
  name: string;
  sessions: number;
}

export interface HabitLike {
  id: string;
  name: string;
  history?: Record<string, boolean>;
}

export interface BriefInput {
  today: string;
  horizon: BriefHorizon;
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  habits: HabitLike[];
  hunger: HungerEntry[];
  phase: Phase;
  /** Weekly working sets per muscle, already scaled to the training goal. */
  volume: VolumeRow[];
  /** Running sleep debt in hours, from lib/sleep-debt. */
  sleepDebt: number;
  stalled: StalledLift[];
  isDeload: boolean;
}

/** The brief says nothing at all below this many days with something logged. */
export const MIN_LOGGED_DAYS = 7;

/** Protein needs this many logged days in the window before it is judged. */
export const MIN_PROTEIN_DAYS = 4;

/** Sleep debt at or above this is the single most valuable thing to fix. */
export const DEBT_THRESHOLD = 8;

export const MAX_ACTIONS = 3;

/** Which horizon a rule belongs to. "both" fires on either question. */
type Scope = "today" | "week" | "both";

interface Candidate extends BriefAction {
  scope: Scope;
}

// ------------------------------------------------------------------ helpers --

/** The n date keys ending at `today`, most recent last. */
export function lastNDays(today: string, n: number): string[] {
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(base.getTime() - i * 86400000);
    out.push(
      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function loggedDayCount(
  history: Record<string, HistorySession>,
  nutrition: Record<string, NutritionDay>,
): number {
  const days = new Set<string>();
  for (const [d, s] of Object.entries(history ?? {})) if (s?.exercises?.length) days.add(d);
  for (const [d, n] of Object.entries(nutrition ?? {})) {
    if (n?.items?.length || n?.sleep?.hours != null || n?.bodyWeight) days.add(d);
  }
  return days.size;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// -------------------------------------------------------------------- rules --

/**
 * Each rule returns at most one candidate. Rules never return two rows for the
 * same problem — "chest over MRV" and "back over MRV" is one message about
 * doing too much, and splitting it across two of three slots crowds out
 * everything else.
 */
function rules(input: BriefInput): Candidate[] {
  const out: Candidate[] = [];
  const week = lastNDays(input.today, 7);
  const inWeek = new Set(week);

  // --- Doing more than can be recovered. Outranks everything: extra sets
  //     past MRV are not slow progress, they are negative progress.
  const over = input.volume
    .filter((r) => r.mrv > 0 && r.sets > r.mrv)
    .sort((a, b) => b.sets - b.mrv - (a.sets - a.mrv) || (a.label < b.label ? -1 : 1))[0];
  if (over) {
    const excess = Math.round(over.sets - over.mrv);
    out.push({
      id: "over-mrv",
      scope: "week",
      weight: 92,
      text: `Cut ${plural(excess, "set")} of ${over.label.toLowerCase()} this week`,
      why: `${Math.round(over.sets)} working sets against an MRV of ${over.mrv}.`,
      tab: "insights",
    });
  }

  // --- Sleep debt. Nothing else on this list survives a lifter who is not
  //     sleeping, which is why it sits above every nutrition rule.
  if (input.sleepDebt >= DEBT_THRESHOLD) {
    out.push({
      id: "sleep-debt",
      scope: "both",
      weight: 88,
      text: "Get an extra 90 minutes tonight",
      why: `${input.sleepDebt.toFixed(1)}h of sleep debt built up.`,
      tab: "body",
    });
  }

  // --- Deload week. The programme already said so; the brief makes sure it
  //     is not quietly ignored, which is the usual fate of a deload.
  if (input.isDeload) {
    out.push({
      id: "deload",
      scope: "both",
      weight: 84,
      text: "Deload week — halve the sets and stop well short",
      why: "The mesocycle clock has this week down as recovery.",
      tab: "workout",
    });
  }

  // --- Protein. Judged over the days actually logged, never over days the
  //     user simply did not record, which would report a shortfall nobody had.
  const proteinDays = week
    .map((d) => input.nutrition[d])
    .filter((n): n is NutritionDay => !!n?.items?.length && !!n.goals?.protein);
  if (proteinDays.length >= MIN_PROTEIN_DAYS) {
    const hit = proteinDays.map((n) => {
      const grams = n.items!.reduce((a, i) => a + (i.p || 0), 0);
      return grams / n.goals!.protein!;
    });
    const mean = hit.reduce((a, b) => a + b, 0) / hit.length;
    if (mean < 0.85) {
      const shortDays = hit.filter((h) => h < 0.85).length;
      const target = proteinDays[proteinDays.length - 1]!.goals!.protein!;
      const gap = Math.round(target * (1 - mean));
      out.push({
        id: "protein-short",
        scope: "both",
        weight: 76,
        text: `Add about ${gap}g of protein to your usual day`,
        why: `${Math.round(mean * 100)}% of target across ${plural(proteinDays.length, "logged day")}, short on ${shortDays}.`,
        tab: "nutrition",
      });
    }
  }

  // --- Hunger on a bulk. A surplus that leaves you hungry did not happen.
  if (input.phase === "bulk") {
    const hungryDays = week.filter((d) => hungerOn(input.hunger, d).length > 0).length;
    if (hungryDays >= 2) {
      out.push({
        id: "hungry-bulk",
        scope: "both",
        weight: 72,
        text: "Move calories earlier — you are running hungry on a bulk",
        why: `Hunger logged on ${plural(hungryDays, "of the last 7 day")}.`,
        tab: "nutrition",
      });
    }
  }

  // --- Under the minimum effective volume on something you did train. A
  //     muscle at zero is a programme choice; one at three sets is waste.
  const under = input.volume
    .filter((r) => r.sets > 0 && r.mev > 0 && r.sets < r.mev)
    .sort((a, b) => a.sets / a.mev - b.sets / b.mev || (a.label < b.label ? -1 : 1))[0];
  if (under) {
    const need = Math.ceil(under.mev - under.sets);
    out.push({
      id: "under-mev",
      scope: "week",
      weight: 68,
      text: `Add ${plural(need, "set")} of ${under.label.toLowerCase()} before the week is out`,
      why: `${Math.round(under.sets)} sets against a minimum of ${under.mev}.`,
      tab: "workout",
    });
  }

  // --- A lift that has stopped moving. Adding load is the one thing that
  //     will not help, so the action is explicitly something else.
  const stall = [...input.stalled].sort(
    (a, b) => b.sessions - a.sessions || (a.name < b.name ? -1 : 1),
  )[0];
  if (stall) {
    out.push({
      id: "stalled-lift",
      scope: "week",
      weight: 64,
      text: `Swap or add a set to ${stall.name} — the load is not moving`,
      why: `No estimated-1RM gain across ${plural(stall.sessions, "session")}.`,
      tab: "workout",
    });
  }

  // Deliberately NO "log today's sleep" rule. The Log the gap card sits
  // directly under this one on Home and fills that gap in a tap; spending a
  // slot on a job the next card does, and does better, would push a real
  // finding off the list.

  // --- A habit that has quietly stopped. Needs a full week of history so a
  //     habit added on Friday is not reported as failing.
  const habitCandidates = input.habits
    .map((h) => {
      const known = week.filter((d) => h.history?.[d] !== undefined).length;
      const done = week.filter((d) => h.history?.[d] === true).length;
      return { h, known, done };
    })
    .filter((c) => c.known >= 5 && c.done / 7 < 0.4)
    .sort((a, b) => a.done - b.done || (a.h.name < b.h.name ? -1 : 1));
  const slipping = habitCandidates[0];
  if (slipping) {
    out.push({
      id: "habit-slip",
      scope: "both",
      weight: 40,
      text: `Get ${slipping.h.name} back — pick the easiest day this week`,
      why: `Done ${slipping.done} of the last 7 days.`,
      tab: "habits",
    });
  }

  // Unused for now, but computed above and worth keeping honest.
  void inWeek;
  return out;
}

// ------------------------------------------------------------------- public --

export function coachBrief(input: BriefInput): Brief {
  const logged = loggedDayCount(input.history, input.nutrition);
  if (logged < MIN_LOGGED_DAYS) {
    return {
      actions: [],
      withheld: `Needs ${MIN_LOGGED_DAYS} days with something logged before it will call anything — ${logged} so far.`,
    };
  }

  const actions = rules(input)
    .filter((c) => c.scope === "both" || c.scope === input.horizon)
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_ACTIONS)
    .map(({ scope: _scope, ...a }) => a);

  return {
    actions,
    withheld: actions.length ? null : "Nothing is off track enough to be worth a line.",
  };
}
