import { describe, it, expect, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { fromObsidianVault } from "../../src/services/obsidianVault";

const fakeFile = (path: string): TFile => ({ path, name: path }) as TFile;

describe("fromObsidianVault.createFolder", () => {
  it("swallows the error and returns silently when the folder already exists after the throw", async () => {
    const folders = new Set<string>(["attachments/twin"]);
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) =>
          folders.has(p) ? ({ path: p, children: [] } as never) : null,
        createFolder: vi.fn(async () => {
          throw new Error("Folder already exists");
        }),
      },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    await expect(wrapper.createFolder("attachments/twin")).resolves.toBeUndefined();
    expect(wrapper.exists("attachments/twin")).toBe(true);
  });

  it("rethrows when createFolder fails AND the folder still doesn't exist", async () => {
    const app = {
      vault: {
        getAbstractFileByPath: () => null,
        createFolder: vi.fn(async () => {
          throw new Error("Permission denied");
        }),
      },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    await expect(wrapper.createFolder("attachments/twin")).rejects.toThrow(/Failed to create folder/);
  });
});

describe("fromObsidianVault.rename", () => {
  it("delegates to fileManager.renameFile to update inbound wikilinks", async () => {
    const file = fakeFile("attachments/twin/old.md");
    const renameFile = vi.fn(async () => undefined);
    const app = {
      vault: { getAbstractFileByPath: () => file },
      fileManager: { renameFile },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    await wrapper.rename("attachments/twin/old.md", "attachments/twin/new.md");
    expect(renameFile).toHaveBeenCalledWith(file, "attachments/twin/new.md");
  });

  it("throws when the source path does not exist", async () => {
    const app = {
      vault: { getAbstractFileByPath: () => null },
      fileManager: { renameFile: vi.fn() },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);
    await expect(wrapper.rename("missing.md", "anywhere.md")).rejects.toThrow(/File not found/);
  });
});

describe("fromObsidianVault.delete", () => {
  it("delegates to vault.delete with the resolved TFile", async () => {
    const file = fakeFile("attachments/twin/photo.png.md");
    const del = vi.fn(async () => undefined);
    const app = {
      vault: { getAbstractFileByPath: () => file, delete: del },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    await wrapper.delete("attachments/twin/photo.png.md");
    expect(del).toHaveBeenCalledWith(file);
  });
});

describe("fromObsidianVault.formatLink", () => {
  it("delegates to fileManager.generateMarkdownLink so user prefs are respected", () => {
    const target = fakeFile("attachments/photo.png");
    const generateMarkdownLink = vi.fn(
      () => "[photo.png](attachments/photo.png)",
    );
    const app = {
      vault: { getAbstractFileByPath: () => target },
      fileManager: { generateMarkdownLink },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    const link = wrapper.formatLink(
      "attachments/photo.png",
      "attachments/twin/photo.png.md",
    );
    expect(link).toBe("[photo.png](attachments/photo.png)");
    expect(generateMarkdownLink).toHaveBeenCalledWith(
      target,
      "attachments/twin/photo.png.md",
    );
  });

  it("falls back to a vault-relative wikilink when the target isn't indexed yet", () => {
    const app = {
      vault: { getAbstractFileByPath: () => null },
      fileManager: { generateMarkdownLink: vi.fn() },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    expect(
      wrapper.formatLink("attachments/photo.png", "attachments/twin/x.md"),
    ).toBe("[[attachments/photo.png]]");
  });
});
