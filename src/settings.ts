import { App, PluginSettingTab, Setting } from "obsidian";
import type AttachmentsAutopilotPlugin from "./main";
import { resolveAttachmentFolder } from "./services/pathService";
import { isTemplaterEnabled, getTemplaterFolder, listTemplates } from "./services/templaterService";
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

    const setting = new Setting(containerEl).setName(
      t("settings.attachmentFolder.name"),
    );

    // Build the description directly into the Setting's descEl so the link
    // gets Obsidian's link styling (color + pointer cursor + hover) and the
    // click handler fires reliably. setDesc(DocumentFragment) was producing a
    // visually-plain anchor in v0.3.0 — see Bug-003 in the QA report.
    this.renderDescription(setting.descEl);

    setting.addText((text) => text.setValue(display).setDisabled(true));

    this.renderTemplateSetting(containerEl);
  }

  private renderTemplateSetting(containerEl: HTMLElement): void {
    const templaterEnabled = isTemplaterEnabled(this.app);
    const templates = listTemplates(this.app);
    const folder = getTemplaterFolder(this.app);

    new Setting(containerEl)
      .setName(t("settings.template.name"))
      .setDesc(t("settings.template.desc"))
      .addDropdown((drop) => {
        drop.addOption("", t("settings.template.none"));
        for (const file of templates) {
          drop.addOption(file.path, file.basename);
        }
        drop.setValue(this.plugin.settings.templatePath);
        drop.setDisabled(!templaterEnabled);
        drop.onChange(async (value) => {
          this.plugin.settings.templatePath = value;
          await this.plugin.saveSettings();
        });
      });

    const info = containerEl.createEl("p", { cls: "setting-item-description" });
    if (templaterEnabled) {
      info.setText(t("settings.templaterFolder.label", { folder: folder || "(not set)" }));
    } else {
      info.setText(t("settings.templaterFolder.missing"));
    }
  }

  private renderDescription(descEl: HTMLElement): void {
    descEl.empty();
    const template = t("settings.attachmentFolder.desc");
    const linkText = t("settings.attachmentFolder.desc.linkText");
    const [before, after = ""] = template.split("{link}");

    descEl.appendText(before);

    const anchor = descEl.createEl("a", {
      text: linkText,
      cls: "internal-link",
      href: "#",
    });
    anchor.style.cursor = "pointer";
    anchor.addEventListener("click", (evt) => {
      evt.preventDefault();
      const setting = (this.app as unknown as {
        setting?: {
          open?: () => void;
          openTabById?: (id: string) => void;
        };
      }).setting;
      // Obsidian's tab id for "Files & Links" is "file".
      setting?.open?.();
      setting?.openTabById?.("file");
    });

    descEl.appendText(after);
  }
}
