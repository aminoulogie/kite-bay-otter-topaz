// ==========================================================================
// Seed habits and the habit widget's own settings shape.
// ==========================================================================

const DEFAULT_HABITS = [
  {
    id: "gym-movement",
    name: "Gym & Movement",
    desc: "Hit daily training split",
    icon: "🏋️",
    color: "#22c55e",
    goalDaysPerWeek: 5,
    history: {},
    photos: {}
  },
  {
    id: "clean-nutrition",
    name: "Clean Nutrition",
    desc: "Hit calorie & protein target",
    icon: "🥗",
    color: "var(--soma-danger)",
    goalDaysPerWeek: 7,
    history: {},
    photos: {}
  },
  {
    id: "hydration",
    name: "Hydration",
    desc: "Drink 2.5L+ water",
    icon: "💧",
    color: "var(--soma-info)",
    goalDaysPerWeek: 7,
    history: {},
    photos: {}
  },
  {
    id: "deep-focus",
    name: "Deep Focus",
    desc: "90+ min engineering / deep sprint",
    icon: "🧠",
    color: "#a855f7",
    goalDaysPerWeek: 5,
    history: {},
    photos: {}
  }
];

const DEFAULT_HABIT_SETTINGS = {
  defaultTimerDuration: 90,
  startOfWeek: "monday",

  habits: DEFAULT_HABITS
};

module.exports = { DEFAULT_HABITS, DEFAULT_HABIT_SETTINGS };
