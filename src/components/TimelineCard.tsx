import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Dumbbell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWidgetSize } from "@/components/WidgetGrid";
import { rowsFor } from "@/lib/dashboard-layout";
import { arcs, defaultPlan, normalise } from "@/lib/day-plan";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import {
  DAY_MINUTES, DEFAULT_SLOT_MINUTES, SNAP_MINUTES, eventsFor, hhmm, layout, snap,
  type PlacedEvent,
} from "@/lib/timeline";
import { isActive } from "@/lib/todos";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { TodoItem } from "@/lib/types";

/**
 * The day as a calendar draws it.
 *
 * Hours down the side, what is on at each, and a red line at now — the shape
 * everyone already reads without thinking, which is why this is the Time
 * tab's centre now rather than the ring. A window you scroll inside: it opens
 * at the current hour, and the week across the top moves between days.
 *
 * Tap an empty hour to put something there — one of today's to-dos or a new
 * one; tap a to-do's circle to tick it; tap the to-do to move it or change
 * how long it takes. The day plan's blocks sit faintly behind, so the shape
 * you meant the day to have is under what is actually in it.
 */
const HOUR = 46;
const GUTTER = 52;

const SCROLL_HEIGHT: Record<number, string> = {
  2: "h-[5.5rem]",
  3: "h-[11rem]",
  4: "h-[17rem]",
};

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "Noon";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** "1:05" — the now pill, twelve-hour like the labels beside it. */
function shortClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function TimelineCard() {
  const todos = useSoma((s) => s.todos);
  const history = useSoma((s) => s.history);
  const dayPlans = useSoma((s) => s.dayPlans);
  const toggleTodo = useSoma((s) => s.toggleTodo);
  const size = useWidgetSize();
  const rows = rowsFor(size);

  const todayKey = getLocalDateKey(new Date());
  const [day, setDay] = useState(todayKey);
  const [adding, setAdding] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // The red line moves on its own.
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isToday = day === todayKey;
  const date = parseLocalDateKey(day);
  const monday = addDays(date, -((date.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const placed = useMemo(() => layout(eventsFor(day, todos, history[day])), [day, todos, history]);

  // The plan's blocks, faintly, behind. A block across midnight is drawn as
  // its two halves, one at each end of the day.
  const bands = useMemo(() => {
    const plan = normalise(dayPlans[day] ?? defaultPlan());
    const out: { id: string; label: string; color: string; start: number; end: number }[] = [];
    for (const a of arcs(plan.blocks)) {
      const start = ((a.startHour % 24) + 24) % 24 * 60;
      const end = start + (a.endHour - a.startHour) * 60;
      out.push({ id: a.block.id, label: a.block.label, color: a.block.color, start, end: Math.min(end, DAY_MINUTES) });
      if (end > DAY_MINUTES) out.push({ id: `${a.block.id}~`, label: a.block.label, color: a.block.color, start: 0, end: end - DAY_MINUTES });
    }
    return out;
  }, [dayPlans, day]);

  // Opens at the current hour, a little above it so what just happened is
  // in view; another day opens at seven.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const at = isToday ? nowMinutes() - 90 : 7 * 60;
    el.scrollTop = Math.max(0, (at / 60) * HOUR);
  }, [day, isToday, rows]);

  const unscheduled = todos.filter((t) => !t.slot && !t.done && isActive(t, todayKey));
  const editingTodo = editing ? todos.find((t) => t.id === editing) : undefined;

  return (
    <div className="glass-card flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      {rows >= 3 && (
        <div className="grid grid-cols-7 px-2 pt-3" role="group" aria-label="This week">
          {week.map((d) => {
            const key = getLocalDateKey(d);
            const on = key === day;
            const today = key === todayKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  tapLight();
                  setDay(key);
                }}
                aria-pressed={on}
                aria-label={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                className="flex flex-col items-center gap-1"
              >
                <span className="text-[0.62rem] font-bold text-faint">
                  {d.toLocaleDateString(undefined, { weekday: "narrow" })}
                </span>
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-[1.05rem] font-semibold tabular transition-colors",
                    on && today && "bg-[#ff3b30] text-white",
                    on && !today && "bg-fg text-bg",
                    !on && today && "text-[#ff3b30]",
                    !on && !today && (d.getDay() % 6 === 0 ? "text-faint" : "text-fg"),
                  )}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 border-y border-border px-3 py-1.5">
        <span className="w-10 text-[0.7rem] font-semibold text-faint">W{isoWeek(date)}</span>
        <button type="button" aria-label="Previous day" onClick={() => setDay(getLocalDateKey(addDays(date, -1)))} className="text-faint">
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[0.82rem] font-bold">
          {date.toLocaleDateString(undefined, { weekday: "long" })} –{" "}
          {date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <button type="button" aria-label="Next day" onClick={() => setDay(getLocalDateKey(addDays(date, 1)))} className="text-faint">
          <ChevronRight className="size-4" />
        </button>
        <span className="w-10 text-right">
          {!isToday && (
            <button type="button" onClick={() => setDay(todayKey)} className="text-[0.7rem] font-bold text-[#ff3b30]">
              Today
            </button>
          )}
        </span>
      </div>

      <div
        ref={scroller}
        data-no-swipe-nav
        // A fixed height, so the day scrolls INSIDE the card: grown to fit its
        // contents it became a page of twenty-four hours.
        className={cn("relative shrink-0 overflow-y-auto overscroll-contain", SCROLL_HEIGHT[Math.min(4, Math.max(2, rows))] ?? SCROLL_HEIGHT[4])}
      >
        <div
          className="relative"
          style={{ height: 24 * HOUR + 12 }}
          onClick={(e) => {
            // An empty hour: put something there.
            if ((e.target as HTMLElement).closest("[data-event]")) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const minutes = snap(((e.clientY - rect.top - 6) / HOUR) * 60, SNAP_MINUTES);
            setAdding(Math.max(0, Math.min(DAY_MINUTES - SNAP_MINUTES, minutes)));
          }}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute inset-x-0 flex items-start" style={{ top: h * HOUR }}>
              <span
                className={cn(
                  "w-[52px] shrink-0 -translate-y-1/2 pr-2 text-right text-[0.62rem] font-semibold tabular text-faint",
                  // The now pill sits in this gutter; the hour under it steps aside.
                  isToday && Math.abs(now - h * 60) < 18 && "invisible",
                )}
              >
                {hourLabel(h)}
              </span>
              <span className="mt-0 h-px flex-1 bg-border" />
            </div>
          ))}

          {bands.map((b) => (
            <div
              key={b.id}
              aria-hidden
              className="pointer-events-none absolute right-0 rounded-md"
              style={{
                left: GUTTER,
                top: (b.start / 60) * HOUR + 6,
                height: Math.max(2, ((b.end - b.start) / 60) * HOUR),
                background: `color-mix(in srgb, ${b.color} 9%, transparent)`,
                borderLeft: `2px solid color-mix(in srgb, ${b.color} 55%, transparent)`,
              }}
            >
              <span className="block truncate px-1.5 pt-0.5 text-[0.55rem] font-bold uppercase tracking-wider" style={{ color: b.color, opacity: 0.8 }}>
                {b.label}
              </span>
            </div>
          ))}

          {placed.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              onToggle={() => {
                if (!e.todoId) return;
                const t = todos.find((x) => x.id === e.todoId);
                if (!t) return;
                if (!t.done) tapSuccess();
                toggleTodo(t.id);
              }}
              onOpen={() => e.todoId && setEditing(e.todoId)}
            />
          ))}

          {isToday && (
            <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (now / 60) * HOUR + 6 }}>
              <span className="z-10 -translate-y-1/2 rounded-full bg-[#ff3b30] px-1.5 py-0.5 text-[0.6rem] font-bold tabular text-white">
                {shortClock(now)}
              </span>
              <span className="-ml-0.5 h-[2px] flex-1 -translate-y-1/2 bg-[#ff3b30]" />
            </div>
          )}
        </div>
      </div>

      {adding !== null && (
        <AddSheet
          day={day}
          start={adding}
          unscheduled={unscheduled}
          onClose={() => setAdding(null)}
        />
      )}
      {editingTodo?.slot && <EditSheet todo={editingTodo} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EventCard({ event, onToggle, onOpen }: { event: PlacedEvent; onToggle: () => void; onOpen: () => void }) {
  const top = (event.start / 60) * HOUR + 6;
  const height = Math.max(22, ((event.end - event.start) / 60) * HOUR - 2);
  const width = `calc((100% - ${GUTTER + 6}px) / ${event.columns})`;
  const left = `calc(${GUTTER + 2}px + (100% - ${GUTTER + 6}px) / ${event.columns} * ${event.column})`;
  const workout = event.kind === "workout";
  return (
    <div
      data-event
      className={cn(
        "absolute z-10 flex overflow-hidden rounded-lg border px-1.5",
        height < 34 ? "items-center" : "items-start pt-1",
        workout ? "border-[#ff6a00]/40 bg-[#ff6a00]/20" : "border-border-strong bg-surface-3",
      )}
      style={{ top, height, width, left }}
      onClick={(e) => {
        e.stopPropagation();
        if (!workout) onOpen();
      }}
    >
      {workout ? (
        <Dumbbell className="mr-1.5 mt-0.5 size-3.5 shrink-0 text-[#ff9f0a]" />
      ) : (
        <button
          type="button"
          aria-label={event.done ? "Mark not done" : "Mark done"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            "mr-1.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
            event.done ? "border-[#ff9f0a] bg-[#ff9f0a]" : "border-[#ff9f0a]",
          )}
        >
          {event.done && <Check className="size-2.5 text-black" strokeWidth={3.5} />}
        </button>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[0.78rem] font-semibold leading-tight", event.done && !workout && "text-faint line-through")}>
          {event.label}
        </span>
        {height >= 44 && (
          <span className="block text-[0.62rem] tabular text-faint">
            {hhmm(event.start)} – {hhmm(event.end)}
          </span>
        )}
      </span>
    </div>
  );
}

const DURATIONS = [15, 30, 45, 60, 90, 120];

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/50" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div
        className="soma-expand max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TimeAndLength({
  start, mins, onStart, onMins,
}: {
  start: number;
  mins: number;
  onStart: (m: number) => void;
  onMins: (m: number) => void;
}) {
  return (
    <>
      <label className="mb-3 block">
        <span className="mb-1 block text-[0.6rem] font-bold uppercase tracking-wider text-faint">Starts at</span>
        <Input
          type="time"
          step={900}
          value={hhmm(start)}
          onChange={(e) => {
            const [h, m] = e.target.value.split(":").map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) onStart(h! * 60 + m!);
          }}
          className="h-11 tabular"
        />
      </label>
      <div className="mb-1 text-[0.6rem] font-bold uppercase tracking-wider text-faint">How long</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onMins(d)}
            className={cn(
              "h-9 rounded-full px-3 text-xs font-bold",
              mins === d ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
            )}
          >
            {d < 60 ? `${d}m` : `${d / 60}h`.replace(".5h", "h30")}
          </button>
        ))}
      </div>
    </>
  );
}

