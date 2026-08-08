import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import worker from "./index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function allowLimiter() {
  return { async limit() { return { success: true }; } };
}

function env() {
  return {
    ACTIVE_FUNCTIONS_BASE_URL: "https://project.example/functions/v1",
    ACTIVE_SUPABASE_URL: "https://project.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    API_RATE_LIMITER: allowLimiter(),
    VERIFY_RATE_LIMITER: allowLimiter(),
    FREE_NATIVE_ENABLED: "1",
    FREE_NATIVE_START_ENABLED: "1",
    FREE_NATIVE_GATE_ENABLED: "1",
    FREE_NATIVE_CLOSE_ENABLED: "1",
    RESET_NATIVE_ENABLED: "1",
    FREE_NATIVE_DB_TIMEOUT_MS: "12000",
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function installDbMock() {
  const state = {
    edgeFunctionCalls: [],
    restCalls: [],
    closedPatch: null,
    atomicResetCalls: 0,
  };

  const license = {
    id: "lic-1",
    key: "SUNNY-ABCD-EFGH-IJKL",
    created_at: "2026-08-08T00:00:00.000Z",
    expires_at: "2026-08-09T00:00:00.000Z",
    is_active: true,
    deleted_at: null,
    max_devices: 1,
    max_ips: 1,
    max_verify: 10,
    verify_count: 1,
    public_reset_disabled: false,
    start_on_first_use: false,
    starts_on_first_use: false,
    duration_seconds: 86400,
    duration_days: 1,
    first_used_at: "2026-08-08T00:00:00.000Z",
    activated_at: "2026-08-08T00:00:00.000Z",
    app_code: "free-fire",
    public_reset_count: 0,
    admin_reset_count: 0,
  };

  const settings = {
    id: 1,
    enabled: true,
    require_turnstile: false,
    free_first_penalty_pct: 0,
    free_next_penalty_pct: 20,
    paid_first_penalty_pct: 0,
    paid_next_penalty_pct: 20,
    public_reset_cancel_after_count: 0,
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();

    if (url.pathname.includes("/functions/v1/")) {
      state.edgeFunctionCalls.push(url.pathname);
      return jsonResponse({ ok: false, code: "UNEXPECTED_EDGE_CALL" }, 500);
    }

    state.restCalls.push({ method, url: url.toString(), body: init.body || null });

    if (url.pathname === "/rest/v1/rpc/check_rate_limit") {
      return jsonResponse([{ allowed: true }]);
    }

    if (url.pathname === "/rest/v1/rpc/reset_license_key_atomic") {
      state.atomicResetCalls += 1;
      return jsonResponse({
        ok: true,
        msg: "RESET_OK",
        key: license.key,
        key_kind: "free",
        app_code: "free-fire",
        status: "active",
        devices_removed: 1,
        public_reset_count: 1,
      });
    }

    const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, ""));

    if (table === "licenses") {
      if (method === "GET") return jsonResponse([license]);
    }

    if (table === "license_reset_settings") {
      if (method === "GET") return jsonResponse([settings]);
    }

    if (table === "licenses_free_issues") {
      if (method === "GET") return jsonResponse([{ issue_id: "issue-1" }]);
    }

    if (table === "license_devices" && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "Content-Range": "*/2" } });
    }

    if (table === "license_ip_bindings" && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "Content-Range": "*/1" } });
    }

    if (table === "audit_logs" && method === "HEAD") {
      return new Response(null, { status: 200, headers: { "Content-Range": "*/0" } });
    }

    if (table === "licenses_free_sessions") {
      if (method === "GET") {
        assert.match(url.searchParams.get("or") || "", /out_token_hash\.eq\./);
        assert.equal(url.searchParams.get("limit"), "1");
        return jsonResponse([{ session_id: "session-close-1" }]);
      }
      if (method === "PATCH") {
        state.closedPatch = JSON.parse(String(init.body || "{}"));
        return new Response(null, { status: 204 });
      }
    }

    throw new Error(`Unhandled mock request: ${method} ${url}`);
  };

  return state;
}

describe("Cloudflare-native reset-key and free-close", () => {
  it("checks and resets a SUNNY key without invoking the reset-key Edge Function", async () => {
    const state = installDbMock();
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.50",
    };

    const checkResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/reset-key", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "check", key: "SUNNY-ABCD-EFGH-IJKL" }),
    }), env());
    const check = await checkResponse.json();

    assert.equal(checkResponse.status, 200);
    assert.equal(check.ok, true);
    assert.equal(check.key, "SUNNY-ABCD-EFGH-IJKL");
    assert.equal(check.key_kind, "free");
    assert.equal(check.device_count, 2);
    assert.equal(state.edgeFunctionCalls.length, 0);

    const resetResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/reset-key", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "reset", key: "SUNNY-ABCD-EFGH-IJKL" }),
    }), env());
    const reset = await resetResponse.json();

    assert.equal(resetResponse.status, 200);
    assert.equal(reset.ok, true);
    assert.equal(reset.msg, "RESET_OK");
    assert.equal(state.atomicResetCalls, 1);
    assert.equal(state.edgeFunctionCalls.length, 0);
  });

  it("closes a Free Key session without invoking the free-close Edge Function", async () => {
    const state = installDbMock();
    const response = await worker.fetch(new Request("https://mityangho.id.vn/api/free-close", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.51",
      },
      body: JSON.stringify({ out_token: "out_token_native_123456" }),
    }), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(state.closedPatch?.status, "closed");
    assert.equal(state.closedPatch?.claim_token_hash, null);
    assert.equal(state.edgeFunctionCalls.length, 0);
  });

  it("keeps proxy fallbacks available behind per-route kill switches", async () => {
    const calls = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/functions/v1/reset-key")) return jsonResponse({ ok: true, proxy: "reset" });
      if (url.includes("/functions/v1/free-close")) return jsonResponse({ ok: true, proxy: "close" });
      throw new Error(`Unexpected URL ${url}`);
    };

    const commonHeaders = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.52",
    };

    const resetResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/reset-key", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ action: "check", key: "SUNNY-ABCD-EFGH-IJKL" }),
    }), { ...env(), RESET_NATIVE_ENABLED: "0" });

    const closeResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/free-close", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ out_token: "out_token_native_123456" }),
    }), { ...env(), FREE_NATIVE_CLOSE_ENABLED: "0" });

    assert.deepEqual(await resetResponse.json(), { ok: true, proxy: "reset" });
    assert.deepEqual(await closeResponse.json(), { ok: true, proxy: "close" });
    assert.equal(calls.some((url) => url.endsWith("/functions/v1/reset-key")), true);
    assert.equal(calls.some((url) => url.endsWith("/functions/v1/free-close")), true);
  });
});
