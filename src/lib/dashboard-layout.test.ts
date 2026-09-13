import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DASHBOARD_WIDGETS as WIDGETS, SIZES, WIDGETS_BY_TAB, asSize, columnsFor, cycleSize,
  defaultLayout, isArrangeable, widgetsFor, hidden, isDefault, move, nextSize, reconcile,
  resize, setHidden, toggleHidden, visible, widgetDef,
  type WidgetPlacement, type WidgetSize,
} from "./dashboard-layout.ts";
import { TAB_ORDER } from "./tab-order.ts";

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

test("a widget takes any of the three sizes", () => {
  for (const size of SIZES) {
    const l = resize(defaultLayout(), "score", size);
    assert.equal(l.find((p) => p.id === "score")?.size, size);
  }
});

test("every widget on every page can be set to every size", () => {
  // The old registry locked prose cards to full width. That was the app
  // deciding which of the user's cards mattered enough to stay big, which is
  // not its call — a card that looks bad small is one tap from being medium.
  for (const [tab, list] of Object.entries(WIDGETS_BY_TAB)) {
    for (const w of list) {
      for (const size of SIZES) {
        const l = resize(defaultLayout(tab), w.id, size, tab);
        assert.equal(l.find((p) => p.id === w.id)?.size, size, `${tab}/${w.id} → ${size}`);
      }
    }
  }
});

test("the size cycles small to medium to large and round again", () => {
  assert.equal(nextSize("small"), "medium");
  assert.equal(nextSize("medium"), "large");
  assert.equal(nextSize("large"), "small");
  let l = resize(defaultLayout(), "score", "small");
  l = cycleSize(l, "score");
  assert.equal(l.find((p) => p.id === "score")?.size, "medium");
});

test("cycling a widget that is not there changes nothing", () => {
  const l = defaultLayout();
  assert.equal(cycleSize(l, "ghost"), l);
});

test("only small takes one column; medium and large take the row", () => {
  assert.equal(columnsFor("small"), 1);
  assert.equal(columnsFor("medium"), 2);
  assert.equal(columnsFor("large"), 2);
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
    { id: "ghost", size: "medium", hidden: false },
    ...defaultLayout(),
  ]);
  assert.equal(l.length, WIDGETS.length);
  assert.ok(!ids(l).includes("ghost"));
});

test("a duplicated id in storage is taken once", () => {
  const l = reconcile([
    { id: "score", size: "small", hidden: false },
    { id: "score", size: "medium", hidden: true },
    ...defaultLayout(),
  ]);
  assert.equal(ids(l).filter((x) => x === "score").length, 1);
  assert.equal(l.find((p) => p.id === "score")?.size, "small", "the first one wins");
});

test("a size a widget was saved at is kept, whatever it was", () => {
  const l = reconcile([{ id: "brief", size: "small", hidden: false }]);
  assert.equal(l.find((p) => p.id === "brief")?.size, "small", "the user's choice stands");
});

test("rubbish in storage does not throw or leak through", () => {
  const junk = [null, undefined, 7, "score", { span: 2 }, { id: 5 }] as unknown as WidgetPlacement[];
  const l = reconcile(junk);
  assert.deepEqual(l, defaultLayout());
});

test("a non-boolean hidden reads as showing", () => {
  const l = reconcile([{ id: "fat", size: "small", hidden: "yes" as unknown as boolean }]);
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

test("a size nobody recognises falls back to the widget's own", () => {
  for (const w of WIDGETS) {
    const l = reconcile([{ id: w.id, size: "enormous" as unknown as WidgetSize, hidden: false }]);
    assert.equal(l.find((p) => p.id === w.id)?.size, w.size, w.id);
  }
});

test("a layout saved as column counts still reads as sizes", () => {
  // Everyone with a saved layout has one of these. Dropping them would reset
  // the page of every user who had ever arranged one.
  assert.equal(asSize(1), "small");
  assert.equal(asSize(2), "medium");
  assert.equal(asSize("large"), "large");
  assert.equal(asSize(0), null);
  assert.equal(asSize(undefined), null);

  const old = [{ id: "cals", size: "small", hidden: false }] as unknown as WidgetPlacement[];
  assert.equal(reconcile(old).find((p) => p.id === "cals")?.size, "small");
});

test("every arrangeable tab has widgets, and ids are unique within it", () => {
  for (const [tab, list] of Object.entries(WIDGETS_BY_TAB)) {
    assert.ok(list.length > 0, tab);
    assert.equal(new Set(list.map((w) => w.id)).size, list.length, `${tab} has a duplicate id`);
    assert.equal(isArrangeable(tab), true, tab);
    assert.deepEqual(widgetsFor(tab), list);
  }
});

test("every tab in the dock can be rearranged", () => {
  // The point of the edit button is that it is on every page. A tab added to
  // the dock without a layout registered gets a button that does nothing when
  // pressed, which is worse than no button — so this fails at the moment the
  // dock and the registry disagree, rather than on someone's phone.
  for (const tab of TAB_ORDER) {
    assert.equal(isArrangeable(tab), true, `${tab} has no layout registered`);
  }
});

test("a tab nobody registered is inert, not half-working", () => {
  for (const tab of ["nope", "mind-films", ""]) {
    assert.equal(isArrangeable(tab), false, tab);
    assert.deepEqual(widgetsFor(tab), []);
    assert.deepEqual(defaultLayout(tab), []);
    assert.deepEqual(reconcile(undefined, tab), []);
  }
});

test("the same id on two tabs keeps its own tab's rules", () => {
  // "header" exists on both Time and Habits, and they are different widgets.
  assert.ok(widgetDef("time", "header"));
  assert.ok(widgetDef("habits", "header"));
  assert.equal(widgetDef("time", "header")?.label, "The day");
  assert.equal(widgetDef("habits", "header")?.label, "Consistency");
});

test("a layout saved for one tab cannot leak into another", () => {
  const mine = defaultLayout("mind");
  const onTime = reconcile(mine, "time");
  assert.deepEqual(onTime, defaultLayout("time"), "Mind's widgets are dropped, Time's filled in");
});

test("each tab's default is its own registry, in order", () => {
  for (const [tab, list] of Object.entries(WIDGETS_BY_TAB)) {
    assert.deepEqual(defaultLayout(tab).map((p) => p.id), list.map((w) => w.id), tab);
    assert.equal(isDefault(defaultLayout(tab), tab), true, tab);
  }
});
