import type { TAbstractFile, TFile } from "obsidian";
import { isInsideAttachmentFolder, isInsideTwinFolder } from "../services/pathService";

export function shouldTwin(file: TAbstractFile, attachmentFolder: string): boolean {
  if (!isFile(file)) return false;
  if (file.extension.toLowerCase() === "md") return false;
  if (isInsideTwinFolder(file.path, attachmentFolder)) return false;
  if (!isInsideAttachmentFolder(file.path, attachmentFolder)) return false;
  return true;
}

function isFile(file: TAbstractFile): file is TFile {
  return typeof (file as TFile).extension === "string";
}
