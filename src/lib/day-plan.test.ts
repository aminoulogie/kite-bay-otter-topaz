import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DAY_HOURS, MIN_BLOCK_HOURS, addBlock, arcPath, arcs, blockAtHour, clockAt,
  defaultPlan, fixedHours, formatHours, normalise, patchBlock, polar, removeBlock,
  setHours, snap, splitBlock, totalHours, type TimeBlock,
} from "./day-plan.ts";

const b = (over: Partial<TimeBlock> & { id: string; hours: number }): TimeBlock => ({
  label: over.id, color: "#000", fixed: false, ...over,
});

const full = () => [
  b({ id: "sleep", hours: 8, fixed: true }),
  b({ id: "work", hours: 8, fixed: true }),
  b({ id: "free", hours: 8 }),
];

// ------------------------------------------------------------ invariant --

test("a plan always adds up to a day", () => {
  assert.equal(totalHours(normalise(full()).blocks), DAY_HOURS);
});

test("free time absorbs whatever the fixed blocks leave", () => {
  const plan = normalise([
    b({ id: "sleep", hours: 9, fixed: true }),
    b({ id: "work", hours: 8, fixed: true }),
    b({ id: "free", hours: 99 }),
  ]);
  assert.equal(plan.free, 7);
  assert.equal(plan.blocks.find((x) => x.id === "free")!.hours, 7);
  assert.equal(totalHours(plan.blocks), DAY_HOURS);
});

test("a plan with no variable block grows one rather than not adding up", () => {
  const plan = normalise([b({ id: "sleep", hours: 8, fixed: true })]);
  assert.equal(totalHours(plan.blocks), DAY_HOURS);
  assert.ok(plan.blocks.some((x) => !x.fixed));
});

test("two free blocks keep their ratio as the leftover changes", () => {
  // The ratio is a decision the user made; an edit elsewhere is no reason to
  // overwrite it.
  const plan = normalise([
    b({ id: "sleep", hours: 12, fixed: true }),
    b({ id: "a", hours: 9 }),
    b({ id: "c", hours: 3 }),
  ]);
  const a = plan.blocks.find((x) => x.id === "a")!.hours;
  const c = plan.blocks.find((x) => x.id === "c")!.hours;
  assert.equal(a + c, 12);
  assert.ok(Math.abs(a / c - 3) < 0.2, `expected roughly 3:1, got ${a}:${c}`);
});

test("a day that cannot exist is reported, not quietly trimmed", () => {
  // Shaving the excess off a fixed block would silently rewrite something the
  // user pinned — sleep, usually.
  const plan = normalise([
    b({ id: "sleep", hours: 10, fixed: true }),
    b({ id: "work", hours: 16, fixed: true }),
  ]);
  assert.equal(plan.over, true);
  assert.ok(plan.free < 0);
  assert.equal(fixedHours(plan.blocks), 26, "the blocks are left exactly as given");
});

test("everything allocated leaves no free block at all", () => {
  const plan = normalise([
    b({ id: "sleep", hours: 8, fixed: true }),
    b({ id: "work", hours: 16, fixed: true }),
  ]);
  assert.equal(plan.free, 0);
  assert.equal(plan.over, false);
  assert.equal(totalHours(plan.blocks), DAY_HOURS);
});

test("hours snap to the quarter people actually plan in", () => {
  assert.equal(snap(7.51), 7.5);
  assert.equal(snap(7.6), 7.5);
  assert.equal(snap(7.63), 7.75);
  assert.equal(snap(-3), 0);
  assert.equal(snap(Number.NaN), 0);
});

test("rounding never leaks a minute out of the day", () => {
  // Three equal shares of ten hours do not divide into quarter hours.
  const plan = normalise([
    b({ id: "sleep", hours: 14, fixed: true }),
    b({ id: "a", hours: 1 }),
    b({ id: "b", hours: 1 }),
    b({ id: "c", hours: 1 }),
  ]);
  assert.equal(totalHours(plan.blocks), DAY_HOURS);
});

// --------------------------------------------------------------- edits --

test("growing a fixed block takes the hours out of free time", () => {
  const next = setHours(full(), "work", 10);
  assert.equal(next.find((x) => x.id === "work")!.hours, 10);
  assert.equal(next.find((x) => x.id === "free")!.hours, 6);
  assert.equal(totalHours(next), DAY_HOURS);
});

test("a fixed block cannot be grown past what the other fixed blocks leave", () => {
  const next = setHours(full(), "work", 40);
  assert.equal(next.find((x) => x.id === "work")!.hours, 16, "24 minus 8 of sleep");
  assert.equal(totalHours(next), DAY_HOURS);
});

test("growing a free block eats the free blocks beside it, biggest first", () => {
  const plan = [
    b({ id: "sleep", hours: 12, fixed: true }),
    b({ id: "a", hours: 2 }),
    b({ id: "big", hours: 8 }),
    b({ id: "c", hours: 2 }),
  ];
  const next = setHours(plan, "a", 6);
  assert.equal(next.find((x) => x.id === "a")!.hours, 6);
  assert.equal(next.find((x) => x.id === "big")!.hours, 4, "the largest gave way first");
  assert.equal(next.find((x) => x.id === "c")!.hours, 2, "the small one was untouched");
  assert.equal(totalHours(next), DAY_HOURS);
});

test("a free block cannot be dragged past the end of the day", () => {
  const next = setHours(full(), "free", 30);
  assert.equal(next.find((x) => x.id === "free")!.hours, 8);
  assert.equal(totalHours(next), DAY_HOURS);
});

