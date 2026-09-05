#!/usr/bin/env python3
"""Apply Grok store/UI patches on the CI machine before the iOS bundle is built."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    store = ROOT / "src/lib/store.ts"
    t = store.read_text()
    if "loadDemoData" not in t:
        t = t.replace(
            "  history: Record<string, HistorySession>;\n  nutrition: Record<string, NutritionDay>;",
            "  history: Record<string, HistorySession>;\n  sessionArchive: HistorySession[];\n  nutrition: Record<string, NutritionDay>;\n  loadDemoData: () => void;",
        )
        t = t.replace(
            "      history: {},\n      nutrition: {},",
            "      history: {},\n      sessionArchive: [],\n      nutrition: {},",
        )
        t = t.replace(
            """      ensureSeed: () => {
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
      },""",
            """      ensureSeed: () => {
        if (get().seeded) return;
        const today = getLocalDateKey(new Date());
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(new Date(), {}, get().activeProgram());
        set({
          seeded: true,
          history: {},
          sessionArchive: [],
          nutrition: {},
          habits: seedHabits(),
          live: defaultLive(proj.split),
          activeDate: today,
        });
        if (!proj.isRest) get().loadSplit(proj.split);
      },
      loadDemoData: () => {
        const today = getLocalDateKey(new Date());
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(new Date(), {}, get().activeProgram());
        set({
          seeded: true,
          history: seedHistory(),
          sessionArchive: [],
          nutrition: seedNutrition(),
          habits: seedHabits(),
          settings: { ...get().settings, demoSeeded: true },
          live: defaultLive(proj.split),
          activeDate: today,
        });
        if (!proj.isRest) get().loadSplit(proj.split);
      },""",
        )
        t = t.replace(
            "      patchSettings: (p) => set({ settings: { ...get().settings, ...p } }),",
            "      patchSettings: (p) => {\n        set({ settings: { ...get().settings, ...p } });\n        if (p.customGoals) get().applyGoalsToOpenDays();\n      },",
        )
        t = t.replace(
            "        get().patchDay(k, { creatine: (day.creatine || 0) + g });\n        get().patchSettings({ creatineStashGrams: Math.max(0, s.creatineStashGrams - g) });",
            "        const used = Math.min(Math.max(0, g), Math.max(0, s.creatineStashGrams));\n        if (used <= 0) return;\n        get().patchDay(k, { creatine: (day.creatine || 0) + used });\n        get().patchSettings({ creatineStashGrams: s.creatineStashGrams - used });",
        )
        t = t.replace(
            "        const session: HistorySession = {\n          timestamp: Date.now(),\n          split: live.split,",
            "        const session: HistorySession = {\n          timestamp: Date.now(),\n          date: live.forDate ?? getLocalDateKey(new Date()),\n          split: live.split,",
            1,
        )
        t = t.replace(
            """        const startedAt = live.firstSetAt ?? live.startTime ?? Date.now();
        const key = live.forDate ?? getLocalDateKey(new Date(startedAt));
        set({
          history: { ...get().history, [key]: session },
          live: { ...live, finished: session, restEndsAt: null },
        });""",
            """        const startedAt = live.firstSetAt ?? live.startTime ?? Date.now();
        const key = live.forDate ?? getLocalDateKey(new Date(startedAt));
        session.date = key;
        const prevSess = get().history[key];
        const archive = [...(get().sessionArchive || [])];
        if (prevSess && prevSess.timestamp !== session.timestamp) archive.push(prevSess);
        set({
          history: { ...get().history, [key]: session },
          sessionArchive: archive,
          live: { ...live, finished: session, restEndsAt: null },
        });""",
        )
        t = t.replace(
            "            history: get().history,\n            nutrition: get().nutrition,",
            "            history: get().history,\n            sessionArchive: get().sessionArchive,\n            nutrition: get().nutrition,",
        )
        t = t.replace(
            "              history: data.history || {},\n              nutrition: data.nutrition || {},",
            "              history: data.history || {},\n              sessionArchive: Array.isArray(data.sessionArchive) ? data.sessionArchive : [],\n              nutrition: data.nutrition || {},",
        )
        t = t.replace(
            "            history,\n            nutrition,\n            habits: [...byId.values()],",
            "            history,\n            sessionArchive: [...(Array.isArray(data.sessionArchive) ? data.sessionArchive : []), ...(cur.sessionArchive || [])],\n            nutrition,\n            habits: [...byId.values()],",
        )
        t = t.replace(
            "          history: {},\n          nutrition: {},\n          habits: [],\n          customExercises: [],\n          customFoods: [],\n          live: defaultLive(\"Legs A (Quad / Squat Dominant)\"),\n        });\n        get().ensureSeed();",
            "          history: {},\n          sessionArchive: [],\n          nutrition: {},\n          habits: [],\n          customExercises: [],\n          customFoods: [],\n          live: defaultLive(\"Legs A (Quad / Squat Dominant)\"),\n        });\n        get().loadDemoData();",
        )
        t = t.replace(
            "        history: s.history,\n        nutrition: s.nutrition,",
            "        history: s.history,\n        sessionArchive: s.sessionArchive,\n        nutrition: s.nutrition,",
        )
        t = t.replace(
            "  const target = SomaIntelligenceEngine.computeOverloadRecommendation(last, data.isBW);",
            "  const target = SomaIntelligenceEngine.computeOverloadRecommendation(\n    last,\n    data.isBW,\n    store.settings.unit,\n  );",
        )
        store.write_text(t)
        print("store patched")
    else:
        print("store already patched")

    graphs = ROOT / "src/components/views/GraphsView.tsx"
    g = graphs.read_text()
    if "useTrainingLog" not in g:
        g = g.replace(
            "  buildTrainingLog, dayBest, estimated1RM, groupsOf, type ExerciseLog, type LoggedSet,\n  formatSet,\n} from \"@/lib/training-log\";",
            "  dayBest, estimated1RM, groupsOf, type ExerciseLog, type LoggedSet,\n  formatSet,\n} from \"@/lib/training-log\";\nimport { useTrainingLog } from \"@/lib/use-training-log\";",
        )
        g = g.replace(
            """export function GraphsView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  // Bodyweight lifts need the body's own load, which lives in the nutrition log.
  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);
  const log = useMemo(() => buildTrainingLog(history, bodyweights), [history, bodyweights]);
""",
            "export function GraphsView() {\n  const log = useTrainingLog();\n",
        )
        g = g.replace(
            """export function MicroMuscleView() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const bodyweights = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [d, day] of Object.entries(nutrition || {})) {
      if (day?.bodyWeight) out[d] = day.bodyWeight;
    }
    return out;
  }, [nutrition]);
  const log = useMemo(() => buildTrainingLog(history, bodyweights), [history, bodyweights]);
""",
            "export function MicroMuscleView() {\n  const log = useTrainingLog();\n",
        )
        graphs.write_text(g)
        print("graphs patched")
    else:
        print("graphs already patched")


if __name__ == "__main__":
    main()
