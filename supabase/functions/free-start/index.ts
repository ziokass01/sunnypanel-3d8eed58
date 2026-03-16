import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { resolveCorsOrigin } from "../_shared/cors.ts";

function inferBaseUrl(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "";
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

function getClientIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    ?? "";
}

function base64url(bytesLen = 32) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(8),
  fingerprint: z.string().min(6).max(128).optional(),
  test_mode: z.boolean().optional().default(false),
});

function isMissingRateLimitSetup(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return haystack.includes("check_free_ip_rate_limit")
    || haystack.includes("check_free_fp_rate_limit")
    || haystack.includes("could not find the function")
    || haystack.includes("does not exist")
    || (haystack.includes("relation") && haystack.includes("rate_limit"));
}

function isActiveBlockUntil(blockedUntil?: string | null) {
  if (!blockedUntil) return true;
  const t = Date.parse(blockedUntil);
  return Number.isFinite(t) && t > Date.now();
}

async function safeInsertStartErrorSession(
  sb: any,
  payload: {
    ipHash: string;
    uaHash: string;
    fpHash: string;
    keyTypeCode: string;
    lastError: string;
  },
) {
  try {
const now = new Date();
    await sb.from("licenses_free_sessions").insert({
      status: "start_error",
      reveal_count: 0,
      ip_hash: payload.ipHash,
      ua_hash: payload.uaHash,
      fingerprint_hash: payload.fpHash,
      key_type_code: payload.keyTypeCode,
      duration_seconds: 0,
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 3 * 60 * 1000).toISOString(),
      last_error: payload.lastError,
    });
  } catch {
    // no-op
  }
}

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fp",
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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) {
      return jsonResponse({
        ok: false,
        msg: "SERVER_MISCONFIG_MISSING_SECRET",
        detail: !supabaseUrl ? "SUPABASE_URL missing" : "SUPABASE_SERVICE_ROLE_KEY missing",
      }, 500);
    }

    const sb: any = createClient<any>(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const safeLogSecurity = async (event_type: string, details: Record<string, unknown>, ip_hash?: string, fingerprint_hash?: string | null) => {
      try {
        await sb.from("licenses_free_security_logs").insert({
          event_type,
          route: "free-start",
          details,
          ip_hash: ip_hash ?? null,
          fingerprint_hash: fingerprint_hash ?? null,
        });
      } catch {
        // no-op
      }
    };

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

    const { key_type_code, test_mode } = parsed.data;
    const fpFromHeader = (req.headers.get("x-fp") ?? "").trim();
    const fingerprint = fpFromHeader || parsed.data.fingerprint || "";

    if (test_mode) {
      const admin = await assertAdmin(req);
      if (!admin.ok) return jsonResponse({ ok: false, msg: "UNAUTHORIZED" }, admin.status);
    }

    // Settings
    const { data: settings, error: sErr } = await sb
      .from("licenses_free_settings")
      .select("free_outbound_url,free_outbound_url_pass2,free_enabled,free_disabled_message,free_min_delay_enabled,free_min_delay_seconds,free_min_delay_seconds_pass2,free_link4m_rotate_days,free_session_waiting_limit,free_link4m_rotate_nonce_pass1,free_link4m_rotate_nonce_pass2")
      .eq("id", 1)
      .maybeSingle();

    if (sErr) {
      return jsonResponse({ ok: false, msg: sErr.message }, 500);
    }

    const free_enabled = Boolean(settings?.free_enabled ?? true);
    if (!free_enabled) {
      return jsonResponse({ ok: false, msg: "CLOSED" }, 403);
    }

    const rawOutbound = String(settings?.free_outbound_url ?? "").trim();
    const fallbackOutbound = "https://link4m.com/PkY7X";

    const baseUrl = inferBaseUrl(req) || PUBLIC_BASE_URL;
    if (!baseUrl) {
      return jsonResponse({ ok: false, code: "SERVER_MISCONFIG", msg: "Missing PUBLIC_BASE_URL" }, 500);
    }

    const claim_base_url = `${baseUrl}/free/claim`;

const LINK4M_API_TOKEN_PASS1 = (Deno.env.get("LINK4M_API_TOKEN_PASS1") ?? "").trim();
const LINK4M_API_TOKEN_PASS2 = (Deno.env.get("LINK4M_API_TOKEN_PASS2") ?? "").trim();

function computeRotateBucket(rotateDays: number, nonce = 0) {
  const days = Math.max(1, Math.floor(Number(rotateDays) || 7));
  const epochDays = Math.floor(Date.now() / 86400000); // UTC-ish
  const bucket = Math.floor(epochDays / days);
  return `${bucket}:${Math.max(0, Math.floor(Number(nonce) || 0))}`;
}

function applyTemplateApiToken(tpl: string, token: string) {
  const v = String(tpl || "");
  if (!token) return v;
  if (v.includes("{LINK4M_API_TOKEN}")) return v.replaceAll("{LINK4M_API_TOKEN}", token);
  return v;
}

const rotateDays = Number((settings as any)?.free_link4m_rotate_days ?? 7);
const rotateNoncePass1 = Number((settings as any)?.free_link4m_rotate_nonce_pass1 ?? 0);
const rotateNoncePass2 = Number((settings as any)?.free_link4m_rotate_nonce_pass2 ?? 0);
const sessionWaitingLimit = Math.max(1, Number((settings as any)?.free_session_waiting_limit ?? 2));
const rotate_bucket = computeRotateBucket(rotateDays, rotateNoncePass1);
const rotate_bucket_pass2 = computeRotateBucket(rotateDays, rotateNoncePass2);

    function buildOutboundUrl(outboundBase: string, gateUrl: string) {
      const tpl = String(outboundBase || "").trim();
      const g = String(gateUrl || "").trim();
      if (!tpl) return "";

      const hasPlaceholder = tpl.includes("{GATE_URL_ENC}") || tpl.includes("{GATE_URL}");

      // IMPORTANT: do NOT guess param names for Link4M.
      // If admin provides a Link4M URL but forgets placeholder, return explicit error.
      try {
        const u = new URL(tpl);
        const host = (u.hostname || "").toLowerCase();
        if (host.includes("link4m") && !hasPlaceholder) {
          // Allow Link4M "quick link" formats (no placeholder required):
          // - https://link4m.co/st?api=TOKEN&url=...
          // - https://link4m.co/api-shorten/v2?api=TOKEN&url=...
          // In these cases we overwrite the `url` param with the current gateUrl.
          const path = (u.pathname || "").replace(/\/+$/, "");
          const hasApi = u.searchParams.has("api") || u.searchParams.has("apikey") || u.searchParams.has("token");
          const looksQuick = (path.endsWith("/st") || path.includes("api-shorten")) && hasApi;
          const hasUrl = u.searchParams.has("url");
          if (looksQuick || hasUrl) {
            u.searchParams.set("url", g);
            return u.toString();
          }
          return "__TEMPLATE_INVALID__";
        }
      } catch {
        // ignore
      }

      if (tpl.includes("{GATE_URL_ENC}")) return tpl.replaceAll("{GATE_URL_ENC}", encodeURIComponent(g));
      if (tpl.includes("{GATE_URL}")) return tpl.replaceAll("{GATE_URL}", g);

      // For non-Link4M URLs, we keep a safe default of appending url=<gate>.
      try {
        const u = new URL(tpl);
        u.searchParams.append("url", g);
        return u.toString();
      } catch {
        // Fallback: naive append
        return tpl + (tpl.includes("?") ? "&" : "?") + `url=${encodeURIComponent(g)}`;
      }
    }


function isLink4mQuickUrl(raw: string) {
  try {
    const u = new URL(String(raw || "").trim());
    const host = (u.hostname || "").toLowerCase();
    if (!host.includes("link4m")) return false;
    const path = (u.pathname || "").replace(/\/+$/, "");
    const hasApi = u.searchParams.has("api") || u.searchParams.has("apikey") || u.searchParams.has("token");
    return Boolean((path.endsWith("/st") || path.includes("api-shorten")) && hasApi && u.searchParams.has("url"));
  } catch {
    return false;
  }
}

function pickUrlFromText(body: string) {
  const text = String(body || "");
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of ["short_url", "shortened_url", "url", "link", "shortlink", "data"]) {
      const value = parsed?.[key];
      if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
      if (value && typeof value === "object") {
        for (const nestedKey of ["short_url", "shortened_url", "url", "link", "shortlink"]) {
          const nested = (value as Record<string, unknown>)[nestedKey];
          if (typeof nested === "string" && /^https?:\/\//i.test(nested.trim())) return nested.trim();
        }
      }
    }
  } catch {
    // ignore json parsing
  }
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0].trim() : "";
}

