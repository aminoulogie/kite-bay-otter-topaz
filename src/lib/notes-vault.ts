/**
 * The Obsidian vault folder on this device, mirrored into `notes`, and the
 * automations that write into it. The rules are in lib/notes.ts; this is the
 * folder work (File System Access, so desktop Chromium and the PC app) and the
 * reading of SOMA's own data for the generated pages.
 *
 * Each pass, in order:
 *   1. the daily note, this week's review and each current goal's page get
 *      their SOMA block rewritten (made if missing);
 *   2. checkboxes written in any note become to-dos, and ticks cross over;
 *   3. the folder and `notes` are mirrored (planMirror).
 */

import { getLocalDateKey } from "./soma/dates.ts";
import { daysLeftIn, periodLabel, periodOf, periodRange } from "./life-goals.ts";
import { isActive } from "./todos.ts";
import {
  dailyBlock, goalBlock, isNotePath, linkTasks, planMirror, safeName, setSomaBlock, weekBlock,
  MAX_NOTE_CHARS, type Note, type VaultFile,
} from "./notes.ts";
import { useSoma } from "./store.ts";
import { clearNotesVaultHandle, getNotesVaultHandle, setNotesVaultHandle } from "./habit-photos.ts";

export const DAILY_DIR = "Daily";
export const REVIEW_DIR = "Reviews";
export const GOALS_DIR = "Goals";

// ------------------------------------------------------- the remembered folder

export function supportsNotesVault(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickNotesVault(): Promise<FileSystemDirectoryHandle> {
  const h = await window.showDirectoryPicker({ mode: "readwrite" });
  await setNotesVaultHandle(h);
  localStorage.removeItem(LAST_RUN);
  return h;
}

/** The folder chosen before, if the browser still lets SOMA in without asking. */
export async function storedNotesVault(ask = false): Promise<FileSystemDirectoryHandle | null> {
  try {
    const h = await getNotesVaultHandle();
    if (!h) return null;
    const opts = { mode: "readwrite" as const };
    if ((await h.queryPermission(opts)) === "granted") return h;
    return ask && (await h.requestPermission(opts)) === "granted" ? h : null;
  } catch {
    return null;
  }
}

export async function forgetNotesVault(): Promise<void> {
  await clearNotesVaultHandle();
  localStorage.removeItem(LAST_RUN);
}

// ---------------------------------------------------------------- the folder

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: VaultFile[]): Promise<void> {
  for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    const path = prefix + entry.name;
    if (entry.name.startsWith(".")) continue;
    if (entry.kind === "directory") {
      await walk(entry as FileSystemDirectoryHandle, path + "/", out);
    } else if (isNotePath(path)) {
      const file = await (entry as FileSystemFileHandle).getFile();
      if (file.size > MAX_NOTE_CHARS * 4) continue;
      out.push({ path, text: await file.text(), modified: file.lastModified });
    }
  }
}

