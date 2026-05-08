import { describe, it, expect } from "vitest";
import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import { findOrphanAttachments } from "../../src/commands/generateMissingTwins";
import { findAttachmentsWithoutPreview } from "../../src/commands/generateMissingPreviews";

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
  ({ path, name: path.split("/").pop() ?? path, children }) as unknown as TFolder;

// existing: set of artifact paths (twins, previews) already present in the vault
const buildApp = (
  attachmentFolderPath: string,
  tree: TFolder,
  existing: Set<string> = new Set(),
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
        if (existing.has(p)) return mkFile(p);
        return allFolders.find((x) => x.path === p) ?? allFiles.find((x) => x.path === p) ?? null;
      },
    },
  } as unknown as App;
};

// Preview path convention (from pathService + generator outputExt values):
//   image (png/jpg/…) → self-reference (no preview file; source IS the preview)
//   video (mp4/…)     → twin/preview/{name}.gif
//   pdf               → twin/preview/{name}.png
//   audio (mp3/…)     → twin/preview/{name}.svg
// findAttachmentsWithoutPreview skips self-reference generators entirely.

describe("vault initial state — combined orphan + missing-preview scans", () => {
  it("fully processed vault: both scans return empty", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    // photo.png is self-reference (no preview file); clip.mp4 has its GIF preview.
    const existing = new Set([
      "attachments/twin/photo.png.md",
      "attachments/twin/clip.mp4.md",
      "attachments/twin/preview/clip.mp4.gif",
    ]);
    const app = buildApp("attachments", tree, existing);
    expect(findOrphanAttachments(app)).toEqual([]);
    expect(findAttachmentsWithoutPreview(app)).toEqual([]);
  });

  it("fresh install — no twins, no previews: orphan scan returns both, preview scan returns only non-self-reference", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app).sort()).toEqual([
      "attachments/clip.mp4",
      "attachments/photo.png",
    ]);
    // photo.png is self-reference; only clip.mp4 needs a generated preview.
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/clip.mp4"]);
  });

  it("twins present but previews missing: orphan scan empty, preview scan returns only non-self-reference", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    const existing = new Set([
      "attachments/twin/photo.png.md",
      "attachments/twin/clip.mp4.md",
    ]);
    const app = buildApp("attachments", tree, existing);
    expect(findOrphanAttachments(app)).toEqual([]);
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/clip.mp4"]);
  });

  it("partial processing: one file fully done, one untouched", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    // photo.png is fully processed (twin only — self-reference, no preview file);
    // clip.mp4 has neither twin nor preview.
    const existing = new Set(["attachments/twin/photo.png.md"]);
    const app = buildApp("attachments", tree, existing);
    expect(findOrphanAttachments(app)).toEqual(["attachments/clip.mp4"]);
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/clip.mp4"]);
  });

  it("unsupported file types only: orphan scan returns them, preview scan returns none", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/data.txt"),
      mkFile("attachments/archive.bin"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app).sort()).toEqual([
      "attachments/archive.bin",
      "attachments/data.txt",
    ]);
    expect(findAttachmentsWithoutPreview(app)).toEqual([]);
  });

  it("mixed types (image + pdf + unsupported): preview scan excludes unsupported and self-reference", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/report.pdf"),
      mkFile("attachments/notes.txt"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app).sort()).toEqual([
      "attachments/notes.txt",
      "attachments/photo.png",
      "attachments/report.pdf",
    ]);
    // photo.png is self-reference (excluded); notes.txt is unsupported (excluded);
    // only report.pdf needs a generated preview.
    expect(findAttachmentsWithoutPreview(app)).toEqual(["attachments/report.pdf"]);
  });

  it("markdown files in attachment folder are excluded from both scans", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/note.md"),
      mkFile("attachments/readme.md"),
    ]);
    const app = buildApp("attachments", tree);
    expect(findOrphanAttachments(app)).toEqual([]);
    expect(findAttachmentsWithoutPreview(app)).toEqual([]);
  });

  it("tombstoned paths are excluded from both scans", () => {
    const tree = mkFolder("attachments", [
      mkFile("attachments/photo.png"),
      mkFile("attachments/clip.mp4"),
    ]);
    const app = buildApp("attachments", tree);
    const isTombstoned = (p: string) => p === "attachments/photo.png";
    expect(findOrphanAttachments(app, isTombstoned)).toEqual(["attachments/clip.mp4"]);
    expect(findAttachmentsWithoutPreview(app, isTombstoned)).toEqual(["attachments/clip.mp4"]);
  });
});
