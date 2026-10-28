/**
 * Notes: an Obsidian vault, mirrored into SOMA so every device can read it.
 *
 * The vault stays an ordinary folder of Markdown files, kept wherever Obsidian
 * keeps it (iCloud Drive, so the iPhone's Obsidian sees it too). A device with
 * that folder connected (the PC, see notes-vault.ts) mirrors it both ways:
 * files into `notes`, and notes edited on another device (the Margin tablet,
 * which has no iCloud) back into files. Each note is one record, so sync
 * carries them like any other list, a note at a time.
 *
 * The rules, kept here so they can be tested without a folder:
 *   - a note's id is its path in the vault: "Daily/2026-10-28.md";
 *   - a file newer than its note replaces the note, a note newer than its file
 *     is written to the file;
 *   - a file with no note is new on this device, and is added; a note with no
 *     file is either new from another device (newer than the last mirror, so
 *     it is written) or a file deleted here (so the note goes too). Files are
 *     never deleted from the vault;
 *   - only Markdown is mirrored, nothing under .obsidian or .trash, and a note
 *     past MAX_NOTE_CHARS is left in the vault only — a pasted log is not a note.
 *
 * Automations write into notes between SOMA_START and SOMA_END, and nowhere
 * else: what you write around that block is yours, and the block is rewritten
 * each time with what is true now.
 */

export interface Note {
  /** The path in the vault, with forward slashes. */
  id: string;
  text: string;
  /** When it last changed, epoch ms: the file's time, or the edit's on another device. */
  mtime: number;
}

export const MAX_NOTE_CHARS = 200_000;
export const SOMA_START = "<!-- soma -->";
export const SOMA_END = "<!-- /soma -->";

export function isNotePath(path: string): boolean {
  if (!path.toLowerCase().endsWith(".md")) return false;
  return !path.split("/").some((part) => part.startsWith(".") || part === "node_modules");
}

export function asNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const n = x as Record<string, unknown>;
    if (typeof n.id !== "string" || !isNotePath(n.id) || seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({ id: n.id, text: typeof n.text === "string" ? n.text : "", mtime: Number(n.mtime) || 0 });
  }
  return out;
}

export interface VaultFile {
  path: string;
  text: string;
  modified: number;
}

export interface MirrorPlan {
  /** Notes to add or replace. */
  put: Note[];
  /** Note ids to remove: their files were deleted in the vault. */
  remove: string[];
  /** Files to write: notes changed elsewhere. */
  write: { path: string; text: string }[];
}

/**
 * What a mirror pass does. `lastRun` is when this device last mirrored (0 the
 * first time, when every note without a file is taken to be new elsewhere).
 * File times and note times are compared with a second's slack: a file
 * written by the last pass is a little newer than the note it came from.
 */
export function planMirror(files: readonly VaultFile[], notes: readonly Note[], lastRun: number): MirrorPlan {
  const plan: MirrorPlan = { put: [], remove: [], write: [] };
  const byId = new Map(notes.map((n) => [n.id, n]));
  const onDisk = new Set<string>();
  for (const f of files) {
    if (!isNotePath(f.path) || f.text.length > MAX_NOTE_CHARS) continue;
    onDisk.add(f.path);
    const n = byId.get(f.path);
    if (!n) {
      plan.put.push({ id: f.path, text: f.text, mtime: f.modified });
    } else if (n.text !== f.text) {
      if (n.mtime > f.modified + 1000) plan.write.push({ path: f.path, text: n.text });
      else plan.put.push({ id: f.path, text: f.text, mtime: Math.max(f.modified, n.mtime + 1) });
    }
  }
  for (const n of notes) {
    if (onDisk.has(n.id)) continue;
    if (lastRun === 0 || n.mtime > lastRun) plan.write.push({ path: n.id, text: n.text });
    else plan.remove.push(n.id);
  }
  return plan;
}

/** `text` with the SOMA block replaced by `block` (or added at the end). */
export function setSomaBlock(text: string, block: string): string {
  const body = `${SOMA_START}\n${block.trim()}\n${SOMA_END}`;
  const a = text.indexOf(SOMA_START);
  const b = text.indexOf(SOMA_END, a + 1);
  if (a >= 0 && b > a) return text.slice(0, a) + body + text.slice(b + SOMA_END.length);
  const sep = text.trim() ? (text.endsWith("\n") ? "\n" : "\n\n") : "";
  return `${text}${sep}${body}\n`;
}

// --------------------------------------------------------- checkboxes -> to-dos

const TASK = /^(\s*[-*+] \[)([ xX])(\] )(.*?)(\s+\^s-([A-Za-z0-9-]+))?\s*$/;

export interface NoteTask {
  line: number;
  done: boolean;
  text: string;
  /** The SOMA to-do it is linked to, from its "^s-<id>" block id. */
  todoId?: string;
}

/** The "- [ ] ..." lines of a note. Lines inside the SOMA block are the automation's, not tasks. */
export function noteTasks(text: string): NoteTask[] {
  const out: NoteTask[] = [];
  let inBlock = false;
  text.split("\n").forEach((l, i) => {
    if (l.includes(SOMA_START)) inBlock = true;
    if (!inBlock) {
      const m = TASK.exec(l);
      if (m && m[4]!.trim()) out.push({ line: i, done: m[2] !== " ", text: m[4]!.trim(), todoId: m[6] });
    }
    if (l.includes(SOMA_END)) inBlock = false;
  });
  return out;
}

