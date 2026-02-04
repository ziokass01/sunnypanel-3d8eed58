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

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "";
}

function base64url(bytesLen = 24) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isMissingFreeKeyTypesTableError(msg: string) {
  return (
    msg.includes("Could not find the table 'public.licenses_free_key_types' in the schema cache") ||
    msg.includes('Could not find the table "public.licenses_free_key_types" in the schema cache') ||
    msg.includes('relation "public.licenses_free_key_types" does not exist')
  );
}

const BodySchema = z.object({
  key_type_code: z.string().min(2).max(8),
  fingerprint: z.string().min(6).max(128),
});

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = isAllowedOrigin(origin, PUBLIC_BASE_URL) ? origin : PUBLIC_BASE_URL;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, msg: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, msg: "MISSING_SUPABASE_SECRETS" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  const { key_type_code, fingerprint } = parsed.data;

  // Settings
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("free_outbound_url,free_enabled,free_disabled_message,free_min_delay_seconds")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return new Response(JSON.stringify({ ok: false, msg: sErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  const free_enabled = Boolean(settings?.free_enabled ?? true);
  if (!free_enabled) {
    return new Response(JSON.stringify({ ok: false, msg: "CLOSED" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  const outbound_url = settings?.free_outbound_url ?? "";
  if (!outbound_url) {
    return new Response(JSON.stringify({ ok: false, msg: "MISSING_OUTBOUND_URL" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  // Key type must be enabled
  const { data: kt, error: kErr } = await sb
    .from("licenses_free_key_types")
    .select("code,label,duration_seconds,enabled")
    .eq("code", key_type_code)
    .maybeSingle();

  if (kErr) {
    if (isMissingFreeKeyTypesTableError(String(kErr.message ?? ""))) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "MISSING_FREE_KEY_TYPES_TABLE",
          msg:
            "DB chưa chạy migration 20260203093000_free_key_types_and_settings.sql. Hãy chạy migration và reload schema cache: select pg_notify('pgrst','reload schema');",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
        },
      );
    }
    return new Response(JSON.stringify({ ok: false, msg: kErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }
  if (!kt || !kt.enabled) {
    return new Response(JSON.stringify({ ok: false, msg: "KEY_TYPE_DISABLED" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const ip = getClientIp(req);

  const fpHash = await sha256Hex(fingerprint);
  const uaHash = await sha256Hex(ua);
  const ipHash = await sha256Hex(ip);

  // Create a token-based session (expires quickly)
  const out_token = base64url(24);
  const out_token_hash = await sha256Hex(out_token);

  const now = new Date();
  const started_at = now.toISOString();
  const expires_at = new Date(now.getTime() + 30 * 60 * 1000).toISOString(); // 30 minutes
  const out_expires_at = expires_at;

  const duration_seconds = Number(kt.duration_seconds ?? 0);

  const { error: insErr } = await sb.from("licenses_free_sessions").insert({
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
  });

  if (insErr) {
    return new Response(JSON.stringify({ ok: false, msg: insErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowOrigin },
    });
  }

  const min_delay_seconds = Math.max(5, Number(settings?.free_min_delay_seconds ?? 25));

  return new Response(JSON.stringify({ ok: true, out_token, outbound_url, min_delay_seconds }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": allowOrigin },
  });
});
