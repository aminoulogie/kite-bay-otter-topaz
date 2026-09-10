import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { getPhoto, savePhoto } from "@/lib/habit-photos";
import { progressLabel, readProgress, searchBooks, type BookMatch } from "@/lib/lookup";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MindEntry } from "@/lib/types";

const coverKey = (id: string) => `book:${id}`;

/**
 * What you are reading, with a cover on it.
 *
 * A reading log that is a list of titles is a list nobody looks at. A shelf
 * with covers and a bar showing how far through you are is a shelf you check,
 * and checking it is most of what makes you pick the book back up.
 *
 * The cover is fetched once and stored as BYTES in the photo database the
 * habits and measurements already use — not as a URL. A URL means a broken
 * image on a plane and a dead link in two years, and this app's whole premise
 * is that what you logged is still there when nothing else is. It also puts
 * covers in the backup for free.
 */
export function Bookshelf() {
  const mind = useSoma((s) => s.mind);
  const addMind = useSoma((s) => s.addMind);
  const updateMind = useSoma((s) => s.updateMind);
  const removeMind = useSoma((s) => s.removeMind);
  const restoreMind = useSoma((s) => s.restoreMind);

  const [finding, setFinding] = useState(false);
  const [swiped, setSwiped] = useState<string | null>(null);

  const books = useMemo(
    () =>
      mind
        .filter((m) => m.kind === "book")
        .sort((a, b) => {
          // Finished books sink; the one you are actually reading is the point.
          if (!!a.finished !== !!b.finished) return a.finished ? 1 : -1;
          return a.date < b.date ? 1 : -1;
        }),
    [mind],
  );

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-3.5" />
            Reading
          </span>
        </CardTitle>
        <button
          type="button"
          onClick={() => setFinding(true)}
          className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold"
        >
          Add a book
        </button>
      </div>

      {books.length === 0 ? (
        <p className="text-xs leading-snug text-faint">
          Nothing on the shelf. Adding a book looks up its cover, author and page count —
          and works without any of them if you are offline.
        </p>
      ) : (
        <div className="space-y-1.5">
          {books.map((b) => (
            <SwipeRow
              key={b.id}
              id={b.id}
              openId={swiped}
              setOpenId={setSwiped}
              onDelete={() => {
                const idx = mind.findIndex((m) => m.id === b.id);
                removeMind(b.id);
                toast.success(`${b.title} off the shelf`, {
                  action: { label: "Undo", onClick: () => restoreMind(idx, b) },
                });
              }}
            >
              <BookRow book={b} onChange={(patch) => updateMind(b.id, patch)} />
            </SwipeRow>
          ))}
        </div>
      )}

      {finding && (
        <BookFinder
          onClose={() => setFinding(false)}
          onPick={async (m) => {
            const date = getLocalDateKey(new Date());
            const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            addMind({
              date,
              kind: "book",
              title: m.title,
              author: m.author,
              pages: m.pages,
              page: 0,
              sourceKey: m.key,
            } as Omit<MindEntry, "id">);
            setFinding(false);
            toast.success(`${m.title} on the shelf`);

            // Best effort, and deliberately after the entry is saved: a cover
            // that will not download must never cost you the book.
            if (m.coverUrl) {
              try {
                const res = await fetch(m.coverUrl);
                if (res.ok) {
                  const blob = await res.blob();
                  if (blob.size > 0) {
                    const saved = useSoma
                      .getState()
                      .mind.find((x) => x.title === m.title && x.kind === "book");
                    await savePhoto(coverKey(saved?.id ?? id), date, blob);
                    // Nudge a re-render so the cover appears without a reload.
                    if (saved) updateMind(saved.id, { sourceKey: m.key });
                  }
                }
              } catch {
                // No cover. The shelf reads perfectly well as text.
              }
            }
          }}
        />
      )}
    </Card>
  );
}

function BookRow({
  book, onChange,
}: {
  book: MindEntry;
  onChange: (patch: Partial<MindEntry>) => void;
}) {
  const [cover, setCover] = useState<string | null>(null);
  const pct = readProgress(book.page, book.pages);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void getPhoto(coverKey(book.id), book.date).then((row) => {
      if (!alive || !row) return;
      made = URL.createObjectURL(row.display);
      setCover(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [book.id, book.date, book.sourceKey]);

  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl border border-border bg-surface-2 p-2.5",
        book.finished && "opacity-60",
      )}
    >
      <div className="grid h-[76px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-md bg-surface-3">
        {cover ? (
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <BookOpen className="size-5 text-faint" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{book.title}</div>
        {book.author && <div className="truncate text-[0.68rem] text-faint">{book.author}</div>}

        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${pct ?? 0}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-[0.62rem] tabular text-faint">
            {book.finished ? `finished ${book.finished}` : progressLabel(book.page, book.pages)}
          </span>
          {!book.finished && (
            <div className="flex shrink-0 items-center gap-1">
              <DecimalInput
                aria-label={`Page of ${book.title}`}
                className="h-7 w-16 text-center text-[0.7rem]"
                placeholder="page"
                value={book.page ?? ""}
                onValueChange={(n) => onChange({ page: n ?? 0 })}
              />
              {!book.pages && (
                <DecimalInput
                  aria-label={`Total pages of ${book.title}`}
                  className="h-7 w-16 text-center text-[0.7rem]"
                  placeholder="of"
                  value={book.pages ?? ""}
                  onValueChange={(n) => onChange({ pages: n ?? undefined })}
                />
              )}
              <button
                type="button"
                onClick={() => onChange({ finished: getLocalDateKey(new Date()) })}
                className="rounded-full border border-border px-2 py-1 text-[0.6rem] font-bold text-faint"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookFinder({
  onClose, onPick,
}: {
  onClose: () => void;
  onPick: (m: BookMatch) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<BookMatch[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    const r = await searchBooks(q);
    setBusy(false);
    if (r.ok) setHits(r.value);
    else {
      setHits(null);
      setProblem(r.reason);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg pt-[max(12px,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between border-b border-border px-4 pb-3">
        <span className="font-display text-sm font-extrabold">Add a book</span>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="size-5 text-muted" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title or author"
            className="h-11 flex-1"
            autoFocus
          />
          <button
            type="submit"
            aria-label="Search"
            disabled={busy || !q.trim()}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </button>
        </form>

        {problem && (
          <Card>
            <p className="text-xs leading-snug text-muted">{problem}</p>
          </Card>
        )}

        {hits?.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onPick(m)}
            className="flex w-full gap-2.5 rounded-xl border border-border bg-surface-2 p-2.5 text-left"
          >
            <div className="grid h-[76px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-md bg-surface-3">
              {m.coverUrl ? (
                <img src={m.coverUrl} alt="" className="size-full object-cover" />
              ) : (
                <BookOpen className="size-5 text-faint" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-snug">{m.title}</div>
              <div className="mt-0.5 text-[0.68rem] text-faint">
                {[m.author, m.year ? String(m.year) : null, m.pages ? `${m.pages}pp` : null]
                  .filter(Boolean)
                  .join(" · ") || "no details"}
              </div>
            </div>
          </button>
        ))}

        {/* Always available, and not a fallback bolted on afterwards. The app
            has to work with the phone in aeroplane mode. */}
        <button
          type="button"
          onClick={() => onPick({ key: `manual:${Date.now()}`, title: q.trim() || "Untitled" })}
          disabled={!q.trim()}
          className="w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-bold text-muted disabled:opacity-40"
        >
          Add &ldquo;{q.trim() || "…"}&rdquo; by hand
        </button>
      </div>
    </div>
  );
}
