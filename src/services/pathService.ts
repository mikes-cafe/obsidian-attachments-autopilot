import type { App } from "obsidian";

export interface TwinPaths {
  twinFolder: string;
  twinFile: string;
  previewFolder: string;
  previewFile: (ext: string) => string;
}

// Normalize a configured folder string: trim surrounding whitespace, collapse
// leading/trailing slashes (including doubled slashes). Internal "/" separators
// inside the path are preserved.
const stripSlashes = (s: string): string => s.trim().replace(/^\/+|\/+$/g, "");

const INVALID_BASENAME_CHARS = /[\\/:*?"<>|]/g;

/**
 * Replace characters that are invalid in vault paths. Used both when
 * computing twin/preview filenames from a source attachment, and when
 * importing a file picked from the device.
 */
export function sanitizeBasename(name: string): string {
  return name.replace(INVALID_BASENAME_CHARS, "_");
}

export function resolveAttachmentFolder(app: App): string {
  const cfg = (app.vault as unknown as { getConfig?: (k: string) => unknown }).getConfig?.(
    "attachmentFolderPath",
  );
  if (typeof cfg !== "string") return "";
  const trimmed = cfg.trim();
  if (trimmed.startsWith(".")) return ""; // modes 3 & 4 (relative to current note) → vault-root fallback
  return stripSlashes(trimmed);
}

/**
 * Twin filename includes the source extension to guarantee uniqueness:
 *   `track.mp3` → `…/twin/track.mp3.md`
 *   `track.aac` → `…/twin/track.aac.md`
 * Files without an extension (or leading-dot files like `.gitkeep`) keep
 * their full filename and just get a `.md` suffix.
 *
 * Reserved characters in the basename are sanitized for the twin/preview
 * filenames; the source `attachmentPath` itself is left untouched (callers
 * pass it into `attachment-ref` so the wikilink still resolves).
 */
export function twinPathsFor(attachmentPath: string, attachmentFolder: string): TwinPaths {
  const lastSlash = attachmentPath.lastIndexOf("/");
  const fileName = lastSlash >= 0 ? attachmentPath.slice(lastSlash + 1) : attachmentPath;

  const safeName = sanitizeBasename(fileName);

  const folder = stripSlashes(attachmentFolder);
  const twinFolder = folder === "" ? "twin" : `${folder}/twin`;
  const previewFolder = `${twinFolder}/preview`;

  return {
    twinFolder,
    twinFile: `${twinFolder}/${safeName}.md`,
    previewFolder,
    previewFile: (ext: string) => `${previewFolder}/${safeName}.${ext}`,
  };
}

export function isInsideTwinFolder(filePath: string, attachmentFolder: string): boolean {
  const folder = stripSlashes(attachmentFolder);
  const twinPrefix = folder === "" ? "twin" : `${folder}/twin`;
  return filePath === twinPrefix || filePath.startsWith(`${twinPrefix}/`);
}

export function isInsideAttachmentFolder(filePath: string, attachmentFolder: string): boolean {
  const folder = stripSlashes(attachmentFolder);
  if (folder === "") return true;
  return filePath === folder || filePath.startsWith(`${folder}/`);
}
