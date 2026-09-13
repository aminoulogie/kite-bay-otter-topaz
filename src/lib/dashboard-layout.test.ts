import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WIDGETS, defaultLayout, hidden, isDefault, move, reconcile, resize, setHidden, toggleHidden,
  toggleSpan, visible, widgetDef, type WidgetPlacement,
} from "./dashboard-layout.ts";

const ids = (l: WidgetPlacement[]) => l.map((p) => p.id);

test("a fresh layout is every widget, in registry order, all showing", () => {
  const l = defaultLayout();
  assert.equal(l.length, WIDGETS.length);
  assert.deepEqual(ids(l), WIDGETS.map((w) => w.id));
  assert.ok(l.every((p) => !p.hidden));
  assert.equal(isDefault(l), true);
});

test("moving a widget closes the gap behind it", () => {
  const l = move(defaultLayout(), "protein", 0);
  assert.equal(ids(l)[0], "protein");
  assert.equal(l.length, WIDGETS.length, "nothing is lost or duplicated");
  assert.equal(new Set(ids(l)).size, WIDGETS.length);
});

test("moving to the end works, and past the end clamps", () => {
  const l = defaultLayout();
  assert.equal(ids(move(l, "brief", l.length - 1)).at(-1), "brief");
  assert.equal(ids(move(l, "brief", 999)).at(-1), "brief");
  assert.equal(ids(move(l, "correlate", -5))[0], "correlate");
});

test("moving a widget to where it already is changes nothing", () => {
  const l = defaultLayout();
  assert.equal(move(l, "brief", 0), l, "the same reference, so React does not re-render");
});

test("an unknown id moves nothing", () => {
  const l = defaultLayout();
  assert.equal(move(l, "ghost", 3), l);
});

test("a widget is half a row or the whole of it, never anything else", () => {
  const l = resize(defaultLayout(), "score", 1);
  assert.equal(l.find((p) => p.id === "score")?.span, 1);
  const back = toggleSpan(l, "score");
  assert.equal(back.find((p) => p.id === "score")?.span, 2);
});

test("a prose widget refuses to be squeezed into half a phone", () => {
  assert.equal(widgetDef("brief")?.resizable, false);
  const l = resize(defaultLayout(), "brief", 1);
  assert.equal(l.find((p) => p.id === "brief")?.span, 2, "it stays full width");
  assert.equal(toggleSpan(l, "brief").find((p) => p.id === "brief")?.span, 2);
});

test("hiding keeps the widget's place for when it comes back", () => {
  let l = defaultLayout();
  const was = ids(l).indexOf("carbs");
  l = toggleHidden(l, "carbs");
  assert.equal(l.find((p) => p.id === "carbs")?.hidden, true);
  assert.equal(ids(l).indexOf("carbs"), was, "hidden is not removed");
  assert.ok(!ids(visible(l)).includes("carbs"));
  assert.deepEqual(ids(hidden(l)), ["carbs"]);

  l = toggleHidden(l, "carbs");
  assert.equal(ids(l).indexOf("carbs"), was, "and it returns where it was, not at the bottom");
});

test("setHidden is explicit where toggle would be ambiguous", () => {
  const l = setHidden(setHidden(defaultLayout(), "fat", true), "fat", true);
  assert.equal(l.find((p) => p.id === "fat")?.hidden, true);
});

test("nothing stored gives the default", () => {
  assert.deepEqual(reconcile(undefined), defaultLayout());
  assert.deepEqual(reconcile([]), defaultLayout());
});

test("a widget added since the layout was saved still appears", () => {
  // A layout saved before "session" and "correlate" existed.
  const old = defaultLayout()
    .filter((p) => p.id !== "session" && p.id !== "correlate")
    .map((p) => ({ ...p }));
  const l = reconcile(old);
  assert.equal(l.length, WIDGETS.length);
  assert.ok(ids(l).includes("session"));
  assert.ok(ids(l).includes("correlate"));
});

test("a new widget lands near its registry position, not dumped at the end", () => {
  const old = defaultLayout().filter((p) => p.id !== "protein");
  const l = reconcile(old);
  const at = ids(l).indexOf("protein");
  assert.ok(at > 0 && at < l.length - 1, `protein landed at ${at}`);
});

test("a widget that no longer exists leaves no hole", () => {
  const l = reconcile([
    { id: "ghost", span: 2, hidden: false },
    ...defaultLayout(),
  ]);
  assert.equal(l.length, WIDGETS.length);
  assert.ok(!ids(l).includes("ghost"));
});

test("a duplicated id in storage is taken once", () => {
  const l = reconcile([
    { id: "score", span: 1, hidden: false },
    { id: "score", span: 2, hidden: true },
    ...defaultLayout(),
  ]);
  assert.equal(ids(l).filter((x) => x === "score").length, 1);
  assert.equal(l.find((p) => p.id === "score")?.span, 1, "the first one wins");
});

test("a span a widget no longer supports is pulled back", () => {
  // "brief" was resizable in an imagined earlier version and got saved at half.
  const l = reconcile([{ id: "brief", span: 1, hidden: false }]);
  assert.equal(l.find((p) => p.id === "brief")?.span, 2);
});

test("rubbish in storage does not throw or leak through", () => {
  const junk = [null, undefined, 7, "score", { span: 2 }, { id: 5 }] as unknown as WidgetPlacement[];
  const l = reconcile(junk);
  assert.deepEqual(l, defaultLayout());
});

test("a non-boolean hidden reads as showing", () => {
  const l = reconcile([{ id: "fat", span: 1, hidden: "yes" as unknown as boolean }]);
  assert.equal(l.find((p) => p.id === "fat")?.hidden, false);
});

test("the user's own order survives reconciling untouched", () => {
  const mine = move(toggleHidden(defaultLayout(), "carbs"), "protein", 0);
  assert.deepEqual(reconcile(mine), mine);
  assert.equal(isDefault(mine), false);
});

test("every widget in the registry has a distinct id", () => {
  assert.equal(new Set(WIDGETS.map((w) => w.id)).size, WIDGETS.length);
});

test("a locked widget's declared span is the one it keeps", () => {
  for (const w of WIDGETS.filter((x) => !x.resizable)) {
    const l = resize(defaultLayout(), w.id, w.span === 2 ? 1 : 2);
    assert.equal(l.find((p) => p.id === w.id)?.span, w.span, w.id);
  }
});
