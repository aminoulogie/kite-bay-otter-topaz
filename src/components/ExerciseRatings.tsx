import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rateExerciseInstance, ratingLabel, ratingTone } from "@/lib/stimulus";
import { useSoma } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { HistorySession } from "@/lib/types";

/**
 * Every exercise, scored from the sets you actually rated on it.
 *
 * The set sheet has been collecting four answers per set and showing nothing
 * back, so there was no way to see what you had said about a lift — which makes
 * filling it in feel pointless. This is where those answers land.
 *
 * Distinct from the /10 in the Database, which asks a different question: that
 * one rates the MOVEMENT over its whole history — is this exercise worth your
 * time — while this rates the WORK, how hard the sets you did on it actually
 * were. A lift can be an excellent movement you keep coasting through.
 *
 * Searchable, because the list is as long as your exercise vocabulary and
 * scrolling it to find one lift is not an answer.
 */

interface Row {
  name: string;
  score: number;
  sessions: number;
  ratedSets: number;
  last: { date: string; score: number } | null;
  /** Most recent first, for the trend line. */
  history: { date: string; score: number }[];
}

function buildRows(history: Record<string, HistorySession>): Row[] {
  const byName = new Map<string, { date: string; score: number; sets: number }[]>();

  for (const [date, session] of Object.entries(history ?? {})) {
    for (const ex of session?.exercises ?? []) {
      const rating = rateExerciseInstance(ex);
      if (rating.score == null) continue;
      const list = byName.get(ex.name) ?? [];
      list.push({ date, score: rating.score, sets: rating.ratedSets });
      byName.set(ex.name, list);
    }
  }

  const rows: Row[] = [];
  for (const [name, entries] of byName) {
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    const ratedSets = entries.reduce((t, e) => t + e.sets, 0);
    // Weighted by rated sets, so a session where you rated one set of five does
    // not carry the same as one where you rated all five.
    const weighted = entries.reduce((t, e) => t + e.score * e.sets, 0);
    rows.push({
      name,
      score: Math.round(weighted / Math.max(1, ratedSets)),
      sessions: entries.length,
      ratedSets,
      last: entries[0] ? { date: entries[0].date, score: entries[0].score } : null,
      history: entries.map((e) => ({ date: e.date, score: e.score })),
    });
  }

  return rows.sort((a, b) => b.score - a.score || b.ratedSets - a.ratedSets);
}

export function ExerciseRatings() {
  const history = useSoma((s) => s.history);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => buildRows(history), [history]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <Card>
      <CardTitle>
        <span>How hard you trained each lift</span>
        {rows.length > 0 && (
          <span className="text-[0.62rem] font-bold text-faint">{rows.length} rated</span>
        )}
      </CardTitle>

      <p className="mb-3 text-[0.66rem] leading-snug text-muted">
        Out of 100, from the sets you rated on each lift — how close to failure, which
        muscle gave out, technique, burn, then nudged by the pump. This is how hard the
        work was, not how good the exercise is.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface-2 px-3 py-5 text-center text-[0.7rem] leading-snug text-faint">
          Nothing rated yet. Tap <b className="text-muted">rate</b> on a set while you
          train and lifts appear here with a score.
        </p>
      ) : (
        <>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Search a lift"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {/* Scrolls inside itself so the page below stays put. */}
          <div className="max-h-[22rem] space-y-1 overflow-y-auto overscroll-contain">
            {matches.length === 0 && (
              <p className="px-1 py-4 text-center text-[0.7rem] text-faint">
                No rated lift matches “{query}”.
              </p>
            )}
            {matches.map((r) => {
              const isOpen = open === r.name;
              return (
                <div
                  key={r.name}
                  className="overflow-hidden rounded-xl border border-border bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : r.name)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.74rem] font-bold">{r.name}</div>
                      <div className="text-[0.6rem] text-faint">
                        {r.sessions} {r.sessions === 1 ? "session" : "sessions"} ·{" "}
                        {r.ratedSets} rated {r.ratedSets === 1 ? "set" : "sets"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "font-display text-sm font-extrabold tabular-nums",
                          ratingTone(r.score),
                        )}
                      >
                        {r.score}
                      </div>
                      <div className="text-[0.55rem] text-faint">{ratingLabel(r.score)}</div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="soma-expand border-t border-border px-3 py-2">
                      <div className="mb-1 text-[0.58rem] font-bold uppercase tracking-wide text-faint">
                        Session by session, newest first
                      </div>
                      <div className="max-h-40 space-y-0.5 overflow-y-auto overscroll-contain">
                        {r.history.map((h) => (
                          <div
                            key={h.date}
                            className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1"
                          >
                            <span className="text-[0.62rem] tabular-nums text-muted">
                              {new Date(h.date + "T00:00:00").toLocaleDateString(undefined, {
                                day: "2-digit",
                                month: "short",
                                year: "2-digit",
                              })}
                            </span>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                              <div
                                className="soma-bar h-full rounded-full bg-accent"
                                style={{ width: `${h.score}%` }}
                              />
                            </div>
                            <span
                              className={cn(
                                "w-7 shrink-0 text-right text-[0.62rem] font-bold tabular-nums",
                                ratingTone(h.score),
                              )}
                            >
                              {h.score}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
