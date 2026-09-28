import assert from "node:assert/strict";
import { test } from "node:test";
import { boxStyle, cleanStyle, withPart } from "./widget-style.ts";
import {
  addWidget, borrowedId, parseBorrowed, reconcile, restyle, widgetDef,
} from "./dashboard-layout.ts";

test("a style is kept only for what it actually sets", () => {
  assert.equal(cleanStyle({}), undefined);
  assert.equal(cleanStyle({ color: "red", scale: 1 }), undefined, "not a hex colour, and 100% is no change");
  assert.deepEqual(cleanStyle({ color: "#ff9f0a", dx: 500, scale: 2 }), { color: "#ff9f0a", dx: 160, scale: 1.3 });
});

test("moving a part keeps the others, and putting it back drops it", () => {
  let st = withPart(undefined, "value", { dx: 30, dy: 15 });
  st = withPart(st, "head", { hidden: true });
  assert.deepEqual(st?.parts, { value: { dx: 30, dy: 15 }, head: { hidden: true } });
  st = withPart(st, "value", { dx: 0, dy: 0 });
  assert.deepEqual(st?.parts, { head: { hidden: true } });
});

test("a widget's colour becomes its accent", () => {
  const css = boxStyle({ color: "#30d158", align: "center" }) as Record<string, string>;
  assert.equal(css["--color-accent"], "#30d158");
  assert.equal(css.textAlign, "center");
});

test("a widget from another page is kept, named, and put at the top", () => {
  const id = borrowedId("body", "panel");
  assert.deepEqual(parseBorrowed(id), { tab: "body", id: "panel" });
  assert.equal(parseBorrowed(borrowedId("body", "nope")), null, "an id that page does not have is not kept");
  assert.equal(widgetDef("dashboard", id)?.label, "Sleep");
  const base = reconcile(undefined, "dashboard");
  const next = reconcile(addWidget(base, "dashboard", id), "dashboard");
  assert.equal(next[0]!.id, id);
  assert.equal(next.length, base.length + 1);
});

test("each size keeps its own look, and a reset removes it", () => {
  const base = reconcile(undefined, "dashboard");
  let l = restyle(base, "water", "2x2", { color: "#64d2ff" });
  l = restyle(l, "water", "1x1", { align: "center" });
  const w = reconcile(l, "dashboard").find((p) => p.id === "water")!;
  assert.deepEqual(w.style, { "2x2": { color: "#64d2ff" }, "1x1": { align: "center" } });
  l = restyle(l, "water", "2x2", undefined);
  l = restyle(l, "water", "1x1", undefined);
  assert.equal(l.find((p) => p.id === "water")!.style, undefined);
});
