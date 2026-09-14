/**
 * Things with a finish line.
 *
 * Everything else this app tracks is a habit or a measurement — something you
 * repeat, or something you read off. A project is neither: it is a thing that
 * is DONE at some point, and the only questions worth answering about one are
 * "what is the next actual step" and "am I still moving".
 *
 * So this is deliberately not a task manager. There is no nesting, no
 * assignees, no boards. A project has steps, a step is done or it is not, and
 * the progress bar is the count — because a percentage someone types in by
 * hand is a mood, not a measurement, and the whole app is built on not letting
 * people grade their own homework.
 *
 * The one number that is NOT derived is the deadline, because a deadline is a
 * fact about the world rather than about the work.
 */

export type ProjectStatus = "active" | "paused" | "done";

export interface ProjectStep {
  id: string;
  label: string;
  done: boolean;
  /** When it was ticked, for the "moving" check. */
  at?: number;
}

export interface Project {
  id: string;
  name: string;
  /** Why it exists. Empty is fine — most projects do not need a paragraph. */
  note?: string;
  color: string;
  steps: ProjectStep[];
  status: ProjectStatus;
  /** Local date key, "YYYY-MM-DD". */
  due?: string;
  createdAt: number;
  /** Last time any step was ticked or unticked. */
  touchedAt?: number;
}

/** Eight fills that hold apart on a near-black ground and a near-white one. */
export const PROJECT_COLORS = [
  "#5b8cff", "#35c9a8", "#f0a63c", "#e2607a",
  "#9b7bf0", "#3fb6f0", "#5ecf7a", "#e0785a",
];

/** Untouched for this many days and a project is drifting, not progressing. */
export const STALE_DAYS = 10;

