import { useMemo, useState } from "react";
import { BookOpen, Languages, Lightbulb, Newspaper, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { Bookshelf } from "@/components/Bookshelf";
import { WordBook } from "@/components/WordBook";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import { dueLabel, dueQueue, markReviewed, nextUp, stageLabel } from "@/lib/review-queue";
import type { MindEntry } from "@/lib/types";

/**
 * What went into your head, logged like a set went into your legs.
 *
 * The one rule with teeth: an ARTICLE will not save without a takeaway. An
 * article you cannot put in one line is one you skimmed, and logging it as
 * "read" is a lie told to a streak counter. Books and language drills are
 * different — they are ongoing, and a chapter does not owe you a thesis — so
 * the requirement is on the kind that is actually easy to fake.
 */
const KINDS = [
  { id: "book", label: "Book", icon: BookOpen, unit: "pages", placeholder: "Title" },
  { id: "article", label: "Article", icon: Newspaper, unit: "min", placeholder: "Headline or source" },
  { id: "language", label: "Language", icon: Languages, unit: "words", placeholder: "What you drilled" },
  { id: "idea", label: "Idea", icon: Lightbulb, unit: "", placeholder: "The idea, in a line" },
] as const;

type Kind = (typeof KINDS)[number]["id"];

export function MindView() {
  const mind = useSoma((s) => s.mind);
  const addMind = useSoma((s) => s.addMind);
  const removeMind = useSoma((s) => s.removeMind);
  const restoreMind = useSoma((s) => s.restoreMind);

  const today = getLocalDateKey(new Date());
  const [kind, setKind] = useState<Kind>("book");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [swiped, setSwiped] = useState<string | null>(null);

  const meta = KINDS.find((k) => k.id === kind)!;
  const rows = useMemo(() => [...mind].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60), [mind]);

  // Days in the last week with anything logged. A streak of "read something"
  // is the only number here worth chasing; pages per day is not comparable
  // between a textbook and a novel.
  const week = useMemo(() => {
    const days = new Set(mind.map((m) => m.date));
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (days.has(getLocalDateKey(d))) n++;
    }
    return n;
  }, [mind]);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Give it a title.");
      return;
    }
    if (kind === "article" && !takeaway.trim()) {
      toast.error("One line on what you took from it — otherwise you skimmed it.");
      return;
    }
    const n = Number(String(count).replace(",", "."));
    addMind({
      date: today,
      kind,
      title: title.trim(),
      count: Number.isFinite(n) && n > 0 ? n : undefined,
      takeaway: takeaway.trim() || undefined,
    });
    setTitle("");
    setCount("");
    setTakeaway("");
    toast.success(`${meta.label} logged`);
  };

  const del = (entry: MindEntry) => {
    const index = mind.findIndex((x) => x.id === entry.id);
    removeMind(entry.id);
    toast.success("Removed", {
      action: { label: "Undo", onClick: () => restoreMind(index, entry) },
    });
  };

  return (
    <div className="space-y-3 pb-4">
      <ReviewQueue />

      <WordBook />

      <Bookshelf />

      <Card>
        <CardTitle>This week</CardTitle>
        <div className="flex items-end gap-3">
          <div className="font-display text-5xl font-extrabold tabular">{week}</div>
          <div className="pb-1.5 text-xs text-muted">
            of 7 days
            <div className="text-[0.65rem] text-faint">with something logged</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Log</CardTitle>
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.6rem] font-bold transition-colors",
                  kind === k.id ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted",
                )}
              >
                <Icon className="size-4" />
                {k.label}
              </button>
            );
          })}
        </div>

        <Input
          className="mb-2"
          placeholder={meta.placeholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {meta.unit && (
          <Input
            className="mb-2"
            type="text"
            inputMode="numeric"
            placeholder={`How many ${meta.unit}? (optional)`}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        )}
        <Input
          className="mb-2"
          placeholder={kind === "article" ? "What you took from it (required)" : "Takeaway (optional)"}
          value={takeaway}
          onChange={(e) => setTakeaway(e.target.value)}
        />
        <Button variant="primary" className="w-full" onClick={submit}>
          <Plus className="size-4" /> Log {meta.label.toLowerCase()}
        </Button>
      </Card>

      <Card>
        <CardTitle>{rows.length ? `Last ${rows.length}` : "Nothing yet"}</CardTitle>
        {rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-faint">
            Books, articles, language drills and ideas land here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const k = KINDS.find((x) => x.id === r.kind);
              const Icon = k?.icon ?? Lightbulb;
              return (
                <SwipeRow key={r.id} id={r.id} openId={swiped} setOpenId={setSwiped} onDelete={() => del(r)}>
                  <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2">
                    <Icon className="mt-0.5 size-4 shrink-0 text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{r.title}</div>
                      <div className="text-[0.7rem] text-faint">
                        {r.date}
                        {r.count ? ` · ${r.count} ${k?.unit ?? ""}` : ""}
                      </div>
                      {r.takeaway && (
                        <div className="mt-1 text-[0.72rem] leading-snug text-muted">{r.takeaway}</div>
                      )}
                    </div>
                  </div>
                </SwipeRow>
              );
            })}
          </div>
        )}
      </Card>

      <p className="px-1 text-center text-[0.7rem] text-faint">
        Swipe an entry left to delete it.
      </p>
    </div>
  );
}

