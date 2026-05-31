import { createClient } from "npm:@supabase/supabase-js@2";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

const PROVIDERS = new Set(["custom", "link4m", "traffic68", "nhapma", "layma", "none"]);
const PASS_SCOPES = new Set(["both", "pass1", "pass2"]);
const MODES = new Set(["round_robin", "random"]);

function trim(value: unknown, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}

function providerName(provider: string) {
  if (provider === "link4m") return "Link4M";
  if (provider === "traffic68") return "Traffic68";
  if (provider === "nhapma") return "NhapMa";
  if (provider === "layma") return "LayMa";
  if (provider === "none") return "Không rút gọn";
  return "Custom";
}

function defaultApiFor(provider: string) {
  if (provider === "link4m") return "https://link4m.co/api-shorten/v2";
  if (provider === "traffic68") return "https://traffic68.com/api/quicklink/st";
  if (provider === "nhapma") return "https://service.nhapma.com/api";
  if (provider === "layma") return "https://api.layma.net/api/admin/shortlink/quicklink";
  return "";
}

function parseLegacyApi(rawApi: unknown, rawToken: unknown = "") {
  const api = trim(rawApi, 4096);
  const token = trim(rawToken, 4096);
  if (!api) return { api, token };
  try {
    const u = new URL(api);
    const extracted = token || u.searchParams.get("api") || u.searchParams.get("token") || u.searchParams.get("tokenUser") || "";
    const hasTargetUrl = u.searchParams.has("url") || u.searchParams.has("u") || u.searchParams.has("link") || u.searchParams.has("target");
    const hasCredential = u.searchParams.has("api") || u.searchParams.has("token") || u.searchParams.has("tokenUser");
    if (hasTargetUrl || hasCredential) return { api: `${u.origin}${u.pathname}`, token: trim(extracted, 4096) };
  } catch {
    // Keep invalid/manual text unchanged so the UI can show a clear validation error.
  }
  return { api, token };
}

function normalizeProvider(row: any, index: number) {
  const provider = PROVIDERS.has(trim(row?.provider, 32).toLowerCase()) ? trim(row?.provider, 32).toLowerCase() : "custom";
  const pass_scope = PASS_SCOPES.has(trim(row?.pass_scope, 16).toLowerCase()) ? trim(row?.pass_scope, 16).toLowerCase() : "both";
  const name = trim(row?.name, 128) || providerName(provider);
  const parsed = parseLegacyApi(row?.api_url_template, row?.api_token_secret);
  const api_token_secret = parsed.token;
  const api_url_template = parsed.api || defaultApiFor(provider);
  const note = trim(row?.note, 512) || null;
  const enabled = row?.enabled !== false;
  const sort_order = (index + 1) * 10;

  if (provider !== "none" && enabled) {
    if (!api_url_template) throw new Error(`MISSING_API_ROW_${index + 1}`);
    if (!/^https?:\/\//i.test(api_url_template)) throw new Error(`API_MUST_BE_HTTPS_ROW_${index + 1}`);
    if (!api_token_secret) throw new Error(`MISSING_TOKEN_ROW_${index + 1}`);
  }

  return {
    id: isUuid(row?.id) ? String(row.id) : null,
    name,
    provider,
    api_token_secret: provider === "none" ? null : api_token_secret,
    api_url_template: provider === "none" ? null : api_url_template,
    enabled,
    pass_scope,
    sort_order,
    note,
  };
}

Deno.serve(async (req) => {
  const PUBLIC_BASE_URL = Deno.env.get("PUBLIC_BASE_URL") ?? "";
  const headers = buildCorsHeaders(req, PUBLIC_BASE_URL, "POST,OPTIONS");
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });

  if (req.method === "OPTIONS") return handleOptions(req, PUBLIC_BASE_URL, "POST,OPTIONS");
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(admin.body, admin.status);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) return json({ ok: false, code: "SERVER_MISCONFIG", msg: "SERVER_MISCONFIG" }, 500);

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as Record<string, any>;
  const action = trim(body.action, 32).toLowerCase() || "list";

  if (action === "list") {
    const providers = await db
      .from("licenses_free_shortlink_providers")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (providers.error) {
      const msg = String(providers.error.message || "");
      const code = /schema cache|could not find|does not exist/i.test(msg) ? "DB_MIGRATION_REQUIRED" : "PROVIDERS_LOAD_FAILED";
      return json({ ok: false, code, msg }, 500);
    }

    const settings = await db
      .from("licenses_free_settings")
      .select("free_shortlink_mode,free_gate_token_life_seconds")
      .eq("id", 1)
      .maybeSingle();

    return json({
      ok: true,
      providers: providers.data ?? [],
      settings: settings.data ?? null,
    });
  }

  if (action === "save") {
    const rows = Array.isArray(body.providers) ? body.providers : [];
    const cleaned = rows
      .map((row, index) => normalizeProvider(row, index))
      .filter((row) => row.provider === "none" || row.name || row.api_token_secret || row.api_url_template);

    for (const row of cleaned) {
      const payload = {
        name: row.name,
        provider: row.provider,
        api_token_secret: row.api_token_secret,
        api_url_template: row.api_url_template,
        enabled: row.enabled,
        pass_scope: row.pass_scope,
        sort_order: row.sort_order,
        note: row.note,
      };

      const result = row.id
        ? await db.from("licenses_free_shortlink_providers").update(payload).eq("id", row.id)
        : await db.from("licenses_free_shortlink_providers").insert(payload);
      if (result.error) {
        const msg = String(result.error.message || "");
        const code = /schema cache|could not find|does not exist/i.test(msg) ? "DB_MIGRATION_REQUIRED" : "PROVIDER_SAVE_FAILED";
        return json({ ok: false, code, msg }, 500);
      }
    }

    const mode = MODES.has(trim(body.free_shortlink_mode, 32).toLowerCase()) ? trim(body.free_shortlink_mode, 32).toLowerCase() : "round_robin";
    const life = Math.max(60, Math.min(1800, Math.floor(Number(body.free_gate_token_life_seconds ?? 600) || 600)));
    const settings = await db
      .from("licenses_free_settings")
      .upsert({ id: 1, free_shortlink_mode: mode, free_gate_token_life_seconds: life }, { onConflict: "id" });
    if (settings.error) {
      const msg = String(settings.error.message || "");
      const code = /schema cache|could not find|does not exist/i.test(msg) ? "DB_MIGRATION_REQUIRED" : "SETTINGS_SAVE_FAILED";
      return json({ ok: false, code, msg }, 500);
    }

    return json({ ok: true, saved: cleaned.length });
  }

  if (action === "delete") {
    const id = trim(body.id, 80);
    if (!isUuid(id)) return json({ ok: false, code: "BAD_PROVIDER_ID", msg: "BAD_PROVIDER_ID" }, 400);
    const deleted = await db.from("licenses_free_shortlink_providers").delete().eq("id", id);
    if (deleted.error) return json({ ok: false, code: "PROVIDER_DELETE_FAILED", msg: deleted.error.message }, 500);
    return json({ ok: true });
  }

  return json({ ok: false, code: "BAD_ACTION", msg: "BAD_ACTION" }, 400);
});
