-- NUR LOKALE ENTWICKLUNG – TESTDATEN, NICHT FÜR PRODUKTION.
-- Wenige Postleitzahlen mit UNGEFÄHREN Koordinaten (auf 2 Nachkommastellen gerundet), damit Fahrtkosten lokal vorgeführt werden können.
-- Für Produktion: offizielles Verzeichnis importieren (tools/plz-import.mjs, docs/BUCHUNG.md).
INSERT OR IGNORE INTO postal_codes (plz, ort, kanton, lat, lon) VALUES
  ('8370', 'Sirnach', 'TG', 47.46, 9.00),
  ('8500', 'Frauenfeld', 'TG', 47.56, 8.90),
  ('9000', 'St. Gallen', 'SG', 47.42, 9.38),
  ('8001', 'Zürich', 'ZH', 47.37, 8.54),
  ('3011', 'Bern', 'BE', 46.95, 7.45);
