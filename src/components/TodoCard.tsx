import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * A list of things to do. Deliberately not a feature.
 *
 * No due dates, no priorities, no projects, no recurrence. Everything the app
 * tracks properly — training, food, habits, sleep — is tracked properly
 * BECAUSE it earns the structure. A to-do does not: the moment this grows a
 * priority field it starts competing with the habits tab, and a second, worse
 * habits tab is not what anybody wanted.
 *
 * A line, a square, and a line through it when it is done.
 */
export function TodoCard() {
  const todos = useSoma((s) => s.todos);
  const addTodo = useSoma((s) => s.addTodo);
  const toggleTodo = useSoma((s) => s.toggleTodo);
  const removeTodo = useSoma((s) => s.removeTodo);
  const restoreTodo = useSoma((s) => s.restoreTodo);
  const clearDoneTodos = useSoma((s) => s.clearDoneTodos);

  const [text, setText] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  const done = todos.filter((t) => t.done).length;

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">
          To do{todos.length > 0 && <span className="ml-1.5 text-faint">{done}/{todos.length}</span>}
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

      {todos.length > 0 && (
        <div className="mb-2 space-y-1">
          {todos.map((t, idx) => (
            <SwipeRow
              key={t.id}
              id={t.id}
              openId={swiped}
              setOpenId={setSwiped}
              onDelete={() => {
                removeTodo(t.id);
                toast.success("Removed", {
                  action: { label: "Undo", onClick: () => restoreTodo(idx, t) },
                });
              }}
            >
              <button
                type="button"
                onClick={() => toggleTodo(t.id)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-left"
              >
                {/* A square, and it stays a square when ticked. A checkbox
                    that becomes a circle on tap reads as a different control. */}
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-[5px] border-2 transition-colors",
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
