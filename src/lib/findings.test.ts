import assert from "node:assert/strict";
import { test } from "node:test";
import { asFindings, countBySeverity, sortFindings, type Finding } from "./findings.ts";

const f = (o: Partial<Finding>): Finding => ({ id: Math.random().toString(36), projectId: "p", title: "x", severity: "medium", status: "open", createdAt: 1, ...o });

test("open first, then severity, then due", () => {
  const list = [
    f({ title: "low", severity: "low" }),
    f({ title: "done crit", severity: "critical", status: "resolved" }),
    f({ title: "high late", severity: "high", due: "2026-12-01" }),
    f({ title: "high soon", severity: "high", due: "2026-10-10" }),
    f({ title: "crit", severity: "critical" }),
  ];
  assert.deepEqual(sortFindings(list).map((x) => x.title), ["crit", "high soon", "high late", "low", "done crit"]);
  assert.deepEqual(countBySeverity(list), { critical: 1, high: 2, medium: 0, low: 1 });
});

test("cleaning defaults bad severity and status, drops junk", () => {
  const out = asFindings([{ id: "a", projectId: "p", title: "t", severity: "huge", status: "?", due: "soon" }, { id: 1 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.severity, "medium");
  assert.equal(out[0]!.status, "open");
  assert.equal(out[0]!.due, undefined);
});
