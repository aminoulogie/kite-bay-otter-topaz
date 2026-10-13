/**
 * Working through a project's steps one at a time.
 *
 * ▶ on a step opens a work segment on it (and closes any other); ticking it
 * done, or ■, closes the segment — the time is locked on the step. Nothing is
 * a time entry yet: at the end of a stretch you pick which steps to post and
 * whether they become ONE merged entry (the total, "what was done" listing
 * the steps) or ONE ENTRY EACH. A posted segment remembers its entry, so it is
 * never offered twice — unless that entry was deleted, in which case it is
 * pending again rather than lost.
 */

import type { Project, ProjectStep } from "./projects.ts";

export interface StepWork {
  start: number;
  /** Absent while it is running. */
  end?: number;
  /** The time entry it was posted to. */
  entryId?: string;
}

/** A segment left running this long was forgotten, not worked. */
export const MAX_SEGMENT_MS = 12 * 3600_000;

export const segMs = (w: StepWork, now = Date.now()) =>
  Math.max(0, Math.min(MAX_SEGMENT_MS, (w.end ?? now) - w.start));

export const workOf = (s: ProjectStep | undefined): StepWork[] => (Array.isArray(s?.work) ? s!.work! : []);

/** All time worked on the step, posted or not. */
export const stepWorkMs = (s: ProjectStep, now = Date.now()) => workOf(s).reduce((a, w) => a + segMs(w, now), 0);

/** The step being worked on right now, anywhere. */
export function openWork(projects: Project[]): { projectId: string; stepId: string; start: number } | null {
  for (const p of projects) {
    for (const s of p.steps ?? []) {
      const w = workOf(s).find((x) => x.end === undefined);
      if (w) return { projectId: p.id, stepId: s.id, start: w.start };
    }
  }
  return null;
}

/** Closed segments not (or no longer) in an entry. */
export function pendingWork(s: ProjectStep, entryIds: Set<string>): StepWork[] {
  return workOf(s).filter((w) => w.end !== undefined && !(w.entryId && entryIds.has(w.entryId)));
}

/** Steps with time waiting to be posted, with how much. */
export function pendingSteps(p: Project | undefined, entryIds: Set<string>) {
  return (p?.steps ?? [])
    .map((s) => {
      const segs = pendingWork(s, entryIds);
      return { step: s, ms: segs.reduce((a, w) => a + segMs(w), 0), start: Math.min(...segs.map((w) => w.start)) };
    })
    .filter((x) => x.ms > 0);
}

export interface PostDraft {
  start: number;
  end: number;
  note: string;
  stepId?: string;
  /** Which steps' pending segments this entry covers. */
  steps: string[];
}

/**
 * The entries a post makes. Merged: one, starting when the first chosen step
 * did, as long as all of them together. Separate: one per step, each as long
 * as that step, starting when it did.
 */
export function draftPost(p: Project, stepIds: string[], mode: "merge" | "separate", entryIds: Set<string>): PostDraft[] {
  const chosen = pendingSteps(p, entryIds).filter((x) => stepIds.includes(x.step.id));
  if (!chosen.length) return [];
  if (mode === "separate") {
    return chosen
      .sort((a, b) => a.start - b.start)
      .map((x) => ({ start: x.start, end: x.start + x.ms, note: x.step.label, stepId: x.step.id, steps: [x.step.id] }));
  }
  const ordered = chosen.sort((a, b) => a.start - b.start);
  const start = ordered[0]!.start;
  const total = ordered.reduce((a, x) => a + x.ms, 0);
  return [
    {
      start,
      end: start + total,
      note: ordered.map((x) => x.step.label).join("; "),
      stepId: ordered.length === 1 ? ordered[0]!.step.id : undefined,
      steps: ordered.map((x) => x.step.id),
    },
  ];
}

/** A backup's segments made safe. */
export function asStepWork(raw: unknown): StepWork[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((w) => w && Number.isFinite(Number(w.start)))
    .map((w) => {
      const start = Number(w.start);
      const end = w.end == null ? undefined : Number(w.end);
      return {
        start,
        end: end !== undefined && Number.isFinite(end) && end >= start ? end : undefined,
        entryId: typeof w.entryId === "string" ? w.entryId : undefined,
      };
    });
  return out.length ? out : undefined;
}
