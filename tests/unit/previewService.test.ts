import { describe, it, expect, vi } from "vitest";
import { ensurePreview } from "../../src/services/previewService";
import { ensureTwin, type TwinVault } from "../../src/services/twinService";
import type { PreviewGenerator } from "../../src/services/previews";
import { twinFile, previewDir, previewFile } from "./testHelpers";

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
    if (v === undefined) throw new Error(`missing ${p}`);
    return v;
  }
  async readBinary(p: string): Promise<ArrayBuffer> {
    const v = this.binary.get(p);
    if (!v) throw new Error(`missing ${p}`);
    return v;
  }
  async modify(p: string, d: string): Promise<void> {
    this.files.set(p, d);
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    for (const map of [this.files, this.binary] as Array<Map<string, string | ArrayBuffer>>) {
      if (map.has(oldPath)) {
        map.set(newPath, map.get(oldPath) as never);
        map.delete(oldPath);
        return;
      }
    }
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

const buf = (text: string) => new TextEncoder().encode(text).buffer;

const makeGen = (overrides: Partial<PreviewGenerator> = {}): PreviewGenerator => ({
  exts: ["png"],
  outputExt: "png",
  generate: vi.fn(async () => buf("preview-bytes")),
  ...overrides,
});

describe("ensurePreview", () => {
  it("returns 'skipped' when no generator matches the extension", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/file.xyz", buf("data"));
    const result = await ensurePreview(v, "attachments/file.xyz", "attachments", {});
    expect(result).toBe("skipped");
  });

  it("creates the preview file, the preview folder, and updates twin frontmatter", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/photo.png", buf("source"));
    await ensureTwin(v, "attachments/photo.png", "attachments");
    const gens = { png: makeGen() };

    const result = await ensurePreview(v, "attachments/photo.png", "attachments", gens);

    expect(result).toBe("created");
    expect(v.folders.has(previewDir("attachments"))).toBe(true);
    expect(v.binary.has(previewFile("attachments", "photo.png.png"))).toBe(true);
    expect(v.files.get(twinFile("attachments", "photo.png.md"))).toContain(
      `attachment-prev: "[[${previewFile("attachments", "photo.png.png")}]]"`,
    );
  });

  it("is idempotent — preview exists → no regeneration, but frontmatter is reconciled", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/photo.png", buf("source"));
    await ensureTwin(v, "attachments/photo.png", "attachments");
    const gen = makeGen();
    const gens = { png: gen };

    await ensurePreview(v, "attachments/photo.png", "attachments", gens);
    const callsAfterFirst = (gen.generate as ReturnType<typeof vi.fn>).mock.calls.length;
    const result = await ensurePreview(v, "attachments/photo.png", "attachments", gens);

    expect(result).toBe("exists");
    expect((gen.generate as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });

  it("returns 'failed' and does not write anything when the generator throws", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/photo.png", buf("source"));
    await ensureTwin(v, "attachments/photo.png", "attachments");
    const gens = {
      png: makeGen({
        generate: vi.fn(async () => {
          throw new Error("boom");
        }),
      }),
    };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await ensurePreview(v, "attachments/photo.png", "attachments", gens);

    expect(result).toBe("failed");
    expect(v.binary.has(previewFile("attachments", "photo.png.png"))).toBe(false);
    errSpy.mockRestore();
  });

  it("uses the generator's outputExt for the preview filename", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/clip.mp4", buf("video"));
    await ensureTwin(v, "attachments/clip.mp4", "attachments");
    const gens = { mp4: makeGen({ exts: ["mp4"], outputExt: "gif" }) };

    await ensurePreview(v, "attachments/clip.mp4", "attachments", gens);

    expect(v.binary.has(previewFile("attachments", "clip.mp4.gif"))).toBe(true);
    expect(v.files.get(twinFile("attachments", "clip.mp4.md"))).toContain(
      `attachment-prev: "[[${previewFile("attachments", "clip.mp4.gif")}]]"`,
    );
  });

  it("does not fail when the twin file does not yet exist (preview-only run)", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/photo.png", buf("source"));
    const gens = { png: makeGen() };
    const result = await ensurePreview(v, "attachments/photo.png", "attachments", gens);
    expect(result).toBe("created");
    expect(v.binary.has(previewFile("attachments", "photo.png.png"))).toBe(true);
  });

  it("isolates a failing pdf generator from a working png generator (cross-generator independence)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const v = new FakeVault();
    v.binary.set("attachments/doc.pdf", buf("pdfsrc"));
    v.binary.set("attachments/photo.png", buf("imgsrc"));
    const gens = {
      pdf: makeGen({
        exts: ["pdf"],
        outputExt: "png",
        generate: vi.fn(async () => {
          throw new Error("pdfjs imploded");
        }),
      }),
      png: makeGen(),
    };

    const pdfResult = await ensurePreview(v, "attachments/doc.pdf", "attachments", gens);
    const pngResult = await ensurePreview(v, "attachments/photo.png", "attachments", gens);

    expect(pdfResult).toBe("failed");
    expect(pngResult).toBe("created");
    expect(v.binary.has(previewFile("attachments", "photo.png.png"))).toBe(true);
    expect(v.binary.has(previewFile("attachments", "doc.pdf.png"))).toBe(false);
    errSpy.mockRestore();
  });

  it("self-reference generator: points attachment-prev at the source and writes no preview file", async () => {
    const v = new FakeVault();
    v.binary.set("attachments/photo.png", buf("source"));
    await ensureTwin(v, "attachments/photo.png", "attachments");
    const generate = vi.fn(async () => buf("never-called"));
    const gens = {
      png: makeGen({ selfReference: true, outputExt: "", generate }),
    };

    const result = await ensurePreview(v, "attachments/photo.png", "attachments", gens);

    expect(result).toBe("exists");
    expect(generate).not.toHaveBeenCalled();
    expect(v.folders.has(previewDir("attachments"))).toBe(false);
    expect(v.binary.has(previewFile("attachments", "photo.png.png"))).toBe(false);
    expect(v.files.get(twinFile("attachments", "photo.png.md"))).toContain(
      'attachment-prev: "[[attachments/photo.png]]"',
    );
  });

  it("isolates a failing video generator the same way", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const v = new FakeVault();
    v.binary.set("attachments/clip.mp4", buf("vidsrc"));
    v.binary.set("attachments/song.mp3", buf("audsrc"));
    const gens = {
      mp4: makeGen({
        exts: ["mp4"],
        outputExt: "gif",
        generate: vi.fn(async () => {
          throw new Error("gifenc imploded");
        }),
      }),
      mp3: makeGen({ exts: ["mp3"], outputExt: "svg" }),
    };

    const mp4Result = await ensurePreview(v, "attachments/clip.mp4", "attachments", gens);
    const mp3Result = await ensurePreview(v, "attachments/song.mp3", "attachments", gens);

    expect(mp4Result).toBe("failed");
    expect(mp3Result).toBe("created");
    expect(v.binary.has(previewFile("attachments", "song.mp3.svg"))).toBe(true);
    expect(v.binary.has(previewFile("attachments", "clip.mp4.gif"))).toBe(false);
    errSpy.mockRestore();
  });
});
