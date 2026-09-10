import { useMemo, useState } from "react";
import { Languages, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SwipeRow } from "@/components/SwipeRow";
import { lookupWord, type WordLookup } from "@/lib/lookup";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import type { MindEntry } from "@/lib/types";

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
  const removeMind = useSoma((s) => s.removeMind);
  const restoreMind = useSoma((s) => s.restoreMind);

  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [found, setFound] = useState<WordLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [swiped, setSwiped] = useState<string | null>(null);

  const words = useMemo(
    () =>
      mind
        .filter((m) => m.kind === "language" && !!m.takeaway)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 20),
    [mind],
  );

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

  return (
    <Card>
      <CardTitle>
        <span className="inline-flex items-center gap-1.5">
          <Languages className="size-3.5" />
          New words
        </span>
      </CardTitle>

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

      {words.length > 0 && (
        <div className="space-y-1.5">
          {words.map((w) => (
            <SwipeRow
              key={w.id}
              id={w.id}
              openId={swiped}
              setOpenId={setSwiped}
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
                  <span className="truncate text-sm font-bold">{w.title}</span>
                  {w.phonetic && (
                    <span className="shrink-0 text-[0.62rem] text-faint">{w.phonetic}</span>
                  )}
                  <span className="ml-auto shrink-0 text-[0.6rem] text-faint">
                    {(w.reviews?.length ?? 0)}/3
                  </span>
                </div>
                <div className="mt-0.5 text-[0.72rem] leading-snug text-muted">{w.takeaway}</div>
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
