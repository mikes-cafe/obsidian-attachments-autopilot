import { Notice, Plugin, type TAbstractFile } from "obsidian";
import { AttachmentsAutopilotSettingTab } from "./settings";
import { ensureTwin } from "./services/twinService";
import { ensurePreview } from "./services/previewService";
import { TwinQueue, type QueueState } from "./services/twinQueue";
import { fromObsidianVault } from "./services/obsidianVault";
import { resolveAttachmentFolder } from "./services/pathService";
import { shouldTwin } from "./events/vaultWatcher";
import {
  classifyTransition,
  deleteTwin,
  renameTwin,
} from "./services/lifecycleService";
import { findOrphanAttachments } from "./commands/generateMissingTwins";
import { findAttachmentsWithoutPreview } from "./commands/generateMissingPreviews";
import { runImportFromDevice } from "./commands/importFromDevice";
import { generateBaseFile, isBasesEnabled } from "./commands/generateBase";
import { isTemplaterEnabled, buildRenderHook } from "./services/templaterService";
import { TemplateDecisionModal } from "./ui/TemplateDecisionModal";
import { t } from "./i18n";

interface PluginSettings {
  templatePath: string;
}

const DEFAULT_SETTINGS: PluginSettings = { templatePath: "" };

export default class AttachmentsAutopilotPlugin extends Plugin {
  private queue!: TwinQueue;
  settings!: PluginSettings;

  private async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    const twinVault = fromObsidianVault(this.app);

    let templateDecision: "apply" | "skip" | null = null;

    this.queue = new TwinQueue(async (attachmentPath) => {
      const folder = resolveAttachmentFolder(this.app);
      const { templatePath } = this.settings;
      const templaterActive = templatePath && isTemplaterEnabled(this.app);

      let renderTemplate: ((p: string) => Promise<string | null>) | undefined;
      if (templaterActive) {
        const queueSize = this.queue.size();
        if (queueSize >= PROGRESS_THRESHOLD && templateDecision === null) {
          const modal = new TemplateDecisionModal(this.app, queueSize);
          modal.open();
          templateDecision = await modal.result;
        }
        if (templateDecision !== "skip") {
          renderTemplate = buildRenderHook(this.app, templatePath);
        }
      }

      await ensureTwin(twinVault, attachmentPath, folder, { renderTemplate });
      let previewResult: Awaited<ReturnType<typeof ensurePreview>> = "skipped";
      try {
        previewResult = await ensurePreview(twinVault, attachmentPath, folder);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[attachments-autopilot] preview step failed", attachmentPath, err);
        previewResult = "failed";
      }
      if (previewResult === "failed") {
        this.queue.markFailed(attachmentPath);
      }
    });

    this.addSettingTab(new AttachmentsAutopilotSettingTab(this.app, this));

    // Bulk-import progress UI: show a status-bar item while the queue churns
    // through ≥ PROGRESS_THRESHOLD items. Single drops stay silent.
    const PROGRESS_THRESHOLD = 5;
    const statusBar = this.addStatusBarItem();
    statusBar.setText("");
    statusBar.style.display = "none";
    let peakSize = 0;
    let bulkAnnounced = false;

