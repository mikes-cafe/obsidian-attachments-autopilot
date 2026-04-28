import type { App } from "obsidian";
import { resolveAttachmentFolder, sanitizeBasename } from "../services/pathService";

export interface DeviceFile {
  readonly name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ImportResult {
  imported: string[];
  failed: string[];
}

const composePath = (folder: string, name: string): string =>
  folder === "" ? name : `${folder}/${name}`;

/**
 * Filenames are NFC-normalized so on-disk NFD names (macOS APFS for unicode
 * like ñ) collide correctly with the JS-level NFC string the user picked.
 */
const normalize = (s: string): string => s.normalize("NFC");

export function uniqueAttachmentPath(
  app: App,
  attachmentFolder: string,
  rawName: string,
): string {
  const safe = normalize(sanitizeBasename(rawName));
  if (app.vault.getAbstractFileByPath(composePath(attachmentFolder, safe)) === null) {
    return composePath(attachmentFolder, safe);
  }

  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";

  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (app.vault.getAbstractFileByPath(composePath(attachmentFolder, candidate)) === null) {
      return composePath(attachmentFolder, candidate);
    }
  }
  throw new Error(`Could not find unique name for ${rawName}`);
}

export async function importFiles(
  app: App,
  attachmentFolder: string,
  files: DeviceFile[],
): Promise<ImportResult> {
  const imported: string[] = [];
  const failed: string[] = [];

  if (
    attachmentFolder !== "" &&
    app.vault.getAbstractFileByPath(attachmentFolder) === null
  ) {
    try {
      await app.vault.createFolder(attachmentFolder);
    } catch {
      // ignore: folder may have been created concurrently
    }
  }

  for (const file of files) {
    try {
      const target = uniqueAttachmentPath(app, attachmentFolder, file.name);
      const buffer = await file.arrayBuffer();
      await app.vault.createBinary(target, buffer);
      imported.push(target);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[attachments-autopilot] import failed", file.name, err);
      failed.push(file.name);
    }
  }

  return { imported, failed };
}

// How long to wait after focus returns before assuming the user cancelled.
// Gives the `change` event time to win the race when a file was actually picked.
const CANCEL_FOCUS_GRACE_MS = 500;

export function pickFilesFromDevice(): Promise<DeviceFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";

    let settled = false;
    const finish = (list: DeviceFile[]): void => {
      if (settled) return;
      settled = true;
      input.remove();
      window.removeEventListener("focus", onFocus);
      resolve(list);
    };

    // Fallback: when focus returns to the window after the picker closes
    // and `change` hasn't fired (Esc or Cancel button), treat as cancellation.
    // Obsidian's Electron build doesn't reliably fire the `cancel` event.
    const onFocus = (): void => {
      setTimeout(() => {
        if (!settled) finish([]);
      }, CANCEL_FOCUS_GRACE_MS);
    };

    input.addEventListener(
      "change",
      () => finish(input.files ? (Array.from(input.files) as unknown as DeviceFile[]) : []),
      { once: true },
    );
    input.addEventListener("cancel", () => finish([]), { once: true });
    window.addEventListener("focus", onFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

export async function runImportFromDevice(app: App): Promise<ImportResult> {
  const folder = resolveAttachmentFolder(app);
  const files = await pickFilesFromDevice();
  if (files.length === 0) return { imported: [], failed: [] };
  return importFiles(app, folder, files);
}
