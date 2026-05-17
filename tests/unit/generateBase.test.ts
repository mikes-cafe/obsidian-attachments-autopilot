import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import {
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
  attachmentFolderPath: string = ATTACHMENT_FOLDER;

  vault = {
    getConfig: (k: string) => (k === "attachmentFolderPath" ? this.attachmentFolderPath : null),
    getAbstractFileByPath: (p: string) => {
      if (!this.files.has(p)) return null;
      const ext = p.includes(".") ? p.split(".").pop()! : "";
      return { path: p, name: p, extension: ext } as never;
    },
    create: async (p: string, data: string) => {
      this.createCalls += 1;
      this.files.set(p, data);
    },
    modify: async (file: { path: string }, data: string) => {
      this.modifyCalls += 1;
      this.files.set(file.path, data);
    },
    rename: async (file: { path: string }, newPath: string) => {
      const content = this.files.get(file.path);
      if (content === undefined) throw new Error(`Not found: ${file.path}`);
      this.files.delete(file.path);
      this.files.set(newPath, content);
    },
    getFiles: () => {
      return Array.from(this.files.keys()).map(p => {
        const ext = p.includes(".") ? p.split(".").pop()! : "";
        return { path: p, extension: ext } as never;
      });
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

  it("does not modify an existing base file when Bases is off (clean no-op)", async () => {
    const app = new FakeApp();
    app.basesEnabled = false;
    app.files.set(BASE_FILENAME, "user-edited content");
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("skipped-bases-disabled");
    expect(app.modifyCalls).toBe(0);
    expect(app.files.get(BASE_FILENAME)).toBe("user-edited content");
  });

  // §13.1 of the QA plan — base file always lives at vault root with the
  // attachment folder's basename, regardless of nesting. For non-specific
  // attachment-folder modes (vault root, "same folder as note", "subfolder
  // under current folder") we use the localized default basename.

  it("vault-root mode (empty config) writes localized default basename at vault root", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "";
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("created");
    // i18n falls back to en in the test runtime — t("base.defaultBasename") = "attachments"
    expect(result.path).toBe("attachments.base");
    expect(app.files.has("attachments.base")).toBe(true);
    expect(app.files.has(".base")).toBe(false);
  });

  it("relative-mode config ('./' / './_attachments') is treated as vault root", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "./_attachments";
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("created");
    expect(result.path).toBe("attachments.base");
    expect(app.files.has("attachments.base")).toBe(true);
    expect(app.files.has("_attachments.base")).toBe(false);
    expect(app.files.has("./_attachments.base")).toBe(false);
  });

  it("nested attachment folder writes <basename>.base at vault root, not nested", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "notes/files";
    const result = await generateBaseFile(app.asApp());
    expect(result.status).toBe("created");
    expect(result.path).toBe("files.base");
    expect(app.files.has("files.base")).toBe(true);
    expect(app.files.has("notes/files.base")).toBe(false);
    expect(app.files.has("notes/files/files.base")).toBe(false);
  });

  // Feature B — base file path tracking (previousBasePath)

  it("renames the old .base file when previousBasePath is set and old file exists", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "notes/files";
    app.files.set("attachments.base", buildBaseContent());
    const result = await generateBaseFile(app.asApp(), "attachments.base");
    expect(result.status).toBe("updated");
    expect(result.path).toBe("files.base");
    expect(app.files.has("attachments.base")).toBe(false);
    expect(app.files.has("files.base")).toBe(true);
  });

  it("creates fresh at new path when previousBasePath points to a missing file", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "notes/files";
    // "attachments.base" is NOT pre-populated
    const result = await generateBaseFile(app.asApp(), "attachments.base");
    expect(result.status).toBe("created");
    expect(result.path).toBe("files.base");
    expect(app.files.has("files.base")).toBe(true);
  });

  it("renames single orphan .base file when previousBasePath is empty (legacy install)", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "notes/files";
    app.files.set("attachments.base", buildBaseContent());
    const result = await generateBaseFile(app.asApp(), "");
    expect(result.status).toBe("updated");
    expect(result.path).toBe("files.base");
    expect(app.files.has("attachments.base")).toBe(false);
    expect(app.files.has("files.base")).toBe(true);
  });

  it("skips auto-rename and creates new file when multiple .base orphans exist", async () => {
    const app = new FakeApp();
    app.attachmentFolderPath = "notes/files";
    app.files.set("attachments.base", buildBaseContent());
    app.files.set("old-thing.base", buildBaseContent());
    const result = await generateBaseFile(app.asApp(), "");
    expect(result.status).toBe("created");
    expect(result.path).toBe("files.base");
    // Both orphans remain untouched
    expect(app.files.has("attachments.base")).toBe(true);
    expect(app.files.has("old-thing.base")).toBe(true);
    expect(app.files.has("files.base")).toBe(true);
  });
});
