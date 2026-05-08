import { describe, it, expect } from "vitest";
import {
  classifyTransition,
  deleteTwin,
  renameTwin,
} from "../../src/services/lifecycleService";
import { ensureTwin, type TwinVault } from "../../src/services/twinService";

class FakeVault implements TwinVault {
  files = new Map<string, string>();
  binary = new Map<string, ArrayBuffer>();
  folders = new Set<string>();

  exists(p: string): boolean {
    return this.files.has(p) || this.folders.has(p) || this.binary.has(p);
  }
  async createFolder(p: string): Promise<void> {
    this.folders.add(p);
  }
  async create(p: string, d: string): Promise<void> {
    this.files.set(p, d);
  }
  async createBinary(p: string, d: ArrayBuffer): Promise<void> {
    this.binary.set(p, d);
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
  async modify(p: string, d: string): Promise<void> {
    this.files.set(p, d);
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    if (this.files.has(oldPath)) {
      const v = this.files.get(oldPath)!;
      this.files.delete(oldPath);
      this.files.set(newPath, v);
      return;
    }
    if (this.binary.has(oldPath)) {
      const v = this.binary.get(oldPath)!;
      this.binary.delete(oldPath);
      this.binary.set(newPath, v);
      return;
    }
    throw new Error(`Not found: ${oldPath}`);
  }
  async delete(p: string): Promise<void> {
    this.files.delete(p);
    this.binary.delete(p);
    this.folders.delete(p);
  }
  async formatLink(targetPath: string, _sourcePath: string): Promise<string> {
    return `[[${targetPath}]]`;
  }
}

describe("classifyTransition", () => {
  const folder = "attachments";

  it("returns 'create' when entering scope", () => {
    expect(classifyTransition(null, "attachments/photo.png", folder)).toBe("create");
    expect(classifyTransition("notes/photo.png", "attachments/photo.png", folder)).toBe("create");
  });

  it("returns 'delete' when leaving scope", () => {
    expect(classifyTransition("attachments/photo.png", null, folder)).toBe("delete");
    expect(classifyTransition("attachments/photo.png", "notes/photo.png", folder)).toBe("delete");
  });

  it("returns 'rename' when both ends are in scope", () => {
    expect(
      classifyTransition("attachments/old.png", "attachments/new.png", folder),
    ).toBe("rename");
    expect(
      classifyTransition("attachments/sub/a.png", "attachments/b.png", folder),
    ).toBe("rename");
  });

  it("returns 'none' when neither end is in scope", () => {
    expect(classifyTransition(null, null, folder)).toBe("none");
    expect(classifyTransition("notes/a.png", "notes/b.png", folder)).toBe("none");
  });

  it("treats a move into twin/ as leaving scope", () => {
    expect(
      classifyTransition("attachments/photo.png", "attachments/twin/photo.png", folder),
    ).toBe("delete");
  });

  it("treats a move out of twin/ into a regular attachment path as entering scope", () => {
    expect(
      classifyTransition("attachments/twin/old.png", "attachments/new.png", folder),
    ).toBe("create");
  });
});

describe("renameTwin", () => {
  const folder = "attachments";

  it("renames the twin file and updates its frontmatter ref", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/old.png", folder);
    await renameTwin(v, "attachments/old.png", "attachments/new.png", folder);

    expect(v.files.has("attachments/twin/old.png.md")).toBe(false);
    expect(v.files.has("attachments/twin/new.png.md")).toBe(true);
    const content = v.files.get("attachments/twin/new.png.md")!;
    expect(content).toContain('attachment-ref: "[[attachments/new.png]]"');
  });

  // Non-self-reference path: video → GIF preview file is renamed alongside the twin.
  it("renames an existing preview file alongside the twin and updates attachment-prev", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/old.mp4", folder);
    // Simulate a previously-generated GIF preview.
    v.binary.set("attachments/twin/preview/old.mp4.gif", new ArrayBuffer(8));
    // Simulate twin frontmatter that already points at the old preview.
    v.files.set(
      "attachments/twin/old.mp4.md",
      [
        "---",
        'attachment-ref: "[[attachments/old.mp4]]"',
        "attachment-type: mp4",
        'attachment-prev: "[[attachments/twin/preview/old.mp4.gif]]"',
        "---",
        "",
      ].join("\n"),
    );

    await renameTwin(v, "attachments/old.mp4", "attachments/new.mp4", folder);

    expect(v.binary.has("attachments/twin/preview/old.mp4.gif")).toBe(false);
    expect(v.binary.has("attachments/twin/preview/new.mp4.gif")).toBe(true);
    const content = v.files.get("attachments/twin/new.mp4.md")!;
    expect(content).toContain('attachment-ref: "[[attachments/new.mp4]]"');
    expect(content).toContain(
      'attachment-prev: "[[attachments/twin/preview/new.mp4.gif]]"',
    );
  });

