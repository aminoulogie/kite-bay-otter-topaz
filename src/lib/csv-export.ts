import type { HistorySession, NutritionDay } from "./types";

/**
 * Plain CSV, so the data is never locked inside this app.
 *
 * One file per shape rather than one wide sheet: sets, nutrition days and
 * measurements have nothing in common except a date, and flattening them
 * together produces a sheet mostly full of blanks that no spreadsheet can
 * pivot usefully.
 *
 * The backup JSON remains the thing to restore FROM — CSV is deliberately
 * one-way, because round-tripping it would mean guessing types back out of
 * text and quietly changing values.
 */

/**
 * RFC 4180 quoting.
 *
 * Necessary rather than decorative: exercise names contain commas and quotes
 * ("Lat Pulldown (Wide/Neutral)"), and a note can contain a newline. Any of
 * those unquoted shifts every later column by one and silently corrupts the
 * export.
 */
function cell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  // A BOM, so Excel opens UTF-8 correctly instead of mangling the Arabic food
  // names on the first double-click.
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

export interface CsvFile {
  name: string;
  content: string;
  rows: number;
}

export function setsCsv(history: Record<string, HistorySession>): CsvFile {
  const rows: unknown[][] = [];
  for (const [date, s] of Object.entries(history || {}).sort()) {
    if (!s?.exercises) continue;
    for (const ex of s.exercises) {
      (ex.sets ?? []).forEach((set, i) => {
        rows.push([
          date, s.split, ex.name, ex.muscle, ex.subTarget ?? "",
          i + 1, set.type, set.weight, set.reps, set.done ? "yes" : "no",
          set.limiter ?? "", set.closeness ?? "", (set.limitedBy ?? []).join(" "),
          set.burn ?? "", set.form ?? "", ex.pump ?? "",
        ]);
      });
    }
  }
  return {
    name: "soma-sets.csv",
    rows: rows.length,
    content: toCsv(
      ["date", "split", "exercise", "muscle", "sub_target", "set", "type", "weight_kg",
       "reps", "completed", "limiter", "closeness", "limited_by", "burn", "form", "pump"],
      rows,
    ),
  };
}

export function nutritionCsv(nutrition: Record<string, NutritionDay>): CsvFile {
  const rows: unknown[][] = [];
  for (const [date, d] of Object.entries(nutrition || {}).sort()) {
    for (const it of d?.items ?? []) {
      rows.push([
        date, it.meal ?? "", it.name, it.serving, it.unit,
        it.cals, it.p, it.c, it.f, it.fiber ?? "",
      ]);
    }
  }
  return {
    name: "soma-nutrition.csv",
    rows: rows.length,
    content: toCsv(
      ["date", "meal", "food", "serving", "unit", "kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"],
      rows,
    ),
  };
}

export function dailyCsv(nutrition: Record<string, NutritionDay>): CsvFile {
  const rows: unknown[][] = [];
  for (const [date, d] of Object.entries(nutrition || {}).sort()) {
    if (!d) continue;
    const t = (d.items ?? []).reduce(
      (a, i) => ({
        cals: a.cals + (i.cals || 0), p: a.p + (i.p || 0),
        c: a.c + (i.c || 0), f: a.f + (i.f || 0),
      }),
      { cals: 0, p: 0, c: 0, f: 0 },
    );
    const logged = (d.items?.length ?? 0) > 0;
    rows.push([
      date,
      d.bodyWeight ?? "",
      // Blank, not zero, when nothing was logged — a zero here would read as a
      // day of fasting and wreck any average taken in a spreadsheet.
      logged ? Math.round(t.cals) : "",
      logged ? Math.round(t.p) : "",
      logged ? Math.round(t.c) : "",
      logged ? Math.round(t.f) : "",
      d.water ?? "",
      d.creatine ?? "",
      d.sleep?.hours ?? "",
      d.sleep?.quality ?? "",
      ...Object.values(d.measurements ?? {}),
    ]);
  }
  return {
    name: "soma-daily.csv",
    rows: rows.length,
    content: toCsv(
      ["date", "bodyweight_kg", "kcal", "protein_g", "carbs_g", "fat_g",
       "water_ml", "creatine_g", "sleep_hours", "sleep_quality"],
      rows,
    ),
  };
}

export function allCsv(
  history: Record<string, HistorySession>,
  nutrition: Record<string, NutritionDay>,
): CsvFile[] {
  return [setsCsv(history), nutritionCsv(nutrition), dailyCsv(nutrition)];
}
