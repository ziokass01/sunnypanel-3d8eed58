import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdminCtx = {
  ok: true;
  user: { id: string; email?: string | null };
};
type AdminFail = {
  ok: false;
  status: number;
  body: { ok: false; code: string; msg: string; details?: any };
};

function parseBearer(req: Request): string {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("Missing Bearer token.");
  const token = m[1]?.trim();
  if (!token) throw new Error("Missing Bearer token.");
  return token;
}

function looksLikeJwt(key: string): boolean {
  // Legacy anon key looks like a JWT (three dot-separated segments)
  return /^eyJ[\w-]*\.[\w-]*\.[\w-]*$/.test(key);
}

function looksLikePublishable(key: string): boolean {
  // Newer publishable keys are prefixed (sb_publishable_) and should be reasonably long
  return key.startsWith("sb_publishable_") && key.length >= 40;
}

function pickSupabaseKey(opts: { legacyAnon?: string | null; publishable?: string | null }): string | null {
  const legacy = (opts.legacyAnon || "").trim();
  const pub = (opts.publishable || "").trim();

  if (legacy && looksLikeJwt(legacy)) return legacy;
  if (pub && looksLikePublishable(pub)) return pub;

  // If values exist but don't match heuristics, still try legacy first (less brittle)
  if (legacy) return legacy;
  if (pub) return pub;
  return null;
}

function parseList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function projectRefFromUrl(url: string): string {
  // https://xxxx.supabase.co -> xxxx
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co\b/i);
  return m?.[1] ?? "";
}

export async function assertAdmin(req: Request): Promise<AdminCtx | AdminFail> {
  const supabaseUrl =
  Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("VITE_SUPABASE_URL") ||
  Deno.env.get("ADMIN_SUPABASE_URL") ||
  "";

// Prefer legacy JWT-style anon key (most compatible) and fall back to publishable key.
const legacyAnon =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("VITE_SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_ANON_KEY_LEGACY") ||
  "";

const publishable =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ||
  "";

const anonKey = pickSupabaseKey({ legacyAnon, publishable }) || "";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      status: 500,
      body: {
        ok: false,
        code: "SERVER_MISCONFIG",
        msg: "Missing SUPABASE_URL / SUPABASE_KEY in Edge Functions environment.",
        details: { projectRef: projectRefFromUrl(supabaseUrl) },
      },
    };
  }

  const token = parseBearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      body: { ok: false, code: "ADMIN_AUTH_REQUIRED", msg: "Missing Bearer token." },
    };
  }

  // 1) Validate JWT and get user (always do this with anon key; service role also works but anon is enough)
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    },
  });

  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  const user = userData?.user;

  if (userErr || !user) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        code: "JWT_INVALID",
        msg: "JWT invalid/expired (or Supabase project mismatch between frontend and Edge Functions).",
        details: { projectRef: projectRefFromUrl(supabaseUrl) },
      },
    };
  }

  // 2) Allowlist via env
  const adminUids = parseList(Deno.env.get("ADMIN_UIDS"));
  const adminEmails = parseList(Deno.env.get("ADMIN_EMAILS")).map((s) => s.toLowerCase());

  const uidAllowed = adminUids.includes(user.id);
  const emailAllowed = !!user.email && adminEmails.includes(user.email.toLowerCase());

  if (uidAllowed || emailAllowed) {
    return { ok: true, user: { id: user.id, email: user.email } };
  }

  // 3) Role check in DB
  // Prefer RPC has_role (security definer) if available
  try {
    const { data: isAdmin, error: rpcErr } = await authed.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!rpcErr && isAdmin === true) {
      return { ok: true, user: { id: user.id, email: user.email } };
    }
  } catch (_e) {
    // ignore and fallback below
  }

  // Fallback: direct table lookup (prefer service role to avoid RLS issues)
  const dbClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : authed;

  const { data: roleRow, error: roleErr } = await dbClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleErr && roleRow?.role === "admin") {
    return { ok: true, user: { id: user.id, email: user.email } };
  }

  return {
    ok: false,
    status: 401,
    body: {
      ok: false,
      code: "ADMIN_AUTH_REQUIRED",
      msg:
        "Admin permission required. Add your email/uid to ADMIN_EMAILS/ADMIN_UIDS, or insert role 'admin' into public.user_roles (and make sure migrations/policies are applied).",
      details: { uid: user.id, email: user.email, projectRef: projectRefFromUrl(supabaseUrl) },
    },
  };
}
