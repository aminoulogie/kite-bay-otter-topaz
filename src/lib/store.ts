import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  BASE_EXERCISE_DB,
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
  LedgerEntry,
  MindEntry,
  TabId,
  WorkoutSet,
} from "./types";
import CUSTOM_FOOD_SEED from "./custom-foods-seed.json";
import {
  defaultProgram, loadActiveId, loadPrograms, resolveActiveProgram, saveActiveId,
  savePrograms, type Program,
} from "./programs";
import { collectSideStores, restoreSideStores, type SideStores } from "./side-stores";
import { defaultLive, defaultSettings, seedHabits, seedHistory, seedNutrition } from "./seed";
import { tallyMuscles } from "./set-quality";
import { SHIPPED_FOODS, composeLibrary } from "./foods";
import { exerciseKey } from "./exercise-key";
import type { LoggedSet, LogOverrides } from "./training-log";
import { guessMuscles } from "./muscle-guess";
import { resolveSplitName } from "./split-match";
import { HOME_TAB } from "./tab-order";

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
  purgeNutritionBefore: (cutoff: string) => number;
  upsertLibraryFood: (food: FoodItem) => void;
  foodLibrary: () => FoodItem[];
  findFoodByBarcode: (code: string) => FoodItem | null;
  rememberScannedFood: (food: FoodItem) => void;
  importFoods: (foods: FoodItem[]) => { added: number; updated: number };
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
  restoreFood: (idx: number, item: FoodItem, date?: string) => void;
  addWater: (ml: number) => void;
  setWater: (ml: number) => void;
  updateFood: (idx: number, item: FoodItem) => void;
  moveFoodToMeal: (idx: number, meal: string) => void;
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
  setLiveDate: (date: string) => void;
  resumeFinished: () => void;
  moveSession: (from: string, to: string) => string | null;
  deleteSession: (date: string) => void;
  renameSession: (date: string, split: string) => void;
  patchHistorySet: (date: string, exIdx: number, setIdx: number, patch: Partial<WorkoutSet>) => void;
  removeHistorySet: (date: string, exIdx: number, setIdx: number) => void;
  removeHistoryExercise: (date: string, exIdx: number) => void;
  logOverrides: LogOverrides;
  setImportedDay: (exerciseName: string, date: string, sets: LoggedSet[] | null) => void;
  clearImportedOverride: (exerciseName: string, date: string) => void;
  routineFromSession: (date: string, name: string) => string | null;
  repeatSession: (date: string) => boolean;
  saveRoutine: (name: string, list: { name: string }[], original?: string) => string | null;
  deleteRoutine: (name: string) => void;
  /** Money and mind, both dated logs, both persisted with everything else. */
  ledger: LedgerEntry[];
  mind: MindEntry[];
  addLedger: (e: Omit<LedgerEntry, "id">) => void;
  updateLedger: (id: string, patch: Partial<LedgerEntry>) => void;
  removeLedger: (id: string) => void;
  restoreLedger: (index: number, entry: LedgerEntry) => void;
  addMind: (e: Omit<MindEntry, "id">) => void;
  updateMind: (id: string, patch: Partial<MindEntry>) => void;
  removeMind: (id: string) => void;
  restoreMind: (index: number, entry: MindEntry) => void;
  exportJson: () => string;
  importJson: (raw: string, mode?: "merge" | "replace") => boolean;
  applySideStores: (incoming: unknown, mode: "merge" | "replace") => void;
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

