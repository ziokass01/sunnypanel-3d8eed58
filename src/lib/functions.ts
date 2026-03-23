export function getFunctionsBaseUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("Missing backend URL");
  return `${base}/functions/v1`;
}

function getAnonKey() {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    undefined;
}

export async function getFunction<T>(
  path: string,
  opts?: { authToken?: string | null },
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
        Authorization: `Bearer ${opts?.authToken ? opts.authToken : anonKey}`,
      },
      // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
      credentials: "include",
    });
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

export async function postFunction<T>(
  path: string,
  body: unknown,
  opts?: { authToken?: string | null; headers?: Record<string, string> },
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
    return await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${opts?.authToken ? opts.authToken : anonKey}`,
        ...(opts?.headers ?? {}),
      },
      // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
      credentials: "include",
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
