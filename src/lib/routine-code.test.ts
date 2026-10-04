import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODE_PREFIX, cleanCode, decodeRoutines, encodeRoutines, exercisesFor, exercisesToAdd,
  planImport, summarise,
} from "./routine-code.ts";
import type { ExerciseDef } from "./types.ts";

const ex = (name: string, over: Partial<ExerciseDef> = {}): ExerciseDef => ({
  name,
  muscle: "Chest",
  subTarget: "Mid/Lower Pec (Sternal)",
  targetKeys: ["chest"],
  position: "Mid-Range",
  risk: "Low 🟢",
  tier: "S-Tier",
  isAxial: false,
  isBW: false,
  ...over,
});

const LIB = [ex("Flat Barbell Bench Press"), ex("Larsen Press", { img: "/exercises/larsen-press.jpg" }), ex("Leg Press")];
const PUSH = { "Push 1": [{ name: "Flat Barbell Bench Press" }, { name: "Larsen Press" }] };

// ------------------------------------------------------------- round trip --

test("a code survives the round trip", async () => {
  const code = await encodeRoutines(PUSH, LIB);
  assert.ok(code.startsWith(CODE_PREFIX), "a code says what it is");
  const back = await decodeRoutines(code);
  assert.equal(back.ok, true);
  if (!back.ok) return;
  assert.deepEqual(Object.keys(back.code.routines), ["Push 1"]);
  assert.deepEqual(back.code.routines["Push 1"], PUSH["Push 1"]);
});

test("the code carries the exercises, not only their names", async () => {
  // The whole point: a name alone arrives as a stub with no muscle, no
  // picture and nothing for the body map to charge.
  const back = await decodeRoutines(await encodeRoutines(PUSH, LIB));
  assert.ok(back.ok);
  if (!back.ok) return;
  const larsen = back.code.exercises.find((e) => e.name === "Larsen Press")!;
  assert.equal(larsen.img, "/exercises/larsen-press.jpg");
  assert.deepEqual(larsen.targetKeys, ["chest"]);
});

test("only the exercises the routines mention ride along", async () => {
  // Sending the whole library would make every code a full dump and start a
  // fight over exercises the routine never names.
  const picked = exercisesFor(PUSH, LIB).map((e) => e.name);
  assert.deepEqual(picked.sort(), ["Flat Barbell Bench Press", "Larsen Press"]);
  assert.ok(!picked.includes("Leg Press"));
});

test("a code is shorter than the json it carries", async () => {
  const big: Record<string, { name: string }[]> = {};
  for (let i = 0; i < 6; i++) big[`Day ${i}`] = LIB.map((e) => ({ name: e.name }));
  const code = await encodeRoutines(big, LIB);
  const raw = JSON.stringify({ v: 1, routines: big, exercises: LIB });
  assert.ok(code.length < raw.length, `${code.length} should be under ${raw.length}`);
});

// ---------------------------------------------------------------- refusal --

test("a paste that is not a code is refused in words", async () => {
  for (const junk of ["", "   ", "hello", "https://example.com"]) {
    const r = await decodeRoutines(junk);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.ok(r.error.length > 0);
    assert.ok(!/JSON|token|undefined/i.test(r.error), `error should be readable: ${r.error}`);
  }
});

test("a truncated code says it is damaged rather than throwing", async () => {
  const code = await encodeRoutines(PUSH, LIB);
  const r = await decodeRoutines(code.slice(0, code.length - 12));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /damaged|not a routine/i);
});

