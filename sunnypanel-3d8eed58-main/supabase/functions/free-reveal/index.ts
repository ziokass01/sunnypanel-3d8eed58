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

function isActiveBlockUntil(blockedUntil?: string | null) {
  if (!blockedUntil) return true;
  const t = Date.parse(blockedUntil);
  return Number.isFinite(t) && t > Date.now();
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

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_enabled,free_disabled_message,free_daily_limit_per_fingerprint,free_return_seconds")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) return json({ ok: false, msg: sErr.message }, 500);

  if (!Boolean(settings?.free_enabled ?? true)) {
    return json({ ok: false, msg: "CLOSED" }, 200);
  }

  const freeReturnSeconds = Math.max(10, Number(settings?.free_return_seconds ?? 60));

  // Optional Turnstile (enabled only if BOTH env keys exist AND site key is not a placeholder)
  const TURNSTILE_SITE_KEY_RAW = (Deno.env.get("TURNSTILE_SITE_KEY") ?? "").trim();
  const TURNSTILE_SECRET_KEY_RAW = (Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim();

  const isPlaceholderTurnstileKey = (k: string) => {
    const v = String(k || "").trim().toLowerCase();
    return v === "" || v === "dummy" || v === "changeme" || v === "test";
  };

  const turnstile_enabled = Boolean(
    TURNSTILE_SITE_KEY_RAW &&
      TURNSTILE_SECRET_KEY_RAW &&
      !isPlaceholderTurnstileKey(TURNSTILE_SITE_KEY_RAW),
  );

  if (turnstile_enabled) {
    const token =
      String((parsed.data as any).cf_turnstile_response ?? "").trim() ||
      String((parsed.data as any).turnstile_token ?? "").trim();

    if (!token) return json({ ok: false, msg: "UNAUTHORIZED", code: "TURNSTILE_REQUIRED" }, 200);

    const ok = await verifyTurnstile(TURNSTILE_SECRET_KEY_RAW, token, ip);
    if (!ok) return json({ ok: false, msg: "UNAUTHORIZED", code: "TURNSTILE_FAILED" }, 200);
  }

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
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash",
      )
      .eq("claim_token_hash", claimHash)
      .eq("out_token_hash", outHash)
      .maybeSingle();
    if (!q.error && q.data) sess = q.data;
    if (debugLookup) debugLookup.looked_up_by = "claim+out";
  }

  if (!sess && requestedSessionId) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash",
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
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash",
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
        "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at,out_token_hash",
      )
      .eq("out_token_hash", outHash)
      .maybeSingle();
    if (!q.error && q.data) sess = q.data;
    if (debugLookup) debugLookup.looked_up_by = debugLookup.looked_up_by ?? "out_token_hash";
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
      if (lic.data?.key) return { key: lic.data.key as string, expires_at: (lic.data.expires_at ?? null) as string };
    }

    const issue = await sb
      .from("licenses_free_issues")
      .select("license_id,expires_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const licenseId = issue.data?.license_id;
    if (!licenseId) return null;

    const lic = await sb.from("licenses").select("key,expires_at").eq("id", licenseId).maybeSingle();
    if (!lic.data?.key) return null;

    return { key: lic.data.key as string, expires_at: (lic.data.expires_at ?? issue.data?.expires_at) as string };
  }

  // Already revealed (or in-progress) => return same key if present; otherwise auto-repair inconsistent state.
  if (Number(sess.reveal_count ?? 0) > 0 || sess.status === "revealed" || sess.status === "revealing") {
    const existing = await findExistingIssuedKey();
    const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);
    if (existing) {
      return json({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label, warnings: warnings.length ? warnings : undefined }, 200);
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
    return json({ ok: false, msg: "CLAIM_INVALID", code: "CLAIM_INVALID", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  if (!claimExpMs || claimExpMs < now) {
    await sb.from("licenses_free_sessions").update({ last_error: "CLAIM_EXPIRED" }).eq("session_id", sessionId);
    return json({ ok: false, msg: "CLAIM_EXPIRED", code: "CLAIM_EXPIRED", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  if (sess.status !== "gate_ok") {
    await sb.from("licenses_free_sessions").update({ last_error: "GATE_STATUS_INVALID" }).eq("session_id", sessionId);
    return json({ ok: false, msg: "GATE_STATUS_INVALID", code: "GATE_STATUS_INVALID", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
  }

  // If session has out_token_hash, require a matching out_token.
  if (sess.out_token_hash) {
    if (!outHash) return json({ ok: false, msg: "OUT_TOKEN_REQUIRED", code: "OUT_TOKEN_REQUIRED", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
    if (sess.out_token_hash !== outHash) {
      return json({ ok: false, msg: "OUT_TOKEN_MISMATCH", code: "OUT_TOKEN_MISMATCH", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
    }
  }

  // Daily limit per fingerprint (admin-config)
  const dailyLimit = Math.max(1, Number(settings?.free_daily_limit_per_fingerprint ?? 1));
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const quota = await sb
    .from("licenses_free_issues")
    .select("issue_id", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("fingerprint_hash", fpHash);

  const used = quota.count ?? 0;
  if (used >= dailyLimit) {
    await sb.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA" }).eq("session_id", sessionId);
    return json({ ok: false, msg: "RATE_LIMIT", code: "RATE_LIMIT", debug: debugLookup ? { lookup: debugLookup } : undefined }, 200);
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
    if (existing) return json({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label, warnings: warnings.length ? warnings : undefined }, 200);

    // If someone else locked it, signal in-progress; otherwise report lock failure clearly.
    if (sess.status === "revealing") {
      return json({ ok: false, msg: "REVEAL_IN_PROGRESS", code: "REVEAL_IN_PROGRESS", warnings: warnings.length ? warnings : undefined }, 200);
    }
    return json({ ok: false, msg: "SESSION_LOCK_FAILED", code: "SESSION_LOCK_FAILED", warnings: warnings.length ? warnings : undefined }, 200);
  }

  const dur = Math.max(60, Number(sess.duration_seconds ?? 0));
  const expires_at = new Date(Date.now() + dur * 1000).toISOString();
  const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);

  // Mint license
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
        note: sess.key_type_code ? `FREE_${String(sess.key_type_code).toUpperCase()}` : "FREE",
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
      warnings: warnings.length ? warnings : undefined,
      debug: debugOut,
    },
    200,
  );
});
