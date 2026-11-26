// Wandelt das offizielle Ortschaftenverzeichnis (swisstopo, CSV mit WGS84-Koordinaten) in SQL für die Tabelle postal_codes um.
// Aufruf: node tools/plz-import.mjs <pfad-zur-csv> > plz.sql   →   npx wrangler d1 execute DB --local --file plz.sql
// Die CSV wird NICHT automatisch heruntergeladen (Download nur nach Freigabe, siehe docs/BUCHUNG.md).
// Erwartete Spalten (Semikolon getrennt): Ortschaftsname, PLZ, Kantonskürzel, E (Längengrad), N (Breitengrad).
import { readFileSync } from "node:fs";

const datei = process.argv[2];
if (!datei) {
  console.error("Bitte Pfad zur CSV angeben.");
  process.exit(1);
}
const zeilen = readFileSync(datei, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const kopf = zeilen[0].split(";").map((s) => s.trim());
const spalte = (name) => {
  const i = kopf.findIndex((k) => k.toLowerCase() === name.toLowerCase());
  if (i < 0) throw new Error(`Spalte «${name}» fehlt. Gefunden: ${kopf.join(", ")}`);
  return i;
};
const [iOrt, iPlz, iKt, iE, iN] = ["Ortschaftsname", "PLZ", "Kantonskürzel", "E", "N"].map(spalte);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const werte = [];
for (const z of zeilen.slice(1)) {
  const c = z.split(";");
  const plz = c[iPlz]?.trim();
  const lon = Number(c[iE]);
  const lat = Number(c[iN]);
  if (!/^\d{4}$/.test(plz ?? "")) continue;
  // Plausibilität: Schweiz liegt etwa zwischen 45.8–47.9° N und 5.9–10.5° O. Sonst falsches Koordinatensystem (z. B. LV95).
  if (!(lat > 45.7 && lat < 47.9 && lon > 5.8 && lon < 10.6)) throw new Error(`Koordinaten ausserhalb der Schweiz in Zeile: ${z}\nBitte die WGS84-Version der CSV verwenden.`);
  werte.push(`(${q(plz)}, ${q(c[iOrt].trim())}, ${q(c[iKt].trim())}, ${lat.toFixed(5)}, ${lon.toFixed(5)})`);
}
console.log("-- Import aus dem offiziellen Ortschaftenverzeichnis");
for (let i = 0; i < werte.length; i += 200) console.log(`INSERT OR REPLACE INTO postal_codes (plz, ort, kanton, lat, lon) VALUES\n${werte.slice(i, i + 200).join(",\n")};`);
console.error(`${werte.length} Einträge erzeugt.`);
