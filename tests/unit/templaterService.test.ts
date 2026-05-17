import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTemplaterEnabled,
  getTemplaterFolder,
  listTemplates,
  buildRenderHook,
  renderApplied,
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

describe("renderApplied", () => {
  it("is false when content is unchanged (Templater no-op)", () => {
    expect(renderApplied("---\nstub\n---\n", "---\nstub\n---\n")).toBe(false);
  });
  it("is true when the file grew (body appended)", () => {
    expect(renderApplied("---\nstub\n---\n", "---\nstub\n---\n# Body\n")).toBe(true);
  });
  it("is false when the file shrank", () => {
    expect(renderApplied("---\nstub\n---\nlong", "---\n")).toBe(false);
  });
});

describe("buildRenderHook", () => {
  const STUB = "---\nattachment-ref: x\n---\n";
  const TWIN = "attachments/attachments-twins/photo.png.md";
  const TEMPLATE = "templates/Twin.md";

  // Node test env has no `window`; the hook's backoff uses window.setTimeout
  // (same pattern as obsidianVault.formatLink). Resolve it immediately so the
  // retry loop doesn't actually wait 50ms per attempt.
  let realWindow: unknown;
  beforeEach(() => {
    realWindow = (globalThis as unknown as { window?: unknown }).window;
    (globalThis as unknown as { window: { setTimeout: typeof setTimeout } }).window = {
      setTimeout: ((cb: () => void) => {
        cb();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
    };
  });
  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = realWindow;
  });

  // Stateful fake: `write` mutates the in-memory twin content so before/after
  // diffs are meaningful (the real failure mode is a no-op write read back as
  // a false success). `twinVisibleAfter` simulates the Bug-004 cache lag.
  function makeStatefulApp(opts: {
    twinInitial: string;
    write: (files: Map<string, string>) => void;
    twinVisibleAfter?: number;
  }) {
    const files = new Map<string, string>([[TWIN, opts.twinInitial]]);
    const templateFile = { path: TEMPLATE, basename: "Twin" } as TFile;
    const twinFile = { path: TWIN, basename: "photo.png" } as TFile;
    let twinLookups = 0;
    const writeFn = vi.fn(async () => {
      opts.write(files);
    });
    const app = {
      plugins: {
        getPlugin: () => ({
          settings: { templates_folder: "templates" },
          templater: { write_template_to_file: writeFn },
        }),
      },
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) => {
          if (p === TEMPLATE) return templateFile;
          if (p === TWIN) {
            twinLookups += 1;
            if (opts.twinVisibleAfter && twinLookups < opts.twinVisibleAfter) {
              return null;
            }
            return twinFile;
          }
          return null;
        },
        read: async (f: TFile) => files.get(f.path) ?? "",
      },
    } as unknown as App;
    return { app, files, writeFn, templateFile, twinFile };
  }

  it("returns the rendered content when the body is applied", async () => {
    const { app, writeFn } = makeStatefulApp({
      twinInitial: STUB,
      write: (files) => files.set(TWIN, STUB + "# Rendered body\n"),
    });
    const result = await buildRenderHook(app, TEMPLATE)(TWIN);
    expect(result).toBe(STUB + "# Rendered body\n");
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it("retries when the first write no-ops, then succeeds", async () => {
    let calls = 0;
    const { app, writeFn } = makeStatefulApp({
      twinInitial: STUB,
      write: (files) => {
        calls += 1;
        if (calls >= 2) files.set(TWIN, STUB + "# Body\n");
      },
    });
    const result = await buildRenderHook(app, TEMPLATE)(TWIN);
    expect(result).toBe(STUB + "# Body\n");
    expect(writeFn).toHaveBeenCalledTimes(2);
  });

  it("returns null (not the stub) when the body is never applied", async () => {
    const { app, files, writeFn } = makeStatefulApp({
      twinInitial: STUB,
      write: () => {
        /* Templater no-op: leaves the file as the base stub */
      },
    });
    const result = await buildRenderHook(app, TEMPLATE)(TWIN);
    expect(result).toBeNull();
    expect(writeFn).toHaveBeenCalledTimes(3);
    expect(files.get(TWIN)).toBe(STUB);
  });

  it("retries the twin lookup when it is briefly invisible (Bug-004)", async () => {
    const { app, writeFn } = makeStatefulApp({
      twinInitial: STUB,
      write: (files) => files.set(TWIN, STUB + "# Body\n"),
      twinVisibleAfter: 2,
    });
    const result = await buildRenderHook(app, TEMPLATE)(TWIN);
    expect(result).toBe(STUB + "# Body\n");
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it("returns null and never writes when the twin never resolves", async () => {
    const { app, writeFn } = makeStatefulApp({
      twinInitial: STUB,
      write: (files) => files.set(TWIN, STUB + "# Body\n"),
      twinVisibleAfter: 99,
    });
    const result = await buildRenderHook(app, TEMPLATE)(TWIN);
    expect(result).toBeNull();
    expect(writeFn).not.toHaveBeenCalled();
  });

  it("returns null when Templater is not enabled", async () => {
    const app = makeApp({ installed: false });
    const hook = buildRenderHook(app, TEMPLATE);
    expect(await hook(TWIN)).toBeNull();
  });

  it("returns null when the template file is not found in vault", async () => {
    const twinFile = makeTFile(TWIN);
    const app = makeApp({ fileByPath: { [TWIN]: twinFile } });
    const hook = buildRenderHook(app, "templates/Missing.md");
    expect(await hook(twinFile.path)).toBeNull();
  });

  it("returns null when write_template_to_file throws", async () => {
    const templateFile = makeTFile(TEMPLATE);
    const twinFile = makeTFile(TWIN);
    const app = {
      plugins: {
        getPlugin: () => ({
          settings: { templates_folder: "templates" },
          templater: {
            write_template_to_file: vi.fn().mockRejectedValue(new Error("boom")),
          },
        }),
      },
      vault: {
        getMarkdownFiles: () => [],
        getAbstractFileByPath: (p: string) =>
          p === templateFile.path ? templateFile : p === twinFile.path ? twinFile : null,
        read: vi.fn().mockResolvedValue(""),
      },
    } as unknown as App;

    const hook = buildRenderHook(app, templateFile.path);
    expect(await hook(twinFile.path)).toBeNull();
  });
});
