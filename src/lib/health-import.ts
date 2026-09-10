/**
 * Getting Apple Health's data in, without the HealthKit entitlement.
 *
 * A live HealthKit connection needs the `com.apple.developer.healthkit`
 * entitlement, and this app is installed by signing an unsigned .ipa with a
 * FREE Apple ID. Free accounts cannot be granted that entitlement — so the
 * plugin route does not produce a working feature, it produces a build that
 * either refuses to install or silently fails at runtime.
 *
 * The Health app can export everything though: Health → your photo → Export
 * All Health Data, which produces `export.xml`. That file needs no permission
 * from anybody, and it holds exactly what this app wants — bodyweight and
 * sleep. So the bridge is a file rather than an API.
 *
 * Two things this file is careful about:
 *
 *  1. **It never overwrites what you typed.** A weight you logged by hand is a
 *     weight you stood on a scale for; an import fills the gaps around it and
 *     leaves it alone. The caller decides, but the merge helper here defaults
 *     to that rule.
 *  2. **Sleep is summed, not taken from one record.** Health writes a dozen
 *     fragments a night as you move between stages, and reading any single one
 *     would report forty minutes of sleep.
 */

/** A night that begins after this hour belongs to the NEXT day's log. */
const NIGHT_ROLLS_AT = 18;

export interface HealthDay {
  date: string;
  /** Kilograms, converted from whatever the export used. */
  weightKg?: number;
  /** Hours actually asleep, summed across the night's fragments. */
  sleepHours?: number;
}

export interface HealthImport {
  days: HealthDay[];
  /** Counts, so the UI can say what it found rather than "done". */
  weights: number;
  nights: number;
  /** Lines that looked like records and could not be read. */
  skipped: number;
}

const LB_PER_KG = 2.20462;

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Apple writes "2026-09-01 08:12:33 +0100", which `new Date()` does not parse
 * reliably across engines. Normalised to something it does.
 */
export function parseHealthDate(raw: string): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})?$/.exec(s);
  const iso = m ? `${m[1]}T${m[2]}${m[3]}:${m[4] ?? "00"}` : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const attr = (line: string, name: string): string | undefined => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(line);
  return m ? m[1] : undefined;
};

/** Which night a sleep fragment belongs to: the evening rolls into tomorrow. */
export function nightOf(start: Date): string {
  const d = new Date(start.getTime());
  if (d.getHours() >= NIGHT_ROLLS_AT) d.setDate(d.getDate() + 1);
  return dateKeyOf(d);
}

/** Asleep, as opposed to merely in bed. In-bed time is not sleep. */
function isAsleep(value: string | undefined): boolean {
  const v = String(value ?? "");
  if (!v.includes("SleepAnalysis")) return false;
  // Older exports say "Asleep"; newer ones split into Core/Deep/REM. "InBed"
  // and "Awake" are neither, and counting InBed would add two hours a night of
  // lying there reading.
  return /Asleep/i.test(v) && !/InBed|Awake/i.test(v);
}

/**
 * Read Health records out of the export.
 *
 * Line-oriented on purpose. `export.xml` runs to hundreds of megabytes and one
 * record per line; a DOM parse would need the whole thing in memory at once
 * and take the tab down with it. This can be fed a chunk at a time.
 */
export function parseHealthXml(text: string): HealthImport {
  const weightByDay = new Map<string, { at: number; kg: number }>();
  const sleepByNight = new Map<string, number>();
  let skipped = 0;

  for (const line of String(text ?? "").split("\n")) {
    if (!line.includes("<Record")) continue;
    const type = attr(line, "type");
    if (!type) continue;

    if (type === "HKQuantityTypeIdentifierBodyMass") {
      const start = parseHealthDate(attr(line, "startDate") ?? "");
      const value = Number(attr(line, "value"));
      if (!start || !Number.isFinite(value) || value <= 0) {
        skipped++;
        continue;
      }
      const unit = (attr(line, "unit") ?? "kg").toLowerCase();
      const kg = unit.startsWith("lb") ? value / LB_PER_KG : value;
      const key = dateKeyOf(start);
      const prior = weightByDay.get(key);
      // The last reading of the day wins: a morning and an evening weigh-in on
      // the same date are not two facts, they are one fact measured twice.
      if (!prior || start.getTime() > prior.at) {
        weightByDay.set(key, { at: start.getTime(), kg });
      }
      continue;
    }

    if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
      if (!isAsleep(attr(line, "value"))) continue;
      const start = parseHealthDate(attr(line, "startDate") ?? "");
      const end = parseHealthDate(attr(line, "endDate") ?? "");
      if (!start || !end || end <= start) {
        skipped++;
        continue;
      }
      const hours = (end.getTime() - start.getTime()) / 3_600_000;
      // A single fragment longer than a day is corrupt, not a long lie-in.
      if (hours > 24) {
        skipped++;
        continue;
      }
      const night = nightOf(start);
      sleepByNight.set(night, (sleepByNight.get(night) ?? 0) + hours);
    }
  }

  const dates = new Set([...weightByDay.keys(), ...sleepByNight.keys()]);
  const days: HealthDay[] = [...dates].sort().map((date) => {
    const w = weightByDay.get(date);
    const s = sleepByNight.get(date);
    return {
      date,
      weightKg: w ? Math.round(w.kg * 10) / 10 : undefined,
      sleepHours: s ? Math.round(s * 10) / 10 : undefined,
    };
  });

  return {
    days,
    weights: weightByDay.size,
    nights: sleepByNight.size,
    skipped,
  };
}

