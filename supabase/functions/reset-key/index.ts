import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveClientIp } from "../_shared/client-ip.ts";

const BodySchema = z.object({
  action: z.enum(["check", "reset"]),
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, "INVALID_KEY_FORMAT"),
  cf_turnstile_response: z.string().min(10).max(4096).nullable().optional(),
  turnstile_token: z.string().min(10).max(4096).nullable().optional(),
});

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, msg: "INVALID_JSON" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    await sleep(500);
    return json({ ok: false, msg: "KEY_UNAVAILABLE" }, 200);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, msg: "SERVER_MISCONFIG" }, 500);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const ip = resolveClientIp(req) ?? "0.0.0.0";
  const key = parsed.data.key.trim().toUpperCase();

  const settingsRes = await db.from("license_reset_settings").select("*").eq("id", 1).maybeSingle();
  if (settingsRes.error) {
    return json({ ok: false, msg: settingsRes.error.message }, 500);
  }

  const settings = settingsRes.data ?? {
    enabled: false,
    require_turnstile: false,
    public_check_limit: 8,
    public_check_window_seconds: 300,
    public_reset_limit: 4,
    public_reset_window_seconds: 600,
    disabled_message: "Reset Key đang tạm đóng.",
  };

  const action = parsed.data.action;
  const keyBucket = await sha256Hex(key);

  const limit = action === "check"
    ? Number(settings.public_check_limit ?? 8)
    : Number(settings.public_reset_limit ?? 4);

  const windowSeconds = action === "check"
    ? Number(settings.public_check_window_seconds ?? 300)
    : Number(settings.public_reset_window_seconds ?? 600);

  const rl = await db.rpc("check_public_action_rate_limit", {
    p_action: action.toUpperCase(),
    p_ip: ip,
    p_key_bucket: keyBucket,
    p_limit: Math.max(1, limit),
    p_window_seconds: Math.max(30, windowSeconds),
  });

  const rlRow = Array.isArray(rl.data) ? rl.data[0] : null;
  const allowed = rl.error ? true : Boolean(rlRow?.allowed);

  if (!allowed) {
    await sleep(700);
    return json({ ok: false, msg: "RATE_LIMIT" }, 429);
  }

  const TURNSTILE_SITE_KEY = (Deno.env.get("TURNSTILE_SITE_KEY") ?? "").trim();
  const TURNSTILE_SECRET_KEY = (Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim();
  const turnstileConfigured = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);

  if (Boolean(settings.require_turnstile) && turnstileConfigured) {
    const token =
      String(parsed.data.cf_turnstile_response ?? "").trim() ||
      String(parsed.data.turnstile_token ?? "").trim();

    if (!token) {
      await sleep(600);
      return json({ ok: false, msg: "TURNSTILE_REQUIRED" }, 200);
    }

    const ok = await verifyTurnstile(TURNSTILE_SECRET_KEY, token, ip);
    if (!ok) {
      await sleep(600);
      return json({ ok: false, msg: "TURNSTILE_FAILED" }, 200);
    }
  }

  if (action === "check") {
    const infoRes = await db.rpc("get_public_key_info", { p_key: key });
    const info = Array.isArray(infoRes.data) ? infoRes.data[0] : infoRes.data;

    if (infoRes.error) {
      return json({ ok: false, msg: "SERVER_ERROR" }, 500);
    }

    if (!info) {
      await sleep(650);
      return json({ ok: false, msg: "KEY_UNAVAILABLE" }, 200);
    }

    await sleep(450);
    return json({
      ok: true,
      msg: "OK",
      reset_enabled: Boolean(settings.enabled),
      disabled_message: settings.disabled_message ?? null,
      ...info,
    });
  }

  const resetRes = await db.rpc("public_reset_key", { p_key: key });
  if (resetRes.error) {
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  const payload = resetRes.data as Record<string, unknown> | null;
  const msg = String(payload?.msg ?? "");
  if (["KEY_NOT_FOUND", "KEY_BLOCKED", "KEY_EXPIRED"].includes(msg)) {
    await sleep(650);
    return json({
      ok: false,
      msg: "KEY_UNAVAILABLE",
      reset_enabled: Boolean(settings.enabled),
      disabled_message: settings.disabled_message ?? null,
    }, 200);
  }

  await sleep(450);
  return json({
    reset_enabled: Boolean(settings.enabled),
    disabled_message: settings.disabled_message ?? null,
    ...(payload ?? { ok: false, msg: "SERVER_ERROR" }),
  });
});
