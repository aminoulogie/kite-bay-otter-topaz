import { toast } from "sonner";
import { autoDone, type AutoContext } from "@/lib/habit-auto";
import { canTickOn } from "@/lib/habit-lock";
import { toBase } from "@/lib/money";
import { ratesOf } from "@/lib/money-model";
import { healthDay } from "@/lib/native/health";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * Runs the habit rules (lib/habit-auto.ts) while the app is open: on every
 * change to the data they read, when the app comes back, and every ten
 * minutes for the Apple Health ones. A habit whose rule is met is ticked, with
 * a toast saying so, so nothing ticks itself unseen.
 */
let health: { steps?: number; activeKcal?: number; mindfulMin?: number; at: number } | null = null;

const needsHealth = () =>
  useSoma.getState().habits.some((h) => h.auto?.kind === "steps" || h.auto?.kind === "activeKcal" || h.auto?.kind === "mindful");

async function refreshHealth(): Promise<void> {
  if (!useSoma.getState().settings.healthSync || !needsHealth()) return;
  const d = await healthDay(getLocalDateKey(new Date()));
  if (d) health = { steps: d.steps, activeKcal: d.activeKcal, mindfulMin: d.mindfulMin, at: Date.now() };
}

function contextFor(date: string): AutoContext {
  const s = useSoma.getState();
  const day = s.nutrition[date];
  const rates = ratesOf(s.settings);
  const spent = s.ledger
    .filter((e) => e.date === date && e.kind === "spend")
    .reduce((t, e) => t + toBase(e.amount, e.currency, rates), 0);
  const monthly = s.settings.monthlyBudget ?? 0;
  const daysInMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  return {
    date,
    day,
    session: s.history[date] ?? null,
    mind: s.mind,
    screen: s.screenTime[date],
    health: health && Date.now() - health.at < 30 * 60_000 ? health : null,
    bedtimeMs: day?.sleep?.start ?? null,
    spend: monthly > 0 ? { spent, dailyBudget: monthly / daysInMonth } : null,
    focusMin:
      (s.settings.focusByDay?.[date] ?? 0) +
      (s.settings.focusActiveSince ? Math.max(0, (Date.now() - s.settings.focusActiveSince) / 60_000) : 0),
  };
}

export function runHabitRules(): number {
  const date = getLocalDateKey(new Date());
  if (!canTickOn(date)) return 0;
  const s = useSoma.getState();
  const ctx = contextFor(date);
  let n = 0;
  for (const h of s.habits) {
    if (!h.auto || h.history?.[date] === true) continue;
    if (!autoDone(h.auto, ctx)) continue;
    s.toggleHabit(h.id, date);
    n++;
    toast.success(`${h.name} ✓ — ticked automatically`);
  }
  return n;
}

export function startHabitAuto(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => runHabitRules(), 800);
  };
  const unsub = useSoma.subscribe((now, prev) => {
    if (
      now.nutrition !== prev.nutrition ||
      now.history !== prev.history ||
      now.mind !== prev.mind ||
      now.screenTime !== prev.screenTime ||
      now.ledger !== prev.ledger ||
      now.habits !== prev.habits ||
      now.settings.focusByDay !== prev.settings.focusByDay
    ) soon();
  });
  const tickHealth = () => void refreshHealth().then(soon);
  const onVisible = () => {
    if (document.visibilityState === "visible") tickHealth();
  };
  document.addEventListener("visibilitychange", onVisible);
  const every = setInterval(tickHealth, 10 * 60_000);
  tickHealth();
  return () => {
    clearTimeout(timer);
    clearInterval(every);
    unsub();
    document.removeEventListener("visibilitychange", onVisible);
  };
}