let seq = 0;
export function newProjectId(): string {
  seq += 1;
  return `pj-${Date.now().toString(36)}-${seq.toString(36)}`;
}
export function newStepId(): string {
  seq += 1;
  return `ps-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function stepsOf(project: Project | undefined): ProjectStep[] {
  return Array.isArray(project?.steps) ? project.steps : [];
}

export function doneCount(project: Project | undefined): number {
  return stepsOf(project).filter((s) => s.done).length;
}

/**
 * How far along, 0 to 1.
 *
 * A project with no steps yet is 0 rather than 1. "Nothing to do" and
 * "everything done" look identical to a naive count, and reporting an empty
 * project as complete would put it in the finished pile the moment it was
 * created.
 */
export function progress(project: Project | undefined): number {
  const steps = stepsOf(project);
  if (!steps.length) return 0;
  return doneCount(project) / steps.length;
}

/** The first step still to do — the only one worth showing on a card. */
export function nextStep(project: Project | undefined): ProjectStep | null {
  return stepsOf(project).find((s) => !s.done) ?? null;
}

/**
 * Whether every step is ticked.
 *
 * Separate from `status`: a project can be finished by its steps without
 * anyone having said so, and that is exactly the moment to offer to close it.
 * An empty project is never complete, for the reason above.
 */
export function isComplete(project: Project | undefined): boolean {
  const steps = stepsOf(project);
  return steps.length > 0 && steps.every((s) => s.done);
}

/** Days until the deadline; negative is overdue, null when there is none. */
export function daysLeft(project: Project | undefined, todayKey: string): number | null {
  if (!project?.due) return null;
  const due = Date.parse(`${project.due}T00:00:00`);
  const today = Date.parse(`${todayKey}T00:00:00`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return null;
  return Math.round((due - today) / 86400000);
}

/**
 * Nothing ticked for a while, and not deliberately paused.
 *
 * Paused is excluded on purpose: a project you have consciously set down is
 * not a problem, and nagging about it teaches people to ignore the signal.
 */
export function isStale(project: Project | undefined, now = Date.now()): boolean {
  if (!project || project.status !== "active") return false;
  const last = Number(project.touchedAt ?? project.createdAt);
  if (!Number.isFinite(last)) return false;
  return now - last > STALE_DAYS * 86400000;
}

/** Active first, then paused, then done; within each, nearest deadline first. */
export function sortProjects(list: Project[], todayKey: string): Project[] {
  const rank: Record<ProjectStatus, number> = { active: 0, paused: 1, done: 2 };
  return [...(list ?? [])].sort((a, b) => {
    const r = (rank[a.status] ?? 0) - (rank[b.status] ?? 0);
    if (r !== 0) return r;
    const da = daysLeft(a, todayKey);
    const db = daysLeft(b, todayKey);
    // A project with a deadline outranks one without: a date is a commitment.
    if (da !== null && db === null) return -1;
    if (da === null && db !== null) return 1;
    if (da !== null && db !== null && da !== db) return da - db;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export function setStep(project: Project, stepId: string, done: boolean, now = Date.now()): Project {
  const steps = stepsOf(project).map((s) =>
    s.id === stepId ? { ...s, done, at: done ? now : undefined } : s,
  );
  return { ...project, steps, touchedAt: now };
}

export function addStep(project: Project, label: string, now = Date.now()): Project {
  const text = String(label ?? "").trim();
  if (!text) return project;
  return {
    ...project,
    steps: [...stepsOf(project), { id: newStepId(), label: text, done: false }],
    touchedAt: now,
  };
}

/**
 * Move a step one place up or down the list.
 *
 * Order matters here in a way it does not in most lists: `nextStep` reads the
 * first unticked one, and that single line is what the card shows and what the
 * whole tab is for. Being unable to correct the order meant deleting a step
 * and retyping it, which threw away its tick and its timestamp — the two
 * things the momentum read is built from.
 *
 * `touchedAt` is deliberately NOT bumped: rearranging the plan is not progress,
 * and counting it as progress would let anyone clear a drift warning by
 * shuffling the list.
 */
export function moveStep(project: Project, stepId: string, delta: number): Project {
  const steps = [...stepsOf(project)];
  const from = steps.findIndex((s) => s.id === stepId);
  if (from < 0) return project;
  const to = from + delta;
  if (to < 0 || to >= steps.length) return project;
  const [moved] = steps.splice(from, 1);
  steps.splice(to, 0, moved!);
  return { ...project, steps };
}

export function removeStep(project: Project, stepId: string, now = Date.now()): Project {
  return {
    ...project,
    steps: stepsOf(project).filter((s) => s.id !== stepId),
    touchedAt: now,
  };
}

/** A summary of the whole board, for the header. */
export interface BoardSummary {
  active: number;
  done: number;
  stepsLeft: number;
  overdue: number;
  stale: number;
}

export function summarise(list: Project[], todayKey: string, now = Date.now()): BoardSummary {
  let active = 0;
  let done = 0;
  let stepsLeft = 0;
  let overdue = 0;
  let stale = 0;
  for (const p of list ?? []) {
    if (p.status === "done") {
      done += 1;
      continue;
    }
    if (p.status === "active") active += 1;
    stepsLeft += stepsOf(p).filter((s) => !s.done).length;
    const left = daysLeft(p, todayKey);
    if (left !== null && left < 0) overdue += 1;
    if (isStale(p, now)) stale += 1;
  }
  return { active, done, stepsLeft, overdue, stale };
}

/** A project read back from storage, with every field made safe. */
export function cleanProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Project>;
  if (typeof r.id !== "string" || !r.id) return null;
  const status: ProjectStatus =
    r.status === "paused" || r.status === "done" ? r.status : "active";
  return {
    id: r.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name : "Untitled",
    note: typeof r.note === "string" ? r.note : undefined,
    color: typeof r.color === "string" && r.color ? r.color : PROJECT_COLORS[0]!,
    steps: Array.isArray(r.steps)
      ? r.steps
          .filter((s): s is ProjectStep => !!s && typeof s.id === "string" && typeof s.label === "string")
          .map((s) => ({ id: s.id, label: s.label, done: s.done === true, at: Number(s.at) || undefined }))
      : [],
    status,
    due: typeof r.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : undefined,
    createdAt: Number(r.createdAt) || Date.now(),
    touchedAt: Number(r.touchedAt) || undefined,
  };
}

/* ------------------------------------------------------------------ pace --
 *
 * "Am I still moving" is the other question this tab exists to answer, and
 * until now the only answer was a ten-day yes/no. Every tick already carries
 * its timestamp, so the honest version is free: count the ticks in a window
 * and compare that rate against the rate the deadline actually demands.
 *
 * Both numbers are derived. Nobody types a percentage, an estimate, or a
 * confidence — the same reason progress is a count of steps and not a slider.
 */

/** The window the recent rate is read over. Two weeks: long enough that one
 *  quiet weekend does not read as a stall, short enough to notice one. */
export const MOMENTUM_DAYS = 14;

/** When a step was last ticked, or undefined if none ever was. */
export function lastMoveAt(project: Project | undefined): number | undefined {
  let last: number | undefined;
  for (const s of stepsOf(project)) {
    const at = Number(s.at);
    if (s.done && Number.isFinite(at) && (last === undefined || at > last)) last = at;
  }
  return last;
}

/**
 * Whole days since the last tick, or null if nothing has ever been ticked.
 *
 * Deliberately not measured from `touchedAt`: that moves when a step is added
 * or renamed, and adding steps to a project is planning it, not progressing
 * it. Rewriting the list would otherwise read as work.
 */
export function daysSinceMove(project: Project | undefined, now = Date.now()): number | null {
  const last = lastMoveAt(project);
  if (last === undefined) return null;
  return Math.max(0, Math.floor((now - last) / 86400000));
}

/** Steps ticked in the last `days` days. */
export function ticksSince(project: Project | undefined, days: number, now = Date.now()): number {
  const cutoff = now - days * 86400000;
  return stepsOf(project).filter((s) => s.done && Number.isFinite(Number(s.at)) && Number(s.at) >= cutoff).length;
}

export type PaceVerdict = "no-steps" | "done" | "no-deadline" | "overdue" | "ahead" | "behind";

export interface Pace {
  /** Steps ticked per day, lately. */
  actual: number;
  /** Steps per day needed to hit the deadline; null when there is none. */
  required: number | null;
  /** Steps still to tick. */
  left: number;
  /** Days until the deadline; null when there is none, negative when over. */
  days: number | null;
  verdict: PaceVerdict;
}

/**
 * The recent rate, the demanded rate, and how they compare.
 *
 * The recent rate is measured over however long the project has existed, up to
 * MOMENTUM_DAYS — a project started on Tuesday is not judged against a
 * fortnight it has not had yet, which would report every new project as
 * behind on its second day.
 *
 * A deadline of today still leaves today to work in, so the divisor floors at
 * one day rather than zero. Dividing by the literal zero days remaining would
 * demand an infinite rate of someone who has until this evening.
 */
export function pace(project: Project | undefined, todayKey: string, now = Date.now()): Pace {
  const steps = stepsOf(project);
  const left = steps.filter((s) => !s.done).length;
  const days = daysLeft(project, todayKey);

  const age = (now - Number(project?.createdAt ?? now)) / 86400000;
  const window = Math.max(1, Math.min(MOMENTUM_DAYS, Math.floor(age) || 1));
  const actual = ticksSince(project, window, now) / window;

  if (!steps.length) return { actual, required: null, left, days, verdict: "no-steps" };
  if (left === 0) return { actual, required: null, left, days, verdict: "done" };
  if (days === null) return { actual, required: null, left, days, verdict: "no-deadline" };
  if (days < 0) return { actual, required: null, left, days, verdict: "overdue" };

  const required = left / Math.max(1, days);
  return { actual, required, left, days, verdict: actual >= required ? "ahead" : "behind" };
}

/**
 * The pace as a sentence, because "0.43 steps/day" is not a thing anyone says.
 *
 * Phrased as the interval between steps once the rate drops below one a day,
 * which is where nearly every real project sits.
 */
export function paceLabel(p: Pace): string {
  switch (p.verdict) {
    case "no-steps":
      return "No steps yet";
    case "done":
      return "Every step ticked";
    case "overdue":
      return `${p.left} ${p.left === 1 ? "step" : "steps"} left, past the date`;
    case "no-deadline":
      return p.actual > 0 ? `${rateWords(p.actual)}, no deadline` : "Not moving yet";
    default:
      return `${rateWords(p.actual)} · ${rateWords(p.required ?? 0)} needed`;
  }
}

/** A steps-per-day rate in words. */
export function rateWords(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "nothing lately";
  if (rate >= 1) {
    const perDay = Math.round(rate * 10) / 10;
    return `${perDay}/day`;
  }
  const everyDays = Math.round(1 / rate);
  return everyDays === 1 ? "1/day" : `1 every ${everyDays}d`;
}
