/**
 * Which widgets are on a page, in what order, and how wide.
 *
 * The page was a fixed stack, which is fine until the thing you check first is
 * the thing you have to scroll past four cards to reach. So the order and the
 * widths are the user's, and this is the arithmetic behind that.
 *
 * The grid is two columns, because a phone is not wide enough for three and one
 * is just the stack again. A widget is therefore either HALF the row or the
 * WHOLE of it, and nothing in between — a third of a phone screen cannot hold a
 * number and its label.
 *
 * Two rules exist to stop a saved layout rotting:
 *
 * **A stored layout is reconciled against the registry, never trusted whole.**
 * A widget added in a later version has to appear for someone who saved a
 * layout before it existed, and one that has been removed must not leave a hole
 * behind. So the registry is the source of truth for WHICH widgets exist and
 * the stored layout only says where they go.
 *
 * **Hiding is not deleting.** A hidden widget keeps its place in the order, so
 * bringing it back puts it where it was rather than at the bottom.
 */

/**
 * The six sizes, named after the shape they are.
 *
 * The ids ARE the grid shape — "2x4" is two rows tall and four columns wide —
 * because that is how everyone already describes a widget, and a translation
 * layer between "medium" and what it actually draws is one more thing that can
 * disagree with itself. Four columns on a phone is what makes the narrow
 * sizes possible: on a two-column grid there is no such thing as a quarter.
 *
 * Height is a CEILING for the narrow sizes and a FLOOR for the full-width
 * ones, which is the one place this departs from the home screen. A 1x1 tile
 * is a glance and gets a hard box; a 3x4 panel may be the Routines editor, and
 * capping that would put its buttons somewhere you cannot reach them. So a
 * wide card can grow past its size, and a narrow one is clipped behind a fade.
 */
export type WidgetSize = "1x1" | "1x2" | "2x2" | "1x4" | "2x4" | "3x4";

export interface SizeSpec {
  id: WidgetSize;
  /** Columns out of four. */
  w: 1 | 2 | 4;
  /** Height units. One unit is about one column wide, so 1x1 is a square. */
  h: 1 | 2 | 3;
}

/** Smallest to largest, which is the order the picker shows them in. */
export const SIZE_SPECS: SizeSpec[] = [
  { id: "1x1", w: 1, h: 1 },
  { id: "1x2", w: 2, h: 1 },
  { id: "2x2", w: 2, h: 2 },
  { id: "1x4", w: 4, h: 1 },
  { id: "2x4", w: 4, h: 2 },
  { id: "3x4", w: 4, h: 3 },
];

export const SIZES: WidgetSize[] = SIZE_SPECS.map((s) => s.id);

export function specFor(size: WidgetSize): SizeSpec {
  return SIZE_SPECS.find((s) => s.id === size) ?? SIZE_SPECS[4]!;
}

/** How many of the four columns this size takes. */
export function columnsFor(size: WidgetSize): 1 | 2 | 4 {
  return specFor(size).w;
}

export function rowsFor(size: WidgetSize): 1 | 2 | 3 {
  return specFor(size).h;
}

/**
 * Room for a second tier of content under the headline.
 *
 * Height rather than width, because height is what the user actually chose
 * when they picked 1x4 over 2x4: "I want this short". A card that answers this
 * draws less and is therefore genuinely shorter, which is what makes the size
 * mean something instead of being a floor the content immediately exceeds.
 */
export function hasDetailRoom(size: WidgetSize): boolean {
  return rowsFor(size) >= 2;
}

/** Room for everything a card could show. Only the tallest size has it. */
export function hasFullRoom(size: WidgetSize): boolean {
  return rowsFor(size) >= 3;
}

/** True when the size is a glance tile, so its height is a hard box. */
export function isTile(size: WidgetSize): boolean {
  return specFor(size).w < 4;
}

export function nextSize(size: WidgetSize): WidgetSize {
  const i = SIZES.indexOf(size);
  return SIZES[(i + 1) % SIZES.length]!;
}

