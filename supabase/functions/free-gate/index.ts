import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-max-age": "86400",
  "vary": "origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}

function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    ?? "0.0.0.0";
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(String(input ?? ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function secondsUntil(iso: unknown) {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return -1;
  return Math.ceil((ms - Date.now()) / 1000);
}

async function logGate(db: any, row: Record<string, unknown>) {
  try {
    await db.from("licenses_free_gate_logs").insert(row);
  } catch {
    // audit must never break free gate
  }
}

async function updateSession(db: any, sessionId: string, patch: Record<string, unknown>) {
  const { error } = await db.from("licenses_free_sessions").update(patch).eq("session_id", sessionId);
  return !error;
}

/**
 * Public FREE gate hotfix.
 *
 * User-flow denials return HTTP 200 with ok:false. This prevents Supabase invocation spam
 * with 400/403 and prevents frontend from showing generic backend errors.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, code: "SERVER_NOT_READY", msg: "SERVER_NOT_READY" }, 503);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ ok: false, code: "BAD_JSON", msg: "BAD_JSON" }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const passNo = Number(body.pass ?? 1) === 2 ? 2 : 1;
  const sessionId = text(body.session_id, 128);
  const outToken = text(body.out_token, 4096);
  const fingerprint = text(body.fingerprint, 512);
  const currentUrl = text(body.current_url, 2048);
  const referrer = text(body.referrer, 2048);
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const ipHash = await sha256Hex(ip);
  const uaHash = await sha256Hex(ua);
  const fpHash = fingerprint ? await sha256Hex(fingerprint) : "";

  const baseLog = {
    session_id: sessionId || null,
    pass_no: passNo,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash || null,
    detail: { route: "free-gate", current_url: currentUrl || null, referrer: referrer || null },
  } as Record<string, unknown>;

  async function deny(code: string, extra: Record<string, unknown> = {}) {
    if (sessionId) await updateSession(db, sessionId, { last_error: code });
    await logGate(db, { ...baseLog, event_code: code, detail: { ...(baseLog.detail as any), ...extra } });
    return json({ ok: false, code, msg: code, ...extra }, 200);
  }

  if (!sessionId || !outToken) return await deny("INVALID_SESSION");

  const outHash = await sha256Hex(outToken);
  const sessionLookup = await db
    .from("licenses_free_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (sessionLookup.error) return await deny("SESSION_LOAD_FAILED", { detail: sessionLookup.error.message });

  let session = sessionLookup.data as any | null;

  // HOTFIX 2026-04-26:
  // Some Link4M/browser flows can return to /free/gate with a stale session_id from
  // localStorage while the current out_token is still valid. Do not fail the whole
  // flow just because sid is stale; recover the canonical session by out_token hash.
  if (!session) {
    const recovered = await db
      .from("licenses_free_sessions")
      .select("*")
      .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recovered.error) return await deny("SESSION_LOAD_FAILED", { detail: recovered.error.message, recovered_by_out_token: true });
    if (recovered.data) {
      session = recovered.data as any;
      baseLog.session_id = String((session as any).session_id ?? sessionId);
      (baseLog.detail as any).input_session_id = sessionId;
      (baseLog.detail as any).recovered_by_out_token = true;
    }
  }

  if (!session) return await deny("SESSION_NOT_FOUND");

  const s = session as any;
  const keyTypeCode = text(s.key_type_code, 128);
  baseLog.key_type_code = keyTypeCode || null;

  if (s.closed_at || String(s.status ?? "").toLowerCase() === "closed") return await deny("SESSION_CLOSED");
  if (s.revealed_at || String(s.status ?? "").toLowerCase() === "revealed") return await deny("ALREADY_REVEALED");
  if (secondsUntil(s.expires_at) <= 0) return await deny("SESSION_EXPIRED");
  if (s.out_expires_at && secondsUntil(s.out_expires_at) <= 0) return await deny("SESSION_EXPIRED");
  if (text(s.out_token_hash, 128) !== outHash && text(s.out_token_hash_pass2, 128) !== outHash) return await deny("OUT_TOKEN_MISMATCH");

  const { data: settings } = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  const cfg = (settings ?? {}) as any;
  if (cfg.free_enabled === false) return await deny("FREE_DISABLED");

  const requireIp = Boolean(cfg.free_gate_require_ip_match ?? false);
  const requireUa = Boolean(cfg.free_gate_require_ua_match ?? false);
  if (requireIp && text(s.ip_hash, 128) && text(s.ip_hash, 128) !== ipHash) return await deny("DEVICE_MISMATCH", { field: "ip" });
  if (requireUa && text(s.ua_hash, 128) && text(s.ua_hash, 128) !== uaHash) return await deny("DEVICE_MISMATCH", { field: "ua" });
  if (fpHash && text(s.fingerprint_hash, 128) && text(s.fingerprint_hash, 128) !== fpHash) return await deny("DEVICE_MISMATCH", { field: "fingerprint" });

  const startedAtMs = Date.parse(String(s.started_at ?? s.created_at ?? ""));
  const antiBypass = Boolean(cfg.free_gate_antibypass_enabled ?? false);
  const minDelaySeconds = Math.max(0, Number(passNo === 2 ? cfg.free_min_delay_seconds_pass2 : cfg.free_min_delay_seconds) || 0);
  const gateAntiBypassSeconds = Math.max(0, Number(cfg.free_gate_antibypass_seconds) || 0);
  const requiredWait = antiBypass ? Math.max(minDelaySeconds, gateAntiBypassSeconds) : minDelaySeconds;
  if (requiredWait > 0 && Number.isFinite(startedAtMs)) {
    const elapsed = Math.floor((Date.now() - startedAtMs) / 1000);
    if (elapsed < requiredWait) {
      return await deny(antiBypass ? "GATE_TOO_EARLY" : "TOO_FAST", { wait_seconds: requiredWait - elapsed, required_seconds: requiredWait, elapsed_seconds: elapsed });
    }
  }

  let requiresDoubleGate = false;
  if (keyTypeCode) {
    try {
      const { data: keyType } = await db.from("licenses_free_key_types").select("requires_double_gate").eq("code", keyTypeCode).maybeSingle();
      requiresDoubleGate = Boolean((keyType as any)?.requires_double_gate ?? false);
    } catch {
      requiresDoubleGate = false;
    }
  }

  if (requiresDoubleGate && passNo === 1) {
    const nextOutToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const nextOutHash = await sha256Hex(nextOutToken);
    const outbound = text(cfg.free_outbound_url_pass2, 4096) || text(cfg.free_outbound_url, 4096);
    if (!outbound) return await deny("OUTBOUND_URL_MISSING");

    await updateSession(db, String(s.session_id ?? sessionId), {
      status: "waiting_pass2",
      out_token_hash: nextOutHash,
      out_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      gate_ok_at: new Date().toISOString(),
      last_error: null,
    });
    await logGate(db, { ...baseLog, event_code: "pass1_ok", detail: { ...(baseLog.detail as any), next: "PASS2" } });
    return json({ ok: true, next: "PASS2", out_token: nextOutToken, outbound_url: outbound, min_delay_seconds: Math.max(0, Number(cfg.free_min_delay_seconds_pass2 ?? 0) || 0) }, 200);
  }

  const claimToken = "clm_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const claimHash = await sha256Hex(claimToken);
  const claimExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await updateSession(db, String(s.session_id ?? sessionId), {
    status: "gate_ok",
    gate_ok_at: new Date().toISOString(),
    claim_token_hash: claimHash,
    claim_expires_at: claimExpiresAt,
    last_error: null,
  });
  await logGate(db, { ...baseLog, event_code: "gate_ok", detail: { ...(baseLog.detail as any), next: "CLAIM" } });

  return json({ ok: true, next: "CLAIM", claim_token: claimToken, claim_url: "/free/claim", claim_expires_at: claimExpiresAt }, 200);
});
