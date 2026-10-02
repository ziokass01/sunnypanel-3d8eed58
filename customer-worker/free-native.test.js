import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import worker from "./index.js";

const originalFetch = globalThis.fetch;

let guardDb;
afterEach(async () => {
  if (guardDb) { await guardDb.close(); guardDb = null; }
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
    FREE_REVEAL_RATE_LIMITER: allowLimiter(),
    FREE_HOTPATH_GLOBAL_RATE_LIMITER: allowLimiter(),
    FREE_NATIVE_ENABLED: "1",
    FREE_NATIVE_START_ENABLED: "1",
    FREE_NATIVE_GATE_ENABLED: "1",
    FREE_PUBLIC_BASE_URL: "https://mityangho.id.vn",
    FREE_NATIVE_REVEAL_ENABLED: "1",
    GATEWAY_SHARED_SECRET: "test-gateway-secret",
    FREE_CLAIM_SECRET: "test-claim-secret",
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

async function installFreeDbMock({ requiresDoubleGate = false, providerKind = "link4m", antiDelay = 0, withFallback = false } = {}) {
  guardDb = new PGlite();
  await guardDb.exec(readFileSync(new URL("../tests/security/free-flow-fixture.sql", import.meta.url), "utf8"));
  await guardDb.exec(readFileSync(new URL("../supabase/migrations/20261002070000_free_flow_atomic_guard.sql", import.meta.url), "utf8"));
  const state = {
    gates: [],
    session: null,
    gate: null,
    shortlinkTargets: [],
    shortlinkRequests: [],
    edgeFunctionCalls: [],
    restCalls: [],
  };

  const settings = {
    id: 1,
    free_enabled: true,
    free_secondary_enabled: true,
    free_session_waiting_limit: 2,
    free_gate_antibypass_enabled: antiDelay > 0,
    free_gate_antibypass_seconds: antiDelay,
    free_min_delay_enabled: true,
    free_min_delay_seconds: 0,
    free_min_delay_seconds_pass2: 0,
    free_gate_token_life_seconds: 600,
    free_claim_window_seconds: 180,
    free_session_absolute_seconds: 900,
    free_gate_require_ip_match: true,
    free_gate_require_ua_match: true,
    free_shortlink_mode: "priority_failover",
  };
  const keyType = {
    code: "D1",
    app_code: "free-fire",
    enabled: true,
    duration_seconds: 86400,
    value: 1,
    kind: "day",
    free_selection_mode: "none",
    requires_double_gate: requiresDoubleGate,
  };
  const provider = {
    id: "10000000-0000-0000-0000-000000000001",
    name: providerKind === "link4m" ? "Link4M opaque test provider" : "Unsafe embedded-target provider",
    provider: providerKind,
    api_url_template: "https://shortener.test/api-shorten/v2",
    api_token_secret: "test-provider-token",
    enabled: true,
    secondary_enabled: true,
    pass_scope: "both",
    sort_order: 1,
    created_at: "2026-08-08T00:00:00.000Z",
    daily_quota_limit: 0,
  };

  const providers=[provider];
  if(withFallback) providers.push({...provider,id:"10000000-0000-0000-0000-000000000002",provider:"link4m",api_url_template:"https://fallback.test/api-shorten/v2",name:"Link4M fallback",sort_order:2});
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();

    if (["shortener.test","fallback.test"].includes(url.hostname)) {
      const target = String(url.searchParams.get("url") || "");
      state.shortlinkTargets.push(target);
      state.shortlinkRequests.push(url.toString());
      if (providerKind === "ontops") {
        if (state.shortlinkRequests.length === 1) {
          return jsonResponse({ message: "temporary provider error" }, 500);
        }
        return jsonResponse({
          id: `opaque-${state.shortlinkTargets.length}`,
          url: target,
          remaining: -1,
        });
      }
      if(providerKind==="gtraffic" && url.hostname==="shortener.test") return jsonResponse({id:`gtraffic-opaque-${state.shortlinkRequests.length}`,remaining:10});
      return jsonResponse({ shortenedUrl: `https://link4m.test/opaque-${state.shortlinkTargets.length}` });
    }

    if (url.pathname.includes("/functions/v1/")) {
      state.edgeFunctionCalls.push(url.pathname);
      return jsonResponse({ ok: false, code: "UNEXPECTED_EDGE_CALL" }, 500);
    }

    if (url.pathname.includes("/rest/v1/rpc/free_flow_")) {
      // Execute shipped SQL; never fabricate the authorization decision.
      await guardDb.exec("TRUNCATE licenses_free_sessions, licenses_free_gate_tokens, licenses_free_shortlink_providers");
      const insert = async (table, row) => {
        const keys = Object.keys(row);
        await guardDb.query(`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`, keys.map(k=>row[k]));
      };
      for(const p of providers) await insert("licenses_free_shortlink_providers", { id: p.id, provider: p.provider });
      if (state.session) await insert("licenses_free_sessions", state.session);
      for (const gate of state.gates) await insert("licenses_free_gate_tokens", gate);
      const name = url.pathname.split('/').pop(), args = JSON.parse(String(init.body || "{}"));
      try {
        const keys = Object.keys(args);
        const result = await guardDb.query(`SELECT ${name}(${keys.map((k,i)=>k+' => $'+(i+1)).join(',')}) AS r`,Object.values(args));
        state.session = (await guardDb.query("SELECT * FROM licenses_free_sessions")).rows[0] || null;
        state.gates = (await guardDb.query("SELECT * FROM licenses_free_gate_tokens ORDER BY created_at")).rows;
        state.gate = state.gates.at(-1) || null;
        return jsonResponse(result.rows[0].r);
      } catch (error) { return jsonResponse({message:error.message,code:error.code},500); }
    }
    if (url.pathname.endsWith("/rpc/insert_free_license_compat")) {
      const args=JSON.parse(String(init.body||"{}"));
      const result=await guardDb.query("INSERT INTO licenses(key,app_code,expires_at) VALUES($1,$2,$3) RETURNING id,key",[args.p_key,args.p_app_code,args.p_expires_at]);
      return jsonResponse(result.rows[0]);
    }
    if (url.pathname.endsWith("/licenses_free_blocklist")) return jsonResponse([]);
    if (url.pathname.endsWith("/server_app_settings")) return jsonResponse([{app_code:"free-fire",free_daily_limit_per_fingerprint:2,free_daily_limit_per_ip:0}]);
    state.restCalls.push({ method, url: url.toString(), body: init.body || null });
    const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, ""));

    if (table === "licenses_free_settings") {
      if (method === "GET") return jsonResponse([settings]);
      if (method === "PATCH") return new Response(null, { status: 204 });
    }

    if (table === "licenses_free_key_types" && method === "GET") {
      return jsonResponse([keyType]);
    }

    if (table === "licenses_free_shortlink_providers") {
      if (method === "GET") return jsonResponse(providers);
      if (method === "PATCH") return new Response(null, { status: 204 });
    }

    if (table === "licenses_free_sessions") {
      if (method === "HEAD") {
        return new Response(null, { status: 200, headers: { "Content-Range": "*/0" } });
      }
      if (method === "POST") {
        state.session = JSON.parse(String(init.body || "{}"));
        return new Response(null, { status: 201 });
      }
      if (method === "GET") return jsonResponse(state.session ? [state.session] : []);
      if (method === "PATCH") {
        if (state.session) Object.assign(state.session, JSON.parse(String(init.body || "{}")));
        return new Response(null, { status: 204 });
      }
    }

    if (table === "licenses_free_gate_tokens") {
      if (method === "POST") {
        state.gate = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(String(init.body || "{}")) };
        state.gates.push(state.gate);
        return new Response(null, { status: 201 });
      }
      if (method === "GET") return jsonResponse(state.gate ? [state.gate] : []);
      if (method === "PATCH") {
        const patch = JSON.parse(String(init.body || "{}"));
        if (state.gate) Object.assign(state.gate, patch);
        if (url.searchParams.get("select")) return jsonResponse([{ id: state.gate?.id || "gate-row-1" }]);
        return new Response(null, { status: 204 });
      }
    }

    if (table === "licenses_free_gate_logs" && method === "POST") {
      return new Response(null, { status: 201 });
    }

    throw new Error(`Unhandled mock request: ${method} ${url}`);
  };

  return state;
}

