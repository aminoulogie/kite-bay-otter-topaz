// Runs every suite against the built main.js.
//
//   node test/all.js
//
// Refuses to run if main.js is older than anything in src/, because a green
// suite against a stale bundle is worse than no suite at all.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MAIN = path.join(ROOT, "main.js");
const SRC = path.join(ROOT, "src");

function newestUnder(dir) {
  let newest = 0, file = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inner = newestUnder(p);
      if (inner.mtime > newest) ({ mtime: newest, file } = inner);
    } else if (entry.name.endsWith(".js")) {
      const m = fs.statSync(p).mtimeMs;
      if (m > newest) { newest = m; file = p; }
    }
  }
  return { mtime: newest, file };
}

if (!fs.existsSync(MAIN)) {
  console.error("main.js is missing. Run `node build.mjs` first.");
  process.exit(1);
}
if (fs.existsSync(SRC)) {
  const built = fs.statSync(MAIN).mtimeMs;
  const newest = newestUnder(SRC);
  if (newest.mtime > built) {
    console.error("main.js is older than " + path.relative(ROOT, newest.file) + ".");
    console.error("Rebuild first:  node build.mjs   (or `npm run verify`)");
    process.exit(1);
  }
}

const suites = [
  "test-modules.js",
  "run-tests.js",
  "test-autoreg.js",
  "test-profiles.js",
  "test-theme.js",
  "test-training.js",
  "test-nutrition.js",
  "test-consistency.js",
  "test-routines.js"
];

let failed = false;
let total = 0;
for (const s of suites) {
  console.log("\n=== " + s + " ===");
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, s)]).toString();
    process.stdout.write(out);
    const m = out.match(/(\d+) passed/);
    if (m) total += parseInt(m[1]);
  } catch (e) {
    process.stdout.write((e.stdout || "").toString());
    process.stdout.write((e.stderr || "").toString());
    failed = true;
  }
}

console.log("\n" + (failed ? "FAILURES ABOVE" : total + " tests passing"));
process.exit(failed ? 1 : 0);
