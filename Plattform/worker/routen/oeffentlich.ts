/** Öffentliche Routen: Verfügbarkeit, Buchung, Kundenportal. Alle mit Anfragebegrenzung, schreibende mit Herkunftsprüfung (zentral in index.ts). */
import type { Env } from "../env";
import { berechneAngebot, gibHoldFrei, halte, istFehler, kalender, leseWahl, schliesseAb, type Angebot, type Fehler } from "../lib/buchung";
import { istTag, tageZwischen } from "../lib/datum";
import { fehler, json } from "../lib/http";
import { clientIp } from "../lib/id";
import { buchungenVon, fordereLink, loeseEin, meldeAb, SITZUNG_SEK, sitzungsCookie, verlangeKunde } from "../lib/kunde";
import { versendeAusstehende } from "../lib/mail";
import { begrenze } from "../lib/ratelimit";
import { menschGeprueft } from "../lib/turnstile";

const antwortFehler = (e: Fehler) => fehler(e.status, e.code, e.text);

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 10_000) return null;
  try {
    const o = JSON.parse(text);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

async function limit(env: Env, request: Request, name: string, max: number, fensterSek: number): Promise<Response | null> {
  const r = await begrenze(env, `${name}:${clientIp(request)}`, max, fensterSek);
  return r.erlaubt ? null : fehler(429, "zu_viele", "Zu viele Anfragen. Bitte später erneut versuchen.");
}

/** Für den Browser: Angebot ohne interne Belegungsdetails. */
function oeffentlich(a: Angebot) {
  const { belegung: _, ...rest } = a;
  return rest;
}

export async function oeffentlicheRoute(request: Request, env: Env, pfad: string): Promise<Response | null> {
  const m = request.method;
  const origin = new URL(request.url).origin;

  if (pfad === "/api/verfuegbarkeit" && m === "GET") {
    const zu = await limit(env, request, "kalender", 300, 3600);
    if (zu) return zu;
    const q = new URL(request.url).searchParams;
    const von = q.get("von");
    const bis = q.get("bis");
    if (!istTag(von) || !istTag(bis) || tageZwischen(von, bis) < 0 || tageZwischen(von, bis) > 93) return fehler(400, "zeitraum", "Ungültiger Zeitraum (höchstens 93 Tage).");
    return json(await kalender(env, von, bis));
  }

  if (pfad === "/api/buchung/angebot" && m === "POST") {
    const zu = await limit(env, request, "angebot", 120, 3600);
    if (zu) return zu;
    const wahl = leseWahl(await body(request));
    if (istFehler(wahl)) return antwortFehler(wahl);
    const a = await berechneAngebot(env, wahl);
    return istFehler(a) ? antwortFehler(a) : json(oeffentlich(a));
  }

  if (pfad === "/api/buchung/halten" && m === "POST") {
    const zu = await limit(env, request, "halten", 10, 3600);
    if (zu) return zu;
    const b = await body(request);
    if (!(await menschGeprueft(request, env, b?.turnstile))) return fehler(403, "turnstile", "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte erneut versuchen.");
    const wahl = leseWahl(b?.wahl);
    if (istFehler(wahl)) return antwortFehler(wahl);
    const a = await berechneAngebot(env, wahl);
    if (istFehler(a)) return antwortFehler(a);
    const h = await halte(env, a);
    return istFehler(h) ? antwortFehler(h) : json({ halteId: h.id, gueltigBis: h.gueltigBis, angebot: oeffentlich(a) }, 201);
  }

  if (pfad === "/api/buchung/freigeben" && m === "POST") {
    const b = await body(request);
    if (typeof b?.halteId === "string" && /^[0-9a-f]{32}$/.test(b.halteId)) await gibHoldFrei(env, b.halteId);
    return json({ ok: true });
  }

  if (pfad === "/api/buchung/abschliessen" && m === "POST") {
    const zu = await limit(env, request, "abschluss", 10, 3600);
    if (zu) return zu;
    const b = await body(request);
    if (typeof b?.halteId !== "string" || !/^[0-9a-f]{32}$/.test(b.halteId)) return fehler(400, "halte_id", "Ungültige Reservierung.");
    const r = await schliesseAb(env, b.halteId, b.kontakt, origin);
    if (istFehler(r)) return antwortFehler(r);
    await versendeAusstehende(env);
    return json({ nummer: r.nummer, status: r.status }, 201);
  }

  if (pfad === "/api/konto/link" && m === "POST") {
    const b = await body(request);
    const email = typeof b?.email === "string" ? b.email.trim().toLowerCase().slice(0, 254) : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fehler(400, "email", "Bitte eine gültige E-Mail-Adresse angeben.");
    const proIp = await limit(env, request, "link", 20, 3600);
    if (proIp) return proIp;
    if (!(await menschGeprueft(request, env, b?.turnstile))) return fehler(403, "turnstile", "Die Sicherheitsprüfung ist fehlgeschlagen. Bitte erneut versuchen.");
    // pro Adresse höchstens 5 Links pro Stunde (gegen Mail-Flut); Antwort bleibt gleich
    if ((await begrenze(env, `link-mail:${email}`, 5, 3600)).erlaubt) {
      await fordereLink(env, email, origin);
      await versendeAusstehende(env);
    }
    return json({ ok: true, text: "Falls zu dieser Adresse eine Buchung besteht, haben wir Ihnen einen Anmeldelink geschickt." });
  }

  if (pfad === "/api/konto/anmelden" && m === "POST") {
    const zu = await limit(env, request, "anmelden", 30, 3600);
    if (zu) return zu;
    const b = await body(request);
    const sitzung = typeof b?.token === "string" ? await loeseEin(env, b.token) : null;
    if (!sitzung) return fehler(400, "link_ungueltig", "Dieser Link ist abgelaufen oder wurde schon verwendet. Bitte einen neuen anfordern.");
    const r = json({ ok: true });
    r.headers.append("Set-Cookie", sitzungsCookie(env, sitzung, SITZUNG_SEK));
    return r;
  }

  if (pfad === "/api/konto/buchungen" && m === "GET") {
    const k = await verlangeKunde(request, env);
    if (k instanceof Response) return k;
    return json(await buchungenVon(env, k.customerId));
  }

  if (pfad === "/api/konto/abmelden" && m === "POST") {
    const k = await verlangeKunde(request, env);
    if (!(k instanceof Response)) await meldeAb(env, k.sessionHash);
    const r = json({ ok: true });
    r.headers.append("Set-Cookie", sitzungsCookie(env, "", 0));
    return r;
  }

  return null;
}
