import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function randomGroup() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callVerify(params: { key: string; device: string; device_name?: string }) {
  const REQUIRED_BUILD_ID = Deno.env.get("VERIFY_REQUIRED_BUILD_ID") ?? "sunny-v31-ac-20260616";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
  const VERIFY_HMAC_SECRET = Deno.env.get("VERIFY_REQUEST_HMAC_SECRET") ?? Deno.env.get("VERIFY_HMAC_SECRET");
  assert(SUPABASE_URL, "Missing SUPABASE_URL/VITE_SUPABASE_URL");
  // Note: Some CI/test runners don't expose secrets to Deno tests.
  // In that case, the integration test is skipped; the public endpoint has no admin bypass.
  if (!VERIFY_HMAC_SECRET) {
    return { status: 200, json: { ok: false, msg: "SKIPPED_NO_SECRET" } };
  }

  const url = `${SUPABASE_URL}/functions/v1/verify-key`;
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const body = JSON.stringify({ ...params, build_id: REQUIRED_BUILD_ID });
  const bodyHash = await sha256Hex(body);
  const canonical = `${ts}.${nonce}.${bodyHash}`;
  const sig = await hmacSha256Hex(VERIFY_HMAC_SECRET, canonical);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ts": ts,
      "x-nonce": nonce,
      "x-sig": sig,
      "x-build-id": REQUIRED_BUILD_ID,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, json: JSON.parse(text) };
}

Deno.test("verify-key: fixed expiry license still works", async () => {
  // Seeded via test harness (DB insert) in test environment
  const key = "SUNNY-TST1-TST1-TST1";

  const r = await callVerify({ key, device: "device-fixed-1" });
  if (r.json.msg === "SKIPPED_NO_SECRET") return;
  assertEquals(r.status, 200);
  assertEquals(r.json.ok, true);
  assertEquals(r.json.msg, "OK");
  assertEquals(typeof r.json.server_time, "string");
  assertEquals(typeof r.json.remaining_seconds, "number");
  assertEquals(r.json.server_sig_alg, "ECDSA-P256-SHA256-V2");
  assertEquals(r.json.server_key_id, "sunny-p256-2026-07-a");
  assertEquals(typeof r.json.server_sig, "string");
  assertEquals(typeof r.json.session_id, "string");
  assertEquals(typeof r.json.session_expires_at, "string");
  assertEquals(typeof r.json.feature_seed, "string");
  assertEquals(typeof r.json.key_hash, "string");
  assertEquals(typeof r.json.device_hash, "string");
  assertEquals(r.json.started, false);
});

Deno.test("verify-key: start-on-first-use activates after device checks", async () => {
  // Seeded via test harness (DB insert) in test environment
  const key = "SUNNY-TST2-TST2-TST2";

  // First verify should activate & set expires_at
  const r1 = await callVerify({ key, device: "device-firstuse-1" });
  if (r1.json.msg === "SKIPPED_NO_SECRET") return;
  assertEquals(r1.status, 200);
  assertEquals(r1.json.ok, true);
  assertEquals(r1.json.msg, "OK");
  assertEquals(r1.json.started, true);
  assertEquals(typeof r1.json.expires_at, "string");
  assertEquals(typeof r1.json.remaining_seconds, "number");
  assertEquals(r1.json.server_sig_alg, "ECDSA-P256-SHA256-V2");
  assertEquals(r1.json.server_key_id, "sunny-p256-2026-07-a");
  assertEquals(typeof r1.json.server_sig, "string");
  assert(r1.json.remaining_seconds <= 86400);

  // Second verify with the same device should still work
  const r2 = await callVerify({ key, device: "device-firstuse-1" });
  assertEquals(r2.status, 200);
  assertEquals(r2.json.ok, true);
  assertEquals(r2.json.started, true);
  assertEquals(typeof r2.json.remaining_seconds, "number");
});
