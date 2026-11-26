-- Phase 3: Buchung, Liefergebiete, Verfügbarkeit, Kundenportal, E-Mail-Ausgang.
-- Geld in Rappen (integer). Zeit als ISO-8601-Text in UTC. Kalendertage als 'YYYY-MM-DD' (Europe/Zurich).

-- ---------- Katalog (Werte laut docs/PREISE.md, festgelegt 2026-11-26) ----------
CREATE TABLE packages (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  price_rappen INTEGER NOT NULL CHECK (price_rappen >= 0),
  prints       INTEGER CHECK (prints IS NULL OR prints >= 0),   -- inbegriffene Abzüge, NULL = ohne Drucker
  sort         INTEGER NOT NULL DEFAULT 0,
  visible      INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1))
);
INSERT INTO packages (slug, name, price_rappen, prints, sort) VALUES
  ('essential', 'Essential', 29000, NULL, 1),
  ('premium',   'Premium',   45000, 300,  2),
  ('signature', 'Signature', 59000, 600,  3);

INSERT INTO settings (key, value) VALUES
  ('booking_included_days', '2'),           -- Mietdauer inbegriffen
  ('booking_extra_day_rappen', '4500'),     -- jeder weitere Tag
  ('booking_max_days', '7'),                -- technische Obergrenze pro Buchung (gegen Blockieren des Kalenders)
  ('booking_horizon_days', '550'),          -- wie weit im Voraus buchbar
  ('flex_cancel_rappen', '2000'),           -- Option «stornierbar»
  ('flex_cancel_days', '28'),               -- kostenlose Absage bis so viele Tage vor dem Event
  ('delivery_origin_plz', '"8370"'),        -- Sirnach
  ('delivery_detour_factor', '1.3'),        -- Luftlinie × Umwegfaktor = geschätzte Strasse
  ('deposit_percent', '0'),                 -- Anzahlung (0 = keine)
  ('security_deposit_rappen', '0'),         -- Kaution (0 = keine)
  ('payment_due_days_before', 'null'),      -- null = Zahlung nach Absprache
  ('terms_version', '"ENTWURF-2026-11"'),   -- AGB-Version, die der Kunde akzeptiert
  ('mail_daily_limit', '80');               -- eigene Drossel unter der Resend-Gratisgrenze (100/Tag)

-- ---------- Postleitzahlen (offene Daten, per Werkzeug importiert; leer = Distanz unbekannt → Anfrage) ----------
CREATE TABLE postal_codes (
  plz    TEXT NOT NULL,
  ort    TEXT NOT NULL,
  kanton TEXT NOT NULL,          -- Kürzel, z. B. TG
  lat    REAL NOT NULL,
  lon    REAL NOT NULL,
  PRIMARY KEY (plz, ort)
);

-- ---------- Liefergebiete ----------
CREATE TABLE delivery_zones (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  cantons           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cantons)),     -- ["TG","SG"]
  plz_ranges        TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(plz_ranges)),  -- [["8000","8999"]] zusätzlich zu Kantonen
  max_km            INTEGER CHECK (max_km IS NULL OR max_km > 0),               -- NULL = keine Grenze
  base_rappen       INTEGER NOT NULL CHECK (base_rappen >= 0),                  -- Lieferung + Abholung zusammen
  included_km       INTEGER NOT NULL CHECK (included_km >= 0),
  per_km_rappen     INTEGER NOT NULL CHECK (per_km_rappen >= 0),                -- je km einfache Strecke darüber
  pickup_allowed    INTEGER NOT NULL DEFAULT 1 CHECK (pickup_allowed IN (0, 1)),
  instant_booking   INTEGER NOT NULL DEFAULT 1 CHECK (instant_booking IN (0, 1)),
  min_lead_days     INTEGER NOT NULL DEFAULT 7 CHECK (min_lead_days >= 0),
  buffer_days_before INTEGER NOT NULL DEFAULT 0 CHECK (buffer_days_before BETWEEN 0 AND 3),
  buffer_days_after  INTEGER NOT NULL DEFAULT 0 CHECK (buffer_days_after BETWEEN 0 AND 3),
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort              INTEGER NOT NULL DEFAULT 0
);
INSERT INTO delivery_zones (name, cantons, base_rappen, included_km, per_km_rappen) VALUES
  ('Ostschweiz und Zürich', '["TG","SG","AR","AI","SH","GL","ZH"]', 5000, 20, 120);

-- ---------- Ressourcen (Kapazität) ----------
CREATE TABLE resources (
  id       TEXT PRIMARY KEY,
  type     TEXT NOT NULL CHECK (type IN ('device', 'delivery')),
  name     TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity BETWEEN 1 AND 10),   -- Slots pro Tag
  active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
INSERT INTO resources (id, type, name, capacity) VALUES
  ('fotobox-1', 'device', 'Fotobox 1', 1),
  ('lieferung', 'delivery', 'Lieferung', 1);

