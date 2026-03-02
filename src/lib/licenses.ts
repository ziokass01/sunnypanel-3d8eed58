// Shared helpers for license keys.
// Keep format consistent with DB constraint:
//   ^([A-Z0-9]+)-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randInt(maxExclusive: number): number {
  // crypto is available in modern browsers; fall back to Math.random for very old ones.
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  } catch {
    return Math.floor(Math.random() * maxExclusive);
  }
}

function randChunk(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randInt(ALPHABET.length)];
  return out;
}

export function generateKey(prefix = "SUNNY"): string {
  const p = String(prefix || "SUNNY").toUpperCase().replace(/[^A-Z0-9]/g, "");
  // 3 groups of 4 chars.
  return `${p}-${randChunk(4)}-${randChunk(4)}-${randChunk(4)}`;
}

export function validateLicenseKeyFormat(key: string, prefix?: string): boolean {
  const k = String(key || "").trim().toUpperCase();
  const m = k.match(/^([A-Z0-9]+)-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  if (!m) return false;
  if (prefix) {
    const p = String(prefix).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return m[1] === p;
  }
  return true;
}
