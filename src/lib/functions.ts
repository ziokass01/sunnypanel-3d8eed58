function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getPublicApiBaseUrl() {
  const direct = String(import.meta.env.VITE_PUBLIC_API_BASE_URL ?? "").trim();
  if (!direct) return undefined;
  return trimTrailingSlash(direct);
}

function getSupabaseFunctionsBaseUrl() {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  if (!base) return undefined;
  return `${trimTrailingSlash(base)}/functions/v1`;
}

export function getFunctionsBaseUrl() {
  const publicBase = getPublicApiBaseUrl();
  if (publicBase) return publicBase;

  const supabaseBase = getSupabaseFunctionsBaseUrl();
  if (supabaseBase) return supabaseBase;

  throw new Error("Missing backend URL");
}

function getAnonKey() {
  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    undefined;
}

function getAnonJwt() {
  const anonJwt = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!anonJwt) return undefined;
  const parts = anonJwt.split(".");
  return parts.length === 3 ? anonJwt : undefined;
}

function shouldSkipAnonJwtFallback(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return ["/reset-key", "/free-config", "/free-start", "/free-gate", "/free-reveal", "/free-close"].includes(normalized);
}

function buildAuthHeader(path: string, authToken?: string | null) {
  const token = String(authToken ?? "").trim();
  if (token) return { Authorization: `Bearer ${token}` };

  if (shouldSkipAnonJwtFallback(path)) return {};

  // Some edge functions still rely on anon JWT when verify_jwt=true.
  // Never fall back to publishable key here because it is not a JWT bearer token.
  const anonJwt = getAnonJwt();
  return anonJwt ? { Authorization: `Bearer ${anonJwt}` } : {};
}

export async function getFunction<T>(
  path: string,
  opts?: { authToken?: string | null; withCredentials?: boolean; headers?: Record<string, string> },
): Promise<T> {
  const url = `${getFunctionsBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const anonKey = getAnonKey();
  if (!anonKey) throw new Error("Missing backend anon key");

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        ...buildAuthHeader(path, opts?.authToken),
        ...(opts?.headers ?? {}),
      },
      // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
      credentials: opts?.withCredentials ? "include" : "omit",
    });
  } catch (e: any) {
    // Browser-level network error (CORS blocked / DNS / mixed content / wrong project URL)
    const err = new Error(
      `Failed to fetch when calling function ${path}. Vui lòng thử lại sau.`,
    ) as Error & { code?: string; meta?: Record<string, unknown> };
    err.code = "FETCH_FAILED";
    err.meta = { path };
    throw err;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.friendly_message || data.msg || data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) as Error & { code?: string; status?: number; context?: Record<string, unknown> };
    if (data?.code) err.code = String(data.code);
    err.status = res.status;
    err.context = { json: data ?? null, status: res.status, path };
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

  // Admin functions MUST be called with a real user JWT; never fall back to anon.
  if (isAdminFn && !opts?.authToken) {
    const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
    err.code = "ADMIN_AUTH_REQUIRED";
    throw err;
  }

  // Some repos historically used both /admin-free-test and /free-admin-test.
  // If the primary one fails at the network layer (CORS / wrong deploy / wrong function name), retry once.
  const fallbackPath = path === "/admin-free-test" ? "/free-admin-test" : null;

  const triedUrls: string[] = [];

  const doFetch = async (u: string) => {
    triedUrls.push(u);
    const authHeader = buildAuthHeader(path, opts?.authToken);
    return await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        ...authHeader,
        ...(opts?.headers ?? {}),
      },
      // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
      credentials: opts?.withCredentials ? "include" : "omit",
      body: JSON.stringify(body ?? {}),
    });
  };

  let res: Response;
  try {
    res = await doFetch(primaryUrl);
  } catch (e: any) {
    // Browser-level network error (CORS blocked / DNS / mixed content / wrong project URL)
    if (fallbackPath) {
      try {
        res = await doFetch(makeUrl(fallbackPath));
      } catch {
        const err = new Error(
          `Failed to fetch when calling function ${path}. Vui lòng thử lại sau.`,
        ) as Error & { code?: string; meta?: Record<string, unknown> };
        err.code = "FETCH_FAILED";
        err.meta = { path };
        throw err;
      }
    } else {
      const err = new Error(
        `Failed to fetch when calling function ${path}. Vui lòng thử lại sau.`,
      ) as Error & { code?: string; meta?: Record<string, unknown> };
      err.code = "FETCH_FAILED";
      err.meta = { path };
      throw err;
    }
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.friendly_message || data.msg || data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) as Error & { code?: string; status?: number; context?: Record<string, unknown> };
    if (data?.code) err.code = String(data.code);
    err.status = res.status;
    err.context = { json: data ?? null, status: res.status, path, triedUrls };
    throw err;
  }
  return data as T;
}
