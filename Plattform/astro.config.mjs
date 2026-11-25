// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { brand } from "./src/config/brand.ts";

// Phase 1: rein statische Ausgabe (kein Worker nötig, 0 Worker-Aufrufe für öffentliche Seiten).
// Ab Phase 2 kommt der Cloudflare-Adapter für Buchung, Portal, Admin und Geräte-API dazu.
export default defineConfig({
  site: brand.siteUrl,
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  i18n: {
    locales: ["de-CH"],
    defaultLocale: "de-CH",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
