import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { assertAdmin } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";
import {
  getClientIntegrationByAccount,
  normalizeAllowedOrigins,
  upsertClientIntegration,
} from "../_shared/rent_client_integrations.ts";

function inferBaseUrl(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) return origin;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return "https://mityangho.id.vn";
}

function json(req: Request, publicBaseUrl: string, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...buildCorsHeaders(req, publicBaseUrl, "POST,OPTIONS"),
      "Content-Type": "application/json",
    },
  });
}

async function logAccountEvent(sb: any, payload: {
  account_id: string;
  action: string;
  result?: string | null;
  detail?: Record<string, unknown> | null;
}) {
  try {
    await sb.schema("rent").from("key_audit_logs").insert({
      account_id: payload.account_id,
      key_id: null,
      action: payload.action,
      result: payload.result ?? null,
      device_id: null,
      detail: payload.detail ?? {},
    });
  } catch {
    // ignore audit errors
  }
}

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? inferBaseUrl(req);
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(req, publicBaseUrl, admin.body, admin.status);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return json(req, publicBaseUrl, { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Missing backend secrets" }, 503);
  }

  const sb = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = String(body?.action ?? "").trim();

  try {
    if (action === "get") {
      const parsed = z.object({ action: z.literal("get"), account_id: z.string().uuid() }).parse(body);
      const integration = await getClientIntegrationByAccount(sb, parsed.account_id);
      return json(req, publicBaseUrl, { ok: true, integration });
    }

    if (action === "upsert") {
      const parsed = z.object({
        action: z.literal("upsert"),
        account_id: z.string().uuid(),
        client_code: z.string().min(3).max(64),
        label: z.string().min(1).max(200),
        allowed_origins: z.array(z.string()).min(1).max(30),
        rate_limit_per_minute: z.number().int().min(10).max(100000).default(60),
        is_enabled: z.boolean().default(true),
        note: z.string().max(2000).nullable().optional(),
      }).parse(body);

      const integration = await upsertClientIntegration(sb, {
        account_id: parsed.account_id,
        client_code: parsed.client_code,
        label: parsed.label,
        allowed_origins: normalizeAllowedOrigins(parsed.allowed_origins),
        rate_limit_per_minute: parsed.rate_limit_per_minute,
        is_enabled: parsed.is_enabled,
        note: parsed.note ?? null,
      });

      await logAccountEvent(sb, {
        account_id: parsed.account_id,
        action: "upsert_client_integration",
        result: "ok",
        detail: {
          client_code: integration.client_code,
          allowed_origins: integration.allowed_origins,
          rate_limit_per_minute: integration.rate_limit_per_minute,
          is_enabled: integration.is_enabled,
        },
      });

      return json(req, publicBaseUrl, { ok: true, integration });
    }

    if (action === "disable") {
      const parsed = z.object({ action: z.literal("disable"), account_id: z.string().uuid() }).parse(body);
      const integration = await upsertClientIntegration(sb, {
        account_id: parsed.account_id,
        client_code: "disabled_client",
        label: "Disabled integration",
        allowed_origins: ["https://mityangho.id.vn"],
        rate_limit_per_minute: 60,
        is_enabled: false,
        note: "disabled by admin-rent-integrations",
      });

      await logAccountEvent(sb, {
        account_id: parsed.account_id,
        action: "disable_client_integration",
        result: "ok",
        detail: { integration_id: integration.id },
      });

      return json(req, publicBaseUrl, { ok: true, integration });
    }

    return json(req, publicBaseUrl, { ok: false, code: "BAD_ACTION", msg: "Unknown action" }, 400);
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (message === "CLIENT_INTEGRATIONS_SCHEMA_MISSING") {
      return json(req, publicBaseUrl, { ok: false, code: "CLIENT_INTEGRATIONS_SCHEMA_MISSING", msg: "Missing rent.client_integrations schema" }, 409);
    }
    if (message === "INVALID_CLIENT_CODE") {
      return json(req, publicBaseUrl, { ok: false, code: "INVALID_CLIENT_CODE", msg: "Client code không hợp lệ" }, 400);
    }
    if (message === "INVALID_CLIENT_LABEL") {
      return json(req, publicBaseUrl, { ok: false, code: "INVALID_CLIENT_LABEL", msg: "Thiếu tên hiển thị" }, 400);
    }
    if (message === "INVALID_ALLOWED_ORIGINS") {
      return json(req, publicBaseUrl, { ok: false, code: "INVALID_ALLOWED_ORIGINS", msg: "Cần ít nhất một origin" }, 400);
    }
    if (message === "DUPLICATE_CLIENT_CODE") {
      return json(req, publicBaseUrl, { ok: false, code: "DUPLICATE_CLIENT_CODE", msg: "Client code bị trùng" }, 409);
    }
    return json(req, publicBaseUrl, { ok: false, code: "ERROR", msg: message }, 400);
  }
});
