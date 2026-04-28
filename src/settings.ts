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
      .setDesc(this.buildDesc())
      .addText((text) => text.setValue(display).setDisabled(true));
  }

  /**
   * Build the description as a DocumentFragment so the localized "Files & Links"
   * substring becomes a clickable anchor that opens the corresponding Obsidian
   * settings tab. The localized templates use a `{link}` placeholder split on
   * here.
   */
  private buildDesc(): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const template = t("settings.attachmentFolder.desc");
    const linkText = t("settings.attachmentFolder.desc.linkText");
    const [before, after = ""] = template.split("{link}");

    fragment.appendChild(document.createTextNode(before));

    const anchor = document.createElement("a");
    anchor.textContent = linkText;
    anchor.href = "#";
    anchor.addEventListener("click", (evt) => {
      evt.preventDefault();
      // Obsidian's settings registry id for the "Files & Links" tab is "file".
      const setting = (this.app as unknown as {
        setting?: { open?: () => void; openTabById?: (id: string) => void };
      }).setting;
      setting?.open?.();
      setting?.openTabById?.("file");
    });
    fragment.appendChild(anchor);

    fragment.appendChild(document.createTextNode(after));
    return fragment;
  }
}
