/**
 * The native Habits panel's view of the data (NativeHabits.swift).
 *
 * The habit logic — steps, ramps, auto rules, scores, locks — stays here,
 * in one place; the native panel draws what this sends and hands taps back
 * as HabitActions. Everything the panel shows is precomputed except the
 * calendar grids, which the native side builds from the done dates.
 */
import { needFor } from "@/components/views/HabitsView";
import { describeAuto, suggestAuto } from "@/lib/habit-auto";
import { habitCategory } from "@/lib/habit-colors";
import { iconFor } from "@/lib/habit-icons";
import { canChange } from "@/lib/habit-lock";
import { bumpSizes, formatAmount, isBuild, rungLabel, status, RAMP_PRESETS } from "@/lib/habit-ramp";
import { COEF_LABELS, KEEP_AT, coefOf, habitConsistency, habitDayScore, habitStreak } from "@/lib/habit-score";
import { completionRate, currentStreak, longestStreak, totalDays } from "@/lib/habit-stats";
import { STEP_PRESETS, progress, stepCount, targetOf } from "@/lib/habit-steps";
import { iconPng } from "@/lib/native/chrome";
import type { Habit } from "@/lib/types";

const iconCache = new Map<string, string>();

/** Icons are rendered once per kind and cached; a habit with none sends "". */
async function iconFor64(name: string): Promise<string> {
  const Icon = iconFor(name);
  if (!Icon) return "";
  const key = Icon.displayName ?? name;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const png = await iconPng(Icon).catch(() => "");
  iconCache.set(key, png);
  return png;
}

function rampOf(h: Habit, date: string) {
  if (!h.ramp) return null;
  const st = status(h.ramp, date, h.amountLog);
  const building = isBuild(h.ramp);
  const soFar = st.logged ?? 0;
  return {
    kicker: building ? "Today, at least" : "Today, at most",
    progress: st.finished ? "Finished" : `${st.earned}/${st.total} ${building ? "climbed" : "cut"}`,
    label: rungLabel(h.ramp, st.rung),
    logged: st.logged === undefined ? "—" : formatAmount(soFar, h.ramp.unit),
    hasLog: st.logged !== undefined,
    done: st.done,
    hitLabel: building ? "Hit it" : "Stayed under",
    hitValue: st.rung,
    bumps: bumpSizes(h.ramp.unit).map((n) => ({
      label: "+" + (h.ramp!.unit === "count" ? String(n) : formatAmount(n, h.ramp!.unit).replace(/ pages?$/, "")),
      value: soFar + n,
    })),
  };
}

export async function habitsPayload(habits: Habit[], activeDate: string, today: string, accent: string): Promise<string> {
  const day = habitDayScore(habits, activeDate);
  const kept = day.score != null && day.score >= KEEP_AT;
  const out = await Promise.all(
    habits.map(async (h) => {
      const done = !!h.history[activeDate];
      const steps = h.steps ?? [];
      const list = progress(h, activeDate);
      return {
        id: h.id,
        name: h.name,
        desc: h.desc || "",
        color: h.color,
        icon: await iconFor64(h.name),
        streak: currentStreak(h, today),
        longest: longestStreak(h),
        completion: completionRate(h, today),
        total: totalDays(h),
        done,
        canChange: canChange(done, activeDate),
        stepsDone: list.done,
        stepsTotal: list.total,
        doneDates: Object.keys(h.history).filter((d) => h.history[d] === true),
        coef: coefOf(h),
        coefLabel: COEF_LABELS[coefOf(h)] ?? "",
        auto: h.auto ? describeAuto(h.auto) : null,
        category: habitCategory(h.name),
        goal: h.goalDaysPerWeek,
        steps: steps.map((st) => ({ id: st.id, name: st.name, n: stepCount(h, activeDate, st.id), target: targetOf(st) })),
        ramp: rampOf(h, activeDate),
        notes: (h.notes ?? []).map((n) => ({ id: n.id, date: n.date, text: n.text })),
      };
    }),
  );
  const suggestions = habits
    .filter((h) => !h.auto)
    .map((h) => ({ h, rule: suggestAuto(h.name) }))
    .filter((o) => !!o.rule)
    .map((o) => ({ id: o.h.id, name: o.h.name, rule: describeAuto(o.rule!) }));
  const names = new Set(habits.map((h) => h.name.trim().toLowerCase()));
  const presets = [
    ...STEP_PRESETS.map((p) => ({ name: p.name, kind: "steps", color: p.color, detail: `${p.steps.length} steps` })),
    ...RAMP_PRESETS.map((p) => ({ name: p.name, kind: "ramp", color: p.color, detail: p.desc })),
  ].filter((p) => !names.has(p.name.toLowerCase()));
  return JSON.stringify({
    today,
    activeDate,
    isToday: activeDate === today,
    accent,
    summary: {
      label: activeDate === today ? "Today" : activeDate,
      score: day.score,
      kept,
      streak: habitStreak(habits, today),
      consistency: habitConsistency(habits, today),
      need: day.score != null && !kept && activeDate === today ? needFor(day) : null,
      doneCount: habits.filter((h) => h.history[activeDate]).length,
    },
    suggestions,
    presets,
    habits: out,
  });
}
