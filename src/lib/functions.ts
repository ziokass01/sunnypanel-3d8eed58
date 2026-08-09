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

function getFreeConfigVpsBaseUrl() {
  const configured = String(import.meta.env.VITE_FREE_CONFIG_API_BASE_URL ?? "").trim();
  const base = trimTrailingSlash(configured || "https://free-api.mityangho.id.vn");
  return base.endsWith("/api") ? base : `${base}/api`;
}

function getFunctionUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeFunctionPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

const DIRECT_SUPABASE_FUNCTIONS = new Set<string>([
  // Intentionally empty for public Free Key hot paths.
]);

const CLOUDFLARE_ONLY_FUNCTIONS = new Set([
  "/free-reveal",
  "/free-resolve",
]);

function shouldPreferDirectSupabase(path?: string) {
  if (!path) return false;
  return DIRECT_SUPABASE_FUNCTIONS.has(normalizeFunctionPath(path));
}

function getPrimaryFunctionsBaseUrl(path?: string) {
  const normalized = path ? normalizeFunctionPath(path) : "";
  if (normalized === "/free-config") {
    return getFreeConfigVpsBaseUrl();
  }
  if (normalized && CLOUDFLARE_ONLY_FUNCTIONS.has(normalized)) {
    return getPublicApiBaseUrl();
  }
  if (shouldPreferDirectSupabase(path)) {
    return getSupabaseFunctionsBaseUrl() ?? getPublicApiBaseUrl();
  }
  return getPublicApiBaseUrl() ?? getSupabaseFunctionsBaseUrl();
}

const NO_AUTOMATIC_FALLBACK_PATHS = new Set([
  // free-config is served by the VPS tunnel. Do not silently fall back to
  // Supabase/Worker and reintroduce the hot-path quota during an outage.
  "/free-config",
  // free-start determines bonus duration and whether secondary is allowed.
  // Never bypass the Worker bonus policy by retrying a second backend.
  "/free-start",
  // free-reveal is a one-time mint/lock mutation. The Worker owns the kill
  // switch fallback; the browser must never replay it on a second backend.
  "/free-reveal",
  // free-resolve is high-volume; browser must not bypass Cloudflare.
  "/free-resolve",
]);

function getFallbackFunctionsBaseUrl(primaryBaseUrl?: string, path?: string) {
  if (path && NO_AUTOMATIC_FALLBACK_PATHS.has(normalizeFunctionPath(path))) return undefined;
  const fallback = shouldPreferDirectSupabase(path)
    ? getPublicApiBaseUrl()
    : getSupabaseFunctionsBaseUrl();
  if (!fallback) return undefined;
  if (primaryBaseUrl && fallback === primaryBaseUrl) return undefined;
  return fallback;
}

