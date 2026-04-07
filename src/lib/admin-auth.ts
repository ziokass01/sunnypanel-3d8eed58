import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";

function buildAdminAuthError(message = "ADMIN_AUTH_REQUIRED") {
  const err = new Error(message) as Error & { code?: string };
  err.code = "ADMIN_AUTH_REQUIRED";
  return err;
}

function isTokenExpiring(expiresAt?: number | null, skewSeconds = 90) {
  if (!expiresAt) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return expiresAt <= nowSec + skewSeconds;
}

export async function getFreshAdminAuthToken(opts?: { forceRefresh?: boolean }) {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session ?? null;

  if (!session?.refresh_token && !session?.access_token) {
    throw buildAdminAuthError();
  }

  const shouldRefresh = Boolean(opts?.forceRefresh) || isTokenExpiring(session?.expires_at ?? null);
  if (shouldRefresh) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session?.access_token) {
      session = refreshData.session;
    }
  }

  const token = String(session?.access_token ?? "").trim();
  if (!token) {
    throw buildAdminAuthError();
  }

  return token;
}

export function isInvalidJwtError(error: any) {
  const status = Number(error?.status ?? error?.context?.status ?? 0);
  const code = String(error?.code ?? error?.context?.json?.code ?? "").toUpperCase();
  const msg = [
    error?.message,
    error?.context?.json?.message,
    error?.context?.json?.msg,
    error?.context?.json?.error,
    error?.context?.json?.friendly_message,
  ]
    .filter(Boolean)
    .map((item) => String(item))
    .join(" | ")
    .toLowerCase();

  return msg.includes("invalid jwt") || msg.includes("jwt") || status === 401 || code === "UNAUTHORIZED" || code === "ADMIN_AUTH_REQUIRED";
}

export async function postAdminRuntimeOps<T>(body: unknown) {
  let token = await getFreshAdminAuthToken();

  try {
    return await postFunction<T>("/server-app-runtime-ops", body, { authToken: token });
  } catch (error) {
    if (!isInvalidJwtError(error)) throw error;
    token = await getFreshAdminAuthToken({ forceRefresh: true });
    return await postFunction<T>("/server-app-runtime-ops", body, { authToken: token });
  }
}
