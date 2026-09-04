export type SetType = "normal" | "dropset" | "warmup";
export type Unit = "kg" | "lb";
export type ThemePref = "dark" | "light" | "system";
export type TabId = "workout" | "nutrition" | "habits" | "body" | "insights" | "settings";

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
  meal: string;
  isBase?: boolean;
  usageCount?: number;
  /**
   * Macros per 100g as logged from the library or a barcode. Kept so changing
   * the portion later re-scales from the source figures instead of compounding
   * rounding on already-rounded numbers.
   */
  per100?: { cals: number; p: number; c: number; f: number; fiber: number };
}

export interface SleepLog {
  hours: number;
  quality: number;
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
  sleep?: SleepLog;
  measurements?: Record<string, number>;
  readiness?: ReadinessCheckin;
}

export interface Habit {
  id: string;
  name: string;
  desc: string;
  color: string;
  goalDaysPerWeek: number;
  history: Record<string, boolean>;
}

export interface Settings {
  unit: Unit;
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
}

export interface LiveSession {
  /** When the session object was created — not what the timer measures. */
  startTime: number;
  /**
   * When the first set was actually completed. The workout clock runs from
   * here, so time spent with the tab open before training does not count and
   * a session left open overnight cannot report a 14-hour workout.
   * Null until something is logged.
   */
  firstSetAt: number | null;
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