export interface WidgetDef {
  id: string;
  /** What the edit overlay calls it. */
  label: string;
  /** The size it ships at. Every widget can be set to any of the six. */
  size: WidgetSize;
}

export interface WidgetPlacement {
  id: string;
  size: WidgetSize;
  hidden: boolean;
}

/**
 * A stored value read back as a size, whatever shape it was written in.
 *
 * Three generations of this field are in people's storage now: a column count
 * from the two-column grid, the small/medium/large names, and the grid shapes.
 * All three load. Dropping any of them would reset the page of everyone who
 * had ever arranged one, which is a worse outcome than carrying two lines of
 * translation forever.
 */
const LEGACY: Record<string, WidgetSize> = {
  small: "2x2",
  medium: "2x4",
  large: "3x4",
};

export function asSize(value: unknown): WidgetSize | null {
  if (typeof value === "string") {
    if ((SIZES as string[]).includes(value)) return value as WidgetSize;
    return LEGACY[value] ?? null;
  }
  if (value === 1) return "2x2";
  if (value === 2) return "2x4";
  return null;
}

/**
 * Every widget the Home page can show, in the order a fresh install gets.
 *
 * The six tiles are separate widgets rather than one block: "put protein at the
 * top and move carbs off the page" is the entire reason someone opens an edit
 * mode, and a single grid could not answer it.
 */
export const DASHBOARD_WIDGETS: WidgetDef[] = [
  // A strip, not a panel: on a good day the brief is one sentence, and a
  // two-row default left a card mostly empty on the page everyone sees first.
  // Full-width heights are floors, so it still grows when it has three things
  // to say.
  { id: "brief", label: "Coach brief", size: "1x4" },
  { id: "score", label: "Today's score", size: "2x4" },
  { id: "cals", label: "Calories", size: "2x2" },
  { id: "protein", label: "Protein", size: "2x2" },
  { id: "carbs", label: "Carbs", size: "2x2" },
  { id: "fat", label: "Fat", size: "2x2" },
  { id: "water", label: "Water", size: "2x2" },
  { id: "session", label: "Session", size: "2x2" },
  { id: "todos", label: "To-do", size: "2x4" },
  { id: "gap", label: "Log the gap", size: "2x4" },
  { id: "correlate", label: "Across everything", size: "2x4" },
];

/**
 * Every arrangeable page, and what is on it.
 *
 * Every tab is here now, Setup included. The earlier judgement — that a form
 * is a sequence of steps rather than a collection of cards, so reordering it
 * is not a feature — was wrong about this app. Setup is not one form; it is
 * fourteen unrelated panels that happen to share a screen, and which of them
 * you touch weekly against never is personal. The same goes for Fuel and
 * Train: the diary and the session are ordered, but the cards AROUND them are
 * not, and "the one card I check every day is the one I scroll past four
 * others to reach" is the entire reason this mode exists.
 *
 * What stays out is anything inside a step: the set rows of a live session,
 * the fields of one card. Those have an order that means something.
 */
