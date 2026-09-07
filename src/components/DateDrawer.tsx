import { useEffect, useMemo } from "react";
import { CalendarDays, Dumbbell, Flame, Moon, X } from "lucide-react";
import { getLocalDateKey } from "@/lib/soma";
import { useSwipeToClose } from "@/lib/use-edge-swipe";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Every date that has anything logged, newest first, as a jump list.
 *
 * A day counts as logged if it has a session, any food, or a sleep entry —
 * an empty day the store happened to instantiate is not history, and listing
 * those would bury the days that matter.
 *
 * Today is the exception and is ALWAYS listed, empty or not. It was being
 * filtered out by exactly the same rule: first thing in the morning nothing is
 * logged yet, so the day you are actually on was missing from the list of
 * days — and having jumped to an older one there was no row to get back to.
 * The day being viewed is kept for the same reason.
 */
function useLoggedDates(alwaysShow: string[]) {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  const keep = alwaysShow.join("|");

  return useMemo(() => {
    const pinned = new Set(keep.split("|").filter(Boolean));
    const dates = new Set<string>([
      ...Object.keys(history),
      ...Object.keys(nutrition),
      ...pinned,
    ]);
    const rows = [];

    for (const date of dates) {
      const session = history[date];
      const day = nutrition[date];
      const cals = (day?.items ?? []).reduce((a, i) => a + (i.cals || 0), 0);
      const sleep = day?.sleep?.hours ?? 0;
      const empty = !session && cals <= 0 && !sleep;
      if (empty && !pinned.has(date)) continue;
      rows.push({
        date,
        split: session?.split ?? null,
        sets: session?.totalSets ?? 0,
        cals: Math.round(cals),
        sleep,
        empty,
      });
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [history, nutrition, keep]);
}

export function DateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Swiping left puts it back where it came from — the reverse of the swipe
  // that opened it. Without this the gesture only worked in one direction.
  const panelRef = useSwipeToClose(onClose, "left", open);
  const activeDate = useSoma((s) => s.activeDate);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const today = getLocalDateKey();
  const rows = useLoggedDates([today, activeDate]);

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
        ref={panelRef}
        className={cn(
          "fixed inset-y-0 left-0 z-[71] flex w-[82%] max-w-xs flex-col border-r border-border-strong bg-bg transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!open}
        // A closed drawer is only moved off-screen, so its buttons stay in the
        // tab order and remain clickable. `inert` takes the whole subtree out
        // of focus, hit-testing and the accessibility tree while it is shut.
        inert={!open}
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
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-faint">
                {new Date(r.date + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                })}
              </div>
              {r.split && <div className="mt-0.5 truncate text-[0.7rem] text-muted">{r.split}</div>}
              {r.empty && (
                <div className="mt-0.5 text-[0.7rem] text-faint">Nothing logged yet</div>
              )}
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