describe("Cloudflare-native Free Key hot path", () => {
  it("requires the opaque short-link destination before free-gate can issue a claim", async () => {
    const state = await installFreeDbMock();
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.20",
      "User-Agent": "Sunny-Free-Native-Test",
      "x-fp": "test-fingerprint",
    };

    const startResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/free-start", {
      method: "POST",
      headers,
      body: JSON.stringify({
        key_type_code: "D1",
        app_code: "free-fire",
        fingerprint: "test-fingerprint",
        link_channel: "primary",
      }),
    }), env());
    const start = await startResponse.json();

    assert.equal(startResponse.status, 200);
    assert.equal(start.ok, true);
    assert.equal(start.passes_required, 1);
    assert.equal(start.outbound_url, "https://link4m.test/opaque-1");
    assert.equal(Object.hasOwn(start, "gate_token"), false);
    assert.equal(Object.hasOwn(start, "gate_url"), false);
    assert.equal(Object.hasOwn(start, "gate_url_pass2"), false);
    assert.equal(JSON.stringify(start).includes("gt_"), false);
    assert.ok(state.session);
    assert.ok(state.gate);
    assert.equal(state.shortlinkTargets.length, 1);
    assert.equal(state.edgeFunctionCalls.length, 0);

    // Reproduce the reported exploit: session_id + out_token alone must fail.
    const bypassResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/free-gate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        out_token: start.out_token,
        session_id: start.session_id,
        pass: 1,
        fingerprint: "test-fingerprint",
      }),
    }), env());
    const bypass = await bypassResponse.json();
    assert.equal(bypass.ok, false);
    assert.equal(bypass.code, "TOKENIZED_GATE_REQUIRED");
    assert.equal(state.gate.status, "pending");

    // Simulate the provider redirecting to the destination it kept server-side.
    const gateUrl = new URL(state.shortlinkTargets[0]);
    const gateToken = gateUrl.searchParams.get("t");
    assert.match(gateToken, /^gt_/);

    const gateResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/free-gate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        gate_token: gateToken,
        out_token: start.out_token,
        session_id: start.session_id,
        pass: 1,
        fingerprint: "test-fingerprint",
      }),
    }), env());
    const gate = await gateResponse.json();

    assert.equal(gateResponse.status, 200);
    assert.equal(gate.ok, true);
    assert.equal(gate.next, "CLAIM");
    assert.equal(gate.session_id, start.session_id);
    assert.ok(gate.claim_token);
    assert.equal(state.edgeFunctionCalls.length, 0);
    assert.equal(state.gate.status, "used");
    assert.equal(state.session.status, "gate_ok");
  });

  it("keeps the second-pass gate secret out of the PASS2 API response", async () => {
    const state = await installFreeDbMock({ requiresDoubleGate: true });
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.30",
      "User-Agent": "Sunny-Free-Native-Test",
      "x-fp": "test-fingerprint-vip",
    };

    const startResponse = await worker.fetch(new Request("https://mityangho.id.vn/api/free-start", {
      method: "POST",
      headers,
      body: JSON.stringify({
        key_type_code: "D1",
        app_code: "free-fire",
        fingerprint: "test-fingerprint-vip",
        link_channel: "primary",
      }),
    }), env());
    const start = await startResponse.json();
    const pass1Token = new URL(state.shortlinkTargets[0]).searchParams.get("t");

    const pass1Response = await worker.fetch(new Request("https://mityangho.id.vn/api/free-gate", {
      method: "POST",
      headers,
      body: JSON.stringify({
        gate_token: pass1Token,
        out_token: start.out_token,
        session_id: start.session_id,
        pass: 1,
        fingerprint: "test-fingerprint-vip",
      }),
    }), env());
    const pass1 = await pass1Response.json();

    assert.equal(pass1.ok, true);
    assert.equal(pass1.next, "PASS2");
    assert.equal(pass1.outbound_url, "https://link4m.test/opaque-2");
    assert.equal(Object.hasOwn(pass1, "gate_token"), false);
    assert.equal(Object.hasOwn(pass1, "gate_url"), false);
    assert.equal(JSON.stringify(pass1).includes("gt_"), false);
    assert.equal(state.shortlinkTargets.length, 2);
    assert.match(new URL(state.shortlinkTargets[1]).searchParams.get("t"), /^gt_/);
    assert.notEqual(pass1.out_token, start.out_token);
    const token2 = new URL(state.shortlinkTargets[1]).searchParams.get("t");
    const callGate = async (token) => (await worker.fetch(new Request("https://mityangho.id.vn/api/free-gate", {
      method: "POST", headers, body: JSON.stringify({ gate_token: token2, out_token: token,
        session_id: start.session_id, pass: 2, fingerprint: "test-fingerprint-vip" }),
    }), env())).json();
    assert.equal((await callGate(start.out_token)).ok, false);
    const final = await callGate(pass1.out_token);
    assert.equal(final.next, "CLAIM");
    assert.equal(state.session.passes_completed, 2);
    assert.equal(state.gates.filter(g=>g.used_at).length, 2);
    assert.equal((await callGate(pass1.out_token)).ok, false);
    const reveal=async(out)=> (await worker.fetch(new Request("https://mityangho.id.vn/api/free-reveal",{
      method:"POST",headers,body:JSON.stringify({claim_token:final.claim_token,out_token:out,
        fingerprint:"test-fingerprint-vip",session_id:start.session_id}),
    }),env())).json();
    const forged=await reveal(start.out_token);assert.equal(forged.ok,false);
    assert.equal((await guardDb.query("SELECT count(*)::int n FROM licenses")).rows[0].n,0);
    const issued=await reveal(pass1.out_token);assert.equal(issued.ok,true,JSON.stringify(issued));assert.match(issued.key,/^SUNNY-/);
    assert.equal((await guardDb.query("SELECT count(*)::int n FROM licenses")).rows[0].n,1);
    assert.equal((await guardDb.query("SELECT count(*)::int n FROM licenses_free_issues")).rows[0].n,1);
    assert.equal(state.session.out_token_hash_pass2,null);assert.equal(state.session.claim_token_hash,null);
    assert.equal((await reveal(pass1.out_token)).ok,false);
    assert.equal((await guardDb.query("SELECT count(*)::int n FROM licenses")).rows[0].n,1);
  });


  it("ignores forged completion fields and burns session when replacement cannot be created", async () => {
    const state=await installFreeDbMock({antiDelay:30});
    const headers={"Content-Type":"application/json","CF-Connecting-IP":"203.0.113.30","User-Agent":"Fixture"};
    const call=async(route,body)=>(await worker.fetch(new Request("https://mityangho.id.vn/api/"+route,{method:"POST",headers,body:JSON.stringify(body)}),env())).json();
    const start=await call("free-start",{key_type_code:"D1",app_code:"free-fire",fingerprint:"fixture-device"});
    assert.equal(start.min_delay_seconds,30);
    assert.ok(Date.parse(state.gate.activate_after_at)-Date.parse(state.session.started_at)>=30000);
    const result=await call("free-gate",{gate_token:new URL(state.shortlinkTargets[0]).searchParams.get("t"),out_token:start.out_token,
      session_id:start.session_id,pass:1,fingerprint:"fixture-device",ok:true,passes_completed:2,gate_ok:true,
      activate_after_at:"2000-01-01",min_delay_seconds:0,claim_token:"client-forged-claim"});
    assert.equal(result.ok,false);assert.equal(result.code,"PASS2_SHORTLINK_FAILED");
    assert.equal(state.session.status,"closed");assert.equal(state.session.out_token_hash,null);
    assert.equal(state.shortlinkTargets.length,1);
  });

  for (const providerKind of ["gtraffic", "link4m"]) it(`${providerKind} early return rotates fresh tokens and restarts same-pass delay`,async()=>{
    const state=await installFreeDbMock({providerKind,withFallback:true,antiDelay:30});
    const headers={"Content-Type":"application/json","CF-Connecting-IP":"203.0.113.30","User-Agent":"Fixture"};
    const call=async(route,body)=>(await worker.fetch(new Request("https://mityangho.id.vn/api/"+route,{method:"POST",headers,body:JSON.stringify(body)}),env())).json();
    const start=await call("free-start",{key_type_code:"D1",app_code:"free-fire",fingerprint:"fixture-device"});
    assert.equal(start.ok,true,JSON.stringify(start));
    const oldGate=new URL(state.shortlinkTargets[0]).searchParams.get("t");
    const rotated=await call("free-gate",{gate_token:oldGate,out_token:start.out_token,session_id:start.session_id,pass:1,fingerprint:"fixture-device"});
    assert.equal(rotated.next,"SHORTLINK_FALLBACK",JSON.stringify(rotated));
    assert.notEqual(rotated.out_token,start.out_token);assert.equal(rotated.min_delay_seconds,30);
    assert.equal(state.session.passes_completed,0);assert.equal(state.shortlinkTargets.length,2);
    const newGate=new URL(state.shortlinkTargets[1]).searchParams.get("t");assert.notEqual(newGate,oldGate);
    const tooEarly=await call("free-gate",{gate_token:newGate,out_token:rotated.out_token,session_id:start.session_id,pass:1,fingerprint:"fixture-device"});
    assert.equal(tooEarly.next,"SHORTLINK_FALLBACK");assert.equal(state.session.passes_completed,0);assert.equal(state.session.claim_token_hash,null);
  });

  it("creates Ontops links server-side with apikey + encoded gate url", async () => {
    const state = await installFreeDbMock({ providerKind: "ontops" });
    const headers = {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.55",
      "User-Agent": "Sunny-Free-Native-Test",
      "x-fp": "test-fingerprint-ontops",
    };

    const response = await worker.fetch(new Request("https://mityangho.id.vn/api/free-start", {
      method: "POST",
      headers,
      body: JSON.stringify({
        key_type_code: "D1",
        app_code: "free-fire",
        fingerprint: "test-fingerprint-ontops",
        link_channel: "primary",
      }),
    }), env());
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.ok, true);
    assert.equal(result.outbound_url, "https://ontops.link/opaque-2");
    assert.equal(state.shortlinkRequests.length, 2);
    const apiRequest = new URL(state.shortlinkRequests[0]);
    assert.equal(apiRequest.searchParams.get("apikey"), "test-provider-token");
    assert.match(apiRequest.searchParams.get("url") || "", /^https:\/\/mityangho\.id\.vn\/free\/gate\?/);
    assert.equal(result.outbound_url.includes("gt_"), false);
  });

  it("fails closed when a provider embeds the gate destination in outbound_url", async () => {
    const state = await installFreeDbMock({ providerKind: "traffic68" });
    const response = await worker.fetch(new Request("https://mityangho.id.vn/api/free-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.40",
        "User-Agent": "Sunny-Free-Native-Test",
        "x-fp": "test-fingerprint-unsafe-provider",
      },
      body: JSON.stringify({
        key_type_code: "D1",
        app_code: "free-fire",
        fingerprint: "test-fingerprint-unsafe-provider",
        link_channel: "primary",
      }),
    }), env());
    const result = await response.json();

    assert.equal(result.ok, false);
    assert.equal(result.code, "SHORTLINK_CREATE_FAILED");
    assert.equal(JSON.stringify(result).includes("gt_"), false);
    assert.equal(state.session, null);
    assert.equal(state.gate, null);
  });

  it("keeps free-start proxy fallback available when native mode is disabled", async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return jsonResponse({ ok: true, legacy_proxy: true });
    };
    const response = await worker.fetch(new Request("https://mityangho.id.vn/api/free-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.21",
      },
      body: JSON.stringify({ key_type_code: "D1" }),
    }), env());

    // Explicit per-route kill switch overrides the general flag.
    const response2 = await worker.fetch(new Request("https://mityangho.id.vn/api/free-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "203.0.113.21",
      },
      body: JSON.stringify({ key_type_code: "D1" }),
    }), { ...env(), FREE_NATIVE_START_ENABLED: "0" });

    assert.equal((await response.json()).ok, false); // first request used native and mock is not a DB
    assert.equal(response2.status, 200);
    assert.deepEqual(await response2.json(), { ok: true, legacy_proxy: true });
    assert.equal(calls.some((value) => value.endsWith("/functions/v1/free-start")), true);
  });

  it("runs bounded database maintenance from the Cloudflare cron without Edge Functions", async () => {
    const calls = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      calls.push({ url: url.toString(), method: String(init.method || "GET").toUpperCase() });
      if (url.pathname.includes("/functions/v1/")) {
        return jsonResponse({ ok: false, code: "UNEXPECTED_EDGE_CALL" }, 500);
      }
      if (url.pathname === "/rest/v1/rpc/sunny_daily_maintenance") {
        return jsonResponse({ ok: true, expired_licenses_deleted: 3 });
      }
      throw new Error(`Unhandled maintenance mock request: ${url}`);
    };

    const pending = [];
    const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise)); } };
    await worker.scheduled({}, { ...env(), FREE_MAINTENANCE_ENABLED: "1" }, ctx);
    await Promise.all(pending);

    assert.equal(calls.some((call) => new URL(call.url).pathname === "/rest/v1/rpc/sunny_daily_maintenance"), true);
    assert.equal(calls.some((call) => new URL(call.url).pathname.includes("/functions/v1/")), false);
  });

});
