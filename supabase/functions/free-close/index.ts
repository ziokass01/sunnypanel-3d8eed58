import { createClient } from "npm:@supabase/supabase-js@2";

function isAllowedOrigin(origin: string, publicBaseUrl: string) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.host;
    return (
      host === "lovable.dev" ||
      host.endsWith(".lovable.dev") ||
      host.endsWith(".lovable.app") ||
      (publicBaseUrl ? origin === publicBaseUrl : false)
    );
  } catch {
    return false;
  }
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}

function parseCookies(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  raw.split(";").forEach((part) => {
    const [k, ...rest] = part.split("=");
    const key = (k ?? "").trim();
    if (!key) return;
    out[key] = decodeURIComponent(rest.join("=").trim());
  });
  return out;
}

function json(req: Request, data: unknown, status = 200) {
  const origin = req.headers.get("Origin") ?? "";
  const pub = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim().replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  headers["Access-Control-Allow-Origin"] = isAllowedOrigin(origin, pub) ? origin : "null";
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(req, { ok: false }, 405);

  const ip = getClientIp(req);
  const cookies = parseCookies(req);
  const sessId = cookies.fk_sess ?? "";
  if (!sessId) return json(req, { ok: false, msg: "UNAUTHORIZED" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Rate limit close lightly (by plain IP hash isn't available here without crypto; keep minimal)
  const blk = await db.from("blocked_ips").select("blocked_until").eq("ip", ip).maybeSingle();
  const untilIso = blk.data?.blocked_until ?? null;
  const untilMs = untilIso ? new Date(untilIso).getTime() : 0;
  if (untilMs && untilMs > Date.now()) return json(req, { ok: false, msg: "RATE_LIMIT" }, 429);

  await db
    .from("licenses_free_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("session_id", sessId);

  return json(req, { ok: true });
});
