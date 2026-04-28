import esbuild from "esbuild";
import process from "process";
import fs from "node:fs";
import path from "node:path";
import builtins from "builtin-modules";

const banner = `/* Bundled by esbuild — do not edit. */\n`;

const prod = process.argv[2] === "production";

const pdfWorkerSrc = fs.readFileSync(
  path.resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  "utf8",
);

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  platform: "browser",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  define: {
    __PDFJS_WORKER_SRC__: JSON.stringify(pdfWorkerSrc),
  },
});

if (prod) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
