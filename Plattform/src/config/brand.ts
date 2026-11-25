/**
 * Einzige Quelle für Markenname, Domain und Kontaktdaten.
 * Ein Namenswechsel (z. B. nach der Markenprüfung) passiert nur hier.
 * Werte mit `null` sind noch nicht festgelegt und werden auf der Webseite NICHT erfunden,
 * sondern weggelassen oder als «folgt» angezeigt.
 */
export const brand = {
  name: "Fotikaste",
  /** Arbeitsname, rechtlich noch nicht geprüft (siehe docs/BRAND_CHECK.md). */
  isWorkingName: true,
  /** Platzhalter-Domain. Nicht registriert, nicht gekauft. */
  siteUrl: "https://fotikaste.example",
  locale: "de-CH",
  claim: "Besondere Momente. Bleibende Erinnerungen.",
  description:
    "Fotobox mit Spiegelreflexkamera und Sofortdruck für Hochzeiten, Geburtstage und Firmenanlässe in der Ostschweiz und im Raum Zürich – direkt online buchen.",
  /** Liefergebiet laut Entscheid (Kantone). Wird später aus dem Admin gepflegt. */
  areaServed: ["Thurgau", "St. Gallen", "Appenzell Ausserrhoden", "Appenzell Innerrhoden", "Schaffhausen", "Glarus", "Zürich"],
  contact: {
    email: null as string | null,
    phone: null as string | null,
    /** Geschäftsadresse für Impressum; im Google-Profil ausblendbar. */
    address: null as null | { street: string; postalCode: string; city: string },
  },
  /** Nur echte, bestehende Profile eintragen. */
  sameAs: [] as string[],
  colors: {
    ivory: "#F8F6F0",
    paper: "#F4EEE3",
    white: "#FFFFFF",
    sand: "#D8C9B3",
    gold: "#B49A70",
    goldText: "#7A6440",
    charcoal: "#222222",
    muted: "#625E57",
  },
} as const;

export type Brand = typeof brand;
