import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEBT_THRESHOLD, MAX_ACTIONS, MIN_LOGGED_DAYS, coachBrief, lastNDays,
  type BriefInput, type VolumeRow,
} from "./coach-brief.ts";

const TODAY = "2026-09-10";

function volume(over: Partial<VolumeRow>[] = []): VolumeRow[] {
  const base: VolumeRow = { label: "Chest", sets: 12, mev: 8, mav: 16, mrv: 22, tier: "optimal" };
  return over.length ? over.map((o) => ({ ...base, ...o })) : [base];
}

/** Enough logged days that the global floor is never the thing being tested. */
function enoughDays() {
  const history: BriefInput["history"] = {};
  const nutrition: BriefInput["nutrition"] = {};
  for (const d of lastNDays(TODAY, 10)) {
    nutrition[d] = { goals: {}, water: 0, creatine: 0, items: [{ name: "x", cals: 500, p: 40, c: 0, f: 0 }] } as never;
    history[d] = { split: "Push", exercises: [{ name: "Bench", sets: [] }] } as never;
  }
  return { history, nutrition };
}

function input(over: Partial<BriefInput> = {}): BriefInput {
  const { history, nutrition } = enoughDays();
  return {
    today: TODAY,
    horizon: "week",
    history,
    nutrition,
    habits: [],
    hunger: [],
    phase: "maintain",
    volume: volume(),
    sleepDebt: 0,
    stalled: [],
    isDeload: false,
    ...over,
  };
}

test("the last seven days end on today and run backwards", () => {
  const week = lastNDays(TODAY, 7);
  assert.equal(week.length, 7);
  assert.equal(week[6], TODAY);
  assert.equal(week[0], "2026-09-04");
});

test("it says nothing at all on a fresh install", () => {
  const b = coachBrief(input({ history: {}, nutrition: {} }));
  assert.deepEqual(b.actions, []);
  assert.match(b.withheld ?? "", /0 so far/);
  assert.match(b.withheld ?? "", new RegExp(String(MIN_LOGGED_DAYS)));
});

test("it still says nothing one day short of the floor", () => {
  // The specific failure this guards: a brief that fires on six days of data
  // and confidently names a trend it cannot see.
  const nutrition: BriefInput["nutrition"] = {};
  for (const d of lastNDays(TODAY, MIN_LOGGED_DAYS - 1)) {
    nutrition[d] = { goals: {}, water: 0, creatine: 0, items: [{ name: "x", cals: 1, p: 1, c: 0, f: 0 }] } as never;
  }
  assert.deepEqual(coachBrief(input({ history: {}, nutrition })).actions, []);
});

test("never more than three, however much is wrong", () => {
  const b = coachBrief(
    input({
      sleepDebt: 20,
      isDeload: true,
      phase: "bulk",
      hunger: lastNDays(TODAY, 7).map((date) => ({ id: date, date, level: 3, ts: 0 })) as never,
      volume: volume([
        { label: "Chest", sets: 30, mrv: 22 },
        { label: "Biceps", sets: 2, mev: 6, mrv: 20 },
      ]),
      stalled: [{ name: "Bench", sessions: 4 }],
    }),
  );
  assert.equal(b.actions.length, MAX_ACTIONS);
  assert.equal(b.withheld, null);
});

test("too much volume outranks everything else that is wrong", () => {
  const b = coachBrief(
    input({ sleepDebt: 12, volume: volume([{ label: "Chest", sets: 28, mrv: 22 }]) }),
  );
  assert.equal(b.actions[0]?.id, "over-mrv");
  assert.match(b.actions[0]!.text, /Cut 6 sets of chest/);
  assert.match(b.actions[0]!.why, /28 working sets against an MRV of 22/);
});

test("sleep debt has to clear the threshold, not merely exist", () => {
  const under = coachBrief(input({ sleepDebt: DEBT_THRESHOLD - 0.1 }));
  assert.ok(!under.actions.some((a) => a.id === "sleep-debt"));
  const over = coachBrief(input({ sleepDebt: DEBT_THRESHOLD }));
  assert.ok(over.actions.some((a) => a.id === "sleep-debt"));
});

