import { describe, it, expect } from "vitest";
import en from "../../src/i18n/locales/en.json";
import es from "../../src/i18n/locales/es.json";
import de from "../../src/i18n/locales/de.json";
import fr from "../../src/i18n/locales/fr.json";
import zh from "../../src/i18n/locales/zh.json";
import { t } from "../../src/i18n";

const enCat = en as Record<string, string>;
const ENGLISH_KEYS = Object.keys(enCat);

const NON_EN: Array<[string, Record<string, string>]> = [
  ["es", es as Record<string, string>],
  ["de", de as Record<string, string>],
  ["fr", fr as Record<string, string>],
  ["zh", zh as Record<string, string>],
];

const PLACEHOLDER_RE = /\{(\w+)\}/g;
const placeholders = (s: string): string[] =>
  [...s.matchAll(PLACEHOLDER_RE)].map((m) => m[1]).sort();

describe("i18n catalog completeness", () => {
  for (const [name, cat] of NON_EN) {
    it(`${name} has every key from en`, () => {
      const missing = ENGLISH_KEYS.filter((k) => !(k in cat));
      expect(missing).toEqual([]);
    });

    it(`${name} has no keys that aren't in en`, () => {
      const extra = Object.keys(cat).filter((k) => !ENGLISH_KEYS.includes(k));
      expect(extra).toEqual([]);
    });

    it(`${name} preserves the same {placeholder} variables per key`, () => {
      for (const k of ENGLISH_KEYS) {
        expect(placeholders(cat[k] ?? ""), `${name}.${k}`).toEqual(
          placeholders(enCat[k]),
        );
      }
    });

    it(`${name} has non-empty translations`, () => {
      const empty = ENGLISH_KEYS.filter((k) => !cat[k] || cat[k].trim() === "");
      expect(empty).toEqual([]);
    });

    it(`${name} translations differ from en (sanity)`, () => {
      // At least the longer settings description should differ; this catches
      // accidental copy-paste of the English catalog.
      expect(cat["settings.attachmentFolder.desc"]).not.toBe(
        enCat["settings.attachmentFolder.desc"],
      );
    });
  }
});

describe("t()", () => {
  it("returns the key unchanged when the lookup misses across all catalogs", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates {placeholder} variables", () => {
    // Use a known key with a count placeholder; default locale is en (no localStorage in node).
    expect(t("notices.twin.created", { count: 3 })).toContain("3");
  });

  it("substitutes empty string for missing placeholder values", () => {
    expect(t("notices.twin.created")).not.toContain("{count}");
  });
});
