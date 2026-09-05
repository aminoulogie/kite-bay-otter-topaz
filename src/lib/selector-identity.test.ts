import { strict as assert } from "node:assert";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Guards against the crash that took the app down twice: a zustand selector
 * that calls a store method.
 *
 * `useSoma((s) => s.routines())` looks harmless, but the selector re-runs on
 * every store change and the method builds a fresh object each call. The
 * snapshot therefore never compares equal, React re-renders forever and throws
 * "Maximum update depth exceeded" (#185) — a white screen, not a warning, and
 * only in a production build where the error is minified.
 *
 * Methods returning a primitive are safe, because those compare by value.
 * Anything else must be selected as raw state and derived in a useMemo.
 */

/** Store methods whose return value is a primitive, so identity cannot drift. */
const RETURNS_PRIMITIVE = new Set(["isFoodEdited"]);

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    // Tests are skipped so the examples in this file's own comments, which are
    // deliberately written in the forbidden shape, do not trip it.
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

test("no zustand selector calls a store method that can return a fresh object", () => {
  const offenders: string[] = [];
  // Matches `useSoma((s) => s.name(` and the same with any parameter name.
  const pattern = /useSoma\(\s*\(\s*(\w+)\s*\)\s*=>\s*\1\.(\w+)\s*\(/g;

  for (const file of tsxFiles("src")) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(pattern)) {
      const method = m[2]!;
      if (RETURNS_PRIMITIVE.has(method)) continue;
      offenders.push(`${file}: useSoma((s) => s.${method}())`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Store methods called inside a selector re-run on every store change and ` +
      `return a new object each time, which loops React until it throws #185. ` +
      `Select the raw state and derive it in a useMemo instead:\n  ` +
      offenders.join("\n  "),
  );
});
