/** Zufällige IDs/Tokens (128 bzw. 256 Bit) und SHA-256 für Tokens, die nur als Hash gespeichert werden. */
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function zufallsId(bytes = 16): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unbekannt";
}
