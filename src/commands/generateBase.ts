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

export function baseFilename(folder: string): string {
  if (folder === "") return t("commands.generateBase.defaultBasename") + ".base";
  return folder.split("/").pop()! + ".base";
}

export async function generateBaseFile(app: App): Promise<GenerateBaseResult> {
  // Refuse to write a `.base` file when Bases isn't running. Without Bases,
  // the file would just sit in the vault as plain YAML — confusing, and easy
  // to mistake for a plugin failure. Caller (main.ts) emits a user-facing
  // Notice when this status comes back.
  if (!isBasesEnabled(app)) {
    return { status: "skipped-bases-disabled", path: null };
  }
  const BASE_FILENAME = baseFilename(resolveAttachmentFolder(app));


  const content = buildBaseContent();
  const existing = app.vault.getAbstractFileByPath(BASE_FILENAME);
  if (existing) {
    await app.vault.modify(existing as TFile, content);
    return { status: "updated", path: BASE_FILENAME };
  }
  await app.vault.create(BASE_FILENAME, content);
  return { status: "created", path: BASE_FILENAME };
}
