import { useContext, useEffect, useState } from "react";
import { WidgetCollectContext } from "@/components/WidgetGrid";
import { Moon, Sun } from "lucide-react";
import { goToSleep, wakeUp } from "@/lib/native/sleep-clock-sync";
import { useSoma } from "@/lib/store";

/**
 * "Going to sleep" in the evening, "I'm up" while a night is running — the
 * same button the home-screen widget has. Hidden in the daytime when no
 * night is running, so it is only there when it means something.
 */
export function SleepClockButton() {
  const start = useSoma((s) => s.settings.sleepStart);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const collectFor = useContext(WidgetCollectContext);
  const hour = new Date().getHours();
  const bedtime = hour >= 20 || hour < 4;
  if (collectFor) {
    // The native Home draws this as a banner.
    const c = collectFor("sleepclock");
    if (start == null && !bedtime) {
      c.remove();
    } else if (start != null) {
      const since = new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      c.put({ label: "I'm up", icon: Sun, color: "#fcd34d", sub: `Asleep since ${since} · ${((Date.now() - start) / 3_600_000).toFixed(1)} h so far`, onOpen: wakeUp });
    } else {
      c.put({ label: "Going to sleep", icon: Moon, color: "#818cf8", sub: "Tap now, and \"I'm up\" in the morning", onOpen: goToSleep });
    }
    return null;
  }
  if (start == null && !bedtime) return null;

  if (start != null) {
    const since = new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const h = ((Date.now() - start) / 3_600_000).toFixed(1);
    return (
      <button
        type="button"
        onClick={wakeUp}
        className="mb-3 flex w-full items-center gap-3 rounded-3xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-left active:scale-[0.99]"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-amber-400/20 text-amber-300">
          <Sun className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-extrabold">I'm up</span>
          <span className="block text-xs text-muted">Asleep since {since} · {h} h so far</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={goToSleep}
      className="mb-3 flex w-full items-center gap-3 rounded-3xl border border-indigo-400/30 bg-indigo-500/10 px-4 py-3 text-left active:scale-[0.99]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/20 text-indigo-300">
        <Moon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-extrabold">Going to sleep</span>
        <span className="block text-xs text-muted">Tap now, and "I'm up" in the morning — the night logs itself</span>
      </span>
    </button>
  );
}
