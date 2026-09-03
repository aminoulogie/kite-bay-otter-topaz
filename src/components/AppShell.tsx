import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Dumbbell,
  PanelLeft,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { DateDrawer } from "@/components/DateDrawer";
import { getLocalDateKey } from "@/lib/soma";
import { requestPersistence } from "@/lib/storage-health";
import { useEdgeSwipe } from "@/lib/use-edge-swipe";
import { BodyView } from "@/components/views/BodyView";
import { HabitsView } from "@/components/views/HabitsView";
import { InsightsView } from "@/components/views/InsightsView";
import { NutritionView } from "@/components/views/NutritionView";
import { SettingsView } from "@/components/views/SettingsView";
import { WorkoutView } from "@/components/views/WorkoutView";
import { accentInk, accentText, normalizeAccent, resolveTheme } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string; icon: typeof Dumbbell }[] = [
  { id: "workout", label: "Train", icon: Dumbbell },
  { id: "nutrition", label: "Fuel", icon: Utensils },
  { id: "habits", label: "Habits", icon: Target },
  { id: "body", label: "Body", icon: Activity },
  { id: "insights", label: "Stats", icon: TrendingUp },
  { id: "settings", label: "Setup", icon: SettingsIcon },
];

export function AppShell() {
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  useEdgeSwipe(openDrawer, ready && !drawerOpen);
  const hydrated = useSoma((s) => s.hydrated);
  const tab = useSoma((s) => s.tab);
  const setTab = useSoma((s) => s.setTab);
  const settings = useSoma((s) => s.settings);
  const activeDate = useSoma((s) => s.activeDate);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const ensureSeed = useSoma((s) => s.ensureSeed);
  const normalizeLive = useSoma((s) => s.normalizeLive);
  const rollDayIfNeeded = useSoma((s) => s.rollDayIfNeeded);
  const markHydrated = useSoma((s) => s.markHydrated);

  useEffect(() => {
    const result = useSoma.persist.rehydrate();
    void Promise.resolve(result).then(() => {
      ensureSeed();
      // Ask the browser to stop treating this data as disposable. Safari grants
      // it to home-screen apps and usually refuses a plain tab; either way the
      // answer is informational, so nothing here depends on it.
      void requestPersistence();
      // Runs after rehydrate: a restored session can carry a clock that has
      // been running since the day it was opened.
      normalizeLive();
      markHydrated();
      setReady(true);
    });
  }, [ensureSeed, markHydrated, normalizeLive]);

  /**
   * Rolls onto a new sheet at midnight. A phone left on the Fuel tab overnight
   * would otherwise keep logging breakfast into yesterday.
   *
   * Polled once a minute rather than scheduled for the exact moment, because a
   * backgrounded tab has its timers throttled and iOS suspends them entirely —
   * so the visibility change is what actually catches it after a night asleep.
   */
  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (rollDayIfNeeded()) toast("New day — yesterday is saved in Logged days");
    };
    const id = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [ready, rollDayIfNeeded]);

  useEffect(() => {
    if (!hydrated) return;
    const accent = normalizeAccent(settings.accent);
    const theme = resolveTheme(settings.theme);
    const root = document.documentElement;
    root.setAttribute("data-soma-theme", theme);
    root.style.setProperty("--color-accent", accent);
    root.style.setProperty("--color-accent-ink", accentInk(accent));
    root.style.setProperty("--color-accent-text", accentText(accent, theme));
    root.style.setProperty("--color-accent-soft", `color-mix(in srgb, ${accent} 16%, transparent)`);
    root.style.setProperty("--color-accent-line", `color-mix(in srgb, ${accent} 38%, transparent)`);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f4f6f9" : "#0b0c10");
  }, [settings.accent, settings.theme, hydrated]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="font-display text-2xl font-bold tracking-tight text-fg">SOMA</div>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-1/2 animate-pulse bg-accent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto min-h-dvh max-w-lg bg-bg pb-28">
      {/* The native webview fills the screen including the area behind the
          status bar, so without the safe-area inset the clock, wifi and battery
          sit on top of the header. Harmless in a browser, where the inset is 0. */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* The swipe is not discoverable on its own, so the drawer also has
              a visible control. */}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="Open logged days"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-muted"
          >
            <PanelLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <div className="font-display text-lg font-extrabold leading-tight tracking-tight text-fg">
              SOMA
            </div>
            <div className="truncate text-[0.65rem] font-bold uppercase tracking-[0.16em] text-faint">
              Smart Coach
            </div>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
          Local
        </div>
      </header>

      {/* Selecting a past day changes what every tab reads. Without a standing
          indicator that is invisible, and the app looks like it ignored the tap. */}
      {activeDate !== getLocalDateKey() && (
        <button
          type="button"
          onClick={() => setActiveDate(getLocalDateKey())}
          className="sticky top-0 z-20 flex w-full items-center justify-between gap-2 border-b border-warn/30 bg-warn/15 px-4 py-1.5 text-[0.68rem] font-bold text-warn"
        >
          <span className="truncate">Viewing {activeDate}</span>
          <span className="shrink-0 underline">Back to today</span>
        </button>
      )}

      <DateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <main className="soma-scroll px-4 pt-4">
        {tab === "workout" && <WorkoutView />}
        {tab === "nutrition" && <NutritionView />}
        {tab === "habits" && <HabitsView />}
        {tab === "body" && <BodyView />}
        {tab === "insights" && <InsightsView />}
        {tab === "settings" && <SettingsView />}
      </main>

      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-1 rounded-full border border-border-strong bg-dock p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  // min-w-0 lets the flex child shrink below its content width;
                  // without it a six-tab dock overflows instead of fitting.
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-1.5 text-[0.58rem] font-bold leading-none transition-colors duration-150",
                  active ? "bg-accent text-accent-ink shadow-glow" : "text-faint hover:text-muted",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
                <span className="w-full truncate text-center">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <Toaster position="top-center" theme={settings.theme === "light" ? "light" : "dark"} />
    </div>
  );
}
