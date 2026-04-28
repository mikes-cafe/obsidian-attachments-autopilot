import type { PreviewGenerator } from "./types";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" fill="#1f2937"/>
  <g fill="none" stroke="#60a5fa" stroke-width="6" stroke-linecap="round">
    <path d="M40 128 q24 -64 48 0 t48 0 t48 0 t48 0"/>
    <path d="M40 128 q24 64 48 0 t48 0 t48 0 t48 0"/>
  </g>
  <text x="128" y="220" text-anchor="middle" fill="#e5e7eb" font-family="sans-serif" font-size="22" font-weight="600">AUDIO</text>
</svg>`;

export const audioPreview: PreviewGenerator = {
  exts: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"],
  outputExt: "svg",
  async generate() {
    return new TextEncoder().encode(SVG).buffer as ArrayBuffer;
  },
};
