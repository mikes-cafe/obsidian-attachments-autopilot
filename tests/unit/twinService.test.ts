import { describe, it, expect } from "vitest";
import {
  buildTwinContent,
  ensureTwin,
  extensionOf,
  setTwinPreview,
  setTwinRef,
  type TwinVault,
} from "../../src/services/twinService";

class FakeVault implements TwinVault {
  files = new Map<string, string>();
  binary = new Map<string, ArrayBuffer>();
  folders = new Set<string>();
  createCalls = 0;
  createFolderCalls = 0;
  modifyCalls = 0;

  exists(p: string): boolean {
    return this.files.has(p) || this.folders.has(p) || this.binary.has(p);
  }
  async createFolder(p: string): Promise<void> {
    this.createFolderCalls += 1;
    this.folders.add(p);
  }
  async create(p: string, data: string): Promise<void> {
    this.createCalls += 1;
    this.files.set(p, data);
  }
  async createBinary(p: string, data: ArrayBuffer): Promise<void> {
    this.binary.set(p, data);
  }
  async read(p: string): Promise<string> {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`Not found: ${p}`);
    return v;
  }
  async readBinary(p: string): Promise<ArrayBuffer> {
    const v = this.binary.get(p);
    if (!v) throw new Error(`Not found: ${p}`);
    return v;
  }
  async modify(p: string, data: string): Promise<void> {
    this.modifyCalls += 1;
    this.files.set(p, data);
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.files.has(oldPath)) {
      const v = this.files.get(oldPath)!;
      this.files.delete(oldPath);
      this.files.set(newPath, v);
    } else if (this.binary.has(oldPath)) {
      const v = this.binary.get(oldPath)!;
      this.binary.delete(oldPath);
      this.binary.set(newPath, v);
    } else {
      throw new Error(`Not found: ${oldPath}`);
    }
  }
  async delete(p: string): Promise<void> {
    this.files.delete(p);
    this.binary.delete(p);
    this.folders.delete(p);
  }
  // Default stub: produce a vault-relative wikilink, matching the format the
  // older (pre-formatLink) implementation hardcoded. Tests that need the
  // markdown-link path override this on the instance.
  async formatLink(targetPath: string, _sourcePath: string): Promise<string> {
    return `[[${targetPath}]]`;
  }
}

describe("extensionOf", () => {
  it("returns lowercased extension", () => {
    expect(extensionOf("attachments/Photo.PNG")).toBe("png");
  });
  it("returns last extension for multi-dot names", () => {
    expect(extensionOf("a/archive.tar.gz")).toBe("gz");
  });
  it("returns empty string for dotfiles", () => {
    expect(extensionOf("a/.hidden")).toBe("");
  });
  it("returns empty string for files without extension", () => {
    expect(extensionOf("a/Makefile")).toBe("");
  });
});

describe("buildTwinContent", () => {
  it("emits the three required frontmatter properties (wikilink ref)", () => {
    const content = buildTwinContent("[[attachments/photo.png]]", "png");
    expect(content).toContain('attachment-ref: "[[attachments/photo.png]]"');
    expect(content).toContain("attachment-type: png");
    expect(content).toContain("attachment-prev:");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content.split("---\n").length).toBe(3);
  });

  it("accepts pre-formatted markdown-style link strings (useMarkdownLinks: true)", () => {
    const content = buildTwinContent("[photo.png](attachments/photo.png)", "png");
    expect(content).toContain(
      'attachment-ref: "[photo.png](attachments/photo.png)"',
    );
  });

  it("YAML-quotes embedded double quotes in the link string", () => {
    const content = buildTwinContent('[odd"name](path)', "png");
    expect(content).toContain('attachment-ref: "[odd\\"name](path)"');
  });
});

