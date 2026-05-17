import { describe, it, expect } from "vitest";
import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { findAttachmentsWithoutPreview } from "../../src/commands/generateMissingPreviews";
import { twinDir, previewFile } from "./testHelpers";

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
const mkFolder = (path: string, children: TAbstractFile[] = []): TFolder =>
  ({
    path,
    name: path.split("/").pop() ?? path,
    children,
  }) as unknown as TFolder;

const buildApp = (
  attachmentFolderPath: string,
  tree: TFolder,
  existingArtifacts: Set<string> = new Set(),
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
        if (existingArtifacts.has(p)) return mkFile(p);
        return (
          allFolders.find((x) => x.path === p) ?? allFiles.find((x) => x.path === p) ?? null
        );
      },
    },
  } as unknown as App;
};

// NOTE: image types (png/jpg/etc.) use self-reference and are excluded from
// the missing-preview list — the source IS the preview. Tests that need a
// "supported type whose preview file may be missing" use mp4/mp3/pdf instead.
describe("findAttachmentsWithoutPreview", () => {
  it("returns files of a supported type whose preview is missing", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/clip.mp4"),
      mkFile("attachments/song.mp3"),
      mkFile("attachments/report.pdf"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findAttachmentsWithoutPreview(app).sort()).toEqual([
      "attachments/clip.mp4",
      "attachments/report.pdf",
      "attachments/song.mp3",
    ]);
  });

  it("skips files whose preview already exists", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/song.mp3"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp(
      "attachments",
      tree,
      new Set([previewFile("attachments", "song.mp3.svg")]),
    );
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/clip.mp4"]);
  });

  it("skips files of unsupported types (no generator)", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/song.mp3"),
      mkFile("attachments/data.bin"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/song.mp3"]);
  });

  it("skips self-reference image types (source IS the preview)", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/picture.jpg"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/clip.mp4"]);
  });

  it("does not descend into the twin subtree", () => {
    const twinSub = mkFolder(twinDir("attachments"), [
      mkFile(`${twinDir("attachments")}/old.md`),
      mkFolder(`${twinDir("attachments")}/preview`, [mkFile(`${twinDir("attachments")}/preview/stale.png`)]),
    ]);
    const tree = mkFolder("attachments", [mkFile("attachments/song.mp3"), twinSub]);
    const app = buildApp("attachments", tree);
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/song.mp3"]);
  });

  it("excludes tombstoned paths from the missing-preview list", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/song.mp3"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp("attachments", tree);
    const isTombstoned = (path: string) => path === "attachments/clip.mp4";
    expect(findAttachmentsWithoutPreview(app, isTombstoned)).toEqual(["attachments/song.mp3"]);
  });

  it("walks subfolders inside the attachment folder", () => {
    const sub = mkFolder("attachments/sub", [mkFile("attachments/sub/deep.mp4")]);
    const tree = mkFolder("attachments", [mkFile("attachments/song.mp3"), sub]);
    const app = buildApp("attachments", tree);
    expect(findAttachmentsWithoutPreview(app).sort()).toEqual([
      "attachments/song.mp3",
      "attachments/sub/deep.mp4",
    ]);
  });
});