  // Self-reference path: image source IS the preview, so attachment-prev points at
  // the source itself. After rename, attachment-prev follows to the new source path
  // and no file under twin/preview/ is touched.
  it("self-reference: rename image attachment updates attachment-prev to new source path", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/old.png", folder);
    // Simulate the post-self-reference twin: attachment-prev pointing at source.
    v.files.set(
      "attachments/twin/old.png.md",
      [
        "---",
        'attachment-ref: "[[attachments/old.png]]"',
        "attachment-type: png",
        'attachment-prev: "[[attachments/old.png]]"',
        "---",
        "",
      ].join("\n"),
    );

    await renameTwin(v, "attachments/old.png", "attachments/new.png", folder);

    // No preview file under twin/preview/ — the source is the preview.
    expect(v.binary.has("attachments/twin/preview/old.png.png")).toBe(false);
    expect(v.binary.has("attachments/twin/preview/new.png.png")).toBe(false);
    const content = v.files.get("attachments/twin/new.png.md")!;
    expect(content).toContain('attachment-ref: "[[attachments/new.png]]"');
    expect(content).toContain('attachment-prev: "[[attachments/new.png]]"');
  });

  it("is a no-op when old and new attachment paths produce the same twin path", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/photo.png", folder);
    const before = v.files.get("attachments/twin/photo.png.md")!;
    await renameTwin(v, "attachments/photo.png", "attachments/photo.png", folder);
    expect(v.files.get("attachments/twin/photo.png.md")).toBe(before);
  });

  it("is silent when there's no twin to rename (attachment had no twin yet)", async () => {
    const v = new FakeVault();
    await expect(
      renameTwin(v, "attachments/old.png", "attachments/new.png", folder),
    ).resolves.toBeUndefined();
    expect(v.files.size).toBe(0);
  });

  // §14.4 regression — Bug-002 from the v1.1 QA round.
  // Move within scope to a subfolder: basename is unchanged, so twin path and
  // preview path are byte-identical, but `attachment-ref` MUST still update to
  // the new full attachment path.
  it("updates attachment-ref when the source moves into a subfolder (twin path unchanged)", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/clip.mp4", folder);
    v.binary.set("attachments/twin/preview/clip.mp4.gif", new ArrayBuffer(8));
    v.files.set(
      "attachments/twin/clip.mp4.md",
      [
        "---",
        'attachment-ref: "[[attachments/clip.mp4]]"',
        "attachment-type: mp4",
        'attachment-prev: "[[attachments/twin/preview/clip.mp4.gif]]"',
        "---",
        "",
      ].join("\n"),
    );

    await renameTwin(
      v,
      "attachments/clip.mp4",
      "attachments/2024/clip.mp4",
      folder,
    );

    // Twin file path is unchanged (it's keyed by basename only).
    expect(v.files.has("attachments/twin/clip.mp4.md")).toBe(true);
    const content = v.files.get("attachments/twin/clip.mp4.md")!;
    // But the wikilink reflects the new full path including the subfolder.
    expect(content).toContain('attachment-ref: "[[attachments/2024/clip.mp4]]"');
    // Preview file is also unchanged on disk and in the frontmatter.
    expect(v.binary.has("attachments/twin/preview/clip.mp4.gif")).toBe(true);
    expect(content).toContain(
      'attachment-prev: "[[attachments/twin/preview/clip.mp4.gif]]"',
    );
  });

  // §14.2 regression — also from the v1.1 QA round. The previous fix attempt
  // read the renamed file *after* the rename and was unreliable in production.
  // This test pins the contract that the frontmatter rewrite never depends on
  // a successful post-rename read: it's applied to the OLD twin path before
  // the rename moves the file to the new path.
  it("rewrites frontmatter even if reading the post-rename twin path would fail", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/old.png", folder);

    // Wedge: any attempt to read `attachments/twin/new.png.md` blows up. If
    // the implementation depended on a post-rename read, this test would fail.
    const realRead = v.read.bind(v);
    v.read = async (p: string) => {
      if (p === "attachments/twin/new.png.md") {
        throw new Error("simulated post-rename read failure");
      }
      return realRead(p);
    };

    await renameTwin(v, "attachments/old.png", "attachments/new.png", folder);

    expect(v.files.has("attachments/twin/new.png.md")).toBe(true);
    expect(v.files.get("attachments/twin/new.png.md")).toContain(
      'attachment-ref: "[[attachments/new.png]]"',
    );
  });
});

describe("deleteTwin", () => {
  const folder = "attachments";

  it("removes the twin file", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/photo.png", folder);
    await deleteTwin(v, "attachments/photo.png", folder);
    expect(v.files.has("attachments/twin/photo.png.md")).toBe(false);
  });

  it("removes any preview file regardless of output extension", async () => {
    const v = new FakeVault();
    await ensureTwin(v, "attachments/clip.mp4", folder);
    v.binary.set("attachments/twin/preview/clip.mp4.gif", new ArrayBuffer(4));
    await deleteTwin(v, "attachments/clip.mp4", folder);
    expect(v.binary.has("attachments/twin/preview/clip.mp4.gif")).toBe(false);
    expect(v.files.has("attachments/twin/clip.mp4.md")).toBe(false);
  });

  it("is silent when nothing exists to delete", async () => {
    const v = new FakeVault();
    await expect(deleteTwin(v, "attachments/photo.png", folder)).resolves.toBeUndefined();
  });
});
