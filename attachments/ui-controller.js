// ==========================================================================
// The habit tracker's view layer: today, weekly, monthly, yearly and timer.
// ==========================================================================

const { Plugin, Modal, Notice, requestUrl, PluginSettingTab, Setting, setIcon, MarkdownRenderChild } = require("obsidian");

const { getLocalDateKey, addDays, formatDateLong, formatTimeShort } = require("../dates.js");
const { calculateHabitStats } = require("./stats.js");
const { readAndCompressImage, pickPhoto } = require("./photo.js");
const { HabitPhotoGalleryModal, HabitEditModal } = require("./modals.js");

class HabitRadarUIController {
  constructor(app, plugin, targetEl, options = {}) {
    this.app = app;
    this.plugin = plugin;
    this.targetEl = targetEl;
    this.options = options;
    this.activeTab = options.view || "today";

    this.showHeader = options.header !== false;
    this.showSummary = options.summary !== false;
    this.showTabs = options.tabs !== false;

    this.timerInterval = null;
    this.timerSecondsLeft = (this.plugin.settings?.defaultTimerDuration || 90) * 60;
    this.timerTotalSeconds = this.timerSecondsLeft;
    this.timerIsRunning = false;
    this.timerSelectedHabitId = this.plugin.settings?.habits?.[0]?.id || "";
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  render() {
    const container = this.targetEl;
    container.empty();
    container.addClass("habit-radar-container");

    if (this.showHeader) {
      this.renderHeader(container);
    }

    if (this.showSummary) {
      this.renderSummaryCards(container);
    }

    const contentArea = container.createDiv({ cls: "hr-content-area" });

    switch (this.activeTab) {
      case "today":
        this.renderTodayView(contentArea);
        break;
      case "weekly":
        this.renderWeeklyView(contentArea);
        break;
      case "monthly":
        this.renderMonthlyView(contentArea);
        break;
      case "yearly":
        this.renderYearlyView(contentArea);
        break;
      case "timer":
        this.renderTimerView(contentArea);
        break;
      default:
        this.renderTodayView(contentArea);
        break;
    }
  }

  renderHeader(container) {
    const header = container.createDiv({ cls: "hr-header" });
    const titleWrap = header.createDiv({ cls: "hr-title-wrap" });

    const titleH1 = titleWrap.createEl("h1", { text: "Habit Radar" });
    titleH1.createSpan({ cls: "hr-title-badge", text: "Pro" });

    titleWrap.createEl("p", {
      cls: "hr-subtitle",
      text: "Build consistency. Track what matters."
    });

    if (this.showTabs) {
      const nav = header.createDiv({ cls: "hr-nav-tabs" });
      const tabs = ["Today", "Weekly", "Monthly", "Yearly", "Timer"];

      tabs.forEach((tab) => {
        const tabKey = tab.toLowerCase();
        const btn = nav.createEl("button", {
          cls: `hr-tab-btn ${this.activeTab === tabKey ? "active" : ""}`,
          text: tab
        });
        btn.onclick = () => {
          this.activeTab = tabKey;
          this.render();
        };
      });
    }
  }

  renderSummaryCards(container) {
    const habits = this.plugin.settings.habits || [];
    const todayStr = getLocalDateKey(new Date());

    let completedToday = 0;
    habits.forEach((h) => {
      if (h.history && h.history[todayStr] === true) completedToday++;
    });

    const totalHabits = habits.length;
    const todayPercent = totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;

    let maxCurrentStreak = 0;
    let maxBestStreak = 0;
    let avgWeekRate = 0;

    habits.forEach((h) => {
      const stats = calculateHabitStats(h);
      if (stats.currentStreak > maxCurrentStreak) maxCurrentStreak = stats.currentStreak;
      if (stats.bestStreak > maxBestStreak) maxBestStreak = stats.bestStreak;
      avgWeekRate += stats.weekRate;
    });

    avgWeekRate = habits.length > 0 ? Math.round(avgWeekRate / habits.length) : 0;

    const summaryGrid = container.createDiv({ cls: "hr-summary-grid" });

    const cardData = [
      { label: "TODAY", val: `${completedToday}/${totalHabits}`, sub: `${todayPercent}% Done` },
      { label: "STREAK", val: `${maxCurrentStreak}d`, sub: "Active Streak" },
      { label: "BEST", val: `${maxBestStreak}d`, sub: "Record Streak" },
      { label: "THIS WEEK", val: `${avgWeekRate}%`, sub: "Consistency" }
    ];

    cardData.forEach((cd) => {
      const card = summaryGrid.createDiv({ cls: "hr-stat-card" });
      card.createDiv({ cls: "hr-stat-label", text: cd.label });
      card.createDiv({ cls: "hr-stat-val", text: cd.val });
      card.createDiv({ cls: "hr-stat-sub", text: cd.sub });
    });
  }

  renderTodayView(container) {
    const actionBar = container.createDiv({ cls: "hr-action-bar" });
    actionBar.createEl("h2", { cls: "hr-section-heading", text: "Today's Routine" });

    const addBtn = actionBar.createEl("button", { cls: "hr-add-btn", text: "+ Add Habit" });
    addBtn.onclick = () => {
      new HabitEditModal(this.app, this.plugin, null, () => this.render()).open();
    };

    const stack = container.createDiv({ cls: "hr-habit-stack" });
    const todayStr = getLocalDateKey(new Date());

    (this.plugin.settings.habits || []).forEach((habit) => {
      if (!habit.photos) habit.photos = {};
      if (!habit.history) habit.history = {};

      const isDoneToday = habit.history[todayStr] === true;
      const stats = calculateHabitStats(habit);
      const photoCount = Object.keys(habit.photos).length;

      const card = stack.createDiv({ cls: "hr-habit-card" });
      const header = card.createDiv({ cls: "hr-card-header" });

      const info = header.createDiv({ cls: "hr-card-info" });
      const iconBox = info.createDiv({ cls: "hr-card-icon-box" });
      iconBox.setText(habit.icon || "🎯");
      iconBox.style.backgroundColor = `${habit.color}22`;
      iconBox.style.color = habit.color;

      const text = info.createDiv({ cls: "hr-card-text" });
      text.createEl("h3", { cls: "hr-card-title", text: habit.name });
      const goalLabel = habit.goalDaysPerWeek >= 7 ? "Every day" : `${habit.goalDaysPerWeek}x / week`;
      text.createEl("p", { cls: "hr-card-desc", text: `${habit.desc || ""} · 🎯 ${goalLabel}` });

      const controls = header.createDiv({ cls: "hr-card-controls" });

      if (stats.currentStreak > 0) {
        controls.createDiv({ cls: "hr-streak-badge", text: `🔥 ${stats.currentStreak}d` });
      }

      const galleryBtn = controls.createEl("button", { cls: "hr-icon-btn" });
      setIcon(galleryBtn, "images");
      if (photoCount > 0) {
        galleryBtn.createSpan({ cls: "hr-icon-btn-badge", text: String(photoCount) });
      }
      galleryBtn.onclick = (e) => {
        e.stopPropagation();
        new HabitPhotoGalleryModal(this.app, this.plugin, habit, () => this.render()).open();
      };

      const cameraBtn = controls.createEl("button", { cls: "hr-icon-btn" });
      setIcon(cameraBtn, "camera");
      cameraBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const dataUrl = await pickPhoto();
          habit.photos[todayStr] = { data: dataUrl, ts: Date.now() };
          habit.history[todayStr] = true;
          await this.plugin.saveSettings();
          new Notice(`📸 Proof photo saved for ${habit.name}`);
          this.render();
        } catch (err) {}
      };

      const checkBtn = controls.createEl("button", {
        cls: `hr-check-circle ${isDoneToday ? "completed" : ""}`,
        text: isDoneToday ? "✓" : "+"
      });

      if (isDoneToday) checkBtn.style.backgroundColor = habit.color;

      checkBtn.onclick = async (e) => {
        e.stopPropagation();
        habit.history[todayStr] = !isDoneToday;
        await this.plugin.saveSettings();
        this.render();
      };

      const weekRow = card.createDiv({ cls: "hr-week-row" });
      const weekDays = this.getWeekDays(new Date());

      weekDays.forEach((d) => {
        const dStr = getLocalDateKey(d.date);
        const done = habit.history[dStr] === true;
        const isToday = dStr === todayStr;
        const hasPhoto = !!habit.photos[dStr];

        const cell = weekRow.createDiv({ cls: "hr-week-day-cell" });
        cell.createDiv({ cls: `hr-day-label ${isToday ? "today" : ""}`, text: d.label });

        const dot = cell.createDiv({
          cls: `hr-day-dot ${done ? "completed" : ""} ${isToday ? "is-today" : ""} ${hasPhoto ? "has-photo" : ""}`
        });

        if (done) {
          dot.setText("✓");
          dot.style.backgroundColor = habit.color;
        }

        cell.onclick = async () => {
          habit.history[dStr] = !done;
          await this.plugin.saveSettings();
          this.render();
        };
      });
    });
  }

  renderWeeklyView(container) {
    const actionBar = container.createDiv({ cls: "hr-action-bar" });
    actionBar.createEl("h2", { cls: "hr-section-heading", text: "Weekly Consistency" });

    const stack = container.createDiv({ cls: "hr-habit-stack" });
    const todayStr = getLocalDateKey(new Date());
    const weekDays = this.getWeekDays(new Date());

    (this.plugin.settings.habits || []).forEach((habit) => {
      const stats = calculateHabitStats(habit);
      const card = stack.createDiv({ cls: "hr-habit-card" });

      const header = card.createDiv({ cls: "hr-card-header" });
      const info = header.createDiv({ cls: "hr-card-info" });
      const iconBox = info.createDiv({ cls: "hr-card-icon-box" });
      iconBox.setText(habit.icon || "🎯");
      iconBox.style.backgroundColor = `${habit.color}22`;
      iconBox.style.color = habit.color;

      const text = info.createDiv({ cls: "hr-card-text" });
      text.createEl("h3", { cls: "hr-card-title", text: habit.name });
      text.createEl("p", { cls: "hr-card-desc", text: `${stats.weekRate}% this week` });

      const weekRow = card.createDiv({ cls: "hr-week-row" });

      weekDays.forEach((d) => {
        const dStr = getLocalDateKey(d.date);
        const done = habit.history[dStr] === true;
        const isToday = dStr === todayStr;
        const isPast = d.date < new Date(todayStr) && !isToday;

        const cell = weekRow.createDiv({ cls: "hr-week-day-cell" });
        cell.createDiv({ cls: `hr-day-label ${isToday ? "today" : ""}`, text: d.label });

        const dot = cell.createDiv({
          cls: `hr-day-dot ${done ? "completed" : isPast ? "missed" : ""} ${isToday ? "is-today" : ""}`
        });

        if (done) {
          dot.setText("✓");
          dot.style.backgroundColor = habit.color;
        } else if (isPast) {
          dot.setText("✕");
        }

        cell.onclick = async () => {
          habit.history[dStr] = !done;
          await this.plugin.saveSettings();
          this.render();
        };
      });
    });
  }

  renderMonthlyView(container) {
    const actionBar = container.createDiv({ cls: "hr-action-bar" });
    actionBar.createEl("h2", { cls: "hr-section-heading", text: "30-Day Activity Matrix" });

    const grid = container.createDiv({ cls: "hr-monthly-grid" });
    const today = new Date();

    (this.plugin.settings.habits || []).forEach((habit) => {
      const card = grid.createDiv({ cls: "hr-habit-card" });
      const header = card.createDiv({ cls: "hr-card-header" });

      const info = header.createDiv({ cls: "hr-card-info" });
      const iconBox = info.createDiv({ cls: "hr-card-icon-box" });
      iconBox.setText(habit.icon || "🎯");
      iconBox.style.backgroundColor = `${habit.color}22`;
      iconBox.style.color = habit.color;

      const text = info.createDiv({ cls: "hr-card-text" });
      text.createEl("h3", { cls: "hr-card-title", text: habit.name });
      text.createEl("p", { cls: "hr-card-desc", text: "Click pixel to toggle" });

      const heatmap = card.createDiv({ cls: "hr-month-heatmap" });

      for (let i = 27; i >= 0; i--) {
        const d = addDays(today, -i);
        const dStr = getLocalDateKey(d);
        const done = habit.history[dStr] === true;

        const cell = heatmap.createDiv({
          cls: `hr-pixel-cell ${done ? "active" : ""}`
        });

        if (done) cell.style.backgroundColor = habit.color;
        cell.setAttribute("title", `${dStr}: ${done ? "Completed" : "Incomplete"}`);

        cell.onclick = async () => {
          habit.history[dStr] = !done;
          await this.plugin.saveSettings();
          this.render();
        };
      }
    });
  }

  // Builds one 52-week square heatmap. `intensityFor` returns 0..1 for a
  // given date key, or 0 for nothing logged.
  buildYearGrid(parent, intensityFor, titleFor) {
    const grid = parent.createDiv({ cls: "hr-year-grid" });
    const today = new Date();
    const totalDays = 52 * 7;
    const startDate = addDays(today, -totalDays + 1);

    for (let i = 0; i < totalDays; i++) {
      const d = addDays(startDate, i);
      const dStr = getLocalDateKey(d);
      const intensity = intensityFor(dStr);
      const cell = grid.createDiv({ cls: "hr-year-cell" });

      if (intensity > 0) {
        // The accent is read as a CSS variable rather than a stored colour,
        // so every map follows the theme the user picked in Settings.
        cell.style.backgroundColor = "var(--soma-accent)";
        cell.style.opacity = String(Math.max(intensity, 0.35));
      }
      cell.setAttribute("title", titleFor(dStr, intensity));
    }
    return grid;
  }

  renderYearlyView(container) {
    const actionBar = container.createDiv({ cls: "hr-action-bar" });
    actionBar.createEl("h2", { cls: "hr-section-heading", text: "Yearly Overview" });

    const habits = this.plugin.settings.habits || [];
    const wrapper = container.createDiv({ cls: "hr-yearly-wrapper" });

    // --- combined: every habit stacked into one map ------------------------
    const allBlock = wrapper.createDiv({ cls: "hr-year-block" });
    const allHead = allBlock.createDiv({ cls: "hr-year-block-head" });
    allHead.createSpan({ cls: "hr-year-block-title", text: "All Habits" });
    allHead.createSpan({
      cls: "hr-year-block-sub",
      text: habits.length ? `${habits.length} tracked` : "none yet"
    });

    this.buildYearGrid(
      allBlock,
      (dStr) => {
        if (!habits.length) return 0;
        let n = 0;
        habits.forEach((h) => { if (h.history && h.history[dStr] === true) n++; });
        return Math.min(n / habits.length, 1);
      },
      (dStr) => {
        let n = 0;
        habits.forEach((h) => { if (h.history && h.history[dStr] === true) n++; });
        return `${dStr} — ${n}/${habits.length} habits`;
      }
    );

    // --- one map per habit -------------------------------------------------
    habits.forEach((h) => {
      const done = Object.values(h.history || {}).filter((v) => v === true).length;

      const block = wrapper.createDiv({ cls: "hr-year-block" });
      const head = block.createDiv({ cls: "hr-year-block-head" });
      head.createSpan({ cls: "hr-year-block-title", text: `${h.icon || "•"} ${h.name}` });
      head.createSpan({ cls: "hr-year-block-sub", text: `${done} day${done === 1 ? "" : "s"}` });

      this.buildYearGrid(
        block,
        (dStr) => (h.history && h.history[dStr] === true ? 1 : 0),
        (dStr, on) => `${h.name} — ${dStr} — ${on ? "done" : "not logged"}`
      );
    });

    if (!habits.length) {
      wrapper.createDiv({
        cls: "hr-year-empty",
        text: "Add a habit and its own yearly map appears here."
      });
    }
  }

  renderTimerView(container) {
    const timerCard = container.createDiv({ cls: "hr-timer-container" });

    const select = timerCard.createEl("select", { cls: "hr-timer-habit-select" });
    (this.plugin.settings.habits || []).forEach((h) => {
      const opt = select.createEl("option", { text: `${h.icon} ${h.name}`, value: h.id });
      if (h.id === this.timerSelectedHabitId) opt.selected = true;
    });

    select.onchange = (e) => {
      this.timerSelectedHabitId = e.target.value;
    };

    const ringWrapper = timerCard.createDiv({ cls: "hr-timer-ring-wrapper" });
    const r = 80;
    const circ = 2 * Math.PI * r;
    const progress = this.timerTotalSeconds > 0 ? (this.timerSecondsLeft / this.timerTotalSeconds) * circ : 0;

    ringWrapper.innerHTML = `
      <svg width="190" height="190" style="transform: rotate(-90deg);">
        <circle cx="95" cy="95" r="${r}" stroke="var(--soma-border)" stroke-width="10" fill="transparent" />
        <circle cx="95" cy="95" r="${r}" stroke="var(--soma-accent)" stroke-width="10" stroke-dasharray="${circ}" stroke-dashoffset="${circ - progress}" stroke-linecap="round" fill="transparent" style="transition: stroke-dashoffset 0.4s ease;" />
      </svg>
    `;

    const display = ringWrapper.createDiv({ cls: "hr-timer-display" });
    const mins = Math.floor(this.timerSecondsLeft / 60);
    const secs = this.timerSecondsLeft % 60;
    display.createDiv({ cls: "hr-time-left", text: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}` });
    display.createDiv({ cls: "hr-timer-status", text: this.timerIsRunning ? "Focusing..." : "Ready" });

    const controls = timerCard.createDiv({ cls: "hr-timer-controls" });

    const playBtn = controls.createEl("button", {
      cls: "hr-timer-btn primary",
      text: this.timerIsRunning ? "Pause" : "Start"
    });

    playBtn.onclick = () => {
      if (this.timerIsRunning) this.pauseTimer();
      else this.startTimer();
      this.render();
    };

    const resetBtn = controls.createEl("button", { cls: "hr-timer-btn", text: "Reset" });
    resetBtn.onclick = () => {
      this.resetTimer();
      this.render();
    };

    const skipBtn = controls.createEl("button", { cls: "hr-timer-btn", text: "Complete" });
    skipBtn.onclick = () => this.finishTimer();
  }

  startTimer() {
    if (this.timerIsRunning) return;
    this.timerIsRunning = true;
    this.timerInterval = setInterval(() => {
      if (this.timerSecondsLeft > 0) {
        this.timerSecondsLeft--;
        this.render();
      } else {
        this.finishTimer();
      }
    }, 1000);
  }

  pauseTimer() {
    this.timerIsRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  resetTimer() {
    this.pauseTimer();
    this.timerSecondsLeft = (this.plugin.settings?.defaultTimerDuration || 90) * 60;
    this.timerTotalSeconds = this.timerSecondsLeft;
  }

  async finishTimer() {
    this.pauseTimer();
    this.timerSecondsLeft = (this.plugin.settings?.defaultTimerDuration || 90) * 60;

    const todayStr = getLocalDateKey(new Date());
    const habit = (this.plugin.settings.habits || []).find((h) => h.id === this.timerSelectedHabitId);

    if (habit) {
      if (!habit.history) habit.history = {};
      habit.history[todayStr] = true;
      await this.plugin.saveSettings();
      new Notice(`🎉 Session complete: ${habit.name}`);
    }
    this.render();
  }

  getWeekDays(centerDate) {
    const startOfWeek = this.plugin.settings?.startOfWeek || "monday";
    const d = new Date(centerDate);
    const day = d.getDay();
    const diff = startOfWeek === "monday" ? (day === 0 ? -6 : 1 - day) : -day;
    const start = addDays(d, diff);
    const labels = startOfWeek === "monday" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return labels.map((label, idx) => ({
      label,
      date: addDays(start, idx)
    }));
  }
}

module.exports = { HabitRadarUIController };
