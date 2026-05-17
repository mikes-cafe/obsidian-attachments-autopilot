import { describe, it, expect } from "vitest";
import { shouldTwin } from "../../src/events/vaultWatcher";
import type { TAbstractFile, TFile, TFolder } from "obsidian";
import { twinFile, previewFile } from "./testHelpers";

const file = (path: string): TFile => {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1) : "";
  const basename = dot > 0 ? name.slice(0, dot) : name;
  return { path, name, basename, extension } as TFile;
};

const folder = (path: string): TFolder =>
  ({ path, name: path.split("/").pop() ?? "", children: [] }) as unknown as TFolder;

describe("shouldTwin", () => {
  it("accepts non-md files inside the attachment folder", () => {
    expect(shouldTwin(file("attachments/photo.png"), "attachments")).toBe(true);
    expect(shouldTwin(file("attachments/sub/clip.mp4"), "attachments")).toBe(true);
  });

  it("rejects markdown files (case-insensitive)", () => {
    expect(shouldTwin(file("attachments/note.md"), "attachments")).toBe(false);
    expect(shouldTwin(file("attachments/note.MD"), "attachments")).toBe(false);
  });

  it("rejects files inside the twin folder (and its preview subfolder)", () => {
    expect(shouldTwin(file(twinFile("attachments", "photo.md")), "attachments")).toBe(false);
    expect(shouldTwin(file(previewFile("attachments", "photo.png")), "attachments")).toBe(false);
  });

  it("rejects files outside the configured attachment folder", () => {
    expect(shouldTwin(file("notes/photo.png"), "attachments")).toBe(false);
  });

  it("rejects folders", () => {
    expect(shouldTwin(folder("attachments/sub") as unknown as TAbstractFile, "attachments")).toBe(
      false,
    );
  });

  it("with vault-root attachment folder, accepts non-md files outside the twin folder", () => {
    expect(shouldTwin(file("photo.png"), "")).toBe(true);
    expect(shouldTwin(file(twinFile("", "photo.md")), "")).toBe(false);
  });
});
