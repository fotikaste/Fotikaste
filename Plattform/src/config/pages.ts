import type { PageEntry } from "./site";

/**
 * Seitenregister: Grundlage für Sitemap und Tests.
 * indexable=false solange die Seite nur Platzhalter enthält (gegen «dünne Inhalte» und Keyword-Spam).
 */
export const pages: PageEntry[] = [
  { path: "/", title: "Startseite", indexable: true },
  { path: "/fotobox", title: "Unsere Fotobox", indexable: true },
  { path: "/preise", title: "Angebote und Preise", indexable: true },
  { path: "/faq", title: "Häufige Fragen", indexable: true },
  { path: "/verfuegbarkeit", title: "Verfügbarkeit", indexable: false, private: true },
  { path: "/galerie", title: "Galerie", indexable: false },
  { path: "/kontakt", title: "Kontakt", indexable: false },
  { path: "/ueber-uns", title: "Über uns", indexable: false },
  { path: "/hochzeit", title: "Fotobox für die Hochzeit", indexable: false },
  { path: "/geburtstag", title: "Fotobox für den Geburtstag", indexable: false },
  { path: "/firmenanlass", title: "Fotobox für Firmenanlässe", indexable: false },
  { path: "/fotobox-thurgau", title: "Fotobox mieten im Thurgau", indexable: false },
  { path: "/fotobox-ostschweiz", title: "Fotobox mieten in der Ostschweiz", indexable: false },
  { path: "/fotobox-zuerich", title: "Fotobox mieten in Zürich", indexable: false },
  { path: "/impressum", title: "Impressum", indexable: false },
  { path: "/datenschutz", title: "Datenschutz", indexable: false },
  { path: "/agb", title: "AGB", indexable: false },
  { path: "/buchen", title: "Fotobox buchen", indexable: false, private: true },
  { path: "/konto", title: "Kundenkonto", indexable: false, private: true },
  { path: "/konto/anmelden", title: "Anmelden", indexable: false, private: true },
];

export function pageByPath(path: string): PageEntry {
  const p = pages.find((x) => x.path === path);
  if (!p) throw new Error(`Seite fehlt im Register: ${path}`);
  return p;
}
