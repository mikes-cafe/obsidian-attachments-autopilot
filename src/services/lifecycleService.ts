import {
  isInsideAttachmentFolder,
  isInsideTwinFolder,
  twinPathsFor,
} from "./pathService";
import { setTwinPreview, setTwinRef, type TwinVault } from "./twinService";
import { defaultGenerators } from "./previews";

export type LifecycleAction = "none" | "create" | "delete" | "rename";

const inScope = (path: string | null, attachmentFolder: string): boolean => {
  if (path === null) return false;
  return (
    isInsideAttachmentFolder(path, attachmentFolder) &&
    !isInsideTwinFolder(path, attachmentFolder)
  );
};

/**
 * Decide what should happen to the twin/preview for a path transition.
 *
 *  oldPath in scope? | newPath in scope? | result
 *  ------------------+-------------------+--------
 *        no          |        no         | none
 *        no          |        yes        | create
 *        yes         |        no         | delete
 *        yes         |        yes        | rename
 *
 * `oldPath = null` means a fresh create (no prior path); `newPath = null` means a delete.
 */
export function classifyTransition(
  oldPath: string | null,
  newPath: string | null,
  attachmentFolder: string,
): LifecycleAction {
  const oldIn = inScope(oldPath, attachmentFolder);
  const newIn = inScope(newPath, attachmentFolder);
  if (!oldIn && !newIn) return "none";
  if (!oldIn && newIn) return "create";
  if (oldIn && !newIn) return "delete";
  return "rename";
}

const previewExtensions = (): readonly string[] => {
  const exts = new Set<string>();
  for (const gen of Object.values(defaultGenerators)) exts.add(gen.outputExt);
  return Array.from(exts);
};

/**
 * Synchronize the twin (and any preview) for an attachment that moved within
 * the watched folder. Handles two distinct cases that have to be covered:
 *
 *   (a) **basename changed** (`tiny.png` → `pequenita.png`) — the twin path
 *       and preview path BOTH change because they're keyed off the basename.
 *       The twin file and preview file get renamed on disk; the twin's
 *       frontmatter is rewritten so `attachment-ref` and `attachment-prev`
 *       point at the new paths.
 *
 *   (b) **moved into a subfolder** (`attachments/foo.png` → `attachments/2024/foo.png`)
 *       — the basename is unchanged, so the twin path and preview path are
 *       *identical* before and after. No on-disk rename is needed, but the
 *       twin's `attachment-ref` MUST still update to reflect the source's new
 *       full path. (Earlier versions early-returned here and left the
 *       frontmatter pointing at the old path — Bug-002 §14.4.)
 *
 * Order of operations: read old content → modify the twin **at its old path**
 * with the rewritten frontmatter → rename twin file (if path changed) →
 * rename preview file (if path changed). Modifying the file at its old path
 * before any rename eliminates the race against Obsidian's
 * `fileManager.renameFile` link-update pass that broke the previous version
 * in production (Bug-002 §14.2).
 */
export async function renameTwin(
  vault: TwinVault,
  oldAttachmentPath: string,
  newAttachmentPath: string,
  attachmentFolder: string,
): Promise<void> {
  if (oldAttachmentPath === newAttachmentPath) return;

  const oldPaths = twinPathsFor(oldAttachmentPath, attachmentFolder);
  const newPaths = twinPathsFor(newAttachmentPath, attachmentFolder);

  // Read the existing twin content (if any) and locate the existing preview
  // (if any) before touching the filesystem.
  const oldContent = vault.exists(oldPaths.twinFile)
    ? await vault.read(oldPaths.twinFile)
    : null;

  let oldPreviewPath: string | null = null;
  let newPreviewPath: string | null = null;
  for (const ext of previewExtensions()) {
    const candidate = oldPaths.previewFile(ext);
    if (vault.exists(candidate)) {
      oldPreviewPath = candidate;
      newPreviewPath = newPaths.previewFile(ext);
      break;
    }
  }

  // Rename preview file FIRST so that:
  //   (a) formatLink(newPreviewPath) below finds the file in the vault cache
  //       and generates the user's chosen link format (bare basename) instead
  //       of falling back to a full vault-relative path (OBS-2).
  //   (b) if the subsequent twin rename blocks (e.g. Obsidian shows a
  //       "Update links?" dialog), the preview is already at its correct
  //       location, leaving attachment-prev pointing to an existing file (DEF-3).
  if (
    oldPreviewPath !== null &&
    newPreviewPath !== null &&
    oldPreviewPath !== newPreviewPath &&
    vault.exists(oldPreviewPath)
  ) {
    if (!vault.exists(newPaths.previewFolder)) {
      await vault.createFolder(newPaths.previewFolder);
    }
    await vault.rename(oldPreviewPath, newPreviewPath);
  }

  // Rewrite the twin frontmatter (still at the old path) so that:
  //   - attachment-ref points at the new attachment path
  //   - attachment-prev points at the new preview path (if a preview exists)
  // Doing this BEFORE renaming the twin means the rename carries the corrected
  // content. Links are formatted relative to the twin's *new* path so that
  // link-format settings like `relative` resolve correctly once the rename completes.
  if (oldContent !== null) {
    const refLink = await vault.formatLink(newAttachmentPath, newPaths.twinFile);
    let updated = setTwinRef(oldContent, refLink);
    if (newPreviewPath !== null) {
      const prevLink = await vault.formatLink(newPreviewPath, newPaths.twinFile);
      updated = setTwinPreview(updated, prevLink);
    }
    if (updated !== oldContent) {
      await vault.modify(oldPaths.twinFile, updated);
    }
  }

  // Rename twin file if its path actually changed (case a).
  if (
    oldPaths.twinFile !== newPaths.twinFile &&
    vault.exists(oldPaths.twinFile)
  ) {
    if (!vault.exists(newPaths.twinFolder)) {
      await vault.createFolder(newPaths.twinFolder);
    }
    await vault.rename(oldPaths.twinFile, newPaths.twinFile);
  }
}

/**
 * Remove the twin and any preview file for an attachment that left the watched
 * folder (rename out of scope) or was deleted outright.
 */
export async function deleteTwin(
  vault: TwinVault,
  attachmentPath: string,
  attachmentFolder: string,
): Promise<void> {
  const paths = twinPathsFor(attachmentPath, attachmentFolder);

  for (const ext of previewExtensions()) {
    const previewPath = paths.previewFile(ext);
    if (vault.exists(previewPath)) {
      await vault.delete(previewPath);
    }
  }

  if (vault.exists(paths.twinFile)) {
    await vault.delete(paths.twinFile);
  }
}
