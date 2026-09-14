import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHTML } from "linkedom";

/**
 * The picker runs in a browser; linkedom stands in for one here so the part
 * that actually broke — the race between "the sheet closed" and "the file
 * arrived" — can be tested rather than reasoned about.
 */
const { document, window } = parseHTML("<html><body></body></html>");
const g = globalThis as unknown as Record<string, unknown>;
g.document = document;
g.window = window;
g.HTMLInputElement = (window as unknown as { HTMLInputElement: unknown }).HTMLInputElement;

const { CANCEL_GRACE_MS, pickFiles } = await import("./file-picker.ts");

/** The one input the picker just added to the page. */
function theInput(): HTMLInputElement {
  const el = document.body.querySelector("input[type=file]");
  assert.ok(el, "the picker did not add an input to the page");
  return el as unknown as HTMLInputElement;
}

/** Hand the input some files, the way a browser does when the user picks. */
function deliver(names: string[]) {
  const input = theInput();
  Object.defineProperty(input, "files", {
    configurable: true,
    value: names.map((name) => ({ name, type: "" })),
  });
  input.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event("change"));
}

function fire(type: string) {
  window.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event(type));
}

test("a file chosen the ordinary way comes straight back", async () => {
  const picked = pickFiles({ graceMs: 20 });
  deliver(["Dune.epub"]);
  assert.deepEqual((await picked).map((f) => f.name), ["Dune.epub"]);
  assert.equal(document.body.querySelector("input[type=file]"), null, "and the input is cleaned up");
});

test("a file that arrives AFTER the picker closes is still imported", async () => {
  // The bug, exactly. iOS dismisses the Files sheet the moment you tap a book
  // and only then copies it out of iCloud, so focus comes back to the page
  // with the input still empty. Resolving there threw the book away and the
  // shelf looked untouched — no book, no error, nothing to go on.
  const picked = pickFiles({ graceMs: 200 });
  fire("blur");
  fire("focus");
  await new Promise((r) => setTimeout(r, 60));
  deliver(["The Selfish Gene.pdf"]);
  assert.deepEqual((await picked).map((f) => f.name), ["The Selfish Gene.pdf"]);
});

test("a file still not there when the grace runs out is taken as a cancel", async () => {
  const picked = pickFiles({ graceMs: 30 });
  fire("blur");
  fire("focus");
  assert.deepEqual(await picked, []);
});

test("focus without a blur first is not the picker closing", async () => {
  // Tabbing back to the browser, or a focus event fired by the click itself,
  // must not count as "the picker closed with nothing in it" — the picker may
  // not even be open yet.
  const picked = pickFiles({ graceMs: 30 });
  fire("focus");
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(document.body.querySelector("input[type=file]"), "still waiting, as it should be");
  deliver(["late.epub"]);
  assert.deepEqual((await picked).map((f) => f.name), ["late.epub"]);
});

test("the cancel event answers immediately, without waiting out the grace", async () => {
  const picked = pickFiles({ graceMs: 5000 });
  const started = Date.now();
  theInput().dispatchEvent(new (window as unknown as { Event: typeof Event }).Event("cancel"));
  assert.deepEqual(await picked, []);
  assert.ok(Date.now() - started < 1000, "did not sit through the fallback timer");
});

test("the grace is long enough for a book to come out of iCloud", () => {
  // 400ms was the old value and the reason this never worked on a phone.
  assert.ok(CANCEL_GRACE_MS >= 1500, `${CANCEL_GRACE_MS}ms is not long enough`);
});

test("the input is laid out, not display:none", () => {
  // Safari has refused to open a picker for an input that was never given a
  // box. One pixel and no opacity is the version that works everywhere.
  const picked = pickFiles({ graceMs: 10 });
  const style = theInput().style;
  assert.equal(style.display, "", "display:none is what Safari objects to");
  assert.equal(style.opacity, "0");
  assert.equal(style.position, "fixed");
  fire("blur");
  fire("focus");
  return picked;
});
