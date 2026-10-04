import { useEffect } from "react";
import { optimalProteinPerMeal, pace, reminders } from "@/lib/meal-pace";
import { judge } from "@/lib/meal-verdict";
import { latestWeight } from "@/lib/rings";
import { sessionOn } from "@/lib/use-workout-slot";
import { mealsAround } from "@/lib/workout-time";
import { clearMealReminders, scheduleMealReminders } from "@/lib/native/meal-reminders";
import { DEFAULT_GOALS, addDays, getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { eatBack, sessionBurn } from "@/lib/training-burn";

/**
 * Keeps the meal notifications in step with what has been eaten.
 *
 * Rebuilt whenever today's food, the goal or the times change, and whenever
 * the app comes back to the front — so the next reminder always says how big
 * that meal has to be now, not what it was this morning.
 */
export function MealReminderSync() {
  const nutrition = useSoma((s) => s.nutrition);
  const history = useSoma((s) => s.history);
  const settings = useSoma((s) => s.settings);
  const programs = useSoma((s) => s.programs);
  const activeProgramId = useSoma((s) => s.activeProgramId);

  useEffect(() => {
    if (settings.mealReminders === false) {
      void clearMealReminders();
      return;
    }
    const sync = () => {
      const today = getLocalDateKey();
      const day = nutrition[today];
      const goals = day?.goals || DEFAULT_GOALS;
      const burn = eatBack(sessionBurn(history[today], day?.bodyWeight || undefined), settings.eatBackTraining !== false);
      const items = day?.items || [];
      const eaten = items.reduce(
        (a, i) => ({ cals: a.cals + (i.cals || 0), protein: a.protein + (i.p || 0) }),
        { cals: 0, protein: 0 },
      );
      void scheduleMealReminders(
        reminders((d) => mealsAround(settings.mealTimes, sessionOn(getLocalDateKey(d)).slot), new Date(), { cals: goals.cals + burn, protein: goals.protein }, eaten, 7, optimalProteinPerMeal(latestWeight(nutrition))),
      );
    };
    const t = window.setTimeout(sync, 1500);
    const onShow = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [nutrition, history, settings.mealTimes, settings.mealReminders, settings.eatBackTraining, settings.workoutTime, settings.scheduleOverrides, programs, activeProgramId]);

  // Meal verdicts: judged every minute, and when food is confirmed. Written
  // once each (lockMealVerdicts never overwrites), so they are final.
  const lockMealVerdicts = useSoma((s) => s.lockMealVerdicts);
  useEffect(() => {
    const run = () => {
      const st = useSoma.getState();
      const now = new Date();
      // Food logged before this existed has no eaten time; judging those
      // meals would mark them skipped when they were not.
      const since = st.settings.mealVerdictsSince;
      if (!since) {
        st.patchSettings({ mealVerdictsSince: now.getTime() });
        return;
      }
      const today = getLocalDateKey(now);
      const yesterday = getLocalDateKey(addDays(now, -1));
      for (const date of [yesterday, today]) {
        const day = st.nutrition[date];
        if (!day) continue;
        const goals = day.goals || DEFAULT_GOALS;
        const burn = eatBack(sessionBurn(st.history[date], day.bodyWeight || undefined), st.settings.eatBackTraining !== false);
        const slots = pace(
          mealsAround(st.settings.mealTimes, sessionOn(date, st).slot),
          -1,
          { cals: goals.cals + burn, protein: goals.protein },
          { cals: 0, protein: 0 },
        ).slots;
        const nowMin = date === today ? now.getHours() * 60 + now.getMinutes() : 1440;
        const v = judge(date, slots, day.items || [], nowMin, now.getTime());
        for (const [key, verdict] of Object.entries(v)) {
          const [h, m] = verdict.time.split(":").map(Number);
          const opened = new Date(`${date}T00:00:00`);
          opened.setHours(h ?? 0, (m ?? 0) - 60, 0, 0);
          if (opened.getTime() < since) delete v[key];
        }
        if (Object.keys(v).length) lockMealVerdicts(date, v);
      }
    };
    run();
    const id = window.setInterval(run, 60_000);
    return () => window.clearInterval(id);
  }, [nutrition, settings.mealTimes, settings.workoutTime, lockMealVerdicts]);

  return null;
}
