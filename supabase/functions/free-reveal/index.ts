import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

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

function randomChunk(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeKey() {
  return `SUNNY-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function maskKey(key: string) {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

async function verifyTurnstile(secret: string, token: string, remoteIp?: string) {
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => null)) as any;
  return Boolean(data?.success);
}

const BodySchema = z.object({
  claim_token: z.string().min(8).max(512),
  out_token: z.string().min(8).max(256),
  fingerprint: z.string().min(6).max(128),
  turnstile_token: z.string().min(10).max(4096).nullable().optional(),
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, msg: "INVALID_INPUT" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, msg: "INVALID_INPUT" }, 400);
  }

  const { test_mode } = parsed.data;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse({ ok: false, msg: "SERVER_MISCONFIG" }, 500);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  if (test_mode) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization");
    if (!anonKey || !authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 401);
    }
    const authed = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await authed.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 401);
    const userId = claims.claims.sub;
    const roleCheck = await authed.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleCheck.error || roleCheck.data !== true) return jsonResponse({ ok: false, msg: "FORBIDDEN" }, 403);
  }

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_enabled,free_disabled_message,free_daily_limit_per_fingerprint")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return jsonResponse({ ok: false, msg: sErr.message }, 500);
  }

  if (!Boolean(settings?.free_enabled ?? true)) {
    return jsonResponse({ ok: false, msg: "CLOSED" }, 403);
  }

  // Optional Turnstile (controlled by env presence)
  const TURNSTILE_SITE_KEY = Deno.env.get("TURNSTILE_SITE_KEY") ?? "";
  const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  const turnstile_enabled = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
  if (turnstile_enabled && !test_mode) {
    const token = (parsed.data.turnstile_token ?? "")?.trim();
    if (!token) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 200);
    const ok = await verifyTurnstile(TURNSTILE_SECRET_KEY, token, ip);
    if (!ok) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  const claimHash = await sha256Hex(parsed.data.claim_token);
  const outHash = await sha256Hex(parsed.data.out_token);
  const fpHash = await sha256Hex(parsed.data.fingerprint);
  const uaHash = await sha256Hex(ua);
  const ipHash = await sha256Hex(ip);

  const { data: sess, error: qErr } = await sb
    .from("licenses_free_sessions")
    .select(
      "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,key_type_code,duration_seconds,revealed_license_id",
    )
    .eq("out_token_hash", outHash)
    .eq("claim_token_hash", claimHash)
    .maybeSingle();

  if (qErr || !sess) {
    return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  if (sess.fingerprint_hash !== fpHash || sess.ua_hash !== uaHash) {
    return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  const fetchLicense = async () => {
    const direct = sess.revealed_license_id
      ? await sb.from("licenses").select("id,key,expires_at").eq("id", sess.revealed_license_id).maybeSingle()
      : null;
    if (direct?.data?.key) return direct.data;

    const issue = await sb
      .from("licenses_free_issues")
      .select("license_id")
      .eq("session_id", sess.session_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!issue?.data?.license_id) return null;

    const fallback = await sb.from("licenses").select("id,key,expires_at").eq("id", issue.data.license_id).maybeSingle();
    return fallback.data ?? null;
  };

  if (sess.reveal_count > 0 || sess.status === "revealed" || sess.revealed_license_id) {
    // Idempotent: never create a new license once revealed.
    const existing = await fetchLicense();
    if (existing?.key) {
      let keyTypeLabel: string | null = null;
      if (sess.key_type_code) {
        const kt = await sb.from("licenses_free_key_types").select("label").eq("code", sess.key_type_code).maybeSingle();
        keyTypeLabel = kt.data?.label ?? null;
      }
      return jsonResponse({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label: keyTypeLabel });
    }
    return jsonResponse({ ok: false, msg: "ALREADY_REVEALED" }, 200);
  }

  const now = Date.now();
  const expMs = Date.parse(sess.expires_at);
  const claimExpMs = sess.claim_expires_at ? Date.parse(sess.claim_expires_at) : 0;

  if (
    sess.status !== "gate_ok" ||
    Number(sess.reveal_count ?? 0) > 0 ||
    !sess.claim_token_hash ||
    sess.claim_token_hash !== claimHash ||
    !claimExpMs ||
    claimExpMs < now ||
    !isFinite(expMs) ||
    expMs < now
  ) {
    await sb.from("licenses_free_sessions").update({ last_error: "CLAIM_INVALID" }).eq("session_id", sess.session_id);
    return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  const lock = await sb
    .from("licenses_free_sessions")
    .update({ status: "revealing", last_error: null })
    .eq("session_id", sess.session_id)
    .eq("status", "gate_ok")
    .eq("reveal_count", 0)
    .is("revealed_license_id", null)
    .select("session_id")
    .maybeSingle();

  if (!lock.data) {
    const latest = await sb
      .from("licenses_free_sessions")
      .select("status,reveal_count,revealed_license_id")
      .eq("session_id", sess.session_id)
      .maybeSingle();
    if (latest?.data?.status === "revealed" || (latest?.data?.reveal_count ?? 0) > 0 || latest?.data?.revealed_license_id) {
      const existing = await fetchLicense();
      if (existing?.key) {
        let keyTypeLabel: string | null = null;
        if (sess.key_type_code) {
          const kt = await sb.from("licenses_free_key_types").select("label").eq("code", sess.key_type_code).maybeSingle();
          keyTypeLabel = kt.data?.label ?? null;
        }
        return jsonResponse({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label: keyTypeLabel });
      }
      return jsonResponse({ ok: false, msg: "ALREADY_REVEALED" }, 200);
    }
    return jsonResponse({ ok: false, msg: "REVEAL_IN_PROGRESS" }, 200);
  }

  const dailyLimit = Math.max(1, Number(settings?.free_daily_limit_per_fingerprint ?? 1));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const quota = await sb
    .from("licenses_free_issues")
    .select("issue_id", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("fingerprint_hash", fpHash);

  const used = quota.count ?? 0;
  if (used >= dailyLimit) {
    await sb
      .from("licenses_free_sessions")
      .update({ last_error: "DAILY_QUOTA", status: "gate_ok" })
      .eq("session_id", sess.session_id);
    return jsonResponse({ ok: false, msg: "RATE_LIMIT" }, 429);
  }

  const dur = Math.max(60, Number(sess.duration_seconds ?? 0));
  const expires_at = new Date(Date.now() + dur * 1000).toISOString();

  let keyTypeLabel: string | null = null;
  if (sess.key_type_code) {
    const kt = await sb.from("licenses_free_key_types").select("label").eq("code", sess.key_type_code).maybeSingle();
    keyTypeLabel = kt.data?.label ?? null;
  }

  let inserted: { id: string; key: string } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = makeKey();
    const ins = await sb
      .from("licenses")
      .insert({
        key,
        is_active: true,
        max_devices: 1,
        expires_at,
        start_on_first_use: false,
        starts_on_first_use: false,
        duration_days: null,
        duration_seconds: dur,
        activated_at: null,
        first_used_at: null,
        note: sess.key_type_code ? `FREE_${sess.key_type_code.toUpperCase()}` : "FREE",
      })
      .select("id,key")
      .single();
    if (!ins.error && ins.data?.id) {
      inserted = { id: ins.data.id, key: ins.data.key };
      break;
    }
  }

  if (!inserted) {
    await sb
      .from("licenses_free_sessions")
      .update({ last_error: "INSERT_FAILED", status: "gate_ok" })
      .eq("session_id", sess.session_id);
    return jsonResponse({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  const finalize = await sb
    .from("licenses_free_sessions")
    .update({
      status: "revealed",
      reveal_count: 1,
      revealed_at: new Date().toISOString(),
      revealed_license_id: inserted.id,
      last_error: null,
    })
    .eq("session_id", sess.session_id)
    .eq("status", "revealing")
    .is("revealed_license_id", null)
    .select("session_id")
    .maybeSingle();

  if (!finalize.data) {
    await sb.from("licenses").delete().eq("id", inserted.id);
    const existing = await fetchLicense();
    if (existing?.key) {
      return jsonResponse({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label: keyTypeLabel });
    }
    return jsonResponse({ ok: false, msg: "ALREADY_REVEALED" }, 200);
  }

  await sb.from("licenses_free_issues").insert({
    license_id: inserted.id,
    key_mask: maskKey(inserted.key),
    expires_at,
    session_id: sess.session_id,
    ip_hash: ipHash,
    fingerprint_hash: fpHash,
    ua_hash: uaHash,
  });

  return jsonResponse({ ok: true, key: inserted.key, expires_at, key_type_label: keyTypeLabel }, 200);
});
