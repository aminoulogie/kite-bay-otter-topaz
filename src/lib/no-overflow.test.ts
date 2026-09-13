import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The two fixes for the bug that made every screen look broken at once.
 *
 * A flex row that can neither wrap nor shrink does not clip itself — it widens
 * the PAGE. One un-wrappable row in one card on the Train tab was enough to
 * push the whole document past the viewport, and then every OTHER screen
 * looked shifted with its right-hand controls hanging off the edge. The
 * trigger is the phone's TEXT SIZE rather than its width, so no media query
 * sees it coming.
 *
 * A rule against the shape that causes it — two groups pushed apart with no
 * slack — flags forty rows that are perfectly fine, and a test that noisy gets
 * silenced rather than obeyed. What is asserted here instead is the narrow
 * thing that actually regressed, in the file where it regressed. The broad
 * check is a browser sweep across widths and text sizes, which is the only
 * thing that can tell a row that WILL overflow from one that merely could.
 */

const SHELL = readFileSync("src/components/AppShell.tsx", "utf8");

/** className strings only — a rule that reads its own comments is useless. */
const CLASSES = [...SHELL.matchAll(/className="([^"]*)"/g)].map((m) => m[1]!).join(" ");

test("the page leaves room for the dock it actually has", () => {
  // A fixed padding is right at one text size and wrong at every other: the
  // dock grows with the phone's text setting AND with the home-indicator
  // inset, and once it is taller than the padding the last card on every page
  // sits behind it with no way to scroll further.
  assert.ok(SHELL.includes("--dock-h"), "the dock height is no longer measured");
  assert.ok(
    /pb-\[calc\(var\(--dock-h/.test(CLASSES),
    "the page no longer pads by the measured dock height",
  );
  assert.ok(
    !/\bpb-28\b/.test(CLASSES),
    "a guessed bottom padding is back on the shell",
  );
});

test("the header wraps rather than widening the page", () => {
  const header = /<header className="([^"]*)"/.exec(SHELL)?.[1] ?? "";
  assert.ok(header.includes("flex"), "the header stopped being a flex row");
  assert.ok(
    header.includes("flex-wrap"),
    "four controls and a wordmark do not fit a 320px phone at the largest text " +
      "size, and a header that cannot wrap widens the page instead of clipping",
  );
});

test("the dock clears the home indicator without stranding itself above it", () => {
  // The inset is the indicator's ZONE, not a wall — the indicator is a thin
  // line in the middle of it. Clearing the whole 34px left the dock visibly
  // floating away from the bottom of the screen.
  assert.ok(
    /env\(safe-area-inset-bottom\)-16px/.test(CLASSES.replace(/\s+/g, "")),
    "the dock's bottom offset no longer trims the safe-area inset",
  );
});
