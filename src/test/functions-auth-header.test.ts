import { beforeEach, describe, expect, it, vi } from "vitest";
import { postFunction } from "../lib/functions";

describe("functions auth headers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://ijvhlhdrncxtxosmnbtt.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_xxx");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });

  it("does not attach Authorization for public function when only publishable key exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock as any);

    await postFunction("/reset-key", { action: "check", key: "SUNNY-ABCD-EFGH-IJKL" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("sb_publishable_xxx");
    expect(headers.Authorization).toBeUndefined();
  });

  it("does not attach Authorization for public free-start when only publishable key exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock as any);

    await postFunction("/free-start", { key_type_code: "D1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("sb_publishable_xxx");
    expect(headers.Authorization).toBeUndefined();
  });

  it("still attaches Authorization bearer for authenticated admin function calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock as any);

    await postFunction("/admin-free-test", { ping: true }, { authToken: "user.jwt.token" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer user.jwt.token");
  });
});
