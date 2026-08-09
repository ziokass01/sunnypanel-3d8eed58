// @ts-nocheck
import { createServiceClient } from "./supabase-rest.js";
import { requiredFinalPass, tokenPairMatches, validateFinalGateProof } from "./free-shared/free-claim-guard.js";
import { insertLicenseCompat } from "./free-shared/license-insert.js";
import { resolveKeyTypeDurationSeconds } from "./free-shared/license-duration.js";
import { effectiveBonusDuration, resolveFreeBonus } from "./free-shared/bonus.js";

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(input ?? ""))));
}
function text(value, max = 4096) { return String(value ?? "").trim().slice(0, max); }
function getIp(req) {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ?? "";
}
function randomChunk(len = 4) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(len); crypto.getRandomValues(bytes);
  let out = ""; for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
function normalizeKeyPrefix(value) {
  const raw = String(value ?? "SUNNY").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return raw || "SUNNY";
}
function makeKey(prefix = "SUNNY") { return `${normalizeKeyPrefix(prefix)}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`; }
function makeRedeemKey(signature = "FND") {
  const sig = String(signature || "FND").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "FND";
  return `${sig}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}
function addSecondsIso(baseIso, seconds) {
  return new Date(new Date(baseIso).getTime() + Math.max(0, Math.trunc(Number(seconds) || 0)) * 1000).toISOString();
}
function normalizeAppCode(value) { return String(value ?? "free-fire").trim().toLowerCase() || "free-fire"; }
function normalizeWalletKind(value) {
  const kind = String(value ?? "").trim().toLowerCase();
  return kind === "vip" ? "vip" : kind === "normal" ? "normal" : null;
}
function maskKey(key) { return key.length <= 10 ? "***" : `${key.slice(0, 9)}…${key.slice(-4)}`; }
function isActiveBlockUntil(blockedUntil) {
  if (!blockedUntil) return true;
  const t = Date.parse(blockedUntil); return Number.isFinite(t) && t > Date.now();
}
function isAiCodingFreeKeyType(keyTypeMeta, sessRow) {
  const code = String(keyTypeMeta?.code ?? sessRow?.key_type_code ?? "").trim().toLowerCase();
  const sig = String(keyTypeMeta?.key_signature ?? "").trim().toUpperCase();
  const app = normalizeAppCode(keyTypeMeta?.app_code ?? sessRow?.app_code ?? "");
  return app === "ai-coding" || code.startsWith("aisunny") || sig === "AI-SUNNY";
}
function getVietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((x) => x.type === "year")?.value}-${parts.find((x) => x.type === "month")?.value}-${parts.find((x) => x.type === "day")?.value}`;
}
function getVietnamDayRangeUtc(day) {
  const [year, month, date] = day.split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, date, 0, 0, 0, 0) - 7 * 3600 * 1000;
  return { startUtcIso: new Date(startMs).toISOString(), nextStartUtcIso: new Date(startMs + 86400000).toISOString() };
}
function isMissingSelectColumn(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("undefined column") || msg.includes("could not find");
}
async function resolveAppQuotaLimits(db, appCode, fallbackFp, fallbackIp) {
  const normalized = normalizeAppCode(appCode);
  const res = await db.from("server_app_settings").select("app_code,free_daily_limit_per_fingerprint,free_daily_limit_per_ip").eq("app_code", normalized).maybeSingle();
  if (res.error && !isMissingSelectColumn(res.error)) return { free_daily_limit_per_fingerprint: fallbackFp, free_daily_limit_per_ip: fallbackIp };
  return {
    free_daily_limit_per_fingerprint: Math.max(0, Number(res.data?.free_daily_limit_per_fingerprint ?? fallbackFp)),
    free_daily_limit_per_ip: Math.max(0, Number(res.data?.free_daily_limit_per_ip ?? fallbackIp)),
  };
}
async function insertGateLog(db, payload) {
  const r = await db.from("licenses_free_gate_logs").insert({
    session_id: payload.session_id ?? null,
    key_type_code: payload.key_type_code ?? null,
    pass_no: payload.pass_no ?? null,
    event_code: payload.event_code,
    detail: payload.detail ?? {},
    fingerprint_hash: payload.fingerprint_hash ?? null,
    ip_hash: payload.ip_hash ?? null,
    ua_hash: payload.ua_hash ?? null,
    trace_id: payload.trace_id ?? null,
  });
  return r;
}
async function maybeAutoBlockGateFailures(db, args) {
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await db.from("licenses_free_gate_logs").select("id", { count: "exact", head: true })
    .gte("created_at", windowStart)
    .in("event_code", ["REFERRER_REQUIRED","BAD_REFERRER","OUT_TOKEN_MISMATCH","GATE_TOO_EARLY","TOO_FAST","TOO_FAST_PASS2","DEVICE_MISMATCH","CLAIM_INVALID","CLAIM_EXPIRED","GATE_STATUS_INVALID","DAILY_QUOTA","DAILY_QUOTA_FP","DAILY_QUOTA_IP"])
    .or(`fingerprint_hash.eq.${args.fingerprint_hash},ip_hash.eq.${args.ip_hash}`);
  const failCount = Number(recent.count ?? 0);
  if (failCount < 5) return;
  const blockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const existing = await db.from("licenses_free_blocklist").select("id").eq("enabled", true)
    .or(`fingerprint_hash.eq.${args.fingerprint_hash},ip_hash.eq.${args.ip_hash}`).limit(1).maybeSingle();
  const patch = {
    fingerprint_hash: args.fingerprint_hash,
    ip_hash: args.ip_hash,
    reason: "AUTO_GATE_FAIL_5_IN_10M",
    enabled: true,
    blocked_until: blockedUntil,
    created_by: "system",
    note: `Auto block after ${failCount} gate/claim failures in 10 minutes`,
  };
  if (existing.data?.id) await db.from("licenses_free_blocklist").update(patch).eq("id", existing.data.id);
  else await db.from("licenses_free_blocklist").insert(patch);
  await insertGateLog(db, { ...args, event_code: "AUTO_BLOCKED", detail: { fail_count_10m: failCount, blocked_until: blockedUntil, reason: "AUTO_GATE_FAIL_5_IN_10M" } });
}
function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const claim_token = text(body.claim_token, 512);
  const out_token = text(body.out_token, 512);
  const fingerprint = text(body.fingerprint, 128);
  const session_id = text(body.session_id, 64);
  const app_code = text(body.app_code, 64);
  const package_code = text(body.package_code, 64) || null;
  const credit_code = text(body.credit_code, 64) || null;
  const wallet_kind = text(body.wallet_kind, 32) || null;
  if (claim_token.length < 8 || fingerprint.length < 6 || (out_token && out_token.length > 512)) return null;
  if (session_id && !/^[0-9a-f-]{36}$/i.test(session_id)) return null;
  return { claim_token, out_token, fingerprint, session_id, app_code, package_code, credit_code, wallet_kind, debug: body.debug };
}

