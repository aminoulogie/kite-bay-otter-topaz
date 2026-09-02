// ==========================================================================
// Bundle entry point.
//
// Obsidian loads main.js and expects module.exports to BE the plugin class,
// so that assignment has to come first. The test suite needs reach into the
// pure internals, which are hung off the class as __internals - a property
// on the export rather than a second export, because CJS only has one.
// ==========================================================================

const { SomaSmartCoachPlugin } = require("./plugin.js");

const { getLocalDateKey, parseLocalDateKey, addDays } = require("./dates.js");
const { SOMA_SCHEMA_VERSION, isDateKey, sessionIsEmpty, normalizeSet, normalizeExercise,
        migrateHistory, nutritionEntryIsEmpty, migrateNutrition } = require("./migrations.js");
const { ACCENT_PRESETS, DEFAULT_ACCENT, accentInk, accentText, normalizeAccent,
        resolveTheme, applySomaTheme } = require("./theme.js");
const { ALL_DOCK_TABS, WIDGET_PROFILES } = require("./profiles.js");
const { BASE_EXERCISE_DB, ROUTINE_PRESETS, ROTATION_SEQUENCE } = require("./data.js");
const { SomaIntelligenceEngine } = require("./engine.js");
const { calculateHabitStats } = require("./habits/stats.js");

module.exports = SomaSmartCoachPlugin;

// Exposed for the test harness only; Obsidian never looks at this.
module.exports.__internals = {
  SomaIntelligenceEngine,
  getLocalDateKey, parseLocalDateKey, addDays,
  SOMA_SCHEMA_VERSION, isDateKey, sessionIsEmpty, normalizeSet, normalizeExercise,
  migrateHistory, nutritionEntryIsEmpty, migrateNutrition,
  ACCENT_PRESETS, DEFAULT_ACCENT, accentInk, accentText, normalizeAccent,
  resolveTheme, applySomaTheme,
  ALL_DOCK_TABS, WIDGET_PROFILES,
  BASE_EXERCISE_DB, ROUTINE_PRESETS, ROTATION_SEQUENCE,
  calculateHabitStats
};
