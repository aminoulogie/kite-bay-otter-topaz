import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BASE_EXERCISE_DB,
  BASE_FOOD_LIBRARY,
  DEFAULT_GOALS,
  ROUTINE_PRESETS,
  SomaIntelligenceEngine,
  getLocalDateKey,
  ROTATION_SEQUENCE,
} from "./soma";
import type {
  ExerciseDef,
  FoodItem,
  Habit,
  HistorySession,
  LiveSession,
  NutritionDay,
  SessionExercise,
  Settings,
  TabId,
  WorkoutSet,
} from "./types";
import CUSTOM_FOOD_SEED from "./custom-foods-seed.json";
import {
  defaultProgram, loadActiveId, loadPrograms, resolveActiveProgram, saveActiveId,
  savePrograms, type Program,
} from "./programs";
import { defaultLive, defaultSettings, seedHabits, seedHistory, seedNutrition } from "./seed";
import { tallyMuscles } from "./set-quality";

function emptyDay(weight = 78): NutritionDay {
  return {
    goals: { ...DEFAULT_GOALS },
    water: 0,
    bodyWeight: weight,
    creatine: 0,
    items: [],
  };
}

function lastWeight(nutrition: Record<string, NutritionDay>): number {
  const keys = Object.keys(nutrition)
    .filter((k) => nutrition[k]?.bodyWeight)
    .sort();
  const last = keys.length ? nutrition[keys[keys.length - 1]!]!.bodyWeight : 78;
  return last || 78;
}

export function exerciseUsesBar(name = "") {
  const n = name.toLowerCase();
  if (n.includes("dumbbell") || n.includes("cable") || n.includes("machine") || n.includes("pec deck"))
    return false;
  return /barbell|ez[- ]?(curl )?bar|ez bar|trap bar|hex bar|deadlift|smith/.test(n);
}

export interface SomaStore {
  hydrated: boolean;
  seeded: boolean;
  settings: Settings;
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  habits: Habit[];
  customExercises: ExerciseDef[];
  customFoods: FoodItem[];
  live: LiveSession;
  activeDate: string;
  // Uses the shared TabId rather than a second copy of the union; the two
  // had already drifted apart once.
  tab: TabId;
  markHydrated: () => void;
  ensureSeed: () => void;
  mergeCustomFoods: () => void;
  hydratePrograms: () => void;
  programs: Program[];
  activeProgramId: string | null;
  activeProgram: () => Program;
  setPrograms: (programs: Program[]) => void;
  setActiveProgram: (id: string) => void;
  refreshScheduledDay: () => void;
  upsertLibraryFood: (food: FoodItem) => void;
  isFoodEdited: (name: string) => boolean;
  clearSeededHabitHistory: () => number;
  normalizeLive: () => void;
  rollDayIfNeeded: () => boolean;
  setTab: (tab: SomaStore["tab"]) => void;
  setActiveDate: (d: string) => void;
  patchSettings: (p: Partial<Settings>) => void;
  applyGoalsToOpenDays: () => number;
  ensureDay: (key?: string) => void;
  patchDay: (key: string, patch: Partial<NutritionDay>) => void;
  addFood: (item: FoodItem) => void;
  removeFood: (idx: number) => void;
  addWater: (ml: number) => void;
  setWater: (ml: number) => void;
  updateFood: (idx: number, item: FoodItem) => void;
  addCustomFood: (food: FoodItem) => boolean;
  removeCustomFood: (name: string) => void;
  addCreatine: (g: number) => void;
  resetCreatine: () => void;
  logSleep: (hours: number, quality: number) => void;
  logWeight: (kg: number) => void;
  logMeasurements: (m: Record<string, number>) => void;
  logReadiness: (soreness: number, stress: number) => void;
  toggleHabit: (id: string, date?: string) => void;
  addHabit: (h: Omit<Habit, "id" | "history">) => void;
  removeHabit: (id: string) => void;
  allExercises: () => ExerciseDef[];
  routines: () => Record<string, { name: string }[]>;
  lastPerformance: (name: string) => WorkoutSet | null;
  loadSplit: (name: string) => void;
  addExercise: (name: string) => void;
  addCustomExercise: (ex: ExerciseDef) => void;
  updateSet: (exIdx: number, setIdx: number, patch: Partial<WorkoutSet>) => void;
  updateExercise: (exIdx: number, patch: Partial<SessionExercise>) => void;
  addSet: (exIdx: number, type?: WorkoutSet["type"]) => void;
  removeSet: (exIdx: number, setIdx: number) => void;
  removeExercise: (exIdx: number) => void;
  cycleSetType: (exIdx: number, setIdx: number) => void;
  cycleSuperset: (exIdx: number) => void;
  swapExercise: (exIdx: number, name: string) => void;
  snapshot: () => void;
  undo: () => void;
  redo: () => void;
  startRest: (seconds: number) => void;
  clearRest: () => void;
  saveWorkout: () => HistorySession | null;
  resetLive: () => void;
  startBackfill: (date: string, split?: string) => void;
  resumeFinished: () => void;
  saveRoutine: (name: string, list: { name: string }[], original?: string) => string | null;
  deleteRoutine: (name: string) => void;
  exportJson: () => string;
  importJson: (raw: string, mode?: "merge" | "replace") => boolean;
  resetAll: () => void;
}

