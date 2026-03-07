function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(bytes: Uint8Array) {
  // btoa expects binary string
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const base64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

export function randomBase64url(bytesLen = 32) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return b64urlEncode(bytes);
}

export async function hmacSha256Hex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return toHex(sig);
}

export type RentJwtPayload = {
  sid: string;
  sub: string;
  iat: number;
  exp: number;
};

export async function signJwt(payload: RentJwtPayload, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = (obj: unknown) => b64urlEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const h = enc(header);
  const p = enc(payload);
  const signingInput = `${h}.${p}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  const sig = b64urlEncode(new Uint8Array(sigBuf));
  return `${signingInput}.${sig}`;
}

export async function verifyJwt(token: string, secret: string): Promise<RentJwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [h, p, s] = parts;
  const signingInput = `${h}.${p}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecodeToBytes(s),
    new TextEncoder().encode(signingInput),
  );
  if (!ok) return null;

  const payloadJson = new TextDecoder().decode(b64urlDecodeToBytes(p));
  const payload = JSON.parse(payloadJson) as RentJwtPayload;

  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sid || !payload?.sub || !payload?.exp) return null;
  if (payload.exp <= now) return null;

  return payload;
}

// PBKDF2 password hashing (portable, no external deps)
export async function hashPassword(password: string, opts?: { iterations?: number }) {
  const iterations = opts?.iterations ?? 120_000;
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );

  const hashB64 = b64urlEncode(new Uint8Array(bits));
  const saltB64 = b64urlEncode(salt);
  return `pbkdf2_sha256$${iterations}$${saltB64}$${hashB64}`;
}

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [kind, iterRaw, saltB64, hashB64] = parts;
  if (kind !== "pbkdf2_sha256") return false;
  const iterations = parseInt(iterRaw, 10);
  if (!Number.isFinite(iterations) || iterations < 50_000) return false;

  const salt = b64urlDecodeToBytes(saltB64);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    256,
  );

  const calc = b64urlEncode(new Uint8Array(bits));
  return calc === hashB64;
}

const RENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomRentKey() {
  const chunk = () => {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < 4; i++) out += RENT_ALPHABET[bytes[i] % RENT_ALPHABET.length];
    return out;
  };
  return `${chunk()}-${chunk()}-${chunk()}-${chunk()}`;
}

export function isValidRentKeyFormat(key: string) {
  return /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(key);
}
