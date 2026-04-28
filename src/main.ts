import { Notice, Plugin, type TAbstractFile } from "obsidian";
import { AttachmentsAutopilotSettingTab } from "./settings";
import { ensureTwin } from "./services/twinService";
import { ensurePreview } from "./services/previewService";
import { TwinQueue } from "./services/twinQueue";
import { fromObsidianVault } from "./services/obsidianVault";
import { resolveAttachmentFolder } from "./services/pathService";
import { shouldTwin } from "./events/vaultWatcher";
import { findOrphanAttachments } from "./commands/generateMissingTwins";
import { findAttachmentsWithoutPreview } from "./commands/generateMissingPreviews";
import { runImportFromDevice } from "./commands/importFromDevice";
import { generateBaseFile } from "./commands/generateBase";
import { t } from "./i18n";

export default class AttachmentsAutopilotPlugin extends Plugin {
  private queue!: TwinQueue;

  async onload(): Promise<void> {
    const twinVault = fromObsidianVault(this.app.vault);

    this.queue = new TwinQueue(async (attachmentPath) => {
      const folder = resolveAttachmentFolder(this.app);
      await ensureTwin(twinVault, attachmentPath, folder);
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

    this.registerEvent(
      this.app.vault.on("create", (file: TAbstractFile) => {
        const folder = resolveAttachmentFolder(this.app);
        if (shouldTwin(file, folder)) {
          this.queue.enqueue(file.path);
        }
      }),
    );

    // If the user removes a file we previously gave up on, clear its tombstone so
    // a fresh copy with the same path can be retried.
    this.registerEvent(
      this.app.vault.on("delete", (file: TAbstractFile) => {
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
        const { path, created } = await generateBaseFile(this.app);
        new Notice(
          t(created ? "notices.base.created" : "notices.base.updated", { path }),
        );
      },
    });
  }

  onunload(): void {}
}
