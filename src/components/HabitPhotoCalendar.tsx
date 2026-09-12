import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { captureImage, deletePhoto, getPhoto, savePhoto, thumbsFor } from "@/lib/habit-photos";
import { nextPhotoDate, positionIn, prevPhotoDate } from "@/lib/photo-nav";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Habit } from "@/lib/types";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * One habit's month, photo-first.
 *
 * A day that has a picture IS the picture — the grid reads as a wall of
 * moments rather than a checkbox chart, which is the entire reason for
 * capturing them. The date stays in the corner so it is still legible as a
 * calendar.
 */
export function HabitPhotoCalendar({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const toggleHabit = useSoma((s) => s.toggleHabit);
  const [cursor, setCursor] = useState(() => new Date());
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  /**
   * Object URLs are minted in an effect and revoked in its cleanup, never
   * during render. Revoking on every render — which is what this did first —
   * tears down URLs the browser has not finished fetching yet, and every tile
   * renders blank.
   */
  useEffect(() => {
    let alive = true;
    const created: string[] = [];

    void thumbsFor(habit.id).then((m) => {
      if (!alive) return;
      const next = new Map<string, string>();
      for (const [date, blob] of m) {
        const u = URL.createObjectURL(blob);
        created.push(u);
        next.set(date, u);
      }
      setUrls(next);
    });

    return () => {
      alive = false;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [habit.id, reload]);

  // Every day this habit has a picture on, across every month — the viewer
  // steps through the whole run, not just the month the grid is showing.
  const photoDates = useMemo(() => [...urls.keys()].sort(), [urls]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = getLocalDateKey(new Date());

  const { total, blanks } = useMemo(
    () => ({
      total: new Date(year, month + 1, 0).getDate(),
      blanks: (new Date(year, month, 1).getDay() + 6) % 7,
    }),
    [year, month],
  );

  const shift = useCallback(
    (d: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + d, 1)),
    [],
  );

  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const inMonth = [...urls.keys()].filter((k) => k.startsWith(year + "-" + pad(month + 1))).length;

  return (
    // A centred sheet rather than a whole screen. Taking over the display for a
    // month grid loses the habit list behind it, so closing it is the only way
    // back to what you were doing — and the grid never needed the room.
    //
    // DaySheet is a SIBLING of this, not a child. It is position:fixed, and the
    // card below both clips its overflow and carries an entry animation — an
    // ancestor transform makes itself the containing block for fixed children,
    // which is exactly how the RPE sheet ended up rendering off-screen once.
    <>
    <div
      className="soma-sheet fixed inset-0 z-[58] flex items-end justify-center bg-bg/85 p-4 sm:items-center"
      onClick={(e) => {
        // Tapping the dimmed area closes it, the way every other sheet here does.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-extrabold">{habit.name}</div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-faint">
            {urls.size} photo{urls.size === 1 ? "" : "s"} in total
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="soma-scroll flex-1 overflow-y-auto px-4 pb-5 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <div className="text-center">
            <div className="font-display text-sm font-extrabold">{monthName}</div>
            <div className="text-[0.65rem] text-faint">
              {inMonth ? inMonth + " captured this month" : "Tap a day to capture"}
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1.5 text-center text-[0.6rem] font-bold uppercase text-faint">
          {DOW.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: blanks }, (_, i) => (
            <div key={"b" + i} />
          ))}
          {Array.from({ length: total }, (_, i) => {
            const d = i + 1;
            const date = year + "-" + pad(month + 1) + "-" + pad(d);
            const done = habit.history[date] === true;
            const thumb = urls.get(date);
            const future = date > today;

            return (
              <button
                key={date}
                type="button"
                disabled={future}
                onClick={() => setOpenDate(date)}
                aria-label={date + (thumb ? ", has photo" : "")}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-xl border text-[0.62rem] font-bold transition-transform active:scale-95",
                  thumb ? "border-transparent" : done ? "border-accent" : "border-border",
                  future && "opacity-25",
                  date === today && !thumb && "ring-1 ring-accent-line",
                )}
                style={{ background: done && !thumb ? habit.color : "var(--color-surface-2)" }}
              >
                {thumb && (
                  <img
                    src={thumb}
                    alt=""
                    // Not lazy: a month is at most 31 small thumbnails already
                    // held in memory, and lazy loading leaves them blank
                    // whenever the grid is off-screen when it mounts.
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                <span
                  className={cn(
                    "absolute bottom-0.5 right-1.5",
                    thumb
                      ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]"
                      : done
                        ? "text-[#0b0c10]"
                        : "text-faint",
                  )}
                >
                  {d}
                </span>
                {done && thumb && (
                  <Check className="absolute left-1 top-1 size-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      </div>
    </div>
      {openDate && (
        <DaySheet
          habitId={habit.id}
          habitName={habit.name}
          date={openDate}
          photoDates={photoDates}
          onGo={setOpenDate}
          done={habit.history[openDate] === true}
          onToggle={() => toggleHabit(habit.id, openDate)}
          onChanged={() => setReload((k) => k + 1)}
          onClose={() => setOpenDate(null)}
        />
      )}
    </>
  );
}

/**
 * One day, and a way through the rest of them.
 *
 * The grid is how you find a photograph; it is a poor way to look through a
 * run of them. Tapping the right of the picture moves to the next day that has
 * one, the left goes back — the story gesture, because it is the one everybody
 * already has in their hands.
 *
 * Chevrons are drawn rather than left invisible. Instagram can rely on an
 * unmarked tap zone because everyone has already learned it there; a habit
 * calendar cannot, and an affordance nobody finds is the same as not building
 * it. They fade out at the ends, where there is nothing to move to.
 */
export function DaySheet({
  habitId,
  habitName,
  date,
  done,
  photoDates = [],
  onGo,
  onToggle,
  onChanged,
  onClose,
}: {
  habitId: string;
  habitName: string;
  date: string;
  done: boolean;
  /** Every day this set has a picture on, in any order. */
  photoDates?: string[];
  /** Move the viewer to another day. Absent leaves it on this one. */
  onGo?: (date: string) => void;
  onToggle: () => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  const prev = useMemo(() => prevPhotoDate(photoDates, date), [photoDates, date]);
  const next = useMemo(() => nextPhotoDate(photoDates, date), [photoDates, date]);
  const at = useMemo(() => positionIn(photoDates, date), [photoDates, date]);

  const go = useCallback(
    (to: string | null) => {
      if (to && onGo) onGo(to);
    },
    [onGo],
  );

  // Arrow keys as well as taps: a photo viewer that only works with a thumb
  // is unusable with a keyboard and unreachable with a switch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { go(prev); e.preventDefault(); }
      else if (e.key === "ArrowRight") { go(next); e.preventDefault(); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prev, next, onClose]);

  // A horizontal flick does the same thing, in the direction the picture moves.
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    void getPhoto(habitId, date).then((p) => {
      if (!alive) return;
      setHasPhoto(!!p);
      if (p) {
        created = URL.createObjectURL(p.display);
        setUrl(created);
      }
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [habitId, date]);

  const capture = async () => {
    const file = await captureImage();
    if (!file) return;
    setBusy(true);
    try {
      await savePhoto(habitId, date, file);
      toast.success("Photo saved");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[59] flex items-end justify-center bg-bg/90 p-4 sm:items-center">
      <Card className="w-full max-w-md space-y-3">
        <CardTitle>
          <span className="min-w-0 truncate">
            {habitName} · {date}
          </span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4 text-muted" />
          </button>
        </CardTitle>

        {at.total > 1 && (
          <div className="flex items-center gap-2">
            <div className="flex h-1 flex-1 gap-0.5" aria-hidden>
              {Array.from({ length: Math.min(at.total, 24) }, (_, i) => {
                // Capped at 24 pips: beyond that they are a grey smear and the
                // counter beside them is doing all the work anyway.
                const scaled = Math.round(((at.index ?? -1) / Math.max(1, at.total - 1)) * (Math.min(at.total, 24) - 1));
                return (
                  <span
                    key={i}
                    className={cn(
                      "h-full flex-1 rounded-full",
                      at.index !== null && i <= scaled ? "bg-accent" : "bg-surface-3",
                    )}
                  />
                );
              })}
            </div>
            <span className="shrink-0 text-[0.6rem] font-bold tabular text-faint">
              {at.index === null ? "—" : at.index + 1}/{at.total}
            </span>
          </div>
        )}

        {url ? (
          <div
            className="relative select-none"
            data-no-swipe-nav
            onTouchStart={(e) => {
              const t = e.touches[0];
              touch.current = t ? { x: t.clientX, y: t.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              const t = e.changedTouches[0];
              if (!start || !t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              // More sideways than vertical, or a scroll becomes a page turn.
              if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
              go(dx < 0 ? next : prev);
            }}
          >
            <img
              src={url}
              alt={"Habit photo from " + date}
              draggable={false}
              className="w-full rounded-xl"
            />

            <button
              type="button"
              aria-label={prev ? `Previous photo, ${prev}` : "No earlier photo"}
              disabled={!prev}
              onClick={() => go(prev)}
              className="absolute inset-y-0 left-0 grid w-1/3 place-items-start px-2 disabled:pointer-events-none"
            >
              <ChevronLeft
                className={cn(
                  "mt-[45%] size-7 rounded-full bg-black/45 p-1 text-white transition-opacity",
                  !prev && "opacity-0",
                )}
              />
            </button>
            <button
              type="button"
              aria-label={next ? `Next photo, ${next}` : "No later photo"}
              disabled={!next}
              onClick={() => go(next)}
              className="absolute inset-y-0 right-0 grid w-2/3 place-items-end px-2 disabled:pointer-events-none"
            >
              <ChevronRight
                className={cn(
                  "mt-[45%] size-7 rounded-full bg-black/45 p-1 text-white transition-opacity",
                  !next && "opacity-0",
                )}
              />
            </button>
          </div>
        ) : (
          <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-xs text-faint">
            No photo for this day
            {(prev || next) && (
              <div className="flex gap-2">
                {prev && (
                  <button type="button" onClick={() => go(prev)} className="font-bold text-accent-text">
                    ← {prev}
                  </button>
                )}
                {next && (
                  <button type="button" onClick={() => go(next)} className="font-bold text-accent-text">
                    {next} →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1"
            variant={done ? "primary" : undefined}
            onClick={() => {
              onToggle();
              onClose();
            }}
          >
            <Check className="size-4" /> {done ? "Done" : "Mark done"}
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => void capture()}>
            <Camera className="size-4" /> {hasPhoto ? "Replace" : "Capture"}
          </Button>
          {hasPhoto && (
            <Button
              variant="danger"
              aria-label="Delete photo"
              onClick={() => {
                void deletePhoto(habitId, date).then(() => {
                  toast.success("Photo deleted");
                  onChanged();
                  onClose();
                });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
