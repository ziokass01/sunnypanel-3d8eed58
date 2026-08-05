import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";

import worker from "./index.js";
import {
  derEcdsaToP1363,
  nativeVerifyContract,
  signedResponseCanonicalV3,
} from "./verify-native.js";

const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();
let testPrivatePem = "";
let testPublicKey;
const originalSubtleVerify = crypto.subtle.verify.bind(crypto.subtle);
const signingSelfTestChallenge = encoder.encode(
  "sunny-v10.1-cloudflare-native-signing-key-self-test",
);

function installSigningSelfTestPassThrough() {
  crypto.subtle.verify = async (algorithm, key, signature, data) => {
    const bytes = new Uint8Array(data);
    if (bytes.length === signingSelfTestChallenge.length &&
        bytes.every((value, index) => value === signingSelfTestChallenge[index])) {
      return true;
    }
    return originalSubtleVerify(algorithm, key, signature, data);
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function pem(label, bytes) {
  const base64 = bytesToBase64(new Uint8Array(bytes));
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

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

before(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  testPrivatePem = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  testPublicKey = pair.publicKey;
  installSigningSelfTestPassThrough();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  installSigningSelfTestPassThrough();
});

function allowLimiter() {
  return {
    async limit() {
      return { success: true };
    },
  };
}

function baseEnv(overrides = {}) {
  return {
    ACTIVE_FUNCTIONS_BASE_URL: "https://project.example/functions/v1",
    ACTIVE_SUPABASE_URL: "https://project.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    GATEWAY_SHARED_SECRET: "gateway-test-secret",
    VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM: testPrivatePem,
    API_RATE_LIMITER: allowLimiter(),
    VERIFY_RATE_LIMITER: allowLimiter(),
    ...overrides,
  };
}

async function verifyRequest(
  bodyObject = {
    key: "SUNNY-ABCD-EFGH-IJKL",
    device: "stable-device",
    device_name: "Test device",
    build_id: nativeVerifyContract.requiredBuildId,
    product_id: nativeVerifyContract.productId,
  },
  extra = {},
) {
  const { headers: extraHeaders = {}, ...requestOverrides } = extra;
  const body = typeof bodyObject === "string" ? bodyObject : JSON.stringify(bodyObject);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const bodyHash = await sha256Hex(body);
  const signature = await hmacHex(
    nativeVerifyContract.releasedRequestHmacKey,
    `${timestamp}.${nonce}.${bodyHash}`,
  );

  const request = new Request("https://mityangho.id.vn/api/verify-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
      "x-ts": timestamp,
      "x-nonce": nonce,
      "x-sig": signature,
      "x-build-id": nativeVerifyContract.requiredBuildId,
      ...extraHeaders,
    },
    body,
    ...requestOverrides,
  });

  return { request, body, timestamp, nonce, bodyHash };
}

function rpcSuccess(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    ok: true,
    msg: "OK",
    expires_at: new Date((now + 3600) * 1000).toISOString(),
    max_devices: 3,
    started: true,
    remaining_seconds: 3600,
    server_epoch: now,
    session_generation: 7,
    exp_generation: 2,
    build_not_before: now - 60,
    build_expires_at: now + 7200,
    device_key_bound: false,
    ...overrides,
  };
}

