import { resolveCorsOrigin } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function normalizePublicBaseUrl(value?: string | null) {
  const raw = String(value ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) return "";
  return raw;
}

function isBadRuntimeHost(hostOrUrl: string) {
  const raw = String(hostOrUrl || "").toLowerCase();
  return raw.includes("edge-runtime.supabase.com")
    || raw.includes(".functions.supabase.co")
    || raw.includes(".supabase.co/functions")
    || raw.includes("/functions/v1/");
}

function inferBaseUrl(req: Request) {
  const configured = normalizePublicBaseUrl(
    Deno.env.get("FREE_PUBLIC_BASE_URL")
    || Deno.env.get("PUBLIC_BASE_URL")
    || "https://mityangho.id.vn",
  );

  const origin = normalizePublicBaseUrl(req.headers.get("origin"));
  if (origin && !isBadRuntimeHost(origin)) return origin;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const inferred = host ? normalizePublicBaseUrl(`${proto}://${host}`) : "";
  if (inferred && !isBadRuntimeHost(inferred)) return inferred;

  return configured;
}



function getClientIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    ?? "0.0.0.0";
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


function sanitizeNoticeMode(value: unknown): "modal" | "inline" {
  return String(value ?? "").trim().toLowerCase() === "inline" ? "inline" : "modal";
}

function sanitizeExternalUrl(value: unknown): string | null {
  const url = String(value ?? "").trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

function sanitizeDownloadCards(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw: any) => {
      const title = String(raw?.title ?? "").trim() || null;
      const description = String(raw?.description ?? "").trim() || null;
      const url = sanitizeExternalUrl(raw?.url);
      const button_label = String(raw?.button_label ?? "").trim() || null;
      const badge = String(raw?.badge ?? "").trim() || null;
      const icon_url = sanitizeExternalUrl(raw?.icon_url);
      const enabled = Boolean(raw?.enabled ?? true);
      if (!(title || description || url || button_label || badge || icon_url)) return null;
      return { enabled, title, description, url, button_label, badge, icon_url };
    })
    .filter(Boolean);
}

function getVietnamDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((x) => x.type === "year")?.value;
  const month = parts.find((x) => x.type === "month")?.value;
  const day = parts.find((x) => x.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getVietnamDayRangeUtc(day: string) {
  const [year, month, date] = day.split("-").map((v) => Number(v));
  const utcOffsetMs = 7 * 60 * 60 * 1000;
  const startMs = Date.UTC(year, month - 1, date, 0, 0, 0, 0) - utcOffsetMs;
  const nextStartMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startUtcIso: new Date(startMs).toISOString(),
    nextStartUtcIso: new Date(nextStartMs).toISOString(),
  };
}

function normalizeFreeSelectionMode(value: unknown): "none" | "package" | "credit" | "mixed" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "package" || raw === "credit" || raw === "mixed") return raw;
  return "none";
}

