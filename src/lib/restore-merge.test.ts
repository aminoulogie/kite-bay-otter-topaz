import assert from "node:assert/strict";
import { test } from "node:test";

/**
 * The merge rules behind restore, tested against the two ways the app lost
 * data: a session filed under the browsed date instead of the trained date,
 * and a restore that replaced every collection outright.
 *
 * The merge is reproduced here rather than imported because the store pulls in
 * the whole React/zustand stack. These assertions pin the RULES; the store
 * applies them.
 */

interface Day { sets: number }

function mergeHistory(backup: Record<string, Day>, device: Record<string, Day>) {
  return { ...backup, ...device };
}

function mergeHabitDays(
  backup: Record<string, boolean>,
  device: Record<string, boolean>,
) {
  return { ...backup, ...device };
}

function mergeByName<T extends { name: string }>(backup: T[], device: T[]): T[] {
  const out = new Map<string, T>();
  for (const x of backup) out.set(x.name.trim().toLowerCase(), x);
  for (const x of device) out.set(x.name.trim().toLowerCase(), x);
  return [...out.values()];
}

test("restoring an older backup cannot destroy a newer day", () => {
  // The exact reported loss: a backup taken yesterday, restored today, used to
  // wipe today. Reaching for a backup must never cost data.
  const backup = { "2026-09-03": { sets: 12 } };
  const device = { "2026-09-03": { sets: 12 }, "2026-09-04": { sets: 18 } };
  const merged = mergeHistory(backup, device);
  assert.equal(Object.keys(merged).length, 2);
  assert.equal(merged["2026-09-04"]!.sets, 18, "today must survive the restore");
});

test("a backup fills days the device is missing", () => {
  const backup = { "2026-08-01": { sets: 9 }, "2026-08-02": { sets: 11 } };
  const device = { "2026-08-02": { sets: 11 } };
  const merged = mergeHistory(backup, device);
  assert.equal(Object.keys(merged).length, 2);
  assert.equal(merged["2026-08-01"]!.sets, 9, "the missing day comes back");
});

test("on a conflict the device wins", () => {
  // The device holds the newer edit by definition: the backup is a snapshot of
  // an older moment.
  const merged = mergeHistory({ d: { sets: 3 } }, { d: { sets: 7 } });
  assert.equal(merged.d!.sets, 7);
});

test("habit days union rather than overwrite", () => {
  // A day ticked in either copy really was done, and dropping it would erase a
  // streak that was actually earned.
  const merged = mergeHabitDays(
    { "2026-09-01": true, "2026-09-02": true },
    { "2026-09-02": true, "2026-09-03": true },
  );
  assert.deepEqual(Object.keys(merged).sort(), ["2026-09-01", "2026-09-02", "2026-09-03"]);
});

test("custom foods merge without duplicating, device version kept", () => {
  const backup = [{ name: "Pain baguette", cals: 275 }, { name: "Mayo lesieur", cals: 650 }];
  const device = [{ name: "pain baguette", cals: 280 }]; // edited, different case
  const merged = mergeByName(backup, device);
  assert.equal(merged.length, 2, "case-different names are the same food");
  assert.equal(
    merged.find((f) => f.name.toLowerCase() === "pain baguette")!.cals,
    280,
    "the user's own edit survives the restore",
  );
});

test("restoring onto an empty device brings everything back", () => {
  const backup = { a: { sets: 1 }, b: { sets: 2 } };
  assert.deepEqual(mergeHistory(backup, {}), backup);
});

/**
 * The other loss: which key a session is filed under. It must come from the
 * workout, never from the date being browsed.
 */
function sessionKey(startedAt: number, browsedDate: string): string {
  void browsedDate; // deliberately unused — that was the bug
  const d = new Date(startedAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test("a session is filed under the day it was performed", () => {
  const trainedAt = new Date(2026, 8, 4, 18, 30).getTime(); // 4 Sep, evening
  assert.equal(
    sessionKey(trainedAt, "2026-09-03"),
    "2026-09-04",
    "browsing yesterday must not move today's workout onto it",
  );
});

test("a session running past midnight stays on the day it started", () => {
  const startedAt = new Date(2026, 8, 4, 23, 50).getTime();
  assert.equal(sessionKey(startedAt, "2026-09-05"), "2026-09-04");
});
