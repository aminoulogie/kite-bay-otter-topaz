import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IDLE_MS, MAX_RUN_MS, bankMinutes, fold, resumeClock, runningMs, sawActivity, startClock,
  stopClock,
} from "./reading-clock.ts";

const T = 1_700_000_000_000;
const MIN = 60_000;

describe("the clock a book runs on itself", () => {
  it("starts counting the moment the book opens", () => {
    const c = startClock(T);
    assert.equal(c.since, T);
    assert.equal(c.carry, 0);
    assert.equal(runningMs(c, T + 3 * MIN), 3 * MIN);
  });

  it("counts nothing before it has started", () => {
    assert.equal(runningMs({ since: null, seen: T, carry: 0 }, T + MIN), 0);
  });

  it("never counts backwards when the clock jumps", () => {
    assert.equal(runningMs(startClock(T), T - MIN), 0);
  });
});

describe("the idle wall", () => {
  it("stops counting a grace period after the last sign of life", () => {
    const c = startClock(T);
    assert.equal(runningMs(c, T + IDLE_MS - 1), IDLE_MS - 1);
    assert.equal(runningMs(c, T + IDLE_MS), IDLE_MS);
    // An hour of silence earns the same as the grace, and no more.
    assert.equal(runningMs(c, T + 60 * MIN), IDLE_MS);
  });

  it("moves with every page turn, so a read session keeps running", () => {
    let c = startClock(T);
    for (let i = 1; i <= 20; i++) c = sawActivity(c, T + i * MIN);
    assert.equal(runningMs(c, T + 20 * MIN), 20 * MIN);
  });

  it("does not pay out the silence when somebody comes back", () => {
    let c = startClock(T);
    // Read for two minutes, put it down for an hour, pick it up again.
    c = sawActivity(c, T + 2 * MIN);
    c = sawActivity(c, T + 62 * MIN);
    // The two minutes read plus the grace, banked; the new run starts empty.
    assert.equal(c.carry, 2 * MIN + IDLE_MS);
    assert.equal(c.since, T + 62 * MIN);
    assert.equal(runningMs(c, T + 62 * MIN), 0);
  });

  it("caps a single run however wrong the wall goes", () => {
    const c = { since: T, seen: T + 10 * MAX_RUN_MS, carry: 0 };
    assert.equal(runningMs(c, T + 10 * MAX_RUN_MS), MAX_RUN_MS);
  });
});

describe("folding what has been earned", () => {
  it("is safe to repeat — the second fold in a moment earns nothing", () => {
    const once = fold(startClock(T), T + 90_000);
    const twice = fold(once, T + 90_000);
    assert.equal(once.carry, 90_000);
    assert.equal(twice.carry, 90_000);
  });

  it("keeps counting after it, from where it counted to", () => {
    const c = fold(startClock(T), T + MIN);
    assert.equal(runningMs(c, T + 2 * MIN), MIN);
  });

  it("stalls against the wall instead of drifting past it", () => {
    let c = fold(startClock(T), T + 60 * MIN);
    assert.equal(c.carry, IDLE_MS);
    c = fold(c, T + 120 * MIN);
    assert.equal(c.carry, IDLE_MS);
  });

  it("leaves a stopped clock alone", () => {
    const stopped = { since: null, seen: T, carry: 1234 };
    assert.deepEqual(fold(stopped, T + MIN), stopped);
  });
});

describe("going away and coming back", () => {
  it("banks the run when the reader is backgrounded", () => {
    const c = stopClock(startClock(T), T + 3 * MIN);
    assert.equal(c.since, null);
    assert.equal(c.carry, 3 * MIN);
  });

  it("counts nothing at all while it is away", () => {
    const c = stopClock(startClock(T), T + 3 * MIN);
    assert.equal(runningMs(c, T + 300 * MIN), 0);
    assert.equal(bankMinutes(c, T + 300 * MIN).minutes, 3);
  });

  it("starts a fresh run on the way back, keeping what was banked", () => {
    let c = stopClock(startClock(T), T + 90_000);
    c = resumeClock(c, T + 300 * MIN);
    assert.equal(c.since, T + 300 * MIN);
    assert.equal(c.seen, T + 300 * MIN);
    assert.equal(c.carry, 90_000);
  });

  it("treats a resume of a running clock as a sign of life", () => {
    const c = resumeClock(startClock(T), T + MIN);
    assert.equal(c.since, T);
    assert.equal(c.seen, T + MIN);
  });

  it("starts counting when activity arrives on a stopped clock", () => {
    const c = sawActivity({ since: null, seen: T, carry: 500 }, T + MIN);
    assert.equal(c.since, T + MIN);
    assert.equal(c.carry, 500);
  });
});

describe("banking whole minutes", () => {
  it("hands over the minutes and keeps the seconds", () => {
    const { clock, minutes } = bankMinutes(startClock(T), T + 90_000);
    assert.equal(minutes, 1);
    assert.equal(clock.carry, 30_000);
  });

  it("adds the kept seconds to the next stretch rather than losing them", () => {
    let c = startClock(T);
    let total = 0;
    // Ninety seconds, twice: three minutes, not two.
    for (const at of [90_000, 180_000]) {
      const out = bankMinutes(sawActivity(c, T + at), T + at);
      c = out.clock;
      total += out.minutes;
    }
    assert.equal(total, 3);
  });

  it("gives nothing when nothing whole has been earned", () => {
    const out = bankMinutes(startClock(T), T + 59_000);
    assert.equal(out.minutes, 0);
    assert.equal(out.clock.carry, 59_000);
  });

  it("survives being called every second without losing a minute", () => {
    let c = startClock(T);
    let total = 0;
    for (let s = 1; s <= 600; s++) {
      c = sawActivity(c, T + s * 1000);
      const out = bankMinutes(c, T + s * 1000);
      c = out.clock;
      total += out.minutes;
    }
    assert.equal(total, 10);
  });
});