const FIND_DUMPS_PACKAGE_META = {
  classic: { title: "Find Dumps Classic", plan_code: "classic", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
  go: { title: "Find Dumps Go", plan_code: "go", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
  plus: { title: "Find Dumps Plus", plan_code: "plus", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
  pro: { title: "Find Dumps Pro", plan_code: "pro", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
};
const FIND_DUMPS_CREDIT_META = {
  "credit-normal": { title: "Find Dumps Credit thường", wallet_kind: "normal", soft_credit_amount: 1.5, premium_credit_amount: 0, reward_mode: "soft_credit" },
  "credit-vip": { title: "Find Dumps Credit VIP", wallet_kind: "vip", soft_credit_amount: 0, premium_credit_amount: 0.5, reward_mode: "premium_credit" },
};

export async function handleFreeReveal(req, env, ctx) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ctx.corsHeaders });
  if (req.method !== "POST") return ctx.json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  const body = validateBody(await req.json().catch(() => null));
  if (!body) return ctx.json({ ok: false, msg: "INVALID_INPUT" }, 200);
  const db = createServiceClient(env);
  if (!db) return ctx.json({ ok: false, msg: "SERVER_MISCONFIG" }, 500);

  const ip = getIp(req), ua = req.headers.get("user-agent") ?? "";
  const settingsRes = await db.from("licenses_free_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsRes.error) return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
  const settings = settingsRes.data ?? {};
  if (!Boolean(settings.free_enabled ?? true)) return ctx.json({ ok: false, msg: "CLOSED" }, 200);
  const freeCloseDeadlineSeconds = Math.max(10, Number(settings.free_close_deadline_seconds ?? settings.free_return_seconds ?? 60));

  const debugEnabled = String(req.headers.get("x-debug") ?? "").trim() === "1" || body.debug === true || body.debug === 1 || body.debug === "1";
  const claimHash = await sha256Hex(body.claim_token);
  const outHash = body.out_token ? await sha256Hex(body.out_token) : "";
  const fpHash = await sha256Hex(body.fingerprint);
  const uaHash = await sha256Hex(ua);
  const ipHash = await sha256Hex(ip);

  const blocked = await db.from("licenses_free_blocklist").select("id,blocked_until").eq("enabled", true)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`).limit(1).maybeSingle();
  if (blocked.data?.id && isActiveBlockUntil(blocked.data.blocked_until)) return ctx.json({ ok: false, msg: "BLOCKED" }, 403);
  if (!body.out_token) return ctx.json({ ok: false, msg: "OUT_TOKEN_REQUIRED", code: "OUT_TOKEN_REQUIRED" }, 200);

  const debugLookup = debugEnabled ? { session_id_provided: Boolean(body.session_id), claim_token_len: body.claim_token.length, out_token_len: body.out_token.length, looked_up_by: "claim+out(any-pass)" } : null;
  const sessionColumns = "session_id,status,reveal_count,started_at,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,gate_ok_at,close_deadline_at,copied_at,out_token_hash,out_token_hash_pass2,passes_required,passes_completed,current_pass,app_code,package_code,credit_code,wallet_kind,issued_server_redeem_key_id,issued_server_reward_mode,selection_meta,trace_id,gate_flow_version";
  const lookup = await db.from("licenses_free_sessions").select(sessionColumns).eq("claim_token_hash", claimHash)
    .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`).maybeSingle();
  if (lookup.error) return ctx.json({ ok: false, msg: "SESSION_LOOKUP_FAILED", code: "SESSION_LOOKUP_FAILED" }, 500);
  const sess = lookup.data;
  if (!sess) return ctx.json({ ok: false, msg: "SESSION_NOT_FOUND", code: "SESSION_NOT_FOUND", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  const sessionId = sess.session_id, now = Date.now(), expMs = Date.parse(sess.expires_at);
  if (!Number.isFinite(expMs) || expMs < now) return ctx.json({ ok: false, msg: "SESSION_EXPIRED" }, 200);
  if (sess.status === "closed" || Boolean(sess.copied_at)) return ctx.json({ ok: false, msg: "SESSION_CLOSED" }, 200);
  const closeDeadlineMs = sess.close_deadline_at ? Date.parse(sess.close_deadline_at) : 0;
  if (closeDeadlineMs && Number.isFinite(closeDeadlineMs) && closeDeadlineMs < now) {
    await db.from("licenses_free_sessions").update({ status: "closed", out_expires_at: new Date().toISOString(), claim_token_hash: null, claim_expires_at: null }).eq("session_id", sessionId);
    return ctx.json({ ok: false, msg: "SESSION_CLOSED" }, 200);
  }
  const warnings = [];
  if (sess.fingerprint_hash !== fpHash) return ctx.json({ ok: false, msg: "FP_MISMATCH", code: "FP_MISMATCH", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  if (sess.ua_hash !== uaHash) warnings.push("UA_MISMATCH");
  if (sess.ip_hash !== ipHash) warnings.push("IP_MISMATCH");

  const getKeyTypeMeta = async (code) => {
    if (!code) return null;
    const r = await db.from("licenses_free_key_types").select("*").eq("code", code).maybeSingle();
    return r.data ?? null;
  };
  const getKeyTypeLabel = async (code) => (await getKeyTypeMeta(code))?.label ?? null;
  const getFindDumpsRewardMeta = async (code) => {
    if (!code) return null;
    const r = await db.from("server_app_reward_packages")
      .select("package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
      .eq("app_code", "find-dumps").eq("package_code", code).maybeSingle();
    if (r.error) return null;
    return r.data && r.data.enabled !== false ? r.data : null;
  };

  async function issueFindDumpsRedeemKey(sessRow, keyTypeMeta) {
    const durationSeconds = Math.max(60, Number(sessRow?.duration_seconds ?? 0));
    const issuedAt = new Date().toISOString(), appCode = "find-dumps";
    const sessionPackageCode = text(sessRow?.package_code ?? body.package_code, 64).toLowerCase();
    const sessionCreditCode = text(sessRow?.credit_code ?? body.credit_code, 64).toLowerCase();
    const requestedWalletKind = normalizeWalletKind(sessRow?.wallet_kind ?? body.wallet_kind);
    const hasPackage = Boolean(sessionPackageCode), hasCredit = Boolean(sessionCreditCode);
    if (hasPackage === hasCredit) throw Object.assign(new Error("FIND_DUMPS_SELECTION_REQUIRED"), { status: 409, code: "FIND_DUMPS_SELECTION_REQUIRED" });
    let reward_mode = "plan", plan_code = null, soft_credit_amount = 0, premium_credit_amount = 0, entitlement_seconds = 0;
    let title = "Find Dumps key", description = "", package_code = null, credit_code = null, wallet_kind = null;
    if (hasPackage) {
      const pkg = (await getFindDumpsRewardMeta(sessionPackageCode)) ?? FIND_DUMPS_PACKAGE_META[sessionPackageCode];
      if (!pkg) throw Object.assign(new Error("FIND_DUMPS_PACKAGE_NOT_FOUND"), { status: 404, code: "FIND_DUMPS_PACKAGE_NOT_FOUND" });
      reward_mode = String(pkg.reward_mode ?? "plan"); plan_code = text(pkg.plan_code,64) || null;
      soft_credit_amount = Number(pkg.soft_credit_amount ?? 0); premium_credit_amount = Number(pkg.premium_credit_amount ?? 0);
      entitlement_seconds = durationSeconds; title = `${String(pkg.title ?? sessionPackageCode)} ${keyTypeMeta?.label ?? ""}`.trim();
      description = `Free flow package ${sessionPackageCode}`; package_code = sessionPackageCode;
    } else {
      const credit = (await getFindDumpsRewardMeta(sessionCreditCode)) ?? FIND_DUMPS_CREDIT_META[sessionCreditCode];
      if (!credit) throw Object.assign(new Error("FIND_DUMPS_CREDIT_NOT_FOUND"), { status: 404, code: "FIND_DUMPS_CREDIT_NOT_FOUND" });
      reward_mode = String(credit.reward_mode ?? "soft_credit"); soft_credit_amount = Number(credit.soft_credit_amount ?? 0);
      premium_credit_amount = Number(credit.premium_credit_amount ?? 0); title = `${String(credit.title ?? sessionCreditCode)} ${keyTypeMeta?.label ?? ""}`.trim();
      description = `Free flow credit ${sessionCreditCode}`; credit_code = sessionCreditCode;
      wallet_kind = requestedWalletKind ?? (reward_mode === "premium_credit" ? "vip" : "normal");
    }
    const expiresAt = addSecondsIso(issuedAt, durationSeconds);
    let inserted = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const redeem_key = makeRedeemKey("FND");
      const ins = await db.from("server_app_redeem_keys").insert({
        app_code: appCode, redeem_key, title, description, enabled: true, starts_at: issuedAt, expires_at: expiresAt,
        max_redemptions: 1, redeemed_count: 0, reward_mode, plan_code, soft_credit_amount, premium_credit_amount,
        entitlement_days: 0, entitlement_seconds, trace_id: text(sessRow?.trace_id,128) || null,
        source_free_session_id: sessionId,
        notes: `FREE_FLOW;TRACE=${text(sessRow?.trace_id,128) || "-"};SESSION=${sessionId};KEY_TYPE=${sessRow?.key_type_code ?? ""};APP=${appCode}`,
        metadata: { source: "free-flow", free_session_id: sessionId, trace_id: text(sessRow?.trace_id,128) || null, free_issue_kind: hasPackage ? "package" : "credit", package_code, credit_code, wallet_kind, key_type_code: sessRow?.key_type_code ?? null, key_signature: "FD", issued_at: issuedAt, claim_starts_entitlement: hasPackage, expires_from_claim: true, one_time_use: true, free_duration_seconds: durationSeconds },
      }).select("id,redeem_key").single();
      if (!ins.error && ins.data?.id) { inserted = { id: String(ins.data.id), redeem_key: String(ins.data.redeem_key) }; break; }
    }
    if (!inserted) throw Object.assign(new Error("SERVER_REDEEM_KEY_INSERT_FAILED"), { status: 500, code: "SERVER_REDEEM_KEY_INSERT_FAILED" });
    await db.from("licenses_free_sessions").update({
      issued_server_redeem_key_id: inserted.id, issued_server_reward_mode: reward_mode, app_code: appCode, package_code, credit_code, wallet_kind,
      selection_meta: { app_code: appCode, package_code, credit_code, wallet_kind, reward_mode, duration_seconds: durationSeconds, trace_id: text(sessRow?.trace_id,128) || null },
    }).eq("session_id", sessionId);
    await db.from("licenses_free_issues").insert({ license_id: null, key_mask: inserted.redeem_key, expires_at: expiresAt, session_id: sessionId, ip_hash: ipHash, fingerprint_hash: fpHash, app_code: appCode, key_signature: "FD", server_redeem_key_id: inserted.id });
    return { key: inserted.redeem_key, expires_at: expiresAt, allow_reset: false, app_code: appCode, key_signature: "FD", reward_mode, package_code, credit_code, wallet_kind, entitlement_seconds, created_at: issuedAt, server_redeem_key_id: inserted.id };
  }

  async function issueAiSunnyRedeemKey(sessRow, keyTypeMeta) {
    const durationSeconds = Math.max(60, Number(sessRow?.duration_seconds ?? keyTypeMeta?.duration_seconds ?? 86400) || 86400);
    const issuedAt = new Date().toISOString(), expiresAt = addSecondsIso(issuedAt, durationSeconds);
    const pepper = String(env?.AI_SUNNY_KEY_PEPPER || env?.AI_SUNNY_HASH_PEPPER || "sunny-ai");
    const appCode = "ai-coding", keySignature = text(keyTypeMeta?.key_signature || "AI-SUNNY", 32).toUpperCase() || "AI-SUNNY";
    let inserted = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const rawKey = makeKey(keySignature);
      const codeHash = await sha256Hex(`${pepper}:${rawKey.trim().toUpperCase()}`);
      const ins = await db.from("ai_sunny_redeem_keys").insert({
        code_hash: codeHash, code_mask: maskKey(rawKey), title: text(keyTypeMeta?.label || "SunnyMod AI key vượt",200),
        status: "active", plan_code_to_grant: text(keyTypeMeta?.metadata?.plan_code_to_grant || "trial",32).toLowerCase() || "trial",
        grant_hours: Math.max(1, Math.ceil(durationSeconds / 3600)),
        bonus_daily_tokens: Math.max(10000, Number(keyTypeMeta?.metadata?.bonus_daily_tokens ?? 40000) || 40000),
        bonus_daily_messages: Math.max(5, Number(keyTypeMeta?.metadata?.bonus_daily_messages ?? 30) || 30),
        allowed_models: ["mimo-v2.5"], max_uses_total: 1, max_uses_per_day: 1, per_user_once: true,
        daily_ip_limit: 1, daily_device_limit: 1, require_device_id: true, expires_at: expiresAt, created_by: "free-flow",
        note: `FREE_FLOW;TRACE=${text(sessRow?.trace_id,128) || "-"};SESSION=${sessionId};KEY_TYPE=${sessRow?.key_type_code ?? ""};APP=${appCode}`,
        metadata: { source: "free-flow", free_session_id: sessionId, trace_id: text(sessRow?.trace_id,128) || null, key_type_code: sessRow?.key_type_code ?? null, key_signature: keySignature, issued_at: issuedAt, free_duration_seconds: durationSeconds },
      }).select("id").single();
      if (!ins.error && ins.data?.id) { inserted = { id: String(ins.data.id), key: rawKey }; break; }
    }
    if (!inserted) throw Object.assign(new Error("AI_REDEEM_KEY_INSERT_FAILED"), { status: 500, code: "AI_REDEEM_KEY_INSERT_FAILED" });
    await db.from("licenses_free_sessions").update({
      status: "revealed", last_error: null, reveal_count: 1, revealed_at: issuedAt, claim_token_hash: null, claim_expires_at: null,
      out_token_hash: null, out_token_hash_pass2: null, out_expires_at: issuedAt, issued_server_redeem_key_id: inserted.id,
      issued_server_reward_mode: "ai_redeem", app_code: appCode,
      selection_meta: { app_code: appCode, reward_mode: "ai_redeem", duration_seconds: durationSeconds, trace_id: text(sessRow?.trace_id,128) || null },
    }).eq("session_id", sessionId);
    await db.from("licenses_free_issues").insert({ license_id: null, key_mask: inserted.key, expires_at: expiresAt, session_id: sessionId, ip_hash: ipHash, fingerprint_hash: fpHash, app_code: appCode, key_signature: keySignature, server_redeem_key_id: inserted.id });
    return { key: inserted.key, expires_at: expiresAt, allow_reset: true, app_code: appCode, key_signature: keySignature, reward_mode: "ai_redeem", created_at: issuedAt, server_redeem_key_id: inserted.id };
  }

  const claimExpMs = sess.claim_expires_at ? Date.parse(sess.claim_expires_at) : 0;
  if (!tokenPairMatches(claimHash, outHash, sess)) {
    await db.from("licenses_free_sessions").update({ last_error: "TOKEN_PAIR_INVALID" }).eq("session_id", sessionId);
    await insertGateLog(db, { session_id: sessionId, trace_id: text(sess.trace_id,128) || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "TOKEN_PAIR_INVALID", detail: {}, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
    return ctx.json({ ok: false, msg: "TOKEN_PAIR_INVALID", code: "TOKEN_PAIR_INVALID", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }
  if (!claimExpMs || claimExpMs < now) {
    await db.from("licenses_free_sessions").update({ last_error: "CLAIM_EXPIRED" }).eq("session_id", sessionId);
    await insertGateLog(db, { session_id: sessionId, trace_id: text(sess.trace_id,128) || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "CLAIM_EXPIRED", detail: {}, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
    await maybeAutoBlockGateFailures(db, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: text(sess.trace_id,128) || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
    return ctx.json({ ok: false, msg: "CLAIM_EXPIRED", code: "CLAIM_EXPIRED", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }
  if (sess.status === "revealed" || (Number(sess.reveal_count ?? 0) > 0 && sess.status !== "revealing")) return ctx.json({ ok: false, msg: "CLAIM_ALREADY_USED", code: "CLAIM_ALREADY_USED" }, 200);
  if (sess.status === "revealing") return ctx.json({ ok: false, msg: "REVEAL_IN_PROGRESS", code: "REVEAL_IN_PROGRESS" }, 200);
  if (sess.status !== "gate_ok") {
    await db.from("licenses_free_sessions").update({ last_error: "GATE_STATUS_INVALID" }).eq("session_id", sessionId);
    await maybeAutoBlockGateFailures(db, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: text(sess.trace_id,128) || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
    return ctx.json({ ok: false, msg: "GATE_STATUS_INVALID", code: "GATE_STATUS_INVALID", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  const finalPass = requiredFinalPass(sess);
  const finalGate = await db.from("licenses_free_gate_tokens").select("pass_no,status,activate_after_at,expires_at,used_at")
    .eq("session_id", sessionId).eq("pass_no", finalPass).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (finalGate.error) return ctx.json({ ok: false, msg: "FINAL_GATE_PROOF_LOAD_FAILED", code: "FINAL_GATE_PROOF_LOAD_FAILED" }, 500);
  const gateProof = validateFinalGateProof(sess, finalGate.data ?? null);
  if (!gateProof.ok) {
    await db.from("licenses_free_sessions").update({ last_error: gateProof.code }).eq("session_id", sessionId);
    await insertGateLog(db, { session_id: sessionId, trace_id: text(sess.trace_id,128) || null, key_type_code: sess.key_type_code ?? null, pass_no: finalPass, event_code: gateProof.code, detail: {}, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
    return ctx.json({ ok: false, msg: gateProof.code, code: gateProof.code }, 200);
  }

  const dayKey = getVietnamDateKey(), dayRange = getVietnamDayRangeUtc(dayKey);
  const quotaAppCode = normalizeAppCode(sess.app_code ?? "free-fire");
  const limits = await resolveAppQuotaLimits(db, quotaAppCode, Math.max(0, Number(settings.free_daily_limit_per_fingerprint ?? 1)), Math.max(0, Number(settings.free_daily_limit_per_ip ?? 0)));
  if (limits.free_daily_limit_per_fingerprint > 0) {
    const q = await db.from("licenses_free_issues").select("issue_id", { count: "exact", head: true })
      .gte("created_at", dayRange.startUtcIso).lt("created_at", dayRange.nextStartUtcIso).eq("fingerprint_hash", fpHash).eq("app_code", quotaAppCode);
    if (Number(q.count ?? 0) >= limits.free_daily_limit_per_fingerprint) {
      await db.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA_FP" }).eq("session_id", sessionId);
      return ctx.json({ ok: false, msg: "RATE_LIMIT", code: "RATE_LIMIT" }, 200);
    }
  }
  if (limits.free_daily_limit_per_ip > 0) {
    const q = await db.from("licenses_free_issues").select("issue_id", { count: "exact", head: true })
      .gte("created_at", dayRange.startUtcIso).lt("created_at", dayRange.nextStartUtcIso).eq("ip_hash", ipHash).eq("app_code", quotaAppCode);
    if (Number(q.count ?? 0) >= limits.free_daily_limit_per_ip) {
      await db.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA_IP" }).eq("session_id", sessionId);
      return ctx.json({ ok: false, msg: "RATE_LIMIT", code: "RATE_LIMIT" }, 200);
    }
  }

  const lockIso = new Date().toISOString();
  const lock = await db.from("licenses_free_sessions").update({ status: "revealing", reveal_count: 1, revealed_at: lockIso, last_error: null })
    .eq("session_id", sessionId).eq("status", "gate_ok").eq("reveal_count", 0).eq("claim_token_hash", claimHash)
    .select("session_id,status").maybeSingle();
  if (!lock.data) return ctx.json({ ok: false, msg: "REVEAL_IN_PROGRESS", code: "REVEAL_IN_PROGRESS", warnings: warnings.length ? warnings : undefined }, 200);

  const keyTypeMeta = await getKeyTypeMeta(sess.key_type_code ?? null);
  const keyTypeBaseDuration = resolveKeyTypeDurationSeconds(keyTypeMeta ?? {});
  const bonusReferenceTime = sess.started_at && Number.isFinite(Date.parse(sess.started_at))
    ? new Date(sess.started_at)
    : new Date();
  const bonusRuntimeAtStart = resolveFreeBonus(settings.free_bonus_config, bonusReferenceTime);
  const recomputedBonusDuration = effectiveBonusDuration(
    keyTypeBaseDuration,
    bonusRuntimeAtStart,
    sess.key_type_code ?? null,
  );
  const dur = Math.max(
    60,
    Number(sess.duration_seconds ?? 0),
    Number(recomputedBonusDuration.effective_seconds ?? 0),
  );
  const bonusSecondsApplied = recomputedBonusDuration.applied
    ? Math.max(0, Number(recomputedBonusDuration.bonus_seconds ?? 0))
    : 0;
  const expires_at = new Date(Date.now() + dur * 1000).toISOString();
  const keyTypeBaseLabel = keyTypeMeta?.label ?? null;
  const bonusLabel = bonusSecondsApplied > 0
    ? (bonusSecondsApplied % 3600 === 0
      ? `${bonusSecondsApplied / 3600}H`
      : bonusSecondsApplied % 60 === 0
        ? `${bonusSecondsApplied / 60}P`
        : `${bonusSecondsApplied}S`)
    : "";
  const key_type_label = keyTypeBaseLabel && bonusLabel
    ? `${keyTypeBaseLabel} 🔥 +${bonusLabel}`
    : keyTypeBaseLabel;

  if (Number(sess.duration_seconds ?? 0) !== dur) {
    await db.from("licenses_free_sessions")
      .update({
        duration_seconds: dur,
        selection_meta: {
          ...(sess.selection_meta && typeof sess.selection_meta === "object" ? sess.selection_meta : {}),
          base_duration_seconds: keyTypeBaseDuration,
          bonus_seconds: bonusSecondsApplied,
          effective_duration_seconds: dur,
          bonus_reference_at: bonusReferenceTime.toISOString(),
        },
      })
      .eq("session_id", sessionId)
      .eq("status", "revealing");
  }

  const sessForIssue = {
    ...sess,
    duration_seconds: dur,
    selection_meta: {
      ...(sess.selection_meta && typeof sess.selection_meta === "object" ? sess.selection_meta : {}),
      base_duration_seconds: keyTypeBaseDuration,
      bonus_seconds: bonusSecondsApplied,
      effective_duration_seconds: dur,
      bonus_reference_at: bonusReferenceTime.toISOString(),
    },
  };
  const allowReset = Boolean(keyTypeMeta?.allow_reset ?? true);
  const appCode = normalizeAppCode(sess.app_code ?? keyTypeMeta?.app_code ?? "free-fire");
  const keySignature = text(keyTypeMeta?.key_signature ?? "FF",32).toUpperCase();
  const freeNote = [`FREE_${String(sess.key_type_code ?? "GENERIC").toUpperCase()}`,`APP=${appCode}`,`SIG=${keySignature}`,`ALLOW_RESET=${allowReset ? 1 : 0}`].join(";");

  if (appCode === "ai-coding" || isAiCodingFreeKeyType(keyTypeMeta, sess)) {
    try {
      const issued = await issueAiSunnyRedeemKey(sessForIssue, keyTypeMeta);
      return ctx.json({ ok: true, ...issued, key_type_label, duration_seconds: dur, base_duration_seconds: keyTypeBaseDuration, bonus_seconds: bonusSecondsApplied, bonus_applied: bonusSecondsApplied > 0, warnings }, 200);
    } catch (error) {
      await db.from("licenses_free_sessions").update({ status: "gate_ok", reveal_count: 0, revealed_at: null, last_error: "AI_REDEEM_KEY_FAILED" }).eq("session_id", sessionId).eq("status", "revealing");
      const code = String(error?.code ?? error?.message ?? "AI_REDEEM_KEY_FAILED");
      return ctx.json({ ok: false, msg: code, code }, Number(error?.status ?? 500));
    }
  }

  if (appCode === "find-dumps") {
    try {
      const issued = await issueFindDumpsRedeemKey(sessForIssue, keyTypeMeta);
      await db.from("licenses_free_sessions").update({ status: "revealed", last_error: null, revealed_at: issued.created_at, reveal_count: 1, claim_token_hash: null, claim_expires_at: null, out_token_hash: null, out_token_hash_pass2: null, out_expires_at: issued.created_at, close_deadline_at: new Date(Date.now() + freeCloseDeadlineSeconds * 1000).toISOString(), copied_at: null }).eq("session_id", sessionId);
      return ctx.json({ ok: true, key: issued.key, expires_at: issued.expires_at, key_type_label, key_type_code: sess.key_type_code ?? null, created_at: issued.created_at, session_id: sessionId, ip_hash: ipHash, allow_reset: false, app_code: issued.app_code, key_signature: issued.key_signature, reward_mode: issued.reward_mode, package_code: issued.package_code, credit_code: issued.credit_code, wallet_kind: issued.wallet_kind, entitlement_seconds: issued.entitlement_seconds, server_redeem_key_id: issued.server_redeem_key_id, duration_seconds: dur, base_duration_seconds: keyTypeBaseDuration, bonus_seconds: bonusSecondsApplied, bonus_applied: bonusSecondsApplied > 0, trace_id: text(sess.trace_id,128) || null, warnings: warnings.length ? warnings : undefined }, 200);
    } catch (error) {
      await db.from("licenses_free_sessions").update({ status: "gate_ok", reveal_count: 0, revealed_at: null, last_error: "FIND_DUMPS_KEY_FAILED" }).eq("session_id", sessionId).eq("status", "revealing");
      const code = String(error?.code ?? error?.message ?? "FIND_DUMPS_KEY_FAILED");
      return ctx.json({ ok: false, msg: code, code }, Number(error?.status ?? 500));
    }
  }

  let fakeLagRule = null;
  if (appCode === "fake-lag") {
    const r = await db.from("license_access_rules").select("*").eq("app_code", "fake-lag").maybeSingle();
    fakeLagRule = r.data ?? null;
    if (fakeLagRule && fakeLagRule.public_enabled === false) {
      await db.from("licenses_free_sessions").update({ status: "gate_ok", reveal_count: 0, revealed_at: null }).eq("session_id", sessionId).eq("status", "revealing");
      return ctx.json({ ok: false, msg: "APP_KEY_DISABLED" }, 200);
    }
  }
  const fakeLagPrefix = normalizeKeyPrefix(fakeLagRule?.key_prefix || "FAKELAG");
  const fakeLagMaxVerify = Math.max(1, Number(fakeLagRule?.max_verify_per_key ?? 1));
  let inserted = null, lastError = "", attempts = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const key = makeKey(appCode === "fake-lag" ? fakeLagPrefix : "SUNNY");
    const result = await insertLicenseCompat(db, {
      key, appCode, expiresAt: expires_at, maxDevices: appCode === "fake-lag" ? fakeLagMaxVerify : 1,
      maxIps: 1, maxVerify: appCode === "fake-lag" ? fakeLagMaxVerify : 1,
      note: appCode === "fake-lag" ? `${freeNote};RULE_SOURCE=server_app_fake_lag` : freeNote,
    });
    attempts = result.attempts; lastError = result.errorDetail || "";
    if (result.ok && result.data?.id) { inserted = { id: result.data.id, key: result.data.key }; break; }
    if (!result.duplicate) break;
  }
  if (!inserted) {
    await db.from("licenses_free_sessions").update({ status: "gate_ok", reveal_count: 0, revealed_at: null, last_error: "LICENSE_INSERT_FAILED" }).eq("session_id", sessionId);
    await insertGateLog(db, { session_id: sessionId, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "license_insert_failed", detail: { app_code: appCode, message: lastError || "unknown", attempts }, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash, trace_id: text(sess.trace_id,128) || null });
    return ctx.json({ ok: false, code: "LICENSE_INSERT_FAILED", msg: "SERVER_ERROR", trace_id: text(sess.trace_id,128) || null }, 500);
  }
  await db.from("licenses_free_sessions").update({
    status: "revealed", last_error: null, revealed_at: new Date().toISOString(), revealed_license_id: inserted.id, reveal_count: 1,
    claim_token_hash: null, claim_expires_at: null, out_token_hash: null, out_token_hash_pass2: null, out_expires_at: new Date().toISOString(),
    close_deadline_at: new Date(Date.now() + freeCloseDeadlineSeconds * 1000).toISOString(), copied_at: null,
  }).eq("session_id", sessionId);
  await db.from("licenses_free_issues").insert({ license_id: inserted.id, key_mask: maskKey(inserted.key), expires_at, session_id: sessionId, ip_hash: ipHash, fingerprint_hash: fpHash, ua_hash: uaHash, app_code: appCode, key_signature: keySignature, server_redeem_key_id: null });
  return ctx.json({ ok: true, key: inserted.key, expires_at, key_type_label, key_type_code: sess.key_type_code ?? null, created_at: new Date().toISOString(), session_id: sessionId, ip_hash: ipHash, allow_reset: allowReset, app_code: appCode, key_signature: keySignature, duration_seconds: dur, base_duration_seconds: keyTypeBaseDuration, bonus_seconds: bonusSecondsApplied, bonus_applied: bonusSecondsApplied > 0, trace_id: text(sess.trace_id,128) || null, warnings: warnings.length ? warnings : undefined, debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
}