export function getFunctionsBaseUrl(path?: string) {
  const primary = getPrimaryFunctionsBaseUrl(path);
  if (primary) return primary;
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

function isRentUserFunction(path: string) {
  return normalizeFunctionPath(path) === "/rent-user";
}

function shouldSkipAnonJwtFallback(path: string) {
  const normalized = normalizeFunctionPath(path);
  return [
    "/verify-key",
    "/rent-verify-key",
    "/reset-key",
    "/free-config",
    "/free-start",
    "/free-gate",
    "/free-reveal",
    "/free-resolve",
    "/free-close",
    "/generate-license-key",
  ].includes(normalized);
}

function buildAuthHeader(path: string, authToken?: string | null) {
  const token = String(authToken ?? "").trim();

  // /rent-user uses its own custom session JWT. Do not put that custom JWT in
  // Authorization, because a Supabase deployment that accidentally has JWT
  // verification enabled will reject it before the Edge Function can add CORS
  // headers. Keep Authorization reserved for the Supabase anon JWT when present
  // and forward the rent session through x-rent-token instead.
  if (token && isRentUserFunction(path)) {
    const anonJwt = getAnonJwt();
    return {
      ...(anonJwt ? { Authorization: `Bearer ${anonJwt}` } : {}),
      "x-rent-token": token,
    };
  }

  if (token) return { Authorization: `Bearer ${token}` };

  if (shouldSkipAnonJwtFallback(path)) return {};

  const anonJwt = getAnonJwt();
  return anonJwt ? { Authorization: `Bearer ${anonJwt}` } : {};
}

type RequestError = Error & {
  code?: string;
  status?: number;
  context?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

function readErrorMessage(data: any, status: number) {
  const raw = data && (data.friendly_message || data.msg || data.message || data.error);
  if (typeof raw === "string" && raw.trim()) return raw;
  if (raw != null) return JSON.stringify(raw);
  return `Request failed (${status})`;
}

function buildRequestError(path: string, status: number, data: any, extra?: Record<string, unknown>) {
  const err = new Error(readErrorMessage(data, status)) as RequestError;
  if (data?.code) err.code = String(data.code);
  err.status = status;
  err.context = { json: data ?? null, status, path, ...(extra ?? {}) };
  return err;
}

function buildFetchFailedError(path: string, extra?: Record<string, unknown>) {
  const err = new Error(`Failed to fetch when calling function ${path}. Vui lòng thử lại sau.`) as RequestError;
  err.code = "FETCH_FAILED";
  err.meta = { path, ...(extra ?? {}) };
  return err;
}

function isLikelyRoutingOrDeployError(status: number, data: any) {
  const code = String(data?.code ?? "").trim().toUpperCase();
  const message = readErrorMessage(data, status).toLowerCase();
  if ([404, 502, 503].includes(status)) return true;
  if (["FUNCTION_NOT_ALLOWED", "SERVER_MISCONFIG", "UPSTREAM_FETCH_FAILED", "BOOT_ERROR", "FUNCTION_INVOCATION_FAILED"].includes(code)) return true;
  return message.includes("requested function was not found")
    || message.includes("function not found")
    || message.includes("worker response")
    || message.includes("upstream")
    || message.includes("failed to fetch");
}

async function invokeJson<T>(opts: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  authToken?: string | null;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}) {
  const anonKey = getAnonKey();
  if (!anonKey) throw new Error("Missing backend anon key");

  const primaryBaseUrl = getFunctionsBaseUrl(opts.path);
  const fallbackBaseUrl = getFallbackFunctionsBaseUrl(primaryBaseUrl, opts.path);
  const pathCandidates = opts.path === "/admin-free-test" ? [opts.path, "/free-admin-test"] : [opts.path];
  const attemptUrls: string[] = [];
  const problems: RequestError[] = [];

  const baseEntries = [
    { baseUrl: primaryBaseUrl, allowFallback: true },
    ...(fallbackBaseUrl ? [{ baseUrl: fallbackBaseUrl, allowFallback: false }] : []),
  ];

  for (const baseEntry of baseEntries) {
    for (const candidatePath of pathCandidates) {
      const url = getFunctionUrl(baseEntry.baseUrl, candidatePath);
      attemptUrls.push(url);

      let res: Response;
      try {
        const authHeader = buildAuthHeader(candidatePath, opts.authToken);
        res = await fetch(url, {
          method: opts.method,
          headers: {
            ...(opts.method === "POST" ? { "Content-Type": "application/json" } : {}),
            apikey: anonKey,
            ...authHeader,
            ...(opts.headers ?? {}),
          },
          credentials: opts.withCredentials ? "include" : "omit",
          ...(opts.method === "POST" ? { body: JSON.stringify(opts.body ?? {}) } : {}),
        });
      } catch {
        if (baseEntry.allowFallback && fallbackBaseUrl && baseEntry.baseUrl != fallbackBaseUrl) {
          continue;
        }
        if (candidatePath != pathCandidates[pathCandidates.length - 1]) {
          continue;
        }
        throw buildFetchFailedError(opts.path, { attemptUrls });
      }

      const data = await res.json().catch(() => null);
      if (res.ok) return data as T;

      // Public gate/check functions intentionally return structured JSON for user-flow denials.
      // Older deployments may still use HTTP 400/403/426; do not turn those into generic
      // "service unavailable" errors when the body already contains ok:false/code/msg.
      const normalizedCandidatePath = normalizeFunctionPath(candidatePath);
      const structuredPublicDenialPaths = new Set([
        "/free-gate",
        "/free-start",
        "/free-reveal",
        "/free-resolve",
        "/fake-lag-check",
      ]);
      if (res.status < 500 && structuredPublicDenialPaths.has(normalizedCandidatePath) && data && typeof data === "object" && (data as any).ok === false) {
        return data as T;
      }

      const err = buildRequestError(opts.path, res.status, data, {
        attemptUrls,
        requestedPath: candidatePath,
        baseUrl: baseEntry.baseUrl,
      });
      problems.push(err);

      const canTryAlias = candidatePath != pathCandidates[pathCandidates.length - 1];
      if (canTryAlias && isLikelyRoutingOrDeployError(res.status, data)) {
        continue;
      }

      if (baseEntry.allowFallback && fallbackBaseUrl && baseEntry.baseUrl != fallbackBaseUrl && isLikelyRoutingOrDeployError(res.status, data)) {
        break;
      }

      throw err;
    }
  }

  throw problems[problems.length - 1] ?? buildFetchFailedError(opts.path, { attemptUrls });
}

export async function getFunction<T>(
  path: string,
  opts?: { authToken?: string | null; withCredentials?: boolean; headers?: Record<string, string> },
): Promise<T> {
  return await invokeJson<T>({
    method: "GET",
    path,
    authToken: opts?.authToken,
    withCredentials: opts?.withCredentials,
    headers: opts?.headers,
  });
}

export async function postFunction<T>(
  path: string,
  body: unknown,
  opts?: { authToken?: string | null; headers?: Record<string, string>; withCredentials?: boolean },
): Promise<T> {
  const normalizedPath = (path.startsWith("/") ? path.slice(1) : path).trim();
  const isAdminFn = normalizedPath.startsWith("admin-");

  if (isAdminFn && !opts?.authToken) {
    const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
    err.code = "ADMIN_AUTH_REQUIRED";
    throw err;
  }

  return await invokeJson<T>({
    method: "POST",
    path,
    body,
    authToken: opts?.authToken,
    withCredentials: opts?.withCredentials,
    headers: opts?.headers,
  });
}
