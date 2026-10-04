/**
 * "Going to sleep" and "I'm up", turned into a night.
 *
 * The night is filed under the day you woke up on — the same day the app's
 * "sleep last night" means — and anything implausible is refused rather than
 * logged: a forgotten "I'm up" a day later is not a 30-hour night, and a
 * double tap is not a nap.
 */
export const MIN_NIGHT_H = 0.5;
export const MAX_NIGHT_H = 16;

export interface Night {
  date: string;
  hours: number;
  start: number;
  end: number;
}

const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function nightFrom(start: number, end: number): Night | { error: string } {
  const hours = (end - start) / 3_600_000;
  if (!(hours > 0)) return { error: "Woke before going to sleep" };
  if (hours < MIN_NIGHT_H) return { error: "Under half an hour — not logged" };
  if (hours > MAX_NIGHT_H) return { error: "Over 16 hours — a forgotten tap? Log that night by hand" };
  return { date: dayKey(end), hours: Math.round(hours * 10) / 10, start, end };
}

export interface Tap {
  kind: "sleep" | "wake";
  at: number;
}

/**
 * Replay taps (from the widget) on top of a night already in progress.
 * Returns the nights they complete and whether a night is still running.
 */
export function replayTaps(
  startedAt: number | undefined,
  taps: Tap[],
): { nights: Night[]; refused: string[]; asleepSince: number | undefined } {
  const nights: Night[] = [];
  const refused: string[] = [];
  let start = startedAt;
  for (const t of [...taps].sort((a, b) => a.at - b.at)) {
    if (t.kind === "sleep") {
      start = t.at;
    } else if (start != null) {
      const n = nightFrom(start, t.at);
      if ("error" in n) refused.push(n.error);
      else nights.push(n);
      start = undefined;
    }
  }
  return { nights, refused, asleepSince: start };
}
