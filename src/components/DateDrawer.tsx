import { useEffect, useMemo } from "react";
import { CalendarDays, Dumbbell, Flame, Moon, X } from "lucide-react";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Every date that has anything logged, newest first, as a jump list.
 *
 * A day counts as logged if it has a session, any food, or a sleep entry —
 * an empty day the store happened to instantiate is not history, and listing
 * those would bury the days that matter.
 */
function useLoggedDates() {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);

  return useMemo(() => {
    const dates = new Set<string>([...Object.keys(history), ...Object.keys(nutrition)]);
    const rows = [];

    for (const date of dates) {
      const session = history[date];
      const day = nutrition[date];
      const cals = (day?.items ?? []).reduce((a, i) => a + (i.cals || 0), 0);
      const sleep = day?.sleep?.hours ?? 0;
      if (!session && cals <= 0 && !sleep) continue;
      rows.push({
        date,
        split: session?.split ?? null,
        sets: session?.totalSets ?? 0,
        cals: Math.round(cals),
        sleep,
      });
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [history, nutrition]);
}

export function DateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows = useLoggedDates();
  const activeDate = useSoma((s) => s.activeDate);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const today = getLocalDateKey();

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[70] bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[71] flex w-[82%] max-w-xs flex-col border-r border-border-strong bg-bg transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-accent-text" />
            <span className="font-display text-sm font-extrabold">Logged days</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-muted" />
          </button>
        </div>

        <div className="soma-scroll flex-1 overflow-y-auto p-3">
          {rows.length === 0 && (
            <p className="px-1 py-6 text-center text-xs text-faint">
              Nothing logged yet. Days appear here once you train, eat or sleep.
            </p>
          )}

          {rows.map((r) => (
            <button
              key={r.date}
              type="button"
              onClick={() => {
                setActiveDate(r.date);
                onClose();
              }}
              className={cn(
                "mb-1.5 w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                r.date === activeDate
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface-2 hover:border-border-strong",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular text-sm font-bold">{r.date}</span>
                {r.date === today && (
                  <span className="text-[0.6rem] font-extrabold uppercase tracking-wider text-accent-text">
                    Today
                  </span>
                )}
              </div>
              {r.split && <div className="mt-0.5 truncate text-[0.7rem] text-muted">{r.split}</div>}
              <div className="mt-1.5 flex flex-wrap gap-2 text-[0.65rem] font-semibold text-faint">
                {r.sets > 0 && (
                  <span className="flex items-center gap-1">
                    <Dumbbell className="size-3" />
                    {r.sets} sets
                  </span>
                )}
                {r.cals > 0 && (
                  <span className="flex items-center gap-1">
                    <Flame className="size-3" />
                    {r.cals} kcal
                  </span>
                )}
                {r.sleep > 0 && (
                  <span className="flex items-center gap-1">
                    <Moon className="size-3" />
                    {r.sleep}h
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
