#!/usr/bin/env node

import {
  derEcdsaToP1363,
  nativeVerifyContract,
  signedResponseCanonicalV3,
} from "./verify-native.js";

const endpoint = process.env.SUNNY_VERIFY_ENDPOINT || "https://mityangho.id.vn/api/verify-key";
const expectedBackend = process.env.SUNNY_EXPECT_VERIFY_BACKEND || "";
const licenseKey = String(process.argv[2] || "SUNNY-TEST-TEST-TEST").trim().toUpperCase();
const device = process.env.SUNNY_TEST_DEVICE || "sunny-node-v10-1-native-smoke-device";
const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function base64ToBytes(value) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function requireField(object, name, type) {
  if (!(name in object) || typeof object[name] !== type) {
    throw new Error(`STRICT_FIELD_BAD:${name}`);
  }
}

async function verifySuccess(body, request) {
  for (const [name, type] of [
    ["ok", "boolean"],
    ["msg", "string"],
    ["max_devices", "number"],
    ["started", "boolean"],
    ["remaining_seconds", "number"],
    ["server_time", "string"],
    ["build_id", "string"],
    ["product_id", "string"],
    ["server_sig_alg", "string"],
    ["server_key_id", "string"],
    ["key_hash", "string"],
    ["device_hash", "string"],
    ["session_id", "string"],
    ["session_expires_at", "number"],
    ["session_generation", "number"],
    ["exp_generation", "number"],
    ["build_not_before", "number"],
    ["build_expires_at", "number"],
    ["capability_nonce", "string"],
    ["capability_expires_at", "number"],
    ["feature_seed", "string"],
    ["device_key_bound", "boolean"],
    ["server_sig", "string"],
  ]) requireField(body, name, type);

  if (body.ok !== true || body.msg !== "OK") throw new Error("SUCCESS_CONTRACT_BAD");
  if (body.expires_at !== null && typeof body.expires_at !== "string") {
    throw new Error("STRICT_FIELD_BAD:expires_at");
  }
  if (body.build_id !== nativeVerifyContract.requiredBuildId ||
      body.product_id !== nativeVerifyContract.productId ||
      body.server_sig_alg !== nativeVerifyContract.serverSigAlg ||
      body.server_key_id !== nativeVerifyContract.serverKeyId) {
    throw new Error("IMMUTABLE_CONTRACT_MISMATCH");
  }
  if (body.key_hash !== await sha256Hex(licenseKey)) throw new Error("KEY_HASH_MISMATCH");
  if (body.device_hash !== await sha256Hex(device)) throw new Error("DEVICE_HASH_MISMATCH");

  const canonical = signedResponseCanonicalV3({
    nonce: request.nonce,
    requestBodyHash: request.bodyHash,
    keyHash: body.key_hash,
    deviceHash: body.device_hash,
    buildId: body.build_id,
    productId: body.product_id,
    remainingSeconds: body.remaining_seconds,
    expiresAt: body.expires_at,
    maxDevices: body.max_devices,
    started: body.started,
    serverTime: body.server_time,
    sessionId: body.session_id,
    sessionExpiresAt: String(body.session_expires_at),
    sessionGeneration: String(body.session_generation),
    expGeneration: String(body.exp_generation),
    buildNotBefore: String(body.build_not_before),
    buildExpiresAt: String(body.build_expires_at),
    capabilityNonce: body.capability_nonce,
    capabilityExpiresAt: String(body.capability_expires_at),
    featureSeed: body.feature_seed,
    deviceKeyBound: body.device_key_bound,
  });

  const publicKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(nativeVerifyContract.releasedPublicKeySpkiBase64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signature = derEcdsaToP1363(base64ToBytes(body.server_sig));
  if (!signature) throw new Error("SERVER_SIG_DER_BAD");
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    encoder.encode(canonical),
  );
  if (!verified) throw new Error("SERVER_SIG_INVALID");

  console.log("RESULT=PASS_SIGNED_V10_1_SUCCESS");
  console.log(`SESSION_GENERATION=${body.session_generation}`);
  console.log(`REMAINING_SECONDS=${body.remaining_seconds}`);
}

const payload = {
  key: licenseKey,
  device,
  device_name: "Node V10.1 Native Smoke Test",
  build_id: nativeVerifyContract.requiredBuildId,
  product_id: nativeVerifyContract.productId,
};
const rawBody = JSON.stringify(payload);
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = crypto.randomUUID().replaceAll("-", "");
const bodyHash = await sha256Hex(rawBody);
const signature = await hmacHex(
  nativeVerifyContract.releasedRequestHmacKey,
  `${timestamp}.${nonce}.${bodyHash}`,
);

try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Cache-Control": "no-store, no-cache, max-age=0",
      Pragma: "no-cache",
      "User-Agent": "SunnyMod/1.0",
      "x-ts": timestamp,
      "x-nonce": nonce,
      "x-sig": signature,
      "x-build-id": nativeVerifyContract.requiredBuildId,
    },
    body: rawBody,
    signal: AbortSignal.timeout(20_000),
  });

  const backend = response.headers.get("X-Verify-Backend") || "";
  const rawResponse = await response.text();
  console.log(`HTTP_STATUS=${response.status}`);
  console.log(`VERIFY_BACKEND=${backend || "not-reported"}`);
  if (expectedBackend && backend !== expectedBackend) {
    throw new Error(`VERIFY_BACKEND_MISMATCH:${backend || "missing"}`);
  }

  let body;
  try {
    body = JSON.parse(rawResponse);
  } catch {
    throw new Error(`NON_JSON_RESPONSE:${rawResponse.slice(0, 200)}`);
  }

  console.log(`MSG=${String(body?.msg || "")}`);
  if (body?.ok === true) {
    await verifySuccess(body, { nonce, bodyHash });
  } else if (["UNAUTHORIZED", "GATEWAY_REQUIRED", "SERVER_ERROR"].includes(String(body?.msg || ""))) {
    throw new Error(`VERIFY_REJECTED_BEFORE_LICENSE_CHECK:${String(body?.msg || "")}`);
  } else {
    console.log("RESULT=PASS_REQUEST_REACHED_LICENSE_CHECK");
  }
} catch (error) {
  console.error(`RESULT=FAIL:${String(error?.message || error)}`);
  process.exitCode = 1;
}
