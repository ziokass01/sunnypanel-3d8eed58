const BASE_ALLOWED_HOSTS = new Set([
  "mityangho.id.vn",
  "www.mityangho.id.vn",
  "admin.mityangho.id.vn",
  "www.admin.mityangho.id.vn",
  "sunnypanel.lovable.app",
  // Lovable preview/review subdomains (stable allow-list would be too brittle)
  "preview--sunnypanel.lovable.app",
  "review--sunnypanel.lovable.app",
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

function toHostname(raw: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveCorsOrigin(origin: string, publicBaseUrl: string) {
  const originHost = toHostname(origin);
  const publicHost = toHostname(publicBaseUrl);

  // Allow any Lovable preview subdomain (e.g. id-preview--...lovable.app)
  // Security note: admin endpoints are still protected by auth in-code.
  if (originHost && originHost.endsWith(".lovable.app")) {
    return origin;
  }

  const allowedHosts = new Set(BASE_ALLOWED_HOSTS);
  if (publicHost) allowedHosts.add(publicHost);

  if (originHost && allowedHosts.has(originHost)) {
    return origin;
  }

  if (publicBaseUrl && publicHost && allowedHosts.has(publicHost)) {
    return publicBaseUrl;
  }

  return "https://mityangho.id.vn";
}

/**
 * Build CORS headers for both preflight and normal responses.
 * - If request has Origin: echo allowed origin + allow-credentials.
 * - If request has NO Origin (server-to-server/tools): allow "*" WITHOUT credentials.
 */
export function buildCorsHeaders(req: Request, publicBaseUrl: string, methods = DEFAULT_ALLOW_METHODS) {
  const origin = (req.headers.get("origin") ?? "").trim();

  // No Origin => safe wildcard, but MUST NOT send allow-credentials with "*".
  if (!origin) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
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
  } as Record<string, string>;
}

export function handleOptions(req: Request, publicBaseUrl: string, methods = DEFAULT_ALLOW_METHODS) {
  return new Response(null, { status: 204, headers: buildCorsHeaders(req, publicBaseUrl, methods) });
}

// Back-compat helper used by older functions.
export function corsHeaders(origin: string, publicBaseUrl: string, methods = "POST,OPTIONS") {
  // When origin is empty, return wildcard without credentials.
  if (!String(origin ?? "").trim()) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
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
  };
}

