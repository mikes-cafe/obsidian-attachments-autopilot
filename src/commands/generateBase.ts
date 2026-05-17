import { App, TFile } from "obsidian";
import { resolveAttachmentFolder } from "../services/pathService";
import { t } from "../i18n";

/**
 * Whether Obsidian's Bases core plugin is currently enabled. The `.base` file
 * we generate only renders as a cards / table view when Bases is on — without
 * it, the file is plain YAML text. Probed via `app.internalPlugins`, which is
 * an undocumented but stable surface (used by every plugin that needs to
 * detect a core plugin's state).
 */
export function isBasesEnabled(app: App): boolean {
  const internal = (app as unknown as {
    internalPlugins?: { plugins?: Record<string, { enabled?: boolean }> };
  }).internalPlugins;
  return internal?.plugins?.bases?.enabled === true;
}

export function buildBaseContent(): string {
  return [
    "filters:",
    "  and:",
    '    - file.hasProperty("attachment-ref")',
    "properties:",
    "  attachment-ref:",
    "    displayName: File",
    "  attachment-type:",
    "    displayName: Type",
    "  attachment-prev:",
    "    displayName: Preview",
    "views:",
    "  - type: cards",
    "    name: All attachments",
    "    order:",
    "      - file.name",
    "      - attachment-type",
    "      - attachment-ref",
    "    image: note.attachment-prev",
    "",
  ].join("\n");
}

export type GenerateBaseStatus = "created" | "updated" | "skipped-bases-disabled";

export interface GenerateBaseResult {
  status: GenerateBaseStatus;
  /** `null` when the operation was skipped. */
  path: string | null;
}

export async function generateBaseFile(
  app: App,
  previousBasePath = "",
): Promise<GenerateBaseResult> {
  // Refuse to write a `.base` file when Bases isn't running. Without Bases,
  // the file would just sit in the vault as plain YAML — confusing, and easy
  // to mistake for a plugin failure. Caller (main.ts) emits a user-facing
  // Notice when this status comes back.
  if (!isBasesEnabled(app)) {
    return { status: "skipped-bases-disabled", path: null };
  }
  // Always write `<basename>.base` at vault root. For mode-1 nested folders
  // (e.g. `notes/files`) we use the last path segment (`files`) so the file
  // doesn't end up buried. For modes 2/3/4 (resolveAttachmentFolder returns
  // `""`) we use a localized default basename.
  const folder = resolveAttachmentFolder(app);
  const basename = folder === ""
    ? t("base.defaultBasename")
    : (folder.split("/").pop() as string);
  const BASE_FILENAME = `${basename}.base`;

  // Rename the old .base file when the attachment folder has changed.
  // Using raw vault.rename (not fileManager) since .base files have no wikilink backlinks.
  if (previousBasePath !== "" && previousBasePath !== BASE_FILENAME) {
    const oldFile = app.vault.getAbstractFileByPath(previousBasePath);
    if (oldFile) {
      await app.vault.rename(oldFile as TFile, BASE_FILENAME);
    }
  } else if (previousBasePath === "") {
    // Legacy/first run — scan for a single orphan .base at vault root.
    const orphans = (app.vault as unknown as { getFiles?(): TFile[] })
      .getFiles?.()
      ?.filter(f => f.extension === "base" && f.path !== BASE_FILENAME) ?? [];
    if (orphans.length === 1) {
      await app.vault.rename(orphans[0], BASE_FILENAME);
    }
    // Multiple orphans → skip auto-rename; user must clean up manually.
  }

  const content = buildBaseContent();
  const existing = app.vault.getAbstractFileByPath(BASE_FILENAME);
  if (existing) {
    await app.vault.modify(existing as TFile, content);
    return { status: "updated", path: BASE_FILENAME };
  }
  await app.vault.create(BASE_FILENAME, content);
  return { status: "created", path: BASE_FILENAME };
}
