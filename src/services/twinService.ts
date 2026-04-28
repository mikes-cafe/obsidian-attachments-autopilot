import { twinPathsFor } from "./pathService";

export interface TwinVault {
  exists(path: string): boolean;
  createFolder(path: string): Promise<void>;
  create(path: string, data: string): Promise<void>;
  createBinary(path: string, data: ArrayBuffer): Promise<void>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  modify(path: string, data: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  delete(path: string): Promise<void>;
  /**
   * Render a link to `targetPath` as it would appear in a markdown file at
   * `sourcePath`. Implementations should respect the user's `useMarkdownLinks`
   * and `newLinkFormat` settings (real Obsidian: delegate to
   * `app.fileManager.generateMarkdownLink`).
   *
   * Async because the production wrapper may need to retry briefly while
   * Obsidian's metadata cache catches up after a fresh `vault.on("create")`
   * — see Bug-004 in the v0.3.0 QA report.
   */
  formatLink(targetPath: string, sourcePath: string): Promise<string>;
}

export type EnsureTwinResult = "created" | "exists";

export function extensionOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

// YAML-quote a frontmatter string value: wrap in double quotes and escape
// embedded backslashes and double quotes. The link strings we receive from
// the formatter (e.g. `[[path]]` or `[name](path)`) frequently include
// brackets and parens which YAML treats as flow indicators when unquoted.
const yamlQuote = (s: string): string =>
  `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function buildTwinContent(refLink: string, extension: string): string {
  return [
    "---",
    `attachment-ref: ${yamlQuote(refLink)}`,
    `attachment-type: ${extension}`,
    "attachment-prev:",
    "---",
    "",
  ].join("\n");
}

const PREV_LINE_RE = /^attachment-prev:.*$/m;
const REF_LINE_RE = /^attachment-ref:.*$/m;

const insertBeforeClosingFence = (content: string, line: string): string => {
  let seen = 0;
  return content.replace(/^---\s*$/gm, (match) => {
    seen += 1;
    return seen === 2 ? `${line}\n${match}` : match;
  });
};

export function setTwinPreview(content: string, previewLink: string): string {
  const value = `attachment-prev: ${yamlQuote(previewLink)}`;
  if (PREV_LINE_RE.test(content)) {
    return content.replace(PREV_LINE_RE, value);
  }
  return insertBeforeClosingFence(content, value);
}

export function setTwinRef(content: string, refLink: string): string {
  const value = `attachment-ref: ${yamlQuote(refLink)}`;
  if (REF_LINE_RE.test(content)) {
    return content.replace(REF_LINE_RE, value);
  }
  return insertBeforeClosingFence(content, value);
}

export async function ensureTwin(
  vault: TwinVault,
  attachmentPath: string,
  attachmentFolder: string,
): Promise<EnsureTwinResult> {
  const paths = twinPathsFor(attachmentPath, attachmentFolder);

  if (vault.exists(paths.twinFile)) return "exists";

  if (!vault.exists(paths.twinFolder)) {
    await vault.createFolder(paths.twinFolder);
  }

  const ext = extensionOf(attachmentPath);
  const refLink = await vault.formatLink(attachmentPath, paths.twinFile);
  await vault.create(paths.twinFile, buildTwinContent(refLink, ext));
  return "created";
}
