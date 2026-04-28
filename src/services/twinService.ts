import { twinPathsFor } from "./pathService";

export interface TwinVault {
  exists(path: string): boolean;
  createFolder(path: string): Promise<void>;
  create(path: string, data: string): Promise<void>;
  createBinary(path: string, data: ArrayBuffer): Promise<void>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  modify(path: string, data: string): Promise<void>;
}

export type EnsureTwinResult = "created" | "exists";

export function extensionOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function buildTwinContent(attachmentPath: string, extension: string): string {
  return [
    "---",
    `attachment-ref: "[[${attachmentPath}]]"`,
    `attachment-type: ${extension}`,
    "attachment-prev:",
    "---",
    "",
  ].join("\n");
}

const PREV_LINE_RE = /^attachment-prev:.*$/m;

export function setTwinPreview(content: string, previewPath: string): string {
  const value = `attachment-prev: "[[${previewPath}]]"`;
  if (PREV_LINE_RE.test(content)) {
    return content.replace(PREV_LINE_RE, value);
  }
  let seen = 0;
  return content.replace(/^---\s*$/gm, (match) => {
    seen += 1;
    return seen === 2 ? `${value}\n${match}` : match;
  });
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
  await vault.create(paths.twinFile, buildTwinContent(attachmentPath, ext));
  return "created";
}
