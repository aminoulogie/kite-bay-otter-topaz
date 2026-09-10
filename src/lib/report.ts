/**
 * A block, written down so it can leave the phone.
 *
 * Everything in this app is deliberately local — no account, no sync, nothing
 * uploaded. That is the right default and it has one cost: there is no way to
 * show anyone what you did. Not a coach, not a training partner, not yourself
 * in a year when the phone has been replaced.
 *
 * So a report is assembled here as PLAIN DATA, and the screen that renders it
 * is printable. iOS's print sheet offers "Save to Files" as a PDF and AirDrop,
 * which is a full PDF export and a share sheet for no dependency and no
 * network — a PDF library would be several hundred kilobytes to do worse.
 *
 * The figures come from the same functions the app reasons with. A report that
 * recomputed its own numbers would eventually disagree with the screen it came
 * from, and then neither could be trusted.
 */

import { lastNDays } from "./coach-brief.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

export interface ReportLine {
  label: string;
  value: string;
  /** Shown smaller underneath, when a figure needs its context. */
  note?: string;
}

export interface ReportSection {
  title: string;
  lines: ReportLine[];
  /** Said instead of the lines when there is nothing honest to put in them. */
  empty?: string;
}

export interface Report {
  title: string;
  from: string;
  to: string;
  days: number;
  sections: ReportSection[];
  /** One paragraph, for a share sheet that cannot carry a layout. */
  summary: string;
}

export interface ReportInput {
  today: string;
  days: number;
  history: Record<string, HistorySession>;
  nutrition: Record<string, NutritionDay>;
  /** est1RM, injected so this file stays free of the engine. */
  estimate1RM: (weight: number, reps: number) => number;
  unit?: string;
}

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function buildReport(input: ReportInput): Report {
  const window = lastNDays(input.today, Math.max(1, input.days));
  const from = window[0]!;
  const to = window[window.length - 1]!;
  const inWindow = new Set(window);
  const unit = input.unit ?? "kg";

  // ---- training
  const sessions = Object.entries(input.history)
    .filter(([d, s]) => inWindow.has(d) && (s?.exercises?.length ?? 0) > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

  let sets = 0;
  let volume = 0;
  const byLift = new Map<string, { first: number; last: number; date: string }>();

  for (const [date, session] of sessions) {
    for (const ex of session?.exercises ?? []) {
      let best = 0;
      for (const s of ex.sets ?? []) {
        if (!s.done || s.type === "warmup") continue;
        sets++;
        const raw = Number(s.weight) || 0;
        const w = ex.usesBar && raw > 0 ? (ex.barWeight || 20) + raw : raw;
        volume += w * (Number(s.reps) || 0);
        const est = input.estimate1RM(w, Number(s.reps) || 0);
        if (est > best) best = est;
      }
      if (best <= 0) continue;
      const seen = byLift.get(ex.name);
      // First reading is kept, last is replaced: the pair IS the change.
      if (!seen) byLift.set(ex.name, { first: best, last: best, date });
      else byLift.set(ex.name, { ...seen, last: best, date });
    }
  }

  const moved = [...byLift.entries()]
    .filter(([, v]) => v.first > 0)
    .map(([name, v]) => ({ name, pct: round(((v.last - v.first) / v.first) * 100), to: round(v.last) }))
    .sort((a, b) => b.pct - a.pct);

  // ---- body
  const weights = window
    .map((d) => ({ d, w: input.nutrition[d]?.bodyWeight }))
    .filter((x): x is { d: string; w: number } => typeof x.w === "number" && x.w > 0);

  // ---- nutrition, judged only over the days actually logged
  const fed = window
    .map((d) => input.nutrition[d])
    .filter((n): n is NutritionDay => !!n?.items?.length);
  const meanKcal = fed.length
    ? Math.round(fed.reduce((a, n) => a + n.items.reduce((b, i) => b + (i.cals || 0), 0), 0) / fed.length)
    : null;
  const meanProtein = fed.length
    ? Math.round(fed.reduce((a, n) => a + n.items.reduce((b, i) => b + (i.p || 0), 0), 0) / fed.length)
    : null;

  const nights = window
    .map((d) => input.nutrition[d]?.sleep?.hours)
    .filter((h): h is number => typeof h === "number" && h > 0);
  const meanSleep = nights.length
    ? round(nights.reduce((a, b) => a + b, 0) / nights.length)
    : null;

  const sections: ReportSection[] = [
    {
      title: "Training",
      empty: sessions.length ? undefined : "No sessions logged in this window.",
      lines: sessions.length
        ? [
            { label: "Sessions", value: String(sessions.length), note: `${round(sessions.length / (input.days / 7))} a week` },
            { label: "Working sets", value: String(sets) },
            { label: "Volume", value: `${Math.round(volume).toLocaleString()} ${unit}`, note: "load × reps, warm-ups excluded" },
          ]
        : [],
    },
    {
      title: "Strength",
      empty: moved.length ? undefined : "No lift was logged twice, so nothing can be compared.",
      lines: moved.slice(0, 8).map((m) => ({
        label: m.name,
        value: `${m.pct > 0 ? "+" : ""}${m.pct}%`,
        note: `now ${m.to}${unit} estimated 1RM`,
      })),
    },
    {
      title: "Body",
      empty: weights.length >= 2 ? undefined : "Fewer than two weigh-ins — no change to report.",
      lines:
        weights.length >= 2
          ? [
              {
                label: "Bodyweight",
                value: `${round(weights[weights.length - 1]!.w - weights[0]!.w)} ${unit}`,
                note: `${round(weights[0]!.w)} → ${round(weights[weights.length - 1]!.w)} across ${weights.length} weigh-ins`,
              },
            ]
          : [],
    },
    {
      title: "Nutrition and sleep",
      empty: fed.length || nights.length ? undefined : "Nothing logged.",
      lines: [
        ...(meanKcal != null
          ? [{ label: "Calories", value: `${meanKcal} kcal`, note: `mean of ${fed.length} logged days` }]
          : []),
        ...(meanProtein != null ? [{ label: "Protein", value: `${meanProtein} g` }] : []),
        ...(meanSleep != null
          ? [{ label: "Sleep", value: `${meanSleep} h`, note: `mean of ${nights.length} nights` }]
          : []),
      ],
    },
  ];

  const best = moved[0];
  const summary = [
    `SOMA · ${from} to ${to}`,
    sessions.length ? `${sessions.length} sessions, ${sets} working sets.` : "No sessions logged.",
    best && best.pct > 0 ? `${best.name} up ${best.pct}%.` : null,
    weights.length >= 2
      ? `Bodyweight ${round(weights[weights.length - 1]!.w - weights[0]!.w)}${unit}.`
      : null,
    meanProtein != null ? `${meanProtein}g protein a day.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: `${input.days} days`,
    from,
    to,
    days: input.days,
    sections,
    summary,
  };
}
