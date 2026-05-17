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

// True when Templater actually wrote a body into the twin. A real render runs
// through Templater's `vault.process`, merging frontmatter and appending a
// non-empty body, so the file strictly grows past the 3-key base stub. When
// Templater's `read_and_parse_template` transiently fails it early-returns
// WITHOUT modifying the file (and without throwing) — `after` then still equals
// the stub and this returns false so the caller never mistakes a no-op for a
// successful render.
export function renderApplied(before: string, after: string): boolean {
  return after.length > before.length && after !== before;
}

const RENDER_RETRY_DELAY_MS = 50;
const MAX_RENDER_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export function buildRenderHook(
  app: App,
  templatePath: string,
): (twinPath: string) => Promise<string | null> {
  // Serialise all Templater calls: write_template_to_file touches Obsidian's
  // active-file state internally, so concurrent invocations cause tp.file.title
  // to resolve to the wrong file for all but the last caller. One call at a time
  // prevents cross-contamination without slowing down non-Templater work.
  let serial = Promise.resolve();

  return (twinPath: string): Promise<string | null> => {
    const turn = serial.then(async (): Promise<string | null> => {
      try {
        const plugin = getPlugin(app);
        if (!plugin) return null;

        const templateFile = app.vault.getAbstractFileByPath(templatePath) as TFile | null;
        if (!templateFile) return null;

        let twinFile = app.vault.getAbstractFileByPath(twinPath) as TFile | null;
        if (!twinFile) {
          // Bug-004: a just-created file is occasionally not yet visible to
          // getAbstractFileByPath until the next tick. Mirror the retry in
          // obsidianVault.formatLink so a transiently-invisible twin doesn't
          // get silently skipped.
          await sleep(RENDER_RETRY_DELAY_MS);
          twinFile = app.vault.getAbstractFileByPath(twinPath) as TFile | null;
        }
        if (!twinFile) return null;

        const before = await app.vault.read(twinFile);
        for (let attempt = 0; attempt < MAX_RENDER_ATTEMPTS; attempt++) {
          await plugin.templater.write_template_to_file(templateFile, twinFile);
          const after = await app.vault.read(twinFile);
          if (renderApplied(before, after)) return after;
          await sleep(RENDER_RETRY_DELAY_MS);
        }
        // Body never landed after retries. Return null (NOT the stub) so the
        // caller treats this as a failed render, not a silent success.
        return null;
      } catch {
        return null;
      }
    });
    // Advance the serial chain; swallow errors so one failure doesn't block the rest.
    serial = turn.then(() => {}, () => {});
    return turn;
  };
}
