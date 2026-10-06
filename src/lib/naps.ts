/**
 * Naps: sleep that isn't the night.
 *
 * Kept beside the night rather than folded into its hours, so logging the
 * night again never wipes a nap, and each nap can be removed on its own.
 * Everything that asks "how much did you sleep" — readiness, the day score,
 * sleep debt, the sleep habit, charts and reports — reads the total. What
 * asks "did you log last night" still reads the night alone: a nap is not a
 * night, and Apple Health gets the night only.
 */

export interface Nap {
  id: string;
  minutes: number;
  /** When it started (ms). */
  at: number;
}

type WithSleep = { sleep?: { hours: number } | null; naps?: Nap[] | null } | null | undefined;

export const newNapId = () => `nap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function napMinutes(day: WithSleep): number {
  return (day?.naps ?? []).reduce((a, n) => a + (Number(n.minutes) > 0 ? Number(n.minutes) : 0), 0);
}

/** Night plus naps, in hours; null when neither was logged. */
export function totalSleepHours(day: WithSleep): number | null {
  const night = day?.sleep?.hours;
  const nap = napMinutes(day);
  if (night == null && nap === 0) return null;
  return Math.round(((night ?? 0) + nap / 60) * 100) / 100;
}

/** "1h 30m", "45m". */
export function napLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** A backup's naps made safe. */
export function asNaps(raw: unknown): Nap[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((n) => n && typeof n.id === "string" && Number(n.minutes) > 0 && Number(n.minutes) <= 600)
    .map((n) => ({ id: n.id as string, minutes: Number(n.minutes), at: Number(n.at) || 0 }));
  return out.length ? out : undefined;
}
