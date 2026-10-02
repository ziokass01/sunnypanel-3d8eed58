import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { authenticateFreeIngress } from "../../supabase/functions/_shared/free-ingress";
const secret="fixture-secret", route="free-gate", ua="Fixture UA", ip="203.0.113.7";
const hex=(v:ArrayBuffer)=>Array.from(new Uint8Array(v),x=>x.toString(16).padStart(2,"0")).join("");
beforeEach(()=>vi.stubGlobal("crypto",webcrypto));afterEach(()=>vi.unstubAllGlobals());
async function signed({ts=String(Math.floor(Date.now()/1000)),signedRoute=route,body='{"out_token":"fixture"}'}={}){
 const nonce="a".repeat(32),hash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(body)));
 const canonical=["free-v1","POST",signedRoute,ts,nonce,ip,ua,hash].join("\n");
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(canonical)));
 return new Request("https://edge.test/free-gate",{method:"POST",body,headers:{"user-agent":ua,
  "cf-connecting-ip":"198.51.100.99","x-forwarded-for":"198.51.100.99",
  "x-gateway-ts":ts,"x-gateway-nonce":nonce,"x-gateway-ip":ip,
  "x-gateway-body-sha256":hash,"x-gateway-signature":signature}});
}
describe("authenticated Free Key ingress",()=>{
 it("uses the signed IP, replacing client-controlled IP headers",async()=>{const r=await authenticateFreeIngress(await signed(),route,secret);expect(r.headers.get("cf-connecting-ip")).toBe(ip);expect(r.headers.get("x-forwarded-for")).toBe(ip);expect(await r.json()).toEqual({out_token:"fixture"})});
 it("rejects direct Edge calls with forged IP headers",async()=>{await expect(authenticateFreeIngress(new Request("https://edge.test",{method:"POST",body:"{}",headers:{"cf-connecting-ip":ip}}),route,secret)).rejects.toThrow("FREE_GATEWAY_REQUIRED")});
 it("fails closed without a gateway secret",async()=>{await expect(authenticateFreeIngress(await signed(),route,"")).rejects.toThrow("FREE_GATEWAY_SECRET_MISSING")});
 it("rejects a signature for another route",async()=>{await expect(authenticateFreeIngress(await signed({signedRoute:"free-start"}),route,secret)).rejects.toThrow("FREE_GATEWAY_SIGNATURE_INVALID")});
 it("rejects an expired timestamp",async()=>{await expect(authenticateFreeIngress(await signed({ts:String(Math.floor(Date.now()/1000)-120)}),route,secret)).rejects.toThrow("FREE_GATEWAY_REQUIRED")});
 it("rejects body modifications including forged success conditions",async()=>{const r=await signed();await expect(authenticateFreeIngress(new Request(r.url,{method:"POST",headers:r.headers,body:'{"ok":true,"passes_completed":2}'}),route,secret)).rejects.toThrow("FREE_GATEWAY_BODY_INVALID")});
 it("rejects signed IP tampering",async()=>{const r=await signed();r.headers.set("x-gateway-ip","203.0.113.8");await expect(authenticateFreeIngress(r,route,secret)).rejects.toThrow("FREE_GATEWAY_SIGNATURE_INVALID")});
 it("rejects UA tampering",async()=>{const r=await signed();r.headers.set("user-agent","Different UA");await expect(authenticateFreeIngress(r,route,secret)).rejects.toThrow("FREE_GATEWAY_SIGNATURE_INVALID")});
});
