import { useMemo, useRef, useState } from "react";
import { BookOpen, Check, ImagePlus, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/BookCover";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { captureImage, savePhoto } from "@/lib/habit-photos";
import { searchBooks, type BookMatch } from "@/lib/lookup";
import {
  counts, coverKey, finishedIn, onlyBooks, percentOf, shelfLabel, sortShelf,
} from "@/lib/shelf";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MindEntry } from "@/lib/types";

/**
 * What you are reading, as a shelf you sweep a thumb along.
 *
 * This was a vertical list of rows with a thumbnail on the left, and it was the
 * wrong shape: in a list the cover is the smallest thing on the card, and the
 * cover is the only part that makes you pick the book back up. So the covers
 * are large, they scroll sideways, and everything else — pages, progress,
 * finishing it — moved into a sheet you open by tapping one.
 *
 * The scroller snaps per cover rather than free-scrolling. A shelf that stops
 * mid-book looks like a rendering fault, and the snap is what makes a sweep
 * feel like turning to the next book rather than nudging a carousel.
 *
 * Covers are stored as BYTES in the photo database the habits and measurements
 * already use, never as a URL: a URL means a broken image on a plane and a dead
 * link in two years, and it puts covers in the backup for free. The remote link
 * is kept only as a fallback for when that download was not permitted.
 */
