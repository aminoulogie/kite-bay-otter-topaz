import {
  BASE_EXERCISE_DB,
  BASE_FOOD_LIBRARY,
  DEFAULT_GOALS,
  ROUTINE_PRESETS,
  SomaIntelligenceEngine,
  getLocalDateKey,
  parseLocalDateKey,
} from "./soma";
import type {
  ExerciseDef,
  FoodItem,
  Goals,
  Habit,
  HistorySession,
  NutritionDay,
  SessionExercise,
  Settings,
} from "./types";

const TODAY = new Date();

function dateKeyOffset(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return getLocalDateKey(d);
}

function usesBar(name: string) {
  const n = name.toLowerCase();
  if (n.includes("dumbbell") || n.includes("cable") || n.includes("machine") || n.includes("pec deck"))
    return false;
  return /barbell|ez[- ]?(curl )?bar|ez bar|trap bar|hex bar|deadlift|smith/.test(n);
}

const LIFT_BASE: Record<string, number> = {
  "Hack Squat": 90,
  "Romanian Deadlift (DB/Barbell)": 80,
  "Leg Extensions": 45,
  "Seated Leg Curl": 40,
  "Standing Machine Calf Raise": 80,
  "Smith Machine Incline Press": 60,
  "Pec Deck Fly (Machine)": 40,
  "Machine Shoulder Press": 45,
  "Cable Y-Raise": 8,
  "Cable Triceps Pushdown (Straight/V)": 25,
  "Weighted Chest Dips": 10,
  "Single-Arm Lat Cable Row": 30,
  "Seated Cable Row (Wide)": 50,
  "Reverse Pec Deck": 30,
  "Bayesian Cable Curl": 15,
  "Hammer Curl (Dumbbell/Cable)": 16,
  "Leg Press": 160,
  "Lying Leg Curl": 40,
  "Barbell / Machine Hip Thrust": 90,
  "Seated Calf Raise Machine": 50,
  "Incline Dumbbell Press": 28,
  "Chest-Supported T-Bar Row": 50,
  "Cable Lateral Raise": 8,
  "Lat Pulldown (Wide/Neutral)": 55,
  "Standing Low Pulley Overhead Tricep Extension": 22,
  "One-Arm Dumbbell Preacher Curl": 12,
};

function findEx(name: string): ExerciseDef | undefined {
  return (BASE_EXERCISE_DB as ExerciseDef[]).find((e) => e.name === name);
}

function buildSession(split: string, daysAgo: number, weekIndex: number): HistorySession | null {
  const list = (ROUTINE_PRESETS as Record<string, { name: string }[]>)[split];
  if (!list || list.length === 0) return null;
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(18, 10, 0, 0);
  const bump = weekIndex * 2.5;
  const exercises: SessionExercise[] = list.map((item) => {
    const data = findEx(item.name);
    const isBW = !!data?.isBW;
    const bar = usesBar(item.name);
    const base = LIFT_BASE[item.name] ?? (isBW ? 0 : 40);
    const w = isBW && base === 0 ? 0 : Math.round((base + bump) * 2) / 2;
    const sets = [0, 1, 2].map((i) => ({
      weight: w as number | "",
      reps: i === 2 ? 8 : 10,
      failure: i === 2 ? 3 : 2,
      done: true,
      type: "normal" as const,
    }));
    return {
      name: item.name,
      muscle: data?.muscle || "Custom",
      subTarget: data?.subTarget || "",
      targetKeys: data?.targetKeys || [],
      position: data?.position || "",
      risk: data?.risk || "Low",
      tier: data?.tier || "A-Tier",
      isAxial: !!data?.isAxial,
      isBW,
      usesBar: bar,
      barWeight: 20,
      supersetGroup: "",
      sets,
    };
  });

  const muscles: HistorySession["muscles"] = {};
  let totalVol = 0;
  let axialVol = 0;
  let totalSets = 0;
  let failSum = 0;
  for (const ex of exercises) {
    const working = ex.sets.filter((s) => s.done && s.type === "normal");
    totalSets += working.length;
    for (const s of working) {
      const vol = SomaIntelligenceEngine.calculateWorkVolume(s.weight || 0, Number(s.reps) || 0, ex.isBW);
      totalVol += vol;
      if (ex.isAxial) axialVol += vol;
      failSum += s.failure;
      for (const k of ex.targetKeys) {
        if (!muscles[k]) muscles[k] = { sets: 0, avgFail: 0 };
        muscles[k].sets += 1;
        muscles[k].avgFail += s.failure;
      }
    }
  }
  for (const k of Object.keys(muscles)) {
    const m = muscles[k]!;
    m.avgFail = m.sets ? m.avgFail / m.sets : 3;
  }
  const mins = 48 + (weekIndex % 3) * 6;
  const avgFail = totalSets ? failSum / totalSets : 3;
  return {
    timestamp: d.getTime(),
    split,
    durationFormatted: `${mins}:12`,
    caloriesBurned: SomaIntelligenceEngine.calculateCaloriesBurned(mins, totalVol, totalSets, avgFail),
    totalVol,
    totalSets,
    axialVol,
    exercises,
    muscles,
  };
}

