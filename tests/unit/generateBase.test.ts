import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import {
  baseFilename,
  buildBaseContent,
  generateBaseFile,
  isBasesEnabled,
} from "../../src/commands/generateBase";

// Expected filename mirrors generateBaseFile's dynamic formula:
// resolveAttachmentFolder(app) + ".base"
const ATTACHMENT_FOLDER = "attachments";
const BASE_FILENAME = ATTACHMENT_FOLDER + ".base";

class FakeApp {
  files = new Map<string, string>();
  createCalls = 0;
  modifyCalls = 0;
  basesEnabled = true;

  vault = {
    getConfig: (k: string) => (k === "attachmentFolderPath" ? ATTACHMENT_FOLDER : null),
    getAbstractFileByPath: (p: string) =>
      this.files.has(p) ? ({ path: p, name: p } as never) : null,
    create: async (p: string, data: string) => {
      this.createCalls += 1;
      this.files.set(p, data);
    },
    modify: async (file: { path: string }, data: string) => {
      this.modifyCalls += 1;
      this.files.set(file.path, data);
    },
  };

  // Mirror the real Obsidian shape: app.internalPlugins.plugins.bases.enabled.
  // Tests flip basesEnabled to drive the v0.4 guard.
  get internalPlugins() {
    return { plugins: { bases: { enabled: this.basesEnabled } } };
  }

  asApp(): App {
    return this as unknown as App;
  }
}

describe("baseFilename", () => {
  it("returns the localized default basename for vault-root mode", () => {
    expect(baseFilename("")).toBe("attachments.base");
  });

  it("returns <folder>.base for a single-segment folder", () => {
    expect(baseFilename("attachments")).toBe("attachments.base");
  });

  it("returns only the last segment for nested folders", () => {
    expect(baseFilename("notes/files")).toBe("files.base");
  });

  it("returns only the last segment for deeply nested folders", () => {
    expect(baseFilename("a/b/c")).toBe("c.base");
  });
});

describe("buildBaseContent", () => {
  it("filters notes that have an attachment-ref property", () => {
    const content = buildBaseContent();
    expect(content).toContain("filters:");
    expect(content).toContain('file.hasProperty("attachment-ref")');
  });

  it("declares the three attachment frontmatter properties", () => {
    const content = buildBaseContent();
    expect(content).toContain("attachment-ref:");
    expect(content).toContain("attachment-type:");
    expect(content).toContain("attachment-prev:");
  });

  it("defines a cards view with column ordering and image binding", () => {
    const content = buildBaseContent();
    expect(content).toContain("views:");
    expect(content).toContain("type: cards");
    expect(content).toContain("order:");
    expect(content).toContain("image: note.attachment-prev");
    const orderBlock = content.slice(content.indexOf("order:"), content.indexOf("image:"));
    expect(orderBlock).not.toContain("attachment-prev");
  });

  it("matches the PM-customized contract verbatim", () => {
    const contract = [
      "filters:",
      "  and:",
      '    - file.hasProperty("attachment-ref")',
      "properties:",
      "  attachment-ref:",
      "    displayName: File",
      "  attachment-type:",
      "    displayName: Type",
      "  attachment-prev:",
      "    displayName: Preview",
      "views:",
      "  - type: cards",
      "    name: All attachments",
      "    order:",
      "      - file.name",
      "      - attachment-type",
      "      - attachment-ref",
      "    image: note.attachment-prev",
    ].join("\n");
    expect(buildBaseContent().trim()).toBe(contract);
  });
});

describe("isBasesEnabled", () => {
  const mk = (internalPlugins: unknown): App =>
    ({ internalPlugins }) as unknown as App;

  it("returns true when the Bases core plugin is enabled", () => {
    expect(
      isBasesEnabled(mk({ plugins: { bases: { enabled: true } } })),
    ).toBe(true);
  });

  it("returns false when enabled is explicitly false", () => {
    expect(
      isBasesEnabled(mk({ plugins: { bases: { enabled: false } } })),
    ).toBe(false);
  });

  it("returns false when enabled is not a boolean", () => {
    expect(
      isBasesEnabled(mk({ plugins: { bases: { enabled: undefined } } })),
    ).toBe(false);
    expect(
      isBasesEnabled(mk({ plugins: { bases: { enabled: 1 as unknown as boolean } } })),
    ).toBe(false);
  });

  it("returns false when the bases entry is missing", () => {
    expect(isBasesEnabled(mk({ plugins: {} }))).toBe(false);
  });

  it("returns false when plugins is missing", () => {
    expect(isBasesEnabled(mk({}))).toBe(false);
  });

  it("returns false when internalPlugins is missing entirely", () => {
    expect(isBasesEnabled({} as App)).toBe(false);
  });
});

describe("generateBaseFile", () => {
  it("creates the base file when missing", async () => {
    const app = new FakeApp();
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("created");
    expect(result.path).toBe(BASE_FILENAME);
    expect(app.createCalls).toBe(1);
    expect(app.modifyCalls).toBe(0);
    expect(app.files.has(BASE_FILENAME)).toBe(true);
  });

  it("modifies the base file when it already exists", async () => {
    const app = new FakeApp();
    app.files.set(BASE_FILENAME, "old content");
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("updated");
    expect(result.path).toBe(BASE_FILENAME);
    expect(app.createCalls).toBe(0);
    expect(app.modifyCalls).toBe(1);
    expect(app.files.get(BASE_FILENAME)).toContain("filters:");
    expect(app.files.get(BASE_FILENAME)).not.toBe("old content");
  });

  // v0.4 guard — refuses to write the .base file when Bases is disabled.
  it("returns 'skipped-bases-disabled' and writes nothing when Bases is off", async () => {
    const app = new FakeApp();
    app.basesEnabled = false;
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("skipped-bases-disabled");
    expect(result.path).toBeNull();
    expect(app.createCalls).toBe(0);
    expect(app.modifyCalls).toBe(0);
    expect(app.files.has(BASE_FILENAME)).toBe(false);
  });

  it("uses localized default basename when attachment folder is vault root", async () => {
    const app = new FakeApp();
    (app.vault as { getConfig: (k: string) => unknown }).getConfig = (k: string) =>
      k === "attachmentFolderPath" ? "" : null;
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("created");
    expect(result.path).toBe("attachments.base");
  });

  it("uses only the last path segment for nested attachment folders", async () => {
    const app = new FakeApp();
    (app.vault as { getConfig: (k: string) => unknown }).getConfig = (k: string) =>
      k === "attachmentFolderPath" ? "notes/files" : null;
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("created");
    expect(result.path).toBe("files.base");
    expect(app.files.has("files.base")).toBe(true);
    expect(app.files.has("notes/files.base")).toBe(false);
  });

  it("does not modify an existing base file when Bases is off (clean no-op)", async () => {
    const app = new FakeApp();
    app.basesEnabled = false;
    app.files.set(BASE_FILENAME, "user-edited content");
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("skipped-bases-disabled");
    expect(app.modifyCalls).toBe(0);
    expect(app.files.get(BASE_FILENAME)).toBe("user-edited content");
  });
});