/**
 * The shipped rotation, built once.
 *
 * Exported so no other module builds its own copy: two structurally equal
 * programmes are still two objects, and one of them coming out of a selector
 * or into a memo dependency starts the same render loop again.
 *
 * Module scope so it is referentially stable — rebuilding it per call is what
 * made the selector return a new object every render.
 */
export const BUILT_IN_PROGRAM = defaultProgram(ROTATION_SEQUENCE);

const SUPERSETS = ["", "A", "B", "C", "D"];

export const useSoma = create<SomaStore>()(
  persist(
    (set, get) => ({
      hydrated: false,
      seeded: false,
      settings: defaultSettings(),
      history: {},
      nutrition: {},
      habits: [],
      customExercises: [],
      customFoods: [],
      programs: [],
      activeProgramId: null,
      live: defaultLive("Legs A (Quad / Squat Dominant)"),
      activeDate: getLocalDateKey(new Date()),
      tab: "workout",

      markHydrated: () => set({ hydrated: true }),
      /**
       * Repairs a live session restored from storage.
       *
       * `live` is persisted, so a session opened days ago keeps ticking and
       * reports something like 838:26 — and because duration feeds
       * calculateCaloriesBurned, it inflates the burn it saves too.
       *
       * Nothing logged means the clock should never have been running. A
       * session that does hold logged sets is kept (it is real work nobody
       * asked to discard), but once it is more than 12 hours old its elapsed
       * time is not a measurement of anything, so the clock is re-anchored to
       * now rather than saving a fabricated duration.
       */
      /**
       * Moves to a fresh sheet when the calendar day changes while the app is
       * open. Yesterday is untouched — it stays in history and nutrition under
       * its own key, reachable from the drawer.
       *
       * An unsaved session in progress is NOT discarded. If it has completed
       * sets it is saved to the day it was actually trained on first, because
       * losing a finished workout to a midnight tick would be the worst
       * possible failure here. Returns whether the day actually rolled.
       */
      rollDayIfNeeded: () => {
        const today = getLocalDateKey(new Date());
        const prev = get().activeDate;
        if (prev === today) return false;

        const live = get().live;
        const hasDone = live.exercises.some((ex) => ex.sets.some((s) => s.done));
        if (hasDone && !live.finished) {
          // saveWorkout writes to activeDate, which is still yesterday here —
          // exactly where this session belongs.
          get().saveWorkout();
        }

        set({ activeDate: today });
        get().ensureDay(today);
        set({
          live: {
            ...defaultLive(live.split),
            split: live.split,
          },
        });
        return true;
      },

      normalizeLive: () => {
        // activeDate is persisted, so after midnight the app would reopen on
        // yesterday and greet you with a read-only recap. Looking back is a
        // deliberate act via the drawer, not a state that should outlive the
        // day it was chosen on.
        const today = getLocalDateKey(new Date());
        if (get().activeDate !== today) set({ activeDate: today });

        const live = get().live;
        if (live.finished) return;

        const hasDone = live.exercises.some((ex) => ex.sets.some((s) => s.done));
        const STALE_MS = 12 * 3600_000;
        const anchor = live.firstSetAt ?? live.startTime;
        const stale = Date.now() - anchor > STALE_MS;

        if (!hasDone) {
          set({ live: { ...live, startTime: Date.now(), firstSetAt: null } });
          return;
        }
        if (stale || live.firstSetAt == null) {
          set({ live: { ...live, startTime: Date.now(), firstSetAt: Date.now() } });
        }
      },

      ensureSeed: () => {
        if (get().seeded) return;
        const hist = seedHistory();
        const nutrition = seedNutrition();
        const today = getLocalDateKey(new Date());
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(new Date(), {}, get().activeProgram());
        set({
          seeded: true,
          history: hist,
          nutrition,
          habits: seedHabits(),
          live: defaultLive(proj.split),
          activeDate: today,
        });
        if (!proj.isRest) get().loadSplit(proj.split);
      },
      /** Programmes live outside the persisted store, so they load explicitly. */
      hydratePrograms: () => {
        set({ programs: loadPrograms(), activeProgramId: loadActiveId() });
      },
      /**
       * Fold the imported custom foods in, without duplicating them.
       *
       * Separate from ensureSeed because that runs once and returns early
       * forever after, so an install that was already seeded would never see
       * foods added later. This runs every boot and matches on name, so it is
       * safe to call repeatedly and safe to extend the seed list over time.
       * Anything the user edited themselves wins — their version is kept.
       */
      mergeCustomFoods: () => {
        const have = new Set(
          [...BASE_FOOD_LIBRARY, ...get().customFoods].map((f) => f.name.trim().toLowerCase()),
        );
        const missing = (CUSTOM_FOOD_SEED as FoodItem[]).filter(
          (f) => !have.has(f.name.trim().toLowerCase()),
        );
        if (missing.length) set({ customFoods: [...get().customFoods, ...missing] });
      },
      /**
       * Wipe habit day-marks, once, on request.
       *
       * Early builds seeded 48 days of invented history, so installs from
       * before that fix carry a streak nobody earned — and now that the grid
       * lights by streak, that fiction reads as real momentum.
       *
       * Deliberately manual and deliberately not automatic: this destroys real
       * marks alongside the fake ones, and there is no way to tell them apart
       * after the fact. Returns how many were removed so the caller can say.
       */
      clearSeededHabitHistory: () => {
        const habits = get().habits;
        const removed = habits.reduce(
          (n, h) => n + Object.values(h.history || {}).filter(Boolean).length,
          0,
        );
        set({ habits: habits.map((h) => ({ ...h, history: {} })) });
        return removed;
      },
      /**
       * Push edited targets onto days that already exist.
       *
       * A day stores the goals it was created with, so editing a target would
       * otherwise change nothing visible until tomorrow — and today's rings
       * would keep measuring against a number the user had just replaced.
       * Only days with nothing logged yet, and today, are touched: rewriting
       * the target on a finished past day would silently rescore history.
       */
      applyGoalsToOpenDays: () => {
        const s = get().settings;
        const custom = s.customGoals;
        if (!custom || !Object.keys(custom).length) return 0;
        const today = getLocalDateKey(new Date());
        const nutrition = { ...get().nutrition };
        let touched = 0;
        for (const [k, day] of Object.entries(nutrition)) {
          if (!day) continue;
          if (k !== today && (day.items?.length ?? 0) > 0) continue;
          nutrition[k] = { ...day, goals: { ...day.goals, ...custom } };
          touched += 1;
        }
        set({ nutrition });
        return touched;
      },
      /**
       * Create or edit a food in the library, base foods included.
       *
       * BASE_FOOD_LIBRARY is a shipped constant and cannot be mutated, so
       * editing one writes a custom food under the SAME NAME instead. The
       * library is composed base-first with customs after and deduplicated by
       * name, so the edit simply wins — and a future correction to the shipped
       * figures still reaches anyone who never edited that food.
       */
      upsertLibraryFood: (food) => {
        const key = food.name.trim().toLowerCase();
        const rest = get().customFoods.filter((f) => f.name.trim().toLowerCase() !== key);
        set({ customFoods: [...rest, { ...food, isBase: false }] });
      },
      /** Whether a base food has been overridden, so the UI can say so. */
      isFoodEdited: (name) => {
        const key = name.trim().toLowerCase();
        const base = BASE_FOOD_LIBRARY.some((f) => f.name.trim().toLowerCase() === key);
        return base && get().customFoods.some((f) => f.name.trim().toLowerCase() === key);
      },
      /**
       * The programme every projection is read from, for use inside actions.
       *
       * Falls back to the shipped rotation rather than to nothing, so an
       * install that never opens this screen behaves exactly as before and no
       * call site has to handle "no programme selected".
       *
       * Components use useActiveProgram() instead. Calling a method from a
       * selector re-runs it on every store change, so the value it returns has
       * to be referentially stable or React never settles.
       */
      activeProgram: () =>
        resolveActiveProgram(get().programs, get().activeProgramId, BUILT_IN_PROGRAM),
      setPrograms: (programs) => {
        const wasActive = resolveActiveProgram(
          get().programs, get().activeProgramId, BUILT_IN_PROGRAM,
        );
        set({ programs });
        savePrograms(programs);
        // Editing the programme you are currently on has to move today with it.
        // The calendar recomputes from the programme on every render, so
        // without this the calendar would say Pull while Train still said Push.
        const nowActive = resolveActiveProgram(programs, get().activeProgramId, BUILT_IN_PROGRAM);
        if (
          nowActive.days.join("|") !== wasActive.days.join("|") ||
          nowActive.kind !== wasActive.kind ||
          nowActive.anchor !== wasActive.anchor
        ) {
          get().refreshScheduledDay();
        }
      },
      setActiveProgram: (id) => {
        set({ activeProgramId: id });
        saveActiveId(id);
        get().refreshScheduledDay();
      },
      /**
       * Re-derive today's split from the active programme.
       *
       * Only replaces the live session when nothing has been logged into it.
       * Rebuilding a session with completed sets in it would throw away work
       * the user has already done, which is never worth a label being right.
       */
      refreshScheduledDay: () => {
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(
          new Date(),
          get().settings.scheduleOverrides,
          get().activeProgram(),
        );
        const live = get().live;
        const untouched = !live.exercises.some((ex) => ex.sets.some((st) => st.done));
        if (untouched && !live.finished) {
          set({ live: defaultLive(proj.split) });
          if (!proj.isRest) get().loadSplit(proj.split);
        }
      },
      setTab: (tab) => set({ tab }),
      setActiveDate: (d) => set({ activeDate: d }),
      patchSettings: (p) => set({ settings: { ...get().settings, ...p } }),

      ensureDay: (key) => {
        const k = key || get().activeDate;
        const nutrition = { ...get().nutrition };
        if (!nutrition[k]) {
          const w = lastWeight(nutrition);
          const s = get().settings;
          const goals = { ...DEFAULT_GOALS };
          if (s.autoProteinTarget) goals.protein = SomaIntelligenceEngine.proteinTargetFor(w, s.proteinPerKg) || goals.protein;
          // Applied last so an explicit target always wins, including over the
          // bodyweight-derived protein figure.
          Object.assign(goals, s.customGoals ?? {});
          nutrition[k] = emptyDay(w);
          nutrition[k]!.goals = goals;
          set({ nutrition });
        }
      },
      patchDay: (key, patch) => {
        const nutrition = { ...get().nutrition };
        nutrition[key] = { ...(nutrition[key] || emptyDay()), ...patch };
        set({ nutrition });
      },
      addFood: (item) => {
        const k = get().activeDate;
        get().ensureDay(k);
        const day = get().nutrition[k]!;
        get().patchDay(k, { items: [...day.items, item] });
      },
      removeFood: (idx) => {
        const k = get().activeDate;
        const day = get().nutrition[k];
        if (!day) return;
        get().patchDay(k, { items: day.items.filter((_, i) => i !== idx) });
      },
      addWater: (ml) => {
        const k = get().activeDate;
        get().ensureDay(k);
        const day = get().nutrition[k]!;
        get().patchDay(k, { water: Math.max(0, (day.water || 0) + ml) });
      },
      setWater: (ml) => {
        const k = get().activeDate;
        get().ensureDay(k);
        get().patchDay(k, { water: Math.max(0, Math.round(ml)) });
      },
      updateFood: (idx, item) => {
        const k = get().activeDate;
        const items = [...(get().nutrition[k]?.items || [])];
        if (!items[idx]) return;
        items[idx] = item;
        get().patchDay(k, { items });
      },
      /**
       * Saves a food to the personal library so it can be logged again.
       * Stored per 100g, which is the basis the portion sheet scales from.
       * Returns false on a name that already exists rather than creating a
       * second entry you cannot tell apart in the picker.
       */
      addCustomFood: (food) => {
        const name = food.name.trim();
        if (!name) return false;
        const taken = [...BASE_FOOD_LIBRARY, ...get().customFoods].some(
          (f) => f.name.toLowerCase() === name.toLowerCase(),
        );
        if (taken) return false;
        set({ customFoods: [...get().customFoods, { ...food, name, serving: 100, unit: "g" }] });
        return true;
      },
      removeCustomFood: (name) => {
        set({ customFoods: get().customFoods.filter((f) => f.name !== name) });
      },
      addCreatine: (g) => {
        const k = get().activeDate;
        get().ensureDay(k);
        const day = get().nutrition[k]!;
        const s = get().settings;
        get().patchDay(k, { creatine: (day.creatine || 0) + g });
        get().patchSettings({ creatineStashGrams: Math.max(0, s.creatineStashGrams - g) });
      },
      resetCreatine: () => {
        const k = get().activeDate;
        const day = get().nutrition[k];
        if (!day) return;
        const cur = day.creatine || 0;
        get().patchDay(k, { creatine: 0 });
        get().patchSettings({ creatineStashGrams: get().settings.creatineStashGrams + cur });
      },
      logSleep: (hours, quality) => {
        const k = get().activeDate;
        get().ensureDay(k);
        get().patchDay(k, { sleep: { hours, quality } });
      },
      logWeight: (kg) => {
        const k = get().activeDate;
        get().ensureDay(k);
        get().patchDay(k, { bodyWeight: kg });
      },
      logMeasurements: (m) => {
        const k = get().activeDate;
        get().ensureDay(k);
        get().patchDay(k, { measurements: m });
      },
      logReadiness: (soreness, stress) => {
        const k = get().activeDate;
        get().ensureDay(k);
        get().patchDay(k, { readiness: { soreness, stress } });
      },
      toggleHabit: (id, date) => {
        const key = date || get().activeDate;
        set({
          habits: get().habits.map((h) =>
            h.id === id ? { ...h, history: { ...h.history, [key]: !h.history[key] } } : h,
          ),
        });
      },
      addHabit: (h) => {
        set({
          habits: [
            ...get().habits,
            { ...h, id: `habit-${Date.now()}`, history: {} },
          ],
        });
      },
      removeHabit: (id) => set({ habits: get().habits.filter((h) => h.id !== id) }),

      allExercises: () => [...(BASE_EXERCISE_DB as ExerciseDef[]), ...get().customExercises],
      routines: () =>
        SomaIntelligenceEngine.mergeRoutines(ROUTINE_PRESETS, {
          ...get().settings.customRoutines,
          _removed: get().settings.customRoutinesRemoved,
        }) as Record<string, { name: string }[]>,

      lastPerformance: (name) => {
        let latest = 0;
        let top: WorkoutSet | null = null;
        for (const session of Object.values(get().history)) {
          if (!session?.exercises || (session.timestamp || 0) < latest) continue;
          const match = session.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
          if (!match) continue;
          const completed = match.sets.filter((s) => s.type !== "warmup" && s.done);
          if (!completed.length) continue;
          latest = session.timestamp;
          top = completed.reduce((max, s) =>
            (Number(s.weight) || 0) > (Number(max.weight) || 0) ? s : max,
          );
        }
        return top;
      },

      loadSplit: (name) => {
        get().snapshot();
        const list = get().routines()[name] || [];
        const db = get().allExercises();
        const exercises = list.map((item) => makeSessionEx(item.name, db, get()));
        set({
          live: {
            ...get().live,
            split: name,
            exercises,
            finished: null,
            startTime: Date.now(),
            firstSetAt: null,
          },
        });
      },
      addExercise: (name) => {
        get().snapshot();
        const ex = makeSessionEx(name, get().allExercises(), get());
        set({ live: { ...get().live, exercises: [...get().live.exercises, ex], finished: null } });
      },
      addCustomExercise: (ex) => {
        set({ customExercises: [...get().customExercises, ex] });
        get().addExercise(ex.name);
      },
      updateSet: (exIdx, setIdx, patch) => {
        const exercises = get().live.exercises.map((ex, i) => {
          if (i !== exIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, ...patch } : s)),
          };
        });
        // The clock starts when work starts, not when the screen opened.
        const live = get().live;
        const firstSetAt =
          live.firstSetAt ?? (patch.done === true ? Date.now() : null);
        set({ live: { ...live, exercises, firstSetAt } });
      },
      // Exercise-level fields such as pump, which belong to the whole
      // movement rather than to any one set.
      updateExercise: (exIdx, patch) => {
        const live = get().live;
        set({
          live: {
            ...live,
            exercises: live.exercises.map((ex, i) => (i === exIdx ? { ...ex, ...patch } : ex)),
          },
        });
      },
      addSet: (exIdx, type = "normal") => {
        get().snapshot();
        const exercises = get().live.exercises.map((ex, i) => {
          if (i !== exIdx) return ex;
          const last = ex.sets[ex.sets.length - 1];
          const weight =
            type === "dropset" && last && Number(last.weight) > 0
              ? Math.round(Number(last.weight) * 0.8 * 2) / 2
              : last?.weight ?? "";
          return {
            ...ex,
            sets: [
              ...ex.sets,
              {
                weight,
                reps: type === "dropset" ? 8 : last?.reps ?? 8,
                failure: type === "dropset" ? 4 : 2,
                done: false,
                type,
              },
            ],
          };
        });
        set({ live: { ...get().live, exercises } });
      },
      removeSet: (exIdx, setIdx) => {
        get().snapshot();
        const exercises = get().live.exercises.map((ex, i) =>
          i === exIdx ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) } : ex,
        );
        set({ live: { ...get().live, exercises } });
      },
      removeExercise: (exIdx) => {
        get().snapshot();
        set({
          live: { ...get().live, exercises: get().live.exercises.filter((_, i) => i !== exIdx) },
        });
      },
      cycleSetType: (exIdx, setIdx) => {
        get().snapshot();
        const cycle: Record<string, WorkoutSet["type"]> = {
          normal: "dropset",
          dropset: "warmup",
          warmup: "normal",
        };
        const exercises = get().live.exercises.map((ex, i) => {
          if (i !== exIdx) return ex;
          return {
            ...ex,
            sets: ex.sets.map((s, j) =>
              j === setIdx ? { ...s, type: cycle[s.type] || "dropset" } : s,
            ),
          };
        });
        set({ live: { ...get().live, exercises } });
      },
      cycleSuperset: (exIdx) => {
        get().snapshot();
        const exercises = get().live.exercises.map((ex, i) => {
          if (i !== exIdx) return ex;
          const idx = SUPERSETS.indexOf(ex.supersetGroup || "");
          return { ...ex, supersetGroup: SUPERSETS[(idx + 1) % SUPERSETS.length]! };
        });
        set({ live: { ...get().live, exercises } });
      },
      swapExercise: (exIdx, name) => {
        get().snapshot();
        const next = makeSessionEx(name, get().allExercises(), get());
        const exercises = get().live.exercises.map((ex, i) => (i === exIdx ? next : ex));
        set({ live: { ...get().live, exercises } });
      },
      snapshot: () => {
        const live = get().live;
        const undoStack = [...live.undoStack, JSON.stringify(live.exercises)].slice(-25);
        set({ live: { ...live, undoStack, redoStack: [] } });
      },
      undo: () => {
        const live = get().live;
        if (!live.undoStack.length) return;
        const redoStack = [...live.redoStack, JSON.stringify(live.exercises)];
        const undoStack = [...live.undoStack];
        const prev = undoStack.pop()!;
        set({ live: { ...live, exercises: JSON.parse(prev), undoStack, redoStack } });
      },
      redo: () => {
        const live = get().live;
        if (!live.redoStack.length) return;
        const undoStack = [...live.undoStack, JSON.stringify(live.exercises)];
        const redoStack = [...live.redoStack];
        const next = redoStack.pop()!;
        set({ live: { ...live, exercises: JSON.parse(next), undoStack, redoStack } });
      },
      startRest: (seconds) => {
        set({
          live: {
            ...get().live,
            restEndsAt: Date.now() + seconds * 1000,
            restTotal: seconds,
          },
        });
      },
      clearRest: () => set({ live: { ...get().live, restEndsAt: null } }),

      saveWorkout: () => {
        const live = get().live;
        const settings = get().settings;
        let totalVol = 0;
        let totalSets = 0;
        let sumIntensity = 0;
        let axialVolume = 0;
        // Split by where the stimulus actually landed: a set the triceps ended
        // is not full chest work, and counting it as such both overstates the
        // chest and hides the triceps as the ceiling on the lift.
        const muscles: HistorySession["muscles"] = tallyMuscles(live.exercises);
        for (const ex of live.exercises) {
          for (const s of ex.sets) {
            if (!s.done || s.type === "warmup") continue;
            totalSets++;
            const w = Number(s.weight) || 0;
            const r = Number(s.reps) || 0;
            const vol = SomaIntelligenceEngine.calculateWorkVolume(w, r, ex.isBW);
            totalVol += vol;
            if (ex.isAxial) axialVolume += vol;
            sumIntensity += s.failure || 3;
          }
        }

        const clockFrom = live.firstSetAt ?? live.startTime;
        const elapsedMinutes = Math.max(1, Math.round((Date.now() - clockFrom) / 60000));
        const avgIntensity = totalSets ? sumIntensity / totalSets : 3;
        const caloriesBurned = SomaIntelligenceEngine.calculateCaloriesBurned(
          elapsedMinutes,
          totalVol,
          totalSets,
          avgIntensity,
        );
        const mins = Math.floor(elapsedMinutes);
        const secs = Math.round(((Date.now() - clockFrom) / 1000) % 60);
        const session: HistorySession = {
          timestamp: Date.now(),
          split: live.split,
          durationFormatted: `${mins}:${String(secs).padStart(2, "0")}`,
          caloriesBurned,
          totalVol,
          totalSets,
          axialVol: axialVolume,
          exercises: live.exercises,
          muscles,
        };
        if (totalSets === 0) return null;
        // File the session under the day it was PERFORMED, never under the date
        // being browsed. activeDate is a view cursor: filing by it meant a
        // glance at yesterday saved today's workout onto yesterday, destroying
        // that day's record and leaving today empty.
        //
        // The day work started, not the day it ended, so a session running past
        // midnight stays on the day it belongs to.
        // A backfilled session names its own day; otherwise the day work
        // started, which keeps a session running past midnight on the day it
        // belongs to.
        const startedAt = live.firstSetAt ?? live.startTime ?? Date.now();
        const key = live.forDate ?? getLocalDateKey(new Date(startedAt));
        set({
          history: { ...get().history, [key]: session },
          live: { ...live, finished: session, restEndsAt: null },
        });
        void settings;
        return session;
      },
      /**
       * Begin logging a day that was missed.
       *
       * Refuses while a session with completed sets is open: silently swapping
       * the live session out would destroy work in progress, and losing a
       * workout to a mis-tap is exactly the failure this app has already had
       * once.
       */
      startBackfill: (date, split) => {
        const live = get().live;
        const hasWork = live.exercises.some((ex) => ex.sets.some((s) => s.done));
        if (hasWork && !live.finished) return;
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(
          new Date(date + "T12:00:00"),
          get().settings.scheduleOverrides,
          get().activeProgram(),
        );
        set({
          live: { ...defaultLive(split ?? proj.split), forDate: date },
          activeDate: date,
        });
        // Load that day's programmed exercises so backfilling is filling in
        // numbers, not rebuilding the whole session from an empty list.
        if (!proj.isRest) {
          get().loadSplit(split ?? proj.split);
          set({ live: { ...get().live, forDate: date } });
        }
      },
      resetLive: () => {
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(
          new Date(),
          get().settings.scheduleOverrides,
          get().activeProgram(),
        );
        set({ live: defaultLive(proj.split) });
      },
      resumeFinished: () => set({ live: { ...get().live, finished: null } }),

      saveRoutine: (name, list, original) => {
        const merged = get().routines();
        const check = SomaIntelligenceEngine.validateRoutineName(name, merged, original ?? null);
        if (!check.ok) return check.error as string;
        const custom = { ...get().settings.customRoutines };
        const removed = [...get().settings.customRoutinesRemoved];
        if (original && original !== check.name) delete custom[original];
        custom[check.name] = SomaIntelligenceEngine.normalizeRoutine(list);
        const idx = removed.indexOf(check.name);
        if (idx >= 0) removed.splice(idx, 1);
        get().patchSettings({ customRoutines: custom, customRoutinesRemoved: removed });
        return null;
      },
      deleteRoutine: (name) => {
        const custom = { ...get().settings.customRoutines };
        delete custom[name];
        const removed = Array.from(new Set([...get().settings.customRoutinesRemoved, name]));
        get().patchSettings({ customRoutines: custom, customRoutinesRemoved: removed });
      },
      exportJson: () =>
        JSON.stringify(
          {
            settings: get().settings,
            history: get().history,
            nutrition: get().nutrition,
            habits: get().habits,
            customExercises: get().customExercises,
            customFoods: get().customFoods,
          },
          null,
          2,
        ),
      /**
       * Fold a backup into what is already here.
       *
       * MERGE is the default, and deliberately so. A restore used to replace
       * every collection outright, so importing a backup taken before today
       * silently destroyed today — the user reached for a backup to recover
       * data and lost more of it. Restoring should only ever be able to ADD.
       *
       * On a conflict the device wins: it holds the newer edit by definition,
       * since the backup is a snapshot of an older moment. The backup fills
       * only what is missing. Habit day-marks are the exception and union
       * together — a day ticked in either place really was done.
       *
       * "replace" remains available for a genuine restore onto a wiped device,
       * where there is nothing to protect.
       */
      importJson: (raw, mode = "merge") => {
        try {
          const data = JSON.parse(raw);
          if (!data || typeof data !== "object") return false;

          if (mode === "replace") {
            set({
              settings: { ...defaultSettings(), ...(data.settings || {}) },
              history: data.history || {},
              nutrition: data.nutrition || {},
              habits: data.habits || seedHabits(),
              customExercises: data.customExercises || [],
              customFoods: data.customFoods || [],
              seeded: true,
            });
            return true;
          }

          const cur = get();

          // Incoming days fill gaps; a day already on the device is kept.
          const history = { ...(data.history || {}), ...cur.history };
          const nutrition = { ...(data.nutrition || {}), ...cur.nutrition };

          // Habits merge by id, and their day-marks union: a day ticked in
          // either copy was genuinely done, and dropping it would erase a
          // streak the user actually earned.
          const byId = new Map<string, Habit>();
          for (const h of (data.habits || []) as Habit[]) byId.set(h.id, h);
          for (const h of cur.habits) {
            const prior = byId.get(h.id);
            byId.set(h.id, prior ? { ...prior, ...h, history: { ...prior.history, ...h.history } } : h);
          }

          const mergeByName = <T extends { name: string }>(incoming: T[], mine: T[]): T[] => {
            const out = new Map<string, T>();
            for (const x of incoming || []) out.set(x.name.trim().toLowerCase(), x);
            for (const x of mine) out.set(x.name.trim().toLowerCase(), x); // mine wins
            return [...out.values()];
          };

          set({
            settings: { ...defaultSettings(), ...(data.settings || {}), ...cur.settings },
            history,
            nutrition,
            habits: [...byId.values()],
            customExercises: mergeByName(data.customExercises || [], cur.customExercises),
            customFoods: mergeByName(data.customFoods || [], cur.customFoods),
            seeded: true,
          });
          return true;
        } catch {
          return false;
        }
      },
      resetAll: () => {
        set({
          seeded: false,
          settings: defaultSettings(),
          history: {},
          nutrition: {},
          habits: [],
          customExercises: [],
          customFoods: [],
          live: defaultLive("Legs A (Quad / Squat Dominant)"),
        });
        get().ensureSeed();
      },
    }),
    {
      name: "soma-smart-coach-v1",
      skipHydration: true,
      partialize: (s) => ({
        seeded: s.seeded,
        settings: s.settings,
        history: s.history,
        nutrition: s.nutrition,
        habits: s.habits,
        customExercises: s.customExercises,
        customFoods: s.customFoods,
        live: s.live,
        activeDate: s.activeDate,
      }),
    },
  ),
);

