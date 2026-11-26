-- Phase 6 (neu definiert vom Inhaber, 2026-11-26): KEINE Zahlungsfunktion, keine Rechnungen, keine Bankdaten, keine Erinnerungen.
-- Zahlung wird immer persönlich vereinbart. Die Plattform hält nur fest, was der Inhaber selbst einträgt,
-- und rechnet daraus die Wirtschaftlichkeit (Kosten und Aufwände).

-- Zahlungseingänge – nur von Hand erfasst (negativ = Rückerstattung)
CREATE TABLE payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id    TEXT NOT NULL REFERENCES bookings(id),
  paid_on       TEXT NOT NULL,                                -- Tag 'YYYY-MM-DD'
  amount_rappen INTEGER NOT NULL CHECK (amount_rappen != 0 AND abs(amount_rappen) <= 10000000),
  method        TEXT NOT NULL CHECK (method IN ('bar', 'twint', 'ueberweisung', 'andere')),
  note          TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX payments_booking ON payments (booking_id);
CREATE INDEX payments_day ON payments (paid_on);

-- Bisher als «bezahlt» markierte Zahlungsplan-Zeilen übernehmen, dann den Zahlungsplan entfernen
INSERT INTO payments (booking_id, paid_on, amount_rappen, method, note, created_by)
  SELECT booking_id, strftime('%Y-%m-%d', 'now'), amount_rappen, 'andere', 'übernommen aus früherem Zahlungsplan (Datum unbekannt)', 'migration'
  FROM payment_schedule WHERE status = 'paid' AND amount_rappen > 0;
DROP TABLE payment_schedule;
DELETE FROM settings WHERE key IN ('deposit_percent', 'security_deposit_rappen', 'payment_due_days_before', 'payment_due_before_event');

-- Aufwand pro Buchung (von Hand; leer = noch nicht erfasst)
CREATE TABLE booking_effort (
  booking_id  TEXT PRIMARY KEY REFERENCES bookings(id),
  prints      INTEGER CHECK (prints IS NULL OR prints BETWEEN 0 AND 10000),       -- gedruckte Abzüge
  km          INTEGER CHECK (km IS NULL OR km BETWEEN 0 AND 5000),                -- tatsächlich gefahrene km (alle Fahrten)
  minutes     INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 10000),     -- Zeitaufwand (Vorbereitung, Fahrt, Aufbau, Abbau, Nacharbeit)
  note        TEXT CHECK (note IS NULL OR length(note) <= 500),
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Einzelne Ausgaben mit Beleg-Hinweis (optional einer Buchung zugeordnet)
CREATE TABLE expenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  spent_on      TEXT NOT NULL,
  amount_rappen INTEGER NOT NULL CHECK (amount_rappen > 0 AND amount_rappen <= 10000000),
  category      TEXT NOT NULL CHECK (category IN ('material', 'fahrzeug', 'reparatur', 'werbung', 'software', 'versicherung', 'gebuehren', 'anderes')),
  description   TEXT NOT NULL CHECK (length(description) BETWEEN 2 AND 200),
  receipt_ref   TEXT CHECK (receipt_ref IS NULL OR length(receipt_ref) <= 80),  -- wo liegt der Beleg (z. B. «Ordner 2027 / Nr. 12»)
  booking_id    TEXT REFERENCES bookings(id),
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX expenses_day ON expenses (spent_on);

-- Anschaffungen (Fotobox, Kamera, Drucker …) mit linearer Abschreibung über die Nutzungsdauer
CREATE TABLE assets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  purchased_on  TEXT NOT NULL,
  amount_rappen INTEGER NOT NULL CHECK (amount_rappen > 0 AND amount_rappen <= 100000000),
  life_years    INTEGER NOT NULL CHECK (life_years BETWEEN 1 AND 20),
  note          TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Wiederkehrende Fixkosten pro Jahr (Versicherung, Domain, Lagerplatz …)
CREATE TABLE fixed_costs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  amount_rappen_year INTEGER NOT NULL CHECK (amount_rappen_year > 0 AND amount_rappen_year <= 10000000),
  valid_from         TEXT NOT NULL,       -- Tag
  valid_to           TEXT,                -- NULL = läuft weiter
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Ansätze für kalkulatorische Kosten – bewusst leer, bis der Inhaber sie festlegt (nichts erfinden)
INSERT INTO settings (key, value) VALUES
  ('cost_per_km_rappen', 'null'),     -- eigene Fahrzeugkosten pro km
  ('hourly_rate_rappen', 'null');     -- eigener Stundenansatz
