import { createClient } from "npm:@supabase/supabase-js@2";

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function randomBase64Url(bytesLen = 32) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return b64;
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

function cookie(name: string, value: string, opts: { maxAgeSeconds?: number; httpOnly?: boolean } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  // Secure on https only
  parts.push("Secure");
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (opts.maxAgeSeconds) parts.push(`Max-Age=${opts.maxAgeSeconds}`);
  return parts.join("; ");
}

function inferBaseUrl(req: Request) {
  const env = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function redirect(location: string, setCookies: string[] = []) {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of setCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "GET") return new Response("METHOD_NOT_ALLOWED", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const base = inferBaseUrl(req);
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") ?? "";

  // Blocked IPs -> bounce back to /free
  const blk = await db.from("blocked_ips").select("blocked_until").eq("ip", ip).maybeSingle();
  const untilIso = blk.data?.blocked_until ?? null;
  const untilMs = untilIso ? new Date(untilIso).getTime() : 0;
  if (untilMs && untilMs > Date.now()) {
    return redirect(`${base}/free?err=RATE_LIMIT`);
  }

  const ipHash = await sha256Hex(ip);
  const uaHash = await sha256Hex(ua);

  // Rate limit gate (by IP hash)
  const rl = await db.rpc("check_free_ip_rate_limit" as any, {
    p_ip_hash: ipHash,
    p_route: "gate",
    p_limit: 30,
    p_window_seconds: 600,
  } as any);
  const allowed = rl.error ? true : Boolean(rl.data?.[0]?.allowed);
  if (!allowed) {
    // auto-block 30 minutes
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.from("blocked_ips").upsert(
      {
        ip,
        blocked_until: until,
        reason: "FREE_SPAM",
        meta: { route: "gate", kind: "RATE_LIMIT" },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ip" },
    );
    return redirect(`${base}/free?err=RATE_LIMIT`);
  }

  const cookies = parseCookies(req);
  const fp = cookies.fk_fp || randomBase64Url(18);
  const fpHash = await sha256Hex(fp);

  const now = new Date();
  const sessionExpires = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
  const claimToken = randomBase64Url(32);
  const claimHash = await sha256Hex(claimToken);
  const claimExpires = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

  const ins = await db
    .from("licenses_free_sessions")
    .insert({
      expires_at: sessionExpires,
      status: "gate_returned",
      ip_hash: ipHash,
      ua_hash: uaHash,
      fingerprint_hash: fpHash,
      reveal_count: 0,
      last_error: null,
      claim_token_hash: claimHash,
      claim_expires_at: claimExpires,
    })
    .select("session_id")
    .single();

  if (ins.error || !ins.data?.session_id) {
    return redirect(`${base}/free?err=SERVER_ERROR`);
  }

  const set: string[] = [
    cookie("fk_sess", String(ins.data.session_id), { httpOnly: true, maxAgeSeconds: 60 * 60 }),
  ];
  if (!cookies.fk_fp) {
    set.push(cookie("fk_fp", fp, { httpOnly: true, maxAgeSeconds: 90 * 24 * 60 * 60 }));
  }

  return redirect(`${base}/free/claim?c=${encodeURIComponent(claimToken)}`, set);
});
