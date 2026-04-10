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

function getFunctionUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function getPrimaryFunctionsBaseUrl() {
  return getPublicApiBaseUrl() ?? getSupabaseFunctionsBaseUrl();
}

function getFallbackFunctionsBaseUrl(primaryBaseUrl?: string) {
  const direct = getSupabaseFunctionsBaseUrl();
  if (!direct) return undefined;
  if (primaryBaseUrl && direct === primaryBaseUrl) return undefined;
  return direct;
}

export function getFunctionsBaseUrl() {
  const primary = getPrimaryFunctionsBaseUrl();
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

function shouldSkipAnonJwtFallback(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
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

  const primaryBaseUrl = getFunctionsBaseUrl();
  const fallbackBaseUrl = getFallbackFunctionsBaseUrl(primaryBaseUrl);
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
