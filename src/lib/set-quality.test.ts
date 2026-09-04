import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findWeakLinks, isGenuineFailure, rateExercise, stimulusSplit, type QualitySet,
} from "./set-quality.ts";

const set = (q: Partial<QualitySet>): QualitySet =>
  ({ weight: 60, reps: 8, failure: 3, done: true, type: "normal", ...q }) as QualitySet;

test("a grinding set whose synergist failed is not a target failure", () => {
  // The case this whole model exists for: triceps die on a barbell press, the
  // lift fails, and the chest never actually reached failure.
  assert.equal(
    isGenuineFailure({ limiter: "synergist", closeness: "nothing", burn: 3 }),
    false,
  );
  assert.equal(
    isGenuineFailure({ limiter: "target", closeness: "nothing", burn: 3 }),
    true,
  );
});

test("nothing-left alone is not enough without corroboration", () => {
  assert.equal(isGenuineFailure({ limiter: "target", closeness: "nothing" }), false);
  assert.equal(isGenuineFailure({ limiter: "target", closeness: "nothing", burn: 1 }), false);
  assert.equal(isGenuineFailure({ limiter: "target", closeness: "forced", burn: 2 }), true);
});

test("stopping by choice never counts, however it felt", () => {
  assert.equal(isGenuineFailure({ limiter: "choice", closeness: "nothing", burn: 3 }), false);
  assert.equal(isGenuineFailure({ limiter: "form", closeness: "nothing", burn: 3 }), false);
});

test("stimulus follows the muscle that actually failed", () => {
  const ex = { targetKeys: ["chest"] };
  const normal = stimulusSplit(ex, { limiter: "target" }, ["triceps"]);
  assert.equal(normal.chest, 1);
  assert.equal(normal.triceps, undefined);

  // When the triceps gave out, they did the limiting work and earn most of it.
  const limited = stimulusSplit(ex, { limiter: "synergist" }, ["triceps"]);
  assert.ok(limited.triceps! > limited.chest!, "the limiter should out-earn the target");
  assert.equal(
    Math.round((limited.triceps! + limited.chest!) * 100) / 100,
    1,
    "a set is still one set of stimulus, just distributed differently",
  );
});

test("a lift repeatedly limited by a synergist is flagged", () => {
  // The forearms-limiting-back case: the back can do more, the grip cannot.
  const sessions = [
    {
      exercises: [
        {
          name: "Barbell Bent Over Row",
          targetKeys: ["upper_back"],
          sets: [
            set({ limiter: "synergist", limitedBy: ["forearm"] }),
            set({ limiter: "synergist", limitedBy: ["forearm"] }),
            set({ limiter: "synergist", limitedBy: ["forearm"] }),
            set({ limiter: "target" }),
            set({ limiter: "target" }),
            set({ limiter: "synergist", limitedBy: ["forearm"] }),
          ],
        },
      ],
    },
  ];
  const links = findWeakLinks(sessions);
  assert.equal(links.length, 1);
  assert.equal(links[0]!.limiterKey, "forearm");
  assert.equal(links[0]!.exercise, "Barbell Bent Over Row");
  assert.ok(links[0]!.share > 0.6);
});

test("a weak link needs enough sets before it is claimed", () => {
  // Two bad sets is a bad day, not a structural problem worth acting on.
  const sessions = [
    {
      exercises: [
        {
          name: "Lat Pulldown",
          targetKeys: ["upper_back"],
          sets: [set({ limiter: "synergist", limitedBy: ["forearm"] })],
        },
      ],
    },
  ];
  assert.deepEqual(findWeakLinks(sessions), []);
});

test("an exercise whose target never fails rates below one that works", () => {
  const e1rm = [{ date: "2026-01-01", value: 100 }, { date: "2026-06-01", value: 110 }];

  const works = rateExercise({
    sets: Array.from({ length: 8 }, () =>
      ({ limiter: "target", closeness: "nothing", burn: 3 }) as QualitySet),
    pumps: [3, 3],
    e1rmByDate: e1rm,
  });
  const doesnt = rateExercise({
    sets: Array.from({ length: 8 }, () =>
      ({ limiter: "synergist", closeness: "nothing", burn: 1 }) as QualitySet),
    pumps: [1, 1],
    e1rmByDate: e1rm,
  });

  assert.ok(works.score > doesnt.score, `${works.score} should beat ${doesnt.score}`);
  assert.ok(works.score <= 10 && doesnt.score >= 0, "stays inside 0-10");
});

test("rating reports low confidence until there is enough data", () => {
  // Imported history has no limiter at all, so its rating must not look
  // authoritative just because a number came out.
  const r = rateExercise({ sets: [{ burn: 3 }], pumps: [], e1rmByDate: [] });
  assert.equal(r.confidence, "low");
  assert.equal(r.sampleSets, 0);
});

test("an axial lift must deliver more to rate the same", () => {
  const sets = Array.from({ length: 6 }, () =>
    ({ limiter: "target", closeness: "nothing", burn: 2 }) as QualitySet);
  const machine = rateExercise({ sets, pumps: [2], e1rmByDate: [] });
  const axial = rateExercise({ sets, pumps: [2], e1rmByDate: [], isAxial: true });
  assert.ok(axial.score < machine.score, "systemic fatigue should cost something");
});
