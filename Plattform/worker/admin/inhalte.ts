/**
 * Admin: Inhalte der Webseite ohne Code (FAQ, Paketleistungen, technische Angaben) und «Webseite aktualisieren».
 * Die öffentlichen Seiten sind statisch: Änderungen erscheinen erst, wenn die Webseite neu erzeugt wird.
 * Der Knopf ruft dazu REBUILD_HOOK_URL auf (lokal: tools/webseite-dienst.mjs, online ab Phase 7: GitHub Actions).
 */
import type { Env } from "../env";
import type { AdminUser } from "../lib/auth";
import { brand } from "../../src/config/brand";
import { protokolliere } from "../lib/audit";
import { einstellungen, type Fehler } from "../lib/buchung";
import { esc } from "../lib/http";
import { ABFRAGEN, formeInhalte, unbekanntePlatzhalter, type Zeilen } from "../lib/inhalte";
import { inhaltGeaendert } from "./katalog";
import { rahmen, zeit } from "./layout";

const f = (status: number, code: string, text: string): Fehler => ({ status, code, text });
type Ok = { ok: true };

/** Inhalte so, wie sie die Webseite nach dem nächsten Aktualisieren zeigt. */
export async function vorschau(env: Env) {
  const keys = Object.keys(ABFRAGEN) as (keyof typeof ABFRAGEN)[];
  const r = await env.DB.batch(keys.map((k) => env.DB.prepare(ABFRAGEN[k])));
  return formeInhalte(Object.fromEntries(keys.map((k, i) => [k, r[i]!.results])) as Zeilen, brand.name);
}

export async function webseiteStatus(env: Env): Promise<{ geaendert: string | null; erzeugt: string | null; veraltet: boolean }> {
  const s = await einstellungen(env);
  const geaendert = (s.content_changed_at as string | null) ?? null;
  const erzeugt = (s.site_built_at as string | null) ?? null;
  return { geaendert, erzeugt, veraltet: geaendert !== null && (erzeugt === null || geaendert > erzeugt) };
}