test("hand-written json is accepted — refusing it would be pedantry", async () => {
  const r = await decodeRoutines(JSON.stringify({ v: 1, routines: { Mine: ["Leg Press"] }, exercises: [] }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.code.routines["Mine"], [{ name: "Leg Press" }]);
});

test("an empty routine survives the round trip instead of vanishing", async () => {
  // "Rest & Active Recovery" ships with no exercises in it, and a placeholder
  // somebody has not filled in yet is the same shape. Losing a name through
  // an export and back is worse than carrying an empty one.
  const back = await decodeRoutines(await encodeRoutines({ Placeholder: [], Real: [{ name: "Leg Press" }] }, LIB));
  assert.ok(back.ok);
  if (!back.ok) return;
  assert.deepEqual(Object.keys(back.code.routines).sort(), ["Placeholder", "Real"]);
  assert.deepEqual(back.code.routines["Placeholder"], []);
});

test("a code with no routines in it is refused", async () => {
  assert.equal(cleanCode({ v: 1, routines: {}, exercises: [] }), null);
  assert.equal(cleanCode(null), null);
  assert.equal(cleanCode("nope"), null);
  const r = await decodeRoutines(JSON.stringify({ v: 1, routines: {} }));
  assert.equal(r.ok, false);
});

test("rubbish inside a routine is dropped, not imported", () => {
  const c = cleanCode({
    v: 1,
    routines: { Good: [{ name: "Leg Press" }, { name: "  " }, null, 7, "Hack Squat"], _hidden: ["x"], "  ": ["y"] },
    exercises: [{ name: "Leg Press" }, null, { muscle: "Chest" }],
  })!;
  assert.deepEqual(Object.keys(c.routines), ["Good"], "underscore and blank names are not routines");
  assert.deepEqual(c.routines["Good"], [{ name: "Leg Press" }, { name: "Hack Squat" }]);
  assert.equal(c.exercises.length, 1);
});

// ------------------------------------------------------------------- plan --

test("the plan separates what is new from what it would overwrite", () => {
  const code = cleanCode({ v: 1, routines: { "Push 1": [{ name: "Larsen Press" }], Mine: [{ name: "Leg Press" }] }, exercises: [ex("Larsen Press")] })!;
  const plan = planImport(code, { Mine: [] }, [ex("Leg Press")]);
  assert.deepEqual(plan.added, ["Push 1"]);
  assert.deepEqual(plan.replaced, ["Mine"], "a name the device already has is a replacement, and must be said so");
  assert.deepEqual(plan.newExercises, ["Larsen Press"]);
  assert.deepEqual(plan.unknown, []);
});

test("an exercise nobody can describe is reported rather than hidden", () => {
  // It still imports — a bare name is better than a silently dropped row —
  // but the sheet has to say so.
  const code = cleanCode({ v: 1, routines: { R: [{ name: "Jefferson Curl" }] }, exercises: [] })!;
  const plan = planImport(code, {}, [ex("Leg Press")]);
  assert.deepEqual(plan.unknown, ["Jefferson Curl"]);
  assert.deepEqual(plan.newExercises, []);
});

test("an exercise the device already has is not counted as new", () => {
  const code = cleanCode({ v: 1, routines: { R: [{ name: "Leg Press" }] }, exercises: [ex("Leg Press")] })!;
  const plan = planImport(code, {}, [ex("Leg Press")]);
  assert.deepEqual(plan.newExercises, []);
});

test("a name repeated across routines is counted once", () => {
  const code = cleanCode({
    v: 1,
    routines: { A: [{ name: "Larsen Press" }], B: [{ name: "Larsen Press" }] },
    exercises: [ex("Larsen Press")],
  })!;
  assert.deepEqual(planImport(code, {}, []).newExercises, ["Larsen Press"]);
});

test("matching ignores case, so one exercise does not become two", () => {
  const code = cleanCode({ v: 1, routines: { R: [{ name: "leg press" }] }, exercises: [ex("leg press")] })!;
  assert.deepEqual(planImport(code, {}, [ex("Leg Press")]).newExercises, []);
  assert.deepEqual(exercisesToAdd(code, [ex("Leg Press")]), []);
});

// ------------------------------------------------------------------ apply --

test("the device's own exercise wins a collision", () => {
  // Someone who fixed an exercise's muscle, or put their own photo on it,
  // must not have that undone by importing a routine that mentions it.
  const mine = ex("Leg Press", { muscle: "Legs", photoId: "mine" });
  const code = cleanCode({ v: 1, routines: { R: [{ name: "Leg Press" }] }, exercises: [ex("Leg Press", { muscle: "Chest" })] })!;
  assert.deepEqual(exercisesToAdd(code, [mine]), []);
});

test("only the missing definitions are added, once each", () => {
  const code = cleanCode({
    v: 1,
    routines: { R: [{ name: "A" }, { name: "B" }] },
    exercises: [ex("A"), ex("B"), ex("A")],
  })!;
  assert.deepEqual(exercisesToAdd(code, [ex("B")]).map((e) => e.name), ["A"]);
});

test("the summary counts what the sheet shows", () => {
  const s = summarise({ added: ["a", "b"], replaced: ["c"], newExercises: ["x"], unknown: ["y"] });
  assert.match(s, /3 routines/);
  assert.match(s, /1 replaced/);
  assert.match(s, /1 new exercise\b/);
  assert.match(s, /1 unrecognised/);
  assert.match(summarise({ added: ["a"], replaced: [], newExercises: [], unknown: [] }), /^1 routine$/);
});