-- ---------- Kunden ----------
CREATE TABLE customers (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT NOT NULL,
  locale     TEXT NOT NULL DEFAULT 'de-CH',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------- Buchungen ----------
CREATE TABLE bookings (
  id              TEXT PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('request', 'confirmed', 'completed', 'cancelled', 'declined')),
  customer_id     TEXT NOT NULL REFERENCES customers(id),
  -- Kontaktdaten als Snapshot dieser Buchung (überschreiben nie das Kundenkonto)
  contact_name    TEXT NOT NULL,
  contact_company TEXT,
  contact_phone   TEXT NOT NULL,
  contact_email   TEXT NOT NULL,
  package_slug    TEXT NOT NULL REFERENCES packages(slug),
  event_day       TEXT NOT NULL,
  start_day       TEXT NOT NULL,
  end_day         TEXT NOT NULL,
  delivery        INTEGER NOT NULL CHECK (delivery IN (0, 1)),   -- 0 = Selbstabholung
  street          TEXT,
  plz             TEXT,
  city            TEXT,
  zone_id         INTEGER REFERENCES delivery_zones(id),
  km_estimated    INTEGER,
  guests          INTEGER CHECK (guests IS NULL OR guests BETWEEN 1 AND 5000),
  flex_cancel     INTEGER NOT NULL DEFAULT 0 CHECK (flex_cancel IN (0, 1)),
  flex_cancel_until TEXT,
  message         TEXT,
  total_rappen    INTEGER NOT NULL CHECK (total_rappen >= 0),
  price_final     INTEGER NOT NULL DEFAULT 1 CHECK (price_final IN (0, 1)),  -- 0 = Fahrtkosten noch offen (Anfrage)
  reason          TEXT,                 -- warum Anfrage statt Direktbuchung
  terms_version   TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_day <= event_day AND event_day <= end_day)
);
CREATE INDEX bookings_customer ON bookings (customer_id);
CREATE INDEX bookings_event ON bookings (event_day);

-- Positionen als Snapshot: spätere Preisänderungen ändern bestehende Buchungen nicht.
CREATE TABLE booking_items (
  booking_id   TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  pos          INTEGER NOT NULL,
  code         TEXT NOT NULL,
  text         TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  unit_rappen  INTEGER NOT NULL,
  total_rappen INTEGER NOT NULL,
  PRIMARY KEY (booking_id, pos)
);

CREATE TABLE booking_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor      TEXT NOT NULL,
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT
);

-- Zahlungsplan: nur Information, KEINE Zahlungsfunktion. Standard: ganzer Betrag nach Absprache.
CREATE TABLE payment_schedule (
  booking_id    TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('full', 'deposit', 'balance', 'security_deposit')),
  amount_rappen INTEGER NOT NULL CHECK (amount_rappen >= 0),
  due_on        TEXT,           -- NULL = nach Absprache
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'refunded', 'waived')),
  PRIMARY KEY (booking_id, kind)
);

-- ---------- Verfügbarkeit: Doppelbuchung technisch unmöglich ----------
CREATE TABLE allocations (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL CHECK (type IN ('hold', 'booking', 'maintenance', 'block')),
  booking_id TEXT REFERENCES bookings(id),
  request    TEXT CHECK (request IS NULL OR json_valid(request)),   -- geprüfte Buchungswahl beim Halten
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((type = 'hold') = (expires_at IS NOT NULL))
);
CREATE INDEX allocations_hold ON allocations (type, expires_at);
CREATE INDEX allocations_booking ON allocations (booking_id);

CREATE TABLE allocation_days (
  allocation_id TEXT NOT NULL REFERENCES allocations(id) ON DELETE CASCADE,
  resource_id   TEXT NOT NULL REFERENCES resources(id),
  day           TEXT NOT NULL,
  slot          INTEGER NOT NULL DEFAULT 1 CHECK (slot >= 1),
  UNIQUE (resource_id, day, slot)
);
CREATE INDEX allocation_days_alloc ON allocation_days (allocation_id);

-- ---------- Kundenportal (Magic Link) ----------
CREATE TABLE magic_links (
  token_hash  TEXT PRIMARY KEY,           -- SHA-256 des Tokens, nie der Token selbst
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE sessions (
  session_hash TEXT PRIMARY KEY,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX sessions_customer ON sessions (customer_id);

-- ---------- E-Mail-Ausgang (Outbox) ----------
CREATE TABLE outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dedupe_key TEXT NOT NULL UNIQUE,          -- verhindert doppelte Mails
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'held', 'failed')),
  attempts   INTEGER NOT NULL DEFAULT 0,
  test_mode  INTEGER NOT NULL DEFAULT 1 CHECK (test_mode IN (0, 1)),
  sent_day   TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX outbox_status ON outbox (status);
