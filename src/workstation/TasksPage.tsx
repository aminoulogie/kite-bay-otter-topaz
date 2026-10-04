import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Dumbbell, Trash2, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { addDays, getLocalDateKey, parseLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { scopeOf } from "@/lib/todos";
import type { TodoItem } from "@/lib/types";
import { sessionOn } from "@/lib/use-workout-slot";
import {
  FILTERS,
  counts,
  filterTasks,
  hhmm,
  minuteAt,
  thisMonday,
  weekOf,
  type TaskFilter,
} from "./tasks";

const HOUR = 44;
const FIRST = 6;
const LAST = 24;
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function slotLabel(t: TodoItem): string {
  if (!t.slot) return "";
  const d = parseLocalDateKey(t.slot.date);
  return `${DAY_NAMES[(d.getDay() + 6) % 7]} ${hhmm(t.slot.start)}`;
}

/**
 * Tasks at a desk: the list on the left, the week on the right. Drag a task
 * onto the week to schedule it; drag a block to move it.
 */
export function TasksPage() {
  const todos = useSoma((s) => s.todos);
  const addTodo = useSoma((s) => s.addTodo);
  const addTodoAt = useSoma((s) => s.addTodoAt);
  const toggleTodo = useSoma((s) => s.toggleTodo);
  const renameTodo = useSoma((s) => s.renameTodo);
  const setTodoDue = useSoma((s) => s.setTodoDue);
  const setTodoSlot = useSoma((s) => s.setTodoSlot);
  const setTodoScope = useSoma((s) => s.setTodoScope);
  const removeTodo = useSoma((s) => s.removeTodo);
  const restoreTodo = useSoma((s) => s.restoreTodo);
  const settings = useSoma((s) => s.settings);
  const programs = useSoma((s) => s.programs);

  const today = getLocalDateKey();
  const [filter, setFilter] = useState<TaskFilter>("today");
  const [draft, setDraft] = useState("");
  const [scope, setScope] = useState<"day" | "week">("day");
  const [monday, setMonday] = useState(() => thisMonday(today));
  const [quick, setQuick] = useState<{ date: string; start: number; x: number; y: number } | null>(
    null,
  );
  const [quickText, setQuickText] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const grab = useRef(0);

  const list = useMemo(() => filterTasks(todos, filter, today), [todos, filter, today]);
  const n = useMemo(() => counts(todos, today), [todos, today]);
  const days = useMemo(() => weekOf(monday), [monday]);
  const planned = useMemo(
    () => days.map((d) => sessionOn(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, settings, programs],
  );

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    addTodo(t, scope);
    setDraft("");
  };

  const drop = (date: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/task");
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const start = minuteAt(e.clientY - rect.top - grab.current, HOUR, FIRST);
    setTodoSlot(id, { date, start, mins: t.slot?.mins ?? 60 });
  };

  const remove = (t: TodoItem) => {
    const idx = useSoma.getState().todos.findIndex((x) => x.id === t.id);
    removeTodo(t.id);
    toast.success("Task deleted", {
      action: { label: "Undo", onClick: () => restoreTodo(idx, t) },
    });
  };

  const weekLabel = `${parseLocalDateKey(days[0]!).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseLocalDateKey(days[6]!).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="ws-tasks">
      <section className="ws-tasks-list">
        <div className="ws-page" style={{ maxWidth: "none", paddingBottom: 12 }}>
          <h1>Tasks</h1>
          <p className="ws-sub" style={{ marginBottom: 12 }}>
            Drag a task onto the week to give it a time.
          </p>
          <div className="ws-seg" style={{ marginBottom: 10 }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {f.id !== "done" && <span className="ws-faint">{n[f.id]}</span>}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="ws-input"
              style={{ flex: 1 }}
              placeholder="Add a task and press Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <div className="ws-seg">
              <button type="button" aria-pressed={scope === "day"} onClick={() => setScope("day")}>
                Today
              </button>
              <button
                type="button"
                aria-pressed={scope === "week"}
                onClick={() => setScope("week")}
              >
                This week
              </button>
            </div>
          </div>
        </div>

        <div className="ws-task-rows">
          {list.length === 0 && <p className="ws-empty">Nothing here.</p>}
          {list.map((t) => (
            <div
              key={t.id}
              className={`ws-task ${t.done ? "done" : ""}`}
              draggable={!t.done}
              onDragStart={(e) => {
                grab.current = 0;
                e.dataTransfer.setData("text/task", t.id);
              }}
            >
              <input type="checkbox" checked={t.done} onChange={() => toggleTodo(t.id)} />
              <div className="ws-task-main">
                <input
                  className="lbl"
                  defaultValue={t.text}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value.trim() !== t.text &&
                    renameTodo(t.id, e.target.value)
                  }
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <div className="ws-task-meta">
                  <button
                    type="button"
                    className="ws-chip"
                    title="Move between today's and this week's list"
                    onClick={() => setTodoScope(t.id, scopeOf(t) === "day" ? "week" : "day")}
                  >
                    {scopeOf(t) === "day"
                      ? t.date === today
                        ? "Today"
                        : parseLocalDateKey(t.date).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          })
                      : "Week"}
                  </button>
                  {t.slot ? (
                    <span className="ws-chip blue">
                      {slotLabel(t)}
                      <select
                        value={t.slot.mins}
                        onChange={(e) =>
                          setTodoSlot(t.id, { ...t.slot!, mins: Number(e.target.value) })
                        }
                        title="Duration"
                      >
                        {DURATIONS.map((m) => (
                          <option key={m} value={m}>
                            {m < 60 ? `${m}m` : `${m / 60}h`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setTodoSlot(t.id, null)}
                        title="Unschedule"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ) : null}
                  <input
                    type="date"
                    className={`ws-date ${t.due && t.due < today && !t.done ? "late" : ""}`}
                    value={t.due ?? ""}
                    title="Deadline"
                    onChange={(e) => setTodoDue(t.id, e.target.value || null)}
                  />
                </div>
              </div>
              <button type="button" className="ws-icon" onClick={() => remove(t)} title="Delete">
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="ws-cal">
        <header className="ws-cal-head">
          <button
            type="button"
            className="ws-icon"
            onClick={() => setMonday(getLocalDateKey(addDays(parseLocalDateKey(monday), -7)))}
          >
            <ChevronLeft />
          </button>
          <button type="button" className="ws-btn" onClick={() => setMonday(thisMonday(today))}>
            This week
          </button>
          <button
            type="button"
            className="ws-icon"
            onClick={() => setMonday(getLocalDateKey(addDays(parseLocalDateKey(monday), 7)))}
          >
            <ChevronRight />
          </button>
          <b style={{ marginLeft: 6 }}>{weekLabel}</b>
          <span className="ws-faint" style={{ marginLeft: "auto" }}>
            Double-click an empty slot to add a task there
          </span>
        </header>
        <div className="ws-cal-days">
          <div />
          {days.map((d, i) => (
            <div key={d} className={`ws-cal-day ${d === today ? "today" : ""}`}>
              {DAY_NAMES[i]} <b>{parseLocalDateKey(d).getDate()}</b>
            </div>
          ))}
        </div>
        <div className="ws-cal-scroll">
          <div className="ws-cal-grid" style={{ height: (LAST - FIRST) * HOUR }}>
            <div className="ws-cal-hours">
              {Array.from({ length: LAST - FIRST }, (_, i) => (
                <div key={i} style={{ height: HOUR }}>
                  {hhmm((FIRST + i) * 60)}
                </div>
              ))}
            </div>
            {days.map((d, i) => {
              const session = planned[i];
              const blocks = todos.filter((t) => t.slot?.date === d && !t.cleared);
              const top = (m: number) => ((m - FIRST * 60) / 60) * HOUR;
              return (
                <div
                  key={d}
                  className={`ws-cal-col ${d === today ? "today" : ""} ${over === d ? "drop" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(d);
                  }}
                  onDragLeave={() => setOver((o) => (o === d ? null : o))}
                  onDrop={(e) => drop(d, e)}
                  onDoubleClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setQuick({
                      date: d,
                      start: minuteAt(e.clientY - rect.top, HOUR, FIRST, 30),
                      x: e.clientX,
                      y: e.clientY,
                    });
                    setQuickText("");
                  }}
                >
                  {session?.slot && (
                    <>
                      <div
                        className="ws-ev meal"
                        style={{ top: top(session.slot.start - 60), height: 20 }}
                      >
                        <Utensils size={11} /> Pre-workout
                      </div>
                      <div
                        className="ws-ev workout"
                        style={{
                          top: top(session.slot.start),
                          height: Math.max(
                            22,
                            ((session.slot.end - session.slot.start) / 60) * HOUR - 2,
                          ),
                        }}
                      >
                        <Dumbbell size={11} /> {session.split}
                        <small>
                          {session.slot.time}–{hhmm(session.slot.end)}
                        </small>
                      </div>
                      <div
                        className="ws-ev meal"
                        style={{ top: top(session.slot.end + 30), height: 20 }}
                      >
                        <Utensils size={11} /> Post-workout
                      </div>
                    </>
                  )}
                  {blocks.map((t) => (
                    <div
                      key={t.id}
                      className={`ws-ev task ${t.done ? "done" : ""}`}
                      style={{
                        top: top(t.slot!.start),
                        height: Math.max(20, (t.slot!.mins / 60) * HOUR - 2),
                      }}
                      draggable
                      onDragStart={(e) => {
                        grab.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                        e.dataTransfer.setData("text/task", t.id);
                      }}
                      title={`${t.text} · ${hhmm(t.slot!.start)}–${hhmm(t.slot!.start + t.slot!.mins)}`}
                    >
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => toggleTodo(t.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>{t.text}</span>
                      {t.slot!.mins >= 45 && (
                        <small>
                          {hhmm(t.slot!.start)}–{hhmm(t.slot!.start + t.slot!.mins)}
                        </small>
                      )}
                    </div>
                  ))}
                  {d === today && nowMin >= FIRST * 60 && (
                    <div className="ws-now" style={{ top: top(nowMin) }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {quick && (
        <div className="ws-pop-bg" onMouseDown={() => setQuick(null)}>
          <div
            className="ws-pop"
            style={{
              left: Math.min(quick.x, window.innerWidth - 300),
              top: Math.min(quick.y, window.innerHeight - 90),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="ws-faint" style={{ marginBottom: 6 }}>
              {DAY_NAMES[(parseLocalDateKey(quick.date).getDay() + 6) % 7]} {hhmm(quick.start)}
            </div>
            <input
              autoFocus
              className="ws-input"
              style={{ width: "100%" }}
              placeholder="What needs doing?"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuick(null);
                if (e.key === "Enter" && quickText.trim()) {
                  addTodoAt(quickText.trim(), { date: quick.date, start: quick.start, mins: 60 });
                  setQuick(null);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