export function seedHistory(): Record<string, HistorySession> {
  const out: Record<string, HistorySession> = {};
  for (let daysAgo = 56; daysAgo >= 1; daysAgo--) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(12, 0, 0, 0);
    const proj = SomaIntelligenceEngine.getProgramProjectedDay(d, {});
    if (proj.isRest) continue;
    const weekIndex = Math.floor((56 - daysAgo) / 7);
    const session = buildSession(proj.split, daysAgo, weekIndex);
    if (!session) continue;
    out[getLocalDateKey(d)] = session;
  }
  return out;
}

const MEAL_TEMPLATES: { meal: string; names: string[]; servings: number[] }[] = [
  { meal: "Breakfast", names: ["Whole Eggs", "Oatmeal (Dry)", "Banana"], servings: [1.5, 1, 1] },
  { meal: "Lunch", names: ["Chicken Breast (Cooked)", "White Rice (Cooked)", "Olive Oil"], servings: [1.8, 1.2, 1] },
  { meal: "Dinner", names: ["Canned Tuna (Drained)", "White Rice (Cooked)", "Greek / Plain Yogurt"], servings: [1, 1, 1] },
  { meal: "Post-Workout", names: ["Whey Protein Isolate", "Banana"], servings: [1, 1] },
  { meal: "Snacks", names: ["Peanut Butter", "Greek / Plain Yogurt"], servings: [0.5, 1] },
];

function scaleFood(name: string, multiplier: number, meal: string): FoodItem | null {
  const base = BASE_FOOD_LIBRARY.find((f) => f.name === name);
  if (!base) return null;
  const m = multiplier;
  return {
    name: base.name,
    serving: Math.round(base.serving * m),
    unit: base.unit,
    cals: Math.round(base.cals * m),
    p: Math.round(base.p * m * 10) / 10,
    c: Math.round(base.c * m * 10) / 10,
    f: Math.round(base.f * m * 10) / 10,
    fiber: Math.round((base.fiber || 0) * m * 10) / 10,
    sodium: Math.round((base.sodium || 0) * m),
    potassium: Math.round((base.potassium || 0) * m),
    calcium: Math.round((base.calcium || 0) * m),
    iron: Math.round((base.iron || 0) * m * 10) / 10,
    magnesium: Math.round((base.magnesium || 0) * m),
    zinc: Math.round((base.zinc || 0) * m * 10) / 10,
    meal,
  };
}