export const WIDGETS_BY_TAB: Record<string, WidgetDef[]> = {
  dashboard: DASHBOARD_WIDGETS,
  // Mind is four pages behind one tab, so each keeps its own arrangement.
  // "mind-book" rather than "mind" because a layout is a layout OF A PAGE, and
  // Reading and Language are not the same page with different cards on it.
  "mind-book": [
    { id: "goal", label: "Reading goal", size: "2x4" },
    { id: "shelf", label: "Reading shelf", size: "2x4" },
    { id: "week", label: "This week", size: "2x4" },
    { id: "log", label: "Log a book", size: "2x4" },
    { id: "recent", label: "Recent books", size: "2x4" },
  ],
  "mind-language": [
    { id: "languages", label: "Languages and words", size: "2x4" },
    { id: "review", label: "Words to review", size: "2x4" },
    { id: "words", label: "Your own words", size: "2x4" },
    { id: "week", label: "This week", size: "2x4" },
    { id: "log", label: "Log a drill", size: "2x4" },
    { id: "recent", label: "Recent drills", size: "2x4" },
  ],
  "mind-idea": [
    { id: "week", label: "This week", size: "2x4" },
    { id: "log", label: "Log an idea", size: "2x4" },
    { id: "recent", label: "Recent ideas", size: "2x4" },
  ],
  "mind-research": [
    { id: "week", label: "This week", size: "2x4" },
    { id: "log", label: "Log research", size: "2x4" },
    { id: "recent", label: "Recent research", size: "2x4" },
  ],
  projects: [
    { id: "header", label: "On the go", size: "2x4" },
    { id: "new", label: "Start something", size: "2x4" },
    { id: "list", label: "The projects", size: "2x4" },
  ],
  money: [
    { id: "summary", label: "This month", size: "2x4" },
    { id: "add", label: "Add an entry", size: "2x4" },
    { id: "grocery", label: "Shopping list", size: "2x4" },
    { id: "entries", label: "Entries", size: "2x4" },
    { id: "categories", label: "Categories", size: "2x4" },
  ],
  time: [
    { id: "header", label: "The day", size: "2x4" },
    { id: "ring", label: "The ring", size: "2x4" },
    { id: "screen", label: "Screen time", size: "2x4" },
    { id: "blocks", label: "The day, in order", size: "2x4" },
  ],
  habits: [
    { id: "header", label: "Consistency", size: "2x4" },
    { id: "tabs", label: "Today / Matrix / Year", size: "2x4" },
    { id: "list", label: "The habits", size: "2x4" },
    { id: "new", label: "New habit", size: "2x4" },
  ],
  // Fuel is four pages behind one tab. The old single page held thirteen cards
  // and you scrolled past the ones you were not using to reach the ones you
  // were — logging a meal and reviewing the week are different jobs done at
  // different times of day, and stacking them made both worse.
  "nutrition-dash": [
    { id: "target", label: "Today's totals", size: "2x4" },
    { id: "suggest", label: "Suggest from pantry", size: "2x4" },
    { id: "plan", label: "Plan ahead", size: "2x4" },
    { id: "actions", label: "Scan / Search / Burn", size: "2x4" },
    { id: "plate", label: "Plate photo", size: "2x4" },
    { id: "hunger", label: "Hunger", size: "2x4" },
    { id: "add", label: "Add food", size: "2x4" },
    { id: "meal", label: "Meal builder", size: "2x4" },
    { id: "preworkout", label: "Pre-workout", size: "2x4" },
  ],
  "nutrition-week": [
    { id: "weekly", label: "The last seven days", size: "2x4" },
    { id: "graphs", label: "Charts", size: "2x4" },
  ],
  "nutrition-log": [
    { id: "diary", label: "Meal by meal", size: "2x4" },
    { id: "water", label: "Water", size: "2x4" },
    { id: "minerals", label: "Micronutrients", size: "2x4" },
  ],
  "nutrition-weight": [
    { id: "weight", label: "Weight", size: "2x4" },
  ],
  workout: [
    { id: "header", label: "Session header", size: "2x4" },
    { id: "date", label: "The date", size: "2x4" },
    { id: "quick", label: "Undo / Save", size: "2x4" },
    { id: "session", label: "Rest timer", size: "2x4" },
    { id: "chips", label: "Add exercise", size: "2x4" },
  ],
  looks: [
    { id: "latest", label: "Latest front", size: "2x4" },
    { id: "scan", label: "Scan button", size: "2x4" },
    { id: "gallery", label: "Captures", size: "2x4" },
    { id: "guide", label: "What it measures", size: "2x4" },
    { id: "note", label: "What the mesh is", size: "2x4" },
  ],
  // Stats is eight pages behind one tab, like Mind. Only the two that are
  // genuinely card stacks get a layout; the rest delegate to whole other
  // views, which bring their own.
  "insights-overview": [
    { id: "brief", label: "Coach brief", size: "2x4" },
    { id: "meso", label: "Block review", size: "2x4" },
    { id: "consistency", label: "Training consistency", size: "2x4" },
    { id: "volume", label: "Weekly volume", size: "2x4" },
    { id: "axial", label: "Axial load", size: "2x4" },
    { id: "ratings", label: "Exercise ratings", size: "2x4" },
  ],
  "insights-strength": [
    { id: "estimates", label: "Strength estimates", size: "2x4" },
    { id: "prs", label: "Recent PRs", size: "2x4" },
  ],
  "insights-heatmap": [
    { id: "intro", label: "What the map shows", size: "2x4" },
    { id: "range", label: "Front / back", size: "2x4" },
    { id: "grid", label: "The map", size: "2x4" },
  ],
  body: [
    { id: "tabs", label: "Sleep / Measure / Supplements", size: "2x4" },
    { id: "panel", label: "The panel", size: "2x4" },
  ],
  estimates: [
    { id: "weight", label: "Bodyweight", size: "2x4" },
    { id: "composition", label: "Muscle vs fat", size: "2x4" },
    { id: "measures", label: "Measurements", size: "2x4" },
    { id: "strength", label: "Strength", size: "2x4" },
    { id: "note", label: "How these are made", size: "2x4" },
  ],
  settings: [
    { id: "phase", label: "Phase", size: "2x4" },
    { id: "goal", label: "Training goal", size: "2x4" },
    { id: "appearance", label: "Appearance", size: "2x4" },
    { id: "training", label: "Training", size: "2x4" },
    { id: "nutrition", label: "Nutrition", size: "2x4" },
    { id: "routines", label: "Routines", size: "2x4" },
    { id: "report", label: "Report", size: "2x4" },
    { id: "data", label: "Backup and restore", size: "2x4" },
    { id: "csv", label: "Export as CSV", size: "2x4" },
    { id: "foods", label: "Import foods", size: "2x4" },
    { id: "programme", label: "Training programme", size: "2x4" },
    { id: "targets", label: "Daily nutrition targets", size: "2x4" },
    { id: "habit-history", label: "Habit history", size: "2x4" },
    { id: "about", label: "About", size: "2x4" },
  ],
};