export async function inhalteSeite(env: Env, u: AdminUser, url: URL): Promise<string> {
  const faqs = await env.DB.prepare("SELECT id, question, answer, sort, visible FROM faqs ORDER BY sort, id").all<{ id: number; question: string; answer: string; sort: number; visible: number }>();
  const pakete = await env.DB.prepare("SELECT slug, name FROM packages ORDER BY sort, slug").all<{ slug: string; name: string }>();
  const leist = await env.DB.prepare("SELECT package_slug, text FROM package_features ORDER BY package_slug, pos").all<{ package_slug: string; text: string }>();
  const fakten = await env.DB.prepare("SELECT id, label, value, sort FROM product_facts ORDER BY sort, id").all<{ id: number; label: string; value: string | null; sort: number }>();
  const st = await webseiteStatus(env);
  const v = await vorschau(env);
  const hook = Boolean(env.REBUILD_HOOK_URL && env.REBUILD_SECRET);

  const faqForm = (q: { id?: number; question?: string; answer?: string; sort?: number; visible?: number }) => {
    const id = q.id ?? "neu";
    return `<form method="post" action="/admin/inhalte/faq${q.id ? `/${q.id}` : ""}"><div class="felder">
  <div class="breit"><label for="fq_${id}">Frage</label><input id="fq_${id}" name="frage" value="${esc(q.question ?? "")}" required maxlength="200" style="width:100%"></div>
  <div class="breit"><label for="fa_${id}">Antwort</label><textarea id="fa_${id}" name="antwort" required maxlength="2000">${esc(q.answer ?? "")}</textarea></div>
  <div><label for="fs_${id}">Reihenfolge</label><input id="fs_${id}" name="sort" value="${q.sort ?? 100}" inputmode="numeric"></div>
  <div><label class="check"><input type="checkbox" name="sichtbar"${(q.visible ?? 1) ? " checked" : ""}> sichtbar</label></div>
  <div style="align-self:end"><button>${q.id ? "Speichern" : "Frage hinzufügen"}</button></div></div></form>
  ${q.id ? `<form class="zeile" method="post" action="/admin/inhalte/faq/${q.id}/loeschen"><button class="gefahr">Frage löschen</button></form>` : ""}`;
  };

  const inhalt = `<div class="${st.veraltet ? "hinweis" : "meldung ok"}"><strong>${st.veraltet ? "Die Webseite zeigt noch den alten Stand." : "Die Webseite ist aktuell."}</strong>
  <span class="klein">Inhalte geändert: ${esc(zeit(st.geaendert))} · Webseite erzeugt: ${esc(zeit(st.erzeugt))}</span>
  <form method="post" action="/admin/inhalte/aktualisieren" style="margin-top:.6rem"><button class="haupt"${hook ? "" : " disabled"}>Webseite aktualisieren</button>
  ${hook ? "" : '<span class="klein"> Noch nicht eingerichtet (lokal: tools/webseite-dienst.mjs starten; online ab Phase 7).</span>'}</form></div>

<h2>Häufige Fragen</h2>
<p class="klein">Platzhalter werden automatisch mit den aktuellen Preisen ersetzt: {marke}, ${pakete.results.map((p) => `{preis:${esc(p.slug)}}`).join(", ")}, {zusatztag}, {miettage}, {fahrt_pauschale}, {fahrt_inkl_km}, {fahrt_pro_km}, {ausgangsort}, {storno}, {storno_tage}.</p>
${faqs.results.map(faqForm).join("")}
<h3>Neue Frage</h3>${faqForm({})}
<details><summary>Vorschau der Antworten mit ersetzten Platzhaltern</summary><dl>${v.faqs.map((q) => `<dt><b>${esc(q.question)}</b></dt><dd>${esc(q.answer)}</dd>`).join("")}</dl></details>

<h2>Leistungen der Pakete</h2><p class="klein">Eine Zeile pro Leistung (höchstens 8). Erscheint auf Start- und Preisseite.</p>
${pakete.results.map((p) => `<form method="post" action="/admin/inhalte/leistungen/${esc(p.slug)}"><div class="felder"><div class="breit"><label for="l_${esc(p.slug)}">${esc(p.name)}</label>
<textarea id="l_${esc(p.slug)}" name="leistungen" rows="5">${esc(leist.results.filter((l) => l.package_slug === p.slug).map((l) => l.text).join("\n"))}</textarea></div><div><button>Speichern</button></div></div></form>`).join("")}

<h2>Technische Angaben</h2><p class="klein">Leeres Feld = «folgt» auf der Webseite. Bitte nur gemessene, bestätigte Angaben eintragen.</p>
<form method="post" action="/admin/inhalte/fakten"><div class="felder">
${fakten.results.map((x) => `<div><label for="fk_${x.id}">${esc(x.label)}</label><input id="fk_${x.id}" name="fakt_${x.id}" value="${esc(x.value ?? "")}" maxlength="200"></div>`).join("")}
<div style="align-self:end"><button>Speichern</button></div></div></form>`;
  return rahmen(u, "Inhalte", "/admin/inhalte", inhalt, url);
}

export async function speichereFaq(env: Env, u: AdminUser, id: number | null, form: Map<string, string>): Promise<Ok | Fehler> {
  const frage = form.get("frage") ?? "";
  const antwort = form.get("antwort") ?? "";
  const sort = Number(form.get("sort") ?? 100);
  if (frage.length < 5 || frage.length > 200) return f(400, "frage", "Frage 5–200 Zeichen.");
  if (antwort.length < 5 || antwort.length > 2000) return f(400, "antwort", "Antwort 5–2000 Zeichen.");
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) return f(400, "sort", "Reihenfolge 0–9999.");
  const slugs = (await env.DB.prepare("SELECT slug FROM packages").all<{ slug: string }>()).results.map((p) => p.slug);
  const falsch = unbekanntePlatzhalter(`${frage} ${antwort}`, slugs);
  if (falsch.length) return f(400, "platzhalter", `Unbekannter Platzhalter: {${falsch[0]}}. Erlaubt sind die Platzhalter in der Liste über den Fragen.`);
  const sichtbar = form.get("sichtbar") === "on" ? 1 : 0;
  const alt = id ? await env.DB.prepare("SELECT question, answer, sort, visible FROM faqs WHERE id = ?1").bind(id).first() : null;
  if (id && !alt) return f(404, "faq", "Diese Frage gibt es nicht.");
  await env.DB.batch([
    id ? env.DB.prepare("UPDATE faqs SET question = ?2, answer = ?3, sort = ?4, visible = ?5 WHERE id = ?1").bind(id, frage, antwort, sort, sichtbar)
      : env.DB.prepare("INSERT INTO faqs (question, answer, sort, visible) VALUES (?1, ?2, ?3, ?4)").bind(frage, antwort, sort, sichtbar),
    inhaltGeaendert(env),
  ]);
  await protokolliere(env, u.email, id ? "faq.geaendert" : "faq.angelegt", frage.slice(0, 80), { alt });
  return { ok: true };
}

