import { createClient } from "npm:@supabase/supabase-js@2";

function parseList(raw: string | undefined | null, opts?: { lower?: boolean }): Set<string> {
  const lower = Boolean(opts?.lower);
  const items = String(raw ?? "")
    .replace(/\r/g, "")
    // allow comma, semicolon, or newline separated values
    .split(/[,;\n]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    // strip common copy/paste wrappers: quotes, braces
    .map((s) => s.replace(/^[\s'"{(\[]+/, "").replace(/[\s'"})\]]+$/, ""))
    .filter(Boolean)
    .map((s) => (lower ? s.toLowerCase() : s));

  return new Set(items);
}

function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return parseList(raw, { lower: true });
}

function parseAdminUids(raw: string | undefined | null): Set<string> {
  // UUIDs: normalize to lowercase to avoid case-copy issues.
  return parseList(raw, { lower: true });
}

function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function assertAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; body: { ok: false; code: string; msg: string } }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!supabaseUrl) {
    return { ok: false, status: 500, body: { ok: false, code: "SERVER_MISCONFIG", msg: "Admin verifier not configured" } };
  }

  const apiKey = anonKey || serviceRoleKey;
  if (!apiKey) {
    return { ok: false, status: 500, body: { ok: false, code: "SERVER_MISCONFIG_MISSING_SECRET", msg: "Admin verifier not configured" } };
  }

  if (token && serviceRoleKey && token === serviceRoleKey) {
    return { ok: true };
  }

  if (!token) {
    return { ok: false, status: 401, body: { ok: false, code: "MISSING_TOKEN", msg: "Missing bearer token" } };
  }

  const authed = createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  const user = userData?.user;
  if (userErr || !user) {
    return { ok: false, status: 401, body: { ok: false, code: "INVALID_JWT", msg: "Invalid JWT" } };
  }

  const adminEmails = parseAdminEmails(Deno.env.get("ADMIN_EMAILS"));
  const adminUids = parseAdminUids(Deno.env.get("ADMIN_UIDS") ?? Deno.env.get("ADMIN_USER_IDS"));
  if (!adminEmails.size && !adminUids.size) {
    return {
      ok: false,
      status: 500,
      body: { ok: false, code: "SERVER_MISCONFIG_MISSING_ADMIN", msg: "Missing ADMIN_EMAILS or ADMIN_UIDS secret" },
    };
  }

  const uid = String(user.id ?? "").toLowerCase();
  const uidAllowed = adminUids.size ? adminUids.has(uid) : false;

  const userEmail = String(user.email ?? "").toLowerCase();
  const emailAllowed = userEmail ? adminEmails.has(userEmail) : false;

  const metadataAdmin = user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true;

  // Role check: prefer direct table lookup (users can read their own roles by policy).
  // Fallback to RPC if needed.
  let roleAllowed = false;
  try {
    const { data, error } = await authed
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    roleAllowed = !error && data?.role === "admin";

    if (!roleAllowed) {
      const roleCheck = await authed.rpc("has_role", { user_id: user.id, role: "admin" });
      roleAllowed = !roleCheck.error && roleCheck.data === true;
    }
  } catch {
    // ignore
  }

  if (!uidAllowed && !emailAllowed && !metadataAdmin && !roleAllowed) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        code: "ADMIN_REQUIRED",
        msg: `Admin required (uid=${uid.slice(0, 8)}...)`,
      },
    };
  }

  return { ok: true };
}
