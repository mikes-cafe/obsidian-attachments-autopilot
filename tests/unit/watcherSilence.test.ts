import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Pinned contract: the vault watcher (create / rename / delete handlers in main.ts)
 * must NOT emit user-facing `Notice` calls. Notices belong to explicit user
 * commands; the watcher path stays silent so a 50- or 200-file bulk import
 * doesn't spam the UI. Verified statically because spinning up a real Plugin
 * instance to spy on the Notice constructor would be substantially more setup.
 */
describe("vault watcher silence", () => {
  const main = readFileSync(resolve(__dirname, "../../src/main.ts"), "utf8");

  const watcherEvents = ["create", "rename", "delete"] as const;

  for (const event of watcherEvents) {
    it(`vault.on("${event}") handler does not construct a Notice`, () => {
      // Locate `this.app.vault.on("<event>",` and capture the closure body
      // through to its matching closing brace. Naive but deterministic for
      // arrow-function handlers we control.
      const start = main.indexOf(`this.app.vault.on("${event}"`);
      expect(start, `expected to find vault.on("${event}") handler in main.ts`).toBeGreaterThan(-1);

      // Find the registerEvent call's outer ); — the handler closes inside.
      // Scan forward from `start`, count brace depth, stop on `})` after the
      // first `=> {`.
      const fnStart = main.indexOf("=> {", start);
      expect(fnStart, `arrow-function body for ${event}`).toBeGreaterThan(-1);
      let depth = 1;
      let i = fnStart + "=> {".length;
      while (i < main.length && depth > 0) {
        const ch = main[i];
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
        i += 1;
      }
      const handlerBody = main.slice(fnStart, i);
      expect(handlerBody).not.toMatch(/new\s+Notice\s*\(/);
    });
  }
});