export function seedNutrition(): Record<string, NutritionDay> {
  const out: Record<string, NutritionDay> = {};
  const goals: Goals = { ...DEFAULT_GOALS, cals: 2300, protein: 165 };
  for (let daysAgo = 42; daysAgo >= 0; daysAgo--) {
    const key = dateKeyOffset(-daysAgo);
    const d = parseLocalDateKey(key);
    const skipFood = daysAgo === 2 || daysAgo === 11;
    const items: FoodItem[] = [];
    if (!skipFood) {
      for (const tpl of MEAL_TEMPLATES) {
        tpl.names.forEach((n, i) => {
          const jitter = 0.9 + ((d.getDate() + i) % 5) * 0.04;
          const item = scaleFood(n, (tpl.servings[i] || 1) * jitter, tpl.meal);
          if (item) items.push(item);
        });
      }
    }
    const t = daysAgo / 42;
    const weight = Math.round((79.2 - t * 1.5 + Math.sin(daysAgo) * 0.12) * 10) / 10;
    const sleepHours = Math.round((7.1 + Math.sin(daysAgo * 0.7) * 0.8 + (daysAgo % 6 === 0 ? -0.6 : 0.2)) * 4) / 4;
    out[key] = {
      goals: { ...goals },
      water: skipFood ? 1800 : 2800 + (daysAgo % 4) * 250,
      bodyWeight: daysAgo % 2 === 0 ? weight : undefined,
      creatine: skipFood ? 0 : 5,
      items,
      sleep: { hours: Math.max(5.5, Math.min(9, sleepHours)), quality: sleepHours >= 7.5 ? 5 : sleepHours >= 6.5 ? 4 : 3 },
      measurements:
        daysAgo % 7 === 0
          ? {
              neck: 38.2,
              chest: 102 - t * 0.4,
              waist: 84 - t * 1.6,
              hips: 98 - t * 0.6,
              armL: 35.4 + t * 0.3,
              armR: 35.6 + t * 0.3,
              thighL: 58 - t * 0.4,
              thighR: 58.2 - t * 0.4,
              calf: 38,
            }
          : undefined,
      readiness: { soreness: 2 + (daysAgo % 3 === 0 ? 1 : 0), stress: 2 },
    };
  }
  return out;
}

export function seedHabits(): Habit[] {
  /**
   * Habits start EMPTY.
   *
   * They used to ship with 48 days of invented history, which showed a streak
   * nobody had earned and made every heatmap and completion figure a fiction.
   * A habit tracker whose first screen lies about the past is worse than an
   * empty one.
   *
   * `missEvery` is kept in the signature only so the call sites below stay
   * readable as a list; it no longer generates anything.
   */
  const mk = (id: string, name: string, desc: string, color: string, goal: number, _missEvery: number): Habit => ({
    id,
    name,
    desc,
    color,
    goalDaysPerWeek: goal,
    history: {},
  });
  return [
    mk("gym-movement", "Train", "Hit the day's split", "#22c55e", 5, 6),
    mk("clean-nutrition", "Hit protein", "Land the protein target", "#38bdf8", 7, 9),
    mk("hydration", "Hydrate", "2.5 L of water", "#22d3ee", 7, 8),
    mk("deep-focus", "Deep work", "90 min focused sprint", "#94a3b8", 5, 5),
  ];
}

export function defaultSettings(): Settings {
  return {
    unit: "kg",
    barWeight: 20,
    restDefault: 90,
    autoRest: true,
    sound: true,
    confetti: true,
    theme: "dark",
    accent: "#d3fd50",
    sessionsPerWeek: 5,
    autoProteinTarget: true,
    proteinPerKg: 2,
    creatineStashGrams: 240,
    scheduleOverrides: {},
    customRoutines: {},
    customRoutinesRemoved: [],
  };
}

export function defaultLive(split: string) {
  return {
    startTime: Date.now(),
    firstSetAt: null,
    split,
    exercises: [] as SessionExercise[],
    undoStack: [] as string[],
    redoStack: [] as string[],
    finished: null,
    restEndsAt: null as number | null,
    restTotal: 90,
    readinessDismissed: false,
  };
}
