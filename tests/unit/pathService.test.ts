import { describe, it, expect } from "vitest";
import {
  twinPathsFor,
  isInsideTwinFolder,
  isInsideAttachmentFolder,
  resolveAttachmentFolder,
  sanitizeBasename,
} from "../../src/services/pathService";

describe("twinPathsFor", () => {
  it("computes twin and preview paths in a nested attachment folder", () => {
    const p = twinPathsFor("attachments/photo.png", "attachments");
    expect(p.twinFolder).toBe("attachments/twin");
    expect(p.twinFile).toBe("attachments/twin/photo.png.md");
    expect(p.previewFolder).toBe("attachments/twin/preview");
    expect(p.previewFile("png")).toBe("attachments/twin/preview/photo.png.png");
    expect(p.previewFile("gif")).toBe("attachments/twin/preview/photo.png.gif");
  });

  it("handles vault-root attachments (empty folder)", () => {
    const p = twinPathsFor("photo.png", "");
    expect(p.twinFolder).toBe("twin");
    expect(p.twinFile).toBe("twin/photo.png.md");
    expect(p.previewFile("gif")).toBe("twin/preview/photo.png.gif");
  });

  it("includes the source extension so same-stem files get distinct twins", () => {
    const a = twinPathsFor("attachments/track.mp3", "attachments");
    const b = twinPathsFor("attachments/track.aac", "attachments");
    expect(a.twinFile).toBe("attachments/twin/track.mp3.md");
    expect(b.twinFile).toBe("attachments/twin/track.aac.md");
    expect(a.twinFile).not.toBe(b.twinFile);
    expect(a.previewFile("svg")).toBe("attachments/twin/preview/track.mp3.svg");
    expect(b.previewFile("svg")).toBe("attachments/twin/preview/track.aac.svg");
  });

  it("preserves spaces and unicode in filenames", () => {
    const p = twinPathsFor("attachments/Holiday foto ñ.jpg", "attachments");
    expect(p.twinFile).toBe("attachments/twin/Holiday foto ñ.jpg.md");
    expect(p.previewFile("jpg")).toBe("attachments/twin/preview/Holiday foto ñ.jpg.jpg");
  });

  it("treats the full filename as the basename for multi-dot names", () => {
    const p = twinPathsFor("attachments/archive.tar.gz", "attachments");
    expect(p.twinFile).toBe("attachments/twin/archive.tar.gz.md");
  });

  it("handles leading-dot filenames (no extension)", () => {
    const p = twinPathsFor("attachments/.gitkeep", "attachments");
    expect(p.twinFile).toBe("attachments/twin/.gitkeep.md");
  });

  it("sanitizes reserved characters in the basename", () => {
    const p = twinPathsFor("attachments/a:b?.png", "attachments");
    expect(p.twinFile).toBe("attachments/twin/a_b_.png.md");
    expect(p.previewFile("png")).toBe("attachments/twin/preview/a_b_.png.png");
  });

  it("strips leading and trailing slashes from the attachment folder", () => {
    const p = twinPathsFor("attachments/x.png", "/attachments/");
    expect(p.twinFolder).toBe("attachments/twin");
  });
});

describe("sanitizeBasename", () => {
  it("replaces every reserved character with an underscore", () => {
    expect(sanitizeBasename('a\\b/c:d*e?f"g<h>i|j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });
  it("preserves spaces, unicode, and dots", () => {
    expect(sanitizeBasename("Holiday foto ñ.jpg")).toBe("Holiday foto ñ.jpg");
    expect(sanitizeBasename(".gitkeep")).toBe(".gitkeep");
    expect(sanitizeBasename("archive.tar.gz")).toBe("archive.tar.gz");
  });
});

describe("isInsideTwinFolder", () => {
  it("returns true for files inside twin/", () => {
    expect(isInsideTwinFolder("attachments/twin/foo.md", "attachments")).toBe(true);
    expect(isInsideTwinFolder("attachments/twin/preview/foo.png", "attachments")).toBe(true);
    expect(isInsideTwinFolder("attachments/twin", "attachments")).toBe(true);
  });

  it("returns false for files outside twin/", () => {
    expect(isInsideTwinFolder("attachments/foo.png", "attachments")).toBe(false);
    expect(isInsideTwinFolder("notes/twin/foo.md", "attachments")).toBe(false);
    expect(isInsideTwinFolder("attachments/twinning.png", "attachments")).toBe(false);
  });

  it("works for vault-root attachment folder", () => {
    expect(isInsideTwinFolder("twin/foo.md", "")).toBe(true);
    expect(isInsideTwinFolder("twin", "")).toBe(true);
    expect(isInsideTwinFolder("foo.png", "")).toBe(false);
  });
});

describe("isInsideAttachmentFolder", () => {
  it("returns true for files in the configured folder", () => {
    expect(isInsideAttachmentFolder("attachments/foo.png", "attachments")).toBe(true);
    expect(isInsideAttachmentFolder("attachments/twin/foo.md", "attachments")).toBe(true);
  });
  it("returns false for files outside the configured folder", () => {
    expect(isInsideAttachmentFolder("notes/foo.md", "attachments")).toBe(false);
    expect(isInsideAttachmentFolder("attachmentsmore/foo.png", "attachments")).toBe(false);
  });
});

describe("resolveAttachmentFolder", () => {
  const mkApp = (cfg: unknown) =>
    ({ vault: { getConfig: (k: string) => (k === "attachmentFolderPath" ? cfg : null) } }) as never;

  it("returns the configured folder, slashes stripped", () => {
    expect(resolveAttachmentFolder(mkApp("attachments"))).toBe("attachments");
    expect(resolveAttachmentFolder(mkApp("/attachments/"))).toBe("attachments");
  });

  it("returns empty string when not set or non-string", () => {
    expect(resolveAttachmentFolder(mkApp(""))).toBe("");
    expect(resolveAttachmentFolder(mkApp(undefined))).toBe("");
    expect(resolveAttachmentFolder(mkApp(null))).toBe("");
  });

  it("returns empty string when getConfig is missing", () => {
    expect(resolveAttachmentFolder({ vault: {} } as never)).toBe("");
  });
});
