import { useEffect, useState } from "react";
import { Footprints, Flame, HeartPulse, Moon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sized } from "@/components/WidgetGrid";
import { healthDay, type HealthDay } from "@/lib/native/health";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";

/**
 * Today from Apple Health, on Home: steps, active energy, last night's sleep
 * and resting heart rate. Read when Home opens, when the app comes back, and
 * every few minutes while it stays open.
 */
export function HealthCard() {
  const connected = useSoma((s) => !!s.settings.healthSync);
  const setTab = useSoma((s) => s.setTab);
  const [day, setDay] = useState<HealthDay | null>(null);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    const read = () => void healthDay(getLocalDateKey(new Date())).then((d) => alive && setDay(d));
    read();
    const id = setInterval(read, 5 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [connected]);

  const steps = day?.steps != null ? Math.round(day.steps) : null;
  const kcal = day?.activeKcal != null ? Math.round(day.activeKcal) : null;
  const sleep = day?.sleepHours != null ? Math.round(day.sleepHours * 10) / 10 : null;
  const hr = day?.restingHR != null ? Math.round(day.restingHR) : null;

  const rows = [
    { icon: Footprints, color: "#30d158", label: "Steps", value: steps?.toLocaleString() ?? "—" },
    { icon: Flame, color: "#ff375f", label: "Active", value: kcal != null ? `${kcal} kcal` : "—" },
    { icon: Moon, color: "#5e5ce6", label: "Sleep (Health)", value: sleep != null ? `${sleep} h` : "—" },
    { icon: HeartPulse, color: "#ff453a", label: "Resting HR", value: hr != null ? `${hr} bpm` : "—" },
  ];

  return (
    <Sized glance={{
      label: "Apple Health",
      short: "Health",
      icon: HeartPulse,
      color: "#ff375f",
      value: connected && steps != null ? steps.toLocaleString() : null,
      unit: "steps",
      sub: connected ? [kcal != null && `${kcal} kcal`, sleep != null && `${sleep} h sleep`].filter(Boolean).join(" · ") || null : null,
      empty: connected ? "Nothing from Health yet today" : "Connect in Settings › Apple Health",
      emptyShort: connected ? "No data" : "Connect",
    }}>
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <HeartPulse className="size-4 text-[#ff375f]" />
          <span className="font-display text-sm font-extrabold">Apple Health · today</span>
          <span className="ml-auto text-[0.6rem] text-faint">as Health recorded it</span>
        </div>
        {connected ? (
          <div className="grid grid-cols-2 gap-2">
            {rows.map(({ icon: Icon, color, label, value }) => (
              <div key={label} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wider text-faint">
                  <Icon className="size-3.5" style={{ color }} /> {label}
                </div>
                <div className="mt-0.5 font-display text-lg font-extrabold tabular">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTab("settings")}
            className="w-full rounded-xl border border-border bg-surface-2 py-3 text-xs font-bold"
          >
            Connect Apple Health in Settings
          </button>
        )}
      </Card>
    </Sized>
  );
}
