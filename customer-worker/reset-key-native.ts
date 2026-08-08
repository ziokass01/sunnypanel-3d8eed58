// @ts-nocheck
import { createServiceClient } from "./supabase-rest.js";

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function normalizeKey(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function appCodeFromKey(key) {
  if (key.startsWith("AI-SUNNY-") || key.startsWith("AI-")) return "ai-coding";
  if (key.startsWith("FAKELAG-")) return "fake-lag";
  if (key.startsWith("FND-") || key.startsWith("FD-")) return "find-dumps";
  if (key.startsWith("SUNNY-")) return "free-fire";
  return "unknown";
}

function clampPercent(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function secondsBetween(from, toIso) {
  if (!toIso) return null;
  const to = new Date(toIso);
  if (!Number.isFinite(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
}

function addSeconds(date, seconds) {
  return new Date(date.getTime() + Math.max(0, Math.floor(seconds)) * 1000).toISOString();
}

function effectiveTiming(lic, now) {
  const startsOnFirstUse = Boolean(lic?.start_on_first_use || lic?.starts_on_first_use);
  const firstUsedAt = lic?.first_used_at ?? lic?.activated_at ?? null;
  const seconds = Number(lic?.duration_seconds ?? 0);
  const days = Number(lic?.duration_days ?? 0);

  let durationSeconds = null;
  if (seconds > 0) durationSeconds = seconds;
  else if (days > 0) durationSeconds = days * 86400;

  let expiresAt = lic?.expires_at ?? null;
  if (!expiresAt && startsOnFirstUse && firstUsedAt && durationSeconds) {
    const firstMs = new Date(firstUsedAt).getTime();
    if (Number.isFinite(firstMs)) {
      expiresAt = new Date(firstMs + durationSeconds * 1000).toISOString();
    }
  }

  let remainingSeconds = null;
  if (expiresAt) {
    remainingSeconds = secondsBetween(now, expiresAt);
  } else if (startsOnFirstUse && !firstUsedAt && durationSeconds) {
    remainingSeconds = Math.max(0, Math.floor(durationSeconds));
  }

  return { startsOnFirstUse, firstUsedAt, durationSeconds, expiresAt, remainingSeconds };
}

async function readJsonBody(req, maxBytes = 8192) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }
  if (!req.body) return {};

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("PAYLOAD_TOO_LARGE");
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text ? JSON.parse(text) : {};
}

function turnstileSecret(env) {
  // TURNSTILE_SECRET is the canonical Cloudflare Spin name.
  // Keep the older aliases so an existing deployment does not break while rotating.
  return String(
    env?.TURNSTILE_SECRET ||
    env?.TURNSTILE_SECRET_KEY ||
    env?.CLOUDFLARE_TURNSTILE_SECRET ||
    "",
  ).trim();
}

async function verifyTurnstile(token, req, env) {
  const secret = turnstileSecret(env);
  if (!secret) {
    return {
      success: false,
      errorCodes: ["missing-input-secret"],
      hostname: "",
      action: "",
    };
  }
  if (!token || String(token).length > 2048) {
    return {
      success: false,
      errorCodes: ["missing-input-response"],
      hostname: "",
      action: "",
    };
  }

  const ip = req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", String(token));
  if (ip) form.set("remoteip", ip);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException("TURNSTILE_SITEVERIFY_TIMEOUT", "AbortError"));
  }, 10_000);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: controller.signal,
    });

    const body = await res.json().catch(() => null);
    const errorCodes = Array.isArray(body?.["error-codes"])
      ? body["error-codes"].map((value) => String(value))
      : [];

    if (!res.ok || !body || typeof body !== "object") {
      return {
        success: false,
        errorCodes: errorCodes.length ? errorCodes : [`siteverify-http-${res.status}`],
        hostname: "",
        action: "",
      };
    }

    return {
      success: body.success === true,
      errorCodes,
      hostname: typeof body.hostname === "string" ? body.hostname : "",
      action: typeof body.action === "string" ? body.action : "",
    };
  } catch (error) {
    const name = String(error?.name || "");
    return {
      success: false,
      errorCodes: [
        name === "AbortError" ? "siteverify-timeout" : "siteverify-network-error",
      ],
      hostname: "",
      action: "",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getResetSettings(db) {
  const { data } = await db.from("license_reset_settings").select("*").eq("id", 1).maybeSingle();
  if (data) return data;
  return {
    enabled: true,
    require_turnstile: false,
    free_first_penalty_pct: 0,
    free_next_penalty_pct: 20,
    free_next_step_penalty_pct: 20,
    paid_first_penalty_pct: 0,
    paid_next_penalty_pct: 20,
    paid_next_step_penalty_pct: 20,
    public_reset_cancel_after_count: 0,
    disabled_message: "Reset key đang tạm tắt.",
  };
}

async function getKeyKind(db, licenseId) {
  const { data, error } = await db
    .from("licenses_free_issues")
    .select("issue_id")
    .eq("license_id", licenseId)
    .limit(1);
  if (!error && Array.isArray(data) && data.length > 0) return "free";
  return "admin";
}

async function countRows(db, table, filters) {
  const q = filters(db.from(table).select("id", { count: "exact", head: true }));
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

function computePenaltyPct(settings, keyKind, priorResetCount) {
  if (keyKind === "free") {
    if (priorResetCount <= 0) return clampPercent(settings?.free_first_penalty_pct);
    return clampPercent(settings?.free_next_penalty_pct ?? settings?.free_next_step_penalty_pct);
  }
  if (priorResetCount <= 0) return clampPercent(settings?.paid_first_penalty_pct);
  return clampPercent(settings?.paid_next_penalty_pct ?? settings?.paid_next_step_penalty_pct);
}

function buildSnapshot(args) {
  const now = new Date();
  const timing = effectiveTiming(args.lic, now);
  const remainingSeconds = timing.remainingSeconds;
  const nextPenaltyPct = computePenaltyPct(args.settings, args.keyKind, args.publicResetCount);
  let nextPenaltySeconds = 0;
  if (remainingSeconds != null) {
    nextPenaltySeconds = Math.floor(remainingSeconds * nextPenaltyPct / 100);
  }

  let status = "active";
  if (!args.lic?.is_active) status = "blocked";
  else if (args.lic?.deleted_at) status = "deleted";
  else if (timing.expiresAt && remainingSeconds === 0) status = "expired";
  else if (timing.startsOnFirstUse && !timing.firstUsedAt) status = "not_started";

  return {
    ok: true,
    msg: args.msg ?? "OK",
    key: args.lic?.key,
    key_kind: args.keyKind,
    app_code: args.appCode,
    created_at: args.lic?.created_at ?? null,
    expires_at: timing.expiresAt,
    remaining_seconds: remainingSeconds,
    status,
    device_count: args.deviceCount,
    max_devices: args.lic?.max_devices ?? 1,
    ip_count: args.ipCount ?? 0,
    max_ips: args.lic?.max_ips ?? 1,
    verify_count: args.lic?.verify_count ?? 0,
    max_verify: args.lic?.max_verify ?? 1,
    public_reset_count: args.publicResetCount,
    penalty_pct: args.penaltyPct,
    penalty_seconds: args.penaltySeconds,
    devices_removed: args.devicesRemoved,
    reset_enabled: Boolean(args.settings?.enabled ?? true),
    disabled_message: args.settings?.disabled_message ?? null,
    public_reset_disabled: Boolean(args.lic?.public_reset_disabled),
    next_reset_penalty_pct: nextPenaltyPct,
    next_reset_will_expire: remainingSeconds != null && nextPenaltySeconds >= remainingSeconds && nextPenaltyPct > 0,
    public_reset_cancel_after_count: args.settings?.public_reset_cancel_after_count ?? null,
  };
}

async function aiKeyHash(key, env) {
  const pepper = String(env?.AI_SUNNY_KEY_PEPPER || env?.AI_SUNNY_HASH_PEPPER || "sunny-ai");
  return await sha256Hex(`${pepper}:${key}`);
}

async function findAiKey(db, key, env) {
  const codeHash = await aiKeyHash(key, env);
  const { data, error } = await db
    .from("ai_sunny_redeem_keys")
    .select("id,code_mask,title,status,created_at,updated_at,expires_at,grant_hours,max_uses_total,max_uses_per_day,used_count,daily_ip_limit,daily_device_limit")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (error) throw new Error(String(error?.message || error));
  return data ?? null;
}

function buildAiLicenseShape(key, row) {
  const active = String(row?.status ?? "").toLowerCase() === "active";
  return {
    id: row?.id,
    key,
    created_at: row?.created_at ?? null,
    expires_at: row?.expires_at ?? null,
    is_active: active,
    deleted_at: null,
    max_devices: row?.daily_device_limit ?? 1,
    public_reset_disabled: false,
  };
}

async function handleAiCheck(req, env, db, key, ctx) {
  const row = await findAiKey(db, key, env);
  if (!row) return ctx.json({ ok: false, msg: "KEY_UNAVAILABLE" }, 404);

  const values = await Promise.all([
    getResetSettings(db),
    countRows(db, "ai_sunny_redeem_logs", (q) => q.eq("redeem_key_id", row.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);
  const settings = values[0];
  const deviceCount = values[1];
  const publicResetCount = values[2];

  return ctx.json(buildSnapshot({
    lic: buildAiLicenseShape(key, row),
    settings,
    keyKind: "free",
    appCode: "ai-coding",
    deviceCount,
    publicResetCount,
  }), 200);
}

async function ensureTurnstile(req, env, settings, body, ctx) {
  if (!Boolean(settings?.require_turnstile)) return null;
  if (!turnstileSecret(env)) {
    return ctx.json({ ok: false, msg: "TURNSTILE_NOT_CONFIGURED", code: "TURNSTILE_NOT_CONFIGURED" }, 503);
  }

  const result = await verifyTurnstile(body?.turnstile_token, req, env);
  if (!result.success) {
    console.warn("reset-key turnstile rejected", JSON.stringify({
      error_codes: result.errorCodes,
      hostname: result.hostname || null,
      action: result.action || null,
    }));
    return ctx.json({ ok: false, msg: "TURNSTILE_FAILED", code: "TURNSTILE_FAILED" }, 403);
  }
  return null;
}

async function handleAiReset(req, env, db, body, key, ctx) {
  const row = await findAiKey(db, key, env);
  if (!row || String(row.status ?? "") !== "active") {
    return ctx.json({ ok: false, msg: "KEY_UNAVAILABLE" }, 404);
  }

  const settings = await getResetSettings(db);
  if (!Boolean(settings?.enabled ?? true)) {
    return ctx.json({ ok: false, msg: "RESET_DISABLED", disabled_message: settings?.disabled_message ?? null }, 403);
  }

  const turnstileFailure = await ensureTurnstile(req, env, settings, body, ctx);
  if (turnstileFailure) return turnstileFailure;

  const now = new Date();
  const values = await Promise.all([
    countRows(db, "ai_sunny_redeem_logs", (q) => q.eq("redeem_key_id", row.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);
  const deviceCount = values[0];
  const priorPublicResetCount = values[1];
  const penaltyPct = computePenaltyPct(settings, "free", priorPublicResetCount);
  const remainingSeconds = secondsBetween(now, row.expires_at);
  let penaltySeconds = 0;
  if (remainingSeconds != null) penaltySeconds = Math.floor(remainingSeconds * penaltyPct / 100);

  let newExpiresAt = row.expires_at;
  if (remainingSeconds != null && penaltySeconds > 0) {
    newExpiresAt = addSeconds(now, Math.max(0, remainingSeconds - penaltySeconds));
  }

  const deleteResult = await db.from("ai_sunny_redeem_logs").delete().eq("redeem_key_id", row.id);
  if (deleteResult.error) return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);

  let nextStatus = "active";
  if (newExpiresAt && new Date(newExpiresAt).getTime() <= now.getTime()) nextStatus = "expired";

  const updateResult = await db.from("ai_sunny_redeem_keys").update({
    used_count: 0,
    status: nextStatus,
    expires_at: newExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (updateResult.error) return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);

  const auditResult = await db.from("audit_logs").insert({
    action: "PUBLIC_RESET",
    license_key: key,
    detail: {
      ai_redeem_key_id: row.id,
      app_code: "ai-coding",
      key_kind: "free",
      devices_removed: deviceCount,
      prior_public_reset_count: priorPublicResetCount,
      penalty_pct: penaltyPct,
      penalty_seconds: penaltySeconds,
      old_expires_at: row.expires_at,
      new_expires_at: newExpiresAt,
      source: "public-ai",
    },
  });
  if (auditResult.error) {
    console.error("reset-key native AI audit failed", String(auditResult.error?.message || auditResult.error));
  }

  const refreshed = {
    ...row,
    expires_at: newExpiresAt,
    used_count: 0,
    status: nextStatus,
  };

  return ctx.json(buildSnapshot({
    lic: buildAiLicenseShape(key, refreshed),
    settings,
    keyKind: "free",
    appCode: "ai-coding",
    deviceCount: 0,
    publicResetCount: priorPublicResetCount + 1,
    penaltyPct,
    penaltySeconds,
    devicesRemoved: deviceCount,
    msg: "RESET_OK",
  }), 200);
}

async function handleCheck(req, env, db, key, ctx) {
  if (appCodeFromKey(key) === "ai-coding") {
    return await handleAiCheck(req, env, db, key, ctx);
  }

  const { data: lic, error } = await db
    .from("licenses")
    .select("id,key,created_at,expires_at,is_active,deleted_at,max_devices,max_ips,max_verify,verify_count,public_reset_disabled,start_on_first_use,starts_on_first_use,duration_seconds,duration_days,first_used_at,activated_at,app_code,public_reset_count,admin_reset_count")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !lic) return ctx.json({ ok: false, msg: "KEY_UNAVAILABLE" }, 404);

  const values = await Promise.all([
    getResetSettings(db),
    getKeyKind(db, lic.id),
    countRows(db, "license_devices", (q) => q.eq("license_id", lic.id)),
    countRows(db, "license_ip_bindings", (q) => q.eq("license_id", lic.id)),
    countRows(db, "audit_logs", (q) => q.eq("license_key", key).eq("action", "PUBLIC_RESET")),
  ]);

  const settings = values[0];
  const keyKind = values[1];
  const deviceCount = values[2];
  const ipCount = values[3];
  const auditResetCount = values[4];
  const publicResetCount = Math.max(Number(lic.public_reset_count ?? 0), auditResetCount);

  return ctx.json(buildSnapshot({
    lic,
    settings,
    keyKind,
    appCode: appCodeFromKey(key),
    deviceCount,
    ipCount,
    publicResetCount,
  }), 200);
}

async function handleReset(req, env, db, body, key, ctx) {
  if (appCodeFromKey(key) === "ai-coding") {
    return await handleAiReset(req, env, db, body, key, ctx);
  }

  const { data: lic, error } = await db
    .from("licenses")
    .select("id,key,is_active,deleted_at,public_reset_disabled")
    .eq("key", key)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !lic || !lic.is_active) return ctx.json({ ok: false, msg: "KEY_UNAVAILABLE" }, 404);

  const settings = await getResetSettings(db);
  if (!Boolean(settings?.enabled ?? true)) {
    return ctx.json({ ok: false, msg: "RESET_DISABLED", disabled_message: settings?.disabled_message ?? null }, 403);
  }
  if (Boolean(lic.public_reset_disabled)) {
    return ctx.json({ ok: false, msg: "KEY_RESET_DISABLED", public_reset_disabled: true }, 403);
  }

  const turnstileFailure = await ensureTurnstile(req, env, settings, body, ctx);
  if (turnstileFailure) return turnstileFailure;

  const resetResult = await db.rpc("reset_license_key_atomic", { p_key: key });
  if (resetResult.error) {
    console.error("reset-key native atomic reset failed", String(resetResult.error?.message || resetResult.error));
    return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }

  const result = resetResult.data ?? { ok: false, msg: "RESET_INTERNAL_ERROR" };
  let status = 409;
  if (result?.ok) status = 200;
  else if (String(result?.msg || "") === "KEY_RESET_DISABLED") status = 403;

  if (!result?.ok && String(result?.msg || "") === "RESET_INTERNAL_ERROR") {
    return ctx.json({ ok: false, msg: "RESET_INTERNAL_ERROR" }, status);
  }
  return ctx.json(result, status);
}

async function enforceDbRateLimits(req, db, action, key, ctx) {
  const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";

  let ipLimitCount = 60;
  let keyLimitCount = 20;
  let keyWindowSeconds = 300;
  if (action === "reset") {
    ipLimitCount = 10;
    keyLimitCount = 3;
    keyWindowSeconds = 600;
  }

  const results = await Promise.all([
    db.rpc("check_rate_limit", {
      p_key: `RESET_KEY_${action.toUpperCase()}`,
      p_ip: ip,
      p_limit: ipLimitCount,
      p_window_seconds: 300,
    }),
    db.rpc("check_rate_limit", {
      p_key: key,
      p_ip: ip,
      p_limit: keyLimitCount,
      p_window_seconds: keyWindowSeconds,
    }),
  ]);

  const ipLimit = results[0];
  const keyLimit = results[1];
  if (ipLimit.error || keyLimit.error) {
    return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 503);
  }

  const ipAllowed = Boolean(ipLimit.data?.[0]?.allowed);
  const keyAllowed = Boolean(keyLimit.data?.[0]?.allowed);
  if (!ipAllowed || !keyAllowed) {
    return ctx.json({ ok: false, msg: "RATE_LIMIT" }, 429);
  }
  return null;
}

export function resetKeyNativeReadiness(env) {
  return {
    enabled: String(env?.RESET_NATIVE_ENABLED ?? "").trim() === "1",
    turnstileConfigured: Boolean(turnstileSecret(env)),
  };
}

export async function handleResetKey(req, env, ctx) {
  const db = createServiceClient(env);
  if (!db) return ctx.json({ ok: false, msg: "SERVER_MISCONFIG" }, 500);

  if (req.method === "GET") {
    try {
      const settings = await getResetSettings(db);
      return ctx.json({
        ok: true,
        turnstile_enabled: Boolean(settings?.require_turnstile),
        configured: Boolean(turnstileSecret(env)),
      }, 200);
    } catch (error) {
      console.error("reset-key native GET failed", String(error?.message || error));
      return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
    }
  }

  if (req.method !== "POST") {
    return ctx.json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    const message = String(error?.message || "");
    const status = message === "PAYLOAD_TOO_LARGE" ? 413 : 400;
    return ctx.json({ ok: false, msg: "INVALID_INPUT" }, status);
  }

  const action = String(body?.action ?? "check").toLowerCase();
  const key = normalizeKey(body?.key);
  if (!/^[A-Z0-9_-]{2,24}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}-[A-Z0-9]{4,8}$/.test(key)) {
    return ctx.json({ ok: false, msg: "KEY_UNAVAILABLE" }, 400);
  }

  try {
    const rateLimitFailure = await enforceDbRateLimits(req, db, action, key, ctx);
    if (rateLimitFailure) return rateLimitFailure;

    if (action === "reset") return await handleReset(req, env, db, body, key, ctx);
    return await handleCheck(req, env, db, key, ctx);
  } catch (error) {
    console.error("reset-key native error", String(error?.message || error));
    return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }
}
