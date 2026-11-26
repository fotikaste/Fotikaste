/** Antworten mit sicheren Standard-Headern. Admin/API werden nie zwischengespeichert und nie indexiert. */
const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function withSecurityHeaders(res: Response): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

export function json(data: unknown, status = 200): Response {
  return withSecurityHeaders(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } }));
}

export function html(body: string, status = 200): Response {
  return withSecurityHeaders(new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

export function fehler(status: number, code: string, text: string): Response {
  return json({ fehler: code, text }, status);
}

/** Schutz gegen CSRF: schreibende Anfragen müssen von derselben Herkunft kommen. */
export function sameOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("Origin");
  return origin !== null && origin === new URL(request.url).origin;
}

/** Text sicher in HTML einsetzen (gegen XSS). */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
