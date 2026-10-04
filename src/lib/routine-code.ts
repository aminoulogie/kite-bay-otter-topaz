/**
 * Routines as a code you can paste.
 *
 * The problem this solves is not storage, it is DELIVERY. A routine written
 * into the app's source only reaches a phone when a new build is published,
 * which for the native app is a manual job on a macOS runner that takes the
 * better part of an hour. A code you paste arrives in the time it takes to
 * paste it.
 *
 * **The code carries the exercises, not just their names.** A routine is a
 * list of names, and a name that the receiving phone has never heard of gets
 * a stub: no muscle, no sub-target, no picture, and nothing for recovery or
 * the body map to charge the work to. So the exported code includes the full
 * definition of every exercise its routines mention, and importing one adds
 * the definitions the device is missing before it adds the routines. That is
 * what makes a code self-contained rather than a list of hopeful strings.
 *
 * The wire format is JSON, deflated and base64'd, behind a short prefix:
 *
 *     SOMA-R1:<base64>
 *
 * The prefix is there so a person can tell at a glance what they are holding,
 * and so a paste of the wrong thing fails with "that is not a routine code"
 * instead of a JSON parse error. Plain JSON is also accepted on the way in —
 * if someone hand-writes a routine file, refusing it on formatting grounds
 * would be pedantry.
 */

import type { ExerciseDef } from "./types";

/** What a routine stores: names, in order. */
export interface RoutineItem {
  name: string;
}

export interface RoutineCode {
  /** Format version, so a future shape can be told apart from this one. */
  v: 1;
  /** Routine name → its exercises, in order. */
  routines: Record<string, RoutineItem[]>;
  /**
   * Definitions for the exercises those routines name. Only the ones the
   * sender had; an exercise the sender was missing cannot be described.
   */
  exercises: ExerciseDef[];
  /** When it was made, for the "this code is from…" line. Epoch ms. */
  at?: number;
  /** Free text the sender can attach, shown before the import is applied. */
  note?: string;
}

export const CODE_PREFIX = "SOMA-R1:";

/* ------------------------------------------------------------- encoding --
 *
 * Deflate then base64. A six-day programme with its exercise definitions is
 * about 6KB of JSON and compresses to roughly a fifth of that, which is the
 * difference between a code you can paste into a message and one you cannot.
 * Both halves are done with platform primitives so there is no dependency to
 * carry and nothing to keep in step.
 */

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  // btoa is defined in browsers and in Node 16+, which covers the app and the
  // test runner both.
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deflate(text: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(text);
  // CompressionStream is absent in older Safari. The code is still valid
  // without it — just longer — and the decoder sniffs which it was given.
  if (typeof CompressionStream === "undefined") return input;
  const cs = new CompressionStream("deflate-raw");
  const buf = await new Response(
    new Blob([input as BlobPart]).stream().pipeThrough(cs),
  ).arrayBuffer();
  return new Uint8Array(buf);
}

async function inflate(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    return new TextDecoder().decode(bytes);
  }
  try {
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(
      new Blob([bytes as BlobPart]).stream().pipeThrough(ds),
    ).arrayBuffer();
    return new TextDecoder().decode(buf);
  } catch {
    // Not deflated: a code made where CompressionStream was missing, or a
    // hand-written one. Reading it as plain text is the right fallback.
    return new TextDecoder().decode(bytes);
  }
}

/** Build the pasteable code for a set of routines. */
export async function encodeRoutines(
  routines: Record<string, RoutineItem[]>,
  allExercises: ExerciseDef[],
  note?: string,
): Promise<string> {
  const payload: RoutineCode = {
    v: 1,
    routines,
    exercises: exercisesFor(routines, allExercises),
    at: Date.now(),
    ...(note ? { note } : {}),
  };
  return CODE_PREFIX + toBase64(await deflate(JSON.stringify(payload)));
}

/**
 * The definitions the named routines depend on.
 *
 * Only what is referenced: sending the whole library in every code would turn
 * a six-line routine into a eighty-exercise dump, and the receiver's own
 * entries would start fighting the sender's over every unrelated exercise.
 */
export function exercisesFor(
  routines: Record<string, RoutineItem[]>,
  allExercises: ExerciseDef[],
): ExerciseDef[] {
  const wanted = new Set<string>();
  for (const list of Object.values(routines ?? {})) {
    for (const it of list ?? []) if (it?.name) wanted.add(it.name.toLowerCase());
  }
  return (allExercises ?? []).filter((e) => wanted.has(e.name?.toLowerCase()));
}

/* ------------------------------------------------------------- decoding -- */

export type DecodeResult =
  | { ok: true; code: RoutineCode }
  | { ok: false; error: string };

/**
 * Read a pasted code.
 *
 * Accepts the prefixed form, and bare JSON for anything hand-written. Every
 * failure says what is wrong in words rather than throwing: this runs on a
 * value the user pasted, and "Unexpected token < in JSON at position 0" is
 * not a sentence anybody should be shown.
 */
