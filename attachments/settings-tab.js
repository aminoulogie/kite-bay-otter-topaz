// ==========================================================================
// The Obsidian settings tab for the plugin.
// ==========================================================================

const { Plugin, Modal, Notice, requestUrl, PluginSettingTab, Setting, setIcon, MarkdownRenderChild } = require("obsidian");

const { NUTRITION_FILE_PATH, SETTINGS_FILE_PATH } = require("./paths.js");

class SomaSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "SOMA Smart Coach & Recovery HUD Pro" });

    new Setting(containerEl)
      .setName("Default unit")
      .setDesc("Used by new workout logs (existing logs keep their own unit).")
      .addDropdown(drop => {
        drop.addOption("kg", "Kilograms (kg)");
        drop.addOption("lb", "Pounds (lb)");
        this.plugin.readVaultJson(SETTINGS_FILE_PATH, { unit: "kg" }).then(s => drop.setValue(s.unit || "kg"));
        drop.onChange(async (val) => {
          const s = await this.plugin.readVaultJson(SETTINGS_FILE_PATH, {});
          s.unit = val;
          await this.plugin.writeVaultJson(SETTINGS_FILE_PATH, s);
        });
      });

    new Setting(containerEl)
      .setName("Auto protein target")
      .setDesc("Automatically set daily protein goal from your latest logged body weight.")
      .addToggle(toggle => {
        this.plugin.readVaultJson(NUTRITION_FILE_PATH, {}).then(n => toggle.setValue(!!n._settings?.autoProteinTarget));
        toggle.onChange(async (val) => {
          const n = await this.plugin.readVaultJson(NUTRITION_FILE_PATH, {});
          this.plugin.ensureNutritionSettings(n);
          n._settings.autoProteinTarget = val;
          await this.plugin.writeVaultJson(NUTRITION_FILE_PATH, n);
        });
      });

    new Setting(containerEl)
      .setName("Protein target (g per kg bodyweight)")
      .setDesc("Only used when auto protein target is enabled.")
      .addText(text => {
        this.plugin.readVaultJson(NUTRITION_FILE_PATH, {}).then(n => text.setValue(String(n._settings?.proteinPerKg ?? 2.0)));
        text.onChange(async (val) => {
          const num = parseFloat(val);
          if (isNaN(num)) return;
          const n = await this.plugin.readVaultJson(NUTRITION_FILE_PATH, {});
          this.plugin.ensureNutritionSettings(n);
          n._settings.proteinPerKg = num;
          await this.plugin.writeVaultJson(NUTRITION_FILE_PATH, n);
        });
      });

    containerEl.createEl("h3", { text: "Data" });

    new Setting(containerEl)
      .setName("Export workout history to CSV")
      .setDesc("Writes apps/scripts/soma-workout-export.csv")
      .addButton(btn => btn.setButtonText("Export").onClick(() => this.plugin.exportWorkoutHistoryCsv()));

    new Setting(containerEl)
      .setName("Export macro diary to CSV")
      .setDesc("Writes apps/scripts/soma-macros-export.csv")
      .addButton(btn => btn.setButtonText("Export").onClick(() => this.plugin.exportMacrosCsv()));

    new Setting(containerEl)
      .setName("Backup all data to JSON")
      .setDesc("Saves a single JSON snapshot of every SOMA data file, dated to today.")
      .addButton(btn => btn.setButtonText("Backup Now").onClick(() => this.plugin.backupAllData()));
  }
}

module.exports = { SomaSettingTab };
