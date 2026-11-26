/**
 * Änderbare Einstellungen mit Prüfung (nur Eigentümer). Unbekannte Schlüssel werden abgelehnt.
 * SPEC beschreibt jedes Feld für die Formulare (Bezeichnung, Art, Grenzen, Gruppe).
 */
export type Art = "ganz" | "rappen" | "rappen_oder_leer" | "bool" | "liste" | "faktor" | "plz" | "tage_oder_leer" | "gb" | "text";
export type Gruppe = "konditionen" | "zahlung" | "system" | "finanzen";
export interface Spec { label: string; art: Art; min?: number; max?: number; gruppe: Gruppe; hilfe?: string; webseite?: boolean }

export const SPEC: Record<string, Spec> = {
  booking_included_days: { label: "Inbegriffene Miettage", art: "ganz", min: 1, max: 14, gruppe: "konditionen", webseite: true },
  booking_extra_day_rappen: { label: "Preis pro Zusatztag", art: "rappen", min: 0, max: 100_000, gruppe: "konditionen", webseite: true },
  flex_cancel_rappen: { label: "Option «stornierbar»", art: "rappen", min: 0, max: 100_000, gruppe: "konditionen", webseite: true },
  flex_cancel_days: { label: "Kostenlose Absage bis Tage vor Event", art: "ganz", min: 1, max: 180, gruppe: "konditionen", webseite: true },
  booking_min_lead_days: { label: "Mindestvorlauf Direktbuchung (Tage, ohne Zone)", art: "ganz", min: 0, max: 60, gruppe: "konditionen", hilfe: "Kürzer = Anfrage. Für Lieferungen gilt der Vorlauf der Zone." },
  booking_max_days: { label: "Höchstens Miettage online", art: "ganz", min: 1, max: 31, gruppe: "konditionen" },
  booking_horizon_days: { label: "Buchbar bis Tage im Voraus", art: "ganz", min: 30, max: 1100, gruppe: "konditionen" },
  booking_hold_minutes: { label: "Termin halten (Minuten)", art: "ganz", min: 5, max: 60, gruppe: "konditionen" },
  delivery_origin_plz: { label: "Ausgangsort Fahrten (PLZ)", art: "plz", gruppe: "konditionen", webseite: true },
  delivery_detour_factor: { label: "Umwegfaktor (Luftlinie × Faktor)", art: "faktor", min: 1, max: 2, gruppe: "konditionen" },
  vat_enabled: { label: "MWST ausweisen", art: "bool", gruppe: "zahlung", hilfe: "Erst einschalten, wenn die MWST-Pflicht geklärt ist." },
  terms_version: { label: "AGB-Version für neue Buchungen", art: "text", gruppe: "zahlung" },
  cost_per_km_rappen: { label: "Fahrzeugkosten pro km", art: "rappen_oder_leer", min: 0, max: 1000, gruppe: "finanzen", hilfe: "Eigener Ansatz (Benzin, Unterhalt, Abnutzung). Leer = noch offen." },
  hourly_rate_rappen: { label: "Eigener Stundenansatz", art: "rappen_oder_leer", min: 0, max: 100_000, gruppe: "finanzen", hilfe: "Was eine Stunde deiner Arbeit wert sein soll. Leer = noch offen." },
  storage_limit_bytes: { label: "Fotospeicher App-Grenze (GB)", art: "gb", min: 0.1, max: 10, gruppe: "system", hilfe: "Höchstens 10 GB (Gratisgrenze)." },
  usage_warn_percent: { label: "Warnstufen in % (z. B. 50, 75, 90)", art: "liste", gruppe: "system" },
  usage_block_percent: { label: "Sperre ab %", art: "ganz", min: 50, max: 100, gruppe: "system" },
  print_cost_rappen: { label: "Material pro Abzug (Papier + Farbband)", art: "rappen", min: 0, max: 500, gruppe: "finanzen", hilfe: "Vorläufig CHF 0.15 – mit echten Einkaufspreisen prüfen." },
  gallery_retention_days: { label: "Galerie online (Tage)", art: "ganz", min: 1, max: 365, gruppe: "system" },
  image_long_edge_px: { label: "Bildgrösse lange Seite (px)", art: "ganz", min: 1600, max: 3000, gruppe: "system" },
  image_jpeg_quality: { label: "JPEG-Qualität", art: "ganz", min: 70, max: 95, gruppe: "system" },
  mail_daily_limit: { label: "E-Mails pro Tag höchstens", art: "ganz", min: 1, max: 100, gruppe: "system", hilfe: "Resend gratis: 100 pro Tag." },
};

type Pruefer = (v: unknown) => boolean;
const ganz = (min: number, max: number): Pruefer => (v) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function pruefer(s: Spec): Pruefer {
  switch (s.art) {
    case "ganz": case "rappen": return ganz(s.min!, s.max!);
    case "gb": return ganz(100_000_000, 10_000_000_000);
    case "bool": return (v) => typeof v === "boolean";
    case "faktor": return (v) => typeof v === "number" && v >= s.min! && v <= s.max!;
    case "plz": return (v) => typeof v === "string" && /^\d{4}$/.test(v);
    case "tage_oder_leer": case "rappen_oder_leer": return (v) => v === null || ganz(s.min!, s.max!)(v);
    case "liste": return (v) => Array.isArray(v) && v.length > 0 && v.length <= 5 && v.every((x) => Number.isInteger(x) && x > 0 && x <= 100);
    case "text": return (v) => typeof v === "string" && v.length >= 1 && v.length <= 40;
  }
}

export const EINSTELLUNGEN: Record<string, Pruefer> = Object.fromEntries(Object.entries(SPEC).map(([k, s]) => [k, pruefer(s)]));

/** Formularwert → gespeicherter Wert (oder undefined bei ungültiger Eingabe). */
export function ausFormular(s: Spec, text: string | undefined): unknown {
  const t = (text ?? "").trim().replace(/'/g, "");
  switch (s.art) {
    case "bool": return text === "on";
    case "rappen": { if (!/^\d{1,6}([.,]\d{1,2})?$/.test(t)) return undefined; return Math.round(Number(t.replace(",", ".")) * 100); }
    case "rappen_oder_leer": { if (t === "") return null; if (!/^\d{1,6}([.,]\d{1,2})?$/.test(t)) return undefined; return Math.round(Number(t.replace(",", ".")) * 100); }
    case "gb": { const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 1e9) : undefined; }
    case "faktor": { const n = Number(t.replace(",", ".")); return Number.isFinite(n) ? n : undefined; }
    case "tage_oder_leer": return t === "" ? null : /^\d+$/.test(t) ? Number(t) : undefined;
    case "liste": return t.split(/[,\s]+/).filter(Boolean).map(Number);
    case "plz": case "text": return t;
    default: return /^-?\d+$/.test(t) ? Number(t) : undefined;
  }
}

/** Gespeicherter Wert → Formularanzeige. */
export function fuerFormular(s: Spec, v: unknown): string {
  switch (s.art) {
    case "rappen": return (Number(v) / 100).toFixed(2);
    case "rappen_oder_leer": return v === null || v === undefined ? "" : (Number(v) / 100).toFixed(2);
    case "gb": return String(Number(v) / 1e9);
    case "liste": return Array.isArray(v) ? v.join(", ") : "";
    case "tage_oder_leer": return v === null || v === undefined ? "" : String(v);
    default: return v === null || v === undefined ? "" : String(v);
  }
}
