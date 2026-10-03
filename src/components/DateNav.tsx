import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { tapLight, tapTick } from "@/lib/haptics";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import { dateLabel, shiftDate } from "@/lib/date-label";

/** How far ahead the picker goes: far enough to plan a week of food. */
const AHEAD = 60;
/** At least this far back, even with nothing logged. */
const BEHIND = 365;
const ROW = 40;
const VISIBLE = 5;

const shift = shiftDate;

/** ‹ date › in the header. The date opens a wheel of days. */
export function DateNav() {
  const activeDate = useSoma((s) => s.activeDate);
  const setActiveDate = useSoma((s) => s.setActiveDate);
  const today = getLocalDateKey();
  const [wheel, setWheel] = useState(false);
  const last = shift(today, AHEAD);

  const go = (n: number) => {
    const next = shift(activeDate, n);
    if (next > last) return;
    setActiveDate(next);
    tapTick();
  };

  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous day"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setWheel(true);
          tapLight();
        }}
        aria-label={`${dateLabel(activeDate, today, true)}. Pick a day`}
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-1 py-1 text-center font-display text-[1.05rem] font-extrabold leading-tight tracking-tight active:bg-surface-2",
          activeDate === today ? "text-fg" : "text-warn",
        )}
      >
        {dateLabel(activeDate, today)}
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={activeDate >= last}
        aria-label="Next day"
        className="grid size-8 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2 disabled:opacity-30"
      >
        <ChevronRight className="size-5" />
      </button>
      {wheel &&
        createPortal(
          <DateWheel
            value={activeDate}
            today={today}
            onClose={() => setWheel(false)}
            onPick={(d) => {
              setActiveDate(d);
              setWheel(false);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/** Days with anything in them, for the dot beside each row. */
function useLoggedDays(): Set<string> {
  const history = useSoma((s) => s.history);
  const nutrition = useSoma((s) => s.nutrition);
  return useMemo(() => {
    const out = new Set(Object.keys(history));
    for (const [d, day] of Object.entries(nutrition)) {
      if ((day?.items?.length ?? 0) > 0 || day?.sleep?.hours) out.add(d);
    }
    return out;
  }, [history, nutrition]);
}

/**
 * The iOS wheel: one column of days on a drum. Native scroll with snap does
 * the physics; each frame tilts the rows by their distance from the middle,
 * and the haptic ticks every time a new day crosses the centre line.
 */
function DateWheel({
  value, today, onPick, onClose,
}: {
  value: string;
  today: string;
  onPick: (d: string) => void;
  onClose: () => void;
}) {
  const logged = useLoggedDays();
  const days = useMemo(() => {
    let first = shift(today, -BEHIND);
    for (const d of logged) if (d < first && /^\d{4}-\d{2}-\d{2}$/.test(d)) first = d;
    if (value < first) first = value;
    const out: string[] = [];
    for (let d = first, guard = 0; d <= shift(today, AHEAD) && guard < 4000; d = shift(d, 1), guard++) out.push(d);
    return out;
  }, [logged, today, value]);

  const scroller = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [sel, setSel] = useState(() => Math.max(0, days.indexOf(value)));
  const selRef = useRef(sel);

  const paint = () => {
    const el = scroller.current;
    if (!el) return;
    const mid = el.scrollTop / ROW;
    const lo = Math.max(0, Math.floor(mid) - 4);
    const hi = Math.min(days.length - 1, Math.ceil(mid) + 4);
    for (let i = lo; i <= hi; i++) {
      const r = rows.current[i];
      if (!r) continue;
      const dist = i - mid;
      const a = Math.max(-80, Math.min(80, dist * 22));
      r.style.transform = `rotateX(${-a}deg)`;
      r.style.opacity = String(Math.max(0.15, 1 - Math.abs(dist) * 0.28));
    }
    const idx = Math.max(0, Math.min(days.length - 1, Math.round(mid)));
    if (idx !== selRef.current) {
      selRef.current = idx;
      setSel(idx);
      tapTick();
    }
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = sel * ROW;
    paint();
    // Only on open: after that the scroll position is the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const scrollTo = (i: number) => scroller.current?.scrollTo({ top: i * ROW, behavior: "smooth" });

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" aria-label="Pick a day">
      <button type="button" aria-label="Cancel" className="flex-1" onClick={onClose} />
      <div className="soma-sheet rounded-t-[1.75rem] border-t border-border-strong bg-surface pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <button type="button" onClick={onClose} className="px-1 py-2 text-sm font-semibold text-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => scrollTo(Math.max(0, days.indexOf(today)))}
            className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-muted"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => {
              tapLight();
              onPick(days[sel] ?? value);
            }}
            className="px-1 py-2 text-sm font-extrabold text-accent-text"
          >
            Done
          </button>
        </div>

        <div className="relative mx-4" style={{ height: ROW * VISIBLE }}>
          {/* The lens: the band the chosen day sits in. */}
          <div
            className="pointer-events-none absolute inset-x-0 rounded-xl bg-surface-3"
            style={{ top: ROW * Math.floor(VISIBLE / 2), height: ROW }}
          />
          <div
            ref={scroller}
            onScroll={paint}
            className="relative h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              perspective: "600px",
              paddingBlock: ROW * Math.floor(VISIBLE / 2),
              maskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent)",
            }}
          >
            {days.map((d, i) => (
              <div
                key={d}
                ref={(r) => {
                  rows.current[i] = r;
                }}
                onClick={() => scrollTo(i)}
                className={cn(
                  "flex snap-center items-center justify-center gap-2 text-[1.15rem] tabular will-change-transform",
                  i === sel ? "font-extrabold text-fg" : "font-semibold text-muted",
                )}
                style={{ height: ROW, transformOrigin: "center center" }}
              >
                <span>{dateLabel(d, today, true)}</span>
                {logged.has(d) && <span className="size-1.5 rounded-full bg-accent" aria-label="has entries" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
