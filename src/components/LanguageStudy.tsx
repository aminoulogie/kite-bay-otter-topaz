import { useMemo, useState } from "react";
import { Check, Plus, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { drawAll, progress } from "@/lib/lang/study";
import { LANGUAGES, LEVELS } from "@/lib/lang/words";
import { getLocalDateKey } from "@/lib/soma";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The languages you are learning, and one word a day in each.
 *
 * The word is DERIVED from the date rather than drawn at random: the same day
 * gives the same word however many times you open the app, on whatever device.
 * A word that changed on every render would be a slot machine, and you would
 * never see the same word twice — which is the one thing learning a word
 * requires.
 *
 * The level is yours to state rather than something the app infers. It knows
 * how many words you have taken from a list it wrote; it does not know whether
 * you can hold a conversation, and guessing would be the app telling you
 * something about yourself that it cannot possibly know.
 */
export function LanguageStudy() {
  const langs = useSoma((s) => s.langs);
  const addLang = useSoma((s) => s.addLang);
  const setLangLevel = useSoma((s) => s.setLangLevel);
  const removeLang = useSoma((s) => s.removeLang);
  const learnWord = useSoma((s) => s.learnWord);
  const unlearnWord = useSoma((s) => s.unlearnWord);

  const [adding, setAdding] = useState(false);
  const today = getLocalDateKey(new Date());
  const draws = useMemo(() => drawAll(langs, today), [langs, today]);

  const missing = LANGUAGES.filter((m) => !langs.some((l) => l.code === m.code));

  return (
    <>
      <Card key="languages">
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">Learning</CardTitle>
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[0.7rem] font-bold"
            >
              Add a language
            </button>
          )}
        </div>

        {langs.length === 0 ? (
          <p className="text-xs leading-snug text-faint">
            Nothing yet. Add a language and you get one new word in it every day,
            drawn from a core list — the same word all day, so it has a chance to
            stick.
          </p>
        ) : (
          <div className="space-y-1.5">
            {langs.map((l) => {
              const meta = LANGUAGES.find((m) => m.code === l.code);
              const pct = progress(l);
              return (
                <div
                  key={l.code}
                  className="rounded-xl border border-border bg-surface-2 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg leading-none">{meta?.flag}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {meta?.name ?? l.code}
                    </span>
                    <span className="shrink-0 text-[0.65rem] font-bold tabular text-faint">
                      {l.learned.length}/{(draws.find((d) => d.code === l.code)?.total) ?? 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        removeLang(l.code);
                        toast.success(`${meta?.name} removed`);
                      }}
                      className="shrink-0 text-faint"
                      aria-label={`Stop learning ${meta?.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {LEVELS.map((lv) => (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => setLangLevel(l.code, lv)}
                        aria-label={`Set ${meta?.name} to ${lv}`}
                        className={cn(
                          "h-7 w-9 rounded-full text-[0.65rem] font-extrabold",
                          l.level === lv
                            ? "bg-accent text-accent-ink"
                            : "border border-border bg-surface-3 text-faint",
                        )}
                      >
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {adding && (
          <div
            className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/60"
            role="dialog"
            aria-modal="true"
            aria-label="Add a language"
            onClick={() => setAdding(false)}
          >
            <div
              className="soma-expand rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="font-display text-base font-extrabold">Add a language</span>
                <button type="button" onClick={() => setAdding(false)} aria-label="Close">
                  <X className="size-5 text-muted" />
                </button>
              </div>
              <div className="space-y-1.5">
                {missing.map((m) => (
                  <button
                    key={m.code}
                    type="button"
                    onClick={() => {
                      addLang(m.code, "A1");
                      setAdding(false);
                      toast.success(`${m.name} added — a word a day from now`);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left"
                  >
                    <span className="text-lg leading-none">{m.flag}</span>
                    <span className="flex-1 text-sm font-bold">{m.name}</span>
                    <Plus className="size-4 text-faint" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      {draws.length > 0 && (
        <Card key="wordofday">
          <CardTitle>Today&apos;s words</CardTitle>
          <div className="space-y-2">
            {draws.map((d) => {
              const meta = LANGUAGES.find((m) => m.code === d.code);
              const track = langs.find((l) => l.code === d.code);
              const doneToday = !d.word;
              return (
                <div
                  key={d.code}
                  className={cn(
                    "rounded-2xl border px-3 py-3",
                    doneToday ? "border-border bg-surface-2" : "border-accent-line bg-accent-soft",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-faint">
                    <span>{meta?.flag}</span>
                    {meta?.name}
                    <span className="ml-auto tabular">{d.left} to go</span>
                  </div>

                  {d.word ? (
                    <>
                      <div className="mt-1 font-display text-2xl font-extrabold leading-tight">
                        {d.word.w}
                      </div>
                      {d.word.r && (
                        <div className="text-xs font-bold text-muted">{d.word.r}</div>
                      )}
                      <div className="mt-0.5 text-sm text-muted">{d.word.en}</div>
                      <Button
                        variant="primary"
                        className="mt-2 w-full"
                        onClick={() => {
                          learnWord(d.code, d.word!.w);
                          toast.success(`${d.word!.w} learned`, {
                            action: {
                              label: "Undo",
                              onClick: () => unlearnWord(d.code, d.word!.w),
                            },
                          });
                        }}
                      >
                        <Check className="size-4" />
                        Got it
                      </Button>
                    </>
                  ) : (
                    <p className="mt-1 text-xs leading-snug text-muted">
                      Every word in the list is learned. Add your own words below, or
                      put one back to see it again.
                    </p>
                  )}

                  {(track?.learned.length ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const last = track!.learned[track!.learned.length - 1]!;
                        unlearnWord(d.code, last);
                        toast.success(`${last} back in the pool`);
                      }}
                      className="mt-2 flex items-center gap-1 text-[0.65rem] font-bold text-faint"
                    >
                      <Undo2 className="size-3" />
                      Put back the last one
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}
