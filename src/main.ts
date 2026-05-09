import { Notice, Plugin, TFile, type TAbstractFile } from "obsidian";
import { AttachmentsAutopilotSettingTab } from "./settings";
import { ensureTwin } from "./services/twinService";
import { ensurePreview } from "./services/previewService";
import { TwinQueue, type QueueState } from "./services/twinQueue";
import { fromObsidianVault } from "./services/obsidianVault";
import { attachmentFolderMode, resolveAttachmentFolder } from "./services/pathService";
import { shouldTwin } from "./events/vaultWatcher";
import {
  classifyTransition,
  deleteTwin,
  renameTwin,
} from "./services/lifecycleService";
import { findOrphanAttachments } from "./commands/generateMissingTwins";
import { findAttachmentsWithoutPreview } from "./commands/generateMissingPreviews";
import { pickFilesFromDevice, importFiles } from "./commands/importFromDevice";
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

    const PROGRESS_THRESHOLD = 5;

    // Pre-flight decision gate: resolved when no bulk batch is pending; unresolved
    // while waiting for the user to respond to the TemplateDecisionModal. Workers
    // await this gate as their very first async step so no file is processed before
    // the user has made a choice. Shared renderHook ensures one serial mutex across
    // all workers in the same batch (prevents concurrent Templater calls).
    let templateDecision: "apply" | "skip" | null = null;
    let decisionGate: Promise<void> = Promise.resolve();
    let pendingGateResolve: (() => void) | null = null;
    let bulkBatchTimer: ReturnType<typeof setTimeout> | null = null;
    let renderHook: ((p: string) => Promise<string | null>) | undefined;

    this.queue = new TwinQueue(async (attachmentPath) => {
      await decisionGate;

      const folder = resolveAttachmentFolder(this.app);
      const { templatePath } = this.settings;
      const templaterActive = !!(templatePath && isTemplaterEnabled(this.app));

      let renderTemplate: ((p: string) => Promise<string | null>) | undefined;
      if (templaterActive && templateDecision !== "skip") {
        if (!renderHook) renderHook = buildRenderHook(this.app, templatePath);
        renderTemplate = renderHook;
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

    let batchEnqueuedCount = 0;
    let bulkAnnounced = false;
    let importBatchActive = false;

    this.queue.onChange((state: QueueState) => {
      const total = state.pending + state.active;
      if (total > 0 && batchEnqueuedCount >= PROGRESS_THRESHOLD) {
        bulkAnnounced = true;
      } else if (total === 0) {
        if (bulkAnnounced && !importBatchActive) {
          new Notice(t("notices.bulk.complete", { count: batchEnqueuedCount }));
        }
        batchEnqueuedCount = 0;
        bulkAnnounced = false;
        // Reset per-batch state so the next drop starts fresh.
        templateDecision = null;
        decisionGate = Promise.resolve();
        pendingGateResolve = null;
        renderHook = undefined;
        if (bulkBatchTimer !== null) {
          clearTimeout(bulkBatchTimer);
          bulkBatchTimer = null;
        }
      }
    });

    this.registerEvent(
      this.app.vault.on("rename", async (file: TAbstractFile, oldPath: string) => {
        if (!(file instanceof TFile)) return;
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
        if (!(file instanceof TFile)) return;
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
      callback: async () => {
        const orphans = findOrphanAttachments(this.app, isTombstoned);
        if (orphans.length === 0) {
          new Notice(t("notices.twin.noOrphans"));
          return;
        }
        for (const path of orphans) this.queue.enqueue(path);
        if (orphans.length < PROGRESS_THRESHOLD) {
          await this.queue.idle();
          new Notice(t("notices.twin.created", { count: orphans.length }));
        }
      },
    });

    this.addCommand({
      id: "generate-missing-previews",
      name: t("commands.generateMissingPreviews.name"),
      callback: async () => {
        const targets = findAttachmentsWithoutPreview(this.app, isTombstoned);
        if (targets.length === 0) {
          new Notice(t("notices.preview.allPresent"));
          return;
        }
        for (const path of targets) this.queue.enqueue(path);
        if (targets.length < PROGRESS_THRESHOLD) {
          await this.queue.idle();
          new Notice(t("notices.preview.generated", { count: targets.length }));
        }
      },
    });

    this.addCommand({
      id: "import-from-device",
      name: t("commands.importFromDevice.name"),
      callback: async () => {
        const files = await pickFilesFromDevice();
        if (files.length === 0) {
          new Notice(t("notices.import.cancelled"));
          return;
        }
        importBatchActive = true;
        try {
          const folder = resolveAttachmentFolder(this.app);
          const result = await importFiles(this.app, folder, files);
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
          await this.queue.idle();
        } finally {
          importBatchActive = false;
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

    // Defer the "create" listener and config-validation Notices until the
    // workspace is fully ready. Obsidian fires vault.on("create") for every
    // existing file during initial vault indexing — registering here ensures
    // the handler only sees genuinely new files, not startup replay events.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.vault.on("create", (file: TAbstractFile) => {
          const folder = resolveAttachmentFolder(this.app);
          if (!shouldTwin(file, folder)) return;

          const templaterActive = !!(this.settings.templatePath && isTemplaterEnabled(this.app));
          if (templaterActive && pendingGateResolve === null) {
            // Open a gate before the worker starts so it blocks until the batch
            // settles and we know whether a modal is needed.
            decisionGate = new Promise<void>((resolve) => { pendingGateResolve = resolve; });
          }

          this.queue.enqueue(file.path);
          batchEnqueuedCount++;

          if (templaterActive) {
            if (bulkBatchTimer !== null) clearTimeout(bulkBatchTimer);
            bulkBatchTimer = setTimeout(() => {
              bulkBatchTimer = null;
              const size = this.queue.size();
              if (size >= PROGRESS_THRESHOLD && templateDecision === null) {
                const modal = new TemplateDecisionModal(this.app, size);
                modal.open();
                void modal.result.then((decision) => {
                  templateDecision = decision;
                  pendingGateResolve!();
                  pendingGateResolve = null;
                });
              } else {
                pendingGateResolve!();
                pendingGateResolve = null;
              }
            }, 200);
          }
        }),
      );

      if (!isBasesEnabled(this.app)) {
        new Notice(t("notices.base.disabled.onload"), 8000);
      }

      // Relative attachment-folder modes ("Same folder as current file" /
      // "In subfolder under the current folder") are funnelled through
      // vault-root mode internally — surface that explicitly so the user
      // knows where their twins are landing.
      if (attachmentFolderMode(this.app) === "relative") {
        new Notice(t("notices.attachmentFolder.relativeFallback"), 8000);
      }

      const { templatePath } = this.settings;
      if (templatePath) {
        if (!isTemplaterEnabled(this.app)) {
          new Notice(t("notices.templater.disabled"), 8000);
        } else if (!this.app.vault.getAbstractFileByPath(templatePath)) {
          new Notice(t("notices.templater.templateMissing", { path: templatePath }), 8000);
        }
      }
    });
  }

  onunload(): void {}
}
