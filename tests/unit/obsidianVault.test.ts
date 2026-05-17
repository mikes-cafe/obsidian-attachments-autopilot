import { describe, it, expect, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { fromObsidianVault } from "../../src/services/obsidianVault";
import { twinDir, twinFile } from "./testHelpers";

const fakeFile = (path: string): TFile => ({ path, name: path }) as TFile;

describe("fromObsidianVault.createFolder", () => {
  it("swallows the error and returns silently when the folder already exists after the throw", async () => {
    const folders = new Set<string>([twinDir("attachments")]);
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

    await expect(wrapper.createFolder(twinDir("attachments"))).resolves.toBeUndefined();
    expect(wrapper.exists(twinDir("attachments"))).toBe(true);
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

    await expect(wrapper.createFolder(twinDir("attachments"))).rejects.toThrow(/Failed to create folder/);
  });
});

describe("fromObsidianVault.rename", () => {
  it("delegates to fileManager.renameFile to update inbound wikilinks", async () => {
    const file = fakeFile(twinFile("attachments", "old.md"));
    const renameFile = vi.fn(async () => undefined);
    const app = {
      vault: { getAbstractFileByPath: () => file },
      fileManager: { renameFile },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    await wrapper.rename(twinFile("attachments", "old.md"), twinFile("attachments", "new.md"));
    expect(renameFile).toHaveBeenCalledWith(file, twinFile("attachments", "new.md"));
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
    const file = fakeFile(twinFile("attachments", "photo.png.md"));
    const del = vi.fn(async () => undefined);
    const app = {
      vault: { getAbstractFileByPath: () => file, delete: del },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    await wrapper.delete(twinFile("attachments", "photo.png.md"));
    expect(del).toHaveBeenCalledWith(file);
  });
});

describe("fromObsidianVault.formatLink", () => {
  it("delegates to fileManager.generateMarkdownLink so user prefs are respected", async () => {
    const target = fakeFile("attachments/photo.png");
    const generateMarkdownLink = vi.fn(
      () => "[photo.png](attachments/photo.png)",
    );
    const app = {
      vault: { getAbstractFileByPath: () => target },
      fileManager: { generateMarkdownLink },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    const link = await wrapper.formatLink(
      "attachments/photo.png",
      "attachments/attachments-twins/photo.png.md",
    );
    expect(link).toBe("[photo.png](attachments/photo.png)");
    expect(generateMarkdownLink).toHaveBeenCalledWith(
      target,
      "attachments/attachments-twins/photo.png.md",
    );
  });

  it("retries the lookup once after a brief wait when the file isn't indexed yet (Bug-004)", async () => {
    // Simulates the race during `vault.on("create")`: the file exists on
    // disk but the metadata cache hasn't surfaced it through
    // `getAbstractFileByPath` yet on the first call.
    const target = fakeFile("attachments/photo.png");
    let calls = 0;
    const getAbstractFileByPath = vi.fn(() => {
      calls += 1;
      return calls < 2 ? null : target;
    });
    const generateMarkdownLink = vi.fn(() => "[[photo.png]]");
    const app = {
      vault: { getAbstractFileByPath },
      fileManager: { generateMarkdownLink },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    // Stub setTimeout so the retry resolves immediately in the test.
    const realSetTimeout = (globalThis as unknown as { window?: { setTimeout?: typeof setTimeout } }).window?.setTimeout;
    (globalThis as unknown as { window: { setTimeout: typeof setTimeout } }).window = {
      setTimeout: ((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    };
    try {
      const link = await wrapper.formatLink(
        "attachments/photo.png",
        "attachments/attachments-twins/photo.png.md",
      );
      expect(link).toBe("[[photo.png]]");
      expect(getAbstractFileByPath).toHaveBeenCalledTimes(2);
      expect(generateMarkdownLink).toHaveBeenCalledWith(
        target,
        "attachments/attachments-twins/photo.png.md",
      );
    } finally {
      if (realSetTimeout) {
        (globalThis as unknown as { window: { setTimeout: typeof setTimeout } }).window = {
          setTimeout: realSetTimeout,
        };
      }
    }
  });

  it("falls back to a vault-relative wikilink only after the retry also fails", async () => {
    const app = {
      vault: { getAbstractFileByPath: () => null },
      fileManager: { generateMarkdownLink: vi.fn() },
    } as unknown as App;
    const wrapper = fromObsidianVault(app);

    (globalThis as unknown as { window: { setTimeout: typeof setTimeout } }).window = {
      setTimeout: ((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    };

    expect(
      await wrapper.formatLink("attachments/photo.png", twinFile("attachments", "x.md")),
    ).toBe("[[attachments/photo.png]]");
  });
});
