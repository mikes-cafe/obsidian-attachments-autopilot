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

  formatLink: async (targetPath, sourcePath) => {
    let target = app.vault.getAbstractFileByPath(targetPath);
    if (!target) {
      // Bug-004: when `vault.on("create")` fires, the file is on disk but
      // sometimes not yet visible to `getAbstractFileByPath` until the next
      // microtask tick. A brief retry catches up with the metadata cache so
      // `generateMarkdownLink` produces the user's chosen format ("shortest"
      // / "absolute") instead of falling back to the full vault-relative
      // wikilink.
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      target = app.vault.getAbstractFileByPath(targetPath);
    }
    if (!target) {
      // Last-resort fallback. Both link-format settings accept this style
      // as a valid frontmatter value.
      return `[[${targetPath}]]`;
    }
    return app.fileManager.generateMarkdownLink(target as TFile, sourcePath);
  },
});