/**
 * Coming back to what you wrote down.
 *
 * The tab already insists on a takeaway for an article. That was half the job:
 * a takeaway written once and never read again is the same as not writing it,
 * and the log becomes a record of things you have forgotten, kept in enough
 * detail to prove you once knew them.
 *
 * Three passes at two days, a week and a month, and then the entry graduates
 * and never comes back. The schedule lives in lib/review-queue.ts; this shows
 * one card at a time, because a list of forty is a list nobody opens twice.
 */
function ReviewQueue() {
  const mind = useSoma((s) => s.mind);
  const updateMind = useSoma((s) => s.updateMind);
  const today = getLocalDateKey(new Date());

  const queue = useMemo(() => dueQueue(mind, today), [mind, today]);
  const upcoming = useMemo(() => (queue.length ? null : nextUp(mind, today)), [mind, today, queue.length]);
  const [revealed, setRevealed] = useState(false);

  const item = queue[0];
  if (!item && !upcoming) return null;

  return (
    <Card>
      <CardTitle>
        {item ? `Review · ${queue.length} due` : "Nothing due"}
      </CardTitle>

      {!item ? (
        <p className="text-xs leading-snug text-faint">
          Next takeaway comes back {dueLabel(upcoming!)} — {upcoming!.entry.title}.
        </p>
      ) : (
        <>
          <div className="text-sm font-bold leading-snug">{item.entry.title}</div>
          <div className="mt-0.5 text-[0.65rem] text-faint">
            {item.entry.kind} · logged {item.entry.date} · {stageLabel(item.stage)} · {dueLabel(item)}
          </div>

          {/* Hidden until asked for. Reading the answer off the screen is not
              recall, and a queue that shows you the takeaway with the title is
              a list of things you have seen, not things you know. */}
          {revealed ? (
            <p className="mt-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs leading-snug">
              {item.entry.takeaway}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-2 w-full rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-muted"
            >
              What did you take from it?
            </button>
          )}

          {revealed && (
            <Button
              variant="primary"
              className="mt-2 w-full"
              onClick={() => {
                const patch = markReviewed(item.entry, today);
                if (patch) updateMind(item.entry.id, patch);
                setRevealed(false);
                toast.success(
                  item.stage + 1 >= 3 ? "Finished with that one" : "Back again later",
                );
              }}
            >
              {item.stage + 1 >= 3 ? "Done with it" : "Got it"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
