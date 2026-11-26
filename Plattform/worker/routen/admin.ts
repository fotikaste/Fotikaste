/**
 * Admin-Oberfläche (/admin/…): Seiten (GET) und Formular-Aktionen (POST → 303 zurück).
 * Jede Route prüft zuerst das Recht über verlangeRecht(). Die Herkunftsprüfung für POST passiert zentral in index.ts.
 */
import type { Env } from "../env";
import { verlangeRecht, type AdminUser } from "../lib/auth";
import { istFehler, type Fehler } from "../lib/buchung";
import { html } from "../lib/http";
import type { Permission } from "../lib/permissions";
import { bestaetige, lehneAb } from "../admin/buchungen";
import { kontakt, notiz, positionHinzu, positionWeg, setzeStatus, verschiebe, zahlung } from "../admin/buchung-aktionen";
import { buchungsDetail, buchungsListe } from "../admin/buchungen-seiten";
import { hebeAuf, kalenderSeite, sperre } from "../admin/kalender";
import { einstellungenSeite, preiseSeite, speichereEinstellungen, speicherePaket, speichereZone } from "../admin/katalog";
import { kundenDetail, kundenListe, kundenName, kundenNotiz } from "../admin/kunden";
import { aktualisiereWebseite, inhalteSeite, loescheFaq, speichereFakten, speichereFaq, speichereLeistungen } from "../admin/inhalte";
import { formFehler, formular, MELDUNGEN, rappenAus, zurueck } from "../admin/layout";
import { uebersicht } from "../admin/seite";
import { adminFoto, eventAnlegen, eventDetail, eventGeraet, eventStatus, eventsSeite, geraetAnlegen, geraeteSeite, geraetToken, geraetWiderrufen } from "../admin/fotobox";

type Seite = (env: Env, u: AdminUser, url: URL) => Promise<string | null>;
type Aktion = (env: Env, u: AdminUser, form: Map<string, string>, teile: string[], url: URL) => Promise<Fehler | Record<string, unknown>>;

const SEITEN: [RegExp, Permission, Seite][] = [
  [/^\/admin$/, "admin:view", uebersicht],
  [/^\/admin\/buchungen$/, "bookings:read", buchungsListe],
  [/^\/admin\/buchungen\/([0-9a-f]{32})$/, "bookings:read", (e, u, url) => buchungsDetail(e, u, url.pathname.split("/")[3]!, url)],
  [/^\/admin\/kalender$/, "bookings:read", kalenderSeite],
  [/^\/admin\/kunden$/, "bookings:read", kundenListe],
  [/^\/admin\/kunden\/([0-9a-f]{32})$/, "bookings:read", (e, u, url) => kundenDetail(e, u, url.pathname.split("/")[3]!, url)],
  [/^\/admin\/geraete$/, "devices:manage", (e, u, url) => geraeteSeite(e, u, url)],
  [/^\/admin\/events$/, "devices:manage", eventsSeite],
  [/^\/admin\/events\/([0-9a-f]{32})$/, "devices:manage", (e, u, url) => eventDetail(e, u, url.pathname.split("/")[3]!, url)],
  [/^\/admin\/preise$/, "settings:write", preiseSeite],
  [/^\/admin\/inhalte$/, "content:write", inhalteSeite],
  [/^\/admin\/einstellungen$/, "settings:write", einstellungenSeite],
];

const B = "/admin/buchungen/([0-9a-f]{32})";
const ganz = (t: string | undefined) => (t !== undefined && /^\d+$/.test(t) ? Number(t) : NaN);