function AddSheet({
  day, start: initialStart, unscheduled, onClose,
}: {
  day: string;
  start: number;
  unscheduled: TodoItem[];
  onClose: () => void;
}) {
  const setTodoSlot = useSoma((s) => s.setTodoSlot);
  const addTodoAt = useSoma((s) => s.addTodoAt);
  const [text, setText] = useState("");
  const [start, setStart] = useState(initialStart);
  const [mins, setMins] = useState(DEFAULT_SLOT_MINUTES);
  const slot = { date: day, start, mins };

  return (
    <Sheet title={`At ${hhmm(start)}`} onClose={onClose}>
      <TimeAndLength start={start} mins={mins} onStart={setStart} onMins={setMins} />

      <div className="mb-3 flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              addTodoAt(text, slot);
              toast.success(`${text.trim()} at ${hhmm(start)}`);
              onClose();
            }
          }}
          placeholder="Something new…"
          className="h-11 flex-1"
          autoFocus
        />
        <Button
          variant="primary"
          disabled={!text.trim()}
          onClick={() => {
            addTodoAt(text, slot);
            toast.success(`${text.trim()} at ${hhmm(start)}`);
            onClose();
          }}
        >
          Add
        </Button>
      </div>

      {unscheduled.length > 0 && (
        <>
          <div className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
            Or one from your list
          </div>
          <div className="space-y-1.5">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTodoSlot(t.id, slot);
                  toast.success(`${t.text} at ${hhmm(start)}`);
                  onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
              >
                <span className="size-4 shrink-0 rounded-full border-2 border-[#ff9f0a]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.text}</span>
                <span className="text-[0.65rem] font-bold text-faint">{t.scope === "week" ? "this week" : "today"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function EditSheet({ todo, onClose }: { todo: TodoItem; onClose: () => void }) {
  const setTodoSlot = useSoma((s) => s.setTodoSlot);
  const toggleTodo = useSoma((s) => s.toggleTodo);
  const slot = todo.slot!;
  return (
    <Sheet title={todo.text} onClose={onClose}>
      <TimeAndLength
        start={slot.start}
        mins={slot.mins}
        onStart={(start) => setTodoSlot(todo.id, { ...slot, start })}
        onMins={(mins) => setTodoSlot(todo.id, { ...slot, mins })}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            setTodoSlot(todo.id, null);
            toast.success("Back on your list, without a time");
            onClose();
          }}
        >
          Take off the timeline
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => {
            if (!todo.done) tapSuccess();
            toggleTodo(todo.id);
            onClose();
          }}
        >
          <Check className="size-4" /> {todo.done ? "Not done" : "Done"}
        </Button>
      </div>
    </Sheet>
  );
}
