import { brand } from "../config/brand";

/**
 * Inhalte für Phase 1. Alles, was noch nicht feststeht, ist ausdrücklich als Platzhalter markiert
 * und wird ab Phase 4 im Admin gepflegt. Keine erfundenen Preise, Bewertungen oder technischen Daten.
 */

export interface PackageInfo {
  slug: string;
  name: string;
  priceChf: number;
  prints: number | null; // null = ohne Drucker
  features: string[];
}

/** Festgelegt vom Inhaber am 2026-11-26 (docs/PREISE.md). Später im Admin pflegbar. */
export const packages: PackageInfo[] = [
  { slug: "essential", name: "Essential", priceChf: 290, prints: null, features: ["Fotobox mit Spiegelreflexkamera", "Online-Galerie und QR-Download", "Rahmen und Layouts inbegriffen", "ohne Drucker"] },
  { slug: "premium", name: "Premium", priceChf: 450, prints: 300, features: ["Sofortdruck 10 × 15 cm", "300 Abzüge inbegriffen", "Online-Galerie und QR-Download", "Rahmen und Layouts inbegriffen"] },
  { slug: "signature", name: "Signature", priceChf: 590, prints: 600, features: ["Sofortdruck 10 × 15 cm", "600 Abzüge inbegriffen", "Online-Galerie und QR-Download", "Rahmen und Layouts inbegriffen"] },
];

/** Konditionen (docs/PREISE.md). */
export const terms = {
  includedDays: 2,
  extraDayChf: 45,
  delivery: { baseChf: 50, includedKm: 20, perKmChf: 1.2, origin: "8370 Sirnach" },
  flexCancelChf: 20,
  flexCancelDays: 28,
} as const;

/** Technische Fakten: nur Bestätigtes (Hardware vorhanden). Unbekanntes = null. */
export const productFacts = [
  { label: "Kamera", value: "Canon EOS 600D (Spiegelreflex)" },
  { label: "Druck", value: "Postkarte 10 × 15 cm, Sofortdruck (DNP DS620)" },
  { label: "Digital", value: "Jedes Foto per QR-Code aufs Handy" },
  { label: "Bedienung", value: "Touchscreen, ohne Anleitung verständlich" },
  { label: "Licht", value: "Dauerbeleuchtung" },
  { label: "Platzbedarf", value: null },
  { label: "Strom", value: null },
  { label: "Aufbauzeit", value: null },
  { label: "Abmessungen", value: null },
] as const;

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

export const faqs = [
  { question: `Was kostet eine Fotobox bei ${brand.name}?`, answer: "Essential kostet CHF 290.– (ohne Drucker, mit Online-Galerie), Premium CHF 450.– (mit Drucker und 300 Abzügen) und Signature CHF 590.– (mit Drucker und 600 Abzügen). Die Miete gilt für bis zu 2 Tage, jeder weitere Tag kostet CHF 45.–. Lieferung und Abholung kosten zusammen CHF 50.– bis 20 km ab Sirnach, darüber CHF 1.20 pro km." },
  { question: `In welchen Regionen liefert ${brand.name}?`, answer: "In der Ostschweiz und im Kanton Zürich: Thurgau, St. Gallen, beide Appenzell, Schaffhausen, Glarus und Zürich. Die Lieferkosten richten sich nach der Entfernung und werden vor der Buchung angezeigt." },
  { question: "Wie funktioniert die Buchung?", answer: "Sie wählen Ihr Eventdatum, sehen sofort die Verfügbarkeit, wählen Paket und Extras und buchen verbindlich online. Sie erhalten die Bestätigung sofort per E-Mail. Online wird nichts bezahlt – die Zahlung vereinbaren wir danach per E-Mail oder persönlich." },
  { question: "Wie bekommen die Gäste ihre Fotos?", answer: "Jedes Foto wird sofort als Postkarte 10 × 15 cm gedruckt. Auf Wunsch zeigt die Fotobox einen QR-Code, über den der Gast nur sein eigenes Foto auf das Handy lädt." },
  { question: "Wer sieht die Fotos meines Anlasses?", answer: "Standardmässig nur die Person, die ein Foto aufgenommen hat, über ihren persönlichen QR-Code. Eine gemeinsame Galerie für alle Gäste schalten Sie als Veranstalter bewusst frei, auf Wunsch mit Passwort." },
  { question: "Wie lange bleiben die Fotos online?", answer: "Standardmässig 30 Tage. Vor der Löschung erhalten Sie eine Erinnerung per E-Mail. Die Originalbilder bleiben bei uns auf der Fotobox und können auf Wunsch separat bereitgestellt werden." },
  { question: "Braucht die Fotobox Internet am Veranstaltungsort?", answer: "Nein. Fotografieren und Drucken funktionieren ohne Internet. Ohne Verbindung werden die Fotos später automatisch in die Online-Galerie geladen; das sagt die Fotobox den Gästen auch ehrlich." },
  { question: "Wie viel Platz und Strom braucht die Fotobox?", answer: "Die genauen Masse und den Strombedarf veröffentlichen wir, sobald die finale Fotobox vermessen ist." },
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
