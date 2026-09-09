import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HORIZON_DAYS, LEVERS, LOOKS_HABITS, measurableLevers, refusedLevers, tooEarly,
} from "./levers.ts";

test("nothing on the list claims to change adult bone", () => {
  // The whole reason this file exists. If a lever ever claims skeletal change,
  // this fails before it reaches a screen.
  for (const l of LEVERS) {
    const text = `${l.moves} ${l.note}`.toLowerCase();
    if (/bone|skeletal|ramus|jaw angle/.test(text)) {
      assert.match(
        text,
        /not|never|refused|finished growing|cannot/,
        `"${l.label}" mentions bone without denying the claim`,
      );
    }
  }
});

test("mewing is present and refused rather than quietly omitted", () => {
  // Leaving it out would let someone assume the app has no opinion. It has one.
  const mewing = LEVERS.find((l) => l.id === "mewing");
  assert.ok(mewing);
  assert.equal(mewing!.evidence, "none");
  assert.equal(mewing!.horizon, "never");
  assert.ok(refusedLevers().some((l) => l.id === "mewing"));
});

test("body fat is first, because it is the biggest lever on most faces", () => {
  assert.equal(LEVERS[0]!.id, "bodyfat");
});

test("a lever with no measurement is honest about it rather than inventing one", () => {
  const sunscreen = LEVERS.find((l) => l.id === "sunscreen")!;
  assert.equal(sunscreen.metric, null);
  assert.equal(sunscreen.evidence, "strong", "unmeasurable is not the same as unproven");
  assert.match(sunscreen.note, /never see it working|never see/i);
});

test("evidence is about appearance, and oral care says so", () => {
  // Excellent evidence for health, none for what a face photograph shows.
  const oral = LEVERS.find((l) => l.id === "oral")!;
  assert.equal(oral.metric, null);
  assert.match(oral.note, /cannot measure/i);
});

test("only levers the app can actually verify are offered as measurable", () => {
  const ids = measurableLevers().map((l) => l.id);
  assert.ok(ids.includes("sleep"));
  assert.ok(ids.includes("bodyfat"));
  assert.ok(!ids.includes("sunscreen"), "no metric");
  assert.ok(!ids.includes("mewing"), "never moves");
  for (const l of measurableLevers()) assert.ok(l.metric);
});

test("judging a slow lever early is flagged", () => {
  // The most common way people quit something that was working.
  const retinoid = LEVERS.find((l) => l.id === "retinoid")!;
  assert.equal(tooEarly(retinoid, 21), true, "three weeks is not three months");
  assert.equal(tooEarly(retinoid, 120), false);

  const sleep = LEVERS.find((l) => l.id === "sleep")!;
  assert.equal(tooEarly(sleep, 7), false, "sleep shows within days");
});

test("something that never moves is never ready to judge", () => {
  const mewing = LEVERS.find((l) => l.id === "mewing")!;
  assert.equal(tooEarly(mewing, 100000), true);
  assert.equal(HORIZON_DAYS.never, Number.POSITIVE_INFINITY);
});

test("the retinoid note warns about the purge, which is when people quit", () => {
  assert.match(LEVERS.find((l) => l.id === "retinoid")!.note, /worse|purge/i);
});

test("the habit list is short enough to actually keep", () => {
  assert.ok(LOOKS_HABITS.length <= 6, "an eleven-step routine is one nobody keeps");
  for (const h of LOOKS_HABITS) {
    assert.ok(h.why.length > 10, `${h.name} has no reason attached`);
  }
});

test("every habit named by a lever exists in the habit list", () => {
  const have = new Set(LOOKS_HABITS.map((h) => h.id));
  for (const l of LEVERS) {
    if (l.habit && l.habit !== "sleep") {
      assert.ok(have.has(l.habit), `${l.label} points at a habit "${l.habit}" that does not exist`);
    }
  }
});
