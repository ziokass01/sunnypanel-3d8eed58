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

  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${opts?.authToken ? opts.authToken : anonKey}`,
    },
    // IMPORTANT: include cookies for flows that rely on httpOnly cookies (e.g. fk_fp/fk_sess)
    credentials: "include",
  });

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
  const url = `${getFunctionsBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const anonKey = getAnonKey();
  if (!anonKey) throw new Error("Missing backend anon key");

  const res = await fetch(url, {
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
