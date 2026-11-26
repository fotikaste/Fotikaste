-- Phase 4: Administration – Inhalte ohne Code, Kundennotizen, Sperrtage.
-- Startwerte = bisherige Inhalte aus src/data/content.ts (keine neuen Angaben erfunden).

-- Leistungen je Paket (Aufzählung auf Preis- und Startseite)
CREATE TABLE package_features (
  package_slug TEXT NOT NULL REFERENCES packages(slug) ON DELETE CASCADE,
  pos          INTEGER NOT NULL,
  text         TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 120),
  PRIMARY KEY (package_slug, pos)
);
INSERT INTO package_features (package_slug, pos, text) VALUES
  ('essential', 1, 'Fotobox mit Spiegelreflexkamera'), ('essential', 2, 'Online-Galerie und QR-Download'), ('essential', 3, 'Rahmen und Layouts inbegriffen'), ('essential', 4, 'ohne Drucker'),
  ('premium', 1, 'Sofortdruck 10 × 15 cm'), ('premium', 2, '300 Abzüge inbegriffen'), ('premium', 3, 'Online-Galerie und QR-Download'), ('premium', 4, 'Rahmen und Layouts inbegriffen'),
  ('signature', 1, 'Sofortdruck 10 × 15 cm'), ('signature', 2, '600 Abzüge inbegriffen'), ('signature', 3, 'Online-Galerie und QR-Download'), ('signature', 4, 'Rahmen und Layouts inbegriffen');

-- Häufige Fragen. Platzhalter in geschweiften Klammern werden beim Erzeugen der Webseite ersetzt
-- ({marke}, {preis:essential}, {zusatztag}, {fahrt_pauschale}, {fahrt_inkl_km}, {fahrt_pro_km}, {storno}, {storno_tage}, {miettage}, {ausgangsort}).
CREATE TABLE faqs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL CHECK (length(question) BETWEEN 5 AND 200),
  answer   TEXT NOT NULL CHECK (length(answer) BETWEEN 5 AND 2000),
  sort     INTEGER NOT NULL DEFAULT 0,
  visible  INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  locale   TEXT NOT NULL DEFAULT 'de-CH'
);
INSERT INTO faqs (question, answer, sort) VALUES
  ('Was kostet eine Fotobox bei {marke}?', 'Essential kostet {preis:essential} (ohne Drucker, mit Online-Galerie), Premium {preis:premium} (mit Drucker und 300 Abzügen) und Signature {preis:signature} (mit Drucker und 600 Abzügen). Die Miete gilt für bis zu {miettage} Tage, jeder weitere Tag kostet {zusatztag}. Lieferung und Abholung kosten zusammen {fahrt_pauschale} bis {fahrt_inkl_km} km ab {ausgangsort}, darüber {fahrt_pro_km} pro km.', 10),
  ('In welchen Regionen liefert {marke}?', 'In der Ostschweiz und im Kanton Zürich: Thurgau, St. Gallen, beide Appenzell, Schaffhausen, Glarus und Zürich. Die Lieferkosten richten sich nach der Entfernung und werden vor der Buchung angezeigt.', 20),
  ('Wie funktioniert die Buchung?', 'Sie wählen Ihr Eventdatum, sehen sofort die Verfügbarkeit, wählen Paket und Extras und buchen verbindlich online. Sie erhalten die Bestätigung sofort per E-Mail. Online wird nichts bezahlt – die Zahlung vereinbaren wir danach per E-Mail oder persönlich.', 30),
  ('Wie bekommen die Gäste ihre Fotos?', 'Jedes Foto wird sofort als Postkarte 10 × 15 cm gedruckt. Auf Wunsch zeigt die Fotobox einen QR-Code, über den der Gast nur sein eigenes Foto auf das Handy lädt.', 40),
  ('Wer sieht die Fotos meines Anlasses?', 'Standardmässig nur die Person, die ein Foto aufgenommen hat, über ihren persönlichen QR-Code. Eine gemeinsame Galerie für alle Gäste schalten Sie als Veranstalter bewusst frei, auf Wunsch mit Passwort.', 50),
  ('Wie lange bleiben die Fotos online?', 'Standardmässig 30 Tage. Vor der Löschung erhalten Sie eine Erinnerung per E-Mail. Die Originalbilder bleiben bei uns auf der Fotobox und können auf Wunsch separat bereitgestellt werden.', 60),
  ('Braucht die Fotobox Internet am Veranstaltungsort?', 'Nein. Fotografieren und Drucken funktionieren ohne Internet. Ohne Verbindung werden die Fotos später automatisch in die Online-Galerie geladen; das sagt die Fotobox den Gästen auch ehrlich.', 70),
  ('Wie viel Platz und Strom braucht die Fotobox?', 'Die genauen Masse und den Strombedarf veröffentlichen wir, sobald die finale Fotobox vermessen ist.', 80);

-- Technische Angaben zur Fotobox. value NULL = noch offen (wird auf der Webseite als «folgt» gezeigt, nie erfunden).
CREATE TABLE product_facts (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE CHECK (length(label) BETWEEN 1 AND 60),
  value TEXT CHECK (value IS NULL OR length(value) BETWEEN 1 AND 200),
  sort  INTEGER NOT NULL DEFAULT 0
);
INSERT INTO product_facts (label, value, sort) VALUES
  ('Kamera', 'Canon EOS 600D (Spiegelreflex)', 10),
  ('Druck', 'Postkarte 10 × 15 cm, Sofortdruck (DNP DS620)', 20),
  ('Digital', 'Jedes Foto per QR-Code aufs Handy', 30),
  ('Bedienung', 'Touchscreen, ohne Anleitung verständlich', 40),
  ('Licht', 'Dauerbeleuchtung', 50),
  ('Platzbedarf', NULL, 60),
  ('Strom', NULL, 70),
  ('Aufbauzeit', NULL, 80),
  ('Abmessungen', NULL, 90);

-- Notizen und Kommunikationshistorie zu Kunden (nur intern)
CREATE TABLE customer_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  author      TEXT NOT NULL,
  text        TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 4000)
);
CREATE INDEX customer_notes_customer ON customer_notes (customer_id);

-- Bemerkung zu Sperrtagen/Wartung (z. B. «Ferien»)
ALTER TABLE allocations ADD COLUMN note TEXT;

-- Webseite aktualisieren: wann wurden Inhalte zuletzt geändert, wann wurde die Webseite zuletzt erzeugt?
INSERT INTO settings (key, value) VALUES
  ('content_changed_at', 'null'),
  ('site_built_at', 'null');
