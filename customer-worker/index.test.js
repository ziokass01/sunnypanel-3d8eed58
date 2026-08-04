import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import worker from "./index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function baseEnv(overrides = {}) {
  return {
    ACTIVE_FUNCTIONS_BASE_URL: "https://project.example/functions/v1",
    GATEWAY_SHARED_SECRET: "gateway-test-secret",
    VERIFY_RATE_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    ...overrides,
  };
}

function verifyRequest(body = { key: "SUNNY-ABCD-EFGH-IJKL", device: "stable-device" }, extra = {}) {
  const { headers: extraHeaders = {}, ...requestOverrides } = extra;
  return new Request("https://mityangho.id.vn/api/verify-key", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.10",
      "x-ts": "1700000000",
      "x-nonce": "client-nonce",
      "x-sig": "a".repeat(64),
      "x-build-id": "sunny-v34-ac-20260721",
      ...extraHeaders,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...requestOverrides,
  });
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

    const response = await worker.fetch(verifyRequest("x".repeat(8193)), baseEnv());

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { ok: false, msg: "INVALID_INPUT" });
    assert.equal(fetchCalls, 0);
  });

  it("returns the existing RATE_LIMIT contract when the edge limiter denies", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response("unexpected");
    };

    const response = await worker.fetch(verifyRequest(), baseEnv({
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

  it("overwrites spoofed gateway headers and preserves the upstream JSON response", async () => {
    let forwardedRequest;
    globalThis.fetch = async (url, init) => {
      forwardedRequest = { url: String(url), init };
      return new Response(JSON.stringify({ ok: true, msg: "OK", session_id: "unchanged" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const response = await worker.fetch(verifyRequest(undefined, {
      headers: {
        "x-gateway-ip": "198.51.100.99",
        "x-gateway-signature": "f".repeat(64),
      },
    }), baseEnv());

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, msg: "OK", session_id: "unchanged" });
    assert.equal(forwardedRequest.url, "https://project.example/functions/v1/verify-key");
    assert.equal(forwardedRequest.init.headers.get("x-gateway-ip"), "203.0.113.10");
    assert.notEqual(forwardedRequest.init.headers.get("x-gateway-signature"), "f".repeat(64));
    assert.equal(response.headers.get("X-Gateway-Project"), "active");
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