export function Bookshelf() {
  const mind = useSoma((s) => s.mind);
  const addMind = useSoma((s) => s.addMind);
  const updateMind = useSoma((s) => s.updateMind);
  const removeMind = useSoma((s) => s.removeMind);
  const restoreMind = useSoma((s) => s.restoreMind);

  const [finding, setFinding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const books = useMemo(() => sortShelf(onlyBooks(mind)), [mind]);
  const tally = useMemo(() => counts(books), [books]);
  const thisYear = useMemo(
    () => finishedIn(books, new Date().getFullYear()),
    [books],
  );
  const open = books.find((b) => b.id === openId) ?? null;

  const add = async (m: BookMatch) => {
    const date = getLocalDateKey(new Date());
    const id = addMind({
      date,
      kind: "book",
      title: m.title,
      author: m.author,
      pages: m.pages,
      page: 0,
      sourceKey: m.key,
      coverUrl: m.coverUrl,
    } as Omit<MindEntry, "id">);
    setFinding(false);
    toast.success(`${m.title} on the shelf`);

    // Best effort, and deliberately after the entry is saved: a cover that will
    // not download must never cost you the book. The id comes back from the
    // store now rather than being guessed at by title, which is what made this
    // miss whenever two editions shared a name.
    if (m.coverUrl) {
      try {
        const res = await fetch(m.coverUrl);
        if (res.ok) {
          const blob = await res.blob();
          if (blob.size > 0) {
            await savePhoto(coverKey(id), date, blob);
            updateMind(id, { sourceKey: m.key });
          }
        }
      } catch {
        // Not downloadable. `coverUrl` still renders it as an <img>.
      }
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
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
        <button
          type="button"
          onClick={() => setFinding(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-2 p-3 text-left"
        >
          <div className="grid aspect-[2/3] w-[62px] shrink-0 place-items-center rounded-lg border border-dashed border-border-strong">
            <Plus className="size-5 text-faint" />
          </div>
          <span className="min-w-0 text-xs leading-snug text-faint">
            Nothing on the shelf yet. Adding a book looks up its cover, author and
            page count — and works without any of them if you are offline.
          </span>
        </button>
      ) : (
        <>
          {/* Bleeds into the card's padding so a cover can sit against the edge
              of the screen: a shelf that stops short of the bezel does not read
              as something that continues. */}
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex snap-x snap-mandatory gap-3">
              {books.map((b) => (
                <ShelfBook key={b.id} book={b} onOpen={() => setOpenId(b.id)} />
              ))}
              <button
                type="button"
                onClick={() => setFinding(true)}
                className="w-[108px] shrink-0 snap-start"
                aria-label="Add a book"
              >
                <div className="grid aspect-[2/3] w-full place-items-center rounded-lg border border-dashed border-border-strong bg-surface-2">
                  <Plus className="size-6 text-faint" />
                </div>
                <div className="mt-1.5 text-[0.7rem] font-bold text-faint">Add</div>
              </button>
            </div>
          </div>

          <p className="mt-2 text-[0.65rem] text-faint">
            {tally.reading > 0 && `${tally.reading} on the go`}
            {tally.reading > 0 && thisYear > 0 && " · "}
            {thisYear > 0 && `${thisYear} finished this year`}
            {tally.reading === 0 && thisYear === 0 && `${tally.total} on the shelf`}
          </p>
        </>
      )}

      {open && (
        <BookSheet
          book={open}
          onClose={() => setOpenId(null)}
          onChange={(patch) => updateMind(open.id, patch)}
          onRemove={() => {
            const idx = mind.findIndex((m) => m.id === open.id);
            removeMind(open.id);
            setOpenId(null);
            toast.success(`${open.title} off the shelf`, {
              action: { label: "Undo", onClick: () => restoreMind(idx, open) },
            });
          }}
        />
      )}

      {finding && <BookFinder onClose={() => setFinding(false)} onPick={add} />}
    </Card>
  );
}

/** One book on the shelf: the cover, and the least text that still says where you are. */
function ShelfBook({ book, onOpen }: { book: MindEntry; onOpen: () => void }) {
  const pct = percentOf(book);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-[108px] shrink-0 snap-start text-left active:scale-[0.97] transition-transform"
      aria-label={`${book.title}${book.author ? `, ${book.author}` : ""}. ${shelfLabel(book)}.`}
    >
      <BookCover book={book} className={cn(book.finished && "opacity-60")} />
      {/* Fixed heights, so the progress bars line up across the shelf however
          long the titles are. Ragged rows are what makes a shelf read as a
          list that happens to be sideways. */}
      <div className="mt-1.5 h-[1.8rem] overflow-hidden">
        <span className="line-clamp-2 text-[0.72rem] font-bold leading-tight">{book.title}</span>
      </div>
      <div className="h-[0.85rem] truncate text-[0.62rem] text-faint">{book.author ?? ""}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {pct !== null && !book.finished && (
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
        )}
        <span
          className={cn(
            "shrink-0 text-[0.6rem] font-bold tabular",
            book.finished ? "text-accent-text" : "text-faint",
          )}
        >
          {shelfLabel(book)}
        </span>
      </div>
    </button>
  );
}

/**
 * One book, full size.
 *
 * Everything that is not the cover lives here rather than on the shelf: page
 * number, total, finishing it, removing it. A shelf with four controls under
 * every cover is a form with pictures on it.
 */
function BookSheet({
  book, onClose, onChange, onRemove,
}: {
  book: MindEntry;
  onClose: () => void;
  onChange: (patch: Partial<MindEntry>) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);
  const pct = percentOf(book);
  const scroller = useRef<HTMLDivElement>(null);

  // A book the lookup does not know, or whose artwork is wrong, can be given a
  // cover from the camera roll. Stored the same way as a fetched one, so it is
  // in the backup and works offline like the rest.
  const pickCover = async () => {
    const file = await captureImage();
    if (!file) return;
    setBusy(true);
    try {
      await savePhoto(coverKey(book.id), book.date, file);
      // The cover component keys its load on sourceKey, so nudging it is what
      // makes the new artwork appear without a reload.
      onChange({ sourceKey: `${book.sourceKey ?? ""}#${Date.now().toString(36)}` });
      setBump((n) => n + 1);
      toast.success("Cover set");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={book.title}
      onClick={onClose}
    >
      <div
        ref={scroller}
        className="soma-expand max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5 text-muted" />
          </button>
        </div>

        <div className="mx-auto w-[150px]">
          <BookCover key={bump} book={book} rounded="rounded-xl" />
        </div>

        <h2 className="mt-3 text-center font-display text-lg font-extrabold leading-tight [text-wrap:balance]">
          {book.title}
        </h2>
        {book.author && (
          <p className="mt-0.5 text-center text-sm text-muted">{book.author}</p>
        )}

        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-bold text-muted">
              {book.finished ? `Finished ${book.finished}` : shelfLabel(book)}
            </span>
            {book.pages ? (
              <span className="tabular text-faint">
                {book.page ?? 0} of {book.pages} pages
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
        </div>

        {!book.finished && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[0.6rem] font-bold uppercase tracking-wide text-faint">
              On page
              <DecimalInput
                className="mt-1"
                value={book.page ?? ""}
                onValueChange={(n) => onChange({ page: n ?? 0 })}
              />
            </label>
            <label className="text-[0.6rem] font-bold uppercase tracking-wide text-faint">
              Out of
              <DecimalInput
                className="mt-1"
                placeholder="pages"
                value={book.pages ?? ""}
                onValueChange={(n) => onChange({ pages: n ?? undefined })}
              />
            </label>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <Button className="w-full" disabled={busy} onClick={() => void pickCover()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {busy ? "Saving" : "Use a photo as the cover"}
          </Button>

          {book.finished ? (
            <Button className="w-full" onClick={() => onChange({ finished: undefined })}>
              Put it back on the go
            </Button>
          ) : (
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                onChange({
                  finished: getLocalDateKey(new Date()),
                  page: book.pages ?? book.page,
                });
                toast.success(`Finished ${book.title}`);
                onClose();
              }}
            >
              <Check className="size-4" />
              Mark it finished
            </Button>
          )}

          <Button className="w-full text-danger" onClick={onRemove}>
            <Trash2 className="size-4" />
            Take it off the shelf
          </Button>
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
