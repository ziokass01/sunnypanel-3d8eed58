import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import worker from "./index.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function limiter() { return { async limit() { return { success: true }; } }; }
function env() {
  return {
    ACTIVE_SUPABASE_URL: "https://project.example",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    API_RATE_LIMITER: limiter(),
    VERIFY_RATE_LIMITER: limiter(),
    FREE_REVEAL_RATE_LIMITER: limiter(),
    FREE_HOTPATH_GLOBAL_RATE_LIMITER: limiter(),
    FREE_NATIVE_ENABLED: "1",
    FREE_NATIVE_START_ENABLED: "1",
    FREE_NATIVE_GATE_ENABLED: "1",
    FREE_NATIVE_CLOSE_ENABLED: "1",
    FREE_NATIVE_CONFIG_ENABLED: "1",
    FREE_NATIVE_REVEAL_ENABLED: "1",
    FREE_NATIVE_DB_TIMEOUT_MS: "12000",
  };
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("Cloudflare-native free-config/free-reveal routing", () => {
  it("serves free-config from PostgREST without invoking a Supabase Edge Function", async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const method = String(init.method || "GET").toUpperCase();
      calls.push({ url: url.toString(), method });
      assert.equal(url.pathname.includes("/functions/v1/"), false, `unexpected Edge call: ${url}`);

      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, ""));
      if (table === "licenses_free_settings") {
        return json([{
          id: 1,
          free_enabled: true,
          free_secondary_enabled: true,
          free_daily_limit_per_fingerprint: 1,
          free_daily_limit_per_ip: 0,
          free_bonus_config: { enabled: false, start_time: "00:00", end_time: "12:00", rules: [] },
        }]);
      }
      if (table === "licenses_free_key_types") {
        return json([{
          code: "ff_h10",
          label: "Key Free Fire Normal 10H",
          kind: "hour",
          value: 10,
          duration_seconds: 36000,
          enabled: true,
          sort_order: 10,
          app_code: "free-fire",
          app_label: "Free Fire",
          key_signature: "FF",
          allow_reset: true,
        }]);
      }
      if (table === "server_app_settings") return json([]);
      if (table === "licenses_free_shortlink_providers" && method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-range": "*/1" } });
      }
      if (table === "licenses_free_issues" && method === "HEAD") {
        return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
      }
      throw new Error(`Unhandled native config mock: ${method} ${url}`);
    };

    const res = await worker.fetch(new Request("https://mityangho.id.vn/api/free-config", {
      method: "GET",
      headers: { "CF-Connecting-IP": "203.0.113.90" },
    }), env());
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.key_types?.[0]?.code, "ff_h10");
    assert.equal(calls.some((call) => call.url.includes("/functions/v1/")), false);
  });

  it("routes free-reveal to the native handler and rejects bad input without Edge replay", async () => {
    const calls = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      throw new Error(`unexpected fetch: ${input}`);
    };

    const res = await worker.fetch(new Request("https://mityangho.id.vn/api/free-reveal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.91",
      },
      body: JSON.stringify({}),
    }), env());
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, false);
    assert.equal(body.msg, "INVALID_INPUT");
    assert.equal(calls.length, 0);
  });
});