    this.queue.onChange((state: QueueState) => {
      const total = state.pending + state.active;
      peakSize = Math.max(peakSize, total);
      if (total > 0 && peakSize >= PROGRESS_THRESHOLD) {
        statusBar.setText(t("statusbar.processing", { count: total }));
        statusBar.style.display = "";
        bulkAnnounced = true;
      } else if (total === 0) {
        if (bulkAnnounced) {
          new Notice(t("notices.bulk.complete", { count: peakSize }));
        }
        statusBar.setText("");
        statusBar.style.display = "none";
        peakSize = 0;
        bulkAnnounced = false;
        templateDecision = null;
      }
    });

    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        const folder = resolveAttachmentFolder(this.app);
        if (shouldTwin(file, folder)) {
          this.queue.enqueue(file.path);
        }
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", async (file: TAbstractFile, oldPath: string) => {
        const folder = resolveAttachmentFolder(this.app);
        const action = classifyTransition(oldPath, file.path, folder);
        try {
          if (action === "create") {
            this.queue.enqueue(file.path);
          } else if (action === "delete") {
            await deleteTwin(twinVault, oldPath, folder);
          } else if (action === "rename") {
            await renameTwin(twinVault, oldPath, file.path, folder);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("[attachments-autopilot] rename handler failed", oldPath, file.path, err);
        }
        // Clear tombstones keyed on either path so the renamed/replaced file can be retried.
        this.queue.clearTombstone(oldPath);
        this.queue.clearTombstone(file.path);
      }),
    );

    // Removing the source attachment removes its twin + preview; also clears the
    // tombstone so a fresh copy with the same path can be retried.
    this.registerEvent(
      this.app.vault.on("delete", async (file: TAbstractFile) => {
        const folder = resolveAttachmentFolder(this.app);
        if (
          classifyTransition(file.path, null, folder) === "delete"
        ) {
          try {
            await deleteTwin(twinVault, file.path, folder);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("[attachments-autopilot] delete handler failed", file.path, err);
          }
        }
        this.queue.clearTombstone(file.path);
      }),
    );

    const isTombstoned = (path: string) => this.queue.tombstoned(path);

    this.addCommand({
      id: "generate-missing-twins",
      name: t("commands.generateMissingTwins.name"),
      callback: () => {
        const orphans = findOrphanAttachments(this.app, isTombstoned);
        if (orphans.length === 0) {
          new Notice(t("notices.twin.noOrphans"));
          return;
        }
        for (const path of orphans) this.queue.enqueue(path);
        new Notice(t("notices.twin.queued", { count: orphans.length }));
      },
    });

    this.addCommand({
      id: "generate-missing-previews",
      name: t("commands.generateMissingPreviews.name"),
      callback: () => {
        const targets = findAttachmentsWithoutPreview(this.app, isTombstoned);
        if (targets.length === 0) {
          new Notice(t("notices.preview.allPresent"));
          return;
        }
        for (const path of targets) this.queue.enqueue(path);
        new Notice(t("notices.preview.queued", { count: targets.length }));
      },
    });

    this.addCommand({
      id: "import-from-device",
      name: t("commands.importFromDevice.name"),
      callback: async () => {
        const result = await runImportFromDevice(this.app);
        if (result.imported.length === 0 && result.failed.length === 0) {
          new Notice(t("notices.import.cancelled"));
          return;
        }
        if (result.failed.length === 0) {
          new Notice(t("notices.import.success", { count: result.imported.length }));
        } else {
          new Notice(
            t("notices.import.partial", {
              imported: result.imported.length,
              failed: result.failed.length,
            }),
          );
        }
      },
    });

    this.addCommand({
      id: "generate-base",
      name: t("commands.generateBase.name"),
      callback: async () => {
        const result = await generateBaseFile(this.app);
        if (result.status === "skipped-bases-disabled") {
          new Notice(t("notices.base.disabled.command"));
          return;
        }
        new Notice(
          t(
            result.status === "created"
              ? "notices.base.created"
              : "notices.base.updated",
            { path: result.path ?? "" },
          ),
        );
      },
    });

    // Surface the Bases-disabled state once per plugin load so users without
    // the Bases core plugin know why `Generate base file` won't work. Fires
    // after every other registration so the Notice doesn't compete with
    // Obsidian's own startup chatter.
    if (!isBasesEnabled(this.app)) {
      new Notice(t("notices.base.disabled.onload"));
    }

    const { templatePath } = this.settings;
    if (templatePath) {
      if (!isTemplaterEnabled(this.app)) {
        new Notice(t("notices.templater.disabled"));
      } else if (!this.app.vault.getAbstractFileByPath(templatePath)) {
        new Notice(t("notices.templater.templateMissing", { path: templatePath }));
      }
    }
  }

  onunload(): void {}
}