/** A short unique id; crypto.randomUUID is not in every WebView this runs in. */
function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Fold two id-keyed lists together, with `mine` winning a collision. */
function mergeById<T extends { id: string }>(incoming: T[], mine: T[]): T[] {
  const out = new Map<string, T>();
  for (const x of incoming) out.set(x.id, x);
  for (const x of mine) out.set(x.id, x);
  return [...out.values()];
}

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
      logOverrides: {},
      ledger: [],
      mind: [],
      programs: [],
      activeProgramId: null,
      live: defaultLive("Legs A (Quad / Squat Dominant)"),
      activeDate: getLocalDateKey(new Date()),
      // Opens on the dashboard: the middle of TAB_ORDER, so either side is
      // one swipe away and neither is privileged by being where the app starts.
      tab: HOME_TAB,

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
        set({ live: defaultLive(live.split, today) });
        // The new day has its own programmed split; carrying yesterday's label
        // over was only ever a placeholder.
        get().refreshScheduledDay();
        return true;
      },

      normalizeLive: () => {
        // activeDate is persisted, so after midnight the app would reopen on
        // yesterday and greet you with a read-only recap. Looking back is a
        // deliberate act via the drawer, not a state that should outlive the
        // day it was chosen on.
        const today = getLocalDateKey(new Date());
        if (get().activeDate !== today) set({ activeDate: today });

        let live = get().live;

        /**
         * A sheet from another day is not today's sheet.
         *
         * `live` is persisted, so yesterday's finished session came back this
         * morning as the Train screen: a read-only summary of yesterday's
         * workout, with the split, the sets and the RPE buttons all belonging
         * to a day that was already saved. Nothing could be rated because
         * nothing on screen was today's, and the only way out was to add an
         * exercise by hand — which clears `finished` as a side effect and made
         * the bug look like "it only works if I add one myself".
         *
         * Nothing is lost by replacing it: a finished session is already in
         * history under its own date, and an unfinished one with work in it is
         * saved by rollDayIfNeeded before this ever runs. A day being
         * backfilled names its own date and is left alone.
         */
        const belongsTo = live.forDate ?? live.date;
        if (belongsTo !== today) {
          const hasWork = live.exercises.some((ex) => ex.sets.some((st) => st.done));
          if (!live.forDate && (live.finished || !hasWork)) {
            live = defaultLive(live.split, today);
            set({ live });
          }
        }

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
        const have = new Set(get().foodLibrary().map((f) => f.name.trim().toLowerCase()));
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
      /**
       * The whole library: shipped foods first, the user's own after, so an
       * edited food replaces the one it overrides instead of appearing twice.
       */
      foodLibrary: () => composeLibrary(get().customFoods),
      /**
       * A food already known by this barcode.
       *
       * Checked before the network, which is what makes a second scan instant
       * and — more importantly — makes it work at all in a shop with no signal.
       */
      findFoodByBarcode: (code) => {
        const wanted = String(code ?? "").replace(/\D/g, "");
        if (!wanted) return null;
        return get().foodLibrary().find((f) => f.barcode === wanted) ?? null;
      },
      /**
       * Keep a scanned product.
       *
       * Every scan used to be thrown away after logging the portion, so the
       * same yoghurt cost a network round trip every single morning and was
       * unfindable by name. Saving it builds a real branded library out of what
       * is actually in your kitchen — with the barcode the scanner read, which
       * is the only barcode worth storing.
       *
       * An existing entry for that code is updated rather than duplicated, but
       * a name the user has since corrected is kept: their edit is newer than
       * whatever the database says.
       */
      rememberScannedFood: (food) => {
        const code = String(food.barcode ?? "").replace(/\D/g, "");
        if (!code) return;
        const customs = get().customFoods;
        const existing = customs.find((f) => f.barcode === code);
        if (existing) {
          set({
            customFoods: customs.map((f) =>
              f.barcode === code ? { ...food, name: existing.name, barcode: code } : f,
            ),
          });
          return;
        }
        // Never shadow a shipped food by name; the scan is the newer, more
        // specific record, so it takes a name that says so.
        const taken = new Set(get().foodLibrary().map((f) => f.name.trim().toLowerCase()));
        let name = food.name.trim() || `Item ${code}`;
        if (taken.has(name.toLowerCase())) name = `${name} (${code.slice(-4)})`;
        set({
          customFoods: [...customs, { ...food, name, barcode: code, serving: 100, meal: "" }],
        });
      },
      /**
       * Load a sheet of foods in one go.
       *
       * Matched on barcode first and name second: a re-import of an updated
       * sheet should correct the rows it already has rather than doubling the
       * library. Returns both counts so the result can be stated honestly
       * instead of claiming everything was new.
       */
      importFoods: (foods) => {
        const customs = [...get().customFoods];
        const byCode = new Map<string, number>();
        const byName = new Map<string, number>();
        customs.forEach((f, i) => {
          if (f.barcode) byCode.set(f.barcode, i);
          byName.set(f.name.trim().toLowerCase(), i);
        });

        let added = 0;
        let updated = 0;

        for (const food of foods) {
          const name = food.name.trim();
          if (!name) continue;
          const at =
            (food.barcode ? byCode.get(food.barcode) : undefined) ??
            byName.get(name.toLowerCase());
          if (at != null) {
            customs[at] = { ...customs[at]!, ...food, name: customs[at]!.name };
            updated += 1;
            continue;
          }
          customs.push(food);
          const i = customs.length - 1;
          if (food.barcode) byCode.set(food.barcode, i);
          byName.set(name.toLowerCase(), i);
          added += 1;
        }

        set({ customFoods: customs });
        return { added, updated };
      },
      /** Whether a base food has been overridden, so the UI can say so. */
      isFoodEdited: (name) => {
        const key = name.trim().toLowerCase();
        const base = SHIPPED_FOODS.some((f) => f.name.trim().toLowerCase() === key);
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
      /**
       * Drop every nutrition day before a cutoff, once.
       *
       * Asked for directly: the diary was full of demo days generated six weeks
       * back from whenever the app was first opened, and a log that invents
       * meals is worse than an empty one. Destructive by design and therefore
       * recorded — `nutritionPurgedBefore` holds the cutoff already applied, so
       * this runs once rather than on every boot, and re-running it with the
       * same cutoff is a no-op. Returns how many days went.
       */
      purgeNutritionBefore: (cutoff) => {
        const nutrition = { ...get().nutrition };
        let removed = 0;
        for (const key of Object.keys(nutrition)) {
          if (key >= cutoff) continue;
          delete nutrition[key];
          removed += 1;
        }
        if (removed) set({ nutrition });
        get().patchSettings({ nutritionPurgedBefore: cutoff });
        return removed;
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
      /**
       * Put a deleted food back where it was.
       *
       * Undo re-adding it would append to the end, so undoing a swipe would
       * silently reorder the meal — the food comes back, but not where it was,
       * and the user is left wondering whether anything else moved. Splicing at
       * the original index makes undo mean undo.
       *
       * The day is pinned as well as the index: a delete on Sunday undone after
       * the diary has moved to Monday must not push Sunday's food into Monday.
       */
      restoreFood: (idx, item, date) => {
        const k = date ?? get().activeDate;
        get().ensureDay(k);
        const items = [...(get().nutrition[k]?.items ?? [])];
        items.splice(Math.max(0, Math.min(idx, items.length)), 0, item);
        get().patchDay(k, { items });
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
      /**
       * File a logged item under a different meal.
       *
       * The meal is a property of the entry, so this is a one-field edit —
       * but reaching it meant opening the portion sheet, tapping the meal and
       * saving, for something that is really a drag from one section to
       * another. Nothing else about the entry moves with it.
       */
      moveFoodToMeal: (idx, meal) => {
        const k = get().activeDate;
        const items = [...(get().nutrition[k]?.items || [])];
        const item = items[idx];
        if (!item || item.meal === meal) return;
        items[idx] = { ...item, meal };
        get().patchDay(k, { items });
      },
      addCustomFood: (food) => {
        const name = food.name.trim();
        if (!name) return false;
        const taken = get()
          .foodLibrary()
          .some((f) => f.name.toLowerCase() === name.toLowerCase());
        if (taken) return false;
        set({
          customFoods: [
            ...get().customFoods,
            // Stored per 100 of whatever it is measured in. The unit is kept
            // rather than forced to grams, so a drink stays a drink and its
            // portions are offered in millilitres.
            { ...food, name, serving: 100, unit: food.unit === "ml" ? "ml" : "g" },
          ],
        });
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

      /**
       * Fill the sheet with a routine's exercises.
       *
       * The name is resolved rather than looked up: a programme day is a label
       * ("Push"), a routine is a full title ("Push B (Hypertrophy & Long Muscle
       * Length)"), and an exact lookup between the two returned nothing — so
       * every programme built from a template opened Train on an empty session
       * with nothing to log and nothing to rate. See lib/split-match.ts.
       */
      loadSplit: (name) => {
        get().snapshot();
        const routines = get().routines();
        const resolved = resolveSplitName(name, Object.keys(routines)) ?? name;
        const list = routines[resolved] || [];
        const db = get().allExercises();
        const exercises = list.map((item) => makeSessionEx(item.name, db, get()));
        set({
          live: {
            ...get().live,
            // The label the user chose is kept, not the routine it resolved to:
            // the calendar and the programme both speak in labels, and swapping
            // one for the other mid-session would make them disagree.
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
      /**
       * File the session in progress under a different day.
       *
       * The clock decides the date by default, which is right for a workout
       * logged as it happens and wrong for one typed up afterwards — train in
       * the evening, log it after midnight, and it lands on the wrong day with
       * no way to say otherwise short of saving it and moving it again.
       *
       * Setting it to today clears the override rather than pinning it, so a
       * session that runs past midnight still files itself by when work
       * started.
       */
      setLiveDate: (date) => {
        const today = getLocalDateKey(new Date());
        set({
          live: { ...get().live, forDate: date === today ? undefined : date },
          activeDate: date,
        });
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

      /**
       * File a saved session under a different date.
       *
       * A session logged on the wrong day was previously unfixable: history is
       * keyed by date, and the only way to correct it was to delete the day and
       * re-enter every set. Refuses to overwrite a day that already holds a
       * session — silently replacing one workout with another is not a
       * correction, it is a second mistake — and returns the reason so the
       * caller can say what happened.
       *
       * The timestamp moves with it, keeping the time of day, so anything that
       * orders by timestamp stays in step with the key.
       */
      moveSession: (from, to) => {
        if (from === to) return null;
        const history = { ...get().history };
        const session = history[from];
        if (!session) return "Nothing is logged on that day.";
        if (history[to]) return `${to} already has a session logged.`;
        const at = new Date(session.timestamp || Date.now());
        const [y, m, d] = to.split("-").map(Number);
        const moved = new Date(y!, (m ?? 1) - 1, d ?? 1, at.getHours(), at.getMinutes(), at.getSeconds());
        delete history[from];
        history[to] = { ...session, timestamp: moved.getTime() };
        set({ history });
        // The live sheet may be showing the session that just moved.
        const live = get().live;
        if (live.finished && live.forDate === from) {
          set({ live: { ...live, forDate: to } });
        }
        return null;
      },
      /**
       * Rename what a saved session is called.
       *
       * The split is stamped from whatever the programme had scheduled that
       * day, which is right only when you train what was planned. Train
       * shoulders on a Legs day and the session is filed as "Legs B" forever,
       * with no way to correct it short of deleting the day and re-entering
       * every set.
       *
       * Only the label moves. The exercises, the sets and the muscle tally are
       * the record of what happened and are not touched.
       */
      renameSession: (date, split) => {
        const name = split.trim();
        const session = get().history[date];
        if (!session || !name || name === session.split) return;
        set({ history: { ...get().history, [date]: { ...session, split: name } } });
      },
      deleteSession: (date) => {
        const history = { ...get().history };
        if (!history[date]) return;
        delete history[date];
        set({ history });
      },
      /**
       * Correct one set inside a saved session.
       *
       * Everything downstream — volume, calories, the muscle tally, every chart
       * — is derived from the session's own totals, so the session is recomputed
       * rather than patched: editing a weight and leaving `totalVol` alone would
       * make the graphs disagree with the sets they were drawn from.
       */
      patchHistorySet: (date, exIdx, setIdx, patch) => {
        const session = get().history[date];
        if (!session) return;
        const exercises = session.exercises.map((ex, i) =>
          i !== exIdx
            ? ex
            : { ...ex, sets: ex.sets.map((st, j) => (j === setIdx ? { ...st, ...patch } : st)) },
        );
        set({ history: { ...get().history, [date]: recomputeSession(session, exercises) } });
      },
      removeHistorySet: (date, exIdx, setIdx) => {
        const session = get().history[date];
        if (!session) return;
        const exercises = session.exercises
          .map((ex, i) => (i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) }))
          // An exercise with no sets left is not a record of anything.
          .filter((ex) => ex.sets.length > 0);
        set({ history: { ...get().history, [date]: recomputeSession(session, exercises) } });
      },
      removeHistoryExercise: (date, exIdx) => {
        const session = get().history[date];
        if (!session) return;
        const exercises = session.exercises.filter((_, i) => i !== exIdx);
        if (!exercises.length) {
          get().deleteSession(date);
          return;
        }
        set({ history: { ...get().history, [date]: recomputeSession(session, exercises) } });
      },
      /**
       * Save a day that was actually trained as a reusable routine.
       *
       * Routines could only be built by hand, exercise by exercise, which is odd
       * given the app already holds the exact list you just trained. Returns an
       * error string on a name clash rather than silently overwriting a routine
       * you may still be following.
       */
      /**
       * Correct or delete a day of imported spreadsheet history.
       *
       * The seed is a shipped constant and cannot be written to, so the fix is
       * stored beside it and applied on top when the log is built. Passing null
       * deletes that day. Everything downstream — the Database, the charts, the
       * micro-muscle index — is derived from buildTrainingLog, so all of it
       * follows the correction with no extra wiring.
       */
      setImportedDay: (exerciseName, date, sets) => {
        const key = exerciseKey(exerciseName);
        const cur = get().logOverrides;
        set({
          logOverrides: { ...cur, [key]: { ...(cur[key] ?? {}), [date]: sets } },
        });
      },
      /** Drop a correction, restoring whatever the sheet originally said. */
      clearImportedOverride: (exerciseName, date) => {
        const key = exerciseKey(exerciseName);
        const cur = get().logOverrides;
        if (!cur[key] || !(date in cur[key]!)) return;
        const days = { ...cur[key] };
        delete days[date];
        const next = { ...cur };
        if (Object.keys(days).length) next[key] = days;
        else delete next[key];
        set({ logOverrides: next });
      },
      routineFromSession: (date, name) => {
        const session = get().history[date];
        if (!session) return "Nothing is logged on that day.";
        const list = session.exercises.map((ex) => ({ name: ex.name }));
        if (!list.length) return "That day has no exercises to save.";
        return get().saveRoutine(name, list);
      },
      /**
       * Load a past day's exercises into today's sheet.
       *
       * The weights come back empty rather than copied: they are re-derived by
       * makeSessionEx from what was actually lifted, which is what progressive
       * overload is for. Refuses while a session with completed sets is open,
       * for the same reason startBackfill does.
       */
      repeatSession: (date) => {
        const session = get().history[date];
        if (!session) return false;
        const live = get().live;
        const hasWork = live.exercises.some((ex) => ex.sets.some((st) => st.done));
        if (hasWork && !live.finished) return false;
        const db = get().allExercises();
        const today = getLocalDateKey(new Date());
        const exercises = session.exercises.map((ex) => makeSessionEx(ex.name, db, get()));
        set({
          live: { ...defaultLive(session.split, today), exercises },
          activeDate: today,
        });
        return true;
      },

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
      /**
       * A new id per entry rather than an index.
       *
       * Indices shift the moment anything above is deleted, and both of these
       * lists are edited from a filtered view — the month you are looking at,
       * not the whole ledger — so an index into the visible rows means nothing
       * to the store holding all of them.
       */
      addLedger: (e) =>
        set({ ledger: [...get().ledger, { ...e, id: newId() }] }),
      updateLedger: (id, patch) =>
        set({ ledger: get().ledger.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      removeLedger: (id) => set({ ledger: get().ledger.filter((x) => x.id !== id) }),
      restoreLedger: (index, entry) => {
        const next = [...get().ledger];
        next.splice(Math.max(0, Math.min(index, next.length)), 0, entry);
        set({ ledger: next });
      },

      addMind: (e) => set({ mind: [...get().mind, { ...e, id: newId() }] }),
      updateMind: (id, patch) =>
        set({ mind: get().mind.map((x) => (x.id === id ? { ...x, ...patch } : x)) }),
      removeMind: (id) => set({ mind: get().mind.filter((x) => x.id !== id) }),
      restoreMind: (index, entry) => {
        const next = [...get().mind];
        next.splice(Math.max(0, Math.min(index, next.length)), 0, entry);
        set({ mind: next });
      },
      /**
       * Everything, so a backup written from it loses nothing.
       *
       * The four side stores are read from localStorage rather than from this
       * store, because that is where they actually live — `programs` is
       * mirrored here but only after hydratePrograms has run, and a backup
       * taken before it did would have exported an empty list.
       *
       * `live` and `activeDate` ride along too. An unfinished session is not
       * something a merge should ever bring back, and it will not: the merge
       * below keeps the device's. But a replace onto a wiped phone should
       * return the workout that was open when the last backup was taken,
       * rather than dropping the user into an empty one.
       */
      exportJson: () =>
        JSON.stringify(
          {
            settings: get().settings,
            history: get().history,
            nutrition: get().nutrition,
            habits: get().habits,
            customExercises: get().customExercises,
            customFoods: get().customFoods,
            logOverrides: get().logOverrides,
            ledger: get().ledger,
            mind: get().mind,
            live: get().live,
            activeDate: get().activeDate,
            sideStores: collectSideStores(),
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
              logOverrides: data.logOverrides || {},
              ledger: data.ledger || [],
              mind: data.mind || [],
              seeded: true,
              // A backup from before these were exported has neither, and the
              // device keeps whatever it is on rather than being emptied.
              ...(data.live ? { live: data.live } : {}),
              ...(data.activeDate ? { activeDate: data.activeDate } : {}),
            });
            get().applySideStores(data.sideStores, "replace");
            // The restored session was open on the day the backup was taken,
            // which may be weeks ago. This is the repair that exists for it.
            get().normalizeLive();
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
            // Corrections merge per exercise, with the device's own winning —
            // the same rule the rest of the restore follows.
            logOverrides: (() => {
              const out: LogOverrides = { ...(data.logOverrides || {}) };
              for (const [k, days] of Object.entries(cur.logOverrides || {})) {
                out[k] = { ...(out[k] ?? {}), ...days };
              }
              return out;
            })(),
            // Merged by id, the device winning a conflict — the same rule the
            // rest of the restore follows.
            ledger: mergeById(data.ledger || [], cur.ledger),
            mind: mergeById(data.mind || [], cur.mind),
            seeded: true,
          });
          // `live` and `activeDate` are deliberately not merged: the device is
          // mid-workout by definition, and replacing that with a session from
          // an older snapshot would throw away sets being logged right now.
          get().applySideStores(data.sideStores, "merge");
          return true;
        } catch {
          return false;
        }
      },
      /**
       * Write a backup's side stores to disk and mirror the programmes here.
       *
       * Split out of importJson because programmes are the one side store the
       * zustand copy also holds: without the mirror, the calendar would keep
       * drawing the pre-restore rotation until the app was reopened.
       */
      applySideStores: (incoming, mode) => {
        const next = restoreSideStores(incoming as SideStores | undefined, mode);
        if (!next) return;
        set({ programs: next.programs ?? [], activeProgramId: next.activeProgramId ?? null });
        get().refreshScheduledDay();
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
          logOverrides: {},
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
        logOverrides: s.logOverrides,
        ledger: s.ledger,
        mind: s.mind,
        live: s.live,
        activeDate: s.activeDate,
      }),
    },
  ),
);

/**
 * Rebuild a saved session's totals from its exercises.
 *
 * Every statistic and every chart reads the stored totals rather than the sets,
 * so an edited set has to bring the totals with it — otherwise the Database tab
 * shows the corrected number while the graphs keep drawing the old one, which
 * is a worse state than not being able to edit at all.
 */
function recomputeSession(session: HistorySession, exercises: SessionExercise[]): HistorySession {
  let totalVol = 0;
  let totalSets = 0;
  let axialVol = 0;
  for (const ex of exercises) {
    for (const st of ex.sets) {
      if (!st.done || st.type === "warmup") continue;
      totalSets += 1;
      const vol = SomaIntelligenceEngine.calculateWorkVolume(
        Number(st.weight) || 0,
        Number(st.reps) || 0,
        ex.isBW,
      );
      totalVol += vol;
      if (ex.isAxial) axialVol += vol;
    }
  }
  return {
    ...session,
    exercises,
    totalVol,
    totalSets,
    axialVol,
    muscles: tallyMuscles(exercises),
  };
}

function makeSessionEx(name: string, db: ExerciseDef[], store: SomaStore): SessionExercise {
  const known = db.find((e) => e.name === name);
  // An exercise the database does not have still trains something. The stub
  // used to carry an empty targetKeys, which left the set-rating sheet with no
  // muscles to offer, recovery with nothing to charge the work to, and the body
  // map cold after a session that plainly happened.
  const guess = known ? null : guessMuscles(name);
  const data = known ?? {
    name,
    muscle: guess!.muscle,
    subTarget: guess!.subTarget,
    targetKeys: guess!.targetKeys,
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
