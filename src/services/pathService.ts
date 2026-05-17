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

export type AttachmentFolderMode = "specific" | "root" | "relative";

/**
 * Classify Obsidian's `attachmentFolderPath` setting into the four UI modes:
 *  - `specific` — a fixed path like `attachments` or `notes/files`
 *  - `root` — vault root (`""` or `"/"`)
 *  - `relative` — per-note folder (`./` or `./<sub>` from Obsidian's
 *    "Same folder as current file" / "In subfolder under the current folder"
 *    options).
 *
 * Used by main.ts to surface a one-shot Notice when the user is in `relative`
 * mode (we treat it as `root` internally — see `resolveAttachmentFolder`).
 */
export function attachmentFolderMode(app: App): AttachmentFolderMode {
  const raw = (app.vault as unknown as { getConfig?: (k: string) => unknown }).getConfig?.(
    "attachmentFolderPath",
  );
  if (typeof raw !== "string") return "root";
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") return "root";
  if (
    trimmed === "." ||
    trimmed === "./" ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return "relative";
  }
  return "specific";
}

/**
 * Resolved attachment folder path, normalized for the rest of the codebase.
 *
 * Returns the configured folder for `specific` mode; returns `""` (vault root)
 * for both `root` and `relative` modes. The downstream watcher / lifecycle /
 * twinPathsFor code already handles `""` correctly — by funnelling relative
 * modes through `""` here, we get consistent vault-root behaviour for all
 * non-specific configurations instead of silently no-oping on relative paths.
 */
export function resolveAttachmentFolder(app: App): string {
  if (attachmentFolderMode(app) !== "specific") return "";
  const cfg = (app.vault as unknown as { getConfig?: (k: string) => unknown }).getConfig?.(
    "attachmentFolderPath",
  );
  if (typeof cfg !== "string") return "";
  return stripSlashes(cfg);
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
  const folderBasename = folder === "" ? "files" : folder.split("/").pop()!;
  const twinFolder = folder === "" ? `${folderBasename}-twins` : `${folder}/${folderBasename}-twins`;
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
  const folderBasename = folder === "" ? "files" : folder.split("/").pop()!;
  const twinPrefix = folder === "" ? `${folderBasename}-twins` : `${folder}/${folderBasename}-twins`;
  return filePath === twinPrefix || filePath.startsWith(`${twinPrefix}/`);
}

export function isInsideAttachmentFolder(filePath: string, attachmentFolder: string): boolean {
  const folder = stripSlashes(attachmentFolder);
  if (folder === "") return true;
  return filePath === folder || filePath.startsWith(`${folder}/`);
}
