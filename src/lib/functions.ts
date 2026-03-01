import { supabase } from "@/integrations/supabase/client";

// NOTE: When multiple requests fail at the same time due to an expired access token,
// we must avoid spamming refreshSession() concurrently. This mutex ensures we only
// refresh once and all callers await the same promise.
let refreshInFlight: Promise<string | null> | null = null;

export function getFunctionsBaseUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("Missing backend URL");
  return `${base}/functions/v1`;
}

function getAnonKey() {
  // Prefer publishable key when available (legacy anon key is supported as fallback).
  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    undefined;
}

function getProjectRef(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return null;
  try {
    const host = new URL(base).hostname;
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

function getAuthStorageKey(): string | null {
  const ref = getProjectRef();
  return ref ? `sb-${ref}-auth-token` : null;
}

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const key = getAuthStorageKey();
  if (!key) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed: any = JSON.parse(raw);
    const sess = parsed?.currentSession ?? parsed?.session ?? parsed;
    const token = sess?.access_token;
    return typeof token === "string" && token.length ? token : null;
  } catch {
    return null;
  }
}

async function readBody(res: Response): Promise<{ json: any | null; text: string | null }> {
  const ct = (res.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      return { json: await res.json(), text: null };
    }
    const text = await res.text();
    // Some upstream errors return plain text.
    try {
      return { json: JSON.parse(text), text };
    } catch {
      return { json: null, text };
    }
  } catch {
    return { json: null, text: null };
  }
}

function isInvalidJwt(status: number, msg: string) {
  if (status !== 401) return false;
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("invalid jwt") ||
    m.includes("jwt expired") ||
    m.includes("expired jwt") ||
    m.includes("signature has expired") ||
    m.includes("token has expired")
  );
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return await refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function makeAuthError(message: string, status?: number, code?: string) {
  const err = new Error(message) as Error & { code?: string; status?: number };
  if (code) err.code = code;
  if (typeof status === "number") err.status = status;
  return err;
}

export async function getFunction<T>(
  path: string,
  opts?: { authToken?: string | null; withCredentials?: boolean },
): Promise<T> {
  const url = `${getFunctionsBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const anonKey = getAnonKey();
  if (!anonKey) throw new Error("Missing backend anon key");

  const fn = (path.startsWith("/") ? path.slice(1) : path).trim();
  const isAdminFn = fn.startsWith("admin-");
  const tokenFromCaller = opts?.authToken ?? null;
  const tokenFromStorage = getStoredAccessToken();
  const initialToken = tokenFromCaller || tokenFromStorage;

  if (isAdminFn && !initialToken) {
    throw makeAuthError("ADMIN_AUTH_REQUIRED", 401, "ADMIN_AUTH_REQUIRED");
  }

  const doFetch = async (token: string | null) => {
    return await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token ? token : anonKey}`,
      },
      // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
      credentials: opts?.withCredentials ? "include" : "omit",
    });
  };

  let res: Response;
  try {
    res = await doFetch(initialToken);
  } catch (e: any) {
    // Browser-level network error (CORS blocked / DNS / mixed content / wrong project URL)
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const err = new Error(
      `Failed to fetch when calling function ${path} (origin: ${origin || "(unknown)"}, url: ${url}). ` +
        "Gợi ý: kiểm tra (1) backend URL/project có đúng 1 project duy nhất, (2) CORS allow origin cho domain hiện tại, (3) function đã deploy đúng project."
    ) as Error & { code?: string; meta?: Record<string, unknown> };
    err.code = "FETCH_FAILED";
    err.meta = { path, origin, url };
    throw err;
  }

  // Auto refresh + retry once on Invalid JWT (common when access_token expires).
  if (!res.ok) {
    const { json: data, text } = await readBody(res);
    const msg = (data && (data.msg || data.message || data.error)) || text || `Request failed (${res.status})`;
    // Only refresh+retry when it's very likely the JWT is invalid/expired.
    // A 401 from admin-* endpoints can also mean "not admin"; do NOT refresh-loop in that case.
    const shouldTryRefresh = isInvalidJwt(res.status, String(msg));
    if (shouldTryRefresh) {
      const nextToken = (await refreshAccessToken()) || getStoredAccessToken();
      if (nextToken) {
        const retryRes = await doFetch(nextToken);
        if (retryRes.ok) {
          const okJson = await retryRes.json().catch(() => null);
          return okJson as T;
        }
        // fallthrough to throw below with the retry response details
        res = retryRes;
      }
    }
  }

  const { json: data, text } = await readBody(res);
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error)) || text || `Request failed (${res.status})`;
    const err = makeAuthError(String(msg), res.status, data?.code ? String(data.code) : undefined);
  // Admin endpoints: distinguish between (a) session/JWT problems and (b) missing admin rights.
    // We avoid hard-signout for (b) so the user can still stay logged in and fix allowlists.
    if (isAdminFn && res.status === 401) {
      const backendCode = data?.code ? String(data.code) : "";
      const backendMsg = String(msg || "").toLowerCase();

      // If backend provided a structured code (JWT_INVALID, ADMIN_REQUIRED, NOT_AUTHENTICATED, ...), keep it.
      if (backendCode) {
        err.code = backendCode;
        err.message = backendCode;
        throw err;
      }

      // Fallback heuristics when backend didn't send a code.
      if (backendMsg.includes("admin required")) {
        err.code = "ADMIN_REQUIRED";
        err.message = "ADMIN_REQUIRED";
      } else {
        err.code = "ADMIN_AUTH_REQUIRED";
        err.message = "ADMIN_AUTH_REQUIRED";
      }
      throw err;
    }

    if (isInvalidJwt(res.status, String(msg))) {
      err.code = "JWT_INVALID";
      err.message = "JWT_INVALID";
    }
    throw err;
  }
  return data as T;
}

