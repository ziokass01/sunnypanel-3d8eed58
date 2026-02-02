import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

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

function randomChunk(len: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
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

function parseCookies(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.split("=");
    const key = (k ?? "").trim();
    if (!key) return;
    out[key] = decodeURIComponent(rest.join("=").trim());
  });
  return out;
}

function normalizeBool(v: string | undefined | null) {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function inferBaseUrl(req: Request) {
  const env = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function json(req: Request, data: unknown, status = 200) {
  // CORS for browser POST with cookies
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  headers["Access-Control-Allow-Origin"] = origin && origin.endsWith(".lovable.app") ? origin : origin || "null";
  return new Response(JSON.stringify(data), { status, headers });
}

const inputSchema = z.object({
  claim_token: z.string().min(8).max(512),
  turnstile_token: z.string().min(10).max(4096).nullable().optional(),
});

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(req, { ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const cookies = parseCookies(req);
  const sessId = cookies.fk_sess ?? "";
  const fp = cookies.fk_fp ?? "";
  if (!sessId || !fp) return json(req, { ok: false, msg: "UNAUTHORIZED" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, msg: "INVALID_INPUT" }, 400);
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return json(req, { ok: false, msg: "INVALID_INPUT" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Blocked IP check
  const blk = await db.from("blocked_ips").select("blocked_until").eq("ip", ip).maybeSingle();
  const untilIso = blk.data?.blocked_until ?? null;
  const untilMs = untilIso ? new Date(untilIso).getTime() : 0;
  if (untilMs && untilMs > Date.now()) {
    return json(req, { ok: false, msg: "RATE_LIMIT" }, 429);
  }

  const ipHash = await sha256Hex(ip);
  const uaHash = await sha256Hex(ua);
  const fpHash = await sha256Hex(fp);

  // Rate limit reveal
  const rl = await db.rpc("check_free_ip_rate_limit" as any, {
    p_ip_hash: ipHash,
    p_route: "reveal",
    p_limit: 5,
    p_window_seconds: 600,
  } as any);
  const allowed = rl.error ? true : Boolean(rl.data?.[0]?.allowed);
  if (!allowed) {
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.from("blocked_ips").upsert(
      { ip, blocked_until: until, reason: "FREE_SPAM", meta: { route: "reveal" }, updated_at: new Date().toISOString() },
      { onConflict: "ip" },
    );
    return json(req, { ok: false, msg: "RATE_LIMIT" }, 429);
  }

  // Optional Turnstile
  const turnEnabled = normalizeBool(Deno.env.get("FREE_TURNSTILE_ENABLED"));
  if (turnEnabled) {
    const secret = (Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim();
    const token = (parsed.data.turnstile_token ?? "")?.trim();
    if (!secret || !token) return json(req, { ok: false, msg: "UNAUTHORIZED" }, 200);
    const ok = await verifyTurnstile(secret, token, ip);
    if (!ok) {
      await db
        .from("licenses_free_sessions")
        .update({ last_error: "TURNSTILE_FAILED" })
        .eq("session_id", sessId);
      return json(req, { ok: false, msg: "UNAUTHORIZED" }, 200);
    }
  }

  const claimHash = await sha256Hex(parsed.data.claim_token);
  const session = await db
    .from("licenses_free_sessions")
    .select("session_id,status,reveal_count,claim_token_hash,claim_expires_at,fingerprint_hash,ip_hash,ua_hash")
    .eq("session_id", sessId)
    .maybeSingle();

  if (session.error || !session.data) return json(req, { ok: false, msg: "UNAUTHORIZED" }, 401);
  const s: any = session.data;

  const now = Date.now();
  const claimExpMs = s.claim_expires_at ? new Date(s.claim_expires_at).getTime() : 0;
  if (
    s.status !== "gate_returned" ||
    Number(s.reveal_count ?? 0) > 0 ||
    !s.claim_token_hash ||
    s.claim_token_hash !== claimHash ||
    !claimExpMs ||
    claimExpMs < now ||
    s.fingerprint_hash !== fpHash ||
    s.ip_hash !== ipHash ||
    s.ua_hash !== uaHash
  ) {
    await db.from("licenses_free_sessions").update({ last_error: "CLAIM_INVALID" }).eq("session_id", sessId);
    return json(req, { ok: false, msg: "UNAUTHORIZED" }, 200);
  }

  // Daily quota (fingerprint + ip + ua)
  const ttlHours = Number(Deno.env.get("FREE_KEY_TTL_HOURS") ?? "24") || 24;
  const dailyLimit = Number(Deno.env.get("FREE_DAILY_LIMIT_PER_FINGERPRINT") ?? "1") || 1;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const quota = await db
    .from("licenses_free_issues")
    .select("issue_id", { count: "exact", head: true })
    .gte("created_at", since)
    .or(`fingerprint_hash.eq.${fpHash},ip_hash.eq.${ipHash},ua_hash.eq.${uaHash}`);
  const used = quota.count ?? 0;
  if (used >= dailyLimit) {
    await db.from("licenses_free_sessions").update({ last_error: "DAILY_QUOTA" }).eq("session_id", sessId);
    return json(req, { ok: false, msg: "RATE_LIMIT" }, 429);
  }

  // Mint a license row compatible with verify-key (lookup = public.licenses)
  const exp = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  let inserted: { id: string; key: string } | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = makeKey();
    const ins = await db
      .from("licenses")
      .insert({
        key,
        is_active: true,
        max_devices: 1,
        expires_at: exp,
        start_on_first_use: false,
        starts_on_first_use: false,
        duration_days: null,
        duration_seconds: null,
        activated_at: null,
        first_used_at: null,
        note: "FREE_1DAY",
      })
      .select("id,key")
      .single();
    if (!ins.error && ins.data?.id) {
      inserted = { id: ins.data.id, key: ins.data.key };
      break;
    }
  }

  if (!inserted) {
    await db.from("licenses_free_sessions").update({ last_error: "INSERT_FAILED" }).eq("session_id", sessId);
    return json(req, { ok: false, msg: "SERVER_ERROR" }, 500);
  }

  await db
    .from("licenses_free_sessions")
    .update({ status: "revealed", reveal_count: 1, last_error: null })
    .eq("session_id", sessId);

  await db.from("licenses_free_issues").insert({
    license_id: inserted.id,
    key_mask: maskKey(inserted.key),
    expires_at: exp,
    session_id: sessId,
    ip_hash: ipHash,
    fingerprint_hash: fpHash,
    ua_hash: uaHash,
  });

  const base = inferBaseUrl(req);
  // noindex/csp are handled client-side; response is no-store.
  return json(req, { ok: true, key: inserted.key, expires_at: exp, return_to: `${base}/free` });
});
