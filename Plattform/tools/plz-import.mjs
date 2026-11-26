// Wandelt das offizielle Ortschaftenverzeichnis (swisstopo, «AMTOVZ_CSV_WGS84») in SQL für die Tabelle postal_codes um.
// Quelle: https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip
// Aufruf: node tools/plz-import.mjs <AMTOVZ_CSV_WGS84.csv> > plz.sql   →   npx wrangler d1 execute DB --local --file plz.sql
// Spalten (Semikolon): Ortschaftsname; PLZ4; …; Kantonskürzel; Adressenanteil; E (Längengrad); N (Breitengrad); …
// Eine PLZ kann mehrere Ortschaften (Zusatzziffer) und Gemeinden umfassen. Pro PLZ gilt der Hauptort: Zusatzziffer «00»,
// darin die Gemeinde mit dem grössten Adressenanteil. Dessen Koordinate dient als Mittelpunkt für die Distanzschätzung.
// Liechtenstein hat kein Kantonskürzel (leer) → keine Zone → Anfrage.
import { readFileSync } from "node:fs";

const datei = process.argv[2];
if (!datei) {
  console.error("Bitte Pfad zur CSV angeben.");
  process.exit(1);
}
const zeilen = readFileSync(datei, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const kopf = zeilen[0].split(";").map((s) => s.trim());
const spalte = (...namen) => {
  const i = kopf.findIndex((k) => namen.some((n) => k.toLowerCase() === n.toLowerCase()));
  if (i < 0) throw new Error(`Spalte «${namen.join("/")}» fehlt. Gefunden: ${kopf.join(", ")}`);
  return i;
};
const iOrt = spalte("Ortschaftsname");
const iPlz = spalte("PLZ4", "PLZ");
const iKt = spalte("Kantonskürzel");
const iAnteil = spalte("Adressenanteil");
const iZusatz = spalte("Zusatzziffer");
const iE = spalte("E");
const iN = spalte("N");

const proPlz = new Map();
for (const z of zeilen.slice(1)) {
  const c = z.split(";");
  const plz = c[iPlz]?.trim();
  if (!/^\d{4}$/.test(plz ?? "")) continue;
  const lon = Number(c[iE]);
  const lat = Number(c[iN]);
  // Plausibilität: Schweiz/Liechtenstein liegen etwa zwischen 45.8–47.9° N und 5.9–10.5° O. Sonst falsches Koordinatensystem (z. B. LV95).
  if (!(lat > 45.7 && lat < 47.9 && lon > 5.8 && lon < 10.6)) throw new Error(`Koordinaten ausserhalb der Schweiz: ${z}\nBitte die WGS84-Version (4326) verwenden.`);
  const anteil = Number.parseFloat(String(c[iAnteil]).replace(",", ".")) || 0;
  const haupt = c[iZusatz]?.trim() === "00" ? 1 : 0;
  const bisher = proPlz.get(plz);
  if (!bisher || haupt > bisher.haupt || (haupt === bisher.haupt && anteil > bisher.anteil)) proPlz.set(plz, { plz, ort: c[iOrt].trim(), kanton: c[iKt].trim(), lat, lon, anteil, haupt });
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const werte = [...proPlz.values()].sort((a, b) => a.plz.localeCompare(b.plz)).map((r) => `(${q(r.plz)}, ${q(r.ort)}, ${q(r.kanton)}, ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)})`);
console.log("-- Import aus dem amtlichen Ortschaftenverzeichnis (swisstopo, WGS84). Eine Zeile pro PLZ (Hauptort).");
console.log("DELETE FROM postal_codes;");
for (let i = 0; i < werte.length; i += 200) console.log(`INSERT INTO postal_codes (plz, ort, kanton, lat, lon) VALUES\n${werte.slice(i, i + 200).join(",\n")};`);
console.error(`${werte.length} Postleitzahlen erzeugt (aus ${zeilen.length - 1} Zeilen).`);
