/**
 * Bilder der Webseite. Alle aktuellen Bilder sind KI-generierte Symbolbilder (Canva, 2026-11-25)
 * und zeigen weder die echte Fotikaste-Fotobox noch echte Kundinnen und Kunden.
 * Sie werden auf der Seite als «Symbolbild (KI-generiert)» gekennzeichnet und später durch echte Fotos ersetzt.
 * Masse = Pixelgrösse der Quelle (für width/height gegen Layoutverschiebung).
 */
export interface SiteImage {
  name: string;
  alt: string;
  width: number;
  height: number;
  aiGenerated: boolean;
}

export const images = {
  postkarteHochzeit: { name: "postkarte-hochzeit", alt: "Brautpaar von hinten in einer Scheune, goldenes Konfetti und warme Lichterketten", width: 2820, height: 3870, aiGenerated: true },
  postkarteHaende: { name: "postkarte-haende", alt: "Hände halten einen frisch gedruckten Fotoabzug an einer festlich gedeckten Tafel mit Kerzen", width: 2436, height: 3384, aiGenerated: true },
  tafelGeburtstag: { name: "tafel-geburtstag", alt: "Geburtstagsfeier am Abend: lange Tafel mit Kerzen und Kuchen, Gäste im Hintergrund", width: 4014, height: 2928, aiGenerated: true },
  firmenanlass: { name: "firmenanlass", alt: "Firmenanlass am Abend: Stehtische mit Gläsern in einem modernen Eventraum", width: 3534, height: 3048, aiGenerated: true },
  abzuegeLeinen: { name: "abzuege-leinen", alt: "Mehrere Fotoabzüge mit weissem Rand auf Leinen, daneben ein Glas Champagner", width: 2400, height: 1680, aiGenerated: true },
} satisfies Record<string, SiteImage>;

/** Bild je Anlassseite. */
export const occasionImages = {
  "/hochzeit": images.postkarteHochzeit,
  "/geburtstag": images.tafelGeburtstag,
  "/firmenanlass": images.firmenanlass,
} as const;
