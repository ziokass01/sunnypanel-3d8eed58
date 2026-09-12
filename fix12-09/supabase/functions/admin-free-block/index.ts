import { z } from "npm:zod@3";
import { assertAdmin, createAdminClient } from "../_shared/admin.ts";
import { buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

const inputSchema = z.object({
  ip_hash: z.string().trim().min(8).max(128).optional(),
  fingerprint_hash: z.string().trim().min(8).max(128).optional(),
  reason: z.string().trim().max(500).nullable().optional(),
}).refine((value) => Boolean(value.ip_hash) !== Boolean(value.fingerprint_hash), {
  message: "Exactly one block target is required",
});

function json(req: Request, status: number, body: unknown) {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? "https://mityangho.id.vn";
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req, publicBaseUrl, "POST,OPTIONS"),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

async function readJsonBody(req: Request, maxBytes = 4096) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
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

Deno.serve(async (req) => {
  const publicBaseUrl = Deno.env.get("PUBLIC_BASE_URL") ?? "https://mityangho.id.vn";
  if (req.method === "OPTIONS") return handleOptions(req, publicBaseUrl, "POST,OPTIONS");
  if (req.method !== "POST") return json(req, 405, { ok: false, msg: "METHOD_NOT_ALLOWED" });

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(req, admin.status, admin.body);

  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (error) {
    return json(req, String((error as Error)?.message) === "PAYLOAD_TOO_LARGE" ? 413 : 400, { ok: false, msg: "INVALID_INPUT" });
  }

  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return json(req, 400, { ok: false, msg: "INVALID_INPUT" });

  const db = createAdminClient();
  const targetColumn = parsed.data.ip_hash ? "ip_hash" : "fingerprint_hash";
  const targetValue = parsed.data.ip_hash ?? parsed.data.fingerprint_hash ?? "";

  const disabled = await db
    .from("licenses_free_blocklist")
    .update({ enabled: false })
    .eq(targetColumn, targetValue)
    .eq("enabled", true);
  if (disabled.error) return json(req, 500, { ok: false, msg: "SERVER_ERROR" });

  const inserted = await db.from("licenses_free_blocklist").insert({
    ip_hash: parsed.data.ip_hash ?? null,
    fingerprint_hash: parsed.data.fingerprint_hash ?? null,
    reason: parsed.data.reason || "manual block",
    enabled: true,
    blocked_until: null,
  }).select("id").single();

  if (inserted.error) return json(req, 500, { ok: false, msg: "SERVER_ERROR" });
  return json(req, 200, { ok: true, msg: "BLOCKED", id: inserted.data.id });
});
