export const SESSION_COOKIE = "monitor_session";
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET não configurada.");
  return value;
}

/**
 * Web Crypto em vez de node:crypto. No Next 16 o proxy roda em runtime Node, então
 * os dois funcionariam; Web Crypto é usado porque a mesma função serve ao proxy,
 * às Server Actions e a qualquer runtime futuro sem reescrita.
 */
async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// O tipo de retorno e explicitamente Uint8Array<ArrayBuffer>: Uint8Array.from
// devolve ArrayBufferLike, que pode ser SharedArrayBuffer e nao satisfaz
// BufferSource, exigido por crypto.subtle.verify.
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Token no formato "<expiraEmMs>.<assinatura>". */
export async function signSession(expiresAtMs: number): Promise<string> {
  const payload = String(expiresAtMs);
  const sig = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    new TextEncoder().encode(payload)
  );
  return `${payload}.${toBase64Url(sig)}`;
}

/** Valida assinatura e validade. crypto.subtle.verify não vaza tempo. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  try {
    const sig = fromBase64Url(token.slice(dot + 1));
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      sig,
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

/**
 * Compara a senha sem vazar tempo: em vez de comparar os textos, comparamos os
 * HMACs, que têm sempre 32 bytes independentemente do tamanho da entrada.
 */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.MONITOR_PASSWORD;
  if (!expected) throw new Error("MONITOR_PASSWORD não configurada.");

  const key = await hmacKey();
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", key, enc.encode(candidate)),
    crypto.subtle.sign("HMAC", key, enc.encode(expected)),
  ]);

  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
