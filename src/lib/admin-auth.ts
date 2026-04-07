import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";

const ADMIN_TOKEN_SKEW_MS = 60_000;

type AdminAuthError = Error & { code?: string };

type PostAdminFunctionOptions = {
  headers?: Record<string, string>;
  withCredentials?: boolean;
};

function isSessionFresh(session: { access_token?: string | null; expires_at?: number | null } | null | undefined) {
  const token = String(session?.access_token ?? "").trim();
  const expiresAtSec = Number(session?.expires_at ?? 0);
  if (!token) return false;
  if (!Number.isFinite(expiresAtSec) || expiresAtSec <= 0) return true;
  return (expiresAtSec * 1000) - Date.now() > ADMIN_TOKEN_SKEW_MS;
}

function buildAdminAuthRequiredError() {
  const err = new Error("ADMIN_AUTH_REQUIRED") as AdminAuthError;
  err.code = "ADMIN_AUTH_REQUIRED";
  return err;
}

export async function getAdminAuthToken(opts?: { forceRefresh?: boolean }) {
  if (!opts?.forceRefresh) {
    const current = await supabase.auth.getSession();
    const currentSession = current.data.session;
    if (isSessionFresh(currentSession)) {
      return String(currentSession?.access_token ?? "").trim();
    }
  }

  const refreshed = await supabase.auth.refreshSession();
  const refreshedSession = refreshed.data.session;
  if (isSessionFresh(refreshedSession)) {
    return String(refreshedSession?.access_token ?? "").trim();
  }

  const fallback = await supabase.auth.getSession();
  const fallbackSession = fallback.data.session;
  if (isSessionFresh(fallbackSession)) {
    return String(fallbackSession?.access_token ?? "").trim();
  }

  throw buildAdminAuthRequiredError();
}

function shouldRetryWithFreshToken(error: any) {
  const status = Number(error?.status ?? error?.context?.status ?? 0);
  const code = String(error?.code ?? error?.context?.json?.code ?? "").trim().toUpperCase();
  const message = [
    error?.message,
    error?.context?.json?.message,
    error?.context?.json?.msg,
    error?.context?.json?.error,
    error?.context?.json?.friendly_message,
  ]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase())
    .join(" ");

  return status === 401 || code === "UNAUTHORIZED" || message.includes("invalid jwt");
}

export async function postAdminFunction<T>(
  path: string,
  body: unknown,
  opts?: PostAdminFunctionOptions,
): Promise<T> {
  const token = await getAdminAuthToken();
  try {
    return await postFunction<T>(path, body, { authToken: token, ...(opts ?? {}) });
  } catch (error: any) {
    if (!shouldRetryWithFreshToken(error)) throw error;
    const refreshedToken = await getAdminAuthToken({ forceRefresh: true });
    return await postFunction<T>(path, body, { authToken: refreshedToken, ...(opts ?? {}) });
  }
}
