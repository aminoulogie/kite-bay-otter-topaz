import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, Check, FileText, ImagePlus, Loader2, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { BookCover } from "@/components/BookCover";
import { BookReader } from "@/components/BookReader";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Input } from "@/components/ui/input";
import { deleteBookFile, getBookFile, sizeLabel } from "@/lib/book-files";
import { pickBookFiles, readBookFile, storeBookFile } from "@/lib/book-import";
import { captureImage, savePhoto } from "@/lib/habit-photos";
import { searchBooks, upgradeCoverUrl, type BookMatch } from "@/lib/lookup";
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
  const [readingId, setReadingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(0);

  const books = useMemo(() => sortShelf(onlyBooks(mind)), [mind]);
  const tally = useMemo(() => counts(books), [books]);
  const thisYear = useMemo(
    () => finishedIn(books, new Date().getFullYear()),
    [books],
  );
  const open = books.find((b) => b.id === openId) ?? null;
  const reading = books.find((b) => b.id === readingId) ?? null;

  /**
   * Re-fetch covers that were saved at the old, smaller size.
   *
   * Books added before this was fixed carry a `-M` link and `-M` bytes, so they
   * would stay soft for ever with nothing to notice. Writing the upgraded link
   * back is what stops this running twice on the same book: once the URL is
   * `-L` there is nothing left to upgrade, so the effect no longer matches it.
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const b of books) {
        const better = upgradeCoverUrl(b.coverUrl);
        if (!better || !alive) continue;
        // The link is written first, so a download that fails still leaves the
        // book pointing at artwork an <img> can render at full size.
        updateMind(b.id, { coverUrl: better });
        try {
          const res = await fetch(better);
          if (!res.ok || !alive) continue;
          const blob = await res.blob();
          if (blob.size > 0 && alive) {
            await savePhoto(coverKey(b.id), b.date, blob);
            updateMind(b.id, { sourceKey: `${b.sourceKey ?? ""}#hd` });
          }
        } catch {
          // Offline. The upgraded link stands and will render when there is a
          // connection; the old bytes keep the shelf looking right until then.
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [books, updateMind]);

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

  /**
   * Put a file you already own on the shelf.
   *
   * The entry is created BEFORE the file is stored, because the file is filed
   * under the entry's id — and because an import that dies while writing 40MB
   * should leave you with a book you can rename, not with bytes in a database
   * nothing points at. Several files at once: nobody imports one book.
   */
  const importFiles = async () => {
    const files = await pickBookFiles();
    if (files.length === 0) return;
    setImporting(files.length);
    const date = getLocalDateKey(new Date());
    let added = 0;
    for (const file of files) {
      try {
        const read = await readBookFile(file);
        const id = addMind({
          date,
          kind: "book",
          title: read.title,
          author: read.author,
          pages: read.units,
          page: 0,
          fileKind: read.kind,
          fileName: file.name,
        } as Omit<MindEntry, "id">);
        await storeBookFile(id, date, file, read);
        // The cover component keys its load on sourceKey, so it needs a value
        // to notice the bytes that were just written under this entry's id.
        updateMind(id, { sourceKey: `file:${read.kind}:${Date.now().toString(36)}` });
        added++;
      } catch (err) {
        toast.error(
          `${file.name}: ${err instanceof Error ? err.message : "could not be imported."}`,
        );
      } finally {
        setImporting((n) => Math.max(0, n - 1));
      }
    }
    if (added > 0) toast.success(added === 1 ? "On the shelf" : `${added} books on the shelf`);
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
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Two ways in, because they are two different intentions: looking a
              book up by name, and opening one you already have. Putting the
              second behind the first would hide it from the person who came
              here holding a file. */}
          <button
            type="button"
            onClick={() => void importFiles()}
            disabled={importing > 0}
            className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold disabled:opacity-60"
          >
            {importing > 0 ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {importing > 0 ? `Reading ${importing}` : "My files"}
          </button>
          <button
            type="button"
            onClick={() => setFinding(true)}
            className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold"
          >
            Add a book
          </button>
        </div>
      </div>

      {books.length === 0 ? (
        <button
          type="button"
          onClick={() => setFinding(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-2 p-3 text-left"
        >
          <div className="grid aspect-[1/1.6] w-[62px] shrink-0 place-items-center rounded-lg border border-dashed border-border-strong">
            <Plus className="size-5 text-faint" />
          </div>
          <span className="min-w-0 text-xs leading-snug text-faint">
            Nothing on the shelf yet. Adding a book looks up its cover, author and
            page count — and works without any of them if you are offline. A PDF or
            EPUB from your files goes on the same shelf and opens here.
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
                <div className="grid aspect-[1/1.6] w-full place-items-center rounded-lg border border-dashed border-border-strong bg-surface-2">
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
          onRead={() => {
            setOpenId(null);
            setReadingId(open.id);
          }}
          onChange={(patch) => updateMind(open.id, patch)}
          onRemove={() => {
            const idx = mind.findIndex((m) => m.id === open.id);
            removeMind(open.id);
            setOpenId(null);
            // The file goes with the book. Leaving 40MB behind for an entry
            // nothing points at is how a local-first app quietly fills a phone.
            // Deleted after the undo window, so undo still has something to
            // restore for the five seconds it is offered.
            if (open.fileKind) {
              setTimeout(() => {
                if (!useSoma.getState().mind.some((m) => m.id === open.id)) {
                  void deleteBookFile(open.id);
                }
              }, 8000);
            }
            toast.success(`${open.title} off the shelf`, {
              action: { label: "Undo", onClick: () => restoreMind(idx, open) },
            });
          }}
        />
      )}

      {reading && (
        <BookReader
          book={reading}
          onClose={() => setReadingId(null)}
          onChange={(patch) => updateMind(reading.id, patch)}
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
      <div className="relative">
        <BookCover book={book} className={cn(book.finished && "opacity-60")} />
        {/* A book you can open here says so on the shelf. Without it the only
            way to find out which of forty covers is readable is to tap them. */}
        {book.fileKind && (
          <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-white backdrop-blur">
            {book.fileKind}
          </span>
        )}
      </div>
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
  book, onClose, onRead, onChange, onRemove,
}: {
  book: MindEntry;
  onClose: () => void;
  /** Open the reader. Only meaningful for a book that came in as a file. */
  onRead: () => void;
  onChange: (patch: Partial<MindEntry>) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);
  const [file, setFile] = useState<{ name: string; bytes: number } | null>(null);
  const pct = percentOf(book);
  const scroller = useRef<HTMLDivElement>(null);

  // What is actually on the phone, rather than what the entry claims. A book
  // whose file was cleared by the browser should say so here rather than at
  // the moment you try to read it on a train.
  useEffect(() => {
    if (!book.fileKind) return;
    let alive = true;
    void getBookFile(book.id).then((row) => {
      if (alive) setFile(row ? { name: row.name, bytes: row.bytes } : null);
    });
    return () => {
      alive = false;
    };
  }, [book.id, book.fileKind]);

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
          {/* First, above everything, on a book that can actually be opened.
              Reading it is the reason it is on the shelf; setting its cover is
              not. */}
          {book.fileKind && (
            <>
              <Button variant="primary" className="w-full" onClick={onRead}>
                <BookOpen className="size-4" />
                {book.page && book.page > 1 ? "Carry on reading" : "Read it"}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-center text-[0.62rem] text-faint">
                <FileText className="size-3" />
                {file
                  ? `${file.name} · ${sizeLabel(file.bytes)}`
                  : `${book.fileName ?? book.fileKind.toUpperCase()} — the file is not on this device`}
              </p>
            </>
          )}

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