async function writeFile(root: FileSystemDirectoryHandle, path: string, text: string): Promise<number> {
  const parts = path.split("/");
  let dir = root;
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
  const fh = await dir.getFileHandle(parts[parts.length - 1]!, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
  return (await fh.getFile()).lastModified;
}

// ---------------------------------------------------------------- automations

/** The notes the automations keep: daily note, weekly review, goal pages. Pure over the state. */
export function generatedNotes(s: ReturnType<typeof useSoma.getState>, now = new Date()): Map<string, string> {
  const out = new Map<string, string>();
  const today = getLocalDateKey(now);

  // The day's blocks, with clock times: one may be pinned, the rest follow it.
  const blocks = s.dayPlans[today] ?? [];
  let acc = 0;
  let first = 0;
  for (const b of blocks) {
    if (typeof b.start === "number") {
      first = b.start - acc;
      break;
    }
    acc += b.hours;
  }
  const hhmm = (h: number) => {
    const m = Math.round((((h % 24) + 24) % 24) * 60);
    return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  let at = first;
  const plan = blocks.map((b) => {
    const row = { label: b.label, start: hhmm(at), hours: b.hours };
    at += b.hours;
    return row;
  });
  out.set(`${DAILY_DIR}/${today}.md`, dailyBlock({
    date: today,
    plan,
    todos: s.todos
      .filter((t) => isActive(t, today) && (t.scope ?? "day") === "day")
      .map((t) => ({ text: t.text, done: t.done, at: t.slot?.date === today ? hhmm(t.slot.start / 60) : undefined })),
    habits: s.habits.map((h) => ({ name: h.name, done: !!h.history[today] })),
    readingMin: Number(s.reading[today]) || 0,
  }));

  const week = periodOf("week", now);
  const { from, to } = periodRange("week", week);
  const inWeek = (d: string) => d >= from && d <= to;
  const weekGoals = s.goals.filter((g) => g.horizon === "week" && g.period === week);
  const weekTodos = s.todos.filter((t) => inWeek(t.date));
  out.set(`${REVIEW_DIR}/${week}.md`, weekBlock({
    week, from, to,
    habits: s.habits.map((h) => ({
      name: h.name,
      days: Object.entries(h.history).filter(([d, v]) => v && inWeek(d)).length,
      goal: h.goalDaysPerWeek,
    })),
    readingMin: Object.entries(s.reading).filter(([d]) => inWeek(d)).reduce((a, [, m]) => a + (Number(m) || 0), 0),
    sessions: Object.keys(s.history).filter(inWeek).length,
    goalsDone: weekGoals.filter((g) => g.done).length,
    goalsTotal: weekGoals.length,
    todosDone: weekTodos.filter((t) => t.done).length,
    todosTotal: weekTodos.length,
  }));

  for (const g of s.goals) {
    if (g.period !== periodOf(g.horizon, now)) continue;
    out.set(`${GOALS_DIR}/${safeName(g.title)}.md`, goalBlock({
      title: g.title,
      horizon: g.horizon,
      periodLabel: periodLabel(g.horizon, g.period),
      daysLeft: daysLeftIn(g.horizon, g.period, now),
      progress: g.progress,
      target: g.target,
      unit: g.unit,
      done: g.done,
      steps: s.goals.filter((c) => c.parentId === g.id).map((c) => ({ title: c.title, done: c.done, horizon: c.horizon })),
    }));
  }
  return out;
}

const LAST_RUN = "soma-notes-last-mirror";

export interface MirrorResult {
  read: number;
  written: number;
  todos: number;
}

/**
 * One pass. The folder first, so an edit made in Obsidian since the last pass
 * is in the notes before anything writes around it; then the automations and
 * checkboxes, whose changes go straight back to their files.
 */
export async function mirrorNotes(root: FileSystemDirectoryHandle, now = new Date()): Promise<MirrorResult> {
  const store = useSoma.getState;
  const stamp = now.getTime();

  // 1. The folder and the notes.
  const files: VaultFile[] = [];
  await walk(root, "", files);
  const last = Number(localStorage.getItem(LAST_RUN)) || 0;
  const plan = planMirror(files, store().notes, last);
  const wrote: Note[] = [];
  for (const w of plan.write) wrote.push({ id: w.path, text: w.text, mtime: await writeFile(root, w.path, w.text) });
  store().putNotes([...plan.put, ...wrote]);
  store().removeNotes(plan.remove);

  // 2. Generated blocks (the page made if missing).
  const changed = new Map<string, string>();
  const textOf = (id: string) => changed.get(id) ?? store().notes.find((n) => n.id === id)?.text;
  for (const [path, block] of generatedNotes(store(), now)) {
    const cur = textOf(path);
    const title = `# ${path.split("/").pop()!.replace(/\.md$/, "")}\n\n`;
    const text = setSomaBlock(cur ?? title, block);
    if (text !== cur) changed.set(path, text);
  }

  // 3. Checkboxes and to-dos.
  let todos = 0;
  const today = getLocalDateKey(now);
  for (const n of store().notes) {
    const text = textOf(n.id)!;
    const r = linkTasks(text, store().todos, () => `t${stamp.toString(36)}${Math.random().toString(36).slice(2, 7)}`);
    if (r.create.length || r.done.length) {
      const s = store();
      useSoma.setState({
        todos: [
          ...s.todos.map((t) => (r.done.includes(t.id) ? { ...t, done: true } : t)),
          ...r.create.map((c) => ({ id: c.id, text: c.text, done: r.done.includes(c.id), date: today, scope: "day" as const })),
        ],
      });
      todos += r.create.length + r.done.length;
    }
    if (r.text !== text) changed.set(n.id, r.text);
  }

  const put: Note[] = [];
  for (const [path, text] of changed) put.push({ id: path, text, mtime: await writeFile(root, path, text) });
  store().putNotes(put);
  localStorage.setItem(LAST_RUN, String(Date.now()));
  return { read: plan.put.length, written: plan.write.length + put.length, todos };
}
