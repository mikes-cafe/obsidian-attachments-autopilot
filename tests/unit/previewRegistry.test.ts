import { describe, it, expect } from "vitest";
import { defaultGenerators } from "../../src/services/previews";

describe("defaultGenerators registry", () => {
  it("registers a PDF generator that outputs PNG", () => {
    const gen = defaultGenerators.pdf;
    expect(gen).toBeDefined();
    expect(gen.outputExt).toBe("png");
    expect(gen.exts).toContain("pdf");
  });

  it("registers an image generator for common raster formats", () => {
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "bmp"]) {
      expect(defaultGenerators[ext]).toBeDefined();
    }
  });

  it("registers a video generator that outputs GIF", () => {
    const gen = defaultGenerators.mp4;
    expect(gen).toBeDefined();
    expect(gen.outputExt).toBe("gif");
    expect(gen.exts).toContain("mov");
    expect(gen.exts).toContain("webm");
  });

  it("registers an audio generator that outputs SVG", () => {
    const gen = defaultGenerators.mp3;
    expect(gen).toBeDefined();
    expect(gen.outputExt).toBe("svg");
  });

  it("does not register a generator for unknown types", () => {
    expect(defaultGenerators.bin).toBeUndefined();
    expect(defaultGenerators.exe).toBeUndefined();
  });
});
