import { createClient } from "npm:@supabase/supabase-js@2";

function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function assertAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; body: { ok: false; code: string; msg: string } }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!supabaseUrl || !token) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  const apiKey = anonKey || serviceRoleKey;
  if (!apiKey) {
    return { ok: false, status: 500, body: { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Admin verifier not configured" } };
  }

  const authed = createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  const adminEmails = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  const userEmail = String(user.email ?? "").toLowerCase();
  const emailAllowed = userEmail ? adminEmails.has(userEmail) : false;

  const metadataAdmin = user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true;

  const roleCheck = await authed.rpc("has_role", { _user_id: user.id, _role: "admin" });
  const roleAllowed = !roleCheck.error && roleCheck.data === true;

  if (!emailAllowed && !metadataAdmin && !roleAllowed) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Admin required" } };
  }

  return { ok: true };
}
