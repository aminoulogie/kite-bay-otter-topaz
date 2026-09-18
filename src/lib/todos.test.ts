import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeOf, dayGroupLabel, historyOf, isActive, mondayOf, progressOf, scopeOf, weekGroupLabel,
} from "./todos.ts";
import type { TodoItem } from "./types.ts";

function todo(over: Partial<TodoItem> & { id: string; date: string }): TodoItem {
  return { text: "x", done: false, ...over };
}

// A Wednesday, so Monday is a few days back and Sunday a few days on.
const TODAY = "2026-09-16";
const MONDAY = "2026-09-14";

describe("which list an item is on", () => {
  it("reads an item with no scope as a day item", () => {
    assert.equal(scopeOf({ scope: undefined }), "day");
    assert.equal(scopeOf({ scope: "day" }), "day");
    assert.equal(scopeOf({ scope: "week" }), "week");
  });

  it("does not treat junk as a week", () => {
    // @ts-expect-error deliberately wrong, the way a corrupted file would be
    assert.equal(scopeOf({ scope: "fortnight" }), "day");
  });
});

describe("the Monday a date falls in", () => {
  it("finds Monday from any day of its own week", () => {
    assert.equal(mondayOf("2026-09-14"), "2026-09-14"); // Monday itself
    assert.equal(mondayOf("2026-09-16"), "2026-09-14"); // Wednesday
    assert.equal(mondayOf("2026-09-20"), "2026-09-14"); // Sunday
  });

  it("crosses a month boundary correctly", () => {
    // 2026-09-28 is a Monday; the 30th (Wednesday) belongs to it.
    assert.equal(mondayOf("2026-09-30"), "2026-09-28");
    // 2026-10-01 (Thursday) still belongs to the same week.
    assert.equal(mondayOf("2026-10-01"), "2026-09-28");
  });
});

describe("whether an item is active right now", () => {
  it("a day item is active only on the day it was added", () => {
    assert.equal(isActive(todo({ id: "a", date: TODAY }), TODAY), true);
    assert.equal(isActive(todo({ id: "a", date: "2026-09-15" }), TODAY), false);
  });

  it("a week item is active anywhere inside its week", () => {
    for (const d of ["2026-09-14", "2026-09-16", "2026-09-20"]) {
      assert.equal(isActive(todo({ id: "a", scope: "week", date: d }), TODAY), true, d);
    }
    assert.equal(isActive(todo({ id: "a", scope: "week", date: "2026-09-13" }), TODAY), false);
    assert.equal(isActive(todo({ id: "a", scope: "week", date: "2026-09-21" }), TODAY), false);
  });

  it("a cleared item is never active, whatever its date", () => {
    assert.equal(isActive(todo({ id: "a", date: TODAY, cleared: true }), TODAY), false);
    assert.equal(
      isActive(todo({ id: "a", scope: "week", date: TODAY, cleared: true }), TODAY),
      false,
    );
  });
});

describe("filtering to one active list", () => {
  const items = [
    todo({ id: "1", date: TODAY }),                              // today, active
    todo({ id: "2", date: "2026-09-10" }),                        // old day item
    todo({ id: "3", scope: "week", date: MONDAY }),               // this week, active
    todo({ id: "4", scope: "week", date: "2026-09-07" }),         // last week
    todo({ id: "5", date: TODAY, cleared: true }),                // cleared today
  ];

  it("keeps only today's day items", () => {
    assert.deepEqual(activeOf(items, "day", TODAY).map((t) => t.id), ["1"]);
  });

  it("keeps only this week's week items", () => {
    assert.deepEqual(activeOf(items, "week", TODAY).map((t) => t.id), ["3"]);
  });
});

describe("the history", () => {
  it("holds everything that has fallen out of the active day list", () => {
    const items = [
      todo({ id: "1", date: TODAY }),
      todo({ id: "2", date: "2026-09-15" }),
      todo({ id: "3", date: "2026-09-15" }),
      todo({ id: "4", date: "2026-09-10" }),
      todo({ id: "5", date: TODAY, cleared: true }), // cleared today: in history now
    ];
    const groups = historyOf(items, "day", TODAY);
    // Newest first — including today's own group, since a cleared item from
    // today has already left the active list even though the day is not over.
    assert.deepEqual(groups.map((g) => g.key), [TODAY, "2026-09-15", "2026-09-10"]);
    assert.deepEqual(groups[0]!.items.map((t) => t.id), ["5"]);
    assert.deepEqual(groups[1]!.items.map((t) => t.id), ["2", "3"]);
  });

  it("groups week items by the Monday of their week, not their exact date", () => {
    const items = [
      todo({ id: "1", scope: "week", date: "2026-09-08" }), // Tue, week of the 7th
      todo({ id: "2", scope: "week", date: "2026-09-10" }), // Thu, same week
      todo({ id: "3", scope: "week", date: "2026-09-14" }), // this week: not history
    ];
    const groups = historyOf(items, "week", TODAY);
    assert.deepEqual(groups.map((g) => g.key), ["2026-09-07"]);
    assert.deepEqual(groups[0]!.items.map((t) => t.id), ["1", "2"]);
  });

  it("never mixes the two scopes", () => {
    const items = [
      todo({ id: "1", date: "2026-09-10" }),
      todo({ id: "2", scope: "week", date: "2026-09-07" }),
    ];
    assert.deepEqual(historyOf(items, "day", TODAY).flatMap((g) => g.items.map((t) => t.id)), ["1"]);
    assert.deepEqual(historyOf(items, "week", TODAY).flatMap((g) => g.items.map((t) => t.id)), ["2"]);
  });

  it("is empty when nothing has left the active list", () => {
    assert.deepEqual(historyOf([todo({ id: "1", date: TODAY })], "day", TODAY), []);
  });
});

describe("labelling a group", () => {
  it("names today and yesterday specially", () => {
    assert.equal(dayGroupLabel(TODAY, TODAY), "Today");
    assert.equal(dayGroupLabel("2026-09-15", TODAY), "Yesterday");
  });

  it("falls back to a short weekday date further back", () => {
    assert.match(dayGroupLabel("2026-09-10", TODAY), /Thu/);
  });

  it("names the current week specially", () => {
    assert.equal(weekGroupLabel(MONDAY, TODAY), "This week");
    assert.match(weekGroupLabel("2026-09-07", TODAY), /^Week of/);
  });
});

describe("the progress readout", () => {
  it("counts done against the total", () => {
    assert.equal(progressOf([{ done: true }, { done: false }, { done: true }]), "2/3");
  });

  it("reads 0/0 for an empty list", () => {
    assert.equal(progressOf([]), "0/0");
  });
});
