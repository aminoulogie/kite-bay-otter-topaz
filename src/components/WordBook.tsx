import { useMemo, useState } from "react";
import { Languages, Loader2, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { lookupWord, type WordLookup } from "@/lib/lookup";
import { getLocalDateKey } from "@/lib/soma";
import { RowEditSheet } from "@/components/RowEditSheet";
import { textOf } from "@/lib/row-edit";
import { languageLabel } from "@/lib/translate";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { MindEntry } from "@/lib/types";
import { Glance, isGlance } from "@/components/Glance";
import { useWidgetSize } from "@/components/WidgetGrid";

/**
 * Words you have just learned, with what they mean.
 *
 * The definition is stored in `takeaway`, which is not an implementation
 * shortcut — it is the point. That field is what the spaced-repetition queue
 * reads, so every word logged here comes back at two days, a week and a month
 * without a line of extra code. Drilling vocabulary on an expanding schedule
 * is exactly what you would build for it anyway; this just refuses to build it
 * twice.
 *
 * The lookup is a convenience and never a requirement. Type the definition
 * yourself and the word is worth precisely as much — which matters, because
 * the words worth writing down are often the ones no dictionary API has: a
 * Darija phrase, a piece of gym jargon, a term from a paper.
 */
export function WordBook() {
  const mind = useSoma((s) => s.mind);
  const addMind = useSoma((s) => s.addMind);
  const updateMind = useSoma((s) => s.updateMind);
  const removeMind = useSoma((s) => s.removeMind);
  const restoreMind = useSoma((s) => s.restoreMind);

  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [found, setFound] = useState<WordLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);
  const [editing, setEditing] = useState<MindEntry | null>(null);

  /**
   * Every word, whether or not it has a meaning yet.
   *
   * It used to require a definition, which was right when the only way in was
   * this form — you typed the word and its meaning together. Highlighting a
   * word in a book puts it here with no meaning at all, and filtering those
   * out meant the feature appeared to do nothing: the word was saved, and
   * invisible. A word waiting for a meaning is exactly the thing this card
   * should be showing you.
   */
  const words = useMemo(
    () =>
      mind
        .filter((m) => m.kind === "language" && !!m.title)
        // Starred first, then newest. A favourite is the word you went looking
        // for, and a list that buries it under a fortnight of new ones is a
        // list you have to search to use.
        .sort((a, b) =>
          a.favourite === b.favourite ? (a.date < b.date ? 1 : -1) : a.favourite ? -1 : 1,
        )
        .slice(0, 20),
    [mind],
  );
  const waiting = useMemo(() => words.filter((w) => !w.takeaway).length, [words]);

  const look = async () => {
    setBusy(true);
    setProblem(null);
    const r = await lookupWord(word);
    setBusy(false);
    if (r.ok) {
      setFound(r.value);
      setMeaning(r.value.senses[0]!.definition);
    } else {
      setFound(null);
      setProblem(r.reason);
    }
  };

  const save = () => {
    const w = word.trim();
    const m = meaning.trim();
    if (!w || !m) return;
    addMind({
      date: getLocalDateKey(new Date()),
      kind: "language",
      title: w,
      takeaway: m,
      phonetic: found?.phonetic,
      example: found?.senses.find((s) => s.example)?.example,
      source: found?.source,
    } as Omit<MindEntry, "id">);
    setWord("");
    setMeaning("");
    setFound(null);
    setProblem(null);
    toast.success(`${w} saved — it comes back in two days`);
  };

  const size = useWidgetSize();
  if (isGlance(size)) {
    return (
      <Glance
        size={size}
        spec={{
          label: "Your words",
          short: "Words",
          icon: Languages,
          value: String(words.length),
          unit: words.length === 1 ? "word" : "words",
          sub: waiting ? `${waiting} without a meaning` : null,
          lines: words.map((w) => ({ text: w.title, value: w.takeaway ? undefined : "no meaning" })),
          empty: "No words saved",
        }}
      />
    );
  }
  return (
    <Card>
      <CardTitle>
        <span className="inline-flex items-center gap-1.5">
          <Languages className="size-3.5" />
          New words
        </span>
        {waiting > 0 && (
          <span className="text-[0.62rem] font-bold text-accent-text">
            {waiting} waiting for a meaning
          </span>
        )}
      </CardTitle>

      <p className="mb-2 text-[0.65rem] leading-snug text-faint">
        Highlight a word while you are reading and it lands here with the sentence it
        came from. Add what it means and it joins the review queue.
      </p>

      <form
        className="mb-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void look();
        }}
      >
        <Input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="A word you just met"
          className="h-10 flex-1"
        />
        <button
          type="submit"
          aria-label="Look it up"
          disabled={busy || !word.trim()}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </form>

      {found?.phonetic && (
        <div className="mb-1 text-[0.7rem] text-faint">{found.phonetic}</div>
      )}

      <textarea
        value={meaning}
        onChange={(e) => setMeaning(e.target.value)}
        rows={2}
        placeholder="What it means, in your own words"
        className="mb-2 w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {/* The other senses, one tap away. Offered rather than concatenated: a
          flashcard with three definitions on it teaches none of them. */}
      {found && found.senses.length > 1 && (
        <div className="mb-2 space-y-1">
          {found.senses.slice(1).map((s) => (
            <button
              key={s.definition}
              type="button"
              onClick={() => setMeaning(s.definition)}
              className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-left text-[0.68rem] leading-snug text-muted"
            >
              {s.partOfSpeech ? <span className="text-faint">{s.partOfSpeech} · </span> : null}
              {s.definition}
            </button>
          ))}
        </div>
      )}

      {problem && (
        <p className="mb-2 text-[0.68rem] leading-snug text-warn">{problem}</p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!word.trim() || !meaning.trim()}
        className="mb-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-extrabold text-accent-ink disabled:opacity-40"
      >
        Save the word
      </button>

      {editing && (
        <RowEditSheet
          title="Edit word"
          fields={[
            { key: "title", label: "Word", value: editing.title },
            { key: "takeaway", label: "What it means", value: editing.takeaway },
            { key: "example", label: "In a sentence", value: editing.example },
          ]}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            const title = textOf(v, "title");
            if (!title) return;
            updateMind(editing.id, {
              title,
              takeaway: textOf(v, "takeaway"),
              example: textOf(v, "example"),
            });
          }}
        />
      )}

      {words.length > 0 && (
        <div className="space-y-1.5">
          {words.map((w) => (
            <SwipeRow
              key={w.id}
              id={w.id}
              openId={swiped}
              setOpenId={setSwiped}
              onEdit={() => setEditing(w)}
              onDelete={() => {
                const idx = mind.findIndex((m) => m.id === w.id);
                removeMind(w.id);
                toast.success(`${w.title} removed`, {
                  action: { label: "Undo", onClick: () => restoreMind(idx, w) },
                });
              }}
            >
              <div className="rounded-xl border border-border bg-surface-2 px-3 py-2">
                <div className="flex items-baseline gap-2">
                  {/* The star is a button, not a badge: the place you notice a
                      word matters is the list, so that is where you should be
                      able to say so. */}
                  <button
                    type="button"
                    aria-label={w.favourite ? `Unkeep ${w.title}` : `Keep ${w.title}`}
                    aria-pressed={!!w.favourite}
                    onClick={() => updateMind(w.id, { favourite: !w.favourite })}
                    className="-my-1 shrink-0 self-center p-1 active:scale-90"
                  >
                    <Star
                      className={cn(
                        "size-3.5",
                        w.favourite ? "fill-accent-text text-accent-text" : "text-faint",
                      )}
                    />
                  </button>
                  <span className="truncate text-sm font-bold">{w.title}</span>
                  {w.phonetic && (
                    <span className="shrink-0 text-[0.62rem] text-faint">{w.phonetic}</span>
                  )}
                  {w.source && (
                    <span className="shrink-0 truncate text-[0.6rem] text-faint">{w.source}</span>
                  )}
                  <span className="ml-auto shrink-0 text-[0.6rem] text-faint">
                    {w.takeaway ? `${w.reviews?.length ?? 0}/3` : "new"}
                  </span>
                </div>
                {w.takeaway ? (
                  <div className="mt-0.5 text-[0.72rem] leading-snug text-muted">{w.takeaway}</div>
                ) : (
                  /* Not an error, and not hidden: a word you highlighted while
                     reading is half done, and saying so is what turns it into
                     something you will finish. It cannot join the review queue
                     until it has a meaning — you cannot drill a blank. */
                  <button
                    type="button"
                    onClick={() => setEditing(w)}
                    className="mt-0.5 text-left text-[0.72rem] font-semibold leading-snug text-accent-text"
                  >
                    Add what it means
                  </button>
                )}
                {w.translation && (
                  <div className="mt-0.5 flex items-baseline gap-1.5 text-[0.72rem] leading-snug">
                    <span className="shrink-0 text-[0.55rem] uppercase tracking-wide text-faint">
                      {languageLabel(w.translatedTo)}
                    </span>
                    <span className="truncate">{w.translation}</span>
                  </div>
                )}
                {w.example && (
                  <div className="mt-1 text-[0.66rem] italic leading-snug text-faint">
                    &ldquo;{w.example}&rdquo;
                  </div>
                )}
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </Card>
  );
}
