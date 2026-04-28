import type { TFile, Vault } from "obsidian";
import type { TwinVault } from "./twinService";

const requireFile = (vault: Vault, path: string): TFile => {
  const f = vault.getAbstractFileByPath(path);
  if (!f) throw new Error(`File not found: ${path}`);
  return f as TFile;
};

export const fromObsidianVault = (vault: Vault): TwinVault => ({
  exists: (path) => vault.getAbstractFileByPath(path) !== null,

  createFolder: async (path) => {
    try {
      await vault.createFolder(path);
    } catch {
      if (vault.getAbstractFileByPath(path) === null) {
        throw new Error(`Failed to create folder: ${path}`);
      }
    }
  },

  create: async (path, data) => {
    await vault.create(path, data);
  },

  createBinary: async (path, data) => {
    await vault.createBinary(path, data);
  },

  read: async (path) => vault.read(requireFile(vault, path)),

  readBinary: async (path) => vault.readBinary(requireFile(vault, path)),

  modify: async (path, data) => {
    await vault.modify(requireFile(vault, path), data);
  },
});
