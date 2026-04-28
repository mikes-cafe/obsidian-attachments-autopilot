import type { App, TFile } from "obsidian";
import type { TwinVault } from "./twinService";

const requireFile = (app: App, path: string): TFile => {
  const f = app.vault.getAbstractFileByPath(path);
  if (!f) throw new Error(`File not found: ${path}`);
  return f as TFile;
};

export const fromObsidianVault = (app: App): TwinVault => ({
  exists: (path) => app.vault.getAbstractFileByPath(path) !== null,

  createFolder: async (path) => {
    try {
      await app.vault.createFolder(path);
    } catch {
      if (app.vault.getAbstractFileByPath(path) === null) {
        throw new Error(`Failed to create folder: ${path}`);
      }
    }
  },

  create: async (path, data) => {
    await app.vault.create(path, data);
  },

  createBinary: async (path, data) => {
    await app.vault.createBinary(path, data);
  },

  read: async (path) => app.vault.read(requireFile(app, path)),

  readBinary: async (path) => app.vault.readBinary(requireFile(app, path)),

  modify: async (path, data) => {
    await app.vault.modify(requireFile(app, path), data);
  },

  rename: async (oldPath, newPath) => {
    // fileManager.renameFile updates inbound wikilinks across the vault;
    // vault.rename would just move the file.
    await app.fileManager.renameFile(requireFile(app, oldPath), newPath);
  },

  delete: async (path) => {
    await app.vault.delete(requireFile(app, path));
  },

  formatLink: (targetPath, sourcePath) => {
    const target = app.vault.getAbstractFileByPath(targetPath);
    if (!target) {
      // Defensive fallback: if the target hasn't been indexed yet (e.g. a
      // preview file we just wrote and Obsidian's metadata cache is still
      // catching up), produce a plain wikilink. Both link formats accept
      // this style as a valid frontmatter link value.
      return `[[${targetPath}]]`;
    }
    return app.fileManager.generateMarkdownLink(target as TFile, sourcePath);
  },
});
