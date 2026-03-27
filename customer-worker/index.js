const textEncoder = new TextEncoder();

function normalizeKey(input) {
  return String(input ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
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
    "Access-Control-Allow-Headers": "Content-Type,Hmac",
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

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildDeviceId(req, provided) {
  const clean = String(provided ?? "").trim();
  if (clean) return clean.slice(0, 256);
  const ua = req.headers.get("user-agent") || "browser";
  const lang = req.headers.get("accept-language") || "unknown";
  return `web-${ua.slice(0, 80).replace(/\s+/g, "_")}-${lang.slice(0, 24).replace(/\s+/g, "_")}`.slice(0, 256);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, service: "customer-verify-proxy" }, 200, origin, env);
    }

    if (url.pathname !== "/verify") {
      return json({ ok: false, code: "NOT_FOUND" }, 404, origin, env);
    }

    if (req.method !== "POST") {
      return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405, origin, env);
    }

    const verifyUrl = String(env.SUPABASE_VERIFY_URL || env.VERIFY_URL || "").trim();
    const username = String(env.NOVA_USERNAME || "").trim().toLowerCase();
    const userSecret = String(env.NOVA_USER_HMAC_SECRET || "").trim();
    const hmacHeader = String(env.NOVA_HMAC_HEADER || "").trim();

    if (!verifyUrl || !username || !userSecret) {
      return json({ ok: false, code: "SERVER_MISCONFIG", msg: "Missing verify config" }, 503, origin, env);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const key = normalizeKey(body.key);
    const device_id = buildDeviceId(req, body.device_id);
    if (!key) {
      return json({ ok: false, code: "MISSING_KEY", msg: "Thiếu key" }, 400, origin, env);
    }

    const ts = Math.floor(Date.now() / 1000);
    const payloadText = `${username}|${key}|${device_id}|${ts}`;
    const sig_user = await hmacSha256Hex(userSecret, payloadText);

    const upstreamHeaders = {
      "Content-Type": "application/json",
    };
    if (hmacHeader) upstreamHeaders.Hmac = hmacHeader;

    let upstream;
    try {
      upstream = await fetch(verifyUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify({
          username,
          key,
          device_id,
          ts,
          sig_user,
        }),
      });
    } catch (error) {
      return json({ ok: false, code: "UPSTREAM_FETCH_FAILED", msg: String(error?.message || error) }, 502, origin, env);
    }

    const data = await upstream.json().catch(() => null);
    return json(data ?? { ok: false, code: "BAD_UPSTREAM_RESPONSE" }, upstream.status, origin, env);
  },
};
