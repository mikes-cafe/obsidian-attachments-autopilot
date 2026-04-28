// Minimal runtime mock of the Obsidian module for Vitest.
// TypeScript still resolves `import type` from the real `obsidian` package in node_modules.

export class Plugin {
  app: unknown;
  manifest: unknown;
  constructor(app: unknown, manifest: unknown) {
    this.app = app;
    this.manifest = manifest;
  }
  onload(): void {}
  onunload(): void {}
  addSettingTab(_tab: unknown): void {}
  addCommand(_cmd: unknown): void {}
  registerEvent(_evt: unknown): void {}
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: { empty: () => void; createEl: () => unknown };
  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = {
      empty: () => undefined,
      createEl: () => ({ setText: () => undefined }),
    };
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  constructor(_containerEl: unknown) {}
  setName(_n: string): this {
    return this;
  }
  setDesc(_d: string): this {
    return this;
  }
  addText(cb: (t: { setValue: (v: string) => { setDisabled: (d: boolean) => void } }) => void): this {
    cb({ setValue: () => ({ setDisabled: () => undefined }) });
    return this;
  }
}

export class Notice {
  constructor(_msg: string) {}
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export class TAbstractFile {
  path = "";
  name = "";
}
export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export interface App {
  vault: {
    getConfig?: (k: string) => unknown;
    on: (name: string, cb: (...args: unknown[]) => unknown) => unknown;
    adapter: { exists: (p: string) => Promise<boolean> };
    getFiles: () => TFile[];
    getAbstractFileByPath: (p: string) => TAbstractFile | null;
  };
}
