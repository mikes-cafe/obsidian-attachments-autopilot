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
 * Rename the twin and any preview file for an attachment that moved within
 * the watched folder. Idempotent — re-running with the same paths is a no-op
 * once the destination already exists.
 */
export async function renameTwin(
  vault: TwinVault,
  oldAttachmentPath: string,
  newAttachmentPath: string,
  attachmentFolder: string,
): Promise<void> {
  const oldPaths = twinPathsFor(oldAttachmentPath, attachmentFolder);
  const newPaths = twinPathsFor(newAttachmentPath, attachmentFolder);

  if (oldPaths.twinFile === newPaths.twinFile) return;

  if (vault.exists(oldPaths.twinFile)) {
    if (!vault.exists(newPaths.twinFolder)) {
      await vault.createFolder(newPaths.twinFolder);
    }
    await vault.rename(oldPaths.twinFile, newPaths.twinFile);
  }

  let renamedPreviewPath: string | null = null;
  for (const ext of previewExtensions()) {
    const oldPreview = oldPaths.previewFile(ext);
    const newPreview = newPaths.previewFile(ext);
    if (oldPreview === newPreview) continue;
    if (vault.exists(oldPreview)) {
      if (!vault.exists(newPaths.previewFolder)) {
        await vault.createFolder(newPaths.previewFolder);
      }
      await vault.rename(oldPreview, newPreview);
      renamedPreviewPath = newPreview;
    }
  }

  if (vault.exists(newPaths.twinFile)) {
    let content = await vault.read(newPaths.twinFile);
    const updatedRef = setTwinRef(content, newAttachmentPath);
    const updated = renamedPreviewPath
      ? setTwinPreview(updatedRef, renamedPreviewPath)
      : updatedRef;
    if (updated !== content) {
      await vault.modify(newPaths.twinFile, updated);
    }
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
