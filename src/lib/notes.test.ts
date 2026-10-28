import assert from "node:assert/strict";
import { test } from "node:test";
import { asNotes, isNotePath, linkTasks, noteTasks, planMirror, setSomaBlock, SOMA_END, SOMA_START } from "./notes.ts";

test("only Markdown outside hidden folders is a note", () => {
  assert.ok(isNotePath("Daily/2026-10-28.md"));
  assert.ok(!isNotePath(".obsidian/workspace.md"));
  assert.ok(!isNotePath("img/cover.png"));
  assert.deepEqual(asNotes([{ id: "a.md", text: "x", mtime: 5 }, { id: "a.md" }, { id: 3 }]), [{ id: "a.md", text: "x", mtime: 5 }]);
});

test("a mirror takes new files, writes newer notes, and drops notes whose file went", () => {
  const notes = [
    { id: "same.md", text: "a", mtime: 100 },
    { id: "edited-on-tablet.md", text: "new", mtime: 9000 },
    { id: "edited-on-pc.md", text: "old", mtime: 100 },
    { id: "from-phone.md", text: "hi", mtime: 6000 },
    { id: "deleted-here.md", text: "bye", mtime: 100 },
  ];
  const files = [
    { path: "same.md", text: "a", modified: 200 },
    { path: "edited-on-tablet.md", text: "old", modified: 1000 },
    { path: "edited-on-pc.md", text: "new", modified: 4000 },
    { path: "brand-new.md", text: "n", modified: 4500 },
    { path: ".obsidian/app.md", text: "{}", modified: 4500 },
  ];
  const plan = planMirror(files, notes, 5000);
  assert.deepEqual(plan.put.map((n) => n.id).sort(), ["brand-new.md", "edited-on-pc.md"]);
  assert.deepEqual(plan.write.map((w) => w.path).sort(), ["edited-on-tablet.md", "from-phone.md"]);
  assert.deepEqual(plan.remove, ["deleted-here.md"]);
  // The first mirror never deletes: a note with no file is written.
  assert.deepEqual(planMirror([], notes.slice(4), 0).write.map((w) => w.path), ["deleted-here.md"]);
});

test("the SOMA block is replaced in place, and added once", () => {
  const once = setSomaBlock("# Day\n\nmy words\n", "A");
  assert.equal(once, `# Day\n\nmy words\n\n${SOMA_START}\nA\n${SOMA_END}\n`);
  const twice = setSomaBlock(once.replace("my words", "mine"), "B");
  assert.equal(twice, `# Day\n\nmine\n\n${SOMA_START}\nB\n${SOMA_END}\n`);
});

test("checkboxes become to-dos, and ticks go both ways", () => {
  const text = "- [ ] Call the bank\n- [x] Old ^s-t1\n- [ ] Pay rent ^s-t2\n" + `${SOMA_START}\n- [ ] generated\n${SOMA_END}`;
  assert.equal(noteTasks(text).length, 3);
  const r = linkTasks(text, [{ id: "t1", text: "Old", done: false }, { id: "t2", text: "Pay rent", done: true }], () => "n1");
  assert.deepEqual(r.create, [{ id: "n1", text: "Call the bank" }]);
  assert.deepEqual(r.done, ["t1"]);
  assert.ok(r.text.startsWith("- [ ] Call the bank ^s-n1\n- [x] Old ^s-t1\n- [x] Pay rent ^s-t2\n"));
  assert.ok(r.text.includes("- [ ] generated"));
});
