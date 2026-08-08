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

async function readJsonBody(req, maxBytes = 4096) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
    throw new Error("PAYLOAD_TOO_LARGE");
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
  return text ? JSON.parse(text) : {};
}

function validOutToken(value) {
  const token = String(value ?? "");
  return token.length >= 8 && token.length <= 256 ? token : "";
}

export async function handleFreeClose(req, env, ctx) {
  if (req.method !== "POST") {
    return ctx.json({ ok: false, msg: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    // Preserve the legacy Edge Function contract: malformed/oversized input is
    // a soft denial and still returns HTTP 200.
    return ctx.json({ ok: false, msg: "INVALID_INPUT" }, 200);
  }

  const outToken = validOutToken(body?.out_token);
  if (!outToken) return ctx.json({ ok: false, msg: "INVALID_INPUT" }, 200);

  const db = createServiceClient(env);
  if (!db) return ctx.json({ ok: false, msg: "SERVER_MISCONFIG" }, 500);

  const outHash = await sha256Hex(outToken);
  const { data: sessionMatch, error: lookupError } = await db
    .from("licenses_free_sessions")
    .select("session_id")
    .or(`out_token_hash.eq.${outHash},out_token_hash_pass2.eq.${outHash}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Legacy behavior treats a missing token/session as idempotent success. A DB
  // lookup failure is different: fail closed rather than pretending to close.
  if (lookupError) {
    console.error("free-close native lookup failed", String(lookupError?.message || lookupError));
    return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
  }
  if (!sessionMatch?.session_id) return ctx.json({ ok: true }, 200);

  const nowIso = new Date().toISOString();
  const fullUpd = await db
    .from("licenses_free_sessions")
    .update({
      status: "closed",
      claim_token_hash: null,
      claim_expires_at: null,
      claim_token_plain: null,
      out_expires_at: nowIso,
    })
    .eq("session_id", sessionMatch.session_id);

  if (fullUpd.error) {
    const message = String(fullUpd.error?.message || "");
    if (message.toLowerCase().includes("claim_token_plain")) {
      const fallbackUpd = await db
        .from("licenses_free_sessions")
        .update({
          status: "closed",
          claim_token_hash: null,
          claim_expires_at: null,
          out_expires_at: nowIso,
        })
        .eq("session_id", sessionMatch.session_id);
      if (fallbackUpd.error) {
        console.error("free-close native fallback update failed", String(fallbackUpd.error?.message || fallbackUpd.error));
        return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
      }
    } else {
      console.error("free-close native update failed", message);
      return ctx.json({ ok: false, msg: "SERVER_ERROR" }, 500);
    }
  }

  return ctx.json({ ok: true }, 200);
}
