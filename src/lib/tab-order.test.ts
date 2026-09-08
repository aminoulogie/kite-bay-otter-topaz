import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { HOME_TAB, TAB_ORDER, stepForSwipe, tabAt } from "./tab-order.ts";

test("every tab in the union is in the order, and nothing extra", () => {
  // The dock is built by mapping TAB_ORDER, so a tab missing here is a tab
  // that exists in the type and is unreachable in the app.
  const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  const union = types.match(/export type TabId =([\s\S]*?);/)?.[1] ?? "";
  const declared = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
  assert.deepEqual([...TAB_ORDER].sort(), [...declared].sort());
});

test("the dock draws the same order a swipe walks", () => {
  // One list, two consumers. A second copy is how the tab to your right stops
  // being the tab a leftward swipe takes you to.
  const shell = readFileSync(new URL("../components/AppShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /TAB_ORDER\.map/, "the dock must be built from TAB_ORDER");
});

test("home is in the middle, not at an end", () => {
  const i = TAB_ORDER.indexOf(HOME_TAB);
  assert.ok(i > 0, "something is to the left of home");
  assert.ok(i < TAB_ORDER.length - 1, "something is to the right of home");
});

test("swiping left goes right along the order", () => {
  // Dragging the page left pulls the next tab in from the right, the way a
  // carousel does. Getting this backwards is the classic version of this bug.
  assert.equal(stepForSwipe(-80), 1);
  assert.equal(stepForSwipe(80), -1);
});

test("stepping walks one tab at a time", () => {
  assert.equal(tabAt("dashboard", 1), "workout");
  assert.equal(tabAt("dashboard", -1), "money");
  assert.equal(tabAt("workout", -1), "dashboard");
});

test("the ends are hard stops, not a wrap-around", () => {
  // Wrapping would put the far end of the app one swipe from the near end.
  assert.equal(tabAt(TAB_ORDER[0]!, -1), null);
  assert.equal(tabAt(TAB_ORDER[TAB_ORDER.length - 1]!, 1), null);
});

test("an unknown tab does not walk anywhere", () => {
  assert.equal(tabAt("nonsense" as never, 1), null);
});
