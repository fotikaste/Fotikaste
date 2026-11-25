import { brand } from "../config/brand";

/**
 * Inhalte für Phase 1. Alles, was noch nicht feststeht, ist ausdrücklich als Platzhalter markiert
 * und wird ab Phase 4 im Admin gepflegt. Keine erfundenen Preise, Bewertungen oder technischen Daten.
 */

export interface PackageInfo {
  slug: string;
  name: string;
  priceChf: number | null; // null = noch nicht festgelegt
  prints: number | null;
  printsIsExample?: boolean;
  features: string[];
  placeholder: true;
}

export const packages: PackageInfo[] = [
  { slug: "essential", name: "Essential", priceChf: null, prints: null, features: ["Online-Galerie", "QR-Download fürs Handy", "Mietdauer folgt"], placeholder: true },
  { slug: "premium", name: "Premium", priceChf: null, prints: 300, printsIsExample: true, features: ["Lieferung und Aufbau", "Individuelles Fotolayout", "Online-Galerie"], placeholder: true },
  { slug: "signature", name: "Signature", priceChf: null, prints: null, features: ["Hintergrundsystem", "Verlängerte Mietdauer", "Persönliche Betreuung"], placeholder: true },
];

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
  { question: `Was kostet eine Fotobox bei ${brand.name}?`, answer: "Die Preise werden derzeit festgelegt und erscheinen hier transparent mit allen Leistungen. Lieferung, Ausdrucke und Extras sind dann einzeln ausgewiesen, ohne versteckte Kosten." },
  { question: `In welchen Regionen liefert ${brand.name}?`, answer: "In der Ostschweiz und im Kanton Zürich: Thurgau, St. Gallen, beide Appenzell, Schaffhausen, Glarus und Zürich. Die Lieferkosten richten sich nach der Entfernung und werden vor der Buchung angezeigt." },
  { question: "Wie funktioniert die Buchung?", answer: "Sie wählen Ihr Eventdatum, sehen sofort die Verfügbarkeit, wählen Paket und Extras und buchen verbindlich online. Sie erhalten die Bestätigung sofort per E-Mail. Bezahlt wird auf Rechnung vor dem Event." },
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
