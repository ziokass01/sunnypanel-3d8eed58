import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-max-age": "86400",
  "vary": "origin",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" } });
}
function text(value: unknown, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}
function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ?? "0.0.0.0";
}
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(String(input ?? ""));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function publicBase() {
  return (Deno.env.get("FREE_PUBLIC_BASE_URL") || Deno.env.get("PUBLIC_BASE_URL") || "https://mityangho.id.vn").replace(/\/+$/, "");
}
function renderOutbound(template: string, gateUrl: string) {
  const enc = encodeURIComponent(gateUrl);
  if (!template) return "";
  if (template.includes("{GATE_URL_ENC}")) return template.replaceAll("{GATE_URL_ENC}", enc);
  if (template.includes("{GATE_URL}")) return template.replaceAll("{GATE_URL}", gateUrl);
  if (/link4m|linkvertise|traffic|short/i.test(template)) return "";
  return template;
}
async function logGate(db: any, row: Record<string, unknown>) {
  try { await db.from("licenses_free_gate_logs").insert(row); } catch { /* ignore */ }
}
async function closeStale(db: any, ipHash: string, fpHash: string) {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  try {
    await db.from("licenses_free_sessions").update({ status: "closed", closed_at: new Date().toISOString(), last_error: "AUTO_CLOSE_STALE_PENDING" })
      .in("status", ["started", "waiting", "waiting_pass2", "gate_ok"])
      .lt("created_at", cutoff)
      .is("revealed_at", null);
  } catch { /* ignore */ }
  try {
    if (fpHash) {
      await db.from("licenses_free_sessions").update({ status: "closed", closed_at: new Date().toISOString(), last_error: "AUTO_CLOSE_OLD_SAME_FP" })
        .eq("fingerprint_hash", fpHash)
        .in("status", ["started", "waiting", "waiting_pass2"])
        .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .is("revealed_at", null);
    }
  } catch { /* ignore */ }
  void ipHash;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, code: "FREE_NOT_READY", msg: "FREE_NOT_READY" }, 503);

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ ok: false, code: "BAD_JSON", msg: "BAD_JSON" }, 200);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const keyTypeCode = text(body.key_type_code || body.keyTypeCode, 128);
  const appCode = text(body.app_code || "free-fire", 64) || "free-fire";
  const packageCode = text(body.package_code, 128) || null;
  const creditCode = text(body.credit_code, 128) || null;
  const walletKind = text(body.wallet_kind, 32) || null;
  const fingerprint = text(body.fingerprint || req.headers.get("x-fp"), 512);
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const ipHash = await sha256Hex(ip || "0.0.0.0");
  const uaHash = await sha256Hex(ua);
  const fpHash = fingerprint ? await sha256Hex(fingerprint) : "";
  const traceId = "free-" + crypto.randomUUID();
  const baseLog = { ip_hash: ipHash, ua_hash: uaHash, fingerprint_hash: fpHash || null, key_type_code: keyTypeCode || null } as Record<string, unknown>;
  async function deny(code: string, extra: Record<string, unknown> = {}) {
    await logGate(db, { ...baseLog, event_code: code, detail: { route: "free-start", app_code: appCode, trace_id: traceId, ...extra } });
    return json({ ok: false, code, msg: code, trace_id: traceId, ...extra }, 200);
  }

  if (!keyTypeCode) return await deny("MISSING_KEY_TYPE");

  const { data: settings, error: settingsErr } = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsErr) return await deny("FREE_SETTINGS_LOAD_FAILED", { detail: settingsErr.message });
  const cfg = (settings ?? {}) as any;
  if (cfg.free_enabled === false) return await deny("FREE_DISABLED", { msg: cfg.free_disabled_message || "FREE_DISABLED" });

  await closeStale(db, ipHash, fpHash);

  let keyType: any = null;
  try {
    const byApp = await db.from("licenses_free_key_types").select("*").eq("code", keyTypeCode).eq("app_code", appCode).maybeSingle();
    keyType = byApp.data;
    if (!keyType) {
      const anyApp = await db.from("licenses_free_key_types").select("*").eq("code", keyTypeCode).maybeSingle();
      keyType = anyApp.data;
    }
  } catch (error) {
    return await deny("KEY_TYPE_LOAD_FAILED", { detail: String((error as any)?.message ?? error) });
  }
  if (!keyType || keyType.enabled === false) return await deny("KEY_TYPE_DISABLED");

  const waitingLimit = Math.max(3, Number(cfg.free_session_waiting_limit ?? 10) || 10);
  try {
    let pending = db.from("licenses_free_sessions").select("session_id", { count: "exact", head: true })
      .in("status", ["started", "waiting", "waiting_pass2", "gate_ok"])
      .is("revealed_at", null);
    if (fpHash) pending = pending.eq("fingerprint_hash", fpHash);
    else pending = pending.eq("ip_hash", ipHash);
    const { count } = await pending;
    if (Number(count ?? 0) >= waitingLimit) {
      await logGate(db, { ...baseLog, event_code: "SESSION_PENDING_LIMIT_SOFT", detail: { route: "free-start", count, waiting_limit: waitingLimit, trace_id: traceId } });
      // Do not return HTTP 429. Return a clear JSON denial so frontend/app does not treat backend as broken.
      return json({ ok: false, code: "SESSION_PENDING_LIMIT", msg: "Thiết bị này đang có nhiều phiên chờ. Hãy đóng các tab cũ hoặc chờ vài phút rồi thử lại.", wait_seconds: 300, trace_id: traceId }, 200);
    }
  } catch {
    // Missing rate-limit schema should not break FREE start. Audit and continue.
    await logGate(db, { ...baseLog, event_code: "PENDING_LIMIT_CHECK_SKIPPED", detail: { route: "free-start", trace_id: traceId } });
  }

  const sessionId = crypto.randomUUID();
  const outToken = "out_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const outHash = await sha256Hex(outToken);
  const nowIso = new Date().toISOString();
  const sessionTtlSeconds = Math.max(600, Number(cfg.free_return_seconds ?? 1800) || 1800);
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000).toISOString();
  const outExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const minDelay = Math.max(0, Number(cfg.free_min_delay_enabled === false ? 0 : cfg.free_min_delay_seconds ?? 0) || 0);
  const gateUrl = `${publicBase()}/free/gate?sid=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(outToken)}&pass=1`;
  const outboundTemplate = text(cfg.free_outbound_url, 4096);
  const outboundUrl = renderOutbound(outboundTemplate, gateUrl);
  if (!outboundUrl) return await deny("OUTBOUND_URL_TEMPLATE_INVALID", { gate_url: gateUrl });

  const fullPayload: Record<string, unknown> = {
    session_id: sessionId,
    key_type_code: keyTypeCode,
    duration_seconds: Math.max(0, Number(keyType.duration_seconds ?? 0) || 0),
    status: "started",
    started_at: nowIso,
    expires_at: expiresAt,
    out_token_hash: outHash,
    out_expires_at: outExpiresAt,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash || ipHash,
    reveal_count: 0,
    last_error: null,
    app_code: appCode,
    package_code: packageCode,
    credit_code: creditCode,
    wallet_kind: walletKind,
    trace_id: traceId,
  };
  const compatPayload: Record<string, unknown> = {
    session_id: sessionId,
    key_type_code: keyTypeCode,
    duration_seconds: Math.max(0, Number(keyType.duration_seconds ?? 0) || 0),
    status: "started",
    started_at: nowIso,
    expires_at: expiresAt,
    out_token_hash: outHash,
    out_expires_at: outExpiresAt,
    ip_hash: ipHash,
    ua_hash: uaHash,
    fingerprint_hash: fpHash || ipHash,
    reveal_count: 0,
    last_error: null,
  };

  let inserted = await db.from("licenses_free_sessions").insert(fullPayload);
  if (inserted.error) {
    const msg = String(inserted.error.message ?? "");
    if (msg.includes("app_code") || msg.includes("package_code") || msg.includes("credit_code") || msg.includes("wallet_kind") || msg.includes("trace_id")) {
      inserted = await db.from("licenses_free_sessions").insert(compatPayload);
    }
  }
  if (inserted.error) return await deny("SESSION_CREATE_FAILED", { detail: inserted.error.message });

  await logGate(db, { ...baseLog, session_id: sessionId, event_code: "start_ok", detail: { route: "free-start", app_code: appCode, trace_id: traceId, package_code: packageCode, credit_code: creditCode, wallet_kind: walletKind } });
  return json({
    ok: true,
    session_id: sessionId,
    out_token: outToken,
    outbound_url: outboundUrl,
    gate_url: gateUrl,
    min_delay_seconds: minDelay,
    trace_id: traceId,
    expires_at: expiresAt,
  }, 200);
});
