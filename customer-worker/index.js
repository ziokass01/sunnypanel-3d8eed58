function trimTrailingSlash(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}


function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexBytes(bytes) {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization,apikey,Hmac,X-Client-Info,X-Gateway-Project,x-ts,x-nonce,x-sig,x-build-id,x-fp,x-admin-key,x-rent-token",
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
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
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
    "fake-lag-check",
    "fake-lag-auth",
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

function buildForwardHeaders(req, env, fnName = "") {
  const headers = new Headers();
  const contentType = req.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const auth = req.headers.get("Authorization");
  if (auth) headers.set("Authorization", auth);

  const rentToken = (req.headers.get("x-rent-token") || "").trim();
  if (rentToken && fnName === "rent-user") headers.set("Authorization", `Bearer ${rentToken}`);

  const apikey = req.headers.get("apikey") || String(env.UPSTREAM_ANON_KEY || env.UPSTREAM_APIKEY || "").trim();
  if (apikey) headers.set("apikey", apikey);

  const hmac = req.headers.get("Hmac");
  if (hmac) headers.set("Hmac", hmac);
  for (const name of ["x-ts", "x-nonce", "x-sig", "x-build-id", "X-Client-Info", "x-fp", "x-admin-key"]) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Never forward client-controlled gateway identity headers.
  for (const name of [
    "x-gateway-ts", "x-gateway-nonce", "x-gateway-ip",
    "x-gateway-body-sha256", "x-gateway-signature",
  ]) headers.delete(name);
  return headers;
}

async function forwardRequest(req, upstreamUrl, env, fnName = "") {
  const method = req.method.toUpperCase();
  const headers = buildForwardHeaders(req, env, fnName);
  let bodyBytes = new ArrayBuffer(0);
  if (method !== "GET" && method !== "HEAD") {
    bodyBytes = await req.arrayBuffer();
  }

  if (fnName === "verify-key") {
    const secret = String(env.GATEWAY_SHARED_SECRET || "").trim();
    if (!secret) throw new Error("GATEWAY_SHARED_SECRET_MISSING");
    const realIp = String(req.headers.get("CF-Connecting-IP") || "").trim();
    if (!realIp) throw new Error("CF_CONNECTING_IP_MISSING");
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randomHex(16);
    const bodyHash = await sha256HexBytes(bodyBytes);
    const canonical = ["v1", method, fnName, ts, nonce, realIp, bodyHash].join("\n");
    const signature = await hmacSha256Hex(secret, canonical);
    headers.set("x-gateway-ts", ts);
    headers.set("x-gateway-nonce", nonce);
    headers.set("x-gateway-ip", realIp);
    headers.set("x-gateway-body-sha256", bodyHash);
    headers.set("x-gateway-signature", signature);
    headers.set("X-Forwarded-For", realIp);
  }

  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") init.body = bodyBytes;
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
        service: "fixed-api-gateway-v34",
        public_api_base_url: trimTrailingSlash(env.PUBLIC_API_BASE_URL || `${url.origin}/api`),
        gateway_auth: Boolean(String(env.GATEWAY_SHARED_SECRET || "").trim()),
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
      upstream = await forwardRequest(req, upstreamUrl, env, fnName);
    } catch (error) {
      return json({ ok: false, code: "UPSTREAM_FETCH_FAILED", msg: String(error?.message || error), upstream_url: upstreamUrl }, 502, origin, env);
    }

    const responseHeaders = new Headers(corsHeaders(origin, env));
    const contentType = upstream.headers.get("Content-Type") || "application/json; charset=utf-8";
    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
    responseHeaders.set("Pragma", "no-cache");
    responseHeaders.set("Expires", "0");
    responseHeaders.set("X-Gateway-Project", trimTrailingSlash(env.ACTIVE_SUPABASE_URL || env.UPSTREAM_SUPABASE_URL || "") || "custom-functions-base");

    const lowerContentType = String(contentType || "").toLowerCase();
    const looksHtml = lowerContentType.includes("text/html") || lowerContentType.includes("text/plain");
    if (upstream.status >= 500 && looksHtml) {
      return json({
        ok: false,
        code: "UPSTREAM_BAD_GATEWAY",
        function_name: fnName,
        upstream_status: upstream.status,
        msg: "Upstream edge runtime returned a non-JSON gateway error",
      }, 502, origin, env);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  },
};
