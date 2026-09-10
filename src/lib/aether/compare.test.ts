import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_POSE_DELTA_DEG, comparability, compareScans, defaultPair, verdict,
} from "./compare.ts";
import type { ScanRecord } from "./scan-store.ts";

function scan(over: Partial<ScanRecord> & { id: string; date: string }): ScanRecord {
  return {
    kind: "face_front_true",
    capturedAt: `${over.date}T09:00:00Z`,
    face: {
      alpha: 0.05,
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      gates: { ok: true, reasons: [] },
    } as never,
    ...over,
  } as ScanRecord;
}

test("a profile and a front shot are not two readings of the same thing", () => {
  const c = comparability(
    scan({ id: "a", date: "2026-08-01" }),
    scan({ id: "b", date: "2026-09-01", kind: "face_side" }),
  );
  assert.equal(c.ok, false);
  assert.match(c.reasons[0]!, /Different poses/);
});

test("a gated capture never contributes a number", () => {
  const bad = scan({ id: "b", date: "2026-09-01" });
  (bad.face as never as { gates: { ok: boolean; reasons: string[] } }).gates = {
    ok: false,
    reasons: ["too dark"],
  };
  const c = comparability(scan({ id: "a", date: "2026-08-01" }), bad);
  assert.equal(c.ok, false);
  assert.ok(c.reasons.some((r) => /gated/.test(r)));
});

test("a few degrees of head turn is not a change in your face", () => {
  // The failure this exists to prevent: a reassuring "+2% symmetry" that is
  // entirely the phone being held differently.
  const a = scan({ id: "a", date: "2026-08-01" });
  const b = scan({ id: "b", date: "2026-09-01" });
  (b.face as never as { yawDeg: number }).yawDeg = MAX_POSE_DELTA_DEG + 1;
  const c = comparability(a, b);
  assert.equal(c.ok, false);
  assert.ok(c.reasons.some((r) => /Yaw differs/.test(r)));
  assert.equal(c.yawDelta, MAX_POSE_DELTA_DEG + 1);
});

test("the same head position on two days does compare", () => {
  const c = comparability(
    scan({ id: "a", date: "2026-08-01" }),
    scan({ id: "b", date: "2026-09-01" }),
  );
  assert.equal(c.ok, true);
  assert.deepEqual(c.reasons, []);
});

test("one capture cannot be compared with itself", () => {
  const a = scan({ id: "a", date: "2026-08-01" });
  assert.equal(comparability(a, a).ok, false);
});

test("older is always `from`, whichever way round they arrive", () => {
  const older = scan({ id: "a", date: "2026-08-01" });
  const newer = scan({ id: "b", date: "2026-09-01" });
  (newer.face as never as { alpha: number }).alpha = 0.03;

  const forwards = compareScans(older, newer).find((d) => d.id === "symmetry")!;
  const backwards = compareScans(newer, older).find((d) => d.id === "symmetry")!;
  assert.deepEqual(forwards, backwards);
  assert.equal(forwards.from, 95);
  assert.equal(forwards.to, 97);
  assert.equal(forwards.delta, 2);
});

test("a metric only one capture carries is dropped, not charted against nothing", () => {
  const older = scan({ id: "a", date: "2026-08-01" });
  const newer = scan({
    id: "b",
    date: "2026-09-01",
    skin: { underEyeIndex: 12, erythemaIndex: null, unevenness: null, shine: null } as never,
  });
  const ids = compareScans(older, newer).map((d) => d.id);
  assert.ok(!ids.includes("underEye"), "an absent baseline is not a change from zero");
  assert.ok(ids.includes("symmetry"));
});

test("a change smaller than the noise floor is labelled as noise", () => {
  const older = scan({ id: "a", date: "2026-08-01" });
  const newer = scan({ id: "b", date: "2026-09-01" });
  (newer.face as never as { alpha: number }).alpha = 0.0501;
  const d = compareScans(older, newer).find((x) => x.id === "symmetry")!;
  assert.equal(d.noise, true);
  assert.equal(verdict(d), null, "noise gets no verdict at all");
});

test("darker under-eyes is worse and lighter is better, both ways round", () => {
  const skin = (v: number) =>
    ({ underEyeIndex: v, erythemaIndex: null, unevenness: null, shine: null }) as never;
  const worse = compareScans(
    scan({ id: "a", date: "2026-08-01", skin: skin(10) }),
    scan({ id: "b", date: "2026-09-01", skin: skin(18) }),
  ).find((d) => d.id === "underEye")!;
  assert.equal(verdict(worse), "worse");

  const better = compareScans(
    scan({ id: "a", date: "2026-08-01", skin: skin(18) }),
    scan({ id: "b", date: "2026-09-01", skin: skin(10) }),
  ).find((d) => d.id === "underEye")!;
  assert.equal(verdict(better), "better");
});

test("a metric with no defensible direction gets no verdict", () => {
  const p = (v: number) => scan({ id: `s${v}`, date: `2026-0${v}-01`, puffiness: 1.5 + v / 10 });
  const d = compareScans(p(8), p(9)).find((x) => x.id === "puffiness")!;
  assert.equal(d.better, null);
  assert.equal(verdict(d), null, "closer to canon is not evidence of anything");
});

test("the default pair skips the 45° taken in the same sitting", () => {
  const scans = [
    scan({ id: "old", date: "2026-07-01" }),
    scan({ id: "front", date: "2026-09-01" }),
    scan({ id: "oblique", date: "2026-09-01", kind: "face_oblique" }),
  ];
  const pair = defaultPair(scans);
  assert.ok(pair);
  assert.deepEqual(pair!.map((s) => s.id), ["old", "front"]);
});

test("nothing comparable means no pair, not a wrong one", () => {
  assert.equal(defaultPair([]), null);
  assert.equal(defaultPair([scan({ id: "a", date: "2026-09-01" })]), null);
  assert.equal(
    defaultPair([
      scan({ id: "a", date: "2026-09-01" }),
      scan({ id: "b", date: "2026-09-02", kind: "face_side" }),
    ]),
    null,
  );
});
