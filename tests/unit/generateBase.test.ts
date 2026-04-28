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

  it("defines a table view with column ordering", () => {
    const content = buildBaseContent();
    expect(content).toContain("views:");
    expect(content).toContain("type: table");
    expect(content).toContain("order:");
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
