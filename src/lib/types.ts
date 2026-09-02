export type SetType = "normal" | "dropset" | "warmup";
export type Unit = "kg" | "lb";
export type ThemePref = "dark" | "light" | "system";
export type TabId = "workout" | "nutrition" | "body" | "insights" | "settings";

export interface WorkoutSet {
  weight: number | "";
  reps: number | "";
  failure: number;
  done: boolean;
  type: SetType;
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
  startTime: number;
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
