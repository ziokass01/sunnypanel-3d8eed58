function trimTrailingSlash(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function allowedOrigin(origin, env) {
  const raw = String(env.ALLOWED_ORIGINS ?? "").trim();
  if (!raw) return origin || "*";
  const list = raw.split(",").map((v) => v.trim()).filter(Boolean);
  if (list.includes("*")) return origin || "*";
  if (origin && list.includes(origin)) return origin;
  return "";
}

function corsHeaders(origin, env) {
  const allowOrigin = allowedOrigin(origin, env);
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,apikey,Hmac,X-Client-Info,X-Gateway-Project,x-ts,x-nonce,x-sig",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowOrigin) headers["Access-Control-Allow-Origin"] = allowOrigin;
  return headers;
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin, env),
    },
  });
}

function getAllowedFunctions(env) {
  const raw = String(env.ALLOWED_FUNCTIONS ?? "").trim();
  if (raw) {
    return new Set(raw.split(",").map((item) => item.trim()).filter(Boolean));
  }
  return new Set([
    "verify-key",
    "rent-verify-key",
    "free-config",
    "free-start",
    "free-gate",
    "free-reveal",
    "free-resolve",
    "free-close",
    "reset-key",
    "generate-license-key",
    "admin-free-test",
    "free-admin-test",
    "admin-free-block",
    "admin-free-delete-session",
    "admin-free-delete-issued",
    "admin-rent",
    "admin-rent-integrations",
    "rent-user",
    "server-app-runtime",
    "server-app-runtime-ops",
  ]);
}

function resolveFunctionsBase(env) {
  const direct = trimTrailingSlash(env.ACTIVE_FUNCTIONS_BASE_URL || env.UPSTREAM_FUNCTIONS_BASE_URL || "");
  if (direct) return direct;
  const supabase = trimTrailingSlash(env.ACTIVE_SUPABASE_URL || env.UPSTREAM_SUPABASE_URL || env.SUPABASE_URL || "");
  if (!supabase) return "";
  return `${supabase}/functions/v1`;
}

function extractRoute(pathname) {
  if (pathname === "/health" || pathname === "/api/health") {
    return { kind: "health" };
  }

  const clean = pathname.replace(/^\/+/, "");
  const parts = clean.split("/").filter(Boolean);
  if (!parts.length) return { kind: "none" };

  if (parts[0] === "api") {
    if (parts.length < 2) return { kind: "none" };
    return { kind: "function", name: parts[1] };
  }

  return { kind: "function", name: parts[0] };
}

function buildForwardHeaders(req, env) {
  const headers = new Headers();
  const contentType = req.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const auth = req.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);

  const apikey = req.headers.get("apikey") || String(env.UPSTREAM_ANON_KEY || env.UPSTREAM_APIKEY || "").trim();
  if (apikey) headers.set("apikey", apikey);

  const hmac = req.headers.get("Hmac");
  if (hmac) headers.set("Hmac", hmac);

  const xTs = req.headers.get("x-ts");
  if (xTs) headers.set("x-ts", xTs);

  const xNonce = req.headers.get("x-nonce");
  if (xNonce) headers.set("x-nonce", xNonce);

  const xSig = req.headers.get("x-sig");
  if (xSig) headers.set("x-sig", xSig);

  const clientInfo = req.headers.get("X-Client-Info");
  if (clientInfo) headers.set("X-Client-Info", clientInfo);

  const forwardedFor = req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);

  return headers;
}

async function forwardRequest(req, upstreamUrl, env) {
  const method = req.method.toUpperCase();
  const headers = buildForwardHeaders(req, env);
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await req.text();
  }
  return await fetch(upstreamUrl, init);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    const route = extractRoute(url.pathname);
    if (route.kind === "health") {
      return json({
        ok: true,
        service: "fixed-api-gateway",
        public_api_base_url: trimTrailingSlash(env.PUBLIC_API_BASE_URL || `${url.origin}/api`),
        active_functions_base_url: resolveFunctionsBase(env) || null,
      }, 200, origin, env);
    }

    if (route.kind !== "function") {
      return json({ ok: false, code: "NOT_FOUND" }, 404, origin, env);
    }

    const fnName = String(route.name || "").trim();
    const allowed = getAllowedFunctions(env);
    if (!allowed.has(fnName)) {
      return json({ ok: false, code: "FUNCTION_NOT_ALLOWED", function_name: fnName }, 403, origin, env);
    }

    const functionsBase = resolveFunctionsBase(env);
    if (!functionsBase) {
      return json({ ok: false, code: "SERVER_MISCONFIG", msg: "Missing ACTIVE_FUNCTIONS_BASE_URL or ACTIVE_SUPABASE_URL" }, 503, origin, env);
    }

    const search = url.search || "";
    const upstreamUrl = `${functionsBase}/${fnName}${search}`;

    let upstream;
    try {
      upstream = await forwardRequest(req, upstreamUrl, env);
    } catch (error) {
      return json({ ok: false, code: "UPSTREAM_FETCH_FAILED", msg: String(error?.message || error), upstream_url: upstreamUrl }, 502, origin, env);
    }

    const responseHeaders = new Headers(corsHeaders(origin, env));
    const contentType = upstream.headers.get("Content-Type") || "application/json; charset=utf-8";
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("X-Gateway-Project", trimTrailingSlash(env.ACTIVE_SUPABASE_URL || env.UPSTREAM_SUPABASE_URL || "") || "custom-functions-base");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
