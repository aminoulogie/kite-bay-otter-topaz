import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findWeakLinks, isGenuineFailure, rateExercise, stimulusSplit, tallyMuscles,
  type QualitySet,
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

// ------------------------------------------------------------ muscle tally --

test("a set the target finished counts wholly to the target", () => {
  const t = tallyMuscles([{ targetKeys: ["chest"], sets: [set({ limiter: "target" })] }]);
  assert.equal(t.chest?.sets, 1);
  assert.equal(Object.keys(t).length, 1);
});

test("a synergist-limited set sends most of the work to the synergist", () => {
  // The case this exists for: bench where the triceps gave out. Recording it
  // as full chest work overstates the chest and hides the actual ceiling.
  const t = tallyMuscles([
    {
      targetKeys: ["chest"],
      sets: [set({ limiter: "synergist", limitedBy: ["triceps"] })],
    },
  ]);
  assert.equal(t.triceps?.sets, 0.7);
  assert.equal(t.chest?.sets, 0.3);
});

test("work is split evenly when several muscles gave out", () => {
  const t = tallyMuscles([
    {
      targetKeys: ["back"],
      sets: [set({ limiter: "synergist", limitedBy: ["forearms", "biceps"] })],
    },
  ]);
  assert.equal(t.forearms?.sets, 0.35);
  assert.equal(t.biceps?.sets, 0.35);
  assert.equal(t.back?.sets, 0.3);
});

test("a synergist claimed as the limiter still leaves the target credited", () => {
  // Never zero: the target still did work, it just was not what stopped the set.
  const t = tallyMuscles([
    { targetKeys: ["back"], sets: [set({ limiter: "synergist", limitedBy: ["forearms"] })] },
  ]);
  assert.ok((t.back?.sets ?? 0) > 0);
});

test("saying a synergist stopped it without naming one keeps the target credited", () => {
  const t = tallyMuscles([
    { targetKeys: ["chest"], sets: [set({ limiter: "synergist", limitedBy: [] })] },
  ]);
  assert.equal(t.chest?.sets, 1);
  assert.equal(t.triceps, undefined);
});

test("warm-ups and drop sets do not feed the tally", () => {
  const t = tallyMuscles([
    {
      targetKeys: ["chest"],
      sets: [
        set({ type: "warmup" }),
        set({ type: "dropset" }),
        set({ done: false }),
        set({}),
      ],
    },
  ]);
  assert.equal(t.chest?.sets, 1);
});

test("average failure is weighted by share, not by raw set count", () => {
  const t = tallyMuscles([
    {
      targetKeys: ["chest"],
      sets: [
        set({ failure: 5, limiter: "target" }),
        set({ failure: 1, limiter: "synergist", limitedBy: ["triceps"] }),
      ],
    },
  ]);
  // chest carries 1.0 of a 5 and 0.3 of a 1 => 5.3 / 1.3
  assert.equal(Math.round((t.chest?.avgFail ?? 0) * 100) / 100, 4.08);
  assert.equal(t.triceps?.avgFail, 1);
});

test("fractional set counts stay readable", () => {
  const t = tallyMuscles([
    {
      targetKeys: ["chest"],
      sets: [
        set({ limiter: "synergist", limitedBy: ["triceps"] }),
        set({ limiter: "synergist", limitedBy: ["triceps"] }),
        set({ limiter: "synergist", limitedBy: ["triceps"] }),
      ],
    },
  ]);
  assert.equal(t.chest?.sets, 0.9); // not 0.8999999999999999
  assert.equal(t.triceps?.sets, 2.1);
});
