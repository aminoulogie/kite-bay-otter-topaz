import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DASHBOARD_WIDGETS as WIDGETS, SIZES, SIZE_SPECS, WIDGETS_BY_TAB, asSize, columnsFor,
  cycleSize, defaultLayout, hasDetailRoom, hasFullRoom, isArrangeable, isTile, widgetsFor,
  hidden, isDefault, move, nextSize, reconcile, resize, rowsFor, setHidden, specFor,
  toggleHidden, visible, widgetDef, SPACER_SIZE, addSpacer, isNatural, isSpacer,
  nextSpacerId, removeWidget, type WidgetPlacement, type WidgetSize,
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

test("the size cycles along the ladder and round again", () => {
  assert.deepEqual(SIZES, ["1x1", "1x2", "2x2", "1x4", "2x4", "3x4"]);
  assert.equal(nextSize("1x1"), "1x2");
  assert.equal(nextSize("2x2"), "1x4");
  assert.equal(nextSize("3x4"), "1x1", "the last one wraps to the first");
  let l = resize(defaultLayout(), "score", "1x1");
  l = cycleSize(l, "score");
  assert.equal(l.find((p) => p.id === "score")?.size, "1x2");
});

test("cycling a widget that is not there changes nothing", () => {
  const l = defaultLayout();
  assert.equal(cycleSize(l, "ghost"), l);
});

test("the id says the shape, and the shape says the box", () => {
  // The id IS the grid shape, so these cannot drift apart without the name
  // becoming a lie.
  for (const spec of SIZE_SPECS) {
    const [h, w] = spec.id.split("x").map(Number);
    assert.equal(spec.h, h, spec.id);
    assert.equal(spec.w, w, spec.id);
    assert.equal(columnsFor(spec.id), w, spec.id);
    assert.equal(rowsFor(spec.id), h, spec.id);
  }
});

test("the six shapes are all different, and all fit four columns", () => {
  assert.equal(new Set(SIZES).size, 6);
  for (const spec of SIZE_SPECS) {
    assert.ok(spec.w === 1 || spec.w === 2 || spec.w === 4, spec.id);
    assert.ok(spec.h >= 1 && spec.h <= 3, spec.id);
  }
});

test("a narrow size is a tile, a full-width one is not", () => {
  // The distinction that decides whether height is a cap or a floor.
  assert.equal(isTile("1x1"), true);
  assert.equal(isTile("1x2"), true);
  assert.equal(isTile("2x2"), true);
  assert.equal(isTile("1x4"), false);
  assert.equal(isTile("2x4"), false);
  assert.equal(isTile("3x4"), false);
});

test("how much a card draws follows its height, not its width", () => {
  // Picking 1x4 over 2x4 means "I want this short", so a wide-but-short card
  // draws less. Gating on width instead would make 1x4 and 3x4 identical.
  assert.equal(hasDetailRoom("1x1"), false);
  assert.equal(hasDetailRoom("1x2"), false);
  assert.equal(hasDetailRoom("1x4"), false);
  assert.equal(hasDetailRoom("2x2"), true);
  assert.equal(hasDetailRoom("2x4"), true);
  assert.equal(hasDetailRoom("3x4"), true);

  assert.equal(hasFullRoom("2x4"), false);
  assert.equal(hasFullRoom("3x4"), true);
});

test("an unknown size falls back to a real spec rather than throwing", () => {
  assert.ok(SIZES.includes(specFor("9x9" as WidgetSize).id));
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
    { id: "ghost", size: "2x4", hidden: false },
    ...defaultLayout(),
  ]);
  assert.equal(l.length, WIDGETS.length);
  assert.ok(!ids(l).includes("ghost"));
});

test("a duplicated id in storage is taken once", () => {
  const l = reconcile([
    { id: "score", size: "2x2", hidden: false },
    { id: "score", size: "2x4", hidden: true },
    ...defaultLayout(),
  ]);
  assert.equal(ids(l).filter((x) => x === "score").length, 1);
  assert.equal(l.find((p) => p.id === "score")?.size, "2x2", "the first one wins");
});

test("a size a widget was saved at is kept, whatever it was", () => {
  const l = reconcile([{ id: "brief", size: "2x2", hidden: false }]);
  assert.equal(l.find((p) => p.id === "brief")?.size, "2x2", "the user's choice stands");
});

test("rubbish in storage does not throw or leak through", () => {
  const junk = [null, undefined, 7, "score", { span: 2 }, { id: 5 }] as unknown as WidgetPlacement[];
  const l = reconcile(junk);
  assert.deepEqual(l, defaultLayout());
});

