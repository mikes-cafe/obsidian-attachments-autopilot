import { describe, it, expect } from "vitest";
import type { App } from "obsidian";
import {
  BASE_FILENAME,
  buildBaseContent,
  generateBaseFile,
} from "../../src/commands/generateBase";

class FakeApp {
  files = new Map<string, string>();
  createCalls = 0;
  modifyCalls = 0;

  vault = {
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
    // Cards view uses attachment-prev as the image, so it should NOT also be in `order:`
    const orderBlock = content.slice(content.indexOf("order:"), content.indexOf("image:"));
    expect(orderBlock).not.toContain("attachment-prev");
  });

  it("matches the PM-customized contract verbatim", () => {
    // Pinned snapshot of the contract the PM signed off on for v1.1.
    // Any drift in `buildBaseContent` should fail this test loudly.
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

describe("generateBaseFile", () => {
  it("creates the base file when missing", async () => {
    const app = new FakeApp();
    const { path, created } = await generateBaseFile(app.asApp());
    expect(path).toBe(BASE_FILENAME);
    expect(created).toBe(true);
    expect(app.createCalls).toBe(1);
    expect(app.modifyCalls).toBe(0);
    expect(app.files.has(BASE_FILENAME)).toBe(true);
  });

  it("modifies the base file when it already exists", async () => {
    const app = new FakeApp();
    app.files.set(BASE_FILENAME, "old content");
    const { path, created } = await generateBaseFile(app.asApp());
    expect(path).toBe(BASE_FILENAME);
    expect(created).toBe(false);
    expect(app.createCalls).toBe(0);
    expect(app.modifyCalls).toBe(1);
    expect(app.files.get(BASE_FILENAME)).toContain("filters:");
    expect(app.files.get(BASE_FILENAME)).not.toBe("old content");
  });
});
