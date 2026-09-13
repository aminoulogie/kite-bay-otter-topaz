import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { FOLDED_INTO, HOME_TAB, TAB_ORDER, resolveTab, tabAt } from "./tab-order.ts";

test("every tab in the union is reachable, and nothing extra is in the dock", () => {
  // The dock is built by mapping TAB_ORDER, so a tab in neither the order nor
  // the folded list is a tab that exists in the type and cannot be opened.
  // Folding is why this is not simply "the order equals the union": Body and
  // Ahead are still valid stored values, they just resolve somewhere else now.
  const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  const union = types.match(/export type TabId =([\s\S]*?);/)?.[1] ?? "";
  const declared = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);

  const reachable = new Set([...TAB_ORDER, ...Object.keys(FOLDED_INTO)]);
  assert.deepEqual(
    declared.filter((t) => !reachable.has(t as never)),
    [],
    "a tab in the type that nothing can open",
  );
  assert.deepEqual(
    TAB_ORDER.filter((t) => !declared.includes(t)),
    [],
    "the dock draws a tab the type does not have",
  );
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

test("a tab folded into another resolves to the one that now shows it", () => {
  assert.equal(resolveTab("body"), "insights");
  assert.equal(resolveTab("estimates"), "insights");
});

test("a tab still in the dock resolves to itself", () => {
  for (const t of TAB_ORDER) assert.equal(resolveTab(t), t, t);
});

test("nothing stored, or something unknown, opens where the app opens", () => {
  assert.equal(resolveTab(undefined), HOME_TAB);
  assert.equal(resolveTab("nonsense" as never), HOME_TAB);
});

test("the folded tabs are gone from the dock and from the swipe path", () => {
  assert.ok(!TAB_ORDER.includes("body"));
  assert.ok(!TAB_ORDER.includes("estimates"));
  assert.equal(tabAt("body" as never, 1), null, "a tab off the list has no neighbour");
});

test("every folded tab points at a tab that really is in the dock", () => {
  for (const [from, to] of Object.entries(FOLDED_INTO)) {
    assert.ok(TAB_ORDER.includes(to as never), `${from} -> ${to}`);
  }
});
