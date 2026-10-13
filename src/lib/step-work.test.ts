import assert from "node:assert/strict";
import { test } from "node:test";
import { draftPost, openWork, pendingSteps, stepWorkMs } from "./step-work.ts";
import type { Project } from "./projects.ts";

const H = 3_600_000;
const proj = (): Project =>
  ({
    id: "p",
    name: "EPL",
    color: "#000",
    status: "active",
    createdAt: 0,
    steps: [
      { id: "a", label: "Title block", done: true, work: [{ start: 9 * H, end: 10 * H }] },
      { id: "b", label: "Grid head", done: true, work: [{ start: 10 * H, end: 10.5 * H }, { start: 11 * H, end: 11.25 * H }] },
      { id: "c", label: "Level head", done: false, work: [{ start: 12 * H }] },
      { id: "d", label: "Posted already", done: true, work: [{ start: 8 * H, end: 9 * H, entryId: "e1" }] },
    ],
  }) as Project;

test("the running step, and time per step", () => {
  assert.deepEqual(openWork([proj()]), { projectId: "p", stepId: "c", start: 12 * H });
  assert.equal(stepWorkMs(proj().steps[1]!), 0.75 * H);
});

test("pending: closed and not in a live entry; a deleted entry makes it pending again", () => {
  assert.deepEqual(pendingSteps(proj(), new Set(["e1"])).map((x) => x.step.id), ["a", "b"]);
  assert.deepEqual(pendingSteps(proj(), new Set()).map((x) => x.step.id), ["a", "b", "d"]);
});

test("merge makes one entry of the total; separate makes one each", () => {
  const merged = draftPost(proj(), ["a", "b"], "merge", new Set(["e1"]));
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.start, 9 * H);
  assert.equal(merged[0]!.end - merged[0]!.start, 1.75 * H);
  assert.equal(merged[0]!.note, "Title block; Grid head");
  assert.equal(merged[0]!.stepId, undefined);
  const each = draftPost(proj(), ["a", "b"], "separate", new Set(["e1"]));
  assert.deepEqual(each.map((d) => [d.note, (d.end - d.start) / H, d.stepId]), [["Title block", 1, "a"], ["Grid head", 0.75, "b"]]);
  assert.deepEqual(draftPost(proj(), ["c"], "merge", new Set()), [], "a running step is not postable");
});
