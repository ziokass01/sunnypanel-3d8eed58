import { webcrypto } from "node:crypto";
const crypto = webcrypto;
const enc = new TextEncoder();

function toHex(input) {
  return Array.from(new Uint8Array(input)).map(v => v.toString(16).padStart(2, "0")).join("");
}
function derInteger(raw) {
  let first = 0;
  while (first < raw.length - 1 && raw[first] === 0) first++;
  let value = raw.slice(first);
  if ((value[0] & 0x80) !== 0) { const p = new Uint8Array(value.length + 1); p.set(value, 1); value = p; }
  const out = new Uint8Array(2 + value.length); out[0] = 2; out[1] = value.length; out.set(value, 2); return out;
}
function p1363ToDer(signature) {
  const r = derInteger(signature.slice(0, 32));
  const s = derInteger(signature.slice(32));
  const out = new Uint8Array(2 + r.length + s.length);
  out[0] = 0x30; out[1] = r.length + s.length; out.set(r, 2); out.set(s, 2 + r.length); return out;
}
function derToP1363(der) {
  if (der.length < 8 || der[0] !== 0x30 || der[1] !== der.length - 2) return null;
  let offset = 2;
  const read = () => {
    if (der[offset++] !== 2) return null;
    const length = der[offset++];
    let value = der.slice(offset, offset + length); offset += length;
    while (value.length > 32 && value[0] === 0) value = value.slice(1);
    if (value.length > 32) return null;
    const out = new Uint8Array(32); out.set(value, 32 - value.length); return out;
  };
  const r = read(), s = read(); if (!r || !s || offset !== der.length) return null;
  const out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
}

const fields = [
  "v3", "nonce", "bodyhash", "keyhash", "devicehash", "sunny-v34-ac-20260721",
  "sunny-free-fire", "true", "600", "expiry", "1", "true", "1784592000",
  "session", "1784592900", "7", "1", "1784505600", "1785196800",
  "capability", "1784592900", "feature", "true",
];
const canonical = fields.join("\n");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, enc.encode(canonical)));
const der = p1363ToDer(raw);
const roundtrip = derToP1363(der);
const verified = roundtrip && await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, roundtrip, enc.encode(canonical));
const tampered = roundtrip && await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, roundtrip, enc.encode(canonical + "x"));
if (!verified || tampered || toHex(raw) !== toHex(roundtrip)) process.exit(1);
console.log(JSON.stringify({ ok: true, raw_bytes: raw.length, der_bytes: der.length, tamper_rejected: !tampered }));
