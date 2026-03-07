import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders } from "../_shared/cors.ts";

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

function base64url(bytesLen = 18) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "";
}

function inferBaseUrl(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "";
}

function isActiveBlockUntil(blockedUntil?: string | null) {
  if (!blockedUntil) return true;
  const t = Date.parse(blockedUntil);
  return Number.isFinite(t) && t > Date.now();
}

function applyTemplateApiToken(tpl: string, token: string) {
  const v = String(tpl || "");
  if (!token) return v;
  if (v.includes("{LINK4M_API_TOKEN}")) return v.replaceAll("{LINK4M_API_TOKEN}", token);
  return v;
}


function parseSidAndTokenFromUrl(raw: string) {
  const url = String(raw || "").trim();
  if (!url) return { sid: "", token: "" };
  try {
    const u = new URL(url);
    return {
      sid: String(u.searchParams.get("sid") || "").trim(),
      token: String(u.searchParams.get("t") || "").trim(),
    };
  } catch {
    return { sid: "", token: "" };
  }
}

function buildOutboundUrl(outboundBase: string, gateUrl: string) {
  const tpl = String(outboundBase || "").trim();
  const g = String(gateUrl || "").trim();
  if (!tpl) return "";

  const hasPlaceholder = tpl.includes("{GATE_URL_ENC}") || tpl.includes("{GATE_URL}");

  try {
    const u = new URL(tpl);
    const host = (u.hostname || "").toLowerCase();
    if (host.includes("link4m") && !hasPlaceholder) {
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

  try {
    const u = new URL(tpl);
    u.searchParams.append("url", g);
    return u.toString();
  } catch {
    return tpl + (tpl.includes("?") ? "&" : "?") + `url=${encodeURIComponent(g)}`;
  }
}

const BodySchema = z.object({
  pass: z.number().int().min(1).max(2).optional().default(1),
  session_id: z.string().uuid().optional(),
  out_token: z.string().min(8).max(512).optional(),
  fingerprint: z.string().min(6).max(128),
  referrer: z.string().optional().default(""),
  current_url: z.string().optional().default(""),
});

type JsonErr = { ok: false; code?: string; msg: string; detail?: unknown };

type NextOk =
  | { ok: true; next: "PASS2"; out_token: string; outbound_url: string; min_delay_seconds: number }
  | { ok: true; next: "CLAIM"; claim_token: string; claim_url: string };

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const cors = corsHeaders(origin, PUBLIC_BASE_URL, "POST,OPTIONS");

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors, status: 204 });
  }

  if (req.method !== "POST") {
    return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" } satisfies JsonErr, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return json(
      {
        ok: false,
        code: "FREE_NOT_READY",
        msg: "Missing backend secrets",
        missing: [!supabaseUrl ? "SUPABASE_URL" : null, !serviceRole ? "SUPABASE_SERVICE_ROLE_KEY" : null].filter(Boolean),
      },
      503,
    );
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
    return json({ ok: false, code: "BAD_REQUEST", msg: "BAD_REQUEST" } satisfies JsonErr, 400);
  }

  const { pass, session_id: bodySid, out_token: bodyOutToken, fingerprint, referrer, current_url } = parsed.data;
  const parsedUrlBits = parseSidAndTokenFromUrl(current_url);
  const sid = String(bodySid || parsedUrlBits.sid || "").trim();
  const outToken = String(bodyOutToken || parsedUrlBits.token || "").trim();

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select(
      "free_enabled,free_disabled_message,free_min_delay_enabled,free_min_delay_seconds,free_min_delay_seconds_pass2,free_require_link4m_referrer,free_outbound_url,free_outbound_url_pass2,free_link4m_rotate_days",
    )
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return json({ ok: false, code: "SERVER_ERROR", msg: sErr.message } satisfies JsonErr, 500);
  }

  if (!Boolean(settings?.free_enabled ?? true)) {
    return json({ ok: false, code: "CLOSED", msg: "CLOSED" } satisfies JsonErr, 403);
  }

  const LINK4M_API_TOKEN_PASS1 = (Deno.env.get("LINK4M_API_TOKEN_PASS1") ?? "").trim();
  const LINK4M_API_TOKEN_PASS2 = (Deno.env.get("LINK4M_API_TOKEN_PASS2") ?? "").trim();

  if (!outToken) {
    return json({ ok: false, code: "BAD_REQUEST", msg: "MISSING_OUT_TOKEN" } satisfies JsonErr, 400);
  }

  const outHash = await sha256Hex(outToken);
  const fpHash = await sha256Hex(fingerprint);
  const uaHash = await sha256Hex(req.headers.get("user-agent") ?? "");
  const ipHash = await sha256Hex(getClientIp(req));

  // Blocklist
  const blocked = await sb
    .from("licenses_free_blocklist")
    .select("id,blocked_until")
    .eq("enabled", true)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`)
    .limit(1)
    .maybeSingle();
  if (blocked.data?.id && isActiveBlockUntil((blocked.data as any).blocked_until)) {
    return json({ ok: false, code: "BLOCKED", msg: "BLOCKED" } satisfies JsonErr, 403);
  }

  // Load session
  if (!sid) {
    return json({ ok: false, code: "BAD_REQUEST", msg: "MISSING_SESSION" } satisfies JsonErr, 400);
  }

  const { data: sess, error: qErr } = await sb
    .from("licenses_free_sessions")
    .select(
      "session_id,status,created_at,expires_at,started_at,fingerprint_hash,ua_hash,ip_hash,reveal_count,claim_token_hash,claim_expires_at,out_token_hash,out_token_hash_pass2,key_type_code,passes_required,passes_completed,current_pass,rotate_bucket,pass2_started_at",
    )
    .eq("session_id", sid)
    .maybeSingle();

  if (qErr) return json({ ok: false, code: "SERVER_ERROR", msg: qErr.message } satisfies JsonErr, 500);
  if (!sess) return json({ ok: false, code: "INVALID_SESSION", msg: "INVALID_SESSION" } satisfies JsonErr, 400);

  // Expired?
  const nowMs = Date.now();
  const expiresAt = Date.parse((sess as any).expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) {
    return json({ ok: false, code: "SESSION_EXPIRED", msg: "SESSION_EXPIRED" } satisfies JsonErr, 400);
  }

  // Device match
  if ((sess as any).fingerprint_hash !== fpHash || (sess as any).ua_hash !== uaHash || (sess as any).ip_hash !== ipHash) {
    return json({ ok: false, code: "DEVICE_MISMATCH", msg: "DEVICE_MISMATCH" } satisfies JsonErr, 403);
  }

  // Referrer policy (allow if token matches the right pass)
  const requireRef = Boolean((settings as any)?.free_require_link4m_referrer ?? false);
  const r = String(referrer ?? "").trim();
  let hostOk = false;
  if (r) {
    try {
      const u = new URL(r);
      const host = (u.hostname || "").toLowerCase();
      hostOk = host.includes("link4m");
    } catch {
      hostOk = false;
    }
  }

  const hashPass1 = (sess as any).out_token_hash;
  const hashPass2 = (sess as any).out_token_hash_pass2;
  const matchPass1 = Boolean(hashPass1 && hashPass1 === outHash);
  const matchPass2 = Boolean(hashPass2 && hashPass2 === outHash);

  let resolvedPass = pass;
  let tokenVerified = pass === 2 ? matchPass2 : matchPass1;
  if (!tokenVerified) {
    if (matchPass2) {
      resolvedPass = 2;
      tokenVerified = true;
    } else if (matchPass1) {
      resolvedPass = 1;
      tokenVerified = true;
    }
  }

  if (!tokenVerified && current_url) {
    const currentBits = parseSidAndTokenFromUrl(current_url);
    if (currentBits.token) {
      const currentHash = await sha256Hex(currentBits.token);
      tokenVerified = Boolean(expectedHash && expectedHash === currentHash);
    }
  }

  if (requireRef && !hostOk && !tokenVerified) {
    if (!r) {
      return json(
        {
          ok: false,
          code: "REFERRER_REQUIRED",
          msg: "REFERRER_REQUIRED",
          detail: { hint: "Referrer bị trống. Bạn cần đi qua Link4M.", current_url },
        } satisfies JsonErr,
        400,
      );
    }
    return json({ ok: false, code: "BAD_REFERRER", msg: "BAD_REFERRER", detail: { referrer: r } } satisfies JsonErr, 400);
  }

  if (!tokenVerified) {
    return json({ ok: false, code: "OUT_TOKEN_MISMATCH", msg: "OUT_TOKEN_MISMATCH" } satisfies JsonErr, 403);
  }

  if ((sess as any).reveal_count && (sess as any).reveal_count > 0) {
    return json({ ok: false, code: "ALREADY_REVEALED", msg: "ALREADY_REVEALED" } satisfies JsonErr, 200);
  }

  const minDelayEnabled = Boolean((settings as any)?.free_min_delay_enabled ?? true);
  const minDelay1 = Math.max(0, Number(minDelayEnabled ? ((settings as any)?.free_min_delay_seconds ?? 0) : 0));
  const minDelay2 = Math.max(0, Number(minDelayEnabled ? ((settings as any)?.free_min_delay_seconds_pass2 ?? minDelay1) : 0));

  const startedAtIso = (sess as any).started_at ?? (sess as any).created_at ?? new Date(nowMs).toISOString();
  const startedAtMs = Date.parse(startedAtIso);

  const pass2StartedIso = (sess as any).pass2_started_at ?? null;
  const pass2StartedMs = pass2StartedIso ? Date.parse(pass2StartedIso) : NaN;

  const required = Math.max(1, Math.min(2, Number((sess as any).passes_required ?? 1)));
  const completed = Math.max(0, Math.min(2, Number((sess as any).passes_completed ?? 0)));

  // Delay enforcement
  if (resolvedPass === 1) {
    const mustWaitUntil = startedAtMs + minDelay1 * 1000;
    if (minDelay1 > 0 && Number.isFinite(startedAtMs) && nowMs < mustWaitUntil) {
      const nowIso = new Date().toISOString();
      try {
        await sb
          .from("licenses_free_sessions")
          .update({
            status: "gate_fail",
            last_error: "TOO_FAST",
            expires_at: nowIso,
            out_expires_at: nowIso,
            claim_token_hash: null,
            claim_expires_at: null,
          })
          .eq("session_id", (sess as any).session_id);
      } catch {
        // ignore
      }
      return json({ ok: false, code: "TOO_FAST", msg: "TOO_FAST" } satisfies JsonErr, 200);
    }
  } else {
    // pass 2
    if (!Number.isFinite(pass2StartedMs)) {
      return json({ ok: false, code: "PASS2_NOT_READY", msg: "PASS2_NOT_READY" } satisfies JsonErr, 400);
    }
    const mustWaitUntil = pass2StartedMs + minDelay2 * 1000;
    if (minDelay2 > 0 && nowMs < mustWaitUntil) {
      const nowIso = new Date().toISOString();
      try {
        await sb
          .from("licenses_free_sessions")
          .update({
            status: "gate_fail",
            last_error: "TOO_FAST_PASS2",
            expires_at: nowIso,
            out_expires_at: nowIso,
            claim_token_hash: null,
            claim_expires_at: null,
          })
          .eq("session_id", (sess as any).session_id);
      } catch {
        // ignore
      }
      return json({ ok: false, code: "TOO_FAST", msg: "TOO_FAST" } satisfies JsonErr, 200);
    }
  }

  // If VIP needs pass2 and we're on pass1
  if (required === 2 && resolvedPass === 1) {
    // Only allow transition once
    if (completed >= 1) {
      return json({ ok: false, code: "PASS1_ALREADY_OK", msg: "PASS1_ALREADY_OK" } satisfies JsonErr, 200);
    }

    const tokenPass2 = base64url(32);
    const tokenPass2Hash = await sha256Hex(tokenPass2);
    const nowIso = new Date().toISOString();

    const rotateBucket = String((sess as any).rotate_bucket ?? "").trim();
    const baseUrl = inferBaseUrl(req) || PUBLIC_BASE_URL;
    const gateUrlPass2 = baseUrl
      ? `${baseUrl}/free/gate?p=2&b=${encodeURIComponent(rotateBucket || "0")}`
      : `/free/gate?p=2&b=${encodeURIComponent(rotateBucket || "0")}`;

    const outboundBase1 = String((settings as any)?.free_outbound_url ?? "").trim() || "https://link4m.com/PkY7X";
    const outboundBase2 = String((settings as any)?.free_outbound_url_pass2 ?? "").trim() || outboundBase1;

    const tpl2 = applyTemplateApiToken(outboundBase2, (LINK4M_API_TOKEN_PASS2 || LINK4M_API_TOKEN_PASS1));

    const outbound2 = buildOutboundUrl(tpl2, gateUrlPass2);
    if (!outbound2 || outbound2 === "__TEMPLATE_INVALID__") {
      return json(
        {
          ok: false,
          code: "OUTBOUND_URL_TEMPLATE_INVALID",
          msg: "Link4M Pass2 template thiếu placeholder {GATE_URL_ENC}/{GATE_URL} hoặc thiếu param url=...",
        } satisfies JsonErr,
        400,
      );
    }

    const { error: updErr } = await sb
      .from("licenses_free_sessions")
      .update({
        status: "pass1_ok",
        pass1_ok_at: nowIso,
        passes_completed: 1,
        current_pass: 2,
        out_token_hash_pass2: tokenPass2Hash,
        pass2_started_at: nowIso,
        last_error: null,
        // ensure claim token not set yet
        claim_token_hash: null,
        claim_expires_at: null,
      })
      .eq("session_id", (sess as any).session_id);

    if (updErr) return json({ ok: false, code: "SERVER_ERROR", msg: updErr.message } satisfies JsonErr, 500);

    const result: NextOk = { ok: true, next: "PASS2", out_token: tokenPass2, outbound_url: outbound2, min_delay_seconds: minDelay2 };
    return json(result, 200);
  }

  // Final pass -> generate claim token
  const claim_token = base64url(20);
  const claim_token_hash = await sha256Hex(claim_token);
  const claim_expires_at = new Date(Date.now() + 3 * 60 * 1000).toISOString();

  const nowIso = new Date().toISOString();

  const { error: updErr } = await sb
    .from("licenses_free_sessions")
    .update({
      status: "gate_ok",
      gate_ok_at: nowIso,
      claim_token_hash,
      claim_expires_at,
      last_error: null,
      passes_completed: required,
      current_pass: required,
      pass2_ok_at: resolvedPass === 2 ? nowIso : null,
      pass1_ok_at: resolvedPass === 1 ? nowIso : (sess as any).pass1_ok_at ?? null,
    })
    .eq("session_id", (sess as any).session_id);

  if (updErr) return json({ ok: false, code: "SERVER_ERROR", msg: updErr.message } satisfies JsonErr, 500);

  const baseUrl = PUBLIC_BASE_URL || inferBaseUrl(req) || "";
  let claim_url = "";
  if (baseUrl) {
    const params = new URLSearchParams();
    params.set("claim", claim_token);
    params.set("sid", String((sess as any).session_id));
    claim_url = `${baseUrl}/free/claim?${params.toString()}`;
  }

  const result: NextOk = { ok: true, next: "CLAIM", claim_token, claim_url };
  return json(result, 200);
});
