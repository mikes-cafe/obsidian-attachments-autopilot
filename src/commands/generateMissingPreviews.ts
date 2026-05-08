import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import {
  isInsideTwinFolder,
  resolveAttachmentFolder,
  twinPathsFor,
} from "../services/pathService";
import { defaultGenerators } from "../services/previews";
import type { TombstonePredicate } from "./generateMissingTwins";

const isFolder = (f: TAbstractFile): f is TFolder => Array.isArray((f as TFolder).children);
const isFile = (f: TAbstractFile): f is TFile => typeof (f as TFile).extension === "string";

export function findAttachmentsWithoutPreview(
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
        continue;
      }
      if (!isFile(child)) continue;
      const ext = child.extension.toLowerCase();
      if (ext === "md") continue;
      const gen = defaultGenerators[ext];
      if (!gen) continue;
      // Self-reference generators (images) use the source as their own preview;
      // they're never "missing" — skip them.
      if (gen.selfReference) continue;
      if (isTombstoned(child.path)) continue;

      const paths = twinPathsFor(child.path, folder);
      const previewPath = paths.previewFile(gen.outputExt);
      if (app.vault.getAbstractFileByPath(previewPath) !== null) continue;

      out.push(child.path);
    }
  };

  walk(root);
  return out;
}
