import en from "./locales/en.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import zh from "./locales/zh.json";

const SUPPORTED = ["en", "es", "de", "fr", "zh"] as const;
export type Locale = (typeof SUPPORTED)[number];

const catalogs: Record<Locale, Record<string, string>> = { en, es, de, fr, zh };

export function getLocale(): Locale {
  const raw =
    (typeof window !== "undefined" && window.localStorage?.getItem("language")) || "en";
  const short = String(raw).toLowerCase().split("-")[0];
  return (SUPPORTED as readonly string[]).includes(short) ? (short as Locale) : "en";
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const cat = catalogs[getLocale()] ?? catalogs.en;
  const template = cat[key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
