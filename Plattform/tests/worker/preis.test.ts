import { describe, expect, it } from "vitest";
import { chf, fahrtRappen, findeZone, geschaetzteKm, luftlinieKm, zusatztage, type Zone } from "../../worker/lib/preis";
import { heuteZurich, istTag, plusTage, tageVonBis, tageZwischen } from "../../worker/lib/datum";
import { zahlungsplan } from "../../worker/lib/buchung";
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

describe("Zahlungsplan (nur Information)", () => {
  it("Standard: Gesamtbetrag nach Absprache", () => {
    expect(zahlungsplan(45000, { deposit_percent: 0, security_deposit_rappen: 0, payment_due_days_before: null }, "2027-06-12")).toEqual([{ kind: "full", amount_rappen: 45000, due_on: null }]);
  });
  it("konfigurierbar: 30 % Anzahlung, Rest 10 Tage vorher, Kaution", () => {
    expect(zahlungsplan(45000, { deposit_percent: 30, security_deposit_rappen: 20000, payment_due_days_before: 10 }, "2027-06-12")).toEqual([
      { kind: "deposit", amount_rappen: 13500, due_on: null },
      { kind: "balance", amount_rappen: 31500, due_on: "2027-06-02" },
      { kind: "security_deposit", amount_rappen: 20000, due_on: "2027-06-02" },
    ]);
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
