import type { PreviewGenerator } from "./types";
import { imagePreview } from "./image";
import { videoPreview } from "./video";
import { audioPreview } from "./audio";
import { pdfPreview } from "./pdf";

const ALL: readonly PreviewGenerator[] = [imagePreview, videoPreview, audioPreview, pdfPreview];

export const defaultGenerators: Record<string, PreviewGenerator> = (() => {
  const out: Record<string, PreviewGenerator> = {};
  for (const gen of ALL) {
    for (const ext of gen.exts) out[ext] = gen;
  }
  return out;
})();

export type { PreviewGenerator } from "./types";
