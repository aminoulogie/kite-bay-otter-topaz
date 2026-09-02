// ==========================================================================
// Streaks and completion rates for a single habit.
// ==========================================================================

const { getLocalDateKey, parseLocalDateKey, addDays } = require("../dates.js");

function calculateHabitStats(habit) {
  if (!habit.history) habit.history = {};
  const todayStr = getLocalDateKey(new Date());
  const today = parseLocalDateKey(todayStr);

  let currentStreak = 0;
  let check = new Date(today);

  if (!habit.history[getLocalDateKey(check)]) {
    check = addDays(check, -1);
  }

  while (habit.history[getLocalDateKey(check)] === true) {
    currentStreak++;
    check = addDays(check, -1);
  }

  const dates = Object.keys(habit.history)
    .filter((k) => habit.history[k] === true)
    .sort();

  let bestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  for (const dateStr of dates) {
    const d = parseLocalDateKey(dateStr);
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diff = Math.round((d - prevDate) / (1000 * 60 * 60 * 24));
      if (diff === 1) tempStreak++;
      else if (diff > 1) tempStreak = 1;
    }
    if (tempStreak > bestStreak) bestStreak = tempStreak;
    prevDate = d;
  }
  if (currentStreak > bestStreak) bestStreak = currentStreak;

  const totalCompletions = dates.length;
  let weekDone = 0;
  for (let i = 0; i < 7; i++) {
    const dStr = getLocalDateKey(addDays(today, -i));
    if (habit.history[dStr] === true) weekDone++;
  }
  const weekRate = Math.round((weekDone / 7) * 100);

  return { currentStreak, bestStreak, totalCompletions, weekRate };
}

module.exports = { calculateHabitStats };
