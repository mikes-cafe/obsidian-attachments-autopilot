import { extensionOf, setTwinPreview, type TwinVault } from "./twinService";
import { twinPathsFor } from "./pathService";
import { defaultGenerators, type PreviewGenerator } from "./previews";

export type EnsurePreviewResult = "created" | "exists" | "skipped" | "failed";

export async function ensurePreview(
  vault: TwinVault,
  attachmentPath: string,
  attachmentFolder: string,
  generators: Record<string, PreviewGenerator> = defaultGenerators,
): Promise<EnsurePreviewResult> {
  const ext = extensionOf(attachmentPath);
  const gen = generators[ext];
  if (!gen) return "skipped";

  const paths = twinPathsFor(attachmentPath, attachmentFolder);
  const previewPath = paths.previewFile(gen.outputExt);

  if (vault.exists(previewPath)) {
    await syncTwinPreview(vault, paths.twinFile, previewPath);
    return "exists";
  }

  let bytes: ArrayBuffer;
  try {
    const input = await vault.readBinary(attachmentPath);
    bytes = await gen.generate(input, attachmentPath);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[attachments-autopilot] preview generation failed", attachmentPath, err);
    return "failed";
  }

  if (!vault.exists(paths.previewFolder)) {
    await vault.createFolder(paths.previewFolder);
  }
  await vault.createBinary(previewPath, bytes);
  await syncTwinPreview(vault, paths.twinFile, previewPath);
  return "created";
}

async function syncTwinPreview(
  vault: TwinVault,
  twinFile: string,
  previewPath: string,
): Promise<void> {
  if (!vault.exists(twinFile)) return;
  const content = await vault.read(twinFile);
  const previewLink = vault.formatLink(previewPath, twinFile);
  const updated = setTwinPreview(content, previewLink);
  if (updated !== content) {
    await vault.modify(twinFile, updated);
  }
}
