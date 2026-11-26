/**
 * Preisberechnung – nur hier, nur im Worker. Reine Funktionen (ohne Datenbank), damit sie einzeln getestet werden können.
 * Alle Beträge in Rappen (ganze Zahlen).
 */
export interface Position {
  code: string;
  text: string;
  qty: number;
  unit_rappen: number;
  total_rappen: number;
}

export interface Zone {
  id: number;
  name: string;
  cantons: string[];
  plz_ranges: [string, string][];
  max_km: number | null;
  base_rappen: number;
  included_km: number;
  per_km_rappen: number;
  pickup_allowed: number;
  instant_booking: number;
  min_lead_days: number;
  buffer_days_before: number;
  buffer_days_after: number;
}

/** Luftlinie in km (Haversine-Formel). */
export function luftlinieKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (g: number) => (g * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Geschätzte Strassen-km (einfache Strecke), aufgerundet auf ganze km. */
export function geschaetzteKm(luftlinie: number, umwegfaktor: number): number {
  return Math.ceil(luftlinie * umwegfaktor);
}

/** Fahrtkosten für Lieferung UND Abholung zusammen. */
export function fahrtRappen(km: number, zone: Pick<Zone, "base_rappen" | "included_km" | "per_km_rappen">): number {
  return zone.base_rappen + Math.max(0, km - zone.included_km) * zone.per_km_rappen;
}

export function zusatztage(mietTage: number, inbegriffen: number): number {
  return Math.max(0, mietTage - inbegriffen);
}

/** Passende Zone: zuerst PLZ-Bereich, dann Kanton; nur aktive Zonen, in Sortierreihenfolge. */
export function findeZone(zonen: Zone[], plz: string, kanton: string | null): Zone | null {
  return (
    zonen.find((z) => z.plz_ranges.some(([von, bis]) => plz >= von && plz <= bis)) ??
    (kanton ? zonen.find((z) => z.cantons.includes(kanton)) : undefined) ??
    null
  );
}

export const chf = (rappen: number) => `CHF ${(rappen / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}`;

export function summe(positionen: Position[]): number {
  return positionen.reduce((s, p) => s + p.total_rappen, 0);
}

export function position(code: string, text: string, qty: number, unit: number): Position {
  return { code, text, qty, unit_rappen: unit, total_rappen: qty * unit };
}
