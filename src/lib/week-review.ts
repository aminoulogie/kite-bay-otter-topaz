/**
 * The week, as what cost it most.
 *
 * Seven day scores already say how each day went; what they do not say is
 * WHY the week was a 64 and not an 85. Every score line is points earned out
 * of points possible, so the points a line lost across the week are simply
 * added up — and the two or three biggest losses are the week's story.
 */
import type { DayScore } from "./day-score.ts";

export interface WeekDay {
  date: string;
  score: DayScore;
}

export interface Cause {
  id: string;
  label: string;
  /** Points lost across the week. */
  lost: number;
  /** Days this line cost something. */
  days: number;
  text: string;
}

export interface WeekReview {
  average: number | null;
  scored: number;
  best: { date: string; score: number } | null;
  worst: { date: string; score: number } | null;
  causes: Cause[];
  /** Days with nothing logged at all. */
  blank: number;
}

const PHRASE: Record<string, (days: number) => string> = {
  workout: (d) => `${d} training ${d === 1 ? "day" : "days"} skipped`,
  completion: (d) => `sets left undone on ${d} ${d === 1 ? "day" : "days"}`,
  effort: (d) => `sets not pushed hard enough on ${d} ${d === 1 ? "day" : "days"}`,
  progression: (d) => `no progress on lifts ${d} ${d === 1 ? "time" : "times"}`,
  coverage: (d) => `muscles missed on ${d} ${d === 1 ? "day" : "days"}`,
  protein: (d) => `protein under target ${d} ${d === 1 ? "day" : "days"}`,
  calories: (d) => `calories off target ${d} ${d === 1 ? "day" : "days"}`,
  sleep: (d) => `short sleep ${d} ${d === 1 ? "night" : "nights"}`,
  creatine: (d) => `creatine missed ${d} ${d === 1 ? "day" : "days"}`,
  preworkout: (d) => `under-fuelled before training ${d} ${d === 1 ? "time" : "times"}`,
  habits: (d) => `habits below par ${d} ${d === 1 ? "day" : "days"}`,
};

export function reviewWeek(days: WeekDay[], top = 3): WeekReview {
  const scored = days.filter((d) => d.score.tracked > 0);
  const lost = new Map<string, { label: string; lost: number; days: number }>();
  for (const d of scored) {
    for (const l of d.score.lines) {
      if (l.earned == null) continue;
      const gap = l.possible - l.earned;
      // Under a fifth of a line is noise, not a cause.
      if (gap < l.possible * 0.2) continue;
      const cur = lost.get(l.id) ?? { label: l.label, lost: 0, days: 0 };
      cur.lost += gap;
      cur.days += 1;
      lost.set(l.id, cur);
    }
  }
  const causes = [...lost.entries()]
    .map(([id, c]) => ({
      id,
      label: c.label,
      lost: Math.round(c.lost * 10) / 10,
      days: c.days,
      text: (PHRASE[id] ?? ((n: number) => `${c.label.toLowerCase()} short ${n} days`))(c.days),
    }))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, top);

  const byScore = [...scored].sort((a, b) => b.score.score - a.score.score);
  return {
    average: scored.length ? Math.round(scored.reduce((t, d) => t + d.score.score, 0) / scored.length) : null,
    scored: scored.length,
    best: byScore[0] ? { date: byScore[0].date, score: byScore[0].score.score } : null,
    worst: byScore.length > 1 ? { date: byScore.at(-1)!.date, score: byScore.at(-1)!.score.score } : null,
    causes,
    blank: days.length - scored.length,
  };
}
