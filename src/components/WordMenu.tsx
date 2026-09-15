import { useEffect, useRef, useState } from "react";
import {
  BookOpen, Check, Copy, Highlighter, Languages, Loader2, Star, Trash2,
} from "lucide-react";
import { MARK_COLOURS, type BookMark } from "@/lib/marks";
import { lookupWord, type WordLookup } from "@/lib/lookup";
import { languageLabel, translateText } from "@/lib/translate";
import type { themeSpec } from "@/lib/reader-prefs";
import { cn } from "@/lib/utils";

/**
 * What you do with a word you have just put your finger on.
 *
 * Highlighting a word used to file it in the word book and that was the whole
 * of it — one action, chosen for you, taken before you could say otherwise.
 * Which is right for the one thing you do most often and wrong for every other
 * thing you might have meant: copy it, mark it, find out what it means, find
 * out what it is in another language, keep it.
 *
 * So the selection asks. Five things, in a bar over the word, close enough to
 * your thumb that none of them is a journey — and every one of them is one tap
 * from the word being selected, because a menu that takes two taps to reach
 * anything is a menu you stop opening.
 *
 * It is a bar and not a sheet on purpose. A sheet covers the page, and the
 * whole point of every one of these actions is the sentence the word is
 * sitting in: you want to see it while you decide.
 */

export interface Pick {
  /** The word or phrase, already tidied by lib/word-capture. */
  text: string;
  /** The sentence around it, kept with anything this menu files. */
  example?: string;
  /**
   * Whether this is a WORD, as opposed to a passage.
   *
   * Only two of the five actions care. Keeping a sentence in a vocabulary list
   * and asking a dictionary to define one are both nonsense, so they are not
   * offered; copying, highlighting and translating a sentence are all things
   * you would obviously want, so they always are.
   */
  word: boolean;
  /** Where the words are, in the reader's own coordinates. */
  at: { x: number; y: number; w: number; h: number };
  /** The characters, so a highlight can outlive this page's layout. */
  start: number;
  end: number;
  /** An existing highlight under the selection, if there is one to rub out. */
  mark: BookMark | null;
}

type Panel = "none" | "ink" | "meaning" | "language";

