import {beforeEach,describe,expect,it} from "vitest";
import {readBundle,writeBundle,isFresh} from "../lib/freeFlow";
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
describe("Free Key bearer storage",()=>{
 it("uses server TTL for a two-pass flow lasting longer than 500 seconds",()=>{expect(isFresh({version:1,created_at:Date.now()-600000,session_id:"s",out_token:"a",expires_at:new Date(Date.now()+60000).toISOString()})).toBe(true)});
 it("rejects expired or malformed server TTL",()=>{const b={version:1 as const,created_at:Date.now(),session_id:"s",out_token:"a"};expect(isFresh({...b,expires_at:new Date(Date.now()-1).toISOString()})).toBe(false);expect(isFresh({...b,expires_at:"invalid"})).toBe(false)});
 it("rotation removes an old claim ticket and preserves absolute session TTL",()=>{const ttl=new Date(Date.now()+60000).toISOString();writeBundle({session_id:"s",out_token:"a",claim_token:"old-claim",expires_at:ttl});writeBundle({session_id:"s",out_token:"b"});expect(readBundle()?.claim_token).toBeUndefined();expect(readBundle()?.expires_at).toBe(ttl)});
 it("new session does not borrow previous session TTL or claim",()=>{writeBundle({session_id:"s1",out_token:"a",claim_token:"old",expires_at:new Date(Date.now()+60000).toISOString()});writeBundle({session_id:"s2",out_token:"b"});expect(readBundle()?.expires_at).toBeUndefined();expect(readBundle()?.claim_token).toBeUndefined()});
 it("keeps app bundles independent",()=>{writeBundle({session_id:"ff",out_token:"ff-token"},"free-fire");writeBundle({session_id:"ai",out_token:"ai-token"},"ai-coding");expect(readBundle("ai-coding")?.session_id).toBe("ai");expect(readBundle("free-fire")?.session_id).toBe("ff")});
});
