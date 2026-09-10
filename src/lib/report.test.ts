import assert from "node:assert/strict";
import { test } from "node:test";
import { lastNDays } from "./coach-brief.ts";
import { buildReport, type ReportInput } from "./report.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

const TODAY = "2026-09-10";
const est = (w: number, r: number) => (w <= 0 || r <= 0 ? 0 : Math.round(w * (1 + r / 30) * 10) / 10);

const session = (name: string, weight: number): HistorySession =>
  ({
    split: "Push",
    exercises: [
      {
        name,
        sets: Array.from({ length: 3 }, () => ({ weight, reps: 8, done: true, type: "normal" })),
      },
    ],
  }) as unknown as HistorySession;

const nDay = (o: Partial<NutritionDay>): NutritionDay =>
  ({ goals: {}, water: 0, creatine: 0, items: [], ...o }) as NutritionDay;

function input(over: Partial<ReportInput> = {}): ReportInput {
  return { today: TODAY, days: 28, history: {}, nutrition: {}, estimate1RM: est, ...over };
}

test("an empty log produces a report that says so, not a blank one", () => {
  const r = buildReport(input());
  assert.equal(r.sections.find((s) => s.title === "Training")!.empty, "No sessions logged in this window.");
  assert.match(r.summary, /No sessions logged/);
});

test("the window ends on the day it was run", () => {
  const r = buildReport(input({ days: 7 }));
  assert.equal(r.to, TODAY);
  assert.equal(r.from, "2026-09-04");
  assert.equal(r.days, 7);
});

test("only sessions inside the window count", () => {
  const history: Record<string, HistorySession> = {
    "2026-09-09": session("Bench", 80),
    "2026-01-01": session("Bench", 60),
  };
  const r = buildReport(input({ days: 7, history }));
  const training = r.sections.find((s) => s.title === "Training")!;
  assert.equal(training.lines.find((l) => l.label === "Sessions")!.value, "1");
});

test("a lift seen once cannot be a change", () => {
  const r = buildReport(input({ days: 7, history: { "2026-09-09": session("Bench", 80) } }));
  const strength = r.sections.find((s) => s.title === "Strength")!;
  // One reading gives first === last, which is 0% — honest, not a gain.
  assert.equal(strength.lines[0]?.value, "0%");
});

test("first against last is the change, whatever happened in between", () => {
  const days = lastNDays(TODAY, 28).filter((_, i) => i % 7 === 0);
  const history: Record<string, HistorySession> = {};
  days.forEach((d, i) => { history[d] = session("Bench", 60 + i * 5); });
  const r = buildReport(input({ history }));
  const bench = r.sections.find((s) => s.title === "Strength")!.lines[0]!;
  assert.equal(bench.label, "Bench");
  assert.match(bench.value, /^\+/);
  assert.match(r.summary, /Bench up/);
});

test("bodyweight needs two weigh-ins before it is a change", () => {
  const one = buildReport(input({ nutrition: { "2026-09-09": nDay({ bodyWeight: 80 }) } }));
  assert.match(one.sections.find((s) => s.title === "Body")!.empty ?? "", /Fewer than two/);

  const two = buildReport(
    input({
      nutrition: {
        "2026-08-20": nDay({ bodyWeight: 80 }),
        "2026-09-09": nDay({ bodyWeight: 83 }),
      },
    }),
  );
  const line = two.sections.find((s) => s.title === "Body")!.lines[0]!;
  assert.equal(line.value, "3 kg");
  assert.match(line.note ?? "", /2 weigh-ins/);
});

test("nutrition is averaged over days LOGGED, never over silence", () => {
  // Dividing by the window would report half the calories actually eaten.
  const nutrition: Record<string, NutritionDay> = {
    "2026-09-08": nDay({ items: [{ name: "x", cals: 3000, p: 180 }] as never }),
    "2026-09-09": nDay({ items: [{ name: "x", cals: 3000, p: 180 }] as never }),
  };
  const r = buildReport(input({ nutrition }));
  const kcal = r.sections.find((s) => s.title === "Nutrition and sleep")!.lines.find((l) => l.label === "Calories")!;
  assert.equal(kcal.value, "3000 kcal");
  assert.match(kcal.note ?? "", /2 logged days/);
});

test("warm-ups are not working sets and not volume", () => {
  const withWarmup = {
    "2026-09-09": {
      split: "Push",
      exercises: [
        {
          name: "Bench",
          sets: [
            { weight: 20, reps: 10, done: true, type: "warmup" },
            { weight: 80, reps: 8, done: true, type: "normal" },
          ],
        },
      ],
    } as unknown as HistorySession,
  };
  const r = buildReport(input({ days: 7, history: withWarmup }));
  const t = r.sections.find((s) => s.title === "Training")!;
  assert.equal(t.lines.find((l) => l.label === "Working sets")!.value, "1");
  assert.match(t.lines.find((l) => l.label === "Volume")!.value, /^640/);
});

test("the summary is one line that survives a share sheet", () => {
  const r = buildReport(
    input({
      days: 7,
      history: { "2026-09-09": session("Bench", 80) },
      nutrition: { "2026-09-09": nDay({ items: [{ name: "x", cals: 3000, p: 180 }] as never }) },
    }),
  );
  assert.ok(!r.summary.includes("\n"));
  assert.ok(r.summary.length < 300);
  assert.match(r.summary, /2026-09-04 to 2026-09-10/);
});

test("a bar lift counts the bar", () => {
  const bar = {
    "2026-09-09": {
      split: "Push",
      exercises: [
        { name: "Bench", usesBar: true, barWeight: 20, sets: [{ weight: 60, reps: 5, done: true, type: "normal" }] },
      ],
    } as unknown as HistorySession,
  };
  const r = buildReport(input({ days: 7, history: bar }));
  assert.match(
    r.sections.find((s) => s.title === "Training")!.lines.find((l) => l.label === "Volume")!.value,
    /^400/,
    "80kg on the bar × 5",
  );
});
