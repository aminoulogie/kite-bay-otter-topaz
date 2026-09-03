import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { captureImage, deletePhoto, getPhoto, savePhoto, thumbsFor } from "@/lib/habit-photos";
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
    <div className="fixed inset-0 z-[58] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 pb-3">
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

      <div className="soma-scroll flex-1 overflow-y-auto px-4 pb-8 pt-3">
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

      {openDate && (
        <DaySheet
          habitId={habit.id}
          habitName={habit.name}
          date={openDate}
          done={habit.history[openDate] === true}
          onToggle={() => toggleHabit(habit.id, openDate)}
          onChanged={() => setReload((k) => k + 1)}
          onClose={() => setOpenDate(null)}
        />
      )}
    </div>
  );
}

export function DaySheet({
  habitId,
  habitName,
  date,
  done,
  onToggle,
  onChanged,
  onClose,
}: {
  habitId: string;
  habitName: string;
  date: string;
  done: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

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

        {url ? (
          <img src={url} alt={"Habit photo from " + date} className="w-full rounded-xl" />
        ) : (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-xs text-faint">
            No photo for this day
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
