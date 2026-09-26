import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_INSTRUMENT, GROUPS, INSTRUMENTS, cleanPointValues, formatPrice, inGroup, instrumentName,
  instrumentOf, perPoint, setPerPoint, unitLabel,
} from "./instruments.ts";

describe("the table itself", () => {
  it("has no two instruments under one id", () => {
    const ids = INSTRUMENTS.map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("gives every instrument a positive step and a positive value", () => {
    for (const i of INSTRUMENTS) {
      assert.ok(i.point > 0, `${i.id} has no price step`);
      assert.ok(i.perLot > 0, `${i.id} is worth nothing a point`);
      assert.ok(i.decimals >= 0 && i.decimals <= 8, `${i.id} quotes to ${i.decimals} places`);
    }
  });

  it("files every instrument under a group that is offered", () => {
    for (const i of INSTRUMENTS) assert.ok(GROUPS.includes(i.group), `${i.id} is in no group`);
    for (const g of GROUPS) assert.ok(inGroup(g).length > 0, `${g} is empty`);
  });

  /**
   * The arithmetic, not the vibe. A standard lot is 100,000 units of the base
   * currency, so a dollar-quoted pair moves $10 a pip; gold is 100 ounces, so
   * a cent is a dollar; oil is 1,000 barrels, so a cent is ten.
   */
  it("prices the contracts the way the contracts are written", () => {
    assert.equal(instrumentOf("EURUSD").perLot, 100_000 * 0.0001);
    assert.equal(instrumentOf("GBPUSD").perLot, 100_000 * 0.0001);
    assert.equal(instrumentOf("XAUUSD").perLot, 100 * 0.01);
    assert.equal(instrumentOf("XAGUSD").perLot, 5_000 * 0.001);
    assert.equal(instrumentOf("XTIUSD").perLot, 1_000 * 0.01);
  });

  it("offers no pair quoted in something other than dollars", () => {
    // A pip of USD/JPY is worth 1000 yen, and this app has no way to know what
    // that is in dollars. Offering it would mean reporting the risk wrongly.
    const nonUsd = INSTRUMENTS.filter((i) => i.group === "Forex" && !/USD/.test(i.id));
    assert.deepEqual(nonUsd, []);
    assert.equal(INSTRUMENTS.some((i) => /JPY|CHF$/.test(i.id)), false);
  });
});

describe("looking one up", () => {
  it("falls back to the default rather than throwing", () => {
    assert.equal(instrumentOf(undefined).id, DEFAULT_INSTRUMENT);
    assert.equal(instrumentOf("NOT A THING").id, DEFAULT_INSTRUMENT);
  });

  it("keeps the old journal's numbers: unlabelled is EUR/USD", () => {
    const fallback = instrumentOf(undefined);
    assert.equal(fallback.point, 0.0001);
    assert.equal(fallback.perLot * 0.01, 0.1);
  });

  it("names it the way a platform does", () => {
    assert.equal(instrumentName("XAUUSD"), "Gold");
    assert.equal(instrumentName("EURUSD"), "EUR/USD");
  });
});

describe("correcting the value for your own broker", () => {
  it("uses the shipped figure when nothing has been corrected", () => {
    assert.equal(perPoint("US30"), 1);
    assert.equal(perPoint("US30", {}), 1);
  });

  it("uses your figure when you have given one", () => {
    assert.equal(perPoint("US30", { US30: 5 }), 5);
  });

  it("ignores a correction that is not a usable number", () => {
    assert.equal(perPoint("US30", { US30: 0 }), 1);
    assert.equal(perPoint("US30", { US30: Number.NaN }), 1);
    assert.equal(perPoint("US30", { US30: -3 }), 1);
  });

  it("stores a correction and forgets one that matches the shipped value", () => {
    const one = setPerPoint(undefined, "US30", 5);
    assert.deepEqual(one, { US30: 5 });
    assert.deepEqual(setPerPoint(one, "US30", 1), {});
    assert.deepEqual(setPerPoint(one, "US30", 0), {});
  });

  it("leaves other instruments alone when one is corrected", () => {
    const both = setPerPoint({ XAUUSD: 10 }, "US30", 5);
    assert.deepEqual(both, { XAUUSD: 10, US30: 5 });
  });

  it("throws away corrections that came back from a file wrong", () => {
    assert.deepEqual(cleanPointValues({ US30: 5 }), { US30: 5 });
    assert.deepEqual(cleanPointValues({ NOPE: 5 }), {});
    assert.deepEqual(cleanPointValues({ US30: "five" }), {});
    assert.deepEqual(cleanPointValues({ US30: -1 }), {});
    // A "correction" equal to the shipped value is not a correction.
    assert.deepEqual(cleanPointValues({ US30: 1 }), {});
    assert.deepEqual(cleanPointValues(null), {});
    assert.deepEqual(cleanPointValues("x"), {});
  });
});

describe("saying it the way the market says it", () => {
  it("quotes a price to the places the market quotes it to", () => {
    assert.equal(formatPrice("EURUSD", 1.17), "1.17000");
    assert.equal(formatPrice("XAUUSD", 2650), "2650.00");
    assert.equal(formatPrice("XAGUSD", 31.25), "31.250");
    assert.equal(formatPrice("EURUSD", Number.NaN), "—");
  });

  it("counts forex in pips and everything else in points", () => {
    assert.equal(unitLabel("EURUSD", 12), "12 pips");
    assert.equal(unitLabel("EURUSD", 1), "1 pip");
    assert.equal(unitLabel("XAUUSD", 300), "300 points");
  });

  it("does not offer a tenth of an index point, which does not exist", () => {
    assert.equal(unitLabel("US30", 42.4), "42 points");
    // A pip, though, is divisible, and half of one is worth reporting.
    assert.equal(unitLabel("EURUSD", 12.5), "12.5 pips");
  });
});
