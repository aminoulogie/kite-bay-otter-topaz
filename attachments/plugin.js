// ==========================================================================
// The plugin class: widget mounting, all view rendering, and event wiring.
//
// This is still the largest module. Its methods close over a great deal of
// shared local state (mountApp alone builds every renderer as a closure over
// the same session, settings and DOM handles), so breaking it up further
// means rewriting that structure rather than relocating code. That is a
// separate job from this split, which only moves things.
// ==========================================================================

const { Plugin, Modal, Notice, requestUrl, PluginSettingTab, Setting, setIcon, MarkdownRenderChild } = require("obsidian");

const { HISTORY_FILE_PATH, CUSTOM_EX_FILE_PATH, SETTINGS_FILE_PATH, NUTRITION_FILE_PATH,
        CUSTOM_FOODS_FILE, DATA_FILE_PATH, REGISTRY_FILE_PATH, WEEKLY_FILE_PATH,
        HABITS_FILE_PATH } = require("./paths.js");
const { getLocalDateKey, parseLocalDateKey, addDays, formatDateLong, formatTimeShort } = require("./dates.js");
const { SOMA_SCHEMA_VERSION, isDateKey, sessionIsEmpty, normalizeSet, normalizeExercise,
        migrateHistory, nutritionEntryIsEmpty, migrateNutrition } = require("./migrations.js");
const { ACCENT_PRESETS, DEFAULT_ACCENT, accentInk, accentText, normalizeAccent,
        resolveTheme, applySomaTheme } = require("./theme.js");
const { ALL_DOCK_TABS, WIDGET_PROFILES } = require("./profiles.js");
const { DEFAULT_GOALS, BASE_FOOD_LIBRARY, BASE_EXERCISE_DB, ROUTINE_PRESETS,
        ROTATION_SEQUENCE } = require("./data.js");
const { SomaIntelligenceEngine } = require("./engine.js");
const { SomaAudioCelebration } = require("./audio.js");
const { SomaWorkoutState } = require("./workout-state.js");
const { DEFAULT_HABITS, DEFAULT_HABIT_SETTINGS } = require("./habits/defaults.js");
const { readAndCompressImage, pickPhoto } = require("./habits/photo.js");
const { calculateHabitStats } = require("./habits/stats.js");
const { HabitRadarUIController } = require("./habits/ui-controller.js");
const { HabitRadarRenderChild, HabitPhotoGalleryModal, HabitPhotoLightboxModal,
        HabitEditModal, SomaHabitStore } = require("./habits/modals.js");
const { SomaSettingTab } = require("./settings-tab.js");

class SomaSmartCoachPlugin extends Plugin {
  async onload() {
    this.activeIntervals = new Set();
    this.addSettingTab(new SomaSettingTab(this.app, this));

    // 1. Master Suite Processor
    this.registerMarkdownCodeBlockProcessor("soma-coach", async (source, el, ctx) => {
      await this.mountApp(el, ctx?.sourcePath || "");
    });

    // 1b. Focused widgets. Same engine, different tab sets, so a daily note
    //     can run macros, workout and habits as three independent blocks.
    this.registerMarkdownCodeBlockProcessor("soma-workout", async (source, el, ctx) => {
      await this.mountApp(el, ctx?.sourcePath || "", "workout");
    });

    this.registerMarkdownCodeBlockProcessor("soma-macros", async (source, el, ctx) => {
      await this.mountApp(el, ctx?.sourcePath || "", "macros");
    });

    this.registerMarkdownCodeBlockProcessor("soma-sleep", async (source, el, ctx) => {
      await this.mountApp(el, ctx?.sourcePath || "", "sleep");
    });

    // 2. Standalone Macro & Nutrition Diary
    // Alias of soma-macros. Existing macro-tracker blocks keep working and
    // gain the dock; mountTracker still backs the Macros tab itself.
    this.registerMarkdownCodeBlockProcessor("macro-tracker", async (source, el, ctx) => {
      await this.mountApp(el, ctx?.sourcePath || "", "macros");
    });

    // 3. Weekly Macro & Nutrition Dashboard
    this.registerMarkdownCodeBlockProcessor("macro-weekly", async (source, el, ctx) => {
      await this.mountWeeklyDashboard(el, ctx?.sourcePath || "");
    });

    // 4. Standalone Weekly Planner Processor (Editable Calendar Cascade)
    this.registerMarkdownCodeBlockProcessor("weekly-gym", async (source, el, ctx) => {
      await this.mountWeeklyPlanner(el);
    });
    this.registerMarkdownCodeBlockProcessor("weekly-gym-tracker", async (source, el, ctx) => {
      await this.mountWeeklyPlanner(el);
    });

    // 5. Standalone Creatine Tracker Processor
    this.registerMarkdownCodeBlockProcessor("creatine-tracker", async (source, el, ctx) => {
      await this.mountCreatineStandalone(el, ctx?.sourcePath || "");
    });

    // 6. Weekly Macro & Recomp Audit
    this.registerMarkdownCodeBlockProcessor("weekly-audit", async (source, el, ctx) => {
      await this.mountAuditWidget(el, 7, "Weekly Audit & Recomp Snapshot");
    });

    // 7. Monthly Macro & Muscle Retention Audit
    this.registerMarkdownCodeBlockProcessor("monthly-audit", async (source, el, ctx) => {
      await this.mountAuditWidget(el, 30, "Monthly Trend & Muscle Retention Audit");
    });

    // 8. Progress Charts: 1RM trendlines & weekly volume
    this.registerMarkdownCodeBlockProcessor("soma-progress", async (source, el, ctx) => {
      await this.mountProgressWidget(el, source);
    });

    // 9. Habit Tracker (merged in from the standalone Habit Radar plugin).
    // Kept as its own callout name per request, alongside being embedded
    // as the "Habits" tab inside the main soma-coach dashboard.
    // Mounts through the profile system so the habit tracker gets its own
    // dock (Habits + Settings). The habit UI itself is unchanged - the Habits
    // tab still renders it via mountHabitTracker.
    this.registerMarkdownCodeBlockProcessor("habittracker", async (source, el, ctx) => {
      await this.mountApp(el, ctx?.sourcePath || "", "habits");
    });

    // Commands
    this.addCommand({
      id: "soma-log-water-250",
      name: "SOMA: Log 250ml water (today)",
      callback: async () => {
        const key = getLocalDateKey(new Date());
        const n = await this.readVaultJson(NUTRITION_FILE_PATH, {});
        this.ensureNutritionSettings(n);
        if (!n[key]) n[key] = { goals: { ...DEFAULT_GOALS }, water: 0, bodyWeight: 78.5, items: [], mealCollapse: {} };
        n[key].water = (n[key].water || 0) + 250;
        await this.writeVaultJson(NUTRITION_FILE_PATH, n);
        new Notice(`Logged 250ml water. Total today: ${n[key].water}ml`);
      }
    });

    this.addCommand({
      id: "soma-log-water-500",
      name: "SOMA: Log 500ml water (today)",
      callback: async () => {
        const key = getLocalDateKey(new Date());
        const n = await this.readVaultJson(NUTRITION_FILE_PATH, {});
        this.ensureNutritionSettings(n);
        if (!n[key]) n[key] = { goals: { ...DEFAULT_GOALS }, water: 0, bodyWeight: 78.5, items: [], mealCollapse: {} };
        n[key].water = (n[key].water || 0) + 500;
        await this.writeVaultJson(NUTRITION_FILE_PATH, n);
        new Notice(`Logged 500ml water. Total today: ${n[key].water}ml`);
      }
    });

    this.addCommand({
      id: "soma-export-workout-csv",
      name: "SOMA: Export workout history to CSV",
      callback: () => this.exportWorkoutHistoryCsv()
    });

    this.addCommand({
      id: "soma-export-macros-csv",
      name: "SOMA: Export macro diary to CSV",
      callback: () => this.exportMacrosCsv()
    });

    this.addCommand({
      id: "soma-backup-json",
      name: "SOMA: Backup all data to JSON",
      callback: () => this.backupAllData()
    });
  }

  onunload() {
    if (this.activeIntervals) {
      for (const id of this.activeIntervals) clearInterval(id);
      this.activeIntervals.clear();
    }
  }

  // Wrap setInterval so every timer this plugin creates is force-cleared on unload,
  // even if a widget's own cleanup path is skipped (e.g. the note is closed mid-rest-timer).
  trackInterval(fn, ms) {
    const id = setInterval(fn, ms);
    this.activeIntervals.add(id);
    return id;
  }

  untrackInterval(id) {
    clearInterval(id);
    if (this.activeIntervals) this.activeIntervals.delete(id);
  }

  // Reads soma-history.json through the schema migration. Any drift found in
  // the stored file (empty template sessions, string/number mismatches,
  // fields missing from older versions) is normalized once and written back,
  // so every consumer downstream can trust the shape.
  // The version marker lives on disk but never in the map handed to callers —
  // every consumer walks Object.values(history) expecting sessions only, so a
  // stray _schemaVersion entry would be counted as a phantom workout.
  async readHistory() {
    const raw = await this.readVaultJson(HISTORY_FILE_PATH, {});
    const { history, changed, report } = migrateHistory(raw);
    if (changed) {
      if (report.dropped.length) {
        console.log(`[SOMA] Migration dropped ${report.dropped.length} empty session(s):`, report.dropped);
      }
      await this.writeVaultJson(HISTORY_FILE_PATH, history);
    }
    const { _schemaVersion, ...sessions } = history;
    return sessions;
  }

  // Single write path for history — re-stamps the schema version so a plain
  // save never silently downgrades the file.
  async writeHistory(sessions) {
    const { _schemaVersion, ...clean } = sessions || {};
    await this.writeVaultJson(HISTORY_FILE_PATH, { ...clean, _schemaVersion: SOMA_SCHEMA_VERSION });
  }

  // Nutrition reads go through the same self-healing cleanup as history.
  async readNutrition(fallback = {}) {
    const raw = await this.readVaultJson(NUTRITION_FILE_PATH, fallback);
    const { nutrition, changed, report } = migrateNutrition(raw);
    if (changed) {
      if (report.dropped.length) console.log(`[SOMA] Nutrition migration dropped ${report.dropped.length} empty entry(s):`, report.dropped);
      await this.writeVaultJson(NUTRITION_FILE_PATH, nutrition);
    }
    if (report.orphanedWithData.length) {
      console.warn("[SOMA] Nutrition entries keyed by note title that still hold data (left untouched):", report.orphanedWithData);
    }
    return nutrition;
  }

