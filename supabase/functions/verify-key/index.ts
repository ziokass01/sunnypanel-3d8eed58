import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const inputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^SUNNY-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/i, "INVALID_KEY_FORMAT"),
  device: z.string().trim().min(1).max(128),
  // Optional friendly label for display in admin panel only.
  // IMPORTANT: device limit/enforcement MUST rely on `device` (stable id) only.
  device_name: z.string().trim().min(1).max(128).optional(),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function windowStartISO(now: Date, minutes: number) {
  const ms = minutes * 60 * 1000;
  const w = Math.floor(now.getTime() / ms) * ms;
  return new Date(w).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const ip = getClientIp(req);
  const now = new Date();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, msg: "INVALID_JSON" }, 400);
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, msg: "INVALID_INPUT" }, 400);
  }

  const key = parsed.data.key.toUpperCase();
  const device = parsed.data.device;
  const deviceName = parsed.data.device_name;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1) Rate limit (key + ip) - light
  const RATE_WINDOW_MIN = 5;
  const RATE_LIMIT = 30;
  const RATE_WINDOW_SECONDS = RATE_WINDOW_MIN * 60;
  const rl = await db.rpc("check_rate_limit", {
    p_key: key,
    p_ip: ip,
    p_limit: RATE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS,
  });

  // If rate-limit bookkeeping fails, don't lock out legitimate users.
  const allowed = rl.error ? true : Boolean(rl.data?.[0]?.allowed);
  if (!allowed) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "RATE_LIMIT", current_count: rl.data?.[0]?.current_count ?? null },
    });
    return json({ ok: false, msg: "RATE_LIMIT" }, 429);
  }

  // 2) Fetch license
  const lic = await db
    .from("licenses")
    .select("id,key,is_active,expires_at,max_devices,deleted_at")
    .eq("key", key)
    .maybeSingle();

  if (lic.error || !lic.data) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_NOT_FOUND" },
    });
    return json({ ok: false, msg: "KEY_NOT_FOUND" });
  }

  if (lic.data.deleted_at) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_DELETED" },
    });
    return json({ ok: false, msg: "KEY_DELETED" });
  }

  if (!lic.data.is_active) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_BLOCKED" },
    });
    return json({ ok: false, msg: "KEY_BLOCKED" });
  }

  if (lic.data.expires_at) {
    const exp = new Date(lic.data.expires_at);
    if (exp.getTime() < now.getTime()) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "KEY_EXPIRED" },
      });
      return json({ ok: false, msg: "KEY_EXPIRED" });
    }
  }

  // 3) Device limit logic
  const existing = await db
    .from("license_devices")
    .select("id")
    .eq("license_id", lic.data.id)
    .eq("device_id", device)
    .maybeSingle();

  if (existing.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR" },
    });
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  if (!existing.data) {
    const count = await db
      .from("license_devices")
      .select("id", { count: "exact", head: true })
      .eq("license_id", lic.data.id);

    const used = count.count ?? 0;
    if (used >= (lic.data.max_devices ?? 1)) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "DEVICE_LIMIT" },
      });
      return json({ ok: false, msg: "DEVICE_LIMIT" });
    }
  }

  // 4) Upsert device + update last_seen (+ device_name for display only)
  // If device already exists, this MUST NOT count as a new device.
  const upsertPayload: Record<string, unknown> = {
    license_id: lic.data.id,
    device_id: device,
    last_seen: now.toISOString(),
  };
  if (typeof deviceName === "string" && deviceName.trim().length > 0) {
    upsertPayload.device_name = deviceName.trim();
  }

  const up = await db
    .from("license_devices")
    .upsert(
      upsertPayload,
      { onConflict: "license_id,device_id" },
    )
    .select("id")
    .maybeSingle();

  if (up.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR" },
    });
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  // 5) Audit log
  await db.from("audit_logs").insert({
    action: "VERIFY",
    license_key: key,
    detail: {
      ip,
      device,
      device_name: deviceName ?? null,
      ok: true,
      license_id: lic.data.id,
      device_row: up.data?.id ?? null,
    },
  });

  return json({
    ok: true,
    msg: "OK",
    expires_at: lic.data.expires_at,
    max_devices: lic.data.max_devices,
  });
});
