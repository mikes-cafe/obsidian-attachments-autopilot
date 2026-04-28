import type { App, TFile } from "obsidian";

export const BASE_FILENAME = "Attachments.base";

export function buildBaseContent(): string {
  return [
    "filters:",
    "  and:",
    '    - file.hasProperty("attachment-ref")',
    "",
    "properties:",
    "  attachment-ref:",
    "    displayName: File",
    "  attachment-type:",
    "    displayName: Type",
    "  attachment-prev:",
    "    displayName: Preview",
    "",
    "views:",
    "  - type: table",
    "    name: All attachments",
    "    order:",
    "      - file.name",
    "      - attachment-type",
    "      - attachment-prev",
    "      - attachment-ref",
    "",
  ].join("\n");
}

export interface GenerateBaseResult {
  path: string;
  created: boolean;
}

export async function generateBaseFile(app: App): Promise<GenerateBaseResult> {
  const content = buildBaseContent();
  const existing = app.vault.getAbstractFileByPath(BASE_FILENAME);
  if (existing) {
    await app.vault.modify(existing as TFile, content);
    return { path: BASE_FILENAME, created: false };
  }
  await app.vault.create(BASE_FILENAME, content);
  return { path: BASE_FILENAME, created: true };
}