test("a non-boolean hidden reads as showing", () => {
  const l = reconcile([{ id: "fat", size: "2x2", hidden: "yes" as unknown as boolean }]);
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
  assert.equal(asSize(1), "2x2");
  assert.equal(asSize(2), "2x4");
  assert.equal(asSize("3x4"), "3x4");
  assert.equal(asSize(0), null);
  assert.equal(asSize(undefined), null);

  const old = [{ id: "cals", size: "2x2", hidden: false }] as unknown as WidgetPlacement[];
  assert.equal(reconcile(old).find((p) => p.id === "cals")?.size, "2x2");
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

/* --------------------------------------------------------------------------
   Furniture that can be resized after all.
   -------------------------------------------------------------------------- */
test("furniture takes its own height only at the size it was given", () => {
  const bar = { id: "tabs", label: "Tabs", size: "2x4" as WidgetSize, natural: true };
  assert.equal(isNatural(bar, "2x4"), true, "left where it was put");
  assert.equal(isNatural(bar, "3x4"), false, "moved off its default");
  assert.equal(isNatural(bar, "1x1"), false);
});

test("a card is never natural, at any size", () => {
  const card = { id: "score", label: "Score", size: "2x2" as WidgetSize };
  for (const spec of SIZE_SPECS) assert.equal(isNatural(card, spec.id), false, spec.id);
  assert.equal(isNatural(undefined, "2x4"), false);
});

test("every piece of furniture in the registry can be sized off its default", () => {
  // The bug this guards: three of Train's five widgets showed a size picker
  // that visibly did nothing, because `natural` was read at every size.
  for (const [tab, list] of Object.entries(WIDGETS_BY_TAB)) {
    for (const w of list.filter((x) => x.natural)) {
      const other = SIZE_SPECS.map((s) => s.id).find((s) => s !== w.size)!;
      assert.equal(isNatural(w, other), false, `${tab}/${w.id}`);
    }
  }
});

/* --------------------------------------------------------------------------
   Spacers: a gap you put there on purpose.
   -------------------------------------------------------------------------- */
test("a spacer id is told apart from every registered one", () => {
  assert.equal(isSpacer("spacer:1"), true);
  for (const list of Object.values(WIDGETS_BY_TAB)) {
    for (const w of list) assert.equal(isSpacer(w.id), false, w.id);
  }
});

test("spacer ids are serial, and a freed number comes back", () => {
  let layout = defaultLayout("workout");
  assert.equal(nextSpacerId(layout), "spacer:1");
  layout = addSpacer(layout);
  assert.equal(layout.at(-1)!.id, "spacer:1");
  assert.equal(layout.at(-1)!.size, SPACER_SIZE);
  layout = addSpacer(layout);
  assert.equal(layout.at(-1)!.id, "spacer:2");
  layout = removeWidget(layout, "spacer:1");
  assert.equal(nextSpacerId(layout), "spacer:1");
});

test("adding a gap leaves every widget where it was", () => {
  const before = defaultLayout("dashboard");
  const after = addSpacer(before);
  assert.deepEqual(after.slice(0, before.length), before);
  assert.equal(after.length, before.length + 1);
});

test("reconcile keeps spacers and still repairs the rest", () => {
  const layout = addSpacer(addSpacer(defaultLayout("workout")));
  const round = reconcile(layout, "workout");
  assert.deepEqual(round, layout, "a layout with gaps survives a reload unchanged");

  // A gap in a layout that is ALSO missing a widget: the widget comes back in
  // registry order, the gaps stay.
  const short = round.filter((p) => p.id !== "session");
  const fixed = reconcile(short, "workout");
  assert.equal(fixed.filter((p) => isSpacer(p.id)).length, 2);
  assert.ok(fixed.some((p) => p.id === "session"), "the missing widget returns");
  assert.equal(fixed.length, defaultLayout("workout").length + 2);
});

test("a spacer can be any of the six sizes, and a broken one falls back", () => {
  const layout = addSpacer(defaultLayout("workout"));
  for (const spec of SIZE_SPECS) {
    const sized = resize(layout, "spacer:1", spec.id, "workout");
    assert.equal(sized.find((p) => p.id === "spacer:1")!.size, spec.id);
    assert.deepEqual(reconcile(sized, "workout"), sized, spec.id);
  }
  const junk = [{ id: "spacer:1", size: "9x9" as WidgetSize, hidden: false }];
  assert.equal(reconcile(junk, "workout").find((p) => p.id === "spacer:1")!.size, SPACER_SIZE);
});

test("a page with gaps is not the default page", () => {
  assert.equal(isDefault(defaultLayout("workout"), "workout"), true);
  assert.equal(isDefault(addSpacer(defaultLayout("workout")), "workout"), false);
});

test("removeWidget takes out exactly one thing", () => {
  const layout = addSpacer(defaultLayout("workout"));
  const gone = removeWidget(layout, "spacer:1");
  assert.deepEqual(gone, defaultLayout("workout"));
  assert.deepEqual(removeWidget(layout, "nothing:here"), layout);
});
