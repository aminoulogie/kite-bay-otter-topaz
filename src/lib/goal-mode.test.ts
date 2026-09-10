import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GOAL_LIST, STRENGTH_SET_SCALE, applyGoal, landmarkTable, landmarksFor, statusFor,
  type Landmarks, type ReportRow,
} from "./goal-mode.ts";

const CHEST: Landmarks = { mev: 8, mav: 16, mrv: 22, label: "Chest" };

test("hypertrophy leaves the published table exactly as it is", () => {
  assert.deepEqual(landmarksFor(CHEST, "hypertrophy"), CHEST);
  // And an unset goal behaves as hypertrophy rather than throwing.
  assert.deepEqual(landmarksFor(CHEST, undefined), CHEST);
  assert.deepEqual(landmarksFor(CHEST, "nonsense" as never), CHEST);
});

test("strength asks for about three quarters of the sets", () => {
  const s = landmarksFor(CHEST, "strength");
  assert.ok(s.mrv < CHEST.mrv, "the ceiling comes down");
  assert.equal(s.mrv, Math.ceil(CHEST.mrv * STRENGTH_SET_SCALE));
  assert.equal(s.mev, Math.ceil(CHEST.mev * STRENGTH_SET_SCALE));
});

test("recomp keeps the floor and caps the ceiling at MAV", () => {
  const r = landmarksFor(CHEST, "recomp");
  assert.equal(r.mev, CHEST.mev, "you still have to do enough to hold what you have");
  assert.equal(r.mrv, CHEST.mav, "and nothing above the productive band");
});

test("maintain makes MEV the target rather than the floor", () => {
  const m = landmarksFor(CHEST, "maintain");
  assert.equal(m.mev, CHEST.mev);
  assert.equal(m.mav, CHEST.mev, "the productive band collapses onto the minimum");
  assert.ok(m.mrv > m.mav);
});

test("every mode keeps the three landmarks in order", () => {
  // The bug this guards: a mode that leaves mav below mev makes statusFor
  // report the same set count as both under and over at once.
  for (const g of GOAL_LIST) {
    for (const lm of [CHEST, { mev: 2, mav: 6, mrv: 12, label: "Neck" }, { mev: 3, mav: 8, mrv: 14, label: "Lower Back" }]) {
      const out = landmarksFor(lm, g.id);
      assert.ok(out.mev >= 1, `${g.id} floor stays a real set`);
      assert.ok(out.mav >= out.mev, `${g.id} ${lm.label}: mav >= mev`);
      assert.ok(out.mrv >= out.mav, `${g.id} ${lm.label}: mrv >= mav`);
    }
  }
});

test("a set count lands in exactly one tier under every mode", () => {
  for (const g of GOAL_LIST) {
    const lm = landmarksFor(CHEST, g.id);
    for (let sets = 0; sets <= 40; sets++) {
      const { tier } = statusFor(sets, lm);
      assert.ok(["none", "under", "optimal", "high", "over"].includes(tier));
      if (sets === 0) assert.equal(tier, "none");
    }
  }
});

test("twelve sets of chest reads differently depending on what you are training for", () => {
  const twelve = (goal: Parameters<typeof landmarksFor>[1]) =>
    statusFor(12, landmarksFor(CHEST, goal)).tier;
  assert.equal(twelve("hypertrophy"), "optimal");
  // Strength scales MAV to 12, so twelve sets sits exactly at the top of the
  // productive band — and the very next set is above it.
  assert.equal(twelve("strength"), "optimal");
  assert.equal(statusFor(14, landmarksFor(CHEST, "strength")).tier, "high");
  assert.equal(twelve("recomp"), "optimal");
  // Maintenance targets the eight-set floor, so twelve is already past the
  // band it wants you in, and thirteen is more than it will defend at all.
  assert.equal(twelve("maintain"), "high");
  assert.equal(statusFor(13, landmarksFor(CHEST, "maintain")).tier, "over");
});

test("the report is re-judged, but the set counts are never touched", () => {
  const rows: ReportRow[] = [
    { key: "chest", label: "Chest", sets: 18, mev: 8, mav: 16, mrv: 22, tier: "high", note: "" },
    { key: "biceps", label: "Biceps", sets: 4, mev: 6, mav: 14, mrv: 20, tier: "under", note: "" },
  ];
  const out = applyGoal(rows, "maintain");
  assert.deepEqual(out.map((r) => r.sets).sort((a, b) => a - b), [4, 18]);
  const chest = out.find((r) => r.key === "chest")!;
  assert.equal(chest.tier, "over");
  assert.match(chest.note, /Past MRV/);
  // Biceps at 4 is below a hypertrophy MEV of 6 but exactly at maintenance.
  assert.equal(out.find((r) => r.key === "biceps")!.tier, "under");
});

test("the worst rows sort to the top, whatever the goal", () => {
  const rows: ReportRow[] = [
    { key: "a", label: "Optimal", sets: 12, mev: 8, mav: 16, mrv: 22, tier: "", note: "" },
    { key: "b", label: "Over", sets: 40, mev: 8, mav: 16, mrv: 22, tier: "", note: "" },
    { key: "c", label: "Under", sets: 2, mev: 8, mav: 16, mrv: 22, tier: "", note: "" },
  ];
  assert.deepEqual(applyGoal(rows, "hypertrophy").map((r) => r.key), ["b", "c", "a"]);
});

test("the whole table converts at once", () => {
  const table = landmarkTable({ chest: CHEST, neck: { mev: 2, mav: 6, mrv: 12, label: "Neck" } }, "strength");
  assert.equal(Object.keys(table).length, 2);
  assert.equal(table.chest!.label, "Chest");
  assert.ok(table.neck!.mrv < 12);
});
