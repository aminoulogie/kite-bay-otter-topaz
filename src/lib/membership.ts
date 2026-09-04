/**
 * Gym membership periods.
 *
 * Stored as a list of renewals rather than a single end date, because the end
 * date is a consequence of the last renewal, not a fact in its own right.
 * Keeping the history means a lapsed-then-renewed membership reads correctly
 * instead of overwriting itself, and the calendar can shade the periods that
 * were actually paid for.
 *
 * Both ways of entering one land in the same record: "30 days from today"
 * computes the end, and a date typed directly sets it.
 */

export interface MembershipPeriod {
  id: string;
  /** ISO date the period starts. */
  start: string;
  /** ISO date it ends, inclusive. */
  end: string;
  note?: string;
}

export const MEMBERSHIP_KEY = "soma-membership";

export function loadPeriods(): MembershipPeriod[] {
  try {
    const raw = localStorage.getItem(MEMBERSHIP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is MembershipPeriod =>
        !!p && typeof p.start === "string" && typeof p.end === "string" && typeof p.id === "string",
    );
  } catch {
    return [];
  }
}

export function savePeriods(periods: MembershipPeriod[]): void {
  try {
    localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(periods));
  } catch {
    /* a full store must not break logging a renewal */
  }
}

export function isoDate(d: Date): string {
  // Local date, not UTC: toISOString() would roll over an evening into
  // tomorrow for anyone east of Greenwich.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

/** "30 days starting from X" — the duration form. */
export function periodFromDuration(start: string, days: number, note?: string): MembershipPeriod {
  return {
    id: `${start}-${days}-${Math.random().toString(36).slice(2, 7)}`,
    start,
    // A 30-day membership starting today includes today, so it ends on day 29.
    end: addDays(start, Math.max(0, days - 1)),
    note,
  };
}

/** An end date typed directly. */
export function periodFromEnd(start: string, end: string, note?: string): MembershipPeriod {
  return { id: `${start}-${end}-${Math.random().toString(36).slice(2, 7)}`, start, end, note };
}

export function currentPeriod(periods: MembershipPeriod[], today = isoDate(new Date())) {
  return periods.find((p) => p.start <= today && today <= p.end) ?? null;
}

/** The period that ends furthest in the future — what a countdown should show. */
export function latestPeriod(periods: MembershipPeriod[]): MembershipPeriod | null {
  if (!periods.length) return null;
  return [...periods].sort((a, b) => (a.end < b.end ? 1 : -1))[0]!;
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const a = Date.UTC(y1!, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2!, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((b - a) / 86400000);
}

export interface MembershipStatus {
  period: MembershipPeriod | null;
  daysLeft: number | null;
  expired: boolean;
}

export function membershipStatus(
  periods: MembershipPeriod[],
  today = isoDate(new Date()),
): MembershipStatus {
  const latest = latestPeriod(periods);
  if (!latest) return { period: null, daysLeft: null, expired: false };
  const left = daysBetween(today, latest.end);
  return { period: latest, daysLeft: left, expired: left < 0 };
}

export function isCovered(periods: MembershipPeriod[], date: string): boolean {
  return periods.some((p) => p.start <= date && date <= p.end);
}
