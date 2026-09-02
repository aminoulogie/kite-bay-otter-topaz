// ==========================================================================
// Habit modals: photo gallery, lightbox, and the habit editor.
// ==========================================================================

const { Plugin, Modal, Notice, requestUrl, PluginSettingTab, Setting, setIcon, MarkdownRenderChild } = require("obsidian");

const { getLocalDateKey, parseLocalDateKey, formatDateLong, formatTimeShort } = require("../dates.js");
const { HABITS_FILE_PATH } = require("../paths.js");
const { DEFAULT_HABITS, DEFAULT_HABIT_SETTINGS } = require("./defaults.js");
const { readAndCompressImage, pickPhoto } = require("./photo.js");

class HabitRadarRenderChild extends MarkdownRenderChild {
  constructor(containerEl, controller) {
    super(containerEl);
    this.controller = controller;
  }

  onload() {
    this.controller.render();
  }

  onunload() {
    this.controller.destroy();
  }
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

class HabitPhotoGalleryModal extends Modal {
  constructor(app, plugin, habit, onChange) {
    super(app);
    this.plugin = plugin;
    this.habit = habit;
    this.onChange = onChange;
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
  }

  onOpen() {
    this.modalEl.addClass("hr-gallery-modal");
    if (!this.habit.photos) this.habit.photos = {};
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  changeMonth(delta) {
    let m = this.viewMonth + delta;
    let y = this.viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    this.viewMonth = m;
    this.viewYear = y;
    this.render();
  }

  async handleDayClick(dStr, photo, isFuture) {
    if (isFuture) return;

    if (photo) {
      new HabitPhotoLightboxModal(this.app, this.plugin, this.habit, dStr, photo, {
        onUpdated: () => {
          this.render();
          if (this.onChange) this.onChange();
        },
        onDeleted: async () => {
          delete this.habit.photos[dStr];
          await this.plugin.saveSettings();
          this.render();
          if (this.onChange) this.onChange();
        }
      }).open();
      return;
    }

    try {
      const dataUrl = await pickPhoto();
      this.habit.photos[dStr] = { data: dataUrl, ts: Date.now() };
      this.habit.history[dStr] = true;
      await this.plugin.saveSettings();
      new Notice(`📸 Proof photo saved for ${formatDateLong(dStr)}`);
      this.render();
      if (this.onChange) this.onChange();
    } catch (err) {
      // user cancelled the file picker — nothing to do
    }
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    const header = contentEl.createDiv({ cls: "hr-gallery-header" });
    const iconBox = header.createDiv({ cls: "hr-gallery-icon" });
    iconBox.setText(this.habit.icon || "🎯");
    iconBox.style.backgroundColor = `${this.habit.color}22`;
    iconBox.style.color = this.habit.color;

    const titleWrap = header.createDiv({ cls: "hr-gallery-title-wrap" });
    titleWrap.createEl("h2", { text: this.habit.name });
    titleWrap.createEl("p", { text: "Proof photos history — tap a day to add or view a photo" });

    const nav = contentEl.createDiv({ cls: "hr-gallery-nav" });
    const prevBtn = nav.createEl("button", { cls: "hr-icon-btn hr-gallery-nav-btn" });
    setIcon(prevBtn, "chevron-left");
    prevBtn.onclick = () => this.changeMonth(-1);

    nav.createDiv({ cls: "hr-gallery-month-label", text: `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}` });

    const nextBtn = nav.createEl("button", { cls: "hr-icon-btn hr-gallery-nav-btn" });
    setIcon(nextBtn, "chevron-right");
    nextBtn.onclick = () => this.changeMonth(1);

    const weekdayRow = contentEl.createDiv({ cls: "hr-gallery-weekday-row" });
    WEEKDAY_LABELS_MON.forEach((label) => {
      weekdayRow.createDiv({ cls: "hr-gallery-weekday-label", text: label });
    });

    const grid = contentEl.createDiv({ cls: "hr-gallery-calendar" });
    const todayStr = getLocalDateKey(new Date());
    const today = parseLocalDateKey(todayStr);
    const firstOfMonth = new Date(this.viewYear, this.viewMonth, 1);
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // Monday-first offset
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();

    for (let i = 0; i < leadingBlanks; i++) {
      grid.createDiv({ cls: "hr-gallery-day-cell hr-gallery-day-empty" });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(this.viewYear, this.viewMonth, day);
      const dStr = getLocalDateKey(cellDate);
      const photo = this.habit.photos[dStr];
      const isFuture = cellDate > today;

      const cell = grid.createDiv({
        cls: `hr-gallery-day-cell ${dStr === todayStr ? "is-today" : ""} ${photo ? "has-photo" : ""} ${isFuture ? "is-future" : ""}`
      });

      if (photo) {
        const thumb = cell.createDiv({ cls: "hr-gallery-thumb" });
        thumb.style.backgroundImage = `url(${photo.data})`;
        cell.createDiv({ cls: "hr-gallery-day-num hr-gallery-day-num-overlay", text: String(day) });
      } else {
        cell.createDiv({ cls: "hr-gallery-day-num", text: String(day) });
        if (!isFuture) {
          cell.createDiv({ cls: "hr-gallery-add-hint" }).setText("+");
        }
      }

      if (!isFuture) {
        cell.onclick = () => this.handleDayClick(dStr, photo, isFuture);
      }
    }
  }
}

class HabitPhotoLightboxModal extends Modal {
  constructor(app, plugin, habit, dateStr, photo, callbacks = {}) {
    super(app);
    this.plugin = plugin;
    this.habit = habit;
    this.dateStr = dateStr;
    this.photo = photo;
    this.onUpdated = callbacks.onUpdated;
    this.onDeleted = callbacks.onDeleted;
  }

