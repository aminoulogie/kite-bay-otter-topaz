import assert from "node:assert/strict";
import { test } from "node:test";
import { applyChanges, diff, toRecords } from "./records.ts";
import { compareVersions, outdatedDevices, sideChanged, sideFields, sideFromFields, withDevice } from "./side.ts";

const prog = (id: string, name: string) => ({ id, name, kind: "week", days: [] }) as never;

test("side stores become list records and come back out", () => {
  const fields = sideFields({ programs: [prog("p1", "PPL")], recipes: [], mealPrograms: [], membership: [], supplements: ["creatine"], activeProgramId: "p1" });
  const recs = toRecords(fields);
  assert.ok(recs.has("sidePrograms#p1"));
  assert.ok(recs.has("sidePrograms@order"));
  assert.equal(recs.get("sideActiveProgram"), '"p1"');
  // Another device edits the programme; the change lands as one record.
  const theirs = toRecords(sideFields({ programs: [prog("p1", "Upper/Lower")], activeProgramId: "p1", supplements: ["creatine"] }));
  const changes = diff(recs, theirs).filter((c) => c.key.startsWith("sidePrograms#"));
  const next = applyChanges(fields, changes);
  const back = sideFromFields(next)!;
  assert.equal((back.programs![0] as { name: string }).name, "Upper/Lower");
  assert.deepEqual(back.supplements, ["creatine"]);
  assert.ok(sideChanged(back, { programs: [prog("p1", "PPL")], activeProgramId: "p1", supplements: ["creatine"] }));
  assert.ok(!sideChanged({ supplements: ["creatine"] }, { supplements: ["creatine"] }));
});

test("no chosen programme and nothing ticked send nothing, so they can't clear another device", () => {
  const f = sideFields({ programs: [], activeProgramId: null, supplements: [] });
  assert.ok(!("sideActiveProgram" in f));
  assert.ok(!("sideSupplements" in f));
  assert.equal(sideFromFields({ unrelated: 1 }), null);
});

test("update warnings: devices whose sync knows less, seen in the last two weeks", () => {
  assert.equal(compareVersions("0.0.192", "0.0.202"), -1);
  assert.equal(compareVersions("0.1.0", "0.0.999"), 1);
  const list = withDevice(
    [
      { id: "phone", version: "0.0.192", schema: 1, kind: "phone", seen: "2026-10-01" },
      { id: "old", version: "0.0.100", schema: 1, kind: "browser", seen: "2026-08-01" },
      { id: "tab", version: "web-300", schema: 2, kind: "browser", seen: "2026-10-05" },
      { id: "pc", version: "web-1", schema: 1, kind: "desktop", seen: "2026-10-05" },
    ],
    { id: "pc", version: "web-331", schema: 2, kind: "desktop", seen: "2026-10-05" },
  );
  assert.equal(list.filter((d) => d.id === "pc").length, 1);
  assert.deepEqual(outdatedDevices(list, "pc", 2, "2026-10-05").map((d) => d.id), ["phone"]);
});
