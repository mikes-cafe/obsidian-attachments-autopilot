import type { PreviewGenerator } from "./types";

/**
 * For image attachments the source is already a viewable image — no separate
 * preview file is generated. The twin's `attachment-prev` points directly at
 * the source, saving disk space and keeping previews in sync with the original.
 */
export const imagePreview: PreviewGenerator = {
  exts: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
  outputExt: "",
  selfReference: true,
};
