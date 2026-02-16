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

function isActiveBlockUntil(blockedUntil?: string | null) {
  if (!blockedUntil) return true;
  const t = Date.parse(blockedUntil);
  return Number.isFinite(t) && t > Date.now();
}

const BodySchema = z.object({
  // Either provide session_id, or provide out_token (to resolve session)
  session_id: z.string().uuid().optional(),
  out_token: z.string().min(8).max(512).optional(),
  fingerprint: z.string().min(6).max(128),
  referrer: z.string().optional().default(""),
  current_url: z.string().optional().default(""),
});

type JsonErr = { ok: false; code?: string; msg: string; detail?: unknown };

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

  const { session_id: bodySid, out_token, fingerprint, referrer, current_url } = parsed.data;

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_enabled,free_disabled_message,free_min_delay_enabled,free_min_delay_seconds,free_require_link4m_referrer")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return json({ ok: false, code: "SERVER_ERROR", msg: sErr.message } satisfies JsonErr, 500);
  }

  if (!Boolean(settings?.free_enabled ?? true)) {
    return json({ ok: false, code: "CLOSED", msg: "CLOSED" } satisfies JsonErr, 403);
  }

  // Compute hashes (out_token is optional)
  const outHash = out_token ? await sha256Hex(out_token) : null;
  const fpHash = await sha256Hex(fingerprint);
  const uaHash = await sha256Hex(req.headers.get("user-agent") ?? "");
  const ipHash = await sha256Hex(getClientIp(req));

  // Blocklist checks can run before session lookup
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

  // Find session (prefer session_id; fallback to out_token)
  let sess: any = null;
  let qErr: any = null;

  if (bodySid) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,created_at,expires_at,started_at,fingerprint_hash,ua_hash,ip_hash,reveal_count,claim_token_hash,claim_expires_at,out_token_hash",
      )
      .eq("session_id", bodySid)
      .maybeSingle();
    sess = q.data;
    qErr = q.error;
  } else if (outHash) {
    const q = await sb
      .from("licenses_free_sessions")
      .select(
        "session_id,status,created_at,expires_at,started_at,fingerprint_hash,ua_hash,ip_hash,reveal_count,claim_token_hash,claim_expires_at,out_token_hash",
      )
      .eq("out_token_hash", outHash)
      .maybeSingle();
    sess = q.data;
    qErr = q.error;
  } else {
    return json({ ok: false, code: "BAD_REQUEST", msg: "MISSING_SESSION" } satisfies JsonErr, 400);
  }

  if (qErr) {
    return json({ ok: false, code: "SERVER_ERROR", msg: qErr.message } satisfies JsonErr, 500);
  }

  if (!sess) {
    return json({ ok: false, code: "INVALID_SESSION", msg: "INVALID_SESSION" } satisfies JsonErr, 400);
  }

  // If both provided: enforce that out_token matches session
  if (outHash && sess.out_token_hash && outHash !== sess.out_token_hash) {
    return json({ ok: false, code: "INVALID_SESSION", msg: "OUT_TOKEN_MISMATCH" } satisfies JsonErr, 403);
  }

  const tokenVerified = Boolean(outHash && sess.out_token_hash && outHash === sess.out_token_hash);

  // Expired?
  const now = Date.now();
  const expiresAt = Date.parse(sess.expires_at);
  if (!isFinite(expiresAt) || expiresAt <= now) {
    return json({ ok: false, code: "SESSION_EXPIRED", msg: "SESSION_EXPIRED" } satisfies JsonErr, 400);
  }

  if (sess.fingerprint_hash !== fpHash || sess.ua_hash !== uaHash || (sess as any).ip_hash !== ipHash) {
    return json({ ok: false, code: "DEVICE_MISMATCH", msg: "DEVICE_MISMATCH" } satisfies JsonErr, 403);
  }

  // Referrer policy (after token verification)
  const requireRef = Boolean(settings?.free_require_link4m_referrer ?? false);
  if (requireRef) {
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

    // If referrer is blocked/empty but gate URL has a valid token for this session => allow.
    if (!hostOk && !tokenVerified) {
      if (!r) {
        return json(
          {
            ok: false,
            code: "REFERRER_REQUIRED",
            msg: "REFERRER_REQUIRED",
            detail: {
              hint:
                "Referrer bị trống. Bạn cần đi qua Link4M hoặc referrer bị chặn bởi trình duyệt/shortlink. Nếu bạn đi đúng Link4M, hãy thử mở lại bằng cùng 1 trình duyệt.",
              current_url,
            },
          } satisfies JsonErr,
          400,
        );
      }
      return json({ ok: false, code: "BAD_REFERRER", msg: "BAD_REFERRER", detail: { referrer: r } } satisfies JsonErr, 400);
    }
  }

  if (sess.reveal_count && sess.reveal_count > 0) {
    return json({ ok: false, code: "ALREADY_REVEALED", msg: "ALREADY_REVEALED" } satisfies JsonErr, 200);
  }

  const minDelayRaw = Number((settings as any)?.free_min_delay_enabled === false ? 0 : (settings as any)?.free_min_delay_seconds ?? 0);
  const minDelay = Math.max(0, minDelayRaw);
  const startedAtIso = sess.started_at ?? (sess as any).created_at ?? new Date(now).toISOString();
  const startedAtMs = Date.parse(startedAtIso);
  const mustWaitUntil = startedAtMs + minDelay * 1000;
  if (minDelay > 0 && isFinite(startedAtMs) && now < mustWaitUntil) {
    // Too fast => do NOT allow retry-by-reload.
    const nowIso = new Date().toISOString();

    try {
      const upd = await sb
        .from("licenses_free_sessions")
        .update({
          status: "gate_fail",
          last_error: "TOO_FAST",
          expires_at: nowIso,
          out_expires_at: nowIso,
          claim_token_hash: null,
          claim_expires_at: null,
        })
        .eq("session_id", sess.session_id);

      if (upd.error) {
        await sb
          .from("licenses_free_sessions")
          .update({
            status: "gate_fail",
            last_error: "TOO_FAST",
            expires_at: nowIso,
            claim_token_hash: null,
            claim_expires_at: null,
          })
          .eq("session_id", sess.session_id);
      }
    } catch {
      // ignore
    }

    return json({ ok: false, code: "TOO_FAST", msg: "TOO_FAST" } satisfies JsonErr, 200);
  }

  // Generate claim token
  const claim_token = base64url(20);
  const claim_token_hash = await sha256Hex(claim_token);
  const claim_expires_at = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 minutes

  const { error: updErr } = await sb
    .from("licenses_free_sessions")
    .update({
      status: "gate_ok",
      gate_ok_at: new Date().toISOString(),
      claim_token_hash,
      claim_expires_at,
      last_error: null,
    })
    .eq("session_id", sess.session_id);

  if (updErr) {
    return json({ ok: false, code: "SERVER_ERROR", msg: updErr.message } satisfies JsonErr, 500);
  }

  const baseUrl = PUBLIC_BASE_URL || "";
  const claim_url = baseUrl ? `${baseUrl}/free/claim?claim=${encodeURIComponent(claim_token)}` : "";

  return json({ ok: true, claim_token, claim_url }, 200);
});
