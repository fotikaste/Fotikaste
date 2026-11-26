import { describe, expect, it } from "vitest";
import { chf, fahrtRappen, findeZone, geschaetzteKm, luftlinieKm, zusatztage, type Zone } from "../../worker/lib/preis";
import { heuteZurich, istTag, plusTage, tageVonBis, tageZwischen } from "../../worker/lib/datum";
import { abschreibung, csv, fixkostenAnteil, jahresauswertung, proBuchung } from "../../worker/lib/wirtschaft";
import { packages, terms } from "../../src/data/content";
import { readFileSync } from "node:fs";

const ZONE = { base_rappen: 5000, included_km: 20, per_km_rappen: 120 };

describe("Fahrtkosten (PREISE.md)", () => {
  it("bis 20 km pauschal CHF 50", () => {
    expect(fahrtRappen(0, ZONE)).toBe(5000);
    expect(fahrtRappen(20, ZONE)).toBe(5000);
  });
  it("Beispiel 35 km = CHF 68", () => expect(fahrtRappen(35, ZONE)).toBe(6800));
  it("21 km = CHF 51.20", () => expect(fahrtRappen(21, ZONE)).toBe(5120));
  it("km werden aufgerundet (Luftlinie × 1.3)", () => {
    expect(geschaetzteKm(10, 1.3)).toBe(13);
    expect(geschaetzteKm(10.01, 1.3)).toBe(14);
  });
  it("Luftlinie: 1 Breitengrad ≈ 111 km", () => expect(Math.round(luftlinieKm({ lat: 47, lon: 9 }, { lat: 48, lon: 9 }))).toBe(111));
});

describe("Mietdauer", () => {
  it("2 Tage inbegriffen, danach Zusatztage", () => {
    expect(zusatztage(1, 2)).toBe(0);
    expect(zusatztage(2, 2)).toBe(0);
    expect(zusatztage(4, 2)).toBe(2);
  });
});

describe("Liefergebiet", () => {
  const z = (id: number, cantons: string[], plz_ranges: [string, string][] = []): Zone => ({ id, name: `Z${id}`, cantons, plz_ranges, max_km: null, ...ZONE, pickup_allowed: 1, instant_booking: 1, min_lead_days: 7, buffer_days_before: 0, buffer_days_after: 0 });
  it("PLZ-Bereich hat Vorrang vor Kanton", () => {
    expect(findeZone([z(1, ["TG"]), z(2, [], [["8500", "8599"]])], "8500", "TG")?.id).toBe(2);
  });
  it("Kanton passt", () => expect(findeZone([z(1, ["TG", "ZH"])], "8001", "ZH")?.id).toBe(1));
  it("ausserhalb → keine Zone", () => expect(findeZone([z(1, ["TG"])], "3000", "BE")).toBeNull());
  it("unbekannte PLZ → keine Zone", () => expect(findeZone([z(1, ["TG"])], "9999", null)).toBeNull());
});

