import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const baseCorsHeaders: Record<string, string> = {
  // NOTE: Access-Control-Allow-Origin is set per-request after validating Origin.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  // Helps caches/CDNs keep responses correct per origin
  Vary: "Origin",
};

function parseAllowedOrigins(): string[] {
  // Optional comma-separated list: "https://admin.example.com,https://staging.example.com"
  const raw = (Deno.env.get("ALLOWED_ORIGINS") ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin: string, extraAllowed: string[]) {
  // Default allowlist for Lovable preview/published + local dev + production domains
  const o = origin.toLowerCase();
  if (o.startsWith("http://localhost:")) return true;
  if (o === "http://localhost") return true;
  if (o.endsWith(".lovable.app")) return true;

  const exactAllowed = new Set([
    "https://mityangho.id.vn",
    "https://www.mityangho.id.vn",
    "https://sunnypanel.lovable.app",
  ]);
  if (exactAllowed.has(o)) return true;

  return extraAllowed.some((x) => x.toLowerCase() === o);
}

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const extraAllowed = parseAllowedOrigins();
  const allowed = origin && isOriginAllowed(origin, extraAllowed);
  return {
    allowed,
    headers: {
      ...baseCorsHeaders,
      // Reflect only allowed origin; otherwise omit/neutralize
      ...(allowed ? { "Access-Control-Allow-Origin": origin } : { "Access-Control-Allow-Origin": "null" }),
    } as Record<string, string>,
  };
}

function json(data: unknown, status = 200) {
  // Default JSON helper (no request context)
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...baseCorsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function jsonWithCors(req: Request, data: unknown, status = 200) {
  const cors = corsHeadersFor(req);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors.headers,
      "Content-Type": "application/json",
    },
  });
}

function randomChunk(len: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeKey() {
  return `SUNNY-${randomChunk(4)}-${randomChunk(4)}-${randomChunk(4)}`;
}

const inputSchema = z.object({
  // future-proof: allow choosing prefix/format, but keep strict for now
});

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    // For preflight, only respond with a permissive origin if allowed.
    return new Response(null, { headers: cors.headers, status: cors.allowed ? 204 : 403 });
  }
  if (!cors.allowed) return jsonWithCors(req, { ok: false, msg: "CORS_FORBIDDEN" }, 403);
  if (req.method !== "POST") return jsonWithCors(req, { ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);

  // Validate auth + admin role
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonWithCors(req, { ok: false, msg: "UNAUTHORIZED" }, 401);

  // Body is optional for now but still validate to prevent weird inputs
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return jsonWithCors(req, { ok: false, msg: "INVALID_INPUT" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // client for auth claims
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsError } = await authed.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) return jsonWithCors(req, { ok: false, msg: "UNAUTHORIZED" }, 401);

  const userId = claims.claims.sub;
  const roleCheck = await authed.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (roleCheck.error || roleCheck.data !== true) return jsonWithCors(req, { ok: false, msg: "FORBIDDEN" }, 403);

  // service role for collision check across all rows
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const key = makeKey();
    const exists = await db.from("licenses").select("id").eq("key", key).maybeSingle();
    if (!exists.data) {
      return jsonWithCors(req, { ok: true, key });
    }
  }

  return jsonWithCors(req, { ok: false, msg: "GEN_FAILED" }, 500);
});
