/** Änderbare Einstellungen mit Prüfung (nur Eigentümer). Unbekannte Schlüssel werden abgelehnt. */
type Pruefer = (v: unknown) => boolean;
const ganz = (min: number, max: number): Pruefer => (v) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export const EINSTELLUNGEN: Record<string, Pruefer> = {
  storage_limit_bytes: ganz(100_000_000, 10_000_000_000), // höchstens die Gratisgrenze
  usage_block_percent: ganz(50, 100),
  usage_warn_percent: (v) => Array.isArray(v) && v.length > 0 && v.length <= 5 && v.every((x) => Number.isInteger(x) && x > 0 && x <= 100),
  print_cost_rappen: ganz(0, 500),
  vat_enabled: (v) => typeof v === "boolean",
  payment_due_before_event: (v) => typeof v === "boolean",
  gallery_retention_days: ganz(1, 365),
  image_long_edge_px: ganz(1600, 3000),
  image_jpeg_quality: ganz(70, 95),
  booking_hold_minutes: ganz(5, 60),
  booking_min_lead_days: ganz(0, 60),
};