  async readVaultJson(path, fallback = {}) {
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file) {
        const text = await this.app.vault.read(file);
        if (text && text.trim() !== "") return JSON.parse(text);
      }
    } catch (e) {
      console.warn(`[SOMA] Read notice for ${path}:`, e);
    }
    return fallback;
  }

  async writeVaultJson(path, data) {
    try {
      const str = JSON.stringify(data, null, 2);
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!file) {
        const dir = path.substring(0, path.lastIndexOf("/"));
        if (dir && !(await this.app.vault.adapter.exists(dir))) {
          await this.app.vault.adapter.mkdir(dir);
        }
        await this.app.vault.create(path, str);
      } else {
        await this.app.vault.modify(file, str);
      }
    } catch (e) {
      console.error(`[SOMA] Write error for ${path}:`, e);
    }
  }

  async syncFrontmatter(sourcePath, dayData) {
    if (!sourcePath) return;
    const currentFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (currentFile && this.app.fileManager?.processFrontMatter) {
      let totCals = 0, totP = 0, totC = 0, totF = 0;
      (dayData.items || []).forEach(i => {
        totCals += i.cals || 0; totP += i.p || 0; totC += i.c || 0; totF += i.f || 0;
      });
      try {
        await this.app.fileManager.processFrontMatter(currentFile, fm => {
          fm["calories_consumed"] = Math.round(totCals);
          fm["protein_grams"] = Math.round(totP);
          fm["carbs_grams"] = Math.round(totC);
          fm["fat_grams"] = Math.round(totF);
          fm["water_ml"] = Math.round(dayData.water || 0);
          if (dayData.bodyWeight) fm["body_weight_kg"] = parseFloat(dayData.bodyWeight);
        });
      } catch (e) {}
    }
  }

  getRecommendation(history, scheduleOverrides, noteDateKey) {
    const dateObj = parseLocalDateKey(noteDateKey);
    const todayProj = SomaIntelligenceEngine.getProgramProjectedDay(dateObj, scheduleOverrides);
    return {
      split: todayProj.split,
      rationale: todayProj.phase,
      lastSplit: Object.keys(history).sort().pop() ? history[Object.keys(history).sort().pop()].split : "None"
    };
  }

  getLastPerformance(history, exerciseName) {
    let latestDate = 0;
    let topSet = null;
    for (const session of Object.values(history || {})) {
      if (session && session.exercises && (session.timestamp || 0) > latestDate) {
        const match = session.exercises.find(e => e.name && e.name.toLowerCase() === exerciseName.toLowerCase());
        if (match && match.sets && Array.isArray(match.sets)) {
          const completed = match.sets.filter(s => s.type !== "warmup" && (s.done || (parseFloat(s.weight) >= 0 && s.reps)));
          if (completed.length > 0) {
            latestDate = session.timestamp || 0;
            topSet = completed.reduce((max, s) => (parseFloat(s.weight) || 0) > (parseFloat(max.weight) || 0) ? s : max, completed[0]);
          }
        }
      }
    }
    return topSet;
  }

  // ==========================================================================
  // CODEBLOCK 1: SOMA MASTER SUITE (`soma-coach`)
  // ==========================================================================
  async mountApp(containerEl, sourcePath, profileId = "full") {
    containerEl.empty();
    const profile = WIDGET_PROFILES[profileId] || WIDGET_PROFILES.full;
    const root = containerEl.createDiv({ cls: "soma-daily-root" });
    const appEl = root.createDiv({ cls: "soma-app soma-profile-" + profile.id });

    const fileName = sourcePath ? sourcePath.split("/").pop().replace(/\.md$/, "") : "";
    const dateMatch = fileName.match(/\d{4}-\d{2}-\d{2}/);
    const noteDateKey = dateMatch ? dateMatch[0] : getLocalDateKey(new Date());

    let history = await this.readHistory();
    let customExercises = await this.readVaultJson(CUSTOM_EX_FILE_PATH, []);
    let nutritionDB = await this.readNutrition({ _settings: { creatineStashGrams: 300 } });
    this.ensureNutritionSettings(nutritionDB);
    let somaData = await this.readVaultJson(DATA_FILE_PATH, { STATIC_PARTS: { front: {}, back: {} }, FRONT_OUTLINE: "", BACK_OUTLINE: "" });
    let muscleRegistry = await this.readVaultJson(REGISTRY_FILE_PATH, {});
    let settings = await this.readVaultJson(SETTINGS_FILE_PATH, {
      unit: "kg",
      barWeight: 20,
      restDefault: 90,
      autoRest: true,
      sound: true,
      confetti: true,
      subStartDate: "2026-08-01",
      subDurationDays: 30,
      subEndDate: "2026-08-31",
      scheduleOverrides: {},
      theme: "dark",
      accent: DEFAULT_ACCENT
    });

    // A settings file written before theming existed has neither key.
    if (!settings.theme) settings.theme = "dark";
    if (!settings.accent) settings.accent = DEFAULT_ACCENT;
    applySomaTheme(root, settings);

    // Built-in presets merged with anything the user has edited or created.
    // Recomputed on demand so an edit is live without a reload.
    const routines = () => SomaIntelligenceEngine.mergeRoutines(
      ROUTINE_PRESETS, settings.customRoutines || {}
    );

    let exerciseDB = [...BASE_EXERCISE_DB, ...customExercises];
    const state = new SomaWorkoutState();
    
    const currentProj = SomaIntelligenceEngine.getProgramProjectedDay(parseLocalDateKey(noteDateKey), settings.scheduleOverrides || {});
    state.activeSplit = currentProj.split;

    let restTimerInterval = null;
    // Session-scoped: skipping the check-in hides it until the note reopens.
    let readinessDismissed = false;
    let restSecondsLeft = settings.restDefault;
    let restSecondsTotal = settings.restDefault;
    let workoutDurationInterval = null;
    let calViewDate = parseLocalDateKey(noteDateKey);
    let currentPrFilter = "ALL";
    let heatmapCurrentView = "front";
    let heatmapSelectedKey = null;
    let heatmapSelectedPoint = null;

    // ------------------------------------------------------------------
    // BAR WEIGHT HELPER — lets the user pick which bar they're using
    // (Olympic / Women's / EZ / Trap-Hex / Custom) and then only type the
    // ADDED plate weight (e.g. "20" for 2×10kg discs). The real total
    // weight (bar + added) is what gets used everywhere: volume, 1RM,
    // PR detection, calories, etc.
    // ------------------------------------------------------------------
    const BAR_PRESETS = {
      kg: [
        { id: "olympic", label: "Olympic Bar (20kg)", weight: 20 },
        { id: "womens", label: "Women's Bar (15kg)", weight: 15 },
        { id: "ez", label: "EZ-Curl Bar (10kg)", weight: 10 },
        { id: "trap", label: "Trap/Hex Bar (25kg)", weight: 25 },
        { id: "custom", label: "Custom Bar...", weight: null }
      ],
      lbs: [
        { id: "olympic", label: "Olympic Bar (45lb)", weight: 45 },
        { id: "womens", label: "Women's Bar (35lb)", weight: 35 },
        { id: "ez", label: "EZ-Curl Bar (25lb)", weight: 25 },
        { id: "trap", label: "Trap/Hex Bar (55lb)", weight: 55 },
        { id: "custom", label: "Custom Bar...", weight: null }
      ]
    };

    // ------------------------------------------------------------------
    // SUPERSET GROUPS — tapping the 🔗 button on a card cycles it through
    // None → A → B → C → D → None. Cards sharing a letter get a matching
    // colored left border + badge so they read as one linked block, back
    // to back with no rest in between.
    // ------------------------------------------------------------------
    const SUPERSET_GROUPS = [
      { id: "", label: "" },
      { id: "A", label: "A", color: "var(--soma-accent)" },
      { id: "B", label: "B", color: "var(--soma-info)" },
      { id: "C", label: "C", color: "#a855f7" },
      { id: "D", label: "D", color: "var(--soma-warn)" }
    ];
    const nextSupersetGroup = (current) => {
      const idx = SUPERSET_GROUPS.findIndex(g => g.id === (current || ""));
      return SUPERSET_GROUPS[(idx + 1) % SUPERSET_GROUPS.length].id;
    };
    const supersetGroupInfo = (id) => SUPERSET_GROUPS.find(g => g.id === id) || SUPERSET_GROUPS[0];

    // Heuristic: only exercises actually loaded onto a barbell/EZ-bar get
    // the bar-weight dropdown. Machines, cables, dumbbells and bodyweight
    // moves don't need it.
    const exerciseUsesBar = (name = "") => {
      const n = name.toLowerCase();
      if (n.includes("dumbbell") || n.includes("cable") || n.includes("machine") || n.includes("pec deck")) return false;
      return /barbell|ez[- ]?(curl )?bar|ez bar|trap bar|hex bar|deadlift|smith/.test(n);
    };

    // Returns the real total weight lifted for a given set, accounting for
    // the selected bar. For non-bar exercises this is just the raw entered
    // weight (unchanged behavior).
    const getTotalWeight = (ex, s) => {
      const raw = parseFloat(s.weight) || 0;
      if (ex && ex.usesBar) {
        const barW = (typeof ex.barWeight === "number" && ex.barWeight > 0) ? ex.barWeight : settings.barWeight;
        return raw > 0 ? barW + raw : 0;
      }
      return raw;
    };

    // Refuses to persist an abandoned shell. Finishing a session with no
    // logged sets used to write an empty record keyed by the note — that is
    // exactly how the legacy "daily template" rows got into the history file
    // and skewed every rolling aggregate downstream.
    const saveWorkoutHistory = async (data) => {
      if (sessionIsEmpty(data)) {
        new Notice("Nothing logged — session not saved.");
        return false;
      }
      history[noteDateKey] = data;
      await this.writeHistory(history);
      return true;
    };

    const saveCustomExercise = async (ex) => {
      customExercises.push(ex);
      exerciseDB.push(ex);
      await this.writeVaultJson(CUSTOM_EX_FILE_PATH, customExercises);
    };

    const saveNutritionDB = async () => {
      await this.writeVaultJson(NUTRITION_FILE_PATH, nutritionDB);
    };

    const saveSettings = async (newSet) => {
      settings = { ...settings, ...newSet };
      await this.writeVaultJson(SETTINGS_FILE_PATH, settings);
    };

    const startRestTimer = (seconds) => {
      this.untrackInterval(restTimerInterval);
      restSecondsLeft = seconds;
      restSecondsTotal = seconds;
      updateRestTimerUI();

      restTimerInterval = this.trackInterval(() => {
        restSecondsLeft--;
        if (restSecondsLeft <= 0) {
          this.untrackInterval(restTimerInterval);
          if (settings.sound) SomaAudioCelebration.playSound("chime");
        }
        updateRestTimerUI();
      }, 1000);
    };

    const updateRestTimerUI = () => {
      const ring = appEl.querySelector("#soma-timer-ring");
      const val = appEl.querySelector("#soma-timer-val");
      if (!ring || !val) return;
      val.textContent = `${Math.max(0, restSecondsLeft)}s`;
      const circumference = 2 * Math.PI * 22;
      const progress = Math.max(0, restSecondsLeft / restSecondsTotal);
      ring.style.strokeDashoffset = circumference - (progress * circumference);
    };

    const loadSplitIntoSession = (splitName) => {
      state.recordSnapshot();
      state.activeSplit = splitName;
      const list = routines()[splitName] || [];
      state.sessionExercises = list.map(item => {
        const data = exerciseDB.find(e => e.name === item.name) || {};
        const isBW = !!data.isBW;
        const last = this.getLastPerformance(history, item.name);
        const target = buildAutoTarget({ ...data, name: item.name, isBW }, last);

        return {
          name: item.name,
          muscle: data.muscle || "Custom",
          subTarget: data.subTarget || "",
          targetKeys: data.targetKeys || [],
          position: data.position || "",
          risk: data.risk || "Low 🟢",
          tier: data.tier || "A-Tier",
          isAxial: !!data.isAxial,
          isBW: isBW,
          usesBar: exerciseUsesBar(item.name),
          barWeight: settings.barWeight,
          overloadTarget: target,
          supersetGroup: "",
          sets: [
            { weight: target.weight > 0 ? target.weight : (isBW ? 0 : ""), reps: target.reps, failure: 2, done: false, type: "normal" },
            { weight: target.weight > 0 ? target.weight : (isBW ? 0 : ""), reps: target.reps, failure: 2, done: false, type: "normal" },
            { weight: target.weight > 0 ? target.weight : (isBW ? 0 : ""), reps: Math.max(6, target.reps - 1), failure: 3, done: false, type: "normal" }
          ]
        };
      });
      renderTracker();
    };

    // Only the panes this profile actually uses get built, and the dock is
    // generated from the same list — so a workout widget has no macro tab to
    // click, not merely a hidden one.
    const activeTabs = ALL_DOCK_TABS.filter(t => profile.tabs.includes(t.pane));
    const firstPane = activeTabs.length ? activeTabs[0].pane : "pane-settings";

    const panesHtml = activeTabs
      .map(t => `<div class="soma-view-pane${t.pane === firstPane ? " active" : ""}" id="${t.pane}"></div>`)
      .join("\n      ");

    const dockHtml = activeTabs
      .map(t => `<button class="soma-dock-tab${t.pane === firstPane ? " active" : ""}" data-target="${t.pane}"><span class="dock-icon">${t.icon}</span><span>${t.label}</span></button>`)
      .join("\n          ");

    appEl.innerHTML = `
      ${panesHtml}

      <!-- FLOATING iOS LIQUID GLASS DOCK -->
      <div class="soma-glass-dock-wrap">
        <nav class="soma-glass-dock">
          ${dockHtml}
        </nav>
      </div>

      <!-- MODALS -->
      <div class="soma-modal-overlay" id="custom-ex-modal">
        <div class="soma-modal-box">
          <div class="soma-modal-title">✨ Create Custom Movement</div>
          <div class="soma-field-lbl">Exercise Name</div>
          <input type="text" class="soma-modal-input" id="cust-name" placeholder="e.g. Incline Cable Press" />
          <div class="soma-field-lbl">Target Muscle</div>
          <select class="soma-modal-input" id="cust-muscle">
            <option value="chest">Chest</option>
            <option value="upper_back">Back / Lats</option>
            <option value="deltoids">Shoulders / Delts</option>
            <option value="biceps">Biceps</option>
            <option value="triceps">Triceps</option>
            <option value="quadriceps">Quads</option>
            <option value="hamstring">Hamstrings</option>
            <option value="gluteal">Glutes</option>
            <option value="calves">Calves</option>
          </select>
          <div class="soma-field-lbl">Sub-Target Head</div>
          <input type="text" class="soma-modal-input" id="cust-sub" placeholder="e.g. Clavicular Pec / Long Head" />
          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
            <button class="soma-btn" data-action="close-custom-modal">Cancel</button>
            <button class="soma-btn soma-btn-accent" data-action="submit-custom-movement">Add & Save</button>
          </div>
        </div>
      </div>

      <div class="soma-plate-modal" id="plate-popover">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-weight:800; font-size:0.88rem; color:var(--soma-text);">🏋️ Barbell Loading Stack</span>
          <button class="soma-btn-del" data-action="close-plate-modal">✕</button>
        </div>
        <div id="plate-popover-text" style="font-size:0.78rem; color:var(--soma-text-dim); margin-top:4px;"></div>
        <div class="soma-plate-bar-visual" id="plate-bar-render"></div>
        <div id="plate-breakdown-list" style="font-size:0.78rem; color:var(--soma-text); text-align:center;"></div>
        <div id="plate-warmup-list" style="font-size:0.74rem; margin-top:8px;"></div>
      </div>
    `;

    const paneWorkout = appEl.querySelector("#pane-workout");
    const paneMacros = appEl.querySelector("#pane-macros");
    const paneHabits = appEl.querySelector("#pane-habits");
    const paneHeatmap = appEl.querySelector("#pane-heatmap");
    const paneCalendar = appEl.querySelector("#pane-calendar");
    const panePrs = appEl.querySelector("#pane-prs");
    const paneWeight = appEl.querySelector("#pane-weight");
    const paneInsights = appEl.querySelector("#pane-insights");
    const paneMeasurements = appEl.querySelector("#pane-measurements");
    const paneSleep = appEl.querySelector("#pane-sleep");
    const paneCreatine = appEl.querySelector("#pane-creatine");
    const paneRecovery = appEl.querySelector("#pane-recovery");
    const paneSettings = appEl.querySelector("#pane-settings");

    let embeddedHabitController = null;
    const renderMacrosView = async () => {
      if (!paneMacros) return;
      // Reuses the exact same renderer as the standalone `macro-tracker`
      // callout, just mounted into this dock's pane instead of its own
      // code block, so both stay in sync with one nutrition data file.
      await this.mountTracker(paneMacros, sourcePath);
    };
    const renderHabitsView = async () => {
      if (!paneHabits) return;
      // Destroy the previous controller first so its focus-timer interval
      // (if one was left running) doesn't keep ticking in the background
      // after you've navigated away from this tab.
      if (embeddedHabitController) {
        embeddedHabitController.destroy();
        embeddedHabitController = null;
      }
      embeddedHabitController = await this.mountHabitTracker(paneHabits, "", null);
    };

    const switchDockTab = (targetId) => {
      appEl.querySelectorAll(".soma-dock-tab").forEach(t => t.classList.toggle("active", t.dataset.target === targetId));
      appEl.querySelectorAll(".soma-view-pane").forEach(p => p.classList.toggle("active", p.id === targetId));

      if (targetId === "pane-macros") renderMacrosView();
      if (targetId === "pane-habits") renderHabitsView();
      if (targetId === "pane-heatmap") renderHeatmapView();
      if (targetId === "pane-calendar") renderCalendarView();
      if (targetId === "pane-prs") renderPrsView();
      if (targetId === "pane-weight") renderWeightView();
      if (targetId === "pane-measurements") renderMeasurementsView();
      if (targetId === "pane-sleep") renderSleepView();
      if (targetId === "pane-insights") renderInsightsView();
      if (targetId === "pane-creatine") renderCreatineView();
      if (targetId === "pane-recovery") renderRecoveryView();
      if (targetId === "pane-settings") renderSettingsView();

      // Fix: switching tabs used to leave whatever scroll position you had
      // in the previous tab, so the new pane could open already scrolled
      // halfway down (e.g. the heatmap SVG cropped mid-body). Snap the
      // whole widget back into view at the top on every tab switch.
      requestAnimationFrame(() => {
        root.scrollIntoView({ block: "start", behavior: "auto" });
      });
    };

    appEl.querySelectorAll(".soma-dock-tab").forEach(tab => {
      tab.onclick = () => switchDockTab(tab.dataset.target);
    });

    const initWorkoutView = () => {
      if (!paneWorkout) return;
      const splitOptionsHtml = Object.keys(routines()).map(r => `<option value="${r}">${r}</option>`).join("");
      const currentProj = SomaIntelligenceEngine.getProgramProjectedDay(parseLocalDateKey(noteDateKey), settings.scheduleOverrides || {});

      paneWorkout.innerHTML = `
        <div class="soma-card soma-hero-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div class="soma-tag-badge">🎯 Scheduled For (${noteDateKey})</div>
              <div class="soma-hero-title">${state.activeSplit}</div>
              <div class="soma-hero-sub">${currentProj.phase} • <i>${currentProj.repScheme}</i></div>
            </div>
            <span class="soma-tag soma-tag-emerald">${currentProj.phaseBadge}</span>
          </div>
        </div>

        <div class="soma-topbar">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="soma-badge-pill">SOMA PRO</span>
            <span style="font-weight:800; font-size:0.92rem; color:var(--soma-text);">Live Logger</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="soma-btn-icon" data-action="undo-action" title="Undo">↩</button>
            <button class="soma-btn-icon" data-action="redo-action" title="Redo">↪</button>
            <div class="soma-live-duration" id="live-session-time">⏱️ 00:00</div>
          </div>
        </div>

        <div class="soma-stats-grid">
          <div class="soma-stat-box"><div class="soma-stat-lbl">Est. Burn</div><div class="soma-stat-val" id="stat-cals" style="color:var(--soma-warn);">0 kcal</div></div>
          <div class="soma-stat-box"><div class="soma-stat-lbl">Volume (${settings.unit})</div><div class="soma-stat-val" id="stat-vol" style="color:var(--soma-text);">0</div></div>
          <div class="soma-stat-box"><div class="soma-stat-lbl">Sets Done</div><div class="soma-stat-val" id="stat-sets" style="color:var(--soma-accent-text);">0</div></div>
          <div class="soma-stat-box"><div class="soma-stat-lbl">Movements</div><div class="soma-stat-val" id="stat-ex">0</div></div>
        </div>

        <div class="soma-timer-dock">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="soma-timer-ring-box">
              <svg class="soma-timer-ring-svg" width="54" height="54">
                <circle class="soma-timer-ring-bg" cx="27" cy="27" r="22" />
                <circle class="soma-timer-ring-bar" id="soma-timer-ring" cx="27" cy="27" r="22" stroke-dasharray="138.23" stroke-dashoffset="0" />
              </svg>
              <div class="soma-timer-ring-txt" id="soma-timer-val">${settings.restDefault}s</div>
            </div>
            <div>
              <div style="font-weight:800; font-size:0.85rem; color:var(--soma-text);">Rest Countdown</div>
              <div style="font-size:0.7rem; color:var(--soma-text-dim);">Auto-triggers on set check</div>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="soma-timer-btn" data-action="quick-rest" data-seconds="60">+60s</button>
            <button class="soma-timer-btn" data-action="quick-rest" data-seconds="90">+90s</button>
            <button class="soma-timer-btn" data-action="reset-rest" style="background:var(--soma-danger); border-color:var(--soma-danger);">Reset</button>
          </div>
        </div>

        <div class="soma-action-row">
          <button class="soma-btn" data-action="open-split-drawer">⚡ Load Split</button>
          <button class="soma-btn" data-action="open-add-drawer">🔍 Add Movement</button>
          <button class="soma-btn" data-action="open-custom-modal">➕ Custom</button>
          <button class="soma-btn soma-btn-save" data-action="save-workout">💾 Save Log</button>
        </div>

        <div class="soma-card" id="routine-selector" style="display:none; margin-bottom:14px; border-color:rgba(255,255,255,0.2);">
          <div style="font-weight:800; font-size:0.92rem; margin-bottom:10px; color:var(--soma-text);">Select S-Tier Routine Split</div>
          <select class="soma-input" id="split-select" style="text-align:left; height:40px; margin-bottom:10px;">${splitOptionsHtml}</select>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="soma-btn" data-action="cancel-split-drawer">Cancel</button>
            <button class="soma-btn soma-btn-accent" data-action="load-selected-split">Load Split</button>
          </div>
        </div>

        <div class="soma-card" id="add-selector" style="display:none; margin-bottom:14px; border-color:rgba(255,255,255,0.2);">
          <div style="font-weight:800; font-size:0.92rem; margin-bottom:8px; color:var(--soma-text);">Search & Add Movement</div>
          <input type="text" class="soma-input" id="search-box" style="text-align:left; padding:8px 12px; margin-bottom:8px;" placeholder="Search by name, muscle, target..." />
          <div id="search-list" style="max-height:190px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:12px; background:var(--soma-surface); margin-bottom:10px;"></div>
          <div style="display:flex; justify-content:flex-end;">
            <button class="soma-btn" data-action="close-add-drawer">Close</button>
          </div>
        </div>

        <div id="readiness-host"></div>
        <div id="cards-container"></div>
      `;

      const searchBox = paneWorkout.querySelector("#search-box");
      const searchList = paneWorkout.querySelector("#search-list");

      const renderSearchList = (query) => {
        const q = (query || "").toLowerCase();
        const filtered = exerciseDB.filter(ex => ex.name.toLowerCase().includes(q) || ex.subTarget.toLowerCase().includes(q) || ex.muscle.toLowerCase().includes(q));
        if (filtered.length === 0) {
          searchList.innerHTML = '<div style="padding:10px; color:var(--soma-text-dim); font-size:0.8rem; text-align:center;">No matching movements found.</div>';
          return;
        }
        searchList.innerHTML = filtered.map(ex => `
          <div class="soma-search-item" data-action="select-search-ex" data-name="${ex.name}">
            <div style="font-weight:700; color:var(--soma-text); font-size:0.85rem;">${ex.name}</div>
            <div style="font-size:0.72rem; color:var(--soma-text-dim); display:flex; gap:6px; margin-top:2px;">
              <span>${ex.subTarget}</span> • <span>${ex.tier}</span>
            </div>
          </div>
        `).join("");
      };

      if (searchBox) searchBox.oninput = () => renderSearchList(searchBox.value);

      const updateLiveDuration = () => {
        const elapsed = Math.max(0, Math.floor((Date.now() - state.sessionStartTime) / 1000));
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const durEl = paneWorkout.querySelector("#live-session-time");
        if (durEl) durEl.textContent = `⏱️ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      if (workoutDurationInterval) this.untrackInterval(workoutDurationInterval);
      workoutDurationInterval = this.trackInterval(updateLiveDuration, 1000);
      updateLiveDuration();
    };

    const addExerciseToSession = (name) => {
      state.recordSnapshot();
      const data = exerciseDB.find(e => e.name === name) || { name, muscle: "Custom", targetKeys: [] };
      const isBW = !!data.isBW;
      const last = this.getLastPerformance(history, data.name);
      const target = buildAutoTarget({ ...data, isBW }, last);

      state.sessionExercises.push({
        name: data.name,
        muscle: data.muscle,
        subTarget: data.subTarget || "",
        targetKeys: data.targetKeys || [],
        position: data.position || "",
        risk: data.risk || "Low 🟢",
        tier: data.tier || "A-Tier",
        isAxial: !!data.isAxial,
        isBW: isBW,
        usesBar: exerciseUsesBar(data.name),
        barWeight: settings.barWeight,
        overloadTarget: target,
        supersetGroup: "",
        sets: [
          { weight: target.weight > 0 ? target.weight : (isBW ? 0 : ""), reps: target.reps, failure: 2, done: false, type: "normal" },
          { weight: target.weight > 0 ? target.weight : (isBW ? 0 : ""), reps: target.reps, failure: 2, done: false, type: "normal" },
          { weight: target.weight > 0 ? target.weight : (isBW ? 0 : ""), reps: Math.max(6, target.reps - 1), failure: 3, done: false, type: "normal" }
        ]
      });
      renderTracker();
    };

    const updateStats = () => {
      if (!paneWorkout) return;
      let totalVol = 0, totalSets = 0, sumIntensity = 0;
      for (const ex of state.sessionExercises) {
        for (const s of ex.sets) {
          // Live counters track working sets only, matching what gets saved.
          if (s.done && s.type !== "warmup") {
            totalSets++;
            const defaultW = ex.isBW ? 0 : 80;
            const w = parseFloat(s.weight) >= 0 ? parseFloat(s.weight) : defaultW;
            const r = parseFloat(s.reps) || 8;
            totalVol += SomaIntelligenceEngine.calculateWorkVolume(w, r, ex.isBW);
            sumIntensity += (parseFloat(s.failure) || 3);
          }
        }
      }
      const elapsedMins = Math.max(1, Math.round((Date.now() - state.sessionStartTime) / 60000));
      const avgIntensity = totalSets > 0 ? (sumIntensity / totalSets) : 3;
      const cals = SomaIntelligenceEngine.calculateCaloriesBurned(elapsedMins, totalVol, totalSets, avgIntensity);

      const statCals = paneWorkout.querySelector("#stat-cals");
      const statVol = paneWorkout.querySelector("#stat-vol");
      const statSets = paneWorkout.querySelector("#stat-sets");
      const statEx = paneWorkout.querySelector("#stat-ex");

      if (statCals) statCals.textContent = `${cals} kcal`;
      if (statVol) statVol.textContent = totalVol.toLocaleString();
      if (statSets) statSets.textContent = String(totalSets);
      if (statEx) statEx.textContent = String(state.sessionExercises.length);
    };

    const showPlateCalculator = (weight, barWeightOverride) => {
      const popover = appEl.querySelector("#plate-popover");
      const renderEl = appEl.querySelector("#plate-bar-render");
      const listEl = appEl.querySelector("#plate-breakdown-list");
      const textEl = appEl.querySelector("#plate-popover-text");
      if (!popover) return;

      const barW = (typeof barWeightOverride === "number" && barWeightOverride > 0) ? barWeightOverride : settings.barWeight;
      const w = parseFloat(weight) || 80;
      textEl.textContent = `Bar: ${barW}${settings.unit} • Per Side: ${Math.max(0, ((w - barW) / 2)).toFixed(1)} ${settings.unit}`;
      const plates = SomaIntelligenceEngine.calculatePlateStack(w, barW, settings.unit);

      let discsHtml = '<div style="width:14px; height:10px; background:var(--soma-text-dim); border-radius:2px;"></div>';
      for (const p of plates) {
        discsHtml += `<div style="background:${p.color}; width:8px; height:34px; border-radius:3px;"></div>`;
      }
      renderEl.innerHTML = discsHtml;
      listEl.innerHTML = plates.length > 0 ? `Stack: <b>${plates.map(p => p.weight + settings.unit).join(" + ")}</b>` : "Olympic Bar Only";

      const warmupEl = appEl.querySelector("#plate-warmup-list");
      if (warmupEl) {
        if (w > barW) {
          const ramp = SomaIntelligenceEngine.calculateWarmupRamp(w, barW, settings.unit);
          warmupEl.innerHTML = ramp.map(r => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-top:1px dashed rgba(255,255,255,0.08);">
              <span style="color:var(--soma-text-dim);">${r.pct}% Warm-up</span>
              <span style="color:var(--soma-text); font-weight:700;">${r.weight}${settings.unit} ${r.plates.length > 0 ? `(${r.plates.map(p => p.weight).join('+')} /side)` : '(bar only)'}</span>
            </div>
          `).join("");
        } else {
          warmupEl.innerHTML = "";
        }
      }

      popover.style.display = "block";
    };

    // Optional pre-workout check-in. Skippable by design: an unanswered
    // check-in simply leaves autoregulation on muscle readiness alone.
    const renderReadinessCard = () => {
      const host = paneWorkout && paneWorkout.querySelector("#readiness-host");
      if (!host) return;
      const day = nutritionDB[noteDateKey] || {};
      const sleep = day.sleep || {};
      const ck = day.readiness || {};
      const answered = ck.soreness !== undefined && ck.stress !== undefined;

      if (readinessDismissed || answered) {
        const score = todaySubjective();
        host.innerHTML = score === null ? "" : `
          <div class="soma-readiness-mini">
            <span>🧠 Readiness <b>${score}%</b></span>
            <button class="soma-btn" data-action="dismiss-readiness" style="padding:3px 9px; font-size:0.66rem;">Redo</button>
          </div>`;
        if (answered && readinessDismissed) readinessDismissed = false;
        return;
      }

      const slider = (id, label, icon, val) => `
        <div class="soma-ck-row">
          <span class="soma-ck-label">${icon} ${label}</span>
          <input type="range" min="1" max="5" step="1" value="${val}" id="${id}" class="soma-ck-slider" />
        </div>`;

      host.innerHTML = `
        <div class="soma-card soma-readiness-card">
          <div class="soma-card-title"><span>🧠 Before You Start</span><span style="font-size:0.62rem; color:var(--soma-text-faint); font-weight:700;">OPTIONAL</span></div>
          <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-bottom:8px;">
            ${sleep.hours
              ? `😴 <b>${sleep.hours}h</b> sleep logged this morning — using that.`
              : "No sleep logged today. Log it in the Sleep widget and it feeds in automatically."}
          </div>
          ${slider("ck-soreness", "Soreness", "💪", ck.soreness || 3)}
          ${slider("ck-stress", "Stress", "🧠", ck.stress || 3)}
          <div class="soma-ck-legend"><span>none</span><span>severe</span></div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="soma-btn" data-action="dismiss-readiness" style="flex:0.6;">Skip</button>
            <button class="soma-btn soma-btn-accent" data-action="save-readiness" style="flex:1.4;">Save</button>
          </div>
        </div>`;
    };

    const renderTracker = () => {
      if (!paneWorkout) return;
      const cardsContainer = paneWorkout.querySelector("#cards-container");
      if (!cardsContainer) return;
      cardsContainer.innerHTML = "";

      state.sessionExercises.forEach((ex, exIdx) => {
        const card = document.createElement("div");
        card.className = "soma-card";

        const groupInfo = supersetGroupInfo(ex.supersetGroup);
        if (groupInfo.id) {
          card.style.borderLeft = `4px solid ${groupInfo.color}`;
        }

        // Tier colour tracks what the autoregulator decided, not just the
        // raw progression level — a backed-off target should not read as a
        // green light.
        const tierClass = (() => {
          const t = (ex.overloadTarget && ex.overloadTarget.diffTier) || "";
          if (t === "Under-recovered" || t === "Deload") return "soma-tag-red";
          if (t === "Stalled" || t.startsWith("Hold")) return "soma-tag-amber";
          if (t.includes("Lvl 1")) return "soma-tag-emerald";
          return "soma-tag-gray";
        })();

        const targetInfo = ex.overloadTarget ? `
          <div class="soma-target-intel">
            <div>
              <span>🎯 <b>Smart Target:</b> ${ex.isBW && ex.overloadTarget.weight === 0 ? 'Bodyweight' : ex.overloadTarget.weight + ' ' + settings.unit} × ${ex.overloadTarget.reps} reps</span>
              <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-top:2px;">${ex.overloadTarget.note}</div>
              ${ex.overloadTarget.autoNote ? `<div class="soma-auto-note">🧠 ${ex.overloadTarget.autoNote}</div>` : ''}
            </div>
            <span class="soma-tag ${tierClass}">${ex.overloadTarget.diffTier}</span>
          </div>
        ` : '';

        // When the autoregulator has backed a lift off, name what to do
        // instead rather than leaving "train something else" hanging.
        let swapHtml = "";
        if (ex.overloadTarget && ex.overloadTarget.diffTier === "Under-recovered") {
          const alts = SomaIntelligenceEngine.suggestAlternatives(ex, exerciseDB, muscleReadinessMap());
          if (alts.length) {
            swapHtml = `
              <div class="soma-swap-box">
                <div class="soma-swap-head">🔄 Fresher options for this muscle</div>
                ${alts.map(a => `
                  <button class="soma-swap-opt" data-action="swap-exercise" data-ex="${exIdx}" data-name="${a.name}">
                    <span class="soma-swap-name">${a.name}</span>
                    <span class="soma-swap-meta">${a.readiness}% · ${a.note}</span>
                  </button>`).join("")}
              </div>`;
          }
        }

        const tagsHtml = `
          <div class="soma-tag-wrap">
            ${groupInfo.id ? `<span class="soma-tag soma-tag-superset" style="background:${groupInfo.color}22; color:${groupInfo.color}; border:1px solid ${groupInfo.color}55;">🔗 Superset ${groupInfo.label}</span>` : ''}
            ${ex.isBW ? `<span class="soma-tag soma-tag-emerald">🧍 Bodyweight</span>` : ''}
            ${ex.subTarget ? `<span class="soma-tag soma-tag-gray">${ex.subTarget}</span>` : ''}
            ${ex.tier ? `<span class="soma-tag soma-tag-white">${ex.tier}</span>` : ''}
            ${ex.isAxial ? `<span class="soma-tag soma-tag-red">⚡ Axial Spinal Load</span>` : ''}
          </div>
        `;

        const barPresets = BAR_PRESETS[settings.unit] || BAR_PRESETS.kg;
        const currentPreset = barPresets.find(p => p.weight === ex.barWeight);
        const barSelectHtml = ex.usesBar ? `
          <div class="soma-bar-select-wrap" style="display:flex; align-items:center; gap:6px; margin:6px 0;">
            <select class="soma-input set-bar-select" data-ex="${exIdx}" style="font-size:0.72rem; padding:4px 6px; width:auto; flex:1;">
              ${barPresets.map(p => `<option value="${p.id}" ${currentPreset ? (currentPreset.id === p.id ? 'selected' : '') : (p.id === 'custom' ? 'selected' : '')}>${p.label}</option>`).join("")}
            </select>
            ${!currentPreset ? `<input type="number" class="soma-input set-bar-custom" data-ex="${exIdx}" value="${ex.barWeight}" placeholder="Bar kg" style="width:64px; font-size:0.72rem; padding:4px 6px;" />` : ''}
            <span style="font-size:0.68rem; color:var(--soma-text-dim);">Type <b>added</b> weight below (e.g. 2×10${settings.unit} → 20${settings.unit})</span>
          </div>
        ` : '';

        let rowsHtml = `
          <div class="soma-set-row">
            <div class="soma-th">SET</div>
            <div class="soma-th">${(ex.isBW || ex.usesBar) ? '+' + settings.unit.toUpperCase() : settings.unit.toUpperCase()}</div>
            <div class="soma-th">REPS</div>
            <div class="soma-th">DIFF (1-5)</div>
            <div class="soma-th">DONE</div>
            <div></div>
          </div>
        `;

        ex.sets.forEach((s, sIdx) => {
          const placeholderKg = (ex.isBW || ex.usesBar) ? "0" : "80";
          const totalW = getTotalWeight(ex, s);
          const totalHint = ex.usesBar && totalW > 0 ? `<div style="font-size:0.62rem; color:var(--soma-text-faint); text-align:center; margin-top:1px;">= ${totalW}${settings.unit}</div>` : '';
          const isDropSet = s.type === "dropset";
          const isWarmup  = s.type === "warmup";
          // Warm-ups and drop sets are not working sets, so they must not
          // consume a number - otherwise "Set 3" means different things
          // depending on how you warmed up.
          const workingNo = ex.sets
            .slice(0, sIdx + 1)
            .filter(x => x.type !== "warmup" && x.type !== "dropset").length;
          const setNumLabel = isWarmup ? "W" : isDropSet ? "↳D" : String(workingNo);
          const typeTitle = isWarmup
            ? "Warm-up — not counted in volume, PRs or recovery. Tap for normal."
            : isDropSet
              ? "Drop set — tap for warm-up."
              : "Working set — tap to mark as a drop set.";
          rowsHtml += `
            <div class="soma-set-row ${s.done ? 'row-done' : ''} ${isDropSet ? 'row-dropset' : ''} ${isWarmup ? 'row-warmup' : ''}">
              <button class="soma-set-num-btn ${isDropSet ? 'is-dropset' : ''} ${isWarmup ? 'is-warmup' : ''}" data-action="toggle-set-type" data-ex="${exIdx}" data-set="${sIdx}" title="${typeTitle}">${setNumLabel}</button>
              <div>
                <input type="number" class="soma-input set-weight" data-ex="${exIdx}" data-set="${sIdx}" value="${s.weight}" placeholder="${placeholderKg}" />
                ${totalHint}
              </div>
              <input type="number" class="soma-input set-reps" data-ex="${exIdx}" data-set="${sIdx}" value="${s.reps}" placeholder="8" />
              <select class="soma-input set-fail" data-ex="${exIdx}" data-set="${sIdx}" style="padding:0 2px;">
                <option value="1" ${s.failure == 1 ? 'selected' : ''}>1 (Very Easy)</option>
                <option value="2" ${s.failure == 2 ? 'selected' : ''}>2 (Easy/RIR 2)</option>
                <option value="3" ${s.failure == 3 ? 'selected' : ''}>3 (Target)</option>
                <option value="4" ${s.failure == 4 ? 'selected' : ''}>4 (Hard/Grind)</option>
                <option value="5" ${s.failure == 5 ? 'selected' : ''}>5 (Failure)</option>
              </select>
              <input type="checkbox" class="soma-check set-done" data-ex="${exIdx}" data-set="${sIdx}" ${s.done ? "checked" : ""} />
              <button class="soma-btn-del" data-action="del-set" data-ex="${exIdx}" data-set="${sIdx}">✕</button>
            </div>
          `;
        });

        card.innerHTML = `
          <div class="soma-card-top">
            <span class="soma-card-title">${exIdx + 1}. ${ex.name}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              <button class="soma-btn-superset ${groupInfo.id ? 'is-active' : ''}" data-action="cycle-superset" data-ex="${exIdx}" style="${groupInfo.id ? `color:${groupInfo.color}; border-color:${groupInfo.color}66;` : ''}" title="Link this exercise into a superset group">🔗${groupInfo.id ? ' ' + groupInfo.label : ''}</button>
              <button class="soma-btn-del" data-action="del-card" data-ex="${exIdx}">✕</button>
            </div>
          </div>
          ${tagsHtml}
          ${barSelectHtml}
          ${targetInfo}
          ${swapHtml}
          ${rowsHtml}
          <div style="display:flex; gap:8px;">
            <button class="soma-btn-addset" data-action="add-set" data-ex="${exIdx}" style="flex:1;">+ Add Set</button>
            <button class="soma-btn-addset soma-btn-adddropset" data-action="add-drop-set" data-ex="${exIdx}" style="flex:1;">+ Add Drop Set</button>
          </div>
        `;
        cardsContainer.appendChild(card);
      });
      renderReadinessCard();
      updateStats();
    };

    const renderFinishedScreen = (data) => {
      if (!paneWorkout) return;
      if (workoutDurationInterval) this.untrackInterval(workoutDurationInterval);
      if (restTimerInterval) this.untrackInterval(restTimerInterval);

      let cardsHtml = "";
      (data.exercises || []).forEach(ex => {
        let setsListHtml = "";
        (ex.sets || []).forEach((s, idx) => {
          const defaultKg = ex.isBW ? "0" : "80";
          const displayWeight = (s.weight !== undefined && s.weight !== "") ? s.weight : (s.done ? defaultKg : "0");
          const displayReps = (s.reps !== undefined && s.reps !== "") ? s.reps : (s.done ? "8" : "0");
          const failLevel = s.failure || "3";

          let weightLabel;
          if (ex.usesBar) {
            const rawW = parseFloat(displayWeight) || 0;
            const totalW = rawW > 0 ? (ex.barWeight || settings.barWeight) + rawW : (ex.barWeight || settings.barWeight);
            weightLabel = rawW > 0 ? `${totalW} ${settings.unit} (bar + ${rawW})` : `${totalW} ${settings.unit} (bar only)`;
          } else {
            weightLabel = ex.isBW
              ? (parseFloat(displayWeight) > 0 ? `+${displayWeight} ${settings.unit}` : `Bodyweight`)
              : `${displayWeight} ${settings.unit}`;
          }

          setsListHtml += `
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.8rem;">
              <span>${s.type === "dropset" ? "↳ Drop" : s.type === "warmup" ? "W Warm-up" : `Set ${idx + 1}`}: <b>${weightLabel}</b> × <b>${displayReps} reps</b></span>
              <span style="color:${s.done ? 'var(--soma-accent-text)' : 'var(--soma-text-dim)'}; font-weight:700;">Lvl ${failLevel} ${s.done ? '✅' : '⏳'}</span>
            </div>
          `;
        });

        const finishedGroupInfo = supersetGroupInfo(ex.supersetGroup);
        cardsHtml += `
          <div class="soma-card" ${finishedGroupInfo.id ? `style="border-left:4px solid ${finishedGroupInfo.color};"` : ''}>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-weight:800; font-size:0.95rem; color:var(--soma-text);">${ex.name}</span>
              <span style="display:flex; gap:6px;">
                ${finishedGroupInfo.id ? `<span class="soma-tag" style="background:${finishedGroupInfo.color}22; color:${finishedGroupInfo.color}; border:1px solid ${finishedGroupInfo.color}55;">🔗 ${finishedGroupInfo.label}</span>` : ''}
                <span class="soma-tag soma-tag-gray">${ex.subTarget || ex.muscle}</span>
              </span>
            </div>
            <div>${setsListHtml}</div>
          </div>
        `;
      });

      paneWorkout.innerHTML = `
        <div style="text-align:center; padding:10px 0 16px 0;">
          <span class="soma-tag-badge" style="background:rgba(16,185,129,0.15); color:var(--soma-accent-text); border:1px solid rgba(16,185,129,0.3);">Session Completed</span>
          <h2 style="font-size:1.35rem; font-weight:800; color:var(--soma-text); margin:6px 0 0 0;">Workout Summary</h2>
          <div style="font-size:0.78rem; color:var(--soma-text-dim); margin-top:4px;">Logged & synced to vault note properties.</div>
        </div>
        ${(data.blankDoneSets > 0 ? `
          <div class="soma-blank-warn">
            ⚠ ${data.blankDoneSets} set${data.blankDoneSets === 1 ? " was" : "s were"} ticked done with no weight or reps.
            They count as zero — the totals above only include sets you actually logged.
          </div>` : "")}
        <div class="soma-stats-grid">
          <div class="soma-stat-box"><div class="soma-stat-lbl">Duration</div><div class="soma-stat-val" style="color:var(--soma-accent-text);">${data.durationFormatted}</div></div>
          <div class="soma-stat-box"><div class="soma-stat-lbl">Burn Target</div><div class="soma-stat-val" style="color:var(--soma-warn);">${data.caloriesBurned} kcal</div></div>
          <div class="soma-stat-box"><div class="soma-stat-lbl">Volume (Added)</div><div class="soma-stat-val">${(data.totalVol || 0).toLocaleString()} ${settings.unit}</div></div>
          <div class="soma-stat-box"><div class="soma-stat-lbl">Sets Done</div><div class="soma-stat-val">${data.totalSets}</div></div>
        </div>
        <div>${cardsHtml}</div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="soma-btn" data-action="edit-session" style="flex:1.2; background:var(--soma-surface-2); border-color:rgba(255,255,255,0.18);">✏️ Edit Session</button>
          <button class="soma-btn" data-action="reset-session" style="flex:0.8; background:rgba(239,68,68,0.15); border:1px solid var(--soma-danger); color:#fca5a5;">🗑️ Reset</button>
        </div>
      `;
    };

    // ========================================================================
    // RECOVERY HUD SVG RENDER PIPELINE
    // ========================================================================
    const HEAT_TIERS = {
      fresh:    { base: "#22c55e", light: "#a7f3c8", dark: "#0f2e1c" },
      low:      { base: "#eab308", light: "#fde68a", dark: "#3f2f08" },
      moderate: { base: "#f97316", light: "#fdc493", dark: "#3f200a" },
      high:     { base: "var(--soma-danger)", light: "#fca5a5", dark: "#3f1212" }
    };

    function getHeatTier(recovery) {
      if (recovery >= 90) return HEAT_TIERS.fresh;
      if (recovery >= 70) return HEAT_TIERS.low;
      if (recovery >= 40) return HEAT_TIERS.moderate;
      return HEAT_TIERS.high;
    }

    const computeBiologicalReadiness = () => {
      const BASE_RECOVERY_HOURS = {
        calves: 24, calves_back: 24, deltoids_back: 24, forearms: 24,
        biceps: 36, deltoids: 36,
        chest: 48, upper_back: 48, trapezius_back: 48, triceps: 48, triceps_back: 48, gluteal: 48, adductors: 48,
        quadriceps: 72, hamstring: 72, lower_back: 72
      };

      // Effort → recovery-time multiplier. This is the piece that was
      // missing before: a light/moderate set (not taken near failure)
      // should demand meaningfully LESS recovery than a true all-out set,
      // instead of only nudging the base hours by a few percent.
      //   1 = Very Easy      → 0.35x recovery time needed
      //   2 = Easy / RIR 2    → 0.60x
      //   3 = Target          → 1.00x (this is what the base hours assume)
      //   4 = Hard / Grind    → 1.30x
      //   5 = True Failure    → 1.60x
      const EFFORT_MULTIPLIER = { 1: 0.35, 2: 0.60, 3: 1.00, 4: 1.30, 5: 1.60 };

      const now = Date.now();
      const latestStimulus = {};

      for (const [dateKey, session] of Object.entries(history)) {
        const sessionTime = session.timestamp || now;
        if (session.muscles) {
          for (const [mKey, stats] of Object.entries(session.muscles)) {
            if (!latestStimulus[mKey] || sessionTime > latestStimulus[mKey].timestamp) {
              latestStimulus[mKey] = {
                timestamp: sessionTime,
                sets: stats.sets || 3,
                avgFail: stats.avgFail || 3
              };
            }
          }
        }
      }

      for (const key in muscleRegistry) {
        const baseT = BASE_RECOVERY_HOURS[key] || muscleRegistry[key].defaultHours || 48;
        muscleRegistry[key].defaultHours = baseT;

        if (latestStimulus[key]) {
          const elapsedHours = (now - latestStimulus[key].timestamp) / 3600000;
          const sets = latestStimulus[key].sets;
          const avgFail = latestStimulus[key].avgFail;

          // Volume factor: 3 working sets is the "normal dose" this base
          // time assumes. Fewer sets need proportionally less recovery,
          // more sets need proportionally more — clamped so a single set
          // or a huge session doesn't send this to an extreme.
          const volumeFactor = Math.min(1.8, Math.max(0.45, sets / 3));

          // Effort factor: interpolate between the defined levels so a
          // 2.3 average difficulty lands between "Easy" and "Target".
          const lo = Math.floor(avgFail), hi = Math.ceil(avgFail);
          const effortFactor = lo === hi
            ? (EFFORT_MULTIPLIER[lo] || 1)
            : (EFFORT_MULTIPLIER[lo] || 1) + ((EFFORT_MULTIPLIER[hi] || 1) - (EFFORT_MULTIPLIER[lo] || 1)) * (avgFail - lo);

          // Overall required recovery time, bounded to 30%–200% of the
          // muscle's base so nothing goes absurdly short or long.
          const tTarget = Math.min(baseT * 2, Math.max(baseT * 0.3, baseT * volumeFactor * effortFactor));

          // Concave (not convex) decay: most of the readiness comes back
          // in the earlier hours, tapering off near full recovery — this
          // matches real recovery better than the old formula, which kept
          // muscles pinned near 0% readiness for a while right after a
          // light session.
          const readiness = Math.min(100, Math.pow(Math.max(0, elapsedHours) / tTarget, 0.8) * 100);
          const hoursLeft = Math.max(0, Math.round(tTarget - elapsedHours));

          muscleRegistry[key].recovery = Math.round(readiness);
          muscleRegistry[key].hoursLeft = hoursLeft;
          muscleRegistry[key].lastWorkedHours = Math.round(elapsedHours);
          muscleRegistry[key].effortNote = avgFail <= 1.5 ? "Very Easy" : avgFail <= 2.5 ? "Easy" : avgFail <= 3.5 ? "Target" : avgFail <= 4.5 ? "Hard" : "True Failure";
          muscleRegistry[key].adjustedHours = Math.round(tTarget);
          muscleRegistry[key].baseHours = baseT;
        } else {
          muscleRegistry[key].recovery = 100;
          muscleRegistry[key].hoursLeft = 0;
          muscleRegistry[key].lastWorkedHours = null;
          muscleRegistry[key].effortNote = null;
        }
      }
    };


    // Readiness of the limiting muscle an exercise trains. The Recovery HUD
    // already models this per muscle; this is the bridge that lets the
    // workout builder consult it instead of only drawing it.
    const readinessForExercise = (ex) => {
      const keys = Array.isArray(ex && ex.targetKeys) ? ex.targetKeys : [];
      if (!keys.length) return null;
      computeBiologicalReadiness();
      let worst = null;
      for (const k of keys) {
        const entry = muscleRegistry[k];
        if (!entry || typeof entry.recovery !== "number") continue;
        if (worst === null || entry.recovery < worst) worst = entry.recovery;
      }
      return worst;
    };

    // Assembles the full context the autoregulation layer needs for one
    // exercise: last performance, muscle readiness, program phase, trend.
    // Sleep comes from the sleep widget; soreness and stress from the
    // pre-workout check-in. Any of them may be absent.
    const todaySubjective = () => {
      const day = nutritionDB[noteDateKey] || {};
      const sleep = day.sleep || {};
      const ck = day.readiness || {};
      return SomaIntelligenceEngine.computeSubjectiveReadiness({
        sleepHours: sleep.hours ?? null,
        sleepQuality: sleep.quality ?? null,
        soreness: ck.soreness ?? null,
        stress: ck.stress ?? null
      });
    };

    // Current readiness for every muscle, used to rank substitutions.
    const muscleReadinessMap = () => {
      computeBiologicalReadiness();
      const out = {};
      for (const k in muscleRegistry) {
        const v = muscleRegistry[k] && muscleRegistry[k].recovery;
        if (typeof v === "number") out[k] = v;
      }
      return out;
    };

    const buildAutoTarget = (exMeta, lastSet) => {
      const proj = SomaIntelligenceEngine.getProgramProjectedDay(
        parseLocalDateKey(noteDateKey), settings.scheduleOverrides || {}
      );
      return SomaIntelligenceEngine.computeAutoregulatedTarget(lastSet, {
        isBW: !!exMeta.isBW,
        // How the lifter actually feels can only pull the muscle figure down.
        readiness: SomaIntelligenceEngine.blendReadiness(
          readinessForExercise(exMeta), todaySubjective()
        ),
        isDeload: !!proj.isDeload,
        unit: settings.unit,
        trend: SomaIntelligenceEngine.computeVolumeTrend(history, exMeta.name)
      });
    };

    const renderHeatmapView = () => {
      if (!paneHeatmap) return;
      computeBiologicalReadiness();

      paneHeatmap.innerHTML = `
        <div class="bm3-header">
          <div class="bm3-title"><span class="bm3-icon">🧬</span> Musculoskeletal Recovery HUD</div>
          <div class="bm3-subtitle">Biological fatigue decay • Real-time recovery timeline</div>
        </div>

        <div class="bm3-viewtabs">
          <button class="bm3-viewtab ${heatmapCurrentView === 'front' ? 'active' : ''}" data-action="hm-switch-front">FRONT</button>
          <button class="bm3-viewtab ${heatmapCurrentView === 'back' ? 'active' : ''}" data-action="hm-switch-back">BACK</button>
        </div>

        <div class="bm3-layout">
          <div class="bm3-panel">
            <div class="bm3-panel-title">READINESS SCORE</div>
            <div class="bm3-legend-row"><div class="bm3-dot" style="background:#22c55e;"></div><div class="bm3-legend-text">90 - 100%<span class="sub">(Fully Primed)</span></div></div>
            <div class="bm3-legend-row"><div class="bm3-dot" style="background:#eab308;"></div><div class="bm3-legend-text">70 - 89%<span class="sub">(Supercompensated)</span></div></div>
            <div class="bm3-legend-row"><div class="bm3-dot" style="background:#f97316;"></div><div class="bm3-legend-text">40 - 69%<span class="sub">(Repair Phase)</span></div></div>
            <div class="bm3-legend-row"><div class="bm3-dot" style="background:var(--soma-danger);"></div><div class="bm3-legend-text">0 - 39%<span class="sub">(Acute Fatigue)</span></div></div>
          </div>

          <div class="bm3-viewport" id="soma-hm-viewport"></div>

          <div class="bm3-panel">
            <div class="bm3-panel-title">TRAINING INTEL</div>
            <div style="font-size:0.75rem; color:var(--soma-text-dim); line-height:1.4;">Tap any anatomical muscle node to inspect remaining latency & load tolerance.</div>
          </div>
        </div>

        <div class="bm3-detail-card" id="soma-hm-detail-card">
          <div>
            <div class="bm3-detail-name" id="hm-detail-name">Chest (Pectoralis Major)</div>
            <div class="bm3-detail-hours" id="hm-detail-hours">🟢 100% Fully Recovered • Ready for max overload</div>
            <div class="bm3-detail-desc" id="hm-detail-desc">Clavicular and Sternal heads primed for maximal overload stimulus.</div>
          </div>
          <div class="bm3-detail-tag" id="hm-detail-tag" style="background:#22c55e;">100%</div>
        </div>
      `;

      renderSvgBody();
    };

    function buildDefs(view) {
      let defs = "";
      const instanceId = "soma-hud";
      for (const [key, item] of Object.entries(muscleRegistry)) {
        if (item.view !== view) continue;
        const tier = getHeatTier(item.recovery);
        const gid = `grad-${instanceId}-${view}-${key}`;

        defs += `
          <radialGradient id="${gid}" cx="32%" cy="26%" r="80%">
            <stop offset="0%" stop-color="${tier.light}" stop-opacity="1" />
            <stop offset="30%" stop-color="${tier.base}" stop-opacity="1" />
            <stop offset="62%" stop-color="${tier.base}" stop-opacity="0.96" />
            <stop offset="85%" stop-color="${tier.dark}" stop-opacity="0.97" />
            <stop offset="100%" stop-color="${tier.dark}" stop-opacity="1" />
          </radialGradient>
        `;

        const pid = `fiber-${instanceId}-${view}-${key}`;
        defs += `
          <pattern id="${pid}" width="5" height="5" patternTransform="rotate(58)" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="transparent" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#000000" stroke-width="0.8" stroke-opacity="0.75" />
            <line x1="2.5" y1="0" x2="2.5" y2="5" stroke="var(--soma-text)" stroke-width="0.5" stroke-opacity="0.38" />
          </pattern>
        `;
      }
      return defs;
    }

    function renderSvgBody() {
      const viewport = paneHeatmap.querySelector("#soma-hm-viewport");
      if (!viewport) return;

      const instanceId = "soma-hud";
      const view = heatmapCurrentView;
      const outline = view === "front" ? (somaData.FRONT_OUTLINE || "") : (somaData.BACK_OUTLINE || "");
      const vb = view === "front" ? "0 0 724 1448" : "724 0 724 1448";
      const staticParts = (somaData.STATIC_PARTS && somaData.STATIC_PARTS[view]) ? somaData.STATIC_PARTS[view] : {};
      const defsHtml = buildDefs(view);
      let pathsHtml = "";

      for (const [partKey, partData] of Object.entries(staticParts)) {
        pathsHtml += `<path class="bm3-static-part" d="${partData.d}" fill="${partData.color}" />`;
      }

      for (const [key, item] of Object.entries(muscleRegistry)) {
        if (item.view !== view) continue;
        const gid = `grad-${instanceId}-${view}-${key}`;
        const tier = getHeatTier(item.recovery);
        const isSelected = key === heatmapSelectedKey;
        const fill = `url(#${gid})`;
        const stroke = tier.dark;
        const pathClass = `bm3-muscle-path${isSelected ? " selected" : ""}`;

        pathsHtml += `<g class="bm3-muscle-group${isSelected ? " selected" : ""}">`;
        (item.paths || []).forEach(p => {
          pathsHtml += `<path class="${pathClass}" data-key="${key}" d="${p}" fill="${fill}" stroke="${stroke}" stroke-width="0.6" style="color:${tier.base}" />`;
        });

        const pid = `fiber-${instanceId}-${view}-${key}`;
        (item.paths || []).forEach(p => {
          pathsHtml += `<path class="bm3-fiber-overlay${isSelected ? " selected" : ""}" data-key="${key}" d="${p}" fill="url(#${pid})" />`;
        });
        pathsHtml += `</g>`;
      }

      viewport.innerHTML = `
        <svg class="bm3-vector-svg" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">
          <defs>${defsHtml}</defs>
          <path class="bm3-base-body" d="${outline}" />
          ${pathsHtml}
        </svg>
      `;

      const svgEl = viewport.querySelector(".bm3-vector-svg");
      if (!svgEl) return;

      svgEl.querySelectorAll(".bm3-muscle-path").forEach(p => {
        const key = p.getAttribute("data-key");
        p.addEventListener("mouseenter", () => renderHeatmapDetails(key));
        p.addEventListener("click", () => {
          heatmapSelectedKey = key;
          const b = p.getBBox();
          heatmapSelectedPoint = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          renderSvgBody();
          renderHeatmapDetails(key);
        });
      });

      if (heatmapSelectedKey && heatmapSelectedPoint) {
        showHeatmapAnnotation(svgEl, view, heatmapSelectedPoint, muscleRegistry[heatmapSelectedKey]?.name || "");
      }
    }

    function renderHeatmapDetails(key) {
      const model = muscleRegistry[key];
      if (!model) return;
      const tier = getHeatTier(model.recovery);
      const nameEl = paneHeatmap.querySelector("#hm-detail-name");
      const hoursEl = paneHeatmap.querySelector("#hm-detail-hours");
      const descEl = paneHeatmap.querySelector("#hm-detail-desc");
      const tagEl = paneHeatmap.querySelector("#hm-detail-tag");
      const cardEl = paneHeatmap.querySelector("#soma-hm-detail-card");

      if (nameEl) nameEl.textContent = model.name;
      if (hoursEl) {
        hoursEl.innerHTML = model.recovery >= 90
          ? `🟢 100% Fully Recovered • Ready for max overload`
          : `⏱ ${model.hoursLeft} Hours to Full Recovery • ${model.recovery}% Readiness`;
      }
      if (descEl) {
        const baseDesc = model.desc || "Muscle tissue undergoing metabolic recovery and protein synthesis.";
        if (model.effortNote && model.recovery < 90) {
          descEl.innerHTML = `${baseDesc}<br><span style="color:var(--soma-text-dim); font-size:0.72rem;">Last session: <b>${model.effortNote}</b> effort • Adjusted recovery window: <b>${model.adjustedHours}h</b> (base ${model.baseHours}h)</span>`;
        } else {
          descEl.textContent = baseDesc;
        }
      }
      if (tagEl) {
        tagEl.textContent = `${model.recovery}%`;
        tagEl.style.background = tier.base;
      }
      if (cardEl) cardEl.style.borderColor = tier.base + "80";
    }

    function showHeatmapAnnotation(svgEl, view, point, label) {
      const existing = svgEl.querySelector(".bm3-annot-group");
      if (existing) existing.remove();

      const cx = point.x, cy = point.y;
      const vbX = view === "front" ? 0 : 724;
      const vbWidth = 724;
      const centerX = vbX + vbWidth / 2;
      const routeLeft = cx < centerX;

      const LEADER_OFFSET = 56;
      const EDGE_MARGIN = 14;
      const minX = vbX + EDGE_MARGIN, maxX = vbX + vbWidth - EDGE_MARGIN;
      let targetX = routeLeft ? cx - LEADER_OFFSET : cx + LEADER_OFFSET;
      targetX = Math.max(minX, Math.min(maxX, targetX));

      const textAnchor = routeLeft ? "end" : "start";
      const textX = targetX + (routeLeft ? -12 : 12);
      const textLength = label.length * 14;
      const backdropPad = 8;
      const backdropX = routeLeft ? textX - textLength - backdropPad : textX;
      const backdropWidth = textLength + backdropPad * 2;

      const html = `
        <g class="bm3-annot-group">
          <line x1="${cx}" y1="${cy}" x2="${targetX}" y2="${cy}" stroke="var(--soma-info)" stroke-width="4" stroke-linecap="round" />
          <circle class="bm3-annot-dot" cx="${cx}" cy="${cy}" r="9" fill="var(--soma-info)" stroke="#0b1220" stroke-width="3" />
          <rect class="bm3-annot-backdrop" x="${backdropX}" y="${cy - 18}" width="${backdropWidth}" height="36" />
          <text x="${textX}" y="${cy}" fill="#f8fafc" font-size="29" font-weight="800"
                text-anchor="${textAnchor}" dominant-baseline="middle"
                style="paint-order: stroke; stroke: #0b1220; stroke-width: 6px; stroke-linejoin: round;">${label}</text>
        </g>
      `;
      svgEl.insertAdjacentHTML("beforeend", html);
    }

    // ========================================================================
    // VIEW 3: 6-MONTH PERIODIZATION CALENDAR & SUBSCRIPTION ENGINE
    // ========================================================================
    const renderCalendarView = () => {
      if (!paneCalendar) return;
      const year = calViewDate.getFullYear();
      const month = calViewDate.getMonth();
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const sampleProg = SomaIntelligenceEngine.getProgramProjectedDay(new Date(year, month, 1, 12, 0, 0), settings.scheduleOverrides || {});

      const firstDayOfWeek = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      let gridHtml = "";
      const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
      for (const d of weekdays) gridHtml += `<div class="soma-cal-head-day">${d}</div>`;
      for (let i = 0; i < firstDayOfWeek; i++) gridHtml += `<div class="soma-cal-empty"></div>`;

      let mLoggedCount = 0, mTotalVol = 0, mRestCount = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const currentCellDate = new Date(year, month, d, 12, 0, 0);
        const dateKey = getLocalDateKey(currentCellDate);
        const isToday = dateKey === noteDateKey;
        const session = history[dateKey];
        const projection = SomaIntelligenceEngine.getProgramProjectedDay(currentCellDate, settings.scheduleOverrides || {});

        const isSubExpiry = settings.subEndDate === dateKey;

        if (session) {
          mLoggedCount++;
          mTotalVol += (session.totalVol || 0);
        } else if (projection.isRest) {
          mRestCount++;
        }

        const tag = session ? "DONE" : (projection.isRest ? "REST" : projection.split.split(" ")[0].toUpperCase());
        const tagCls = session ? "soma-cal-tag-done" : (projection.isRest ? "soma-cal-tag-rest" : "soma-cal-tag-work");

        gridHtml += `
          <div class="soma-cal-cell ${isToday ? 'soma-cal-today' : ''} ${session ? 'soma-cal-completed' : ''} ${isSubExpiry ? 'soma-cal-expiry' : ''}" data-action="inspect-cal-day" data-date="${dateKey}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="soma-cal-num">${d}</span>
              ${session ? '<span style="font-size:0.65rem; color:var(--soma-accent-text); font-weight:800;">✓</span>' : ''}
              ${isSubExpiry ? '<span style="font-size:0.62rem; color:var(--soma-danger); font-weight:900;">⚠️</span>' : ''}
            </div>
            <div class="soma-cal-badge ${tagCls}">${isSubExpiry ? 'EXPIRY' : tag}</div>
          </div>
        `;
      }

      const todayDateObj = new Date();
      const subEndDateObj = parseLocalDateKey(settings.subEndDate || "2026-08-31");
      const subDaysRemaining = Math.max(0, Math.ceil((subEndDateObj.getTime() - todayDateObj.getTime()) / (1000 * 60 * 60 * 24)));

      paneCalendar.innerHTML = `
        <div class="soma-card" style="margin-bottom:12px; border-color:${subDaysRemaining <= 5 ? 'var(--soma-danger)' : 'rgba(255,255,255,0.1)'};">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.68rem; font-weight:800; color:${subDaysRemaining <= 5 ? 'var(--soma-danger)' : 'var(--soma-info)'}; text-transform:uppercase;">💳 Gym Membership Access</div>
              <div style="font-size:0.95rem; font-weight:900; color:var(--soma-text); margin-top:2px;">
                ${subDaysRemaining > 0 ? `${subDaysRemaining} Days Remaining (Ends ${settings.subEndDate})` : `⚠️ Subscription Expired on ${settings.subEndDate}`}
              </div>
            </div>
            <button class="soma-btn" data-action="edit-subscription" style="font-size:0.72rem; padding:4px 10px;">⚙️ Manage</button>
          </div>
          
          <div id="sub-edit-drawer" style="display:none; margin-top:10px; border-top:1px solid rgba(255,255,255,0.08); padding-top:10px;">
            <div style="font-size:0.75rem; font-weight:800; color:var(--soma-text-dim); margin-bottom:6px;">Set Subscription Period:</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
              <button class="soma-btn" data-action="set-sub-days" data-days="15">15 Days</button>
              <button class="soma-btn" data-action="set-sub-days" data-days="30">30 Days</button>
              <button class="soma-btn" data-action="set-sub-days" data-days="60">60 Days</button>
              <button class="soma-btn" data-action="set-sub-days" data-days="90">90 Days</button>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span style="font-size:0.72rem; color:var(--soma-text-dim);">Or Direct End Date:</span>
              <input type="date" class="soma-input" id="input-sub-end-date" value="${settings.subEndDate}" style="height:32px; width:150px; font-size:0.75rem;" />
              <button class="soma-btn soma-btn-accent" data-action="save-sub-end-date" style="padding:6px 12px; font-size:0.72rem;">Save</button>
            </div>
          </div>
        </div>

        <div class="soma-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:8px;">
            <div style="font-size:1.05rem; font-weight:800; color:var(--soma-text);">📅 Periodization Timeline</div>
            <span class="soma-tag soma-tag-emerald">${sampleProg.phase}</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <button class="soma-btn" data-action="cal-prev" style="padding:6px 12px; font-size:0.75rem;">◀ Prev</button>
            <div style="font-size:0.95rem; font-weight:800; color:var(--soma-text);">${monthNames[month]} ${year}</div>
            <button class="soma-btn" data-action="cal-next" style="padding:6px 12px; font-size:0.75rem;">Next ▶</button>
          </div>

          <div class="soma-cal-summary-strip">
            <div>Logged: <b style="color:var(--soma-accent-text);">${mLoggedCount} Sessions</b></div>
            <div>Vol: <b style="color:var(--soma-text);">${mTotalVol.toLocaleString()} ${settings.unit}</b></div>
            <div>Rest: <b style="color:var(--soma-text-dim);">${mRestCount} Days</b></div>
          </div>

          <div class="soma-cal-grid">${gridHtml}</div>
          <div id="soma-cal-detail" style="display:none; margin-top:14px;"></div>
        </div>
      `;
    };

    // ========================================================================
    // VIEW 4: PR DIRECTORY WITH MUSCLE FILTER
    // ========================================================================
    // Renders into any container. Defaults to its own pane for the all-in-one
    // widget; the workout widget passes a sub-container of the Insights tab.
    // The last container is remembered so argument-less re-renders after an
    // action redraw in place rather than silently doing nothing.
    let pendingSleepQuality = null;
    let lastPrsTarget = null;
    const renderPrsView = (target = lastPrsTarget || panePrs) => {
      if (!target) return;
      lastPrsTarget = target;
      const prs = [];
      for (const ex of exerciseDB) {
        let maxWeight = 0, maxRepsAtWeight = 0, max1RM = 0, best1RMDate = "", lastSessionDate = "";
        for (const [dateKey, session] of Object.entries(history)) {
          for (const sex of session.exercises || []) {
            if (sex.name.toLowerCase() === ex.name.toLowerCase()) {
              lastSessionDate = dateKey;
              for (const s of sex.sets || []) {
                if (s.done) {
                  const rawW = parseFloat(s.weight) || 0;
                  const w = (sex.usesBar && rawW > 0) ? (sex.barWeight || settings.barWeight) + rawW : rawW;
                  const r = parseInt(s.reps) || 0;
                  if (w > maxWeight) { maxWeight = w; maxRepsAtWeight = r; }
                  const est = SomaIntelligenceEngine.calculate1RM(w, r);
                  if (est > max1RM) { max1RM = est; best1RMDate = dateKey; }
                }
              }
            }
          }
        }
        if (max1RM > 0) {
          const lastSet = this.getLastPerformance(history, ex.name);
          const suggestion = SomaIntelligenceEngine.computeOverloadRecommendation(lastSet, ex.isBW);
          prs.push({ name: ex.name, muscle: ex.muscle, maxWeight, maxRepsAtWeight, max1RM, best1RMDate, lastSessionDate, suggestion });
        }
      }

      const filteredPrs = currentPrFilter === "ALL"
        ? prs
        : prs.filter(p => p.muscle.toLowerCase().includes(currentPrFilter.toLowerCase()));

      filteredPrs.sort((a, b) => b.max1RM - a.max1RM);

      const filterButtons = ["ALL", "CHEST", "BACK", "SHOULDERS", "BICEPS", "TRICEPS", "LEGS"].map(f => `
        <button class="soma-pill-btn ${currentPrFilter === f ? 'active' : ''}" data-action="filter-pr" data-filter="${f}">${f}</button>
      `).join("");

      const prRowsHtml = filteredPrs.length > 0 ? filteredPrs.map(pr => `
        <div class="soma-pr-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-weight:800; font-size:0.95rem; color:var(--soma-text);">${pr.name}</div>
              <div style="font-size:0.72rem; color:var(--soma-text-dim);">${pr.muscle} • Last trained: ${pr.lastSessionDate}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.1rem; font-weight:900; color:var(--soma-accent-text);">${pr.max1RM} ${settings.unit}</div>
              <div style="font-size:0.65rem; color:var(--soma-text-dim); text-transform:uppercase;">All-Time Best Est. 1RM</div>
              <div style="font-size:0.62rem; color:var(--soma-text-faint);">on ${pr.best1RMDate}</div>
            </div>
          </div>
          <div style="font-size:0.72rem; color:var(--soma-text); margin-top:4px;">🏋️ <b>Top Set:</b> ${pr.maxWeight} ${settings.unit} × ${pr.maxRepsAtWeight} reps</div>
          <div style="background:rgba(255,255,255,0.04); border:1px dashed rgba(255,255,255,0.12); border-radius:10px; padding:6px 10px; margin-top:8px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.72rem; color:var(--soma-text);">🎯 <b>Next Target:</b> ${pr.suggestion.note}</span>
            <span class="soma-tag ${pr.suggestion.diffTier.includes('Lvl 1') ? 'soma-tag-emerald' : 'soma-tag-gray'}">${pr.suggestion.diffTier}</span>
          </div>
        </div>
      `).join("") : `<div style="padding:20px; color:var(--soma-text-dim); text-align:center;">No completed sets found for <b>${currentPrFilter}</b>.</div>`;

      target.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>🏆 Hall of Records & Muscle PR Filter</span></div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:14px;">${filterButtons}</div>
          <div>${prRowsHtml}</div>
        </div>
      `;
    };

    // ========================================================================
    // VIEW 5: CREATINE SATURATION & STASH TRACKER
    // ========================================================================
    const computeCreatineMetrics = () => {
      let saturation = 60.0;
      let currentStreak = 0;
      const refDate = parseLocalDateKey(noteDateKey);

      for (let i = 30; i >= 0; i--) {
        const d = new Date(refDate);
        d.setDate(d.getDate() - i);
        const dStr = getLocalDateKey(d);
        const dose = nutritionDB[dStr]?.creatine || 0;

        if (dose > 0) {
          const delta = (dose / 5.0) * (100.0 - saturation) * 0.10;
          saturation = Math.min(100.0, saturation + Math.max(1.4, delta));
        } else if (saturation > 60.0) {
          saturation = Math.max(60.0, saturation - (saturation * 0.015));
        }
      }

      let checkDate = new Date(refDate);
      for (let s = 0; s < 60; s++) {
        const dStr = getLocalDateKey(checkDate);
        const dose = nutritionDB[dStr]?.creatine || 0;
        if (dose > 0) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          if (s === 0) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
          break;
        }
      }

      const remainingStash = Math.max(0, nutritionDB._settings?.creatineStashGrams || 0);
      const daysLeft = Math.floor(remainingStash / 5);
      const finishDate = new Date(refDate);
      finishDate.setDate(finishDate.getDate() + daysLeft);
      const finishFormatted = finishDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return {
        satPct: Math.round(saturation),
        streak: currentStreak,
        todayDose: nutritionDB[noteDateKey]?.creatine || 0,
        stashGrams: remainingStash,
        daysLeft,
        finishFormatted
      };
    };

// ========================================================================
    // VIEW: BODY WEIGHT LOG & TREND
    // ------------------------------------------------------------------------
    // Bodyweight was already being stored per day inside the nutrition file,
    // but the only way to change it was a field buried in the macro diary and
    // there was nowhere to see it move. This is its own tab in the macros
    // widget: log today, see the trend, see the direction of travel.
    // ========================================================================
    const renderWeightView = () => {
      if (!paneWeight) return;

      const unit = settings.unit || "kg";
      const goalWeight = parseFloat(settings.goalWeight) || null;

      // Every day that has a logged weight, oldest first.
      const series = Object.keys(nutritionDB)
        .filter(k => isDateKey(k) && nutritionDB[k] && nutritionDB[k].bodyWeight)
        .sort()
        .map(k => ({ date: k, weight: parseFloat(nutritionDB[k].bodyWeight) }))
        .filter(p => !isNaN(p.weight) && p.weight > 0);

      const todayEntry = nutritionDB[noteDateKey] || {};
      const todayWeight = parseFloat(todayEntry.bodyWeight) || (series.length ? series[series.length - 1].weight : 78.5);

      const latest = series.length ? series[series.length - 1].weight : null;
      const first = series.length ? series[0].weight : null;
      const totalDelta = (latest !== null && first !== null) ? latest - first : 0;

      // 7-day rolling average smooths out day-to-day water swings, which is
      // the only honest way to read a short weight series.
      const last7 = series.slice(-7);
      const prev7 = series.slice(-14, -7);
      const avg = (arr) => arr.length ? arr.reduce((a, p) => a + p.weight, 0) / arr.length : null;
      const avg7 = avg(last7);
      const avgPrev7 = avg(prev7);
      const weeklyDelta = (avg7 !== null && avgPrev7 !== null) ? avg7 - avgPrev7 : null;

      const fmt = (n, digits = 1) => (n === null || isNaN(n)) ? "—" : n.toFixed(digits);
      const signed = (n, digits = 1) => {
        if (n === null || isNaN(n)) return "—";
        const s = n > 0 ? "+" : "";
        return s + n.toFixed(digits);
      };
      const deltaColor = (n) => {
        if (n === null || isNaN(n) || Math.abs(n) < 0.05) return "var(--soma-text-dim)";
        return n > 0 ? "var(--soma-warn)" : "var(--soma-accent-text)";
      };

      // Sparkline over the last 30 logged points.
      const pts = series.slice(-30);
      let chartSvg = `<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:18px 0; text-align:center;">Log your weight on a few days and the trend line appears here.</div>`;
      if (pts.length >= 2) {
        const W = 320, H = 110, PAD = 8;
        const ws = pts.map(p => p.weight);
        let lo = Math.min(...ws), hi = Math.max(...ws);
        if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
        const x = (i) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
        const y = (w) => PAD + (H - PAD * 2) * (1 - (w - lo) / (hi - lo));
        const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.weight).toFixed(1)}`).join(" ");
        const area = `${line} L ${x(pts.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`;
        const dots = pts.map((p, i) =>
          `<circle cx="${x(i).toFixed(1)}" cy="${y(p.weight).toFixed(1)}" r="${i === pts.length - 1 ? 3.5 : 1.8}" fill="${i === pts.length - 1 ? "var(--soma-accent-text)" : "var(--soma-text-faint)"}" />`
        ).join("");
        chartSvg = `
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:120px; display:block;">
            <defs>
              <linearGradient id="wt-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--soma-accent)" stop-opacity="0.28" />
                <stop offset="100%" stop-color="var(--soma-accent)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d="${area}" fill="url(#wt-grad)" />
            <path d="${line}" fill="none" stroke="var(--soma-accent-text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            ${dots}
          </svg>
          <div style="display:flex; justify-content:space-between; font-size:0.62rem; color:var(--soma-text-faint); margin-top:2px;">
            <span>${pts[0].date}</span><span>${fmt(lo)}–${fmt(hi)} ${unit}</span><span>${pts[pts.length - 1].date}</span>
          </div>
        `;
      }

      const goalRow = goalWeight ? `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,0.1);">
          <span style="font-size:0.75rem; color:var(--soma-text-dim);">🎯 Goal</span>
          <span style="font-size:0.8rem; font-weight:800; color:var(--soma-text);">
            ${fmt(goalWeight)} ${unit}
            <span style="color:${deltaColor(latest - goalWeight)}; font-weight:700; margin-left:6px;">${signed(latest !== null ? latest - goalWeight : null)} to go</span>
          </span>
        </div>` : "";

      const recentRows = series.slice(-10).reverse().map((p, idx, arr) => {
        const prev = arr[idx + 1];
        const d = prev ? p.weight - prev.weight : null;
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.78rem;">
            <span style="color:${p.date === noteDateKey ? "var(--soma-accent-text)" : "var(--soma-text-dim)"}; font-weight:${p.date === noteDateKey ? "800" : "600"};">${p.date}${p.date === noteDateKey ? " • today" : ""}</span>
            <span style="display:flex; gap:10px; align-items:center;">
              <b style="color:var(--soma-text);">${fmt(p.weight)} ${unit}</b>
              <span style="color:${deltaColor(d)}; font-size:0.7rem; min-width:44px; text-align:right;">${d === null ? "" : signed(d)}</span>
            </span>
          </div>`;
      }).join("") || `<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:10px 0;">No entries yet.</div>`;

      paneWeight.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>⚖️ Log Today's Weight</span></div>
          <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-bottom:8px;">Weigh in at the same time each day — first thing, after the bathroom, before food — or the numbers fight you.</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="soma-btn" data-action="weight-step" data-delta="-0.1" style="width:44px; flex:none; background:var(--soma-surface-2);">−</button>
            <input type="number" step="0.1" class="soma-input" id="weight-input" value="${fmt(todayWeight)}" style="flex:1; text-align:center; font-size:1.35rem; font-weight:900; padding:10px;" />
            <button class="soma-btn" data-action="weight-step" data-delta="0.1" style="width:44px; flex:none; background:var(--soma-surface-2);">+</button>
          </div>
          <button class="soma-btn" data-action="save-weight" style="width:100%; margin-top:10px; background:var(--soma-accent); border-color:var(--soma-accent-text); color:var(--soma-accent-ink); font-weight:800;">Save for ${noteDateKey}</button>
        </div>

        <div class="soma-card">
          <div class="soma-card-title"><span>📈 Trend</span></div>
          <div class="soma-stats-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:10px;">
            <div class="soma-stat-box"><div class="soma-stat-lbl">Latest</div><div class="soma-stat-val">${fmt(latest)} ${unit}</div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">7-Day Avg</div><div class="soma-stat-val" style="color:var(--soma-accent-text);">${fmt(avg7)}</div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Wk Change</div><div class="soma-stat-val" style="color:${deltaColor(weeklyDelta)};">${signed(weeklyDelta)}</div></div>
          </div>
          ${chartSvg}
          <div style="display:flex; justify-content:space-between; margin-top:10px; font-size:0.75rem;">
            <span style="color:var(--soma-text-dim);">Since first entry</span>
            <span style="color:${deltaColor(totalDelta)}; font-weight:800;">${signed(totalDelta)} ${unit} over ${series.length} entries</span>
          </div>
          ${goalRow}
        </div>

        <div class="soma-card">
          <div class="soma-card-title"><span>🗓️ Recent Entries</span></div>
          ${recentRows}
        </div>
      `;
    };


    // ========================================================================
    // VIEW: INSIGHTS  (PRs + CNS in one tab)
    // ------------------------------------------------------------------------
    // Both halves are the existing renderers pointed at sub-containers, so
    // there is one implementation of each and no risk of the merged tab
    // drifting from the standalone panes in the all-in-one widget.
    // ========================================================================

    // ========================================================================
    // WEEKLY VOLUME vs LANDMARKS
    // ------------------------------------------------------------------------
    // Rendered inside Insights. Working sets per muscle over the last 7 days,
    // judged against MEV / MAV / MRV. Warm-ups and drop sets are excluded by
    // the engine, so these are stimulating sets only.
    // ========================================================================
    const TIER_STYLE = {
      over:    { color: "var(--soma-danger)",      label: "OVER"    },
      under:   { color: "var(--soma-warn)",        label: "UNDER"   },
      none:    { color: "var(--soma-text-faint)",  label: "NONE"    },
      high:    { color: "var(--soma-info)",        label: "HIGH"    },
      optimal: { color: "var(--soma-accent-text)", label: "OPTIMAL" }
    };

    const renderVolumeSection = (target) => {
      if (!target) return;
      const rows = SomaIntelligenceEngine.volumeReport(history, 7);
      const trained = rows.filter(r => r.sets > 0);
      const problems = rows.filter(r => r.tier === "over" || r.tier === "under");

      // Bar is scaled against MRV so every muscle is read on its own terms.
      const barFor = (r) => {
        const max = Math.max(r.mrv, r.sets);
        const pct = (v) => Math.min(100, (v / max) * 100);
        const st = TIER_STYLE[r.tier] || TIER_STYLE.none;
        return `
          <div class="soma-vol-bar">
            <div class="soma-vol-fill" style="width:${pct(r.sets)}%; background:${st.color};"></div>
            <div class="soma-vol-tick" style="left:${pct(r.mev)}%;" title="MEV ${r.mev}"></div>
            <div class="soma-vol-tick" style="left:${pct(r.mav)}%;" title="MAV ${r.mav}"></div>
            <div class="soma-vol-tick is-mrv" style="left:${pct(r.mrv)}%;" title="MRV ${r.mrv}"></div>
          </div>`;
      };

      const rowHtml = rows.map(r => {
        const st = TIER_STYLE[r.tier] || TIER_STYLE.none;
        return `
          <div class="soma-vol-row">
            <div class="soma-vol-head">
              <span class="soma-vol-name">${r.label}</span>
              <span class="soma-vol-count" style="color:${st.color};">${r.sets}<span class="soma-vol-unit"> sets</span></span>
            </div>
            ${barFor(r)}
            <div class="soma-vol-note">${r.note}</div>
          </div>`;
      }).join("");

      target.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>📊 Weekly Volume</span></div>
          <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-bottom:10px;">
            Working sets per muscle, last 7 days. Warm-ups and drop sets excluded.
            Ticks mark <b>MEV</b> (minimum to grow), <b>MAV</b> (productive band) and <b>MRV</b> (recoverable ceiling).
          </div>
          <div class="soma-stats-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:4px;">
            <div class="soma-stat-box"><div class="soma-stat-lbl">Muscles Hit</div><div class="soma-stat-val">${trained.length}</div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Total Sets</div><div class="soma-stat-val">${rows.reduce((a, r) => a + r.sets, 0)}</div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Needs Fixing</div><div class="soma-stat-val" style="color:${problems.length ? 'var(--soma-warn)' : 'var(--soma-accent-text)'};">${problems.length}</div></div>
          </div>
        </div>

        <div class="soma-card">
          ${trained.length === 0
            ? `<div style="color:var(--soma-text-faint); font-size:0.8rem; padding:14px 0; text-align:center;">No working sets logged in the last 7 days.</div>`
            : rowHtml}
        </div>
      `;
    };


    // ========================================================================
    // CONSISTENCY + STRENGTH CHART
    // ========================================================================
    let chartExercise = null;

    const renderConsistencySection = (target) => {
      if (!target) return;
      const c = SomaIntelligenceEngine.computeConsistency(history, {
        sessionsPerWeek: settings.sessionsPerWeek || 4
      });

      const DOW = ["M", "T", "W", "T", "F", "S", "S"];
      const dots = c.weekDays.map((d, i) => `
        <div class="soma-dow">
          <span class="soma-dow-l">${DOW[i]}</span>
          <span class="soma-dow-d ${d.done ? 'is-done' : d.future ? 'is-future' : 'is-miss'}"></span>
        </div>`).join("");

      // Eight-week bar strip, tallest bar = the weekly target.
      const bars = c.weeks.map(w => {
        const pct = Math.min(100, (w.sessions / Math.max(1, c.target)) * 100);
        return `<div class="soma-wk" title="${w.week}: ${w.sessions} session${w.sessions === 1 ? '' : 's'}">
                  <div class="soma-wk-fill ${w.hit ? 'is-hit' : ''}" style="height:${Math.max(6, pct)}%;"></div>
                </div>`;
      }).join("");

      target.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>🔥 Consistency</span></div>
          <div class="soma-stats-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:10px;">
            <div class="soma-stat-box"><div class="soma-stat-lbl">Streak</div><div class="soma-stat-val" style="color:var(--soma-accent-text);">${c.currentStreak}<span style="font-size:0.6rem; color:var(--soma-text-faint);"> wk</span></div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Best</div><div class="soma-stat-val">${c.bestStreak}<span style="font-size:0.6rem; color:var(--soma-text-faint);"> wk</span></div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Adherence</div><div class="soma-stat-val">${c.adherence}%</div></div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:var(--soma-text-dim); margin-bottom:6px;">
            <span>This week</span><b style="color:var(--soma-text);">${c.thisWeek} / ${c.target}</b>
          </div>
          <div class="soma-dow-row">${dots}</div>
          <div style="font-size:0.62rem; color:var(--soma-text-faint); text-transform:uppercase; letter-spacing:0.07em; margin:12px 0 5px 0;">Last 8 weeks</div>
          <div class="soma-wk-row">${bars}</div>
        </div>`;
    };

    const renderStrengthChart = (target) => {
      if (!target) return;
      const names = SomaIntelligenceEngine.loggedExerciseNames(history);
      if (!names.length) {
        target.innerHTML = `<div class="soma-card"><div class="soma-card-title"><span>📈 Strength</span></div>
          <div style="color:var(--soma-text-faint); font-size:0.78rem; padding:12px 0; text-align:center;">Log a workout and your 1RM trend appears here.</div></div>`;
        return;
      }
      if (!chartExercise || !names.includes(chartExercise)) chartExercise = names[0];

      const pts = SomaIntelligenceEngine.strengthSeries(history, chartExercise);
      const opts = names.map(n => `<option value="${n}" ${n === chartExercise ? "selected" : ""}>${n}</option>`).join("");

      let body;
      if (pts.length < 2) {
        body = `<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:14px 0; text-align:center;">
                  Only ${pts.length} session logged for this lift — two are needed to draw a trend.</div>`;
      } else {
        const W = 320, H = 120, PAD = 10;
        const vals = pts.map(p => p.est1RM);
        let lo = Math.min(...vals), hi = Math.max(...vals);
        if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
        const x = i => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
        const y = v => PAD + (H - PAD * 2) * (1 - (v - lo) / (hi - lo));
        const line = pts.map((p, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(p.est1RM).toFixed(1)}`).join(" ");
        const area = `${line} L ${x(pts.length - 1).toFixed(1)} ${H - PAD} L ${x(0).toFixed(1)} ${H - PAD} Z`;
        const dots = pts.map((p, i) => p.isPR
          ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.est1RM).toFixed(1)}" r="4" fill="var(--soma-warn)"><title>PR ${p.date}: ${p.weight}${settings.unit} × ${p.reps} (est ${p.est1RM})</title></circle>`
          : `<circle cx="${x(i).toFixed(1)}" cy="${y(p.est1RM).toFixed(1)}" r="2" fill="var(--soma-accent-text)"><title>${p.date}: ${p.weight}${settings.unit} × ${p.reps} (est ${p.est1RM})</title></circle>`
        ).join("");
        const isReps = pts.every(p => p.metric === "reps");
        const first = pts[0].est1RM, last = pts[pts.length - 1].est1RM;
        const delta = Math.round((last - first) * 10) / 10;

        body = `
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:130px; display:block;">
            <defs><linearGradient id="st-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--soma-accent)" stop-opacity="0.25" />
              <stop offset="100%" stop-color="var(--soma-accent)" stop-opacity="0" />
            </linearGradient></defs>
            <path d="${area}" fill="url(#st-grad)" />
            <path d="${line}" fill="none" stroke="var(--soma-accent-text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            ${dots}
          </svg>
          <div style="display:flex; justify-content:space-between; font-size:0.62rem; color:var(--soma-text-faint); margin-top:2px;">
            <span>${pts[0].date}</span><span>🏆 = PR</span><span>${pts[pts.length - 1].date}</span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:0.75rem;">
            <span style="color:var(--soma-text-dim);">${isReps ? "Best-set reps change" : "Est. 1RM change"}</span>
            <b style="color:${delta >= 0 ? 'var(--soma-accent-text)' : 'var(--soma-warn)'};">${delta > 0 ? "+" : ""}${delta} ${isReps ? "reps" : settings.unit} over ${pts.length} sessions</b>
          </div>`;
      }

      target.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>📈 Strength</span></div>
          <select class="soma-input" id="chart-ex-select" style="margin-bottom:10px;">${opts}</select>
          ${body}
        </div>`;
    };

    const renderInsightsView = () => {
      if (!paneInsights) return;
      paneInsights.innerHTML = `
        <div id="insights-streak"></div>
        <div id="insights-volume" style="margin-top:4px;"></div>
        <div id="insights-strength" style="margin-top:4px;"></div>
        <div id="insights-prs" style="margin-top:4px;"></div>
        <div id="insights-cns" style="margin-top:4px;"></div>
      `;
      renderConsistencySection(paneInsights.querySelector("#insights-streak"));
      renderVolumeSection(paneInsights.querySelector("#insights-volume"));
      renderStrengthChart(paneInsights.querySelector("#insights-strength"));
      renderPrsView(paneInsights.querySelector("#insights-prs"));
      renderRecoveryView(paneInsights.querySelector("#insights-cns"));
    };

    // ========================================================================
    // VIEW: BODY MEASUREMENTS
    // ------------------------------------------------------------------------
    // Circumference tracking alongside weight. Recomposition frequently hides
    // from the scale — waist down while arms hold is progress the weight trend
    // alone reports as "nothing happened".
    // ========================================================================
    const MEASUREMENT_SITES = [
      { key: "neck",     label: "Neck",     icon: "🦒" },
      { key: "chest",    label: "Chest",    icon: "🫁" },
      { key: "waist",    label: "Waist",    icon: "📏" },
      { key: "hips",     label: "Hips",     icon: "🍑" },
      { key: "armL",     label: "Arm (L)",  icon: "💪" },
      { key: "armR",     label: "Arm (R)",  icon: "💪" },
      { key: "thighL",   label: "Thigh (L)",icon: "🦵" },
      { key: "thighR",   label: "Thigh (R)",icon: "🦵" },
      { key: "calf",     label: "Calf",     icon: "🦿" }
    ];

    const renderMeasurementsView = () => {
      if (!paneMeasurements) return;

      const todayEntry = nutritionDB[noteDateKey] || {};
      const todayM = todayEntry.measurements || {};

      // Every day that recorded at least one site, oldest first.
      const history = Object.keys(nutritionDB)
        .filter(k => isDateKey(k) && nutritionDB[k] && nutritionDB[k].measurements)
        .sort()
        .map(k => ({ date: k, m: nutritionDB[k].measurements }))
        .filter(e => Object.values(e.m).some(v => parseFloat(v) > 0));

      const lastLogged = (key) => {
        for (let i = history.length - 1; i >= 0; i--) {
          const v = parseFloat(history[i].m[key]);
          if (!isNaN(v) && v > 0) return { value: v, date: history[i].date };
        }
        return null;
      };

      // Change versus the previous distinct entry for that site.
      const changeFor = (key) => {
        const seen = [];
        for (const e of history) {
          const v = parseFloat(e.m[key]);
          if (!isNaN(v) && v > 0) seen.push(v);
        }
        if (seen.length < 2) return null;
        return seen[seen.length - 1] - seen[seen.length - 2];
      };

      const signed = (n) => (n === null || isNaN(n)) ? "" : (n > 0 ? "+" : "") + n.toFixed(1);
      // Waist and hips going down is progress; limbs going up is progress.
      const changeColor = (key, n) => {
        if (n === null || isNaN(n) || Math.abs(n) < 0.05) return "var(--soma-text-faint)";
        const smallerIsBetter = key === "waist" || key === "hips";
        const good = smallerIsBetter ? n < 0 : n > 0;
        return good ? "var(--soma-accent-text)" : "var(--soma-warn)";
      };

      const rows = MEASUREMENT_SITES.map(site => {
        const last = lastLogged(site.key);
        const delta = changeFor(site.key);
        const val = todayM[site.key] !== undefined && todayM[site.key] !== ""
          ? todayM[site.key]
          : (last ? last.value : "");
        return `
          <div style="display:grid; grid-template-columns: 1.3fr 1fr 58px; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid var(--soma-border);">
            <span style="font-size:0.78rem; color:var(--soma-text-dim); font-weight:600;">${site.icon} ${site.label}</span>
            <input type="number" step="0.1" class="soma-input measure-input" data-site="${site.key}"
                   value="${val}" placeholder="—" style="padding:7px; text-align:center; font-weight:700;" />
            <span style="font-size:0.7rem; font-weight:800; text-align:right; color:${changeColor(site.key, delta)};">${signed(delta)}</span>
          </div>`;
      }).join("");

      const recent = history.slice(-6).reverse().map(e => {
        const filled = MEASUREMENT_SITES
          .filter(s => parseFloat(e.m[s.key]) > 0)
          .map(s => `${s.label} ${parseFloat(e.m[s.key]).toFixed(1)}`)
          .join(" · ");
        return `
          <div style="padding:7px 0; border-bottom:1px solid var(--soma-border); font-size:0.74rem;">
            <div style="color:${e.date === noteDateKey ? "var(--soma-accent-text)" : "var(--soma-text-dim)"}; font-weight:800;">${e.date}${e.date === noteDateKey ? " • today" : ""}</div>
            <div style="color:var(--soma-text-faint); margin-top:2px;">${filled || "—"}</div>
          </div>`;
      }).join("") || `<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:10px 0;">Nothing logged yet.</div>`;

      paneMeasurements.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>📐 Measurements</span></div>
          <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-bottom:10px;">
            Measure cold, first thing, same spot each time. Weekly is plenty — daily noise will only annoy you.
            Change shown is against your previous entry.
          </div>
          <div style="display:grid; grid-template-columns: 1.3fr 1fr 58px; gap:8px; padding-bottom:6px; border-bottom:1px solid var(--soma-border);">
            <span class="soma-stat-lbl">SITE</span>
            <span class="soma-stat-lbl" style="text-align:center;">CM</span>
            <span class="soma-stat-lbl" style="text-align:right;">CHG</span>
          </div>
          ${rows}
          <button class="soma-btn soma-btn-accent" data-action="save-measurements" style="width:100%; margin-top:12px; padding:11px;">Save for ${noteDateKey}</button>
        </div>

        <div class="soma-card">
          <div class="soma-card-title"><span>🗓️ Recent</span></div>
          ${recent}
        </div>
      `;
    };

    // ========================================================================
    // VIEW: SLEEP
    // ------------------------------------------------------------------------
    // Hours plus a 1-5 quality rating. Stored per day in the nutrition file
    // beside weight, so the pre-workout readiness check can read it without
    // asking you the same question twice.
    // ========================================================================
    const renderSleepView = () => {
      if (!paneSleep) return;

      const todayEntry = nutritionDB[noteDateKey] || {};
      const todaySleep = todayEntry.sleep || {};
      const hours = todaySleep.hours !== undefined ? todaySleep.hours : "";
      const quality = parseInt(todaySleep.quality) || 3;

      const series = Object.keys(nutritionDB)
        .filter(k => isDateKey(k) && nutritionDB[k] && nutritionDB[k].sleep && parseFloat(nutritionDB[k].sleep.hours) > 0)
        .sort()
        .map(k => ({ date: k, hours: parseFloat(nutritionDB[k].sleep.hours), quality: parseInt(nutritionDB[k].sleep.quality) || 3 }));

      const avg = (arr, f) => arr.length ? arr.reduce((a, p) => a + f(p), 0) / arr.length : null;
      const last7 = series.slice(-7);
      const avg7 = avg(last7, p => p.hours);
      const avgQ7 = avg(last7, p => p.quality);
      const debt = avg7 !== null ? (8 - avg7) * 7 : null;

      const fmt = (n, d = 1) => (n === null || isNaN(n)) ? "—" : n.toFixed(d);

      let chart = `<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:18px 0; text-align:center;">Log a few nights and the trend appears here.</div>`;
      if (series.length >= 2) {
        const pts = series.slice(-30);
        const W = 320, H = 110, PAD = 8;
        const hi = Math.max(10, Math.max(...pts.map(p => p.hours)));
        const lo = Math.min(4, Math.min(...pts.map(p => p.hours)));
        const x = (i) => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
        const y = (h) => PAD + (H - PAD * 2) * (1 - (h - lo) / (hi - lo));
        const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.hours).toFixed(1)}`).join(" ");
        // 8-hour reference line, so the trend has something to be judged against.
        const eightY = y(8).toFixed(1);
        const dots = pts.map((p, i) =>
          `<circle cx="${x(i).toFixed(1)}" cy="${y(p.hours).toFixed(1)}" r="${i === pts.length - 1 ? 3.5 : 1.8}" fill="${p.hours >= 7 ? "var(--soma-accent-text)" : "var(--soma-warn)"}" />`
        ).join("");
        chart = `
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%; height:120px; display:block;">
            <line x1="${PAD}" y1="${eightY}" x2="${W - PAD}" y2="${eightY}" stroke="var(--soma-border-strong)" stroke-width="1" stroke-dasharray="3 3" />
            <path d="${line}" fill="none" stroke="var(--soma-accent-text)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            ${dots}
          </svg>
          <div style="display:flex; justify-content:space-between; font-size:0.62rem; color:var(--soma-text-faint); margin-top:2px;">
            <span>${pts[0].date}</span><span>dashed = 8h</span><span>${pts[pts.length - 1].date}</span>
          </div>`;
      }

      const stars = [1, 2, 3, 4, 5].map(n =>
        `<button class="soma-quality-dot ${n <= quality ? 'active' : ''}" data-action="set-sleep-quality" data-q="${n}" title="${n}/5">${n <= quality ? "●" : "○"}</button>`
      ).join("");

      const recent = series.slice(-10).reverse().map(p => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid var(--soma-border); font-size:0.78rem;">
          <span style="color:${p.date === noteDateKey ? "var(--soma-accent-text)" : "var(--soma-text-dim)"}; font-weight:${p.date === noteDateKey ? "800" : "600"};">${p.date}${p.date === noteDateKey ? " • today" : ""}</span>
          <span style="display:flex; gap:12px; align-items:center;">
            <b style="color:${p.hours >= 7 ? "var(--soma-text)" : "var(--soma-warn)"};">${fmt(p.hours)} h</b>
            <span style="color:var(--soma-text-faint); font-size:0.7rem;">${"●".repeat(p.quality)}${"○".repeat(5 - p.quality)}</span>
          </span>
        </div>`).join("") || `<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:10px 0;">No entries yet.</div>`;

      paneSleep.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>😴 Last Night</span></div>
          <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-bottom:10px;">Time actually asleep, not time in bed.</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="soma-btn" data-action="sleep-step" data-delta="-0.25" style="width:44px; flex:none;">−</button>
            <input type="number" step="0.25" class="soma-input" id="sleep-input" value="${hours}" placeholder="7.5"
                   style="flex:1; text-align:center; font-size:1.35rem; font-weight:900; padding:10px;" />
            <button class="soma-btn" data-action="sleep-step" data-delta="0.25" style="width:44px; flex:none;">+</button>
          </div>
          <div class="soma-field-lbl" style="margin-top:12px;">Quality</div>
          <div class="soma-quality-row">${stars}</div>
          <button class="soma-btn soma-btn-accent" data-action="save-sleep" style="width:100%; margin-top:12px; padding:11px;">Save for ${noteDateKey}</button>
        </div>

        <div class="soma-card">
          <div class="soma-card-title"><span>📈 Trend</span></div>
          <div class="soma-stats-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:10px;">
            <div class="soma-stat-box"><div class="soma-stat-lbl">7-Night Avg</div><div class="soma-stat-val">${fmt(avg7)} h</div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Avg Quality</div><div class="soma-stat-val" style="color:var(--soma-accent-text);">${fmt(avgQ7)}</div></div>
            <div class="soma-stat-box"><div class="soma-stat-lbl">Weekly Debt</div><div class="soma-stat-val" style="color:${debt !== null && debt > 3 ? 'var(--soma-warn)' : 'var(--soma-text)'};">${debt === null ? "—" : (debt > 0 ? fmt(debt) + "h" : "0h")}</div></div>
          </div>
          ${chart}
        </div>

        <div class="soma-card">
          <div class="soma-card-title"><span>🗓️ Recent Nights</span></div>
          ${recent}
        </div>
      `;
    };

    const renderCreatineView = () => {
      if (!paneCreatine) return;
      const { satPct, streak, todayDose, stashGrams, daysLeft, finishFormatted } = computeCreatineMetrics();
      const isSaturated = satPct >= 95;
      const themeColor = satPct >= 95 ? "var(--soma-accent)" : satPct >= 80 ? "#34d399" : "var(--soma-warn)";

      paneCreatine.innerHTML = `
        <div class="soma-card ${isSaturated ? 'soma-card-emerald-glow' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.05rem; font-weight:900; color:var(--soma-text);">⚡ Creatine Monohydrate Saturation</span>
              ${streak > 0 ? `<span class="soma-tag" style="background:rgba(245,158,11,0.15); border:1px solid var(--soma-warn); color:var(--soma-warn);">🔥 ${streak}d Streak</span>` : ''}
            </div>
            <span style="font-size:0.85rem; font-weight:800; color:${themeColor};">${satPct}% • ${isSaturated ? 'Saturated' : 'Building'}</span>
          </div>

          <div class="soma-bar-wrap" style="height:10px; margin-bottom:12px;">
            <div class="soma-bar-fill" style="width:${satPct}%; background:${themeColor};"></div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.08); flex-wrap:wrap; gap:8px;">
            <div style="font-size:0.75rem; color:var(--soma-text-dim);">
              Home Tub Stash: <b style="color:var(--soma-text);">${stashGrams}g left</b> (${daysLeft}d supply remaining)
            </div>
            <span style="font-size:0.75rem; color:var(--soma-warn); font-weight:800;">
              ${stashGrams > 0 ? `Depletion ~ ${finishFormatted}` : '⚠️ Tub is Empty'}
            </span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; flex-wrap:wrap; gap:10px;">
            <span style="font-size:0.75rem; color:var(--soma-text-dim);">Intracellular Hydration • 5g Maintenance</span>
            <div style="display:flex; gap:8px; align-items:center;">
              <span style="font-size:0.82rem; font-weight:800; color:var(--soma-text); margin-right:4px;">Today: <b>${todayDose}g</b></span>
              <button class="soma-btn" data-action="add-creatine-dose" data-grams="3">+3g</button>
              <button class="soma-btn soma-btn-save" data-action="add-creatine-dose" data-grams="5">+5g</button>
              <button class="soma-btn" data-action="reset-creatine-today">↺ Reset</button>
            </div>
          </div>
        </div>
      `;
    };

    // ========================================================================
    // VIEW 6: BALANCE & CNS SPINAL FATIGUE
    // ========================================================================
    let lastRecoveryTarget = null;
    const renderRecoveryView = (target = lastRecoveryTarget || paneRecovery) => {
      if (!target) return;
      lastRecoveryTarget = target;
      const fourteenDaysAgo = Date.now() - (14 * 86400000);
      let rollingAxialVol = 0, rollingTotalVol = 0, pushVol = 0, pullVol = 0, legVol = 0;
      let latestSession = null;

      for (const session of Object.values(history)) {
        const t = session.timestamp || 0;
        if (t >= fourteenDaysAgo) {
          rollingTotalVol += (session.totalVol || 0);
          rollingAxialVol += (session.axialVol || 0);
          const split = (session.split || "").toLowerCase();
          if (split.includes("push") || split.includes("upper")) pushVol += (session.totalVol || 0);
          else if (split.includes("pull")) pullVol += (session.totalVol || 0);
          else if (split.includes("leg") || split.includes("lower")) legVol += (session.totalVol || 0);
        }
        if (!latestSession || t > (latestSession.timestamp || 0)) latestSession = session;
      }

      const totalPPL = (pushVol + pullVol + legVol) || 1;
      const pushPct = Math.round((pushVol / totalPPL) * 100);
      const pullPct = Math.round((pullVol / totalPPL) * 100);
      const legPct = Math.round((legVol / totalPPL) * 100);
      const axialRatio = Math.round((rollingAxialVol / (rollingTotalVol || 1)) * 100);
      const needsDeload = axialRatio > 40 && rollingAxialVol > 12000;

      target.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>⚡ Systemic Nervous System & Axial Index</span></div>
          <div style="background:var(--soma-surface); border:1px solid ${needsDeload ? 'var(--soma-danger)' : 'rgba(255,255,255,0.08)'}; border-radius:14px; padding:14px;">
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:800; margin-bottom:6px;">
              <span>14-Day Spinal Axial Stress</span>
              <span style="color:${needsDeload ? 'var(--soma-danger)' : 'var(--soma-accent-text)'};">${axialRatio}% Ratio (${rollingAxialVol.toLocaleString()} ${settings.unit})</span>
            </div>
            <div class="soma-bar-wrap">
              <div class="soma-bar-fill" style="width:${Math.min(100, axialRatio * 2)}%; background:${needsDeload ? 'var(--soma-danger)' : 'var(--soma-accent)'};"></div>
            </div>
            ${needsDeload ? `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:1px dashed rgba(239,68,68,0.3);">
                <span style="font-size:0.75rem; color:#fca5a5;">High axial stress detected — consider a deload week.</span>
                <button class="soma-btn" data-action="apply-deload-week" style="background:var(--soma-danger); border-color:var(--soma-danger); color:var(--soma-text);">Apply Deload Week</button>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="soma-card">
          <div class="soma-card-title"><span>⚖️ Push / Pull / Leg Structural Balance</span></div>
          <div style="display:flex; height:14px; border-radius:6px; overflow:hidden; margin:8px 0;">
            <div style="width:${pushPct}%; background:var(--soma-text);"></div>
            <div style="width:${pullPct}%; background:var(--soma-accent);"></div>
            <div style="width:${legPct}%; background:var(--soma-warn);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:800;">
            <span style="color:var(--soma-text);">Push: ${pushPct}%</span>
            <span style="color:var(--soma-accent-text);">Pull: ${pullPct}%</span>
            <span style="color:var(--soma-warn);">Legs: ${legPct}%</span>
          </div>
        </div>
      `;

      target.querySelector('[data-action="apply-deload-week"]')?.addEventListener("click", async () => {
        const overrides = settings.scheduleOverrides || {};
        const start = parseLocalDateKey(noteDateKey);
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          const key = getLocalDateKey(d);
          const proj = SomaIntelligenceEngine.getProgramProjectedDay(d, {});
          overrides[key] = proj.isRest ? "Rest Day" : `${proj.split} (Deload)`;
        }
        await saveSettings({ scheduleOverrides: overrides });
        new Notice("Deload week applied to the next 7 days.");
        renderRecoveryView();
      });
    };

    // ========================================================================
    // VIEW 7: SETTINGS & CONFIGURATION
    // ========================================================================
    // Which routine is open in the editor, or null for the list view.
    let editingRoutine = null;

    const routineEditorHtml = () => {
      const all = routines();
      const custom = settings.customRoutines || {};

      if (editingRoutine === null) {
        const rows = Object.keys(all).map(name => {
          const n = (all[name] || []).length;
          const edited = Object.prototype.hasOwnProperty.call(custom, name);
          return `
            <div class="soma-rt-row">
              <div class="soma-rt-info">
                <span class="soma-rt-name">${name}</span>
                <span class="soma-rt-count">${n} exercise${n === 1 ? "" : "s"}${edited ? " · edited" : ""}</span>
              </div>
              <div class="soma-rt-actions">
                <button class="soma-btn" data-action="rt-edit" data-name="${name}">✎</button>
                <button class="soma-btn soma-rt-del" data-action="rt-delete" data-name="${name}">🗑</button>
              </div>
            </div>`;
        }).join("");

        return `
          <div class="soma-card">
            <div class="soma-card-title">
              <span>📋 Routines</span>
              <button class="soma-btn soma-btn-accent" data-action="rt-new" style="padding:4px 12px; font-size:0.7rem;">+ New</button>
            </div>
            <div style="font-size:0.68rem; color:var(--soma-text-dim); margin-bottom:8px;">
              Saved to your vault, not the plugin — updates will not overwrite them.
            </div>
            ${rows || '<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:10px 0;">No routines yet.</div>'}
          </div>`;
      }

      // --- editing one routine ---
      const list = SomaIntelligenceEngine.normalizeRoutine(all[editingRoutine] || []);
      const items = list.map((it, i) => `
        <div class="soma-rt-item">
          <span class="soma-rt-item-name">${it.name}</span>
          <span class="soma-rt-item-btns">
            <button class="soma-btn" data-action="rt-move" data-i="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="soma-btn" data-action="rt-move" data-i="${i}" data-dir="1" ${i === list.length - 1 ? "disabled" : ""}>↓</button>
            <button class="soma-btn soma-rt-del" data-action="rt-remove-ex" data-i="${i}">✕</button>
          </span>
        </div>`).join("");

      const options = exerciseDB
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b))
        .map(n => `<option value="${n}"></option>`).join("");

      return `
        <div class="soma-card">
          <div class="soma-card-title">
            <span>✎ Editing Routine</span>
            <button class="soma-btn" data-action="rt-back" style="padding:4px 12px; font-size:0.7rem;">← Back</button>
          </div>
          <div class="soma-field-lbl">Name</div>
          <input type="text" class="soma-input" id="rt-name" value="${editingRoutine}" style="margin-bottom:10px;" />

          <div class="soma-field-lbl">Exercises (${list.length})</div>
          <div style="margin-bottom:8px;">
            ${items || '<div style="color:var(--soma-text-faint); font-size:0.78rem; padding:8px 0;">Nothing added yet.</div>'}
          </div>

          <div style="display:flex; gap:6px; margin-bottom:10px;">
            <input type="text" class="soma-input" id="rt-add" list="rt-ex-list" placeholder="Add an exercise…" style="flex:1;" />
            <datalist id="rt-ex-list">${options}</datalist>
            <button class="soma-btn" data-action="rt-add-ex" style="width:52px;">+</button>
          </div>

          <button class="soma-btn soma-btn-accent" data-action="rt-save" style="width:100%; padding:11px;">Save Routine</button>
        </div>`;
    };

    const renderSettingsView = () => {
      if (!paneSettings) return;
      const appearanceOnly = profile.id === "habits";
      paneSettings.innerHTML = `
        <div class="soma-card">
          <div class="soma-card-title"><span>🎨 Appearance</span></div>

          <div class="soma-field-lbl">Theme</div>
          <div class="soma-theme-row">
            <button class="soma-theme-btn ${settings.theme === 'dark' ? 'active' : ''}" data-action="set-theme" data-theme="dark">🌙 Dark</button>
            <button class="soma-theme-btn ${settings.theme === 'light' ? 'active' : ''}" data-action="set-theme" data-theme="light">☀️ Light</button>
            <button class="soma-theme-btn ${settings.theme === 'system' ? 'active' : ''}" data-action="set-theme" data-theme="system">🖥️ Auto</button>
          </div>
          <div style="font-size:0.66rem; color:var(--soma-text-faint); margin:-4px 0 14px 0;">Auto follows whatever light/dark theme Obsidian is set to.</div>

          <div class="soma-field-lbl">Accent Colour</div>
          <div class="soma-swatch-grid">
            ${ACCENT_PRESETS.map(p => `
              <div class="soma-swatch ${String(settings.accent).toLowerCase() === p.color.toLowerCase() ? 'active' : ''}"
                   data-action="set-accent" data-color="${p.color}" title="${p.label}"
                   style="background:${p.color};"></div>
            `).join("")}
          </div>
          <div class="soma-accent-custom">
            <input type="color" id="cfg-accent-custom" value="${normalizeAccent(settings.accent)}" />
            <span style="font-size:0.7rem; color:var(--soma-text-dim);">Or pick any colour — applies instantly.</span>
          </div>
        </div>

        ${(appearanceOnly || profile.id === "macros" || profile.id === "sleep") ? "" : routineEditorHtml()}
        ${appearanceOnly ? "" : `<div class="soma-card">
          <div class="soma-card-title"><span>⚙️ System Preferences</span></div>
          
          <div style="margin-bottom:12px;">
            <div class="soma-field-lbl">Weight Unit</div>
            <select class="soma-input" id="cfg-unit">
              <option value="kg" ${settings.unit === 'kg' ? 'selected' : ''}>Kilograms (kg)</option>
              <option value="lbs" ${settings.unit === 'lbs' ? 'selected' : ''}>Pounds (lbs)</option>
            </select>
          </div>

          <div style="margin-bottom:12px;">
            <div class="soma-field-lbl">Olympic Bar Weight</div>
            <input type="number" class="soma-input" id="cfg-bar" value="${settings.barWeight}" />
          </div>

          <div style="margin-bottom:12px;">
            <div class="soma-field-lbl">Default Rest Duration (Seconds)</div>
            <input type="number" class="soma-input" id="cfg-rest" value="${settings.restDefault}" />
          </div>

          <div style="margin-bottom:12px;">
            <div class="soma-field-lbl">Creatine Tub Stash (Grams)</div>
            <input type="number" class="soma-input" id="cfg-creatine-stash" value="${nutritionDB._settings?.creatineStashGrams || 300}" />
          </div>

          <div style="margin-top:16px;">
            <button class="soma-btn soma-btn-accent" data-action="save-settings-full" style="width:100%; padding:12px;">💾 Save All Preferences</button>
          </div>
        </div>
        `}
      `;
    };

    // ========================================================================
    // EVENT DELEGATION DISPATCHER
    // ========================================================================
    appEl.onclick = async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;

      switch (action) {
        case "open-split-drawer": {
          const sel = paneWorkout.querySelector("#routine-selector");
          if (sel) sel.style.display = sel.style.display === "none" ? "block" : "none";
          break;
        }
        case "cancel-split-drawer": {
          const sel = paneWorkout.querySelector("#routine-selector");
          if (sel) sel.style.display = "none";
          break;
        }
        case "load-selected-split": {
          const splitVal = paneWorkout.querySelector("#split-select")?.value;
          if (splitVal) {
            loadSplitIntoSession(splitVal);
            const sel = paneWorkout.querySelector("#routine-selector");
            if (sel) sel.style.display = "none";
          }
          break;
        }
        case "open-add-drawer": {
          const add = paneWorkout.querySelector("#add-selector");
          if (add) {
            add.style.display = add.style.display === "none" ? "block" : "none";
            const sBox = paneWorkout.querySelector("#search-box");
            if (sBox) { sBox.value = ""; sBox.focus({ preventScroll: true }); }
            const sList = paneWorkout.querySelector("#search-list");
            if (sList) {
              sList.innerHTML = exerciseDB.slice(0, 8).map(ex => `
                <div class="soma-search-item" data-action="select-search-ex" data-name="${ex.name}">
                  <div style="font-weight:700; color:var(--soma-text); font-size:0.85rem;">${ex.name}</div>
                  <div style="font-size:0.72rem; color:var(--soma-text-dim); display:flex; gap:6px; margin-top:2px;">
                    <span>${ex.subTarget}</span> • <span>${ex.tier}</span>
                  </div>
                </div>
              `).join("");
            }
          }
          break;
        }
        case "close-add-drawer": {
          const add = paneWorkout.querySelector("#add-selector");
          if (add) add.style.display = "none";
          break;
        }
        case "select-search-ex": {
          const name = btn.dataset.name;
          if (name) {
            addExerciseToSession(name);
            const add = paneWorkout.querySelector("#add-selector");
            if (add) add.style.display = "none";
          }
          break;
        }
        case "open-custom-modal": {
          const cModal = appEl.querySelector("#custom-ex-modal");
          if (cModal) cModal.style.display = "flex";
          break;
        }
        case "close-custom-modal": {
          const cModal = appEl.querySelector("#custom-ex-modal");
          if (cModal) cModal.style.display = "none";
          break;
        }
        case "submit-custom-movement": {
          const name = appEl.querySelector("#cust-name")?.value.trim();
          const muscle = appEl.querySelector("#cust-muscle")?.value;
          const subTarget = appEl.querySelector("#cust-sub")?.value.trim() || muscle;
          if (name) {
            const newEx = { name, muscle: muscle.toUpperCase(), subTarget, targetKeys: [muscle], position: "Mid-Range", risk: "Low 🟢", tier: "Custom", isAxial: false, isBW: false };
            await saveCustomExercise(newEx);
            addExerciseToSession(newEx.name);
            const cModal = appEl.querySelector("#custom-ex-modal");
            if (cModal) cModal.style.display = "none";
          }
          break;
        }
        case "quick-rest": {
          const secs = parseInt(btn.dataset.seconds) || 90;
          startRestTimer(secs);
          break;
        }
        case "reset-rest": {
          this.untrackInterval(restTimerInterval);
          restSecondsLeft = 0;
          updateRestTimerUI();
          break;
        }
        case "undo-action": {
          if (state.undo()) { renderTracker(); new Notice("Action Undone"); }
          break;
        }
        case "redo-action": {
          if (state.redo()) { renderTracker(); new Notice("Action Redone"); }
          break;
        }
        case "del-set": {
          state.recordSnapshot();
          state.sessionExercises[btn.dataset.ex].sets.splice(btn.dataset.set, 1);
          renderTracker();
          break;
        }
        case "add-set": {
          state.recordSnapshot();
          state.sessionExercises[btn.dataset.ex].sets.push({ weight: "", reps: "", failure: 2, done: false, type: "normal" });
          renderTracker();
          break;
        }
        case "add-drop-set": {
          state.recordSnapshot();
          const exForDrop = state.sessionExercises[btn.dataset.ex];
          const lastSet = exForDrop.sets[exForDrop.sets.length - 1];
          // Drop sets are logged right after a main set at a reduced load —
          // pre-fill ~20% lighter than the last set as a starting point.
          const lastWeight = parseFloat(lastSet?.weight);
          const suggestedWeight = !isNaN(lastWeight) && lastWeight > 0 ? Math.round(lastWeight * 0.8 * 2) / 2 : "";
          exForDrop.sets.push({ weight: suggestedWeight, reps: "", failure: 4, done: false, type: "dropset" });
          renderTracker();
          break;
        }
        case "toggle-set-type": {
          state.recordSnapshot();
          const setForToggle = state.sessionExercises[btn.dataset.ex].sets[btn.dataset.set];
          // normal -> dropset -> warmup -> normal
          const CYCLE = { normal: "dropset", dropset: "warmup", warmup: "normal" };
          setForToggle.type = CYCLE[setForToggle.type] || "dropset";
          renderTracker();
          break;
        }
        case "cycle-superset": {
          state.recordSnapshot();
          const exForSuperset = state.sessionExercises[btn.dataset.ex];
          exForSuperset.supersetGroup = nextSupersetGroup(exForSuperset.supersetGroup);
          renderTracker();
          break;
        }
        case "del-card": {
          state.recordSnapshot();
          state.sessionExercises.splice(btn.dataset.ex, 1);
          renderTracker();
          break;
        }
        case "hm-switch-front": {
          heatmapCurrentView = "front";
          heatmapSelectedKey = null;
          renderHeatmapView();
          break;
        }
        case "hm-switch-back": {
          heatmapCurrentView = "back";
          heatmapSelectedKey = null;
          renderHeatmapView();
          break;
        }
        case "cal-prev": {
          calViewDate.setMonth(calViewDate.getMonth() - 1);
          renderCalendarView();
          break;
        }
        case "cal-next": {
          calViewDate.setMonth(calViewDate.getMonth() + 1);
          renderCalendarView();
          break;
        }
        case "edit-subscription": {
          const drawer = paneCalendar.querySelector("#sub-edit-drawer");
          if (drawer) drawer.style.display = drawer.style.display === "none" ? "block" : "none";
          break;
        }
        case "set-sub-days": {
          const days = parseInt(btn.dataset.days) || 30;
          const endD = new Date();
          endD.setDate(endD.getDate() + days);
          const endStr = getLocalDateKey(endD);
          await saveSettings({ subDurationDays: days, subEndDate: endStr });
          renderCalendarView();
          new Notice(`Subscription updated for ${days} days (Expiry: ${endStr})`);
          break;
        }
        case "save-sub-end-date": {
          const endStr = paneCalendar.querySelector("#input-sub-end-date")?.value;
          if (endStr) {
            await saveSettings({ subEndDate: endStr });
            renderCalendarView();
            new Notice(`Subscription expiry set to ${endStr}`);
          }
          break;
        }
        case "inspect-cal-day": {
          const dateKey = btn.dataset.date;
          const calDetail = paneCalendar.querySelector("#soma-cal-detail");
          if (!dateKey || !calDetail) break;
          const session = history[dateKey];
          const projection = SomaIntelligenceEngine.getProgramProjectedDay(parseLocalDateKey(dateKey), settings.scheduleOverrides || {});
          const optionsHtml = ROTATION_SEQUENCE.map(s => `<option value="${s}" ${projection.split === s ? 'selected' : ''}>${s}</option>`).join("");

          calDetail.innerHTML = `
            <div style="background:var(--soma-surface); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:12px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <span class="soma-tag ${session ? 'soma-tag-emerald' : 'soma-tag-gray'}">${session ? 'Logged Workout' : 'Scheduled Program'}</span>
                  <h3 style="margin:4px 0 0 0; color:var(--soma-text); font-size:1.05rem;">${session ? session.split : projection.split}</h3>
                  <div style="font-size:0.75rem; color:var(--soma-text-dim);">${dateKey}</div>
                </div>
                <button class="soma-btn-del" data-action="close-cal-detail">✕</button>
              </div>
              
              <div style="margin-top:10px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">
                <div style="font-size:0.72rem; color:var(--soma-text-dim); font-weight:800; margin-bottom:4px;">Change / Realign Program for this day:</div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
                  <select class="soma-input" id="cal-override-select" style="font-size:0.75rem; height:34px; flex:1;">${optionsHtml}</select>
                  <button class="soma-btn soma-btn-accent" data-action="save-cal-override" data-date="${dateKey}">Set</button>
                  <button class="soma-btn" data-action="cascade-shift-schedule" data-date="${dateKey}" title="Shift all subsequent days in sequence">⏩ Cascade</button>
                </div>
                <button class="soma-btn" data-action="load-cal-to-workout" data-date="${dateKey}" style="width:100%; background:#2563eb; color:var(--soma-text); font-weight:800;">⚡ Load Split Into Active Workout</button>
              </div>
            </div>
          `;
          calDetail.style.display = "block";
          break;
        }
        case "save-cal-override": {
          const dateKey = btn.dataset.date;
          const overrideVal = paneCalendar.querySelector("#cal-override-select")?.value;
          if (dateKey && overrideVal) {
            const overrides = settings.scheduleOverrides || {};
            overrides[dateKey] = overrideVal;
            await saveSettings({ scheduleOverrides: overrides });

            if (dateKey === noteDateKey) {
              state.activeSplit = overrideVal;
              initWorkoutView();
            }

            renderCalendarView();
            new Notice(`Program for ${dateKey} updated to: ${overrideVal}`);
          }
          break;
        }
        case "cascade-shift-schedule": {
          const dateKey = btn.dataset.date;
          const overrideVal = paneCalendar.querySelector("#cal-override-select")?.value;
          if (!dateKey || !overrideVal) break;

          const startD = parseLocalDateKey(dateKey);
          const overrides = settings.scheduleOverrides || {};
          
          let startIndex = ROTATION_SEQUENCE.indexOf(overrideVal);
          if (startIndex === -1) startIndex = 0;

          for (let i = 0; i < 60; i++) {
            const shiftD = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate() + i, 12, 0, 0);
            const key = getLocalDateKey(shiftD);
            const seqSplit = ROTATION_SEQUENCE[(startIndex + i) % ROTATION_SEQUENCE.length];
            overrides[key] = seqSplit;
          }

          await saveSettings({ scheduleOverrides: overrides });

          const todaySplit = overrides[noteDateKey] || SomaIntelligenceEngine.getProgramProjectedDay(parseLocalDateKey(noteDateKey), overrides).split;
          state.activeSplit = todaySplit;
          initWorkoutView();

          renderCalendarView();
          new Notice(`Cascaded 60-day routine sequence starting from ${dateKey}!`);
          break;
        }
        case "load-cal-to-workout": {
          const dateKey = btn.dataset.date;
          const currentProj = SomaIntelligenceEngine.getProgramProjectedDay(parseLocalDateKey(dateKey), settings.scheduleOverrides || {});
          loadSplitIntoSession(currentProj.split);
          switchDockTab("pane-workout");
          new Notice(`Loaded ${currentProj.split} into active workout!`);
          break;
        }
        case "close-cal-detail": {
          const calDetail = paneCalendar.querySelector("#soma-cal-detail");
          if (calDetail) calDetail.style.display = "none";
          break;
        }
        case "filter-pr": {
          currentPrFilter = btn.dataset.filter;
          renderPrsView();
          break;
        }
        case "weight-step": {
          // Nudge the field without committing — nothing is stored until Save,
          // so a stray tap can't overwrite a real weigh-in.
          const input = paneWeight?.querySelector("#weight-input");
          if (input) {
            const delta = parseFloat(btn.dataset.delta) || 0;
            const next = (parseFloat(input.value) || 0) + delta;
            input.value = (Math.round(next * 10) / 10).toFixed(1);
          }
          break;
        }
        case "save-weight": {
          const input = paneWeight?.querySelector("#weight-input");
          const val = parseFloat(input?.value);
          if (isNaN(val) || val <= 0) {
            new Notice("Enter a valid weight first.");
            break;
          }
          // Written into the same per-day nutrition record the macro diary
          // reads, so the two tabs can never disagree about today's weight.
          if (!nutritionDB[noteDateKey]) nutritionDB[noteDateKey] = {};
          const savedW = Math.round(val * 10) / 10;
          nutritionDB[noteDateKey].bodyWeight = savedW;

          // Protein scales with bodyweight, so a new weigh-in should move the
          // target with it rather than leaving a stale number behind.
          let proteinNote = "";
          if (nutritionDB._settings && nutritionDB._settings.autoProteinTarget) {
            const target = SomaIntelligenceEngine.proteinTargetFor(
              savedW, nutritionDB._settings.proteinPerKg || 2.0
            );
            if (target !== null) {
              if (!nutritionDB[noteDateKey].goals) nutritionDB[noteDateKey].goals = { ...DEFAULT_GOALS };
              nutritionDB[noteDateKey].goals.protein = target;
              proteinNote = " · protein goal " + target + "g";
            }
          }
          await saveNutritionDB();
          new Notice(`Weight saved: ${savedW} ${settings.unit}${proteinNote}`);
          renderWeightView();
          break;
        }
        case "save-measurements": {
          const vals = {};
          paneMeasurements?.querySelectorAll(".measure-input").forEach(inp => {
            const v = parseFloat(inp.value);
            if (!isNaN(v) && v > 0) vals[inp.dataset.site] = Math.round(v * 10) / 10;
          });
          if (Object.keys(vals).length === 0) {
            new Notice("Nothing to save — fill in at least one measurement.");
            break;
          }
          if (!nutritionDB[noteDateKey]) nutritionDB[noteDateKey] = {};
          nutritionDB[noteDateKey].measurements = vals;
          await saveNutritionDB();
          new Notice("Measurements saved for " + noteDateKey + ".");
          renderMeasurementsView();
          break;
        }
        case "sleep-step": {
          const inp = paneSleep?.querySelector("#sleep-input");
          if (inp) {
            const delta = parseFloat(btn.dataset.delta) || 0;
            const next = Math.max(0, (parseFloat(inp.value) || 0) + delta);
            inp.value = (Math.round(next * 4) / 4).toFixed(2).replace(/\.?0+$/, "");
          }
          break;
        }
        case "set-sleep-quality": {
          // Held in the draft record so the dots respond immediately; the
          // Save button is still what commits hours and quality together.
          pendingSleepQuality = Math.min(5, Math.max(1, parseInt(btn.dataset.q) || 3));
          const inpQ = paneSleep?.querySelector("#sleep-input");
          const keepHours = inpQ ? inpQ.value : "";
          if (!nutritionDB[noteDateKey]) nutritionDB[noteDateKey] = {};
          if (!nutritionDB[noteDateKey].sleep) nutritionDB[noteDateKey].sleep = {};
          nutritionDB[noteDateKey].sleep.quality = pendingSleepQuality;
          renderSleepView();
          const restored = paneSleep?.querySelector("#sleep-input");
          if (restored && keepHours !== "") restored.value = keepHours;
          break;
        }
        case "save-sleep": {
          const inp = paneSleep?.querySelector("#sleep-input");
          const h = parseFloat(inp?.value);
          if (isNaN(h) || h <= 0 || h > 24) {
            new Notice("Enter hours slept (0-24).");
            break;
          }
          if (!nutritionDB[noteDateKey]) nutritionDB[noteDateKey] = {};
          const existingQ = nutritionDB[noteDateKey].sleep?.quality;
          nutritionDB[noteDateKey].sleep = {
            hours: Math.round(h * 4) / 4,
            quality: pendingSleepQuality || parseInt(existingQ) || 3
          };
          await saveNutritionDB();
          new Notice("Sleep saved: " + nutritionDB[noteDateKey].sleep.hours + "h");
          renderSleepView();
          break;
        }
        case "swap-exercise": {
          state.recordSnapshot();
          const idx = parseInt(btn.dataset.ex);
          const name = btn.dataset.name;
          const meta = exerciseDB.find(e => e.name === name);
          if (!meta || isNaN(idx)) break;
          const old = state.sessionExercises[idx];
          const last = this.getLastPerformance(history, meta.name);
          const target = buildAutoTarget({ ...meta, isBW: !!meta.isBW }, last);
          // Keep the superset tag and set count so the swap slots into the
          // session where the original sat.
          state.sessionExercises[idx] = {
            ...meta,
            name: meta.name,
            muscle: meta.muscle || "Custom",
            subTarget: meta.subTarget || "",
            targetKeys: meta.targetKeys || [],
            isBW: !!meta.isBW,
            isAxial: !!meta.isAxial,
            usesBar: exerciseUsesBar(meta.name),
            barWeight: settings.barWeight,
            overloadTarget: target,
            supersetGroup: old.supersetGroup || "",
            sets: (old.sets || []).map(() => ({
              weight: target.weight > 0 ? target.weight : (meta.isBW ? 0 : ""),
              reps: target.reps, failure: 2, done: false, type: "normal"
            }))
          };
          renderTracker();
          new Notice("Swapped in " + meta.name + ".");
          break;
        }
        case "save-readiness": {
          const sore = parseInt(paneWorkout?.querySelector("#ck-soreness")?.value);
          const stress = parseInt(paneWorkout?.querySelector("#ck-stress")?.value);
          if (!nutritionDB[noteDateKey]) nutritionDB[noteDateKey] = {};
          nutritionDB[noteDateKey].readiness = {
            soreness: isNaN(sore) ? 3 : sore,
            stress: isNaN(stress) ? 3 : stress
          };
          await saveNutritionDB();
          const score = todaySubjective();
          new Notice(score === null ? "Check-in saved." : "Check-in saved — readiness " + score + "%.");
          // Targets depend on this, so rebuild them.
          state.sessionExercises.forEach((e, i) => {
            const last = this.getLastPerformance(history, e.name);
            state.sessionExercises[i].overloadTarget = buildAutoTarget(e, last);
          });
          renderTracker();
          break;
        }
        case "dismiss-readiness": {
          readinessDismissed = true;
          renderTracker();
          break;
        }
        case "add-creatine-dose": {
          const grams = parseInt(btn.dataset.grams) || 5;
          if (!nutritionDB[noteDateKey]) nutritionDB[noteDateKey] = { creatine: 0 };
          nutritionDB[noteDateKey].creatine = (nutritionDB[noteDateKey].creatine || 0) + grams;
          nutritionDB._settings.creatineStashGrams = Math.max(0, (nutritionDB._settings.creatineStashGrams || 0) - grams);
          await saveNutritionDB();
          renderCreatineView();
          break;
        }
        case "reset-creatine-today": {
          const currentDose = nutritionDB[noteDateKey]?.creatine || 0;
          nutritionDB._settings.creatineStashGrams = (nutritionDB._settings.creatineStashGrams || 0) + currentDose;
          if (nutritionDB[noteDateKey]) nutritionDB[noteDateKey].creatine = 0;
          await saveNutritionDB();
          renderCreatineView();
          break;
        }
        // ---- routine editor ------------------------------------------
        case "rt-new": {
          const all = routines();
          let name = "New Routine", i = 2;
          while (Object.prototype.hasOwnProperty.call(all, name)) name = "New Routine " + i++;
          const custom = { ...(settings.customRoutines || {}) };
          custom[name] = [];
          await saveSettings({ customRoutines: custom });
          editingRoutine = name;
          renderSettingsView();
          break;
        }
        case "rt-edit": {
          editingRoutine = btn.dataset.name;
          renderSettingsView();
          break;
        }
        case "rt-back": {
          editingRoutine = null;
          renderSettingsView();
          break;
        }
        case "rt-delete": {
          const name = btn.dataset.name;
          if (!name) break;
          const custom = { ...(settings.customRoutines || {}) };
          delete custom[name];
          // Built-ins live in code, so removal has to be remembered or the
          // routine simply reappears on the next load.
          if (Object.prototype.hasOwnProperty.call(ROUTINE_PRESETS, name)) {
            custom._removed = [...new Set([...(custom._removed || []), name])];
          }
          await saveSettings({ customRoutines: custom });
          if (editingRoutine === name) editingRoutine = null;
          new Notice("Deleted \"" + name + "\".");
          renderSettingsView();
          break;
        }
        case "rt-add-ex": {
          const inp = paneSettings?.querySelector("#rt-add");
          const val = (inp?.value || "").trim();
          if (!val || editingRoutine === null) break;
          const all = routines();
          const list = SomaIntelligenceEngine.normalizeRoutine(all[editingRoutine] || []);
          if (list.some(x => x.name.toLowerCase() === val.toLowerCase())) {
            new Notice("Already in this routine.");
            break;
          }
          list.push({ name: val });
          const custom = { ...(settings.customRoutines || {}) };
          custom[editingRoutine] = list;
          await saveSettings({ customRoutines: custom });
          renderSettingsView();
          break;
        }
        case "rt-remove-ex": {
          const i = parseInt(btn.dataset.i);
          if (isNaN(i) || editingRoutine === null) break;
          const list = SomaIntelligenceEngine.normalizeRoutine(routines()[editingRoutine] || []);
          list.splice(i, 1);
          const custom = { ...(settings.customRoutines || {}) };
          custom[editingRoutine] = list;
          await saveSettings({ customRoutines: custom });
          renderSettingsView();
          break;
        }
        case "rt-move": {
          const i = parseInt(btn.dataset.i);
          const dir = parseInt(btn.dataset.dir);
          if (isNaN(i) || isNaN(dir) || editingRoutine === null) break;
          const list = SomaIntelligenceEngine.normalizeRoutine(routines()[editingRoutine] || []);
          const j = i + dir;
          if (j < 0 || j >= list.length) break;
          [list[i], list[j]] = [list[j], list[i]];
          const custom = { ...(settings.customRoutines || {}) };
          custom[editingRoutine] = list;
          await saveSettings({ customRoutines: custom });
          renderSettingsView();
          break;
        }
        case "rt-save": {
          if (editingRoutine === null) break;
          const raw = paneSettings?.querySelector("#rt-name")?.value;
          const all = routines();
          const check = SomaIntelligenceEngine.validateRoutineName(raw, all, editingRoutine);
          if (!check.ok) { new Notice(check.error); break; }

          const list = SomaIntelligenceEngine.normalizeRoutine(all[editingRoutine] || []);
          const custom = { ...(settings.customRoutines || {}) };
          if (check.name !== editingRoutine) {
            delete custom[editingRoutine];
            if (Object.prototype.hasOwnProperty.call(ROUTINE_PRESETS, editingRoutine)) {
              custom._removed = [...new Set([...(custom._removed || []), editingRoutine])];
            }
          }
          custom[check.name] = list;
          await saveSettings({ customRoutines: custom });
          editingRoutine = null;
          new Notice("Saved \"" + check.name + "\" (" + list.length + " exercises).");
          renderSettingsView();
          break;
        }
        case "set-theme": {
          settings.theme = btn.dataset.theme || "dark";
          await saveSettings({ theme: settings.theme });
          applySomaTheme(root, settings);
          renderSettingsView();
          break;
        }
        case "set-accent": {
          settings.accent = normalizeAccent(btn.dataset.color);
          await saveSettings({ accent: settings.accent });
          applySomaTheme(root, settings);
          renderSettingsView();
          break;
        }
        case "save-settings-full": {
          const unit = paneSettings.querySelector("#cfg-unit")?.value;
          const barWeight = parseFloat(paneSettings.querySelector("#cfg-bar")?.value) || 20;
          const restDefault = parseInt(paneSettings.querySelector("#cfg-rest")?.value) || 90;
          const creatineStash = parseFloat(paneSettings.querySelector("#cfg-creatine-stash")?.value) || 300;

          await saveSettings({ unit, barWeight, restDefault });
          nutritionDB._settings.creatineStashGrams = creatineStash;
          await saveNutritionDB();
          new Notice("All Preferences Saved!");
          break;
        }
        case "save-workout": {
          let totalVol = 0, totalSets = 0, sumIntensity = 0, axialVolume = 0;
          const elapsed = Math.max(0, Math.floor((Date.now() - state.sessionStartTime) / 1000));
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          const durationFormatted = `${mins}m ${secs}s`;
          const elapsedMinutes = Math.max(1, Math.round(elapsed / 60));

          const muscleHits = {};
          let blankDoneSets = 0;
          for (const ex of state.sessionExercises) {
            const doneSets = ex.sets.filter(s => s.done && s.type !== "warmup");
            if (doneSets.length > 0 && ex.targetKeys) {
              const avgFail = doneSets.reduce((acc, s) => acc + (parseFloat(s.failure) || 3), 0) / doneSets.length;
              for (const k of ex.targetKeys) {
                if (!muscleHits[k]) muscleHits[k] = { sets: 0, sumFail: 0, count: 0 };
                muscleHits[k].sets += doneSets.length;
                muscleHits[k].sumFail += (avgFail * doneSets.length);
                muscleHits[k].count += doneSets.length;
              }
            }
            for (const s of ex.sets) {
              // A blank field means nothing was logged. Inventing 80kg x 8
              // here is what made past sessions report volume for sets that
              // recorded nothing at all.
              const hasWeight = s.weight !== undefined && s.weight !== "" && !isNaN(parseFloat(s.weight));
              const hasReps = s.reps !== undefined && s.reps !== "" && !isNaN(parseFloat(s.reps));
              if (s.done && (!hasWeight || !hasReps) && !(ex.isBW && hasReps)) blankDoneSets++;
              const w = hasWeight ? getTotalWeight(ex, s) : (ex.isBW ? 0 : 0);
              const r = hasReps ? parseFloat(s.reps) : 0;
              const failVal = s.failure || "3";
              if (s.done && s.type !== "warmup") {
                totalSets++;
                const vol = SomaIntelligenceEngine.calculateWorkVolume(w, r, ex.isBW);
                totalVol += vol;
                if (ex.isAxial) axialVolume += vol;
                sumIntensity += (parseFloat(failVal) || 3);
              }
            }
          }

          const finalMuscles = {};
          for (const k in muscleHits) {
            finalMuscles[k] = { sets: muscleHits[k].sets, avgFail: Math.round((muscleHits[k].sumFail / muscleHits[k].count) * 10) / 10 };
          }

          const avgIntensity = totalSets > 0 ? (sumIntensity / totalSets) : 3;
          const caloriesBurned = SomaIntelligenceEngine.calculateCaloriesBurned(elapsedMinutes, totalVol, totalSets, avgIntensity);

          const recapData = {
            timestamp: Date.now(),
            dateStr: new Date().toISOString(),
            split: state.activeSplit,
            durationFormatted,
            caloriesBurned,
            totalVol,
            axialVol: axialVolume,
            totalSets,
            blankDoneSets,
            muscles: finalMuscles,
            exercises: state.sessionExercises
          };

          const saved = await saveWorkoutHistory(recapData);
          // Nothing was logged — stay on the tracker rather than showing a
          // recap for a session that was never written, and leave the note's
          // frontmatter untouched.
          if (!saved) break;

          if (sourcePath) {
            const currentFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (currentFile && this.app.fileManager?.processFrontMatter) {
              await this.app.fileManager.processFrontMatter(currentFile, fm => {
                fm["workout_split"] = state.activeSplit;
                fm["workout_volume"] = totalVol;
                fm["workout_sets"] = totalSets;
                fm["workout_calories"] = caloriesBurned;
              });
            }
          }

          renderFinishedScreen(recapData);
          break;
        }
        case "edit-session": {
          const savedSession = history[noteDateKey];
          if (savedSession) {
            state.recordSnapshot();
            state.activeSplit = savedSession.split || state.activeSplit;
            state.sessionExercises = JSON.parse(JSON.stringify(savedSession.exercises || []));
            state.sessionStartTime = typeof savedSession.timestamp === "number" ? savedSession.timestamp : Date.now();
          }
          initWorkoutView();
          renderTracker();
          break;
        }
        case "reset-session": {
          delete history[noteDateKey];
          await this.writeHistory(history);
          state.sessionExercises = [];
          state.sessionStartTime = Date.now();
          initWorkoutView();
          break;
        }
        case "close-plate-modal": {
          const pModal = appEl.querySelector("#plate-popover");
          if (pModal) pModal.style.display = "none";
          break;
        }
      }
    };

    appEl.oninput = async (e) => {
      const target = e.target;
      // Live accent preview: the colour applies as you drag the picker and is
      // persisted straight away, so there is no separate save step.
      if (target.id === "cfg-accent-custom") {
        settings.accent = normalizeAccent(target.value);
        applySomaTheme(root, settings);
        await saveSettings({ accent: settings.accent });
        return;
      }
      if (target.classList.contains("set-weight")) {
        const exObj = state.sessionExercises[target.dataset.ex];
        const setObj = exObj.sets[target.dataset.set];
        setObj.weight = target.value;
        if (exObj.usesBar) {
          const hintEl = target.parentElement.querySelector("div");
          const total = getTotalWeight(exObj, setObj);
          if (hintEl) hintEl.textContent = total > 0 ? `= ${total}${settings.unit}` : "";
        }
        updateStats();
      } else if (target.classList.contains("set-reps")) {
        state.sessionExercises[target.dataset.ex].sets[target.dataset.set].reps = target.value;
        updateStats();
      }
    };

    appEl.onchange = (e) => {
      const target = e.target;
      if (target.id === "chart-ex-select") {
        chartExercise = target.value;
        renderStrengthChart(paneInsights && paneInsights.querySelector("#insights-strength"));
        return;
      }
      if (target.classList.contains("set-bar-select")) {
        const exObj = state.sessionExercises[target.dataset.ex];
        const preset = (BAR_PRESETS[settings.unit] || BAR_PRESETS.kg).find(p => p.id === target.value);
        exObj.barWeight = preset && preset.weight !== null ? preset.weight : (exObj.barWeight || settings.barWeight);
        renderTracker();
      } else if (target.classList.contains("set-bar-custom")) {
        const exObj = state.sessionExercises[target.dataset.ex];
        exObj.barWeight = parseFloat(target.value) || settings.barWeight;
        renderTracker();
      } else if (target.classList.contains("set-fail")) {
        state.sessionExercises[target.dataset.ex].sets[target.dataset.set].failure = target.value;
      } else if (target.classList.contains("set-done")) {
        const isDone = target.checked;
        const curEx = state.sessionExercises[target.dataset.ex];
        const curSet = curEx.sets[target.dataset.set];
        curSet.done = isDone;

        const row = target.closest('.soma-set-row');
        if (row) {
          if (isDone) row.classList.add('row-done');
          else row.classList.remove('row-done');
        }

        if (isDone) {
          // A warm-up is not a performance, so it can never be a PR.
          const prIntel = curSet.type === "warmup"
            ? null
            : SomaIntelligenceEngine.detectPersonalRecords(history, curEx.name, getTotalWeight(curEx, curSet), curSet.reps);
          if (prIntel) {
            if (settings.sound) SomaAudioCelebration.playSound("pr");
            if (settings.confetti) SomaAudioCelebration.triggerConfetti(appEl);
            new Notice(`🏆 NEW PR: ${curEx.name} (${prIntel.weight}${settings.unit} × ${prIntel.reps})!`);
          } else if (settings.sound) {
            SomaAudioCelebration.playSound("chime");
          }

          // Rest length now depends on what kind of set you just finished and
          // whether the exercise is mid-superset, instead of always running
          // the same default.
          if (settings.autoRest) {
            const plan = SomaIntelligenceEngine.restForSet(
              curEx, curSet, state.sessionExercises, settings
            );
            if (plan.seconds > 0) {
              startRestTimer(plan.seconds);
            } else {
              // Zero rest: skip the timer entirely and point at the partner.
              this.untrackInterval(restTimerInterval);
              updateRestTimerUI();
            }
            if (plan.reason) new Notice(plan.reason);
          }
        }
        updateStats();
      }
    };

    appEl.ondblclick = (e) => {
      const target = e.target;
      if (target.classList.contains("set-weight")) {
        const ex = state.sessionExercises[target.dataset.ex];
        const setObj = ex.sets[target.dataset.set];
        if (ex.usesBar) {
          showPlateCalculator(getTotalWeight(ex, setObj) || (ex.barWeight || settings.barWeight), ex.barWeight || settings.barWeight);
        } else {
          showPlateCalculator(target.value || (ex.isBW ? 0 : 80));
        }
      }
    };

    // Only the profiles that actually show the tracker need it built.
    if (paneWorkout) {
      initWorkoutView();
      if (history && history[noteDateKey]) {
        renderFinishedScreen(history[noteDateKey]);
      }
    }
    // Whatever tab this profile opens on still has to be rendered.
    if (firstPane !== "pane-workout") switchDockTab(firstPane);
  }

  // ==========================================================================
  // CODEBLOCK 2: COMPLETE MACRO & NUTRITION DIARY + RECOMP FORECAST (`macro-tracker`)
  // ==========================================================================
  async mountTracker(containerEl, sourcePath) {
    const root = containerEl.createDiv({ cls: "ntr-root-container" });
    applySomaTheme(root, await this.readVaultJson(SETTINGS_FILE_PATH, {}));

    const fileName = sourcePath ? sourcePath.split("/").pop() : "";
    const dateMatch = fileName ? fileName.match(/\d{4}-\d{2}-\d{2}/) : null;
    const noteDateKey = dateMatch ? dateMatch[0] : getLocalDateKey(new Date());

    let nutritionDB = await this.readNutrition({});
    this.ensureNutritionSettings(nutritionDB);
    let customFoods = await this.readVaultJson(CUSTOM_FOODS_FILE, []);
    let historyDB = await this.readHistory();

    const todayWorkout = historyDB[noteDateKey] || {};
    const exerciseCaloriesBurned = todayWorkout.caloriesBurned || 0;
    const workoutSplitName = todayWorkout.split || null;

    let foodLibrary = [...BASE_FOOD_LIBRARY, ...customFoods];

    if (!nutritionDB[noteDateKey]) {
      const baseGoals = { ...(nutritionDB.__defaultGoals || DEFAULT_GOALS) };
      let carryWeight = 78.5;
      const priorKeys = Object.keys(nutritionDB).filter(k => k !== "_settings" && k !== "__defaultGoals" && nutritionDB[k]?.bodyWeight).sort();
      if (priorKeys.length > 0) carryWeight = parseFloat(nutritionDB[priorKeys[priorKeys.length - 1]].bodyWeight) || carryWeight;
      if (nutritionDB._settings?.autoProteinTarget) {
        baseGoals.protein = Math.round(carryWeight * (nutritionDB._settings.proteinPerKg || 2.0));
      }
      nutritionDB[noteDateKey] = {
        goals: baseGoals,
        summaryOpen: true,
        tableOpen: false,
        microOpen: false,
        water: 0,
        bodyWeight: carryWeight,
        mealCollapse: {},
        items: []
      };
    }

    const dayData = nutritionDB[noteDateKey];
    if (!dayData.goals) dayData.goals = { ...(nutritionDB.__defaultGoals || DEFAULT_GOALS) };
    if (dayData.goals.water === undefined) dayData.goals.water = 3500;
    if (dayData.goals.fiber === undefined) dayData.goals.fiber = 35;
    if (dayData.goals.calcium === undefined) dayData.goals.calcium = 1000;
    if (dayData.goals.iron === undefined) dayData.goals.iron = 18;
    if (dayData.goals.magnesium === undefined) dayData.goals.magnesium = 400;
    if (dayData.goals.potassium === undefined) dayData.goals.potassium = 3500;
    if (dayData.goals.sodium === undefined) dayData.goals.sodium = 2300;
    if (dayData.goals.zinc === undefined) dayData.goals.zinc = 11;

    if (dayData.summaryOpen === undefined) dayData.summaryOpen = true;
    if (dayData.tableOpen === undefined) dayData.tableOpen = false;
    if (dayData.microOpen === undefined) dayData.microOpen = false;
    if (dayData.water === undefined) dayData.water = 0;
    if (dayData.bodyWeight === undefined) dayData.bodyWeight = 78.5;
    if (!dayData.mealCollapse) dayData.mealCollapse = {};
    if (!dayData.items) dayData.items = [];

    const saveNutrition = async () => {
      await this.writeVaultJson(NUTRITION_FILE_PATH, nutritionDB);
      await this.syncFrontmatter(sourcePath, dayData);
    };

    const saveCustomFoods = async () => {
      await this.writeVaultJson(CUSTOM_FOODS_FILE, customFoods);
      foodLibrary = [...BASE_FOOD_LIBRARY, ...customFoods];
    };

    const incrementFoodUsage = async (foodName) => {
      const match = customFoods.find(f => f.name === foodName);
      if (match) {
        match.usageCount = (match.usageCount || 0) + 1;
        await saveCustomFoods();
      } else {
        const baseMatch = BASE_FOOD_LIBRARY.find(f => f.name === foodName);
        if (baseMatch) baseMatch.usageCount = (baseMatch.usageCount || 0) + 1;
      }
    };

    const render = () => {
      let totalCals = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
      let totalFiber = 0, totalCalcium = 0, totalIron = 0, totalMagnesium = 0, totalPotassium = 0, totalSodium = 0, totalZinc = 0;

      (dayData.items || []).forEach(item => {
        totalCals += (item.cals || 0);
        totalProtein += (item.p || 0);
        totalCarbs += (item.c || 0);
        totalFat += (item.f || 0);
        totalFiber += (item.fiber || 0);
        totalCalcium += (item.calcium || 0);
        totalIron += (item.iron || 0);
        totalMagnesium += (item.magnesium || 0);
        totalPotassium += (item.potassium || 0);
        totalSodium += (item.sodium || 0);
        totalZinc += (item.zinc || 0);
      });

      const effectiveGoalCals = dayData.goals.cals + exerciseCaloriesBurned;
               const remCals = effectiveGoalCals - totalCals;
               const remProtein = dayData.goals.protein - totalProtein;
               const remFat = dayData.goals.fat - totalFat;
               const remCarbs = dayData.goals.carbs - totalCarbs;

      const currentWeight = parseFloat(dayData.bodyWeight) || 78.5;
                // Prefer maintenance derived from what actually happened to
                // intake and bodyweight; fall back to the formula only while
                // there is not enough logged data to measure it.
                const tdee = SomaIntelligenceEngine.computeMaintenanceCalories(nutritionDB);
                const formulaCals = SomaIntelligenceEngine.formulaMaintenance(currentWeight) || Math.round(currentWeight * 32);
                const measured = tdee && tdee.ok ? tdee.maintenance : null;
                const estMaintenanceCals = measured !== null ? measured : formulaCals;
                const dailySurplus = dayData.goals.cals - estMaintenanceCals;
                const monthlyKcalDelta = dailySurplus * 30;
                const estFatDeltaKg = (monthlyKcalDelta / 7700).toFixed(2);
                const estMuscleGainKg = dailySurplus >= 0 ? 0.25 : -0.25;
                const projectedWeight = (currentWeight + parseFloat(estFatDeltaKg) + estMuscleGainKg).toFixed(2);

      const calsPct = Math.min(100, Math.round((totalCals / effectiveGoalCals) * 100));
      const protPct = Math.min(100, Math.round((totalProtein / dayData.goals.protein) * 100));
      const fatPct = Math.min(100, Math.round((totalFat / dayData.goals.fat) * 100));
      const carbsPct = Math.min(100, Math.round((totalCarbs / dayData.goals.carbs) * 100));

      const pCal = totalProtein * 4;
      const fCal = totalFat * 9;
      const cCal = totalCarbs * 4;
      const totalMacroCal = pCal + fCal + cCal;

      const pRatio = totalMacroCal > 0 ? Math.round((pCal / totalMacroCal) * 100) : 30;
      const fRatio = totalMacroCal > 0 ? Math.round((fCal / totalMacroCal) * 100) : 25;
      const cRatio = totalMacroCal > 0 ? Math.max(0, 100 - pRatio - fRatio) : 45;

      const pBarW = (pCal / (effectiveGoalCals || 1)) * 100;
      const fBarW = (fCal / (effectiveGoalCals || 1)) * 100;
      const cBarW = (cCal / (effectiveGoalCals || 1)) * 100;
      const isOverCals = totalCals > effectiveGoalCals;

      const waterTarget = dayData.goals.water || 3500;
      const currentWater = dayData.water || 0;
      const nodeVol = Math.round(waterTarget / 10);
      let waterNodesHtml = "";
      for (let n = 1; n <= 10; n++) {
        const isFilled = currentWater >= (n * nodeVol);
        waterNodesHtml += `<div class="ntr-water-node ${isFilled ? 'filled' : ''}" data-vol="${n * nodeVol}" title="${n * nodeVol} ml"></div>`;
      }

      const mealCategories = ["Breakfast", "Lunch", "Dinner", "Post-Workout", "Snacks"];
      let mealGroupsHtml = "";

      mealCategories.forEach(mealCat => {
        const mealItems = (dayData.items || []).filter(i => (i.meal || "Snacks").toLowerCase() === mealCat.toLowerCase());
        let mCals = 0, mProt = 0;
        mealItems.forEach(i => { mCals += (i.cals || 0); mProt += (i.p || 0); });

        const isCollapsed = !!dayData.mealCollapse[mealCat];

        let itemsInMealHtml = mealItems.map((item) => {
          const globalIdx = dayData.items.indexOf(item);
          return `
            <div class="ntr-row-item" data-idx="${globalIdx}">
              <div>
                <div style="font-weight: 700; color: var(--soma-text);">${item.name}</div>
                <div style="font-size:0.68rem; color:var(--soma-text-faint);">${item.serving || "100 g"}</div>
              </div>
              <div class="col-cals">${item.cals.toFixed(0)} kcal</div>
              <div class="col-prot">${item.p.toFixed(1)}g</div>
              <div class="col-fat">${item.f.toFixed(1)}g</div>
              <div class="col-carb">${item.c.toFixed(1)}g</div>
              <div style="text-align: right;">
                <button class="ntr-del-btn btn-direct-del" data-idx="${globalIdx}" title="Delete">✕</button>
              </div>
            </div>
          `;
        }).join("");

        mealGroupsHtml += `
          <div class="ntr-meal-card">
            <div class="ntr-meal-header" data-meal="${mealCat}">
              <div class="ntr-meal-title">
                <span class="ntr-chevron ${isCollapsed ? 'closed' : ''}"></span>
                <span>${mealCat}</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="ntr-meal-badge">${mCals.toFixed(0)} kcal • ${mProt.toFixed(0)}g P</span>
                <button class="ntr-btn-quick-add-meal btn-quick-add" data-meal="${mealCat}">+ Add</button>
              </div>
            </div>
            <div style="display: ${isCollapsed ? 'none' : 'block'};">
              ${itemsInMealHtml || `<div style="padding:8px 14px; font-size:0.72rem; color:#52525b; text-align:center;">No items logged</div>`}
            </div>
          </div>
        `;
      });

      const microsList = [
        { name: "Fiber", cur: totalFiber, goal: dayData.goals.fiber || 35, unit: "g", color: "var(--soma-accent)" },
        { name: "Calcium", cur: totalCalcium, goal: dayData.goals.calcium || 1000, unit: "mg", color: "var(--soma-info)" },
        { name: "Iron", cur: totalIron, goal: dayData.goals.iron || 18, unit: "mg", color: "#f87171" },
        { name: "Magnesium", cur: totalMagnesium, goal: dayData.goals.magnesium || 400, unit: "mg", color: "#a855f7" },
        { name: "Potassium", cur: totalPotassium, goal: dayData.goals.potassium || 3500, unit: "mg", color: "#fb923c" },
        { name: "Sodium", cur: totalSodium, goal: dayData.goals.sodium || 2300, unit: "mg", color: "#fbbf24", isLimit: true },
        { name: "Zinc", cur: totalZinc, goal: dayData.goals.zinc || 11, unit: "mg", color: "#34d399" }
      ];

      const microCardsHtml = microsList.map(m => {
        const pct = Math.min(100, Math.round((m.cur / m.goal) * 100));
        const left = m.goal - m.cur;
        const subText = m.isLimit
          ? (left >= 0 ? `${left.toFixed(0)}${m.unit} under` : `${Math.abs(left).toFixed(0)}${m.unit} over`)
          : (left > 0 ? `${left.toFixed(0)}${m.unit} left` : `Goal reached`);

        return `
          <div class="ntr-micro-card">
            <div class="ntr-micro-head">
              <span style="color:var(--soma-text-dim);">${m.name}</span>
              <span style="color:${m.color};">${m.cur.toFixed(0)} / ${m.goal}${m.unit}</span>
            </div>
            <div class="ntr-micro-bar-bg"><div class="ntr-micro-bar-fill" style="width:${pct}%; background:${m.color};"></div></div>
            <div style="font-size:0.63rem; font-weight:700; color:var(--soma-text-faint); margin-top:3px; display:flex; justify-content:space-between;">
              <span>${pct}%</span>
              <span style="color:${left < 0 && m.isLimit ? 'var(--soma-danger)' : 'var(--soma-text-dim)'};">${subText}</span>
            </div>
          </div>
        `;
      }).join("");

      root.innerHTML = `
        <div class="ntr-goals-widget">
          <div class="ntr-goals-info">
            <span class="ntr-goals-title">🎯 Targets</span>
            <span class="ntr-goal-pill" style="color:var(--soma-warn);"><b style="color:var(--soma-text);">${dayData.goals.cals}</b> kcal ${exerciseCaloriesBurned > 0 ? `<span style="font-size:0.65rem; color:#34d399;">(+${exerciseCaloriesBurned})</span>` : ''}</span>
            <span class="ntr-goal-pill" style="color:var(--soma-accent-text);">P: <b style="color:var(--soma-text);">${dayData.goals.protein}g</b></span>
            <span class="ntr-goal-pill" style="color:var(--soma-danger);">F: <b style="color:var(--soma-text);">${dayData.goals.fat}g</b></span>
            <span class="ntr-goal-pill" style="color:#0ea5e9;">C: <b style="color:var(--soma-text);">${dayData.goals.carbs}g</b></span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="display:flex; align-items:center; gap:6px; background:var(--soma-surface-2); padding:6px 10px; border-radius:8px; border:1px solid var(--soma-surface-3); min-height:34px;">
              <span style="font-size:0.68rem; color:var(--soma-text-dim); font-weight:700;">⚖️ Log Weight:</span>
              <input type="number" step="0.1" id="inp-scale-weight" value="${currentWeight}" style="width:60px; background:transparent; border:none; color:var(--soma-text); font-weight:800; font-size:0.9rem; outline:none; text-align:right; padding:4px 0;" />
              <span style="font-size:0.68rem; color:var(--soma-text-faint);">kg</span>
            </div>
            <button class="ntr-btn-edit-goals ntr-btn" id="btn-open-goals-modal">⚙️ Targets</button>
          </div>
        </div>

        ${workoutSplitName ? `
          <div class="ntr-synergy-banner">
            <span>🏋️ <b>Workout:</b> ${workoutSplitName} (${exerciseCaloriesBurned} kcal)</span>
            <span style="color:#93c5fd;">Ceiling adjusted</span>
          </div>
        ` : ''}

        <div class="ntr-mfp-banner">
          <div class="ntr-mfp-equation">
            <div class="ntr-mfp-unit">
              <div class="ntr-mfp-num">${dayData.goals.cals}</div>
              <div class="ntr-mfp-sub">Goal</div>
            </div>
            <span class="ntr-mfp-sym">−</span>
            <div class="ntr-mfp-unit">
              <div class="ntr-mfp-num" style="color:var(--soma-warn);">${Math.round(totalCals)}</div>
              <div class="ntr-mfp-sub">Food</div>
            </div>
            <span class="ntr-mfp-sym">+</span>
            <div class="ntr-mfp-unit">
              <div class="ntr-mfp-num" style="color:#34d399;">${Math.round(exerciseCaloriesBurned)}</div>
              <div class="ntr-mfp-sub">Exercise</div>
            </div>
            <span class="ntr-mfp-sym">=</span>
          </div>
          <div class="ntr-mfp-rem-box">
            <div class="ntr-mfp-rem-val" style="color:${remCals >= 0 ? '#34d399' : 'var(--soma-danger)'};">
              ${remCals >= 0 ? remCals.toFixed(0) : `+${Math.abs(remCals).toFixed(0)}`}
            </div>
            <div class="ntr-mfp-sub" style="font-weight:700; color:${remCals >= 0 ? '#34d399' : 'var(--soma-danger)'};">
              ${remCals >= 0 ? 'Remaining' : 'Over Limit'}
            </div>
          </div>
        </div>

        <div class="ntr-stacked-bar-container">
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; font-weight:700; color:var(--soma-text-faint);">
            <span>Macro Calorie Distribution</span>
            <span style="color:#d4d4d8;">${totalCals.toFixed(0)} / ${effectiveGoalCals} kcal</span>
          </div>
          <div class="ntr-stacked-bar-track">
            <div class="ntr-stack-seg" style="width:${Math.min(100, pBarW)}%; background:var(--soma-accent);" title="Protein (${pRatio}%)"></div>
            <div class="ntr-stack-seg" style="width:${Math.min(100 - pBarW, fBarW)}%; background:var(--soma-danger);" title="Fat (${fRatio}%)"></div>
            <div class="ntr-stack-seg" style="width:${Math.min(100 - pBarW - fBarW, cBarW)}%; background:#0ea5e9;" title="Carbs (${cRatio}%)"></div>
            ${isOverCals ? `<div class="ntr-stack-seg ntr-stack-over" style="width:100%;" title="Over Target"></div>` : ''}
          </div>
        </div>

        <details style="background:var(--soma-surface); padding:10px 14px; border-radius:10px; border:1px solid var(--soma-border); cursor:pointer;">
          <summary style="font-weight:800; font-size:0.78rem; color:var(--soma-text-dim);">
            🔮 30-Day Recomposition Forecast (Click to expand)
          </summary>
          <div style="margin-top:10px; font-size:0.76rem; display:grid; grid-template-columns: 1fr 1fr; gap:6px; color:var(--soma-text-dim);">
            <div>• Est. Fat Change: <b style="color:${estFatDeltaKg <= 0 ? 'var(--soma-accent-text)' : 'var(--soma-warn)'};">${estFatDeltaKg > 0 ? '+' : ''}${estFatDeltaKg} kg</b></div>
            <div>• Est. Lean Mass: <b style="color:var(--soma-accent-text);">+${estMuscleGainKg} kg</b></div>
            <div style="grid-column: span 2; margin-top:6px; padding-top:6px; border-top:1px dashed var(--soma-border);">
              🎯 <b>Target Weight in 30 Days:</b> <span style="color:var(--soma-info); font-weight:900;">${projectedWeight} kg</span>
            </div>
            <div style="grid-column: span 2; margin-top:8px; padding-top:8px; border-top:1px dashed var(--soma-border); font-size:0.72rem;">
              ${(measured !== null
                ? `<div style="display:flex; justify-content:space-between;"><span>🔬 <b>Your measured maintenance</b></span><b style="color:var(--soma-accent-text);">${measured} kcal</b></div>
                   <div style="display:flex; justify-content:space-between; color:var(--soma-text-faint);"><span>Formula guess (bodyweight x 32)</span><span>${formulaCals} kcal</span></div>
                   <div style="color:var(--soma-text-faint); margin-top:4px; line-height:1.45;">From ${tdee.foodDays} logged days over ${tdee.days} days: averaged <b>${tdee.avgIntake}</b> kcal while weight went <b>${tdee.weightDelta > 0 ? "+" : ""}${tdee.weightDelta} kg</b>. Confidence: <b>${tdee.confidence}</b>.</div>`
                : `<div style="display:flex; justify-content:space-between;"><span>📐 Maintenance (formula estimate)</span><b>${formulaCals} kcal</b></div>
                   <div style="color:var(--soma-text-faint); margin-top:4px; line-height:1.45;">${(tdee && tdee.reason) ? tdee.reason : "Log weight and food for a couple of weeks and this becomes a measurement instead of a guess."}</div>`
              )}
            </div>
          </div>
        </details>

        <div class="ntr-water-dock">
          <div class="ntr-water-top">
            <div class="ntr-water-label">
              <span>💧 Hydration</span>
              <b style="color:var(--soma-text);">${currentWater}</b> / ${waterTarget} ml
            </div>
            <div style="display:flex; gap:6px;">
              <button class="ntr-btn-water ntr-btn" id="w-plus-250">+250ml</button>
              <button class="ntr-btn-water ntr-btn" id="w-plus-500">+500ml</button>
              <button class="ntr-btn-water ntr-btn" id="w-reset" style="background:var(--soma-surface); border-color:var(--soma-border); color:var(--soma-text-faint);">↺</button>
            </div>
          </div>
          <div class="ntr-water-nodes-row">${waterNodesHtml}</div>
        </div>

        <div class="ntr-card">
          <div class="ntr-accordion-bar" id="toggle-summary">
            <span class="ntr-accordion-title">📊 Macros Breakdown</span>
            <div style="display: flex; align-items: center;">
              <span class="ntr-accordion-cals">${totalCals.toFixed(0)} kcal</span>
              <span class="ntr-chevron ${dayData.summaryOpen ? '' : 'closed'}"></span>
            </div>
          </div>
          <div class="ntr-tiles-body" style="display: ${dayData.summaryOpen ? 'block' : 'none'};">
            <div class="ntr-tiles-grid">
              <div class="ntr-tile">
                <div class="ntr-tile-accent acc-cals"></div>
                <div class="ntr-tile-top">
                  <span class="ntr-tile-lbl">Calories</span>
                  <span class="ntr-tile-pct" style="color:var(--soma-warn);">${calsPct}%</span>
                </div>
                <div class="ntr-tile-val">${totalCals.toFixed(0)} <span style="font-size:0.62rem; color:var(--soma-text-faint);">kcal</span></div>
                <div class="ntr-tile-sub" style="color:${remCals >= 0 ? '#34d399' : 'var(--soma-danger)'};">
                  ${remCals >= 0 ? `${remCals.toFixed(0)} left` : `+${Math.abs(remCals).toFixed(0)} over`}
                </div>
                <div class="ntr-tile-bar-bg"><div class="ntr-tile-bar-fill acc-cals" style="width: ${calsPct}%;"></div></div>
              </div>

              <div class="ntr-tile">
                <div class="ntr-tile-accent acc-prot"></div>
                <div class="ntr-tile-top">
                  <span class="ntr-tile-lbl">Protein</span>
                  <span class="ntr-tile-pct" style="color:var(--soma-accent-text);">${protPct}%</span>
                </div>
                <div class="ntr-tile-val">${totalProtein.toFixed(0)} <span style="font-size:0.62rem; color:var(--soma-text-faint);">/ ${dayData.goals.protein}g</span></div>
                <div class="ntr-tile-sub" style="color:${remProtein > 0 ? 'var(--soma-text-faint)' : 'var(--soma-accent-text)'};">
                  ${remProtein > 0 ? `${remProtein.toFixed(0)}g left` : `Goal Met`}
                </div>
                <div class="ntr-tile-bar-bg"><div class="ntr-tile-bar-fill acc-prot" style="width: ${protPct}%;"></div></div>
              </div>

              <div class="ntr-tile">
                <div class="ntr-tile-accent acc-fat"></div>
                <div class="ntr-tile-top">
                  <span class="ntr-tile-lbl">Fat</span>
                  <span class="ntr-tile-pct" style="color:var(--soma-danger);">${fatPct}%</span>
                </div>
                <div class="ntr-tile-val">${totalFat.toFixed(0)} <span style="font-size:0.62rem; color:var(--soma-text-faint);">/ ${dayData.goals.fat}g</span></div>
                <div class="ntr-tile-sub" style="color:${remFat >= 0 ? 'var(--soma-text-faint)' : 'var(--soma-danger)'};">
                  ${remFat >= 0 ? `${remFat.toFixed(0)}g left` : `+${Math.abs(remFat).toFixed(0)}g over`}
                </div>
                <div class="ntr-tile-bar-bg"><div class="ntr-tile-bar-fill acc-fat" style="width: ${fatPct}%;"></div></div>
              </div>

              <div class="ntr-tile">
                <div class="ntr-tile-accent acc-carb"></div>
                <div class="ntr-tile-top">
                  <span class="ntr-tile-lbl">Carbs</span>
                  <span class="ntr-tile-pct" style="color:#0ea5e9;">${carbsPct}%</span>
                </div>
                <div class="ntr-tile-val">${totalCarbs.toFixed(0)} <span style="font-size:0.62rem; color:var(--soma-text-faint);">/ ${dayData.goals.carbs}g</span></div>
                <div class="ntr-tile-sub" style="color:${remCarbs >= 0 ? 'var(--soma-text-faint)' : 'var(--soma-danger)'};">
                  ${remCarbs >= 0 ? `${remCarbs.toFixed(0)}g left` : `+${Math.abs(remCarbs).toFixed(0)}g over`}
                </div>
                <div class="ntr-tile-bar-bg"><div class="ntr-tile-bar-fill acc-carb" style="width: ${carbsPct}%;"></div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="ntr-card">
          <div class="ntr-accordion-bar" id="toggle-table">
            <span class="ntr-accordion-title">🍽️ Food Diary</span>
            <div style="display: flex; align-items: center;">
              <span class="ntr-accordion-cals">${totalCals.toFixed(0)} kcal</span>
              <span class="ntr-chevron ${dayData.tableOpen ? '' : 'closed'}"></span>
            </div>
          </div>
          <div style="display: ${dayData.tableOpen ? 'block' : 'none'};">
            <div class="ntr-action-bar">
              <button class="ntr-btn-tool btn-tool-search ntr-btn" id="btn-open-modal">🔍 Search Food</button>
              <button class="ntr-btn-tool btn-tool-library ntr-btn" id="btn-open-food-library">📚 Food Library</button>
              <button class="ntr-btn-tool btn-tool-meal ntr-btn" id="btn-open-meal-builder">🍱 Combine Meal</button>
              <button class="ntr-btn-tool btn-tool-copy ntr-btn" id="btn-copy-yesterday">📋 Copy Yesterday</button>
              <button class="ntr-btn-tool btn-tool-scan ntr-btn" id="btn-open-barcode">📷 Scan Barcode</button>
            </div>
            <div>${mealGroupsHtml}</div>
          </div>
        </div>

        <div class="ntr-card">
          <div class="ntr-accordion-bar" id="toggle-micro">
            <span class="ntr-accordion-title">🧪 Micronutrients & Minerals</span>
            <div style="display: flex; align-items: center;">
              <span class="ntr-accordion-cals" style="color:#a855f7;">${totalCalcium.toFixed(0)}mg Ca • ${totalIron.toFixed(1)}mg Fe</span>
              <span class="ntr-chevron ${dayData.microOpen ? '' : 'closed'}"></span>
            </div>
          </div>
          <div style="display: ${dayData.microOpen ? 'block' : 'none'};">
            <div class="ntr-micro-grid">${microCardsHtml}</div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="goals-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>🎯 Edit Daily Targets</span><button class="ntr-del-btn" id="btn-close-goals-x">✕</button></div>
            <div style="font-size:0.72rem; font-weight:700; color:var(--soma-info); text-transform:uppercase; margin-bottom:6px;">Macronutrients & Water</div>
            <div class="ntr-macro-input-grid">
              <div><div class="ntr-mini-lbl">Calories</div><input type="number" class="ntr-mini-inp" id="inp-goal-cals" value="${dayData.goals.cals}" /></div>
              <div><div class="ntr-mini-lbl">Protein (g)</div><input type="number" class="ntr-mini-inp" id="inp-goal-p" value="${dayData.goals.protein}" /></div>
              <div><div class="ntr-mini-lbl">Fat (g)</div><input type="number" class="ntr-mini-inp" id="inp-goal-f" value="${dayData.goals.fat}" /></div>
              <div><div class="ntr-mini-lbl">Carbs (g)</div><input type="number" class="ntr-mini-inp" id="inp-goal-c" value="${dayData.goals.carbs}" /></div>
            </div>
            <div style="margin-bottom:12px;"><div class="ntr-mini-lbl">Water Target (ml)</div><input type="number" class="ntr-modal-input" id="inp-goal-water" value="${dayData.goals.water || 3500}" /></div>
            <div style="font-size:0.72rem; font-weight:700; color:#a855f7; text-transform:uppercase; margin:10px 0 6px 0;">Micronutrients Target</div>
            <div class="ntr-micro-input-grid">
              <div><div class="ntr-mini-lbl">Fiber (g)</div><input type="number" class="ntr-mini-inp" id="inp-goal-fiber" value="${dayData.goals.fiber || 35}" /></div>
              <div><div class="ntr-mini-lbl">Calcium (mg)</div><input type="number" class="ntr-mini-inp" id="inp-goal-calcium" value="${dayData.goals.calcium || 1000}" /></div>
              <div><div class="ntr-mini-lbl">Iron (mg)</div><input type="number" class="ntr-mini-inp" id="inp-goal-iron" value="${dayData.goals.iron || 18}" /></div>
              <div><div class="ntr-mini-lbl">Magnesium (mg)</div><input type="number" class="ntr-mini-inp" id="inp-goal-magnesium" value="${dayData.goals.magnesium || 400}" /></div>
              <div><div class="ntr-mini-lbl">Potassium (mg)</div><input type="number" class="ntr-mini-inp" id="inp-goal-potassium" value="${dayData.goals.potassium || 3500}" /></div>
              <div><div class="ntr-mini-lbl">Sodium Limit (mg)</div><input type="number" class="ntr-mini-inp" id="inp-goal-sodium" value="${dayData.goals.sodium || 2300}" /></div>
              <div><div class="ntr-mini-lbl">Zinc (mg)</div><input type="number" class="ntr-mini-inp" id="inp-goal-zinc" value="${dayData.goals.zinc || 11}" /></div>
            </div>
            <label style="display:flex; align-items:center; gap:8px; font-size:0.75rem; color:var(--soma-text-dim); margin-bottom:14px; cursor:pointer;">
              <input type="checkbox" id="chk-save-default-goals" checked /> Set as default for all future days
            </label>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button id="btn-close-goals-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Cancel</button>
              <button id="btn-save-goals" class="ntr-btn" style="padding:8px 16px; background:#2563eb; border:none; color:var(--soma-text); border-radius:6px; font-weight:700;">Save Targets</button>
            </div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="ntr-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>🔍 Log Food</span><button class="ntr-del-btn" id="btn-close-log-x">✕</button></div>
            <input type="text" class="ntr-modal-input" id="ntr-search-food" placeholder="Search food library..." />
            <div class="ntr-search-results" id="ntr-search-res"></div>
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:6px; margin: 8px 0 4px 0;">
              <input type="text" class="ntr-modal-input" id="ntr-custom-name" placeholder="Food Name" />
              <select class="ntr-modal-input" id="ntr-custom-meal">
                <option value="Breakfast">Breakfast</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
                <option value="Post-Workout">Post-Workout</option>
                <option value="Snacks">Snacks</option>
              </select>
            </div>
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:6px;">
              <input type="number" class="ntr-modal-input" id="ntr-custom-serv" placeholder="Serving / Grams" />
              <input type="text" class="ntr-modal-input" id="ntr-custom-unit" placeholder="Unit" value="g" />
            </div>
            <div class="ntr-chips-row">
              <button class="ntr-chip" data-mult="0.5">0.5×</button>
              <button class="ntr-chip" data-mult="1.0">1.0×</button>
              <button class="ntr-chip" data-mult="1.5">1.5×</button>
              <button class="ntr-chip" data-mult="2.0">2.0×</button>
              <button class="ntr-chip" data-add="50">+50g</button>
              <button class="ntr-chip" data-add="100">+100g</button>
            </div>
            <div class="ntr-macro-input-grid">
              <div><div class="ntr-mini-lbl">Calories</div><input type="number" class="ntr-mini-inp" id="ntr-in-cals" placeholder="0" /></div>
              <div><div class="ntr-mini-lbl">Protein (g)</div><input type="number" class="ntr-mini-inp" id="ntr-in-p" placeholder="0" /></div>
              <div><div class="ntr-mini-lbl">Fat (g)</div><input type="number" class="ntr-mini-inp" id="ntr-in-f" placeholder="0" /></div>
              <div><div class="ntr-mini-lbl">Carbs (g)</div><input type="number" class="ntr-mini-inp" id="ntr-in-c" placeholder="0" /></div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button id="btn-close-ntr-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Cancel</button>
              <button id="btn-save-ntr-food" class="ntr-btn" style="padding:8px 16px; background:#2563eb; border:none; color:var(--soma-text); border-radius:6px; font-weight:700;">+ Log Item</button>
            </div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="edit-row-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>✏️ Edit Entry</span><button class="ntr-del-btn" id="btn-close-edit-x">✕</button></div>
            <input type="text" class="ntr-modal-input" id="edit-food-name" />
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:6px;">
              <select class="ntr-modal-input" id="edit-food-meal">
                <option value="Breakfast">Breakfast</option>
                <option value="Lunch">Lunch</option>
                <option value="Dinner">Dinner</option>
                <option value="Post-Workout">Post-Workout</option>
                <option value="Snacks">Snacks</option>
              </select>
              <input type="text" class="ntr-modal-input" id="edit-food-serving" />
            </div>
            <div class="ntr-macro-input-grid">
              <div><div class="ntr-mini-lbl">Calories</div><input type="number" class="ntr-mini-inp" id="edit-food-cals" /></div>
              <div><div class="ntr-mini-lbl">Protein (g)</div><input type="number" class="ntr-mini-inp" id="edit-food-p" /></div>
              <div><div class="ntr-mini-lbl">Fat (g)</div><input type="number" class="ntr-mini-inp" id="edit-food-f" /></div>
              <div><div class="ntr-mini-lbl">Carbs (g)</div><input type="number" class="ntr-mini-inp" id="edit-food-c" /></div>
            </div>
            <div style="display:flex; justify-content:space-between; gap:8px; margin-top:8px;">
              <button id="btn-delete-active-row" class="ntr-btn" style="padding:8px 12px; background:#450a0a; border:1px solid #7f1d1d; color:#fca5a5; border-radius:6px; font-weight:700;">🗑️ Delete</button>
              <div style="display:flex; gap:8px;">
                <button id="btn-close-edit-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Cancel</button>
                <button id="btn-save-edited-row" class="ntr-btn" style="padding:8px 16px; background:#2563eb; border:none; color:var(--soma-text); border-radius:6px; font-weight:700;">Save</button>
              </div>
            </div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="food-library-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>📚 Food Library</span><button class="ntr-del-btn" id="btn-close-lib-x">✕</button></div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
              <input type="text" class="ntr-modal-input" id="lib-filter-input" placeholder="Search library..." style="margin-bottom:0;" />
              <button id="btn-lib-create-new" class="ntr-btn" style="background:var(--soma-border); border:1px solid #3f3f46; color:var(--soma-text); border-radius:6px; padding:0 12px; font-weight:700; font-size:0.75rem; height:38px; white-space:nowrap;">+ New</button>
            </div>
            <div class="ntr-search-results" id="lib-foods-list" style="max-height:260px;"></div>
            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
              <button id="btn-close-lib-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Close</button>
            </div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="custom-food-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>✨ Save Food to Library</span><button class="ntr-del-btn" id="btn-close-cf-x">✕</button></div>
            <input type="text" class="ntr-modal-input" id="cf-name" placeholder="Food Name (e.g. Soummam 0%)" />
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:6px;">
              <input type="number" class="ntr-modal-input" id="cf-serving" placeholder="Serving Base" value="100" />
              <input type="text" class="ntr-modal-input" id="cf-unit" placeholder="Unit" value="g" />
            </div>
            <div class="ntr-macro-input-grid">
              <div><div class="ntr-mini-lbl">Calories</div><input type="number" class="ntr-mini-inp" id="cf-cals" placeholder="100" /></div>
              <div><div class="ntr-mini-lbl">Protein (g)</div><input type="number" class="ntr-mini-inp" id="cf-p" placeholder="10" /></div>
              <div><div class="ntr-mini-lbl">Fat (g)</div><input type="number" class="ntr-mini-inp" id="cf-f" placeholder="2" /></div>
              <div><div class="ntr-mini-lbl">Carbs (g)</div><input type="number" class="ntr-mini-inp" id="cf-c" placeholder="15" /></div>
            </div>
            <label style="display:flex; align-items:center; gap:8px; font-size:0.75rem; color:var(--soma-text-dim); margin-bottom:12px; cursor:pointer;">
              <input type="checkbox" id="cf-auto-log" checked /> Log to diary today
            </label>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button id="btn-close-cf-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Cancel</button>
              <button id="btn-save-permanent-cf" class="ntr-btn" style="padding:8px 16px; background:#2563eb; border:none; color:var(--soma-text); border-radius:6px; font-weight:700;">Save Food</button>
            </div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="meal-builder-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>🍱 Combine Foods</span><button class="ntr-del-btn" id="btn-close-mb-x">✕</button></div>
            <input type="text" class="ntr-modal-input" id="mb-meal-name" placeholder="Meal Name (e.g. Tuna Pasta Bowl)" />
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:6px; margin-bottom:8px;">
              <select class="ntr-modal-input" id="mb-select-food" style="margin-bottom:0;"></select>
              <input type="number" class="ntr-modal-input" id="mb-add-qty" placeholder="Grams" value="100" style="margin-bottom:0;" />
            </div>
            <button id="btn-mb-add-item" class="ntr-btn" style="width:100%; background:var(--soma-surface); color:var(--soma-text-dim); border:1px solid var(--soma-border); border-radius:6px; padding:7px; font-weight:700; font-size:0.74rem; margin-bottom:10px;">+ Add Ingredient</button>
            <div id="mb-ingredients-list" style="max-height:120px; overflow-y:auto; margin-bottom:10px; border:1px solid var(--soma-border); border-radius:6px; padding:6px; background:var(--soma-surface);"></div>
            <div style="background:var(--soma-surface); border:1px solid var(--soma-border); border-radius:6px; padding:8px 10px; margin-bottom:12px;">
              <div style="font-size:0.68rem; font-weight:700; color:var(--soma-text-faint); margin-bottom:4px;">COMBINED TOTALS</div>
              <div id="mb-totals-display" style="display:flex; justify-content:space-between; font-size:0.78rem; font-weight:800;">
                <span style="color:var(--soma-warn);">0 kcal</span>
                <span style="color:var(--soma-accent-text);">P: 0g</span>
                <span style="color:var(--soma-danger);">F: 0g</span>
                <span style="color:#0ea5e9;">C: 0g</span>
              </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button id="btn-close-mb-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Cancel</button>
              <button id="btn-mb-log-meal" class="ntr-btn" style="padding:8px 16px; background:#2563eb; border:none; color:var(--soma-text); border-radius:6px; font-weight:700;">Log Meal</button>
            </div>
          </div>
        </div>

        <div class="ntr-modal-overlay" id="barcode-modal">
          <div class="ntr-modal-box">
            <div class="ntr-modal-title"><span>📷 Barcode Scanner</span><button class="ntr-del-btn" id="btn-close-bc-x">✕</button></div>
            <video id="bc-video" class="ntr-video-feed" playsinline muted></video>
            <div id="bc-status" style="font-size:0.74rem; color:var(--soma-info); text-align:center; margin-bottom:8px; font-weight:700;">Point camera at barcode...</div>
            <div style="display:flex; gap:6px; margin-bottom:10px;">
              <input type="text" class="ntr-modal-input" id="bc-manual-input" placeholder="Enter barcode number" style="margin-bottom:0;" />
              <button id="btn-bc-fetch" class="ntr-btn" style="background:#2563eb; color:var(--soma-text); border:none; border-radius:6px; padding:0 14px; font-weight:700; font-size:0.75rem;">Lookup</button>
            </div>
            <div id="bc-result-preview" style="display:none; background:var(--soma-surface); border:1px solid var(--soma-border); border-radius:6px; padding:10px; margin-bottom:10px;">
              <div id="bc-prod-name" style="font-weight:800; font-size:0.85rem; color:var(--soma-text);"></div>
              <div id="bc-prod-macros" style="font-size:0.75rem; color:var(--soma-text-dim); margin-top:4px;"></div>
              <button id="btn-bc-use-prod" class="ntr-btn" style="width:100%; background:var(--soma-accent-dim); color:var(--soma-text); border:none; border-radius:6px; padding:8px; font-weight:700; font-size:0.78rem; margin-top:8px;">Add to Library</button>
            </div>
            <div style="display:flex; justify-content:flex-end;">
              <button id="btn-close-bc-modal" class="ntr-btn" style="padding:8px 14px; background:var(--soma-surface); border:1px solid var(--soma-border); color:var(--soma-text); border-radius:6px; font-weight:700;">Close</button>
            </div>
          </div>
        </div>
      `;

      attachEvents();
    };

    const attachEvents = () => {
      const bwInp = root.querySelector("#inp-scale-weight");
      if (bwInp) {
        bwInp.addEventListener("change", async (e) => {
          const val = parseFloat(e.target.value);
          if (!isNaN(val)) {
            dayData.bodyWeight = val;
            if (nutritionDB._settings?.autoProteinTarget) {
              const perKg = nutritionDB._settings.proteinPerKg || 2.0;
              dayData.goals.protein = Math.round(val * perKg);
            }
            await saveNutrition();
            render();
            new Notice(`Scale weight updated: ${val} kg`);
          }
        });
      }

      root.querySelector("#w-plus-250")?.addEventListener("click", async () => { dayData.water = (dayData.water || 0) + 250; await saveNutrition(); render(); });
      root.querySelector("#w-plus-500")?.addEventListener("click", async () => { dayData.water = (dayData.water || 0) + 500; await saveNutrition(); render(); });
      root.querySelector("#w-reset")?.addEventListener("click", async () => { dayData.water = 0; await saveNutrition(); render(); });
      root.querySelectorAll(".ntr-water-node").forEach(node => {
        node.addEventListener("click", async () => { dayData.water = parseInt(node.dataset.vol, 10); await saveNutrition(); render(); });
      });

      root.querySelectorAll(".ntr-meal-header").forEach(mh => {
        mh.addEventListener("click", async (e) => {
          if (e.target.classList.contains('btn-quick-add')) return;
          const meal = mh.dataset.meal;
          dayData.mealCollapse[meal] = !dayData.mealCollapse[meal];
          await saveNutrition();
          render();
        });
      });

      root.querySelectorAll(".btn-quick-add").forEach(qa => {
        qa.addEventListener("click", (e) => {
          e.stopPropagation();
          const targetMeal = qa.dataset.meal;
          logModal.style.display = "flex";
          root.querySelector("#ntr-custom-meal").value = targetMeal;
          searchInp.value = "";
          selectedFoodRef = null;
          renderSearchList("");
          root.querySelector("#ntr-custom-name").value = "";
          servInp.value = "100";
          unitInp.value = "g";
          root.querySelector("#ntr-in-cals").value = "";
          root.querySelector("#ntr-in-p").value = "";
          root.querySelector("#ntr-in-f").value = "";
          root.querySelector("#ntr-in-c").value = "";
          searchInp.focus({ preventScroll: true });
        });
      });

      let activeEditingIndex = -1;
      const editModal = root.querySelector("#edit-row-modal");

      root.querySelectorAll(".ntr-row-item").forEach(row => {
        row.addEventListener("click", (e) => {
          if (e.target.classList.contains('btn-direct-del')) return;
          const idx = parseInt(row.dataset.idx, 10);
          if (isNaN(idx) || !dayData.items[idx]) return;
          activeEditingIndex = idx;
          const item = dayData.items[idx];

          root.querySelector("#edit-food-name").value = item.name;
          root.querySelector("#edit-food-meal").value = item.meal || "Snacks";
          root.querySelector("#edit-food-serving").value = item.serving || "100 g";
          root.querySelector("#edit-food-cals").value = item.cals;
          root.querySelector("#edit-food-p").value = item.p;
          root.querySelector("#edit-food-f").value = item.f;
          root.querySelector("#edit-food-c").value = item.c;

          editModal.style.display = "flex";
        });
      });

      root.querySelector("#btn-close-edit-modal")?.addEventListener("click", () => { editModal.style.display = "none"; });
      root.querySelector("#btn-close-edit-x")?.addEventListener("click", () => { editModal.style.display = "none"; });

      root.querySelector("#btn-save-edited-row")?.addEventListener("click", async () => {
        if (activeEditingIndex < 0 || !dayData.items[activeEditingIndex]) return;
        const item = dayData.items[activeEditingIndex];
        item.name = root.querySelector("#edit-food-name").value.trim() || item.name;
        item.meal = root.querySelector("#edit-food-meal").value;
        item.serving = root.querySelector("#edit-food-serving").value.trim() || item.serving;
        item.cals = parseFloat(root.querySelector("#edit-food-cals").value) || 0;
        item.p = parseFloat(root.querySelector("#edit-food-p").value) || 0;
        item.f = parseFloat(root.querySelector("#edit-food-f").value) || 0;
        item.c = parseFloat(root.querySelector("#edit-food-c").value) || 0;

        await saveNutrition();
        editModal.style.display = "none";
        render();
      });

      root.querySelector("#btn-delete-active-row")?.addEventListener("click", async () => {
        if (activeEditingIndex >= 0) {
          dayData.items.splice(activeEditingIndex, 1);
          await saveNutrition();
          editModal.style.display = "none";
          render();
        }
      });

      root.querySelectorAll(".btn-direct-del").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.idx, 10);
          if (!isNaN(idx)) {
            dayData.items.splice(idx, 1);
            await saveNutrition();
            render();
          }
        });
      });

      root.querySelector("#btn-copy-yesterday")?.addEventListener("click", async () => {
        let parsedD = new Date(noteDateKey);
        if (isNaN(parsedD.getTime())) parsedD = new Date();
        parsedD.setDate(parsedD.getDate() - 1);
        const yesterdayKey = getLocalDateKey(parsedD);
        const prevEntry = nutritionDB[yesterdayKey];

        if (prevEntry && prevEntry.items && prevEntry.items.length > 0) {
          const cloned = JSON.parse(JSON.stringify(prevEntry.items));
          dayData.items.push(...cloned);
          await saveNutrition();
          render();
        } else {
          new Notice(`No entries found for yesterday (${yesterdayKey}).`);
        }
      });

      const goalsModal = root.querySelector("#goals-modal");
      root.querySelector("#btn-open-goals-modal")?.addEventListener("click", () => { goalsModal.style.display = "flex"; });
      root.querySelector("#btn-close-goals-modal")?.addEventListener("click", () => { goalsModal.style.display = "none"; });
      root.querySelector("#btn-close-goals-x")?.addEventListener("click", () => { goalsModal.style.display = "none"; });

      root.querySelector("#btn-save-goals")?.addEventListener("click", async () => {
        const newGoals = {
          cals: parseFloat(root.querySelector("#inp-goal-cals").value) || DEFAULT_GOALS.cals,
          protein: parseFloat(root.querySelector("#inp-goal-p").value) || DEFAULT_GOALS.protein,
          fat: parseFloat(root.querySelector("#inp-goal-f").value) || DEFAULT_GOALS.fat,
          carbs: parseFloat(root.querySelector("#inp-goal-c").value) || DEFAULT_GOALS.carbs,
          water: parseFloat(root.querySelector("#inp-goal-water").value) || 3500,
          fiber: parseFloat(root.querySelector("#inp-goal-fiber").value) || 35,
          calcium: parseFloat(root.querySelector("#inp-goal-calcium").value) || 1000,
          iron: parseFloat(root.querySelector("#inp-goal-iron").value) || 18,
          magnesium: parseFloat(root.querySelector("#inp-goal-magnesium").value) || 400,
          potassium: parseFloat(root.querySelector("#inp-goal-potassium").value) || 3500,
          sodium: parseFloat(root.querySelector("#inp-goal-sodium").value) || 2300,
          zinc: parseFloat(root.querySelector("#inp-goal-zinc").value) || 11
        };
        dayData.goals = newGoals;

        if (root.querySelector("#chk-save-default-goals").checked) {
          nutritionDB.__defaultGoals = { ...newGoals };
        }

        await saveNutrition();
        goalsModal.style.display = "none";
        render();
      });

      root.querySelector("#toggle-summary")?.addEventListener("click", async () => { dayData.summaryOpen = !dayData.summaryOpen; await saveNutrition(); render(); });
      root.querySelector("#toggle-table")?.addEventListener("click", async () => { dayData.tableOpen = !dayData.tableOpen; await saveNutrition(); render(); });
      root.querySelector("#toggle-micro")?.addEventListener("click", async () => { dayData.microOpen = !dayData.microOpen; await saveNutrition(); render(); });

      const logModal = root.querySelector("#ntr-modal");
      const searchInp = root.querySelector("#ntr-search-food");
      const searchRes = root.querySelector("#ntr-search-res");
      const servInp = root.querySelector("#ntr-custom-serv");
      const unitInp = root.querySelector("#ntr-custom-unit");
      let selectedFoodRef = null;

      const updateScaledNutrients = (enteredQty, baseFood) => {
        if (!baseFood) return;
        const qty = parseFloat(enteredQty) || baseFood.serving;
        const ratio = qty / baseFood.serving;

        root.querySelector("#ntr-in-cals").value = Math.round(baseFood.cals * ratio * 10) / 10;
        root.querySelector("#ntr-in-p").value = Math.round(baseFood.p * ratio * 10) / 10;
        root.querySelector("#ntr-in-f").value = Math.round(baseFood.f * ratio * 10) / 10;
        root.querySelector("#ntr-in-c").value = Math.round(baseFood.c * ratio * 10) / 10;
      };

      const renderSearchList = (query) => {
        const q = (query || "").toLowerCase();
        const sorted = [...foodLibrary].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        const filtered = sorted.filter(f => f.name.toLowerCase().includes(q));

        searchRes.innerHTML = filtered.map(f => `
          <div class="ntr-search-item" data-name="${f.name}">
            <div>
              <div style="font-weight:700; color:var(--soma-text); font-size:0.8rem;">
                ${f.name} ${!f.isBase ? '<span style="color:#fde68a; font-size:0.65rem; background:var(--soma-border); padding:1px 4px; border-radius:3px;">Custom</span>' : ''}
                <span style="color:var(--soma-text-faint); font-size:0.7rem;">(${f.serving} ${f.unit || 'g'})</span>
              </div>
              <div style="font-size:0.68rem; color:var(--soma-text-dim);">${f.cals} kcal • P: ${f.p}g | F: ${f.f}g | C: ${f.c}g</div>
            </div>
          </div>
        `).join("");

        searchRes.querySelectorAll(".ntr-search-item").forEach(item => {
          item.addEventListener("click", () => {
            const found = foodLibrary.find(f => f.name === item.dataset.name);
            if (found) {
              selectedFoodRef = found;
              root.querySelector("#ntr-custom-name").value = found.name;
              servInp.value = found.serving;
              unitInp.value = found.unit || "g";
              updateScaledNutrients(found.serving, found);
            }
          });
        });
      };

      servInp?.addEventListener("input", () => {
        if (selectedFoodRef) updateScaledNutrients(servInp.value, selectedFoodRef);
      });

      root.querySelectorAll(".ntr-chip").forEach(ch => {
        ch.addEventListener("click", () => {
          if (!selectedFoodRef) return;
          let cur = parseFloat(servInp.value) || selectedFoodRef.serving;
          if (ch.dataset.mult) {
            cur = selectedFoodRef.serving * parseFloat(ch.dataset.mult);
          } else if (ch.dataset.add) {
            cur += parseFloat(ch.dataset.add);
          }
          servInp.value = Math.round(cur);
          updateScaledNutrients(servInp.value, selectedFoodRef);
        });
      });

      root.querySelector("#btn-open-modal")?.addEventListener("click", () => {
        logModal.style.display = "flex";
        searchInp.value = "";
        selectedFoodRef = null;
        renderSearchList("");
        root.querySelector("#ntr-custom-name").value = "";
        servInp.value = "100";
        unitInp.value = "g";
        root.querySelector("#ntr-in-cals").value = "";
        root.querySelector("#ntr-in-p").value = "";
        root.querySelector("#ntr-in-f").value = "";
        root.querySelector("#ntr-in-c").value = "";
        searchInp.focus({ preventScroll: true });
      });

      searchInp?.addEventListener("input", () => renderSearchList(searchInp.value));
      root.querySelector("#btn-close-ntr-modal")?.addEventListener("click", () => { logModal.style.display = "none"; });
      root.querySelector("#btn-close-log-x")?.addEventListener("click", () => { logModal.style.display = "none"; });

      root.querySelector("#btn-save-ntr-food")?.addEventListener("click", async () => {
        const name = root.querySelector("#ntr-custom-name").value.trim() || "Food Item";
        const meal = root.querySelector("#ntr-custom-meal").value;
        const serv = `${servInp.value.trim() || "100"} ${unitInp.value.trim() || "g"}`;
        const cals = parseFloat(root.querySelector("#ntr-in-cals").value) || 0;
        const p = parseFloat(root.querySelector("#ntr-in-p").value) || 0;
        const f = parseFloat(root.querySelector("#ntr-in-f").value) || 0;
        const c = parseFloat(root.querySelector("#ntr-in-c").value) || 0;

        let microObj = {};
        if (selectedFoodRef) {
          const ratio = (parseFloat(servInp.value) || selectedFoodRef.serving) / selectedFoodRef.serving;
          microObj = {
            fiber: Math.round((selectedFoodRef.fiber || 0) * ratio * 10) / 10,
            calcium: Math.round((selectedFoodRef.calcium || 0) * ratio * 10) / 10,
            iron: Math.round((selectedFoodRef.iron || 0) * ratio * 10) / 10,
            magnesium: Math.round((selectedFoodRef.magnesium || 0) * ratio * 10) / 10,
            potassium: Math.round((selectedFoodRef.potassium || 0) * ratio * 10) / 10,
            sodium: Math.round((selectedFoodRef.sodium || 0) * ratio * 10) / 10,
            zinc: Math.round((selectedFoodRef.zinc || 0) * ratio * 10) / 10
          };
          await incrementFoodUsage(selectedFoodRef.name);
        }

        dayData.items.push({ name, meal, serving: serv, cals, p, f, c, ...microObj });
        await saveNutrition();
        logModal.style.display = "none";
        render();
      });

      const libModal = root.querySelector("#food-library-modal");
      const libFilterInp = root.querySelector("#lib-filter-input");
      const libFoodsList = root.querySelector("#lib-foods-list");

      const renderLibraryList = (query) => {
        const q = (query || "").toLowerCase();
        const sorted = [...foodLibrary].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
        const filtered = sorted.filter(f => f.name.toLowerCase().includes(q));

        if (filtered.length === 0) {
          libFoodsList.innerHTML = '<div style="padding:10px; color:var(--soma-text-faint); text-align:center; font-size:0.75rem;">No foods found. Click "+ New" to add.</div>';
          return;
        }

        libFoodsList.innerHTML = filtered.map(f => `
          <div class="ntr-search-item lib-item" data-name="${f.name}">
            <div style="flex:1;">
              <div style="font-weight:700; color:var(--soma-text); font-size:0.8rem;">
                ${f.name} ${!f.isBase ? '<span style="color:#fde68a; font-size:0.65rem; background:var(--soma-surface-2); padding:1px 5px; border-radius:3px;">Custom</span>' : ''}
                <span style="color:var(--soma-text-faint); font-size:0.7rem;">(${f.serving} ${f.unit || 'g'})</span>
              </div>
              <div style="font-size:0.68rem; color:var(--soma-text-dim);">${f.cals} kcal • P: ${f.p}g | F: ${f.f}g | C: ${f.c}g</div>
            </div>
            ${!f.isBase ? `<button class="ntr-del-btn btn-del-cf" data-name="${f.name}" title="Delete">✕</button>` : ''}
          </div>
        `).join("");

        libFoodsList.querySelectorAll(".lib-item").forEach(item => {
          item.addEventListener("click", (e) => {
            if (e.target.classList.contains('btn-del-cf')) return;
            const found = foodLibrary.find(f => f.name === item.dataset.name);
            if (found) {
              libModal.style.display = "none";
              logModal.style.display = "flex";
              selectedFoodRef = found;
              root.querySelector("#ntr-custom-name").value = found.name;
              servInp.value = found.serving;
              unitInp.value = found.unit || "g";
              updateScaledNutrients(found.serving, found);
            }
          });
        });

        libFoodsList.querySelectorAll(".btn-del-cf").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const foodName = btn.dataset.name;
            customFoods = customFoods.filter(f => f.name !== foodName);
            await saveCustomFoods();
            renderLibraryList(libFilterInp.value);
          });
        });
      };

      root.querySelector("#btn-open-food-library")?.addEventListener("click", () => {
        libModal.style.display = "flex";
        libFilterInp.value = "";
        renderLibraryList("");
        libFilterInp.focus({ preventScroll: true });
      });
      libFilterInp?.addEventListener("input", () => renderLibraryList(libFilterInp.value));
      root.querySelector("#btn-close-lib-modal")?.addEventListener("click", () => { libModal.style.display = "none"; });
      root.querySelector("#btn-close-lib-x")?.addEventListener("click", () => { libModal.style.display = "none"; });

      root.querySelector("#btn-lib-create-new")?.addEventListener("click", () => {
        libModal.style.display = "none";
        cfModal.style.display = "flex";
        root.querySelector("#cf-name").value = "";
        root.querySelector("#cf-serving").value = "100";
        root.querySelector("#cf-unit").value = "g";
        root.querySelector("#cf-cals").value = "";
        root.querySelector("#cf-p").value = "";
        root.querySelector("#cf-f").value = "";
        root.querySelector("#cf-c").value = "";
        root.querySelector("#cf-name").focus({ preventScroll: true });
      });

      const cfModal = root.querySelector("#custom-food-modal");
      root.querySelector("#btn-close-cf-modal")?.addEventListener("click", () => { cfModal.style.display = "none"; });
      root.querySelector("#btn-close-cf-x")?.addEventListener("click", () => { cfModal.style.display = "none"; });

      root.querySelector("#btn-save-permanent-cf")?.addEventListener("click", async () => {
        const name = root.querySelector("#cf-name").value.trim();
        if (!name) return;

        const serv = parseFloat(root.querySelector("#cf-serving").value) || 100;
        const unit = root.querySelector("#cf-unit").value.trim() || "g";
        const cals = parseFloat(root.querySelector("#cf-cals").value) || 0;
        const p = parseFloat(root.querySelector("#cf-p").value) || 0;
        const f = parseFloat(root.querySelector("#cf-f").value) || 0;
        const c = parseFloat(root.querySelector("#cf-c").value) || 0;
        const autoLog = root.querySelector("#cf-auto-log").checked;

        const newFood = { name, serving: serv, unit, cals, p, f, c, isBase: false, usageCount: 1 };
        customFoods.push(newFood);
        await saveCustomFoods();

        if (autoLog) {
          dayData.items.push({ name, meal: "Snacks", serving: `${serv} ${unit}`, cals, p, f, c });
          await saveNutrition();
        }

        cfModal.style.display = "none";
        render();
      });

      const mbModal = root.querySelector("#meal-builder-modal");
      const mbSelect = root.querySelector("#mb-select-food");
      const mbQtyInp = root.querySelector("#mb-add-qty");
      const mbIngList = root.querySelector("#mb-ingredients-list");
      const mbTotalsDisp = root.querySelector("#mb-totals-display");
      let activeMealIngredients = [];

      const updateMealTotals = () => {
        let totCals = 0, totP = 0, totF = 0, totC = 0;
        mbIngList.innerHTML = activeMealIngredients.map((ing, idx) => {
          totCals += ing.cals; totP += ing.p; totF += ing.f; totC += ing.c;
          return `
            <div class="ntr-row-item" style="grid-template-columns: 2fr 1fr 20px; padding: 4px 0;">
              <div style="font-size:0.75rem; color:var(--soma-text);">${ing.name} <span style="color:var(--soma-text-faint);">(${ing.qty}g)</span></div>
              <div style="font-size:0.72rem; color:var(--soma-warn); text-align:right;">${ing.cals.toFixed(0)} kcal</div>
              <button class="ntr-del-btn btn-del-ing" data-idx="${idx}">✕</button>
            </div>
          `;
        }).join("");

        if (activeMealIngredients.length === 0) {
          mbIngList.innerHTML = '<div style="color:var(--soma-text-faint); font-size:0.72rem; text-align:center;">No ingredients added</div>';
        }

        mbTotalsDisp.innerHTML = `
          <span style="color:var(--soma-warn);">${totCals.toFixed(1)} kcal</span>
          <span style="color:var(--soma-accent-text);">P: ${totP.toFixed(1)}g</span>
          <span style="color:var(--soma-danger);">F: ${totF.toFixed(1)}g</span>
          <span style="color:#0ea5e9;">C: ${totC.toFixed(1)}g</span>
        `;

        mbIngList.querySelectorAll(".btn-del-ing").forEach(b => {
          b.addEventListener("click", () => {
            activeMealIngredients.splice(parseInt(b.dataset.idx, 10), 1);
            updateMealTotals();
          });
        });
      };

      root.querySelector("#btn-open-meal-builder")?.addEventListener("click", () => {
        mbModal.style.display = "flex";
        activeMealIngredients = [];
        mbSelect.innerHTML = foodLibrary.map(f => `<option value="${f.name}">${f.name} (${f.serving}${f.unit || 'g'})</option>`).join("");
        updateMealTotals();
      });
      root.querySelector("#btn-close-mb-modal")?.addEventListener("click", () => { mbModal.style.display = "none"; });
      root.querySelector("#btn-close-mb-x")?.addEventListener("click", () => { mbModal.style.display = "none"; });

      root.querySelector("#btn-mb-add-item")?.addEventListener("click", () => {
        const selectedName = mbSelect.value.split(" (")[0];
        const food = foodLibrary.find(f => f.name === selectedName);
        const qty = parseFloat(mbQtyInp.value) || 100;

        if (food) {
          const ratio = qty / food.serving;
          activeMealIngredients.push({
            name: food.name,
            qty: qty,
            cals: Math.round(food.cals * ratio * 10) / 10,
            p: Math.round(food.p * ratio * 10) / 10,
            f: Math.round(food.f * ratio * 10) / 10,
            c: Math.round(food.c * ratio * 10) / 10
          });
          updateMealTotals();
        }
      });

      root.querySelector("#btn-mb-log-meal")?.addEventListener("click", async () => {
        if (activeMealIngredients.length === 0) return;
        const mealName = root.querySelector("#mb-meal-name").value.trim() || "Combined Meal";
        let totCals = 0, totP = 0, totF = 0, totC = 0, totGrams = 0;

        activeMealIngredients.forEach(i => {
          totCals += i.cals; totP += i.p; totF += i.f; totC += i.c; totGrams += i.qty;
        });

        dayData.items.push({
          name: mealName,
          meal: "Lunch",
          serving: `${totGrams} g`,
          cals: Math.round(totCals * 10) / 10,
          p: Math.round(totP * 10) / 10,
          f: Math.round(totF * 10) / 10,
          c: Math.round(totC * 10) / 10
        });

        await saveNutrition();
        mbModal.style.display = "none";
        render();
      });

      const bcModal = root.querySelector("#barcode-modal");
      const bcVideo = root.querySelector("#bc-video");
      const bcStatus = root.querySelector("#bc-status");
      const bcManualInp = root.querySelector("#bc-manual-input");
      const bcPreview = root.querySelector("#bc-result-preview");
      const bcProdName = root.querySelector("#bc-prod-name");
      const bcProdMacros = root.querySelector("#bc-prod-macros");
      const btnBcUse = root.querySelector("#btn-bc-use-prod");

      let videoStream = null;
      let scanInterval = null;
      let zxingReader = null;
      let scannedProductData = null;

      const stopCamera = () => {
        if (scanInterval) this.untrackInterval(scanInterval);
        if (zxingReader) {
          try { zxingReader.reset(); } catch (e) {}
          zxingReader = null;
        }
        if (videoStream) {
          videoStream.getTracks().forEach(t => t.stop());
          videoStream = null;
        }
      };

      // iOS (Obsidian's WKWebView) has no native BarcodeDetector API, which
      // is why the camera used to sit there doing nothing. We lazy-load a
      // pure-JS decoder (ZXing) as a fallback so scanning actually works
      // there too — but instead of injecting a <script src="https://...">
      // tag, which Obsidian's mobile webview can silently block (the
      // request never fires onload OR onerror, so the UI just hangs on
      // "Loading scanner..." forever, indistinguishable from "just a
      // camera"), we fetch the library's source with Obsidian's own
      // requestUrl (which isn't subject to that page-level restriction)
      // and execute it directly. Loaded once and cached on window.
      const ensureZXing = () => {
        if (window.ZXing) return Promise.resolve(window.ZXing);
        if (!window.__somaZXingLoading) {
          window.__somaZXingLoading = (async () => {
            const resp = await requestUrl({
              url: "https://cdn.jsdelivr.net/npm/@zxing/library@0.20.0/umd/index.min.js",
              method: "GET"
            });
            if (!resp || !resp.text) throw new Error("ZXing download returned no content");
            // Execute the UMD bundle so it attaches itself to window.ZXing,
            // same as a <script> tag would. The three undefined parameters are
            // load-bearing: Obsidian desktop is Electron with node integration,
            // so `module` and `exports` exist as GLOBALS. A UMD bundle checks
            // for those first and, finding them, assigns itself to exports and
            // never touches window.ZXing — the load silently "succeeds" while
            // the scanner can never start. Declaring module/exports/define as
            // parameters shadows the globals with undefined, forcing the UMD
            // down its browser branch.
            const runInGlobalScope = new Function("module", "exports", "define", resp.text);
            runInGlobalScope.call(window, undefined, undefined, undefined);
            if (!window.ZXing) throw new Error("ZXing script ran but did not attach to window.ZXing");
            return window.ZXing;
          })().catch((err) => {
            window.__somaZXingLoading = null;
            throw err;
          });
        }
        return window.__somaZXingLoading;
      };

      // Different products/regions register the same barcode under slightly
      // different digit lengths (12-digit UPC-A vs 13-digit EAN-13 with a
      // leading 0). This produced the "false or missing" lookups. We try
      // the sensible variants automatically before giving up.
      const barcodeVariants = (code) => {
        const c = String(code).trim();
        const variants = [c];
        if (c.length === 12) variants.push("0" + c);
        if (c.length === 13 && c.startsWith("0")) variants.push(c.slice(1));
        return [...new Set(variants)];
      };

      const tryFetchJson = async (url) => {
        try {
          const resp = await requestUrl({ url, method: "GET" });
          return resp.json;
        } catch (e) {
          return null;
        }
      };

      const parseOFFProduct = (prod, barcode) => {
        const name = prod.product_name || prod.product_name_fr || prod.product_name_en || null;
        if (!name) return null;
        const nutriments = prod.nutriments || {};
        const cals = nutriments["energy-kcal_100g"] || nutriments["energy-kcal"] || Math.round((nutriments["energy_100g"] || 0) / 4.184) || 0;
        return {
          name,
          barcode,
          serving: 100,
          unit: "g",
          cals: Math.round(cals * 10) / 10,
          p: Math.round((nutriments.proteins_100g || nutriments.proteins || 0) * 10) / 10,
          f: Math.round((nutriments.fat_100g || nutriments.fat || 0) * 10) / 10,
          c: Math.round((nutriments.carbohydrates_100g || nutriments.carbohydrates || 0) * 10) / 10,
          isBase: false,
          usageCount: 1
        };
      };

      // Provider chain: Open Food Facts first (best coverage incl. North
      // African / Algerian products, esp. French-labelled ones), then its
      // sister "Open Products Facts" database (products sometimes get
      // logged there instead), then UPCItemDB as a last resort — it won't
      // have macros, but at least gets the product name so manual entry
      // is faster instead of starting from a blank card.
      const PRODUCT_PROVIDERS = [
        { label: "Open Food Facts", fetch: async (code) => {
            const data = await tryFetchJson(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
            return (data && data.status === 1 && data.product) ? parseOFFProduct(data.product, code) : null;
          }
        },
        { label: "Open Products Facts", fetch: async (code) => {
            const data = await tryFetchJson(`https://world.openproductsfacts.org/api/v0/product/${code}.json`);
            return (data && data.status === 1 && data.product) ? parseOFFProduct(data.product, code) : null;
          }
        },
        { label: "UPCItemDB", fetch: async (code) => {
            const data = await tryFetchJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`);
            const item = data && Array.isArray(data.items) && data.items[0];
            if (!item || !item.title) return null;
            return { name: item.title, barcode: code, serving: 100, unit: "g", cals: 0, p: 0, f: 0, c: 0, isBase: false, usageCount: 1, needsMacros: true };
          }
        }
      ];

      const fetchProductByBarcode = async (barcode) => {
        const cached = customFoods.find(f => f.barcode === barcode);
        if (cached) {
          scannedProductData = { ...cached };
          bcProdName.textContent = `${cached.name} (Cached)`;
          bcProdMacros.textContent = `Per ${cached.serving}${cached.unit}: ${cached.cals} kcal | P: ${cached.p}g | F: ${cached.f}g | C: ${cached.c}g`;
          bcPreview.style.display = "block";
          bcStatus.textContent = "Product loaded from offline cache";
          stopCamera();
          return;
        }

        const codesToTry = barcodeVariants(barcode);

        for (const provider of PRODUCT_PROVIDERS) {
          for (const code of codesToTry) {
            bcStatus.textContent = `Checking ${provider.label} (${code})...`;
            let result;
            try {
              result = await provider.fetch(code);
            } catch (e) {
              result = null;
            }
            if (result) {
              scannedProductData = result;
              if (!customFoods.some(f => f.name === result.name)) {
                customFoods.push(scannedProductData);
                await saveCustomFoods();
              }
              bcProdName.textContent = result.name + (result.needsMacros ? " (macros not available — please fill in)" : "");
              bcProdMacros.textContent = `Per 100g: ${result.cals} kcal | P: ${result.p}g | F: ${result.f}g | C: ${result.c}g`;
              bcPreview.style.display = "block";
              bcStatus.textContent = `Found via ${provider.label}`;
              stopCamera();
              return;
            }
          }
        }

        bcStatus.textContent = "Not found in any database. Try manual entry below.";
      };

      // The JS decoder path. Used when there's no native BarcodeDetector
      // (iOS) and as the recovery path when a native detector exists but
      // keeps failing (some desktop builds register the API without a
      // working implementation behind it).
      const startZXingScan = async () => {
        bcStatus.textContent = "Loading scanner (first time only)...";
        try {
          const ZXing = await ensureZXing();
          zxingReader = new ZXing.BrowserMultiFormatReader();
          bcStatus.textContent = "Camera active. Center barcode.";
          // decodeFromStream, NOT decodeFromVideoElement. The latter takes a
          // single argument in @zxing/library - passing a callback as a second
          // argument silently does nothing - and it decodes exactly ONCE into a
          // returned promise rather than watching the stream. That is why the
          // camera could sit on a centred barcode indefinitely.
          //
          // decodeFromStream attaches the stream and decodes continuously,
          // invoking the callback on every frame. The err argument is a
          // NotFoundException on frames with no barcode, which is normal.
          if (!videoStream) throw new Error("camera stream is not available");
          zxingReader.decodeFromStream(videoStream, bcVideo, async (result, err) => {
            if (result && typeof result.getText === "function") {
              const code = result.getText();
              bcManualInp.value = code;
              // Stop decoding before the lookup, so one barcode cannot fire
              // the fetch dozens of times while the camera stays pointed at it.
              if (zxingReader) { try { zxingReader.reset(); } catch (e) {} zxingReader = null; }
              await fetchProductByBarcode(code);
            }
          });
        } catch (e) {
          console.error("[SOMA] Barcode scanner failed to start:", e);
          bcStatus.textContent = "Scanner unavailable — enter the barcode manually below.";
        }
      };

      const startCamera = async () => {
        scannedProductData = null;
        bcPreview.style.display = "none";
        bcStatus.textContent = "Starting camera...";
        try {
          videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          bcVideo.srcObject = videoStream;
          await bcVideo.play();
          bcStatus.textContent = "Camera active. Center barcode.";

          if ('BarcodeDetector' in window) {
            const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });
            // A detector that throws on every frame is indistinguishable from
            // one that simply sees no barcode, so count the failures: a few in
            // a row means the API is broken here, not that the frame is empty.
            let consecutiveFailures = 0;
            scanInterval = this.trackInterval(async () => {
              try {
                const barcodes = await detector.detect(bcVideo);
                consecutiveFailures = 0;
                if (barcodes.length > 0) {
                  const code = barcodes[0].rawValue;
                  this.untrackInterval(scanInterval);
                  bcManualInp.value = code;
                  await fetchProductByBarcode(code);
                }
              } catch (e) {
                if (++consecutiveFailures >= 5) {
                  console.warn("[SOMA] Native BarcodeDetector failing, switching to JS decoder:", e);
                  this.untrackInterval(scanInterval);
                  startZXingScan();
                }
              }
            }, 600);
          } else {
            // No native scanner API — the normal case on iOS and on Windows.
            await startZXingScan();
          }
        } catch (e) {
          console.error("[SOMA] Camera unavailable:", e);
          bcStatus.textContent = "Camera unavailable. Enter barcode manually:";
        }
      };

      root.querySelector("#btn-open-barcode")?.addEventListener("click", () => {
        bcModal.style.display = "flex";
        bcManualInp.value = "";
        startCamera();
      });

      root.querySelector("#btn-close-bc-modal")?.addEventListener("click", () => { stopCamera(); bcModal.style.display = "none"; });
      root.querySelector("#btn-close-bc-x")?.addEventListener("click", () => { stopCamera(); bcModal.style.display = "none"; });
      root.querySelector("#btn-bc-fetch")?.addEventListener("click", () => {
        const code = bcManualInp.value.trim();
        if (code) fetchProductByBarcode(code);
      });

      btnBcUse?.addEventListener("click", () => {
        if (!scannedProductData) return;
        stopCamera();
        bcModal.style.display = "none";
        logModal.style.display = "flex";

        selectedFoodRef = scannedProductData;
        root.querySelector("#ntr-custom-name").value = scannedProductData.name;
        servInp.value = scannedProductData.serving;
        unitInp.value = scannedProductData.unit;
        updateScaledNutrients(scannedProductData.serving, scannedProductData);
      });
    };

    render();
  }

  // ==========================================================================
  // CODEBLOCK 6 & 7: MACRO & RECOMP AUDIT WIDGETS (`weekly-audit` & `monthly-audit`)
  // ==========================================================================
  // ==========================================================================
  // CODEBLOCK 9: HABIT TRACKER (`habittracker`) — merged from Habit Radar
  // ==========================================================================
  async mountHabitTracker(containerEl, source, ctx) {
    containerEl.empty();

    const store = new SomaHabitStore(this);
    await store.load();
    const pluginLike = {
      settings: store.settings,
      saveSettings: () => store.saveSettings()
    };

    const options = { view: "today", header: true, summary: true, tabs: true };
    const lines = (source || "").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const splitIdx = line.indexOf(":");
      if (splitIdx > -1) {
        const key = line.slice(0, splitIdx).trim().toLowerCase();
        const val = line.slice(splitIdx + 1).trim().toLowerCase();
        if (key === "view") options.view = val;
        if (key === "header") options.header = val !== "false";
        if (key === "summary") options.summary = val !== "false";
        if (key === "tabs") options.tabs = val !== "false";
      }
    }

    const controller = new HabitRadarUIController(this.app, pluginLike, containerEl, options);
    if (ctx && ctx.addChild) {
      const child = new HabitRadarRenderChild(containerEl, controller);
      ctx.addChild(child);
    } else {
      controller.render();
    }
    return controller;
  }

  async mountAuditWidget(containerEl, dayWindow = 7, title = "Audit") {
    containerEl.empty();
    const root = containerEl.createDiv({ cls: "soma-audit-root" });
    applySomaTheme(root, await this.readVaultJson(SETTINGS_FILE_PATH, {}));

    let history = await this.readHistory();
    let nutritionDB = await this.readNutrition({});
    let habitStore = new SomaHabitStore(this);
    await habitStore.load();
    const habits = habitStore.settings.habits || [];

    const now = new Date();
    let totalBurn = 0, loggedDays = 0, weights = [];
    let foodLoggedDays = 0;
    let habitChecksDone = 0;

    for (let i = 0; i < dayWindow; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12, 0, 0);
      const key = getLocalDateKey(d);
      if (history[key]) {
        loggedDays++;
        totalBurn += (history[key].caloriesBurned || 0);
      }
      if (nutritionDB[key] && nutritionDB[key].bodyWeight) {
        weights.push(nutritionDB[key].bodyWeight);
      }
      if (nutritionDB[key] && Array.isArray(nutritionDB[key].items) && nutritionDB[key].items.length > 0) {
        foodLoggedDays++;
      }
      habits.forEach(h => {
        if (h.history && h.history[key] === true) habitChecksDone++;
      });
    }

    const avgWeight = weights.length > 0 ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) : "N/A";
    const habitPossible = habits.length * dayWindow;
    const habitCompletionPct = habitPossible > 0 ? Math.round((habitChecksDone / habitPossible) * 100) : 0;

    root.innerHTML = `
      <div class="soma-card">
        <div class="soma-tag-badge">${dayWindow}-Day Review</div>
        <div style="font-size:1.05rem; font-weight:900; color:var(--soma-text); margin:4px 0 10px 0;">📊 ${title}</div>
        <div class="soma-stats-grid" style="grid-template-columns:repeat(3, 1fr); margin-bottom:10px;">
          <div class="soma-stat-box" style="text-align:center;"><div class="soma-stat-lbl">Active Burn</div><div class="soma-stat-val" style="font-size:1.1rem; color:var(--soma-warn);">${totalBurn.toLocaleString()} kcal</div></div>
          <div class="soma-stat-box" style="text-align:center;"><div class="soma-stat-lbl">Avg Weight</div><div class="soma-stat-val" style="font-size:1.1rem; color:var(--soma-info);">${avgWeight} kg</div></div>
          <div class="soma-stat-box" style="text-align:center;"><div class="soma-stat-lbl">Workouts Logged</div><div class="soma-stat-val" style="font-size:1.1rem; color:var(--soma-accent-text);">${loggedDays}/${dayWindow}d</div></div>
        </div>
        <div class="soma-stats-grid" style="grid-template-columns:repeat(3, 1fr); margin-bottom:0;">
          <div class="soma-stat-box" style="text-align:center;"><div class="soma-stat-lbl">Food Logged</div><div class="soma-stat-val" style="font-size:1.1rem; color:var(--soma-danger);">${foodLoggedDays}/${dayWindow}d</div></div>
          <div class="soma-stat-box" style="text-align:center;"><div class="soma-stat-lbl">Habit Completion</div><div class="soma-stat-val" style="font-size:1.1rem; color:#a855f7;">${habitPossible > 0 ? habitCompletionPct + '%' : 'N/A'}</div></div>
          <div class="soma-stat-box" style="text-align:center;"><div class="soma-stat-lbl">Habit Check-ins</div><div class="soma-stat-val" style="font-size:1.1rem; color:#22c55e;">${habitChecksDone}</div></div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // SHARED HELPER: Ensure nutrition DB always has a valid _settings block
  // ==========================================================================
  ensureNutritionSettings(nutritionDB) {
    if (!nutritionDB._settings) {
      nutritionDB._settings = { creatineStashGrams: 300, autoProteinTarget: false, proteinPerKg: 2.0 };
    } else {
      if (nutritionDB._settings.creatineStashGrams === undefined) nutritionDB._settings.creatineStashGrams = 300;
      if (nutritionDB._settings.autoProteinTarget === undefined) nutritionDB._settings.autoProteinTarget = false;
      if (nutritionDB._settings.proteinPerKg === undefined) nutritionDB._settings.proteinPerKg = 2.0;
    }
    return nutritionDB;
  }

  // ==========================================================================
  // CODEBLOCK 5: STANDALONE CREATINE TRACKER (`creatine-tracker`)
  // ==========================================================================
  async mountCreatineStandalone(containerEl, sourcePath) {
    containerEl.empty();
    const root = containerEl.createDiv({ cls: "cr-saturation-root" });
    applySomaTheme(root, await this.readVaultJson(SETTINGS_FILE_PATH, {}));

    const fileName = sourcePath ? sourcePath.split("/").pop() : "";
    const dateMatch = fileName ? fileName.match(/\d{4}-\d{2}-\d{2}/) : null;
    const todayKey = dateMatch ? dateMatch[0] : getLocalDateKey(new Date());

    let nutritionDB = await this.readNutrition({});
    this.ensureNutritionSettings(nutritionDB);
    if (!nutritionDB[todayKey]) nutritionDB[todayKey] = { creatine: 0 };

    let saturation = 60.0, currentStreak = 0;
    const refDate = parseLocalDateKey(todayKey);

    for (let i = 30; i >= 0; i--) {
      const d = new Date(refDate);
      d.setDate(d.getDate() - i);
      const dStr = getLocalDateKey(d);
      const dose = nutritionDB[dStr]?.creatine || 0;
      if (dose > 0) {
        saturation = Math.min(100.0, saturation + Math.max(1.4, (dose / 5.0) * (100.0 - saturation) * 0.10));
      } else if (saturation > 60.0) {
        saturation = Math.max(60.0, saturation - (saturation * 0.015));
      }
    }

    let checkDate = new Date(refDate);
    for (let s = 0; s < 60; s++) {
      const dStr = getLocalDateKey(checkDate);
      if ((nutritionDB[dStr]?.creatine || 0) > 0) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (s === 0) { checkDate.setDate(checkDate.getDate() - 1); continue; }
        break;
      }
    }

    const satPct = Math.round(saturation);
    const stashGrams = Math.max(0, nutritionDB._settings.creatineStashGrams || 0);
    const daysLeft = Math.floor(stashGrams / 5);
    const finishDate = new Date(refDate);
    finishDate.setDate(finishDate.getDate() + daysLeft);
    const finishFormatted = finishDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const todayDose = nutritionDB[todayKey]?.creatine || 0;

    root.innerHTML = `
      <div class="soma-card ${satPct >= 95 ? 'soma-card-emerald-glow' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.05rem; font-weight:900; color:var(--soma-text);">⚡ Creatine Saturation</span>
            ${currentStreak > 0 ? `<span class="soma-tag" style="background:rgba(245,158,11,0.15); color:var(--soma-warn); border:1px solid var(--soma-warn);">🔥 ${currentStreak}d Streak</span>` : ''}
          </div>
          <span style="font-size:0.85rem; font-weight:800; color:${satPct >= 95 ? 'var(--soma-accent-text)' : 'var(--soma-warn)'};">${satPct}% • ${satPct >= 95 ? 'Saturated' : 'Building'}</span>
        </div>
        <div class="soma-bar-wrap" style="margin-bottom:10px;"><div class="soma-bar-fill" style="width:${satPct}%; background:var(--soma-accent);"></div></div>
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--soma-text-dim); margin-bottom:12px;">
          <span>Tub Stash: <b style="color:var(--soma-text);">${stashGrams}g</b> (${daysLeft}d left)</span>
          <span style="color:var(--soma-warn);">Depletion: <b>${finishFormatted}</b></span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.8rem; color:var(--soma-text);">Today: <b>${todayDose}g</b></span>
          <div style="display:flex; gap:6px;">
            <button class="soma-btn" id="btn-c-3">+3g</button>
            <button class="soma-btn soma-btn-save" id="btn-c-5">+5g</button>
            <button class="soma-btn" id="btn-c-reset">↺ Reset</button>
          </div>
        </div>
      </div>
    `;

    const persist = async () => {
      await this.writeVaultJson(NUTRITION_FILE_PATH, nutritionDB);
      await this.mountCreatineStandalone(containerEl, sourcePath);
    };

    const addDose = async (grams) => {
      nutritionDB[todayKey].creatine = (nutritionDB[todayKey].creatine || 0) + grams;
      nutritionDB._settings.creatineStashGrams = Math.max(0, (nutritionDB._settings.creatineStashGrams || 0) - grams);
      await persist();
    };

    root.querySelector("#btn-c-3")?.addEventListener("click", () => addDose(3));
    root.querySelector("#btn-c-5")?.addEventListener("click", () => addDose(5));
    root.querySelector("#btn-c-reset")?.addEventListener("click", async () => {
      const cur = nutritionDB[todayKey].creatine || 0;
      nutritionDB._settings.creatineStashGrams = (nutritionDB._settings.creatineStashGrams || 0) + cur;
      nutritionDB[todayKey].creatine = 0;
      await persist();
    });
  }

  // ==========================================================================
  // CODEBLOCK 6: STANDALONE EDITABLE WEEKLY PLANNER / CALENDAR CASCADE (`weekly-gym` / `weekly-gym-tracker`)
  // ==========================================================================
  async mountWeeklyPlanner(containerEl) {
    containerEl.empty();
    const root = containerEl.createDiv({ cls: "soma-weekly-planner-root" });
    applySomaTheme(root, await this.readVaultJson(SETTINGS_FILE_PATH, {}));

    let settings = await this.readVaultJson(SETTINGS_FILE_PATH, { scheduleOverrides: {} });
    if (!settings.scheduleOverrides) settings.scheduleOverrides = {};

    const today = parseLocalDateKey(getLocalDateKey(new Date()));
    const startOfWeek = new Date(today);
    const dow = startOfWeek.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);

    const splitNames = Object.keys(ROUTINE_PRESETS);
    const allSplitOptions = ["Rest Day", ...splitNames];

    const render = () => {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(d.getDate() + i);
        const key = getLocalDateKey(d);
        const proj = SomaIntelligenceEngine.getProgramProjectedDay(d, settings.scheduleOverrides);
        days.push({ key, d, proj });
      }

      root.innerHTML = `
        <div class="soma-card">
          <div style="font-size:1.05rem; font-weight:900; color:var(--soma-text); margin-bottom:10px;">📅 Editable Calendar Cascade</div>
          ${days.map(({ key, d, proj }) => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:8px 0; border-top:1px solid rgba(255,255,255,0.06);">
              <div>
                <div style="font-weight:800; color:var(--soma-text); font-size:0.85rem;">${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}${key === getLocalDateKey(today) ? ' <span style="color:var(--soma-accent-text);">• Today</span>' : ''}</div>
                <div style="font-size:0.7rem; color:var(--soma-text-dim);">${proj.phaseBadge}${settings.scheduleOverrides[key] ? ' • Custom' : ''}</div>
              </div>
              <select class="soma-input" style="width:auto; height:34px; text-align:left; padding:0 8px;" data-action="set-day-split" data-key="${key}">
                <option value="">— Auto (${proj.isRest ? 'Rest' : proj.split}) —</option>
                ${allSplitOptions.map(s => `<option value="${s}" ${settings.scheduleOverrides[key] === s ? 'selected' : ''}>${s}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        </div>
      `;

      root.querySelectorAll('[data-action="set-day-split"]').forEach(sel => {
        sel.addEventListener("change", async (e) => {
          const key = e.target.dataset.key;
          const val = e.target.value;
          if (val === "") delete settings.scheduleOverrides[key];
          else settings.scheduleOverrides[key] = val;
          await this.writeVaultJson(SETTINGS_FILE_PATH, settings);
          render();
        });
      });
    };

    render();
  }

  // ==========================================================================
  // CODEBLOCK 7: WEEKLY MACRO DASHBOARD (`macro-weekly`)
  // ==========================================================================
  async mountWeeklyDashboard(containerEl, sourcePath) {
    containerEl.empty();
    const root = containerEl.createDiv({ cls: "soma-weekly-dash-root" });
    applySomaTheme(root, await this.readVaultJson(SETTINGS_FILE_PATH, {}));

    let nutritionDB = await this.readNutrition({});
    this.ensureNutritionSettings(nutritionDB);

    const fileName = sourcePath ? sourcePath.split("/").pop() : "";
    const dateMatch = fileName ? fileName.match(/\d{4}-\d{2}-\d{2}/) : null;
    const anchorKey = dateMatch ? dateMatch[0] : getLocalDateKey(new Date());
    const anchor = parseLocalDateKey(anchorKey);

    const startOfWeek = new Date(anchor);
    const dow = startOfWeek.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);

    const rows = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      const key = getLocalDateKey(d);
      const day = nutritionDB[key];
      let cals = 0, p = 0, c = 0, f = 0;
      if (day && day.items) {
        day.items.forEach(it => { cals += it.cals || 0; p += it.p || 0; c += it.c || 0; f += it.f || 0; });
      }
      rows.push({ key, d, cals: Math.round(cals), p: Math.round(p), c: Math.round(c), f: Math.round(f), logged: !!(day && day.items && day.items.length) });
    }

    const loggedRows = rows.filter(r => r.logged);
    const avg = (field) => loggedRows.length ? Math.round(loggedRows.reduce((a, r) => a + r[field], 0) / loggedRows.length) : 0;

    root.innerHTML = `
      <div class="soma-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-size:1.05rem; font-weight:900; color:var(--soma-text);">🍽️ Weekly Macro Dashboard</div>
          <span class="soma-tag soma-tag-emerald">${loggedRows.length}/7 Logged</span>
        </div>
        <div style="display:grid; grid-template-columns: 1.2fr repeat(4, 1fr); gap:6px; font-size:0.72rem; color:var(--soma-text-dim); font-weight:800; padding:4px 6px;">
          <div>Day</div><div>Kcal</div><div>P</div><div>C</div><div>F</div>
        </div>
        ${rows.map(r => `
          <div style="display:grid; grid-template-columns: 1.2fr repeat(4, 1fr); gap:6px; padding:6px; border-top:1px solid rgba(255,255,255,0.06); font-size:0.78rem; ${r.logged ? 'color:var(--soma-text);' : 'color:#4b5563;'}">
            <div>${r.d.toLocaleDateString("en-US", { weekday: "short" })}</div>
            <div>${r.logged ? r.cals : '—'}</div>
            <div>${r.logged ? r.p + 'g' : '—'}</div>
            <div>${r.logged ? r.c + 'g' : '—'}</div>
            <div>${r.logged ? r.f + 'g' : '—'}</div>
          </div>
        `).join("")}
        <div style="display:flex; justify-content:space-between; background:var(--soma-surface); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:10px 14px; margin-top:10px; font-size:0.78rem;">
          <span style="color:var(--soma-text-dim); font-weight:700;">Weekly Average</span>
          <span style="color:var(--soma-text); font-weight:800;">${avg('cals')} kcal • P ${avg('p')}g • C ${avg('c')}g • F ${avg('f')}g</span>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // CODEBLOCK 8: PROGRESS CHARTS — 1RM TRENDLINES & WEEKLY VOLUME (`soma-progress`)
  // ==========================================================================
  async mountProgressWidget(containerEl, source) {
    containerEl.empty();
    const root = containerEl.createDiv({ cls: "soma-progress-root" });
    applySomaTheme(root, await this.readVaultJson(SETTINGS_FILE_PATH, {}));

    const history = await this.readHistory();
    const requestedExercise = (source || "").trim();

    const sessions = Object.entries(history)
      .map(([dateKey, s]) => ({ dateKey, ...s }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    // Build per-exercise 1RM trend
    const exerciseTrends = {};
    for (const s of sessions) {
      for (const ex of s.exercises || []) {
        if (requestedExercise && ex.name.toLowerCase() !== requestedExercise.toLowerCase()) continue;
        let best1RM = 0;
        for (const set of ex.sets || []) {
          if (set.done) {
            const rawW = parseFloat(set.weight) || 0;
            const totalW = (ex.usesBar && rawW > 0) ? (ex.barWeight || 20) + rawW : rawW;
            const est = SomaIntelligenceEngine.calculate1RM(totalW, parseInt(set.reps) || 0);
            if (est > best1RM) best1RM = est;
          }
        }
        if (best1RM > 0) {
          if (!exerciseTrends[ex.name]) exerciseTrends[ex.name] = [];
          exerciseTrends[ex.name].push({ dateKey: s.dateKey, est1RM: best1RM });
        }
      }
    }

    // Weekly volume per muscle group (last 8 weeks)
    const weeklyVolume = {};
    for (const s of sessions) {
      const d = parseLocalDateKey(s.dateKey);
      const weekStart = new Date(d);
      const dow = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() + (dow === 0 ? -6 : 1 - dow));
      const weekKey = getLocalDateKey(weekStart);
      if (!weeklyVolume[weekKey]) weeklyVolume[weekKey] = {};
      for (const [muscleKey, data] of Object.entries(s.muscles || {})) {
        weeklyVolume[weekKey][muscleKey] = (weeklyVolume[weekKey][muscleKey] || 0) + (data.sets || 0);
      }
    }
    const recentWeeks = Object.keys(weeklyVolume).sort().slice(-8);

    const trendKeys = Object.keys(exerciseTrends).slice(0, requestedExercise ? 1 : 6);

    const renderSparkline = (points) => {
      if (points.length === 0) return "";
      const max = Math.max(...points.map(p => p.est1RM));
      const min = Math.min(...points.map(p => p.est1RM));
      const range = Math.max(1, max - min);
      const w = 260, h = 46;
      const stepX = points.length > 1 ? w / (points.length - 1) : 0;
      const coords = points.map((p, i) => {
        const x = i * stepX;
        const y = h - ((p.est1RM - min) / range) * (h - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <polyline points="${coords}" fill="none" stroke="var(--soma-accent-text)" stroke-width="2" />
      </svg>`;
    };

    root.innerHTML = `
      <div class="soma-card">
        <div style="font-size:1.05rem; font-weight:900; color:var(--soma-text); margin-bottom:10px;">📈 Progress: Est. 1RM Trends${requestedExercise ? ` — ${requestedExercise}` : ''}</div>
        ${trendKeys.length === 0 ? `<div style="color:var(--soma-text-dim); font-size:0.8rem; text-align:center; padding:12px;">No completed sets logged yet${requestedExercise ? ` for "${requestedExercise}"` : ''}.</div>` : trendKeys.map(name => {
          const points = exerciseTrends[name];
          const last = points[points.length - 1];
          const first = points[0];
          const delta = Math.round((last.est1RM - first.est1RM) * 10) / 10;
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-top:1px solid rgba(255,255,255,0.06);">
              <div>
                <div style="font-weight:800; color:var(--soma-text); font-size:0.85rem;">${name}</div>
                <div style="font-size:0.7rem; color:var(--soma-text-dim);">${points.length} data pts • ${delta >= 0 ? '+' : ''}${delta} since first log</div>
              </div>
              <div>${renderSparkline(points)}</div>
              <div style="text-align:right; font-weight:900; color:var(--soma-accent-text); font-size:0.95rem;">${last.est1RM}</div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="soma-card" style="margin-top:12px;">
        <div style="font-size:1.05rem; font-weight:900; color:var(--soma-text); margin-bottom:10px;">🧬 Weekly Volume (Sets) Per Muscle Group</div>
        ${recentWeeks.length === 0 ? `<div style="color:var(--soma-text-dim); font-size:0.8rem; text-align:center; padding:12px;">No workout history yet.</div>` : `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${recentWeeks.map(wk => {
              const muscles = weeklyVolume[wk];
              const total = Object.values(muscles).reduce((a, b) => a + b, 0);
              return `
                <div>
                  <div style="font-size:0.72rem; color:var(--soma-text-dim); margin-bottom:3px;">Week of ${wk} • ${total} total sets</div>
                  <div class="soma-bar-wrap"><div class="soma-bar-fill" style="width:${Math.min(100, total * 2)}%; background:var(--soma-info);"></div></div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      </div>
    `;
  }

  // ==========================================================================
  // DATA EXPORT: CSV (workout history + macros) & JSON backup/restore
  // ==========================================================================
  async exportWorkoutHistoryCsv() {
    const history = await this.readHistory();
    const rows = [["Date", "Split", "Duration", "Calories Burned", "Total Volume", "Total Sets", "Exercise", "Set#", "Weight", "Reps", "Failure", "Done"]];
    for (const [dateKey, session] of Object.entries(history)) {
      for (const ex of session.exercises || []) {
        (ex.sets || []).forEach((s, i) => {
          rows.push([dateKey, session.split || "", session.durationFormatted || "", session.caloriesBurned || 0, session.totalVol || 0, session.totalSets || 0, ex.name, i + 1, s.weight ?? "", s.reps ?? "", s.failure ?? "", s.done ? "yes" : "no"]);
        });
      }
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    await this.writeVaultJson; // no-op reference to keep linter calm
    const path = "apps/scripts/soma-workout-export.csv";
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir && !(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) await this.app.vault.modify(file, csv);
    else await this.app.vault.create(path, csv);
    new Notice(`Workout history exported to ${path}`);
  }

  async exportMacrosCsv() {
    const nutritionDB = await this.readNutrition({});
    const rows = [["Date", "Body Weight", "Water(ml)", "Item", "Cals", "Protein", "Carbs", "Fat"]];
    for (const [dateKey, day] of Object.entries(nutritionDB)) {
      if (dateKey === "_settings" || dateKey === "__defaultGoals") continue;
      const items = day.items || [];
      if (items.length === 0) {
        rows.push([dateKey, day.bodyWeight ?? "", day.water ?? 0, "", "", "", "", ""]);
      } else {
        items.forEach(it => {
          rows.push([dateKey, day.bodyWeight ?? "", day.water ?? 0, it.name || "", it.cals || 0, it.p || 0, it.c || 0, it.f || 0]);
        });
      }
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const path = "apps/scripts/soma-macros-export.csv";
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir && !(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file) await this.app.vault.modify(file, csv);
    else await this.app.vault.create(path, csv);
    new Notice(`Macro diary exported to ${path}`);
  }

  async backupAllData() {
    const paths = [HISTORY_FILE_PATH, CUSTOM_EX_FILE_PATH, SETTINGS_FILE_PATH, NUTRITION_FILE_PATH, CUSTOM_FOODS_FILE, DATA_FILE_PATH, REGISTRY_FILE_PATH, WEEKLY_FILE_PATH];
    const bundle = {};
    for (const p of paths) {
      bundle[p] = await this.readVaultJson(p, null);
    }
    const path = `apps/scripts/soma-backup-${getLocalDateKey(new Date())}.json`;
    await this.writeVaultJson(path, bundle);
    new Notice(`Full backup saved to ${path}`);
  }

  async restoreFromBackup(backupPath) {
    const bundle = await this.readVaultJson(backupPath, null);
    if (!bundle) {
      new Notice(`Backup not found at ${backupPath}`);
      return;
    }
    for (const [p, data] of Object.entries(bundle)) {
      if (data !== null && data !== undefined) await this.writeVaultJson(p, data);
    }
    new Notice(`Restored data from ${backupPath}. Reopen your notes to see changes.`);
  }
};

// ============================================================================
// NATIVE OBSIDIAN SETTINGS TAB
// ============================================================================

module.exports = { SomaSmartCoachPlugin };
