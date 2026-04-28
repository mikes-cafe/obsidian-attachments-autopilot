import type { App, TFile } from "obsidian";

interface TemplaterPlugin {
  settings: { templates_folder: string };
  templater: {
    write_template_to_file(templateFile: TFile, targetFile: TFile): Promise<void>;
  };
}

function getPlugin(app: App): TemplaterPlugin | null {
  const p = (app as unknown as {
    plugins?: { getPlugin?: (id: string) => unknown };
  }).plugins?.getPlugin?.("templater-obsidian");
  if (!p) return null;
  const tp = p as Partial<TemplaterPlugin>;
  if (typeof tp.settings?.templates_folder !== "string") return null;
  if (typeof tp.templater?.write_template_to_file !== "function") return null;
  return tp as TemplaterPlugin;
}

export function isTemplaterEnabled(app: App): boolean {
  return getPlugin(app) !== null;
}

export function getTemplaterFolder(app: App): string {
  return getPlugin(app)?.settings.templates_folder ?? "";
}

export function listTemplates(app: App): TFile[] {
  const folder = getTemplaterFolder(app);
  if (!folder) return [];
  return app.vault.getMarkdownFiles().filter((f) =>
    f.path === folder || f.path.startsWith(`${folder}/`),
  );
}

export function buildRenderHook(
  app: App,
  templatePath: string,
): (twinPath: string) => Promise<string | null> {
  return async (twinPath: string): Promise<string | null> => {
    try {
      const plugin = getPlugin(app);
      if (!plugin) return null;

      const templateFile = app.vault.getAbstractFileByPath(templatePath) as TFile | null;
      if (!templateFile) return null;

      const twinFile = app.vault.getAbstractFileByPath(twinPath) as TFile | null;
      if (!twinFile) return null;

      await plugin.templater.write_template_to_file(templateFile, twinFile);
      return await app.vault.read(twinFile);
    } catch {
      return null;
    }
  };
}
