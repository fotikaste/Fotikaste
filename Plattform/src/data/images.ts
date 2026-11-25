/**
 * Bilder der Webseite (vom Benutzer geliefert, 2026-11-25). Es sind KI-generierte Visualisierungen:
 * Sie zeigen keine echten Kundinnen und Kunden und keine echten Anlässe. Deshalb werden sie auf der Seite
 * als «Visualisierung (KI-generiert)» gekennzeichnet und später durch echte Fotos ersetzt.
 * Masse = Pixelgrösse der Quelle (für width/height gegen Layoutverschiebung).
 */
export interface SiteImage {
  name: string;
  alt: string;
  width: number;
  height: number;
  aiGenerated: boolean;
  /** Bildausschnitt bei object-fit: cover, z. B. "30% 50%" */
  position?: string;
}

export const images = {
  fotoboxBlumen: { name: "fotobox-blumen", alt: "Fotobox im Holzgehäuse auf Stativ mit Leuchte, daneben weisse Blumen und Kerzen", width: 1086, height: 1448, aiGenerated: true },
  paarAbzug: { name: "paar-abzug", alt: "Gäste betrachten lachend einen frisch gedruckten Fotoabzug, eine Frau tippt auf den Bildschirm der Fotobox", width: 1448, height: 1086, aiGenerated: true, position: "22% 50%" },
  gaesteAbzug: { name: "gaeste-abzug", alt: "Gäste mit Abzug in der Hand, eine Frau bedient den Touchscreen der Fotobox, daneben der Fotodrucker", width: 1448, height: 1086, aiGenerated: true },
  fotoboxStudio: { name: "fotobox-studio", alt: "Fotobox mit Holzgehäuse, Leuchte und Stativ, daneben der Fotodrucker auf einem Sockel", width: 1448, height: 1086, aiGenerated: true },
  fotoboxLobby: { name: "fotobox-lobby", alt: "Fotobox mit Drucker in einer eleganten Eventlobby am Abend", width: 1448, height: 1086, aiGenerated: true },
  hochzeitGruppe: { name: "hochzeit-gruppe", alt: "Brautpaar und Gäste mit Requisiten lachen vor der Fotobox", width: 1536, height: 1024, aiGenerated: true, position: "40% 40%" },
  hochzeitGaeste: { name: "hochzeit-gaeste", alt: "Hochzeitsgäste posieren lachend vor der Fotobox, im Hintergrund Kerzen und Blumen", width: 1448, height: 1086, aiGenerated: true, position: "30% 50%" },
  firmenanlassGruppe: { name: "firmenanlass-gruppe", alt: "Gruppe an einem Firmenanlass mit Requisiten vor der Fotobox", width: 1536, height: 1024, aiGenerated: true, position: "40% 40%" },
  firmenanlassSaal: { name: "firmenanlass-saal", alt: "Kolleginnen und Kollegen posieren an einem Firmenanlass vor der Fotobox, daneben der Drucker", width: 1672, height: 941, aiGenerated: true, position: "65% 50%" },
} satisfies Record<string, SiteImage>;

/** Bild je Anlassseite. */
export const occasionImages = {
  "/hochzeit": images.hochzeitGruppe,
  "/geburtstag": images.paarAbzug,
  "/firmenanlass": images.firmenanlassGruppe,
} as const;

/** Beispielgalerie (Visualisierungen, bis echte Eventfotos vorliegen). */
export const galleryImages = [images.hochzeitGaeste, images.firmenanlassSaal, images.fotoboxLobby, images.gaesteAbzug];

export const AI_LABEL = "Visualisierung (KI-generiert)";
export const AI_LABEL_PLURAL = "Visualisierungen (KI-generiert)";
