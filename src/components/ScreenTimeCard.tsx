import { useEffect, useMemo, useState } from "react";
import { Smartphone, TrendingDown, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  bars, clampMinutes, formatMinutes, parseDuration, peak, topApp, trend, unaccounted, verdict,
} from "@/lib/screen-time";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ScreenApp } from "@/lib/types";

const SPAN = 7;

/**
 * Screen time, on the tab that already asks where the day went.
 *
 * It cannot be read off the phone — see lib/screen-time.ts for the reason,
 * which is Apple's design rather than a missing integration. So it is typed,
 * and the card's whole job is to make those twenty seconds pay: the number is
 * shown against the hours this day's plan left flexible, which is the only
 * comparison that says anything a phone's own Settings screen does not.
 */
export function ScreenTimeCard({ flexibleHours }: { flexibleHours: number }) {
  const activeDate = useSoma((s) => s.activeDate);
  const screenTime = useSoma((s) => s.screenTime);
  const logScreenTime = useSoma((s) => s.logScreenTime);
  const clearScreenTime = useSoma((s) => s.clearScreenTime);

  const today = screenTime[activeDate];
  const [open, setOpen] = useState(false);

  const strip = useMemo(() => bars(screenTime, activeDate, SPAN), [screenTime, activeDate]);
  const top = peak(strip);
  const t = useMemo(() => trend(screenTime, activeDate, SPAN), [screenTime, activeDate]);
  const line = verdict(today, flexibleHours);
  const biggest = topApp(today);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="mb-0">Screen time</CardTitle>
          <p className="mt-0.5 text-[0.68rem] leading-snug text-faint">
            {line ?? "Read it off Settings → Screen Time and put it here."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold tabular",
            today ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface-2 text-muted",
          )}
        >
          <Smartphone className="size-3.5" />
          {today ? formatMinutes(today.total) : "Log"}
        </button>
      </div>

      {/* Seven days. An unlogged day is a gap in the floor, not a zero bar —
          a phone in a drawer and a day nobody typed must not look alike. */}
      <div className="flex h-16 items-end gap-1.5">
        {strip.map((b) => {
          const isToday = b.date === activeDate;
          return (
            <div key={b.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-12 w-full max-w-7 items-end justify-center">
                {b.min === null ? (
                  <div className="h-0.5 w-full rounded-full bg-surface-3" />
                ) : (
                  <div
                    className={cn(
                      "w-full rounded-md",
                      isToday ? "bg-accent" : "bg-accent/35",
                    )}
                    style={{ height: `${Math.max(6, (b.min / top) * 48)}px` }}
                  />
                )}
              </div>
              <span className="text-[0.55rem] font-bold text-faint">{b.date.slice(8)}</span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem]">
        {t.direction === "unknown" ? (
          <span className="text-faint">
            {t.recent.days
              ? `${t.recent.days} of the last 7 days logged — two weeks gives a trend.`
              : "Nothing logged yet."}
          </span>
        ) : (
          <span className="flex items-center gap-1 font-bold text-muted">
            {t.direction === "up" ? (
              <TrendingUp className="size-3.5 text-warn" />
            ) : t.direction === "down" ? (
              <TrendingDown className="size-3.5 text-good" />
            ) : null}
            {t.direction === "flat"
              ? `Level at ${formatMinutes(t.recent.average)} a day`
              : `${formatMinutes(Math.abs(t.delta))} a day ${t.direction === "up" ? "more" : "less"} than the week before`}
          </span>
        )}
        {biggest && (
          <span className="text-faint">
            Most of it {biggest.name} · {formatMinutes(biggest.min)}
          </span>
        )}
      </div>

      {open && (
        <LogSheet
          initial={today}
          onClose={() => setOpen(false)}
          onSave={(entry) => logScreenTime(activeDate, entry)}
          onClear={() => clearScreenTime(activeDate)}
        />
      )}
    </Card>
  );
}

function LogSheet({
  initial, onClose, onSave, onClear,
}: {
  initial?: { total: number; apps?: ScreenApp[]; pickups?: number };
  onClose: () => void;
  onSave: (entry: { total: number; apps?: ScreenApp[]; pickups?: number }) => void;
  onClear: () => void;
}) {
  const [total, setTotal] = useState(() => (initial ? formatMinutes(initial.total) : ""));
  const [apps, setApps] = useState<ScreenApp[]>(() => initial?.apps ?? []);
  const [name, setName] = useState("");
  const [mins, setMins] = useState("");

  // Typed in whatever shape Settings printed it: "4h 12m", "4:12" or "252".
  const parsed = parseDuration(total);
  const rest = parsed === null ? 0 : unaccounted({ total: parsed, apps });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const addApp = () => {
    const m = parseDuration(mins);
    if (!name.trim() || m === null || m <= 0) return;
    setApps((a) => [...a, { name: name.trim(), min: m }]);
    setName("");
    setMins("");
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Log screen time"
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">Screen time</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>
        <p className="mb-3 text-xs leading-snug text-muted">
          Settings → Screen Time → See All Activity. iOS keeps this figure to
          itself, so it has to be copied across by hand.
        </p>

        <label className="text-[0.6rem] font-bold uppercase tracking-wider text-faint">
          Total today
        </label>
        <Input
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="4h 12m"
          inputMode="text"
          autoFocus
          className="mt-1"
        />
        <p className="mt-1 text-[0.68rem] text-faint">
          {parsed === null
            ? total.trim()
              ? "Not a duration. Try 4h 12m, 4:12, or 252."
              : "4h 12m, 4:12, or 252 for minutes."
            : `Reads as ${formatMinutes(parsed)}.`}
        </p>

        {apps.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {apps.map((a, i) => (
              <div
                key={`${a.name}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{a.name}</span>
                <span className="shrink-0 text-xs font-extrabold tabular text-muted">
                  {formatMinutes(a.min)}
                </span>
                <button
                  type="button"
                  onClick={() => setApps((list) => list.filter((_, j) => j !== i))}
                  className="shrink-0 text-danger"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {parsed !== null && (
              <p className="px-1 text-[0.68rem] text-faint">
                {rest > 0 ? `${formatMinutes(rest)} in everything else.` : "Every minute accounted for."}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="App (optional)"
          />
          <Input
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addApp()}
            placeholder="1h 5m"
            className="max-w-24"
          />
          <Button onClick={addApp}>Add</Button>
        </div>

        <Button
          variant="primary"
          className="mt-3 w-full"
          disabled={parsed === null}
          onClick={() => {
            if (parsed === null) return;
            onSave({
              total: clampMinutes(parsed),
              ...(apps.length ? { apps } : {}),
              ...(initial?.pickups ? { pickups: initial.pickups } : {}),
            });
            onClose();
          }}
        >
          Save
        </Button>

        {initial && (
          <Button
            className="mt-2 w-full text-danger"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            Remove today's entry
          </Button>
        )}
      </div>
    </div>
  );
}
