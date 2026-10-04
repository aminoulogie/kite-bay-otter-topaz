import { useEffect } from "react";
import { reminders } from "@/lib/meal-pace";
import { clearMealReminders, scheduleMealReminders } from "@/lib/native/meal-reminders";
import { DEFAULT_GOALS, getLocalDateKey } from "@/lib/soma";
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
        reminders(settings.mealTimes, new Date(), { cals: goals.cals + burn, protein: goals.protein }, eaten),
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
  }, [nutrition, history, settings.mealTimes, settings.mealReminders, settings.eatBackTraining]);

  return null;
}
