const DEFAULT_APP_WORKSPACE_ORIGIN = "https://app.mityangho.id.vn";
const DEFAULT_ADMIN_ORIGIN = "https://admin.mityangho.id.vn";

export type WorkspaceScope = "admin" | "app" | "auto";

function normalizeOrigin(value?: string | null, fallback = DEFAULT_APP_WORKSPACE_ORIGIN) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/, "");
}

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined) ?? "";
    if (String(value).trim()) return String(value).trim();
  }
  return "";
}

export function getPublicSiteOrigin() {
  return normalizeOrigin(
    envValue("VITE_PUBLIC_BASE_URL", "VITE_PUBLIC_SITE_ORIGIN"),
    "https://mityangho.id.vn",
  );
}

export function getAdminOrigin() {
  return normalizeOrigin(
    envValue("VITE_ADMIN_ORIGIN"),
    DEFAULT_ADMIN_ORIGIN,
  );
}

export function getAppWorkspaceOrigin() {
  return normalizeOrigin(
    envValue("VITE_APP_BASE_URL", "VITE_APP_WORKSPACE_ORIGIN"),
    DEFAULT_APP_WORKSPACE_ORIGIN,
  );
}

export function isAdminHostName(hostname?: string | null) {
  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""),
  ).toLowerCase();
  const adminHosts = (import.meta.env.VITE_ADMIN_HOSTS ?? "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  return host.startsWith("admin.") || adminHosts.includes(host);
}

export function isAppHostName(hostname?: string | null) {
  const host = String(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""),
  ).toLowerCase();
  const appHosts = (import.meta.env.VITE_APP_HOSTS ?? "")
    .split(",")
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  return host.startsWith("app.") || appHosts.includes(host);
}

export function detectWorkspaceScope(pathname?: string | null): Exclude<WorkspaceScope, "auto"> {
  const path = String(
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""),
  );
  return path.startsWith("/admin/apps") ? "admin" : "app";
}

export function getWorkspaceListPath(scope: WorkspaceScope = "auto", pathname?: string) {
  const resolvedScope = scope === "auto" ? detectWorkspaceScope(pathname) : scope;
  return resolvedScope === "admin" ? "/admin/apps" : "/apps";
}

export function buildWorkspacePath(
  appCode: string,
  section: "config" | "runtime" | "keys" | "charge" | "audit" | "trash" = "runtime",
  scope: WorkspaceScope = "auto",
  extraPath = "",
  search = "",
  pathname?: string,
) {
  const base = getWorkspaceListPath(scope, pathname);
  const safeApp = encodeURIComponent(String(appCode || "").trim());
  const safeSection = section === "config" ? "config" : section === "keys" ? "keys" : section === "charge" ? "charge" : section === "audit" ? "audit" : section === "trash" ? "trash" : "runtime";
  const suffix = extraPath ? `/${String(extraPath).replace(/^\/+/, "")}` : "";
  const safeSearch = search || "";
  return `${base}/${safeApp}/${safeSection}${suffix}${safeSearch}`;
}

export function getAdminAppsUrl() {
  return `${getAdminOrigin()}/admin/apps`;
}

export function buildAppWorkspaceUrl(
  appCode: string,
  section: "config" | "runtime" | "keys" | "charge" | "audit" | "trash" = "runtime",
  extraPath = "",
  search = "",
) {
  const origin = getAppWorkspaceOrigin();
  const safeApp = encodeURIComponent(String(appCode || "").trim());
  const safeSection = section === "config" ? "config" : section === "keys" ? "keys" : section === "charge" ? "charge" : section === "audit" ? "audit" : section === "trash" ? "trash" : "runtime";
  const suffix = extraPath ? `/${String(extraPath).replace(/^\/+/, "")}` : "";
  const safeSearch = search || "";
  return `${origin}/apps/${safeApp}/${safeSection}${suffix}${safeSearch}`;
}

export function getAdminLoginUrl(next?: string) {
  const origin = getAdminOrigin();
  const safeNext = String(next ?? "").trim();
  return safeNext ? `${origin}/login?next=${encodeURIComponent(safeNext)}` : `${origin}/login`;
}