async function resolveStableLink4mUrl(sb: any, passNo: 1 | 2, rotateBucket: string, outboundCandidate: string, gateUrl: string) {
  const raw = String(outboundCandidate || "").trim();
  if (!raw || raw === "__TEMPLATE_INVALID__") return raw;
  if (!isLink4mQuickUrl(raw)) return raw;

  const templateHash = await sha256Hex(raw);
  try {
    const cached = await sb
      .from("licenses_free_link4m_cache")
      .select("short_url")
      .eq("pass_no", passNo)
      .eq("rotate_bucket", rotateBucket)
      .eq("template_hash", templateHash)
      .maybeSingle();
    const cachedUrl = String((cached.data as any)?.short_url ?? "").trim();
    if (cachedUrl) return cachedUrl;
  } catch {
    // cache table may not exist yet
  }

  let stableUrl = raw;
  try {
    const resp = await fetch(raw, {
      method: "GET",
      redirect: "manual",
      headers: {
        "user-agent": "SunnyPanel/1.0 Link4M resolver",
        "accept": "text/html,application/json,text/plain,*/*",
      },
    });

    const location = String(resp.headers.get("location") || "").trim();
    if (location) {
      stableUrl = new URL(location, raw).toString();
    } else {
      const body = await resp.text();
      const extracted = pickUrlFromText(body);
      if (extracted) {
        stableUrl = new URL(extracted, raw).toString();
      }
    }
  } catch {
    stableUrl = raw;
  }

  try {
    await sb
      .from("licenses_free_link4m_cache")
      .upsert({
        pass_no: passNo,
        rotate_bucket: rotateBucket,
        template_hash: templateHash,
        gate_url: gateUrl,
        short_url: stableUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: "pass_no,rotate_bucket,template_hash" });
  } catch {
    // ignore cache write failures
  }

  return stableUrl;
}

    const outboundBase = rawOutbound || fallbackOutbound;

    // Key type must be enabled (keep this before session insert)
    // We'll build gate_url AFTER we have session_id.
    const { data: kt, error: kErr } = await sb
      .from("licenses_free_key_types")
      .select("code,label,duration_seconds,enabled,requires_double_gate")
      .eq("code", key_type_code)
      .maybeSingle();

    if (kErr) {
      return jsonResponse({ ok: false, msg: kErr.message }, 500);
    }
    if (!kt || !kt.enabled) {
      return jsonResponse({ ok: false, msg: "KEY_TYPE_DISABLED" }, 400);
    }

    const requiresDoubleGate = Boolean((kt as any).requires_double_gate);
    const out_token = base64url(32);
    const out_token_hash = await sha256Hex(out_token);
    const out_token_pass2 = requiresDoubleGate ? base64url(32) : "";
    const out_token_hash_pass2 = out_token_pass2 ? await sha256Hex(out_token_pass2) : null;

    const ua = req.headers.get("user-agent") ?? "";
    const ip = getClientIp(req);

    const fpHash = fingerprint ? await sha256Hex(fingerprint) : await sha256Hex(`missing:${ua}:${ip}`);
    const uaHash = await sha256Hex(ua);
    const ipHash = await sha256Hex(ip);

    const rl = await (async () => {
      // Support both newer signature (p_route, p_window_seconds) and legacy (p_window_sec, no p_route)
      const primary = await sb.rpc("check_free_ip_rate_limit", {
        p_ip_hash: ipHash,
        p_route: "free-start",
        p_limit: 25,
        p_window_seconds: 60,
      });
      if (!primary.error) return primary;

      const legacy = await sb.rpc("check_free_ip_rate_limit", {
        p_ip_hash: ipHash,
        p_limit: 25,
        p_window_sec: 60,
      });
      return legacy;
    })();
    if (rl.error) {
      if (isMissingRateLimitSetup(rl.error)) {
        await safeInsertStartErrorSession(sb, {
          ipHash,
          uaHash,
          fpHash,
          keyTypeCode: key_type_code,
          lastError: "SERVER_RATE_LIMIT_MISCONFIG",
        });
         return jsonResponse(
           {
             ok: false,
             code: "SERVER_RATE_LIMIT_MISCONFIG",
             msg: "Server thiếu migration FREE (thiếu RPC/bảng rate-limit). Cần chạy: 20260205101000_free_schema.sql, 20260205170000_free_rate_limit_and_admin_controls.sql, 20260206150000_free_schema_runtime_fix.sql",
           },
           503,
         );
      }
      await safeLogSecurity("rate_limit_error", { key_type_code, error: rl.error.message || "unknown" }, ipHash, fpHash);
      await safeInsertStartErrorSession(sb, {
        ipHash,
        uaHash,
        fpHash,
        keyTypeCode: key_type_code,
        lastError: "RATE_LIMIT_CHECK_FAILED",
      });
      return jsonResponse({ ok: false, msg: "RATE_LIMIT_CHECK_FAILED", detail: "Kiểm tra RPC check_free_ip_rate_limit/check_free_fp_rate_limit và bảng licenses_free_*" }, 500);
    }
    const allowed = Array.isArray(rl.data) ? rl.data[0]?.allowed : rl.data?.allowed;
    if (allowed === false) {
      await safeLogSecurity("rate_limit_ip_blocked", { key_type_code }, ipHash, fingerprint ? fpHash : null);
      return jsonResponse({ ok: false, msg: "RATE_LIMIT" }, 429);
    }

    if (fingerprint) {
       const fpRl = await (async () => {
         const primary = await sb.rpc("check_free_fp_rate_limit", {
           p_fp_hash: fpHash,
           p_route: "free-start",
           p_limit: 12,
           p_window_seconds: 60,
         });
         if (!primary.error) return primary;

         const legacy = await sb.rpc("check_free_fp_rate_limit", {
           p_fp_hash: fpHash,
           p_route: "free-start",
           p_limit: 12,
           p_window_sec: 60,
         });
         return legacy;
       })();
      if (fpRl.error) {
        if (isMissingRateLimitSetup(fpRl.error)) {
          await safeInsertStartErrorSession(sb, {
            ipHash,
            uaHash,
            fpHash,
            keyTypeCode: key_type_code,
            lastError: "SERVER_RATE_LIMIT_MISCONFIG",
          });
           return jsonResponse(
             {
               ok: false,
               code: "SERVER_RATE_LIMIT_MISCONFIG",
               msg: "Server thiếu migration FREE (thiếu RPC/bảng rate-limit). Cần chạy: 20260205101000_free_schema.sql, 20260205170000_free_rate_limit_and_admin_controls.sql, 20260206150000_free_schema_runtime_fix.sql",
             },
             503,
           );
        }
        await safeInsertStartErrorSession(sb, {
          ipHash,
          uaHash,
          fpHash,
          keyTypeCode: key_type_code,
          lastError: "RATE_LIMIT_CHECK_FAILED",
        });
        return jsonResponse({ ok: false, msg: "RATE_LIMIT_CHECK_FAILED", detail: "Kiểm tra RPC check_free_ip_rate_limit/check_free_fp_rate_limit và bảng licenses_free_*" }, 500);
      }
      const fpAllowed = Array.isArray(fpRl.data) ? fpRl.data[0]?.allowed : fpRl.data?.allowed;
      if (fpAllowed === false) {
        await safeLogSecurity("rate_limit_fp_blocked", { key_type_code }, ipHash, fpHash);
        return jsonResponse({ ok: false, msg: "RATE_LIMIT" }, 429);
      }
    }

    const banned = await sb
      .from("licenses_free_blocklist")
      .select("id,blocked_until")
      .eq("enabled", true)
      .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`)
      .limit(1)
      .maybeSingle();
    if (banned.data?.id && isActiveBlockUntil((banned.data as any).blocked_until)) {
      await safeLogSecurity("blocklist_hit", { key_type_code }, ipHash, fingerprint ? fpHash : null);
      return jsonResponse({ ok: false, msg: "BLOCKED" }, 403);
    }

    const pendingWindowFrom = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const pendingStatuses = ["started", "gate_ok", "pass1_ok"];
    const pendingQuery = await sb
      .from("licenses_free_sessions")
      .select("session_id", { count: "exact", head: true })
      .eq("fingerprint_hash", fpHash)
      .in("status", pendingStatuses)
      .gte("created_at", pendingWindowFrom);

    const pendingCount = Number(pendingQuery.count ?? 0);
    if (pendingCount >= sessionWaitingLimit) {
      await safeLogSecurity("session_waiting_limit", { key_type_code, pendingCount, limit: sessionWaitingLimit }, ipHash, fingerprint ? fpHash : null);
      return jsonResponse({ ok: false, code: "SESSION_PENDING_LIMIT", msg: "SESSION_PENDING_LIMIT" }, 429);
    }

    // out_token generated above (must be included in gate_url + stored hashed in session)
    // const out_token = base64url(32);
    // const out_token_hash = await sha256Hex(out_token);

    const now = new Date();
    const started_at = now.toISOString();
    const expires_at = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 minutes
    const out_expires_at = expires_at;

    const duration_seconds = Number(kt.duration_seconds ?? 0);

    const { data: insData, error: insErr } = await sb.from("licenses_free_sessions").insert({
      status: "started",
      reveal_count: 0,
      ip_hash: ipHash,
      ua_hash: uaHash,
      fingerprint_hash: fpHash,
      started_at,
      expires_at,
      out_token_hash,
      out_expires_at,
      key_type_code,
      duration_seconds,
      passes_required: requiresDoubleGate ? 2 : 1,
      passes_completed: 0,
      current_pass: 1,
      rotate_bucket,
      rotate_bucket_pass2,
      out_token_hash_pass2,
    }).select("session_id").single();

    if (insErr || !insData?.session_id) {
      return jsonResponse({ ok: false, code: "SERVER_ERROR", msg: insErr?.message ?? "SESSION_INSERT_FAILED" }, 500);
    }

    const session_id = insData.session_id as string;
    

// Keep Link4M target stable within the rotate bucket.
// Session/token stay in local bundle and are verified at /free/gate, so we do not
// need to generate a brand-new Link4M URL for every Get Key click.
const gate_url_pass1 = `${baseUrl}/free/gate?p=1&b=${encodeURIComponent(rotate_bucket)}`;
const gate_url_pass2 = `${baseUrl}/free/gate?p=2&b=${encodeURIComponent(rotate_bucket_pass2)}`;

// Outbound templates
const outboundBasePass1 = rawOutbound || fallbackOutbound;
const rawOutboundPass2 = String((settings as any)?.free_outbound_url_pass2 ?? "").trim();
const outboundBasePass2 = rawOutboundPass2 || outboundBasePass1;

const token1 = LINK4M_API_TOKEN_PASS1;
const token2 = LINK4M_API_TOKEN_PASS2 || LINK4M_API_TOKEN_PASS1;

const tpl1 = applyTemplateApiToken(outboundBasePass1, token1);
const tpl2 = applyTemplateApiToken(outboundBasePass2, token2);

let builtOutbound = test_mode ? gate_url_pass1 : buildOutboundUrl(tpl1, gate_url_pass1);
let builtOutboundPass2 = test_mode ? gate_url_pass2 : buildOutboundUrl(tpl2, gate_url_pass2);
if (!test_mode) {
  builtOutbound = await resolveStableLink4mUrl(sb, 1, rotate_bucket, builtOutbound, gate_url_pass1);
  if (requiresDoubleGate) {
    builtOutboundPass2 = await resolveStableLink4mUrl(sb, 2, rotate_bucket_pass2, builtOutboundPass2, gate_url_pass2);
  }
}
    if (!builtOutbound) return jsonResponse({ ok: false, code: "MISSING_OUTBOUND_URL", msg: "MISSING_OUTBOUND_URL" }, 500);
    if (builtOutbound === "__TEMPLATE_INVALID__") {
      return jsonResponse(
        {
          ok: false,
          code: "OUTBOUND_URL_TEMPLATE_INVALID",
          msg:
            "Link4M outbound template thiếu placeholder. Hãy dùng {GATE_URL_ENC} hoặc {GATE_URL}. Ví dụ: https://link4m.com/PkY7X?redirect={GATE_URL_ENC}",
        },
        400,
      );
    }

    const outbound_url = builtOutbound;

    const minDelayEnabled = Boolean((settings as any)?.free_min_delay_enabled ?? true);
    const minDelayRaw = Number(minDelayEnabled ? ((settings as any)?.free_min_delay_seconds ?? 25) : 0);
    const min_delay_seconds = Math.max(0, minDelayRaw); // allow 0 to disable

    const minDelayPass2Raw = Number((settings as any)?.free_min_delay_seconds_pass2 ?? min_delay_seconds);
    const min_delay_seconds_pass2 = Math.max(0, minDelayEnabled ? (Math.floor(minDelayPass2Raw) || min_delay_seconds) : 0);

    return jsonResponse({ ok: true, out_token, out_token_pass2: out_token_pass2 || null, session_id, outbound_url, outbound_url_pass2: builtOutboundPass2, gate_url: gate_url_pass1, gate_url_pass2, claim_base_url, min_delay_seconds, min_delay_seconds_pass2, passes_required: requiresDoubleGate ? 2 : 1, rotate_bucket }, 200);
  } catch (error) {
    console.error("free-start error", error);
    return jsonResponse({
      ok: false,
      msg: "SERVER_ERROR",
      detail: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
