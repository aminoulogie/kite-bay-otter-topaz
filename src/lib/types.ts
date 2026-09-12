import type { TrainingGoal } from "./goal-mode.ts";
export type SetType = "normal" | "dropset" | "warmup";
export type Unit = "kg" | "lb";
export type ThemePref = "dark" | "light" | "system";
export type TabId =
  // Left of the dashboard: the rest of what gets tracked.
  | "mind"
  | "looks"
  | "money"
  // The middle, and where the app opens.
  | "dashboard"
  // Right of it: the body.
  | "workout"
  | "nutrition"
  | "habits"
  | "body"
  | "insights"
  | "estimates"
  | "settings"
  // The day itself, as a ring.
  | "time";

export interface WorkoutSet {
  weight: number | "";
  reps: number | "";
  /**
   * The old 1-5 rating. Kept because every imported set and every session
   * logged before the quality fields existed carries one, and calorie and
   * stimulus maths still reads it. New sets get it derived from `closeness`
   * so the two never disagree.
   */
  failure: number;
  done: boolean;
  type: SetType;

  /**
   * What actually ended the set. See lib/set-quality.ts — these are optional
   * because history predates them, and absent must read as "not recorded"
   * rather than as a zero.
   */
  limiter?: "target" | "synergist" | "form" | "choice";
  closeness?: "reps_left" | "one_left" | "nothing" | "forced";
  limitedBy?: string[];
  burn?: 1 | 2 | 3;
  form?: 1 | 2 | 3;
}

export interface SessionExercise {
  name: string;
  muscle: string;
  subTarget: string;
  targetKeys: string[];
  position: string;
  risk: string;
  tier: string;
  isAxial: boolean;
  isBW: boolean;
  usesBar: boolean;
  barWeight: number;
  supersetGroup: string;
  sets: WorkoutSet[];
  /**
   * How pumped the muscle was at the end of this exercise, 1-3.
   *
   * Per exercise rather than per set: pump accumulates across an exercise and
   * is only really judgeable once the weight is racked. Optional, because
   * every session logged before this existed has none.
   */
  pump?: 1 | 2 | 3;
}

export interface MuscleStimulus {
  sets: number;
  avgFail: number;
}

export interface HistorySession {
  timestamp: number;
  split: string;
  durationFormatted: string;
  caloriesBurned: number;
  totalVol: number;
  totalSets: number;
  axialVol: number;
  exercises: SessionExercise[];
  muscles: Record<string, MuscleStimulus>;
}

export interface Goals {
  cals: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
  fiber: number;
  calcium: number;
  iron: number;
  magnesium: number;
  potassium: number;
  sodium: number;
  zinc: number;
  vitA: number;
  vitC: number;
  vitD: number;
  vitE: number;
  vitB6: number;
  vitB12: number;
  folate: number;
}

export interface FoodItem {
  name: string;
  serving: number;
  unit: string;
  cals: number;
  p: number;
  c: number;
  f: number;
  fiber: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
  magnesium: number;
  zinc: number;
  /**
   * Vitamins, per the same serving as everything else.
   *
   * Optional because most foods carry no figure and 0 has to keep meaning
   * "not recorded" rather than "none present" — the minerals card already
   * distinguishes the two and names the foods behind a gap.
   *
   * Units follow the labels: A and folate in micrograms, D and B12 in
   * micrograms, C, E and B6 in milligrams.
   */
  vitA?: number;
  vitC?: number;
  vitD?: number;
  vitE?: number;
  vitB6?: number;
  vitB12?: number;
  folate?: number;
  meal: string;
  isBase?: boolean;
  usageCount?: number;
  /**
   * Macros per 100g as logged from the library or a barcode. Kept so changing
   * the portion later re-scales from the source figures instead of compounding
   * rounding on already-rounded numbers.
   */
  per100?: { cals: number; p: number; c: number; f: number; fiber: number };
  /**
   * How much of this portion is water, in millilitres.
   *
   * Drinks are food AND hydration: a litre of orange juice is roughly 880 ml
   * of water, and leaving that out of the day meant drinking a litre of juice
   * counted for nothing against the water target. Stored on the logged item
   * rather than added to `day.water`, so editing the portion or deleting the
   * item takes its water with it instead of stranding millilitres nobody can
   * find.
   */
  waterMl?: number;
  /**
   * Percent of the food that is water, 0-100, from the library entry.
   *
   * Kept alongside `waterMl` because the millilitres are a property of the
   * portion and the percentage is a property of the food — re-sizing a portion
   * has to recompute one from the other.
   */
  waterPct?: number;
  /**
   * The product's real barcode, for anything that has one.
   *
   * Only ever set from a source that actually knows it — a scan, or an
   * imported sheet. Never invented: a wrong barcode does not merely fail to
   * find the product, it can find the wrong one and log its calories.
   */
  barcode?: string;
  /** Shipped grouping — Meat, Dairy, Algerian… — for filtering the picker. */
  group?: string;
}

