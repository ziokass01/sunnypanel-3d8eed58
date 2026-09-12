function readHeader(req: Request, name: string): string {
  // `Headers.get` is case-insensitive, but we normalize trimming in one place.
  return (req.headers.get(name) ?? "").trim();
}

function isValidIpv4(input: string): boolean {
  const parts = input.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isValidIpv6(input: string): boolean {
  // Keep validation lightweight: at least two segments and only hex/colon characters.
  return input.includes(":") && /^[0-9a-f:]+$/i.test(input);
}

function normalizeCandidate(raw: string): string {
  const trimmed = raw.trim().replace(/^"|"$/g, "");

  // [IPv6]:port -> IPv6
  const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketMatch) return bracketMatch[1].trim();

  // IPv4:port -> IPv4
  const ipv4PortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4PortMatch) return ipv4PortMatch[1].trim();

  return trimmed;
}

function firstValidIpFromXForwardedFor(xff: string): string | null {
  for (const entry of xff.split(",")) {
    const candidate = normalizeCandidate(entry);
    if (!candidate) continue;
    if (isValidIpv4(candidate) || isValidIpv6(candidate)) return candidate;
  }
  return null;
}

export function resolveClientIp(req: Request): string | null {
  const cfConnectingIp = normalizeCandidate(readHeader(req, "cf-connecting-ip"));
  if (cfConnectingIp && (isValidIpv4(cfConnectingIp) || isValidIpv6(cfConnectingIp))) return cfConnectingIp;

  const xRealIp = normalizeCandidate(readHeader(req, "x-real-ip"));
  if (xRealIp && (isValidIpv4(xRealIp) || isValidIpv6(xRealIp))) return xRealIp;

  const xForwardedFor = readHeader(req, "x-forwarded-for");
  if (xForwardedFor) return firstValidIpFromXForwardedFor(xForwardedFor);

  return null;
}
