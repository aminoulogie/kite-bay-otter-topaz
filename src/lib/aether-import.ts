/**
 * Reading scan results out of Aether.
 *
 * Typing two numbers off another app's screen is not a bridge, it is a
 * transcription error waiting to happen. This parses a file Aether exports so
 * a run of scans lands here in one go.
 *
 * The format is deliberately loose about SHAPE and strict about VALUES,
 * because the two apps are versioned separately and I do not control Aether's
 * exporter. Any of these are accepted:
 *
 *   { "scans": [ { "date": "2026-09-08", "evenness": 94.2, "cva": 52 } ] }
 *   [ { "date": "...", "alpha": 0.058, "cvaDeg": 52.4 } ]
 *   { "data": { "scans": [ ... ] } }
 *
 * Field names are matched across the spellings the Aether work actually used —
 * alpha is the raw Procrustes distance, evenness is its display form — and a
 * row missing both readings is skipped rather than imported blank.
 *
 * Nothing here computes a reading. A file that does not carry one does not get
 * one invented for it.
 */

export interface AetherScan {
  date: string;
  /** 0-100 display form. Derived from alpha only if the file gives alpha. */
  evenness?: number;
  /** Craniovertebral angle in degrees. */
  cva?: number;
}

export interface AetherParse {
  scans: AetherScan[];
  /** Rows that were present but unusable, so the count is never silently short. */
  skipped: number;
  reason?: string;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** The first present key out of several spellings. */
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null) return row[k];
  }
  return undefined;
}

/** A date key, from an ISO date or an ISO timestamp. */
function dateOf(row: Record<string, unknown>): string | undefined {
  const raw = pick(row, ["date", "day", "capturedAt", "takenAt", "ts", "timestamp"]);
  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
  }
  if (typeof raw !== "string") return undefined;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

/**
 * Evenness from whichever the file carries.
 *
 * Alpha is a Procrustes distance — smaller is more even — so a file giving
 * alpha is converted the way Aether displays it, and one already giving
 * evenness is taken as-is. Converting a number that is already a percentage
 * would halve it silently.
 */
function evennessOf(row: Record<string, unknown>): number | undefined {
  const direct = num(pick(row, ["evenness", "evennessPct", "symmetry"]));
  if (direct != null) return direct >= 0 && direct <= 100 ? Math.round(direct * 10) / 10 : undefined;
  const alpha = num(pick(row, ["alpha", "procrustes", "procrustesDistance"]));
  if (alpha == null || alpha < 0 || alpha > 1) return undefined;
  return Math.round((100 - alpha * 100) * 10) / 10;
}

function rowsOf(parsed: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  for (const key of ["scans", "faceFiles", "records", "entries"]) {
    if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
  }
  // One level of nesting, which is where a wrapped export usually puts it.
  if (obj.data && typeof obj.data === "object") return rowsOf(obj.data);
  return null;
}

export function parseAether(raw: string): AetherParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { scans: [], skipped: 0, reason: "That file is not valid JSON." };
  }

  const rows = rowsOf(parsed);
  if (!rows) {
    return {
      scans: [],
      skipped: 0,
      reason: "No scans found. Expecting a list, or an object with a \"scans\" array.",
    };
  }

  const scans: AetherScan[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      skipped++;
      continue;
    }
    const date = dateOf(row);
    const evenness = evennessOf(row);
    const cvaRaw = num(pick(row, ["cva", "cvaDeg", "craniovertebralAngle"]));
    const cva = cvaRaw != null && cvaRaw > 0 && cvaRaw < 180 ? Math.round(cvaRaw * 10) / 10 : undefined;
    // A row with a date and no reading is not a scan, it is a blank.
    if (!date || (evenness == null && cva == null)) {
      skipped++;
      continue;
    }
    scans.push({ date, evenness, cva });
  }

  // Newest first, which is the order they are shown in.
  scans.sort((a, b) => b.date.localeCompare(a.date));
  return { scans, skipped };
}

/** The line a scan is stored as, matching what the Looks tab writes by hand. */
export function scanTitle(scan: AetherScan): string {
  const parts = [
    scan.evenness != null ? `evenness ${scan.evenness}` : null,
    scan.cva != null ? `CVA ${scan.cva}°` : null,
  ].filter(Boolean);
  return `Scan · ${parts.join(" · ")}`;
}
