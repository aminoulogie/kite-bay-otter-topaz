import assert from "node:assert/strict";
import { test } from "node:test";
import { nightFrom, replayTaps } from "./sleep-clock.ts";

const t = (s: string) => new Date(s).getTime();

test("a night is filed under the morning it ended", () => {
  const n = nightFrom(t("2026-10-02T23:40:00"), t("2026-10-03T07:10:00"));
  assert.ok(!("error" in n));
  if (!("error" in n)) {
    assert.equal(n.date, "2026-10-03");
    assert.equal(n.hours, 7.5);
  }
});

test("implausible nights are refused", () => {
  assert.ok("error" in nightFrom(t("2026-10-02T23:00:00"), t("2026-10-02T23:10:00")));
  assert.ok("error" in nightFrom(t("2026-10-01T23:00:00"), t("2026-10-03T07:00:00")));
});

test("widget taps replay on top of a night in progress", () => {
  const r = replayTaps(t("2026-10-02T23:30:00"), [
    { kind: "wake", at: t("2026-10-03T07:00:00") },
    { kind: "sleep", at: t("2026-10-03T23:00:00") },
  ]);
  assert.equal(r.nights.length, 1);
  assert.equal(r.nights[0]!.hours, 7.5);
  assert.equal(r.asleepSince, t("2026-10-03T23:00:00"));
  assert.equal(replayTaps(undefined, [{ kind: "wake", at: 1 }]).nights.length, 0);
});
