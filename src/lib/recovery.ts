import type { HistorySession } from "./types";

export const BASE_RECOVERY_HOURS: Record<string, number> = {
  calves: 24,
  calves_back: 24,
  deltoids_back: 24,
  forearm: 24,
  forearm_back: 24,
  biceps: 36,
  deltoids: 36,
  chest: 48,
  upper_back: 48,
  trapezius: 48,
  trapezius_back: 48,
  triceps: 48,
  triceps_back: 48,
  gluteal: 48,
  adductors: 48,
  adductors_back: 48,
  quadriceps: 72,
  hamstring: 72,
  lower_back: 72,
  abs: 36,
  obliques: 36,
};

export const MUSCLE_REGIONS: {
  key: string;
  label: string;
  view: "front" | "back";
}[] = [
  { key: "chest", label: "Chest", view: "front" },
  { key: "deltoids", label: "Front Delts", view: "front" },
  { key: "biceps", label: "Biceps", view: "front" },
  { key: "abs", label: "Abs", view: "front" },
  { key: "quadriceps", label: "Quads", view: "front" },
  { key: "adductors", label: "Adductors", view: "front" },
  { key: "forearm", label: "Forearms", view: "front" },
  { key: "calves", label: "Calves", view: "front" },
  { key: "upper_back", label: "Back", view: "back" },
  { key: "trapezius_back", label: "Traps", view: "back" },
  { key: "deltoids_back", label: "Rear Delts", view: "back" },
  { key: "triceps", label: "Triceps", view: "back" },
  { key: "lower_back", label: "Lower Back", view: "back" },
  { key: "gluteal", label: "Glutes", view: "back" },
  { key: "hamstring", label: "Hamstrings", view: "back" },
  { key: "calves_back", label: "Calves", view: "back" },
];

const EFFORT_MULTIPLIER: Record<number, number> = {
  1: 0.35,
  2: 0.6,
  3: 1,
  4: 1.3,
  5: 1.6,
};

export interface MuscleReadiness {
  key: string;
  label: string;
  view: "front" | "back";
  recovery: number;
  hoursLeft: number;
  lastWorkedHours: number | null;
  effortNote: string | null;
}

export function computeBiologicalReadiness(
  history: Record<string, HistorySession>,
  now = Date.now(),
): Record<string, MuscleReadiness> {
  const latest: Record<string, { timestamp: number; sets: number; avgFail: number }> = {};

  for (const session of Object.values(history || {})) {
    const sessionTime = session.timestamp || now;
    if (!session.muscles) continue;
    for (const [mKey, stats] of Object.entries(session.muscles)) {
      if (!latest[mKey] || sessionTime > latest[mKey].timestamp) {
        latest[mKey] = {
          timestamp: sessionTime,
          sets: stats.sets || 3,
          avgFail: stats.avgFail || 3,
        };
      }
    }
  }

  const out: Record<string, MuscleReadiness> = {};
  for (const region of MUSCLE_REGIONS) {
    const baseT = BASE_RECOVERY_HOURS[region.key] || 48;
    const stim = latest[region.key];
    if (!stim) {
      out[region.key] = {
        ...region,
        recovery: 100,
        hoursLeft: 0,
        lastWorkedHours: null,
        effortNote: null,
      };
      continue;
    }
    const elapsedHours = (now - stim.timestamp) / 3600000;
    const volumeFactor = Math.min(1.8, Math.max(0.45, stim.sets / 3));
    const lo = Math.floor(stim.avgFail);
    const hi = Math.ceil(stim.avgFail);
    const effortFactor =
      lo === hi
        ? EFFORT_MULTIPLIER[lo] || 1
        : (EFFORT_MULTIPLIER[lo] || 1) +
          ((EFFORT_MULTIPLIER[hi] || 1) - (EFFORT_MULTIPLIER[lo] || 1)) * (stim.avgFail - lo);
    const tTarget = Math.min(baseT * 2, Math.max(baseT * 0.3, baseT * volumeFactor * effortFactor));
    const readiness = Math.min(100, Math.pow(Math.max(0, elapsedHours) / tTarget, 0.8) * 100);
    const avgFail = stim.avgFail;
    out[region.key] = {
      ...region,
      recovery: Math.round(readiness),
      hoursLeft: Math.max(0, Math.round(tTarget - elapsedHours)),
      lastWorkedHours: Math.round(elapsedHours),
      effortNote:
        avgFail <= 1.5
          ? "Very Easy"
          : avgFail <= 2.5
            ? "Easy"
            : avgFail <= 3.5
              ? "Target"
              : avgFail <= 4.5
                ? "Hard"
                : "True Failure",
    };
  }
  return out;
}

export function heatColor(recovery: number): string {
  if (recovery >= 90) return "#22c55e";
  if (recovery >= 70) return "#eab308";
  if (recovery >= 40) return "#f97316";
  return "#ef4444";
}

export function heatLabel(recovery: number): string {
  if (recovery >= 90) return "Primed";
  if (recovery >= 70) return "Ready";
  if (recovery >= 40) return "Repairing";
  return "Fatigued";
}
