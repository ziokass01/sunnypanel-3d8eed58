import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  const publicBase = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || "https://app.mityangho.id.vn";
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req, publicBase, "POST,OPTIONS"), "content-type": "application/json; charset=utf-8" },
  });
}

async function callAuth(req: Request, path: string, payload: Record<string, unknown>, extraHeaders?: Record<string, string>) {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim();
  const publishableKey = String(Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!supabaseUrl || !publishableKey) {
    throw Object.assign(new Error("SUPABASE_AUTH_ENV_MISSING"), { status: 500, code: "SUPABASE_AUTH_ENV_MISSING" });
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "apikey": publishableKey,
    ...extraHeaders,
  };
  const res = await fetch(`${supabaseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { message: text }; }
  if (!res.ok) {
    throw Object.assign(new Error(json?.msg || json?.message || json?.error_description || json?.error || "AUTH_ERROR"), {
      status: res.status,
      code: json?.code || json?.error || "AUTH_ERROR",
      raw: json,
    });
  }
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const publicBase = Deno.env.get("PUBLIC_BASE_URL") || Deno.env.get("APP_BASE_URL") || "https://app.mityangho.id.vn";
    return handleOptions(req, publicBase, "POST,OPTIONS");
  }
  if (req.method !== "POST") return jsonResponse(req, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  try {
    const body = await req.json().catch(() => null) as any;
    const action = String(body?.action || "").trim().toLowerCase();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const redirectTo = String(body?.redirect_to || Deno.env.get("APP_BASE_URL") || "https://app.mityangho.id.vn/mobile-auth/email-reset").trim();
    if (!action) return jsonResponse(req, 400, { ok: false, code: "MISSING_ACTION", message: "Thiếu action" });
    if (!email) return jsonResponse(req, 400, { ok: false, code: "MISSING_EMAIL", message: "Thiếu email" });

    if (action === "login") {
      if (!password) return jsonResponse(req, 400, { ok: false, code: "MISSING_PASSWORD", message: "Thiếu mật khẩu" });
      const json = await callAuth(req, "/auth/v1/token?grant_type=password", { email, password });
      return jsonResponse(req, 200, { ok: true, action, session: json, user: json?.user || null });
    }

    if (action === "register") {
      if (!password) return jsonResponse(req, 400, { ok: false, code: "MISSING_PASSWORD", message: "Thiếu mật khẩu" });
      const json = await callAuth(req, "/auth/v1/signup", { email, password, options: { emailRedirectTo: redirectTo } });
      return jsonResponse(req, 200, { ok: true, action, session: json?.session || null, user: json?.user || null, message: "REGISTER_OK" });
    }

    if (action === "reset") {
      const json = await callAuth(req, "/auth/v1/recover", { email, code_challenge: null, redirect_to: redirectTo });
      return jsonResponse(req, 200, { ok: true, action, message: "RESET_EMAIL_SENT", raw: json });
    }

    return jsonResponse(req, 400, { ok: false, code: "UNKNOWN_ACTION", message: action });
  } catch (err) {
    const status = Number((err as any)?.status || 500);
    const code = String((err as any)?.code || "AUTH_ERROR");
    const message = (err as any)?.message || "Authentication failed";
    return jsonResponse(req, status, { ok: false, code, message });
  }
});
