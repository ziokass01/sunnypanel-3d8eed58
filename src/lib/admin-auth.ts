import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";

function adminAuthRequiredError() {
  const err = new Error("ADMIN_AUTH_REQUIRED") as Error & { code?: string };
  err.code = "ADMIN_AUTH_REQUIRED";
  return err;
}

function shouldRefreshToken(session: { access_token?: string | null; expires_at?: number | null } | null | undefined) {
  if (!session?.access_token) return true;
  const expiresAt = Number(session.expires_at ?? 0);
  if (!expiresAt) return true;
  return expiresAt * 1000 <= Date.now() + 60_000;
}

function isInvalidJwtError(error: any) {
  const status = Number(error?.status ?? error?.context?.status ?? 0);
  const message = String(
    error?.context?.json?.friendly_message
      ?? error?.context?.json?.message
      ?? error?.context?.json?.msg
      ?? error?.message
      ?? "",
  ).toLowerCase();

  return status === 401 || message.includes("invalid jwt") || message.includes("jwt expired");
}

export async function getFreshAdminAuthToken(forceRefresh = false) {
  let session = (await supabase.auth.getSession()).data.session;

  if (forceRefresh || shouldRefreshToken(session)) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? (await supabase.auth.getSession()).data.session;
  }

  const token = session?.access_token ?? null;
  if (!token) throw adminAuthRequiredError();
  return token;
}

export async function postAdminFunction<T>(
  path: string,
  body: unknown,
  opts?: { headers?: Record<string, string>; withCredentials?: boolean },
): Promise<T> {
  const run = async (forceRefresh: boolean) => {
    const authToken = await getFreshAdminAuthToken(forceRefresh);
    return await postFunction<T>(path, body, {
      authToken,
      headers: opts?.headers,
      withCredentials: opts?.withCredentials,
    });
  };

  try {
    return await run(false);
  } catch (error: any) {
    if (isInvalidJwtError(error)) {
      return await run(true);
    }
    throw error;
  }
}
