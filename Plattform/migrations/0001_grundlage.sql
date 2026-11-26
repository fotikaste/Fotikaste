-- Phase 2: Grundlage für Sicherheit und Kostenkontrolle.
-- Zeitangaben als ISO-8601-Text in UTC. Geld (später) in Rappen.

CREATE TABLE admin_users (
  email      TEXT PRIMARY KEY COLLATE NOCASE,          -- muss zur Cloudflare-Access-Identität passen
  role       TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Protokoll sicherheitsrelevanter Aktionen: nur anhängen, nie ändern oder löschen.
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  details TEXT CHECK (details IS NULL OR json_valid(details))
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE TRIGGER audit_log_kein_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log ist unveraenderlich'); END;
CREATE TRIGGER audit_log_kein_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log ist unveraenderlich'); END;

-- Einstellungen als JSON-Werte, im Admin änderbar (nur Eigentümer).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL CHECK (json_valid(value)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO settings (key, value) VALUES
  ('storage_limit_bytes', '8000000000'),   -- App-Grenze 8 GB (Gratis: 10 GB)
  ('usage_warn_percent', '[50, 75, 90]'),
  ('usage_block_percent', '90'),           -- ab hier werden kostenrelevante Vorgänge gesperrt
  ('print_cost_rappen', '15'),             -- vorläufig CHF 0.15 pro Abzug
  ('vat_enabled', 'false'),                -- keine MWST bis geklärt
  ('payment_due_before_event', 'true'),    -- 100 % auf Rechnung vor dem Event
  ('gallery_retention_days', '30'),
  ('image_long_edge_px', '2400'),
  ('image_jpeg_quality', '85'),
  ('booking_hold_minutes', '15'),
  ('booking_min_lead_days', '7');

-- Verbrauchszähler je Zeitraum (Tag 'YYYY-MM-DD' oder Monat 'YYYY-MM').
CREATE TABLE usage_counters (
  period     TEXT NOT NULL,
  metric     TEXT NOT NULL,
  value      INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  source     TEXT NOT NULL CHECK (source IN ('app', 'cloudflare', 'estimate')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (period, metric)
);

-- Fotospeicher: belegt + reserviert. Genau eine Zeile.
CREATE TABLE storage_budget (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  used_bytes     INTEGER NOT NULL DEFAULT 0 CHECK (used_bytes >= 0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0)
);
INSERT INTO storage_budget (id) VALUES (1);

-- Reservierung pro angemeldetem Upload, verfällt automatisch.
CREATE TABLE storage_reservations (
  id         TEXT PRIMARY KEY,
  bytes      INTEGER NOT NULL CHECK (bytes > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX storage_reservations_expires ON storage_reservations (expires_at);

-- Einfache Begrenzung der Anfragen (fester Zeitraum).
CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
