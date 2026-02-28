import { createClient } from "npm:@supabase/supabase-js@2";

export type AuthResult =
  | { ok: true; user: { id: string; email: string | null } }
  | { ok: false; status: number; body: { ok: false; code: string; msg: string } };

function parseBearer(req: Request): string {
  const authHeader = req.headers.get("Authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
}

export async function assertTenant(req: Request): Promise<AuthResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const token = parseBearer(req);

  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, body: { ok: false, code: "SERVER_MISCONFIG", msg: "Missing SUPABASE_URL / SUPABASE_ANON_KEY" } };
  }

  if (!token) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Tenant auth required" } };
  }

  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await authed.auth.getUser(token);
  const user = data?.user;
  if (error || !user) {
    return { ok: false, status: 401, body: { ok: false, code: "UNAUTHORIZED", msg: "Tenant auth required" } };
  }

  const roleCheck = await authed.rpc("has_role", { _user_id: user.id, _role: "tenant" });
  const isTenant = !roleCheck.error && roleCheck.data === true;
  if (!isTenant) {
    return { ok: false, status: 403, body: { ok: false, code: "FORBIDDEN", msg: "Tenant role required" } };
  }

  return { ok: true, user: { id: user.id, email: user.email ?? null } };
}
