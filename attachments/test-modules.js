// Structural check on the module split.
//
// When main.js was one file every top-level name shared one scope, so a
// function could reference anything. After the split a module can only see
// what it declares or imports — and a missed import produces a bundle that
// builds cleanly and only throws when that code path runs. That is exactly
// how the habit tracker shipped broken: SomaHabitStore referenced
// HABITS_FILE_PATH, DEFAULT_HABITS and DEFAULT_HABIT_SETTINGS without
// importing any of them.
//
// This walks every module and fails on any name it uses but cannot see.
// Run with:  node test/test-modules.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, message: e.message }); }
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
})(SRC);

const DECL = /^(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;

function declaredIn(src) {
  const out = new Set();
  let m;
  const re = new RegExp(DECL.source, "gm");
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}

function importedIn(src) {
  const out = new Set();
  const re = /const\s*\{([^}]+)\}\s*=\s*require\(/g;
  let m;
  while ((m = re.exec(src))) {
    m[1].split(",").forEach(s => {
      const n = s.split(":").pop().trim();
      if (n) out.add(n);
    });
  }
  return out;
}

// Map every shared name to the module that owns it.
const owner = {};
for (const f of files) {
  for (const n of declaredIn(fs.readFileSync(f, "utf8"))) owner[n] = f;
}
const ALL = Object.keys(owner);

test("src/ has modules to check", () => {
  assert.ok(files.length >= 10, "only found " + files.length + " modules");
});

test("no module references a name it cannot see", () => {
  const broken = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const own = declaredIn(src);
    const imp = importedIn(src);
    for (const name of ALL) {
      if (own.has(name) || imp.has(name) || owner[name] === f) continue;
      // Not preceded by a word char, $, dot or quote: a bare reference rather
      // than a property access, a string, or part of a longer identifier.
      const used = new RegExp("(?<![\\w$.'\"])" + name.replace(/\$/g, "\\$") + "(?![\\w$])");
      if (used.test(src)) {
        broken.push(path.relative(ROOT, f) + " uses " + name +
                    " (owned by " + path.relative(ROOT, owner[name]) + ")");
      }
    }
  }
  assert.strictEqual(broken.length, 0, "\n        " + broken.join("\n        "));
});

test("every module parses", () => {
  for (const f of files) {
    assert.doesNotThrow(
      () => new Function(fs.readFileSync(f, "utf8")),
      path.relative(ROOT, f) + " does not parse"
    );
  }
});

test("no module require() points at a file that does not exist", () => {
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const re = /require\("(\.[^"]+)"\)/g;
    let m;
    while ((m = re.exec(src))) {
      const target = path.resolve(path.dirname(f), m[1]);
      if (!fs.existsSync(target)) {
        missing.push(path.relative(ROOT, f) + " -> " + m[1]);
      }
    }
  }
  assert.strictEqual(missing.length, 0, "\n        " + missing.join("\n        "));
});

test("the habit store can see everything it needs", () => {
  // The specific regression: this module owns SomaHabitStore, which reads
  // paths and seed data that live elsewhere.
  const f = path.join(SRC, "habits", "modals.js");
  const src = fs.readFileSync(f, "utf8");
  const visible = new Set([...declaredIn(src), ...importedIn(src)]);
  ["HABITS_FILE_PATH", "DEFAULT_HABITS", "DEFAULT_HABIT_SETTINGS", "parseLocalDateKey"]
    .forEach(n => assert.ok(visible.has(n), "habits/modals.js cannot see " + n));
});

test("the barcode scanner uses a continuous decode API", () => {
  // @zxing/library's decodeFromVideoElement(source) takes ONE argument and
  // decodes ONCE into a returned promise. Passing it a callback compiles,
  // runs, and does nothing — the camera sits on a centred barcode forever.
  // decodeFromStream(stream, video, cb) attaches the stream and decodes
  // continuously, which is what a live scanner needs.
  const src = fs.readFileSync(path.join(SRC, "plugin.js"), "utf8");
  assert.ok(/decodeFromStream\s*\(/.test(src),
    "scanner does not call decodeFromStream");
  assert.ok(!/decodeFromVideoElement\s*\([^)]*,/.test(src),
    "decodeFromVideoElement is being passed a second argument, which it ignores");
});

test("the ZXing loader shadows the CommonJS globals", () => {
  // Obsidian desktop is Electron with node integration, so `module` and
  // `exports` exist as globals. A UMD bundle finds them, assigns itself to
  // exports, and never touches window.ZXing — the load silently succeeds
  // while the scanner can never start.
  const src = fs.readFileSync(path.join(SRC, "plugin.js"), "utf8");
  assert.ok(/new Function\(\s*"module",\s*"exports",\s*"define"/.test(src),
    "ZXing loader does not shadow module/exports/define");
});

test("main.js is a build artefact, not hand-edited source", () => {
  const main = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
  assert.ok(/generated bundle/i.test(main.slice(0, 400)),
    "main.js has no generated banner — was it edited by hand?");
});

console.log("\n  " + pass + " passed, " + fail + " failed\n");
if (fail) {
  failures.forEach(f => console.log("  FAIL  " + f.name + "\n        " + f.message));
  process.exit(1);
}
