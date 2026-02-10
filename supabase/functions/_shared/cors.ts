const BASE_ALLOWED_HOSTS = new Set([
  "mityangho.id.vn",
  "www.mityangho.id.vn",
  "sunnypanel.lovable.app",
  "localhost",
  "127.0.0.1",
]);

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

export function corsHeaders(origin: string, publicBaseUrl: string, methods = "POST,OPTIONS") {
  const allowOrigin = resolveCorsOrigin(origin, publicBaseUrl);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fp",
    "Access-Control-Max-Age": "86400",
  };
}
