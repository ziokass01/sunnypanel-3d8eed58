const BASE_ALLOWED_HOSTS = new Set([
  "mityangho.id.vn",
  "www.mityangho.id.vn",
  "admin.mityangho.id.vn",
  "www.admin.mityangho.id.vn",
  "localhost",
  "127.0.0.1",
]);

const DEFAULT_ALLOW_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
  "x-fp",
  "x-debug",
].join(", ");

const DEFAULT_ALLOW_METHODS = "GET,POST,PUT,DELETE,OPTIONS";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

function toHostname(raw: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function parseAllowedOrigins(raw: string | null): Set<string> {
  const hosts = new Set<string>();
  for (const entry of String(raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const asHost = toHostname(trimmed);
    if (asHost) {
      hosts.add(asHost);
      continue;
    }

    const normalized = trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "").toLowerCase();
    if (normalized) hosts.add(normalized);
  }
  return hosts;
}

function shouldAllowLovableOrigins(): boolean {
  return Deno.env.get("ALLOW_LOVABLE_ORIGINS") === "1";
}

function buildAllowedHosts(publicBaseUrl: string): Set<string> {
  const allowedHosts = new Set(BASE_ALLOWED_HOSTS);
  const envHosts = parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"));

  for (const host of envHosts) allowedHosts.add(host);

  const publicHost = toHostname(publicBaseUrl);
  if (publicHost) allowedHosts.add(publicHost);

  return allowedHosts;
}

export function resolveCorsOrigin(origin: string, publicBaseUrl: string) {
  const originHost = toHostname(origin);
  const publicHost = toHostname(publicBaseUrl);
  const allowedHosts = buildAllowedHosts(publicBaseUrl);

  if (originHost && shouldAllowLovableOrigins() && originHost.endsWith(".lovable.app")) {
    return origin;
  }

  if (originHost && allowedHosts.has(originHost)) {
    return origin;
  }

  if (publicBaseUrl && publicHost && allowedHosts.has(publicHost)) {
    return publicBaseUrl;
  }

  return "https://mityangho.id.vn";
}

export function buildCorsHeaders(req: Request, publicBaseUrl: string, methods = DEFAULT_ALLOW_METHODS) {
  const origin = (req.headers.get("origin") ?? "").trim();

  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    } as Record<string, string>;
  }

  const allowOrigin = resolveCorsOrigin(origin, publicBaseUrl);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
  } as Record<string, string>;
}

export function handleOptions(req: Request, publicBaseUrl: string, methods = DEFAULT_ALLOW_METHODS) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(req, publicBaseUrl, methods) });
}

export function corsHeaders(origin: string, publicBaseUrl: string, methods = "POST,OPTIONS") {
  if (!String(origin ?? "").trim()) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
    };
  }

  const allowOrigin = resolveCorsOrigin(origin, publicBaseUrl);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
  };
}
