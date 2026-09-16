import { useMemo, useState } from "react";
import { Copy, Highlighter, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  byRecent, filterHighlights, gather, groupByBook, summarise, tallyByColour, toMarkdown,
  type Highlight,
} from "@/lib/highlights";
import { MARK_COLOURS, markChip, removeMark } from "@/lib/marks";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/** How many to draw before the list needs opening out. */
const SHOWN = 12;

/**
 * Everything you have highlighted, out of the books.
 *
 * The highlighter was a thing you used while reading and never afterwards,
 * because a mark could only be seen inside the book it was in. Finding the
 * paragraph about sleep meant remembering which of nine books it was in,
 * opening it, and paging through that book's own sheet. This is the other end
 * of the feature: one list, searchable, and a way out of the app.
 *
 * TWO ORDERS, because there are two questions. "Newest" answers what have I
 * been marking lately, which is what you want on a card you pass on the way
 * past. "By book" answers what did this book give me, and inside a book the
 * order is the book's own — chapter then character — because a book's
 * highlights are an argument in the order it made it.
 *
 * The colours filter but are never explained. Five pastels mean whatever the
 * person who chose them decided they mean, and a legend inventing "yellow is
 * important" would be putting words in their mouth.
 */
export function Highlights() {
  const mind = useSoma((s) => s.mind);
  const updateMind = useSoma((s) => s.updateMind);
  const askForBook = useSoma((s) => s.askForBook);

  const [query, setQuery] = useState("");
  const [colour, setColour] = useState<string | null>(null);
  const [recent, setRecent] = useState(true);
  const [all, setAll] = useState(false);

  const every = useMemo(() => gather(mind), [mind]);
  const tally = useMemo(() => tallyByColour(every), [every]);
  const rows = useMemo(() => {
    const kept = filterHighlights(every, { query, colour: colour ?? undefined });
    return recent ? byRecent(kept) : kept;
  }, [every, query, colour, recent]);
  const groups = useMemo(() => groupByBook(rows), [rows]);

  const shown = all ? rows.length : SHOWN;

  const drop = (row: Highlight) => {
    const book = mind.find((m) => m.id === row.bookId);
    if (!book) return;
    updateMind(row.bookId, { marks: removeMark(book.marks ?? [], row.id) });
    toast.success("Highlight removed");
  };

  /**
   * Out of the app, as Markdown.
   *
   * Whatever is on screen rather than everything: a filter is a selection, and
   * copying all four hundred when you have just narrowed to the nine about
   * sleep is ignoring what you asked for.
   */
  const copy = async () => {
    const text = toMarkdown(recent ? filterHighlights(every, { query, colour: colour ?? undefined }) : rows);
    if (!text) {
      toast.error("Nothing to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${rows.length} highlight${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("This browser would not let the app use the clipboard.");
    }
  };

  if (every.length === 0) {
    return (
      <Card>
        <CardTitle>Highlights</CardTitle>
        <p className="text-xs leading-snug text-faint">
          Hold a word while reading and pick a colour. Everything you mark, in every book,
          collects here.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Highlights</CardTitle>
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 text-[0.7rem] font-bold text-muted"
        >
          <Copy className="size-3" />
          Copy
        </button>
      </div>
      <p className="mt-0.5 mb-2 text-[0.65rem] text-faint">{summarise(rows)}</p>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your highlights"
          className="pl-8"
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setRecent((r) => !r)}
          className="h-7 shrink-0 rounded-full border border-border bg-surface-2 px-2.5 text-[0.65rem] font-bold text-muted"
        >
          {recent ? "Newest" : "By book"}
        </button>
        {MARK_COLOURS.filter((c) => tally[c.id]! > 0).map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={colour === c.id}
            aria-label={`${c.label}, ${tally[c.id]}`}
            onClick={() => setColour((cur) => (cur === c.id ? null : c.id))}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[0.65rem] font-bold tabular",
              colour === c.id ? "border-accent text-fg" : "border-border text-faint",
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: c.chip }} />
            {tally[c.id]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">Nothing matches that.</p>
      ) : recent ? (
        <ul className="space-y-1">
          {rows.slice(0, shown).map((r) => (
            <Row key={r.id} row={r} onOpen={askForBook} onDrop={drop} withBook />
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.bookId}>
              <h3 className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-faint">
                <Highlighter className="size-3" />
                {g.title}
              </h3>
              <ul className="space-y-1">
                {g.rows.map((r) => (
                  <Row key={r.id} row={r} onOpen={askForBook} onDrop={drop} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!all && recent && rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 py-2 text-[0.7rem] font-bold text-muted"
        >
          Show the other {rows.length - SHOWN}
        </button>
      )}
    </Card>
  );
}

/**
 * One highlight.
 *
 * The passage is a button that takes you to it, and the bin is its own
 * target rather than a swipe. A swipe row here would fight the horizontal
 * page swipe this tab already uses, and rubbing out a highlight you wanted
 * because you meant to change tab is not recoverable from the list.
 */
function Row({
  row, onOpen, onDrop, withBook,
}: {
  row: Highlight;
  onOpen: (bookId: string, chapter: number, offset: number) => void;
  onDrop: (row: Highlight) => void;
  withBook?: boolean;
}) {
  return (
    <li className="flex items-stretch gap-1">
      <button
        type="button"
        onClick={() => onOpen(row.bookId, row.chapter, row.start)}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-xl px-1 py-1.5 text-left active:scale-[0.99]"
      >
        <span
          className="mt-1 w-1.5 shrink-0 self-stretch rounded-full"
          style={{ background: markChip(row.colour) }}
        />
        <span className="min-w-0">
          <span className="block text-[0.82rem] leading-snug">{row.text}</span>
          <span className="mt-0.5 block text-[0.6rem] text-faint">
            {withBook ? `${row.bookTitle} · ` : ""}
            Chapter {row.chapter + 1}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove the highlight on ${row.text}`}
        onClick={() => onDrop(row)}
        className="grid w-9 shrink-0 place-items-center rounded-xl text-faint active:scale-95"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}
