import { useEffect, useMemo, useState } from "react";
import { History, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { RowEditSheet } from "@/components/RowEditSheet";
import { textOf } from "@/lib/row-edit";
import { byDue, dueLabel, overdueCount, toneFor, type DueTone } from "@/lib/due";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { TopTabs } from "@/components/TopTabs";
import { getLocalDateKey } from "@/lib/soma";
import {
  activeOf, dayGroupLabel, historyOf, progressOf, weekGroupLabel, type TodoScope,
} from "@/lib/todos";
import { useSoma } from "@/lib/store";
import type { TodoItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Two lists rather than one, and a place the old items go.
 *
 * This used to be a single flat list that never forgot anything, ticked or
 * not, until somebody deleted a row by hand — which is the exact shape a
 * "mess" takes: six weeks in, the box you actually care about (what is on
 * for today) is buried under everything you have ever jotted down.
 *
 * So it is two lists now, TODAY and THIS WEEK, each active for exactly the
 * period its name says and quietly retired once that period ends — not
 * deleted, just no longer the list you are working from. What has retired is
 * still there, one tap away, under History. See lib/todos.ts for the rule
 * that makes this work without a midnight job: an item is active by
 * ARITHMETIC on its own date, not by a flag anyone has to remember to flip.
 *
 * A DEADLINE is still the one piece of structure either list earns, and for
 * the reason it always was: "important" is a mood you re-rate every time you
 * look at the list, "the 20th" is true whether you look or not.
 */

/** Quiet until it matters: a date a fortnight out should not shout. */
const TONE: Record<DueTone, string> = {
  none: "",
  later: "text-faint",
  soon: "bg-warn/15 text-warn",
  today: "bg-accent/15 text-accent-text",
  late: "bg-danger/15 text-danger",
};

const SCOPE_TABS = [
  { id: "day" as const, label: "Today" },
  { id: "week" as const, label: "This week" },
];

const PLACEHOLDER: Record<TodoScope, string> = {
  day: "Something to do today",
  week: "Something for this week",
};

export function TodoCard() {
  const todos = useSoma((s) => s.todos);
  const addTodo = useSoma((s) => s.addTodo);
  const toggleTodo = useSoma((s) => s.toggleTodo);
  const renameTodo = useSoma((s) => s.renameTodo);
  const removeTodo = useSoma((s) => s.removeTodo);
  const restoreTodo = useSoma((s) => s.restoreTodo);
  const clearDoneTodos = useSoma((s) => s.clearDoneTodos);
  const setTodoDue = useSoma((s) => s.setTodoDue);
  const setTodoScope = useSoma((s) => s.setTodoScope);

  const [scope, setScope] = useState<TodoScope>("day");
  const [text, setText] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [history, setHistory] = useState(false);

  const today = getLocalDateKey(new Date());
  const active = useMemo(() => activeOf(todos, scope, today), [todos, scope, today]);
  const done = active.filter((t) => t.done).length;
  // Sorted for display only. The stored order is what an undo restores into,
  // so the two must not be the same list.
  const ordered = useMemo(() => byDue(active, today), [active, today]);
  const late = overdueCount(active, today);
  const hasHistory = useMemo(
    () => historyOf(todos, scope, today).length > 0,
    [todos, scope, today],
  );

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">To do</CardTitle>
        <button
          type="button"
          onClick={() => setHistory(true)}
          className="flex shrink-0 items-center gap-1 text-[0.68rem] font-bold text-faint"
        >
          <History className="size-3.5" />
          History
        </button>
      </div>

      <TopTabs tabs={SCOPE_TABS} value={scope} onChange={setScope} className="mb-2" />

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[0.68rem] font-bold text-faint">
          {active.length > 0 && `${done}/${active.length}`}
          {late > 0 && (
            <span className="ml-1.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-danger">
              {late} late
            </span>
          )}
        </span>
        {done > 0 && (
          <button
            type="button"
            onClick={() => {
              const n = clearDoneTodos(scope);
              toast.success(`${n} moved to history`);
            }}
            className="shrink-0 text-[0.68rem] font-bold text-faint"
          >
            Clear done
          </button>
        )}
      </div>

      {editing && (
        <RowEditSheet
          title="Edit to-do"
          fields={[
            { key: "text", label: "What needs doing", value: editing.text },
            { key: "due", label: "By when", value: editing.due ?? "", kind: "date" },
            {
              key: "list",
              label: "List",
              value: editing.scope === "week" ? "This week" : "Today",
              options: ["Today", "This week"],
            },
          ]}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            const text = textOf(v, "text");
            if (text) renameTodo(editing.id, text);
            setTodoDue(editing.id, textOf(v, "due") || null);
            const wantScope: TodoScope = v.list === "This week" ? "week" : "day";
            if (wantScope !== (editing.scope === "week" ? "week" : "day")) {
              setTodoScope(editing.id, wantScope);
            }
          }}
        />
      )}

      {history && (
        <TodoHistorySheet
          initialScope={scope}
          todos={todos}
          onClose={() => setHistory(false)}
          onEdit={(t) => {
            setHistory(false);
            setEditing(t);
          }}
          onToggle={toggleTodo}
          onDelete={(t, idx) => {
            removeTodo(t.id);
            toast.success("Removed", {
              action: { label: "Undo", onClick: () => restoreTodo(idx, t) },
            });
          }}
        />
      )}

      {active.length > 0 && (
        <div className="mb-2 space-y-1">
          {ordered.map((t) => (
            <SwipeRow
              key={t.id}
              id={t.id}
              openId={swiped}
              setOpenId={setSwiped}
              onEdit={() => setEditing(t)}
              onDelete={() => {
                // The index comes from the STORED list rather than the sorted
                // one, or an undo would put the row back at whatever position
                // the sort happened to show it in.
                const idx = todos.findIndex((x) => x.id === t.id);
                removeTodo(t.id);
                toast.success("Removed", {
                  action: { label: "Undo", onClick: () => restoreTodo(idx, t) },
                });
              }}
            >
              <TodoRow item={t} today={today} onToggle={() => toggleTodo(t.id)} />
            </SwipeRow>
          ))}
        </div>
      )}

      {active.length === 0 && (
        <p className="mb-2 text-center text-xs leading-snug text-faint">
          {scope === "day" ? "Nothing on for today." : "Nothing on for this week."}
          {hasHistory && " Check History for what came before."}
        </p>
      )}

      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          addTodo(text, scope);
          setText("");
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER[scope]}
          className="h-10 flex-1"
        />
        <button
          type="submit"
          aria-label="Add"
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2"
        >
          <Plus className="size-4" />
        </button>
      </form>
    </Card>
  );
}