/** Every widget id the app knows about, whichever page it sits on. */
const BY_ID = new Map(
  Object.values(WIDGETS_BY_TAB).flatMap((list) => list.map((w) => [`${w.id}`, w] as const)),
);

/**
 * Whether a tab can be rearranged at all.
 *
 * A prefix counts, because a tab with sub-pages registers one layout per page
 * ("mind-book", "mind-language") and the header button only knows which TAB it
 * is on. Without this, Mind would lose its edit button the moment it gained
 * sub-tabs — which would be the feature removing itself.
 */
export function isArrangeable(tab: string): boolean {
  if (Object.prototype.hasOwnProperty.call(WIDGETS_BY_TAB, tab)) return true;
  return Object.keys(WIDGETS_BY_TAB).some((k) => k.startsWith(`${tab}-`));
}

export function widgetsFor(tab: string): WidgetDef[] {
  return WIDGETS_BY_TAB[tab] ?? [];
}

/**
 * A widget's definition WITHIN a tab.
 *
 * Looked up per tab rather than globally, because ids only have to be unique on
 * their own page — "header" means one thing on Time and another on Habits, and
 * a single flat map would silently give one of them the other's rules.
 */
export function widgetDef(tab: string, id: string): WidgetDef | undefined {
  return widgetsFor(tab).find((w) => w.id === id) ?? BY_ID.get(id);
}

export function defaultLayout(tab = "dashboard"): WidgetPlacement[] {
  return widgetsFor(tab).map((w) => ({ id: w.id, size: w.size, hidden: false }));
}

