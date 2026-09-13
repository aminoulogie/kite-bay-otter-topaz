import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { RowEditSheet } from "@/components/RowEditSheet";
import { textOf } from "@/lib/row-edit";
import { byDue, dueLabel, overdueCount, toneFor, type DueTone } from "@/lib/due";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { useSoma } from "@/lib/store";
import type { TodoItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * A list of things to do, and the one piece of structure it earns.
 *
 * It had none, on the argument that everything this app tracks properly earns
 * its structure and a to-do does not — grow a priority field and you have a
 * second, worse habits tab. That still holds for priorities, projects and
 * recurrence, all of which are still absent and should stay that way.
 *
 * A DEADLINE is different, and the difference is that it is a fact rather than
 * an opinion. "Important" is a mood you re-rate every time you look at the
 * list; "the 20th" is true whether you look or not, and it is the only thing
 * that can put the list in an order nobody has to maintain by hand.
 *
 * So: a line, a box, a date if there is one, and a line through it when done.
 */

/** Quiet until it matters: a date a fortnight out should not shout. */
const TONE: Record<DueTone, string> = {
  none: "",
  later: "text-faint",
  soon: "bg-warn/15 text-warn",
  today: "bg-accent/15 text-accent-text",
  late: "bg-danger/15 text-danger",
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
  const activeDate = useSoma((s) => s.activeDate);

  const [text, setText] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);
  const [editing, setEditing] = useState<TodoItem | null>(null);

  const done = todos.filter((t) => t.done).length;
  const today = activeDate;
  // Sorted for display only. The stored order is what an undo restores into,
  // so the two must not be the same list.
  const ordered = useMemo(() => byDue(todos, today), [todos, today]);
  const late = overdueCount(todos, today);

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">
          To do{todos.length > 0 && <span className="ml-1.5 text-faint">{done}/{todos.length}</span>}
          {late > 0 && (
            <span className="ml-1.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-danger">
              {late} late
            </span>
          )}
        </CardTitle>
        {done > 0 && (
          <button
            type="button"
            onClick={() => {
              const n = clearDoneTodos();
              toast.success(`${n} cleared`);
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
          ]}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            const text = textOf(v, "text");
            if (text) renameTodo(editing.id, text);
            setTodoDue(editing.id, textOf(v, "due") || null);
          }}
        />
      )}

      {todos.length > 0 && (
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
              <button
                type="button"
                onClick={() => toggleTodo(t.id)}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-2 px-2.5 py-2 text-left"
              >
                {/* A square, and it stays a square when ticked. A checkbox
                    that becomes a circle on tap reads as a different control.
                    Bigger than it was, and closer to its label: at 20px with a
                    10px gap the box read as a small mark floating beside the
                    text rather than as the control that belongs to it. */}
                <span
                  className={cn(
                    "grid size-[1.4rem] shrink-0 place-items-center rounded-[6px] border-2 transition-colors",
                    t.done ? "border-accent bg-accent" : "border-border",
                  )}
                >
                  {t.done && (
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
                  className={cn(
                    "min-w-0 flex-1 text-sm font-semibold",
                    t.done && "text-faint line-through",
                  )}
                >
                  {t.text}
                </span>
                {/* Hidden once it is done: a finished thing has no deadline
                    any more, and leaving "2d late" on a ticked row reads as a
                    reproach for something already handled. */}
                {t.due && !t.done && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold tabular",
                      TONE[toneFor(t.due, today)],
                    )}
                  >
                    {dueLabel(t.due, today)}
                  </span>
                )}
              </button>
            </SwipeRow>
          ))}
        </div>
      )}

      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          addTodo(text);
          setText("");
        }}
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={todos.length ? "Something else" : "Something to do"}
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
