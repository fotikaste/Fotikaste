/**
 * Inhalte der öffentlichen Webseite aus der Datenbank (Phase 4).
 * Dieselben Abfragen und dieselbe Umformung nutzt
 *  - der Worker (Vorschau, Tests) und
 *  - tools/inhalte-export.mjs, das vor dem Bauen src/data/inhalte.json schreibt.
 * Darum ohne Abhängigkeiten (läuft auch direkt in Node).
 */

export const ABFRAGEN = {
  pakete: "SELECT slug, name, price_rappen, prints, sort, visible FROM packages ORDER BY sort, slug",
  leistungen: "SELECT package_slug, pos, text FROM package_features ORDER BY package_slug, pos",
  einstellungen: "SELECT key, value FROM settings",
  zone: "SELECT base_rappen, included_km, per_km_rappen FROM delivery_zones WHERE active = 1 ORDER BY sort, id LIMIT 1",
  ausgangsort: "SELECT p.plz, p.ort FROM postal_codes p JOIN settings s ON s.key = 'delivery_origin_plz' AND p.plz = json_extract(s.value, '$') ORDER BY p.ort LIMIT 1",
  fragen: "SELECT question, answer FROM faqs WHERE visible = 1 AND locale = 'de-CH' ORDER BY sort, id",
  fakten: "SELECT label, value FROM product_facts ORDER BY sort, id",
} as const;

export type Zeilen = { [K in keyof typeof ABFRAGEN]: Record<string, unknown>[] };

export interface Inhalte {
  packages: { slug: string; name: string; priceChf: number; prints: number | null; features: string[] }[];
  terms: { includedDays: number; extraDayChf: number; delivery: { baseChf: number; includedKm: number; perKmChf: number; origin: string }; flexCancelChf: number; flexCancelDays: number };
  productFacts: { label: string; value: string | null }[];
  faqs: { question: string; answer: string }[];
}

/** Betrag für Fliesstext: ganze Franken «CHF 290.–», sonst «CHF 1.20». */
export function chfText(rappen: number): string {
  const tausend = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return rappen % 100 === 0 ? `CHF ${tausend(String(rappen / 100))}.–` : `CHF ${tausend((rappen / 100).toFixed(2))}`;
}

export function formeInhalte(z: Zeilen, marke: string): Inhalte {
  const s = Object.fromEntries(z.einstellungen.map((r) => [r.key as string, JSON.parse(r.value as string)]));
  const num = (k: string) => Number(s[k]);
  const zone = (z.zone[0] ?? { base_rappen: 0, included_km: 0, per_km_rappen: 0 }) as { base_rappen: number; included_km: number; per_km_rappen: number };
  const ort = z.ausgangsort[0] as { plz: string; ort: string } | undefined;
  const pakete = z.pakete.filter((p) => p.visible === 1) as { slug: string; name: string; price_rappen: number; prints: number | null }[];

  const ersetzungen: Record<string, string> = {
    marke,
    zusatztag: chfText(num("booking_extra_day_rappen")),
    miettage: String(num("booking_included_days")),
    fahrt_pauschale: chfText(zone.base_rappen),
    fahrt_inkl_km: String(zone.included_km),
    fahrt_pro_km: chfText(zone.per_km_rappen),
    storno: chfText(num("flex_cancel_rappen")),
    storno_tage: String(num("flex_cancel_days")),
    ausgangsort: ort?.ort ?? String(s.delivery_origin_plz ?? ""),
    ...Object.fromEntries(z.pakete.map((p) => [`preis:${p.slug}`, chfText(p.price_rappen as number)])),
  };
  const ersetze = (t: string) => t.replace(/\{([a-z_]+(?::[a-z]+)?)\}/g, (ganz, k: string) => ersetzungen[k] ?? ganz);

  return {
    packages: pakete.map((p) => ({
      slug: p.slug,
      name: p.name,
      priceChf: p.price_rappen / 100,
      prints: p.prints ?? null,
      features: z.leistungen.filter((l) => l.package_slug === p.slug).map((l) => String(l.text)),
    })),
    terms: {
      includedDays: num("booking_included_days"),
      extraDayChf: num("booking_extra_day_rappen") / 100,
      delivery: { baseChf: zone.base_rappen / 100, includedKm: zone.included_km, perKmChf: zone.per_km_rappen / 100, origin: ort ? `${ort.plz} ${ort.ort}` : String(s.delivery_origin_plz ?? "") },
      flexCancelChf: num("flex_cancel_rappen") / 100,
      flexCancelDays: num("flex_cancel_days"),
    },
    productFacts: z.fakten.map((f) => ({ label: String(f.label), value: f.value === null ? null : String(f.value) })),
    faqs: z.fragen.map((f) => ({ question: ersetze(String(f.question)), answer: ersetze(String(f.answer)) })),
  };
}

/** Platzhalter, die nach dem Ersetzen übrig bleiben (Tippfehler im Admin) – werden beim Speichern abgelehnt. */
export function unbekanntePlatzhalter(text: string, slugs: string[]): string[] {
  const erlaubt = new Set(["marke", "zusatztag", "miettage", "fahrt_pauschale", "fahrt_inkl_km", "fahrt_pro_km", "storno", "storno_tage", "ausgangsort", ...slugs.map((x) => `preis:${x}`)]);
  return [...text.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]!).filter((k) => !erlaubt.has(k));
}
