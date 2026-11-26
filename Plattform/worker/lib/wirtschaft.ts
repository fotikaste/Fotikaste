/**
 * Wirtschaftlichkeit (Phase 6). Reine Rechenfunktionen ohne Datenbank, damit sie einzeln getestet werden können.
 * Alle Beträge in Rappen. Ansätze, die noch nicht festgelegt sind (null), werden NICHT geschätzt, sondern als «offen» gemeldet.
 */

export interface Buchung { id: string; number: string; event_day: string; status: string; package_name: string; total_rappen: number; bezahlt_rappen: number; prints: number | null; km: number | null; minutes: number | null; direkte_ausgaben_rappen: number }
export interface Ansaetze { material_pro_abzug: number; pro_km: number | null; pro_stunde: number | null }
export interface Anlage { purchased_on: string; amount_rappen: number; life_years: number }
export interface Fixkosten { amount_rappen_year: number; valid_from: string; valid_to: string | null }

const tageImJahr = (jahr: number) => ((jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0 ? 366 : 365);
const tag = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;

/** Abschreibung linear in ganzen Jahren ab dem Anschaffungsjahr (einfach und nachvollziehbar). */
export function abschreibung(a: Anlage, jahr: number): number {
  const start = Number(a.purchased_on.slice(0, 4));
  if (jahr < start || jahr >= start + a.life_years) return 0;
  const basis = Math.floor(a.amount_rappen / a.life_years);
  // Rundungsrest im letzten Jahr, damit die Summe genau dem Kaufpreis entspricht
  return jahr === start + a.life_years - 1 ? a.amount_rappen - basis * (a.life_years - 1) : basis;
}

/** Fixkosten anteilig nach Tagen, die in das Jahr fallen. */
export function fixkostenAnteil(f: Fixkosten, jahr: number): number {
  const von = Math.max(tag(f.valid_from), tag(`${jahr}-01-01`));
  const bis = Math.min(f.valid_to ? tag(f.valid_to) : Infinity, tag(`${jahr}-12-31`));
  if (bis < von) return 0;
  return Math.round((f.amount_rappen_year * (bis - von + 1)) / tageImJahr(jahr));
}

export interface ProBuchung extends Buchung {
  material: number;
  fahrzeug: number | null;
  arbeit: number | null;
  deckungsbeitrag: number;          // Umsatz − Material − direkte Ausgaben − Fahrzeug (falls Ansatz bekannt)
  pro_stunde: number | null;        // Deckungsbeitrag pro Arbeitsstunde
  aufwand_fehlt: boolean;
}

export function proBuchung(b: Buchung, a: Ansaetze): ProBuchung {
  const material = (b.prints ?? 0) * a.material_pro_abzug;
  const fahrzeug = b.km === null || a.pro_km === null ? null : b.km * a.pro_km;
  const arbeit = b.minutes === null || a.pro_stunde === null ? null : Math.round((b.minutes / 60) * a.pro_stunde);
  const deckungsbeitrag = b.total_rappen - material - b.direkte_ausgaben_rappen - (fahrzeug ?? 0);
  return {
    ...b, material, fahrzeug, arbeit, deckungsbeitrag,
    pro_stunde: b.minutes ? Math.round(deckungsbeitrag / (b.minutes / 60)) : null,
    aufwand_fehlt: b.prints === null || b.km === null || b.minutes === null,
  };
}

export interface Jahr {
  jahr: number;
  gebucht: number; eingenommen: number; offen: number; anzahl: number;
  material: number; ausgaben: number; ausgaben_nach_kategorie: Record<string, number>; fixkosten: number; abschreibung: number;
  fahrzeug: number | null; arbeit: number | null; km: number; stunden: number;
  ergebnis_geld: number;            // Eingenommen − Material − Ausgaben − Fixkosten − Abschreibung
  ergebnis_kalkulatorisch: number | null;  // zusätzlich minus Fahrzeug und eigene Arbeit (nur wenn beide Ansätze bekannt)
  stundenlohn: number | null;       // (Ergebnis Geld − Fahrzeug) pro Arbeitsstunde
  break_even: { kosten_fix: number; db_durchschnitt: number | null; buchungen_noetig: number | null };
  offene_ansaetze: string[];
  buchungen: ProBuchung[];
}

export function jahresauswertung(p: {
  jahr: number; heute: string; ansaetze: Ansaetze; buchungen: Buchung[]; eingenommen: number;
  ausgaben: { amount_rappen: number; category: string; booking_id: string | null }[]; anlagen: Anlage[]; fixkosten: Fixkosten[];
}): Jahr {
  const bs = p.buchungen.map((b) => proBuchung(b, p.ansaetze));
  const summe = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const kat: Record<string, number> = {};
  for (const x of p.ausgaben) kat[x.category] = (kat[x.category] ?? 0) + x.amount_rappen;
  const material = summe(bs.map((b) => b.material));
  const ausgaben = summe(p.ausgaben.map((x) => x.amount_rappen));
  const fix = summe(p.fixkosten.map((f) => fixkostenAnteil(f, p.jahr)));
  const abschr = summe(p.anlagen.map((a) => abschreibung(a, p.jahr)));
  const km = summe(bs.map((b) => b.km ?? 0));
  const minuten = summe(bs.map((b) => b.minutes ?? 0));
  const fahrzeug = p.ansaetze.pro_km === null ? null : km * p.ansaetze.pro_km;
  const arbeit = p.ansaetze.pro_stunde === null ? null : Math.round((minuten / 60) * p.ansaetze.pro_stunde);
  const ergebnis = p.eingenommen - material - ausgaben - fix - abschr;
  const mitAufwand = bs.filter((b) => !b.aufwand_fehlt);
  const kostenFix = fix + abschr + summe(p.ausgaben.filter((x) => !x.booking_id).map((x) => x.amount_rappen));
  const db = mitAufwand.length ? Math.round(summe(mitAufwand.map((b) => b.deckungsbeitrag)) / mitAufwand.length) : null;
  const offen: string[] = [];
  if (p.ansaetze.pro_km === null) offen.push("Fahrzeugkosten pro km");
  if (p.ansaetze.pro_stunde === null) offen.push("eigener Stundenansatz");
  return {
    jahr: p.jahr,
    gebucht: summe(bs.map((b) => b.total_rappen)),
    eingenommen: p.eingenommen,
    offen: summe(bs.filter((b) => b.event_day <= p.heute).map((b) => Math.max(0, b.total_rappen - b.bezahlt_rappen))),
    anzahl: bs.length,
    material, ausgaben, ausgaben_nach_kategorie: kat, fixkosten: fix, abschreibung: abschr,
    fahrzeug, arbeit, km, stunden: Math.round((minuten / 60) * 10) / 10,
    ergebnis_geld: ergebnis,
    ergebnis_kalkulatorisch: fahrzeug === null || arbeit === null ? null : ergebnis - fahrzeug - arbeit,
    stundenlohn: minuten > 0 && fahrzeug !== null ? Math.round((ergebnis - fahrzeug) / (minuten / 60)) : null,
    break_even: { kosten_fix: kostenFix, db_durchschnitt: db, buchungen_noetig: db && db > 0 ? Math.ceil(kostenFix / db) : null },
    offene_ansaetze: offen,
    buchungen: bs,
  };
}

/** CSV für Treuhand/Steuern: Semikolon, Dezimalpunkt, UTF-8 mit BOM (Excel öffnet Umlaute korrekt). */
export function csv(zeilen: (string | number | null)[][]): string {
  const feld = (v: string | number | null) => {
    const t = v === null ? "" : String(v);
    // Formeln in Tabellenprogrammen verhindern (CSV-Injection) und Trennzeichen schützen
    const sicher = /^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t) ? `'${t}` : t;
    return /[;"\n\r]/.test(sicher) ? `"${sicher.replace(/"/g, '""')}"` : sicher;
  };
  return "﻿" + zeilen.map((z) => z.map(feld).join(";")).join("\r\n") + "\r\n";
}
