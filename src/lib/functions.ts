export function getFunctionsBaseUrl() {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error("Missing backend URL");
  return `${base}/functions/v1`;
}

export async function getFunction<T>(
  path: string,
  opts?: { authToken?: string | null },
): Promise<T> {
  const url = `${getFunctionsBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...(opts?.authToken ? { Authorization: `Bearer ${opts.authToken}` } : {}),
    },
    credentials: "omit",
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.msg || data.error)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function postFunction<T>(
  path: string,
  body: unknown,
  opts?: { authToken?: string | null },
): Promise<T> {
  const url = `${getFunctionsBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts?.authToken ? { Authorization: `Bearer ${opts.authToken}` } : {}),
    },
    credentials: "omit",
    body: JSON.stringify(body ?? {}),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && (data.msg || data.error)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
