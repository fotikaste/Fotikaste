/**
 * Gäste-Links /f/<token>: Ein Gast sieht nur sein eigenes Foto (Link aus dem QR-Code der Fotobox).
 * Der Server kennt nur den Hash des Links. Bilder kommen aus dem privaten Speicher durch den Worker.
 */
import type { Env } from "../env";
import { brand } from "../../src/config/brand";
import { heuteZurich } from "../lib/datum";
import { TOKEN_MUSTER } from "../lib/fotos";
import { esc, withSecurityHeaders } from "../lib/http";
import { clientIp, sha256 } from "../lib/id";
import { begrenze } from "../lib/ratelimit";
import { zaehle } from "../lib/usage";

function seite(titel: string, inhalt: string, status = 200, aktualisieren = false): Response {
  const body = `<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">${aktualisieren ? '<meta http-equiv="refresh" content="30">' : ""}
<title>${esc(titel)} | ${esc(brand.name)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#F8F6F0;color:#222;font:17px/1.6 "Segoe UI",system-ui,sans-serif;text-align:center}
main{max-width:40rem;margin:0 auto;padding:2rem 1.25rem 3rem}.logo{font:italic 500 2rem Georgia,serif;margin:0 0 1.5rem}
h1{font:500 1.9rem Georgia,serif;margin:.5rem 0 1rem}img{max-width:100%;height:auto;border:1px solid #E4DCCD;background:#fff}
a.knopf{display:inline-block;margin-top:1.25rem;padding:.85rem 1.6rem;background:#222;color:#fff;font-weight:600;text-decoration:none}
p{color:#625E57}.klein{font-size:.85rem}</style></head><body><main><p class="logo">${esc(brand.name)}</p>${inhalt}</main></body></html>`;
  const r = new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
  const s = withSecurityHeaders(r);
  s.headers.set("Referrer-Policy", "no-referrer");
  return s;
}

const UNTERWEGS = () => seite("Foto unterwegs", `<h1>Ihr Foto ist noch unterwegs</h1>
<p>Die Fotobox lädt Ihr Foto hoch, sobald sie Internet hat. Diese Seite aktualisiert sich alle 30 Sekunden – oder öffnen Sie den Link später nochmals.</p>
<p class="klein">Stimmt der Link? Er steht unter dem QR-Code bzw. auf Ihrer Postkarte.</p>`, 200, true);

export async function galerieRoute(request: Request, env: Env, pfad: string): Promise<Response | null> {
  const m = pfad.match(/^\/f\/([^/]+)(\/bild)?$/);
  if (!m || request.method !== "GET") return null;
  if (!(await begrenze(env, `foto:${clientIp(request)}`, 300, 3600)).erlaubt) return seite("Zu viele Aufrufe", "<h1>Bitte später erneut versuchen</h1>", 429);
  const token = m[1]!;
  if (!TOKEN_MUSTER.test(token)) return UNTERWEGS();
  const p = await env.DB.prepare(
    `SELECT p.status, p.web_key, p.id, e.retention_until, e.status AS event_status FROM photos p JOIN events e ON e.id = p.event_id WHERE p.token_hash = ?1`,
  ).bind(await sha256(token)).first<{ status: string; web_key: string; id: string; retention_until: string; event_status: string }>();
  // Unbekannt = (noch) nicht hochgeladen → gleiche Antwort wie «unterwegs» (verrät nicht, ob ein Link existiert)
  if (!p || p.status === "pending") return UNTERWEGS();
  const abgelaufen = p.status === "deleted" || p.event_status === "archived" || p.retention_until < heuteZurich();
  if (abgelaufen) return seite("Nicht mehr verfügbar", `<h1>Dieses Foto ist nicht mehr online</h1><p>Fotos bleiben nur eine begrenzte Zeit in der Online-Galerie und werden danach automatisch gelöscht.</p>`, 410);

  if (m[2]) {
    const obj = await env.PHOTOS.get(p.web_key);
    await zaehle(env, "r2_class_b");
    if (!obj) return seite("Nicht gefunden", "<h1>Foto nicht gefunden</h1>", 404);
    const download = new URL(request.url).searchParams.has("download");
    return new Response(obj.body, {
      headers: {
        "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer", ...(download ? { "Content-Disposition": `attachment; filename="${brand.name.toLowerCase()}-foto.jpg"` } : {}),
      },
    });
  }
  const bild = `/f/${esc(token)}/bild`;
  const bis = p.retention_until.split("-").reverse().join(".");
  return seite("Ihr Foto", `<h1>Ihr Foto</h1><img src="${bild}" alt="Ihr Foto aus der Fotobox" width="1600" height="1067">
<p><a class="knopf" href="${bild}?download">Foto speichern</a></p>
<p class="klein">Nur wer diesen Link hat, sieht das Foto. Online bis ${esc(bis)}.</p>`);
}