export interface SleepLog {
  hours: number;
  /**
   * 1-5, and genuinely optional.
   *
   * Logging hours from the Home card takes one tap; being made to rate the
   * night as well is what stops it being one tap. The readiness blend already
   * weights hours twice as heavily and skips any part it was not given, so an
   * unrated night costs almost nothing — and inventing a 3 to fill the field
   * would put a number nobody entered into a figure that drives load.
   */
  quality?: number;
}

export interface ReadinessCheckin {
  soreness: number;
  stress: number;
}

export interface NutritionDay {
  goals: Goals;
  water: number;
  bodyWeight?: number;
  creatine?: number;
  items: FoodItem[];
  /**
   * Food planned but not yet eaten.
   *
   * A SEPARATE array rather than a flag on the items, and that is the whole
   * design. Around twenty places in this app sum `day.items` — the day score,
   * the maintenance estimate, the minerals card, the CSV export, the coach
   * brief, five charts. A `planned: true` flag would have counted breakfast
   * you have not eaten in every one of them until someone remembered to filter
   * it, and the ones that were missed would be silently wrong rather than
   * broken. Keeping planned food out of `items` makes every existing total
   * correct without touching it.
   *
   * Confirming moves the item across. Nothing is ever in both.
   */
  planned?: FoodItem[];
  sleep?: SleepLog;
  measurements?: Record<string, number>;
  readiness?: ReadinessCheckin;
}

/** One action inside a habit that is really a checklist. See lib/habit-steps.ts. */
export interface HabitStep {
  id: string;
  name: string;
  /** Times a day it has to happen. 1 for most things, 3 for brushing. */
  target: number;
}

export interface Habit {
  id: string;
  name: string;
  desc: string;
  color: string;
  goalDaysPerWeek: number;
  /**
   * Whether the day counts as done. Stays authoritative for every reader —
   * streaks, heatmaps, calendar marks, the coach — including for habits with
   * steps, where it is derived from them rather than pressed.
   */
  history: Record<string, boolean>;
  /**
   * A checklist. When present the habit is done only on days where every step
   * has met its target, and the tick cannot be pressed directly.
   */
  steps?: HabitStep[];
  /** date -> step id -> times done that day. Absent means none. */
  stepLog?: Record<string, Record<string, number>>;
}

export interface Settings {
  /**
   * Daily nutrition targets the user has set themselves.
   *
   * Partial and optional: only the fields actually overridden are stored, so
   * anything left alone keeps following the defaults (and protein keeps
   * following bodyweight when autoProteinTarget is on) instead of being frozen
   * at whatever the default happened to be on the day it was first edited.
   */
  customGoals?: Partial<Goals>;
  unit: Unit;
  /** What money is counted in. Defaults to the dinar; free text, not a list. */
  currency?: string;
  /** Monthly spending budget. Unset means the Money tab reports without judging. */
  monthlyBudget?: number;
  /** Spending categories. Unset means the shipped defaults. */
  spendCategories?: string[];
  /**
   * Which way you are eating. Decides whether hunger costs points: on a cut it
   * is the deficit working, on a bulk it means the surplus did not happen.
   */
  phase?: "bulk" | "cut" | "maintain";
  /**
   * What the training is for. Bends the weekly volume landmarks — see
   * lib/goal-mode.ts. Deliberately does NOT move the mesocycle clock: deload
   * weeks are a property of the calendar, and shifting them when the goal
   * changes would relabel every week already trained.
   */
  trainingGoal?: TrainingGoal;
  barWeight: number;
  restDefault: number;
  autoRest: boolean;
  sound: boolean;
  confetti: boolean;
  theme: ThemePref;
  accent: string;
  sessionsPerWeek: number;
  autoProteinTarget: boolean;
  proteinPerKg: number;
  creatineStashGrams: number;
  scheduleOverrides: Record<string, string>;
  customRoutines: Record<string, { name: string }[]>;
  customRoutinesRemoved: string[];
  /**
   * The cutoff of the one-time nutrition purge that has already run.
   *
   * Stored rather than run on every boot: the purge deletes days, so it must
   * happen exactly once. Holding the date it ran with also means raising the
   * cutoff later re-runs it, and lowering it never resurrects anything —
   * deleted is deleted.
   */
  nutritionPurgedBefore?: string;
}

