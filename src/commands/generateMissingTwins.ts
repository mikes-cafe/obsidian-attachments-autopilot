import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import {
  isInsideTwinFolder,
  resolveAttachmentFolder,
  twinPathsFor,
} from "../services/pathService";

const isFolder = (f: TAbstractFile): f is TFolder => Array.isArray((f as TFolder).children);
const isFile = (f: TAbstractFile): f is TFile => typeof (f as TFile).extension === "string";

export type TombstonePredicate = (path: string) => boolean;

export function findOrphanAttachments(
  app: App,
  isTombstoned: TombstonePredicate = () => false,
): string[] {
  const folder = resolveAttachmentFolder(app);
  const root: TAbstractFile | null =
    folder === "" ? app.vault.getRoot() : app.vault.getAbstractFileByPath(folder);
  if (!root || !isFolder(root)) return [];

  const out: string[] = [];

  const walk = (f: TFolder): void => {
    for (const child of f.children) {
      if (isInsideTwinFolder(child.path, folder)) continue;
      if (isFolder(child)) {
        walk(child);
      } else if (isFile(child)) {
        if (child.extension.toLowerCase() === "md") continue;
        if (isTombstoned(child.path)) continue;
        const paths = twinPathsFor(child.path, folder);
        if (app.vault.getAbstractFileByPath(paths.twinFile) !== null) continue;
        out.push(child.path);
      }
    }
  };

  walk(root);
  return out;
}
