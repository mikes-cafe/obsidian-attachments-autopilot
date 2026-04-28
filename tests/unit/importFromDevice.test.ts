import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import {
  importFiles,
  pickFilesFromDevice,
  uniqueAttachmentPath,
  type DeviceFile,
} from "../../src/commands/importFromDevice";

class FakeApp {
  files = new Map<string, ArrayBuffer>();
  folders = new Set<string>();
  createFolderCalls = 0;

  vault = {
    getAbstractFileByPath: (p: string) => {
      if (this.files.has(p)) return { path: p, name: p } as never;
      if (this.folders.has(p)) return { path: p, name: p, children: [] } as never;
      return null;
    },
    createFolder: async (p: string) => {
      this.createFolderCalls += 1;
      this.folders.add(p);
    },
    createBinary: async (p: string, data: ArrayBuffer) => {
      this.files.set(p, data);
    },
  };

  asApp(): App {
    return this as unknown as App;
  }
}

const fakeFile = (name: string, content = ""): DeviceFile => ({
  name,
  arrayBuffer: async () => new TextEncoder().encode(content).buffer,
});

describe("uniqueAttachmentPath", () => {
  it("returns the original name when there's no collision", () => {
    const app = new FakeApp().asApp();
    expect(uniqueAttachmentPath(app, "attachments", "photo.png")).toBe(
      "attachments/photo.png",
    );
  });

  it("appends (1), (2), … on collision, preserving the extension", () => {
    const fakeApp = new FakeApp();
    fakeApp.files.set("attachments/photo.png", new ArrayBuffer(0));
    fakeApp.files.set("attachments/photo (1).png", new ArrayBuffer(0));
    expect(uniqueAttachmentPath(fakeApp.asApp(), "attachments", "photo.png")).toBe(
      "attachments/photo (2).png",
    );
  });

  it("places files at the vault root when the attachment folder is empty", () => {
    const app = new FakeApp().asApp();
    expect(uniqueAttachmentPath(app, "", "photo.png")).toBe("photo.png");
  });

  it("sanitizes characters that are illegal in vault paths", () => {
    const app = new FakeApp().asApp();
    expect(uniqueAttachmentPath(app, "attachments", 'a/b:c?d.png')).toBe(
      "attachments/a_b_c_d.png",
    );
  });

  it("handles names without an extension", () => {
    const fakeApp = new FakeApp();
    fakeApp.files.set("attachments/Makefile", new ArrayBuffer(0));
    expect(uniqueAttachmentPath(fakeApp.asApp(), "attachments", "Makefile")).toBe(
      "attachments/Makefile (1)",
    );
  });

  it("detects collisions across NFC/NFD unicode normalization", () => {
    // macOS APFS stores filenames in NFD (n + combining tilde); the JS-level
    // string we look up is NFC (precomposed ñ). The implementation NFC-normalizes
    // both sides so this collision is detected and the import gets renamed.
    const fakeApp = new FakeApp();
    const nfc = "Holiday foto ñ.jpg".normalize("NFC");
    fakeApp.files.set(`attachments/${nfc}`, new ArrayBuffer(0));
    // The "incoming" name is logically the same file but supplied in NFD form.
    const nfd = "Holiday foto ñ.jpg".normalize("NFD");
    expect(uniqueAttachmentPath(fakeApp.asApp(), "attachments", nfd)).toBe(
      `attachments/${nfc.replace(".jpg", " (1).jpg")}`,
    );
  });
});

