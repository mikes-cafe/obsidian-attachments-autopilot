import { App, PluginSettingTab, Setting } from "obsidian";
import type AttachmentsAutopilotPlugin from "./main";
import { resolveAttachmentFolder } from "./services/pathService";
import { t } from "./i18n";

export class AttachmentsAutopilotSettingTab extends PluginSettingTab {
  plugin: AttachmentsAutopilotPlugin;

  constructor(app: App, plugin: AttachmentsAutopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const folder = resolveAttachmentFolder(this.app);
    const display = folder === "" ? t("settings.attachmentFolder.vaultRoot") : folder;

    new Setting(containerEl)
      .setName(t("settings.attachmentFolder.name"))
      .setDesc(t("settings.attachmentFolder.desc"))
      .addText((text) => text.setValue(display).setDisabled(true));
  }
}
