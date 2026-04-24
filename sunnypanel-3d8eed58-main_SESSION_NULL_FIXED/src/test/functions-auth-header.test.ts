import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunction, postFunction } from "../lib/functions";

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

  it("falls back to direct Supabase functions when gateway says function not found", async () => {
    vi.stubEnv("VITE_PUBLIC_API_BASE_URL", "https://mityangho.id.vn/api");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: "Requested function was not found" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, source: "direct" }),
      });
    vi.stubGlobal("fetch", fetchMock as any);

    const data = await postFunction("/admin-rent", { action: "list" }, { authToken: "user.jwt.token" });

    expect(data).toEqual({ ok: true, source: "direct" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://mityangho.id.vn/api/admin-rent");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://ijvhlhdrncxtxosmnbtt.supabase.co/functions/v1/admin-rent");
  });

  it("falls back to direct Supabase functions for GET when gateway is temporarily unavailable", async () => {
    vi.stubEnv("VITE_PUBLIC_API_BASE_URL", "https://mityangho.id.vn/api");

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("gateway down"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, source: "direct" }),
      });
    vi.stubGlobal("fetch", fetchMock as any);

    const data = await getFunction("/free-config");

    expect(data).toEqual({ ok: true, source: "direct" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://mityangho.id.vn/api/free-config");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://ijvhlhdrncxtxosmnbtt.supabase.co/functions/v1/free-config");
  });
});