/** The square, the text, the due badge — the same row wherever it is drawn. */
function TodoRow({
  item, today, onToggle,
}: {
  item: TodoItem;
  today: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-2 px-2.5 py-2 text-left"
    >
      {/* A square, and it stays a square when ticked. A checkbox that
          becomes a circle on tap reads as a different control. Bigger than
          it was, and closer to its label: at 20px with a 10px gap the box
          read as a small mark floating beside the text rather than as the
          control that belongs to it. */}
      <span
        className={cn(
          "grid size-[1.4rem] shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
          item.done ? "border-accent bg-accent" : "border-border",
        )}
      >
        {item.done && (
          <svg viewBox="0 0 12 12" className="size-3 text-accent-ink" aria-hidden>
            <path
              d="M2 6.2 4.6 8.8 10 3.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span
        className={cn("min-w-0 flex-1 text-sm font-semibold", item.done && "text-faint line-through")}
      >
        {item.text}
      </span>
      {/* Hidden once it is done: a finished thing has no deadline any more,
          and leaving "2d late" on a ticked row reads as a reproach for
          something already handled. */}
      {item.due && !item.done && (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold tabular",
            TONE[toneFor(item.due, today)],
          )}
        >
          {dueLabel(item.due, today)}
        </span>
      )}
    </button>
  );
}

/**
 * What you had, grouped by the day — or the week — it was for.
 *
 * Read-only in spirit but not in fact: a row here can still be ticked,
 * renamed, moved back onto a live list or deleted, because a history you
 * cannot correct is a history you stop trusting the moment it is wrong.
 */
function TodoHistorySheet({
  initialScope, todos, onClose, onEdit, onToggle, onDelete,
}: {
  initialScope: TodoScope;
  todos: TodoItem[];
  onClose: () => void;
  onEdit: (item: TodoItem) => void;
  onToggle: (id: string) => void;
  onDelete: (item: TodoItem, idx: number) => void;
}) {
  const [scope, setScope] = useState<TodoScope>(initialScope);
  const [swiped, setSwiped] = useState<string | null>(null);
  const today = getLocalDateKey(new Date());
  const groups = useMemo(() => historyOf(todos, scope, today), [todos, scope, today]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="To-do history"
      onClick={onClose}
    >
      <div
        className="soma-expand flex max-h-[85vh] flex-col rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-display text-base font-extrabold">History</span>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <TopTabs tabs={SCOPE_TABS} value={scope} onChange={setScope} className="mb-3 shrink-0" />

        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
          {groups.length === 0 && (
            <p className="py-6 text-center text-xs leading-snug text-faint">
              {scope === "day"
                ? "Nothing from an earlier day yet."
                : "Nothing from an earlier week yet."}
            </p>
          )}
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <h3 className="text-[0.68rem] font-bold uppercase tracking-wide text-faint">
                  {scope === "day" ? dayGroupLabel(g.key, today) : weekGroupLabel(g.key, today)}
                </h3>
                <span className="text-[0.62rem] font-bold tabular text-faint">
                  {progressOf(g.items)}
                </span>
              </div>
              <div className="space-y-1">
                {g.items.map((t) => (
                  <SwipeRow
                    key={t.id}
                    id={t.id}
                    openId={swiped}
                    setOpenId={setSwiped}
                    onEdit={() => onEdit(t)}
                    onDelete={() => {
                      const idx = todos.findIndex((x) => x.id === t.id);
                      onDelete(t, idx);
                    }}
                  >
                    <TodoRow item={t} today={today} onToggle={() => onToggle(t.id)} />
                  </SwipeRow>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
