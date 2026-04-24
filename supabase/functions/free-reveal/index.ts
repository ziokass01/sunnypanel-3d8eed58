import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveClientIp } from "../_shared/client-ip.ts";

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

function normalizeKeyPrefix(value: unknown) {
  const raw = String(value ?? "SUNNY").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return raw || "SUNNY";
}

function makeKey(prefix = "SUNNY") {
  return `${normalizeKeyPrefix(prefix)}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function makeRedeemKey(signature = "FND") {
  const sig = String(signature || "FND").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "FND";
  return `${sig}-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

function addSecondsIso(baseIso: string, seconds: number) {
  const baseMs = new Date(baseIso).getTime();
  const safeSeconds = Math.max(0, Math.trunc(Number(seconds) || 0));
  return new Date(baseMs + safeSeconds * 1000).toISOString();
}

function normalizeAppCode(value: unknown) {
  const code = String(value ?? "free-fire").trim().toLowerCase();
  return code || "free-fire";
}

function normalizeWalletKind(value: unknown) {
  const kind = String(value ?? "").trim().toLowerCase();
  return kind === "vip" ? "vip" : kind === "normal" ? "normal" : null;
}

const FIND_DUMPS_PACKAGE_META: Record<string, { title: string; plan_code: string; reward_mode: string; soft_credit_amount: number; premium_credit_amount: number; }> = {
  classic: { title: "Find Dumps Classic", plan_code: "classic", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
  go: { title: "Find Dumps Go", plan_code: "go", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
  plus: { title: "Find Dumps Plus", plan_code: "plus", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
  pro: { title: "Find Dumps Pro", plan_code: "pro", reward_mode: "plan", soft_credit_amount: 0, premium_credit_amount: 0 },
};

const FIND_DUMPS_CREDIT_META: Record<string, { title: string; wallet_kind: "normal" | "vip"; soft_credit_amount: number; premium_credit_amount: number; reward_mode: string; }> = {
  "credit-normal": { title: "Find Dumps Credit thường", wallet_kind: "normal", soft_credit_amount: 1.5, premium_credit_amount: 0, reward_mode: "soft_credit" },
  "credit-vip": { title: "Find Dumps Credit VIP", wallet_kind: "vip", soft_credit_amount: 0, premium_credit_amount: 0.5, reward_mode: "premium_credit" },
};

function maskKey(key: string) {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

async function getKeyTypeMeta(sb: any, code: string | null) {
  if (!code) return null;
  const res = await sb.from("licenses_free_key_types").select("*").eq("code", code).maybeSingle();
  return res.data ?? null;
}


async function getFindDumpsRewardMeta(sb: any, code: string | null) {
  if (!code) return null;
  const res = await sb
    .from("server_app_reward_packages")
    .select("package_code,title,description,enabled,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
    .eq("app_code", "find-dumps")
    .eq("package_code", code)
    .maybeSingle();
  if (res.error) {
    const msg = String(res.error?.message ?? "").toLowerCase();
    if (!(msg.includes("does not exist") || msg.includes("undefined column") || msg.includes("could not find"))) {
      throw res.error;
    }
    return null;
  }
  if (!res.data || res.data.enabled === false) return null;
  return res.data;
}

function getVietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((x) => x.type === "year")?.value;
  const month = parts.find((x) => x.type === "month")?.value;
  const day = parts.find((x) => x.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function isMissingSelectColumn(error: any) {
  const msg = String(error?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("undefined column") || msg.includes("could not find");
}

async function resolveAppQuotaLimits(sb: any, appCode: string, fallbackFp: number, fallbackIp: number) {
  const normalized = normalizeAppCode(appCode);
  try {
    const { data, error } = await sb
      .from("server_app_settings")
      .select("app_code,free_daily_limit_per_fingerprint,free_daily_limit_per_ip")
      .eq("app_code", normalized)
      .maybeSingle();
    if (error) {
      if (isMissingSelectColumn(error)) {
        return { free_daily_limit_per_fingerprint: fallbackFp, free_daily_limit_per_ip: fallbackIp };
      }
      throw error;
    }
    return {
      free_daily_limit_per_fingerprint: Math.max(0, Number((data as any)?.free_daily_limit_per_fingerprint ?? fallbackFp)),
      free_daily_limit_per_ip: Math.max(0, Number((data as any)?.free_daily_limit_per_ip ?? fallbackIp)),
    };
  } catch {
    return { free_daily_limit_per_fingerprint: fallbackFp, free_daily_limit_per_ip: fallbackIp };
  }
}

function getVietnamDayRangeUtc(day: string) {
  const [year, month, date] = day.split("-").map((v) => Number(v));
  const utcOffsetMs = 7 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, month - 1, date, 0, 0, 0, 0) - utcOffsetMs;
  const nextStartMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startUtcIso: new Date(startMs).toISOString(),
    nextStartUtcIso: new Date(nextStartMs).toISOString(),
  };
}

function isActiveBlockUntil(blockedUntil?: string | null) {
  if (!blockedUntil) return true;
  const t = Date.parse(blockedUntil);
  return Number.isFinite(t) && t > Date.now();
}

async function insertGateLog(sb: any, payload: {
  session_id?: string | null;
  key_type_code?: string | null;
  pass_no?: number | null;
  event_code: string;
  detail?: Record<string, unknown> | null;
  fingerprint_hash?: string | null;
  ip_hash?: string | null;
  ua_hash?: string | null;
  trace_id?: string | null;
}) {
  try {
    await sb.from("licenses_free_gate_logs").insert({
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
  } catch {
    // ignore log failures
  }
}

async function maybeAutoBlockGateFailures(sb: any, args: {
  fingerprint_hash: string;
  ip_hash: string;
  session_id?: string | null;
  key_type_code?: string | null;
  pass_no?: number | null;
  trace_id?: string | null;
}) {
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let failCount = 0;
  try {
    const recent = await sb
      .from("licenses_free_gate_logs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", windowStart)
      .in("event_code", [
        "REFERRER_REQUIRED",
        "BAD_REFERRER",
        "OUT_TOKEN_MISMATCH",
        "GATE_TOO_EARLY",
        "TOO_FAST",
        "TOO_FAST_PASS2",
        "DEVICE_MISMATCH",
        "CLAIM_INVALID",
        "CLAIM_EXPIRED",
        "GATE_STATUS_INVALID",
        "DAILY_QUOTA",
        "DAILY_QUOTA_FP",
        "DAILY_QUOTA_IP",
      ])
      .or(`fingerprint_hash.eq.${args.fingerprint_hash},ip_hash.eq.${args.ip_hash}`);
    failCount = Number(recent.count ?? 0);
  } catch {
    failCount = 0;
  }
  if (failCount < 5) return;
  const blockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  try {
    await sb.from("licenses_free_blocklist").upsert({
      fingerprint_hash: args.fingerprint_hash,
      ip_hash: args.ip_hash,
      reason: "AUTO_GATE_FAIL_5_IN_10M",
      enabled: true,
      blocked_until: blockedUntil,
      created_by: "system",
      note: `Auto block after ${failCount} gate/claim failures in 10 minutes`,
    });
  } catch {
    // ignore block failures
  }
  await insertGateLog(sb, {
    session_id: args.session_id ?? null,
    key_type_code: args.key_type_code ?? null,
    pass_no: args.pass_no ?? null,
    event_code: "AUTO_BLOCKED",
    detail: { fail_count_10m: failCount, blocked_until: blockedUntil, reason: "AUTO_GATE_FAIL_5_IN_10M" },
    fingerprint_hash: args.fingerprint_hash,
    ip_hash: args.ip_hash,
    trace_id: args.trace_id ?? null,
  });
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
  session_id: z.string().uuid().optional(),
  fingerprint: z.string().min(6).max(128),
  app_code: z.string().min(2).max(64).optional(),
  package_code: z.string().min(2).max(64).nullable().optional(),
  credit_code: z.string().min(2).max(64).nullable().optional(),
  wallet_kind: z.string().min(2).max(32).nullable().optional(),

  // Turnstile response token from browser widget
  cf_turnstile_response: z.string().min(10).max(4096).nullable().optional(),

  // Back-compat (older clients)
  turnstile_token: z.string().min(10).max(4096).nullable().optional(),

  debug: z.union([z.boolean(), z.literal(1), z.literal("1")]).optional(),
});

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
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, msg: "INVALID_INPUT" }, 200);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, msg: "INVALID_INPUT" }, 200);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return json({ ok: false, msg: "SERVER_MISCONFIG" }, 500);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  const ip = resolveClientIp(req) ?? "";
  const ua = req.headers.get("user-agent") ?? "";

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) return json({ ok: false, msg: sErr.message }, 500);

  if (!Boolean(settings?.free_enabled ?? true)) {
    return json({ ok: false, msg: "CLOSED" }, 200);
  }

  const freeReturnSeconds = Math.max(10, Number(settings?.free_return_seconds ?? 60));

  // FREE flow no longer uses Turnstile. Reset-key keeps its own Turnstile flow.

  const debugEnabled =
    (req.headers.get("x-debug") ?? "").trim() === "1" ||
    (parsed.data as any).debug === true ||
    (parsed.data as any).debug === 1 ||
    (parsed.data as any).debug === "1";

  const claimTokenTrim = String(parsed.data.claim_token ?? "").trim();
  const outTokenTrim = String(parsed.data.out_token ?? "").trim();
  const sessionIdTrim = String(parsed.data.session_id ?? "").trim();

  const claimHash = await sha256Hex(claimTokenTrim);
  const outHash = outTokenTrim ? await sha256Hex(outTokenTrim) : "";
  const fpHash = await sha256Hex(String(parsed.data.fingerprint ?? "").trim());
  const uaHash = await sha256Hex(ua);
  const ipHash = await sha256Hex(ip);

  const blocked = await sb
    .from("licenses_free_blocklist")
    .select("id,blocked_until")
    .eq("enabled", true)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash}`)
    .limit(1)
    .maybeSingle();
  if (blocked.data?.id && isActiveBlockUntil((blocked.data as any).blocked_until)) {
    return json({ ok: false, msg: "BLOCKED" }, 403);
  }

  // Session lookup:
  // - If claimHash && outHash both present: prefer lookup by BOTH (prevents "half-mixed" tokens)
  // - Then fallback to explicit session_id
  // - Then fallback to claim_token_hash
  // - Then fallback to out_token_hash
  const requestedSessionId = sessionIdTrim;

  let sess: any = null;
  const debugLookup: Record<string, unknown> | null = debugEnabled
    ? {
      session_id_provided: Boolean(requestedSessionId),
      claim_token_len: claimTokenTrim.length,
      out_token_len: outTokenTrim.length,
      looked_up_by: null,
    }
    : null;

  if (claimHash && outHash) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash,out_token_hash_pass2,passes_required,passes_completed,current_pass,app_code,package_code,credit_code,wallet_kind,issued_server_redeem_key_id,issued_server_reward_mode,selection_meta,trace_id",
      )
      .eq("claim_token_hash", claimHash)
      .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`)
      .maybeSingle();
    if (!q.error && q.data) sess = q.data;
    if (debugLookup) debugLookup.looked_up_by = "claim+out(any-pass)";
  }

  if (!sess && requestedSessionId) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash,out_token_hash_pass2,passes_required,passes_completed,current_pass,app_code,package_code,credit_code,wallet_kind,issued_server_redeem_key_id,issued_server_reward_mode,selection_meta,trace_id",
      )
      .eq("session_id", requestedSessionId)
      .maybeSingle();
    if (!q.error && q.data) sess = q.data;
    if (debugLookup) debugLookup.looked_up_by = debugLookup.looked_up_by ?? "session_id";
  }

  if (!sess && claimHash) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash,out_token_hash_pass2,passes_required,passes_completed,current_pass,app_code,package_code,credit_code,wallet_kind,issued_server_redeem_key_id,issued_server_reward_mode,selection_meta,trace_id",
      )
      .eq("claim_token_hash", claimHash)
      .maybeSingle();
    if (!q.error && q.data) sess = q.data;
    if (debugLookup) debugLookup.looked_up_by = debugLookup.looked_up_by ?? "claim_token_hash";
  }

  if (!sess && outHash) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash,out_token_hash_pass2,passes_required,passes_completed,current_pass,app_code,package_code,credit_code,wallet_kind,issued_server_redeem_key_id,issued_server_reward_mode,selection_meta,trace_id",
      )
      .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`)
      .maybeSingle();
    if (!q.error && q.data) sess = q.data;
    if (debugLookup) debugLookup.looked_up_by = debugLookup.looked_up_by ?? "out_token_hash(any-pass)";
  }

  if (!sess) {
    return json({ ok: false, msg: "SESSION_NOT_FOUND", code: "SESSION_NOT_FOUND", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  const sessionId = sess.session_id;
  const revealedLicenseId = (sess as any).revealed_license_id as string | null;

  const now = Date.now();
  const expMs = Date.parse(sess.expires_at);
  if (!isFinite(expMs) || expMs < now) return json({ ok: false, msg: "SESSION_EXPIRED" }, 200);

  if (sess.status === "closed" || Boolean((sess as any).copied_at)) {
    return json({ ok: false, msg: "SESSION_CLOSED" }, 200);
  }

  const closeDeadlineMs = (sess as any).close_deadline_at ? Date.parse((sess as any).close_deadline_at) : 0;
  if (closeDeadlineMs && isFinite(closeDeadlineMs) && closeDeadlineMs < now) {
    await sb
      .from("licenses_free_sessions")
      .update({
        status: "closed",
        out_expires_at: new Date().toISOString(),
        claim_token_hash: null,
        claim_expires_at: null,
      })
      .eq("session_id", sessionId);
    return json({ ok: false, msg: "SESSION_CLOSED" }, 200);
  }

  // Device binding rules (mobile-friendly):
  // - Fingerprint mismatch => FAIL
  // - UA / IP mismatch => WARNING only (mobile 4G IP changes frequently)
  const warnings: string[] = [];

  if (sess.fingerprint_hash !== fpHash) {
    return json({ ok: false, msg: "FP_MISMATCH", code: "FP_MISMATCH", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  if (sess.ua_hash !== uaHash) warnings.push("UA_MISMATCH");
  if ((sess as any).ip_hash !== ipHash) warnings.push("IP_MISMATCH");

  async function getKeyTypeLabel(code: string | null) {
    if (!code) return null;
    const kt = await sb.from("licenses_free_key_types").select("label").eq("code", code).maybeSingle();
    return kt.data?.label ?? null;
  }

  async function findExistingIssuedKey() {
    const directId = revealedLicenseId ?? null;
    if (directId) {
      const lic = await sb.from("licenses").select("key,expires_at").eq("id", directId).maybeSingle();
      if (lic.data?.key) return { key: lic.data.key as string, expires_at: (lic.data.expires_at ?? null) as string, server_redeem_key_id: null as string | null };
    }

    const issue = await sb
      .from("licenses_free_issues")
      .select("license_id,expires_at,server_redeem_key_id,key_mask")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const serverRedeemKeyId = String((issue.data as any)?.server_redeem_key_id ?? "").trim() || null;
    if (serverRedeemKeyId) {
      const rk = await sb.from("server_app_redeem_keys").select("redeem_key,expires_at").eq("id", serverRedeemKeyId).maybeSingle();
      if (rk.data?.redeem_key) return { key: rk.data.redeem_key as string, expires_at: (rk.data.expires_at ?? issue.data?.expires_at) as string, server_redeem_key_id: serverRedeemKeyId };
      const masked = String((issue.data as any)?.key_mask ?? "").trim();
      if (masked) return { key: masked, expires_at: String((issue.data as any)?.expires_at ?? "").trim(), server_redeem_key_id: serverRedeemKeyId };
    }

    const licenseId = issue.data?.license_id;
    if (!licenseId) return null;

    const lic = await sb.from("licenses").select("key,expires_at").eq("id", licenseId).maybeSingle();
    if (!lic.data?.key) return null;

    return { key: lic.data.key as string, expires_at: (lic.data.expires_at ?? issue.data?.expires_at) as string, server_redeem_key_id: null as string | null };
  }


  async function issueFindDumpsRedeemKey(sessRow: any, keyTypeMeta: any) {
    const durationSeconds = Math.max(60, Number(sessRow?.duration_seconds ?? 0));
    const issuedAt = new Date().toISOString();
    const appCode = "find-dumps";
    const sessionPackageCode = String(sessRow?.package_code ?? (parsed.data as any)?.package_code ?? "").trim().toLowerCase();
    const sessionCreditCode = String(sessRow?.credit_code ?? (parsed.data as any)?.credit_code ?? "").trim().toLowerCase();
    const requestedWalletKind = normalizeWalletKind(sessRow?.wallet_kind ?? (parsed.data as any)?.wallet_kind);
    const hasPackage = Boolean(sessionPackageCode);
    const hasCredit = Boolean(sessionCreditCode);
    if (hasPackage === hasCredit) {
      throw Object.assign(new Error("FIND_DUMPS_SELECTION_REQUIRED"), { status: 409, code: "FIND_DUMPS_SELECTION_REQUIRED" });
    }

    let reward_mode = "plan";
    let plan_code: string | null = null;
    let soft_credit_amount = 0;
    let premium_credit_amount = 0;
    let entitlement_seconds = 0;
    let title = "Find Dumps key";
    let description = "";
    let package_code: string | null = null;
    let credit_code: string | null = null;
    let wallet_kind: string | null = null;

    if (hasPackage) {
      const pkgRow = await getFindDumpsRewardMeta(sb, sessionPackageCode);
      const pkg = pkgRow ?? FIND_DUMPS_PACKAGE_META[sessionPackageCode];
      if (!pkg) {
        throw Object.assign(new Error("FIND_DUMPS_PACKAGE_NOT_FOUND"), { status: 404, code: "FIND_DUMPS_PACKAGE_NOT_FOUND" });
      }
      reward_mode = String(pkg.reward_mode ?? "plan");
      plan_code = String(pkg.plan_code ?? "").trim() || null;
      soft_credit_amount = Number(pkg.soft_credit_amount ?? 0);
      premium_credit_amount = Number(pkg.premium_credit_amount ?? 0);
      entitlement_seconds = durationSeconds;
      title = `${String(pkg.title ?? sessionPackageCode)} ${keyTypeMeta?.label ?? ""}`.trim();
      description = `Free flow package ${sessionPackageCode}`;
      package_code = sessionPackageCode;
    } else {
      const creditRow = await getFindDumpsRewardMeta(sb, sessionCreditCode);
      const credit = creditRow ?? FIND_DUMPS_CREDIT_META[sessionCreditCode];
      if (!credit) {
        throw Object.assign(new Error("FIND_DUMPS_CREDIT_NOT_FOUND"), { status: 404, code: "FIND_DUMPS_CREDIT_NOT_FOUND" });
      }
      reward_mode = String(credit.reward_mode ?? "soft_credit");
      plan_code = null;
      soft_credit_amount = Number(credit.soft_credit_amount ?? 0);
      premium_credit_amount = Number(credit.premium_credit_amount ?? 0);
      entitlement_seconds = 0;
      title = `${String(credit.title ?? sessionCreditCode)} ${keyTypeMeta?.label ?? ""}`.trim();
      description = `Free flow credit ${sessionCreditCode}`;
      credit_code = sessionCreditCode;
      wallet_kind = requestedWalletKind ?? ((reward_mode === "premium_credit") ? "vip" : "normal");
    }

    const expiresAt = addSecondsIso(issuedAt, durationSeconds);
    let inserted: { id: string; redeem_key: string } | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const redeem_key = makeRedeemKey("FND");
      const ins = await sb
        .from("server_app_redeem_keys")
        .insert({
          app_code: appCode,
          redeem_key,
          title,
          description,
          enabled: true,
          starts_at: issuedAt,
          expires_at: expiresAt,
          max_redemptions: 1,
          redeemed_count: 0,
          reward_mode,
          plan_code,
          soft_credit_amount,
          premium_credit_amount,
          entitlement_days: 0,
          entitlement_seconds,
          trace_id: String(sessRow?.trace_id ?? "").trim() || null,
          source_free_session_id: sessionId,
          notes: `FREE_FLOW;TRACE=${String(sessRow?.trace_id ?? "").trim() || "-"};SESSION=${sessionId};KEY_TYPE=${sessRow?.key_type_code ?? ""};APP=${appCode}`,
          metadata: {
            source: "free-flow",
            free_session_id: sessionId,
            trace_id: String(sessRow?.trace_id ?? "").trim() || null,
            free_issue_kind: hasPackage ? "package" : "credit",
            package_code,
            credit_code,
            wallet_kind,
            key_type_code: sessRow?.key_type_code ?? null,
            key_signature: "FD",
            issued_at: issuedAt,
            claim_starts_entitlement: hasPackage,
            expires_from_claim: true,
            one_time_use: true,
            free_duration_seconds: durationSeconds,
          },
        })
        .select("id,redeem_key")
        .single();
      if (!ins.error && ins.data?.id) {
        inserted = { id: String(ins.data.id), redeem_key: String(ins.data.redeem_key) };
        break;
      }
    }
    if (!inserted) {
      throw Object.assign(new Error("SERVER_REDEEM_KEY_INSERT_FAILED"), { status: 500, code: "SERVER_REDEEM_KEY_INSERT_FAILED" });
    }

    await sb.from("licenses_free_sessions").update({
      issued_server_redeem_key_id: inserted.id,
      issued_server_reward_mode: reward_mode,
      app_code: appCode,
      package_code,
      credit_code,
      wallet_kind,
      selection_meta: {
        app_code: appCode,
        package_code,
        credit_code,
        wallet_kind,
        reward_mode,
        duration_seconds: durationSeconds,
        trace_id: String(sessRow?.trace_id ?? "").trim() || null,
      },
    }).eq("session_id", sessionId);

    await sb.from("licenses_free_issues").insert({
      license_id: null,
      key_mask: inserted.redeem_key,
      expires_at: expiresAt,
      session_id: sessionId,
      ip_hash: ipHash,
      fingerprint_hash: fpHash,
      app_code: appCode,
      key_signature: "FD",
      server_redeem_key_id: inserted.id,
    });

    return {
      key: inserted.redeem_key,
      expires_at: expiresAt,
      allow_reset: false,
      app_code: appCode,
      key_signature: "FD",
      reward_mode,
      package_code,
      credit_code,
      wallet_kind,
      entitlement_seconds,
      created_at: issuedAt,
      server_redeem_key_id: inserted.id,
    };
  }

  // Already revealed (or in-progress) => return same key if present; otherwise auto-repair inconsistent state.
  if (Number(sess.reveal_count ?? 0) > 0 || sess.status === "revealed" || sess.status === "revealing") {
    const existing = await findExistingIssuedKey();
    const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);
    const keyTypeMeta = await getKeyTypeMeta(sb, sess.key_type_code ?? null);
    if (existing) {
      return json({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label, allow_reset: existing.server_redeem_key_id ? false : Boolean(keyTypeMeta?.allow_reset ?? true), app_code: sess.app_code ?? keyTypeMeta?.app_code ?? "free-fire", key_signature: sess.app_code === "find-dumps" ? "FD" : keyTypeMeta?.key_signature ?? "FF", warnings: warnings.length ? warnings : undefined }, 200);
    }

    // Inconsistent: session says revealed/revealing but no issued key row exists.
    // Auto-repair: reset to gate_ok and allow user to retry.
    await sb
      .from("licenses_free_sessions")
      .update({ status: "gate_ok", reveal_count: 0, revealed_at: null, last_error: "INCONSISTENT_STATE_REPAIRED" })
      .eq("session_id", sessionId);

    return json(
      {
        ok: false,
        msg: "INCONSISTENT_STATE_REPAIRED_TRY_AGAIN",
        code: "INCONSISTENT_STATE_REPAIRED_TRY_AGAIN",
        warnings: warnings.length ? warnings : undefined,
        debug: debugLookup ? { lookup: debugLookup } : undefined,
      },
      200,
    );
  }

  // Require valid claim token when NOT yet revealed.
  const claimExpMs = sess.claim_expires_at ? Date.parse(sess.claim_expires_at) : 0;

  if (!claimHash || !sess.claim_token_hash || sess.claim_token_hash !== claimHash) {
    await sb.from("licenses_free_sessions").update({ last_error: "CLAIM_INVALID" }).eq("session_id", sessionId);
    await insertGateLog(sb, { session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "CLAIM_INVALID", detail: {}, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
    await maybeAutoBlockGateFailures(sb, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
    return json({ ok: false, msg: "CLAIM_INVALID", code: "CLAIM_INVALID", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  if (!claimExpMs || claimExpMs < now) {
    await sb.from("licenses_free_sessions").update({ last_error: "CLAIM_EXPIRED" }).eq("session_id", sessionId);
    await insertGateLog(sb, { session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "CLAIM_EXPIRED", detail: {}, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
    await maybeAutoBlockGateFailures(sb, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
    return json({ ok: false, msg: "CLAIM_EXPIRED", code: "CLAIM_EXPIRED", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  if (sess.status !== "gate_ok") {
    await sb.from("licenses_free_sessions").update({ last_error: "GATE_STATUS_INVALID" }).eq("session_id", sessionId);
    await insertGateLog(sb, { session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "GATE_STATUS_INVALID", detail: { status: sess.status }, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
    await maybeAutoBlockGateFailures(sb, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
    return json({ ok: false, msg: "GATE_STATUS_INVALID", code: "GATE_STATUS_INVALID", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  // Require a matching out_token. VIP pass2 may legitimately use out_token_hash_pass2 instead of out_token_hash.
  const acceptedOutHashes = [String((sess as any).out_token_hash || "").trim(), String((sess as any).out_token_hash_pass2 || "").trim()].filter(Boolean);
  if (acceptedOutHashes.length > 0) {
    if (!outHash) return json({ ok: false, msg: "OUT_TOKEN_REQUIRED", code: "OUT_TOKEN_REQUIRED", debug: debugLookup ? { lookup: debugLookup, accepted_out_hash_slots: acceptedOutHashes.length } : undefined }, 200);
    if (!acceptedOutHashes.includes(outHash)) {
      await insertGateLog(sb, { session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "OUT_TOKEN_MISMATCH", detail: { accepted_out_hash_slots: acceptedOutHashes.length }, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
      await maybeAutoBlockGateFailures(sb, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
      return json({ ok: false, msg: "OUT_TOKEN_MISMATCH", code: "OUT_TOKEN_MISMATCH", debug: debugLookup ? { lookup: debugLookup, accepted_out_hash_slots: acceptedOutHashes.length } : undefined }, 200);
    }
  }

  // Daily quota by Vietnam calendar day (00:00 Asia/Ho_Chi_Minh)
  const dayKey = getVietnamDateKey();
  const dayRange = getVietnamDayRangeUtc(dayKey);

  const quotaAppCode = normalizeAppCode(sess.app_code ?? "free-fire");
  const quotaLimits = await resolveAppQuotaLimits(
    sb,
    quotaAppCode,
    Math.max(0, Number(settings?.free_daily_limit_per_fingerprint ?? 1)),
    Math.max(0, Number((settings as any)?.free_daily_limit_per_ip ?? 0)),
  );
  const dailyLimitFp = Math.max(0, Number(quotaLimits.free_daily_limit_per_fingerprint ?? 1));
  if (dailyLimitFp > 0) {
    const quotaFp = await sb
      .from("licenses_free_issues")
      .select("issue_id", { count: "exact", head: true })
      .gte("created_at", dayRange.startUtcIso)
      .lt("created_at", dayRange.nextStartUtcIso)
      .eq("fingerprint_hash", fpHash)
      .eq("app_code", quotaAppCode);

    const usedFp = Number(quotaFp.count ?? 0);
    if (usedFp >= dailyLimitFp) {
      await sb.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA_FP" }).eq("session_id", sessionId);
      await insertGateLog(sb, { session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "DAILY_QUOTA_FP", detail: { day_key: dayKey, used: usedFp, limit: dailyLimitFp }, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
      await maybeAutoBlockGateFailures(sb, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
      return json({ ok: false, msg: "RATE_LIMIT", code: "RATE_LIMIT", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
    }
  }

  const dailyLimitIp = Math.max(0, Number(quotaLimits.free_daily_limit_per_ip ?? 0));
  if (dailyLimitIp > 0) {
    const quotaIp = await sb
      .from("licenses_free_issues")
      .select("issue_id", { count: "exact", head: true })
      .gte("created_at", dayRange.startUtcIso)
      .lt("created_at", dayRange.nextStartUtcIso)
      .eq("ip_hash", ipHash)
      .eq("app_code", quotaAppCode);

    const usedIp = Number(quotaIp.count ?? 0);
    if (usedIp >= dailyLimitIp) {
      await sb.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA_IP" }).eq("session_id", sessionId);
      await insertGateLog(sb, { session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1), event_code: "DAILY_QUOTA_IP", detail: { day_key: dayKey, used: usedIp, limit: dailyLimitIp }, fingerprint_hash: fpHash, ip_hash: ipHash, ua_hash: uaHash });
      await maybeAutoBlockGateFailures(sb, { fingerprint_hash: fpHash, ip_hash: ipHash, session_id: sessionId, trace_id: String((sess as any).trace_id ?? "").trim() || null, key_type_code: sess.key_type_code ?? null, pass_no: Number(sess.current_pass ?? 1) });
      return json({ ok: false, msg: "RATE_LIMIT", code: "RATE_LIMIT", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
    }
  }

  // Acquire lock BEFORE inserting license (prevents multi-mint bug).
  // IMPORTANT: do NOT clear claim_token_hash here; only rely on status/reveal_count as the mint-lock.
  const lockIso = new Date().toISOString();
  const lock = await sb
    .from("licenses_free_sessions")
    .update({
      status: "revealing",
      reveal_count: 1,
      revealed_at: lockIso,
      last_error: null,
    })
    .eq("session_id", sessionId)
    .eq("status", "gate_ok")
    .eq("reveal_count", 0)
    .eq("claim_token_hash", claimHash)
    .select("session_id,status")
    .maybeSingle();

  if (!lock.data) {
    const existing = await findExistingIssuedKey();
    const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);
    const keyTypeMeta = await getKeyTypeMeta(sb, sess.key_type_code ?? null);
    if (existing) return json({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label, allow_reset: existing.server_redeem_key_id ? false : Boolean(keyTypeMeta?.allow_reset ?? true), app_code: sess.app_code ?? keyTypeMeta?.app_code ?? "free-fire", key_signature: sess.app_code === "find-dumps" ? "FD" : keyTypeMeta?.key_signature ?? "FF", warnings: warnings.length ? warnings : undefined }, 200);

    // If someone else locked it, signal in-progress; otherwise report lock failure clearly.
    if (sess.status === "revealing") {
      return json({ ok: false, msg: "REVEAL_IN_PROGRESS", code: "REVEAL_IN_PROGRESS", warnings: warnings.length ? warnings : undefined }, 200);
    }
    return json({ ok: false, msg: "SESSION_LOCK_FAILED", code: "SESSION_LOCK_FAILED", warnings: warnings.length ? warnings : undefined }, 200);
  }

  const dur = Math.max(60, Number(sess.duration_seconds ?? 0));
  const expires_at = new Date(Date.now() + dur * 1000).toISOString();
  const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);
  const keyTypeMeta = await getKeyTypeMeta(sb, sess.key_type_code ?? null);
  const allowReset = Boolean(keyTypeMeta?.allow_reset ?? true);
  const appCode = normalizeAppCode(sess.app_code ?? keyTypeMeta?.app_code ?? "free-fire");
  const keySignature = String(keyTypeMeta?.key_signature ?? "FF").trim().toUpperCase();
  const freeNote = [
    `FREE_${String(sess.key_type_code ?? "GENERIC").toUpperCase()}`,
    `APP=${appCode}`,
    `SIG=${keySignature}`,
    `ALLOW_RESET=${allowReset ? 1 : 0}`,
  ].join(";");

  if (appCode === "find-dumps") {
    const issued = await issueFindDumpsRedeemKey(sess, keyTypeMeta);
    await sb
      .from("licenses_free_sessions")
      .update({
        status: "revealed",
        last_error: null,
        revealed_at: issued.created_at,
        reveal_count: 1,
        close_deadline_at: new Date(Date.now() + freeReturnSeconds * 1000).toISOString(),
        copied_at: null,
      })
      .eq("session_id", sessionId);

    const debugOut = debugEnabled
      ? {
        lookup: debugLookup,
        lens: {
          claim_token: claimTokenTrim.length,
          out_token: outTokenTrim.length,
          session_id: sessionIdTrim.length,
          fingerprint: String(parsed.data.fingerprint ?? "").trim().length,
        },
        warnings,
      }
      : undefined;

    return json({
      ok: true,
      key: issued.key,
      expires_at: issued.expires_at,
      key_type_label,
      key_type_code: sess.key_type_code ?? null,
      created_at: issued.created_at,
      session_id: sessionId,
      ip_hash: ipHash,
      allow_reset: false,
      app_code: issued.app_code,
      key_signature: issued.key_signature,
      reward_mode: issued.reward_mode,
      package_code: issued.package_code,
      credit_code: issued.credit_code,
      wallet_kind: issued.wallet_kind,
      entitlement_seconds: issued.entitlement_seconds,
      server_redeem_key_id: issued.server_redeem_key_id,
      trace_id: String((sess as any).trace_id ?? "").trim() || null,
      warnings: warnings.length ? warnings : undefined,
      debug: debugOut,
    }, 200);
  }

  // Mint license
  let inserted: { id: string; key: string } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const key = makeKey(appCode === "fake-lag" ? "FAKELAG" : "SUNNY");
    const ins = await sb
      .from("licenses")
      .insert({
        key,
        is_active: true,
        max_devices: 1,
        max_ips: appCode === "fake-lag" ? 1 : null,
        max_verify: appCode === "fake-lag" ? 1 : null,
        expires_at,
        note: freeNote,
        app_code: appCode,
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
      .update({ status: "gate_ok", reveal_count: 0, revealed_at: null, last_error: "INSERT_FAILED" })
      .eq("session_id", sessionId);
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  await sb
    .from("licenses_free_sessions")
    .update({
      status: "revealed",
      last_error: null,
      revealed_at: new Date().toISOString(),
      revealed_license_id: inserted.id,
      reveal_count: 1,
      close_deadline_at: new Date(Date.now() + freeReturnSeconds * 1000).toISOString(),
      copied_at: null,
    })
    .eq("session_id", sessionId);

  await sb.from("licenses_free_issues").insert({
    license_id: inserted.id,
    key_mask: maskKey(inserted.key),
    expires_at,
    session_id: sessionId,
    ip_hash: ipHash,
    fingerprint_hash: fpHash,
    ua_hash: uaHash,
    app_code: appCode,
    key_signature: keySignature,
    server_redeem_key_id: null,
  });

  const debugOut = debugEnabled
    ? {
      lookup: debugLookup,
      lens: {
        claim_token: claimTokenTrim.length,
        out_token: outTokenTrim.length,
        session_id: sessionIdTrim.length,
        fingerprint: String(parsed.data.fingerprint ?? "").trim().length,
      },
      warnings,
    }
    : undefined;

  return json(
    {
      ok: true,
      key: inserted.key,
      expires_at,
      key_type_label,
      key_type_code: sess.key_type_code ?? null,
      created_at: new Date().toISOString(),
      session_id: sessionId,
      ip_hash: ipHash,
      allow_reset: allowReset,
      app_code: appCode,
      key_signature: keySignature,
      trace_id: String((sess as any).trace_id ?? "").trim() || null,
      warnings: warnings.length ? warnings : undefined,
      debug: debugOut,
    },
    200,
  );
});