export function WordMenu({
  pick, theme, translateTo, box, saved, onClose, onCopy, onMark, onUnmark, onSave, onTranslated,
}: {
  pick: Pick;
  theme: ReturnType<typeof themeSpec>;
  translateTo: string;
  /** The reader's page box, so the bar can stay inside it. */
  box: { w: number; h: number };
  /** Whether this word is already starred in the word book. */
  saved: boolean;
  onClose: () => void;
  onCopy: () => void;
  onMark: (colour: string) => void;
  onUnmark: (id: string) => void;
  onSave: () => void;
  onTranslated: (text: string, to: string) => void;
}) {
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<WordLookup | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The bar sits above the words, or below them when the words are near the
  // top of the page and there is no "above" to sit in.
  const BAR = 52;
  const GAP = 10;
  const below = pick.at.y < BAR + GAP + 12;
  const top = below ? pick.at.y + pick.at.h + GAP : pick.at.y - BAR - GAP;
  // Centred on the words, then pushed back inside the page. A menu with a
  // corner off the screen is a menu with a button you cannot press.
  const WIDTH = Math.min(box.w - 12, 330);
  const left = Math.max(6, Math.min(box.w - WIDTH - 6, pick.at.x + pick.at.w / 2 - WIDTH / 2));

  const ask = async (which: "meaning" | "language") => {
    setPanel(which);
    setTrouble(null);
    if (which === "meaning" && found) return;
    if (which === "language" && said) return;
    setBusy(true);
    const res =
      which === "meaning"
        ? await lookupWord(pick.text)
        : await translateText(pick.text, { to: translateTo });
    if (!alive.current) return;
    setBusy(false);
    if (!res.ok) {
      setTrouble(res.reason);
      return;
    }
    if (which === "meaning") setFound(res.value as WordLookup);
    else {
      const t = (res.value as { text: string }).text;
      setSaid(t);
      onTranslated(t, translateTo);
    }
  };

  // Opaque, not glass. A translucent bar over a page of text is a bar with
  // the page's own words printed through its labels, and the one thing this
  // has to be is readable while sitting on top of exactly that.
  const chrome = {
    background: theme.dark ? "#1f1f22" : "#fcfbf8",
    color: theme.fg,
    boxShadow: theme.dark
      ? "0 12px 34px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.12) inset"
      : "0 12px 34px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.08) inset",
  };

  return (
    <>
      {/* Anywhere else on the page puts the menu away and leaves the word
          alone. No dimming: the sentence stays readable, which is the reason
          the menu is a bar rather than a sheet. */}
      <div
        className="absolute inset-0 z-[60]"
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className="absolute z-[61] select-none"
        style={{ left, top, width: WIDTH }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl" style={chrome}>
          {panel === "ink" ? (
            <div className="flex items-center gap-1 px-2 py-2">
              {MARK_COLOURS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={`Highlight in ${c.label}`}
                  onClick={() => onMark(c.id)}
                  className="grid h-10 flex-1 place-items-center rounded-xl active:scale-95"
                  style={{ background: c.chip }}
                >
                  {pick.mark?.colour === c.id && <Check className="size-4 text-black/70" />}
                </button>
              ))}
              {pick.mark && (
                <button
                  type="button"
                  aria-label="Remove this highlight"
                  onClick={() => onUnmark(pick.mark!.id)}
                  className="grid size-10 shrink-0 place-items-center rounded-xl active:scale-95"
                  style={{ background: `${theme.fg}14` }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-stretch px-1 py-1">
              <Act label="Copy" icon={<Copy className="size-[1.05rem]" />} theme={theme} onClick={onCopy} />
              <Act
                label="Highlight"
                icon={<Highlighter className="size-[1.05rem]" />}
                theme={theme}
                on={!!pick.mark}
                onClick={() => setPanel("ink")}
              />
              {pick.word && (
                <Act
                  label="Look up"
                  icon={<BookOpen className="size-[1.05rem]" />}
                  theme={theme}
                  on={panel === "meaning"}
                  onClick={() => void ask("meaning")}
                />
              )}
              <Act
                label={languageLabel(translateTo)}
                icon={<Languages className="size-[1.05rem]" />}
                theme={theme}
                on={panel === "language"}
                onClick={() => void ask("language")}
              />
              {pick.word && (
                <Act
                  label="Keep"
                  icon={<Star className={cn("size-[1.05rem]", saved && "fill-current")} />}
                  theme={theme}
                  on={saved}
                  onClick={onSave}
                />
              )}
            </div>
          )}
        </div>

        {/* The small window: what the word means, or what it is in the other
            language. Under the bar rather than over it, so the bar never
            jumps out from under a thumb that is already on its way down. */}
        {(panel === "meaning" || panel === "language") && (
          <div
            className="mt-2 max-h-[38vh] overflow-y-auto overscroll-contain rounded-2xl px-3 py-2.5"
            style={chrome}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[0.92rem] font-bold">{pick.text}</span>
              {panel === "meaning" && found?.phonetic && (
                <span className="text-[0.72rem]" style={{ color: theme.faint }}>
                  {found.phonetic}
                </span>
              )}
              {panel === "language" && (
                <span className="text-[0.66rem] uppercase tracking-wide" style={{ color: theme.faint }}>
                  {languageLabel(translateTo)}
                </span>
              )}
            </div>

            {busy && (
              <div className="flex items-center gap-2 py-2 text-[0.78rem]" style={{ color: theme.faint }}>
                <Loader2 className="size-3.5 animate-spin" /> Looking…
              </div>
            )}

            {!busy && trouble && (
              <p className="py-1.5 text-[0.78rem] leading-snug" style={{ color: theme.faint }}>
                {trouble}
              </p>
            )}

            {!busy && !trouble && panel === "language" && said && (
              <p className="pt-1 text-[1.05rem] leading-snug">{said}</p>
            )}

            {!busy && !trouble && panel === "meaning" && found && (
              <ol className="space-y-1.5 pt-1.5">
                {found.senses.map((s, i) => (
                  <li key={i} className="text-[0.82rem] leading-snug">
                    {s.partOfSpeech && (
                      <span className="mr-1 italic" style={{ color: theme.faint }}>
                        {s.partOfSpeech}
                      </span>
                    )}
                    {s.definition}
                    {s.example && (
                      <span className="block pt-0.5 italic" style={{ color: theme.faint }}>
                        “{s.example}”
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** One action: an icon with its name under it, because an icon alone guesses. */
function Act({
  label, icon, theme, on, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  theme: ReturnType<typeof themeSpec>;
  on?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 active:scale-95"
      style={on ? { background: `${theme.fg}16` } : undefined}
    >
      {icon}
      <span className="w-full truncate text-center text-[0.58rem] font-semibold tracking-tight">
        {label}
      </span>
    </button>
  );
}