/** [Muster, Recht, Aktion, Ziel nach Erfolg (aus den Teilen der Adresse), Meldungscode] */
const AKTIONEN: [RegExp, Permission, Aktion, (t: string[], f: Map<string, string>) => string, keyof typeof MELDUNGEN][] = [
  [new RegExp(`^${B}/bestaetigen$`), "bookings:write", (e, u, f, t, url) => { const fahrt = f.get("fahrt_chf"); return bestaetige(e, u, t[0]!, fahrt ? rappenAus(fahrt) ?? -1 : undefined, url.origin); }, (t) => `/admin/buchungen/${t[0]}`, "bestaetigt"],
  [new RegExp(`^${B}/ablehnen$`), "bookings:write", (e, u, _f, t) => lehneAb(e, u, t[0]!), (t) => `/admin/buchungen/${t[0]}`, "abgelehnt"],
  [new RegExp(`^${B}/stornieren$`), "bookings:write", (e, u, f, t, url) => setzeStatus(e, u, t[0]!, "cancelled", f.get("mail") === "on", url.origin), (t) => `/admin/buchungen/${t[0]}`, "storniert"],
  [new RegExp(`^${B}/abschliessen$`), "bookings:write", (e, u, _f, t, url) => setzeStatus(e, u, t[0]!, "completed", false, url.origin), (t) => `/admin/buchungen/${t[0]}`, "abgeschlossen"],
  [new RegExp(`^${B}/termin$`), "bookings:write", (e, u, f, t) => verschiebe(e, u, t[0]!, f.get("event") ?? "", f.get("start") ?? "", f.get("ende") ?? ""), (t) => `/admin/buchungen/${t[0]}`, "verschoben"],
  [new RegExp(`^${B}/position$`), "bookings:write", (e, u, f, t) => { const p = rappenAus(f.get("preis_chf"), true); return p === null ? Promise.resolve({ status: 400, code: "betrag", text: "Ungültiger Betrag (z. B. 45.00 oder -50.00)." }) : positionHinzu(e, u, t[0]!, f.get("text") ?? "", ganz(f.get("menge")), p); }, (t) => `/admin/buchungen/${t[0]}`, "gespeichert"],
  [new RegExp(`^${B}/position-weg$`), "bookings:write", (e, u, f, t) => positionWeg(e, u, t[0]!, ganz(f.get("pos"))), (t) => `/admin/buchungen/${t[0]}`, "gespeichert"],
  [new RegExp(`^${B}/zahlung$`), "bookings:write", (e, u, f, t) => zahlung(e, u, t[0]!, f.get("kind") ?? "", f.get("status") ?? ""), (t) => `/admin/buchungen/${t[0]}`, "gespeichert"],
  [new RegExp(`^${B}/kontakt$`), "bookings:write", (e, u, f, t) => kontakt(e, u, t[0]!, { name: f.get("name") ?? "", firma: f.get("firma") ?? "", email: f.get("email") ?? "", telefon: f.get("telefon") ?? "", strasse: f.get("strasse") ?? "", plz: f.get("plz") ?? "", ort: f.get("ort") ?? "", gaeste: f.get("gaeste") ?? "" }), (t) => `/admin/buchungen/${t[0]}`, "gespeichert"],
  [new RegExp(`^${B}/notiz$`), "bookings:write", (e, u, f, t) => notiz(e, u, t[0]!, f.get("text") ?? ""), (t) => `/admin/buchungen/${t[0]}`, "notiz"],
  [/^\/admin\/kalender\/sperren$/, "bookings:write", (e, u, f) => sperre(e, u, f.get("von") ?? "", f.get("bis") ?? "", f.get("art") ?? "", f.get("ressource") ?? "", f.get("notiz") ?? ""), (_t, f) => `/admin/kalender?monat=${(f.get("von") ?? "").slice(0, 7)}`, "gesperrt"],
  [/^\/admin\/kalender\/aufheben$/, "bookings:write", (e, u, f) => hebeAuf(e, u, f.get("id") ?? ""), (_t, f) => `/admin/kalender?monat=${/^\d{4}-\d{2}$/.test(f.get("monat") ?? "") ? f.get("monat") : ""}`, "freigegeben"],
  [/^\/admin\/kunden\/([0-9a-f]{32})\/notiz$/, "bookings:write", (e, u, f, t) => kundenNotiz(e, u, t[0]!, f.get("text") ?? ""), (t) => `/admin/kunden/${t[0]}`, "notiz"],
  [/^\/admin\/kunden\/([0-9a-f]{32})\/name$/, "bookings:write", (e, u, f, t) => kundenName(e, u, t[0]!, f.get("name") ?? ""), (t) => `/admin/kunden/${t[0]}`, "gespeichert"],
  [/^\/admin\/preise\/paket\/([a-z]{2,20})$/, "settings:write", (e, u, f, t) => speicherePaket(e, u, t[0]!, f), () => "/admin/preise", "gespeichert"],
  [/^\/admin\/preise\/konditionen$/, "settings:write", (e, u, f) => speichereEinstellungen(e, u, "konditionen", f), () => "/admin/preise", "gespeichert"],
  [/^\/admin\/preise\/zone(?:\/(\d+))?$/, "settings:write", (e, u, f, t) => speichereZone(e, u, t[0] ? Number(t[0]) : null, f), () => "/admin/preise", "gespeichert"],
  [/^\/admin\/einstellungen\/(zahlung|system)$/, "settings:write", (e, u, f, t) => speichereEinstellungen(e, u, t[0] as "zahlung" | "system", f), () => "/admin/einstellungen", "gespeichert"],
  [/^\/admin\/inhalte\/faq(?:\/(\d+))?$/, "content:write", (e, u, f, t) => speichereFaq(e, u, t[0] ? Number(t[0]) : null, f), () => "/admin/inhalte", "gespeichert"],
  [/^\/admin\/inhalte\/faq\/(\d+)\/loeschen$/, "content:write", (e, u, _f, t) => loescheFaq(e, u, Number(t[0])), () => "/admin/inhalte", "geloescht"],
  [/^\/admin\/inhalte\/leistungen\/([a-z]{2,20})$/, "content:write", (e, u, f, t) => speichereLeistungen(e, u, t[0]!, f.get("leistungen") ?? ""), () => "/admin/inhalte", "gespeichert"],
  [/^\/admin\/inhalte\/fakten$/, "content:write", (e, u, f) => speichereFakten(e, u, f), () => "/admin/inhalte", "gespeichert"],
  [/^\/admin\/geraete\/([0-9a-f]{32})\/widerrufen$/, "devices:manage", (e, u, _f, t) => geraetWiderrufen(e, u, t[0]!), () => "/admin/geraete", "gespeichert"],
  [/^\/admin\/events$/, "devices:manage", async (e, u, f) => { const r = await eventAnlegen(e, u, f); if ("id" in r) f.set("_neu", r.id); return r; }, (_t, f) => (f.get("_neu") ? `/admin/events/${f.get("_neu")}` : "/admin/events"), "gespeichert"],
  [/^\/admin\/events\/([0-9a-f]{32})\/(aktivieren|schliessen|archivieren)$/, "devices:manage", (e, u, _f, t) => eventStatus(e, u, t[0]!, ({ aktivieren: "active", schliessen: "closed", archivieren: "archived" } as const)[t[1] as "aktivieren" | "schliessen" | "archivieren"]), (t) => `/admin/events/${t[0]}`, "gespeichert"],
  [/^\/admin\/events\/([0-9a-f]{32})\/geraet$/, "devices:manage", (e, u, f, t) => eventGeraet(e, u, t[0]!, f.get("geraet") ?? ""), (t) => `/admin/events/${t[0]}`, "gespeichert"],
  [/^\/admin\/inhalte\/aktualisieren$/, "content:write", (e, u) => aktualisiereWebseite(e, u), () => "/admin/inhalte", "aktualisierung"],
];