function positiveLimit(value: unknown): number | null {
  const n = Math.floor(Number(value ?? 0));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolvePerAppQuotaSettings(sb: any, appCodes: string[], fallbackFp: number, fallbackIp: number) {
  const uniqueCodes = [...new Set(appCodes.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))];
  if (!uniqueCodes.length) return {} as Record<string, { free_daily_limit_per_fingerprint: number; free_daily_limit_per_ip: number }>;

  const { data, error } = await sb
    .from("server_app_settings")
    .select("app_code,free_daily_limit_per_fingerprint,free_daily_limit_per_ip")
    .in("app_code", uniqueCodes);

  if (error) {
    const msg = String(error?.message ?? "").toLowerCase();
    if (!(msg.includes("does not exist") || msg.includes("undefined column") || msg.includes("could not find"))) {
      throw error;
    }
  }

  const rows = Array.isArray(data) ? data : [];

  // Fake Lag public quota must follow Server app -> Fake Lag -> Server key verify limit.
  // Do not use max_devices_per_key/max_ips_per_key as daily Get Key quota: those fields are
  // runtime bind constraints and can be 0/1, which made /free show 0 even when server verify
  // limit was set to 50.
  let fakeLagRule: any = null;
  if (uniqueCodes.includes("fake-lag")) {
    try {
      const ruleRes = await sb
        .from("license_access_rules")
        .select("max_devices_per_key,max_ips_per_key,max_verify_per_key,public_enabled")
        .eq("app_code", "fake-lag")
        .maybeSingle();
      if (!ruleRes.error && ruleRes.data) fakeLagRule = ruleRes.data;
    } catch {
      fakeLagRule = null;
    }
  }

  const map: Record<string, { free_daily_limit_per_fingerprint: number; free_daily_limit_per_ip: number }> = {};
  for (const code of uniqueCodes) {
    const hit = rows.find((row: any) => String(row?.app_code ?? "").trim().toLowerCase() === code);
    if (code === "fake-lag") {
      const verifyLimit = positiveLimit(fakeLagRule?.max_verify_per_key);
      const syncedFpLimit = positiveLimit(hit?.free_daily_limit_per_fingerprint);
      const fallbackFpLimit = positiveLimit(fallbackFp);
      const fpLimit = verifyLimit ?? syncedFpLimit ?? fallbackFpLimit ?? 0;

      // A per-IP cap here is optional. Prefer explicit free_daily_limit_per_ip from server_app_settings;
      // otherwise keep IP unlimited so it cannot hide the real verify limit in the public counter.
      const syncedIpLimit = positiveLimit(hit?.free_daily_limit_per_ip);
      map[code] = {
        free_daily_limit_per_fingerprint: fpLimit,
        free_daily_limit_per_ip: syncedIpLimit ?? 0,
      };
      continue;
    }
    map[code] = {
      free_daily_limit_per_fingerprint: Math.max(0, Number(hit?.free_daily_limit_per_fingerprint ?? fallbackFp)),
      free_daily_limit_per_ip: Math.max(0, Number(hit?.free_daily_limit_per_ip ?? fallbackIp)),
    };
  }
  return map;
}

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const baseUrl = inferBaseUrl(req) || PUBLIC_BASE_URL || "https://mityangho.id.vn";

  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = resolveCorsOrigin(origin, baseUrl || PUBLIC_BASE_URL);
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    // Include x-debug to allow troubleshooting calls from browsers.
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fp, x-debug, x-app-code",
    "Access-Control-Max-Age": "86400",
  };
  const jsonResponse = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return jsonResponse(
      {
        ok: false,
        code: "FREE_NOT_READY",
        msg: "Missing backend secret SUPABASE_SERVICE_ROLE_KEY",
        missing: [!supabaseUrl ? "SUPABASE_URL" : null, !serviceRole ? "SUPABASE_SERVICE_ROLE_KEY" : null].filter(Boolean),
      },
      503,
    );
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const requestedAppCode = String(req.headers.get("x-app-code") ?? "").trim().toLowerCase();

  // Load settings row id=1
  const { data: settings, error: sErr } = await sb
    .from("licenses_free_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) {
    return jsonResponse({ ok: false, code: "FREE_NOT_READY", msg: sErr.message }, 503);
  }

  const rawOutbound = settings?.free_outbound_url;
  const free_outbound_url = String(rawOutbound ?? "").trim() || "https://link4m.com/PkY7X";
  const rawOutboundPass2 = (settings as any)?.free_outbound_url_pass2;
  const free_outbound_url_pass2 = String(rawOutboundPass2 ?? "").trim() || free_outbound_url;
  const free_enabled = Boolean(settings?.free_enabled ?? true);
  const free_disabled_message = settings?.free_disabled_message ?? "Trang GetKey đang tạm đóng.";
  const free_min_delay_seconds = Math.max(0, Number(settings?.free_min_delay_seconds ?? 0));
  const free_min_delay_seconds_pass2 = Math.max(0, Number((settings as any)?.free_min_delay_seconds_pass2 ?? free_min_delay_seconds));
  const free_gate_antibypass_enabled = Boolean((settings as any)?.free_gate_antibypass_enabled ?? false);
  const free_gate_antibypass_seconds = Math.max(0, Number((settings as any)?.free_gate_antibypass_seconds ?? 0));
  const free_link4m_rotate_days = Math.max(1, Number((settings as any)?.free_link4m_rotate_days ?? 7));
  const free_session_waiting_limit = Math.max(1, Number((settings as any)?.free_session_waiting_limit ?? 2));
  const free_link4m_rotate_nonce_pass1 = Math.max(0, Number((settings as any)?.free_link4m_rotate_nonce_pass1 ?? 0));
  const free_link4m_rotate_nonce_pass2 = Math.max(0, Number((settings as any)?.free_link4m_rotate_nonce_pass2 ?? 0));
  const free_return_seconds = Math.max(10, Number(settings?.free_return_seconds ?? 10));
  const free_daily_limit_per_fingerprint = Math.max(0, Number(settings?.free_daily_limit_per_fingerprint ?? 1));
  const free_daily_limit_per_ip = Math.max(0, Number((settings as any)?.free_daily_limit_per_ip ?? 0));
  const free_gate_require_ip_match = Boolean((settings as any)?.free_gate_require_ip_match ?? true);
  const free_gate_require_ua_match = Boolean((settings as any)?.free_gate_require_ua_match ?? true);
  const free_require_link4m_referrer = Boolean(settings?.free_require_link4m_referrer ?? false);
  const free_public_note = String(settings?.free_public_note ?? "");
  const free_public_links = Array.isArray(settings?.free_public_links) ? settings?.free_public_links : [];
  const free_download_enabled = Boolean((settings as any)?.free_download_enabled ?? false);
  const free_download_name = String((settings as any)?.free_download_name ?? "").trim() || null;
  const free_download_info = String((settings as any)?.free_download_info ?? "").trim() || null;
  const free_download_url = String((settings as any)?.free_download_url ?? "").trim() || null;
  const free_download_size = Math.max(0, Number((settings as any)?.free_download_size ?? 0)) || null;
  const free_notice_title = String((settings as any)?.free_notice_title ?? "").trim() || null;
  const free_notice_content = String((settings as any)?.free_notice_content ?? "").trim() || null;
  const free_notice_enabled = Boolean((settings as any)?.free_notice_enabled ?? false) && Boolean(free_notice_content);
  const free_notice_mode = sanitizeNoticeMode((settings as any)?.free_notice_mode);
  const free_notice_closable = Boolean((settings as any)?.free_notice_closable ?? true);
  const free_notice_show_once = Boolean((settings as any)?.free_notice_show_once ?? false);
  const free_external_download_url = sanitizeExternalUrl((settings as any)?.free_external_download_url);
  const free_external_download_enabled = Boolean((settings as any)?.free_external_download_enabled ?? false) && Boolean(free_external_download_url);
  const free_external_download_title = String((settings as any)?.free_external_download_title ?? "").trim() || null;
  const free_external_download_description = String((settings as any)?.free_external_download_description ?? "").trim() || null;
  const free_external_download_button_label = String((settings as any)?.free_external_download_button_label ?? "").trim() || null;
  const free_external_download_badge = String((settings as any)?.free_external_download_badge ?? "").trim() || null;
  const free_external_download_icon_url = sanitizeExternalUrl((settings as any)?.free_external_download_icon_url);
