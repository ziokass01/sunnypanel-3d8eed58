function normalizeOrigin(raw?: string | null) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function getConfiguredSupabaseBaseUrl() {
  return normalizeOrigin(import.meta.env.VITE_SUPABASE_URL as string | undefined);
}

function getProjectDerivedBaseUrl() {
  const projectId = String(import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined ?? "").trim();
  if (!/^[a-z0-9]{10,}$/.test(projectId)) return "";
  return `https://${projectId}.supabase.co`;
}

export function getFunctionsBaseUrl() {
  const base = getConfiguredSupabaseBaseUrl() || getProjectDerivedBaseUrl();
  if (!base) throw new Error("Missing backend URL");
  return `${base}/functions/v1`;
}

function getFunctionsBaseUrls() {
  const configured = getConfiguredSupabaseBaseUrl();
  const derived = getProjectDerivedBaseUrl();
  return Array.from(new Set([configured, derived].filter(Boolean)));
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
  const urls = getFunctionsBaseUrls().map((base) => `${base}/functions/v1${path.startsWith("/") ? path : `/${path}`}`);

  const anonKey = getAnonKey();
  if (!anonKey) throw new Error("Missing backend anon key");

  let res: Response | null = null;
  let networkError: unknown = null;
  for (const url of urls) {
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: anonKey,
          ...buildAuthHeader(path, opts?.authToken),
          ...(opts?.headers ?? {}),
        },
        credentials: opts?.withCredentials ? "include" : "omit",
      });
      break;
    } catch (e) {
      networkError = e;
    }
  }

  if (!res) {
    const err = new Error(
      `Failed to fetch when calling function ${path}. Vui lòng thử lại sau.`,
    ) as Error & { code?: string; meta?: Record<string, unknown> };
    err.code = "FETCH_FAILED";
    err.meta = { path, tried: urls, cause: String((networkError as any)?.message ?? networkError ?? "") };
    throw err;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(String(msg)) as Error & { code?: string; status?: number };
    if ((data as any)?.code) err.code = String((data as any).code);
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function postFunction<T>(
  path: string,
  body: unknown,
  opts?: { authToken?: string | null; headers?: Record<string, string>; withCredentials?: boolean },
): Promise<T> {
  const makeUrls = (p: string) => getFunctionsBaseUrls().map((base) => `${base}/functions/v1${p.startsWith("/") ? p : `/${p}`}`);
  const primaryUrls = makeUrls(path);

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
      credentials: opts?.withCredentials ? "include" : "omit",
      body: JSON.stringify(body ?? {}),
    });
  };

  let res: Response | null = null;
  let networkError: unknown = null;
  for (const url of primaryUrls) {
    try {
      res = await doFetch(url);
      break;
    } catch (e) {
      networkError = e;
    }
  }

  if (!res && fallbackPath) {
    for (const url of makeUrls(fallbackPath)) {
      try {
        res = await doFetch(url);
        break;
      } catch (e) {
        networkError = e;
      }
    }
  }

  if (!res) {
    const err = new Error(
      `Failed to fetch when calling function ${path}. Vui lòng thử lại sau.`,
    ) as Error & { code?: string; meta?: Record<string, unknown> };
    err.code = "FETCH_FAILED";
    err.meta = { path, tried: triedUrls, cause: String((networkError as any)?.message ?? networkError ?? "") };
    throw err;
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.msg || data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(String(msg)) as Error & { code?: string; status?: number };
    if (data?.code) err.code = String(data.code);
    err.status = res.status;
    throw err;
  }
  return data as T;
}