export async function postFunction<T>(
  path: string,
  body: unknown,
  opts?: { authToken?: string | null; headers?: Record<string, string>; withCredentials?: boolean },
): Promise<T> {
  const makeUrl = (p: string) => `${getFunctionsBaseUrl()}${p.startsWith("/") ? p : `/${p}`}`;
  const primaryUrl = makeUrl(path);

  const anonKey = getAnonKey();
  if (!anonKey) throw new Error("Missing backend anon key");

  const normalizedPath = (path.startsWith("/") ? path.slice(1) : path).trim();
  const isAdminFn = normalizedPath.startsWith("admin-");

  const tokenFromCaller = opts?.authToken ?? null;
  const tokenFromStorage = getStoredAccessToken();
  const initialToken = tokenFromCaller || tokenFromStorage;

  // Admin functions MUST be called with a real user JWT; never fall back to anon.
  if (isAdminFn && !initialToken) {
    throw makeAuthError("ADMIN_AUTH_REQUIRED", 401, "ADMIN_AUTH_REQUIRED");
  }

  // Some repos historically used both /admin-free-test and /free-admin-test.
  // If the primary one fails at the network layer (CORS / wrong deploy / wrong function name), retry once.
  const fallbackPath = path === "/admin-free-test" ? "/free-admin-test" : null;

  const triedUrls: string[] = [];

  const doFetch = async (u: string, token: string | null) => {
    triedUrls.push(u);
    return await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token ? token : anonKey}`,
        ...(opts?.headers ?? {}),
      },
      // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
      credentials: opts?.withCredentials ? "include" : "omit",
      body: JSON.stringify(body ?? {}),
    });
  };

  let res: Response;
  try {
    res = await doFetch(primaryUrl, initialToken);
  } catch (e: any) {
    // Browser-level network error (CORS blocked / DNS / mixed content / wrong project URL)
    if (fallbackPath) {
      try {
        res = await doFetch(makeUrl(fallbackPath), initialToken);
      } catch {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const err = new Error(
          `Failed to fetch when calling function ${path} (origin: ${origin || "(unknown)"}, url: ${primaryUrl}). ` +
            `Tried URLs: ${triedUrls.join(", ")}. ` +
            "Gợi ý: kiểm tra (1) backend URL/project có đúng 1 project duy nhất, (2) CORS allow origin cho domain hiện tại, (3) function đã deploy đúng project.",
        ) as Error & { code?: string; meta?: Record<string, unknown> };
        err.code = "FETCH_FAILED";
        err.meta = { path, origin, url: primaryUrl, triedUrls };
        throw err;
      }
    } else {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const err = new Error(
        `Failed to fetch when calling function ${path} (origin: ${origin || "(unknown)"}, url: ${primaryUrl}). ` +
          `Tried URLs: ${triedUrls.join(", ") || primaryUrl}. ` +
          "Gợi ý: kiểm tra (1) backend URL/project có đúng 1 project duy nhất, (2) CORS allow origin cho domain hiện tại, (3) function đã deploy đúng project.",
      ) as Error & { code?: string; meta?: Record<string, unknown> };
      err.code = "FETCH_FAILED";
      err.meta = { path, origin, url: primaryUrl, triedUrls };
      throw err;
    }
  }

  // Auto refresh + retry once on Invalid JWT (common when access_token expires).
  if (!res.ok) {
    const { json: data, text } = await readBody(res);
    const msg = (data && (data.msg || data.message || data.error)) || text || `Request failed (${res.status})`;
    const shouldTryRefresh = isInvalidJwt(res.status, String(msg));
    if (shouldTryRefresh) {
      const nextToken = (await refreshAccessToken()) || getStoredAccessToken();
      if (nextToken) {
        const retryRes = await doFetch(primaryUrl, nextToken);
        if (retryRes.ok) {
          const okJson = await retryRes.json().catch(() => null);
          return okJson as T;
        }
        res = retryRes;
      }
    }
  }

  const { json: data, text } = await readBody(res);
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error)) || text || `Request failed (${res.status})`;
    const err = makeAuthError(String(msg), res.status, data?.code ? String(data.code) : undefined);
  // Admin endpoints: distinguish between (a) session/JWT problems and (b) missing admin rights.
    // We avoid hard-signout for (b) so the user can still stay logged in and fix allowlists.
    if (isAdminFn && res.status === 401) {
      const backendCode = data?.code ? String(data.code) : "";
      const backendMsg = String(msg || "").toLowerCase();

      // If backend provided a structured code (JWT_INVALID, ADMIN_REQUIRED, NOT_AUTHENTICATED, ...), keep it.
      if (backendCode) {
        err.code = backendCode;
        err.message = backendCode;
        throw err;
      }

      // Fallback heuristics when backend didn't send a code.
      if (backendMsg.includes("admin required")) {
        err.code = "ADMIN_REQUIRED";
        err.message = "ADMIN_REQUIRED";
      } else {
        err.code = "ADMIN_AUTH_REQUIRED";
        err.message = "ADMIN_AUTH_REQUIRED";
      }
      throw err;
    }

      if (looksLikeMissingToken || looksLikeInvalidJwt) {
        err.code = "ADMIN_AUTH_REQUIRED";
        err.message = "ADMIN_AUTH_REQUIRED";
        throw err;
      }

      // Fallback: treat as re-auth required.
      err.code = "ADMIN_AUTH_REQUIRED";
      err.message = "ADMIN_AUTH_REQUIRED";
      throw err;
    }

    if (isInvalidJwt(res.status, String(msg))) {
      err.code = "JWT_INVALID";
      err.message = "JWT_INVALID";
    }
    throw err;
  }
  return data as T;
}