export interface TodoLike {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskLink {
  /** The note's new text: new tasks carry their to-do's id, ticks follow the to-do. */
  text: string;
  /** To-dos to create, for tasks written in the note: `id` is already chosen. */
  create: { id: string; text: string }[];
  /** To-dos ticked in the note. */
  done: string[];
}

/**
 * Links a note's checkboxes with SOMA's to-dos. A task without an id becomes a
 * to-do and gets its id; after that, a tick on either side ticks the other —
 * done wins, because nobody un-ticks a thing on purpose often enough to be
 * worth guessing which side meant it.
 */
export function linkTasks(text: string, todos: readonly TodoLike[], newId: () => string): TaskLink {
  const lines = text.split("\n");
  const byId = new Map(todos.map((t) => [t.id, t]));
  const out: TaskLink = { text, create: [], done: [] };
  for (const task of noteTasks(text)) {
    const m = TASK.exec(lines[task.line]!)!;
    if (!task.todoId) {
      const id = newId();
      out.create.push({ id, text: task.text });
      lines[task.line] = `${m[1]}${m[2]}${m[3]}${task.text} ^s-${id}`;
      if (task.done) out.done.push(id);
      continue;
    }
    const todo = byId.get(task.todoId);
    if (!todo) continue;
    if (task.done && !todo.done) out.done.push(todo.id);
    if (todo.done && !task.done) lines[task.line] = `${m[1]}x${m[3]}${m[4]}${m[5] ?? ""}`;
  }
  out.text = lines.join("\n");
  return out;
}

// ------------------------------------------------------------- generated pages

export interface DailyInput {
  date: string;
  plan: { label: string; start: string; hours: number }[];
  todos: { text: string; done: boolean; at?: string }[];
  habits: { name: string; done: boolean }[];
  readingMin: number;
}

const box = (done: boolean) => (done ? "- [x]" : "- [ ]");

/** The day's plan, to-dos, habits and reading, for the daily note. */
export function dailyBlock(d: DailyInput): string {
  const out: string[] = [];
  if (d.plan.length) {
    out.push("## Plan");
    for (const b of d.plan) out.push(`- ${b.start} ${b.label} (${+b.hours.toFixed(2)} h)`);
    out.push("");
  }
  out.push("## To do");
  if (!d.todos.length) out.push("Nothing on the list.");
  for (const t of d.todos) out.push(`${box(t.done)} ${t.at ? `${t.at} ` : ""}${t.text}`);
  out.push("", "## Habits");
  const done = d.habits.filter((h) => h.done).length;
  out.push(`${done} of ${d.habits.length} done`);
  for (const h of d.habits) out.push(`${box(h.done)} ${h.name}`);
  out.push("", `## Reading`, `${d.readingMin} min`);
  out.push("", `_Kept up to date by SOMA. Write your own notes above or below this block._`);
  return out.join("\n");
}

export interface WeekInput {
  week: string;
  from: string;
  to: string;
  habits: { name: string; days: number; goal: number }[];
  readingMin: number;
  sessions: number;
  goalsDone: number;
  goalsTotal: number;
  todosDone: number;
  todosTotal: number;
}

/** A week in numbers, for the weekly review note. */
export function weekBlock(w: WeekInput): string {
  const out = [`## Week ${w.week.slice(-2)} · ${w.from} to ${w.to}`, ""];
  out.push(`- Goals: ${w.goalsDone} of ${w.goalsTotal} done`);
  out.push(`- To-dos: ${w.todosDone} of ${w.todosTotal} done`);
  out.push(`- Training: ${w.sessions} session${w.sessions === 1 ? "" : "s"}`);
  out.push(`- Reading: ${w.readingMin} min`);
  if (w.habits.length) {
    out.push("", "## Habits");
    for (const h of w.habits) out.push(`- ${h.name}: ${h.days} / ${h.goal} days`);
  }
  out.push("", "## What went well", "", "## What to change next week");
  return out.join("\n");
}

export interface GoalPageInput {
  title: string;
  horizon: string;
  periodLabel: string;
  daysLeft: number;
  progress?: number;
  target?: number;
  unit?: string;
  done: boolean;
  steps: { title: string; done: boolean; horizon: string }[];
}

/** A goal's page: where it stands and the smaller goals serving it. */
export function goalBlock(g: GoalPageInput): string {
  const out = [`**${g.horizon} goal** · ${g.periodLabel} · ${g.done ? "done" : `${g.daysLeft} days left`}`];
  if (g.target) out.push(`Progress: ${g.progress ?? 0} / ${g.target}${g.unit ? ` ${g.unit}` : ""}`);
  if (g.steps.length) {
    out.push("", "## Milestones");
    for (const s of g.steps) out.push(`${box(s.done)} ${s.title} (${s.horizon})`);
  }
  out.push("", "## Plan", "Write the steps and deadlines below this block.");
  return out.join("\n");
}

/** A file name from a title: what Windows, macOS and iOS all accept. */
export function safeName(title: string): string {
  return title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
}
