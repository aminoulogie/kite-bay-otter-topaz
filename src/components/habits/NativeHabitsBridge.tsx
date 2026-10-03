import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { HabitPhotoCalendar } from "@/components/HabitPhotoCalendar";
import { HabitSetupSheet } from "@/components/HabitSetupSheet";
import { suggestAuto } from "@/lib/habit-auto";
import { nextHabitColor, pushRecentColor } from "@/lib/habit-colors";
import { captureImage, savePhoto } from "@/lib/habit-photos";
import { RAMP_PRESETS } from "@/lib/habit-ramp";
import { STEP_PRESETS, hasSteps, newStepId } from "@/lib/habit-steps";
import { chromeOpenHabits, chromeSetHabits, type HabitAction } from "@/lib/native/chrome";
import { habitsPayload } from "@/lib/native/habits-native";
import { getLocalDateKey, normalizeAccent } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { HabitRamp, HabitStep } from "@/lib/types";

const SHEET_EVENT = "soma-native-habit-sheet";

/** Do what the native Habits panel asked. */
export function runHabitAction(a: HabitAction): void {
  const st = useSoma.getState();
  const h = a.id ? st.habits.find((x) => x.id === a.id) : undefined;
  switch (a.op) {
    case "toggle":
      if (h) st.toggleHabit(h.id);
      break;
    case "tickDay":
      if (h && a.date) st.toggleHabit(h.id, a.date);
      break;
    case "step":
      if (h && a.stepId) st.bumpHabitStep(h.id, a.stepId);
      break;
    case "amount":
      if (h) st.logHabitAmount(h.id, a.value ?? null, st.activeDate);
      break;
    case "add": {
      const name = (a.name ?? "").trim();
      if (name) st.addHabit({ name, desc: "", color: nextHabitColor(st.habits), goalDaysPerWeek: 7 });
      break;
    }
    case "preset": {
      const sp = STEP_PRESETS.find((p) => p.name === a.name);
      if (sp) {
        st.addHabit({
          name: sp.name,
          desc: sp.desc,
          color: sp.color,
          goalDaysPerWeek: 7,
          steps: sp.steps.map((x) => ({ ...x, id: newStepId() })),
        });
        break;
      }
      const rp = RAMP_PRESETS.find((p) => p.name === a.name);
      if (rp) {
        st.addHabit({ name: rp.name, desc: rp.desc, color: rp.color, goalDaysPerWeek: 7, ramp: { ...rp.ramp, from: st.activeDate } });
      }
      break;
    }
    case "remove":
      if (h) {
        const idx = st.habits.findIndex((x) => x.id === h.id);
        st.removeHabit(h.id);
        toast.success(`${h.name} removed`, { action: { label: "Undo", onClick: () => useSoma.getState().restoreHabit(idx, h) } });
      }
      break;
    case "color":
      if (h && a.color) {
        st.setHabitColor(h.id, a.color);
        st.patchSettings({ colorRecent: pushRecentColor(st.settings.colorRecent, a.color) });
      }
      break;
    case "note":
      if (h && a.text) st.addHabitNote(h.id, a.text);
      break;
    case "unnote":
      if (h && a.noteId) st.removeHabitNote(h.id, a.noteId);
      break;
    case "autoOn":
      for (const x of st.habits) {
        if (x.auto) continue;
        const rule = suggestAuto(x.name);
        if (rule) st.setHabitAuto(x.id, rule);
      }
      toast.success("Done — they tick themselves from now on");
      break;
    case "setup":
    case "photos":
    case "photo":
      window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: { op: a.op, id: a.id } }));
      break;
  }
}

/**
 * Keeps the native panel's data current and its open state in step with the
 * store, and hosts the two sheets that are still web (Set up, Photos). The
 * native panel closes itself before asking for one; closing the sheet brings
 * the panel back.
 */
export function NativeHabitsBridge() {
  const habits = useSoma((s) => s.habits);
  const activeDate = useSoma((s) => s.activeDate);
  const accent = useSoma((s) => s.settings.accent);
  const open = useSoma((s) => s.habitsOpen);
  const setHabitsOpen = useSoma((s) => s.setHabitsOpen);
  const setHabitSteps = useSoma((s) => s.setHabitSteps);
  const setHabitRamp = useSoma((s) => s.setHabitRamp);
  const setHabitSeconds = useSoma((s) => s.setHabitSeconds);
  const setHabitCoef = useSoma((s) => s.setHabitCoef);
  const setHabitAuto = useSoma((s) => s.setHabitAuto);
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const [sheet, setSheet] = useState<{ op: "setup" | "photos"; id: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      void habitsPayload(habits, activeDate, getLocalDateKey(), normalizeAccent(accent)).then((json) => {
        if (alive) chromeSetHabits(json);
      });
    }, 60);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [habits, activeDate, accent]);

  useEffect(() => {
    chromeOpenHabits(open);
  }, [open]);

  useEffect(() => {
    const onSheet = (e: Event) => {
      const { op, id } = (e as CustomEvent<{ op: string; id?: string }>).detail;
      if (!id) return;
      if (op === "photo") {
        void (async () => {
          const file = await captureImage();
          const st = useSoma.getState();
          const h = st.habits.find((x) => x.id === id);
          if (!file || !h) {
            setHabitsOpen(true);
            return;
          }
          try {
            await savePhoto(h.id, st.activeDate, file);
            if (!hasSteps(h) && !h.history[st.activeDate]) toggleHabit(h.id, st.activeDate);
            toast.success("Captured " + h.name);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save that photo.");
          }
          setHabitsOpen(true);
        })();
        return;
      }
      if (op === "setup" || op === "photos") setSheet({ op, id });
    };
    window.addEventListener(SHEET_EVENT, onSheet);
    return () => window.removeEventListener(SHEET_EVENT, onSheet);
  }, [setHabitsOpen, toggleHabit]);

  const h = sheet ? habits.find((x) => x.id === sheet.id) : undefined;
  if (!sheet || !h) return null;
  const close = () => {
    setSheet(null);
    setHabitsOpen(true);
  };
  return createPortal(
    sheet.op === "setup" ? (
      <HabitSetupSheet
        habit={h}
        onClose={close}
        onSaveSteps={(next: HabitStep[]) => setHabitSteps(h.id, next)}
        onSaveRamp={(next: HabitRamp | null) => setHabitRamp(h.id, next)}
        onSaveSeconds={(next) => setHabitSeconds(h.id, next)}
        onSaveCoef={(next) => setHabitCoef(h.id, next)}
        onSaveAuto={(next) => setHabitAuto(h.id, next)}
      />
    ) : (
      <HabitPhotoCalendar habit={h} onClose={close} />
    ),
    document.body,
  );
}
