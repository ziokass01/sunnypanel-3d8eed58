import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ts, x-nonce, x-sig",
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

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return toHex(sig);
}

function timingSafeEqualHex(a: string, b: string) {
  // Constant-time-ish compare for equal-length hex strings.
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) {
    out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }
  return out === 0;
}

function isValidTs(ts: string) {
  // Strictly digits; keep it simple as requested.
  return /^[0-9]{1,20}$/.test(ts);
}

function isValidNonce(nonce: string) {
  // Allow common nonce formats; limit length.
  return typeof nonce === "string" && nonce.length >= 1 && nonce.length <= 128;
}

function isValidSigHex(sig: string) {
  return /^[a-f0-9]{64}$/i.test(sig);
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

async function maybeInsertEnumerationAlert(
  db: any,
  ip: string,
  key?: string,
) {
  const metrics = await db.rpc(
    "security_metrics_for_ip" as any,
    { p_ip: ip } as any,
  );
  if (metrics.error) return;
  const row: any = metrics.data?.[0];
  if (!row) return;

  const failure5m = Number(row.failure_5m ?? 0);
  const distinct10m = Number(row.distinct_keys_10m ?? 0);

  if (failure5m <= 20 && distinct10m <= 30) return;

  await db.from("security_alerts").insert({
    kind: "ENUMERATION",
    ip,
    key_prefix: typeof key === "string" ? key.slice(0, 10) : null,
    meta: {
      failure_5m: failure5m,
      distinct_keys_10m: distinct10m,
      thresholds: { failure_5m: 20, distinct_keys_10m: 30 },
    },
  });

  // Auto-block IP temporarily when enumeration looks high.
  // Response contract remains unchanged; callers will see RATE_LIMIT.
  try {
    const now = new Date();
    const blockMinutes = 30;
    const newUntil = new Date(now.getTime() + blockMinutes * 60 * 1000).toISOString();

    const existing = await db
      .from("blocked_ips")
      .select("blocked_until")
      .eq("ip", ip)
      .maybeSingle();

    const prevUntil = existing.data?.blocked_until ? new Date(existing.data.blocked_until).getTime() : 0;
    const nextUntilMs = Math.max(prevUntil, new Date(newUntil).getTime());

    await db
      .from("blocked_ips")
      .upsert(
        {
          ip,
          blocked_until: new Date(nextUntilMs).toISOString(),
          reason: "ENUMERATION",
          meta: {
            failure_5m: failure5m,
            distinct_keys_10m: distinct10m,
            block_minutes: blockMinutes,
          },
          updated_at: now.toISOString(),
        },
        { onConflict: "ip" },
      );
  } catch {
    // Best-effort only.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  const ip = getClientIp(req);
  const now = new Date();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Optional admin-only bypass for testing/ops:
  // If an authenticated admin calls this endpoint with Authorization: Bearer <JWT>,
  // we skip the HMAC/nonce checks but keep all business logic (device limit, expiry, etc.).
  let adminBypass = false;
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice("bearer ".length).trim();
    if (token) {
      const userRes = await db.auth.getUser(token);
      const userId = userRes.data.user?.id ?? null;
      if (!userRes.error && userId) {
        const roleRes = await db.rpc("has_role" as any, { _user_id: userId, _role: "admin" } as any);
        adminBypass = !roleRes.error && Boolean(roleRes.data);
      }
    }
  }

  // --- Early blocklist check (auto-blocked IPs) ---
  // Keep contract unchanged: return RATE_LIMIT.
  if (!adminBypass) {
    const blk = await db
      .from("blocked_ips")
      .select("blocked_until")
      .eq("ip", ip)
      .maybeSingle();

    const untilIso = blk.data?.blocked_until ?? null;
    const untilMs = untilIso ? new Date(untilIso).getTime() : 0;
    if (untilMs && untilMs > now.getTime()) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: "",
        detail: { ip, ok: false, msg: "RATE_LIMIT", reason: "IP_BLOCKED" },
      });
      return json({ ok: false, msg: "RATE_LIMIT" }, 429);
    }
  }

  // --- HMAC-signed requests (anti-enumeration) ---
  // Require x-ts, x-nonce, x-sig.
  // Canonical: `${x-ts}.${x-nonce}.${sha256_hex(raw_body)}`
  // Sig: HMAC_SHA256_HEX(VERIFY_HMAC_SECRET, canonical)
  const rawBody = await req.text();

  if (!adminBypass) {
    const ts = req.headers.get("x-ts") ?? "";
    const nonce = req.headers.get("x-nonce") ?? "";
    const sig = req.headers.get("x-sig") ?? "";

    if (!isValidTs(ts) || !isValidNonce(nonce) || !isValidSigHex(sig)) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: "",
        detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "BAD_HEADERS" },
      });
      // Don't leak key status; keep HTTP 200 as requested.
      return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
    }

    const secret = (Deno.env.get("VERIFY_HMAC_SECRET") ?? "").trim();
    if (!secret) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: "",
        detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "MISCONFIGURED" },
      });
      // Misconfigured backend; still don't leak any key status.
      return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
    }

    const bodyHash = await sha256Hex(rawBody);
    const canonical = `${ts}.${nonce}.${bodyHash}`;
    const expected = await hmacSha256Hex(secret, canonical);
    if (!timingSafeEqualHex(expected, sig)) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: "",
        detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "BAD_SIG" },
      });
      return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
    }

    // --- Anti-replay ---
    // Enforce timestamp window: abs(now_unix_seconds - x-ts) <= 300
    const nowUnix = Math.floor(now.getTime() / 1000);
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(nowUnix - tsNum) > 300) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: "",
        detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "TS_WINDOW" },
      });
      return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
    }

    // Store nonce with TTL 10 minutes; reject replays on conflict.
    const nonceExpiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const nonceInsert = await db.from("request_nonces").insert({
      nonce,
      ts: Math.trunc(tsNum),
      expires_at: nonceExpiresAt,
    });
    if (nonceInsert.error) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: "",
        detail: { ip, ok: false, msg: "UNAUTHORIZED", reason: "NONCE_REPLAY" },
      });
      // Conflict (duplicate nonce) or any DB error: fail closed but generic.
      return json({ ok: false, msg: "UNAUTHORIZED" }, 200);
    }

    // Lightweight cleanup (best-effort)
    if (Math.random() < 0.02) {
      await db.from("request_nonces").delete().lt("expires_at", now.toISOString());
    }
  }

  let body: unknown;
  try {
    body = rawBody.length ? JSON.parse(rawBody) : {};
  } catch {
    return json({ ok: false, msg: "INVALID_JSON" }, 400);
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, msg: "INVALID_INPUT" }, 400);
  }

  // Normalize key before querying
  const key = parsed.data.key.trim().toUpperCase();
  const device = parsed.data.device;
  const deviceName = parsed.data.device_name;

  // 0) IP-only rate limit (in parallel with key+ip)
  // This helps even when attackers rotate keys.
  const IP_RATE_LIMIT = 180;
  const IP_RATE_WINDOW_SECONDS = 60;
  const ipRl = await db.rpc("check_ip_rate_limit", {
    p_ip: ip,
    p_limit: IP_RATE_LIMIT,
    p_window_seconds: IP_RATE_WINDOW_SECONDS,
  });
  const ipAllowed = ipRl.error ? true : Boolean(ipRl.data?.[0]?.allowed);
  if (!ipAllowed) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: {
        ip,
        device,
        ok: false,
        msg: "RATE_LIMIT",
        kind: "IP_ONLY",
        current_count: ipRl.data?.[0]?.current_count ?? null,
      },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "RATE_LIMIT" }, 429);
  }

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

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "RATE_LIMIT" }, 429);
  }

  // 2) Fetch license
  const lic = await db
    .from("licenses")
    .select(
      "id,key,is_active,expires_at,max_devices,deleted_at," +
        // Legacy fields
        "starts_on_first_use,duration_seconds,activated_at," +
        // New fields
        "start_on_first_use,duration_days,first_used_at",
    )
    .eq("key", key)
    .maybeSingle();

  if (lic.error || !lic.data) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_NOT_FOUND" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "KEY_NOT_FOUND" });
  }

  // Deno + supabase-js type inference can be noisy here; keep runtime behavior unchanged.
  const licRow: any = lic.data as any;

  if (licRow.deleted_at) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_DELETED" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    // Prevent attackers from distinguishing soft-deleted keys from non-existent keys.
    // Keep internal audit detail as KEY_DELETED for operators.
    return json({ ok: false, msg: "KEY_NOT_FOUND" });
  }

  if (!licRow.is_active) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "KEY_BLOCKED" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "KEY_BLOCKED" });
  }

  // Backward compatible: accept either legacy fields or the new fields.
  const startsOnFirstUse = Boolean(licRow.start_on_first_use ?? licRow.starts_on_first_use);
  const firstUsedAt: string | null = licRow.first_used_at ?? licRow.activated_at ?? null;
  const durationDays: number | null = licRow.duration_days ?? null;
  const durationSeconds: number | null = licRow.duration_seconds ?? null;

  // Duration helper (prefer seconds, fallback days)
  const effectiveDurationSeconds = (() => {
    const dSecs = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : null;
    const dDays = typeof durationDays === "number" && durationDays > 0 ? durationDays * 86400 : null;
    return dSecs ?? dDays;
  })();

  // Only enforce expiry once activated (or for standard keys)
  if (!(startsOnFirstUse && !firstUsedAt)) {
    if (licRow.expires_at) {
      const exp = new Date(licRow.expires_at);
      if (exp.getTime() < now.getTime()) {
        await db.from("audit_logs").insert({
          action: "VERIFY",
          license_key: key,
          detail: { ip, device, ok: false, msg: "KEY_EXPIRED" },
        });

        await maybeInsertEnumerationAlert(db, ip, key);
        return json({ ok: false, msg: "KEY_EXPIRED" });
      }
    }
  }

  // 3) Device limit logic
  const existing = await db
    .from("license_devices")
    .select("id")
    .eq("license_id", licRow.id)
    .eq("device_id", device)
    .maybeSingle();

  if (existing.error) {
    await db.from("audit_logs").insert({
      action: "VERIFY",
      license_key: key,
      detail: { ip, device, ok: false, msg: "SERVER_ERROR" },
    });

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  if (!existing.data) {
    // 3.1) Anti "device slot burning": throttle *new* device registrations per key.
    // If this triggers, we return RATE_LIMIT (contract unchanged).
    const NEW_DEVICE_LIMIT = 10;
    const NEW_DEVICE_WINDOW_SECONDS = 3600;
    const nd = await db.rpc("check_new_device_rate_limit", {
      p_key: key,
      p_limit: NEW_DEVICE_LIMIT,
      p_window_seconds: NEW_DEVICE_WINDOW_SECONDS,
    });
    const ndAllowed = nd.error ? true : Boolean(nd.data?.[0]?.allowed);
    if (!ndAllowed) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: {
          ip,
          device,
          ok: false,
          msg: "RATE_LIMIT",
          kind: "NEW_DEVICE",
          current_count: nd.data?.[0]?.current_count ?? null,
        },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg: "RATE_LIMIT" }, 429);
    }

    const count = await db
      .from("license_devices")
      .select("id", { count: "exact", head: true })
      .eq("license_id", licRow.id);

    const used = count.count ?? 0;
    if (used >= (licRow.max_devices ?? 1)) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "DEVICE_LIMIT" },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg: "DEVICE_LIMIT" });
    }
  }

  // 4) Upsert device + update last_seen (+ device_name for display only)
  // If device already exists, this MUST NOT count as a new device.
  const upsertPayload: Record<string, unknown> = {
    license_id: licRow.id,
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

    await maybeInsertEnumerationAlert(db, ip, key);
    return json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  // 4.5) First successful verify activates "start on first use" licenses
  // Activation happens after device checks pass so it doesn't start counting on failures.
  let effectiveExpiresAt: string | null = licRow.expires_at;
  let effectiveFirstUsedAt: string | null = firstUsedAt;
  let started = Boolean(effectiveFirstUsedAt);
  if (startsOnFirstUse) {
    // ✅ Rule A: start-on-first-use must have duration.
    // If countdown key is misconfigured (missing/<=0 duration), do not activate.
    if (!effectiveDurationSeconds || effectiveDurationSeconds <= 0) {
      await db.from("audit_logs").insert({
        action: "VERIFY",
        license_key: key,
        detail: { ip, device, ok: false, msg: "LICENSE_MISCONFIGURED" },
      });

      await maybeInsertEnumerationAlert(db, ip, key);
      return json({ ok: false, msg: "LICENSE_MISCONFIGURED" });
    }

    // ✅ Rule B: if already started but expires_at is NULL, heal it from first_used_at + duration.
    if (firstUsedAt && !licRow.expires_at) {
      const fuMs = new Date(firstUsedAt).getTime();
      if (Number.isFinite(fuMs)) {
        const healedExpiresAt = new Date(fuMs + effectiveDurationSeconds * 1000).toISOString();
        const heal = await db
          .from("licenses")
          .update({ expires_at: healedExpiresAt })
          .eq("id", licRow.id)
          .is("expires_at", null)
          .select("expires_at")
          .maybeSingle();

        // Use healed value regardless of race outcome.
        effectiveExpiresAt = heal.data?.expires_at ?? healedExpiresAt;
      }
    }

    // Activate only if not started yet
    if (!firstUsedAt) {
      const newExpiresAt = new Date(now.getTime() + effectiveDurationSeconds * 1000).toISOString();

      // Activate atomically (win the race) using the new columns; also set legacy activated_at
      // for backward-compat display.
      const activation = await db
        .from("licenses")
        .update({
          first_used_at: now.toISOString(),
          activated_at: now.toISOString(),
          expires_at: newExpiresAt,
        })
        .eq("id", licRow.id)
        .is("first_used_at", null)
        .select("expires_at,first_used_at")
        .maybeSingle();

      // If we won the race, use the updated values. If we lost, re-select to avoid returning started=false.
      if (!activation.error && activation.data?.expires_at && activation.data?.first_used_at) {
        effectiveExpiresAt = activation.data.expires_at;
        effectiveFirstUsedAt = activation.data.first_used_at;
      } else {
        const latest = await db
          .from("licenses")
          .select("expires_at,first_used_at")
          .eq("id", licRow.id)
          .maybeSingle();
        if (!latest.error && latest.data) {
          effectiveExpiresAt = latest.data.expires_at ?? effectiveExpiresAt;
          effectiveFirstUsedAt = latest.data.first_used_at ?? effectiveFirstUsedAt;
        }
      }

      started = Boolean(effectiveFirstUsedAt);
    }
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
      license_id: licRow.id,
      device_row: up.data?.id ?? null,
    },
  });

  const remainingSeconds = effectiveExpiresAt
    ? Math.max(0, Math.floor((new Date(effectiveExpiresAt).getTime() - now.getTime()) / 1000))
    : startsOnFirstUse && !started
      ? (() => {
          return typeof effectiveDurationSeconds === "number" ? effectiveDurationSeconds : null;
        })()
      : null;

  return json({
    ok: true,
    msg: "OK",
    expires_at: effectiveExpiresAt,
    max_devices: licRow.max_devices,
    started,
    remaining_seconds: remainingSeconds,
    server_time: now.toISOString(),
  });
});