export async function loescheFaq(env: Env, u: AdminUser, id: number): Promise<Ok | Fehler> {
  const r = await env.DB.prepare("DELETE FROM faqs WHERE id = ?1 RETURNING question, answer").bind(id).first<{ question: string; answer: string }>();
  if (!r) return f(404, "faq", "Diese Frage gibt es nicht.");
  await inhaltGeaendert(env).run();
  await protokolliere(env, u.email, "faq.geloescht", r.question.slice(0, 80), { frage: r.question, antwort: r.answer });
  return { ok: true };
}

export async function speichereLeistungen(env: Env, u: AdminUser, slug: string, text: string): Promise<Ok | Fehler> {
  const zeilen = text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  if (zeilen.length === 0 || zeilen.length > 8) return f(400, "anzahl", "Bitte 1 bis 8 Leistungen eingeben (eine pro Zeile).");
  if (zeilen.some((z) => z.length > 120)) return f(400, "laenge", "Eine Leistung darf höchstens 120 Zeichen haben.");
  const alt = await env.DB.prepare("SELECT text FROM package_features WHERE package_slug = ?1 ORDER BY pos").bind(slug).all<{ text: string }>();
  if (!(await env.DB.prepare("SELECT 1 FROM packages WHERE slug = ?1").bind(slug).first())) return f(404, "paket", "Dieses Paket gibt es nicht.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM package_features WHERE package_slug = ?1").bind(slug),
    ...zeilen.map((z, i) => env.DB.prepare("INSERT INTO package_features (package_slug, pos, text) VALUES (?1, ?2, ?3)").bind(slug, i + 1, z)),
    inhaltGeaendert(env),
  ]);
  await protokolliere(env, u.email, "paket.leistungen", slug, { alt: alt.results.map((x) => x.text), neu: zeilen });
  return { ok: true };
}

export async function speichereFakten(env: Env, u: AdminUser, form: Map<string, string>): Promise<Ok | Fehler> {
  const fakten = await env.DB.prepare("SELECT id, label, value FROM product_facts").all<{ id: number; label: string; value: string | null }>();
  const neu = fakten.results.map((x) => ({ ...x, neu: (form.get(`fakt_${x.id}`) ?? "").slice(0, 200) || null })).filter((x) => x.neu !== x.value);
  if (neu.length === 0) return { ok: true };
  await env.DB.batch([...neu.map((x) => env.DB.prepare("UPDATE product_facts SET value = ?2 WHERE id = ?1").bind(x.id, x.neu)), inhaltGeaendert(env)]);
  await protokolliere(env, u.email, "fakten.geaendert", null, { aenderungen: neu.map((x) => ({ label: x.label, alt: x.value, neu: x.neu })) });
  return { ok: true };
}

/** Neu erzeugen anstossen. Antwortet sofort; das Erzeugen läuft beim Dienst im Hintergrund. */
export async function aktualisiereWebseite(env: Env, u: AdminUser, fetcher: typeof fetch = fetch): Promise<Ok | Fehler> {
  if (!env.REBUILD_HOOK_URL || !env.REBUILD_SECRET) return f(503, "nicht_eingerichtet", "«Webseite aktualisieren» ist noch nicht eingerichtet.");
  try {
    // Online: GitHub «workflow_dispatch» (Workflow webseite.yml, Zweig main). Lokal: tools/webseite-dienst.mjs ignoriert den Inhalt.
    const r = await fetcher(env.REBUILD_HOOK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.REBUILD_SECRET}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "fotikaste-admin", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (!r.ok) return f(502, "hook", `Der Dienst zum Erzeugen der Webseite hat abgelehnt (${r.status}).`);
  } catch {
    return f(502, "hook", "Der Dienst zum Erzeugen der Webseite ist nicht erreichbar.");
  }
  await protokolliere(env, u.email, "webseite.aktualisieren", null);
  return { ok: true };
}
