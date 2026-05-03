import { createClient } from "npm:@supabase/supabase-js@2";
import { createAdminClient, json } from "../_shared/admin.ts";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const MODEL_ALLOW_LIST = new Set([
  "mimo-v2-omni",
  "mimo-v2-pro",
  "mimo-v2-tts",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "mimo-v2.5-tts",
  "mimo-v2.5-tts-voiceclone",
  "mimo-v2.5-tts-voicedesign",
]);

function dayKeyVN(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function normalizeMessages(raw: unknown, maxInputChars: number): ChatMessage[] {
  const arr = Array.isArray(raw) ? raw : [];
  const messages: ChatMessage[] = [];
  let used = 0;

  for (const item of arr.slice(-24)) {
    const role = String((item as any)?.role || "user").trim() as ChatMessage["role"];
    if (!["system", "user", "assistant"].includes(role)) continue;
    const contentRaw = String((item as any)?.content ?? "");
    const remaining = Math.max(0, maxInputChars - used);
    if (remaining <= 0) break;
    const content = contentRaw.slice(0, remaining);
    used += content.length;
    if (content.trim()) messages.push({ role, content });
  }

  return messages;
}

function sumChars(messages: ChatMessage[]) {
  return messages.reduce((n, m) => n + m.content.length, 0);
}

function estimateTokensFromChars(inputChars: number, outputChars = 0) {
  return Math.ceil((inputChars + outputChars) / 4);
}

async function getUser(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : authHeader.trim();
  if (!supabaseUrl || !anonKey || !token) return { user: null, token: "" };

  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await authed.auth.getUser(token);
  if (error || !data?.user) return { user: null, token };
  return { user: data.user, token };
}

async function insertUsage(db: any, row: Record<string, unknown>) {
  try {
    await db.from("ai_sunny_usage_logs").insert(row);
  } catch {
    // never break the user response because logging failed
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json(200, { ok: true }, origin);
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" }, origin);

  const db = createAdminClient();
  const ip = getIp(req);
  const ua = req.headers.get("user-agent") ?? "";
  const ipHash = await sha256Hex(`ip:${ip}:${Deno.env.get("AI_SUNNY_HASH_PEPPER") ?? "sunny-ai"}`);
  const uaHash = await sha256Hex(`ua:${ua}:${Deno.env.get("AI_SUNNY_HASH_PEPPER") ?? "sunny-ai"}`);
  const dayKey = dayKeyVN();

  const { user } = await getUser(req);
  if (!user) return json(401, { ok: false, code: "LOGIN_REQUIRED", msg: "Bạn cần đăng nhập để dùng SunnyMod Coding AI." }, origin);

  const email = String(user.email ?? "").toLowerCase();
  const body = await req.json().catch(() => ({}));
  const deviceRaw = String(body?.device_id ?? req.headers.get("x-ai-device") ?? "").trim();
  const deviceHash = deviceRaw ? await sha256Hex(`device:${deviceRaw}:${Deno.env.get("AI_SUNNY_HASH_PEPPER") ?? "sunny-ai"}`) : null;

  const { data: config } = await db.from("ai_sunny_config").select("*").eq("id", 1).maybeSingle();
  if (!config?.enabled || !config?.public_enabled) {
    return json(403, { ok: false, code: "AI_DISABLED", msg: config?.maintenance_message ?? "AI đang tạm đóng." }, origin);
  }

  const { data: access } = await db
    .from("ai_sunny_user_access")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!access) {
    return json(403, {
      ok: false,
      code: "PLAN_REQUIRED",
      msg: "Tài khoản chưa có gói AI. Hãy nhập key mở token hoặc liên hệ admin để cấp gói.",
    }, origin);
  }

  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) {
    await db.from("ai_sunny_user_access").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", access.id);
    return json(403, { ok: false, code: "PLAN_EXPIRED", msg: "Gói AI đã hết hạn." }, origin);
  }

  const { data: plan } = await db.from("ai_sunny_plans").select("*").eq("plan_code", access.plan_code).maybeSingle();
  if (!plan?.enabled) return json(403, { ok: false, code: "PLAN_DISABLED", msg: "Gói AI hiện đang bị tắt." }, origin);

  const allowedModels: string[] = Array.isArray(plan.allowed_models) ? plan.allowed_models : [];
  const requestedModel = String(body?.model ?? config.default_model ?? "mimo-v2.5").trim();
  const model = MODEL_ALLOW_LIST.has(requestedModel) ? requestedModel : String(config.default_model ?? "mimo-v2.5");

  if (!allowedModels.includes(model)) {
    return json(403, {
      ok: false,
      code: "MODEL_NOT_IN_PLAN",
      msg: `Gói ${plan.label ?? plan.plan_code} chưa mở model ${model}.`,
    }, origin);
  }

  const mode = String(body?.mode ?? "chat").slice(0, 40);
  if ((mode.includes("sandbox") || mode.includes("terminal")) && (!config.sandbox_global_enabled || !plan.sandbox_enabled || !plan.terminal_enabled)) {
    return json(403, { ok: false, code: "SANDBOX_NOT_ALLOWED", msg: "Sandbox/terminal chỉ mở cho gói Max khi admin bật." }, origin);
  }

  const maxInputChars = Math.max(1000, Math.min(Number(access.max_input_chars ?? plan.max_input_chars ?? config.max_input_chars ?? 12000), Number(config.max_input_chars ?? 24000)));
  const messages = normalizeMessages(body?.messages ?? [{ role: "user", content: body?.message ?? "" }], maxInputChars);
  const inputChars = sumChars(messages);
  if (!messages.length) return json(400, { ok: false, code: "MESSAGE_MISSING", msg: "Thiếu nội dung chat." }, origin);

  const userDailyTokenLimit = Number(access.daily_token_limit_override ?? plan.daily_token_limit ?? 0);
  const userDailyMessageLimit = Number(access.daily_message_limit_override ?? plan.daily_message_limit ?? 0);
  const dailyIpLimit = Number(access.daily_ip_limit_override ?? 0);
  const dailyDeviceLimit = Number(access.daily_device_limit_override ?? 0);

  const { data: dailyRows } = await db
    .from("ai_sunny_usage_logs")
    .select("estimated_tokens, request_status, ip_hash, device_hash")
    .eq("user_id", user.id)
    .eq("day_key", dayKey);

  const okDailyRows = (dailyRows ?? []).filter((r: any) => r.request_status === "ok");
  const usedTokens = okDailyRows.reduce((n: number, r: any) => n + Number(r.estimated_tokens ?? 0), 0);
  const usedMessages = okDailyRows.length;

  if (userDailyMessageLimit > 0 && usedMessages >= userDailyMessageLimit) {
    return json(429, { ok: false, code: "DAILY_MESSAGE_LIMIT", msg: "Bạn đã hết lượt chat hôm nay." }, origin);
  }

  if (userDailyTokenLimit > 0 && usedTokens >= userDailyTokenLimit) {
    return json(429, { ok: false, code: "DAILY_TOKEN_LIMIT", msg: "Bạn đã hết giới hạn token hôm nay." }, origin);
  }

  if (dailyIpLimit > 0) {
    const ipCount = okDailyRows.filter((r: any) => r.ip_hash === ipHash).length;
    if (ipCount >= dailyIpLimit) return json(429, { ok: false, code: "DAILY_IP_LIMIT", msg: "IP này đã hết lượt AI hôm nay." }, origin);
  }

  if (dailyDeviceLimit > 0 && deviceHash) {
    const deviceCount = okDailyRows.filter((r: any) => r.device_hash === deviceHash).length;
    if (deviceCount >= dailyDeviceLimit) return json(429, { ok: false, code: "DAILY_DEVICE_LIMIT", msg: "Thiết bị này đã hết lượt AI hôm nay." }, origin);
  }

  const { data: globalRows } = await db
    .from("ai_sunny_usage_logs")
    .select("estimated_tokens")
    .eq("day_key", dayKey)
    .eq("request_status", "ok");
  const globalUsed = (globalRows ?? []).reduce((n: number, r: any) => n + Number(r.estimated_tokens ?? 0), 0);
  if (Number(config.global_daily_token_limit ?? 0) > 0 && globalUsed >= Number(config.global_daily_token_limit)) {
    return json(429, { ok: false, code: "GLOBAL_DAILY_LIMIT", msg: "Hệ thống AI đã hết quota ngày, vui lòng quay lại sau." }, origin);
  }

  const mimoApiKey = Deno.env.get("MIMO_API_KEY") ?? Deno.env.get("XIAOMI_MIMO_API_KEY") ?? "";
  if (!mimoApiKey) return json(500, { ok: false, code: "MIMO_API_KEY_MISSING", msg: "Server chưa cấu hình MIMO_API_KEY." }, origin);

  const requestMessages = [
    { role: "system", content: String(config.system_prompt ?? "You are a coding assistant.") },
    ...messages.filter((m) => m.role !== "system"),
  ];

  const maxTokens = Math.max(200, Math.min(Number(body?.max_tokens ?? plan.max_tokens_per_request ?? 1200), Number(plan.max_tokens_per_request ?? 1200)));
  const baseUrl = String(config.mimo_base_url ?? "https://token-plan-sgp.xiaomimimo.com/v1").replace(/\/+$/, "");

  let upstreamData: any = null;
  let status = 200;
  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mimoApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: requestMessages,
        max_tokens: maxTokens,
        temperature: Number.isFinite(Number(body?.temperature)) ? Number(body.temperature) : 0.35,
      }),
    });
    status = upstream.status;
    upstreamData = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      await insertUsage(db, {
        user_id: user.id,
        email,
        plan_code: access.plan_code,
        model,
        mode,
        day_key: dayKey,
        ip_hash: ipHash,
        device_hash: deviceHash,
        ua_hash: uaHash,
        input_chars: inputChars,
        estimated_tokens: estimateTokensFromChars(inputChars),
        request_status: "error",
        error_code: upstreamData?.error?.code ?? `HTTP_${upstream.status}`,
        error_message: upstreamData?.error?.message ?? "MIMO_UPSTREAM_ERROR",
      });
      return json(upstream.status, { ok: false, code: "MIMO_UPSTREAM_ERROR", detail: upstreamData }, origin);
    }

    const answer = String(upstreamData?.choices?.[0]?.message?.content ?? upstreamData?.content?.[0]?.text ?? "");
    const outputChars = answer.length;
    const promptTokens = Number(upstreamData?.usage?.prompt_tokens ?? 0);
    const completionTokens = Number(upstreamData?.usage?.completion_tokens ?? 0);
    const estimatedTokens = Number(upstreamData?.usage?.total_tokens ?? 0) || estimateTokensFromChars(inputChars, outputChars);

    await insertUsage(db, {
      user_id: user.id,
      email,
      plan_code: access.plan_code,
      model,
      mode,
      day_key: dayKey,
      ip_hash: ipHash,
      device_hash: deviceHash,
      ua_hash: uaHash,
      input_chars: inputChars,
      output_chars: outputChars,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_tokens: estimatedTokens,
      request_status: "ok",
      metadata: { upstream_model: upstreamData?.model ?? model },
    });

    return json(200, {
      ok: true,
      model,
      plan_code: access.plan_code,
      answer,
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        estimated_tokens: estimatedTokens,
        daily_used_tokens: usedTokens + estimatedTokens,
        daily_token_limit: userDailyTokenLimit,
      },
      raw: body?.include_raw ? upstreamData : undefined,
    }, origin);
  } catch (e) {
    await insertUsage(db, {
      user_id: user.id,
      email,
      plan_code: access.plan_code,
      model,
      mode,
      day_key: dayKey,
      ip_hash: ipHash,
      device_hash: deviceHash,
      ua_hash: uaHash,
      input_chars: inputChars,
      estimated_tokens: estimateTokensFromChars(inputChars),
      request_status: "error",
      error_code: "FETCH_FAILED",
      error_message: String(e?.message ?? e),
    });
    return json(status >= 400 ? status : 500, { ok: false, code: "FETCH_FAILED", msg: String(e?.message ?? e) }, origin);
  }
});