describe("importFiles", () => {
  it("writes each file to the attachment folder and returns the imported paths", async () => {
    const app = new FakeApp();
    const result = await importFiles(app.asApp(), "attachments", [
      fakeFile("photo.png", "img"),
      fakeFile("clip.mp4", "vid"),
    ]);
    expect(result.imported.sort()).toEqual([
      "attachments/clip.mp4",
      "attachments/photo.png",
    ]);
    expect(result.failed).toEqual([]);
    expect(app.files.has("attachments/photo.png")).toBe(true);
    expect(app.files.has("attachments/clip.mp4")).toBe(true);
  });

  it("creates the attachment folder when missing", async () => {
    const app = new FakeApp();
    await importFiles(app.asApp(), "attachments", [fakeFile("a.png")]);
    expect(app.createFolderCalls).toBe(1);
    expect(app.folders.has("attachments")).toBe(true);
  });

  it("does not call createFolder when the attachment folder exists", async () => {
    const app = new FakeApp();
    app.folders.add("attachments");
    await importFiles(app.asApp(), "attachments", [fakeFile("a.png")]);
    expect(app.createFolderCalls).toBe(0);
  });

  it("renames on collision so existing files are not overwritten", async () => {
    const app = new FakeApp();
    app.files.set("attachments/photo.png", new TextEncoder().encode("original").buffer);
    const result = await importFiles(app.asApp(), "attachments", [
      fakeFile("photo.png", "imported"),
    ]);
    expect(result.imported).toEqual(["attachments/photo (1).png"]);
    const original = new TextDecoder().decode(app.files.get("attachments/photo.png"));
    expect(original).toBe("original");
  });

  it("normalizes NFD-named incoming files to NFC on disk", async () => {
    const app = new FakeApp();
    const nfd = "ñ-test.jpg".normalize("NFD");
    const nfc = "ñ-test.jpg".normalize("NFC");
    const result = await importFiles(app.asApp(), "attachments", [fakeFile(nfd, "data")]);
    expect(result.imported).toEqual([`attachments/${nfc}`]);
    expect(app.files.has(`attachments/${nfc}`)).toBe(true);
  });

  it("collects failures without aborting other imports", async () => {
    const app = new FakeApp();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    app.vault.createBinary = (async (p: string, data: ArrayBuffer) => {
      if (p.endsWith("bad.png")) throw new Error("disk full");
      app.files.set(p, data);
    }) as never;

    const result = await importFiles(app.asApp(), "attachments", [
      fakeFile("good.png"),
      fakeFile("bad.png"),
      fakeFile("alsoGood.png"),
    ]);
    expect(result.imported.sort()).toEqual([
      "attachments/alsoGood.png",
      "attachments/good.png",
    ]);
    expect(result.failed).toEqual(["bad.png"]);
    errSpy.mockRestore();
  });
});

describe("pickFilesFromDevice", () => {
  // Stub the minimum DOM/window surface so the function runs in the node test env.
  const setupFakeDom = () => {
    const inputListeners: Record<string, EventListener> = {};
    const windowListeners: Record<string, EventListener> = {};
    const input = {
      type: "",
      multiple: false,
      style: {} as CSSStyleDeclaration,
      files: null as FileList | null,
      addEventListener: (event: string, cb: EventListener) => {
        inputListeners[event] = cb;
      },
      removeEventListener: () => undefined,
      remove: () => undefined,
      click: () => undefined,
    };
    (globalThis as unknown as { document: unknown }).document = {
      createElement: () => input,
      body: { appendChild: () => undefined },
    };
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (event: string, cb: EventListener) => {
        windowListeners[event] = cb;
      },
      removeEventListener: (event: string) => {
        delete windowListeners[event];
      },
    };
    return { input, inputListeners, windowListeners };
  };

  it("resolves with [] when the input fires the cancel event", async () => {
    const { inputListeners } = setupFakeDom();
    const promise = pickFilesFromDevice();
    inputListeners.cancel?.(new Event("cancel"));
    await expect(promise).resolves.toEqual([]);
  });

  it("resolves with [] via the window-focus fallback when no file was picked", async () => {
    vi.useFakeTimers();
    try {
      const { windowListeners } = setupFakeDom();
      const promise = pickFilesFromDevice();
      windowListeners.focus?.(new Event("focus"));
      await vi.advanceTimersByTimeAsync(600);
      await expect(promise).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the focus fallback does not fire if change has already resolved", async () => {
    vi.useFakeTimers();
    try {
      const { input, inputListeners, windowListeners } = setupFakeDom();
      input.files = [
        { name: "a.png", arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File,
      ] as unknown as FileList;
      const promise = pickFilesFromDevice();
      inputListeners.change?.(new Event("change"));
      windowListeners.focus?.(new Event("focus"));
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("a.png");
    } finally {
      vi.useRealTimers();
    }
  });

  it("only resolves once even if both change and cancel fire", async () => {
    const { input, inputListeners } = setupFakeDom();
    input.files = [
      { name: "a.png", arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File,
    ] as unknown as FileList;
    const promise = pickFilesFromDevice();
    inputListeners.change?.(new Event("change"));
    inputListeners.cancel?.(new Event("cancel")); // late spurious cancel
    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("a.png");
  });
});
