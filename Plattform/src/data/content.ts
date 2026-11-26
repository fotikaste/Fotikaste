
/** Inhalte der Webseite. Keine erfundenen Preise, Bewertungen oder technischen Daten. */

import inhalte from "./inhalte.json";

/**
 * Pakete, Preise, Konditionen und technische Angaben kommen seit Phase 4 aus der Datenbank (Admin → «Webseite aktualisieren»).
 * tools/inhalte-export.mjs schreibt sie vor dem Bauen nach inhalte.json. Nichts davon hier von Hand ändern.
 */
export interface PackageInfo {
  slug: string;
  name: string;
  priceChf: number;
  prints: number | null; // null = ohne Drucker
  features: string[];
}

export const packages: PackageInfo[] = inhalte.packages;
export const terms = inhalte.terms;
/** Technische Fakten: nur Bestätigtes. Unbekanntes = null (Anzeige «folgt»). */
export const productFacts: { label: string; value: string | null }[] = inhalte.productFacts;
/** Häufige Fragen, Platzhalter wie {preis:premium} sind bereits ersetzt. */
export const faqs: { question: string; answer: string }[] = inhalte.faqs;

export const steps = [
  { title: "Datum wählen", text: "Sie sehen sofort, ob die Fotobox an Ihrem Wunschtermin frei ist." },
  { title: "Paket buchen", text: "Paket und Extras wählen, Preis prüfen, verbindlich buchen. Die Bestätigung kommt sofort per E-Mail." },
  { title: "Wir liefern", text: "Wir bringen die Fotobox, bauen sie auf und zeigen Ihnen alles." },
  { title: "Erinnerungen behalten", text: "Ihre Gäste nehmen ihre Postkarten mit. Die Fotos liegen danach in Ihrer privaten Online-Galerie." },
];

export const benefits = [
  { title: "Spiegelreflexkamera", text: "Scharfe, natürliche Bilder statt Tablet-Kamera." },
  { title: "Postkarte in Sekunden", text: "Jeder Gast hält sein Foto als Abzug 10 × 15 cm in der Hand." },
  { title: "Privat statt öffentlich", text: "Jeder Gast erhält nur sein eigenes Foto per QR-Code. Die gemeinsame Galerie geben Sie frei – oder nicht." },
  { title: "Sofort verbindlich", text: "Verfügbarkeit, Preis und Bestätigung online, ohne Warten auf eine Offerte." },
];

export const occasions = [
  { href: "/hochzeit", title: "Hochzeit", text: "Erinnerungen der Gäste für Ihr Hochzeitsalbum – und eine Postkarte für jeden zum Mitnehmen." },
  { href: "/geburtstag", title: "Geburtstag", text: "Vom runden Geburtstag bis zum Familienfest: unkompliziert, persönlich, mit eigenem Layout." },
  { href: "/firmenanlass", title: "Firmenanlass", text: "Weihnachtsessen, Jubiläum oder Messe: Fotos mit Ihrem Logo und eine datenschutzfreundliche Galerie." },
];


export const regions = {
  "fotobox-thurgau": {
    name: "Thurgau",
    title: "Fotobox mieten im Thurgau",
    intro: "Platzhalter: Hier entsteht eine eigenständige Seite mit echten Informationen zum Thurgau – Liefergebiet, Lieferkosten, Erfahrungen von Anlässen in der Region und passende Locations.",
  },
  "fotobox-ostschweiz": {
    name: "Ostschweiz",
    title: "Fotobox mieten in der Ostschweiz",
    intro: "Platzhalter: Hier entsteht eine eigenständige Seite zur Ostschweiz mit Liefergebiet nach Kantonen, Lieferkosten und regionalen Erfahrungen.",
  },
  "fotobox-zuerich": {
    name: "Zürich",
    title: "Fotobox mieten in Zürich",
    intro: "Platzhalter: Hier entsteht eine eigenständige Seite zum Kanton Zürich mit Liefergebiet, Lieferkosten und regionalen Erfahrungen.",
  },
} as const;
