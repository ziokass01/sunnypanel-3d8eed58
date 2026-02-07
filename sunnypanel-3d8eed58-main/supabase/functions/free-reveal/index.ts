import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { resolveCorsOrigin } from "../_shared/cors.ts";

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
  fingerprint: z.string().min(6).max(128),
  turnstile_token: z.string().min(10).max(4096).nullable().optional(),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, PUBLIC_BASE_URL);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, msg: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, msg: "INVALID_INPUT" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ ok: false, msg: "INVALID_INPUT" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, msg: "SERVER_MISCONFIG" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
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

  if (sErr) {
    return new Response(JSON.stringify({ ok: false, msg: sErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  if (!Boolean(settings?.free_enabled ?? true)) {
    return new Response(JSON.stringify({ ok: false, msg: "CLOSED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  const freeReturnSeconds = Math.max(10, Number(settings?.free_return_seconds ?? 60));

  // Optional Turnstile (enabled only if BOTH env keys exist)
  const TURNSTILE_SITE_KEY = Deno.env.get("TURNSTILE_SITE_KEY") ?? "";
  const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
  const turnstile_enabled = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
  if (turnstile_enabled) {
    const token = (parsed.data.turnstile_token ?? "")?.trim();
    if (!token) {
      return new Response(JSON.stringify({ ok: false, msg: "UNAUTHORIZED" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
      });
    }
    const ok = await verifyTurnstile(TURNSTILE_SECRET_KEY, token, ip);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, msg: "UNAUTHORIZED" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
      });
    }
  }

  const claimHash = await sha256Hex(parsed.data.claim_token);
  const outHash = await sha256Hex(parsed.data.out_token);
  const fpHash = await sha256Hex(parsed.data.fingerprint);
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
    return new Response(JSON.stringify({ ok: false, msg: "BLOCKED" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  // Load session by out_token_hash FIRST (so we can handle already-revealed idempotently).
  const { data: sess, error: qErr } = await sb
    .from("licenses_free_sessions")
    .select(
      "session_id,status,reveal_count,expires_at,claim_token_hash,claim_expires_at,fingerprint_hash,ua_hash,ip_hash,key_type_code,duration_seconds,revealed_license_id,revealed_at,close_deadline_at,copied_at",
    )
    .eq("out_token_hash", outHash)
    .maybeSingle();

  if (qErr || !sess) {
    return new Response(JSON.stringify({ ok: false, msg: "UNAUTHORIZED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  // TS: capture stable, non-null values for nested helpers
  const sessionId = sess.session_id;

  const now = Date.now();
  const expMs = Date.parse(sess.expires_at);
  if (!isFinite(expMs) || expMs < now) {
    return new Response(JSON.stringify({ ok: false, msg: "SESSION_EXPIRED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  
  // If user already copied OR session was closed/expired by client timeout, do not reveal again.
  if (sess.status === "closed" || Boolean(sess.copied_at)) {
    return new Response(JSON.stringify({ ok: false, msg: "SESSION_CLOSED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }
  const closeDeadlineMs = sess.close_deadline_at ? Date.parse(sess.close_deadline_at) : 0;
  if (closeDeadlineMs && isFinite(closeDeadlineMs) && closeDeadlineMs < now) {
    // Hard-close server-side after deadline to prevent "treo tab" abuse
    await sb
      .from("licenses_free_sessions")
      .update({
        status: "closed",
        out_expires_at: new Date().toISOString(),
        claim_token_hash: null,
        claim_expires_at: null,
      })
      .eq("session_id", sessionId);
    return new Response(JSON.stringify({ ok: false, msg: "SESSION_CLOSED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

// Device binding
  if (sess.fingerprint_hash !== fpHash || sess.ua_hash !== uaHash || (sess as any).ip_hash !== ipHash) {
    return new Response(JSON.stringify({ ok: false, msg: "SESSION_BIND_MISMATCH" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  async function getKeyTypeLabel(code: string | null) {
    if (!code) return null;
    const kt = await sb.from("licenses_free_key_types").select("label").eq("code", code).maybeSingle();
    return kt.data?.label ?? null;
  }

  async function findExistingIssuedKey() {
    const directId = (sess.revealed_license_id as string | null) ?? null;
    if (directId) {
      const lic = await sb.from("licenses").select("key,expires_at").eq("id", directId).maybeSingle();
      if (lic.data?.key) {
        return { key: lic.data.key as string, expires_at: (lic.data.expires_at ?? null) as string };
      }
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

  // If already revealed, return the SAME key (idempotent; prevents infinite key minting by reload/spam).
  if (Number(sess.reveal_count ?? 0) > 0 || sess.status === "revealed" || sess.status === "revealing") {
    const existing = await findExistingIssuedKey();
    const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);
    if (existing) {
      return new Response(JSON.stringify({
        ok: true,
        key: existing.key,
        expires_at: existing.expires_at,
        key_type_label,
        key_type_code: sess.key_type_code ?? null,
        created_at: new Date().toISOString(),
        session_id: sessionId,
        ip_hash: ipHash,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
      });
    }
    return new Response(JSON.stringify({ ok: false, msg: "ALREADY_REVEALED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  // Require a valid claim token when NOT yet revealed.
  const claimExpMs = sess.claim_expires_at ? Date.parse(sess.claim_expires_at) : 0;
  if (
    sess.status !== "gate_ok" ||
    !sess.claim_token_hash ||
    sess.claim_token_hash !== claimHash ||
    !claimExpMs ||
    claimExpMs < now
  ) {
    await sb.from("licenses_free_sessions").update({ last_error: "CLAIM_INVALID" }).eq("session_id", sess.session_id);
    return new Response(JSON.stringify({ ok: false, msg: claimExpMs && claimExpMs < now ? "CLAIM_EXPIRED" : "UNAUTHORIZED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
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
    await sb.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA" }).eq("session_id", sess.session_id);
    return new Response(JSON.stringify({ ok: false, msg: "RATE_LIMIT" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  // Acquire lock BEFORE inserting license (prevents multi-mint bug).
  const lockIso = new Date().toISOString();
  const lock = await sb
    .from("licenses_free_sessions")
    .update({
      status: "revealing",
      reveal_count: 1,
      revealed_at: lockIso,
      last_error: null,
      // burn claim token to prevent reuse
      claim_token_hash: null,
      claim_expires_at: null,
    })
    .eq("session_id", sessionId)
    .eq("status", "gate_ok")
    .eq("reveal_count", 0)
    .eq("claim_token_hash", claimHash)
    .select("session_id")
    .maybeSingle();

  if (!lock.data) {
    // Someone else already revealed/locked; return existing key (idempotent).
    const existing = await findExistingIssuedKey();
    const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);
    if (existing) {
      return new Response(JSON.stringify({ ok: true, key: existing.key, expires_at: existing.expires_at, key_type_label }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
      });
    }
    return new Response(JSON.stringify({ ok: false, msg: "UNAUTHORIZED" }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  // Compute expiration based on selected key type (seconds)
  const dur = Math.max(60, Number(sess.duration_seconds ?? 0));
  const expires_at = new Date(Date.now() + dur * 1000).toISOString();
  const key_type_label = await getKeyTypeLabel(sess.key_type_code ?? null);

  // Mint a license row compatible with verify-key (lookup = public.licenses)
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
        // Keep schema minimal: public.licenses only has (key, expires_at, max_devices, is_active, note)
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
    // Roll back lock so user can retry (but do not allow double-mint)
    await sb
      .from("licenses_free_sessions")
      .update({ status: "gate_ok", reveal_count: 0, revealed_at: null, last_error: "INSERT_FAILED" })
      .eq("session_id", sessionId);

    return new Response(JSON.stringify({ ok: false, msg: "SERVER_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
    });
  }

  // Mark session revealed
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

  // Log issue (mask only)
  await sb.from("licenses_free_issues").insert({
    license_id: inserted.id,
    key_mask: maskKey(inserted.key),
    expires_at,
    session_id: sessionId,
    ip_hash: ipHash,
    fingerprint_hash: fpHash,
    ua_hash: uaHash,
  });

  return new Response(JSON.stringify({
    ok: true,
    key: inserted.key,
    expires_at,
    key_type_label,
    key_type_code: sess.key_type_code ?? null,
    created_at: new Date().toISOString(),
    session_id: sessionId,
    ip_hash: ipHash,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin, "Vary": "Origin" },
  });
});
