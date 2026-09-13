import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Guards the two ends of the keyboard fix, which live in different files and
 * have no type connecting them.
 *
 * The stylesheet lifts every modal off the keyboard by matching the SHAPE of
 * an overlay — `fixed` plus `inset-0` as class tokens — rather than a class
 * each sheet has to remember. That is the right trade for twenty-seven
 * overlays in five shapes, but it means a sheet written a different way is
 * silently left behind the keys with nothing to warn anyone. So: if a
 * component pins itself to the viewport, it has to do it in the shape the
 * stylesheet knows.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

const CSS = readFileSync("src/styles.css", "utf8");

test("the stylesheet still matches overlays by their shape", () => {
  assert.ok(
    CSS.includes('[class~="fixed"][class~="inset-0"]'),
    "the overlay selector the sheets rely on has been renamed or removed",
  );
  assert.ok(CSS.includes("--kb"), "the keyboard height variable is gone");
});

test("a full-screen overlay uses the class tokens the keyboard rules match", () => {
  // `top-0 left-0 right-0 bottom-0` is the same box written four ways, and the
  // selector cannot see it. Either spelling is fine in isolation; only the
  // combination with `fixed` makes an overlay.
  const offenders: string[] = [];
  const pattern = /className=\{?\s*["'`cn(]*[^"'`]*\bfixed\b[^"'`]*["'`]/g;

  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    for (const [match] of src.matchAll(pattern)) {
      const edges = ["top-0", "bottom-0", "left-0", "right-0"].filter((e) =>
        new RegExp(`\\b${e}\\b`).test(match),
      );
      // All four edges pinned one by one is an inset-0 overlay in disguise.
      if (edges.length === 4 && !/\binset-0\b/.test(match)) {
        offenders.push(`${file}: ${match.trim().slice(0, 90)}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Write these as \`fixed inset-0\`, or the keyboard rules in styles.css will not find them:\n${offenders.join("\n")}`,
  );
});

test("the dock keeps the hook the keyboard rules fade it out by", () => {
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  assert.ok(shell.includes("soma-dock"), "the dock lost its class");
  assert.ok(CSS.includes(".soma-kb .soma-dock"), "the dock no longer fades for the keyboard");
});

test("the shell installs the keyboard hook", () => {
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  assert.ok(
    /useKeyboardInset\(\)/.test(shell),
    "nothing publishes --kb, so every sheet stays behind the keyboard",
  );
});

test("inline expanders are not given the geometry of a modal", () => {
  // `.soma-expand` marks both a sheet panel and a row that opens in place.
  // The keyboard rules must reach the first and not the second, which is what
  // scoping them under the overlay selector buys.
  const lines = CSS.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!/max-height|padding-bottom/.test(line)) continue;
    // Walk back to the selector this declaration belongs to.
    let j = i;
    while (j > 0 && !lines[j]!.includes("{")) j--;
    const selector = lines[j]!;
    if (!selector.includes(".soma-expand")) continue;
    if (!/--kb/.test(line)) continue;
    assert.ok(
      selector.includes('[class~="fixed"]'),
      `a --kb rule on .soma-expand must be scoped to overlays: ${selector.trim()}`,
    );
  }
});
