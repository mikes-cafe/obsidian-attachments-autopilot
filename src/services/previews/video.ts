import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { PreviewGenerator } from "./types";

const MAX_DIM = 256;
const FRAME_COUNT = 10;
const FRAME_DELAY_MS = 100;
const SAMPLE_DURATION_S = 3;

export const videoPreview: PreviewGenerator = {
  exts: ["mp4", "mov", "webm", "m4v", "ogv"],
  outputExt: "gif",

  async generate(input) {
    const blob = new Blob([input]);
    const url = URL.createObjectURL(blob);
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = url;
      await waitFor(video, "loadedmetadata");

      const ratio = Math.min(MAX_DIM / video.videoWidth, MAX_DIM / video.videoHeight, 1);
      const w = Math.max(1, Math.round(video.videoWidth * ratio));
      const h = Math.max(1, Math.round(video.videoHeight * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2D canvas context unavailable");

      const totalDuration = Math.min(SAMPLE_DURATION_S, isFinite(video.duration) ? video.duration : SAMPLE_DURATION_S);
      const encoder = GIFEncoder();

      for (let i = 0; i < FRAME_COUNT; i++) {
        const t = (i / FRAME_COUNT) * totalDuration;
        await seekTo(video, t);
        ctx.drawImage(video, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h).data;
        const palette = quantize(frame, 256);
        const indexed = applyPalette(frame, palette);
        encoder.writeFrame(indexed, w, h, { palette, delay: FRAME_DELAY_MS });
      }
      encoder.finish();
      return encoder.bytes().buffer as ArrayBuffer;
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};

function waitFor(target: HTMLVideoElement, event: "loadedmetadata"): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const err = () => { cleanup(); reject(new Error(`Video event ${event} failed`)); };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", err);
    };
    target.addEventListener(event, ok);
    target.addEventListener("error", err);
  });
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const handler = () => {
      video.removeEventListener("seeked", handler);
      resolve();
    };
    video.addEventListener("seeked", handler);
    video.currentTime = t;
  });
}
