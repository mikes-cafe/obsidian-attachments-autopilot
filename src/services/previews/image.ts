import type { PreviewGenerator } from "./types";

const MAX_DIM = 256;

export const imagePreview: PreviewGenerator = {
  exts: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
  outputExt: "png",

  async generate(input) {
    const blob = new Blob([input]);
    const bitmap = await createImageBitmap(blob);
    try {
      const ratio = Math.min(MAX_DIM / bitmap.width, MAX_DIM / bitmap.height, 1);
      const w = Math.max(1, Math.round(bitmap.width * ratio));
      const h = Math.max(1, Math.round(bitmap.height * ratio));
      const canvas = makeCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");
      ctx.drawImage(bitmap, 0, 0, w, h);
      return await canvasToArrayBuffer(canvas, "image/png");
    } finally {
      bitmap.close?.();
    }
  },
};

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToArrayBuffer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
): Promise<ArrayBuffer> {
  if ("convertToBlob" in canvas) {
    const blob = await canvas.convertToBlob({ type });
    return await blob.arrayBuffer();
  }
  const blob: Blob = await new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      type,
    );
  });
  return await blob.arrayBuffer();
}