test("adding a fixed activity takes it out of free time", () => {
  const next = addBlock(full(), { label: "Gym", hours: 2, color: "#f00", fixed: true });
  assert.equal(next.find((x) => x.label === "Gym")!.hours, 2);
  assert.equal(next.find((x) => x.id === "free")!.hours, 6);
  assert.equal(totalHours(next), DAY_HOURS);
});

test("deleting a fixed block hands its hours back", () => {
  const next = removeBlock(full(), "work");
  assert.equal(next.find((x) => x.id === "free")!.hours, 16);
  assert.equal(totalHours(next), DAY_HOURS);
});

test("pinning a block keeps the hours it already had", () => {
  const next = patchBlock(full(), "free", { fixed: true, label: "Study" });
  const studied = next.find((x) => x.id === "free")!;
  assert.equal(studied.fixed, true);
  assert.equal(studied.hours, 8);
  assert.equal(totalHours(next), DAY_HOURS);
});

test("splitting a free block divides it rather than adding time", () => {
  const next = splitBlock(full(), "free", "Read", 3, "#abc");
  assert.equal(next.find((x) => x.id === "free")!.hours, 5);
  assert.equal(next.find((x) => x.label === "Read")!.hours, 3);
  assert.equal(totalHours(next), DAY_HOURS);
});

test("a fixed block cannot be split, and neither can a sliver", () => {
  assert.deepEqual(splitBlock(full(), "sleep", "Nap", 1, "#abc"), full());
  const thin = [b({ id: "x", hours: 24, fixed: true })];
  assert.equal(totalHours(splitBlock(thin, "x", "Nap", 1, "#abc")), DAY_HOURS);
});

test("a block squeezed below a quarter hour is dropped, not left untappable", () => {
  const plan = normalise([
    b({ id: "sleep", hours: 23.9, fixed: true }),
    b({ id: "a", hours: 4 }),
    b({ id: "b", hours: 4 }),
  ]);
  assert.ok(plan.blocks.filter((x) => !x.fixed).every((x) => x.hours >= MIN_BLOCK_HOURS));
  assert.equal(totalHours(plan.blocks), DAY_HOURS);
});

// ------------------------------------------------------------ geometry --

test("the ring is laid out in order from the day's start", () => {
  const list = arcs(full());
  assert.equal(list[0]!.startHour, 0);
  assert.equal(list[0]!.endHour, 8);
  assert.equal(list[1]!.startHour, 8);
  assert.equal(list[2]!.endHour, 24);
  assert.equal(list[0]!.startAngle, 0);
  assert.equal(list[2]!.endAngle, 360);
});

test("fifteen degrees is an hour", () => {
  const list = arcs([b({ id: "x", hours: 1 }), b({ id: "y", hours: 23 })]);
  assert.equal(list[0]!.endAngle, 15);
});

test("a day can start somewhere other than midnight", () => {
  const list = arcs(full(), 6);
  assert.equal(list[0]!.startHour, 6);
  assert.equal(list[0]!.endHour, 14);
});

test("a zero-hour block takes no space on the ring", () => {
  const list = arcs([b({ id: "gone", hours: 0 }), b({ id: "all", hours: 24 })]);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.block.id, "all");
});

test("the hour you point at finds its block, midnight wrap included", () => {
  const list = arcs(full());
  assert.equal(blockAtHour(list, 3)!.block.id, "sleep");
  assert.equal(blockAtHour(list, 8)!.block.id, "work");
  assert.equal(blockAtHour(list, 23.9)!.block.id, "free");
  assert.equal(blockAtHour(list, 25)!.block.id, "sleep", "an hour past the end wraps round");
});

test("zero degrees is the top of the ring and angles run clockwise", () => {
  const top = polar(0, 0, 10, 0);
  assert.ok(Math.abs(top.x) < 1e-9);
  assert.equal(Math.round(top.y), -10);
  const right = polar(0, 0, 10, 90);
  assert.equal(Math.round(right.x), 10);
});

test("a block filling the whole day still draws", () => {
  // Start and end land on the same point, and a single arc command between
  // them renders nothing at all — so a one-block day would vanish.
  const path = arcPath(50, 50, 40, 28, 0, 360);
  assert.ok(path.length > 0);
  assert.equal((path.match(/A /g) ?? []).length, 4, "two half arcs per edge");
});

test("an empty sweep draws nothing rather than a stray line", () => {
  assert.equal(arcPath(50, 50, 40, 28, 90, 90), "");
  assert.equal(arcPath(50, 50, 40, 28, 90, 40), "");
});

test("an arc over half the circle sets the large-arc flag", () => {
  assert.match(arcPath(50, 50, 40, 28, 0, 200), /A 40 40 0 1 1/);
  assert.match(arcPath(50, 50, 40, 28, 0, 100), /A 40 40 0 0 1/);
});

// ------------------------------------------------------------- reading --

test("durations read the way people say them", () => {
  assert.equal(formatHours(7.5), "7h 30m");
  assert.equal(formatHours(8), "8h");
  assert.equal(formatHours(0.75), "45m");
  assert.equal(formatHours(0), "0m");
});

test("the ring is a clock, so it speaks in clock times", () => {
  assert.equal(clockAt(0), "00:00");
  assert.equal(clockAt(6.5), "06:30");
  assert.equal(clockAt(23.75), "23:45");
  assert.equal(clockAt(25), "01:00", "past midnight wraps");
});

test("a time that rounds to sixty minutes is the next hour, not :60", () => {
  assert.equal(clockAt(7.999), "08:00");
  assert.equal(clockAt(23.999), "00:00");
});

test("the shipped day is a real one that adds up", () => {
  const plan = defaultPlan();
  assert.equal(totalHours(plan), DAY_HOURS);
  assert.ok(plan.some((x) => x.fixed && x.label === "Sleep"));
  assert.ok(plan.some((x) => !x.fixed));
});
