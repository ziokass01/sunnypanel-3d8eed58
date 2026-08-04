import { supabase } from "@/integrations/supabase/client";
import { postFunction } from "@/lib/functions";

type SessionLike = {
  access_token?: string | null;
  expires_at?: number | null;
  refresh_token?: string | null;
};

function buildAdminAuthError(message = "ADMIN_AUTH_REQUIRED", code = "ADMIN_AUTH_REQUIRED") {
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
}

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    const json = atob(payload);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getCurrentProjectRef() {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  if (!url) return "";
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function isTokenExpiring(session: SessionLike | null | undefined, skewSeconds = 90) {
  const expiresAt = Number(session?.expires_at ?? 0);
  if (!session?.access_token || !expiresAt) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return expiresAt <= nowSec + skewSeconds;
}

function looksLikeCurrentProjectToken(session: SessionLike | null | undefined) {
  const token = String(session?.access_token ?? "").trim();
  if (!token) return false;

  const payload = decodeJwtPayload(token);
  if (!payload) return false;

  const exp = Number(payload.exp ?? 0);
  if (!exp || exp <= Math.floor(Date.now() / 1000)) return false;

  const projectRef = getCurrentProjectRef();
  const issuer = String(payload.iss ?? "");
  if (projectRef && issuer && !issuer.includes(projectRef)) return false;

  return true;
}

function isJwtStyleError(error: any) {
  const status = Number(error?.status ?? error?.context?.status ?? 0);
  const code = String(error?.code ?? error?.context?.json?.code ?? "").toUpperCase();
  const message = [
    error?.message,
    error?.context?.json?.friendly_message,
    error?.context?.json?.message,
    error?.context?.json?.msg,
    error?.context?.json?.error,
  ]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase())
    .join(" | ");

  return (
    status === 401 ||
    code === "UNAUTHORIZED" ||
    code === "ADMIN_AUTH_REQUIRED" ||
    message.includes("invalid jwt") ||
    message.includes("jwt expired") ||
    message.includes("jwt malformed") ||
    message.includes("auth session missing")
  );
}

async function verifyTokenWithAuth(accessToken: string) {
  const { data, error } = await supabase.auth.getUser(accessToken);
  return !error && Boolean(data.user);
}

async function refreshSessionOrNull() {
  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session ?? (await supabase.auth.getSession()).data.session ?? null;
}

export async function getFreshAdminAuthToken(forceRefresh = false) {
  let session = (await supabase.auth.getSession()).data.session ?? null;

  if (!session?.access_token && !session?.refresh_token) {
    throw buildAdminAuthError();
  }

  const shouldRefresh = forceRefresh || isTokenExpiring(session) || !looksLikeCurrentProjectToken(session);
  if (shouldRefresh) {
    session = await refreshSessionOrNull();
  }

  const token = String(session?.access_token ?? "").trim();
  if (!token) {
    throw buildAdminAuthError(
      "Phiên admin trên host này không còn hợp lệ. Hãy đăng xuất rồi đăng nhập lại.",
      "ADMIN_RELOGIN_REQUIRED",
    );
  }

  const verified = await verifyTokenWithAuth(token);
  if (!verified) {
    session = await refreshSessionOrNull();
    const refreshedToken = String(session?.access_token ?? "").trim();
    if (!refreshedToken) {
      throw buildAdminAuthError(
        "Phiên admin trên host này không còn hợp lệ. Hãy đăng xuất rồi đăng nhập lại.",
        "ADMIN_RELOGIN_REQUIRED",
      );
    }
    const refreshedVerified = await verifyTokenWithAuth(refreshedToken);
    if (!refreshedVerified) {
      throw buildAdminAuthError(
        "JWT trên host hiện tại đã lệch project hoặc hết hạn. Hãy đăng xuất rồi đăng nhập lại trên đúng host này.",
        "ADMIN_RELOGIN_REQUIRED",
      );
    }
    return refreshedToken;
  }

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
    if (!isJwtStyleError(error)) throw error;
    return await run(true);
  }
}
