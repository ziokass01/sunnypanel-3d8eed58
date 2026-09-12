// @ts-nocheck
import { createServiceClient } from "./supabase-rest.js";

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

async function readJsonBody(req, maxBytes = 2048) {
  const rawLength = String(req.headers.get("content-length") || "").trim();
  if (rawLength) {
    const declared = Number(rawLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
  }

  if (!req.body) return {};
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("PAYLOAD_TOO_LARGE");
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  if (!text) return {};
  return JSON.parse(text);
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const outToken = String(body.out_token ?? "").trim();
  if (outToken.length < 8 || outToken.length > 512) return null;
  return { out_token: outToken };
}

export async function handleFreeResolve(req, env, ctx) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: ctx.corsHeaders });
  }
  if (req.method !== "POST") {
    return ctx.json({ ok: false, code: "METHOD_NOT_ALLOWED", msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  let rawBody;
  try {
    rawBody = await readJsonBody(req, 2048);
  } catch (error) {
    if (String(error?.message || "") === "PAYLOAD_TOO_LARGE") {
      return ctx.json({ ok: false, code: "PAYLOAD_TOO_LARGE", msg: "PAYLOAD_TOO_LARGE" }, 413);
    }
    return ctx.json({ ok: false, code: "BAD_REQUEST", msg: "BAD_REQUEST" }, 400);
  }

  const body = validateBody(rawBody);
  if (!body) return ctx.json({ ok: false, code: "BAD_REQUEST", msg: "BAD_REQUEST" }, 400);

  const db = createServiceClient(env);
  if (!db) return ctx.json({ ok: false, code: "FREE_NOT_READY", msg: "FREE_NOT_READY" }, 503);

  const outHash = await sha256Hex(body.out_token);
  const lookup = await db
    .from("licenses_free_sessions")
    .select("session_id,expires_at")
    .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`)
    .limit(1)
    .maybeSingle();

  if (lookup.error) return ctx.json({ ok: false, code: "SERVER_ERROR", msg: "SERVER_ERROR" }, 500);

  const sess = lookup.data;
  if (!sess?.session_id) return ctx.json({ ok: false, code: "INVALID_SESSION", msg: "INVALID_SESSION" }, 404);

  const exp = Date.parse(sess.expires_at);
  if (Number.isFinite(exp) && exp <= Date.now()) {
    return ctx.json({ ok: false, code: "SESSION_EXPIRED", msg: "SESSION_EXPIRED" }, 400);
  }

  return ctx.json({ ok: true, session_id: sess.session_id }, 200);
}
