import { describe, it, expect, vi } from "vitest";
import {
  isTemplaterEnabled,
  getTemplaterFolder,
  listTemplates,
  buildRenderHook,
} from "../../src/services/templaterService";
import type { App, TFile } from "obsidian";

// Minimal fake that matches the shape templaterService probes.
function makeApp(opts: {
  installed?: boolean;
  folder?: string;
  hasWriteFn?: boolean;
  files?: TFile[];
  fileByPath?: Record<string, TFile | null>;
} = {}): App {
  const {
    installed = true,
    folder = "templates",
    hasWriteFn = true,
    files = [],
    fileByPath = {},
  } = opts;

  const pluginInstance = installed
    ? {
        settings: { templates_folder: folder },
        templater: hasWriteFn
          ? { write_template_to_file: vi.fn().mockResolvedValue(undefined) }
          : {},
      }
    : null;

  return {
    plugins: {
      getPlugin: (id: string) => (id === "templater-obsidian" ? pluginInstance : null),
    },
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: (p: string) => fileByPath[p] ?? null,
      read: vi.fn().mockResolvedValue(""),
    },
  } as unknown as App;
}

function makeTFile(path: string): TFile {
  const parts = path.split("/");
  const basename = parts[parts.length - 1].replace(/\.md$/, "");
  return { path, basename } as TFile;
}

describe("isTemplaterEnabled", () => {
  it("returns true when plugin is installed and has expected shape", () => {
    expect(isTemplaterEnabled(makeApp())).toBe(true);
  });

  it("returns false when Templater is not installed", () => {
    expect(isTemplaterEnabled(makeApp({ installed: false }))).toBe(false);
  });

  it("returns false when write_template_to_file is missing", () => {
    expect(isTemplaterEnabled(makeApp({ hasWriteFn: false }))).toBe(false);
  });

  it("returns false when internalPlugins is completely absent", () => {
    expect(isTemplaterEnabled({} as App)).toBe(false);
  });
});

describe("getTemplaterFolder", () => {
  it("returns the configured folder", () => {
    expect(getTemplaterFolder(makeApp({ folder: "my-templates" }))).toBe("my-templates");
  });

  it("returns empty string when Templater not installed", () => {
    expect(getTemplaterFolder(makeApp({ installed: false }))).toBe("");
  });

  it("returns empty string when folder is empty", () => {
    expect(getTemplaterFolder(makeApp({ folder: "" }))).toBe("");
  });
});

describe("listTemplates", () => {
  it("returns .md files inside the Templater folder", () => {
    const files = [
      makeTFile("templates/Twin.md"),
      makeTFile("templates/Daily.md"),
      makeTFile("notes/unrelated.md"),
    ];
    const app = makeApp({ folder: "templates", files });
    const result = listTemplates(app);
    expect(result.map((f) => f.path)).toEqual(["templates/Twin.md", "templates/Daily.md"]);
  });

  it("returns empty array when Templater is disabled", () => {
    expect(listTemplates(makeApp({ installed: false }))).toEqual([]);
  });

  it("returns empty array when folder is not set", () => {
    expect(listTemplates(makeApp({ folder: "" }))).toEqual([]);
  });
});

describe("buildRenderHook", () => {
  it("calls write_template_to_file with the right files and returns content", async () => {
    const templateFile = makeTFile("templates/Twin.md");
    const twinFile = makeTFile("attachments/twin/photo.png.md");
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const readFn = vi.fn().mockResolvedValue("rendered content");

    const app = {
      plugins: {
        getPlugin: () => ({
          settings: { templates_folder: "templates" },
          templater: { write_template_to_file: writeFn },
        }),
      },
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) =>
          p === templateFile.path ? templateFile : p === twinFile.path ? twinFile : null,
        read: readFn,
      },
    } as unknown as App;

    const hook = buildRenderHook(app, templateFile.path);
    const result = await hook(twinFile.path);

    expect(writeFn).toHaveBeenCalledWith(templateFile, twinFile);
    expect(readFn).toHaveBeenCalledWith(twinFile);
    expect(result).toBe("rendered content");
  });

  it("returns null when Templater is not enabled", async () => {
    const app = makeApp({ installed: false });
    const hook = buildRenderHook(app, "templates/Twin.md");
    expect(await hook("attachments/twin/photo.png.md")).toBeNull();
  });

  it("returns null when the template file is not found in vault", async () => {
    const twinFile = makeTFile("attachments/twin/photo.png.md");
    const app = makeApp({
      fileByPath: { "attachments/twin/photo.png.md": twinFile },
    });
    const hook = buildRenderHook(app, "templates/Missing.md");
    expect(await hook(twinFile.path)).toBeNull();
  });

  it("returns null when write_template_to_file throws", async () => {
    const templateFile = makeTFile("templates/Twin.md");
    const twinFile = makeTFile("attachments/twin/photo.png.md");
    const app = {
      plugins: {
        getPlugin: () => ({
          settings: { templates_folder: "templates" },
          templater: { write_template_to_file: vi.fn().mockRejectedValue(new Error("boom")) },
        }),
      },
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) =>
          p === templateFile.path ? templateFile : p === twinFile.path ? twinFile : null,
        read: vi.fn(),
      },
    } as unknown as App;

    const hook = buildRenderHook(app, templateFile.path);
    expect(await hook(twinFile.path)).toBeNull();
  });
});
