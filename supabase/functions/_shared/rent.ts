// Shared helpers for the Rent (tenant) portal.

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B32_LOOKUP: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (let i = 0; i < B32_ALPHABET.length; i++) m[B32_ALPHABET[i]] = i;
  return m;
})();

export function normalizeB32(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
}

export function groupKey(rawB32: string, size = 4) {
  const s = normalizeB32(rawB32);
  const parts: string[] = [];
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size));
  return parts.join("-");
}

export function b32encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      output += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += B32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function b32decode(b32: string): Uint8Array {
  const s = normalizeB32(b32);
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const ch of s) {
    const v = B32_LOOKUP[ch];
    if (v === undefined) throw new Error("INVALID_BASE32");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

export async function hmacSha256(keyBytes: Uint8Array, msgBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msgBytes);
  return new Uint8Array(sig);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function deriveTenantSecretBytes(tenantId: string, salt: string, version: number): Promise<Uint8Array> {
  const master = Deno.env.get("RENT_MASTER_SECRET") ?? "";
  if (!master) throw new Error("MISSING_RENT_MASTER_SECRET");

  const keyBytes = new TextEncoder().encode(master);
  const msgBytes = new TextEncoder().encode(`${tenantId}:${salt}:${version}`);
  return await hmacSha256(keyBytes, msgBytes); // 32 bytes
}

export async function deriveTenantSecretString(tenantId: string, salt: string, version: number): Promise<string> {
  const bytes = await deriveTenantSecretBytes(tenantId, salt, version);
  return groupKey(b32encode(bytes));
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export function packPayload(keyIdU64: bigint, expUnix: number): Uint8Array {
  const buf = new Uint8Array(12);
  const view = new DataView(buf.buffer);
  // Big-endian u64
  view.setBigUint64(0, keyIdU64, false);
  view.setUint32(8, expUnix >>> 0, false);
  return buf;
}

export function unpackPayload(payload: Uint8Array): { keyId: bigint; expUnix: number } {
  if (payload.length !== 12) throw new Error("INVALID_PAYLOAD_LEN");
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const keyId = view.getBigUint64(0, false);
  const expUnix = view.getUint32(8, false);
  return { keyId, expUnix };
}

export async function signKeyPayload(secretBytes: Uint8Array, payload: Uint8Array): Promise<Uint8Array> {
  const mac = await hmacSha256(secretBytes, payload);
  return mac.slice(0, 8); // 64-bit tag; keeps key short (8 groups)
}

export async function buildRentKey(secretBytes: Uint8Array, keyIdU64: bigint, expUnix: number): Promise<{ key: string; last4: string; rawB32: string }> {
  const payload = packPayload(keyIdU64, expUnix);
  const tag = await signKeyPayload(secretBytes, payload);
  const token = new Uint8Array(payload.length + tag.length);
  token.set(payload, 0);
  token.set(tag, payload.length);

  const rawB32 = b32encode(token);
  const key = groupKey(rawB32);
  const last4 = normalizeB32(rawB32).slice(-4);
  return { key, last4, rawB32 };
}

export async function verifyRentKey(secretBytes: Uint8Array, key: string): Promise<{ ok: true; keyId: bigint; expUnix: number } | { ok: false; code: string }> {
  let decoded: Uint8Array;
  try {
    decoded = b32decode(key);
  } catch {
    return { ok: false, code: "INVALID_KEY" };
  }

  if (decoded.length !== 20) return { ok: false, code: "INVALID_KEY" };

  const payload = decoded.slice(0, 12);
  const tag = decoded.slice(12);

  const expected = await signKeyPayload(secretBytes, payload);
  if (!constantTimeEqual(tag, expected)) return { ok: false, code: "INVALID_SIGNATURE" };

  const { keyId, expUnix } = unpackPayload(payload);
  return { ok: true, keyId, expUnix };
}

export function randomU64(): bigint {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  // Combine into unsigned 64-bit
  return (BigInt(a[0]) << 32n) | BigInt(a[1]);
}
