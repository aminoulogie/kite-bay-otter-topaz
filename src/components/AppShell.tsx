import { useEffect, useState } from "react";
import {
  Activity,
  Dumbbell,
  Settings as SettingsIcon,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { Toaster } from "sonner";
import { BodyView } from "@/components/views/BodyView";
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
  { id: "body", label: "Body", icon: Activity },
  { id: "insights", label: "Stats", icon: TrendingUp },
  { id: "settings", label: "Setup", icon: SettingsIcon },
];

export function AppShell() {
  const [ready, setReady] = useState(false);
  const hydrated = useSoma((s) => s.hydrated);
  const tab = useSoma((s) => s.tab);
  const setTab = useSoma((s) => s.setTab);
  const settings = useSoma((s) => s.settings);
  const ensureSeed = useSoma((s) => s.ensureSeed);
  const markHydrated = useSoma((s) => s.markHydrated);

  useEffect(() => {
    const result = useSoma.persist.rehydrate();
    void Promise.resolve(result).then(() => {
      ensureSeed();
      markHydrated();
      setReady(true);
    });
  }, [ensureSeed, markHydrated]);

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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/85 px-5 py-3 backdrop-blur-xl">
        <div>
          <div className="font-display text-lg font-extrabold tracking-tight text-fg">SOMA</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-faint">Smart Coach</div>
        </div>
        <div className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
          Local
        </div>
      </header>

      <main className="soma-scroll px-4 pt-4">
        {tab === "workout" && <WorkoutView />}
        {tab === "nutrition" && <NutritionView />}
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
                  "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[0.62rem] font-bold transition-colors duration-150",
                  active ? "bg-accent text-accent-ink shadow-glow" : "text-faint hover:text-muted",
                )}
              >
                <Icon className="size-4" strokeWidth={active ? 2.4 : 2} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
      <Toaster position="top-center" theme={settings.theme === "light" ? "light" : "dark"} />
    </div>
  );
}
