import assert from "node:assert/strict";
import { test } from "node:test";
import { pushRecentColor, toggleFavoriteColor } from "./habit-colors.ts";

test("recent colours: newest first, no duplicates, eight at most", () => {
  let r: string[] = [];
  for (const c of ["#111111", "#222222", "#111111"]) r = pushRecentColor(r, c);
  assert.deepEqual(r, ["#111111", "#222222"]);
  for (let i = 0; i < 10; i++) r = pushRecentColor(r, `#00000${i}`);
  assert.equal(r.length, 8);
});

test("favourites toggle, case-insensitively", () => {
  const f = toggleFavoriteColor([], "#ABCDEF");
  assert.deepEqual(f, ["#abcdef"]);
  assert.deepEqual(toggleFavoriteColor(f, "#abcdef"), []);
});
