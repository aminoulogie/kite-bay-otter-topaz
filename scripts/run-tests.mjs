#!/usr/bin/env node
/**
 * Runs both test suites, and runs the second one even when the first fails.
 *
 * `npm test` used to be `node --test scripts/** && node --test src/lib/*`, and
 * the `&&` was doing real damage: the scripts suite has had failures for a
 * while, so the short-circuit meant the ENTIRE src/lib suite — a hundred and
 * eighty tests covering the scoring, the merge rules, the exercise mapping —
 * had not executed in any of those runs. A broken import shipped straight
 * through it, because the test that would have caught it never ran.
 *
 * Both halves run unconditionally now. The exit code is still non-zero if
 * either fails, so nothing is being swept up — the failures are simply visible
 * alongside the results they were hiding.
 */

import { spawnSync } from "node:child_process";

const SUITES = [
  {
    name: "scripts",
    args: ["--test", "scripts/**/*.test.mjs"],
  },
  {
    name: "src",
    args: [
      "--experimental-strip-types",
      "--test",
      "src/lib/**/*.test.ts",
    ],
  },
];

let failed = false;
const summary = [];

for (const suite of SUITES) {
  process.stdout.write(`\n──────── ${suite.name} ────────\n`);
  const run = spawnSync(process.execPath, suite.args, { stdio: "inherit" });
  const ok = run.status === 0;
  if (!ok) failed = true;
  summary.push(`${ok ? "PASS" : "FAIL"}  ${suite.name}`);
}

process.stdout.write(`\n──────── summary ────────\n${summary.join("\n")}\n`);
process.exit(failed ? 1 : 0);
