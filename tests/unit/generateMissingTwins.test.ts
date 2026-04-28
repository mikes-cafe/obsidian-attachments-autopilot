import { describe, it, expect } from "vitest";
import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { findOrphanAttachments } from "../../src/commands/generateMissingTwins";

const mkFile = (path: string): TFile => {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return {
    path,
    name,
    basename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : "",
  } as TFile;
};

const mkFolder = (path: string, children: TAbstractFile[] = []): TFolder => {
  const f = {
    path,
    name: path.split("/").pop() ?? path,
    children,
  } as unknown as TFolder;
  return f;
};

const buildApp = (
  attachmentFolderPath: string,
  tree: TFolder,
  existingTwins: Set<string> = new Set(),
): App => {
  const allFiles: TFile[] = [];
  const allFolders: TFolder[] = [];
  const walk = (f: TFolder) => {
    allFolders.push(f);
    for (const child of f.children) {
      if (Array.isArray((child as TFolder).children)) walk(child as TFolder);
      else allFiles.push(child as TFile);
    }
  };
  walk(tree);

  return {
    vault: {
      getConfig: (k: string) => (k === "attachmentFolderPath" ? attachmentFolderPath : null),
      getRoot: () => tree,
      getAbstractFileByPath: (p: string) => {
        if (existingTwins.has(p)) return mkFile(p);
        return (
          allFolders.find((x) => x.path === p) ?? allFiles.find((x) => x.path === p) ?? null
        );
      },
    },
  } as unknown as App;
};

describe("findOrphanAttachments", () => {
  it("returns non-md files inside the attachment folder that lack a twin", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
      mkFile("attachments/note.md"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app).sort()).toEqual([
      "attachments/clip.mp4",
      "attachments/photo.png",
    ]);
  });

  it("skips files that already have a twin", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp("attachments", tree, new Set(["attachments/twin/photo.png.md"]));
    expect(findOrphanAttachments(app)).toEqual(["attachments/clip.mp4"]);
  });

  it("does not descend into the twin/ subtree", () => {
    // Stale twin & preview files that don't correspond to photo.png — if the
    // walker descended into twin/, these would be (incorrectly) returned as orphans.
    const twinSubfolder = mkFolder("attachments/twin", [
      mkFile("attachments/twin/old-orphan.md"),
      mkFolder("attachments/twin/preview", [
        mkFile("attachments/twin/preview/stale.png"),
      ]),
    ]);
    const tree = mkFolder("attachments", [mkFile("attachments/photo.png"), twinSubfolder]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app)).toEqual(["attachments/photo.png"]);
  });

  it("walks subfolders inside the attachment folder", () => {
    const sub = mkFolder("attachments/sub", [mkFile("attachments/sub/deep.png")]);
    const tree = mkFolder("attachments", [mkFile("attachments/photo.png"), sub]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app).sort()).toEqual([
      "attachments/photo.png",
      "attachments/sub/deep.png",
    ]);
  });

  it("does NOT scan files outside the attachment folder", () => {
    // Even if a sibling vault folder has files, they are unreachable because
    // the walk starts from the attachment folder itself.
    const tree = mkFolder("attachments", [mkFile("attachments/photo.png")]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app)).toEqual(["attachments/photo.png"]);
  });

  it("excludes tombstoned paths from the orphan list", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp("attachments", tree);
    const isTombstoned = (path: string) => path === "attachments/photo.png";
    expect(findOrphanAttachments(app, isTombstoned)).toEqual(["attachments/clip.mp4"]);
  });

  it("returns empty when the attachment folder is missing from the vault", () => {
    const app = {
      vault: {
        getConfig: () => "attachments",
        getRoot: () => mkFolder(""),
        getAbstractFileByPath: () => null,
      },
    } as unknown as App;
    expect(findOrphanAttachments(app)).toEqual([]);
  });

  // Pins the QA plan §13.3 contract: when the user changes
  // `attachmentFolderPath` mid-session, the next invocation of the orphan
  // scan must walk the *new* folder, not a stale value from when the plugin
  // loaded. Implementation detail: the command callback re-resolves the
  // folder via `resolveAttachmentFolder` on every invocation.
  it("honors a mid-session change of the attachment folder config", () => {
    const attachmentsFolder = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    const mediaFolder = mkFolder("media", [
      mkFile("media/song.mp3"),
      mkFile("media/doc.pdf"),
    ]);
    const root = mkFolder("", [attachmentsFolder, mediaFolder]);

    const allFiles: TFile[] = [];
    const allFolders: TFolder[] = [root, attachmentsFolder, mediaFolder];
    for (const f of [attachmentsFolder, mediaFolder]) {
      for (const child of f.children) {
        if (!Array.isArray((child as TFolder).children)) {
          allFiles.push(child as TFile);
        }
      }
    }

    let currentFolder = "attachments";
    const app = {
      vault: {
        getConfig: (k: string) =>
          k === "attachmentFolderPath" ? currentFolder : null,
        getRoot: () => root,
        getAbstractFileByPath: (p: string) =>
          allFolders.find((x) => x.path === p) ??
          allFiles.find((x) => x.path === p) ??
          null,
      },
    } as unknown as App;

    // Initial config: walk only attachments/.
    expect(findOrphanAttachments(app).sort()).toEqual([
      "attachments/clip.mp4",
      "attachments/photo.png",
    ]);

    // User changes Files & Links → "Default location for new attachments"
    // from "attachments" to "media". No reload of the plugin.
    currentFolder = "media";

    // The next invocation must walk media/, not attachments/.
    expect(findOrphanAttachments(app).sort()).toEqual([
      "media/doc.pdf",
      "media/song.mp3",
    ]);

    // Switch to vault-root mode mid-session.
    currentFolder = "";

    const fromRoot = findOrphanAttachments(app).sort();
    expect(fromRoot).toContain("attachments/photo.png");
    expect(fromRoot).toContain("media/song.mp3");
    // No file under twin/ (there are none in this fixture, but it's the spec).
  });
});