  onOpen() {
    this.modalEl.addClass("hr-lightbox-modal");
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createDiv({ cls: "hr-lightbox-date", text: formatDateLong(this.dateStr) });

    const imgWrap = contentEl.createDiv({ cls: "hr-lightbox-image-wrap" });
    const img = imgWrap.createEl("img", { cls: "hr-lightbox-image" });
    img.src = this.photo.data;

    const meta = contentEl.createDiv({ cls: "hr-lightbox-meta" });
    if (this.photo.ts) meta.setText(`Taken at ${formatTimeShort(this.photo.ts)}`);

    const actions = contentEl.createDiv({ cls: "hr-lightbox-actions" });

    const retakeBtn = actions.createEl("button", { cls: "hr-timer-btn", text: "Retake" });
    retakeBtn.onclick = async () => {
      try {
        const dataUrl = await pickPhoto();
        this.photo.data = dataUrl;
        this.photo.ts = Date.now();
        await this.plugin.saveSettings();
        img.src = dataUrl;
        meta.setText(`Taken at ${formatTimeShort(this.photo.ts)}`);
        new Notice("📸 Photo updated");
        if (this.onUpdated) this.onUpdated();
      } catch (err) {}
    };

    const deleteBtn = actions.createEl("button", { cls: "hr-timer-btn hr-lightbox-delete", text: "Delete Photo" });
    deleteBtn.onclick = async () => {
      this.close();
      if (this.onDeleted) await this.onDeleted();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class HabitEditModal extends Modal {
  constructor(app, plugin, habit, onSave) {
    super(app);
    this.plugin = plugin;
    this.habit = habit;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("hr-edit-modal");
    contentEl.empty();
    contentEl.createEl("h2", { text: this.habit ? "Edit Habit" : "Add Habit" });

    let name = this.habit?.name || "";
    let desc = this.habit?.desc || "";
    let icon = this.habit?.icon || "🎯";
    let color = this.habit?.color || "#22c55e";
    let goalDaysPerWeek = this.habit?.goalDaysPerWeek ?? 7;

    new Setting(contentEl).setName("Name").addText((text) => text.setValue(name).onChange((v) => (name = v)));
    new Setting(contentEl).setName("Description").addText((text) => text.setValue(desc).onChange((v) => (desc = v)));
    new Setting(contentEl).setName("Icon").addText((text) => text.setValue(icon).onChange((v) => (icon = v)));
    new Setting(contentEl).setName("Color").addColorPicker((picker) => picker.setValue(color).onChange((v) => (color = v)));

    new Setting(contentEl).addButton((btn) => {
      btn.setButtonText("Save").setCta().onClick(async () => {
        if (!name.trim()) {
          new Notice("Name is required");
          return;
        }
        if (this.habit) {
          this.habit.name = name;
          this.habit.desc = desc;
          this.habit.icon = icon;
          this.habit.color = color;
          this.habit.goalDaysPerWeek = goalDaysPerWeek;
        } else {
          this.plugin.settings.habits.push({
            id: `habit-${Date.now()}`,
            name,
            desc,
            icon,
            color,
            goalDaysPerWeek,
            history: {},
            photos: {}
          });
        }
        await this.plugin.saveSettings();
        this.close();
        if (this.onSave) this.onSave();
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Bridges the ported habit-tracker UI (which expects a `plugin.settings` /
// `plugin.saveSettings()` interface, same as the original standalone
// plugin) onto SOMA's vault-file storage convention instead of Obsidian's
// plugin data.json, so habit data lives alongside the rest of SOMA's data
// at apps/scripts/soma-habits.json.
class SomaHabitStore {
  constructor(pluginRef) {
    this.pluginRef = pluginRef;
    this.settings = null;
  }

  async load() {
    const data = await this.pluginRef.readVaultJson(HABITS_FILE_PATH, null);
    this.settings = Object.assign({}, DEFAULT_HABIT_SETTINGS, data || {});
    if (!this.settings.habits || this.settings.habits.length === 0) {
      this.settings.habits = JSON.parse(JSON.stringify(DEFAULT_HABITS));
    }
    return this.settings;
  }

  async saveSettings() {
    await this.pluginRef.writeVaultJson(HABITS_FILE_PATH, this.settings);
  }
}

module.exports = { HabitRadarRenderChild, HabitPhotoGalleryModal, HabitPhotoLightboxModal, HabitEditModal, SomaHabitStore };
