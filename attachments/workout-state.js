// ==========================================================================
// Live session state with undo/redo snapshots.
// ==========================================================================

class SomaWorkoutState {
  constructor() {
    this.sessionStartTime = Date.now();
    this.activeSplit = "Legs A (Quad / Squat Dominant)";
    this.sessionExercises = [];
    this.undoStack = [];
    this.redoStack = [];
  }

  recordSnapshot() {
    if (this.undoStack.length > 25) this.undoStack.shift();
    this.undoStack.push(JSON.stringify(this.sessionExercises));
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(JSON.stringify(this.sessionExercises));
    this.sessionExercises = JSON.parse(this.undoStack.pop());
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(JSON.stringify(this.sessionExercises));
    this.sessionExercises = JSON.parse(this.redoStack.pop());
    return true;
  }
}

// ============================================================
// SECTION 5: OBSIDIAN PLUGIN REGISTRATION & CONTROLLER
// ============================================================

/* ==========================================================================
   Habit Tracker Engine (merged from the standalone Habit Radar plugin)
   Registered as the ```habittracker``` code block, and also embedded as
   the "Habits" tab inside the main soma-coach dashboard.
   ========================================================================== */

module.exports = { SomaWorkoutState };