describe("setTwinPreview", () => {
  it("replaces an existing empty attachment-prev line", () => {
    const before = buildTwinContent("[[a/x.png]]", "png");
    const after = setTwinPreview(before, "[[a/twin/preview/x.png]]");
    expect(after).toContain('attachment-prev: "[[a/twin/preview/x.png]]"');
    expect(after).not.toMatch(/^attachment-prev:\s*$/m);
  });

  it("replaces an already-populated attachment-prev line", () => {
    const before = buildTwinContent("[[a/x.png]]", "png").replace(
      "attachment-prev:",
      'attachment-prev: "[[old/path.png]]"',
    );
    const after = setTwinPreview(before, "[[new/path.png]]");
    expect(after).toContain('attachment-prev: "[[new/path.png]]"');
    expect(after).not.toContain("old/path.png");
  });

  it("inserts the property when missing, before the closing fence", () => {
    const without = ['---', 'attachment-ref: "[[a/x.png]]"', 'attachment-type: png', '---', ''].join("\n");
    const after = setTwinPreview(without, "[[a/twin/preview/x.png]]");
    expect(after).toContain('attachment-prev: "[[a/twin/preview/x.png]]"');
    expect(after.match(/^---\s*$/gm)?.length).toBe(2);
  });

  it("preserves attachment-ref and attachment-type lines", () => {
    const before = buildTwinContent("[[a/x.png]]", "png");
    const after = setTwinPreview(before, "[[a/twin/preview/x.png]]");
    expect(after).toContain('attachment-ref: "[[a/x.png]]"');
    expect(after).toContain("attachment-type: png");
  });

  it("works with markdown-style preview link", () => {
    const before = buildTwinContent("[[a/x.png]]", "png");
    const after = setTwinPreview(before, "[x.png](a/twin/preview/x.png)");
    expect(after).toContain(
      'attachment-prev: "[x.png](a/twin/preview/x.png)"',
    );
  });
});

describe("setTwinRef", () => {
  it("replaces the existing attachment-ref line", () => {
    const before = buildTwinContent("[[a/old.png]]", "png");
    const after = setTwinRef(before, "[[a/new.png]]");
    expect(after).toContain('attachment-ref: "[[a/new.png]]"');
    expect(after).not.toContain("a/old.png");
  });

  it("preserves attachment-type and attachment-prev when only the ref changes", () => {
    const before = buildTwinContent("[[a/x.png]]", "png").replace(
      "attachment-prev:",
      'attachment-prev: "[[a/twin/preview/x.png.png]]"',
    );
    const after = setTwinRef(before, "[[b/y.png]]");
    expect(after).toContain("attachment-type: png");
    expect(after).toContain('attachment-prev: "[[a/twin/preview/x.png.png]]"');
    expect(after).toContain('attachment-ref: "[[b/y.png]]"');
  });

  it("inserts the property when missing, before the closing fence", () => {
    const without = ['---', "attachment-type: png", "attachment-prev:", '---', ''].join("\n");
    const after = setTwinRef(without, "[[a/x.png]]");
    expect(after).toContain('attachment-ref: "[[a/x.png]]"');
    expect(after.match(/^---\s*$/gm)?.length).toBe(2);
  });
});

describe("ensureTwin", () => {
  it("creates the twin file and folder when missing", async () => {
    const v = new FakeVault();
    const result = await ensureTwin(v, "attachments/photo.png", "attachments");
    expect(result).toBe("created");
    expect(v.folders.has("attachments/twin")).toBe(true);
    expect(v.files.has("attachments/twin/photo.png.md")).toBe(true);
    expect(v.files.get("attachments/twin/photo.png.md")).toContain(
      'attachment-ref: "[[attachments/photo.png]]"',
    );
  });

  it("is idempotent on the second call", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/photo.png", "attachments");
    const second = await ensureTwin(v, "attachments/photo.png", "attachments");
    expect(second).toBe("exists");
    expect(v.createCalls).toBe(1);
  });

  it("does not call createFolder when the twin folder already exists", async () => {
    const v = new FakeVault();
    v.folders.add("attachments/twin");
    await ensureTwin(v, "attachments/photo.png", "attachments");
    expect(v.createFolderCalls).toBe(0);
    expect(v.files.has("attachments/twin/photo.png.md")).toBe(true);
  });

  it("works at vault root when attachment folder is empty", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "photo.png", "");
    expect(v.folders.has("twin")).toBe(true);
    expect(v.files.has("twin/photo.png.md")).toBe(true);
  });

  it("includes the lowercased extension as attachment-type", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/Doc.PDF", "attachments");
    expect(v.files.get("attachments/twin/Doc.PDF.md")).toContain("attachment-type: pdf");
  });

  it("creates two distinct twins for same-stem attachments with different extensions", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/track.mp3", "attachments");
    await ensureTwin(v, "attachments/track.aac", "attachments");
    expect(v.files.has("attachments/twin/track.mp3.md")).toBe(true);
    expect(v.files.has("attachments/twin/track.aac.md")).toBe(true);
    expect(v.createCalls).toBe(2);
  });

  it("creates a twin for an attachment with reserved characters (sanitized)", async () => {
    const v = new FakeVault();
    const result = await ensureTwin(v, "attachments/a:b?.png", "attachments");
    expect(result).toBe("created");
    expect(v.files.has("attachments/twin/a_b_.png.md")).toBe(true);
    // Frontmatter still references the original (unsanitized) path
    expect(v.files.get("attachments/twin/a_b_.png.md")).toContain(
      'attachment-ref: "[[attachments/a:b?.png]]"',
    );
  });
});