export async function adminRoute(request: Request, env: Env, pfad: string): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const foto = pfad.match(/^\/admin\/events\/([0-9a-f]{32})\/foto\/([0-9a-f]{32})\/(web|thumb)$/);
    if (foto) {
      const u = await verlangeRecht(request, env, "devices:manage");
      if (u instanceof Response) return u;
      return adminFoto(env, foto[1]!, foto[2]!, foto[3] as "web" | "thumb");
    }
    for (const [muster, recht, seite] of SEITEN) {
      if (!muster.test(pfad)) continue;
      const u = await verlangeRecht(request, env, recht);
      if (u instanceof Response) return u;
      const body = await seite(env, u, url);
      return body === null ? null : html(body);
    }
    return null;
  }
  if (request.method !== "POST") return null;
  // Neues Gerät / neues Token: Seite direkt zeigen (Token erscheint genau einmal, nie in einer Adresse)
  const token = pfad === "/admin/geraete" ? [] : pfad.match(/^\/admin\/geraete\/([0-9a-f]{32})\/token$/)?.slice(1);
  if (token) {
    const u = await verlangeRecht(request, env, "devices:manage");
    if (u instanceof Response) return u;
    const r = token.length ? await geraetToken(env, u, token[0]!) : await geraetAnlegen(env, u, (await formular(request)).get("name") ?? "");
    return "code" in r ? formFehler(u, r.text, "/admin/geraete", r.status) : html(await geraeteSeite(env, u, url, r));
  }
  for (const [muster, recht, aktion, ziel, code] of AKTIONEN) {
    const m = pfad.match(muster);
    if (!m) continue;
    const u = await verlangeRecht(request, env, recht);
    if (u instanceof Response) return u;
    const form = await formular(request);
    const teile = m.slice(1).map((x) => x ?? "");
    const r = await aktion(env, u, form, teile, url);
    const zielPfad = ziel(teile, form);
    return istFehler(r) ? formFehler(u, r.text, zielPfad, r.status) : zurueck(zielPfad, code);
  }
  return null;
}
