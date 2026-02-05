import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";

const KNOWN_HOSTS = new Set(["mityangho.id.vn", "sunnypanel.lovable.app"]);

function isAllowedOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.host;
    if (KNOWN_HOSTS.has(host)) return true;
    if (host === "lovable.dev" || host.endsWith(".lovable.dev") || host.endsWith(".lovable.app")) return true;
    if (publicBaseUrl) {
      const pb = new URL(publicBaseUrl);
      const pbHost = pb.host;
      return host === pbHost || host.endsWith(`.${pbHost}`);
    }
    return false;
  } catch {
    return false;
  }
}

function resolveCorsOrigin(origin: string, publicBaseUrl: string) {
  if (isAllowedOrigin(origin, publicBaseUrl)) return origin;
  if (publicBaseUrl && isAllowedOrigin(publicBaseUrl, publicBaseUrl)) return publicBaseUrl;
  return "https://mityangho.id.vn";
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function base64url(bytesLen = 32) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const BodySchema = z.object({
  out_token: z.string().min(8).max(256),
  fingerprint: z.string().min(6).max(128),
  referrer: z.string().optional().default(""),
  test_mode: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ ok: false, msg: "MISSING_SUPABASE_SECRETS" }, 500);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, msg: "BAD_REQUEST" }, 400);
  }

  const { out_token, fingerprint, referrer, test_mode } = parsed.data;

  if (test_mode) {
    const admin = await assertAdmin(req);
    if (!admin.ok) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, admin.status);
  }

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_enabled,free_disabled_message,free_min_delay_seconds,free_min_delay_enabled,free_require_link4m_referrer")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return jsonResponse({ ok: false, msg: sErr.message }, 500);
  }

  if (!Boolean(settings?.free_enabled ?? true)) {
    return jsonResponse({ ok: false, msg: "CLOSED" }, 403);
  }

  const requireRef = Boolean(settings?.free_require_link4m_referrer ?? false);
  if (requireRef && !test_mode) {
    try {
      const u = new URL(referrer);
      const host = (u.hostname || "").toLowerCase();
      // Link4M domains can vary (e.g. link4m.com / link4m.xyz / link4m.app...).
      // Referrer is not 100% reliable across browsers, so keep this check lenient.
      if (!host.includes("link4m")) {
        return jsonResponse({ ok: false, msg: "BAD_REFERRER" }, 400);
      }
    } catch {
      return jsonResponse({ ok: false, msg: "BAD_REFERRER" }, 400);
    }
  }

  const outHash = await sha256Hex(out_token);
  const fpHash = await sha256Hex(fingerprint);
  const uaHash = await sha256Hex(req.headers.get("user-agent") ?? "");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "";
  const ipHash = await sha256Hex(ip);

  const rl = await sb.rpc("check_free_ip_rate_limit", {
    p_ip_hash: ipHash,
    p_route: "free-gate",
    p_limit: 50,
    p_window_seconds: 60,
  });
  if (rl.error) return jsonResponse({ ok: false, msg: "RATE_LIMIT_CHECK_FAILED" }, 500);
  const allowed = Array.isArray(rl.data) ? rl.data[0]?.allowed : rl.data?.allowed;
  if (allowed === false) return jsonResponse({ ok: false, msg: "RATE_LIMIT" }, 429);

  const banned = await sb
    .from("licenses_free_blocklist")
    .select("id")
    .eq("enabled", true)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`)
    .limit(1)
    .maybeSingle();
  if (banned.data?.id) return jsonResponse({ ok: false, msg: "BLOCKED" }, 403);

  // Find session
  const { data: sess, error: qErr } = await sb
    .from("licenses_free_sessions")
    .select(
      "session_id,status,created_at,expires_at,started_at,fingerprint_hash,ua_hash,reveal_count,claim_token_hash,claim_expires_at,claim_token_plain",
    )
    .eq("out_token_hash", outHash)
    .maybeSingle();

  if (qErr) {
    return jsonResponse({ ok: false, msg: qErr.message }, 500);
  }

  if (!sess) {
    return jsonResponse({ ok: false, msg: "INVALID_SESSION" }, 400);
  }

  if (sess.status && !["started", "gate_ok"].includes(sess.status)) {
    return jsonResponse({ ok: false, msg: "INVALID_SESSION" }, 400);
  }

  // Expired?
  const now = Date.now();
  const expiresAt = Date.parse(sess.expires_at);
  if (!isFinite(expiresAt) || expiresAt <= now) {
    return jsonResponse({ ok: false, msg: "SESSION_EXPIRED" }, 400);
  }

  if (sess.fingerprint_hash !== fpHash || sess.ua_hash !== uaHash) {
    return jsonResponse({ ok: false, msg: "DEVICE_MISMATCH" }, 403);
  }

  if (sess.reveal_count && sess.reveal_count > 0) {
    return jsonResponse({ ok: false, msg: "ALREADY_REVEALED" }, 400);
  }

  const delayEnabled = Boolean((settings as any)?.free_min_delay_enabled ?? true);
  if (delayEnabled && !test_mode) {
    const minDelay = Math.max(5, Number(settings?.free_min_delay_seconds ?? 25));
    const startedAtIso = sess.started_at ?? (sess as any).created_at ?? new Date(now).toISOString();
    const startedAtMs = Date.parse(startedAtIso);
    const mustWaitUntil = startedAtMs + minDelay * 1000;
    if (isFinite(startedAtMs) && now < mustWaitUntil) {
      const wait_seconds = Math.ceil((mustWaitUntil - now) / 1000);
      await sb
        .from("licenses_free_sessions")
        .update({
          status: "gate_failed",
          last_error: "TOO_FAST",
          expires_at: new Date().toISOString(),
          out_expires_at: new Date().toISOString(),
        })
        .eq("session_id", sess.session_id);
      return jsonResponse({ ok: false, msg: "TOO_FAST", wait_seconds }, 429);
    }
  }

  // Idempotency: if claim token already issued and still valid, return the same plaintext token.
  const claimExp = sess.claim_expires_at ? Date.parse(sess.claim_expires_at) : 0;
  if (sess.status === "gate_ok" && sess.claim_token_hash && sess.claim_token_plain && claimExp && claimExp > now) {
    return jsonResponse({ ok: true, claim_token: sess.claim_token_plain }, 200);
  }

  if (sess.status === "gate_ok" && sess.claim_token_hash && !sess.claim_token_plain) {
    return jsonResponse({ ok: false, msg: "ALREADY_GATE_OK" }, 409);
  }

  // Generate claim token
  const claim_token = base64url(32);
  const claim_token_hash = await sha256Hex(claim_token);
  const claim_expires_at = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 minutes

  const { error: updErr } = await sb
    .from("licenses_free_sessions")
    .update({
      status: "gate_ok",
      gate_ok_at: new Date().toISOString(),
      claim_token_hash,
      claim_token_plain: claim_token,
      claim_expires_at,
      last_error: null,
    })
    .eq("session_id", sess.session_id);

  if (updErr) {
    return jsonResponse({ ok: false, msg: updErr.message }, 500);
  }

  return jsonResponse({ ok: true, claim_token }, 200);
});