function makeSessionEx(name: string, db: ExerciseDef[], store: SomaStore): SessionExercise {
  const data = db.find((e) => e.name === name) || {
    name,
    muscle: "Custom",
    subTarget: "",
    targetKeys: [] as string[],
    position: "",
    risk: "Low",
    tier: "Custom",
    isAxial: false,
    isBW: false,
  };
  const last = store.lastPerformance(name);
  const target = SomaIntelligenceEngine.computeOverloadRecommendation(last, data.isBW);
  const w = target.weight > 0 ? target.weight : data.isBW ? 0 : "";
  return {
    name: data.name,
    muscle: data.muscle,
    subTarget: data.subTarget,
    targetKeys: data.targetKeys || [],
    position: data.position,
    risk: data.risk,
    tier: data.tier,
    isAxial: !!data.isAxial,
    isBW: !!data.isBW,
    usesBar: exerciseUsesBar(data.name),
    barWeight: store.settings.barWeight,
    supersetGroup: "",
    sets: [
      { weight: w, reps: target.reps, failure: 2, done: false, type: "normal" },
      { weight: w, reps: target.reps, failure: 2, done: false, type: "normal" },
      { weight: w, reps: Math.max(6, target.reps - 1), failure: 3, done: false, type: "normal" },
    ],
  };
}

/**
 * The active programme, for components.
 *
 * Subscribes to the two fields it actually depends on and resolves them
 * outside the selector. Both branches return an object that already existed —
 * the shipped programme built once at module scope, or an element of the
 * stored array — so the value only changes when the programme really does.
 */
export function useActiveProgram(): Program {
  const programs = useSoma((s) => s.programs);
  const activeId = useSoma((s) => s.activeProgramId);
  return resolveActiveProgram(programs, activeId, BUILT_IN_PROGRAM);
}