export interface LiveSession {
  /** When the session object was created — not what the timer measures. */
  startTime: number;
  /**
   * The calendar day this sheet belongs to.
   *
   * `live` is persisted, so without this a session finished yesterday came
   * back this morning as today's screen — the summary of yesterday's workout,
   * with no way to start today's beyond adding an exercise by hand. Compared
   * against today on every boot; a mismatch means the sheet is stale and is
   * replaced. Optional only because installs from before this existed have
   * none, and an absent value is treated as "unknown, so refresh it".
   */
  date?: string;
  /**
   * When the first set was actually completed. The workout clock runs from
   * here, so time spent with the tab open before training does not count and
   * a session left open overnight cannot report a 14-hour workout.
   * Null until something is logged.
   */
  firstSetAt: number | null;
  /**
   * Set only when logging a day retroactively.
   *
   * The clock cannot decide the date for a session being backfilled: work
   * "started" whenever the user opened the form, which is today, not the day
   * being logged. When present this wins over the clock.
   */
  forDate?: string;
  split: string;
  exercises: SessionExercise[];
  undoStack: string[];
  redoStack: string[];
  finished: HistorySession | null;
  restEndsAt: number | null;
  restTotal: number;
  readinessDismissed: boolean;
}

export interface ExerciseDef {
  name: string;
  muscle: string;
  subTarget: string;
  targetKeys: string[];
  position: string;
  risk: string;
  tier: string;
  isAxial: boolean;
  isBW: boolean;
}

/**
 * Money and mind, logged the same way training is: one dated entry at a time.
 *
 * Both live in the main store rather than in their own localStorage key, which
 * is what the side-stores work established as the rule — anything with its own
 * key has to be remembered separately at backup time, and four things had
 * already been forgotten that way.
 */
export interface LedgerEntry {
  id: string;
  /** Local date key, the same shape every other log uses. */
  date: string;
  /** Negative amounts are not allowed; the kind carries the direction. */
  kind: "spend" | "income";
  amount: number;
  category: string;
  note?: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  /** The day it was added, so a list can be cleared by age rather than by hand. */
  date: string;
}

export interface MindEntry {
  id: string;
  date: string;
  kind: "book" | "article" | "language" | "idea";
  title: string;
  /** Minutes spent, pages read, words learned — whatever the kind counts. */
  count?: number;
  /**
   * What you took from it.
   *
   * Required in the UI for an article on purpose: one you cannot summarise in
   * a line is one you skimmed, and logging it as "read" is lying to yourself.
   */
  takeaway?: string;
  /**
   * Books: what a shelf needs.
   *
   * `pages` is the MEDIAN across editions rather than one edition's count —
   * editions of the same book differ by hundreds of pages, and a progress bar
   * measured against the wrong one is worse than no progress bar.
   */
  author?: string;
  pages?: number;
  page?: number;
  /** Open Library work key, so the same book can be looked up again. */
  sourceKey?: string;
  /** Set once the last page is turned, so a shelf can be read from a log. */
  finished?: string;
  /**
   * Words: how it sounds, and a sentence using it.
   *
   * The definition itself goes in `takeaway`, which means vocabulary joins the
   * spaced-repetition queue for free — and drilling a word at two days, a week
   * and a month is exactly what you would build for it anyway.
   */
  phonetic?: string;
  example?: string;
  /** Where a fetched definition came from. A definition is never anonymous. */
  source?: string;
  /**
   * Dates the takeaway was reviewed, oldest first.
   *
   * Spaced repetition state, kept on the entry rather than in a side store so
   * it rides the existing backup and cannot drift away from what it describes.
   * Absent means never reviewed — see lib/review-queue.ts.
   */
  reviews?: string[];
}
