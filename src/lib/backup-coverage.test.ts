import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing may persist without being in a backup.
 *
 * This is the guard for the bug that prompted the whole feature: four stores
 * kept their own localStorage key, none of them was in the export, and the
 * backup file reported success while quietly losing the user's programmes.
 * Nobody noticed for months, because a backup only proves itself on the day
 * you need it.
 *
 * So rather than trusting a reviewer to remember, this walks the source for
 * anything that writes to a browser store and fails on a key that is not
 * accounted for. Adding a new key is then a deliberate choice with a comment
 * next to it, not an accident.
 */

const SRC = new URL("..", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

/** Resolves `FOO_KEY` back to the string literal it was declared as. */
function resolveKeys(text: string, raw: string[]): string[] {
  return raw.map((token) => {
    if (/^["'`]/.test(token)) return token.slice(1, -1);
    const decl = new RegExp(`(?:const|let|var)\\s+${token}\\s*(?::[^=]+)?=\\s*["'\`]([^"'\`]+)`);
    return text.match(decl)?.[1] ?? token;
  });
}

/**
 * Keys that are deliberately outside a backup, each with the reason.
 *
 * A fact about THIS DEVICE is not part of the data. Restoring either of these
 * would be actively wrong rather than merely redundant.
 */
const NOT_USER_DATA: Record<string, string> = {
  "soma-last-backup": "when this phone last backed up — restoring it would tell a fresh phone it was already safe",
  "grok-auth.bearer-token": "a session token, and sessionStorage besides — it dies with the tab by design",
};

/** Written by the zustand persist middleware, and the thing exportJson dumps. */
const PERSIST_KEY = "soma-smart-coach-v1";

test("every browser store the app writes is either backed up or explicitly not user data", () => {
  const found = new Map<string, string>();

  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    const writes = [...text.matchAll(/(?:local|session)Storage\.setItem\(\s*([^,\s)]+)/g)].map(
      (m) => m[1]!,
    );
    for (const key of resolveKeys(text, writes)) {
      found.set(key, file.replace(SRC, "src/"));
    }
  }

  // If this is empty the regex has stopped matching and the test is asserting
  // nothing, which is worse than failing.
  assert.ok(found.size >= 6, `only found ${found.size} storage writes — has the scan broken?`);

  const sideStores = readFileSync(join(SRC, "lib/side-stores.ts"), "utf8");
  const covered: string[] = [];
  const uncovered: string[] = [];

  for (const [key, file] of found) {
    if (key === PERSIST_KEY || key in NOT_USER_DATA) continue;
    // A key is covered when side-stores.ts imports the module that owns it,
    // which is what puts it in collectSideStores and restoreSideStores.
    const owner = file.replace(/^src\/lib\//, "./").replace(/\.tsx?$/, "");
    if (sideStores.includes(`from "${owner}.ts"`)) covered.push(key);
    else uncovered.push(`${key} (written by ${file})`);
  }

  assert.deepEqual(
    uncovered,
    [],
    "These keys survive a wipe on this phone but are not in a backup. Add the module to " +
      "lib/side-stores.ts, or list the key in NOT_USER_DATA above with the reason:\n  " +
      uncovered.join("\n  "),
  );
  assert.ok(covered.length >= 5, `expected the five side-store keys, got ${covered.join(", ")}`);
});

test("there is exactly one IndexedDB database, and the backup knows about it", () => {
  const opens: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (text.includes("indexedDB.open(")) opens.push(file.replace(SRC, "src/"));
  }
  // Photos are the one thing not in localStorage, and buildBackup reads them
  // through allPhotos(). A second database would need the same treatment.
  assert.deepEqual(opens, ["src/lib/habit-photos.ts"]);

  const backup = readFileSync(join(SRC, "lib/backup.ts"), "utf8");
  assert.ok(backup.includes("allPhotos"), "buildBackup no longer reads the photo store");
});

test("the export carries every section the store persists", () => {
  const store = readFileSync(join(SRC, "lib/store.ts"), "utf8");
  const partialize = store.match(/partialize:\s*\(s\)\s*=>\s*\(\{([\s\S]*?)\}\)/)?.[1];
  assert.ok(partialize, "partialize has moved — this test can no longer see what is persisted");

  const persisted = [...partialize.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]!);
  const exportBody = store.match(/exportJson:[\s\S]*?JSON\.stringify\(\s*\{([\s\S]*?)\n {10}\}/)?.[1];
  assert.ok(exportBody, "exportJson has moved — this test can no longer see what it writes");

  // `seeded` is the only persisted field that is state about the install rather
  // than the user's data: it records that the demo log has been replaced, and
  // importJson sets it to true on any restore anyway.
  const expected = persisted.filter((k) => k !== "seeded");
  const missing = expected.filter((k) => !new RegExp(`^\\s*${k}:`, "m").test(exportBody));
  assert.deepEqual(missing, [], `persisted but never exported: ${missing.join(", ")}`);
});