describe("verify-key gateway hardening", () => {
  it("rejects non-POST methods before contacting Supabase", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const response = await worker.fetch(
      new Request("https://mityangho.id.vn/api/verify-key", {
        method: "GET",
        headers: { "CF-Connecting-IP": "203.0.113.10" },
      }),
      baseEnv(),
    );

    assert.equal(response.status, 405);
    assert.deepEqual(await response.json(), { ok: false, msg: "METHOD_NOT_ALLOWED" });
    assert.equal(fetchCalls, 0);
  });

  it("rejects oversized bodies before contacting Supabase", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const request = await verifyRequest("x".repeat(8193));
    const response = await worker.fetch(request.request, baseEnv({ VERIFY_NATIVE_ENABLED: "1" }));

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { ok: false, msg: "INVALID_INPUT" });
    assert.equal(fetchCalls, 0);
  });

  it("returns the existing RATE_LIMIT contract when the Cloudflare limiter denies", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const request = await verifyRequest();
    const response = await worker.fetch(request.request, baseEnv({
      VERIFY_RATE_LIMITER: {
        async limit() {
          return { success: false };
        },
      },
    }));

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      ok: false,
      msg: "RATE_LIMIT",
      retry_after_seconds: 60,
    });
    assert.equal(fetchCalls, 0);
  });

  it("keeps the old Supabase Edge Function proxy available while native mode is off", async () => {
    let forwardedRequest;
    globalThis.fetch = async (url, init) => {
      forwardedRequest = { url: String(url), init };
      return new Response(JSON.stringify({ ok: true, msg: "OK", session_id: "unchanged" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const request = await verifyRequest();
    request.request.headers.set("x-gateway-ip", "198.51.100.99");
    request.request.headers.set("x-gateway-signature", "f".repeat(64));
    const response = await worker.fetch(request.request, baseEnv({ VERIFY_NATIVE_ENABLED: "0" }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, msg: "OK", session_id: "unchanged" });
    assert.equal(forwardedRequest.url, "https://project.example/functions/v1/verify-key");
    assert.equal(forwardedRequest.init.headers.get("x-gateway-ip"), "203.0.113.10");
    assert.notEqual(forwardedRequest.init.headers.get("x-gateway-signature"), "f".repeat(64));
    assert.equal(response.headers.get("X-Gateway-Project"), "active");
  });

  it("uses one PostgREST RPC and never calls the Supabase Edge Function in native mode", async () => {
    let forwardedRequest;
    globalThis.fetch = async (url, init) => {
      forwardedRequest = { url: String(url), init };
      return new Response(JSON.stringify(rpcSuccess()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const requestData = await verifyRequest();
    const response = await worker.fetch(
      requestData.request,
      baseEnv({ VERIFY_NATIVE_ENABLED: "1" }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.msg, "OK");
    assert.equal(response.headers.get("X-Verify-Backend"), "cloudflare-native");
    assert.equal(
      forwardedRequest.url,
      "https://project.example/rest/v1/rpc/verify_key_v10_1_atomic",
    );
    assert.equal(forwardedRequest.url.includes("/functions/v1/verify-key"), false);
    assert.equal(forwardedRequest.init.headers.apikey, "service-role-test-key");
    assert.equal(
      forwardedRequest.init.headers.Authorization,
      "Bearer service-role-test-key",
    );

    const rpcPayload = JSON.parse(forwardedRequest.init.body);
    assert.equal(rpcPayload.p_key, "SUNNY-ABCD-EFGH-IJKL");
    assert.equal(rpcPayload.p_device, "stable-device");
    assert.equal(rpcPayload.p_precheck_msg, null);
  });

  it("does not fall back to the Edge Function when the native RPC fails", async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ message: "database unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    };

    const request = await verifyRequest();
    const response = await worker.fetch(
      request.request,
      baseEnv({ VERIFY_NATIVE_ENABLED: "1" }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, msg: "SERVER_ERROR" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].includes("/rest/v1/rpc/verify_key_v10_1_atomic"), true);
    assert.equal(calls[0].includes("/functions/v1/verify-key"), false);
  });

  it("fails closed before PostgreSQL when immutable V10.1 contract vars are wrong", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const request = await verifyRequest();
    const response = await worker.fetch(
      request.request,
      baseEnv({
        VERIFY_NATIVE_ENABLED: "1",
        VERIFY_REQUIRED_BUILD_ID: "wrong-build",
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, msg: "SERVER_ERROR" });
    assert.equal(fetchCalls, 0);
  });

  it("produces an ECDSA V3 response that verifies against the configured key", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(rpcSuccess()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const requestData = await verifyRequest();
    const response = await worker.fetch(
      requestData.request,
      baseEnv({ VERIFY_NATIVE_ENABLED: "1" }),
    );
    const body = await response.json();

    const canonical = signedResponseCanonicalV3({
      nonce: requestData.nonce,
      requestBodyHash: requestData.bodyHash,
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

    const der = Uint8Array.from(atob(body.server_sig), (character) => character.charCodeAt(0));
    const p1363 = derEcdsaToP1363(der);
    assert.ok(p1363);
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      testPublicKey,
      p1363,
      encoder.encode(canonical),
    );
    assert.equal(verified, true);
    assert.equal(body.server_sig_alg, nativeVerifyContract.serverSigAlg);
    assert.equal(body.server_key_id, nativeVerifyContract.serverKeyId);
  });

  it("preserves DEVICE_LIMIT fields and HTTP status from the atomic RPC", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: false,
      msg: "DEVICE_LIMIT",
      http_status: 200,
      used_devices: 3,
      max_devices: 3,
      internal_reason: "must-not-leak",
    }), { status: 200, headers: { "Content-Type": "application/json" } });

    const request = await verifyRequest();
    const response = await worker.fetch(
      request.request,
      baseEnv({ VERIFY_NATIVE_ENABLED: "1" }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: false,
      msg: "DEVICE_LIMIT",
      used_devices: 3,
      max_devices: 3,
    });
  });

  it("rejects bad V10.1 request HMAC without contacting PostgreSQL", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const requestData = await verifyRequest();
    requestData.request.headers.set("x-sig", "0".repeat(64));
    const response = await worker.fetch(
      requestData.request,
      baseEnv({ VERIFY_NATIVE_ENABLED: "1" }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: false, msg: "UNAUTHORIZED" });
    assert.equal(fetchCalls, 0);
  });

  it("fails closed before database mutation when the Cloudflare signing key is missing", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const request = await verifyRequest();
    const response = await worker.fetch(
      request.request,
      baseEnv({
        VERIFY_NATIVE_ENABLED: "1",
        VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM: "",
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, msg: "SERVER_ERROR" });
    assert.equal(fetchCalls, 0);
  });


  it("fails closed before the RPC when the private key does not match the released menu public key", async () => {
    const wrongPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const wrongPrivatePem = pem(
      "PRIVATE KEY",
      await crypto.subtle.exportKey("pkcs8", wrongPair.privateKey),
    );
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    crypto.subtle.verify = originalSubtleVerify;
    const request = await verifyRequest();
    const response = await worker.fetch(
      request.request,
      baseEnv({
        VERIFY_NATIVE_ENABLED: "1",
        VERIFY_RESPONSE_ECDSA_PRIVATE_KEY_PEM: wrongPrivatePem,
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, msg: "SERVER_ERROR" });
    assert.equal(fetchCalls, 0);
  });

  it("rejects extra path segments instead of routing them to verify-key", async () => {
    const response = await worker.fetch(
      new Request("https://mityangho.id.vn/api/verify-key/extra", {
        method: "POST",
        headers: { "CF-Connecting-IP": "203.0.113.10" },
      }),
      baseEnv(),
    );

    assert.equal(response.status, 404);
  });
});