let free_download_cards = sanitizeDownloadCards((settings as any)?.free_download_cards);
if (!free_download_cards.length) {
  const legacyCards: any[] = [];
  if (free_download_enabled && free_download_url) {
    legacyCards.push({
      enabled: true,
      title: free_download_name ?? "Tệp tải xuống",
      description: free_download_info,
      url: free_download_url,
      button_label: "Mở liên kết",
      badge: "Link 1",
      icon_url: null,
    });
  }
  if (free_external_download_enabled && free_external_download_url) {
    legacyCards.push({
      enabled: true,
      title: free_external_download_title ?? "Liên kết tải thêm",
      description: free_external_download_description,
      url: free_external_download_url,
      button_label: free_external_download_button_label,
      badge: free_external_download_badge,
      icon_url: free_external_download_icon_url,
    });
  }
  free_download_cards = legacyCards;
}


  // Load enabled key types
  let keyTypesQuery = sb
    .from("licenses_free_key_types")
    .select("*")
    .eq("enabled", true);
  if (requestedAppCode) keyTypesQuery = keyTypesQuery.eq("app_code", requestedAppCode);
  const { data: keyTypes, error: kErr } = await keyTypesQuery.order("sort_order", { ascending: true });

  if (kErr) {
    return jsonResponse({ ok: false, code: "FREE_NOT_READY", msg: kErr.message }, 503);
  }

  const appCodes = [...new Set((keyTypes ?? []).map((k: any) => String(k?.app_code ?? "free-fire").trim().toLowerCase() || "free-fire"))];
  let findDumpsRewards: Record<string, any> = {};
  if ((requestedAppCode && requestedAppCode === "find-dumps") || appCodes.includes("find-dumps")) {
    const { data: rewardRows, error: rewardErr } = await sb
      .from("server_app_reward_packages")
      .select("package_code,title,reward_mode,plan_code,soft_credit_amount,premium_credit_amount,entitlement_days,entitlement_seconds")
      .eq("app_code", "find-dumps")
      .eq("enabled", true);
    if (rewardErr) {
      const msg = String(rewardErr?.message ?? "").toLowerCase();
      if (!(msg.includes("does not exist") || msg.includes("undefined column") || msg.includes("could not find"))) {
        throw rewardErr;
      }
    }
    for (const row of (rewardRows ?? []) as any[]) {
      const code = String(row?.package_code ?? "").trim().toLowerCase();
      if (!code) continue;
      const rewardMode = String(row?.reward_mode ?? "").trim().toLowerCase();
      findDumpsRewards[code] = {
        code,
        label: String(row?.title ?? code).trim() || code,
        reward_mode: rewardMode,
        plan_code: String(row?.plan_code ?? "").trim() || null,
        soft_credit_amount: Number(row?.soft_credit_amount ?? 0),
        premium_credit_amount: Number(row?.premium_credit_amount ?? 0),
        entitlement_days: Math.max(0, Number(row?.entitlement_days ?? 0)),
        entitlement_seconds: Math.max(0, Number(row?.entitlement_seconds ?? 0)),
        wallet_kind: rewardMode === "premium_credit" ? "vip" : (rewardMode === "soft_credit" ? "normal" : null),
      };
    }
  }
  const appQuotaSettings = await resolvePerAppQuotaSettings(sb, requestedAppCode ? [requestedAppCode] : appCodes, free_daily_limit_per_fingerprint, free_daily_limit_per_ip);

  // FREE flow no longer uses Turnstile. Reset-key keeps its own Turnstile flow.
  const turnstile_enabled = false;
  const TURNSTILE_SITE_KEY_RAW = "";

  const missing: string[] = [];
  if (!free_outbound_url) missing.push("free_outbound_url");
  if (!keyTypes?.length) missing.push("no_key_types_enabled");
  if (!baseUrl) missing.push("public_base_url");

  const destination_gate_url = baseUrl ? `${baseUrl}/free/gate` : "/free/gate";

  const ip = getClientIp(req);
  const ipHash = await sha256Hex(ip);
  const fpRaw = String(req.headers.get("x-fp") ?? "").trim();

  const dayKey = getVietnamDateKey();
  const dayRange = getVietnamDayRangeUtc(dayKey);
  const fpHash = fpRaw ? await sha256Hex(fpRaw) : "";

  const quotaRows: any[] = [];
  if (requestedAppCode) {
    let fpUsedToday = 0;
    if (fpHash) {
      const fpQuotaRes = await sb
        .from("licenses_free_issues")
        .select("issue_id", { count: "exact", head: true })
        .gte("created_at", dayRange.startUtcIso)
        .lt("created_at", dayRange.nextStartUtcIso)
        .eq("fingerprint_hash", fpHash)
        .eq("app_code", requestedAppCode);
      fpUsedToday = Number(fpQuotaRes.count ?? 0);
    }

    const ipQuotaRes = await sb
      .from("licenses_free_issues")
      .select("issue_id", { count: "exact", head: true })
      .gte("created_at", dayRange.startUtcIso)
      .lt("created_at", dayRange.nextStartUtcIso)
      .eq("ip_hash", ipHash)
      .eq("app_code", requestedAppCode);

    quotaRows.push({ app_code: requestedAppCode, fp_used: fpUsedToday, ip_used: Number(ipQuotaRes.count ?? 0) });
  } else {
    let issueQuery = sb
      .from("licenses_free_issues")
      .select("app_code")
      .gte("created_at", dayRange.startUtcIso)
      .lt("created_at", dayRange.nextStartUtcIso)
      .eq("ip_hash", ipHash);
    const { data: ipRows } = await issueQuery;
    const ipCountByApp: Record<string, number> = {};
    for (const row of ipRows ?? []) {
      const appCode = String((row as any)?.app_code ?? "free-fire").trim().toLowerCase() || "free-fire";
      ipCountByApp[appCode] = Number(ipCountByApp[appCode] ?? 0) + 1;
    }

    const fpCountByApp: Record<string, number> = {};
    if (fpHash) {
      const { data: fpRows } = await sb
        .from("licenses_free_issues")
        .select("app_code")
        .gte("created_at", dayRange.startUtcIso)
        .lt("created_at", dayRange.nextStartUtcIso)
        .eq("fingerprint_hash", fpHash);
      for (const row of fpRows ?? []) {
        const appCode = String((row as any)?.app_code ?? "free-fire").trim().toLowerCase() || "free-fire";
        fpCountByApp[appCode] = Number(fpCountByApp[appCode] ?? 0) + 1;
      }
    }

    for (const appCode of appCodes) {
      quotaRows.push({ app_code: appCode, fp_used: Number(fpCountByApp[appCode] ?? 0), ip_used: Number(ipCountByApp[appCode] ?? 0) });
    }
  }

  const quotaByApp: Record<string, { used_fingerprint: number; used_ip: number; remaining_fingerprint: number | null; remaining_ip: number | null; remaining_today: number | null; free_daily_limit_per_fingerprint: number; free_daily_limit_per_ip: number; }> = {};
  for (const row of quotaRows) {
    const appCode = String(row.app_code ?? "free-fire").trim().toLowerCase() || "free-fire";
    const limits = appQuotaSettings[appCode] ?? {
      free_daily_limit_per_fingerprint,
      free_daily_limit_per_ip,
    };
    const fpRemaining = limits.free_daily_limit_per_fingerprint <= 0
      ? null
      : Math.max(0, limits.free_daily_limit_per_fingerprint - Number(row.fp_used ?? 0));
    const ipRemaining = limits.free_daily_limit_per_ip <= 0
      ? null
      : Math.max(0, limits.free_daily_limit_per_ip - Number(row.ip_used ?? 0));
    const remainingToday = [fpRemaining, ipRemaining].filter((v) => v !== null).reduce((m, v) => Math.min(m, Number(v)), Number.POSITIVE_INFINITY);
    quotaByApp[appCode] = {
      used_fingerprint: Number(row.fp_used ?? 0),
      used_ip: Number(row.ip_used ?? 0),
      remaining_fingerprint: fpRemaining,
      remaining_ip: ipRemaining,
      remaining_today: Number.isFinite(remainingToday) ? remainingToday : null,
      free_daily_limit_per_fingerprint: limits.free_daily_limit_per_fingerprint,
      free_daily_limit_per_ip: limits.free_daily_limit_per_ip,
    };
  }

  const requestedQuota = requestedAppCode ? quotaByApp[requestedAppCode] ?? null : null;

  const body = {
    ok: true,

    // Diagnostics for browser CORS / project mismatch debugging
    request_origin: origin || null,
    allow_origin: allowOrigin || null,

    public_base_url: baseUrl || null,
    destination_gate_url,

    free_enabled,
    free_disabled_message,
    free_outbound_url,
    free_min_delay_seconds,
    free_min_delay_seconds_pass2,
    free_link4m_rotate_days,
    free_session_waiting_limit,
    free_link4m_rotate_nonce_pass1,
    free_link4m_rotate_nonce_pass2,
    free_outbound_url_pass2,
    free_gate_antibypass_enabled,
    free_gate_antibypass_seconds,
    free_return_seconds,
    free_daily_limit_per_fingerprint: requestedQuota?.free_daily_limit_per_fingerprint ?? free_daily_limit_per_fingerprint,
    free_daily_limit_per_ip: requestedQuota?.free_daily_limit_per_ip ?? free_daily_limit_per_ip,
    free_gate_require_ip_match,
    free_gate_require_ua_match,
    free_require_link4m_referrer,
    free_quota_timezone: "Asia/Ho_Chi_Minh",
    free_quota_day_key: dayKey,
    free_quota_remaining_today: requestedQuota?.remaining_today ?? null,
    free_quota_by_app: quotaByApp,

    free_public_note,
    free_public_links,
    free_download_enabled,
    free_download_name,
    free_download_info,
    free_download_url,
    free_download_size,
    free_download_cards,
    free_notice: {
      enabled: free_notice_enabled,
      title: free_notice_title,
      content: free_notice_content,
      mode: free_notice_mode,
      closable: free_notice_closable,
      showOnce: free_notice_show_once,
    },
    free_external_download: {
      enabled: free_external_download_enabled,
      title: free_external_download_title,
      description: free_external_download_description,
      url: free_external_download_url,
      button_label: free_external_download_button_label,
      badge: free_external_download_badge,
      icon_url: free_external_download_icon_url,
    },

    find_dumps_rewards: findDumpsRewards,

    key_types: (keyTypes ?? []).map((k: any) => ({
      code: k.code,
      label: k.label,
      kind: k.kind,
      value: k.value,
      duration_seconds: k.duration_seconds,
      requires_double_gate: Boolean(k?.requires_double_gate ?? false),
      app_code: k?.app_code ?? "free-fire",
      app_label: k?.app_label ?? "Free Fire",
      key_signature: k?.key_signature ?? "FF",
      allow_reset: Boolean(k?.allow_reset ?? true),
      free_selection_mode: normalizeFreeSelectionMode(k?.free_selection_mode),
      free_selection_expand: Boolean(k?.free_selection_expand ?? false),
      default_package_code: String(k?.default_package_code ?? "").trim() || null,
      default_credit_code: String(k?.default_credit_code ?? "").trim() || null,
      default_wallet_kind: String(k?.default_wallet_kind ?? "").trim() || null,
    })),

    turnstile_enabled,
    turnstile_site_key: null,

    missing,
  };

  return jsonResponse(body, 200);
  } catch (e) {
    console.error("free-config unexpected error", e);
    return jsonResponse(
      { ok: false, code: "INTERNAL", error: "Internal server error" },
      500,
    );
  }

});
