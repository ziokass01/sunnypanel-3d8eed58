import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

function isAllowedOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.host;
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

const BodySchema = z.object({
  out_token: z.string().min(8).max(256),
  fingerprint: z.string().min(6).max(128),
  referrer: z.string().optional().default(""),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = origin || "*";

  if (req.method === "OPTIONS") {
    return new Response(null, {
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, msg: "MISSING_SUPABASE_SECRETS" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
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
    return new Response(JSON.stringify({ ok: false, msg: "BAD_REQUEST" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  const { out_token, fingerprint, referrer } = parsed.data;

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_enabled,free_disabled_message,free_min_delay_seconds,free_min_delay_enabled,free_require_link4m_referrer")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return new Response(JSON.stringify({ ok: false, msg: sErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  if (!Boolean(settings?.free_enabled ?? true)) {
    return new Response(JSON.stringify({ ok: false, msg: "CLOSED" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  const requireRef = Boolean(settings?.free_require_link4m_referrer ?? false);
  if (requireRef) {
    try {
      const u = new URL(referrer);
      const host = (u.hostname || "").toLowerCase();
      // Link4M domains can vary (e.g. link4m.com / link4m.xyz / link4m.app...).
      // Referrer is not 100% reliable across browsers, so keep this check lenient.
      if (!host.includes("link4m")) {
        return new Response(JSON.stringify({ ok: false, msg: "BAD_REFERRER" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
        });
      }
    } catch {
      return new Response(JSON.stringify({ ok: false, msg: "BAD_REFERRER" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
      });
    }
  }

  const outHash = await sha256Hex(out_token);
  const fpHash = await sha256Hex(fingerprint);
  const uaHash = await sha256Hex(req.headers.get("user-agent") ?? "");

  // Find session
  const { data: sess, error: qErr } = await sb
    .from("licenses_free_sessions")
    .select(
      "session_id,status,created_at,expires_at,started_at,fingerprint_hash,ua_hash,reveal_count,claim_token_hash,claim_expires_at",
    )
    .eq("out_token_hash", outHash)
    .maybeSingle();

  if (qErr) {
    return new Response(JSON.stringify({ ok: false, msg: qErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  if (!sess) {
    return new Response(JSON.stringify({ ok: false, msg: "INVALID_SESSION" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  // Expired?
  const now = Date.now();
  const expiresAt = Date.parse(sess.expires_at);
  if (!isFinite(expiresAt) || expiresAt <= now) {
    return new Response(JSON.stringify({ ok: false, msg: "SESSION_EXPIRED" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  if (sess.fingerprint_hash !== fpHash || sess.ua_hash !== uaHash) {
    return new Response(JSON.stringify({ ok: false, msg: "DEVICE_MISMATCH" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  if (sess.reveal_count && sess.reveal_count > 0) {
    return new Response(JSON.stringify({ ok: false, msg: "ALREADY_REVEALED" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  const delayEnabled = Boolean((settings as any)?.free_min_delay_enabled ?? true);
  if (delayEnabled) {
    const minDelay = Math.max(5, Number(settings?.free_min_delay_seconds ?? 25));
    const startedAtIso = sess.started_at ?? (sess as any).created_at ?? new Date(now).toISOString();
    const startedAtMs = Date.parse(startedAtIso);
    const mustWaitUntil = startedAtMs + minDelay * 1000;
    if (isFinite(startedAtMs) && now < mustWaitUntil) {
      const wait_seconds = Math.ceil((mustWaitUntil - now) / 1000);
      return new Response(JSON.stringify({ ok: false, msg: "TOO_FAST", wait_seconds }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": allowOrigin,
          "Vary": "Origin",
        },
      });
    }
  }

  // Idempotency: if claim token already issued and still valid, just re-issue (helps if user refreshes)
  const existingClaim = sess.claim_token_hash;
  const claimExp = sess.claim_expires_at ? Date.parse(sess.claim_expires_at) : 0;
  if (existingClaim && claimExp && claimExp > now) {
    // We cannot return the raw token (only hash stored), so generate a new token instead.
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
    return new Response(JSON.stringify({ ok: false, msg: updErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
    });
  }

  return new Response(JSON.stringify({ ok: true, claim_token }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin,
      "Vary": "Origin" },
  });
});