export async function decodeRoutines(raw: string): Promise<DecodeResult> {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Nothing pasted." };

  let json: string;
  if (text.startsWith(CODE_PREFIX)) {
    const b64 = text.slice(CODE_PREFIX.length).replace(/\s+/g, "");
    try {
      json = await inflate(fromBase64(b64));
    } catch {
      return { ok: false, error: "That code is damaged — copy it again, all of it." };
    }
  } else if (text.startsWith("{")) {
    json = text;
  } else {
    return { ok: false, error: `That is not a routine code. One starts with ${CODE_PREFIX}` };
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "That code is damaged — copy it again, all of it." };
  }

  const clean = cleanCode(data);
  if (!clean) return { ok: false, error: "That code has no routines in it." };
  return { ok: true, code: clean };
}

/** A decoded code with every field made safe, or null if there is nothing usable. */
export function cleanCode(raw: unknown): RoutineCode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<RoutineCode>;
  const routines: Record<string, RoutineItem[]> = {};
  for (const [name, list] of Object.entries(r.routines ?? {})) {
    const key = String(name ?? "").trim();
    if (!key || key.startsWith("_")) continue;
    const items = (Array.isArray(list) ? list : [])
      .map((i) => (typeof i === "string" ? { name: i } : i))
      .filter((i): i is RoutineItem => !!i && typeof i.name === "string" && !!i.name.trim())
      .map((i) => ({ name: i.name.trim() }));
    // An EMPTY routine is kept. It carries no exercises and importing it
    // does nothing useful, but a round trip that quietly loses a name is
    // worse than a useless one surviving: "Rest & Active Recovery" ships
    // empty, and a placeholder somebody made and had not filled in yet would
    // disappear through an export and back.
    routines[key] = items;
  }
  if (!Object.keys(routines).length) return null;

  const exercises = (Array.isArray(r.exercises) ? r.exercises : [])
    .filter((e): e is ExerciseDef => !!e && typeof (e as ExerciseDef).name === "string" && !!(e as ExerciseDef).name.trim());

  return {
    v: 1,
    routines,
    exercises,
    ...(Number.isFinite(Number(r.at)) ? { at: Number(r.at) } : {}),
    ...(typeof r.note === "string" && r.note ? { note: r.note } : {}),
  };
}

/* ----------------------------------------------------------- the import -- */

export interface ImportPlan {
  /** Routines this device does not have under that name. */
  added: string[];
  /** Routines it already has, which this code would overwrite. */
  replaced: string[];
  /** Exercise definitions the device is missing and the code supplies. */
  newExercises: string[];
  /**
   * Exercises the routines name that NOBODY can describe — not the device,
   * not the code. They still import; they just arrive as bare names.
   */
  unknown: string[];
}

/**
 * What applying this code would do, worked out before anything is written.
 *
 * Separate from applying it so the sheet can say "3 routines, 7 new
 * exercises, 1 of them will be replaced" and the user can decide. An import
 * that silently overwrites a routine of the same name is how someone loses
 * the one they spent an evening building.
 */
export function planImport(
  code: RoutineCode,
  haveRoutines: Record<string, unknown>,
  haveExercises: { name: string }[],
): ImportPlan {
  const known = new Set((haveExercises ?? []).map((e) => e.name?.toLowerCase()));
  const supplied = new Map(
    (code.exercises ?? []).map((e) => [e.name.toLowerCase(), e] as const),
  );

  const added: string[] = [];
  const replaced: string[] = [];
  for (const name of Object.keys(code.routines)) {
    (Object.prototype.hasOwnProperty.call(haveRoutines ?? {}, name) ? replaced : added).push(name);
  }

  const newExercises: string[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(code.routines)) {
    for (const it of list) {
      const key = it.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (known.has(key)) continue;
      if (supplied.has(key)) newExercises.push(supplied.get(key)!.name);
      else unknown.push(it.name);
    }
  }
  return { added, replaced, newExercises, unknown };
}

/**
 * The exercise definitions to add, in the order the plan found them.
 *
 * The device's own entry always wins a name collision. Someone who has
 * corrected an exercise's muscle, or set their own photo on it, should not
 * have that undone by importing a routine that happens to mention it.
 */
export function exercisesToAdd(
  code: RoutineCode,
  haveExercises: { name: string }[],
): ExerciseDef[] {
  const known = new Set((haveExercises ?? []).map((e) => e.name?.toLowerCase()));
  const out: ExerciseDef[] = [];
  const seen = new Set<string>();
  for (const e of code.exercises ?? []) {
    const key = e.name.toLowerCase();
    if (known.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** One line saying what happened, for the toast. */
export function summarise(plan: ImportPlan): string {
  const bits: string[] = [];
  const n = plan.added.length + plan.replaced.length;
  bits.push(`${n} routine${n === 1 ? "" : "s"}`);
  if (plan.replaced.length) bits.push(`${plan.replaced.length} replaced`);
  if (plan.newExercises.length) bits.push(`${plan.newExercises.length} new exercise${plan.newExercises.length === 1 ? "" : "s"}`);
  if (plan.unknown.length) bits.push(`${plan.unknown.length} unrecognised`);
  return bits.join(" · ");
}