test("the same input gives the same three lines in the same order", () => {
  const args = input({
    sleepDebt: 10,
    isDeload: true,
    volume: volume([
      { label: "Chest", sets: 26, mrv: 22 },
      { label: "Calves", sets: 25, mrv: 22 },
    ]),
  });
  const a = coachBrief(args);
  const b = coachBrief(args);
  assert.deepEqual(a, b);
  // And the tie between two over-MRV muscles resolves by overage, not by
  // whichever order the report happened to arrive in.
  assert.match(a.actions[0]!.text, /chest/);
});

test("every action cites a number", () => {
  const b = coachBrief(
    input({
      sleepDebt: 11,
      stalled: [{ name: "Bench", sessions: 3 }],
      volume: volume([{ label: "Chest", sets: 30, mrv: 22 }]),
    }),
  );
  for (const a of b.actions) {
    assert.ok(/\d/.test(a.why), `${a.id} has no figure in "${a.why}"`);
    assert.notEqual(a.why, a.text);
  }
});

test("protein is judged over logged days only, never over silence", () => {
  const { history } = enoughDays();
  const nutrition: BriefInput["nutrition"] = {};
  const week = lastNDays(TODAY, 7);
  const short = { goals: { protein: 180 }, water: 0, creatine: 0, items: [{ name: "x", cals: 500, p: 40, c: 0, f: 0 }] };
  const silent = { goals: {}, water: 0, creatine: 0, items: [], bodyWeight: 80 };
  // Three days logged well short of target — under the four-day floor, so the
  // brief must not report a protein problem it cannot see.
  week.forEach((d, i) => { nutrition[d] = (i < 3 ? { ...short } : { ...silent }) as never; });
  const thin = coachBrief(input({ history, nutrition }));
  assert.ok(!thin.actions.some((a) => a.id === "protein-short"));

  // A fourth short day and it fires.
  nutrition[week[3]!] = { ...short } as never;
  const fired = coachBrief(input({ history, nutrition }));
  const p = fired.actions.find((a) => a.id === "protein-short");
  assert.ok(p, "four short days is enough to say so");
  assert.match(p!.why, /22% of target/);
});

test("hitting protein says nothing about protein", () => {
  const { history } = enoughDays();
  const nutrition: BriefInput["nutrition"] = {};
  for (const d of lastNDays(TODAY, 7)) {
    nutrition[d] = { goals: { protein: 180 }, water: 0, creatine: 0, items: [{ name: "x", cals: 900, p: 185, c: 0, f: 0 }] } as never;
  }
  const b = coachBrief(input({ history, nutrition }));
  assert.ok(!b.actions.some((a) => a.id === "protein-short"));
});

test("hunger only costs you on a bulk", () => {
  const hunger = lastNDays(TODAY, 7).slice(0, 3).map((date) => ({ id: date, date, level: 2, ts: 0 }));
  const cutting = coachBrief(input({ phase: "cut", hunger: hunger as never }));
  assert.ok(!cutting.actions.some((a) => a.id === "hungry-bulk"));
  const bulking = coachBrief(input({ phase: "bulk", hunger: hunger as never }));
  assert.ok(bulking.actions.some((a) => a.id === "hungry-bulk"));
});

test("the weekly view does not tell you to log today's sleep", () => {
  const args = input({ volume: [], stalled: [] });
  const week = coachBrief({ ...args, horizon: "week" });
  assert.ok(!week.actions.some((a) => a.id === "log-sleep"));
  const today = coachBrief({ ...args, horizon: "today" });
  assert.ok(today.actions.some((a) => a.id === "log-sleep"));
});

test("a habit added midweek is not reported as failing", () => {
  const fresh = { id: "h1", name: "Sunscreen", history: { [TODAY]: true } };
  assert.ok(!coachBrief(input({ habits: [fresh] })).actions.some((a) => a.id === "habit-slip"));

  const week = lastNDays(TODAY, 7);
  const lapsed = {
    id: "h1",
    name: "Sunscreen",
    history: Object.fromEntries(week.map((d, i) => [d, i === 0])),
  };
  const b = coachBrief(input({ habits: [lapsed], horizon: "today" }));
  const slip = b.actions.find((a) => a.id === "habit-slip");
  assert.ok(slip, "a week of misses is a real slip");
  assert.match(slip!.why, /Done 1 of the last 7 days/);
});

test("a quiet, well-run week produces no orders", () => {
  const b = coachBrief(input({ volume: volume([{ label: "Chest", sets: 12 }]) }));
  assert.deepEqual(b.actions, []);
  assert.match(b.withheld ?? "", /Nothing is off track/);
});
