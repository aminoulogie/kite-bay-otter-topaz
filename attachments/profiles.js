// ==========================================================================
// Which tabs each widget shows. One codebase, several focused widgets.
// ==========================================================================

const ALL_DOCK_TABS = [
  { pane: "pane-workout",      icon: "⚡",       label: "Workout"  },
  { pane: "pane-macros",       icon: "🍽️", label: "Macros"   },
  { pane: "pane-weight",       icon: "⚖️", label: "Weight"   },
  { pane: "pane-measurements", icon: "📐", label: "Measure"  },
  { pane: "pane-sleep",        icon: "😴", label: "Sleep"    },
  { pane: "pane-habits",       icon: "🎯", label: "Habits"   },
  { pane: "pane-heatmap",      icon: "🧬", label: "Heatmap"  },
  { pane: "pane-calendar",     icon: "📅", label: "Calendar" },
  { pane: "pane-insights",     icon: "📊", label: "Insights" },
  { pane: "pane-prs",          icon: "🏆", label: "PRs"      },
  { pane: "pane-creatine",     icon: "💊", label: "Creatine" },
  { pane: "pane-recovery",     icon: "🧠", label: "CNS"      },
  { pane: "pane-settings",     icon: "⚙️", label: "Settings" }
];

// The focused widgets. Each owns a subject; `full` is derived from these.
const FOCUSED_PROFILES = {
  // Training only. Deliberately excludes macros, sleep and habits.
  // PRs and CNS are merged into one Insights tab to keep the dock at five.
  workout: {
    id: "workout",
    tabs: ["pane-workout", "pane-heatmap", "pane-calendar", "pane-insights", "pane-settings"]
  },
  // Nutrition and the body metrics that belong with it.
  macros: {
    id: "macros",
    tabs: ["pane-macros", "pane-weight", "pane-measurements", "pane-creatine", "pane-settings"]
  },
  // Sleep stands alone so it can be logged in the morning, nowhere near a
  // training or food screen.
  sleep: {
    id: "sleep",
    tabs: ["pane-sleep", "pane-settings"]
  },
  // Habits mount standalone through the habittracker block.
  habits: {
    id: "habits",
    tabs: ["pane-habits", "pane-settings"]
  }
};

// Every pane claimed by a non-training widget. Settings is excluded: it is
// shared by all of them, and each widget needs its own way into it.
const OWNED_BY_OTHER_WIDGETS = new Set(
  ["macros", "sleep", "habits"]
    .flatMap(id => FOCUSED_PROFILES[id].tabs)
    .filter(pane => pane !== "pane-settings")
);

const WIDGET_PROFILES = {
  ...FOCUSED_PROFILES,

  // The all-in-one behind `soma-coach`. It shows only what no other widget
  // owns, so a daily note running soma-macros / soma-sleep / habittracker
  // alongside it never shows the same tab twice.
  //
  // Derived rather than hand-listed: a tab claimed by a focused widget drops
  // out on its own, so adding a widget later cannot reintroduce a duplicate.
  full: {
    id: "full",
    tabs: ALL_DOCK_TABS
      .map(t => t.pane)
      // Insights is PRs + CNS combined; this profile lists both separately.
      .filter(pane => pane !== "pane-insights" && !OWNED_BY_OTHER_WIDGETS.has(pane))
  }
};

module.exports = { ALL_DOCK_TABS, WIDGET_PROFILES };
