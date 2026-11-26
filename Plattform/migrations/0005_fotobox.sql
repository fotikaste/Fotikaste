-- Phase 5: Fotobox-Integration – Geräte, Events, Fotos (privater Speicher R2).
-- Gäste-Links und Geräte-Tokens werden nur als SHA-256-Hash gespeichert.

CREATE TABLE devices (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  active           INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at     TEXT,
  software_version TEXT,
  last_report      TEXT CHECK (last_report IS NULL OR json_valid(last_report))   -- letzter Heartbeat (Zähler, Warteschlange)
);

-- Geräte-Token: einmal im Admin angezeigt, danach nur noch als Hash bekannt, widerrufbar.
CREATE TABLE device_tokens (
  token_hash TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);
CREATE INDEX device_tokens_device ON device_tokens (device_id);

-- Ein Event = eine Vermietung mit Galerie. Uploads nur vom zugewiesenen Gerät, nur solange nicht archiviert.
CREATE TABLE events (
  id              TEXT PRIMARY KEY,
  booking_id      TEXT REFERENCES bookings(id),
  device_id       TEXT REFERENCES devices(id),
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  event_day       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed', 'archived')),
  retention_until TEXT NOT NULL,                       -- danach werden die Fotos automatisch gelöscht (Tag, Europe/Zurich)
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX events_device ON events (device_id, status);
CREATE INDEX events_booking ON events (booking_id);
-- Pro Gerät höchstens ein aktives Event (die Fotobox weiss so immer eindeutig, wohin ihre Fotos gehören)
CREATE UNIQUE INDEX events_ein_aktives_pro_geraet ON events (device_id) WHERE status = 'active';

CREATE TABLE photos (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events(id),
  device_id       TEXT NOT NULL REFERENCES devices(id),
  client_photo_id TEXT NOT NULL,                       -- Kennung der Fotobox (gegen doppelte Uploads)
  token_hash      TEXT NOT NULL UNIQUE,                -- SHA-256 des Gäste-Links /f/<token>
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'deleted')),
  web_key         TEXT NOT NULL,
  thumb_key       TEXT NOT NULL,
  web_bytes       INTEGER NOT NULL CHECK (web_bytes > 0),
  thumb_bytes     INTEGER NOT NULL CHECK (thumb_bytes > 0),
  web_sha256      TEXT NOT NULL,
  thumb_sha256    TEXT NOT NULL,
  web_ok          INTEGER NOT NULL DEFAULT 0 CHECK (web_ok IN (0, 1)),
  thumb_ok        INTEGER NOT NULL DEFAULT 0 CHECK (thumb_ok IN (0, 1)),
  reservation_id  TEXT,                                -- Speicherreservierung bis zum Abschluss
  taken_at        TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ready_at        TEXT,
  deleted_at      TEXT,
  UNIQUE (device_id, client_photo_id)
);
CREATE INDEX photos_event ON photos (event_id, status);

INSERT INTO settings (key, value) VALUES
  ('photo_max_bytes', '8000000'),     -- höchstens 8 MB pro Bild (Web-Version ca. 0.4 MB)
  ('thumb_max_bytes', '400000');      -- Vorschau höchstens 400 KB