describe("Datum (Europe/Zurich)", () => {
  it("Mitternacht in Zürich ist schon der nächste Tag", () => {
    expect(heuteZurich(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01"); // Sommerzeit UTC+2
    expect(heuteZurich(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01"); // Winterzeit UTC+1
  });
  it("Tage rechnen über Sommerzeitwechsel", () => {
    expect(tageZwischen("2027-03-27", "2027-03-29")).toBe(2);
    expect(plusTage("2027-10-30", 2)).toBe("2027-11-01");
    expect(tageVonBis("2027-02-27", "2027-03-01")).toEqual(["2027-02-27", "2027-02-28", "2027-03-01"]);
  });
  it("ungültige Daten abgelehnt", () => {
    expect(istTag("2027-02-30")).toBe(false);
    expect(istTag("2027-2-3")).toBe(false);
    expect(istTag("2027-02-28")).toBe(true);
  });
});

describe("Wirtschaftlichkeit (reine Rechnung)", () => {
  const b = { id: "x", number: "FK-1", event_day: "2027-06-12", status: "completed", package_name: "Premium", total_rappen: 50000, bezahlt_rappen: 50000, prints: 200, km: 80, minutes: 360, direkte_ausgaben_rappen: 1000 };
  it("Abschreibung linear in ganzen Jahren, Summe = Kaufpreis", () => {
    const a = { purchased_on: "2026-03-01", amount_rappen: 100000, life_years: 3 };
    expect([2025, 2026, 2027, 2028, 2029].map((j) => abschreibung(a, j))).toEqual([0, 33333, 33333, 33334, 0]);
  });
  it("Fixkosten anteilig nach Tagen", () => {
    expect(fixkostenAnteil({ amount_rappen_year: 36500, valid_from: "2027-01-01", valid_to: null }, 2027)).toBe(36500);
    expect(fixkostenAnteil({ amount_rappen_year: 36500, valid_from: "2027-07-02", valid_to: null }, 2027)).toBe(18300); // 183 Tage
    expect(fixkostenAnteil({ amount_rappen_year: 36500, valid_from: "2028-01-01", valid_to: null }, 2027)).toBe(0);
  });
  it("pro Buchung: Material, Fahrzeug, Deckungsbeitrag, pro Stunde; Ansatz offen = nicht geschätzt", () => {
    const x = proBuchung(b, { material_pro_abzug: 15, pro_km: 70, pro_stunde: 4000 });
    expect([x.material, x.fahrzeug, x.arbeit, x.deckungsbeitrag, x.pro_stunde]).toEqual([3000, 5600, 24000, 40400, 6733]);
    const y = proBuchung({ ...b, km: null }, { material_pro_abzug: 15, pro_km: null, pro_stunde: null });
    expect([y.fahrzeug, y.arbeit, y.aufwand_fehlt]).toEqual([null, null, true]);
  });
  it("Jahr: Ergebnis, offene Beträge, Break-even, offene Ansätze", () => {
    const j = jahresauswertung({
      jahr: 2027, heute: "2027-12-31", ansaetze: { material_pro_abzug: 15, pro_km: null, pro_stunde: 4000 },
      buchungen: [b, { ...b, id: "y", number: "FK-2", bezahlt_rappen: 20000 }], eingenommen: 70000,
      ausgaben: [{ amount_rappen: 1000, category: "material", booking_id: "x" }, { amount_rappen: 5000, category: "werbung", booking_id: null }],
      anlagen: [{ purchased_on: "2027-01-10", amount_rappen: 300000, life_years: 3 }], fixkosten: [{ amount_rappen_year: 20000, valid_from: "2027-01-01", valid_to: null }],
    });
    expect([j.gebucht, j.offen, j.material, j.ausgaben, j.abschreibung, j.fixkosten]).toEqual([100000, 30000, 6000, 6000, 100000, 20000]);
    expect(j.ergebnis_geld).toBe(70000 - 6000 - 6000 - 20000 - 100000);
    expect(j.ergebnis_kalkulatorisch).toBeNull(); // km-Ansatz offen
    expect(j.offene_ansaetze).toEqual(["Fahrzeugkosten pro km"]);
    expect(j.break_even.kosten_fix).toBe(20000 + 100000 + 5000);
    expect(j.break_even.db_durchschnitt).toBe(46000); // 50000 − 3000 − 1000 (beide Buchungen tragen die direkte Ausgabe von «x»)
    expect(j.break_even.buchungen_noetig).toBe(3);
  });
  it("CSV: Semikolon, BOM, keine Formeln (CSV-Injection)", () => {
    const t = csv([["Datum", "Text"], ["2027-01-01", "=HYPERLINK(1)"], ["2027-01-02", "a;b"], ["2027-01-03", "-12.50"]]);
    expect(t.startsWith("\uFEFF")).toBe(true);
    expect(t).toContain("'=HYPERLINK(1)");
    expect(t).toContain('"a;b"');
    expect(t).toContain("2027-01-03;-12.50");
  });
});

describe("Webseite und Datenbank zeigen dieselben Preise", () => {
  const sql = readFileSync("migrations/0002_buchung.sql", "utf8");
  for (const p of packages) {
    it(`${p.name}: CHF ${p.priceChf}`, () => expect(sql).toMatch(new RegExp(`\\('${p.slug}',\\s*'${p.name}',\\s*${p.priceChf * 100},\\s*${p.prints ?? "NULL"}`)));
  }
  it("Zusatztag, Storno-Option, Fahrt", () => {
    expect(sql).toContain(`('booking_extra_day_rappen', '${terms.extraDayChf * 100}')`);
    expect(sql).toContain(`('booking_included_days', '${terms.includedDays}')`);
    expect(sql).toContain(`('flex_cancel_rappen', '${terms.flexCancelChf * 100}')`);
    expect(sql).toContain(`('flex_cancel_days', '${terms.flexCancelDays}')`);
    expect(sql).toContain(`${terms.delivery.baseChf * 100}, ${terms.delivery.includedKm}, ${Math.round(terms.delivery.perKmChf * 100)})`);
  });
  it("Schweizer Schreibweise", () => expect(chf(125000)).toBe("CHF 1'250.00"));
});

describe("Postleitzahlen (amtliches Verzeichnis, Migration 0003)", () => {
  const sql = readFileSync("migrations/0003_postleitzahlen.sql", "utf8");
  it("enthält Ausgangsort und Hauptorte mit Kanton", () => {
    expect(sql).toMatch(/\('8370', 'Sirnach', 'TG', 47\.\d+, 8\.\d+\)/);
    expect(sql).toMatch(/\('8500', 'Frauenfeld', 'TG',/);
    expect(sql).toMatch(/\('8001', 'Zürich', 'ZH',/);
  });
  it("Sirnach → Frauenfeld 17 km (Pauschale CHF 50), Sirnach → Zürich 47 km (CHF 82.40)", () => {
    const koord = (plz: string) => { const m = sql.match(new RegExp(`\\('${plz}', '[^']+', '[A-Z]*', ([0-9.]+), ([0-9.]+)\\)`))!; return { lat: Number(m[1]), lon: Number(m[2]) }; };
    expect(geschaetzteKm(luftlinieKm(koord("8370"), koord("8500")), 1.3)).toBe(17);
    expect(geschaetzteKm(luftlinieKm(koord("8370"), koord("8001")), 1.3)).toBe(47);
    expect(fahrtRappen(47, ZONE)).toBe(8240);
  });
});