/**
 * A plain table, for anyone whose data comes from somewhere other than Health.
 *
 * Columns are matched by name rather than position, because every app that
 * exports a CSV orders them differently and a positional reader silently
 * imports weight as sleep.
 */
export function parseHealthCsv(text: string): HealthImport {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { days: [], weights: 0, nights: 0, skipped: 0 };

  /**
   * One delimiter, decided from the header.
   *
   * Splitting on any of comma, semicolon or tab looks tolerant and is a trap:
   * a semicolon-delimited file written in a locale that uses a decimal comma —
   * which is most of Europe and North Africa — has "80,4" in it, and a greedy
   * split turns one weight into two cells. The header row has no numbers in
   * it, so it is the safe place to work out which character actually separates
   * the columns.
   */
  const delim = lines[0]!.includes("\t") ? "\t" : lines[0]!.includes(";") ? ";" : ",";
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
  const head = split(lines[0]!).map((h) => h.toLowerCase());
  const find = (...names: string[]) =>
    head.findIndex((h) => names.some((n) => h === n || h.includes(n)));

  const iDate = find("date", "day");
  const iWeight = find("weight", "bodymass", "mass");
  const iSleep = find("sleep", "asleep", "hours");
  if (iDate < 0) return { days: [], weights: 0, nights: 0, skipped: lines.length - 1 };

  const byDate = new Map<string, HealthDay>();
  let skipped = 0;
  let weights = 0;
  let nights = 0;

  for (const line of lines.slice(1)) {
    const cells = split(line);
    const raw = cells[iDate] ?? "";
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : (() => {
      const parsed = parseHealthDate(raw);
      return parsed ? dateKeyOf(parsed) : "";
    })();
    if (!d) {
      skipped++;
      continue;
    }

    const row: HealthDay = byDate.get(d) ?? { date: d };
    const w = iWeight >= 0 ? Number(String(cells[iWeight] ?? "").replace(",", ".")) : NaN;
    const s = iSleep >= 0 ? Number(String(cells[iSleep] ?? "").replace(",", ".")) : NaN;
    if (Number.isFinite(w) && w > 0) {
      if (row.weightKg === undefined) weights++;
      row.weightKg = Math.round(w * 10) / 10;
    }
    if (Number.isFinite(s) && s > 0 && s <= 24) {
      if (row.sleepHours === undefined) nights++;
      row.sleepHours = Math.round(s * 10) / 10;
    }
    if (row.weightKg !== undefined || row.sleepHours !== undefined) byDate.set(d, row);
    else skipped++;
  }

  return {
    days: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    weights,
    nights,
    skipped,
  };
}

/** Reads either shape, so the user does not have to know which they have. */
export function parseHealthFile(text: string): HealthImport {
  return String(text ?? "").includes("<Record") ? parseHealthXml(text) : parseHealthCsv(text);
}

export interface MergePlan {
  /** Days the import would add something to. */
  changes: { date: string; weightKg?: number; sleepHours?: number }[];
  /** Days skipped because the device already has that figure. */
  kept: number;
}

/**
 * What an import would actually change.
 *
 * Computed and shown BEFORE anything is written. A restore that silently
 * rewrote a year of weigh-ins would be indistinguishable from a bug, and this
 * app's rule everywhere else is that the device's own entry wins — you stood
 * on the scale, Health only heard about it.
 */
export function planMerge(
  incoming: HealthDay[],
  existing: Record<string, { bodyWeight?: number; sleep?: { hours?: number } }>,
  overwrite = false,
): MergePlan {
  const changes: MergePlan["changes"] = [];
  let kept = 0;

  for (const day of incoming ?? []) {
    const have = existing?.[day.date];
    const change: { date: string; weightKg?: number; sleepHours?: number } = { date: day.date };

    if (day.weightKg !== undefined) {
      if (overwrite || have?.bodyWeight == null) change.weightKg = day.weightKg;
      else kept++;
    }
    if (day.sleepHours !== undefined) {
      if (overwrite || have?.sleep?.hours == null) change.sleepHours = day.sleepHours;
      else kept++;
    }

    if (change.weightKg !== undefined || change.sleepHours !== undefined) changes.push(change);
  }

  return { changes, kept };
}
