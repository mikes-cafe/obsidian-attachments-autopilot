import type { PreviewGenerator } from "./types";

const MAX_DIM = 512;

let pdfjsLib: typeof import("pdfjs-dist") | null = null;

async function loadPdfjs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsLib) {
    const lib = await import("pdfjs-dist");
    const blob = new Blob([__PDFJS_WORKER_SRC__], { type: "text/javascript" });
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    pdfjsLib = lib;
  }
  return pdfjsLib;
}

export const pdfPreview: PreviewGenerator = {
  exts: ["pdf"],
  outputExt: "png",

  async generate(input) {
    const { getDocument } = await loadPdfjs();
    const doc = await getDocument({ data: new Uint8Array(input) }).promise;
    try {
      const page = await doc.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_DIM / baseViewport.width, MAX_DIM / baseViewport.height, 2);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
          "image/png",
        );
      });
      return await blob.arrayBuffer();
    } finally {
      await doc.destroy();
    }
  },
};
