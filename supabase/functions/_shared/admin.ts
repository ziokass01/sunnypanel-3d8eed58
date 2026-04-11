import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveCorsOrigin } from "./cors.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Service-role client for DB operations inside Edge Functions.
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
 */
export function createAdminClient() {
  const supabaseUrl = mustEnv("SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "sunnypanel-edge-admin" } },
  });
}

export function json(status: number, body: unknown, origin?: string | null) {
  const allowOrigin = resolveCorsOrigin(String(origin ?? ""), Deno.env.get("PUBLIC_BASE_URL") ?? "");
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": allowOrigin,
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-fp, x-admin-key",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-max-age": "86400",
      "vary": "origin",
    },
  });
}

function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function assertAdmin(
  req: Request,
): Promise<{ ok: true } | { ok: false; status: number; body: { ok: false; code: string; msg: string } }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const runtimeOpsAdminKey = Deno.env.get("RUNTIME_OPS_ADMIN_KEY") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : authHeader.trim();

  const apiKeyHeader = (req.headers.get("apikey") ?? "").trim();
  const adminKeyHeader = (req.headers.get("x-admin-key") ?? "").trim();

  const tokenCandidates = [bearerToken, apiKeyHeader, adminKeyHeader].filter(Boolean);

  if (!supabaseUrl) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  const directAdminKeys = [runtimeOpsAdminKey, serviceRoleKey].filter(Boolean);

  if (tokenCandidates.some((token) => directAdminKeys.includes(token))) {
    return { ok: true };
  }

  const token = tokenCandidates[0] ?? "";
  if (!token) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  const apiKey = anonKey || serviceRoleKey;
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Admin verifier not configured" },
    };
  }

  const authed = createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  const adminEmails = parseAdminEmails(Deno.env.get("ADMIN_EMAILS") ?? Deno.env.get("ADMIN_EMAIL") ?? Deno.env.get("ADMIN_MAIL") ?? Deno.env.get("ADMIN_EMAIL_SECRET"));
  const userEmail = String(user.email ?? "").toLowerCase();
  const emailAllowed = userEmail ? adminEmails.has(userEmail) : false;
  const metadataAdmin = user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true;

  const roleCheck = await authed.rpc("has_role", { _user_id: user.id, _role: "admin" });
  let roleAllowed = !roleCheck.error && roleCheck.data === true;

  if (emailAllowed && !roleAllowed && serviceRoleKey) {
    try {
      const adminDb = createAdminClient();
      const seeded = await adminDb
        .from("user_roles")
        .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
      if (!seeded.error) roleAllowed = true;
    } catch {
      // ignore bootstrap failures and continue with email-based allowance below
    }
  }

  if (!emailAllowed && !metadataAdmin && !roleAllowed) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  return { ok: true };
}
