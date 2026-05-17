import { describe, it, expect } from "vitest";
import {
  twinPathsFor,
  isInsideTwinFolder,
  isInsideAttachmentFolder,
  resolveAttachmentFolder,
  attachmentFolderMode,
  sanitizeBasename,
} from "../../src/services/pathService";
import { twinDir, twinFile, previewDir, previewFile } from "./testHelpers";

describe("twinPathsFor", () => {
  // Golden-value canary: raw string assertion that does NOT use the helper,
  // so helper/implementation drift causes an immediate failure here.
  it("golden: attachments folder produces attachments-twins", () => {
    expect(twinPathsFor("attachments/x.png", "attachments").twinFolder)
      .toBe("attachments/attachments-twins");
  });

  it("computes twin and preview paths in a nested attachment folder", () => {
    const p = twinPathsFor("attachments/photo.png", "attachments");
    expect(p.twinFolder).toBe(twinDir("attachments"));
    expect(p.twinFile).toBe(twinFile("attachments", "photo.png.md"));
    expect(p.previewFolder).toBe(previewDir("attachments"));
    expect(p.previewFile("png")).toBe(previewFile("attachments", "photo.png.png"));
    expect(p.previewFile("gif")).toBe(previewFile("attachments", "photo.png.gif"));
  });

  it("handles vault-root attachments (empty folder)", () => {
    const p = twinPathsFor("photo.png", "");
    expect(p.twinFolder).toBe(twinDir(""));
    expect(p.twinFile).toBe(twinFile("", "photo.png.md"));
    expect(p.previewFile("gif")).toBe(previewFile("", "photo.png.gif"));
  });

  it("includes the source extension so same-stem files get distinct twins", () => {
    const a = twinPathsFor("attachments/track.mp3", "attachments");
    const b = twinPathsFor("attachments/track.aac", "attachments");
    expect(a.twinFile).toBe(twinFile("attachments", "track.mp3.md"));
    expect(b.twinFile).toBe(twinFile("attachments", "track.aac.md"));
    expect(a.twinFile).not.toBe(b.twinFile);
    expect(a.previewFile("svg")).toBe(previewFile("attachments", "track.mp3.svg"));
    expect(b.previewFile("svg")).toBe(previewFile("attachments", "track.aac.svg"));
  });

  it("preserves spaces and unicode in filenames", () => {
    const p = twinPathsFor("attachments/Holiday foto ñ.jpg", "attachments");
    expect(p.twinFile).toBe(twinFile("attachments", "Holiday foto ñ.jpg.md"));
    expect(p.previewFile("jpg")).toBe(previewFile("attachments", "Holiday foto ñ.jpg.jpg"));
  });

  it("treats the full filename as the basename for multi-dot names", () => {
    const p = twinPathsFor("attachments/archive.tar.gz", "attachments");
    expect(p.twinFile).toBe(twinFile("attachments", "archive.tar.gz.md"));
  });

  it("handles leading-dot filenames (no extension)", () => {
    const p = twinPathsFor("attachments/.gitkeep", "attachments");
    expect(p.twinFile).toBe(twinFile("attachments", ".gitkeep.md"));
  });

  it("sanitizes reserved characters in the basename", () => {
    const p = twinPathsFor("attachments/a:b?.png", "attachments");
    expect(p.twinFile).toBe(twinFile("attachments", "a_b_.png.md"));
    expect(p.previewFile("png")).toBe(previewFile("attachments", "a_b_.png.png"));
  });

  it("strips leading and trailing slashes from the attachment folder", () => {
    const p = twinPathsFor("attachments/x.png", "/attachments/");
    expect(p.twinFolder).toBe(twinDir("attachments"));
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
  it("returns true for files inside the twin folder", () => {
    expect(isInsideTwinFolder(twinFile("attachments", "foo.md"), "attachments")).toBe(true);
    expect(isInsideTwinFolder(previewFile("attachments", "foo.png"), "attachments")).toBe(true);
    expect(isInsideTwinFolder(twinDir("attachments"), "attachments")).toBe(true);
  });

  it("returns false for files outside the twin folder", () => {
    expect(isInsideTwinFolder("attachments/foo.png", "attachments")).toBe(false);
    expect(isInsideTwinFolder("notes/notes-twins/foo.md", "attachments")).toBe(false);
    expect(isInsideTwinFolder("attachments/twinning.png", "attachments")).toBe(false);
  });

  it("works for vault-root attachment folder", () => {
    expect(isInsideTwinFolder(twinFile("", "foo.md"), "")).toBe(true);
    expect(isInsideTwinFolder(twinDir(""), "")).toBe(true);
    expect(isInsideTwinFolder("foo.png", "")).toBe(false);
  });
});

describe("isInsideAttachmentFolder", () => {
  it("returns true for files in the configured folder", () => {
    expect(isInsideAttachmentFolder("attachments/foo.png", "attachments")).toBe(true);
    expect(isInsideAttachmentFolder(twinFile("attachments", "foo.md"), "attachments")).toBe(true);
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
    expect(resolveAttachmentFolder(mkApp(123))).toBe("");
    expect(resolveAttachmentFolder(mkApp(false))).toBe("");
  });

  it("returns empty string when getConfig is missing", () => {
    expect(resolveAttachmentFolder({ vault: {} } as never)).toBe("");
  });

  // The plugin reads the configured folder fresh on every event/command (no
  // cache at onload). This pins that contract — if a future refactor caches
  // the value, mid-session changes to `attachmentFolderPath` would silently
  // break and CI would catch it here.
  it("re-reads the attachment folder fresh on every call (no caching across mid-session changes)", () => {
    let current: unknown = "attachments";
    const app = {
      vault: {
        getConfig: (k: string) =>
          k === "attachmentFolderPath" ? current : null,
      },
    } as never;

    expect(resolveAttachmentFolder(app)).toBe("attachments");
    current = "media";
    expect(resolveAttachmentFolder(app)).toBe("media");
    current = "";
    expect(resolveAttachmentFolder(app)).toBe("");
    current = "/notes/files/";
    expect(resolveAttachmentFolder(app)).toBe("notes/files");
    current = undefined;
    expect(resolveAttachmentFolder(app)).toBe("");
  });

  // §13.1 of the QA plan — exhaustively cover every attachment-folder shape we
  // know users can configure, plus defensive cases (whitespace, doubled
  // slashes, unicode). Pinned here so a regression in `stripSlashes` is caught
  // before it ships.
  describe("normalizer matrix", () => {
    const cases: Array<{ name: string; input: unknown; folder: string; twinFile: string }> = [
      { name: "default 'attachments'",        input: "attachments",     folder: "attachments",    twinFile: twinFile("attachments",    "photo.png.md") },
      { name: "vault root (empty)",            input: "",                folder: "",               twinFile: twinFile("",               "photo.png.md") },
      { name: "nested 'notes/files'",          input: "notes/files",     folder: "notes/files",    twinFile: twinFile("notes/files",    "photo.png.md") },
      { name: "wrapping slashes",              input: "/attachments/",   folder: "attachments",    twinFile: twinFile("attachments",    "photo.png.md") },
      { name: "spaces in folder",              input: "My Attachments",  folder: "My Attachments", twinFile: twinFile("My Attachments", "photo.png.md") },
      { name: "unicode + trailing slash",      input: "附件/",            folder: "附件",            twinFile: twinFile("附件",           "photo.png.md") },
      { name: "doubled slashes",               input: "//attachments//", folder: "attachments",    twinFile: twinFile("attachments",    "photo.png.md") },
      { name: "leading + trailing whitespace", input: "   attachments   ", folder: "attachments",  twinFile: twinFile("attachments",    "photo.png.md") },
    ];

    for (const c of cases) {
      it(`${c.name}: resolves and produces the expected twin path`, () => {
        const folder = resolveAttachmentFolder(mkApp(c.input));
        expect(folder).toBe(c.folder);
        const sourcePath = c.folder === "" ? "photo.png" : `${c.folder}/photo.png`;
        const p = twinPathsFor(sourcePath, folder);
        expect(p.twinFile).toBe(c.twinFile);
      });
    }

    it("isInsideAttachmentFolder agrees with the normalized folder", () => {
      const folder = resolveAttachmentFolder(mkApp("//My Attachments//"));
      expect(folder).toBe("My Attachments");
      expect(isInsideAttachmentFolder("My Attachments/photo.png", folder)).toBe(true);
      expect(isInsideAttachmentFolder("OtherFolder/photo.png", folder)).toBe(false);
    });
  });
});

// Classifies the four UI modes of `attachmentFolderPath`. The plugin uses this
// to (a) surface a one-shot Notice when the user is in `relative` mode and (b)
// funnel `relative` through `resolveAttachmentFolder = ""` so the rest of the
// codebase sees a single "vault root" world for all non-specific configs.
describe("attachmentFolderMode", () => {
  const mkApp = (cfg: unknown) =>
    ({ vault: { getConfig: (k: string) => (k === "attachmentFolderPath" ? cfg : null) } }) as never;

  it("returns 'root' for empty / slash / missing config", () => {
    expect(attachmentFolderMode(mkApp(""))).toBe("root");
    expect(attachmentFolderMode(mkApp("/"))).toBe("root");
    expect(attachmentFolderMode(mkApp("   "))).toBe("root");
    expect(attachmentFolderMode(mkApp(undefined))).toBe("root");
    expect(attachmentFolderMode(mkApp(null))).toBe("root");
    expect(attachmentFolderMode(mkApp(123))).toBe("root");
    expect(attachmentFolderMode({ vault: {} } as never)).toBe("root");
  });

  it("returns 'specific' for absolute folder paths", () => {
    expect(attachmentFolderMode(mkApp("attachments"))).toBe("specific");
    expect(attachmentFolderMode(mkApp("notes/files"))).toBe("specific");
    expect(attachmentFolderMode(mkApp("/attachments/"))).toBe("specific");
    expect(attachmentFolderMode(mkApp("My Attachments"))).toBe("specific");
    expect(attachmentFolderMode(mkApp("附件"))).toBe("specific");
  });

  it("returns 'relative' for Obsidian's per-note modes", () => {
    expect(attachmentFolderMode(mkApp("."))).toBe("relative");
    expect(attachmentFolderMode(mkApp("./"))).toBe("relative");
    expect(attachmentFolderMode(mkApp("./_attachments"))).toBe("relative");
    expect(attachmentFolderMode(mkApp("./media/files"))).toBe("relative");
    expect(attachmentFolderMode(mkApp("../up"))).toBe("relative");
  });
});

// Regression: relative configs (Obsidian's "Same folder as current file" /
// "In subfolder under the current folder") must funnel through `""` so the
// watcher / lifecycle / twinPathsFor code paths use vault-root semantics.
// Before this fix, `resolveAttachmentFolder("./")` returned `"./"` literal,
// which broke `isInsideAttachmentFolder` and silently no-op'd the plugin.
describe("resolveAttachmentFolder — relative-mode fallback", () => {
  const mkApp = (cfg: unknown) =>
    ({ vault: { getConfig: (k: string) => (k === "attachmentFolderPath" ? cfg : null) } }) as never;

  it("funnels relative configs to empty string (vault root)", () => {
    expect(resolveAttachmentFolder(mkApp("."))).toBe("");
    expect(resolveAttachmentFolder(mkApp("./"))).toBe("");
    expect(resolveAttachmentFolder(mkApp("./_attachments"))).toBe("");
    expect(resolveAttachmentFolder(mkApp("./media/files"))).toBe("");
    expect(resolveAttachmentFolder(mkApp("../up"))).toBe("");
  });
});
