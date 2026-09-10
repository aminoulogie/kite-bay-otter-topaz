import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * The hook itself needs React to run, so these assert the two properties that
 * define it by reading the source. Crude, but it pins the exact two mistakes
 * that produced the bug and would produce it again.
 */
const src = readFileSync(new URL("./use-day-draft.ts", import.meta.url), "utf8");

test("the reset is keyed on the date and nothing else", () => {
  // Depending on the stored VALUE instead would yank a half-typed number out
  // from under the user whenever anything else in the app saved.
  const deps = src.match(/useEffect\([\s\S]*?\}, \[([^\]]*)\]\)/)?.[1] ?? "";
  assert.equal(deps.trim(), "date", `effect depends on [${deps}]`);
});

test("the initial reader is held in a ref, not a dependency", () => {
  // A caller passes an inline arrow, which is a new function every render. In
  // the dependency array that would re-seed on every render and the field
  // could never be typed in at all.
  assert.match(src, /const read = useRef\(initial\)/);
  assert.match(src, /read\.current = initial/);
});

test("the first render does not count as a date change", () => {
  // Without the guard the effect fires once on mount and re-seeds something
  // useState has already seeded — harmless here, but it would discard a value
  // set between render and effect.
  assert.match(src, /seededFor/);
  assert.match(src, /if \(seededFor\.current === date\) return/);
});

test("every date-scoped draft in the app goes through the hook", () => {
  // The bug was four panels each seeding useState from the day and never
  // re-reading. This fails if a fifth appears.
  for (const file of [
    "../components/views/BodyView.tsx",
    "../components/views/WorkoutView.tsx",
  ]) {
    const view = readFileSync(new URL(file, import.meta.url), "utf8");
    const suspicious = [...view.matchAll(/useState[^\n]*\b(day|existing)\b[^\n]*/g)].map((m) => m[0]);
    assert.deepEqual(
      suspicious,
      [],
      `${file} seeds useState from the day's data instead of useDayDraft:\n  ${suspicious.join("\n  ")}`,
    );
  }
});
