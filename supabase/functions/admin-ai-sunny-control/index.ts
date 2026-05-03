import { assertAdmin, createAdminClient, json } from "../_shared/admin.ts";

function normalizeCode(value: string) {
  return String(value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function maskCode(code: string) {
  if (code.length <= 8) return `${code.slice(0, 2)}***${code.slice(-2)}`;
  return `${code.slice(0, 4)}…${code.slice(-4)}`;
}

function randomCode(prefix = "AI") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${prefix}-${out.slice(0, 6)}-${out.slice(6, 12)}-${out.slice(12, 18)}`;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function asInt(value: unknown, fallback: number, min = 0, max = 2147483647) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function asTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 20);
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json(200, { ok: true }, origin);
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

  const auth = await assertAdmin(req);
  if (!auth.ok) return json(auth.status, auth.body, origin);

  const db = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "dashboard").trim();

  try {
    if (action === "dashboard") {
      const [configRes, plansRes, keysRes, accessRes, usageRes, redeemLogsRes, sandboxRes] = await Promise.all([
        db.from("ai_sunny_config").select("*").eq("id", 1).maybeSingle(),
        db.from("ai_sunny_plans").select("*").order("sort_order", { ascending: true }),
        db.from("ai_sunny_redeem_keys").select("*").order("created_at", { ascending: false }).limit(50),
        db.from("ai_sunny_user_access").select("*").order("updated_at", { ascending: false }).limit(50),
        db.from("ai_sunny_usage_logs").select("*").order("created_at", { ascending: false }).limit(100),
        db.from("ai_sunny_redeem_logs").select("*").order("created_at", { ascending: false }).limit(100),
        db.from("ai_sunny_sandbox_sessions").select("*").order("started_at", { ascending: false }).limit(50),
      ]);

      for (const r of [configRes, plansRes, keysRes, accessRes, usageRes, redeemLogsRes, sandboxRes]) {
        if ((r as any).error) throw (r as any).error;
      }

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const todayUsage = (usageRes.data ?? []).filter((r: any) => r.day_key === today && r.request_status === "ok");
      const todayTokens = todayUsage.reduce((n: number, r: any) => n + Number(r.estimated_tokens ?? 0), 0);

      return json(200, {
        ok: true,
        config: configRes.data,
        plans: plansRes.data ?? [],
        keys: keysRes.data ?? [],
        accesses: accessRes.data ?? [],
        usage_logs: usageRes.data ?? [],
        redeem_logs: redeemLogsRes.data ?? [],
        sandbox_sessions: sandboxRes.data ?? [],
        stats: {
          today,
          today_tokens: todayTokens,
          today_messages: todayUsage.length,
          active_access_count: (accessRes.data ?? []).filter((r: any) => r.status === "active").length,
          active_key_count: (keysRes.data ?? []).filter((r: any) => r.status === "active").length,
        },
      }, origin);
    }

    if (action === "save_config") {
      const patch = body?.config ?? {};
      const payload = {
        id: 1,
        enabled: Boolean(patch.enabled),
        public_enabled: Boolean(patch.public_enabled),
        maintenance_message: String(patch.maintenance_message ?? "SunnyMod Coding AI đang bảo trì, vui lòng thử lại sau.").slice(0, 500),
        default_model: String(patch.default_model ?? "mimo-v2.5").trim() || "mimo-v2.5",
        pro_model: String(patch.pro_model ?? "mimo-v2.5-pro").trim() || "mimo-v2.5-pro",
        mimo_base_url: String(patch.mimo_base_url ?? "https://token-plan-sgp.xiaomimimo.com/v1").trim().replace(/\/+$/, ""),
        global_daily_token_limit: asInt(patch.global_daily_token_limit, 80000000),
        global_monthly_stop_at_tokens: asInt(patch.global_monthly_stop_at_tokens, 1500000000),
        max_input_chars: asInt(patch.max_input_chars, 24000, 1000, 100000),
        system_prompt: String(patch.system_prompt ?? "You are SunnyMod Coding AI.").slice(0, 4000),
        sandbox_global_enabled: Boolean(patch.sandbox_global_enabled),
        updated_by: "admin-ai-sunny-control",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db.from("ai_sunny_config").upsert(payload, { onConflict: "id" }).select("*").single();
      if (error) throw error;
      return json(200, { ok: true, config: data }, origin);
    }

    if (action === "upsert_plan") {
      const p = body?.plan ?? {};
      const planCode = String(p.plan_code ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      if (!planCode) return json(400, { ok: false, code: "PLAN_CODE_MISSING" }, origin);

      const payload = {
        plan_code: planCode,
        label: String(p.label ?? planCode).slice(0, 120),
        description: String(p.description ?? "").slice(0, 500),
        enabled: Boolean(p.enabled ?? true),
        sort_order: asInt(p.sort_order, 100, 0, 9999),
        daily_token_limit: asInt(p.daily_token_limit, 0),
        daily_message_limit: asInt(p.daily_message_limit, 0),
        monthly_token_limit: asInt(p.monthly_token_limit, 0),
        max_tokens_per_request: asInt(p.max_tokens_per_request, 1200, 100, 20000),
        max_input_chars: asInt(p.max_input_chars, 12000, 1000, 120000),
        allowed_models: asTextArray(p.allowed_models),
        sandbox_enabled: Boolean(p.sandbox_enabled),
        terminal_enabled: Boolean(p.terminal_enabled),
        tts_enabled: Boolean(p.tts_enabled),
        price_label: String(p.price_label ?? "").slice(0, 120),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db.from("ai_sunny_plans").upsert(payload, { onConflict: "plan_code" }).select("*").single();
      if (error) throw error;
      return json(200, { ok: true, plan: data }, origin);
    }

    if (action === "set_user_access") {
      const u = body?.access ?? {};
      const userId = String(u.user_id ?? "").trim();
      const email = String(u.email ?? "").trim().toLowerCase() || null;
      const planCode = String(u.plan_code ?? "").trim().toLowerCase();
      if (!userId) return json(400, { ok: false, code: "USER_ID_MISSING" }, origin);
      if (!planCode) return json(400, { ok: false, code: "PLAN_CODE_MISSING" }, origin);

      const payload = {
        user_id: userId,
        email,
        plan_code: planCode,
        status: String(u.status ?? "active"),
        daily_token_limit_override: u.daily_token_limit_override === "" || u.daily_token_limit_override == null ? null : asInt(u.daily_token_limit_override, 0),
        daily_message_limit_override: u.daily_message_limit_override === "" || u.daily_message_limit_override == null ? null : asInt(u.daily_message_limit_override, 0),
        daily_ip_limit_override: u.daily_ip_limit_override === "" || u.daily_ip_limit_override == null ? null : asInt(u.daily_ip_limit_override, 0),
        daily_device_limit_override: u.daily_device_limit_override === "" || u.daily_device_limit_override == null ? null : asInt(u.daily_device_limit_override, 0),
        expires_at: String(u.expires_at ?? "").trim() || null,
        source: "admin",
        note: String(u.note ?? "").slice(0, 500),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db.from("ai_sunny_user_access").upsert(payload, { onConflict: "user_id" }).select("*").single();
      if (error) throw error;
      return json(200, { ok: true, access: data }, origin);
    }

    if (action === "create_redeem_key") {
      const k = body?.key ?? {};
      const rawCode = normalizeCode(String(k.code ?? "")) || randomCode(String(k.prefix ?? "AI").slice(0, 8).toUpperCase() || "AI");
      const pepper = Deno.env.get("AI_SUNNY_KEY_PEPPER") ?? Deno.env.get("AI_SUNNY_HASH_PEPPER") ?? "sunny-ai";
      const codeHash = await sha256Hex(`${pepper}:${rawCode}`);

      const payload = {
        code_hash: codeHash,
        code_mask: maskCode(rawCode),
        title: String(k.title ?? "SunnyMod AI key").slice(0, 160),
        status: "active",
        plan_code_to_grant: String(k.plan_code_to_grant ?? "trial").trim().toLowerCase(),
        grant_hours: asInt(k.grant_hours, 24, 1, 24 * 365),
        bonus_daily_tokens: asInt(k.bonus_daily_tokens, 50000),
        bonus_daily_messages: asInt(k.bonus_daily_messages, 20),
        allowed_models: asTextArray(k.allowed_models),
        max_uses_total: asInt(k.max_uses_total, 1, 1),
        max_uses_per_day: asInt(k.max_uses_per_day, 1, 1),
        per_user_once: Boolean(k.per_user_once ?? true),
        daily_ip_limit: asInt(k.daily_ip_limit, 1, 0),
        daily_device_limit: asInt(k.daily_device_limit, 1, 0),
        require_device_id: Boolean(k.require_device_id ?? true),
        expires_at: String(k.expires_at ?? "").trim() || null,
        created_by: "admin-ai-sunny-control",
        note: String(k.note ?? "").slice(0, 500),
      };

      const { data, error } = await db.from("ai_sunny_redeem_keys").insert(payload).select("*").single();
      if (error) throw error;
      return json(200, { ok: true, key: data, raw_code: rawCode }, origin);
    }

    if (action === "update_redeem_key_status") {
      const id = String(body?.id ?? "").trim();
      const status = String(body?.status ?? "disabled").trim();
      if (!id) return json(400, { ok: false, code: "ID_MISSING" }, origin);
      const { data, error } = await db
        .from("ai_sunny_redeem_keys")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return json(200, { ok: true, key: data }, origin);
    }

    if (action === "kill_sandbox") {
      const id = String(body?.id ?? "").trim();
      if (!id) return json(400, { ok: false, code: "ID_MISSING" }, origin);
      const { data, error } = await db
        .from("ai_sunny_sandbox_sessions")
        .update({ status: "killed", reason: String(body?.reason ?? "admin kill"), ended_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return json(200, { ok: true, sandbox: data }, origin);
    }

    return json(400, { ok: false, code: "UNKNOWN_ACTION", msg: `Unknown action: ${action}` }, origin);
  } catch (e: any) {
    return json(500, { ok: false, code: "ADMIN_AI_CONTROL_ERROR", msg: e?.message ?? String(e) }, origin);
  }
});
