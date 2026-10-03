/**
 * Screen Time, as the text an Apple Shortcut read off a screenshot of it.
 *
 * iOS will not give the numbers to an app (see screen-time.ts), but the
 * Shortcuts app can screenshot the Screen Time page and run "Extract Text from
 * Image" on it, on the phone. The shortcut hands that text to
 * soma://screentime?text=…, and this turns it back into a day.
 *
 * OCR text comes out one label per line, in reading order. The big total sits
 * above the bar chart, so the first duration on the page is the total, and the
 * chart's axis labels ("60m", "30m") come after it. Apps are the name/duration
 * pairs under "Most used".
 */

import type { ScreenApp } from "./screen-time.ts";
import { clampMinutes } from "./screen-time.ts";

export interface ScreenImport {
  total: number;
  apps: ScreenApp[];
  pickups?: number;
  /** The page said "Yesterday" rather than "Today". */
  yesterday: boolean;
  /** The page was the week view: the number is a daily average, not one day. */
  average: boolean;
}

const DURATION = /^(?:(\d{1,2})\s*h(?:r|rs)?\s*)?(?:(\d{1,2})\s*m(?:in)?)?\s*(?:(\d{1,2})\s*s)?$/i;

/** "3h 25m", "3 h 25 min", "45m", "1h" → minutes; anything else → null. */
export function readDuration(line: string): number | null {
  const s = line.trim().replace(/\u00a0/g, " ");
  if (!s || !/\d/.test(s)) return null;
  const m = s.match(DURATION);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return clampMinutes(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + (m[3] ? Number(m[3]) / 60 : 0));
}

const MOST_USED = /most used|les plus utilis|más usad|meistgenutzt|più usat/i;
const NOT_AN_APP =
  /^(view options|options|show|afficher|mostrar|see all|tout afficher|limits?|categories|catégories|pickups?|prises en main|notifications?|screen time|temps d['’]écran|today|aujourd|yesterday|hier|daily average|moyenne|total|week|semaine|day|jour|updated|mis à jour|\d)/i;

export function parseScreenTimeText(text: string): ScreenImport | null {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    // OCR reads an app's usage bar as dashes or bars before its number.
    .map((l) => l.replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const yesterday = lines.some((l) => /^(yesterday|hier)\b/i.test(l));
  const average = lines.some((l) => /daily average|moyenne quotidienne/i.test(l));

  // The total: the first line that is only a duration, or a "Today, 3h 25m"
  // style line carrying one at its end.
  let total: number | null = null;
  let totalAt = -1;
  for (let i = 0; i < lines.length && total == null; i++) {
    const own = readDuration(lines[i]!);
    if (own != null && own > 0) {
      total = own;
      totalAt = i;
      break;
    }
    const tail = lines[i]!.match(/(\d{1,2}\s*h(?:\s*\d{1,2}\s*m(?:in)?)?|\d{1,2}\s*m(?:in)?)$/i);
    if (tail && /today|aujourd|yesterday|hier|average|moyenne|screen time|temps/i.test(lines[i]!)) {
      const v = readDuration(tail[1]!);
      if (v != null && v > 0) {
        total = v;
        totalAt = i;
      }
    }
  }
  if (total == null) return null;

  // Apps: name then duration, either on one line or two.
  const from = Math.max(totalAt + 1, lines.findIndex((l) => MOST_USED.test(l)) + 1);
  const apps: ScreenApp[] = [];
  const seen = new Set<string>();
  const add = (name: string, min: number) => {
    const n = name.replace(/[›>]+$/, "").trim();
    if (!n || n.length > 40 || NOT_AN_APP.test(n) || !/[a-zA-ZÀ-ÿ]/.test(n) || seen.has(n.toLowerCase())) return;
    if (min <= 0 || min > total!) return;
    seen.add(n.toLowerCase());
    apps.push({ name: n, min: Math.round(min) });
  };
  for (let i = from; i < lines.length && apps.length < 8; i++) {
    const line = lines[i]!;
    if (readDuration(line) != null) continue;
    const same = line.match(/^(.*?\D)\s+(\d{1,2}\s*h(?:\s*\d{1,2}\s*m(?:in)?)?|\d{1,2}\s*m(?:in)?)$/i);
    if (same) {
      add(same[1]!, readDuration(same[2]!) ?? 0);
      continue;
    }
    const next = lines[i + 1] ? readDuration(lines[i + 1]!) : null;
    if (next != null) {
      add(line, next);
      i++;
    }
  }
  apps.sort((a, b) => b.min - a.min);

  // "Total Pickups 85", "85 pickups", or a bare number under the heading —
  // never the clock in "First Pickup 07:12".
  let pickups: number | undefined;
  const pick =
    text.match(/total\s+(?:pickups?|prises en main)\D{0,6}(\d{1,4})/i) ??
    text.match(/(\d{1,4})\s+(?:pickups?|prises en main)/i);
  if (pick) pickups = Number(pick[1]);
  else {
    const at = lines.findIndex((l) => /^(pickups?|prises en main)$/i.test(l));
    const n = at >= 0 ? lines[at + 1]?.match(/^(\d{1,4})$/) : null;
    if (n) pickups = Number(n[1]);
  }

  return { total, apps, pickups, yesterday, average };
}

/** The text out of a soma://screentime?text=… link, or null for any other link. */
export function textFromLink(url: string): string | null {
  try {
    const u = new URL(url);
    const where = (u.host || u.pathname.replace(/^\/+/, "")).toLowerCase();
    if (u.protocol !== "soma:" || !where.startsWith("screentime")) return null;
    return u.searchParams.get("text") ?? "";
  } catch {
    return null;
  }
}
