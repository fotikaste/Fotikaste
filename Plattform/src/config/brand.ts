/**
 * Einzige Quelle für Markenname, Domain und Kontaktdaten.
 * Ein Namenswechsel (z. B. nach der Markenprüfung) passiert nur hier.
 * Werte mit `null` sind noch nicht festgelegt und werden auf der Webseite NICHT erfunden,
 * sondern weggelassen oder als «folgt» angezeigt.
 */
export const brand = {
  name: "Fotikaste",
  /** Name festgelegt vom Inhaber am 2026-11-26 (ADR-033); Verwechslungsrisiko mit «Event Fotibox» bewusst in Kauf genommen. */
  isWorkingName: false,
  /** Domain fotikaste.ch (gekauft bei Hostpoint, DNS bei Cloudflare, 2026-11-26). */
  siteUrl: "https://fotikaste.ch",
  locale: "de-CH",
  claim: "Besondere Momente. Bleibende Erinnerungen.",
  description:
    "Fotobox mit Spiegelreflexkamera und Sofortdruck für Hochzeiten, Geburtstage und Firmenanlässe in der Ostschweiz und im Raum Zürich – direkt online buchen.",
  /** Liefergebiet laut Entscheid (Kantone). Wird später aus dem Admin gepflegt. */
  areaServed: ["Thurgau", "St. Gallen", "Appenzell Ausserrhoden", "Appenzell Innerrhoden", "Schaffhausen", "Glarus", "Zürich"],
  /** Inhaber für Impressum und Datenschutz (nur echte Angaben eintragen; null = «noch offen»). */
  owner: {
    // Angaben des Inhabers vom 2026-11-27. Rechtsform: eine Person ohne Gesellschaft = Einzelunternehmen (nicht im Handelsregister).
    name: "Tim Jones" as string | null,          // Vor- und Nachname bzw. Firma
    legalForm: "Einzelunternehmen" as string | null,     // z. B. «Einzelunternehmen»
    uid: null as string | null,           // UID (CHE-…), falls vorhanden
    vatNumber: null as string | null,     // MWST-Nummer, falls MWST-pflichtig
  },
  contact: {
    email: "tim.jones@bluewin.ch" as string | null,
    phone: "+41 79 812 07 73" as string | null,
    /** Geschäftsadresse für Impressum; im Google-Profil ausblendbar. */
    address: { street: "Kanalweg 2", postalCode: "8370", city: "Sirnach" } as null | { street: string; postalCode: string; city: string },
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