/**
 * Every widget takes every size.
 *
 * There used to be a `resizable: false` on anything that was mostly prose,
 * which is a real concern — a paragraph in a quarter of a phone is unreadable.
 * But it was the app deciding, for the user, which of THEIR cards were
 * important enough to keep full width, and the answer to "this one looks bad
 * small" is to size it back up, not to have the button refuse. The grid clips
 * an over-stuffed small widget behind a fade rather than letting it break the
 * row, so the worst case is a card that reads as a preview of itself.
 */
function cleanSize(tab: string, id: string, value: unknown): WidgetSize {
  return asSize(value) ?? widgetDef(tab, id)?.size ?? "2x4";
}

/**
 * A stored layout, made safe against a registry that has moved on.
 *
 * Unknown ids are dropped, missing ones are appended in registry order, and a
 * span that a widget no longer supports is pulled back to its declared one.
 */
export function reconcile(stored: WidgetPlacement[] | undefined, tab = "dashboard"): WidgetPlacement[] {
  const widgets = widgetsFor(tab);
  const known = new Set(widgets.map((w) => w.id));
  const seen = new Set<string>();
  const out: WidgetPlacement[] = [];

  for (const p of stored ?? []) {
    if (!p || typeof p.id !== "string") continue;
    if (!known.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    // `span` is read too: layouts saved before the three sizes existed hold a
    // column count, and dropping them would reset everyone's page.
    const stored_ = (p as { size?: unknown; span?: unknown });
    out.push({
      id: p.id,
      size: cleanSize(tab, p.id, stored_.size ?? stored_.span),
      hidden: p.hidden === true,
    });
  }

  // Anything the registry has gained since this layout was saved, in its own
  // order, so a new widget lands somewhere sensible rather than at the end.
  if (out.length !== widgets.length) {
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]!;
      if (seen.has(w.id)) continue;
      const at = Math.min(i, out.length);
      out.splice(at, 0, { id: w.id, size: w.size, hidden: false });
      seen.add(w.id);
    }
  }
  return out;
}

/** Move one widget to a new index, the rest closing up behind it. */
export function move(layout: WidgetPlacement[], id: string, to: number): WidgetPlacement[] {
  const from = layout.findIndex((p) => p.id === id);
  if (from < 0) return layout;
  const target = Math.max(0, Math.min(layout.length - 1, Math.floor(to)));
  if (target === from) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Set one widget to one of the three sizes. */
export function resize(
  layout: WidgetPlacement[], id: string, size: WidgetSize, tab = "dashboard",
): WidgetPlacement[] {
  return layout.map((p) => (p.id === id ? { ...p, size: cleanSize(tab, id, size) } : p));
}

/** One step along the ladder and round again, for a control that cycles. */
export function cycleSize(
  layout: WidgetPlacement[], id: string, tab = "dashboard",
): WidgetPlacement[] {
  const cur = layout.find((p) => p.id === id);
  if (!cur) return layout;
  return resize(layout, id, nextSize(cur.size), tab);
}

/** Hidden, not removed: it keeps its place for when it comes back. */
export function setHidden(layout: WidgetPlacement[], id: string, hidden: boolean): WidgetPlacement[] {
  return layout.map((p) => (p.id === id ? { ...p, hidden } : p));
}

export function toggleHidden(layout: WidgetPlacement[], id: string): WidgetPlacement[] {
  const cur = layout.find((p) => p.id === id);
  return cur ? setHidden(layout, id, !cur.hidden) : layout;
}

export function visible(layout: WidgetPlacement[]): WidgetPlacement[] {
  return layout.filter((p) => !p.hidden);
}

export function hidden(layout: WidgetPlacement[]): WidgetPlacement[] {
  return layout.filter((p) => p.hidden);
}

/** True when the layout is exactly what a fresh install would have. */
export function isDefault(layout: WidgetPlacement[], tab = "dashboard"): boolean {
  const base = defaultLayout(tab);
  if (layout.length !== base.length) return false;
  return layout.every((p, i) => {
    const b = base[i]!;
    return p.id === b.id && p.size === b.size && p.hidden === b.hidden;
  });
}
