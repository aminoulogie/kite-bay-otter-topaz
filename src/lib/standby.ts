/**
 * Standby: the time between shifts for the same client on the same day.
 *
 * A working day is a window, from the first shift's start to the last one's
 * end. The time worked inside it is paid at the client's rate; the rest of the
 * window (the gaps between shifts, and breaks) is standby — on call, not free
 * — and is paid at half the rate.
 */
import { shiftDay, workedMs, type Shift } from "./worklog.ts";

export const STANDBY_SHARE = 0.5;

export interface ClientDays {
  workedMs: number;
  standbyMs: number;
  days: number;
}

/** Worked and standby time per client, over shifts starting in [from, to] (date keys, inclusive). */
export function standbyByClient(shifts: readonly Shift[], from?: string, to?: string, now = Date.now()): Map<string, ClientDays> {
  const groups = new Map<string, Shift[]>();
  for (const s of shifts) {
    const d = shiftDay(s);
    if ((from && d < from) || (to && d > to)) continue;
    const k = `${s.client}\u0000${d}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const out = new Map<string, ClientDays>();
  for (const [k, day] of groups) {
    const client = k.split("\u0000")[0]!;
    const start = Math.min(...day.map((s) => s.start));
    const end = Math.max(...day.map((s) => Math.min(s.end ?? now, now)));
    const worked = day.reduce((a, s) => a + workedMs(s, now), 0);
    const r = out.get(client) ?? { workedMs: 0, standbyMs: 0, days: 0 };
    r.workedMs += worked;
    r.standbyMs += Math.max(0, end - start - worked);
    r.days++;
    out.set(client, r);
  }
  return out;
}

/** What a client owes for worked and standby time at `rate` an hour. */
export function owed(r: Pick<ClientDays, "workedMs" | "standbyMs">, rate: number): number {
  return ((r.workedMs + r.standbyMs * STANDBY_SHARE) / 3_600_000) * rate;
}
